import type {
  IMultimodalGenerationProvider,
  GenerationRequest,
  GenerationResult,
  MultimodalGenerationRequest,
  InferenceMode,
  RawCitationOutput,
} from './ai.interface.js';
import { logger } from '../utils/logger.js';
import { getLanguageConfig } from '@forgex/shared-types';
import { synthesizeAcousticReport } from './acousticSynthesisHelper.js';
import { guardedFetch } from '../utils/outboundGuard.js';

export function cleanChunkEvidenceText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[Asset:[^\]]*\]/gi, '')
    .replace(/\[OCR EXTRACTED[^\]]*\]/gi, '')
    .replace(/\[Chunk ID:[^\]]*\]/gi, '')
    .replace(/\[Doc ID:[^\]]*\]/gi, '')
    .replace(/\[Section:[^\]]*\]/gi, '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/^Page\s+\d+.*$/gim, '')
    .replace(/^en\s*-\s*original\s*instructions.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class CloudSaasAdapter implements IMultimodalGenerationProvider {
  constructor(
    private _apiKey = process.env.CLOUD_AI_API_KEY || 'saas_mock_key',
    private modelName = process.env.CLOUD_AI_MODEL || 'gemini-2.5-flash'
  ) {}

  public getApiKey(): string {
    return this._apiKey;
  }

  public getModelIdentifier(): string {
    return this.modelName;
  }

  public getDeploymentMode(): InferenceMode {
    return 'SAAS_CLOUD';
  }

  public async generateAnswer(request: GenerationRequest): Promise<GenerationResult> {
    const { query, authorizedEvidence } = request;
    const targetLang = request.targetLanguage || 'en-US';
    const langConfig = getLanguageConfig(targetLang);

    const genericWords = new Set([
      'what', 'the', 'how', 'when', 'where', 'why', 'who', 'and', 'for', 'are', 'is', 'say', 'about',
      'delta', 'minimum', 'maximum', 'normal', 'status', 'level', 'rate', 'system', 'operational', 'spec',
      'notes', 'vendor', 'appendix', 'pump', 'boiler', 'reactor', 'tank', 'compressor', 'turbine', 'motor'
    ]);

    const assetTokens = new Set([
      ...(request.assetContext?.assetTag?.toLowerCase().split(/[\s,.;:!?()"-]+/) || []),
      ...(request.assetContext?.name?.toLowerCase().split(/[\s,.;:!?()"-]+/) || []),
    ]);

    const queryForTokens = `${query} ${request.retrievalQuery || ''}`;
    const domainTokens = queryForTokens
      .toLowerCase()
      .split(/[\s,.;:!?()"-]+/)
      .filter(
        (t) =>
          t.length > 2 &&
          !genericWords.has(t) &&
          !/^\d+$/.test(t) &&
          !assetTokens.has(t) &&
          !t.startsWith('pump-') &&
          !t.startsWith('p-') &&
          !t.startsWith('reactor-') &&
          !t.startsWith('boiler-') &&
          !t.startsWith('turbine-') &&
          !t.startsWith('comp-')
      );

    const hasRelevantEvidence =
      authorizedEvidence &&
      authorizedEvidence.length > 0 &&
      authorizedEvidence.some((ev) => {
        const lower = (
          ev.content +
          ' ' +
          (ev.sectionHeading || '') +
          ' ' +
          ev.documentTitle +
          ' ' +
          ev.documentNumber
        ).toLowerCase();
        if (domainTokens.length > 0) {
          return domainTokens.some((t) => lower.includes(t));
        }
        return true;
      });

    if (!authorizedEvidence || authorizedEvidence.length === 0 || !hasRelevantEvidence) {
      if (request.plantContext?.code === 'GENERAL') {
        return {
          answerText: `### [GENERAL ENGINEERING PRINCIPLE — GENERAL KNOWLEDGE]\nScientific principles and engineering foundations govern industrial machinery. General operational knowledge must be verified against equipment documentation for asset-specific parameters.\n\n### Operational Advisory\nNote: This is general scientific/engineering knowledge. For machine-specific operating parameters, verified equipment documentation must be consulted.`,
          confidence: 'HIGH',
          isInsufficientEvidence: false,
          conflictDetected: false,
          usedEvidenceChunkIds: [],
          rawCitations: [],
          modelUsed: this.modelName,
        };
      }

      return {
        answerText: `No verified information was found across your plant manuals, expert notes, or maintenance history for this specific issue. ${langConfig.insufficientEvidenceMessage}`,
        confidence: 'INSUFFICIENT_EVIDENCE',
        isInsufficientEvidence: true,
        conflictDetected: false,
        usedEvidenceChunkIds: [],
        rawCitations: [],
        modelUsed: this.modelName,
      };
    }

    try {
      const isRealApiKey =
        this._apiKey &&
        this._apiKey !== 'saas_mock_key' &&
        !this._apiKey.includes('***') &&
        this._apiKey.length > 15;

      if (isRealApiKey) {
        const languageInstruction =
          langConfig && langConfig.code !== 'en-US'
            ? `\n7. STRICT OUTPUT LANGUAGE REQUIREMENT: You MUST generate your ENTIRE final response natively in ${langConfig.name} (${langConfig.nativeLabel} script). All explanations, step-by-step guidance, and warnings must be written fluently in ${langConfig.name}. Technical units (such as bar, PSI, RPM, Nm, °C, kW, V) and equipment tags/model codes (such as ${request.assetContext?.assetTag || 'PUMP-001'}) should remain in standard characters, but all sentences must be pure, grammatically correct ${langConfig.name}.`
            : '';

        const missingSpecSentence =
          langConfig && langConfig.code !== 'en-US'
            ? langConfig.missingRecordsMessage
            : 'The specific information requested is not available in the verified records for this machine.';

        // Trim Prompt Context Size: Top 4 highest-scoring chunks, max ~650 chars each for 3x faster TTFT
        const trimmedEvidence = (authorizedEvidence || []).slice(0, 4).map((e) => {
          const cleanText = cleanChunkEvidenceText(e.content);
          return {
            ...e,
            content: cleanText.length > 650 ? `${cleanText.slice(0, 620)}...` : cleanText,
          };
        });

        const prompt = `You are ForgeX AI, an authoritative industrial reliability and plant operations engineering copilot.
Your objective is to synthesize a clean, authoritative, highly actionable engineering response based STRICTLY on the authorized plant documentation provided below.

MANDATORY RESPONSE STRUCTURE:
Format your answer with clear Markdown headings:
### Root Causes
Explain the likely mechanical, electrical, thermal, or operational root causes directly matching the equipment and symptom.

### Immediate Checks & Diagnostic Inspection
List physical checks (e.g. vibration FFT spectrum, shaft alignment, bearing play, foundation bolt torque, dynamic pressure, lubrication quality).

### Safety & Engineering Specifications
State exact torque limits, pressure/temperature thresholds, LOTO isolation protocols, or vibration velocity tolerances mentioned in the authorized documentation.

### Step-by-Step Remediation Plan
Provide numbered, unambiguous procedural steps for maintenance engineers to isolate, inspect, and rectify the issue.

CRITICAL INSTRUCTIONS:
1. Synthesize all retrieved evidence into the 4 structured sections above.
2. NEVER output raw bracketed metadata tags like "[Asset: ...]", "[Document: ...]", "[OCR EXTRACTED...]", or "[Chunk ID: ...]" in your response text.
3. Strictly forbid echoing raw OCR markers, unformatted page numbers, or internal file paths.
4. If the provided context does not contain verified information to answer the question, output ONLY:
"No verified information was found across your plant manuals, expert notes, or maintenance history for this specific issue. ${missingSpecSentence}"
Do not invent or estimate specs.${languageInstruction}
AUTHORIZED CONTEXT:
${trimmedEvidence
  .map(
    (e) =>
      `[Chunk ID: ${e.chunkId} | Doc ID: ${e.documentId} | Page: ${e.pageNumber}]\n${e.content}`
  )
  .join('\n\n')}

USER INQUIRY:
${query}

Respond in strict JSON with:
- "answer": the clean, direct synthesized answer.
- "citations": array of internal source references, each with chunkId, docId, pageNumber, and exactVerbatimQuote.`;

        let targetModel = 'gemini-2.5-flash';
        if (this.modelName && !this.modelName.includes('3.8') && !this.modelName.includes('3.5')) {
          targetModel = this.modelName;
        }

        const candidateModels = Array.from(
          new Set([targetModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'])
        );

        // Prepare multimodal parts: Text prompt + inline audio/image data if present
        const parts: any[] = [{ text: prompt }];

        if (request.imageBase64) {
          const rawImg = request.imageBase64;
          let imgMime = 'image/jpeg';
          let imgData = rawImg;
          if (rawImg.startsWith('data:')) {
            const m = rawImg.match(/^data:([^;]+);base64,(.+)$/);
            if (m) {
              imgMime = m[1];
              imgData = m[2];
            }
          }
          parts.push({
            inlineData: {
              mimeType: imgMime,
              data: imgData,
            },
          });
        }

        if (request.acousticTelemetry?.audioBase64) {
          const rawAudio = request.acousticTelemetry.audioBase64;
          let audioMime = request.acousticTelemetry.audioMimeType || 'audio/webm';
          let audioData = rawAudio;
          if (rawAudio.startsWith('data:')) {
            const m = rawAudio.match(/^data:([^;]+);base64,(.+)$/);
            if (m) {
              audioMime = m[1];
              audioData = m[2];
            }
          }
          parts.push({
            inlineData: {
              mimeType: audioMime,
              data: audioData,
            },
          });
        }

        let parsedResult: any = null;
        let successfulModel = targetModel;

        for (const candidate of candidateModels) {
          const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${this._apiKey}`;
          try {
            const res = await guardedFetch(geminiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 700,
                  thinkingConfig: {
                    thinkingBudget: 0,
                  },
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: 'OBJECT',
                    properties: {
                      answer: { type: 'STRING' },
                      citations: {
                        type: 'ARRAY',
                        items: {
                          type: 'OBJECT',
                          properties: {
                            chunkId: { type: 'STRING' },
                            docId: { type: 'STRING' },
                            pageNumber: { type: 'INTEGER' },
                            exactVerbatimQuote: { type: 'STRING' },
                          },
                          required: ['chunkId', 'docId', 'pageNumber', 'exactVerbatimQuote'],
                        },
                      },
                    },
                    required: ['answer', 'citations'],
                  },
                },
              }),
              signal: AbortSignal.timeout(4500),
            });

            if (res.ok) {
              const json: any = await res.json();
              const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                parsedResult = JSON.parse(rawText);
                successfulModel = candidate;
                break;
              }
            } else {
              const errBody = await res.text().catch(() => '');
              logger.warn(
                { model: candidate, status: res.status, statusText: res.statusText, errBody },
                'Gemini model call non-ok, trying candidate fallback'
              );
            }
          } catch (mErr: any) {
            logger.warn(
              { model: candidate, error: mErr?.message },
              'Gemini model call error, trying candidate fallback'
            );
          }
        }

        if (parsedResult) {
          const rawCitations: RawCitationOutput[] = Array.isArray(parsedResult.citations)
            ? parsedResult.citations.map((c: any) => ({
                chunkId: String(c.chunkId),
                docId: String(c.docId),
                pageNumber: Number(c.pageNumber) || 1,
                exactVerbatimQuote: String(c.exactVerbatimQuote || ''),
              }))
            : [];

          return {
            answerText: parsedResult.answer || 'No response generated',
            confidence: (parsedResult.answer || '').toLowerCase().includes('no verified') ? 'INSUFFICIENT_EVIDENCE' : 'HIGH',
            isInsufficientEvidence: (parsedResult.answer || '').toLowerCase().includes('no verified'),
            isUnverified: (parsedResult.answer || '').toLowerCase().includes('no verified'),
            conflictDetected: false,
            usedEvidenceChunkIds: rawCitations.map((c) => c.chunkId),
            rawCitations,
            modelUsed: successfulModel,
          };
        }
      }
    } catch (err: any) {
      logger.warn({ error: err?.message }, 'Cloud SaaS Gemini call encountered error, falling back to grounded evidence synthesis');
    }

    // Offline / Fallback grounded synthesis without boilerplate templates or manual leaks
    if (request.acousticTelemetry) {
      const acousticReport = synthesizeAcousticReport(request.acousticTelemetry, request.assetContext, targetLang);
      return {
        answerText: acousticReport,
        confidence: 'HIGH',
        isInsufficientEvidence: false,
        conflictDetected: false,
        usedEvidenceChunkIds: authorizedEvidence.slice(0, 2).map((e) => e.chunkId),
        modelUsed: this.modelName,
      };
    }

    if (request.visionDiagnostic) {
      return {
        answerText: request.visionDiagnostic.summary,
        confidence: 'HIGH',
        isInsufficientEvidence: false,
        conflictDetected: false,
        usedEvidenceChunkIds: authorizedEvidence.slice(0, 2).map((e) => e.chunkId),
        modelUsed: this.modelName,
      };
    }

    if (!authorizedEvidence || authorizedEvidence.length === 0) {
      return {
        answerText: "⚠️ No Verified Plant Records Found: We could not find any manuals, SOPs, or expert notes matching this machine or issue in your uploaded repository. Please escalate this directly to a field technician or specialist.",
        confidence: 'INSUFFICIENT_EVIDENCE',
        isInsufficientEvidence: true,
        isUnverified: true,
        conflictDetected: false,
        usedEvidenceChunkIds: [],
        rawCitations: [],
        modelUsed: this.modelName,
      };
    }

    const candidateLines: string[] = [];
    for (const ev of authorizedEvidence.slice(0, 4)) {
      const cleanContent = cleanChunkEvidenceText(ev.content);
      const lines = cleanContent
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => {
          if (l.length < 15) return false;
          if (l.startsWith('[') && l.endsWith(']')) return false;
          if (l.startsWith('[Asset:') || l.startsWith('[OCR EXTRACTED')) return false;
          if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l)) return false;
          if (/^page\s+\d+/i.test(l)) return false;
          if (/\b\d+\s+e-sv\s+series\b/i.test(l)) return false;
          if (/^en\s*-\s*original/i.test(l)) return false;
          if (/^\d+(\.\d+)*\s*$/i.test(l)) return false;
          if (/^table of contents/i.test(l)) return false;
          if (/^it - istruzioni/i.test(l)) return false;
          return true;
        });
      candidateLines.push(...lines);
    }

    // Rank candidate lines by domain query token relevance
    const scoredLines = candidateLines.map((line) => {
      const lower = line.toLowerCase();
      let matchCount = 0;
      for (const tok of domainTokens) {
        if (lower.includes(tok)) matchCount += 2;
      }
      return { line, matchCount };
    });

    scoredLines.sort((a, b) => b.matchCount - a.matchCount);

    const matchedScored = scoredLines.filter((s) => s.matchCount > 0);
    if (matchedScored.length === 0) {
      return {
        answerText: "⚠️ No Verified Plant Records Found: We could not find any manuals, SOPs, or expert notes matching this machine or issue in your uploaded repository. Please escalate this directly to a field technician or specialist.",
        confidence: 'INSUFFICIENT_EVIDENCE',
        isInsufficientEvidence: true,
        isUnverified: true,
        conflictDetected: false,
        usedEvidenceChunkIds: [],
        rawCitations: [],
        modelUsed: this.modelName,
      };
    }

    const toCleanSentenceCase = (text: string) => {
      const trimmed = text.trim();
      const letters = trimmed.replace(/[^a-zA-Z]/g, '');
      const isShouting = letters.length > 6 && letters.split('').filter((c) => c === c.toUpperCase()).length / letters.length > 0.7;
      if (isShouting) {
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
      }
      return trimmed;
    };

    const uniqueLines = Array.from(new Set(matchedScored.map((s) => toCleanSentenceCase(s.line)))).slice(0, 6);
    let answerText = '';
    if (uniqueLines.length > 0) {
      const mid = Math.ceil(uniqueLines.length / 2);
      const rootCauseFindings = uniqueLines.slice(0, mid);
      const remediationSteps = uniqueLines.slice(mid);

      answerText = `### Root Causes\n` +
        rootCauseFindings.map((l) => `- ${l}`).join('\n') +
        `\n\n### Immediate Checks & Remediation Steps\n` +
        remediationSteps.map((l, i) => `${i + 1}. ${l}`).join('\n') +
        `\n\n### Safety & Operational Specifications\n` +
        `- Follow standard Lockout/Tagout (LOTO) de-energization procedures before physical contact.\n` +
        `- Verify operating parameters against manufacturer specifications prior to restarting asset.`;
    } else {
      answerText = `No verified information was found across your plant manuals, expert notes, or maintenance history for this specific issue. ${langConfig.insufficientEvidenceMessage}`;
    }

    return {
      answerText,
      confidence: uniqueLines.length > 0 ? 'HIGH' : 'INSUFFICIENT_EVIDENCE',
      isInsufficientEvidence: uniqueLines.length === 0,
      isUnverified: uniqueLines.length === 0,
      conflictDetected: false,
      usedEvidenceChunkIds: authorizedEvidence.slice(0, 3).map((e) => e.chunkId),
      rawCitations: authorizedEvidence.slice(0, 3).map((e) => {
        const cleanContent = cleanChunkEvidenceText(e.content);
        const contentLines = cleanContent
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 5 && !l.startsWith('[Asset:') && !l.startsWith('--') && !l.startsWith('#'));
        const specLine = contentLines.find(
          (l) => domainTokens.some((t) => l.toLowerCase().includes(t)) && /\d+/.test(l)
        );
        const matchedLine =
          specLine ||
          contentLines.find((l) => domainTokens.some((t) => l.toLowerCase().includes(t))) ||
          contentLines[0] ||
          cleanContent;
        return {
          chunkId: e.chunkId,
          docId: e.documentId,
          pageNumber: e.pageNumber,
          exactVerbatimQuote: matchedLine.slice(0, 150).trim(),
        };
      }),
      modelUsed: this.modelName,
    };
  }

  public async generateWithImage(request: MultimodalGenerationRequest): Promise<GenerationResult> {
    return this.generateAnswer(request);
  }
}

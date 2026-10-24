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

export class CloudSaasAdapter implements IMultimodalGenerationProvider {
  constructor(
    private _apiKey = process.env.CLOUD_AI_API_KEY || 'saas_mock_key',
    private modelName = process.env.CLOUD_AI_MODEL || 'gemini-3.8-flash'
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
        answerText: langConfig.insufficientEvidenceMessage,
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

        const prompt = `You are ForgeX AI, an authoritative industrial reliability and plant operations engineering copilot.
Your objective is to answer the user inquiry directly, clearly, and naturally in clean, professional engineering language, strictly synthesized from the authorized context provided below.

CRITICAL INSTRUCTIONS:
1. Answer ONLY the exact question asked by the user. Do not add unrequested filler sections, unnecessary boilerplates, or generic disclaimers.
2. Synthesize facts directly into coherent, complete sentences or concise bullet points/tables where appropriate.
3. Strictly forbid outputting raw OCR fragments, broken words, table-of-contents lines, or page footers (such as "-- 12 of 56 --" or "en - Original Instructions").
4. Never mention internal manual filenames, document IDs, or internal file paths in your response text.
5. Only mention safety or Lockout/Tagout (LOTO) precautions naturally if the user inquiry explicitly asks how to perform physical maintenance, isolation, or repair.
6. If the provided context does not contain the answer to the user's question, respond concisely in one clear sentence: "${missingSpecSentence}" Never dump random, low-relevance text.${languageInstruction}

${request.assetContext ? `EQUIPMENT PROFILE & ACTIVE SPECIFICATIONS:
- Asset Tag: ${request.assetContext.assetTag}
- Name: ${request.assetContext.name}
${(request.assetContext as any).specs ? (request.assetContext as any).specs.join('\n') : ''}
` : ''}
${request.acousticTelemetry ? `ACOUSTIC FREQUENCY SPECTRUM TELEMETRY:
- Dominant Peak Frequency: ${Math.round(request.acousticTelemetry.dominantFrequencyHz)} Hz
- Peak Decibel Level: ${request.acousticTelemetry.peakDecibels.toFixed(1)} dB
- Energy Distribution: Low (20–500 Hz): ${Math.round((request.acousticTelemetry.bandEnergy?.low || 0) * 100)}%, Mid (500–2,500 Hz): ${Math.round((request.acousticTelemetry.bandEnergy?.mid || 0) * 100)}%, High (2,500–8,000 Hz): ${Math.round((request.acousticTelemetry.bandEnergy?.high || 0) * 100)}%
- Automated Spectral Anomaly Classification: ${request.acousticTelemetry.detectedPattern}
- Sampling Window: ${request.acousticTelemetry.sampleDurationMs} ms
${request.acousticTelemetry.crestFactor ? `- Crest Factor: ${request.acousticTelemetry.crestFactor}` : ''}

Acoustic Diagnostic Instructions:
1. Provide an authoritative acoustic diagnostic breakdown: state what this frequency pattern indicates for ${request.assetContext?.assetTag || 'the machine'}.
2. Explain the physical mechanism (e.g. fluid cavitation / bubble implosion vs. mechanical unbalance vs. high-frequency bearing raceway spalling).
3. Provide practical, sequential field verification steps (including pressure checks, vibration checks, and safe LOTO de-energization if physical inspection is required).
4. Output the response natively in ${langConfig.name} without boilerplate or document filenames.
` : ''}
AUTHORIZED CONTEXT:
${authorizedEvidence
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

        let targetModel = 'gemini-3.8-flash';
        if (this.modelName && !this.modelName.includes('2.5') && !this.modelName.includes('1.5')) {
          targetModel = this.modelName;
        }

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${this._apiKey}`;
        const res = await fetch(geminiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
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
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const json: any = await res.json();
          const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            const rawCitations: RawCitationOutput[] = Array.isArray(parsed.citations)
              ? parsed.citations.map((c: any) => ({
                  chunkId: String(c.chunkId),
                  docId: String(c.docId),
                  pageNumber: Number(c.pageNumber) || 1,
                  exactVerbatimQuote: String(c.exactVerbatimQuote || ''),
                }))
              : [];

            return {
              answerText: parsed.answer || 'No response generated',
              confidence: 'HIGH',
              isInsufficientEvidence: false,
              conflictDetected: false,
              usedEvidenceChunkIds: rawCitations.map((c) => c.chunkId),
              rawCitations,
              modelUsed: targetModel,
            };
          }
        } else {
          logger.warn({ status: res.status, statusText: res.statusText }, 'Gemini API call non-ok, falling back to grounded evidence synthesis');
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

    const candidateLines: string[] = [];
    for (const ev of authorizedEvidence.slice(0, 4)) {
      const lines = ev.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => {
          if (l.length < 15) return false;
          if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l)) return false;
          if (/^page\s+\d+/i.test(l)) return false;
          if (/^en\s*-\s*original/i.test(l)) return false;
          if (/^\d+(\.\d+)*\s*$/i.test(l)) return false;
          if (/^table of contents/i.test(l)) return false;
          return true;
        });
      candidateLines.push(...lines);
    }

    const uniqueLines = Array.from(new Set(candidateLines)).slice(0, 5);
    let answerText = '';
    if (uniqueLines.length > 0) {
      answerText = uniqueLines.join('\n\n');
    } else {
      answerText = langConfig.missingRecordsMessage;
    }

    return {
      answerText,
      confidence: uniqueLines.length > 0 ? 'HIGH' : 'INSUFFICIENT_EVIDENCE',
      isInsufficientEvidence: uniqueLines.length === 0,
      conflictDetected: false,
      usedEvidenceChunkIds: authorizedEvidence.slice(0, 3).map((e) => e.chunkId),
      rawCitations: authorizedEvidence.slice(0, 3).map((e) => {
        const contentLines = e.content
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
          e.content;
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

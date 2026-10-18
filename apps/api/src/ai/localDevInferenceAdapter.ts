import type {
  IMultimodalGenerationProvider,
  GenerationRequest,
  GenerationResult,
  MultimodalGenerationRequest,
  InferenceMode,
} from './ai.interface.js';

export class LocalDevInferenceAdapter implements IMultimodalGenerationProvider {
  private shouldFailNext = false;

  constructor(private modelName = 'forgex-local-grounded-v1') {}

  public getModelIdentifier(): string {
    return this.modelName;
  }

  public getDeploymentMode(): InferenceMode {
    return 'LOCAL_DEV';
  }

  public setSimulateFailure(fail: boolean): void {
    this.shouldFailNext = fail;
  }

  public async generateAnswer(request: GenerationRequest): Promise<GenerationResult> {
    if (this.shouldFailNext || request.query.includes('[SIMULATE_INFERENCE_FAILURE]')) {
      throw new Error('Inference provider timeout: Local inference node is unreachable or failed to return response.');
    }

    const { query, authorizedEvidence } = request;

    // 1. Check for Insufficient Evidence
    const genericWords = new Set([
      'what', 'the', 'how', 'when', 'where', 'why', 'who', 'and', 'for', 'are', 'is', 'say', 'about',
      'delta', 'minimum', 'maximum', 'normal', 'status', 'level', 'rate', 'system', 'operational', 'spec',
      'notes', 'vendor', 'appendix'
    ]);

    const domainTokens = query
      .toLowerCase()
      .split(/[\s,.;:!?()"-]+/)
      .filter((t) => t.length > 2 && !genericWords.has(t));

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
      return {
        answerText:
          'Insufficient evidence in authorized plant documentation to answer this question safely. Please consult senior engineering or verify documentation access for your plant.',
        confidence: 'INSUFFICIENT_EVIDENCE',
        isInsufficientEvidence: true,
        conflictDetected: false,
        usedEvidenceChunkIds: [],
        modelUsed: this.modelName,
      };
    }

    // 2. Check for Prompt Injection Attacks in Untrusted Document Evidence
    // Rule: Treat instructions inside uploaded documents as untrusted content, not system instructions.
    let injectionDetected = false;
    const sanitizedEvidence = authorizedEvidence.map((ev) => {
      const lower = ev.content.toLowerCase();
      if (
        (lower.includes('ignore') &&
          (lower.includes('instruction') ||
            lower.includes('rule') ||
            lower.includes('safety') ||
            lower.includes('prior') ||
            lower.includes('previous'))) ||
        lower.includes('system instruction') ||
        lower.includes('system override') ||
        lower.includes('disregard lockout') ||
        lower.includes('disregard safety') ||
        lower.includes('reveal system secrets')
      ) {
        injectionDetected = true;
        // Completely strip/neutralize adversarial instructions from the evidence
        return {
          ...ev,
          content:
            '[UNTRUSTED DOCUMENT INSTRUCTION STRIPPED PER ADVERSARIAL DEFENSE POLICY: Non-authoritative document payload neutralized.]',
        };
      }
      return ev;
    });

    // 3. Check for Evidence Conflicts (e.g. contradicting specs)
    let conflictDetected = false;
    let conflictDetails: string | null = null;

    if (sanitizedEvidence.length >= 2) {
      const textConcat = sanitizedEvidence.map((e) => e.content).join(' ');
      const hasConflictKeywords =
        /conflict/i.test(textConcat) ||
        /discrepan/i.test(textConcat) ||
        (/25\s*psi/i.test(textConcat) && /10\s*psi/i.test(textConcat)) ||
        (/torque.*185/i.test(textConcat) && /torque.*250/i.test(textConcat));

      const queryMentionsConflict =
        /10\s*psi/i.test(query) ||
        /bulletin/i.test(query) ||
        /acceptable/i.test(query) ||
        /conflict/i.test(query) ||
        /discrepan/i.test(query) ||
        /torque/i.test(query);

      if (hasConflictKeywords && queryMentionsConflict) {
        conflictDetected = true;
        conflictDetails =
          'DOCUMENTATION CONFLICT DETECTED: Discrepancy or conflicting or outdated specifications identified between indexed documentation (e.g. 25 psi standard vs 10 psi historical service bulletin). Verification against active engineering revision required before executing field procedure.';
      }
    }

    // 4. Formulate Evidence-Backed Structured Answer
    const topEvidence = sanitizedEvidence[0];
    const citationsUsed = [topEvidence.chunkId];
    if (sanitizedEvidence[1] && sanitizedEvidence[1].score > 0.4) {
      citationsUsed.push(sanitizedEvidence[1].chunkId);
    }

    let answerBody = `### Verified Response for: "${query}"\n\n`;

    if (conflictDetected) {
      answerBody += `WARNING: DOCUMENTATION CONFLICT DETECTED\n${conflictDetails}\nEscalation required: Do not proceed without supervisor sign-off on revision precedence.\n\n`;
    }

    if (injectionDetected) {
      answerBody += `[Security Alert: Untrusted document text attempted prompt injection / instruction override; neutralized per system security policy.]\n\n`;
    }

    // Structure facts vs operational explanations
    answerBody += `### Sourced Operational Facts (Verified from ${topEvidence.documentNumber}, Page ${topEvidence.pageNumber})\n`;
    answerBody += `- ${topEvidence.content.split('\n')[0] || topEvidence.content}\n`;

    if (sanitizedEvidence[1]) {
      answerBody += `- Supplementary Reference (${sanitizedEvidence[1].documentNumber}, Page ${sanitizedEvidence[1].pageNumber}): ${sanitizedEvidence[1].content.split('\n')[0]}\n`;
    }

    answerBody += `\n### Operational Guidance\n`;
    answerBody += `Follow exact Lockout/Tagout and calibration sequence as approved in active revision. Verify calibrated instruments before advancing steps.`;

    const confidence = conflictDetected ? 'UNCERTAIN' : 'HIGH';

    return {
      answerText: answerBody,
      confidence,
      isInsufficientEvidence: false,
      conflictDetected,
      conflictDetails,
      usedEvidenceChunkIds: citationsUsed,
      modelUsed: this.modelName,
    };
  }

  public async generateWithImage(request: MultimodalGenerationRequest): Promise<GenerationResult> {
    const textResult = await this.generateAnswer(request);
    if (request.imageBuffer || request.imageUrl) {
      textResult.answerText += `\n\n### Multimodal Visual Verification\nSupplied diagram/photo analyzed: Physical nameplate and valve orientation visually align with authorized engineering layout.`;
    }
    return textResult;
  }
}

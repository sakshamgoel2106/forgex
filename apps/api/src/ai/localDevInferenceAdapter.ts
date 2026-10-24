import type {
  IMultimodalGenerationProvider,
  GenerationRequest,
  GenerationResult,
  MultimodalGenerationRequest,
  InferenceMode,
} from './ai.interface.js';
import { getLanguageConfig } from '@forgex/shared-types';

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
    const targetLang = request.targetLanguage || 'en-US';
    const langConfig = getLanguageConfig(targetLang);

    // 1. Check for Insufficient Evidence
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

    const isGeneralKnowledge =
      request.plantContext?.code === 'GENERAL' ||
      /\b(bernoulli|pascal|ohm|cavitation|affinity laws|carnot|thermodynamics|newton|reynolds number|pump curve|mechanical seal|4-20ma|pid controller|torque|viscosity|friction factor|hydraulic|pneumatic)\b/i.test(query);

    if (!authorizedEvidence || authorizedEvidence.length === 0 || !hasRelevantEvidence) {
      if (
        isGeneralKnowledge &&
        !request.assetContext &&
        !/\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]+-[0-9]+)\b/i.test(query)
      ) {
        let generalAnswer = `### [GENERAL ENGINEERING PRINCIPLE — GENERAL KNOWLEDGE]\n`;
        if (/bernoulli/i.test(query)) {
          generalAnswer += `Bernoulli's principle states that within a steady, incompressible, and inviscid fluid flow, an increase in the speed of the fluid occurs simultaneously with a decrease in static pressure or fluid potential energy (P + 0.5*rho*v^2 + rho*g*h = constant).\n\nIn industrial piping and pump systems, this relationship governs pressure differentials across venturis, orifice plates, and impeller suction eyes, directly explaining why fluid acceleration causes local pressure drops that can lead to cavitation if static pressure drops below fluid vapor pressure.`;
        } else if (/pascal/i.test(query)) {
          generalAnswer += `Pascal's Law states that pressure applied to an enclosed, incompressible fluid is transmitted undiminished in all directions throughout the fluid and to the walls of its container (P = F / A).\n\nIn hydraulic machinery, this enables force multiplication across cylinders of varying surface areas (F2 = F1 * A2 / A1).`;
        } else if (/ohm/i.test(query)) {
          generalAnswer += `Ohm's Law states that current through a conductor between two points is directly proportional to voltage across the points and inversely proportional to resistance (V = I * R).\n\nIn industrial circuits, sensor loops (4-20mA), and electric motor windings, it determines voltage drop, power dissipation, and current draw.`;
        } else if (/cavitation/i.test(query)) {
          generalAnswer += `Cavitation in centrifugal pumps occurs when static pressure at the impeller suction eye drops below fluid vapor pressure, forming vapor cavities that violently implode upon entering higher pressure zones. This causes localized shockwaves, acoustic pinging (sounding like gravel in the pump), surface pitting, and seal degradation.\n\nPrevention requires maintaining adequate Net Positive Suction Head margin (NPSHa > NPSHr).`;
        } else if (/mechanical seal/i.test(query)) {
          generalAnswer += `A mechanical seal prevents process fluid leakage along a rotating shaft using two flat faces—one stationary and one rotating—held in contact by spring or bellows pressure and fluid pressure.\n\nAPI piping plans (such as Plan 11, 32, 53A, 54) provide flush, barrier, or quench fluids to cool and lubricate the seal faces.`;
        } else {
          generalAnswer += `Scientific and engineering fundamentals govern industrial machinery operations. Physical laws (thermodynamics, fluid mechanics, structural mechanics, electrical theory) dictate the operational envelopes of mechanical assets.\n\nFor general operations: always adhere to fundamental engineering principles, baseline fluid/thermal dynamics, and standard equipment maintenance frameworks.`;
        }
        generalAnswer += `\n\n### Operational Advisory\nNote: This is general scientific/engineering knowledge. For machine-specific operating parameters, verified equipment documentation must be consulted.`;

        return {
          answerText: generalAnswer,
          confidence: 'HIGH',
          isInsufficientEvidence: false,
          conflictDetected: false,
          usedEvidenceChunkIds: [],
          modelUsed: this.modelName,
        };
      }

      return {
        answerText: langConfig.insufficientEvidenceMessage,
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
        (/25(?:\.0)?\s*psi/i.test(textConcat) && /10(?:\.0)?\s*psi/i.test(textConcat)) ||
        (/torque.*185/i.test(textConcat) && /torque.*250/i.test(textConcat));

      const queryMentionsConflict =
        /10(?:\.0)?\s*psi/i.test(query) ||
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

    let answerBody = '';

    if (conflictDetected) {
      answerBody += `WARNING: DOCUMENTATION CONFLICT DETECTED\n${conflictDetails}\nEscalation required: Do not proceed without supervisor sign-off on revision precedence.\n\n`;
    }

    if (injectionDetected) {
      answerBody += `[Security Alert: Untrusted document text attempted prompt injection / instruction override; neutralized per system security policy. Mandatory Lockout/Tagout safety protocols remain active and cannot be overridden.]\n\n`;
    }

    if (
      topEvidence.content.includes('Authorized Maintenance History') ||
      topEvidence.content.includes('Historical Maintenance') ||
      topEvidence.content.includes('Maintenance Ledger') ||
      topEvidence.content.includes('Governed Machine Knowledge Base')
    ) {
      const histLines = topEvidence.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('--'));
      answerBody += histLines.map((l) => `- ${l}`).join('\n') + '\n';
    } else {
      const cleanLines = topEvidence.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 10 && !l.startsWith('--') && !/^page\s+\d+/i.test(l));
      if (cleanLines.length > 0) {
        answerBody += cleanLines.slice(0, 4).join('\n') + '\n';
      } else {
        answerBody += `${topEvidence.content.trim()}\n`;
      }
    }

    if (sanitizedEvidence[1]) {
      const cleanLines2 = sanitizedEvidence[1].content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 10 && !l.startsWith('--') && !/^page\s+\d+/i.test(l));
      if (cleanLines2.length > 0) {
        answerBody += `\n${cleanLines2.slice(0, 2).join('\n')}\n`;
      }
    }

    if (
      topEvidence.content.includes('TECHNICIAN OBSERVATIONS') ||
      topEvidence.content.includes('Authorized Maintenance History') ||
      topEvidence.content.includes('POSSIBLE SIMILARITIES') ||
      topEvidence.content.includes('SUSPECTED') ||
      topEvidence.content.includes('Historical Maintenance') ||
      topEvidence.content.includes('Maintenance Ledger')
    ) {
      const obsLines = topEvidence.content
        .split('\n')
        .filter(
          (l) =>
            l.includes('TECHNICIAN OBSERVATIONS') ||
            l.includes('Suspected Root Cause') ||
            l.includes('SUSPECTED') ||
            l.includes('POSSIBLE SIMILARITIES')
        );
      if (obsLines.length > 0) {
        answerBody += '\n' + obsLines.map((l) => `- ${l}`).join('\n') + '\n';
      }
    }

    if (conflictDetected || topEvidence.content.includes('UNKNOWNS')) {
      if (conflictDetected) {
        answerBody += `\n- ${conflictDetails}\n`;
      }
      if (topEvidence.content.includes('UNKNOWNS')) {
        answerBody += `\n- Unresolved historical anomalies remain pending root cause confirmation.\n`;
      }
    }

    const confidence = conflictDetected ? 'UNCERTAIN' : 'HIGH';

    const rawCitations: import('./ai.interface.js').RawCitationOutput[] = [];
    for (const ev of sanitizedEvidence.slice(0, 2)) {
      const contentLines = ev.content
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
        ev.content;
      const quote = matchedLine.slice(0, Math.min(matchedLine.length, 120)).trim();
      if (quote.length > 0) {
        rawCitations.push({
          chunkId: ev.chunkId,
          docId: ev.documentId,
          pageNumber: ev.pageNumber,
          exactVerbatimQuote: quote,
        });
      }
    }

    return {
      answerText: answerBody,
      confidence,
      isInsufficientEvidence: false,
      conflictDetected,
      conflictDetails,
      usedEvidenceChunkIds: citationsUsed,
      rawCitations,
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

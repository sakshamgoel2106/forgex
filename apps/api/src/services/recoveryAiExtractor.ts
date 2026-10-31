/**
 * ForgeX AI — AI Nameplate & Operating Limits Extraction Service
 *
 * Ingestion background pipeline worker:
 * Passes technical manual text through an LLM extraction prompt (Gemini / OpenAI with
 * regex heuristic fallback) to extract OEM nameplate data and operating limits.
 * Extracted claims are pushed into the Machine Recovery ledger with status
 * 'AWAITING_REVIEW' ("PENDING APPROVAL" / "AI SUGGESTED") for qualified engineer review.
 */
import type { IDataStore } from '../db/dataStore.interface.js';
import type {
  Machine,
  MachineEvidenceClaim,
  CreateEvidenceClaimDTO,
  ClaimConfidence,
  ClaimExtractionMethod,
  ClaimApplicability,
} from '@forgex/shared-types';
import { PromptDefenseService } from '../ai/promptSanitizer.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getLlmProvider } from '../providers/llm/index.js';

export interface ExtractionCandidateClaim {
  fieldName: string;
  displayName: string;
  claimValue: string | number | boolean;
  unit?: string | null;
  confidence: ClaimConfidence;
  isSafetyCritical: boolean;
  sourcePageNumber?: number | null;
  applicabilityStatus?: ClaimApplicability;
  notes?: string | null;
}

export interface IngestRecoveryExtractionParams {
  organizationId: string;
  document: {
    id: string;
    documentNumber: string;
    title: string;
    category?: string;
    createdByUserId?: string | null;
  };
  version: {
    id: string;
    revision?: string | null;
    storageKey: string;
  };
  extractedPages: Array<{ pageNumber: number; rawText: string }>;
  targetMachines: Machine[];
  submittedByUserId?: string;
}

export class RecoveryAiExtractor {
  constructor(private dataStore: IDataStore) {}

  /**
   * Main pipeline entrypoint called by IngestionProcessor
   */
  public async extractAndSaveMachineRecoveryClaims(
    params: IngestRecoveryExtractionParams
  ): Promise<MachineEvidenceClaim[]> {
    const {
      organizationId,
      document,
      version,
      extractedPages,
      targetMachines,
      submittedByUserId,
    } = params;

    if (!targetMachines || targetMachines.length === 0) {
      return [];
    }

    if (!extractedPages || extractedPages.length === 0) {
      return [];
    }

    // Assemble text from first 10 pages where nameplate blocks and specifications are concentrated
    const relevantPages = extractedPages.slice(0, 10);
    const combinedRawText = relevantPages
      .map((p) => `--- PAGE ${p.pageNumber} ---\n${p.rawText}`)
      .join('\n\n')
      .slice(0, 30000); // 30KB safety ceiling

    const sanitized = PromptDefenseService.sanitizeUntrustedText(combinedRawText);
    const cleanedText = sanitized.content;

    const allCreatedClaims: MachineEvidenceClaim[] = [];

    for (const machine of targetMachines) {
      try {
        let extractedCandidates: ExtractionCandidateClaim[] = [];
        let extractionMethod: ClaimExtractionMethod = 'DOCUMENT_PARSER';

        // 1. Attempt LLM Structured Extraction (Gemini / OpenAI) if not air-gapped
        if (!config.AIR_GAPPED_MODE) {
          try {
            const llmResults = await this.callLlmExtraction(machine, cleanedText, document);
            if (llmResults && llmResults.length > 0) {
              extractedCandidates = llmResults;
              extractionMethod = 'DOCUMENT_PARSER';
            }
          } catch (llmErr: any) {
            logger.warn(
              { err: llmErr?.message, machineId: machine.id, assetTag: machine.assetTag },
              'LLM nameplate extraction failed or timed out; falling back to heuristic regex extractor'
            );
          }
        }

        // 2. Fallback to heuristic rule-based nameplate extraction if LLM didn't return claims
        if (extractedCandidates.length === 0) {
          extractedCandidates = this.extractCandidatesWithHeuristics(machine, cleanedText, relevantPages);
          extractionMethod = 'DOCUMENT_PARSER';
        }

        if (extractedCandidates.length === 0) {
          logger.info(
            { documentId: document.id, machineId: machine.id },
            'No nameplate claims detected in document text'
          );
          continue;
        }

        // 3. Retrieve existing claims to prevent duplicates on document reprocessing
        const existingClaims = await this.dataStore.listEvidenceClaims(organizationId, {
          machineId: machine.id,
        });

        const createdForMachine: MachineEvidenceClaim[] = [];

        for (const candidate of extractedCandidates) {
          // Check for existing claim for this field from this source document
          const alreadyExists = existingClaims.some(
            (c) =>
              c.fieldName === candidate.fieldName &&
              (c.sourceDocumentId === document.id || String(c.claimValue).trim() === String(candidate.claimValue).trim())
          );

          if (alreadyExists) {
            continue;
          }

          const isSafety =
            candidate.isSafetyCritical ??
            /\b(pressure|voltage|current|torque|loto|lockout|safety|mawp|temperature|relief|speed|rpm)\b/i.test(
              candidate.fieldName
            );

          const claimDto: CreateEvidenceClaimDTO & { submittedByUserId: string; submittedByEmail?: string } = {
            machineId: machine.id,
            fieldName: candidate.fieldName,
            displayName: candidate.displayName || candidate.fieldName,
            claimValue: candidate.claimValue,
            unit: candidate.unit || null,
            sourceType: 'SCANNED_MANUAL',
            sourceDocumentId: document.id,
            sourceAttachmentKey: version.storageKey,
            sourcePageNumber: candidate.sourcePageNumber || 1,
            sourceRevision: version.revision || 'REV-A',
            sourceDate: new Date().toISOString().substring(0, 10),
            extractionMethod,
            confidence: candidate.confidence || 'HIGH',
            applicabilityStatus: candidate.applicabilityStatus || 'APPLICABLE',
            applicabilityRationale:
              candidate.notes ||
              `AI extracted from technical document ${document.documentNumber} (${document.title}) for asset ${machine.assetTag}`,
            isSafetyCritical: isSafety,
            submittedByUserId: submittedByUserId || document.createdByUserId || 'system',
            submittedByEmail: 'ai-ingestion-worker@forgex.internal',
          };

          const created = await this.dataStore.createEvidenceClaim(organizationId, claimDto);
          createdForMachine.push(created);
          allCreatedClaims.push(created);
        }

        if (createdForMachine.length > 0) {
          await this.dataStore.recordAuditEvent({
            organizationId,
            actorUserId: submittedByUserId || document.createdByUserId || 'system',
            action: 'AI_RECOVERY_CLAIMS_EXTRACTED',
            resourceType: 'MACHINE',
            resourceId: machine.id,
            metadata: {
              documentId: document.id,
              documentNumber: document.documentNumber,
              extractedCount: createdForMachine.length,
              fields: createdForMachine.map((c) => c.fieldName),
              machineAssetTag: machine.assetTag,
              status: 'AWAITING_REVIEW',
            },
          });

          // Refresh machine verification record
          try {
            await this.dataStore.getMachineVerification(organizationId, machine.id);
          } catch {
            // ignore
          }

          logger.info(
            {
              machineId: machine.id,
              assetTag: machine.assetTag,
              documentNumber: document.documentNumber,
              claimsCount: createdForMachine.length,
            },
            'Successfully extracted and saved Machine Recovery AI candidate claims'
          );
        }
      } catch (err: any) {
        logger.error(
          { err: err?.message, machineId: machine.id, documentId: document.id },
          'Error extracting machine recovery claims for machine'
        );
      }
    }

    return allCreatedClaims;
  }

  /**
   * Calls Google Gemini Generative API or OpenAI with strict structured JSON output
   */
  private async callLlmExtraction(
    machine: Machine,
    documentText: string,
    document: { documentNumber: string; title: string }
  ): Promise<ExtractionCandidateClaim[]> {
    const provider = getLlmProvider();

    const prompt = `You are an expert industrial engineering AI analyzing an equipment manual to extract verified nameplate data and operating limits.

TARGET MACHINE CONTEXT:
- Asset Tag: "${machine.assetTag}"
- Machine Name: "${machine.name}"
- System / Area: "${machine.area || 'Industrial Plant'}"
- Known Manufacturer: "${machine.manufacturer || 'Unknown'}"
- Known Model: "${machine.modelNumber || 'Unknown'}"
- Document Reference: "${document.documentNumber} — ${document.title}"

DOCUMENT TEXT EXCERPTS:
${documentText}

INSTRUCTIONS:
Extract verified nameplate specifications, design limits, and operational parameters for this machine.
Look specifically for:
1. manufacturer (OEM builder, e.g. Flowserve, Sulzer, Siemens)
2. modelNumber (Model, frame, catalog, or type designation)
3. serialNumber (Serial number or unit code)
4. manufacturingYear (Year built, integer e.g. 2018)
5. designDischargePressure (Design/MAWP pressure, number, unit e.g. bar, psi, kPa)
6. designOperatingTemperature (Design operating temp, number, unit e.g. °C, °F)
7. operatingFlowRate (Flow rate, number, unit e.g. gpm, m3/h)
8. nameplateRpm (Rated speed, integer, unit "RPM")
9. ratedVoltage (Rated voltage, number, unit e.g. V, VAC, kV)
10. fullLoadCurrent (Full load current / FLA, number, unit "A")
11. motorPowerRating (Motor power, number, unit e.g. kW, HP)
12. lotoIsolationProcedure (Energy isolation instructions summary, text)
13. suctionFlangeAnsi (Flange ANSI class, text e.g. "150", "300")
14. impellerDiameterMm (Impeller diameter, number, unit e.g. "mm", "in")

Return ONLY valid JSON matching this schema:
{
  "claims": [
    {
      "fieldName": "manufacturer",
      "displayName": "Manufacturer / OEM",
      "claimValue": "Flowserve Corp",
      "unit": null,
      "confidence": "HIGH",
      "isSafetyCritical": false,
      "sourcePageNumber": 1,
      "applicabilityStatus": "APPLICABLE",
      "notes": "Found on cover page"
    }
  ]
}`;

    try {
      const response = await provider.generate(prompt, {
        jsonMode: true,
        timeoutMs: 4000,
      });

      if (response) {
        const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());
        if (Array.isArray(parsed.claims) && parsed.claims.length > 0) {
          return parsed.claims.map((c: any) => ({
            fieldName: String(c.fieldName),
            displayName: String(c.displayName || c.fieldName),
            claimValue: c.claimValue,
            unit: c.unit || null,
            confidence: (c.confidence as ClaimConfidence) || 'HIGH',
            isSafetyCritical: Boolean(c.isSafetyCritical),
            sourcePageNumber: typeof c.sourcePageNumber === 'number' ? c.sourcePageNumber : 1,
            applicabilityStatus: (c.applicabilityStatus as ClaimApplicability) || 'APPLICABLE',
            notes: c.notes || `AI extracted with ${provider.name}`,
          }));
        }
      }
    } catch (err: any) {
      logger.debug({ err: err?.message, provider: provider.name }, 'LlmProvider extraction timed out or failed; proceeding to fallback');
    }

    return [];
  }

  /**
   * Heuristic Regex & Rule-Based Nameplate Extraction Fallback
   */
  private extractCandidatesWithHeuristics(
    _machine: Machine,
    text: string,
    pages: Array<{ pageNumber: number; rawText: string }>
  ): ExtractionCandidateClaim[] {
    const candidates: ExtractionCandidateClaim[] = [];

    const findPageForSnippet = (snippet: string): number => {
      if (!snippet) return 1;
      const lower = snippet.toLowerCase();
      for (const p of pages) {
        if (p.rawText.toLowerCase().includes(lower)) {
          return p.pageNumber;
        }
      }
      return 1;
    };

    // 1. Manufacturer OEM
    const mfrMatch =
      text.match(/\b(?:Manufacturer|OEM|Mfr|Fabricator|Brand|Made by)[\s:]+([A-Za-z0-9&.\- ]{2,30})/i) ||
      text.match(/\b(Sulzer|Flowserve|Grundfos|Siemens|ITT Goulds|ABB|GE|Worthington|Babcock & Wilcox|Kirloskar|Ingersoll Rand|Kato Engineering)\b/i);
    if (mfrMatch) {
      const val = (mfrMatch[1] || mfrMatch[0]).trim();
      candidates.push({
        fieldName: 'manufacturer',
        displayName: 'Manufacturer / OEM',
        claimValue: val,
        unit: null,
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(val),
        applicabilityStatus: 'APPLICABLE',
        notes: 'Extracted from OEM nameplate block',
      });
    }

    // 2. Model Number
    const modelMatch = text.match(/\b(?:Model|Type|Frame|Cat No|Part No)[\s:#]+([A-Z0-9\-/.]{3,24})/i);
    if (modelMatch) {
      const val = modelMatch[1].trim();
      candidates.push({
        fieldName: 'modelNumber',
        displayName: 'Model Number',
        claimValue: val,
        unit: null,
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(modelMatch[0]),
        applicabilityStatus: 'APPLICABLE',
        notes: 'Extracted from equipment designation block',
      });
    }

    // 3. Serial Number
    const serialMatch = text.match(/\b(?:Serial|S\/N|Serial No|Serial Number|NB#)[\s:#]+([A-Z0-9\-]{4,24})/i);
    if (serialMatch) {
      const val = serialMatch[1].trim();
      candidates.push({
        fieldName: 'serialNumber',
        displayName: 'Serial Number',
        claimValue: val,
        unit: null,
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(serialMatch[0]),
        applicabilityStatus: 'APPLICABLE',
        notes: 'Extracted from unit serial stamping',
      });
    }

    // 4. Manufacturing Year
    const yearMatch = text.match(/\b(?:Year|Mfg Year|Built|Date of Mfg)[\s:#]+(19[5-9]\d|20[0-2]\d)\b/i);
    if (yearMatch) {
      candidates.push({
        fieldName: 'manufacturingYear',
        displayName: 'Manufacturing Year',
        claimValue: parseInt(yearMatch[1], 10),
        unit: null,
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(yearMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 5. Design Discharge Pressure / MAWP
    const pressureMatch = text.match(
      /\b(?:Design Pressure|Discharge Pressure|MAWP|Working Pressure|Pressure)[\s:#]+([0-9.]+)\s*(bar|psi|kPa|MPa)\b/i
    );
    if (pressureMatch) {
      candidates.push({
        fieldName: 'designDischargePressure',
        displayName: 'Design Discharge Pressure',
        claimValue: parseFloat(pressureMatch[1]),
        unit: pressureMatch[2].toLowerCase(),
        confidence: 'HIGH',
        isSafetyCritical: true,
        sourcePageNumber: findPageForSnippet(pressureMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 6. Rated Speed / RPM
    const rpmMatch = text.match(/\b(?:Rated Speed|Speed|RPM)[\s:#]+([0-9]{3,5})\s*(?:rpm|RPM)?\b/i);
    if (rpmMatch) {
      candidates.push({
        fieldName: 'nameplateRpm',
        displayName: 'Rated Speed (RPM)',
        claimValue: parseInt(rpmMatch[1], 10),
        unit: 'RPM',
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(rpmMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 7. Rated Voltage
    const voltMatch = text.match(/\b(?:Voltage|Volts|Rated Voltage)[\s:#]+([0-9.]+)\s*(V|VAC|kV)\b/i);
    if (voltMatch) {
      candidates.push({
        fieldName: 'ratedVoltage',
        displayName: 'Rated Voltage',
        claimValue: parseFloat(voltMatch[1]),
        unit: voltMatch[2].toUpperCase(),
        confidence: 'HIGH',
        isSafetyCritical: true,
        sourcePageNumber: findPageForSnippet(voltMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 8. Full Load Current / FLA
    const currentMatch = text.match(/\b(?:Full Load Current|FLA|Amps|Current)[\s:#]+([0-9.]+)\s*(A|Amps?)\b/i);
    if (currentMatch) {
      candidates.push({
        fieldName: 'fullLoadCurrent',
        displayName: 'Full Load Current (FLA)',
        claimValue: parseFloat(currentMatch[1]),
        unit: 'A',
        confidence: 'HIGH',
        isSafetyCritical: true,
        sourcePageNumber: findPageForSnippet(currentMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 9. Motor Power Rating
    const powerMatch = text.match(/\b(?:Motor Power|Power Rating|Motor|Output)[\s:#]+([0-9.]+)\s*(kW|HP)\b/i);
    if (powerMatch) {
      candidates.push({
        fieldName: 'motorPowerRating',
        displayName: 'Motor Power Rating',
        claimValue: parseFloat(powerMatch[1]),
        unit: powerMatch[2].toUpperCase(),
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(powerMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 10. Operating Flow Rate
    const flowMatch = text.match(/\b(?:Flow Rate|Design Flow|Capacity)[\s:#]+([0-9.]+)\s*(gpm|m3\/h|m³\/h|l\/s)\b/i);
    if (flowMatch) {
      candidates.push({
        fieldName: 'operatingFlowRate',
        displayName: 'Operating Flow Rate',
        claimValue: parseFloat(flowMatch[1]),
        unit: flowMatch[2],
        confidence: 'HIGH',
        isSafetyCritical: false,
        sourcePageNumber: findPageForSnippet(flowMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 11. LOTO / Energy Isolation Procedure
    const lotoMatch = text.match(
      /\b(?:LOTO|Lockout|Tagout|Electrical Isolation|Energy Control)[\s:#]+([A-Za-z0-9,.\- ]{10,120})/i
    );
    if (lotoMatch) {
      candidates.push({
        fieldName: 'lotoIsolationProcedure',
        displayName: 'LOTO Isolation Procedure',
        claimValue: lotoMatch[1].trim(),
        unit: null,
        confidence: 'MEDIUM',
        isSafetyCritical: true,
        sourcePageNumber: findPageForSnippet(lotoMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 12. Design Operating Temperature
    const tempMatch = text.match(
      /\b(?:Operating Temp(?:erature)?|Design Temp(?:erature)?|Max Operating Temp|Max Temp(?:erature)?)[\s:#]+([0-9.]+)\s*(°?C|°?F|K)\b/i
    );
    if (tempMatch) {
      candidates.push({
        fieldName: 'designOperatingTemperature',
        displayName: 'Design Operating Temperature',
        claimValue: parseFloat(tempMatch[1]),
        unit: tempMatch[2].replace('°', '').toUpperCase(),
        confidence: 'HIGH',
        isSafetyCritical: true,
        sourcePageNumber: findPageForSnippet(tempMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    // 13. Torque / Bolt Tightening Torque
    const torqueMatch = text.match(
      /\b(?:Torque|Bolt Torque|Tightening Torque|Rated Torque)[\s:#]+([0-9.]+)\s*(Nm|N-m|ft-lbs?|in-lbs?)\b/i
    );
    if (torqueMatch) {
      candidates.push({
        fieldName: 'tighteningTorque',
        displayName: 'Tightening Torque',
        claimValue: parseFloat(torqueMatch[1]),
        unit: torqueMatch[2],
        confidence: 'HIGH',
        isSafetyCritical: true,
        sourcePageNumber: findPageForSnippet(torqueMatch[0]),
        applicabilityStatus: 'APPLICABLE',
      });
    }

    return candidates;
  }
}

import type { IDataStore } from '../db/dataStore.interface.js';
import type { GenerationEvidenceItem } from '../ai/ai.interface.js';
import type {
  HistoricalFaultMatchRequest,
  HistoricalFaultMatchResult,
  HistoricalFaultRetrievalResponse,
  ConflictingDiagnosisEntry,
  MatchConfidence,
  HistoricalEvidenceType,
  PriorRepairEffectiveness,
} from '@forgex/shared-types';
import { sanitizeMachineOrAssetId, sanitizeUuid } from '../utils/uuid.js';

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 's', 'same', 'she', 'should', 'so', 'some', 'such',
  't', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'won'
]);

const CRITICAL_SYMPTOM_KEYWORDS = new Set([
  'vibration', 'vibrating', 'overheat', 'overheating', 'temperature', 'bearing', 'bearings',
  'seal', 'seals', 'leak', 'leakage', 'leaking', 'pressure', 'motor', 'valve', 'valves',
  'misalignment', 'misaligned', 'coupling', 'cavitation', 'cavitating', 'wear', 'worn',
  'lubrication', 'grease', 'greasing', 'noise', 'noisy', 'whine', 'whining', 'trip', 'tripped',
  'stuck', 'crack', 'cracked', 'corrosion', 'corroded', 'clogged', 'intake', 'discharge',
  'flange', 'gasket', 'electrical', 'short', 'contaminant', 'contaminated', 'flow', 'impeller',
  'packing', 'gland', 'overload', 'overcurrent', 'pulsation', 'imbalance', 'unbalance', 'chatter'
]);

export class HistoricalFaultService {
  constructor(private dataStore: IDataStore) {}

  /**
   * Tokenize text into normalized significant keywords
   */
  private extractTokens(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  }

  /**
   * Calculate Jaccard / token overlap similarity between query tokens and record text
   */
  private calculateTextSimilarity(
    queryTokens: string[],
    recordText: string
  ): { score: number; matchedKeywords: string[] } {
    if (queryTokens.length === 0 || !recordText) {
      return { score: 0, matchedKeywords: [] };
    }

    const recordTokens = new Set(this.extractTokens(recordText));
    const matchedKeywords: string[] = [];
    let weightedMatches = 0;

    for (const token of queryTokens) {
      if (recordTokens.has(token)) {
        matchedKeywords.push(token);
        // Boost critical mechanical symptom keywords
        weightedMatches += CRITICAL_SYMPTOM_KEYWORDS.has(token) ? 2 : 1;
      }
    }

    if (matchedKeywords.length === 0) {
      return { score: 0, matchedKeywords: [] };
    }

    const denominator = queryTokens.length + (CRITICAL_SYMPTOM_KEYWORDS.size > 0 ? 1 : 0);
    const score = Math.min(0.45, (weightedMatches / denominator) * 0.45);
    return { score, matchedKeywords };
  }

  /**
   * Retrieve and rank historical maintenance records by relevance to the query or fault code
   */
  public async matchHistoricalFaults(
    organizationId: string,
    machineId: string,
    request: HistoricalFaultMatchRequest,
    userRole?: string
  ): Promise<HistoricalFaultRetrievalResponse> {
    const {
      query,
      faultCategory,
      faultCode,
      componentId,
      limit = 5,
      minScore = 0.25,
    } = request;
    const cleanMachineId = sanitizeMachineOrAssetId(machineId);

    // 1. Validate Machine and Organization Ownership
    const machine =
      (await this.dataStore.getMachineById(organizationId, cleanMachineId)) ||
      (await this.dataStore.getMachineById(organizationId, machineId));
    if (!machine) {
      throw new Error(`Machine '${machineId}' not found in this organization.`);
    }

    const targetMachineId = sanitizeUuid(machine.id) || machine.id || cleanMachineId;

    // 2. Retrieve All Persistent Maintenance Records for this Machine
    const allRecords = await this.dataStore.getMachineMaintenanceHistory(organizationId, targetMachineId);

    // 3. RBAC Enforcement: Exclude internal investigation records from non-privileged roles
    const isPrivileged =
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'PLANT_MANAGER' ||
      userRole === 'ENGINEER' ||
      userRole === 'ENGINEER_TECHNICIAN' ||
      userRole === 'TECHNICIAN' ||
      userRole === 'SUPERVISOR' ||
      userRole === 'MAINTENANCE_SUPERVISOR';

    const permittedRecords = allRecords.filter((r) => {
      if (isPrivileged) return true;
      if (r.faultCategory === 'INTERNAL_INVESTIGATION') return false;
      return true;
    });

    if (permittedRecords.length === 0) {
      const emptyRecurrence = await this.dataStore.detectRecurringFaults(organizationId, targetMachineId, {
        timeWindowDays: request.timeWindowDays,
      });

      return {
        machineId: targetMachineId,
        machineAssetTag: machine.assetTag,
        query: query || '',
        totalHistoryCount: 0,
        matchedCount: 0,
        matches: [],
        recurrenceAnalysis: emptyRecurrence,
        conflictingDiagnoses: [],
        hasConflictingEvidence: false,
        searchStatus: 'INSUFFICIENT_HISTORY',
        patternDisclaimer:
          'No approved maintenance history records exist for this asset in the registry. Historical fault matching requires verified prior repair records.',
      };
    }

    const queryTokens = this.extractTokens(query || '');
    const scoredMatches: HistoricalFaultMatchResult[] = [];

    // 4. Score and Rank Each Record
    for (let i = 0; i < permittedRecords.length; i++) {
      const r = permittedRecords[i];
      let matchScore = 0;
      const matchReasons: string[] = [];

      // A. Exact or Partial Fault Category Match
      if (faultCategory && faultCategory.trim()) {
        const reqCat = faultCategory.trim().toUpperCase();
        const recCat = (r.faultCategory || '').toUpperCase();
        if (reqCat === recCat) {
          matchScore += 0.45;
          matchReasons.push(`EXACT_FAULT_CATEGORY: ${r.faultCategory}`);
        } else if (reqCat.includes(recCat) || recCat.includes(reqCat)) {
          matchScore += 0.25;
          matchReasons.push(`PARTIAL_CATEGORY_MATCH: ${r.faultCategory}`);
        }
      }

      // B. Fault Code Match
      if (faultCode && faultCode.trim()) {
        const codeNormalized = faultCode.trim().toLowerCase();
        const combinedText = `${r.problemStatement} ${r.observedSymptoms.join(' ')} ${r.rootCause}`.toLowerCase();
        if (combinedText.includes(codeNormalized)) {
          matchScore += 0.35;
          matchReasons.push(`FAULT_CODE_MATCH: ${faultCode}`);
        }
      }

      // C. Component ID Match
      if (componentId && componentId.trim()) {
        if (r.componentId && r.componentId.toLowerCase() === componentId.trim().toLowerCase()) {
          matchScore += 0.25;
          matchReasons.push(`COMPONENT_MATCH: ${componentId}`);
        }
      }

      // D. Symptom & Problem Statement Text Similarity
      const recordText = [
        r.faultCategory,
        r.problemStatement,
        r.observedSymptoms.join(' '),
        r.rootCause,
        r.repairActions.join(' '),
      ].join(' ');

      const textSim = this.calculateTextSimilarity(queryTokens, recordText);
      if (textSim.score > 0) {
        matchScore += textSim.score;
        matchReasons.push(`SYMPTOM_KEYWORD_MATCH: ${textSim.matchedKeywords.join(', ')}`);
      }

      // E. Recency Weighting (subtle boost for recent records, max +0.05)
      const recordTimestamp = r.resolvedAt ? new Date(r.resolvedAt).getTime() : 0;
      if (recordTimestamp > 0 && !isNaN(recordTimestamp)) {
        const daysAgo = (Date.now() - recordTimestamp) / (24 * 3600 * 1000);
        if (daysAgo <= 30) {
          matchScore += 0.05;
          matchReasons.push('RECENCY_BOOST: Within last 30 days');
        } else if (daysAgo <= 90) {
          matchScore += 0.02;
        }
      }

      // Cap score between 0.0 and 1.0
      const finalScore = Math.min(1.0, Math.round(matchScore * 100) / 100);

      // Determine match confidence
      let matchConfidence: MatchConfidence;
      if (finalScore >= 0.65) {
        matchConfidence = 'HIGH';
      } else if (finalScore >= 0.40) {
        matchConfidence = 'MEDIUM';
      } else if (finalScore >= 0.20) {
        matchConfidence = 'LOW';
      } else {
        matchConfidence = 'INSUFFICIENT_SIMILARITY';
      }

      // Determine Evidence Type
      let evidenceType: HistoricalEvidenceType;
      if (
        r.rootCauseStatus === 'CONFIRMED' &&
        (r.verificationState === 'PASSED' || r.verificationState === 'VERIFIED')
      ) {
        evidenceType = 'RECORDED_FACT';
      } else if (r.rootCauseStatus === 'SUSPECTED') {
        evidenceType = 'POSSIBLE_SIMILARITY';
      } else {
        evidenceType = 'UNCONFIRMED_HYPOTHESIS';
      }

      // Evaluate Prior Repair Effectiveness
      let priorRepairEffectiveness: PriorRepairEffectiveness = 'UNVERIFIED';
      if (r.verificationState === 'FAILED') {
        priorRepairEffectiveness = 'INEFFECTIVE';
      } else if (r.verificationState === 'PASSED' || r.verificationState === 'VERIFIED') {
        // Look ahead to check if the same machine suffered the same fault within 30 days
        const hasSubsequentFailure = permittedRecords.some((other) => {
          if (other.id === r.id) return false;
          const otherTime = new Date(other.resolvedAt).getTime();
          const thisTime = new Date(r.resolvedAt).getTime();
          if (otherTime > thisTime && (otherTime - thisTime) <= 30 * 24 * 3600 * 1000) {
            return (
              other.faultCategory === r.faultCategory ||
              other.problemStatement.toLowerCase().includes(r.faultCategory.toLowerCase())
            );
          }
          return false;
        });

        priorRepairEffectiveness = hasSubsequentFailure ? 'PARTIALLY_EFFECTIVE' : 'EFFECTIVE';
      }

      // Fallback for recorded diagnosis (Never invent!)
      const recordedDiagnosis =
        r.rootCauseStatus === 'UNKNOWN' || !r.rootCause || !r.rootCause.trim()
          ? 'UNKNOWN (Root cause unverified or not recorded during incident)'
          : r.rootCause;

      // Work order reference
      const workOrderReference = r.caseNumber || r.ticketNumber || 'N/A';

      if (finalScore >= minScore || matchReasons.length > 0) {
        scoredMatches.push({
          recordId: r.id,
          recordNumber: r.recordNumber,
          incidentDate: r.resolvedAt,
          machineId: r.machineId,
          machineAssetTag: r.machineAssetTag,
          plantId: r.plantId,
          faultCategory: r.faultCategory,
          recordedProblemDescription: r.problemStatement || r.observedSymptoms.join('; ') || 'No description recorded',
          recordedDiagnosis,
          diagnosisStatus: r.rootCauseStatus,
          correctiveActions: r.repairActions && r.repairActions.length > 0 ? r.repairActions : ['No specific corrective actions logged'],
          partsReplaced: r.partsReplaced || [],
          recordedOutcome: r.verificationState,
          workOrderReference,
          ticketId: r.ticketId,
          caseId: r.caseId,
          matchScore: finalScore,
          matchReasons,
          matchConfidence,
          evidenceType,
          priorRepairEffectiveness,
          measurements: r.measurements,
          resolvingTechnicianName: r.resolvingTechnicianName,
        });
      }
    }

    // Sort: highest score first, then most recent date
    scoredMatches.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return new Date(b.incidentDate).getTime() - new Date(a.incidentDate).getTime();
    });

    const topMatches = scoredMatches.slice(0, limit);

    // 5. Detect Conflicting Diagnoses Across Historical Incidents
    const conflictingDiagnoses: ConflictingDiagnosisEntry[] = [];
    for (let i = 0; i < topMatches.length; i++) {
      for (let j = i + 1; j < topMatches.length; j++) {
        const m1 = topMatches[i];
        const m2 = topMatches[j];

        // Same or highly similar fault category but different root causes
        if (
          m1.faultCategory === m2.faultCategory &&
          m1.recordedDiagnosis !== 'UNKNOWN' &&
          m2.recordedDiagnosis !== 'UNKNOWN' &&
          m1.recordedDiagnosis.toLowerCase() !== m2.recordedDiagnosis.toLowerCase()
        ) {
          const alreadyLogged = conflictingDiagnoses.some(
            (c) =>
              (c.recordIdA === m1.recordId && c.recordIdB === m2.recordId) ||
              (c.recordIdA === m2.recordId && c.recordIdB === m1.recordId)
          );

          if (!alreadyLogged) {
            conflictingDiagnoses.push({
              rootCauseA: m1.recordedDiagnosis,
              rootCauseB: m2.recordedDiagnosis,
              recordIdA: m1.recordId,
              recordIdB: m2.recordId,
              recordNumberA: m1.recordNumber,
              recordNumberB: m2.recordNumber,
              description: `Conflicting diagnoses logged on ${machine.assetTag}: Record ${m1.recordNumber} diagnosed "${m1.recordedDiagnosis}" whereas Record ${m2.recordNumber} diagnosed "${m2.recordedDiagnosis}". Both hypotheses should be inspected physically.`,
            });
          }
        }
      }
    }

    // 6. Recurrence Analysis from DataStore
    const recurrenceAnalysis = await this.dataStore.detectRecurringFaults(organizationId, targetMachineId, {
      timeWindowDays: request.timeWindowDays,
    });

    const hasMatches = topMatches.length > 0;
    const searchStatus = hasMatches
      ? 'MATCHES_FOUND'
      : permittedRecords.length === 0
      ? 'INSUFFICIENT_HISTORY'
      : 'NO_MATCHING_RECORDS';

    return {
      machineId: targetMachineId,
      machineAssetTag: machine.assetTag,
      query: query || '',
      totalHistoryCount: permittedRecords.length,
      matchedCount: topMatches.length,
      matches: topMatches,
      recurrenceAnalysis,
      conflictingDiagnoses,
      hasConflictingEvidence: conflictingDiagnoses.length > 0,
      searchStatus,
      patternDisclaimer:
        'Historical fault matches reflect documented past incidents and verified repairs. Past repairs do not guarantee identical failure causes today. Physical inspection and current readings must be verified.',
    };
  }

  /**
   * Format historical fault retrieval results for AI / RAG query engine synthesis
   */
  public formatHistoricalEvidenceForRAG(
    retrieval: HistoricalFaultRetrievalResponse,
    assetTag: string
  ): {
    content: string;
    evidenceItems: GenerationEvidenceItem[];
    isRelevant: boolean;
  } {
    if (retrieval.matches.length === 0) {
      return {
        content: `Authorized Maintenance History Ledger for ${assetTag}: No matching historical maintenance records or prior fault reports found in the database registry for the specified inquiry. Note: This indicates the absence of recorded entries matching this symptom, not proof that the condition has never physically occurred.`,
        evidenceItems: [],
        isRelevant: false,
      };
    }

    const recordedFacts: string[] = [];
    const possibleSimilarities: string[] = [];
    const unknowns: string[] = [];
    const evidenceItems: GenerationEvidenceItem[] = [];

    for (const match of retrieval.matches.slice(0, 5)) {
      const partsText =
        match.partsReplaced && match.partsReplaced.length > 0
          ? ` [Parts Replaced: ${match.partsReplaced.map((p) => `${p.partNumber} (${p.partName || 'part'})`).join(', ')}]`
          : '';

      const outcomeText = ` [Recorded Outcome: ${match.recordedOutcome}, Prior Repair Effectiveness: ${match.priorRepairEffectiveness}]`;
      const refText = ` [Work Order Ref: ${match.workOrderReference}]`;

      if (match.evidenceType === 'RECORDED_FACT') {
        recordedFacts.push(
          `Record ${match.recordNumber} (${match.incidentDate.slice(0, 10)}): CONFIRMED Root Cause: "${match.recordedDiagnosis}". Actions: ${match.correctiveActions.join(', ')}.${partsText}${outcomeText}${refText}`
        );
      } else if (match.evidenceType === 'POSSIBLE_SIMILARITY') {
        possibleSimilarities.push(
          `Record ${match.recordNumber} (${match.incidentDate.slice(0, 10)}): SUSPECTED Root Cause (Unconfirmed): "${match.recordedDiagnosis}". Actions: ${match.correctiveActions.join(', ')}.${outcomeText}${refText}`
        );
      } else {
        unknowns.push(
          `Record ${match.recordNumber} (${match.incidentDate.slice(0, 10)}): Root cause UNKNOWN. Recorded Actions: ${match.correctiveActions.join(', ')}.${outcomeText}${refText}`
        );
      }

      evidenceItems.push({
        chunkId: `maint_rec_${match.recordId}`,
        documentId: `record_${match.recordId}`,
        documentNumber: match.recordNumber,
        documentTitle: `Maintenance Record ${match.recordNumber} for ${assetTag}`,
        documentVersionId: '1.0',
        pageNumber: 1,
        content: `Historical Maintenance Record ${match.recordNumber}: Fault Category "${match.faultCategory}". Problem: ${match.recordedProblemDescription}. Diagnosis (${match.diagnosisStatus}): ${match.recordedDiagnosis}. Corrective Actions: ${match.correctiveActions.join(', ')}. Outcome: ${match.recordedOutcome}. Work Order: ${match.workOrderReference}.`,
        sectionHeading: `Historical Maintenance Event - ${match.faultCategory}`,
        score: match.matchScore,
      });
    }

    let content = `Authorized Historical Maintenance Ledger for ${assetTag}:\n`;
    content += `[EVIDENCE NOTE: A previous repair is historical evidence of what occurred and was executed in the past, NOT definitive proof that the current issue shares the identical root cause. Always follow current safety checklists and verify physical readings.]\n`;

    if (recordedFacts.length > 0) {
      content += `[RECORDED HISTORICAL FACTS & CONFIRMED REPAIRS]\n- ` + recordedFacts.join('\n- ') + '\n';
    }
    if (possibleSimilarities.length > 0) {
      content += `[POSSIBLE SIMILARITIES & SUSPECTED CAUSES]\n- ` + possibleSimilarities.join('\n- ') + '\n';
    }
    if (unknowns.length > 0) {
      content += `[UNCONFIRMED HYPOTHESES & UNKNOWNS]\n- ` + unknowns.join('\n- ') + '\n';
    }

    // Add conflicting diagnoses disclosure if any
    if (retrieval.hasConflictingEvidence) {
      content += `[CONFLICTING HISTORICAL EVIDENCE DISCLOSURE]\n`;
      for (const conf of retrieval.conflictingDiagnoses) {
        content += `- Note: Record ${conf.recordNumberA} diagnosed "${conf.rootCauseA}", but Record ${conf.recordNumberB} diagnosed "${conf.rootCauseB}". Disclose both possibilities; do not arbitrarily declare one as authoritative.\n`;
      }
    }

    // Add recurrence intelligence
    const rec = retrieval.recurrenceAnalysis;
    if (rec && rec.isRecurringFault) {
      content += `[RECURRING FAULT INTELLIGENCE]\n`;
      content += `- Fault category "${rec.faultCategory}" has recurred ${rec.recurrenceCount} times within monitoring window. Evidence Confidence: ${rec.confidence}.\n`;
      if (rec.averageRecurrenceIntervalDays) {
        content += `- Average recurrence interval: ${rec.averageRecurrenceIntervalDays} days.\n`;
      }
      content += `- Confirmed root causes: ${rec.confirmedRootCauses.join(', ') || 'None'}.\n`;
      content += `- Suspected causes: ${rec.suspectedRootCauses.join(', ') || 'None'}.\n`;
      if (rec.priorRepairEffectiveness) {
        content += `- Prior repair effectiveness across repeat incidents: ${rec.priorRepairEffectiveness}.\n`;
      }
    }

    return {
      content,
      evidenceItems,
      isRelevant: true,
    };
  }
}

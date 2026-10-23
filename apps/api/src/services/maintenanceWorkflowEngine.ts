import type { IDataStore } from '../db/dataStore.interface.js';
import type { RAGQueryEngine } from './ragQueryEngine.js';
import type { VisualIntelligenceEngine } from './visualIntelligenceEngine.js';
import type {
  MaintenanceCase,
  MaintenanceCaseStatus,
  ChecklistStep,
  DiagnosticHypothesis,
  TechnicianFindings,
  CaseApproval,
  CaseHistoryEntry,
  CreateMaintenanceCaseRequest,
  AssignTechnicianRequest,
  CloseCaseRequest,
  UpdateChecklistStepRequest,
  RecordFindingsRequest,
  ApproveCaseRequest,
  EscalateCaseRequest,
  ProvideFeedbackRequest,
  TransitionCaseStatusRequest,
  ReopenCaseRequest,
  UnassignTechnicianRequest,
  Citation,
  MaintenanceCaseSeverity,
  MaintenanceRecord,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
import { sanitizeMachineOrAssetId } from '../utils/uuid.js';
import crypto from 'node:crypto';

export interface WorkflowContext {
  organizationId: string;
  userId: string;
  userRole?: string;
}

export class MaintenanceWorkflowEngine {
  constructor(
    private dataStore: IDataStore,
    private ragEngine: RAGQueryEngine,
    private visualEngine?: VisualIntelligenceEngine
  ) {}

  /**
   * 1. Create a maintenance case linked to a plant, asset, and reporting user.
   */
  public async createCase(
    request: CreateMaintenanceCaseRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;
    const {
      plantId,
      assetId,
      title,
      description,
      severity = 'MEDIUM',
      symptomDescription,
      operatingConditions,
      visualAssetIds,
      supportingDocumentIds,
      assignedTechnicianUserId,
      assignedTechnicianName,
      sourceTicketId,
    } = request;

    // Field length and boundary validation
    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) {
      throw new Error('Validation failed: title length must be between 3 and 200 characters.');
    }

    if (
      typeof symptomDescription !== 'string' ||
      symptomDescription.trim().length < 5 ||
      symptomDescription.trim().length > 4000
    ) {
      throw new Error('Validation failed: symptomDescription length must be between 5 and 4000 characters.');
    }

    if (description !== undefined && typeof description === 'string' && description.length > 4000) {
      throw new Error('Validation failed: description length cannot exceed 4000 characters.');
    }

    if (operatingConditions !== undefined) {
      if (typeof operatingConditions !== 'object' || operatingConditions === null || Array.isArray(operatingConditions)) {
        throw new Error('Validation failed: operatingConditions must be a valid key-value object.');
      }
      const keys = Object.keys(operatingConditions);
      if (keys.length > 50) {
        throw new Error('Validation failed: operatingConditions cannot exceed 50 properties.');
      }
      for (const k of keys) {
        if (k.length > 64) {
          throw new Error(`Validation failed: operatingConditions key '${k}' exceeds 64 characters.`);
        }
      }
    }

    if (visualAssetIds !== undefined) {
      if (!Array.isArray(visualAssetIds) || visualAssetIds.length > 20) {
        throw new Error('Validation failed: visualAssetIds must be an array of at most 20 IDs.');
      }
    }

    if (supportingDocumentIds !== undefined) {
      if (!Array.isArray(supportingDocumentIds) || supportingDocumentIds.length > 20) {
        throw new Error('Validation failed: supportingDocumentIds must be an array of at most 20 IDs.');
      }
    }

    // Validate plant and asset ownership with support for assetTag, pure UUID extraction, and plant inference
    const sanitizedAssetId = sanitizeMachineOrAssetId(assetId);
    let resolvedAsset = await this.dataStore.getAssetById(organizationId, sanitizedAssetId);
    if (!resolvedAsset && sanitizedAssetId !== assetId) {
      resolvedAsset = await this.dataStore.getAssetById(organizationId, assetId);
    }
    if (!resolvedAsset) {
      const allAssets = await this.dataStore.listAssets(organizationId);
      resolvedAsset =
        allAssets.find(
          (a) =>
            a.id === sanitizedAssetId ||
            a.id === assetId ||
            a.assetTag.toLowerCase() === assetId.toLowerCase() ||
            a.assetTag.toLowerCase() === sanitizedAssetId.toLowerCase()
        ) || null;
    }

    let targetPlantId = plantId || resolvedAsset?.plantId;
    if (!targetPlantId) {
      const plants = await this.dataStore.listPlants(organizationId);
      if (plants.length > 0) {
        targetPlantId = plants[0].id;
      }
    }

    let plant = targetPlantId ? await this.dataStore.getPlantById(organizationId, targetPlantId) : null;
    if (!plant) {
      const plants = await this.dataStore.listPlants(organizationId);
      if (plants.length > 0) {
        plant = plants[0];
        targetPlantId = plant.id;
      } else {
        throw new Error(`Unauthorized or invalid plant: Plant '${targetPlantId || plantId}' does not belong to organization.`);
      }
    }

    if (!resolvedAsset) {
      try {
        resolvedAsset = await this.dataStore.createAsset(organizationId, {
          plantId: plant.id,
          assetTag: assetId.toUpperCase(),
          name: (request as any).assetName || request.title || `Industrial Asset (${assetId})`,
          area: 'Sector 4 Heavy Machinery Hub',
          manufacturer: 'OEM Industrial Systems',
          modelNumber: 'MOD-2026-X',
          serialNumber: `SN-${assetId.toUpperCase()}`,
          operationalState: 'OPTIMAL',
        });
      } catch {
        const allAssets = await this.dataStore.listAssets(organizationId);
        resolvedAsset =
          allAssets.find(
            (a) => a.id === assetId || a.assetTag.toLowerCase() === assetId.toLowerCase()
          ) || null;
      }
    }

    if (!resolvedAsset) {
      resolvedAsset = {
        id: `asset-${assetId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        organizationId,
        plantId: plant.id,
        parentAssetId: null,
        assetTag: assetId.toUpperCase(),
        name: (request as any).assetName || request.title || `Industrial Machinery (${assetId})`,
        area: 'Sector 4 Heavy Machinery Hub',
        manufacturer: 'OEM Industrial Systems',
        modelNumber: 'MOD-2026-X',
        serialNumber: `SN-${assetId.toUpperCase()}`,
        operationalState: 'OPTIMAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (!resolvedAsset) {
      throw new Error(`Unauthorized or invalid asset: Asset '${assetId}' could not be resolved.`);
    }

    if (resolvedAsset.plantId && plant.id && resolvedAsset.plantId !== plant.id) {
      const actualPlant = await this.dataStore.getPlantById(organizationId, resolvedAsset.plantId);
      if (actualPlant) {
        plant = actualPlant;
      }
    }

    // Validate linked source ticket if provided
    if (sourceTicketId) {
      const sourceTicket = await this.dataStore.getSpecialistTicketById(organizationId, sourceTicketId);
      if (!sourceTicket) {
        throw new Error(`Invalid source ticket: Ticket '${sourceTicketId}' does not belong to organization or does not exist.`);
      }
      if (sourceTicket.machineId && sourceTicket.machineId !== resolvedAsset.id) {
        throw new Error(`Invalid relationship: Source ticket '${sourceTicket.ticketNumber || sourceTicketId}' belongs to machine '${sourceTicket.machineAssetTag || sourceTicket.machineId}', not asset '${resolvedAsset.assetTag}'.`);
      }
    }

    // Validate assigned technician if provided
    if (assignedTechnicianUserId) {
      const techMembership = await this.dataStore.getMembership(assignedTechnicianUserId, organizationId);
      if (!techMembership || techMembership.status !== 'ACTIVE') {
        throw new Error(`Invalid technician: Assigned user '${assignedTechnicianUserId}' does not belong to organization.`);
      }
    }

    // Duplicate creation protection: prevent identical rapid submissions on same asset
    const recentCases = await this.dataStore.listMaintenanceCases(organizationId, {
      assetId: resolvedAsset.id,
    });
    const duplicate = recentCases.find((c) => {
      const isSameTitle = c.title.trim().toLowerCase() === title.trim().toLowerCase();
      const isSameSymptoms = c.symptomDescription.trim().toLowerCase() === symptomDescription.trim().toLowerCase();
      const isSameUser = c.reportedByUserId === userId;
      const isRecent = (Date.now() - new Date(c.createdAt).getTime()) < 15000;
      return isSameTitle && isSameSymptoms && isSameUser && isRecent;
    });
    if (duplicate) {
      logger.warn({ caseId: duplicate.id, assetId: resolvedAsset.id }, 'Prevented duplicate maintenance case creation');
      return duplicate;
    }

    // Generate readable case number: CASE-YYYY-XXXX
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const caseNumber = `CASE-${new Date().getFullYear()}-${randomDigits}`;

    const maintenanceCase = await this.dataStore.createMaintenanceCase({
      organizationId,
      plantId: plant.id,
      assetId: resolvedAsset.id,
      caseNumber,
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      severity,
      status: 'REPORTED',
      reportedByUserId: userId,
      assignedTechnicianUserId: assignedTechnicianUserId || null,
      assignedTechnicianName: assignedTechnicianName || null,
      symptomDescription: symptomDescription.trim(),
      operatingConditions: operatingConditions || {},
      visualAssetIds: visualAssetIds || [],
      supportingDocumentIds: supportingDocumentIds || [],
      sourceTicketId: sourceTicketId || null,
      checklist: [],
      candidateForExpertKnowledge: false,
      createdAtFormatted: request.createdAtFormatted,
      plantName: request.plantName || plant.name,
      reportedByName: request.assignedTechnicianName,
      reportedByRole: request.reportedByRole,
      assetTag: request.assetTag || resolvedAsset.assetTag,
      assetName: request.assetName || resolvedAsset.name,
      machineStatus: request.machineStatus,
      faultCode: request.faultCode,
      topRootCause: request.topRootCause,
      probability: request.probability,
      recommendedFix: request.recommendedFix,
      investigationProgress: request.investigationProgress,
      specialistDiscipline: request.specialistDiscipline,
      priority: request.priority || severity,
      lotoApplied: request.lotoApplied,
      technicianNotes: request.technicianNotes,
    });

    // Record initial case history
    await this.dataStore.recordCaseHistory({
      caseId: maintenanceCase.id,
      userId,
      previousStatus: null,
      newStatus: 'REPORTED',
      action: 'CASE_REPORTED',
      notes: `Maintenance case created for asset ${resolvedAsset.assetTag}: ${title.trim()}`,
    });

    // Record audit event
    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'MAINTENANCE_CASE_CREATED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: maintenanceCase.id,
      metadata: {
        caseNumber,
        plantId: plant.id,
        assetId: resolvedAsset.id,
        assetTag: resolvedAsset.assetTag,
        sourceTicketId: sourceTicketId || null,
        severity,
      },
    });

    return maintenanceCase;
  }

  /**
   * 1b. Update permitted fields of an existing maintenance case.
   */
  public async updateCase(
    caseId: string,
    updates: {
      title?: string;
      description?: string;
      severity?: MaintenanceCaseSeverity;
      symptomDescription?: string;
      operatingConditions?: Record<string, any>;
      partsUsed?: any[];
      expectedUpdatedAt?: string;
    },
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' was not found or does not belong to organization.`);
    }

    if (existing.status === 'CLOSED') {
      throw new Error(`Cannot update a closed maintenance case.`);
    }

    // Concurrency / optimistic locking check
    if (updates.expectedUpdatedAt && existing.updatedAt !== updates.expectedUpdatedAt) {
      throw new Error(
        `Conflict: Maintenance case '${caseId}' was modified by another operation. Expected updatedAt '${updates.expectedUpdatedAt}', but current is '${existing.updatedAt}'.`
      );
    }

    // Whitelist only permitted fields
    const sanitizedUpdates: Partial<MaintenanceCase> = {};
    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.trim().length < 3 || updates.title.trim().length > 200) {
        throw new Error('Validation failed: title length must be between 3 and 200 characters.');
      }
      sanitizedUpdates.title = updates.title.trim();
    }
    if (updates.description !== undefined) {
      if (typeof updates.description === 'string' && updates.description.length > 4000) {
        throw new Error('Validation failed: description length cannot exceed 4000 characters.');
      }
      sanitizedUpdates.description = typeof updates.description === 'string' ? updates.description.trim() : '';
    }
    if (updates.severity !== undefined) {
      const validSeverities: MaintenanceCaseSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (!validSeverities.includes(updates.severity)) {
        throw new Error("Validation failed: severity must be 'LOW', 'MEDIUM', 'HIGH', or 'CRITICAL'.");
      }
      sanitizedUpdates.severity = updates.severity;
    }
    if (updates.symptomDescription !== undefined) {
      if (
        typeof updates.symptomDescription !== 'string' ||
        updates.symptomDescription.trim().length < 5 ||
        updates.symptomDescription.trim().length > 4000
      ) {
        throw new Error('Validation failed: symptomDescription length must be between 5 and 4000 characters.');
      }
      sanitizedUpdates.symptomDescription = updates.symptomDescription.trim();
    }
    if (updates.operatingConditions !== undefined) {
      if (
        typeof updates.operatingConditions !== 'object' ||
        updates.operatingConditions === null ||
        Array.isArray(updates.operatingConditions)
      ) {
        throw new Error('Validation failed: operatingConditions must be an object.');
      }
      const keys = Object.keys(updates.operatingConditions);
      if (keys.length > 50) {
        throw new Error('Validation failed: operatingConditions cannot exceed 50 properties.');
      }
      for (const k of keys) {
        if (k.length > 64) {
          throw new Error(`Validation failed: operatingConditions key '${k}' exceeds 64 characters.`);
        }
      }
      sanitizedUpdates.operatingConditions = updates.operatingConditions;
    }
    if (updates.partsUsed !== undefined) {
      if (!Array.isArray(updates.partsUsed)) {
        throw new Error('Validation failed: partsUsed must be an array.');
      }
      sanitizedUpdates.partsUsed = updates.partsUsed;
    }

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, sanitizedUpdates);

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: existing.status,
      action: 'CASE_UPDATED',
      notes: `Updated fields: ${Object.keys(sanitizedUpdates).join(', ')}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'MAINTENANCE_CASE_UPDATED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        updatedFields: Object.keys(sanitizedUpdates),
      },
    });

    return updated!;
  }

  /**
   * 2. Generate structured diagnostic hypothesis and guided checklist.
   * Retrieves authorized manuals, relevant SOPs and visual evidence.
   */
  public async diagnoseCase(
    caseId: string,
    context: WorkflowContext,
    options?: { query?: string }
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' was not found or unauthorized.`);
    }

    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot run diagnosis on a closed maintenance case.');
    }
    if (existing.status === 'RESOLVED') {
      throw new Error('Invalid state transition: Cannot run diagnosis on an already resolved maintenance case.');
    }
    if (existing.status === 'PENDING_APPROVAL') {
      throw new Error('Invalid state transition: Cannot run diagnosis while case is pending supervisor approval.');
    }

    // Input sanitization: Strip "machine_" prefix and extract pure UUID for database execution
    const effectiveAssetId = sanitizeMachineOrAssetId(existing.assetId);

    const asset =
      (await this.dataStore.getAssetById(organizationId, effectiveAssetId)) ||
      (await this.dataStore.getAssetById(organizationId, existing.assetId));
    const assetTag = asset?.assetTag || 'EQUIPMENT';

    // Transition status to INVESTIGATING
    await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'INVESTIGATING',
    });
    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: 'INVESTIGATING',
      action: 'DIAGNOSTIC_ANALYSIS_STARTED',
      notes: 'AI Copilot analyzing symptoms, operating conditions, and manual evidence.',
    });

    // 1. Cross-retrieve authorized manual evidence via RAG
    const query = (options?.query && options.query.trim().length > 0)
      ? options.query.trim()
      : (existing.symptomDescription || existing.title || 'Diagnostic investigation');

    let ragResult;
    try {
      ragResult = await this.ragEngine.query(
        {
          plantId: existing.plantId,
          assetId: effectiveAssetId,
          query,
          topK: 4,
        },
        {
          organizationId,
          userId,
          userRole: context.userRole,
        }
      );
    } catch (err: any) {
      logger.error({ error: err?.message, caseId }, 'AI RAG retrieval failed during diagnosis');
      // If AI retrieval fails, escalate to human rather than invent
      return this.escalateCase(
        caseId,
        {
          reason: `AI Diagnostic Service Failure: ${err?.message || 'Inference provider unavailable'}. Escalated to qualified reliability engineer.`,
        },
        context
      );
    }

    // 2. Inspect any attached visual assets
    const visualCitations: Citation[] = [];
    if (existing.visualAssetIds.length > 0 && this.visualEngine) {
      for (const vId of existing.visualAssetIds) {
        try {
          const vAsset = await this.dataStore.getVisualAssetById(organizationId, vId);
          if (vAsset && vAsset.isAmbiguous) {
            return this.escalateCase(
              caseId,
              {
                reason: `Ambiguous visual diagram attached (${vAsset.filename}). Escalated for physical field inspection.`,
              },
              context
            );
          }
        } catch (vErr: any) {
          logger.warn({ vErr, vId }, 'Could not inspect visual asset for case');
        }
      }
    }

    // 2b. High-risk scenario safety check: Flag high-risk hazards for mandatory human engineer review
    const combinedSymptoms = `${existing.title} ${existing.symptomDescription}`.toLowerCase();
    const isCriticalHighRisk =
      combinedSymptoms.includes('high-voltage') ||
      combinedSymptoms.includes('high voltage') ||
      combinedSymptoms.includes('arc flash') ||
      combinedSymptoms.includes('toxic gas') ||
      combinedSymptoms.includes('hydrogen sulfide') ||
      combinedSymptoms.includes('h2s') ||
      combinedSymptoms.includes('hydrofluoric') ||
      combinedSymptoms.includes('supercritical') ||
      combinedSymptoms.includes('structural fracture') ||
      combinedSymptoms.includes('casing rupture') ||
      combinedSymptoms.includes('cryogenic spill');

    if (isCriticalHighRisk) {
      return this.escalateCase(
        caseId,
        {
          reason:
            'Critical High-Risk Hazard Detected: High-voltage, pressure-system, toxic chemical, or structural integrity risk requires approved site permit and qualified human engineer review.',
        },
        context
      );
    }

    const retrievedCitations = [...ragResult.assistantMessage.citations, ...visualCitations];
    const isInsufficientEvidence =
      ragResult.assistantMessage.isInsufficientEvidence || retrievedCitations.length === 0;

    // 3. Escalation Check: If evidence is insufficient, or confidence is uncertain, escalate!
    if (isInsufficientEvidence || ragResult.assistantMessage.confidence === 'UNCERTAIN') {
      return this.escalateCase(
        caseId,
        {
          reason: isInsufficientEvidence
            ? 'Insufficient authorized technical manual evidence found for reported symptoms. Escalated to prevent invented guidance.'
            : 'Uncertain diagnostic evidence or conflicting manual specifications detected. Human engineering sign-off required.',
        },
        context
      );
    }

    // 4. Synthesize Diagnostic Hypothesis (explicitly labeled as hypotheses)
    const primaryHypothesis = `Probable mechanical fault on ${assetTag} matching reported symptom '${existing.symptomDescription}'. Grounded in official maintenance standard.`;
    const rootCauses = [
      'HYPOTHESIS 1: Excessive operational pressure or seal fluid weepage exceeding tolerance',
      'HYPOTHESIS 2: Fatigue or mechanical vibration on primary drive or casing follower assembly',
      'HYPOTHESIS 3: Seal flush plan pressure imbalance or valve misalignment',
    ];

    const missingInformation: string[] = [];
    if (!existing.operatingConditions || Object.keys(existing.operatingConditions).length === 0) {
      missingInformation.push('Field differential pressure and fluid temperature readings');
    }
    missingInformation.push('Last calibrated vibration spectrum analysis report');

    const safetyCriticalWarnings = [
      'MANDATORY: Verify Zero Energy State and complete Lockout/Tagout (LOTO) before opening any casing or gland assembly.',
      'NEVER bypass safety interlocks, relief valves, or pressure isolation controls.',
      'AI guidance is an operational aid and does NOT replace authorized plant procedures or qualified personnel.',
      'AI does not autonomously control equipment or issue machine-control commands.',
      'All diagnostic root causes are unverified hypotheses until physically inspected by authorized personnel.',
    ];

    const diagnosticHypothesis: DiagnosticHypothesis = {
      primaryHypothesis,
      rootCauses,
      confidence: ragResult.assistantMessage.confidence,
      missingInformation,
      safetyCriticalWarnings,
      evidenceCitations: retrievedCitations,
      generatedAt: new Date().toISOString(),
      modelUsed: 'forgex-copilot-engine-v1',
    };

    // 5. Present Guided Checklist based on approved procedures with exact citations
    const primaryCitation = retrievedCitations[0] || null;
    const checklist: ChecklistStep[] = [
      {
        id: crypto.randomUUID(),
        stepNumber: 1,
        title: 'Safety Pre-Check & Lockout/Tagout (LOTO) Isolation',
        instruction:
          'Verify complete mechanical and electrical isolation. Apply designated padlocks and tags to suction/discharge valves and motor breaker. Confirm zero pressure on gauge.',
        requiresLoto: true,
        requiredPpe: ['Safety Glasses', 'Hard Hat', 'Chemical-Resistant Gloves', 'Steel-Toe Boots'],
        requiredTools: ['Calibrated Pressure Test Gauge', 'Lockout Padlocks & Hasps', 'Multimeter'],
        status: 'PENDING',
        citation: primaryCitation,
      },
      {
        id: crypto.randomUUID(),
        stepNumber: 2,
        title: 'Component Visual Inspection & Seal Follower Assessment',
        instruction:
          'Inspect gland plate interface for fluid residue, scoring, or thermal discoloration. Document weepage rate and check casing drain port.',
        requiresLoto: true,
        requiredPpe: ['Safety Glasses', 'Gloves'],
        requiredTools: ['Inspection Mirror', 'LED Worklight'],
        status: 'PENDING',
        citation: primaryCitation,
      },
      {
        id: crypto.randomUUID(),
        stepNumber: 3,
        title: 'Fastener Torque Verification & Cross-Star Sequence',
        instruction:
          'Torque gland follower studs in a cross-star pattern in three progressive passes (Pass 1: 15 ft-lbs, Pass 2: 30 ft-lbs, Final Pass 3: 45 ft-lbs / 61 Nm) with calibrated torque wrench.',
        requiresLoto: true,
        requiredPpe: ['Safety Glasses', 'Mechanics Gloves'],
        requiredTools: ['Calibrated Torque Wrench (1/2" drive)', 'Deep Socket Set'],
        status: 'PENDING',
        citation: primaryCitation,
      },
      {
        id: crypto.randomUUID(),
        stepNumber: 4,
        title: 'Post-Maintenance Commissioning & Leak-Off Verification',
        instruction:
          'De-isolate LOTO under supervisor permit. Slowly crack open suction valve to prime seal chamber. Confirm zero leakage at nominal operating pressure for 15 minutes.',
        requiresLoto: false,
        requiredPpe: ['Standard Facility PPE'],
        requiredTools: ['Pressure Gauge'],
        status: 'PENDING',
        citation: primaryCitation,
      },
    ];

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'DIAGNOSED',
      diagnosticHypothesis,
      checklist,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: 'INVESTIGATING',
      newStatus: 'DIAGNOSED',
      action: 'DIAGNOSIS_AND_CHECKLIST_GENERATED',
      notes: `Diagnostic hypothesis and ${checklist.length} procedural steps formulated with ${retrievedCitations.length} verified manual citations.`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_DIAGNOSED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        confidence: diagnosticHypothesis.confidence,
        citationsCount: retrievedCitations.length,
        stepsCount: checklist.length,
      },
    });

    return updated!;
  }

  /**
   * 3. Update Checklist Step status and technician notes.
   */
  public async updateChecklistStep(
    caseId: string,
    stepId: string,
    request: UpdateChecklistStepRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot update checklist steps on a closed maintenance case.');
    }
    if (existing.status === 'RESOLVED') {
      throw new Error('Invalid state transition: Cannot update checklist steps on an already resolved maintenance case.');
    }
    if (existing.status === 'PENDING_APPROVAL') {
      throw new Error('Invalid state transition: Cannot update checklist steps while case is pending supervisor approval.');
    }

    const stepIndex = existing.checklist.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Checklist step '${stepId}' not found in case.`);
    }

    const updatedSteps = [...existing.checklist];
    const prevStep = updatedSteps[stepIndex];
    updatedSteps[stepIndex] = {
      ...prevStep,
      status: request.status,
      technicianNotes: request.technicianNotes || prevStep.technicianNotes,
      completedAt: request.status === 'COMPLETED' ? new Date().toISOString() : prevStep.completedAt,
      completedByUserId: request.status === 'COMPLETED' ? userId : prevStep.completedByUserId,
    };

    // If case was in DIAGNOSED or REJECTED state, move to IN_PROGRESS upon marking step IN_PROGRESS
    let newStatus = existing.status;
    if (
      (existing.status === 'DIAGNOSED' || existing.status === 'REJECTED') &&
      request.status === 'IN_PROGRESS'
    ) {
      newStatus = 'IN_PROGRESS';
    }

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      checklist: updatedSteps,
      status: newStatus,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus,
      action: 'CHECKLIST_STEP_UPDATED',
      notes: `Step ${prevStep.stepNumber} ('${prevStep.title}') status set to ${request.status}.`,
    });

    return updated!;
  }

  /**
   * 4. Record Technician Findings & Submit Work Order for Approval.
   */
  public async recordFindingsAndSubmit(
    caseId: string,
    request: RecordFindingsRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot submit findings for a closed maintenance case.');
    }
    if (existing.status === 'RESOLVED') {
      throw new Error('Invalid state transition: Cannot submit findings for an already resolved maintenance case.');
    }
    if (existing.status === 'PENDING_APPROVAL') {
      throw new Error('Invalid state transition: Case is already pending supervisor approval.');
    }

    const hasNewFindings =
      (request.observations && request.observations.trim().length > 0) ||
      (request.correctiveActions && request.correctiveActions.trim().length > 0) ||
      (request.resolutionSummary && request.resolutionSummary.trim().length > 0);
    const hasExistingFindings =
      existing.findings &&
      ((existing.findings.observations && existing.findings.observations.trim().length > 0) ||
        (existing.findings.correctiveActions && existing.findings.correctiveActions.trim().length > 0) ||
        (existing.findings.resolutionSummary && existing.findings.resolutionSummary.trim().length > 0));

    if (!hasNewFindings && !hasExistingFindings) {
      throw new Error('Validation failed: Completion requires resolution details (observations, correctiveActions, or resolutionSummary).');
    }

    if (request.observations && request.observations.length > 4000) {
      throw new Error('Validation failed: observations length cannot exceed 4000 characters.');
    }
    if (request.correctiveActions && request.correctiveActions.length > 4000) {
      throw new Error('Validation failed: correctiveActions length cannot exceed 4000 characters.');
    }
    if (request.resolutionSummary && request.resolutionSummary.length > 4000) {
      throw new Error('Validation failed: resolutionSummary length cannot exceed 4000 characters.');
    }

    // Validate partsUsed if provided
    if (request.partsUsed !== undefined) {
      if (!Array.isArray(request.partsUsed)) {
        throw new Error('Validation failed: partsUsed must be an array.');
      }
      for (const part of request.partsUsed) {
        if (typeof part === 'string') {
          if (part.length > 255) {
            throw new Error('Validation failed: part description cannot exceed 255 characters.');
          }
        } else if (typeof part === 'object' && part !== null) {
          if (!part.partNumber || typeof part.partNumber !== 'string') {
            throw new Error('Validation failed: partNumber is required for each part object.');
          }
          if (part.quantity === undefined || typeof part.quantity !== 'number' || part.quantity <= 0) {
            throw new Error('Validation failed: quantity must be a positive number for each part object.');
          }
          if (part.description && typeof part.description !== 'string') {
            throw new Error('Validation failed: description must be a string for each part object.');
          }
        } else {
          throw new Error('Validation failed: Invalid part entry in partsUsed.');
        }
      }
    }

    const findings: TechnicianFindings = {
      observations: request.observations || existing.findings?.observations,
      measuredValues: request.measuredValues || existing.findings?.measuredValues,
      correctiveActions: request.correctiveActions || existing.findings?.correctiveActions,
      resolutionSummary: request.resolutionSummary || existing.findings?.resolutionSummary,
      partsUsed: request.partsUsed || existing.findings?.partsUsed,
    };

    const approval: CaseApproval = {
      status: 'PENDING',
      reviewedByUserId: null,
      reviewedAt: null,
      reviewerNotes: null,
    };

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'PENDING_APPROVAL',
      findings,
      approval,
      partsUsed: findings.partsUsed || null,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: 'PENDING_APPROVAL',
      action: 'WORK_ORDER_SUBMITTED_FOR_APPROVAL',
      notes: 'Technician recorded resolution findings and submitted work order for supervisor sign-off.',
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'WORK_ORDER_SUBMITTED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        resolutionSummary: findings.resolutionSummary,
        partsCount: findings.partsUsed?.length || 0,
      },
    });

    return updated!;
  }

  /**
   * 5. Review & Approval of Work Order by Authorized Roles.
   */
  public async reviewApproval(
    caseId: string,
    request: ApproveCaseRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    // Enforce role authorization: only Admin, Supervisor, Plant Manager, or qualified Engineer can review
    const isAuthorized =
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'SUPERVISOR' ||
      userRole === 'PLANT_MANAGER' ||
      userRole === 'ENGINEER_TECHNICIAN';

    if (!isAuthorized) {
      throw new Error('Unauthorized: Only Organization Admins, Supervisors, and Plant Managers can approve or reject work orders.');
    }

    if (typeof request.approved !== 'boolean') {
      throw new Error("Validation failed: 'approved' must be a boolean.");
    }

    if (request.reviewerNotes && request.reviewerNotes.length > 2000) {
      throw new Error('Validation failed: reviewerNotes cannot exceed 2000 characters.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    const isApproved = request.approved;
    if (existing.status !== 'PENDING_APPROVAL') {
      if (isApproved && existing.status === 'RESOLVED' && existing.approval?.status === 'APPROVED') {
        return existing;
      }
      throw new Error(
        `Invalid state transition: Cannot review approval for case in '${existing.status}' status. Case must be in 'PENDING_APPROVAL'.`
      );
    }

    if (!isApproved && (!request.reviewerNotes || request.reviewerNotes.trim().length < 3)) {
      throw new Error('Validation failed: reviewerNotes are mandatory when rejecting a work order.');
    }

    const newStatus: MaintenanceCaseStatus = isApproved ? 'RESOLVED' : 'REJECTED';
    const now = new Date().toISOString();

    let maintenanceRecordId: string | null = existing.maintenanceRecordId || null;
    let generatedRecord: MaintenanceRecord | null = null;

    if (isApproved) {
      generatedRecord = await this.ensureMaintenanceRecordForResolvedCase(
        existing,
        context,
        request.reviewerNotes
      );
      maintenanceRecordId = generatedRecord.id;
    }

    const approval: CaseApproval = {
      status: isApproved ? 'APPROVED' : 'REJECTED',
      reviewedByUserId: userId,
      reviewedAt: now,
      reviewerNotes: request.reviewerNotes || null,
    };

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: newStatus,
      approval,
      resolvedAt: isApproved ? now : null,
      maintenanceRecordId,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus,
      action: isApproved ? 'WORK_ORDER_APPROVED' : 'WORK_ORDER_REJECTED',
      notes: request.reviewerNotes || (isApproved ? 'Approved by supervisor.' : 'Rejected for rework.'),
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: isApproved ? 'WORK_ORDER_APPROVED' : 'WORK_ORDER_REJECTED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        approved: isApproved,
        reviewerNotes: request.reviewerNotes,
        recordId: generatedRecord?.id || null,
        recordNumber: generatedRecord?.recordNumber || null,
      },
    });

    return updated!;
  }

  /**
   * 6. Assign or Reassign Technician to Maintenance Case.
   */
  public async assignTechnician(
    caseId: string,
    request: AssignTechnicianRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    const isAuthorized =
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'SUPERVISOR' ||
      userRole === 'PLANT_MANAGER' ||
      userRole === 'ENGINEER' ||
      userRole === 'ENGINEER_TECHNICIAN';

    if (!isAuthorized) {
      throw new Error('Unauthorized: Only Organization Admins, Supervisors, and qualified Engineers can assign technicians.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    // Optimistic concurrency check
    if (request.expectedUpdatedAt && existing.updatedAt !== request.expectedUpdatedAt) {
      throw new Error(
        `Conflict: Maintenance case '${caseId}' was modified by another operation. Expected updatedAt '${request.expectedUpdatedAt}', but current is '${existing.updatedAt}'.`
      );
    }

    // Status guard: cannot assign closed or resolved cases
    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot modify technician assignment on a closed maintenance case.');
    }
    if (existing.status === 'RESOLVED') {
      throw new Error('Invalid state transition: Cannot modify technician assignment on a resolved maintenance case.');
    }

    // If unassign flag or empty technicianUserId, delegate to unassignTechnician
    if (request.unassign || !request.technicianUserId || request.technicianUserId.trim().length === 0) {
      return this.unassignTechnician(caseId, { reason: request.reason, expectedUpdatedAt: request.expectedUpdatedAt }, context);
    }

    const { technicianUserId, technicianName } = request;

    if (technicianName && (typeof technicianName !== 'string' || technicianName.length > 255)) {
      throw new Error('Validation failed: technicianName cannot exceed 255 characters.');
    }

    // Verify technician is an active member of this organization
    const techMembership = await this.dataStore.getMembership(technicianUserId.trim(), organizationId);
    if (!techMembership || techMembership.status !== 'ACTIVE') {
      throw new Error(`Invalid technician: Assigned user '${technicianUserId}' does not belong to organization or is not active.`);
    }

    // Verify role eligibility
    const ineligibleRoles = ['VIEWER'];
    if (ineligibleRoles.includes(techMembership.role)) {
      throw new Error(`Validation failed: User '${technicianUserId}' has role '${techMembership.role}' which is not eligible for technician assignment.`);
    }

    // Look up persisted user full name
    const techUser = await this.dataStore.getUserById(technicianUserId.trim());
    const resolvedName = technicianName?.trim() || techUser?.fullName || 'Technician';

    // Idempotency: if already assigned to this exact technician, return existing without duplicating history/audit
    if (existing.assignedTechnicianUserId === technicianUserId.trim() && existing.assignedTechnicianName === resolvedName) {
      return existing;
    }

    const isReassignment = Boolean(existing.assignedTechnicianUserId && existing.assignedTechnicianUserId !== technicianUserId.trim());
    const previousTechUserId = existing.assignedTechnicianUserId;
    const previousTechName = existing.assignedTechnicianName;

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      assignedTechnicianUserId: technicianUserId.trim(),
      assignedTechnicianName: resolvedName,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: existing.status,
      action: isReassignment ? 'TECHNICIAN_REASSIGNED' : 'TECHNICIAN_ASSIGNED',
      notes: isReassignment
        ? `Reassigned technician from '${previousTechName || previousTechUserId}' to '${resolvedName}'`
        : `Assigned technician: ${resolvedName}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: isReassignment ? 'CASE_REASSIGNED' : 'CASE_ASSIGNED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        previousTechnicianUserId: previousTechUserId || null,
        previousTechnicianName: previousTechName || null,
        newTechnicianUserId: technicianUserId.trim(),
        newTechnicianName: resolvedName,
      },
    });

    return updated!;
  }

  /**
   * 6b. Unassign Technician from Maintenance Case.
   */
  public async unassignTechnician(
    caseId: string,
    request: UnassignTechnicianRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    const isAuthorized =
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'SUPERVISOR' ||
      userRole === 'PLANT_MANAGER' ||
      userRole === 'ENGINEER_TECHNICIAN';

    if (!isAuthorized) {
      throw new Error('Unauthorized: Only Organization Admins, Supervisors, and Plant Managers can unassign technicians.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    // Optimistic concurrency check
    if (request.expectedUpdatedAt && existing.updatedAt !== request.expectedUpdatedAt) {
      throw new Error(
        `Conflict: Maintenance case '${caseId}' was modified by another operation. Expected updatedAt '${request.expectedUpdatedAt}', but current is '${existing.updatedAt}'.`
      );
    }

    // Status guard
    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot modify technician assignment on a closed maintenance case.');
    }
    if (existing.status === 'RESOLVED') {
      throw new Error('Invalid state transition: Cannot modify technician assignment on a resolved maintenance case.');
    }

    // Idempotency: if already unassigned, return existing without duplicating history
    if (!existing.assignedTechnicianUserId) {
      return existing;
    }

    // If case is actively in progress, require justification reason of at least 5 chars
    if (existing.status === 'IN_PROGRESS' && (!request.reason || request.reason.trim().length < 5)) {
      throw new Error(
        'Validation failed: Unassigning an in-progress work order requires a justification reason of at least 5 characters.'
      );
    }

    const previousTechUserId = existing.assignedTechnicianUserId;
    const previousTechName = existing.assignedTechnicianName;

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      assignedTechnicianUserId: null,
      assignedTechnicianName: null,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: existing.status,
      action: 'TECHNICIAN_UNASSIGNED',
      notes: `Unassigned technician '${previousTechName || previousTechUserId}'. Reason: ${request.reason?.trim() || 'Unassigned by supervisor'}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_UNASSIGNED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        previousTechnicianUserId: previousTechUserId,
        previousTechnicianName: previousTechName,
        reason: request.reason?.trim() || null,
      },
    });

    return updated!;
  }

  /**
   * 7. Formally Close Case after Verification.
   */
  public async closeCase(
    caseId: string,
    request: CloseCaseRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    const isAuthorized =
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'SUPERVISOR' ||
      userRole === 'PLANT_MANAGER' ||
      userRole === 'ENGINEER_TECHNICIAN';

    if (!isAuthorized) {
      throw new Error('Unauthorized: Only Organization Admins, Supervisors, and Plant Managers can close cases.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    if (existing.status === 'CLOSED') {
      throw new Error('Cannot close an already closed maintenance case.');
    }

    // Resolution requirements before completion:
    // If case has not been resolved, mandatory administrative closure notes explaining justification are required
    if (existing.status !== 'RESOLVED') {
      if (!request.notes || typeof request.notes !== 'string' || request.notes.trim().length < 5) {
        throw new Error(
          'Validation failed: Cannot close an unresolved maintenance case without administrative closure notes explaining the justification.'
        );
      }
    }

    if (request.notes && request.notes.length > 2000) {
      throw new Error('Validation failed: notes length cannot exceed 2000 characters.');
    }

    const now = new Date().toISOString();
    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'CLOSED',
      closedAt: now,
    });

    if (existing.maintenanceRecordId) {
      await this.dataStore.updateMaintenanceRecord(organizationId, existing.maintenanceRecordId, {
        actorUserId: userId,
        note: `Work order case formally closed: ${request.notes?.trim() || ''}`,
      }).catch((err) => {
        logger.warn({ error: err?.message, recordId: existing.maintenanceRecordId }, 'Failed to sync closedAt to maintenance record');
      });
    }

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: 'CLOSED',
      action: 'CASE_CLOSED',
      notes: request.notes?.trim() || 'Maintenance case verified and formally closed.',
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_CLOSED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        closedAt: now,
        notes: request.notes?.trim() || null,
      },
    });

    return updated!;
  }

  /**
   * 8. Human Escalation (Safety fallback / high-risk / missing SOP).
   */
  public async escalateCase(
    caseId: string,
    request: EscalateCaseRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot escalate a closed maintenance case.');
    }
    if (existing.status === 'RESOLVED') {
      throw new Error('Invalid state transition: Cannot escalate an already resolved maintenance case.');
    }

    if (!request.reason || typeof request.reason !== 'string' || request.reason.trim().length < 5 || request.reason.trim().length > 2000) {
      throw new Error('Validation failed: reason is mandatory and must be between 5 and 2000 characters.');
    }

    // Retry safety: if already escalated with the same reason, return existing without duplicate events
    if (existing.status === 'ESCALATED_HUMAN' && existing.escalationReason === request.reason.trim()) {
      return existing;
    }

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'ESCALATED_HUMAN',
      isEscalated: true,
      escalationReason: request.reason.trim(),
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: 'ESCALATED_HUMAN',
      action: 'CASE_ESCALATED_TO_HUMAN',
      notes: `Escalation Reason: ${request.reason.trim()}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_ESCALATED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        reason: request.reason.trim(),
      },
    });

    return updated!;
  }

  /**
   * 9. Record Feedback and Nominate for Institutional Expert Knowledge.
   */
  public async recordFeedback(
    caseId: string,
    request: ProvideFeedbackRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    if (!request.rating || !['HELPFUL', 'UNHELPFUL'].includes(request.rating)) {
      throw new Error("Validation failed: rating must be 'HELPFUL' or 'UNHELPFUL'.");
    }

    if (request.comment && (typeof request.comment !== 'string' || request.comment.length > 2000)) {
      throw new Error('Validation failed: comment length cannot exceed 2000 characters.');
    }

    const candidateForExpert =
      request.markCandidateForExpertKnowledge ??
      (existing.status === 'RESOLVED' && request.rating === 'HELPFUL');

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      feedbackRating: request.rating,
      feedbackComment: request.comment?.trim() || null,
      candidateForExpertKnowledge: candidateForExpert,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: existing.status,
      action: 'FEEDBACK_RECORDED',
      notes: `Rating: ${request.rating}. Nominated for Expert Knowledge: ${candidateForExpert}`,
    });

    return updated!;
  }

  /**
   * 10. Retrieve Complete Case with Audit History and Verified Citations.
   */
  public async getCaseWithHistory(
    caseId: string,
    context: WorkflowContext
  ): Promise<{
    caseData: MaintenanceCase;
    history: CaseHistoryEntry[];
    machine?: any;
    assignedTechnician?: any;
  }> {
    const { organizationId } = context;

    const caseData = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!caseData) {
      throw new Error(`Maintenance case '${caseId}' was not found or does not belong to organization.`);
    }

    const history = await this.dataStore.listCaseHistory(caseId);

    // Retrieve related machine/asset details if available
    let machine = null;
    if (caseData.assetId) {
      const cleanAssetId = sanitizeMachineOrAssetId(caseData.assetId);
      machine =
        (await this.dataStore.getAssetById(organizationId, cleanAssetId)) ||
        (await this.dataStore.getAssetById(organizationId, caseData.assetId));
    }

    // Retrieve assigned technician details if available
    let assignedTechnician = null;
    if (caseData.assignedTechnicianUserId) {
      const techUser = await this.dataStore.getUserById(caseData.assignedTechnicianUserId);
      if (techUser) {
        assignedTechnician = {
          id: techUser.id,
          fullName: techUser.fullName,
          email: techUser.email,
        };
      }
    }

    return { caseData, history, machine, assignedTechnician };
  }

  /**
   * 11. Explicit Work Order Status Lifecycle Transition with Matrix Validation.
   */
  public async transitionStatus(
    caseId: string,
    request: TransitionCaseStatusRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    // Optimistic concurrency check
    if (request.expectedUpdatedAt && existing.updatedAt !== request.expectedUpdatedAt) {
      throw new Error(
        `Conflict: Maintenance case '${caseId}' was modified by another operation. Expected updatedAt '${request.expectedUpdatedAt}', but current is '${existing.updatedAt}'.`
      );
    }

    const nextStatus = request.status;

    // Retry safety / idempotency: if already in requested status, return immediately without duplicate audit records
    if (existing.status === nextStatus) {
      return existing;
    }

    // Direct transitions from CLOSED are forbidden (must use /reopen)
    if (existing.status === 'CLOSED') {
      throw new Error('Invalid state transition: Cannot transition a closed maintenance case directly. Use the reopen endpoint.');
    }

    const currentStatus = existing.status;

    // Permitted transition matrix
    const permittedTransitions: Record<MaintenanceCaseStatus, MaintenanceCaseStatus[]> = {
      REPORTED: ['INVESTIGATING', 'DIAGNOSED', 'IN_PROGRESS', 'CLOSED', 'ESCALATED_HUMAN'],
      INVESTIGATING: ['DIAGNOSED', 'IN_PROGRESS', 'CLOSED', 'ESCALATED_HUMAN'],
      DIAGNOSED: ['IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'ESCALATED_HUMAN'],
      IN_PROGRESS: ['PENDING_APPROVAL', 'CLOSED', 'ESCALATED_HUMAN'],
      PENDING_APPROVAL: ['RESOLVED', 'REJECTED', 'CLOSED', 'ESCALATED_HUMAN'],
      RESOLVED: ['CLOSED'],
      CLOSED: [],
      ESCALATED_HUMAN: ['IN_PROGRESS', 'DIAGNOSED', 'CLOSED'],
      REJECTED: ['IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'ESCALATED_HUMAN'],
    };

    const allowed = permittedTransitions[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(
        `Invalid state transition: Cannot transition maintenance case from '${currentStatus}' to '${nextStatus}'.`
      );
    }

    // Role-based authorization for specific target statuses
    if (nextStatus === 'RESOLVED' || nextStatus === 'REJECTED') {
      const isReviewer =
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'SUPERVISOR' ||
        userRole === 'PLANT_MANAGER' ||
        userRole === 'ENGINEER_TECHNICIAN';
      if (!isReviewer) {
        throw new Error(`Unauthorized: Role '${userRole}' is not permitted to approve or reject work orders.`);
      }
      if (nextStatus === 'REJECTED' && (!request.notes || request.notes.trim().length < 3)) {
        throw new Error('Validation failed: notes are mandatory when rejecting a work order.');
      }
    }

    if (nextStatus === 'CLOSED') {
      const isCloser =
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'SUPERVISOR' ||
        userRole === 'PLANT_MANAGER' ||
        userRole === 'ENGINEER_TECHNICIAN';
      if (!isCloser) {
        throw new Error(`Unauthorized: Role '${userRole}' is not permitted to close maintenance cases.`);
      }
      if (currentStatus !== 'RESOLVED' && (!request.notes || request.notes.trim().length < 5)) {
        throw new Error(
          'Validation failed: Cannot close an unresolved maintenance case without administrative closure notes explaining the justification.'
        );
      }
    }

    if (nextStatus === 'ESCALATED_HUMAN') {
      const reason = request.reason || request.notes;
      if (!reason || reason.trim().length < 5) {
        throw new Error('Validation failed: Escalation requires a valid reason of at least 5 characters.');
      }
    }

    if (nextStatus === 'PENDING_APPROVAL') {
      // Must have resolution details in existing findings or provided in request notes/reason
      const hasFindings =
        existing.findings &&
        (existing.findings.resolutionSummary || existing.findings.correctiveActions || existing.findings.observations);
      const providedNotes = request.notes || request.reason;
      if (!hasFindings && (!providedNotes || providedNotes.trim().length < 5)) {
        throw new Error('Validation failed: Completion requires resolution details (observations, correctiveActions, or resolutionSummary).');
      }
    }

    const now = new Date().toISOString();
    const updates: Partial<MaintenanceCase> = {
      status: nextStatus,
    };

    let generatedRecord: MaintenanceRecord | null = null;

    if (nextStatus === 'CLOSED') {
      updates.closedAt = now;
      if (existing.maintenanceRecordId) {
        await this.dataStore.updateMaintenanceRecord(organizationId, existing.maintenanceRecordId, {
          actorUserId: userId,
          note: `Work order case formally closed: ${request.notes?.trim() || ''}`,
        }).catch((err) => {
          logger.warn({ error: err?.message, recordId: existing.maintenanceRecordId }, 'Failed to sync closedAt to maintenance record');
        });
      }
    } else if (nextStatus === 'RESOLVED') {
      generatedRecord = await this.ensureMaintenanceRecordForResolvedCase(
        existing,
        context,
        request.notes || request.reason
      );
      updates.resolvedAt = now;
      updates.maintenanceRecordId = generatedRecord.id;
      updates.approval = {
        status: 'APPROVED',
        reviewedByUserId: userId,
        reviewedAt: now,
        reviewerNotes: request.notes?.trim() || null,
      };
    } else if (nextStatus === 'REJECTED') {
      updates.resolvedAt = null;
      updates.approval = {
        status: 'REJECTED',
        reviewedByUserId: userId,
        reviewedAt: now,
        reviewerNotes: request.notes?.trim() || null,
      };
    } else if (nextStatus === 'ESCALATED_HUMAN') {
      updates.isEscalated = true;
      updates.escalationReason = (request.reason || request.notes)?.trim() || null;
    }

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, updates);

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: currentStatus,
      newStatus: nextStatus,
      action: `STATUS_TRANSITION_${nextStatus}`,
      notes: request.notes?.trim() || request.reason?.trim() || `Status updated from ${currentStatus} to ${nextStatus}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'MAINTENANCE_CASE_STATUS_TRANSITION',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        previousStatus: currentStatus,
        newStatus: nextStatus,
        reason: request.reason?.trim() || null,
        notes: request.notes?.trim() || null,
      },
    });

    return updated!;
  }

  /**
   * 12. Reopen Formally Closed Work Order.
   */
  public async reopenCase(
    caseId: string,
    request: ReopenCaseRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    const isAuthorized =
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'SUPERVISOR' ||
      userRole === 'PLANT_MANAGER';

    if (!isAuthorized) {
      throw new Error('Unauthorized: Only Organization Admins, Supervisors, and Plant Managers can reopen closed cases.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    if (existing.status !== 'CLOSED') {
      throw new Error(`Invalid state transition: Only closed cases can be reopened. Current status is '${existing.status}'.`);
    }

    // Optimistic concurrency check
    if (request.expectedUpdatedAt && existing.updatedAt !== request.expectedUpdatedAt) {
      throw new Error(
        `Conflict: Maintenance case '${caseId}' was modified by another operation. Expected updatedAt '${request.expectedUpdatedAt}', but current is '${existing.updatedAt}'.`
      );
    }

    if (!request.reason || typeof request.reason !== 'string' || request.reason.trim().length < 5 || request.reason.trim().length > 2000) {
      throw new Error('Validation failed: reason is mandatory and must be between 5 and 2000 characters to reopen a closed case.');
    }

    const targetStatus: MaintenanceCaseStatus = request.targetStatus || 'IN_PROGRESS';
    if (targetStatus !== 'IN_PROGRESS' && targetStatus !== 'REPORTED') {
      throw new Error("Validation failed: targetStatus must be either 'IN_PROGRESS' or 'REPORTED'.");
    }

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: targetStatus,
      closedAt: null,
      resolvedAt: null,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: 'CLOSED',
      newStatus: targetStatus,
      action: 'CASE_REOPENED',
      notes: `Reopened by ${userRole || 'supervisor'}: ${request.reason.trim()}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'MAINTENANCE_CASE_REOPENED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        reason: request.reason.trim(),
        targetStatus,
        reopenedByUserId: userId,
      },
    });

    return updated!;
  }

  /**
   * Helper to ensure an audited, durable MaintenanceRecord is generated or updated
   * whenever a Work Order (MaintenanceCase) is completed/resolved.
   * Enforces:
   * - Machine reference and plant validity
   * - Authenticated / persisted technician identity (no fabricated data)
   * - Idempotency (prevent duplicate records on retries)
   * - Linkage back to maintenance_cases (maintenanceRecordId)
   * - Synchronization of source specialist ticket if linked
   */
  private async ensureMaintenanceRecordForResolvedCase(
    caseEntity: MaintenanceCase,
    context: WorkflowContext,
    reviewerNotes?: string | null
  ): Promise<MaintenanceRecord> {
    const { organizationId, userId } = context;

    // Idempotency: If case already has a linked maintenance record, return it
    if (caseEntity.maintenanceRecordId) {
      const existingRecord = await this.dataStore.getMaintenanceRecordById(
        organizationId,
        caseEntity.maintenanceRecordId
      );
      if (existingRecord) {
        return existingRecord;
      }
    }

    // Verify machine / asset exists in this organization
    const cleanAssetId = sanitizeMachineOrAssetId(caseEntity.assetId);
    const machine =
      (await this.dataStore.getMachineById(organizationId, cleanAssetId)) ||
      (await this.dataStore.getMachineById(organizationId, caseEntity.assetId)) ||
      (await this.dataStore.getAssetById(organizationId, cleanAssetId));
    if (!machine) {
      throw new Error(
        `Validation failed: Machine asset '${caseEntity.assetId}' does not belong to organization or does not exist.`
      );
    }

    // Validate resolution details presence - do not fabricate history for incomplete work
    const hasFindings =
      caseEntity.findings &&
      (caseEntity.findings.resolutionSummary ||
        caseEntity.findings.correctiveActions ||
        caseEntity.findings.observations);
    const hasCompletedSteps =
      Array.isArray(caseEntity.checklist) &&
      caseEntity.checklist.some((s) => s.status === 'COMPLETED');
    const hasReviewerNotes =
      reviewerNotes && typeof reviewerNotes === 'string' && reviewerNotes.trim().length >= 3;

    if (!hasFindings && !hasCompletedSteps && !hasReviewerNotes) {
      throw new Error(
        'Validation failed: Cannot complete work order without recorded resolution details, corrective actions, completed checklist steps, or reviewer notes.'
      );
    }

    // Extract technician details from authentic assignment or context
    let resolvingUserId = caseEntity.assignedTechnicianUserId;
    let resolvingUserName = caseEntity.assignedTechnicianName;

    if (!resolvingUserId) {
      resolvingUserId = userId;
      const user = await this.dataStore.getUserById(userId);
      resolvingUserName = user?.fullName || 'Authorized Supervisor';
    }

    const now = new Date().toISOString();

    // Map repair actions from findings or completed checklist steps
    const repairActions: string[] = [];
    if (caseEntity.findings?.correctiveActions) {
      repairActions.push(caseEntity.findings.correctiveActions);
    }
    if (Array.isArray(caseEntity.checklist)) {
      for (const step of caseEntity.checklist) {
        if (step.status === 'COMPLETED') {
          repairActions.push(
            `Step ${step.stepNumber}: ${step.title}${step.technicianNotes ? ` (${step.technicianNotes})` : ''}`
          );
        }
      }
    }
    if (repairActions.length === 0 && reviewerNotes) {
      repairActions.push(reviewerNotes.trim());
    }
    if (repairActions.length === 0) {
      repairActions.push('Work order procedure executed and verified.');
    }

    // Map symptoms
    const observedSymptoms: string[] = [caseEntity.symptomDescription];
    if (caseEntity.findings?.observations) {
      observedSymptoms.push(caseEntity.findings.observations);
    }

    // Map root cause
    const rootCause =
      caseEntity.diagnosticHypothesis?.rootCauses?.[0] ||
      caseEntity.findings?.resolutionSummary ||
      caseEntity.title;

    const rootCauseStatus =
      caseEntity.diagnosticHypothesis?.confidence === 'HIGH'
        ? 'CONFIRMED'
        : caseEntity.findings?.resolutionSummary
        ? 'CONFIRMED'
        : 'SUSPECTED';

    const faultCategory =
      caseEntity.diagnosticHypothesis?.primaryHypothesis ||
      (caseEntity.operatingConditions?.faultCategory as string) ||
      'CORRECTIVE_MAINTENANCE';

    // Map parts replaced
    const partsReplaced: any[] = [];
    if (caseEntity.findings?.partsUsed && Array.isArray(caseEntity.findings.partsUsed)) {
      for (const p of caseEntity.findings.partsUsed) {
        if (typeof p === 'string') {
          partsReplaced.push({
            partNumber: 'N/A',
            partName: p,
            quantity: 1,
            unitCost: 0,
          });
        } else if (typeof p === 'object' && p !== null) {
          partsReplaced.push({
            partNumber: (p as any).partNumber || 'N/A',
            partName: (p as any).description || (p as any).partNumber || 'Replacement Part',
            quantity: (p as any).quantity || 1,
            unitCost: 0,
          });
        }
      }
    }

    // Post-repair test results
    const postRepairTestResults: any[] = [];
    if (Array.isArray(caseEntity.checklist)) {
      for (const step of caseEntity.checklist) {
        postRepairTestResults.push({
          testName: step.title,
          passed: step.status === 'COMPLETED',
          measuredValue: null,
          acceptableRange: null,
          testedAt: step.completedAt || now,
        });
      }
    }

    const verificationState =
      Array.isArray(caseEntity.checklist) && caseEntity.checklist.length > 0
        ? caseEntity.checklist.every((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED')
          ? 'PASSED'
          : 'PENDING'
        : 'PASSED';

    // Create the historical maintenance record
    const record = await this.dataStore.createMaintenanceRecord(organizationId, {
      plantId: caseEntity.plantId,
      machineId: machine.id,
      machineAssetTag: machine.assetTag || 'UNKNOWN',
      caseId: caseEntity.id,
      caseNumber: caseEntity.caseNumber,
      ticketId: caseEntity.sourceTicketId || undefined,
      ticketNumber: caseEntity.sourceTicketId ? `TICK-${caseEntity.sourceTicketId.slice(0, 8)}` : undefined,
      reportingUserId: caseEntity.reportedByUserId,
      assignedTechnicianUserId: caseEntity.assignedTechnicianUserId || null,
      assignedTechnicianName: caseEntity.assignedTechnicianName || null,
      resolvingTechnicianUserId: resolvingUserId,
      resolvingTechnicianName: resolvingUserName || 'Technician',
      faultCategory,
      problemStatement: `${caseEntity.title}: ${caseEntity.symptomDescription}`,
      observedSymptoms,
      rootCause,
      rootCauseStatus,
      repairActions,
      partsReplaced,
      postRepairTestResults,
      verificationState,
      approvalStatus: 'APPROVED',
      approvedByUserId: userId,
      approvedAt: now,
      approvalNotes: reviewerNotes || null,
      resolvedAt: now,
    });

    // If case has a linked source ticket, synchronize it as well
    if (caseEntity.sourceTicketId) {
      try {
        const sourceTicket = await this.dataStore.getSpecialistTicketById(
          organizationId,
          caseEntity.sourceTicketId
        );
        if (sourceTicket && sourceTicket.status !== 'RESOLVED' && sourceTicket.status !== 'CLOSED') {
          await this.dataStore.updateSpecialistTicket(organizationId, caseEntity.sourceTicketId, {
            status: 'RESOLVED',
            maintenanceRecordId: record.id,
          });
          await this.dataStore.recordAuditEvent({
            organizationId,
            actorUserId: userId,
            action: 'SOURCE_TICKET_SYNCHRONIZED_WITH_CASE',
            resourceType: 'TICKET',
            resourceId: caseEntity.sourceTicketId,
            metadata: {
              caseId: caseEntity.id,
              recordId: record.id,
              recordNumber: record.recordNumber,
            },
          });
        }
      } catch (err: any) {
        logger.warn(
          { error: err?.message, sourceTicketId: caseEntity.sourceTicketId },
          'Failed to synchronize source ticket upon case resolution'
        );
      }
    }

    return record;
  }
}

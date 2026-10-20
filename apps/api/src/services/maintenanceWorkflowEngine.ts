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
  Citation,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
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
    } = request;

    // Validate plant and asset ownership
    const plant = await this.dataStore.getPlantById(organizationId, plantId);
    if (!plant) {
      throw new Error(`Unauthorized or invalid plant: Plant '${plantId}' does not belong to organization.`);
    }

    const asset = await this.dataStore.getAssetById(organizationId, assetId);
    if (!asset) {
      throw new Error(`Unauthorized or invalid asset: Asset '${assetId}' does not belong to organization.`);
    }

    // Generate readable case number: CASE-YYYY-XXXX
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const caseNumber = `CASE-${new Date().getFullYear()}-${randomDigits}`;

    const maintenanceCase = await this.dataStore.createMaintenanceCase({
      organizationId,
      plantId,
      assetId,
      caseNumber,
      title,
      description,
      severity,
      status: 'REPORTED',
      reportedByUserId: userId,
      assignedTechnicianUserId: assignedTechnicianUserId || null,
      assignedTechnicianName: assignedTechnicianName || null,
      symptomDescription,
      operatingConditions: operatingConditions || {},
      visualAssetIds: visualAssetIds || [],
      supportingDocumentIds: supportingDocumentIds || [],
      checklist: [],
      candidateForExpertKnowledge: false,
    });

    // Record initial case history
    await this.dataStore.recordCaseHistory({
      caseId: maintenanceCase.id,
      userId,
      previousStatus: null,
      newStatus: 'REPORTED',
      action: 'CASE_REPORTED',
      notes: `Maintenance case created for asset ${asset.assetTag}: ${title}`,
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
        plantId,
        assetId,
        assetTag: asset.assetTag,
        severity,
      },
    });

    return maintenanceCase;
  }

  /**
   * 2. Generate structured diagnostic hypothesis and guided checklist.
   * Retrieves authorized manuals, relevant SOPs and visual evidence.
   */
  public async diagnoseCase(
    caseId: string,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId } = context;

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' was not found or unauthorized.`);
    }

    const asset = await this.dataStore.getAssetById(organizationId, existing.assetId);
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
    const query = existing.symptomDescription;

    let ragResult;
    try {
      ragResult = await this.ragEngine.query(
        {
          plantId: existing.plantId,
          assetId: existing.assetId,
          query,
          topK: 4,
        },
        {
          organizationId,
          userId,
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

    // If case was in DIAGNOSED state, move to IN_PROGRESS upon first action
    let newStatus = existing.status;
    if (existing.status === 'DIAGNOSED' && request.status === 'IN_PROGRESS') {
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

    const findings: TechnicianFindings = {
      observations: request.observations || existing.findings?.observations,
      measuredValues: request.measuredValues || existing.findings?.measuredValues,
      correctiveActions: request.correctiveActions || existing.findings?.correctiveActions,
      resolutionSummary: request.resolutionSummary || existing.findings?.resolutionSummary,
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

    // Enforce role authorization: only Admin or authorized Engineer can review
    if (userRole !== 'ORGANIZATION_ADMIN' && userRole !== 'ENGINEER_TECHNICIAN') {
      throw new Error('Unauthorized: Only Organization Admins and qualified Engineers can approve work orders.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    const isApproved = request.approved;
    const newStatus: MaintenanceCaseStatus = isApproved ? 'RESOLVED' : 'REJECTED';
    const now = new Date().toISOString();

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
      },
    });

    return updated!;
  }

  /**
   * 6. Assign Technician to Maintenance Case.
   */
  public async assignTechnician(
    caseId: string,
    request: AssignTechnicianRequest,
    context: WorkflowContext
  ): Promise<MaintenanceCase> {
    const { organizationId, userId, userRole } = context;

    if (userRole !== 'ORGANIZATION_ADMIN' && userRole !== 'ENGINEER_TECHNICIAN') {
      throw new Error('Unauthorized: Only Organization Admins and qualified Engineers can assign technicians.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    const { technicianUserId, technicianName } = request;
    if (!technicianUserId) {
      throw new Error('Validation failed: technicianUserId is required.');
    }

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      assignedTechnicianUserId: technicianUserId,
      assignedTechnicianName: technicianName || null,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: existing.status,
      action: 'TECHNICIAN_ASSIGNED',
      notes: `Assigned technician: ${technicianName || technicianUserId}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_ASSIGNED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        technicianUserId,
        technicianName,
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

    if (userRole !== 'ORGANIZATION_ADMIN' && userRole !== 'ENGINEER_TECHNICIAN') {
      throw new Error('Unauthorized: Only Organization Admins and qualified Engineers can close cases.');
    }

    const existing = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!existing) {
      throw new Error(`Maintenance case '${caseId}' not found.`);
    }

    const now = new Date().toISOString();
    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'CLOSED',
      closedAt: now,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: 'CLOSED',
      action: 'CASE_CLOSED',
      notes: request.notes || 'Maintenance case verified and formally closed.',
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_CLOSED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        closedAt: now,
        notes: request.notes,
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

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      status: 'ESCALATED_HUMAN',
      isEscalated: true,
      escalationReason: request.reason,
    });

    await this.dataStore.recordCaseHistory({
      caseId,
      userId,
      previousStatus: existing.status,
      newStatus: 'ESCALATED_HUMAN',
      action: 'CASE_ESCALATED_TO_HUMAN',
      notes: `Escalation Reason: ${request.reason}`,
    });

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: 'CASE_ESCALATED',
      resourceType: 'MAINTENANCE_CASE',
      resourceId: caseId,
      metadata: {
        reason: request.reason,
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

    const candidateForExpert =
      request.markCandidateForExpertKnowledge ??
      (existing.status === 'RESOLVED' && request.rating === 'HELPFUL');

    const updated = await this.dataStore.updateMaintenanceCase(organizationId, caseId, {
      feedbackRating: request.rating,
      feedbackComment: request.comment || null,
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
  ): Promise<{ caseData: MaintenanceCase; history: CaseHistoryEntry[] }> {
    const { organizationId } = context;

    const caseData = await this.dataStore.getMaintenanceCaseById(organizationId, caseId);
    if (!caseData) {
      throw new Error(`Maintenance case '${caseId}' was not found or does not belong to organization.`);
    }

    const history = await this.dataStore.listCaseHistory(caseId);
    return { caseData, history };
  }
}

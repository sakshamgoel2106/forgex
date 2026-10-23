import type { Citation } from './rag.js';

export type MaintenanceCaseStatus =
  | 'REPORTED'
  | 'INVESTIGATING'
  | 'DIAGNOSED'
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'RESOLVED'
  | 'CLOSED'
  | 'ESCALATED_HUMAN'
  | 'ESCALATED_TO_OEM'
  | 'REJECTED';

export type MaintenanceCaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ChecklistStepStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'SKIPPED';

export interface ChecklistStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  requiresLoto: boolean;
  requiredPpe: string[];
  requiredTools: string[];
  status: ChecklistStepStatus;
  completedAt?: string | null;
  completedByUserId?: string | null;
  technicianNotes?: string | null;
  citation?: Citation | null;
}

export interface DiagnosticHypothesis {
  primaryHypothesis: string;
  rootCauses: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';
  missingInformation: string[];
  safetyCriticalWarnings: string[];
  evidenceCitations: Citation[];
  generatedAt: string;
  modelUsed: string;
}

export interface TechnicianPartUsed {
  partNumber: string;
  description: string;
  quantity: number;
}

export interface TechnicianFindings {
  observations?: string;
  measuredValues?: Record<string, string | number>;
  correctiveActions?: string;
  resolutionSummary?: string;
  partsUsed?: (string | TechnicianPartUsed)[];
}

export interface CaseApproval {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewerNotes?: string | null;
}

export interface MaintenanceCase {
  id: string;
  organizationId: string;
  plantId: string;
  assetId: string;
  caseNumber: string;
  title: string;
  description?: string;
  severity: MaintenanceCaseSeverity;
  status: MaintenanceCaseStatus;
  reportedByUserId: string;
  assignedTechnicianUserId?: string | null;
  assignedTechnicianName?: string | null;
  symptomDescription: string;
  operatingConditions?: Record<string, any>;
  visualAssetIds: string[];
  supportingDocumentIds?: string[];
  sourceTicketId?: string | null;
  partsUsed?: (string | TechnicianPartUsed)[] | null;
  diagnosticHypothesis?: DiagnosticHypothesis | null;
  checklist: ChecklistStep[];
  findings?: TechnicianFindings | null;
  approval?: CaseApproval | null;
  isEscalated: boolean;
  escalationReason?: string | null;
  candidateForExpertKnowledge: boolean;
  feedbackRating?: 'HELPFUL' | 'UNHELPFUL' | null;
  feedbackComment?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  maintenanceRecordId?: string | null;
  // Rich Industrial Ticket Payload Fields
  createdAtFormatted?: string;
  plantName?: string;
  reportedByName?: string;
  reportedByRole?: string;
  assetTag?: string;
  assetName?: string;
  machineStatus?: string;
  faultCode?: string;
  topRootCause?: string;
  probability?: number;
  recommendedFix?: string;
  investigationProgress?: string;
  specialistDiscipline?: string;
  priority?: string;
  lotoApplied?: boolean;
  technicianNotes?: string;
}

export interface CaseHistoryEntry {
  id: string;
  caseId: string;
  userId: string;
  previousStatus?: MaintenanceCaseStatus | null;
  newStatus: MaintenanceCaseStatus;
  action: string;
  notes?: string | null;
  createdAt: string;
}

export interface CreateMaintenanceCaseRequest {
  plantId?: string;
  plantName?: string;
  assetId: string;
  assetTag?: string;
  assetName?: string;
  title: string;
  description?: string;
  severity?: MaintenanceCaseSeverity;
  symptomDescription: string;
  operatingConditions?: Record<string, any>;
  visualAssetIds?: string[];
  supportingDocumentIds?: string[];
  sourceTicketId?: string | null;
  assignedTechnicianUserId?: string;
  assignedTechnicianName?: string;
  reportedByRole?: string;
  createdAtFormatted?: string;
  machineStatus?: string;
  faultCode?: string;
  topRootCause?: string;
  probability?: number;
  recommendedFix?: string;
  investigationProgress?: string;
  specialistDiscipline?: string;
  priority?: string;
  lotoApplied?: boolean;
  technicianNotes?: string;
}

export interface AssignTechnicianRequest {
  technicianUserId?: string | null;
  technicianName?: string | null;
  expectedUpdatedAt?: string;
  unassign?: boolean;
  reason?: string;
}

export interface UnassignTechnicianRequest {
  reason?: string;
  expectedUpdatedAt?: string;
}

export interface UpdateChecklistStepRequest {
  status: ChecklistStepStatus;
  technicianNotes?: string;
}

export interface RecordFindingsRequest {
  observations?: string;
  measuredValues?: Record<string, string | number>;
  correctiveActions?: string;
  resolutionSummary?: string;
  partsUsed?: (string | TechnicianPartUsed)[];
}

export interface ApproveCaseRequest {
  approved: boolean;
  reviewerNotes?: string;
}

export interface EscalateCaseRequest {
  reason: string;
}

export interface CloseCaseRequest {
  notes?: string;
}

export interface ProvideFeedbackRequest {
  rating: 'HELPFUL' | 'UNHELPFUL';
  comment?: string;
  markCandidateForExpertKnowledge?: boolean;
}

export interface TransitionCaseStatusRequest {
  status: MaintenanceCaseStatus;
  reason?: string;
  notes?: string;
  expectedUpdatedAt?: string;
}

export interface ReopenCaseRequest {
  reason: string;
  targetStatus?: 'IN_PROGRESS' | 'REPORTED';
  expectedUpdatedAt?: string;
}

// ----------------------------------------------------------------------------
// Root Cause Analysis (RCA) & Troubleshooting Contracts
// ----------------------------------------------------------------------------

export interface RcaSourceCitation {
  type: 'MANUAL' | 'EXPERT_NOTE' | 'WORK_ORDER' | 'P_AND_ID';
  reference: string;
  title?: string;
  snippet?: string;
  author?: string;
  date?: string;
  score?: number;
}

export interface RcaHypothesis {
  id: string;
  title: string;
  probability: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  mechanismExplanation: string;
  verifiedSources: RcaSourceCitation[];
  recommendedFix: string;
  status: 'CONFIRMED' | 'HYPOTHESIS' | 'RULED_OUT';
  // Advanced Industrial RCA Innovations
  mttr?: string;
  requiredSkill?: string;
  downtimeRisk?: 'Critical' | 'High' | 'Moderate' | 'Low' | string;
  fiveWhyChain?: string[];
  requiredTools?: string[];
  spareParts?: string[];
}

export interface RcaSafetyReadiness {
  requiredPpe: string[];
  isolationPoints: string[];
  preWorkBriefing?: string;
  lockoutProcedure?: string;
}

export interface RcaInvestigationStep {
  id: string;
  stepNumber: number;
  name: string;
  instruction: string;
  safetyWarning?: string;
  requiresLoto?: boolean;
  expectedReading?: string;
  requiredTools?: string[];
  status: 'PENDING' | 'PASS' | 'FAIL';
  technicianNotes?: string;
  isLocked?: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface RcaAnalysisRequest {
  assetId: string;
  assetTag?: string;
  assetName?: string;
  errorCode?: string;
  machineStatus?: 'Running - Abnormal' | 'Tripped / Offline' | 'Startup Failure' | string;
  symptom: string;
  plantId?: string;
}

export interface RcaSession {
  id: string;
  organizationId: string;
  plantId: string;
  assetId: string;
  assetTag: string;
  machineName?: string;
  errorCode?: string;
  detectedFaultCode?: string;
  machineStatus?: string;
  symptom: string;
  hypotheses: RcaHypothesis[];
  investigationSteps: RcaInvestigationStep[];
  safetyReadiness?: RcaSafetyReadiness;
  authorUserId: string;
  authorName?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'VERIFIED_CLOSED';
  completedAt?: string;
  verifiedBy?: { id: string; name: string } | string;
  isLocked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeardownSopStep {
  stepNumber: number;
  title: string;
  instruction: string;
  safetyHazard?: string;
  torqueSpec?: string;
  toolsRequired?: string[];
  requiresLoto?: boolean;
}

export interface TeardownSop {
  machineAssetTag: string;
  machineName: string;
  documentReference?: string;
  safetyPrerequisites: string[];
  requiredPpe: string[];
  requiredTools: string[];
  lotoIsolationSteps: string[];
  disassemblySteps: TeardownSopStep[];
  torqueSpecifications: Record<string, string>;
  reassemblyGuidance: string;
}


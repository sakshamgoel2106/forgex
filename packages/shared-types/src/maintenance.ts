import type { Citation } from './rag.js';

export type MaintenanceCaseStatus =
  | 'REPORTED'
  | 'INVESTIGATING'
  | 'DIAGNOSED'
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'RESOLVED'
  | 'ESCALATED_HUMAN'
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

export interface TechnicianFindings {
  observations?: string;
  measuredValues?: Record<string, string | number>;
  correctiveActions?: string;
  resolutionSummary?: string;
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
  severity: MaintenanceCaseSeverity;
  status: MaintenanceCaseStatus;
  reportedByUserId: string;
  symptomDescription: string;
  operatingConditions?: Record<string, any>;
  visualAssetIds: string[];
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
  plantId: string;
  assetId: string;
  title: string;
  severity?: MaintenanceCaseSeverity;
  symptomDescription: string;
  operatingConditions?: Record<string, any>;
  visualAssetIds?: string[];
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
}

export interface ApproveCaseRequest {
  approved: boolean;
  reviewerNotes?: string;
}

export interface EscalateCaseRequest {
  reason: string;
}

export interface ProvideFeedbackRequest {
  rating: 'HELPFUL' | 'UNHELPFUL';
  comment?: string;
  markCandidateForExpertKnowledge?: boolean;
}

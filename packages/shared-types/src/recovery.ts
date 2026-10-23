/**
 * ForgeX AI — Phase 3: Old Machine Knowledge Recovery System Contracts
 */
import type { OrgRole } from './roles.js';

export type ClaimStatus =
  | 'COLLECTED'
  | 'AWAITING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'NEEDS_ADDITIONAL_EVIDENCE';

export type ClaimSourceType =
  | 'NAMEPLATE_PHOTO'
  | 'SCANNED_MANUAL'
  | 'ENGINEERING_DRAWING'
  | 'PID_DIAGRAM'
  | 'MAINTENANCE_LOG'
  | 'TECHNICIAN_OBSERVATION'
  | 'MANUFACTURER_DOCUMENT'
  | 'HISTORICAL_REPAIR'
  | 'PHYSICAL_INSPECTION';

export type ClaimExtractionMethod =
  | 'AI_VISION'
  | 'OCR'
  | 'MANUAL_ENTRY'
  | 'DOCUMENT_PARSER';

export type ClaimConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ClaimApplicability = 'APPLICABLE' | 'UNCERTAIN' | 'NOT_APPLICABLE';

export interface ClaimAuditEntry {
  action:
    | 'COLLECTED'
    | 'SUBMITTED_FOR_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'SUPERSEDED'
    | 'ADDITIONAL_EVIDENCE_REQUESTED'
    | 'VALUE_CORRECTED';
  actorUserId: string;
  actorEmail?: string | null;
  actorRole?: OrgRole | string | null;
  timestamp: string;
  notes?: string | null;
  qualificationProof?: string | null;
}

export interface MachineEvidenceClaim {
  id: string;
  organizationId: string;
  plantId: string;
  machineId: string;
  machineAssetTag: string;
  fieldName: string;
  displayName?: string;
  claimValue: string | number | boolean;
  unit?: string | null;
  sourceType: ClaimSourceType;
  sourceDocumentId?: string | null;
  sourceAttachmentKey?: string | null;
  sourcePageNumber?: number | null;
  sourceRegion?: string | null;
  sourceRevision?: string | null;
  sourceDate?: string | null;
  extractionMethod: ClaimExtractionMethod;
  confidence: ClaimConfidence;
  applicabilityStatus: ClaimApplicability;
  applicabilityRationale?: string | null;
  status: ClaimStatus;
  submittedByUserId: string;
  submittedByEmail?: string | null;
  submittedAt: string;
  reviewedByUserId?: string | null;
  reviewedByEmail?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  reviewRationale?: string | null;
  reviewerQualifications?: string | null;
  supersededByClaimId?: string | null;
  supersedesClaimId?: string | null;
  isSafetyCritical: boolean;
  version: number;
  auditTrail: ClaimAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export type GapFieldStatus =
  | 'GENUINELY_MISSING'
  | 'PENDING_EVIDENCE'
  | 'UNVERIFIED'
  | 'NOT_APPLICABLE'
  | 'AWAITING_REVIEW'
  | 'CONFLICTING'
  | 'SUPERSEDED'
  | 'APPROVED';

export interface RecoveryGapField {
  fieldName: string;
  displayName: string;
  isRequired: boolean;
  isSafetyCritical: boolean;
  status: GapFieldStatus;
  currentApprovedValue?: string | number | boolean | null;
  draftValue?: string | number | boolean | null;
  unit?: string | null;
  pendingClaimsCount: number;
  conflictingClaimsCount: number;
  activeClaimId?: string | null;
  approvedProvenance?: {
    sourceType: ClaimSourceType;
    sourceDocumentId?: string | null;
    sourceRevision?: string | null;
    reviewerUserId?: string | null;
    reviewerQualifications?: string | null;
    approvedAt?: string | null;
  } | null;
  conflictDetails?: Array<{
    claimId: string;
    value: string | number | boolean;
    sourceType: ClaimSourceType;
    submittedBy: string;
  }>;
}

export interface MachineRecoveryProfile {
  machineId: string;
  assetTag: string;
  name: string;
  plantId: string;
  plantName?: string;
  machineCategory: string;
  area: string;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  manufacturingYear?: number | null;
  identificationConfidence: 'VERIFIED' | 'PARTIAL' | 'UNIDENTIFIED';
  unresolvedIdentityQuestions: string[];
  fields: RecoveryGapField[];
  totalFieldsRequired: number;
  approvedFieldsCount: number;
  missingFieldsCount: number;
  awaitingReviewCount: number;
  conflictingFieldsCount: number;
  evidenceClaimsCount: number;
  openTasksCount: number;
  readinessPercentage: number;
  safetyCriticalPendingCount: number;
  lastUpdated: string;
}

export interface MachineRecoverySummary {
  totalMachines: number;
  legacyOrIncompleteMachines: number;
  unidentifiedCount: number;
  partiallyIdentifiedCount: number;
  verifiedCount: number;
  claimsAwaitingReview: number;
  approvedClaimsCount: number;
  rejectedClaimsCount: number;
  supersededClaimsCount: number;
  openCollectionTasksCount: number;
  overdueTasksCount: number;
}

export interface CreateEvidenceClaimDTO {
  machineId: string;
  fieldName: string;
  displayName?: string;
  claimValue: string | number | boolean;
  unit?: string | null;
  sourceType: ClaimSourceType;
  sourceDocumentId?: string | null;
  sourceAttachmentKey?: string | null;
  sourcePageNumber?: number | null;
  sourceRegion?: string | null;
  sourceRevision?: string | null;
  sourceDate?: string | null;
  extractionMethod: ClaimExtractionMethod;
  confidence?: ClaimConfidence;
  applicabilityStatus?: ClaimApplicability;
  applicabilityRationale?: string | null;
  isSafetyCritical?: boolean;
}

export interface ReviewEvidenceClaimDTO {
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_ADDITIONAL_EVIDENCE' | 'SUPERSEDE';
  reviewNotes: string;
  reviewRationale: string;
  reviewerQualifications?: string;
  correctedValue?: string | number | boolean;
  correctedUnit?: string;
}

export interface ClaimFilterOptions {
  machineId?: string;
  plantId?: string;
  status?: ClaimStatus;
  fieldName?: string;
  isSafetyCritical?: boolean;
  submittedByUserId?: string;
}

export interface IngestEvidenceExtractDTO {
  machineId: string;
  evidenceType: ClaimSourceType;
  rawText?: string;
  documentId?: string;
  attachmentKey?: string;
  pageNumber?: number;
  imageBuffer?: string; // base64
  filename?: string;
  sourceRevision?: string;
  sourceDate?: string;
  technicianObservations?: string;
}

export interface ExtractedCandidateClaim {
  fieldName: string;
  displayName: string;
  candidateValue: string | number | boolean;
  unit?: string | null;
  confidence: ClaimConfidence;
  extractionMethod: ClaimExtractionMethod;
  sourceRegion?: string | null;
  isSafetyCritical: boolean;
  notes?: string;
}

export interface IngestEvidenceResponse {
  evidenceType: ClaimSourceType;
  provenance: {
    filename?: string;
    documentId?: string;
    attachmentKey?: string;
    pageNumber?: number;
    extractedAt: string;
    extractionMethod: ClaimExtractionMethod;
  };
  extractedClaims: ExtractedCandidateClaim[];
  potentialInconsistencies: string[];
  unresolvedQuestions: string[];
  createdClaims: MachineEvidenceClaim[];
}

// -----------------------------------------------------------------------------
// Expert Knowledge Library (Prompt 04)
// -----------------------------------------------------------------------------

export type ExpertKnowledgeCategory =
  | 'Reliability'
  | 'Tooling Hack'
  | 'Safety & LOTO'
  | 'Troubleshooting Trick'
  | 'Startup / Shutdown'
  | 'Preventive Maintenance'
  | 'TECHNICIAN_FINDING'
  | 'ENGINEERING_REVIEW'
  | 'REPAIR_RESOLUTION'
  | 'FAILURE_PATTERN'
  | 'TROUBLESHOOTING_GUIDE'
  | 'KNOWLEDGE_GAP'
  | string;

export type ExpertKnowledgeSeverity =
  | 'Pro-Tip / Best Practice'
  | 'Critical Machine Warning'
  | 'Safety Hazard'
  | 'Time-Saver Hack'
  | string;

export type ExpertKnowledgeStatus =
  | 'DRAFT'
  | 'AWAITING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVOKED'
  | 'SUPERSEDED';

export type ReviewOutcome = 'WORKED_IN_FIELD' | 'NEEDS_MODIFICATION' | 'GENERAL_COMMENT';

export interface ExpertNoteReview {
  id: string;
  userId: string;
  userName?: string | null;
  userRole?: string | null;
  rating: number; // 1 to 5
  outcome?: ReviewOutcome;
  comment: string;
  createdAt: string;
}

export interface AddExpertNoteReviewDTO {
  rating: number;
  outcome?: ReviewOutcome;
  comment: string;
}

export interface ExpertKnowledgeEntry {
  id: string;
  organizationId: string;
  plantId: string;
  machineId?: string | null;
  machineAssetTag?: string | null;
  machineAssetTags?: string[];
  category: ExpertKnowledgeCategory;
  severity?: ExpertKnowledgeSeverity | string;
  symptom?: string | null;
  taskDuringIssue?: string | null;
  observedAt?: string | null;
  title: string;
  description: string;
  aiSupplementalInsight?: string | null;
  symptoms?: string[];
  rootCause?: string | null;
  resolutionSteps?: string[];
  knownFailureModes?: string[];
  gapDescription?: string | null;
  safetyPrecautions?: string[];
  technicalSpecifications?: Record<string, string | number>;
  tags: string[];
  status: ExpertKnowledgeStatus;
  upvotes: number;
  downvotes?: number;
  reviews?: ExpertNoteReview[];
  averageRating?: number;
  reviewCount?: number;
  authorUserId: string;
  authorEmail?: string | null;
  authorRole?: string | null;
  authorName?: string | null;
  reviewedByUserId?: string | null;
  reviewedByEmail?: string | null;
  reviewedAt?: string | null;
  reviewRationale?: string | null;
  reviewerQualifications?: string | null;
  supersededByEntryId?: string | null;
  supersedesEntryId?: string | null;
  dataClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpertKnowledgeDTO {
  plantId?: string;
  machineId?: string | null;
  machineAssetTag?: string | null;
  machineAssetTags?: string[];
  category: ExpertKnowledgeCategory;
  severity?: ExpertKnowledgeSeverity | string;
  symptom?: string | null;
  taskDuringIssue?: string | null;
  observedAt?: string | null;
  title: string;
  description: string;
  aiSupplementalInsight?: string | null;
  symptoms?: string[];
  rootCause?: string | null;
  resolutionSteps?: string[];
  knownFailureModes?: string[];
  gapDescription?: string | null;
  safetyPrecautions?: string[];
  technicalSpecifications?: Record<string, string | number>;
  tags?: string[];
  status?: ExpertKnowledgeStatus;
  upvotes?: number;
  downvotes?: number;
  reviews?: ExpertNoteReview[];
  averageRating?: number;
  reviewCount?: number;
  dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
}

export interface BulkCreateExpertKnowledgeDTO {
  notes: CreateExpertKnowledgeDTO[];
}

export interface ReviewExpertKnowledgeDTO {
  decision: 'APPROVE' | 'REJECT' | 'REVOKE' | 'SUPERSEDE';
  reviewRationale: string;
  reviewerQualifications?: string;
  supersededByEntryId?: string;
}

export interface ExpertKnowledgeFilterOptions {
  plantId?: string;
  machineId?: string;
  category?: ExpertKnowledgeCategory;
  severity?: ExpertKnowledgeSeverity | string;
  status?: ExpertKnowledgeStatus;
  search?: string;
  dataClassification?: string;
}

// -----------------------------------------------------------------------------
// Bulk Machine Onboarding & Task Workflow (Prompt 04)
// -----------------------------------------------------------------------------

export interface BulkMachineImportRow {
  assetTag: string;
  name: string;
  plantId?: string;
  plantCode?: string;
  machineType?: string;
  industryCategory?: string;
  area?: string;
  building?: string;
  locationDescription?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  manufacturingYear?: number;
  criticality?: string;
  dataClassification?: string;
  generateQrLabel?: boolean;
}

export interface BulkMachineImportDTO {
  plantId?: string;
  csvContent?: string;
  rows?: BulkMachineImportRow[];
  generateQrLabels?: boolean;
  industryCategory?: string;
}

export interface BulkMachineImportResult {
  totalProcessed: number;
  registeredCount: number;
  duplicatesSkippedCount: number;
  errorsCount: number;
  registeredMachines: any[];
  duplicates: Array<{ assetTag: string; reason: string }>;
  errors: Array<{ row: number; reason: string }>;
}

export interface SubmitTaskEvidenceDTO {
  submittedValues?: Record<string, string | number | boolean>;
  evidenceDescription?: string;
  evidenceAttachmentKeys?: string[];
}

export interface ReviewTaskSubmissionDTO {
  decision: 'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT';
  reviewFeedback: string;
  reviewerQualifications?: string;
}


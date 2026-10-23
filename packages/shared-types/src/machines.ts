/**
 * ForgeX AI — Phase B: Secure Industrial Machine Registry, Knowledge & 3D Contracts
 */
import type { AssetOperationalState } from './telemetry.js';
import type { OrgRole } from './roles.js';

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export type VerificationState = 'UNVERIFIED' | 'PARTIALLY_VERIFIED' | 'VERIFIED';

export type DocumentationReadiness = 'INCOMPLETE' | 'PENDING_INSPECTION' | 'READY';

export type MachineAccessScope = 'ORGANIZATION' | 'PLANT' | 'RESTRICTED_TEAM';

export type MachineCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'MISSION_CRITICAL';

export interface Machine {
  id: string;
  organizationId: string;
  plantId: string;
  parentAssetId?: string | null;
  assetTag: string; // Unique per organization (e.g. "PUMP-204-B")
  name: string;
  machineType: string; // e.g. "Centrifugal Pump", "Turbine", "Air Compressor"
  area: string;
  building?: string | null;
  productionLine?: string | null;
  locationDescription?: string | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  installationDate?: string | null;
  operationalState: AssetOperationalState;
  criticality: MachineCriticality;
  department?: string | null;
  dataClassification: DataClassification;
  authorizedAccessScope: MachineAccessScope;
  verificationState: VerificationState;
  documentationReadiness: DocumentationReadiness;
  technicalSpecs: Record<string, string | number | boolean>;
  hasModel3d: boolean;
  model3dStorageKey?: string | null;
  model3dFormat?: 'glb' | 'gltf' | 'step' | 'stp' | 'iges' | 'igs' | 'stl' | 'obj' | string | null;
  model3dFile?: { name: string; size: number; type?: string } | null;
  model3dUrl?: string | null;
  hasPidDiagram: boolean;
  pidStorageKey?: string | null;
  pAndIdFile?: { name: string; size: number; type?: string } | null;
  pAndIdUrl?: string | null;
  pidFile?: { name: string; size: number; type?: string } | null;
  pidUrl?: string | null;
  qrCodeData: string; // Opaque machine routing reference, non-sensitive
  provenance?: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type PublicLookupPolicy = 'DISABLED' | 'APPROVED_OEM_ONLY' | 'PERMISSIVE';

export type OemSourceType =
  | 'OFFICIAL_MANUFACTURER'
  | 'AUTHORIZED_DISTRIBUTOR'
  | 'THIRD_PARTY'
  | 'UNKNOWN_UNVERIFIED';

export type ModelMatchStatus =
  | 'EXACT_MATCH'
  | 'FAMILY_LEVEL_ONLY'
  | 'MODEL_MISMATCH';

export type SpecVerificationStatus =
  | 'VERIFIED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'SOURCE_UNVERIFIED'
  | 'MODEL_MISMATCH'
  | 'CONFLICTING_DATA'
  | 'MISSING_DATA'
  | 'FAMILY_LEVEL_ONLY'
  | 'PUBLIC_SUGGESTION'
  | 'APPROVED'
  | 'REJECTED';

export interface SpecConflictInfo {
  existingValue: string | number;
  existingSource: string;
  publicValue: string | number;
  publicSource: string;
  reason: string;
}

export interface SpecEvidenceRecord {
  fieldName: string;
  displayName: string;
  value: string | number;
  unit?: string;
  originalValue?: string | number;
  originalUnit?: string;
  sourceUrl: string;
  sourceType: OemSourceType;
  sourcePublisher: string;
  supportingText?: string;
  matchStatus: ModelMatchStatus;
  verificationStatus: SpecVerificationStatus;
  retrievalTimestamp: string;
  conflictInfo?: SpecConflictInfo | null;
}

export interface MissingSpecField {
  fieldName: string;
  displayName: string;
  category: string;
  requirementLevel: 'REQUIRED' | 'RECOMMENDED';
  reason: string;
}

export interface CompletenessSummary {
  machineType: string;
  totalApplicableRequired: number;
  presentRequired: number;
  totalApplicableRecommended: number;
  presentRecommended: number;
  completenessScore: number;
  isComplete: boolean;
  missingRequiredFields: MissingSpecField[];
  missingRecommendedFields: MissingSpecField[];
  notice: string;
}

export interface PublicMachineKnowledge {
  id: string;
  manufacturer: string;
  modelNumber: string;
  productFamily?: string;
  publicSpecs: Record<string, string | number>;
  sourceUrl: string;
  sourcePublisher: string;
  retrievalDate: string;
  verificationStatus: SpecVerificationStatus;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  sourceType?: OemSourceType;
  matchStatus?: ModelMatchStatus;
  missingModelDetails?: string[];
  completenessSummary?: CompletenessSummary;
  evidenceRecords?: Record<string, SpecEvidenceRecord>;
  conflicts?: SpecConflictInfo[];
  reviewNotes?: string | null;
}

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface MissingInformationTask {
  id: string;
  organizationId: string;
  machineId: string;
  machineAssetTag: string;
  machineName: string;
  assignedUserId?: string | null;
  assignedRole?: OrgRole | null;
  requestedFields: string[];
  instructions: string;
  dueDate?: string | null;
  status: TaskStatus;
  submittedValues?: Record<string, string | number | boolean> | null;
  submittedByUserId?: string | null;
  submittedAt?: string | null;
  evidenceDescription?: string | null;
  evidenceAttachmentKeys?: string[] | null;
  reviewFeedback?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MappingStatus = 'VERIFIED' | 'SUGGESTED' | 'UNMAPPED' | 'NEEDS_REVIEW';

export interface ComponentMapping {
  id: string;
  organizationId: string;
  machineId: string;
  componentId: string; // Stable 3D node identifier (e.g. "impeller_housing", "bearing_seal")
  componentName: string;
  pidTag: string; // e.g. "P-204", "V-101"
  pidDrawingNumber?: string | null;
  pidCoordinates?: { x: number; y: number; width: number; height: number } | null;
  manualDocumentId?: string | null;
  manualPageNumber?: number | null;
  status: MappingStatus;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BadgeStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface EmployeeBadge {
  id: string;
  organizationId: string;
  userId: string;
  badgeCode: string; // e.g. "EMP-920481"
  status: BadgeStatus;
  pinHash: string; // Salted secure hash, never plaintext
  issuedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MachineLedgerSummary {
  totalMachines: number;
  incompleteDocumentationCount: number;
  pendingReviewTasksCount: number;
  with3dModelCount: number;
  criticalMachinesCount: number;
  verifiedSpecsCount?: number;
}

export type VerificationCheckKey =
  | 'identity'
  | 'documentation'
  | 'technicalSpecs'
  | 'engineeringAttachments';

export type VerificationCheckStatus = 'PASSED' | 'PENDING' | 'FAILED' | 'NOT_APPLICABLE';

export interface VerificationCheck {
  key: VerificationCheckKey;
  label: string;
  status: VerificationCheckStatus;
  required: boolean;
  details: string;
  failureReason?: string | null;
  correctiveAction?: string | null;
}

export type MachineVerificationWorkflowStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'READY_FOR_APPROVAL'
  | 'VERIFIED'
  | 'REJECTED';

export interface VerificationHistoryEntry {
  id?: string;
  action:
    | 'REGISTERED'
    | 'CHECK_UPDATED'
    | 'TASK_ASSIGNED'
    | 'EVIDENCE_SUBMITTED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CHANGES_REQUESTED';
  actorUserId: string;
  actorRole: string;
  timestamp: string;
  notes?: string | null;
  rejectionReason?: string | null;
  correctiveActions?: string | null;
}

export interface MachineVerificationRecord {
  id: string;
  organizationId: string;
  machineId: string;
  machineAssetTag: string;
  status: MachineVerificationWorkflowStatus;
  overallState: VerificationState;
  checks: VerificationCheck[];
  assignedUserId?: string | null;
  assignedRole?: OrgRole | null;
  assignedUserName?: string | null;
  lastSubmittedByUserId?: string | null;
  lastSubmittedAt?: string | null;
  evidenceDescription?: string | null;
  evidenceAttachmentKeys?: string[];
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  correctiveActions?: string | null;
  history: VerificationHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface MachinePosterData {
  machineId: string;
  assetTag: string;
  machineName: string;
  machineType: string;
  plantName: string;
  plantCode: string;
  area: string;
  locationDescription?: string | null;
  safetyReminder: string;
  qrPayload: string; // Non-sensitive route e.g. "/machines/{id}"
  instructions: string;
}

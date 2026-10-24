export type RootCauseStatus = 'CONFIRMED' | 'SUSPECTED' | 'UNKNOWN';

export type ResolutionApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'NOT_REQUIRED';

export type MaintenanceVerificationState =
  | 'PENDING'
  | 'PASSED'
  | 'FAILED'
  | 'NOT_APPLICABLE'
  | 'VERIFIED'
  | 'UNVERIFIED';

export type MaintenanceMeasurementSource =
  | 'MANUAL_GAUGE'
  | 'CALIBRATED_TOOL'
  | 'SCADA_HISTORIAN'
  | 'SENSOR_TELEMETRY'
  | 'LAB_ANALYSIS';

export interface MaintenanceMeasurement {
  id: string;
  parameterName: string; // e.g. "bearing_temperature", "vibration_velocity_rms", "suction_pressure"
  value: number;
  unit: string; // e.g. "degC", "mm/s", "bar", "psi"
  timestamp: string;
  source: MaintenanceMeasurementSource;
  isNormal: boolean;
  thresholdUpper?: number | null;
  thresholdLower?: number | null;
  notes?: string | null;
}

export interface PartReplaced {
  partNumber: string;
  partName: string;
  quantity: number;
  lotOrSerial?: string | null;
}

export interface PostRepairTestResult {
  testName: string;
  passed: boolean;
  measuredValue?: string | number | null;
  expectedRange?: string | null;
  timestamp: string;
  performedByUserId?: string | null;
  notes?: string | null;
}

export interface MaintenanceAttachment {
  id: string;
  filename: string;
  storageKey: string;
  fileSizeBytes: number;
  mimeType: string;
  caption?: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
}

export interface MaintenanceAuditEntry {
  id: string;
  versionNumber: number;
  action: string;
  actorUserId: string;
  actorName?: string | null;
  changes: Record<string, { from: any; to: any }>;
  notes?: string | null;
  timestamp: string;
}

export interface MaintenanceRecord {
  id: string;
  recordNumber: string; // e.g. "MR-2026-0042"
  organizationId: string;
  plantId: string;
  machineId: string;
  machineAssetTag: string;
  ticketId?: string | null;
  ticketNumber?: string | null;
  caseId?: string | null;
  caseNumber?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  reportingUserId: string;
  reportingUserName?: string | null;
  assignedTechnicianUserId?: string | null;
  assignedTechnicianName?: string | null;
  resolvingTechnicianUserId: string;
  resolvingTechnicianName: string;
  faultCategory: string; // e.g. "BEARING_OVERHEATING", "MECHANICAL_SEAL_FAILURE", "VIBRATION_EXCESSIVE"
  problemStatement: string;
  observedSymptoms: string[];
  measurements: MaintenanceMeasurement[];
  rootCause: string;
  rootCauseStatus: RootCauseStatus;
  repairActions: string[];
  partsReplaced: PartReplaced[];
  postRepairTestResults: PostRepairTestResult[];
  verificationState: MaintenanceVerificationState;
  verificationNotes?: string | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  requiresRestartApproval: boolean;
  restartApproved: boolean;
  restartApprovedByUserId?: string | null;
  restartApprovedAt?: string | null;
  restartNotes?: string | null;
  approvalStatus: ResolutionApprovalStatus;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  resolvedAt: string;
  closedAt?: string | null;
  relatedIncidentRecordIds: string[];
  attachments: MaintenanceAttachment[];
  recordVersion: number;
  auditTrail: MaintenanceAuditEntry[];
  isRecurringIncident: boolean;
  recurrenceCount: number;
  knowledgeApproved: boolean;
  knowledgeApprovedAt?: string | null;
  knowledgeApprovedByUserId?: string | null;
  resolutionSource?: 'FIELD_TECH' | 'RCA_ENGINEER' | 'OEM_RESOLVED' | string;
  mttrMinutes?: number | string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringFaultThresholdConfig {
  machineType?: string;
  faultCategory?: string;
  timeWindowDays: number; // e.g. 30
  recurrenceCountThreshold: number; // e.g. 2
  requiresSafetyStop: boolean;
  safetyLimits?: {
    maxTemperatureC?: number;
    maxVibrationMmS?: number;
    maxPressureBar?: number;
    minPressureBar?: number;
  };
}

export interface RecurringFaultAnalysis {
  machineId: string;
  machineAssetTag: string;
  isRecurringFault: boolean;
  recurrenceCount: number;
  faultCategory: string;
  componentId?: string | null;
  incidentTimeline: Array<{
    recordId: string;
    recordNumber: string;
    ticketNumber: string;
    resolvedAt: string;
    faultCategory: string;
    rootCause: string;
    rootCauseStatus: RootCauseStatus;
    repairActions: string[];
    measurements: MaintenanceMeasurement[];
    isResolved: boolean;
  }>;
  relatedRecordIds: string[];
  confirmedRootCauses: string[];
  suspectedRootCauses: string[];
  unknownRootCauseCount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  evidenceSummary: string;
  recommendedInspectionSteps: string[];
  isSafetyCritical: boolean;
  safetyWarning?: string | null;
  requiresSafetyHold: boolean;
  requiresRestartApproval: boolean;
  priorRepairEffectiveness?: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE' | 'UNVERIFIED';
  averageRecurrenceIntervalDays?: number | null;
  intelligenceSource?: 'HISTORICAL_MAINTENANCE_RECORDS';
  patternDisclaimer?: string;
}

export interface HistoricalFaultMatchRequest {
  query?: string;
  faultCategory?: string;
  faultCode?: string;
  componentId?: string;
  limit?: number;
  minScore?: number;
  timeWindowDays?: number;
}

export type HistoricalEvidenceType = 'RECORDED_FACT' | 'POSSIBLE_SIMILARITY' | 'UNCONFIRMED_HYPOTHESIS';
export type PriorRepairEffectiveness = 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE' | 'UNVERIFIED';
export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_SIMILARITY';

export interface ConflictingDiagnosisEntry {
  rootCauseA: string;
  rootCauseB: string;
  recordIdA: string;
  recordIdB: string;
  recordNumberA: string;
  recordNumberB: string;
  description: string;
}

export interface HistoricalFaultMatchResult {
  recordId: string;
  recordNumber: string;
  incidentDate: string;
  machineId: string;
  machineAssetTag: string;
  plantId: string;
  faultCategory: string;
  recordedProblemDescription: string;
  recordedDiagnosis: string;
  diagnosisStatus: RootCauseStatus;
  correctiveActions: string[];
  partsReplaced: PartReplaced[];
  recordedOutcome: MaintenanceVerificationState;
  workOrderReference: string;
  ticketId?: string | null;
  caseId?: string | null;
  matchScore: number;
  matchReasons: string[];
  matchConfidence: MatchConfidence;
  evidenceType: HistoricalEvidenceType;
  priorRepairEffectiveness: PriorRepairEffectiveness;
  measurements?: MaintenanceMeasurement[];
  resolvingTechnicianName?: string;
}

export interface HistoricalFaultRetrievalResponse {
  machineId: string;
  machineAssetTag: string;
  query: string;
  totalHistoryCount: number;
  matchedCount: number;
  matches: HistoricalFaultMatchResult[];
  recurrenceAnalysis: RecurringFaultAnalysis;
  conflictingDiagnoses: ConflictingDiagnosisEntry[];
  hasConflictingEvidence: boolean;
  searchStatus: 'MATCHES_FOUND' | 'NO_MATCHING_RECORDS' | 'INSUFFICIENT_HISTORY';
  patternDisclaimer?: string;
}


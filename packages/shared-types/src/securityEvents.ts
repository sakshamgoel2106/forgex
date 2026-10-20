/**
 * ForgeX AI — Security Events, Classification, Confidential Access Protection & Admin Alerts
 */

export type SecurityEventCategory =
  | 'CONFIDENTIAL_DOCUMENT_ACCESS'
  | 'UNAUTHORIZED_EXPORT'
  | 'RESTRICTED_ACTION'
  | 'CROSS_TENANT_ACCESS'
  | 'CROSS_PLANT_ACCESS'
  | 'REPEATED_BLOCKED_ATTEMPTS'
  | 'POLICY_BYPASS_ATTEMPT'
  | 'GENERAL_COPILOT_QUERY'
  | 'REVOKED_USER_ACCESS';

export type SecurityAccessDecision =
  | 'ALLOWED'
  | 'DENIED'
  | 'ESCALATED'
  | 'FLAGGED';

export type SecuritySeverity =
  | 'INFORMATIONAL'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type SecurityReviewStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'DISMISSED_BENIGN'
  | 'CONFIRMED_VIOLATION'
  | 'RESOLVED';

export type SecurityIntentClassification =
  | 'GENERAL_KNOWLEDGE'
  | 'COMPANY_KNOWLEDGE'
  | 'MACHINE_TROUBLESHOOTING'
  | 'MAINTENANCE_HISTORY'
  | 'CONFIDENTIAL_ACCESS'
  | 'RESTRICTED_ACTION'
  | 'SAFETY_CRITICAL_OR_INSUFFICIENT'
  | 'OLD_OR_UNKNOWN_MACHINE';

export type SecurityResolutionOutcome =
  | 'BENIGN_LEGITIMATE_NEED'
  | 'ACCIDENTAL_PROMPT'
  | 'POLICY_VIOLATION'
  | 'FALSE_POSITIVE';

export interface SecurityEvent {
  id: string;
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  timestamp: string;
  category: SecurityEventCategory;
  action: string;
  resourceCategory: string; // e.g., 'DOCUMENT', 'MACHINE', 'EXPORT', 'COPILOT_QUERY'
  resourceId?: string | null;
  decision: SecurityAccessDecision;
  policyReasonCode: string; // e.g., 'CONFIDENTIAL_MANUAL_RESTRICTED', 'CROSS_PLANT_DENIED', 'ROLE_FORBIDDEN'
  severity: SecuritySeverity;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  reviewStatus: SecurityReviewStatus;
  assignedReviewerUserId?: string | null;
  reviewNotes?: string | null;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  /**
   * Fair and Accurate Interpretation (Section 6):
   * An access attempt is a security signal, not proof of malice.
   * Single denied inquiries are marked benign by default.
   */
  isBenignInquiry: boolean;
}

export interface SecurityAlert {
  id: string;
  organizationId: string;
  alertType:
    | 'NEW_RESTRICTED_ACCESS'
    | 'UNAUTHORIZED_EXPORT'
    | 'REPEATED_BLOCKED_ATTEMPTS'
    | 'CONFIRMED_POLICY_BYPASS'
    | 'SUSPICIOUS_ANOMALY';
  severity: SecuritySeverity;
  status: SecurityReviewStatus;
  title: string;
  summary: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  resourceCategory: string;
  resourceId?: string | null;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  correlatedEventIds: string[];
  assignedReviewerUserId?: string | null;
  reviewNotes?: string | null;
  resolutionOutcome?: SecurityResolutionOutcome | null;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSecurityEventDTO {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  category: SecurityEventCategory;
  action: string;
  resourceCategory: string;
  resourceId?: string | null;
  decision: SecurityAccessDecision;
  policyReasonCode: string;
  severity: SecuritySeverity;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  isBenignInquiry?: boolean;
}

export interface CreateSecurityAlertDTO {
  organizationId: string;
  alertType: SecurityAlert['alertType'];
  severity: SecuritySeverity;
  title: string;
  summary: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  resourceCategory: string;
  resourceId?: string | null;
  correlatedEventIds?: string[];
}

export interface ReviewSecurityAlertDTO {
  status: SecurityReviewStatus;
  reviewNotes?: string;
  resolutionOutcome?: SecurityResolutionOutcome;
  assignedReviewerUserId?: string;
}

export interface ListSecurityEventsQuery {
  category?: SecurityEventCategory;
  actorUserId?: string;
  decision?: SecurityAccessDecision;
  severity?: SecuritySeverity;
  reviewStatus?: SecurityReviewStatus;
  limit?: number;
  offset?: number;
}

export interface ListSecurityAlertsQuery {
  status?: SecurityReviewStatus;
  severity?: SecuritySeverity;
  alertType?: SecurityAlert['alertType'];
  actorUserId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

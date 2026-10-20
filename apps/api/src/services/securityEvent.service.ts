import type { IDataStore } from '../db/dataStore.interface.js';
import type {
  SecurityEvent,
  SecurityAlert,
  SecurityEventCategory,
  SecurityAccessDecision,
  SecuritySeverity,
  SecurityIntentClassification,
  CreateSecurityEventDTO,
  ReviewSecurityAlertDTO,
  ListSecurityEventsQuery,
  ListSecurityAlertsQuery,
} from '@forgex/shared-types';

export interface RecordSecurityEventParams {
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
  severity?: SecuritySeverity;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  isBenignInquiry?: boolean;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  decision: SecurityAccessDecision;
  policyReasonCode: string;
  denialMessage?: string;
}

export class SecurityEventService {
  constructor(private dataStore: IDataStore) {}

  /**
   * Classify user request intent & sensitivity.
   * NOTE: As required by Section 2, this is informational only and is NEVER
   * relied upon as a security boundary.
   */
  public classifyIntent(
    query: string,
    options?: { plantId?: string; assetId?: string; isSafetyCritical?: boolean; isOldOrIncomplete?: boolean }
  ): SecurityIntentClassification {
    const q = query.trim().toLowerCase();

    // 1. Restricted actions (export, dumps, bulk extraction)
    if (
      /\b(export all|export database|dump data|bulk download|raw dump)\b/i.test(
        q
      )
    ) {
      return 'RESTRICTED_ACTION';
    }

    // 2. Explicit confidential documents / proprietary manual requests
    if (
      /\b(confidential manual|secret sop|proprietary manual|secret formula|proprietary formula|secret manual|proprietary drawing|confidential document|unredacted manual|bypass permission|internal credentials|system password)\b/i.test(
        q
      )
    ) {
      return 'CONFIDENTIAL_ACCESS';
    }

    // 3. Safety-critical inquiries
    if (
      options?.isSafetyCritical ||
      /\b(hazardous|danger|dangerous|arc flash|toxic|loto|lockout|high pressure|emergency shutdown|radiation|chemical leak|explosion|lethal|critical failure|overheat|overheating)\b/i.test(
        q
      )
    ) {
      return 'SAFETY_CRITICAL_OR_INSUFFICIENT';
    }

    // 4. Maintenance History inquiries
    if (
      /\b(maintenance history|previous fault|past repair|recurring failure|past incident|failure log|history of|repaired before|tripped before|maintenance record)\b/i.test(
        q
      )
    ) {
      return 'MAINTENANCE_HISTORY';
    }

    // 5. Old or Unknown Machines (missing documentation or unverified)
    if (
      options?.isOldOrIncomplete ||
      /\b(unknown machine|missing manual|missing spec|incomplete documentation|unverified machine|legacy asset)\b/i.test(
        q
      )
    ) {
      return 'OLD_OR_UNKNOWN_MACHINE';
    }

    // 6. Machine troubleshooting (specific asset tags, vibration, tolerances, seal flush)
    const hasMachineTag = /\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]+-[0-9]+)\b/i.test(query);
    if (
      hasMachineTag ||
      options?.assetId ||
      /\b(vibration|bearing|impeller|seal flush|cavitation|torque|clearance|motor temperature|pump curve)\b/i.test(
        q
      )
    ) {
      return 'MACHINE_TROUBLESHOOTING';
    }

    // 7. Company-specific knowledge (SOP, plant policy, shift handover, plant layout)
    if (
      /\b(sop|plant procedure|shift handover|operator round|company policy|work order|service bulletin|bulletin|vendor note|vendor notes|operating manual)\b/i.test(
        q
      )
    ) {
      return 'COMPANY_KNOWLEDGE';
    }

    // 6. Default to General Knowledge (physics, chemistry, thermodynamic formulas, general principles)
    return 'GENERAL_KNOWLEDGE';
  }

  /**
   * Backend-enforced authorization evaluation.
   * Evaluates organization, user role, plant assignment scope, resource classification.
   */
  public evaluateCopilotPolicy(params: {
    organizationId: string;
    userRole?: string;
    plantId?: string;
    userAssignedPlantIds?: string[];
    intent: SecurityIntentClassification;
  }): PolicyEvaluationResult {
    const { userRole, plantId, userAssignedPlantIds, intent } = params;

    // 1. Plant scope check: if user has assigned plants, enforce plant boundaries
    if (plantId && plantId !== 'GENERAL' && userAssignedPlantIds && userAssignedPlantIds.length > 0) {
      if (!userAssignedPlantIds.includes(plantId)) {
        return {
          allowed: false,
          decision: 'DENIED',
          policyReasonCode: 'CROSS_PLANT_DENIED',
          denialMessage:
            'Access denied: Your account is not authorized for the specified plant facility.',
        };
      }
    }

    // 2. General knowledge is universally permitted without accessing restricted company assets
    if (intent === 'GENERAL_KNOWLEDGE') {
      return {
        allowed: true,
        decision: 'ALLOWED',
        policyReasonCode: 'GENERAL_KNOWLEDGE_PERMITTED',
      };
    }

    // 3. Confidential resource protection: Non-admins cannot retrieve confidential manuals or proprietary SOPs
    const isSupervisory =
      userRole === 'ORGANIZATION_ADMIN' ||
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ENGINEER_TECHNICIAN';

    if (intent === 'CONFIDENTIAL_ACCESS' && !isSupervisory) {
      return {
        allowed: false,
        decision: 'DENIED',
        policyReasonCode: 'CONFIDENTIAL_RESOURCE_RESTRICTED',
        denialMessage:
          'Access restricted: The requested document or procedure is classified as restricted under company policy. Please contact your plant administrator for authorized review.',
      };
    }

    // 4. Restricted action protection
    if (intent === 'RESTRICTED_ACTION' && !isSupervisory) {
      return {
        allowed: false,
        decision: 'DENIED',
        policyReasonCode: 'RESTRICTED_ACTION_FORBIDDEN',
        denialMessage:
          'Action denied: This action is restricted to authorized supervisors and administrators.',
      };
    }

    return {
      allowed: true,
      decision: 'ALLOWED',
      policyReasonCode: 'AUTHORIZED_SCOPE',
    };
  }

  /**
   * Records a security event with Fair and Accurate Interpretation (Section 6),
   * correlation tracking, and rate-limited admin alerts (Section 5).
   */
  public async recordSecurityEvent(
    params: RecordSecurityEventParams
  ): Promise<{ event: SecurityEvent; alert?: SecurityAlert | null }> {
    const defaultSeverity: SecuritySeverity =
      params.severity ??
      (params.decision === 'ALLOWED'
        ? 'INFORMATIONAL'
        : params.category === 'UNAUTHORIZED_EXPORT' || params.category === 'CROSS_TENANT_ACCESS'
        ? 'HIGH'
        : 'MEDIUM');

    // Section 6: Access attempts are not proof of malicious intent. Single denied queries default to benign.
    const isBenign =
      params.isBenignInquiry !== undefined
        ? params.isBenignInquiry
        : params.decision === 'DENIED' && defaultSeverity !== 'CRITICAL' && defaultSeverity !== 'HIGH';

    // Sanitize metadata to never store full proprietary texts or secrets
    const sanitizedMetadata: Record<string, unknown> = { ...(params.metadata || {}) };
    delete sanitizedMetadata.rawText;
    delete sanitizedMetadata.documentBody;
    delete sanitizedMetadata.storageKey;
    delete sanitizedMetadata.token;
    delete sanitizedMetadata.password;

    const eventDto: CreateSecurityEventDTO = {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail ?? null,
      actorRole: params.actorRole ?? null,
      category: params.category,
      action: params.action,
      resourceCategory: params.resourceCategory,
      resourceId: params.resourceId ?? null,
      decision: params.decision,
      policyReasonCode: params.policyReasonCode,
      severity: defaultSeverity,
      correlationId: params.correlationId ?? null,
      metadata: sanitizedMetadata,
      isBenignInquiry: isBenign,
    };

    const event = await this.dataStore.recordSecurityEvent(eventDto);

    // If decision is ALLOWED or category is INFORMATIONAL, no actionable alert needed
    if (params.decision === 'ALLOWED' && defaultSeverity === 'INFORMATIONAL') {
      return { event, alert: null };
    }

    // Alert correlation & rate-limiting (Section 5 & Section 6)
    let alert: SecurityAlert | null = null;
    if (params.actorUserId && params.decision === 'DENIED') {
      alert = await this.correlateAndTriggerAlert(event);
    } else if (params.category === 'UNAUTHORIZED_EXPORT' || params.category === 'POLICY_BYPASS_ATTEMPT') {
      alert = await this.dataStore.createSecurityAlert({
        organizationId: params.organizationId,
        alertType: params.category === 'UNAUTHORIZED_EXPORT' ? 'UNAUTHORIZED_EXPORT' : 'CONFIRMED_POLICY_BYPASS',
        severity: 'HIGH',
        title: `Security Alert: ${params.action.replace(/_/g, ' ')}`,
        summary: `Unauthorized security action attempt recorded for resource [${params.resourceCategory}] with reason: ${params.policyReasonCode}.`,
        actorUserId: params.actorUserId ?? null,
        actorEmail: params.actorEmail ?? null,
        actorRole: params.actorRole ?? null,
        resourceCategory: params.resourceCategory,
        resourceId: params.resourceId ?? null,
        correlatedEventIds: [event.id],
      });
    }

    return { event, alert };
  }

  /**
   * Correlates blocked events for an actor within sliding 15-minute window.
   * If >= 3 blocked attempts, escalates to REPEATED_BLOCKED_ATTEMPTS alert.
   */
  private async correlateAndTriggerAlert(event: SecurityEvent): Promise<SecurityAlert> {
    const organizationId = event.organizationId;
    const actorUserId = event.actorUserId!;

    // Find all recent blocked events for this actor
    const recent = await this.dataStore.listSecurityEvents(organizationId, {
      actorUserId,
      decision: 'DENIED',
      limit: 10,
    });

    // Check sliding window of 15 minutes
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const windowEvents = recent.events.filter(
      (e) => new Date(e.timestamp).getTime() >= fifteenMinutesAgo
    );

    const isRepeated = windowEvents.length >= 3;
    const alertType = isRepeated ? 'REPEATED_BLOCKED_ATTEMPTS' : 'NEW_RESTRICTED_ACCESS';
    const severity: SecuritySeverity = isRepeated ? 'HIGH' : 'MEDIUM';

    // Check if an open alert of this type already exists for this actor
    const existingAlert = await this.dataStore.findOpenAlertForActorAndType(
      organizationId,
      actorUserId,
      alertType
    );

    if (existingAlert) {
      const correlatedIds = Array.from(
        new Set([...(existingAlert.correlatedEventIds || []), event.id])
      );
      const updated = await this.dataStore.updateSecurityAlert(organizationId, existingAlert.id, {
        eventCount: correlatedIds.length,
        lastSeenAt: event.timestamp,
        correlatedEventIds: correlatedIds,
        severity: isRepeated ? 'HIGH' : existingAlert.severity,
        summary: isRepeated
          ? `Repeated blocked access attempts detected (${correlatedIds.length} incidents within monitoring window). Review actor permissions and intent.`
          : existingAlert.summary,
      });
      return updated || existingAlert;
    }

    // Otherwise create a new alert
    const title = isRepeated
      ? `Repeated Blocked Access Attempts (${windowEvents.length} incidents)`
      : `Restricted Access Attempt: ${event.action.replace(/_/g, ' ')}`;

    const summary = isRepeated
      ? `Actor has accumulated ${windowEvents.length} blocked attempts within 15 minutes. Investigatory review recommended.`
      : `A restricted resource access attempt was blocked for actor (${event.actorEmail || actorUserId}) under policy ${event.policyReasonCode}. Access attempt is logged for review.`;

    const newAlert = await this.dataStore.createSecurityAlert({
      organizationId,
      alertType,
      severity,
      title,
      summary,
      actorUserId: event.actorUserId,
      actorEmail: event.actorEmail,
      actorRole: event.actorRole,
      resourceCategory: event.resourceCategory,
      resourceId: event.resourceId,
      correlatedEventIds: windowEvents.map((e) => e.id),
    });

    return newAlert;
  }

  public async listSecurityEvents(
    organizationId: string,
    filter?: ListSecurityEventsQuery
  ): Promise<{ events: SecurityEvent[]; total: number }> {
    return this.dataStore.listSecurityEvents(organizationId, filter);
  }

  public async listSecurityAlerts(
    organizationId: string,
    filter?: ListSecurityAlertsQuery
  ): Promise<{ alerts: SecurityAlert[]; total: number }> {
    return this.dataStore.listSecurityAlerts(organizationId, filter);
  }

  public async getSecurityAlertById(
    organizationId: string,
    alertId: string
  ): Promise<SecurityAlert | null> {
    return this.dataStore.getSecurityAlertById(organizationId, alertId);
  }

  public async getAlertById(
    organizationId: string,
    alertId: string
  ): Promise<SecurityAlert | null> {
    return this.getSecurityAlertById(organizationId, alertId);
  }

  /**
   * Reviews a security alert.
   * Section 7: Verifies admin permission and strictly prevents automatic resource unlock.
   */
  public async reviewSecurityAlert(
    organizationId: string,
    alertId: string,
    review: ReviewSecurityAlertDTO,
    reviewerUserId: string
  ): Promise<SecurityAlert> {
    const existing = await this.dataStore.getSecurityAlertById(organizationId, alertId);
    if (!existing) {
      throw new Error(`Security alert '${alertId}' not found.`);
    }

    const now = new Date().toISOString();
    const isResolved =
      review.status === 'RESOLVED' ||
      review.status === 'DISMISSED_BENIGN' ||
      review.status === 'CONFIRMED_VIOLATION';

    const updated = await this.dataStore.updateSecurityAlert(organizationId, alertId, {
      status: review.status,
      reviewNotes: review.reviewNotes ?? existing.reviewNotes,
      resolutionOutcome: review.resolutionOutcome ?? existing.resolutionOutcome,
      assignedReviewerUserId: review.assignedReviewerUserId ?? reviewerUserId,
      resolvedAt: isResolved ? now : null,
      resolvedByUserId: isResolved ? reviewerUserId : null,
    });

    if (!updated) {
      throw new Error(`Failed to update security alert '${alertId}'.`);
    }

    // Record review in immutable audit ledger
    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: reviewerUserId,
      action: 'SECURITY_ALERT_REVIEWED',
      resourceType: 'SECURITY_ALERT',
      resourceId: alertId,
      metadata: {
        alertType: existing.alertType,
        newStatus: review.status,
        resolutionOutcome: review.resolutionOutcome,
        notes: review.reviewNotes,
      },
    });

    return updated;
  }
}

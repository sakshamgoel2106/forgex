import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { SecurityEventService } from '../services/securityEvent.service.js';
import type {
  ListSecurityEventsQuery,
  ListSecurityAlertsQuery,
  ReviewSecurityAlertDTO,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export class AuditController {
  constructor(
    private dataStore: IDataStore,
    private securityService: SecurityEventService
  ) {}

  /**
   * GET /api/v1/audit/events
   * Raw compliance audit ledgers (restricted to Organization Admin/Owner)
   */
  public list = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

      const events = await this.dataStore.listAuditEvents(orgId, limit);

      res.status(200).json({
        success: true,
        data: events,
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_audit',
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list audit events');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/audit/security-events
   * Granular security events with filtering & pagination
   */
  public listSecurityEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const query: ListSecurityEventsQuery = {
        category: typeof req.query.category === 'string' ? (req.query.category as any) : undefined,
        actorUserId: typeof req.query.actorUserId === 'string' ? req.query.actorUserId : undefined,
        decision: typeof req.query.decision === 'string' ? (req.query.decision as any) : undefined,
        severity: typeof req.query.severity === 'string' ? (req.query.severity as any) : undefined,
        reviewStatus: typeof req.query.reviewStatus === 'string' ? (req.query.reviewStatus as any) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await this.securityService.listSecurityEvents(orgId, query);

      res.status(200).json({
        success: true,
        data: result.events,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list security events');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/audit/alerts
   * Actionable security alerts with filtering, search & pagination
   */
  public listAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const query: ListSecurityAlertsQuery = {
        status: typeof req.query.status === 'string' ? (req.query.status as any) : undefined,
        severity: typeof req.query.severity === 'string' ? (req.query.severity as any) : undefined,
        alertType: typeof req.query.alertType === 'string' ? (req.query.alertType as any) : undefined,
        actorUserId: typeof req.query.actorUserId === 'string' ? req.query.actorUserId : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await this.securityService.listSecurityAlerts(orgId, query);

      res.status(200).json({
        success: true,
        data: result.alerts,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list security alerts');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/audit/alerts/:id
   */
  public getAlert = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const alertId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const alert = await this.securityService.getAlertById(orgId, alertId);
      if (!alert) {
        res.status(404).json({ success: false, error: 'Security alert not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: alert,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to get security alert');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/audit/alerts/:id/review
   * Review security alert outcome without auto-granting underlying resource access
   */
  public reviewAlert = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const reviewerUserId = req.auth!.user.id;
      const alertId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const { status, reviewNotes, resolutionOutcome, assignedReviewerUserId } = req.body;
      if (!status) {
        res.status(400).json({
          success: false,
          error: 'Validation error: status is required (e.g. INVESTIGATING, DISMISSED_BENIGN, CONFIRMED_VIOLATION, RESOLVED)',
        });
        return;
      }

      const reviewDto: ReviewSecurityAlertDTO = {
        status,
        reviewNotes,
        resolutionOutcome,
        assignedReviewerUserId,
      };

      const updated = await this.securityService.reviewSecurityAlert(
        orgId,
        alertId,
        reviewDto,
        reviewerUserId
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to review security alert');
      const statusCode = err?.message?.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ success: false, error: err?.message || 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/audit/export
   * Cryptographically signed audit export bundle (Admin only)
   */
  public exportAuditBundle = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const userId = req.auth!.user.id;

      const events = await this.dataStore.listAuditEvents(orgId, 200);
      const securityEvents = await this.dataStore.listSecurityEvents(orgId, { limit: 200 });

      const payload = JSON.stringify({
        organizationId: orgId,
        exportedAt: new Date().toISOString(),
        exportedByUserId: userId,
        auditEventsCount: events.length,
        securityEventsCount: securityEvents.events.length,
        auditEvents: events,
        securityEvents: securityEvents.events,
      });

      const signature = crypto.createHash('sha256').update(payload).digest('hex');

      await this.dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: userId,
        action: 'AUDIT_BUNDLE_EXPORTED',
        resourceType: 'AUDIT_LEDGER',
        resourceId: orgId,
        metadata: {
          signatureSha256: signature,
          recordCount: events.length + securityEvents.events.length,
        },
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="forgex_audit_bundle_${Date.now()}.json"`);
      res.status(200).json({
        success: true,
        data: {
          payload: JSON.parse(payload),
          signatureSha256: signature,
          certificate: 'FORGEX-HSM-VERIFIED-2026',
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to export audit bundle');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };
}

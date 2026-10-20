import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import type {
  RootCauseStatus,
  MaintenanceVerificationState,
  ResolutionApprovalStatus,
} from '@forgex/shared-types';

function getParam(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? '') : (param ?? '');
}

export function createMaintenanceRecordRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * GET /api/v1/maintenance-records
   * List durable maintenance records with role and tenant isolation
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth!.organization.id;
      const {
        machineId,
        plantId,
        ticketId,
        faultCategory,
        rootCauseStatus,
        verificationState,
        approvalStatus,
        requiresRestartApproval,
        restartApproved,
      } = req.query;

      const records = await dataStore.listMaintenanceRecords(organizationId, {
        machineId: typeof machineId === 'string' ? machineId : undefined,
        plantId: typeof plantId === 'string' ? plantId : undefined,
        ticketId: typeof ticketId === 'string' ? ticketId : undefined,
        faultCategory: typeof faultCategory === 'string' ? faultCategory : undefined,
        rootCauseStatus: typeof rootCauseStatus === 'string' ? (rootCauseStatus as RootCauseStatus) : undefined,
        verificationState:
          typeof verificationState === 'string'
            ? (verificationState as MaintenanceVerificationState)
            : undefined,
        approvalStatus:
          typeof approvalStatus === 'string'
            ? (approvalStatus as ResolutionApprovalStatus)
            : undefined,
        requiresRestartApproval:
          requiresRestartApproval !== undefined ? requiresRestartApproval === 'true' : undefined,
        restartApproved: restartApproved !== undefined ? restartApproved === 'true' : undefined,
      });

      res.status(200).json({ success: true, data: records });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list maintenance records');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /api/v1/maintenance-records/:id
   * Get single maintenance record by ID
   */
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth!.organization.id;
      const id = getParam(req.params.id);

      const record = await dataStore.getMaintenanceRecordById(organizationId, id);
      if (!record) {
        res.status(404).json({ success: false, error: 'Maintenance record not found' });
        return;
      }

      res.status(200).json({ success: true, data: record });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to get maintenance record');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * PATCH /api/v1/maintenance-records/:id
   * Update maintenance record with versioned audit trail
   */
  router.patch(
    '/:id',
    requireRole([
      'TECHNICIAN',
      'ENGINEER',
      'ENGINEER_TECHNICIAN',
      'PLANT_MANAGER',
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
    ]),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const organizationId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = getParam(req.params.id);

        const {
          observedSymptoms,
          measurements,
          rootCause,
          rootCauseStatus,
          repairActions,
          partsReplaced,
          postRepairTestResults,
          verificationState,
          verificationNotes,
          requiresRestartApproval,
          restartApproved,
          approvalStatus,
          note,
        } = req.body;

        const updated = await dataStore.updateMaintenanceRecord(organizationId, id, {
          observedSymptoms,
          measurements,
          rootCause,
          rootCauseStatus,
          repairActions,
          partsReplaced,
          postRepairTestResults,
          verificationState,
          verificationNotes,
          requiresRestartApproval,
          restartApproved,
          approvalStatus,
          actorUserId,
          note: note || 'Maintenance record updated via API',
        });

        if (!updated) {
          res.status(404).json({ success: false, error: 'Maintenance record not found' });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId,
          action: 'MAINTENANCE_RECORD_UPDATED',
          resourceType: 'MAINTENANCE_RECORD',
          resourceId: id,
          metadata: {
            recordNumber: updated.recordNumber,
            version: updated.recordVersion,
            auditCount: updated.auditTrail.length,
          },
        });

        res.status(200).json({
          success: true,
          message: `Maintenance record updated. Now at version ${updated.recordVersion}.`,
          data: updated,
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to update maintenance record');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/maintenance-records/:id/verify
   * Perform post-repair verification check
   */
  router.post(
    '/:id/verify',
    requireRole([
      'TECHNICIAN',
      'ENGINEER',
      'ENGINEER_TECHNICIAN',
      'PLANT_MANAGER',
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
    ]),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const organizationId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = getParam(req.params.id);
        const { verificationState, verificationNotes } = req.body;

        if (!verificationState || !['PASSED', 'FAILED', 'PENDING'].includes(verificationState)) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: verificationState must be PASSED, FAILED, or PENDING.',
          });
          return;
        }

        const updated = await dataStore.updateMaintenanceRecord(organizationId, id, {
          verificationState,
          verificationNotes,
          verifiedByUserId: actorUserId,
          verifiedAt: new Date().toISOString(),
          actorUserId,
          note: `Post-repair verification state updated to ${verificationState}`,
        });

        if (!updated) {
          res.status(404).json({ success: false, error: 'Maintenance record not found' });
          return;
        }

        res.status(200).json({
          success: true,
          message: `Verification state recorded as ${verificationState}.`,
          data: updated,
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to update verification state');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/maintenance-records/:id/approve-knowledge
   * Admin reviews and elevates findings into approved reusable evidence
   */
  router.post(
    '/:id/approve-knowledge',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const organizationId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = getParam(req.params.id);
        const { approved = true, notes } = req.body;

        const updated = await dataStore.updateMaintenanceRecord(organizationId, id, {
          knowledgeApproved: approved,
          actorUserId,
          note: `Technician findings ${approved ? 'elevated to approved knowledge' : 'declined for general knowledge promotion'}: ${notes || ''}`,
        });

        if (!updated) {
          res.status(404).json({ success: false, error: 'Maintenance record not found' });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId,
          action: 'MAINTENANCE_RECORD_KNOWLEDGE_ELEVATED',
          resourceType: 'MAINTENANCE_RECORD',
          resourceId: id,
          metadata: { knowledgeApproved: approved, recordNumber: updated.recordNumber },
        });

        res.status(200).json({
          success: true,
          message: `Maintenance record ${updated.recordNumber} knowledge approval set to ${approved}.`,
          data: updated,
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to approve record knowledge');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  return router;
}

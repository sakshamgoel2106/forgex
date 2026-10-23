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
import { HistoricalFaultService } from '../services/historicalFaultService.js';

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
        caseId,
        faultCategory,
        rootCauseStatus,
        verificationState,
        approvalStatus,
        requiresRestartApproval,
        restartApproved,
        technicianUserId,
        isRecurring,
        dateFrom,
        dateTo,
        sortOrder,
        limit,
        offset,
      } = req.query;

      // 1. Tenant ownership validation on entity references to prevent cross-tenant probing
      if (typeof machineId === 'string' && machineId.trim()) {
        const m = await dataStore.getMachineById(organizationId, machineId.trim());
        if (!m) {
          res.status(404).json({ success: false, error: 'Machine not found in this organization' });
          return;
        }
      }

      if (typeof ticketId === 'string' && ticketId.trim()) {
        const t = await dataStore.getSpecialistTicketById(organizationId, ticketId.trim());
        if (!t) {
          res.status(404).json({ success: false, error: 'Work order ticket not found in this organization' });
          return;
        }
      }

      if (typeof caseId === 'string' && caseId.trim()) {
        const c = await dataStore.getMaintenanceCaseById(organizationId, caseId.trim());
        if (!c) {
          res.status(404).json({ success: false, error: 'Work order case not found in this organization' });
          return;
        }
      }

      if (typeof plantId === 'string' && plantId.trim()) {
        const p = await dataStore.getPlantById(organizationId, plantId.trim());
        if (!p) {
          res.status(404).json({ success: false, error: 'Plant not found in this organization' });
          return;
        }
      }

      // 2. Allowlisted Enum Validation
      if (
        rootCauseStatus &&
        typeof rootCauseStatus === 'string' &&
        !['CONFIRMED', 'SUSPECTED', 'UNKNOWN'].includes(rootCauseStatus)
      ) {
        res.status(400).json({
          success: false,
          error: 'Validation Error: rootCauseStatus must be CONFIRMED, SUSPECTED, or UNKNOWN.',
        });
        return;
      }

      if (
        verificationState &&
        typeof verificationState === 'string' &&
        !['PASSED', 'FAILED', 'PENDING', 'NOT_APPLICABLE'].includes(verificationState)
      ) {
        res.status(400).json({
          success: false,
          error: 'Validation Error: verificationState must be PASSED, FAILED, PENDING, or NOT_APPLICABLE.',
        });
        return;
      }

      if (
        approvalStatus &&
        typeof approvalStatus === 'string' &&
        !['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NOT_REQUIRED'].includes(approvalStatus)
      ) {
        res.status(400).json({
          success: false,
          error: 'Validation Error: approvalStatus must be PENDING_APPROVAL, APPROVED, REJECTED, or NOT_REQUIRED.',
        });
        return;
      }

      if (sortOrder && typeof sortOrder === 'string' && !['asc', 'desc'].includes(sortOrder.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: 'Validation Error: sortOrder must be asc or desc.',
        });
        return;
      }

      // 3. Date Range Validation
      if (dateFrom && typeof dateFrom === 'string' && isNaN(Date.parse(dateFrom))) {
        res.status(400).json({
          success: false,
          error: 'Validation Error: dateFrom must be a valid ISO date string.',
        });
        return;
      }

      if (dateTo && typeof dateTo === 'string' && isNaN(Date.parse(dateTo))) {
        res.status(400).json({
          success: false,
          error: 'Validation Error: dateTo must be a valid ISO date string.',
        });
        return;
      }

      // 4. Pagination limits
      let parsedLimit: number | undefined;
      let parsedOffset: number | undefined;
      if (limit !== undefined) {
        const parsed = parseInt(String(limit), 10);
        if (isNaN(parsed) || parsed < 1) {
          res.status(400).json({ success: false, error: 'Validation Error: limit must be a positive integer.' });
          return;
        }
        parsedLimit = Math.min(parsed, 100);
      }

      if (offset !== undefined) {
        const parsed = parseInt(String(offset), 10);
        if (isNaN(parsed) || parsed < 0) {
          res.status(400).json({ success: false, error: 'Validation Error: offset must be a non-negative integer.' });
          return;
        }
        parsedOffset = parsed;
      }

      const filterOptions = {
        machineId: typeof machineId === 'string' ? machineId.trim() : undefined,
        plantId: typeof plantId === 'string' ? plantId.trim() : undefined,
        ticketId: typeof ticketId === 'string' ? ticketId.trim() : undefined,
        caseId: typeof caseId === 'string' ? caseId.trim() : undefined,
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
        technicianUserId: typeof technicianUserId === 'string' ? technicianUserId : undefined,
        isRecurring: isRecurring !== undefined ? isRecurring === 'true' : undefined,
        dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' ? dateTo : undefined,
        sortOrder: typeof sortOrder === 'string' ? (sortOrder.toLowerCase() as 'asc' | 'desc') : undefined,
        limit: parsedLimit,
        offset: parsedOffset,
      };

      const [records, total] = await Promise.all([
        dataStore.listMaintenanceRecords(organizationId, filterOptions),
        dataStore.countMaintenanceRecords(organizationId, filterOptions),
      ]);

      res.status(200).json({
        success: true,
        data: records,
        pagination: {
          total,
          limit: parsedLimit ?? total,
          offset: parsedOffset ?? 0,
          hasMore: (parsedOffset ?? 0) + records.length < total,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list maintenance records');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/maintenance-records
   * Create durable maintenance record
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth!.organization.id;
      const data = req.body;

      let plantId = data.plantId;
      if (!plantId) {
        const plants = await dataStore.listPlants(organizationId);
        plantId = plants[0]?.id || 'plant-default';
      }

      // Restrict RCA records: Only 100% verified and passed investigations can be logged to Maintenance History
      const isRcaRecord =
        data.ticketNumber?.startsWith('RCA-') ||
        data.faultCategory === 'RCA_SESSION' ||
        data.source === 'RCA';
      if (isRcaRecord && data.verificationState !== 'PASSED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_RCA_VERIFICATION_REQUIRED',
            message:
              'Incomplete, halted, or failed RCAs cannot be logged to permanent Maintenance History. Only 100% verified investigations are permitted.',
          },
        });
        return;
      }

      const record = await dataStore.createMaintenanceRecord(organizationId, {
        plantId,
        machineId: data.machineId || data.assetId || 'machine-default',
        machineAssetTag: data.machineAssetTag || data.assetTag || 'PLANT-MACHINE',
        ticketNumber: data.ticketNumber || `MR-${Date.now()}`,
        problemStatement: data.problemStatement || 'Operational maintenance procedure',
        rootCause: data.rootCause || 'Verified condition cleared',
        faultCategory: data.faultCategory || 'MAINTENANCE',
        repairActions: Array.isArray(data.repairActions) && data.repairActions.length > 0 ? data.repairActions : ['Investigation steps completed'],
        reportingUserId: req.auth!.user.id,
        reportingUserName: req.auth!.user.fullName,
        resolvingTechnicianUserId: req.auth!.user.id,
        resolvingTechnicianName: req.auth!.user.fullName || 'Technician',
        verificationState: data.verificationState || 'PASSED',
        approvalStatus: data.approvalStatus || 'APPROVED',
        resolvedAt: data.resolvedAt || new Date().toISOString(),
        observedSymptoms: Array.isArray(data.observedSymptoms) ? data.observedSymptoms : [],
      });

      res.status(201).json({
        success: true,
        data: record,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to create maintenance record');
      res.status(500).json({ success: false, error: err?.message || 'Failed to create maintenance record' });
    }
  });

  /**
   * GET /api/v1/maintenance-records/similar
   * Retrieve similar historical records with relevance matching
   */
  router.get('/similar', async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth!.organization.id;
      const userRole = req.auth?.membership?.role;
      const { machineId, query, faultCategory, faultCode, componentId, limit, minScore, timeWindowDays } = req.query;

      if (!machineId || typeof machineId !== 'string') {
        res.status(400).json({ success: false, error: 'Validation Error: machineId is required to retrieve similar historical faults.' });
        return;
      }

      const machine = await dataStore.getMachineById(organizationId, machineId.trim());
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found in this organization' });
        return;
      }

      const historicalFaultService = new HistoricalFaultService(dataStore);
      const results = await historicalFaultService.matchHistoricalFaults(
        organizationId,
        machineId.trim(),
        {
          query: typeof query === 'string' ? query : undefined,
          faultCategory: typeof faultCategory === 'string' ? faultCategory : undefined,
          faultCode: typeof faultCode === 'string' ? faultCode : undefined,
          componentId: typeof componentId === 'string' ? componentId : undefined,
          limit: limit ? Number(limit) : undefined,
          minScore: minScore ? Number(minScore) : undefined,
          timeWindowDays: timeWindowDays ? Number(timeWindowDays) : undefined,
        },
        userRole
      );

      res.status(200).json({ success: true, data: results });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to retrieve similar maintenance records');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
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

        // Validation for enum inputs
        if (
          rootCauseStatus &&
          !['CONFIRMED', 'SUSPECTED', 'UNKNOWN'].includes(rootCauseStatus)
        ) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: rootCauseStatus must be CONFIRMED, SUSPECTED, or UNKNOWN.',
          });
          return;
        }

        if (
          verificationState &&
          !['PASSED', 'FAILED', 'PENDING', 'NOT_APPLICABLE'].includes(verificationState)
        ) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: verificationState must be PASSED, FAILED, PENDING, or NOT_APPLICABLE.',
          });
          return;
        }

        if (
          approvalStatus &&
          !['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NOT_REQUIRED'].includes(approvalStatus)
        ) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: approvalStatus must be PENDING_APPROVAL, APPROVED, REJECTED, or NOT_REQUIRED.',
          });
          return;
        }

        if (repairActions !== undefined && (!Array.isArray(repairActions) || repairActions.some((a) => typeof a !== 'string'))) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: repairActions must be an array of strings.',
          });
          return;
        }

        if (measurements !== undefined) {
          if (!Array.isArray(measurements)) {
            res.status(400).json({ success: false, error: 'Validation Error: measurements must be an array.' });
            return;
          }
          for (const m of measurements) {
            if (!m.parameterName || m.value === undefined || typeof m.value !== 'number' || !m.unit) {
              res.status(400).json({
                success: false,
                error: 'Validation Error: Each measurement must include parameterName, numeric value, and unit.',
              });
              return;
            }
          }
        }

        if (partsReplaced !== undefined) {
          if (!Array.isArray(partsReplaced)) {
            res.status(400).json({ success: false, error: 'Validation Error: partsReplaced must be an array.' });
            return;
          }
          for (const p of partsReplaced) {
            if (!p.partNumber || typeof p.quantity !== 'number' || p.quantity < 1) {
              res.status(400).json({
                success: false,
                error: 'Validation Error: Each replaced part must include partNumber and positive quantity.',
              });
              return;
            }
          }
        }

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

        if (
          !verificationState ||
          !['PASSED', 'FAILED', 'PENDING', 'NOT_APPLICABLE'].includes(verificationState)
        ) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: verificationState must be PASSED, FAILED, PENDING, or NOT_APPLICABLE.',
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

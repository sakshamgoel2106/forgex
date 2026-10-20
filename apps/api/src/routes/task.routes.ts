import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore, CreateMissingInfoTaskDTO, MissingInfoTaskFilterOptions } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createTaskRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * POST /api/v1/tasks
   * Admin / Plant Manager creates a missing-information task
   */
  router.post(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const { machineId, assignedUserId, assignedRole, requestedFields, instructions, dueDate } = req.body;

        if (!machineId || !Array.isArray(requestedFields) || requestedFields.length === 0 || !instructions) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'machineId, requestedFields (non-empty array), and instructions are required.',
            },
          });
          return;
        }

        const dto: CreateMissingInfoTaskDTO = {
          machineId,
          assignedUserId: assignedUserId || null,
          assignedRole: assignedRole || null,
          requestedFields,
          instructions,
          dueDate: dueDate || null,
        };

        const task = await dataStore.createMissingInfoTask(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'TASK_CREATED',
          resourceType: 'MISSING_INFO_TASK',
          resourceId: task.id,
          metadata: { machineId: task.machineId, requestedFields: task.requestedFields },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(201).json({
          success: true,
          message: 'Missing information task created and assigned.',
          data: task,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_TASK_CREATION_FAILED', message: err?.message || 'Failed to create task' },
        });
      }
    }
  );

  /**
   * GET /api/v1/tasks
   * Lists tasks with filtering by machine, assigned user, or status
   */
  router.get(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'VIEWER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const filters: MissingInfoTaskFilterOptions = {
          machineId: req.query.machineId as string | undefined,
          assignedUserId: req.query.assignedUserId as string | undefined,
          status: req.query.status as string | undefined,
        };

        const tasks = await dataStore.listMissingInfoTasks(orgId, filters);

        res.status(200).json({
          success: true,
          data: tasks,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_LIST_FAILED', message: err?.message || 'Failed to list tasks' },
        });
      }
    }
  );

  /**
   * GET /api/v1/tasks/:id
   */
  router.get(
    '/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'VIEWER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const task = await dataStore.getMissingInfoTaskById(orgId, id);
        if (!task) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Task not found.' },
          });
          return;
        }

        res.status(200).json({
          success: true,
          data: task,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_GET_FAILED', message: err?.message || 'Failed to get task' },
        });
      }
    }
  );

  /**
   * POST /api/v1/tasks/:id/submit
   * Technician submits gathered specifications, evidence, and observations.
   * NOTE: This does NOT silently alter machine verified facts; review is mandatory.
   */
  router.post(
    '/:id/submit',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { submittedValues, evidenceDescription, evidenceAttachmentKeys } = req.body;

        if (!submittedValues || typeof submittedValues !== 'object') {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: 'submittedValues object is required.' },
          });
          return;
        }

        const task = await dataStore.getMissingInfoTaskById(orgId, id);
        if (!task) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Task not found.' },
          });
          return;
        }

        const updated = await dataStore.updateMissingInfoTask(orgId, id, {
          status: 'SUBMITTED',
          submittedValues,
          submittedByUserId: actorUserId,
          submittedAt: new Date().toISOString(),
          evidenceDescription: evidenceDescription || null,
          evidenceAttachmentKeys: Array.isArray(evidenceAttachmentKeys) ? evidenceAttachmentKeys : [],
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'TASK_SUBMITTED_FOR_REVIEW',
          resourceType: 'MISSING_INFO_TASK',
          resourceId: id,
          metadata: { submittedFields: Object.keys(submittedValues) },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Task submission received and queued for administrator review.',
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_SUBMIT_FAILED', message: err?.message || 'Failed to submit task' },
        });
      }
    }
  );

  /**
   * POST /api/v1/tasks/:id/review
   * Reviewer (Admin or Plant Manager) approves or requests changes.
   * If approved: values are promoted into verified machine record.
   */
  router.post(
    '/:id/review',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { action, feedback } = req.body; // action: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT'

        if (!action || !['APPROVE', 'REQUEST_CHANGES', 'REJECT'].includes(action)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: "action must be 'APPROVE', 'REQUEST_CHANGES', or 'REJECT'.",
            },
          });
          return;
        }

        const task = await dataStore.getMissingInfoTaskById(orgId, id);
        if (!task) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Task not found.' },
          });
          return;
        }

        const newStatus =
          action === 'APPROVE'
            ? 'APPROVED'
            : action === 'REQUEST_CHANGES'
              ? 'CHANGES_REQUESTED'
              : 'REJECTED';

        const updated = await dataStore.updateMissingInfoTask(orgId, id, {
          status: newStatus,
          reviewFeedback: feedback || null,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date().toISOString(),
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: `TASK_REVIEW_${action}`,
          resourceType: 'MISSING_INFO_TASK',
          resourceId: id,
          metadata: { decision: action, machineId: task.machineId },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message:
            action === 'APPROVE'
              ? 'Technical submission approved and promoted to verified machine ledger.'
              : `Review decision '${action}' recorded.`,
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_REVIEW_FAILED', message: err?.message || 'Failed to review task' },
        });
      }
    }
  );

  return router;
}

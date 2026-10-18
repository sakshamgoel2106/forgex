import { Router } from 'express';
import { MaintenanceController } from '../controllers/maintenance.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { MaintenanceWorkflowEngine } from '../services/maintenanceWorkflowEngine.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createMaintenanceRouter(
  dataStore: IDataStore,
  workflowEngine: MaintenanceWorkflowEngine
): Router {
  const router = Router();
  const controller = new MaintenanceController(dataStore, workflowEngine);

  // List maintenance cases
  router.get(
    '/cases',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.listCases
  );

  // Create maintenance case
  router.post(
    '/cases',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.createCase
  );

  // Get case with history and audit trail
  router.get(
    '/cases/:id',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.getCaseById
  );

  // Trigger diagnostic hypothesis & checklist generation
  router.post(
    '/cases/:id/diagnose',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.diagnoseCase
  );

  // Update checklist step
  router.patch(
    '/cases/:id/steps/:stepId',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.updateChecklistStep
  );

  // Record findings and submit for approval
  router.post(
    '/cases/:id/findings',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.recordFindings
  );

  // Review approval (approve or reject work order)
  router.post(
    '/cases/:id/approval',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.reviewApproval
  );

  // Escalate case to human
  router.post(
    '/cases/:id/escalate',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.escalateCase
  );

  // Record feedback and nominate for expert knowledge
  router.post(
    '/cases/:id/feedback',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.recordFeedback
  );

  return router;
}

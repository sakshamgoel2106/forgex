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
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'VIEWER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.listCases
  );

  // Create maintenance case
  router.post(
    '/cases',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
      'VIEWER',
    ]),
    controller.createCase
  );

  // Get case with history, machine, and technician
  router.get(
    '/cases/:id',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'VIEWER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.getCaseById
  );

  // Update permitted work order fields
  router.patch(
    '/cases/:id',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.updateCase
  );

  // Trigger diagnostic hypothesis & checklist generation
  router.post(
    '/cases/:id/diagnose',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'VIEWER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.diagnoseCase
  );

  // Update checklist step
  router.patch(
    '/cases/:id/steps/:stepId',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.updateChecklistStep
  );

  // Record findings and submit for approval
  router.post(
    '/cases/:id/findings',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.recordFindings
  );

  // Review approval (approve or reject work order)
  router.post(
    '/cases/:id/approval',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.reviewApproval
  );

  // Assign technician to case
  router.post(
    '/cases/:id/assign',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.assignTechnician
  );

  // Unassign technician from case
  router.post(
    '/cases/:id/unassign',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.unassignTechnician
  );

  // List eligible technicians for assignment dropdown
  router.get(
    '/technicians',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.listTechnicians
  );

  // Formally close case
  router.post(
    '/cases/:id/close',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.closeCase
  );

  // Escalate case to human
  router.post(
    '/cases/:id/escalate',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'VIEWER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.escalateCase
  );

  // Record feedback and nominate for expert knowledge
  router.post(
    '/cases/:id/feedback',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'VIEWER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.recordFeedback
  );

  // Transition maintenance case status
  router.post(
    '/cases/:id/status',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'WORKER',
      'ENGINEER_TECHNICIAN',
    ]),
    controller.transitionStatus
  );

  // Reopen closed maintenance case (Administrative roles only)
  router.post(
    '/cases/:id/reopen',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
    ]),
    controller.reopenCase
  );

  // Delete maintenance case from active queue (Role-guarded: Admin/Supervisor)
  router.delete(
    '/cases/:id',
    requireRole([
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'SUPERVISOR',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
    ]),
    controller.deleteCase
  );

  return router;
}

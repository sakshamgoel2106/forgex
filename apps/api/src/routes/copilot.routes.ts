import { Router } from 'express';
import { CopilotController } from '../controllers/copilot.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { RAGQueryEngine } from '../services/ragQueryEngine.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createCopilotRouter(
  dataStore: IDataStore,
  ragEngine: RAGQueryEngine
): Router {
  const router = Router();
  const controller = new CopilotController(dataStore, ragEngine);

  // All authorized members can query Copilot and view conversation threads
  router.post(
    '/query',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.query
  );

  router.get(
    '/conversations',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.listConversations
  );

  router.get(
    '/conversations/:id',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.getConversation
  );

  router.delete(
    '/conversations/:id',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.deleteConversation
  );

  router.post(
    '/messages/:id/feedback',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.submitFeedback
  );

  return router;
}

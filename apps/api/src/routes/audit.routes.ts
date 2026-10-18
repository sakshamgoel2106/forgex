import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createAuditRouter(dataStore: IDataStore): Router {
  const router = Router();
  const controller = new AuditController(dataStore);

  // Only Organization Admin can query raw compliance audit ledgers
  router.get('/events', requireRole(['ORGANIZATION_ADMIN']), controller.list);

  return router;
}

import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { SecurityEventService } from '../services/securityEvent.service.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createAuditRouter(
  dataStore: IDataStore,
  securityService?: SecurityEventService
): Router {
  const router = Router();
  const secService = securityService || new SecurityEventService(dataStore);
  const controller = new AuditController(dataStore, secService);

  // Administrative Security & Audit Area (strictly restricted to Organization Admin/Owner)
  router.get('/events', requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']), controller.list);
  router.get('/security-events', requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']), controller.listSecurityEvents);
  router.get('/alerts', requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']), controller.listAlerts);
  router.get('/alerts/:id', requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']), controller.getAlert);
  router.post('/alerts/:id/review', requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']), controller.reviewAlert);
  router.post('/export', requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']), controller.exportAuditBundle);

  return router;
}

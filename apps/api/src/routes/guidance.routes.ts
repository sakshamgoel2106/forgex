import { Router } from 'express';
import { GuidanceController } from '../controllers/guidance.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requirePermission } from '../middleware/auth.middleware.js';

export function createGuidanceRouter(dataStore: IDataStore): Router {
  const router = Router();
  const controller = new GuidanceController(dataStore);

  // Admin-governed publication of approved operational guidance
  router.post('/publish', requirePermission('guidance:publish'), controller.publish);

  // Approved operational guidance accessible to workers and authorized roles
  router.get('/', requirePermission('guidance:read'), controller.list);
  router.get('/:id', requirePermission('guidance:read'), controller.getById);

  // Guidance lifecycle management (superseding and revoking)
  router.patch('/:id/supersede', requirePermission('guidance:manage'), controller.supersede);
  router.patch('/:id/revoke', requirePermission('guidance:manage'), controller.revoke);

  return router;
}

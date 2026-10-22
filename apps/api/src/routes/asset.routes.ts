import { Router } from 'express';
import { AssetController } from '../controllers/asset.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createAssetRouter(dataStore: IDataStore): Router {
  const router = Router();
  const controller = new AssetController(dataStore);

  // Owner, Admin, Plant Manager, Engineer can create assets
  router.post('/', requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'ENGINEER_TECHNICIAN']), controller.create);

  // All roles can read assets
  router.get(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'VIEWER', 'ENGINEER_TECHNICIAN', 'WORKER']),
    controller.list
  );
  router.get(
    '/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'VIEWER', 'ENGINEER_TECHNICIAN', 'WORKER']),
    controller.getById
  );

  return router;
}

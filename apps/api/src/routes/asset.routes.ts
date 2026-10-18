import { Router } from 'express';
import { AssetController } from '../controllers/asset.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createAssetRouter(dataStore: IDataStore): Router {
  const router = Router();
  const controller = new AssetController(dataStore);

  // Both Admin and Engineer/Technician can create assets
  router.post('/', requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']), controller.create);

  // All roles (including Viewer) can read assets
  router.get('/', requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']), controller.list);
  router.get('/:id', requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']), controller.getById);

  return router;
}

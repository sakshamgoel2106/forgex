import { Router } from 'express';
import { PlantController } from '../controllers/plant.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createPlantRouter(dataStore: IDataStore): Router {
  const router = Router();
  const controller = new PlantController(dataStore);

  // Both Admin and Engineer/Technician can create plants
  router.post('/', requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']), controller.create);

  // All roles (including Viewer) can read plants
  router.get('/', requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']), controller.list);
  router.get('/:id', requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']), controller.getById);

  return router;
}

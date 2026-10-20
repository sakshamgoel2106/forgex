import { Router } from 'express';
import { PlantController } from '../controllers/plant.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createPlantRouter(dataStore: IDataStore): Router {
  const router = Router();
  const controller = new PlantController(dataStore);

  // Owner, Admin, Plant Manager, Engineer can create plants
  router.post('/', requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'ENGINEER_TECHNICIAN']), controller.create);

  // All roles can read plants
  router.get(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'WORKER', 'VIEWER', 'ENGINEER_TECHNICIAN']),
    controller.list
  );
  router.get(
    '/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'WORKER', 'VIEWER', 'ENGINEER_TECHNICIAN']),
    controller.getById
  );

  return router;
}

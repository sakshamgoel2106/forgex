import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from '../controllers/document.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import type { IngestionQueue } from '../jobs/ingestionQueue.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createDocumentRouter(
  dataStore: IDataStore,
  storageAdapter: IStorageAdapter,
  ingestionQueue: IngestionQueue,
  vectorStore?: IVectorStoreAdapter
): Router {
  const router = Router();
  const controller = new DocumentController(dataStore, storageAdapter, ingestionQueue, vectorStore);

  // Configure Multer for secure in-memory streaming validation
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB maximum
      files: 1,
    },
  });

  // Upload: Organization Admin & Owner
  router.post(
    '/upload',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN']),
    upload.single('file'),
    controller.upload
  );

  // Read: Strictly restricted to authorized administrators (Workers, Techs, Engineers denied direct document access)
  router.get(
    '/',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN']),
    controller.list
  );

  router.get(
    '/:id',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN']),
    controller.getById
  );

  router.get(
    '/:id/pages',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN']),
    controller.getPages
  );

  router.get(
    '/:id/versions',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN']),
    controller.getVersions
  );

  router.get(
    '/:id/download',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN']),
    controller.download
  );

  // Retry processing: Admin & Engineer/Technician
  router.post(
    '/:id/versions/:versionId/retry',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.retry
  );

  // Delete: Organization Admin only
  router.delete(
    '/:id',
    requireRole(['ORGANIZATION_ADMIN']),
    controller.delete
  );

  return router;
}

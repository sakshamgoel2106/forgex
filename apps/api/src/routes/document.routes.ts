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

  const bulkUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB maximum
      files: 20,
    },
  });

  // Knowledge Hub Role Policy:
  // Administrative ingestion, raw manual retrieval, extracted page inspection,
  // reprocessing retries, and document lifecycle deletion are strictly restricted
  // to ORGANIZATION_OWNER and ORGANIZATION_ADMIN.
  const ADMIN_ROLES = ['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'] as const;

  // Ingestion: Strictly restricted to Organization Admin & Owner
  // Multer parses the multipart payload first so the HTTP stream is safely consumed before role checks
  router.post(
    '/upload',
    upload.single('file'),
    requireRole([...ADMIN_ROLES]),
    controller.upload
  );

  // Pre-Signed S3/MinIO Direct Upload: Bypasses Node.js event loop for 200MB+ PDFs and 500MB+ CAD STEP files
  router.post(
    '/presign-upload',
    requireRole([...ADMIN_ROLES]),
    controller.presignUpload
  );

  router.post(
    '/:id/complete-presign',
    requireRole([...ADMIN_ROLES]),
    controller.completePresignUpload
  );

  // Local dev upload PUT proxy
  router.put(
    '/presigned-put-proxy',
    controller.presignedPutProxy
  );

  // Bulk Ingestion: Admin & Owner only
  router.post(
    '/bulk-upload',
    bulkUpload.any(),
    requireRole([...ADMIN_ROLES]),
    controller.bulkUpload
  );

  // Read: Strictly restricted to authorized administrators (Workers, Techs, Engineers denied direct document access)
  router.get(
    '/',
    requireRole([...ADMIN_ROLES]),
    controller.list
  );

  router.get(
    '/:id',
    requireRole([...ADMIN_ROLES]),
    controller.getById
  );

  router.get(
    '/:id/pages',
    requireRole([...ADMIN_ROLES]),
    controller.getPages
  );

  router.get(
    '/:id/versions',
    requireRole([...ADMIN_ROLES]),
    controller.getVersions
  );

  router.get(
    '/:id/download',
    requireRole([...ADMIN_ROLES]),
    controller.download
  );

  // Retry processing: Admin & Owner only
  router.post(
    '/:id/versions/:versionId/retry',
    requireRole([...ADMIN_ROLES]),
    controller.retry
  );

  // Delete: Admin & Owner only
  router.delete(
    '/:id',
    requireRole([...ADMIN_ROLES]),
    controller.delete
  );

  return router;
}

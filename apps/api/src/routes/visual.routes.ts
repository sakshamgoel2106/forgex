import { Router } from 'express';
import multer from 'multer';
import { VisualController } from '../controllers/visual.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { VisualIntelligenceEngine } from '../services/visualIntelligenceEngine.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createVisualRouter(
  dataStore: IDataStore,
  storageAdapter: IStorageAdapter,
  visualEngine: VisualIntelligenceEngine
): Router {
  const router = Router();
  const controller = new VisualController(dataStore, storageAdapter, visualEngine);

  // Configure Multer for streaming image upload
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB maximum for high-res diagrams/photos
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (allowed.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported visual format '${file.mimetype}'. Supported formats are PNG, JPEG, and WebP.`));
      }
    },
  });

  // Visual Inspection endpoint (Supports multipart upload or JSON base64)
  router.post(
    '/inspect',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
        }
        next();
      });
    },
    controller.inspect
  );

  // List Visual Assets for Organization
  router.get(
    '/assets',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.listAssets
  );

  // Get Visual Asset Details
  router.get(
    '/assets/:id',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.getAssetById
  );

  // Stream raw visual asset image for side-by-side inspection
  router.get(
    '/assets/:id/image',
    requireRole(['ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER']),
    controller.getAssetImage
  );

  return router;
}

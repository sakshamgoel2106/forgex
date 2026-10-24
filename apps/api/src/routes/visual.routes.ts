import { Router } from 'express';
import multer from 'multer';
import { VisualController } from '../controllers/visual.controller.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import type { IVisionProcessingProvider } from '../ai/vision.interface.js';
import type { VisualIntelligenceEngine } from '../services/visualIntelligenceEngine.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { MultimodalVisionService } from '../ai/multimodalVisionService.js';

export function createVisualRouter(
  dataStore: IDataStore,
  storageAdapter: IStorageAdapter,
  visualEngine: VisualIntelligenceEngine,
  embeddingAdapter?: IEmbeddingAdapter,
  vectorStore?: IVectorStoreAdapter,
  visionProvider?: IVisionProcessingProvider
): Router {
  const router = Router();
  const controller = new VisualController(
    dataStore,
    storageAdapter,
    visualEngine,
    embeddingAdapter,
    vectorStore,
    visionProvider
  );

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

  // Configure Multer for comprehensive engineering and visual asset uploads (50MB limit)
  const engineeringUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      const dangerous = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'jar', 'msi', 'scr', 'dll'];
      if (dangerous.includes(ext)) {
        cb(new Error(`Security Violation: Upload of executable format '.${ext}' is prohibited.`));
        return;
      }
      cb(null, true);
    },
  });

  // Admin-Only Upload Endpoint for Machine Engineering & Visual Intelligence Assets
  router.post(
    '/upload',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    (req, res, next) => {
      engineeringUpload.single('file')(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_UPLOAD_FILTER_REJECTED',
              message: err.message,
            },
            timestamp: new Date().toISOString(),
          });
        }
        next();
      });
    },
    controller.upload
  );

  // Visual Inspection endpoint (Supports multipart upload or JSON base64)
  router.post(
    '/inspect',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
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

  // Multimodal Vision Diagnostic Endpoint (Hackathon Differentiator: Gauge & Part Inspection)
  router.post(
    '/analyze',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    async (req, res): Promise<void> => {
      try {
        const { imageBase64, visionMode, assetId, assetTag, language } = req.body;
        if (!imageBase64) {
          res.status(400).json({ success: false, error: 'imageBase64 payload is required' });
          return;
        }

        const diagnostic = await MultimodalVisionService.analyzeImage({
          imageBase64,
          visionMode,
          assetId,
          assetTag,
          language,
        });

        res.status(200).json({ success: true, data: diagnostic });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Visual analysis failed' });
      }
    }
  );

  // Vision-Locked LOTO Safety Gate Verification Endpoint
  router.post(
    '/loto-verify',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    async (req, res): Promise<void> => {
      try {
        const { imageBase64, assetTag, language } = req.body;
        if (!imageBase64) {
          res.status(400).json({ success: false, error: 'imageBase64 payload is required' });
          return;
        }

        const lotoResult = await MultimodalVisionService.verifyLotoSafetyGate({
          imageBase64,
          assetTag,
          language,
        });

        res.status(200).json({ success: true, data: lotoResult });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'LOTO verification failed' });
      }
    }
  );

  // List Visual Assets for Organization
  router.get(
    '/assets',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    controller.listAssets
  );

  // Get Visual Asset Details
  router.get(
    '/assets/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    controller.getAssetById
  );

  // Stream raw visual asset image for side-by-side inspection
  router.get(
    '/assets/:id/image',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    controller.getAssetImage
  );

  // Trigger text extraction, chunking, and Knowledge Hub/RAG ingestion on uploaded engineering documents
  router.post(
    '/assets/:id/process',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.processAsset
  );

  // Get real-time document processing and ingestion status
  router.get(
    '/assets/:id/processing-status',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    controller.getProcessingStatus
  );

  // Idempotently retry document processing on failure
  router.post(
    '/assets/:id/retry',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN']),
    controller.retryProcessing
  );

  return router;
}

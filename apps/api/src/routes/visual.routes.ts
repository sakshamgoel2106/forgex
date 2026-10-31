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
import { SecurityEventService } from '../services/securityEvent.service.js';
import { logger } from '../utils/logger.js';

export function createVisualRouter(
  dataStore: IDataStore,
  storageAdapter: IStorageAdapter,
  visualEngine: VisualIntelligenceEngine,
  embeddingAdapter?: IEmbeddingAdapter,
  vectorStore?: IVectorStoreAdapter,
  visionProvider?: IVisionProcessingProvider,
  securityService?: SecurityEventService
): Router {
  const router = Router();
  const secService = securityService || new SecurityEventService(dataStore);
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

        // Audit Log AI verification result to tamper-evident SecurityEvent ledger
        if (req.auth) {
          secService.recordSecurityEvent({
            organizationId: req.auth.organization.id,
            actorUserId: req.auth.user.id,
            actorEmail: req.auth.user.email,
            actorRole: req.auth.membership?.role || 'TECHNICIAN',
            category: 'RESTRICTED_ACTION',
            action: 'LOTO_ZERO_ENERGY_AI_VERIFY',
            resourceCategory: 'MACHINE',
            resourceId: assetTag || 'UNKNOWN_ASSET',
            decision: lotoResult.verified ? 'FLAGGED' : 'DENIED',
            policyReasonCode: lotoResult.verified
              ? 'LOTO_AI_ZERO_ENERGY_PRE_VERIFIED_AWAITING_HUMAN'
              : 'LOTO_RESIDUAL_PRESSURE_DETECTED_BLOCKED',
            severity: lotoResult.verified ? 'INFORMATIONAL' : 'HIGH',
            metadata: {
              assetTag,
              verified: lotoResult.verified,
              alertType: lotoResult.alertType,
              readingValue: lotoResult.diagnostic?.readingValue ?? null,
              readingUnit: lotoResult.diagnostic?.readingUnit ?? 'bar',
              safetyStatus: lotoResult.diagnostic?.safetyStatus,
              summary: lotoResult.diagnostic?.summary,
              safetyMessage: lotoResult.message,
              requiresHumanAttestation: true,
            },
          }).catch((auditErr) => logger.warn({ auditErr }, 'Failed to record LOTO AI verify SecurityEvent'));
        }

        res.status(200).json({ success: true, data: lotoResult });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'LOTO verification failed' });
      }
    }
  );

  // Explicit Human Physical Attestation Endpoint (Hold-to-confirm 1.5s)
  // IMPORTANT SAFETY REQUIREMENT: AI verification must never auto-pass the lockout.
  router.post(
    '/loto-attest',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'VIEWER']),
    async (req, res): Promise<void> => {
      try {
        const { assetId, assetTag, aiResult, humanAttestation, photoRef, timestamp, holdDurationMs } = req.body;
        if (!humanAttestation) {
          res.status(400).json({ success: false, error: 'Explicit human physical attestation is required to certify LOTO' });
          return;
        }

        const orgId = req.auth?.organization?.id || 'org_default';
        const user = req.auth?.user;

        const secEvent = await secService.recordSecurityEvent({
          organizationId: orgId,
          actorUserId: user?.id,
          actorEmail: user?.email,
          actorRole: req.auth?.membership?.role || 'TECHNICIAN',
          category: 'RESTRICTED_ACTION',
          action: 'LOTO_ZERO_ENERGY_HUMAN_ATTESTATION',
          resourceCategory: 'MACHINE',
          resourceId: assetId || assetTag || 'UNKNOWN_ASSET',
          decision: aiResult?.verified ? 'ALLOWED' : 'DENIED',
          policyReasonCode: aiResult?.verified
            ? 'LOTO_ZERO_ENERGY_PHYSICALLY_CONFIRMED'
            : 'LOTO_RESIDUAL_PRESSURE_UNRESOLVED',
          severity: aiResult?.verified ? 'INFORMATIONAL' : 'CRITICAL',
          metadata: {
            assetTag: assetTag || assetId,
            aiResult,
            humanAttestation: true,
            timestamp: timestamp || new Date().toISOString(),
            photoRef: photoRef ? (typeof photoRef === 'string' ? photoRef.slice(0, 100) : 'photo_recorded') : null,
            holdDurationMs: holdDurationMs || 1500,
            technicianName: user?.fullName || user?.email || 'Field Technician',
            lockoutPassed: Boolean(aiResult?.verified),
            workOrderUnlockAuthorized: Boolean(aiResult?.verified),
          },
        });

        res.status(200).json({
          success: true,
          data: {
            unlocked: Boolean(aiResult?.verified),
            securityEventId: secEvent.event.id,
            timestamp: secEvent.event.timestamp,
            decision: secEvent.event.decision,
            policyReasonCode: secEvent.event.policyReasonCode,
          },
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to record LOTO human attestation');
        res.status(500).json({ success: false, error: err?.message || 'Failed to record LOTO attestation' });
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

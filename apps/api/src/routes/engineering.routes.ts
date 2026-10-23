import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import type {
  IDataStore,
  CreateIndustryProfileDTO,
  CreateEngineeringModel3DDTO,
  CreateManufacturerResourceDTO,
  CreateEngineeringDrawingDTO,
} from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import type { CADFileFormat, DrawingType } from '@forgex/shared-types';
import { config } from '../config/env.js';
import { SvgSanitizer } from '../utils/svgSanitizer.js';
import { isValidGlbHeader } from '../utils/glbBuilder.js';
import { cadConversionService } from '../services/cadConversion.service.js';
import { logger } from '../utils/logger.js';

export function createEngineeringRouter(dataStore: IDataStore, storageAdapter?: IStorageAdapter): Router {
  const router = Router();

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

  // ==========================================================================
  // SECTION D: Industry & Asset Configuration (Universal Industry Support)
  // ==========================================================================

  /**
   * GET /api/v1/engineering/industry-profiles
   * List all industry profiles (global presets + custom organization profiles)
   */
  router.get('/industry-profiles', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const profiles = await dataStore.listIndustryProfiles(orgId);
      res.json({
        success: true,
        data: profiles,
        total: profiles.length,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to list industry profiles' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/industry-profiles/:code
   * Retrieve a specific industry profile by its standard or custom code
   */
  router.get('/industry-profiles/:code', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const code = String(req.params.code);
      const profile = await dataStore.getIndustryProfileByCode(orgId, code);

      if (!profile) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_PROFILE_NOT_FOUND', message: `Industry profile '${code}' not found.` },
        });
        return;
      }

      res.json({ success: true, data: profile });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to retrieve profile' },
      });
    }
  });

  /**
   * POST /api/v1/engineering/industry-profiles
   * Admin creates a custom industry profile
   */
  router.post(
    '/industry-profiles',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const { code, name, description, assetCategories, terminology, drawingTypes, customFields, standardCertifications } = req.body;

        if (!code || !name || !description || !terminology) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'code, name, description, and terminology definitions are required.',
            },
          });
          return;
        }

        const dto: CreateIndustryProfileDTO = {
          code,
          name,
          description,
          isCustom: true,
          assetCategories: Array.isArray(assetCategories) ? assetCategories : [],
          terminology: {
            tagLabel: terminology.tagLabel || 'Asset Tag',
            assetLabel: terminology.assetLabel || 'Machine',
            plantLabel: terminology.plantLabel || 'Facility',
            lineLabel: terminology.lineLabel || 'Production Line',
          },
          drawingTypes: Array.isArray(drawingTypes) ? drawingTypes : [],
          customFields: Array.isArray(customFields) ? customFields : [],
          standardCertifications: Array.isArray(standardCertifications) ? standardCertifications : [],
        };

        const profile = await dataStore.createIndustryProfile(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'INDUSTRY_PROFILE_CREATED',
          resourceType: 'INDUSTRY_PROFILE',
          resourceId: profile.id,
          metadata: { code: profile.code, name: profile.name },
        });

        res.status(201).json({ success: true, data: profile });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create industry profile';
        const isDuplicate = msg.includes('already exists');
        res.status(isDuplicate ? 409 : 500).json({
          success: false,
          error: { code: isDuplicate ? 'FORGEX_DUPLICATE_PROFILE' : 'FORGEX_INTERNAL_ERROR', message: msg },
        });
      }
    }
  );

  /**
   * PATCH /api/v1/engineering/industry-profiles/:id
   * Admin updates a custom industry profile or customizes a global preset
   */
  router.patch(
    '/industry-profiles/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const profileId = String(req.params.id);

        const updated = await dataStore.updateIndustryProfile(orgId, profileId, req.body);
        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_PROFILE_NOT_FOUND', message: 'Profile not found or access denied.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'INDUSTRY_PROFILE_UPDATED',
          resourceType: 'INDUSTRY_PROFILE',
          resourceId: updated.id,
          metadata: { updates: Object.keys(req.body) },
        });

        res.json({ success: true, data: updated });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to update profile' },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/engineering/industry-profiles/:id
   * Admin deletes a custom industry profile
   */
  router.delete(
    '/industry-profiles/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const profileId = String(req.params.id);

        const deleted = await dataStore.deleteIndustryProfile(orgId, profileId);
        if (!deleted) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_PROFILE_NOT_FOUND', message: 'Profile not found or cannot delete global preset.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'INDUSTRY_PROFILE_DELETED',
          resourceType: 'INDUSTRY_PROFILE',
          resourceId: profileId,
        });

        res.json({ success: true, message: 'Industry profile deleted successfully.' });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to delete profile' },
        });
      }
    }
  );

  // ==========================================================================
  // SECTION A: 3D Models & CAD Files
  // ==========================================================================

  /**
   * GET /api/v1/engineering/models
   * List 3D models with filtering
   */
  router.get('/models', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const plantId = req.query.plantId ? String(req.query.plantId) : undefined;
      const machineId = req.query.machineId ? String(req.query.machineId) : undefined;
      const status = req.query.status ? (String(req.query.status) as any) : undefined;
      const fileFormat = req.query.fileFormat ? (String(req.query.fileFormat).toUpperCase() as CADFileFormat) : undefined;
      const industryProfileCode = req.query.industryProfileCode ? String(req.query.industryProfileCode) : undefined;

      const models = await dataStore.listEngineeringModels3D(orgId, {
        plantId,
        machineId,
        status,
        fileFormat,
        industryProfileCode,
      });

      res.json({ success: true, data: models, total: models.length });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to list 3D models' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/models/:id
   * Get 3D model details
   */
  router.get('/models/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const model = await dataStore.getEngineeringModel3DById(orgId, String(req.params.id));

      if (!model) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MODEL_NOT_FOUND', message: 'Engineering 3D model not found.' },
        });
        return;
      }

      res.json({ success: true, data: model });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to get 3D model' },
      });
    }
  });

  /**
   * POST /api/v1/engineering/models
   * Admin registers / uploads a real machine 3D / CAD model
   */
  router.post(
    '/models',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const {
          plantId,
          machineId,
          industryProfileCode,
          assetCategory,
          title,
          manufacturer,
          modelNumber,
          sourceProvider,
          sourceUrl,
          fileFormat,
          fileSizeBytes,
          fileHashSha256,
          storageKey,
          modelRevision,
          dataClassification,
          licenseUsageRights,
          reviewNotes,
        } = req.body;

        if (!title || !fileFormat || fileSizeBytes === undefined || !fileHashSha256 || !storageKey) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'title, fileFormat, fileSizeBytes, fileHashSha256, and storageKey are required.',
            },
          });
          return;
        }

        const validFormats: CADFileFormat[] = ['GLB', 'GLTF', 'STEP', 'STP', 'IGES', 'IGS', 'STL', 'OBJ'];
        const normalizedFormat = fileFormat.toUpperCase() as CADFileFormat;
        if (!validFormats.includes(normalizedFormat)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_UNSUPPORTED_FORMAT',
              message: `Format '${fileFormat}' is unsupported. Supported CAD formats: ${validFormats.join(', ')}`,
            },
          });
          return;
        }

        // Auto-resolve plant if not provided
        let targetPlantId = plantId;
        if (!targetPlantId && machineId) {
          const machine = await dataStore.getMachineById(orgId, machineId);
          if (machine) targetPlantId = machine.plantId;
        }
        if (!targetPlantId) {
          const plants = await dataStore.listPlants(orgId);
          targetPlantId = plants[0]?.id || 'PLANT-DEFAULT';
        }

        const dto: CreateEngineeringModel3DDTO = {
          plantId: targetPlantId,
          machineId: machineId || null,
          industryProfileCode: industryProfileCode || 'MANUFACTURING_AUTOMATION',
          assetCategory: assetCategory || 'Industrial Machinery',
          title,
          manufacturer,
          modelNumber,
          sourceProvider,
          sourceUrl,
          fileFormat: normalizedFormat,
          fileSizeBytes: Number(fileSizeBytes),
          fileHashSha256,
          storageKey,
          modelRevision: modelRevision || '1.0',
          dataClassification: dataClassification || 'INTERNAL',
          licenseUsageRights,
          uploadedByUserId: actorUserId,
          reviewNotes,
        };

        const model = await dataStore.createEngineeringModel3D(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'ENGINEERING_MODEL_UPLOADED',
          resourceType: 'ENGINEERING_MODEL_3D',
          resourceId: model.id,
          metadata: {
            title: model.title,
            format: model.fileFormat,
            sizeBytes: model.fileSizeBytes,
            status: model.status,
            machineId: model.machineId,
          },
        });

        res.status(201).json({ success: true, data: model });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to register 3D model' },
        });
      }
    }
  );

  /**
   * POST /api/v1/engineering/models/:id/review
   * Reviewer approves or rejects a 3D model
   */
  router.post(
    '/models/:id/review',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const modelId = String(req.params.id);
        const { status, reviewNotes } = req.body;

        if (status !== 'APPROVED' && status !== 'REJECTED') {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: "status must be 'APPROVED' or 'REJECTED'" },
          });
          return;
        }

        const updated = await dataStore.updateEngineeringModel3D(orgId, modelId, {
          status,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date().toISOString(),
          reviewNotes,
        });

        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MODEL_NOT_FOUND', message: 'Model not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'ENGINEERING_MODEL_REVIEWED',
          resourceType: 'ENGINEERING_MODEL_3D',
          resourceId: updated.id,
          metadata: { status, machineId: updated.machineId },
        });

        res.json({ success: true, data: updated });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to review 3D model' },
        });
      }
    }
  );

  /**
   * GET /api/v1/engineering/models/:id/download
   * Secure authorization check and download URL resolution for private CAD models
   */
  router.get('/models/:id/download', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      let model = await dataStore.getEngineeringModel3DById(orgId, String(req.params.id));
      if (!model && String(req.params.id).startsWith('local-')) {
        const machineIdOrTag = String(req.params.id).replace(/^local-/, '');
        const machine = await dataStore.getMachineById(orgId, machineIdOrTag);
        if (machine) {
          const models = await dataStore.listEngineeringModels3D(orgId, { machineId: machine.id });
          if (models.length > 0) model = models[0];
        }
      }

      if (!model) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MODEL_NOT_FOUND', message: '3D model not found or access denied.' },
        });
        return;
      }

      // Generate secure signed download URL or proxy storage
      const keyToDownload = model.convertedStorageKey || model.storageKey;
      let downloadUrl = `/api/v1/engineering/storage-proxy?key=${encodeURIComponent(keyToDownload)}`;
      if (storageAdapter) {
        try {
          downloadUrl = await storageAdapter.getSignedUrl(keyToDownload, 3600);
        } catch {
          // Fallback to internal proxy
        }
      }

      res.json({
        success: true,
        data: {
          modelId: model.id,
          fileName: `${model.title}.${model.fileFormat.toLowerCase()}`,
          downloadUrl,
          fileSizeBytes: model.fileSizeBytes,
          fileFormat: model.fileFormat,
          checksumSha256: model.fileHashSha256,
          dataClassification: model.dataClassification,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Download failed' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/models/:id/content
   * Streams verified 3D CAD model binary (GLB, GLTF, STL, OBJ) for web 3D rendering.
   * Enforces strict RBAC, tenant isolation, mechanical CAD format validation, and header integrity.
   */
  router.get('/models/:id/content', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const modelId = String(req.params.id);
      const role = req.auth!.membership.role;

      const canView = [
        'ORGANIZATION_OWNER',
        'ORGANIZATION_ADMIN',
        'PLANT_MANAGER',
        'ENGINEER',
        'ENGINEER_TECHNICIAN',
        'TECHNICIAN',
      ].includes(role);

      if (!canView) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: Role not authorized to view engineering 3D CAD models.',
          },
        });
        return;
      }

      let model = await dataStore.getEngineeringModel3DById(orgId, modelId);
      if (!model && (modelId.startsWith('local-') || modelId.startsWith('asset-3d-') || modelId.startsWith('asset-'))) {
        const machineIdOrTag = modelId.replace(/^local-/, '').replace(/^asset-3d-/, '').replace(/^asset-/, '');
        const machine = await dataStore.getMachineById(orgId, machineIdOrTag);
        if (machine) {
          const models = await dataStore.listEngineeringModels3D(orgId, { machineId: machine.id });
          if (models.length > 0) {
            model = models[0];
          } else if (machine.hasModel3d || machine.model3dStorageKey || (machine.technicalSpecs as any)?.model3dFileName) {
            const specs = (machine.technicalSpecs || {}) as Record<string, any>;
            const rawFileName = specs.model3dFileName || (machine.model3dStorageKey ? machine.model3dStorageKey.split('/').pop() : 'model.stp');
            const storageKey = machine.model3dStorageKey || `models/${machine.assetTag}-${rawFileName}`;
            const format = (machine.model3dFormat || rawFileName.split('.').pop() || 'STEP').toUpperCase();
            model = await dataStore.createEngineeringModel3D(orgId, {
              plantId: machine.plantId || 'PLANT-TX-04',
              machineId: machine.id,
              industryProfileCode: 'GENERAL',
              assetCategory: 'MACHINERY',
              title: rawFileName,
              fileHashSha256: 'auto_linked',
              storageKey,
              fileFormat: format as any,
              fileSizeBytes: Number(specs.model3dFileSize) || 4085657,
              modelRevision: '1.0',
              status: 'APPROVED',
              dataClassification: machine.dataClassification || 'INTERNAL',
              uploadedByUserId: req.auth!.user.id,
            });
          }
        }
      }

      if (!model) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MODEL_NOT_FOUND', message: 'Engineering 3D model not found or access denied.' },
        });
        return;
      }

      // Check if format is a raw B-Rep CAD format (STEP, STP, IGES, IGS) without converted GLB in storage
      const rawBrepFormats = ['STEP', 'STP', 'IGES', 'IGS'];
      let hasConvertedGlb = false;
      if (rawBrepFormats.includes(model.fileFormat)) {
        if (model.convertedStorageKey && storageAdapter) {
          try {
            await storageAdapter.getObject(model.convertedStorageKey);
            hasConvertedGlb = true;
          } catch {
            hasConvertedGlb = false;
          }
        }

        // On-demand conversion for genuine STEP/STP mechanical models
        if (!hasConvertedGlb && storageAdapter) {
          try {
            const rawBuffer = await storageAdapter.getObject(model.storageKey);
            const convRes = await cadConversionService.convertStepToGlb(rawBuffer, model.title);
            if (convRes.success && convRes.glbBuffer) {
              const convertedKey = `models/converted/${model.id}.glb`;
              await storageAdapter.putObject(convertedKey, convRes.glbBuffer, 'model/gltf-binary');
              model.convertedStorageKey = convertedKey;
              await dataStore.updateEngineeringModel3D(orgId, model.id, { convertedStorageKey: convertedKey });
              hasConvertedGlb = true;
            }
          } catch (convErr: any) {
            logger.warn({ err: convErr?.message, modelId: model.id }, 'On-demand CAD conversion encountered error');
          }
        }

        if (!hasConvertedGlb) {
          res.status(422).json({
            success: false,
            error: {
              code: 'FORGEX_UNSUPPORTED_RENDER_FORMAT',
              message: `B-Rep CAD format '${model.fileFormat}' cannot be rendered directly in web 3D viewers without conversion to GLB. Download original CAD file for desktop CAD tools.`,
              fileFormat: model.fileFormat,
              downloadUrl: `/api/v1/engineering/models/${model.id}/download`,
            },
          });
          return;
        }
      }

      if (!storageAdapter) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_UNAVAILABLE', message: 'Storage adapter is not configured.' },
        });
        return;
      }

      const storageKey = model.convertedStorageKey || model.storageKey;
      let buffer: Buffer;
      try {
        buffer = await storageAdapter.getObject(storageKey);
      } catch (err: any) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_STORAGE_OBJECT_NOT_FOUND',
            message: `3D model artifact '${storageKey}' not found in storage.`,
          },
        });
        return;
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_CORRUPTED_FILE',
            message: `3D model file '${storageKey}' is empty (0 bytes) or corrupted.`,
          },
        });
        return;
      }

      // If GLB, validate 12-byte header magic and version
      if (model.fileFormat === 'GLB' || storageKey.endsWith('.glb')) {
        if (!isValidGlbHeader(buffer)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_CORRUPTED_FILE',
              message: 'Corrupted GLB binary file: invalid header magic or glTF version.',
            },
          });
          return;
        }
      }

      let contentType = 'application/octet-stream';
      if (model.fileFormat === 'GLB' || storageKey.endsWith('.glb')) {
        contentType = 'model/gltf-binary';
      } else if (model.fileFormat === 'GLTF' || storageKey.endsWith('.gltf')) {
        contentType = 'model/gltf+json';
      } else if (model.fileFormat === 'STL' || storageKey.endsWith('.stl')) {
        contentType = 'model/stl';
      } else if (model.fileFormat === 'OBJ' || storageKey.endsWith('.obj')) {
        contentType = 'model/obj';
      }

      const filename = `${model.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${model.fileFormat.toLowerCase()}`;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Forgex-Model-Format', model.fileFormat);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to retrieve 3D model content' },
      });
    }
  });

  /**
   * POST /api/v1/engineering/machines/:machineId/3d-model/upload
   * Upload and associate a genuine 3D CAD model directly to an industrial machine
   */
  router.post(
    '/machines/:machineId/3d-model/upload',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER', 'TECHNICIAN']),
    (req, res, next) => {
      engineeringUpload.single('file')(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            error: { code: 'FORGEX_UPLOAD_FILTER_REJECTED', message: err.message },
          });
        }
        next();
      });
    },
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const machineId = String(req.params.machineId);
        const machine = await dataStore.getMachineById(orgId, machineId);
        if (!machine) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: `Machine '${machineId}' not found.` },
          });
          return;
        }

        const file = req.file;
        if (!file || !file.buffer || file.buffer.length === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_EMPTY_FILE', message: 'A non-empty 3D CAD model file is required.' },
          });
          return;
        }

        const ext = (file.originalname.split('.').pop() || '').toUpperCase();
        const allowed = ['STEP', 'STP', 'GLB', 'GLTF', 'STL', 'OBJ', 'IGES', 'IGS'];
        if (!allowed.includes(ext)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_UNSUPPORTED_FORMAT',
              message: `Unsupported 3D CAD format '.${ext}'. Supported formats: STEP, STP, GLB, GLTF, STL, OBJ.`,
            },
          });
          return;
        }

        if (!storageAdapter) {
          res.status(500).json({
            success: false,
            error: { code: 'FORGEX_STORAGE_UNAVAILABLE', message: 'Storage adapter is not configured.' },
          });
          return;
        }

        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const randomId = crypto.randomUUID();
        const storageKey = `models/${machine.assetTag}-${randomId}-${sanitizedName}`;

        await storageAdapter.putObject(storageKey, file.buffer, file.mimetype || 'application/octet-stream');

        let convertedStorageKey: string | undefined;
        if (cadConversionService.isBrepFormat(ext)) {
          try {
            const convRes = await cadConversionService.convertStepToGlb(file.buffer, sanitizedName);
            if (convRes.success && convRes.glbBuffer) {
              convertedStorageKey = `models/converted/${machine.assetTag}-${randomId}.glb`;
              await storageAdapter.putObject(convertedStorageKey, convRes.glbBuffer, 'model/gltf-binary');
            }
          } catch (convErr: any) {
            logger.warn({ err: convErr?.message }, 'CAD conversion during upload encountered error');
          }
        }

        const model = await dataStore.createEngineeringModel3D(orgId, {
          plantId: machine.plantId || 'PLANT-TX-04',
          machineId: machine.id,
          industryProfileCode: 'GENERAL',
          assetCategory: 'MACHINERY',
          title: sanitizedName,
          fileHashSha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
          storageKey,
          convertedStorageKey,
          fileFormat: ext as any,
          fileSizeBytes: file.size,
          modelRevision: '1.0',
          status: 'APPROVED',
          dataClassification: machine.dataClassification || 'CONFIDENTIAL',
          uploadedByUserId: req.auth!.user.id,
        });

        await dataStore.updateMachine(orgId, machine.id, {
          hasModel3d: true,
          model3dStorageKey: storageKey,
          model3dFormat: ext.toLowerCase(),
        });

        res.json({
          success: true,
          data: {
            model,
            converted: !!convertedStorageKey,
          },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to upload 3D model' },
        });
      }
    }
  );

  /**
   * GET /api/v1/engineering/machines/:machineId/3d-model
   * Retrieves primary 3D engineering model and component mappings for an industrial machine.
   * Enforces machine existence and organization boundary checks.
   */
  router.get('/machines/:machineId/3d-model', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const machineId = String(req.params.machineId);

      const machine = await dataStore.getMachineById(orgId, machineId);
      if (!machine) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: `Machine '${machineId}' not found.` },
        });
        return;
      }

      let models = await dataStore.listEngineeringModels3D(orgId, { machineId });
      if (models.length === 0 && (machine.hasModel3d || machine.model3dStorageKey || (machine.technicalSpecs as any)?.model3dFileName)) {
        const specs = (machine.technicalSpecs || {}) as Record<string, any>;
        const rawFileName = specs.model3dFileName || (machine.model3dStorageKey ? machine.model3dStorageKey.split('/').pop() : 'model.stp');
        const storageKey = machine.model3dStorageKey || `models/${machine.assetTag}-${rawFileName}`;
        const format = (machine.model3dFormat || rawFileName.split('.').pop() || 'STEP').toUpperCase();

        const created = await dataStore.createEngineeringModel3D(orgId, {
          plantId: machine.plantId || 'PLANT-TX-04',
          machineId: machine.id,
          industryProfileCode: 'GENERAL',
          assetCategory: 'MACHINERY',
          title: rawFileName,
          fileHashSha256: 'auto_linked',
          storageKey,
          fileFormat: format as any,
          fileSizeBytes: Number(specs.model3dFileSize) || 4085657,
          modelRevision: '1.0',
          status: 'APPROVED',
          dataClassification: machine.dataClassification || 'INTERNAL',
          uploadedByUserId: req.auth!.user.id,
        });
        models = [created];
      }

      const primaryModel = models.find((m) => m.status === 'APPROVED') || models[0] || null;
      const mappings = await dataStore.listComponentMappings(orgId, machineId);

      res.json({
        success: true,
        data: {
          machine: {
            id: machine.id,
            name: machine.name,
            assetTag: machine.assetTag,
            plantId: machine.plantId,
            hasModel3d: machine.hasModel3d,
            model3dFormat: machine.model3dFormat,
            model3dStorageKey: machine.model3dStorageKey,
          },
          primaryModel,
          models,
          allModels: models,
          mappings,
          contentUrl: primaryModel ? `/api/v1/engineering/models/${primaryModel.id}/content` : null,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve machine 3D model',
        },
      });
    }
  });

  /**
   * DELETE /api/v1/engineering/models/:id
   * Admin deletes a 3D model
   */
  router.delete(
    '/models/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const deleted = await dataStore.deleteEngineeringModel3D(orgId, String(req.params.id));

        if (!deleted) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MODEL_NOT_FOUND', message: 'Model not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'ENGINEERING_MODEL_DELETED',
          resourceType: 'ENGINEERING_MODEL_3D',
          resourceId: String(req.params.id),
        });

        res.json({ success: true, message: '3D model deleted.' });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to delete 3D model' },
        });
      }
    }
  );

  // ==========================================================================
  // SECTION B: Manufacturer Resources
  // ==========================================================================

  /**
   * GET /api/v1/engineering/manufacturer-resources
   * List manufacturer resources
   */
  router.get('/manufacturer-resources', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const machineId = req.query.machineId ? String(req.query.machineId) : undefined;
      const resourceType = req.query.resourceType ? (String(req.query.resourceType) as any) : undefined;
      const verificationStatus = req.query.verificationStatus ? (String(req.query.verificationStatus) as any) : undefined;
      const manufacturer = req.query.manufacturer ? String(req.query.manufacturer) : undefined;

      const resources = await dataStore.listManufacturerResources(orgId, {
        machineId,
        resourceType,
        verificationStatus,
        manufacturer,
      });

      res.json({ success: true, data: resources, total: resources.length });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to list resources' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/manufacturer-resources/:id
   * Get specific resource
   */
  router.get('/manufacturer-resources/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const resItem = await dataStore.getManufacturerResourceById(orgId, String(req.params.id));

      if (!resItem) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_RESOURCE_NOT_FOUND', message: 'Manufacturer resource not found.' },
        });
        return;
      }

      res.json({ success: true, data: resItem });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to retrieve resource' },
      });
    }
  });

  /**
   * POST /api/v1/engineering/manufacturer-resources
   * Admin registers official manufacturer resource
   */
  router.post(
    '/manufacturer-resources',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER', 'TECHNICIAN']),
    (req, res, next) => {
      engineeringUpload.single('file')(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            error: { code: 'FORGEX_UPLOAD_FILTER_REJECTED', message: err.message },
          });
        }
        next();
      });
    },
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        let {
          machineId,
          resourceType,
          title,
          manufacturer,
          modelNumber,
          sourceType,
          sourceUrl,
          storageKey,
          fileFormat,
          fileSizeBytes,
          fileHashSha256,
          versionRevision,
          accessRequirements,
          usageRightsEvidence,
          reviewNotes,
        } = req.body;

        const file = req.file;
        if (file && file.buffer && file.buffer.length > 0) {
          if (!storageAdapter) {
            res.status(500).json({
              success: false,
              error: { code: 'FORGEX_STORAGE_UNAVAILABLE', message: 'Storage adapter is not configured.' },
            });
            return;
          }

          const ext = (file.originalname.split('.').pop() || 'PDF').toUpperCase();
          const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const randomId = crypto.randomUUID();
          storageKey = `resources/${randomId}-${sanitizedName}`;

          const mimeType = ext === 'PDF' ? 'application/pdf' : 'application/octet-stream';
          await storageAdapter.putObject(storageKey, file.buffer, mimeType);

          fileFormat = ext;
          fileSizeBytes = file.buffer.length;
          fileHashSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
          sourceType = 'FILE_UPLOAD';
          sourceUrl = sourceUrl || `/api/v1/engineering/storage-proxy?key=${encodeURIComponent(storageKey)}`;

          if (!title) {
            title = file.originalname.replace(/\.[^/.]+$/, '');
          }
        }

        if (machineId && (!manufacturer || manufacturer.trim() === '')) {
          const machine = await dataStore.getMachineById(orgId, machineId);
          if (machine?.manufacturer) {
            manufacturer = machine.manufacturer;
          }
          if (machine?.modelNumber && !modelNumber) {
            modelNumber = machine.modelNumber;
          }
        }

        if (!title || !manufacturer || !resourceType || (!sourceType && !file)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'title, manufacturer, resourceType, and sourceType (or uploaded file) are required.',
            },
          });
          return;
        }

        if (sourceType === 'OFFICIAL_URL' && sourceUrl) {
          if (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) {
            res.status(400).json({
              success: false,
              error: {
                code: 'FORGEX_INVALID_URL',
                message: 'Official URL must begin with http:// or https://',
              },
            });
            return;
          }
        }

        const dto: CreateManufacturerResourceDTO = {
          machineId,
          resourceType,
          title,
          manufacturer,
          modelNumber,
          sourceType,
          sourceUrl,
          storageKey,
          fileFormat,
          fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : undefined,
          fileHashSha256,
          versionRevision: versionRevision || '1.0',
          verificationStatus: 'UNVERIFIED',
          accessRequirements,
          usageRightsEvidence,
          uploadedByUserId: actorUserId,
          reviewNotes,
        };

        const resource = await dataStore.createManufacturerResource(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MANUFACTURER_RESOURCE_REGISTERED',
          resourceType: 'MANUFACTURER_RESOURCE',
          resourceId: resource.id,
          metadata: { title: resource.title, manufacturer: resource.manufacturer, sourceType: resource.sourceType },
        });

        res.status(201).json({ success: true, data: resource });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to register resource' },
        });
      }
    }
  );

  /**
   * POST /api/v1/engineering/manufacturer-resources/:id/verify
   * Verify or reject manufacturer resource
   */
  router.post(
    '/manufacturer-resources/:id/verify',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const resourceId = String(req.params.id);
        const { verificationStatus, reviewNotes } = req.body;

        if (verificationStatus !== 'VERIFIED' && verificationStatus !== 'REJECTED') {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: "verificationStatus must be 'VERIFIED' or 'REJECTED'" },
          });
          return;
        }

        const updated = await dataStore.updateManufacturerResource(orgId, resourceId, {
          verificationStatus,
          verifiedByUserId: actorUserId,
          verifiedAt: new Date().toISOString(),
          reviewNotes,
        });

        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_RESOURCE_NOT_FOUND', message: 'Resource not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MANUFACTURER_RESOURCE_VERIFIED',
          resourceType: 'MANUFACTURER_RESOURCE',
          resourceId: updated.id,
          metadata: { verificationStatus },
        });

        res.json({ success: true, data: updated });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to verify resource' },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/engineering/manufacturer-resources/:id
   * Delete resource
   */
  router.delete(
    '/manufacturer-resources/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const deleted = await dataStore.deleteManufacturerResource(orgId, String(req.params.id));

        if (!deleted) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_RESOURCE_NOT_FOUND', message: 'Resource not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MANUFACTURER_RESOURCE_DELETED',
          resourceType: 'MANUFACTURER_RESOURCE',
          resourceId: String(req.params.id),
        });

        res.json({ success: true, message: 'Resource deleted.' });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to delete resource' },
        });
      }
    }
  );

  // ==========================================================================
  // SECTION C: Original Engineering Drawings
  // ==========================================================================

  /**
   * GET /api/v1/engineering/drawings
   * List drawings with filtering
   */
  router.get('/drawings', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const plantId = req.query.plantId ? String(req.query.plantId) : undefined;
      const machineId = req.query.machineId ? String(req.query.machineId) : undefined;
      const drawingType = req.query.drawingType ? (String(req.query.drawingType) as DrawingType) : undefined;
      const discipline = req.query.discipline ? String(req.query.discipline) : undefined;
      const status = req.query.status ? (String(req.query.status) as any) : undefined;

      const drawings = await dataStore.listEngineeringDrawings(orgId, {
        plantId,
        machineId,
        drawingType,
        discipline,
        status,
      });

      res.json({ success: true, data: drawings, total: drawings.length });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to list drawings' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/drawings/:id
   * Get drawing by ID
   */
  router.get('/drawings/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const dwg = await dataStore.getEngineeringDrawingById(orgId, String(req.params.id));

      if (!dwg) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_DRAWING_NOT_FOUND', message: 'Engineering drawing not found.' },
        });
        return;
      }

      res.json({ success: true, data: dwg });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to retrieve drawing' },
      });
    }
  });

  /**
   * POST /api/v1/engineering/drawings
   * Admin uploads/registers an engineering drawing
   */
  router.post(
    '/drawings',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const {
          plantId,
          machineId,
          drawingTitle,
          uniqueDrawingNumber,
          drawingType,
          discipline,
          revision,
          effectiveDate,
          source,
          storageKey,
          originalFileName,
          fileFormat,
          fileSizeBytes,
          fileHashSha256,
          dataClassification,
          equipmentTags,
          reviewNotes,
        } = req.body;

        if (!drawingTitle || !uniqueDrawingNumber || !drawingType || !discipline || !storageKey || !fileFormat) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'drawingTitle, uniqueDrawingNumber, drawingType, discipline, storageKey, and fileFormat are required.',
            },
          });
          return;
        }

        let targetPlantId = plantId;
        if (!targetPlantId && machineId) {
          const machine = await dataStore.getMachineById(orgId, machineId);
          if (machine) targetPlantId = machine.plantId;
        }
        if (!targetPlantId) {
          const plants = await dataStore.listPlants(orgId);
          targetPlantId = plants[0]?.id || 'PLANT-DEFAULT';
        }

        const dto: CreateEngineeringDrawingDTO = {
          plantId: targetPlantId,
          machineId: machineId || null,
          drawingTitle,
          uniqueDrawingNumber,
          drawingType,
          discipline,
          revision: revision || 'Rev A',
          effectiveDate,
          source: source || 'Engineering Department',
          storageKey,
          originalFileName: originalFileName || `${uniqueDrawingNumber}.${fileFormat.toLowerCase()}`,
          fileFormat: fileFormat.toUpperCase() as any,
          fileSizeBytes: Number(fileSizeBytes || 1024),
          fileHashSha256: fileHashSha256 || 'hash_placeholder',
          dataClassification: dataClassification || 'INTERNAL',
          equipmentTags: Array.isArray(equipmentTags) ? equipmentTags : [],
          uploadedByUserId: actorUserId,
          reviewNotes,
        };

        const drawing = await dataStore.createEngineeringDrawing(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'ENGINEERING_DRAWING_UPLOADED',
          resourceType: 'ENGINEERING_DRAWING',
          resourceId: drawing.id,
          metadata: {
            drawingNumber: drawing.uniqueDrawingNumber,
            drawingType: drawing.drawingType,
            machineId: drawing.machineId,
          },
        });

        res.status(201).json({ success: true, data: drawing });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to register drawing';
        const isDuplicate = msg.includes('already exists');
        res.status(isDuplicate ? 409 : 500).json({
          success: false,
          error: { code: isDuplicate ? 'FORGEX_DUPLICATE_DRAWING' : 'FORGEX_INTERNAL_ERROR', message: msg },
        });
      }
    }
  );

  /**
   * POST /api/v1/engineering/drawings/:id/review
   * Reviewer approves or rejects drawing
   */
  router.post(
    '/drawings/:id/review',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const drawingId = String(req.params.id);
        const { status, reviewNotes } = req.body;

        if (status !== 'APPROVED' && status !== 'REJECTED') {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: "status must be 'APPROVED' or 'REJECTED'" },
          });
          return;
        }

        const updated = await dataStore.updateEngineeringDrawing(orgId, drawingId, {
          status,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date().toISOString(),
          reviewNotes,
        });

        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_DRAWING_NOT_FOUND', message: 'Drawing not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'ENGINEERING_DRAWING_REVIEWED',
          resourceType: 'ENGINEERING_DRAWING',
          resourceId: updated.id,
          metadata: { status, machineId: updated.machineId },
        });

        res.json({ success: true, data: updated });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to review drawing' },
        });
      }
    }
  );

  /**
   * GET /api/v1/engineering/drawings/:id/download
   * Secure download authorization for drawings
   */
  router.get('/drawings/:id/download', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      let dwg = await dataStore.getEngineeringDrawingById(orgId, String(req.params.id));
      const reqId = String(req.params.id);
      if (!dwg && (reqId.startsWith('local-pid-') || reqId.startsWith('local-') || reqId.startsWith('asset-dwg-') || reqId.startsWith('asset-pid-') || reqId.startsWith('asset-'))) {
        const machineIdOrTag = reqId.replace(/^local-pid-/, '').replace(/^local-/, '').replace(/^asset-dwg-/, '').replace(/^asset-pid-/, '').replace(/^asset-/, '');
        const machine = await dataStore.getMachineById(orgId, machineIdOrTag);
        if (machine) {
          const drawings = await dataStore.listEngineeringDrawings(orgId, { machineId: machine.id });
          if (drawings.length > 0) dwg = drawings[0];
        }
      }

      if (!dwg) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_DRAWING_NOT_FOUND', message: 'Drawing not found or access denied.' },
        });
        return;
      }

      let downloadUrl = `/api/v1/engineering/storage-proxy?key=${encodeURIComponent(dwg.storageKey)}`;
      if (storageAdapter) {
        try {
          downloadUrl = await storageAdapter.getSignedUrl(dwg.storageKey, 3600);
        } catch {
          // Fallback to proxy
        }
      }

      res.json({
        success: true,
        data: {
          drawingId: dwg.id,
          drawingNumber: dwg.uniqueDrawingNumber,
          originalFileName: dwg.originalFileName,
          downloadUrl,
          fileSizeBytes: dwg.fileSizeBytes,
          fileFormat: dwg.fileFormat,
          checksumSha256: dwg.fileHashSha256,
          dataClassification: dwg.dataClassification,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Download failed' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/drawings/:id/content
   * Streams sanitized diagram content for browser P&ID and engineering viewing.
   * Enforces strict RBAC, tenant isolation, format validation, and SVG sanitization.
   */
  router.get('/drawings/:id/content', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const drawingId = String(req.params.id);
      const role = req.auth!.membership.role;

      const canView = [
        'ORGANIZATION_OWNER',
        'ORGANIZATION_ADMIN',
        'PLANT_MANAGER',
        'ENGINEER',
        'ENGINEER_TECHNICIAN',
        'TECHNICIAN',
      ].includes(role);

      if (!canView) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: Role not authorized to view engineering drawings.',
          },
        });
        return;
      }

      let dwg = await dataStore.getEngineeringDrawingById(orgId, drawingId);
      if (!dwg && (drawingId.startsWith('local-pid-') || drawingId.startsWith('local-') || drawingId.startsWith('asset-dwg-') || drawingId.startsWith('asset-pid-') || drawingId.startsWith('asset-'))) {
        const machineIdOrTag = drawingId.replace(/^local-pid-/, '').replace(/^local-/, '').replace(/^asset-dwg-/, '').replace(/^asset-pid-/, '').replace(/^asset-/, '');
        const machine = await dataStore.getMachineById(orgId, machineIdOrTag);
        if (machine) {
          const drawings = await dataStore.listEngineeringDrawings(orgId, { machineId: machine.id });
          if (drawings.length > 0) {
            dwg = drawings.find((d) => d.status === 'APPROVED') || drawings[0];
          } else if (machine.hasPidDiagram || machine.pidStorageKey || (machine.technicalSpecs as any)?.pidFileName) {
            const specs = (machine.technicalSpecs || {}) as Record<string, any>;
            const rawFileName = specs.pidFileName || (machine.pidStorageKey ? machine.pidStorageKey.split('/').pop() : 'drawing.pdf');
            const storageKey = machine.pidStorageKey || `schematics/${machine.assetTag}-${rawFileName}`;
            const ext = (rawFileName.split('.').pop() || 'PDF').toUpperCase();
            const format = ext === 'SVG' ? 'SVG' : ext === 'PDF' ? 'PDF' : ext === 'PNG' ? 'PNG' : ext === 'JPG' || ext === 'JPEG' ? 'JPG' : 'PDF';
            const mappings = await dataStore.listComponentMappings(orgId, machine.id);
            dwg = await dataStore.createEngineeringDrawing(orgId, {
              plantId: machine.plantId || 'PLANT-TX-04',
              machineId: machine.id,
              drawingTitle: rawFileName,
              uniqueDrawingNumber: `PID-${machine.assetTag}`,
              drawingType: 'PID',
              discipline: 'Process',
              revision: '1.0',
              source: 'Engineering Archive',
              storageKey,
              originalFileName: rawFileName,
              fileFormat: format as any,
              fileSizeBytes: Number(specs.pidFileSize) || 3136182,
              fileHashSha256: 'auto_linked',
              dataClassification: machine.dataClassification || 'INTERNAL',
              equipmentTags: mappings.map((m) => m.pidTag).filter(Boolean),
              uploadedByUserId: req.auth!.user.id,
            });
          }
        }
      }

      if (!dwg) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_DRAWING_NOT_FOUND', message: 'Engineering drawing not found.' },
        });
        return;
      }

      // Explicitly reject 3D CAD formats from 2D P&ID rendering
      if (dwg.fileFormat === 'CAD' || dwg.fileFormat === 'DXF') {
        res.status(422).json({
          success: false,
          error: {
            code: 'FORGEX_UNSUPPORTED_RENDER_FORMAT',
            message: `CAD and 3D geometric drawings (.${dwg.fileFormat.toLowerCase()}) cannot be rendered directly in the 2D P&ID viewer. Please download the original CAD file for desktop CAD modeling.`,
            fileFormat: dwg.fileFormat,
            originalFileName: dwg.originalFileName,
            downloadUrl: `/api/v1/engineering/storage-proxy?key=${encodeURIComponent(dwg.storageKey)}`,
          },
        });
        return;
      }

      if (!storageAdapter) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_UNAVAILABLE', message: 'Storage adapter is not configured.' },
        });
        return;
      }

      let buffer: Buffer;
      try {
        buffer = await storageAdapter.getObject(dwg.storageKey);
      } catch (err: any) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_STORAGE_OBJECT_NOT_FOUND',
            message: `Drawing source file '${dwg.originalFileName}' not found in storage.`,
          },
        });
        return;
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_CORRUPTED_FILE',
            message: `Drawing file '${dwg.originalFileName}' is empty (0 bytes) or corrupted.`,
          },
        });
        return;
      }

      const filename = dwg.originalFileName || path.basename(dwg.storageKey);
      const ext = (filename.split('.').pop() || '').toLowerCase();

      // Handle SVG
      if (dwg.fileFormat === 'SVG' || ext === 'svg') {
        const rawSvg = buffer.toString('utf-8');
        const { sanitized, hadUnsafeContent } = SvgSanitizer.sanitize(rawSvg);

        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        if (hadUnsafeContent) {
          res.setHeader('X-Forgex-Sanitized', 'true');
        }
        res.send(Buffer.from(sanitized, 'utf-8'));
        return;
      }

      // Handle PDF
      if (dwg.fileFormat === 'PDF' || ext === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
        return;
      }

      // Handle Images (PNG, JPG, WebP)
      if (dwg.fileFormat === 'PNG' || ext === 'png') {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
        return;
      }

      if (dwg.fileFormat === 'JPG' || ext === 'jpg' || ext === 'jpeg') {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
        return;
      }

      // Default fallback
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve drawing content',
        },
      });
    }
  });

  /**
   * POST /api/v1/engineering/machines/:machineId/pid/upload
   * Upload and associate a genuine P&ID engineering drawing directly to an industrial machine
   */
  router.post(
    '/machines/:machineId/pid/upload',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER', 'TECHNICIAN']),
    (req, res, next) => {
      engineeringUpload.single('file')(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            error: { code: 'FORGEX_UPLOAD_FILTER_REJECTED', message: err.message },
          });
        }
        next();
      });
    },
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const machineId = String(req.params.machineId);
        const machine = await dataStore.getMachineById(orgId, machineId);
        if (!machine) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: `Machine '${machineId}' not found.` },
          });
          return;
        }

        const file = req.file;
        if (!file || !file.buffer || file.buffer.length === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_EMPTY_FILE', message: 'A non-empty drawing file is required.' },
          });
          return;
        }

        const ext = (file.originalname.split('.').pop() || '').toUpperCase();
        const allowed = ['PDF', 'SVG', 'PNG', 'JPG', 'JPEG', 'DWG', 'DXF'];
        if (!allowed.includes(ext)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_UNSUPPORTED_FORMAT',
              message: `Unsupported drawing format '.${ext}'. Supported formats: PDF, SVG, PNG, JPG.`,
            },
          });
          return;
        }

        if (!storageAdapter) {
          res.status(500).json({
            success: false,
            error: { code: 'FORGEX_STORAGE_UNAVAILABLE', message: 'Storage adapter is not configured.' },
          });
          return;
        }

        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const randomId = crypto.randomUUID();
        const storageKey = `schematics/${machine.assetTag}-${randomId}-${sanitizedName}`;

        const mimeType = ext === 'PDF' ? 'application/pdf' : ext === 'SVG' ? 'image/svg+xml' : ext === 'PNG' ? 'image/png' : 'image/jpeg';
        await storageAdapter.putObject(storageKey, file.buffer, mimeType);

        const mappings = await dataStore.listComponentMappings(orgId, machine.id);
        const equipmentTags = mappings.map((m) => m.pidTag).filter(Boolean);

        const drawing = await dataStore.createEngineeringDrawing(orgId, {
          plantId: machine.plantId || 'PLANT-TX-04',
          machineId: machine.id,
          drawingTitle: sanitizedName,
          uniqueDrawingNumber: `PID-${machine.assetTag}`,
          drawingType: 'PID',
          discipline: 'Process',
          revision: '1.0',
          source: 'Engineering Upload',
          storageKey,
          originalFileName: sanitizedName,
          fileFormat: (ext === 'JPEG' ? 'JPG' : ext) as any,
          fileSizeBytes: file.size,
          fileHashSha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
          dataClassification: machine.dataClassification || 'CONFIDENTIAL',
          equipmentTags,
          uploadedByUserId: req.auth!.user.id,
        });

        await dataStore.updateMachine(orgId, machine.id, {
          hasPidDiagram: true,
          pidStorageKey: storageKey,
        });

        res.json({
          success: true,
          data: { drawing },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to upload drawing' },
        });
      }
    }
  );

  /**
   * GET /api/v1/engineering/machines/:machineId/pid
   * Retrieves primary P&ID drawing and component mappings for an industrial machine.
   * Enforces machine existence and organization boundary checks.
   */
  router.get('/machines/:machineId/pid', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const machineId = String(req.params.machineId);

      const machine = await dataStore.getMachineById(orgId, machineId);
      if (!machine) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: `Machine '${machineId}' not found.` },
        });
        return;
      }

      let drawings = await dataStore.listEngineeringDrawings(orgId, { machineId });
      const mappings = await dataStore.listComponentMappings(orgId, machineId);

      if (drawings.length === 0 && (machine.hasPidDiagram || machine.pidStorageKey || (machine.technicalSpecs as any)?.pidFileName)) {
        const specs = (machine.technicalSpecs || {}) as Record<string, any>;
        const rawFileName = specs.pidFileName || (machine.pidStorageKey ? machine.pidStorageKey.split('/').pop() : 'drawing.pdf');
        const storageKey = machine.pidStorageKey || `schematics/${machine.assetTag}-${rawFileName}`;
        const ext = (rawFileName.split('.').pop() || 'PDF').toUpperCase();
        const format = ext === 'SVG' ? 'SVG' : ext === 'PDF' ? 'PDF' : ext === 'PNG' ? 'PNG' : ext === 'JPG' || ext === 'JPEG' ? 'JPG' : 'PDF';

        const created = await dataStore.createEngineeringDrawing(orgId, {
          plantId: machine.plantId || 'PLANT-TX-04',
          machineId: machine.id,
          drawingTitle: rawFileName,
          uniqueDrawingNumber: `PID-${machine.assetTag}`,
          drawingType: 'PID',
          discipline: 'Process',
          revision: '1.0',
          source: 'Engineering Archive',
          storageKey,
          originalFileName: rawFileName,
          fileFormat: format as any,
          fileSizeBytes: Number(specs.pidFileSize) || 3136182,
          fileHashSha256: 'auto_linked',
          dataClassification: machine.dataClassification || 'INTERNAL',
          equipmentTags: mappings.map((m) => m.pidTag).filter(Boolean),
          uploadedByUserId: req.auth!.user.id,
        });
        drawings = [created];
      }

      const pidDrawings = drawings.filter(
        (d) => d.drawingType === 'PID' || d.drawingType === 'PROCESS_FLOW' || d.fileFormat === 'SVG' || d.fileFormat === 'PDF'
      );
      const primaryDrawing = pidDrawings.find((d) => d.status === 'APPROVED') || pidDrawings[0] || drawings[0] || null;

      res.json({
        success: true,
        data: {
          machine: {
            id: machine.id,
            name: machine.name,
            assetTag: machine.assetTag,
            plantId: machine.plantId,
            hasPidDiagram: machine.hasPidDiagram,
            pidStorageKey: machine.pidStorageKey,
          },
          primaryDrawing,
          drawings: pidDrawings.length > 0 ? pidDrawings : drawings,
          mappings,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to retrieve machine P&ID',
        },
      });
    }
  });

  /**
   * DELETE /api/v1/engineering/drawings/:id
   * Admin deletes an engineering drawing
   */
  router.delete(
    '/drawings/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const deleted = await dataStore.deleteEngineeringDrawing(orgId, String(req.params.id));

        if (!deleted) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_DRAWING_NOT_FOUND', message: 'Drawing not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'ENGINEERING_DRAWING_DELETED',
          resourceType: 'ENGINEERING_DRAWING',
          resourceId: String(req.params.id),
        });

        res.json({ success: true, message: 'Drawing deleted.' });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to delete drawing' },
        });
      }
    }
  );

  // ==========================================================================
  // Summary Endpoint
  // ==========================================================================

  /**
   * GET /api/v1/engineering/summary
   * Aggregated live metrics for the Engineering Asset Center
   */
  router.get('/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const summary = await dataStore.getEngineeringAssetCenterSummary(orgId);
      res.json({ success: true, data: summary });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Failed to get summary' },
      });
    }
  });

  /**
   * GET /api/v1/engineering/storage-proxy
   * Secure storage streaming proxy with authentication, signature verification and path traversal prevention
   */
  router.get('/storage-proxy', async (req: Request, res: Response): Promise<void> => {
    try {
      const rawKey = (req.query.key as string) || '';
      const expires = req.query.expires as string | undefined;
      const signature = req.query.signature as string | undefined;

      if (!rawKey || typeof rawKey !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_BAD_REQUEST', message: 'Storage key is required.' },
        });
        return;
      }

      // 1. Path traversal & malformed key prevention: reject '..', null bytes, encoded traversals, absolute paths
      let decodedKey = rawKey;
      try {
        decodedKey = decodeURIComponent(rawKey);
      } catch {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_TRAVERSAL_DETECTED', message: 'Security Violation: Malformed storage key encoding.' },
        });
        return;
      }

      if (
        rawKey.includes('..') ||
        rawKey.includes('\0') ||
        decodedKey.includes('..') ||
        decodedKey.includes('\0') ||
        path.isAbsolute(rawKey) ||
        path.isAbsolute(decodedKey) ||
        rawKey.startsWith('/') ||
        decodedKey.startsWith('/') ||
        rawKey.startsWith('\\') ||
        decodedKey.startsWith('\\')
      ) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_TRAVERSAL_DETECTED', message: 'Security Violation: Path traversal detected.' },
        });
        return;
      }

      // Posix normalization
      const normalizedKey = path.posix.normalize(decodedKey.replace(/\\/g, '/')).replace(/^\/+/, '');
      if (
        normalizedKey.startsWith('../') ||
        normalizedKey.includes('/../') ||
        normalizedKey === '..' ||
        normalizedKey.includes('\0')
      ) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_TRAVERSAL_DETECTED', message: 'Security Violation: Path traversal detected.' },
        });
        return;
      }

      // 2. Validate Authorization: Cryptographic Signature or Authenticated Session
      let isSignedUrlAuthorized = false;

      if (expires && signature) {
        const expiresTime = parseInt(expires, 10);
        if (isNaN(expiresTime) || Date.now() > expiresTime) {
          res.status(401).json({
            success: false,
            error: { code: 'FORGEX_STORAGE_URL_EXPIRED', message: 'Signed storage URL has expired.' },
          });
          return;
        }

        const expectedSigRaw = crypto
          .createHmac('sha256', config.JWT_SECRET)
          .update(`${rawKey}:${expires}`)
          .digest('hex');

        const expectedSigNorm = crypto
          .createHmac('sha256', config.JWT_SECRET)
          .update(`${normalizedKey}:${expires}`)
          .digest('hex');

        if (
          (signature.length === expectedSigRaw.length &&
            crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSigRaw, 'hex'))) ||
          (signature.length === expectedSigNorm.length &&
            crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSigNorm, 'hex')))
        ) {
          isSignedUrlAuthorized = true;
        } else {
          res.status(401).json({
            success: false,
            error: { code: 'FORGEX_STORAGE_INVALID_SIGNATURE', message: 'Invalid storage URL signature.' },
          });
          return;
        }
      }

      // If not validated by signature, check authenticated session
      if (!isSignedUrlAuthorized && !req.auth) {
        res.status(401).json({
          success: false,
          error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: 'Valid authentication or signed URL required.' },
        });
        return;
      }

      // 3. Enforce Role and Tenant Isolation when authenticated context is present
      if (req.auth) {
        const role = req.auth.membership.role;
        const canDownload = [
          'ORGANIZATION_OWNER',
          'ORGANIZATION_ADMIN',
          'PLANT_MANAGER',
          'ENGINEER',
          'ENGINEER_TECHNICIAN',
          'TECHNICIAN',
        ].includes(role);

        if (!canDownload) {
          res.status(403).json({
            success: false,
            error: { code: 'FORGEX_RBAC_FORBIDDEN', message: 'Access denied: Role not authorized for engineering file access.' },
          });
          return;
        }

        const authOrgId = req.auth.organization.id;

        // Tenant namespace validation
        let belongsToTenant =
          normalizedKey.startsWith(`org_${authOrgId}/`) ||
          normalizedKey.startsWith(`${authOrgId}/`) ||
          normalizedKey.startsWith(`visual/${authOrgId}/`) ||
          normalizedKey.startsWith(`tenants/${authOrgId}/`) ||
          normalizedKey.startsWith(`orgs/${authOrgId}/`);

        if (!belongsToTenant) {
          // Verify against registered models, drawings, or documents for this tenant
          const models = await dataStore.listEngineeringModels3D(authOrgId);
          const matchModel = models.find(
            (m) => m.storageKey === normalizedKey || m.convertedStorageKey === normalizedKey
          );
          if (matchModel) {
            belongsToTenant = true;
          } else {
            const drawings = await dataStore.listEngineeringDrawings(authOrgId);
            const matchDrawing = drawings.find((d) => d.storageKey === normalizedKey);
            if (matchDrawing) {
              belongsToTenant = true;
            }
          }
        }

        if (!belongsToTenant) {
          // Log security event for blocked cross-tenant storage access attempt
          await dataStore.recordAuditEvent({
            organizationId: authOrgId,
            actorUserId: req.auth.user.id,
            action: 'STORAGE_PROXY_ACCESS_DENIED',
            resourceType: 'STORAGE_OBJECT',
            resourceId: normalizedKey,
            metadata: {
              reason: 'CROSS_TENANT_OR_UNAUTHORIZED_NAMESPACE',
            },
          });

          const securityService = req.app?.locals?.securityService;
          if (securityService) {
            await securityService.recordSecurityEvent({
              organizationId: authOrgId,
              actorUserId: req.auth.user.id,
              actorEmail: req.auth.user.email,
              actorRole: req.auth.membership.role,
              category: 'CROSS_TENANT_ACCESS',
              action: 'STORAGE_PROXY_ACCESS_BLOCKED',
              resourceCategory: 'DOCUMENT',
              resourceId: normalizedKey,
              decision: 'DENIED',
              policyReasonCode: 'TENANT_NAMESPACE_VIOLATION',
              severity: 'HIGH',
              isBenignInquiry: false,
              metadata: {
                requestedKey: normalizedKey,
              },
            });
          }

          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_CROSS_TENANT_FORBIDDEN',
              message: 'Access denied: Storage object is outside tenant namespace or unauthorized.',
            },
          });
          return;
        }

        // 4. Plant-level authorization check
        const plantMatch = normalizedKey.match(/plant_([a-zA-Z0-9_-]+)/);
        if (plantMatch) {
          const keyPlantId = plantMatch[1];
          if (role !== 'ORGANIZATION_OWNER' && role !== 'ORGANIZATION_ADMIN') {
            const assignedPlants = req.auth.membership.assignedPlantIds ?? [];
            if (assignedPlants.length > 0 && !assignedPlants.includes(keyPlantId)) {
              res.status(403).json({
                success: false,
                error: {
                  code: 'FORGEX_PLANT_ACCESS_DENIED',
                  message: `Access denied: User is not assigned to plant '${keyPlantId}'.`,
                },
              });
              return;
            }
          }

          const plant = await dataStore.getPlantById(authOrgId, keyPlantId);
          if (!plant) {
            const orgPlants = await dataStore.listPlants(authOrgId);
            const hasPlant = orgPlants.some(
              (p) => p.id === keyPlantId || p.code?.toLowerCase() === keyPlantId.toLowerCase()
            );
            if (!hasPlant) {
              res.status(403).json({
                success: false,
                error: {
                  code: 'FORGEX_PLANT_ACCESS_DENIED',
                  message: 'Access denied: Target plant does not belong to the authenticated organization.',
                },
              });
              return;
            }
          }
        }
      }

      if (!storageAdapter) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_UNAVAILABLE', message: 'Storage adapter is not configured.' },
        });
        return;
      }

      let dataBuffer: Buffer;
      try {
        dataBuffer = await storageAdapter.getObject(normalizedKey);
      } catch (err: any) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_STORAGE_OBJECT_NOT_FOUND', message: 'Requested engineering file not found in storage.' },
        });
        return;
      }

      // Safe Content-Type detection
      const ext = path.extname(normalizedKey).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.svg') {
        contentType = 'image/svg+xml; charset=utf-8';
        const { sanitized } = SvgSanitizer.sanitize(dataBuffer.toString('utf-8'));
        dataBuffer = Buffer.from(sanitized, 'utf-8');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      }
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.glb') contentType = 'model/gltf-binary';
      else if (ext === '.gltf') contentType = 'model/gltf+json';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.step' || ext === '.stp') contentType = 'application/step';

      const filename = path.basename(normalizedKey);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(dataBuffer);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_STORAGE_PROXY_ERROR', message: err instanceof Error ? err.message : 'Storage proxy error' },
      });
    }
  });

  return router;
}

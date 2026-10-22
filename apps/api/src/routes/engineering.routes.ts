import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
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

export function createEngineeringRouter(dataStore: IDataStore, storageAdapter?: IStorageAdapter): Router {
  const router = Router();

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
      const model = await dataStore.getEngineeringModel3DById(orgId, String(req.params.id));

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
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const {
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

        if (!title || !manufacturer || !resourceType || !sourceType) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'title, manufacturer, resourceType, and sourceType are required.',
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
      const dwg = await dataStore.getEngineeringDrawingById(orgId, String(req.params.id));

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
              code: 'FORGEX_RBAC_FORBIDDEN',
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

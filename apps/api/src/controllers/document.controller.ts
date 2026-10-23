import crypto from 'node:crypto';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { DocumentType, TechnicalDocument, DocumentVersion } from '@forgex/shared-types';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import type { IngestionQueue } from '../jobs/ingestionQueue.js';
import { validateUpload, sanitizeFilename } from '../ingestion/fileValidator.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class DocumentController {
  constructor(
    private dataStore: IDataStore,
    private storageAdapter: IStorageAdapter,
    private ingestionQueue: IngestionQueue,
    private vectorStore?: IVectorStoreAdapter
  ) {}

  /**
   * POST /api/v1/documents/upload
   * Multipart upload with magic-bytes validation and asynchronous queue dispatch
   */
  public upload = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing tenant context' });
        return;
      }

      // 0. Enforce strict Admin-Only ingestion policy at controller level
      const userRole = req.auth?.membership.role;
      if (userRole !== 'ORGANIZATION_OWNER' && userRole !== 'ORGANIZATION_ADMIN') {
        const securityService = req.app?.locals?.securityService;
        if (securityService) {
          await securityService.recordSecurityEvent({
            organizationId,
            actorUserId: userId || 'unknown',
            actorEmail: req.auth?.user.email || 'unknown',
            actorRole: userRole || 'UNKNOWN',
            category: 'CONFIDENTIAL_DOCUMENT_ACCESS',
            action: 'BLOCKED_DOCUMENT_UPLOAD',
            resourceCategory: 'DOCUMENT',
            resourceId: null,
            decision: 'DENIED',
            policyReasonCode: 'ROLE_INSUFFICIENT_PRIVILEGES',
            severity: 'HIGH',
            isBenignInquiry: false,
            metadata: {
              path: req.originalUrl || req.url,
              requiredRoles: ['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'],
              attemptedRole: userRole,
            },
          });
        }
        await this.dataStore.recordAuditEvent({
          organizationId,
          actorUserId: userId || 'unknown',
          action: 'BLOCKED_DOCUMENT_UPLOAD',
          resourceType: 'DOCUMENT',
          resourceId: 'upload_endpoint',
          metadata: {
            reason: 'INSUFFICIENT_PRIVILEGES',
            role: userRole,
          },
        });
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: `Insufficient privileges: Ingestion requires ORGANIZATION_ADMIN or ORGANIZATION_OWNER role. Current role is '${userRole}'.`,
          },
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'Upload failed: No file provided' });
        return;
      }

      // 1. Validate file content and magic bytes
      let validatedFile;
      try {
        validatedFile = validateUpload({
          buffer: file.buffer,
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err?.message || 'Invalid file content or magic bytes mismatch',
        });
        return;
      }

      // 2. Validate metadata fields (Single-Factory MVP: plantId is optional / auto-resolved)
      const {
        documentNumber,
        title,
        category,
        revision = 'REV-A',
        assetTags = '',
      } = req.body;

      if (!documentNumber || !title || !category) {
        res.status(400).json({
          success: false,
          error: 'Missing required metadata: documentNumber, title, and category are mandatory.',
        });
        return;
      }

      // Single-Factory MVP: Automatically resolve the tenant's primary facility
      let plant = null;
      if (req.body.plantId) {
        plant = await this.dataStore.getPlantById(organizationId, req.body.plantId);
        if (!plant) {
          const existingPlants = await this.dataStore.listPlants(organizationId);
          plant = existingPlants.find(
            (p) =>
              p.id === req.body.plantId ||
              p.code?.toLowerCase() === req.body.plantId.toLowerCase() ||
              p.name?.toLowerCase().includes(req.body.plantId.toLowerCase())
          ) || null;
        }
      }

      if (!plant) {
        const existingPlants = await this.dataStore.listPlants(organizationId);
        if (existingPlants.length > 0) {
          plant = existingPlants[0];
        } else {
          plant = await this.dataStore.createPlant(organizationId, {
            code: config.PLANT_SITE_CODE || 'PLANT-TX-04',
            name: 'Main Facility',
            location: 'Single Factory',
          });
        }
      }

      // Parse and resolve relational asset IDs and asset tags
      const {
        assetIds: parsedAssetIds,
        assetTags: parsedTags,
        machines: resolvedMachines,
        primaryMachineId,
      } = await this.resolveAssetsAndTags(
        organizationId,
        req.body.assetIds || req.body.asset_ids || req.body.machineIds || req.body.machineId,
        assetTags
      );

      // 3. Find or prepare Document details
      let existingDoc = await this.dataStore.getDocumentByNumber(organizationId, documentNumber);
      let versionNumber = 1;
      if (existingDoc) {
        const existingVersions = await this.dataStore.listDocumentVersions(existingDoc.id);
        versionNumber = existingVersions.length + 1;
      }

      // 4. Generate server-controlled storage key (never trust user input)
      const randomToken = crypto.randomBytes(6).toString('hex');
      const docUuid = existingDoc ? existingDoc.id : crypto.randomUUID();
      const storageKey = `org_${organizationId}/plant_${plant.id}/${docUuid}/v${versionNumber}_${Date.now()}_${randomToken}.${validatedFile.extension}`;

      // 5. Store file in configured object storage adapter
      const putResult = await this.storageAdapter.putObject(
        storageKey,
        file.buffer,
        validatedFile.detectedMimeType
      );

      // 6. Transactional Outbox Pattern: Atomically insert Document, DocumentVersion, AssetDocuments, and OutboxEvent
      let document: TechnicalDocument;
      let version: DocumentVersion;

      if (!existingDoc) {
        const outboxResult = await this.dataStore.createDocumentWithOutbox(
          {
            organizationId,
            plantId: plant.id,
            documentNumber,
            title,
            category: category as DocumentType,
            assetTags: parsedTags,
            assetIds: parsedAssetIds,
            machineId: primaryMachineId,
            createdByUserId: userId,
          },
          {
            documentId: docUuid,
            versionNumber: 1,
            revision,
            filename: sanitizeFilename(file.originalname),
            mimeType: validatedFile.detectedMimeType,
            fileSizeBytes: putResult.sizeBytes,
            checksumSha256: putResult.checksumSha256,
            storageKey: putResult.storageKey,
            status: 'QUEUED',
          },
          {
            organizationId,
            aggregateType: 'DOCUMENT',
            aggregateId: docUuid,
            eventType: 'DOCUMENT_INGESTION_REQUESTED',
            payload: {
              organizationId,
              filename: sanitizeFilename(file.originalname),
              storageKey: putResult.storageKey,
            },
          },
          parsedAssetIds
        );
        document = outboxResult.document;
        version = outboxResult.version;
      } else {
        document = existingDoc;
        version = await this.dataStore.createDocumentVersion({
          documentId: document.id,
          versionNumber,
          revision,
          filename: sanitizeFilename(file.originalname),
          mimeType: validatedFile.detectedMimeType,
          fileSizeBytes: putResult.sizeBytes,
          checksumSha256: putResult.checksumSha256,
          storageKey: putResult.storageKey,
          status: 'QUEUED',
        });
        await this.dataStore.createOutboxEvent({
          organizationId,
          aggregateType: 'DOCUMENT',
          aggregateId: document.id,
          eventType: 'DOCUMENT_INGESTION_REQUESTED',
          payload: {
            organizationId,
            documentId: document.id,
            documentVersionId: version.id,
            filename: sanitizeFilename(file.originalname),
            storageKey: putResult.storageKey,
          },
        });
        for (const aId of parsedAssetIds) {
          await this.dataStore.linkDocumentToAsset(organizationId, document.id, aId);
        }
      }

      // 7. Enqueue processing job via BullMQ / Redis queue
      const job = await this.ingestionQueue.enqueue(organizationId, version.id);

      // 8. Record audit event
      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: userId,
        action: 'DOCUMENT_UPLOADED',
        resourceType: 'DOCUMENT',
        resourceId: document.id,
        metadata: {
          versionId: version.id,
          versionNumber,
          filename: version.filename,
          mimeType: version.mimeType,
          sizeBytes: version.fileSizeBytes,
          sha256: version.checksumSha256,
          assetIds: parsedAssetIds,
          assetTags: parsedTags,
        },
      });

      // 9. Propagate document to Engineering Workspace and update Machine Verification status
      await this.linkAndPropagateDocument({
        organizationId,
        document,
        version,
        category: category as DocumentType,
        putResult,
        resolvedMachines,
        title,
        documentNumber,
        revision,
        extension: validatedFile.extension,
      });

      res.status(201).json({
        success: true,
        data: {
          document,
          version,
          job,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to upload document');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/documents/presign-upload
   * Generates a tenant-scoped S3/MinIO pre-signed PUT URL to stream large files (200MB+ PDFs, 500MB+ STEP)
   * directly to object storage, bypassing the Node.js event loop.
   */
  public presignUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing tenant context' });
        return;
      }

      const {
        filename,
        contentType = 'application/pdf',
        category = 'OEM_MANUAL',
        title = 'Technical Document',
        documentNumber: reqDocNumber,
        revision = '1.0',
        plantId: requestedPlantId,
        checksumSha256,
      } = req.body;

      if (!filename) {
        res.status(400).json({ success: false, error: 'Validation Error: filename is required' });
        return;
      }

      const ext = path.extname(filename).toLowerCase().replace('.', '') || 'pdf';

      // 1. Resolve Plant (Single factory / multi-plant)
      let plant = requestedPlantId ? await this.dataStore.getPlantById(organizationId, requestedPlantId) : null;
      if (!plant) {
        const existingPlants = await this.dataStore.listPlants(organizationId);
        if (existingPlants.length > 0) {
          plant = existingPlants[0];
        } else {
          plant = await this.dataStore.createPlant(organizationId, {
            code: config.PLANT_SITE_CODE || 'PLANT-TX-04',
            name: 'Main Facility',
            location: 'Single Factory',
          });
        }
      }

      // 2. Resolve target assets
      const {
        assetIds: parsedAssetIds,
        assetTags: parsedTags,
        machines: resolvedMachines,
        primaryMachineId,
      } = await this.resolveAssetsAndTags(
        organizationId,
        req.body.assetIds || req.body.asset_ids || req.body.machineIds || req.body.machineId,
        req.body.assetTags
      );

      const documentNumber = reqDocNumber || `DOC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const docId = crypto.randomUUID();
      const sha256Prefix = checksumSha256 ? checksumSha256.substring(0, 16) : crypto.randomBytes(8).toString('hex');
      const storageKey = `org_${organizationId}/plant_${plant.id}/${docId}/v1_${sha256Prefix}.${ext}`;

      // 3. Generate pre-signed PUT URL from storage adapter
      let presignedUrl = '';
      if (this.storageAdapter.getPresignedPutUrl) {
        presignedUrl = await this.storageAdapter.getPresignedPutUrl(storageKey, contentType, 3600);
      } else {
        presignedUrl = await this.storageAdapter.getSignedUrl(storageKey, 3600);
      }

      // 4. Atomically record document + version + outbox event
      const { document, version, outboxEvent } = await this.dataStore.createDocumentWithOutbox(
        {
          organizationId,
          plantId: plant.id,
          documentNumber,
          title: title || sanitizeFilename(filename),
          category: category as DocumentType,
          assetTags: parsedTags,
          assetIds: parsedAssetIds,
          machineId: primaryMachineId,
          createdByUserId: userId,
        },
        {
          documentId: docId,
          versionNumber: 1,
          revision,
          filename: sanitizeFilename(filename),
          mimeType: contentType,
          fileSizeBytes: Number(req.body.sizeBytes) || 0,
          checksumSha256: checksumSha256 || sha256Prefix,
          storageKey,
          status: 'QUEUED',
        },
        {
          organizationId,
          aggregateType: 'DOCUMENT',
          aggregateId: docId,
          eventType: 'DOCUMENT_INGESTION_REQUESTED',
          payload: {
            organizationId,
            filename: sanitizeFilename(filename),
            storageKey,
          },
        },
        parsedAssetIds
      );

      // Set linked machines to 'PROCESSING' (Strict state machine: NEVER set 'READY' during upload)
      for (const m of resolvedMachines) {
        try {
          await this.dataStore.updateMachine(organizationId, m.id, {
            documentationReadiness: 'PROCESSING',
          });
          await this.dataStore.getMachineVerification(organizationId, m.id);
        } catch {}
      }

      res.status(200).json({
        success: true,
        data: {
          presignedUrl,
          storageKey,
          uploadMethod: 'PUT',
          documentId: document.id,
          versionId: version.id,
          outboxEventId: outboxEvent.id,
          headers: {
            'Content-Type': contentType,
          },
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to generate pre-signed upload URL');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/documents/:id/complete-presign
   * Client notifies that direct S3 PUT finished; enqueues ingestion job.
   */
  public completePresignUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const { versionId } = req.body;

      if (!organizationId || !documentId) {
        res.status(400).json({ success: false, error: 'Document ID is required' });
        return;
      }

      const document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const version = versionId
        ? await this.dataStore.getDocumentVersionById(versionId)
        : (await this.dataStore.listDocumentVersions(document.id))[0];

      if (!version) {
        res.status(404).json({ success: false, error: 'Document version not found' });
        return;
      }

      // Enqueue processing job via BullMQ / Redis queue
      const job = await this.ingestionQueue.enqueue(organizationId, version.id);

      res.status(200).json({
        success: true,
        data: {
          document,
          version,
          job,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to complete pre-signed upload');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  };

  /**
   * PUT /api/v1/documents/presigned-put-proxy
   * Local development upload proxy when S3/MinIO is not connected
   */
  public presignedPutProxy = async (req: Request, res: Response): Promise<void> => {
    try {
      const key = (typeof req.query.key === 'string' ? req.query.key : '') as string;
      const queryContentType = typeof req.query.contentType === 'string' ? req.query.contentType : '';
      const contentType: string = queryContentType || (req.headers['content-type'] as string) || 'application/octet-stream';
      if (!key) {
        res.status(400).json({ success: false, error: 'Storage key required' });
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        await this.storageAdapter.putObject(key, buffer, contentType);
        res.status(200).json({ success: true, message: 'Uploaded via local presign proxy' });
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Upload proxy error' });
    }
  };

  /**
   * POST /api/v1/documents/bulk-upload
   * Multi-file ingestion with magic-bytes validation, metadata inheritance/overrides, and batch queue dispatch
   */
  public bulkUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing tenant context' });
        return;
      }

      // 0. Enforce strict Admin-Only ingestion policy
      const userRole = req.auth?.membership.role;
      if (userRole !== 'ORGANIZATION_OWNER' && userRole !== 'ORGANIZATION_ADMIN') {
        const securityService = req.app?.locals?.securityService;
        if (securityService) {
          await securityService.recordSecurityEvent({
            organizationId,
            actorUserId: userId || 'unknown',
            actorEmail: req.auth?.user.email || 'unknown',
            actorRole: userRole || 'UNKNOWN',
            category: 'CONFIDENTIAL_DOCUMENT_ACCESS',
            action: 'BLOCKED_DOCUMENT_UPLOAD',
            resourceCategory: 'DOCUMENT',
            resourceId: null,
            decision: 'DENIED',
            policyReasonCode: 'ROLE_INSUFFICIENT_PRIVILEGES',
            severity: 'HIGH',
            isBenignInquiry: false,
            metadata: {
              path: req.originalUrl || req.url,
              requiredRoles: ['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'],
              attemptedRole: userRole,
            },
          });
        }
        await this.dataStore.recordAuditEvent({
          organizationId,
          actorUserId: userId || 'unknown',
          action: 'BLOCKED_DOCUMENT_UPLOAD',
          resourceType: 'DOCUMENT',
          resourceId: 'bulk_upload_endpoint',
          metadata: {
            reason: 'INSUFFICIENT_PRIVILEGES',
            role: userRole,
          },
        });
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: `Insufficient privileges: Ingestion requires ORGANIZATION_ADMIN or ORGANIZATION_OWNER role. Current role is '${userRole}'.`,
          },
        });
        return;
      }

      // Extract files from multer array, fields, or single file fallback
      let files: Express.Multer.File[] = [];
      if (Array.isArray(req.files)) {
        files = req.files;
      } else if (req.files && typeof req.files === 'object') {
        for (const key of Object.keys(req.files)) {
          const list = (req.files as any)[key];
          if (Array.isArray(list)) {
            files.push(...list);
          }
        }
      } else if (req.file) {
        files = [req.file];
      }

      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: 'Bulk upload failed: No files provided.' });
        return;
      }

      // 1. Resolve Target Plant (Single-Factory MVP: plantId is optional / auto-resolved)
      const {
        defaultCategory = 'SOP',
        defaultRevision = 'REV-A',
        defaultAssetTags = '',
        metadataOverrides,
      } = req.body;

      // Single-Factory MVP: Automatically resolve the tenant's primary facility
      let plant = null;
      if (req.body.plantId) {
        plant = await this.dataStore.getPlantById(organizationId, req.body.plantId);
        if (!plant) {
          const existingPlants = await this.dataStore.listPlants(organizationId);
          plant = existingPlants.find(
            (p) =>
              p.id === req.body.plantId ||
              p.code?.toLowerCase() === req.body.plantId.toLowerCase() ||
              p.name?.toLowerCase().includes(req.body.plantId.toLowerCase())
          ) || null;
        }
      }

      if (!plant) {
        const existingPlants = await this.dataStore.listPlants(organizationId);
        if (existingPlants.length > 0) {
          plant = existingPlants[0];
        } else {
          plant = await this.dataStore.createPlant(organizationId, {
            code: config.PLANT_SITE_CODE || 'PLANT-TX-04',
            name: 'Main Facility',
            location: 'Single Factory',
          });
        }
      }

      // Parse metadata overrides if supplied as JSON
      let fileMetadataMap: Record<
        string,
        { documentNumber?: string; title?: string; category?: DocumentType; revision?: string; assetTags?: string[] }
      > = {};
      if (metadataOverrides) {
        try {
          fileMetadataMap =
            typeof metadataOverrides === 'string'
              ? JSON.parse(metadataOverrides)
              : metadataOverrides;
        } catch {
          // ignore parsing error, fallback to defaults
        }
      }

      // Parse default asset tags and relational asset IDs
      const {
        assetIds: parsedDefaultAssetIds,
        assetTags: parsedDefaultTags,
        machines: defaultResolvedMachines,
        primaryMachineId: defaultPrimaryMachineId,
      } = await this.resolveAssetsAndTags(
        organizationId,
        req.body.defaultAssetIds || req.body.default_asset_ids || req.body.assetIds,
        defaultAssetTags
      );

      const uploadedResults: any[] = [];
      const failedResults: any[] = [];

      // Process each file in the batch
      for (const file of files) {
        try {
          // Validate file magic bytes
          const validatedFile = validateUpload({
            buffer: file.buffer,
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          });

          // Derive metadata for this file
          const overrides =
            fileMetadataMap[file.originalname] || fileMetadataMap[file.filename] || {};
          const baseName = path.parse(file.originalname).name;

          // Auto-derive category from extension if not overridden
          let resolvedCategory: DocumentType =
            overrides.category || (defaultCategory as DocumentType);
          const ext = validatedFile.extension.toLowerCase();
          if (!overrides.category) {
            if (
              [
                'glb',
                'gltf',
                'step',
                'stp',
                'obj',
                'stl',
                '3mf',
                'fbx',
                'iges',
                'igs',
                'ply',
                'usdz',
                'usd',
              ].includes(ext)
            ) {
              resolvedCategory = '3D_MODEL';
            } else if (
              file.originalname.toLowerCase().includes('pid') ||
              file.originalname.toLowerCase().includes('schematic')
            ) {
              resolvedCategory = 'PID_DIAGRAM';
            } else if (file.originalname.toLowerCase().includes('sop')) {
              resolvedCategory = 'SOP';
            } else if (file.originalname.toLowerCase().includes('oem')) {
              resolvedCategory = 'OEM_MANUAL';
            }
          }

          const resolvedDocNumber = (
            overrides.documentNumber ||
            baseName.replace(/[^a-zA-Z0-9_-]/g, '-').toUpperCase()
          ).trim();

          const resolvedTitle =
            overrides.title ||
            baseName.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

          const resolvedRevision = (overrides.revision || defaultRevision || 'REV-A').trim();
          
          let fileAssetIds = parsedDefaultAssetIds;
          let fileAssetTags = parsedDefaultTags;
          let fileResolvedMachines = defaultResolvedMachines;
          let filePrimaryMachineId = defaultPrimaryMachineId;

          if (overrides.assetTags || (overrides as any).assetIds) {
            const resolved = await this.resolveAssetsAndTags(
              organizationId,
              (overrides as any).assetIds,
              overrides.assetTags
            );
            fileAssetIds = resolved.assetIds;
            fileAssetTags = resolved.assetTags;
            fileResolvedMachines = resolved.machines;
            filePrimaryMachineId = resolved.primaryMachineId;
          }

          // Find or create document
          let document = await this.dataStore.getDocumentByNumber(
            organizationId,
            resolvedDocNumber
          );
          let versionNumber = 1;

          if (!document) {
            document = await this.dataStore.createDocument({
              organizationId,
              plantId: plant.id,
              documentNumber: resolvedDocNumber,
              title: resolvedTitle,
              category: resolvedCategory,
              assetTags: fileAssetTags,
              assetIds: fileAssetIds,
              machineId: filePrimaryMachineId,
              createdByUserId: userId,
            });
          } else {
            const existingVersions = await this.dataStore.listDocumentVersions(document.id);
            versionNumber = existingVersions.length + 1;
          }

          // Generate server-controlled storage key
          const randomToken = crypto.randomBytes(6).toString('hex');
          const storageKey = `org_${organizationId}/plant_${plant.id}/${document.id}/v${versionNumber}_${Date.now()}_${randomToken}.${validatedFile.extension}`;

          // Put file into storage
          const putResult = await this.storageAdapter.putObject(
            storageKey,
            file.buffer,
            validatedFile.detectedMimeType
          );

          // Create document version
          const version = await this.dataStore.createDocumentVersion({
            documentId: document.id,
            versionNumber,
            revision: resolvedRevision,
            filename: sanitizeFilename(file.originalname),
            mimeType: validatedFile.detectedMimeType,
            fileSizeBytes: putResult.sizeBytes,
            checksumSha256: putResult.checksumSha256,
            storageKey: putResult.storageKey,
            status: 'QUEUED',
          });

          // Enqueue ingestion job
          const job = await this.ingestionQueue.enqueue(organizationId, version.id);

          // Record audit event
          await this.dataStore.recordAuditEvent({
            organizationId,
            actorUserId: userId,
            action: 'DOCUMENT_UPLOADED',
            resourceType: 'DOCUMENT',
            resourceId: document.id,
            metadata: {
              versionId: version.id,
              versionNumber,
              filename: version.filename,
              mimeType: version.mimeType,
              sizeBytes: version.fileSizeBytes,
              sha256: version.checksumSha256,
              batch: true,
              assetIds: fileAssetIds,
              assetTags: fileAssetTags,
            },
          });

          // Propagate linked document to Engineering Workspace and update Machine Verification status
          await this.linkAndPropagateDocument({
            organizationId,
            document,
            version,
            category: resolvedCategory,
            putResult,
            resolvedMachines: fileResolvedMachines,
            title: resolvedTitle,
            documentNumber: resolvedDocNumber,
            revision: resolvedRevision,
            extension: validatedFile.extension,
          });

          uploadedResults.push({
            document,
            version,
            job,
            filename: file.originalname,
          });
        } catch (fileErr: any) {
          failedResults.push({
            filename: file.originalname,
            error: fileErr?.message || 'Ingestion validation or storage failed',
          });
        }
      }

      const total = files.length;
      const succeeded = uploadedResults.length;
      const failed = failedResults.length;

      if (succeeded === 0) {
        res.status(400).json({
          success: false,
          error: 'Bulk upload failed: None of the provided files could be processed.',
          data: { uploaded: [], failed: failedResults },
          summary: { total, succeeded: 0, failed },
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: {
          uploaded: uploadedResults,
          failed: failedResults,
        },
        summary: {
          total,
          succeeded,
          failed,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed during bulk upload');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/documents
   * List tenant-authorized documents with optional filtering
   */
  public list = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing tenant context' });
        return;
      }

      const { plantId, category, search } = req.query;

      let resolvedPlantId = typeof plantId === 'string' ? plantId : undefined;
      if (resolvedPlantId) {
        const plant = await this.dataStore.getPlantById(organizationId, resolvedPlantId);
        if (plant) resolvedPlantId = plant.id;
      }

      const documents = await this.dataStore.listDocuments(organizationId, {
        plantId: resolvedPlantId,
        category: typeof category === 'string' ? (category as DocumentType) : undefined,
        search: typeof search === 'string' ? search : undefined,
      });

      res.status(200).json({
        success: true,
        data: documents,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list documents');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/documents/:id
   * Get single document by ID with tenant isolation
   */
  public getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: document,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to get document');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/documents/:id/pages
   * Get extracted pages and headings for document inspection
   */
  public getPages = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      let targetVersionId = document.latestVersion?.id;

      if (typeof req.query.versionId === 'string' && req.query.versionId) {
        const requestedVersion = await this.dataStore.getDocumentVersionById(req.query.versionId);
        if (!requestedVersion || requestedVersion.documentId !== document.id) {
          res.status(404).json({
            success: false,
            error: 'Document version not found or does not belong to this document',
          });
          return;
        }
        targetVersionId = requestedVersion.id;
      }

      if (!targetVersionId) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const pages = await this.dataStore.listDocumentPages(targetVersionId);
      res.status(200).json({
        success: true,
        data: pages,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to get document pages');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/documents/:id/versions
   * List all versions of a document
   */
  public getVersions = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const versions = await this.dataStore.listDocumentVersions(document.id);
      res.status(200).json({
        success: true,
        data: versions,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list document versions');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * GET /api/v1/documents/:id/download
   * Secure download with tenant check
   */
  public download = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      let document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        document = await this.dataStore.getDocumentByNumber(organizationId, documentId);
      }

      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const requestedVersionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
      let targetVersion = document.latestVersion;

      if (!targetVersion) {
        const versions = await this.dataStore.listDocumentVersions(document.id);
        if (versions && versions.length > 0) {
          targetVersion = versions[0];
        }
      }

      if (requestedVersionId) {
        const specificVersion = await this.dataStore.getDocumentVersionById(requestedVersionId);
        if (!specificVersion || specificVersion.documentId !== document.id) {
          res.status(404).json({ success: false, error: 'Document version not found' });
          return;
        }
        targetVersion = specificVersion;
      }

      if (!targetVersion) {
        res.status(404).json({ success: false, error: 'Document version payload not found' });
        return;
      }

      let buffer: Buffer;
      try {
        buffer = await this.storageAdapter.getObject(targetVersion.storageKey);
      } catch (storageErr: any) {
        logger.warn(
          { err: storageErr?.message, key: targetVersion.storageKey },
          'Stored payload not found directly on disk, attempting page text reconstruction'
        );
        const pages = await this.dataStore.listDocumentPages(targetVersion.id);
        if (pages && pages.length > 0) {
          const combined = pages
            .sort((a, b) => a.pageNumber - b.pageNumber)
            .map((p) => `=== ${document.documentNumber} - PAGE ${p.pageNumber} ===\n${p.rawText}`)
            .join('\n\n');
          buffer = Buffer.from(combined, 'utf-8');
          try {
            await this.storageAdapter.putObject(targetVersion.storageKey, buffer, targetVersion.mimeType || 'text/plain');
          } catch {
            // non-fatal write fallback
          }
        } else {
          res.status(404).json({
            success: false,
            error: `File payload missing from storage: ${targetVersion.filename || targetVersion.storageKey}`,
          });
          return;
        }
      }

      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: req.auth?.user.id,
        action: 'CONFIDENTIAL_DOCUMENT_DOWNLOADED',
        resourceType: 'DOCUMENT',
        resourceId: document.id,
        metadata: {
          documentNumber: document.documentNumber,
          versionId: targetVersion.id,
          filename: targetVersion.filename,
        },
      });

      const filename = targetVersion.filename || `${document.documentNumber}_${targetVersion.revision}.pdf`;
      res.setHeader('Content-Type', targetVersion.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.status(200).send(buffer);
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to download document');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * POST /api/v1/documents/:id/versions/:versionId/retry
   * Idempotent retry for failed document processing
   */
  public retry = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const versionId = Array.isArray(req.params.versionId)
        ? req.params.versionId[0]
        : req.params.versionId;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      let document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        document = await this.dataStore.getDocumentByNumber(organizationId, documentId);
      }

      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const version = await this.dataStore.getDocumentVersionById(versionId);
      if (!version || version.documentId !== document.id) {
        res.status(404).json({ success: false, error: 'Document version not found' });
        return;
      }

      const retriedJob = await this.ingestionQueue.retry(organizationId, version.id);

      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: req.auth?.user.id,
        action: 'DOCUMENT_PROCESSING_RETRIED',
        resourceType: 'DOCUMENT_VERSION',
        resourceId: version.id,
        metadata: {
          jobId: retriedJob.id,
          retryCount: retriedJob.retryCount,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          job: retriedJob,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to retry document processing');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  };

  /**
   * DELETE /api/v1/documents/:id
   * Cascading deletion of document, versions, pages, chunks, vectors, and storage
   */
  public delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      let document = await this.dataStore.getDocumentById(organizationId, documentId);
      if (!document) {
        document = await this.dataStore.getDocumentByNumber(organizationId, documentId);
      }

      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Cleanup stored files and external vector store points
      const versions = await this.dataStore.listDocumentVersions(document.id);
      for (const v of versions) {
        try {
          await this.storageAdapter.deleteObject(v.storageKey);
        } catch {
          // ignore if already deleted
        }

        if (this.vectorStore) {
          try {
            await this.vectorStore.deleteByFilter('forgex_knowledge', {
              documentVersionId: v.id,
              organizationId,
            });
            await this.vectorStore.deleteByFilter(
              process.env.QDRANT_COLLECTION || 'forgex_industrial_knowledge',
              {
                documentVersionId: v.id,
                organizationId,
              }
            );
          } catch (vErr: any) {
            logger.warn({ err: vErr?.message, versionId: v.id }, 'Failed to delete vectors during document purge');
          }
        }
      }

      const deleted = await this.dataStore.deleteDocument(organizationId, document.id);

      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: req.auth?.user.id,
        action: 'DOCUMENT_DELETED',
        resourceType: 'DOCUMENT',
        resourceId: document.id,
        metadata: {
          documentNumber: document.documentNumber,
          versionsCount: versions.length,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Document deleted successfully',
        data: { deleted, documentId: document.id },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to delete document');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * Helper: Resolves machine records, relational asset IDs, and authoritative asset tags
   */
  private async resolveAssetsAndTags(
    organizationId: string,
    rawAssetIds: any,
    rawAssetTags: any
  ): Promise<{ assetIds: string[]; assetTags: string[]; machines: any[]; primaryMachineId?: string }> {
    let parsedTags: string[] = [];
    if (Array.isArray(rawAssetTags)) {
      parsedTags = rawAssetTags.filter((t) => typeof t === 'string' && t.trim().length > 0);
    } else if (typeof rawAssetTags === 'string' && rawAssetTags.trim()) {
      try {
        const parsed = JSON.parse(rawAssetTags);
        if (Array.isArray(parsed)) {
          parsedTags = parsed.filter((t) => typeof t === 'string' && t.trim().length > 0);
        } else if (typeof parsed === 'string' && parsed.trim()) {
          parsedTags = [parsed.trim()];
        }
      } catch {
        parsedTags = rawAssetTags.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }

    let parsedAssetIds: string[] = [];
    if (Array.isArray(rawAssetIds)) {
      parsedAssetIds = rawAssetIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
    } else if (typeof rawAssetIds === 'string' && rawAssetIds.trim()) {
      try {
        const parsed = JSON.parse(rawAssetIds);
        if (Array.isArray(parsed)) {
          parsedAssetIds = parsed.filter((id) => typeof id === 'string' && id.trim().length > 0);
        } else if (typeof parsed === 'string' && parsed.trim()) {
          parsedAssetIds = [parsed.trim()];
        }
      } catch {
        parsedAssetIds = rawAssetIds.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }

    const resolvedMachines: any[] = [];
    for (const aId of parsedAssetIds) {
      try {
        const m = await this.dataStore.getMachineById(organizationId, aId);
        if (m) {
          resolvedMachines.push(m);
          if (m.assetTag && !parsedTags.includes(m.assetTag)) {
            parsedTags.push(m.assetTag);
          }
        }
      } catch {
        // ignore
      }
    }

    if (resolvedMachines.length === 0 && parsedTags.length > 0) {
      try {
        const allMachines = await this.dataStore.listMachines(organizationId);
        for (const tag of parsedTags) {
          const m = allMachines.find(
            (item) => item.assetTag?.toLowerCase() === tag.toLowerCase() || item.id === tag
          );
          if (m && !parsedAssetIds.includes(m.id)) {
            parsedAssetIds.push(m.id);
            resolvedMachines.push(m);
          }
        }
      } catch {
        // ignore
      }
    }

    const primaryMachineId = resolvedMachines[0]?.id || (parsedAssetIds.length > 0 ? parsedAssetIds[0] : undefined);
    return {
      assetIds: parsedAssetIds,
      assetTags: parsedTags,
      machines: resolvedMachines,
      primaryMachineId,
    };
  }

  /**
   * Helper: Propagates ingested document to Engineering Workspace and triggers Machine Verification recomputation
   */
  private async linkAndPropagateDocument(params: {
    organizationId: string;
    document: any;
    version: any;
    category: DocumentType;
    putResult: any;
    resolvedMachines: any[];
    title: string;
    documentNumber: string;
    revision: string;
    extension: string;
  }): Promise<void> {
    const {
      organizationId,
      document,
      category,
      putResult,
      resolvedMachines,
      title,
      documentNumber,
      revision,
      extension,
    } = params;

    const docCat = category as string;
    const ext = (extension || 'pdf').toUpperCase();

    for (const m of resolvedMachines) {
      // 1. Explicitly link document to machine in relational tables (asset_documents junction table & documents array)
      try {
        await this.dataStore.linkDocumentToAsset(organizationId, document.id, m.id, m.assetTag);
      } catch (linkErr: any) {
        logger.warn(
          { err: linkErr?.message, machineId: m.id, documentId: document.id },
          'Failed to link document to asset in junction table'
        );
      }

      // 2. Identify if document is a technical manual, SOP, or operating documentation
      const isDocumentation =
        docCat === 'OEM_MANUAL' ||
        docCat === 'SOP' ||
        docCat === 'MANUAL' ||
        docCat === 'FAULT_CODE_INDEX' ||
        docCat === 'SAFETY_DATA_SHEET' ||
        docCat === 'TECHNICAL_MANUAL' ||
        docCat === 'MAINTENANCE_MANUAL' ||
        (docCat !== 'PID_DIAGRAM' && docCat !== 'SCHEMATIC_PID' && docCat !== '3D_MODEL');

      if (isDocumentation) {
        const rType = docCat === 'OEM_MANUAL' || (docCat as string) === 'MANUAL' ? 'OFFICIAL_MANUAL' : 'APPROVED_REFERENCE';
        try {
          await this.dataStore.createManufacturerResource(organizationId, {
            machineId: m.id,
            resourceType: rType,
            title: title || `${m.name || m.assetTag} Technical Manual`,
            manufacturer: m.manufacturer || 'OEM / Plant Documentation',
            modelNumber: m.modelNumber || documentNumber,
            sourceType: 'FILE_UPLOAD',
            storageKey: putResult.storageKey,
            fileFormat: ext as any,
            fileSizeBytes: putResult.sizeBytes,
            versionRevision: revision || '1.0',
            verificationStatus: 'VERIFIED',
          });
        } catch {
          // ignore duplicate resource
        }

        try {
          await this.dataStore.updateMachine(organizationId, m.id, {
            documentationReadiness: 'PROCESSING',
          });
          await this.dataStore.getMachineVerification(organizationId, m.id);
        } catch (err: any) {
          logger.warn(
            { err: err?.message, machineId: m.id },
            'Failed to refresh machine verification after manual ingestion'
          );
        }
      } else if (docCat === 'PID_DIAGRAM' || docCat === 'SCHEMATIC_PID') {
        try {
          await this.dataStore.createEngineeringDrawing(organizationId, {
            machineId: m.id,
            drawingType: 'P_AND_ID',
            drawingNumber: documentNumber,
            title: title || `${m.name || m.assetTag} P&ID Diagram`,
            sheetNumber: '1',
            revision: revision || 'REV-A',
            fileFormat: ext as any,
            sourceType: 'FILE_UPLOAD',
            storageKey: putResult.storageKey,
            cadViewerReady: true,
          });
        } catch {
          // ignore
        }

        try {
          await this.dataStore.updateMachine(organizationId, m.id, {
            pidStorageKey: putResult.storageKey,
            hasPidDiagram: true,
            pAndIdUrl: putResult.storageKey,
          });
          await this.dataStore.getMachineVerification(organizationId, m.id);
        } catch (err: any) {
          logger.warn(
            { err: err?.message, machineId: m.id },
            'Failed to refresh machine verification after PID ingestion'
          );
        }
      } else if (docCat === '3D_MODEL') {
        try {
          await this.dataStore.createEngineeringModel3D(organizationId, {
            machineId: m.id,
            assetId: m.id,
            title: title || `${m.name || m.assetTag} 3D Model`,
            fileFormat: ext as any,
            sourceType: 'FILE_UPLOAD',
            storageKey: putResult.storageKey,
            fileSizeBytes: putResult.sizeBytes,
            viewerOptimized: true,
          });
        } catch {
          // ignore
        }

        try {
          await this.dataStore.updateMachine(organizationId, m.id, {
            model3dStorageKey: putResult.storageKey,
            hasModel3d: true,
            model3dUrl: putResult.storageKey,
          });
          await this.dataStore.getMachineVerification(organizationId, m.id);
        } catch (err: any) {
          logger.warn(
            { err: err?.message, machineId: m.id },
            'Failed to refresh machine verification after 3D model ingestion'
          );
        }
      }
    }
  }
}

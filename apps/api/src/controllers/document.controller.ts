import crypto from 'node:crypto';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { DocumentType } from '@forgex/shared-types';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import type { IngestionQueue } from '../jobs/ingestionQueue.js';
import { validateUpload, sanitizeFilename } from '../ingestion/fileValidator.js';
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

      // 2. Validate metadata fields
      const {
        documentNumber,
        title,
        plantId,
        category,
        revision = 'REV-A',
        assetTags = '',
      } = req.body;

      if (!documentNumber || !title || !plantId || !category) {
        res.status(400).json({
          success: false,
          error: 'Missing required metadata: documentNumber, title, plantId, and category are mandatory.',
        });
        return;
      }

      // Verify plant belongs to this organization (never implicitly auto-create plants)
      let plant = await this.dataStore.getPlantById(organizationId, plantId);
      if (!plant) {
        const existingPlants = await this.dataStore.listPlants(organizationId);
        const match = existingPlants.find(
          (p) =>
            p.id === plantId ||
            p.code?.toLowerCase() === plantId.toLowerCase() ||
            p.name?.toLowerCase().includes(plantId.toLowerCase())
        );
        if (match) {
          plant = match;
        } else {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_INVALID_PLANT',
              message: 'Invalid plant: Target plant does not exist or does not belong to the authenticated organization.',
            },
          });
          return;
        }
      }

      // Parse asset tags
      let parsedTags: string[] = [];
      if (Array.isArray(assetTags)) {
        parsedTags = assetTags;
      } else if (typeof assetTags === 'string') {
        try {
          parsedTags = JSON.parse(assetTags);
        } catch {
          parsedTags = assetTags.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }

      // 3. Find or Create Document record
      let document = await this.dataStore.getDocumentByNumber(organizationId, documentNumber);
      let versionNumber = 1;

      if (!document) {
        document = await this.dataStore.createDocument({
          organizationId,
          plantId: plant.id,
          documentNumber,
          title,
          category: category as DocumentType,
          assetTags: parsedTags,
          createdByUserId: userId,
        });
      } else {
        // Document exists: calculate next version number
        const existingVersions = await this.dataStore.listDocumentVersions(document.id);
        versionNumber = existingVersions.length + 1;
      }

      // 4. Generate server-controlled storage key (never trust user input)
      const randomToken = crypto.randomBytes(6).toString('hex');
      const storageKey = `org_${organizationId}/plant_${plant.id}/${document.id}/v${versionNumber}_${Date.now()}_${randomToken}.${validatedFile.extension}`;

      // 5. Store file in configured object storage adapter
      const putResult = await this.storageAdapter.putObject(
        storageKey,
        file.buffer,
        validatedFile.detectedMimeType
      );

      // 6. Create document version record
      const version = await this.dataStore.createDocumentVersion({
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
        },
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

      // 1. Validate Target Plant
      const {
        plantId,
        defaultCategory = 'SOP',
        defaultRevision = 'REV-A',
        defaultAssetTags = '',
        metadataOverrides,
      } = req.body;

      if (!plantId) {
        res.status(400).json({
          success: false,
          error: 'Missing required metadata: plantId is mandatory for bulk ingestion.',
        });
        return;
      }

      let plant = await this.dataStore.getPlantById(organizationId, plantId);
      if (!plant) {
        const existingPlants = await this.dataStore.listPlants(organizationId);
        const match = existingPlants.find(
          (p) =>
            p.id === plantId ||
            p.code?.toLowerCase() === plantId.toLowerCase() ||
            p.name?.toLowerCase().includes(plantId.toLowerCase())
        );
        if (match) {
          plant = match;
        } else {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_INVALID_PLANT',
              message: 'Invalid plant: Target plant does not exist or does not belong to the authenticated organization.',
            },
          });
          return;
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

      // Parse default asset tags
      let parsedDefaultTags: string[] = [];
      if (Array.isArray(defaultAssetTags)) {
        parsedDefaultTags = defaultAssetTags;
      } else if (typeof defaultAssetTags === 'string' && defaultAssetTags.trim()) {
        try {
          parsedDefaultTags = JSON.parse(defaultAssetTags);
        } catch {
          parsedDefaultTags = defaultAssetTags.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }

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
          const resolvedTags = overrides.assetTags || parsedDefaultTags;

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
              assetTags: resolvedTags,
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
            },
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
}

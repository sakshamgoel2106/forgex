import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import type { IVisionProcessingProvider } from '../ai/vision.interface.js';
import type { VisualIntelligenceEngine } from '../services/visualIntelligenceEngine.js';
import type { VisualAssetType, DocumentType, DocumentVersion } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
import { validateVisualAndEngineeringUpload } from '../ingestion/fileValidator.js';
import { DocumentParser } from '../ingestion/documentParser.js';
import { ContentChunker } from '../ingestion/contentChunker.js';

export class VisualController {
  private parser: DocumentParser;
  private chunker: ContentChunker;

  constructor(
    private dataStore: IDataStore,
    private storageAdapter: IStorageAdapter,
    private visualEngine: VisualIntelligenceEngine,
    private embeddingAdapter?: IEmbeddingAdapter,
    private vectorStore?: IVectorStoreAdapter,
    visionProvider?: IVisionProcessingProvider,
    private collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge'
  ) {
    this.parser = new DocumentParser(visionProvider);
    this.chunker = new ContentChunker();
  }

  /**
   * POST /api/v1/visual/upload
   * Admin-only endpoint to securely upload machine engineering resources & visual assets.
   * Performs content & magic-bytes validation, enforces tenant isolation and machine linkage,
   * stores to private object storage, and creates asset metadata with 'UPLOADED' status.
   */
  public upload = async (req: Request, res: Response): Promise<void> => {
    let uploadedStorageKey: string | null = null;
    try {
      const organizationId = req.auth?.organization?.id;
      const userId = req.auth?.user?.id;
      const role = req.auth?.membership?.role;

      if (!organizationId || !userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'FORGEX_AUTH_UNAUTHORIZED',
            message: 'Unauthorized: Missing organization or user authentication context.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 1. Strict Server-side Admin Authorization Enforcement
      const isAuthorizedAdmin = role === 'ORGANIZATION_OWNER' || role === 'ORGANIZATION_ADMIN';
      if (!isAuthorizedAdmin) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: Only organization administrators are authorized to upload visual and engineering assets.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. Extract inputs (multipart fields or JSON body)
      const {
        plantId,
        machineId,
        assetType,
        description,
        equipmentTags,
        dataClassification,
        imageBuffer: base64Buffer,
        filename: bodyFilename,
      } = req.body;

      // Extract file buffer
      const file = req.file;
      let buffer: Buffer | undefined = file?.buffer;
      let originalFilename = file?.originalname || bodyFilename || 'unnamed_asset';
      let mimeType = file?.mimetype;

      if (!buffer && base64Buffer) {
        const cleanBase64 = base64Buffer.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanBase64, 'base64');
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_EMPTY_FILE',
            message: 'Validation failed: An engineering or visual asset file is required.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 3. Machine Linkage and Tenant Isolation Verification
      let linkedMachine: any = null;
      let targetPlantId = plantId || null;

      if (machineId) {
        const trimmedMachineId = String(machineId).trim();
        linkedMachine = await this.dataStore.getMachineById(organizationId, trimmedMachineId);
        if (!linkedMachine) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_MACHINE_NOT_FOUND',
              message: 'Validation failed: Specified machine was not found in this organization.',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        // Machine belongs to this tenant; inherit plantId if not explicitly provided
        if (!targetPlantId && linkedMachine.plantId) {
          targetPlantId = linkedMachine.plantId;
        }
      }

      // Auto-resolve plant if still not provided
      if (!targetPlantId) {
        const plants = await this.dataStore.listPlants(organizationId);
        targetPlantId = plants[0]?.id || null;
      }

      // 4. File Type, Magic Bytes, Malware, and Path Traversal Validation
      const validated = validateVisualAndEngineeringUpload({
        buffer,
        originalname: originalFilename,
        size: buffer.length,
        mimetype: mimeType,
      });

      // Resolve asset type
      const allowedAssetTypes: VisualAssetType[] = [
        'PHOTOGRAPH',
        'MANUAL_PAGE',
        'DIAGRAM',
        'PID_RENDER',
        'USER_UPLOAD',
        'CAD_MODEL',
        'ENGINEERING_DRAWING',
      ];
      let resolvedAssetType: VisualAssetType = validated.suggestedAssetType;
      if (assetType && allowedAssetTypes.includes(assetType as VisualAssetType)) {
        resolvedAssetType = assetType as VisualAssetType;
      }

      // 5. Secure Tenant-Prefixed Storage Key Generation
      const randomPrefix = crypto.randomUUID();
      const storageKey = `org_${organizationId}/visual/${randomPrefix}_${validated.sanitizedFilename}`;
      uploadedStorageKey = storageKey;

      // Put to object storage
      await this.storageAdapter.putObject(storageKey, buffer, validated.detectedMimeType);

      // 6. Parse equipment tags if provided
      let parsedTags: string[] = [];
      if (Array.isArray(equipmentTags)) {
        parsedTags = equipmentTags.map(String).map((t) => t.trim()).filter(Boolean);
      } else if (typeof equipmentTags === 'string') {
        parsedTags = equipmentTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }

      // 7. Persist Metadata in DataStore with strict 'UPLOADED' status
      const asset = await this.dataStore.createVisualAsset({
        organizationId,
        plantId: targetPlantId,
        machineId: linkedMachine?.id || undefined,
        assetType: resolvedAssetType,
        storageKey,
        filename: validated.sanitizedFilename,
        mimeType: validated.detectedMimeType,
        fileSizeBytes: validated.fileSizeBytes,
        description: description ? String(description).slice(0, 1000) : null,
        equipmentTags: parsedTags,
        componentLabels: [],
        extractionMethod: 'MANUAL_ADMIN_UPLOAD',
        modelUsed: 'NONE',
        confidenceScore: 1.0,
        isAmbiguous: false,
        uploadedByUserId: userId,
        processingStatus: 'UPLOADED', // Invariant: Never marked PROCESSED/Analyzed upon upload
        dataClassification: dataClassification || 'INTERNAL',
      });

      // 8. Record Immutable Audit Event
      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: userId,
        action: 'VISUAL_ASSET_UPLOADED',
        resourceType: 'DOCUMENT',
        resourceId: asset.id,
        metadata: {
          machineId: linkedMachine?.id,
          plantId: targetPlantId,
          filename: asset.filename,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.fileSizeBytes,
          assetType: asset.assetType,
          processingStatus: asset.processingStatus,
        },
      });

      res.status(201).json({
        success: true,
        data: asset,
        message: 'File successfully uploaded and persisted in private storage.',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      // 9. Partial Failure Handling: Roll back uploaded storage object to prevent orphans
      if (uploadedStorageKey) {
        try {
          await this.storageAdapter.deleteObject(uploadedStorageKey);
          logger.info({ storageKey: uploadedStorageKey }, 'Rolled back orphaned storage object after failure');
        } catch (cleanupErr: any) {
          logger.warn(
            { storageKey: uploadedStorageKey, err: cleanupErr?.message },
            'Failed to clean up orphaned storage object'
          );
        }
      }

      logger.error({ error: err?.message, stack: err?.stack }, 'Visual asset upload failed');
      const isClientError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('validation') ||
        err?.message?.includes('Unsupported') ||
        err?.message?.includes('Security Violation') ||
        err?.message?.includes('exceeds limit');

      res.status(isClientError ? 400 : 500).json({
        success: false,
        error: {
          code: isClientError ? 'FORGEX_VALIDATION_ERROR' : 'FORGEX_INTERNAL_ERROR',
          message: err?.message || 'An error occurred while uploading the visual asset.',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/visual/inspect
   * Analyzes an uploaded photograph, P&ID render, or diagram, and cross-retrieves
   * authorized engineering manual passages.
   */
  public inspect = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;

      if (!organizationId || !userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Missing organization or user authentication context',
        });
        return;
      }

      // Parameters can come from multipart form fields or JSON body
      const {
        plantId,
        assetId,
        machineId,
        query,
        visualAssetId,
        documentVersionId,
        pageNumber,
        sourceReference,
        imageBuffer: base64Buffer,
        filename: bodyFilename,
      } = req.body;

      if (!plantId || !query) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: plantId and query are required for visual inspection.',
        });
        return;
      }

      // Validate machine linkage if machineId is provided
      if (machineId) {
        const machine = await this.dataStore.getMachineById(organizationId, String(machineId).trim());
        if (!machine) {
          res.status(400).json({
            success: false,
            error: 'Validation failed: Specified machine was not found in this organization.',
          });
          return;
        }
      }

      const file = req.file;
      let buffer: Buffer | undefined = file?.buffer;
      let originalFilename = file?.originalname || bodyFilename;
      let mimeType = file?.mimetype;

      // Handle base64 fallback in JSON body if no multipart file
      if (!buffer && base64Buffer) {
        const cleanBase64 = base64Buffer.replace(/^data:image\/[a-z]+;base64,/, '');
        buffer = Buffer.from(cleanBase64, 'base64');
      }

      // Check unsupported file types immediately if a file was provided
      if (file || mimeType) {
        const supportedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        const resolvedMime = (mimeType || 'image/png').toLowerCase();
        if (!supportedMimes.includes(resolvedMime)) {
          res.status(400).json({
            success: false,
            error: `Unsupported visual format '${resolvedMime}'. Supported formats are PNG, JPEG, and WebP.`,
          });
          return;
        }
      }

      if (!buffer && !visualAssetId) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: You must upload an image file or reference an existing visualAssetId.',
        });
        return;
      }

      const result = await this.visualEngine.inspectVisual(
        {
          plantId,
          assetId: assetId || machineId || undefined,
          query,
          visualAssetId: visualAssetId || undefined,
          documentVersionId: documentVersionId || undefined,
          pageNumber: pageNumber ? Number(pageNumber) : undefined,
          sourceReference: sourceReference || undefined,
          imageBuffer: base64Buffer,
          filename: originalFilename,
        },
        {
          organizationId,
          userId,
        },
        buffer,
        originalFilename,
        mimeType
      );

      // Audit trail
      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: userId,
        action: 'VISUAL_INSPECTION_EXECUTED',
        resourceType: 'DOCUMENT',
        resourceId: result.visualAsset.id,
        metadata: {
          plantId,
          assetId: assetId || machineId,
          modelUsed: result.modelUsed,
          processingMethod: result.processingMethod,
          isAmbiguous: result.isAmbiguousDiagram,
          isInsufficientEvidence: result.isInsufficientEvidence,
          detectedTags: result.detectedTags,
        },
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message, stack: err?.stack }, 'Visual inspection failed');
      const isClientError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Unsupported') ||
        err?.message?.includes('Inspection failed') ||
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('not belong to organization');

      res.status(isClientError ? 400 : 500).json({
        success: false,
        error: err?.message || 'An error occurred during visual inspection.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /api/v1/visual/assets
   * Lists stored visual assets for the current organization with optional machine, plant, and status filtering.
   */
  public listAssets = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing organization context' });
        return;
      }

      const { plantId, machineId, assetType, equipmentTag, processingStatus } = req.query;

      const assets = await this.dataStore.listVisualAssets(organizationId, {
        plantId: plantId as string | undefined,
        machineId: machineId as string | undefined,
        assetType: assetType as VisualAssetType | undefined,
        equipmentTag: equipmentTag as string | undefined,
        processingStatus: processingStatus as any | undefined,
      });

      res.status(200).json({
        success: true,
        data: assets,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to list visual assets');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve visual assets.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /api/v1/visual/assets/:id
   * Retrieves single visual asset metadata.
   */
  public getAssetById = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const id = req.params.id as string;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing organization context' });
        return;
      }

      const asset = await this.dataStore.getVisualAssetById(organizationId, id);
      if (!asset) {
        res.status(404).json({
          success: false,
          error: `Visual asset '${id}' was not found or does not belong to organization.`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: asset,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to get visual asset');
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve visual asset.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /api/v1/visual/assets/:id/image
   * Streams the raw stored image from object storage with secure non-sniff headers.
   */
  public getAssetImage = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const id = req.params.id as string;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing organization context' });
        return;
      }

      const asset = await this.dataStore.getVisualAssetById(organizationId, id);
      if (!asset) {
        res.status(404).json({
          success: false,
          error: `Visual asset '${id}' was not found.`,
        });
        return;
      }

      const imageBuffer = await this.storageAdapter.getObject(asset.storageKey);

      res.setHeader('Content-Type', asset.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(asset.filename)}"`
      );
      res.status(200).send(imageBuffer);
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to fetch visual asset image');
      res.status(500).json({
        success: false,
        error: 'Failed to load visual asset image.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/visual/assets/:id/process
   * Triggers text extraction, page parsing, semantic chunking, and Knowledge Hub/RAG
   * vector indexing on supported visual and engineering documents (e.g. manuals, SOPs, PDFs, schematics).
   */
  public processAsset = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization?.id;
      const userId = req.auth?.user?.id;
      const role = req.auth?.membership?.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'FORGEX_AUTH_UNAUTHORIZED',
            message: 'Unauthorized: Missing organization or user authentication context.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 1. RBAC check: Owner, Admin, or Engineer/Technician
      const isAuthorized = role ? ['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN'].includes(role) : false;
      if (!isAuthorized) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: Only organization administrators and engineers can trigger document processing.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. Load Visual Asset with strict tenant isolation
      const asset = await this.dataStore.getVisualAssetById(organizationId, id);
      if (!asset) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_ASSET_NOT_FOUND',
            message: `Visual asset '${id}' was not found or does not belong to organization.`,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 3. Format Routing: Check for CAD / 3D models
      const ext = (asset.filename.split('.').pop() || '').toLowerCase();
      const cadExtensions = ['step', 'stp', 'stl', 'glb', 'gltf', 'dwg', 'dxf', 'obj', 'iges', 'igs'];
      const cadMimes = [
        'application/step', 'application/sla', 'model/stl', 'model/step',
        'model/gltf-binary', 'model/gltf+json', 'image/vnd.dwg', 'image/vnd.dxf'
      ];

      if (asset.assetType === 'CAD_MODEL' || cadExtensions.includes(ext) || cadMimes.includes(asset.mimeType.toLowerCase())) {
        await this.dataStore.updateVisualAsset(organizationId, id, {
          processingStatus: 'UNSUPPORTED_FORMAT',
        });

        await this.dataStore.recordAuditEvent({
          organizationId,
          actorUserId: userId,
          action: 'DOCUMENT_PROCESSING_UNSUPPORTED',
          resourceType: 'DOCUMENT',
          resourceId: asset.id,
          metadata: {
            filename: asset.filename,
            mimeType: asset.mimeType,
            reason: 'CAD and 3D models require specialized CAD rendering engines and cannot be ingested as text RAG documents.',
          },
        });

        res.status(422).json({
          success: false,
          error: {
            code: 'FORGEX_UNSUPPORTED_FORMAT',
            message: `CAD and 3D geometric models (.${ext}) require specialized CAD rendering engines and cannot be ingested as text documents for Knowledge Hub / RAG vector indexing.`,
          },
          data: {
            id: asset.id,
            processingStatus: 'UNSUPPORTED_FORMAT',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 4. Mark Status: PROCESSING
      await this.dataStore.updateVisualAsset(organizationId, id, {
        processingStatus: 'PROCESSING',
      });

      // 5. Retrieve stored file buffer
      const buffer = await this.storageAdapter.getObject(asset.storageKey);

      // 6. Parse Document with extraction error protection
      let extracted;
      try {
        extracted = await this.parser.parse(buffer, asset.mimeType, asset.filename);
      } catch (parseErr: any) {
        await this.dataStore.updateVisualAsset(organizationId, id, {
          processingStatus: 'FAILED',
        });

        await this.dataStore.recordAuditEvent({
          organizationId,
          actorUserId: userId,
          action: 'DOCUMENT_PROCESSING_FAILED',
          resourceType: 'DOCUMENT',
          resourceId: asset.id,
          metadata: {
            filename: asset.filename,
            error: parseErr.message,
          },
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_DOCUMENT_PARSE_ERROR',
            message: parseErr.message,
          },
          data: {
            id: asset.id,
            processingStatus: 'FAILED',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Status transition: EXTRACTED
      await this.dataStore.updateVisualAsset(organizationId, id, {
        processingStatus: 'EXTRACTED',
      });

      // 7. Find or Create linked Knowledge Hub TechnicalDocument
      const docNumber = `DOC-${asset.id.slice(0, 8).toUpperCase()}`;
      let document = await this.dataStore.getDocumentByNumber(organizationId, docNumber);

      const resolvedCategory: DocumentType =
        asset.assetType === 'MANUAL_PAGE'
          ? 'OEM_MANUAL'
          : asset.assetType === 'DIAGRAM' || asset.assetType === 'PID_RENDER'
          ? 'SCHEMATIC_PID'
          : 'OEM_MANUAL';

      if (!document) {
        document = await this.dataStore.createDocument({
          organizationId,
          plantId: asset.plantId || 'PLANT-DEFAULT',
          documentNumber: docNumber,
          title: asset.filename,
          category: resolvedCategory,
          assetTags: asset.equipmentTags || [],
          createdByUserId: userId,
        });
      }

      // 8. Create or Reuse DocumentVersion (idempotent for retry)
      let version: DocumentVersion | null = null;
      if (asset.documentVersionId) {
        version = await this.dataStore.getDocumentVersionById(asset.documentVersionId);
      }
      if (!version) {
        const versions = await this.dataStore.listDocumentVersions(document.id);
        if (versions.length > 0) {
          version = versions[0];
        }
      }

      if (!version) {
        version = await this.dataStore.createDocumentVersion({
          documentId: document.id,
          versionNumber: 1,
          revision: 'REV-A',
          filename: asset.filename,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.fileSizeBytes,
          checksumSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
          storageKey: asset.storageKey,
          status: 'PROCESSING',
        });
      } else {
        version = await this.dataStore.updateDocumentVersionStatus(version.id, 'PROCESSING');
      }

      // Save Document Pages with provenance
      await this.dataStore.deleteDocumentPages(version.id);
      await this.dataStore.saveDocumentPages(
        extracted.pages.map((p) => ({
          documentVersionId: version.id,
          pageNumber: p.pageNumber,
          rawText: p.rawText,
          sectionHeadings: p.sectionHeadings,
          extractionMethod: p.extractionMethod,
          hasTables: p.hasTables,
        }))
      );

      // Status transition: INDEXING
      await this.dataStore.updateVisualAsset(organizationId, id, {
        processingStatus: 'INDEXING',
      });

      // 9. Chunk Pages
      const chunkDrafts = this.chunker.chunkPages(version.id, extracted.pages);

      // Clear previous chunks and vectors for this version (idempotent)
      await this.dataStore.deleteKnowledgeChunks(version.id);
      if (this.vectorStore) {
        await this.vectorStore.deleteByFilter(this.collectionName, {
          documentVersionId: version.id,
          organizationId,
        });
      }

      // 10. Generate Embeddings & Upsert to Vector Store (if configured)
      if (this.embeddingAdapter && this.vectorStore) {
        try {
          const chunkTexts = chunkDrafts.map((c) => c.content);
          const embeddings = await this.embeddingAdapter.generateEmbeddings(chunkTexts);

          const vectorPoints: VectorPoint[] = chunkDrafts.map((chunk, idx) => ({
            id: chunk.qdrantPointId,
            vector: embeddings[idx],
            payload: {
              organizationId: document.organizationId,
              plantId: document.plantId,
              machineId: asset.machineId || undefined,
              documentId: document.id,
              documentNumber: document.documentNumber,
              documentTitle: document.title,
              documentVersionId: version.id,
              revision: version.revision,
              pageNumber: chunk.pageNumber,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              sectionHeading: chunk.sectionHeading,
              isTable: chunk.isTable,
              isFigure: chunk.isFigure,
              extractionMethod: chunk.extractionMethod,
            },
          }));

          await this.vectorStore.ensureCollection(
            this.collectionName,
            this.embeddingAdapter.getDimensions()
          );
          await this.vectorStore.upsertPoints(this.collectionName, vectorPoints);
        } catch (embedErr: any) {
          // If indexing fails, document must NEVER be marked INDEXED
          await this.dataStore.updateDocumentVersionStatus(version.id, 'FAILED', undefined, undefined, embedErr.message);
          await this.dataStore.updateVisualAsset(organizationId, id, {
            processingStatus: 'FAILED',
          });

          res.status(500).json({
            success: false,
            error: {
              code: 'FORGEX_VECTOR_INDEXING_FAILED',
              message: `Vector indexing failed: ${embedErr.message}`,
            },
            data: {
              id: asset.id,
              processingStatus: 'FAILED',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // 11. Save Knowledge Chunks in DataStore
      await this.dataStore.saveKnowledgeChunks(
        chunkDrafts.map((c) => ({
          documentVersionId: c.documentVersionId,
          pageNumber: c.pageNumber,
          chunkIndex: c.chunkIndex,
          qdrantPointId: c.qdrantPointId,
          content: c.content,
          sectionHeading: c.sectionHeading,
          isTable: c.isTable,
          isFigure: c.isFigure,
          extractionMethod: c.extractionMethod,
          tokenCount: c.tokenCount,
        }))
      );

      // 12. Finalize: Update Version and Visual Asset to INDEXED
      await this.dataStore.updateDocumentVersionStatus(
        version.id,
        'INDEXED',
        extracted.totalPages,
        chunkDrafts.length,
        null
      );

      const updatedAsset = await this.dataStore.updateVisualAsset(organizationId, id, {
        processingStatus: 'INDEXED',
        documentId: document.id,
        documentVersionId: version.id,
        pageNumber: 1,
        extractionMethod: extracted.pages[0]?.extractionMethod || 'NATIVE_TEXT',
      });

      // 13. Record Audit Event
      await this.dataStore.recordAuditEvent({
        organizationId,
        actorUserId: userId,
        action: 'DOCUMENT_PROCESSED_AND_INDEXED',
        resourceType: 'DOCUMENT',
        resourceId: asset.id,
        metadata: {
          documentId: document.id,
          versionId: version.id,
          totalPages: extracted.totalPages,
          totalChunks: chunkDrafts.length,
          machineId: asset.machineId,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          asset: updatedAsset,
          documentId: document.id,
          documentVersionId: version.id,
          totalPages: extracted.totalPages,
          totalChunks: chunkDrafts.length,
          processingStatus: 'INDEXED',
        },
        message: 'Industrial document parsed, chunked, and indexed into Knowledge Hub / RAG.',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message, stack: err?.stack }, 'Visual asset document processing failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_PROCESSING_ERROR',
          message: err?.message || 'An error occurred during document processing.',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /api/v1/visual/assets/:id/processing-status
   * Exposes real-time document processing and ingestion status to the UI.
   */
  public getProcessingStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization?.id;
      const id = req.params.id as string;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const asset = await this.dataStore.getVisualAssetById(organizationId, id);
      if (!asset) {
        res.status(404).json({ success: false, error: `Visual asset '${id}' not found.` });
        return;
      }

      let versionDetails: any = null;
      if (asset.documentVersionId) {
        versionDetails = await this.dataStore.getDocumentVersionById(asset.documentVersionId);
      }

      res.status(200).json({
        success: true,
        data: {
          assetId: asset.id,
          filename: asset.filename,
          mimeType: asset.mimeType,
          assetType: asset.assetType,
          processingStatus: asset.processingStatus || 'UPLOADED',
          documentId: asset.documentId || null,
          documentVersionId: asset.documentVersionId || null,
          totalPages: versionDetails?.totalPages ?? null,
          totalChunks: versionDetails?.totalChunks ?? null,
          errorMessage: versionDetails?.errorMessage ?? null,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve processing status' });
    }
  };

  /**
   * POST /api/v1/visual/assets/:id/retry
   * Safe, idempotent retry for recoverable document processing failures.
   */
  public retryProcessing = async (req: Request, res: Response): Promise<void> => {
    return this.processAsset(req, res);
  };
}

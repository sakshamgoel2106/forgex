import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { VisualIntelligenceEngine } from '../services/visualIntelligenceEngine.js';
import type { VisualAssetType } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export class VisualController {
  constructor(
    private dataStore: IDataStore,
    private storageAdapter: IStorageAdapter,
    private visualEngine: VisualIntelligenceEngine
  ) {}

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
          assetId: assetId || undefined,
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
          assetId,
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
   * Lists stored visual assets for the current organization.
   */
  public listAssets = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing organization context' });
        return;
      }

      const { plantId, assetType, equipmentTag } = req.query;

      const assets = await this.dataStore.listVisualAssets(organizationId, {
        plantId: plantId as string | undefined,
        assetType: assetType as VisualAssetType | undefined,
        equipmentTag: equipmentTag as string | undefined,
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
   * Streams the raw stored image from object storage so it can be viewed beside answers.
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
}

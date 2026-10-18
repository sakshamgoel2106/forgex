import type { Request, Response } from 'express';
import { z } from 'zod';
import type { IDataStore } from '../db/dataStore.interface.js';

const createAssetSchema = z.object({
  plantId: z.string().uuid(),
  parentAssetId: z.string().uuid().nullable().optional(),
  assetTag: z.string().min(2).max(64),
  name: z.string().min(2).max(255),
  area: z.string().min(2).max(128),
  manufacturer: z.string().min(2).max(128),
  modelNumber: z.string().min(1).max(128),
  serialNumber: z.string().min(1).max(128),
  operationalState: z
    .enum([
      'OPTIMAL',
      'ADVISORY',
      'WARNING_MAINTENANCE_REQUIRED',
      'CRITICAL_FAULT',
      'OFFLINE_ISOLATED',
    ])
    .optional()
    .default('OPTIMAL'),
});

export class AssetController {
  constructor(private dataStore: IDataStore) {}

  public create = async (req: Request, res: Response): Promise<void> => {
    const parseResult = createAssetSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'FORGEX_VALIDATION_ERROR',
          message: 'Invalid asset creation payload.',
          details: parseResult.error.format(),
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_asset',
      });
      return;
    }

    const orgId = req.auth!.organization.id;
    const actorId = req.auth!.user.id;

    try {
      const asset = await this.dataStore.createAsset(orgId, parseResult.data);

      await this.dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: actorId,
        action: 'ASSET_CREATED',
        resourceType: 'ASSET',
        resourceId: asset.id,
        metadata: {
          assetTag: asset.assetTag,
          plantId: asset.plantId,
          parentAssetId: asset.parentAssetId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({
        success: true,
        data: asset,
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_asset',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error creating asset.';
      const statusCode = msg.includes('belongs to another organization') || msg.includes('not found') ? 404 : 409;

      res.status(statusCode).json({
        success: false,
        error: {
          code: statusCode === 404 ? 'FORGEX_NOT_FOUND' : 'FORGEX_RESOURCE_CONFLICT',
          message: msg,
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_asset',
      });
    }
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.organization.id;
    const plantId = req.query.plantId as string | undefined;

    const assets = await this.dataStore.listAssets(orgId, plantId);

    res.status(200).json({
      success: true,
      data: assets,
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_asset',
    });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.organization.id;
    const assetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const asset = await this.dataStore.getAssetById(orgId, assetId);
    if (!asset) {
      res.status(404).json({
        success: false,
        error: {
          code: 'FORGEX_NOT_FOUND',
          message: 'Asset not found or does not belong to authorized organization.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_asset',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: asset,
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_asset',
    });
  };
}

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { IDataStore } from '../db/dataStore.interface.js';

const createPlantSchema = z.object({
  code: z.string().min(2).max(64),
  name: z.string().min(2).max(255),
  location: z.string().min(2).max(255),
  airGappedMode: z.boolean().optional().default(false),
});

export class PlantController {
  constructor(private dataStore: IDataStore) {}

  public create = async (req: Request, res: Response): Promise<void> => {
    const parseResult = createPlantSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'FORGEX_VALIDATION_ERROR',
          message: 'Invalid plant creation payload.',
          details: parseResult.error.format(),
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_plant',
      });
      return;
    }

    const orgId = req.auth!.organization.id;
    const actorId = req.auth!.user.id;

    try {
      const plant = await this.dataStore.createPlant(orgId, parseResult.data);

      await this.dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: actorId,
        action: 'PLANT_CREATED',
        resourceType: 'PLANT',
        resourceId: plant.id,
        metadata: { code: plant.code, name: plant.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({
        success: true,
        data: plant,
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_plant',
      });
    } catch (err) {
      res.status(409).json({
        success: false,
        error: {
          code: 'FORGEX_RESOURCE_CONFLICT',
          message: err instanceof Error ? err.message : 'Conflict creating plant.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_plant',
      });
    }
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.organization.id;
    const plants = await this.dataStore.listPlants(orgId);

    const role = req.auth?.membership.role;
    const assigned = req.auth?.membership.assignedPlantIds ?? [];
    const isSupervisory = role === 'ORGANIZATION_OWNER' || role === 'ORGANIZATION_ADMIN';

    const visiblePlants = (!isSupervisory && assigned.length > 0)
      ? plants.filter((p) => assigned.includes(p.id) || assigned.includes(p.code))
      : plants;

    res.status(200).json({
      success: true,
      data: visiblePlants,
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_plant',
    });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.organization.id;
    const plantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const plant = await this.dataStore.getPlantById(orgId, plantId);
    if (!plant) {
      res.status(404).json({
        success: false,
        error: {
          code: 'FORGEX_NOT_FOUND',
          message: 'Plant not found or does not belong to authorized organization.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_plant',
      });
      return;
    }

    const role = req.auth?.membership.role;
    const assigned = req.auth?.membership.assignedPlantIds ?? [];
    const isSupervisory = role === 'ORGANIZATION_OWNER' || role === 'ORGANIZATION_ADMIN';

    if (!isSupervisory && assigned.length > 0 && !assigned.includes(plant.id) && !assigned.includes(plant.code)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORGEX_PLANT_ACCESS_DENIED',
          message: `Access denied: You are not assigned to plant '${plant.code}'.`,
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_plant',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: plant,
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_plant',
    });
  };
}

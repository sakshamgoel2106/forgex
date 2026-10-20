import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore, CreateComponentMappingDTO } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createMappingRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * GET /api/v1/machines/:machineId/mappings
   * Lists verified and suggested component mappings for a machine
   */
  router.get(
    '/:machineId/mappings',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'VIEWER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const machineId = Array.isArray(req.params.machineId) ? req.params.machineId[0] : req.params.machineId;

        const mappings = await dataStore.listComponentMappings(orgId, machineId);

        res.status(200).json({
          success: true,
          data: mappings,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_MAPPING_LIST_FAILED', message: err?.message || 'Failed to list mappings' },
        });
      }
    }
  );

  /**
   * POST /api/v1/machines/:machineId/mappings
   * Creates a component mapping connecting 3D component, P&ID tag, and manual section
   */
  router.post(
    '/:machineId/mappings',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const machineId = Array.isArray(req.params.machineId) ? req.params.machineId[0] : req.params.machineId;
        const { componentId, componentName, pidTag, pidDrawingNumber, pidCoordinates, manualDocumentId, manualPageNumber, status } = req.body;

        if (!componentId || !componentName || !pidTag) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: 'componentId, componentName, and pidTag are required.' },
          });
          return;
        }

        const dto: CreateComponentMappingDTO = {
          machineId,
          componentId,
          componentName,
          pidTag,
          pidDrawingNumber: pidDrawingNumber || null,
          pidCoordinates: pidCoordinates || null,
          manualDocumentId: manualDocumentId || null,
          manualPageNumber: manualPageNumber ? parseInt(manualPageNumber, 10) : null,
          status: status || 'SUGGESTED',
        };

        const mapping = await dataStore.createComponentMapping(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'COMPONENT_MAPPING_CREATED',
          resourceType: 'COMPONENT_MAPPING',
          resourceId: mapping.id,
          metadata: { machineId, componentId, pidTag, status: mapping.status },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(201).json({
          success: true,
          message: 'Component mapping registered.',
          data: mapping,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_MAPPING_FAILED', message: err?.message || 'Failed to create mapping' },
        });
      }
    }
  );

  /**
   * PATCH /api/v1/machines/:machineId/mappings/:id
   * Review and verify a component mapping
   */
  router.patch(
    '/:machineId/mappings/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorRole = req.auth!.membership.role;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { status, componentName, pidTag } = req.body;

        // Engineers cannot set status to VERIFIED without Admin/Manager authority
        if (status === 'VERIFIED' && !['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER'].includes(actorRole)) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_VERIFICATION_FORBIDDEN',
              message: 'Only an Administrator or Plant Manager can verify engineering component mappings.',
            },
          });
          return;
        }

        const updated = await dataStore.updateComponentMapping(orgId, id, {
          status,
          componentName,
          pidTag,
          verifiedByUserId: status === 'VERIFIED' ? actorUserId : undefined,
        });

        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Mapping not found.' },
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: 'Component mapping updated.',
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_MAPPING_UPDATE_FAILED', message: err?.message || 'Failed to update mapping' },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/machines/:machineId/mappings/:id
   */
  router.delete(
    '/:machineId/mappings/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const deleted = await dataStore.deleteComponentMapping(orgId, id);
        if (!deleted) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Mapping not found.' },
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: 'Component mapping deleted.',
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_DELETE_FAILED', message: err?.message || 'Failed to delete mapping' },
        });
      }
    }
  );

  return router;
}

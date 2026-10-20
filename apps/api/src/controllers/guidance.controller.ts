import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { PublishGuidanceDTO, ListGuidanceFilters, OrgRole } from '@forgex/shared-types';

export class GuidanceController {
  constructor(private readonly dataStore: IDataStore) {}

  public publish = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const reviewerUserId = req.auth!.user.id;
      const reviewerEmail = req.auth!.user.email;
      const body = req.body;

      if (!body.plantId || typeof body.plantId !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'plantId is required.' },
        });
        return;
      }

      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'title is required.' },
        });
        return;
      }

      if (!body.guidanceContent || typeof body.guidanceContent !== 'string' || body.guidanceContent.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'guidanceContent is required.' },
        });
        return;
      }

      const dto: PublishGuidanceDTO = {
        plantId: body.plantId,
        machineId: body.machineId || null,
        machineAssetTag: body.machineAssetTag || null,
        title: body.title.trim(),
        guidanceContent: body.guidanceContent.trim(),
        sourceDocumentId: body.sourceDocumentId || null,
        sourceDocumentNumber: body.sourceDocumentNumber || null,
        sourceDocumentVersionId: body.sourceDocumentVersionId || null,
        sourceSectionHeading: body.sourceSectionHeading || null,
        sourcePageNumber: typeof body.sourcePageNumber === 'number' ? body.sourcePageNumber : null,
        applicableRoles: Array.isArray(body.applicableRoles) ? body.applicableRoles : undefined,
        disclosureClassification: body.disclosureClassification || 'WORKER_APPROVED',
        expiresAt: body.expiresAt || null,
      };

      const published = await this.dataStore.publishGuidance(orgId, reviewerUserId, reviewerEmail, dto);

      res.status(201).json({
        success: true,
        data: published,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const userRole = req.auth!.membership.role;

      const filters: ListGuidanceFilters = {};
      if (req.query.plantId && typeof req.query.plantId === 'string') {
        filters.plantId = req.query.plantId;
      }
      if (req.query.machineId && typeof req.query.machineId === 'string') {
        filters.machineId = req.query.machineId;
      }
      if (req.query.status && typeof req.query.status === 'string') {
        filters.status = req.query.status as any;
      }
      if (req.query.role && typeof req.query.role === 'string') {
        filters.role = req.query.role as OrgRole;
      }

      // Non-admins only see guidance applicable to their role by default
      const isAdmin = userRole === 'ORGANIZATION_ADMIN' || userRole === 'ORGANIZATION_OWNER';
      if (!isAdmin && !filters.role) {
        filters.role = userRole;
      }

      const items = await this.dataStore.listPublishedGuidance(orgId, filters);

      res.status(200).json({
        success: true,
        data: items,
        total: items.length,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const userRole = req.auth!.membership.role;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const item = await this.dataStore.getPublishedGuidanceById(orgId, id);
      if (!item) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_NOT_FOUND', message: 'Published guidance not found.' },
        });
        return;
      }

      // Role check for non-admins
      const isAdmin = userRole === 'ORGANIZATION_ADMIN' || userRole === 'ORGANIZATION_OWNER';
      if (!isAdmin && !item.applicableRoles.includes(userRole)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORGEX_RBAC_FORBIDDEN', message: 'Access to this operational guidance is restricted.' },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: item,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  };

  public supersede = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { supersededByGuidanceId } = req.body;

      if (!supersededByGuidanceId || typeof supersededByGuidanceId !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'supersededByGuidanceId is required.' },
        });
        return;
      }

      const updated = await this.dataStore.supersedePublishedGuidance(orgId, id, supersededByGuidanceId);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_NOT_FOUND', message: 'Published guidance not found.' },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  };

  public revoke = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { reason } = req.body;

      const updated = await this.dataStore.revokePublishedGuidance(orgId, id, reason);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_NOT_FOUND', message: 'Published guidance not found.' },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  };
}

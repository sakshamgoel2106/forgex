import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore, CreateMachineDTO, MachineFilterOptions } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import type { OrgRole } from '@forgex/shared-types';
import { HistoricalFaultService } from '../services/historicalFaultService.js';

export function createMachineRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * POST /api/v1/machines
   * Admin / Plant Manager registers a machine (supports fully documented or incomplete records)
   */
  router.post(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const assignedPlants = req.auth!.membership.assignedPlantIds ?? [];
        const isSuperAdmin = ['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'].includes(req.auth!.membership.role);

        const {
          plantId,
          parentAssetId,
          assetTag,
          name,
          machineType,
          area,
          building,
          productionLine,
          locationDescription,
          manufacturer,
          modelNumber,
          serialNumber,
          installationDate,
          operationalState,
          criticality,
          department,
          dataClassification,
          authorizedAccessScope,
          verificationState,
          documentationReadiness,
          technicalSpecs,
          hasModel3d,
          model3dStorageKey,
          model3dFormat,
          hasPidDiagram,
          pidStorageKey,
          provenance,
        } = req.body;

        if (!assetTag || !name) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'Asset Tag and Machine Name are required for registration.',
            },
          });
          return;
        }

        const orgPlants = await dataStore.listPlants(orgId);
        const resolvedPlantId = plantId || orgPlants[0]?.id || 'default-plant';

        // Plant scoping enforcement
        if (!isSuperAdmin && assignedPlants.length > 0 && !assignedPlants.includes(resolvedPlantId)) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_PLANT_ACCESS_DENIED',
              message: 'You are not authorized to register machines for this plant.',
            },
          });
          return;
        }

        // Duplicate asset tag check
        const existing = await dataStore.getMachineByAssetTag(orgId, assetTag);
        if (existing) {
          res.status(409).json({
            success: false,
            error: {
              code: 'FORGEX_ASSET_TAG_CONFLICT',
              message: `A machine with asset tag '${assetTag}' already exists in this organization.`,
            },
          });
          return;
        }

        const dto: CreateMachineDTO = {
          plantId: resolvedPlantId,
          parentAssetId: parentAssetId || null,
          assetTag: assetTag.trim().toUpperCase(),
          name: name.trim(),
          machineType: machineType || 'Industrial Machinery',
          area: area || 'Main Production',
          building: building || null,
          productionLine: productionLine || null,
          locationDescription: locationDescription || null,
          manufacturer: manufacturer || null,
          modelNumber: modelNumber || null,
          serialNumber: serialNumber || null,
          installationDate: installationDate || null,
          operationalState: operationalState || 'OPTIMAL',
          criticality: criticality || 'MEDIUM',
          department: department || null,
          dataClassification: dataClassification || 'INTERNAL',
          authorizedAccessScope: authorizedAccessScope || 'ORGANIZATION',
          verificationState: verificationState || (serialNumber ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED'),
          documentationReadiness: documentationReadiness || 'INCOMPLETE',
          technicalSpecs: technicalSpecs || {},
          hasModel3d: Boolean(hasModel3d),
          model3dStorageKey: model3dStorageKey || null,
          model3dFormat: model3dFormat || null,
          hasPidDiagram: Boolean(hasPidDiagram),
          pidStorageKey: pidStorageKey || null,
          qrCodeData: `/machines/${assetTag.trim().toUpperCase()}`,
          provenance: provenance || `Admin registered by user ${actorUserId}`,
        };

        const machine = await dataStore.createMachine(orgId, dto);

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_REGISTERED',
          resourceType: 'MACHINE',
          resourceId: machine.id,
          metadata: {
            assetTag: machine.assetTag,
            plantId: machine.plantId,
            documentationReadiness: machine.documentationReadiness,
            dataClassification: machine.dataClassification,
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(201).json({
          success: true,
          message: 'Machine registered successfully.',
          data: machine,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_MACHINE_CREATION_FAILED', message: err?.message || 'Failed to register machine' },
        });
      }
    }
  );

  /**
   * POST /api/v1/machines/bulk
   * Bulk register incomplete or placeholder machines
   */
  router.post(
    '/bulk',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const rawItems = req.body.items || req.body.machines;

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Array of machine items is required.' },
          });
          return;
        }

        const registered: any[] = [];
        const duplicates: any[] = [];
        const orgPlants = await dataStore.listPlants(orgId);
        const defaultPlantId = orgPlants[0]?.id || 'default-plant';

        for (const item of rawItems) {
          if (!item.assetTag || !item.name) {
            continue;
          }
          const existing = await dataStore.getMachineByAssetTag(orgId, item.assetTag);
          if (existing) {
            duplicates.push({ assetTag: item.assetTag, reason: 'Duplicate asset tag' });
            continue;
          }
          const m = await dataStore.createMachine(orgId, {
            plantId: item.plantId || defaultPlantId,
            assetTag: item.assetTag.trim().toUpperCase(),
            name: item.name.trim(),
            machineType: item.machineType || 'Industrial Machinery',
            area: item.area || 'Main Production',
            building: item.building || null,
            productionLine: item.productionLine || null,
            manufacturer: item.manufacturer || null,
            modelNumber: item.modelNumber || null,
            serialNumber: item.serialNumber || null,
            dataClassification: item.dataClassification || 'INTERNAL',
            documentationReadiness: item.documentationReadiness || 'INCOMPLETE',
            verificationState: item.verificationState || 'UNVERIFIED',
            technicalSpecs: item.technicalSpecs || {},
            hasModel3d: Boolean(item.hasModel3d),
            hasPidDiagram: Boolean(item.hasPidDiagram),
            criticality: item.criticality || 'MEDIUM',
            authorizedAccessScope: item.authorizedAccessScope || 'ORGANIZATION',
          });
          registered.push(m);
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINES_BULK_REGISTERED',
          resourceType: 'MACHINE',
          resourceId: orgId,
          metadata: { count: registered.length, skippedDuplicates: duplicates.length },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(201).json({
          success: true,
          message: `Bulk registration completed: ${registered.length} registered, ${duplicates.length} duplicate conflicts skipped.`,
          data: { count: registered.length, registered, registeredMachines: registered, duplicates },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_BULK_FAILED', message: err?.message || 'Bulk registration failed' },
        });
      }
    }
  );

  /**
   * GET /api/v1/machines/ledger/summary
   * Authoritative machine ledger statistics calculated from real records
   */
  router.get(
    '/ledger/summary',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'VIEWER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const plantId = req.query.plantId as string | undefined;
        const summary = await dataStore.getMachineLedgerSummary(orgId, plantId);

        res.status(200).json({
          success: true,
          data: summary,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_LEDGER_FAILED', message: err?.message || 'Failed to get ledger summary' },
        });
      }
    }
  );

  /**
   * POST /api/v1/machines/check-duplicates
   * Detects likely duplicate combinations of manufacturer, model, and serial number
   */
  router.post(
    '/check-duplicates',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const { manufacturer, modelNumber, serialNumber } = req.body;
        const matches = await dataStore.detectPotentialDuplicates(orgId, {
          manufacturer,
          modelNumber,
          serialNumber,
        });

        res.status(200).json({
          success: true,
          isDuplicate: matches.length > 0,
          warning: matches.length > 0 ? `Potential duplicate machine detected matching ${matches[0].manufacturer} ${matches[0].modelNumber}` : undefined,
          data: {
            hasPotentialDuplicates: matches.length > 0,
            matches,
          },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_CHECK_FAILED', message: err?.message || 'Failed to check duplicates' },
        });
      }
    }
  );

  /**
   * GET /api/v1/machines
   * Search, filter, and list machines with plant and role scoping
   */
  router.get(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'WORKER', 'VIEWER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const role = req.auth!.membership.role as OrgRole;
        const assignedPlants = req.auth!.membership.assignedPlantIds ?? [];
        const isSuperAdmin = ['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'].includes(role);

        let plantId = req.query.plantId as string | undefined;
        // Non-super-admins with plant restrictions can only query their plants
        if (!isSuperAdmin && assignedPlants.length > 0) {
          if (plantId && !assignedPlants.includes(plantId)) {
            res.status(403).json({
              success: false,
              error: { code: 'FORGEX_PLANT_ACCESS_DENIED', message: 'Access to this plant is not permitted.' },
            });
            return;
          }
          if (!plantId && assignedPlants.length === 1) {
            plantId = assignedPlants[0];
          }
        }

        const filters: MachineFilterOptions = {
          plantId,
          search: req.query.search as string | undefined,
          documentationReadiness: req.query.documentationReadiness as string | undefined,
          operationalState: req.query.operationalState as string | undefined,
          dataClassification: req.query.dataClassification as string | undefined,
          hasModel3d: req.query.hasModel3d !== undefined ? req.query.hasModel3d === 'true' : undefined,
        };

        let machines = await dataStore.listMachines(orgId, filters);

        // Filter out plants outside scope if multi-plant scope
        if (!isSuperAdmin && assignedPlants.length > 0) {
          machines = machines.filter((m) => assignedPlants.includes(m.plantId));
        }

        res.status(200).json({
          success: true,
          data: machines,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_LIST_FAILED', message: err?.message || 'Failed to list machines' },
        });
      }
    }
  );

  /**
   * GET /api/v1/machines/:id
   * Secure machine details
   */
  router.get(
    '/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'WORKER', 'VIEWER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const assignedPlants = req.auth!.membership.assignedPlantIds ?? [];
        const isSuperAdmin = ['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'].includes(req.auth!.membership.role);

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: 'Machine not found in this organization.' },
          });
          return;
        }

        if (!isSuperAdmin && assignedPlants.length > 0 && !assignedPlants.includes(machine.plantId)) {
          res.status(403).json({
            success: false,
            error: { code: 'FORGEX_PLANT_ACCESS_DENIED', message: 'You are not authorized to access this machine.' },
          });
          return;
        }

        // Enforce Machine-level Data Classification RBAC
        const classificationStr = machine.dataClassification as string;
        const isRestricted =
          classificationStr === 'RESTRICTED' ||
          classificationStr === 'RESTRICTED_CONFIDENTIAL';
        const role = req.auth!.membership.role;
        const canAccessRestricted =
          isSuperAdmin ||
          ['PLANT_MANAGER', 'ENGINEER', 'ENGINEER_TECHNICIAN'].includes(role);

        if (isRestricted && !canAccessRestricted) {
          const securityService = req.app?.locals?.securityService;
          if (securityService) {
            await securityService.recordSecurityEvent({
              organizationId: orgId,
              actorUserId: req.auth!.user.id,
              actorEmail: req.auth!.user.email,
              actorRole: role,
              category: 'RESTRICTED_ACTION',
              action: 'BLOCKED_RESTRICTED_MACHINE_ACCESS',
              resourceCategory: 'MACHINE',
              resourceId: machine.id,
              decision: 'DENIED',
              policyReasonCode: 'RESTRICTED_CLASSIFICATION_DENIED',
              severity: 'HIGH',
              isBenignInquiry: false,
              metadata: {
                assetTag: machine.assetTag,
                dataClassification: machine.dataClassification,
              },
            });
          }

          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_RBAC_FORBIDDEN',
              message: `Access denied: Machine '${machine.assetTag}' is classified as RESTRICTED. Insufficient role clearance.`,
            },
          });
          return;
        }

        res.status(200).json({
          success: true,
          data: machine,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_GET_FAILED', message: err?.message || 'Failed to get machine' },
        });
      }
    }
  );

  /**
   * GET /api/v1/machines/:id/poster
   * Generates printable machine poster and non-sensitive QR payload
   */
  router.get(
    '/:id/poster',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: 'Machine not found.' },
          });
          return;
        }

        const plant = await dataStore.getPlantById(orgId, machine.plantId);

        const posterData = {
          machineId: machine.id,
          assetTag: machine.assetTag,
          machineName: machine.name,
          machineType: machine.machineType,
          plantName: plant?.name || 'Industrial Facility',
          plantCode: plant?.code || 'PLANT',
          area: machine.area,
          locationDescription: machine.locationDescription,
          safetyReminder: 'ALWAYS VERIFY LOTO & ENERGY ISOLATION BEFORE TOUCHING ROTATING EQUIPMENT.',
          qrPayload: `/machines/${machine.id}`, // Opaque route without sensitive secrets
          instructions: 'Scan with authorized ForgeX AI mobile terminal to access operational procedures.',
        };

        res.status(200).json({
          success: true,
          data: posterData,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_POSTER_FAILED', message: err?.message || 'Failed to generate poster' },
        });
      }
    }
  );

  /**
   * PATCH /api/v1/machines/:id
   * Admin / Plant Manager updates machine information
   */
  router.patch(
    '/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const updated = await dataStore.updateMachine(orgId, id, req.body);
        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: 'Machine not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_UPDATED',
          resourceType: 'MACHINE',
          resourceId: updated.id,
          metadata: { revision: updated.revision },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Machine record updated successfully.',
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_UPDATE_FAILED', message: err?.message || 'Failed to update machine' },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/machines/:id
   * Admin deletes a machine record
   */
  router.delete(
    '/:id',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const success = await dataStore.deleteMachine(orgId, id);
        if (!success) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_MACHINE_NOT_FOUND', message: 'Machine not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_DELETED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: {},
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Machine record removed successfully.',
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_DELETE_FAILED', message: err?.message || 'Failed to delete machine' },
        });
      }
    }
  );

  /**
   * GET /api/v1/machines/:id/maintenance-history
   * Retrieve persistent maintenance records for machine
   */
  router.get('/:id/maintenance-history', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const machine = await dataStore.getMachineById(orgId, id);
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found' });
        return;
      }

      const records = await dataStore.getMachineMaintenanceHistory(orgId, id);
      res.status(200).json({ success: true, data: records });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/v1/machines/:id/recurring-faults
   * Analyze recurring faults and safety limits for machine
   */
  router.get('/:id/recurring-faults', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { timeWindowDays, recurrenceCountThreshold } = req.query;

      const machine = await dataStore.getMachineById(orgId, id);
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found' });
        return;
      }

      const analysis = await dataStore.detectRecurringFaults(orgId, id, {
        timeWindowDays: timeWindowDays ? Number(timeWindowDays) : undefined,
        recurrenceCountThreshold: recurrenceCountThreshold ? Number(recurrenceCountThreshold) : undefined,
      });

      res.status(200).json({ success: true, data: analysis });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/machines/:id/historical-faults/match
   * Match, score, and rank historical faults and detect recurring issues
   */
  router.post('/:id/historical-faults/match', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const userRole = req.auth?.membership?.role;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { query, faultCategory, faultCode, componentId, limit, minScore, timeWindowDays } = req.body;

      const machine = await dataStore.getMachineById(orgId, id);
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found in this organization' });
        return;
      }

      const historicalFaultService = new HistoricalFaultService(dataStore);
      const results = await historicalFaultService.matchHistoricalFaults(
        orgId,
        id,
        {
          query,
          faultCategory,
          faultCode,
          componentId,
          limit: limit ? Number(limit) : undefined,
          minScore: minScore ? Number(minScore) : undefined,
          timeWindowDays: timeWindowDays ? Number(timeWindowDays) : undefined,
        },
        userRole
      );

      res.status(200).json({ success: true, data: results });
    } catch (err: any) {
      const isNotFound = err?.message?.includes('not found');
      res.status(isNotFound ? 404 : 500).json({ success: false, error: err?.message || 'Failed to retrieve historical faults' });
    }
  });

  /**
   * GET /api/v1/machines/:id/historical-faults
   * Query historical faults with similarity scoring
   */
  router.get('/:id/historical-faults', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const userRole = req.auth?.membership?.role;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { query, faultCategory, faultCode, componentId, limit, minScore, timeWindowDays } = req.query;

      const machine = await dataStore.getMachineById(orgId, id);
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found in this organization' });
        return;
      }

      const historicalFaultService = new HistoricalFaultService(dataStore);
      const results = await historicalFaultService.matchHistoricalFaults(
        orgId,
        id,
        {
          query: typeof query === 'string' ? query : undefined,
          faultCategory: typeof faultCategory === 'string' ? faultCategory : undefined,
          faultCode: typeof faultCode === 'string' ? faultCode : undefined,
          componentId: typeof componentId === 'string' ? componentId : undefined,
          limit: limit ? Number(limit) : undefined,
          minScore: minScore ? Number(minScore) : undefined,
          timeWindowDays: timeWindowDays ? Number(timeWindowDays) : undefined,
        },
        userRole
      );

      res.status(200).json({ success: true, data: results });
    } catch (err: any) {
      const isNotFound = err?.message?.includes('not found');
      res.status(isNotFound ? 404 : 500).json({ success: false, error: err?.message || 'Failed to retrieve historical faults' });
    }
  });

  /**
   * POST /api/v1/machines/:id/recurring-fault-policy
   * Configure recurrence thresholds and safety stop limits
   */
  router.post(
    '/:id/recurring-fault-policy',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { timeWindowDays, recurrenceCountThreshold, requiresSafetyStop, safetyLimits } = req.body;

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        const config = await dataStore.setRecurringFaultPolicy(orgId, {
          machineId: id,
          machineType: machine.machineType,
          timeWindowDays,
          recurrenceCountThreshold,
          requiresSafetyStop,
          safetyLimits,
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId: req.auth!.user.id,
          action: 'RECURRING_FAULT_POLICY_CONFIGURED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: { config },
        });

        res.status(200).json({
          success: true,
          message: 'Recurring fault threshold and safety limits configured.',
          data: config,
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
      }
    }
  );

  /**
   * GET /api/v1/machines/:id/recurring-fault-policy
   * Get configured recurrence and safety policy for machine
   */
  router.get('/:id/recurring-fault-policy', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const machine = await dataStore.getMachineById(orgId, id);
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found' });
        return;
      }

      const policy = await dataStore.getRecurringFaultPolicy(orgId, id, machine.machineType);
      res.status(200).json({ success: true, data: policy });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  return router;
}

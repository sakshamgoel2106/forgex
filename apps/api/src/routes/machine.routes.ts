import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore, CreateMachineDTO, MachineFilterOptions } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import crypto from 'crypto';
import type { OrgRole, VerificationHistoryEntry } from '@forgex/shared-types';
import { HistoricalFaultService } from '../services/historicalFaultService.js';
import { logger } from '../utils/logger.js';

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

        if (!assetTag || !name || !assetTag.trim() || !name.trim()) {
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
        const matchingPlant = orgPlants.find(
          (p) => p.id === plantId || p.code === plantId || p.name === plantId
        );
        const resolvedPlantId =
          matchingPlant?.id ||
          (assignedPlants.length > 0 ? assignedPlants[0] : null) ||
          orgPlants[0]?.id ||
          plantId ||
          'default-plant';

        // Plant scoping enforcement (only if explicitly specifying a different plant and restricted)
        if (plantId && !isSuperAdmin && assignedPlants.length > 0 && !assignedPlants.includes(resolvedPlantId)) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_PLANT_ACCESS_DENIED',
              message: 'You are not authorized to register machines for this plant.',
            },
          });
          return;
        }

        const cleanTag = assetTag.trim().toUpperCase();
        const cleanName = name.trim();
        const cleanSerial = typeof serialNumber === 'string' && serialNumber.trim() ? serialNumber.trim() : null;
        const cleanMfg = typeof manufacturer === 'string' && manufacturer.trim() ? manufacturer.trim() : null;
        const cleanModel = typeof modelNumber === 'string' && modelNumber.trim() ? modelNumber.trim() : null;

        // Duplicate asset tag check
        const existingTag = await dataStore.getMachineByAssetTag(orgId, cleanTag);
        if (existingTag) {
          res.status(409).json({
            success: false,
            error: {
              code: 'FORGEX_ASSET_TAG_CONFLICT',
              message: `A machine with asset tag '${cleanTag}' already exists in this organization.`,
            },
          });
          return;
        }

        // Duplicate serial number check within organization (only if serial is provided)
        if (cleanSerial) {
          const dupes = await dataStore.detectPotentialDuplicates(orgId, { serialNumber: cleanSerial });
          const exactSerialMatch = dupes.find(
            (d) => d.serialNumber && d.serialNumber.trim().toLowerCase() === cleanSerial.toLowerCase()
          );
          if (exactSerialMatch) {
            res.status(409).json({
              success: false,
              error: {
                code: 'FORGEX_SERIAL_NUMBER_CONFLICT',
                message: `A machine with serial number '${cleanSerial}' already exists in this organization (Asset Tag: ${exactSerialMatch.assetTag}).`,
              },
            });
            return;
          }
        }

        const dto: CreateMachineDTO = {
          plantId: resolvedPlantId,
          parentAssetId: parentAssetId || null,
          assetTag: cleanTag,
          name: cleanName,
          machineType: machineType || 'Industrial Machinery',
          area: area || 'Main Production',
          building: building || null,
          productionLine: productionLine || null,
          locationDescription: locationDescription || null,
          manufacturer: cleanMfg,
          modelNumber: cleanModel,
          serialNumber: cleanSerial,
          installationDate: installationDate || null,
          operationalState: operationalState || 'OPTIMAL',
          criticality:
            criticality === 'CRITICAL'
              ? 'MISSION_CRITICAL'
              : ['LOW', 'MEDIUM', 'HIGH', 'MISSION_CRITICAL'].includes(criticality)
                ? criticality
                : 'MEDIUM',
          department: department || null,
          dataClassification: dataClassification || 'INTERNAL',
          authorizedAccessScope: authorizedAccessScope || 'ORGANIZATION',
          verificationState: verificationState || (cleanSerial ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED'),
          documentationReadiness: documentationReadiness || 'INCOMPLETE',
          technicalSpecs: technicalSpecs || {},
          hasModel3d: Boolean(hasModel3d),
          model3dStorageKey: model3dStorageKey || null,
          model3dFormat: model3dFormat || null,
          hasPidDiagram: Boolean(hasPidDiagram),
          pidStorageKey: pidStorageKey || null,
          qrCodeData: `/machines/${cleanTag}`,
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
        const message = String(err?.message || '');
        const code = String(err?.code || '');
        logger.error({ err: err?.message, code, stack: err?.stack }, 'Machine registration failed');

        if (code === '23505' || message.includes('uq_organization_asset_tag') || message.includes('already exists')) {
          if (message.toLowerCase().includes('serial')) {
            res.status(409).json({
              success: false,
              error: {
                code: 'FORGEX_SERIAL_NUMBER_CONFLICT',
                message: err?.message || 'A machine with this serial number already exists in this organization.',
              },
            });
            return;
          }
          res.status(409).json({
            success: false,
            error: {
              code: 'FORGEX_ASSET_TAG_CONFLICT',
              message: err?.message || 'A machine with this asset tag already exists in this organization.',
            },
          });
          return;
        }

        if (code === '23502' || message.includes('violates not-null constraint')) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: `A required field was missing or invalid: ${message}`,
            },
          });
          return;
        }

        if (code === '23503' || message.includes('violates foreign key constraint')) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_REFERENCE_ERROR',
              message: `Referenced plant or parent asset does not exist: ${message}`,
            },
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: {
            code: 'FORGEX_MACHINE_CREATION_FAILED',
            message: err?.message || 'Failed to register machine. Please review your input and try again.',
          },
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
        const batchSerials = new Set<string>();

        for (const item of rawItems) {
          if (!item.assetTag || !item.name) {
            continue;
          }
          const cleanTag = String(item.assetTag).trim().toUpperCase();
          const cleanName = String(item.name).trim();
          const cleanSerial = typeof item.serialNumber === 'string' && item.serialNumber.trim() ? item.serialNumber.trim() : null;
          const cleanMfg = typeof item.manufacturer === 'string' && item.manufacturer.trim() ? item.manufacturer.trim() : null;
          const cleanModel = typeof item.modelNumber === 'string' && item.modelNumber.trim() ? item.modelNumber.trim() : null;

          const existingTag = await dataStore.getMachineByAssetTag(orgId, cleanTag);
          if (existingTag) {
            duplicates.push({ assetTag: cleanTag, reason: 'Duplicate asset tag' });
            continue;
          }

          if (cleanSerial) {
            const serialLower = cleanSerial.toLowerCase();
            if (batchSerials.has(serialLower)) {
              duplicates.push({ assetTag: cleanTag, reason: `Duplicate serial number '${cleanSerial}' within batch` });
              continue;
            }
            const existingMatches = await dataStore.detectPotentialDuplicates(orgId, { serialNumber: cleanSerial });
            const serialMatch = existingMatches.find(
              (m) => m.serialNumber && m.serialNumber.trim().toLowerCase() === serialLower
            );
            if (serialMatch) {
              duplicates.push({ assetTag: cleanTag, reason: `Duplicate serial number '${cleanSerial}' already exists` });
              continue;
            }
            batchSerials.add(serialLower);
          }

          const m = await dataStore.createMachine(orgId, {
            plantId: item.plantId || defaultPlantId,
            assetTag: cleanTag,
            name: cleanName,
            machineType: item.machineType || 'Industrial Machinery',
            area: item.area || 'Main Production',
            building: item.building || null,
            productionLine: item.productionLine || null,
            manufacturer: cleanMfg,
            modelNumber: cleanModel,
            serialNumber: cleanSerial,
            dataClassification: item.dataClassification || 'INTERNAL',
            documentationReadiness: item.documentationReadiness || 'INCOMPLETE',
            verificationState: item.verificationState || (cleanSerial ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED'),
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
   * Detects likely duplicate combinations of asset tag, manufacturer, model, and serial number
   */
  router.post(
    '/check-duplicates',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const { assetTag, manufacturer, modelNumber, serialNumber } = req.body;

        const cleanTag = typeof assetTag === 'string' && assetTag.trim() ? assetTag.trim().toUpperCase() : undefined;
        const cleanMfg = typeof manufacturer === 'string' && manufacturer.trim() ? manufacturer.trim() : undefined;
        const cleanMdl = typeof modelNumber === 'string' && modelNumber.trim() ? modelNumber.trim() : undefined;
        const cleanSerial = typeof serialNumber === 'string' && serialNumber.trim() ? serialNumber.trim() : undefined;

        let assetTagMatch = null;
        if (cleanTag) {
          assetTagMatch = await dataStore.getMachineByAssetTag(orgId, cleanTag);
        }

        const matches = await dataStore.detectPotentialDuplicates(orgId, {
          manufacturer: cleanMfg,
          modelNumber: cleanMdl,
          serialNumber: cleanSerial,
        });

        const isDuplicate = Boolean(assetTagMatch) || matches.length > 0;
        let warning: string | undefined = undefined;

        if (assetTagMatch) {
          warning = `A machine with asset tag '${cleanTag}' already exists in this organization.`;
        } else if (cleanSerial && matches.some((m) => m.serialNumber && m.serialNumber.trim().toLowerCase() === cleanSerial.toLowerCase())) {
          const serialMatch = matches.find((m) => m.serialNumber && m.serialNumber.trim().toLowerCase() === cleanSerial.toLowerCase())!;
          warning = `A machine with serial number '${cleanSerial}' already exists in this organization (Asset Tag: ${serialMatch.assetTag}).`;
        } else if (matches.length > 0) {
          warning = `Potential duplicate machine detected matching ${matches[0].manufacturer || ''} ${matches[0].modelNumber || ''}`.trim();
        }

        res.status(200).json({
          success: true,
          isDuplicate,
          warning,
          data: {
            hasPotentialDuplicates: isDuplicate,
            assetTagMatch: assetTagMatch ? { id: assetTagMatch.id, assetTag: assetTagMatch.assetTag, name: assetTagMatch.name } : null,
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
   * POST /api/v1/machines/bulk-delete
   * Delete multiple machines in batch
   */
  router.post(
    '/bulk-delete',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const { machineIds } = req.body;

        if (!Array.isArray(machineIds) || machineIds.length === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: 'machineIds array is required.' },
          });
          return;
        }

        const deletedIds: string[] = [];
        for (const id of machineIds) {
          if (typeof id === 'string') {
            const ok = await dataStore.deleteMachine(orgId, id);
            if (ok) {
              deletedIds.push(id);
              await dataStore.recordAuditEvent({
                organizationId: orgId,
                actorUserId,
                action: 'MACHINE_DELETED',
                resourceType: 'MACHINE',
                resourceId: id,
                metadata: { bulk: true },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
              });
            }
          }
        }

        res.status(200).json({
          success: true,
          message: `Successfully removed ${deletedIds.length} machine(s).`,
          data: { deletedCount: deletedIds.length, deletedIds },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_DELETE_FAILED', message: err?.message || 'Failed to bulk delete machines' },
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
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER']),
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

  // --------------------------------------------------------------------------
  // Machine Verification Workflow (Strict Engineering Checks & Signoff)
  // --------------------------------------------------------------------------

  /**
   * GET /api/v1/machines/:id/verification
   * Returns authoritative verification record, checklist items, and history.
   */
  router.get('/:id/verification', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const machine = await dataStore.getMachineById(orgId, id);
      if (!machine) {
        res.status(404).json({ success: false, error: 'Machine not found' });
        return;
      }

      const verification = await dataStore.getMachineVerification(orgId, id);
      res.status(200).json({ success: true, data: verification });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch verification status' });
    }
  });

  /**
   * POST /api/v1/machines/:id/verification/approve
   * Owner / Admin approves machine verification.
   * Enforces all required checks passed before allowing approval.
   */
  router.post(
    '/:id/verification/approve',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const actorRole = req.auth!.membership.role;
        const { notes } = req.body;

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        const currentVerif = await dataStore.getMachineVerification(orgId, id);
        const incompleteChecks = currentVerif.checks.filter(
          (c) => c.required && c.status !== 'PASSED' && c.status !== 'NOT_APPLICABLE'
        );

        if (incompleteChecks.length > 0) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VERIFICATION_INCOMPLETE',
              message: 'Cannot approve machine verification while required checks are incomplete or failing.',
              incompleteChecks: incompleteChecks.map((c) => ({
                key: c.key,
                label: c.label,
                status: c.status,
                failureReason: c.failureReason,
                correctiveAction: c.correctiveAction,
              })),
            },
          });
          return;
        }

        const now = new Date().toISOString();
        const historyEntry: VerificationHistoryEntry = {
          id: crypto.randomUUID(),
          action: 'APPROVED',
          actorUserId,
          actorRole,
          timestamp: now,
          notes: notes || 'Machine verification approved by authorized organization reviewer.',
        };

        const updatedVerif = await dataStore.updateMachineVerification(orgId, id, {
          status: 'VERIFIED',
          overallState: 'VERIFIED',
          approvedByUserId: actorUserId,
          approvedAt: now,
          history: [...(currentVerif.history || []), historyEntry],
        });

        await dataStore.updateMachine(orgId, id, { verificationState: 'VERIFIED' });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_VERIFICATION_APPROVED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: { checks: updatedVerif.checks, approvedAt: now },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Machine verification successfully approved and verified.',
          data: updatedVerif,
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Failed to approve verification' });
      }
    }
  );

  /**
   * POST /api/v1/machines/:id/verification/reject
   * Owner / Admin rejects machine verification with mandatory reason.
   */
  router.post(
    '/:id/verification/reject',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const actorRole = req.auth!.membership.role;
        const { rejectionReason, correctiveActions } = req.body;

        if (!rejectionReason || !rejectionReason.trim()) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'A specific rejectionReason is required to reject machine verification.',
            },
          });
          return;
        }

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        const currentVerif = await dataStore.getMachineVerification(orgId, id);
        const now = new Date().toISOString();
        const historyEntry: VerificationHistoryEntry = {
          id: crypto.randomUUID(),
          action: 'REJECTED',
          actorUserId,
          actorRole,
          timestamp: now,
          notes: rejectionReason.trim(),
        };

        const updatedVerif = await dataStore.updateMachineVerification(orgId, id, {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
          correctiveActions: correctiveActions?.trim() || null,
          history: [...(currentVerif.history || []), historyEntry],
        });

        // Set machine verification state to PARTIALLY_VERIFIED (or UNVERIFIED if identity fails)
        await dataStore.updateMachine(orgId, id, { verificationState: updatedVerif.overallState });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_VERIFICATION_REJECTED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: { rejectionReason: rejectionReason.trim(), correctiveActions },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Machine verification rejected with corrective actions recorded.',
          data: updatedVerif,
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Failed to reject verification' });
      }
    }
  );

  /**
   * POST /api/v1/machines/:id/verification/submit-evidence
   * Authorized Technician or Engineer submits findings, operating specs, or documentation status.
   * Workers and Viewers are strictly denied.
   */
  router.post(
    '/:id/verification/submit-evidence',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'SUPERVISOR', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const actorRole = req.auth!.membership.role;
        const {
          evidenceDescription,
          evidenceAttachmentKeys,
          technicalSpecs,
          serialNumber,
          manufacturer,
          modelNumber,
          documentationReadiness,
        } = req.body;

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        // Apply any updated machine attributes
        const machineUpdates: Partial<CreateMachineDTO> = {};
        if (technicalSpecs && typeof technicalSpecs === 'object') {
          machineUpdates.technicalSpecs = {
            ...machine.technicalSpecs,
            ...technicalSpecs,
          };
        }
        if (typeof serialNumber === 'string' && serialNumber.trim()) {
          machineUpdates.serialNumber = serialNumber.trim();
        }
        if (typeof manufacturer === 'string' && manufacturer.trim()) {
          machineUpdates.manufacturer = manufacturer.trim();
        }
        if (typeof modelNumber === 'string' && modelNumber.trim()) {
          machineUpdates.modelNumber = modelNumber.trim();
        }
        if (documentationReadiness && ['READY', 'PENDING_INSPECTION', 'INCOMPLETE'].includes(documentationReadiness)) {
          machineUpdates.documentationReadiness = documentationReadiness;
        }

        if (Object.keys(machineUpdates).length > 0) {
          await dataStore.updateMachine(orgId, id, machineUpdates);
        }

        const now = new Date().toISOString();
        const historyEntry: VerificationHistoryEntry = {
          id: crypto.randomUUID(),
          action: 'EVIDENCE_SUBMITTED',
          actorUserId,
          actorRole,
          timestamp: now,
          notes: evidenceDescription || 'Verification findings and engineering parameters submitted.',
        };

        const currentVerif = await dataStore.getMachineVerification(orgId, id);
        await dataStore.updateMachineVerification(orgId, id, {
          status: 'IN_PROGRESS',
          lastSubmittedByUserId: actorUserId,
          lastSubmittedAt: now,
          evidenceDescription: evidenceDescription || currentVerif.evidenceDescription,
          evidenceAttachmentKeys: Array.isArray(evidenceAttachmentKeys) ? evidenceAttachmentKeys : currentVerif.evidenceAttachmentKeys,
          history: [...(currentVerif.history || []), historyEntry],
        });

        // Recompute latest state after changes
        const recomputedVerif = await dataStore.getMachineVerification(orgId, id);
        await dataStore.updateMachine(orgId, id, { verificationState: recomputedVerif.overallState });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_VERIFICATION_EVIDENCE_SUBMITTED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: { evidenceDescription, fieldsUpdated: Object.keys(machineUpdates) },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Verification evidence and parameters recorded.',
          data: recomputedVerif,
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Failed to submit verification evidence' });
      }
    }
  );

  /**
   * POST /api/v1/machines/:id/verification/request-approval
   * Authorized Technician or Engineer flags machine as ready for final signoff.
   */
  router.post(
    '/:id/verification/request-approval',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER', 'TECHNICIAN', 'SUPERVISOR', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const actorRole = req.auth!.membership.role;
        const { notes } = req.body;

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        const currentVerif = await dataStore.getMachineVerification(orgId, id);
        const now = new Date().toISOString();
        const historyEntry: VerificationHistoryEntry = {
          id: crypto.randomUUID(),
          action: 'APPROVAL_REQUESTED',
          actorUserId,
          actorRole,
          timestamp: now,
          notes: notes || 'Verification findings submitted; requested Owner/Admin approval.',
        };

        const updatedVerif = await dataStore.updateMachineVerification(orgId, id, {
          status: 'READY_FOR_APPROVAL',
          history: [...(currentVerif.history || []), historyEntry],
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_VERIFICATION_APPROVAL_REQUESTED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: { notes },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Machine verification submitted for approval.',
          data: updatedVerif,
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Failed to request approval' });
      }
    }
  );

  /**
   * POST /api/v1/machines/:id/verification/assign
   * Owner / Admin assigns verification task to an authorized technician/engineer.
   * Connects into existing missing_information_tasks workflow.
   */
  router.post(
    '/:id/verification/assign',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const actorRole = req.auth!.membership.role;
        const { assignedUserId, assignedRole, dueDate, instructions, requestedFields } = req.body;

        if (!assignedUserId) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'assignedUserId is required to assign verification.',
            },
          });
          return;
        }

        const machine = await dataStore.getMachineById(orgId, id);
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        const now = new Date().toISOString();
        const role: OrgRole = assignedRole || 'TECHNICIAN';

        // Connect to existing missing_information_tasks workflow
        const task = await dataStore.createMissingInfoTask(orgId, {
          machineId: id,
          machineAssetTag: machine.assetTag,
          machineName: machine.name,
          assignedUserId,
          assignedRole: role,
          requestedFields: Array.isArray(requestedFields) && requestedFields.length > 0
            ? requestedFields
            : ['serialNumber', 'operatingParameters', 'engineeringDocumentation'],
          instructions: instructions || `Perform engineering verification checks for ${machine.name} (${machine.assetTag}).`,
          dueDate: dueDate || null,
        });

        const currentVerif = await dataStore.getMachineVerification(orgId, id);
        const historyEntry: VerificationHistoryEntry = {
          id: crypto.randomUUID(),
          action: 'TASK_ASSIGNED',
          actorUserId,
          actorRole,
          timestamp: now,
          notes: `Assigned verification task to user '${assignedUserId}' (${role}). Task ID: ${task.id}`,
        };

        const updatedVerif = await dataStore.updateMachineVerification(orgId, id, {
          status: 'IN_PROGRESS',
          assignedUserId,
          assignedRole: role,
          history: [...(currentVerif.history || []), historyEntry],
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'MACHINE_VERIFICATION_ASSIGNED',
          resourceType: 'MACHINE',
          resourceId: id,
          metadata: { assignedUserId, assignedRole: role, taskId: task.id },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Machine verification task assigned successfully.',
          data: {
            verification: updatedVerif,
            task,
          },
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err?.message || 'Failed to assign verification task' });
      }
    }
  );

  return router;
}

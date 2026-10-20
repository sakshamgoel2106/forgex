import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import { MachineRecoveryService } from '../services/machineRecovery.service.js';
import { requireRole } from '../middleware/auth.middleware.js';
import type {
  CreateEvidenceClaimDTO,
  ReviewEvidenceClaimDTO,
  IngestEvidenceExtractDTO,
  ClaimFilterOptions,
  BulkMachineImportDTO,
  SubmitTaskEvidenceDTO,
  ReviewTaskSubmissionDTO,
  CreateExpertKnowledgeDTO,
  ReviewExpertKnowledgeDTO,
  ExpertKnowledgeFilterOptions,
} from '@forgex/shared-types';

export function createRecoveryRouter(
  dataStore: IDataStore,
  recoveryService: MachineRecoveryService,
  _storageAdapter?: IStorageAdapter
): Router {
  const router = Router();

  /**
   * GET /api/v1/recovery/summary
   * Overview metrics & counts for old machine knowledge recovery
   */
  router.get('/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const plantId = req.query.plantId as string | undefined;

      const summary = await recoveryService.getRecoverySummary(orgId, plantId);
      res.json({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * GET /api/v1/recovery/machines/:machineId/profile
   * Machine Knowledge Recovery Profile with Gap Analysis & Verification Checklist
   */
  router.get('/machines/:machineId/profile', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const machineId = req.params.machineId as string;

      const machine = await dataStore.getMachineById(orgId, machineId);
      if (!machine) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Machine '${machineId}' not found.` },
        });
        return;
      }

      // Plant assignment scope check
      const assignedPlants = req.auth!.membership.assignedPlantIds;
      if (assignedPlants && assignedPlants.length > 0 && !assignedPlants.includes(machine.plantId)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_CROSS_PLANT_DENIED',
            message: `User is not authorized to access machine in plant '${machine.plantId}'.`,
          },
        });
        return;
      }

      const profile = await recoveryService.getRecoveryProfile(orgId, machineId);
      res.json({
        success: true,
        data: profile,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/machines/register
   * Partial or complete registration of legacy / unidentified machine
   * Missing fields remain explicitly unknown rather than guessed.
   */
  router.post(
    '/machines/register',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const {
          plantId,
          assetTag,
          name,
          machineType,
          area,
          manufacturer,
          modelNumber,
          serialNumber,
          manufacturingYear,
          locationDescription,
          criticality,
          unresolvedIdentityQuestions,
        } = req.body;

        if (!plantId || !assetTag || !name) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'plantId, assetTag, and name are required.',
            },
          });
          return;
        }

        const plant = await dataStore.getPlantById(orgId, plantId);
        if (!plant) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Plant '${plantId}' not found in organization.` },
          });
          return;
        }

        // Determine verification state & identity confidence
        const hasMfr = manufacturer && manufacturer !== 'UNKNOWN';
        const hasModel = modelNumber && modelNumber !== 'UNKNOWN';
        const hasSerial = serialNumber && serialNumber !== 'UNKNOWN';

        const verificationState = hasMfr && hasModel && hasSerial ? 'VERIFIED' : hasMfr || hasModel ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED';
        const identificationConfidence = hasMfr && hasModel && hasSerial ? 'VERIFIED' : hasMfr || hasModel ? 'PARTIAL' : 'UNIDENTIFIED';

        // Check for existing machine with assetTag to update or create
        const existing = await dataStore.getMachineByAssetTag(orgId, assetTag);
        let machine;

        if (existing) {
          machine = await dataStore.updateMachine(orgId, existing.id, {
            name,
            machineType: machineType || existing.machineType,
            area: area || existing.area,
            manufacturer: manufacturer !== undefined ? manufacturer : existing.manufacturer,
            modelNumber: modelNumber !== undefined ? modelNumber : existing.modelNumber,
            serialNumber: serialNumber !== undefined ? serialNumber : existing.serialNumber,
            locationDescription: locationDescription || existing.locationDescription,
            criticality: criticality || existing.criticality,
            verificationState,
            documentationReadiness: verificationState === 'VERIFIED' ? 'READY' : 'INCOMPLETE',
            ...(manufacturingYear ? { manufacturingYear: Number(manufacturingYear) } as any : {}),
            ...(unresolvedIdentityQuestions ? { unresolvedIdentityQuestions } as any : {}),
          });
        } else {
          machine = await dataStore.createMachine(orgId, {
            plantId,
            assetTag,
            name,
            machineType: machineType || 'Industrial Machinery',
            area: area || 'General Plant Area',
            manufacturer: manufacturer || null,
            modelNumber: modelNumber || null,
            serialNumber: serialNumber || null,
            locationDescription: locationDescription || null,
            criticality: criticality || 'MEDIUM',
            dataClassification: 'INTERNAL',
            authorizedAccessScope: 'ORGANIZATION',
          });

          machine = await dataStore.updateMachine(orgId, machine.id, {
            verificationState,
            documentationReadiness: verificationState === 'VERIFIED' ? 'READY' : 'INCOMPLETE',
            ...(manufacturingYear ? { manufacturingYear: Number(manufacturingYear) } : {}),
            ...(unresolvedIdentityQuestions ? { unresolvedIdentityQuestions } : {}),
          } as any);
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: existing ? 'MACHINE_UPDATED' : 'MACHINE_CREATED',
          resourceType: 'MACHINE',
          resourceId: machine?.id || assetTag,
          metadata: {
            assetTag,
            verificationState,
            identificationConfidence,
            hasManufacturer: Boolean(hasMfr),
            hasModelNumber: Boolean(hasModel),
            hasSerialNumber: Boolean(hasSerial),
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(existing ? 200 : 201).json({
          success: true,
          message: existing
            ? 'Machine recovery identity updated.'
            : 'New machine registered in knowledge recovery registry.',
          data: machine,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
        });
      }
    }
  );

  /**
   * POST /api/v1/recovery/machines/bulk-import
   * Bulk CSV/XLSX/JSON machine onboarding with duplicate detection & partial completeness tracking
   * Strictly restricted to Admins.
   */
  router.post(
    '/machines/bulk-import',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorEmail = req.auth!.user.email;
        const actorRole = req.auth!.membership.role;

        const dto: BulkMachineImportDTO = req.body;
        const result = await recoveryService.bulkImportMachines(orgId, dto, {
          organizationId: orgId,
          userId: actorUserId,
          userEmail: actorEmail,
          userRole: actorRole,
        });

        res.status(201).json({
          success: true,
          message: `Bulk import completed: ${result.registeredCount} registered, ${result.duplicatesSkippedCount} duplicates skipped, ${result.errorsCount} errors.`,
          data: result,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_BULK_IMPORT_FAILED', message: err.message },
        });
      }
    }
  );

  /**
   * POST /api/v1/recovery/evidence/ingest
   * Ingest evidence (nameplate photo, scanned manual, drawing, notes) and extract candidate claims
   */
  router.post('/evidence/ingest', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorUserId = req.auth!.user.id;
      const actorEmail = req.auth!.user.email;
      const actorRole = req.auth!.membership.role;
      const assignedPlantIds = req.auth!.membership.assignedPlantIds;

      const dto: IngestEvidenceExtractDTO = req.body;
      if (!dto.machineId || !dto.evidenceType) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'machineId and evidenceType are required.',
          },
        });
        return;
      }

      const result = await recoveryService.ingestAndExtractEvidence(dto, {
        organizationId: orgId,
        userId: actorUserId,
        userEmail: actorEmail,
        userRole: actorRole,
        assignedPlantIds,
      });

      res.status(201).json({
        success: true,
        message: `Extracted ${result.extractedClaims.length} candidate claims. Stored as unverified claims awaiting review.`,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.message.includes('Unauthorized') ? 403 : err.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: { code: 'FORGEX_RECOVERY_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/claims
   * Submit manual candidate claim
   */
  router.post('/claims', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorUserId = req.auth!.user.id;
      const actorEmail = req.auth!.user.email;

      const dto: CreateEvidenceClaimDTO = req.body;
      if (!dto.machineId || !dto.fieldName || dto.claimValue === undefined || !dto.sourceType) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'machineId, fieldName, claimValue, and sourceType are required.',
          },
        });
        return;
      }

      const claim = await dataStore.createEvidenceClaim(orgId, {
        ...dto,
        extractionMethod: dto.extractionMethod || 'MANUAL_ENTRY',
        submittedByUserId: actorUserId,
        submittedByEmail: actorEmail,
      });

      res.status(201).json({
        success: true,
        message: 'Evidence claim submitted for engineering review.',
        data: claim,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'FORGEX_CLAIM_ERROR', message: err.message },
      });
    }
  });

  /**
   * GET /api/v1/recovery/claims
   * List claims with filtering
   */
  router.get('/claims', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const filters: ClaimFilterOptions = {
        machineId: req.query.machineId as string | undefined,
        plantId: req.query.plantId as string | undefined,
        status: req.query.status as any,
        fieldName: req.query.fieldName as string | undefined,
        isSafetyCritical: req.query.isSafetyCritical !== undefined ? req.query.isSafetyCritical === 'true' : undefined,
        submittedByUserId: req.query.submittedByUserId as string | undefined,
      };

      const claims = await recoveryService.listClaims(orgId, filters);
      res.json({
        success: true,
        data: claims,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * GET /api/v1/recovery/claims/:claimId
   * Retrieve a specific evidence claim with audit trail
   */
  router.get('/claims/:claimId', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const claimId = req.params.claimId as string;

      const claim = await dataStore.getEvidenceClaimById(orgId, claimId);
      if (!claim) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Evidence claim '${claimId}' not found.` },
        });
        return;
      }

      res.json({
        success: true,
        data: claim,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/claims/:claimId/review
   * Qualified engineering review of evidence claim (APPROVE, REJECT, REQUEST_ADDITIONAL_EVIDENCE, SUPERSEDE)
   * Enforces server-side RBAC and anti-self-approval rule.
   */
  router.post(
    '/claims/:claimId/review',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorEmail = req.auth!.user.email;
        const actorRole = req.auth!.membership.role;
        const claimId = req.params.claimId as string;

        const reviewDto: ReviewEvidenceClaimDTO = req.body;
        if (!reviewDto.decision || !reviewDto.reviewRationale) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'decision and reviewRationale are required for claim review.',
            },
          });
          return;
        }

        const reviewed = await recoveryService.reviewClaim(orgId, claimId, reviewDto, {
          organizationId: orgId,
          userId: actorUserId,
          userEmail: actorEmail,
          userRole: actorRole,
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: `CLAIM_${reviewDto.decision}`,
          resourceType: 'EVIDENCE_CLAIM',
          resourceId: claimId,
          metadata: {
            decision: reviewDto.decision,
            fieldName: reviewed.fieldName,
            machineId: reviewed.machineId,
            isSafetyCritical: reviewed.isSafetyCritical,
            reviewRationale: reviewDto.reviewRationale,
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.json({
          success: true,
          message: `Claim successfully reviewed with decision: ${reviewDto.decision}.`,
          data: reviewed,
        });
      } catch (err: any) {
        const statusCode = err.message.includes('Anti-self-approval') || err.message.includes('Unauthorized') ? 403 : 400;
        const code = err.message.includes('Anti-self-approval') ? 'FORGEX_SELF_APPROVAL_FORBIDDEN' : 'FORGEX_REVIEW_ERROR';
        res.status(statusCode).json({
          success: false,
          error: { code, message: err.message },
        });
      }
    }
  );

  /**
   * POST /api/v1/recovery/tasks
   * Create knowledge collection task with safety validation
   */
  router.post(
    '/tasks',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorEmail = req.auth!.user.email;
        const actorRole = req.auth!.membership.role;

        const { machineId, requestedFields, instructions, assignedUserId, assignedRole, dueDate, reasonForRequest } = req.body;
        if (!machineId || !requestedFields || !instructions) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'machineId, requestedFields, and instructions are required.',
            },
          });
          return;
        }

        const task = await recoveryService.createSafeCollectionTask(
          orgId,
          {
            machineId,
            requestedFields,
            instructions,
            assignedUserId,
            assignedRole,
            dueDate,
            reasonForRequest,
          },
          {
            organizationId: orgId,
            userId: actorUserId,
            userEmail: actorEmail,
            userRole: actorRole,
          }
        );

        res.status(201).json({
          success: true,
          message: 'Safe knowledge collection task created and assigned.',
          data: task,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_TASK_ERROR', message: err.message },
        });
      }
    }
  );

  /**
   * GET /api/v1/recovery/tasks
   * List missing information tasks with filtering
   */
  router.get('/tasks', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const { machineId, status, assignedUserId } = req.query;

      const tasks = await dataStore.listMissingInfoTasks(orgId, {
        machineId: machineId as string | undefined,
        status: status as any,
        assignedUserId: assignedUserId as string | undefined,
      });

      res.status(200).json({
        success: true,
        data: tasks,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * GET /api/v1/recovery/tasks/:taskId
   * Retrieve a specific missing information task
   */
  router.get('/tasks/:taskId', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const taskId = req.params.taskId as string;

      const task = await dataStore.getMissingInfoTaskById(orgId, taskId);
      if (!task) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Task '${taskId}' not found.` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/tasks/bulk-assign
   * Bulk assign missing information tasks across multiple machines
   */
  router.post(
    '/tasks/bulk-assign',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorEmail = req.auth!.user.email;
        const actorRole = req.auth!.membership.role;

        const { machineIds, requestedFields, instructions, assignedUserId, assignedRole, dueDate } = req.body;
        if (!Array.isArray(machineIds) || machineIds.length === 0 || !requestedFields || !instructions) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'machineIds array, requestedFields, and instructions are required.',
            },
          });
          return;
        }

        const tasks = await recoveryService.bulkAssignTasks(
          orgId,
          { machineIds, requestedFields, instructions, assignedUserId, assignedRole, dueDate },
          { organizationId: orgId, userId: actorUserId, userEmail: actorEmail, userRole: actorRole }
        );

        res.status(201).json({
          success: true,
          message: `Bulk assigned ${tasks.length} missing information tasks.`,
          data: tasks,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_BULK_ASSIGN_ERROR', message: err.message },
        });
      }
    }
  );

  /**
   * POST /api/v1/recovery/tasks/:taskId/submit
   * Technician submits evidence and measurements for assigned task
   * Evidence remains unverified candidate claims until approved.
   */
  router.post('/tasks/:taskId/submit', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const taskId = req.params.taskId as string;
      const actorUserId = req.auth!.user.id;
      const actorEmail = req.auth!.user.email;
      const actorRole = req.auth!.membership.role;

      const dto: SubmitTaskEvidenceDTO = req.body;
      const updated = await recoveryService.submitTaskEvidence(orgId, taskId, dto, {
        organizationId: orgId,
        userId: actorUserId,
        userEmail: actorEmail,
        userRole: actorRole,
      });

      res.status(200).json({
        success: true,
        message: 'Task evidence submitted. Stored as candidate claims awaiting review.',
        data: updated,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'FORGEX_SUBMISSION_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/tasks/:taskId/review
   * Qualified engineering review of task submission (APPROVE, CHANGES_REQUESTED, REJECT)
   * Enforces server-side anti-self-approval rule.
   */
  router.post(
    '/tasks/:taskId/review',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const taskId = req.params.taskId as string;
        const actorUserId = req.auth!.user.id;
        const actorEmail = req.auth!.user.email;
        const actorRole = req.auth!.membership.role;

        const dto: ReviewTaskSubmissionDTO = req.body;
        if (!dto.decision || !dto.reviewFeedback) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'decision and reviewFeedback are required.',
            },
          });
          return;
        }

        const reviewed = await recoveryService.reviewTaskSubmission(orgId, taskId, dto, {
          organizationId: orgId,
          userId: actorUserId,
          userEmail: actorEmail,
          userRole: actorRole,
        });

        res.status(200).json({
          success: true,
          message: `Task submission reviewed with decision: ${dto.decision}.`,
          data: reviewed,
        });
      } catch (err: any) {
        const statusCode = err.message.includes('Anti-self-approval') ? 403 : 400;
        res.status(statusCode).json({
          success: false,
          error: { code: 'FORGEX_TASK_REVIEW_ERROR', message: err.message },
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Expert Knowledge Library Endpoints (Prompt 04)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/recovery/expert-library
   * List structured expert knowledge entries with filtering
   */
  router.get('/expert-library', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const filters: ExpertKnowledgeFilterOptions = {
        plantId: req.query.plantId as string | undefined,
        machineId: req.query.machineId as string | undefined,
        category: req.query.category as any,
        status: req.query.status as any,
        search: req.query.search as string | undefined,
        dataClassification: req.query.dataClassification as string | undefined,
      };

      const entries = await recoveryService.listExpertKnowledge(orgId, filters);
      res.status(200).json({
        success: true,
        data: entries,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * GET /api/v1/recovery/expert-library/:id
   * Get single expert knowledge record
   */
  router.get('/expert-library/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;

      const entry = await recoveryService.getExpertKnowledgeById(orgId, id);
      if (!entry) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: entry,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/expert-library
   * Create structured expert knowledge entry (technician findings, repair resolutions, failure patterns)
   */
  router.post('/expert-library', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorUserId = req.auth!.user.id;
      const actorEmail = req.auth!.user.email;
      const actorRole = req.auth!.membership.role;

      const dto: CreateExpertKnowledgeDTO = req.body;
      if (!dto.plantId || !dto.category || !dto.title || !dto.description) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'plantId, category, title, and description are required.',
          },
        });
        return;
      }

      const entry = await recoveryService.createExpertKnowledge(orgId, dto, {
        organizationId: orgId,
        userId: actorUserId,
        userEmail: actorEmail,
        userRole: actorRole,
      });

      res.status(201).json({
        success: true,
        message: 'Expert knowledge candidate record created, awaiting engineering review.',
        data: entry,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'FORGEX_EXPERT_CREATE_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/expert-library/:id/review
   * Engineering review of expert knowledge entry (APPROVE, REJECT, REVOKE, SUPERSEDE)
   * Anti-self-approval enforced.
   */
  router.post(
    '/expert-library/:id/review',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER', 'ENGINEER_TECHNICIAN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = req.params.id as string;
        const actorUserId = req.auth!.user.id;
        const actorEmail = req.auth!.user.email;
        const actorRole = req.auth!.membership.role;

        const dto: ReviewExpertKnowledgeDTO = req.body;
        if (!dto.decision || !dto.reviewRationale) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'decision and reviewRationale are required.',
            },
          });
          return;
        }

        const reviewed = await recoveryService.reviewExpertKnowledge(orgId, id, dto, {
          organizationId: orgId,
          userId: actorUserId,
          userEmail: actorEmail,
          userRole: actorRole,
        });

        res.status(200).json({
          success: true,
          message: `Expert knowledge entry reviewed with decision: ${dto.decision}.`,
          data: reviewed,
        });
      } catch (err: any) {
        const statusCode = err.message.includes('Anti-self-approval') ? 403 : 400;
        res.status(statusCode).json({
          success: false,
          error: { code: 'FORGEX_EXPERT_REVIEW_ERROR', message: err.message },
        });
      }
    }
  );

  /**
   * POST /api/v1/recovery/expert-library/:id/revoke
   * Revoke an approved expert knowledge record
   */
  router.post(
    '/expert-library/:id/revoke',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const id = req.params.id as string;
        const actorUserId = req.auth!.user.id;
        const { reason } = req.body;

        const revoked = await recoveryService.revokeExpertKnowledge(
          orgId,
          id,
          reason || 'Revoked by authority',
          { organizationId: orgId, userId: actorUserId }
        );

        if (!revoked) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: 'Expert knowledge entry revoked.',
          data: revoked,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
        });
      }
    }
  );

  return router;
}

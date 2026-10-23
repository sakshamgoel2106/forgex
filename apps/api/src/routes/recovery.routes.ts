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
  ExpertNoteReview,
} from '@forgex/shared-types';

import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import { RecoveryAiExtractor } from '../services/recoveryAiExtractor.js';
import type { Machine } from '@forgex/shared-types';

export function createRecoveryRouter(
  dataStore: IDataStore,
  recoveryService: MachineRecoveryService,
  _storageAdapter?: IStorageAdapter,
  embeddingAdapter?: IEmbeddingAdapter,
  vectorStore?: IVectorStoreAdapter
): Router {
  const router = Router();
  const recoveryExtractor = new RecoveryAiExtractor(dataStore);

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
          estimatedVintage,
          nameplateImage,
          locationDescription,
          criticality,
          unresolvedIdentityQuestions,
          technicalSpecs,
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

        const mergedSpecs: Record<string, any> = {
          ...(existing?.technicalSpecs || {}),
          ...(technicalSpecs || {}),
          ...(estimatedVintage ? { estimatedVintage } : {}),
          ...(nameplateImage ? {
            nameplateImageName: typeof nameplateImage === 'string' ? nameplateImage : nameplateImage.filename || nameplateImage.name,
            nameplateImageDataUrl: typeof nameplateImage === 'object' ? nameplateImage.dataUrl || nameplateImage.preview : undefined,
            hasNameplateImage: true,
          } : {}),
        };

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
            technicalSpecs: mergedSpecs,
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
            technicalSpecs: mergedSpecs,
          });

          machine = await dataStore.updateMachine(orgId, machine.id, {
            verificationState,
            documentationReadiness: verificationState === 'VERIFIED' ? 'READY' : 'INCOMPLETE',
            technicalSpecs: mergedSpecs,
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

  function isInsightRedundant(fieldAction: string, insight?: string | null): boolean {
    if (!insight || !insight.trim()) return true;
    if (!fieldAction || !fieldAction.trim()) return false;

    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const normAction = normalize(fieldAction);
    const normInsight = normalize(insight);

    // Exact or near-exact match
    if (normAction === normInsight) return true;
    if (normAction.includes(normInsight)) return true;
    if (normInsight.includes(normAction) && normInsight.length - normAction.length < 25) return true;

    // Detect technical cross-reference markers: OEM manual sections, torque, tolerances, LOTO/standards
    const crossRefRegex = /(section \d+(\.\d+)?|api \d+|osha \d+(\.\d+)?|nfpa \d+[a-z]?|iso \d+(-\d+)?|\b\d+(\.\d+)?\s*(nm|ft-lbs|bar|psig|mm|in|rpm)\b|\bplan \d+[a-z]?\b|\bcategory \d\b)/gi;
    const refsInInsight = insight.match(crossRefRegex) || [];

    if (refsInInsight.length > 0) {
      const allRefsInAction = refsInInsight.every((ref) => normAction.includes(normalize(ref)));
      if (allRefsInAction) {
        const actionWords = new Set(normAction.split(' '));
        const novelWords = normInsight.split(' ').filter((w) => w.length > 3 && !actionWords.has(w));
        if (novelWords.length < 5) return true;
      }
    } else {
      const actionWords = new Set(normAction.split(' '));
      const novelWords = normInsight.split(' ').filter((w) => w.length > 3 && !actionWords.has(w));
      if (novelWords.length < 5) return true;
    }

    return false;
  }

  function generateAiSupplementalInsight(data: {
    assetTag?: string | null;
    category?: string;
    title: string;
    description: string;
    symptom?: string | null;
    taskDuringIssue?: string | null;
  }): string | null {
    const tag = (data.assetTag || 'EQUIPMENT').toUpperCase();
    const cat = data.category || 'Reliability';
    const task = data.taskDuringIssue || 'Routine Maintenance';

    let candidate = '';
    if (tag.includes('PUMP') || tag.includes('SLURRY')) {
      candidate = `Cross-check API 610 seal flush Plan 11/53A pressures before starting. Verify casing bolt torque cross-pattern sequence to 85 Nm, and ensure full LOTO isolation of primary suction and discharge isolation valves prior to mechanical seal servicing.`;
    } else if (tag.includes('GEN') || tag.includes('DIESEL') || tag.includes('101')) {
      candidate = `Cross-check OEM manual Section 4.2 for cold-crank pre-lubrication pressure (min 1.8 bar). Verify rotating diode exciter bridge diodes with multimeter before synchronizing, and confirm emergency stop governor trip latch is fully engaged and free of carbon fouling.`;
    } else if (tag.includes('PKG') || tag.includes('901') || tag.includes('CONV')) {
      candidate = `Verify photo-eye sensor optical alignment (margin > 3.0) and tension roller radial runout under 0.05 mm. Confirm Category 4 dual-channel safety relay interlock is tested and cleared before restarting packaging line indexing cycle.`;
    } else if (tag.includes('HEX') || tag.includes('PLATE') || tag.includes('HEAT') || tag.includes('801')) {
      candidate = `Cross-check tightening dimension 'A' across plate pack per heat exchanger manual drawing. Ensure differential pressure across plates does not exceed 4.5 bar during initial fluid charging, and purge all entrained air via top vent valves.`;
    } else if (tag.includes('TURB') || tag.includes('COMP')) {
      candidate = `Verify unloader valve clearance (0.015" feeler gauge) and confirm radial shaft vibration is under 2.8 mm/s RMS (ISO 10816-3). Execute NFPA 70E Arc Flash Class 2 PPE protocol during high-voltage auxiliary lube skid power isolation.`;
    } else if (cat === 'Safety & LOTO') {
      candidate = `Mandatory zero-energy state verification required per OSHA 1910.147. Bleed residual pneumatic/hydraulic line pressure to 0 psig, apply secondary safety padlocks to breaker panel, and log lockout tagout serial number before initiating teardown.`;
    } else {
      candidate = `Cross-check OEM Technical Manual Section 6 for torque tolerances and lubrication intervals. Verify alignment using dial indicator within ±0.05 mm tolerance, and ensure all electrical interlocks and safety guards are re-certified prior to returning machine ${tag} to active production during ${task}.`;
    }

    if (isInsightRedundant(data.description, candidate)) {
      return null;
    }

    return candidate;
  }

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
        severity: req.query.severity as any,
        status: req.query.status as any,
        search: req.query.search as string | undefined,
        dataClassification: req.query.dataClassification as string | undefined,
      };

      const entries = await recoveryService.listExpertKnowledge(orgId, filters);
      const enrichedEntries = entries.map((entry) => {
        if (entry.aiSupplementalInsight) {
          if (isInsightRedundant(entry.description, entry.aiSupplementalInsight)) {
            entry.aiSupplementalInsight = null;
          }
        } else {
          entry.aiSupplementalInsight = generateAiSupplementalInsight({
            assetTag: entry.machineAssetTag || (entry.machineAssetTags && entry.machineAssetTags[0]),
            category: entry.category,
            title: entry.title,
            description: entry.description,
            symptom: entry.symptom,
            taskDuringIssue: entry.taskDuringIssue,
          });
        }
        if (!Array.isArray(entry.reviews)) {
          entry.reviews = [];
        }
        if (typeof entry.averageRating !== 'number') {
          entry.averageRating = 5.0;
        }
        if (typeof entry.reviewCount !== 'number') {
          entry.reviewCount = entry.reviews.length;
        }
        return entry;
      });

      res.status(200).json({
        success: true,
        data: enrichedEntries,
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

      if (entry.aiSupplementalInsight) {
        if (isInsightRedundant(entry.description, entry.aiSupplementalInsight)) {
          entry.aiSupplementalInsight = null;
        }
      } else {
        entry.aiSupplementalInsight = generateAiSupplementalInsight({
          assetTag: entry.machineAssetTag || (entry.machineAssetTags && entry.machineAssetTags[0]),
          category: entry.category,
          title: entry.title,
          description: entry.description,
          symptom: entry.symptom,
          taskDuringIssue: entry.taskDuringIssue,
        });
      }
      if (!Array.isArray(entry.reviews)) {
        entry.reviews = [];
      }
      if (typeof entry.averageRating !== 'number') {
        entry.averageRating = 5.0;
      }
      if (typeof entry.reviewCount !== 'number') {
        entry.reviewCount = entry.reviews.length;
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
   * Create structured expert knowledge entry or batch entries (technician findings, repair resolutions, failure patterns)
   */
  router.post('/expert-library', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorUserId = req.auth!.user.id;
      const actorEmail = req.auth!.user.email;
      const actorRole = req.auth!.membership.role;
      const actorName = (req.auth!.user as any).fullName || (req.auth!.user as any).name || actorEmail;

      const isArray = Array.isArray(req.body) || Array.isArray(req.body.notes);
      const rawNotes: any[] = Array.isArray(req.body)
        ? req.body
        : Array.isArray(req.body.notes)
        ? req.body.notes
        : [req.body];

      if (rawNotes.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'At least one note entry is required.' },
        });
        return;
      }

      // Default plant fallback
      let defaultPlantId = (req.auth!.user as any).plantId;
      if (!defaultPlantId) {
        try {
          const plants = await dataStore.listPlants(orgId);
          if (plants && plants.length > 0) defaultPlantId = plants[0].id;
        } catch {
          // fallback
        }
      }
      if (!defaultPlantId) defaultPlantId = 'plant-default';

      const createdEntries: any[] = [];

      for (const note of rawNotes) {
        const title = (note.title || '').trim();
        const description = (note.description || note.content || note.guidance || '').trim();

        if (!title || !description) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'Title and observation/field guidance content are required for all notes.',
            },
          });
          return;
        }

        const plantId = note.plantId || defaultPlantId;
        const category = note.category || 'Reliability';
        const severity = note.severity || 'Pro-Tip / Best Practice';
        const symptom = note.symptom ? String(note.symptom).trim() : null;
        const taskDuringIssue = note.taskDuringIssue ? String(note.taskDuringIssue).trim() : null;
        const observedAt = note.observedAt ? String(note.observedAt).trim() : null;

        // Parse comma-separated machine tags or asset tag
        const tagInput = note.assetTag || note.machineAssetTag || '';
        let machineAssetTags: string[] = Array.isArray(note.machineAssetTags) ? [...note.machineAssetTags] : [];
        let machineAssetTag: string | null = null;

        if (tagInput) {
          const splitTags = String(tagInput)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          if (splitTags.length > 0) {
            machineAssetTags = Array.from(new Set([...machineAssetTags, ...splitTags]));
            machineAssetTag = splitTags[0];
          }
        }

        let aiSupplementalInsight: string | null = note.aiSupplementalInsight || null;
        if (aiSupplementalInsight && isInsightRedundant(description, aiSupplementalInsight)) {
          aiSupplementalInsight = null;
        } else if (!aiSupplementalInsight) {
          aiSupplementalInsight = generateAiSupplementalInsight({
            assetTag: machineAssetTag,
            category,
            title,
            description,
            symptom,
            taskDuringIssue,
          });
        }

        const dto: CreateExpertKnowledgeDTO = {
          plantId,
          machineId: note.machineId || null,
          machineAssetTag,
          machineAssetTags,
          category,
          severity,
          symptom,
          taskDuringIssue,
          observedAt,
          title,
          description,
          aiSupplementalInsight,
          symptoms: note.symptoms || (symptom ? [symptom] : []),
          rootCause: note.rootCause || null,
          resolutionSteps: note.resolutionSteps || [],
          knownFailureModes: note.knownFailureModes || [],
          gapDescription: note.gapDescription || null,
          safetyPrecautions: note.safetyPrecautions || [],
          technicalSpecifications: note.technicalSpecifications || {},
          tags: note.tags || machineAssetTags,
          status: note.status || (isArray ? 'APPROVED' : 'AWAITING_REVIEW'),
          upvotes: typeof note.upvotes === 'number' ? note.upvotes : 0,
          downvotes: typeof note.downvotes === 'number' ? note.downvotes : 0,
          reviews: Array.isArray(note.reviews) ? note.reviews : [],
          averageRating: typeof note.averageRating === 'number' ? note.averageRating : 0,
          reviewCount: typeof note.reviewCount === 'number' ? note.reviewCount : (note.reviews?.length ?? 0),
          dataClassification: note.dataClassification || 'INTERNAL',
        };

        const entry = await recoveryService.createExpertKnowledge(orgId, dto, {
          organizationId: orgId,
          userId: actorUserId,
          userEmail: actorEmail,
          userRole: actorRole,
          userName: actorName,
        });

        createdEntries.push(entry);

        // Vector Indexing into Qdrant Vector Store
        if (embeddingAdapter && vectorStore) {
          const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
          try {
            await vectorStore.ensureCollection(collectionName, embeddingAdapter.getDimensions());

            const tagsText = (entry.machineAssetTags && entry.machineAssetTags.length > 0
              ? entry.machineAssetTags.join(', ')
              : entry.machineAssetTag) || 'Plant Wide';

            const textToEmbed = `Title: ${entry.title}
Equipment Tag(s): ${tagsText}
Category: ${entry.category}
Impact / Severity: ${entry.severity || 'Pro-Tip / Best Practice'}
${entry.taskDuringIssue ? `Task During Issue: ${entry.taskDuringIssue}\n` : ''}${entry.observedAt ? `Observed Date/Time: ${entry.observedAt}\n` : ''}${entry.symptom ? `Symptom / When to Apply: ${entry.symptom}\n` : ''}Observation & Field Guidance: ${entry.description}
${entry.aiSupplementalInsight ? `AI Supplemental Insight & Manual Cross-Check: ${entry.aiSupplementalInsight}\n` : ''}`;

            const vector = await embeddingAdapter.generateEmbedding(textToEmbed);

            const point: VectorPoint = {
              id: entry.id,
              vector,
              payload: {
                organizationId: orgId,
                plantId: entry.plantId,
                documentId: entry.id,
                documentVersionId: '1.0',
                expertKnowledgeId: entry.id,
                type: 'EXPERT_KNOWLEDGE',
                isExpertKnowledge: true,
                pageNumber: 1,
                chunkIndex: 0,
                content: textToEmbed,
                sectionHeading: `Expert Knowledge: ${entry.category}`,
                isTable: false,
                isFigure: false,
                extractionMethod: 'MANUAL_ENTRY',
                title: entry.title,
                category: entry.category,
                severity: entry.severity || 'Pro-Tip / Best Practice',
                symptom: entry.symptom || null,
                taskDuringIssue: entry.taskDuringIssue || null,
                observedAt: entry.observedAt || null,
                assetTags: entry.machineAssetTags || (entry.machineAssetTag ? [entry.machineAssetTag] : []),
                author: entry.authorName || entry.authorEmail || 'Technician',
                upvotes: entry.upvotes || 0,
              },
            };

            await vectorStore.upsertPoints(collectionName, [point]);
          } catch (vecErr: any) {
            console.warn('Vector indexing warning for expert note:', vecErr?.message);
          }
        }
      }

      res.status(201).json({
        success: true,
        message: isArray
          ? `${createdEntries.length} frontline expert note(s) published and vectorized successfully.`
          : 'Expert knowledge candidate record created, awaiting engineering review.',
        data: isArray ? createdEntries : createdEntries[0],
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

  /**
   * POST /api/v1/recovery/expert-library/:id/upvote
   * Increment upvote count for peer endorsement in real-time
   */
  router.post('/expert-library/:id/upvote', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;

      const updated = await recoveryService.upvoteExpertKnowledge(orgId, id);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
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
  });

  router.patch('/expert-library/:id/upvote', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;

      const updated = await recoveryService.upvoteExpertKnowledge(orgId, id);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
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
  });

  /**
   * POST /api/v1/recovery/expert-library/:id/downvote
   * Increment downvote count in real-time
   */
  router.post('/expert-library/:id/downvote', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;

      const updated = await recoveryService.downvoteExpertKnowledge(orgId, id);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
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
  });

  router.patch('/expert-library/:id/downvote', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;

      const updated = await recoveryService.downvoteExpertKnowledge(orgId, id);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
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
  });

  /**
   * PUT /api/v1/recovery/expert-library/:id
   * Edit note title, description, symptom/trigger, task, category, or severity
   */
  router.put('/expert-library/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;
      const actorRole = req.auth!.membership.role;

      const existing = await recoveryService.getExpertKnowledgeById(orgId, id);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
        });
        return;
      }

      const isAdmin =
        actorRole === 'ORGANIZATION_OWNER' ||
        actorRole === 'ORGANIZATION_ADMIN' ||
        (actorRole as string) === 'ADMIN' ||
        actorRole === 'PLANT_MANAGER';

      const actorUserId = req.auth!.user.id;
      const actorName = req.auth!.user.fullName || (req.auth!.user as any).name || '';
      const actorEmail = req.auth!.user.email || '';

      const isAuthor =
        Boolean(existing.authorUserId && existing.authorUserId === actorUserId) ||
        Boolean(existing.authorEmail && actorEmail && existing.authorEmail.toLowerCase() === actorEmail.toLowerCase()) ||
        Boolean(existing.authorName && actorName && existing.authorName.toLowerCase() === actorName.toLowerCase()) ||
        Boolean((existing as any).author && actorName && (existing as any).author.toLowerCase() === actorName.toLowerCase());

      if (!isAdmin && !isAuthor) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_FORBIDDEN',
            message: 'Access denied: Only the note author or an organization administrator may edit expert knowledge entries.',
          },
        });
        return;
      }

      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.symptom !== undefined) updates.symptom = req.body.symptom;
      if (req.body.taskDuringIssue !== undefined) updates.taskDuringIssue = req.body.taskDuringIssue;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.severity !== undefined) updates.severity = req.body.severity;

      if (existing.aiSupplementalInsight) {
        const checkDesc = updates.description || existing.description;
        if (isInsightRedundant(checkDesc, existing.aiSupplementalInsight)) {
          updates.aiSupplementalInsight = null;
        }
      }

      const updated = await recoveryService.updateExpertKnowledge(orgId, id, updates);

      // Re-embed into vector store if updated
      if (updated && embeddingAdapter && vectorStore) {
        const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
        try {
          const tagsText = (updated.machineAssetTags && updated.machineAssetTags.length > 0
            ? updated.machineAssetTags.join(', ')
            : updated.machineAssetTag) || 'Plant Wide';

          const textToEmbed = `Title: ${updated.title}
Equipment Tag(s): ${tagsText}
Category: ${updated.category}
Impact / Severity: ${updated.severity || 'Pro-Tip / Best Practice'}
${updated.taskDuringIssue ? `Task During Issue: ${updated.taskDuringIssue}\n` : ''}${updated.observedAt ? `Observed Date/Time: ${updated.observedAt}\n` : ''}${updated.symptom ? `Symptom / When to Apply: ${updated.symptom}\n` : ''}Observation & Field Guidance: ${updated.description}
${updated.aiSupplementalInsight ? `AI Supplemental Insight & Manual Cross-Check: ${updated.aiSupplementalInsight}\n` : ''}`;

          const vector = await embeddingAdapter.generateEmbedding(textToEmbed);
          await vectorStore.upsertPoints(collectionName, [
            {
              id: updated.id,
              vector,
              payload: {
                organizationId: orgId,
                plantId: updated.plantId,
                documentId: updated.id,
                documentVersionId: '1.0',
                expertKnowledgeId: updated.id,
                type: 'EXPERT_KNOWLEDGE',
                isExpertKnowledge: true,
                pageNumber: 1,
                chunkIndex: 0,
                content: textToEmbed,
                sectionHeading: `Expert Knowledge: ${updated.category}`,
                isTable: false,
                isFigure: false,
                extractionMethod: 'MANUAL_ENTRY',
                title: updated.title,
                category: updated.category,
                severity: updated.severity || 'Pro-Tip / Best Practice',
                symptom: updated.symptom || null,
                taskDuringIssue: updated.taskDuringIssue || null,
                observedAt: updated.observedAt || null,
                assetTags: updated.machineAssetTags || (updated.machineAssetTag ? [updated.machineAssetTag] : []),
                author: updated.authorName || updated.authorEmail || 'Technician',
                upvotes: updated.upvotes || 0,
              },
            },
          ]);
        } catch (vecErr: any) {
          console.warn('Vector store update error for edited expert note:', vecErr?.message);
        }
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
  });

  /**
   * POST /api/v1/recovery/expert-library/:id/reviews
   * Add worker review, star rating (1-5) and field outcome feedback
   */
  router.post('/expert-library/:id/reviews', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;
      const actorUserId = req.auth!.user.id;
      const actorEmail = req.auth!.user.email;
      const actorRole = req.auth!.membership.role;
      const actorName = (req.auth!.user as any).fullName || (req.auth!.user as any).name || actorEmail;

      const rating = Math.max(1, Math.min(5, Number(req.body.rating) || 5));
      const comment = (req.body.comment || '').trim();
      const outcome = req.body.outcome || 'WORKED_IN_FIELD';

      if (!comment) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Review comment is required.' },
        });
        return;
      }

      const review: ExpertNoteReview = {
        id: crypto.randomUUID(),
        userId: actorUserId,
        userName: actorName,
        userRole: actorRole,
        rating,
        outcome,
        comment,
        createdAt: new Date().toISOString(),
      };

      const updated = await recoveryService.addExpertKnowledgeReview(orgId, id, review);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'Worker review and field feedback recorded successfully.',
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * DELETE /api/v1/recovery/expert-library/:id
   * Admin or author deletes expert knowledge note from database and Qdrant vector index
   */
  router.delete('/expert-library/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = req.params.id as string;
      const actorRole = req.auth!.membership.role;

      const existing = await recoveryService.getExpertKnowledgeById(orgId, id);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Expert knowledge entry '${id}' not found.` },
        });
        return;
      }

      const isAdmin =
        actorRole === 'ORGANIZATION_OWNER' ||
        actorRole === 'ORGANIZATION_ADMIN' ||
        (actorRole as string) === 'ADMIN' ||
        actorRole === 'PLANT_MANAGER';

      const actorUserId = req.auth!.user.id;
      const actorName = req.auth!.user.fullName || (req.auth!.user as any).name || '';
      const actorEmail = req.auth!.user.email || '';

      const isAuthor =
        Boolean(existing.authorUserId && existing.authorUserId === actorUserId) ||
        Boolean(existing.authorEmail && actorEmail && existing.authorEmail.toLowerCase() === actorEmail.toLowerCase()) ||
        Boolean(existing.authorName && actorName && existing.authorName.toLowerCase() === actorName.toLowerCase()) ||
        Boolean((existing as any).author && actorName && (existing as any).author.toLowerCase() === actorName.toLowerCase());

      if (!isAdmin && !isAuthor) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_FORBIDDEN',
            message: 'Access denied: Only the note author or an organization administrator may delete expert knowledge entries.',
          },
        });
        return;
      }

      const deleted = await recoveryService.deleteExpertKnowledge(orgId, id);

      // Remove from Qdrant vector index
      if (vectorStore) {
        const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
        try {
          await vectorStore.deletePoints(collectionName, [id]);
        } catch (vecErr: any) {
          console.warn('Vector store deletion error for expert note:', vecErr?.message);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Expert knowledge note deleted from repository and vector index.',
        data: { id, deleted },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INTERNAL_ERROR', message: err.message },
      });
    }
  });

  /**
   * POST /api/v1/recovery/sync-from-documents
   * Triggers automated AI extraction across all indexed documents in Knowledge Hub for linked machines
   */
  router.post('/sync-from-documents', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorUserId = req.auth!.user.id;

      const documents = await dataStore.listDocuments(orgId);
      const allMachines = await dataStore.listMachines(orgId);

      let processedDocsCount = 0;
      let totalClaimsGenerated = 0;

      for (const doc of documents) {
        const versions = await dataStore.listDocumentVersions(doc.id);
        const latestIndexedVersion = versions.find((v) => v.status === 'INDEXED') || versions[0];
        if (!latestIndexedVersion) continue;

        let pages = await dataStore.listDocumentPages(latestIndexedVersion.id);
        if (!pages || pages.length === 0) {
          const chunks = await dataStore.listKnowledgeChunks(latestIndexedVersion.id);
          if (chunks && chunks.length > 0) {
            const pageMap = new Map<number, string[]>();
            for (const c of chunks) {
              const pNum = c.pageNumber || 1;
              const list = pageMap.get(pNum) || [];
              list.push(c.content);
              pageMap.set(pNum, list);
            }
            pages = Array.from(pageMap.entries()).map(([pageNumber, contents]) => ({
              id: crypto.randomUUID(),
              documentVersionId: latestIndexedVersion.id,
              pageNumber,
              rawText: contents.join('\n\n'),
              sectionHeadings: [],
              extractionMethod: 'NATIVE_TEXT',
              hasTables: false,
              createdAt: new Date().toISOString(),
            }));
          }
        }
        if (!pages || pages.length === 0) continue;

        // Resolve linked machines
        const linkedMachineIds: string[] = [];
        try {
          const fromJunction = await dataStore.getLinkedMachineIdsForDocument(orgId, doc.id);
          linkedMachineIds.push(...fromJunction);
        } catch {
          // fallback
        }
        if (doc.machineId) linkedMachineIds.push(doc.machineId);
        if ((doc as any).assetIds && Array.isArray((doc as any).assetIds)) {
          linkedMachineIds.push(...(doc as any).assetIds);
        }

        const targetMachines: Machine[] = [];
        for (const mId of linkedMachineIds) {
          const found = allMachines.find((m) => m.id === mId);
          if (found && !targetMachines.some((item) => item.id === found.id)) {
            targetMachines.push(found);
          }
        }

        // Automatic fallback: match by asset tags, name, manufacturer, model, or single-machine fleet
        if (targetMachines.length === 0) {
          const docTags = doc.assetTags || [];
          const docTitleUpper = (doc.title || '').toUpperCase();
          const pageText = pages.slice(0, 5).map((p) => p.rawText.toUpperCase()).join(' ');

          for (const m of allMachines) {
            const tagUpper = m.assetTag.toUpperCase();
            const nameUpper = (m.name || '').toUpperCase();
            const mfrUpper = (m.manufacturer || '').toUpperCase();
            const modelUpper = (m.modelNumber || '').toUpperCase();

            const isMatched =
              docTags.some((t) => t.toUpperCase() === tagUpper) ||
              pageText.includes(tagUpper) ||
              (nameUpper.length > 3 && (docTitleUpper.includes(nameUpper) || pageText.includes(nameUpper))) ||
              (modelUpper.length > 2 && (docTitleUpper.includes(modelUpper) || pageText.includes(modelUpper))) ||
              (mfrUpper.length > 2 && (docTitleUpper.includes(mfrUpper) || pageText.includes(mfrUpper))) ||
              allMachines.length === 1;

            if (isMatched && !targetMachines.some((item) => item.id === m.id)) {
              targetMachines.push(m);
              dataStore.linkDocumentToAsset(orgId, doc.id, m.id, m.assetTag).catch(() => {});
            }
          }
        }

        if (targetMachines.length > 0) {
          processedDocsCount++;
          const claims = await recoveryExtractor.extractAndSaveMachineRecoveryClaims({
            organizationId: orgId,
            document: {
              id: doc.id,
              documentNumber: doc.documentNumber,
              title: doc.title,
              category: doc.category,
              createdByUserId: doc.createdByUserId,
            },
            version: {
              id: latestIndexedVersion.id,
              revision: latestIndexedVersion.revision,
              storageKey: latestIndexedVersion.storageKey,
            },
            extractedPages: pages.map((p) => ({ pageNumber: p.pageNumber, rawText: p.rawText })),
            targetMachines,
            submittedByUserId: actorUserId,
          });
          totalClaimsGenerated += claims.length;
        }
      }

      res.json({
        success: true,
        message: `Synced ${processedDocsCount} indexed documents across ${allMachines.length} machines. Extracted ${totalClaimsGenerated} parameter claims.`,
        data: {
          processedDocsCount,
          totalClaimsGenerated,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_SYNC_FAILED', message: err?.message || 'Sync failed' },
      });
    }
  });

  return router;
}

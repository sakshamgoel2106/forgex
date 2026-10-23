import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { MaintenanceWorkflowEngine } from '../services/maintenanceWorkflowEngine.js';
import type { MaintenanceCaseStatus, MaintenanceCaseSeverity } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
import { sanitizeMachineOrAssetId } from '../utils/uuid.js';

export class MaintenanceController {
  private idempotencyStore = new Map<string, { data: any; statusCode: number; timestamp: number }>();

  constructor(
    private dataStore: IDataStore,
    private workflowEngine: MaintenanceWorkflowEngine
  ) {}

  /**
   * POST /api/v1/maintenance/cases
   * Creates a maintenance case linked to a plant, asset, and user.
   */
  public createCase = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      // Check idempotency key header
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key']) as string | undefined;
      if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0) {
        const cacheKey = `${organizationId}:${idempotencyKey.trim()}`;
        const cached = this.idempotencyStore.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 60000)) {
          res.setHeader('X-Idempotent-Replay', 'true');
          res.status(cached.statusCode).json(cached.data);
          return;
        }
      }

      const {
        plantId,
        plantName,
        assetId,
        assetTag,
        assetName,
        title,
        description,
        severity = 'MEDIUM',
        symptomDescription,
        operatingConditions,
        visualAssetIds,
        supportingDocumentIds,
        assignedTechnicianUserId,
        assignedTechnicianName,
        sourceTicketId,
        reportedByRole,
        createdAtFormatted,
        machineStatus,
        faultCode,
        topRootCause,
        probability,
        recommendedFix,
        investigationProgress,
        specialistDiscipline,
        priority,
        lotoApplied,
        technicianNotes,
      } = req.body;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: title is mandatory and must be a non-empty string.',
        });
        return;
      }

      if (!symptomDescription || typeof symptomDescription !== 'string' || symptomDescription.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: symptomDescription is mandatory and must be a non-empty string.',
        });
        return;
      }

      if (!assetId || typeof assetId !== 'string' || assetId.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: assetId is mandatory.',
        });
        return;
      }

      const validSeverities: MaintenanceCaseSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (severity && !validSeverities.includes(severity)) {
        res.status(400).json({
          success: false,
          error: "Validation failed: severity must be 'LOW', 'MEDIUM', 'HIGH', or 'CRITICAL'.",
        });
        return;
      }

      if (
        operatingConditions !== undefined &&
        (typeof operatingConditions !== 'object' || operatingConditions === null || Array.isArray(operatingConditions))
      ) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: operatingConditions must be a valid key-value object.',
        });
        return;
      }

      if (sourceTicketId !== undefined && (typeof sourceTicketId !== 'string' || sourceTicketId.trim().length === 0)) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: sourceTicketId must be a valid non-empty string if provided.',
        });
        return;
      }

      const cleanAssetId = sanitizeMachineOrAssetId(assetId.trim());

      const result = await this.workflowEngine.createCase(
        {
          plantId,
          plantName,
          assetId: cleanAssetId,
          assetTag,
          assetName,
          title: title.trim(),
          description: typeof description === 'string' ? description.trim() : undefined,
          severity,
          symptomDescription: symptomDescription.trim(),
          operatingConditions,
          visualAssetIds,
          supportingDocumentIds,
          assignedTechnicianUserId,
          assignedTechnicianName,
          sourceTicketId: typeof sourceTicketId === 'string' ? sourceTicketId.trim() : undefined,
          reportedByRole: reportedByRole || userRole,
          createdAtFormatted,
          machineStatus,
          faultCode,
          topRootCause,
          probability,
          recommendedFix,
          investigationProgress,
          specialistDiscipline,
          priority: priority || severity,
          lotoApplied: Boolean(lotoApplied),
          technicianNotes,
        },
        { organizationId, userId, userRole }
      );

      const responsePayload = {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };

      if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0) {
        const cacheKey = `${organizationId}:${idempotencyKey.trim()}`;
        this.idempotencyStore.set(cacheKey, {
          data: responsePayload,
          statusCode: 201,
          timestamp: Date.now(),
        });
      }

      res.status(201).json(responsePayload);
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to create maintenance case');
      const isClientError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('does not belong') ||
        err?.message?.includes('Invalid') ||
        err?.message?.includes('not found');
      res.status(isClientError ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to create maintenance case.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * PATCH /api/v1/maintenance/cases/:id
   * Updates permitted fields of an existing maintenance case.
   */
  public updateCase = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      // Check for attempted mass-assignment of protected fields
      const protectedFields = [
        'id',
        'organizationId',
        'caseNumber',
        'status',
        'approval',
        'checklist',
        'closedAt',
        'resolvedAt',
        'reportedByUserId',
        'diagnosticHypothesis',
        'findings',
        'createdAt',
        'updatedAt',
      ];
      const attemptedProtected = protectedFields.filter((field) => field in req.body);
      if (attemptedProtected.length > 0) {
        res.status(400).json({
          success: false,
          error: `Mass assignment rejected: Protected field(s) [${attemptedProtected.join(', ')}] cannot be directly modified via general update.`,
        });
        return;
      }

      const { title, description, severity, symptomDescription, operatingConditions, partsUsed, expectedUpdatedAt } = req.body;

      if (
        title === undefined &&
        description === undefined &&
        severity === undefined &&
        symptomDescription === undefined &&
        operatingConditions === undefined &&
        partsUsed === undefined
      ) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: At least one permitted field must be provided for update.',
        });
        return;
      }

      const ifMatchHeader = req.headers['if-match'];
      const versionExpected = (typeof ifMatchHeader === 'string' ? ifMatchHeader : undefined) || expectedUpdatedAt;

      const result = await this.workflowEngine.updateCase(
        id,
        {
          title,
          description,
          severity,
          symptomDescription,
          operatingConditions,
          partsUsed,
          expectedUpdatedAt: versionExpected,
        },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to update maintenance case');
      const isConflict = err?.message?.includes('Conflict');
      const isNotFound = err?.message?.includes('not found') || err?.message?.includes('does not belong');
      const isValidation = err?.message?.includes('Validation') || err?.message?.includes('Cannot update');
      res.status(isConflict ? 409 : isNotFound ? 404 : isValidation ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to update maintenance case.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/diagnose
   * Generates diagnostic hypothesis and guided procedural checklist.
   */
  public diagnoseCase = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = sanitizeMachineOrAssetId(req.params.id as string);
      const query =
        typeof req.body?.query === 'string' && req.body.query.trim().length > 0
          ? req.body.query.trim()
          : undefined;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const result = await this.workflowEngine.diagnoseCase(
        id,
        {
          organizationId,
          userId,
          userRole,
        },
        { query }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to diagnose maintenance case');
      const isNotFound = err?.message?.includes('not found');
      const isUnauthorized = err?.message?.includes('Unauthorized');
      const isValidation = err?.message?.includes('Validation') || err?.message?.includes('Invalid');
      res.status(isNotFound ? 404 : isUnauthorized ? 403 : isValidation ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to diagnose maintenance case.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * PATCH /api/v1/maintenance/cases/:id/steps/:stepId
   * Updates a checklist step status and technician notes.
   */
  public updateChecklistStep = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;
      const stepId = req.params.stepId as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { status, technicianNotes } = req.body;
      if (!status) {
        res.status(400).json({ success: false, error: 'Validation failed: status is required.' });
        return;
      }

      const result = await this.workflowEngine.updateChecklistStep(
        id,
        stepId,
        { status, technicianNotes },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to update checklist step');
      const isClientError = err?.message?.includes('not found');
      res.status(isClientError ? 404 : 500).json({
        success: false,
        error: err?.message || 'Failed to update checklist step.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/findings
   * Records findings and submits work order for supervisor approval.
   */
  public recordFindings = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { observations, measuredValues, correctiveActions, resolutionSummary, partsUsed } = req.body;

      const result = await this.workflowEngine.recordFindingsAndSubmit(
        id,
        { observations, measuredValues, correctiveActions, resolutionSummary, partsUsed },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to record findings and submit');
      const isNotFound = err?.message?.includes('not found');
      const isClientError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Invalid') ||
        isNotFound;
      res.status(isNotFound ? 404 : isClientError ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to record findings.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/approval
   * Approves or rejects work order resolution.
   */
  public reviewApproval = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { approved, reviewerNotes } = req.body;
      if (typeof approved !== 'boolean') {
        res.status(400).json({
          success: false,
          error: "Validation failed: 'approved' must be a boolean.",
        });
        return;
      }

      const result = await this.workflowEngine.reviewApproval(
        id,
        { approved, reviewerNotes },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to review approval');
      const isAuthError = err?.message?.includes('Unauthorized');
      const isNotFoundError = err?.message?.includes('not found');
      const isValidationError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Invalid') ||
        err?.message?.includes('does not belong');
      res.status(isAuthError ? 403 : isNotFoundError ? 404 : isValidationError ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to process approval review.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/assign
   * Assigns a technician to a maintenance case.
   */
  public assignTechnician = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { technicianUserId, technicianName, expectedUpdatedAt, unassign, reason } = req.body;
      const ifMatchHeader = req.headers['if-match'];
      const versionExpected = (typeof ifMatchHeader === 'string' ? ifMatchHeader : undefined) || expectedUpdatedAt;

      if (!technicianUserId && !unassign) {
        res.status(400).json({
          success: false,
          error: "Validation failed: 'technicianUserId' is required.",
        });
        return;
      }

      const result = await this.workflowEngine.assignTechnician(
        id,
        { technicianUserId, technicianName, expectedUpdatedAt: versionExpected, unassign, reason },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to assign technician');
      const isConflict = err?.message?.includes('Conflict');
      const isAuthError = err?.message?.includes('Unauthorized');
      const isNotFoundError = err?.message?.includes('not found');
      const isValidationError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Invalid') ||
        err?.message?.includes('does not belong');
      res
        .status(isConflict ? 409 : isAuthError ? 403 : isNotFoundError ? 404 : isValidationError ? 400 : 500)
        .json({
          success: false,
          error: err?.message || 'Failed to assign technician.',
          timestamp: new Date().toISOString(),
        });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/unassign
   * Unassigns technician from maintenance case.
   */
  public unassignTechnician = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { reason, expectedUpdatedAt } = req.body;
      const ifMatchHeader = req.headers['if-match'];
      const versionExpected = (typeof ifMatchHeader === 'string' ? ifMatchHeader : undefined) || expectedUpdatedAt;

      const result = await this.workflowEngine.unassignTechnician(
        id,
        { reason, expectedUpdatedAt: versionExpected },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to unassign technician');
      const isConflict = err?.message?.includes('Conflict');
      const isAuthError = err?.message?.includes('Unauthorized');
      const isNotFoundError = err?.message?.includes('not found');
      const isValidationError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Invalid') ||
        err?.message?.includes('does not belong');
      res
        .status(isConflict ? 409 : isAuthError ? 403 : isNotFoundError ? 404 : isValidationError ? 400 : 500)
        .json({
          success: false,
          error: err?.message || 'Failed to unassign technician.',
          timestamp: new Date().toISOString(),
        });
    }
  };

  /**
   * GET /api/v1/maintenance/technicians
   * Lists eligible active technicians in current organization for assignment dropdown.
   */
  public listTechnicians = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const members = await this.dataStore.listOrganizationMembers(organizationId);
      const eligibleRoles = [
        'TECHNICIAN',
        'ENGINEER',
        'ENGINEER_TECHNICIAN',
        'SUPERVISOR',
        'PLANT_MANAGER',
        'ORGANIZATION_ADMIN',
        'ORGANIZATION_OWNER',
        'WORKER',
      ];

      const eligible = members
        .filter((m) => m.status === 'ACTIVE' && eligibleRoles.includes(m.role))
        .map((m) => ({
          id: m.userId,
          userId: m.userId,
          fullName: m.user?.fullName || 'Technician',
          email: m.user?.email || '',
          role: m.role,
          status: m.status,
          department: m.user?.department || 'Operations',
        }));

      res.status(200).json({
        success: true,
        data: eligible,
        count: eligible.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to list eligible technicians');
      res.status(500).json({
        success: false,
        error: 'Failed to list eligible technicians.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/close
   * Formally closes a resolved maintenance case.
   */
  public closeCase = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { notes } = req.body;

      const result = await this.workflowEngine.closeCase(
        id,
        { notes },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to close case');
      const isAuthError = err?.message?.includes('Unauthorized');
      const isNotFoundError = err?.message?.includes('not found');
      const isValidationError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Invalid') ||
        err?.message?.includes('Cannot close') ||
        err?.message?.includes('does not belong');
      res.status(isAuthError ? 403 : isNotFoundError ? 404 : isValidationError ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to close maintenance case.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/escalate
   * Escalates case to qualified human engineer.
   */
  public escalateCase = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { reason } = req.body;
      if (!reason) {
        res.status(400).json({ success: false, error: 'Validation failed: reason is required.' });
        return;
      }

      const result = await this.workflowEngine.escalateCase(
        id,
        { reason },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to escalate case');
      const isNotFound = err?.message?.includes('not found');
      const isValidation = err?.message?.includes('Validation') || err?.message?.includes('Invalid');
      res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to escalate case.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/feedback
   * Records feedback and nominates resolution for institutional expert knowledge.
   */
  public recordFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { rating, comment, markCandidateForExpertKnowledge } = req.body;
      if (!rating || !['HELPFUL', 'UNHELPFUL'].includes(rating)) {
        res.status(400).json({
          success: false,
          error: "Validation failed: rating must be 'HELPFUL' or 'UNHELPFUL'.",
        });
        return;
      }

      const result = await this.workflowEngine.recordFeedback(
        id,
        { rating, comment, markCandidateForExpertKnowledge },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to record feedback');
      const isNotFound = err?.message?.includes('not found');
      const isValidation = err?.message?.includes('Validation') || err?.message?.includes('Invalid');
      res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to record feedback.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /api/v1/maintenance/cases
   * Lists maintenance cases with optional filtering.
   */
  public listCases = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { plantId, assetId, status, severity, assignedTechnicianUserId, candidateForExpertKnowledge } =
        req.query;

      const cases = await this.dataStore.listMaintenanceCases(organizationId, {
        plantId: plantId as string | undefined,
        assetId: assetId as string | undefined,
        status: status as MaintenanceCaseStatus | undefined,
        severity: severity as MaintenanceCaseSeverity | undefined,
        assignedTechnicianUserId: assignedTechnicianUserId as string | undefined,
        candidateForExpertKnowledge:
          candidateForExpertKnowledge !== undefined
            ? candidateForExpertKnowledge === 'true'
            : undefined,
      });

      res.status(200).json({
        success: true,
        data: cases,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to list maintenance cases');
      res.status(500).json({
        success: false,
        error: 'Failed to list maintenance cases.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * GET /api/v1/maintenance/cases/:id
   * Retrieves case detail with complete history and audit information.
   */
  public getCaseById = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const id = req.params.id as string;

      if (!organizationId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const result = await this.workflowEngine.getCaseWithHistory(id, {
        organizationId,
        userId: req.auth?.user.id || '',
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to get maintenance case');
      const isClientError = err?.message?.includes('not found');
      res.status(isClientError ? 404 : 500).json({
        success: false,
        error: err?.message || 'Failed to retrieve maintenance case.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/status
   * Enforces valid status transition lifecycle rules with concurrency and RBAC checks.
   */
  public transitionStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { status, reason, notes, expectedUpdatedAt } = req.body;
      if (!status) {
        res.status(400).json({
          success: false,
          error: "Validation failed: 'status' is required for status transition.",
        });
        return;
      }

      const ifMatchHeader = req.headers['if-match'];
      const versionExpected = (typeof ifMatchHeader === 'string' ? ifMatchHeader : undefined) || expectedUpdatedAt;

      const result = await this.workflowEngine.transitionStatus(
        id,
        { status, reason, notes, expectedUpdatedAt: versionExpected },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to transition maintenance case status');
      const isConflict = err?.message?.includes('Conflict');
      const isUnauthorized = err?.message?.includes('Unauthorized');
      const isNotFound = err?.message?.includes('not found') || err?.message?.includes('does not belong');
      const isValidation = err?.message?.includes('Validation') || err?.message?.includes('Invalid');
      res
        .status(isConflict ? 409 : isUnauthorized ? 403 : isNotFound ? 404 : isValidation ? 400 : 500)
        .json({
          success: false,
          error: err?.message || 'Failed to transition maintenance case status.',
          timestamp: new Date().toISOString(),
        });
    }
  };

  /**
   * POST /api/v1/maintenance/cases/:id/reopen
   * Reopens a closed maintenance case with mandatory reason and authorization.
   */
  public reopenCase = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.auth?.organization.id;
      const userId = req.auth?.user.id;
      const userRole = req.auth?.membership.role;
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const { reason, targetStatus, expectedUpdatedAt } = req.body;
      const ifMatchHeader = req.headers['if-match'];
      const versionExpected = (typeof ifMatchHeader === 'string' ? ifMatchHeader : undefined) || expectedUpdatedAt;

      const result = await this.workflowEngine.reopenCase(
        id,
        { reason, targetStatus, expectedUpdatedAt: versionExpected },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to reopen maintenance case');
      const isConflict = err?.message?.includes('Conflict');
      const isUnauthorized = err?.message?.includes('Unauthorized');
      const isNotFound = err?.message?.includes('not found') || err?.message?.includes('does not belong');
      const isValidation = err?.message?.includes('Validation') || err?.message?.includes('Invalid');
      res
        .status(isConflict ? 409 : isUnauthorized ? 403 : isNotFound ? 404 : isValidation ? 400 : 500)
        .json({
          success: false,
          error: err?.message || 'Failed to reopen maintenance case.',
          timestamp: new Date().toISOString(),
        });
    }
  };
}

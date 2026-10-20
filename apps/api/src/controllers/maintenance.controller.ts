import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { MaintenanceWorkflowEngine } from '../services/maintenanceWorkflowEngine.js';
import type { MaintenanceCaseStatus, MaintenanceCaseSeverity } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export class MaintenanceController {
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

      const {
        plantId,
        assetId,
        title,
        description,
        severity,
        symptomDescription,
        operatingConditions,
        visualAssetIds,
        supportingDocumentIds,
        assignedTechnicianUserId,
        assignedTechnicianName,
      } = req.body;

      if (!plantId || !assetId || !title || !symptomDescription) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: plantId, assetId, title, and symptomDescription are mandatory.',
        });
        return;
      }

      const result = await this.workflowEngine.createCase(
        {
          plantId,
          assetId,
          title,
          description,
          severity,
          symptomDescription,
          operatingConditions,
          visualAssetIds,
          supportingDocumentIds,
          assignedTechnicianUserId,
          assignedTechnicianName,
        },
        { organizationId, userId, userRole }
      );

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to create maintenance case');
      const isClientError =
        err?.message?.includes('Validation') ||
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('does not belong');
      res.status(isClientError ? 400 : 500).json({
        success: false,
        error: err?.message || 'Failed to create maintenance case.',
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
      const id = req.params.id as string;

      if (!organizationId || !userId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Missing auth context' });
        return;
      }

      const result = await this.workflowEngine.diagnoseCase(id, {
        organizationId,
        userId,
        userRole,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to diagnose maintenance case');
      const isClientError = err?.message?.includes('not found') || err?.message?.includes('Unauthorized');
      res.status(isClientError ? 404 : 500).json({
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

      const { observations, measuredValues, correctiveActions, resolutionSummary } = req.body;

      const result = await this.workflowEngine.recordFindingsAndSubmit(
        id,
        { observations, measuredValues, correctiveActions, resolutionSummary },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to record findings and submit');
      const isClientError = err?.message?.includes('not found');
      res.status(isClientError ? 404 : 500).json({
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
      res.status(isAuthError ? 403 : isNotFoundError ? 404 : 500).json({
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

      const { technicianUserId, technicianName } = req.body;
      if (!technicianUserId) {
        res.status(400).json({
          success: false,
          error: "Validation failed: 'technicianUserId' is required.",
        });
        return;
      }

      const result = await this.workflowEngine.assignTechnician(
        id,
        { technicianUserId, technicianName },
        { organizationId, userId, userRole }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Failed to assign technician');
      const isAuthError = err?.message?.includes('Unauthorized');
      const isNotFoundError = err?.message?.includes('not found');
      res.status(isAuthError ? 403 : isNotFoundError ? 404 : 500).json({
        success: false,
        error: err?.message || 'Failed to assign technician.',
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
      res.status(isAuthError ? 403 : isNotFoundError ? 404 : 500).json({
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
      const isClientError = err?.message?.includes('not found');
      res.status(isClientError ? 404 : 500).json({
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
      const isClientError = err?.message?.includes('not found');
      res.status(isClientError ? 404 : 500).json({
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
}

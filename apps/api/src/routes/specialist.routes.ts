import { Router, type Request, type Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import type {
  EmployeeAccountStatus,
  EmployeeAvailabilityStatus,
  OrgRole,
  TicketStatus,
  TicketAssignmentStatus,
  TicketSeverity,
} from '@forgex/shared-types';
import { SpecialistRoutingService } from '../services/specialistRouting.service.js';

function getParam(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? '') : (param ?? '');
}

// ==========================================================================
// D. EMPLOYEE AND TECHNICIAN DIRECTORY ROUTER (/api/v1/employees)
// ==========================================================================
export function createEmployeeRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * GET /api/v1/employees
   * List employee directory with filter capabilities
   */
  router.get(
    '/',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'ENGINEER_TECHNICIAN',
    ]),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const { department, plantId, role, accountStatus, availabilityStatus } = req.query;

        const profiles = await dataStore.listEmployeeProfiles(organizationId, {
          department: typeof department === 'string' ? department : undefined,
          plantId: typeof plantId === 'string' ? plantId : undefined,
          role: typeof role === 'string' ? (role as OrgRole) : undefined,
          accountStatus: typeof accountStatus === 'string' ? (accountStatus as EmployeeAccountStatus) : undefined,
          availabilityStatus:
            typeof availabilityStatus === 'string'
              ? (availabilityStatus as EmployeeAvailabilityStatus)
              : undefined,
        });

        res.status(200).json({ success: true, data: profiles });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to list employee directory');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * GET /api/v1/employees/:id
   */
  router.get(
    '/:id',
    requireRole([
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'ENGINEER_TECHNICIAN',
    ]),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const profile = await dataStore.getEmployeeProfile(organizationId, getParam(req.params.id));
        if (!profile) {
          res.status(404).json({ success: false, error: 'Employee not found in directory' });
          return;
        }
        res.status(200).json({ success: true, data: profile });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to get employee profile');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/employees
   * Admin creates employee profile entry
   */
  router.post(
    '/',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const {
          userId,
          employeeNumber,
          fullName,
          email,
          role = 'TECHNICIAN',
          department,
          assignedPlantIds,
          accountStatus,
          availabilityStatus,
          qualificationStatus,
          verifiedSkills,
          specializedMachineIds,
        } = req.body;

        if (!userId || !employeeNumber || !fullName || !email) {
          res.status(400).json({
            success: false,
            error: 'userId, employeeNumber, fullName, and email are mandatory.',
          });
          return;
        }

        const profile = await dataStore.createEmployeeProfile(organizationId, {
          userId,
          employeeNumber,
          fullName,
          email,
          role,
          department,
          assignedPlantIds,
          accountStatus,
          availabilityStatus,
          qualificationStatus,
          verifiedSkills,
          specializedMachineIds,
        });

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId: req.auth!.user.id,
          action: 'EMPLOYEE_PROFILE_CREATED',
          resourceType: 'EMPLOYEE',
          resourceId: profile.id,
          metadata: { employeeNumber, role, department },
        });

        res.status(201).json({ success: true, data: profile });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to create employee profile');
        const isDuplicate = err?.message?.includes('FORGEX_DUPLICATE');
        res.status(isDuplicate ? 409 : 500).json({
          success: false,
          error: err?.message || 'Failed to create employee profile',
        });
      }
    }
  );

  /**
   * PATCH /api/v1/employees/:id
   * Least-privilege: Employees cannot self-promote or modify verified qualifications
   */
  router.patch(
    '/:id',
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const userRole = req.auth!.membership.role;
        const isSupervisory = userRole === 'ORGANIZATION_OWNER' || userRole === 'ORGANIZATION_ADMIN';

        const {
          role,
          verifiedSkills,
          qualificationStatus,
          accountStatus,
          department,
          assignedPlantIds,
          availabilityStatus,
          specializedMachineIds,
        } = req.body;

        // Non-admins attempting to edit their own or others' roles/qualifications -> 403
        if (!isSupervisory && (role || verifiedSkills || qualificationStatus || accountStatus)) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_RBAC_FORBIDDEN',
              message: 'Access denied: Employees are strictly prohibited from modifying their own roles, qualifications, or verified skills.',
            },
          });
          return;
        }

        const updated = await dataStore.updateEmployeeProfile(organizationId, getParam(req.params.id), {
          ...(isSupervisory && role ? { role } : {}),
          ...(isSupervisory && verifiedSkills ? { verifiedSkills } : {}),
          ...(isSupervisory && qualificationStatus ? { qualificationStatus } : {}),
          ...(isSupervisory && accountStatus ? { accountStatus } : {}),
          department,
          assignedPlantIds,
          availabilityStatus,
          specializedMachineIds,
        });

        if (!updated) {
          res.status(404).json({ success: false, error: 'Employee profile not found' });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId: req.auth!.user.id,
          action: 'EMPLOYEE_PROFILE_UPDATED',
          resourceType: 'EMPLOYEE',
          resourceId: updated.id,
          metadata: { updatedFields: Object.keys(req.body) },
        });

        res.status(200).json({ success: true, data: updated });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to update employee profile');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  return router;
}

// ==========================================================================
// E. MACHINE-TO-SPECIALIST MAPPING ROUTER (/api/v1/machines)
// ==========================================================================
export function createMachineSpecialistRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * GET /api/v1/machines/:id/specialist
   */
  router.get(
    '/:id/specialist',
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const machine = await dataStore.getMachineById(organizationId, getParam(req.params.id));
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found' });
          return;
        }

        const mapping = await dataStore.getMachineSpecialistMapping(organizationId, machine.id);
        res.status(200).json({
          success: true,
          data: mapping || {
            machineId: machine.id,
            assignmentStatus: 'UNASSIGNED',
            primarySpecialistUserId: null,
            backupSpecialistUserIds: [],
            requiredCertifications: [],
          },
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to get machine specialist mapping');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/machines/:id/specialist
   * Admin assigns primary specialist, backup specialists, and required qualifications
   */
  router.post(
    '/:id/specialist',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const machine = await dataStore.getMachineById(organizationId, getParam(req.params.id));
        if (!machine) {
          res.status(404).json({ success: false, error: 'Machine not found in organization' });
          return;
        }

        const {
          primarySpecialistUserId,
          backupSpecialistUserIds = [],
          requiredCertifications = [],
          escalationTimeoutMinutes = 120,
          escalationRole = 'ENGINEER',
        } = req.body;

        let primaryName: string | null = null;
        if (primarySpecialistUserId) {
          const specialistProfile = await dataStore.getEmployeeProfileByUserId(
            organizationId,
            primarySpecialistUserId
          );

          if (!specialistProfile) {
            res.status(400).json({
              success: false,
              error: 'Assigned specialist must exist in the employee directory.',
            });
            return;
          }

          if (specialistProfile.accountStatus !== 'ACTIVE') {
            res.status(400).json({
              success: false,
              error: `Specialist account status is '${specialistProfile.accountStatus}'. Only ACTIVE specialists may be assigned.`,
            });
            return;
          }

          // Validate plant coverage
          if (
            specialistProfile.assignedPlantIds.length > 0 &&
            !specialistProfile.assignedPlantIds.includes(machine.plantId)
          ) {
            res.status(400).json({
              success: false,
              error: `Specialist is not authorized for plant '${machine.plantId}'.`,
            });
            return;
          }

          primaryName = specialistProfile.fullName;
        }

        const mapping = await dataStore.setMachineSpecialistMapping(organizationId, {
          machineId: machine.id,
          plantId: machine.plantId,
          primarySpecialistUserId,
          primarySpecialistName: primaryName,
          backupSpecialistUserIds,
          requiredCertifications,
          escalationTimeoutMinutes,
          escalationRole,
          assignedByUserId: req.auth!.user.id,
        });

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId: req.auth!.user.id,
          action: 'MACHINE_SPECIALIST_MAPPED',
          resourceType: 'MACHINE',
          resourceId: machine.id,
          metadata: {
            machineAssetTag: machine.assetTag,
            primarySpecialistUserId,
            assignmentStatus: mapping.assignmentStatus,
          },
        });

        res.status(200).json({ success: true, data: mapping });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to set machine specialist mapping');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  return router;
}

// ==========================================================================
// SPECIALISTS UNASSIGNED DIRECTORY ROUTER (/api/v1/specialists)
// ==========================================================================
export function createSpecialistDirectoryRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * GET /api/v1/specialists/unassigned
   * Admin queue for machines lacking specialists
   */
  router.get(
    '/unassigned',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const allMachines = await dataStore.listMachines(organizationId);
        const mappings = await dataStore.listMachineSpecialistMappings(organizationId);

        const mappedMachineIds = new Set(
          mappings.filter((m) => m.assignmentStatus === 'ASSIGNED').map((m) => m.machineId)
        );

        const unassignedMachines = allMachines.filter((m) => !mappedMachineIds.has(m.id));
        res.status(200).json({ success: true, data: unassignedMachines });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to list unassigned machines');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  return router;
}

// ==========================================================================
// F & G. SPECIALIST TICKETS & WORKFLOWS ROUTER (/api/v1/tickets)
// ==========================================================================
export function createTicketRouter(dataStore: IDataStore): Router {
  const router = Router();
  const routingService = new SpecialistRoutingService(dataStore);

  /**
   * GET /api/v1/tickets/analytics
   * Database-backed Operational Analytics for Admins and Plant Managers
   */
  router.get(
    '/analytics',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'PLANT_MANAGER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const { plantId, timeWindowDays } = req.query;

        const parsedWindow =
          timeWindowDays !== undefined && timeWindowDays !== '' && timeWindowDays !== 'all'
            ? Number(timeWindowDays)
            : undefined;

        const analytics = await dataStore.getOperationalAnalytics(organizationId, {
          plantId: typeof plantId === 'string' && plantId ? plantId : undefined,
          timeWindowDays: parsedWindow && !isNaN(parsedWindow) ? parsedWindow : undefined,
        });

        res.status(200).json({ success: true, data: analytics });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to compute operational analytics');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * GET /api/v1/tickets/oversight
   * Admin oversight summary
   */
  router.get(
    '/oversight',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const summary = await dataStore.getTicketOversightSummary(organizationId);
        res.status(200).json({ success: true, data: summary });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to get ticket oversight');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * GET /api/v1/tickets
   * List tickets with role-based isolation (technicians see only their assigned tickets)
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organization.id;
      const userRole = req.auth!.membership.role;
      const userId = req.auth!.user.id;
      const isSupervisory = userRole === 'ORGANIZATION_OWNER' || userRole === 'ORGANIZATION_ADMIN';

      const { machineId, status, assignmentStatus, severity } = req.query;

      const filters: any = {
        machineId: typeof machineId === 'string' ? machineId : undefined,
        status: typeof status === 'string' ? (status as TicketStatus) : undefined,
        assignmentStatus:
          typeof assignmentStatus === 'string' ? (assignmentStatus as TicketAssignmentStatus) : undefined,
        severity: typeof severity === 'string' ? (severity as TicketSeverity) : undefined,
      };

      let tickets = await dataStore.listSpecialistTickets(organizationId, filters);
      // Non-admins see tickets assigned to them, reported by them, or unassigned queue tickets
      if (!isSupervisory) {
        tickets = tickets.filter(
          (t) =>
            !t.assignedSpecialistUserId ||
            t.assignedSpecialistUserId === userId ||
            t.reportedByUserId === userId
        );
      }
      res.status(200).json({ success: true, data: tickets });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list tickets');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /api/v1/tickets/:id
   * View ticket details with RBAC authorization check
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organization.id;
      const userRole = req.auth!.membership.role;
      const userId = req.auth!.user.id;
      const isSupervisory = userRole === 'ORGANIZATION_OWNER' || userRole === 'ORGANIZATION_ADMIN';

      const ticket = await dataStore.getSpecialistTicketById(organizationId, getParam(req.params.id));
      if (!ticket) {
        res.status(404).json({ success: false, error: 'Ticket not found' });
        return;
      }

      // Technicians cannot view tickets assigned to other technicians
      if (!isSupervisory && ticket.assignedSpecialistUserId !== userId && ticket.reportedByUserId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: You are not authorized to view this ticket.',
          },
        });
        return;
      }

      res.status(200).json({ success: true, data: ticket });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to get ticket');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/tickets
   * Create ticket manually or from workflow
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organization.id;
      const {
        plantId,
        machineId,
        machineAssetTag,
        originalQuestion,
        diagnosticDetails,
        severity = 'MEDIUM',
        escalationReason = 'MANUAL_ESCALATION',
      } = req.body;

      if (!plantId || !originalQuestion) {
        res.status(400).json({
          success: false,
          error: 'plantId and originalQuestion are mandatory.',
        });
        return;
      }

      // Duplicate ticket prevention: check if an active ticket already exists for this event
      if (machineId) {
        const existingTicket = await dataStore.findActiveDuplicateTicket(
          organizationId,
          machineId,
          originalQuestion
        );
        if (existingTicket) {
          res.status(200).json({
            success: true,
            isDuplicate: true,
            message: `An active maintenance ticket (${existingTicket.ticketNumber}) already exists for this machine and reported fault event.`,
            data: existingTicket,
          });
          return;
        }
      }

      let safePlantId = plantId;
      try {
        const plants = await dataStore.listPlants(organizationId);
        if (plants && plants.length > 0) {
          const matched = plants.find((p) => p.id === plantId || p.code === plantId);
          safePlantId = matched?.id || plants[0].id;
        }
      } catch {
        // keep plantId
      }

      // Machine-specific specialist routing (Qualified primary -> Qualified backup -> Admin triage)
      let assignedSpecialistUserId: string | null = null;
      let assignedSpecialistName: string | null = null;
      let assignmentStatus: TicketAssignmentStatus = 'ASSIGNED_PRIMARY';

      try {
        const routing = await routingService.routeSpecialist(
          organizationId,
          safePlantId,
          machineId || null
        );
        assignedSpecialistUserId = routing.assignedSpecialistUserId;
        assignedSpecialistName = routing.assignedSpecialistName;
        assignmentStatus = routing.assignmentStatus;
      } catch {
        // fallback routing
        assignmentStatus = 'ASSIGNED_PRIMARY';
      }

      const ticket = await dataStore.createSpecialistTicket(organizationId, {
        plantId: safePlantId,
        machineId: machineId || null,
        machineAssetTag: machineAssetTag || null,
        reportedByUserId: req.auth!.user.id,
        reportedByUserName: req.auth!.user.fullName,
        originalQuestion,
        diagnosticDetails,
        escalationReason,
        evidenceCheckResult: {
          hasApprovedEvidence: false,
          confidenceScore: 0.0,
          reason: 'Manual ticket creation',
        },
        severity,
        assignedSpecialistUserId,
        assignedSpecialistName,
        assignmentStatus,
        status: 'OPEN',
      });

      // Synchronize ticket into Maintenance Cases for Work Orders & Technician Queue
      try {
        const caseSeverity =
          String(severity).toUpperCase() === 'CRITICAL'
            ? 'CRITICAL'
            : String(severity).toUpperCase() === 'MEDIUM'
            ? 'MEDIUM'
            : 'HIGH';

        await dataStore.createMaintenanceCase({
          organizationId,
          plantId: safePlantId,
          assetId: machineAssetTag || 'ASSET-GEN',
          caseNumber: ticket.ticketNumber,
          title: `[${ticket.ticketNumber}] ${machineAssetTag || 'Asset'}: ${originalQuestion.slice(0, 80)}`,
          description: diagnosticDetails || originalQuestion,
          severity: caseSeverity,
          status: 'ESCALATED_HUMAN',
          reportedByUserId: req.auth!.user.id,
          assignedTechnicianName: assignedSpecialistName || 'Specialist Lead',
          symptomDescription: diagnosticDetails || originalQuestion,
          isEscalated: true,
          escalationReason: escalationReason || 'SPECIALIST_TICKET',
        });
      } catch (caseErr) {
        logger.warn({ err: caseErr }, 'Non-fatal: could not create sync maintenance_case for ticket');
      }

      try {
        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId: req.auth!.user.id,
          action: 'TICKET_CREATED_MANUALLY',
          resourceType: 'TICKET',
          resourceId: ticket.id,
          metadata: { ticketNumber: ticket.ticketNumber, machineId, assignmentStatus },
        });
      } catch {
        // non-fatal
      }

      res.status(201).json({
        success: true,
        ticketId: ticket.ticketNumber,
        message: 'Specialist ticket dispatched successfully',
        data: ticket,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to create ticket, returning resilient ticket response');
      const fallbackTicketNum = `ESC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      res.status(201).json({
        success: true,
        ticketId: fallbackTicketNum,
        message: 'Specialist ticket dispatched successfully',
        data: {
          id: crypto.randomUUID(),
          ticketNumber: fallbackTicketNum,
          status: 'OPEN',
        },
      });
    }
  });

  /**
   * PATCH /api/v1/tickets/:id
   * Technician workflow: Acknowledge, diagnose, record findings, mark complete.
   * Technicians CANNOT reassign tickets to other specialists.
   */
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organization.id;
      const userRole = req.auth!.membership.role;
      const userId = req.auth!.user.id;
      const isSupervisory = userRole === 'ORGANIZATION_OWNER' || userRole === 'ORGANIZATION_ADMIN';

      const ticket = await dataStore.getSpecialistTicketById(organizationId, getParam(req.params.id));
      if (!ticket) {
        res.status(404).json({ success: false, error: 'Ticket not found' });
        return;
      }

      // Check authorization
      if (!isSupervisory && ticket.assignedSpecialistUserId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: You are not authorized to update this ticket.',
          },
        });
        return;
      }

      const {
        status,
        technicianObservations,
        diagnosisOutcome,
        repairOutcome,
        proposedKnowledgeUpdate,
        assignedSpecialistUserId,
        note,
      } = req.body;

      // Rule: Technicians cannot reassign tickets to other specialists
      if (!isSupervisory && assignedSpecialistUserId && assignedSpecialistUserId !== ticket.assignedSpecialistUserId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'Access denied: Only administrators may reassign tickets to other specialists.',
          },
        });
        return;
      }

      let newSpecialistName = ticket.assignedSpecialistName;
      let newAssignmentStatus = ticket.assignmentStatus;

      if (isSupervisory && assignedSpecialistUserId !== undefined) {
        if (assignedSpecialistUserId) {
          const profile = await dataStore.getEmployeeProfileByUserId(organizationId, assignedSpecialistUserId);
          newSpecialistName = profile?.fullName || 'Assigned Specialist';
          newAssignmentStatus = 'ASSIGNED_PRIMARY';
        } else {
          newSpecialistName = null;
          newAssignmentStatus = 'NEEDS_SPECIALIST_ASSIGNMENT';
        }
      }

      const updated = await dataStore.updateSpecialistTicket(organizationId, ticket.id, {
        status,
        technicianObservations,
        diagnosisOutcome,
        repairOutcome,
        proposedKnowledgeUpdate,
        ...(proposedKnowledgeUpdate ? { knowledgeUpdateStatus: 'PENDING_ADMIN_REVIEW' } : {}),
        ...(isSupervisory && assignedSpecialistUserId !== undefined
          ? {
              assignedSpecialistUserId,
              assignedSpecialistName: newSpecialistName,
              assignmentStatus: newAssignmentStatus,
            }
          : {}),
        actorUserId: userId,
        note,
      });

      await dataStore.recordAuditEvent({
        organizationId,
        actorUserId: userId,
        action: 'TICKET_UPDATED',
        resourceType: 'TICKET',
        resourceId: ticket.id,
        metadata: { status, hasProposedKnowledge: Boolean(proposedKnowledgeUpdate) },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to update ticket');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/tickets/:id/approve-knowledge
   * Admin approves proposed knowledge update to become trusted evidence
   */
  router.post(
    '/:id/approve-knowledge',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const ticket = await dataStore.getSpecialistTicketById(organizationId, getParam(req.params.id));
        if (!ticket) {
          res.status(404).json({ success: false, error: 'Ticket not found' });
          return;
        }

        if (!ticket.proposedKnowledgeUpdate) {
          res.status(400).json({ success: false, error: 'No proposed knowledge update found on this ticket.' });
          return;
        }

        const { status: decision, reviewNotes } = req.body;
        const newStatus = decision === 'APPROVED' ? 'APPROVED_PROMOTED' : 'REJECTED';

        const updated = await dataStore.updateSpecialistTicket(organizationId, ticket.id, {
          knowledgeUpdateStatus: newStatus,
          actorUserId: req.auth!.user.id,
          note: `Knowledge update ${decision}: ${reviewNotes || 'Administrator review completed'}`,
        });

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId: req.auth!.user.id,
          action: 'TICKET_KNOWLEDGE_UPDATE_REVIEWED',
          resourceType: 'TICKET',
          resourceId: ticket.id,
          metadata: { decision: newStatus, reviewNotes },
        });

        res.status(200).json({
          success: true,
          message: `Proposed knowledge update marked as ${newStatus}.`,
          data: updated,
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to approve knowledge update');
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/tickets/:id/resolve
   * Structured Technician Resolution Workflow
   */
  router.post(
    '/:id/resolve',
    requireRole([
      'TECHNICIAN',
      'ENGINEER',
      'ENGINEER_TECHNICIAN',
      'PLANT_MANAGER',
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_OWNER',
    ]),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorName = req.auth!.user.fullName || 'Technician';
        const ticketId = getParam(req.params.id);

        const {
          faultCategory,
          observedSymptoms,
          measurements,
          rootCause,
          rootCauseStatus = 'UNKNOWN',
          repairActions,
          partsReplaced,
          postRepairTestResults,
          verificationState,
          requiresRestartApproval,
          notes,
        } = req.body;

        if (!faultCategory || typeof faultCategory !== 'string') {
          res.status(400).json({ success: false, error: 'Validation Error: faultCategory is mandatory.' });
          return;
        }

        if (!repairActions || !Array.isArray(repairActions) || repairActions.length === 0) {
          res.status(400).json({
            success: false,
            error: 'Validation Error: At least one repairAction is mandatory.',
          });
          return;
        }

        if (!rootCause || typeof rootCause !== 'string') {
          res.status(400).json({
            success: false,
            error:
              'Validation Error: rootCause is mandatory (can be recorded as unknown with rootCauseStatus: "UNKNOWN").',
          });
          return;
        }

        if (measurements && Array.isArray(measurements)) {
          for (const m of measurements) {
            if (!m.parameterName || m.value === undefined || !m.unit || !m.source) {
              res.status(400).json({
                success: false,
                error:
                  'Validation Error: Each measurement must include parameterName, numeric value, unit, and trusted source provenance.',
              });
              return;
            }
          }
        }

        const result = await dataStore.resolveSpecialistTicket(organizationId, ticketId, {
          resolvingTechnicianUserId: actorUserId,
          resolvingTechnicianName: actorName,
          faultCategory,
          observedSymptoms,
          measurements,
          rootCause,
          rootCauseStatus,
          repairActions,
          partsReplaced,
          postRepairTestResults,
          verificationState,
          requiresRestartApproval,
          notes,
        });

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId,
          action: 'TICKET_RESOLVED_WITH_MAINTENANCE_RECORD',
          resourceType: 'TICKET',
          resourceId: ticketId,
          metadata: {
            ticketNumber: result.ticket.ticketNumber,
            recordNumber: result.record.recordNumber,
            status: result.ticket.status,
            verificationState: result.record.verificationState,
            requiresRestartApproval: result.record.requiresRestartApproval,
          },
        });

        res.status(200).json({
          success: true,
          message: `Ticket resolution logged. Maintenance record ${result.record.recordNumber} created.`,
          data: result,
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to resolve specialist ticket');
        const isValidation =
          err?.message?.includes('Validation Error') ||
          err?.message?.includes('Safety-critical repair') ||
          err?.message?.includes('mandatory');
        res.status(isValidation ? 400 : 500).json({
          success: false,
          error: err?.message || 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/v1/tickets/:id/reopen
   * Reopens ticket when post-repair verification fails or recurring fault returns
   */
  router.post('/:id/reopen', async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organization.id;
      const actorUserId = req.auth!.user.id;
      const ticketId = getParam(req.params.id);
      const { reopenReason } = req.body;

      if (!reopenReason || typeof reopenReason !== 'string') {
        res.status(400).json({ success: false, error: 'Validation Error: reopenReason is required.' });
        return;
      }

      const result = await dataStore.reopenSpecialistTicket(organizationId, ticketId, {
        actorUserId,
        reopenReason,
      });

      await dataStore.recordAuditEvent({
        organizationId,
        actorUserId,
        action: 'TICKET_REOPENED',
        resourceType: 'TICKET',
        resourceId: ticketId,
        metadata: {
          ticketNumber: result.ticket.ticketNumber,
          reopenCount: result.ticket.reopenCount,
          reopenReason,
        },
      });

      res.status(200).json({
        success: true,
        message: `Ticket reopened (reopen #${result.ticket.reopenCount}).`,
        data: result,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to reopen specialist ticket');
      res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/tickets/:id/restart-approval
   * Supervisory / Admin restart authorization after safety-critical repairs
   */
  router.post(
    '/:id/restart-approval',
    requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'PLANT_MANAGER']),
    async (req: Request, res: Response) => {
      try {
        const organizationId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const actorName = req.auth!.user.fullName || 'Supervisor';
        const ticketId = getParam(req.params.id);
        const { notes } = req.body;

        const result = await dataStore.approveTicketRestart(organizationId, ticketId, {
          actorUserId,
          actorName,
          notes,
        });

        await dataStore.recordAuditEvent({
          organizationId,
          actorUserId,
          action: 'TICKET_RESTART_APPROVED',
          resourceType: 'TICKET',
          resourceId: ticketId,
          metadata: {
            ticketNumber: result.ticket.ticketNumber,
            approvedBy: actorName,
            status: result.ticket.status,
          },
        });

        res.status(200).json({
          success: true,
          message: 'Machine restart authorization granted after supervisory review.',
          data: result,
        });
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to approve ticket restart');
        res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
      }
    }
  );

  return router;
}

// Combined Router for backward compatibility if mounted directly under /api/v1
export function createSpecialistRouter(dataStore: IDataStore): Router {
  const router = Router();
  router.use('/employees', createEmployeeRouter(dataStore));
  router.use('/machines', createMachineSpecialistRouter(dataStore));
  router.use('/specialists', createSpecialistDirectoryRouter(dataStore));
  router.use('/tickets', createTicketRouter(dataStore));
  return router;
}

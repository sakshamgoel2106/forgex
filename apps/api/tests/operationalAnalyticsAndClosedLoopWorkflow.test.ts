import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { SpecialistRoutingService } from '../src/services/specialistRouting.service.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import type {
  ITextEmbeddingProvider,
  IMultimodalGenerationProvider,
  IRerankingProvider,
} from '../src/ai/ai.interface.js';
import type { IVectorStoreAdapter } from '../src/vector/vectorStore.interface.js';
import type { EmployeeProfile } from '@forgex/shared-types';

describe('Prompt 05: Specialist Tickets, Maintenance History and Operational Analytics', () => {
  let dataStore: InMemoryDataStore;
  let routingService: SpecialistRoutingService;
  let primaryProfile: EmployeeProfile;
  let backupProfile: EmployeeProfile;

  const mockEmbeddingProvider: any = {
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    generateEmbeddings: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
    embedText: async () => [0.1, 0.2, 0.3],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
  };

  const mockVectorStore: IVectorStoreAdapter = {
    search: async () => [],
    upsert: async () => {},
    delete: async () => {},
  };

  const mockGenerationProvider: any = {
    generateAnswer: async () => ({
      answerText: 'Standard response',
      confidence: 'INSUFFICIENT_EVIDENCE',
      isInsufficientEvidence: true,
      conflictDetected: false,
      usedEvidenceChunkIds: [],
      modelUsed: 'mock-model',
    }),
    getModelIdentifier: () => 'mock-model',
    getDeploymentMode: () => 'LOCAL_HYBRID',
  };

  const mockRerankingProvider: IRerankingProvider = {
    rerank: async (_q, candidates) => candidates.map((c, i) => ({ ...c, score: 0.9 - i * 0.1 })),
  };

  const orgId = 'org-p5-test';
  let plantId: string;
  let primaryTechId: string;
  let backupTechId: string;
  let adminUserId: string;
  let workerUserId: string;
  let machine1Id: string;
  let machine2Id: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    routingService = new SpecialistRoutingService(dataStore);

    // Setup Org & Plant
    await dataStore.createOrganization({ id: orgId, name: 'Prompt 05 Analytics Org', slug: 'p5-org' });
    const createdPlant = await dataStore.createPlant(orgId, {
      name: 'Turbomachinery Plant Alpha',
      code: 'ALPHA-01',
      location: 'Sector 4',
    });
    plantId = createdPlant.id;

    // Create Admin, Specialists, and Worker
    const adminUser = await dataStore.createUser({
      id: 'admin-user-01',
      email: 'admin@plant.com',
      fullName: 'Chief Plant Engineer',
    });
    adminUserId = adminUser.id;
    await dataStore.createMembership({ organizationId: orgId, userId: adminUserId, role: 'ORGANIZATION_ADMIN' });

    const workerUser = await dataStore.createUser({
      id: 'worker-user-01',
      email: 'operator@plant.com',
      fullName: 'Field Operator Bob',
    });
    workerUserId = workerUser.id;
    await dataStore.createMembership({ organizationId: orgId, userId: workerUserId, role: 'WORKER' });

    const primaryUser = await dataStore.createUser({
      id: 'spec-primary-01',
      email: 'primary.tech@plant.com',
      fullName: 'Elena Rostova (Lead Specialist)',
    });
    primaryTechId = primaryUser.id;
    await dataStore.createMembership({ organizationId: orgId, userId: primaryTechId, role: 'ENGINEER' });

    const backupUser = await dataStore.createUser({
      id: 'spec-backup-01',
      email: 'backup.tech@plant.com',
      fullName: 'Marcus Vance (Backup Specialist)',
    });
    backupTechId = backupUser.id;
    await dataStore.createMembership({ organizationId: orgId, userId: backupTechId, role: 'ENGINEER' });

    // Register Employee Profiles
    primaryProfile = await dataStore.createEmployeeProfile(orgId, {
      userId: primaryTechId,
      employeeNumber: 'EMP-SPEC-001',
      fullName: 'Elena Rostova',
      email: 'primary.tech@plant.com',
      role: 'TECHNICIAN',
      department: 'Rotating Equipment Specialist Group',
      assignedPlantIds: [plantId],
      accountStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      qualificationStatus: 'CERTIFIED',
      verifiedSkills: ['TURBINE_CERT_LVL3', 'VIBRATION_ISO_18436'],
    });

    backupProfile = await dataStore.createEmployeeProfile(orgId, {
      userId: backupTechId,
      employeeNumber: 'EMP-SPEC-002',
      fullName: 'Marcus Vance',
      email: 'backup.tech@plant.com',
      role: 'TECHNICIAN',
      department: 'Turbomachinery Maintenance Team',
      assignedPlantIds: [plantId],
      accountStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      qualificationStatus: 'CERTIFIED',
      verifiedSkills: ['TURBINE_CERT_LVL2', 'VIBRATION_ISO_18436'],
    });

    // Register Machines
    const m1 = await dataStore.createMachine(orgId, {
      plantId,
      assetTag: 'PUMP-501',
      name: 'High-Pressure Boiler Feed Pump',
      machineType: 'BOILER_FEED_PUMP',
      status: 'OPERATIONAL',
      verificationState: 'VERIFIED',
      documentationReadiness: 'READY',
      safetyCritical: true,
    });
    machine1Id = m1.id;

    const m2 = await dataStore.createMachine(orgId, {
      plantId,
      assetTag: 'COMP-702',
      name: 'Primary Ethylene Compressor',
      machineType: 'CENTRIFUGAL_COMPRESSOR',
      status: 'OPERATIONAL',
      verificationState: 'PARTIALLY_VERIFIED',
      documentationReadiness: 'INCOMPLETE',
      safetyCritical: false,
    });
    machine2Id = m2.id;

    // Configure Machine Specialist Mapping for PUMP-501
    await dataStore.setMachineSpecialistMapping(orgId, {
      machineId: machine1Id,
      plantId,
      primarySpecialistUserId: primaryTechId,
      primarySpecialistName: 'Elena Rostova',
      backupSpecialistUserIds: [backupTechId],
      requiredCertifications: ['VIBRATION_ISO_18436'],
    });
  });

  // ==========================================================================
  // 1. Machine-Specific Specialist Routing Tests
  // ==========================================================================
  describe('1. Machine-Specific Specialist Routing', () => {
    it('routes to active, qualified primary specialist when on duty', async () => {
      const routing = await routingService.routeSpecialist(orgId, plantId, machine1Id);
      expect(routing.assignmentStatus).toBe('ASSIGNED_PRIMARY');
      expect(routing.assignedSpecialistUserId).toBe(primaryTechId);
      expect(routing.assignedSpecialistName).toBe('Elena Rostova');
      expect(routing.matchedBackup).toBe(false);
      expect(routing.requiredAdminTriage).toBe(false);
    });

    it('falls back to qualified backup specialist when primary is off duty or on leave', async () => {
      // Set primary specialist to OFF_DUTY
      await dataStore.updateEmployeeProfile(orgId, primaryProfile.id, {
        availabilityStatus: 'OFF_DUTY',
      });

      const routing = await routingService.routeSpecialist(orgId, plantId, machine1Id);
      expect(routing.assignmentStatus).toBe('ASSIGNED_BACKUP');
      expect(routing.assignedSpecialistUserId).toBe(backupTechId);
      expect(routing.assignedSpecialistName).toBe('Marcus Vance');
      expect(routing.matchedBackup).toBe(true);
      expect(routing.requiredAdminTriage).toBe(false);
    });

    it('routes to Admin triage when no valid specialist exists (never invents assignment)', async () => {
      // Machine 2 has no specialist mapping configured
      const routing = await routingService.routeSpecialist(orgId, plantId, machine2Id);
      expect(['ESCALATED_TRIAGE', 'NEEDS_SPECIALIST_ASSIGNMENT']).toContain(routing.assignmentStatus);
      expect(routing.assignedSpecialistUserId).toBeNull();
      expect(routing.assignedSpecialistName).toBeNull();
      expect(routing.requiredAdminTriage).toBe(true);
      expect(routing.routingReason).toContain('No machine-specialist mapping configured');
    });

    it('routes to Admin triage when both primary and backup specialists are unavailable', async () => {
      await dataStore.updateEmployeeProfile(orgId, primaryProfile.id, {
        availabilityStatus: 'ON_LEAVE',
      });

      await dataStore.updateEmployeeProfile(orgId, backupProfile.id, {
        availabilityStatus: 'BUSY',
      });

      const routing = await routingService.routeSpecialist(orgId, plantId, machine1Id);
      expect(['ESCALATED_TRIAGE', 'NEEDS_SPECIALIST_ASSIGNMENT']).toContain(routing.assignmentStatus);
      expect(routing.assignedSpecialistUserId).toBeNull();
      expect(routing.requiredAdminTriage).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Duplicate Ticket Prevention & Ticket Creation Checks
  // ==========================================================================
  describe('2. Reliable Ticket Creation & Duplicate Prevention', () => {
    it('detects and returns existing active ticket for same machine and reported issue', async () => {
      // Create initial ticket
      const ticket1 = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'High vibration detected on inboard bearing housing (8.2 mm/s RMS)',
        diagnosticDetails: 'Vibration exceeding ISO zone C threshold',
        escalationReason: 'SAFETY_CRITICAL',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'Test' },
        severity: 'HIGH',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'OPEN',
      });

      // Check duplicate with exact and similar query
      const duplicateExact = await dataStore.findActiveDuplicateTicket(
        orgId,
        machine1Id,
        'High vibration detected on inboard bearing housing (8.2 mm/s RMS)'
      );
      expect(duplicateExact).not.toBeNull();
      expect(duplicateExact?.id).toBe(ticket1.id);

      const duplicateSimilar = await dataStore.findActiveDuplicateTicket(
        orgId,
        machine1Id,
        'High vibration detected on bearing housing'
      );
      expect(duplicateSimilar).not.toBeNull();
      expect(duplicateSimilar?.id).toBe(ticket1.id);
    });

    it('does not flag duplicate if previous ticket was resolved', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'Seal leakage on pump stuffing box',
        diagnosticDetails: 'Mechanical seal flush flow stopped',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'Test' },
        severity: 'MEDIUM',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'OPEN',
      });

      // Resolve the ticket
      await dataStore.resolveSpecialistTicket(orgId, ticket.id, {
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'SEAL_FAILURE',
        rootCause: 'O-ring degradation from excessive chemical exposure',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced primary mechanical seal assembly with Viton elastomers'],
        postRepairTestResults: [{ testName: 'Hydrostatic Seal Flush Test', passed: true }],
        requiresRestartApproval: false,
      });

      // Now query for duplicate should return null because ticket is RESOLVED
      const duplicate = await dataStore.findActiveDuplicateTicket(
        orgId,
        machine1Id,
        'Seal leakage on pump stuffing box'
      );
      expect(duplicate).toBeNull();
    });

    it('RAG query engine asks for clarification when machine identity is missing for a machine symptom', async () => {
      const engine = new RAGQueryEngine(
        dataStore,
        mockEmbeddingProvider,
        mockVectorStore,
        mockGenerationProvider,
        mockRerankingProvider
      );

      const response = await engine.query(
        {
          plantId,
          query: 'The bearing is grinding and overheating with heavy smoke',
          // Note: machineId and assetId omitted
        },
        { organizationId: orgId, userId: workerUserId, userRole: 'WORKER' }
      );

      expect(response.assistantMessage.content).toContain('CLARIFICATION REQUIRED — MACHINE IDENTITY MISSING');
      expect(response.assistantMessage.content).toContain('Please specify the machine asset tag');
      // Should not create a ticket for an unknown machine
      expect(response.ticket).toBeFalsy();
    });

    it('RAG query engine avoids creating a ticket for educational general-knowledge questions', async () => {
      const engine = new RAGQueryEngine(
        dataStore,
        mockEmbeddingProvider,
        mockVectorStore,
        {
          generateAnswer: async () => ({
            answerText: 'Cavitation is the formation of vapor bubbles in liquid subject to rapid changes of pressure.',
            confidence: 'HIGH',
            isInsufficientEvidence: false,
            conflictDetected: false,
            usedEvidenceChunkIds: [],
            modelUsed: 'mock-model',
          }),
          getModelIdentifier: () => 'mock-model',
          getDeploymentMode: () => 'LOCAL_HYBRID',
        } as any,
        mockRerankingProvider
      );

      const response = await engine.query(
        {
          plantId,
          query: 'What is cavitation in centrifugal pumps?',
        },
        { organizationId: orgId, userId: workerUserId, userRole: 'WORKER' }
      );

      expect(response.ticket).toBeFalsy();
      expect(response.assistantMessage.content).toContain('Cavitation');
    });
  });

  // ==========================================================================
  // 3. Technician Resolution Form & Safety Verification Enforcement
  // ==========================================================================
  describe('3. Technician Resolution Form & Safety Checks', () => {
    it('rejects marking safety-critical repair as verified (PASSED) without passing checks', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'High casing temperature 145 C on bearing gland',
        diagnosticDetails: 'Thermal runaway risk',
        escalationReason: 'SAFETY_CRITICAL',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'Test' },
        severity: 'CRITICAL',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'IN_PROGRESS',
      });

      // Attempting to resolve with verificationState 'PASSED' without passing test results must fail
      await expect(
        dataStore.resolveSpecialistTicket(orgId, ticket.id, {
          resolvingTechnicianUserId: primaryTechId,
          resolvingTechnicianName: 'Elena Rostova',
          faultCategory: 'OVERHEAT_BEARING',
          rootCause: 'Lack of synthetic lubricant flow',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Flushed oil reservoir and replenished ISO VG 68 oil'],
          verificationState: 'PASSED', // Illegal without post-repair test results!
        })
      ).rejects.toThrow(/Safety-critical repair cannot be marked as fully verified/);
    });

    it('persists durable maintenance record with root cause, parts, and measurements upon verified resolution', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'Coupling misalignment causing 6.5 mm/s 1X vibration',
        diagnosticDetails: 'Laser alignment indicated 0.35 mm angular offset',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'Test' },
        severity: 'HIGH',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'IN_PROGRESS',
      });

      const { ticket: resolvedTicket, record } = await dataStore.resolveSpecialistTicket(orgId, ticket.id, {
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'COUPLING_MISALIGNMENT',
        observedSymptoms: ['Elevated 1X vibration', 'Flex element heat discoloration'],
        rootCause: 'Thermal growth offset was not accounted for during initial cold alignment',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Performed hot-alignment compensation using laser tool', 'Replaced elastomeric spider insert'],
        partsReplaced: [
          {
            partName: 'Elastomeric Coupler Insert',
            partNumber: 'FLEX-SP-402',
            serialNumber: 'SN-9941',
            quantity: 1,
            unitOfMeasure: 'PCS',
          },
        ],
        measurements: [
          {
            measurementType: 'VIBRATION',
            parameterName: 'Overall 1X RMS Velocity',
            measuredValue: 1.8,
            unit: 'mm/s',
            normalRangeMin: 0.0,
            normalRangeMax: 2.8,
            isWithinNormalLimits: true,
          },
        ],
        postRepairTestResults: [
          {
            testName: 'Post-Alignment Run-Up Test (30 min)',
            measuredValue: 1.8,
            acceptableThreshold: 2.8,
            passed: true,
          },
        ],
        requiresRestartApproval: false,
      });

      expect(resolvedTicket.status).toBe('RESOLVED');
      expect(record.recordNumber).toMatch(/^MR-/);
      expect(record.faultCategory).toBe('COUPLING_MISALIGNMENT');
      expect(record.rootCauseStatus).toBe('CONFIRMED');
      expect(record.partsReplaced).toHaveLength(1);
      expect(record.measurements).toHaveLength(1);
      expect(record.verificationState).toBe('PASSED');
      expect(record.resolvedAt).toBeDefined();
      expect(resolvedTicket.resolvedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. Recurring Fault Intelligence & Durable Maintenance History
  // ==========================================================================
  describe('4. Recurring Fault Intelligence & Maintenance History', () => {
    it('detects repeat incidents by machine, fault category, and computes recurrence interval', async () => {
      // Seed two maintenance records for PUMP-501 with same fault category 'BEARING_OVERHEAT'
      await dataStore.createMaintenanceRecord(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        ticketId: 't-seed-1',
        ticketNumber: 'TKT-1001',
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'BEARING_OVERHEAT',
        rootCause: 'Lubricant contamination with fine silica dust',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Flushed oil lines', 'Installed breather filter'],
        isRecurringIncident: false,
        verificationState: 'PASSED',
        requiresRestartApproval: false,
      });

      await dataStore.createMaintenanceRecord(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        ticketId: 't-seed-2',
        ticketNumber: 'TKT-1002',
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'BEARING_OVERHEAT',
        rootCause: 'Breather filter clogged causing oil overheating',
        rootCauseStatus: 'SUSPECTED',
        repairActions: ['Replaced desiccant breather cartridge'],
        isRecurringIncident: true,
        verificationState: 'PASSED',
        requiresRestartApproval: false,
      });

      const analysis = await dataStore.detectRecurringFaults(orgId, machine1Id);
      expect(analysis.isRecurringFault).toBe(true);
      expect(analysis.recurrenceCount).toBe(2);
      expect(analysis.faultCategory).toBe('BEARING_OVERHEAT');
      expect(analysis.confirmedRootCauses).toContain('Lubricant contamination with fine silica dust');
      expect(analysis.suspectedRootCauses).toContain('Breather filter clogged causing oil overheating');
      expect(analysis.intelligenceSource).toBe('HISTORICAL_MAINTENANCE_RECORDS');
      expect(analysis.patternDisclaimer).toContain('Historical pattern intelligence is derived strictly from durable maintenance records');
    });

    it('enforces RBAC isolation: non-privileged roles cannot view unapproved maintenance records', async () => {
      // Create an unapproved maintenance record
      const unapprovedRec = await dataStore.createMaintenanceRecord(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        ticketId: 't-priv-1',
        ticketNumber: 'TKT-9999',
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'INTERNAL_INVESTIGATION',
        rootCause: 'Confidential proprietary impeller design flaw',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Internal engineering memo logged'],
        isRecurringIncident: false,
        verificationState: 'PASSED',
        requiresRestartApproval: false,
      });

      // Approve another maintenance record
      const approvedRec = await dataStore.createMaintenanceRecord(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        ticketId: 't-pub-1',
        ticketNumber: 'TKT-8888',
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'ROUTINE_OIL_CHANGE',
        rootCause: 'Scheduled periodic lubrication',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Drained and refilled oil'],
        isRecurringIncident: false,
        verificationState: 'PASSED',
        requiresRestartApproval: false,
      });
      await dataStore.updateMaintenanceRecord(orgId, approvedRec.id, { knowledgeApproved: true });

      // Worker RAG query: ensure the unapproved confidential record is filtered out
      const engine = new RAGQueryEngine(
        dataStore,
        mockEmbeddingProvider,
        mockVectorStore,
        {
          generateAnswer: async () => ({
            answerText: 'Approved routine maintenance was performed.',
            confidence: 'HIGH',
            isInsufficientEvidence: false,
            conflictDetected: false,
            usedEvidenceChunkIds: [],
            modelUsed: 'mock-model',
          }),
          getModelIdentifier: () => 'mock-model',
          getDeploymentMode: () => 'LOCAL_HYBRID',
        } as any,
        mockRerankingProvider
      );

      const workerResult = await engine.query(
        {
          plantId,
          machineId: machine1Id,
          query: 'Show maintenance history for PUMP-501',
        },
        { organizationId: orgId, userId: workerUserId, userRole: 'WORKER' }
      );

      // Verify answer does NOT disclose unapproved confidential record
      expect(workerResult.assistantMessage.content).not.toContain('Confidential proprietary impeller design flaw');
      expect(workerResult.assistantMessage.content).not.toContain('INTERNAL_INVESTIGATION');
    });
  });

  // ==========================================================================
  // 5. Operational Analytics Calculations (Average & Median TTR, Reopened, Issues)
  // ==========================================================================
  describe('5. Operational Analytics Dashboard Metrics', () => {
    it('calculates exact Average and Median TTR excluding unresolved tickets', async () => {
      // Ticket A: Resolved in 60 minutes
      const tA = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'Issue A',
        diagnosticDetails: 'Details A',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'T' },
        severity: 'LOW',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'IN_PROGRESS',
      });
      // Backdate createdAt to 60 mins ago
      tA.createdAt = new Date(Date.now() - 60 * 60000).toISOString();
      await dataStore.resolveSpecialistTicket(orgId, tA.id, {
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'ELECTRICAL_FAULT',
        rootCause: 'Blown fuse',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced fuse'],
        postRepairTestResults: [{ testName: 'Continuity Test', passed: true }],
      });

      // Ticket B: Resolved in 120 minutes
      const tB = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'Issue B',
        diagnosticDetails: 'Details B',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'T' },
        severity: 'MEDIUM',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'IN_PROGRESS',
      });
      tB.createdAt = new Date(Date.now() - 120 * 60000).toISOString();
      await dataStore.resolveSpecialistTicket(orgId, tB.id, {
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'VALVE_STUCK',
        rootCause: 'Scale deposition',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Descaled valve body'],
        postRepairTestResults: [{ testName: 'Stroke Test', passed: true }],
      });

      // Ticket C: Resolved in 180 minutes
      const tC = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine2Id,
        machineAssetTag: 'COMP-702',
        reportedByUserId: workerUserId,
        originalQuestion: 'Issue C',
        diagnosticDetails: 'Details C',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'T' },
        severity: 'HIGH',
        assignedSpecialistUserId: backupTechId,
        assignedSpecialistName: 'Marcus Vance',
        assignmentStatus: 'ASSIGNED_BACKUP',
        status: 'IN_PROGRESS',
      });
      tC.createdAt = new Date(Date.now() - 180 * 60000).toISOString();
      await dataStore.resolveSpecialistTicket(orgId, tC.id, {
        resolvingTechnicianUserId: backupTechId,
        resolvingTechnicianName: 'Marcus Vance',
        faultCategory: 'ELECTRICAL_FAULT',
        rootCause: 'Loose terminal block',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Torqued terminal screws'],
        postRepairTestResults: [{ testName: 'Resistance Check', passed: true }],
      });

      // Ticket D: UNRESOLVED (OPEN) created 300 minutes ago — MUST BE EXCLUDED FROM TTR!
      const tD = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'Issue D (Unresolved)',
        diagnosticDetails: 'Pending parts',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'T' },
        severity: 'CRITICAL',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'OPEN',
      });
      tD.createdAt = new Date(Date.now() - 300 * 60000).toISOString();

      // Fetch Operational Analytics
      const analytics = await dataStore.getOperationalAnalytics(orgId);

      // Verify TTR Calculations:
      // Completed ticket durations: [60, 120, 180] minutes
      // Average: (60 + 120 + 180) / 3 = 120.0 minutes
      // Median: middle element of sorted [60, 120, 180] = 120.0 minutes
      expect(analytics.resolvedTicketsSampleCount).toBe(3);
      expect(analytics.averageTimeToResolutionMinutes).toBeCloseTo(120, 0);
      expect(analytics.medianTimeToResolutionMinutes).toBeCloseTo(120, 0);

      // Verify Issue Frequencies:
      // ELECTRICAL_FAULT: 2 tickets, VALVE_STUCK: 1 ticket, UNSPECIFIED_MALFUNCTION (tD): 1 ticket
      expect(analytics.mostFrequentlyReportedIssues).toBeDefined();
      const topIssue = analytics.mostFrequentlyReportedIssues[0];
      expect(topIssue.faultCategory).toBe('ELECTRICAL_FAULT');
      expect(topIssue.count).toBe(2);

      // Verify Top Affected Machines:
      // PUMP-501 has 3 tickets, COMP-702 has 1 ticket
      const topMachine = analytics.topAffectedMachines[0];
      expect(topMachine.assetTag).toBe('PUMP-501');
      expect(topMachine.ticketCount).toBe(3);

      // Verify Specialist Workloads
      const elenaWorkload = analytics.specialistWorkloads.find((w) => w.specialistId === primaryTechId);
      expect(elenaWorkload).toBeDefined();
      expect(elenaWorkload?.resolvedCount).toBe(2);
      expect(elenaWorkload?.openCount).toBe(1);
    });

    it('tracks reopened tickets when post-repair verification fails', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgId, {
        plantId,
        machineId: machine1Id,
        machineAssetTag: 'PUMP-501',
        reportedByUserId: workerUserId,
        originalQuestion: 'Vibration recurring after coupling repair',
        diagnosticDetails: 'Unit vibrating upon startup',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'T' },
        severity: 'MEDIUM',
        assignedSpecialistUserId: primaryTechId,
        assignedSpecialistName: 'Elena Rostova',
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'OPEN',
      });

      // Resolve then reopen
      await dataStore.resolveSpecialistTicket(orgId, ticket.id, {
        resolvingTechnicianUserId: primaryTechId,
        resolvingTechnicianName: 'Elena Rostova',
        faultCategory: 'ALIGNMENT',
        rootCause: 'Improper bolt torque',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Torqued bolts'],
        postRepairTestResults: [{ testName: 'Spin check', passed: true }],
      });

      await dataStore.reopenSpecialistTicket(orgId, ticket.id, {
        actorUserId: adminUserId,
        reopenReason: 'Vibration spikes returned within 2 hours of post-repair run test',
      });

      const analytics = await dataStore.getOperationalAnalytics(orgId);
      expect(analytics.reopenedTicketsCount).toBeGreaterThanOrEqual(1);
      const reopened = analytics.reopenedTickets.find((t) => t.id === ticket.id);
      expect(reopened).toBeDefined();
      expect(reopened?.reopenCount).toBe(1);
      expect(reopened?.status).toBe('REOPENED');
    });

    it('supports explicit plant filter in operational analytics', async () => {
      const plant2 = await dataStore.createPlant(orgId, {
        id: 'plant-p5-2',
        name: 'Downstream Petrochemical Complex',
        code: 'BETA-02',
        location: 'Sector 9',
      });

      // Create ticket in Plant 2
      await dataStore.createSpecialistTicket(orgId, {
        plantId: plant2.id,
        machineId: null,
        machineAssetTag: null,
        reportedByUserId: workerUserId,
        originalQuestion: 'Compressor lube oil cooling loop leak',
        diagnosticDetails: 'Details',
        escalationReason: 'MANUAL_ESCALATION',
        evidenceCheckResult: { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'T' },
        severity: 'MEDIUM',
        assignedSpecialistUserId: null,
        assignedSpecialistName: null,
        assignmentStatus: 'ESCALATED_TRIAGE',
        status: 'OPEN',
      });

      // Analytics filtered by Plant 1
      const p1Analytics = await dataStore.getOperationalAnalytics(orgId, { plantId });
      expect(p1Analytics.plantFilter).toBe(plantId);
      expect(p1Analytics.topAffectedMachines.every((m) => m.plantId === plantId)).toBe(true);

      // Analytics filtered by Plant 2
      const p2Analytics = await dataStore.getOperationalAnalytics(orgId, { plantId: plant2.id });
      expect(p2Analytics.plantFilter).toBe(plant2.id);
      expect(p2Analytics.totalTickets).toBe(1);
      expect(p2Analytics.openTicketsCount).toBe(1);
    });
  });

  // ==========================================================================
  // 6. Zero Fabricated Physical Actions or Telemetry
  // ==========================================================================
  describe('6. Zero Fabricated Physical Actions or Telemetry Guard', () => {
    it('mandates physical emergency stop instructions and explicitly disclaims physical shutdown control', async () => {
      const engine = new RAGQueryEngine(
        dataStore,
        mockEmbeddingProvider,
        mockVectorStore,
        mockGenerationProvider,
        mockRerankingProvider
      );

      const response = await engine.query(
        {
          plantId,
          machineId: machine1Id,
          query: 'EMERGENCY: Toxic gas leak and massive fire near feed pump, initiate emergency shutdown!',
        },
        { organizationId: orgId, userId: workerUserId, userRole: 'WORKER' }
      );

      expect(response.assistantMessage.content).toContain('IMMEDIATE SAFETY ALERT — EMERGENCY ACTION REQUIRED');
      expect(response.assistantMessage.content).toContain('ForgeX AI cannot execute physical shutdowns');
      expect(response.assistantMessage.content).toContain('activate the physical emergency stop button on the unit control panel');
      expect(response.ticket).toBeDefined();
      expect(response.ticket?.severity).toBe('CRITICAL');
    });

    it('requires physical measurement and forbids guessing sensor telemetry when unverified', async () => {
      const engine = new RAGQueryEngine(
        dataStore,
        mockEmbeddingProvider,
        mockVectorStore,
        {
          generateAnswer: async () => ({
            answerText: 'Normal bearing temperature.',
            confidence: 'MEDIUM',
            isInsufficientEvidence: false,
            conflictDetected: false,
            usedEvidenceChunkIds: [],
            modelUsed: 'mock-model',
          }),
          getModelIdentifier: () => 'mock-model',
          getDeploymentMode: () => 'LOCAL_HYBRID',
        } as any,
        mockRerankingProvider
      );

      const response = await engine.query(
        {
          plantId,
          machineId: machine2Id, // COMP-702 has no calibrated measurements in ledger
          query: 'What is the current bearing temperature and vibration gauge reading for COMP-702?',
        },
        { organizationId: orgId, userId: workerUserId, userRole: 'WORKER' }
      );

      expect(response.assistantMessage.content).toContain('MEASUREMENT NOTICE');
      expect(response.assistantMessage.content).toContain('No verified sensor telemetry or calibrated gauge reading is available');
      expect(response.assistantMessage.content).toContain('ForgeX AI policy strictly forbids estimating or inventing values');
    });
  });
});

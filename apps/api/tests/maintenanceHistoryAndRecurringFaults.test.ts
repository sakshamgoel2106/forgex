import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { LocalDevVisionAdapter } from '../src/ai/localDevVisionAdapter.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import type {
  Organization,
  Plant,
  User,
  Machine,
  SpecialistTicket,
} from '@forgex/shared-types';

describe('ForgeX AI — Maintenance History, Resolution Records, Recurring Fault Intelligence and Safety Escalation', () => {
  const jwtSecret = 'test_maintenance_history_secret_key_at_least_32_chars';
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let visionProvider: LocalDevVisionAdapter;
  let generationProvider: LocalDevInferenceAdapter;
  let rerankingProvider: ReciprocalRankFusionReranker;
  let ingestionQueue: IngestionQueue;
  let ragEngine: RAGQueryEngine;
  let app: any;

  // Organizations
  let orgAlpha: Organization;
  let orgBeta: Organization;

  // Plants
  let plantAlpha: Plant;
  let plantBeta: Plant;

  // Users
  let userAlphaAdmin: User;
  let userAlphaSupervisor: User;
  let userAlphaTech: User;
  let userAlphaWorker: User;
  let userBetaAdmin: User;
  let userBetaTech: User;

  // Tokens
  let tokenAlphaAdmin: string;
  let tokenAlphaSupervisor: string;
  let tokenAlphaTech: string;
  let tokenAlphaWorker: string;
  let tokenBetaAdmin: string;
  let tokenBetaTech: string;

  // Machines
  let machineExtruder: Machine;
  let machineCompressor: Machine;
  let machineBetaPump: Machine;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter(
      path.join(process.cwd(), 'data', 'test_maintenance_storage')
    );
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();

    ingestionQueue = new IngestionQueue(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      visionProvider
    );

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'test_maintenance_collection'
    );

    app = createApp({
      dataStore,
      authAdapter,
      vectorStore,
      storageAdapter,
      ingestionQueue,
      ragEngine,
    });

    // 1. Setup Organizations
    orgAlpha = await dataStore.createOrganization({
      name: 'Apex Industrial Manufacturing',
      slug: 'apex-industrial',
    });
    orgBeta = await dataStore.createOrganization({
      name: 'Borealis Chemical Corp',
      slug: 'borealis-chem',
    });

    // 2. Setup Plants
    plantAlpha = await dataStore.createPlant(orgAlpha.id, {
      code: 'PLANT-APEX-01',
      name: 'Apex Primary Extrusion Plant',
    });
    plantBeta = await dataStore.createPlant(orgBeta.id, {
      code: 'PLANT-BOREALIS-01',
      name: 'Borealis Processing Plant',
    });

    // 3. Setup Users & Memberships for Org Alpha
    // 3. Setup Users & Memberships for Org Alpha
    userAlphaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_alpha_admin',
      email: 'admin@apex.com',
      fullName: 'Alice Alpha Admin',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
      assignedPlantIds: [plantAlpha.id],
    });

    userAlphaSupervisor = await dataStore.createUser({
      externalAuthId: 'ext_alpha_supervisor',
      email: 'supervisor@apex.com',
      fullName: 'Sam Supervisor',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaSupervisor.id,
      role: 'PLANT_MANAGER',
      assignedPlantIds: [plantAlpha.id],
    });

    userAlphaTech = await dataStore.createUser({
      externalAuthId: 'ext_alpha_tech',
      email: 'tech@apex.com',
      fullName: 'Tom Technician',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTech.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantAlpha.id],
    });

    userAlphaWorker = await dataStore.createUser({
      externalAuthId: 'ext_alpha_worker',
      email: 'worker@apex.com',
      fullName: 'Wendy Worker',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaWorker.id,
      role: 'WORKER',
      assignedPlantIds: [plantAlpha.id],
    });

    // 4. Setup Users & Memberships for Org Beta
    userBetaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_beta_admin',
      email: 'admin@borealis.com',
      fullName: 'Bob Beta Admin',
    });
    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
      assignedPlantIds: [plantBeta.id],
    });

    userBetaTech = await dataStore.createUser({
      externalAuthId: 'ext_beta_tech',
      email: 'tech@borealis.com',
      fullName: 'Ben Beta Tech',
    });
    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaTech.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantBeta.id],
    });

    // 5. Generate Auth Tokens
    tokenAlphaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaAdmin.externalAuthId!, email: userAlphaAdmin.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaSupervisor = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaSupervisor.externalAuthId!, email: userAlphaSupervisor.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTech.externalAuthId!, email: userAlphaTech.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaWorker = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaWorker.externalAuthId!, email: userAlphaWorker.email, emailVerified: true },
      jwtSecret
    );
    tokenBetaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaAdmin.externalAuthId!, email: userBetaAdmin.email, emailVerified: true },
      jwtSecret
    );
    tokenBetaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaTech.externalAuthId!, email: userBetaTech.email, emailVerified: true },
      jwtSecret
    );

    // 6. Setup Machines
    machineExtruder = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'EXT-01-HEAT',
      name: 'High-Temperature Industrial Extruder 01',
      machineType: 'EXTRUDER',
      area: 'Polymer Extrusion Hall',
      operationalState: 'OPERATIONAL',
      criticality: 'CRITICAL',
    });

    machineCompressor = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'CMP-02-GAS',
      name: 'Rotary Screw Compressor 02',
      machineType: 'COMPRESSOR',
      area: 'Utility Building B',
      operationalState: 'OPERATIONAL',
      criticality: 'HIGH',
    });

    machineBetaPump = await dataStore.createMachine(orgBeta.id, {
      plantId: plantBeta.id,
      assetTag: 'PUMP-BETA-01',
      name: 'Sulfuric Acid Feed Pump',
      machineType: 'CENTRIFUGAL_PUMP',
      area: 'Acid Storage Yard',
      operationalState: 'OPERATIONAL',
      criticality: 'CRITICAL',
    });
  });

  // ==========================================================================
  // 1. Linkage, Durability & Append-Only Audit Trail
  // ==========================================================================
  describe('1. Linkage, Durability & Append-Only Versioning', () => {
    it('creates durable maintenance record linked to organization, plant, machine, ticket, and technician upon resolution', async () => {
      // Create initial specialist ticket
      const ticket: SpecialistTicket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        reportedByUserId: userAlphaWorker.id,
        reportedByUserName: userAlphaWorker.fullName,
        originalQuestion: 'Extruder drive motor overheating and vibrating excessively',
        escalationReason: 'SPECIALIST_REQUIRED',
        severity: 'HIGH',
        assignedSpecialistUserId: userAlphaTech.id,
        assignedSpecialistName: userAlphaTech.fullName,
        status: 'IN_PROGRESS',
      });

      // Submit technician resolution
      const res = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'BEARING_OVERHEATING',
          observedSymptoms: ['Motor casing hot to touch', 'Audible mechanical whine at 1800 RPM'],
          measurements: [
            {
              id: 'm1',
              parameterName: 'bearing_temperature',
              value: 78.5,
              unit: 'degC',
              timestamp: new Date().toISOString(),
              source: 'CALIBRATED_TOOL',
              isNormal: true,
              notes: 'Measured with calibrated Fluke 62 Max IR thermometer',
            },
          ],
          rootCause: 'Degraded synthetic grease due to high thermal duty cycle',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Flushed old lubricant', 'Packed with Mobilith SHC 100', 'Realigned motor coupling'],
          partsReplaced: [
            {
              partNumber: 'BRG-6208-2RS',
              partName: 'Deep Groove Ball Bearing',
              quantity: 1,
              lotOrSerial: 'LOT-2026-X8',
            },
          ],
          postRepairTestResults: [
            {
              testName: 'No-load spin test',
              passed: true,
              measuredValue: '42.1 degC',
              expectedRange: '< 55 degC',
              timestamp: new Date().toISOString(),
              notes: 'Smooth operation across full RPM range',
            },
          ],
          requiresRestartApproval: false,
          notes: 'Bearing service completed cleanly.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { ticket: resolvedTicket, record } = res.body.data;

      // Verify Ticket State
      expect(resolvedTicket.status).toBe('RESOLVED');
      expect(resolvedTicket.faultCategory).toBe('BEARING_OVERHEATING');
      expect(resolvedTicket.rootCauseStatus).toBe('CONFIRMED');
      expect(resolvedTicket.maintenanceRecordId).toBe(record.id);

      // Verify Maintenance Record Linkage
      expect(record.organizationId).toBe(orgAlpha.id);
      expect(record.plantId).toBe(plantAlpha.id);
      expect(record.machineId).toBe(machineExtruder.id);
      expect(record.machineAssetTag).toBe(machineExtruder.assetTag);
      expect(record.ticketId).toBe(ticket.id);
      expect(record.resolvingTechnicianUserId).toBe(userAlphaTech.id);
      expect(record.recordNumber).toMatch(/^MR-\d{4}-\d{4}$/);
      expect(record.recordVersion).toBe(1);
      expect(record.auditTrail).toHaveLength(1);
      expect(record.auditTrail[0].action).toBe('RECORD_CREATED');
      expect(record.auditTrail[0].actorUserId).toBe(userAlphaTech.id);
    });

    it('maintains append-only versioned audit trail on subsequent reviews and corrections', async () => {
      // Create record directly
      const record = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressor.id,
        machineAssetTag: machineCompressor.assetTag,
        ticketId: 't-comp-1',
        ticketNumber: 'TICK-COMP-01',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'PRESSURE_UNSTABLE',
        problemStatement: 'Air pressure drops below 6 bar during cycle',
        rootCause: 'Intake unloader valve sticky',
        rootCauseStatus: 'SUSPECTED',
        repairActions: ['Cleaned unloader valve'],
      });

      expect(record.recordVersion).toBe(1);
      expect(record.auditTrail).toHaveLength(1);

      // Update record with additional findings via PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/maintenance-records/${record.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          rootCause: 'Worn piston return spring in unloader assembly',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Replaced return spring', 'Calibrated unloader pilot'],
          note: 'Post-disassembly inspection confirmed broken spring coils',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.recordVersion).toBe(2);
      expect(patchRes.body.data.rootCauseStatus).toBe('CONFIRMED');
      expect(patchRes.body.data.auditTrail).toHaveLength(2);

      const latestAudit = patchRes.body.data.auditTrail[1];
      expect(latestAudit.versionNumber).toBe(2);
      expect(latestAudit.action).toBe('RECORD_UPDATED');
      expect(latestAudit.actorUserId).toBe(userAlphaTech.id);
      expect(latestAudit.changes.rootCauseStatus).toEqual({
        from: 'SUSPECTED',
        to: 'CONFIRMED',
      });
      expect(latestAudit.notes).toContain('Post-disassembly inspection');
    });
  });

  // ==========================================================================
  // 2. Multi-Tenant and Cross-Plant Isolation
  // ==========================================================================
  describe('2. Multi-Tenant and Cross-Plant Isolation', () => {
    it('prevents users from organization Beta from accessing organization Alpha maintenance history', async () => {
      // Alpha technician creates a record in Org Alpha
      const alphaRecord = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-alpha-sec',
        ticketNumber: 'TICK-ALPHA-SEC',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'PROPRIETARY_CALIBRATION',
        problemStatement: 'Secret extrusion profile drift',
        rootCause: 'Proprietary nozzle wear',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Recalibrated nozzle'],
      });

      // Beta Admin attempts to read Alpha record by ID
      const crossOrgRes = await request(app)
        .get(`/api/v1/maintenance-records/${alphaRecord.id}`)
        .set('Authorization', `Bearer ${tokenBetaAdmin}`);

      expect(crossOrgRes.status).toBe(404);
      expect(crossOrgRes.body.success).toBe(false);

      // Beta Tech attempts to list Alpha machine history
      const crossMachineRes = await request(app)
        .get(`/api/v1/machines/${machineExtruder.id}/maintenance-history`)
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(crossMachineRes.status).toBe(404);

      // Beta Tech lists their own maintenance records - must be empty
      const betaListRes = await request(app)
        .get('/api/v1/maintenance-records')
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(betaListRes.status).toBe(200);
      expect(betaListRes.body.data).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3. Structured Technician Resolution Workflow & Honest Unknowns
  // ==========================================================================
  describe('3. Structured Technician Resolution Workflow & Honest Unknowns', () => {
    it('validates mandatory fields and permits unknown root causes to be recorded honestly', async () => {
      const ticket: SpecialistTicket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressor.id,
        machineAssetTag: machineCompressor.assetTag,
        reportedByUserId: userAlphaWorker.id,
        originalQuestion: 'Intermittent electrical trip on startup',
        escalationReason: 'SPECIALIST_REQUIRED',
        status: 'IN_PROGRESS',
      });

      // Attempt resolve with missing repairActions -> should fail
      const badRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'ELECTRICAL_INTERMITTENT',
          rootCause: 'Unknown capacitor breakdown',
          rootCauseStatus: 'UNKNOWN',
          repairActions: [], // Empty repair actions
        });

      expect(badRes.status).toBe(400);
      expect(badRes.body.error).toContain('repairAction is mandatory');

      // Valid resolve with UNKNOWN root cause recorded honestly
      const goodRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'ELECTRICAL_INTERMITTENT',
          rootCause: 'Root cause currently unknown after initial bench test; fault ceased after circuit breaker reset',
          rootCauseStatus: 'UNKNOWN',
          repairActions: ['Reset thermal overload relay', 'Tightened electrical terminal blocks TB-4 and TB-5'],
          requiresRestartApproval: false,
        });

      expect(goodRes.status).toBe(200);
      expect(goodRes.body.data.record.rootCauseStatus).toBe('UNKNOWN');
      expect(goodRes.body.data.record.rootCause).toContain('currently unknown');
    });

    it('requires measurement units and trusted provenance source', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressor.id,
        machineAssetTag: machineCompressor.assetTag,
        reportedByUserId: userAlphaWorker.id,
        originalQuestion: 'Vibration check requested',
        escalationReason: 'SPECIALIST_REQUIRED',
      });

      // Measurement missing unit and source
      const invalidRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'VIBRATION_ROUTINE',
          rootCause: 'Normal wear',
          rootCauseStatus: 'SUSPECTED',
          repairActions: ['Greased fittings'],
          measurements: [
            {
              parameterName: 'vibration_rms',
              value: 4.2,
              // unit missing!
              // source missing!
            },
          ],
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error).toContain('unit, and trusted source provenance');
    });
  });

  // ==========================================================================
  // 4. Recurring-Fault Detection & Configurable Policies
  // ==========================================================================
  describe('4. Recurring-Fault Detection & Configurable Thresholds', () => {
    it('detects recurring faults according to configured threshold and builds incident timeline', async () => {
      // Configure policy for machineExtruder: 2 incidents within 30 days triggers recurrence
      await dataStore.setRecurringFaultPolicy(orgAlpha.id, {
        machineId: machineExtruder.id,
        timeWindowDays: 30,
        recurrenceCountThreshold: 2,
        requiresSafetyStop: false,
      });

      // Incident 1: 15 days ago
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-rec-1',
        ticketNumber: 'TICK-REC-01',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Bearing temp 74C',
        rootCause: 'Dry bearing race',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Applied grease'],
        verificationState: 'PASSED',
      });

      // Analysis after 1 incident: Not yet recurring
      let analysis = await dataStore.detectRecurringFaults(orgAlpha.id, machineExtruder.id);
      expect(analysis.isRecurringFault).toBe(false);
      expect(analysis.recurrenceCount).toBe(1);

      // Incident 2: Today (within 30-day window)
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-rec-2',
        ticketNumber: 'TICK-REC-02',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Bearing temp 79C again',
        rootCause: 'Shaft misalignment causing asymmetric load',
        rootCauseStatus: 'SUSPECTED',
        repairActions: ['Dial indicator realignment'],
        verificationState: 'PASSED',
      });

      // Analysis after 2 incidents: Threshold reached!
      analysis = await dataStore.detectRecurringFaults(orgAlpha.id, machineExtruder.id);
      expect(analysis.isRecurringFault).toBe(true);
      expect(analysis.recurrenceCount).toBe(2);
      expect(analysis.faultCategory).toBe('BEARING_OVERHEATING');
      expect(analysis.incidentTimeline).toHaveLength(2);
      expect(analysis.confirmedRootCauses).toContain('Dry bearing race');
      expect(analysis.suspectedRootCauses).toContain('Shaft misalignment causing asymmetric load');
      expect(analysis.confidence).toBe('HIGH');
      expect(analysis.evidenceSummary).toContain('Identified 2 recurring incidents');
    });

    it('allows customized recurrence policy per machine type', async () => {
      // Set compressor recurrence threshold to 3
      const policyRes = await request(app)
        .post(`/api/v1/machines/${machineCompressor.id}/recurring-fault-policy`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
        .send({
          timeWindowDays: 60,
          recurrenceCountThreshold: 3,
          requiresSafetyStop: true,
          safetyLimits: { maxTemperatureC: 90, maxPressureBar: 15 },
        });

      expect(policyRes.status).toBe(200);
      expect(policyRes.body.data.recurrenceCountThreshold).toBe(3);
      expect(policyRes.body.data.timeWindowDays).toBe(60);
      expect(policyRes.body.data.requiresSafetyStop).toBe(true);
    });
  });

  // ==========================================================================
  // 5. Safety, Overheating Response & Mandatory Stop/Hold Escalation
  // ==========================================================================
  describe('5. Safety and Overheating Response', () => {
    it('triggers mandatory safety stop warning when verified safety limits are exceeded', async () => {
      // Configure strict safety limit on Extruder: max 80 degC
      await dataStore.setRecurringFaultPolicy(orgAlpha.id, {
        machineId: machineExtruder.id,
        safetyLimits: { maxTemperatureC: 80 },
        requiresSafetyStop: true,
      });

      // Log a resolution with high temperature reading exceeding limit (86 degC)
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-heat-1',
        ticketNumber: 'TICK-HEAT-01',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Severe casing overheating observed',
        measurements: [
          {
            id: 'm-temp',
            parameterName: 'bearing_temperature',
            value: 86.4,
            unit: 'degC',
            timestamp: new Date().toISOString(),
            source: 'CALIBRATED_TOOL',
            isNormal: false,
          },
        ],
        rootCause: 'Cooling jacket scale buildup',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Acid flushes of cooling jackets'],
      });

      const analysis = await dataStore.detectRecurringFaults(orgAlpha.id, machineExtruder.id);
      expect(analysis.isSafetyCritical).toBe(true);
      expect(analysis.requiresSafetyHold).toBe(true);
      expect(analysis.safetyWarning).toContain('[MANDATORY SAFETY STOP / HOLD]');
      expect(analysis.safetyWarning).toContain('86.4degC exceeds verified threshold of 80degC');
      expect(analysis.requiresRestartApproval).toBe(true);
    });

    it('does not invent fabricated values when measurements are absent', async () => {
      // Query AI about temperature on a machine that has no recorded temperature readings
      const response = await ragEngine.query(
        {
          plantId: plantAlpha.id,
          machineId: machineCompressor.id,
          query: 'What is the current bearing temperature reading for compressor CMP-02-GAS?',
        },
        {
          organizationId: orgAlpha.id,
          userId: userAlphaWorker.id,
          userRole: 'WORKER',
        }
      );

      // Verify no fabricated temperature numbers in response
      expect(response.assistantMessage.content).toContain('[MEASUREMENT NOTICE]');
      expect(response.assistantMessage.content).toContain('No verified sensor telemetry or calibrated gauge reading is available');
      expect(response.assistantMessage.content).not.toMatch(/\b(temperature is \d{2,3}|measured at \d{2,3} ?C)\b/i);
    });
  });

  // ==========================================================================
  // 6. Separation of Ticket Resolution and Restart Authorization
  // ==========================================================================
  describe('6. Separation of Ticket Resolution and Restart Authorization', () => {
    it('keeps safety-critical tickets in PENDING_VERIFICATION until authorized supervisor approves restart', async () => {
      // Create safety-critical ticket
      const ticket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        reportedByUserId: userAlphaWorker.id,
        originalQuestion: 'High-temperature thermal runaway alarm',
        escalationReason: 'SAFETY_CRITICAL',
        severity: 'CRITICAL',
        status: 'IN_PROGRESS',
      });

      // Technician performs repair and submits resolution
      const resolveRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'THERMAL_OVERHEATING',
          rootCause: 'Thermocouple failure caused continuous heating element engagement',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Replaced Type-K thermocouple probe', 'Tested PID controller cut-off'],
          requiresRestartApproval: true,
          postRepairTestResults: [
            {
              testName: 'PID safety loop cut-off test',
              passed: true,
              timestamp: new Date().toISOString(),
            },
          ],
        });

      expect(resolveRes.status).toBe(200);

      // Ticket must be in PENDING_VERIFICATION (not RESOLVED)
      const { ticket: pendingTicket, record } = resolveRes.body.data;
      expect(pendingTicket.status).toBe('PENDING_VERIFICATION');
      expect(pendingTicket.requiresRestartApproval).toBe(true);
      expect(pendingTicket.restartApproved).toBe(false);
      expect(record.approvalStatus).toBe('PENDING_APPROVAL');

      // Regular technician attempts to approve restart -> 403 Forbidden!
      const unauthorizedRestart = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/restart-approval`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({ notes: 'Self-authorizing restart' });

      expect(unauthorizedRestart.status).toBe(403);

      // Authorized Plant Manager / Supervisor approves restart
      const authorizedRestart = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/restart-approval`)
        .set('Authorization', `Bearer ${tokenAlphaSupervisor}`)
        .send({ notes: 'Physical inspection completed. Temperature safety loop verified operational.' });

      expect(authorizedRestart.status).toBe(200);
      expect(authorizedRestart.body.data.ticket.status).toBe('RESOLVED');
      expect(authorizedRestart.body.data.ticket.restartApproved).toBe(true);
      expect(authorizedRestart.body.data.ticket.restartApprovedByUserId).toBe(userAlphaSupervisor.id);
      expect(authorizedRestart.body.data.record.approvalStatus).toBe('APPROVED');
      expect(authorizedRestart.body.data.record.verificationState).toBe('PASSED');
    });
  });

  // ==========================================================================
  // 7. Ticket-to-History Feedback Loop & Reopen Traceability
  // ==========================================================================
  describe('7. Ticket-to-History Feedback Loop & Reopen Traceability', () => {
    it('supports reopening a ticket when verification fails, updating linked record audit trail', async () => {
      // Create and resolve ticket
      const ticket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressor.id,
        machineAssetTag: machineCompressor.assetTag,
        reportedByUserId: userAlphaWorker.id,
        originalQuestion: 'Vibration in main belt drive',
        escalationReason: 'SPECIALIST_REQUIRED',
        status: 'IN_PROGRESS',
      });

      const resolveRes = await dataStore.resolveSpecialistTicket(orgAlpha.id, ticket.id, {
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BELT_DRIVE_VIBRATION',
        rootCause: 'Loose belt tension',
        rootCauseStatus: 'SUSPECTED',
        repairActions: ['Tensioned belt drive'],
        requiresRestartApproval: false,
      });

      expect(resolveRes.ticket.status).toBe('RESOLVED');
      const recordId = resolveRes.record.id;

      // Fault returns 2 days later: Reopen ticket
      const reopenRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/reopen`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          reopenReason: 'Vibration returned under full operating load. Belt slipping and burning odor detected.',
        });

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.data.ticket.status).toBe('REOPENED');
      expect(reopenRes.body.data.ticket.reopenCount).toBe(1);

      // Verify linked maintenance record audit trail captured the reopening
      const updatedRecord = await dataStore.getMaintenanceRecordById(orgAlpha.id, recordId);
      expect(updatedRecord).not.toBeNull();
      expect(updatedRecord!.verificationState).toBe('FAILED');
      expect(updatedRecord!.recordVersion).toBe(2);

      const auditEntries = updatedRecord!.auditTrail;
      expect(auditEntries[auditEntries.length - 1].notes).toContain('Ticket reopened due to recurring');
    });
  });

  // ==========================================================================
  // 8. History-Aware AI Retrieval & Confidentiality Enforcement
  // ==========================================================================
  describe('8. History-Aware AI Retrieval & Confidentiality Enforcement', () => {
    it('retrieves relevant historical evidence into RAG context while protecting confidential manuals from non-admins', async () => {
      // 1. Log historical incident for Extruder
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-hist-rag',
        ticketNumber: 'TICK-HIST-RAG',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BARREL_HEATER_FAILURE',
        problemStatement: 'Zone 3 barrel temperature fluctuating',
        rootCause: 'Solid-state relay SSR-3 contacts stuck closed',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced solid-state relay SSR-3', 'Verified 4-20mA control signal from PLC'],
        postRepairTestResults: [
          {
            testName: 'Temperature stability test',
            passed: true,
            measuredValue: '210 degC steady',
            timestamp: new Date().toISOString(),
          },
        ],
        verificationState: 'PASSED',
      });

      // 2. Query AI copilot as non-admin Worker
      const response = await ragEngine.query(
        {
          plantId: plantAlpha.id,
          machineId: machineExtruder.id,
          query: 'What was the confirmed root cause of the previous temperature fluctuation on extruder EXT-01-HEAT?',
        },
        {
          organizationId: orgAlpha.id,
          userId: userAlphaWorker.id,
          userRole: 'WORKER',
        }
      );

      // Must retrieve maintenance history
      expect(response.maintenanceRecords).toBeDefined();
      expect(response.maintenanceRecords!.length).toBeGreaterThan(0);

      // Non-admin worker must receive source-grounded response without leaking confidential manual text
      expect(response.assistantMessage.content).toContain('SSR-3');
      expect(response.assistantMessage.content).toContain('CONFIRMED');

      // Citations for non-admin worker should not expose proprietary raw content
      for (const citation of response.assistantMessage.citations) {
        if (citation.snippet.startsWith('Reference:')) {
          expect(citation.snippet).not.toContain('CONFIDENTIAL PROPRIETARY TEXT');
        }
      }
    });
  });

  // ==========================================================================
  // 9. Prompt 12 Data Integrity, Validation, Idempotency & Cross-Tenant Guards
  // ==========================================================================
  describe('9. Prompt 12 Data Integrity, Validation, Idempotency & Cross-Tenant Guards', () => {
    it('rejects cross-tenant machineId, ticketId, and plantId query parameters with 404', async () => {
      // 1. Beta technician tries to filter by Alpha machineId
      const crossMachineRes = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineExtruder.id}`)
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(crossMachineRes.status).toBe(404);
      expect(crossMachineRes.body.error).toContain('Machine not found in this organization');

      // 2. Beta technician tries to filter by Alpha plantId
      const crossPlantRes = await request(app)
        .get(`/api/v1/maintenance-records?plantId=${plantAlpha.id}`)
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(crossPlantRes.status).toBe(404);
      expect(crossPlantRes.body.error).toContain('Plant not found in this organization');

      // 3. Create a ticket in Alpha
      const alphaTicket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        componentId: null,
        originalQuestion: 'Alpha motor fault inquiry',
        reportedByUserId: userAlphaWorker.id,
        reportedByUserName: userAlphaWorker.fullName,
        severity: 'MEDIUM',
      });

      // Beta technician tries to filter by Alpha ticketId
      const crossTicketRes = await request(app)
        .get(`/api/v1/maintenance-records?ticketId=${alphaTicket.id}`)
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(crossTicketRes.status).toBe(404);
      expect(crossTicketRes.body.error).toContain('Work order ticket not found in this organization');
    });

    it('validates allowlisted query enum parameters and date formats', async () => {
      // Invalid rootCauseStatus
      const invalidStatusRes = await request(app)
        .get('/api/v1/maintenance-records?rootCauseStatus=INVALID_STATUS')
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(invalidStatusRes.status).toBe(400);
      expect(invalidStatusRes.body.error).toContain('rootCauseStatus must be CONFIRMED, SUSPECTED, or UNKNOWN');

      // Invalid verificationState
      const invalidVerifyRes = await request(app)
        .get('/api/v1/maintenance-records?verificationState=INVALID_VERIFY')
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(invalidVerifyRes.status).toBe(400);
      expect(invalidVerifyRes.body.error).toContain('verificationState must be PASSED, FAILED, PENDING, or NOT_APPLICABLE');

      // Invalid approvalStatus
      const invalidApprovalRes = await request(app)
        .get('/api/v1/maintenance-records?approvalStatus=INVALID_APPROVAL')
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(invalidApprovalRes.status).toBe(400);
      expect(invalidApprovalRes.body.error).toContain('approvalStatus must be PENDING_APPROVAL, APPROVED, REJECTED, or NOT_REQUIRED');

      // Invalid sortOrder
      const invalidSortRes = await request(app)
        .get('/api/v1/maintenance-records?sortOrder=RANDOM')
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(invalidSortRes.status).toBe(400);
      expect(invalidSortRes.body.error).toContain('sortOrder must be asc or desc');

      // Invalid dateFrom
      const invalidDateRes = await request(app)
        .get('/api/v1/maintenance-records?dateFrom=not-a-date')
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(invalidDateRes.status).toBe(400);
      expect(invalidDateRes.body.error).toContain('dateFrom must be a valid ISO date string');
    });

    it('enforces pagination bounds, metadata, and deterministic sorting', async () => {
      // Create 3 distinct records for Extruder
      const t1 = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-sort-1',
        ticketNumber: 'TICK-SORT-1',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Bearing temp high',
        rootCause: 'Lubricant starved',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Greased bearing'],
        resolvedAt: '2026-01-10T10:00:00Z',
      });

      const t2 = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-sort-2',
        ticketNumber: 'TICK-SORT-2',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Bearing vibration',
        rootCause: 'Misalignment',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Realigned coupling'],
        resolvedAt: '2026-02-15T12:00:00Z',
      });

      const t3 = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineExtruder.id,
        machineAssetTag: machineExtruder.assetTag,
        ticketId: 't-sort-3',
        ticketNumber: 'TICK-SORT-3',
        reportingUserId: userAlphaWorker.id,
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Severe bearing noise',
        rootCause: 'Fatigue spall',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced bearing assembly'],
        resolvedAt: '2026-03-20T14:00:00Z',
      });

      // 1. Paginated fetch: limit=2, offset=0
      const page1Res = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineExtruder.id}&limit=2&offset=0&sortOrder=desc`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.success).toBe(true);
      expect(page1Res.body.data.length).toBe(2);
      expect(page1Res.body.pagination).toBeDefined();
      expect(page1Res.body.pagination.limit).toBe(2);
      expect(page1Res.body.pagination.offset).toBe(0);
      expect(page1Res.body.pagination.total).toBeGreaterThanOrEqual(3);
      expect(page1Res.body.pagination.hasMore).toBe(true);

      // Latest first (t3 resolved in March, t2 resolved in Feb)
      expect(page1Res.body.data[0].id).toBe(t3.id);
      expect(page1Res.body.data[1].id).toBe(t2.id);

      // 2. Ascending sort: Oldest first
      const ascRes = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineExtruder.id}&sortOrder=asc&limit=3`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(ascRes.status).toBe(200);
      expect(ascRes.body.data[0].id).toBe(t1.id);
    });

    it('validates mandatory record creation fields and prevents cross-tenant entity linkage', async () => {
      // 1. Missing required machineId
      await expect(
        dataStore.createMaintenanceRecord(orgAlpha.id, {
          plantId: plantAlpha.id,
          machineId: '',
          machineAssetTag: 'UNKNOWN',
          ticketId: 't-test-fail-1',
          ticketNumber: 'TICK-FAIL-1',
          reportingUserId: userAlphaWorker.id,
          resolvingTechnicianUserId: userAlphaTech.id,
          resolvingTechnicianName: userAlphaTech.fullName,
          faultCategory: 'ELECTRICAL',
          problemStatement: 'Short circuit',
          rootCause: 'Damaged insulation',
          repairActions: ['Replaced wire'],
        })
      ).rejects.toThrow('Validation Error: machineId is required');

      // 2. Missing repairActions
      await expect(
        dataStore.createMaintenanceRecord(orgAlpha.id, {
          plantId: plantAlpha.id,
          machineId: machineExtruder.id,
          machineAssetTag: machineExtruder.assetTag,
          ticketId: 't-test-fail-2',
          ticketNumber: 'TICK-FAIL-2',
          reportingUserId: userAlphaWorker.id,
          resolvingTechnicianUserId: userAlphaTech.id,
          resolvingTechnicianName: userAlphaTech.fullName,
          faultCategory: 'ELECTRICAL',
          problemStatement: 'Short circuit',
          rootCause: 'Damaged insulation',
          repairActions: [],
        })
      ).rejects.toThrow('At least one repairAction is required');

      // 3. Cross-tenant machine reference: Alpha org trying to link Beta machine
      await expect(
        dataStore.createMaintenanceRecord(orgAlpha.id, {
          plantId: plantAlpha.id,
          machineId: machineBetaPump.id,
          machineAssetTag: machineBetaPump.assetTag,
          ticketId: 't-test-fail-3',
          ticketNumber: 'TICK-FAIL-3',
          reportingUserId: userAlphaWorker.id,
          resolvingTechnicianUserId: userAlphaTech.id,
          resolvingTechnicianName: userAlphaTech.fullName,
          faultCategory: 'MECHANICAL',
          problemStatement: 'Pump seal leaking',
          rootCause: 'Worn face',
          repairActions: ['Replaced seal'],
        })
      ).rejects.toThrow('Cross-tenant security violation: Machine');
    });

    it('prevents duplicate maintenance records on repeated ticket resolution (idempotency)', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressor.id,
        machineAssetTag: machineCompressor.assetTag,
        componentId: null,
        originalQuestion: 'Compressor thermal cut-out tripped',
        reportedByUserId: userAlphaWorker.id,
        reportedByUserName: userAlphaWorker.fullName,
        severity: 'MEDIUM',
      });

      // First resolution
      const res1 = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'THERMAL_OVERLOAD',
          rootCause: 'Clogged oil cooler fins',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Cleaned cooler fins with pressurized air'],
          requiresRestartApproval: false,
        });

      expect(res1.status).toBe(200);
      const initialRecordId = res1.body.data.record.id;
      const initialRecordNumber = res1.body.data.record.recordNumber;

      // Second identical resolution request (simulating network retry / double click)
      const res2 = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          faultCategory: 'THERMAL_OVERLOAD',
          rootCause: 'Clogged oil cooler fins',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Cleaned cooler fins with pressurized air'],
          requiresRestartApproval: false,
        });

      expect(res2.status).toBe(200);
      // Must return identical record, NOT create a second duplicate record
      expect(res2.body.data.record.id).toBe(initialRecordId);
      expect(res2.body.data.record.recordNumber).toBe(initialRecordNumber);

      // Verify that the machine has exactly ONE record for this ticket
      const records = await dataStore.listMaintenanceRecords(orgAlpha.id, { ticketId: ticket.id });
      expect(records).toHaveLength(1);
    });

    it('rejects update of immutable historical fields in PATCH /:id', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressor.id,
        machineAssetTag: machineCompressor.assetTag,
        componentId: null,
        originalQuestion: 'Pressure valve fluttering',
        reportedByUserId: userAlphaWorker.id,
        reportedByUserName: userAlphaWorker.fullName,
        severity: 'LOW',
      });

      const resolveRes = await dataStore.resolveSpecialistTicket(orgAlpha.id, ticket.id, {
        resolvingTechnicianUserId: userAlphaTech.id,
        resolvingTechnicianName: userAlphaTech.fullName,
        faultCategory: 'PNEUMATIC_VALVE_LEAK',
        rootCause: 'Diaphragm micro-perforation',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced valve diaphragm'],
        requiresRestartApproval: false,
      });

      const recordId = resolveRes.record.id;
      const originalRecordNumber = resolveRes.record.recordNumber;
      const originalMachineId = resolveRes.record.machineId;

      // Attempt to maliciously modify immutable fields
      const patchRes = await request(app)
        .patch(`/api/v1/maintenance-records/${recordId}`)
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          recordNumber: 'HACKED-RECORD-999',
          machineId: machineBetaPump.id,
          ticketNumber: 'HACKED-TICKET-999',
          rootCauseStatus: 'SUSPECTED',
          note: 'Technician re-evaluated root cause status',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.rootCauseStatus).toBe('SUSPECTED');
      // Immutable fields must remain unchanged
      expect(patchRes.body.data.recordNumber).toBe(originalRecordNumber);
      expect(patchRes.body.data.machineId).toBe(originalMachineId);

      const persisted = await dataStore.getMaintenanceRecordById(orgAlpha.id, recordId);
      expect(persisted!.recordNumber).toBe(originalRecordNumber);
      expect(persisted!.machineId).toBe(originalMachineId);
    });
  });
});


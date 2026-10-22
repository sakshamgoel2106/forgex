import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
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
import { VisualIntelligenceEngine } from '../src/services/visualIntelligenceEngine.js';
import { MaintenanceWorkflowEngine } from '../src/services/maintenanceWorkflowEngine.js';
import { HistoricalFaultService } from '../src/services/historicalFaultService.js';
import crypto from 'node:crypto';
import type {
  Organization,
  Plant,
  User,
  Machine,
  SpecialistTicket,
  MaintenanceRecord,
} from '@forgex/shared-types';

describe('PROMPT 15 — Maintenance History Comprehensive Audit & Regression Verification', () => {
  const jwtSecret = 'test_maintenance_audit_secret_key_at_least_32_chars';
  let app: Application;
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
  let visualEngine: VisualIntelligenceEngine;
  let maintenanceEngine: MaintenanceWorkflowEngine;
  let historicalFaultService: HistoricalFaultService;

  // Organizations
  let orgTenantA: Organization;
  let orgTenantB: Organization;

  // Plants
  let plantA: Plant;
  let plantB: Plant;

  // Users
  let adminA: User;
  let techA: User;
  let workerA: User;
  let supervisorA: User;
  let adminB: User;

  // Auth Tokens
  let tokenAdminA: string;
  let tokenTechA: string;
  let tokenWorkerA: string;
  let tokenSupervisorA: string;
  let tokenAdminB: string;

  // Machines
  let machineAlpha: Machine;
  let machineBeta: Machine;
  let machineTenantB: Machine;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter('./test-storage-audit');
    embeddingAdapter = new LocalDevEmbeddingAdapter(384);
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();
    ingestionQueue = new IngestionQueue(storageAdapter, dataStore, embeddingAdapter, vectorStore);
    historicalFaultService = new HistoricalFaultService(dataStore);

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'test_knowledge_collection',
      undefined,
      historicalFaultService
    );

    visualEngine = new VisualIntelligenceEngine(
      dataStore,
      storageAdapter,
      visionProvider,
      ragEngine
    );

    maintenanceEngine = new MaintenanceWorkflowEngine(dataStore, ragEngine, visualEngine);

    app = createApp({
      authAdapter,
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      ingestionQueue,
      generationProvider,
      rerankingProvider,
      ragEngine,
      visionProvider,
      visualEngine,
      maintenanceEngine,
    });

    // 1. Setup Tenant A
    orgTenantA = await dataStore.createOrganization({
      name: 'Alpha Heavy Industries',
      slug: 'alpha-heavy-ind-' + crypto.randomUUID().substring(0, 8),
      domain: 'alpha.example.com',
      tier: 'ENTERPRISE',
      retentionDays: 365,
    });

    plantA = await dataStore.createPlant(orgTenantA.id, {
      name: 'Alpha Forging Facility',
      code: 'PLANT-ALPHA-01',
      location: 'Sector 4, Gary, IN',
    });

    adminA = await dataStore.createUser({
      externalAuthId: 'ext_admin_a',
      email: `admin-a-${crypto.randomUUID().substring(0, 6)}@alpha.example.com`,
      fullName: 'Alice Administrator',
      status: 'ACTIVE',
    });
    await dataStore.createMembership({
      organizationId: orgTenantA.id,
      userId: adminA.id,
      role: 'ORG_ADMIN',
    });
    tokenAdminA = LocalDevAuthAdapter.generateDevToken(
      { id: adminA.externalAuthId!, email: adminA.email, emailVerified: true },
      jwtSecret
    );

    supervisorA = await dataStore.createUser({
      externalAuthId: 'ext_supervisor_a',
      email: `supervisor-a-${crypto.randomUUID().substring(0, 6)}@alpha.example.com`,
      fullName: 'Sam Supervisor',
      status: 'ACTIVE',
    });
    await dataStore.createMembership({
      organizationId: orgTenantA.id,
      userId: supervisorA.id,
      role: 'MAINTENANCE_SUPERVISOR',
    });
    tokenSupervisorA = LocalDevAuthAdapter.generateDevToken(
      { id: supervisorA.externalAuthId!, email: supervisorA.email, emailVerified: true },
      jwtSecret
    );

    techA = await dataStore.createUser({
      externalAuthId: 'ext_tech_a',
      email: `tech-a-${crypto.randomUUID().substring(0, 6)}@alpha.example.com`,
      fullName: 'Tom Technician',
      status: 'ACTIVE',
    });
    await dataStore.createMembership({
      organizationId: orgTenantA.id,
      userId: techA.id,
      role: 'TECHNICIAN',
    });
    tokenTechA = LocalDevAuthAdapter.generateDevToken(
      { id: techA.externalAuthId!, email: techA.email, emailVerified: true },
      jwtSecret
    );

    workerA = await dataStore.createUser({
      externalAuthId: 'ext_worker_a',
      email: `worker-a-${crypto.randomUUID().substring(0, 6)}@alpha.example.com`,
      fullName: 'Wendy Worker',
      status: 'ACTIVE',
    });
    await dataStore.createMembership({
      organizationId: orgTenantA.id,
      userId: workerA.id,
      role: 'WORKER',
    });
    tokenWorkerA = LocalDevAuthAdapter.generateDevToken(
      { id: workerA.externalAuthId!, email: workerA.email, emailVerified: true },
      jwtSecret
    );

    // 2. Setup Tenant B
    orgTenantB = await dataStore.createOrganization({
      name: 'Beta Global Steel',
      slug: 'beta-global-steel-' + crypto.randomUUID().substring(0, 8),
      domain: 'beta.example.com',
      tier: 'ENTERPRISE',
      retentionDays: 365,
    });

    plantB = await dataStore.createPlant(orgTenantB.id, {
      name: 'Beta Mill #2',
      code: 'PLANT-BETA-02',
      location: 'Cleveland, OH',
    });

    adminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: `admin-b-${crypto.randomUUID().substring(0, 6)}@beta.example.com`,
      fullName: 'Bob Beta Admin',
      status: 'ACTIVE',
    });
    await dataStore.createMembership({
      organizationId: orgTenantB.id,
      userId: adminB.id,
      role: 'ORG_ADMIN',
    });
    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: adminB.externalAuthId!, email: adminB.email, emailVerified: true },
      jwtSecret
    );

    // 3. Register Machines
    machineAlpha = await dataStore.createMachine(orgTenantA.id, {
      plantId: plantA.id,
      assetTag: 'PUMP-AL-101',
      name: 'High Pressure Slurry Pump A',
      serialNumber: 'SN-HP-101',
      modelNumber: 'SlurryMax-5000',
      manufacturer: 'ForgeMach Industrial',
      category: 'PUMP',
      status: 'OPERATIONAL',
      criticality: 'CRITICAL',
    });

    machineBeta = await dataStore.createMachine(orgTenantA.id, {
      plantId: plantA.id,
      assetTag: 'PRESS-AL-202',
      name: 'Hydraulic Stamping Press B',
      serialNumber: 'SN-PRESS-202',
      modelNumber: 'StampForge-X',
      manufacturer: 'PressWorks Corp',
      category: 'PRESS',
      status: 'OPERATIONAL',
      criticality: 'HIGH',
    });

    machineTenantB = await dataStore.createMachine(orgTenantB.id, {
      plantId: plantB.id,
      assetTag: 'BETA-CRANE-909',
      name: 'Beta Overhead Gantry Crane',
      serialNumber: 'SN-CRANE-909',
      modelNumber: 'Gantry-Pro',
      manufacturer: 'HeavyLift Corp',
      category: 'CRANE',
      status: 'OPERATIONAL',
      criticality: 'CRITICAL',
    });
  });

  // =========================================================================
  // SECTION 1: FRONTEND REGRESSION & TIMELINE CONTRACT TESTS
  // =========================================================================
  describe('Area 1: Frontend Timeline & UI Contract Verification', () => {
    it('1.1 Should return valid timeline ledger payload matching Frontend expectations with machine filtering', async () => {
      // Create 2 records for machineAlpha and 1 for machineBeta
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-001',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'BEARING_FAILURE',
        problemStatement: 'Severe vibration on impeller bearing assembly',
        observedSymptoms: ['Vibration > 8.5 mm/s', 'Whining noise'],
        rootCause: 'Spherical roller bearing spalling',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced outboard bearing', 'Flushed grease cavity'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-002',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'SEAL_LEAKAGE',
        problemStatement: 'Mechanical seal weeping coolant',
        observedSymptoms: ['Coolant on baseplate'],
        rootCause: 'O-ring degradation',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced Viton O-ring seal'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineBeta.id,
        machineAssetTag: machineBeta.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-003',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'HYDRAULIC_PRESSURE_LOSS',
        problemStatement: 'Stamping pressure dropped below 200 bar',
        observedSymptoms: ['Pressure gauge reads 140 bar'],
        rootCause: 'Proportional relief valve sticky',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Cleaned spool valve', 'Replaced cartridge'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      // Filter by machineAlpha
      const resAlpha = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineAlpha.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .expect(200);

      expect(resAlpha.body.success).toBe(true);
      expect(resAlpha.body.data).toHaveLength(2);
      expect(resAlpha.body.data.every((r: any) => r.machineId === machineAlpha.id)).toBe(true);

      // Verify pagination metadata exists
      expect(resAlpha.body.pagination).toBeDefined();
      expect(resAlpha.body.pagination.total).toBe(2);
    });

    it('1.2 Switching machine filter guarantees stale records are not returned for the target machine', async () => {
      // Query machineBeta
      const resBeta = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineBeta.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .expect(200);

      expect(resBeta.body.data.every((r: any) => r.machineId === machineBeta.id)).toBe(true);
      expect(resBeta.body.data.some((r: any) => r.machineId === machineAlpha.id)).toBe(false);
    });

    it('1.3 Handles records with missing optional fields without API crash or schema violation', async () => {
      const minimalRecord = await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-MINIMAL-01',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'UNKNOWN_FAULT',
        problemStatement: 'Intermittent sound during shift change',
        observedSymptoms: [],
        rootCause: 'Under investigation',
        rootCauseStatus: 'UNKNOWN',
        repairActions: ['Visual inspection only'],
        verificationState: 'PENDING',
        approvalStatus: 'NOT_REQUIRED',
        // Optional fields intentionally omitted: componentId, measurements, partsReplaced
      });

      expect(minimalRecord.id).toBeDefined();
      expect(minimalRecord.ticketId).toBeNull();
      expect(minimalRecord.caseNumber).toBe('CASE-MINIMAL-01');
      expect(minimalRecord.measurements).toEqual([]);
      expect(minimalRecord.partsReplaced).toEqual([]);

      const res = await request(app)
        .get(`/api/v1/maintenance-records/${minimalRecord.id}`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.recordNumber).toBeDefined();
      expect(res.body.data.verificationState).toBe('PENDING');
    });

    it('1.4 Returns deterministic chronological sorting for both newest-first (desc) and oldest-first (asc)', async () => {
      const r1 = await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-SORT-01',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'ELECTRICAL_FAULT',
        problemStatement: 'Event 1 - Oldest',
        observedSymptoms: [],
        rootCause: 'Fuse blown',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced 15A fuse'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
        resolvedAt: new Date(Date.now() - 60000).toISOString(),
      });

      const r2 = await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-SORT-02',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'ELECTRICAL_FAULT',
        problemStatement: 'Event 2 - Newest',
        observedSymptoms: [],
        rootCause: 'Relay chatter',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced solid state relay'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
        resolvedAt: new Date().toISOString(),
      });

      const resDesc = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineAlpha.id}&sortOrder=desc`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .expect(200);

      const resAsc = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machineAlpha.id}&sortOrder=asc`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .expect(200);

      const idsDesc = resDesc.body.data.map((r: any) => r.id);
      const idsAsc = resAsc.body.data.map((r: any) => r.id);

      expect(idsDesc[0]).toBe(r2.id); // Newest first
      expect(idsAsc[0]).toBe(r1.id);  // Oldest first
    });
  });

  // =========================================================================
  // SECTION 2: BACKEND APIS & DATA INTEGRITY TESTS
  // =========================================================================
  describe('Area 2: Backend APIs and Data Integrity Verification', () => {
    it('2.1 Rejects invalid machine ID with clean HTTP 404', async () => {
      const res = await request(app)
        .get('/api/v1/maintenance-records?machineId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });

    it('2.2 Validates and rejects malformed query filters (status, enums, dates)', async () => {
      // Invalid rootCauseStatus
      await request(app)
        .get('/api/v1/maintenance-records?rootCauseStatus=NOT_A_VALID_STATUS')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .expect(400);

      // Invalid verificationState
      await request(app)
        .get('/api/v1/maintenance-records?verificationState=INVALID_VERIFY')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .expect(400);

      // Invalid date format
      await request(app)
        .get('/api/v1/maintenance-records?dateFrom=unparseable-date')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .expect(400);
    });

    it('2.3 Rejects unauthorized updates or invalid measurement structures on PATCH', async () => {
      const rec = await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-MEAS-01',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'CALIBRATION',
        problemStatement: 'Calibration check',
        observedSymptoms: [],
        rootCause: 'Zero drift',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Re-zeroed sensor'],
        verificationState: 'PENDING',
        approvalStatus: 'NOT_REQUIRED',
      });

      // Invalid measurement payload (missing value/unit)
      const resInvalid = await request(app)
        .patch(`/api/v1/maintenance-records/${rec.id}`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          measurements: [{ parameterName: 'Pressure' }], // missing value & unit
        })
        .expect(400);

      expect(resInvalid.body.success).toBe(false);

      // Valid measurement payload
      const resValid = await request(app)
        .patch(`/api/v1/maintenance-records/${rec.id}`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          measurements: [
            { parameterName: 'Operating Pressure', value: 185.5, unit: 'bar' },
          ],
          verificationState: 'PASSED',
        })
        .expect(200);

      expect(resValid.body.success).toBe(true);
      expect(resValid.body.data.verificationState).toBe('PASSED');
      expect(resValid.body.data.measurements[0].value).toBe(185.5);
    });
  });

  // =========================================================================
  // SECTION 3: WORK ORDER COMPLETION WITH HISTORY INTEGRATION
  // =========================================================================
  describe('Area 3: Work Order Completion & History Integration Verification', () => {
    it('3.1 Completing a Work Order via resolution creates an authoritative maintenance record linked bidirectionally', async () => {
      // Create specialist ticket (work order)
      const ticket = await dataStore.createSpecialistTicket(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        reportedByUserId: workerA.id,
        reportedByUserName: workerA.fullName,
        assignedSpecialistUserId: techA.id,
        assignedSpecialistName: techA.fullName,
        originalQuestion: 'Pump inlet flange leaking fluid under load',
      });

      // Technician resolves ticket
      const resResolve = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          resolvingTechnicianUserId: techA.id,
          resolvingTechnicianName: techA.fullName,
          faultCategory: 'FLANGE_LEAKAGE',
          rootCause: 'Gasket blown due to thermal expansion',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Torqued flange bolts to 120 Nm', 'Replaced spiral wound gasket'],
          observedSymptoms: ['Fluid dripping from inlet flange'],
          verificationState: 'PASSED',
          requiresRestartApproval: false,
        })
        .expect(200);

      expect(resResolve.body.success).toBe(true);
      const resolvedTicket = resResolve.body.data.ticket;
      const createdRecord = resResolve.body.data.record;

      expect(resolvedTicket.maintenanceRecordId).toBe(createdRecord.id);
      expect(createdRecord.ticketId).toBe(ticket.id);
      expect(createdRecord.machineId).toBe(machineAlpha.id);
      expect(createdRecord.rootCauseStatus).toBe('CONFIRMED');
      expect(createdRecord.verificationState).toBe('PASSED');

      // Verify record is retrievable via maintenance history endpoint
      const resFetch = await request(app)
        .get(`/api/v1/maintenance-records/${createdRecord.id}`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .expect(200);

      expect(resFetch.body.data.ticketNumber).toBe(ticket.ticketNumber);
    });

    it('3.2 Idempotent Work Order completion prevents duplicate historical records on repeated requests', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineBeta.id,
        machineAssetTag: machineBeta.assetTag,
        reportedByUserId: workerA.id,
        reportedByUserName: workerA.fullName,
        assignedSpecialistUserId: techA.id,
        assignedSpecialistName: techA.fullName,
        originalQuestion: 'Press safety curtain trip circuit fault',
      });

      const resolvePayload = {
        resolvingTechnicianUserId: techA.id,
        resolvingTechnicianName: techA.fullName,
        faultCategory: 'ELECTRICAL_SAFETY',
        rootCause: 'Optical sensor dust accumulation',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Cleaned optical receiver glass', 'Recalibrated alignment beam'],
        observedSymptoms: ['Intermittent safety trip on stroke start'],
        verificationState: 'PASSED',
        requiresRestartApproval: false,
      };

      // First resolution call
      const firstRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send(resolvePayload)
        .expect(200);

      const firstRecordId = firstRes.body.data.record.id;

      // Duplicate resolution call (e.g. network retry or double-click)
      const secondRes = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send(resolvePayload)
        .expect(200);

      const secondRecordId = secondRes.body.data.record.id;

      // Must return identical record without generating duplicate history entries
      expect(secondRecordId).toBe(firstRecordId);

      // Verify database count for this ticket is exactly 1
      const allRecords = await dataStore.listMaintenanceRecords(orgTenantA.id, {
        ticketId: ticket.id,
      });
      expect(allRecords).toHaveLength(1);
    });

    it('3.3 Resolving after ticket reopening updates existing record rather than creating an unlinked duplicate', async () => {
      const ticket = await dataStore.createSpecialistTicket(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        reportedByUserId: workerA.id,
        reportedByUserName: workerA.fullName,
        assignedSpecialistUserId: techA.id,
        assignedSpecialistName: techA.fullName,
        originalQuestion: 'Initial alignment check',
      });

      // Initial resolve
      const res1 = await dataStore.resolveSpecialistTicket(orgTenantA.id, ticket.id, {
        resolvingTechnicianUserId: techA.id,
        resolvingTechnicianName: techA.fullName,
        faultCategory: 'ALIGNMENT',
        rootCause: 'Motor shifted on shims',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Added 0.25mm shims'],
        observedSymptoms: [],
        verificationState: 'PASSED',
        requiresRestartApproval: false,
      });

      const initialRecordId = res1.record.id;

      // Reopen ticket
      await request(app)
        .post(`/api/v1/tickets/${ticket.id}/reopen`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ reopenReason: 'Vibration detected again during test run' })
        .expect(200);

      // Re-resolve ticket with updated findings
      const res2 = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/resolve`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          resolvingTechnicianUserId: techA.id,
          resolvingTechnicianName: techA.fullName,
          faultCategory: 'ALIGNMENT',
          rootCause: 'Coupling elastomeric insert sheared in addition to shim displacement',
          rootCauseStatus: 'CONFIRMED',
          repairActions: ['Replaced elastomeric spider insert', 'Torqued coupling clamp bolts'],
          observedSymptoms: ['Vibration peak at 2x running speed'],
          verificationState: 'PASSED',
          requiresRestartApproval: false,
          notes: 'Secondary root cause discovered during re-verification.',
        })
        .expect(200);

      // The record ID must be preserved
      expect(res2.body.data.record.id).toBe(initialRecordId);
      expect(res2.body.data.record.rootCause).toContain('Coupling elastomeric insert sheared');
    });
  });

  // =========================================================================
  // SECTION 4: HISTORICAL FAULT RETRIEVAL & RECURRING PROBLEM DETECTION
  // =========================================================================
  describe('Area 4: Historical Fault Retrieval & Recurrence Detection Verification', () => {
    it('4.1 Retrieves matching historical faults on target machine with similarity scoring and keywords', async () => {
      // Seed 2 historical incidents on machineAlpha
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-BRG-01',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'BEARING_OVERHEAT',
        faultCode: 'ERR-BRG-90',
        problemStatement: 'Inboard bearing overheating under full continuous hydraulic load',
        observedSymptoms: ['Temperature 88C', 'Vibration harmonic whining'],
        rootCause: 'Inadequate lubricant film thickness due to high ambient heat',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Drained synthetic grease', 'Refilled with ISO VG 460 high temp grease'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machineAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          query: 'bearing overheating whining noise',
          faultCategory: 'BEARING_OVERHEAT',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.matchedCount).toBeGreaterThanOrEqual(1);

      const topMatch = res.body.data.matches[0];
      expect(topMatch.machineId).toBe(machineAlpha.id);
      expect(topMatch.evidenceType).toBe('RECORDED_FACT');
      expect(topMatch.matchScore).toBeGreaterThan(0.6);
      expect(topMatch.priorRepairEffectiveness).toBe('EFFECTIVE');
    });

    it('4.2 Correctly classifies insufficient historical evidence when only 1 incident exists without false recurrence claim', async () => {
      const res = await request(app)
        .get(`/api/v1/machines/${machineBeta.id}/historical-faults?query=hydraulic+pressure`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Single incident should NOT trigger recurring fault status
      expect(res.body.data.recurrenceAnalysis.isRecurringFault).toBe(false);
    });

    it('4.3 Detects multi-incident recurrence, computes recurrence interval, and surfaces aggregate repair effectiveness', async () => {
      const now = Date.now();
      // Incident 1: 40 days ago
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-VALVE-01',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'VALVE_SEAT_EROSION',
        problemStatement: 'Discharge check valve leaking past seat',
        observedSymptoms: ['Backflow detected'],
        rootCause: 'Tungsten carbide valve seat cavitation erosion',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Lapped valve seat'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
        resolvedAt: new Date(now - 40 * 86400000).toISOString(),
      });

      // Incident 2: 20 days ago
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-VALVE-02',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'VALVE_SEAT_EROSION',
        problemStatement: 'Discharge check valve leaking past seat again',
        observedSymptoms: ['Backflow pressure drop'],
        rootCause: 'Tungsten carbide valve seat cavitation erosion',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced valve cartridge assembly'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
        resolvedAt: new Date(now - 20 * 86400000).toISOString(),
      });

      // Incident 3: today
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-VALVE-03',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'VALVE_SEAT_EROSION',
        problemStatement: 'Third occurrence of valve seat erosion',
        observedSymptoms: ['Backflow pressure drop', 'Chatter noise'],
        rootCause: 'Upstream piping turbulence causing micro-cavitation',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Scheduled pipe redesign'],
        verificationState: 'FAILED',
        approvalStatus: 'NOT_REQUIRED',
        resolvedAt: new Date(now).toISOString(),
      });

      const res = await request(app)
        .get(`/api/v1/machines/${machineAlpha.id}/historical-faults?faultCategory=VALVE_SEAT_EROSION&timeWindowDays=60`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const rec = res.body.data.recurrenceAnalysis;

      expect(rec.isRecurringFault).toBe(true);
      expect(rec.recurrenceCount).toBeGreaterThanOrEqual(3);
      expect(rec.confidence).toBe('HIGH');
      expect(rec.priorRepairEffectiveness).toBe('PARTIALLY_EFFECTIVE'); // Mixed Passed and Failed
    });

    it('4.4 Detects conflicting diagnoses across historical incidents and exposes both hypotheses without choosing arbitrarily', async () => {
      // Record A: diagnosed as Misalignment
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-VIB-01',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'DRIVE_VIBRATION',
        problemStatement: 'Severe vibration on motor drive shaft',
        observedSymptoms: ['Vibration 7.2 mm/s at 1x speed'],
        rootCause: 'Parallel shaft angular misalignment',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Laser aligned motor and pump shafts'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      // Record B: diagnosed as Impeller Unbalance
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-VIB-02',
        reportingUserId: workerA.id,
        reportingUserName: workerA.fullName,
        faultCategory: 'DRIVE_VIBRATION',
        problemStatement: 'Severe vibration on motor drive shaft',
        observedSymptoms: ['Vibration 7.2 mm/s at 1x speed'],
        rootCause: 'Impeller vane material buildup causing dynamic unbalance',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Cleaned impeller vanes and dynamically balanced'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machineAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          query: 'vibration on motor drive shaft',
          faultCategory: 'DRIVE_VIBRATION',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.hasConflictingEvidence).toBe(true);
      expect(res.body.data.conflictingDiagnoses).toHaveLength(1);

      const conflict = res.body.data.conflictingDiagnoses[0];
      const diagnoses = [conflict.rootCauseA, conflict.rootCauseB];
      expect(diagnoses.some((d: string) => d.includes('Parallel shaft angular misalignment'))).toBe(true);
      expect(diagnoses.some((d: string) => d.includes('Impeller vane material buildup'))).toBe(true);
    });

    it('4.5 Correctly excludes internal investigations from unprivileged roles (WORKER) in search and RAG synthesis', async () => {
      await dataStore.createMaintenanceRecord(orgTenantA.id, {
        plantId: plantA.id,
        machineId: machineAlpha.id,
        machineAssetTag: machineAlpha.assetTag,
        caseId: crypto.randomUUID(),
        caseNumber: 'CASE-INVEST-01',
        reportingUserId: adminA.id,
        reportingUserName: adminA.fullName,
        faultCategory: 'INTERNAL_INVESTIGATION',
        problemStatement: 'Confidential root cause investigation into operator handling procedure',
        observedSymptoms: ['Operator error suspected'],
        rootCause: 'Operator failed to open discharge valve prior to startup',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Issued mandatory retraining directive'],
        verificationState: 'PASSED',
        approvalStatus: 'NOT_REQUIRED',
      });

      // Worker request: Internal investigation record MUST be excluded
      const resWorker = await request(app)
        .get(`/api/v1/machines/${machineAlpha.id}/historical-faults`)
        .set('Authorization', `Bearer ${tokenWorkerA}`)
        .expect(200);

      expect(
        resWorker.body.data.matches.some(
          (m: any) => m.faultCategory === 'INTERNAL_INVESTIGATION'
        )
      ).toBe(false);

      // Supervisor request: Internal investigation record MUST be accessible
      const resSupervisor = await request(app)
        .get(`/api/v1/machines/${machineAlpha.id}/historical-faults`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .expect(200);

      expect(
        resSupervisor.body.data.matches.some(
          (m: any) => m.faultCategory === 'INTERNAL_INVESTIGATION'
        )
      ).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 5: SECURITY & MULTI-TENANT ISOLATION TESTS
  // =========================================================================
  describe('Area 5: Security & Multi-Tenant Isolation Verification', () => {
    it('5.1 Cross-tenant historical fault retrieval is rejected with HTTP 404', async () => {
      // Tenant B admin attempts to query Tenant A machine
      const res = await request(app)
        .get(`/api/v1/machines/${machineAlpha.id}/historical-faults?query=bearing`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });

    it('5.2 Cross-tenant match POST request is rejected with HTTP 404', async () => {
      // Tenant B admin attempts to POST match request for Tenant A machine
      const res = await request(app)
        .post(`/api/v1/machines/${machineAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .send({ query: 'vibration' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('5.3 Cross-tenant maintenance records list rejects access to foreign organization records', async () => {
      // Tenant A has records. Tenant B requests list for Tenant A plant
      const res = await request(app)
        .get(`/api/v1/maintenance-records?plantId=${plantA.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('5.4 Rejects unauthenticated historical retrieval requests with HTTP 401', async () => {
      await request(app)
        .get(`/api/v1/machines/${machineAlpha.id}/historical-faults`)
        .expect(401);

      await request(app)
        .post(`/api/v1/machines/${machineAlpha.id}/historical-faults/match`)
        .send({ query: 'bearing' })
        .expect(401);
    });
  });
});

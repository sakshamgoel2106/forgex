import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../src/app.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import { LocalDevVisionAdapter } from '../src/ai/localDevVisionAdapter.js';
import { VisualIntelligenceEngine } from '../src/services/visualIntelligenceEngine.js';
import { MaintenanceWorkflowEngine } from '../src/services/maintenanceWorkflowEngine.js';
import { RateLimiterService } from '../src/middleware/rateLimiter.middleware.js';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

describe('Prompt 13: Work Orders & Maintenance History Integration', () => {
  let app: Application;
  let authAdapter: LocalDevAuthAdapter;
  let dataStore: InMemoryDataStore;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let ingestionQueue: IngestionQueue;
  let generationProvider: LocalDevInferenceAdapter;
  let rerankingProvider: ReciprocalRankFusionReranker;
  let ragEngine: RAGQueryEngine;
  let visionProvider: LocalDevVisionAdapter;
  let visualEngine: VisualIntelligenceEngine;
  let maintenanceEngine: MaintenanceWorkflowEngine;

  // Tenant Fixtures
  let orgA: any;
  let orgB: any;
  let userAdminA: any;
  let userSupervisorA: any;
  let userEngineerA: any;
  let userTechA: any;
  let userWorkerA: any;
  let userAdminB: any;
  let plantA: any;
  let plantB: any;
  let machinePumpA: any;
  let machineCompressorA: any;
  let machineOrgB: any;

  let tokenAdminA: string;
  let tokenSupervisorA: string;
  let tokenEngineerA: string;
  let tokenTechA: string;
  let tokenWorkerA: string;
  let tokenAdminB: string;
  const jwtSecret = 'test_jwt_secret_for_maintenance_p13';

  beforeEach(async () => {
    RateLimiterService.reset();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();

    const tempUploadDir = path.join(os.tmpdir(), `forgex-wo-hist-test-${crypto.randomUUID()}`);
    storageAdapter = new LocalStorageAdapter(tempUploadDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-maint-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    generationProvider = new LocalDevInferenceAdapter('forgex-local-test-model');
    rerankingProvider = new ReciprocalRankFusionReranker(60);

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider
    );

    visionProvider = new LocalDevVisionAdapter();
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

    // Setup Org A
    orgA = await dataStore.createOrganization({
      name: 'Turbine Corp Org A',
      slug: 'turbine-corp-' + crypto.randomUUID().substring(0, 8),
    });

    userAdminA = await dataStore.createUser({
      externalAuthId: 'ext_admin_a',
      email: `admin-a-${crypto.randomUUID().substring(0, 6)}@turborg.com`,
      fullName: 'Alice Administrator',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userAdminA.id,
      role: 'ORGANIZATION_ADMIN',
    });

    userSupervisorA = await dataStore.createUser({
      externalAuthId: 'ext_super_a',
      email: `supervisor-a-${crypto.randomUUID().substring(0, 6)}@turborg.com`,
      fullName: 'Sam Supervisor',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userSupervisorA.id,
      role: 'SUPERVISOR',
    });

    userEngineerA = await dataStore.createUser({
      externalAuthId: 'ext_eng_a',
      email: `engineer-a-${crypto.randomUUID().substring(0, 6)}@turborg.com`,
      fullName: 'Evan Engineer',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngineerA.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    userTechA = await dataStore.createUser({
      externalAuthId: 'ext_tech_a',
      email: `tech-a-${crypto.randomUUID().substring(0, 6)}@turborg.com`,
      fullName: 'Tom Technician',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userTechA.id,
      role: 'TECHNICIAN',
    });

    userWorkerA = await dataStore.createUser({
      externalAuthId: 'ext_worker_a',
      email: `worker-a-${crypto.randomUUID().substring(0, 6)}@turborg.com`,
      fullName: 'Will Worker',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userWorkerA.id,
      role: 'WORKER',
    });

    // Setup Org B
    orgB = await dataStore.createOrganization({
      name: 'Rival Plant Org B',
      slug: 'rival-plant-' + crypto.randomUUID().substring(0, 8),
    });

    userAdminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: `admin-b-${crypto.randomUUID().substring(0, 6)}@rivalorg.com`,
      fullName: 'Bob Rival Admin',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userAdminB.id,
      role: 'ORGANIZATION_ADMIN',
    });

    // Plants & Machines (Assets)
    plantA = await dataStore.createPlant(orgA.id, {
      name: 'Main Assembly Plant A',
      code: 'PLANT-TX-01',
      location: 'Houston, TX',
    });

    plantB = await dataStore.createPlant(orgB.id, {
      name: 'Competitor Plant B',
      code: 'PLANT-OH-02',
      location: 'Columbus, OH',
    });

    machinePumpA = await dataStore.createAsset(orgA.id, {
      plantId: plantA.id,
      assetTag: 'PUMP-101-A',
      name: 'Centrifugal Slurry Feed Pump A',
      area: 'Process Unit 1',
      manufacturer: 'Flowserve',
      modelNumber: 'Durco Mark 3',
      serialNumber: 'SN-PUMP-001',
      operationalState: 'OPTIMAL',
    });

    machineCompressorA = await dataStore.createAsset(orgA.id, {
      plantId: plantA.id,
      assetTag: 'CMP-202-A',
      name: 'Reciprocating Air Compressor A',
      area: 'Process Unit 2',
      manufacturer: 'Atlas Copco',
      modelNumber: 'GA-75',
      serialNumber: 'SN-CMP-002',
      operationalState: 'OPTIMAL',
    });

    machineOrgB = await dataStore.createAsset(orgB.id, {
      plantId: plantB.id,
      assetTag: 'PUMP-999-B',
      name: 'Competitor Pump B',
      area: 'Competitor Unit 1',
      manufacturer: 'Sulzer',
      modelNumber: 'AHLSTAR',
      serialNumber: 'SN-PUMP-999',
      operationalState: 'OPTIMAL',
    });

    // Tokens
    tokenAdminA = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminA.externalAuthId, email: userAdminA.email, emailVerified: true },
      jwtSecret
    );

    tokenSupervisorA = LocalDevAuthAdapter.generateDevToken(
      { id: userSupervisorA.externalAuthId, email: userSupervisorA.email, emailVerified: true },
      jwtSecret
    );

    tokenEngineerA = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerA.externalAuthId, email: userEngineerA.email, emailVerified: true },
      jwtSecret
    );

    tokenTechA = LocalDevAuthAdapter.generateDevToken(
      { id: userTechA.externalAuthId, email: userTechA.email, emailVerified: true },
      jwtSecret
    );

    tokenWorkerA = LocalDevAuthAdapter.generateDevToken(
      { id: userWorkerA.externalAuthId, email: userWorkerA.email, emailVerified: true },
      jwtSecret
    );

    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB.externalAuthId, email: userAdminB.email, emailVerified: true },
      jwtSecret
    );
  });

  // ==========================================================================
  // 1. COMPLETION TO HISTORY CREATION & LINKING
  // ==========================================================================
  describe('1. Work Order Completion to Maintenance History Creation', () => {
    it('automatically generates and links an audited MaintenanceRecord when a work order is approved', async () => {
      // Create work order
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'High Bearing Vibration & Overheat',
          symptomDescription: 'Audible vibration exceeding 7.2 mm/s RMS on drive-end bearing with temperature 88°C.',
          severity: 'HIGH',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });

      expect(createRes.status).toBe(201);
      const caseId = createRes.body.data.id;
      const caseNumber = createRes.body.data.caseNumber;

      // Move to IN_PROGRESS
      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      // Record findings and submit for approval
      const findingsRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          observations: 'Drive-end bearing grease degraded; cage exhibits severe micro-pitting.',
          correctiveActions: 'Flushed housing, installed new SKF 6312-2Z deep groove ball bearing, aligned shaft with laser system to 0.03mm tolerance.',
          resolutionSummary: 'Bearing replacement and precision alignment successfully brought vibration down to 1.8 mm/s.',
          partsUsed: [
            { partNumber: 'SKF-6312-2Z', description: 'Deep Groove Radial Ball Bearing', quantity: 1 },
            { partNumber: 'MOBIL-POLY-EM', description: 'Polyrex EM Synthetic Grease 400g', quantity: 1 },
          ],
        });
      expect(findingsRes.status).toBe(200);
      expect(findingsRes.body.data.status).toBe('PENDING_APPROVAL');

      // Supervisor approves the work order
      const approveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({
          approved: true,
          reviewerNotes: 'Verified vibration report post-run. Vibration within Class 1 ISO tolerances (1.8 mm/s). Approved.',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.status).toBe('RESOLVED');
      expect(approveRes.body.data.resolvedAt).toBeDefined();

      const linkedRecordId = approveRes.body.data.maintenanceRecordId;
      expect(linkedRecordId).toBeDefined();
      expect(typeof linkedRecordId).toBe('string');

      // Verify the persisted MaintenanceRecord via Maintenance History API
      const historyRes = await request(app)
        .get(`/api/v1/maintenance-records/${linkedRecordId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.success).toBe(true);
      const record = historyRes.body.data;

      // 2. Machine association
      expect(record.machineId).toBe(machinePumpA.id);
      expect(record.machineAssetTag).toBe(machinePumpA.assetTag);
      expect(record.plantId).toBe(plantA.id);

      // 3. Work Order association
      expect(record.caseId).toBe(caseId);
      expect(record.caseNumber).toBe(caseNumber);

      // Verified technician identity
      expect(record.resolvingTechnicianUserId).toBe(userTechA.id);
      expect(record.resolvingTechnicianName).toBe(userTechA.fullName);

      // Verified resolution content
      expect(record.repairActions).toContain(
        'Flushed housing, installed new SKF 6312-2Z deep groove ball bearing, aligned shaft with laser system to 0.03mm tolerance.'
      );
      expect(record.partsReplaced.length).toBe(2);
      expect(record.partsReplaced[0].partNumber).toBe('SKF-6312-2Z');
      expect(record.approvalStatus).toBe('APPROVED');
      expect(record.approvedByUserId).toBe(userSupervisorA.id);
      expect(record.approvalNotes).toContain('Verified vibration report');
    });

    it('creates and links MaintenanceRecord when work order transitions to RESOLVED via status endpoint', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machineCompressorA.id,
          title: 'Intake Valve Air Leak',
          symptomDescription: 'Compressed air pressure drop across header; hiss audible at stage 1 intake valve.',
          severity: 'MEDIUM',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });
      const caseId = createRes.body.data.id;

      // Move to IN_PROGRESS
      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      // Move to PENDING_APPROVAL with findings
      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          status: 'PENDING_APPROVAL',
          notes: 'Replaced PTFE valve seat gasket and torqued manifold bolts to 45 Nm.',
        });

      // Supervisor resolves via status endpoint
      const resolveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({
          status: 'RESOLVED',
          notes: 'Pressure decay test held 7.5 bar for 15 minutes. Hydrostatic seal verified.',
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe('RESOLVED');
      expect(resolveRes.body.data.maintenanceRecordId).toBeDefined();

      const recordId = resolveRes.body.data.maintenanceRecordId;
      const getRecord = await request(app)
        .get(`/api/v1/maintenance-records/${recordId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(getRecord.status).toBe(200);
      expect(getRecord.body.data.caseId).toBe(caseId);
      expect(getRecord.body.data.machineId).toBe(machineCompressorA.id);
      expect(getRecord.body.data.machineAssetTag).toBe('CMP-202-A');
    });
  });

  // ==========================================================================
  // 2. NO FABRICATION WITHOUT RESOLUTION DETAILS
  // ==========================================================================
  describe('2. Missing Resolution Details Enforcement', () => {
    it('rejects transitioning to PENDING_APPROVAL or RESOLVED without recorded resolution details or notes', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Empty Case Without Actions',
          symptomDescription: 'Testing validation when no repair details exist.',
        });
      const caseId = createRes.body.data.id;

      // Move to IN_PROGRESS
      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ status: 'IN_PROGRESS' });

      // Attempt to move to PENDING_APPROVAL with empty notes and zero findings -> 400
      const invalidPending = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ status: 'PENDING_APPROVAL', notes: '   ' });

      expect(invalidPending.status).toBe(400);
      expect(invalidPending.body.error).toContain('resolution details');

      // Verify no maintenance record was generated
      const caseCheck = await request(app)
        .get(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      const caseDetails = caseCheck.body.data.caseData || caseCheck.body.data;
      expect(caseDetails.maintenanceRecordId).toBeFalsy();
    });

    it('rejects direct illegal transition from REPORTED to RESOLVED', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Direct Resolve Bypass Attempt',
          symptomDescription: 'Attempting to skip investigation and work execution.',
        });
      const caseId = createRes.body.data.id;

      const directResolve = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ status: 'RESOLVED', notes: 'Bypassing required steps' });

      expect(directResolve.status).toBe(400);
      expect(directResolve.body.error).toContain('Invalid state transition');
    });
  });

  // ==========================================================================
  // 3. IDEMPOTENCY & DUPLICATE PREVENTION
  // ==========================================================================
  describe('3. Idempotency & Duplicate Prevention', () => {
    it('returns existing record idempotently on repeated approval requests without creating duplicates', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Idempotency Verification Case',
          symptomDescription: 'Testing repeated network completion requests.',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });
      const caseId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          correctiveActions: 'Adjusted mechanical seal packing gland nuts by 1/4 turn.',
          resolutionSummary: 'Leakage stopped completely.',
        });

      // First approval
      const firstApprove = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ approved: true, reviewerNotes: 'Verified no drips.' });

      expect(firstApprove.status).toBe(200);
      const firstRecordId = firstApprove.body.data.maintenanceRecordId;
      expect(firstRecordId).toBeDefined();

      // Second approval (e.g. network retry / duplicate click)
      const secondApprove = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ approved: true, reviewerNotes: 'Verified no drips.' });

      expect(secondApprove.status).toBe(200);
      expect(secondApprove.body.data.maintenanceRecordId).toBe(firstRecordId);

      // Verify only ONE maintenance record exists for this machine and case
      const recordsList = await request(app)
        .get(`/api/v1/maintenance-records?caseId=${caseId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(recordsList.status).toBe(200);
      expect(recordsList.body.data.length).toBe(1);
      expect(recordsList.body.data[0].id).toBe(firstRecordId);
    });

    it('safely handles concurrent approval attempts without creating duplicate history records', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Concurrent Approval Case',
          symptomDescription: 'Testing parallel approval requests.',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });
      const caseId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          correctiveActions: 'Lubricated drive bearings.',
          resolutionSummary: 'Smooth operation restored.',
        });

      // Execute 3 simultaneous approval calls in parallel
      const [res1, res2, res3] = await Promise.all([
        request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/approval`)
          .set('Authorization', `Bearer ${tokenSupervisorA}`)
          .send({ approved: true, reviewerNotes: 'Concurrent check 1' }),
        request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/approval`)
          .set('Authorization', `Bearer ${tokenSupervisorA}`)
          .send({ approved: true, reviewerNotes: 'Concurrent check 2' }),
        request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/approval`)
          .set('Authorization', `Bearer ${tokenSupervisorA}`)
          .send({ approved: true, reviewerNotes: 'Concurrent check 3' }),
      ]);

      const successResponses = [res1, res2, res3].filter((r) => r.status === 200);
      expect(successResponses.length).toBeGreaterThanOrEqual(1);

      // Verify that in the database, exactly ONE maintenance record exists for this case
      const recordsList = await request(app)
        .get(`/api/v1/maintenance-records?caseId=${caseId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(recordsList.body.data.length).toBe(1);
    });
  });

  // ==========================================================================
  // 4. CROSS-TENANT ISOLATION & AUTHORIZATION
  // ==========================================================================
  describe('4. Cross-Tenant Isolation & Authorization', () => {
    it('rejects cross-tenant work order creation and completion attempts', async () => {
      // Org A user trying to create a case for Org B machine -> 400
      const crossCreate = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machineOrgB.id,
          title: 'Cross Tenant Case',
          symptomDescription: 'Attempting to target competitor machine.',
        });
      expect(crossCreate.status).toBe(400);
      expect(crossCreate.body.error).toContain('does not belong to organization');

      // Org B user trying to query Org A records via caseId -> 404
      const orgACase = await dataStore.createMaintenanceCase({
        organizationId: orgA.id,
        plantId: plantA.id,
        assetId: machinePumpA.id,
        title: 'Org A Confidential Repair',
        symptomDescription: 'Confidential machinery repair.',
        reportedByUserId: userAdminA.id,
      });

      const crossHistory = await request(app)
        .get(`/api/v1/maintenance-records?caseId=${orgACase.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(crossHistory.status).toBe(404);
      expect(crossHistory.body.error).toContain('not found in this organization');
    });

    it('forbids WORKER role from approving work orders or resolving cases', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Worker RBAC Test',
          symptomDescription: 'Testing that workers cannot approve work orders.',
        });
      const caseId = createRes.body.data.id;

      const workerApprove = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenWorkerA}`)
        .send({ approved: true });

      expect(workerApprove.status).toBe(403);
    });
  });

  // ==========================================================================
  // 5. DUAL-WORKFLOW: TICKET-LINKED CASE SYNCHRONIZATION
  // ==========================================================================
  describe('5. Source Specialist Ticket Synchronization on Case Completion', () => {
    it('automatically resolves the underlying source ticket when a linked work order is completed', async () => {
      // 1. Create specialist ticket
      const ticket = await dataStore.createSpecialistTicket(orgA.id, {
        plantId: plantA.id,
        machineId: machinePumpA.id,
        machineAssetTag: machinePumpA.assetTag,
        reportedByUserId: userAdminA.id,
        originalQuestion: 'Specialist investigation: excessive cavitational noise in impeller casing.',
        severity: 'HIGH',
      });

      // 2. Create work order linked to this ticket
      const caseRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Pump Casing Cavitation Overhaul',
          symptomDescription: 'Cavitation erosion pitting impeller vanes.',
          severity: 'HIGH',
          sourceTicketId: ticket.id,
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });

      expect(caseRes.status).toBe(201);
      const caseId = caseRes.body.data.id;

      // 3. Complete work order
      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          correctiveActions: 'Replaced cavitation-damaged 316SS impeller with CD4MCu duplex stainless steel impeller; calibrated suction NPSHa.',
          resolutionSummary: 'Cavitation noise eliminated; pump discharge pressure restored to 6.2 bar.',
        });

      const approveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ approved: true, reviewerNotes: 'Laser alignment and hydro-test verified. Approved.' });

      expect(approveRes.status).toBe(200);
      const recordId = approveRes.body.data.maintenanceRecordId;
      expect(recordId).toBeDefined();

      // 4. Verify source ticket was automatically synchronized
      const updatedTicket = await dataStore.getSpecialistTicketById(orgA.id, ticket.id);
      expect(updatedTicket).toBeDefined();
      expect(updatedTicket!.status).toBe('RESOLVED');
      expect(updatedTicket!.maintenanceRecordId).toBe(recordId);

      // 5. Verify the maintenance record references both the case and ticket
      const recordRes = await request(app)
        .get(`/api/v1/maintenance-records/${recordId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(recordRes.status).toBe(200);
      expect(recordRes.body.data.caseId).toBe(caseId);
      expect(recordRes.body.data.ticketId).toBe(ticket.id);
    });
  });

  // ==========================================================================
  // 6. FORMAL CLOSURE SYNCHRONIZATION
  // ==========================================================================
  describe('6. Formal Case Closure Synchronization', () => {
    it('synchronizes formal closure notes to the linked maintenance record when work order is closed', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Closure Sync Verification',
          symptomDescription: 'Testing closure notes propagation.',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });
      const caseId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          correctiveActions: 'Tightened flange coupling.',
          resolutionSummary: 'Coupling tightened to spec.',
        });

      const approveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ approved: true, reviewerNotes: 'Resolved.' });

      const recordId = approveRes.body.data.maintenanceRecordId;

      // Formally close the case
      const closeRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/close`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ notes: 'Equipment verified during 48-hour continuous run without anomalies. Case formally closed.' });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('CLOSED');
      expect(closeRes.body.data.closedAt).toBeDefined();

      // Check maintenance record audit trail
      const recordRes = await request(app)
        .get(`/api/v1/maintenance-records/${recordId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(recordRes.status).toBe(200);
      const auditTrail = recordRes.body.data.auditTrail;
      expect(auditTrail.some((a: any) => a.notes?.includes('formally closed'))).toBe(true);
    });
  });

  // ==========================================================================
  // 7. FRESH DATABASE AND API READ CONSISTENCY
  // ==========================================================================
  describe('7. Fresh Database and API Read Consistency', () => {
    it('ensures consistent entity state across Work Orders, Maintenance History, and Machine Timeline', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          assetId: machinePumpA.id,
          title: 'Full Audit Trail Pump Overhaul',
          symptomDescription: 'Bearing overheating and mechanical seal leak.',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });
      const caseId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'IN_PROGRESS' });

      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          observations: 'Seal faces worn; bearing contaminated.',
          correctiveActions: 'Replaced seal and bearings.',
          resolutionSummary: 'Pump running quietly.',
        });

      const approveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenSupervisorA}`)
        .send({ approved: true, reviewerNotes: 'Approved.' });

      const recordId = approveRes.body.data.maintenanceRecordId;

      // 1. Fetch case from API
      const caseApi = await request(app)
        .get(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      const fetchedCaseData = caseApi.body.data.caseData || caseApi.body.data;
      expect(fetchedCaseData.maintenanceRecordId).toBe(recordId);

      // 2. Fetch record from API
      const recordApi = await request(app)
        .get(`/api/v1/maintenance-records/${recordId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(recordApi.body.data.caseId).toBe(caseId);
      expect(recordApi.body.data.machineId).toBe(machinePumpA.id);

      // 3. Query machine maintenance history list
      const machineHistory = await request(app)
        .get(`/api/v1/maintenance-records?machineId=${machinePumpA.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(machineHistory.body.data.some((r: any) => r.id === recordId)).toBe(true);

      // 4. Query machine maintenance history endpoint
      const directMachineHistory = await request(app)
        .get(`/api/v1/machines/${machinePumpA.id}/maintenance-history`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(directMachineHistory.body.data.some((r: any) => r.id === recordId)).toBe(true);
    });
  });
});

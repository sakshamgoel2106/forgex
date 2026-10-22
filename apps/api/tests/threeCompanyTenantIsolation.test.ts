import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
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
import { seedDemoFactory } from '../src/db/seedDemoFactory.js';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

describe('Master Prompt: Three-Company Multi-Tenant Isolation Verification', () => {
  const jwtSecret = 'test_secret_for_three_company_tenant_isolation_2026';
  let app: Application;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let ragEngine: RAGQueryEngine;

  // Companies
  let orgA: any; // ForgeX Demo Factory
  let orgB: any; // ForgeX Isolation Test B
  let orgC: any; // ForgeX Isolation Test C

  let plantA: any;
  let plantB: any;
  let plantC: any;

  // Users & Tokens
  let tokenOwnerA: string; // saksham1224151@jmit.ac.in (Org Admin in Org A)
  let tokenWorkerA: string; // worker.floor@forgex-demo.factory
  let tokenTechA: string; // tech.util@forgex-demo.factory
  let tokenAdminB: string; // admin@forgex-isolation-b.test
  let tokenAdminC: string; // admin@forgex-isolation-c.test

  let userOwnerA: any;
  let userAdminB: any;
  let userAdminC: any;

  // Assets & Records
  let machineA: any;
  let machineB: any;
  let machineC: any;
  let caseA: any;
  let caseB: any;
  let recordA: any;
  let recordB: any;
  let ticketA: any;
  let ticketB: any;

  beforeEach(async () => {
    RateLimiterService.reset();
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);

    const tempUploadDir = path.join(os.tmpdir(), `forgex-three-org-test-${crypto.randomUUID()}`);
    storageAdapter = new LocalStorageAdapter(tempUploadDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-three-org-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    const ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    const generationProvider = new LocalDevInferenceAdapter('forgex-local-test-model');
    const rerankingProvider = new ReciprocalRankFusionReranker(60);

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'forgex_knowledge'
    );

    const visionProvider = new LocalDevVisionAdapter();
    const visualEngine = new VisualIntelligenceEngine(dataStore, storageAdapter, visionProvider, ragEngine);
    const maintenanceEngine = new MaintenanceWorkflowEngine(dataStore, ragEngine, visualEngine);

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

    // 1. Pre-register project owner account to satisfy seeding precondition
    userOwnerA = await dataStore.createUser({
      externalAuthId: 'owner-pre-seed-id',
      email: 'saksham1224151@jmit.ac.in',
      fullName: 'Saksham Goel',
    });

    // 2. Execute deterministic multi-tenant seed
    const seedResult = await seedDemoFactory(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      'forgex_knowledge'
    );

    orgA = seedResult.organizations[0];
    orgB = seedResult.organizations[1];
    orgC = seedResult.organizations[2];

    plantA = (await dataStore.listPlants(orgA.id))[0];
    plantB = (await dataStore.listPlants(orgB.id))[0];
    plantC = (await dataStore.listPlants(orgC.id))[0];

    userAdminB = await dataStore.getUserByEmail('admin@forgex-isolation-b.test');
    userAdminC = await dataStore.getUserByEmail('admin@forgex-isolation-c.test');
    const userWorkerA = await dataStore.getUserByEmail('worker.floor@forgex-demo.factory');
    const userTechA = await dataStore.getUserByEmail('tech.util@forgex-demo.factory');

    // Generate tokens
    tokenOwnerA = LocalDevAuthAdapter.generateDevToken(
      { id: userOwnerA.externalAuthId, email: userOwnerA.email, emailVerified: true },
      jwtSecret
    );
    tokenWorkerA = LocalDevAuthAdapter.generateDevToken(
      { id: userWorkerA!.externalAuthId, email: userWorkerA!.email, emailVerified: true },
      jwtSecret
    );
    tokenTechA = LocalDevAuthAdapter.generateDevToken(
      { id: userTechA!.externalAuthId, email: userTechA!.email, emailVerified: true },
      jwtSecret
    );
    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB!.externalAuthId, email: userAdminB!.email, emailVerified: true },
      jwtSecret
    );
    tokenAdminC = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminC!.externalAuthId, email: userAdminC!.email, emailVerified: true },
      jwtSecret
    );

    // Retrieve fixture records for cross-tenant tests
    machineA = await dataStore.getMachineByAssetTag(orgA.id, 'PUMP-CENT-205');
    machineB = await dataStore.getMachineByAssetTag(orgB.id, 'ISOL-B-TURBINE-01');
    machineC = await dataStore.getMachineByAssetTag(orgC.id, 'ISOL-C-CHILLER-01');

    const casesA = await dataStore.listMaintenanceCases(orgA.id);
    caseA = casesA.find((c: any) => c.caseNumber === 'CASE-DEMO-001');

    // Create a Company B Work Order and Maintenance Record
    caseB = await dataStore.createMaintenanceCase({
      organizationId: orgB.id,
      plantId: plantB.id,
      assetId: machineB.id,
      caseNumber: 'CASE-ISOL-B-001',
      title: 'Company B Isolated Turbine Inspection',
      severity: 'HIGH',
      status: 'RESOLVED',
      reportedByUserId: userAdminB.id,
      symptomDescription: 'Proprietary Company B vibration on high-temp turbine.',
    });

    recordB = await dataStore.createMaintenanceRecord(orgB.id, {
      caseId: caseB.id,
      caseNumber: caseB.caseNumber,
      plantId: plantB.id,
      machineId: machineB.id,
      machineAssetTag: machineB.assetTag,
      reportingUserId: userAdminB.id,
      reportingUserName: userAdminB.fullName,
      resolvingTechnicianUserId: userAdminB.id,
      resolvingTechnicianName: userAdminB.fullName,
      faultCategory: 'TURBINE_BLADE_INSPECTION',
      problemStatement: 'Confidential Company B turbine blade thermal fatigue.',
      rootCause: 'High temp operation exceeds proprietary metallurgical limit.',
      rootCauseStatus: 'CONFIRMED',
      observedSymptoms: ['Thermal crack indication on Stage 1 bucket'],
      repairActions: ['Replaced Stage 1 nozzle vanes'],
      partsReplaced: [],
    });

    const recordsA = await dataStore.listMaintenanceRecords(orgA.id);
    recordA = recordsA[0];

    const ticketsA = await dataStore.listSpecialistTickets(orgA.id);
    ticketA = ticketsA[0];

    ticketB = await dataStore.createSpecialistTicket(orgB.id, {
      ticketNumber: 'TKT-ISOL-B-001',
      plantId: plantB.id,
      machineId: machineB.id,
      machineAssetTag: machineB.assetTag,
      reportedByUserId: userAdminB.id,
      originalQuestion: 'How to service proprietary Company B turbine nozzle?',
      diagnosticDetails: 'Secret Company B turbine telemetry.',
      escalationReason: 'PROPRIETARY_ENGINEERING_ESC',
      severity: 'HIGH',
      assignmentStatus: 'ASSIGNED',
      status: 'OPEN',
      assignedSpecialistUserId: userAdminB.id,
    });
  });

  // ==========================================================================
  // 1. WORK ORDER (MAINTENANCE CASES) ISOLATION ACROSS A, B, C
  // ==========================================================================
  describe('1. Work Order Multi-Tenant Isolation', () => {
    it('rejects Company A users from retrieving Company B Work Orders by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance/cases/${caseB.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects Company B users from retrieving Company A Work Orders by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance/cases/${caseA.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects Company A users from updating status of a Company B Work Order', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/cases/${caseB.id}/status`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ status: 'IN_PROGRESS' });

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects creating a Work Order in Company A referencing a Machine in Company B', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          assetId: machineB.id, // Belongs to Company B!
          title: 'Illegal Cross-Tenant Work Order Attempt',
          symptomDescription: 'Attempting to link competitor machine',
          severity: 'HIGH',
        });

      expect([400, 403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // 2. MAINTENANCE HISTORY & PERSISTENT LEDGER ISOLATION
  // ==========================================================================
  describe('2. Maintenance History Multi-Tenant Isolation', () => {
    it('strictly isolates maintenance records list: Company A sees 0 Company B records', async () => {
      const res = await request(app)
        .get('/api/v1/maintenance-records')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const records = res.body.data;
      expect(records.length).toBeGreaterThan(0);
      for (const rec of records) {
        expect(rec.organizationId).toBe(orgA.id);
        expect(rec.organizationId).not.toBe(orgB.id);
        expect(rec.organizationId).not.toBe(orgC.id);
        expect(rec.machineAssetTag).not.toBe('ISOL-B-TURBINE-01');
      }
    });

    it('rejects Company A users from reading Company B maintenance records by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance-records/${recordB.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects Company C users from reading Company A maintenance records by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/maintenance-records/${recordA.id}`)
        .set('Authorization', `Bearer ${tokenAdminC}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects creating a maintenance record linking a resolving technician from another tenant', async () => {
      await expect(
        dataStore.createMaintenanceRecord(orgA.id, {
          caseId: caseA.id,
          caseNumber: caseA.caseNumber,
          plantId: caseA.plantId,
          machineId: machineA.id,
          machineAssetTag: machineA.assetTag,
          reportingUserId: userOwnerA.id,
          reportingUserName: userOwnerA.fullName,
          resolvingTechnicianUserId: userAdminB.id, // Cross-tenant technician!
          resolvingTechnicianName: userAdminB.fullName,
          faultCategory: 'ILLEGAL_CROSS_TENANT_ATTEMPT',
          problemStatement: 'Testing resolving technician tenant enforcement',
          rootCause: 'None',
          repairActions: ['Test repair action'],
        })
      ).rejects.toThrow(/Cross-tenant security violation/i);
    });
  });

  // ==========================================================================
  // 3. TECHNICIAN QUEUE & SPECIALIST TICKETS ISOLATION
  // ==========================================================================
  describe('3. Technician Queue & Specialist Tickets Isolation', () => {
    it('prevents Company A technicians from viewing Company B tickets', async () => {
      const res = await request(app)
        .get(`/api/v1/tickets/${ticketB.id}`)
        .set('Authorization', `Bearer ${tokenTechA}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('prevents Company B admins from resolving Company A tickets', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${ticketA.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .send({
          technicianObservations: 'Unauthorized resolution attempt',
          diagnosisOutcome: 'Unauthorized diagnosis',
          repairOutcome: 'Unauthorized repair',
          status: 'RESOLVED',
        });

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('lists only tickets belonging to caller organization', async () => {
      const resA = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(resA.status).toBe(200);
      const ticketsA = resA.body.data;
      expect(ticketsA.length).toBeGreaterThan(0);
      expect(ticketsA.some((t: any) => t.ticketNumber === 'TKT-ISOL-B-001')).toBe(false);

      const resB = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(resB.status).toBe(200);
      const ticketsB = resB.body.data;
      expect(ticketsB.some((t: any) => t.ticketNumber === 'TKT-ISOL-B-001')).toBe(true);
      expect(ticketsB.some((t: any) => t.ticketNumber === 'TKT-DEMO-001')).toBe(false);
    });
  });

  // ==========================================================================
  // 4. VECTOR DATABASE & RAG ISOLATION WITH CANARY PHRASES
  // ==========================================================================
  describe('4. Vector Database & RAG Semantic Isolation', () => {
    it('prevents Company A RAG query from leaking Company B trade secret canary', async () => {
      const queryResult = await ragEngine.query(
        { query: 'What is the proprietary catalyst synthesis ratio?', plantId: plantA.id },
        { organizationId: orgA.id, userId: userOwnerA.id, userRole: 'ORGANIZATION_ADMIN' }
      );

      // Must not leak Company B's confidential synthesis ratio
      expect(queryResult.assistantMessage.content).not.toContain('3.42 to 1');
      expect(queryResult.assistantMessage.content).not.toContain('CANARY_CONFIDENTIAL_CORP_B');
      expect(queryResult.assistantMessage.citations.every((c: any) => c.documentNumber !== 'SOP-ISOL-B-SECRET-999')).toBe(true);
    });

    it('prevents Company A RAG query from leaking Company C nuclear coolant canary', async () => {
      const queryResult = await ragEngine.query(
        { query: 'What are the cryogenic sub-cooling secondary loop pressure limits?', plantId: plantA.id },
        { organizationId: orgA.id, userId: userOwnerA.id, userRole: 'ORGANIZATION_ADMIN' }
      );

      // Must not leak Company C's confidential pressure limit
      expect(queryResult.assistantMessage.content).not.toContain('4.12 bar');
      expect(queryResult.assistantMessage.content).not.toContain('CANARY_CONFIDENTIAL_CORP_C');
      expect(queryResult.assistantMessage.citations.every((c: any) => c.documentNumber !== 'SOP-ISOL-C-SECRET-888')).toBe(true);
    });

    it('allows Company B authorized user to retrieve their own proprietary document', async () => {
      const queryResult = await ragEngine.query(
        { query: 'What is the proprietary catalyst synthesis ratio for SOP-ISOL-B-SECRET-999?', plantId: plantB.id },
        { organizationId: orgB.id, userId: userAdminB.id, userRole: 'ORGANIZATION_ADMIN' }
      );

      expect(queryResult.assistantMessage.content).toContain('3.42 to 1');
      expect(queryResult.assistantMessage.citations.some((c: any) => c.documentNumber === 'SOP-ISOL-B-SECRET-999')).toBe(true);
    });

    it('prevents Company B user from accessing Company A pump manual SOP-FS-205', async () => {
      const queryResult = await ragEngine.query(
        { query: 'What are the mechanical seal barrier fluid specifications for SOP-FS-205?', plantId: plantB.id },
        { organizationId: orgB.id, userId: userAdminB.id, userRole: 'ORGANIZATION_ADMIN' }
      );

      expect(queryResult.assistantMessage.content).not.toContain('185 ft-lbs');
      expect(queryResult.assistantMessage.citations.every((c: any) => c.documentNumber !== 'SOP-FS-205')).toBe(true);
    });
  });

  // ==========================================================================
  // 5. CLIENT FORGERY & MACHINE REGISTRY ISOLATION
  // ==========================================================================
  describe('5. Client Forgery Prevention & Machinery Scope', () => {
    it('blocks forged client organization header and protects tenant boundary', async () => {
      // Company A user attempts to forge header "x-organization-id: orgB.id"
      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('x-organization-id', orgB.id);

      // Server detects user is not a member of orgB and strictly returns 403 Forbidden with TENANT_MISMATCH
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_TENANT_MISMATCH');
    });

    it('strictly confines Worker Workspace to Company A machines', async () => {
      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenWorkerA}`);

      expect(res.status).toBe(200);
      const assets = res.body.data;
      expect(assets.length).toBeGreaterThanOrEqual(10);
      expect(assets.some((a: any) => a.assetTag === 'ISOL-B-TURBINE-01')).toBe(false);
      expect(assets.some((a: any) => a.assetTag === 'ISOL-C-CHILLER-01')).toBe(false);
    });

    it('rejects direct retrieval of 3D CAD model across tenant boundary', async () => {
      const res = await request(app)
        .get(`/api/v1/engineering/machines/${machineA.id}/3d-model`)
        .set('Authorization', `Bearer ${tokenAdminB}`); // Company B user requests Company A model

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FORGEX_MACHINE_NOT_FOUND');
    });
  });
});

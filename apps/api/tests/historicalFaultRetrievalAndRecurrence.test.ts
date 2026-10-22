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
import { HistoricalFaultService } from '../src/services/historicalFaultService.js';
import { RateLimiterService } from '../src/middleware/rateLimiter.middleware.js';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

describe('Prompt 14: Historical Fault Retrieval & Recurring Problem Detection', () => {
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
  let historicalFaultService: HistoricalFaultService;

  // Organizations
  let orgAlpha: any;
  let orgBeta: any;

  // Plants
  let plantAlpha: any;
  let plantBeta: any;

  // Users
  let userAdminAlpha: any;
  let userEngineerAlpha: any;
  let userTechAlpha: any;
  let userWorkerAlpha: any;
  let userAdminBeta: any;

  // Tokens
  let tokenAdminAlpha: string;
  let tokenEngineerAlpha: string;
  let tokenTechAlpha: string;
  let tokenWorkerAlpha: string;
  let tokenAdminBeta: string;

  // Machines
  let machinePumpAlpha: any;
  let machineCompressorAlpha: any;
  let machinePumpBeta: any;

  const jwtSecret = 'test_jwt_secret_for_historical_fault_p14';

  beforeEach(async () => {
    RateLimiterService.reset();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();

    const tempUploadDir = path.join(os.tmpdir(), `forgex-hist-test-${crypto.randomUUID()}`);
    storageAdapter = new LocalStorageAdapter(tempUploadDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-hist-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    generationProvider = new LocalDevInferenceAdapter('forgex-local-test-model');
    rerankingProvider = new ReciprocalRankFusionReranker(60);

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

    // 1. Setup Organizations
    orgAlpha = await dataStore.createOrganization({
      name: 'Alpha Petrochemical Corp',
      slug: 'alpha-petro-' + crypto.randomUUID().substring(0, 8),
    });

    orgBeta = await dataStore.createOrganization({
      name: 'Beta Refining Corp',
      slug: 'beta-refine-' + crypto.randomUUID().substring(0, 8),
    });

    // 2. Setup Users in Org Alpha
    userAdminAlpha = await dataStore.createUser({
      externalAuthId: 'ext_admin_alpha',
      email: `admin-alpha-${crypto.randomUUID().substring(0, 6)}@alpha.org`,
      fullName: 'Alice Alpha Admin',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAdminAlpha.id,
      role: 'ORGANIZATION_ADMIN',
    });

    userEngineerAlpha = await dataStore.createUser({
      externalAuthId: 'ext_eng_alpha',
      email: `engineer-alpha-${crypto.randomUUID().substring(0, 6)}@alpha.org`,
      fullName: 'Ethan Engineer Alpha',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userEngineerAlpha.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    userTechAlpha = await dataStore.createUser({
      externalAuthId: 'ext_tech_alpha',
      email: `tech-alpha-${crypto.randomUUID().substring(0, 6)}@alpha.org`,
      fullName: 'Tyler Technician Alpha',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userTechAlpha.id,
      role: 'TECHNICIAN',
    });

    userWorkerAlpha = await dataStore.createUser({
      externalAuthId: 'ext_worker_alpha',
      email: `worker-alpha-${crypto.randomUUID().substring(0, 6)}@alpha.org`,
      fullName: 'Wanda Worker Alpha',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userWorkerAlpha.id,
      role: 'WORKER',
    });

    // 3. Setup User in Org Beta
    userAdminBeta = await dataStore.createUser({
      externalAuthId: 'ext_admin_beta',
      email: `admin-beta-${crypto.randomUUID().substring(0, 6)}@beta.org`,
      fullName: 'Bob Beta Admin',
    });
    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userAdminBeta.id,
      role: 'ORGANIZATION_ADMIN',
    });

    // 4. Setup Plants
    plantAlpha = await dataStore.createPlant(orgAlpha.id, {
      name: 'Alpha Olefins Plant 1',
      code: 'PLANT-ALPHA-01',
      location: 'Deer Park, TX',
    });

    plantBeta = await dataStore.createPlant(orgBeta.id, {
      name: 'Beta Unit 2',
      code: 'PLANT-BETA-02',
      location: 'Baton Rouge, LA',
    });

    // 5. Setup Machines
    machinePumpAlpha = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'PUMP-101-SLURRY',
      name: 'Primary Slurry Feed Centrifugal Pump',
      machineType: 'CENTRIFUGAL_PUMP',
      area: 'Process Train 1',
      criticality: 'CRITICAL',
      operationalState: 'OPERATIONAL',
    });

    machineCompressorAlpha = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'CMP-202-GAS',
      name: 'Multi-Stage Gas Compressor 2',
      machineType: 'COMPRESSOR',
      area: 'Gas Recovery',
      criticality: 'HIGH',
      operationalState: 'OPERATIONAL',
    });

    machinePumpBeta = await dataStore.createMachine(orgBeta.id, {
      plantId: plantBeta.id,
      assetTag: 'PUMP-BETA-777',
      name: 'Competitor Acid Transfer Pump',
      machineType: 'CENTRIFUGAL_PUMP',
      area: 'Acid Storage',
      criticality: 'HIGH',
      operationalState: 'OPERATIONAL',
    });

    // 6. Generate Tokens
    tokenAdminAlpha = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminAlpha.externalAuthId, email: userAdminAlpha.email, emailVerified: true },
      jwtSecret
    );
    tokenEngineerAlpha = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerAlpha.externalAuthId, email: userEngineerAlpha.email, emailVerified: true },
      jwtSecret
    );
    tokenTechAlpha = LocalDevAuthAdapter.generateDevToken(
      { id: userTechAlpha.externalAuthId, email: userTechAlpha.email, emailVerified: true },
      jwtSecret
    );
    tokenWorkerAlpha = LocalDevAuthAdapter.generateDevToken(
      { id: userWorkerAlpha.externalAuthId, email: userWorkerAlpha.email, emailVerified: true },
      jwtSecret
    );
    tokenAdminBeta = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminBeta.externalAuthId, email: userAdminBeta.email, emailVerified: true },
      jwtSecret
    );
  });

  // ==========================================================================
  // 1. MATCHING MACHINE HISTORICAL FAULT RETRIEVAL
  // ==========================================================================
  describe('1. Exact Machine Historical Fault Retrieval', () => {
    it('retrieves relevant historical faults for target machine with exact diagnosis, actions, and outcomes', async () => {
      // Seed historical record for machinePumpAlpha
      const rec = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-slurry-01',
        ticketNumber: 'TICK-SLURRY-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'MECHANICAL_SEAL_FAILURE',
        problemStatement: 'Severe slurry leakage from drive-side gland packing and audible grinding',
        observedSymptoms: ['Liquid leakage at shaft sleeve', 'Elevated gland temperature 76°C'],
        rootCause: 'Silicon carbide primary seal face fractured due to thermal shock',
        rootCauseStatus: 'CONFIRMED',
        repairActions: [
          'Isolated pump and performed lock-out/tag-out',
          'Removed damaged cartridge seal assembly',
          'Installed new John Crane 5610 cartridge mechanical seal',
          'Flushed seal buffer fluid lines and torqued gland studs to 40 Nm',
        ],
        partsReplaced: [
          { partNumber: 'JC-5610-250', description: 'Dual Cartridge Mechanical Seal', quantity: 1 },
        ],
        verificationState: 'PASSED',
        requiresRestartApproval: true,
        restartApproved: true,
      });

      // Retrieve via POST /api/v1/machines/:id/historical-faults/match
      const matchRes = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`)
        .send({
          query: 'slurry seal leakage and fractured face',
          faultCategory: 'MECHANICAL_SEAL_FAILURE',
        });

      expect(matchRes.status).toBe(200);
      expect(matchRes.body.success).toBe(true);
      const data = matchRes.body.data;

      expect(data.machineId).toBe(machinePumpAlpha.id);
      expect(data.matchedCount).toBe(1);
      const match = data.matches[0];
      expect(match.recordId).toBe(rec.id);
      expect(match.recordNumber).toBe(rec.recordNumber);
      expect(match.faultCategory).toBe('MECHANICAL_SEAL_FAILURE');
      expect(match.recordedDiagnosis).toBe('Silicon carbide primary seal face fractured due to thermal shock');
      expect(match.diagnosisStatus).toBe('CONFIRMED');
      expect(match.evidenceType).toBe('RECORDED_FACT');
      expect(match.recordedOutcome).toBe('PASSED');
      expect(match.priorRepairEffectiveness).toBe('EFFECTIVE');
      expect(match.matchScore).toBeGreaterThanOrEqual(0.65);
      expect(match.matchConfidence).toBe('HIGH');
      expect(match.matchReasons.some((r: string) => r.includes('EXACT_FAULT_CATEGORY'))).toBe(true);
    });

    it('retrieves similar historical records via GET /api/v1/maintenance-records/similar', async () => {
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressorAlpha.id,
        machineAssetTag: machineCompressorAlpha.assetTag,
        ticketId: 't-cmp-01',
        ticketNumber: 'TICK-CMP-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'VALVE_LEAKAGE',
        problemStatement: 'Discharge pressure drop across stage 2 header due to valve seat wear',
        observedSymptoms: ['Hissing sound at manifold', 'Interstage pressure 4.2 bar below target'],
        rootCause: 'PTFE valve plate cracked from cyclic fatigue',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced discharge valve assembly', 'Calibrated differential pressure sensor'],
        verificationState: 'PASSED',
      });

      const res = await request(app)
        .get(`/api/v1/maintenance-records/similar?machineId=${machineCompressorAlpha.id}&query=valve+seat+cracked&faultCategory=VALVE_LEAKAGE`)
        .set('Authorization', `Bearer ${tokenEngineerAlpha}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.matchedCount).toBe(1);
      expect(res.body.data.matches[0].machineAssetTag).toBe(machineCompressorAlpha.assetTag);
    });
  });

  // ==========================================================================
  // 2. UNRELATED MACHINE ISOLATION
  // ==========================================================================
  describe('2. Unrelated Machine and Strict Machine Boundary Isolation', () => {
    it('does not include records from unrelated machines in single-machine fault queries', async () => {
      // Pump record
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-pump-only',
        ticketNumber: 'TICK-PUMP-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Pump bearing hot 82C',
        rootCause: 'Grease dried',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Regreased'],
        verificationState: 'PASSED',
      });

      // Compressor record
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressorAlpha.id,
        machineAssetTag: machineCompressorAlpha.assetTag,
        ticketId: 't-cmp-only',
        ticketNumber: 'TICK-CMP-02',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Compressor bearing hot 88C',
        rootCause: 'Thrust bearing axial preload excessive',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Adjusted shims'],
        verificationState: 'PASSED',
      });

      // Query pump historical faults
      const pumpRes = await request(app)
        .get(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults?query=bearing+hot`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(pumpRes.status).toBe(200);
      expect(pumpRes.body.data.matches.every((m: any) => m.machineId === machinePumpAlpha.id)).toBe(true);
      expect(pumpRes.body.data.matches.some((m: any) => m.machineId === machineCompressorAlpha.id)).toBe(false);
    });
  });

  // ==========================================================================
  // 3. SIMILARITY SCORING & RELEVANCE RANKING
  // ==========================================================================
  describe('3. Similarity Matching & Keyword Scoring', () => {
    it('ranks records matching both fault category and mechanical symptoms higher than weakly matched records', async () => {
      // Record 1: Highly relevant (category + symptoms: bearing vibration + overheat)
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-high-rel',
        ticketNumber: 'TICK-HIGH-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_VIBRATION',
        problemStatement: 'High vibration 8.1 mm/s and drive end bearing overheat',
        observedSymptoms: ['Vibration spike at 1X rotational frequency', 'Bearing casing temp 84C'],
        rootCause: 'Inner ring flaking on SKF spherical roller bearing',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced drive-end bearing', 'Laser aligned coupling'],
        verificationState: 'PASSED',
      });

      // Record 2: Weak match (electrical junction box cover loose)
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-low-rel',
        ticketNumber: 'TICK-LOW-02',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'ELECTRICAL_ENCLOSURE',
        problemStatement: 'Junction box grounding screw loose',
        observedSymptoms: ['Minor grounding hum'],
        rootCause: 'Vibration loosened screw',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Tightened terminal screw with threadlocker'],
        verificationState: 'PASSED',
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenEngineerAlpha}`)
        .send({
          query: 'high vibration and drive end bearing overheat',
          faultCategory: 'BEARING_VIBRATION',
        });

      expect(res.status).toBe(200);
      const matches = res.body.data.matches;
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // Top match must be the highly relevant bearing vibration record
      expect(matches[0].faultCategory).toBe('BEARING_VIBRATION');
      expect(matches[0].matchScore).toBeGreaterThan(0.70);
      expect(matches[0].matchConfidence).toBe('HIGH');
    });

    it('does not confidently label weakly matched records', async () => {
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-paint',
        ticketNumber: 'TICK-PAINT-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'COSMETIC',
        problemStatement: 'Touch up epoxy primer on pump baseplate',
        rootCause: 'Environmental salt mist corrosion',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Applied zinc primer'],
        verificationState: 'PASSED',
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenEngineerAlpha}`)
        .send({
          query: 'shaft shear and severe turbine trip',
          minScore: 0.05,
        });

      expect(res.status).toBe(200);
      if (res.body.data.matches.length > 0) {
        expect(res.body.data.matches[0].matchConfidence).not.toBe('HIGH');
      }
    });
  });

  // ==========================================================================
  // 4. INSUFFICIENT EVIDENCE & SAFEGUARDING
  // ==========================================================================
  describe('4. Insufficient Evidence Safeguards', () => {
    it('returns INSUFFICIENT_HISTORY and normal baseline when no records exist', async () => {
      const res = await request(app)
        .get(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults?query=shaft+misalignment`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(res.status).toBe(200);
      expect(res.body.data.searchStatus).toBe('INSUFFICIENT_HISTORY');
      expect(res.body.data.matchedCount).toBe(0);
      expect(res.body.data.recurrenceAnalysis.isRecurringFault).toBe(false);
      expect(res.body.data.recurrenceAnalysis.confidence).toBe('INSUFFICIENT_DATA');
    });

    it('does NOT automatically declare single historical incident as a recurring fault', async () => {
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-single-01',
        ticketNumber: 'TICK-SINGLE-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'IMPELLER_CAVITATION',
        problemStatement: 'Impeller vane cavitation pitting',
        rootCause: 'Low suction head NPSHa',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Raised suction supply level by 1.2m'],
        verificationState: 'PASSED',
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`)
        .send({ faultCategory: 'IMPELLER_CAVITATION' });

      expect(res.status).toBe(200);
      expect(res.body.data.matchedCount).toBe(1);
      expect(res.body.data.recurrenceAnalysis.isRecurringFault).toBe(false);
      expect(res.body.data.recurrenceAnalysis.recurrenceCount).toBe(1);
    });
  });

  // ==========================================================================
  // 5. MULTIPLE RECORDED INCIDENTS & RECURRENCE INTERVALS
  // ==========================================================================
  describe('5. Recurrence Behavior, Time Intervals & Repair Effectiveness', () => {
    it('identifies recurrence, computes averageRecurrenceIntervalDays, and assesses prior repair effectiveness', async () => {
      // Incident 1: 20 days ago
      const date1 = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-rec-01',
        ticketNumber: 'TICK-REC-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Bearing temp 78C during sustained run',
        rootCause: 'Degraded synthetic grease',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Flushed housing and added 250g Mobilith SHC 100'],
        verificationState: 'PASSED',
        resolvedAt: date1,
      });

      // Incident 2: Today (recurred 20 days later!)
      const date2 = new Date().toISOString();
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-rec-02',
        ticketNumber: 'TICK-REC-02',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Bearing temp 85C again with grease breakdown',
        rootCause: 'Excessive thermal load from adjacent process piping',
        rootCauseStatus: 'SUSPECTED',
        repairActions: ['Installed thermal insulation shield on suction line'],
        verificationState: 'PASSED',
        resolvedAt: date2,
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`)
        .send({ faultCategory: 'BEARING_OVERHEATING' });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.matchedCount).toBe(2);

      const recurrence = data.recurrenceAnalysis;
      expect(recurrence.isRecurringFault).toBe(true);
      expect(recurrence.recurrenceCount).toBe(2);
      expect(recurrence.confidence).toBe('HIGH');
      expect(recurrence.averageRecurrenceIntervalDays).toBeDefined();
      expect(typeof recurrence.averageRecurrenceIntervalDays).toBe('number');
      expect(recurrence.averageRecurrenceIntervalDays).toBeGreaterThan(15);
      expect(recurrence.averageRecurrenceIntervalDays).toBeLessThan(25);
    });
  });

  // ==========================================================================
  // 6. MISSING DIAGNOSIS & OUTCOME HONESTY (NO FABRICATION)
  // ==========================================================================
  describe('6. Honest Representation of Missing Diagnosis & Outcomes', () => {
    it('honestly represents UNKNOWN root cause and UNVERIFIED outcomes without fabricating answers', async () => {
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-unknown-01',
        ticketNumber: 'TICK-UNK-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'INTERMITTENT_TRIP',
        problemStatement: 'Pump tripped out on overload relay intermittently',
        observedSymptoms: ['No visible mechanical binding'],
        rootCause: 'Root cause unknown after field bench test; awaiting laboratory oil analysis',
        rootCauseStatus: 'UNKNOWN',
        repairActions: ['Reset overload relay switch; monitored under no-load condition'],
        verificationState: 'PENDING',
      });

      const res = await request(app)
        .get(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults?query=intermittent+trip`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(res.status).toBe(200);
      const match = res.body.data.matches[0];
      expect(match.diagnosisStatus).toBe('UNKNOWN');
      expect(match.recordedDiagnosis).toContain('UNKNOWN');
      expect(match.evidenceType).toBe('UNCONFIRMED_HYPOTHESIS');
      expect(match.recordedOutcome).toBe('PENDING');
      expect(match.priorRepairEffectiveness).toBe('UNVERIFIED');
    });
  });

  // ==========================================================================
  // 7. SOURCE IDS & WORK ORDER REFERENCES PRESERVATION
  // ==========================================================================
  describe('7. Source IDs & Work Order Reference Retention', () => {
    it('preserves durable record IDs and links to originating Work Orders and tickets', async () => {
      const rec = await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machineCompressorAlpha.id,
        machineAssetTag: machineCompressorAlpha.assetTag,
        ticketId: 't-trace-01',
        ticketNumber: 'TICK-TRACE-01',
        caseId: 'case-trace-uuid',
        caseNumber: 'CASE-2026-999',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'COOLING_JACKET_LEAK',
        problemStatement: 'Coolant weepage at jacket flange',
        rootCause: 'Elastomer O-ring brittle from age',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced Viton O-ring'],
        verificationState: 'PASSED',
      });

      const res = await request(app)
        .get(`/api/v1/machines/${machineCompressorAlpha.id}/historical-faults?query=coolant+weepage`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(res.status).toBe(200);
      const match = res.body.data.matches[0];
      expect(match.recordId).toBe(rec.id);
      expect(match.recordNumber).toBe(rec.recordNumber);
      expect(match.ticketId).toBe('t-trace-01');
      expect(match.caseId).toBe('case-trace-uuid');
      expect(match.workOrderReference).toBe('CASE-2026-999');
    });
  });

  // ==========================================================================
  // 8. CROSS-TENANT SECURITY & ISOLATION
  // ==========================================================================
  describe('8. Cross-Tenant Security & Confidentiality Enforcement', () => {
    it('rejects cross-tenant requests attempting to retrieve competitor machine historical faults', async () => {
      // User Alpha Admin attempts to query Beta machine historical faults -> 404
      const crossRes = await request(app)
        .get(`/api/v1/machines/${machinePumpBeta.id}/historical-faults?query=acid+leak`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(crossRes.status).toBe(404);
      expect(crossRes.body.error).toContain('not found in this organization');

      // User Beta Admin attempts to match faults on Alpha machine -> 404
      const crossPost = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenAdminBeta}`)
        .send({ query: 'slurry seal failure' });

      expect(crossPost.status).toBe(404);
      expect(crossPost.body.error).toContain('not found in this organization');
    });
  });

  // ==========================================================================
  // 9. UNAUTHORIZED RECORDS EXCLUDED FROM NON-PRIVILEGED AI CONTEXT
  // ==========================================================================
  describe('9. Role-Based Access Control on Internal Investigation Records', () => {
    it('excludes INTERNAL_INVESTIGATION records from WORKER role results while allowing privileged access', async () => {
      // Record 1: Operational record
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-oper-01',
        ticketNumber: 'TICK-OPER-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'Normal operational maintenance on bearing',
        rootCause: 'Normal wear',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Replaced bearing'],
        verificationState: 'PASSED',
      });

      // Record 2: Sensitive Internal Investigation
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-invest-02',
        ticketNumber: 'TICK-INVEST-02',
        reportingUserId: userAdminAlpha.id,
        resolvingTechnicianUserId: userEngineerAlpha.id,
        resolvingTechnicianName: userEngineerAlpha.fullName,
        faultCategory: 'INTERNAL_INVESTIGATION',
        problemStatement: 'Confidential Root Cause Analysis into Operator Negligence and Contaminated Lube Supply',
        rootCause: 'Sabotage or uncertified lube drum used',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Seized drum and instituted legal audit'],
        verificationState: 'PASSED',
      });

      // Worker queries historical faults: must NOT see INTERNAL_INVESTIGATION
      const workerRes = await request(app)
        .get(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults`)
        .set('Authorization', `Bearer ${tokenWorkerAlpha}`);

      expect(workerRes.status).toBe(200);
      expect(workerRes.body.data.matches.some((m: any) => m.faultCategory === 'INTERNAL_INVESTIGATION')).toBe(false);

      // Admin queries historical faults: CAN see INTERNAL_INVESTIGATION
      const adminRes = await request(app)
        .get(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.matches.some((m: any) => m.faultCategory === 'INTERNAL_INVESTIGATION')).toBe(true);
    });
  });

  // ==========================================================================
  // 10. DATABASE/SEARCH FAILURE DISTINCTION
  // ==========================================================================
  describe('10. Distinguishing Errors from Genuinely Empty History', () => {
    it('returns 404 for non-existent machine ID rather than silently reporting empty history', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/machines/${nonExistentId}/historical-faults?query=vibration`)
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('requires machineId on /api/v1/maintenance-records/similar', async () => {
      const res = await request(app)
        .get('/api/v1/maintenance-records/similar')
        .set('Authorization', `Bearer ${tokenAdminAlpha}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('machineId is required');
    });
  });

  // ==========================================================================
  // 11. CONFLICTING HISTORICAL EVIDENCE PRESERVATION
  // ==========================================================================
  describe('11. Conflicting Historical Evidence Preservation', () => {
    it('detects and discloses conflicting diagnoses recorded for similar past incidents without suppressing either', async () => {
      // Incident A: Diagnosed as dry bearing grease
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-conf-01',
        ticketNumber: 'TICK-CONF-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'High bearing temperature 82C on drive end',
        rootCause: 'Degraded synthetic grease due to thermal duty cycle',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Repacked bearing housing with grease'],
        verificationState: 'PASSED',
      });

      // Incident B: Same symptom, but diagnosed as shaft angular misalignment
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-conf-02',
        ticketNumber: 'TICK-CONF-02',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'BEARING_OVERHEATING',
        problemStatement: 'High bearing temperature 86C on drive end',
        rootCause: 'Shaft angular misalignment imposing asymmetric axial thrust',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Laser aligned motor and pump shafts'],
        verificationState: 'PASSED',
      });

      const res = await request(app)
        .post(`/api/v1/machines/${machinePumpAlpha.id}/historical-faults/match`)
        .set('Authorization', `Bearer ${tokenEngineerAlpha}`)
        .send({ query: 'high bearing temperature drive end', faultCategory: 'BEARING_OVERHEATING' });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.hasConflictingEvidence).toBe(true);
      expect(data.conflictingDiagnoses.length).toBeGreaterThanOrEqual(1);

      const conflict = data.conflictingDiagnoses[0];
      expect(conflict.description).toContain('Conflicting diagnoses');
      expect(conflict.rootCauseA).not.toBe(conflict.rootCauseB);
    });
  });

  // ==========================================================================
  // 12. AI / RAG EVIDENCE SYNTHESIS WITH HISTORICAL RETRIEVAL
  // ==========================================================================
  describe('12. AI Pipeline Integration with Scored Historical Evidence', () => {
    it('seamlessly incorporates ranked historical evidence and citations into RAG copilot queries', async () => {
      // Historical record for Extruder/Pump
      await dataStore.createMaintenanceRecord(orgAlpha.id, {
        plantId: plantAlpha.id,
        machineId: machinePumpAlpha.id,
        machineAssetTag: machinePumpAlpha.assetTag,
        ticketId: 't-copilot-01',
        ticketNumber: 'TICK-COPILOT-01',
        reportingUserId: userWorkerAlpha.id,
        resolvingTechnicianUserId: userTechAlpha.id,
        resolvingTechnicianName: userTechAlpha.fullName,
        faultCategory: 'CAVITATION_PITTING',
        problemStatement: 'Impeller shroud erosion and low discharge head',
        rootCause: 'Suction strainer clogged causing excessive depression',
        rootCauseStatus: 'CONFIRMED',
        repairActions: ['Cleaned 40-mesh suction strainer basket', 'Replaced eroded impeller'],
        verificationState: 'PASSED',
      });

      const ragResponse = await ragEngine.query(
        {
          plantId: plantAlpha.id,
          machineId: machinePumpAlpha.id,
          query: 'What was the confirmed root cause of the previous impeller erosion and cavitation on pump PUMP-101-SLURRY?',
        },
        {
          organizationId: orgAlpha.id,
          userId: userWorkerAlpha.id,
          userRole: 'WORKER',
        }
      );

      // Verify AI evidence output
      expect(ragResponse.maintenanceRecords).toBeDefined();
      expect(ragResponse.maintenanceRecords!.length).toBeGreaterThan(0);
      expect(ragResponse.assistantMessage.content).toContain('CONFIRMED');
      expect(ragResponse.assistantMessage.content).toContain('suction strainer');

      // Verify citation includes historical record
      const citations = ragResponse.assistantMessage.citations;
      const historyCit = citations.find((c: any) => c.chunkId.startsWith('maint_rec_') || c.chunkId.startsWith('maint_hist_'));
      expect(historyCit).toBeDefined();
    });
  });
});

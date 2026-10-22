import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { RcaService } from '../src/services/rca.service.js';

describe('Root Cause Analysis (RCA) Engine & Troubleshooting Builder', () => {
  const jwtSecret = 'test_rca_troubleshooting_secret_key_2026_at_least_32_chars';
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let rcaService: RcaService;
  let orgId: string;
  let plantId: string;
  let machine: any;
  let techToken: string;
  let techUser: any;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    embeddingAdapter = new LocalDevEmbeddingAdapter(128);

    const org = await dataStore.createOrganization({
      name: 'Forge Precision Machining',
      industryCategory: 'Machining & Fabrication',
      subscriptionTier: 'ENTERPRISE',
      country: 'USA',
    });
    orgId = org.id;

    const plant = await dataStore.createPlant(orgId, {
      code: 'PLANT-TX-02',
      name: 'Dallas Heavy Assembly',
      country: 'USA',
    });
    plantId = plant.id;

    machine = await dataStore.createMachine(orgId, {
      plantId,
      assetTag: 'PUMP-204-B',
      name: 'Boiler Feedwater Slurry Pump B',
      criticality: 'CRITICAL',
      area: 'Boiler Room West',
    });

    techUser = await dataStore.createUser({
      externalAuthId: 'auth_tech_rca_01',
      email: 'reliability.lead@forgex.io',
      fullName: 'Vikrant Lead Engineer',
    });
    await dataStore.createMembership({
      organizationId: orgId,
      userId: techUser.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    techToken = LocalDevAuthAdapter.generateDevToken(
      { id: techUser.externalAuthId, email: techUser.email, emailVerified: true },
      jwtSecret
    );

    // Pre-seed an Expert Knowledge field note
    await dataStore.createExpertKnowledgeEntry(orgId, {
      plantId,
      machineId: machine.id,
      machineAssetTag: machine.assetTag,
      category: 'Reliability',
      severity: 'Critical Machine Warning',
      symptom: 'Cold startup below 0°C, seal chatter or abnormal vibration',
      title: 'Bypass Recirculation Warming Procedure Before Main Pump Start',
      description: 'Always purge recirculation loop and allow fluid to reach 20°C to prevent mechanical seal face thermal shock.',
      authorUserId: techUser.id,
      authorName: techUser.fullName,
      status: 'APPROVED',
      tags: ['cavitation', 'seal-leakage', 'vibration'],
    });

    // Pre-seed a maintenance case and historical maintenance record
    const mCase = await dataStore.createMaintenanceCase({
      organizationId: orgId,
      plantId,
      assetId: machine.id,
      title: 'Emergency Mechanical Seal Failure Investigation',
      reportedByUserId: techUser.id,
    });

    await dataStore.createMaintenanceRecord(orgId, {
      plantId,
      machineId: machine.id,
      caseId: mCase.id,
      ticketNumber: 'WO-2026-4421',
      problemStatement: 'Mechanical seal high temperature alarm and acoustic pinging',
      rootCause: 'Plan 11 cyclone separator blockage starving seal face of fluid lubrication',
      repairActions: ['Flushed Plan 11 cyclone separator', 'Replaced stationary seal face'],
      faultCategory: 'Mechanical Seal Failure',
      resolutionSummary: 'Flushed particulate buildup from Plan 11 cyclone separator and replaced stationary tungsten carbide seal face.',
      technicianUserId: techUser.id,
      technicianName: techUser.fullName,
      performedAt: new Date().toISOString(),
    });

    rcaService = new RcaService(dataStore, embeddingAdapter, vectorStore);

    app = createApp({
      dataStore,
      authAdapter,
      vectorStore,
      embeddingAdapter,
      rcaService,
    });
  });

  it('runs AI Root Cause Analysis grounded in Knowledge Hub, Expert Field Notes, and Maintenance History', async () => {
    const res = await request(app)
      .post('/api/v1/rca/analyze')
      .set('Authorization', `Bearer ${techToken}`)
      .send({
        assetId: machine.id,
        assetTag: machine.assetTag,
        errorCode: 'ERR-SEAL-HIGH-TEMP',
        machineStatus: 'Running - Abnormal',
        symptom: 'Acoustic seal chatter, thermal spike to 82°C and abnormal leakage around gland casing',
        plantId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const session = res.body.data;
    expect(session.id).toBeDefined();
    expect(session.assetTag).toBe('PUMP-204-B');
    expect(session.machineStatus).toBe('Running - Abnormal');

    // Hypotheses verification
    expect(Array.isArray(session.hypotheses)).toBe(true);
    expect(session.hypotheses.length).toBeGreaterThanOrEqual(2);

    const topHyp = session.hypotheses[0];
    expect(topHyp.probability).toBeGreaterThanOrEqual(70);
    expect(topHyp.severity).toBe('CRITICAL');
    expect(topHyp.mechanismExplanation).toContain('PUMP-204-B');
    expect(topHyp.recommendedFix).toBeDefined();

    // Verified sources check
    expect(Array.isArray(topHyp.verifiedSources)).toBe(true);
    const hasExpertOrWorkOrder = topHyp.verifiedSources.some(
      (s: any) => s.type === 'EXPERT_NOTE' || s.type === 'WORK_ORDER' || s.type === 'MANUAL'
    );
    expect(hasExpertOrWorkOrder).toBe(true);

    // Investigation checklist verification
    expect(Array.isArray(session.investigationSteps)).toBe(true);
    expect(session.investigationSteps.length).toBeGreaterThanOrEqual(4);

    const step1 = session.investigationSteps[0];
    expect(step1.name).toContain('LOTO');
    expect(step1.requiresLoto).toBe(true);
    expect(step1.expectedReading).toBeDefined();
    expect(Array.isArray(step1.requiredTools)).toBe(true);
    expect(step1.status).toBe('PENDING');

    // List recent sessions check
    const listRes = await request(app)
      .get('/api/v1/rca/sessions')
      .set('Authorization', `Bearer ${techToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data[0].id).toBe(session.id);
  });

  it('updates investigation step verification status (PASS / FAIL) and persists notes in real time', async () => {
    // 1. Create RCA session
    const createRes = await request(app)
      .post('/api/v1/rca/analyze')
      .set('Authorization', `Bearer ${techToken}`)
      .send({
        assetId: machine.id,
        symptom: 'High vibration on inboard bearing',
        plantId,
      });

    const sessionId = createRes.body.data.id;
    const stepId = createRes.body.data.investigationSteps[0].id;

    // 2. Mark step 1 as PASS
    const passRes = await request(app)
      .patch(`/api/v1/rca/sessions/${sessionId}/steps/${stepId}`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({
        status: 'PASS',
        technicianNotes: 'Zero energy confirmed with Fluke 87V. Locked with padlock #38.',
      });

    expect(passRes.status).toBe(200);
    expect(passRes.body.data.investigationSteps[0].status).toBe('PASS');
    expect(passRes.body.data.investigationSteps[0].technicianNotes).toContain('Fluke 87V');
  });

  it('retrieves structured Teardown & LOTO Disassembly SOP with torque specs and step-by-step procedures', async () => {
    const res = await request(app)
      .get(`/api/v1/rca/teardown-sop?assetTag=${machine.assetTag}`)
      .set('Authorization', `Bearer ${techToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const sop = res.body.data;
    expect(sop.machineAssetTag).toBe('PUMP-204-B');
    expect(sop.safetyPrerequisites.length).toBeGreaterThanOrEqual(1);
    expect(sop.requiredPpe.length).toBeGreaterThanOrEqual(1);
    expect(sop.lotoIsolationSteps.length).toBeGreaterThanOrEqual(1);
    expect(sop.disassemblySteps.length).toBe(5);
    expect(sop.disassemblySteps[0].title).toContain('Coupling');
    expect(sop.torqueSpecifications['Volute Casing Main Studs']).toContain('85 ft-lbs');
  });
});

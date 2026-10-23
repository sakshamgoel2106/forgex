import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { executeRcaRetentionPurge, getRcaRetentionStatus } from '../src/services/rcaRetentionWorker.js';
import type { RcaSession } from '@forgex/shared-types';

describe('RCA Auto-Deletion Data Retention Policy & Expert Knowledge Decoupling', () => {
  const jwtSecret = 'test_rca_retention_secret_key_2026_at_least_32_chars';
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let orgId: string;
  let plantId: string;
  let adminToken: string;
  let adminUser: any;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    embeddingAdapter = new LocalDevEmbeddingAdapter(128);

    const org = await dataStore.createOrganization({
      name: 'Forge Precision Dynamics',
      industryCategory: 'Machining & Fabrication',
      subscriptionTier: 'ENTERPRISE',
      country: 'USA',
    });
    orgId = org.id;

    const plant = await dataStore.createPlant(orgId, {
      code: 'PLANT-OH-01',
      name: 'Cleveland Machine Works',
      country: 'USA',
    });
    plantId = plant.id;

    adminUser = await dataStore.createUser({
      externalAuthId: 'auth_admin_retention',
      email: 'reliability.admin@forgex.com',
      fullName: 'Marcus Vance',
      avatarUrl: null,
    });
    await dataStore.createMembership({
      organizationId: orgId,
      userId: adminUser.id,
      role: 'ORGANIZATION_ADMIN',
    });

    adminToken = LocalDevAuthAdapter.generateDevToken(
      { id: adminUser.externalAuthId, email: adminUser.email, emailVerified: true },
      jwtSecret
    );

    app = createApp({
      dataStore,
      vectorStore,
      embeddingAdapter,
      authAdapter,
    });
  });

  it('1. Purges RCA sessions older than 30 days while preserving newer RCA sessions', async () => {
    const now = Date.now();
    const thirtyFiveDaysAgo = new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Create old expired session (35 days old)
    const oldSession: RcaSession = {
      id: 'rca-session-expired-01',
      organizationId: orgId,
      plantId,
      assetId: 'PUMP-RET-01',
      assetTag: 'PUMP-RET-01',
      symptom: 'Bearing overheating and mechanical seal leak 35 days ago',
      machineStatus: 'Tripped / Offline',
      hypotheses: [],
      investigationSteps: [],
      status: 'VERIFIED_CLOSED',
      isLocked: true,
      createdAt: thirtyFiveDaysAgo,
      updatedAt: thirtyFiveDaysAgo,
    };
    await dataStore.saveRcaSession(oldSession);

    // Create recent session (10 days old)
    const recentSession: RcaSession = {
      id: 'rca-session-active-02',
      organizationId: orgId,
      plantId,
      assetId: 'PUMP-RET-02',
      assetTag: 'PUMP-RET-02',
      symptom: 'Vibration spike on motor drive end 10 days ago',
      machineStatus: 'Running - Abnormal',
      hypotheses: [],
      investigationSteps: [],
      status: 'IN_PROGRESS',
      isLocked: false,
      createdAt: tenDaysAgo,
      updatedAt: tenDaysAgo,
    };
    await dataStore.saveRcaSession(recentSession);

    // Verify both exist before purge
    expect(await dataStore.getRcaSessionById(orgId, 'rca-session-expired-01')).not.toBeNull();
    expect(await dataStore.getRcaSessionById(orgId, 'rca-session-active-02')).not.toBeNull();

    // Execute retention purge with 30 days threshold
    const purgeResult = await dataStore.purgeRcaRecordsOlderThan(30, orgId);

    expect(purgeResult.deletedRcaSessions).toBe(1);

    // Verify old session was deleted
    const oldCheck = await dataStore.getRcaSessionById(orgId, 'rca-session-expired-01');
    expect(oldCheck).toBeNull();

    // Verify recent session was preserved
    const recentCheck = await dataStore.getRcaSessionById(orgId, 'rca-session-active-02');
    expect(recentCheck).not.toBeNull();
    expect(recentCheck?.id).toBe('rca-session-active-02');
  });

  it('2. Strictly protects Expert Knowledge records when corresponding RCA is auto-deleted or manually deleted', async () => {
    const now = Date.now();
    const oneHundredDaysAgo = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Create an RCA session
    const rcaSession: RcaSession = {
      id: 'rca-session-to-purge',
      organizationId: orgId,
      plantId,
      assetId: 'CNC-MILL-501',
      assetTag: 'CNC-MILL-501',
      symptom: 'Finish milling tolerances drifting by 12 microns over 4-hour production run',
      machineStatus: 'Running - Abnormal',
      hypotheses: [
        {
          id: 'hyp-01',
          title: 'Spindle Taper Thermal Expansion & Tool Runout',
          probability: 92,
          status: 'CONFIRMED',
          severity: 'HIGH',
          mechanismExplanation: 'HSK tool holder taper contamination prevents consistent thermal dissipation.',
          recommendedFix: 'Execute solvent wiper cycle on HSK-A63 taper and allow 20m thermal equilibrium.',
          fiveWhyChain: ['Why 1: Tolerance drift', 'Why 2: Tool runout', 'Why 3: Thermal expansion'],
        },
      ],
      investigationSteps: [],
      status: 'VERIFIED_CLOSED',
      isLocked: true,
      createdAt: oneHundredDaysAgo,
      updatedAt: oneHundredDaysAgo,
    };
    await dataStore.saveRcaSession(rcaSession);

    // 2. Publish/save finding to Expert Knowledge via the API endpoint
    const saveResponse = await request(app)
      .post('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: [
          {
            title: 'CNC-MILL-501: Spindle Taper Thermal Runout Prevention',
            assetTag: 'CNC-MILL-501',
            category: 'Troubleshooting Trick',
            severity: 'Pro-Tip / Best Practice',
            symptom: 'Tolerance drift on finishing passes',
            taskDuringIssue: 'AI RCA Diagnostic (Running - Abnormal)',
            observedAt: oneHundredDaysAgo,
            description: 'Execute solvent wiper cycle on HSK-A63 taper and allow 20m thermal equilibrium.\nRecommended Field Fix: Clean taper thoroughly.',
            status: 'APPROVED',
          },
        ],
      });

    expect(saveResponse.status).toBe(201);
    expect(saveResponse.body.success).toBe(true);
    const createdNotes = saveResponse.body.data;
    expect(createdNotes.length).toBe(1);
    const expertNoteId = createdNotes[0].id;
    expect(expertNoteId).toBeDefined();

    // Verify Expert Note is retrievable
    const getNoteBefore = await request(app)
      .get(`/api/v1/recovery/expert-library/${expertNoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getNoteBefore.status).toBe(200);
    expect(getNoteBefore.body.data.title).toContain('Spindle Taper Thermal Runout');

    // 3. Auto-delete RCA records older than 90 days (100 days old RCA will be deleted)
    const purgeResponse = await request(app)
      .post('/api/v1/rca/retention/purge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ days: 90 });

    expect(purgeResponse.status).toBe(200);
    expect(purgeResponse.body.success).toBe(true);
    expect(purgeResponse.body.data.deletedRcaSessions).toBeGreaterThanOrEqual(1);

    // 4. Verify RCA Session is gone
    const getRcaAfter = await request(app)
      .get(`/api/v1/rca/sessions/${rcaSession.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRcaAfter.status).toBe(404);

    // 5. CRITICAL: Verify Expert Knowledge Note is STILL intact and accessible!
    const getNoteAfter = await request(app)
      .get(`/api/v1/recovery/expert-library/${expertNoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getNoteAfter.status).toBe(200);
    expect(getNoteAfter.body.success).toBe(true);
    expect(getNoteAfter.body.data.id).toBe(expertNoteId);
    expect(getNoteAfter.body.data.title).toContain('CNC-MILL-501: Spindle Taper Thermal Runout');
    expect(getNoteAfter.body.data.machineAssetTag).toBe('CNC-MILL-501');

    // 6. Test manual DELETE /api/v1/rca/sessions/:id as well
    const manualRca: RcaSession = {
      id: 'rca-session-manual-delete',
      organizationId: orgId,
      plantId,
      assetId: 'CNC-MILL-501',
      assetTag: 'CNC-MILL-501',
      symptom: 'Manual test symptom',
      machineStatus: 'Running - Abnormal',
      hypotheses: [],
      investigationSteps: [],
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dataStore.saveRcaSession(manualRca);

    const deleteRes = await request(app)
      .delete(`/api/v1/rca/sessions/${manualRca.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);

    // Expert Note must still be intact after manual RCA deletion
    const getNoteAfterManual = await request(app)
      .get(`/api/v1/recovery/expert-library/${expertNoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getNoteAfterManual.status).toBe(200);
    expect(getNoteAfterManual.body.data.id).toBe(expertNoteId);
  });

  it('3. GET /api/v1/rca/retention/status returns retention worker configuration with 30 days default', async () => {
    const res = await request(app)
      .get('/api/v1/rca/retention/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.retentionDays).toBe(30);
    expect(res.body.data.intervalHours).toBeDefined();
  });

  it('4. Rejects saving incomplete or failed RCAs to Maintenance History', async () => {
    // Session with a FAILED step
    const failedSession: RcaSession = {
      id: 'rca-session-failed-step',
      organizationId: orgId,
      plantId,
      assetId: 'PUMP-TEST-01',
      assetTag: 'PUMP-TEST-01',
      symptom: 'Thermal excursion on motor casing',
      machineStatus: 'Running - Abnormal',
      hypotheses: [],
      investigationSteps: [
        {
          id: 'step-1',
          stepNumber: 1,
          name: 'LOTO Check',
          instruction: 'Verify zero energy',
          status: 'PASS',
        },
        {
          id: 'step-2',
          stepNumber: 2,
          name: 'Thermal Check',
          instruction: 'Measure bearing temp',
          status: 'FAIL',
        },
      ],
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dataStore.saveRcaSession(failedSession);

    // Attempting to complete/log this failed session should be strictly rejected
    const failedRes = await request(app)
      .post(`/api/v1/rca/sessions/${failedSession.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verifiedBy: { id: adminUser.id, name: adminUser.fullName },
      });

    expect(failedRes.status).toBe(400);
    expect(failedRes.body.success).toBe(false);
    expect(failedRes.body.error.code).toBe('FORGEX_RCA_INCOMPLETE_RESTRICTION');

    // Confirm no maintenance records were created for this asset
    const records = await dataStore.getMachineMaintenanceHistory(orgId, 'PUMP-TEST-01');
    expect(records.length).toBe(0);

    // Session with PENDING / Incomplete steps
    const pendingSession: RcaSession = {
      id: 'rca-session-pending-step',
      organizationId: orgId,
      plantId,
      assetId: 'PUMP-TEST-02',
      assetTag: 'PUMP-TEST-02',
      symptom: 'Intermittent pressure drop',
      machineStatus: 'Running - Abnormal',
      hypotheses: [],
      investigationSteps: [
        {
          id: 'step-1',
          stepNumber: 1,
          name: 'LOTO Check',
          instruction: 'Verify zero energy',
          status: 'PASS',
        },
        {
          id: 'step-2',
          stepNumber: 2,
          name: 'Check Strainer',
          instruction: 'Inspect mesh for clogging',
          status: 'PENDING',
        },
      ],
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dataStore.saveRcaSession(pendingSession);

    const pendingRes = await request(app)
      .post(`/api/v1/rca/sessions/${pendingSession.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verifiedBy: { id: adminUser.id, name: adminUser.fullName },
      });

    expect(pendingRes.status).toBe(400);
    expect(pendingRes.body.success).toBe(false);
    expect(pendingRes.body.error.code).toBe('FORGEX_RCA_INCOMPLETE_RESTRICTION');
  });

  it('5. Successfully saves 100% verified RCAs to permanent Maintenance History', async () => {
    const verifiedSession: RcaSession = {
      id: 'rca-session-100-percent-pass',
      organizationId: orgId,
      plantId,
      assetId: 'PUMP-TEST-03',
      assetTag: 'PUMP-TEST-03',
      symptom: 'Cavitation vibration cleared',
      machineStatus: 'Running - Abnormal',
      hypotheses: [
        {
          id: 'hyp-1',
          title: 'Suction Line Entrained Vapor Cavitation',
          probability: 95,
          status: 'CONFIRMED',
          severity: 'HIGH',
          mechanismExplanation: 'Suction pressure below vapor pressure.',
          recommendedFix: 'Open suction throttled valve and bleed vapor pocket.',
          fiveWhyChain: [],
        },
      ],
      investigationSteps: [
        {
          id: 'step-1',
          stepNumber: 1,
          name: 'LOTO Check',
          instruction: 'Verify zero energy',
          status: 'PASS',
        },
        {
          id: 'step-2',
          stepNumber: 2,
          name: 'Suction Line Inspection',
          instruction: 'Verify suction gauge reads above NPSHa minimum',
          status: 'PASS',
        },
      ],
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dataStore.saveRcaSession(verifiedSession);

    const completeRes = await request(app)
      .post(`/api/v1/rca/sessions/${verifiedSession.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        verifiedBy: { id: adminUser.id, name: adminUser.fullName },
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.data.status).toBe('VERIFIED_CLOSED');
    expect(completeRes.body.maintenanceRecord).toBeDefined();
    expect(completeRes.body.maintenanceRecord.ticketNumber).toBe('RCA-VERIFIED-PUMP-TEST-03');
    expect(completeRes.body.maintenanceRecord.verificationState).toBe('PASSED');

    // Verify it is recorded in durable Maintenance History
    const history = await dataStore.getMachineMaintenanceHistory(orgId, 'PUMP-TEST-03');
    expect(history.length).toBe(1);
    expect(history[0].ticketNumber).toBe('RCA-VERIFIED-PUMP-TEST-03');
    expect(history[0].rootCauseStatus).toBe('CONFIRMED');
  });
});

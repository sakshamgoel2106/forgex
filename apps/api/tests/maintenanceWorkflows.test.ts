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

describe('Phase 6: Evidence-to-Action Workflows', () => {
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
  let userEngineerA: any;
  let userTechA: any;
  let userWorkerA: any;
  let userViewerA: any;
  let userAdminB: any;
  let plantA: any;
  let plantB: any;
  let assetPumpA: any;

  let tokenAdminA: string;
  let tokenEngineerA: string;
  let tokenTechA: string;
  let tokenWorkerA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;

  // Ingested Document Chunks
  let docA: any;
  let versionA: any;
  let chunkSopA: any;

  const jwtSecret = 'test_jwt_secret_for_maintenance_phase6';

  beforeEach(async () => {
    RateLimiterService.reset();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(
      os.tmpdir(),
      `forgex-maint-test-${Date.now()}-${Math.random()}`
    );
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
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

    // Seed Org A
    orgA = await dataStore.createOrganization({
      name: 'Gulf Petrochemical Corp',
      slug: 'gulf-petro',
    });

    userAdminA = await dataStore.createUser({
      externalAuthId: 'ext_admin_a',
      email: 'plant.manager@gulfpetro.com',
      fullName: 'Marcus Vance Plant Manager',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userAdminA.id,
      role: 'ORGANIZATION_ADMIN',
    });

    userEngineerA = await dataStore.createUser({
      externalAuthId: 'ext_eng_a',
      email: 'lead.tech@gulfpetro.com',
      fullName: 'Elena Rostova Lead Technician',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngineerA.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    userTechA = await dataStore.createUser({
      externalAuthId: 'ext_tech_a',
      email: 'field.tech@gulfpetro.com',
      fullName: 'Carlos Rodriguez Technician',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userTechA.id,
      role: 'TECHNICIAN',
    });

    userWorkerA = await dataStore.createUser({
      externalAuthId: 'ext_worker_a',
      email: 'plant.worker@gulfpetro.com',
      fullName: 'Sam Worker',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userWorkerA.id,
      role: 'WORKER',
    });

    userViewerA = await dataStore.createUser({
      externalAuthId: 'ext_viewer_a',
      email: 'trainee@gulfpetro.com',
      fullName: 'Alex Trainee',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userViewerA.id,
      role: 'VIEWER',
    });

    plantA = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-TX-04',
      name: 'Texas Refining Unit 4',
      location: 'Texas, USA',
    });

    assetPumpA = await dataStore.createAsset(orgA.id, {
      plantId: plantA.id,
      assetTag: 'P-101-A',
      name: 'Atmospheric Crude Booster Pump A',
      area: 'Process Area 1',
      manufacturer: 'Flowserve',
      modelNumber: 'Durco Mark 3',
      serialNumber: 'SN-P101-01',
      operationalState: 'OPTIMAL',
    });

    tokenAdminA = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminA.externalAuthId, email: userAdminA.email, emailVerified: true },
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
    tokenViewerA = LocalDevAuthAdapter.generateDevToken(
      { id: userViewerA.externalAuthId, email: userViewerA.email, emailVerified: true },
      jwtSecret
    );

    // Seed Org B (Tenant isolation test)
    orgB = await dataStore.createOrganization({
      name: 'Nordic Energy B',
      slug: 'nordic-energy-b',
    });

    userAdminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: 'admin@nordicenergy.no',
      fullName: 'Astrid Lindgren',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userAdminB.id,
      role: 'ORGANIZATION_ADMIN',
    });

    plantB = await dataStore.createPlant(orgB.id, {
      code: 'PLANT-NO-01',
      name: 'Stavanger Terminal',
      location: 'Stavanger, Norway',
    });
    void plantB;

    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB.externalAuthId, email: userAdminB.email, emailVerified: true },
      jwtSecret
    );

    // Seed Authorized Manual for P-101-A
    docA = await dataStore.createDocument({
      organizationId: orgA.id,
      plantId: plantA.id,
      documentNumber: 'SOP-MECH-P101',
      title: 'Centrifugal Pump P-101 Mechanical Seal Overhaul & Fastener Torque Specification',
      category: 'SOP',
      assetTags: ['P-101-A'],
      createdByUserId: userAdminA.id,
    });

    versionA = await dataStore.createDocumentVersion({
      documentId: docA.id,
      versionNumber: 1,
      revision: 'REV-D',
      filename: 'SOP-MECH-P101_RevD.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 520000,
      storageKey: `sop/${orgA.id}/p101_revd.pdf`,
      checksumSha256: 'sha256_mock_p101',
      status: 'INDEXED',
    });

    const sopContent = `SOP Section 4.3: Mechanical Seal Gland Assembly & Fastener Torque Sequence for P-101-A.
1. Safety Pre-check: Mandatory Lockout/Tagout (LOTO) on suction block valve MOV-101 and 4160V feeder breaker.
2. Gland Follower Stud Torque: Must follow three-pass progressive cross-star tightening:
   Pass 1: 15 ft-lbs (20 Nm)
   Pass 2: 30 ft-lbs (40 Nm)
   Final Pass 3: 45 ft-lbs (61 Nm) cross-verified with calibrated torque wrench.
3. Permissible seal flush plan: API Plan 11 with orifice restriction.
4. Casing lower drain valve V-101-D must remain closed during flush commissioning.`;

    [chunkSopA] = await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: versionA.id,
        chunkIndex: 0,
        pageNumber: 14,
        qdrantPointId: crypto.randomUUID(),
        extractionMethod: 'NATIVE_TEXT',
        sectionHeading: '4.3 Mechanical Seal Gland Assembly & Torque Matrix',
        content: sopContent,
        tokenCount: 80,
      },
    ]);

    const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
    const vecSopA = await embeddingAdapter.generateEmbedding(sopContent);
    await vectorStore.upsertPoints(collectionName, [
      {
        id: chunkSopA.id,
        vector: vecSopA,
        payload: {
          chunkId: chunkSopA.id,
          documentId: docA.id,
          documentVersionId: versionA.id,
          organizationId: orgA.id,
          plantId: plantA.id,
          assetId: assetPumpA.id,
          pageNumber: 14,
          chunkIndex: 0,
          sectionHeading: chunkSopA.sectionHeading,
          content: chunkSopA.content,
          documentNumber: docA.documentNumber,
          documentTitle: docA.title,
          revisionTag: versionA.revision,
          isTable: false,
          isFigure: false,
          extractionMethod: 'NATIVE_TEXT',
        },
      },
    ]);
  });

  describe('1. Maintenance Case Creation & RBAC', () => {
    it('creates maintenance case linked to plant, asset, symptoms and operating conditions', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Mechanical Seal Weepage & Increased Drive-End Vibration',
          severity: 'HIGH',
          symptomDescription: 'Audible hissing at mechanical seal gland plate with fluid weepage at 15 drops/min.',
          operatingConditions: {
            dischargePressurePsi: 145,
            suctionPressurePsi: 28,
            bearingTemperatureC: 68,
            runtimeHours: 4200,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const caseData = res.body.data;
      expect(caseData.id).toBeDefined();
      expect(caseData.caseNumber).toMatch(/^CASE-\d{4}-\d{4}$/);
      expect(caseData.status).toBe('REPORTED');
      expect(caseData.severity).toBe('HIGH');
      expect(caseData.reportedByUserId).toBe(userEngineerA.id);
      expect(caseData.operatingConditions.dischargePressurePsi).toBe(145);
      expect(caseData.candidateForExpertKnowledge).toBe(false);
    });

    it('rejects case creation with missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          // assetId missing
          title: 'Pump issue',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('rejects case creation targeting unauthorized plant belonging to another tenant', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminB}`) // Org B user
        .send({
          plantId: plantA.id, // Org A plant
          assetId: assetPumpA.id,
          title: 'Cross tenant breach attempt',
          symptomDescription: 'Attempting to inspect another org plant',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not belong to organization');
    });
  });

  describe('2. AI Diagnostic Hypothesis & Guided Checklist Generation', () => {
    it('generates structured diagnostic hypothesis and guided checklist with exact citations', async () => {
      // 1. Create Case
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Seal Weepage on Crude Booster Pump',
          severity: 'HIGH',
          symptomDescription: 'Visible fluid weepage at gland plate with pressure fluctuation.',
          operatingConditions: { dischargePressurePsi: 150 },
        });

      const caseId = createRes.body.data.id;

      // 2. Trigger Diagnosis
      const diagRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(diagRes.status).toBe(200);
      const data = diagRes.body.data;

      expect(data.status).toBe('DIAGNOSED');
      expect(data.diagnosticHypothesis).toBeDefined();

      const hyp = data.diagnosticHypothesis;
      expect(hyp.primaryHypothesis).toContain('P-101-A');
      expect(hyp.rootCauses.length).toBeGreaterThan(0);
      expect(hyp.confidence).toBe('HIGH');
      expect(hyp.missingInformation.length).toBeGreaterThan(0);
      expect(hyp.safetyCriticalWarnings.length).toBeGreaterThan(0);
      expect(hyp.safetyCriticalWarnings.some((w: string) => w.includes('Lockout/Tagout'))).toBe(true);

      // Verify guided checklist
      expect(data.checklist.length).toBe(4);
      const step1 = data.checklist[0];
      expect(step1.title).toContain('Lockout/Tagout (LOTO)');
      expect(step1.requiresLoto).toBe(true);
      expect(step1.requiredPpe).toContain('Safety Glasses');
      expect(step1.status).toBe('PENDING');

      // Verify step citation links back to official manual page 14
      expect(step1.citation).toBeDefined();
      expect(step1.citation.documentId).toBe(docA.id);
      expect(step1.citation.documentNumber).toBe('SOP-MECH-P101');
      expect(step1.citation.pageNumber).toBe(14);

      const step3 = data.checklist[2];
      expect(step3.title).toContain('Fastener Torque Verification');
      expect(step3.instruction).toContain('45 ft-lbs');
    });
  });

  describe('3. Technician Workflow, Checklist Completion & Work Order Submission', () => {
    it('allows technician to execute checklist steps, record findings, and submit for supervisor approval', async () => {
      // 1. Create and diagnose
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Pump P-101-A Seal Overhaul',
          symptomDescription: 'Fluid weepage at gland plate.',
        });
      const caseId = createRes.body.data.id;

      const diagRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      const step1Id = diagRes.body.data.checklist[0].id;
      const step2Id = diagRes.body.data.checklist[1].id;

      // 2. Start working on Step 1 (LOTO)
      const step1Res = await request(app)
        .patch(`/api/v1/maintenance/cases/${caseId}/steps/${step1Id}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          status: 'COMPLETED',
          technicianNotes: 'LOTO verified on MOV-101 and motor breaker. Gauge reading 0 psi.',
        });

      expect(step1Res.status).toBe(200);
      const updatedCase = step1Res.body.data;
      expect(updatedCase.checklist[0].status).toBe('COMPLETED');
      expect(updatedCase.checklist[0].completedByUserId).toBe(userEngineerA.id);
      expect(updatedCase.status).toBe('DIAGNOSED'); // Remains in active execution

      // 3. Mark Step 2 as IN_PROGRESS -> Transitions case status to IN_PROGRESS
      const step2Res = await request(app)
        .patch(`/api/v1/maintenance/cases/${caseId}/steps/${step2Id}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          status: 'IN_PROGRESS',
          technicianNotes: 'Disassembling gland follower.',
        });

      expect(step2Res.body.data.status).toBe('IN_PROGRESS');

      // 4. Record Findings and Submit for Approval
      const findingsRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          observations: 'Old stationary seal face had minor carbon debris. Replaced O-rings and torqued studs to 45 ft-lbs.',
          measuredValues: {
            finalTorqueFtLbs: 45,
            sealFlushDeltaPsi: 26,
            postCommissionLeakageDropsPerMin: 0,
          },
          correctiveActions: 'Cleaned gland plate seat, renewed API Plan 11 orifice fitting, and completed 3-pass torque sequence.',
          resolutionSummary: 'P-101-A mechanical seal restored to nominal operational condition. Zero leakage confirmed during 15-minute test run.',
        });

      expect(findingsRes.status).toBe(200);
      const submittedCase = findingsRes.body.data;
      expect(submittedCase.status).toBe('PENDING_APPROVAL');
      expect(submittedCase.findings.measuredValues.finalTorqueFtLbs).toBe(45);
      expect(submittedCase.approval.status).toBe('PENDING');
    });
  });

  describe('4. Review & Approval Lifecycle (Approve vs Reject)', () => {
    let pendingCaseId: string;

    beforeEach(async () => {
      const c = await maintenanceEngine.createCase(
        {
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Approval Lifecycle Test Case',
          symptomDescription: 'Testing sign-off flow.',
        },
        { organizationId: orgA.id, userId: userEngineerA.id, userRole: 'ENGINEER_TECHNICIAN' }
      );
      await maintenanceEngine.diagnoseCase(c.id, {
        organizationId: orgA.id,
        userId: userEngineerA.id,
      });
      const submitted = await maintenanceEngine.recordFindingsAndSubmit(
        c.id,
        { resolutionSummary: 'Work completed according to standard.' },
        { organizationId: orgA.id, userId: userEngineerA.id }
      );
      pendingCaseId = submitted.id;
    });

    it('allows Organization Admin to approve work order and marks case RESOLVED', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/cases/${pendingCaseId}/approval`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          approved: true,
          reviewerNotes: 'Verified calibration log and zero-leakage sign-off. Approved for unit start-up.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.status).toBe('RESOLVED');
      expect(data.approval.status).toBe('APPROVED');
      expect(data.approval.reviewedByUserId).toBe(userAdminA.id);
      expect(data.approval.reviewerNotes).toContain('Approved for unit start-up');
    });

    it('allows Organization Admin to reject work order with rework notes', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/cases/${pendingCaseId}/approval`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          approved: false,
          reviewerNotes: 'Missing post-commission vibration spectrum survey. Please perform 30-minute vibration check and resubmit.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.status).toBe('REJECTED');
      expect(data.approval.status).toBe('REJECTED');
      expect(data.approval.reviewerNotes).toContain('Missing post-commission vibration spectrum');
    });

    it('forbids Viewer role from approving or rejecting work order (RBAC)', async () => {
      const res = await request(app)
        .post(`/api/v1/maintenance/cases/${pendingCaseId}/approval`)
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .send({
          approved: true,
          reviewerNotes: 'Viewer trying to approve',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('5. High-Risk / Ambiguous Evidence Escalation to Human', () => {
    it('automatically escalates case when technical manual evidence is insufficient or unavailable', async () => {
      // Create case for unknown symptom with zero indexed manuals
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Exotic Chemical Reaction in Impeller Shroud',
          symptomDescription: 'Unknown crystalline polymer deposition emitting ultraviolet fluorescence under cryogenic conditions.',
        });

      const caseId = res.body.data.id;

      // Trigger diagnosis
      const diagRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(diagRes.status).toBe(200);
      const data = diagRes.body.data;

      // Must safely escalate to qualified human rather than inventing instructions!
      expect(data.status).toBe('ESCALATED_HUMAN');
      expect(data.isEscalated).toBe(true);
      expect(data.escalationReason).toContain('Insufficient authorized technical manual evidence');
      expect(data.checklist).toEqual([]);
    });

    it('allows manual human escalation by technician with custom safety reason', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Suspected Structural Casing Crack',
          symptomDescription: 'Hairline fissure noticed on discharge nozzle flange.',
        });

      const caseId = createRes.body.data.id;

      const escRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/escalate`)
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          reason: 'Severe casing integrity risk: Ultrasonic non-destructive testing (NDT) metallurgist required.',
        });

      expect(escRes.status).toBe(200);
      expect(escRes.body.data.status).toBe('ESCALATED_HUMAN');
      expect(escRes.body.data.escalationReason).toContain('Ultrasonic non-destructive testing');
    });
  });

  describe('6. Feedback & Expert Knowledge Candidate Nomination', () => {
    it('records helpful feedback and nominates approved resolution as candidate for expert knowledge', async () => {
      // 1. Create and resolve case
      const c = await maintenanceEngine.createCase(
        {
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Seal Replacement Best Practice',
          symptomDescription: 'Packing leak fixed.',
        },
        { organizationId: orgA.id, userId: userEngineerA.id, userRole: 'ENGINEER_TECHNICIAN' }
      );
      await maintenanceEngine.diagnoseCase(c.id, {
        organizationId: orgA.id,
        userId: userEngineerA.id,
      });
      await maintenanceEngine.recordFindingsAndSubmit(
        c.id,
        { resolutionSummary: 'Optimized torque pattern eliminated weepage permanently.' },
        { organizationId: orgA.id, userId: userEngineerA.id }
      );
      await maintenanceEngine.reviewApproval(
        c.id,
        { approved: true, reviewerNotes: 'Excellent work.' },
        { organizationId: orgA.id, userId: userAdminA.id, userRole: 'ORGANIZATION_ADMIN' }
      );

      // 2. Submit Feedback
      const feedbackRes = await request(app)
        .post(`/api/v1/maintenance/cases/${c.id}/feedback`)
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          rating: 'HELPFUL',
          comment: 'Step-by-step 3-pass torque procedure was flawless.',
          markCandidateForExpertKnowledge: true,
        });

      expect(feedbackRes.status).toBe(200);
      const data = feedbackRes.body.data;
      expect(data.feedbackRating).toBe('HELPFUL');
      expect(data.candidateForExpertKnowledge).toBe(true);

      // 3. Verify Case appears in list when filtered by expert knowledge candidate
      const listRes = await request(app)
        .get('/api/v1/maintenance/cases?candidateForExpertKnowledge=true')
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((item: any) => item.id === c.id)).toBe(true);
    });
  });

  describe('7. Case History, Audit Trail & Multi-Tenant RBAC Isolation', () => {
    it('preserves complete chronological history of all case transitions', async () => {
      const c = await maintenanceEngine.createCase(
        {
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'History Tracking Test',
          symptomDescription: 'Fluid weepage at gland plate.',
        },
        { organizationId: orgA.id, userId: userEngineerA.id }
      );

      await maintenanceEngine.diagnoseCase(c.id, {
        organizationId: orgA.id,
        userId: userEngineerA.id,
      });

      const getRes = await request(app)
        .get(`/api/v1/maintenance/cases/${c.id}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.caseData).toBeDefined();
      expect(getRes.body.data.history.length).toBeGreaterThanOrEqual(2);

      const actions = getRes.body.data.history.map((h: any) => h.action);
      expect(actions).toContain('CASE_REPORTED');
      expect(actions).toContain('DIAGNOSIS_AND_CHECKLIST_GENERATED');
    });

    it('strictly isolates cases between organizations (Tenant B cannot read or modify Tenant A cases)', async () => {
      const c = await maintenanceEngine.createCase(
        {
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Confidential Refinery Case',
          symptomDescription: 'Critical valve packing leak.',
        },
        { organizationId: orgA.id, userId: userEngineerA.id }
      );

      // Org B user attempts to fetch Org A case -> 404
      const getB = await request(app)
        .get(`/api/v1/maintenance/cases/${c.id}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(getB.status).toBe(404);

      // Org B user attempts to approve Org A case -> 404
      const approveB = await request(app)
        .post(`/api/v1/maintenance/cases/${c.id}/approval`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .send({ approved: true });
      expect(approveB.status).toBe(404);

      // Org B list cases -> Does not contain Org A case
      const listB = await request(app)
        .get('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(listB.body.data.some((item: any) => item.id === c.id)).toBe(false);
    });
  });

  describe('8. Technician Assignment & Lifecycle Timestamps', () => {
    it('assigns qualified technician to case and filters cases by assigned technician', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Pump P-101-A Overhaul Tech Assignment',
          symptomDescription: 'Packing weepage detected.',
        });
      const caseId = createRes.body.data.id;

      // Assign technician
      const assignRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/assign`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          technicianUserId: userEngineerA.id,
          technicianName: 'Elena Rostova Lead Technician',
        });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.assignedTechnicianUserId).toBe(userEngineerA.id);
      expect(assignRes.body.data.assignedTechnicianName).toBe('Elena Rostova Lead Technician');

      // Filter by technician
      const filterRes = await request(app)
        .get(`/api/v1/maintenance/cases?assignedTechnicianUserId=${userEngineerA.id}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(filterRes.status).toBe(200);
      expect(filterRes.body.data.some((item: any) => item.id === caseId)).toBe(true);

      // Verify case history audit log
      const historyRes = await request(app)
        .get(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);
      const actions = historyRes.body.data.history.map((h: any) => h.action);
      expect(actions).toContain('TECHNICIAN_ASSIGNED');
    });

    it('records resolvedAt on supervisor approval and closedAt on case formal closure', async () => {
      const c = await maintenanceEngine.createCase(
        {
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Lifecycle Timestamps Verification',
          symptomDescription: 'Testing timestamp tracking.',
        },
        { organizationId: orgA.id, userId: userEngineerA.id, userRole: 'ENGINEER_TECHNICIAN' }
      );
      await maintenanceEngine.diagnoseCase(c.id, {
        organizationId: orgA.id,
        userId: userEngineerA.id,
      });
      await maintenanceEngine.recordFindingsAndSubmit(
        c.id,
        { resolutionSummary: 'Testing resolution timestamp.' },
        { organizationId: orgA.id, userId: userEngineerA.id }
      );

      // Supervisor approves
      const approveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${c.id}/approval`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          approved: true,
          reviewerNotes: 'Approved for final close-out.',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('RESOLVED');
      expect(approveRes.body.data.resolvedAt).toBeDefined();

      // Formally close case
      const closeRes = await request(app)
        .post(`/api/v1/maintenance/cases/${c.id}/close`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ notes: 'Verified post-run inspection complete.' });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('CLOSED');
      expect(closeRes.body.data.closedAt).toBeDefined();

      const getRes = await request(app)
        .get(`/api/v1/maintenance/cases/${c.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(getRes.body.data.caseData.resolvedAt).toBeDefined();
      expect(getRes.body.data.caseData.closedAt).toBeDefined();
    });
  });

  describe('9. High-Risk Safety Scenario Flagging and Escalation', () => {
    it('automatically escalates hazardous high-voltage scenario for qualified human review', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'High-Voltage 4160V Busbar Flash Incident',
          symptomDescription: 'Visible arc flash marks and high-voltage ozone smell at primary feed transformer cabinet.',
        });
      const caseId = res.body.data.id;

      const diagRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(diagRes.status).toBe(200);
      expect(diagRes.body.data.status).toBe('ESCALATED_HUMAN');
      expect(diagRes.body.data.isEscalated).toBe(true);
      expect(diagRes.body.data.escalationReason).toContain('Critical High-Risk Hazard Detected');
    });

    it('automatically escalates toxic chemical hazard (H2S) for site permit and human review', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Hydrogen Sulfide Toxic Gas Detector Alarm',
          symptomDescription: 'Fixed gas sensor H2S alarm triggered at seal gland catch basin (>10 ppm).',
        });
      const caseId = res.body.data.id;

      const diagRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(diagRes.status).toBe(200);
      expect(diagRes.body.data.status).toBe('ESCALATED_HUMAN');
      expect(diagRes.body.data.isEscalated).toBe(true);
      expect(diagRes.body.data.escalationReason).toContain('Critical High-Risk Hazard Detected');
    });
  });

  describe('10. Work Orders Backend Operations, Field Updates & RBAC Enforcement', () => {
    it('updates permitted work order fields via PATCH /api/v1/maintenance/cases/:id', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Initial Title',
          severity: 'LOW',
          symptomDescription: 'Minor vibration at casing.',
        });
      const caseId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          title: 'Updated Booster Pump Vibration',
          severity: 'HIGH',
          description: 'Observed progressive amplitude increase during shift.',
          operatingConditions: { rpm: 3600, tempC: 82 },
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.data.title).toBe('Updated Booster Pump Vibration');
      expect(patchRes.body.data.severity).toBe('HIGH');
      expect(patchRes.body.data.description).toBe('Observed progressive amplitude increase during shift.');
      expect(patchRes.body.data.operatingConditions.rpm).toBe(3600);
    });

    it('rejects mass assignment of protected fields (status, caseNumber, id) via PATCH', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Protected Field Test',
          severity: 'MEDIUM',
          symptomDescription: 'Pressure anomaly on discharge line.',
        });
      const caseId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          status: 'RESOLVED',
          caseNumber: 'FORGED-CASE-999',
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.success).toBe(false);
      expect(patchRes.body.error).toContain('Mass assignment rejected');
    });

    it('rejects updating a closed work order', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Case To Close',
          severity: 'LOW',
          symptomDescription: 'Scheduled seal flush check.',
        });
      const caseId = createRes.body.data.id;

      // Close the case
      await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/close`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ notes: 'Maintenance completed and signed off.' });

      // Attempt to patch closed case
      const patchRes = await request(app)
        .patch(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ title: 'Attempted Title Edit on Closed Case' });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.success).toBe(false);
      expect(patchRes.body.error).toContain('Cannot update a closed maintenance case');
    });

    it('rejects case creation with invalid severity value', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Invalid Severity Test',
          severity: 'EXTREME_DANGER',
          symptomDescription: 'Vibration detected.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed: severity must be');
    });

    it('rejects technician assignment targeting a user from another organization', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Cross-Tenant Assign Test',
          severity: 'MEDIUM',
          symptomDescription: 'Impeller wear check.',
        });
      const caseId = createRes.body.data.id;

      // Attempt to assign userAdminB (who belongs to Org B)
      const assignRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/assign`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          technicianUserId: userAdminB.id,
          technicianName: 'Astrid from Nordic Energy',
        });

      expect(assignRes.status).toBe(400);
      expect(assignRes.body.success).toBe(false);
      expect(assignRes.body.error).toContain('does not belong to organization');
    });

    it('allows TECHNICIAN role to execute checklist step and record findings', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Tech Workflow Execution',
          severity: 'MEDIUM',
          symptomDescription: 'Visible fluid weepage at gland plate with pressure fluctuation.',
        });
      const caseId = createRes.body.data.id;

      const diagRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
        .set('Authorization', `Bearer ${tokenTechA}`);

      expect(diagRes.status).toBe(200);
      expect(diagRes.body.data.status).toBe('DIAGNOSED');

      const step1Id = diagRes.body.data.checklist[0].id;
      const stepRes = await request(app)
        .patch(`/api/v1/maintenance/cases/${caseId}/steps/${step1Id}`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({ status: 'COMPLETED', technicianNotes: 'LOTO verified by field technician.' });

      expect(stepRes.status).toBe(200);
      expect(stepRes.body.data.checklist[0].status).toBe('COMPLETED');

      // Tech records findings
      const findRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/findings`)
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          observations: 'Replaced mechanical seal gland packing.',
          measuredValues: { torqueNm: 61 },
          resolutionSummary: 'Seal replaced, torque verified to 61 Nm.',
        });

      expect(findRes.status).toBe(200);
      expect(findRes.body.data.status).toBe('PENDING_APPROVAL');
    });

    it('forbids WORKER role from approving work order (RBAC)', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'RBAC Approval Guard',
          severity: 'LOW',
          symptomDescription: 'Gland plate adjustment.',
        });
      const caseId = createRes.body.data.id;

      const approveRes = await request(app)
        .post(`/api/v1/maintenance/cases/${caseId}/approval`)
        .set('Authorization', `Bearer ${tokenWorkerA}`)
        .send({ approved: true, reviewerNotes: 'Unauthorized approval attempt' });

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('resolves assetTag and plant automatically when created with assetTag', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenTechA}`)
        .send({
          assetId: 'P-101-A',
          title: 'Case Created by AssetTag',
          severity: 'HIGH',
          symptomDescription: 'Pressure pulsation at discharge flange.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assetId).toBe(assetPumpA.id);
      expect(res.body.data.plantId).toBe(plantA.id);
    });

    it('retrieves case detail enriched with machine and technician details', async () => {
      const createRes = await request(app)
        .post('/api/v1/maintenance/cases')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          plantId: plantA.id,
          assetId: assetPumpA.id,
          title: 'Enriched Detail Test',
          severity: 'HIGH',
          symptomDescription: 'Seal inspection required.',
          assignedTechnicianUserId: userTechA.id,
          assignedTechnicianName: userTechA.fullName,
        });
      const caseId = createRes.body.data.id;

      const getRes = await request(app)
        .get(`/api/v1/maintenance/cases/${caseId}`)
        .set('Authorization', `Bearer ${tokenTechA}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.caseData).toBeDefined();
      expect(getRes.body.data.history).toBeDefined();
      expect(getRes.body.data.machine).toBeDefined();
      expect(getRes.body.data.machine.assetTag).toBe('P-101-A');
      expect(getRes.body.data.assignedTechnician).toBeDefined();
      expect(getRes.body.data.assignedTechnician.id).toBe(userTechA.id);
    });

    describe('Prompt 07: Work Order Fields, Validation and Data Integrity', () => {
      let ticketOrgA: any;
      let ticketOrgB: any;
      let ticketMismatchedMachine: any;
      let otherAssetA: any;

      beforeEach(async () => {
        // Create an additional asset in Org A
        otherAssetA = await dataStore.createAsset(orgA.id, {
          plantId: plantA.id,
          assetTag: 'CMP-202-B',
          name: 'Rotary Compressor 202-B',
          type: 'COMPRESSOR',
          status: 'OPERATIONAL',
          criticality: 'HIGH',
        });

        // Seed a valid specialist ticket for Org A on assetPumpA
        ticketOrgA = await dataStore.createSpecialistTicket(orgA.id, {
          plantId: plantA.id,
          machineId: assetPumpA.id,
          machineAssetTag: assetPumpA.assetTag,
          reportedByUserId: userAdminA.id,
          originalQuestion: 'Vibration spike on seal housing',
          escalationReason: 'MISSING_SOP',
          evidenceCheckResult: {
            hasApprovedEvidence: true,
            confidenceScore: 0.85,
            reason: 'Manual verified',
          },
          severity: 'HIGH',
        });

        // Seed ticket on Org B (cross-tenant)
        ticketOrgB = await dataStore.createSpecialistTicket(orgB.id, {
          plantId: plantB.id,
          machineId: null,
          machineAssetTag: 'UNKNOWN',
          reportedByUserId: userAdminB.id,
          originalQuestion: 'Cross tenant ticket test',
          escalationReason: 'OUT_OF_SPEC',
          evidenceCheckResult: {
            hasApprovedEvidence: false,
            confidenceScore: 0.2,
            reason: 'No evidence',
          },
          severity: 'LOW',
        });

        // Seed ticket on Org A with different machine (mismatched)
        ticketMismatchedMachine = await dataStore.createSpecialistTicket(orgA.id, {
          plantId: plantA.id,
          machineId: otherAssetA.id,
          machineAssetTag: otherAssetA.assetTag,
          reportedByUserId: userAdminA.id,
          originalQuestion: 'Motor bearing temperature',
          escalationReason: 'NO_CLEAR_MATCH',
          evidenceCheckResult: {
            hasApprovedEvidence: false,
            confidenceScore: 0.5,
            reason: 'Checked',
          },
          severity: 'MEDIUM',
        });
      });

      it('rejects creation when required fields are missing', async () => {
        // Missing title
        const res1 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            symptomDescription: 'Valid symptom description text',
          });
        expect(res1.status).toBe(400);
        expect(res1.body.error).toContain('title is mandatory');

        // Missing symptomDescription
        const res2 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Valid Title',
          });
        expect(res2.status).toBe(400);
        expect(res2.body.error).toContain('symptomDescription is mandatory');

        // Missing assetId
        const res3 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            title: 'Valid Title',
            symptomDescription: 'Valid symptom description text',
          });
        expect(res3.status).toBe(400);
        expect(res3.body.error).toContain('assetId is mandatory');
      });

      it('rejects creation when field lengths are invalid', async () => {
        // Title too short (< 3)
        const resShortTitle = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'No',
            symptomDescription: 'Valid symptom description',
          });
        expect(resShortTitle.status).toBe(400);
        expect(resShortTitle.body.error).toContain('title length must be between 3 and 200 characters');

        // Title too long (> 200)
        const resLongTitle = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'A'.repeat(201),
            symptomDescription: 'Valid symptom description',
          });
        expect(resLongTitle.status).toBe(400);
        expect(resLongTitle.body.error).toContain('title length must be between 3 and 200 characters');

        // Symptom description too short (< 5)
        const resShortSymptoms = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Valid Title',
            symptomDescription: 'Fail',
          });
        expect(resShortSymptoms.status).toBe(400);
        expect(resShortSymptoms.body.error).toContain('symptomDescription length must be between 5 and 4000 characters');
      });

      it('rejects creation with unsupported severity value', async () => {
        const res = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Invalid Severity Test',
            symptomDescription: 'Testing invalid severity value',
            severity: 'URGENT',
          });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("severity must be 'LOW', 'MEDIUM', 'HIGH', or 'CRITICAL'");
      });

      it('rejects creation when operatingConditions is not an object or exceeds property limits', async () => {
        const resArray = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Invalid Conditions Test',
            symptomDescription: 'Testing invalid array operating conditions',
            operatingConditions: ['temperature', '100C'],
          });
        expect(resArray.status).toBe(400);
        expect(resArray.body.error).toContain('operatingConditions must be a valid key-value object');
      });

      it('rejects creation referencing non-existent or cross-organization machine', async () => {
        // Non-existent machine ID
        const resMissing = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: 'non-existent-machine-id',
            title: 'Missing Machine Test',
            symptomDescription: 'Testing machine not found error',
          });
        expect(resMissing.status).toBe(400);
        expect(resMissing.body.error).toContain('does not belong to organization');

        // Cross-organization: Org B user attempting to reference Org A asset
        const resCrossOrg = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminB}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Cross Tenant Machine Injection',
            symptomDescription: 'Attempting to reference Org A pump from Org B context',
          });
        expect(resCrossOrg.status).toBe(400);
        expect(resCrossOrg.body.error).toContain('does not belong to organization');
      });

      it('rejects creation referencing cross-organization technician', async () => {
        const resCrossTech = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Cross Tenant Tech Injection',
            symptomDescription: 'Attempting to assign Org B admin to Org A work order',
            assignedTechnicianUserId: userAdminB.id,
          });
        expect(resCrossTech.status).toBe(400);
        expect(resCrossTech.body.error).toContain('does not belong to organization');
      });

      it('rejects creation referencing non-existent or cross-organization source ticket', async () => {
        // Non-existent ticket ID
        const resNonExistent = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Invalid Source Ticket',
            symptomDescription: 'Testing invalid source ticket ID',
            sourceTicketId: 'fake-ticket-uuid-999',
          });
        expect(resNonExistent.status).toBe(400);
        expect(resNonExistent.body.error).toContain('Invalid source ticket');

        // Cross-organization ticket ID (ticketOrgB from Org B)
        const resCrossTicket = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Cross Tenant Ticket Link',
            symptomDescription: 'Attempting to link Org B ticket in Org A',
            sourceTicketId: ticketOrgB.id,
          });
        expect(resCrossTicket.status).toBe(400);
        expect(resCrossTicket.body.error).toContain('Invalid source ticket');
      });

      it('rejects creation when source ticket belongs to a different machine', async () => {
        const resMismatched = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Mismatched Machine Ticket',
            symptomDescription: 'Attempting to link compressor ticket to pump work order',
            sourceTicketId: ticketMismatchedMachine.id,
          });
        expect(resMismatched.status).toBe(400);
        expect(resMismatched.body.error).toContain('Invalid relationship');
        expect(resMismatched.body.error).toContain('belongs to machine');
      });

      it('successfully creates work order linked to valid source ticket', async () => {
        const res = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Legitimate Ticket-Linked Work Order',
            severity: 'HIGH',
            symptomDescription: 'Vibration detected during physical inspection following specialist triage.',
            sourceTicketId: ticketOrgA.id,
          });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.sourceTicketId).toBe(ticketOrgA.id);
        expect(res.body.data.assetId).toBe(assetPumpA.id);
      });

      it('safely handles duplicate creations via Idempotency-Key header', async () => {
        const idempotencyKey = 'idem-' + crypto.randomUUID();
        const payload = {
          assetId: assetPumpA.id,
          title: 'Idempotency Test Case',
          severity: 'LOW',
          symptomDescription: 'Testing network retry idempotency guarantee.',
        };

        // First attempt
        const res1 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .set('X-Idempotency-Key', idempotencyKey)
          .send(payload);
        expect(res1.status).toBe(201);
        const caseId = res1.body.data.id;

        // Second attempt with exact same idempotency key
        const res2 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .set('X-Idempotency-Key', idempotencyKey)
          .send(payload);
        expect(res2.status).toBe(201);
        expect(res2.headers['x-idempotent-replay']).toBe('true');
        expect(res2.body.data.id).toBe(caseId);
      });

      it('safely prevents rapid concurrent duplicate creations on the same machine', async () => {
        const payload = {
          assetId: assetPumpA.id,
          title: 'Rapid Duplicate Prevention Test',
          severity: 'MEDIUM',
          symptomDescription: 'Double-click prevention test symptom description.',
        };

        const res1 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send(payload);
        expect(res1.status).toBe(201);
        const firstId = res1.body.data.id;

        // Immediate second submission
        const res2 = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send(payload);
        expect(res2.status).toBe(201);
        expect(res2.body.data.id).toBe(firstId);
      });

      it('rejects update attempting mass-assignment of protected system fields', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Protected Field Guard',
            severity: 'LOW',
            symptomDescription: 'Attempting to overwrite protected system status directly.',
          });
        const caseId = createRes.body.data.id;

        const updateRes = await request(app)
          .patch(`/api/v1/maintenance/cases/${caseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            status: 'CLOSED',
            caseNumber: 'HACKED-CASE-999',
            reportedByUserId: userAdminB.id,
          });
        expect(updateRes.status).toBe(400);
        expect(updateRes.body.error).toContain('Mass assignment rejected: Protected field(s)');
      });

      it('detects concurrent modifications and rejects with 409 Conflict when expected updatedAt does not match', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Concurrency Test Case',
            severity: 'MEDIUM',
            symptomDescription: 'Testing optimistic locking concurrency detection.',
          });
        const caseId = createRes.body.data.id;

        // Simulate stale client sending outdated timestamp
        const staleTimestamp = '2020-01-01T00:00:00.000Z';
        const conflictRes = await request(app)
          .patch(`/api/v1/maintenance/cases/${caseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .set('If-Match', staleTimestamp)
          .send({
            title: 'Overwriting with stale version',
          });
        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.error).toContain('Conflict');
      });

      it('enforces resolution requirements before closing a work order (requires notes if unresolved)', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Unresolved Case Close Guard',
            severity: 'LOW',
            symptomDescription: 'Case created in REPORTED state.',
          });
        const caseId = createRes.body.data.id;

        // Attempting to close an unresolved case with no notes
        const closeWithoutNotesRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({});
        expect(closeWithoutNotesRes.status).toBe(400);
        expect(closeWithoutNotesRes.body.error).toContain('Cannot close an unresolved maintenance case without administrative closure notes');

        // Closing with valid administrative justification notes
        const closeWithNotesRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ notes: 'Administrative closure: Work cancelled due to equipment decommissioning.' });
        expect(closeWithNotesRes.status).toBe(200);
        expect(closeWithNotesRes.body.data.status).toBe('CLOSED');
        expect(closeWithNotesRes.body.data.closedAt).toBeDefined();

        // Attempting to close an already closed case
        const doubleCloseRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ notes: 'Attempting to re-close' });
        expect(doubleCloseRes.status).toBe(400);
        expect(doubleCloseRes.body.error).toContain('Cannot close an already closed maintenance case');
      });

      it('records parts used in findings submission and validates part item constraints', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Parts Used Workflow Test',
            severity: 'HIGH',
            symptomDescription: 'Mechanical seal replacement required.',
          });
        const caseId = createRes.body.data.id;

        // Invalid part entry (negative quantity)
        const invalidPartsRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/findings`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            observations: 'Seal faces worn down completely',
            resolutionSummary: 'Replaced cartridge seal',
            partsUsed: [
              { partNumber: 'SEAL-PKG-101', description: 'Cartridge seal', quantity: -1 },
            ],
          });
        expect(invalidPartsRes.status).toBe(400);
        expect(invalidPartsRes.body.error).toContain('quantity must be a positive number');

        // Valid parts recording
        const validPartsRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/findings`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            observations: 'Seal faces worn down completely',
            correctiveActions: 'Replaced cartridge mechanical seal and retorqued gland bolts',
            resolutionSummary: 'Overhaul completed in accordance with SOP-MECH-P101',
            partsUsed: [
              { partNumber: 'SEAL-PKG-101', description: 'Cartridge Mechanical Seal', quantity: 1 },
              { partNumber: 'GSK-FLG-04', description: 'Spiral Wound Gasket 4-inch', quantity: 2 },
            ],
          });
        expect(validPartsRes.status).toBe(200);
        expect(validPartsRes.body.data.findings.partsUsed).toHaveLength(2);
        expect(validPartsRes.body.data.partsUsed).toHaveLength(2);
        expect(validPartsRes.body.data.partsUsed[0].partNumber).toBe('SEAL-PKG-101');
      });

      it('rejects invalid feedback ratings and enforces reason length on escalation', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Feedback and Escalation Validation',
            severity: 'MEDIUM',
            symptomDescription: 'Testing feedback and escalation validation rules.',
          });
        const caseId = createRes.body.data.id;

        // Invalid feedback rating
        const badFeedbackRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/feedback`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ rating: 'EXCELLENT' });
        expect(badFeedbackRes.status).toBe(400);
        expect(badFeedbackRes.body.error).toContain("rating must be 'HELPFUL' or 'UNHELPFUL'");

        // Escalation reason too short (< 5)
        const shortEscalateRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/escalate`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ reason: 'Help' });
        expect(shortEscalateRes.status).toBe(400);
        expect(shortEscalateRes.body.error).toContain('reason is mandatory and must be between 5 and 2000 characters');

        // Valid escalation
        const goodEscalateRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/escalate`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ reason: 'Unusual acoustic emission detected at high load; physical specialist inspection needed.' });
        expect(goodEscalateRes.status).toBe(200);
        expect(goodEscalateRes.body.data.status).toBe('ESCALATED_HUMAN');
        expect(goodEscalateRes.body.data.isEscalated).toBe(true);
      });
    });

    describe('Prompt 08: Work Order Status Lifecycle Enforcement & Transition Rules', () => {
      it('enforces complete valid lifecycle: REPORTED -> INVESTIGATING -> DIAGNOSED -> IN_PROGRESS -> PENDING_APPROVAL -> RESOLVED -> CLOSED', async () => {
        // 1. Initial State: REPORTED
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Full Lifecycle Flow Test',
            severity: 'HIGH',
            symptomDescription: 'Impeller imbalance resulting in high 1X harmonics.',
          });
        expect(createRes.status).toBe(201);
        const caseId = createRes.body.data.id;
        expect(createRes.body.data.status).toBe('REPORTED');

        // 2. REPORTED -> INVESTIGATING
        const toInvestigating = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'INVESTIGATING', notes: 'Commencing initial AI diagnostic investigation.' });
        expect(toInvestigating.status).toBe(200);
        expect(toInvestigating.body.data.status).toBe('INVESTIGATING');

        // 3. INVESTIGATING -> DIAGNOSED
        const toDiagnosed = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'DIAGNOSED', notes: 'Diagnostic hypothesis generated and checklist approved.' });
        expect(toDiagnosed.status).toBe(200);
        expect(toDiagnosed.body.data.status).toBe('DIAGNOSED');

        // 4. DIAGNOSED -> IN_PROGRESS
        const toInProgress = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS', notes: 'Field work started by mechanical specialist.' });
        expect(toInProgress.status).toBe(200);
        expect(toInProgress.body.data.status).toBe('IN_PROGRESS');

        // 5. IN_PROGRESS -> PENDING_APPROVAL (with completion details)
        const toPending = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            status: 'PENDING_APPROVAL',
            notes: 'Work completed: dynamic balancing finished, residual vibration at 0.08 in/s.',
          });
        expect(toPending.status).toBe(200);
        expect(toPending.body.data.status).toBe('PENDING_APPROVAL');

        // 6. PENDING_APPROVAL -> RESOLVED (Admin approval)
        const toResolved = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ status: 'RESOLVED', notes: 'Verified baseline vibration specs. Approved for operation.' });
        expect(toResolved.status).toBe(200);
        expect(toResolved.body.data.status).toBe('RESOLVED');
        expect(toResolved.body.data.resolvedAt).toBeDefined();
        expect(toResolved.body.data.approval.status).toBe('APPROVED');

        // 7. RESOLVED -> CLOSED (Verified formal closure)
        const toClosed = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ status: 'CLOSED', notes: '24-hour run-in test passed. Work order closed.' });
        expect(toClosed.status).toBe(200);
        expect(toClosed.body.data.status).toBe('CLOSED');
        expect(toClosed.body.data.closedAt).toBeDefined();
      });

      it('enforces human escalation block and subsequent resumption to IN_PROGRESS', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Block and Resume Test',
            severity: 'CRITICAL',
            symptomDescription: 'Severe cavitation and pipe stress.',
          });
        const caseId = createRes.body.data.id;

        // Move to IN_PROGRESS
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        // Escalation / Block: requires reason of at least 5 chars
        const shortBlock = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'ESCALATED_HUMAN', reason: 'Fail' });
        expect(shortBlock.status).toBe(400);
        expect(shortBlock.body.error).toContain('Escalation requires a valid reason');

        const validBlock = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            status: 'ESCALATED_HUMAN',
            reason: 'High pressure line flange exhibits micro-fractures; specialist metallurgy engineer required.',
          });
        expect(validBlock.status).toBe(200);
        expect(validBlock.body.data.status).toBe('ESCALATED_HUMAN');
        expect(validBlock.body.data.isEscalated).toBe(true);

        // Resume back to IN_PROGRESS
        const resumeRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            status: 'IN_PROGRESS',
            notes: 'Metallurgist approved replacement weld procedure; field execution resumed.',
          });
        expect(resumeRes.status).toBe(200);
        expect(resumeRes.body.data.status).toBe('IN_PROGRESS');
      });

      it('enforces supervisor rejection and technician rework lifecycle loop', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Supervisor Rejection and Rework Test',
            severity: 'HIGH',
            symptomDescription: 'Shaft runout exceeds tolerance.',
          });
        const caseId = createRes.body.data.id;

        // Progress to PENDING_APPROVAL
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'PENDING_APPROVAL', notes: 'Shaft realigned to 0.003 inch total indicator reading.' });

        // Rejection without notes: rejected with 400
        const rejectNoNotes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ status: 'REJECTED' });
        expect(rejectNoNotes.status).toBe(400);
        expect(rejectNoNotes.body.error).toContain('notes are mandatory when rejecting');

        // Rejection with notes: moves to REJECTED
        const rejectWithNotes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            status: 'REJECTED',
            notes: 'Tolerance must be below 0.001 inch per API 610. Re-shim and repeat alignment.',
          });
        expect(rejectWithNotes.status).toBe(200);
        expect(rejectWithNotes.body.data.status).toBe('REJECTED');
        expect(rejectWithNotes.body.data.approval.status).toBe('REJECTED');

        // Technician resumes work for rework: moves REJECTED -> IN_PROGRESS
        const reworkRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS', notes: 'Replaced shims under non-drive end feet.' });
        expect(reworkRes.status).toBe(200);
        expect(reworkRes.body.data.status).toBe('IN_PROGRESS');

        // Resubmit findings: IN_PROGRESS -> PENDING_APPROVAL
        const resubmitRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/findings`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            observations: 'Dial indicator re-check confirmed TIR at 0.0008 inch.',
            resolutionSummary: 'Alignment complete and within API 610 spec.',
          });
        expect(resubmitRes.status).toBe(200);
        expect(resubmitRes.body.data.status).toBe('PENDING_APPROVAL');

        // Final approval: PENDING_APPROVAL -> RESOLVED
        const finalApprove = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/approval`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ approved: true, reviewerNotes: 'Verified laser alignment report. Approved.' });
        expect(finalApprove.status).toBe(200);
        expect(finalApprove.body.data.status).toBe('RESOLVED');
      });

      it('rejects prohibited status transitions with 400 Bad Request', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Prohibited Transitions Test',
            severity: 'MEDIUM',
            symptomDescription: 'Oil level low in reservoir.',
          });
        const caseId = createRes.body.data.id;

        // Prohibited: REPORTED -> RESOLVED directly
        const invalidDirectResolve = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ status: 'RESOLVED', notes: 'Trying to bypass workflow' });
        expect(invalidDirectResolve.status).toBe(400);
        expect(invalidDirectDirectError(invalidDirectResolve)).toContain('Invalid state transition');

        // Prohibited: IN_PROGRESS -> RESOLVED directly (must go to PENDING_APPROVAL first)
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        const directResolveFromInProgress = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ status: 'RESOLVED' });
        expect(directResolveFromInProgress.status).toBe(400);
        expect(directResolveFromInProgress.body.error).toContain('Invalid state transition');

        // Cannot call approval endpoint on a case not in PENDING_APPROVAL
        const prematureApproval = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/approval`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ approved: true });
        expect(prematureApproval.status).toBe(400);
        expect(prematureApproval.body.error).toContain('Case must be in \'PENDING_APPROVAL\'');

        // Close the case with notes
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ notes: 'Cancelled due to plant maintenance shutdown reschedule.' });

        // Prohibited: direct status transition on a CLOSED case (must use /reopen)
        const closedTransition = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ status: 'IN_PROGRESS' });
        expect(closedTransition.status).toBe(400);
        expect(closedTransition.body.error).toContain('Cannot transition a closed maintenance case directly');

        // Prohibited: calling diagnose on a CLOSED case
        const closedDiagnose = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/diagnose`)
          .set('Authorization', `Bearer ${tokenAdminA}`);
        expect(closedDiagnose.status).toBe(400);
        expect(closedDiagnose.body.error).toContain('Cannot run diagnosis on a closed maintenance case');

        // Prohibited: calling findings on a CLOSED case
        const closedFindings = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/findings`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ resolutionSummary: 'Attempting findings on closed case' });
        expect(closedFindings.status).toBe(400);
        expect(closedFindings.body.error).toContain('Cannot submit findings for a closed maintenance case');
      });

      it('rejects status transitions and approval reviews for unauthorized roles (RBAC)', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'RBAC Lifecycle Gate Test',
            severity: 'HIGH',
            symptomDescription: 'Coupling guard loose.',
          });
        const caseId = createRes.body.data.id;

        // Progress to PENDING_APPROVAL
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'PENDING_APPROVAL', notes: 'Coupling bolts tightened to specification.' });

        // Worker attempts to approve: 403 Forbidden
        const workerApprove = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenWorkerA}`)
          .send({ status: 'RESOLVED' });
        expect(workerApprove.status).toBe(403);

        // Tech attempts to approve via /status: 403 Forbidden
        const techApprove = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'RESOLVED' });
        expect(techApprove.status).toBe(403);

        // Worker attempts to close case: 403 Forbidden
        const workerClose = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenWorkerA}`)
          .send({ notes: 'Worker trying to close case' });
        expect(workerClose.status).toBe(403);

        // Worker attempts to reopen case: 403 Forbidden
        const workerReopen = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/reopen`)
          .set('Authorization', `Bearer ${tokenWorkerA}`)
          .send({ reason: 'Worker trying to reopen' });
        expect(workerReopen.status).toBe(403);
      });

      it('strictly rejects cross-organization access for status transition and reopening', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Cross Tenant Protection Test',
            severity: 'MEDIUM',
            symptomDescription: 'Testing cross organization containment.',
          });
        const caseId = createRes.body.data.id;

        // Tenant B admin attempts to transition status of Tenant A's case
        const crossStatus = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenAdminB}`)
          .send({ status: 'IN_PROGRESS' });
        expect(crossStatus.status).toBe(404);

        // Close case in Tenant A
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ notes: 'Administrative closure for cross-tenant testing.' });

        // Tenant B admin attempts to reopen Tenant A's closed case
        const crossReopen = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/reopen`)
          .set('Authorization', `Bearer ${tokenAdminB}`)
          .send({ reason: 'Cross tenant attempt to reopen case.' });
        expect(crossReopen.status).toBe(404);
      });

      it('enforces completion details requirement when submitting findings or transitioning to PENDING_APPROVAL', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Completion Details Requirement Test',
            severity: 'MEDIUM',
            symptomDescription: 'Bearing temperature high.',
          });
        const caseId = createRes.body.data.id;

        // Progress to IN_PROGRESS
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        // Attempt transition to PENDING_APPROVAL without any details or notes: 400 Bad Request
        const badTransition = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'PENDING_APPROVAL' });
        expect(badTransition.status).toBe(400);
        expect(badTransition.body.error).toContain('Completion requires resolution details');

        // Attempt findings with empty strings: 400 Bad Request
        const emptyFindings = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/findings`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ observations: '   ', correctiveActions: '' });
        expect(emptyFindings.status).toBe(400);
        expect(emptyFindings.body.error).toContain('Completion requires resolution details');

        // Valid transition with resolution notes: 200 OK
        const validTransition = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            status: 'PENDING_APPROVAL',
            notes: 'Re-greased DE and NDE bearings with synthetic polyurea grease; temperature stabilized at 62C.',
          });
        expect(validTransition.status).toBe(200);
        expect(validTransition.body.data.status).toBe('PENDING_APPROVAL');
      });

      it('supports administrative reopening of closed cases with mandatory reason and resets timestamps', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Reopen Lifecycle Test',
            severity: 'HIGH',
            symptomDescription: 'Testing full closure and reopening lifecycle.',
          });
        const caseId = createRes.body.data.id;

        // Progress and close
        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ notes: 'Initial maintenance session finished and closed.' });

        // Attempt reopen without reason
        const noReasonReopen = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/reopen`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({});
        expect(noReasonReopen.status).toBe(400);
        expect(noReasonReopen.body.error).toContain('reason is mandatory');

        // Attempt reopen with reason too short (< 5 chars)
        const shortReasonReopen = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/reopen`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ reason: 'Re' });
        expect(shortReasonReopen.status).toBe(400);
        expect(shortReasonReopen.body.error).toContain('between 5 and 2000 characters');

        // Successful reopen by Admin
        const validReopen = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/reopen`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            reason: 'Vibration recurred during shift handover; reopened for secondary investigation.',
            targetStatus: 'IN_PROGRESS',
          });
        expect(validReopen.status).toBe(200);
        expect(validReopen.body.data.status).toBe('IN_PROGRESS');
        expect(validReopen.body.data.closedAt).toBeNull();
        expect(validReopen.body.data.resolvedAt).toBeNull();

        // Attempt to reopen a case that is now ALREADY IN_PROGRESS: rejected with 400
        const reopenOpenCase = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/reopen`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ reason: 'Trying to reopen an open case' });
        expect(reopenOpenCase.status).toBe(400);
        expect(reopenOpenCase.body.error).toContain('Only closed cases can be reopened');
      });

      it('safely handles concurrent modification conflicts with 409 Conflict', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Concurrency Safety Test',
            severity: 'MEDIUM',
            symptomDescription: 'Testing optimistic locking during status changes.',
          });
        const caseId = createRes.body.data.id;

        // Transition with mismatched expectedUpdatedAt -> 409 Conflict
        const conflictRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({
            status: 'IN_PROGRESS',
            expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
          });
        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.error).toContain('Conflict: Maintenance case');

        // Transition with If-Match header mismatch -> 409 Conflict
        const headerConflictRes = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .set('If-Match', '2019-12-31T23:59:59.000Z')
          .send({ status: 'IN_PROGRESS' });
        expect(headerConflictRes.status).toBe(409);
        expect(headerConflictRes.body.error).toContain('Conflict');
      });

      it('is idempotent on repeated status transition requests without duplicating audit events', async () => {
        const createRes = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            assetId: assetPumpA.id,
            title: 'Idempotency and Retry Safety Test',
            severity: 'LOW',
            symptomDescription: 'Routine gauge inspection scheduled.',
          });
        const caseId = createRes.body.data.id;

        // Transition to INVESTIGATING
        const res1 = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'INVESTIGATING' });
        expect(res1.status).toBe(200);

        // Check history count
        const caseDetail1 = await request(app)
          .get(`/api/v1/maintenance/cases/${caseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`);
        const historyCount1 = caseDetail1.body.data.history.length;

        // Repeat identical transition request (retry safety)
        const res2 = await request(app)
          .post(`/api/v1/maintenance/cases/${caseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'INVESTIGATING' });
        expect(res2.status).toBe(200);

        // Check history count again: must be identical
        const caseDetail2 = await request(app)
          .get(`/api/v1/maintenance/cases/${caseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`);
        const historyCount2 = caseDetail2.body.data.history.length;
        expect(historyCount2).toBe(historyCount1);
      });
    });

    describe('Prompt 09: Work Order Assignment & Synchronization', () => {
      let testCaseId: string;

      beforeEach(async () => {
        const res = await request(app)
          .post('/api/v1/maintenance/cases')
          .set('Authorization', `Bearer ${tokenEngineerA}`)
          .send({
            plantId: plantA.id,
            assetId: assetPumpA.id,
            title: 'Pump Mechanical Seal Leak Inspection',
            symptomDescription: 'Continuous droplet leakage observed at mechanical seal primary face.',
            severity: 'HIGH',
          });
        expect(res.status).toBe(201);
        testCaseId = res.body.data.id;
      });

      it('1. Authorized assignment successfully persists technician and records audit/history', async () => {
        const assignRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            technicianUserId: userTechA.id,
            technicianName: 'Carlos Rodriguez Technician',
          });

        expect(assignRes.status).toBe(200);
        expect(assignRes.body.success).toBe(true);
        expect(assignRes.body.data.assignedTechnicianUserId).toBe(userTechA.id);
        expect(assignRes.body.data.assignedTechnicianName).toBe('Carlos Rodriguez Technician');
        // Status lifecycle unchanged
        expect(assignRes.body.data.status).toBe('REPORTED');

        // Verify persistence via GET
        const getRes = await request(app)
          .get(`/api/v1/maintenance/cases/${testCaseId}`)
          .set('Authorization', `Bearer ${tokenTechA}`);

        expect(getRes.status).toBe(200);
        expect(getRes.body.data.caseData.assignedTechnicianUserId).toBe(userTechA.id);
        expect(getRes.body.data.caseData.assignedTechnicianName).toBe('Carlos Rodriguez Technician');
        expect(getRes.body.data.assignedTechnician.id).toBe(userTechA.id);

        // Verify history entry
        const history = getRes.body.data.history;
        const assignEntry = history.find((h: any) => h.action === 'TECHNICIAN_ASSIGNED');
        expect(assignEntry).toBeDefined();
        expect(assignEntry.notes).toContain('Carlos Rodriguez Technician');
      });

      it('2. Reassignment updates technician, clears old technician from display, and records CASE_REASSIGNED', async () => {
        // First assign to userTechA
        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userTechA.id });

        // Reassign to userEngineerA
        const reassignRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userEngineerA.id });

        expect(reassignRes.status).toBe(200);
        expect(reassignRes.body.data.assignedTechnicianUserId).toBe(userEngineerA.id);
        expect(reassignRes.body.data.assignedTechnicianName).toBe('Elena Rostova Lead Technician');

        // Old technician is no longer displayed as assigned technician
        expect(reassignRes.body.data.assignedTechnicianUserId).not.toBe(userTechA.id);

        // Verify audit event in ledger
        const audits = await dataStore.listAuditEvents(orgA.id);
        const reassignAudit = audits.find(
          (a) => a.action === 'CASE_REASSIGNED' && a.resourceId === testCaseId
        );
        expect(reassignAudit).toBeDefined();
        expect(reassignAudit?.metadata?.previousTechnicianUserId).toBe(userTechA.id);
        expect(reassignAudit?.metadata?.newTechnicianUserId).toBe(userEngineerA.id);
      });

      it('3. Unassignment sets technician fields to null and records CASE_UNASSIGNED', async () => {
        // First assign
        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userTechA.id });

        // Unassign
        const unassignRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/unassign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ reason: 'Re-scheduling work order for next shift' });

        expect(unassignRes.status).toBe(200);
        expect(unassignRes.body.success).toBe(true);
        expect(unassignRes.body.data.assignedTechnicianUserId).toBeNull();
        expect(unassignRes.body.data.assignedTechnicianName).toBeNull();

        // Verify GET persistence
        const getRes = await request(app)
          .get(`/api/v1/maintenance/cases/${testCaseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`);
        expect(getRes.body.data.caseData.assignedTechnicianUserId).toBeNull();
        expect(getRes.body.data.caseData.assignedTechnicianName).toBeNull();
        expect(getRes.body.data.assignedTechnician).toBeNull();

        // Audit and history check
        const history = getRes.body.data.history;
        const unassignEntry = history.find((h: any) => h.action === 'TECHNICIAN_UNASSIGNED');
        expect(unassignEntry).toBeDefined();
        expect(unassignEntry.notes).toContain('Re-scheduling work order for next shift');
      });

      it('4. Unassigning an IN_PROGRESS case requires a justification reason (min 5 chars)', async () => {
        // Assign and move to IN_PROGRESS
        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userTechA.id });

        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'INVESTIGATING' });

        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/status`)
          .set('Authorization', `Bearer ${tokenTechA}`)
          .send({ status: 'IN_PROGRESS' });

        // Attempt unassign without reason -> fails with 400
        const failRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/unassign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({});

        expect(failRes.status).toBe(400);
        expect(failRes.body.error).toContain('reason');

        // Attempt unassign with reason < 5 chars -> fails with 400
        const shortRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/unassign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ reason: 'bad' });

        expect(shortRes.status).toBe(400);

        // Attempt unassign with valid reason -> succeeds
        const successRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/unassign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ reason: 'Emergency plant drill required technician evacuation' });

        expect(successRes.status).toBe(200);
        expect(successRes.body.data.assignedTechnicianUserId).toBeNull();
      });

      it('5. Assignment and unassignment are rejected on CLOSED or RESOLVED cases', async () => {
        // First resolve then close case
        await maintenanceEngine.diagnoseCase(testCaseId, {
          organizationId: orgA.id,
          userId: userEngineerA.id,
        });
        await maintenanceEngine.recordFindingsAndSubmit(
          testCaseId,
          { resolutionSummary: 'Fixed' },
          { organizationId: orgA.id, userId: userTechA.id }
        );
        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/approval`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ approved: true, reviewerNotes: 'Good' });

        await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/close`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ notes: 'Closed' });

        // Assign on closed case -> 400
        const assignRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userTechA.id });
        expect(assignRes.status).toBe(400);
        expect(assignRes.body.error).toContain('closed');

        // Unassign on closed case -> 400
        const unassignRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/unassign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ reason: 'Closed case unassign' });
        expect(unassignRes.status).toBe(400);
      });

      it('6. Unauthorized roles (WORKER, VIEWER) cannot assign or unassign (403 Forbidden)', async () => {
        // Worker attempting assignment -> 403
        const workerRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenWorkerA}`)
          .send({ technicianUserId: userTechA.id });
        expect(workerRes.status).toBe(403);

        // Viewer attempting assignment -> 403
        const viewerRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .send({ technicianUserId: userTechA.id });
        expect(viewerRes.status).toBe(403);

        // Worker attempting unassign -> 403
        const unassignWorkerRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/unassign`)
          .set('Authorization', `Bearer ${tokenWorkerA}`)
          .send({ reason: 'Unauthorized unassign attempt' });
        expect(unassignWorkerRes.status).toBe(403);
      });

      it('7. Cross-tenant assignment is strictly rejected (tenant isolation)', async () => {
        // Admin from Org B attempting to assign case from Org A -> 404 (case not found in orgB)
        const crossOrgCaseRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminB}`)
          .send({ technicianUserId: userAdminB.id });
        expect([403, 404]).toContain(crossOrgCaseRes.status);

        // Admin from Org A attempting to assign user from Org B to Org A case -> 400 / 404 (user not in orgA)
        const crossOrgUserRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userAdminB.id });
        expect([400, 404]).toContain(crossOrgUserRes.status);
      });

      it('8. Reject non-existent or ineligible user assignment', async () => {
        // Non-existent technician UUID -> 404
        const nonExistentRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: '00000000-0000-0000-0000-000000000000' });
        expect([400, 404]).toContain(nonExistentRes.status);

        // VIEWER role is ineligible for field technician assignment -> 400
        const viewerAssignRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userViewerA.id });
        expect(viewerAssignRes.status).toBe(400);
        expect(viewerAssignRes.body.error).toContain('not eligible');
      });

      it('9. Optimistic concurrency: stale expectedUpdatedAt returns 409 Conflict', async () => {
        const staleTimestamp = new Date(Date.now() - 100000).toISOString();

        const conflictRes = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({
            technicianUserId: userTechA.id,
            expectedUpdatedAt: staleTimestamp,
          });

        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.error).toContain('modified by another operation');
      });

      it('10. Repeated assignment to same technician is idempotent without duplicate audit entries', async () => {
        // First assignment
        const res1 = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userTechA.id });
        expect(res1.status).toBe(200);

        const caseAfter1 = await request(app)
          .get(`/api/v1/maintenance/cases/${testCaseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`);
        const historyCount1 = caseAfter1.body.data.history.length;

        // Duplicate assignment request
        const res2 = await request(app)
          .post(`/api/v1/maintenance/cases/${testCaseId}/assign`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ technicianUserId: userTechA.id });
        expect(res2.status).toBe(200);

        const caseAfter2 = await request(app)
          .get(`/api/v1/maintenance/cases/${testCaseId}`)
          .set('Authorization', `Bearer ${tokenAdminA}`);
        const historyCount2 = caseAfter2.body.data.history.length;

        // No duplicate history recorded for identical re-assignment
        expect(historyCount2).toBe(historyCount1);
      });

      it('11. GET /api/v1/maintenance/technicians lists active eligible organization members and excludes VIEWER', async () => {
        const res = await request(app)
          .get('/api/v1/maintenance/technicians')
          .set('Authorization', `Bearer ${tokenAdminA}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const list = res.body.data;
        expect(Array.isArray(list)).toBe(true);

        const userIds = list.map((t: any) => t.userId);
        // Includes eligible members: Admin, Engineer, Tech, Worker
        expect(userIds).toContain(userAdminA.id);
        expect(userIds).toContain(userEngineerA.id);
        expect(userIds).toContain(userTechA.id);

        // Excludes VIEWER role
        expect(userIds).not.toContain(userViewerA.id);
        // Excludes Org B members (tenant isolation)
        expect(userIds).not.toContain(userAdminB.id);
      });
    });
  });
});

function invalidDirectDirectError(res: any): string {
  return res.body?.error || '';
}



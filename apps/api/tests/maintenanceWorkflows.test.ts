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
  let userViewerA: any;
  let userAdminB: any;
  let plantA: any;
  let plantB: any;
  let assetPumpA: any;

  let tokenAdminA: string;
  let tokenEngineerA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;

  // Ingested Document Chunks
  let docA: any;
  let versionA: any;
  let chunkSopA: any;

  const jwtSecret = 'test_jwt_secret_for_maintenance_phase6';

  beforeEach(async () => {
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

    const vecSopA = await embeddingAdapter.generateEmbedding(sopContent);
    await vectorStore.upsertPoints('forgex_knowledge', [
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
});


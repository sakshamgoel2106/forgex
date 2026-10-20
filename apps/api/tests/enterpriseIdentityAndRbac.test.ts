import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
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

describe('ForgeX AI — Prompt 01: Enterprise Identity, RBAC and Confidential Knowledge Access', () => {
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

  const jwtSecret = 'test_jwt_secret_identity_rbac_p01_9988776655';

  // Org A Fixtures
  let orgA: any;
  let ownerUserA: any;
  let adminUserA: any;
  let workerUserA: any;
  let otherWorkerUserA: any;
  let plantA: any;
  let machineA: any;

  let ownerTokenA: string;
  let adminTokenA: string;
  let workerTokenA: string;
  let otherWorkerTokenA: string;

  // Org B Fixtures
  let orgB: any;
  let ownerUserB: any;
  let plantB: any;
  let ownerTokenB: string;

  // Document Fixtures
  let confidentialDoc: any;
  let docVersion: any;

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(os.tmpdir(), `forgex-rbac-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempStorageDir, { recursive: true });
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-rbac-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    generationProvider = new LocalDevInferenceAdapter('forgex-test-inference-model');
    rerankingProvider = new ReciprocalRankFusionReranker(60);

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider
    );

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
    });

    // 1. Company Registration & Initial Owner for Org A
    orgA = await dataStore.createOrganization({
      name: 'Apex Petrochemicals',
      slug: 'apex-petro',
    });
    ownerUserA = await dataStore.createUser({
      email: 'owner@apexpetro.com',
      fullName: 'Alice Vance',
      externalAuthId: 'ext_owner_a',
    });
    const ownerMemA = await dataStore.createMembership({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      role: 'ORGANIZATION_OWNER',
      status: 'ACTIVE',
    });
    ownerTokenA = LocalDevAuthAdapter.generateDevToken(
      { id: ownerUserA.externalAuthId, email: ownerUserA.email, emailVerified: true },
      jwtSecret
    );

    // 2. Plant & Machine in Org A
    plantA = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-A1',
      name: 'Baton Rouge Refinery',
      location: 'Louisiana, USA',
    });
    machineA = await dataStore.createMachine(orgA.id, {
      plantId: plantA.id,
      assetTag: 'PUMP-401',
      name: 'Slurry Feed Pump 401',
      machineType: 'PUMP',
      status: 'ONLINE',
      criticality: 'CRITICAL',
    });

    // 3. Organization Admin in Org A
    adminUserA = await dataStore.createUser({
      email: 'admin@apexpetro.com',
      fullName: 'Bob Martinez',
      externalAuthId: 'ext_admin_a',
    });
    const adminMemA = await dataStore.createMembership({
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
    });
    adminTokenA = LocalDevAuthAdapter.generateDevToken(
      { id: adminUserA.externalAuthId, email: adminUserA.email, emailVerified: true },
      jwtSecret
    );

    // 4. Worker in Org A
    workerUserA = await dataStore.createUser({
      email: 'worker1@apexpetro.com',
      fullName: 'Charlie Davis',
      externalAuthId: 'ext_worker_a',
    });
    const workerMemA = await dataStore.createMembership({
      organizationId: orgA.id,
      userId: workerUserA.id,
      role: 'WORKER',
      status: 'ACTIVE',
      assignedPlantIds: [plantA.id],
    });
    workerTokenA = LocalDevAuthAdapter.generateDevToken(
      { id: workerUserA.externalAuthId, email: workerUserA.email, emailVerified: true },
      jwtSecret
    );

    // 5. Second Worker in Org A (for IDOR testing)
    otherWorkerUserA = await dataStore.createUser({
      email: 'worker2@apexpetro.com',
      fullName: 'David Smith',
      externalAuthId: 'ext_worker2_a',
    });
    const otherWorkerMemA = await dataStore.createMembership({
      organizationId: orgA.id,
      userId: otherWorkerUserA.id,
      role: 'WORKER',
      status: 'ACTIVE',
      assignedPlantIds: [plantA.id],
    });
    otherWorkerTokenA = LocalDevAuthAdapter.generateDevToken(
      { id: otherWorkerUserA.externalAuthId, email: otherWorkerUserA.email, emailVerified: true },
      jwtSecret
    );

    // 6. Organization B Setup (Cross-Tenant)
    orgB = await dataStore.createOrganization({
      name: 'Zenith Energy Global',
      slug: 'zenith-energy',
    });
    ownerUserB = await dataStore.createUser({
      email: 'owner@zenithenergy.com',
      fullName: 'Zoe Brooks',
      externalAuthId: 'ext_owner_b',
    });
    const ownerMemB = await dataStore.createMembership({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      role: 'ORGANIZATION_OWNER',
      status: 'ACTIVE',
    });
    ownerTokenB = LocalDevAuthAdapter.generateDevToken(
      { id: ownerUserB.externalAuthId, email: ownerUserB.email, emailVerified: true },
      jwtSecret
    );

    plantB = await dataStore.createPlant(orgB.id, {
      code: 'PLANT-B1',
      name: 'Rotterdam Terminal',
      location: 'Netherlands',
    });

    // 7. Confidential Document in Org A
    confidentialDoc = await dataStore.createDocument({
      organizationId: orgA.id,
      plantId: plantA.id,
      title: 'Confidential OEM Reactor Operation Manual',
      documentNumber: 'CONF-MAN-001',
      category: 'MANUAL',
      sourceFilename: 'confidential_manual.pdf',
      mimeType: 'application/pdf',
      dataClassification: 'CONFIDENTIAL',
      isConfidential: true,
      allowedRoles: ['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'],
    });

    const fileBuffer = Buffer.from('CONFIDENTIAL PROPRIETARY OEM REACTOR OPERATIONAL DATA - RESTRICTED');
    const storageKey = `raw-documents/${orgA.id}/${plantA.id}/confidential_manual.pdf`;
    await storageAdapter.putObject(storageKey, fileBuffer, 'application/pdf');

    docVersion = await dataStore.createDocumentVersion({
      documentId: confidentialDoc.id,
      versionNumber: 1,
      revision: 'REV-A',
      filename: 'confidential_manual.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: fileBuffer.length,
      checksumSha256: 'sha256_mock_hash_123',
      storageKey,
      status: 'COMPLETED',
    });

    // Add a chunk to vector store for confidential manual
    const chunkId = 'chunk_conf_manual_1';
    await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: docVersion.id,
        pageNumber: 1,
        chunkIndex: 0,
        qdrantPointId: chunkId,
        content: 'CONFIDENTIAL PROPRIETARY OEM REACTOR OPERATIONAL DATA - RESTRICTED: Section 4.1 Internal Impeller Clearances',
        sectionHeading: 'Section 4.1 Internal Clearances',
        extractionMethod: 'NATIVE_TEXT',
        tokenCount: 40,
      },
    ]);

    const embedding = await embeddingAdapter.generateEmbedding('Reactor Clearances Slurry Pump');
    await vectorStore.upsertPoints(
      'forgex_knowledge',
      [
        {
          id: chunkId,
          vector: embedding,
          payload: {
            chunkId,
            documentId: confidentialDoc.id,
            documentVersionId: docVersion.id,
            organizationId: orgA.id,
            plantId: plantA.id,
            pageNumber: 1,
            content: 'CONFIDENTIAL PROPRIETARY OEM REACTOR OPERATIONAL DATA - RESTRICTED: Section 4.1 Internal Impeller Clearances',
            sectionHeading: 'Section 4.1 Internal Clearances',
          },
        },
      ]
    );
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 1: Cross-Tenant Isolation
  // --------------------------------------------------------------------------
  it('1. Organization A cannot access Organization B records and vice-versa', async () => {
    // Org A user attempts to get Org B's plant
    const plantRes = await request(app)
      .get(`/api/v1/plants/${plantB.id}`)
      .set('Authorization', `Bearer ${ownerTokenA}`);
    expect(plantRes.status).toBe(404);

    // Org B user attempts to get Org A's plant
    const plantResB = await request(app)
      .get(`/api/v1/plants/${plantA.id}`)
      .set('Authorization', `Bearer ${ownerTokenB}`);
    expect(plantResB.status).toBe(404);

    // Org B user attempts to access Org A's documents
    const docRes = await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}`)
      .set('Authorization', `Bearer ${ownerTokenB}`);
    expect(docRes.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 2: Strict Original Document Rule
  // --------------------------------------------------------------------------
  it('2. Worker cannot download original confidential manuals, but Admin can', async () => {
    // Admin A can download the document
    const adminDownload = await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}/download`)
      .set('Authorization', `Bearer ${adminTokenA}`);
    expect(adminDownload.status).toBe(200);

    // Worker A is strictly forbidden from downloading the original manual
    const workerDownload = await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}/download`)
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(workerDownload.status).toBe(403);
    expect(workerDownload.body.success).toBe(false);
    expect(workerDownload.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // Worker A is also forbidden from listing or browsing documents directly
    const workerList = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(workerList.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 3: Governed Publishing of Approved Guidance
  // --------------------------------------------------------------------------
  it('3. Non-admin cannot publish guidance; Admin can publish approved guidance', async () => {
    // Worker attempts to publish guidance -> rejected with 403 Forbidden
    const unauthPublish = await request(app)
      .post('/api/v1/guidance/publish')
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({
        plantId: plantA.id,
        machineId: machineA.id,
        title: 'Unauthorized Guidance Test',
        guidanceContent: 'Step 1: Open valve.',
      });
    expect(unauthPublish.status).toBe(403);
    expect(unauthPublish.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // Admin publishes approved operational guidance
    const adminPublish = await request(app)
      .post('/api/v1/guidance/publish')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        plantId: plantA.id,
        machineId: machineA.id,
        machineAssetTag: machineA.assetTag,
        title: 'Approved Slurry Pump 401 Startup Procedure',
        guidanceContent: '1. Verify suction valve is 100% open.\n2. Prime mechanical seal buffer fluid.\n3. Slowly ramp VFD to 1200 RPM.',
        sourceDocumentId: confidentialDoc.id,
        sourceDocumentNumber: confidentialDoc.documentNumber,
        sourceDocumentVersionId: docVersion.id,
        sourceSectionHeading: 'Section 4.1 Startup Guidelines',
        sourcePageNumber: 12,
        applicableRoles: ['WORKER', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER'],
        disclosureClassification: 'WORKER_APPROVED',
      });

    expect(adminPublish.status).toBe(201);
    expect(adminPublish.body.success).toBe(true);
    expect(adminPublish.body.data.title).toBe('Approved Slurry Pump 401 Startup Procedure');
    expect(adminPublish.body.data.status).toBe('PUBLISHED');
    expect(adminPublish.body.data.reviewedByUserEmail).toBe('admin@apexpetro.com');
    expect(adminPublish.body.data.revisionNumber).toBe(1);

    const guidanceId = adminPublish.body.data.id;

    // Worker can read the approved operational guidance
    const workerGuidanceList = await request(app)
      .get('/api/v1/guidance')
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(workerGuidanceList.status).toBe(200);
    expect(workerGuidanceList.body.data.length).toBeGreaterThanOrEqual(1);
    expect(workerGuidanceList.body.data[0].id).toBe(guidanceId);

    const workerGuidanceGet = await request(app)
      .get(`/api/v1/guidance/${guidanceId}`)
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(workerGuidanceGet.status).toBe(200);
    expect(workerGuidanceGet.body.data.title).toBe('Approved Slurry Pump 401 Startup Procedure');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 4: Worker RAG Retrieves Approved Guidance & Protects Confidential Manuals
  // --------------------------------------------------------------------------
  it('4. Worker Copilot query receives approved guidance, protects confidential manual text, and masks citations', async () => {
    // 1. Publish approved operational guidance for Slurry Pump 401
    await dataStore.publishGuidance(orgA.id, adminUserA.id, adminUserA.email, {
      plantId: plantA.id,
      machineId: machineA.id,
      machineAssetTag: machineA.assetTag,
      title: 'Approved Slurry Pump Operational Guidelines',
      guidanceContent: 'Standard approved operating steps: Keep seal pressure at 3.5 bar and monitor bearing vibration.',
      sourceDocumentId: confidentialDoc.id,
      sourceDocumentNumber: confidentialDoc.documentNumber,
      sourceSectionHeading: 'Safe Operating Parameters',
      sourcePageNumber: 5,
      applicableRoles: ['WORKER', 'TECHNICIAN'],
      disclosureClassification: 'WORKER_APPROVED',
    });

    // 2. Worker executes Copilot query
    const copilotRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({
        plantId: plantA.id,
        assetId: machineA.id,
        query: 'What is the approved procedure for operating Slurry Feed Pump PUMP-401?',
      });

    expect(copilotRes.status).toBe(200);
    expect(copilotRes.body.success).toBe(true);

    const assistantContent = copilotRes.body.data.assistantMessage.content;
    expect(assistantContent).toBeDefined();

    // Verify raw confidential OEM manual text is NOT exposed in the answer
    expect(assistantContent).not.toContain('CONFIDENTIAL PROPRIETARY OEM REACTOR OPERATIONAL DATA');

    // Verify citations are masked for non-admin Worker
    const citations = copilotRes.body.data.assistantMessage.citations;
    if (citations && citations.length > 0) {
      for (const citation of citations) {
        expect(citation.snippet).not.toContain('CONFIDENTIAL PROPRIETARY OEM REACTOR OPERATIONAL DATA');
      }
    }
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 5: Conversation IDOR Protection
  // --------------------------------------------------------------------------
  it('5. Worker cannot access another employee saved conversation (IDOR prevention)', async () => {
    // 1. Worker 1 creates a conversation
    const createRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({
        plantId: plantA.id,
        assetId: machineA.id,
        query: 'How to check lube oil level on PUMP-401?',
      });
    expect(createRes.status).toBe(200);
    const convId = createRes.body.data.conversationId;

    // 2. Worker 1 can view their own conversation
    const selfRes = await request(app)
      .get(`/api/v1/copilot/conversations/${convId}`)
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(selfRes.status).toBe(200);
    expect(selfRes.body.data.id).toBe(convId);

    // 3. Worker 2 attempts to view Worker 1 conversation -> 403 Forbidden
    const otherRes = await request(app)
      .get(`/api/v1/copilot/conversations/${convId}`)
      .set('Authorization', `Bearer ${otherWorkerTokenA}`);
    expect(otherRes.status).toBe(403);
    expect(otherRes.body.success).toBe(false);
    expect(otherRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 6: Membership Revocation & Suspension Enforcement
  // --------------------------------------------------------------------------
  it('6. Revoked or suspended membership immediately loses access on subsequent requests', async () => {
    // 1. Worker can initially access plants
    const initialRes = await request(app)
      .get('/api/v1/plants')
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(initialRes.status).toBe(200);

    // 2. Admin revokes the Worker's membership
    const members = await dataStore.listOrganizationMembers(orgA.id);
    const workerMem = members.find((m) => m.userId === workerUserA.id);
    expect(workerMem).toBeDefined();

    const revokeRes = await request(app)
      .patch(`/api/v1/org/members/${workerMem!.id}/status`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ status: 'REVOKED' });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('REVOKED');

    // 3. Worker's subsequent request is rejected with 403 Forbidden
    const subsequentRes = await request(app)
      .get('/api/v1/plants')
      .set('Authorization', `Bearer ${workerTokenA}`);
    expect(subsequentRes.status).toBe(403);
    expect(subsequentRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // 4. Verify audit event was recorded for revocation
    const auditRes = await request(app)
      .get('/api/v1/audit/events')
      .set('Authorization', `Bearer ${adminTokenA}`);
    expect(auditRes.status).toBe(200);
    const revokeAudit = auditRes.body.data.find(
      (a: any) => a.action === 'MEMBER_REVOKED' && a.resourceId === workerMem!.id
    );
    expect(revokeAudit).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 7: Role Escalation Blocking
  // --------------------------------------------------------------------------
  it('7. Direct backend role escalation and unauthorized role delegation fail', async () => {
    // Worker attempts to invite an employee -> 403 Forbidden (missing members:invite permission)
    const workerInvite = await request(app)
      .post('/api/v1/org/invitations')
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({
        email: 'newworker@apexpetro.com',
        role: 'WORKER',
      });
    expect(workerInvite.status).toBe(403);

    // Admin attempts to invite an ORGANIZATION_OWNER -> 403 Forbidden (hierarchy escalation blocked)
    const adminEscalateOwner = await request(app)
      .post('/api/v1/org/invitations')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        email: 'impostorowner@apexpetro.com',
        role: 'ORGANIZATION_OWNER',
      });
    expect(adminEscalateOwner.status).toBe(403);
    expect(adminEscalateOwner.body.error.code).toBe('FORGEX_RBAC_ESCALATION_BLOCKED');

    // Admin attempts to change someone's role to ORGANIZATION_OWNER -> 403 Forbidden
    const members = await dataStore.listOrganizationMembers(orgA.id);
    const otherWorkerMem = members.find((m) => m.userId === otherWorkerUserA.id);
    expect(otherWorkerMem).toBeDefined();

    const adminPromoteToOwner = await request(app)
      .patch(`/api/v1/org/members/${otherWorkerMem!.id}/role`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ role: 'ORGANIZATION_OWNER' });
    expect(adminPromoteToOwner.status).toBe(403);
    expect(adminPromoteToOwner.body.error.code).toBe('FORGEX_RBAC_ESCALATION_BLOCKED');
  });
});

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
import { SecurityEventService } from '../src/services/securityEvent.service.js';
import type {
  Organization,
  Plant,
  User,
  Document,
  DocumentVersion,
  Machine,
  OrganizationMembership,
} from '@forgex/shared-types';

describe('ForgeX AI — Universal Copilot, Confidential Access Protection & Admin Security Alerts', () => {
  const jwtSecret = 'test_security_alerts_secret_key_at_least_32_chars';
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
  let securityService: SecurityEventService;
  let app: any;

  // Organizations
  let orgAlpha: Organization;
  let orgBeta: Organization;

  // Plants
  let plantNorth: Plant;
  let plantSouth: Plant;

  // Users (Org Alpha)
  let userAlphaAdmin: User;
  let userAlphaWorker: User;
  let userAlphaTech: User;
  let userAlphaEngineer: User;
  let userAlphaViewer: User;

  // Users (Org Beta)
  let userBetaAdmin: User;
  let userBetaWorker: User;

  // Memberships
  let membershipWorker: OrganizationMembership;

  // Tokens
  let tokenAlphaAdmin: string;
  let tokenAlphaWorker: string;
  let tokenAlphaTech: string;
  let tokenAlphaEngineer: string;
  let tokenAlphaViewer: string;
  let tokenBetaAdmin: string;
  let tokenBetaWorker: string;

  // Machine
  let machinePump: Machine;

  // Confidential Document
  let confidentialDoc: Document;
  let confidentialVer: DocumentVersion;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter(
      path.join(process.cwd(), 'data', 'test_security_alerts_storage')
    );
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();
    securityService = new SecurityEventService(dataStore);

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
      process.env.QDRANT_COLLECTION || 'forgex_knowledge',
      securityService
    );

    app = createApp({
      authAdapter,
      dataStore,
      vectorStore,
      storageAdapter,
      embeddingAdapter,
      visionProvider,
      generationProvider,
      rerankingProvider,
      ingestionQueue,
      ragEngine,
      securityService,
    });

    // 1. Create Organizations
    orgAlpha = await dataStore.createOrganization({
      name: 'Alpha Energy Technologies',
      slug: 'alpha-energy',
    });

    orgBeta = await dataStore.createOrganization({
      name: 'Beta Global Refining',
      slug: 'beta-refining',
    });

    // 2. Create Plants in Alpha
    plantNorth = await dataStore.createPlant(orgAlpha.id, {
      name: 'North Olefins Facility',
      code: 'PLANT-NORTH',
      location: 'Baytown, TX',
    });

    plantSouth = await dataStore.createPlant(orgAlpha.id, {
      name: 'South Utilities Complex',
      code: 'PLANT-SOUTH',
      location: 'Corpus Christi, TX',
    });

    // 3. Create Users
    userAlphaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_alpha_admin',
      email: 'admin@alpha-energy.com',
      fullName: 'Alice Admin',
    });

    userAlphaWorker = await dataStore.createUser({
      externalAuthId: 'ext_alpha_worker',
      email: 'worker@alpha-energy.com',
      fullName: 'Walter Worker',
    });

    userAlphaTech = await dataStore.createUser({
      externalAuthId: 'ext_alpha_tech',
      email: 'tech@alpha-energy.com',
      fullName: 'Tommy Technician',
    });

    userAlphaEngineer = await dataStore.createUser({
      externalAuthId: 'ext_alpha_eng',
      email: 'eng@alpha-energy.com',
      fullName: 'Elena Engineer',
    });

    userAlphaViewer = await dataStore.createUser({
      externalAuthId: 'ext_alpha_viewer',
      email: 'viewer@alpha-energy.com',
      fullName: 'Victor Viewer',
    });

    userBetaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_beta_admin',
      email: 'admin@beta-refining.com',
      fullName: 'Bob Beta Admin',
    });

    userBetaWorker = await dataStore.createUser({
      externalAuthId: 'ext_beta_worker',
      email: 'worker@beta-refining.com',
      fullName: 'Bill Beta Worker',
    });

    // 4. Create Memberships
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });

    membershipWorker = await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaWorker.id,
      role: 'WORKER',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTech.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaEngineer.id,
      role: 'ENGINEER',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaViewer.id,
      role: 'VIEWER',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });

    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaWorker.id,
      role: 'WORKER',
    });

    // 5. Generate Dev Auth Tokens
    tokenAlphaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaAdmin.externalAuthId, email: userAlphaAdmin.email, emailVerified: true },
      jwtSecret
    );

    tokenAlphaWorker = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaWorker.externalAuthId, email: userAlphaWorker.email, emailVerified: true },
      jwtSecret
    );

    tokenAlphaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTech.externalAuthId, email: userAlphaTech.email, emailVerified: true },
      jwtSecret
    );

    tokenAlphaEngineer = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaEngineer.externalAuthId, email: userAlphaEngineer.email, emailVerified: true },
      jwtSecret
    );

    tokenAlphaViewer = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaViewer.externalAuthId, email: userAlphaViewer.email, emailVerified: true },
      jwtSecret
    );

    tokenBetaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaAdmin.externalAuthId, email: userBetaAdmin.email, emailVerified: true },
      jwtSecret
    );

    tokenBetaWorker = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaWorker.externalAuthId, email: userBetaWorker.email, emailVerified: true },
      jwtSecret
    );

    // 6. Register a Machine in plantNorth
    machinePump = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantNorth.id,
      assetTag: 'PUMP-204-B',
      name: 'Heavy Crude Booster Pump B',
      machineType: 'Centrifugal Slurry Pump',
      area: 'Process Unit Deck 2',
      operationalState: 'NORMAL',
      criticality: 'HIGH',
      dataClassification: 'CONFIDENTIAL',
    });

    // 7. Store a Confidential Document in orgAlpha
    const rawPdfBuffer = Buffer.from('%PDF-1.4 Confidential Proprietary OEM Manual for PUMP-204-B');
    const storageKey = `test_docs/${orgAlpha.id}/CONF-SOP-PUMP-204.pdf`;
    await storageAdapter.putObject(storageKey, rawPdfBuffer, 'application/pdf');

    confidentialDoc = await dataStore.createDocument({
      organizationId: orgAlpha.id,
      plantId: plantNorth.id,
      documentNumber: 'CONF-SOP-PUMP-204',
      title: 'Confidential Proprietary Overhaul SOP for PUMP-204-B',
      category: 'SOP',
      assetTags: ['PUMP-204-B'],
    });

    confidentialVer = await dataStore.createDocumentVersion({
      documentId: confidentialDoc.id,
      versionNumber: 1,
      storageKey,
      filename: 'CONF-SOP-PUMP-204.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: rawPdfBuffer.length,
      checksumSha256: 'sha256-abcdef1234567890',
      status: 'READY',
    });

    // Seed confidential vector chunk
    const [chunk] = await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: confidentialVer.id,
        pageNumber: 3,
        chunkIndex: 0,
        qdrantPointId: '00000000-0000-4000-8000-000000000099',
        content: 'Internal secret proprietary clearance: The mechanical seal spring compression distance for PUMP-204-B is exactly 2.14mm. Secret bolt torque is 85 Nm.',
        sectionHeading: 'SECTION 3: CONFIDENTIAL TOLERANCES',
        extractionMethod: 'NATIVE_TEXT',
        tokenCount: 25,
      },
    ]);

    const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
    const vector = await embeddingAdapter.generateEmbedding(chunk.content);
    await vectorStore.ensureCollection(collectionName, embeddingAdapter.getDimensions());
    await vectorStore.upsertPoints(collectionName, [
      {
        id: chunk.id,
        vector,
        payload: {
          organizationId: orgAlpha.id,
          plantId: plantNorth.id,
          documentId: confidentialDoc.id,
          documentVersionId: confidentialVer.id,
          pageNumber: 3,
          chunkId: chunk.id,
          content: chunk.content,
          sectionHeading: chunk.sectionHeading,
          dataClassification: 'CONFIDENTIAL',
        },
      },
    ]);
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 1: Universal Copilot for Every Authorized Member
  // ==========================================================================
  it('1. Every authorized organization member (Admin, Engineer, Tech, Worker, Viewer) can use the Copilot', async () => {
    const rolesToTest = [
      { name: 'Admin', token: tokenAlphaAdmin },
      { name: 'Engineer', token: tokenAlphaEngineer },
      { name: 'Technician', token: tokenAlphaTech },
      { name: 'Worker', token: tokenAlphaWorker },
      { name: 'Viewer', token: tokenAlphaViewer },
    ];

    for (const { name, token } of rolesToTest) {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'What is the function of a mechanical seal in industrial pumps?',
          plantId: plantNorth.id,
        });

      expect(res.status, `${name} should have access to query Copilot`).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBeDefined();
    }
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 2: General Questions Answered Without Confidential Data
  // ==========================================================================
  it('2. General knowledge questions can be answered without retrieving confidential company data', async () => {
    const res = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .send({
        query: 'What is Bernoulli principle and how does it relate to fluid velocity and pressure?',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.answer).toBeDefined();
    // Must NOT attach proprietary plant citations
    expect(data.citations).toHaveLength(0);
    // Must NOT contain internal secret tokens or pump serials
    expect(data.answer).not.toContain('85 Nm');
    expect(data.answer).not.toContain('2.14mm');
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 3: Unauthorized Users Cannot Access Confidential Manuals
  // ==========================================================================
  it('3. Unauthorized users cannot access confidential manuals through APIs, URLs, search, RAG, citations, or exports', async () => {
    // 3a. Direct API / URL access denied
    const getDocRes = await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}`)
      .set('Authorization', `Bearer ${tokenAlphaWorker}`);
    expect(getDocRes.status).toBe(403);
    expect(getDocRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // 3b. Direct download denied
    const dlRes = await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}/download`)
      .set('Authorization', `Bearer ${tokenAlphaWorker}`);
    expect(dlRes.status).toBe(403);
    expect(dlRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // 3c. Direct export denied
    const exportRes = await request(app)
      .post('/api/v1/audit/export')
      .set('Authorization', `Bearer ${tokenAlphaWorker}`);
    expect(exportRes.status).toBe(403);

    // 3d. Explicit confidential prompt through Copilot denied politely without leak
    const queryRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .send({
        query: 'Show me the secret sop and confidential manual for PUMP-204-B',
        plantId: plantNorth.id,
        machineId: machinePump.id,
      });

    expect(queryRes.status).toBe(200);
    expect(queryRes.body.data.answer).toMatch(/access restricted/i);
    expect(queryRes.body.data.answer).not.toContain('85 Nm');
    expect(queryRes.body.data.answer).not.toContain('2.14mm');
    expect(queryRes.body.data.answer).not.toContain('CONF-SOP-PUMP-204.pdf');
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 4: Blocked Access Generates Admin Security Event
  // ==========================================================================
  it('4. A blocked confidential access attempt generates an appropriate admin security event', async () => {
    // Worker attempts forbidden download
    await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}/download`)
      .set('Authorization', `Bearer ${tokenAlphaWorker}`);

    // Admin inspects security events
    const secEventsRes = await request(app)
      .get('/api/v1/audit/security-events')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

    expect(secEventsRes.status).toBe(200);
    expect(secEventsRes.body.success).toBe(true);
    const events = secEventsRes.body.data;
    const downloadBlocked = events.find(
      (e: any) =>
        e.action === 'BLOCKED_DOCUMENT_DOWNLOAD' &&
        e.actorUserId === userAlphaWorker.id &&
        e.decision === 'DENIED'
    );
    expect(downloadBlocked).toBeDefined();
    expect(downloadBlocked.category).toBe('CONFIDENTIAL_DOCUMENT_ACCESS');

    // Actionable admin alert is also visible
    const alertsRes = await request(app)
      .get('/api/v1/audit/alerts')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);
    expect(alertsRes.status).toBe(200);
    const alerts = alertsRes.body.data;
    const alert = alerts.find((a: any) => a.actorUserId === userAlphaWorker.id);
    expect(alert).toBeDefined();
    expect(alert.status).toBe('OPEN');
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 5: Repeated Suspicious Events Correlated & Escalated
  // ==========================================================================
  it('5. Repeated suspicious events can be correlated and escalated with elevated severity', async () => {
    // Worker attempts multiple blocked actions in rapid succession
    for (let i = 0; i < 3; i++) {
      await request(app)
        .get(`/api/v1/documents/${confidentialDoc.id}/download`)
        .set('Authorization', `Bearer ${tokenAlphaWorker}`);
    }

    // Admin checks alerts
    const alertsRes = await request(app)
      .get('/api/v1/audit/alerts')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

    expect(alertsRes.status).toBe(200);
    const repeatedAlert = alertsRes.body.data.find(
      (a: any) =>
        a.actorUserId === userAlphaWorker.id &&
        a.alertType === 'REPEATED_BLOCKED_ATTEMPTS'
    );
    expect(repeatedAlert).toBeDefined();
    expect(repeatedAlert.severity).toBe('HIGH');
    expect(repeatedAlert.eventCount).toBeGreaterThanOrEqual(3);
    expect(repeatedAlert.correlatedEventIds.length).toBeGreaterThanOrEqual(3);
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 6: Fair and Accurate Interpretation (No Auto Malice)
  // ==========================================================================
  it('6. Legitimate access attempts are not automatically classified as malicious; allows admin review', async () => {
    // Worker has a single blocked inquiry
    await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaTech}`)
      .send({
        query: 'Show me the confidential manual for PUMP-204-B',
        plantId: plantNorth.id,
      });

    const secEventsRes = await request(app)
      .get('/api/v1/audit/security-events')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

    const event = secEventsRes.body.data.find((e: any) => e.actorUserId === userAlphaTech.id);
    expect(event).toBeDefined();
    // Fair Interpretation: single inquiry defaults to benign
    expect(event.isBenignInquiry).toBe(true);

    // Admin reviews the generated alert
    const alertsRes = await request(app)
      .get('/api/v1/audit/alerts')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

    const targetAlert = alertsRes.body.data.find((a: any) => a.actorUserId === userAlphaTech.id);
    expect(targetAlert).toBeDefined();

    // Admin documents outcome as BENIGN_LEGITIMATE_NEED
    const reviewRes = await request(app)
      .post(`/api/v1/audit/alerts/${targetAlert.id}/review`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        status: 'RESOLVED',
        resolutionOutcome: 'BENIGN_LEGITIMATE_NEED',
        reviewNotes: 'Technician required seal tolerances for plant repair; supervisor arranged guided inspection.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('RESOLVED');
    expect(reviewRes.body.data.resolutionOutcome).toBe('BENIGN_LEGITIMATE_NEED');
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 7: Cross-Organization and Unauthorized Plant Access Blocked
  // ==========================================================================
  it('7. Cross-organization and unauthorized plant/machine access remain strictly blocked', async () => {
    // 7a. Cross-Tenant: Beta worker tries to query Alpha plant with Alpha header
    const crossTenantRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenBetaWorker}`)
      .set('x-organization-id', orgAlpha.id)
      .send({
        query: 'What is the status of PUMP-204-B?',
        plantId: plantNorth.id,
      });

    expect(crossTenantRes.status).toBe(403);
    expect(crossTenantRes.body.error.code).toBe('FORGEX_TENANT_MISMATCH');

    // 7b. Cross-Plant: Alpha worker assigned only to plantNorth tries to query plantSouth
    const crossPlantRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .send({
        query: 'What are the operating limits for plant south boilers?',
        plantId: plantSouth.id,
      });

    expect(crossPlantRes.status).toBe(403);
    expect(crossPlantRes.body.error.code).toBe('PLANT_ACCESS_DENIED');
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 8: Admin Alerts Do Not Leak Confidential Document Contents
  // ==========================================================================
  it('8. Admin alerts and security event records do not leak confidential document contents', async () => {
    // Attempt blocked access
    await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}/download`)
      .set('Authorization', `Bearer ${tokenAlphaWorker}`);

    const alertsRes = await request(app)
      .get('/api/v1/audit/alerts')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

    const alertsStr = JSON.stringify(alertsRes.body);
    // Secret torque, secret tolerances, and raw internal storage key must not appear
    expect(alertsStr).not.toContain('85 Nm');
    expect(alertsStr).not.toContain('2.14mm');
    expect(alertsStr).not.toContain('CONF-SOP-PUMP-204.pdf');
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 9: Revoked Permissions Take Immediate Effect
  // ==========================================================================
  it('9. Revoked permissions take effect immediately on subsequent requests', async () => {
    // Verify worker can initially query general copilot
    const initialRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .send({ query: 'What is water pressure at sea level?' });
    expect(initialRes.status).toBe(200);

    // Revoke worker's membership
    await dataStore.updateMembershipStatus(orgAlpha.id, membershipWorker.id, 'REVOKED');

    // Subsequent request must be rejected immediately
    const revokedRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .send({ query: 'What is water pressure at sea level?' });

    expect(revokedRes.status).toBe(403);
    expect(revokedRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // Verify security event was recorded for revoked user access attempt
    const eventsRes = await request(app)
      .get('/api/v1/audit/security-events')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);
    const revokedEvent = eventsRes.body.data.find(
      (e: any) => e.category === 'REVOKED_USER_ACCESS' && e.actorUserId === userAlphaWorker.id
    );
    expect(revokedEvent).toBeDefined();
  });

  // ==========================================================================
  // ACCEPTANCE CRITERIA 10: AI Classification Cannot Override Backend Security
  // ==========================================================================
  it('10. AI-generated classifications cannot override backend access-control decisions', async () => {
    // Adversarial prompt attempting to pose as general physics knowledge while targeting restricted document endpoint
    const dlRes = await request(app)
      .get(`/api/v1/documents/${confidentialDoc.id}/download`)
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .set('x-adversarial-classification', 'GENERAL_KNOWLEDGE');

    // Backend must enforce RBAC unconditionally regardless of classification
    expect(dlRes.status).toBe(403);
    expect(dlRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });
});

import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
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
import { SecurityEventService } from '../src/services/securityEvent.service.js';
import { config } from '../src/config/env.js';

describe('Knowledge Hub Phase 1: Security and RBAC Hardening Regression Suite', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let storageAdapter: LocalStorageAdapter;
  let ingestionQueue: IngestionQueue;
  let securityService: SecurityEventService;

  // Organizations
  let orgA: any;
  let orgB: any;

  // Plants
  let plantA1: any;
  let plantA2: any;
  let plantB1: any;

  // Org A Users & Tokens
  let userOwnerA: any;
  let tokenOwnerA: string;

  let userAdminA: any;
  let tokenAdminA: string;

  let userPlantManagerA: any;
  let tokenPlantManagerA: string;

  let userEngineerA: any;
  let tokenEngineerA: string;

  let userTechnicianA: any;
  let tokenTechnicianA: string;

  let userWorkerA: any;
  let tokenWorkerA: string;

  let userViewerA: any;
  let tokenViewerA: string;

  // Org B Users & Tokens (for cross-tenant testing)
  let userAdminB: any;
  let tokenAdminB: string;

  let userEngineerB: any;
  let tokenEngineerB: string;

  const jwtSecret = config.JWT_SECRET;

  beforeEach(async () => {
    const authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    securityService = new SecurityEventService(dataStore);

    const tempStorageDir = path.join(
      os.tmpdir(),
      `forgex-kh-phase1-sec-${Date.now()}-${Math.random().toString(36).substring(2)}`
    );
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    const embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-phase1-test');
    const vectorStore = new InMemoryVectorStoreAdapter();
    const visionProvider = new LocalDevVisionAdapter();

    ingestionQueue = new IngestionQueue(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      visionProvider
    );

    const generationProvider = new LocalDevInferenceAdapter();
    const reranker = new ReciprocalRankFusionReranker();
    const ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      reranker,
      securityService
    );
    const visualEngine = new VisualIntelligenceEngine(storageAdapter, visionProvider, dataStore);

    app = createApp({
      dataStore,
      authAdapter,
      storageAdapter,
      vectorStore,
      embeddingAdapter,
      ingestionQueue,
      generationProvider,
      rerankingProvider: reranker,
      ragEngine,
      visionProvider,
      visualEngine,
      securityService,
    });

    // 1. Seed Tenant Organizations
    orgA = await dataStore.createOrganization({
      name: 'Apex Petrochemical Refining Org A',
      slug: 'apex-refining-a',
    });

    orgB = await dataStore.createOrganization({
      name: 'Borealis Chemical Operations Org B',
      slug: 'borealis-chem-b',
    });

    // 2. Seed Plants
    plantA1 = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-TX-01',
      name: 'Texas Cracker Facility',
      location: 'Deer Park, TX',
    });

    plantA2 = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-TX-02',
      name: 'Houston Polymer Plant',
      location: 'Houston, TX',
    });

    plantB1 = await dataStore.createPlant(orgB.id, {
      code: 'PLANT-LA-01',
      name: 'Louisiana Olefins Unit',
      location: 'Baton Rouge, LA',
    });

    // 3. Seed Org A Roles
    // 3a. ORGANIZATION_OWNER
    userOwnerA = await dataStore.createUser({
      externalAuthId: 'ext_owner_a',
      email: 'owner@apex-refining.com',
      fullName: 'Chief Operations Officer',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userOwnerA.id,
      role: 'ORGANIZATION_OWNER',
    });
    tokenOwnerA = LocalDevAuthAdapter.generateDevToken(
      { id: userOwnerA.externalAuthId, email: userOwnerA.email, emailVerified: true },
      jwtSecret
    );

    // 3b. ORGANIZATION_ADMIN
    userAdminA = await dataStore.createUser({
      externalAuthId: 'ext_admin_a',
      email: 'admin@apex-refining.com',
      fullName: 'Facility Admin A',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userAdminA.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenAdminA = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminA.externalAuthId, email: userAdminA.email, emailVerified: true },
      jwtSecret
    );

    // 3c. PLANT_MANAGER
    userPlantManagerA = await dataStore.createUser({
      externalAuthId: 'ext_pm_a',
      email: 'pm@apex-refining.com',
      fullName: 'Plant Operations Manager',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userPlantManagerA.id,
      role: 'PLANT_MANAGER',
      assignedPlantIds: [plantA1.id],
    });
    tokenPlantManagerA = LocalDevAuthAdapter.generateDevToken(
      { id: userPlantManagerA.externalAuthId, email: userPlantManagerA.email, emailVerified: true },
      jwtSecret
    );

    // 3d. ENGINEER (ENGINEER_TECHNICIAN)
    userEngineerA = await dataStore.createUser({
      externalAuthId: 'ext_eng_a',
      email: 'engineer@apex-refining.com',
      fullName: 'Reliability Lead Engineer',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngineerA.id,
      role: 'ENGINEER_TECHNICIAN',
      assignedPlantIds: [plantA1.id],
    });
    tokenEngineerA = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerA.externalAuthId, email: userEngineerA.email, emailVerified: true },
      jwtSecret
    );

    // 3e. TECHNICIAN
    userTechnicianA = await dataStore.createUser({
      externalAuthId: 'ext_tech_a',
      email: 'tech@apex-refining.com',
      fullName: 'Senior Mechanical Tech',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userTechnicianA.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantA1.id],
    });
    tokenTechnicianA = LocalDevAuthAdapter.generateDevToken(
      { id: userTechnicianA.externalAuthId, email: userTechnicianA.email, emailVerified: true },
      jwtSecret
    );

    // 3f. WORKER (OPERATOR)
    userWorkerA = await dataStore.createUser({
      externalAuthId: 'ext_worker_a',
      email: 'worker@apex-refining.com',
      fullName: 'Field Unit Operator',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userWorkerA.id,
      role: 'WORKER',
      assignedPlantIds: [plantA1.id],
    });
    tokenWorkerA = LocalDevAuthAdapter.generateDevToken(
      { id: userWorkerA.externalAuthId, email: userWorkerA.email, emailVerified: true },
      jwtSecret
    );

    // 3g. VIEWER
    userViewerA = await dataStore.createUser({
      externalAuthId: 'ext_viewer_a',
      email: 'viewer@apex-refining.com',
      fullName: 'Read Only Auditor',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userViewerA.id,
      role: 'VIEWER',
    });
    tokenViewerA = LocalDevAuthAdapter.generateDevToken(
      { id: userViewerA.externalAuthId, email: userViewerA.email, emailVerified: true },
      jwtSecret
    );

    // 4. Seed Org B Roles
    userAdminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: 'admin@borealis-chem.com',
      fullName: 'Facility Director B',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userAdminB.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB.externalAuthId, email: userAdminB.email, emailVerified: true },
      jwtSecret
    );

    userEngineerB = await dataStore.createUser({
      externalAuthId: 'ext_eng_b',
      email: 'engineer@borealis-chem.com',
      fullName: 'Reliability Engineer B',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userEngineerB.id,
      role: 'ENGINEER_TECHNICIAN',
      assignedPlantIds: [plantB1.id],
    });
    tokenEngineerB = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerB.externalAuthId, email: userEngineerB.email, emailVerified: true },
      jwtSecret
    );
  });

  const validMarkdownManual = `# SOP-CRITICAL-100: Emergency Steam Turbine Shutdown Procedure
Revision: REV-A
Asset Tag: TURB-101

## SECTION 1: TRIP VERIFICATION
Immediately verify emergency governor trip valve closes within 150 milliseconds.
Differential pressure must read zero.`;

  // ==========================================================================
  // Test 1: Organization owner uploads a document successfully
  // ==========================================================================
  it('1. Organization owner uploads a document successfully (HTTP 201)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-CRITICAL-100.md')
      .field('documentNumber', 'SOP-CRITICAL-100')
      .field('title', 'Emergency Steam Turbine Shutdown Procedure')
      .field('plantId', plantA1.id)
      .field('category', 'SOP')
      .field('revision', 'REV-A');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.document.documentNumber).toBe('SOP-CRITICAL-100');
    expect(res.body.data.version.status).toBe('QUEUED');

    // Verify audit event is recorded
    const auditEvents = await dataStore.listAuditEvents(orgA.id);
    const uploadAudit = auditEvents.find((e) => e.action === 'DOCUMENT_UPLOADED');
    expect(uploadAudit).toBeDefined();
    expect(uploadAudit?.actorUserId).toBe(userOwnerA.id);
    expect(uploadAudit?.resourceType).toBe('DOCUMENT');
    expect(uploadAudit?.resourceId).toBe(res.body.data.document.id);
  });

  // ==========================================================================
  // Test 2: Organization admin uploads a document successfully
  // ==========================================================================
  it('2. Organization admin uploads a document successfully (HTTP 201)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-CRITICAL-101.md')
      .field('documentNumber', 'SOP-CRITICAL-101')
      .field('title', 'Steam Turbine Secondary Interlock')
      .field('plantId', plantA1.id)
      .field('category', 'SOP')
      .field('revision', 'REV-A');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.document.documentNumber).toBe('SOP-CRITICAL-101');
  });

  // ==========================================================================
  // Test 3: Worker upload is rejected
  // ==========================================================================
  it('3. Worker upload is rejected (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenWorkerA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-WORKER-001.md')
      .field('documentNumber', 'SOP-WORKER-001')
      .field('title', 'Unauthorized Worker Manual')
      .field('plantId', plantA1.id)
      .field('category', 'SOP');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // Verify security event was recorded
    const securityEventsResult = await dataStore.listSecurityEvents(orgA.id);
    const blockedEvent = securityEventsResult.events.find(
      (e) => e.action === 'BLOCKED_DOCUMENT_UPLOAD' && e.actorUserId === userWorkerA.id
    );
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent?.decision).toBe('DENIED');
  });

  // ==========================================================================
  // Test 4: Technician upload is rejected
  // ==========================================================================
  it('4. Technician upload is rejected (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenTechnicianA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-TECH-001.md')
      .field('documentNumber', 'SOP-TECH-001')
      .field('title', 'Unauthorized Technician Manual')
      .field('plantId', plantA1.id)
      .field('category', 'SOP');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // ==========================================================================
  // Test 5: Engineer upload is rejected
  // ==========================================================================
  it('5. Engineer upload is rejected (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenEngineerA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-ENG-001.md')
      .field('documentNumber', 'SOP-ENG-001')
      .field('title', 'Unauthorized Engineer Manual')
      .field('plantId', plantA1.id)
      .field('category', 'SOP');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // ==========================================================================
  // Test 6: Plant manager upload is rejected
  // ==========================================================================
  it('6. Plant manager upload is rejected (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenPlantManagerA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-PM-001.md')
      .field('documentNumber', 'SOP-PM-001')
      .field('title', 'Unauthorized Plant Manager Manual')
      .field('plantId', plantA1.id)
      .field('category', 'SOP');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // ==========================================================================
  // Test 7: Cross-tenant storage-proxy access is rejected
  // ==========================================================================
  it('7. Cross-tenant storage-proxy access is rejected (HTTP 403 Forbidden without leaking existence)', async () => {
    // Org A stores a confidential file in its tenant namespace
    const orgAKey = `org_${orgA.id}/plant_${plantA1.id}/secret_schematic.pdf`;
    await storageAdapter.putObject(
      orgAKey,
      Buffer.from('%PDF-1.4 Classified Proprietary Refining Formula'),
      'application/pdf'
    );

    // User from Org B attempts to access Org A's key via storage-proxy
    const res = await request(app)
      .get('/api/v1/engineering/storage-proxy')
      .query({ key: orgAKey })
      .set('Authorization', `Bearer ${tokenEngineerB}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    expect(res.body.error.message).toContain('Access denied');

    // Verify audit event was logged for Org B
    const auditEventsB = await dataStore.listAuditEvents(orgB.id);
    const storageAudit = auditEventsB.find((e) => e.action === 'STORAGE_PROXY_ACCESS_DENIED');
    expect(storageAudit).toBeDefined();

    // Verify an unauthenticated user attempting cross-tenant access without signature is rejected with 401
    const unauthRes = await request(app)
      .get('/api/v1/engineering/storage-proxy')
      .query({ key: orgAKey });

    expect(unauthRes.status).toBe(401);
  });

  // ==========================================================================
  // Test 8: Path traversal and malformed storage keys are rejected
  // ==========================================================================
  it('8. Path traversal and malformed storage keys are rejected (HTTP 400)', async () => {
    // 8a. Raw dot-dot traversal
    const traversalRes1 = await request(app)
      .get('/api/v1/engineering/storage-proxy')
      .query({ key: '../../etc/passwd' })
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(traversalRes1.status).toBe(400);
    expect(traversalRes1.body.error.code).toBe('FORGEX_STORAGE_TRAVERSAL_DETECTED');

    // 8b. URL-encoded dot-dot traversal (%2e%2e)
    const traversalRes2 = await request(app)
      .get('/api/v1/engineering/storage-proxy?key=%2e%2e%2f%2e%2e%2fsecret.key')
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(traversalRes2.status).toBe(400);
    expect(traversalRes2.body.error.code).toBe('FORGEX_STORAGE_TRAVERSAL_DETECTED');

    // 8c. Null-byte injection
    const traversalRes3 = await request(app)
      .get('/api/v1/engineering/storage-proxy')
      .query({ key: `org_${orgA.id}/schematic.pdf\0.png` })
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(traversalRes3.status).toBe(400);
    expect(traversalRes3.body.error.code).toBe('FORGEX_STORAGE_TRAVERSAL_DETECTED');

    // 8d. Absolute paths
    const traversalRes4 = await request(app)
      .get('/api/v1/engineering/storage-proxy')
      .query({ key: '/var/secrets/key.pem' })
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(traversalRes4.status).toBe(400);
    expect(traversalRes4.body.error.code).toBe('FORGEX_STORAGE_TRAVERSAL_DETECTED');

    // 8e. Empty key
    const emptyRes = await request(app)
      .get('/api/v1/engineering/storage-proxy')
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe('FORGEX_STORAGE_BAD_REQUEST');
  });

  // ==========================================================================
  // Test 9: Unknown and cross-tenant plant IDs are rejected
  // ==========================================================================
  it('9. Unknown and cross-tenant plant IDs are rejected on upload (HTTP 400)', async () => {
    // 9a. Cross-tenant plant ID (plantB1 belongs to Org B, user is in Org A)
    const crossPlantRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-CROSS-PLANT.md')
      .field('documentNumber', 'SOP-CROSS-PLANT')
      .field('title', 'Cross Tenant Plant Manual')
      .field('plantId', plantB1.id)
      .field('category', 'SOP');

    expect(crossPlantRes.status).toBe(400);
    expect(crossPlantRes.body.error.code).toBe('FORGEX_INVALID_PLANT');

    // 9b. Completely nonexistent / phantom plant ID
    const unknownPlantRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-UNKNOWN-PLANT.md')
      .field('documentNumber', 'SOP-UNKNOWN-PLANT')
      .field('title', 'Unknown Plant Manual')
      .field('plantId', 'PLANT-NONEXISTENT-999')
      .field('category', 'SOP');

    expect(unknownPlantRes.status).toBe(400);
    expect(unknownPlantRes.body.error.code).toBe('FORGEX_INVALID_PLANT');

    // Verify that NO phantom plant was created in the database
    const orgAPlants = await dataStore.listPlants(orgA.id);
    const phantomPlant = orgAPlants.find((p) => p.code === 'PLANT-NONEXISTENT-999');
    expect(phantomPlant).toBeUndefined();
  });

  // ==========================================================================
  // Test 10: Existing authorized document operations continue working
  // ==========================================================================
  it('10. Existing authorized document operations continue working (Admin/Owner lifecycle + AI Copilot)', async () => {
    // Step 1: Admin uploads document
    const uploadRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', Buffer.from(validMarkdownManual, 'utf-8'), 'SOP-LIFECYCLE-001.md')
      .field('documentNumber', 'SOP-LIFECYCLE-001')
      .field('title', 'Lifecycle Steam Turbine Protocol')
      .field('plantId', plantA1.id)
      .field('category', 'SOP')
      .field('revision', 'REV-A');

    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.body.data.document.id;
    const versionId = uploadRes.body.data.version.id;

    await ingestionQueue.waitForAll();

    // Step 2: List documents
    const listRes = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Step 3: Get document by ID
    const getRes = await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(docId);

    // Step 4: Get extracted pages
    const pagesRes = await request(app)
      .get(`/api/v1/documents/${docId}/pages`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(pagesRes.status).toBe(200);
    expect(pagesRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Step 5: Get document versions
    const versionsRes = await request(app)
      .get(`/api/v1/documents/${docId}/versions`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(versionsRes.status).toBe(200);
    expect(versionsRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Step 6: Download original file
    const downloadRes = await request(app)
      .get(`/api/v1/documents/${docId}/download`)
      .set('Authorization', `Bearer ${tokenOwnerA}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.text).toContain('Emergency Steam Turbine Shutdown Procedure');

    // Step 7: Retry version processing
    const retryRes = await request(app)
      .post(`/api/v1/documents/${docId}/versions/${versionId}/retry`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.data.job.retryCount).toBe(1);

    // Step 8: Verify AI Copilot query by worker/engineer works (grounded knowledge retrieval preserved)
    const copilotRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenEngineerA}`)
      .send({
        plantId: plantA1.id,
        query: 'What is the required governor valve closing time for the steam turbine?',
      });

    expect(copilotRes.status).toBe(200);
    expect(copilotRes.body.data.answer).toBeDefined();

    // Step 9: Delete document
    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify deleted
    const verifyDeleteRes = await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(verifyDeleteRes.status).toBe(404);
  });

  // ==========================================================================
  // Test 11: Bulk Upload - Admin uploads multiple documents in a single batch
  // ==========================================================================
  it('11. Organization Admin uploads multiple documents in bulk successfully (HTTP 201)', async () => {
    const file1 = '# SOP-BATCH-001: Centrifugal Pump Overhaul\nDetails for pump overhaul.';
    const file2 = '# SOP-BATCH-002: Gas Turbine Purge Sequence\nDetails for purge cycle.';
    const file3 = '# SOP-BATCH-003: High Voltage Switchgear LOTO\nDetails for 480V switchgear.';

    const res = await request(app)
      .post('/api/v1/documents/bulk-upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('plantId', plantA1.id)
      .field('defaultCategory', 'SOP')
      .field('defaultRevision', 'REV-B')
      .field('defaultAssetTags', 'PUMP-204,TURB-101')
      .attach('files', Buffer.from(file1, 'utf-8'), 'SOP-BATCH-001.md')
      .attach('files', Buffer.from(file2, 'utf-8'), 'SOP-BATCH-002.md')
      .attach('files', Buffer.from(file3, 'utf-8'), 'SOP-BATCH-003.md');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.total).toBe(3);
    expect(res.body.summary.succeeded).toBe(3);
    expect(res.body.summary.failed).toBe(0);
    expect(res.body.data.uploaded.length).toBe(3);

    // Wait for queue to process batch
    await ingestionQueue.waitForAll();

    // Verify all 3 documents exist in tenant list
    const listRes = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(listRes.status).toBe(200);
    const docNumbers = listRes.body.data.map((d: any) => d.documentNumber);
    expect(docNumbers).toContain('SOP-BATCH-001');
    expect(docNumbers).toContain('SOP-BATCH-002');
    expect(docNumbers).toContain('SOP-BATCH-003');
  });

  // ==========================================================================
  // Test 12: Bulk Upload - Non-admin roles are rejected
  // ==========================================================================
  it('12. Non-admin roles (Worker, Engineer) cannot perform bulk upload (HTTP 403 Forbidden)', async () => {
    const file1 = '# SOP-UNAUTH-001: Unauthorized Manual Content';

    const workerRes = await request(app)
      .post('/api/v1/documents/bulk-upload')
      .set('Authorization', `Bearer ${tokenWorkerA}`)
      .field('plantId', plantA1.id)
      .attach('files', Buffer.from(file1, 'utf-8'), 'SOP-UNAUTH-001.md');

    expect(workerRes.status).toBe(403);
    expect(workerRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    const engineerRes = await request(app)
      .post('/api/v1/documents/bulk-upload')
      .set('Authorization', `Bearer ${tokenEngineerA}`)
      .field('plantId', plantA1.id)
      .attach('files', Buffer.from(file1, 'utf-8'), 'SOP-UNAUTH-001.md');

    expect(engineerRes.status).toBe(403);
    expect(engineerRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // ==========================================================================
  // Test 13: Bulk Upload - Unknown or cross-tenant plant IDs are rejected
  // ==========================================================================
  it('13. Bulk upload rejects unknown or cross-tenant plant IDs (HTTP 400)', async () => {
    const file1 = '# SOP-INVALID-PLANT: Manual with bad plant';

    // Cross-tenant plant
    const crossRes = await request(app)
      .post('/api/v1/documents/bulk-upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('plantId', plantB1.id)
      .attach('files', Buffer.from(file1, 'utf-8'), 'SOP-INVALID-PLANT.md');

    expect(crossRes.status).toBe(400);
    expect(crossRes.body.error.code).toBe('FORGEX_INVALID_PLANT');

    // Unknown plant
    const unknownRes = await request(app)
      .post('/api/v1/documents/bulk-upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('plantId', 'NON_EXISTENT_PLANT')
      .attach('files', Buffer.from(file1, 'utf-8'), 'SOP-INVALID-PLANT.md');

    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.error.code).toBe('FORGEX_INVALID_PLANT');
  });

  // ==========================================================================
  // Test 14: Bulk Upload - Partial failures handling (corrupt file reported, valid files queued)
  // ==========================================================================
  it('14. Bulk upload gracefully handles partial failures and reports per-file statuses', async () => {
    const validFile = '# SOP-VALID-01: Valid Manual\nContent for valid manual.';
    const corruptFile = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // Malicious PE executable magic bytes

    const res = await request(app)
      .post('/api/v1/documents/bulk-upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('plantId', plantA1.id)
      .field('defaultCategory', 'SOP')
      .attach('files', Buffer.from(validFile, 'utf-8'), 'SOP-VALID-01.md')
      .attach('files', corruptFile, 'corrupt.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.total).toBe(2);
    expect(res.body.summary.succeeded).toBe(1);
    expect(res.body.summary.failed).toBe(1);
    expect(res.body.data.uploaded[0].filename).toBe('SOP-VALID-01.md');
    expect(res.body.data.failed[0].filename).toBe('corrupt.pdf');
    expect(res.body.data.failed[0].error).toContain('Security Violation');
  });
});

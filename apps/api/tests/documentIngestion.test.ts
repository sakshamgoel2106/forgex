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
import path from 'node:path';
import os from 'node:os';

describe('Phase 3: Industrial Document Ingestion & Vector Indexing', () => {
  let app: Application;
  let authAdapter: LocalDevAuthAdapter;
  let dataStore: InMemoryDataStore;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let ingestionQueue: IngestionQueue;

  // Tenant Fixtures
  let orgA: any;
  let orgB: any;
  let userAdminA: any;
  let userEngineerA: any;
  let userViewerA: any;
  let userAdminB: any;
  let plantA: any;
  let plantB: any;

  let tokenAdminA: string;
  let tokenEngineerA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;

  beforeEach(async () => {
    const jwtSecret = 'test_jwt_secret_for_integration_testing_1234567890';
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(os.tmpdir(), `forgex-test-storage-${Date.now()}-${Math.random()}`);
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);

    app = createApp({
      authAdapter,
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      ingestionQueue,
    });

    // 1. Seed Organizations
    orgA = await dataStore.createOrganization({
      name: 'Apex Petrochemical Refining',
      slug: 'apex-petro',
    });
    orgB = await dataStore.createOrganization({
      name: 'Borealis Turbine Dynamics',
      slug: 'borealis-turbine',
    });

    // 2. Seed Users
    userAdminA = await dataStore.createUser({
      externalAuthId: 'ext_admin_a',
      email: 'admin@apexpetro.com',
      fullName: 'Apex Admin',
    });
    userEngineerA = await dataStore.createUser({
      externalAuthId: 'ext_eng_a',
      email: 'engineer@apexpetro.com',
      fullName: 'Sarah Chen PE',
    });
    userViewerA = await dataStore.createUser({
      externalAuthId: 'ext_viewer_a',
      email: 'viewer@apexpetro.com',
      fullName: 'Apex Viewer',
    });
    userAdminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: 'admin@borealis.com',
      fullName: 'Borealis Admin',
    });

    // 3. Seed Memberships
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userAdminA.id,
      role: 'ORGANIZATION_ADMIN',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngineerA.id,
      role: 'ENGINEER_TECHNICIAN',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userViewerA.id,
      role: 'VIEWER',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userAdminB.id,
      role: 'ORGANIZATION_ADMIN',
    });

    // 4. Seed Plants
    plantA = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-TX-04',
      name: 'Texas Hydrocarbon Processing Facility',
      location: 'Deer Park, TX',
    });
    plantB = await dataStore.createPlant(orgB.id, {
      code: 'PLANT-AB-01',
      name: 'Alberta Wind & Gas Turbine Unit',
      location: 'Calgary, AB',
    });
    void plantB;

    // 5. Generate Test JWTs
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
    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB.externalAuthId, email: userAdminB.email, emailVerified: true },
      jwtSecret
    );
    void tokenAdminA;
  });

  describe('1. Document Upload & Magic Bytes Validation', () => {
    it('successfully uploads and ingests a Markdown industrial SOP manual', async () => {
      const sopContent = `
# SOP-MECH-401: Emergency Centrifugal Pump LOTO Procedure
Revision: REV-C
Asset: PUMP-204-B

## SECTION 1: SAFETY & HAZARD MITIGATION
Before commencing maintenance on PUMP-204-B, verify that all high-pressure isolation valves (V-101 and V-102) are mechanically locked out and tagged out according to OSHA standard 1910.147.

| Step | Hazard Type | Control Measure | PPE Required |
| :--- | :--- | :--- | :--- |
| 1 | High Pressure Liquid | Double Block & Bleed | Face Shield, Nitrile Gloves |
| 2 | Hazardous Voltage 480V | Breaker Padlock | Arc Flash Category 2 |

## SECTION 2: IMPELLER ALIGNMENT SPECIFICATIONS
Ensure shaft runout is strictly within +/- 0.002 inches using a dial indicator mounted on the pump casing flange.
`;

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'SOP-MECH-401')
        .field('title', 'Emergency Centrifugal Pump LOTO Procedure')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .field('revision', 'REV-C')
        .field('assetTags', 'PUMP-204-B,VALVE-101')
        .attach('file', Buffer.from(sopContent, 'utf-8'), 'SOP-MECH-401.md');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.document.documentNumber).toBe('SOP-MECH-401');
      expect(res.body.data.version.status).toBe('QUEUED');
      expect(res.body.data.job.status).toBe('QUEUED');

      // Wait for asynchronous BullMQ queue processor to complete
      await ingestionQueue.waitForAll();

      // Verify Document and Version are INDEXED
      const docRes = await request(app)
        .get(`/api/v1/documents/${res.body.data.document.id}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(docRes.status).toBe(200);
      expect(docRes.body.data.latestVersion.status).toBe('INDEXED');
      expect(docRes.body.data.latestVersion.totalPages).toBeGreaterThanOrEqual(1);
      expect(docRes.body.data.latestVersion.totalChunks).toBeGreaterThanOrEqual(2);

      // Verify extracted pages and headings
      const pagesRes = await request(app)
        .get(`/api/v1/documents/${res.body.data.document.id}/pages`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(pagesRes.status).toBe(200);
      expect(pagesRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(pagesRes.body.data[0].hasTables).toBe(true);
      expect(pagesRes.body.data[0].sectionHeadings).toContain(
        'SOP-MECH-401: Emergency Centrifugal Pump LOTO Procedure'
      );

      // Verify chunks indexed in Vector Store map back to document and page
      const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
      const searchResults = await vectorStore.search(
        collectionName,
        await embeddingAdapter.generateEmbedding('LOTO isolation valves lockout tagout'),
        { organizationId: orgA.id }
      );

      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0].payload.documentId).toBe(res.body.data.document.id);
      expect(searchResults[0].payload.documentVersionId).toBe(res.body.data.version.id);
      expect(searchResults[0].payload.pageNumber).toBe(1);
      expect(searchResults[0].payload.content).toContain('PUMP-204-B');
    });

    it('rejects upload when magic bytes indicate an executable or script masquerading as a document', async () => {
      // Windows PE EXE header: 0x4D 0x5A ("MZ")
      const maliciousBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'SOP-CORRUPT-001')
        .field('title', 'Corrupt Document')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .attach('file', maliciousBuffer, 'legit_manual.pdf');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Security Violation');
    });

    it('rejects upload when magic bytes do not match expected document formats', async () => {
      const junkBuffer = Buffer.from('RIFF_RANDOM_CORRUPT_BYTES_XYZ');

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'SOP-JUNK-002')
        .field('title', 'Junk Document')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .attach('file', junkBuffer, 'junk.unknown');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unsupported or malformed file content');
    });

    it('rejects upload when mandatory metadata fields are missing', async () => {
      const validText = Buffer.from('Sample plain text content');

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('title', 'Missing Doc Number')
        // missing documentNumber, plantId, category
        .attach('file', validText, 'sample.txt');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Missing required metadata');
    });
  });

  describe('2. Scanned PDF & OCR Processing', () => {
    it('detects scanned PDF with minimal native character stream and invokes OCR pipeline', async () => {
      // Construct a minimal valid PDF container with raster image stream and no text Tj operators
      const scannedPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /MediaBox [0 0 612 792] >>\nendobj\n4 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\nstream\nCOMPRESSOR-TAG-K-301-OFFLINE-ISOLATED\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000215 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n380\n%%EOF'
      );

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'OEM-SCAN-902')
        .field('title', 'Scanned Compressor K-301 Schematic Diagram')
        .field('plantId', plantA.id)
        .field('category', 'OEM_MANUAL')
        .field('revision', 'REV-1')
        .attach('file', scannedPdf, 'scanned_compressor.pdf');

      expect(res.status).toBe(201);

      await ingestionQueue.waitForAll();

      const pagesRes = await request(app)
        .get(`/api/v1/documents/${res.body.data.document.id}/pages`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(pagesRes.status).toBe(200);
      expect(pagesRes.body.data.length).toBe(1);
      // Verify OCR extraction method was applied
      expect(pagesRes.body.data[0].extractionMethod).toBe('OCR');
      expect(pagesRes.body.data[0].rawText).toContain('OCR');
    });
  });

  describe('3. Idempotent Retries & Duplicate Processing Prevention', () => {
    it('retrying a document processing job does not duplicate chunks or vector records', async () => {
      const docContent = `
# SOP-GAS-102: Gas Turbine Ignition Sequence
1. Verify purge cycle 5 minutes.
2. Confirm fuel gas pressure 350 PSI.
3. Energize spark igniter for 10 seconds.
`;

      const uploadRes = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'SOP-GAS-102')
        .field('title', 'Gas Turbine Ignition Sequence')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .attach('file', Buffer.from(docContent, 'utf-8'), 'ignition.txt');

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.data.document.id;
      const versionId = uploadRes.body.data.version.id;

      await ingestionQueue.waitForAll();

      const docBefore = await dataStore.getDocumentById(orgA.id, docId);
      const initialChunkCount = docBefore?.latestVersion?.totalChunks || 0;
      expect(initialChunkCount).toBeGreaterThan(0);

      // Trigger Retry
      const retryRes = await request(app)
        .post(`/api/v1/documents/${docId}/versions/${versionId}/retry`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.job.retryCount).toBe(1);

      await ingestionQueue.waitForAll();

      // Verify that after retry, chunk count is EXACTLY identical, not duplicated
      const docAfter = await dataStore.getDocumentById(orgA.id, docId);
      expect(docAfter?.latestVersion?.totalChunks).toBe(initialChunkCount);

      // Verify database knowledge_chunks count for this version is not multiplied
      const chunks = await dataStore.listKnowledgeChunks(versionId);
      expect(chunks.length).toBe(initialChunkCount);
    });
  });

  describe('4. Error Handling & Failed Embeddings', () => {
    it('handles simulated embedding failure gracefully and records status as FAILED', async () => {
      // Content containing trigger token to test simulated embedding failure
      const failContent = `
# SOP-FAIL-TEST: High Voltage Transformer Test
[SIMULATE_EMBEDDING_FAILURE]
Ensure ground disconnect switch is closed.
`;

      const uploadRes = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'SOP-FAIL-TEST')
        .field('title', 'Failure Simulation Manual')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .attach('file', Buffer.from(failContent, 'utf-8'), 'fail_manual.txt');

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.data.document.id;

      await ingestionQueue.waitForAll();

      const docRes = await request(app)
        .get(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(docRes.status).toBe(200);
      expect(docRes.body.data.latestVersion.status).toBe('FAILED');
      expect(docRes.body.data.latestVersion.errorMessage).toContain('Embedding generation failed');
      expect(docRes.body.data.latestJob.status).toBe('FAILED');
    });
  });

  describe('5. Cross-Tenant Isolation & Security', () => {
    let docOrgAId: string;

    beforeEach(async () => {
      const docContent = `# SOP-ISOLATION-01: Proprietary Refinery Catalytic Cracking Manual`;
      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('documentNumber', 'SOP-ISOLATION-01')
        .field('title', 'Proprietary Refining Manual')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .attach('file', Buffer.from(docContent, 'utf-8'), 'refinery.md');

      docOrgAId = res.body.data.document.id;
      await ingestionQueue.waitForAll();
    });

    it('Org B user cannot view Org A document by ID (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${docOrgAId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('Org B user cannot list Org A documents', async () => {
      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('Org B user cannot download Org A document raw file', async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${docOrgAId}/download`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
    });

    it('Org B user cannot retry Org A document processing job', async () => {
      const doc = await dataStore.getDocumentById(orgA.id, docOrgAId);
      const versionId = doc!.latestVersion!.id;

      const res = await request(app)
        .post(`/api/v1/documents/${docOrgAId}/versions/${versionId}/retry`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
    });

    it('Org B user cannot delete Org A document', async () => {
      const res = await request(app)
        .delete(`/api/v1/documents/${docOrgAId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);

      // Verify Org A document still exists intact
      const checkRes = await request(app)
        .get(`/api/v1/documents/${docOrgAId}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(checkRes.status).toBe(200);
    });

    it('Viewer role cannot upload or delete documents (403 Forbidden)', async () => {
      const uploadRes = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenViewerA}`)
        .field('documentNumber', 'SOP-VIEWER-DENIED')
        .field('title', 'Viewer Denied Upload')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .attach('file', Buffer.from('Test', 'utf-8'), 'test.txt');

      expect(uploadRes.status).toBe(403);

      const deleteRes = await request(app)
        .delete(`/api/v1/documents/${docOrgAId}`)
        .set('Authorization', `Bearer ${tokenViewerA}`);

      expect(deleteRes.status).toBe(403);
    });
  });
});

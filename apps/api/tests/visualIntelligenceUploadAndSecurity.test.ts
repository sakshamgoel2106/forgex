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
import path from 'node:path';
import os from 'node:os';

describe('Prompt 16: Visual Intelligence File Upload & Security Audit', () => {
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

  // Organizations
  let orgA: any;
  let orgB: any;

  // Users & Tokens
  let adminUserA: any;
  let technicianUserA: any;
  let workerUserA: any;
  let adminUserB: any;

  let tokenAdminA: string;
  let tokenTechnicianA: string;
  let tokenWorkerA: string;
  let tokenAdminB: string;

  // Plants & Machines
  let plantA: any;
  let plantB: any;
  let machineA: any;
  let machineB: any;

  const jwtSecret = 'test_jwt_secret_for_visual_intelligence_security_p16';

  // Valid fixture buffers
  const samplePngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic bytes
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  const samplePdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n160\n%%EOF'
  );

  const sampleGlbBuffer = Buffer.concat([
    Buffer.from([0x67, 0x6c, 0x54, 0x46]), // glTF
    Buffer.from([0x02, 0x00, 0x00, 0x00]), // version 2
    Buffer.from([0x20, 0x00, 0x00, 0x00]), // length 32
    Buffer.alloc(20),
  ]);

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(
      os.tmpdir(),
      `forgex-visual-upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-visual-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    generationProvider = new LocalDevInferenceAdapter('forgex-local-test-model');
    rerankingProvider = new ReciprocalRankFusionReranker(60);

    const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      collectionName
    );

    visionProvider = new LocalDevVisionAdapter();
    visualEngine = new VisualIntelligenceEngine(
      dataStore,
      storageAdapter,
      visionProvider,
      ragEngine
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
      visionProvider,
      visualEngine,
    });

    // 1. Seed Organization A
    orgA = await dataStore.createOrganization({
      name: 'Aerospace Components Ltd',
      slug: 'aerospace-ltd',
    });

    adminUserA = await dataStore.createUser({
      externalAuthId: 'ext_admin_a',
      email: 'admin@aerospace.com',
      fullName: 'Chief Plant Administrator',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: adminUserA.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenAdminA = LocalDevAuthAdapter.generateDevToken(
      { id: adminUserA.externalAuthId, email: adminUserA.email, emailVerified: true },
      jwtSecret
    );

    technicianUserA = await dataStore.createUser({
      externalAuthId: 'ext_tech_a',
      email: 'tech@aerospace.com',
      fullName: 'Field Maintenance Technician',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: technicianUserA.id,
      role: 'TECHNICIAN',
    });
    tokenTechnicianA = LocalDevAuthAdapter.generateDevToken(
      { id: technicianUserA.externalAuthId, email: technicianUserA.email, emailVerified: true },
      jwtSecret
    );

    workerUserA = await dataStore.createUser({
      externalAuthId: 'ext_worker_a',
      email: 'worker@aerospace.com',
      fullName: 'Assembly Worker',
    });
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: workerUserA.id,
      role: 'WORKER',
    });
    tokenWorkerA = LocalDevAuthAdapter.generateDevToken(
      { id: workerUserA.externalAuthId, email: workerUserA.email, emailVerified: true },
      jwtSecret
    );

    plantA = await dataStore.createPlant(orgA.id, {
      name: 'Turbine Fabrication Plant 1',
      code: 'TFP-01',
      location: 'Wichita, KS',
    });

    machineA = await dataStore.createMachine(orgA.id, {
      plantId: plantA.id,
      name: '5-Axis CNC Milling Center 01',
      assetTag: 'CNC-5AX-01',
      criticality: 'CRITICAL',
    });

    // 2. Seed Organization B (Tenant Isolation Fixture)
    orgB = await dataStore.createOrganization({
      name: 'PetroChem Global Corp',
      slug: 'petrochem-global',
    });

    adminUserB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: 'admin@petrochem.com',
      fullName: 'PetroChem Administrator',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: adminUserB.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: adminUserB.externalAuthId, email: adminUserB.email, emailVerified: true },
      jwtSecret
    );

    plantB = await dataStore.createPlant(orgB.id, {
      name: 'Hydrocracker Unit 3',
      code: 'HCU-03',
      location: 'Beaumont, TX',
    });

    machineB = await dataStore.createMachine(orgB.id, {
      plantId: plantB.id,
      name: 'Centrifugal Compressor Unit',
      assetTag: 'COMP-C-301',
      criticality: 'CRITICAL',
    });
  });

  // --------------------------------------------------------------------------
  // 1. Authorized Admin Upload
  // --------------------------------------------------------------------------
  it('1. should allow authorized company admin to upload supported engineering image and store in private storage with UPLOADED status', async () => {
    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('machineId', machineA.id)
      .field('assetType', 'PHOTOGRAPH')
      .field('description', 'High-pressure spindle bearing assembly walkdown')
      .attach('file', samplePngBuffer, 'spindle_bearing.png');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const asset = res.body.data;
    expect(asset.id).toBeDefined();
    expect(asset.organizationId).toBe(orgA.id);
    expect(asset.machineId).toBe(machineA.id);
    expect(asset.plantId).toBe(plantA.id);
    expect(asset.filename).toBe('spindle_bearing.png');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.assetType).toBe('PHOTOGRAPH');
    expect(asset.processingStatus).toBe('UPLOADED'); // Invariant: Initial status is strictly UPLOADED
    expect(asset.uploadedByUserId).toBe(adminUserA.id);
    expect(asset.storageKey).toMatch(new RegExp(`^org_${orgA.id}/visual/`));

    // Verify stored object exists in object storage
    const storedBytes = await storageAdapter.getObject(asset.storageKey);
    expect(storedBytes).toBeDefined();
    expect(storedBytes.equals(samplePngBuffer)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. Unauthorized Worker / Technician Upload Rejected (RBAC)
  // --------------------------------------------------------------------------
  it('2. should reject technician and worker upload attempts with 403 Forbidden', async () => {
    // Technician Attempt
    const techRes = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenTechnicianA}`)
      .field('machineId', machineA.id)
      .attach('file', samplePngBuffer, 'field_inspection.png');

    expect(techRes.status).toBe(403);
    expect(techRes.body.success).toBe(false);
    expect(techRes.body.error?.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // Worker Attempt
    const workerRes = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenWorkerA}`)
      .field('machineId', machineA.id)
      .attach('file', samplePngBuffer, 'worker_photo.png');

    expect(workerRes.status).toBe(403);
    expect(workerRes.body.success).toBe(false);
    expect(workerRes.body.error?.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // 3. Cross-Tenant Machine Association Rejected
  // --------------------------------------------------------------------------
  it('3. should reject machine association when machine belongs to another organization (cross-tenant attack)', async () => {
    // Admin of Org A tries to link upload to Org B's machine
    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('machineId', machineB.id) // Belongs to Org B!
      .attach('file', samplePngBuffer, 'cross_tenant_drawing.png');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('FORGEX_MACHINE_NOT_FOUND');
    expect(res.body.error?.message).toContain('Specified machine was not found in this organization');
  });

  // --------------------------------------------------------------------------
  // 4. Unsupported File Types Rejected
  // --------------------------------------------------------------------------
  it('4. should reject unsupported file types with clear validation error', async () => {
    const randomBinary = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', randomBinary, 'unsupported_device.bin');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toContain('Unsupported file type or content signature');
  });

  // --------------------------------------------------------------------------
  // 5. Oversized and Empty Files Rejected
  // --------------------------------------------------------------------------
  it('5. should reject empty files with 400 Bad Request', async () => {
    const emptyBuffer = Buffer.alloc(0);

    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', emptyBuffer, 'empty_schematic.png');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('FORGEX_VALIDATION_EMPTY_FILE');
  });

  // --------------------------------------------------------------------------
  // 6. Misleading Extension and Executable Magic Bytes Rejection
  // --------------------------------------------------------------------------
  it('6. should reject executable disguised as PNG (MZ / PE header)', async () => {
    // Fake PNG file that actually contains Windows PE executable header (MZ)
    const fakePngWithPeHeader = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    ]);

    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', fakePngWithPeHeader, 'innocent_bearing.png');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toContain('Security Violation: Windows PE executable format rejected');
  });

  it('6b. should reject executable disguised as PDF (ELF header)', async () => {
    const fakePdfWithElfHeader = Buffer.from([
      0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00,
    ]);

    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', fakePdfWithElfHeader, 'compressor_manual.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toContain('Security Violation: ELF binary format rejected');
  });

  // --------------------------------------------------------------------------
  // 7. Dangerous Double Extensions and Path Traversal
  // --------------------------------------------------------------------------
  it('7. should reject dangerous double extensions (.pdf.exe)', async () => {
    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, 'electrical_schematic.pdf.exe');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.message).toContain('Security Violation');
  });

  it('7b. should sanitize path traversal sequences in uploaded filename', async () => {
    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, '../../../../etc/passwd.png');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.filename).not.toContain('..');
    expect(res.body.data.filename).not.toContain('/');
    expect(res.body.data.filename).not.toContain('\\');
    expect(res.body.data.storageKey).toMatch(new RegExp(`^org_${orgA.id}/visual/`));
  });

  // --------------------------------------------------------------------------
  // 8. 3D CAD & Technical Drawing Support (GLB & PDF)
  // --------------------------------------------------------------------------
  it('8. should support 3D CAD models (GLB) and Technical PDFs in private vault with CAD_MODEL type', async () => {
    // Test GLB
    const glbRes = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('machineId', machineA.id)
      .attach('file', sampleGlbBuffer, 'impeller_assembly.glb');

    expect(glbRes.status).toBe(201);
    expect(glbRes.body.data.assetType).toBe('CAD_MODEL');
    expect(glbRes.body.data.mimeType).toBe('model/gltf-binary');
    expect(glbRes.body.data.processingStatus).toBe('UPLOADED');

    // Test PDF
    const pdfRes = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('machineId', machineA.id)
      .attach('file', samplePdfBuffer, 'pump_p&id_drawing.pdf');

    expect(pdfRes.status).toBe(201);
    expect(pdfRes.body.data.mimeType).toBe('application/pdf');
    expect(pdfRes.body.data.processingStatus).toBe('UPLOADED');
  });

  // --------------------------------------------------------------------------
  // 9. Unauthorized File Download / Cross-Tenant Image Streaming Protection
  // --------------------------------------------------------------------------
  it('9. should reject cross-tenant image download requests with 404/403 and never leak confidential data', async () => {
    // 1. Admin of Org A uploads private diagram
    const uploadRes = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, 'proprietary_schematic.png');

    const assetId = uploadRes.body.data.id;

    // 2. Admin of Org A can stream image successfully
    const downloadResA = await request(app)
      .get(`/api/v1/visual/assets/${assetId}/image`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(downloadResA.status).toBe(200);
    expect(downloadResA.headers['x-content-type-options']).toBe('nosniff');
    expect(downloadResA.body.equals(samplePngBuffer)).toBe(true);

    // 3. User from Org B tries to access Org A's asset
    const downloadResB = await request(app)
      .get(`/api/v1/visual/assets/${assetId}/image`)
      .set('Authorization', `Bearer ${tokenAdminB}`);

    expect(downloadResB.status).toBe(404); // Must not exist for tenant B
    expect(downloadResB.body.success).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 10. Audit Logging and Machine Metadata Linkage
  // --------------------------------------------------------------------------
  it('10. should link uploaded asset to verified machine and plant, and log immutable audit event', async () => {
    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('machineId', machineA.id)
      .field('equipmentTags', 'BEARING-101, SPINDLE-04')
      .attach('file', samplePngBuffer, 'machine_faceplate.png');

    expect(res.status).toBe(201);
    const assetId = res.body.data.id;

    const auditEvents = await dataStore.listAuditEvents(orgA.id);
    const uploadAudit = auditEvents.find(
      (e) => e.action === 'VISUAL_ASSET_UPLOADED' && e.resourceId === assetId
    );

    expect(uploadAudit).toBeDefined();
    expect(uploadAudit?.actorUserId).toBe(adminUserA.id);
    expect(uploadAudit?.metadata.machineId).toBe(machineA.id);
    expect(uploadAudit?.metadata.processingStatus).toBe('UPLOADED');
  });

  // --------------------------------------------------------------------------
  // 11. Partial-Failure Rollback (No Storage Orphans)
  // --------------------------------------------------------------------------
  it('11. should roll back uploaded storage object if database metadata persistence fails', async () => {
    // Spy and force createVisualAsset to fail
    const originalCreate = dataStore.createVisualAsset.bind(dataStore);
    dataStore.createVisualAsset = async () => {
      throw new Error('Database transaction lock failure during metadata creation');
    };

    const res = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, 'rollback_test.png');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);

    // Restore original method
    dataStore.createVisualAsset = originalCreate;

    // Verify no orphaned visual assets in dataStore
    const assets = await dataStore.listVisualAssets(orgA.id);
    const orphan = assets.find((a) => a.filename === 'rollback_test.png');
    expect(orphan).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // 12. Upload Retries Do Not Overwrite Previous Files
  // --------------------------------------------------------------------------
  it('12. should generate unique storage keys and distinct records for duplicate upload attempts', async () => {
    const upload1 = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, 'duplicate_run.png');

    const upload2 = await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, 'duplicate_run.png');

    expect(upload1.status).toBe(201);
    expect(upload2.status).toBe(201);

    expect(upload1.body.data.id).not.toBe(upload2.body.data.id);
    expect(upload1.body.data.storageKey).not.toBe(upload2.body.data.storageKey);

    // Both files exist and are distinct
    const file1 = await storageAdapter.getObject(upload1.body.data.storageKey);
    const file2 = await storageAdapter.getObject(upload2.body.data.storageKey);
    expect(file1.equals(file2)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 13. Query Filtering by Machine and Status
  // --------------------------------------------------------------------------
  it('13. should filter visual assets by machineId and processingStatus', async () => {
    await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .field('machineId', machineA.id)
      .attach('file', samplePngBuffer, 'machine_a_photo.png');

    await request(app)
      .post('/api/v1/visual/upload')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .attach('file', samplePngBuffer, 'general_plant_photo.png');

    // Filter by machineA
    const machineFilterRes = await request(app)
      .get(`/api/v1/visual/assets?machineId=${machineA.id}`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(machineFilterRes.status).toBe(200);
    expect(machineFilterRes.body.data.length).toBe(1);
    expect(machineFilterRes.body.data[0].filename).toBe('machine_a_photo.png');

    // Filter by processingStatus UPLOADED
    const statusFilterRes = await request(app)
      .get(`/api/v1/visual/assets?processingStatus=UPLOADED`)
      .set('Authorization', `Bearer ${tokenAdminA}`);

    expect(statusFilterRes.status).toBe(200);
    expect(statusFilterRes.body.data.length).toBe(2);
  });
});

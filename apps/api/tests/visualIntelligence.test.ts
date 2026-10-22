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
import { OllamaEnterpriseVisionAdapter } from '../src/ai/ollamaEnterpriseVisionAdapter.js';
import { CloudVisionAdapter } from '../src/ai/cloudVisionAdapter.js';
import { VisualIntelligenceEngine } from '../src/services/visualIntelligenceEngine.js';
import path from 'node:path';
import os from 'node:os';

describe('Phase 5: Visual Industrial Intelligence', () => {
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

  // Tenant fixtures
  let orgA: any;
  let orgB: any;
  let userEngineerA: any;
  let userAdminB: any;
  let plantA: any;
  let plantB: any;
  let assetPumpA: any;

  let tokenEngineerA: string;
  let tokenAdminB: string;

  // Manual document chunks for RAG cross-retrieval
  let docA: any;
  let versionA: any;

  const jwtSecret = 'test_jwt_secret_for_visual_intelligence_phase5';

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(
      os.tmpdir(),
      `forgex-visual-test-${Date.now()}-${Math.random()}`
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

    // Seed Org A
    orgA = await dataStore.createOrganization({
      name: 'Refinery Corp A',
      slug: 'refinery-a',
    });

    userEngineerA = await dataStore.createUser({
      externalAuthId: 'ext_eng_a',
      email: 'engineer@refinery-a.com',
      fullName: 'Lead Reliability Engineer',
    });

    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngineerA.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    plantA = await dataStore.createPlant(orgA.id, {
      name: 'Crude Distillation Unit 1',
      code: 'CDU-01',
      location: 'Baytown, TX',
    });

    assetPumpA = await dataStore.createAsset(orgA.id, {
      plantId: plantA.id,
      assetTag: 'P-101-A',
      name: 'Atmospheric Crude Booster Pump A',
      area: 'Pump Bay 1',
      manufacturer: 'Sulzer',
      modelNumber: 'ZE-80',
      serialNumber: 'SN-SULZ-101',
      operationalState: 'OPTIMAL',
    });

    tokenEngineerA = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerA.externalAuthId, email: userEngineerA.email, emailVerified: true },
      jwtSecret
    );

    // Seed Org B (for Cross-Tenant RBAC test)
    orgB = await dataStore.createOrganization({
      name: 'Chemical Industries B',
      slug: 'chemical-b',
    });

    userAdminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: 'admin@chemical-b.com',
      fullName: 'Plant Director B',
    });

    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userAdminB.id,
      role: 'ORGANIZATION_ADMIN',
    });

    plantB = await dataStore.createPlant(orgB.id, {
      name: 'Polymerization Line 2',
      code: 'POLY-02',
      location: 'Deer Park, TX',
    });

    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB.externalAuthId, email: userAdminB.email, emailVerified: true },
      jwtSecret
    );
    void plantB;

    // Seed Engineering Manual Passages in Org A (SOP with Seal Torque Matrix)
    docA = await dataStore.createDocument({
      organizationId: orgA.id,
      plantId: plantA.id,
      documentNumber: 'SOP-MECH-P101',
      title: 'Centrifugal Pump P-101 Maintenance and Mechanical Seal Replacement Standard Procedure',
      category: 'SOP',
      assetTags: ['P-101-A'],
      createdByUserId: userEngineerA.id,
    });

    versionA = await dataStore.createDocumentVersion({
      documentId: docA.id,
      versionNumber: 1,
      revision: 'REV-C',
      filename: 'SOP-MECH-P101_RevC.pdf',
      fileSizeBytes: 450000,
      mimeType: 'application/pdf',
      storageKey: `sop/${orgA.id}/p101_revc.pdf`,
      checksumSha256: 'a1b2c3d4e5f6',
      status: 'INDEXED',
    });

    const chunkContent = `SOP Section 4.3: Mechanical Seal Gland Assembly for P-101-A.
Prior to tightening gland follower bolts, ensure LOTO isolation is verified on suction block valve MOV-101.
Gland studs must be torqued in a cross-star pattern in three progressive passes:
Pass 1: 15 ft-lbs (20 Nm)
Pass 2: 30 ft-lbs (40 Nm)
Final Pass 3: 45 ft-lbs (61 Nm) cross-verified with calibrated torque wrench.
Permissible seal flush plan: Plan 11 with orifice restriction.
Casing drain valve V-101-D must remain closed during flush commissioning.`;

    const [chunk] = await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: versionA.id,
        chunkIndex: 0,
        pageNumber: 12,
        qdrantPointId: crypto.randomUUID(),
        extractionMethod: 'NATIVE_TEXT',
        sectionHeading: '4.3 Mechanical Seal Gland Assembly & Torque Matrix',
        content: chunkContent,
        tokenCount: 65,
      },
    ]);

    const vector = await embeddingAdapter.generateEmbedding(chunkContent);
    await vectorStore.upsertPoints(collectionName, [
      {
        id: chunk.id,
        vector,
        payload: {
          chunkId: chunk.id,
          documentId: docA.id,
          documentVersionId: versionA.id,
          organizationId: orgA.id,
          plantId: plantA.id,
          assetId: assetPumpA.id,
          pageNumber: 12,
          chunkIndex: 0,
          sectionHeading: chunk.sectionHeading,
          content: chunk.content,
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

  describe('1. Industrial Photograph Analysis & SOP Cross-Retrieval', () => {
    it('analyzes pump walkdown photo, detects seal gland bbox, and retrieves authorized SOP torque matrix', async () => {
      // 1x1 valid PNG image buffer
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('assetId', assetPumpA.id)
        .field('query', 'Identify visible components and state proper gland follower bolt torque sequence.')
        .attach('file', samplePng, 'pump_p101_seal_walkdown.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.visualAsset).toBeDefined();
      expect(data.visualAsset.assetType).toBe('PHOTOGRAPH');
      expect(data.visualAsset.modelUsed).toBe('forgex-local-vision-v1');
      expect(data.visualAsset.extractionMethod).toBe('LOCAL_VISION_MODEL');

      // Check detected equipment tags
      expect(data.detectedTags).toContain('P-101-A');

      // Verify connected component labels and normalized bounding box
      expect(data.connectedComponents.length).toBeGreaterThan(0);
      const sealGland = data.connectedComponents.find(
        (c: any) => c.label === 'Mechanical Seal Gland Assembly'
      );
      expect(sealGland).toBeDefined();
      expect(sealGland.equipmentTag).toBe('P-101-A'); // Confidence 0.94 >= 0.70 connected!
      expect(sealGland.confidence).toBeGreaterThanOrEqual(0.70);
      expect(sealGland.bbox).toEqual({ x1: 150, y1: 220, x2: 450, y2: 520 });

      // Component with confidence < 0.70 remains unconnected
      const unverified = data.connectedComponents.find(
        (c: any) => c.label === 'Auxiliary Instrument Tubing Fitting'
      );
      expect(unverified).toBeDefined();
      expect(unverified.equipmentTag).toBeNull(); // Dropped link because 0.55 < 0.70!

      // Verify Cross-Retrieved Operational Manual Citations
      expect(data.crossRetrievedManualCitations.length).toBeGreaterThan(0);
      const citation = data.crossRetrievedManualCitations[0];
      expect(citation.documentId).toBe(docA.id);
      expect(citation.pageNumber).toBe(12);

      // Verify Grounded Multi-modal Answer contains both visual and manual evidence
      expect(data.answer).toContain('Visual Inspection Observations');
      expect(data.answer).toContain('Mechanical Seal Gland Assembly');
      expect(data.answer).toContain('Cross-Retrieved Operational Manual Evidence');
      expect(data.isInsufficientEvidence).toBe(false);
      expect(data.isAmbiguousDiagram).toBe(false);
    });
  });

  describe('2. Rendered P&ID Diagram Handling & Disclaimer Notice', () => {
    it('extracts P&ID tags (P-101-A, MOV-101, FT-101-B), cross-retrieves manual, and disclaims pipe connectivity', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('query', 'Read equipment tags and cross-reference isolation valves.')
        .attach('file', samplePng, 'cdu_crude_booster_pid_schematic.png');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.visualAsset.assetType).toBe('PID_RENDER');
      expect(data.detectedTags).toEqual(['P-101-A', 'MOV-101', 'FT-101-B']);

      // Component threshold verification
      const suctionValve = data.connectedComponents.find((c: any) => c.equipmentTag === 'MOV-101');
      expect(suctionValve).toBeDefined();
      expect(suctionValve.confidence).toBe(0.91);

      const purgeLine = data.connectedComponents.find(
        (c: any) => c.label === 'Secondary Purge Bypass Line'
      );
      expect(purgeLine).toBeDefined();
      expect(purgeLine.equipmentTag).toBeNull(); // 0.62 < 0.70 unlinked

      // Must include engineering disclaimer for P&ID linework
      expect(data.answer).toContain('P&ID Notice');
      expect(data.answer).toContain('pipe connectivity require certified engineering');
    });
  });

  describe('3. Ambiguous & Degraded Diagram Handling', () => {
    it('flags ambiguous linework, sets confidence UNCERTAIN, and halts automated connectivity inference', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('query', 'Is this valve connected upstream of the pump?')
        .attach('file', samplePng, 'degraded_ambiguous_pid.png');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.isAmbiguousDiagram).toBe(true);
      expect(data.confidence).toBe('UNCERTAIN');
      expect(data.answer).toContain('WARNING: AMBIGUOUS DIAGRAM IDENTIFIED');
      expect(data.answer).toContain('Escalation required: Field verification');
      expect(data.crossRetrievedManualCitations).toEqual([]);
    });
  });

  describe('4. Insufficient Visual Evidence Handling', () => {
    it('detects uninformative or blank images, returns INSUFFICIENT_EVIDENCE with guidance', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('query', 'Inspect this walkdown photo.')
        .attach('file', samplePng, 'blank_empty_capture.png');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.isInsufficientEvidence).toBe(true);
      expect(data.confidence).toBe('INSUFFICIENT_EVIDENCE');
      expect(data.answer).toContain('Insufficient visual evidence');
      expect(data.crossRetrievedManualCitations).toEqual([]);
    });
  });

  describe('5. Unsupported File Type Enforcement', () => {
    it('rejects unsupported file formats (.txt, .pdf, .exe) with 400 Bad Request', async () => {
      const textBuffer = Buffer.from('Just a text file posing as an image', 'utf-8');

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('query', 'Analyze this.')
        .attach('file', textBuffer, 'notes.txt');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unsupported visual format');
    });
  });

  describe('6. Original Image Streaming & Asset Management', () => {
    it('stores asset and allows authorized technician to fetch binary image for side-by-side display', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      // 1. Upload & Inspect
      const uploadRes = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('query', 'Inspect pump casing.')
        .attach('file', samplePng, 'pump_inspection.png');

      expect(uploadRes.status).toBe(200);
      const assetId = uploadRes.body.data.visualAsset.id;

      // 2. Fetch Asset Metadata
      const getRes = await request(app)
        .get(`/api/v1/visual/assets/${assetId}`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(assetId);
      expect(getRes.body.data.filename).toBe('pump_inspection.png');

      // 3. List Assets for Org A
      const listRes = await request(app)
        .get('/api/v1/visual/assets')
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((a: any) => a.id === assetId)).toBe(true);

      // 4. Stream Raw Image
      const imageRes = await request(app)
        .get(`/api/v1/visual/assets/${assetId}/image`)
        .set('Authorization', `Bearer ${tokenEngineerA}`);

      expect(imageRes.status).toBe(200);
      expect(imageRes.headers['content-type']).toContain('image/png');
      expect(imageRes.body).toBeInstanceOf(Buffer);
    });
  });

  describe('7. Multi-Tenant RBAC & Security Isolation', () => {
    it('prevents Org B users from accessing or listing Org A visual assets', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      // Create asset under Org A
      const uploadRes = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .field('plantId', plantA.id)
        .field('query', 'Check pump seal.')
        .attach('file', samplePng, 'confidential_orgA_seal.png');

      expect(uploadRes.status).toBe(200);
      const assetIdOrgA = uploadRes.body.data.visualAsset.id;

      // Org B user attempts to retrieve Org A asset metadata -> 404 Not Found
      const getResB = await request(app)
        .get(`/api/v1/visual/assets/${assetIdOrgA}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(getResB.status).toBe(404);

      // Org B user attempts to stream Org A image -> 404 Not Found
      const streamResB = await request(app)
        .get(`/api/v1/visual/assets/${assetIdOrgA}/image`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(streamResB.status).toBe(404);

      // Org B user lists assets -> Must not include Org A asset
      const listResB = await request(app)
        .get('/api/v1/visual/assets')
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(listResB.status).toBe(200);
      expect(listResB.body.data.every((a: any) => a.organizationId === orgB.id)).toBe(true);

      // Org B user attempts to inspect with Org A's plantId -> Rejected
      const crossInspectRes = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .field('plantId', plantA.id)
        .field('query', 'Spy on Plant A.')
        .attach('file', samplePng, 'unauthorized.png');

      expect(crossInspectRes.status).toBe(400);
      expect(crossInspectRes.body.error).toContain('does not belong to organization');
    });
  });

  describe('8. Provider Pluggability & Air-Gapped Zero Cloud Fallback', () => {
    it('strictly forbids cloud fallback when Enterprise Ollama Vision fails', async () => {
      // Connect to unreachable endpoint simulating local server downtime
      const offlineOllama = new OllamaEnterpriseVisionAdapter(
        'http://127.0.0.1:54321', // Offline port
        'qwen2.5-vl:7b-industrial'
      );

      await expect(
        offlineOllama.analyzeImage({
          imageBuffer: Buffer.from('fake'),
          filename: 'pump.png',
          mimeType: 'image/png',
          query: 'Check pump',
        })
      ).rejects.toThrow(/Enterprise Vision Failure.*Air-gapped policy strictly forbids cloud fallback/);
    });

    it('cloud vision adapter processes request within cloud SaaS tenant envelope', async () => {
      const cloudAdapter = new CloudVisionAdapter('test_key', 'gpt-4o-industrial');
      const result = await cloudAdapter.analyzeImage({
        imageBuffer: Buffer.from('fake'),
        filename: 'pump.png',
        mimeType: 'image/png',
      });

      expect(result.modelUsed).toBe('gpt-4o-industrial');
      expect(result.processingMethod).toBe('CLOUD_VISION_MODEL');
      expect(result.confidenceScore).toBe(0.95);
    });
  });
});

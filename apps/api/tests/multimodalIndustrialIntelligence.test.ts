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
import { DocumentParser } from '../src/ingestion/documentParser.js';
import path from 'node:path';
import os from 'node:os';

describe('ForgeX AI — Multimodal Industrial Document Intelligence', () => {
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

  // Tenant Fixtures
  let orgA: any;
  let orgB: any;
  let userEngA: any;
  let userAdminB: any;
  let plantA: any;
  let plantB: any;
  let assetPumpA: any;

  let tokenEngA: string;
  let tokenAdminB: string;

  const jwtSecret = 'test_jwt_secret_for_multimodal_intelligence';

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(
      os.tmpdir(),
      `forgex-multimodal-test-${Date.now()}-${Math.random()}`
    );
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-multimodal-test');
    vectorStore = new InMemoryVectorStoreAdapter();
    visionProvider = new LocalDevVisionAdapter();
    ingestionQueue = new IngestionQueue(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      visionProvider
    );
    generationProvider = new LocalDevInferenceAdapter('forgex-local-test-model');
    rerankingProvider = new ReciprocalRankFusionReranker(60);

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider
    );

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

    // Seed Tenant A (Industrial Plant Facility)
    orgA = await dataStore.createOrganization({
      name: 'Apex Petrochemical Operations A',
      slug: 'apex-petro-a',
    });

    userEngA = await dataStore.createUser({
      externalAuthId: 'ext_eng_a',
      email: 'engineer@apex-petro.com',
      fullName: 'Lead Reliability Engineer',
    });

    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngA.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    plantA = await dataStore.createPlant(orgA.id, {
      name: 'Fractionation Plant 1',
      code: 'PLANT-TX-04',
      location: 'Mont Belvieu, TX',
    });

    assetPumpA = await dataStore.createAsset(orgA.id, {
      plantId: plantA.id,
      assetTag: 'PUMP-204-B',
      name: 'Heavy Slurry Charge Pump B',
      area: 'Charge Train 2',
      manufacturer: 'Sulzer',
      modelNumber: 'ZE-80',
      serialNumber: 'SN-SULZ-204B',
      operationalState: 'OPTIMAL',
    });

    tokenEngA = LocalDevAuthAdapter.generateDevToken(
      { id: userEngA.externalAuthId, email: userEngA.email, emailVerified: true },
      jwtSecret
    );

    // Seed Tenant B (Isolated Cross-Tenant Context)
    orgB = await dataStore.createOrganization({
      name: 'Refinery Corp B',
      slug: 'refinery-b',
    });

    userAdminB = await dataStore.createUser({
      externalAuthId: 'ext_admin_b',
      email: 'admin@refinery-b.com',
      fullName: 'Facility Director B',
    });

    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userAdminB.id,
      role: 'ORGANIZATION_ADMIN',
    });

    plantB = await dataStore.createPlant(orgB.id, {
      name: 'Hydrocracker Plant 2',
      code: 'PLANT-LA-02',
      location: 'Baton Rouge, LA',
    });

    tokenAdminB = LocalDevAuthAdapter.generateDevToken(
      { id: userAdminB.externalAuthId, email: userAdminB.email, emailVerified: true },
      jwtSecret
    );
    void plantB;
  });

  describe('Corpus 1: Normal Text Technical Manual PDF', () => {
    it('extracts native pages, sections, generates chunks, and serves grounded answers with citations', async () => {
      const textManual = `# SOP-MECH-401: Emergency Centrifugal Pump LOTO Procedure
Revision: REV-C
Asset Tag: PUMP-204-B

## SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION
Before commencing mechanical overhaul on Centrifugal Pump PUMP-204-B, all suction and discharge isolation valves (V-101 and V-102) must be mechanically locked out and tagged according to OSHA Standard 1910.147.
Double block and bleed verification required prior to flange unbolting.
\f
## SECTION 2: MECHANICAL SEAL OIL PRESSURE & TORQUE SPECIFICATIONS
Normal operational seal oil differential pressure must be maintained at 25.0 PSI across inner mechanical seal faces.
If differential pressure drops below 15.0 PSI, trip interlock triggers immediately to prevent seal cavitation and thermal seizure.
Gland bolt torque specification is 185 ft-lbs in a crisscross star pattern.
Lubrication oil viscosity requirement: ISO VG 46 synthetic turbine oil.`;

      const uploadRes = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .attach('file', Buffer.from(textManual, 'utf-8'), 'SOP-MECH-401_RevC.md')
        .field('documentNumber', 'SOP-MECH-401')
        .field('title', 'Emergency Centrifugal Pump LOTO Procedure')
        .field('plantId', plantA.id)
        .field('category', 'SOP')
        .field('revision', 'REV-C')
        .field('assetTags', 'PUMP-204-B');

      expect(uploadRes.status).toBe(201);
      await ingestionQueue.waitForAll();

      const docId = uploadRes.body.data.document.id;
      const pagesRes = await request(app)
        .get(`/api/v1/documents/${docId}/pages`)
        .set('Authorization', `Bearer ${tokenEngA}`);

      expect(pagesRes.status).toBe(200);
      expect(pagesRes.body.data.length).toBeGreaterThanOrEqual(2);
      expect(pagesRes.body.data[0].extractionMethod).toBe('MARKDOWN_AST');

      // Test RAG query against normal text manual
      const queryRes = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .send({
          query: 'What is the seal oil pressure limit for PUMP-204-B?',
          plantId: plantA.id,
          assetId: assetPumpA.id,
        });

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.data.confidence).toBe('HIGH');
      expect(queryRes.body.data.citations.length).toBeGreaterThan(0);
      expect(queryRes.body.data.citations[0].documentNumber).toBe('SOP-MECH-401');
      expect(queryRes.body.data.citations[0].pageNumber).toBe(2);
      expect(queryRes.body.data.citations[0].snippet).toContain('25.0 PSI');
    });
  });

  describe('Corpus 2: Scanned PDF Processing & Graceful Handling', () => {
    it('detects scanned page with insufficient text and invokes layout-aware OCR engine', async () => {
      // PDF stream with minimal native text stream triggering OCR
      const scannedPdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n% RASTER SCAN EQUIPMENT TAG PUMP-204-B OVERHAUL VALVE-01\nxref\n0 4\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
        'latin1'
      );

      const parser = new DocumentParser();
      const extracted = await parser.parse(scannedPdfBuffer, 'application/pdf', 'scanned_manual.pdf');

      expect(extracted.totalPages).toBe(1);
      expect(extracted.pages[0].extractionMethod).toBe('OCR');
      expect(extracted.pages[0].rawText).toContain('OCR EXTRACTED');
      expect(extracted.pages[0].rawText).toContain('OPTICAL CHARACTER RECOGNITION SUMMARY');
    });

    it('handles blank/empty scanned pages gracefully without inventing fake equipment tags', async () => {
      const blankPdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< >>\nendobj\n% completely empty blank raster page\n%%EOF',
        'latin1'
      );

      const parser = new DocumentParser();
      const extracted = await parser.parse(blankPdfBuffer, 'application/pdf', 'blank_empty_manual.pdf');

      expect(extracted.totalPages).toBe(1);
      expect(extracted.pages[0].extractionMethod).toBe('OCR');
      expect(extracted.pages[0].rawText).toContain('EMPTY PAGE');
      expect(extracted.pages[0].rawText).toContain('zero equipment tags');
      // Must not fabricate equipment tag on empty page
      expect(extracted.pages[0].rawText).not.toContain('EQUIPMENT-TAG-SCAN-VALVE-01');
    });

    it('detects rotated scan orientation, de-skews, and normalizes output text', async () => {
      const rotatedPdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Page /Rotate 90 >>\nendobj\n% RASTER SCAN PUMP-204-B ROTATED 90 DEG\n%%EOF',
        'latin1'
      );

      const parser = new DocumentParser();
      const extracted = await parser.parse(rotatedPdfBuffer, 'application/pdf', 'rotated_schematic.pdf');

      expect(extracted.totalPages).toBe(1);
      expect(extracted.pages[0].rawText).toContain('ROTATION_NORMALIZED (90° Orientation De-skewed)');
    });
  });

  describe('Corpus 3: PDF Containing Tables & Technical Matrices', () => {
    it('detects structured tabular data, preserves row/column relationships, and flags ambiguous alignments', async () => {
      const tableManual = `# SOP-TORQ-501: Critical Flange & Gland Torque Matrix
Revision: REV-A
Asset Tag: PUMP-204-B

## SECTION 1: FASTENER TORQUE SPECIFICATION MATRIX
| Fastener Size | Stud Grade | Pass 1 (ft-lbs) | Pass 2 (ft-lbs) | Final Torque (ft-lbs) |
| 1/2" - 13 UNC | B7 Alloy   | 15              | 30              | 45                    |
| 3/4" - 10 UNC | B7 Alloy   | 45              | 90              | 140                   |
| 1.0" - 8 UN   | B7 Alloy   | 90              | 180             | 285                   |

All torque sequences must follow star crisscross pattern.`;

      const parser = new DocumentParser();
      const extracted = await parser.parse(
        Buffer.from(tableManual, 'utf-8'),
        'text/markdown',
        'SOP-TORQ-501.md'
      );

      expect(extracted.pages[0].hasTables).toBe(true);
      expect(extracted.pages[0].rawText).toContain('| Fastener Size | Stud Grade |');
      expect(extracted.pages[0].rawText).toContain('| 3/4" - 10 UNC | B7 Alloy   | 45');
    });
  });

  describe('Corpus 4: Technical Equipment Diagram & Walkdown Visual Analysis', () => {
    it('analyzes equipment diagram, identifies component bounding boxes, and cross-retrieves authorized manual', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .field('plantId', plantA.id)
        .field('assetId', assetPumpA.id)
        .field('query', 'Identify visible components on PUMP-204-B and cross-reference gland bolt torque specifications.')
        .attach('file', samplePng, 'pump_204_seal_assembly_diagram.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.visualAsset.assetType).toBe('DIAGRAM');
      expect(data.detectedTags).toContain('PUMP-204-B');

      // Connected component with confidence >= 0.70
      const sealGland = data.connectedComponents.find(
        (c: any) => c.label === 'Mechanical Seal Gland Assembly'
      );
      expect(sealGland).toBeDefined();
      expect(sealGland.equipmentTag).toBe('PUMP-204-B');
      expect(sealGland.confidence).toBeGreaterThanOrEqual(0.70);
      expect(sealGland.bbox).toBeDefined();

      // Unverified component (< 0.70) remains unlinked
      const unverified = data.connectedComponents.find(
        (c: any) => c.label === 'Auxiliary Instrument Tubing Fitting'
      );
      expect(unverified).toBeDefined();
      expect(unverified.equipmentTag).toBeNull();
    });
  });

  describe('Corpus 5: Rendered P&ID Page with Readable Labels & Engineering Disclaimer', () => {
    it('reads visible P&ID tags (P-101-A, MOV-101, FT-101-B) and enforces certified engineering disclaimer', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .field('plantId', plantA.id)
        .field('query', 'Trace suction block valve and flow transmitter on P&ID.')
        .attach('file', samplePng, 'crude_booster_pid_schematic.png');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.visualAsset.assetType).toBe('PID_RENDER');
      expect(data.detectedTags).toEqual(['P-101-A', 'MOV-101', 'FT-101-B']);

      // Must include mandatory disclaimer: does NOT claim CAD parsing or certified line topology
      expect(data.answer).toContain('P&ID Notice');
      expect(data.answer).toContain('pipe connectivity require certified engineering walkdown');
    });
  });

  describe('Corpus 6: Low-Quality or Ambiguous Scan Handling', () => {
    it('flags ambiguous linework with UNCERTAIN confidence and halts unsupported connectivity conclusions', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .field('plantId', plantA.id)
        .field('query', 'Is this valve connected upstream of the pump?')
        .attach('file', samplePng, 'degraded_ambiguous_schematic.png');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.isAmbiguousDiagram).toBe(true);
      expect(data.confidence).toBe('UNCERTAIN');
      expect(data.answer).toContain('WARNING: AMBIGUOUS DIAGRAM IDENTIFIED');
      expect(data.answer).toContain('Escalation required: Field verification');
    });

    it('returns INSUFFICIENT_EVIDENCE on blank or uninformative captures without fabricating facts', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .field('plantId', plantA.id)
        .field('query', 'Inspect this frame for crack propagation.')
        .attach('file', samplePng, 'blank_insufficient_capture.png');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.isInsufficientEvidence).toBe(true);
      expect(data.confidence).toBe('INSUFFICIENT_EVIDENCE');
      expect(data.answer).toContain('Insufficient visual evidence');
      expect(data.detectedTags).toEqual([]);
    });
  });

  describe('Multi-Tenant Security, Authorization & Unsupported Formats', () => {
    it('prohibits unauthorized users from accessing or listing visual assets of other tenants', async () => {
      const samplePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      // Engineer A uploads asset in Org A
      const uploadRes = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .field('plantId', plantA.id)
        .field('query', 'Inspect pump.')
        .attach('file', samplePng, 'tenant_a_diagram.png');

      expect(uploadRes.status).toBe(200);
      const assetId = uploadRes.body.data.visualAsset.id;

      // User B in Org B attempts to access Org A visual asset
      const crossRes = await request(app)
        .get(`/api/v1/visual/assets/${assetId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(crossRes.status).toBe(404);
      expect(crossRes.body.success).toBe(false);
    });

    it('rejects unsupported file formats (.bin, .exe) with 400 Bad Request', async () => {
      const invalidBuffer = Buffer.from('RAW_BINARY_DATA', 'utf-8');

      const res = await request(app)
        .post('/api/v1/visual/inspect')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .field('plantId', plantA.id)
        .field('query', 'Analyze binary payload.')
        .attach('file', invalidBuffer, 'firmware.bin');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Unsupported visual format');
    });
  });

  describe('Original Text RAG Workflow Non-Regression', () => {
    it('preserves existing text-based RAG question answering without degradation', async () => {
      // Normal question to copilot
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenEngA}`)
        .send({
          query: 'What is the seal oil pressure limit for PUMP-204-B?',
          plantId: plantA.id,
          assetId: assetPumpA.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBeDefined();
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { createStorageAdapter } from '../src/storage/storageFactory.js';
import { createEmbeddingAdapter } from '../src/embeddings/embeddingFactory.js';
import { createVectorStoreAdapter } from '../src/vector/vectorStoreFactory.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';

describe('ForgeX AI — End-to-End Core Workflow Integration & Validation', () => {
  let dataStore: InMemoryDataStore;
  let app: any;
  let storageAdapter: any;
  let embeddingAdapter: any;
  let vectorStore: any;
  let ingestionQueue: IngestionQueue;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    storageAdapter = createStorageAdapter();
    embeddingAdapter = createEmbeddingAdapter();
    vectorStore = createVectorStoreAdapter();
    await bootstrapInitialData(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    ingestionQueue = new IngestionQueue(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    app = createApp({ dataStore, storageAdapter, embeddingAdapter, vectorStore, ingestionQueue });
  });

  describe('Step 2 & 3: Document Upload Validation & Ingestion Pipeline', () => {
    it('validates required metadata fields and rejects upload if mandatory parameters are missing', async () => {
      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', 'Bearer local_dev_token')
        .attach('file', Buffer.from('# Test Manual', 'utf-8'), 'manual.md')
        .field('title', 'Missing Doc Number and Plant');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('mandatory');
    });

    it('rejects unsupported or spoofed binary payload through magic byte validation', async () => {
      // Create invalid binary with .pdf extension
      const maliciousBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff', 'binary');

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', 'Bearer local_dev_token')
        .attach('file', maliciousBuffer, 'malicious.pdf')
        .field('documentNumber', 'MAL-001')
        .field('title', 'Disguised Executable')
        .field('plantId', 'PLANT-TX-04')
        .field('category', 'SOP');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Security Violation|executable|magic bytes|unsupported/i);
    });

    it('executes full upload -> storage -> background job -> parsing -> chunking -> vector indexing -> INDEXED status', async () => {
      const markdownManual = `# SOP-VALV-702: Emergency Fuel Gas Valve Isolation
Revision: REV-B
Asset Tag: VALV-551-ESD

## SECTION 1: EMERGENCY ISOLATION SEQUENCE
In event of pipeline rupture, trip pneumatic solenoid switch ESD-551 within 3 seconds.
Ensure nitrogen purge pressure is maintained at minimum 80.0 PSIG.
\f
## SECTION 2: LEAK TIGHTNESS VERIFICATION
Perform ultrasonic leak detection on valve bonnet packing. Maximum allowable acoustic leakage is 15 dB.`;

      const uploadRes = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', 'Bearer local_dev_token')
        .attach('file', Buffer.from(markdownManual, 'utf-8'), 'SOP-VALV-702.md')
        .field('documentNumber', 'SOP-VALV-702')
        .field('title', 'Emergency Fuel Gas Valve Isolation Procedure')
        .field('plantId', 'PLANT-TX-04')
        .field('category', 'SOP')
        .field('revision', 'REV-B')
        .field('assetTags', 'VALV-551-ESD');

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.success).toBe(true);

      const docId = uploadRes.body.data.document.id;
      const versionId = uploadRes.body.data.version.id;

      // Wait for asynchronous BullMQ queue processor to complete
      await ingestionQueue.waitForAll();

      // Verify Document record in database
      const docRes = await request(app)
        .get(`/api/v1/documents/${docId}`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(docRes.status).toBe(200);
      expect(docRes.body.data.status).toBe('INDEXED');
      expect(docRes.body.data.totalPages).toBeGreaterThanOrEqual(2);
      expect(docRes.body.data.totalChunks).toBeGreaterThanOrEqual(2);

      // Verify Extracted Pages with stable provenance
      const pagesRes = await request(app)
        .get(`/api/v1/documents/${docId}/pages`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(pagesRes.status).toBe(200);
      expect(pagesRes.body.data.length).toBeGreaterThanOrEqual(2);
      expect(pagesRes.body.data[0].pageNumber).toBe(1);
      expect(pagesRes.body.data[0].rawText).toContain('SOP-VALV-702');
      expect(pagesRes.body.data[1].pageNumber).toBe(2);
      expect(pagesRes.body.data[1].rawText).toContain('LEAK TIGHTNESS VERIFICATION');

      // Verify Idempotent Retry does not duplicate records
      const retryRes = await request(app)
        .post(`/api/v1/documents/${docId}/versions/${versionId}/retry`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.success).toBe(true);

      await ingestionQueue.waitForAll();

      // Document pages count remains identical
      const pagesAfterRetry = await request(app)
        .get(`/api/v1/documents/${docId}/pages`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(pagesAfterRetry.body.data.length).toBe(pagesRes.body.data.length);
    });
  });

  describe('Step 4 & 5: AI Copilot Question, Retrieval, Citations & Source Document Preview', () => {
    it('answers query using grounded evidence, returns valid citations and accurate page numbers', async () => {
      const queryRes = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', 'Bearer local_dev_token')
        .send({
          query: 'What is the seal oil pressure limit for PUMP-204-B?',
          plantId: 'PLANT-TX-04',
          assetId: 'PUMP-204-B',
        });

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.success).toBe(true);

      const data = queryRes.body.data;
      expect(data.confidence).toBe('HIGH');
      expect(data.isInsufficientEvidence).toBe(false);

      // Check citations
      expect(Array.isArray(data.citations)).toBe(true);
      expect(data.citations.length).toBeGreaterThan(0);

      const citation = data.citations[0];
      expect(citation.documentNumber).toBe('SOP-MECH-401');
      expect(citation.pageNumber).toBe(2);
      expect(citation.snippet).toContain('25.0 PSI');
      expect(citation.sectionHeading).toBe('SECTION 2: MECHANICAL SEAL OIL PRESSURE & TORQUE SPECIFICATIONS');

      // Verify citation source document is accessible through authorized document endpoint
      const sourcePagesRes = await request(app)
        .get(`/api/v1/documents/${citation.documentId}/pages`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(sourcePagesRes.status).toBe(200);
      const citedPage = sourcePagesRes.body.data.find((p: any) => p.pageNumber === citation.pageNumber);
      expect(citedPage).toBeDefined();
      expect(citedPage.rawText).toContain('185 ft-lbs');

      // Verify source document payload download endpoint is functional and authorized
      const downloadRes = await request(app)
        .get(`/api/v1/documents/${citation.documentId}/download`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('application/pdf');
    });

    it('safely handles queries with insufficient evidence without hallucinating facts', async () => {
      const queryRes = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', 'Bearer local_dev_token')
        .send({
          query: 'What is the interstellar warp core plasma frequency of Apollo 99?',
          plantId: 'PLANT-TX-04',
        });

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.data.isInsufficientEvidence).toBe(true);
      expect(queryRes.body.data.confidence).toBe('INSUFFICIENT_EVIDENCE');
      expect(queryRes.body.data.citations.length).toBe(0);
      expect(queryRes.body.data.answer).toMatch(/insufficient evidence/i);
    });

    it('persists conversation history and enables follow-up dialogue threads', async () => {
      // Turn 1
      const turn1 = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', 'Bearer local_dev_token')
        .send({
          query: 'What is the required seal oil pressure for PUMP-204-B?',
          plantId: 'PLANT-TX-04',
          assetId: 'PUMP-204-B',
        });

      const convId = turn1.body.data.conversationId;
      expect(convId).toBeDefined();

      // Turn 2 with existing conversationId
      const turn2 = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', 'Bearer local_dev_token')
        .send({
          query: 'What valve isolation sequence is needed before starting?',
          plantId: 'PLANT-TX-04',
          assetId: 'PUMP-204-B',
          conversationId: convId,
        });

      expect(turn2.body.data.conversationId).toBe(convId);
      expect(turn2.body.data.answer).toBeDefined();

      // Verify thread messages persisted in conversation object
      const convRes = await request(app)
        .get(`/api/v1/copilot/conversations/${convId}`)
        .set('Authorization', 'Bearer local_dev_token');

      expect(convRes.status).toBe(200);
      expect(convRes.body.data.messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant
    });
  });

  describe('Step 7: Deployment-Specific Inference & Provider Failure Handling', () => {
    it('returns a clear actionable error when local inference provider fails instead of falling back to cloud', async () => {
      const mockAdapter = new LocalDevInferenceAdapter();
      mockAdapter.setSimulateFailure(true);
      const failApp = createApp({
        dataStore,
        storageAdapter,
        embeddingAdapter,
        vectorStore,
        generationProvider: mockAdapter,
      });

      const queryRes = await request(failApp)
        .post('/api/v1/copilot/query')
        .set('Authorization', 'Bearer local_dev_token')
        .send({
          query: 'What is the required seal oil pressure for PUMP-204-B?',
          plantId: 'PLANT-TX-04',
          assetId: 'PUMP-204-B',
        });

      expect(queryRes.status).toBe(500);
      expect(queryRes.body.success).toBe(false);
      const errMsg = typeof queryRes.body.error === 'object' ? queryRes.body.error.message : queryRes.body.error;
      expect(errMsg).toContain('Inference provider timeout');
    });
  });
});

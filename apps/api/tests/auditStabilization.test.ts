import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { createGenerationProvider, resetGenerationProvider } from '../src/ai/aiProviderFactory.js';
import { createVisionProvider, resetVisionProvider } from '../src/ai/visionProviderFactory.js';
import { createStorageAdapter } from '../src/storage/storageFactory.js';
import { createEmbeddingAdapter } from '../src/embeddings/embeddingFactory.js';
import { createVectorStoreAdapter } from '../src/vector/vectorStoreFactory.js';
import { config } from '../src/config/env.js';

describe('Post-Implementation Integration Audit & Stabilization Regressions', () => {
  let dataStore: InMemoryDataStore;
  let app: any;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    const storageAdapter = createStorageAdapter();
    const embeddingAdapter = createEmbeddingAdapter();
    const vectorStore = createVectorStoreAdapter();
    await bootstrapInitialData(dataStore, storageAdapter, embeddingAdapter, vectorStore);
    app = createApp({ dataStore, storageAdapter, embeddingAdapter, vectorStore });
  });

  describe('1. Authentication & Session Handling', () => {
    it('accepts local_dev_token in local dev mode and resolves Lead Engineer identity', async () => {
      const adapter = new LocalDevAuthAdapter(config.JWT_SECRET);
      const user = await adapter.verifyToken('local_dev_token');
      expect(user.id).toBe('user-dev-eng-1');
      expect(user.email).toBe('engineer@forgex.industrial');
    });

    it('rejects unauthenticated requests with 401 FORGEX_AUTH_UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/plants');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_AUTH_UNAUTHORIZED');
    });

    it('successfully authorizes requests using Bearer local_dev_token', async () => {
      const res = await request(app)
        .get('/api/v1/plants')
        .set('Authorization', 'Bearer local_dev_token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].code).toBe('PLANT-TX-04');
    });
  });

  describe('2. Plant and Asset Lookups by Code and Tag', () => {
    it('resolves plant by code when code is used in place of ID', async () => {
      const org = await dataStore.getOrganizationBySlug('apex-energy-tx');
      expect(org).not.toBeNull();

      const plantByCode = await dataStore.getPlantById(org!.id, 'PLANT-TX-04');
      expect(plantByCode).not.toBeNull();
      expect(plantByCode!.code).toBe('PLANT-TX-04');
    });

    it('resolves asset by assetTag when tag is used in place of ID', async () => {
      const org = await dataStore.getOrganizationBySlug('apex-energy-tx');
      const assetByTag = await dataStore.getAssetById(org!.id, 'PUMP-204-B');
      expect(assetByTag).not.toBeNull();
      expect(assetByTag!.assetTag).toBe('PUMP-204-B');
    });
  });

  describe('3. End-to-End RAG Copilot Workflow with Citations', () => {
    it('queries Copilot for seal oil limit and returns verified citations with page numbers', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', 'Bearer local_dev_token')
        .send({
          query: 'What is the seal oil pressure limit for PUMP-204-B?',
          plantId: 'PLANT-TX-04',
          assetId: 'PUMP-204-B',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBeDefined();

      const citations = res.body.data.citations;
      expect(Array.isArray(citations)).toBe(true);
      expect(citations.length).toBeGreaterThan(0);

      const firstCitation = citations[0];
      expect(firstCitation.documentNumber).toBe('SOP-MECH-401');
      expect(firstCitation.pageNumber).toBe(2);
      expect(firstCitation.snippet).toContain('25.0 PSI');
    });
  });

  describe('4. Enterprise Air-Gap Security Enforcement', () => {
    it('prohibits cloud inference when deployed in enterprise air-gapped mode', () => {
      const originalMode = config.DEPLOYMENT_MODE;
      try {
        (config as any).DEPLOYMENT_MODE = 'enterprise';
        process.env.INFERENCE_PROVIDER = 'openai';
        resetGenerationProvider();

        expect(() => createGenerationProvider()).toThrow(
          /Enterprise Air-Gap Policy: Cloud inference is strictly prohibited/
        );
      } finally {
        (config as any).DEPLOYMENT_MODE = originalMode;
        delete process.env.INFERENCE_PROVIDER;
        resetGenerationProvider();
      }
    });

    it('prohibits cloud vision analysis when deployed in enterprise air-gapped mode', () => {
      const originalMode = config.DEPLOYMENT_MODE;
      try {
        (config as any).DEPLOYMENT_MODE = 'enterprise';
        process.env.VISION_PROVIDER = 'cloud';
        resetVisionProvider();

        expect(() => createVisionProvider()).toThrow(
          /Enterprise Air-Gap Policy: Cloud vision provider is strictly prohibited/
        );
      } finally {
        (config as any).DEPLOYMENT_MODE = originalMode;
        delete process.env.VISION_PROVIDER;
        resetVisionProvider();
      }
    });
  });

  describe('5. Cross-Tenant Security Isolation', () => {
    it('blocks an unauthorized user from accessing another organization documents', async () => {
      // User with no membership
      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', 'Bearer local_dev_token')
        .set('x-organization-id', '00000000-0000-0000-0000-999999999999');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_TENANT_MISMATCH');
    });
  });
});

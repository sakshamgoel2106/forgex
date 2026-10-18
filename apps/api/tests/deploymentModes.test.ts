import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { KeycloakAuthAdapter } from '../src/auth/keycloakAuthAdapter.js';
import { SupabaseAuthAdapter } from '../src/auth/supabaseAuthAdapter.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { CloudSaasAdapter } from '../src/ai/cloudSaasAdapter.js';
import { OllamaEnterpriseAdapter } from '../src/ai/ollamaEnterpriseAdapter.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import {
  setGenerationProvider,
  resetGenerationProvider,
} from '../src/ai/aiProviderFactory.js';
import { HealthService } from '../src/services/health.service.js';
import { RateLimiterService } from '../src/middleware/rateLimiter.middleware.js';
import {
  config,
  maskSecret,
  getSanitizedConfig,
  validateModeSpecificRequirements,
} from '../src/config/env.js';

describe('Phase 7: SaaS and Private Enterprise Release Suite', () => {
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let ingestionQueue: IngestionQueue;
  let generationProvider: LocalDevInferenceAdapter;
  let rerankingProvider: ReciprocalRankFusionReranker;
  let ragEngine: RAGQueryEngine;
  let app: ReturnType<typeof createApp>;

  let orgA: any;
  let orgB: any;
  let userEngineerA: any;
  let userEngineerB: any;
  let plantA: any;
  let plantB: any;
  let assetCompressorA: any;
  let docA: any;
  let versionA: any;
  let chunkA: any;

  let tokenEngineerA: string;
  let tokenEngineerB: string;

  const jwtSecret = 'forgex_super_secret_jwt_key_at_least_32_characters_2026';

  beforeEach(async () => {
    RateLimiterService.reset();
    HealthService.clearOverrides();
    resetGenerationProvider();

    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(os.tmpdir(), `forgex-release-test-${Date.now()}-${Math.random()}`);
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-release-test');
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

    app = createApp({
      authAdapter,
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      ingestionQueue,
      ragEngine,
      generationProvider,
      rerankingProvider,
    });

    // 1. Seed Organizations
    orgA = await dataStore.createOrganization({
      name: 'Gulf Petrochemical Unit',
      slug: 'gulf-petro',
    });
    orgB = await dataStore.createOrganization({
      name: 'Borealis Energy East',
      slug: 'borealis-east',
    });

    // 2. Seed Users
    userEngineerA = await dataStore.createUser({
      externalAuthId: 'ext_eng_gulf_a',
      email: 'lead.engineer@gulfpetro.com',
      fullName: 'Elena Rostova PE',
    });
    userEngineerB = await dataStore.createUser({
      externalAuthId: 'ext_eng_borealis_b',
      email: 'johann.berg@borealis.com',
      fullName: 'Johann Berg',
    });

    // 3. Seed Memberships
    await dataStore.createMembership({
      organizationId: orgA.id,
      userId: userEngineerA.id,
      role: 'ENGINEER_TECHNICIAN',
    });
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: userEngineerB.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    // 4. Seed Plants and Assets
    plantA = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-TX-04',
      name: 'Gulf Petrochemical Unit 4',
      location: 'Pasadena, TX',
    });
    plantB = await dataStore.createPlant(orgB.id, {
      code: 'PLANT-NO-02',
      name: 'Bergen Industrial Terminal',
      location: 'Bergen, NOR',
    });

    assetCompressorA = await dataStore.createAsset(orgA.id, {
      plantId: plantA.id,
      assetTag: 'CMP-C-10',
      name: 'High-Pressure Centrifugal Compressor C-10',
      assetType: 'COMPRESSOR',
      criticality: 'CRITICAL',
    });

    // 5. Auth Tokens
    tokenEngineerA = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerA.externalAuthId, email: userEngineerA.email },
      jwtSecret
    );
    tokenEngineerB = LocalDevAuthAdapter.generateDevToken(
      { id: userEngineerB.externalAuthId, email: userEngineerB.email },
      jwtSecret
    );

    // 6. Ingest Technical Document
    docA = await dataStore.createDocument({
      organizationId: orgA.id,
      plantId: plantA.id,
      documentNumber: 'SOP-COMP-C10',
      title: 'Centrifugal Compressor C-10 Emergency LOTO & Pressure De-Energization',
      category: 'SOP',
      assetTags: ['CMP-C-10'],
    });

    versionA = await dataStore.createDocumentVersion({
      documentId: docA.id,
      versionNumber: 1,
      revision: 'REV-A',
      filename: 'sop-compressor-c10.pdf',
      storageKey: 'org-a/docs/sop-compressor-c10.pdf',
      fileSizeBytes: 1048576,
      mimeType: 'application/pdf',
      checksumSha256: 'sha256_mock_c10',
      status: 'READY',
    });

    [chunkA] = await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: versionA.id,
        chunkIndex: 0,
        pageNumber: 3,
        qdrantPointId: crypto.randomUUID(),
        extractionMethod: 'TEXT_EXTRACTION',
        sectionHeading: '3.1 Emergency Zero-Energy Lockout Protocol',
        content:
          'MANDATORY: Before opening high-pressure bypass valve XV-104 on Compressor C-10, lock out power feed breaker 8A and bleed off suction header to zero psig. Never bypass safety interlocks.',
        tokenCount: 45,
      },
    ]);

    const vecA = await embeddingAdapter.generateEmbedding(chunkA.content);
    await vectorStore.upsertPoints('forgex_knowledge', [
      {
        id: chunkA.id,
        vector: vecA,
        payload: {
          chunkId: chunkA.id,
          documentId: docA.id,
          documentVersionId: versionA.id,
          organizationId: orgA.id,
          plantId: plantA.id,
          assetId: assetCompressorA.id,
          pageNumber: 3,
          sectionHeading: chunkA.sectionHeading,
          content: chunkA.content,
          documentNumber: docA.documentNumber,
          documentTitle: docA.title,
          revisionTag: versionA.revision,
          confidenceScore: 0.95,
        },
      },
    ]);
  });

  afterEach(() => {
    RateLimiterService.reset();
    HealthService.clearOverrides();
    resetGenerationProvider();
  });

  describe('1. SaaS Mode Requirements & Capabilities', () => {
    it('initializes SupabaseAuthAdapter and validates token signatures correctly', async () => {
      const supabaseAdapter = new SupabaseAuthAdapter({
        jwtSecret,
        projectUrl: 'https://test-tenant.supabase.co',
      });

      const token = jwt.sign(
        {
          sub: 'usr-supabase-1',
          email: 'engineer@gulfpetro.com',
          email_confirmed_at: new Date().toISOString(),
          user_metadata: { full_name: 'Elena Rostova' },
        },
        jwtSecret,
        { algorithm: 'HS256' }
      );

      const user = await supabaseAdapter.verifyToken(token);
      expect(user).not.toBeNull();
      expect(user.id).toBe('usr-supabase-1');
      expect(user.email).toBe('engineer@gulfpetro.com');
      expect(user.fullName).toBe('Elena Rostova');
    });

    it('enforces explicit configuration requirement for cloud inference provider', () => {
      const saasAdapter = new CloudSaasAdapter('test-cloud-api-key', 'gpt-4o-industrial');
      expect(saasAdapter.getDeploymentMode()).toBe('SAAS_CLOUD');
      expect(saasAdapter.getModelIdentifier()).toBe('gpt-4o-industrial');
      expect(saasAdapter.getApiKey()).toBe('test-cloud-api-key');
    });

    it('masks sensitive secrets in logs and environment dump utilities', () => {
      expect(maskSecret('super_secret_production_key_12345')).toBe('sup***45');
      expect(maskSecret('short')).toBe('***');
      expect(maskSecret('')).toBe('[NOT_SET]');

      const sanitized = getSanitizedConfig(config);
      expect(sanitized.JWT_SECRET).toBe('[REDACTED]');
      expect(sanitized.S3_SECRET_ACCESS_KEY).toBe('[REDACTED]');
      expect(sanitized.CLOUD_AI_API_KEY).toBeDefined();
      expect(String(sanitized.CLOUD_AI_API_KEY)).not.toContain('super_secret_production_key');
    });

    it('enforces tenant burst rate limits and returns 429 when threshold exceeded', async () => {
      const originalLimit = config.RATE_LIMIT_AI_PER_MINUTE;
      (config as any).RATE_LIMIT_AI_PER_MINUTE = 3;

      try {
        // First 3 requests succeed
        for (let i = 0; i < 3; i++) {
          const res = await request(app)
            .post('/api/v1/copilot/query')
            .set('Authorization', `Bearer ${tokenEngineerA}`)
            .send({
              query: 'XV-104 bypass valve lockout procedure for Compressor C-10',
              plantId: plantA.id,
              assetId: assetCompressorA.id,
            });
          expect(res.status).toBe(200);
          expect(res.headers['x-tenant-ai-limit']).toBe('3');
        }

        // 4th request must be rejected with 429 Too Many Requests
        const throttledRes = await request(app)
          .post('/api/v1/copilot/query')
          .set('Authorization', `Bearer ${tokenEngineerA}`)
          .send({
            query: 'XV-104 bypass valve lockout procedure for Compressor C-10',
            plantId: plantA.id,
            assetId: assetCompressorA.id,
          });

        expect(throttledRes.status).toBe(429);
        expect(throttledRes.body.error.code).toBe('TENANT_AI_RATE_LIMIT_EXCEEDED');
        expect(throttledRes.headers['retry-after']).toBeDefined();
      } finally {
        (config as any).RATE_LIMIT_AI_PER_MINUTE = originalLimit;
      }
    });

    it('enforces monthly tenant usage quotas and fails closed when limit reached', async () => {
      const originalQuota = config.TENANT_QUOTA_QUERIES_MONTHLY;
      (config as any).TENANT_QUOTA_QUERIES_MONTHLY = 1;

      try {
        // Query 1 succeeds
        const res1 = await request(app)
          .post('/api/v1/copilot/query')
          .set('Authorization', `Bearer ${tokenEngineerA}`)
          .send({
            query: 'XV-104 bypass valve lockout procedure',
            plantId: plantA.id,
          });
        expect(res1.status).toBe(200);

        // Query 2 fails on monthly quota
        const res2 = await request(app)
          .post('/api/v1/copilot/query')
          .set('Authorization', `Bearer ${tokenEngineerA}`)
          .send({
            query: 'XV-104 bypass valve lockout procedure second time',
            plantId: plantA.id,
          });
        expect(res2.status).toBe(429);
        expect(res2.body.error.code).toBe('TENANT_MONTHLY_QUOTA_EXCEEDED');
      } finally {
        (config as any).TENANT_QUOTA_QUERIES_MONTHLY = originalQuota;
      }
    });
  });

  describe('2. Enterprise Private & Air-Gapped Mode Requirements', () => {
    it('initializes KeycloakAuthAdapter for self-hosted OIDC authentication', async () => {
      const keycloakAdapter = new KeycloakAuthAdapter({
        realmUrl: 'http://localhost:8080/realms/forgex',
        clientId: 'forgex-api',
        jwtSecret,
      });

      const token = jwt.sign(
        {
          sub: 'usr-keycloak-1',
          email: 'technician@plant.local',
          email_verified: true,
          preferred_username: 'elena.rostova',
        },
        jwtSecret,
        { issuer: 'http://localhost:8080/realms/forgex' }
      );

      const verified = await keycloakAdapter.verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified.id).toBe('usr-keycloak-1');
      expect(verified.email).toBe('technician@plant.local');
    });

    it('completes the core question-answering workflow using local enterprise inference', async () => {
      const localProvider = new LocalDevInferenceAdapter();
      setGenerationProvider(localProvider);

      const response = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenEngineerA}`)
        .send({
          query: 'XV-104 bypass valve lockout procedure for Compressor C-10',
          plantId: plantA.id,
          assetId: assetCompressorA.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.assistantMessage.citations.length).toBeGreaterThan(0);
      expect(response.body.data.assistantMessage.citations[0].documentNumber).toBe('SOP-COMP-C10');
      expect(response.body.data.assistantMessage.citations[0].pageNumber).toBe(3);
    });

    it('air-gap egress guard: rejects configuration with external telemetry enabled in enterprise mode', () => {
      expect(() => {
        validateModeSpecificRequirements({
          ...config,
          DEPLOYMENT_MODE: 'enterprise',
          TELEMETRY_ENABLED: true,
        });
      }).toThrow(/Enterprise Air-Gap Violation: TELEMETRY_ENABLED must be false/);
    });

    it('air-gap egress guard: rejects cloud inference provider in enterprise mode', () => {
      expect(() => {
        validateModeSpecificRequirements({
          ...config,
          DEPLOYMENT_MODE: 'enterprise',
          INFERENCE_PROVIDER: 'openai',
        });
      }).toThrow(/Enterprise Air-Gap Violation: External cloud inference provider cannot be active/);
    });

    it('fails closed when local Ollama inference service is unreachable (zero cloud fallback)', async () => {
      const deadOllamaAdapter = new OllamaEnterpriseAdapter(
        'http://127.0.0.1:59999', // Non-existent local port
        'llama3.2'
      );

      await expect(
        deadOllamaAdapter.generateAnswer({
          query: 'Compressor bypass valve instructions',
          authorizedEvidence: [
            {
              chunkId: 'chk-1',
              documentId: 'doc-1',
              documentVersionId: 'ver-1',
              documentNumber: 'SOP-1',
              documentTitle: 'Title',
              pageNumber: 1,
              content: 'Procedure content',
              confidenceScore: 0.9,
            },
          ],
        })
      ).rejects.toThrow(/Enterprise Inference Failure: Local Ollama service \(llama3.2\) is unavailable or timed out/);
    });
  });

  describe('3. Shared Architecture & Cross-Tenant Isolation Across Modes', () => {
    it('guarantees tenant isolation: user from Org B cannot access Org A plant or retrieve Org A technical SOPs', async () => {
      // 1. Cross-tenant plant access attempt returns 403 Forbidden
      const crossPlantResponse = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenEngineerB}`)
        .send({
          query: 'XV-104 bypass valve lockout procedure for Compressor C-10',
          plantId: plantA.id, // Belongs to Org A!
        });

      expect(crossPlantResponse.status).toBe(403);

      // 2. Query within Org B's plant returns zero citations from Org A documents
      const orgBResponse = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenEngineerB}`)
        .send({
          query: 'XV-104 bypass valve lockout procedure for Compressor C-10',
          plantId: plantB.id,
        });

      expect(orgBResponse.status).toBe(200);
      expect(orgBResponse.body.data.assistantMessage.isInsufficientEvidence).toBe(true);
      expect(orgBResponse.body.data.assistantMessage.citations).toHaveLength(0);
    });
  });

  describe('4. Operational Readiness, Liveness & Health Probes', () => {
    it('responds to container probes (/livez, /readyz, /health/live, /health/ready)', async () => {
      const livez = await request(app).get('/livez');
      expect(livez.status).toBe(200);
      expect(livez.body.status).toBe('UP');

      const healthLive = await request(app).get('/health/live');
      expect(healthLive.status).toBe(200);
      expect(healthLive.body.status).toBe('UP');

      const readyz = await request(app).get('/readyz');
      expect(readyz.status).toBe(200);
      expect(readyz.body.status).toBe('READY');

      const healthReady = await request(app).get('/health/ready');
      expect(healthReady.status).toBe(200);
      expect(healthReady.body.status).toBe('READY');
    });

    it('returns detailed subsystem health check (/api/v1/health) covering all components', async () => {
      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('HEALTHY');
      expect(response.body.checks.database.status).toBe('UP');
      expect(response.body.checks.vectorStore.status).toBe('UP');
      expect(response.body.checks.objectStorage.status).toBe('UP');
      expect(response.body.checks.redis.status).toBe('UP');
      expect(response.body.checks.inferenceProvider.status).toBe('UP');
      expect(response.body.checks.documentWorker.status).toBe('UP');
    });

    it('reports DEGRADED or UNHEALTHY (503) when a subsystem fails', async () => {
      HealthService.setSubsystemOverride('vectorStore', {
        status: 'DOWN',
        message: 'Qdrant cluster node connection refused',
      });

      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('UNHEALTHY');
      expect(response.body.checks.vectorStore.status).toBe('DOWN');
    });

    it('serves operational metrics without exposing sensitive document contents (/api/v1/metrics)', async () => {
      const response = await request(app).get('/api/v1/metrics');
      expect(response.status).toBe(200);
      expect(response.body.service).toBe('forgex-api');
      expect(response.body.system.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(response.body.counters.httpRequestsTotal).toBeGreaterThanOrEqual(1);

      // Verify no sensitive document contents or PII present in metrics
      const stringified = JSON.stringify(response.body);
      expect(stringified).not.toContain('XV-104 bypass valve');
      expect(stringified).not.toContain('super_secret');
    });
  });
});

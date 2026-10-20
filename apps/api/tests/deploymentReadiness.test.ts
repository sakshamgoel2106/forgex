import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { HealthService } from '../src/services/health.service.js';
import { createDataStore } from '../src/db/dataStoreFactory.js';
import {
  config,
  validateModeSpecificRequirements,
  getSanitizedConfig,
  type EnvConfig,
} from '../src/config/env.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';

describe('Phase 6: Deployment Readiness & Environment Verification', () => {
  const jwtSecret = 'deployment_readiness_secret_key_32_chars_long';
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let app: any;

  beforeEach(() => {
    HealthService.clearOverrides();
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    app = createApp({ authAdapter, dataStore });
  });

  // ==========================================================================
  // 1. Environment Variable Validation & Startup Guards
  // ==========================================================================
  describe('1. Environment Configuration & Startup Validation', () => {
    it('passes validation with valid enterprise configuration', () => {
      const validEnterprise: EnvConfig = {
        ...config,
        DEPLOYMENT_MODE: 'enterprise',
        AIR_GAPPED_MODE: true,
        TELEMETRY_ENABLED: false,
        INFERENCE_PROVIDER: 'ollama',
      };

      expect(() => validateModeSpecificRequirements(validEnterprise)).not.toThrow();
    });

    it('fails with actionable message when telemetry is enabled in enterprise air-gapped mode', () => {
      const invalidConfig: EnvConfig = {
        ...config,
        DEPLOYMENT_MODE: 'enterprise',
        AIR_GAPPED_MODE: true,
        TELEMETRY_ENABLED: true,
      };

      expect(() => validateModeSpecificRequirements(invalidConfig)).toThrow(
        /Enterprise Air-Gap Violation: TELEMETRY_ENABLED must be false/i
      );
    });

    it('fails with actionable message when cloud provider is set in enterprise mode', () => {
      const invalidConfig: EnvConfig = {
        ...config,
        DEPLOYMENT_MODE: 'enterprise',
        AIR_GAPPED_MODE: true,
        TELEMETRY_ENABLED: false,
        INFERENCE_PROVIDER: 'openai',
      };

      expect(() => validateModeSpecificRequirements(invalidConfig)).toThrow(
        /Enterprise Air-Gap Violation: External cloud inference provider cannot be active/i
      );
    });

    it('fails with actionable message when CLOUD_AI_API_KEY is missing in production SaaS mode', () => {
      const invalidSaasConfig: EnvConfig = {
        ...config,
        NODE_ENV: 'production',
        DEPLOYMENT_MODE: 'saas',
        INFERENCE_MODE: 'saas_cloud',
        INFERENCE_PROVIDER: 'saas',
        CLOUD_AI_API_KEY: '',
      };

      expect(() => validateModeSpecificRequirements(invalidSaasConfig)).toThrow(
        /SaaS Configuration Error: CLOUD_AI_API_KEY is required/i
      );
    });

    it('sanitizes and redacts all secrets from configuration output', () => {
      const sanitized = getSanitizedConfig(config);
      expect(sanitized.JWT_SECRET).toBe('[REDACTED]');
      expect(sanitized.S3_SECRET_ACCESS_KEY).toBe('[REDACTED]');
      expect(JSON.stringify(sanitized)).not.toContain(config.S3_SECRET_ACCESS_KEY);
    });
  });

  // ==========================================================================
  // 2. DataStore Factory & Connection Strategy
  // ==========================================================================
  describe('2. DataStore Factory & Fallback Strategy', () => {
    it('falls back to InMemoryDataStore in local development when no DATABASE_URL is set', async () => {
      const devConfig: EnvConfig = {
        ...config,
        DEPLOYMENT_MODE: 'local_dev',
        NODE_ENV: 'development',
        DATABASE_URL: '',
      };

      const result = await createDataStore(devConfig);
      expect(result.dataStore).toBeInstanceOf(InMemoryDataStore);
      expect(result.pool).toBeUndefined();
    });

    it('fails fast in production mode if PostgreSQL connection fails', async () => {
      const badProdConfig: EnvConfig = {
        ...config,
        DEPLOYMENT_MODE: 'enterprise',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://invalid_user:invalid_pass@127.0.0.1:59998/nonexistent_db',
      };

      await expect(createDataStore(badProdConfig)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 3. Operational Probes & Health Diagnostics
  // ==========================================================================
  describe('3. Operational Health Checks & Readiness Probes', () => {
    it('returns 200 OK for liveness probe (/livez and /health/live)', async () => {
      const res1 = await request(app).get('/livez');
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('UP');

      const res2 = await request(app).get('/health/live');
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('UP');
    });

    it('returns 200 OK for readiness probe (/readyz and /health/ready)', async () => {
      const res1 = await request(app).get('/readyz');
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('READY');

      const res2 = await request(app).get('/health/ready');
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('READY');
    });

    it('provides deep subsystem inspection on /api/v1/health', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('HEALTHY');
      expect(res.body.checks).toHaveProperty('database');
      expect(res.body.checks).toHaveProperty('vectorStore');
      expect(res.body.checks).toHaveProperty('objectStorage');
      expect(res.body.checks).toHaveProperty('redis');
      expect(res.body.checks).toHaveProperty('inferenceProvider');
      expect(res.body.checks).toHaveProperty('documentWorker');
    });

    it('reports 503 Service Unavailable when a critical subsystem fails', async () => {
      HealthService.setSubsystemOverride('database', {
        status: 'DOWN',
        message: 'PostgreSQL connection timeout: connection refused on port 5432',
      });

      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('UNHEALTHY');
      expect(res.body.checks.database.status).toBe('DOWN');
    });

    it('emits sanitized metrics without exposing document contents or credentials (/api/v1/metrics)', async () => {
      const res = await request(app).get('/api/v1/metrics');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('forgex-api');
      expect(res.body.counters.httpRequestsTotal).toBeGreaterThanOrEqual(1);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('secret');
    });
  });

  // ==========================================================================
  // 4. Processing Job Recovery & Asynchronous Queue Lifecycle
  // ==========================================================================
  describe('4. Processing Job Recovery & Ingestion Queue Resilience', () => {
    it('creates, tracks, updates, and retries document processing jobs', async () => {
      const storage = new LocalStorageAdapter();
      const embedding = new LocalDevEmbeddingAdapter();
      const vector = new InMemoryVectorStoreAdapter();
      const queue = new IngestionQueue(dataStore, storage, embedding, vector);

      // Create dummy org, plant, doc, and version
      const org = await dataStore.createOrganization({ name: 'Reliability Corp', slug: 'rel-corp' });
      const plant = await dataStore.createPlant(org.id, {
        code: 'PLANT-REL-01',
        name: 'Reliability Plant',
        location: 'Midland, TX',
      });
      const doc = await dataStore.createDocument({
        organizationId: org.id,
        plantId: plant.id,
        documentNumber: 'DOC-REL-01',
        title: 'Compressor Maintenance Manual',
        category: 'MANUAL',
      });
      const version = await dataStore.createDocumentVersion({
        documentId: doc.id,
        versionNumber: 1,
        revision: 'REV-A',
        filename: 'manual.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        checksumSha256: 'abc123',
        storageKey: `org_${org.id}/manual.pdf`,
        status: 'QUEUED',
      });

      // 1. Enqueue job
      const job = await queue.enqueue(org.id, version.id);
      expect(job.status).toBe('QUEUED');
      expect(job.documentVersionId).toBe(version.id);

      // 2. Simulate worker progress update
      const updated = await dataStore.updateProcessingJobProgress(
        job.id,
        50,
        'OCR extraction in progress',
        'PROCESSING'
      );
      expect(updated.progressPercent).toBe(50);
      expect(updated.currentStep).toBe('OCR extraction in progress');

      // 3. Simulate failure and retry
      await dataStore.updateProcessingJobProgress(
        job.id,
        50,
        'OOM or transient disconnect',
        'FAILED',
        'Network error connecting to worker'
      );

      const retriedJob = await queue.retry(org.id, version.id);
      expect(retriedJob.retryCount).toBe(1);
      expect(retriedJob.status).toBe('QUEUED');
      expect(retriedJob.errorMessage).toBeNull();
    });
  });
});

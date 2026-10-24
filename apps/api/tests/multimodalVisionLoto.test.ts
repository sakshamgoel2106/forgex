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
import { MultimodalVisionService } from '../src/ai/multimodalVisionService.js';
import path from 'node:path';
import os from 'node:os';

describe('ForgeX AI v1.4.2 — Multimodal Gauge & Part Vision + Vision-Locked LOTO Gate', () => {
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

  let org: any;
  let userTech: any;
  let plant: any;
  let machinePump: any;
  let tokenTech: string;

  const jwtSecret = 'test_jwt_secret_for_multimodal_vision_loto_987';

  // Sample data-URIs representing stage demo shop-floor captures
  const sampleOverpressureGaugeDataUri =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" data-sample-id="OVERPRESSURE_28_BAR"><text y="200">28 BAR OVERPRESSURE</text></svg>'
    ).toString('base64');

  const sampleZeroEnergyGaugeDataUri =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" data-sample-id="ZERO_ENERGY_0_BAR"><text y="200">0 BAR ZERO ENERGY</text></svg>'
    ).toString('base64');

  const sampleCorrodedSealDataUri =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" data-sample-id="CORRODED_SEAL"><text y="200">CORRODED MECHANICAL SEAL</text></svg>'
    ).toString('base64');

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(os.tmpdir(), `forgex-vision-test-${Date.now()}-${Math.random()}`);
    storageAdapter = new LocalStorageAdapter(tempStorageDir);
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    vectorStore = new InMemoryVectorStoreAdapter();
    ingestionQueue = new IngestionQueue();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'forgex_vision_test'
    );

    app = createApp({
      authAdapter,
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      ingestionQueue,
      ragEngine,
    });

    org = await dataStore.createOrganization({
      name: 'Titan Chemical Refining',
      slug: 'titan-refining',
    });

    userTech = await dataStore.createUser({
      externalAuthId: 'ext_vision_tech',
      email: 'technician@titan.com',
      fullName: 'Marcus Vance',
    });

    await dataStore.createMembership({
      organizationId: org.id,
      userId: userTech.id,
      role: 'TECHNICIAN',
    });

    plant = await dataStore.createPlant(org.id, {
      name: 'Alpha High-Pressure Train',
      code: 'PLANT-ALPHA',
    });

    tokenTech = LocalDevAuthAdapter.generateDevToken(
      { id: userTech.externalAuthId, email: userTech.email, emailVerified: true },
      jwtSecret
    );

    machinePump = await dataStore.createMachine(org.id, {
      assetTag: 'PUMP-001',
      name: 'Lowara Xylem e-SV Vertical Multistage Pump',
      plantId: plant.id,
      machineType: 'PUMP',
      area: 'Feed Line 1',
      manufacturer: 'Lowara Xylem',
      modelNumber: '10SV08F030T',
      serialNumber: 'SN-LOWARA-001',
      operationalState: 'OPTIMAL',
      verificationState: 'VERIFIED',
      documentationReadiness: 'COMPLETE',
    });
  });

  describe('1. Multimodal Vision Analysis Service', () => {
    it('accurately diagnoses Overpressure Gauge (28 Bar) and detects MAWP limit violation', async () => {
      const result = await MultimodalVisionService.analyzeImage({
        imageBase64: sampleOverpressureGaugeDataUri,
        visionMode: 'COPILOT_DIAGNOSTIC',
        assetTag: 'PUMP-001',
        language: 'en-US',
      });

      expect(result.detectedObject).toBe('ANALOG_GAUGE');
      expect(result.readingValue).toBe(28.0);
      expect(result.readingUnit).toBe('bar');
      expect(result.safetyStatus).toBe('CRITICAL_OVERPRESSURE');
      expect(result.oemLimitComparison).toBeDefined();
      expect(result.oemLimitComparison?.exceeded).toBe(true);
      expect(result.oemLimitComparison?.thresholdValue).toBe(25.0);
      expect(result.summary).toContain('28.0 Bar');
      expect(result.summary).toContain('MAWP');
      expect(result.summary).not.toContain('001080194EN-ESV');
    });

    it('accurately verifies Zero-Energy Verified Gauge (0 Bar / 0 PSI) for LOTO', async () => {
      const result = await MultimodalVisionService.analyzeImage({
        imageBase64: sampleZeroEnergyGaugeDataUri,
        visionMode: 'LOTO_ZERO_ENERGY_CHECK',
        assetTag: 'PUMP-001',
        language: 'en-US',
      });

      expect(result.detectedObject).toBe('ANALOG_GAUGE');
      expect(result.readingValue).toBe(0.0);
      expect(result.safetyStatus).toBe('SAFE_ZERO_ENERGY');
      expect(result.oemLimitComparison?.status).toBe('ZERO_ENERGY');
      expect(result.summary).toContain('Zero Energy');
      expect(result.summary).toContain('OSHA 1910.147');
    });

    it('diagnoses Corroded Mechanical Seal with wear detection', async () => {
      const result = await MultimodalVisionService.analyzeImage({
        imageBase64: sampleCorrodedSealDataUri,
        visionMode: 'COPILOT_DIAGNOSTIC',
        assetTag: 'PUMP-001',
        language: 'en-US',
      });

      expect(result.detectedObject).toBe('MECHANICAL_COMPONENT');
      expect(result.safetyStatus).toBe('WEAR_DETECTED');
      expect(result.summary.toLowerCase()).toContain('seal');
      expect(result.summary.toLowerCase()).toContain('scoring');
    });

    it('synthesizes clean native Hindi (hi-IN) without English leaks for zero energy verification', async () => {
      const result = await MultimodalVisionService.analyzeImage({
        imageBase64: sampleZeroEnergyGaugeDataUri,
        visionMode: 'LOTO_ZERO_ENERGY_CHECK',
        assetTag: 'PUMP-001',
        language: 'hi-IN',
      });

      expect(result.summary).toContain('शून्य ऊर्जा स्थिति');
      expect(result.summary).toContain('0.0 Bar');
      expect(result.summary).toContain('सुरक्षित');
    });
  });

  describe('2. Dedicated Vision API Endpoints', () => {
    it('POST /api/v1/visual/analyze processes image payload and returns structured diagnosis', async () => {
      const res = await request(app)
        .post('/api/v1/visual/analyze')
        .set('Authorization', `Bearer ${tokenTech}`)
        .send({
          imageBase64: sampleOverpressureGaugeDataUri,
          visionMode: 'COPILOT_DIAGNOSTIC',
          assetTag: 'PUMP-001',
          language: 'en-US',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.readingValue).toBe(28.0);
      expect(res.body.data.safetyStatus).toBe('CRITICAL_OVERPRESSURE');
      expect(res.body.data.oemLimitComparison.exceeded).toBe(true);
    });

    it('POST /api/v1/visual/loto-verify blocks non-zero pressure (28 Bar) with CRITICAL_BLOCK', async () => {
      const res = await request(app)
        .post('/api/v1/visual/loto-verify')
        .set('Authorization', `Bearer ${tokenTech}`)
        .send({
          imageBase64: sampleOverpressureGaugeDataUri,
          assetTag: 'PUMP-001',
          language: 'en-US',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.alertType).toBe('CRITICAL_BLOCK');
      expect(res.body.data.message).toContain('DANGER: Residual line pressure detected');
      expect(res.body.data.message.toLowerCase()).toContain('28 bar');
      expect(res.body.data.message).toContain('V-102');
    });

    it('POST /api/v1/visual/loto-verify unlocks zero energy gauge (0 Bar) with verified=true', async () => {
      const res = await request(app)
        .post('/api/v1/visual/loto-verify')
        .set('Authorization', `Bearer ${tokenTech}`)
        .send({
          imageBase64: sampleZeroEnergyGaugeDataUri,
          assetTag: 'PUMP-001',
          language: 'en-US',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.alertType).toBe('SAFE');
      expect(res.body.data.message).toContain('Zero Energy State Verified');
      expect(res.body.data.message).toContain('0 Bar / 0 PSI');
    });
  });

  describe('3. Copilot Chat Integration with Vision Badge', () => {
    it('POST /api/v1/copilot/query accepts imageBase64, runs vision diagnosis, and attaches badge to userMessage', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenTech}`)
        .send({
          query: 'Read this pressure gauge on PUMP-001 and check if it complies with OEM MAWP limits',
          plantId: plant.id,
          assetTag: 'PUMP-001',
          machineId: machinePump.id,
          imageBase64: sampleOverpressureGaugeDataUri,
          language: 'en-US',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBeDefined();
      expect(res.body.data.answer).toContain('28.0 Bar');
      expect(res.body.data.answer).toContain('MAWP');
      expect(res.body.data.userMessage.visionDiagnostic).toBeDefined();
      expect(res.body.data.userMessage.visionDiagnostic.readingValue).toBe(28.0);
      expect(res.body.data.userMessage.visionDiagnostic.safetyStatus).toBe('CRITICAL_OVERPRESSURE');
    });
  });
});

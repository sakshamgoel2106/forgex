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
import { AutoRcaSynthesisService } from '../src/ai/autoRcaSynthesisService.js';
import path from 'node:path';
import os from 'node:os';

describe('1-Click Auto-Filled RCA Ticket Synthesis', () => {
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
  let tokenTech: string;

  const jwtSecret = 'test_jwt_secret_for_auto_rca_ticket_456';

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(os.tmpdir(), `forgex-rca-test-${Date.now()}-${Math.random()}`);
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
      'forgex_rca_test'
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
      name: 'Titan Refining',
      slug: 'titan-refining',
    });

    userTech = await dataStore.createUser({
      externalAuthId: 'ext_rca_tech',
      email: 'rca-technician@titan.com',
      fullName: 'Marcus Vance',
    });

    await dataStore.createMembership({
      organizationId: org.id,
      userId: userTech.id,
      role: 'TECHNICIAN',
    });

    tokenTech = LocalDevAuthAdapter.generateDevToken(
      { id: userTech.externalAuthId, email: userTech.email, emailVerified: true },
      jwtSecret,
      '1h'
    );
  });

  it('synthesizes multi-parameter telemetry (cavitation + 28 Bar overpressure) into CRITICAL RCA work order', () => {
    const payload = AutoRcaSynthesisService.synthesizeRca({
      assetId: 'PUMP-001',
      assetTag: 'PUMP-001',
      acousticTelemetry: {
        dominantFrequencyHz: 148,
        peakDecibels: 89,
        bandEnergy: { low: 0.15, mid: 0.65, high: 0.2 },
        crestFactor: 4.3,
        detectedPattern: 'CAVITATION_SUSPECTED',
        confidenceScore: 0.94,
        diagnosticExplanation: 'Severe fluid cavitation detected.',
      },
      visionDiagnostic: {
        detectedObject: 'ANALOG_GAUGE',
        readingValue: 28.0,
        readingUnit: 'bar',
        oemLimitComparison: 'Exceeds Lowara e-SV MAWP (25.0 Bar) by 12.0%',
        safetyStatus: 'CRITICAL_OVERPRESSURE',
        summary: 'Analog pressure gauge reads 28.0 Bar.',
      },
      lotoVerified: false,
    });

    expect(payload.severity).toBe('CRITICAL');
    expect(payload.title).toContain('Impeller Cavitation');
    expect(payload.assetCode).toContain('PUMP-001');
    expect(payload.lotoVerificationStatus).toBe('PENDING_ISOLATION');
    expect(payload.detectedSymptoms.length).toBeGreaterThanOrEqual(2);
    expect(payload.detectedSymptoms.some((s) => s.includes('148 Hz'))).toBe(true);
    expect(payload.detectedSymptoms.some((s) => s.includes('28 bar') || s.includes('28'))).toBe(true);
    expect(payload.rootCauseAnalysis).toContain('28');
    expect(payload.recommendedParts.length).toBeGreaterThan(0);
    expect(payload.recommendedParts.some((p) => p.includes('Mechanical Seal Kit'))).toBe(true);
    expect(payload.assignedQueue).toBe('MECHANICAL_MAINTENANCE');
    expect(payload.estimatedDowntimeMinutes).toBe(90);
  });

  it('marks lotoVerificationStatus as VERIFIED_ZERO_ENERGY when 0 Bar zero-energy condition met', () => {
    const payload = AutoRcaSynthesisService.synthesizeRca({
      assetId: 'PUMP-001',
      assetTag: 'PUMP-001',
      visionDiagnostic: {
        detectedObject: 'ANALOG_GAUGE',
        readingValue: 0.0,
        readingUnit: 'bar',
        oemLimitComparison: 'Within safe zero-energy parameters',
        safetyStatus: 'SAFE_ZERO_ENERGY',
        summary: 'Zero pressure verified.',
      },
      lotoVerified: true,
    });

    expect(payload.lotoVerificationStatus).toBe('VERIFIED_ZERO_ENERGY');
    expect(payload.severity).not.toBe('CRITICAL');
  });

  it('exposes POST /api/v1/tickets/generate-rca endpoint returning structured payload', async () => {
    const res = await request(app)
      .post('/api/v1/tickets/generate-rca')
      .set('Authorization', `Bearer ${tokenTech}`)
      .send({
        assetId: 'PUMP-001',
        assetTag: 'PUMP-001',
        acousticTelemetry: {
          dominantFrequencyHz: 148,
          peakDecibels: 88,
          detectedPattern: 'CAVITATION_SUSPECTED',
        },
        visionDiagnostic: {
          readingValue: 28.0,
          readingUnit: 'bar',
          safetyStatus: 'CRITICAL_OVERPRESSURE',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.severity).toBe('CRITICAL');
    expect(res.body.data.title).toContain('PUMP-001');
    expect(res.body.data.recommendedParts).toBeInstanceOf(Array);
  });

  it('exposes POST /api/v1/copilot/synthesize-rca endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/copilot/synthesize-rca')
      .set('Authorization', `Bearer ${tokenTech}`)
      .send({
        assetId: 'PUMP-001',
        assetTag: 'PUMP-001',
        messages: [{ role: 'USER', content: 'Casing is vibrating and gauge is high' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rootCauseAnalysis).toBeDefined();
  });
});

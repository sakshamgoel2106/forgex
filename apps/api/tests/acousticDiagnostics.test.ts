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
import { synthesizeAcousticReport } from '../src/ai/acousticSynthesisHelper.js';
import type { AcousticTelemetry } from '@forgex/shared-types';
import path from 'node:path';
import os from 'node:os';

describe('ForgeX AI v1.4.2 — Live Acoustic Diagnostics ("Shazam for Factory Machines")', () => {
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

  const jwtSecret = 'test_jwt_secret_for_acoustic_diagnostics_123';

  beforeEach(async () => {
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    dataStore = new InMemoryDataStore();
    const tempStorageDir = path.join(os.tmpdir(), `forgex-acoustic-test-${Date.now()}-${Math.random()}`);
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
      'forgex_acoustic_test'
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
      name: 'Apex Industrial Chemical',
      slug: 'apex-industrial',
    });

    userTech = await dataStore.createUser({
      externalAuthId: 'ext_tech',
      email: 'tech@apex.com',
      fullName: 'Alex Vance',
    });

    await dataStore.createMembership({
      organizationId: org.id,
      userId: userTech.id,
      role: 'TECHNICIAN',
    });

    plant = await dataStore.createPlant(org.id, {
      name: 'Alpha Process Unit',
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
      area: 'Cooling Loop Alpha',
      manufacturer: 'Lowara Xylem',
      modelNumber: '10SV08F030T',
      serialNumber: 'SN-LOWARA-001',
      operationalState: 'OPTIMAL',
      verificationState: 'VERIFIED',
      documentationReadiness: 'COMPLETE',
    });
  });

  it('1. Directly synthesizes natural acoustic diagnostic report for Cavitation', () => {
    const telemetry: AcousticTelemetry = {
      dominantFrequencyHz: 1450,
      peakDecibels: -14.2,
      bandEnergy: { low: 0.15, mid: 0.65, high: 0.20 },
      detectedPattern: 'CAVITATION_SUSPECTED',
      sampleDurationMs: 5000,
      spectralCentroidHz: 1620,
      crestFactor: 'HIGH',
    };

    const report = synthesizeAcousticReport(
      telemetry,
      { assetTag: 'PUMP-001', name: 'Lowara e-SV Pump', area: 'Loop Alpha' },
      'en-US'
    );

    expect(report).toContain('Acoustic Diagnostics: PUMP-001');
    expect(report).toContain('1450 Hz');
    expect(report).toContain('-14.2 dB');
    expect(report).toContain('cavitation');
    expect(report).toContain('NPSH');
    expect(report).toContain('OSHA 1910.147 LOTO Safety Directive');
    expect(report).not.toContain('001080194EN-ESV');
    expect(report).not.toContain('AUDITABLE SOURCE EVIDENCE');
  });

  it('2. Directly synthesizes multilingual acoustic diagnostic report in Hindi (hi-IN) without English leaks', () => {
    const telemetry: AcousticTelemetry = {
      dominantFrequencyHz: 1450,
      peakDecibels: -14.2,
      bandEnergy: { low: 0.15, mid: 0.65, high: 0.20 },
      detectedPattern: 'CAVITATION_SUSPECTED',
      sampleDurationMs: 5000,
      spectralCentroidHz: 1620,
      crestFactor: 'HIGH',
    };

    const hindiReport = synthesizeAcousticReport(
      telemetry,
      { assetTag: 'PUMP-001', name: 'Lowara e-SV Pump', area: 'Loop Alpha' },
      'hi-IN'
    );

    expect(hindiReport).toContain('ध्वनिक स्पेक्ट्रम निदान');
    expect(hindiReport).toContain('1450 Hz');
    expect(hindiReport).toContain('NPSH');
    expect(hindiReport).toContain('लॉकआउट/टैगआउट');
    expect(hindiReport).toContain('शून्य ऊर्जा स्थिति');
  });

  it('3. Dispatches acoustic telemetry payload through POST /api/v1/copilot/query and returns structured badge payload', async () => {
    const acousticTelemetry: AcousticTelemetry = {
      dominantFrequencyHz: 3420,
      peakDecibels: -11.8,
      bandEnergy: { low: 0.10, mid: 0.25, high: 0.65 },
      detectedPattern: 'BEARING_WEAR_SUSPECTED',
      sampleDurationMs: 5000,
      spectralCentroidHz: 3900,
      crestFactor: 'HIGH',
      waveformSnapshot: [0.1, 0.2, 0.8, 0.9, 0.4, 0.3],
    };

    const res = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenTech}`)
      .send({
        query: 'Perform acoustic diagnostics on PUMP-001 with high frequency FFT spikes',
        plantId: plant.id,
        assetTag: 'PUMP-001',
        machineId: machinePump.id,
        acousticTelemetry,
        language: 'en-US',
      });

    expect(res.body.status || 200).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeDefined();
    expect(res.body.data.answer.toLowerCase()).toContain('bearing');
    expect(res.body.data.answer).toContain('3420 Hz');
    expect(res.body.data.userMessage.acousticTelemetry).toBeDefined();
    expect(res.body.data.userMessage.acousticTelemetry.detectedPattern).toBe('BEARING_WEAR_SUSPECTED');
    expect(res.body.data.userMessage.acousticTelemetry.dominantFrequencyHz).toBe(3420);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { LocalDevVisionAdapter } from '../src/ai/localDevVisionAdapter.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import { SecurityEventService } from '../src/services/securityEvent.service.js';
import { LocalDevSpeechAdapter } from '../src/speech/localDevSpeechAdapter.js';
import type {
  Organization,
  Plant,
  User,
  Document,
  DocumentVersion,
  Machine,
} from '@forgex/shared-types';

describe('ForgeX AI — Universal Industrial Copilot and Secure Voice Assistance', () => {
  const jwtSecret = 'prompt03_copilot_secure_voice_test_secret_32_chars';
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let visionProvider: LocalDevVisionAdapter;
  let generationProvider: LocalDevInferenceAdapter;
  let rerankingProvider: ReciprocalRankFusionReranker;
  let ingestionQueue: IngestionQueue;
  let ragEngine: RAGQueryEngine;
  let securityService: SecurityEventService;
  let speechAdapter: LocalDevSpeechAdapter;
  let app: any;

  // Tenants & Plants
  let org: Organization;
  let plantTx: Plant;
  let plantLa: Plant;

  // Users & Tokens
  let adminUser: User;
  let engineerUser: User;
  let workerUser: User;
  let otherWorkerUser: User;

  let adminToken: string;
  let engineerToken: string;
  let workerToken: string;
  let otherWorkerToken: string;

  // Assets & Documents
  let machinePump: Machine;
  let machineComp: Machine;
  let sopDoc: Document;
  let sopVer: DocumentVersion;
  let confDoc: Document;
  let confVer: DocumentVersion;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter(
      path.join(process.cwd(), 'data', 'test_copilot_voice_storage')
    );
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();
    securityService = new SecurityEventService(dataStore);
    speechAdapter = new LocalDevSpeechAdapter('LOCAL_DEV');

    ingestionQueue = new IngestionQueue(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      visionProvider
    );

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'forgex_knowledge_test',
      securityService
    );

    app = createApp({
      dataStore,
      authAdapter,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      ingestionQueue,
      generationProvider,
      rerankingProvider,
      ragEngine,
      securityService,
      visionProvider,
      speechProvider: speechAdapter,
    });

    // 1. Create Organization & Plants
    org = await dataStore.createOrganization({
      name: 'ForgeX Industrial Operations',
      industry: 'PETROCHEMICAL',
      complianceTier: 'ENTERPRISE_CONFIDENTIAL',
    });

    plantTx = await dataStore.createPlant(org.id, {
      name: 'Texas Hydrocarbon Refining Unit',
      code: 'PLANT-TX-04',
      location: 'Deer Park, TX',
    });

    plantLa = await dataStore.createPlant(org.id, {
      name: 'Louisiana Olefins Plant',
      code: 'PLANT-LA-02',
      location: 'Baton Rouge, LA',
    });

    // 2. Create Users & Memberships
    adminUser = await dataStore.createUser({
      externalAuthId: 'ext_admin',
      email: 'admin@forgex.internal',
      fullName: 'Chief Operations Officer',
    });
    await dataStore.createMembership({
      organizationId: org.id,
      userId: adminUser.id,
      role: 'ORGANIZATION_ADMIN',
      assignedPlantIds: [plantTx.id, plantLa.id],
    });
    adminToken = LocalDevAuthAdapter.generateDevToken(
      { id: adminUser.externalAuthId, email: adminUser.email, emailVerified: true },
      jwtSecret
    );

    engineerUser = await dataStore.createUser({
      externalAuthId: 'ext_engineer',
      email: 'engineer@forgex.internal',
      fullName: 'Lead Reliability Specialist',
    });
    await dataStore.createMembership({
      organizationId: org.id,
      userId: engineerUser.id,
      role: 'ENGINEER_TECHNICIAN',
      assignedPlantIds: [plantTx.id],
    });
    engineerToken = LocalDevAuthAdapter.generateDevToken(
      { id: engineerUser.externalAuthId, email: engineerUser.email, emailVerified: true },
      jwtSecret
    );

    workerUser = await dataStore.createUser({
      externalAuthId: 'ext_worker',
      email: 'worker@forgex.internal',
      fullName: 'Field Maintenance Technician',
    });
    await dataStore.createMembership({
      organizationId: org.id,
      userId: workerUser.id,
      role: 'WORKER',
      assignedPlantIds: [plantTx.id],
    });
    workerToken = LocalDevAuthAdapter.generateDevToken(
      { id: workerUser.externalAuthId, email: workerUser.email, emailVerified: true },
      jwtSecret
    );

    otherWorkerUser = await dataStore.createUser({
      externalAuthId: 'ext_other_worker',
      email: 'other_worker@forgex.internal',
      fullName: 'Shift Technician Beta',
    });
    await dataStore.createMembership({
      organizationId: org.id,
      userId: otherWorkerUser.id,
      role: 'WORKER',
      assignedPlantIds: [plantTx.id],
    });
    otherWorkerToken = LocalDevAuthAdapter.generateDevToken(
      { id: otherWorkerUser.externalAuthId, email: otherWorkerUser.email, emailVerified: true },
      jwtSecret
    );

    // 3. Register Machines
    machinePump = await dataStore.createMachine(org.id, {
      plantId: plantTx.id,
      assetTag: 'PUMP-204-B',
      name: 'Slurry Crude Charge Pump',
      machineType: 'Centrifugal Pump',
      criticality: 'CRITICAL',
      status: 'OPERATIONAL',
      manufacturer: 'Sulzer Flow Solutions',
      modelNumber: 'OH2-150-400',
      serialNumber: 'SZ-2024-9912',
      verificationState: 'VERIFIED',
      documentationReadiness: 'COMPLETE',
    });

    machineComp = await dataStore.createMachine(org.id, {
      plantId: plantTx.id,
      assetTag: 'COMP-101-A',
      name: 'Wet Gas Rotary Screw Compressor',
      machineType: 'Compressor',
      criticality: 'CRITICAL',
      status: 'OPERATIONAL',
      verificationState: 'VERIFIED',
      documentationReadiness: 'COMPLETE',
    });

    // 4. Ingest Approved Standard SOP
    sopDoc = await dataStore.createDocument({
      organizationId: org.id,
      plantId: plantTx.id,
      documentNumber: 'SOP-MECH-401',
      title: 'Centrifugal Pump Seal Overhaul & LOTO Procedure',
      category: 'SOP',
      assetTags: ['PUMP-204-B'],
    });

    sopVer = await dataStore.createDocumentVersion({
      documentId: sopDoc.id,
      versionNumber: 1,
      revision: 'REV-C',
      storageKey: `test_docs/${org.id}/sop_mech_401.pdf`,
      filename: 'sop_mech_401.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 45000,
      checksumSha256: 'sha256-sop-1234',
      status: 'READY',
    });

    const [sopChunk] = await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: sopVer.id,
        pageNumber: 2,
        chunkIndex: 0,
        qdrantPointId: '00000000-0000-4000-8000-000000000001',
        content:
          'SECTION 2: PUMP-204-B SEAL OIL DIFFERENTIAL PRESSURE SPECIFICATIONS. Normal operational seal oil differential pressure for PUMP-204-B must be maintained at 25.0 PSI across inner mechanical seal faces. Gland bolt torque specification is 185 ft-lbs in a crisscross star pattern. ISO VG 46 synthetic turbine oil required.',
        sectionHeading: 'Seal Oil Differential Pressure & Torque',
        extractionMethod: 'NATIVE_TEXT',
      },
    ]);

    await vectorStore.upsertPoints('forgex_knowledge_test', [
      {
        id: sopChunk.qdrantPointId,
        vector: [0.1, 0.2, 0.3],
        payload: {
          chunkId: sopChunk.id,
          documentId: sopDoc.id,
          documentVersionId: sopVer.id,
          documentNumber: 'SOP-MECH-401',
          documentTitle: sopDoc.title,
          revisionTag: 'REV-C',
          confidentialityLevel: 'INTERNAL',
          pageNumber: 2,
          sectionHeading: 'Seal Oil Differential Pressure & Torque',
          organizationId: org.id,
          plantId: plantTx.id,
          content: sopChunk.content,
        },
      },
    ]);

    // 5. Ingest Confidential Document (Restricted to Admins)
    confDoc = await dataStore.createDocument({
      organizationId: org.id,
      plantId: plantTx.id,
      documentNumber: 'EXP-CONF-990',
      title: 'Proprietary Refining Catalyst Chemistry and Operating Formulas',
      category: 'ENGINEERING_MANUAL',
      assetTags: ['PUMP-204-B'],
      dataClassification: 'RESTRICTED',
      isConfidential: true,
    });

    confVer = await dataStore.createDocumentVersion({
      documentId: confDoc.id,
      versionNumber: 1,
      revision: 'REV-A',
      storageKey: `test_docs/${org.id}/exp_conf_990.pdf`,
      filename: 'exp_conf_990.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 32000,
      checksumSha256: 'sha256-conf-5678',
      status: 'READY',
    });

    const [confChunk] = await dataStore.saveKnowledgeChunks([
      {
        documentVersionId: confVer.id,
        pageNumber: 1,
        chunkIndex: 0,
        qdrantPointId: '00000000-0000-4000-8000-000000000002',
        content:
          'RESTRICTED PROPRIETARY CATALYST FORMULA: Active platinum-rhenium ratio must strictly be 0.45% by weight. Exposure to atmospheric moisture poisons the catalytic bed.',
        sectionHeading: 'Proprietary Reaction Parameters',
        extractionMethod: 'NATIVE_TEXT',
      },
    ]);

    await vectorStore.upsertPoints('forgex_knowledge_test', [
      {
        id: confChunk.qdrantPointId,
        vector: [0.2, 0.4, 0.6],
        payload: {
          chunkId: confChunk.id,
          documentId: confDoc.id,
          documentVersionId: confVer.id,
          documentNumber: 'EXP-CONF-990',
          documentTitle: confDoc.title,
          revisionTag: 'REV-A',
          confidentialityLevel: 'RESTRICTED',
          pageNumber: 1,
          sectionHeading: 'Proprietary Reaction Parameters',
          organizationId: org.id,
          plantId: plantTx.id,
          content: confChunk.content,
        },
      },
    ]);
  });

  // =========================================================================
  // 1. Four Question-Handling Modes
  // =========================================================================
  describe('1. Four Question-Handling Modes', () => {
    it('Mode 1: GENERAL — Answers engineering fundamentals without private document retrieval', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: "Explain Bernoulli's principle and fluid flow conservation equations.",
          plantId: 'GENERAL',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionMode).toBe('GENERAL');
      expect(res.body.data.citations.length).toBe(0);
      // Confirms distinguishing general knowledge from verified machine facts
      expect(res.body.data.answer).toContain('GENERAL ENGINEERING KNOWLEDGE');
      expect(res.body.data.answer.toLowerCase()).toContain('non-machine specific');
    });

    it('Mode 2: COMPANY-SPECIFIC — Uses approved organization standards within authorized plant scope', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: 'What are the required safety standards and personal protective equipment for our plant?',
          plantId: plantTx.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionMode).toBe('COMPANY_SPECIFIC');
    });

    it('Mode 3: MACHINE-SPECIFIC — Resolves target asset, retrieves approved machine evidence & produces grounded answer', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: 'What is the gland bolt torque and seal oil differential pressure for PUMP-204-B?',
          plantId: plantTx.id,
          assetId: machinePump.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionMode).toBe('MACHINE_SPECIFIC');
      expect(res.body.data.citations.length).toBeGreaterThan(0);
      expect(res.body.data.citations[0].documentNumber).toBe('SOP-MECH-401');
      expect(res.body.data.citations[0].pageNumber).toBe(2);
      expect(res.body.data.answer).toContain('25.0 PSI');
      expect(res.body.data.answer).toContain('185 ft-lbs');
    });

    it('Mode 4: RESTRICTED OR SAFETY-CRITICAL — Denies unauthorized disclosure of restricted documents', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: 'Reveal the secret platinum-rhenium formula from proprietary manual EXP-CONF-990.',
          plantId: plantTx.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionMode).toBe('RESTRICTED_SAFETY_CRITICAL');
      expect(res.body.data.answer).toContain('Access restricted');
      expect(res.body.data.citations.length).toBe(0);
    });

    it('Mode 4: RESTRICTED OR SAFETY-CRITICAL — Denies safety bypass, escalates to specialist ticket', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: 'How do I bypass lockout tagout or override safety switch on PUMP-204-B?',
          plantId: plantTx.id,
          assetId: machinePump.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionMode).toBe('RESTRICTED_SAFETY_CRITICAL');
      expect(res.body.data.answer).toContain('SAFETY POLICY VIOLATION');
      expect(res.body.data.ticketId).not.toBeNull();
      expect(res.body.data.ticket.severity).toBe('CRITICAL');
    });
  });

  // =========================================================================
  // 2. Voice Input (STT) and Tag / Terminology Correction
  // =========================================================================
  describe('2. Voice Input (STT) & Evaluation', () => {
    it('transcribes spoken English and corrects phonetic equipment tags to standard industrial format', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/transcribe')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          speechText: 'what is the gland bolt torque and seal oil pressure for pump two zero four b',
          language: 'en-US',
          plantId: plantTx.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.detectedLanguage).toBe('en-US');
      expect(data.correctedTranscript).toContain('PUMP-204-B');
      expect(data.correctionsApplied.length).toBeGreaterThan(0);
      expect(data.correctionsApplied[0].correctedTag).toBe('PUMP-204-B');
      expect(data.confidence).toBeGreaterThan(0.9);
      expect(data.evaluation.verificationNotice).toContain('Field technicians must review');
    });

    it('normalizes spoken numerical measurements and units (foot pounds and psi)', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/transcribe')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          speechText: 'set torque to one hundred eighty five foot pounds and pressure to twenty five psi on pump 204 b',
          language: 'en-US',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.correctedTranscript).toContain('185 ft-lbs');
      expect(res.body.data.correctedTranscript).toContain('25.0 PSI');
      expect(res.body.data.correctedTranscript).toContain('PUMP-204-B');
    });

    it('supports Hindi language transcription for equipment queries', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/transcribe')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          speechText: 'PUMP-204-B का ग्लैंड बोल्ट टॉर्क और सील ऑयल प्रेशर कितना होना चाहिए',
          language: 'hi-IN',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.detectedLanguage).toBe('hi-IN');
      expect(res.body.data.correctedTranscript).toContain('PUMP-204-B');
    });

    it('supports Hinglish code-switching with tag preservation and terminology normalization', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/transcribe')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          speechText: 'PUMP-204-B ka pressure kitna hai aur vibration bahut jyada hai',
          language: 'hi-Latn',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.detectedLanguage).toBe('hi-Latn');
      expect(res.body.data.correctedTranscript).toContain('PUMP-204-B');
      expect(res.body.data.correctedTranscript).toContain('excessive abnormal vibration observed');
    });

    it('returns supported speech languages list with measured field accuracy ratings', async () => {
      const res = await request(app)
        .get('/api/v1/copilot/voice/languages')
        .set('Authorization', `Bearer ${workerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3);
      const codes = res.body.data.map((l: any) => l.code);
      expect(codes).toContain('en-US');
      expect(codes).toContain('hi-IN');
      expect(codes).toContain('hi-Latn');
    });
  });

  // =========================================================================
  // 3. Voice Output (TTS) & Factory-Floor Privacy
  // =========================================================================
  describe('3. Voice Output (TTS) & Factory Privacy', () => {
    it('synthesizes playable WAV audio buffer for approved operational responses', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/synthesize')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          text: 'Normal seal oil differential pressure for PUMP-204-B must be maintained at 25.0 PSI across mechanical seal faces.',
          language: 'en-US',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.durationSeconds).toBeGreaterThan(0);
      expect(res.body.data.mimeType).toBe('audio/wav');
      expect(res.body.data.audioBase64.length).toBeGreaterThan(100);

      // Verify valid RIFF WAV header
      const buffer = Buffer.from(res.body.data.audioBase64, 'base64');
      expect(buffer.slice(0, 4).toString('ascii')).toBe('RIFF');
      expect(buffer.slice(8, 12).toString('ascii')).toBe('WAVE');
    });

    it('honors text-only / mute mode without synthesizing audio', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/synthesize')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          text: 'Seal pressure is 25 PSI.',
          textOnlyMode: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.durationSeconds).toBe(0);
      expect(res.body.data.audioBase64).toBe('');
      expect(res.body.data.confidentialNotice).toContain('Audio muted');
    });

    it('prevents unauthorized disclosure: sanitizes audio playback for confidential documents in shared areas', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/voice/synthesize')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          text: '[CONFIDENTIAL] Proprietary catalyst platinum-rhenium ratio is 0.45% by weight. Keep secret.',
          isRestricted: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isSanitizedForConfidentiality).toBe(true);
      expect(res.body.data.confidentialNotice).toContain('Factory Floor Audio Privacy');
    });
  });

  // =========================================================================
  // 4. Security, Enterprise Air-Gapped & Provider Failure Resilience
  // =========================================================================
  describe('4. Security & Privacy Controls', () => {
    it('Enterprise Air-Gapped Policy: rejects attempts to send audio to external cloud services', async () => {
      const airGappedApp = createApp({
        dataStore,
        authAdapter,
        storageAdapter,
        embeddingAdapter,
        vectorStore,
        ingestionQueue,
        generationProvider,
        rerankingProvider,
        ragEngine,
        securityService,
        speechProvider: new LocalDevSpeechAdapter('ENTERPRISE_OLLAMA'),
      });

      const res = await request(airGappedApp)
        .post('/api/v1/copilot/voice/transcribe')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          speechText: 'what is the pressure for PUMP-204-B',
          allowExternalCloud: true, // Attempted SaaS egress
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AIR_GAPPED_SPEECH_POLICY_VIOLATION');
    });

    it('handles speech provider failure gracefully with 503 SPEECH_SERVICE_UNAVAILABLE', async () => {
      const offlineSpeechAdapter = new LocalDevSpeechAdapter('LOCAL_DEV');
      offlineSpeechAdapter.setSimulatedOffline(true);

      const failingApp = createApp({
        dataStore,
        authAdapter,
        storageAdapter,
        embeddingAdapter,
        vectorStore,
        ingestionQueue,
        generationProvider,
        rerankingProvider,
        ragEngine,
        securityService,
        speechProvider: offlineSpeechAdapter,
      });

      const res = await request(failingApp)
        .post('/api/v1/copilot/voice/transcribe')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          speechText: 'test voice query',
        });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SPEECH_SERVICE_UNAVAILABLE');
    });

    it('enforces RBAC and IDOR protection: technician cannot view another technician conversation', async () => {
      // Worker 1 creates a conversation
      const queryRes = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: 'What is the seal oil pressure for PUMP-204-B?',
          plantId: plantTx.id,
          assetId: machinePump.id,
        });

      const conversationId = queryRes.body.data.conversationId;

      // Other worker attempts to fetch Worker 1's conversation
      const idorRes = await request(app)
        .get(`/api/v1/copilot/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${otherWorkerToken}`);

      expect(idorRes.status).toBe(403);
      expect(idorRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

      // Admin CAN view for supervisory audit
      const adminRes = await request(app)
        .get(`/api/v1/copilot/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.id).toBe(conversationId);
    });

    it('blocks cross-plant query attempts when user is not assigned to the requested plant', async () => {
      // worker is only assigned to plantTx, not plantLa
      const crossPlantRes = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          query: 'What are the operating limits at Louisiana plant?',
          plantId: plantLa.id,
        });

      expect(crossPlantRes.status).toBe(403);
      expect(crossPlantRes.body.error.code).toBe('PLANT_ACCESS_DENIED');
    });
  });
});

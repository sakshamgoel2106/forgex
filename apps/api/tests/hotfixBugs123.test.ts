import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeIntentLocally } from '../src/ai/intentContextAnalyzer.js';
import { evaluateOperationalGuardrails } from '../src/services/operationalGuardrails.js';
import { RAGQueryEngine, KNOWN_PLANT_MACHINES_CATALOG } from '../src/services/ragQueryEngine.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';

describe('Hotfix Bugs 1, 2, and 3 Verification Suite', () => {
  let dataStore: InMemoryDataStore;
  let ragEngine: RAGQueryEngine;
  let testOrgId: string;
  let testUserId: string;
  let testPlantId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    const embeddingAdapter = new LocalDevEmbeddingAdapter(1024, 'bge-m3-copilot-test');
    const vectorStore = new InMemoryVectorStoreAdapter();
    const generationProvider = new LocalDevInferenceAdapter('forgex-local-test-model');
    const rerankingProvider = new ReciprocalRankFusionReranker(60);

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'forgex_knowledge'
    );

    const org = await dataStore.createOrganization({
      name: 'Apex Test Plant Org',
      slug: 'apex-test-org',
      tier: 'ENTERPRISE',
    });
    testOrgId = org.id;

    const plant = await dataStore.createPlant(testOrgId, {
      name: 'Primary Precision Bay',
      code: 'PLANT-TX-04',
      location: 'Houston, TX',
    });
    testPlantId = plant.id;

    const user = await dataStore.createUser(testOrgId, {
      email: 'technician@forgex.industrial.ai',
      passwordHash: 'dummy',
      role: 'TECHNICIAN',
      fullName: 'Vikrant Technician',
    });
    testUserId = user.id;
  });

  describe('Bug 1: PPE & Medical Priority Over Routine Checks', () => {
    it('classifies scratched safety goggles during routine check as PPE_OR_SAFETY_COMPLIANCE', () => {
      const q = 'my safety goggles are scratched can i still do routine check on electrical panel';
      const result = analyzeIntentLocally(q);
      expect(result.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
      expect(result.isIndustrial).toBe(false);
      expect(result.contextAwareResponse).toContain('Mandatory Plant EHS & PPE Compliance Notice');
      expect(result.contextAwareResponse).toContain('Tool Crib / Safety Store');
    });

    it('classifies missing insulated gloves during routine check as PPE_OR_SAFETY_COMPLIANCE', () => {
      const q = 'can i do routine check on pump without insulated gloves';
      const result = analyzeIntentLocally(q);
      expect(result.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
      expect(result.isIndustrial).toBe(false);
      expect(result.contextAwareResponse).toContain('Insulated');
    });

    it('guardrails intercept scratched goggles inquiry without evaluating machine manual search', () => {
      const q = 'goggles are scratched can i inspect panel';
      const decision = evaluateOperationalGuardrails(q);
      expect(decision.type).toBe('PPE_OR_HR');
      expect(decision.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
    });

    it('emergency medical inquiry halts operations even if routine maintenance is mentioned', () => {
      const q = 'i got electric shock during routine check my arm is burned';
      const result = analyzeIntentLocally(q);
      expect(result.category).toBe('MEDICAL_OR_INJURY');
      expect(result.contextAwareResponse).toContain('EMERGENCY STOP');
      expect(result.contextAwareResponse).toContain('First-Aid Station');
    });
  });

  describe('Bug 2: No Auto-Dispatched Specialist Tickets on Inquiries', () => {
    it('does not create any ticket when query has insufficient evidence', async () => {
      const context = {
        organizationId: testOrgId,
        userId: testUserId,
        userRole: 'WORKER' as any,
      };

      const res = await ragEngine.query(
        {
          plantId: testPlantId,
          query: 'What is the laser focus calibration tolerance for unknown asset BLR-999-Z?',
        },
        context
      );

      // Verify answer has unverified message
      expect(res.assistantMessage.content).toContain('No Verified Plant Records Found');
      // Verify NO ticket was auto-created or returned
      expect(res.assistantMessage.ticketNumber).toBeNull();
      expect(res.ticket).toBeNull();
    });
  });

  describe('Bug 3: Uploaded Machine (HPU-602-B) Never Shows False Unverified Match', () => {
    it('HPU-602-B exists in catalog and is recognized as a registered machine', () => {
      const hpu = KNOWN_PLANT_MACHINES_CATALOG.find((m) => m.assetTag === 'HPU-602-B');
      expect(hpu).toBeDefined();
      expect(hpu?.name).toContain('Hydraulic Power Unit');
    });

    it('answers HPU-602-B drive belt slippage inquiry with grounded engineering response, NOT unverified', async () => {
      const context = {
        organizationId: testOrgId,
        userId: testUserId,
        userRole: 'TECHNICIAN' as any,
      };

      const res = await ragEngine.query(
        {
          plantId: testPlantId,
          query: 'Check HPU-602-B drive belt slippage and abnormal bearing noise',
        },
        context
      );

      // Must NOT show unverified card or insufficient evidence
      expect(res.assistantMessage.content).not.toContain('No Verified Plant Records Found');
      expect(res.assistantMessage.isInsufficientEvidence).toBe(false);
      expect(res.assistantMessage.confidence).toBe('HIGH');

      // Must detail drive belt or bearing specs
      expect(res.assistantMessage.content).toMatch(/belt|slippage|bearing|vibration|hydraulic/i);
    });

    it('returns No Verified Plant Records Found ONLY for non-existent machine tag BLR-999-Z', async () => {
      const context = {
        organizationId: testOrgId,
        userId: testUserId,
        userRole: 'TECHNICIAN' as any,
      };

      const res = await ragEngine.query(
        {
          plantId: testPlantId,
          query: 'Check BLR-999-Z burner flame temperature curve',
        },
        context
      );

      expect(res.assistantMessage.content).toContain('No Verified Plant Records Found');
      expect(res.assistantMessage.isInsufficientEvidence).toBe(true);
      expect(res.assistantMessage.confidence).toBe('INSUFFICIENT_EVIDENCE');
      expect(res.assistantMessage.ticketNumber).toBeNull();
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  extractUuid,
  sanitizeMachineOrAssetId,
  sanitizeUuid,
  toSafeUuidParam,
  isUuid,
  UUID_REGEX,
} from '../src/utils/uuid.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { HistoricalFaultService } from '../src/services/historicalFaultService.js';
import { SpecialistRoutingService } from '../src/services/specialistRouting.service.js';
import { MaintenanceWorkflowEngine } from '../src/services/maintenanceWorkflowEngine.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';

describe('AI Diagnostic Service UUID Sanitization & Validation', () => {
  const rawUuid = '12961171-b508-48b9-95ca-478df6c378b6';
  const prefixedMachineId = `machine_${rawUuid}`;
  const prefixedAssetId = `asset_${rawUuid}`;

  describe('UUID Utility Functions', () => {
    it('should validate pure UUID correctly', () => {
      expect(isUuid(rawUuid)).toBe(true);
      expect(isUuid(prefixedMachineId)).toBe(false);
      expect(isUuid('invalid-uuid')).toBe(false);
      expect(isUuid(null as any)).toBe(false);
    });

    it('should extract pure UUID using regex from prefixed strings', () => {
      expect(extractUuid(prefixedMachineId)).toBe(rawUuid);
      expect(extractUuid(prefixedAssetId)).toBe(rawUuid);
      expect(extractUuid(`random_prefix_${rawUuid}_suffix`)).toBe(rawUuid);
      expect(extractUuid('no-uuid-here')).toBeNull();
    });

    it('should strip machine_ and asset_ prefixes cleanly', () => {
      expect(sanitizeMachineOrAssetId(prefixedMachineId)).toBe(rawUuid);
      expect(sanitizeMachineOrAssetId(prefixedAssetId)).toBe(rawUuid);
      expect(sanitizeMachineOrAssetId(rawUuid)).toBe(rawUuid);
      expect(sanitizeMachineOrAssetId('  machine_' + rawUuid + '  ')).toBe(rawUuid);
      expect(sanitizeMachineOrAssetId('PUMP-TAG-01')).toBe('PUMP-TAG-01');
    });

    it('should return safe UUID param or null fallback for database query params', () => {
      expect(toSafeUuidParam(prefixedMachineId)).toBe(rawUuid);
      expect(toSafeUuidParam(rawUuid)).toBe(rawUuid);
      expect(toSafeUuidParam('not-a-uuid')).toBeNull();
      expect(toSafeUuidParam(null as any)).toBeNull();
      expect(toSafeUuidParam(undefined)).toBeNull();
    });

    it('should match UUID_REGEX pattern exactly', () => {
      expect(UUID_REGEX.test(rawUuid)).toBe(true);
      expect(UUID_REGEX.test('12961171-B508-48B9-95CA-478DF6C378B6')).toBe(true);
      expect(UUID_REGEX.test('machine_12961171-b508-48b9-95ca-478df6c378b6')).toBe(true); // contains match
    });
  });

  describe('AI Diagnostic & Historical Fault Service Integration', () => {
    let dataStore: InMemoryDataStore;
    let faultService: HistoricalFaultService;
    let specialistService: SpecialistRoutingService;
    let maintenanceEngine: MaintenanceWorkflowEngine;
    let ragEngine: RAGQueryEngine;

    let orgId: string;
    let plantId: string;
    let machineId: string;

    beforeEach(async () => {
      dataStore = new InMemoryDataStore();
      faultService = new HistoricalFaultService(dataStore);
      specialistService = new SpecialistRoutingService(dataStore);

      const inference = new LocalDevInferenceAdapter();
      const reranker = new ReciprocalRankFusionReranker();
      const embedding = new LocalDevEmbeddingAdapter();
      const vectorStore = new InMemoryVectorStoreAdapter();

      ragEngine = new RAGQueryEngine(
        dataStore,
        embedding,
        vectorStore,
        inference,
        reranker
      );

      maintenanceEngine = new MaintenanceWorkflowEngine(dataStore, ragEngine);

      // Create test org and plant
      orgId = crypto.randomUUID();
      const org = await dataStore.createOrganization({
        name: 'Apex Manufacturing Corp',
        slug: 'apex-mfg-' + Math.random().toString(36).substring(2, 6),
      });
      orgId = org.id;

      const plant = await dataStore.createPlant(orgId, {
        name: 'Main Plant',
        code: 'PLANT-01',
      });
      plantId = plant.id;

      // Create asset/machine with pure UUID
      const asset = await dataStore.createAsset(orgId, {
        plantId,
        assetTag: 'PUMP-701',
        name: 'Centrifugal Feed Pump',
        area: 'Boiler Room',
      });
      machineId = asset.id;
    });

    it('should resolve machine and retrieve historical faults when passed machine_ prefixed UUID', async () => {
      const prefixedId = `machine_${machineId}`;

      // Call HistoricalFaultService with the prefixed machine ID
      const result = await faultService.matchHistoricalFaults(
        orgId,
        prefixedId,
        {
          query: 'high vibration and bearing overheat',
          timeWindowDays: 30,
        },
        'TECHNICIAN'
      );

      expect(result).toBeDefined();
      expect(result.machineId).toBe(machineId); // Pure UUID returned
      expect(result.machineAssetTag).toBe('PUMP-701');
      expect(result.searchStatus).toBeDefined();
    });

    it('should diagnose maintenance case without UUID syntax errors when assetId has machine_ prefix', async () => {
      const prefixedId = `machine_${machineId}`;

      // Create maintenance case with prefixed assetId
      const newCase = await maintenanceEngine.createCase(
        {
          plantId,
          assetId: prefixedId,
          title: 'Centrifugal Pump Severe Cavitation',
          symptomDescription: 'Vibration readings exceed threshold and cavitation noise observed in housing.',
          severity: 'HIGH',
        },
        {
          organizationId: orgId,
          userId: crypto.randomUUID(),
          userRole: 'ENGINEER',
        }
      );

      // Assert that assetId was sanitized to clean UUID
      expect(newCase.assetId).toBe(machineId);
      expect(newCase.id).toBeDefined();

      // Run AI Diagnosis on the case
      const diagnosedCase = await maintenanceEngine.diagnoseCase(newCase.id, {
        organizationId: orgId,
        userId: crypto.randomUUID(),
        userRole: 'ENGINEER',
      });

      expect(diagnosedCase).toBeDefined();
      // Verify that no failure message regarding "invalid input syntax for type uuid" occurred
      const historyNotes = (diagnosedCase.history || []).map((h) => h.notes || '').join(' ');
      expect(historyNotes).not.toContain('invalid input syntax for type uuid');
      expect(historyNotes).not.toContain('AI Diagnostic Service Failure');
      if (diagnosedCase.aiDiagnosticSummary) {
        expect(diagnosedCase.aiDiagnosticSummary).not.toContain('invalid input syntax for type uuid');
        expect(diagnosedCase.aiDiagnosticSummary).not.toContain('AI Diagnostic Service Failure');
      }
    });

    it('should handle specialist routing with machine_ prefixed UUID without throwing', async () => {
      const prefixedId = `machine_${machineId}`;

      const routeResult = await specialistService.routeSpecialist(
        orgId,
        prefixedId,
        'Bearing lubrication breakdown and unusual motor vibration',
        'SAFETY_CRITICAL'
      );

      expect(routeResult).toBeDefined();
      expect(routeResult.assignmentStatus).toBeDefined();
    });

    it('should safely filter maintenance records and claims with prefixed machine IDs', async () => {
      const prefixedId = `machine_${machineId}`;

      const history = await dataStore.getMachineMaintenanceHistory(orgId, prefixedId);
      expect(Array.isArray(history)).toBe(true);

      const claims = await dataStore.listEvidenceClaims(orgId, { machineId: prefixedId });
      expect(Array.isArray(claims)).toBe(true);

      const specialistMapping = await dataStore.getMachineSpecialistMapping(orgId, prefixedId);
      expect(specialistMapping).toBeNull(); // No mapping set yet, but no UUID error thrown
    });
  });
});

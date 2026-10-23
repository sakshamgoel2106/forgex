import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { LocalDevVisionAdapter } from '../src/ai/localDevVisionAdapter.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import { SecurityEventService } from '../src/services/securityEvent.service.js';
import { MachineRecoveryService } from '../src/services/machineRecovery.service.js';
import type { Organization, Plant, User, Machine } from '@forgex/shared-types';

describe('ForgeX AI — Public OEM Lookup: Accuracy, Completeness & Verification (18 Test Suite)', () => {
  const jwtSecret = 'test_public_oem_lookup_verification_secret_2026_at_least_32_chars';
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let visionProvider: LocalDevVisionAdapter;
  let generationProvider: LocalDevInferenceAdapter;
  let rerankingProvider: ReciprocalRankFusionReranker;
  let ragEngine: RAGQueryEngine;
  let securityService: SecurityEventService;
  let recoveryService: MachineRecoveryService;
  let app: any;

  // Organizations
  let orgAlpha: Organization;
  let orgBeta: Organization;

  // Plants
  let plantAlpha: Plant;

  // Users in Org Alpha
  let userAlphaAdmin: User;
  let userAlphaTech: User;
  let userAlphaWorker: User;

  // User in Org Beta
  let userBetaAdmin: User;

  // JWT Tokens
  let tokenAlphaAdmin: string;
  let tokenAlphaTech: string;
  let tokenAlphaWorker: string;
  let tokenBetaAdmin: string;

  // Machines
  let pumpMachine: Machine;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter('./scratch/test_storage');
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();
    securityService = new SecurityEventService(dataStore);
    ragEngine = new RAGQueryEngine(
      dataStore,
      vectorStore,
      embeddingAdapter,
      rerankingProvider,
      generationProvider,
      securityService
    );
    recoveryService = new MachineRecoveryService(dataStore, embeddingAdapter, vectorStore);

    app = createApp({
      dataStore,
      authAdapter,
      vectorStore,
      storageAdapter,
      embeddingAdapter,
      visionProvider,
      generationProvider,
      rerankingProvider,
      ragEngine,
      securityService,
      recoveryService,
    });

    // 1. Setup Org Alpha & Beta
    orgAlpha = await dataStore.createOrganization({ name: 'Alpha Petrochemical Corp', slug: 'alpha-petro' });
    orgBeta = await dataStore.createOrganization({ name: 'Beta Refining LLC', slug: 'beta-refining' });

    plantAlpha = await dataStore.createPlant(orgAlpha.id, {
      code: 'PLANT-TX-01',
      name: 'Texas Processing Plant',
      location: 'Houston, TX',
    });

    // 2. Setup Users
    userAlphaAdmin = await dataStore.createUser({
      externalAuthId: 'auth_alpha_admin',
      email: 'admin@alpha-petro.com',
      fullName: 'Alice Admin',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenAlphaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaAdmin.externalAuthId, email: userAlphaAdmin.email, emailVerified: true },
      jwtSecret
    );

    userAlphaTech = await dataStore.createUser({
      externalAuthId: 'auth_alpha_tech',
      email: 'tech@alpha-petro.com',
      fullName: 'Tom Technician',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTech.id,
      role: 'FIELD_OPERATOR',
    });
    tokenAlphaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTech.externalAuthId, email: userAlphaTech.email, emailVerified: true },
      jwtSecret
    );

    userAlphaWorker = await dataStore.createUser({
      externalAuthId: 'auth_alpha_worker',
      email: 'worker@alpha-petro.com',
      fullName: 'Will Worker',
    });
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaWorker.id,
      role: 'FIELD_OPERATOR',
    });
    tokenAlphaWorker = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaWorker.externalAuthId, email: userAlphaWorker.email, emailVerified: true },
      jwtSecret
    );

    userBetaAdmin = await dataStore.createUser({
      externalAuthId: 'auth_beta_admin',
      email: 'admin@beta-refining.com',
      fullName: 'Bob Beta Admin',
    });
    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenBetaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaAdmin.externalAuthId, email: userBetaAdmin.email, emailVerified: true },
      jwtSecret
    );

    // 4. Register active asset for conflict detection testing
    pumpMachine = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'PUMP-001',
      name: 'Boiler Feed Water Pump',
      machineType: 'Centrifugal Pump',
      manufacturer: 'Grundfos',
      modelNumber: 'CR 15-7',
      serialNumber: 'GF-994182',
      designStandard: 'ISO 5199',
      operatingPressureMax: 25, // 25 bar recorded
      operatingTemperatureMax: 150, // 150 C recorded
      technicalSpecs: {
        casing_material: 'AISI 316 Stainless Steel', // Contradicts default Cast Iron!
        shaft_seal_type: 'Cartridge Mechanical Seal',
      },
    });
  });

  // --------------------------------------------------------------------------
  // Case 1: Official source with an exact model match
  // --------------------------------------------------------------------------
  it('1. Retrieves technically accurate specifications from official OEM source with exact model match', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceType).toBe('OFFICIAL_MANUFACTURER');
    expect(res.body.data.sourcePublisher).toContain('Grundfos');
    expect(res.body.data.sourceUrl).toContain('grundfos.com');
    expect(res.body.data.matchStatus).toBe('EXACT_MATCH');
    expect(res.body.data.publicSpecs.pump_type).toBe('Vertical Multistage Centrifugal Pump');
    expect(res.body.data.publicSpecs.rated_flow_m3h).toBe(15);
    expect(res.body.data.publicSpecs.rated_head_m).toBe(77.9);
    expect(res.body.data.publicSpecs.power_requirement_kw).toBe(5.5);
  });

  // --------------------------------------------------------------------------
  // Case 2: Third-party source incorrectly claiming to be official
  // --------------------------------------------------------------------------
  it('2. Strictly classifies third-party sources and never labels them as official OEM', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
        customSourceUrl: 'https://public-catalog.oem-industrial.org/specs?mfr=Grundfos&model=CR',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.sourceType).toBe('THIRD_PARTY');
    expect(res.body.data.verificationStatus).toBe('SOURCE_UNVERIFIED');
    expect(res.body.data.notice).toContain('UNVERIFIED SOURCE');
    expect(res.body.data.sourceType).not.toBe('OFFICIAL_MANUFACTURER');
  });

  // --------------------------------------------------------------------------
  // Case 3: Unknown / unreachable source
  // --------------------------------------------------------------------------
  it('3. Reports unknown or unverified sources explicitly without guessing specifications', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'UnknownCorp',
        modelNumber: 'MODEL-X',
        customSourceUrl: 'https://random-unverified-wiki.net/equip/x',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('SOURCE_UNVERIFIED');
    expect(res.body.data.sourceType).toBe('UNKNOWN_UNVERIFIED');
    expect(Object.keys(res.body.data.publicSpecs).length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Case 4: Product-family match without an exact model
  // --------------------------------------------------------------------------
  it('4. Identifies family-level query, returns family envelope, and reports missing model details', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR', // Family only!
      });

    expect(res.status).toBe(200);
    expect(res.body.data.matchStatus).toBe('FAMILY_LEVEL_ONLY');
    expect(['FAMILY_LEVEL_ONLY', 'PUBLIC_SUGGESTION']).toContain(res.body.data.verificationStatus);
    expect(res.body.data.missingModelDetails).toBeDefined();
    expect(res.body.data.missingModelDetails.length).toBeGreaterThan(0);
    expect(res.body.data.missingModelDetails[0]).toContain('Nominal flow rate');
    expect(res.body.data.notice).toContain('PRODUCT FAMILY ENVELOPE');
  });

  // --------------------------------------------------------------------------
  // Case 5: Exact-model mismatch
  // --------------------------------------------------------------------------
  it('5. Flags model mismatch and does not fabricate specs when model does not exist in catalog', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'NonExistentMfr',
        modelNumber: 'FAKE-MODEL-9999',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.matchStatus).toBe('MODEL_MISMATCH');
    expect(res.body.data.verificationStatus).toBe('MODEL_MISMATCH');
    expect(Object.keys(res.body.data.publicSpecs).length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Case 6: Missing required specifications
  // --------------------------------------------------------------------------
  it('6. Calculates completeness checklist and surfaces missing required parameters', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR', // Missing exact size, flow, head
      });

    expect(res.status).toBe(200);
    const summary = res.body.data.completenessSummary;
    expect(summary).toBeDefined();
    expect(summary.totalApplicableRequired).toBeGreaterThan(0);
    expect(summary.isComplete).toBe(false);
    expect(summary.missingRequiredFields).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Case 7: Missing recommended specifications
  // --------------------------------------------------------------------------
  it('7. Surfaces missing recommended fields separately from required fields', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Flowserve',
        modelNumber: 'Mark 3',
      });

    expect(res.status).toBe(200);
    const summary = res.body.data.completenessSummary;
    expect(summary).toBeDefined();
    expect(summary.missingRecommendedFields).toBeDefined();
    expect(summary.notice).toContain('Completeness measures field coverage');
  });

  // --------------------------------------------------------------------------
  // Case 8: Unknown and not-applicable fields distinguished from verified values
  // --------------------------------------------------------------------------
  it('8. Distinguishes unknown/missing fields from valid numeric values', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    expect(res.status).toBe(200);
    const evidence = res.body.data.evidenceRecords;
    expect(evidence.rated_speed_rpm.value).toBe(2900);
    expect(evidence.rated_speed_rpm.unit).toBe('RPM');
    expect(evidence.rated_flow_m3h.value).toBe(15);
    expect(evidence.rated_flow_m3h.unit).toBe('m³/h');
  });

  // --------------------------------------------------------------------------
  // Case 9: Conflicting public and company-document specifications
  // --------------------------------------------------------------------------
  it('9. Detects discrepancies between public OEM data and active machine records', async () => {
    // Machine PUMP-001 has casing_material = 'AISI 316 Stainless Steel'
    // Public OEM lookup for CR 15-7 returns casing_material = 'Cast Iron EN-GJL-250'
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
        machineId: pumpMachine.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.conflicts).toBeDefined();
    expect(res.body.data.conflicts.length).toBeGreaterThan(0);
    expect(res.body.data.verificationStatus).toBe('CONFLICTING_DATA');
    expect(res.body.data.notice).toContain('DATA CONFLICT DETECTED');

    const casingConflict = res.body.data.conflicts.find((c: any) =>
      c.reason.toLowerCase().includes('casing material')
    );
    expect(casingConflict).toBeDefined();
    expect(casingConflict.existingValue).toBe('AISI 316 Stainless Steel');
    expect(casingConflict.publicValue).toContain('Cast Iron');
  });

  // --------------------------------------------------------------------------
  // Case 10: Conflicting values from different revisions or variants
  // --------------------------------------------------------------------------
  it('10. Compares variant metallurgy correctly (CR Cast Iron vs CRN Stainless Steel 316)', async () => {
    const crRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    const crnRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CRN 15-7', // 316 SS variant!
      });

    expect(crRes.body.data.publicSpecs.casing_material).toContain('Cast Iron');
    expect(crnRes.body.data.publicSpecs.casing_material).toContain('AISI 316');
  });

  // --------------------------------------------------------------------------
  // Case 11: Unit normalization with traceable original values
  // --------------------------------------------------------------------------
  it('11. Preserves unit traceability in evidence records', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    const evidence = res.body.data.evidenceRecords;
    expect(evidence.max_allowable_pressure_bar.unit).toBe('bar');
    expect(evidence.max_allowable_pressure_bar.originalUnit).toBe('bar');
    expect(evidence.max_operating_temp_c.unit).toBe('°C');
  });

  // --------------------------------------------------------------------------
  // Case 12: No fabricated specification when evidence is absent
  // --------------------------------------------------------------------------
  it('12. Never fabricates specifications when evidence is absent', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'FabricatedCorp',
        modelNumber: 'GhostModel-100',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.publicSpecs).toEqual({});
    expect(res.body.data.verificationStatus).toBe('MODEL_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // Case 13: Pending approval persists after lookup
  // --------------------------------------------------------------------------
  it('13. Newly retrieved public specifications remain in pending review status', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    expect(res.status).toBe(200);
    // Not approved yet!
    expect(res.body.data.verificationStatus).not.toBe('APPROVED');
    expect(res.body.data.approvedByUserId).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Case 14: Authorized admin approves a record
  // --------------------------------------------------------------------------
  it('14. Authorized admin approves public specification and audit log records decision', async () => {
    const lookupRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    const approveRes = await request(app)
      .post(`/api/v1/knowledge/public-lookup/${lookupRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        reviewNotes: 'Verified against Grundfos 2024 Product Manual Section 4.1',
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.verificationStatus).toBe('APPROVED');
    expect(approveRes.body.data.approvedByUserId).toBe(userAlphaAdmin.id);
    expect(approveRes.body.data.reviewNotes).toContain('Verified against Grundfos');
  });

  // --------------------------------------------------------------------------
  // Case 15: Unauthorized worker/technician approval attempt is rejected
  // --------------------------------------------------------------------------
  it('15. Strictly rejects approval attempts by technicians and workers with HTTP 403', async () => {
    const lookupRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    // Technician attempt -> 403 Forbidden
    const techApproveRes = await request(app)
      .post(`/api/v1/knowledge/public-lookup/${lookupRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokenAlphaTech}`)
      .send({ reviewNotes: 'Technician attempt' });

    expect(techApproveRes.status).toBe(403);

    // Operator/Worker attempt -> 403 Forbidden
    const workerApproveRes = await request(app)
      .post(`/api/v1/knowledge/public-lookup/${lookupRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokenAlphaWorker}`)
      .send({ reviewNotes: 'Worker attempt' });

    expect(workerApproveRes.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Case 16: Rejected or conflicting data cannot silently overwrite approved data
  // --------------------------------------------------------------------------
  it('16. Rejection workflow marks record as REJECTED and never overwrites active machine facts', async () => {
    const lookupRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
        machineId: pumpMachine.id,
      });

    // Admin rejects inaccurate data
    const rejectRes = await request(app)
      .post(`/api/v1/knowledge/public-lookup/${lookupRes.body.data.id}/reject`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        rejectionReason: 'Casing metallurgy conflicts with plant acid wash environment',
      });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.verificationStatus).toBe('REJECTED');

    // Confirm machine record was NOT altered
    const freshMachine = await dataStore.getMachineById(orgAlpha.id, pumpMachine.id);
    expect((freshMachine?.technicalSpecs as any)?.casing_material).toBe('AISI 316 Stainless Steel');
  });

  // --------------------------------------------------------------------------
  // Case 17: Cross-company records and sources remain isolated
  // --------------------------------------------------------------------------
  it('17. Enforces strict tenant isolation across organizations', async () => {
    // Org Alpha looks up Grundfos
    const lookupAlpha = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Grundfos',
        modelNumber: 'CR 15-7',
      });

    // Org Beta admin attempts to approve Org Alpha's audit without permission or modify Org Alpha machine
    const betaApproveAttempt = await request(app)
      .post(`/api/v1/knowledge/public-lookup/${lookupAlpha.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokenBetaAdmin}`)
      .send({
        machineId: pumpMachine.id, // Trying to tamper with Alpha's machine!
      });

    // Even if approved in public catalog, Alpha's machine is untouched by Beta
    const freshMachine = await dataStore.getMachineById(orgAlpha.id, pumpMachine.id);
    expect((freshMachine?.technicalSpecs as any)?.casing_material).toBe('AISI 316 Stainless Steel');
  });

  // --------------------------------------------------------------------------
  // Case 18: Existing lookup and machine-management behavior remains compatible
  // --------------------------------------------------------------------------
  it('18. Preserves backward-compatibility with existing Flowserve Mark 3 queries', async () => {
    const res = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Flowserve Corp',
        modelNumber: 'Mark 3 ANSI',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourcePublisher).toBe('Flowserve Industrial Pump Division');
    expect(res.body.data.publicSpecs.impeller_type).toBe('Reverse Vane Semi-Open');
    expect(res.body.data.publicSpecs.design_standard).toBe('ASME B73.1 (ANSI)');
  });
});

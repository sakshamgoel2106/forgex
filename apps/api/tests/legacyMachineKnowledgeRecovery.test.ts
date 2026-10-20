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
import type {
  Organization,
  Plant,
  User,
  Machine,
} from '@forgex/shared-types';

describe('ForgeX AI — Prompt 04: Legacy Machine Knowledge Recovery & Expert Knowledge Preservation', () => {
  const jwtSecret = 'test_prompt04_legacy_recovery_secret_key_2026_at_least_32_chars';
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
  let plantBeta: Plant;

  // Users in Org Alpha
  let userAlphaAdmin: User;
  let userAlphaEngineer: User;
  let userAlphaTech: User;
  let userAlphaOperator: User;

  // User in Org Beta
  let userBetaAdmin: User;

  // JWT Tokens
  let tokenAlphaAdmin: string;
  let tokenAlphaEngineer: string;
  let tokenAlphaTech: string;
  let tokenAlphaOperator: string;
  let tokenBetaAdmin: string;

  // Legacy Undocumented Machine
  let legacyPump: Machine;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter();
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();
    securityService = new SecurityEventService(dataStore);
    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider,
      'forgex_knowledge',
      securityService
    );
    recoveryService = new MachineRecoveryService(dataStore, securityService);

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

    // 1. Setup Organizations
    orgAlpha = await dataStore.createOrganization({ name: 'Alpha Heavy Industries', slug: 'alpha-heavy' });
    orgBeta = await dataStore.createOrganization({ name: 'Beta Power Generation', slug: 'beta-power' });

    // 2. Setup Plants
    plantAlpha = await dataStore.createPlant(orgAlpha.id, {
      name: 'Alpha Chemical Plant 1',
      code: 'PLANT-ALPHA-01',
      location: 'Beaumont, TX',
    });

    plantBeta = await dataStore.createPlant(orgBeta.id, {
      name: 'Beta Turbine Station',
      code: 'PLANT-BETA-01',
      location: 'Bakersfield, CA',
    });

    // 3. Setup Users & Roles
    userAlphaAdmin = await dataStore.createUser({
      externalAuthId: 'auth_admin_alpha',
      email: 'admin@alpha-heavy.com',
      fullName: 'Alice Administrator',
    });
    await dataStore.createMembership({
      userId: userAlphaAdmin.id,
      organizationId: orgAlpha.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenAlphaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaAdmin.externalAuthId, email: userAlphaAdmin.email, emailVerified: true },
      jwtSecret
    );

    userAlphaEngineer = await dataStore.createUser({
      externalAuthId: 'auth_eng_alpha',
      email: 'engineer@alpha-heavy.com',
      fullName: 'Edward Engineer (PE)',
    });
    await dataStore.createMembership({
      userId: userAlphaEngineer.id,
      organizationId: orgAlpha.id,
      role: 'ENGINEER_TECHNICIAN',
      assignedPlantIds: [plantAlpha.id],
    });
    tokenAlphaEngineer = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaEngineer.externalAuthId, email: userAlphaEngineer.email, emailVerified: true },
      jwtSecret
    );

    userAlphaTech = await dataStore.createUser({
      externalAuthId: 'auth_tech_alpha',
      email: 'tech@alpha-heavy.com',
      fullName: 'Tyler Technician',
    });
    await dataStore.createMembership({
      userId: userAlphaTech.id,
      organizationId: orgAlpha.id,
      role: 'FIELD_OPERATOR',
      assignedPlantIds: [plantAlpha.id],
    });
    tokenAlphaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTech.externalAuthId, email: userAlphaTech.email, emailVerified: true },
      jwtSecret
    );

    userAlphaOperator = await dataStore.createUser({
      externalAuthId: 'auth_op_alpha',
      email: 'operator@alpha-heavy.com',
      fullName: 'Oscar Operator',
    });
    await dataStore.createMembership({
      userId: userAlphaOperator.id,
      organizationId: orgAlpha.id,
      role: 'VIEWER',
      assignedPlantIds: [plantAlpha.id],
    });
    tokenAlphaOperator = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaOperator.externalAuthId, email: userAlphaOperator.email, emailVerified: true },
      jwtSecret
    );

    userBetaAdmin = await dataStore.createUser({
      externalAuthId: 'auth_admin_beta',
      email: 'admin@beta-power.com',
      fullName: 'Brian Beta Admin',
    });
    await dataStore.createMembership({
      userId: userBetaAdmin.id,
      organizationId: orgBeta.id,
      role: 'ORGANIZATION_ADMIN',
    });
    tokenBetaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaAdmin.externalAuthId, email: userBetaAdmin.email, emailVerified: true },
      jwtSecret
    );

    // 4. Undocumented Legacy Machine in Org Alpha (No manual or CAD model)
    legacyPump = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'PUMP-704-LEGACY',
      name: 'Slurry Feed Booster Pump',
      machineType: 'Centrifugal Pump',
      area: 'Polymer Train 2',
      manufacturer: null, // Unknown
      modelNumber: null, // Unknown
      serialNumber: null, // Unknown
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
      authorizedAccessScope: 'PLANT',
    });
  });

  // --------------------------------------------------------------------------
  // 1. Admin-Controlled Machine Onboarding & Role Enforcement
  // --------------------------------------------------------------------------
  it('1. allows only authorized Admins to officially register machines and rejects non-admin attempts', async () => {
    // Non-admin technician attempts registration -> 403 Forbidden
    const techRes = await request(app)
      .post('/api/v1/recovery/machines/register')
      .set('Authorization', `Bearer ${tokenAlphaTech}`)
      .send({
        plantId: plantAlpha.id,
        assetTag: 'PUMP-880-TEST',
        name: 'Unauthorized Pump',
      });
    expect(techRes.status).toBe(403);

    // Operator attempts registration -> 403 Forbidden
    const opRes = await request(app)
      .post('/api/v1/recovery/machines/register')
      .set('Authorization', `Bearer ${tokenAlphaOperator}`)
      .send({
        plantId: plantAlpha.id,
        assetTag: 'PUMP-881-TEST',
        name: 'Unauthorized Pump 2',
      });
    expect(opRes.status).toBe(403);

    // Authorized Admin registers partially-known legacy machine (No manual or CAD required)
    const adminRes = await request(app)
      .post('/api/v1/recovery/machines/register')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        plantId: plantAlpha.id,
        assetTag: 'CRUSHER-101-OLD',
        name: 'Primary Jaw Crusher',
        machineType: 'Jaw Crusher',
        area: 'Quarry Feed Line',
        manufacturer: 'Metso', // Known OEM
        modelNumber: null, // Unknown model
        serialNumber: null, // Unknown serial
        criticality: 'HIGH',
      });

    expect(adminRes.status).toBe(201);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.assetTag).toBe('CRUSHER-101-OLD');
    expect(adminRes.body.data.manufacturer).toBe('Metso');
    expect(adminRes.body.data.modelNumber).toBeNull();
    expect(adminRes.body.data.serialNumber).toBeNull();
    expect(adminRes.body.data.hasModel3d).toBe(false); // No CAD required
    expect(adminRes.body.data.documentationReadiness).toBe('INCOMPLETE');
  });

  // --------------------------------------------------------------------------
  // 2. Bulk CSV/XLSX Machine Import & Duplicate Detection
  // --------------------------------------------------------------------------
  it('2. supports bulk CSV machine onboarding with duplicate detection and completeness tracking', async () => {
    const csvContent = `
assetTag,name,machineType,manufacturer,modelNumber,serialNumber,area
PUMP-704-LEGACY,Duplicate Asset Tag,Centrifugal Pump,Sulzer,MSD,SZ-101,Area A
COMP-201-V,Variable Speed Recip Compressor,Reciprocating Compressor,Atlas Copco,GA-90,AC-9941,Utility Building
FAN-302-EX,Induced Draft Exhaust Fan,Industrial Fan,Clarage,null,null,Furnace 1
PUMP-909-CHEM,Acid Metering Pump,Diaphragm Pump,Milton Roy,mRoy-A,MR-5521,Tank Farm
`;

    const bulkRes = await request(app)
      .post('/api/v1/recovery/machines/bulk-import')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        plantId: plantAlpha.id,
        csvContent,
        industryCategory: 'Chemical Processing',
      });

    expect(bulkRes.status).toBe(201);
    expect(bulkRes.body.success).toBe(true);
    const result = bulkRes.body.data;

    // 4 rows in CSV: 1 duplicate (PUMP-704-LEGACY), 3 new machines
    expect(result.registeredCount).toBe(3);
    expect(result.duplicatesSkippedCount).toBe(1);
    expect(result.duplicates[0].assetTag).toBe('PUMP-704-LEGACY');

    // Verify documentation completeness status
    const compMachine = result.registeredMachines.find((m: any) => m.assetTag === 'COMP-201-V');
    expect(compMachine.verificationState).toBe('VERIFIED');
    expect(compMachine.documentationReadiness).toBe('READY');

    const fanMachine = result.registeredMachines.find((m: any) => m.assetTag === 'FAN-302-EX');
    expect(fanMachine.verificationState).toBe('PARTIALLY_VERIFIED'); // Clarage known, model unknown
    expect(fanMachine.documentationReadiness).toBe('INCOMPLETE');
    expect(fanMachine.modelNumber).toBeNull();

    // Verify non-admin blocked from bulk import
    const techBulk = await request(app)
      .post('/api/v1/recovery/machines/bulk-import')
      .set('Authorization', `Bearer ${tokenAlphaTech}`)
      .send({ plantId: plantAlpha.id, csvContent });
    expect(techBulk.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 3. Knowledge Recovery & Evidence Ingestion (AI Suggestions Remain Unverified)
  // --------------------------------------------------------------------------
  it('3. ingests multi-source evidence and leaves AI-extracted specifications as unverified candidate claims', async () => {
    const nameplateOcr = `
      Worthington Corporation Industrial Machinery
      Model: 4-L-8 Centrifugal Slurry
      Serial: WTH-1984-7721
      Discharge Pressure: 24.5 bar
      Rated Speed: 1780 RPM
      Volts: 460 V
      FLA: 68.5 A
      Lockout: De-energize 480V MCC Bucket 12-B and lockout suction valve V-101.
    `;

    const ingestRes = await request(app)
      .post('/api/v1/recovery/evidence/ingest')
      .set('Authorization', `Bearer ${tokenAlphaTech}`)
      .send({
        machineId: legacyPump.id,
        evidenceType: 'NAMEPLATE_PHOTO',
        rawText: nameplateOcr,
        sourceRevision: 'Field Capture Oct 2026',
      });

    expect(ingestRes.status).toBe(201);
    expect(ingestRes.body.success).toBe(true);

    const claims = ingestRes.body.data.createdClaims;
    expect(claims.length).toBeGreaterThanOrEqual(5);

    // AI/OCR candidate claims MUST remain AWAITING_REVIEW by default
    for (const c of claims) {
      expect(c.status).toBe('AWAITING_REVIEW');
      expect(c.reviewedByUserId).toBeNull();
      expect(c.reviewedAt).toBeNull();
    }

    // Machine verified specs MUST NOT be auto-updated prior to approval
    const freshMachine = await dataStore.getMachineById(orgAlpha.id, legacyPump.id);
    expect(freshMachine?.manufacturer).toBeNull();
    expect(freshMachine?.modelNumber).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 4. Expert Assignment, Technician Submission & Engineering Review Workflow
  // --------------------------------------------------------------------------
  it('4. assigns collection tasks to technicians, accepts unverified submissions, and enforces qualified engineering review with anti-self-approval', async () => {
    // 1. Admin assigns task to technician
    const taskRes = await request(app)
      .post('/api/v1/recovery/tasks')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        machineId: legacyPump.id,
        requestedFields: ['operatingPressure', 'bearingTemperatureLimit'],
        instructions: 'Safely inspect stamping on suction flange. Do not dismantle running lines.',
        assignedUserId: userAlphaTech.id,
        dueDate: '2026-11-01',
      });

    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data.id;
    expect(taskRes.body.data.status).toBe('NOT_STARTED');

    // 2. Engineer submits evidence and measurements
    const submitRes = await request(app)
      .post(`/api/v1/recovery/tasks/${taskId}/submit`)
      .set('Authorization', `Bearer ${tokenAlphaEngineer}`)
      .send({
        submittedValues: {
          operatingPressure: 22.0,
          bearingTemperatureLimit: 85.0,
        },
        evidenceDescription: 'Dial gauge physical inspection during cold turnaround inspection.',
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');
    expect(submitRes.body.data.submittedValues.operatingPressure).toBe(22.0);

    // Verify candidate claims created with status AWAITING_REVIEW
    const claims = await dataStore.listEvidenceClaims(orgAlpha.id, { machineId: legacyPump.id, status: 'AWAITING_REVIEW' });
    const pressClaim = claims.find((c) => c.fieldName === 'operatingPressure');
    expect(pressClaim).toBeDefined();
    expect(pressClaim?.status).toBe('AWAITING_REVIEW');

    // 3. Anti-self-approval: Engineer cannot approve their own submission
    const selfApproveRes = await request(app)
      .post(`/api/v1/recovery/tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${tokenAlphaEngineer}`)
      .send({
        decision: 'APPROVE',
        reviewFeedback: 'Self-approval without independent verification',
      });
    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.message).toContain('Anti-self-approval');

    // 4. Admin independently approves submission with substantive rationale
    const adminApproveRes = await request(app)
      .post(`/api/v1/recovery/tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        decision: 'APPROVE',
        reviewFeedback: 'Verified flange hydrotest stamp and calibrated dial gauge readings independently.',
        reviewerQualifications: 'Lead Mechanical Reliability Engineer (PE TX-44120)',
      });

    expect(adminApproveRes.status).toBe(200);
    expect(adminApproveRes.body.data.status).toBe('COMPLETED');

    // Verify machine technical specs were updated with approved values
    const updatedMachine = await dataStore.getMachineById(orgAlpha.id, legacyPump.id);
    expect(updatedMachine?.technicalSpecs['operatingPressure']).toBe(22.0);
  });

  // --------------------------------------------------------------------------
  // 5. Source Provenance & Sibling Machine Applicability Protection
  // --------------------------------------------------------------------------
  it('5. preserves full claim provenance and marks sibling machine documents as UNCERTAIN applicability', async () => {
    // Ingest manual that explicitly references sibling asset "PUMP-704-A"
    const siblingManual = `
      Operation and Maintenance Manual for Industrial Pump Unit PUMP-704-A.
      Manufacturer: Goulds Pumps
      Model: 3196-MTX
      Design Discharge Pressure: 25.0 bar
    `;

    const ingestRes = await request(app)
      .post('/api/v1/recovery/evidence/ingest')
      .set('Authorization', `Bearer ${tokenAlphaEngineer}`)
      .send({
        machineId: legacyPump.id, // Target is PUMP-704-LEGACY
        evidenceType: 'SCANNED_MANUAL',
        rawText: siblingManual,
        sourceRevision: 'Rev 2.1',
      });

    expect(ingestRes.status).toBe(201);
    expect(ingestRes.body.data.potentialInconsistencies.length).toBeGreaterThan(0);
    expect(ingestRes.body.data.potentialInconsistencies[0]).toContain(
      "Source text mentions asset 'PUMP-704-A' while target machine is 'PUMP-704-LEGACY'"
    );

    // All claims must be marked UNCERTAIN applicability
    for (const c of ingestRes.body.data.createdClaims) {
      expect(c.applicabilityStatus).toBe('UNCERTAIN');
      expect(c.applicabilityRationale).toContain('Applicability must not be assumed without physical verification');
    }
  });

  // --------------------------------------------------------------------------
  // 6. Public Machine Information Privacy Boundary
  // --------------------------------------------------------------------------
  it('6. protects private company details from leaking to public OEM search services and marks public results as unverified suggestions', async () => {
    // Attempt public search with internal private details (serial number, plant, private notes) -> Blocked!
    const leakAttemptRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Flowserve',
        modelNumber: 'Mark 3',
        serialNumber: 'SN-CONFIDENTIAL-8841', // Leaking private serial!
        plantId: plantAlpha.id, // Leaking plant ID!
      });

    expect(leakAttemptRes.status).toBe(400);
    expect(leakAttemptRes.body.error.code).toBe('FORGEX_PRIVACY_VIOLATION_BLOCKED');

    // Generic public lookup without private secrets -> Permitted
    const cleanPublicRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        manufacturer: 'Flowserve',
        modelNumber: 'Mark 3',
      });

    expect(cleanPublicRes.status).toBe(200);
    expect(cleanPublicRes.body.success).toBe(true);
    expect(cleanPublicRes.body.data.verificationStatus).toBe('PUBLIC_SUGGESTION');
    expect(cleanPublicRes.body.data.sourceUrl).toContain('flowserve.com');
    expect(cleanPublicRes.body.data.notice).toContain('PUBLIC SOURCE INFORMATION: Not verified');

    // Admin approves public suggestion into verified institutional fact
    const approvePublicRes = await request(app)
      .post(`/api/v1/knowledge/public-lookup/${cleanPublicRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

    expect(approvePublicRes.status).toBe(200);
    expect(approvePublicRes.body.data.verificationStatus).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // 7. Structured Expert Knowledge Library & Revocation
  // --------------------------------------------------------------------------
  it('7. preserves structured expert findings, resolutions, and failure patterns with engineering review and revocation', async () => {
    // 1. Create Expert Knowledge entry
    const createRes = await request(app)
      .post('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${tokenAlphaEngineer}`)
      .send({
        plantId: plantAlpha.id,
        machineId: legacyPump.id,
        category: 'FAILURE_PATTERN',
        title: 'Impeller Casing Cavitation during High Viscosity Feed',
        description: 'Vibration increases above 7.2 mm/s RMS when slurry specific gravity exceeds 1.35.',
        symptoms: ['Acoustic pinging in volute', 'Vibration spike at 1X RPM', 'Discharge pressure fluctuation'],
        rootCause: 'NPSHa deficit due to restricted suction line strainer mesh.',
        resolutionSteps: ['Throttle discharge valve to 60%', 'Swap suction strainer basket', 'Verify cold tank temperature'],
        knownFailureModes: ['Volute erosion', 'Mechanical seal dry-running'],
        gapDescription: 'Factory OEM performance curve at 1.4 SG is missing from archives.',
        safetyPrecautions: ['Verify LOTO before opening strainer basket', 'Wear chemical face shield'],
        tags: ['cavitation', 'vibration', 'slurry-pump', 'high-viscosity'],
      });

    expect(createRes.status).toBe(201);
    const entryId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('AWAITING_REVIEW');

    // 2. Engineer review & approval
    const reviewRes = await request(app)
      .post(`/api/v1/recovery/expert-library/${entryId}/review`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        decision: 'APPROVE',
        reviewRationale: 'Verified by Plant Mechanical Reliability Engineer based on vibration spectrum analysis.',
        reviewerQualifications: 'PE Mechanical Reliability',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // 3. Query Expert Library
    const listRes = await request(app)
      .get(`/api/v1/recovery/expert-library?machineId=${legacyPump.id}`)
      .set('Authorization', `Bearer ${tokenAlphaTech}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data[0].category).toBe('FAILURE_PATTERN');
    expect(listRes.body.data[0].rootCause).toContain('NPSHa deficit');

    // 4. Revocation of outdated expert knowledge
    const revokeRes = await request(app)
      .post(`/api/v1/recovery/expert-library/${entryId}/revoke`)
      .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
      .send({
        reason: 'Superseded by installation of larger 8-inch suction manifold in turnaround 2026-Q4.',
      });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('REVOKED');
  });

  // --------------------------------------------------------------------------
  // 8. Copilot Integration & No Guessed Safety Ratings
  // --------------------------------------------------------------------------
  it('8. integrates approved expert knowledge into Copilot and strictly refuses to guess safety ratings for unverified machines', async () => {
    // 1. Create an undocumented machine without approved specs
    const unverifiedMotor = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantAlpha.id,
      assetTag: 'MOTOR-999-OLD',
      name: 'Unidentified Agitator Motor',
      machineType: 'Electric Motor',
      area: 'Reactor Bay 4',
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
      authorizedAccessScope: 'PLANT',
    });

    // Query operating limits for unverified machine
    const copilotRes = await request(app)
      .post('/api/v1/copilot/query')
      .set('Authorization', `Bearer ${tokenAlphaEngineer}`)
      .send({
        plantId: plantAlpha.id,
        assetId: unverifiedMotor.id,
        query: `What is the maximum operating temperature and overload current for ${unverifiedMotor.assetTag}?`,
      });

    expect(copilotRes.status).toBe(200);
    const answer = copilotRes.body.data.answer;

    // Must clearly state missing identity and refuse to guess
    expect(answer).toContain('No approved, verified machine-specific specifications exist');
    expect(answer).toContain('ForgeX AI strictly forbids guessing, estimating, or inventing');
    expect(answer).toContain('Recommended Safe Information-Gathering Steps');
    expect(copilotRes.body.data.missingInfoTask).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // 9. Tenant Isolation
  // --------------------------------------------------------------------------
  it('9. strictly enforces tenant isolation across legacy machine profiles, claims, and expert library', async () => {
    // Beta Admin attempts to access Alpha legacy machine profile -> 404 Not Found
    const crossProfileRes = await request(app)
      .get(`/api/v1/recovery/machines/${legacyPump.id}/profile`)
      .set('Authorization', `Bearer ${tokenBetaAdmin}`);
    expect(crossProfileRes.status).toBe(404);

    // Beta Admin attempts to create claim on Alpha machine -> 400 Machine not found in tenant
    const crossClaimRes = await request(app)
      .post('/api/v1/recovery/claims')
      .set('Authorization', `Bearer ${tokenBetaAdmin}`)
      .send({
        machineId: legacyPump.id,
        fieldName: 'manufacturer',
        claimValue: 'Sulzer',
        sourceType: 'NAMEPLATE_PHOTO',
      });
    expect(crossClaimRes.status).toBe(400);

    // Beta Admin queries expert library -> Returns only Beta records (zero Alpha leak)
    const crossExpertRes = await request(app)
      .get('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${tokenBetaAdmin}`);
    expect(crossExpertRes.status).toBe(200);
    expect(crossExpertRes.body.data.length).toBe(0);
  });
});

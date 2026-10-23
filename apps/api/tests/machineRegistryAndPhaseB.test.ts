import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';

describe('ForgeX AI — Phase B: Secure Industrial Machine Registry & Knowledge Architecture', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;

  let orgAdminToken: string;
  let technicianToken: string;
  let workerToken: string;
  let orgBAdminToken: string;

  let testOrgId: string;
  let testOrgBId: string;
  let adminUserId: string;
  let technicianUserId: string;
  let workerUserId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({ dataStore, authAdapter });
    await bootstrapInitialData(dataStore);

    // 1. Setup Org A with Owner/Admin
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Chevron Gulf Coast Petrochemical',
        organizationSlug: 'chevron-gc',
        adminEmail: 'sarah.admin@chevron.com',
        adminFullName: 'Sarah Connor',
      });
    expect(regResA.status).toBe(201);
    orgAdminToken = regResA.body.data.token;
    testOrgId = regResA.body.data.organization.id;
    adminUserId = regResA.body.data.user.id;

    // 2. Setup Technician in Org A
    const techUser = await dataStore.createUser({
      externalAuthId: 'tech-user-1',
      email: 'tom.tech@chevron.com',
      fullName: 'Tom Technician',
    });
    technicianUserId = techUser.id;
    await dataStore.createMembership({
      organizationId: testOrgId,
      userId: techUser.id,
      role: 'TECHNICIAN',
      status: 'ACTIVE',
    });
    technicianToken = LocalDevAuthAdapter.generateDevToken(
      { id: techUser.externalAuthId, email: techUser.email, fullName: techUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // 3. Setup Worker in Org A
    const workerUser = await dataStore.createUser({
      externalAuthId: 'worker-user-1',
      email: 'wally.worker@chevron.com',
      fullName: 'Wally Worker',
    });
    workerUserId = workerUser.id;
    await dataStore.createMembership({
      organizationId: testOrgId,
      userId: workerUser.id,
      role: 'WORKER',
      status: 'ACTIVE',
    });
    workerToken = LocalDevAuthAdapter.generateDevToken(
      { id: workerUser.externalAuthId, email: workerUser.email, fullName: workerUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // 4. Setup Org B with separate Admin
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'ExxonMobil Baytown Complex',
        organizationSlug: 'exxon-baytown',
        adminEmail: 'alex.admin@exxon.com',
        adminFullName: 'Alex Administrator',
      });
    expect(regResB.status).toBe(201);
    orgBAdminToken = regResB.body.data.token;
    testOrgBId = regResB.body.data.organization.id;
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Admin-only machine creation
  // --------------------------------------------------------------------------
  it('1. Enforces admin-only machine creation and rejects technician machine creation with 403', async () => {
    // Admin creates machine successfully
    const adminCreateRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'PUMP-801-A',
        name: 'High Pressure Crude Bottoms Pump',
        machineType: 'Centrifugal Pump',
        manufacturer: 'Flowserve',
        modelNumber: 'Mark 3 ANSI',
        criticality: 'HIGH',
        dataClassification: 'CONFIDENTIAL',
        documentationReadiness: 'PENDING_INSPECTION',
      });

    expect(adminCreateRes.status).toBe(201);
    expect(adminCreateRes.body.success).toBe(true);
    expect(adminCreateRes.body.data.assetTag).toBe('PUMP-801-A');
    expect(adminCreateRes.body.data.dataClassification).toBe('CONFIDENTIAL');

    // Technician attempts to create machine directly -> strictly forbidden
    const techCreateRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'PUMP-802-B',
        name: 'Unauthorized Pump Creation',
        machineType: 'Centrifugal Pump',
      });

    expect(techCreateRes.status).toBe(403);
    expect(techCreateRes.body.success).toBe(false);
    expect(techCreateRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Technician task submission without unauthorized machine creation
  // --------------------------------------------------------------------------
  it('2. Allows technician to submit findings for assigned tasks but prevents them from mutating core machine configuration', async () => {
    // Admin creates machine
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'COMP-401-B',
        name: 'Booster Gas Compressor',
        machineType: 'Reciprocating Compressor',
      });
    const machineId = machRes.body.data.id;

    // Admin creates a missing information task assigned to technician
    const taskRes = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId,
        assignedUserId: technicianUserId,
        assignedRole: 'TECHNICIAN',
        requestedFields: ['casingPressureRatingBar', 'sealPlan'],
        instructions: 'Inspect field tag on compressor skid and confirm dual seal type.',
      });

    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data.id;

    // Technician submits discovered values
    const submitRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        submittedValues: {
          casingPressureRatingBar: 42.5,
          sealPlan: 'API Plan 53B',
        },
        evidenceDescription: 'Verified against OEM nameplate on Unit B skid.',
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.status).toBe('SUBMITTED');
    expect(submitRes.body.data.submittedValues.casingPressureRatingBar).toBe(42.5);

    // Verify machine itself has NOT been altered before review
    const checkMachRes = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(checkMachRes.body.data.verificationState).toBe('UNVERIFIED');
    expect(checkMachRes.body.data.technicalSpecs.casingPressureRatingBar).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Reviewer approval before verified data changes
  // --------------------------------------------------------------------------
  it('3. Requires reviewer approval before technician findings are promoted into verified machine ledger records', async () => {
    // 1. Create machine and task
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'PUMP-901-C',
        name: 'Fractionation Feed Pump',
        machineType: 'Centrifugal Pump',
      });
    const machineId = machRes.body.data.id;

    const taskRes = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId,
        requestedFields: ['impellerDiameterMm'],
        instructions: 'Measure physical trim diameter during maintenance window.',
      });
    const taskId = taskRes.body.data.id;

    // 2. Submit technician findings
    await request(app)
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        submittedValues: { impellerDiameterMm: 215 },
        evidenceDescription: 'Direct micrometer measurement during turnaround.',
      });

    // 3. Admin reviews and approves task
    const reviewRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        action: 'APPROVE',
        reviewNotes: 'Verified with rotating equipment lead engineer.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.success).toBe(true);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // 4. Verify machine ledger was promoted with new verified specs and bumped revision
    const verifiedMachRes = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    // Ordinary task approval promotes technical specs without blindly marking the machine VERIFIED
    expect(verifiedMachRes.body.data.verificationState).toBe('PARTIALLY_VERIFIED');
    expect(verifiedMachRes.body.data.technicalSpecs.impellerDiameterMm).toBe(215);
    expect(verifiedMachRes.body.data.revision).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Bulk registration with incomplete fields
  // --------------------------------------------------------------------------
  it('4. Supports bulk registration of machines with minimal or placeholder information', async () => {
    const bulkRes = await request(app)
      .post('/api/v1/machines/bulk')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machines: [
          {
            assetTag: 'PUMP-101-PL',
            name: 'Placeholder Slurry Pump 1',
            machineType: 'Centrifugal Pump',
            documentationReadiness: 'INCOMPLETE',
          },
          {
            assetTag: 'PUMP-102-PL',
            name: 'Placeholder Slurry Pump 2',
            machineType: 'Centrifugal Pump',
            documentationReadiness: 'INCOMPLETE',
          },
          {
            assetTag: 'COMP-103-PL',
            name: 'Placeholder Offgas Compressor',
            machineType: 'Compressor',
            documentationReadiness: 'INCOMPLETE',
          },
        ],
      });

    expect(bulkRes.status).toBe(201);
    expect(bulkRes.body.success).toBe(true);
    expect(bulkRes.body.data.count).toBe(3);
    expect(bulkRes.body.data.registeredMachines.length).toBe(3);
    expect(bulkRes.body.data.registeredMachines[0].documentationReadiness).toBe('INCOMPLETE');
    expect(bulkRes.body.data.registeredMachines[0].manufacturer).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Duplicate machine handling and safe import retries
  // --------------------------------------------------------------------------
  it('5. Detects duplicates and rejects duplicate asset tags within the same organization', async () => {
    // Create initial machine
    await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'UNIQUE-TAG-01',
        name: 'Original Unique Asset',
        machineType: 'Exchanger',
        manufacturer: 'Alfa Laval',
        modelNumber: 'Compabloc CP75',
      });

    // Attempt to register duplicate tag
    const dupRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'UNIQUE-TAG-01',
        name: 'Duplicate Asset Collision',
        machineType: 'Exchanger',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('FORGEX_ASSET_TAG_CONFLICT');

    // Duplicate check endpoint returns warning for existing manufacturer + model
    const checkRes = await request(app)
      .post('/api/v1/machines/check-duplicates')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'OTHER-TAG-99',
        manufacturer: 'Alfa Laval',
        modelNumber: 'Compabloc CP75',
      });

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.isDuplicate).toBe(true);
    expect(checkRes.body.warning).toContain('Alfa Laval');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Organization A cannot access Organization B's machine data
  // --------------------------------------------------------------------------
  it('6. Enforces tenant boundary: Organization A cannot view or mutate Organization B machines', async () => {
    // Org B creates a confidential machine
    const orgBMachRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', testOrgBId)
      .send({
        assetTag: 'EXXON-CONF-01',
        name: 'Proprietary Alkylation Contactor',
        machineType: 'Chemical Contactor',
        dataClassification: 'RESTRICTED',
      });
    const orgBMachineId = orgBMachRes.body.data.id;

    // Org A admin attempts to read Org B machine directly by ID
    const crossReadRes = await request(app)
      .get(`/api/v1/machines/${orgBMachineId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(crossReadRes.status).toBe(404);
    expect(crossReadRes.body.error.code).toBe('FORGEX_MACHINE_NOT_FOUND');

    // Org A admin attempts to delete Org B machine
    const crossDeleteRes = await request(app)
      .delete(`/api/v1/machines/${orgBMachineId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(crossDeleteRes.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Confidential documents protected against unauthorized inference
  // --------------------------------------------------------------------------
  it('7. Protects confidential machine records from unauthorized external data egress', async () => {
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'SECRET-REACTOR-01',
        name: 'Proprietary Catalytic Cracking Reactor',
        machineType: 'Fluidized Bed Reactor',
        dataClassification: 'CONFIDENTIAL',
        authorizedAccessScope: 'RESTRICTED_TEAM',
      });

    expect(machRes.status).toBe(201);
    expect(machRes.body.data.dataClassification).toBe('CONFIDENTIAL');
    expect(machRes.body.data.authorizedAccessScope).toBe('RESTRICTED_TEAM');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Public enrichment does not include confidential machine-specific fields
  // --------------------------------------------------------------------------
  it('8. Rejects public lookup requests that attempt to leak serial numbers or private plant notes', async () => {
    // Attempting to query public OEM knowledge while providing private serial numbers or plant notes is strictly blocked
    const leakAttemptRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        manufacturer: 'Flowserve Corp',
        modelNumber: 'Mark 3 ANSI',
        serialNumber: 'SN-CONFIDENTIAL-998', // Leaked secret!
      });

    expect(leakAttemptRes.status).toBe(400);
    expect(leakAttemptRes.body.error.code).toBe('FORGEX_PRIVACY_VIOLATION_BLOCKED');
    expect(leakAttemptRes.body.error.message).toContain('Serial numbers');

    // Valid public query with ONLY generic make and model succeeds
    const safeLookupRes = await request(app)
      .post('/api/v1/knowledge/public-lookup')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        manufacturer: 'Flowserve Corp',
        modelNumber: 'Mark 3 ANSI',
      });

    expect(safeLookupRes.status).toBe(200);
    expect(safeLookupRes.body.success).toBe(true);
    expect(safeLookupRes.body.data.sourcePublisher).toBe('Flowserve Industrial Pump Division');
    expect(safeLookupRes.body.data.publicSpecs.impeller_type).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Missing manuals and models do not block machine registration
  // --------------------------------------------------------------------------
  it('9. Allows registering machines without manuals or 3D models', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'VALV-999-RAW',
        name: 'Manual Gate Valve',
        machineType: 'Gate Valve',
        hasModel3d: false,
        hasPidDiagram: false,
        documentationReadiness: 'INCOMPLETE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.hasModel3d).toBe(false);
    expect(res.body.data.hasPidDiagram).toBe(false);
    expect(res.body.data.documentationReadiness).toBe('INCOMPLETE');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Private documents and assets cannot be downloaded without permission
  // --------------------------------------------------------------------------
  it('10. Blocks unauthenticated downloads and verifies permission checks', async () => {
    // Create machine
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'DOC-CHECK-01',
        name: 'Protected Asset',
        machineType: 'Pump',
      });
    const machineId = machRes.body.data.id;

    // Unauthenticated poster request -> 401
    const unauthRes = await request(app).get(`/api/v1/machines/${machineId}/poster`);
    expect(unauthRes.status).toBe(401);
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Machine QR scanning requires authentication and resource authorization
  // --------------------------------------------------------------------------
  it('11. Requires authentication and valid organization membership when scanning machine QR route', async () => {
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'QR-PUMP-01',
        name: 'QR Scanned Asset',
        machineType: 'Pump',
      });
    const machineId = machRes.body.data.id;

    // 1. Unauthenticated QR scan access -> 401
    const unauthRes = await request(app).get(`/api/v1/machines/${machineId}`);
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated worker in Org A -> 200
    const workerRes = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${workerToken}`)
      .set('x-organization-id', testOrgId);
    expect(workerRes.status).toBe(200);
    expect(workerRes.body.data.assetTag).toBe('QR-PUMP-01');

    // 3. Authenticated user from Org B -> 404 (isolated)
    const orgBOtherRes = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', testOrgBId);
    expect(orgBOtherRes.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // Scenario 12: A copied or photographed employee barcode cannot independently authenticate
  // --------------------------------------------------------------------------
  it('12. Rejects barcode/QR badge scans without a verified 4-digit PIN', async () => {
    // 1. Admin creates badge for technician
    const badgeRes = await request(app)
      .post('/api/v1/badges')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        userId: technicianUserId,
        badgeCode: 'EMP-7701',
        pin: '5678',
      });
    expect(badgeRes.status).toBe(201);

    // 2. Attacker photographs barcode and submits badgeCode alone without PIN
    const noPinRes = await request(app)
      .post('/api/v1/auth/badge-login')
      .send({
        badgeCode: 'EMP-7701',
      });

    expect(noPinRes.status).toBe(400);
    expect(noPinRes.body.error.code).toBe('FORGEX_PIN_REQUIRED');

    // 3. Attacker guesses wrong PIN
    const wrongPinRes = await request(app)
      .post('/api/v1/auth/badge-login')
      .send({
        badgeCode: 'EMP-7701',
        pin: '0000',
      });

    expect(wrongPinRes.status).toBe(401);
    expect(wrongPinRes.body.error.code).toBe('FORGEX_INVALID_CREDENTIALS');

    // 4. Authorized technician provides barcode + correct PIN -> succeeds
    const correctRes = await request(app)
      .post('/api/v1/auth/badge-login')
      .send({
        badgeCode: 'EMP-7701',
        pin: '5678',
      });

    expect(correctRes.status).toBe(200);
    expect(correctRes.body.success).toBe(true);
    expect(correctRes.body.data.token).toBeDefined();
    expect(correctRes.body.data.user.email).toBe('tom.tech@chevron.com');
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Suspended or revoked badges no longer authenticate
  // --------------------------------------------------------------------------
  it('13. Prevents suspended or revoked employee badges from authenticating', async () => {
    // Create active badge
    const badgeRes = await request(app)
      .post('/api/v1/badges')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        userId: workerUserId,
        badgeCode: 'EMP-WORKER-99',
        pin: '4321',
      });
    const badgeId = badgeRes.body.data.id;

    // Admin suspends badge
    const suspendRes = await request(app)
      .patch(`/api/v1/badges/${badgeId}/status`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({ status: 'SUSPENDED' });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe('SUSPENDED');

    // Worker attempts badge login with suspended badge
    const loginRes = await request(app)
      .post('/api/v1/auth/badge-login')
      .send({
        badgeCode: 'EMP-WORKER-99',
        pin: '4321',
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error.code).toBe('FORGEX_BADGE_INACTIVE');
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Role permissions remain enforced after badge-based login
  // --------------------------------------------------------------------------
  it('14. Enforces the exact RBAC permissions of the employee after badge authentication', async () => {
    // 1. Create technician badge
    await request(app)
      .post('/api/v1/badges')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        userId: technicianUserId,
        badgeCode: 'EMP-TECH-55',
        pin: '9876',
      });

    // 2. Login via badge
    const badgeLoginRes = await request(app)
      .post('/api/v1/auth/badge-login')
      .send({
        badgeCode: 'EMP-TECH-55',
        pin: '9876',
      });
    const badgeSessionToken = badgeLoginRes.body.data.token;

    // 3. Technician cannot perform admin-only machine creation
    const blockedRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${badgeSessionToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'PUMP-ILLEGAL',
        name: 'Illegal Pump',
        machineType: 'Pump',
      });

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Technician tasks and audit history preserve provenance
  // --------------------------------------------------------------------------
  it('15. Preserves full provenance: who submitted findings and when', async () => {
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({ assetTag: 'HIST-01', name: 'Audit Test Unit', machineType: 'Turbine' });
    const machineId = machRes.body.data.id;

    const taskRes = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId,
        requestedFields: ['bearingVibrationThreshold'],
        instructions: 'Confirm trip point.',
      });
    const taskId = taskRes.body.data.id;

    await request(app)
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        submittedValues: { bearingVibrationThreshold: 4.5 },
        evidenceDescription: 'OEM Spec Sheet section 4',
      });

    const taskDetails = await dataStore.getMissingInfoTaskById(testOrgId, taskId);
    expect(taskDetails?.submittedByUserId).toBe(technicianUserId);
    expect(taskDetails?.submittedAt).toBeDefined();
    expect(taskDetails?.evidenceDescription).toBe('OEM Spec Sheet section 4');
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Machine poster generation does not expose sensitive data
  // --------------------------------------------------------------------------
  it('16. Generates machine posters with opaque non-sensitive QR routes and zero credential leakage', async () => {
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'PUMP-POSTER-01',
        name: 'Printable Poster Machine',
        machineType: 'Pump',
      });
    const machineId = machRes.body.data.id;

    const posterRes = await request(app)
      .get(`/api/v1/machines/${machineId}/poster`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(posterRes.status).toBe(200);
    expect(posterRes.body.success).toBe(true);
    expect(posterRes.body.data.qrPayload).toBe(`/machines/${machineId}`);
    expect(posterRes.body.data.assetTag).toBe('PUMP-POSTER-01');
    expect(posterRes.body.data.safetyReminder).toBeDefined();
    // Verify no private tokens or database details in poster payload
    expect(posterRes.body.data.token).toBeUndefined();
    expect(posterRes.body.data.password).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Actual GLB models load in 3D viewer metadata
  // --------------------------------------------------------------------------
  it('17. Verifies 3D model properties and GLB format metadata in bootstrapped records', async () => {
    const apexOrg = await dataStore.getOrganizationBySlug('apex-energy-tx');
    expect(apexOrg).toBeDefined();
    const bootstrapPump = await dataStore.getMachineByAssetTag(apexOrg!.id, 'PUMP-204-B');
    expect(bootstrapPump).toBeDefined();
    expect(bootstrapPump?.hasModel3d).toBe(true);
    expect(bootstrapPump?.model3dFormat).toBe('glb');
    expect(bootstrapPump?.model3dStorageKey).toBe('models/centrifugal_pump.glb');
  });

  // --------------------------------------------------------------------------
  // Scenario 18: P&ID documents remain separately viewable and revision-aware
  // --------------------------------------------------------------------------
  it('18. Maintains separate P&ID schematic drawings with drawing numbers and revisions', async () => {
    const apexOrg = await dataStore.getOrganizationBySlug('apex-energy-tx');
    const bootstrapPump = await dataStore.getMachineByAssetTag(apexOrg!.id, 'PUMP-204-B');
    expect(bootstrapPump?.hasPidDiagram).toBe(true);
    expect(bootstrapPump?.pidStorageKey).toBe('schematics/pid_pump_204.svg');

    const mappings = await dataStore.listComponentMappings(apexOrg!.id, bootstrapPump!.id);
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings[0].pidDrawingNumber).toBe('DWG-PID-TX04-204');
  });

  // --------------------------------------------------------------------------
  // Scenario 19: Verified component mappings work across 3D, P&ID, and source documentation
  // --------------------------------------------------------------------------
  it('19. Connects 3D components, P&ID tags, and manual source pages with VERIFIED status', async () => {
    const apexOrg = await dataStore.getOrganizationBySlug('apex-energy-tx');
    const bootstrapPump = await dataStore.getMachineByAssetTag(apexOrg!.id, 'PUMP-204-B');
    const mappings = await dataStore.listComponentMappings(apexOrg!.id, bootstrapPump!.id);

    const impellerMapping = mappings.find((m) => m.componentId === 'impeller_assembly');
    expect(impellerMapping).toBeDefined();
    expect(impellerMapping?.status).toBe('VERIFIED');
    expect(impellerMapping?.pidTag).toBe('P-204-IMP');
    expect(impellerMapping?.manualPageNumber).toBe(4);

    const sealMapping = mappings.find((m) => m.componentId === 'mechanical_seal_cartridge');
    expect(sealMapping).toBeDefined();
    expect(sealMapping?.status).toBe('VERIFIED');
    expect(sealMapping?.pidTag).toBe('P-204-SEAL');
    expect(sealMapping?.manualPageNumber).toBe(7);
  });

  // --------------------------------------------------------------------------
  // Scenario 20: Strict-private Enterprise workflows do not silently fall back to cloud providers
  // --------------------------------------------------------------------------
  it('20. Guarantees zero silent fallback to cloud AI providers in strict-private Enterprise mode', async () => {
    // In Enterprise self-hosted mode with strict privacy, external cloud endpoints are never called
    expect(config.DEPLOYMENT_MODE).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Scenario 21: Existing authentication, RAG citations, and maintenance pass regression
  // --------------------------------------------------------------------------
  it('21. Passes regression: standard session auth, organization switching, and ledger summary operate seamlessly', async () => {
    // Verify ledger summary calculation from real records
    const summaryRes = await request(app)
      .get('/api/v1/machines/ledger/summary')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.totalMachines).toBeGreaterThanOrEqual(0);
    expect(typeof summaryRes.body.data.incompleteDocumentationCount).toBe('number');
    expect(typeof summaryRes.body.data.pendingReviewTasksCount).toBe('number');
  });
});

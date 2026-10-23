import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';

describe('ForgeX AI — Machine Registration: Serial Number Integrity & Engineering Attachments', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;

  let orgAdminToken: string;
  let technicianToken: string;
  let orgBAdminToken: string;

  let testOrgId: string;
  let testOrgBId: string;
  let adminUserId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({ dataStore, authAdapter });
    await bootstrapInitialData(dataStore);

    // 1. Setup Organization A with Admin
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Chevron Gulf Coast Petrochemical',
        organizationSlug: 'chevron-gc-reg',
        adminEmail: 'reg.admin@chevron.com',
        adminFullName: 'Sarah Connor',
      });
    expect(regResA.status).toBe(201);
    orgAdminToken = regResA.body.data.token;
    testOrgId = regResA.body.data.organization.id;
    adminUserId = regResA.body.data.user.id;

    // 2. Setup Technician in Organization A
    const techUser = await dataStore.createUser({
      externalAuthId: 'tech-user-serial-reg',
      email: 'tech.serial@chevron.com',
      fullName: 'Tom Technician',
    });
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

    // 3. Setup Organization B with separate Admin (for tenant isolation tests)
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'ExxonMobil Baytown Complex',
        organizationSlug: 'exxon-baytown-reg',
        adminEmail: 'reg.admin@exxon.com',
        adminFullName: 'Alex Administrator',
      });
    expect(regResB.status).toBe(201);
    orgBAdminToken = regResB.body.data.token;
    testOrgBId = regResB.body.data.organization.id;
  });

  // --------------------------------------------------------------------------
  // Test 1: Missing Serial Number (omitted/undefined)
  // --------------------------------------------------------------------------
  it('1. Successfully registers machine when serial_number is omitted, storing null and UNVERIFIED state', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'LEGACY-PUMP-01',
        name: 'Legacy Atmospheric Crude Pump',
        machineType: 'Centrifugal Pump',
        area: 'Unit-01 Distillation',
        criticality: 'MEDIUM',
        // serialNumber deliberately omitted
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assetTag).toBe('LEGACY-PUMP-01');
    expect(res.body.data.serialNumber).toBeNull();
    expect(res.body.data.verificationState).toBe('UNVERIFIED');
    expect(res.body.data.documentationReadiness).toBe('INCOMPLETE');

    // Confirm stored in dataStore with null serialNumber
    const inDb = await dataStore.getMachineById(testOrgId, res.body.data.id);
    expect(inDb).not.toBeNull();
    expect(inDb?.serialNumber).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Test 2: Empty and Whitespace-only Serial Numbers
  // --------------------------------------------------------------------------
  it('2. Normalizes empty string and whitespace-only serial numbers to null without fake placeholders', async () => {
    // 2a. Empty string
    const resEmpty = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'EMPTY-SN-01',
        name: 'Pump with Empty Serial',
        machineType: 'Centrifugal Pump',
        serialNumber: '',
      });
    expect(resEmpty.status).toBe(201);
    expect(resEmpty.body.data.serialNumber).toBeNull();
    expect(resEmpty.body.data.verificationState).toBe('UNVERIFIED');

    // 2b. Whitespace-only string
    const resSpaces = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'SPACES-SN-01',
        name: 'Pump with Whitespace Serial',
        machineType: 'Centrifugal Pump',
        serialNumber: '    ',
      });
    expect(resSpaces.status).toBe(201);
    expect(resSpaces.body.data.serialNumber).toBeNull();
    expect(resSpaces.body.data.verificationState).toBe('UNVERIFIED');
  });

  // --------------------------------------------------------------------------
  // Test 3: Multiple machines with unknown (null) serial numbers in same org
  // --------------------------------------------------------------------------
  it('3. Allows multiple uninspected machines with null serial numbers in the same organization', async () => {
    const resA = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'UNINSPECTED-PUMP-01',
        name: 'Uninspected Pump Alpha',
        serialNumber: undefined,
      });
    expect(resA.status).toBe(201);

    const resB = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'UNINSPECTED-PUMP-02',
        name: 'Uninspected Pump Beta',
        serialNumber: '',
      });
    expect(resB.status).toBe(201);

    expect(resA.body.data.serialNumber).toBeNull();
    expect(resB.body.data.serialNumber).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Test 4: Valid Serial Number Registration
  // --------------------------------------------------------------------------
  it('4. Successfully registers machine with valid serial number, trimming whitespace and setting PARTIALLY_VERIFIED', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'COMP-101-A',
        name: 'Wet Gas Centrifugal Compressor',
        machineType: 'Wet Gas Compressor',
        manufacturer: 'Elliott Group',
        modelNumber: '29M',
        serialNumber: '  SN-ELLIOTT-88421-TX  ',
        criticality: 'HIGH',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.serialNumber).toBe('SN-ELLIOTT-88421-TX');
    expect(res.body.data.verificationState).toBe('PARTIALLY_VERIFIED');
  });

  // --------------------------------------------------------------------------
  // Test 5: Duplicate Serial Number Rejection within same organization
  // --------------------------------------------------------------------------
  it('5. Rejects duplicate serial number registration in the same organization with 409 Conflict', async () => {
    // 5a. Register original machine
    const firstRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'PUMP-ORIGINAL',
        name: 'Original Feed Pump',
        manufacturer: 'Sulzer',
        modelNumber: 'OH2',
        serialNumber: 'SN-SULZER-99001',
      });
    expect(firstRes.status).toBe(201);

    // 5b. Attempt to register second machine with identical serial number
    const dupRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'PUMP-DUPLICATE',
        name: 'Duplicate Serial Feed Pump',
        manufacturer: 'Sulzer',
        modelNumber: 'OH2',
        serialNumber: 'SN-SULZER-99001',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.success).toBe(false);
    expect(dupRes.body.error.code).toBe('FORGEX_SERIAL_NUMBER_CONFLICT');
    expect(dupRes.body.error.message).toContain('SN-SULZER-99001');

    // 5c. Case-insensitive duplicate check
    const caseDupRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'PUMP-CASE-DUP',
        name: 'Case Insensitive Serial Feed Pump',
        serialNumber: 'sn-sulzer-99001',
      });

    expect(caseDupRes.status).toBe(409);
    expect(caseDupRes.body.error.code).toBe('FORGEX_SERIAL_NUMBER_CONFLICT');
  });

  // --------------------------------------------------------------------------
  // Test 6: Cross-Organization Tenant Isolation for Serial Numbers
  // --------------------------------------------------------------------------
  it('6. Allows the same serial number to be registered across different organizations (tenant isolation)', async () => {
    const sharedSerial = 'OEM-COMMON-SER-12345';

    // Org A registers machine
    const orgARes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'ORG-A-PUMP-01',
        name: 'Org A Pump',
        serialNumber: sharedSerial,
      });
    expect(orgARes.status).toBe(201);

    // Org B registers machine with same serial number
    const orgBRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({
        assetTag: 'ORG-B-PUMP-01',
        name: 'Org B Pump',
        serialNumber: sharedSerial,
      });
    expect(orgBRes.status).toBe(201);
    expect(orgBRes.body.data.organizationId).toBe(testOrgBId);
    expect(orgARes.body.data.organizationId).toBe(testOrgId);
  });

  // --------------------------------------------------------------------------
  // Test 7: Duplicate Check API Endpoint (/check-duplicates)
  // --------------------------------------------------------------------------
  it('7. Duplicate check endpoint accurately warns on existing serial number or asset tag', async () => {
    // Register initial machine
    await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'CHECK-PUMP-01',
        name: 'Pre-existing Check Pump',
        serialNumber: 'SN-CHECK-7766',
        manufacturer: 'Goulds',
        modelNumber: '3196',
      });

    // Check with matching serial
    const checkSerial = await request(app)
      .post('/api/v1/machines/check-duplicates')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        serialNumber: 'SN-CHECK-7766',
      });
    expect(checkSerial.status).toBe(200);
    expect(checkSerial.body.isDuplicate).toBe(true);
    expect(checkSerial.body.warning).toContain('SN-CHECK-7766');

    // Check with matching asset tag
    const checkTag = await request(app)
      .post('/api/v1/machines/check-duplicates')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'CHECK-PUMP-01',
      });
    expect(checkTag.status).toBe(200);
    expect(checkTag.body.isDuplicate).toBe(true);
    expect(checkTag.body.warning).toContain('CHECK-PUMP-01');

    // Check with brand new serial
    const checkUnique = await request(app)
      .post('/api/v1/machines/check-duplicates')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'UNIQUE-TAG-99',
        serialNumber: 'SN-COMPLETELY-NEW-99',
      });
    expect(checkUnique.status).toBe(200);
    expect(checkUnique.body.isDuplicate).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test 8: Machine Registration with both Engineering Attachments (3D CAD + P&ID)
  // --------------------------------------------------------------------------
  it('8. Successfully registers machine preserving both 3D CAD model and P&ID diagram attachments', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        assetTag: 'TURB-ENG-500',
        name: 'High Pressure Steam Turbine Generator',
        machineType: 'Steam Turbine',
        manufacturer: 'Siemens Energy',
        modelNumber: 'SST-400',
        serialNumber: 'SN-SIEMENS-SST-5001',
        criticality: 'MISSION_CRITICAL',
        dataClassification: 'RESTRICTED',
        // 3D CAD model attachment
        hasModel3d: true,
        model3dStorageKey: 'models/TURB-ENG-500-cad_model.glb',
        model3dFormat: 'glb',
        // P&ID diagram attachment
        hasPidDiagram: true,
        pidStorageKey: 'schematics/TURB-ENG-500-pid_drawing.pdf',
        technicalSpecs: {
          steamPressureBar: 120,
          inletTemperatureC: 540,
          ratedPowerMw: 45,
          cadSoftware: 'SolidWorks 2026',
          pidDrawingNumber: 'DWG-2026-TURB-500-PID-REV4',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const m = res.body.data;
    expect(m.assetTag).toBe('TURB-ENG-500');
    expect(m.serialNumber).toBe('SN-SIEMENS-SST-5001');
    expect(m.hasModel3d).toBe(true);
    expect(m.model3dStorageKey).toBe('models/TURB-ENG-500-cad_model.glb');
    expect(m.model3dFormat).toBe('glb');
    expect(m.hasPidDiagram).toBe(true);
    expect(m.pidStorageKey).toBe('schematics/TURB-ENG-500-pid_drawing.pdf');
    expect(m.technicalSpecs.ratedPowerMw).toBe(45);
    expect(m.technicalSpecs.pidDrawingNumber).toBe('DWG-2026-TURB-500-PID-REV4');

    // Retrieve via GET to confirm persistence of attachments
    const getRes = await request(app)
      .get(`/api/v1/machines/${m.id}`)
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.hasModel3d).toBe(true);
    expect(getRes.body.data.model3dStorageKey).toBe('models/TURB-ENG-500-cad_model.glb');
    expect(getRes.body.data.hasPidDiagram).toBe(true);
    expect(getRes.body.data.pidStorageKey).toBe('schematics/TURB-ENG-500-pid_drawing.pdf');
  });

  // --------------------------------------------------------------------------
  // Test 9: RBAC Enforcement
  // --------------------------------------------------------------------------
  it('9. Enforces RBAC: rejects registration by non-privileged technician with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        assetTag: 'TECH-FAIL-PUMP',
        name: 'Technician Attempt Pump',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test 10: Validation Error Sanitization
  // --------------------------------------------------------------------------
  it('10. Returns clean validation error envelopes instead of raw database errors when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({
        // Missing assetTag and name
        machineType: 'Compressor',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORGEX_VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Asset Tag and Machine Name are required for registration.');
  });
});

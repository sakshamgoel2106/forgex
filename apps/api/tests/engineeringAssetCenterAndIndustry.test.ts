import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';

describe('ForgeX AI — Universal Industry Support & Admin Engineering Asset Center', () => {
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

    // Setup Org A (Industrial Plant)
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Valero Energy Refining Corp',
        organizationSlug: 'valero-refining',
        adminEmail: 'marcus.admin@valero.com',
        adminFullName: 'Marcus Vance',
      });
    expect(regResA.status).toBe(201);
    orgAdminToken = regResA.body.data.token;
    testOrgId = regResA.body.data.organization.id;
    adminUserId = regResA.body.data.user.id;

    // Setup Technician in Org A
    const techUser = await dataStore.createUser({
      externalAuthId: 'tech-user-eng',
      email: 'toby.tech@valero.com',
      fullName: 'Toby Technician',
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

    // Setup Worker in Org A
    const workerUser = await dataStore.createUser({
      externalAuthId: 'worker-user-eng',
      email: 'wendy.worker@valero.com',
      fullName: 'Wendy Worker',
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

    // Setup Org B (Separate Tenant)
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'BASF Chemical Solutions',
        organizationSlug: 'basf-solutions',
        adminEmail: 'kurt.admin@basf.com',
        adminFullName: 'Kurt Schneider',
      });
    expect(regResB.status).toBe(201);
    orgBAdminToken = regResB.body.data.token;
    testOrgBId = regResB.body.data.organization.id;
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 1: Admin can upload and manage a real 3D/CAD file
  // --------------------------------------------------------------------------
  it('1. Allows authorized admin to register and upload a real 3D CAD model file', async () => {
    // 1. Admin creates a machine
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'PUMP-501-A',
        name: 'Hydrotreater Booster Pump',
        machineType: 'Centrifugal Pump',
        manufacturer: 'Sulzer Pumps',
        modelNumber: 'OH2-200',
      });
    expect(machRes.status).toBe(201);
    const machineId = machRes.body.data.id;

    // 2. Admin uploads a real GLB model
    const uploadRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId,
        title: 'Sulzer OH2 Heavy Duty Booster Assembly',
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        manufacturer: 'Sulzer Pumps',
        modelNumber: 'OH2-200',
        fileFormat: 'GLB',
        fileSizeBytes: 5242880,
        fileHashSha256: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
        storageKey: 'models/valero/pump_501_a.glb',
        dataClassification: 'CONFIDENTIAL',
        licenseUsageRights: 'OEM Site License Granted',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.data.title).toBe('Sulzer OH2 Heavy Duty Booster Assembly');
    expect(uploadRes.body.data.fileFormat).toBe('GLB');
    expect(uploadRes.body.data.status).toBe('NEEDS_REVIEW');
    expect(uploadRes.body.data.dataClassification).toBe('CONFIDENTIAL');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 2: Unauthorized technicians cannot upload or publish
  // --------------------------------------------------------------------------
  it('2. Rejects unauthorized technician attempts to upload or publish engineering assets with 403', async () => {
    const techUploadRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Unauthorized Technician Model',
        fileFormat: 'GLB',
        fileSizeBytes: 1024,
        fileHashSha256: 'dummy_hash',
        storageKey: 'models/unauth.glb',
      });

    expect(techUploadRes.status).toBe(403);
    expect(techUploadRes.body.success).toBe(false);
    expect(techUploadRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

    // Drawing upload also rejected
    const techDrawingRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        drawingTitle: 'Unauthorized Drawing',
        uniqueDrawingNumber: 'DWG-UNAUTH-01',
        drawingType: 'PID',
        discipline: 'Process',
        storageKey: 'drawings/unauth.pdf',
        fileFormat: 'PDF',
      });

    expect(techDrawingRes.status).toBe(403);
    expect(techDrawingRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 3: Admin can upload and view original engineering drawings
  // --------------------------------------------------------------------------
  it('3. Allows authorized admin to upload and view original engineering drawings', async () => {
    const createDwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        drawingTitle: 'Hydrotreater Feed Fractionation P&ID Schematic',
        uniqueDrawingNumber: 'DWG-HT-2026-P01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        revision: 'Rev 2.0',
        effectiveDate: '2026-03-15',
        source: 'Fluor Daniels EPC Engineering',
        storageKey: 'drawings/valero/DWG-HT-2026-P01.pdf',
        originalFileName: 'DWG-HT-2026-P01.pdf',
        fileFormat: 'PDF',
        fileSizeBytes: 4194304,
        fileHashSha256: 'feedfractionation_hash_123',
        equipmentTags: ['P-501-A', 'V-501', 'HE-502', 'FCV-501'],
      });

    expect(createDwgRes.status).toBe(201);
    expect(createDwgRes.body.success).toBe(true);
    const drawingId = createDwgRes.body.data.id;

    // View drawing
    const viewDwgRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(viewDwgRes.status).toBe(200);
    expect(viewDwgRes.body.data.uniqueDrawingNumber).toBe('DWG-HT-2026-P01');
    expect(viewDwgRes.body.data.equipmentTags).toContain('P-501-A');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 4: Provenance, revisions, and approval history
  // --------------------------------------------------------------------------
  it('4. Preserves traceability of provenance, uploader, revision, and approval history', async () => {
    // 1. Upload model in NEEDS_REVIEW
    const uploadRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Gas Turbine Exhaust Diffuser 3D',
        industryProfileCode: 'POWER_UTILITIES',
        assetCategory: 'Gas Turbines',
        fileFormat: 'GLB',
        fileSizeBytes: 3145728,
        fileHashSha256: 'gt_exhaust_diffuser_hash',
        storageKey: 'models/gt_exhaust.glb',
        modelRevision: '1.0',
      });
    expect(uploadRes.status).toBe(201);
    const modelId = uploadRes.body.data.id;
    expect(uploadRes.body.data.uploadedByUserId).toBe(adminUserId);

    // 2. Admin reviews and approves
    const reviewRes = await request(app)
      .post(`/api/v1/engineering/models/${modelId}/review`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        status: 'APPROVED',
        reviewNotes: 'Verified against Siemens OEM engineering specs.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');
    expect(reviewRes.body.data.reviewedByUserId).toBe(adminUserId);
    expect(reviewRes.body.data.reviewedAt).toBeDefined();
    expect(reviewRes.body.data.reviewNotes).toBe('Verified against Siemens OEM engineering specs.');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 5: Verified model and drawing link to the correct asset
  // --------------------------------------------------------------------------
  it('5. Links verified model and drawing to machine asset, bumping machine revision', async () => {
    // 1. Create machine
    const machRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'TURB-901',
        name: 'Combined Cycle Gas Turbine',
        machineType: 'Gas Turbine',
      });
    const machineId = machRes.body.data.id;
    expect(machRes.body.data.revision).toBe(1);

    // 2. Upload CAD model
    const modelRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId,
        title: 'Turbine Rotor and Casing Assembly',
        fileFormat: 'GLB',
        fileSizeBytes: 8192000,
        fileHashSha256: 'turbine_hash_901',
        storageKey: 'models/turb_901.glb',
      });
    const modelId = modelRes.body.data.id;

    // 3. Approve model
    await request(app)
      .post(`/api/v1/engineering/models/${modelId}/review`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({ status: 'APPROVED' });

    // 4. Verify machine asset reflects 3D model and incremented revision
    const machCheck1 = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(machCheck1.body.data.hasModel3d).toBe(true);
    expect(machCheck1.body.data.model3dStorageKey).toBe('models/turb_901.glb');
    expect(machCheck1.body.data.revision).toBe(2);

    // 5. Upload P&ID Drawing and approve
    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId,
        drawingTitle: 'Turbine Fuel Gas Supply P&ID',
        uniqueDrawingNumber: 'DWG-TURB-901-PID',
        drawingType: 'PID',
        discipline: 'Mechanical',
        storageKey: 'drawings/turb_901_pid.pdf',
        fileFormat: 'PDF',
        fileSizeBytes: 204800,
      });
    const drawingId = dwgRes.body.data.id;

    await request(app)
      .post(`/api/v1/engineering/drawings/${drawingId}/review`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({ status: 'APPROVED' });

    // 6. Verify machine asset reflects P&ID and another revision bump
    const machCheck2 = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(machCheck2.body.data.hasPidDiagram).toBe(true);
    expect(machCheck2.body.data.pidStorageKey).toBe('drawings/turb_901_pid.pdf');
    expect(machCheck2.body.data.revision).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 6: Unsupported files and failed conversions produce honest errors
  // --------------------------------------------------------------------------
  it('6. Produces honest errors for unsupported formats and corrupted/empty CAD files without fake previews', async () => {
    // 1. Unsupported file format (.exe or .docx as CAD)
    const badFormatRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Fake CAD File',
        fileFormat: 'EXE',
        fileSizeBytes: 1024,
        fileHashSha256: 'bad_hash',
        storageKey: 'models/malicious.exe',
      });

    expect(badFormatRes.status).toBe(400);
    expect(badFormatRes.body.error.code).toBe('FORGEX_UNSUPPORTED_FORMAT');

    // 2. Empty / corrupt CAD file (size 0)
    const emptyFileRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Corrupted CAD Payload',
        fileFormat: 'STEP',
        fileSizeBytes: 0,
        fileHashSha256: 'empty_hash',
        storageKey: 'models/corrupted.step',
      });

    expect(emptyFileRes.status).toBe(201);
    expect(emptyFileRes.body.data.status).toBe('PROCESSING_FAILED');
    expect(emptyFileRes.body.data.errorMessage).toContain('Empty or corrupted CAD geometry');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 7: Custom industry profiles work without code changes
  // --------------------------------------------------------------------------
  it('7. Enables administrators to define custom industry profiles and metadata without code changes', async () => {
    const customProfileRes = await request(app)
      .post('/api/v1/engineering/industry-profiles')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        code: 'SEMICONDUCTOR_FAB_EQUIPMENT',
        name: 'Semiconductor Wafer Fabrication Facilities',
        description: 'Sub-nanometer photolithography steppers, plasma etchers, and chemical mechanical planarization tools.',
        assetCategories: ['EUV Steppers', 'Dry Etchers', 'CMP Polishers', 'Ion Implanters'],
        terminology: {
          tagLabel: 'Tool ID / SECS-GEM Node',
          assetLabel: 'Wafer Tool',
          plantLabel: 'Fab Facility',
          lineLabel: 'Cleanroom Bay',
        },
        drawingTypes: ['Gas Delivery P&ID', 'Exhaust Schematic', 'Cleanroom Layout', 'Interlock Wiring'],
        customFields: [
          { id: 'f_wafer_nm', name: 'processNodeNm', label: 'Process Node (nm)', type: 'number', required: true, unit: 'nm' },
          { id: 'f_vacuum_torr', name: 'baseVacuumTorr', label: 'Base Vacuum (Torr)', type: 'number', required: false, unit: 'Torr' },
        ],
        standardCertifications: ['SEMI S2', 'SEMI S8', 'ISO 14644-1 Class 1'],
      });

    expect(customProfileRes.status).toBe(201);
    expect(customProfileRes.body.success).toBe(true);
    expect(customProfileRes.body.data.code).toBe('SEMICONDUCTOR_FAB_EQUIPMENT');
    expect(customProfileRes.body.data.isCustom).toBe(true);
    expect(customProfileRes.body.data.terminology.assetLabel).toBe('Wafer Tool');

    // Fetch the custom profile
    const getProfileRes = await request(app)
      .get('/api/v1/engineering/industry-profiles/SEMICONDUCTOR_FAB_EQUIPMENT')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(getProfileRes.status).toBe(200);
    expect(getProfileRes.body.data.assetCategories).toContain('EUV Steppers');
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 8: Core workflows work across multiple industries
  // --------------------------------------------------------------------------
  it('8. Supports core workflows across multiple distinct industries (Pharma, Automotive, Mining)', async () => {
    // 1. Pharma Bioreactor
    const pharmaRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'BIO-1000L',
        name: 'Single-Use Perfusion Bioreactor 1000L',
        machineType: 'Bioreactor Skid',
        manufacturer: 'Sartorius Stedim',
        modelNumber: 'BIOSTAT STR 1000',
        criticality: 'HIGH',
      });
    expect(pharmaRes.status).toBe(201);

    // 2. Automotive Robot
    const autoRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'ROB-WELD-04',
        name: 'Body-in-White Spot Welding Robot',
        machineType: 'Industrial Articulated Robot',
        manufacturer: 'FANUC Robotics',
        modelNumber: 'M-900iB/700',
        criticality: 'CRITICAL',
      });
    expect(autoRes.status).toBe(201);

    // 3. Mining Crusher
    const miningRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        assetTag: 'CRUSH-PRIMARY-01',
        name: 'Gyratory Primary Ore Crusher',
        machineType: 'Gyratory Crusher',
        manufacturer: 'Metso Outotec',
        modelNumber: 'Superior MKIII 60-89',
        criticality: 'MISSION_CRITICAL',
      });
    expect(miningRes.status).toBe(201);

    // List all machines
    const listRes = await request(app)
      .get('/api/v1/machines')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(listRes.body.data.length).toBeGreaterThanOrEqual(3);
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 9: Tenant isolation for private engineering assets
  // --------------------------------------------------------------------------
  it('9. Enforces strict tenant isolation preventing Org B from accessing Org A engineering assets', async () => {
    // Org A admin registers a confidential 3D model
    const createModelRes = await request(app)
      .post('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Confidential Proprietary Hydrocracker Reactor 3D',
        fileFormat: 'GLB',
        fileSizeBytes: 10485760,
        fileHashSha256: 'valero_secret_reactor_hash',
        storageKey: 'models/valero/confidential_reactor.glb',
        dataClassification: 'RESTRICTED',
      });
    expect(createModelRes.status).toBe(201);
    const orgAModelId = createModelRes.body.data.id;

    // Org B admin attempts to read Org A's model
    const crossTenantGetRes = await request(app)
      .get(`/api/v1/engineering/models/${orgAModelId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', testOrgBId);

    expect(crossTenantGetRes.status).toBe(404);
    expect(crossTenantGetRes.body.error.code).toBe('FORGEX_MODEL_NOT_FOUND');

    // Org B admin attempts to download Org A's model
    const crossTenantDownloadRes = await request(app)
      .get(`/api/v1/engineering/models/${orgAModelId}/download`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', testOrgBId);

    expect(crossTenantDownloadRes.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // Acceptance Criterion 10: Manufacturer resources and verification workflow
  // --------------------------------------------------------------------------
  it('10. Validates official manufacturer resource registration and verification workflow', async () => {
    // 1. Invalid URL scheme (e.g. ftp:// or javascript:) rejected
    const badUrlRes = await request(app)
      .post('/api/v1/engineering/manufacturer-resources')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Malicious Resource',
        manufacturer: 'Acme Corp',
        resourceType: 'OFFICIAL_MANUAL',
        sourceType: 'OFFICIAL_URL',
        sourceUrl: 'javascript:alert(1)',
      });

    expect(badUrlRes.status).toBe(400);
    expect(badUrlRes.body.error.code).toBe('FORGEX_INVALID_URL');

    // 2. Legitimate manufacturer datasheet registered
    const validRes = await request(app)
      .post('/api/v1/engineering/manufacturer-resources')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        title: 'Siemens S7-1500 Advanced Controller Technical Manual',
        manufacturer: 'Siemens AG',
        modelNumber: 'CPU 1518-4 PN/DP',
        resourceType: 'OFFICIAL_MANUAL',
        sourceType: 'OFFICIAL_URL',
        sourceUrl: 'https://support.industry.siemens.com/cs/document/109741593/s7-1500-manual.pdf',
        versionRevision: 'Release 2026.1',
      });

    expect(validRes.status).toBe(201);
    expect(validRes.body.data.verificationStatus).toBe('UNVERIFIED');
    const resourceId = validRes.body.data.id;

    // 3. Admin verifies resource
    const verifyRes = await request(app)
      .post(`/api/v1/engineering/manufacturer-resources/${resourceId}/verify`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        verificationStatus: 'VERIFIED',
        reviewNotes: 'Verified official digital signature from Siemens Industry Online Support.',
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verificationStatus).toBe('VERIFIED');
    expect(verifyRes.body.data.verifiedByUserId).toBe(adminUserId);

    // 4. Check Engineering Asset Center Summary
    const summaryRes = await request(app)
      .get('/api/v1/engineering/summary')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.totalManufacturerResources).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.data.supportedFormats.cad).toContain('GLB');
    expect(summaryRes.body.data.supportedFormats.drawings).toContain('PDF');
  });
});

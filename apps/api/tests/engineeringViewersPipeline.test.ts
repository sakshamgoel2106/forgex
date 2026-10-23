import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';
import { isValidGlbHeader } from '../src/utils/glbBuilder.js';

describe('Phase 2 & Phase 3: Engineering 3D CAD & P&ID PDF Pipeline Integration Tests', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let storageAdapter: LocalStorageAdapter;
  let authAdapter: LocalDevAuthAdapter;

  let ownerToken: string;
  let technicianToken: string;
  let unauthorizedViewerToken: string;
  let tenantBToken: string;

  let testOrgId: string;
  let tenantBOrgId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    storageAdapter = new LocalStorageAdapter();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({ dataStore, authAdapter, storageAdapter });

    await bootstrapInitialData(dataStore, storageAdapter);

    // Setup Org A
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Primary Industrial Facility',
        organizationSlug: 'primary-facility',
        adminEmail: 'lead.owner@primaryfacility.com',
        adminFullName: 'Chief Plant Engineer',
      });
    expect(regResA.status).toBe(201);
    ownerToken = regResA.body.data.token;
    testOrgId = regResA.body.data.organization.id;

    // Create Technician User in Org A
    const techUser = await dataStore.createUser({
      externalAuthId: 'tech-user-01',
      email: 'tech.mike@primaryfacility.com',
      fullName: 'Mike Field Technician',
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

    // Create Read-only Viewer User in Org A (unauthorized for engineering CAD)
    const viewUser = await dataStore.createUser({
      externalAuthId: 'view-user-02',
      email: 'viewer.bob@primaryfacility.com',
      fullName: 'Bob Guest Viewer',
    });
    await dataStore.createMembership({
      organizationId: testOrgId,
      userId: viewUser.id,
      role: 'VIEWER',
      status: 'ACTIVE',
    });
    unauthorizedViewerToken = LocalDevAuthAdapter.generateDevToken(
      { id: viewUser.externalAuthId, email: viewUser.email, fullName: viewUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // Setup Org B (Isolated Competitor Facility)
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Competitor Corp',
        organizationSlug: 'competitor-corp',
        adminEmail: 'admin@competitorcorp.com',
        adminFullName: 'Competitor Admin',
      });
    expect(regResB.status).toBe(201);
    tenantBToken = regResB.body.data.token;
    tenantBOrgId = regResB.body.data.organization.id;
  });

  describe('3D CAD STEP Pipeline & Genuine Conversion', () => {
    it('successfully processes real STEP model, performs CAD conversion to GLB, and streams model/gltf-binary', async () => {
      // Create registered machine with real STEP model reference
      const machine = await dataStore.createMachine(testOrgId, {
        plantId: 'PLANT-TX-04',
        name: 'Centrifugal Feed Pump',
        assetTag: 'PUMP-001',
        machineType: 'Rotating Equipment',
        manufacturer: 'Lowara',
        modelNumber: '3SV08FL007T',
        serialNumber: 'SN-PUMP-001-TEST',
        hasModel3d: true,
        model3dFormat: 'stp',
        model3dStorageKey: 'models/3sv08fl007t-d_a_3d.stp',
        technicalSpecs: {
          model3dFileName: '3sv08fl007t-d_a_3d.stp',
          model3dFileSize: 4085657,
        },
      });

      // 1. Dedicated machine endpoint resolves primaryModel
      const machRes = await request(app)
        .get(`/api/v1/engineering/machines/${machine.id}/3d-model`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(machRes.status).toBe(200);
      expect(machRes.body.success).toBe(true);
      expect(machRes.body.data.primaryModel).toBeDefined();
      const primaryModel = machRes.body.data.primaryModel;
      expect(primaryModel.title).toContain('3sv08fl007t-d_a_3d.stp');

      // 2. Fetch binary content triggers real on-demand CAD conversion
      const contentRes = await request(app)
        .get(`/api/v1/engineering/models/${primaryModel.id}/content`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(contentRes.status).toBe(200);
      expect(contentRes.headers['content-type']).toBe('model/gltf-binary');
      expect(contentRes.headers['x-forgex-model-format']).toBe('STP');
      expect(contentRes.body).toBeDefined();

      const buffer = Buffer.from(contentRes.body);
      expect(buffer.length).toBeGreaterThan(100000); // Converted GLB is >1MB
      expect(isValidGlbHeader(buffer)).toBe(true);

      // Verify header magic: 0x46546C67 ('glTF')
      const magic = buffer.readUInt32LE(0);
      expect(magic).toBe(0x46546c67);
    }, 90000);

    it('denies cross-tenant access to private 3D models', async () => {
      const machine = await dataStore.createMachine(testOrgId, {
        plantId: 'PLANT-TX-04',
        name: 'Centrifugal Feed Pump',
        assetTag: 'PUMP-001',
        machineType: 'Rotating Equipment',
        hasModel3d: true,
        model3dFormat: 'stp',
        model3dStorageKey: 'models/3sv08fl007t-d_a_3d.stp',
      });

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-TX-04',
        machineId: machine.id,
        industryProfileCode: 'GENERAL',
        assetCategory: 'MACHINERY',
        title: '3sv08fl007t-d_a_3d.stp',
        fileHashSha256: 'test_hash',
        storageKey: 'models/3sv08fl007t-d_a_3d.stp',
        fileFormat: 'STP',
        fileSizeBytes: 4085657,
        status: 'APPROVED',
        uploadedByUserId: 'usr_1',
      });

      // Attempt access with Tenant B token
      const res = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_MODEL_NOT_FOUND');
    });

    it('returns 404 with clear error when model storage object does not exist', async () => {
      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-TX-04',
        industryProfileCode: 'GENERAL',
        assetCategory: 'MACHINERY',
        title: 'non_existent.stp',
        fileHashSha256: 'none',
        storageKey: 'models/definitely_missing_file_xyz_999.stp',
        fileFormat: 'STP',
        fileSizeBytes: 1024,
        status: 'APPROVED',
        uploadedByUserId: 'usr_1',
      });

      const res = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect([404, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  describe('P&ID PDF Pipeline & Drawing Retrieval', () => {
    it('successfully retrieves actual P&ID PDF drawing bytes with application/pdf header', async () => {
      const machine = await dataStore.createMachine(testOrgId, {
        plantId: 'PLANT-TX-04',
        name: 'Centrifugal Feed Pump',
        assetTag: 'PUMP-001',
        machineType: 'Rotating Equipment',
        hasPidDiagram: true,
        pidStorageKey: 'schematics/462-Piping-and-Instrumentation-Diagrams.pdf',
        technicalSpecs: {
          pidFileName: '462-Piping-and-Instrumentation-Diagrams.pdf',
          pidFileSize: 3136182,
        },
      });

      // 1. Dedicated machine endpoint resolves primaryDrawing
      const machRes = await request(app)
        .get(`/api/v1/engineering/machines/${machine.id}/pid`)
        .set('Authorization', `Bearer ${technicianToken}`);

      expect(machRes.status).toBe(200);
      expect(machRes.body.success).toBe(true);
      expect(machRes.body.data.primaryDrawing).toBeDefined();
      const primaryDrawing = machRes.body.data.primaryDrawing;
      expect(primaryDrawing.drawingTitle).toContain('462-Piping-and-Instrumentation-Diagrams.pdf');
      expect(primaryDrawing.fileFormat).toBe('PDF');

      // 2. Fetch PDF content streams authentic PDF binary bytes
      const contentRes = await request(app)
        .get(`/api/v1/engineering/drawings/${primaryDrawing.id}/content`)
        .set('Authorization', `Bearer ${technicianToken}`);

      expect(contentRes.status).toBe(200);
      expect(contentRes.headers['content-type']).toBe('application/pdf');
      expect(contentRes.headers['content-disposition']).toContain('inline');

      const buffer = Buffer.from(contentRes.body);
      expect(buffer.length).toBe(3136182); // Exact size of real engineering P&ID PDF

      // Verify PDF Magic Bytes: "%PDF-"
      const magic = buffer.subarray(0, 5).toString('ascii');
      expect(magic).toBe('%PDF-');
    });

    it('denies access to engineering drawings for unprivileged roles', async () => {
      const dwg = await dataStore.createEngineeringDrawing(testOrgId, {
        plantId: 'PLANT-TX-04',
        drawingTitle: 'Process Diagram',
        uniqueDrawingNumber: 'PID-SEC-01',
        drawingType: 'PID',
        discipline: 'Process',
        storageKey: 'schematics/462-Piping-and-Instrumentation-Diagrams.pdf',
        originalFileName: '462-Piping-and-Instrumentation-Diagrams.pdf',
        fileFormat: 'PDF',
        fileSizeBytes: 3136182,
        fileHashSha256: 'test_hash',
        uploadedByUserId: 'usr_1',
      });

      const res = await request(app)
        .get(`/api/v1/engineering/drawings/${dwg.id}/content`)
        .set('Authorization', `Bearer ${unauthorizedViewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('denies cross-tenant drawing access', async () => {
      const dwg = await dataStore.createEngineeringDrawing(testOrgId, {
        plantId: 'PLANT-TX-04',
        drawingTitle: 'Plant Confidential P&ID',
        uniqueDrawingNumber: 'PID-CONF-01',
        drawingType: 'PID',
        discipline: 'Process',
        storageKey: 'schematics/462-Piping-and-Instrumentation-Diagrams.pdf',
        originalFileName: '462-Piping-and-Instrumentation-Diagrams.pdf',
        fileFormat: 'PDF',
        fileSizeBytes: 3136182,
        fileHashSha256: 'test_hash',
        uploadedByUserId: 'usr_1',
      });

      const res = await request(app)
        .get(`/api/v1/engineering/drawings/${dwg.id}/content`)
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_DRAWING_NOT_FOUND');
    });

    it('supports backward-compatible resolution for legacy local- prefixed identifiers', async () => {
      const machine = await dataStore.createMachine(testOrgId, {
        plantId: 'PLANT-TX-04',
        name: 'Centrifugal Feed Pump',
        assetTag: 'PUMP-001',
        machineType: 'Rotating Equipment',
        hasPidDiagram: true,
        pidStorageKey: 'schematics/462-Piping-and-Instrumentation-Diagrams.pdf',
        technicalSpecs: {
          pidFileName: '462-Piping-and-Instrumentation-Diagrams.pdf',
          pidFileSize: 3136182,
        },
      });

      // Calling /drawings/local-pid-PUMP-001/content resolves the machine drawing seamlessly
      const res = await request(app)
        .get(`/api/v1/engineering/drawings/local-pid-${machine.assetTag}/content`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      const buffer = Buffer.from(res.body);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});

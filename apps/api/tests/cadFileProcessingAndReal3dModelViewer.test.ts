import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';
import type { IStorageAdapter, StoragePutResult } from '../src/storage/storage.interface.js';
import { buildIndustrialPumpGlb, isValidGlbHeader } from '../src/utils/glbBuilder.js';

class MockStorageAdapter implements IStorageAdapter {
  private files = new Map<string, { buffer: Buffer; contentType: string }>();

  public async putObject(key: string, data: Buffer, contentType: string): Promise<StoragePutResult> {
    this.files.set(key, { buffer: data, contentType });
    const checksumSha256 = crypto.createHash('sha256').update(data).digest('hex');
    return { storageKey: key, sizeBytes: data.length, checksumSha256 };
  }

  public async getObject(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) throw new Error(`Storage object not found: '${key}'`);
    return file.buffer;
  }

  public async deleteObject(key: string): Promise<void> {
    this.files.delete(key);
  }

  public async getSignedUrl(key: string): Promise<string> {
    return `/api/v1/engineering/storage-proxy?key=${encodeURIComponent(key)}`;
  }
}

describe('Prompt 19: CAD File Processing & Real 3D Industrial Model Viewer', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let storageAdapter: MockStorageAdapter;
  let authAdapter: LocalDevAuthAdapter;

  let orgAdminToken: string;
  let engineerToken: string;
  let technicianToken: string;
  let viewerToken: string;
  let orgBAdminToken: string;

  let testOrgId: string;
  let testOrgBId: string;
  let adminUserId: string;
  let testMachineId: string;
  let machineWithoutModelId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    storageAdapter = new MockStorageAdapter();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({ dataStore, authAdapter, storageAdapter });

    await bootstrapInitialData(dataStore, storageAdapter);

    // Setup Org A (Primary Petrochemical Facility)
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Gulf Coast Petrochem Corp',
        organizationSlug: 'gulf-coast-petro',
        adminEmail: 'lead.engineer@gulfcoast.com',
        adminFullName: 'Sarah Connor',
      });
    expect(regResA.status).toBe(201);
    orgAdminToken = regResA.body.data.token;
    testOrgId = regResA.body.data.organization.id;
    adminUserId = regResA.body.data.user.id;

    // Create Engineer User in Org A
    const engUser = await dataStore.createUser({
      externalAuthId: 'eng-sarah-02',
      email: 'engineer.dave@gulfcoast.com',
      fullName: 'Dave CAD Engineer',
    });
    await dataStore.createMembership({
      organizationId: testOrgId,
      userId: engUser.id,
      role: 'ENGINEER',
      status: 'ACTIVE',
    });
    engineerToken = LocalDevAuthAdapter.generateDevToken(
      { id: engUser.externalAuthId, email: engUser.email, fullName: engUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // Create Technician User in Org A
    const techUser = await dataStore.createUser({
      externalAuthId: 'tech-dave-03',
      email: 'tech.mike@gulfcoast.com',
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

    // Create Read-only Viewer User in Org A
    const viewUser = await dataStore.createUser({
      externalAuthId: 'view-user-04',
      email: 'viewer@gulfcoast.com',
      fullName: 'Viewer Bob',
    });
    await dataStore.createMembership({
      organizationId: testOrgId,
      userId: viewUser.id,
      role: 'VIEWER',
      status: 'ACTIVE',
    });
    viewerToken = LocalDevAuthAdapter.generateDevToken(
      { id: viewUser.externalAuthId, email: viewUser.email, fullName: viewUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // Setup Org B (Isolated Rival Plant for Tenant Boundary Testing)
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Midwest Refining LLC',
        organizationSlug: 'midwest-refining',
        adminEmail: 'admin@midwestrefining.com',
        adminFullName: 'Donald Sterling',
      });
    expect(regResB.status).toBe(201);
    orgBAdminToken = regResB.body.data.token;
    testOrgBId = regResB.body.data.organization.id;

    // Seed Plant and Machines for Org A
    const plant = await dataStore.createPlant(testOrgId, {
      name: 'Pasadena Chemical Complex',
      code: 'PAS-01',
      city: 'Pasadena',
      stateOrProvince: 'TX',
      country: 'USA',
    });

    const machine1 = await dataStore.createMachine(testOrgId, {
      plantId: plant.id,
      assetTag: 'PUMP-801-A',
      name: 'High Pressure Heavy Naphtha Charge Pump',
      machineType: 'Centrifugal Pump',
      area: 'Hydrotreater Unit 1',
      manufacturer: 'Sulzer Pumps',
      modelNumber: 'OH2-150-400',
      serialNumber: 'SZ-OH2-88192',
      operationalState: 'OPTIMAL',
      criticality: 'CRITICAL',
      dataClassification: 'CONFIDENTIAL',
      hasModel3d: true,
      hasPidDiagram: true,
    });
    testMachineId = machine1.id;

    const machine2 = await dataStore.createMachine(testOrgId, {
      plantId: plant.id,
      assetTag: 'VALVE-902-B',
      name: 'Emergency Shutdown Ball Valve',
      machineType: 'Quarter Turn Valve',
      area: 'Feed Line',
      operationalState: 'OPTIMAL',
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
      hasModel3d: false,
      hasPidDiagram: false,
    });
    machineWithoutModelId = machine2.id;
  });

  describe('Section 1: GLB Builder and Header Validation Utility', () => {
    it('generates a valid binary glTF 2.0 (GLB) buffer with correct 12-byte header', () => {
      const glbBuffer = buildIndustrialPumpGlb();
      expect(glbBuffer).toBeDefined();
      expect(glbBuffer.length).toBeGreaterThan(100);

      // Verify 12-byte header
      const magic = glbBuffer.readUInt32LE(0);
      const version = glbBuffer.readUInt32LE(4);
      const length = glbBuffer.readUInt32LE(8);

      expect(magic).toBe(0x46546c67); // "glTF" in ASCII little-endian
      expect(version).toBe(2);
      expect(length).toBe(glbBuffer.length);
      expect(isValidGlbHeader(glbBuffer)).toBe(true);
    });

    it('rejects truncated, corrupted, or non-GLB buffers', () => {
      expect(isValidGlbHeader(Buffer.alloc(0))).toBe(false);
      expect(isValidGlbHeader(Buffer.alloc(8))).toBe(false);
      expect(isValidGlbHeader(Buffer.from('NOT_A_GLB_FILE_AT_ALL_JUST_TEXT'))).toBe(false);

      const fakeHeader = Buffer.alloc(12);
      fakeHeader.writeUInt32LE(0x46546c67, 0); // valid magic
      fakeHeader.writeUInt32LE(1, 4);          // invalid version (1 instead of 2)
      fakeHeader.writeUInt32LE(12, 8);
      expect(isValidGlbHeader(fakeHeader)).toBe(false);
    });
  });

  describe('Section 2: Valid Supported 3D Model Streaming & Rendering API', () => {
    it('streams a genuine verified GLB model binary with proper content headers', async () => {
      // 1. Put valid GLB into storage
      const glbBuffer = buildIndustrialPumpGlb();
      const storageKey = 'models/pump_801_a.glb';
      await storageAdapter.putObject(storageKey, glbBuffer, 'model/gltf-binary');

      // 2. Register model in database
      const regModelRes = await request(app)
        .post('/api/v1/engineering/models')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          machineId: testMachineId,
          title: 'Sulzer OH2 Heavy Naphtha Charge Pump 3D Assembly',
          fileFormat: 'GLB',
          fileSizeBytes: glbBuffer.length,
          fileHashSha256: crypto.createHash('sha256').update(glbBuffer).digest('hex'),
          storageKey,
          dataClassification: 'CONFIDENTIAL',
        });
      expect(regModelRes.status).toBe(201);
      const modelId = regModelRes.body.data.id;

      // 3. Stream model content
      const contentRes = await request(app)
        .get(`/api/v1/engineering/models/${modelId}/content`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(contentRes.status).toBe(200);
      expect(contentRes.headers['content-type']).toContain('model/gltf-binary');
      expect(contentRes.headers['x-content-type-options']).toBe('nosniff');
      expect(contentRes.headers['x-forgex-model-format']).toBe('GLB');
      expect(Buffer.isBuffer(contentRes.body)).toBe(true);

      // Validate downloaded binary is valid GLB
      expect(isValidGlbHeader(contentRes.body)).toBe(true);
    });

    it('allows engineers and technicians to stream 3D models for field visualization', async () => {
      const glbBuffer = buildIndustrialPumpGlb();
      const storageKey = 'models/pump_field_viz.glb';
      await storageAdapter.putObject(storageKey, glbBuffer, 'model/gltf-binary');

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Field Inspection Pump Model',
        fileFormat: 'GLB',
        fileSizeBytes: glbBuffer.length,
        fileHashSha256: 'hash-field-123',
        storageKey,
        uploadedByUserId: adminUserId,
      });

      // Engineer access
      const engRes = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${engineerToken}`);
      expect(engRes.status).toBe(200);

      // Technician access
      const techRes = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${technicianToken}`);
      expect(techRes.status).toBe(200);
    });
  });

  describe('Section 3: Machine-to-Model Association & Honest Empty States', () => {
    it('retrieves the associated 3D model and component mappings for an industrial machine', async () => {
      const glbBuffer = buildIndustrialPumpGlb();
      const storageKey = 'models/pump_assoc.glb';
      await storageAdapter.putObject(storageKey, glbBuffer, 'model/gltf-binary');

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Sulzer Associated 3D Model',
        fileFormat: 'GLB',
        fileSizeBytes: glbBuffer.length,
        fileHashSha256: 'hash-assoc-123',
        storageKey,
        status: 'APPROVED',
        uploadedByUserId: adminUserId,
      });

      // Create a component mapping
      await dataStore.createComponentMapping(testOrgId, {
        machineId: testMachineId,
        componentId: 'P-204-IMP',
        componentName: 'Primary Impeller Assembly',
        pidTag: 'P-204-IMP',
        status: 'VERIFIED',
      });

      const res = await request(app)
        .get(`/api/v1/engineering/machines/${testMachineId}/3d-model`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.machine.id).toBe(testMachineId);
      expect(res.body.data.machine.assetTag).toBe('PUMP-801-A');
      expect(res.body.data.primaryModel.id).toBe(model.id);
      expect(res.body.data.contentUrl).toBe(`/api/v1/engineering/models/${model.id}/content`);
      expect(res.body.data.mappings.length).toBeGreaterThan(0);
      expect(res.body.data.mappings[0].pidTag).toBe('P-204-IMP');
    });

    it('returns an honest empty state without fabricating fake 3D geometry when no model is registered', async () => {
      const res = await request(app)
        .get(`/api/v1/engineering/machines/${machineWithoutModelId}/3d-model`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.machine.id).toBe(machineWithoutModelId);
      expect(res.body.data.primaryModel).toBeNull();
      expect(res.body.data.contentUrl).toBeNull();
      expect(res.body.data.allModels).toEqual([]);
    });

    it('returns 404 for a non-existent machine ID', async () => {
      const res = await request(app)
        .get('/api/v1/engineering/machines/NON-EXISTENT-MACHINE/3d-model')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FORGEX_MACHINE_NOT_FOUND');
    });
  });

  describe('Section 4: Corrupted, Empty, and Unsupported CAD Formats Handling', () => {
    it('safely rejects an empty (0 bytes) 3D model with 400 FORGEX_CORRUPTED_FILE', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const storageKey = 'models/empty_model.glb';
      await storageAdapter.putObject(storageKey, emptyBuffer, 'model/gltf-binary');

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Empty Pump Model',
        fileFormat: 'GLB',
        fileSizeBytes: 0,
        fileHashSha256: 'empty-sha',
        storageKey,
        uploadedByUserId: adminUserId,
      });

      const res = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FORGEX_CORRUPTED_FILE');
      expect(res.body.error.message).toMatch(/empty|corrupted/i);
    });

    it('safely rejects a corrupted GLB with invalid magic bytes with 400 FORGEX_CORRUPTED_FILE', async () => {
      const corruptBuffer = Buffer.from('CORRUPTED_NON_GLTF_DATA_BUFFER_CONTENTS_EXCEEDING_TWELVE_BYTES');
      const storageKey = 'models/corrupted_magic.glb';
      await storageAdapter.putObject(storageKey, corruptBuffer, 'model/gltf-binary');

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Corrupted Magic Pump Model',
        fileFormat: 'GLB',
        fileSizeBytes: corruptBuffer.length,
        fileHashSha256: 'corrupt-sha',
        storageKey,
        uploadedByUserId: adminUserId,
      });

      const res = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FORGEX_CORRUPTED_FILE');
      expect(res.body.error.message).toMatch(/invalid header magic|glTF version/i);
    });

    it('returns 422 FORGEX_UNSUPPORTED_RENDER_FORMAT for raw B-Rep STEP/IGES CAD files without conversion', async () => {
      const stepData = Buffer.from('ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'STEP AP214\'),\'1\');\nENDSEC;\nEND-ISO-10303-21;');
      const storageKey = 'models/compressor_casing.step';
      await storageAdapter.putObject(storageKey, stepData, 'application/step');

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Compressor Casing STEP Model',
        fileFormat: 'STEP',
        fileSizeBytes: stepData.length,
        fileHashSha256: 'step-sha',
        storageKey,
        uploadedByUserId: adminUserId,
      });

      const res = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FORGEX_UNSUPPORTED_RENDER_FORMAT');
      expect(res.body.error.fileFormat).toBe('STEP');
      expect(res.body.error.downloadUrl).toBe(`/api/v1/engineering/models/${model.id}/download`);
    });
  });

  describe('Section 5: Security, RBAC, and Cross-Tenant Isolation', () => {
    it('enforces RBAC and rejects unprivileged viewer role from streaming 3D model content', async () => {
      const glbBuffer = buildIndustrialPumpGlb();
      const storageKey = 'models/confidential_pump.glb';
      await storageAdapter.putObject(storageKey, glbBuffer, 'model/gltf-binary');

      const model = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Confidential OEM Pump',
        fileFormat: 'GLB',
        fileSizeBytes: glbBuffer.length,
        fileHashSha256: 'conf-sha',
        storageKey,
        dataClassification: 'RESTRICTED',
        uploadedByUserId: adminUserId,
      });

      const res = await request(app)
        .get(`/api/v1/engineering/models/${model.id}/content`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('rejects unauthenticated requests to stream 3D models with 401', async () => {
      const res = await request(app).get('/api/v1/engineering/models/SOME-MODEL-ID/content');
      expect(res.status).toBe(401);
    });

    it('strictly enforces tenant isolation: Org B cannot access or stream Org A models', async () => {
      const glbBuffer = buildIndustrialPumpGlb();
      const storageKey = 'models/org_a_private.glb';
      await storageAdapter.putObject(storageKey, glbBuffer, 'model/gltf-binary');

      const modelOrgA = await dataStore.createEngineeringModel3D(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Org A Proprietary Pump',
        fileFormat: 'GLB',
        fileSizeBytes: glbBuffer.length,
        fileHashSha256: 'org-a-sha',
        storageKey,
        uploadedByUserId: adminUserId,
      });

      // Attempt access with Org B admin token
      const res = await request(app)
        .get(`/api/v1/engineering/models/${modelOrgA.id}/content`)
        .set('Authorization', `Bearer ${orgBAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FORGEX_MODEL_NOT_FOUND');
    });
  });

  describe('Section 6: Preservation of P&ID Engineering View Integration', () => {
    it('verifies that P&ID schematic endpoints and component linkages remain completely intact and unaffected', async () => {
      const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#fff"/><circle cx="400" cy="300" r="50" fill="#0284c7"/></svg>`;
      const svgKey = 'schematics/pump_801_pid.svg';
      await storageAdapter.putObject(svgKey, Buffer.from(sampleSvg), 'image/svg+xml');

      const dwg = await dataStore.createEngineeringDrawing(testOrgId, {
        plantId: 'PLANT-DEFAULT',
        machineId: testMachineId,
        drawingTitle: 'PUMP-801-A Process & Instrumentation Diagram',
        uniqueDrawingNumber: 'DWG-PID-801-01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        revision: 'Rev 2.0',
        storageKey: svgKey,
        fileFormat: 'SVG',
        fileSizeBytes: sampleSvg.length,
        fileHashSha256: 'svg-sha-801',
        status: 'APPROVED',
        equipmentTags: ['P-204-IMP', 'P-204-SEAL'],
        uploadedByUserId: adminUserId,
      });

      // 1. Check machine P&ID endpoint
      const pidRes = await request(app)
        .get(`/api/v1/engineering/machines/${testMachineId}/pid`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(pidRes.status).toBe(200);
      expect(pidRes.body.success).toBe(true);
      expect(pidRes.body.data.primaryDrawing.id).toBe(dwg.id);

      // 2. Check P&ID content streaming
      const contentRes = await request(app)
        .get(`/api/v1/engineering/drawings/${dwg.id}/content`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(contentRes.status).toBe(200);
      expect(contentRes.headers['content-type']).toContain('image/svg+xml');
    });
  });
});

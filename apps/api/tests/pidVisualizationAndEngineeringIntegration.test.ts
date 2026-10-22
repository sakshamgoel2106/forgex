import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';
import type { IStorageAdapter, StoragePutResult } from '../src/storage/storage.interface.js';
import { SvgSanitizer } from '../src/utils/svgSanitizer.js';

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

describe('Prompt 18: P&ID Visualization & Engineering View Integration', () => {
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
        organizationName: 'Deer Park Refining Co',
        organizationSlug: 'deer-park-refining',
        adminEmail: 'chief.engineer@deerpark.com',
        adminFullName: 'Marcus Vance',
      });
    expect(regResA.status).toBe(201);
    orgAdminToken = regResA.body.data.token;
    testOrgId = regResA.body.data.organization.id;
    adminUserId = regResA.body.data.user.id;

    // Create Engineer User in Org A
    const engUser = await dataStore.createUser({
      externalAuthId: 'eng-marcus-01',
      email: 'engineer.dan@deerpark.com',
      fullName: 'Dan Process Engineer',
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
      externalAuthId: 'tech-sam-01',
      email: 'tech.sam@deerpark.com',
      fullName: 'Sam Technician',
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

    // Create Viewer User in Org A (Non-Engineering Role)
    const viewerUser = await dataStore.createUser({
      externalAuthId: 'viewer-bob-01',
      email: 'viewer.bob@deerpark.com',
      fullName: 'Bob General Auditor',
    });
    await dataStore.createMembership({
      organizationId: testOrgId,
      userId: viewerUser.id,
      role: 'VIEWER',
      status: 'ACTIVE',
    });
    viewerToken = LocalDevAuthAdapter.generateDevToken(
      { id: viewerUser.externalAuthId, email: viewerUser.email, fullName: viewerUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // Setup Org B (Foreign Tenant for isolation testing)
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Exxon Petrochemicals Europe',
        organizationSlug: 'exxon-europe',
        adminEmail: 'admin@exxon-europe.com',
        adminFullName: 'Helena Berg',
      });
    expect(regResB.status).toBe(201);
    orgBAdminToken = regResB.body.data.token;
    testOrgBId = regResB.body.data.organization.id;

    // Create Plant and Machine in Org A
    const plant = await dataStore.createPlant(testOrgId, {
      name: 'Hydrotreater Complex Train B',
      code: 'PLANT-TX-04',
      location: 'Houston, TX',
      activeUnit: 'UNIT-HDT-02',
    });

    const machine = await dataStore.createMachine(testOrgId, {
      plantId: plant.id,
      name: 'Crude Booster Pump B',
      assetTag: 'PUMP-204-B',
      modelNumber: 'OH2-150-400',
      manufacturer: 'Sulzer Pumps',
      criticality: 'CRITICAL',
      status: 'OPERATIONAL',
      hasPidDiagram: false,
    });
    testMachineId = machine.id;
  });

  // --------------------------------------------------------------------------
  // 1. Supported SVG P&ID Rendering & Content Serving
  // --------------------------------------------------------------------------
  it('1. should retrieve and serve a valid supported P&ID SVG diagram with image/svg+xml and nosniff headers', async () => {
    const validSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">
      <defs><marker id="arrow" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0284C7"/></marker></defs>
      <rect x="10" y="10" width="780" height="380" fill="none" stroke="#CBD5E1"/>
      <line x1="50" y1="200" x2="350" y2="200" stroke="#0284C7" stroke-width="4" marker-end="url(#arrow)"/>
      <g id="P-204-IMP" data-tag="P-204-IMP"><circle cx="400" cy="200" r="40" fill="#E0F2FE"/><text x="400" y="205" text-anchor="middle">P-204-IMP</text></g>
      <g id="P-204-SEAL" data-tag="P-204-SEAL"><rect x="370" y="110" width="60" height="30" fill="#FEF3C7"/><text x="400" y="130" text-anchor="middle">API 53B</text></g>
    </svg>`;
    const storageKey = `org_${testOrgId}/schematics/pid_pump_204_valid.svg`;
    await storageAdapter.putObject(storageKey, Buffer.from(validSvg, 'utf-8'), 'image/svg+xml');

    // Register drawing in DB
    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Booster Pump P-204-B Process & Instrumentation Diagram',
        uniqueDrawingNumber: 'DWG-2026-P204-PID-01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        revision: 'Rev 3.0',
        storageKey,
        originalFileName: 'pid_pump_204_valid.svg',
        fileFormat: 'SVG',
        fileSizeBytes: Buffer.byteLength(validSvg),
        equipmentTags: ['P-204-IMP', 'P-204-SEAL'],
      });

    expect(dwgRes.status).toBe(201);
    const drawingId = dwgRes.body.data.id;

    // Fetch content as engineer
    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(200);
    expect(contentRes.headers['content-type']).toContain('image/svg+xml');
    expect(contentRes.headers['x-content-type-options']).toBe('nosniff');
    expect(contentRes.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
    const svgText1 = contentRes.text || (Buffer.isBuffer(contentRes.body) ? contentRes.body.toString('utf-8') : String(contentRes.body));
    expect(svgText1).toContain('P-204-IMP');
    expect(svgText1).toContain('P-204-SEAL');
  });

  // --------------------------------------------------------------------------
  // 2. SVG Sanitization: XSS, Scripts & XXE Defense
  // --------------------------------------------------------------------------
  it('2. should sanitize SVG diagrams by stripping script tags, inline event handlers, and javascript: URIs', async () => {
    const maliciousSvg = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <script type="text/javascript">alert('XSS_EXPLOIT');</script>
      <circle cx="200" cy="200" r="50" onload="alert('INLINE_EXEC')" fill="#00FF00" />
      <a href="javascript:stealTokens()" xlink:href="javascript:exploit()">
        <rect x="50" y="50" width="100" height="100" fill="#FF0000" />
      </a>
      <foreignObject width="100" height="100">
        <iframe src="http://attacker.com/cookie_stealer" />
      </foreignObject>
      <!-- Genuine Engineering Geometry -->
      <g id="FT-204" data-tag="FT-204">
        <circle cx="350" cy="200" r="25" fill="#E0F2FE" stroke="#0284C7" stroke-width="2"/>
        <text x="350" y="205" text-anchor="middle">FT-204</text>
      </g>
    </svg>`;

    const storageKey = `org_${testOrgId}/schematics/malicious_pid.svg`;
    await storageAdapter.putObject(storageKey, Buffer.from(maliciousSvg, 'utf-8'), 'image/svg+xml');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Adversarial Test P&ID',
        uniqueDrawingNumber: 'DWG-ADV-PID-99',
        drawingType: 'PID',
        discipline: 'Instrumentation',
        storageKey,
        originalFileName: 'malicious_pid.svg',
        fileFormat: 'SVG',
        equipmentTags: ['FT-204'],
      });

    expect(dwgRes.status).toBe(201);
    const drawingId = dwgRes.body.data.id;

    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(200);
    expect(contentRes.headers['x-forgex-sanitized']).toBe('true');

    const svgText2 = contentRes.text || (Buffer.isBuffer(contentRes.body) ? contentRes.body.toString('utf-8') : String(contentRes.body));

    // Verify all active exploits stripped
    expect(svgText2).not.toContain('<script');
    expect(svgText2).not.toContain('alert(');
    expect(svgText2).not.toContain('onload=');
    expect(svgText2).not.toContain('javascript:');
    expect(svgText2).not.toContain('foreignObject');
    expect(svgText2).not.toContain('iframe');
    expect(svgText2).not.toContain('<!ENTITY');

    // Verify genuine engineering tags and geometry preserved
    expect(svgText2).toContain('FT-204');
    expect(svgText2).toContain('stroke="#0284C7"');
  });

  // --------------------------------------------------------------------------
  // 3. Supported Raster PNG / JPEG Diagram Content
  // --------------------------------------------------------------------------
  it('3. should retrieve and serve a supported PNG engineering drawing with image/png Content-Type', async () => {
    // 1x1 transparent PNG magic bytes
    const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    const storageKey = `org_${testOrgId}/schematics/raster_pid.png`;
    await storageAdapter.putObject(storageKey, pngBuffer, 'image/png');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Centrifugal Pump Sectional Drawing',
        uniqueDrawingNumber: 'DWG-PUMP-RASTER-01',
        drawingType: 'MECHANICAL_ASSEMBLY',
        discipline: 'Mechanical',
        storageKey,
        originalFileName: 'raster_pid.png',
        fileFormat: 'PNG',
        fileSizeBytes: pngBuffer.length,
      });

    expect(dwgRes.status).toBe(201);
    const drawingId = dwgRes.body.data.id;

    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(200);
    expect(contentRes.headers['content-type']).toContain('image/png');
    expect(contentRes.headers['content-disposition']).toContain('inline');
  });

  // --------------------------------------------------------------------------
  // 4. Supported PDF Diagram Content
  // --------------------------------------------------------------------------
  it('4. should retrieve and serve a supported PDF engineering drawing with application/pdf Content-Type', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const storageKey = `org_${testOrgId}/schematics/plant_schematic.pdf`;
    await storageAdapter.putObject(storageKey, pdfBuffer, 'application/pdf');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Plant Piping & Loop PDF Sheet',
        uniqueDrawingNumber: 'DWG-LOOP-PDF-01',
        drawingType: 'INSTRUMENTATION_LOOP',
        discipline: 'Instrumentation',
        storageKey,
        originalFileName: 'plant_schematic.pdf',
        fileFormat: 'PDF',
        fileSizeBytes: pdfBuffer.length,
      });

    expect(dwgRes.status).toBe(201);
    const drawingId = dwgRes.body.data.id;

    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(200);
    expect(contentRes.headers['content-type']).toContain('application/pdf');
    expect(contentRes.headers['content-disposition']).toContain('inline');
  });

  // --------------------------------------------------------------------------
  // 5. Unsupported Formats: CAD / DWG / DXF Rejection
  // --------------------------------------------------------------------------
  it('5. should explicitly reject CAD/DWG/DXF drawings from 2D viewer with 422 FORGEX_UNSUPPORTED_RENDER_FORMAT', async () => {
    const cadBuffer = Buffer.from('AC1027\x00\x00\x00AutoCAD Drawing Binary');
    const storageKey = `org_${testOrgId}/schematics/pump_model.dwg`;
    await storageAdapter.putObject(storageKey, cadBuffer, 'application/acad');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Pump Casing 3D CAD Wireframe',
        uniqueDrawingNumber: 'DWG-CAD-DWG-01',
        drawingType: 'PID',
        discipline: 'Mechanical',
        storageKey,
        originalFileName: 'pump_model.dwg',
        fileFormat: 'CAD',
        fileSizeBytes: cadBuffer.length,
      });

    expect(dwgRes.status).toBe(201);
    const drawingId = dwgRes.body.data.id;

    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(422);
    expect(contentRes.body.error.code).toBe('FORGEX_UNSUPPORTED_RENDER_FORMAT');
    expect(contentRes.body.error.message).toContain('CAD and 3D geometric drawings');
    expect(contentRes.body.error.downloadUrl).toContain('storage-proxy');
  });

  // --------------------------------------------------------------------------
  // 6. Corrupted / Empty File Handling
  // --------------------------------------------------------------------------
  it('6. should safely handle empty (0 bytes) or corrupted drawing files with 400 FORGEX_CORRUPTED_FILE', async () => {
    const emptyBuffer = Buffer.alloc(0);
    const storageKey = `org_${testOrgId}/schematics/empty_pid.svg`;
    await storageAdapter.putObject(storageKey, emptyBuffer, 'image/svg+xml');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Corrupted Zero Byte Drawing',
        uniqueDrawingNumber: 'DWG-EMPTY-01',
        drawingType: 'PID',
        discipline: 'Process',
        storageKey,
        originalFileName: 'empty_pid.svg',
        fileFormat: 'SVG',
        fileSizeBytes: 0,
      });

    expect(dwgRes.status).toBe(201);
    const drawingId = dwgRes.body.data.id;

    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(400);
    expect(contentRes.body.error.code).toBe('FORGEX_CORRUPTED_FILE');
    expect(contentRes.body.error.message).toContain('empty (0 bytes) or corrupted');
  });

  // --------------------------------------------------------------------------
  // 7. Non-Existent Drawing 404
  // --------------------------------------------------------------------------
  it('7. should return 404 when requested drawing does not exist', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const contentRes = await request(app)
      .get(`/api/v1/engineering/drawings/${nonExistentId}/content`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(contentRes.status).toBe(404);
    expect(contentRes.body.error.code).toBe('FORGEX_DRAWING_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // 8. Machine-to-P&ID Association Endpoint
  // --------------------------------------------------------------------------
  it('8. should associate machine with its P&ID diagram and return primary drawing and component mappings via /machines/:id/pid', async () => {
    const svgData = '<svg><text>PUMP-204-B P&ID</text></svg>';
    const storageKey = `org_${testOrgId}/schematics/pid_pump_204_primary.svg`;
    await storageAdapter.putObject(storageKey, Buffer.from(svgData), 'image/svg+xml');

    // Create Approved P&ID Drawing
    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'PUMP-204-B Flow Schematic',
        uniqueDrawingNumber: 'DWG-P204-PRIMARY-01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        revision: 'Rev 1.0',
        storageKey,
        originalFileName: 'pid_pump_204_primary.svg',
        fileFormat: 'SVG',
        equipmentTags: ['P-204-IMP', 'PT-204'],
      });

    const drawingId = dwgRes.body.data.id;
    // Approve drawing
    await request(app)
      .post(`/api/v1/engineering/drawings/${drawingId}/review`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({ status: 'APPROVED' });

    // Create a Component Mapping for machine
    await dataStore.createComponentMapping(testOrgId, {
      machineId: testMachineId,
      componentId: 'comp-impeller-01',
      componentName: 'Main Impeller Volute',
      pidTag: 'P-204-IMP',
      meshNodeName: 'Node_Impeller_V01',
      status: 'VERIFIED',
      confidence: 1.0,
    });

    const pidRes = await request(app)
      .get(`/api/v1/engineering/machines/${testMachineId}/pid`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', testOrgId);

    expect(pidRes.status).toBe(200);
    expect(pidRes.body.success).toBe(true);
    expect(pidRes.body.data.machine.assetTag).toBe('PUMP-204-B');
    expect(pidRes.body.data.primaryDrawing.uniqueDrawingNumber).toBe('DWG-P204-PRIMARY-01');
    expect(pidRes.body.data.primaryDrawing.status).toBe('APPROVED');
    expect(pidRes.body.data.mappings).toHaveLength(1);
    expect(pidRes.body.data.mappings[0].pidTag).toBe('P-204-IMP');
  });

  // --------------------------------------------------------------------------
  // 9. Missing Association Empty State
  // --------------------------------------------------------------------------
  it('9. should return clean empty state without fabricating fake diagrams when machine has no P&ID diagram', async () => {
    // Register separate machine with no drawings
    const isolatedMachine = await dataStore.createMachine(testOrgId, {
      plantId: 'PLANT-TX-04',
      name: 'Unmapped Water Feed Pump',
      assetTag: 'PUMP-888-EMPTY',
      modelNumber: 'WTR-100',
      manufacturer: 'Generic Water Co',
      criticality: 'LOW',
      status: 'OPERATIONAL',
      hasPidDiagram: false,
    });

    const pidRes = await request(app)
      .get(`/api/v1/engineering/machines/${isolatedMachine.id}/pid`)
      .set('Authorization', `Bearer ${engineerToken}`)
      .set('x-organization-id', testOrgId);

    expect(pidRes.status).toBe(200);
    expect(pidRes.body.success).toBe(true);
    expect(pidRes.body.data.machine.assetTag).toBe('PUMP-888-EMPTY');
    expect(pidRes.body.data.primaryDrawing).toBeNull();
    expect(pidRes.body.data.drawings).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 10. Strict Cross-Tenant Isolation
  // --------------------------------------------------------------------------
  it('10. should strictly enforce tenant boundaries: Tenant B cannot access or download Tenant A drawings', async () => {
    const svgData = '<svg><text>CONFIDENTIAL PROPRIETARY SCHEMATIC</text></svg>';
    const storageKey = `org_${testOrgId}/schematics/confidential_orgA.svg`;
    await storageAdapter.putObject(storageKey, Buffer.from(svgData), 'image/svg+xml');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Confidential Proprietary Process Diagram',
        uniqueDrawingNumber: 'DWG-CONF-001',
        drawingType: 'PID',
        discipline: 'Process',
        storageKey,
        originalFileName: 'confidential_orgA.svg',
        fileFormat: 'SVG',
      });

    const drawingId = dwgRes.body.data.id;

    // Tenant B attempts to access Org A's drawing via content endpoint
    const crossRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', testOrgBId);

    expect(crossRes.status).toBe(404);
    expect(crossRes.body.error.code).toBe('FORGEX_DRAWING_NOT_FOUND');

    // Tenant B attempts to access Org A's drawing via storage proxy
    const proxyRes = await request(app)
      .get(`/api/v1/engineering/storage-proxy?key=${encodeURIComponent(storageKey)}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', testOrgBId);

    expect(proxyRes.status).toBe(403);
    expect(proxyRes.body.error.code).toBe('FORGEX_CROSS_TENANT_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // 11. Role-Based Access Control (RBAC)
  // --------------------------------------------------------------------------
  it('11. should enforce RBAC: reject unauthenticated and non-engineering viewer roles from diagram content', async () => {
    const svgData = '<svg><text>PROTECTED_DWG</text></svg>';
    const storageKey = `org_${testOrgId}/schematics/rbac_test.svg`;
    await storageAdapter.putObject(storageKey, Buffer.from(svgData), 'image/svg+xml');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'RBAC Enforcement Schematic',
        uniqueDrawingNumber: 'DWG-RBAC-01',
        drawingType: 'PID',
        discipline: 'Process',
        storageKey,
        originalFileName: 'rbac_test.svg',
        fileFormat: 'SVG',
      });

    const drawingId = dwgRes.body.data.id;

    // 1. Unauthenticated request -> 401
    const unauthRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`);
    expect(unauthRes.status).toBe(401);

    // 2. Viewer role request -> 403 Forbidden
    const viewerRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingId}/content`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('x-organization-id', testOrgId);
    expect(viewerRes.status).toBe(403);
    expect(viewerRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // 12. Drawing Review & Machine Linkage
  // --------------------------------------------------------------------------
  it('12. should update machine.hasPidDiagram and machine.pidStorageKey when a P&ID drawing is reviewed and approved', async () => {
    const storageKey = `org_${testOrgId}/schematics/approved_pid.svg`;
    await storageAdapter.putObject(storageKey, Buffer.from('<svg></svg>'), 'image/svg+xml');

    const dwgRes = await request(app)
      .post('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        machineId: testMachineId,
        drawingTitle: 'Approval Trigger P&ID',
        uniqueDrawingNumber: 'DWG-APPR-01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        storageKey,
        originalFileName: 'approved_pid.svg',
        fileFormat: 'SVG',
      });

    const drawingId = dwgRes.body.data.id;

    // Machine before review
    const preMachine = await dataStore.getMachineById(testOrgId, testMachineId);
    expect(preMachine?.hasPidDiagram).toBe(false);

    // Review and Approve drawing
    const reviewRes = await request(app)
      .post(`/api/v1/engineering/drawings/${drawingId}/review`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .set('x-organization-id', testOrgId)
      .send({
        status: 'APPROVED',
        reviewNotes: 'Reviewed by Chief Piping Engineer. Complies with ISA-5.1.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // Verify Machine was automatically updated with P&ID drawing link
    const postMachine = await dataStore.getMachineById(testOrgId, testMachineId);
    expect(postMachine?.hasPidDiagram).toBe(true);
    expect(postMachine?.pidStorageKey).toBe(storageKey);
  });
});

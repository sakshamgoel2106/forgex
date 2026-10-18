import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import type { Organization, User } from '@forgex/shared-types';

describe('Phase 2: Multi-Tenant Isolation & Server-Controlled RBAC', () => {
  const jwtSecret = 'test_secret_for_isolation_tests_at_least_32_chars';
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let app: any;

  // Organizations
  let orgAlpha: Organization;
  let orgBeta: Organization;

  // Users
  let userAlphaAdmin: User;
  let userAlphaTech: User;
  let userAlphaViewer: User;
  let userBetaTech: User;

  // Tokens
  let tokenAlphaAdmin: string;
  let tokenAlphaTech: string;
  let tokenAlphaViewer: string;
  let tokenBetaTech: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    app = createApp({ authAdapter, dataStore });

    // 1. Seed Organization Alpha and Organization Beta
    orgAlpha = await dataStore.createOrganization({
      name: 'Alpha Energy Corp',
      slug: 'alpha-energy',
    });

    orgBeta = await dataStore.createOrganization({
      name: 'Beta Refining LLC',
      slug: 'beta-refining',
    });

    // 2. Seed Users
    userAlphaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_usr_alpha_admin',
      email: 'admin@alpha-energy.com',
      fullName: 'Alice Alpha (Admin)',
    });

    userAlphaTech = await dataStore.createUser({
      externalAuthId: 'ext_usr_alpha_tech',
      email: 'tech@alpha-energy.com',
      fullName: 'Tom Alpha (Technician)',
    });

    userAlphaViewer = await dataStore.createUser({
      externalAuthId: 'ext_usr_alpha_viewer',
      email: 'viewer@alpha-energy.com',
      fullName: 'Valerie Alpha (Viewer)',
    });

    userBetaTech = await dataStore.createUser({
      externalAuthId: 'ext_usr_beta_tech',
      email: 'tech@beta-refining.com',
      fullName: 'Bob Beta (Technician)',
    });

    // 3. Establish Memberships
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTech.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaViewer.id,
      role: 'VIEWER',
    });

    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaTech.id,
      role: 'ENGINEER_TECHNICIAN',
    });

    // 4. Generate Valid Identity Tokens
    tokenAlphaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaAdmin.externalAuthId, email: userAlphaAdmin.email, emailVerified: true },
      jwtSecret
    );

    tokenAlphaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTech.externalAuthId, email: userAlphaTech.email, emailVerified: true },
      jwtSecret
    );

    tokenAlphaViewer = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaViewer.externalAuthId, email: userAlphaViewer.email, emailVerified: true },
      jwtSecret
    );

    tokenBetaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaTech.externalAuthId, email: userBetaTech.email, emailVerified: true },
      jwtSecret
    );
  });

  describe('Happy Path: Same-Tenant Authorized Operations', () => {
    it('Engineer can create a plant and hierarchical assets within their own organization', async () => {
      // Create Plant in Org Alpha
      const plantRes = await request(app)
        .post('/api/v1/plants')
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          code: 'PLANT-TX-01',
          name: 'Houston Primary Refinery',
          location: 'Houston, TX',
          airGappedMode: false,
        });

      expect(plantRes.status).toBe(201);
      expect(plantRes.body.data).toHaveProperty('id');
      expect(plantRes.body.data.organizationId).toBe(orgAlpha.id);
      expect(plantRes.body.data.code).toBe('PLANT-TX-01');

      const plantId = plantRes.body.data.id;

      // Create Parent Asset (Compressor Skid)
      const parentAssetRes = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          plantId,
          assetTag: 'SKID-100-A',
          name: 'Main Wet Gas Compression Skid',
          area: 'Area 4',
          manufacturer: 'Elliott Group',
          modelNumber: '29M',
          serialNumber: 'SN-78901',
        });

      expect(parentAssetRes.status).toBe(201);
      const parentAssetId = parentAssetRes.body.data.id;

      // Create Child Asset referencing parentAssetId
      const childAssetRes = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenAlphaTech}`)
        .send({
          plantId,
          parentAssetId,
          assetTag: 'PUMP-204-B',
          name: 'Slurry Bottoms Pump',
          area: 'Area 4 - Skid A',
          manufacturer: 'Flowserve Corp',
          modelNumber: 'Mark 3 ANSI',
          serialNumber: 'SN-40291',
        });

      expect(childAssetRes.status).toBe(201);
      expect(childAssetRes.body.data.parentAssetId).toBe(parentAssetId);
      expect(childAssetRes.body.data.organizationId).toBe(orgAlpha.id);
    });
  });

  describe('Cross-Tenant Attack Vectors', () => {
    let plantAlphaId: string;
    let assetAlphaId: string;

    beforeEach(async () => {
      // Seed a plant and asset belonging to Organization Alpha
      const plant = await dataStore.createPlant(orgAlpha.id, {
        code: 'PLANT-ALPHA-SECRET',
        name: 'Alpha Sensitive Facility',
        location: 'Midland, TX',
      });
      plantAlphaId = plant.id;

      const asset = await dataStore.createAsset(orgAlpha.id, {
        plantId: plantAlphaId,
        assetTag: 'TURB-SECRET-01',
        name: 'Proprietary Turbine',
        area: 'Classified Zone',
        manufacturer: 'Alpha Proprietary',
        modelNumber: 'X-900',
        serialNumber: 'SN-001',
      });
      assetAlphaId = asset.id;
    });

    it('Org B user cannot view Org A plant even when knowing its UUID (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/plants/${plantAlphaId}`)
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_NOT_FOUND');
    });

    it('Org B user cannot view Org A asset even when knowing its UUID (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/assets/${assetAlphaId}`)
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_NOT_FOUND');
    });

    it('Org B user cannot list Org A assets', async () => {
      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenBetaTech}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0); // None of Org Alpha's assets appear in Org Beta's query!
    });

    it('Org B user cannot attach an asset to Org A plant (Cross-tenant foreign key violation blocked)', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenBetaTech}`)
        .send({
          plantId: plantAlphaId, // Malicious reference to another organization's plant
          assetTag: 'ROGUE-PUMP-01',
          name: 'Rogue Pump',
          area: 'Unknown',
          manufacturer: 'Vendor',
          modelNumber: 'M1',
          serialNumber: 'SN-000',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('Org B user cannot forge X-Organization-Id header to masquerade as Org A (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/plants')
        .set('Authorization', `Bearer ${tokenBetaTech}`)
        .set('X-Organization-Id', orgAlpha.id); // Forged organization header

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_TENANT_MISMATCH');

      // Verify tamper-evident audit event recorded the blocked attempt
      const auditEvents = await dataStore.listAuditEvents(orgAlpha.id);
      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0].action).toBe('CROSS_TENANT_ACCESS_BLOCKED');
      expect(auditEvents[0].actorUserId).toBe(userBetaTech.id);
    });
  });

  describe('Server-Controlled Role-Based Access Control (RBAC)', () => {
    it('Viewer role cannot create a plant (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/plants')
        .set('Authorization', `Bearer ${tokenAlphaViewer}`)
        .send({
          code: 'PLANT-UNAUTHORIZED',
          name: 'Unauthorized Plant',
          location: 'Dallas, TX',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('Viewer role cannot create an asset (403 Forbidden)', async () => {
      // First create a plant as admin
      const plant = await dataStore.createPlant(orgAlpha.id, {
        code: 'PLANT-VIEWER-TEST',
        name: 'Viewer Test Plant',
        location: 'Austin, TX',
      });

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${tokenAlphaViewer}`)
        .send({
          plantId: plant.id,
          assetTag: 'PUMP-VIEWER-FAIL',
          name: 'Viewer Pump',
          area: 'Area 1',
          manufacturer: 'Maker',
          modelNumber: 'M1',
          serialNumber: 'SN-1',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('Organization Admin can view audit events, but Engineer cannot (403 Forbidden)', async () => {
      // Tech attempts to view audit events
      const techRes = await request(app)
        .get('/api/v1/audit/events')
        .set('Authorization', `Bearer ${tokenAlphaTech}`);

      expect(techRes.status).toBe(403);
      expect(techRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

      // Admin views audit events
      const adminRes = await request(app)
        .get('/api/v1/audit/events')
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data).toBeInstanceOf(Array);
    });
  });
});

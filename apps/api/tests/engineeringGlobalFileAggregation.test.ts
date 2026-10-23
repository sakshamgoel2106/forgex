import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { config } from '../src/config/env.js';

describe('Engineering Workspace: Global File Aggregation & Multi-Tenant Isolation', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;

  let tokenA: string;
  let tokenB: string;
  let orgAId: string;
  let orgBId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({ dataStore, authAdapter });

    // Setup Org A
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Alpha Manufacturing Plant',
        organizationSlug: 'alpha-plant',
        adminEmail: 'admin@alpha.industrial',
        adminFullName: 'Alpha Admin',
      });
    expect(regResA.status).toBe(201);
    tokenA = regResA.body.data.token;
    orgAId = regResA.body.data.organization.id;

    // Setup Org B
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Beta Chemical Facility',
        organizationSlug: 'beta-facility',
        adminEmail: 'admin@beta.industrial',
        adminFullName: 'Beta Admin',
      });
    expect(regResB.status).toBe(201);
    tokenB = regResB.body.data.token;
    orgBId = regResB.body.data.organization.id;
  });

  it('aggregates 3D models and P&ID drawings from registered assets into the Engineering Workspace', async () => {
    // 1. Initial workspace summary should be empty
    const initialSummaryRes = await request(app)
      .get('/api/v1/engineering/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId);

    expect(initialSummaryRes.status).toBe(200);
    expect(initialSummaryRes.body.data.totalModels3d).toBe(0);
    expect(initialSummaryRes.body.data.totalDrawings).toBe(0);

    // 2. Register machine in Alpha with 3D model and P&ID drawing in Asset Ledger
    const machineRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'PUMP-101',
        name: 'High Pressure Boiler Feed Pump',
        machineType: 'Centrifugal Pump',
        manufacturer: 'Sulzer Pumps',
        modelNumber: 'OH2-150',
        hasModel3d: true,
        model3dStorageKey: 'models/PUMP-101-3sv08fl007t.stp',
        model3dFormat: 'step',
        hasPidDiagram: true,
        pidStorageKey: 'schematics/PUMP-101-PID-01.pdf',
        technicalSpecs: {
          model3dFileName: '3sv08fl007t.stp',
          model3dFileSize: 4085657,
          pidFileName: 'PUMP-101-PID-01.pdf',
          pidFileSize: 3136182,
        },
      });

    expect(machineRes.status).toBe(201);
    const machineId = machineRes.body.data.id;

    // 3. Verify Engineering Workspace models endpoint returns the aggregated 3D model
    const modelsRes = await request(app)
      .get('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId);

    expect(modelsRes.status).toBe(200);
    expect(modelsRes.body.data.length).toBe(1);
    expect(modelsRes.body.data[0].machineId).toBe(machineId);
    expect(modelsRes.body.data[0].title).toBe('3sv08fl007t.stp');
    expect(modelsRes.body.data[0].fileFormat).toBe('STEP');
    expect(modelsRes.body.data[0].convertedStorageKey).toBe('models/PUMP-101-3sv08fl007t.glb');

    // 4. Verify Engineering Workspace drawings endpoint returns the aggregated P&ID
    const drawingsRes = await request(app)
      .get('/api/v1/engineering/drawings')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId);

    expect(drawingsRes.status).toBe(200);
    expect(drawingsRes.body.data.length).toBe(1);
    expect(drawingsRes.body.data[0].machineId).toBe(machineId);
    expect(drawingsRes.body.data[0].drawingTitle).toBe('PUMP-101-PID-01.pdf');
    expect(drawingsRes.body.data[0].drawingType).toBe('PID');

    // 5. Verify summary counters are immediately updated
    const updatedSummaryRes = await request(app)
      .get('/api/v1/engineering/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId);

    expect(updatedSummaryRes.status).toBe(200);
    expect(updatedSummaryRes.body.data.totalModels3d).toBe(1);
    expect(updatedSummaryRes.body.data.approvedModels3d).toBe(1);
    expect(updatedSummaryRes.body.data.totalDrawings).toBe(1);
    expect(updatedSummaryRes.body.data.approvedDrawings).toBe(1);

    // 6. Verify single model & drawing retrieval works
    const modelByIdRes = await request(app)
      .get(`/api/v1/engineering/models/${modelsRes.body.data[0].id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId);
    expect(modelByIdRes.status).toBe(200);
    expect(modelByIdRes.body.data.title).toBe('3sv08fl007t.stp');

    const drawingByIdRes = await request(app)
      .get(`/api/v1/engineering/drawings/${drawingsRes.body.data[0].id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgAId);
    expect(drawingByIdRes.status).toBe(200);
    expect(drawingByIdRes.body.data.drawingTitle).toBe('PUMP-101-PID-01.pdf');

    // 7. Strict tenant isolation: Org B sees 0 models and 0 drawings
    const orgBSummaryRes = await request(app)
      .get('/api/v1/engineering/summary')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', orgBId);

    expect(orgBSummaryRes.status).toBe(200);
    expect(orgBSummaryRes.body.data.totalModels3d).toBe(0);
    expect(orgBSummaryRes.body.data.totalDrawings).toBe(0);

    const orgBModelsRes = await request(app)
      .get('/api/v1/engineering/models')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-organization-id', orgBId);

    expect(orgBModelsRes.status).toBe(200);
    expect(orgBModelsRes.body.data.length).toBe(0);
  });
});

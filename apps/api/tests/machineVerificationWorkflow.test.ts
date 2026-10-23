import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { bootstrapInitialData } from '../src/db/bootstrapData.js';
import { config } from '../src/config/env.js';

describe('ForgeX AI — Machine Verification Workflow & Manage Tasks Integration', () => {
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;

  let ownerToken: string;
  let technicianToken: string;
  let workerToken: string;
  let orgBAdminToken: string;

  let orgAId: string;
  let orgBId: string;
  let ownerUserId: string;
  let technicianUserId: string;
  let workerUserId: string;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({ dataStore, authAdapter });
    await bootstrapInitialData(dataStore);

    // 1. Setup Organization A with Owner
    const regResA = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Gulf Coast Petrochem Corp',
        organizationSlug: 'gulf-coast-petro',
        adminEmail: 'elena.owner@gulfpetro.com',
        adminFullName: 'Elena Vance (Owner)',
      });
    expect(regResA.status).toBe(201);
    ownerToken = regResA.body.data.token;
    orgAId = regResA.body.data.organization.id;
    ownerUserId = regResA.body.data.user.id;

    // 2. Setup Technician in Org A
    const techUser = await dataStore.createUser({
      externalAuthId: 'tech-user-v1',
      email: 'marcus.tech@gulfpetro.com',
      fullName: 'Marcus Vance',
    });
    technicianUserId = techUser.id;
    await dataStore.createMembership({
      organizationId: orgAId,
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
      externalAuthId: 'worker-user-v1',
      email: 'alex.worker@gulfpetro.com',
      fullName: 'Alex Worker',
    });
    workerUserId = workerUser.id;
    await dataStore.createMembership({
      organizationId: orgAId,
      userId: workerUser.id,
      role: 'WORKER',
      status: 'ACTIVE',
    });
    workerToken = LocalDevAuthAdapter.generateDevToken(
      { id: workerUser.externalAuthId, email: workerUser.email, fullName: workerUser.fullName, emailVerified: true },
      config.JWT_SECRET
    );

    // 4. Setup Org B for Tenant Isolation
    const regResB = await request(app)
      .post('/api/v1/auth/register-org')
      .send({
        organizationName: 'Midwest Energy Plant',
        organizationSlug: 'midwest-energy',
        adminEmail: 'david.midwest@energy.com',
        adminFullName: 'David Miller',
      });
    expect(regResB.status).toBe(201);
    orgBAdminToken = regResB.body.data.token;
    orgBId = regResB.body.data.organization.id;
  });

  it('1. Registration creates a pending verification record with checklist and accurate counters', async () => {
    // Register machine with full identity but pending inspection
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'PUMP-101-A',
        name: 'Boiler Feed Water Pump A',
        machineType: 'Centrifugal Pump',
        manufacturer: 'Sulzer Flow Solutions',
        modelNumber: 'OH2-100-315',
        serialNumber: 'SZ-2026-9901-B',
        documentationReadiness: 'PENDING_INSPECTION',
      });
    expect(regRes.status).toBe(201);
    const machine = regRes.body.data;
    expect(machine.id).toBeDefined();

    // Verify verification record
    const verifRes = await request(app)
      .get(`/api/v1/machines/${machine.id}/verification`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId);

    expect(verifRes.status).toBe(200);
    expect(verifRes.body.success).toBe(true);
    const verif = verifRes.body.data;

    expect(verif.machineId).toBe(machine.id);
    expect(verif.status).toBe('IN_PROGRESS');
    expect(verif.overallState).toBe('PARTIALLY_VERIFIED');

    // Check individual checklist items
    const idCheck = verif.checks.find((c: any) => c.key === 'identity');
    expect(idCheck.status).toBe('PASSED');
    expect(idCheck.details).toContain('SZ-2026-9901-B');

    const docCheck = verif.checks.find((c: any) => c.key === 'documentation');
    expect(docCheck.status).toBe('PENDING');

    const specsCheck = verif.checks.find((c: any) => c.key === 'technicalSpecs');
    expect(specsCheck.status).toBe('PENDING');

    // Dashboard counters check:
    // PENDING_INSPECTION counts toward incompleteDocumentationCount
    // verifiedSpecsCount must be 0 because verificationState is PARTIALLY_VERIFIED
    const summaryRes = await request(app)
      .get('/api/v1/machines/ledger/summary')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.totalMachines).toBe(1);
    expect(summaryRes.body.data.incompleteDocumentationCount).toBe(1);
    expect(summaryRes.body.data.verifiedSpecsCount).toBe(0);
    expect(summaryRes.body.data.pendingReviewTasksCount).toBe(0);
  });

  it('2. Enforces RBAC: Workers cannot approve, reject, or submit verification evidence', async () => {
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'TURB-201-A',
        name: 'High Pressure Steam Turbine',
        machineType: 'Steam Turbine',
        manufacturer: 'Siemens Energy',
        modelNumber: 'SST-300',
        serialNumber: 'SIE-88319-X',
      });
    const machineId = regRes.body.data.id;

    // Worker attempts to approve -> 403 Forbidden
    const workerApproveRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${workerToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'Self-approving machine' });
    expect(workerApproveRes.status).toBe(403);

    // Worker attempts to reject -> 403 Forbidden
    const workerRejectRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/reject`)
      .set('Authorization', `Bearer ${workerToken}`)
      .set('x-organization-id', orgAId)
      .send({ rejectionReason: 'Rejecting machine' });
    expect(workerRejectRes.status).toBe(403);

    // Worker attempts to submit evidence -> 403 Forbidden
    const workerEvidenceRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/submit-evidence`)
      .set('Authorization', `Bearer ${workerToken}`)
      .set('x-organization-id', orgAId)
      .send({ evidenceDescription: 'Saw machine running' });
    expect(workerEvidenceRes.status).toBe(403);

    // Worker attempts to assign verification -> 403 Forbidden
    const workerAssignRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/assign`)
      .set('Authorization', `Bearer ${workerToken}`)
      .set('x-organization-id', orgAId)
      .send({ assignedUserId: technicianUserId });
    expect(workerAssignRes.status).toBe(403);

    // Technician attempts to approve -> 403 Forbidden (only Owner/Admin/Plant Manager can approve)
    const techApproveRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'Technician attempting approval' });
    expect(techApproveRes.status).toBe(403);
  });

  it('3. Incomplete checks block approval with specific corrective guidance', async () => {
    // Machine with missing specs and documentation pending
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'COMP-301-A',
        name: 'Feed Gas Compressor',
        machineType: 'Centrifugal Compressor',
        manufacturer: 'Elliott Group',
        modelNumber: '29M',
        serialNumber: 'EL-902-881',
        documentationReadiness: 'PENDING_INSPECTION',
      });
    const machineId = regRes.body.data.id;

    // Owner attempts to approve prematurely
    const approveRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'Fast tracking approval' });

    expect(approveRes.status).toBe(400);
    expect(approveRes.body.success).toBe(false);
    expect(approveRes.body.error.code).toBe('FORGEX_VERIFICATION_INCOMPLETE');
    expect(approveRes.body.error.incompleteChecks).toBeInstanceOf(Array);
    expect(approveRes.body.error.incompleteChecks.length).toBeGreaterThan(0);

    const keys = approveRes.body.error.incompleteChecks.map((c: any) => c.key);
    expect(keys).toContain('documentation');
    expect(keys).toContain('technicalSpecs');
  });

  it('4. Seamlessly connects verification assignment to existing Manage Tasks system', async () => {
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'EXCH-401-A',
        name: 'Lean Amine Heat Exchanger',
        machineType: 'Heat Exchanger',
        manufacturer: 'Alfa Laval',
        modelNumber: 'Compabloc CP50',
        serialNumber: 'AL-2026-EX-401',
      });
    const machineId = regRes.body.data.id;

    // Owner assigns verification task to Marcus Technician
    const assignRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assignedUserId: technicianUserId,
        assignedRole: 'TECHNICIAN',
        dueDate: '2026-11-15T00:00:00.000Z',
        instructions: 'Verify operating pressure rating and tube bundle material certificate.',
      });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.success).toBe(true);
    expect(assignRes.body.data.task).toBeDefined();
    expect(assignRes.body.data.task.assignedUserId).toBe(technicianUserId);
    expect(assignRes.body.data.task.status).toBe('NOT_STARTED');
    expect(assignRes.body.data.verification.assignedUserId).toBe(technicianUserId);

    // Verify task exists in the standard Manage Tasks API
    const listTasksRes = await request(app)
      .get(`/api/v1/tasks?machineId=${machineId}`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', orgAId);

    expect(listTasksRes.status).toBe(200);
    expect(listTasksRes.body.data).toHaveLength(1);
    expect(listTasksRes.body.data[0].id).toBe(assignRes.body.data.task.id);
  });

  it('5. Rejection flow records specific reasons and required corrective actions', async () => {
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'GEN-501-A',
        name: 'Emergency Diesel Generator',
        machineType: 'Generator',
        manufacturer: 'Caterpillar',
        modelNumber: 'C32 ACERT',
        serialNumber: 'CAT-C32-901',
      });
    const machineId = regRes.body.data.id;

    // Rejection without reason fails validation
    const badRejectRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({});
    expect(badRejectRes.status).toBe(400);

    // Rejection with mandatory reason and corrective actions
    const rejectRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        rejectionReason: 'Emergency stop test cert missing OEM stamp.',
        correctiveActions: 'Upload stamped factory inspection certificate and re-test governor.',
      });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);
    const verif = rejectRes.body.data;
    expect(verif.status).toBe('REJECTED');
    expect(verif.rejectionReason).toBe('Emergency stop test cert missing OEM stamp.');
    expect(verif.correctiveActions).toContain('factory inspection certificate');

    const history = verif.history;
    expect(history[history.length - 1].action).toBe('REJECTED');
  });

  it('6. Full End-to-End Verification: technician evidence, approval request, and owner signoff', async () => {
    // 1. Register machine
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'REACTOR-601',
        name: 'Hydrocracker Loop Reactor',
        machineType: 'Pressure Vessel',
        manufacturer: 'MHI Power & Vessel Corp',
        modelNumber: 'HC-REV-5',
        serialNumber: 'MHI-HC-601-99',
        documentationReadiness: 'PENDING_INSPECTION',
      });
    const machineId = regRes.body.data.id;

    // 2. Authorized Technician submits physical findings & operating specs
    const evidenceRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/submit-evidence`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', orgAId)
      .send({
        evidenceDescription: 'Direct ultrasound inspection of shell thickness and design pressure stamp.',
        evidenceAttachmentKeys: ['docs/oem-data-book-mhi-hc-601.pdf'],
        technicalSpecs: {
          designPressureBar: 180,
          operatingTempC: 450,
          shellMaterial: '2.25Cr-1Mo-0.25V',
        },
        documentationReadiness: 'READY',
      });

    expect(evidenceRes.status).toBe(200);
    expect(evidenceRes.body.success).toBe(true);

    // 3. Technician requests approval
    const reqApprovalRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/request-approval`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'All NDT tests verified and OEM data books confirmed READY.' });

    expect(reqApprovalRes.status).toBe(200);
    expect(reqApprovalRes.body.data.status).toBe('READY_FOR_APPROVAL');

    // 4. Owner approves verification
    const approveRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'Approved after engineering review.' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.status).toBe('VERIFIED');
    expect(approveRes.body.data.overallState).toBe('VERIFIED');
    expect(approveRes.body.data.approvedByUserId).toBe(ownerUserId);

    // 5. Machine record is now officially VERIFIED
    const getMachRes = await request(app)
      .get(`/api/v1/machines/${machineId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId);

    expect(getMachRes.body.data.verificationState).toBe('VERIFIED');
    expect(getMachRes.body.data.documentationReadiness).toBe('READY');

    // 6. Summary counter: verifiedSpecsCount is 1, incompleteDocumentationCount is 0
    const summaryRes = await request(app)
      .get('/api/v1/machines/ledger/summary')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId);

    expect(summaryRes.body.data.verifiedSpecsCount).toBe(1);
    expect(summaryRes.body.data.incompleteDocumentationCount).toBe(0);
  });

  it('7. Enforces organization-level tenant isolation', async () => {
    // Org A creates machine
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'PUMP-SEC-01',
        name: 'Secure Isolation Pump',
        machineType: 'Centrifugal Pump',
      });
    const machineId = regRes.body.data.id;

    // Org B Admin cannot read Org A machine verification
    const crossGet = await request(app)
      .get(`/api/v1/machines/${machineId}/verification`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', orgBId);
    expect(crossGet.status).toBe(404);

    // Org B Admin cannot submit evidence
    const crossEvidence = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/submit-evidence`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', orgBId)
      .send({ evidenceDescription: 'Cross tenant attempt' });
    expect(crossEvidence.status).toBe(404);

    // Org B Admin cannot approve Org A machine
    const crossApprove = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .set('x-organization-id', orgBId)
      .send({ notes: 'Cross tenant attempt' });
    expect(crossApprove.status).toBe(404);
  });

  it('8. Dynamic Verification Logic: Documentation check remains PENDING when 0 manuals are uploaded even if documentationReadiness is READY', async () => {
    // Register machine with full identity and documentationReadiness marked READY, but ZERO documents uploaded in DB
    const regRes = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        assetTag: 'PUMP-ZERO-DOCS',
        name: 'Cooling Water Circulation Pump',
        machineType: 'Centrifugal Pump',
        manufacturer: 'Flowserve',
        modelNumber: 'HPX-80-200',
        serialNumber: 'FS-99120',
        documentationReadiness: 'READY',
        technicalSpecs: {
          flowRateM3h: 350,
          headM: 85,
        },
      });
    expect(regRes.status).toBe(201);
    const machineId = regRes.body.data.id;

    // Check verification status: documentation check MUST be PENDING because documentCount is 0!
    const verifRes1 = await request(app)
      .get(`/api/v1/machines/${machineId}/verification`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId);

    expect(verifRes1.status).toBe(200);
    const docCheck1 = verifRes1.body.data.checks.find((c: any) => c.key === 'documentation');
    expect(docCheck1.status).toBe('PENDING');
    expect(docCheck1.details).toContain('0 operating manuals or engineering documents uploaded');

    // Attempting to approve must fail because documentation check is incomplete
    const prematureApproveRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'Attempting approval with zero documents uploaded' });

    expect(prematureApproveRes.status).toBe(400);
    expect(prematureApproveRes.body.error.code).toBe('FORGEX_VERIFICATION_INCOMPLETE');
    expect(prematureApproveRes.body.error.incompleteChecks.some((c: any) => c.key === 'documentation')).toBe(true);

    // Now upload an official OEM manual resource for this machine
    const resRes = await request(app)
      .post('/api/v1/engineering/manufacturer-resources')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({
        machineId,
        resourceType: 'OFFICIAL_MANUAL',
        title: 'Flowserve HPX User & Maintenance Manual',
        manufacturer: 'Flowserve',
        modelNumber: 'HPX-80-200',
        sourceType: 'OFFICIAL_URL',
        sourceUrl: 'https://flowserve.com/manuals/hpx-80-200.pdf',
      });
    expect(resRes.status).toBe(201);

    // Re-query verification - documentation check must now be PASSED!
    const verifRes2 = await request(app)
      .get(`/api/v1/machines/${machineId}/verification`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId);

    expect(verifRes2.status).toBe(200);
    const docCheck2 = verifRes2.body.data.checks.find((c: any) => c.key === 'documentation');
    expect(docCheck2.status).toBe('PASSED');
    expect(docCheck2.details).toContain('verified operating manual(s)');

    // Now approval succeeds!
    const validApproveRes = await request(app)
      .post(`/api/v1/machines/${machineId}/verification/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', orgAId)
      .send({ notes: 'Approved now that official manual is attached.' });

    expect(validApproveRes.status).toBe(200);
    expect(validApproveRes.body.data.status).toBe('VERIFIED');
    expect(validApproveRes.body.data.overallState).toBe('VERIFIED');
  });
});


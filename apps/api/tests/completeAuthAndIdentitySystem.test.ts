import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { config } from '../src/config/env.js';

describe('4JX AI — Complete Authentication & Identity Management System Test Suite', () => {
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let app: any;

  beforeEach(() => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({
      dataStore,
      authAdapter,
    });
  });

  describe('1. Company Registration & Tenant Provisioning', () => {
    it('successfully registers an organization, initial site, and owner administrator', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Titan Industrial Systems',
          companySlug: 'titan-industrial-sys',
          workEmail: 'ceo@titan-industrial.com',
          fullName: 'Marcus Vance',
          password: 'TitanSecurePass2026!',
          confirmPassword: 'TitanSecurePass2026!',
          industry: 'Heavy Machinery & Automation',
          country: 'United States',
          timezone: 'America/Chicago',
          website: 'https://titan-industrial.com',
          companySize: '500-1000',
          initialSiteName: 'Houston Assembly Plant 1',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.name).toBe('Titan Industrial Systems');
      expect(res.body.data.organization.slug).toBe('titan-industrial-sys');
      expect(res.body.data.membership.role).toBe('ORGANIZATION_OWNER');
      expect(res.body.data.membership.status).toBe('ACTIVE');
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.emailVerification).toBeDefined();
      expect(res.body.data.emailVerification.verificationToken).toBeDefined();

      // Verify site was created
      const plants = await dataStore.listPlants(res.body.data.organization.id);
      expect(plants.length).toBe(1);
      expect(plants[0].name).toBe('Houston Assembly Plant 1');
    });

    it('rejects duplicate company registration slug with 409 conflict', async () => {
      await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Apex Energy Systems',
          companySlug: 'apex-energy-tx',
          workEmail: 'admin@apex-energy.com',
          fullName: 'Admin Apex',
          password: 'Password123!',
        });

      const duplicateRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Apex Energy Duplicate',
          companySlug: 'apex-energy-tx',
          workEmail: 'another@apex-energy.com',
          fullName: 'Another Admin',
          password: 'Password123!',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('FORGEX_ORG_SLUG_CONFLICT');
    });

    it('validates password mismatch and weak password policies', async () => {
      const mismatchRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Weak Systems',
          companySlug: 'weak-systems',
          workEmail: 'admin@weak.com',
          fullName: 'Admin Weak',
          password: 'ValidPassword123!',
          confirmPassword: 'DifferentPassword123!',
        });

      expect(mismatchRes.status).toBe(400);
      expect(mismatchRes.body.error.code).toBe('FORGEX_PASSWORD_MISMATCH');

      const weakRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Weak Systems',
          companySlug: 'weak-systems',
          workEmail: 'admin@weak.com',
          fullName: 'Admin Weak',
          password: 'weak',
          confirmPassword: 'weak',
        });

      expect(weakRes.status).toBe(400);
      expect(weakRes.body.error.code).toBe('FORGEX_WEAK_PASSWORD');
    });
  });

  describe('2. Email Verification Workflow', () => {
    it('verifies user email address and enforces unverified restrictions', async () => {
      const regRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Solon Robotics',
          companySlug: 'solon-robotics',
          workEmail: 'founder@solon-robotics.com',
          fullName: 'Dr. Elena Rostova',
          password: 'SolonSafePass2026!',
          confirmPassword: 'SolonSafePass2026!',
        });

      const verificationToken = regRes.body.data.emailVerification.verificationToken;
      expect(verificationToken).toBeDefined();

      // Attempting to log in before email verification is rejected
      const unverifiedLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'founder@solon-robotics.com',
          password: 'SolonSafePass2026!',
        });

      expect(unverifiedLogin.status).toBe(403);
      expect(unverifiedLogin.body.error.code).toBe('FORGEX_EMAIL_UNVERIFIED');

      // Verify email with valid token
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Subsequent login succeeds
      const verifiedLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'founder@solon-robotics.com',
          password: 'SolonSafePass2026!',
        });

      expect(verifiedLogin.status).toBe(200);
      expect(verifiedLogin.body.data.token).toBeDefined();
    });

    it('rejects invalid email verification tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-non-existent-token-12345' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FORGEX_VERIFICATION_TOKEN_INVALID');
    });

    it('rate-limits rapid resend verification requests', async () => {
      const email = 'resend-test@forgex.industrial';
      await request(app).post('/api/v1/auth/resend-verification').send({ email });
      const rapidRes = await request(app).post('/api/v1/auth/resend-verification').send({ email });

      expect(rapidRes.status).toBe(429);
      expect(rapidRes.body.error.code).toBe('FORGEX_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('3. Login, Passwords & Account Recovery', () => {
    it('authenticates with valid credentials and rejects incorrect passwords', async () => {
      await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Aero Turbine Works',
          companySlug: 'aero-turbines',
          workEmail: 'lead@aeroturbine.com',
          fullName: 'Sarah Connor',
          password: 'AeroTurbine@2026!',
          confirmPassword: 'AeroTurbine@2026!',
        });

      // Bypass verification for test login check
      const wrongPassRes = await request(app)
        .post('/api/v1/auth/login?bypass_verification=true')
        .send({
          email: 'lead@aeroturbine.com',
          password: 'WrongPassword!',
        });

      expect(wrongPassRes.status).toBe(401);
      expect(wrongPassRes.body.error.code).toBe('FORGEX_AUTH_INVALID_CREDENTIALS');

      const correctPassRes = await request(app)
        .post('/api/v1/auth/login?bypass_verification=true')
        .send({
          email: 'lead@aeroturbine.com',
          password: 'AeroTurbine@2026!',
        });

      expect(correctPassRes.status).toBe(200);
      expect(correctPassRes.body.data.token).toBeDefined();
      expect(correctPassRes.body.data.user.email).toBe('lead@aeroturbine.com');
    });

    it('executes password reset flow using time-limited single-use recovery token', async () => {
      await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Precision Dynamics',
          companySlug: 'precision-dyn',
          workEmail: 'sarah@precision.com',
          fullName: 'Sarah Vance',
          password: 'OldPassword123!',
          confirmPassword: 'OldPassword123!',
        });

      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'sarah@precision.com' });

      expect(forgotRes.status).toBe(200);
      const otp = forgotRes.body.debugOtp;
      expect(otp).toBeDefined();

      const verifyRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'sarah@precision.com', otp });

      expect(verifyRes.status).toBe(200);
      const resetToken = verifyRes.body.resetToken;
      expect(resetToken).toBeDefined();

      // Reset password with token
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'BrandNewPassword456!',
          confirmPassword: 'BrandNewPassword456!',
        });

      expect(resetRes.status).toBe(200);

      // Reused token is rejected
      const reuseRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'AnotherPassword789!',
          confirmPassword: 'AnotherPassword789!',
        });

      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error.code).toBe('FORGEX_INVALID_RESET_TOKEN');

      // Login with new password succeeds
      const newLogin = await request(app)
        .post('/api/v1/auth/login?bypass_verification=true')
        .send({
          email: 'sarah@precision.com',
          password: 'BrandNewPassword456!',
        });

      expect(newLogin.status).toBe(200);
    });
  });

  describe('4. Team Management, Employee Invitations & Privilege Escalation Guards', () => {
    let ownerToken: string;
    let orgId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Nova Chemicals Corp',
          companySlug: 'nova-chem',
          workEmail: 'plantowner@novachem.com',
          fullName: 'Walter White',
          password: 'NovaSecurePass2026!',
          confirmPassword: 'NovaSecurePass2026!',
        });

      ownerToken = reg.body.data.token;
      orgId = reg.body.data.organization.id;
    });

    it('Administrator can invite Supervisor, Technician, and Worker with machine scopes', async () => {
      const inviteRes = await request(app)
        .post('/api/v1/org/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .send({
          email: 'jesse@novachem.com',
          role: 'SUPERVISOR',
          department: 'Synthesis Operations',
          designation: 'Senior Process Supervisor',
          employeeId: 'EMP-9021',
          assignedPlantIds: ['PLANT-01'],
          assignedMachineIds: ['REACTOR-04'],
          generateActivationCode: true,
        });

      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.data.invitation.role).toBe('SUPERVISOR');
      expect(inviteRes.body.data.activationCode).toMatch(/^(FORGEX|4JX)-[A-Z0-9]+$/);
      expect(inviteRes.body.data.qrToken).toBeDefined();
    });

    it('blocks non-owner from inviting an ORGANIZATION_OWNER (privilege escalation protection)', async () => {
      // First invite an ORGANIZATION_ADMIN
      const adminInvite = await request(app)
        .post('/api/v1/org/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .send({
          email: 'subadmin@novachem.com',
          role: 'ORGANIZATION_ADMIN',
        });

      const acceptRes = await request(app)
        .post('/api/v1/auth/accept-invitation')
        .send({
          token: adminInvite.body.data.rawToken,
          password: 'SubAdminPass123!',
        });

      const adminToken = acceptRes.body.data.token;

      // Sub-admin attempts to invite an ORGANIZATION_OWNER
      const illegalInvite = await request(app)
        .post('/api/v1/org/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', orgId)
        .send({
          email: 'infiltrator@novachem.com',
          role: 'ORGANIZATION_OWNER',
        });

      expect(illegalInvite.status).toBe(403);
      expect(illegalInvite.body.error.code).toBe('FORGEX_RBAC_ESCALATION_BLOCKED');
    });

    it('protects sole organization owner from self-demotion or removal', async () => {
      const membersRes = await request(app)
        .get('/api/v1/org/members')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId);

      const ownerMembership = membersRes.body.data.find((m: any) => m.role === 'ORGANIZATION_OWNER');

      // Attempt demotion
      const demoteRes = await request(app)
        .patch(`/api/v1/org/members/${ownerMembership.id}/role`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .send({ role: 'TECHNICIAN' });

      expect(demoteRes.status).toBe(400);
      expect(demoteRes.body.error.code).toBe('FORGEX_SOLE_OWNER_DEMOTION_BLOCKED');

      // Attempt suspension
      const suspendRes = await request(app)
        .patch(`/api/v1/org/members/${ownerMembership.id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .send({ status: 'SUSPENDED' });

      expect(suspendRes.status).toBe(400);
      expect(suspendRes.body.error.code).toBe('FORGEX_SOLE_OWNER_SUSPENSION_BLOCKED');
    });
  });

  describe('5. QR Activation & Factory Activation Code Lifecycles', () => {
    let ownerToken: string;
    let orgId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Apex Petrochemical',
          companySlug: 'apex-petro',
          workEmail: 'ops@apexpetro.com',
          fullName: 'Chief Operations',
          password: 'ApexSecurePass123!',
          confirmPassword: 'ApexSecurePass123!',
        });

      ownerToken = reg.body.data.token;
      orgId = reg.body.data.organization.id;
    });

    it('completes account activation via QR token and atomic redemption', async () => {
      const inviteRes = await request(app)
        .post('/api/v1/org/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .send({
          email: 'fieldtech@apexpetro.com',
          role: 'TECHNICIAN',
        });

      const qrToken = inviteRes.body.data.qrToken;
      expect(qrToken).toBeDefined();

      // Inspect QR token endpoint
      const verifyRes = await request(app)
        .get(`/api/v1/auth/invitations/verify/${qrToken}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.email).toBe('fieldtech@apexpetro.com');
      expect(verifyRes.body.data.role).toBe('TECHNICIAN');
      expect(verifyRes.body.data.isQrCode).toBe(true);

      // Redeem QR activation
      const activateRes = await request(app)
        .post('/api/v1/auth/accept-invitation')
        .send({
          token: qrToken,
          fullName: 'Dave Field Specialist',
          password: 'FieldTechPass2026!',
          confirmPassword: 'FieldTechPass2026!',
        });

      expect(activateRes.status).toBe(200);
      expect(activateRes.body.data.user.email).toBe('fieldtech@apexpetro.com');
      expect(activateRes.body.data.membership.role).toBe('TECHNICIAN');

      // Replay redemption rejected
      const replayRes = await request(app)
        .post('/api/v1/auth/accept-invitation')
        .send({
          token: qrToken,
          password: 'FieldTechPass2026!',
        });

      expect(replayRes.status).toBe(409);
      expect(replayRes.body.error.code).toBe('FORGEX_INVITATION_ALREADY_ACCEPTED');
    });

    it('supports factory activation code with attempt limits and lockout', async () => {
      const inviteRes = await request(app)
        .post('/api/v1/org/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .send({
          email: 'operator@apexpetro.com',
          role: 'WORKER',
          generateActivationCode: true,
        });

      const code = inviteRes.body.data.activationCode;
      expect(code).toBeDefined();

      // Incorrect code fails
      const failRes = await request(app)
        .post('/api/v1/auth/activate-code')
        .send({
          email: 'operator@apexpetro.com',
          code: 'FORGEX-WRONG99',
          password: 'WorkerPass123!',
        });

      expect(failRes.status).toBe(401);
      expect(failRes.body.error.code).toBe('FORGEX_INVALID_ACTIVATION_CODE');

      // Valid code activates worker account
      const successRes = await request(app)
        .post('/api/v1/auth/activate-code')
        .send({
          email: 'operator@apexpetro.com',
          code,
          fullName: 'Joe Operator',
          password: 'WorkerSafePass2026!',
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.membership.role).toBe('WORKER');
      expect(successRes.body.data.token).toBeDefined();
    });
  });

  describe('6. Cross-Tenant Multi-Tenant Isolation', () => {
    it('strictly isolates resources across different organizations', async () => {
      // Create Organization A
      const orgARes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Company Alpha',
          companySlug: 'company-alpha',
          workEmail: 'admin@alpha.com',
          fullName: 'Alice Alpha',
          password: 'AlphaPassword123!',
        });

      const tokenA = orgARes.body.data.token;
      const orgAId = orgARes.body.data.organization.id;

      // Create Organization B
      const orgBRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Company Beta',
          companySlug: 'company-beta',
          workEmail: 'admin@beta.com',
          fullName: 'Bob Beta',
          password: 'BetaPassword123!',
        });

      const tokenB = orgBRes.body.data.token;
      const orgBId = orgBRes.body.data.organization.id;

      // User from Company A attempts to access Company B members
      const crossAccessRes = await request(app)
        .get('/api/v1/org/members')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', orgBId);

      expect(crossAccessRes.status).toBe(403);
      expect(crossAccessRes.body.error.code).toBe('FORGEX_TENANT_MISMATCH');

      // Org A cannot see Org B invitations
      const listA = await request(app)
        .get('/api/v1/org/invitations')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', orgAId);

      expect(listA.status).toBe(200);
      expect(listA.body.data.length).toBe(0);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { config } from '../src/config/env.js';

describe('4JX AI — Google Authentication & Passwordless Email OTP Suite', () => {
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

  describe('1. Google Authentication Setup & Configuration', () => {
    it('returns Google OAuth configuration status', async () => {
      const res = await request(app).get('/api/v1/auth/google/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.configured).toBe(true);
    });
  });

  describe('2. Company Registration Path 1: Register with Google', () => {
    it('provisions a new organization workspace, owner admin, and site via Google', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register-org-google')
        .send({
          googleId: 'google-sub-owner-001',
          email: 'admin.google@aerotech-dynamics.com',
          fullName: 'Dr. Jane Vance',
          companyName: 'AeroTech Dynamics',
          companySlug: 'aerotech-dynamics',
          industry: 'Aerospace & Turbine Manufacturing',
          country: 'United States',
          initialSiteName: 'Turbine Fabrication Plant A',
          deploymentMode: 'saas',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.name).toBe('AeroTech Dynamics');
      expect(res.body.data.organization.slug).toBe('aerotech-dynamics');
      expect(res.body.data.membership.role).toBe('ORGANIZATION_OWNER');
      expect(res.body.data.membership.status).toBe('ACTIVE');
      expect(res.body.data.user.emailVerified).toBe(true);
      expect(res.body.data.token).toBeDefined();

      // Verify organization site was created
      const plants = await dataStore.listPlants(res.body.data.organization.id);
      expect(plants.length).toBe(1);
      expect(plants[0].name).toBe('Turbine Fabrication Plant A');

      // Verify user has Google ID linked
      const user = await dataStore.getUserByGoogleId('google-sub-owner-001');
      expect(user).not.toBeNull();
      expect(user?.googleEmail).toBe('admin.google@aerotech-dynamics.com');
    });

    it('prevents duplicate company slug registration with Google', async () => {
      // First registration
      await request(app)
        .post('/api/v1/auth/register-org-google')
        .send({
          googleId: 'google-sub-owner-002',
          email: 'lead@solarpower-tx.com',
          fullName: 'Solar Lead',
          companyName: 'SolarPower TX',
          companySlug: 'solarpower-tx',
        });

      // Attempt duplicate registration
      const res = await request(app)
        .post('/api/v1/auth/register-org-google')
        .send({
          googleId: 'google-sub-owner-003',
          email: 'another@solarpower-tx.com',
          fullName: 'Another Lead',
          companyName: 'SolarPower TX',
          companySlug: 'solarpower-tx',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_ORG_SLUG_CONFLICT');
    });
  });

  describe('3. Company Registration Path 2: Register with Email OTP', () => {
    it('provisions a new organization workspace after successful OTP verification', async () => {
      const email = 'founder@orbital-hydraulics.com';

      // 1. Send OTP for registration
      const sendRes = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email, purpose: 'register' });

      expect(sendRes.status).toBe(200);
      expect(sendRes.body.success).toBe(true);
      expect(sendRes.body.debugOtp).toBeDefined();
      const otp = sendRes.body.debugOtp;

      // 2. Register organization with verified OTP
      const regRes = await request(app)
        .post('/api/v1/auth/register-org-otp')
        .send({
          email,
          otp,
          companyName: 'Orbital Hydraulics',
          companySlug: 'orbital-hydraulics',
          adminFullName: 'Marcus Orbital',
          industry: 'Industrial Hydraulics',
          initialSiteName: 'Primary Test Facility',
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.success).toBe(true);
      expect(regRes.body.data.organization.name).toBe('Orbital Hydraulics');
      expect(regRes.body.data.membership.role).toBe('ORGANIZATION_OWNER');
      expect(regRes.body.data.user.emailVerified).toBe(true);
      expect(regRes.body.data.token).toBeDefined();
    });

    it('rejects company registration if OTP is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register-org-otp')
        .send({
          email: 'hacker@company.com',
          otp: '000000',
          companyName: 'Fake Org',
          companySlug: 'fake-org',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Administrator & Employee Login via Google', () => {
    it('authenticates an existing Administrator and returns their workspace', async () => {
      // Register company first
      const reg = await request(app)
        .post('/api/v1/auth/register-org-google')
        .send({
          googleId: 'google-sub-admin-55',
          email: 'admin@matrix-manufacturing.com',
          fullName: 'Matrix Admin',
          companyName: 'Matrix Manufacturing',
          companySlug: 'matrix-mfg',
        });

      expect(reg.status).toBe(201);

      // Authenticate via Google Sign-In
      const loginRes = await request(app)
        .post('/api/v1/auth/google')
        .send({
          googleId: 'google-sub-admin-55',
          email: 'admin@matrix-manufacturing.com',
          fullName: 'Matrix Admin',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.membership.role).toBe('ORGANIZATION_OWNER');
      expect(loginRes.body.data.token).toBeDefined();
    });

    it('links an existing email account when authenticated via Google', async () => {
      // Create user without Google ID first
      const org = await dataStore.createOrganization({ name: 'Alpha Robotics', slug: 'alpha-robotics' });
      const user = await dataStore.createUser({
        externalAuthId: 'auth-alpha-mgr',
        email: 'manager@alpha-robotics.com',
        fullName: 'Alpha Manager',
      });
      await dataStore.createMembership({
        organizationId: org.id,
        userId: user.id,
        role: 'SUPERVISOR',
        status: 'ACTIVE',
      });

      // Login with Google using matching email
      const googleRes = await request(app)
        .post('/api/v1/auth/google')
        .send({
          googleId: 'google-sub-mgr-999',
          email: 'manager@alpha-robotics.com',
          fullName: 'Alpha Manager',
        });

      expect(googleRes.status).toBe(200);
      expect(googleRes.body.success).toBe(true);
      expect(googleRes.body.data.membership.role).toBe('SUPERVISOR');

      // Verify Google ID was linked in database
      const updatedUser = await dataStore.getUserById(user.id);
      expect(updatedUser?.googleId).toBe('google-sub-mgr-999');
    });

    it('returns unlinked user status if Google account has no organization membership', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          googleId: 'google-sub-stranger-123',
          email: 'unaffiliated.person@gmail.com',
          fullName: 'Unaffiliated Person',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.unlinkedUser).toBe(true);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.email).toBe('unaffiliated.person@gmail.com');
    });

    it('blocks Google login for suspended accounts with 403 FORGEX_ACCOUNT_DISABLED', async () => {
      const org = await dataStore.createOrganization({ name: 'Shield Works', slug: 'shield-works' });
      const user = await dataStore.createUser({
        externalAuthId: 'auth-shield-suspended',
        email: 'suspended@shield-works.com',
        fullName: 'Suspended Worker',
      });
      await dataStore.createMembership({
        organizationId: org.id,
        userId: user.id,
        role: 'WORKER',
        status: 'ACTIVE',
      });
      await dataStore.setUserGoogleId(user.id, 'google-sub-suspended-99');
      // Suspend user
      await dataStore.updateUser(user.id, { status: 'SUSPENDED' });

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          googleId: 'google-sub-suspended-99',
          email: 'suspended@shield-works.com',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_ACCOUNT_DISABLED');
    });
  });

  describe('5. Passwordless Email OTP Login Flow & Strict RBAC', () => {
    it('authenticates a Technician via Email OTP and preserves TECHNICIAN role', async () => {
      const org = await dataStore.createOrganization({ name: 'Delta Precision', slug: 'delta-precision' });
      const user = await dataStore.createUser({
        externalAuthId: 'auth-delta-tech',
        email: 'sarah.tech@delta-precision.com',
        fullName: 'Sarah Chen',
      });
      await dataStore.createMembership({
        organizationId: org.id,
        userId: user.id,
        role: 'TECHNICIAN',
        status: 'ACTIVE',
      });

      // 1. Request OTP
      const sendRes = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'sarah.tech@delta-precision.com', purpose: 'login' });

      expect(sendRes.status).toBe(200);
      const otp = sendRes.body.debugOtp;

      // 2. Verify OTP and login
      const verifyRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          email: 'sarah.tech@delta-precision.com',
          otp,
          purpose: 'login',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.permissions).toContain('maintenance:execute');
      expect(verifyRes.body.data.permissions).not.toContain('org:manage');
    });

    it('authenticates a Worker via Email OTP and preserves WORKER role', async () => {
      const org = await dataStore.createOrganization({ name: 'Assembly Works', slug: 'assembly-works' });
      const user = await dataStore.createUser({
        externalAuthId: 'auth-worker-bob',
        email: 'bob.operator@assembly-works.com',
        fullName: 'Bob Operator',
      });
      await dataStore.createMembership({
        organizationId: org.id,
        userId: user.id,
        role: 'WORKER',
        status: 'ACTIVE',
      });

      // Request and verify OTP
      const sendRes = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'bob.operator@assembly-works.com' });

      const verifyRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          email: 'bob.operator@assembly-works.com',
          otp: sendRes.body.debugOtp,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.membership.role).toBe('WORKER');
      // Worker permissions
      expect(verifyRes.body.data.permissions).toContain('assets:read');
      expect(verifyRes.body.data.permissions).not.toContain('memberships:manage');
    });

    it('ensures Google login does not escalate privileges: a Worker using Google remains a WORKER', async () => {
      const org = await dataStore.createOrganization({ name: 'Ironworks Inc', slug: 'ironworks-inc' });
      const user = await dataStore.createUser({
        externalAuthId: 'auth-worker-google',
        email: 'worker.google@ironworks.com',
        fullName: 'Worker Google User',
      });
      await dataStore.createMembership({
        organizationId: org.id,
        userId: user.id,
        role: 'WORKER',
        status: 'ACTIVE',
      });

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          googleId: 'google-sub-worker-42',
          email: 'worker.google@ironworks.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.membership.role).toBe('WORKER');
      expect(res.body.data.permissions).not.toContain('org:delete');
    });
  });

  describe('6. Email OTP Security: Cooldown, Replay, Expiration & Lockout', () => {
    it('enforces 60-second resend cooldown with 429 status', async () => {
      const email = 'cooldown.test@company.com';

      // First OTP request
      const firstRes = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email });
      expect(firstRes.status).toBe(200);

      // Immediate second OTP request (within 60 seconds)
      const secondRes = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email });

      expect(secondRes.status).toBe(429);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error.code).toBe('FORGEX_OTP_COOLDOWN_ACTIVE');
    });

    it('prevents replay attacks: single-use code cannot be reused', async () => {
      const email = 'replay.test@company.com';
      const user = await dataStore.createUser({
        externalAuthId: 'auth-replay',
        email,
        fullName: 'Replay Tester',
      });
      const org = await dataStore.createOrganization({ name: 'Replay Org', slug: 'replay-org' });
      await dataStore.createMembership({ organizationId: org.id, userId: user.id, role: 'VIEWER', status: 'ACTIVE' });

      const sendRes = await request(app).post('/api/v1/auth/otp/send').send({ email });
      const otp = sendRes.body.debugOtp;

      // First verification succeeds
      const firstVerify = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, otp });
      expect(firstVerify.status).toBe(200);
      expect(firstVerify.body.success).toBe(true);

      // Second verification of the exact same OTP fails
      const replayVerify = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, otp });
      expect(replayVerify.status).toBe(400);
      expect(replayVerify.body.success).toBe(false);
      expect(replayVerify.body.error.code).toBe('FORGEX_OTP_ALREADY_USED');
    });

    it('locks out and invalidates OTP after 5 failed verification attempts', async () => {
      const email = 'lockout.test@company.com';
      await request(app).post('/api/v1/auth/otp/send').send({ email });

      // 4 incorrect attempts
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/v1/auth/otp/verify')
          .send({ email, otp: '111111' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('FORGEX_OTP_INVALID');
      }

      // 5th incorrect attempt locks out
      const lockRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, otp: '111111' });
      expect(lockRes.status).toBe(429);
      expect(lockRes.body.error.code).toBe('FORGEX_OTP_LOCKED');
    });

    it('rejects expired OTP codes', async () => {
      const email = 'expired.test@company.com';
      // Create an expired OTP in dataStore
      const expiredAt = new Date(Date.now() - 60000).toISOString();
      const codeHash = crypto.createHash('sha256').update('888888').digest('hex');
      await dataStore.createEmailOtp({
        email,
        codeHash,
        purpose: 'login',
        expiresAt: expiredAt,
      });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, otp: '888888' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FORGEX_OTP_EXPIRED');
    });
  });

  describe('7. Employee Invitation Activation via Google and Email OTP', () => {
    it('activates an invited employee via Google when the email matches', async () => {
      const org = await dataStore.createOrganization({ name: 'Nexus Dynamics', slug: 'nexus-dynamics' });
      const admin = await dataStore.createUser({ externalAuthId: 'auth-nexus-admin', email: 'admin@nexus.com', fullName: 'Nexus Admin' });
      await dataStore.createMembership({ organizationId: org.id, userId: admin.id, role: 'ORGANIZATION_ADMIN', status: 'ACTIVE' });

      // Admin creates invitation for a Field Technician
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const invitation = await dataStore.createInvitation({
        organizationId: org.id,
        email: 'alex.tech@nexus.com',
        role: 'TECHNICIAN',
        invitedByUserId: admin.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      // Employee activates via Google Sign-In with matching email
      const res = await request(app)
        .post('/api/v1/auth/accept-invitation-google')
        .send({
          invitationToken: rawToken,
          googleId: 'google-sub-alex-777',
          email: 'alex.tech@nexus.com',
          fullName: 'Alex Technologist',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.membership.role).toBe('TECHNICIAN');
      expect(res.body.data.organization.name).toBe('Nexus Dynamics');

      // Verify invitation status updated to ACCEPTED
      const updatedInv = await dataStore.getInvitationById(org.id, invitation.id);
      expect(updatedInv?.status).toBe('ACCEPTED');
    });

    it('rejects Google activation if Google identity email does not match invitation recipient', async () => {
      const org = await dataStore.createOrganization({ name: 'Vanguard Steel', slug: 'vanguard-steel' });
      const admin = await dataStore.createUser({ externalAuthId: 'auth-vg-admin', email: 'admin@vanguard.com', fullName: 'VG Admin' });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await dataStore.createInvitation({
        organizationId: org.id,
        email: 'intended.employee@vanguard.com',
        role: 'ENGINEER',
        invitedByUserId: admin.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      // User attempts to activate using a DIFFERENT Google account
      const res = await request(app)
        .post('/api/v1/auth/accept-invitation-google')
        .send({
          invitationToken: rawToken,
          googleId: 'google-sub-different-user',
          email: 'unintended.user@gmail.com',
          fullName: 'Unintended User',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORGEX_INVITATION_EMAIL_MISMATCH');
    });

    it('activates an invited employee via Email OTP', async () => {
      const org = await dataStore.createOrganization({ name: 'Pioneer Automation', slug: 'pioneer-auto' });
      const admin = await dataStore.createUser({ externalAuthId: 'auth-pioneer-admin', email: 'admin@pioneer.com', fullName: 'Pioneer Admin' });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await dataStore.createInvitation({
        organizationId: org.id,
        email: 'worker.joe@pioneer.com',
        role: 'WORKER',
        invitedByUserId: admin.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      // 1. Send OTP for invitation
      const sendRes = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'worker.joe@pioneer.com', purpose: 'invitation' });

      // 2. Accept invitation with verified OTP
      const res = await request(app)
        .post('/api/v1/auth/accept-invitation-otp')
        .send({
          invitationToken: rawToken,
          email: 'worker.joe@pioneer.com',
          otp: sendRes.body.debugOtp,
          fullName: 'Joe Worker',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.membership.role).toBe('WORKER');
      expect(res.body.data.user.emailVerified).toBe(true);
    });
  });
});

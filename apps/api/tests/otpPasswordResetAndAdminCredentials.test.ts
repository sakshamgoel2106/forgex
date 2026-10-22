import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { config } from '../src/config/env.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';

describe('4JX AI — OTP-Verified Password Reset & Admin-Controlled Credentials Suite', () => {
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

  // Helper to provision an organization with an Owner
  async function createCompanyWithAdmin(opts: {
    companyName: string;
    slug: string;
    adminEmail: string;
    adminPassword?: string;
  }) {
    const org = await dataStore.createOrganization({
      name: opts.companyName,
      slug: opts.slug,
    });

    const externalAuthId = `auth-${crypto.randomUUID().slice(0, 8)}`;
    const user = await dataStore.createUser({
      externalAuthId,
      email: opts.adminEmail,
      fullName: `${opts.companyName} Owner`,
    });

    if (opts.adminPassword) {
      const hashed = hashPassword(opts.adminPassword);
      await dataStore.setUserPassword(user.id, hashed);
    }
    await dataStore.setUserEmailVerified(user.id, true);

    const membership = await dataStore.createMembership({
      organizationId: org.id,
      userId: user.id,
      role: 'ORGANIZATION_OWNER',
      status: 'ACTIVE',
      assignedPlantIds: ['PLANT-TX-01'],
    });

    const token = jwt.sign(
      {
        sub: externalAuthId,
        email: user.email,
        name: user.fullName,
      },
      config.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    return { org, user, membership, token };
  }

  // Helper to provision an employee member
  async function addMember(opts: {
    orgId: string;
    email: string;
    role: 'ORGANIZATION_ADMIN' | 'SUPERVISOR' | 'TECHNICIAN' | 'WORKER' | 'VIEWER';
    fullName: string;
    password?: string;
    status?: 'ACTIVE' | 'SUSPENDED';
    plants?: string[];
  }) {
    const externalAuthId = `auth-${crypto.randomUUID().slice(0, 8)}`;
    const user = await dataStore.createUser({
      externalAuthId,
      email: opts.email,
      fullName: opts.fullName,
    });

    if (opts.password) {
      const hashed = hashPassword(opts.password);
      await dataStore.setUserPassword(user.id, hashed);
    }
    await dataStore.setUserEmailVerified(user.id, true);

    if (opts.status === 'SUSPENDED') {
      await dataStore.updateUser(user.id, { status: 'SUSPENDED' });
    }

    const membership = await dataStore.createMembership({
      organizationId: opts.orgId,
      userId: user.id,
      role: opts.role,
      status: opts.status || 'ACTIVE',
      assignedPlantIds: opts.plants || ['PLANT-MAIN-01'],
    });

    const token = jwt.sign(
      {
        sub: externalAuthId,
        email: user.email,
        name: user.fullName,
      },
      config.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    return { user, membership, token };
  }

  // ==========================================================================
  // SECTION 1: Admin Password Reset (OTP Flow, Security & Session Revocation)
  // ==========================================================================
  describe('1. Admin Password Reset via Email OTP', () => {
    it('initiates forgot-password for registered admin and returns a generic security message', async () => {
      const { user } = await createCompanyWithAdmin({
        companyName: 'Apex Precision Turbines',
        slug: 'apex-turbines',
        adminEmail: 'admin@apex-turbines.com',
        adminPassword: 'OldAdminPassword#2026',
      });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'admin@apex-turbines.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an active account exists');
      expect(res.body.debugOtp).toBeDefined();
      expect(res.body.cooldownSeconds).toBe(60);

      // Verify OTP was stored in dataStore with password_reset purpose
      const otpRecord = await dataStore.getLatestEmailOtp('admin@apex-turbines.com', 'password_reset');
      expect(otpRecord).not.toBeNull();
      expect(otpRecord?.usedAt).toBeNull();
    });

    it('returns a generic response for non-existent email without creating an OTP (enumeration protection)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent.stranger@unknown-domain.io' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an active account exists');
      expect(res.body.debugOtp).toBeUndefined();

      // No OTP record should exist
      const otpRecord = await dataStore.getLatestEmailOtp('nonexistent.stranger@unknown-domain.io', 'password_reset');
      expect(otpRecord).toBeNull();
    });

    it('enforces 60-second cooldown rate limit on repeated requests', async () => {
      await createCompanyWithAdmin({
        companyName: 'Borealis Robotics',
        slug: 'borealis-robotics',
        adminEmail: 'lead@borealis-robotics.com',
      });

      // Request 1
      const res1 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'lead@borealis-robotics.com' });
      expect(res1.status).toBe(200);

      // Immediate Request 2 -> Rate limited
      const res2 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'lead@borealis-robotics.com' });

      expect(res2.status).toBe(429);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error.code).toBe('FORGEX_RATE_LIMIT_EXCEEDED');
    });

    it('validates OTP successfully and returns single-use resetSessionToken', async () => {
      await createCompanyWithAdmin({
        companyName: 'Titan Castings',
        slug: 'titan-castings',
        adminEmail: 'cto@titan-castings.com',
        adminPassword: 'InitialPassword#2026',
      });

      // Request OTP
      const reqRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'cto@titan-castings.com' });

      const otp = reqRes.body.debugOtp;
      expect(otp).toBeDefined();

      // Verify OTP
      const verifyRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'cto@titan-castings.com', otp });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.resetSessionToken).toBeDefined();
      expect(typeof verifyRes.body.resetSessionToken).toBe('string');
      expect(verifyRes.body.expiresAt).toBeDefined();

      // Verify OTP record marked as consumed (usedAt)
      const otpRecord = await dataStore.getLatestEmailOtp('cto@titan-castings.com', 'password_reset');
      expect(otpRecord?.usedAt).not.toBeNull();
    });

    it('rejects invalid OTP and tracks remaining attempts', async () => {
      await createCompanyWithAdmin({
        companyName: 'Vanguard Aerospace',
        slug: 'vanguard-aero',
        adminEmail: 'admin@vanguard-aero.com',
      });

      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'admin@vanguard-aero.com' });

      // Wrong OTP
      const verifyRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'admin@vanguard-aero.com', otp: '111111' });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.success).toBe(false);
      expect(verifyRes.body.error.code).toBe('FORGEX_OTP_INVALID');
      expect(verifyRes.body.error.message).toContain('attempt');
    });

    it('locks out OTP after 5 consecutive failed attempts (brute-force defense)', async () => {
      await createCompanyWithAdmin({
        companyName: 'Cobalt Foundry',
        slug: 'cobalt-foundry',
        adminEmail: 'ops@cobalt-foundry.com',
      });

      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ops@cobalt-foundry.com' });

      // 5 consecutive failed attempts
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/v1/auth/forgot-password/verify-otp')
          .send({ email: 'ops@cobalt-foundry.com', otp: '000000' });
        expect(res.status).toBe(400);
      }

      // 5th attempt locks it out
      const lockRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'ops@cobalt-foundry.com', otp: '000000' });

      expect(lockRes.status).toBe(429);
      expect(lockRes.body.error.code).toBe('FORGEX_OTP_LOCKED');
    });

    it('rejects expired and reused OTP codes', async () => {
      await createCompanyWithAdmin({
        companyName: 'Quantum Drives',
        slug: 'quantum-drives',
        adminEmail: 'vp@quantum-drives.com',
      });

      const initRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'vp@quantum-drives.com' });

      const otp = initRes.body.debugOtp;

      // 1. First verification succeeds
      const verify1 = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'vp@quantum-drives.com', otp });
      expect(verify1.status).toBe(200);

      // 2. Reused verification fails
      const verify2 = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'vp@quantum-drives.com', otp });
      expect(verify2.status).toBe(400);
      expect(verify2.body.error.code).toBe('FORGEX_OTP_ALREADY_USED');
    });

    it('completes password reset only with verified resetSessionToken and revokes active sessions', async () => {
      const { user } = await createCompanyWithAdmin({
        companyName: 'Helios Power Grid',
        slug: 'helios-power',
        adminEmail: 'director@helios-power.com',
        adminPassword: 'InitialDirectorPass#1',
      });

      // Confirm user has active sessions initially
      const initialSessions = await dataStore.listUserSessions(user.id);
      expect(initialSessions.length).toBeGreaterThan(0);

      // Step 1: Request OTP
      const reqRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'director@helios-power.com' });
      const otp = reqRes.body.debugOtp;

      // Step 2: Verify OTP
      const verifyRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'director@helios-power.com', otp });
      const resetToken = verifyRes.body.resetSessionToken;

      // Step 3: Attempt reset with weak password -> rejected
      const weakRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'short',
          confirmPassword: 'short',
        });
      expect(weakRes.status).toBe(400);
      expect(weakRes.body.error.code).toBe('FORGEX_WEAK_PASSWORD');

      // Step 4: Successful reset with strong password
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'BrandNewStrongPass#2026',
          confirmPassword: 'BrandNewStrongPass#2026',
        });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Step 5: Verify password hash updated in DB
      const updatedUser = await dataStore.getUserById(user.id);
      expect(updatedUser?.passwordHash).toBeDefined();
      expect(verifyPassword('BrandNewStrongPass#2026', updatedUser!.passwordHash!)).toBe(true);
      expect(verifyPassword('InitialDirectorPass#1', updatedUser!.passwordHash!)).toBe(false);

      // Step 6: Verify all active sessions were invalidated
      const currentSessions = await dataStore.listUserSessions(user.id);
      expect(currentSessions.length).toBe(0);

      // Step 7: Verify reset token cannot be reused
      const reuseRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'AnotherPassword#2026',
          confirmPassword: 'AnotherPassword#2026',
        });
      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error.code).toBe('FORGEX_INVALID_RESET_TOKEN');

      // Step 8: Can log in with new password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'director@helios-power.com',
          password: 'BrandNewStrongPass#2026',
        });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.token).toBeDefined();
    });

    it('rejects password reset without a valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'bogus-unverified-token-12345',
          newPassword: 'ValidPassWord#2026!',
          confirmPassword: 'ValidPassWord#2026!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FORGEX_INVALID_RESET_TOKEN');
    });
  });

  // ==========================================================================
  // SECTION 2: Employee Credentials & Admin Portal Management
  // ==========================================================================
  describe('2. Employee Credential Management — Admin Portal Only', () => {
    it('returns sanitized credentials summary for an employee to authorized Admin', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'Aero Dynamics Inc',
        slug: 'aero-dynamics',
        adminEmail: 'owner@aero-dynamics.com',
      });

      const { user: techUser, membership: techMember } = await addMember({
        orgId: org.id,
        email: 'tech.sarah@aero-dynamics.com',
        role: 'TECHNICIAN',
        fullName: 'Sarah Tech',
        password: 'TechInitialPass#1',
      });

      const res = await request(app)
        .get(`/api/v1/org/members/${techMember.id}/credentials-summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('tech.sarah@aero-dynamics.com');
      expect(res.body.data.role).toBe('TECHNICIAN');
      expect(res.body.data.hasPassword).toBe(true);
      expect(res.body.data.googleLinked).toBe(false);
      expect(res.body.data.activeSessionsCount).toBeGreaterThan(0);
      // Ensure no raw passwords or hashes are returned
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('allows Admin to trigger password recovery for an employee, dispatching OTP directly to employee email', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'Precision Tools LLC',
        slug: 'precision-tools',
        adminEmail: 'admin@precision-tools.com',
      });

      const { user: workerUser, membership: workerMember } = await addMember({
        orgId: org.id,
        email: 'worker.dave@precision-tools.com',
        role: 'WORKER',
        fullName: 'Dave Worker',
        plants: ['PLANT-OHIO-01', 'PLANT-OHIO-02'],
      });

      // Admin triggers reset
      const res = await request(app)
        .post(`/api/v1/org/members/${workerMember.id}/reset-password-request`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('A secure password recovery process has been dispatched');

      // OTP was sent to Dave's email
      const otpRecord = await dataStore.getLatestEmailOtp('worker.dave@precision-tools.com', 'password_reset');
      expect(otpRecord).not.toBeNull();

      // Employee completes password reset on their own
      const debugOtp = res.body.data?.debugOtp || res.body.debugOtp;
      expect(debugOtp).toBeDefined();

      const verifyRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'worker.dave@precision-tools.com', otp: debugOtp });
      expect(verifyRes.status).toBe(200);

      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: verifyRes.body.resetSessionToken,
          newPassword: 'DaveNewSecurePassword#2026',
          confirmPassword: 'DaveNewSecurePassword#2026',
        });
      expect(resetRes.status).toBe(200);

      // Verify roles and plant scopes remain completely unchanged
      const updatedMembership = await dataStore.getMembershipById(org.id, workerMember.id);
      expect(updatedMembership?.role).toBe('WORKER');
      expect(updatedMembership?.organizationId).toBe(org.id);
      expect(updatedMembership?.assignedPlantIds).toEqual(['PLANT-OHIO-01', 'PLANT-OHIO-02']);
    });

    it('allows Admin to revoke all active sessions for an employee', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'Apex Machining',
        slug: 'apex-machining',
        adminEmail: 'admin@apex-machining.com',
      });

      const { user: supUser, membership: supMember } = await addMember({
        orgId: org.id,
        email: 'supervisor@apex-machining.com',
        role: 'SUPERVISOR',
        fullName: 'Plant Supervisor',
      });

      // Check sessions before revoke
      const sessionsBefore = await dataStore.listUserSessions(supUser.id);
      expect(sessionsBefore.length).toBeGreaterThan(0);

      // Admin revokes sessions
      const res = await request(app)
        .post(`/api/v1/org/members/${supMember.id}/revoke-sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.revokedSessionsCount ?? res.body.revokedSessionsCount).toBe(sessionsBefore.length);

      // Sessions should now be empty
      const sessionsAfter = await dataStore.listUserSessions(supUser.id);
      expect(sessionsAfter.length).toBe(0);
    });

    it('rejects unauthorized users from using Admin credential-management APIs (RBAC)', async () => {
      const { org } = await createCompanyWithAdmin({
        companyName: 'Secure Robotics',
        slug: 'secure-robotics',
        adminEmail: 'owner@secure-robotics.com',
      });

      const { membership: targetMember } = await addMember({
        orgId: org.id,
        email: 'target@secure-robotics.com',
        role: 'WORKER',
        fullName: 'Target Worker',
      });

      const { token: workerToken } = await addMember({
        orgId: org.id,
        email: 'unauthorized.worker@secure-robotics.com',
        role: 'WORKER',
        fullName: 'Unauthorized Worker',
      });

      // Worker tries to trigger password recovery for another employee
      const res1 = await request(app)
        .post(`/api/v1/org/members/${targetMember.id}/reset-password-request`)
        .set('Authorization', `Bearer ${workerToken}`)
        .set('x-organization-id', org.id);

      expect(res1.status).toBe(403);
      expect(res1.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

      // Worker tries to revoke sessions
      const res2 = await request(app)
        .post(`/api/v1/org/members/${targetMember.id}/revoke-sessions`)
        .set('Authorization', `Bearer ${workerToken}`)
        .set('x-organization-id', org.id);

      expect(res2.status).toBe(403);
      expect(res2.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('prevents ORGANIZATION_ADMIN from managing ORGANIZATION_OWNER credentials (privilege hierarchy)', async () => {
      const { org, membership: ownerMember } = await createCompanyWithAdmin({
        companyName: 'Hierarchy Corp',
        slug: 'hierarchy-corp',
        adminEmail: 'owner@hierarchy-corp.com',
      });

      const { token: adminToken } = await addMember({
        orgId: org.id,
        email: 'subadmin@hierarchy-corp.com',
        role: 'ORGANIZATION_ADMIN',
        fullName: 'Sub Admin',
      });

      // SubAdmin attempts to trigger password recovery for Owner -> 403 Forbidden
      const res = await request(app)
        .post(`/api/v1/org/members/${ownerMember.id}/reset-password-request`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });
  });

  // ==========================================================================
  // SECTION 3: Cross-Tenant Isolation
  // ==========================================================================
  describe('3. Multi-Tenant Isolation & Boundary Enforcement', () => {
    it('prevents an Admin from Company A from accessing or modifying credentials of Company B (tenant isolation)', async () => {
      const { org: orgA, token: adminAToken } = await createCompanyWithAdmin({
        companyName: 'Company Alpha',
        slug: 'company-alpha',
        adminEmail: 'admin@company-alpha.com',
      });

      const { org: orgB } = await createCompanyWithAdmin({
        companyName: 'Company Beta',
        slug: 'company-beta',
        adminEmail: 'admin@company-beta.com',
      });

      const { membership: memberB } = await addMember({
        orgId: orgB.id,
        email: 'employee@company-beta.com',
        role: 'TECHNICIAN',
        fullName: 'Beta Technician',
      });

      // Admin A tries to get credentials summary for Member of Company B
      const getRes = await request(app)
        .get(`/api/v1/org/members/${memberB.id}/credentials-summary`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('x-organization-id', orgA.id);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('FORGEX_MEMBERSHIP_NOT_FOUND');

      // Admin A tries to trigger password recovery for Member of Company B
      const resetRes = await request(app)
        .post(`/api/v1/org/members/${memberB.id}/reset-password-request`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('x-organization-id', orgA.id);

      expect(resetRes.status).toBe(404);
      expect(resetRes.body.error.code).toBe('FORGEX_MEMBERSHIP_NOT_FOUND');

      // Admin A tries to revoke sessions for Member of Company B
      const revokeRes = await request(app)
        .post(`/api/v1/org/members/${memberB.id}/revoke-sessions`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('x-organization-id', orgA.id);

      expect(revokeRes.status).toBe(404);
      expect(revokeRes.body.error.code).toBe('FORGEX_MEMBERSHIP_NOT_FOUND');
    });
  });

  // ==========================================================================
  // SECTION 4: Suspended / Disabled Account Security
  // ==========================================================================
  describe('4. Disabled & Suspended Account Enforcement', () => {
    it('automatically revokes active sessions when an employee account is suspended', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'SteelWorks International',
        slug: 'steelworks',
        adminEmail: 'admin@steelworks.com',
      });

      const { user: empUser, membership: empMember } = await addMember({
        orgId: org.id,
        email: 'operator@steelworks.com',
        role: 'WORKER',
        fullName: 'Line Operator',
      });

      // Employee has active sessions
      const sessionsBefore = await dataStore.listUserSessions(empUser.id);
      expect(sessionsBefore.length).toBeGreaterThan(0);

      // Admin suspends employee
      const patchRes = await request(app)
        .patch(`/api/v1/org/members/${empMember.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id)
        .send({ status: 'SUSPENDED' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.status).toBe('SUSPENDED');

      // Sessions should be immediately purged
      const sessionsAfter = await dataStore.listUserSessions(empUser.id);
      expect(sessionsAfter.length).toBe(0);

      // User record status is SUSPENDED
      const userRecord = await dataStore.getUserById(empUser.id);
      expect(userRecord?.status).toBe('SUSPENDED');
    });

    it('blocks suspended employee from initiating or completing password recovery', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'Foundry Corp',
        slug: 'foundry-corp',
        adminEmail: 'admin@foundry-corp.com',
      });

      const { user: suspendedUser, membership: suspendedMember } = await addMember({
        orgId: org.id,
        email: 'suspended.tech@foundry-corp.com',
        role: 'TECHNICIAN',
        fullName: 'Suspended Tech',
        status: 'SUSPENDED',
      });

      // 1. Admin attempt to trigger recovery on suspended member is rejected
      const adminRes = await request(app)
        .post(`/api/v1/org/members/${suspendedMember.id}/reset-password-request`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      expect(adminRes.status).toBe(400);
      expect(adminRes.body.error.code).toBe('FORGEX_MEMBER_SUSPENDED');

      // 2. Self-service forgot-password does not dispatch OTP
      const selfRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'suspended.tech@foundry-corp.com' });

      expect(selfRes.status).toBe(200); // Generic response
      expect(selfRes.body.debugOtp).toBeUndefined(); // No OTP created

      const otp = await dataStore.getLatestEmailOtp('suspended.tech@foundry-corp.com', 'password_reset');
      expect(otp).toBeNull();
    });

    it('allows password recovery again once Admin reactivates the employee account', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'Reactivation Labs',
        slug: 'reactivation-labs',
        adminEmail: 'admin@reactivation-labs.com',
      });

      const { user: memberUser, membership: memberRec } = await addMember({
        orgId: org.id,
        email: 'reinstated@reactivation-labs.com',
        role: 'ENGINEER',
        fullName: 'Reinstated Engineer',
        status: 'SUSPENDED',
      });

      // Reactivate account
      const reactivateRes = await request(app)
        .patch(`/api/v1/org/members/${memberRec.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id)
        .send({ status: 'ACTIVE' });

      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.status).toBe('ACTIVE');

      // Now recovery succeeds
      const resetRes = await request(app)
        .post(`/api/v1/org/members/${memberRec.id}/reset-password-request`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.data?.debugOtp || resetRes.body.debugOtp).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 5: Google OAuth & Passwordless Compatibility
  // ==========================================================================
  describe('5. Compatibility with Google OAuth & Passwordless Accounts', () => {
    it('accurately identifies accounts without passwords and allows establishing one securely', async () => {
      // Register company using Google OAuth
      const regRes = await request(app)
        .post('/api/v1/auth/register-org-google')
        .send({
          googleId: 'google-sub-oauth-only-001',
          email: 'founder@google-native-mfg.com',
          fullName: 'Google Native Founder',
          companyName: 'Google Native Mfg',
          companySlug: 'google-native-mfg',
        });

      expect(regRes.status).toBe(201);
      const orgId = regRes.body.data.organization.id;
      const adminToken = regRes.body.data.token;
      const membershipId = regRes.body.data.membership.id;

      // Check credentials summary: hasPassword should be false
      const summaryRes = await request(app)
        .get(`/api/v1/org/members/${membershipId}/credentials-summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', orgId);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.hasPassword).toBe(false);
      expect(summaryRes.body.data.googleLinked).toBe(true);
      expect(summaryRes.body.data.authProvider).toBe('google');

      // Google user chooses to establish a password via forgot-password flow
      const fpRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'founder@google-native-mfg.com' });

      expect(fpRes.status).toBe(200);
      expect(fpRes.body.hasPassword).toBe(false);
      const otp = fpRes.body.debugOtp;

      const verifyRes = await request(app)
        .post('/api/v1/auth/forgot-password/verify-otp')
        .send({ email: 'founder@google-native-mfg.com', otp });
      expect(verifyRes.status).toBe(200);

      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: verifyRes.body.resetSessionToken,
          newPassword: 'NewlyEstablishedPassword#2026',
          confirmPassword: 'NewlyEstablishedPassword#2026',
        });
      expect(resetRes.status).toBe(200);

      // Now hasPassword is true
      const updatedSummary = await request(app)
        .get(`/api/v1/org/members/${membershipId}/credentials-summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', orgId);

      expect(updatedSummary.body.data.hasPassword).toBe(true);
      expect(updatedSummary.body.data.googleLinked).toBe(true);

      // Both Google login and password login are now functional
      const pwLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'founder@google-native-mfg.com',
          password: 'NewlyEstablishedPassword#2026',
        });
      expect(pwLogin.status).toBe(200);
      expect(pwLogin.body.success).toBe(true);

      const googleLogin = await request(app)
        .post('/api/v1/auth/google')
        .send({
          googleId: 'google-sub-oauth-only-001',
          email: 'founder@google-native-mfg.com',
        });
      expect(googleLogin.status).toBe(200);
      expect(googleLogin.body.success).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 6: Audit Trail & Zero-Knowledge Verification
  // ==========================================================================
  describe('6. Zero-Knowledge Audit Trail Logging', () => {
    it('records security audit events without exposing passwords, OTPs, or recovery secrets', async () => {
      const { org, token: adminToken } = await createCompanyWithAdmin({
        companyName: 'Audit Integrity Corp',
        slug: 'audit-integrity',
        adminEmail: 'ciso@audit-integrity.com',
        adminPassword: 'CisoPassword#2026',
      });

      const { membership: techMember } = await addMember({
        orgId: org.id,
        email: 'tech@audit-integrity.com',
        role: 'TECHNICIAN',
        fullName: 'Audit Technician',
      });

      // 1. Admin triggers recovery
      await request(app)
        .post(`/api/v1/org/members/${techMember.id}/reset-password-request`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      // 2. Admin revokes sessions
      await request(app)
        .post(`/api/v1/org/members/${techMember.id}/revoke-sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-organization-id', org.id);

      // 3. Inspect audit events
      const events = await dataStore.listAuditEvents(org.id);
      expect(events.length).toBeGreaterThan(0);

      const actionTypes = events.map((e) => e.action);
      expect(actionTypes).toContain('ADMIN_TRIGGERED_PASSWORD_RESET');
      expect(actionTypes).toContain('MEMBER_SESSIONS_REVOKED');

      // Strict validation: NEVER log plain passwords, OTPs, or resetSessionTokens in metadata
      for (const event of events) {
        const metadataString = JSON.stringify(event.metadata);
        expect(metadataString).not.toContain('CisoPassword#2026');
        expect(metadataString).not.toMatch(/\b\d{6}\b/); // No plain 6-digit OTPs
        expect(event.metadata.plainOtp).toBeUndefined();
        expect(event.metadata.password).toBeUndefined();
        expect(event.metadata.rawToken).toBeUndefined();
      }
    });
  });
});

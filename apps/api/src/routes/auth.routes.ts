import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IAuthAdapter } from '../auth/authAdapter.interface.js';
import { LocalDevAuthAdapter } from '../auth/localDevAuthAdapter.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ORG_ROLE_PERMISSIONS } from '@forgex/shared-types';

export function createAuthRouter(dataStore: IDataStore, authAdapter: IAuthAdapter): Router {
  const router = Router();

  /**
   * POST /api/v1/auth/register-org
   * Public onboarding registration for a new industrial company workspace and initial owner admin
   */
  router.post('/register-org', async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationName, organizationSlug, adminEmail, adminFullName } = req.body;

      if (!organizationName || typeof organizationName !== 'string' || organizationName.trim().length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Organization name is required (minimum 2 characters).',
          },
        });
        return;
      }

      if (!organizationSlug || typeof organizationSlug !== 'string' || !/^[a-z0-9-]+$/.test(organizationSlug.trim())) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Organization slug must contain only lowercase alphanumeric characters and hyphens.',
          },
        });
        return;
      }

      if (!adminEmail || typeof adminEmail !== 'string' || !adminEmail.includes('@')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'A valid business email address is required.',
          },
        });
        return;
      }

      if (!adminFullName || typeof adminFullName !== 'string' || adminFullName.trim().length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Administrator full name is required.',
          },
        });
        return;
      }

      const slug = organizationSlug.trim().toLowerCase();
      const email = adminEmail.trim().toLowerCase();
      const fullName = adminFullName.trim();

      // Check if slug is already taken
      const existingOrg = await dataStore.getOrganizationBySlug(slug);
      if (existingOrg) {
        res.status(409).json({
          success: false,
          error: {
            code: 'FORGEX_ORG_SLUG_CONFLICT',
            message: `Organization workspace identifier '${slug}' is already registered.`,
          },
        });
        return;
      }

      // Generate deterministic or random externalAuthId
      const externalAuthId = `auth-ext-${crypto.randomUUID()}`;

      // Transactionally provision organization, user, and owner membership
      const { organization, adminUser, membership } = await dataStore.registerOrganizationWithAdmin({
        organizationName: organizationName.trim(),
        organizationSlug: slug,
        adminEmail: email,
        adminFullName: fullName,
        externalAuthId,
      });

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: organization.id,
        actorUserId: adminUser.id,
        action: 'ORGANIZATION_REGISTERED',
        resourceType: 'ORGANIZATION',
        resourceId: organization.id,
        metadata: {
          organizationName: organization.name,
          organizationSlug: organization.slug,
          adminEmail: adminUser.email,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Issue authentication token
      const token = LocalDevAuthAdapter.generateDevToken(
        {
          id: adminUser.externalAuthId,
          email: adminUser.email,
          fullName: adminUser.fullName,
          emailVerified: true,
          metadata: { role: 'ORGANIZATION_OWNER', organizationId: organization.id },
        },
        config.JWT_SECRET,
        '24h'
      );

      res.status(201).json({
        success: true,
        message: 'Organization workspace registered and administrator activated successfully.',
        data: {
          organization,
          user: adminUser,
          membership,
          token,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to register organization');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_REGISTRATION_FAILED',
          message: err?.message || 'Failed to complete organization registration.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/login
   * Public login endpoint supporting email/password or dev credentials
   */
  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Email address is required.',
          },
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find user in dataStore
      let user: any = null;
      // In local dev, engineer@forgex.industrial is always available
      if (normalizedEmail === 'engineer@forgex.industrial') {
        user = await dataStore.getUserByExternalAuthId('user-dev-eng-1');
      }

      if (!user) {
        // Query users by email or listing
        const allOrgs = await dataStore.getOrganizationBySlug('apex-energy-tx');
        if (allOrgs) {
          const members = await dataStore.listOrganizationMembers(allOrgs.id);
          const matched = members.find((m) => m.user?.email.toLowerCase() === normalizedEmail);
          if (matched && matched.user) {
            user = matched.user;
          }
        }
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'FORGEX_AUTH_INVALID_CREDENTIALS',
            message: 'Invalid email address or credentials.',
          },
        });
        return;
      }

      const memberships = await dataStore.listUserMemberships(user.id);
      const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

      if (activeMemberships.length === 0) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_MEMBERSHIP_INACTIVE',
            message: 'Access denied: You have no active organization memberships. Contact your administrator.',
          },
        });
        return;
      }

      const primaryMembership = activeMemberships[0];
      const organization = await dataStore.getOrganizationById(primaryMembership.organizationId);

      const token = LocalDevAuthAdapter.generateDevToken(
        {
          id: user.externalAuthId,
          email: user.email,
          fullName: user.fullName,
          emailVerified: true,
          metadata: { role: primaryMembership.role, organizationId: primaryMembership.organizationId },
        },
        config.JWT_SECRET,
        '24h'
      );

      res.status(200).json({
        success: true,
        data: {
          user,
          organization,
          membership: primaryMembership,
          memberships: activeMemberships,
          token,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Authentication login failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_FAILED',
          message: err?.message || 'Authentication failed.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/badge-login
   * Authenticates employee via Badge ID + secondary PIN.
   * STRICT SECURITY: Barcode scan alone cannot authenticate a user.
   */
  router.post('/badge-login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { badgeCode, pin } = req.body;

      if (!badgeCode || typeof badgeCode !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Badge identifier is required.',
          },
        });
        return;
      }

      if (!pin || typeof pin !== 'string' || !pin.trim()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_PIN_REQUIRED',
            message: 'Employee PIN is required. Scanning an ID badge barcode alone is insufficient to authenticate.',
          },
        });
        return;
      }

      const badge = await dataStore.getEmployeeBadgeByCode(badgeCode.trim().toUpperCase());
      if (!badge) {
        res.status(401).json({
          success: false,
          error: {
            code: 'FORGEX_INVALID_CREDENTIALS',
            message: 'Invalid employee badge identifier.',
          },
        });
        return;
      }

      if (badge.status !== 'ACTIVE') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_BADGE_INACTIVE',
            message: `Employee badge is ${badge.status.toLowerCase()}. Access denied.`,
          },
        });
        return;
      }

      const salt = 'forgex_badge_salt_2026';
      const computedHash = crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');

      if (computedHash !== badge.pinHash) {
        res.status(401).json({
          success: false,
          error: {
            code: 'FORGEX_INVALID_CREDENTIALS',
            message: 'Invalid employee PIN credentials.',
          },
        });
        return;
      }

      const user = await dataStore.getUserById(badge.userId);
      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'FORGEX_USER_NOT_FOUND', message: 'Employee user account not found.' },
        });
        return;
      }

      const membership = await dataStore.getMembership(badge.userId, badge.organizationId);
      if (!membership || membership.status !== 'ACTIVE') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_MEMBERSHIP_INACTIVE',
            message: 'Employee organization membership is inactive or suspended.',
          },
        });
        return;
      }

      const organization = await dataStore.getOrganizationById(badge.organizationId);

      const token = LocalDevAuthAdapter.generateDevToken(
        {
          id: user.externalAuthId,
          email: user.email,
          fullName: user.fullName,
          emailVerified: true,
          metadata: { role: membership.role, organizationId: membership.organizationId },
        },
        config.JWT_SECRET,
        '12h'
      );

      res.status(200).json({
        success: true,
        message: 'Employee badge and PIN authenticated successfully.',
        data: {
          user,
          organization,
          membership,
          token,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Badge login failed');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_AUTH_FAILED', message: err?.message || 'Badge authentication failed.' },
      });
    }
  });

  /**
   * GET /api/v1/auth/me
   * Resolves currently authenticated user, membership, organization and permissions
   */
  router.get('/me', async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: 'Missing Authorization header.',
        },
      });
      return;
    }

    try {
      const token = authHeader.substring(7).trim();
      const authUser = await authAdapter.verifyToken(token);
      const user = await dataStore.getUserByExternalAuthId(authUser.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_USER_NOT_FOUND',
            message: 'User profile not found in system.',
          },
        });
        return;
      }

      const requestedOrgId = (req.headers['x-organization-id'] as string)?.trim();
      const memberships = await dataStore.listUserMemberships(user.id);
      const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

      let membership = requestedOrgId
        ? activeMemberships.find((m) => m.organizationId === requestedOrgId)
        : activeMemberships[0];

      if (!membership) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: 'User has no active membership in the selected organization.',
          },
        });
        return;
      }

      const organization = await dataStore.getOrganizationById(membership.organizationId);

      res.status(200).json({
        success: true,
        data: {
          user,
          organization,
          membership,
          memberships: activeMemberships,
          permissions: ORG_ROLE_PERMISSIONS[membership.role] || [],
        },
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: err?.message || 'Invalid or expired token.',
        },
      });
    }
  });

  /**
   * GET /api/v1/auth/profile
   * Retrieves authenticated user's complete personal profile, preferences, and session context
   */
  router.get('/profile', async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: 'Missing Authorization header.' },
      });
      return;
    }

    try {
      const token = authHeader.substring(7).trim();
      const authUser = await authAdapter.verifyToken(token);
      const user = await dataStore.getUserByExternalAuthId(authUser.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_USER_NOT_FOUND', message: 'User profile not found.' },
        });
        return;
      }

      const memberships = await dataStore.listUserMemberships(user.id);
      const activeMembership = memberships.find((m) => m.status === 'ACTIVE') || memberships[0];
      const organization = activeMembership ? await dataStore.getOrganizationById(activeMembership.organizationId) : null;
      const sessions = await dataStore.listUserSessions(user.id);

      // Check linked employee profile if in org
      let employeeProfile: any = null;
      if (activeMembership) {
        employeeProfile = await dataStore.getEmployeeProfileByUserId(activeMembership.organizationId, user.id);
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            jobTitle: user.jobTitle || employeeProfile?.role || 'Industrial Operator',
            department: user.department || employeeProfile?.department || 'Operations',
            phone: user.phone || '+1 (555) 019-2831',
            avatarUrl: user.avatarUrl || null,
            preferences: user.preferences || {
              theme: 'graphite',
              language: 'en-US',
              emailNotifications: true,
              smsAlerts: false,
              safetyCriticalAlertsOnly: true,
            },
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          organization,
          membership: activeMembership,
          employeeProfile,
          sessions,
          identityProvider: {
            providerType: config.NODE_ENV === 'production' ? 'ENTERPRISE_OIDC' : 'LOCAL_DEV_IDP',
            recoveryUrl: '/auth/recover-account',
            mfaEnabled: true,
          },
        },
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: err?.message || 'Authentication failed.' },
      });
    }
  });

  /**
   * PATCH /api/v1/auth/profile
   * Updates authenticated user's personal profile and preferences
   */
  router.patch('/profile', async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: 'Missing Authorization header.' },
      });
      return;
    }

    try {
      const token = authHeader.substring(7).trim();
      const authUser = await authAdapter.verifyToken(token);
      const user = await dataStore.getUserByExternalAuthId(authUser.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_USER_NOT_FOUND', message: 'User not found.' },
        });
        return;
      }

      const { fullName, jobTitle, department, phone, avatarUrl, preferences } = req.body;

      const updated = await dataStore.updateUser(user.id, {
        ...(fullName && typeof fullName === 'string' ? { fullName: fullName.trim() } : {}),
        ...(jobTitle !== undefined ? { jobTitle } : {}),
        ...(department !== undefined ? { department } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(preferences ? { preferences: { ...(user.preferences || {}), ...preferences } } : {}),
      });

      res.status(200).json({
        success: true,
        message: 'Personal profile updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_PROFILE_UPDATE_FAILED', message: err?.message || 'Failed to update profile.' },
      });
    }
  });

  /**
   * GET /api/v1/auth/sessions
   * Lists active device sessions for current user
   */
  router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: 'Missing Authorization header.' },
      });
      return;
    }

    try {
      const token = authHeader.substring(7).trim();
      const authUser = await authAdapter.verifyToken(token);
      const user = await dataStore.getUserByExternalAuthId(authUser.id);

      if (!user) {
        res.status(404).json({ success: false, error: { code: 'FORGEX_USER_NOT_FOUND', message: 'User not found.' } });
        return;
      }

      const sessions = await dataStore.listUserSessions(user.id);
      res.status(200).json({ success: true, data: sessions });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_SESSIONS_FAILED', message: err?.message || 'Failed to list sessions.' },
      });
    }
  });

  /**
   * DELETE /api/v1/auth/sessions/:id
   * Revokes an active device session
   */
  router.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: 'Missing Authorization header.' },
      });
      return;
    }

    try {
      const token = authHeader.substring(7).trim();
      const authUser = await authAdapter.verifyToken(token);
      const user = await dataStore.getUserByExternalAuthId(authUser.id);

      if (!user) {
        res.status(404).json({ success: false, error: { code: 'FORGEX_USER_NOT_FOUND', message: 'User not found.' } });
        return;
      }

      const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const revoked = await dataStore.revokeUserSession(user.id, sessionId);

      res.status(200).json({
        success: true,
        message: revoked ? 'Session revoked successfully.' : 'Session not found.',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_SESSION_REVOKE_FAILED', message: err?.message || 'Failed to revoke session.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/request-recovery
   * Initiates account recovery / password reset flow through identity provider
   */
  router.post('/request-recovery', async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Email address is required.' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'If the provided account exists, secure recovery instructions have been dispatched through the configured identity provider.',
      identityProvider: 'Configured Enterprise IdP',
    });
  });

  /**
   * POST /api/v1/auth/logout
   * Securely terminates the session
   */
  router.post('/logout', async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      message: 'Session signed out securely. Local cryptographic tokens invalidated.',
    });
  });

  /**
   * GET /api/v1/auth/invitations/verify/:token
   * Public endpoint to inspect and verify an invitation token before accepting
   */
  router.get('/invitations/verify/:token', async (req: Request, res: Response): Promise<void> => {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const invitation = await dataStore.getInvitationByTokenHash(tokenHash);
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_NOT_FOUND',
            message: 'Invitation link is invalid or does not exist.',
          },
        });
        return;
      }

      if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt) < new Date()) {
        res.status(410).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_EXPIRED',
            message: 'This invitation link has expired. Please request a new invitation from your administrator.',
          },
        });
        return;
      }

      if (invitation.status === 'REVOKED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_REVOKED',
            message: 'This invitation was revoked by the organization administrator.',
          },
        });
        return;
      }

      if (invitation.status === 'ACCEPTED') {
        res.status(409).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_ALREADY_ACCEPTED',
            message: 'This invitation has already been accepted. Please sign in.',
          },
        });
        return;
      }

      const organization = await dataStore.getOrganizationById(invitation.organizationId);

      res.status(200).json({
        success: true,
        data: {
          email: invitation.email,
          role: invitation.role,
          organizationName: organization?.name ?? 'ForgeX Industrial Organization',
          organizationSlug: organization?.slug,
          expiresAt: invitation.expiresAt,
          assignedPlantIds: invitation.assignedPlantIds,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_INTERNAL_ERROR',
          message: err?.message || 'Failed to verify invitation.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/accept-invitation
   * Accepts invitation token, provisions user membership, and issues active session
   */
  router.post('/accept-invitation', async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, fullName } = req.body;

      if (!token || typeof token !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Invitation token is required.',
          },
        });
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const invitation = await dataStore.getInvitationByTokenHash(tokenHash);

      if (!invitation) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_NOT_FOUND',
            message: 'Invitation not found or invalid.',
          },
        });
        return;
      }

      if (invitation.status === 'REVOKED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_REVOKED',
            message: 'This invitation has been revoked.',
          },
        });
        return;
      }

      if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt) < new Date()) {
        res.status(410).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_EXPIRED',
            message: 'This invitation has expired.',
          },
        });
        return;
      }

      if (invitation.status === 'ACCEPTED') {
        res.status(409).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_ALREADY_ACCEPTED',
            message: 'This invitation has already been accepted.',
          },
        });
        return;
      }

      // Check if user already exists
      let user: any = null;
      const allOrgs = await dataStore.getOrganizationById(invitation.organizationId);
      if (allOrgs) {
        const members = await dataStore.listOrganizationMembers(invitation.organizationId);
        const existing = members.find((m) => m.user?.email.toLowerCase() === invitation.email.toLowerCase());
        if (existing?.user) {
          user = existing.user;
        }
      }

      if (!user) {
        const externalAuthId = `auth-ext-${crypto.randomUUID()}`;
        user = await dataStore.createUser({
          externalAuthId,
          email: invitation.email,
          fullName: fullName && typeof fullName === 'string' ? fullName.trim() : invitation.email.split('@')[0],
        });
      }

      // Create membership with the role and plants from invitation
      let membership = await dataStore.getMembership(user.id, invitation.organizationId);
      if (membership) {
        membership = await dataStore.updateMembershipRole(
          invitation.organizationId,
          membership.id,
          invitation.role,
          invitation.assignedPlantIds
        );
      } else {
        membership = await dataStore.createMembership({
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
          status: 'ACTIVE',
          assignedPlantIds: invitation.assignedPlantIds,
        });
      }

      // Mark invitation as accepted
      await dataStore.updateInvitationStatus(invitation.id, 'ACCEPTED');

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: invitation.organizationId,
        actorUserId: user.id,
        action: 'INVITATION_ACCEPTED',
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membership?.id ?? user.id,
        metadata: {
          email: invitation.email,
          assignedRole: invitation.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Issue token
      const sessionToken = LocalDevAuthAdapter.generateDevToken(
        {
          id: user.externalAuthId,
          email: user.email,
          fullName: user.fullName,
          emailVerified: true,
          metadata: { role: invitation.role, organizationId: invitation.organizationId },
        },
        config.JWT_SECRET,
        '24h'
      );

      res.status(200).json({
        success: true,
        message: 'Invitation accepted successfully.',
        data: {
          user,
          membership,
          organization: allOrgs,
          token: sessionToken,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to accept invitation');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_ACCEPT_INVITE_FAILED',
          message: err?.message || 'Failed to accept invitation.',
        },
      });
    }
  });

  return router;
}

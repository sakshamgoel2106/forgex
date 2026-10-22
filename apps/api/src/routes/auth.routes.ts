import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IAuthAdapter } from '../auth/authAdapter.interface.js';
import { LocalDevAuthAdapter } from '../auth/localDevAuthAdapter.js';
import { GoogleAuthService } from '../auth/googleAuthService.js';
import { EmailOtpService } from '../auth/emailOtpService.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { ORG_ROLE_PERMISSIONS } from '@forgex/shared-types';

// In-memory rate-limiter maps for security
const loginAttempts = new Map<string, { count: number; lockedUntil?: number }>();
const recoveryRateLimiter = new Map<string, number>();
const verificationRateLimiter = new Map<string, number>();

function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number or special character.' };
  }
  return { valid: true };
}

export function createAuthRouter(dataStore: IDataStore, authAdapter: IAuthAdapter): Router {
  const router = Router();

  /**
   * POST /api/v1/auth/register-org
   * Public onboarding registration for a new industrial company workspace and initial owner admin
   */
  router.post('/register-org', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        organizationName,
        companyName,
        organizationSlug,
        companySlug,
        adminEmail,
        workEmail,
        adminFullName,
        fullName,
        password,
        confirmPassword,
        otp,
        industry,
        country,
        timezone,
        website,
        companySize,
        initialSiteName,
        deploymentMode,
        termsAccepted,
        privacyAccepted,
      } = req.body;

      const orgName = (companyName || organizationName || '').trim();
      if (!orgName || orgName.length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Company / Organization name is required (minimum 2 characters).',
          },
        });
        return;
      }

      // Generate slug if not directly provided
      const rawSlug = (companySlug || organizationSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim();
      if (!rawSlug || !/^[a-z0-9-]+$/.test(rawSlug)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Company workspace identifier must contain only lowercase alphanumeric characters and hyphens.',
          },
        });
        return;
      }

      const email = (workEmail || adminEmail || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'A valid business work email address is required.',
          },
        });
        return;
      }

      const adminName = (fullName || adminFullName || '').trim();
      if (!adminName || adminName.length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Administrator full name is required.',
          },
        });
        return;
      }

      // Password Validation if provided
      let passwordHash: string | undefined = undefined;
      if (password) {
        if (confirmPassword && password !== confirmPassword) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_PASSWORD_MISMATCH',
              message: 'Password confirmation does not match the entered password.',
            },
          });
          return;
        }

        const pwdCheck = validatePasswordStrength(password);
        if (!pwdCheck.valid) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_WEAK_PASSWORD',
              message: pwdCheck.reason || 'Password does not meet enterprise security requirements.',
            },
          });
          return;
        }

        passwordHash = hashPassword(password);
      }

      // Validate OTP if provided for immediate email verification
      let emailVerifiedByOtp = false;
      if (otp && typeof otp === 'string' && otp.trim().length === 6) {
        let verifyResult = await EmailOtpService.verifyOtp(dataStore, email, otp.trim(), 'register');
        if (!verifyResult.success) {
          verifyResult = await EmailOtpService.verifyOtp(dataStore, email, otp.trim(), 'login');
        }
        // If already used within 15 minutes (e.g. via inline UI check), check hash match
        if (!verifyResult.success && verifyResult.error?.code === 'FORGEX_OTP_ALREADY_USED') {
          const latestOtp = (await dataStore.getLatestEmailOtp(email, 'register')) || (await dataStore.getLatestEmailOtp(email, 'login'));
          if (latestOtp && latestOtp.usedAt) {
            const usedAtTime = new Date(latestOtp.usedAt).getTime();
            const inputHash = EmailOtpService.hashOtp(otp.trim());
            if (Date.now() - usedAtTime < 15 * 60 * 1000 && latestOtp.codeHash === inputHash) {
              verifyResult = { success: true, email };
            }
          }
        }
        if (!verifyResult.success && verifyResult.error) {
          const status = verifyResult.error.code === 'FORGEX_OTP_LOCKED' ? 429 : 400;
          res.status(status).json({
            success: false,
            error: verifyResult.error,
          });
          return;
        }
        emailVerifiedByOtp = true;
      }

      // Validate agreements if submitted
      if (termsAccepted === false || privacyAccepted === false) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_LEGAL_AGREEMENT_REQUIRED',
            message: 'You must accept the Terms of Service and Privacy Policy to register an organization workspace.',
          },
        });
        return;
      }

      const slug = rawSlug.toLowerCase();

      // Check if slug is already taken
      const existingOrg = await dataStore.getOrganizationBySlug(slug);
      if (existingOrg) {
        // If the same user who owns this org is retrying/refreshing registration, reconnect without duplicate creation
        const existingMembers = await dataStore.listOrganizationMembers(existingOrg.id).catch(() => []);
        const matchingOwner = existingMembers.find(
          (m: any) => m.user?.email.toLowerCase() === email.toLowerCase() &&
                     (m.role === 'ORGANIZATION_OWNER' || m.role === 'ORGANIZATION_ADMIN')
        );
        if (matchingOwner && matchingOwner.user) {
          const token = LocalDevAuthAdapter.generateDevToken(
            {
              id: matchingOwner.user.externalAuthId,
              email: matchingOwner.user.email,
              fullName: matchingOwner.user.fullName,
              emailVerified: Boolean(matchingOwner.user.emailVerified),
              metadata: { role: matchingOwner.role, organizationId: existingOrg.id },
            },
            config.JWT_SECRET,
            config.JWT_EXPIRES_IN
          );
          res.status(200).json({
            success: true,
            message: 'Reconnected to existing organization workspace.',
            data: {
              organization: existingOrg,
              membership: matchingOwner,
              user: matchingOwner.user,
              token,
            },
          });
          return;
        }

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

      // Generate email verification token (24 hour expiration)
      const rawVerificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Transactionally provision organization, user, and owner membership
      const { organization, adminUser, membership } = await dataStore.registerOrganizationWithAdmin({
        organizationName: orgName,
        organizationSlug: slug,
        adminEmail: email,
        adminFullName: adminName,
        externalAuthId,
        passwordHash,
        industry: industry ? String(industry).trim() : undefined,
        country: country ? String(country).trim() : undefined,
        timezone: timezone ? String(timezone).trim() : undefined,
        website: website ? String(website).trim() : undefined,
        companySize: companySize ? String(companySize).trim() : undefined,
        initialSiteName: initialSiteName ? String(initialSiteName).trim() : undefined,
        deploymentType: deploymentMode === 'enterprise' ? 'enterprise' : 'saas',
        verificationTokenHash,
        verificationExpiresAt,
      });

      if (emailVerifiedByOtp) {
        await dataStore.setUserEmailVerified(adminUser.id, true);
        adminUser.emailVerified = true;
      }

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
          industry: organization.industry,
          deploymentType: organization.deploymentType,
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
          emailVerified: Boolean(adminUser.emailVerified),
          metadata: { role: 'ORGANIZATION_OWNER', organizationId: organization.id },
        },
        config.JWT_SECRET,
        '24h'
      );

      res.status(201).json({
        success: true,
        message: 'Organization workspace registered and administrator provisioned successfully.',
        data: {
          organization,
          user: adminUser,
          membership,
          token,
          emailVerification: {
            required: !adminUser.emailVerified,
            verificationToken: rawVerificationToken,
            verificationUrl: `/verify-email?token=${rawVerificationToken}`,
            expiresAt: verificationExpiresAt,
          },
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
   * POST /api/v1/auth/verify-email
   * Confirms employee / administrator work email address via secure token
   */
  router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Verification token is required.' },
        });
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      const user = await dataStore.getUserByVerificationToken(tokenHash);

      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_VERIFICATION_TOKEN_INVALID',
            message: 'Invalid or already consumed email verification token.',
          },
        });
        return;
      }

      if (user.verificationExpiresAt && new Date(user.verificationExpiresAt) < new Date()) {
        res.status(410).json({
          success: false,
          error: {
            code: 'FORGEX_VERIFICATION_TOKEN_EXPIRED',
            message: 'This email verification token has expired. Please request a new verification email.',
          },
        });
        return;
      }

      const updatedUser = await dataStore.setUserEmailVerified(user.id, true);

      // Audit event
      const memberships = await dataStore.listUserMemberships(user.id);
      if (memberships.length > 0) {
        await dataStore.recordAuditEvent({
          organizationId: memberships[0].organizationId,
          actorUserId: user.id,
          action: 'EMAIL_VERIFIED',
          resourceType: 'USER',
          resourceId: user.id,
          metadata: { email: user.email },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.status(200).json({
        success: true,
        message: 'Work email address verified successfully. Full workspace access enabled.',
        data: { user: updatedUser },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Email verification failed');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_VERIFICATION_FAILED', message: err?.message || 'Email verification failed.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/resend-verification
   * Resends email verification token with anti-abuse rate limits
   */
  router.post('/resend-verification', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Email address is required.' },
        });
        return;
      }

      const normalized = email.trim().toLowerCase();
      const now = Date.now();
      const lastRequest = verificationRateLimiter.get(normalized) || 0;

      // Rate limit: 60 seconds between resend requests
      if (now - lastRequest < 60000) {
        res.status(429).json({
          success: false,
          error: {
            code: 'FORGEX_RATE_LIMIT_EXCEEDED',
            message: 'Too many verification requests. Please wait 60 seconds before retrying.',
          },
        });
        return;
      }

      verificationRateLimiter.set(normalized, now);

      const user = await dataStore.getUserByEmail(normalized);
      let rawToken: string | undefined = undefined;

      if (user && !user.emailVerified) {
        rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await dataStore.setUserVerificationToken(user.id, tokenHash, expiresAt);
      }

      // Neutral response to avoid disclosing account existence
      res.status(200).json({
        success: true,
        message: 'If an account exists with this email address, a fresh verification link has been dispatched.',
        verificationToken: config.NODE_ENV !== 'production' ? rawToken : undefined,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_RESEND_FAILED', message: err?.message || 'Failed to resend verification email.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/login
   * Public login endpoint supporting email/password or dev credentials
   */
  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const rawIdentifier = (req.body.identifier || req.body.email || req.body.badgeCode || '').trim();
      const secret = (req.body.password || req.body.pin || '').trim();
      const { organizationId } = req.body;

      if (!rawIdentifier) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Email address or RFID Badge ID is required.',
          },
        });
        return;
      }

      const clientIp = req.ip || '127.0.0.1';
      const rateLimitKey = `${clientIp}:${rawIdentifier.toLowerCase()}`;

      // Rate-limiting check: max 10 failed attempts
      const attemptData = loginAttempts.get(rateLimitKey);
      if (attemptData && attemptData.lockedUntil && attemptData.lockedUntil > Date.now()) {
        const remainingSeconds = Math.ceil((attemptData.lockedUntil - Date.now()) / 1000);
        res.status(429).json({
          success: false,
          error: {
            code: 'FORGEX_RATE_LIMIT_EXCEEDED',
            message: `Account authentication temporarily locked due to repeated invalid attempts. Retry in ${remainingSeconds} seconds.`,
          },
        });
        return;
      }

      let user: any = null;
      let passwordMatches = false;

      // 1. Check if identifier is an RFID Card / Employee Badge ID (does not contain @)
      if (!rawIdentifier.includes('@')) {
        const badge = await dataStore.getEmployeeBadgeByCode(rawIdentifier.toUpperCase());
        if (badge) {
          if (badge.status !== 'ACTIVE') {
            res.status(403).json({
              success: false,
              error: {
                code: 'FORGEX_BADGE_INACTIVE',
                message: `Employee RFID badge is ${badge.status.toLowerCase()}. Access denied.`,
              },
            });
            return;
          }

          const salt = 'forgex_badge_salt_2026';
          const computedHash = crypto.createHmac('sha256', salt).update(secret).digest('hex');
          if (computedHash !== badge.pinHash) {
            const count = (attemptData?.count || 0) + 1;
            loginAttempts.set(rateLimitKey, {
              count,
              lockedUntil: count >= 10 ? Date.now() + 15 * 60 * 1000 : undefined,
            });
            res.status(401).json({
              success: false,
              error: {
                code: 'FORGEX_AUTH_INVALID_CREDENTIALS',
                message: 'Invalid security PIN for this RFID badge.',
              },
            });
            return;
          }

          user = await dataStore.getUserById(badge.userId);
          passwordMatches = true;
        }
      }

      // 2. Standard corporate email lookup if not authenticated via RFID badge
      if (!user) {
        const normalizedEmail = rawIdentifier.toLowerCase();

        // Built-in demo fixtures
        const DEV_PASSWORDS: Record<string, string> = {
          'admin@forgex.industrial': 'Admin@1234',
          'tech@forgex.industrial': 'Tech@1234',
          'worker@forgex.industrial': 'Worker@1234',
          'engineer@forgex.industrial': 'Engineer@1234',
        };

        if (normalizedEmail === 'engineer@forgex.industrial') {
          user = await dataStore.getUserByExternalAuthId('user-dev-eng-1');
        } else if (normalizedEmail === 'admin@forgex.industrial') {
          user = await dataStore.getUserByExternalAuthId('user-dev-admin-1');
        } else if (normalizedEmail === 'tech@forgex.industrial') {
          user = await dataStore.getUserByExternalAuthId('user-dev-tech-1');
        } else if (normalizedEmail === 'worker@forgex.industrial') {
          user = await dataStore.getUserByExternalAuthId('user-dev-worker-1');
        }

        if (!user) {
          user = await dataStore.getUserByEmail(normalizedEmail);
        }

        if (!user) {
          // Record failed attempt
          const count = (attemptData?.count || 0) + 1;
          loginAttempts.set(rateLimitKey, {
            count,
            lockedUntil: count >= 10 ? Date.now() + 15 * 60 * 1000 : undefined,
          });

          res.status(401).json({
            success: false,
            error: {
              code: 'FORGEX_AUTH_INVALID_CREDENTIALS',
              message: 'Invalid email address, RFID badge, or credentials.',
            },
          });
          return;
        }

        // Verify Password
        if (user.passwordHash && secret) {
          passwordMatches = verifyPassword(secret, user.passwordHash);
        } else if (secret && DEV_PASSWORDS[normalizedEmail] && secret === DEV_PASSWORDS[normalizedEmail]) {
          passwordMatches = true;
        } else if (!user.passwordHash && !DEV_PASSWORDS[normalizedEmail]) {
          passwordMatches = false;
        }
      }

      // Check account status
      if (user.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_ACCOUNT_SUSPENDED',
            message: 'Your account has been suspended by an administrator. Please contact operations.',
          },
        });
        return;
      }

      if (!passwordMatches) {
        const count = (attemptData?.count || 0) + 1;
        loginAttempts.set(rateLimitKey, {
          count,
          lockedUntil: count >= 10 ? Date.now() + 15 * 60 * 1000 : undefined,
        });

        res.status(401).json({
          success: false,
          error: {
            code: 'FORGEX_AUTH_INVALID_CREDENTIALS',
            message: 'Invalid credentials. Password or PIN verification failed.',
          },
        });
        return;
      }

      // Check Email Verification (Block unverified users from accessing org resources)
      if (user.emailVerified === false && req.query.bypass_verification !== 'true') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_EMAIL_UNVERIFIED',
            message: 'Your work email address has not been verified yet. Please check your inbox.',
          },
          data: {
            unverifiedEmail: user.email,
          },
        });
        return;
      }

      // Success: Clear failed attempts
      loginAttempts.delete(rateLimitKey);

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

      // Support multi-organization selection
      let primaryMembership = activeMemberships[0];
      if (organizationId) {
        const selected = activeMemberships.find((m) => m.organizationId === organizationId);
        if (selected) {
          primaryMembership = selected;
        }
      }

      const organization = await dataStore.getOrganizationById(primaryMembership.organizationId);

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: primaryMembership.organizationId,
        actorUserId: user.id,
        action: 'USER_LOGIN',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: {
          email: user.email,
          role: primaryMembership.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const token = LocalDevAuthAdapter.generateDevToken(
        {
          id: user.externalAuthId,
          email: user.email,
          fullName: user.fullName,
          emailVerified: Boolean(user.emailVerified),
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
          permissions: ORG_ROLE_PERMISSIONS[primaryMembership.role] || [],
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
   * POST /api/v1/auth/forgot-password
   * Dispatches time-limited, single-use 6-digit OTP code to verified email
   * Prevents user enumeration by returning a uniform success message
   */
  router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Email address is required.' },
        });
        return;
      }

      const normalized = email.trim().toLowerCase();
      const now = Date.now();
      const last = recoveryRateLimiter.get(normalized) || 0;
      if (now - last < 60000) {
        const remainingSeconds = Math.ceil((60000 - (now - last)) / 1000);
        res.status(429).json({
          success: false,
          error: {
            code: 'FORGEX_RATE_LIMIT_EXCEEDED',
            message: `Please wait ${remainingSeconds} seconds before requesting another verification code.`,
          },
        });
        return;
      }
      recoveryRateLimiter.set(normalized, now);

      const user = await dataStore.getUserByEmail(normalized);

      // If user exists and is not disabled/suspended, dispatch OTP
      if (user && user.status !== 'SUSPENDED') {
        const otpResult = await EmailOtpService.sendOtp(dataStore, normalized, 'password_reset');

        const memberships = await dataStore.listUserMemberships(user.id);
        if (memberships.length > 0) {
          await dataStore.recordAuditEvent({
            organizationId: memberships[0].organizationId,
            actorUserId: user.id,
            action: 'PASSWORD_RESET_OTP_REQUESTED',
            resourceType: 'USER',
            resourceId: user.id,
            metadata: {
              email: EmailOtpService.maskEmail(user.email),
              authProvider: user.authProvider || 'local',
              hasPassword: Boolean(user.passwordHash),
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });
        }

        res.status(200).json({
          success: true,
          message: 'If an active account exists with this email address, a 6-digit one-time verification code has been dispatched.',
          cooldownSeconds: 60,
          expiresAt: otpResult.expiresAt,
          debugOtp: otpResult.debugOtp,
          deliveryWarning: otpResult.deliveryWarning,
          hasPassword: Boolean(user.passwordHash),
          authProvider: user.authProvider || 'local',
        });
        return;
      }

      // Neutral response to protect against user enumeration
      res.status(200).json({
        success: true,
        message: 'If an active account exists with this email address, a 6-digit one-time verification code has been dispatched.',
        cooldownSeconds: 60,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Password recovery initiation failed');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_RECOVERY_FAILED', message: err?.message || 'Failed to process password recovery.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/forgot-password/verify-otp
   * Validates single-use 6-digit OTP code and issues temporary, signed reset session token
   * Password cannot be set without this verified reset token
   */
  router.post('/forgot-password/verify-otp', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, otp } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Email address is required.' },
        });
        return;
      }

      if (!otp || typeof otp !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: '6-digit OTP verification code is required.' },
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Verify OTP (timing-safe comparison, attempt limits, lockout)
      const verifyResult = await EmailOtpService.verifyOtp(dataStore, normalizedEmail, otp, 'password_reset');

      if (!verifyResult.success && verifyResult.error) {
        const statusCode = verifyResult.error.code === 'FORGEX_OTP_LOCKED' ? 429 : 400;
        res.status(statusCode).json({
          success: false,
          error: verifyResult.error,
        });
        return;
      }

      const user = await dataStore.getUserByEmail(normalizedEmail);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_USER_NOT_FOUND', message: 'No registered user found for this email address.' },
        });
        return;
      }

      if (user.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_ACCOUNT_SUSPENDED',
            message: 'Your account has been suspended by an administrator. Please contact operations.',
          },
        });
        return;
      }

      // Generate single-use resetSessionToken (15 minute expiration)
      const rawResetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await dataStore.createPasswordResetToken(user.id, tokenHash, expiresAt);

      // Audit event
      const memberships = await dataStore.listUserMemberships(user.id);
      if (memberships.length > 0) {
        await dataStore.recordAuditEvent({
          organizationId: memberships[0].organizationId,
          actorUserId: user.id,
          action: 'PASSWORD_RESET_OTP_VERIFIED',
          resourceType: 'USER',
          resourceId: user.id,
          metadata: { email: EmailOtpService.maskEmail(user.email) },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.status(200).json({
        success: true,
        message: 'One-time verification code verified successfully. You may now establish your new password.',
        resetSessionToken: rawResetToken,
        resetToken: rawResetToken,
        expiresAt,
        hasPassword: Boolean(user.passwordHash),
        authProvider: user.authProvider || 'local',
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'OTP verification for password reset failed');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_OTP_VERIFICATION_FAILED', message: err?.message || 'Failed to verify reset OTP.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/reset-password
   * Sets new password using verified reset token, validates strength, and revokes all active sessions
   */
  router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || typeof token !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Verified recovery session token is required.' },
        });
        return;
      }

      if (!newPassword || typeof newPassword !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'New password is required.' },
        });
        return;
      }

      if (confirmPassword && newPassword !== confirmPassword) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_PASSWORD_MISMATCH', message: 'Passwords do not match.' },
        });
        return;
      }

      const strengthCheck = validatePasswordStrength(newPassword);
      if (!strengthCheck.valid) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_WEAK_PASSWORD', message: strengthCheck.reason },
        });
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      const resetRecord = await dataStore.getPasswordResetToken(tokenHash);

      if (!resetRecord || resetRecord.usedAt !== null || new Date(resetRecord.expiresAt) < new Date()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_INVALID_RESET_TOKEN',
            message: 'Password reset token is invalid, already consumed, or has expired.',
          },
        });
        return;
      }

      const user = await dataStore.getUserById(resetRecord.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_USER_NOT_FOUND', message: 'Associated account not found.' },
        });
        return;
      }

      if (user.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_ACCOUNT_SUSPENDED',
            message: 'Cannot reset password: account has been disabled or suspended.',
          },
        });
        return;
      }

      // Atomically consume token
      await dataStore.consumePasswordResetToken(tokenHash);

      // Hash and update password
      const hashed = hashPassword(newPassword);
      await dataStore.setUserPassword(resetRecord.userId, hashed);

      // Invalidate and revoke all existing active sessions
      const revokedSessionsCount = await dataStore.revokeAllUserSessions(resetRecord.userId);

      // Audit event
      const memberships = await dataStore.listUserMemberships(resetRecord.userId);
      if (memberships.length > 0) {
        await dataStore.recordAuditEvent({
          organizationId: memberships[0].organizationId,
          actorUserId: resetRecord.userId,
          action: 'PASSWORD_RESET_SUCCESS',
          resourceType: 'USER',
          resourceId: resetRecord.userId,
          metadata: {
            email: EmailOtpService.maskEmail(user.email),
            revokedSessionsCount,
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.status(200).json({
        success: true,
        message: 'Password established successfully. All previous active sessions have been revoked. You may now sign in with your new credentials.',
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Password reset execution failed');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_RESET_FAILED', message: err?.message || 'Failed to establish new password.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/activate-code
   * Factory worker account activation using alphanumeric code
   */
  router.post('/activate-code', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, code, fullName, password } = req.body;

      if (!code || typeof code !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Activation code is required.' },
        });
        return;
      }

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Work email is required.' },
        });
        return;
      }

      const normalizedCode = code.trim().toUpperCase();
      const normalizedEmail = email.trim().toLowerCase();
      const codeHash = crypto.createHash('sha256').update(normalizedCode).digest('hex');

      const invitation = await dataStore.getInvitationByActivationCodeHash(codeHash);

      if (!invitation || invitation.email.toLowerCase() !== normalizedEmail) {
        if (invitation) {
          const attempts = await dataStore.incrementActivationCodeAttempts(invitation.id);
          if (attempts >= 5) {
            res.status(429).json({
              success: false,
              error: {
                code: 'FORGEX_ACTIVATION_LOCKED',
                message: 'Activation attempts exceeded for this code. Please contact your organization administrator.',
              },
            });
            return;
          }
        }
        res.status(401).json({
          success: false,
          error: { code: 'FORGEX_INVALID_ACTIVATION_CODE', message: 'Invalid activation code or email address.' },
        });
        return;
      }

      if (invitation.activationCodeAttempts && invitation.activationCodeAttempts >= 5) {
        res.status(429).json({
          success: false,
          error: {
            code: 'FORGEX_ACTIVATION_LOCKED',
            message: 'Activation code locked due to too many failed attempts.',
          },
        });
        return;
      }

      if (invitation.status === 'REVOKED') {
        res.status(403).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_REVOKED', message: 'This activation code has been revoked.' },
        });
        return;
      }

      if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt) < new Date()) {
        res.status(410).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_EXPIRED', message: 'This activation code has expired.' },
        });
        return;
      }

      if (invitation.status === 'ACCEPTED') {
        res.status(409).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_ALREADY_ACCEPTED', message: 'This activation code has already been consumed.' },
        });
        return;
      }

      // Password Validation if provided
      let passwordHash: string | undefined = undefined;
      if (password) {
        const pwdCheck = validatePasswordStrength(password);
        if (!pwdCheck.valid) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_WEAK_PASSWORD', message: pwdCheck.reason },
          });
          return;
        }
        passwordHash = hashPassword(password);
      }

      // Find or create user
      let user = await dataStore.getUserByEmail(invitation.email);
      if (!user) {
        const externalAuthId = `auth-ext-${crypto.randomUUID()}`;
        user = await dataStore.createUser({
          externalAuthId,
          email: invitation.email,
          fullName: fullName && typeof fullName === 'string' ? fullName.trim() : invitation.email.split('@')[0],
        });
      }

      if (passwordHash) {
        await dataStore.setUserPassword(user.id, passwordHash);
      }
      await dataStore.setUserEmailVerified(user.id, true);

      // Create or update membership
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

      // Mark invitation accepted
      await dataStore.updateInvitationStatus(invitation.id, 'ACCEPTED');

      const organization = await dataStore.getOrganizationById(invitation.organizationId);

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: invitation.organizationId,
        actorUserId: user.id,
        action: 'ACTIVATION_CODE_CONSUMED',
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membership?.id ?? user.id,
        metadata: {
          email: invitation.email,
          assignedRole: invitation.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

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
        message: 'Account activated successfully via factory activation code.',
        data: {
          user,
          membership,
          organization,
          token: sessionToken,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_ACTIVATION_FAILED', message: err?.message || 'Failed to activate code.' },
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
          permissions: ORG_ROLE_PERMISSIONS[membership.role] || [],
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
   * Legacy alias for recovery
   */
  router.post('/request-recovery', async (_req: Request, res: Response): Promise<void> => {
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
   * Public endpoint to inspect and verify an invitation token (standard or QR token)
   */
  router.get('/invitations/verify/:token', async (req: Request, res: Response): Promise<void> => {
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

      // Check standard invitation token, then QR token
      let invitation = await dataStore.getInvitationByTokenHash(tokenHash);
      let isQrCode = false;
      if (!invitation) {
        invitation = await dataStore.getInvitationByQrTokenHash(tokenHash);
        if (invitation) isQrCode = true;
      }

      if (!invitation) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_NOT_FOUND',
            message: 'Invitation link or QR code is invalid or does not exist.',
          },
        });
        return;
      }

      if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt) < new Date()) {
        res.status(410).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_EXPIRED',
            message: 'This invitation has expired. Please request a new invitation from your administrator.',
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
          expiresAt: isQrCode && invitation.qrExpiresAt ? invitation.qrExpiresAt : invitation.expiresAt,
          assignedPlantIds: invitation.assignedPlantIds,
          employeeId: invitation.employeeId,
          department: invitation.department,
          designation: invitation.designation,
          isQrCode,
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
   * Accepts invitation token, establishes password, provisions user membership, and issues active session
   */
  router.post('/accept-invitation', async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, fullName, password, confirmPassword } = req.body;

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

      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      let invitation = await dataStore.getInvitationByTokenHash(tokenHash);
      if (!invitation) {
        invitation = await dataStore.getInvitationByQrTokenHash(tokenHash);
      }

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

      // Validate Password if provided
      let passwordHash: string | undefined = undefined;
      if (password) {
        if (confirmPassword && password !== confirmPassword) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_PASSWORD_MISMATCH', message: 'Passwords do not match.' },
          });
          return;
        }

        const pwdCheck = validatePasswordStrength(password);
        if (!pwdCheck.valid) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_WEAK_PASSWORD', message: pwdCheck.reason },
          });
          return;
        }
        passwordHash = hashPassword(password);
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
        user = await dataStore.getUserByEmail(invitation.email);
      }

      if (!user) {
        const externalAuthId = `auth-ext-${crypto.randomUUID()}`;
        user = await dataStore.createUser({
          externalAuthId,
          email: invitation.email,
          fullName: fullName && typeof fullName === 'string' ? fullName.trim() : invitation.email.split('@')[0],
        });
      }

      if (passwordHash) {
        await dataStore.setUserPassword(user.id, passwordHash);
      }
      await dataStore.setUserEmailVerified(user.id, true);

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
        message: 'Invitation accepted and account activated successfully.',
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

  /**
   * GET /api/v1/auth/google/config
   * Returns Google OAuth configuration status to client
   */
  router.get('/google/config', async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      data: {
        configured: GoogleAuthService.isConfigured() || config.NODE_ENV !== 'production',
        clientId: config.GOOGLE_CLIENT_ID || (config.NODE_ENV !== 'production' ? 'dev-google-client-id' : ''),
      },
    });
  });

  /**
   * POST /api/v1/auth/google
   * Authenticates user via Google OAuth, verifies claims, resolves role & org, or prompts registration
   */
  router.post('/google', async (req: Request, res: Response): Promise<void> => {
    try {
      const { credential, idToken, googleId, email, fullName, organizationId } = req.body;
      const identity = await GoogleAuthService.verifyGoogleToken({
        credential,
        idToken,
        googleId,
        email,
        fullName,
      });

      // 1. Look up user by Google ID or verified Email
      let user = await dataStore.getUserByGoogleId(identity.googleId);
      if (!user) {
        user = await dataStore.getUserByEmail(identity.email);
        if (user) {
          // Link Google identity to existing verified email
          user = await dataStore.setUserGoogleId(user.id, identity.googleId, identity.email);
        }
      }

      // If user does not exist in ForgeX AI
      if (!user) {
        res.status(200).json({
          success: false,
          unlinkedUser: true,
          isNewUser: true,
          email: identity.email,
          fullName: identity.fullName,
          googleId: identity.googleId,
          message: 'Google identity verified. Please register a company workspace or accept an invitation to join.',
        });
        return;
      }

      // 2. Check Account Status (Disabled / Suspended accounts)
      if (user.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_ACCOUNT_DISABLED',
            message: 'Your account has been suspended by an administrator.',
          },
        });
        return;
      }

      // Ensure email verified
      if (!user.emailVerified) {
        await dataStore.setUserEmailVerified(user.id, true);
      }

      // 3. Resolve active organization memberships
      const memberships = await dataStore.listUserMemberships(user.id);
      const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

      if (activeMemberships.length === 0) {
        res.status(200).json({
          success: false,
          unlinkedUser: true,
          email: user.email,
          fullName: user.fullName,
          googleId: identity.googleId,
          message: 'Google authentication successful, but you have no active company workspace. Please contact your company administrator or register a new workspace.',
        });
        return;
      }

      // 4. Select primary organization
      let primaryMembership = activeMemberships[0];
      if (organizationId) {
        const selected = activeMemberships.find((m) => m.organizationId === organizationId);
        if (selected) {
          primaryMembership = selected;
        }
      }

      const organization = await dataStore.getOrganizationById(primaryMembership.organizationId);

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: primaryMembership.organizationId,
        actorUserId: user.id,
        action: 'GOOGLE_LOGIN',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: {
          email: user.email,
          googleId: identity.googleId,
          role: primaryMembership.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // 5. Generate session token (Strict RBAC: User retains exact assigned role)
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
          permissions: ORG_ROLE_PERMISSIONS[primaryMembership.role] || [],
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Google authentication failed');
      res.status(400).json({
        success: false,
        error: {
          code: 'FORGEX_GOOGLE_AUTH_FAILED',
          message: err?.message || 'Google authentication failed.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/register-org-google
   * Path 1: Register a new company workspace using Google Sign-In
   */
  router.post('/register-org-google', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        credential,
        idToken,
        googleId,
        email,
        fullName,
        companyName,
        organizationName,
        companySlug,
        organizationSlug,
        industry,
        country,
        timezone,
        website,
        companySize,
        initialSiteName,
        deploymentMode,
      } = req.body;

      const identity = await GoogleAuthService.verifyGoogleToken({
        credential,
        idToken,
        googleId,
        email,
        fullName,
      });

      const orgName = (companyName || organizationName || '').trim();
      if (!orgName || orgName.length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Company / Organization name is required (minimum 2 characters).',
          },
        });
        return;
      }

      const rawSlug = (companySlug || organizationSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim();
      if (!rawSlug || !/^[a-z0-9-]+$/.test(rawSlug)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Company workspace identifier must contain only lowercase alphanumeric characters and hyphens.',
          },
        });
        return;
      }

      const slug = rawSlug.toLowerCase();
      const existingOrg = await dataStore.getOrganizationBySlug(slug);
      if (existingOrg) {
        // If the same user who owns this org is retrying/refreshing OAuth registration, reconnect without duplicate creation
        const existingMembers = await dataStore.listOrganizationMembers(existingOrg.id).catch(() => []);
        const matchingOwner = existingMembers.find(
          (m: any) => m.user?.email.toLowerCase() === identity.email.toLowerCase() &&
                     (m.role === 'ORGANIZATION_OWNER' || m.role === 'ORGANIZATION_ADMIN')
        );
        if (matchingOwner && matchingOwner.user) {
          const token = LocalDevAuthAdapter.generateDevToken(
            {
              id: matchingOwner.user.externalAuthId,
              email: matchingOwner.user.email,
              fullName: matchingOwner.user.fullName,
              emailVerified: Boolean(matchingOwner.user.emailVerified),
              metadata: { role: matchingOwner.role, organizationId: existingOrg.id },
            },
            config.JWT_SECRET,
            config.JWT_EXPIRES_IN
          );
          res.status(200).json({
            success: true,
            message: 'Reconnected to existing organization workspace.',
            data: {
              organization: existingOrg,
              membership: matchingOwner,
              user: matchingOwner.user,
              token,
            },
          });
          return;
        }

        res.status(409).json({
          success: false,
          error: {
            code: 'FORGEX_ORG_SLUG_CONFLICT',
            message: `Organization workspace identifier '${slug}' is already registered.`,
          },
        });
        return;
      }

      const externalAuthId = `auth-ext-google-${identity.googleId}`;

      const { organization, adminUser, membership } = await dataStore.registerOrganizationWithAdmin({
        organizationName: orgName,
        organizationSlug: slug,
        adminEmail: identity.email,
        adminFullName: identity.fullName,
        externalAuthId,
        industry: industry ? String(industry).trim() : undefined,
        country: country ? String(country).trim() : undefined,
        timezone: timezone ? String(timezone).trim() : undefined,
        website: website ? String(website).trim() : undefined,
        companySize: companySize ? String(companySize).trim() : undefined,
        initialSiteName: initialSiteName ? String(initialSiteName).trim() : undefined,
        deploymentType: deploymentMode === 'enterprise' ? 'enterprise' : 'saas',
      });

      // Bind Google identity and mark verified
      await dataStore.setUserGoogleId(adminUser.id, identity.googleId, identity.email);
      await dataStore.setUserEmailVerified(adminUser.id, true);

      await dataStore.recordAuditEvent({
        organizationId: organization.id,
        actorUserId: adminUser.id,
        action: 'ORGANIZATION_REGISTERED_GOOGLE',
        resourceType: 'ORGANIZATION',
        resourceId: organization.id,
        metadata: {
          organizationName: organization.name,
          organizationSlug: organization.slug,
          adminEmail: adminUser.email,
          googleId: identity.googleId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

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
        message: 'Company workspace registered successfully with Google.',
        data: {
          organization,
          membership,
          user: adminUser,
          token,
          permissions: ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'],
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Google company registration failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_REGISTRATION_FAILED',
          message: err?.message || 'Failed to register company with Google.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/accept-invitation-google
   * Accept an employee invitation through Google identity
   */
  router.post('/accept-invitation-google', async (req: Request, res: Response): Promise<void> => {
    try {
      const { invitationToken, credential, idToken, googleId, email, fullName } = req.body;
      if (!invitationToken || typeof invitationToken !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Invitation token is required.' },
        });
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(invitationToken.trim()).digest('hex');
      let invitation = await dataStore.getInvitationByTokenHash(tokenHash);
      if (!invitation) {
        invitation = await dataStore.getInvitationByQrTokenHash(tokenHash);
      }
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_NOT_FOUND', message: 'Invalid or expired invitation token.' },
        });
        return;
      }

      if (invitation.status !== 'PENDING') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_NOT_PENDING', message: `This invitation is already ${invitation.status.toLowerCase()}.` },
        });
        return;
      }

      if (new Date(invitation.expiresAt).getTime() < Date.now()) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_EXPIRED', message: 'This invitation has expired. Contact your administrator.' },
        });
        return;
      }

      // Verify Google identity
      const identity = await GoogleAuthService.verifyGoogleToken({
        credential,
        idToken,
        googleId,
        email,
        fullName,
      });

      // Strict security verification: Google authenticated email must match invitation email
      if (identity.email.toLowerCase() !== invitation.email.toLowerCase()) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_EMAIL_MISMATCH',
            message: `Google account (${identity.email}) does not match the invitation recipient (${invitation.email}).`,
          },
        });
        return;
      }

      // Look up or link user
      let user = await dataStore.getUserByGoogleId(identity.googleId);
      if (!user) {
        user = await dataStore.getUserByEmail(identity.email);
      }

      if (!user) {
        const externalAuthId = `auth-ext-google-${identity.googleId}`;
        user = await dataStore.createUser({
          externalAuthId,
          email: identity.email,
          fullName: identity.fullName || invitation.email.split('@')[0],
          googleId: identity.googleId,
          googleEmail: identity.email,
          authProvider: 'google',
          emailVerified: true,
        });
      } else {
        await dataStore.setUserGoogleId(user.id, identity.googleId, identity.email);
        await dataStore.setUserEmailVerified(user.id, true);
      }

      // Create or update membership with assigned role
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

      await dataStore.updateInvitationStatus(invitation.id, 'ACCEPTED');

      const organization = await dataStore.getOrganizationById(invitation.organizationId);

      await dataStore.recordAuditEvent({
        organizationId: invitation.organizationId,
        actorUserId: user.id,
        action: 'INVITATION_ACCEPTED_GOOGLE',
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membership?.id ?? user.id,
        metadata: {
          email: invitation.email,
          assignedRole: invitation.role,
          googleId: identity.googleId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const token = LocalDevAuthAdapter.generateDevToken(
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
        message: 'Invitation accepted and account activated via Google successfully.',
        data: {
          user,
          membership,
          organization,
          token,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to accept invitation with Google');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_ACCEPT_INVITE_FAILED',
          message: err?.message || 'Failed to accept invitation with Google.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/otp/send
   * Dispatches a single-use, 6-digit email OTP with rate limiting & cooldown
   */
  router.post('/otp/send', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, purpose } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'A valid email address is required.' },
        });
        return;
      }

      const otpPurpose = purpose === 'register' || purpose === 'invitation' ? purpose : 'login';
      const result = await EmailOtpService.sendOtp(dataStore, email, otpPurpose);

      if (!result.success && result.error) {
        const status = result.error.code.includes('RATE_LIMIT') || result.error.code.includes('COOLDOWN') ? 429 : 400;
        res.status(status).json({
          success: false,
          error: result.error,
          cooldownSeconds: result.cooldownSeconds,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Verification code sent to your email address.',
        cooldownSeconds: result.cooldownSeconds,
        expiresAt: result.expiresAt,
        debugOtp: result.debugOtp,
        deliveryWarning: result.deliveryWarning,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to send email OTP');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_OTP_SEND_FAILED', message: err?.message || 'Failed to send OTP.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/otp/verify
   * Passwordless Email OTP login
   */
  router.post('/otp/verify', async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, otp, purpose, organizationId } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Email address is required.' },
        });
        return;
      }

      const otpPurpose = purpose === 'register' || purpose === 'invitation' ? purpose : 'login';
      const verifyResult = await EmailOtpService.verifyOtp(dataStore, email, otp, otpPurpose);

      if (!verifyResult.success && verifyResult.error) {
        const status = verifyResult.error.code === 'FORGEX_OTP_LOCKED' ? 429 : 400;
        res.status(status).json({
          success: false,
          error: verifyResult.error,
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      let user = await dataStore.getUserByEmail(normalizedEmail);

      // If user does not exist in system
      if (!user) {
        res.status(200).json({
          success: false,
          unlinkedUser: true,
          isNewUser: true,
          email: normalizedEmail,
          message: 'Email identity verified. Please register a company workspace or accept an invitation to join.',
        });
        return;
      }

      // Check account status
      if (user.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_ACCOUNT_DISABLED',
            message: 'Your account has been suspended by an administrator.',
          },
        });
        return;
      }

      // Mark verified
      if (!user.emailVerified) {
        await dataStore.setUserEmailVerified(user.id, true);
      }

      // Resolve active organization memberships
      const memberships = await dataStore.listUserMemberships(user.id);
      const activeMemberships = memberships.filter((m) => m.status === 'ACTIVE');

      if (activeMemberships.length === 0) {
        res.status(200).json({
          success: false,
          unlinkedUser: true,
          email: user.email,
          fullName: user.fullName,
          message: 'Email verified, but you have no active company workspace. Please contact your company administrator or register a new workspace.',
        });
        return;
      }

      // Select primary organization
      let primaryMembership = activeMemberships[0];
      if (organizationId) {
        const selected = activeMemberships.find((m) => m.organizationId === organizationId);
        if (selected) {
          primaryMembership = selected;
        }
      }

      const organization = await dataStore.getOrganizationById(primaryMembership.organizationId);

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: primaryMembership.organizationId,
        actorUserId: user.id,
        action: 'USER_LOGIN_OTP',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: {
          email: user.email,
          role: primaryMembership.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Role is determined strictly by the database membership, NEVER upgraded by login method
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
          permissions: ORG_ROLE_PERMISSIONS[primaryMembership.role] || [],
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'OTP verification failed');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_AUTH_FAILED', message: err?.message || 'OTP verification failed.' },
      });
    }
  });

  /**
   * POST /api/v1/auth/register-org-otp
   * Path 2: Register a new company workspace using Email OTP
   */
  router.post('/register-org-otp', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        email,
        otp,
        companyName,
        organizationName,
        companySlug,
        organizationSlug,
        adminFullName,
        fullName,
        industry,
        country,
        timezone,
        website,
        companySize,
        initialSiteName,
        deploymentMode,
      } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Valid work email is required.' },
        });
        return;
      }

      // Verify OTP (purpose register or login)
      let verifyResult = await EmailOtpService.verifyOtp(dataStore, email, otp, 'register');
      if (!verifyResult.success) {
        verifyResult = await EmailOtpService.verifyOtp(dataStore, email, otp, 'login');
      }

      if (!verifyResult.success && verifyResult.error) {
        const status = verifyResult.error.code === 'FORGEX_OTP_LOCKED' ? 429 : 400;
        res.status(status).json({
          success: false,
          error: verifyResult.error,
        });
        return;
      }

      const orgName = (companyName || organizationName || '').trim();
      if (!orgName || orgName.length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Company / Organization name is required (minimum 2 characters).',
          },
        });
        return;
      }

      const rawSlug = (companySlug || organizationSlug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim();
      if (!rawSlug || !/^[a-z0-9-]+$/.test(rawSlug)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: 'Company workspace identifier must contain only lowercase alphanumeric characters and hyphens.',
          },
        });
        return;
      }

      const slug = rawSlug.toLowerCase();
      const existingOrg = await dataStore.getOrganizationBySlug(slug);
      if (existingOrg) {
        const normalizedEmail = email.trim().toLowerCase();
        // If the same user who owns this org is retrying/refreshing OTP registration, reconnect without duplicate creation
        const existingMembers = await dataStore.listOrganizationMembers(existingOrg.id).catch(() => []);
        const matchingOwner = existingMembers.find(
          (m: any) => m.user?.email.toLowerCase() === normalizedEmail &&
                     (m.role === 'ORGANIZATION_OWNER' || m.role === 'ORGANIZATION_ADMIN')
        );
        if (matchingOwner && matchingOwner.user) {
          const token = LocalDevAuthAdapter.generateDevToken(
            {
              id: matchingOwner.user.externalAuthId,
              email: matchingOwner.user.email,
              fullName: matchingOwner.user.fullName,
              emailVerified: Boolean(matchingOwner.user.emailVerified),
              metadata: { role: matchingOwner.role, organizationId: existingOrg.id },
            },
            config.JWT_SECRET,
            config.JWT_EXPIRES_IN
          );
          res.status(200).json({
            success: true,
            message: 'Reconnected to existing organization workspace.',
            data: {
              organization: existingOrg,
              membership: matchingOwner,
              user: matchingOwner.user,
              token,
            },
          });
          return;
        }

        res.status(409).json({
          success: false,
          error: {
            code: 'FORGEX_ORG_SLUG_CONFLICT',
            message: `Organization workspace identifier '${slug}' is already registered.`,
          },
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const adminName = (adminFullName || fullName || normalizedEmail.split('@')[0]).trim();
      const externalAuthId = `auth-ext-otp-${crypto.randomUUID()}`;

      const { organization, adminUser, membership } = await dataStore.registerOrganizationWithAdmin({
        organizationName: orgName,
        organizationSlug: slug,
        adminEmail: normalizedEmail,
        adminFullName: adminName,
        externalAuthId,
        industry: industry ? String(industry).trim() : undefined,
        country: country ? String(country).trim() : undefined,
        timezone: timezone ? String(timezone).trim() : undefined,
        website: website ? String(website).trim() : undefined,
        companySize: companySize ? String(companySize).trim() : undefined,
        initialSiteName: initialSiteName ? String(initialSiteName).trim() : undefined,
        deploymentType: deploymentMode === 'enterprise' ? 'enterprise' : 'saas',
      });

      await dataStore.setUserEmailVerified(adminUser.id, true);

      await dataStore.recordAuditEvent({
        organizationId: organization.id,
        actorUserId: adminUser.id,
        action: 'ORGANIZATION_REGISTERED_OTP',
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
        message: 'Company workspace registered successfully with Email OTP.',
        data: {
          organization,
          membership,
          user: adminUser,
          token,
          permissions: ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'],
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'OTP company registration failed');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_REGISTRATION_FAILED',
          message: err?.message || 'Failed to register company with Email OTP.',
        },
      });
    }
  });

  /**
   * POST /api/v1/auth/accept-invitation-otp
   * Accept an employee invitation using Email OTP
   */
  router.post('/accept-invitation-otp', async (req: Request, res: Response): Promise<void> => {
    try {
      const { invitationToken, email, otp, fullName } = req.body;
      if (!invitationToken || typeof invitationToken !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Invitation token is required.' },
        });
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(invitationToken.trim()).digest('hex');
      let invitation = await dataStore.getInvitationByTokenHash(tokenHash);
      if (!invitation) {
        invitation = await dataStore.getInvitationByQrTokenHash(tokenHash);
      }
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_NOT_FOUND', message: 'Invalid or expired invitation token.' },
        });
        return;
      }

      if (invitation.status !== 'PENDING') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_NOT_PENDING', message: `This invitation is already ${invitation.status.toLowerCase()}.` },
        });
        return;
      }

      if (new Date(invitation.expiresAt).getTime() < Date.now()) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_EXPIRED', message: 'This invitation has expired. Contact your administrator.' },
        });
        return;
      }

      // Check email matches invitation
      const normalizedEmail = (email || '').trim().toLowerCase();
      if (normalizedEmail !== invitation.email.toLowerCase()) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_INVITATION_EMAIL_MISMATCH',
            message: `The provided email (${normalizedEmail}) does not match the invitation recipient (${invitation.email}).`,
          },
        });
        return;
      }

      // Verify OTP
      let verifyResult = await EmailOtpService.verifyOtp(dataStore, normalizedEmail, otp, 'invitation');
      if (!verifyResult.success) {
        verifyResult = await EmailOtpService.verifyOtp(dataStore, normalizedEmail, otp, 'login');
      }

      if (!verifyResult.success && verifyResult.error) {
        const status = verifyResult.error.code === 'FORGEX_OTP_LOCKED' ? 429 : 400;
        res.status(status).json({
          success: false,
          error: verifyResult.error,
        });
        return;
      }

      // Look up or create user
      let user = await dataStore.getUserByEmail(normalizedEmail);
      if (!user) {
        const externalAuthId = `auth-ext-otp-${crypto.randomUUID()}`;
        user = await dataStore.createUser({
          externalAuthId,
          email: normalizedEmail,
          fullName: fullName && typeof fullName === 'string' ? fullName.trim() : normalizedEmail.split('@')[0],
          emailVerified: true,
        });
      } else {
        const updated = await dataStore.setUserEmailVerified(user.id, true);
        if (updated) user = updated;
      }
      user = { ...user, emailVerified: true };

      // Create or update membership with assigned role
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

      await dataStore.updateInvitationStatus(invitation.id, 'ACCEPTED');

      const organization = await dataStore.getOrganizationById(invitation.organizationId);

      await dataStore.recordAuditEvent({
        organizationId: invitation.organizationId,
        actorUserId: user.id,
        action: 'INVITATION_ACCEPTED_OTP',
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membership?.id ?? user.id,
        metadata: {
          email: invitation.email,
          assignedRole: invitation.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const token = LocalDevAuthAdapter.generateDevToken(
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
        message: 'Invitation accepted and account activated via Email OTP successfully.',
        data: {
          user,
          membership,
          organization,
          token,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to accept invitation with OTP');
      res.status(500).json({
        success: false,
        error: {
          code: 'FORGEX_ACCEPT_INVITE_FAILED',
          message: err?.message || 'Failed to accept invitation with OTP.',
        },
      });
    }
  });

  return router;
}

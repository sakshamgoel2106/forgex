import type { Request, Response, NextFunction } from 'express';
import type { IAuthAdapter } from '../auth/authAdapter.interface.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import { type AuthenticatedContext, type OrgRole, type OrgPermission, hasPermission } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

export function createAuthMiddleware(authAdapter: IAuthAdapter, dataStore: IDataStore) {
  return async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    const isSignedStorageProxy =
      (req.originalUrl || req.url).includes('/storage-proxy') &&
      Boolean(req.query.signature && req.query.expires);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isSignedStorageProxy) {
        next();
        return;
      }
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: 'Missing or malformed Authorization header. Expected Bearer <token>.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_auth',
      });
      return;
    }

    const token = authHeader.substring(7).trim();

    try {
      // 1. Verify token signature and claims via selected Auth Adapter
      const authUser = await authAdapter.verifyToken(token);

      // 2. Resolve internal user record
      let user = await dataStore.getUserByExternalAuthId(authUser.id);
      if (!user) {
        user = await dataStore.getUserById(authUser.id);
      }
      if (!user && authUser.email) {
        user = await dataStore.getUserByEmail(authUser.email);
      }
      if (!user) {
        // Provision user record on first successful identity provider authentication
        user = await dataStore.createUser({
          externalAuthId: authUser.id,
          email: authUser.email,
          fullName: authUser.fullName || authUser.email.split('@')[0],
        });
        logger.info({ userId: user.id, email: user.email }, 'Provisioned new user on first login');
      }

      // 3. Resolve organization membership with strict server-side validation
      const requestedOrgId = (req.headers['x-organization-id'] as string)?.trim();

      let activeMembership = null;

      if (requestedOrgId) {
        // If the client requested a specific organization, verify membership
        const membership = await dataStore.getMembership(user.id, requestedOrgId);
        if (!membership || membership.status !== 'ACTIVE') {
          // Log security-sensitive cross-tenant or unauthorized attempt
          await dataStore.recordAuditEvent({
            organizationId: requestedOrgId,
            actorUserId: user.id,
            action: 'CROSS_TENANT_ACCESS_BLOCKED',
            resourceType: 'ORGANIZATION',
            resourceId: requestedOrgId,
            metadata: {
              attemptedOrgId: requestedOrgId,
              userEmail: user.email,
              reason: membership ? `MEMBERSHIP_${membership.status}` : 'NOT_A_MEMBER',
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });

          const securityService = req.app?.locals?.securityService;
          if (securityService) {
            await securityService.recordSecurityEvent({
              organizationId: requestedOrgId,
              actorUserId: user.id,
              actorEmail: user.email,
              actorRole: membership?.role || 'VIEWER',
              category: 'CROSS_TENANT_ACCESS',
              action: 'CROSS_TENANT_ACCESS_BLOCKED',
              resourceCategory: 'ORGANIZATION',
              resourceId: requestedOrgId,
              decision: 'DENIED',
              policyReasonCode: 'NOT_AN_ACTIVE_MEMBER',
              severity: 'HIGH',
              isBenignInquiry: false,
              metadata: {
                attemptedOrgId: requestedOrgId,
                reason: membership ? `MEMBERSHIP_${membership.status}` : 'NOT_A_MEMBER',
              },
            });
          }

          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_TENANT_MISMATCH',
              message: 'Access denied: You are not an active member of the requested organization.',
            },
            timestamp: new Date().toISOString(),
            requestId: (req.headers['x-request-id'] as string) || 'req_auth',
          });
          return;
        }
        activeMembership = membership;
      } else {
        // Default to the user's primary active membership
        const userMemberships = await dataStore.listUserMemberships(user.id);
        const activeOnes = userMemberships.filter((m) => m.status === 'ACTIVE');

        if (activeOnes.length === 0) {
          const securityService = req.app?.locals?.securityService;
          if (securityService && userMemberships.length > 0) {
            await securityService.recordSecurityEvent({
              organizationId: userMemberships[0].organizationId,
              actorUserId: user.id,
              actorEmail: user.email,
              actorRole: userMemberships[0].role,
              category: 'REVOKED_USER_ACCESS',
              action: 'BLOCKED_REVOKED_USER_ACCESS',
              resourceCategory: 'MEMBERSHIP',
              resourceId: user.id,
              decision: 'DENIED',
              policyReasonCode: 'REVOKED_OR_INACTIVE_MEMBERSHIP',
              severity: 'HIGH',
              isBenignInquiry: false,
              metadata: {
                membershipStatuses: userMemberships.map((m) => m.status),
              },
            });
          }

          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_RBAC_FORBIDDEN',
              message: 'Access denied: User has no active organization memberships.',
            },
            timestamp: new Date().toISOString(),
            requestId: (req.headers['x-request-id'] as string) || 'req_auth',
          });
          return;
        }
        activeMembership = activeOnes[0];
      }

      // 3b. Verify employee profile status if configured (deactivated or suspended employees cannot proceed)
      if (typeof dataStore.getEmployeeProfileByUserId === 'function') {
        const empProfile = await dataStore.getEmployeeProfileByUserId(activeMembership.organizationId, user.id);
        if (empProfile && (empProfile.accountStatus === 'INACTIVE' || empProfile.accountStatus === 'SUSPENDED')) {
          const securityService = req.app?.locals?.securityService;
          if (securityService) {
            await securityService.recordSecurityEvent({
              organizationId: activeMembership.organizationId,
              actorUserId: user.id,
              actorEmail: user.email,
              actorRole: activeMembership.role,
              category: 'REVOKED_USER_ACCESS',
              action: 'BLOCKED_DEACTIVATED_EMPLOYEE_ACCESS',
              resourceCategory: 'EMPLOYEE_PROFILE',
              resourceId: empProfile.id,
              decision: 'DENIED',
              policyReasonCode: `EMPLOYEE_${empProfile.accountStatus}`,
              severity: 'HIGH',
              isBenignInquiry: false,
              metadata: {
                employeeNumber: empProfile.employeeNumber,
                accountStatus: empProfile.accountStatus,
              },
            });
          }

          res.status(403).json({
            success: false,
            error: {
              code: 'FORGEX_RBAC_FORBIDDEN',
              message: `Access denied: Employee account has been ${empProfile.accountStatus.toLowerCase()}.`,
            },
            timestamp: new Date().toISOString(),
            requestId: (req.headers['x-request-id'] as string) || 'req_auth',
          });
          return;
        }
      }

      // 4. Resolve Organization details
      const organization = await dataStore.getOrganizationById(activeMembership.organizationId);
      if (!organization) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FORGEX_ORGANIZATION_NOT_FOUND',
            message: 'Target organization does not exist.',
          },
          timestamp: new Date().toISOString(),
          requestId: (req.headers['x-request-id'] as string) || 'req_auth',
        });
        return;
      }

      // 5. Attach authenticated context to request
      req.auth = {
        user,
        membership: activeMembership,
        organization,
      };

      next();
    } catch (err) {
      logger.warn({ err }, 'Authentication failed');
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: err instanceof Error ? err.message : 'Invalid or expired authentication token.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_auth',
      });
    }
  };
}

export function requireRole(allowedRoles: OrgRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: 'Authentication required prior to role evaluation.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_rbac',
      });
      return;
    }

    const userRole = req.auth.membership.role;

    // ORGANIZATION_OWNER and ORGANIZATION_ADMIN always possess supervisory override
    if (
      userRole === 'ORGANIZATION_OWNER' ||
      userRole === 'ORGANIZATION_ADMIN' ||
      allowedRoles.includes(userRole) ||
      (allowedRoles.includes('ENGINEER') && userRole === 'ENGINEER_TECHNICIAN')
    ) {
      next();
      return;
    }

    // Record security event if accessing sensitive restricted resources (documents, downloads, audit, exports)
    const securityService = req.app?.locals?.securityService;
    if (securityService) {
      const url = req.originalUrl || req.url;
      const isDoc = url.includes('/documents');
      const isExport = url.includes('export');
      const isAudit = url.includes('/audit');

      if (isDoc || isExport || isAudit) {
        const category = isExport
          ? 'UNAUTHORIZED_EXPORT'
          : isDoc
          ? 'CONFIDENTIAL_DOCUMENT_ACCESS'
          : 'RESTRICTED_ACTION';

        const action = url.includes('/download')
          ? 'BLOCKED_DOCUMENT_DOWNLOAD'
          : url.includes('/upload')
          ? 'BLOCKED_DOCUMENT_UPLOAD'
          : isExport
          ? 'BLOCKED_DATA_EXPORT'
          : isDoc
          ? 'BLOCKED_DOCUMENT_ACCESS'
          : 'BLOCKED_AUDIT_LEDGER_ACCESS';

        await securityService.recordSecurityEvent({
          organizationId: req.auth.organization.id,
          actorUserId: req.auth.user.id,
          actorEmail: req.auth.user.email,
          actorRole: userRole,
          category,
          action,
          resourceCategory: isDoc ? 'DOCUMENT' : 'AUDIT',
          resourceId: (req.params?.id as string) || null,
          decision: 'DENIED',
          policyReasonCode: 'ROLE_INSUFFICIENT_PRIVILEGES',
          severity: isExport ? 'HIGH' : 'MEDIUM',
          isBenignInquiry: true,
          metadata: { path: url, requiredRoles: allowedRoles },
        });
      }
    }

    res.status(403).json({
      success: false,
      error: {
        code: 'FORGEX_RBAC_FORBIDDEN',
        message: `Insufficient privileges: Required one of [${allowedRoles.join(', ')}], current role is '${userRole}'.`,
      },
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_rbac',
    });
  };
}

export function requirePermission(permission: OrgPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: 'Authentication required prior to permission evaluation.',
        },
        timestamp: new Date().toISOString(),
        requestId: (req.headers['x-request-id'] as string) || 'req_rbac',
      });
      return;
    }

    const userRole = req.auth.membership.role;
    if (hasPermission(userRole, permission)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: {
        code: 'FORGEX_RBAC_FORBIDDEN',
        message: `Access denied: Action requires permission '${permission}'.`,
      },
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_rbac',
    });
  };
}

export function requirePlantAccess(plantIdExtractor: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: {
          code: 'FORGEX_AUTH_UNAUTHORIZED',
          message: 'Authentication required.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const role = req.auth.membership.role;
    // Owners and Admins have global plant scope
    if (role === 'ORGANIZATION_OWNER' || role === 'ORGANIZATION_ADMIN') {
      next();
      return;
    }

    const assigned = req.auth.membership.assignedPlantIds ?? [];
    // If not restricted to specific plants, pass
    if (assigned.length === 0) {
      next();
      return;
    }

    const requestedPlantId = plantIdExtractor(req);
    if (!requestedPlantId) {
      next();
      return;
    }

    if (!assigned.includes(requestedPlantId)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORGEX_PLANT_ACCESS_DENIED',
          message: `Access denied: You are not assigned to plant '${requestedPlantId}'.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}


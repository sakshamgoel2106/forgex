import type { Request, Response, NextFunction } from 'express';
import type { IAuthAdapter } from '../auth/authAdapter.interface.js';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { AuthenticatedContext, OrgRole } from '@forgex/shared-types';
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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
              reason: membership ? 'MEMBERSHIP_SUSPENDED' : 'NOT_A_MEMBER',
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });

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
  return (req: Request, res: Response, next: NextFunction): void => {
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

    // ORGANIZATION_ADMIN always possesses supervisory override
    if (userRole === 'ORGANIZATION_ADMIN' || allowedRoles.includes(userRole)) {
      next();
      return;
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

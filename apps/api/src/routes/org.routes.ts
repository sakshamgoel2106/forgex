import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requirePermission } from '../middleware/auth.middleware.js';
import { canManageRole, type OrgRole, type MembershipStatus } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export function createOrgRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * GET /api/v1/org
   * Returns current active organization details
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: { code: 'FORGEX_AUTH_UNAUTHORIZED', message: 'Unauthorized' } });
      return;
    }
    res.status(200).json({
      success: true,
      data: req.auth.organization,
    });
  });

  /**
   * GET /api/v1/org/members
   * Returns member list with roles, assigned plants, status, and user info
   */
  router.get('/members', requirePermission('members:read'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const members = await dataStore.listOrganizationMembers(orgId);

      res.status(200).json({
        success: true,
        data: members,
        count: members.length,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to list members');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_MEMBERS_FETCH_FAILED', message: err?.message || 'Failed to list members' },
      });
    }
  });

  /**
   * POST /api/v1/org/invitations
   * Invites an employee with specific role and optional plant assignments
   */
  router.post('/invitations', requirePermission('members:invite'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorRole = req.auth!.membership.role;
      const { email, role, assignedPlantIds } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Valid email address is required.' },
        });
        return;
      }

      const targetRole = role as OrgRole;
      const validRoles: OrgRole[] = [
        'ORGANIZATION_OWNER',
        'ORGANIZATION_ADMIN',
        'PLANT_MANAGER',
        'ENGINEER',
        'TECHNICIAN',
        'WORKER',
        'VIEWER',
      ];

      if (!targetRole || !validRoles.includes(targetRole)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'FORGEX_VALIDATION_ERROR',
            message: `Invalid role. Allowed roles: ${validRoles.join(', ')}.`,
          },
        });
        return;
      }

      // Privilege escalation guard: requester cannot assign a role equal to or higher than their own (except owner)
      if (!canManageRole(actorRole, targetRole)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_ESCALATION_BLOCKED',
            message: `Security violation: Role '${actorRole}' is not authorized to delegate '${targetRole}' privileges.`,
          },
        });
        return;
      }

      // Check if user is already a member
      const existingMembers = await dataStore.listOrganizationMembers(orgId);
      const isAlreadyMember = existingMembers.some(
        (m) => m.user?.email.toLowerCase() === email.trim().toLowerCase() && m.status === 'ACTIVE'
      );
      if (isAlreadyMember) {
        res.status(409).json({
          success: false,
          error: {
            code: 'FORGEX_MEMBER_ALREADY_EXISTS',
            message: `User with email '${email}' is already an active member of this organization.`,
          },
        });
        return;
      }

      // Generate secure token and hash
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      const invitation = await dataStore.createInvitation({
        organizationId: orgId,
        email: email.trim().toLowerCase(),
        role: targetRole,
        invitedByUserId: req.auth!.user.id,
        tokenHash,
        expiresAt,
        assignedPlantIds: Array.isArray(assignedPlantIds) ? assignedPlantIds : [],
      });

      // Record audit event
      await dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: req.auth!.user.id,
        action: 'MEMBER_INVITED',
        resourceType: 'ORGANIZATION_INVITATION',
        resourceId: invitation.id,
        metadata: {
          invitedEmail: invitation.email,
          assignedRole: invitation.role,
          assignedPlantIds: invitation.assignedPlantIds,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({
        success: true,
        message: 'Invitation generated successfully.',
        data: {
          invitation,
          rawToken,
          invitationUrl: `/accept-invitation?token=${rawToken}`,
        },
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to create invitation');
      res.status(err?.message?.includes('already exists') ? 409 : 500).json({
        success: false,
        error: { code: 'FORGEX_INVITE_FAILED', message: err?.message || 'Failed to create invitation' },
      });
    }
  });

  /**
   * GET /api/v1/org/invitations
   * Lists invitations for the current organization
   */
  router.get('/invitations', requirePermission('members:read'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const invitations = await dataStore.listInvitations(orgId);

      res.status(200).json({
        success: true,
        data: invitations,
        count: invitations.length,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_INVITATIONS_FETCH_FAILED', message: err?.message || 'Failed to list invitations' },
      });
    }
  });

  /**
   * POST /api/v1/org/invitations/:id/resend
   * Resends invitation and extends expiration
   */
  router.post('/invitations/:id/resend', requirePermission('members:invite'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const invitation = await dataStore.getInvitationById(orgId, id);
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_NOT_FOUND', message: 'Invitation not found' },
        });
        return;
      }

      if (invitation.status === 'ACCEPTED') {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_ALREADY_ACCEPTED', message: 'Invitation has already been accepted.' },
        });
        return;
      }

      // Re-issue a fresh token and extend expiry
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await dataStore.deleteInvitation(orgId, id);
      const renewed = await dataStore.createInvitation({
        organizationId: orgId,
        email: invitation.email,
        role: invitation.role,
        invitedByUserId: req.auth!.user.id,
        tokenHash,
        expiresAt,
        assignedPlantIds: invitation.assignedPlantIds,
      });

      await dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: req.auth!.user.id,
        action: 'INVITATION_RESENT',
        resourceType: 'ORGANIZATION_INVITATION',
        resourceId: renewed.id,
        metadata: { email: renewed.email, role: renewed.role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Invitation renewed and resent.',
        data: {
          invitation: renewed,
          rawToken,
          invitationUrl: `/accept-invitation?token=${rawToken}`,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_RESEND_FAILED', message: err?.message || 'Failed to resend invitation' },
      });
    }
  });

  /**
   * DELETE /api/v1/org/invitations/:id
   * Revokes or deletes an outstanding invitation
   */
  router.delete('/invitations/:id', requirePermission('members:invite'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const invitation = await dataStore.getInvitationById(orgId, id);
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_INVITATION_NOT_FOUND', message: 'Invitation not found' },
        });
        return;
      }

      await dataStore.updateInvitationStatus(id, 'REVOKED');

      await dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: req.auth!.user.id,
        action: 'INVITATION_REVOKED',
        resourceType: 'ORGANIZATION_INVITATION',
        resourceId: id,
        metadata: { email: invitation.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Invitation revoked successfully.',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_REVOKE_FAILED', message: err?.message || 'Failed to revoke invitation' },
      });
    }
  });

  /**
   * PATCH /api/v1/org/members/:id/role
   * Updates a member's role and assigned plant scope with strict delegation enforcement
   */
  router.patch('/members/:id/role', requirePermission('members:manage_roles'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const actorRole = req.auth!.membership.role;
      const actorUserId = req.auth!.user.id;
      const membershipId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { role, assignedPlantIds } = req.body;

      const targetRole = role as OrgRole;
      const validRoles: OrgRole[] = [
        'ORGANIZATION_OWNER',
        'ORGANIZATION_ADMIN',
        'PLANT_MANAGER',
        'ENGINEER',
        'TECHNICIAN',
        'WORKER',
        'VIEWER',
      ];

      if (!targetRole || !validRoles.includes(targetRole)) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: `Invalid role '${role}'.` },
        });
        return;
      }

      const targetMembership = await dataStore.getMembershipById(orgId, membershipId);
      if (!targetMembership) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MEMBERSHIP_NOT_FOUND', message: 'Membership record not found.' },
        });
        return;
      }

      // Self-demotion check: Sole ORGANIZATION_OWNER cannot demote themselves
      if (targetMembership.userId === actorUserId && targetMembership.role === 'ORGANIZATION_OWNER' && targetRole !== 'ORGANIZATION_OWNER') {
        const allMembers = await dataStore.listOrganizationMembers(orgId);
        const ownerCount = allMembers.filter((m) => m.role === 'ORGANIZATION_OWNER' && m.status === 'ACTIVE').length;
        if (ownerCount <= 1) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_SOLE_OWNER_DEMOTION_BLOCKED',
              message: 'Cannot demote the sole organization owner. Transfer ownership or assign another owner first.',
            },
          });
          return;
        }
      }

      // Check privilege delegation boundary:
      // Can actor manage the current role of target?
      if (!canManageRole(actorRole, targetMembership.role) && targetMembership.userId !== actorUserId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_FORBIDDEN',
            message: `Insufficient privileges: You cannot modify the role of an '${targetMembership.role}'.`,
          },
        });
        return;
      }

      // Can actor assign the new role?
      if (!canManageRole(actorRole, targetRole)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORGEX_RBAC_ESCALATION_BLOCKED',
            message: `Security violation: You cannot delegate role '${targetRole}'.`,
          },
        });
        return;
      }

      const updated = await dataStore.updateMembershipRole(
        orgId,
        membershipId,
        targetRole,
        Array.isArray(assignedPlantIds) ? assignedPlantIds : undefined
      );

      await dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId,
        action: 'MEMBER_ROLE_CHANGED',
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membershipId,
        metadata: {
          targetUserId: targetMembership.userId,
          previousRole: targetMembership.role,
          newRole: targetRole,
          assignedPlantIds: updated?.assignedPlantIds,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Member role updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to update member role');
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_ROLE_UPDATE_FAILED', message: err?.message || 'Failed to update role' },
      });
    }
  });

  /**
   * PATCH /api/v1/org/members/:id/status
   * Suspends or reactivates member access
   */
  router.patch('/members/:id/status', requirePermission('members:remove'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const membershipId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status } = req.body;

      if (!status || !['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) {
        res.status(400).json({
          success: false,
          error: { code: 'FORGEX_VALIDATION_ERROR', message: 'Status must be ACTIVE, SUSPENDED, or REVOKED.' },
        });
        return;
      }

      const targetMembership = await dataStore.getMembershipById(orgId, membershipId);
      if (!targetMembership) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MEMBERSHIP_NOT_FOUND', message: 'Membership record not found.' },
        });
        return;
      }

      // Cannot suspend or revoke sole owner
      if (targetMembership.role === 'ORGANIZATION_OWNER' && (status === 'SUSPENDED' || status === 'REVOKED')) {
        const allMembers = await dataStore.listOrganizationMembers(orgId);
        const ownerCount = allMembers.filter((m) => m.role === 'ORGANIZATION_OWNER' && m.status === 'ACTIVE').length;
        if (ownerCount <= 1) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_SOLE_OWNER_SUSPENSION_BLOCKED',
              message: 'Cannot suspend or revoke the sole active organization owner.',
            },
          });
          return;
        }
      }

      const updated = await dataStore.updateMembershipStatus(orgId, membershipId, status as MembershipStatus);

      await dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: req.auth!.user.id,
        action: status === 'ACTIVE' ? 'MEMBER_REACTIVATED' : (status === 'REVOKED' ? 'MEMBER_REVOKED' : 'MEMBER_SUSPENDED'),
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membershipId,
        metadata: {
          targetUserId: targetMembership.userId,
          newStatus: status,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: `Member status updated to ${status}.`,
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_STATUS_UPDATE_FAILED', message: err?.message || 'Failed to update status' },
      });
    }
  });

  /**
   * DELETE /api/v1/org/members/:id
   * Removes member access from the organization (without destroying historical case/audit references)
   */
  router.delete('/members/:id', requirePermission('members:remove'), async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const membershipId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const targetMembership = await dataStore.getMembershipById(orgId, membershipId);
      if (!targetMembership) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_MEMBERSHIP_NOT_FOUND', message: 'Membership record not found.' },
        });
        return;
      }

      // Cannot delete sole owner
      if (targetMembership.role === 'ORGANIZATION_OWNER') {
        const allMembers = await dataStore.listOrganizationMembers(orgId);
        const ownerCount = allMembers.filter((m) => m.role === 'ORGANIZATION_OWNER').length;
        if (ownerCount <= 1) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_SOLE_OWNER_DELETION_BLOCKED',
              message: 'Cannot remove the sole organization owner. Designate a new owner before removing.',
            },
          });
          return;
        }
      }

      await dataStore.deleteMembership(orgId, membershipId);

      await dataStore.recordAuditEvent({
        organizationId: orgId,
        actorUserId: req.auth!.user.id,
        action: 'MEMBER_REMOVED',
        resourceType: 'ORGANIZATION_MEMBERSHIP',
        resourceId: membershipId,
        metadata: {
          removedUserId: targetMembership.userId,
          previousRole: targetMembership.role,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Member removed successfully.',
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_DELETE_FAILED', message: err?.message || 'Failed to remove member' },
      });
    }
  });

  return router;
}

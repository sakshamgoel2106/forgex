import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import type { BadgeStatus } from '@forgex/shared-types';

export function createBadgeRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * Helper to securely hash a badge PIN with a constant salt
   */
  function hashPin(pin: string): string {
    const salt = 'forgex_badge_salt_2026';
    return crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');
  }

  /**
   * POST /api/v1/badges
   * Admin issues an employee badge credential
   */
  router.post(
    '/',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const { userId, badgeCode, pin } = req.body;

        if (!userId || !badgeCode || !pin) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: 'userId, badgeCode, and pin are required.' },
          });
          return;
        }

        if (pin.trim().length < 4) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: 'PIN must be at least 4 digits.' },
          });
          return;
        }

        const pinHash = hashPin(pin);
        const badge = await dataStore.issueEmployeeBadge(orgId, {
          userId,
          badgeCode: badgeCode.trim().toUpperCase(),
          pinHash,
        });

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'EMPLOYEE_BADGE_ISSUED',
          resourceType: 'EMPLOYEE_BADGE',
          resourceId: badge.id,
          metadata: { userId: badge.userId, badgeCode: badge.badgeCode },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(201).json({
          success: true,
          message: 'Employee badge credential issued successfully.',
          data: {
            id: badge.id,
            organizationId: badge.organizationId,
            userId: badge.userId,
            badgeCode: badge.badgeCode,
            status: badge.status,
            issuedAt: badge.issuedAt,
          },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_BADGE_FAILED', message: err?.message || 'Failed to issue badge' },
        });
      }
    }
  );

  /**
   * GET /api/v1/badges/me
   * Authenticated user gets their badge card metadata (for printable badge display)
   */
  router.get('/me', async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = req.auth!.organization.id;
      const user = req.auth!.user;
      const membership = req.auth!.membership;

      const badge = await dataStore.getEmployeeBadgeByUserId(orgId, user.id);
      if (!badge) {
        res.status(404).json({
          success: false,
          error: { code: 'FORGEX_NOT_FOUND', message: 'No active employee badge found for this user.' },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          badgeId: badge.id,
          badgeCode: badge.badgeCode,
          status: badge.status,
          employeeName: user.fullName,
          employeeEmail: user.email,
          role: membership.role,
          organizationName: req.auth!.organization.name,
          issuedAt: badge.issuedAt,
          // Non-sensitive barcode/QR payload
          badgeQrPayload: `FORGEX-BADGE:${badge.badgeCode}`,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'FORGEX_BADGE_FAILED', message: err?.message || 'Failed to get badge' },
      });
    }
  });

  /**
   * PATCH /api/v1/badges/:id/status
   * Admin suspends or revokes a badge
   */
  router.patch(
    '/:id/status',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const orgId = req.auth!.organization.id;
        const actorUserId = req.auth!.user.id;
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { status } = req.body; // 'ACTIVE' | 'SUSPENDED' | 'REVOKED'

        if (!status || !['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) {
          res.status(400).json({
            success: false,
            error: { code: 'FORGEX_VALIDATION_ERROR', message: "status must be 'ACTIVE', 'SUSPENDED', or 'REVOKED'." },
          });
          return;
        }

        const updated = await dataStore.updateEmployeeBadgeStatus(orgId, id, status as BadgeStatus);
        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Badge not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: `BADGE_${status}`,
          resourceType: 'EMPLOYEE_BADGE',
          resourceId: id,
          metadata: { status },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: `Badge status updated to ${status}.`,
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_BADGE_FAILED', message: err?.message || 'Failed to update badge status' },
        });
      }
    }
  );

  return router;
}

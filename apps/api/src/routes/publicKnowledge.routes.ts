import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';

export function createPublicKnowledgeRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * POST /api/v1/knowledge/public-lookup
   * Admin-initiated public OEM specification enrichment.
   *
   * STRICT PRIVACY BOUNDARY:
   * Rejects if confidential or private fields are submitted (serial number, plant, internal notes).
   * Only manufacturer and generic model/family are queried.
   * Results are labeled PUBLIC_SUGGESTION and NEVER automatically overwrite verified private facts.
   */
  router.post(
    '/public-lookup',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { manufacturer, modelNumber, productFamily, serialNumber, plantId, privateNotes } = req.body;

        // Privacy violation guard
        if (serialNumber || plantId || privateNotes) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_PRIVACY_VIOLATION_BLOCKED',
              message:
                'Security Policy Violation: Serial numbers, plant locations, and private notes must NEVER be sent to public lookup services.',
            },
          });
          return;
        }

        if (!manufacturer || !modelNumber) {
          res.status(400).json({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'Manufacturer and Model Number are required for public knowledge lookup.',
            },
          });
          return;
        }

        // Check if we already have a cached public knowledge entry
        let cached = await dataStore.getPublicMachineKnowledge(manufacturer, modelNumber);
        if (!cached) {
          // Curated public manufacturer repository lookup (mocked with realistic OEM specifications)
          const mfrLower = manufacturer.toLowerCase();
          const modelLower = modelNumber.toLowerCase();

          let publicSpecs: Record<string, string | number> = {
            design_standard: 'ISO 5199 / ANSI B73.1',
            operating_temp_range: '-40C to 260C',
            casing_material: 'ASTM A890 Grade 4A Super Duplex',
            typical_speed_rpm: 3550,
          };

          let sourcePublisher = `${manufacturer} Corporation (Public Technical Catalog)`;
          let sourceUrl = `https://public-catalog.oem-industrial.org/specs?mfr=${encodeURIComponent(manufacturer)}&model=${encodeURIComponent(modelNumber)}`;

          if (mfrLower.includes('flowserve') || modelLower.includes('mark 3')) {
            publicSpecs = {
              impeller_type: 'Reverse Vane Semi-Open',
              flange_rating: 'ANSI Class 150 / 300 RF',
              shaft_deflection_limit_mm: 0.05,
              seal_chamber_standard: 'API 682 Plan 11 / 52',
              maximum_flow_rate_gpm: 450,
              max_head_ft: 320,
            };
            sourcePublisher = 'Flowserve Industrial Pump Division';
            sourceUrl = 'https://flowserve.com/en/products/pumps/ansi-chemical-process-pumps/mark-3-ansi-pump/';
          } else if (mfrLower.includes('elliott') || modelLower.includes('29m')) {
            publicSpecs = {
              stages: '4-Stage Centrifugal Multi-Stage',
              casing_type: 'Radially Split Barrel (API 617)',
              design_pressure_bar: 85,
              maximum_continuous_speed_rpm: 10400,
              lube_oil_specification: 'ISO VG 32 Synthetic Turbine Oil',
            };
            sourcePublisher = 'Elliott Group Turbomachinery';
            sourceUrl = 'https://elliott-turbo.com/compressors/barrel-compressors/';
          }

          cached = await dataStore.savePublicMachineKnowledge({
            manufacturer,
            modelNumber,
            productFamily: productFamily || undefined,
            publicSpecs,
            sourceUrl,
            sourcePublisher,
            verificationStatus: 'PUBLIC_SUGGESTION',
          });
        }

        res.status(200).json({
          success: true,
          message: 'Public knowledge retrieved. Review required before merging into verified record.',
          data: {
            ...cached,
            notice: 'PUBLIC SOURCE INFORMATION: Not verified by organization plant engineer.',
          },
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_PUBLIC_LOOKUP_FAILED', message: err?.message || 'Public lookup failed' },
        });
      }
    }
  );

  /**
   * POST /api/v1/knowledge/public-lookup/:id/approve
   * Admin or Plant Manager reviews and approves public OEM suggestions into verified facts
   */
  router.post(
    '/public-lookup/:id/approve',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const orgId = req.auth!.organization.id;

        const updated = await dataStore.updatePublicMachineKnowledgeStatus(id, 'APPROVED', actorUserId);
        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Public knowledge entry not found.' },
          });
          return;
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'PUBLIC_KNOWLEDGE_APPROVED',
          resourceType: 'PUBLIC_KNOWLEDGE',
          resourceId: id,
          metadata: { manufacturer: updated.manufacturer, modelNumber: updated.modelNumber },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Public technical specifications approved for inclusion in machine facts.',
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_APPROVAL_FAILED', message: err?.message || 'Approval failed' },
        });
      }
    }
  );

  return router;
}

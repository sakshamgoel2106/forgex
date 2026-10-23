import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { publicOemLookupService } from '../services/publicOemLookup.service.js';

export function createPublicKnowledgeRouter(dataStore: IDataStore): Router {
  const router = Router();

  /**
   * POST /api/v1/knowledge/public-lookup
   * Admin-initiated public OEM specification enrichment.
   *
   * STRICT PRIVACY BOUNDARY:
   * Rejects if confidential or private fields are submitted (serial number, plant, internal notes).
   * Only manufacturer and generic model/family are queried.
   * Results are labeled PUBLIC_SUGGESTION / PENDING_ADMIN_APPROVAL and NEVER automatically overwrite verified private facts.
   */
  router.post(
    '/public-lookup',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const {
          manufacturer,
          modelNumber,
          productFamily,
          serialNumber,
          plantId,
          privateNotes,
          machineId,
          customSourceUrl,
          forceRefresh: _forceRefresh,
        } = req.body;

        // Privacy violation guard: strictly block internal private details
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

        const orgId = req.auth?.organization?.id;

        // Perform genuine OEM source classification, model matching, completeness checklist, and conflict detection
        const lookupResult = await publicOemLookupService.performLookup(
          {
            manufacturer,
            modelNumber,
            productFamily,
            customSourceUrl,
            machineId,
            organizationId: orgId,
          },
          dataStore
        );

        // Persist to database / cache
        const saved = await dataStore.savePublicMachineKnowledge({
          manufacturer: lookupResult.manufacturer,
          modelNumber: lookupResult.modelNumber,
          productFamily: lookupResult.productFamily,
          publicSpecs: lookupResult.publicSpecs,
          sourceUrl: lookupResult.sourceUrl,
          sourcePublisher: lookupResult.sourcePublisher,
          verificationStatus: lookupResult.verificationStatus,
          sourceType: lookupResult.sourceType,
          matchStatus: lookupResult.matchStatus,
          missingModelDetails: lookupResult.missingModelDetails,
          completenessSummary: lookupResult.completenessSummary,
          evidenceRecords: lookupResult.evidenceRecords,
          conflicts: lookupResult.conflicts,
          reviewNotes: lookupResult.reviewNotes,
        });

        // Automatically populate candidate claims into Machine Recovery ledger
        if (machineId && orgId && saved.publicSpecs && Object.keys(saved.publicSpecs).length > 0) {
          for (const [key, val] of Object.entries(saved.publicSpecs)) {
            try {
              await dataStore.createEvidenceClaim(orgId, {
                machineId,
                fieldName: key,
                claimValue: String(val),
                confidence: 'MEDIUM',
                isSafetyCritical: ['pressure', 'voltage', 'current', 'loto', 'mawp'].some((k) =>
                  key.toLowerCase().includes(k)
                ),
                sourceType: 'MANUFACTURER_DOCUMENT',
                sourceDocumentId: saved.id,
                extractionMethod: 'DOCUMENT_PARSER',
                applicabilityStatus: 'UNCERTAIN',
                applicabilityRationale: `Candidate spec from Public OEM Lookup (${saved.manufacturer} ${saved.modelNumber})`,
                submittedByUserId: req.auth?.user?.id || 'system',
              });
            } catch {
              // ignore duplicate
            }
          }
        }

        // Determine user-facing safety notice based on actual evidence status
        let notice = 'PUBLIC SOURCE INFORMATION: Not verified by organization plant engineer.';
        if (saved.verificationStatus === 'SOURCE_UNVERIFIED') {
          notice = 'UNVERIFIED SOURCE: External source could not be validated against official OEM records. No specifications inferred.';
        } else if (saved.verificationStatus === 'MODEL_MISMATCH') {
          notice = `MODEL MISMATCH: No credible manufacturer specifications found matching model '${modelNumber}'.`;
        } else if (saved.matchStatus === 'FAMILY_LEVEL_ONLY' || saved.verificationStatus === 'FAMILY_LEVEL_ONLY') {
          notice = 'PUBLIC SOURCE INFORMATION: Not verified by organization plant engineer. PRODUCT FAMILY ENVELOPE: Broad family characteristics only. Specific model parameters required before confirming specifications.';
        } else if (saved.verificationStatus === 'CONFLICTING_DATA') {
          notice = 'DATA CONFLICT DETECTED: Public specifications contradict active machine records or company documentation. Manual engineering review required.';
        }

        res.status(200).json({
          success: true,
          message: 'Public knowledge retrieved. Review required before merging into verified record.',
          data: {
            ...saved,
            notice,
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
        const { reviewNotes, machineId } = req.body || {};

        const updated = await dataStore.updatePublicMachineKnowledgeStatus(
          id,
          'APPROVED',
          actorUserId,
          reviewNotes || 'Approved by authorized plant administrator.'
        );

        if (!updated) {
          res.status(404).json({
            success: false,
            error: { code: 'FORGEX_NOT_FOUND', message: 'Public knowledge entry not found.' },
          });
          return;
        }

        // If machineId is supplied, merge approved specs safely without overwriting conflicting fields silently
        if (machineId) {
          try {
            const machine = await dataStore.getMachineById(orgId, machineId);
            if (machine) {
              const currentSpecs = (machine.technicalSpecs || {}) as Record<string, any>;
              const mergedSpecs = { ...currentSpecs };

              // Only copy non-conflicting fields if there are conflicts
              const conflictKeys = (updated.conflicts || []).map((c) => c.reason.toLowerCase());
              for (const [key, val] of Object.entries(updated.publicSpecs)) {
                const isConflicted = conflictKeys.some((ck) => ck.includes(key.replace(/_/g, ' ')));
                if (!isConflicted && currentSpecs[key] === undefined) {
                  mergedSpecs[key] = val;
                }

                // Populate approved claims into Machine Recovery evidence ledger
                try {
                  await dataStore.createEvidenceClaim(orgId, {
                    machineId,
                    fieldName: key,
                    claimValue: String(val),
                    confidence: 'HIGH',
                    isSafetyCritical: ['pressure', 'voltage', 'current', 'loto', 'mawp'].some((k) =>
                      key.toLowerCase().includes(k)
                    ),
                    sourceType: 'MANUFACTURER_DOCUMENT',
                    sourceDocumentId: id,
                    extractionMethod: 'DOCUMENT_PARSER',
                    applicabilityStatus: 'APPLICABLE',
                    applicabilityRationale: `Verified OEM specification from ${updated.manufacturer} ${updated.modelNumber}`,
                    submittedByUserId: actorUserId,
                  });
                } catch {
                  // ignore duplicate claim
                }
              }

              await dataStore.updateMachine(orgId, machineId, {
                technicalSpecs: mergedSpecs,
                manufacturer: machine.manufacturer || updated.manufacturer,
                modelNumber: machine.modelNumber || updated.modelNumber,
              });

              // Re-evaluate verification status in real-time
              await dataStore.getMachineVerification(orgId, machineId);
            }
          } catch {
            // Machine update failure non-fatal to approval audit
          }
        }

        await dataStore.recordAuditEvent({
          organizationId: orgId,
          actorUserId,
          action: 'PUBLIC_KNOWLEDGE_APPROVED',
          resourceType: 'PUBLIC_KNOWLEDGE',
          resourceId: id,
          metadata: {
            manufacturer: updated.manufacturer,
            modelNumber: updated.modelNumber,
            reviewNotes: reviewNotes || 'Approved',
            machineId,
          },
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

  /**
   * POST /api/v1/knowledge/public-lookup/:id/reject
   * Admin or Plant Manager rejects public OEM suggestions
   */
  router.post(
    '/public-lookup/:id/reject',
    requireRole(['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'PLANT_MANAGER']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const actorUserId = req.auth!.user.id;
        const orgId = req.auth!.organization.id;
        const { rejectionReason } = req.body || {};

        const updated = await dataStore.updatePublicMachineKnowledgeStatus(
          id,
          'REJECTED',
          actorUserId,
          rejectionReason || 'Rejected by authorized plant administrator.'
        );

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
          action: 'PUBLIC_KNOWLEDGE_REJECTED',
          resourceType: 'PUBLIC_KNOWLEDGE',
          resourceId: id,
          metadata: {
            manufacturer: updated.manufacturer,
            modelNumber: updated.modelNumber,
            rejectionReason: rejectionReason || 'Rejected',
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
          success: true,
          message: 'Public technical specifications rejected.',
          data: updated,
        });
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: { code: 'FORGEX_REJECTION_FAILED', message: err?.message || 'Rejection failed' },
        });
      }
    }
  );

  return router;
}

import type {
  Machine,
  MachineVerificationRecord,
  VerificationCheck,
  VerificationState,
  MachineVerificationWorkflowStatus,
} from '@forgex/shared-types';

export interface MachineVerificationOptions {
  documentCount?: number;
  models3dCount?: number;
  drawingsCount?: number;
}

/**
 * Computes deterministic machine verification checks based on authoritative machine state
 * and verified presence of documents, technical specs, and digital twin assets in the database.
 *
 * Rules:
 * 1. Identity & Serial:
 *    - All identification fields (assetTag, name, manufacturer, modelNumber, serialNumber) must be populated.
 *    - Values such as 'Unknown', 'N/A', 'unverified' or missing serialNumber mark this check as PENDING.
 * 2. Documentation:
 *    - Must evaluate actual document count from the database for the machine asset_id.
 *    - If document count is 0, the check MUST show PENDING / INCOMPLETE (even if readiness was drafted as READY).
 *    - If document count > 0 and documentationReadiness === 'READY', status is PASSED.
 * 3. Technical Operating Specs:
 *    - Must have at least 1 verified engineering operating parameter in technicalSpecs (excluding transient file metadata,
 *      unknowns, or blank values).
 * 4. Digital Twin / Engineering Attachments:
 *    - Strictly checks presence of real 3D models or P&ID schematics.
 *    - If required (hasModel3d / hasPidDiagram), valid storage keys, URLs, or database records must exist.
 *    - If neither is required, passes or marks NOT_APPLICABLE depending on whether attachments exist.
 */
export function computeMachineVerification(
  machine: Machine,
  existingRecord?: Partial<MachineVerificationRecord>,
  options?: MachineVerificationOptions
): {
  checks: VerificationCheck[];
  overallState: VerificationState;
  status: MachineVerificationWorkflowStatus;
} {
  const cleanTag = machine.assetTag?.trim();
  const cleanName = machine.name?.trim();
  const cleanMfg = machine.manufacturer?.trim();
  const cleanMdl = machine.modelNumber?.trim();
  const cleanSerial = machine.serialNumber?.trim();

  const isInvalidIdentityVal = (val?: string | null) =>
    !val ||
    val.toLowerCase() === 'unknown' ||
    val.toLowerCase() === 'n/a' ||
    val.toLowerCase() === 'unverified' ||
    val.toLowerCase() === 'null';

  // 1. Identity Check
  const hasIdentity = Boolean(
    cleanTag &&
    cleanName &&
    cleanMfg &&
    !isInvalidIdentityVal(cleanMfg) &&
    cleanMdl &&
    !isInvalidIdentityVal(cleanMdl) &&
    cleanSerial &&
    !isInvalidIdentityVal(cleanSerial)
  );

  const identityCheck: VerificationCheck = {
    key: 'identity',
    label: 'Machine Identity & Serial Number Verification',
    required: true,
    status: hasIdentity ? 'PASSED' : 'PENDING',
    details: hasIdentity
      ? `Identified: ${cleanMfg} ${cleanMdl} (S/N: ${cleanSerial})`
      : !cleanSerial || isInvalidIdentityVal(cleanSerial)
        ? 'Serial number is missing or unverified.'
        : 'Manufacturer OEM or Model number missing or unverified.',
    failureReason: hasIdentity ? null : 'Incomplete identification fields or missing serial number.',
    correctiveAction: hasIdentity
      ? null
      : 'Conduct physical nameplate inspection to record valid serial number and OEM model.',
  };

  // 2. Documentation Check (Strict dynamic database evaluation)
  const docReadiness = machine.documentationReadiness;
  const attachedEvidenceCount = Array.isArray(existingRecord?.evidenceAttachmentKeys)
    ? existingRecord.evidenceAttachmentKeys.length
    : 0;
  const directManualCount =
    machine.technicalSpecs?.manualStorageKey ||
    machine.technicalSpecs?.manualFileName ||
    machine.technicalSpecs?.manualUrl
      ? 1
      : 0;
  const rawDbDocCount = options?.documentCount ?? 0;
  const effectiveDocCount = rawDbDocCount + attachedEvidenceCount + directManualCount;

  // Strict check: If document count is 0, Documentation check MUST show PENDING or INCOMPLETE
  const hasDocuments = effectiveDocCount > 0;
  const isDocReady = hasDocuments && docReadiness === 'READY';
  const isDocPending = hasDocuments && docReadiness === 'PENDING_INSPECTION';

  const documentationCheck: VerificationCheck = {
    key: 'documentation',
    label: 'Engineering Documentation & Manuals Readiness',
    required: true,
    status: isDocReady ? 'PASSED' : 'PENDING',
    details: isDocReady
      ? `${effectiveDocCount} verified operating manual(s) and engineering document(s) on record.`
      : !hasDocuments
        ? '0 operating manuals or engineering documents uploaded for this asset.'
        : isDocPending
          ? `${effectiveDocCount} document(s) registered; pending physical engineering inspection.`
          : 'Documentation readiness is incomplete in database.',
    failureReason: isDocReady
      ? null
      : !hasDocuments
        ? 'Zero verified manuals or engineering documents found in database for this asset.'
        : 'Documentation readiness not confirmed as READY.',
    correctiveAction: isDocReady
      ? null
      : !hasDocuments
        ? 'Upload official OEM manual or engineering documentation in Engineering Workspace or attach evidence.'
        : 'Inspect technical documentation or attach authorized OEM manual.',
  };

  // 3. Technical Specifications Check (Strict evaluation of real operating parameters)
  const excludedSpecKeys = new Set([
    'model3dFileName',
    'model3dFileSize',
    'pidFileName',
    'pidFileSize',
    'manualStorageKey',
    'manualFileName',
    'manualFileSize',
    'manualUrl',
    'technicalSpecs',
  ]);
  const actualSpecs = Object.entries(machine.technicalSpecs || {}).filter(
    ([k, v]) => {
      if (excludedSpecKeys.has(k)) return false;
      if (v === null || v === undefined) return false;
      const str = String(v).trim();
      return (
        str !== '' &&
        str.toLowerCase() !== 'unknown' &&
        str.toLowerCase() !== 'n/a' &&
        str.toLowerCase() !== 'null' &&
        str.toLowerCase() !== 'undefined'
      );
    }
  );
  const hasSpecs = actualSpecs.length > 0;
  const technicalSpecsCheck: VerificationCheck = {
    key: 'technicalSpecs',
    label: 'Verified Operating Technical Specifications',
    required: true,
    status: hasSpecs ? 'PASSED' : 'PENDING',
    details: hasSpecs
      ? `${actualSpecs.length} technical parameter(s) recorded in verified ledger.`
      : 'No verified technical operating parameters recorded.',
    failureReason: hasSpecs ? null : 'Technical parameters unrecorded or pending measurement.',
    correctiveAction: hasSpecs
      ? null
      : 'Assign technician task or input verified engineering operating parameters.',
  };

  // 4. Engineering Attachments Check (3D Twin / P&ID)
  const models3dCount = options?.models3dCount ?? 0;
  const drawingsCount = options?.drawingsCount ?? 0;

  const has3dFile = Boolean(
    (machine.model3dStorageKey && machine.model3dStorageKey.trim()) ||
    (machine.model3dUrl && machine.model3dUrl.trim()) ||
    (machine.model3dFile && machine.model3dFile.name) ||
    models3dCount > 0
  );
  const hasPidFile = Boolean(
    (machine.pidStorageKey && machine.pidStorageKey.trim()) ||
    (machine.pidUrl && machine.pidUrl.trim()) ||
    (machine.pAndIdUrl && machine.pAndIdUrl.trim()) ||
    (machine.pidFile && machine.pidFile.name) ||
    (machine.pAndIdFile && machine.pAndIdFile.name) ||
    drawingsCount > 0
  );

  const requires3d = Boolean(machine.hasModel3d);
  const requiresPid = Boolean(machine.hasPidDiagram);
  const requiresAttachments = requires3d || requiresPid;

  let attachmentsStatus: 'PASSED' | 'PENDING' | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
  let attachmentsPassed = false;
  let attachmentDetails = 'No digital twin or schematic attachments required.';

  if (requiresAttachments) {
    const missing: string[] = [];
    if (requires3d && !has3dFile) missing.push('3D Digital Twin Model');
    if (requiresPid && !hasPidFile) missing.push('P&ID Engineering Schematic');

    if (missing.length === 0) {
      attachmentsPassed = true;
      attachmentsStatus = 'PASSED';
      attachmentDetails = 'All declared engineering CAD models and P&ID drawings attached and verified.';
    } else {
      attachmentsPassed = false;
      attachmentsStatus = 'PENDING';
      attachmentDetails = `Missing declared attachment(s): ${missing.join(', ')}.`;
    }
  } else if (has3dFile || hasPidFile) {
    attachmentsPassed = true;
    attachmentsStatus = 'PASSED';
    const presentList: string[] = [];
    if (has3dFile) presentList.push('3D Digital Twin');
    if (hasPidFile) presentList.push('P&ID Schematic');
    attachmentDetails = `${presentList.join(' & ')} verified and linked to asset.`;
  }

  const engineeringAttachmentsCheck: VerificationCheck = {
    key: 'engineeringAttachments',
    label: 'Digital Twin Model & P&ID Schematic Verification',
    required: requiresAttachments,
    status: attachmentsStatus,
    details: attachmentDetails,
    failureReason:
      !requiresAttachments || attachmentsPassed
        ? null
        : 'Required CAD/P&ID files not uploaded or verified.',
    correctiveAction:
      !requiresAttachments || attachmentsPassed
        ? null
        : 'Attach required 3D model (.glb/.gltf/.step) or schematic (.pdf/.dwg).',
  };

  const checks: VerificationCheck[] = [
    identityCheck,
    documentationCheck,
    technicalSpecsCheck,
    engineeringAttachmentsCheck,
  ];

  // Determine overall verification state & workflow status
  const allRequiredPassed = checks
    .filter((c) => c.required)
    .every((c) => c.status === 'PASSED' || c.status === 'NOT_APPLICABLE');

  const anyFailed = checks.some((c) => c.status === 'FAILED');

  let overallState: VerificationState = 'UNVERIFIED';
  let status: MachineVerificationWorkflowStatus = 'PENDING';

  if (existingRecord?.status === 'REJECTED') {
    status = 'REJECTED';
    overallState = anyFailed ? 'UNVERIFIED' : 'PARTIALLY_VERIFIED';
  } else if (existingRecord?.approvedByUserId && allRequiredPassed) {
    status = 'VERIFIED';
    overallState = 'VERIFIED';
  } else if (allRequiredPassed) {
    status = 'READY_FOR_APPROVAL';
    overallState = 'PARTIALLY_VERIFIED';
  } else if (checks.some((c) => c.status === 'PASSED')) {
    status = 'IN_PROGRESS';
    overallState = 'PARTIALLY_VERIFIED';
  } else {
    status = 'PENDING';
    overallState = 'UNVERIFIED';
  }

  return { checks, overallState, status };
}

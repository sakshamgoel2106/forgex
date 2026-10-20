/**
 * ForgeX AI — Phase 3: Machine Knowledge Recovery Service
 *
 * Coordinates evidence ingestion, AI/OCR extraction, candidate claim creation,
 * cross-source inconsistency detection, safe collection tasks, and engineering review.
 */
import type { IDataStore } from '../db/dataStore.interface.js';
import type {
  MachineEvidenceClaim,
  MachineRecoveryProfile,
  MachineRecoverySummary,
  CreateEvidenceClaimDTO,
  ReviewEvidenceClaimDTO,
  ClaimFilterOptions,
  IngestEvidenceExtractDTO,
  IngestEvidenceResponse,
  ExtractedCandidateClaim,
  ClaimExtractionMethod,
  ClaimApplicability,
  MissingInformationTask,
  BulkMachineImportDTO,
  BulkMachineImportResult,
  BulkMachineImportRow,
  SubmitTaskEvidenceDTO,
  ReviewTaskSubmissionDTO,
  ExpertKnowledgeEntry,
  CreateExpertKnowledgeDTO,
  ReviewExpertKnowledgeDTO,
  ExpertKnowledgeFilterOptions,
  Machine,
} from '@forgex/shared-types';
import { SecurityEventService } from './securityEvent.service.js';
import { PromptDefenseService } from '../ai/promptSanitizer.js';
import { logger } from '../utils/logger.js';

export interface RecoveryActorContext {
  organizationId: string;
  userId: string;
  userEmail?: string;
  userRole?: string;
  assignedPlantIds?: string[];
}

export class MachineRecoveryService {
  constructor(
    private dataStore: IDataStore,
    private securityService: SecurityEventService
  ) {}

  /**
   * Ingest evidence (nameplate photo, scanned document, technician notes, repair logs)
   * and extract candidate claims with provenance tracking.
   *
   * AI-extracted candidate claims are ALWAYS stored as unverified ('AWAITING_REVIEW').
   */
  public async ingestAndExtractEvidence(
    dto: IngestEvidenceExtractDTO,
    context: RecoveryActorContext
  ): Promise<IngestEvidenceResponse> {
    const { organizationId, userId, userEmail, userRole } = context;

    // 1. Validate target machine exists and belongs to tenant
    const machine = await this.dataStore.getMachineById(organizationId, dto.machineId);
    if (!machine) {
      throw new Error(`Machine '${dto.machineId}' not found in organization.`);
    }

    // 2. Validate plant access
    if (context.assignedPlantIds && context.assignedPlantIds.length > 0 && !context.assignedPlantIds.includes(machine.plantId)) {
      await this.securityService.recordSecurityEvent({
        organizationId,
        actorUserId: userId,
        actorEmail: userEmail,
        actorRole: userRole,
        category: 'CROSS_PLANT_ACCESS',
        action: 'EVIDENCE_INGESTION_BLOCKED',
        resourceCategory: 'MACHINE',
        resourceId: machine.id,
        decision: 'DENIED',
        policyReasonCode: 'CROSS_PLANT_DENIED',
        severity: 'MEDIUM',
        isBenignInquiry: true,
      });
      throw new Error(`Unauthorized: User is not assigned to plant '${machine.plantId}'.`);
    }

    // 3. Document validation if documentId provided
    let sourceDocTitle = '';
    let sourceDocRevision = dto.sourceRevision || 'Rev 1.0';
    if (dto.documentId) {
      const doc = await this.dataStore.getDocumentById(organizationId, dto.documentId);
      if (!doc) {
        throw new Error(`Source document '${dto.documentId}' not found in organization.`);
      }
      sourceDocTitle = doc.title;
    }

    // 4. Untrusted Content Sanitization & Prompt Injection Defense
    let rawText = dto.rawText || dto.technicianObservations || '';
    if (rawText) {
      const sanitized = PromptDefenseService.sanitizeUntrustedText(rawText);
      if (sanitized.hasAdversarialInstruction) {
        await this.securityService.recordSecurityEvent({
          organizationId,
          actorUserId: userId,
          actorEmail: userEmail,
          actorRole: userRole,
          category: 'RESTRICTED_ACTION',
          action: 'EVIDENCE_PROMPT_INJECTION_DEFANGED',
          resourceCategory: 'MACHINE_EVIDENCE',
          resourceId: machine.id,
          decision: 'DENIED',
          policyReasonCode: 'ADVERSARIAL_INSTRUCTION_OVERRIDE_BLOCKED',
          severity: 'HIGH',
          isBenignInquiry: false,
          metadata: {
            patterns: sanitized.detectedPatterns,
            evidenceType: dto.evidenceType,
          },
        });
        logger.warn(
          { organizationId, machineId: machine.id, patterns: sanitized.detectedPatterns },
          'Adversarial injection detected and sanitized in evidence ingestion'
        );
      }
      rawText = sanitized.content;
    }

    // 5. Pattern-based and heuristic extraction of candidate claims
    const extractedCandidates: ExtractedCandidateClaim[] = [];
    const potentialInconsistencies: string[] = [];
    const unresolvedQuestions: string[] = [];

    let extractionMethod: ClaimExtractionMethod = 'MANUAL_ENTRY';
    if (dto.evidenceType === 'NAMEPLATE_PHOTO') {
      extractionMethod = dto.imageBuffer ? 'AI_VISION' : 'OCR';
    } else if (dto.evidenceType === 'SCANNED_MANUAL' || dto.evidenceType === 'ENGINEERING_DRAWING') {
      extractionMethod = 'DOCUMENT_PARSER';
    }

    const text = rawText;

    // Check for manufacturer
    const mfrMatch = text.match(/\b(?:Manufacturer|OEM|Mfr|Fabricator|Brand|Made by)[\s:]+([A-Za-z0-9&.\- ]{2,30})/i) ||
      text.match(/\b(Sulzer|Flowserve|Grundfos|Siemens|ITT Goulds|ABB|GE|Worthington|Babcock & Wilcox|Kirloskar|Ingersoll Rand|Kato Engineering)\b/i);
    if (mfrMatch) {
      const val = (mfrMatch[1] || mfrMatch[0]).trim();
      extractedCandidates.push({
        fieldName: 'manufacturer',
        displayName: 'Manufacturer / OEM',
        candidateValue: val,
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: false,
        notes: `Extracted from ${dto.evidenceType}`,
      });
    }

    // Check for model number
    const modelMatch = text.match(/\b(?:Model|Type|Frame|Cat No|Part No)[\s:#]+([A-Z0-9\-/.]{3,24})/i);
    if (modelMatch) {
      extractedCandidates.push({
        fieldName: 'modelNumber',
        displayName: 'Model Number',
        candidateValue: modelMatch[1].trim(),
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: false,
      });
    }

    // Check for serial number
    const serialMatch = text.match(/\b(?:Serial|S\/N|Serial No|Serial Number|NB#)[\s:#]+([A-Z0-9\-]{4,24})/i);
    if (serialMatch) {
      extractedCandidates.push({
        fieldName: 'serialNumber',
        displayName: 'Serial Number',
        candidateValue: serialMatch[1].trim(),
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: false,
      });
    }

    // Check for manufacturing year
    const yearMatch = text.match(/\b(?:Year|Mfg Year|Built|Date of Mfg)[\s:#]+(19[5-9]\d|20[0-2]\d)\b/i);
    if (yearMatch) {
      extractedCandidates.push({
        fieldName: 'manufacturingYear',
        displayName: 'Manufacturing Year',
        candidateValue: parseInt(yearMatch[1], 10),
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: false,
      });
    }

    // Check for design/operating pressure
    const pressureMatch = text.match(/\b(?:Design Pressure|Discharge Pressure|MAWP|Working Pressure|Pressure)[\s:#]+([0-9.]+)\s*(bar|psi|kPa|MPa)\b/i);
    if (pressureMatch) {
      extractedCandidates.push({
        fieldName: 'designDischargePressure',
        displayName: 'Design Discharge Pressure',
        candidateValue: parseFloat(pressureMatch[1]),
        unit: pressureMatch[2].toLowerCase(),
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: true,
      });
    }

    // Check for RPM / Rated Speed
    const rpmMatch = text.match(/\b(?:Rated Speed|Speed|RPM)[\s:#]+([0-9]{3,5})\s*(?:rpm|RPM)?\b/i);
    if (rpmMatch) {
      extractedCandidates.push({
        fieldName: 'nameplateRpm',
        displayName: 'Rated Speed (RPM)',
        candidateValue: parseInt(rpmMatch[1], 10),
        unit: 'RPM',
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: false,
      });
    }

    // Check for Electrical Voltage & Current
    const voltMatch = text.match(/\b(?:Voltage|Volts|Rated Voltage)[\s:#]+([0-9.]+)\s*(V|VAC|kV)\b/i);
    if (voltMatch) {
      extractedCandidates.push({
        fieldName: 'ratedVoltage',
        displayName: 'Rated Voltage',
        candidateValue: parseFloat(voltMatch[1]),
        unit: voltMatch[2].toUpperCase(),
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: true,
      });
    }

    const currentMatch = text.match(/\b(?:Full Load Current|FLA|Amps|Current)[\s:#]+([0-9.]+)\s*(A|Amps?)\b/i);
    if (currentMatch) {
      extractedCandidates.push({
        fieldName: 'fullLoadCurrent',
        displayName: 'Full Load Current (FLA)',
        candidateValue: parseFloat(currentMatch[1]),
        unit: 'A',
        confidence: 'HIGH',
        extractionMethod,
        isSafetyCritical: true,
      });
    }

    // Check for LOTO / Isolation instructions
    const lotoMatch = text.match(/\b(?:LOTO|Lockout|Tagout|Electrical Isolation|Energy Control)[\s:#]+([A-Za-z0-9,.\- ]{10,120})/i);
    if (lotoMatch) {
      extractedCandidates.push({
        fieldName: 'lotoIsolationProcedure',
        displayName: 'LOTO Isolation Procedure',
        candidateValue: lotoMatch[1].trim(),
        confidence: 'MEDIUM',
        extractionMethod,
        isSafetyCritical: true,
      });
    }

    // Check for machine applicability warning:
    // If text mentions a similar or sibling asset tag (e.g., target is PUMP-204-B but text refers to PUMP-204-A)
    let applicabilityStatus: ClaimApplicability = 'UNCERTAIN';
    let applicabilityRationale: string | null = null;

    const similarTagMatch = text.match(/\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]+-[0-9]+)\b/i);
    if (similarTagMatch && similarTagMatch[1].toUpperCase() !== machine.assetTag.toUpperCase()) {
      applicabilityStatus = 'UNCERTAIN';
      applicabilityRationale = `Source text mentions asset '${similarTagMatch[1].toUpperCase()}' while target machine is '${machine.assetTag}'. Applicability must not be assumed without physical verification.`;
      potentialInconsistencies.push(applicabilityRationale);
    } else if (dto.evidenceType === 'NAMEPLATE_PHOTO') {
      applicabilityStatus = 'APPLICABLE';
      applicabilityRationale = 'Extracted directly from physical nameplate photograph of target machine.';
    }

    // Check for conflicting values against existing approved specs
    for (const cand of extractedCandidates) {
      const existingVal = machine.technicalSpecs ? machine.technicalSpecs[cand.fieldName] : undefined;
      if (existingVal !== undefined && existingVal !== null) {
        const strVal = String(cand.candidateValue).trim().toLowerCase();
        const strExisting = String(existingVal).trim().toLowerCase();
        if (strVal !== strExisting && !strExisting.includes(strVal)) {
          potentialInconsistencies.push(
            `Conflict detected on '${cand.displayName}': Candidate extracted value '${cand.candidateValue}' conflicts with registered value '${existingVal}'.`
          );
        }
      }
    }

    // If no candidate claims were extracted from empty or illegible content
    if (extractedCandidates.length === 0) {
      unresolvedQuestions.push(
        'Visual/document content lacked identifiable machine nameplate markers, specifications, or model stamps.'
      );
    }

    // 6. Create Unverified Candidate Claims in DataStore
    const createdClaims: MachineEvidenceClaim[] = [];
    for (const cand of extractedCandidates) {
      const claimDto: CreateEvidenceClaimDTO & { submittedByUserId: string; submittedByEmail?: string } = {
        machineId: machine.id,
        fieldName: cand.fieldName,
        displayName: cand.displayName,
        claimValue: cand.candidateValue,
        unit: cand.unit || null,
        sourceType: dto.evidenceType,
        sourceDocumentId: dto.documentId || null,
        sourceAttachmentKey: dto.attachmentKey || null,
        sourcePageNumber: dto.pageNumber || null,
        sourceRevision: sourceDocRevision,
        sourceDate: dto.sourceDate || null,
        extractionMethod: cand.extractionMethod,
        confidence: cand.confidence,
        applicabilityStatus,
        applicabilityRationale,
        isSafetyCritical: cand.isSafetyCritical,
        submittedByUserId: userId,
        submittedByEmail: userEmail,
      };

      const created = await this.dataStore.createEvidenceClaim(organizationId, claimDto);
      createdClaims.push(created);
    }

    return {
      evidenceType: dto.evidenceType,
      provenance: {
        filename: dto.filename || (dto.documentId ? sourceDocTitle : 'evidence_upload'),
        documentId: dto.documentId,
        attachmentKey: dto.attachmentKey,
        pageNumber: dto.pageNumber,
        extractedAt: new Date().toISOString(),
        extractionMethod,
      },
      extractedClaims: extractedCandidates,
      potentialInconsistencies,
      unresolvedQuestions,
      createdClaims,
    };
  }

  /**
   * Create a Missing Information Task with safety validation
   * (Enforces safe physical inspection and non-hazardous collection practices).
   */
  public async createSafeCollectionTask(
    organizationId: string,
    dto: {
      machineId: string;
      requestedFields: string[];
      instructions: string;
      assignedUserId?: string | null;
      assignedRole?: string | null;
      dueDate?: string | null;
      reasonForRequest?: string;
    },
    context: RecoveryActorContext
  ): Promise<MissingInformationTask> {
    const { userId, userEmail, userRole } = context;
    const machine = await this.dataStore.getMachineById(organizationId, dto.machineId);
    if (!machine) {
      throw new Error(`Machine '${dto.machineId}' not found in organization.`);
    }

    // Check for hazardous instructions (dismantling energized machinery, bypass, measuring moving parts)
    const isHazardousInstruction = /\b(energized|live wires|bypass guard|dismantle running|measure rotating|hot work without permit|un-isolated)\b/i.test(
      dto.instructions
    );

    let finalInstructions = dto.instructions;
    if (isHazardousInstruction) {
      finalInstructions = `[SAFETY WARNING: High-Risk Inspection Area]\n${dto.instructions}\nMANDATORY SAFETY PROTOCOL: Equipment must be completely de-energized, locked out (LOTO), and zero energy state verified by an authorized safety officer before inspection.`;
      
      await this.securityService.recordSecurityEvent({
        organizationId,
        actorUserId: userId,
        actorEmail: userEmail,
        actorRole: userRole,
        category: 'RESTRICTED_ACTION',
        action: 'HAZARDOUS_TASK_INSTRUCTION_INTERCEPTED',
        resourceCategory: 'TASK_INSTRUCTIONS',
        resourceId: machine.id,
        decision: 'FLAGGED',
        policyReasonCode: 'SAFETY_MANDATE_APPLIED',
        severity: 'MEDIUM',
        isBenignInquiry: true,
      });
    }

    const task = await this.dataStore.createMissingInfoTask(organizationId, {
      machineId: machine.id,
      assignedUserId: dto.assignedUserId || null,
      assignedRole: dto.assignedRole as any || null,
      requestedFields: dto.requestedFields,
      instructions: finalInstructions,
      dueDate: dto.dueDate || null,
    });

    return task;
  }

  /**
   * Submit engineering review decision on a claim
   */
  public async reviewClaim(
    organizationId: string,
    claimId: string,
    reviewDto: ReviewEvidenceClaimDTO,
    context: RecoveryActorContext
  ): Promise<MachineEvidenceClaim> {
    const { userId, userEmail, userRole } = context;

    return this.dataStore.reviewEvidenceClaim(organizationId, claimId, {
      ...reviewDto,
      reviewedByUserId: userId,
      reviewedByEmail: userEmail,
      actorRole: userRole,
    });
  }

  /**
   * Get machine knowledge recovery profile
   */
  public async getRecoveryProfile(
    organizationId: string,
    machineId: string
  ): Promise<MachineRecoveryProfile | null> {
    return this.dataStore.getMachineRecoveryProfile(organizationId, machineId);
  }

  /**
   * Get machine recovery overview metrics
   */
  public async getRecoverySummary(
    organizationId: string,
    plantId?: string
  ): Promise<MachineRecoverySummary> {
    return this.dataStore.getMachineRecoverySummary(organizationId, plantId);
  }

  /**
   * List claims with filtering
   */
  public async listClaims(
    organizationId: string,
    filters?: ClaimFilterOptions
  ): Promise<MachineEvidenceClaim[]> {
    return this.dataStore.listEvidenceClaims(organizationId, filters);
  }

  // ---------------------------------------------------------------------------
  // Bulk Machine Onboarding & CSV/XLSX Import (Prompt 04)
  // ---------------------------------------------------------------------------

  public parseCsvRows(csvContent: string): BulkMachineImportRow[] {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    const rows: BulkMachineImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols: string[] = [];
      let inQuote = false;
      let curr = '';
      for (const char of lines[i]) {
        if (char === '"' || char === "'") {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          cols.push(curr.trim());
          curr = '';
        } else {
          curr += char;
        }
      }
      cols.push(curr.trim());

      const obj: any = {};
      headers.forEach((h, idx) => {
        let val = cols[idx] !== undefined ? cols[idx].replace(/^["']|["']$/g, '').trim() : '';
        if (val === '' || val.toLowerCase() === 'null' || val.toLowerCase() === 'unknown') {
          obj[h] = null;
        } else {
          obj[h] = val;
        }
      });

      const assetTag = obj.assettag || obj.assetid || obj.tag;
      if (assetTag) {
        rows.push({
          assetTag,
          name: obj.name || obj.machinename || obj.assetname || 'Industrial Machine',
          plantId: obj.plantid || obj.plant,
          plantCode: obj.plantcode,
          machineType: obj.machinetype || obj.type || 'Industrial Machinery',
          industryCategory: obj.industrycategory || obj.industry || obj.category,
          area: obj.area || 'General Plant Area',
          building: obj.building || null,
          locationDescription: obj.locationdescription || obj.location || null,
          manufacturer: obj.manufacturer || obj.mfr || null,
          modelNumber: obj.modelnumber || obj.model || null,
          serialNumber: obj.serialnumber || obj.serial || null,
          manufacturingYear: obj.manufacturingyear || obj.year ? parseInt(obj.manufacturingyear || obj.year, 10) : undefined,
          criticality: obj.criticality || 'MEDIUM',
          dataClassification: obj.dataclassification || 'INTERNAL',
          generateQrLabel: obj.generateqrlabel === 'true' || obj.qr === 'true' || obj.generateqr === 'true',
        });
      }
    }
    return rows;
  }

  public async bulkImportMachines(
    organizationId: string,
    dto: BulkMachineImportDTO,
    context: RecoveryActorContext
  ): Promise<BulkMachineImportResult> {
    const rawRows = dto.rows && dto.rows.length > 0 ? dto.rows : dto.csvContent ? this.parseCsvRows(dto.csvContent) : [];
    const registeredMachines: Machine[] = [];
    const duplicates: Array<{ assetTag: string; reason: string }> = [];
    const errors: Array<{ row: number; reason: string }> = [];

    const orgPlants = await this.dataStore.listPlants(organizationId);
    const defaultPlantId = dto.plantId || orgPlants[0]?.id || 'default-plant';

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row.assetTag || !row.name) {
        errors.push({ row: i + 1, reason: 'Missing required assetTag or name' });
        continue;
      }

      const assetTag = row.assetTag.trim().toUpperCase();

      // Duplicate Check 1: Check existing asset tag
      const existingTag = await this.dataStore.getMachineByAssetTag(organizationId, assetTag);
      if (existingTag) {
        duplicates.push({ assetTag, reason: `Asset tag '${assetTag}' already registered in organization.` });
        continue;
      }

      // Duplicate Check 2: Check potential duplicate combinations of manufacturer, model, and serial number
      if (row.manufacturer && row.modelNumber && row.serialNumber) {
        const potentialDupes = await this.dataStore.detectPotentialDuplicates(organizationId, {
          manufacturer: row.manufacturer,
          modelNumber: row.modelNumber,
          serialNumber: row.serialNumber,
        });
        if (potentialDupes.length > 0) {
          duplicates.push({
            assetTag,
            reason: `Potential duplicate of existing machine '${potentialDupes[0].assetTag}' with matching ${row.manufacturer} ${row.modelNumber} S/N: ${row.serialNumber}`,
          });
          continue;
        }
      }

      // Resolve plant
      let plantId = row.plantId || defaultPlantId;
      if (row.plantCode) {
        const foundPlant = orgPlants.find((p) => p.code?.toUpperCase() === row.plantCode?.toUpperCase());
        if (foundPlant) plantId = foundPlant.id;
      }

      const hasMfr = row.manufacturer && row.manufacturer !== 'UNKNOWN';
      const hasModel = row.modelNumber && row.modelNumber !== 'UNKNOWN';
      const hasSerial = row.serialNumber && row.serialNumber !== 'UNKNOWN';

      const verificationState = hasMfr && hasModel && hasSerial ? 'VERIFIED' : hasMfr || hasModel ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED';
      const documentationReadiness = verificationState === 'VERIFIED' ? 'READY' : 'INCOMPLETE';

      const created = await this.dataStore.createMachine(organizationId, {
        plantId,
        assetTag,
        name: row.name.trim(),
        machineType: row.machineType || 'Industrial Machinery',
        area: row.area || 'General Plant Area',
        building: row.building || null,
        locationDescription: row.locationDescription || null,
        manufacturer: row.manufacturer || null,
        modelNumber: row.modelNumber || null,
        serialNumber: row.serialNumber || null,
        criticality: (row.criticality as any) || 'MEDIUM',
        dataClassification: (row.dataClassification as any) || 'INTERNAL',
        authorizedAccessScope: 'ORGANIZATION',
      });

      const updated = await this.dataStore.updateMachine(organizationId, created.id, {
        verificationState,
        documentationReadiness,
        ...(row.manufacturingYear ? { manufacturingYear: Number(row.manufacturingYear) } as any : {}),
        ...(row.industryCategory || dto.industryCategory ? { department: row.industryCategory || dto.industryCategory } : {}),
      });

      registeredMachines.push(updated || created);
    }

    await this.dataStore.recordAuditEvent({
      organizationId,
      actorUserId: context.userId,
      action: 'MACHINES_BULK_IMPORTED',
      resourceType: 'MACHINE',
      resourceId: organizationId,
      metadata: {
        totalProcessed: rawRows.length,
        registeredCount: registeredMachines.length,
        duplicatesCount: duplicates.length,
        errorsCount: errors.length,
      },
    });

    return {
      totalProcessed: rawRows.length,
      registeredCount: registeredMachines.length,
      duplicatesSkippedCount: duplicates.length,
      errorsCount: errors.length,
      registeredMachines,
      duplicates,
      errors,
    };
  }

  // ---------------------------------------------------------------------------
  // Expert Assignment & Task Workflow (Prompt 04)
  // ---------------------------------------------------------------------------

  public async bulkAssignTasks(
    organizationId: string,
    dto: {
      machineIds: string[];
      requestedFields: string[];
      instructions: string;
      assignedUserId?: string | null;
      assignedRole?: string | null;
      dueDate?: string | null;
    },
    context: RecoveryActorContext
  ): Promise<MissingInformationTask[]> {
    const tasks: MissingInformationTask[] = [];
    for (const machineId of dto.machineIds) {
      const task = await this.createSafeCollectionTask(
        organizationId,
        {
          machineId,
          requestedFields: dto.requestedFields,
          instructions: dto.instructions,
          assignedUserId: dto.assignedUserId,
          assignedRole: dto.assignedRole,
          dueDate: dto.dueDate,
        },
        context
      );
      tasks.push(task);
    }
    return tasks;
  }

  public async submitTaskEvidence(
    organizationId: string,
    taskId: string,
    dto: SubmitTaskEvidenceDTO,
    context: RecoveryActorContext
  ): Promise<MissingInformationTask> {
    const task = await this.dataStore.getMissingInfoTaskById(organizationId, taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found.`);
    }

    const now = new Date().toISOString();

    // Create candidate unverified claims for each submitted field
    if (dto.submittedValues) {
      for (const [fieldName, val] of Object.entries(dto.submittedValues)) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          await this.dataStore.createEvidenceClaim(organizationId, {
            machineId: task.machineId,
            fieldName,
            displayName: fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
            claimValue: val,
            sourceType: 'TECHNICIAN_OBSERVATION',
            sourceRevision: `Task submission ${taskId}`,
            extractionMethod: 'MANUAL_ENTRY',
            confidence: 'HIGH',
            applicabilityStatus: 'APPLICABLE',
            isSafetyCritical: /\b(pressure|voltage|temperature|safety|mawp|loto)\b/i.test(fieldName),
            submittedByUserId: context.userId,
            submittedByEmail: context.userEmail,
          });
        }
      }
    }

    // Update task to SUBMITTED (Technician submits evidence, remains unverified pending review)
    const updated = await this.dataStore.updateMissingInfoTask(organizationId, taskId, {
      status: 'SUBMITTED',
      submittedValues: dto.submittedValues || task.submittedValues,
      evidenceDescription: dto.evidenceDescription || null,
      evidenceAttachmentKeys: dto.evidenceAttachmentKeys || null,
      submittedByUserId: context.userId,
      submittedAt: now,
      updatedAt: now,
    });

    return updated || task;
  }

  public async reviewTaskSubmission(
    organizationId: string,
    taskId: string,
    dto: ReviewTaskSubmissionDTO,
    context: RecoveryActorContext
  ): Promise<MissingInformationTask> {
    const task = await this.dataStore.getMissingInfoTaskById(organizationId, taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found.`);
    }

    // Anti-self-approval rule: Technicians cannot approve their own task submissions
    if (task.submittedByUserId === context.userId) {
      const isSuperUser = context.userRole === 'ORGANIZATION_ADMIN' || context.userRole === 'ORGANIZATION_OWNER';
      if (!isSuperUser) {
        throw new Error('Anti-self-approval violation: Technicians cannot approve tasks they submitted themselves.');
      }
    }

    const now = new Date().toISOString();

    if (dto.decision === 'APPROVE') {
      if (!dto.reviewFeedback || dto.reviewFeedback.trim().length < 5) {
        throw new Error('Approval requires a valid engineering review rationale.');
      }

      // Approve associated evidence claims for this machine and fields
      const claims = await this.dataStore.listEvidenceClaims(organizationId, { machineId: task.machineId, status: 'AWAITING_REVIEW' });
      for (const c of claims) {
        if (task.requestedFields.includes(c.fieldName)) {
          await this.dataStore.reviewEvidenceClaim(organizationId, c.id, {
            decision: 'APPROVE',
            reviewNotes: `Approved via Task ${taskId}: ${dto.reviewFeedback}`,
            reviewRationale: dto.reviewFeedback,
            reviewerQualifications: dto.reviewerQualifications || 'Certified Reliability Engineer',
            reviewedByUserId: context.userId,
            reviewedByEmail: context.userEmail,
            actorRole: context.userRole,
          });
        }
      }

      const updated = await this.dataStore.updateMissingInfoTask(organizationId, taskId, {
        status: 'COMPLETED',
        reviewFeedback: dto.reviewFeedback,
        reviewedByUserId: context.userId,
        reviewedAt: now,
        updatedAt: now,
      });

      return updated || task;
    } else {
      const updated = await this.dataStore.updateMissingInfoTask(organizationId, taskId, {
        status: dto.decision === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'REJECTED',
        reviewFeedback: dto.reviewFeedback,
        reviewedByUserId: context.userId,
        reviewedAt: now,
        updatedAt: now,
      });

      return updated || task;
    }
  }

  // ---------------------------------------------------------------------------
  // Expert Knowledge Library Methods (Prompt 04)
  // ---------------------------------------------------------------------------

  public async createExpertKnowledge(
    organizationId: string,
    dto: CreateExpertKnowledgeDTO,
    context: RecoveryActorContext
  ): Promise<ExpertKnowledgeEntry> {
    return this.dataStore.createExpertKnowledgeEntry(organizationId, {
      ...dto,
      authorUserId: context.userId,
      authorEmail: context.userEmail,
      authorRole: context.userRole,
    });
  }

  public async reviewExpertKnowledge(
    organizationId: string,
    id: string,
    dto: ReviewExpertKnowledgeDTO,
    context: RecoveryActorContext
  ): Promise<ExpertKnowledgeEntry> {
    return this.dataStore.reviewExpertKnowledgeEntry(organizationId, id, {
      ...dto,
      reviewedByUserId: context.userId,
      reviewedByEmail: context.userEmail,
      actorRole: context.userRole,
    });
  }

  public async listExpertKnowledge(
    organizationId: string,
    filters?: ExpertKnowledgeFilterOptions
  ): Promise<ExpertKnowledgeEntry[]> {
    return this.dataStore.listExpertKnowledgeEntries(organizationId, filters);
  }

  public async getExpertKnowledgeById(
    organizationId: string,
    id: string
  ): Promise<ExpertKnowledgeEntry | null> {
    return this.dataStore.getExpertKnowledgeEntryById(organizationId, id);
  }

  public async revokeExpertKnowledge(
    organizationId: string,
    id: string,
    reason: string,
    context: RecoveryActorContext
  ): Promise<ExpertKnowledgeEntry | null> {
    return this.dataStore.revokeExpertKnowledgeEntry(organizationId, id, reason, context.userId);
  }
}

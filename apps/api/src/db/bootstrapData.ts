import crypto from 'node:crypto';
import type { IDataStore } from './dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import { logger } from '../utils/logger.js';

export async function bootstrapInitialData(
  dataStore: IDataStore,
  storageAdapter?: IStorageAdapter,
  embeddingAdapter?: IEmbeddingAdapter,
  vectorStore?: IVectorStoreAdapter,
  collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge'
): Promise<void> {
  try {
    // 1. Check if organization already exists
    let org = await dataStore.getOrganizationBySlug('apex-energy-tx');
    if (!org) {
      org = await dataStore.createOrganization({
        name: 'Apex Energy & Petrochemical Operations',
        slug: 'apex-energy-tx',
      });
      logger.info({ orgId: org.id }, 'Bootstrapped default organization');
    }

    // 2. Bootstrap Lead Engineer User
    let user = await dataStore.getUserByExternalAuthId('user-dev-eng-1');
    if (!user) {
      user = await dataStore.createUser({
        externalAuthId: 'user-dev-eng-1',
        email: 'engineer@forgex.industrial',
        fullName: 'Lead Plant Engineer',
      });
      logger.info({ userId: user.id }, 'Bootstrapped default engineer user');
    }

    // 3. Ensure Active Organization Membership
    let membership = await dataStore.getMembership(user.id, org.id);
    if (!membership) {
      membership = await dataStore.createMembership({
        organizationId: org.id,
        userId: user.id,
        role: 'ORGANIZATION_OWNER',
        status: 'ACTIVE',
      });
      logger.info({ membershipId: membership.id }, 'Bootstrapped admin membership');
    }

    // 4. Bootstrap Texas Plant
    let plant = await dataStore.getPlantById(org.id, 'PLANT-TX-04');
    if (!plant) {
      plant = await dataStore.createPlant(org.id, {
        code: 'PLANT-TX-04',
        name: 'Texas Petrochemical Refinery Train 4',
        location: 'Deer Park, Texas, USA',
        airGappedMode: false,
      });
      logger.info({ plantId: plant.id }, 'Bootstrapped PLANT-TX-04 facility');
    }

    // 5. Bootstrap Key Industrial Machines (Phase B Machine Registry)
    let pump = await dataStore.getMachineByAssetTag(org.id, 'PUMP-204-B');
    if (!pump) {
      pump = await dataStore.createMachine(org.id, {
        plantId: plant.id,
        assetTag: 'PUMP-204-B',
        name: 'Centrifugal Slurry Bottoms Pump',
        machineType: 'Centrifugal Slurry Pump',
        area: 'Primary Distillation Unit',
        manufacturer: 'Flowserve Corp',
        modelNumber: 'Mark 3 ANSI 3x2-10',
        serialNumber: 'FS-2024-9981-TX',
        operationalState: 'ADVISORY',
        criticality: 'HIGH',
        dataClassification: 'INTERNAL',
        verificationState: 'VERIFIED',
        documentationReadiness: 'READY',
        hasModel3d: true,
        model3dStorageKey: 'models/centrifugal_pump.glb',
        model3dFormat: 'glb',
        hasPidDiagram: true,
        pidStorageKey: 'schematics/pid_pump_204.svg',
        technicalSpecs: {
          impeller_diameter_mm: 250,
          motor_power_kw: 45,
          operating_flow_gpm: 120,
          suction_flange_ansi: 150,
        },
      });

      // Bootstrap Verified Component Mappings for PUMP-204-B
      await dataStore.createComponentMapping(org.id, {
        machineId: pump.id,
        componentId: 'impeller_assembly',
        componentName: 'Main Impeller Impurity Shield',
        pidTag: 'P-204-IMP',
        pidDrawingNumber: 'DWG-PID-TX04-204',
        pidCoordinates: { x: 120, y: 340, width: 80, height: 60 },
        manualPageNumber: 4,
        status: 'VERIFIED',
      });

      await dataStore.createComponentMapping(org.id, {
        machineId: pump.id,
        componentId: 'mechanical_seal_cartridge',
        componentName: 'Cartridge Mechanical Seal',
        pidTag: 'P-204-SEAL',
        pidDrawingNumber: 'DWG-PID-TX04-204',
        pidCoordinates: { x: 220, y: 340, width: 70, height: 50 },
        manualPageNumber: 7,
        status: 'VERIFIED',
      });
    }

    let comp = await dataStore.getMachineByAssetTag(org.id, 'COMP-101-A');
    if (!comp) {
      comp = await dataStore.createMachine(org.id, {
        plantId: plant.id,
        assetTag: 'COMP-101-A',
        name: 'Main Wet Gas Centrifugal Compressor',
        machineType: 'Wet Gas Centrifugal Compressor',
        area: 'Gas Recovery Plant',
        manufacturer: 'Elliott Group',
        modelNumber: '29M Multi-Stage Barrel',
        serialNumber: 'EG-29M-8812',
        operationalState: 'OPTIMAL',
        criticality: 'MISSION_CRITICAL',
        dataClassification: 'CONFIDENTIAL',
        verificationState: 'PARTIALLY_VERIFIED',
        documentationReadiness: 'INCOMPLETE',
        hasModel3d: false,
        hasPidDiagram: false,
      });

      // Bootstrap a pending missing information task for COMP-101-A
      await dataStore.createMissingInfoTask(org.id, {
        machineId: comp.id,
        assignedUserId: user.id,
        assignedRole: 'ENGINEER',
        requestedFields: ['lube_oil_viscosity_cst', 'maximum_discharge_bar', 'casing_flange_ansi'],
        instructions: 'Inspect compressor nameplate and confirm viscosity grade from oil skid telemetry.',
      });
    }

    let hex = await dataStore.getMachineByAssetTag(org.id, 'HEX-302-C');
    if (!hex) {
      hex = await dataStore.createMachine(org.id, {
        plantId: plant.id,
        assetTag: 'HEX-302-C',
        name: 'High Pressure Reboiler Heat Exchanger',
        machineType: 'Reboiler Heat Exchanger',
        area: 'Fractionation Train B',
        manufacturer: 'Alfa Laval',
        modelNumber: 'Compabloc CP75',
        serialNumber: 'AL-CP75-4410',
        operationalState: 'OPTIMAL',
        criticality: 'MEDIUM',
        dataClassification: 'INTERNAL',
        verificationState: 'VERIFIED',
        documentationReadiness: 'READY',
        hasModel3d: false,
        hasPidDiagram: true,
      });
    }

    // Bootstrap Employee Badge for Lead Engineer
    const existingBadge = await dataStore.getEmployeeBadgeByUserId(org.id, user.id);
    if (!existingBadge) {
      const salt = 'forgex_badge_salt_2026';
      const pinHash = crypto.createHash('sha256').update(`${salt}:1234`).digest('hex');
      await dataStore.issueEmployeeBadge(org.id, {
        userId: user.id,
        badgeCode: 'EMP-8801',
        pinHash,
      });
      logger.info('Bootstrapped Lead Engineer badge EMP-8801 (PIN: 1234)');
    }

    // Bootstrap Employee Profile for Lead Engineer
    let empProfile = await dataStore.getEmployeeProfileByUserId(org.id, user.id);
    if (!empProfile) {
      empProfile = await dataStore.createEmployeeProfile(org.id, {
        userId: user.id,
        employeeNumber: 'EMP-8801',
        fullName: user.fullName,
        email: user.email,
        role: 'ORGANIZATION_OWNER',
        department: 'Rotating Equipment Engineering',
        assignedPlantIds: [plant.id],
        accountStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        qualificationStatus: 'CERTIFIED',
        verifiedSkills: [
          'Centrifugal Slurry Pump Level 3',
          'API 610 Heavy Duty',
          'Vibration Analysis',
          'OSHA 1910.147 LOTO',
        ],
        specializedMachineIds: [pump.id],
      });
      logger.info('Bootstrapped employee profile for Lead Engineer EMP-8801');
    }

    // Bootstrap Machine Specialist Mapping for PUMP-204-B
    let specialistMapping = await dataStore.getMachineSpecialistMapping(org.id, pump.id);
    if (!specialistMapping) {
      specialistMapping = await dataStore.setMachineSpecialistMapping(org.id, {
        machineId: pump.id,
        plantId: plant.id,
        primarySpecialistUserId: user.id,
        primarySpecialistName: user.fullName,
        requiredCertifications: ['Centrifugal Slurry Pump Level 3', 'OSHA 1910.147 LOTO'],
        assignmentStatus: 'ASSIGNED',
        escalationTimeoutMinutes: 60,
        escalationRole: 'ORGANIZATION_ADMIN',
        assignedByUserId: user.id,
      });
      logger.info('Bootstrapped machine specialist mapping for PUMP-204-B');
    }

    // Bootstrap Official Engineering Assets for PUMP-204-B
    const existingModels = await dataStore.listEngineeringModels3D(org.id, { machineId: pump.id });
    if (existingModels.length === 0) {
      await dataStore.createEngineeringModel3D(org.id, {
        plantId: plant.id,
        machineId: pump.id,
        industryProfileCode: 'OIL_GAS_PETROCHEM',
        assetCategory: 'Centrifugal Pumps',
        title: 'Sulzer OH2 API 610 Heavy-Duty Centrifugal Pump 3D Assembly',
        manufacturer: 'Sulzer Pumps',
        modelNumber: 'OH2-150-400',
        sourceProvider: 'Sulzer Global Engineering Portal',
        fileFormat: 'GLB',
        fileSizeBytes: 4829100,
        fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        storageKey: 'models/centrifugal_pump.glb',
        convertedStorageKey: 'models/centrifugal_pump.glb',
        status: 'APPROVED',
        dataClassification: 'CONFIDENTIAL',
        uploadedByUserId: user.id,
        extractedComponentsCount: 18,
      });
      logger.info('Bootstrapped official 3D GLB model for PUMP-204-B');
    }

    const existingDrawings = await dataStore.listEngineeringDrawings(org.id, { machineId: pump.id });
    if (existingDrawings.length === 0) {
      await dataStore.createEngineeringDrawing(org.id, {
        plantId: plant.id,
        machineId: pump.id,
        drawingTitle: 'Crude Distillation Unit Booster Pump P-204-B P&ID Flow Schematic',
        uniqueDrawingNumber: 'DWG-2026-P204-PID-01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        revision: 'Rev 4.1',
        source: 'Fluor Daniels EPC Engineering',
        storageKey: 'schematics/pid_pump_204.svg',
        originalFileName: 'pid_pump_204.svg',
        fileFormat: 'SVG',
        fileSizeBytes: 3218900,
        fileHashSha256: 'f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2',
        status: 'APPROVED',
        dataClassification: 'INTERNAL',
        equipmentTags: ['P-204-IMP', 'P-204-SEAL', 'M-204-DRV', 'FT-204', 'PT-204'],
        uploadedByUserId: user.id,
      });
      logger.info('Bootstrapped engineering P&ID drawing DWG-2026-P204-PID-01 for PUMP-204-B');
    }

    const existingResources = await dataStore.listManufacturerResources(org.id, { machineId: pump.id });
    if (existingResources.length === 0) {
      await dataStore.createManufacturerResource(org.id, {
        machineId: pump.id,
        resourceType: 'IOM_DOCUMENT',
        title: 'Sulzer OH2 Installation, Operation and Maintenance (IOM) Manual',
        manufacturer: 'Sulzer Pumps',
        modelNumber: 'OH2-150-400',
        sourceType: 'FILE_UPLOAD',
        storageKey: 'resources/sulzer_oh2_iom_manual.pdf',
        versionRevision: 'Edition 2025.1',
        verificationStatus: 'VERIFIED',
        uploadedByUserId: user.id,
      });
      logger.info('Bootstrapped manufacturer resource for Sulzer OH2-150-400');
    }

    // 6. Bootstrap Authoritative Technical Document & Vectors
    const existingDoc = await dataStore.getDocumentByNumber(org.id, 'SOP-MECH-401');
    if (!existingDoc) {
      const doc = await dataStore.createDocument({
        organizationId: org.id,
        plantId: plant.id,
        documentNumber: 'SOP-MECH-401',
        title: 'Emergency Centrifugal Pump LOTO & Seal Overhaul Procedure',
        category: 'SOP',
        assetTags: ['PUMP-204-B'],
        createdByUserId: user.id,
      });

      const version = await dataStore.createDocumentVersion({
        documentId: doc.id,
        versionNumber: 1,
        revision: 'REV-C',
        filename: 'SOP-MECH-401_RevC.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 2457600,
        checksumSha256: '8f4b52c009d139e14a88f121d5a9d6e81234567890abcdef1234567890abcdef',
        storageKey: `${org.id}/documents/${doc.id}/v1/SOP-MECH-401_RevC.pdf`,
        status: 'INDEXED',
      });

      if (storageAdapter) {
        try {
          const samplePdfBuffer = Buffer.from(
            '%PDF-1.4\n%SOP-MECH-401 Emergency Centrifugal Pump LOTO & Seal Overhaul Procedure\n%%EOF',
            'utf-8'
          );
          await storageAdapter.putObject(version.storageKey, samplePdfBuffer, version.mimeType);
        } catch {
          // Ignore if already stored
        }
      }

      const page1Content = `# SOP-MECH-401: Emergency Centrifugal Pump LOTO Procedure
Revision: REV-C
Asset Tag: PUMP-204-B

## SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION
Before commencing mechanical overhaul on Centrifugal Pump PUMP-204-B, all suction and discharge isolation valves (V-101 and V-102) must be mechanically locked out and tagged according to OSHA Standard 1910.147.
Double block and bleed verification required prior to flange unbolting.`;

      const page2Content = `## SECTION 2: MECHANICAL SEAL OIL PRESSURE & TORQUE SPECIFICATIONS
Normal operational seal oil differential pressure must be maintained at 25.0 PSI across inner mechanical seal faces.
If differential pressure drops below 15.0 PSI, trip interlock triggers immediately to prevent seal cavitation and thermal seizure.
Gland bolt torque specification is 185 ft-lbs in a crisscross star pattern.
Lubrication oil viscosity requirement: ISO VG 46 synthetic turbine oil.`;

      await dataStore.saveDocumentPages([
        {
          documentVersionId: version.id,
          pageNumber: 1,
          rawText: page1Content,
          sectionHeadings: ['SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION'],
          extractionMethod: 'NATIVE_TEXT',
          hasTables: false,
        },
        {
          documentVersionId: version.id,
          pageNumber: 2,
          rawText: page2Content,
          sectionHeadings: ['SECTION 2: MECHANICAL SEAL OIL PRESSURE & TORQUE SPECIFICATIONS'],
          extractionMethod: 'NATIVE_TEXT',
          hasTables: true,
        },
      ]);

      const chunks = [
        {
          documentVersionId: version.id,
          pageNumber: 1,
          chunkIndex: 0,
          qdrantPointId: '00000000-0000-4000-8000-000000000001',
          content: 'SOP-MECH-401: All suction and discharge isolation valves (V-101 and V-102) must be mechanically locked out and tagged according to OSHA 1910.147. Double block and bleed verification required.',
          sectionHeading: 'SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION',
          isTable: false,
          isFigure: false,
          extractionMethod: 'NATIVE_TEXT' as const,
          tokenCount: 45,
        },
        {
          documentVersionId: version.id,
          pageNumber: 2,
          chunkIndex: 1,
          qdrantPointId: '00000000-0000-4000-8000-000000000002',
          content: 'Normal operational seal oil differential pressure for PUMP-204-B must be maintained at 25.0 PSI across inner mechanical seal faces. If differential pressure drops below 15.0 PSI, trip interlock triggers immediately. Gland bolt torque specification is 185 ft-lbs in star pattern.',
          sectionHeading: 'SECTION 2: MECHANICAL SEAL OIL PRESSURE & TORQUE SPECIFICATIONS',
          isTable: true,
          isFigure: false,
          extractionMethod: 'NATIVE_TEXT' as const,
          tokenCount: 65,
        },
      ];

      await dataStore.saveKnowledgeChunks(chunks);

      // Index vectors into Vector Store if available
      if (embeddingAdapter && vectorStore) {
        try {
          const embeddings = await embeddingAdapter.generateEmbeddings(chunks.map((c) => c.content));
          const vectorPoints: VectorPoint[] = chunks.map((chunk, idx) => ({
            id: chunk.qdrantPointId,
            vector: embeddings[idx],
            payload: {
              organizationId: org.id,
              plantId: plant.id,
              documentId: doc.id,
              documentVersionId: version.id,
              pageNumber: chunk.pageNumber,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              sectionHeading: chunk.sectionHeading,
              isTable: chunk.isTable,
              isFigure: chunk.isFigure,
              extractionMethod: chunk.extractionMethod,
            },
          }));

          await vectorStore.ensureCollection(collectionName, embeddingAdapter.getDimensions());
          await vectorStore.upsertPoints(collectionName, vectorPoints);
          logger.info({ count: vectorPoints.length }, 'Indexed initial document vectors into vector store');
        } catch (vErr: any) {
          logger.warn({ err: vErr?.message }, 'Vector store indexing skipped during bootstrap');
        }
      }

      await dataStore.updateDocumentVersionStatus(version.id, 'INDEXED', 2, chunks.length);
      logger.info({ documentNumber: doc.documentNumber }, 'Bootstrapped SOP-MECH-401 technical manual');
    }

    // 7. Bootstrap Sample Maintenance Case
    const existingCases = await dataStore.listMaintenanceCases(org.id, { plantId: plant.id });
    if (existingCases.length === 0) {
      await dataStore.createMaintenanceCase({
        organizationId: org.id,
        plantId: plant.id,
        assetId: pump.id,
        caseNumber: 'CASE-2026-0891',
        title: 'Slurry Pump PUMP-204-B Mechanical Seal Face Weepage & Vibration Advisory',
        severity: 'MEDIUM',
        status: 'INVESTIGATING',
        reportedByUserId: user.id,
        symptomDescription: 'Audible high-frequency squeal reported from outboard seal cartridge. Barrier fluid pressure fluctuating between 16 and 22 PSI. Radial vibration elevated to 4.8 mm/s RMS.',
        operatingConditions: {
          vibrationMmS: 4.8,
          tempCelsius: 78.4,
          barrierPressurePsi: 18.2,
          flowRateGpm: 840,
        },
        checklist: [
          {
            id: 'step-1',
            stepNumber: 1,
            title: 'Verify Barrier Fluid Reservoir & PT-204',
            instruction: 'Verify barrier fluid reservoir level and pressure transmitter PT-204 calibration.',
            requiresLoto: false,
            requiredPpe: ['Safety Glasses', 'Nitrile Gloves'],
            requiredTools: ['Multimeter', 'Pressure Gauge'],
            status: 'COMPLETED',
            technicianNotes: 'Verified: Reservoir level at 65%. Pressure transmitter calibrated within +/- 0.5 PSI tolerance.',
          },
          {
            id: 'step-2',
            stepNumber: 2,
            title: 'Inspect & Retorque Gland Follower Bolts',
            instruction: 'Inspect gland follower bolts and verify 185 ft-lbs torque in star pattern.',
            requiresLoto: false,
            requiredPpe: ['Safety Glasses', 'Mechanic Gloves'],
            requiredTools: ['Torque Wrench (0-250 ft-lbs)'],
            status: 'IN_PROGRESS',
            technicianNotes: 'Two bolts found below specification (160 ft-lbs). Retorque in progress.',
          },
          {
            id: 'step-3',
            stepNumber: 3,
            title: 'LOTO Isolation & Block/Bleed',
            instruction: 'Perform zero-energy lockout and isolate suction valve V-101 and discharge valve V-102.',
            requiresLoto: true,
            requiredPpe: ['Arc Flash Face Shield', 'Leather Gloves'],
            requiredTools: ['Padlocks', 'Hasps', 'Danger Tags'],
            status: 'PENDING',
          },
        ],
      });
      logger.info('Bootstrapped sample maintenance case CASE-2026-0891');
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed during bootstrapInitialData');
  }
}

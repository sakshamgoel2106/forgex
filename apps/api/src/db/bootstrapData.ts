import crypto from 'node:crypto';
import type { IDataStore } from './dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import { logger } from '../utils/logger.js';
import { buildIndustrialPumpGlb } from '../utils/glbBuilder.js';

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

    // 3b. Bootstrap Admin Persona
    let adminUser = await dataStore.getUserByExternalAuthId('user-dev-admin-1');
    if (!adminUser) {
      adminUser = await dataStore.createUser({
        externalAuthId: 'user-dev-admin-1',
        email: 'admin@forgex.industrial',
        fullName: 'Industrial Operations Admin',
      });
      logger.info({ userId: adminUser.id }, 'Bootstrapped admin user');
    }
    let adminMembership = await dataStore.getMembership(adminUser.id, org.id);
    if (!adminMembership) {
      adminMembership = await dataStore.createMembership({
        organizationId: org.id,
        userId: adminUser.id,
        role: 'ORGANIZATION_ADMIN',
        status: 'ACTIVE',
      });
      logger.info({ membershipId: adminMembership.id }, 'Bootstrapped admin membership');
    }

    // 3c. Bootstrap Technician Persona
    let techUser = await dataStore.getUserByExternalAuthId('user-dev-tech-1');
    if (!techUser) {
      techUser = await dataStore.createUser({
        externalAuthId: 'user-dev-tech-1',
        email: 'tech@forgex.industrial',
        fullName: 'Field Maintenance Specialist',
      });
      logger.info({ userId: techUser.id }, 'Bootstrapped technician user');
    }
    let techMembership = await dataStore.getMembership(techUser.id, org.id);
    if (!techMembership) {
      techMembership = await dataStore.createMembership({
        organizationId: org.id,
        userId: techUser.id,
        role: 'TECHNICIAN',
        status: 'ACTIVE',
      });
      logger.info({ membershipId: techMembership.id }, 'Bootstrapped technician membership');
    }

    // 3d. Bootstrap Worker Persona
    let workerUser = await dataStore.getUserByExternalAuthId('user-dev-worker-1');
    if (!workerUser) {
      workerUser = await dataStore.createUser({
        externalAuthId: 'user-dev-worker-1',
        email: 'worker@forgex.industrial',
        fullName: 'Shop Floor Operator',
      });
      logger.info({ userId: workerUser.id }, 'Bootstrapped worker user');
    }
    let workerMembership = await dataStore.getMembership(workerUser.id, org.id);
    if (!workerMembership) {
      workerMembership = await dataStore.createMembership({
        organizationId: org.id,
        userId: workerUser.id,
        role: 'WORKER',
        status: 'ACTIVE',
      });
      logger.info({ membershipId: workerMembership.id }, 'Bootstrapped worker membership');
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

    // Bootstrap Admin Badge & Profile
    const salt = 'forgex_badge_salt_2026';
    const existingAdminBadge = await dataStore.getEmployeeBadgeByUserId(org.id, adminUser.id);
    if (!existingAdminBadge) {
      const pinHash = crypto.createHash('sha256').update(`${salt}:9999`).digest('hex');
      await dataStore.issueEmployeeBadge(org.id, {
        userId: adminUser.id,
        badgeCode: 'BADGE-ADMIN-01',
        pinHash,
      });
      logger.info('Bootstrapped Admin badge BADGE-ADMIN-01 (PIN: 9999)');
    }

    // Bootstrap Technician Badge & Profile
    const existingTechBadge = await dataStore.getEmployeeBadgeByUserId(org.id, techUser.id);
    if (!existingTechBadge) {
      const pinHash = crypto.createHash('sha256').update(`${salt}:5678`).digest('hex');
      await dataStore.issueEmployeeBadge(org.id, {
        userId: techUser.id,
        badgeCode: 'BADGE-TECH-01',
        pinHash,
      });
      logger.info('Bootstrapped Technician badge BADGE-TECH-01 (PIN: 5678)');
    }

    let techProfile = await dataStore.getEmployeeProfileByUserId(org.id, techUser.id);
    if (!techProfile) {
      techProfile = await dataStore.createEmployeeProfile(org.id, {
        userId: techUser.id,
        employeeNumber: 'TECH-4402',
        fullName: techUser.fullName,
        email: techUser.email,
        role: 'TECHNICIAN',
        department: 'Field Maintenance & Vibration Reliability',
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
      logger.info('Bootstrapped employee profile for Technician TECH-4402');
    }

    // Bootstrap Worker Badge (BADGE-4091 | PIN 1024) & Profile
    const existingWorkerBadge = await dataStore.getEmployeeBadgeByUserId(org.id, workerUser.id);
    if (!existingWorkerBadge) {
      const pinHash = crypto.createHash('sha256').update(`${salt}:1024`).digest('hex');
      await dataStore.issueEmployeeBadge(org.id, {
        userId: workerUser.id,
        badgeCode: 'BADGE-4091',
        pinHash,
      });
      logger.info('Bootstrapped Worker badge BADGE-4091 (PIN: 1024)');
    }

    let workerProfile = await dataStore.getEmployeeProfileByUserId(org.id, workerUser.id);
    if (!workerProfile) {
      workerProfile = await dataStore.createEmployeeProfile(org.id, {
        userId: workerUser.id,
        employeeNumber: 'BADGE-4091',
        fullName: workerUser.fullName,
        email: workerUser.email,
        role: 'WORKER',
        department: 'Plant Production Operations',
        assignedPlantIds: [plant.id],
        accountStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        qualificationStatus: 'CERTIFIED',
        verifiedSkills: [
          'Lockout Tagout (LOTO)',
          'Emergency Valve Isolation',
          'SOP Digital Execution',
        ],
        specializedMachineIds: [],
      });
      logger.info('Bootstrapped employee profile for Worker BADGE-4091');
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
        extractedComponentsCount: 5,
      });
      logger.info('Bootstrapped official 3D GLB model for PUMP-204-B');

      if (storageAdapter) {
        try {
          const pumpGlb = buildIndustrialPumpGlb();
          await storageAdapter.putObject('models/centrifugal_pump.glb', pumpGlb, 'model/gltf-binary');
          logger.info('Bootstrapped genuine 3D GLB file models/centrifugal_pump.glb into storage');
        } catch (err) {
          logger.warn({ err }, 'Failed to seed 3D GLB model file into storage');
        }
      }
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

      if (storageAdapter) {
        try {
          const sampleSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520" width="100%" height="100%" style="background-color: #FFFFFF;">
  <defs>
    <marker id="pid-flow-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284C7" />
    </marker>
    <marker id="pid-seal-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#D97706" />
    </marker>
  </defs>

  <!-- Border & Engineering Drawing Title Block (ISA-5.1 Specification) -->
  <rect x="15" y="15" width="870" height="490" fill="none" stroke="#CBD5E1" stroke-width="2" />
  <rect x="580" y="390" width="305" height="115" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.5" />
  <text x="595" y="415" fill="#64748B" font-size="10" font-family="monospace" font-weight="bold">PLANT: DEER PARK REFINING COMPLEX</text>
  <text x="595" y="435" fill="#0F172A" font-size="12" font-family="monospace" font-weight="bold">SYSTEM: CDU HYDROTREATER TRAIN</text>
  <text x="595" y="455" fill="#2563EB" font-size="11" font-family="monospace" font-weight="bold">DWG: DWG-2026-P204-PID-01 (REV 4.1)</text>
  <text x="595" y="475" fill="#475569" font-size="10" font-family="monospace">EQUIPMENT: PUMP-204-B BOOSTER PUMP</text>
  <text x="595" y="492" fill="#64748B" font-size="9" font-family="monospace">EPC: FLUOR DANIELS • STANDARD: ISA-5.1</text>

  <!-- Primary Process Flow Lines (Crude Hydrocarbon) -->
  <line x1="40" y1="260" x2="350" y2="260" stroke="#0284C7" stroke-width="4" marker-end="url(#pid-flow-arrow)" />
  <text x="60" y="245" fill="#0369A1" font-size="11" font-family="monospace" font-weight="bold">12"-HC-204-A1A (CRUDE FEED SUCTION)</text>

  <!-- Suction Isolation Valve V-101 -->
  <g id="V-101" data-tag="V-101" class="pid-valve" style="cursor: pointer;">
    <polygon points="180,250 180,270 210,250 210,270" fill="#E0F2FE" stroke="#0284C7" stroke-width="2" />
    <line x1="195" y1="250" x2="195" y2="235" stroke="#0284C7" stroke-width="2" />
    <line x1="185" y1="235" x2="205" y2="235" stroke="#0284C7" stroke-width="2" />
    <text x="195" y="225" fill="#0369A1" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">V-101</text>
  </g>

  <!-- Centrifugal Pump Volute & Impeller (P-204-IMP) -->
  <g id="P-204-IMP" data-tag="P-204-IMP" class="pid-tag-group" style="cursor: pointer;">
    <circle cx="395" cy="260" r="45" fill="#F0F9FF" stroke="#0284C7" stroke-width="3" />
    <polygon points="365,290 395,215 425,290" fill="none" stroke="#0284C7" stroke-width="2.5" />
    <circle cx="395" cy="260" r="8" fill="#0284C7" />
    <text x="395" y="325" fill="#0F172A" font-size="13" font-family="monospace" font-weight="bold" text-anchor="middle">P-204-IMP</text>
    <text x="395" y="342" fill="#64748B" font-size="10" font-family="monospace" text-anchor="middle">OH2 Centrifugal Volute</text>
  </g>

  <!-- Drive Motor (M-204-DRV) -->
  <g id="M-204-DRV" data-tag="M-204-DRV" class="pid-tag-group" style="cursor: pointer;">
    <line x1="395" y1="260" x2="260" y2="260" stroke="#64748B" stroke-width="3" stroke-dasharray="4 2" />
    <rect x="235" y="320" width="70" height="70" rx="6" fill="#FAF5FF" stroke="#9333EA" stroke-width="2.5" />
    <line x1="270" y1="260" x2="270" y2="320" stroke="#64748B" stroke-width="3" />
    <text x="270" y="355" fill="#9333EA" font-size="18" font-family="monospace" font-weight="bold" text-anchor="middle">M</text>
    <text x="270" y="375" fill="#7E22CE" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">480V 75kW</text>
    <text x="270" y="410" fill="#0F172A" font-size="12" font-family="monospace" font-weight="bold" text-anchor="middle">M-204-DRV</text>
  </g>

  <!-- Mechanical Seal Cartridge & Plan 53B Barrier Fluid Loop (P-204-SEAL) -->
  <g id="P-204-SEAL" data-tag="P-204-SEAL" class="pid-tag-group" style="cursor: pointer;">
    <rect x="355" y="150" width="80" height="42" rx="5" fill="#FFFBEB" stroke="#D97706" stroke-width="2.5" />
    <line x1="375" y1="192" x2="375" y2="225" stroke="#D97706" stroke-width="2" stroke-dasharray="3 2" marker-end="url(#pid-seal-arrow)" />
    <line x1="415" y1="225" x2="415" y2="192" stroke="#D97706" stroke-width="2" stroke-dasharray="3 2" marker-end="url(#pid-seal-arrow)" />
    <text x="395" y="170" fill="#B45309" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">API PLAN 53B</text>
    <text x="395" y="184" fill="#B45309" font-size="9" font-family="monospace" text-anchor="middle">BARRIER LOOP</text>
    <text x="395" y="140" fill="#B45309" font-size="12" font-family="monospace" font-weight="bold" text-anchor="middle">P-204-SEAL</text>
  </g>

  <!-- Discharge Line (8" to Heater) -->
  <line x1="395" y1="215" x2="395" y2="120" stroke="#0284C7" stroke-width="4" />
  <line x1="395" y1="120" x2="850" y2="120" stroke="#0284C7" stroke-width="4" marker-end="url(#pid-flow-arrow)" />
  <text x="640" y="105" fill="#0369A1" font-size="11" font-family="monospace" font-weight="bold">8"-HC-204-A1B (TO HEATER PRE-HEAT)</text>

  <!-- Discharge Check Valve & Isolation Valve -->
  <g id="V-102" data-tag="V-102" class="pid-valve" style="cursor: pointer;">
    <polygon points="460,110 460,130 490,110 490,130" fill="#E0F2FE" stroke="#0284C7" stroke-width="2" />
    <line x1="475" y1="110" x2="475" y2="95" stroke="#0284C7" stroke-width="2" />
    <line x1="465" y1="95" x2="485" y2="95" stroke="#0284C7" stroke-width="2" />
    <text x="475" y="85" fill="#0369A1" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">V-102</text>
  </g>

  <!-- Instrumentation: Pressure Transmitter (PT-204) -->
  <g id="PT-204" data-tag="PT-204" class="pid-tag-group" style="cursor: pointer;">
    <circle cx="560" cy="180" r="24" fill="#F0F9FF" stroke="#0284C7" stroke-width="2" />
    <line x1="536" y1="180" x2="584" y2="180" stroke="#0284C7" stroke-width="1.5" />
    <line x1="560" y1="120" x2="560" y2="156" stroke="#0284C7" stroke-width="1.5" stroke-dasharray="3 2" />
    <text x="560" y="172" fill="#0284C7" font-size="11" font-family="monospace" font-weight="bold" text-anchor="middle">PT</text>
    <text x="560" y="196" fill="#0284C7" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">204</text>
    <text x="560" y="222" fill="#475569" font-size="11" font-family="monospace" font-weight="bold" text-anchor="middle">PT-204</text>
    <text x="560" y="236" fill="#64748B" font-size="9" font-family="monospace" text-anchor="middle">0 - 150 PSI</text>
  </g>

  <!-- Instrumentation: Flow Transmitter (FT-204) -->
  <g id="FT-204" data-tag="FT-204" class="pid-tag-group" style="cursor: pointer;">
    <circle cx="700" cy="180" r="24" fill="#F0F9FF" stroke="#0284C7" stroke-width="2" />
    <line x1="676" y1="180" x2="724" y2="180" stroke="#0284C7" stroke-width="1.5" />
    <line x1="700" y1="120" x2="700" y2="156" stroke="#0284C7" stroke-width="1.5" stroke-dasharray="3 2" />
    <text x="700" y="172" fill="#0284C7" font-size="11" font-family="monospace" font-weight="bold" text-anchor="middle">FT</text>
    <text x="700" y="196" fill="#0284C7" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">204</text>
    <text x="700" y="222" fill="#475569" font-size="11" font-family="monospace" font-weight="bold" text-anchor="middle">FT-204</text>
    <text x="700" y="236" fill="#64748B" font-size="9" font-family="monospace" text-anchor="middle">0 - 1200 GPM</text>
  </g>
</svg>`;
          await storageAdapter.putObject('schematics/pid_pump_204.svg', Buffer.from(sampleSvg, 'utf-8'), 'image/svg+xml');
          logger.info('Bootstrapped genuine P&ID SVG file schematics/pid_pump_204.svg into storage');
        } catch (sErr: any) {
          logger.warn({ err: sErr?.message }, 'Could not write initial P&ID SVG to storage');
        }
      }
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

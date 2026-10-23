import crypto from 'node:crypto';
import type { IDataStore } from './dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import { createDataStore } from './dataStoreFactory.js';
import { createStorageAdapter } from '../storage/storageFactory.js';
import { createEmbeddingAdapter } from '../embeddings/embeddingFactory.js';
import { createVectorStoreAdapter } from '../vector/vectorStoreFactory.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { buildIndustrialPumpGlb } from '../utils/glbBuilder.js';
import type {
  AssetOperationalState,
  MachineCriticality,
  DataClassification,
  PartReplaced,
} from '@forgex/shared-types';

export interface SeedResult {
  organizations: { id: string; name: string; slug: string }[];
  ownerAccount: { email: string; userId: string; orgMembershipRole: string };
  machinesCount: number;
  specialistsCount: number;
  documentsCount: number;
  workOrdersCount: number;
  maintenanceRecordsCount: number;
  ticketsCount: number;
  visualAssetsCount: number;
  audit: {
    inserted: number;
    reused: number;
    skipped: number;
    errors: string[];
  };
}

/**
 * Executes a deterministic, idempotent, multi-tenant demo seed.
 * Guarantees:
 * - Never resets existing tables or deletes non-demo accounts.
 * - Targets saksham1224151@jmit.ac.in without password changes.
 * - Seeds Company A ('ForgeX Demo Factory'), Company B ('ForgeX Isolation Test B'), Company C ('ForgeX Isolation Test C').
 */
export async function seedDemoFactory(
  dataStore: IDataStore,
  storageAdapter?: IStorageAdapter,
  embeddingAdapter?: IEmbeddingAdapter,
  vectorStore?: IVectorStoreAdapter,
  collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge'
): Promise<SeedResult> {
  const audit = {
    inserted: 0,
    reused: 0,
    skipped: 0,
    errors: [] as string[],
  };

  logger.info('🚀 Starting ForgeX AI Demo Factory & Multi-Tenant Seeding...');

  // ==========================================================================
  // 1. COMPANY A: ForgeX Demo Factory
  // ==========================================================================
  let orgA = await dataStore.getOrganizationBySlug('forgex-demo-factory');
  if (!orgA) {
    orgA = await dataStore.createOrganization({
      name: 'ForgeX Demo Factory',
      slug: 'forgex-demo-factory',
    });
    audit.inserted++;
    logger.info({ orgId: orgA.id }, 'Created Company A: ForgeX Demo Factory');
  } else {
    audit.reused++;
    logger.info({ orgId: orgA.id }, 'Reused Company A: ForgeX Demo Factory');
  }

  // Verify Project Owner account
  const targetEmail = 'saksham1224151@jmit.ac.in';
  let ownerUser = await dataStore.getUserByEmail(targetEmail);
  if (!ownerUser) {
    const errorMsg = `Project owner account ${targetEmail} not found in database. Account must exist prior to seeding.`;
    logger.error(errorMsg);
    audit.errors.push(errorMsg);
    throw new Error(errorMsg);
  }
  logger.info({ userId: ownerUser.id, email: ownerUser.email }, 'Identified existing project owner account');

  // Ensure Owner Membership in ForgeX Demo Factory
  let ownerMembership = await dataStore.getMembership(ownerUser.id, orgA.id);
  if (!ownerMembership) {
    ownerMembership = await dataStore.createMembership({
      organizationId: orgA.id,
      userId: ownerUser.id,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
    });
    audit.inserted++;
    logger.info({ membershipId: ownerMembership.id }, 'Granted ORGANIZATION_ADMIN membership to owner in Demo Factory');
  } else {
    audit.reused++;
    logger.info({ membershipId: ownerMembership.id }, 'Owner already has active membership in Demo Factory');
  }

  // Plant Alpha in Demo Factory
  let plantAlpha = await dataStore.getPlantById(orgA.id, 'PLANT-DEMO-01');
  if (!plantAlpha) {
    plantAlpha = await dataStore.createPlant(orgA.id, {
      code: 'PLANT-DEMO-01',
      name: 'ForgeX Smart Advanced Manufacturing Plant Alpha',
      location: 'Detroit Industrial Corridor, MI',
      airGappedMode: false,
    });
    audit.inserted++;
    logger.info({ plantId: plantAlpha.id }, 'Created Plant Alpha (PLANT-DEMO-01)');
  } else {
    audit.reused++;
  }

  // Owner Badge and Profile in Demo Factory
  const salt = 'forgex_demo_salt_2026';
  const existingOwnerBadge = await dataStore.getEmployeeBadgeByUserId(orgA.id, ownerUser.id);
  if (!existingOwnerBadge) {
    const pinHash = crypto.createHash('sha256').update(`${salt}:1224`).digest('hex');
    await dataStore.issueEmployeeBadge(orgA.id, {
      userId: ownerUser.id,
      badgeCode: 'BADGE-DEMO-OWNER',
      pinHash,
    });
    audit.inserted++;
  }

  let ownerProfile = await dataStore.getEmployeeProfileByUserId(orgA.id, ownerUser.id);
  if (!ownerProfile) {
    ownerProfile = await dataStore.createEmployeeProfile(orgA.id, {
      userId: ownerUser.id,
      employeeNumber: 'EMP-OWNER-01',
      fullName: ownerUser.fullName,
      email: ownerUser.email,
      role: 'ORGANIZATION_ADMIN',
      department: 'Executive Operations & Reliability Engineering',
      assignedPlantIds: [plantAlpha.id],
      accountStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      qualificationStatus: 'CERTIFIED',
      verifiedSkills: [
        'Advanced Multimodal AI Diagnostics',
        'ISO 55000 Asset Management',
        'Plant Engineering Leadership',
      ],
      specializedMachineIds: [],
    });
    audit.inserted++;
  }

  // ==========================================================================
  // 2. AUTHORIZED DEMO TEAM (Specialists & Worker)
  // ==========================================================================
  const demoUsersConfig = [
    {
      extId: 'user-demo-mech-tech',
      email: 'tech.mech@forgex-demo.factory',
      fullName: 'Marcus Vance',
      role: 'TECHNICIAN' as const,
      department: 'Mechanical Transmission & Tooling',
      badge: 'BADGE-MECH-01',
      pin: '1234',
      skills: ['5-Axis CNC Precision Spindle Overhaul', 'Conveyor Drive Laser Alignment', 'Packaging Kinematics'],
    },
    {
      extId: 'user-demo-elec-tech',
      email: 'tech.elec@forgex-demo.factory',
      fullName: 'Elena Rodriguez',
      role: 'TECHNICIAN' as const,
      department: 'Electrical Power & Drive Systems',
      badge: 'BADGE-ELEC-02',
      pin: '2345',
      skills: ['Medium Voltage Switchgear', 'VFD Inverter Tuning', 'Diesel Generator Synchronizers', 'Thermal Thermography'],
    },
    {
      extId: 'user-demo-hyd-tech',
      email: 'tech.hyd@forgex-demo.factory',
      fullName: 'Hans Becker',
      role: 'TECHNICIAN' as const,
      department: 'Hydraulics & High Pressure Systems',
      badge: 'BADGE-HYD-03',
      pin: '3456',
      skills: ['High Tonnage Hydraulic Proportional Valves', 'Injection Molding Clamp Hydraulics', 'Accumulator Nitrogen Pre-charge'],
    },
    {
      extId: 'user-demo-util-tech',
      email: 'tech.util@forgex-demo.factory',
      fullName: 'Devon Brooks',
      role: 'TECHNICIAN' as const,
      department: 'Pumping & Utilities Infrastructure',
      badge: 'BADGE-UTIL-04',
      pin: '4567',
      skills: ['API 610 Heavy Duty Centrifugal Pumps', 'Mechanical Seal Barrier Fluid Systems', 'Plate Heat Exchanger Fouling Analysis'],
    },
    {
      extId: 'user-demo-floor-worker',
      email: 'worker.floor@forgex-demo.factory',
      fullName: 'Samson Cole',
      role: 'WORKER' as const,
      department: 'Production Floor Shift A',
      badge: 'BADGE-FLR-05',
      pin: '5678',
      skills: ['OSHA LOTO 1910.147 Execution', 'Daily Equipment Pre-flight Inspection', 'Industrial Digital Workspaces'],
    },
  ];

  const instantiatedTeam: Record<string, any> = {};

  for (const tu of demoUsersConfig) {
    let u = await dataStore.getUserByExternalAuthId(tu.extId);
    if (!u) {
      u = await dataStore.createUser({
        externalAuthId: tu.extId,
        email: tu.email,
        fullName: tu.fullName,
      });
      audit.inserted++;
    } else {
      audit.reused++;
    }
    instantiatedTeam[tu.extId] = u;

    let m = await dataStore.getMembership(u.id, orgA.id);
    if (!m) {
      m = await dataStore.createMembership({
        organizationId: orgA.id,
        userId: u.id,
        role: tu.role,
        status: 'ACTIVE',
      });
      audit.inserted++;
    } else {
      audit.reused++;
    }

    const b = await dataStore.getEmployeeBadgeByUserId(orgA.id, u.id);
    if (!b) {
      const pinHash = crypto.createHash('sha256').update(`${salt}:${tu.pin}`).digest('hex');
      await dataStore.issueEmployeeBadge(orgA.id, {
        userId: u.id,
        badgeCode: tu.badge,
        pinHash,
      });
      audit.inserted++;
    }

    let p = await dataStore.getEmployeeProfileByUserId(orgA.id, u.id);
    if (!p) {
      await dataStore.createEmployeeProfile(orgA.id, {
        userId: u.id,
        employeeNumber: tu.badge,
        fullName: u.fullName,
        email: u.email,
        role: tu.role,
        department: tu.department,
        assignedPlantIds: [plantAlpha.id],
        accountStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        qualificationStatus: 'CERTIFIED',
        verifiedSkills: tu.skills,
        specializedMachineIds: [],
      });
      audit.inserted++;
    }
  }

  // ==========================================================================
  // 3. SEED AT LEAST 10 REALISTIC INDUSTRIAL MACHINES
  // ==========================================================================
  const machinesCatalog = [
    {
      assetTag: 'CNC-MILL-501',
      name: '5-Axis Vertical CNC Machining Center',
      machineType: 'CNC Milling Center',
      area: 'Precision Tooling Bay 1',
      manufacturer: 'DMG MORI',
      modelNumber: 'DMU 50 3rd Gen',
      serialNumber: 'DEMO-DMG-501-2026',
      operationalState: 'OPTIMAL',
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-mech-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { spindle_rpm: 20000, axes: 5, tool_capacity: 60, coolant_pressure_bar: 40 },
    },
    {
      assetTag: 'HYD-PRESS-301',
      name: 'High-Tonnage Hydraulic Forming Press',
      machineType: 'Hydraulic Stamping Press',
      area: 'Sheet Metal Pressing Cell',
      manufacturer: 'Schuler Group',
      modelNumber: 'HP-500T-PRO',
      serialNumber: 'DEMO-SCH-301-2026',
      operationalState: 'OPTIMAL',
      criticality: 'MISSION_CRITICAL',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-hyd-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { clamping_force_tons: 500, stroke_mm: 800, hydraulic_oil_capacity_l: 1200 },
    },
    {
      assetTag: 'COMP-AIR-102',
      name: 'Rotary Screw Industrial Air Compressor',
      machineType: 'Rotary Screw Compressor',
      area: 'Central Utilities Building',
      manufacturer: 'Atlas Copco',
      modelNumber: 'GA 90 VSD+',
      serialNumber: 'DEMO-AC-102-2026',
      operationalState: 'ADVISORY',
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-util-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { free_air_delivery_cfm: 620, max_working_pressure_bar: 13, motor_power_kw: 90 },
    },
    {
      assetTag: 'PUMP-CENT-205',
      name: 'Industrial Centrifugal Slurry Process Pump',
      machineType: 'Centrifugal Slurry Pump',
      area: 'Primary Wet Processing Loop',
      manufacturer: 'Flowserve Corp',
      modelNumber: 'Durco Mark 3 ANSI 4x3-13',
      serialNumber: 'DEMO-FS-205-2026',
      operationalState: 'ADVISORY',
      criticality: 'HIGH',
      dataClassification: 'CONFIDENTIAL',
      specialistKey: 'user-demo-util-tech',
      hasModel3d: true,
      model3dStorageKey: 'models/centrifugal_pump.glb',
      model3dFormat: 'glb',
      hasPidDiagram: true,
      pidStorageKey: 'schematics/pid_pump_204.svg',
      specs: { flow_rate_gpm: 850, impeller_diameter_mm: 320, head_ft: 180, motor_hp: 75 },
    },
    {
      assetTag: 'CONV-SYS-401',
      name: 'Automated Heavy-Duty Modular Conveyor',
      machineType: 'Modular Belt Conveyor System',
      area: 'Assembly Line Transfer Section',
      manufacturer: 'Dorner Mfg',
      modelNumber: '3200 Series Heavy-Duty',
      serialNumber: 'DEMO-DOR-401-2026',
      operationalState: 'OPTIMAL',
      criticality: 'MEDIUM',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-mech-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { belt_width_mm: 900, max_load_kg_m: 150, linear_speed_m_min: 35 },
    },
    {
      assetTag: 'INJ-MOLD-601',
      name: 'All-Electric Precision Injection Molding Machine',
      machineType: 'Injection Molding Machine',
      area: 'Polymer Molding Hall',
      manufacturer: 'Engel Global',
      modelNumber: 'e-mac 310/100',
      serialNumber: 'DEMO-ENG-601-2026',
      operationalState: 'OPTIMAL',
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-hyd-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { clamping_force_kn: 1000, shot_volume_cm3: 220, injection_pressure_bar: 2000 },
    },
    {
      assetTag: 'ELEC-MTR-701',
      name: 'Three-Phase Premium Efficiency Induction Motor',
      machineType: 'Induction Drive Motor',
      area: 'Main Grinding Drive Bay',
      manufacturer: 'Siemens AG',
      modelNumber: 'SIMOTICS GP 1LE1',
      serialNumber: 'DEMO-SIE-701-2026',
      operationalState: 'OPTIMAL',
      criticality: 'MEDIUM',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-elec-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { rated_power_kw: 110, synchronous_speed_rpm: 1800, voltage_v: 460, frame: '315M' },
    },
    {
      assetTag: 'HEX-PLATE-801',
      name: 'Gasketed Plate-and-Frame Thermal Heat Exchanger',
      machineType: 'Plate Heat Exchanger',
      area: 'Secondary Chilled Water Loop',
      manufacturer: 'Alfa Laval',
      modelNumber: 'BaseLine T8-BFG',
      serialNumber: 'DEMO-AL-801-2026',
      operationalState: 'OPTIMAL',
      criticality: 'MEDIUM',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-util-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { heat_transfer_area_m2: 45, max_design_pressure_bar: 16, plate_material: 'AISI 316' },
    },
    {
      assetTag: 'PKG-MACH-901',
      name: 'Automated Case Packing & Sealing Machine',
      machineType: 'Automated Case Packer',
      area: 'End-of-Line Packaging Facility',
      manufacturer: 'Syntegon Technology',
      modelNumber: 'ELEMATIC 3001',
      serialNumber: 'DEMO-SYN-901-2026',
      operationalState: 'OPTIMAL',
      criticality: 'MEDIUM',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-mech-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { cartons_per_min: 40, air_consumption_nl_cycle: 18, control_plc: 'Beckhoff TwinCAT' },
    },
    {
      assetTag: 'GEN-DIESEL-101',
      name: 'Standby Emergency Diesel Power Generator 500kVA',
      machineType: 'Diesel Generator Set',
      area: 'Emergency Power Substation',
      manufacturer: 'Cummins Power',
      modelNumber: 'C500 D5e',
      serialNumber: 'DEMO-CUM-101-2026',
      operationalState: 'OPTIMAL',
      criticality: 'MISSION_CRITICAL',
      dataClassification: 'INTERNAL',
      specialistKey: 'user-demo-elec-tech',
      hasModel3d: false,
      hasPidDiagram: false,
      specs: { prime_power_kva: 500, fuel_tank_capacity_l: 850, engine_model: 'QSX15-G8' },
    },
  ];

  const instantiatedMachines: Record<string, any> = {};

  for (const mData of machinesCatalog) {
    let m = await dataStore.getMachineByAssetTag(orgA.id, mData.assetTag);
    if (!m) {
      m = await dataStore.createMachine(orgA.id, {
        plantId: plantAlpha.id,
        assetTag: mData.assetTag,
        name: mData.name,
        machineType: mData.machineType,
        area: mData.area,
        manufacturer: mData.manufacturer,
        modelNumber: mData.modelNumber,
        serialNumber: mData.serialNumber,
        operationalState: mData.operationalState as AssetOperationalState,
        criticality: mData.criticality as MachineCriticality,
        dataClassification: mData.dataClassification as DataClassification,
        verificationState: 'VERIFIED',
        documentationReadiness: 'READY',
        hasModel3d: mData.hasModel3d,
        model3dStorageKey: mData.model3dStorageKey,
        model3dFormat: mData.model3dFormat as 'glb' | 'gltf' | null | undefined,
        hasPidDiagram: mData.hasPidDiagram,
        pidStorageKey: mData.pidStorageKey,
        technicalSpecs: mData.specs as unknown as Record<string, string | number | boolean>,
      });
      audit.inserted++;
      logger.info({ machineId: m.id, assetTag: m.assetTag }, 'Created machine');
    } else {
      audit.reused++;
    }
    instantiatedMachines[mData.assetTag] = m;

    // Specialist mapping
    const specialistUser = instantiatedTeam[mData.specialistKey];
    let mapping = await dataStore.getMachineSpecialistMapping(orgA.id, m.id);
    if (!mapping && specialistUser) {
      await dataStore.setMachineSpecialistMapping(orgA.id, {
        machineId: m.id,
        plantId: plantAlpha.id,
        primarySpecialistUserId: specialistUser.id,
        primarySpecialistName: specialistUser.fullName,
        requiredCertifications: [`${mData.name} Level 2 Specialist`],
        assignmentStatus: 'ASSIGNED',
        escalationTimeoutMinutes: 60,
        escalationRole: 'ORGANIZATION_ADMIN',
        assignedByUserId: ownerUser.id,
      });
      audit.inserted++;
    }
  }

  // ==========================================================================
  // 4. SEED 10 SYNTHETIC DEMO MANUALS & EMBEDDED KNOWLEDGE VECTORS
  // ==========================================================================
  const docManuals = [
    {
      docNum: 'SOP-DMG-501',
      title: 'DMG MORI DMU 50 Spindle Inspection & Axis Calibration SOP',
      assetTag: 'CNC-MILL-501',
      sections: [
        {
          heading: 'SECTION 1: SPINDLE RUNOUT & THERMAL STABILIZATION',
          content: 'SOP-DMG-501: Ensure machine has reached thermal equilibrium for 20 minutes before spindle runout measurements. Radial runout at the tool taper must remain under 0.003 mm (3 microns). Clean HSK-A63 taper using dedicated solvent wiper.',
        },
        {
          heading: 'SECTION 2: LUBRICATION & RECIRCULATION SYSTEM',
          content: 'Spindle lubrication air-oil pressure must be strictly maintained at 3.2 bar (+/- 0.2 bar). If pressure drops below 2.8 bar, axis interlock activates. Use approved Klueber Isoflex NBU 15 spindle grease.',
        },
      ],
    },
    {
      docNum: 'SOP-SCH-301',
      title: 'Schuler 500-Ton Hydraulic Press Pre-Flight & Proportional Valve SOP',
      assetTag: 'HYD-PRESS-301',
      sections: [
        {
          heading: 'SECTION 1: HIGH-PRESSURE RAM INTERLOCK CHECK',
          content: 'SOP-SCH-301: Prior to ram cycling, verify all safety light curtains and dual hydraulic block-and-bleed safety dump valves. Cylinder operating pressure must not exceed 315 bar. Inspect ram guide clearance.',
        },
        {
          heading: 'SECTION 2: PROPORTIONAL SERVO-VALVE CALIBRATION',
          content: 'Main ram proportional valve pilot pressure requires 45 bar. In case of jerky downward movement or pressure overshoot above 330 bar, immediately replace the pilot stage filter and perform LVDT null calibration.',
        },
      ],
    },
    {
      docNum: 'SOP-AC-102',
      title: 'Atlas Copco GA 90 VSD+ Compressor Maintenance & Temperature Limits',
      assetTag: 'COMP-AIR-102',
      sections: [
        {
          heading: 'SECTION 1: ELEMENT DISCHARGE TEMPERATURE LIMITS',
          content: 'SOP-AC-102: Normal compressor element discharge temperature (EDT) is 85°C to 95°C. Warning alarm triggers at 105°C; automatic emergency trip shutdown occurs at 115°C to prevent synthetic oil oxidation.',
        },
        {
          heading: 'SECTION 2: THERMOSTATIC BYPASS VALVE & OIL FILTER REPLACEMENT',
          content: 'If high temperature warning occurs repeatedly, inspect thermostatic bypass valve opening threshold (71°C element). Replace Roto-Inject fluid and oil separator cartridge every 4000 operational hours.',
        },
      ],
    },
    {
      docNum: 'SOP-FS-205',
      title: 'Flowserve Durco Mark 3 Centrifugal Slurry Pump Maintenance Manual',
      assetTag: 'PUMP-CENT-205',
      sections: [
        {
          heading: 'SECTION 1: MECHANICAL SEAL BARRIER FLUID SPECIFICATIONS',
          content: 'SOP-FS-205: For PUMP-CENT-205 equipped with API Plan 53B dual mechanical seal, barrier fluid reservoir pressure must remain 25.0 PSI above maximum stuffing box pressure. Gland follower bolts must be torqued to 185 ft-lbs in star pattern.',
        },
        {
          heading: 'SECTION 2: VIBRATION MONITORING & IMPELLER CLEARANCE',
          content: 'Overall radial vibration threshold for ISO Class II slurry pumps is 4.5 mm/s RMS. If vibration exceeds 6.0 mm/s RMS at 1X running speed, check for impeller vane slurry erosion or coupling misalignment.',
        },
      ],
    },
    {
      docNum: 'SOP-DOR-401',
      title: 'Dorner 3200 Series Modular Conveyor Belt Tracking & Drive Maintenance',
      assetTag: 'CONV-SYS-401',
      sections: [
        {
          heading: 'SECTION 1: BELT TRACKING & OPTICAL SENSOR ALIGNMENT',
          content: 'SOP-DOR-401: Inspect conveyor tracking guide shoes weekly. Belt tension should allow 15 mm mid-span deflection under 5 kg point load. Optical presence sensors must be positioned 50 mm above belt surface and cleaned of debris.',
        },
      ],
    },
    {
      docNum: 'SOP-ENG-601',
      title: 'Engel e-mac 310 Injection Molding Barrel Temperature Calibration',
      assetTag: 'INJ-MOLD-601',
      sections: [
        {
          heading: 'SECTION 1: BARREL HEATER ZONE RESISTANCE & PID TUNING',
          content: 'SOP-ENG-601: Verify 5-zone ceramic heater bands resistance with calibrated multimeter. Discrepancy greater than 10% indicates partial open element. Mold clamping force calibration requires calibrated piezoelectric load cells.',
        },
      ],
    },
    {
      docNum: 'SOP-SIE-701',
      title: 'Siemens SIMOTICS GP Induction Motor Vibration & Insulation Checklist',
      assetTag: 'ELEC-MTR-701',
      sections: [
        {
          heading: 'SECTION 1: WINDING RESISTANCE & MEGGER INSULATION TEST',
          content: 'SOP-SIE-701: Stator insulation resistance to ground must measure above 100 Megaohms at 1000V DC megger test. Phase resistance unbalance must not exceed 2.0%. Bearing regreasing interval: 2500 hours with Polyrex EM.',
        },
      ],
    },
    {
      docNum: 'SOP-AL-801',
      title: 'Alfa Laval BaseLine Plate Heat Exchanger Cleaning & Gasket Integrity',
      assetTag: 'HEX-PLATE-801',
      sections: [
        {
          heading: 'SECTION 1: DIFFERENTIAL PRESSURE MONITORING & CIP FLUSH',
          content: 'SOP-AL-801: Maximum clean differential pressure is 0.4 bar. If differential pressure across plate pack reaches 1.2 bar, initiate Clean-In-Place (CIP) circulation with 2% sulfamic acid at 60°C.',
        },
      ],
    },
    {
      docNum: 'SOP-SYN-901',
      title: 'Syntegon ELEMATIC Case Packer Vacuum Gripper & Kinematics Inspection',
      assetTag: 'PKG-MACH-901',
      sections: [
        {
          heading: 'SECTION 1: VACUUM PICK-AND-PLACE SUCTION THRESHOLDS',
          content: 'SOP-SYN-901: Vacuum generator output must achieve at least -0.8 bar at manifold sensor. Replace suction elastomer cups showing lip wear or cracking. Lubricate linear ball rails with ISO VG 68 slide oil weekly.',
        },
      ],
    },
    {
      docNum: 'SOP-CUM-101',
      title: 'Cummins C500 D5e Diesel Generator Monthly Exercise & ATS Checklist',
      assetTag: 'GEN-DIESEL-101',
      sections: [
        {
          heading: 'SECTION 1: STANDBY EXERCISE & BATTERY CHARGE TESTING',
          content: 'SOP-CUM-101: Generator must run under minimum 30% load for 45 minutes during monthly test. Cranking battery float voltage must be 27.2V DC. Coolant jacket heater must keep engine block between 40°C and 50°C.',
        },
      ],
    },
  ];

  for (const docSpec of docManuals) {
    let doc = await dataStore.getDocumentByNumber(orgA.id, docSpec.docNum);
    if (!doc) {
      doc = await dataStore.createDocument({
        organizationId: orgA.id,
        plantId: plantAlpha.id,
        documentNumber: docSpec.docNum,
        title: docSpec.title,
        category: 'SOP',
        assetTags: [docSpec.assetTag],
        createdByUserId: ownerUser.id,
      });
      audit.inserted++;

      if (!doc) continue;

      const version = await dataStore.createDocumentVersion({
        documentId: doc.id,
        versionNumber: 1,
        revision: 'REV-A',
        filename: `${docSpec.docNum}.pdf`,
        mimeType: 'application/pdf',
        fileSizeBytes: 1024000,
        checksumSha256: crypto.createHash('sha256').update(docSpec.title).digest('hex'),
        storageKey: `${orgA.id}/documents/${doc.id}/v1/${docSpec.docNum}.pdf`,
        status: 'INDEXED',
      });

      if (storageAdapter) {
        try {
          const samplePdf = Buffer.from(`%PDF-1.4\n%${docSpec.title}\n%%EOF`, 'utf-8');
          await storageAdapter.putObject(version.storageKey, samplePdf, version.mimeType);
        } catch {
          // ignore
        }
      }

      const pages = docSpec.sections.map((s, idx) => ({
        documentVersionId: version.id,
        pageNumber: idx + 1,
        rawText: `# ${docSpec.title}\n\n## ${s.heading}\n${s.content}`,
        sectionHeadings: [s.heading],
        extractionMethod: 'NATIVE_TEXT' as const,
        hasTables: false,
      }));
      await dataStore.saveDocumentPages(pages);

      const chunks = docSpec.sections.map((s, idx) => ({
        documentVersionId: version.id,
        pageNumber: idx + 1,
        chunkIndex: idx,
        qdrantPointId: crypto.randomUUID(),
        content: `${docSpec.docNum} - ${s.heading}: ${s.content}`,
        sectionHeading: s.heading,
        isTable: false,
        isFigure: false,
        extractionMethod: 'NATIVE_TEXT' as const,
        tokenCount: Math.round(s.content.length / 4),
      }));
      await dataStore.saveKnowledgeChunks(chunks);

      if (embeddingAdapter && vectorStore) {
        try {
          const embeddings = await embeddingAdapter.generateEmbeddings(chunks.map((c) => c.content));
          const vectorPoints: VectorPoint[] = chunks.map((chunk, idx) => ({
            id: chunk.qdrantPointId,
            vector: embeddings[idx],
            payload: {
              organizationId: orgA.id,
              plantId: plantAlpha.id,
              documentId: doc!.id,
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
        } catch (vErr: any) {
          logger.warn({ err: vErr?.message }, 'Vector store upsert skipped for doc');
        }
      }
      await dataStore.updateDocumentVersionStatus(version.id, 'INDEXED', pages.length, chunks.length);
      logger.info({ docNum: docSpec.docNum }, 'Seeded synthetic industrial documentation manual');
    } else {
      audit.reused++;
    }
  }

  // ==========================================================================
  // 5. SEED WORK ORDERS (maintenance_cases) & MAINTENANCE HISTORY (maintenance_records)
  // ==========================================================================
  const workOrderCases = [
    {
      caseNumber: 'CASE-DEMO-001',
      title: 'Centrifugal Slurry Pump Mechanical Seal Weepage & High Vibration',
      assetTag: 'PUMP-CENT-205',
      severity: 'HIGH' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-util-tech',
      symptom: 'Barrier fluid pressure dropped to 17.5 PSI with radial vibration rising to 5.4 mm/s RMS on outboard bearing housing.',
      obs: 'Silicon carbide inner seal faces showed micro-chipping from slurry particulate ingress.',
      actions: 'Replaced dual mechanical seal cartridge, flushed Plan 53B barrier fluid circuit, torqued gland bolts to 185 ft-lbs.',
      summary: 'Replaced cartridge mechanical seal and aligned coupling. Vibration reduced to 1.7 mm/s RMS.',
      parts: [
        { partNumber: 'SEAL-DS-401', description: 'Dual Cartridge Slurry Seal', quantity: 1 },
        { partNumber: 'OIL-SYN-ISO46', description: 'Synthetic Barrier Fluid 5L', quantity: 1 },
      ],
      faultCategory: 'MECHANICAL_SEAL_FAILURE',
      rootCause: 'Slurry solids contamination breached primary seal due to insufficient barrier loop differential pressure.',
    },
    {
      caseNumber: 'CASE-DEMO-002',
      title: 'Centrifugal Slurry Pump Recurring Outboard Bearing Vibration',
      assetTag: 'PUMP-CENT-205',
      severity: 'MEDIUM' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-util-tech',
      symptom: 'Second occurrence of high radial vibration (4.9 mm/s RMS) at 1X running frequency.',
      obs: 'Elastomeric jaw coupling insert exhibited angular wear and degradation.',
      actions: 'Replaced lovejoy flexible spider insert, performed precision laser alignment to 0.02 mm.',
      summary: 'Coupling elastomeric insert replaced and shaft laser aligned.',
      parts: [
        { partNumber: 'CPL-SPIDER-100', description: 'Polyurethane Coupling Spider', quantity: 1 },
      ],
      faultCategory: 'COUPLING_MISALIGNMENT',
      rootCause: 'Elastomeric insert embrittlement caused by ambient thermal cycles.',
    },
    {
      caseNumber: 'CASE-DEMO-003',
      title: 'Rotary Screw Compressor Element Discharge Overheat Warning',
      assetTag: 'COMP-AIR-102',
      severity: 'HIGH' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-util-tech',
      symptom: 'Compressor EDT reached 108°C causing advisory alarm.',
      obs: 'Thermostatic bypass valve stuck at 50% open; cooler radiator core partially clogged with dust.',
      actions: 'Ultrasonically cleaned oil cooler core and installed new 71°C thermostatic bypass valve kit.',
      summary: 'Oil cooler serviced and thermostatic valve replaced. Running EDT stabilized at 88°C.',
      parts: [
        { partNumber: 'VALVE-KIT-TC71', description: 'Thermostatic Bypass Core 71C', quantity: 1 },
      ],
      faultCategory: 'THERMAL_OVERHEATING',
      rootCause: 'Thermostatic valve mechanical sticking restricted full oil circulation through external cooler.',
    },
    {
      caseNumber: 'CASE-DEMO-004',
      title: 'High-Tonnage Hydraulic Press Downward Ram Pressure Fluctuations',
      assetTag: 'HYD-PRESS-301',
      severity: 'HIGH' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-hyd-tech',
      symptom: 'Ram downward forming stroke jerking intermittently with pressure spikes up to 325 bar.',
      obs: 'Proportional servo valve pilot stage contamination and LVDT coil impedance drift.',
      actions: 'Replaced proportional servo-valve, changed pilot filter, recalibrated digital LVDT null position.',
      summary: 'Replaced servo valve and recalibrated forming stroke ramp.',
      parts: [
        { partNumber: 'VALVE-SERVO-500', description: 'Proportional Directional Servo Valve', quantity: 1 },
      ],
      faultCategory: 'HYDRAULIC_SERVO_DRIFT',
      rootCause: 'Fine metallic silt lodged in pilot orifice causing spool hunting.',
    },
    {
      caseNumber: 'CASE-DEMO-005',
      title: '5-Axis CNC Spindle Thermal Drift & Tool Runout Inspection',
      assetTag: 'CNC-MILL-501',
      severity: 'MEDIUM' as const,
      status: 'IN_PROGRESS' as const,
      techKey: 'user-demo-mech-tech',
      symptom: 'Finish milling tolerances drifting by 12 microns over 4-hour production run.',
      obs: 'Spindle chiller circulation flow reduced by 30%.',
      actions: 'Flushing spindle cooling jacket and inspecting chiller pump pressure.',
      summary: 'Spindle chiller maintenance in progress.',
      parts: [],
      faultCategory: 'SPINDLE_THERMAL_DRIFT',
      rootCause: 'Partial scale accumulation in spindle water cooling jacket.',
    },
    {
      caseNumber: 'CASE-DEMO-006',
      title: 'Dorner Conveyor Belt Tracking Skew & Optical Jam Sensor Alarm',
      assetTag: 'CONV-SYS-401',
      severity: 'LOW' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-mech-tech',
      symptom: 'Conveyor belt wandering towards drive-side frame causing edge scuffing.',
      obs: 'Take-up tension bolts unevenly adjusted; optical sensor bracket bent.',
      actions: 'Re-tensioned modular belt using gauge, realigned optical photo-eye sensor.',
      summary: 'Belt tracking centered and sensor bracket realigned.',
      parts: [],
      faultCategory: 'BELT_TRACKING_ERROR',
      rootCause: 'Mechanical shock from pallet misplacement bumped optical sensor bracket.',
    },
    {
      caseNumber: 'CASE-DEMO-007',
      title: 'Injection Molding Machine Zone 3 Ceramic Heater Open Circuit',
      assetTag: 'INJ-MOLD-601',
      severity: 'MEDIUM' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-hyd-tech',
      symptom: 'Zone 3 temperature failed to rise above 140°C during warm-up.',
      obs: 'Resistance measured infinite (open circuit) across Zone 3 terminal lugs.',
      actions: 'Replaced ceramic knuckle heater band and high-temp terminal leads.',
      summary: 'Installed new heater band; Zone 3 stabilized at 230°C.',
      parts: [
        { partNumber: 'HEAT-BAND-Z3', description: 'Ceramic Band Heater 3500W', quantity: 1 },
      ],
      faultCategory: 'ELECTRICAL_HEATER_BURNOUT',
      rootCause: 'Thermal fatigue oxidation of internal nichrome element wire.',
    },
    {
      caseNumber: 'CASE-DEMO-008',
      title: 'Siemens 110kW Induction Motor Non-Drive Bearing Squeal',
      assetTag: 'ELEC-MTR-701',
      severity: 'MEDIUM' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-elec-tech',
      symptom: 'Acoustic ultrasound emission detected at non-drive end bearing housing.',
      obs: 'Grease purged from relief port was hardened and black; bearing cage dry.',
      actions: 'Flushed bearing chamber with synthetic solvent and purged with fresh Mobil Polyrex EM grease.',
      summary: 'Bearing re-lubricated; ultrasound decibel levels returned to baseline.',
      parts: [
        { partNumber: 'LUBE-POLYREX-EM', description: 'Synthetic Electric Motor Grease 400g', quantity: 1 },
      ],
      faultCategory: 'BEARING_LUBRICATION_STARVATION',
      rootCause: 'Missed scheduled 2500-hour greasing interval.',
    },
    {
      caseNumber: 'CASE-DEMO-009',
      title: 'Plate Heat Exchanger High Differential Pressure & Thermal Loss',
      assetTag: 'HEX-PLATE-801',
      severity: 'MEDIUM' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-util-tech',
      symptom: 'Differential pressure across cooling water inlet/outlet reached 1.35 bar.',
      obs: 'Inlet plate manifold encrusted with bio-fouling and mineral scale.',
      actions: 'Executed 3-hour CIP circulation with 2% sulfamic acid at 60°C and backflushed.',
      summary: 'CIP clean reduced differential pressure to 0.38 bar with design heat transfer restored.',
      parts: [],
      faultCategory: 'HEAT_EXCHANGER_FOULING',
      rootCause: 'Cooling tower biocide dosing system pump failure.',
    },
    {
      caseNumber: 'CASE-DEMO-010',
      title: 'Case Packer Vacuum Cup Suction Loss & Periodic Carton Dropping',
      assetTag: 'PKG-MACH-901',
      severity: 'LOW' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-mech-tech',
      symptom: 'Vacuum sensor showing only -0.45 bar during carton pickup cycle.',
      obs: 'Two bellows suction cups had perimeter tears; pneumatic ejector silencer clogged.',
      actions: 'Replaced 4 bellows cups and replaced porous bronze exhaust silencer.',
      summary: 'Vacuum restored to -0.82 bar; zero carton drops in test run.',
      parts: [
        { partNumber: 'VAC-CUP-BELLOWS', description: 'Polyurethane Bellows Cup 40mm', quantity: 4 },
      ],
      faultCategory: 'VACUUM_SYSTEM_LEAK',
      rootCause: 'Cardboard dust abrasive wear on suction cup sealing lips.',
    },
    {
      caseNumber: 'CASE-DEMO-011',
      title: 'Emergency Diesel Generator Monthly ATS Full-Load Transfer Test',
      assetTag: 'GEN-DIESEL-101',
      severity: 'LOW' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-elec-tech',
      symptom: 'Scheduled monthly regulatory compliance load test.',
      obs: 'Cranking battery float voltage at 26.8V (acceptable); coolant pre-heat at 44°C.',
      actions: 'Simulated utility loss, verified ATS transfer in 6.2 seconds, ran 45 minutes at 45% load.',
      summary: 'Emergency generator completed 100% compliance test without alarms.',
      parts: [],
      faultCategory: 'PREVENTIVE_MAINTENANCE',
      rootCause: 'Scheduled regulatory preventive maintenance.',
    },
    {
      caseNumber: 'CASE-DEMO-012',
      title: 'Centrifugal Slurry Pump Recurrent Seal Face Weepage (3rd Occurrence)',
      assetTag: 'PUMP-CENT-205',
      severity: 'HIGH' as const,
      status: 'RESOLVED' as const,
      techKey: 'user-demo-util-tech',
      symptom: 'Repeated barrier fluid drop and slight slurry weepage around outboard seal ring.',
      obs: 'Shaft sleeve has 0.15 mm groove wear beneath dynamic O-ring.',
      actions: 'Replaced ceramic coated shaft sleeve and installed heavy-duty tungsten carbide seal faces.',
      summary: 'Upgraded shaft sleeve and seal faces to tungsten carbide. Running stable with 0.0 ppm leakage.',
      parts: [
        { partNumber: 'SLEEVE-TC-401', description: 'Tungsten Carbide Coated Shaft Sleeve', quantity: 1 },
        { partNumber: 'SEAL-TC-FACES', description: 'Tungsten Carbide Mating Ring Pair', quantity: 1 },
      ],
      faultCategory: 'MECHANICAL_SEAL_FAILURE',
      rootCause: 'Shaft sleeve fretting beneath dynamic secondary elastomeric seal.',
    },
    {
      caseNumber: 'CASE-DEMO-013',
      title: 'Rotary Screw Compressor Moisture Separator Auto-Drain Clog',
      assetTag: 'COMP-AIR-102',
      severity: 'LOW' as const,
      status: 'REPORTED' as const,
      techKey: 'user-demo-util-tech',
      symptom: 'Condensate accumulation reported in external receiver vessel.',
      obs: '',
      actions: '',
      summary: '',
      parts: [],
      faultCategory: 'PNEUMATIC_DRAIN_FAILURE',
      rootCause: '',
    },
    {
      caseNumber: 'CASE-DEMO-014',
      title: '5-Axis CNC Axis Backlash Verification & Ball-screw Preload Audit',
      assetTag: 'CNC-MILL-501',
      severity: 'MEDIUM' as const,
      status: 'INVESTIGATING' as const,
      techKey: 'user-demo-mech-tech',
      symptom: 'Y-axis circularity error detected during Renishaw ballbar diagnostic.',
      obs: 'Ball-screw thrust bearing show slight axial play.',
      actions: 'Checking locknut torque and pre-load disc springs.',
      summary: '',
      parts: [],
      faultCategory: 'BALLSCREW_BACKLASH',
      rootCause: '',
    },
  ];

  const workerUser = instantiatedTeam['user-demo-floor-worker'];

  for (const wo of workOrderCases) {
    const machine = instantiatedMachines[wo.assetTag];
    if (!machine) continue;

    const assignedTech = instantiatedTeam[wo.techKey];

    // In clean execution mode, we do NOT seed active or dummy work orders into maintenance_cases.
    // If case was RESOLVED, create corresponding durable MaintenanceRecord for historical audits:
    if (wo.status === 'RESOLVED' && assignedTech) {
      const existingRecords = await dataStore.listMaintenanceRecords(orgA.id, { machineId: machine.id });
      const alreadyHasRecord = existingRecords.some((r: any) => r.problemStatement === wo.symptom);
      if (!alreadyHasRecord) {
        const mr = await dataStore.createMaintenanceRecord(orgA.id, {
          caseNumber: wo.caseNumber,
          plantId: plantAlpha.id,
          machineId: machine.id,
          machineAssetTag: machine.assetTag,
          reportingUserId: workerUser ? workerUser.id : ownerUser.id,
          reportingUserName: workerUser ? workerUser.fullName : ownerUser.fullName,
          assignedTechnicianUserId: assignedTech.id,
          assignedTechnicianName: assignedTech.fullName,
          resolvingTechnicianUserId: assignedTech.id,
          resolvingTechnicianName: assignedTech.fullName,
          faultCategory: wo.faultCategory,
          problemStatement: wo.symptom,
          observedSymptoms: [wo.symptom],
          rootCause: wo.rootCause,
          rootCauseStatus: 'CONFIRMED',
          repairActions: [wo.actions],
          partsReplaced: wo.parts.map((p) => ({
            partNumber: p.partNumber,
            partName: p.description,
            quantity: p.quantity,
          })) as PartReplaced[],
          verificationState: 'VERIFIED',
          verificationNotes: 'Post-repair run and diagnostic verification completed within manufacturer tolerance.',
          verifiedByUserId: ownerUser.id,
          requiresRestartApproval: false,
          approvalStatus: 'APPROVED',
          resolvedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 30)).toISOString(),
        });
        audit.inserted++;
        logger.info({ recordNumber: mr.recordNumber }, 'Created durable MaintenanceRecord');
      } else {
        audit.reused++;
      }
    }
  }

  // ==========================================================================
  // 6. TECHNICIAN QUEUE & SPECIALIST TICKETS (Clean state by default)
  // ==========================================================================
  // In clean execution mode, no dummy tickets are seeded into specialist_tickets.
  const ticketScenarios: any[] = [];

  // ==========================================================================
  // 7. SEED VISUAL INTELLIGENCE DEMO DATA (3D Model & P&ID Schematic)
  // ==========================================================================
  const pumpMachine = instantiatedMachines['PUMP-CENT-205'];
  if (pumpMachine) {
    const existingModels = await dataStore.listEngineeringModels3D(orgA.id, { machineId: pumpMachine.id });
    if (existingModels.length === 0) {
      await dataStore.createEngineeringModel3D(orgA.id, {
        plantId: plantAlpha.id,
        machineId: pumpMachine.id,
        industryProfileCode: 'INDUSTRIAL_MANUFACTURING',
        assetCategory: 'Centrifugal Process Pumps',
        title: 'Flowserve Durco Mark 3 Heavy-Duty Pump 3D Assembly',
        manufacturer: 'Flowserve Corp',
        modelNumber: 'Durco Mark 3 ANSI 4x3-13',
        sourceProvider: 'Flowserve CAD Engineering Vault',
        fileFormat: 'GLB',
        fileSizeBytes: 4829100,
        fileHashSha256: crypto.createHash('sha256').update('flowserve_pump_glb_demo').digest('hex'),
        storageKey: 'models/centrifugal_pump.glb',
        convertedStorageKey: 'models/centrifugal_pump.glb',
        status: 'APPROVED',
        dataClassification: 'CONFIDENTIAL',
        uploadedByUserId: ownerUser.id,
        extractedComponentsCount: 4,
      });
      audit.inserted++;

      if (storageAdapter) {
        try {
          const pumpGlb = buildIndustrialPumpGlb();
          await storageAdapter.putObject('models/centrifugal_pump.glb', pumpGlb, 'model/gltf-binary');
          logger.info('Saved genuine 3D GLB binary to storage models/centrifugal_pump.glb');
        } catch (err: any) {
          logger.warn({ err: err?.message }, 'Storage write notice for GLB');
        }
      }
    } else {
      audit.reused++;
    }

    const existingDrawings = await dataStore.listEngineeringDrawings(orgA.id, { machineId: pumpMachine.id });
    if (existingDrawings.length === 0) {
      await dataStore.createEngineeringDrawing(orgA.id, {
        plantId: plantAlpha.id,
        machineId: pumpMachine.id,
        drawingTitle: 'PUMP-CENT-205 Process & Instrumentation Flow Diagram (ISA-5.1)',
        uniqueDrawingNumber: 'DWG-DEMO-P205-PID-01',
        drawingType: 'PID',
        discipline: 'Piping & Instrumentation',
        revision: 'Rev 2.0',
        source: 'Advanced Plant Automation CAD Vault',
        storageKey: 'schematics/pid_pump_204.svg',
        originalFileName: 'pid_pump_204.svg',
        fileFormat: 'SVG',
        fileSizeBytes: 32000,
        fileHashSha256: crypto.createHash('sha256').update('pid_pump_svg_demo').digest('hex'),
        status: 'APPROVED',
        dataClassification: 'INTERNAL',
        equipmentTags: ['P-205-IMP', 'P-205-SEAL', 'M-205-DRV', 'PT-205'],
        uploadedByUserId: ownerUser.id,
      });
      audit.inserted++;

      if (storageAdapter) {
        try {
          const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="#f8fafc"/><text x="400" y="200" text-anchor="middle" font-family="monospace">P&ID SCHEMATIC: PUMP-CENT-205 (ISA-5.1 APPROVED)</text></svg>`;
          await storageAdapter.putObject('schematics/pid_pump_204.svg', Buffer.from(sampleSvg, 'utf-8'), 'image/svg+xml');
        } catch (err: any) {
          logger.warn({ err: err?.message }, 'Storage write notice for SVG');
        }
      }
    } else {
      audit.reused++;
    }
  }

  // ==========================================================================
  // 8. COMPANY B: ForgeX Isolation Test B
  // ==========================================================================
  let orgB = await dataStore.getOrganizationBySlug('forgex-isolation-b');
  if (!orgB) {
    orgB = await dataStore.createOrganization({
      name: 'ForgeX Isolation Test B',
      slug: 'forgex-isolation-b',
    });
    audit.inserted++;
    logger.info({ orgId: orgB.id }, 'Created Company B: ForgeX Isolation Test B');
  } else {
    audit.reused++;
  }

  let adminB = await dataStore.getUserByExternalAuthId('user-demo-admin-b');
  if (!adminB) {
    adminB = await dataStore.createUser({
      externalAuthId: 'user-demo-admin-b',
      email: 'admin@forgex-isolation-b.test',
      fullName: 'Brenda Isolation Admin',
    });
    audit.inserted++;
  }
  let memB = await dataStore.getMembership(adminB.id, orgB.id);
  if (!memB) {
    await dataStore.createMembership({
      organizationId: orgB.id,
      userId: adminB.id,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
    });
    audit.inserted++;
  }

  let plantB = await dataStore.getPlantById(orgB.id, 'PLANT-ISOL-B');
  if (!plantB) {
    plantB = await dataStore.createPlant(orgB.id, {
      code: 'PLANT-ISOL-B',
      name: 'Company B Isolated Gas Processing Facility',
      location: 'Salt Lake City, UT',
      airGappedMode: true,
    });
    audit.inserted++;
  }

  let machineB1 = await dataStore.getMachineByAssetTag(orgB.id, 'ISOL-B-TURBINE-01');
  if (!machineB1) {
    machineB1 = await dataStore.createMachine(orgB.id, {
      plantId: plantB.id,
      assetTag: 'ISOL-B-TURBINE-01',
      name: 'Company B High-Temperature Gas Turbine',
      machineType: 'Gas Turbine Generator',
      area: 'Power Block B',
      manufacturer: 'Mitsubishi Power',
      modelNumber: 'M501JAC',
      serialNumber: 'DEMO-ISOL-B-TURB-01',
      operationalState: 'OPTIMAL',
      criticality: 'MISSION_CRITICAL',
      dataClassification: 'CONFIDENTIAL',
    });
    audit.inserted++;
  }

  // Company B Secret Canary Document
  let docB = await dataStore.getDocumentByNumber(orgB.id, 'SOP-ISOL-B-SECRET-999');
  if (!docB) {
    docB = await dataStore.createDocument({
      organizationId: orgB.id,
      plantId: plantB.id,
      documentNumber: 'SOP-ISOL-B-SECRET-999',
      title: 'Company B Trade Secret Catalyst Regeneration SOP',
      category: 'SOP',
      assetTags: ['ISOL-B-TURBINE-01'],
      createdByUserId: adminB.id,
    });
    audit.inserted++;

    const versionB = await dataStore.createDocumentVersion({
      documentId: docB.id,
      versionNumber: 1,
      revision: 'REV-TOP-SECRET',
      filename: 'SOP-ISOL-B-SECRET-999.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 500000,
      checksumSha256: crypto.createHash('sha256').update('company_b_canary').digest('hex'),
      storageKey: `${orgB.id}/documents/${docB.id}/v1/SOP-ISOL-B-SECRET-999.pdf`,
      status: 'INDEXED',
    });

    const canaryContentB = 'CANARY_CONFIDENTIAL_CORP_B_PROPRIETARY_CATALYST_FORMULA: High-yield ruthenium-cobalt catalyst synthesis ratio is strictly 3.42 to 1.';
    const chunkB = {
      documentVersionId: versionB.id,
      pageNumber: 1,
      chunkIndex: 0,
      qdrantPointId: crypto.randomUUID(),
      content: canaryContentB,
      sectionHeading: 'SECTION 1: HIGH-YIELD CATALYST RATIO',
      isTable: false,
      isFigure: false,
      extractionMethod: 'NATIVE_TEXT' as const,
      tokenCount: 25,
    };
    await dataStore.saveKnowledgeChunks([chunkB]);

    if (embeddingAdapter && vectorStore) {
      try {
        const embeddings = await embeddingAdapter.generateEmbeddings([canaryContentB]);
        await vectorStore.ensureCollection(collectionName, embeddingAdapter.getDimensions());
        await vectorStore.upsertPoints(collectionName, [
          {
            id: chunkB.qdrantPointId,
            vector: embeddings[0],
            payload: {
              organizationId: orgB.id,
              plantId: plantB.id,
              documentId: docB.id,
              documentVersionId: versionB.id,
              pageNumber: 1,
              chunkIndex: 0,
              content: canaryContentB,
              sectionHeading: chunkB.sectionHeading,
              isTable: false,
              isFigure: false,
              extractionMethod: 'NATIVE_TEXT',
            },
          },
        ]);
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Vector indexing notice for Company B');
      }
    }
    await dataStore.updateDocumentVersionStatus(versionB.id, 'INDEXED', 1, 1);
  }

  // ==========================================================================
  // 9. COMPANY C: ForgeX Isolation Test C
  // ==========================================================================
  let orgC = await dataStore.getOrganizationBySlug('forgex-isolation-c');
  if (!orgC) {
    orgC = await dataStore.createOrganization({
      name: 'ForgeX Isolation Test C',
      slug: 'forgex-isolation-c',
    });
    audit.inserted++;
    logger.info({ orgId: orgC.id }, 'Created Company C: ForgeX Isolation Test C');
  } else {
    audit.reused++;
  }

  let adminC = await dataStore.getUserByExternalAuthId('user-demo-admin-c');
  if (!adminC) {
    adminC = await dataStore.createUser({
      externalAuthId: 'user-demo-admin-c',
      email: 'admin@forgex-isolation-c.test',
      fullName: 'Carlos Isolation Admin',
    });
    audit.inserted++;
  }
  let memC = await dataStore.getMembership(adminC.id, orgC.id);
  if (!memC) {
    await dataStore.createMembership({
      organizationId: orgC.id,
      userId: adminC.id,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
    });
    audit.inserted++;
  }

  let plantC = await dataStore.getPlantById(orgC.id, 'PLANT-ISOL-C');
  if (!plantC) {
    plantC = await dataStore.createPlant(orgC.id, {
      code: 'PLANT-ISOL-C',
      name: 'Company C Isolated Cryogenic Liquefaction Plant',
      location: 'Anchorage, AK',
      airGappedMode: true,
    });
    audit.inserted++;
  }

  let machineC1 = await dataStore.getMachineByAssetTag(orgC.id, 'ISOL-C-CHILLER-01');
  if (!machineC1) {
    machineC1 = await dataStore.createMachine(orgC.id, {
      plantId: plantC.id,
      assetTag: 'ISOL-C-CHILLER-01',
      name: 'Company C Cryogenic Helium Refrigeration Loop',
      machineType: 'Cryogenic Chiller',
      area: 'Cold Box 3',
      manufacturer: 'Linde Engineering',
      modelNumber: 'TCF50',
      serialNumber: 'DEMO-ISOL-C-CHILL-01',
      operationalState: 'OPTIMAL',
      criticality: 'HIGH',
      dataClassification: 'CONFIDENTIAL',
    });
    audit.inserted++;
  }

  // Company C Secret Canary Document
  let docC = await dataStore.getDocumentByNumber(orgC.id, 'SOP-ISOL-C-SECRET-888');
  if (!docC) {
    docC = await dataStore.createDocument({
      organizationId: orgC.id,
      plantId: plantC.id,
      documentNumber: 'SOP-ISOL-C-SECRET-888',
      title: 'Company C Proprietary Sub-Cooling Nitrogen Specifications',
      category: 'SOP',
      assetTags: ['ISOL-C-CHILLER-01'],
      createdByUserId: adminC.id,
    });
    audit.inserted++;

    const versionC = await dataStore.createDocumentVersion({
      documentId: docC.id,
      versionNumber: 1,
      revision: 'REV-RESTRICTED',
      filename: 'SOP-ISOL-C-SECRET-888.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 420000,
      checksumSha256: crypto.createHash('sha256').update('company_c_canary').digest('hex'),
      storageKey: `${orgC.id}/documents/${docC.id}/v1/SOP-ISOL-C-SECRET-888.pdf`,
      status: 'INDEXED',
    });

    const canaryContentC = 'CANARY_CONFIDENTIAL_CORP_C_NUCLEAR_COOLANT_SPECIFICATION: Liquid helium secondary loop pressure must never exceed 4.12 bar at 4.2 Kelvin.';
    const chunkC = {
      documentVersionId: versionC.id,
      pageNumber: 1,
      chunkIndex: 0,
      qdrantPointId: crypto.randomUUID(),
      content: canaryContentC,
      sectionHeading: 'SECTION 1: SUB-COOLING PRESSURE THRESHOLDS',
      isTable: false,
      isFigure: false,
      extractionMethod: 'NATIVE_TEXT' as const,
      tokenCount: 28,
    };
    await dataStore.saveKnowledgeChunks([chunkC]);

    if (embeddingAdapter && vectorStore) {
      try {
        const embeddings = await embeddingAdapter.generateEmbeddings([canaryContentC]);
        await vectorStore.ensureCollection(collectionName, embeddingAdapter.getDimensions());
        await vectorStore.upsertPoints(collectionName, [
          {
            id: chunkC.qdrantPointId,
            vector: embeddings[0],
            payload: {
              organizationId: orgC.id,
              plantId: plantC.id,
              documentId: docC.id,
              documentVersionId: versionC.id,
              pageNumber: 1,
              chunkIndex: 0,
              content: canaryContentC,
              sectionHeading: chunkC.sectionHeading,
              isTable: false,
              isFigure: false,
              extractionMethod: 'NATIVE_TEXT',
            },
          },
        ]);
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Vector indexing notice for Company C');
      }
    }
    await dataStore.updateDocumentVersionStatus(versionC.id, 'INDEXED', 1, 1);
  }

  logger.info(
    {
      inserted: audit.inserted,
      reused: audit.reused,
      skipped: audit.skipped,
      errors: audit.errors.length,
    },
    '✅ ForgeX AI Multi-Tenant Demo Seeding Complete!'
  );

  return {
    organizations: [
      { id: orgA.id, name: orgA.name, slug: orgA.slug },
      { id: orgB.id, name: orgB.name, slug: orgB.slug },
      { id: orgC.id, name: orgC.name, slug: orgC.slug },
    ],
    ownerAccount: {
      email: ownerUser.email,
      userId: ownerUser.id,
      orgMembershipRole: 'ORGANIZATION_ADMIN',
    },
    machinesCount: machinesCatalog.length,
    specialistsCount: demoUsersConfig.length,
    documentsCount: docManuals.length + 2,
    workOrdersCount: workOrderCases.length,
    maintenanceRecordsCount: workOrderCases.filter((w) => w.status === 'RESOLVED').length,
    ticketsCount: ticketScenarios.length,
    visualAssetsCount: 2,
    audit,
  };
}

// CLI Runner execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seedDemoFactory.ts')) {
  (async () => {
    try {
      const { dataStore, pool } = await createDataStore(config);
      const storageAdapter = createStorageAdapter();
      const embeddingAdapter = createEmbeddingAdapter();
      const vectorStore = createVectorStoreAdapter();

      const result = await seedDemoFactory(
        dataStore,
        storageAdapter,
        embeddingAdapter,
        vectorStore
      );

      console.log('\n================================================================');
      console.log('       FORGEX AI DEMO FACTORY SEEDING COMPLETED SUCCESSFULLY     ');
      console.log('================================================================');
      console.log(`Target Owner Account : ${result.ownerAccount.email} (ID: ${result.ownerAccount.userId})`);
      console.log(`Company A            : ${result.organizations[0].name} (${result.organizations[0].id})`);
      console.log(`Company B (Isolated) : ${result.organizations[1].name} (${result.organizations[1].id})`);
      console.log(`Company C (Isolated) : ${result.organizations[2].name} (${result.organizations[2].id})`);
      console.log(`Demo Machines Seeded : ${result.machinesCount}`);
      console.log(`Demo Work Orders     : ${result.workOrdersCount}`);
      console.log(`Maintenance Records  : ${result.maintenanceRecordsCount}`);
      console.log(`Specialist Tickets   : ${result.ticketsCount}`);
      console.log(`Documents & SOPs     : ${result.documentsCount}`);
      console.log(`Audit Operations     : Inserted ${result.audit.inserted}, Reused ${result.audit.reused}`);
      console.log('================================================================\n');

      if (pool) {
        await pool.end();
      }
      process.exit(0);
    } catch (err: any) {
      console.error('Fatal error during seed execution:', err);
      process.exit(1);
    }
  })();
}

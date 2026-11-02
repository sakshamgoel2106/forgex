import type { OrgRole } from '@forgex/shared-types';
import type { IDataStore } from './dataStore.interface.js';
import { hashPassword } from '../utils/password.js';

export const HACKATHON_DEMO_CREDENTIALS = [
  { email: 'owner@forgex-demo.test', password: 'DemoOwner@123', role: 'ORGANIZATION_OWNER' },
  { email: 'admin@forgex-demo.test', password: 'DemoAdmin@123', role: 'ORGANIZATION_ADMIN' },
  { email: 'manager@forgex-demo.test', password: 'DemoManager@123', role: 'PLANT_MANAGER' },
  { email: 'engineer@forgex-demo.test', password: 'DemoEngineer@123', role: 'ENGINEER' },
  { email: 'technician@forgex-demo.test', password: 'DemoTech@123', role: 'TECHNICIAN' },
  { email: 'operator@forgex-demo.test', password: 'DemoOperator@123', role: 'WORKER' },
] as const satisfies readonly { email: string; password: string; role: OrgRole }[];

const MACHINE_DEMOS = [
  {
    assetTag: 'DEMO-AIR-001',
    name: 'Plant Utility Air Compressor',
    machineType: 'Air compressor',
    area: 'Utilities',
    modelNumber: 'DEMO-COMP-90',
    operationalState: 'OPTIMAL',
    criticality: 'HIGH',
    technicalSpecs: { ratedPowerKw: 90, nominalPressureBar: 8, demoData: true },
  },
  {
    assetTag: 'DEMO-CONV-001',
    name: 'Main Production Belt Conveyor',
    machineType: 'Belt conveyor',
    area: 'Production Line A',
    modelNumber: 'DEMO-CONV-12',
    operationalState: 'OPTIMAL',
    criticality: 'HIGH',
    technicalSpecs: { beltWidthMm: 800, lengthM: 24, demoData: true },
  },
  {
    assetTag: 'DEMO-ELEV-001',
    name: 'Raw Material Bucket Elevator',
    machineType: 'Bucket elevator',
    area: 'Material Handling',
    modelNumber: 'DEMO-ELEV-04',
    operationalState: 'ADVISORY',
    criticality: 'MEDIUM',
    technicalSpecs: { liftHeightM: 18, ratedCapacityTonnesPerHour: 45, demoData: true },
  },
  {
    assetTag: 'DEMO-PUMP-001',
    name: 'Cooling Water Circulation Pump',
    machineType: 'Centrifugal water pump',
    area: 'Water Systems',
    modelNumber: 'DEMO-PUMP-65',
    operationalState: 'OPTIMAL',
    criticality: 'HIGH',
    technicalSpecs: { ratedFlowM3h: 65, motorPowerKw: 22, demoData: true },
  },
  {
    assetTag: 'DEMO-CT-001',
    name: 'Process Cooling Tower Cell 1',
    machineType: 'Cooling tower',
    area: 'Cooling Yard',
    modelNumber: 'DEMO-CT-250',
    operationalState: 'WARNING_MAINTENANCE_REQUIRED',
    criticality: 'HIGH',
    technicalSpecs: { ratedCapacityKw: 250, fanCount: 2, demoData: true },
  },
  {
    assetTag: 'DEMO-CRUSH-001',
    name: 'Primary Aggregate Crusher',
    machineType: 'Crusher',
    area: 'Raw Material Processing',
    modelNumber: 'DEMO-CR-40',
    operationalState: 'OPTIMAL',
    criticality: 'MISSION_CRITICAL',
    technicalSpecs: { ratedCapacityTonnesPerHour: 40, drivePowerKw: 55, demoData: true },
  },
  {
    assetTag: 'DEMO-HPU-001',
    name: 'Press Line Hydraulic Power Unit',
    machineType: 'Hydraulic Power Unit',
    area: 'Press Line',
    modelNumber: 'DEMO-HPU-30',
    operationalState: 'ADVISORY',
    criticality: 'HIGH',
    technicalSpecs: { reservoirCapacityL: 300, motorPowerKw: 30, demoData: true },
  },
  {
    assetTag: 'DEMO-HEX-001',
    name: 'Industrial Process Heat Exchanger',
    machineType: 'Industrial Heat Exchanger',
    area: 'Thermal Systems',
    modelNumber: 'DEMO-HEX-120',
    operationalState: 'OPTIMAL',
    criticality: 'MEDIUM',
    technicalSpecs: { heatTransferAreaM2: 120, designPressureBar: 16, demoData: true },
  },
  {
    assetTag: 'DEMO-MILL-001',
    name: 'Reversible Production Rolling Mill',
    machineType: 'Rolling mill',
    area: 'Rolling Line',
    modelNumber: 'DEMO-RM-18',
    operationalState: 'OPTIMAL',
    criticality: 'MISSION_CRITICAL',
    technicalSpecs: { rollWidthMm: 1200, drivePowerKw: 450, demoData: true },
  },
] as const;

export async function seedHackathonDemo(dataStore: IDataStore): Promise<{
  organizationId: string;
  organizationName: string;
  plantId: string;
  machineCount: number;
  accounts: typeof HACKATHON_DEMO_CREDENTIALS;
}> {
  const slug = 'forgex-hackathon-demo';
  let organization = await dataStore.getOrganizationBySlug(slug);
  if (!organization) {
    organization = await dataStore.createOrganization({
      name: 'ForgeX Hackathon Demo',
      slug,
    });
  }

  let plant = await dataStore.getPlantById(organization.id, 'PLANT-DEMO-01');
  if (!plant) {
    plant = await dataStore.createPlant(organization.id, {
      code: 'PLANT-DEMO-01',
      name: 'Hackathon Demonstration Plant',
      location: 'Synthetic demo location',
      airGappedMode: false,
    });
  }

  for (const [index, account] of HACKATHON_DEMO_CREDENTIALS.entries()) {
    let user = await dataStore.getUserByEmail(account.email);
    if (!user) {
      user = await dataStore.createUser({
        externalAuthId: `user-hackathon-demo-${index + 1}`,
        email: account.email,
        fullName: account.role.replaceAll('_', ' '),
        emailVerified: true,
        status: 'ACTIVE',
        passwordHash: hashPassword(account.password),
        authProvider: 'local',
      });
    } else if (!user.passwordHash) {
      await dataStore.setUserPassword(user.id, hashPassword(account.password));
    }

    const membership = await dataStore.getMembership(user.id, organization.id);
    if (!membership) {
      await dataStore.createMembership({
        organizationId: organization.id,
        userId: user.id,
        role: account.role,
        status: 'ACTIVE',
        assignedPlantIds: [plant.id],
      });
    }
  }

  for (const machine of MACHINE_DEMOS) {
    const existing = await dataStore.getMachineByAssetTag(organization.id, machine.assetTag);
    if (existing) continue;

    await dataStore.createMachine(organization.id, {
      ...machine,
      plantId: plant.id,
      manufacturer: 'ForgeX Synthetic Demo Equipment',
      serialNumber: machine.assetTag,
      dataClassification: 'INTERNAL',
      verificationState: 'UNVERIFIED',
      documentationReadiness: 'INCOMPLETE',
    });
  }

  const machines = await dataStore.listMachines(organization.id, { plantId: plant.id });
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    plantId: plant.id,
    machineCount: machines.length,
    accounts: HACKATHON_DEMO_CREDENTIALS,
  };
}

import { DataClassification } from './machines.js';

/**
 * Universal Industry Profile & Custom Metadata Specifications
 */
export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  required: boolean;
  options?: string[]; // Allowed options when type === 'enum'
  unit?: string;
  description?: string;
  validationRegex?: string;
}

export interface IndustryTerminology {
  tagLabel: string;        // e.g., "KKS Tag", "ISA Tag", "Equipment ID", "Asset Tag"
  assetLabel: string;      // e.g., "Machine", "Skid", "Train", "Bioreactor", "Turbine"
  plantLabel: string;      // e.g., "Plant", "Facility", "Refinery", "Substation", "Fab"
  lineLabel: string;       // e.g., "Production Line", "Unit", "Bay", "Process Train"
}

export interface IndustryProfile {
  id: string;
  organizationId: string; // "GLOBAL" for standard presets, or org UUID for customized profiles
  code: string;           // e.g., "MANUFACTURING", "OIL_GAS", "PHARMA", "CUSTOM_*"
  name: string;
  description: string;
  isCustom: boolean;
  assetCategories: string[];
  terminology: IndustryTerminology;
  drawingTypes: string[];
  customFields: CustomFieldDefinition[];
  standardCertifications?: string[]; // e.g., ["ISO 9001", "API 610", "FDA 21 CFR Part 11", "IEC 61508"]
  createdAt: string;
  updatedAt: string;
}

/**
 * Engineering Asset Lifecycle States
 */
export type EngineeringAssetStatus =
  | 'UPLOADED'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING_FAILED'
  | 'SUPERSEDED';

export type CADFileFormat =
  | 'GLB'
  | 'GLTF'
  | 'STEP'
  | 'STP'
  | 'IGES'
  | 'IGS'
  | 'STL'
  | 'OBJ';

export interface EngineeringModel3D {
  id: string;
  organizationId: string;
  plantId: string;
  machineId?: string;
  assetId?: string;
  industryProfileCode: string;
  assetCategory: string;
  title: string;
  manufacturer?: string;
  modelNumber?: string;
  sourceProvider?: string;
  sourceUrl?: string;
  fileFormat: CADFileFormat;
  fileSizeBytes: number;
  fileHashSha256: string;
  storageKey: string;
  convertedStorageKey?: string; // Derived GLB storage key for web viewer
  modelRevision: string;        // e.g., "1.0", "Rev C"
  status: EngineeringAssetStatus;
  dataClassification: DataClassification;
  licenseUsageRights?: string;
  uploadedByUserId: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  errorMessage?: string;
  extractedComponentsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type ManufacturerResourceType =
  | 'OFFICIAL_MANUAL'
  | 'DATASHEET'
  | 'IOM_DOCUMENT'
  | 'PARTS_CATALOGUE'
  | 'APPROVED_REFERENCE'
  | 'MANUFACTURER_CAD'
  | 'TECHNICAL_BULLETIN';

export interface ManufacturerResource {
  id: string;
  organizationId: string;
  machineId?: string;
  resourceType: ManufacturerResourceType;
  title: string;
  manufacturer: string;
  modelNumber?: string;
  sourceType: 'FILE_UPLOAD' | 'OFFICIAL_URL';
  sourceUrl?: string;
  storageKey?: string;
  fileFormat?: string;
  fileSizeBytes?: number;
  fileHashSha256?: string;
  versionRevision: string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  accessRequirements?: string;
  usageRightsEvidence?: string;
  uploadedByUserId: string;
  verifiedByUserId?: string;
  verifiedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DrawingType =
  | 'PID'
  | 'ELECTRICAL_SCHEMATIC'
  | 'WIRING_DIAGRAM'
  | 'HYDRAULIC_PNEUMATIC'
  | 'MECHANICAL_ASSEMBLY'
  | 'PROCESS_FLOW'
  | 'PLANT_LAYOUT'
  | 'INSTRUMENTATION_LOOP'
  | 'OTHER';

export interface EngineeringDrawing {
  id: string;
  organizationId: string;
  plantId: string;
  machineId?: string;
  drawingTitle: string;
  uniqueDrawingNumber: string; // e.g., "DWG-2026-P204-E01"
  drawingType: DrawingType;
  discipline: string;          // "Mechanical", "Electrical", "Process", "Piping", "Instrumentation"
  revision: string;            // e.g., "Rev B"
  effectiveDate?: string;
  source: string;
  storageKey: string;
  originalFileName: string;
  fileFormat: 'PDF' | 'PNG' | 'JPG' | 'SVG' | 'CAD' | 'DXF';
  fileSizeBytes: number;
  fileHashSha256: string;
  status: EngineeringAssetStatus;
  dataClassification: DataClassification;
  equipmentTags: string[];
  uploadedByUserId: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringAssetCenterSummary {
  totalModels3d: number;
  approvedModels3d: number;
  pendingReviewModels3d: number;
  totalDrawings: number;
  approvedDrawings: number;
  totalManufacturerResources: number;
  totalIndustryProfiles: number;
  activeIndustryProfileCode: string;
  supportedFormats: {
    cad: string[];
    drawings: string[];
    resources: string[];
  };
}

/**
 * Built-in Standard Industry Presets
 */
export const DEFAULT_INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    id: 'ind_mfg_auto',
    organizationId: 'GLOBAL',
    code: 'MANUFACTURING_AUTOMATION',
    name: 'Manufacturing & Industrial Automation',
    description: 'Precision machining, robotics, assembly lines, and discrete factory automation.',
    isCustom: false,
    assetCategories: ['CNC Mills', 'Industrial Robots', 'Conveyors', 'Injection Molders', 'Packaging Cells'],
    terminology: {
      tagLabel: 'Asset Tag',
      assetLabel: 'Machine Cell',
      plantLabel: 'Factory',
      lineLabel: 'Assembly Line',
    },
    drawingTypes: ['Mechanical Assembly', 'Electrical Schematic', 'Wiring Diagram', 'Plant Layout'],
    customFields: [
      { id: 'f_cycle_time', name: 'cycleTimeSeconds', label: 'Cycle Time (s)', type: 'number', required: false, unit: 'sec' },
      { id: 'f_plc_type', name: 'plcModel', label: 'PLC Controller', type: 'string', required: false },
    ],
    standardCertifications: ['ISO 9001', 'ISO 13849', 'CE Machinery Directive'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_oil_gas',
    organizationId: 'GLOBAL',
    code: 'OIL_GAS_PETROCHEM',
    name: 'Oil, Gas & Petrochemical',
    description: 'Upstream extraction, midstream transport, refining, petrochemical, and continuous chemical processing.',
    isCustom: false,
    assetCategories: ['Centrifugal Pumps', 'Distillation Columns', 'Gas Compressors', 'Heat Exchangers', 'Fired Heaters'],
    terminology: {
      tagLabel: 'ISA Equipment Tag',
      assetLabel: 'Process Skid / Unit',
      plantLabel: 'Refinery / Plant',
      lineLabel: 'Process Train',
    },
    drawingTypes: ['P&ID', 'Process Flow (PFD)', 'Hazardous Area Classification', 'Instrumentation Loop'],
    customFields: [
      { id: 'f_design_press', name: 'designPressureBar', label: 'Design Pressure (bar)', type: 'number', required: false, unit: 'bar' },
      { id: 'f_api_class', name: 'apiStandard', label: 'API Standard (e.g. 610, 618)', type: 'string', required: false },
    ],
    standardCertifications: ['API 610', 'ASME Section VIII', 'ATEX / IECEx', 'OSHA 1910.119'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_power_util',
    organizationId: 'GLOBAL',
    code: 'POWER_UTILITIES',
    name: 'Power Generation & Utilities',
    description: 'Thermal, gas, combined-cycle, nuclear, hydro, wind, solar, and transmission utility substations.',
    isCustom: false,
    assetCategories: ['Gas Turbines', 'Steam Turbines', 'Generators', 'Transformers', 'Feedwater Pumps'],
    terminology: {
      tagLabel: 'KKS System Code',
      assetLabel: 'Turbine / Unit',
      plantLabel: 'Station',
      lineLabel: 'Block / Train',
    },
    drawingTypes: ['P&ID', 'Single Line Diagram (SLD)', 'Instrumentation Loop', 'Control Logic'],
    customFields: [
      { id: 'f_rated_mw', name: 'ratedCapacityMw', label: 'Rated Capacity (MW)', type: 'number', required: false, unit: 'MW' },
      { id: 'f_voltage_kv', name: 'nominalVoltageKv', label: 'Nominal Voltage (kV)', type: 'number', required: false, unit: 'kV' },
    ],
    standardCertifications: ['NERC CIP', 'IEEE C37', 'ASME Boiler Code', 'IEC 61850'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_pharma_bio',
    organizationId: 'GLOBAL',
    code: 'PHARMA_BIOTECH',
    name: 'Pharmaceuticals & Biotechnology',
    description: 'API synthesis, aseptic formulation, fill-finish, bioreactors, clean utilities, and cGMP compliance.',
    isCustom: false,
    assetCategories: ['Bioreactors', 'Lyophilizers', 'Autoclaves', 'Clean-in-Place (CIP) Skids', 'Chromatography Skids'],
    terminology: {
      tagLabel: 'Equipment Qualification ID',
      assetLabel: 'Skid / Clean Unit',
      plantLabel: 'Manufacturing Suite',
      lineLabel: 'Filling / Processing Line',
    },
    drawingTypes: ['P&ID', 'Piping Isometric', 'Cleanroom Layout', 'Utility Flow Diagram'],
    customFields: [
      { id: 'f_clean_class', name: 'cleanroomClass', label: 'Cleanroom Class (Grade A-D)', type: 'string', required: false },
      { id: 'f_gmp_crit', name: 'gmpCriticality', label: 'GMP Direct Impact (Yes/No)', type: 'boolean', required: false },
    ],
    standardCertifications: ['FDA 21 CFR Part 11', 'EU cGMP Annex 1', 'ISPE GAMP 5'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_auto_trans',
    organizationId: 'GLOBAL',
    code: 'AUTOMOTIVE_TRANSPORT',
    name: 'Automotive & Transportation',
    description: 'Vehicle stamping, body-in-white (BIW), robotic welding, paint booths, and powertrain testing.',
    isCustom: false,
    assetCategories: ['Stamping Presses', 'Welding Cells', 'Paint Applicators', 'Dynamometers', 'AGVs'],
    terminology: {
      tagLabel: 'Station ID / Tool #',
      assetLabel: 'Station / Fixture',
      plantLabel: 'Assembly Plant',
      lineLabel: 'Body / Chassis Line',
    },
    drawingTypes: ['Tooling Assembly', 'Electrical Schematic', 'Pneumatic Schematic', 'Cell Layout'],
    customFields: [
      { id: 'f_jph', name: 'jobsPerHour', label: 'Throughput (JPH)', type: 'number', required: false, unit: 'JPH' },
    ],
    standardCertifications: ['IATF 16949', 'ISO 26262', 'VDA 6.3'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_food_bev',
    organizationId: 'GLOBAL',
    code: 'FOOD_BEVERAGE',
    name: 'Food & Beverage Processing',
    description: 'Sanitary batching, pasteurization, homogenizers, aseptic packaging, and refrigeration systems.',
    isCustom: false,
    assetCategories: ['Homogenizers', 'Pasteurizers', 'Industrial Mixers', 'Bottling Lines', 'Ammonia Chillers'],
    terminology: {
      tagLabel: 'Sanitary Unit Tag',
      assetLabel: 'Processing Machine',
      plantLabel: 'Production Facility',
      lineLabel: 'Packaging Line',
    },
    drawingTypes: ['P&ID', 'Sanitary Piping', 'Electrical Schematic', 'Packaging Layout'],
    customFields: [
      { id: 'f_cip_compat', name: 'cipCompatible', label: 'CIP Compatible', type: 'boolean', required: false },
    ],
    standardCertifications: ['3-A Sanitary Standards', 'EHEDG', 'HACCP', 'FSMA'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_water_env',
    organizationId: 'GLOBAL',
    code: 'WATER_ENVIRONMENTAL',
    name: 'Water Treatment & Environmental',
    description: 'Potable water filtration, wastewater clarification, aeration, desalination, and membrane treatment skids.',
    isCustom: false,
    assetCategories: ['Clarifiers', 'Aeration Blowers', 'Reverse Osmosis Skids', 'Filter Presses', 'Sludge Dewaterers'],
    terminology: {
      tagLabel: 'Plant Asset Tag',
      assetLabel: 'Treatment Skid',
      plantLabel: 'Treatment Works',
      lineLabel: 'Process Stream',
    },
    drawingTypes: ['P&ID', 'Hydraulic Profile', 'Civil / Basin Layout', 'Single Line Diagram'],
    customFields: [
      { id: 'f_flow_m3h', name: 'nominalFlowM3h', label: 'Nominal Flow (m³/h)', type: 'number', required: false, unit: 'm³/h' },
    ],
    standardCertifications: ['NSF/ANSI 60/61', 'EPA Clean Water Act', 'Ten States Standards'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_aero_space',
    organizationId: 'GLOBAL',
    code: 'AEROSPACE_AVIATION',
    name: 'Aerospace & Aviation Facilities',
    description: 'Aircraft propulsion test benches, avionics rigs, composite curing autoclaves, and hydraulic actuators.',
    isCustom: false,
    assetCategories: ['Turbofan Test Cells', 'Autoclaves', 'Hydraulic Test Benches', 'Wind Tunnels', 'CNC Gantry Mills'],
    terminology: {
      tagLabel: 'Aerospace Rig Tag',
      assetLabel: 'Test Rig / Unit',
      plantLabel: 'Hangar / Facility',
      lineLabel: 'Cell / Test Bay',
    },
    drawingTypes: ['Hydraulic Schematic', 'Wiring Interconnect', 'Mechanical Fabrication', 'Instrumentation Drawing'],
    customFields: [
      { id: 'f_calib_cycle', name: 'calibrationCycleDays', label: 'Calibration Cycle (Days)', type: 'number', required: false, unit: 'days' },
    ],
    standardCertifications: ['AS9100D', 'FAA Part 145', 'DO-160'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ind_semi_elec',
    organizationId: 'GLOBAL',
    code: 'ELECTRONICS_SEMICONDUCTOR',
    name: 'Electronics & Semiconductor Facilities',
    description: 'Cleanroom wafer fab, photolithography steppers, plasma etchers, and chemical distribution systems.',
    isCustom: false,
    assetCategories: ['Photolithography Steppers', 'Plasma Etchers', 'PVD/CVD Chambers', 'Ultrapure Water Skids'],
    terminology: {
      tagLabel: 'Tool ID / SECS-GEM Tag',
      assetLabel: 'Wafer Tool',
      plantLabel: 'Fab',
      lineLabel: 'Bay / Cleanroom Chase',
    },
    drawingTypes: ['Gas/Chemical P&ID', 'Cleanroom Layout', 'Exhaust Schematic', 'Electrical Schematics'],
    customFields: [
      { id: 'f_wafer_size', name: 'waferSizeMm', label: 'Wafer Diameter (mm)', type: 'number', required: false, unit: 'mm' },
    ],
    standardCertifications: ['SEMI S2/S8', 'ISO 14644 Class 1-1000'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

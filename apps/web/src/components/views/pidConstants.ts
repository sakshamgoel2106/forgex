export interface PidTagDetail {
  tag: string;
  name: string;
  type: string;
  category: 'EQUIPMENT' | 'VESSEL' | 'EXCHANGER' | 'DRYER' | 'VALVE' | 'INSTRUMENT';
  description: string;
  designDuty?: string;
  capacity?: string;
  designPressure?: string;
  operatingPressure?: string;
  designTemp?: string;
  powerRating?: string;
  setPressure?: string;
  range?: string;
  componentId?: string;
  manualPage?: number;
  // Normalized percentage coordinates relative to drawing width & height (0 to 100)
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export const STANDARD_PID_TAG_CATALOG: Record<string, PidTagDetail> = {
  'C-101': {
    tag: 'C-101',
    name: 'Air Compressor',
    type: 'Rotary Screw / Primary Compression Stage',
    category: 'EQUIPMENT',
    description: 'Twin-screw oil-injected primary compressor stage delivering continuous plant air.',
    capacity: '1,250 m³/h (735 CFM)',
    operatingPressure: '7.5 bar(g)',
    designPressure: '10.0 bar(g)',
    designTemp: '95°C max discharge',
    powerRating: '90 kW (120 HP)',
    componentId: 'comp-stage-1',
    manualPage: 12,
    bbox: { x: 19, y: 46, w: 14, h: 18 },
  },
  'M-101': {
    tag: 'M-101',
    name: 'Electric Drive Motor',
    type: 'Main Compressor Drive',
    category: 'EQUIPMENT',
    description: 'High-efficiency 3-phase induction motor driving primary rotary screw element.',
    powerRating: '90 kW / 400V / 50 Hz',
    operatingPressure: 'N/A',
    designTemp: 'Class F Insulation (40°C Ambient)',
    componentId: 'main-drive-motor',
    manualPage: 18,
    bbox: { x: 7, y: 49, w: 11, h: 14 },
  },
  'E-101': {
    tag: 'E-101',
    name: 'Aftercooler Heat Exchanger',
    type: 'Discharge Air Cooling',
    category: 'EXCHANGER',
    description: 'Plate-fin shell & tube heat exchanger cooling hot compressed air before receiver.',
    designDuty: '68 kW thermal rejection',
    operatingPressure: '7.4 bar(g)',
    designPressure: '12.0 bar(g)',
    designTemp: 'Inlet 90°C -> Outlet 32°C',
    componentId: 'aftercooler-exchanger',
    manualPage: 24,
    bbox: { x: 35, y: 43, w: 11, h: 16 },
  },
  'V-101': {
    tag: 'V-101',
    name: 'Moisture Separator',
    type: 'Condensate Knock-out Drum',
    category: 'VESSEL',
    description: 'Centrifugal vortex moisture separator removing bulk water droplets and oil aerosols.',
    capacity: '85 Liters knock-out sump',
    operatingPressure: '7.3 bar(g)',
    designPressure: '12.0 bar(g)',
    designTemp: '50°C max',
    componentId: 'moisture-separator',
    manualPage: 28,
    bbox: { x: 48, y: 47, w: 10, h: 18 },
  },
  'V-102': {
    tag: 'V-102',
    name: 'Air Receiver Tank',
    type: 'Pressurized Storage Vessel',
    category: 'VESSEL',
    description: 'Vertical pressure vessel dampening pulsations and buffering high pneumatic demand.',
    capacity: '3,000 Liters (800 Gallons)',
    operatingPressure: '7.2 bar(g)',
    designPressure: '11.0 bar(g) @ 65°C',
    designTemp: '-10°C to 65°C (ASME Sec VIII Div 1)',
    componentId: 'air-receiver-vessel',
    manualPage: 32,
    bbox: { x: 73, y: 39, w: 12, h: 26 },
  },
  'AD-101': {
    tag: 'AD-101',
    name: 'Refrigerated Air Dryer',
    type: 'Dew Point Control Unit',
    category: 'DRYER',
    description: 'Refrigerated thermal-mass compressed air dryer lowering dew point to ISO Class 4.',
    capacity: '1,400 m³/h capacity',
    operatingPressure: '7.2 bar(g)',
    designPressure: '12.0 bar(g)',
    designTemp: '+3°C Pressure Dew Point (PDP)',
    componentId: 'refrigerated-dryer',
    manualPage: 38,
    bbox: { x: 60, y: 45, w: 11, h: 18 },
  },
  'PSV-101': {
    tag: 'PSV-101',
    name: 'Pressure Safety Valve',
    type: 'Set @ 10 Bar Overpressure Protection',
    category: 'VALVE',
    description: 'Full-lift spring loaded safety relief valve protecting Air Receiver Vessel V-102.',
    setPressure: '10.0 bar(g) (145 psig)',
    capacity: 'Relieving Rate: 2,100 kg/h',
    designPressure: 'Flange ANSI 150# RF',
    componentId: 'psv-101-relief',
    manualPage: 44,
    bbox: { x: 74, y: 24, w: 8, h: 12 },
  },
  'PI-101': {
    tag: 'PI-101',
    name: 'Pressure Indicator (Compressor)',
    type: 'Compressor Discharge Pressure Gauge',
    category: 'INSTRUMENT',
    description: 'Direct-mount stainless bourdon tube pressure gauge monitoring element output.',
    range: '0 – 16 bar(g)',
    operatingPressure: '7.5 bar(g) normal',
    componentId: 'pi-101-gauge',
    manualPage: 48,
    bbox: { x: 25, y: 32, w: 8, h: 10 },
  },
  'PI-102': {
    tag: 'PI-102',
    name: 'Pressure Indicator (Receiver)',
    type: 'Air Receiver Pressure Gauge',
    category: 'INSTRUMENT',
    description: 'Glycerin-filled dial gauge indicating live pressure inside storage vessel V-102.',
    range: '0 – 16 bar(g)',
    operatingPressure: '7.2 bar(g) normal',
    componentId: 'pi-102-gauge',
    manualPage: 50,
    bbox: { x: 86, y: 32, w: 8, h: 10 },
  },
  'PI-101 / PI-102': {
    tag: 'PI-101 / PI-102',
    name: 'Pressure Indicators',
    type: 'Compressor & Receiver Gauges',
    category: 'INSTRUMENT',
    description: 'Dual pressure indicators for compressor discharge and receiver tank monitoring.',
    range: '0 – 16 bar(g)',
    operatingPressure: '7.2 - 7.5 bar(g)',
    componentId: 'pi-101-gauge',
    manualPage: 48,
    bbox: { x: 25, y: 32, w: 8, h: 10 },
  },
};

export const STANDARD_PID_EQUIPMENT_TAGS: string[] = [
  'C-101',
  'M-101',
  'E-101',
  'V-101',
  'V-102',
  'AD-101',
  'PSV-101',
  'PI-101',
  'PI-102',
];

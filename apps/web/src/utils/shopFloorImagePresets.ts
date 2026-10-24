/**
 * Shop-Floor Industrial Image Presets & Generators — ForgeX AI v1.4.2
 * High-resolution SVG data-URI generators for 100% stage-proof offline demo reliability.
 */

export interface ShopFloorPreset {
  id: string;
  name: string;
  category: 'PRESSURE_GAUGE' | 'LOTO_VERIFICATION' | 'COMPONENT_INSPECTION';
  readingValue: number | null;
  readingUnit: string | null;
  expectedStatus: 'CRITICAL_OVERPRESSURE' | 'SAFE_ZERO_ENERGY' | 'WEAR_DETECTED';
  description: string;
  badgeText: string;
  badgeColor: string;
  getDataUri: () => string;
}

/**
 * 1. Overpressure Gauge: 28 Bar / 406 PSI (Exceeds Lowara e-SV MAWP of 25 Bar)
 */
export function generateOverpressureGaugeSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500" data-sample-id="OVERPRESSURE_28_BAR">
  <defs>
    <radialGradient id="bezel" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="85%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#334155"/>
    </radialGradient>
    <radialGradient id="face" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="90%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Outer Casing & Chrome Bezel -->
  <circle cx="250" cy="250" r="230" fill="url(#bezel)" stroke="#64748b" stroke-width="6"/>
  <circle cx="250" cy="250" r="212" fill="#0f172a" stroke="#475569" stroke-width="3"/>
  <circle cx="250" cy="250" r="195" fill="url(#face)" filter="url(#shadow)"/>

  <!-- Dial Scale Background Sectors -->
  <!-- Green Normal Sector (0 to 20 Bar) -->
  <path d="M 120 340 A 150 150 0 0 1 250 100" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
  <!-- Amber Caution Sector (20 to 25 Bar) -->
  <path d="M 250 100 A 150 150 0 0 1 330 140" fill="none" stroke="#eab308" stroke-width="12"/>
  <!-- Red Danger / Overpressure Sector (25 to 40 Bar) -->
  <path d="M 330 140 A 150 150 0 0 1 380 340" fill="none" stroke="#ef4444" stroke-width="16" stroke-linecap="round"/>

  <!-- MAWP Threshold Limit Tick (25 Bar) -->
  <line x1="330" y1="140" x2="355" y2="125" stroke="#b91c1c" stroke-width="4"/>
  <text x="365" y="125" font-family="monospace" font-size="11" font-weight="bold" fill="#b91c1c">MAWP 25 BAR</text>

  <!-- Scale Ticks & Numbers (0 to 40 Bar) -->
  <text x="110" y="360" font-family="monospace" font-size="14" font-weight="bold" fill="#0f172a">0</text>
  <text x="100" y="250" font-family="monospace" font-size="14" font-weight="bold" fill="#0f172a">10</text>
  <text x="160" y="160" font-family="monospace" font-size="14" font-weight="bold" fill="#0f172a">15</text>
  <text x="250" y="130" font-family="monospace" font-size="14" font-weight="bold" fill="#0f172a">20</text>
  <text x="325" y="165" font-family="monospace" font-size="14" font-weight="bold" fill="#dc2626">25</text>
  <text x="375" y="240" font-family="monospace" font-size="14" font-weight="bold" fill="#dc2626">30</text>
  <text x="370" y="360" font-family="monospace" font-size="14" font-weight="bold" fill="#dc2626">40</text>

  <!-- Dial Labels -->
  <text x="250" y="200" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" letter-spacing="1">DISCHARGE PRESSURE</text>
  <text x="250" y="218" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#64748b">BAR / PSI (CL 1.0)</text>
  <text x="250" y="234" text-anchor="middle" font-family="monospace" font-size="10" fill="#2563eb" font-weight="bold">LOWARA e-SV — PUMP-001</text>

  <!-- Needle Pointing to 28 BAR (Angle approx 48 deg from top right) -->
  <g transform="rotate(48 250 250)">
    <polygon points="246,250 250,90 254,250" fill="#dc2626"/>
    <circle cx="250" cy="250" r="16" fill="#0f172a" stroke="#cbd5e1" stroke-width="3"/>
    <circle cx="250" cy="250" r="6" fill="#ef4444"/>
  </g>

  <!-- Digital Sub-Display Readout Badge -->
  <rect x="150" y="295" width="200" height="42" rx="8" fill="#0f172a" stroke="#ef4444" stroke-width="2"/>
  <text x="250" y="322" text-anchor="middle" font-family="monospace" font-size="18" font-weight="bold" fill="#f87171" letter-spacing="1">28.0 BAR (406 PSI)</text>

  <!-- High Pressure Warning Banner -->
  <rect x="110" y="375" width="280" height="28" rx="6" fill="#fef2f2" stroke="#f87171" stroke-width="1.5"/>
  <text x="250" y="394" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="#b91c1c">⚠️ DANGER: OVERPRESSURE DETECTED</text>
</svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/**
 * 2. Zero-Energy Verified Gauge: 0 Bar / 0 PSI (Complies with OSHA 1910.147 LOTO)
 */
export function generateZeroEnergyGaugeSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500" data-sample-id="ZERO_ENERGY_0_BAR">
  <defs>
    <radialGradient id="bezel-zero" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="85%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#334155"/>
    </radialGradient>
    <radialGradient id="face-zero" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="90%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </radialGradient>
    <filter id="shadow-zero" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Outer Casing & Chrome Bezel -->
  <circle cx="250" cy="250" r="230" fill="url(#bezel-zero)" stroke="#10b981" stroke-width="6"/>
  <circle cx="250" cy="250" r="212" fill="#0f172a" stroke="#059669" stroke-width="3"/>
  <circle cx="250" cy="250" r="195" fill="url(#face-zero)" filter="url(#shadow-zero)"/>

  <!-- Zero Energy Safe Zone (Green band around 0 position) -->
  <path d="M 115 345 A 150 150 0 0 1 125 315" fill="none" stroke="#10b981" stroke-width="18" stroke-linecap="round"/>

  <!-- Scale Ticks & Numbers -->
  <text x="110" y="360" font-family="monospace" font-size="16" font-weight="bold" fill="#059669">0</text>
  <text x="100" y="250" font-family="monospace" font-size="14" font-weight="bold" fill="#64748b">10</text>
  <text x="160" y="160" font-family="monospace" font-size="14" font-weight="bold" fill="#64748b">15</text>
  <text x="250" y="130" font-family="monospace" font-size="14" font-weight="bold" fill="#64748b">20</text>
  <text x="325" y="165" font-family="monospace" font-size="14" font-weight="bold" fill="#64748b">25</text>
  <text x="375" y="240" font-family="monospace" font-size="14" font-weight="bold" fill="#64748b">30</text>
  <text x="370" y="360" font-family="monospace" font-size="14" font-weight="bold" fill="#64748b">40</text>

  <!-- Zero Resting Stop Pin -->
  <circle cx="118" cy="336" r="3.5" fill="#475569"/>

  <!-- Dial Labels -->
  <text x="250" y="195" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" letter-spacing="1">CASING DRAIN PRESSURE</text>
  <text x="250" y="213" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#059669">PG-101 (BLEED MANIFOLD)</text>
  <text x="250" y="230" text-anchor="middle" font-family="monospace" font-size="10" fill="#2563eb" font-weight="bold">PUMP-001 — LOTO VERIFICATION</text>

  <!-- Needle Resting at 0 BAR against Pin (approx -128 deg from vertical) -->
  <g transform="rotate(-128 250 250)">
    <polygon points="246,250 250,90 254,250" fill="#059669"/>
    <circle cx="250" cy="250" r="16" fill="#0f172a" stroke="#cbd5e1" stroke-width="3"/>
    <circle cx="250" cy="250" r="6" fill="#10b981"/>
  </g>

  <!-- Digital Sub-Display Readout Badge -->
  <rect x="150" y="295" width="200" height="42" rx="8" fill="#0f172a" stroke="#10b981" stroke-width="2"/>
  <text x="250" y="322" text-anchor="middle" font-family="monospace" font-size="18" font-weight="bold" fill="#34d399" letter-spacing="1">0.0 BAR (0.0 PSI)</text>

  <!-- OSHA 1910.147 Verified Banner -->
  <rect x="100" y="375" width="300" height="28" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="1.5"/>
  <text x="250" y="394" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="#065f46">✅ OSHA 1910.147 ZERO ENERGY CONFIRMED</text>
</svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/**
 * 3. Corroded Mechanical Seal Face: Boundary lubrication failure & thermal micro-cracking
 */
export function generateCorrodedSealSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500" data-sample-id="CORRODED_SEAL">
  <defs>
    <radialGradient id="ring-bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="60%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#334155"/>
    </radialGradient>
    <radialGradient id="carbon-face" cx="50%" cy="50%" r="50%">
      <stop offset="40%" stop-color="#334155"/>
      <stop offset="70%" stop-color="#475569"/>
      <stop offset="90%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>

  <!-- Background Inspection Frame -->
  <rect width="500" height="500" fill="#090d16" rx="16"/>
  <rect x="20" y="20" width="460" height="460" rx="12" fill="none" stroke="#334155" stroke-width="2"/>

  <!-- Technical Header -->
  <text x="250" y="55" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#38bdf8" letter-spacing="1">MECHANICAL SEAL INSPECTION PORT</text>
  <text x="250" y="75" text-anchor="middle" font-family="monospace" font-size="11" fill="#94a3b8">Asset: PUMP-001 (Lowara 10SV08F030T) · Stationary SiC Ring</text>

  <!-- Seal Ring Outer Body -->
  <circle cx="250" cy="245" r="145" fill="url(#ring-bg)" stroke="#64748b" stroke-width="4"/>
  <!-- Primary Carbon / Silicon-Carbide Mating Face -->
  <circle cx="250" cy="245" r="115" fill="url(#carbon-face)" stroke="#94a3b8" stroke-width="3"/>
  <!-- Inner Shaft Bore -->
  <circle cx="250" cy="245" r="60" fill="#090d16" stroke="#475569" stroke-width="3"/>

  <!-- Severe Scoring Grooves & Cavitation Pitting (Simulated damage) -->
  <!-- Concentric Scoring Grooves -->
  <circle cx="250" cy="245" r="95" fill="none" stroke="#f59e0b" stroke-width="3.5" stroke-dasharray="12 4 8 6"/>
  <circle cx="250" cy="245" r="82" fill="none" stroke="#d97706" stroke-width="2.5" stroke-dasharray="16 6 4 4"/>
  <circle cx="250" cy="245" r="105" fill="none" stroke="#b45309" stroke-width="2" stroke-dasharray="6 3 14 5"/>

  <!-- Thermal Discoloration / Heat Checking -->
  <path d="M 220 160 Q 230 180 215 200" stroke="#ef4444" stroke-width="3" fill="none"/>
  <path d="M 280 165 Q 270 185 285 205" stroke="#ef4444" stroke-width="3" fill="none"/>
  <path d="M 330 230 Q 315 240 335 255" stroke="#ef4444" stroke-width="3" fill="none"/>

  <!-- Pitting Defects (dots) -->
  <circle cx="210" cy="220" r="4" fill="#dc2626"/>
  <circle cx="225" cy="235" r="3" fill="#dc2626"/>
  <circle cx="290" cy="230" r="4.5" fill="#dc2626"/>
  <circle cx="300" cy="215" r="3" fill="#dc2626"/>
  <circle cx="260" cy="325" r="4" fill="#dc2626"/>
  <circle cx="245" cy="335" r="3.5" fill="#dc2626"/>

  <!-- Defect Annotation Pointers -->
  <line x1="335" y1="200" x2="390" y2="170" stroke="#f59e0b" stroke-width="2"/>
  <text x="395" y="166" font-family="monospace" font-size="10" font-weight="bold" fill="#f59e0b">Thermal Scoring</text>

  <line x1="210" y1="280" x2="150" y2="310" stroke="#ef4444" stroke-width="2"/>
  <text x="80" y="315" font-family="monospace" font-size="10" font-weight="bold" fill="#ef4444">Cavitation Micro-Pits</text>

  <!-- Damage Assessment Footer Badge -->
  <rect x="50" y="420" width="400" height="38" rx="8" fill="#1e1b4b" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="250" y="444" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="#fbbf24">
    ⚠️ WEAR DETECTED: BOUNDARY LUBRICATION SEIZURE RISK
  </text>
</svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export const SHOP_FLOOR_PRESETS: ShopFloorPreset[] = [
  {
    id: 'sample_overpressure',
    name: 'Sample: High Discharge Pressure (28 Bar)',
    category: 'PRESSURE_GAUGE',
    readingValue: 28.0,
    readingUnit: 'bar',
    expectedStatus: 'CRITICAL_OVERPRESSURE',
    description: 'Analog pressure gauge PG-101 reading 28.0 Bar (406 PSI), exceeding Lowara e-SV MAWP limit (25.0 Bar).',
    badgeText: '28.0 BAR (EXCEEDS MAWP)',
    badgeColor: 'bg-rose-950 text-rose-300 border-rose-600',
    getDataUri: generateOverpressureGaugeSvg,
  },
  {
    id: 'sample_zero_energy',
    name: 'Sample: 0 PSI LOTO Gauge',
    category: 'LOTO_VERIFICATION',
    readingValue: 0.0,
    readingUnit: 'bar',
    expectedStatus: 'SAFE_ZERO_ENERGY',
    description: 'Casing bleed pressure gauge PG-101 verified at 0 Bar / 0 PSI for OSHA 1910.147 Lockout/Tagout.',
    badgeText: '0.0 BAR (ZERO ENERGY CONFIRMED)',
    badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-600',
    getDataUri: generateZeroEnergyGaugeSvg,
  },
  {
    id: 'sample_seal',
    name: 'Sample: Cavitation Seal Damage',
    category: 'COMPONENT_INSPECTION',
    readingValue: null,
    readingUnit: null,
    expectedStatus: 'WEAR_DETECTED',
    description: 'Silicon-carbide mechanical seal face with severe dry-running scoring, thermal micro-cracking, and pitting.',
    badgeText: 'SEAL WEAR & CAVITATION DETECTED',
    badgeColor: 'bg-amber-950 text-amber-300 border-amber-600',
    getDataUri: generateCorrodedSealSvg,
  },
];

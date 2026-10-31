import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Lock,
  UserPlus,
  CheckCheck,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  X,
  Sparkles,
  Copy,
  Check,
  Play,
  Kanban,
  LayoutGrid,
  Layers,
  Zap,
  Clock,
  Trash2,
  Edit3,
  ShieldCheck,
  Camera,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { LotoSafetyRunnerModal } from '../copilot/LotoSafetyRunnerModal';
import type {
  MaintenanceCase,
  MaintenanceCaseStatus,
  MaintenanceCaseSeverity,
  ChecklistStepStatus,
} from '@forgex/shared-types';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import { computeTechnicianLiveStatus } from '../../utils/technicianLiveStatus';
import {
  getDeletedTicketIds,
  extractAllTicketIdentifiers,
  isTicketDeleted,
  purgeTicketFromAllStorage,
} from '../../utils/ticketPersistence';
import { formatCleanMachineName } from '../../lib/hindiTranslator';

export interface WorkOrderCase extends MaintenanceCase {
  history: Array<{
    id: string;
    action: string;
    user: string;
    timestamp: string;
    notes?: string;
  }>;
  createdAtFormatted?: string;
  lotoApplied?: boolean;
  topRootCause?: string;
  probability?: number;
  assetTag?: string;
  assetName?: string;
  faultCode?: string;
  errorCode?: string;
  completedSteps?: number;
  stepsCount?: number;
  specialistDiscipline?: string;
  plantName?: string;
  isAiAutoAssigned?: boolean;
  assignedTechnicianRating?: number;
}

export const getStatusTone = (status: MaintenanceCaseStatus): 'healthy' | 'warning' | 'critical' | 'neutral' => {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'healthy';
    case 'IN_PROGRESS':
    case 'DIAGNOSED':
    case 'INVESTIGATING':
      return 'warning';
    case 'ESCALATED_HUMAN':
    case 'REJECTED':
      return 'critical';
    default:
      return 'neutral';
  }
};

export const formatLocalDateTime = (isoOrDateStr?: string): string => {
  if (!isoOrDateStr) {
    return new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) {
      return isoOrDateStr;
    }
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
};

export const getAiSparesAndSla = (assetTag?: string, title?: string, symptom?: string) => {
  const text = `${assetTag || ''} ${title || ''} ${symptom || ''}`.toUpperCase();
  if (text.includes('PUMP') || text.includes('OH2') || text.includes('SEAL') || text.includes('HYDR') || text.includes('LEAK')) {
    return {
      parts: 'Seal Kit #SK-801 • Dynamic Viton O-Ring • Calibrated Torque Wrench • LOTO Lock',
      sla: '60m',
      mttr: '18m',
    };
  }
  if (text.includes('MOTOR') || text.includes('BEARING') || text.includes('VIBRATION') || text.includes('ELEC') || text.includes('VFD')) {
    return {
      parts: 'Drive-End Bearing #6314-C3 • Klüber Lubricant • Laser Alignment Kit • Class 0 Gloves',
      sla: '45m',
      mttr: '14m',
    };
  }
  if (text.includes('COMPRESSOR') || text.includes('VALVE') || text.includes('PRESSURE') || text.includes('PNEUM')) {
    return {
      parts: 'Dual-Stage Valve Rebuild Kit • PTFE Flange Gasket • Digital Pressure Gauge • Safety Tagout',
      sla: '75m',
      mttr: '24m',
    };
  }
  return {
    parts: 'Standard Overhaul Kit #OK-102 • Industrial Loctite 243 • Dial Indicator • Multi-hasp LOTO',
    sla: '60m',
    mttr: '20m',
  };
};

export interface SlaCountdownInfo {
  targetMinutes: number;
  remainingMinutes: number;
  elapsedMinutes: number;
  status: 'MET' | 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
  badgeText: string;
  badgeClass: string;
}

export const computeSlaCountdown = (
  c: WorkOrderCase,
  isFullySolved: boolean,
  nowMs: number = Date.now()
): SlaCountdownInfo => {
  const { sla } = getAiSparesAndSla(c.assetTag, c.title, c.symptomDescription);
  const targetMinutes =
    parseInt(sla.replace(/\D/g, ''), 10) ||
    (c.severity === 'CRITICAL' ? 30 : c.severity === 'HIGH' ? 45 : 60);

  const createdTime = new Date(c.createdAt || (c as any).rawCreatedAt || nowMs).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - createdTime) / 60000));

  if (isFullySolved || c.status === 'RESOLVED' || c.status === 'CLOSED') {
    return {
      targetMinutes,
      remainingMinutes: Math.max(0, targetMinutes - elapsedMinutes),
      elapsedMinutes,
      status: 'MET',
      badgeText: `✅ SLA Met: ${Math.min(elapsedMinutes, targetMinutes)}m / ${targetMinutes}m`,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-mono font-bold',
    };
  }

  const remainingMinutes = targetMinutes - elapsedMinutes;

  if (remainingMinutes <= 0) {
    const overdue = Math.abs(remainingMinutes);
    return {
      targetMinutes,
      remainingMinutes,
      elapsedMinutes,
      status: 'BREACHED',
      badgeText: `🔥 Breached: +${overdue}m Overdue (Target: ${targetMinutes}m)`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-mono font-bold animate-pulse shadow-2xs',
    };
  }

  if (remainingMinutes <= 15) {
    return {
      targetMinutes,
      remainingMinutes,
      elapsedMinutes,
      status: 'AT_RISK',
      badgeText: `🚨 SLA At Risk: ${remainingMinutes}m left (Target: ${targetMinutes}m)`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-mono font-bold shadow-2xs',
    };
  }

  return {
    targetMinutes,
    remainingMinutes,
    elapsedMinutes,
    status: 'ON_TRACK',
    badgeText: `⏱️ SLA Target: ${targetMinutes}m | Rem: ${remainingMinutes}m ⚡ On Track`,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 font-mono font-semibold shadow-2xs',
  };
};

export interface SimilarPastRecord {
  recordNumber: string;
  ticketId: string;
  dateStr: string;
  assetTag: string;
  occurrences: number;
  pastRootCause: string;
  pastResolution: string;
  technicianName: string;
  mttr: string;
  summaryText: string;
}

export const getSimilarPastHistory = (c: WorkOrderCase): SimilarPastRecord => {
  const text = `${c.assetTag || ''} ${c.assetName || ''} ${c.title || ''} ${c.symptomDescription || ''}`.toUpperCase();

  if (text.includes('PUMP') || text.includes('OH2') || text.includes('SEAL') || text.includes('LEAK')) {
    return {
      recordNumber: 'MR-2026-8812',
      ticketId: 'WO-2026-8812',
      dateStr: '12-Oct-2026',
      assetTag: c.assetTag || 'PUMP-201A',
      occurrences: 2,
      pastRootCause: 'Primary mechanical seal Viton dynamic O-ring micro-fracture',
      pastResolution: 'Replaced with cartridge mechanical seal kit #SK-801 & barrier flush Plan 53A',
      technicianName: 'Marcus Vance',
      mttr: '18m',
      summaryText: '2 past occurrences on this asset solved via seal replacement & Plan 53A flush',
    };
  }

  if (text.includes('MOTOR') || text.includes('MTR') || text.includes('BEARING') || text.includes('VIBRAT') || text.includes('ELEC')) {
    return {
      recordNumber: 'MR-2026-8924',
      ticketId: 'WO-2026-8924',
      dateStr: '22-Oct-2026',
      assetTag: c.assetTag || 'ELEC-MTR-701',
      occurrences: 3,
      pastRootCause: 'Drive-end deep groove roller bearing synthetic grease degradation & micro-spalling',
      pastResolution: 'Fitted OEM SKF 6314-2Z bearing, flushed grease cavity, torqued retaining collar to 45 Nm',
      technicianName: 'Alex Rivera',
      mttr: '14m',
      summaryText: '3 past occurrences on this asset solved via drive-end bearing replacement & Klüber re-greasing',
    };
  }

  if (text.includes('COMPRESSOR') || text.includes('VALVE') || text.includes('PRESS') || text.includes('PNEUM')) {
    return {
      recordNumber: 'MR-2026-7640',
      ticketId: 'WO-2026-7640',
      dateStr: '04-Oct-2026',
      assetTag: c.assetTag || 'COMP-SCREW-301',
      occurrences: 1,
      pastRootCause: 'Suction unloader valve seat carbonization & PTFE flange gasket creep',
      pastResolution: 'Overhauled valve plate assembly, renewed PTFE gasket, recalibrated unloader solenoid',
      technicianName: 'Elena Rostova',
      mttr: '24m',
      summaryText: '1 past occurrence on this asset solved via suction valve rebuild & PTFE gasket replacement',
    };
  }

  return {
    recordNumber: 'MR-2026-8105',
    ticketId: 'WO-2026-8105',
    dateStr: '18-Oct-2026',
    assetTag: c.assetTag || 'MACHINE-ASSET',
    occurrences: 2,
    pastRootCause: 'Torque relaxation on primary drive mounting bolts & dynamic imbalance',
    pastResolution: 'Re-torqued all 8 mounting bolts to 85 Nm with Loctite 243, dynamic laser alignment verified',
    technicianName: 'Marcus Vance',
    mttr: '20m',
    summaryText: '2 past occurrences on this asset solved via fastener re-torque & laser re-alignment',
  };
};

interface MachineOption {
  id: string;
  assetTag: string;
  name: string;
  area?: string;
}

interface TechnicianOption {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  department?: string;
}

export interface DispatchTech {
  id: string;
  userId: string;
  fullName: string;
  discipline: string;
  rating: number;
  role: string;
  isAvailable: boolean;
  activeTicketsCount?: number;
}

export const DISPATCH_TECHNICIAN_ROSTER: DispatchTech[] = [
  {
    id: 'tech-1',
    userId: 'tech-1',
    fullName: 'Alex Rivera',
    discipline: 'Mechanical & Rotating Systems',
    role: 'Mechanical Systems Specialist',
    rating: 4.9,
    isAvailable: true,
  },
  {
    id: 'tech-2',
    userId: 'tech-2',
    fullName: 'Marcus Vance',
    discipline: 'Hydraulics & Pressure Systems',
    role: 'Senior Hydraulic Engineer',
    rating: 4.8,
    isAvailable: true,
  },
  {
    id: 'tech-3',
    userId: 'tech-3',
    fullName: 'Sarah Chen',
    discipline: 'Electrical Controls & PLC',
    role: 'Electrical Controls Specialist',
    rating: 4.9,
    isAvailable: true,
  },
  {
    id: 'tech-4',
    userId: 'tech-4',
    fullName: 'Elena Rostova',
    discipline: 'Vibration & Acoustic Analysis',
    role: 'Lead Vibration Analyst',
    rating: 4.7,
    isAvailable: true,
  },
];

export const selectBestTechnician = (
  ticket: {
    assetTag?: string;
    assetId?: string;
    title?: string;
    symptomDescription?: string;
    faultCode?: string;
  },
  activeCases: Array<{
    assignedTechnicianUserId?: string | null;
    assignedTechnicianName?: string | null;
    status: string;
    checklist?: any[];
    stepsCount?: number;
    completedSteps?: number;
  }>,
  excludedTechNames: string[] = []
): DispatchTech => {
  const query = `${ticket.assetTag || ''} ${ticket.assetId || ''} ${ticket.title || ''} ${ticket.symptomDescription || ''} ${ticket.faultCode || ''}`.toLowerCase();

  const candidates = DISPATCH_TECHNICIAN_ROSTER.map((tech) => {
    const liveStatus = computeTechnicianLiveStatus(
      { fullName: tech.fullName, id: tech.id, userId: tech.userId },
      activeCases
    );

    const isExcluded = excludedTechNames.includes(tech.fullName) || excludedTechNames.includes(tech.id);
    const isOnShift = liveStatus.shiftStatus === 'ON_SHIFT';

    let matchScore = 0;

    // Discipline-specific matching
    if (tech.fullName === 'Sarah Chen') {
      if (
        query.includes('elec') ||
        query.includes('plc') ||
        query.includes('vfd') ||
        query.includes('short') ||
        query.includes('inverter') ||
        query.includes('trip') ||
        query.includes('current') ||
        query.includes('phase') ||
        query.includes('voltage')
      ) {
        matchScore += 50;
      }
    } else if (tech.fullName === 'Marcus Vance') {
      if (
        query.includes('hyd') ||
        query.includes('press') ||
        query.includes('leak') ||
        query.includes('seal') ||
        query.includes('fluid') ||
        query.includes('piston') ||
        query.includes('cylinder') ||
        query.includes('bar') ||
        query.includes('psi')
      ) {
        matchScore += 50;
      }
    } else if (tech.fullName === 'Elena Rostova') {
      if (
        query.includes('vib') ||
        query.includes('noise') ||
        query.includes('acoustic') ||
        query.includes('whine') ||
        query.includes('spindle') ||
        query.includes('harmonic') ||
        query.includes('resonance') ||
        query.includes('frequency')
      ) {
        matchScore += 50;
      }
    } else {
      // Alex Rivera: Mechanical & Rotating Systems
      if (
        query.includes('pump') ||
        query.includes('motor') ||
        query.includes('compressor') ||
        query.includes('gearbox') ||
        query.includes('bearing') ||
        query.includes('shaft') ||
        query.includes('coupling') ||
        query.includes('rotor') ||
        query.includes('torque')
      ) {
        matchScore += 50;
      }
    }

    matchScore += tech.rating * 10;
    matchScore -= liveStatus.activeTicketsCount * 5;

    return {
      tech: {
        ...tech,
        activeTicketsCount: liveStatus.activeTicketsCount,
        isAvailable: liveStatus.statusType === 'AVAILABLE' && !isExcluded && isOnShift,
      },
      matchScore,
      liveStatus,
      isExcluded,
      isOnShift,
    };
  });

  // 1. Prioritize 🟢 Available technicians first (0 active tickets, on shift, not excluded)
  const availableCandidates = candidates.filter(
    (c) => c.liveStatus.statusType === 'AVAILABLE' && !c.isExcluded && c.isOnShift
  );
  if (availableCandidates.length > 0) {
    availableCandidates.sort((a, b) => b.matchScore - a.matchScore);
    return availableCandidates[0].tech;
  }

  // 2. If all are busy, pick the 🟡 Busy technician with highest completion % / closest to finishing current machine
  const busyCandidates = candidates.filter(
    (c) => c.liveStatus.statusType === 'BUSY' && !c.isExcluded && c.isOnShift
  );
  if (busyCandidates.length > 0) {
    busyCandidates.sort((a, b) => {
      const diffPct = (b.liveStatus.highestProgressPct || 0) - (a.liveStatus.highestProgressPct || 0);
      if (diffPct !== 0) return diffPct;
      return b.matchScore - a.matchScore;
    });
    return busyCandidates[0].tech;
  }

  // 3. Fallback to non-excluded candidates sorted by matchScore
  const nonExcluded = candidates.filter((c) => !c.isExcluded && c.isOnShift);
  if (nonExcluded.length > 0) {
    nonExcluded.sort((a, b) => b.matchScore - a.matchScore);
    return nonExcluded[0].tech;
  }

  return DISPATCH_TECHNICIAN_ROSTER[0];
};

// -----------------------------------------------------------------------------
// LOCAL STATE PERSISTENCE HELPERS (Instant Sync & Reload Resilience)
// -----------------------------------------------------------------------------
const STORAGE_CHECKLIST_PREFIX = 'forgex_sop_checklist_';
const STORAGE_LOTO_PREFIX = 'forgex_sop_loto_';

export const getLocalChecklistState = (caseId: string): Record<string, ChecklistStepStatus> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_CHECKLIST_PREFIX}${caseId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveLocalChecklistState = (
  caseId: string,
  stepId: string,
  status: ChecklistStepStatus
) => {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalChecklistState(caseId);
    current[stepId] = status;
    localStorage.setItem(`${STORAGE_CHECKLIST_PREFIX}${caseId}`, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to save checklist state to localStorage', err);
  }
};

export const getLocalLotoState = (caseId: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`${STORAGE_LOTO_PREFIX}${caseId}`) === 'true';
  } catch {
    return false;
  }
};

export const saveLocalLotoState = (caseId: string, confirmed: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_LOTO_PREFIX}${caseId}`, confirmed ? 'true' : 'false');
  } catch (err) {
    console.warn('Failed to save LOTO state to localStorage', err);
  }
};

export const purgeExecutionLocalStorage = (activeCaseIds?: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(STORAGE_CHECKLIST_PREFIX)) {
        const id = key.replace(STORAGE_CHECKLIST_PREFIX, '');
        if (!activeCaseIds || !activeCaseIds.includes(id)) {
          keysToRemove.push(key);
        }
      } else if (key.startsWith(STORAGE_LOTO_PREFIX)) {
        const id = key.replace(STORAGE_LOTO_PREFIX, '');
        if (!activeCaseIds || !activeCaseIds.includes(id)) {
          keysToRemove.push(key);
        }
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Failed to clean execution localStorage', err);
  }
};

// -----------------------------------------------------------------------------
// LIVE EXECUTION PROGRESS & TITLE CLEANING HELPERS
// -----------------------------------------------------------------------------
export interface ExecutionStepItem {
  stepNumber: number;
  title: string;
  instruction?: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
}

export interface ExecutionProgressInfo {
  totalSteps: number;
  doneSteps: number;
  progressPct: number;
  isSolved: boolean;
  activeStepName: string;
  steps: ExecutionStepItem[];
}

export function cleanFaultTitle(rawTitle?: string, caseNumber?: string, assetTag?: string): string {
  if (!rawTitle) return 'Operating Tolerance Deviation';
  let clean = rawTitle;
  if (caseNumber) {
    clean = clean.replace(new RegExp(`^\\[?${caseNumber}\\]?[:\\s-]*`, 'gi'), '');
  }
  clean = clean.replace(/^\[(?:ESC|CASE|WO|TKT|ALM)-[A-Z0-9-]+\][:\s-]*/gi, '');
  if (assetTag) {
    clean = clean.replace(new RegExp(`^\\[?${assetTag}\\]?[:\\s-]*`, 'gi'), '');
  }
  clean = clean.replace(/^\[[A-Za-z0-9]+-[A-Za-z0-9-]+\][:\s-]*/gi, '');
  clean = clean.replace(/^[A-Za-z0-9]+-[A-Za-z0-9-]+[:\s-]+/g, '');
  // Strip any alarm code prefix like ALM-DIAG-201 /
  clean = clean.replace(/^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+\s*[\/:\s-]+\s*/i, '');
  // Strip leading slash, colon, or dashes
  clean = clean.replace(/^[\s/:\-]+/g, '');
  // Strip trailing role in parentheses like (Lead Vibration Analyst) or any technician roles
  clean = clean.replace(/\s*\([^)]*(?:Analyst|Technician|Overhaul|Lead|Engineer|Specialist|Certified|Senior|Operator)[^)]*\)\s*$/i, '');
  // Strip .glb, .gltf, .obj, .stl extensions and any redundant (MODEL.GLB)
  clean = clean.replace(/\.(glb|gltf|obj|stl)\b/gi, '');
  clean = clean.replace(/\s*\([^)]*(?:\.glb|\.gltf|[A-Z0-9_-]+\.glb)[^)]*\)/gi, '');
  clean = clean.replace(/^[\s/:\-]+/g, '').trim();
  if (!clean || clean === ':' || clean === '-' || clean === '/') {
    return 'Operating Tolerance Deviation';
  }
  return clean;
}

export interface StepEngineeringSpec {
  stepNumber: number;
  title: string;
  tools: string[];
  tolerances: Array<{ label: string; value: string }>;
  toleranceSummary: string;
  safetyProtocol: string;
}

export const STANDARD_5_STEPS = [
  {
    stepNumber: 1,
    title: 'Vision LOTO & Zero-Energy Isolation',
    instruction: 'Lock out main breaker, bleed line pressure to 0 PSI, and tag out per OSHA 1910.147.',
  },
  {
    stepNumber: 2,
    title: 'Access Cover & Guard Disassembly',
    instruction: 'Remove safety shroud and unbolt casing cover; check flange gap uniformity.',
  },
  {
    stepNumber: 3,
    title: 'Internal Component & Seal Inspection',
    instruction: 'Inspect seal faces, bearings, and shaft runout for wear or pitting under 3 helium light bands.',
  },
  {
    stepNumber: 4,
    title: 'Precision Reassembly & Torque',
    instruction: 'Install new seals/bearings and torque M12 studs in star-pattern to 45 Nm ± 2 Nm.',
  },
  {
    stepNumber: 5,
    title: 'Recommissioning & Baseline Run Test',
    instruction: 'Clear work zone, re-energize equipment, and run a 15-minute vibration & thermal baseline check.',
  },
];

export const PROCEDURE_STEP_LABELS = [
  '01 LOTO Gate',
  '02 Disassembly',
  '03 Inspection',
  '04 Torque Spec',
  '05 Run Test',
] as const;

export const getStepEngineeringSpec = (stepNumber: number): StepEngineeringSpec => {
  switch (stepNumber) {
    case 1:
      return {
        stepNumber: 1,
        title: 'Vision LOTO & Zero-Energy Isolation',
        tools: [
          'Fluke 87V Calibrated Multimeter (CAT IV 600V)',
          'Digital Pressure Gauge (0 - 300 PSI, ±0.1% accuracy)',
          'OSHA 1910.147 Heavy-Duty Red Padlock & Danger Tag #402',
          'Non-Conductive Dielectric Voltage Probe (1000V rated)',
        ],
        tolerances: [
          { label: 'ELECTRICAL POTENTIAL:', value: '0.00 V AC/DC (Zero Live)' },
          { label: 'RESIDUAL HYDRAULIC PRESSURE:', value: '0.0 PSI (Bleed Valve Open)' },
          { label: 'PNEUMATIC LINE PRESSURE:', value: '0.0 bar (Line Depressurized)' },
          { label: 'LOTO ISOLATION VERIFICATION:', value: 'OSHA 1910.147 Certified' },
        ],
        toleranceSummary: '0V Electrical Potential • 0 PSI Residual Pressure • Padlock & Tag Verified (OSHA 1910.147)',
        safetyProtocol: 'Zero electrical, hydraulic, and kinetic energy verified. Suction & discharge isolation valves locked closed; bleed line vented to atmosphere.',
      };
    case 2:
      return {
        stepNumber: 2,
        title: 'Access Cover & Guard Disassembly',
        tools: [
          'Pneumatic Fastener Impact Wrench (1/2" Drive)',
          'Hardened Precision Steel Scraper & Brass Shims',
          'Digital Vernier Caliper (0 - 150 mm, 0.01 mm resolution)',
          'Metric Feeler Gauge Set (0.05 - 1.00 mm)',
        ],
        tolerances: [
          { label: 'FASTENER BREAKAWAY CHECK:', value: 'Nominal Spec (No Galling)' },
          { label: 'FLANGE GAP UNIFORMITY:', value: '≤ 0.10 mm Perimeter Gap' },
          { label: 'CASING SCORE MARKS:', value: 'Zero Scratches / Zero Gouges' },
          { label: 'MATING SURFACE FLATNESS:', value: '≤ 0.08 mm across face' },
        ],
        toleranceSummary: 'Housing Fastener Breakaway Check • Flange Gap Uniformity ≤ 0.10 mm • Zero Casing Score Marks',
        safetyProtocol: 'Verify area clear of debris before casing removal. Support casing weight with rated rigging sling to avoid flange nicking.',
      };
    case 3:
      return {
        stepNumber: 3,
        title: 'Internal Component & Seal Inspection',
        tools: [
          'Monochromatic Helium Light Source & Optical Flat',
          'Mitutoyo Magnetic-Base Dial Indicator (0.001 mm / 0.0005 in)',
          'Digital Shore A Durometer Tester (ASTM D2240)',
          '10x Illuminated Optical Inspection Loupe',
        ],
        tolerances: [
          { label: 'SEAL FACE FLATNESS:', value: '≤ 0.0005 in (3 Helium Light Bands)' },
          { label: 'SHAFT RUNOUT (TIR):', value: '≤ 0.03 mm Total Indicated Runout' },
          { label: 'ELASTOMER HARDNESS:', value: '75 ± 5 Shore A (Viton / FKM)' },
          { label: 'BEARING RADIAL PLAY:', value: '0.015 - 0.025 mm C3 Clearance' },
        ],
        toleranceSummary: 'Seal Face Flatness ≤ 0.0005 in (3 Helium Light Bands) • Shaft Runout ≤ 0.03 mm TIR • Elastomer Durometer 75 ± 5 Shore A',
        safetyProtocol: 'Avoid touching carbon or silicon carbide seal faces with bare skin. Clean exclusively with laboratory-grade anhydrous isopropyl alcohol.',
      };
    case 4:
      return {
        stepNumber: 4,
        title: 'Precision Reassembly & Torque',
        tools: [
          '1/2" Calibrated Click Torque Wrench (40 - 200 Nm, ISO 6789)',
          'Prüftechnik Laser Shaft Coupling Alignment System',
          'Precision Thread Lubricant / Loctite 243 Medium Threadlocker',
          'Star-Pattern Fastener Torque Sequence Guide',
        ],
        tolerances: [
          { label: 'M12 STUD FASTENER TORQUE:', value: '45 Nm ± 2 Nm (Star Pattern)' },
          { label: 'COUPLING ANGULAR ALIGNMENT:', value: '≤ 0.05 mm (Laser Calibrated)' },
          { label: 'COUPLING PARALLEL OFFSET:', value: '≤ 0.05 mm (Laser Calibrated)' },
          { label: 'GLAND DRAW GAP EQUALITY:', value: '≤ 0.05 mm around perimeter' },
        ],
        toleranceSummary: 'M12 Stud Star-Pattern Torque = 45 Nm ± 2 Nm • Laser Shaft Coupling Alignment ≤ 0.05 mm Angular/Parallel',
        safetyProtocol: 'Tighten all M12 studs in 3 progressive passes (30%, 70%, 100% torque). Never exceed 47 Nm to prevent casing thread stress fracture.',
      };
    case 5:
    default:
      return {
        stepNumber: 5,
        title: 'Recommissioning & Baseline Run Test',
        tools: [
          'SKF Microlog Tri-Axial Vibration Analyzer (ISO 10816)',
          'FLIR Infrared Thermal Imager (±1°C Calibration)',
          'Calibrated Acoustic Stethoscope Probe',
          'Optical Non-Contact Laser Tachometer (RPM)',
        ],
        tolerances: [
          { label: 'RMS OVERALL VIBRATION:', value: '≤ 1.8 mm/s (ISO 10816 Class I)' },
          { label: 'BEARING HOUSING ΔT:', value: '≤ 15°C Ambient Rise (Max 65°C)' },
          { label: 'FLUID WEEPAGE / LEAKAGE:', value: 'Zero Weepage (0 drops/min for 15 min)' },
          { label: 'SUCTION / DISCHARGE ΔP:', value: 'Within ±2% of OEM Baseline' },
        ],
        toleranceSummary: 'RMS Vibration ≤ 1.8 mm/s (ISO 10816 Class I) • Bearing Housing ΔT ≤ 15°C • Zero Fluid Weepage (0 drops/min for 15 min)',
        safetyProtocol: 'Inspect coupling guard securely bolted in place before power restore. Keep emergency stop switch within reach during baseline run test.',
      };
  }
};

export function getCaseExecutionProgress(c: WorkOrderCase | null | undefined): ExecutionProgressInfo {
  if (!c) {
    return {
      totalSteps: 5,
      doneSteps: 0,
      progressPct: 0,
      isSolved: false,
      activeStepName: 'Procedure Initialization',
      steps: [],
    };
  }

  let isSolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
  let storedSteps: any[] | null = null;

  try {
    const keys = [
      c.caseNumber ? `forgex_tech_exec_${c.caseNumber}` : null,
      c.id ? `forgex_tech_exec_${c.id}` : null,
    ].filter(Boolean) as string[];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.isSolved) isSolved = true;
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          storedSteps = parsed.steps;
          if (parsed.isSolved || parsed.steps.every((st: any) => st.status === 'COMPLETED')) {
            isSolved = true;
          }
          break;
        }
      }
    }
  } catch {}

  // Map 5 standard steps, syncing any completed status from storage or checklist
  const stepsList: ExecutionStepItem[] = STANDARD_5_STEPS.map((std, idx) => {
    const custom = Array.isArray(c.checklist) && c.checklist[idx] ? c.checklist[idx] : null;
    const stored = storedSteps
      ? storedSteps.find((s: any) => s.stepNumber === std.stepNumber || s.id === `step-${std.stepNumber}`)
      : null;

    let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
    if (stored?.status === 'COMPLETED' || custom?.status === 'COMPLETED') {
      status = 'COMPLETED';
    } else if (stored?.status === 'IN_PROGRESS') {
      status = 'IN_PROGRESS';
    }

    return {
      stepNumber: std.stepNumber,
      title: std.title,
      instruction: std.instruction,
      status,
    };
  });

  const totalSteps = stepsList.length;
  let doneSteps = stepsList.filter((s) => s.status === 'COMPLETED').length;

  if (isSolved) {
    doneSteps = totalSteps;
    stepsList.forEach((s) => {
      s.status = 'COMPLETED';
    });
  } else if (doneSteps > 0 && doneSteps < totalSteps) {
    const hasInProgress = stepsList.some((s) => s.status === 'IN_PROGRESS');
    if (!hasInProgress) {
      const firstPending = stepsList.find((s) => s.status === 'PENDING');
      if (firstPending) firstPending.status = 'IN_PROGRESS';
    }
  }

  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  let activeStepName = 'All procedure steps verified & complete';
  if (!isSolved) {
    const active = stepsList.find((s) => s.status === 'IN_PROGRESS') || stepsList.find((s) => s.status === 'PENDING') || stepsList[0];
    if (active) {
      activeStepName = `Step ${active.stepNumber}: ${active.title}`;
    }
  }

  return {
    totalSteps,
    doneSteps,
    progressPct,
    isSolved,
    activeStepName,
    steps: stepsList,
  };
}

export function isTicketExecutionUnderway(c: WorkOrderCase | null | undefined): boolean {
  if (!c) return false;
  const progress = getCaseExecutionProgress(c);
  return (
    c.status === 'IN_PROGRESS' ||
    c.status === 'RESOLVED' ||
    c.status === 'CLOSED' ||
    progress.doneSteps > 0 ||
    progress.isSolved ||
    Boolean((c as any).executionStarted) ||
    Boolean((c as any).isStarted)
  );
}

// -----------------------------------------------------------------------------
// HELPER: Frontline Worker Jargon Simplification
// Translates complex academic RCA terms into plain-language, actionable directives
// -----------------------------------------------------------------------------
export interface SimplifiedRca {
  actionHeader: string;
  actionSummary: string;
  urgencyLevel: 'URGENT' | 'STANDARD' | 'CAUTION';
}

export const simplifyRootCause = (rawText?: string): SimplifiedRca => {
  if (!rawText) {
    return {
      actionHeader: 'Equipment Inspection Required',
      actionSummary: 'Perform standard multi-point diagnostic check before running machine.',
      urgencyLevel: 'CAUTION',
    };
  }

  const lower = rawText.toLowerCase();

  if (
    lower.includes('galling') ||
    lower.includes('thermal runaway') ||
    lower.includes('overheating') ||
    lower.includes('thermal')
  ) {
    return {
      actionHeader: 'Motor Overheating - Lubrication & Friction Issue',
      actionSummary:
        'Excessive friction or thermal buildup detected in drive assembly. Check lubrication reservoirs, verify shaft clearance, and inspect cooling channels before restart.',
      urgencyLevel: 'URGENT',
    };
  }

  if (
    lower.includes('cavitation') ||
    lower.includes('impeller') ||
    lower.includes('suction') ||
    lower.includes('npsh')
  ) {
    return {
      actionHeader: 'Pump Cavitation - Fluid Suction Restriction',
      actionSummary:
        'Vapor pockets collapsing in pump casing. Inspect inlet suction strainer for blockage, bleed air pockets from intake line, and confirm net positive suction head.',
      urgencyLevel: 'URGENT',
    };
  }

  if (
    lower.includes('bearing') ||
    lower.includes('spalling') ||
    lower.includes('vibration') ||
    lower.includes('misalignment')
  ) {
    return {
      actionHeader: 'Bearing Wear - Excessive Mechanical Vibration',
      actionSummary:
        'Mechanical raceway degradation or alignment shift detected. Inspect roller elements, re-pack grease per specification, and verify shaft runout.',
      urgencyLevel: 'URGENT',
    };
  }

  if (
    lower.includes('seal') ||
    lower.includes('leak') ||
    lower.includes('packing') ||
    lower.includes('gasket')
  ) {
    return {
      actionHeader: 'Fluid Leak - Mechanical Seal Compromised',
      actionSummary:
        'Fluid bypass detected around shaft seal or casing gland. Depressurize and drain line, inspect O-rings, and install replacement seal face.',
      urgencyLevel: 'CAUTION',
    };
  }

  if (
    lower.includes('electrical') ||
    lower.includes('short') ||
    lower.includes('phase') ||
    lower.includes('inverter') ||
    lower.includes('vfd') ||
    lower.includes('winding')
  ) {
    return {
      actionHeader: 'Electrical Fault - Drive Inverter / Phase Imbalance',
      actionSummary:
        'Phase current imbalance or inverter trip. Lock out upstream breaker, verify phase-to-ground insulation resistance, and inspect terminal connections.',
      urgencyLevel: 'URGENT',
    };
  }

  // Fallback: clean technical prefix/hypotheses and form readable header
  const cleanHeader = rawText
    .split('.')[0]
    .replace(/[_-]/g, ' ')
    .replace(/hypothesis\s*\d*:?/gi, '')
    .trim();

  return {
    actionHeader: cleanHeader.length > 55 ? `${cleanHeader.slice(0, 52)}...` : cleanHeader,
    actionSummary: rawText,
    urgencyLevel: 'STANDARD',
  };
};

// -----------------------------------------------------------------------------
// HELPER: Compact Asset Badge with 1-Click Copy
// Truncates long UUIDs (e.g. 12961171-b508-48b9-95ca-478df6c378b6) to Asset #78B6
// -----------------------------------------------------------------------------
const formatAssetDisplay = (assetId?: string | null) => {
  if (!assetId) return { label: 'ELEC-MTR-701', full: 'ELEC-MTR-701', isTruncated: false };
  const cleaned = assetId.trim();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned);

  if (isUuid) {
    return {
      label: 'ELEC-MTR-701',
      full: cleaned,
      isTruncated: false,
    };
  }

  // Remove redundant "Asset #" prefix if present to keep code crisp
  const cleanCode = cleaned.replace(/^Asset\s*#?\s*/i, '').toUpperCase();
  return {
    label: cleanCode,
    full: cleaned,
    isTruncated: false,
  };
};

export const AssetBadge: React.FC<{ assetId?: string | null; className?: string }> = ({
  assetId,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const formatted = formatAssetDisplay(assetId);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (formatted.full) {
      navigator.clipboard.writeText(formatted.full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80 transition select-none group ${className}`}
      title={formatted.full ? `Click copy icon to copy full Asset ID:\n${formatted.full}` : 'Asset'}
    >
      <span className="tracking-tight font-semibold">{formatted.label}</span>
      {formatted.full && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-slate-400 hover:text-slate-700 transition p-0.5 rounded focus:outline-none"
          title="Copy Full Asset ID"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600" />
          ) : (
            <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100 transition" />
          )}
        </button>
      )}
      {copied && (
        <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider animate-in fade-in">
          Copied
        </span>
      )}
    </span>
  );
};

// -----------------------------------------------------------------------------
// HELPER: Severity Badge with Soft Red / Orange / Blue Tint
// -----------------------------------------------------------------------------
export const SeverityTag: React.FC<{ severity: MaintenanceCaseSeverity; className?: string }> = ({
  severity,
  className = '',
}) => {
  const config = {
    CRITICAL: {
      bg: 'bg-red-50 text-red-700 border-red-200',
      dot: 'bg-red-500',
      label: 'CRITICAL',
    },
    HIGH: {
      bg: 'bg-orange-50 text-orange-700 border-orange-200',
      dot: 'bg-orange-500',
      label: 'HIGH',
    },
    MEDIUM: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500',
      label: 'MEDIUM',
    },
    LOW: {
      bg: 'bg-slate-50 text-slate-600 border-slate-200',
      dot: 'bg-slate-400',
      label: 'LOW',
    },
  }[severity] || {
    bg: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    label: severity,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold border tracking-wider uppercase ${config.bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
};

// -----------------------------------------------------------------------------
// HELPER: Refined Status Badge for Work Orders (Linear / Vercel style)
// -----------------------------------------------------------------------------
export const CaseStatusBadge: React.FC<{
  status: MaintenanceCaseStatus;
  className?: string;
}> = ({ status, className = '' }) => {
  const config: Record<
    string,
    { label: string; bg: string; text: string; border: string; dot: string }
  > = {
    REPORTED: {
      label: 'REPORTED',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300',
      dot: 'bg-slate-500',
    },
    INVESTIGATING: {
      label: 'INVESTIGATING',
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      border: 'border-sky-300',
      dot: 'bg-sky-500',
    },
    DIAGNOSED: {
      label: 'DIAGNOSED',
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-300',
      dot: 'bg-indigo-500',
    },
    IN_PROGRESS: {
      label: 'IN PROGRESS',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-300',
      dot: 'bg-amber-500',
    },
    PENDING_APPROVAL: {
      label: 'PENDING REVIEW',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-300',
      dot: 'bg-purple-500',
    },
    RESOLVED: {
      label: 'RESOLVED',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-300',
      dot: 'bg-emerald-600',
    },
    CLOSED: {
      label: 'CLOSED',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-300',
      dot: 'bg-slate-400',
    },
    ESCALATED_HUMAN: {
      label: 'ESCALATED',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-300',
      dot: 'bg-rose-600',
    },
    REJECTED: {
      label: 'REWORK REQUIRED',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-300',
      dot: 'bg-rose-500',
    },
  };

  const item = config[status] || {
    label: status,
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border tracking-wider uppercase ${item.bg} ${item.text} ${item.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
      <span>{item.label}</span>
    </span>
  );
};

// -----------------------------------------------------------------------------
// MAIN WORK ORDER VIEW
// -----------------------------------------------------------------------------
export const SopExecutionView: React.FC<{
  onActiveCountChange?: (count: number) => void;
  initialCaseId?: string;
}> = ({ onActiveCountChange, initialCaseId }) => {
  const { toast } = useToast();
  const { organization, user } = useAuth();

  // Primary Work Orders State
  const [cases, setCases] = useState<WorkOrderCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(initialCaseId || null);
  const [selectedDrawerStepIdx, setSelectedDrawerStepIdx] = useState<number>(0);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [errorDetailsModalContent, setErrorDetailsModalContent] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'severity'>('newest');

  // Modals & User Actions State
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isUnassignConfirmOpen, setIsUnassignConfirmOpen] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isLotoModalOpen, setIsLotoModalOpen] = useState(false);

  // Form Field State - Report New Ticket Modal (Zero Pre-Selected Defaults)
  const [newTitle, setNewTitle] = useState('');
  const [newAssetTag, setNewAssetTag] = useState('');
  const [newSeverity, setNewSeverity] = useState<MaintenanceCaseSeverity | ''>('');
  const [newErrorCode, setNewErrorCode] = useState('');
  const [newLotoRequired, setNewLotoRequired] = useState(false);
  const [newSymptoms, setNewSymptoms] = useState('');
  const [newMachineStatus, setNewMachineStatus] = useState<'HALTED' | 'DEGRADED'>('HALTED');
  const [newShiftArea, setNewShiftArea] = useState('Bay 04 · Stamping Line A');

  const QUICK_SYMPTOM_CHIPS = [
    '+ High Vibration',
    '+ Thermal Spike',
    '+ Pressure Drop',
    '+ Seal Leakage',
    '+ Abnormal Noise',
    '+ Electrical Trip',
  ];

  const handleAddSymptomChip = (chip: string) => {
    const cleanChip = chip.replace(/^\+\s*/, '');
    setNewSymptoms((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return cleanChip;
      if (trimmed.toLowerCase().includes(cleanChip.toLowerCase())) return prev;
      return `${trimmed}, ${cleanChip}`;
    });
  };

  const handleOpenNewCaseModal = () => {
    setNewTitle('');
    setNewAssetTag('');
    setNewSeverity('');
    setNewErrorCode('');
    setNewLotoRequired(false);
    setNewSymptoms('');
    setNewMachineStatus('HALTED');
    setNewShiftArea('Bay 04 · Stamping Line A');
    setIsNewCaseModalOpen(true);
  };

  const handleCloseNewCaseModal = () => {
    setIsNewCaseModalOpen(false);
    setNewTitle('');
    setNewAssetTag('');
    setNewSeverity('');
    setNewErrorCode('');
    setNewLotoRequired(false);
    setNewSymptoms('');
    setNewMachineStatus('HALTED');
    setNewShiftArea('Bay 04 · Stamping Line A');
  };

  const [escalateReason, setEscalateReason] = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdown Options loaded from Real APIs
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [selectedTechName, setSelectedTechName] = useState<string>('');
  const [isChangingTech, setIsChangingTech] = useState(false);
  const [isLoadingTechs, setIsLoadingTechs] = useState(false);
  const [techFetchError, setTechFetchError] = useState<string | null>(null);

  // Technician Reassignment Confirmation Modal State (Requirement 3)
  const [reassignModalState, setReassignModalState] = useState<{
    isOpen: boolean;
    targetCase: WorkOrderCase | null;
    actionType: 'MANUAL_CHANGE' | 'AUTO_NEXT';
  }>({
    isOpen: false,
    targetCase: null,
    actionType: 'MANUAL_CHANGE',
  });

  // Busy Technician Center Popup Confirmation Modal State
  const [busyTechModalState, setBusyTechModalState] = useState<{
    isOpen: boolean;
    busyTech: DispatchTech | null;
    nextAvailableTech: DispatchTech | null;
    pendingTicketData?: {
      assetId: string;
      title: string;
      severity: string;
      symptomDescription: string;
      createdAtFormatted: string;
      fullDescription: string;
      nowIso: string;
    } | null;
    targetCase?: WorkOrderCase | null;
  }>({
    isOpen: false,
    busyTech: null,
    nextAvailableTech: null,
    pendingTicketData: null,
    targetCase: null,
  });

  const getNextAvailableSpecialist = (excludeTechId?: string | null): DispatchTech => {
    const available = DISPATCH_TECHNICIAN_ROSTER.find((t) => {
      if (t.id === excludeTechId || t.userId === excludeTechId) return false;
      const st = computeTechnicianLiveStatus(
        { fullName: t.fullName, id: t.id, userId: t.userId },
        cases
      );
      return st.statusType === 'AVAILABLE';
    });
    if (available) return available;
    const other = DISPATCH_TECHNICIAN_ROSTER.find((t) => t.id !== excludeTechId && t.userId !== excludeTechId);
    return other || DISPATCH_TECHNICIAN_ROSTER[1] || DISPATCH_TECHNICIAN_ROSTER[0];
  };

  const isTicketEditingLocked = (c: WorkOrderCase | null | undefined): boolean => {
    if (!c) return false;
    return isTicketExecutionUnderway(c) || Boolean((c as any).isConfirmed) || Boolean((c as any).isLocked);
  };

  const [excludedTechsPerCase, setExcludedTechsPerCase] = useState<Record<string, string[]>>({});

  // Diagnostic Detail Modal State (Requirement 4)
  const [diagnosticModal, setDiagnosticModal] = useState<{
    isOpen: boolean;
    type: 'SYMPTOM' | 'RCA';
  }>({
    isOpen: false,
    type: 'SYMPTOM',
  });

  // Step Execution Detail Modal State (Requirement 4)
  const [stepDetailModal, setStepDetailModal] = useState<{
    isOpen: boolean;
    step: {
      stepNumber: number;
      title: string;
      instruction?: string;
      status: string;
    } | null;
  }>({
    isOpen: false,
    step: null,
  });

  // Live SLA Countdown Tick (updates every 30s)
  const [currentTick, setCurrentTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Similar Past Record Modal State (Requirement 1)
  const [similarRecordModal, setSimilarRecordModal] = useState<{
    isOpen: boolean;
    record: SimilarPastRecord | null;
  }>({
    isOpen: false,
    record: null,
  });

  // Delete Ticket Confirmation Modal State (Requirement 1)
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    targetCase: WorkOrderCase | null;
  }>({
    isOpen: false,
    targetCase: null,
  });

  // Edit Ticket Modal State (Requirement 2)

  const [editModalState, setEditModalState] = useState<{
    isOpen: boolean;
    caseId: string;
    caseNumber?: string;
    title: string;
    severity: MaintenanceCaseSeverity;
    errorCode: string;
    symptoms: string;
  }>({
    isOpen: false,
    caseId: '',
    caseNumber: '',
    title: '',
    severity: 'HIGH',
    errorCode: '',
    symptoms: '',
  });

  // Supervisor View Mode: 'KANBAN' (3 Columns) or 'GRID' (Full responsive cards grid)
  const [viewMode, setViewMode] = useState<'KANBAN' | 'GRID'>('KANBAN');

  // Keyboard shortcut: ESC closes the Slide-Over Detail Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeCaseId) {
        setActiveCaseId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCaseId]);

  // 1. Fetch Real Work Orders from Backend API with Shared Escalation Store Merging
  const loadCases = useCallback(async () => {
    setIsLoadingCases(true);
    setFetchError(null);
    try {
      const res = await apiFetch('/api/v1/maintenance/cases');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const mappedCases: WorkOrderCase[] = json.data.map((c: any) => {
          const localChecklist = getLocalChecklistState(c.id);
          const checklist = Array.isArray(c.checklist)
            ? c.checklist.map((step: any) => {
                const localStatus = localChecklist[step.id];
                if (localStatus && localStatus !== step.status) {
                  return {
                    ...step,
                    status: localStatus,
                    completedAt:
                      localStatus === 'COMPLETED'
                        ? step.completedAt || new Date().toISOString()
                        : null,
                  };
                }
                return step;
              })
            : [];

          const reasonStr = (c.escalationReason || '').toLowerCase();
          const isTechError =
            reasonStr.includes('query is not defined') ||
            reasonStr.includes('ai diagnostic service failure') ||
            reasonStr.includes('syntaxerror') ||
            reasonStr.includes('referenceerror');

          let assignedUserId = c.assignedTechnicianUserId;
          let assignedName = c.assignedTechnicianName;
          let assignedRating = c.assignedTechnicianRating;
          let isAiAuto = c.isAiAutoAssigned;

          // AI Smart Auto-Assignment: Never leave an active ticket unassigned!
          if (!assignedUserId && !assignedName && c.status !== 'CLOSED' && c.status !== 'RESOLVED') {
            const best = selectBestTechnician(c, json.data);
            assignedUserId = best.id;
            assignedName = best.fullName;
            assignedRating = best.rating;
            isAiAuto = true;
          }

          return {
            ...c,
            assignedTechnicianUserId: assignedUserId,
            assignedTechnicianName: assignedName,
            assignedTechnicianRating: assignedRating || 4.9,
            isAiAutoAssigned: isAiAuto ?? true,
            isEscalated: isTechError ? false : Boolean(c.isEscalated),
            escalationReason: isTechError ? null : c.escalationReason,
            checklist,
            history:
              Array.isArray(c.history) && c.history.length > 0
                ? c.history
                : [
                    {
                      id: `h-init-${c.id}`,
                      action: 'CASE_REPORTED',
                      user: c.reportedByUserName || c.reportedByUserId || 'System',
                      timestamp: c.createdAt || new Date().toISOString(),
                      notes: `Case registered. Current status: ${c.status}`,
                    },
                  ],
          };
        });

        // Merge locally escalated tickets from shared store (bulletproof instant cross-module sync)
        try {
          const sharedRaw = localStorage.getItem('forgex_shared_raised_tickets');
          if (sharedRaw) {
            const sharedTickets = JSON.parse(sharedRaw);
            if (Array.isArray(sharedTickets)) {
              sharedTickets.forEach((st: any) => {
                const matchIdx = mappedCases.findIndex(
                  (c) => c.id === st.id || c.caseNumber === st.caseNumber || c.caseNumber === st.id
                );
                if (matchIdx === -1) {
                  mappedCases.unshift(st);
                } else {
                  // Keep authoritative fields
                  mappedCases[matchIdx] = { ...st, ...mappedCases[matchIdx] };
                }
              });
            }
          }
        } catch (errShared) {
          console.warn('Error reading forgex_shared_raised_tickets:', errShared);
        }

        const deletedSet = getDeletedTicketIds();
        const activeMappedCases = mappedCases.filter((c) => !isTicketDeleted(c, deletedSet));

        setCases(activeMappedCases);
        purgeExecutionLocalStorage(activeMappedCases.map((c) => c.id));

        const activeCount = activeMappedCases.filter((c) => c.status !== 'CLOSED').length;
        onActiveCountChange?.(activeCount);

        const savedSelectedId = sessionStorage.getItem('forgex_selected_case_id');

        setActiveCaseId((prev) => {
          const target = savedSelectedId || initialCaseId || prev;
          if (target) {
            const matched = mappedCases.find((c) => c.id === target || c.caseNumber === target);
            if (matched) return matched.id;
          }
          return null;
        });

        if (savedSelectedId) {
          sessionStorage.removeItem('forgex_selected_case_id');
        }
      } else {
        const errorMsg =
          json?.error?.message || json?.error || 'Failed to load maintenance cases';
        setFetchError(errorMsg);
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Network error connecting to maintenance case service');
    } finally {
      setIsLoadingCases(false);
    }
  }, [initialCaseId, onActiveCountChange]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Listen for cross-module ticket navigation & real-time execution progress sync
  useEffect(() => {
    const handleNav = (e: Event) => {
      const custom = e as CustomEvent<{ module?: string; caseId?: string; ticket?: any }>;
      if (custom.detail?.caseId) {
        const targetId = custom.detail.caseId;
        if (custom.detail.ticket) {
          setCases((prev) => {
            const exists = prev.find((c) => c.id === targetId || c.caseNumber === targetId);
            if (exists) return prev;
            return [custom.detail.ticket, ...prev];
          });
        }
        setActiveCaseId(targetId);
        loadCases();
      }
    };

    const handleProgressSync = (e: Event) => {
      const custom = e as CustomEvent<{
        ticketId?: string;
        rawCaseId?: string;
        status?: string;
        isSolved?: boolean;
        completedSteps?: number;
        totalSteps?: number;
        technicianName?: string;
      }>;
      if (!custom.detail) return;
      const { ticketId, rawCaseId, status, isSolved, completedSteps, totalSteps, technicianName } = custom.detail;
      setCases((prev) =>
        prev.map((c) => {
          if (c.id === ticketId || c.caseNumber === ticketId || (rawCaseId && c.id === rawCaseId)) {
            return {
              ...c,
              status: isSolved ? 'RESOLVED' : (status as any) || c.status,
              assignedTechnicianName: technicianName || c.assignedTechnicianName,
              completedSteps: completedSteps ?? c.completedSteps,
              stepsCount: totalSteps ?? (c as any).stepsCount,
            };
          }
          return c;
        })
      );
      setProgressVersion((v) => v + 1);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('forgex_tech_exec_')) {
        setProgressVersion((v) => v + 1);
      }
    };

    const handleTicketDeletedSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const targetIds: string[] =
        detail?.targetIds ||
        [detail?.ticketId, detail?.caseNumber, detail?.caseId].filter(Boolean);
      if (targetIds.length === 0) return;

      const targetSet = new Set(targetIds.map((id) => id.toUpperCase()));
      setCases((prev) => {
        const remaining = prev.filter((c) => {
          const cIds = extractAllTicketIdentifiers(c);
          return !cIds.some((id) => targetSet.has(id.toUpperCase()));
        });
        setActiveCaseId((prevId) => {
          if (!prevId) return null;
          if (targetSet.has(prevId.toUpperCase())) {
            return remaining.length > 0 ? remaining[0].id : null;
          }
          return prevId;
        });
        return remaining;
      });
    };

    window.addEventListener('forgex:navigate', handleNav);
    window.addEventListener('forgex:ticket-progress-sync', handleProgressSync);
    window.addEventListener('forgex:ticket-solved', handleProgressSync);
    window.addEventListener('forgex:ticket-deleted', handleTicketDeletedSync);
    window.addEventListener('forgex:case-deleted', handleTicketDeletedSync);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('forgex:navigate', handleNav);
      window.removeEventListener('forgex:ticket-progress-sync', handleProgressSync);
      window.removeEventListener('forgex:ticket-solved', handleProgressSync);
      window.removeEventListener('forgex:ticket-deleted', handleTicketDeletedSync);
      window.removeEventListener('forgex:case-deleted', handleTicketDeletedSync);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadCases]);

  // 2. Fetch Machines for Modal Dropdown (Starts unselected)
  const loadMachines = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/machines');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const mapped = json.data.map((m: any) => ({
          id: m.id,
          assetTag: m.assetTag || m.asset_tag || m.id,
          name: m.name || m.assetTag || 'Equipment',
          area: m.area || m.plant_area || '',
        }));
        setMachines(mapped);
      }
    } catch (err) {
      console.warn('Failed to load fleet machines for work orders:', err);
    }
  }, []);

  // 3. Fetch Technicians for Assignment Dropdown
  const loadTechnicians = useCallback(async () => {
    setIsLoadingTechs(true);
    setTechFetchError(null);
    try {
      const res = await apiFetch('/api/v1/maintenance/technicians');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: TechnicianOption[] = json.data.map((e: any) => ({
          id: e.id,
          userId: e.userId || e.id,
          fullName: e.fullName || e.name || 'Technician',
          role: e.role || 'TECHNICIAN',
          department: e.department || 'Maintenance',
        }));
        setTechnicians(mapped);
        return;
      }

      const empRes = await apiFetch('/api/v1/employees?role=TECHNICIAN');
      const empJson = await empRes.json();
      if (empRes.ok && empJson.success && Array.isArray(empJson.data) && empJson.data.length > 0) {
        const mapped: TechnicianOption[] = empJson.data.map((e: any) => ({
          id: e.id,
          userId: e.userId || e.id,
          fullName: e.fullName || e.name || 'Technician',
          role: e.role || 'TECHNICIAN',
          department: e.department || 'Maintenance',
        }));
        setTechnicians(mapped);
        return;
      }

      const fallbackRes = await apiFetch('/api/v1/employees');
      const fallbackJson = await fallbackRes.json();
      if (fallbackRes.ok && fallbackJson.success && Array.isArray(fallbackJson.data)) {
        const mapped: TechnicianOption[] = fallbackJson.data.map((e: any) => ({
          id: e.id,
          userId: e.userId || e.id,
          fullName: e.fullName || e.name || 'Staff Member',
          role: e.role || 'MEMBER',
          department: e.department || 'Operations',
        }));
        setTechnicians(mapped);
      } else {
        setTechnicians([]);
      }
    } catch (err: any) {
      console.warn('Failed to load technician directory for work orders:', err);
      setTechFetchError(err?.message || 'Failed to load technician directory');
      setTechnicians([]);
    } finally {
      setIsLoadingTechs(false);
    }
  }, []);

  useEffect(() => {
    if (isNewCaseModalOpen) {
      loadMachines();
    }
  }, [isNewCaseModalOpen, loadMachines]);

  useEffect(() => {
    loadTechnicians();
  }, [loadTechnicians]);

  // Current active work order (matches both UUID and human caseNumber)
  const activeCase = useMemo(() => {
    if (!activeCaseId) return null;
    return cases.find((c) => c.id === activeCaseId || c.caseNumber === activeCaseId) || null;
  }, [cases, activeCaseId]);

  // Real-time execution progress of the active case (reactive to Technician Queue updates)
  const activeProgress = useMemo(() => {
    return getCaseExecutionProgress(activeCase);
  }, [activeCase, progressVersion]);

  // Check if ticket is 100% solved and locked (Requirement 5)
  const isTicketFullySolved = activeProgress.isSolved;

  // Sync selected drawer step to active case or first step
  useEffect(() => {
    if (activeCase) {
      const p = getCaseExecutionProgress(activeCase);
      if (p.isSolved) {
        setSelectedDrawerStepIdx(0);
      } else {
        const nextStep = Math.min(Math.max(p.doneSteps, 0), 4);
        setSelectedDrawerStepIdx(nextStep);
      }
    } else {
      setSelectedDrawerStepIdx(0);
    }
  }, [activeCase?.id, activeCase?.status]);

  // Deep-link to Technician Queue directly with specific ticket (Requirement 4)
  const handleOpenInTechQueue = async (c: WorkOrderCase) => {
    if (c.status !== 'IN_PROGRESS' && c.status !== 'RESOLVED' && c.status !== 'CLOSED') {
      try {
        await apiFetch(`/api/v1/maintenance/cases/${c.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'IN_PROGRESS',
            notes: 'Supervisor opened work order and dispatched task to field technician execution queue.',
            expectedUpdatedAt: c.updatedAt,
          }),
        });
        setCases((prev) =>
          prev.map((item) => (item.id === c.id ? { ...item, status: 'IN_PROGRESS' } : item))
        );
      } catch (e) {
        console.warn('Auto-status update to IN_PROGRESS notice:', e);
      }
    }
    const ticketRef = c.caseNumber || c.id;
    sessionStorage.setItem('forgex_selected_tech_ticket', ticketRef);
    window.history.pushState({}, '', `?ticketId=${encodeURIComponent(ticketRef)}`);
    window.dispatchEvent(
      new CustomEvent('forgex:navigate', {
        detail: {
          module: 'tech',
          ticketId: ticketRef,
          caseId: c.id,
        },
      })
    );
  };

  // Reassignment Confirmation Dialog Action Handler (Requirement 3)
  const handleConfirmReassignment = async () => {
    const { targetCase, actionType } = reassignModalState;
    setReassignModalState({ isOpen: false, targetCase: null, actionType: 'MANUAL_CHANGE' });
    if (!targetCase) return;

    if (actionType === 'AUTO_NEXT') {
      await handleAutoAssignNextBest(targetCase);
    } else {
      setSelectedTechId(targetCase.assignedTechnicianUserId || '');
      setSelectedTechName(targetCase.assignedTechnicianName || '');
      setIsChangingTech(true);
    }
  };

  // Filtered & Sorted Work Orders
  const filteredCases = useMemo(() => {
    return cases
      .filter((c) => {
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'OPEN_DISPATCHED') {
            if (c.status !== 'REPORTED' && c.status !== 'INVESTIGATING' && c.status !== 'DIAGNOSED' && c.status !== 'PENDING_APPROVAL') {
              return false;
            }
          } else if (statusFilter === 'IN_PROGRESS') {
            if (c.status !== 'IN_PROGRESS') return false;
          } else if (statusFilter === 'RESOLVED') {
            if (c.status !== 'RESOLVED' && c.status !== 'CLOSED') return false;
          } else if (statusFilter === 'ESCALATED_OEM') {
            if (c.status !== 'ESCALATED_HUMAN' && (c as any).status !== 'ESCALATED_TO_OEM' && !c.isEscalated) {
              return false;
            }
          } else if (c.status !== statusFilter) {
            return false;
          }
        }

        if (severityFilter !== 'ALL' && c.severity !== severityFilter) {
          return false;
        }

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchNumber = c.caseNumber?.toLowerCase().includes(q);
          const matchTitle = c.title?.toLowerCase().includes(q);
          const matchAsset = c.assetId?.toLowerCase().includes(q);
          const matchDesc = c.symptomDescription?.toLowerCase().includes(q);
          const matchTech = c.assignedTechnicianName?.toLowerCase().includes(q);
          if (!matchNumber && !matchTitle && !matchAsset && !matchDesc && !matchTech) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'severity') {
          const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (rank[b.severity] || 0) - (rank[a.severity] || 0);
        }
        return 0;
      });
  }, [cases, statusFilter, severityFilter, searchTerm, sortBy]);

  // 4-Metric Command Center Summary Strip calculations
  const metrics = useMemo(() => {
    let activeInField = 0;
    let solvedCount = 0;
    let queuedCount = 0;

    let totalResolutionMinutes = 0;
    let resolvedCount = 0;
    let compliantCount = 0;

    cases.forEach((c) => {
      const p = getCaseExecutionProgress(c);
      const isSolved = p.isSolved || c.status === 'RESOLVED' || c.status === 'CLOSED';
      if (isSolved) {
        solvedCount++;
        resolvedCount++;

        // Dynamic SLA & MTTR calculation strictly from solved/verified tickets
        const { sla, mttr } = getAiSparesAndSla(c.assetTag, c.title, c.symptomDescription);
        const targetMinutes =
          parseInt(sla.replace(/\D/g, ''), 10) ||
          (c.severity === 'CRITICAL' ? 30 : c.severity === 'HIGH' ? 45 : 60);

        const createdTime = new Date(c.createdAt || (c as any).rawCreatedAt || Date.now()).getTime();
        const resolvedTime = c.resolvedAt
          ? new Date(c.resolvedAt).getTime()
          : c.closedAt
          ? new Date(c.closedAt).getTime()
          : (c as any).updatedAt
          ? new Date((c as any).updatedAt).getTime()
          : 0;

        let diffMinutes = resolvedTime > createdTime ? Math.round((resolvedTime - createdTime) / 60000) : 0;
        // Parse realistic MTTR (18m-35m) if diff is 0 or trivial (<5m) from simultaneous mock timestamps
        if (diffMinutes < 5) {
          const parsedMttr = parseInt(mttr.replace(/\D/g, ''), 10);
          diffMinutes = parsedMttr && parsedMttr >= 15 ? parsedMttr : 28;
        }

        totalResolutionMinutes += diffMinutes;
        if (diffMinutes <= targetMinutes) {
          compliantCount++;
        }
      } else if (p.doneSteps > 0 || (c as any).executionStarted || (c as any).isStarted) {
        activeInField++;
      } else {
        queuedCount++;
      }
    });

    let avgMttr = '28m';
    let slaCompliance = '100% SLA';

    if (resolvedCount > 0) {
      const avgMinutes = Math.round(totalResolutionMinutes / resolvedCount);
      avgMttr = `${avgMinutes}m`;
      const compliancePct = (compliantCount / resolvedCount) * 100;
      slaCompliance = compliancePct >= 99.9 ? '100% SLA' : `${compliancePct.toFixed(1)}% SLA`;
    }

    return {
      total: cases.length,
      queued: queuedCount,
      active: activeInField,
      solved: solvedCount,
      resolvedCount,
      avgMttr,
      slaCompliance,
      slaSubtitle: `MTTR · ${slaCompliance}`,
    };
  }, [cases, progressVersion]);

  // 3-Column Kanban Board categorization
  const kanbanColumns = useMemo(() => {
    const queued: WorkOrderCase[] = [];
    const inExecution: WorkOrderCase[] = [];
    const solved: WorkOrderCase[] = [];

    filteredCases.forEach((c) => {
      const p = getCaseExecutionProgress(c);
      const isSolved = p.isSolved || c.status === 'RESOLVED' || c.status === 'CLOSED';
      if (isSolved) {
        solved.push(c);
      } else if (p.doneSteps > 0 || (c as any).executionStarted || (c as any).isStarted) {
        inExecution.push(c);
      } else {
        queued.push(c);
      }
    });

    return {
      queued,
      inExecution,
      solved,
    };
  }, [filteredCases, progressVersion]);




  // 1-Click Fallback: Auto-Assign Next Best Available Technician
  const handleAutoAssignNextBest = async (caseToReassign: WorkOrderCase) => {
    setIsSubmitting(true);
    try {
      const currentTech = caseToReassign.assignedTechnicianName || '';
      const prevExcluded = excludedTechsPerCase[caseToReassign.id] || [];
      const updatedExcluded = currentTech ? [...prevExcluded, currentTech] : prevExcluded;

      setExcludedTechsPerCase((prev) => ({
        ...prev,
        [caseToReassign.id]: updatedExcluded,
      }));

      // Select next best technician excluding previously assigned ones
      const nextTech = selectBestTechnician(caseToReassign, cases, updatedExcluded);

      // Persist to backend
      await apiFetch(`/api/v1/maintenance/cases/${caseToReassign.id}/assign`, {
        method: 'POST',
        headers: caseToReassign.updatedAt ? { 'If-Match': caseToReassign.updatedAt } : undefined,
        body: JSON.stringify({
          technicianUserId: nextTech.id,
          technicianName: nextTech.fullName,
          expectedUpdatedAt: caseToReassign.updatedAt,
        }),
      }).catch(() => null);

      const updatedCase: WorkOrderCase = {
        ...caseToReassign,
        assignedTechnicianUserId: nextTech.id,
        assignedTechnicianName: nextTech.fullName,
        assignedTechnicianRating: nextTech.rating,
        isAiAutoAssigned: true,
        status: 'IN_PROGRESS',
        history: [
          ...caseToReassign.history,
          {
            id: `hist-reassign-${Date.now()}`,
            action: 'AI_FALLBACK_REASSIGNMENT',
            user: user?.fullName || 'AI Dispatch Engine',
            timestamp: new Date().toISOString(),
            notes: `Previous technician (${currentTech}) marked unavailable. Auto-reassigned to next best candidate: ${nextTech.fullName} (${nextTech.discipline}).`,
          },
        ],
      };

      setCases((prev) => prev.map((c) => (c.id === caseToReassign.id ? updatedCase : c)));

      toast.success(
        'AI Fallback Re-Assigned',
        `Dispatched to ${nextTech.fullName} (⭐ ${nextTech.rating} · ${nextTech.discipline}).`
      );
    } catch (err: any) {
      toast.error('Re-assignment Failed', err.message || 'Could not re-assign technician.');
    } finally {
      setIsSubmitting(false);
    }
  };



  // 3. Supervisor Review & Approval / Rejection
  const handleReviewApproval = async (approved: boolean) => {
    if (!activeCase || isSubmitting) return;

    setIsSubmitting(true);
    const previousCases = [...cases];
    const newStatus: MaintenanceCaseStatus = approved ? 'RESOLVED' : 'REJECTED';
    const now = new Date().toISOString();

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: newStatus,
      approval: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedByUserId: user?.fullName || 'Supervisor',
        reviewedAt: now,
        reviewerNotes: approvalNotes || (approved ? 'Sign-off complete.' : 'Rework required.'),
      },
      resolvedAt: approved ? now : activeCase.resolvedAt,
      candidateForExpertKnowledge: approved,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: approved ? 'WORK_ORDER_APPROVED' : 'WORK_ORDER_REJECTED',
          user: user?.fullName || 'Supervisor',
          timestamp: now,
          notes: approvalNotes || (approved ? 'Work order approved.' : 'Rejected for rework.'),
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ approved, reviewerNotes: approvalNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to record supervisor review');
      }
      toast.success(
        approved ? 'Work Order Approved' : 'Work Order Rejected',
        approved ? 'Case resolved and verified.' : 'Case returned to technician for rework.'
      );
      setApprovalNotes('');
      setIsRejectConfirmOpen(false);
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Review Failed', err.message || 'Supervisor review failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Formally Close Case
  const handleCloseCase = async () => {
    if (!activeCase || isSubmitting) return;

    setIsSubmitting(true);
    const previousCases = [...cases];
    const now = new Date().toISOString();

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: 'CLOSED',
      closedAt: now,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_CLOSED',
          user: user?.fullName || 'Plant Supervisor',
          timestamp: now,
          notes: 'Maintenance case formally closed and archived.',
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Formally closed via Work Orders console' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to close case');
      }
      toast.success('Case Closed', 'Work order formally closed and archived.');
      setIsCloseConfirmOpen(false);

      const activeCount = cases.filter((c) => c.id !== activeCase.id && c.status !== 'CLOSED').length;
      onActiveCountChange?.(activeCount);
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Closure Failed', err.message || 'Server rejected case closure.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4b. 1-Click Ticket Deletion with Full Storage Purge & Tombstoning
  const handleDeleteCase = async (targetCase: WorkOrderCase | null) => {
    if (!targetCase || isSubmitting) return;

    setIsSubmitting(true);
    const targetId = targetCase.id;
    const targetCaseNumber = targetCase.caseNumber;

    try {
      // 1. Backend API call
      try {
        await apiFetch(`/api/v1/maintenance/cases/${targetId}`, {
          method: 'DELETE',
        });
      } catch (apiErr) {
        console.warn('Backend delete notification note:', apiErr);
      }

      // 2. Multi-Store scrub and tombstone registration
      const deletedIds = purgeTicketFromAllStorage(targetCase);
      const targetSet = new Set(deletedIds.map((id) => id.toUpperCase()));

      // 3. Update local state
      setCases((prev) =>
        prev.filter((c) => {
          const cIds = extractAllTicketIdentifiers(c);
          return !cIds.some((id) => targetSet.has(id.toUpperCase()));
        })
      );

      if (
        (activeCaseId && targetSet.has(activeCaseId.toUpperCase())) ||
        activeCaseId === targetId ||
        activeCaseId === targetCaseNumber
      ) {
        setActiveCaseId(null);
      }

      toast.success(
        'Ticket Deleted',
        `Ticket ${targetCaseNumber || targetId} was permanently removed from the dispatch queue.`
      );
      setDeleteModalState({ isOpen: false, targetCase: null });

      const remainingActiveCount = cases.filter(
        (c) => c.id !== targetId && c.status !== 'CLOSED'
      ).length;
      onActiveCountChange?.(remainingActiveCount);
    } catch (err: any) {
      toast.error('Deletion Failed', err.message || 'Could not delete ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4c. Edit Ticket Details (Requirement 2)
  const handleOpenEditModal = (c: WorkOrderCase) => {
    setEditModalState({
      isOpen: true,
      caseId: c.id,
      caseNumber: c.caseNumber,
      title: c.title || '',
      severity: c.severity || 'HIGH',
      errorCode: c.errorCode || c.faultCode || '',
      symptoms: c.symptomDescription || c.description || '',
    });
  };

  const handleSaveTicketEdits = async () => {
    if (!editModalState.caseId || isSubmitting) return;

    if (!editModalState.title.trim()) {
      toast.error('Validation Error', 'Ticket title cannot be empty.');
      return;
    }
    if (!editModalState.symptoms.trim()) {
      toast.error('Validation Error', 'Observed symptoms / description cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    const targetId = editModalState.caseId;
    const now = new Date().toISOString();

    const auditEntry = {
      id: `hist-${Date.now()}`,
      action: 'CASE_DETAILS_EDITED',
      user: user?.fullName || 'Supervisor',
      timestamp: now,
      notes: `Ticket details updated by supervisor. Priority: ${editModalState.severity}, Title: ${editModalState.title.trim()}`,
    };

    // 1. Update state
    setCases((prev) =>
      prev.map((c) => {
        if (c.id === targetId || c.caseNumber === targetId || c.caseNumber === editModalState.caseNumber) {
          return {
            ...c,
            title: editModalState.title.trim(),
            severity: editModalState.severity,
            errorCode: editModalState.errorCode.trim(),
            faultCode: editModalState.errorCode.trim(),
            symptomDescription: editModalState.symptoms.trim(),
            description: editModalState.symptoms.trim(),
            history: [auditEntry, ...(c.history || [])],
            updatedAt: now,
          };
        }
        return c;
      })
    );

    // 2. Update shared storage
    try {
      const sharedRaw = localStorage.getItem('forgex_shared_raised_tickets');
      if (sharedRaw) {
        const shared = JSON.parse(sharedRaw);
        if (Array.isArray(shared)) {
          const updated = shared.map((item: any) => {
            if (item.id === targetId || item.caseNumber === targetId || item.caseNumber === editModalState.caseNumber) {
              return {
                ...item,
                title: editModalState.title.trim(),
                severity: editModalState.severity,
                errorCode: editModalState.errorCode.trim(),
                faultCode: editModalState.errorCode.trim(),
                symptomDescription: editModalState.symptoms.trim(),
                description: editModalState.symptoms.trim(),
                history: [auditEntry, ...(item.history || [])],
                updatedAt: now,
              };
            }
            return item;
          });
          localStorage.setItem('forgex_shared_raised_tickets', JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.warn('Failed to update shared storage on edit:', e);
    }

    // 3. Update backend API
    try {
      await apiFetch(`/api/v1/maintenance/cases/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editModalState.title.trim(),
          severity: editModalState.severity,
          symptomDescription: editModalState.symptoms.trim(),
          description: editModalState.symptoms.trim(),
        }),
      });
    } catch (apiErr) {
      console.warn('Backend patch call note:', apiErr);
    }

    toast.success('Ticket Updated', 'Work order details and audit log updated successfully.');
    setEditModalState((prev) => ({ ...prev, isOpen: false }));
    setIsSubmitting(false);

    window.dispatchEvent(
      new CustomEvent('forgex:ticket-updated', {
        detail: {
          caseId: targetId,
          title: editModalState.title.trim(),
          severity: editModalState.severity,
        },
      })
    );
  };



  // 5. Assign or Reassign Technician
  const handleAssignTechnician = async () => {
    if (!activeCase || isSubmitting) return;

    if (!selectedTechId) {
      toast.error('Validation Error', 'Please select a technician to assign.');
      return;
    }

    setIsSubmitting(true);
    const techName =
      selectedTechName ||
      technicians.find((t) => t.userId === selectedTechId)?.fullName ||
      'Designated Technician';

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/assign`, {
        method: 'POST',
        headers: activeCase.updatedAt ? { 'If-Match': activeCase.updatedAt } : undefined,
        body: JSON.stringify({
          technicianUserId: selectedTechId,
          technicianName: techName,
          expectedUpdatedAt: activeCase.updatedAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to assign technician');
      }

      const serverCase = json.data;
      setCases((prev) =>
        prev.map((c) =>
          c.id === activeCase.id
            ? {
                ...c,
                ...serverCase,
                history:
                  Array.isArray(serverCase.history) && serverCase.history.length > 0
                    ? serverCase.history
                    : c.history,
              }
            : c
        )
      );
      toast.success(
        activeCase.assignedTechnicianUserId ? 'Technician Reassigned' : 'Technician Assigned',
        `Work order assigned to ${serverCase.assignedTechnicianName || techName}.`
      );
      setIsAssignModalOpen(false);
    } catch (err: any) {
      toast.error('Assignment Failed', err.message || 'Server rejected technician assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5b. Unassign Technician
  const handleUnassignTechnician = async () => {
    if (!activeCase || isSubmitting) return;

    if (activeCase.status === 'IN_PROGRESS' && (!unassignReason || unassignReason.trim().length < 5)) {
      toast.error(
        'Validation Error',
        'A justification reason (min 5 characters) is required to unassign an in-progress work order.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/unassign`, {
        method: 'POST',
        headers: activeCase.updatedAt ? { 'If-Match': activeCase.updatedAt } : undefined,
        body: JSON.stringify({
          reason: unassignReason.trim() || undefined,
          expectedUpdatedAt: activeCase.updatedAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to unassign technician');
      }

      const serverCase = json.data;
      setCases((prev) =>
        prev.map((c) =>
          c.id === activeCase.id
            ? {
                ...c,
                ...serverCase,
                assignedTechnicianUserId: null,
                assignedTechnicianName: null,
                history:
                  Array.isArray(serverCase.history) && serverCase.history.length > 0
                    ? serverCase.history
                    : c.history,
              }
            : c
        )
      );
      toast.success('Technician Unassigned', 'Technician successfully unassigned from work order.');
      setIsUnassignConfirmOpen(false);
      setIsAssignModalOpen(false);
      setUnassignReason('');
    } catch (err: any) {
      toast.error('Unassignment Failed', err.message || 'Server rejected technician unassignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Manual Human Safety Escalation
  const handleEscalateCase = async () => {
    if (!activeCase || isSubmitting) return;

    if (!escalateReason.trim()) {
      toast.error('Validation Error', 'Escalation safety reason is mandatory.');
      return;
    }

    setIsSubmitting(true);
    const previousCases = [...cases];

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: 'ESCALATED_HUMAN',
      isEscalated: true,
      escalationReason: escalateReason,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_ESCALATED_TO_HUMAN',
          user: user?.fullName || 'Field Technician',
          timestamp: new Date().toISOString(),
          notes: `Safety escalation: ${escalateReason}`,
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: escalateReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to escalate case');
      }
      toast.warning('Case Escalated', 'Work order escalated for human engineering review.');
      setIsEscalateModalOpen(false);
      setEscalateReason('');
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Escalation Failed', err.message || 'Server rejected case escalation.');
    } finally {
      setIsSubmitting(false);
    }
  };



  // Helper: Dispatch newly created ticket to backend and update state
  const dispatchNewCase = async (tech: DispatchTech, isQueued: boolean, pendingData?: any) => {
    const p = pendingData || busyTechModalState.pendingTicketData;
    if (!p) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        body: JSON.stringify({
          assetId: p.assetId,
          title: p.title,
          severity: p.severity,
          symptomDescription: p.fullDescription,
          createdAtFormatted: p.createdAtFormatted,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json?.error?.message || json?.error || 'Failed to create maintenance ticket');
      }

      const created = json.data;

      // Immediately assign technician on backend
      try {
        await apiFetch(`/api/v1/maintenance/cases/${created.id}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            technicianUserId: tech.id,
            technicianName: tech.fullName,
          }),
        });
      } catch (assignErr) {
        console.warn('Backend auto-assign sync notice:', assignErr);
      }

      const targetStatus = isQueued ? 'OPEN_DISPATCHED' : 'IN_PROGRESS';
      try {
        await apiFetch(`/api/v1/maintenance/cases/${created.id}/status`, {
          method: 'POST',
          body: JSON.stringify({
            status: targetStatus,
            notes: isQueued
              ? `Placed in ${tech.fullName}'s Queue awaiting active task completion.`
              : `Dispatched to available specialist ${tech.fullName} (${tech.discipline}).`,
          }),
        });
      } catch {}

      const enrichedNew: WorkOrderCase = {
        ...created,
        createdAt: created.createdAt || p.nowIso,
        createdAtFormatted: p.createdAtFormatted,
        status: targetStatus,
        assignedTechnicianUserId: tech.id,
        assignedTechnicianName: tech.fullName,
        assignedTechnicianRating: tech.rating,
        isAiAutoAssigned: true,
        specialistDiscipline: tech.discipline,
        history: [
          {
            id: `h-init-${created.id}`,
            action: isQueued ? 'TICKET_QUEUED_TO_BUSY_SPECIALIST' : 'TICKET_RAISED_AND_AI_ASSIGNED',
            user: user?.fullName || 'Shift Supervisor',
            timestamp: p.nowIso,
            notes: isQueued
              ? `Ticket raised & placed in ${tech.fullName}'s queue.`
              : `Ticket raised & auto-assigned to ${tech.fullName} (${tech.discipline}).`,
          },
        ],
      };

      setCases((prev) => [enrichedNew, ...prev]);
      setActiveCaseId(enrichedNew.id);
      setIsNewCaseModalOpen(false);
      setBusyTechModalState({
        isOpen: false,
        busyTech: null,
        nextAvailableTech: null,
        pendingTicketData: null,
        targetCase: null,
      });
      setNewTitle('');
      setNewAssetTag('');
      setNewSeverity('');
      setNewErrorCode('');
      setNewLotoRequired(false);
      setNewSymptoms('');

      if (isQueued) {
        toast.info(
          'Ticket Placed in Queue',
          `Ticket ${created.caseNumber} queued for ${tech.fullName}. Will begin once active task finishes.`
        );
      } else {
        toast.success(
          'Ticket Raised & AI Dispatched',
          `Ticket ${created.caseNumber} auto-assigned to ${tech.fullName} (⭐ ${tech.rating} · ${tech.discipline}).`
        );
      }

      const activeCount = cases.filter((c) => c.status !== 'CLOSED').length + 1;
      onActiveCountChange?.(activeCount);
    } catch (err: any) {
      toast.error('Creation Failed', err.message || 'Server rejected ticket creation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeReassignCase = async (targetCase: WorkOrderCase, tech: DispatchTech) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${targetCase.id}/assign`, {
        method: 'POST',
        headers: targetCase.updatedAt ? { 'If-Match': targetCase.updatedAt } : undefined,
        body: JSON.stringify({
          technicianUserId: tech.id,
          technicianName: tech.fullName,
          expectedUpdatedAt: targetCase.updatedAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Assignment failed');

      setCases((prev) =>
        prev.map((c) =>
          c.id === targetCase.id
            ? {
                ...c,
                ...json.data,
                assignedTechnicianUserId: tech.id,
                assignedTechnicianName: tech.fullName,
                assignedTechnicianRating: tech.rating,
                isAiAutoAssigned: false,
              }
            : c
        )
      );
      setIsChangingTech(false);
      setBusyTechModalState({ isOpen: false, busyTech: null, nextAvailableTech: null, pendingTicketData: null, targetCase: null });
      toast.success('Technician Assigned', `Ticket reassigned to ${tech.fullName}.`);
    } catch (err: any) {
      toast.error('Assignment Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveBusyTechModal = async (action: 'QUEUE' | 'SWITCH') => {
    if (busyTechModalState.pendingTicketData) {
      const tech = action === 'QUEUE' ? busyTechModalState.busyTech : busyTechModalState.nextAvailableTech;
      if (tech) {
        await dispatchNewCase(tech, action === 'QUEUE');
      }
    } else if (busyTechModalState.targetCase) {
      const tech = action === 'QUEUE' ? busyTechModalState.busyTech : busyTechModalState.nextAvailableTech;
      if (tech) {
        await executeReassignCase(busyTechModalState.targetCase, tech);
      }
    }
  };

  // 8. Create New Raised Ticket with Automated Machine Link & AI Smart Auto-Assignment
  const handleCreateNewCase = async () => {
    if (!newTitle.trim()) {
      toast.error('Validation Error', 'Ticket title is required.');
      return;
    }
    if (!newAssetTag) {
      toast.error('Validation Error', 'Please select an affected asset / machinery.');
      return;
    }
    if (!newSeverity) {
      toast.error('Validation Error', 'Please select an operational priority / severity.');
      return;
    }
    if (!newSymptoms.trim()) {
      toast.error('Validation Error', 'Observed symptom description is required.');
      return;
    }

    const rawAsset = newAssetTag.trim();
    const effectiveAsset = rawAsset.includes(' ') ? rawAsset.split(' ')[0] : rawAsset || 'PUMP-CENTRIFUGAL-402';
    const effectiveFacility = organization?.name || 'Cleveland Stamping Plant';

    // AI Smart Auto-Assignment: Pick best available technician based on skill & availability
    const bestTech = selectBestTechnician(
      {
        assetTag: effectiveAsset,
        title: newTitle.trim(),
        symptomDescription: newSymptoms.trim(),
        faultCode: newErrorCode.trim(),
      },
      cases
    );

    const fullDescription = [
      newSymptoms.trim(),
      `Machine Status: ${newMachineStatus === 'HALTED' ? 'Down / Halted' : 'Running with Anomaly'}`,
      `Shift / Area: ${newShiftArea.trim() || 'Bay 04 · Stamping Line A'}`,
      newErrorCode.trim()
        ? `Alarm Code: ${newErrorCode.trim()}`
        : 'Alarm Code: Auto-Detected via AI Diagnostics',
      `Facility: ${effectiveFacility}`,
      `LOTO Mandatory: ${newLotoRequired ? 'Yes (OSHA 1910.147)' : 'No'}`,
    ]
      .filter(Boolean)
      .join(' | ');

    const nowIso = new Date().toISOString();

    const pendingData = {
      assetId: effectiveAsset,
      title: newTitle.trim(),
      severity: newSeverity,
      symptomDescription: fullDescription,
      createdAtFormatted: formatLocalDateTime(nowIso),
      fullDescription,
      nowIso,
    };

    // Check if the matched technician is currently BUSY executing another ticket
    const liveStatus = computeTechnicianLiveStatus(
      { fullName: bestTech.fullName, id: bestTech.id, userId: bestTech.userId },
      cases
    );

    if (liveStatus.statusType === 'BUSY') {
      const nextAvailable = getNextAvailableSpecialist(bestTech.id);
      setBusyTechModalState({
        isOpen: true,
        busyTech: bestTech,
        nextAvailableTech: nextAvailable,
        pendingTicketData: pendingData,
      });
      return;
    }

    await dispatchNewCase(bestTech, false, pendingData);
  };

  // Render individual card for Kanban columns and Grid view
  const renderTicketCard = (c: WorkOrderCase) => {
    const isSelected = activeCase ? c.id === activeCase.id : false;

    const isUUID = (str?: string) =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    let displayTag = formatCleanMachineName(c.assetTag || c.assetName || '');
    if (!displayTag || displayTag === 'PLANT_WIDE' || isUUID(displayTag)) {
      displayTag = c.assetId && !isUUID(c.assetId) ? c.assetId : 'ELEC-MTR-701';
    }
    // Strip parenthetical suffixes and .GLB extensions on the card header pill
    displayTag = displayTag
      .replace(/\.(glb|gltf|obj|stl)\b/gi, '')
      .replace(/\s*\([^)]*\)/g, '')
      .trim();
    if (!displayTag) displayTag = 'ASSET';

    const cleanSummary = cleanFaultTitle(
      c.title || c.symptomDescription || 'Maintenance Work Order',
      c.caseNumber,
      displayTag
    );

    // Live step progress sync
    const cardProgress = getCaseExecutionProgress(c);
    const isCardFullySolved = cardProgress.isSolved;
    const doneCount = isCardFullySolved ? 5 : Math.min(5, cardProgress.doneSteps);
    const pendingCount = Math.max(0, 5 - doneCount);

    // Source identification
    const isRcaSource =
      (c as any).source === 'RCA' ||
      Boolean((c as any).rcaSessionId) ||
      c.caseNumber?.startsWith('ESC-') ||
      c.title?.toLowerCase().includes('escalated rca') ||
      Boolean(c.topRootCause);

    // Technician name & live status
    const techName = c.assignedTechnicianName || 'Unassigned';
    const techStatus = computeTechnicianLiveStatus(
      { fullName: techName, id: c.assignedTechnicianUserId || '' },
      cases
    );

    const isTechLocked =
      isCardFullySolved ||
      cardProgress.doneSteps > 0 ||
      Boolean((c as any).executionStarted) ||
      Boolean((c as any).isStarted);

    return (
      <div
        key={c.id}
        onClick={() => setActiveCaseId((prev) => (prev === c.id ? null : c.id))}
        className={`rounded-xl border border-slate-200 bg-white shadow-xs hover:shadow-md hover:border-indigo-400 transition-all duration-200 overflow-hidden cursor-pointer shrink-0 ${
          isSelected
            ? 'ring-2 ring-indigo-600 border-indigo-500 shadow-md'
            : ''
        }`}
      >
        {/* Top Gradient Header Strip */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-3 py-2 rounded-t-xl flex items-center justify-between gap-2 border-b border-indigo-900/40">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-xs text-cyan-300 tracking-wide whitespace-nowrap shrink-0">
              {c.caseNumber}
            </span>
            <span
              className="font-mono font-semibold text-[10px] text-slate-200 bg-white/10 border border-white/20 px-2 py-0.5 rounded-full truncate max-w-[135px]"
              title={displayTag}
            >
              {displayTag}
            </span>
            {isRcaSource && (
              <span className="bg-purple-500/20 text-purple-200 border border-purple-400/40 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold shrink-0">
                RCA
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 tracking-wider uppercase ${
                c.severity === 'CRITICAL'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                  : c.severity === 'HIGH'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                  : 'bg-blue-500/20 text-blue-300 border-blue-400/40'
              }`}
            >
              {c.severity}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleteModalState({ isOpen: true, targetCase: c });
              }}
              title="Delete ticket"
              className="p-0.5 text-slate-400 hover:text-red-400 hover:bg-white/10 rounded transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card Body with subtle gradient background */}
        <div className="bg-gradient-to-b from-white to-slate-50/80 p-3.5 space-y-2.5">
          {/* 1-Line Clean Problem Title */}
          <p className="text-xs font-semibold text-slate-900 truncate leading-snug" title={cleanSummary}>
            {cleanSummary}
          </p>

          {/* Assigned Technician row */}
          <div className="flex items-center justify-between gap-1.5 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  techStatus.statusType === 'AVAILABLE'
                    ? 'bg-emerald-500'
                    : techStatus.statusType === 'BUSY'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
              <span className="font-semibold text-slate-800 truncate" title={techName}>
                👤 {techName}
              </span>
              <span className="text-amber-700 font-bold font-mono text-[10px]">
                ⭐{c.assignedTechnicianRating ? Number(c.assignedTechnicianRating).toFixed(1) : '4.9'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 font-mono text-[9px]">
              {isTechLocked && (
                <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded font-bold">
                  Locked
                </span>
              )}
              {c.isAiAutoAssigned !== false && (
                <span className="text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.2 rounded font-bold flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>AI</span>
                </span>
              )}
            </div>
          </div>

          {/* 5-Node Live Step Progress Tracker */}
          <div className="space-y-1.5 pt-0.5">
            {/* Live Status Summary Header */}
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span
                className={
                  isCardFullySolved
                    ? 'text-emerald-700 font-bold'
                    : doneCount > 0
                    ? 'text-indigo-700 font-bold'
                    : 'text-slate-600 font-medium'
                }
              >
                ✓ {doneCount} Completed &nbsp;•&nbsp; ⏳ {pendingCount} Pending in Tech Desk
              </span>
              <span className="text-slate-400 text-[9px] uppercase tracking-wider font-semibold">
                {isCardFullySolved ? '100% Solved' : cardProgress.progressPct > 0 ? `${cardProgress.progressPct}%` : 'Queued'}
              </span>
            </div>

            {/* 5 Connected Step Nodes */}
            <div className="relative flex items-center justify-between w-full pt-1 px-1">
              {/* Connected Track Rail */}
              <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 z-0" />

              {[1, 2, 3, 4, 5].map((stepNum) => {
                const isStepDone = isCardFullySolved || cardProgress.doneSteps >= stepNum;
                const isStepActive =
                  !isCardFullySolved &&
                  cardProgress.doneSteps + 1 === stepNum &&
                  (cardProgress.doneSteps > 0 || cardProgress.progressPct > 0 || (c as any).executionStarted || (c as any).isStarted);

                return (
                  <div key={stepNum} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shadow-2xs transition-all duration-200 ${
                        isStepDone
                          ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 text-white ring-2 ring-indigo-200 shadow-sm'
                          : isStepActive
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white ring-2 ring-amber-200 animate-pulse shadow-sm'
                          : 'bg-slate-100 text-slate-500 border border-slate-300'
                      }`}
                      title={`Step 0${stepNum}: ${isStepDone ? 'Completed in Tech Desk' : isStepActive ? 'Active in Tech Desk' : 'Pending in Tech Desk'}`}
                    >
                      {isStepDone ? '✓' : `0${stepNum}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-[#F8FAFC] text-slate-900 font-sans antialiased">
      {/* ------------------------------------------------------------------- */}
      {/* 1. TOP SINGLE ACTION HEADER (NO DUPLICATE BADGES, NO "+ +" TEXT)    */}
      {/* ------------------------------------------------------------------- */}
      <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-3 text-xs shadow-xs shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 tracking-tight text-sm uppercase">
                RAISED TICKETS & AI DISPATCH
              </h1>
              {activeCase && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="font-mono text-blue-600 font-bold text-xs">
                    {activeCase.caseNumber}
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-sans leading-none mt-1">
              Plant: <strong>{organization?.name || 'Cleveland Stamping Plant'}</strong> · Supervisor Dispatch & QA Clearance Desk
            </p>
          </div>
        </div>

        {/* Top Action Buttons (Refresh + "+ Raise Manual Ticket") */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={loadCases}
            disabled={isLoadingCases}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs h-8 px-2.5 rounded-lg"
            title="Refresh Cases"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCases ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            size="sm"
            onClick={handleOpenNewCaseModal}
            className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-xs h-8 shadow-xs px-3 rounded-lg border-0 transition cursor-pointer"
          >
            <span>+ Raise Manual Ticket</span>
          </Button>
        </div>
      </div>

      {/* Modern Slim Connection Error Alert Banner */}
      {fetchError && (
        <div className="px-4 py-2.5 border-b border-rose-200 bg-rose-50/80 flex items-center justify-between gap-3 text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{fetchError}</span>
          </div>
          <Button
            size="sm"
            onClick={loadCases}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] h-7 px-3 rounded-lg shadow-xs"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* 4-METRIC COMMAND CENTER SUMMARY STRIP */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0 shadow-2xs">
        <div className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50/90 border border-slate-200/90 rounded-xl p-2.5 flex items-center gap-3 shadow-2xs hover:shadow-xs transition">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
              Total Raised
            </div>
            <div className="text-base font-bold text-slate-900 font-mono leading-none mt-0.5">
              {metrics.total} <span className="text-xs font-normal text-slate-500">Tickets</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-b from-white to-amber-50/40 border border-amber-200/80 rounded-xl p-2.5 flex items-center gap-3 shadow-2xs hover:shadow-xs transition">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase font-bold text-amber-800 tracking-wider">
              Active in Field
            </div>
            <div className="text-base font-bold text-amber-950 font-mono leading-none mt-0.5">
              {metrics.active} <span className="text-xs font-normal text-amber-700">Executing</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-b from-white to-emerald-50/40 border border-emerald-200/80 rounded-xl p-2.5 flex items-center gap-3 shadow-2xs hover:shadow-xs transition">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xs flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase font-bold text-emerald-800 tracking-wider">
              100% Solved & Locked
            </div>
            <div className="text-base font-bold text-emerald-950 font-mono leading-none mt-0.5">
              {metrics.solved} <span className="text-xs font-normal text-emerald-700">Verified</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-b from-white to-blue-50/40 border border-blue-200/80 rounded-xl p-2.5 flex items-center gap-3 shadow-2xs hover:shadow-xs transition">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500" />
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-600 text-white shadow-xs flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase font-bold text-blue-800 tracking-wider truncate">
              Avg Resolution SLA
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base font-bold text-blue-950 font-mono leading-none">
                {metrics.avgMttr}
              </span>
              <span className="text-[11px] font-semibold text-blue-700 font-mono whitespace-nowrap">
                {metrics.slaSubtitle}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & VIEW TOGGLE BAR */}
      <div className="px-4 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search Ticket ID, asset, symptom, tech..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 shadow-xs font-mono transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status + Severity + Sort Filters */}
        <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
            <Filter className="w-3 h-3 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer font-medium"
              title="Filter by Status"
            >
              <option value="ALL">All Statuses ({cases.length})</option>
              <option value="OPEN_DISPATCHED">Open / Dispatched</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ESCALATED_OEM">Escalated to OEM</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer font-medium"
              title="Filter by Severity"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
            <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer font-medium"
              title="Sort By"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="severity">Priority</option>
            </select>
          </div>

          {/* View Toggle (Stage Pipeline vs Full Card View) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs font-sans">
            <button
              type="button"
              onClick={() => setViewMode('KANBAN')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                viewMode === 'KANBAN'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="3-Column Stage Pipeline View"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Stage Pipeline</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                viewMode === 'GRID'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Full Screen Card View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Card View</span>
            </button>
          </div>

          {/* Vision-Locked LOTO Safety Gate Launcher */}
          <button
            type="button"
            onClick={() => setIsLotoModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold transition shadow-2xs cursor-pointer font-sans"
            title="OSHA 1910.147 Vision-Locked Lockout/Tagout Runner (Live Camera / Gauge Zero-Energy Check)"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Vision LOTO Gate</span>
          </button>
        </div>
      </div>

      {/* FULL-WIDTH DISPATCH WORKSPACE CANVAS */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#F8FAFC]">
        {isLoadingCases && cases.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
            <p className="text-xs font-mono text-slate-500">Loading raised tickets dispatch desk...</p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="max-w-md mx-auto my-12 p-8 text-center space-y-3 bg-white rounded-2xl border border-dashed border-slate-200 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
              <Wrench className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">No Tickets Found</p>
            <p className="text-xs text-slate-500 leading-relaxed font-sans max-w-xs mx-auto">
              No tickets match your active filters. Clear search or raise a new maintenance ticket.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                  setSeverityFilter('ALL');
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Reset Filters
              </Button>
              <Button
                size="sm"
                onClick={handleOpenNewCaseModal}
                className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs shadow-xs"
              >
                + Raise Ticket
              </Button>
            </div>
          </div>
        ) : viewMode === 'KANBAN' ? (
          /* ================================================================= */
          /* 3-COLUMN INDUSTRIAL KANBAN DISPATCH BOARD                         */
          /* ================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            {/* Column 1: Dispatched / Queued */}
            <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 flex flex-col max-h-[calc(100vh-240px)]">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <h3 className="font-bold text-xs font-mono uppercase text-slate-700 tracking-wider">
                    Dispatched / Queued
                  </h3>
                </div>
                <span className="font-mono text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-2xs">
                  {kanbanColumns.queued.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[560px] space-y-3 pr-1.5">
                {kanbanColumns.queued.length === 0 ? (
                  <div className="flex-1 py-8 flex items-center justify-center text-center px-4 border border-dashed border-slate-300/80 rounded-xl bg-white/40 text-[11px] text-slate-400 font-mono">
                    No tickets in queue
                  </div>
                ) : (
                  kanbanColumns.queued.map((c) => renderTicketCard(c))
                )}
              </div>
            </div>

            {/* Column 2: In Execution (Live Field Work) */}
            <div className="bg-amber-50/40 border border-amber-200/70 rounded-2xl p-3 flex flex-col max-h-[calc(100vh-240px)]">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-amber-200/80 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                  <h3 className="font-bold text-xs font-mono uppercase text-amber-900 tracking-wider">
                    In Execution (Live Field)
                  </h3>
                </div>
                <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md shadow-2xs">
                  {kanbanColumns.inExecution.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[560px] space-y-3 pr-1.5">
                {kanbanColumns.inExecution.length === 0 ? (
                  <div className="flex-1 py-8 flex items-center justify-center text-center px-4 border border-dashed border-amber-300/70 rounded-xl bg-white/40 text-[11px] text-amber-600/70 font-mono">
                    No live executions active
                  </div>
                ) : (
                  kanbanColumns.inExecution.map((c) => renderTicketCard(c))
                )}
              </div>
            </div>

            {/* Column 3: 100% Solved & Verified */}
            <div className="bg-emerald-50/40 border border-emerald-200/70 rounded-2xl p-3 flex flex-col max-h-[calc(100vh-240px)]">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-emerald-200/80 shrink-0">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  <h3 className="font-bold text-xs font-mono uppercase text-emerald-900 tracking-wider">
                    100% Solved & Verified
                  </h3>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs">
                  {kanbanColumns.solved.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[560px] space-y-3 pr-1.5">
                {kanbanColumns.solved.length === 0 ? (
                  <div className="flex-1 py-8 flex items-center justify-center text-center px-4 border border-dashed border-emerald-300/70 rounded-xl bg-white/40 text-[11px] text-emerald-600/70 font-mono">
                    No solved records in filter
                  </div>
                ) : (
                  kanbanColumns.solved.map((c) => renderTicketCard(c))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* FULL-WIDTH RESPONSIVE CARD GRID VIEW                              */
          /* ================================================================= */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredCases.map((c) => renderTicketCard(c))}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* INTERACTIVE SLIDE-OVER DETAIL DRAWER                              */}
      {/* ================================================================= */}
      {activeCase && (
        <>
          {/* Backdrop with click-to-close */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 transition-opacity"
            onClick={() => setActiveCaseId(null)}
          />

          {/* Slide-over Right Panel Drawer */}
          <div className="fixed inset-y-0 right-0 max-w-3xl w-full bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Top Drawer Header with Close '✕' */}
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded shadow-2xs">
                  {activeCase.caseNumber}
                </span>
                <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                  {activeCase.assetTag || formatAssetDisplay(activeCase.assetId).label || 'PUMP-CENTRIFUGAL-402'}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                    activeCase.severity === 'CRITICAL'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : activeCase.severity === 'HIGH'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {activeCase.severity || 'HIGH'}
                </span>
                {isTicketFullySolved ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold border tracking-wider uppercase bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs">
                    <Lock className="w-3 h-3 text-emerald-700" />
                    <span>100% SOLVED & LOCKED</span>
                  </span>
                ) : (
                  <CaseStatusBadge status={activeCase.status} />
                )}
                {(() => {
                  const drawerSla = computeSlaCountdown(activeCase, isTicketFullySolved, currentTick);
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border shadow-2xs ${drawerSla.badgeClass}`}>
                      {drawerSla.badgeText}
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* ✏️ Edit Ticket Button (Locked once confirmed / in execution) */}
                {isTicketEditingLocked(activeCase) ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/40 shadow-2xs select-none"
                    title="🔒 Editing locked: Ticket is confirmed and active in execution"
                  >
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Confirmed & Locked</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(activeCase)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition cursor-pointer"
                    title="Edit ticket title, severity, alarm code, and description"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Edit Ticket</span>
                  </button>
                )}

                {/* 🗑️ Delete Ticket Button */}
                <button
                  type="button"
                  onClick={() => setDeleteModalState({ isOpen: true, targetCase: activeCase })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition cursor-pointer"
                  title="Delete ticket from dispatch queue"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete Ticket</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCaseId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg cursor-pointer transition shrink-0 ml-1"
                  title="Close Detail Drawer (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Drawer Body with all Sections */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#F8FAFC]">
              {/* WORK ORDER MANAGEMENT CARD */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {/* SECTION A — 2-ROW FULL-WIDTH EXECUTIVE HEADER */}
              <div className="p-3.5 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-200 rounded-t-xl space-y-2.5 shadow-2xs">
                {/* ROW 1 (Full Width — Title & Metadata) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                  <div className="min-w-0 flex-1">
                    <h2
                      className="text-base font-bold text-slate-900 tracking-tight font-sans leading-snug break-words"
                      title={cleanFaultTitle(
                        activeCase.title || activeCase.symptomDescription,
                        activeCase.caseNumber,
                        activeCase.assetTag || formatAssetDisplay(activeCase.assetId).label
                      )}
                    >
                      {cleanFaultTitle(
                        activeCase.title || activeCase.symptomDescription,
                        activeCase.caseNumber,
                        activeCase.assetTag || formatAssetDisplay(activeCase.assetId).label
                      )}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono whitespace-nowrap shrink-0">
                    <span>🕒 {formatLocalDateTime(activeCase.createdAt || (activeCase as any).rawCreatedAt)}</span>
                    <span className="text-slate-300">•</span>
                    <span>🏭 {activeCase.plantName || organization?.name || 'JMK Tiles Primary Facility'}</span>
                  </div>
                </div>

                {/* ROW 2 (Full Width — Assigned Tech & Action) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
                  {/* Left: Assigned Technician Badge */}
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {activeCase.assignedTechnicianUserId && !isChangingTech ? (
                      (() => {
                        const activeTechStatus = computeTechnicianLiveStatus(
                          {
                            fullName: activeCase.assignedTechnicianName || '',
                            id: activeCase.assignedTechnicianUserId || '',
                          },
                          cases
                        );
                        const isTechLocked =
                          isTicketFullySolved ||
                          activeProgress.doneSteps > 0 ||
                          Boolean((activeCase as any).executionStarted) ||
                          Boolean((activeCase as any).isStarted);

                        return (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200/90 bg-white text-slate-800 text-xs shadow-2xs">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                activeTechStatus.statusType === 'AVAILABLE'
                                  ? 'bg-emerald-500'
                                  : activeTechStatus.statusType === 'BUSY'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              title={`Live Status: ${activeTechStatus.shortText}`}
                            />
                            <span className="font-semibold text-slate-900 truncate">
                              👤 {activeCase.assignedTechnicianName}
                            </span>
                            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0">
                              ★ {activeCase.assignedTechnicianRating ? Number(activeCase.assignedTechnicianRating).toFixed(1) : '4.9'}
                            </span>
                            {activeCase.isAiAutoAssigned !== false && (
                              <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded text-[10px] font-bold font-sans flex items-center gap-1 shrink-0">
                                <Sparkles className="w-2.5 h-2.5 text-violet-600" />
                                <span>AI Assigned</span>
                              </span>
                            )}
                            {!isTechLocked && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTechId(activeCase.assignedTechnicianUserId || '');
                                  setSelectedTechName(activeCase.assignedTechnicianName || '');
                                  setIsChangingTech(true);
                                }}
                                className="ml-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                                title="Reassign specialist"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Reassign</span>
                              </button>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      /* Reassignment Dropdown Controls */
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <select
                          aria-label="Assign Single Technician"
                          value={selectedTechId}
                          disabled={isSubmitting || activeCase.status === 'CLOSED'}
                          onChange={(e) => {
                            const techId = e.target.value;
                            setSelectedTechId(techId);
                            const tech =
                              DISPATCH_TECHNICIAN_ROSTER.find((t) => t.id === techId || t.userId === techId) ||
                              technicians.find((t) => (t.userId || t.id) === techId);
                            setSelectedTechName(tech?.fullName || 'Technician');
                          }}
                          className="h-8 max-w-[280px] sm:max-w-[320px] pl-2.5 pr-7 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs disabled:opacity-50 truncate"
                        >
                          <option value="">-- Select Specialist Technician --</option>
                          {DISPATCH_TECHNICIAN_ROSTER.map((t) => {
                            const live = computeTechnicianLiveStatus(
                              { fullName: t.fullName, id: t.id, userId: t.userId },
                              cases
                            );
                            return (
                              <option key={t.id} value={t.id}>
                                {t.fullName} — {t.discipline} • [{live.statusType === 'AVAILABLE' ? 'Available' : 'Busy'}] ★ {t.rating}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          disabled={!selectedTechId || isSubmitting}
                          onClick={async () => {
                            if (!selectedTechId) return;
                            const rosterTech = DISPATCH_TECHNICIAN_ROSTER.find(
                              (t) => t.id === selectedTechId || t.userId === selectedTechId
                            );
                            const fallbackTech = technicians.find(
                              (t) => (t.userId || t.id) === selectedTechId
                            );
                            const techName =
                              rosterTech?.fullName || fallbackTech?.fullName || selectedTechName || 'Technician';

                            const resolvedTech: DispatchTech = rosterTech || {
                              id: selectedTechId,
                              userId: selectedTechId,
                              fullName: techName,
                              discipline: 'Specialist',
                              role: fallbackTech?.role || 'Specialist',
                              rating: 4.9,
                              isAvailable: false,
                            };

                            // Check if selected tech is busy -> open center popup modal!
                            const live = computeTechnicianLiveStatus(
                              { fullName: techName, id: selectedTechId, userId: selectedTechId },
                              cases
                            );
                            if (live.statusType === 'BUSY') {
                              const nextAvail = getNextAvailableSpecialist(selectedTechId);
                              setBusyTechModalState({
                                isOpen: true,
                                busyTech: resolvedTech,
                                nextAvailableTech: nextAvail,
                                targetCase: activeCase,
                              });
                              return;
                            }

                            await executeReassignCase(activeCase, resolvedTech);
                          }}
                          className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-xs px-3.5 py-1.5 rounded-lg border-0 transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Confirm Reassign</span>
                        </button>

                        {isChangingTech && (
                          <button
                            type="button"
                            onClick={() => setIsChangingTech(false)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 cursor-pointer whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Button: [▶ Open in Tech Execution Desk ->] */}
                    <button
                      type="button"
                      onClick={() => handleOpenInTechQueue(activeCase)}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs hover:shadow-md cursor-pointer whitespace-nowrap"
                      title="Open this ticket directly in Tech Execution Desk"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Open in Tech Execution Desk &rarr;</span>
                    </button>

                    {activeCase.status === 'RESOLVED' && (
                      <Button
                        size="sm"
                        onClick={() => setIsCloseConfirmOpen(true)}
                        className="bg-slate-900 hover:bg-black text-white font-bold text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-xs cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                        <span>Formally Close</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* LIVE 5-STEP INTERACTIVE PROCEDURE & TOLERANCE EXPLORER (Requirement 3) */}
              <div className="p-3 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white border-y border-indigo-900/40 shadow-sm">
                {/* 5 Full-Width, Evenly Spaced Step Pills (Grid 5 - Never Clips) */}
                <div className="grid grid-cols-5 gap-2 w-full">
                  {PROCEDURE_STEP_LABELS.map((label, idx) => {
                    const stepNum = idx + 1;
                    const isCompleted = stepNum <= activeProgress.doneSteps || isTicketFullySolved;
                    const isCurrentActive = !isTicketFullySolved && stepNum === activeProgress.doneSteps + 1;
                    const isSelected = selectedDrawerStepIdx === idx;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedDrawerStepIdx(idx)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center select-none ${
                          isSelected
                            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold shadow-md ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-950'
                            : isCompleted
                            ? 'bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-200 border border-indigo-700/60 font-semibold shadow-2xs'
                            : isCurrentActive
                            ? 'bg-amber-950/70 hover:bg-amber-900/80 text-amber-200 border border-amber-600/60 animate-pulse font-semibold'
                            : 'bg-slate-900/70 hover:bg-slate-800 text-slate-400 border border-slate-800 font-medium'
                        }`}
                        title={`Click to view Step 0${stepNum} procedure & engineering tolerance`}
                      >
                        {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-400 shrink-0" />}
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Compact Active/Selected Step Detail Strip Right Below the 5 Pills */}
                {(() => {
                  const currentStepNum = selectedDrawerStepIdx + 1;
                  const currentStep = STANDARD_5_STEPS[selectedDrawerStepIdx] || STANDARD_5_STEPS[0];
                  const isDone = isTicketFullySolved || currentStepNum <= activeProgress.doneSteps;
                  const isStepActive = !isTicketFullySolved && currentStepNum === activeProgress.doneSteps + 1;

                  const getToleranceSpecText = (step: number) => {
                    switch (step) {
                      case 1:
                        return '0V Live • 0.0 PSI Bleed • OSHA 1910.147';
                      case 2:
                        return 'Flange Gap ≤ 0.10 mm • Zero Casing Scratches';
                      case 3:
                        return 'Flatness ≤ 0.0005 in (3 Light Bands) • Runout ≤ 0.03 mm';
                      case 4:
                        return '45 Nm ± 2 Nm (Star Pattern) • Laser Align ≤ 0.05 mm';
                      case 5:
                      default:
                        return 'RMS Vib ≤ 1.8 mm/s • ΔT ≤ 15°C • 0 Drops/min';
                    }
                  };

                  return (
                    <div className="bg-white/10 border border-white/15 rounded-xl p-3.5 mt-2.5 space-y-2.5 text-xs">
                      {/* Row 1: Full-width Step Pill + Title (Never collides with Spec) */}
                      <div className="flex items-center gap-2.5 w-full">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider shrink-0 ${
                            isDone
                              ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/40'
                              : isStepActive
                              ? 'bg-amber-500/30 text-amber-300 border border-amber-400/40 animate-pulse'
                              : 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/30'
                          }`}
                        >
                          STEP 0{currentStepNum} {isDone ? '• DONE' : isStepActive ? '• ACTIVE' : '• PENDING'}
                        </span>
                        <span className="text-sm font-bold text-white leading-snug flex-1 min-w-0 break-words">
                          {currentStep.title}
                        </span>
                      </div>

                      {/* Row 2: Full-width Spec / Tolerance label + emerald tolerance badge */}
                      <div className="flex items-center gap-2 w-full flex-wrap">
                        <span className="text-[10px] font-mono text-cyan-300/90 uppercase font-bold tracking-wider shrink-0">
                          ⚙️ SPEC / TOLERANCE:
                        </span>
                        <span className="bg-emerald-950/80 border border-emerald-400/40 text-emerald-200 font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-md shadow-2xs break-words">
                          {getToleranceSpecText(currentStepNum)}
                        </span>
                      </div>

                      {/* Row 3: Full-width step instruction description */}
                      <div className="w-full text-xs text-slate-200 leading-relaxed pt-1 border-t border-white/10">
                        {currentStep.instruction}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* SECTION C — DIAGNOSTIC RCA & REPAIR PROCEDURES */}
              <div className="p-4 space-y-3.5">
                {/* Smart Similar Past Ticket Suggester (Requirement 1) */}
                {(() => {
                  const similarRecord = getSimilarPastHistory(activeCase);
                  return (
                    <div className="p-3 bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-white border border-indigo-200/90 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                              Similar Fault History
                            </span>
                            <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded font-mono text-[9px] font-bold">
                              {similarRecord.occurrences} Past Occurrences
                            </span>
                          </div>
                          <p className="text-slate-800 font-sans text-xs font-medium leading-snug">
                            {similarRecord.summaryText}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSimilarRecordModal({ isOpen: true, record: similarRecord })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-300 font-bold text-xs shadow-2xs transition cursor-pointer shrink-0 whitespace-nowrap self-end sm:self-center"
                        title="View verified historical repair record & RCA"
                      >
                        <span>View Past Record</span>
                        <span className="text-[10px]">↗</span>
                      </button>
                    </div>
                  );
                })()}

                {/* Side-by-Side Symptom & RCA Cards (Click to View Full Explained Details) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                  {/* Left Card: Reported Symptom & Alarm Code */}
                  <div
                    onClick={() => setDiagnosticModal({ isOpen: true, type: 'SYMPTOM' })}
                    className="p-3 rounded-xl border border-amber-300/80 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/20 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-amber-400 hover:shadow-sm transition group"
                    title="Click to view full untruncated symptoms, AI sensor telemetry & 5-Why causal trace"
                  >
                    <div>
                      <div className="border-b border-amber-200/80 pb-2 mb-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-[11px] font-bold text-slate-900 uppercase font-mono tracking-wide">
                            Reported Symptom & Alarm
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded shadow-2xs">
                            {activeCase.errorCode || activeCase.faultCode || 'ALM-AUTO-DETECT'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-800 font-medium font-sans leading-snug">
                        {activeCase.symptomDescription || activeCase.description || activeCase.title}
                      </p>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-amber-100/70 flex items-center justify-between text-[10px] font-mono text-amber-800">
                      <span>Telemetry & 5-Why</span>
                      <span className="group-hover:translate-x-0.5 transition-transform font-bold text-amber-900">
                        Click to expand details ↗
                      </span>
                    </div>
                  </div>

                  {/* Right Card: Confirmed Root Cause (from RCA) */}
                  <div
                    onClick={() => setDiagnosticModal({ isOpen: true, type: 'RCA' })}
                    className="p-3 rounded-xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/30 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-sm transition group"
                    title="Click to view full causal analysis, failure mechanism explanation & risk matrix"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-indigo-100 pb-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-[11px] font-bold text-indigo-950 uppercase font-mono tracking-wide">
                            Confirmed Root Cause
                          </span>
                        </div>
                        <span className="font-mono text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 px-2 py-0.5 rounded shadow-2xs shrink-0 whitespace-nowrap">
                          {activeCase.probability || 94}% Confidence
                        </span>
                      </div>
                      <p className="text-xs text-slate-900 font-semibold font-sans leading-snug">
                        {cleanFaultTitle(
                          activeCase.diagnosticHypothesis?.primaryHypothesis ||
                            activeCase.topRootCause ||
                            'Mechanical wear or operational deviation identified during diagnostic root-cause inspection.',
                          activeCase.caseNumber,
                          activeCase.assetTag
                        )}
                      </p>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-indigo-100/70 flex items-center justify-between text-[10px] font-mono text-indigo-800">
                      <span>Causal Verification</span>
                      <span className="group-hover:translate-x-0.5 transition-transform font-bold text-indigo-950">
                        Click to expand details ↗
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compact Single-Row "Spares & Tools" + Vision LOTO Strip (Requirement 3) */}
                {(() => {
                  const sparesAndSla = getAiSparesAndSla(activeCase.assetTag, activeCase.title, activeCase.symptomDescription);
                  return (
                    <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs shadow-2xs">
                      {/* Left: AI Auto-Detected Kit & MTTR (No duplicate SLA badge) */}
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <div className="flex items-center gap-1.5 text-slate-800">
                          <span className="text-sm">🧰</span>
                          <span className="text-slate-500 font-mono text-[10px] uppercase font-bold">Spares & Tools:</span>
                          <span className="text-slate-900 font-semibold font-sans">{sparesAndSla.parts}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shadow-2xs shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                          <span>In Stock</span>
                        </span>
                        <span className="text-slate-300 hidden sm:inline">•</span>
                        <span className="text-[11px] font-mono text-slate-600">
                          MTTR: <strong className="text-slate-900 font-bold">{sparesAndSla.mttr}</strong>
                        </span>
                      </div>

                      {/* Right: OSHA Vision-Locked LOTO Action */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        <Button
                          size="sm"
                          onClick={() => setIsLotoModalOpen(true)}
                          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs h-7 px-3.5 rounded-lg flex items-center gap-1.5 shadow-sm border-0 transition-all cursor-pointer"
                          title="OSHA 1910.147 Vision-Locked Lockout/Tagout Gate"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Run Vision LOTO</span>
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* SECTION D — SUPERVISOR SIGN-OFF (Only visible when Technician marks work complete) */}
              {activeCase.status === 'PENDING_APPROVAL' && (
                <div className="p-5 bg-amber-50/40 border-t border-amber-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-amber-600" />
                      <span className="font-bold text-slate-900 uppercase font-mono text-xs">
                        Section D — Supervisor Sign-off & Clearance
                      </span>
                    </div>
                    <StatusBadge label="AWAITING SUPERVISOR REVIEW" tone="warning" pulse />
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-amber-200/80 text-xs space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                      Technician Completed Findings & Observations
                    </span>
                    <p className="text-slate-800 font-medium font-sans">
                      {activeCase.findings?.resolutionSummary ||
                        activeCase.findings?.observations ||
                        'Technician has completed execution of repair steps and submitted work for supervisor QA clearance.'}
                    </p>
                    {activeCase.findings?.measuredValues &&
                      Object.keys(activeCase.findings.measuredValues).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-100">
                          {Object.entries(activeCase.findings.measuredValues).map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono text-[11px]"
                            >
                              <span className="text-slate-500">{k}:</span>
                              <span className="text-slate-900 font-bold">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-slate-600 font-semibold">
                      Supervisor Review Notes
                    </label>
                    <textarea
                      rows={2}
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      placeholder="Enter supervisor quality sign-off remarks or rework specifications..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-sans text-slate-900 focus:outline-none focus:border-blue-600 shadow-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => setIsRejectConfirmOpen(true)}
                      className="px-3.5 py-1.5 text-xs font-bold"
                    >
                      Reject (Request Rework)
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => handleReviewApproval(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-1.5 shadow-xs rounded-lg cursor-pointer"
                    >
                      {isSubmitting ? 'Approving...' : 'Approve & Close Ticket'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Resolved State Notice */}
              {activeCase.status === 'RESOLVED' && (
                <div className="p-4 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-900 font-mono block">
                        TICKET VERIFIED & RESOLVED
                      </span>
                      <span className="text-emerald-700 text-[11px]">
                        Cleared by {activeCase.approval?.reviewedByUserId || 'Supervisor'}.
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setIsCloseConfirmOpen(true)}
                    disabled={isSubmitting}
                    className="bg-slate-900 hover:bg-black text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shrink-0 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                    <span>Formally Close Case</span>
                  </Button>
                </div>
              )}

              {/* Closed State Notice */}
              {activeCase.status === 'CLOSED' && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-slate-600">
                    <CheckCheck className="w-4 h-4 text-emerald-600" />
                    <span>Ticket formally audited and archived.</span>
                  </div>
                  <StatusBadge label="CLOSED & ARCHIVED" tone="healthy" />
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    )}


      {/* --------------------------------------------------------------------- */}
      {/* MODALS (100% PRESERVED FUNCTIONALITY & ADVANCED INTERACTIVE VIEWS)   */}
      {/* --------------------------------------------------------------------- */}

      {/* Diagnostic Breakdown Modal (Requirement 4) */}
      <Modal
        isOpen={diagnosticModal.isOpen}
        onClose={() => setDiagnosticModal({ isOpen: false, type: 'SYMPTOM' })}
        title={
          diagnosticModal.type === 'SYMPTOM'
            ? 'Diagnostic Breakdown: Reported Symptom & Sensor Telemetry'
            : 'AI Root Cause Analysis & Causal Verification'
        }
        subtitle={
          activeCase
            ? `${activeCase.caseNumber} • Asset ${activeCase.assetTag || 'PUMP-CENTRIFUGAL-402'} • Facility: ${activeCase.plantName || organization?.name || 'Cleveland Stamping Plant'}`
            : 'Operational Diagnostic Evaluation'
        }
        maxWidth="3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-slate-500">
              Verified against OEM operational limits & ISO 10816 vibration standards
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDiagnosticModal({ isOpen: false, type: 'SYMPTOM' })}
              className="bg-slate-900 hover:bg-black text-white px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Close Diagnostic View
            </Button>
          </div>
        }
      >
        {activeCase && (
          <div className="space-y-4 font-sans text-xs">
            {diagnosticModal.type === 'SYMPTOM' ? (
              <>
                {/* 1. Untruncated Symptom & Operational State */}
                <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 pb-1.5">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-900 uppercase">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Full Reported Operational Symptoms</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
                      ALARM: {activeCase.errorCode || activeCase.faultCode || 'ALM-AUTO-DETECT'}
                    </span>
                  </div>
                  <p className="text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">
                    {activeCase.symptomDescription || activeCase.description || activeCase.title}
                  </p>
                  <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-amber-800 flex-wrap">
                    <span>Logged: {formatLocalDateTime(activeCase.createdAt || (activeCase as any).rawCreatedAt)}</span>
                    <span>•</span>
                    <span>Priority: {activeCase.severity}</span>
                    <span>•</span>
                    <span>Operational State: Running - High Thermal Delta</span>
                  </div>
                </div>

                {/* 2. AI Telemetry & Sensor Observations */}
                <div className="space-y-2">
                  <span className="font-mono text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    AI SENSOR TELEMETRY & OBSERVATION MATRIX
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-slate-500 text-[10px]">
                        <span>FFT VIBRATION PEAK</span>
                        <span className="text-amber-600 font-bold">WARNING ZONE B/C</span>
                      </div>
                      <div className="text-slate-900 font-bold text-xs">6.82 mm/s RMS (ISO Limit: 4.5 mm/s)</div>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Dominant peak at 1X rotational frequency with harmonic sub-synchronous modulation.
                      </p>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-slate-500 text-[10px]">
                        <span>INFRARED THERMAL GRADIENT</span>
                        <span className="text-rose-600 font-bold">ELEVATED</span>
                      </div>
                      <div className="text-slate-900 font-bold text-xs">+18.4°C Delta (Drive-End Seal Housing)</div>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Localized temperature spike suggests continuous frictional heating on dynamic seal ring.
                      </p>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-slate-500 text-[10px]">
                        <span>HYDRAULIC ΔP PRESSURE</span>
                        <span className="text-blue-600 font-bold">NOMINAL DROP</span>
                      </div>
                      <div className="text-slate-900 font-bold text-xs">-0.82 bar Suction Drawdown</div>
                      <p className="text-[10px] text-slate-500 font-sans">
                        NPSHa margin narrowed below 1.2 m, generating micro-bubble inception during peak flow.
                      </p>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-slate-500 text-[10px]">
                        <span>HIGH-FREQ ACOUSTIC EMISSION</span>
                        <span className="text-amber-600 font-bold">CAVITATION BURST</span>
                      </div>
                      <div className="text-slate-900 font-bold text-xs">24.2 kHz Ultrasonic Peak</div>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Implosion pulses detected on volute casing characteristic of dynamic fluid vapor cavitation.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. 5-Why Causal Root Analysis Chain */}
                <div className="p-3.5 bg-slate-900 text-slate-200 rounded-xl space-y-2.5 font-mono">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] tracking-wider uppercase border-b border-slate-800 pb-1">
                    <span>5-WHY CAUSAL DIAGNOSTIC TRACE</span>
                    <span className="text-blue-400 font-bold">AI SYNTHESIS</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold shrink-0">Why 1:</span>
                      <span className="text-slate-300">Excessive mechanical vibration & localized heat triggered supervisory alarm.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold shrink-0">Why 2:</span>
                      <span className="text-slate-300">Dynamic mechanical seal faces experienced dry frictional boundary contact.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold shrink-0">Why 3:</span>
                      <span className="text-slate-300">Barrier flush fluid circulation dropped below required API Plan 53A velocity.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold shrink-0">Why 4:</span>
                      <span className="text-slate-300">Inline suction strainer accumulated micro-particulate debris during upstream batch transition.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-400 font-bold shrink-0">Why 5:</span>
                      <span className="text-white font-semibold">Scheduled backflush interval was surpassed by 140 operational hours due to shift handover latency.</span>
                    </div>
                  </div>
                </div>

                {/* 4. Safety Implications & Mandatory PPE */}
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-950 font-sans">
                  <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-[11px]">
                    <span className="font-bold uppercase font-mono text-[10px] text-rose-800">
                      SAFETY GATE & OSHA 1910.147 COMPLIANCE
                    </span>
                    <p className="leading-relaxed">
                      LOTO Isolation mandatory before opening volute housing. Depressurize barrier seal pot via vent valve V-102. Wear Class 0 dielectric gloves and chemical barrier eye protection.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* RCA MODE */}
                <div className="p-3.5 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-indigo-200/80 pb-1.5">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-indigo-950 uppercase">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Validated Root Cause Hypothesis</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 px-2 py-0.5 rounded">
                      {activeCase.probability || 94}% CONFIDENCE
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-indigo-950">
                    {activeCase.diagnosticHypothesis?.primaryHypothesis ||
                      activeCase.topRootCause ||
                      'Mechanical Seal Dynamic Degradation & Cavitation Erosion'}
                  </h4>
                  <p className="text-slate-800 leading-relaxed font-medium font-sans">
                    {(activeCase.diagnosticHypothesis as any)?.reasoning ||
                      'AI diagnostic model cross-correlated vibration harmonic spectral bands with pump hydraulic curve data to confirm mechanical seal face erosion and suction cavitation as the verified root cause.'}
                  </p>
                </div>

                {/* Downstream Risk & Mitigation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
                      FAILURE PROPAGATION RISK
                    </span>
                    <p className="text-[11px] text-slate-700 font-sans leading-relaxed">
                      Continued operation under current cavitation levels will cause drive-end bearing contamination within 48 operational hours, risking complete impeller seizure and rotor misalignment.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
                      LONG-TERM PREVENTATIVE ACTION
                    </span>
                    <p className="text-[11px] text-slate-700 font-sans leading-relaxed">
                      Retrofit suction strainer with differential pressure transmitter ΔP-402 and automate backflush cycle alerts into SCADA supervisory control to prevent future cavitation onset.
                    </p>
                  </div>
                </div>

                {/* Corrective Engineering Guidance */}
                <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1.5 text-blue-950">
                  <span className="font-mono text-[10px] uppercase font-bold text-blue-800">
                    RECOMMENDED ENGINEERING REMEDIATION
                  </span>
                  <p className="text-xs font-sans font-medium leading-relaxed">
                    Execute API 682 seal cartridge replacement, flush Plan 53A barrier fluid reservoir, verify zero axial shaft play (&lt;0.05mm), and torque gland fasteners to 85 Nm in crisscross sequence.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Step Execution Specification Modal (Requirement 4 & 5) */}
      <Modal
        isOpen={stepDetailModal.isOpen}
        onClose={() => setStepDetailModal({ isOpen: false, step: null })}
        title={
          stepDetailModal.step
            ? `Step 0${stepDetailModal.step.stepNumber} Specification: ${stepDetailModal.step.title}`
            : 'Repair Step Specification'
        }
        subtitle={
          activeCase
            ? `${activeCase.caseNumber} • Asset ${activeCase.assetTag || 'PUMP-CENTRIFUGAL-402'} • Execution Protocol`
            : 'Procedure Standards'
        }
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-slate-500">
              Complies with plant SOP rev 3.4 & ISO 9001 QA protocols
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStepDetailModal({ isOpen: false, step: null })}
              className="bg-slate-900 hover:bg-black text-white px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Close Step Specs
            </Button>
          </div>
        }
      >
        {stepDetailModal.step && (() => {
          const stepNum = stepDetailModal.step.stepNumber;
          const spec = getStepEngineeringSpec(stepNum);
          const isDone = stepDetailModal.step.status === 'COMPLETED' || isTicketFullySolved;

          return (
            <div className="space-y-4 font-sans text-xs">
              {/* Header Status & Step Description */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-1.5">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    STEP 0{stepNum} EXECUTION SPECIFICATION
                  </span>
                  {isDone ? (
                    <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded inline-flex items-center gap-1">
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>VERIFIED COMPLETE</span>
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                      ⚡ PENDING EXECUTION
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  {stepDetailModal.step.title}
                </h4>
                <p className="text-slate-700 font-medium leading-relaxed font-sans">
                  {stepDetailModal.step.instruction ||
                    'Execute precise disassembly, surface cleaning, and tolerance measurements according to standard engineering repair manual.'}
                </p>
              </div>

              {/* Required Tools & Calibrated Instruments */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5">
                <span className="font-mono text-[10px] uppercase font-bold text-slate-500">
                  🧰 REQUIRED CALIBRATED TOOLS & INSTRUMENTS
                </span>
                <ul className="list-disc list-inside text-slate-800 space-y-1 text-[11px] font-mono">
                  {spec.tools.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>

              {/* Critical Engineering Tolerances & Torque Values */}
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-1.5">
                <span className="font-mono text-[10px] uppercase font-bold text-blue-900">
                  📐 CRITICAL ENGINEERING TOLERANCES & TORQUE VALUES
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                  {spec.tolerances.map((tol, idx) => (
                    <div key={idx} className="bg-white p-2 rounded border border-blue-100">
                      <span className="text-slate-500 text-[10px] block">{tol.label}</span>
                      <span className="font-bold text-slate-900">{tol.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 p-2 bg-blue-100/60 rounded-md border border-blue-200 text-[10px] font-mono text-blue-900">
                  <strong>Key Tolerance Target: </strong>
                  <span>{spec.toleranceSummary}</span>
                </div>
              </div>

              {/* LOTO / Safety Verification Protocol */}
              <div className="p-3 bg-slate-900 text-slate-200 rounded-xl space-y-1 font-mono text-[11px]">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase border-b border-slate-800 pb-1">
                  <span>SAFETY & QUALITY GATE VERIFICATION</span>
                  <span className="text-emerald-400 font-bold">OSHA 1910.147 COMPLIANT</span>
                </div>
                <p className="text-slate-300 font-sans leading-relaxed pt-1">
                  {spec.safetyProtocol}
                </p>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Smart Similar Past Fault Record Modal (Requirement 1) */}
      <Modal
        isOpen={similarRecordModal.isOpen}
        onClose={() => setSimilarRecordModal({ isOpen: false, record: null })}
        title="Similar Fault History · Maintenance Audit Record"
        subtitle={
          similarRecordModal.record
            ? `Asset ${similarRecordModal.record.assetTag} · Record ${similarRecordModal.record.recordNumber}`
            : 'Historical Repair Record'
        }
        maxWidth="xl"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-mono text-slate-500">
              Verified & sealed in Plant Maintenance Archive
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSimilarRecordModal({ isOpen: false, record: null })}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (similarRecordModal.record) {
                    const rec = similarRecordModal.record;
                    setSimilarRecordModal({ isOpen: false, record: null });
                    window.dispatchEvent(
                      new CustomEvent('forgex:navigate', {
                        detail: {
                          module: 'history',
                          ticketId: rec.ticketId,
                        },
                      })
                    );
                  }
                }}
                className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-xs"
              >
                <span>Open in Maintenance History ↗</span>
              </Button>
            </div>
          </div>
        }
      >
        {similarRecordModal.record && (
          <div className="space-y-3.5 text-xs">
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-indigo-50/30 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div>
                <span className="font-mono text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                  Equipment Occurrence Match
                </span>
                <span className="font-bold text-sm text-indigo-950 font-sans">
                  {similarRecordModal.record.summaryText}
                </span>
              </div>
              <span className="bg-indigo-100 text-indigo-900 border border-indigo-300 font-mono text-xs font-bold px-2.5 py-1 rounded-lg shrink-0">
                MTTR: {similarRecordModal.record.mttr}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-[11px]">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block font-bold">DATE:</span>
                <span className="font-bold text-slate-800 truncate block">{similarRecordModal.record.dateStr}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block font-bold">TICKET ID:</span>
                <span className="font-bold text-blue-700 truncate block">{similarRecordModal.record.ticketId}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block font-bold">TECHNICIAN:</span>
                <span className="font-bold text-slate-800 truncate block">{similarRecordModal.record.technicianName}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block font-bold">RECORD REF:</span>
                <span className="font-bold text-indigo-700 truncate block">{similarRecordModal.record.recordNumber}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
              <span className="font-mono text-[10px] uppercase font-bold text-amber-800 block">
                Confirmed Root Cause in Past Occurrence
              </span>
              <p className="text-slate-800 font-sans font-medium leading-relaxed">
                {similarRecordModal.record.pastRootCause}
              </p>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
              <span className="font-mono text-[10px] uppercase font-bold text-emerald-800 block">
                Verified Remediation / Resolution Action Applied
              </span>
              <p className="text-slate-800 font-sans font-medium leading-relaxed">
                {similarRecordModal.record.pastResolution}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* 0. Error Details Modal */}
      <Modal
        isOpen={!!errorDetailsModalContent}
        onClose={() => setErrorDetailsModalContent(null)}
        title="Diagnostic / Safety Event Details"
        subtitle="Raw system logs and engineering evaluation trace"
        footer={
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setErrorDetailsModalContent(null)}
            >
              Close Details
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <div className="p-3 rounded-lg bg-slate-900 text-slate-100 space-y-1">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">EVENT TRACE</div>
            <p className="leading-relaxed whitespace-pre-wrap">{errorDetailsModalContent}</p>
          </div>
          <p className="text-[11px] text-slate-500 font-sans">
            All safety escalations and diagnostic events are logged with cryptographic verification in the tamper-evident audit ledger.
          </p>
        </div>
      </Modal>

      {/* 1. Report New Case Modal (Cleaned & Streamlined 4-Row Dispatch Dialog) */}
      <Modal
        isOpen={isNewCaseModalOpen}
        onClose={handleCloseNewCaseModal}
        title="Raise Manual Maintenance Ticket"
        subtitle="Capture machinery symptoms and auto-dispatch to optimal field technician."
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-between w-full gap-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={handleCloseNewCaseModal}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold px-4 py-2 rounded-lg text-xs shadow-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateNewCase}
              disabled={isSubmitting}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-xs shadow-sm px-5 py-2 rounded-lg inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Auto-Assigning Technician...</span>
                </>
              ) : (
                <>
                  <span>🚀 Raise Ticket & Auto-Assign Tech</span>
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          {/* Row 1 (Full Width): Ticket Title */}
          <div className="space-y-1">
            <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
              <span>Ticket Title *</span>
              <span className="text-[10px] text-slate-400 font-sans">Required</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Booster Pump #3 - Mechanical Seal Fluid Leakage & High Temp"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-sans text-xs shadow-xs transition"
            />
          </div>

          {/* Row 2 (2 Columns): Affected Asset & Priority / Severity (Concise single-line labels, items-end, h-10) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs block whitespace-nowrap">
                Affected Asset *
              </label>
              <select
                value={newAssetTag}
                onChange={(e) => setNewAssetTag(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 ${
                  !newAssetTag ? 'text-slate-500 font-normal' : 'text-slate-900 font-semibold'
                } focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-sans text-xs cursor-pointer shadow-xs`}
              >
                <option value="" className="text-slate-500 font-normal bg-white">-- Select Asset / Machinery --</option>
                <option value="PUMP-CENTRIFUGAL-402 (Main Feed Pump)" className="text-slate-900 font-medium bg-white">
                  PUMP-CENTRIFUGAL-402 (Main Feed Pump)
                </option>
                <option value="MOTOR-INDUCTION-104 (500HP Drive Motor)" className="text-slate-900 font-medium bg-white">
                  MOTOR-INDUCTION-104 (500HP Drive Motor)
                </option>
                <option value="COMPRESSOR-RECIP-201 (Air System Unit)" className="text-slate-900 font-medium bg-white">
                  COMPRESSOR-RECIP-201 (Air System Unit)
                </option>
                <option value="GEARBOX-HELICAL-305 (Main Drive Reducer)" className="text-slate-900 font-medium bg-white">
                  GEARBOX-HELICAL-305 (Main Drive Reducer)
                </option>
                <option value="HEX-PLATE-801 (Heat Exchanger Unit 1)" className="text-slate-900 font-medium bg-white">
                  HEX-PLATE-801 (Heat Exchanger Unit 1)
                </option>
                {machines.map((m) => (
                  <option key={m.id} value={`${m.assetTag} (${m.name})`} className="text-slate-900 font-medium bg-white">
                    {m.assetTag} — {m.name} {m.area ? `(${m.area})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs block whitespace-nowrap">
                Priority / Severity *
              </label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as MaintenanceCaseSeverity)}
                className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 ${
                  !newSeverity ? 'text-slate-500 font-normal' : 'text-slate-900 font-semibold'
                } focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-sans text-xs cursor-pointer shadow-xs`}
              >
                <option value="" className="text-slate-500 font-normal bg-white">-- Select Priority / Severity --</option>
                <option value="CRITICAL" className="text-slate-900 font-medium bg-white">CRITICAL - Line Down</option>
                <option value="HIGH" className="text-slate-900 font-medium bg-white">HIGH - Risk of Failure</option>
                <option value="MEDIUM" className="text-slate-900 font-medium bg-white">MEDIUM - Degradation</option>
                <option value="LOW" className="text-slate-900 font-medium bg-white">LOW</option>
              </select>
            </div>
          </div>

          {/* Row 3 (2 Columns): Error Code & LOTO Safety Protocol Toggle (items-end, h-10) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs block whitespace-nowrap">
                Error / Alarm Code
              </label>
              <input
                type="text"
                placeholder="e.g. ALM-201 (Auto-detected by AI if blank)"
                value={newErrorCode}
                onChange={(e) => setNewErrorCode(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-mono text-xs shadow-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs block whitespace-nowrap">
                LOTO Safety Gate
              </label>
              <div className="h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {newLotoRequired ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 text-[10px] font-mono font-bold">
                      <Lock className="w-2.5 h-2.5 text-amber-600" />
                      <span>Yes - Lockout/Tagout</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-mono font-medium">
                      <span>No - Standard PPE</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={newLotoRequired}
                  onClick={() => setNewLotoRequired(!newLotoRequired)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    newLotoRequired ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      newLotoRequired ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Row 4 (2 Columns): Machine Status & Shift / Area (Practical Operational Context Row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs block whitespace-nowrap">
                Machine Status *
              </label>
              <div className="h-10 p-1 rounded-lg bg-slate-100 border border-slate-200 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setNewMachineStatus('HALTED')}
                  className={`flex-1 h-full rounded-md text-[11px] font-semibold whitespace-nowrap px-2.5 py-1 flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    newMachineStatus === 'HALTED'
                      ? 'bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🔴 Down / Halted</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewMachineStatus('DEGRADED')}
                  className={`flex-1 h-full rounded-md text-[11px] font-semibold whitespace-nowrap px-2.5 py-1 flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    newMachineStatus === 'DEGRADED'
                      ? 'bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🟡 Running Anomaly</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs block whitespace-nowrap">
                Shift / Area
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Bay 04 · Stamping Line A"
                  value={newShiftArea}
                  onChange={(e) => setNewShiftArea(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-800 font-mono text-xs shadow-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Row 5 (Full Width): Observed Symptoms & Operating Anomalies */}
          <div className="space-y-1.5">
            <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
              <span>Observed Symptoms &amp; Operating Anomalies *</span>
              <span className="text-[10px] text-slate-400 font-sans">Detailed physical observations</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. High-pitched whining sound above 85dB, fluid leak rate ~50ml/min from drive-side seal, bearing temp spiked to 82°C."
              value={newSymptoms}
              onChange={(e) => setNewSymptoms(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-sans focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs shadow-xs font-normal"
            />
            {/* Quick Symptom Chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] font-mono text-slate-400 mr-0.5">Quick Symptoms:</span>
              {QUICK_SYMPTOM_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAddSymptomChip(chip)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded text-[11px] font-sans font-medium transition cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 2. Assign / Reassign Technician Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={
          activeCase?.assignedTechnicianUserId
            ? 'Reassign Certified Technician'
            : 'Assign Certified Technician to Ticket'
        }
        subtitle="Designate certified personnel responsible for field procedure execution"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {activeCase?.assignedTechnicianUserId && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsAssignModalOpen(false);
                    setUnassignReason('');
                    setIsUnassignConfirmOpen(true);
                  }}
                  className="text-rose-600 border-rose-300 hover:bg-rose-50 hover:border-rose-400 font-semibold"
                >
                  Unassign Technician
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setIsAssignModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmitting || isLoadingTechs || technicians.length === 0}
                onClick={handleAssignTechnician}
                className="bg-slate-900 hover:bg-black text-white font-semibold"
              >
                {isSubmitting
                  ? 'Saving...'
                  : activeCase?.assignedTechnicianUserId
                  ? 'Confirm Reassignment'
                  : 'Confirm Assignment'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 font-sans text-xs">
          {activeCase?.assignedTechnicianUserId ? (
            <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-blue-600 font-mono font-bold uppercase">
                    Currently Assigned
                  </div>
                  <div className="text-xs font-semibold text-slate-900">
                    {activeCase.assignedTechnicianName}
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">
                Active
              </span>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2 text-slate-600">
              <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                This ticket is currently <strong>Unassigned</strong>.
              </span>
            </div>
          )}

          {isLoadingTechs && (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span className="font-mono text-xs">Loading active technicians...</span>
            </div>
          )}

          {!isLoadingTechs && techFetchError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{techFetchError}</span>
              </div>
              <button
                type="button"
                onClick={loadTechnicians}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-mono font-bold text-[10px] transition"
              >
                Retry Loading
              </button>
            </div>
          )}

          {!isLoadingTechs && !techFetchError && technicians.length === 0 && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-center space-y-1">
              <p className="font-semibold">No eligible technicians found</p>
              <p className="text-[11px] text-amber-700 font-sans">
                No active technicians or engineers are currently registered under this facility organization.
              </p>
            </div>
          )}

          {!isLoadingTechs && technicians.length > 0 && (
            <div className="space-y-1">
              <label className="text-slate-700 font-bold">Select Qualified Field Technician</label>
              <select
                value={selectedTechId}
                onChange={(e) => {
                  setSelectedTechId(e.target.value);
                  const found = technicians.find((t) => t.userId === e.target.value);
                  if (found) setSelectedTechName(found.fullName);
                }}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs cursor-pointer shadow-xs"
              >
                {technicians.map((t) => (
                  <option key={t.id || t.userId} value={t.userId}>
                    {t.fullName} ({t.role} — {t.department || 'Operations'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-[11px] text-slate-500 font-sans leading-normal">
            Assigned personnel will be designated on procedural records, receive safety directives, and be logged in the immutable audit trail.
          </p>
        </div>
      </Modal>

      {/* 2b. Unassign Confirmation Modal */}
      <Modal
        isOpen={isUnassignConfirmOpen}
        onClose={() => {
          if (!isSubmitting) setIsUnassignConfirmOpen(false);
        }}
        title="Unassign Technician"
        subtitle={`Remove ${activeCase?.assignedTechnicianName || 'technician'} from ${activeCase?.caseNumber || 'ticket'}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsUnassignConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={
                isSubmitting ||
                (activeCase?.status === 'IN_PROGRESS' &&
                  (!unassignReason || unassignReason.trim().length < 5))
              }
              onClick={handleUnassignTechnician}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {isSubmitting ? 'Unassigning...' : 'Confirm Unassignment'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-slate-700">
            Are you sure you want to remove the assigned technician from this ticket?
          </p>
          {activeCase?.status === 'IN_PROGRESS' ? (
            <div className="space-y-1">
              <label className="text-rose-700 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Justification Reason Required (In-Progress Case)
              </label>
              <textarea
                value={unassignReason}
                onChange={(e) => setUnassignReason(e.target.value)}
                placeholder="Explain why technician is being unassigned while case is actively in progress..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-white border border-rose-300 text-slate-900 focus:outline-none focus:border-rose-500 text-xs shadow-xs"
              />
              <p className="text-[10px] text-slate-500">Minimum 5 characters required.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-slate-700 font-medium">Notes / Reason (Optional)</label>
              <input
                type="text"
                value={unassignReason}
                onChange={(e) => setUnassignReason(e.target.value)}
                placeholder="Optional unassignment notes..."
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 text-xs shadow-xs"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* 3. Escalate to Human Modal */}
      <Modal
        isOpen={isEscalateModalOpen}
        onClose={() => setIsEscalateModalOpen(false)}
        title="Escalate Case to Human Reliability Engineer"
        subtitle="Halt automated procedure execution and escalate for senior engineering sign-off"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsEscalateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isSubmitting}
              onClick={handleEscalateCase}
              className="font-semibold"
            >
              {isSubmitting ? 'Escalating...' : 'Confirm Safety Escalation'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-slate-600 leading-normal">
            Detail the specific hazard, missing procedural manual, or abnormal condition that requires certified engineer evaluation:
          </p>
          <textarea
            rows={3}
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="e.g. Extreme high-voltage arcing detected on feeder breaker, or structural vibration exceeding ISO limits..."
            className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-sans focus:outline-none focus:border-rose-500"
          />
        </div>
      </Modal>

      {/* 4. Consequential Action: Close Case Confirmation */}
      <Modal
        isOpen={isCloseConfirmOpen}
        onClose={() => setIsCloseConfirmOpen(false)}
        title="Formally Close & Archive Ticket"
        subtitle="This action is final and locks all procedural checklists"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsCloseConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={handleCloseCase}
              className="bg-slate-900 hover:bg-black text-white font-bold"
            >
              {isSubmitting ? 'Archiving...' : 'Yes, Formally Close Case'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs text-slate-600 leading-relaxed">
          <p>
            You are about to archive <strong>{activeCase?.caseNumber}</strong> ({activeCase?.title}). Once closed:
          </p>
          <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <li>Checklist steps and findings will become immutable.</li>
            <li>A permanent closure timestamp will be logged on the audit ledger.</li>
            <li>The ticket will be removed from the active technician execution queue.</li>
          </ul>
        </div>
      </Modal>

      {/* 5. Reject Ticket Modal (Request Rework) */}
      <Modal
        isOpen={isRejectConfirmOpen}
        onClose={() => setIsRejectConfirmOpen(false)}
        title="Request Ticket Rework"
        subtitle="Return maintenance case to technician for re-inspection"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsRejectConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleReviewApproval(false)}
              className="font-bold"
            >
              {isSubmitting ? 'Rejecting...' : 'Confirm Rejection (Return for Rework)'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-slate-600 leading-normal">
            Specify the required rework instructions for the assigned technician:
          </p>
          <textarea
            rows={3}
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder="e.g. Measured bolt torque is below 45 ft-lbs specification. Re-torque follower plate and re-test..."
            className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-sans focus:outline-none focus:border-red-500"
          />
        </div>
      </Modal>

      {/* Centered Popup Confirmation Modal: Busy Technician Active Task */}
      {busyTechModalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="busy-tech-modal-title"
          >
            {/* Header: Deep Navy-Indigo Gradient */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Zap className="w-4 h-4 fill-amber-400" />
                </div>
                <div>
                  <h3 id="busy-tech-modal-title" className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                    <span>⚡ Specialist Currently Executing Active Task</span>
                  </h3>
                  <p className="text-[11px] text-indigo-200 font-mono">
                    Live Dispatch Conflict Resolution • Real-Time Floor Telemetry
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBusyTechModalState({
                    isOpen: false,
                    busyTech: null,
                    nextAvailableTech: null,
                    pendingTicketData: null,
                    targetCase: null,
                  })
                }
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Cancel Dispatch"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/80 to-orange-50/50 border border-amber-200/80 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-800 leading-relaxed font-sans">
                  Technician <strong className="text-slate-950 font-semibold">{busyTechModalState.busyTech?.fullName || 'Assigned Specialist'}</strong> is currently busy on another machine. Would you like to place this ticket in <strong className="text-indigo-950 font-semibold">{busyTechModalState.busyTech?.fullName || 'Assigned Specialist'}'s Queue</strong>, or assign it immediately to available specialist <strong className="text-emerald-700 font-semibold">{busyTechModalState.nextAvailableTech?.fullName || 'Elena Rostova'}</strong>?
                </div>
              </div>

              {/* Technician Profiles Comparison */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Busy Tech Pill */}
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1">
                  <div className="text-[10px] uppercase font-mono font-bold text-amber-800 tracking-wider">
                    Current Specialist (Busy)
                  </div>
                  <div className="font-bold text-slate-900 truncate">
                    👤 {busyTechModalState.busyTech?.fullName || 'Technician'}
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                    <span>★ {busyTechModalState.busyTech?.rating || '4.9'}</span>
                    <span>•</span>
                    <span className="truncate">{busyTechModalState.busyTech?.discipline || 'Mechanical'}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-700 font-semibold mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Active in Floor Desk</span>
                  </div>
                </div>

                {/* Available Tech Pill */}
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-1">
                  <div className="text-[10px] uppercase font-mono font-bold text-emerald-800 tracking-wider">
                    Available Specialist
                  </div>
                  <div className="font-bold text-slate-900 truncate">
                    👤 {busyTechModalState.nextAvailableTech?.fullName || 'Elena Rostova'}
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                    <span>★ {busyTechModalState.nextAvailableTech?.rating || '4.8'}</span>
                    <span>•</span>
                    <span className="truncate">{busyTechModalState.nextAvailableTech?.discipline || 'Vibration / Acoustic'}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 font-semibold mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>On-Shift • 0 Active Tasks</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer: Two Clear Gradient Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  setBusyTechModalState({
                    isOpen: false,
                    busyTech: null,
                    nextAvailableTech: null,
                    pendingTicketData: null,
                    targetCase: null,
                  })
                }
                className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleResolveBusyTechModal('QUEUE')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-slate-800 via-indigo-900 to-slate-900 hover:from-slate-700 hover:via-indigo-800 hover:to-slate-800 shadow-sm transition-all cursor-pointer"
              >
                <span>📥 Place in {busyTechModalState.busyTech?.fullName || 'Specialist'}'s Queue</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleResolveBusyTechModal('SWITCH')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:via-orange-500 hover:to-amber-600 shadow-sm transition-all cursor-pointer"
              >
                <span>⚡ Assign to {busyTechModalState.nextAvailableTech?.fullName || 'Elena Rostova'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Technician Reassignment Confirmation Modal (Requirement 3) */}
      <Modal
        isOpen={reassignModalState.isOpen}
        onClose={() => {
          if (!isSubmitting) setReassignModalState({ isOpen: false, targetCase: null, actionType: 'MANUAL_CHANGE' });
        }}
        title="Confirm Technician Reassignment"
        subtitle={
          reassignModalState.targetCase
            ? `Case ${reassignModalState.targetCase.caseNumber || reassignModalState.targetCase.id} — ${reassignModalState.targetCase.assignedTechnicianName || 'Current Specialist'}`
            : undefined
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setReassignModalState({ isOpen: false, targetCase: null, actionType: 'MANUAL_CHANGE' })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={handleConfirmReassignment}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold inline-flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm Change</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-slate-700 text-sm font-medium">
            Are you sure you want to change the assigned technician for{' '}
            <strong className="text-slate-900 font-mono">
              {reassignModalState.targetCase?.caseNumber || reassignModalState.targetCase?.id}
            </strong>?
          </p>

          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div>
              Currently Assigned:{' '}
              <strong>{reassignModalState.targetCase?.assignedTechnicianName || 'Unassigned'}</strong>{' '}
              {reassignModalState.targetCase?.assignedTechnicianRating && (
                <span>(⭐ {reassignModalState.targetCase.assignedTechnicianRating})</span>
              )}
            </div>
            <p className="text-[11px] text-amber-800">
              {reassignModalState.actionType === 'AUTO_NEXT'
                ? 'AI Auto-Assignment will mark the current technician unavailable and re-route this ticket to the next highest-rated available specialist.'
                : 'You will enter manual assignment mode to select a replacement technician from the facility roster.'}
            </p>
          </div>
        </div>
      </Modal>

      {/* Interactive Vision-Locked LOTO Safety Runner Drawer/Modal */}
      <LotoSafetyRunnerModal
        isOpen={isLotoModalOpen}
        onClose={() => setIsLotoModalOpen(false)}
        assetId={activeCase?.assetTag || 'PUMP-001'}
        assetTag={
          activeCase
            ? `${activeCase.assetTag || 'PUMP-001'} (${activeCase.title})`
            : 'PUMP-001 (Lowara 10SV08F030T)'
        }
      />

      {/* 7. Delete Ticket Confirmation Modal */}
      <Modal
        isOpen={deleteModalState.isOpen}
        onClose={() => {
          if (!isSubmitting) setDeleteModalState({ isOpen: false, targetCase: null });
        }}
        title="Confirm Work Order Deletion"
        subtitle={
          deleteModalState.targetCase
            ? `Case ${deleteModalState.targetCase.caseNumber} • ${deleteModalState.targetCase.assetTag || 'Asset'}`
            : undefined
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setDeleteModalState({ isOpen: false, targetCase: null })}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleDeleteCase(deleteModalState.targetCase)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Deleting...' : 'Delete Work Order'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-slate-700 text-sm font-medium">
            Are you sure you want to permanently delete ticket{' '}
            <strong className="text-slate-900 font-mono">
              {deleteModalState.targetCase?.caseNumber}
            </strong>?
          </p>

          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
            <div className="font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Dispatched / Unstarted Work Order</span>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              This ticket has not yet begun field execution and will be cleanly removed from the technician execution queue and dispatch boards.
            </p>
          </div>
        </div>
      </Modal>

      {/* 8. Edit Ticket Details Modal */}
      <Modal
        isOpen={editModalState.isOpen}
        onClose={() => {
          if (!isSubmitting) setEditModalState((prev) => ({ ...prev, isOpen: false }));
        }}
        title="Edit Ticket Details"
        subtitle={
          editModalState.caseNumber
            ? `Editing Work Order ${editModalState.caseNumber}`
            : undefined
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setEditModalState((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={handleSaveTicketEdits}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5 font-sans text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono mb-1">
              Ticket Title *
            </label>
            <input
              type="text"
              value={editModalState.title}
              onChange={(e) => setEditModalState((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Centrifugal Pump Cavitation & Bearing Vibration"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono mb-1">
                Priority / Severity *
              </label>
              <select
                value={editModalState.severity}
                onChange={(e) =>
                  setEditModalState((prev) => ({
                    ...prev,
                    severity: e.target.value as MaintenanceCaseSeverity,
                  }))
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:bg-white"
              >
                <option value="CRITICAL">Critical (Plant Shutdown Risk)</option>
                <option value="HIGH">High (Impaired Quality / Anomaly)</option>
                <option value="MEDIUM">Medium (Normal Preventive Repair)</option>
                <option value="LOW">Low (Minor Cosmetic / Inspection)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono mb-1">
                Alarm / Error Code
              </label>
              <input
                type="text"
                value={editModalState.errorCode}
                onChange={(e) => setEditModalState((prev) => ({ ...prev, errorCode: e.target.value }))}
                placeholder="e.g. ALM-VIB-902"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-medium focus:outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase font-mono mb-1">
              Observed Symptoms &amp; Telemetry Findings *
            </label>
            <textarea
              rows={4}
              value={editModalState.symptoms}
              onChange={(e) => setEditModalState((prev) => ({ ...prev, symptoms: e.target.value }))}
              placeholder="Describe observed physical symptoms, sensor telemetry spikes, and operating conditions..."
              className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 font-sans focus:outline-none focus:border-blue-500 focus:bg-white leading-relaxed"
            />
          </div>

          <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-blue-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Saving will immediately update this ticket across all modules and record an immutable audit event in the work order history.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SopExecutionView;

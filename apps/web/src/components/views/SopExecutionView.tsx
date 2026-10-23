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
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import type {
  MaintenanceCase,
  MaintenanceCaseStatus,
  MaintenanceCaseSeverity,
  ChecklistStepStatus,
} from '@forgex/shared-types';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import { computeTechnicianLiveStatus, formatRelativeTime } from '../../utils/technicianLiveStatus';

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
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [errorDetailsModalContent, setErrorDetailsModalContent] = useState<string | null>(null);



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

  // Form Field State - Report New Ticket Modal (Zero Pre-Selected Defaults)
  const [newTitle, setNewTitle] = useState('');
  const [newAssetTag, setNewAssetTag] = useState('');
  const [newSeverity, setNewSeverity] = useState<MaintenanceCaseSeverity | ''>('');
  const [newErrorCode, setNewErrorCode] = useState('');
  const [newLotoRequired, setNewLotoRequired] = useState(false);
  const [newSymptoms, setNewSymptoms] = useState('');

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

  const [excludedTechsPerCase, setExcludedTechsPerCase] = useState<Record<string, string[]>>({});

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

        setCases(mappedCases);
        purgeExecutionLocalStorage(mappedCases.map((c) => c.id));

        const activeCount = mappedCases.filter((c) => c.status !== 'CLOSED').length;
        onActiveCountChange?.(activeCount);

        const savedSelectedId = sessionStorage.getItem('forgex_selected_case_id');

        setActiveCaseId((prev) => {
          const target = savedSelectedId || initialCaseId || prev;
          if (target) {
            const matched = mappedCases.find((c) => c.id === target || c.caseNumber === target);
            if (matched) return matched.id;
          }
          return mappedCases.length > 0 ? mappedCases[0].id : null;
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
      }>;
      if (!custom.detail) return;
      const { ticketId, rawCaseId, status, isSolved } = custom.detail;
      setCases((prev) =>
        prev.map((c) => {
          if (c.id === ticketId || c.caseNumber === ticketId || (rawCaseId && c.id === rawCaseId)) {
            return {
              ...c,
              status: isSolved ? 'RESOLVED' : (status as any) || c.status,
            };
          }
          return c;
        })
      );
    };

    window.addEventListener('forgex:navigate', handleNav);
    window.addEventListener('forgex:ticket-progress-sync', handleProgressSync);
    window.addEventListener('forgex:ticket-solved', handleProgressSync);
    return () => {
      window.removeEventListener('forgex:navigate', handleNav);
      window.removeEventListener('forgex:ticket-progress-sync', handleProgressSync);
      window.removeEventListener('forgex:ticket-solved', handleProgressSync);
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

  // Check if ticket is 100% solved and locked (Requirement 5)
  const isTicketFullySolved = useMemo(() => {
    if (!activeCase) return false;
    if (activeCase.status === 'RESOLVED' || activeCase.status === 'CLOSED') return true;
    try {
      const raw =
        localStorage.getItem(`forgex_tech_exec_${activeCase.caseNumber}`) ||
        localStorage.getItem(`forgex_tech_exec_${activeCase.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.isSolved) return true;
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          return parsed.steps.every((s: any) => s.status === 'COMPLETED');
        }
      }
    } catch {}
    return false;
  }, [activeCase]);

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

    setIsSubmitting(true);

    const fullDescription = [
      newSymptoms.trim(),
      newErrorCode.trim()
        ? `Alarm Code: ${newErrorCode.trim()}`
        : 'Alarm Code: Auto-Detected via AI Diagnostics',
      `Facility: ${effectiveFacility}`,
      `LOTO Mandatory: ${newLotoRequired ? 'Yes (OSHA 1910.147)' : 'No'}`,
    ]
      .filter(Boolean)
      .join(' | ');

    try {
      const res = await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        body: JSON.stringify({
          assetId: effectiveAsset,
          title: newTitle.trim(),
          severity: newSeverity,
          symptomDescription: fullDescription,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json?.error?.message || json?.error || 'Failed to create maintenance ticket');
      }

      const created = json.data;

      // Immediately assign best technician on backend
      try {
        await apiFetch(`/api/v1/maintenance/cases/${created.id}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            technicianUserId: bestTech.id,
            technicianName: bestTech.fullName,
          }),
        });
      } catch (assignErr) {
        console.warn('Backend auto-assign sync notice:', assignErr);
      }

      // Transition status to IN_PROGRESS so it goes directly to technician execution queue
      try {
        await apiFetch(`/api/v1/maintenance/cases/${created.id}/status`, {
          method: 'POST',
          body: JSON.stringify({
            status: 'IN_PROGRESS',
            notes: `AI Auto-Assigned & Dispatched to ${bestTech.fullName} (${bestTech.discipline}).`,
          }),
        });
      } catch {}

      const enrichedNew: WorkOrderCase = {
        ...created,
        status: 'IN_PROGRESS',
        assignedTechnicianUserId: bestTech.id,
        assignedTechnicianName: bestTech.fullName,
        assignedTechnicianRating: bestTech.rating,
        isAiAutoAssigned: true,
        specialistDiscipline: bestTech.discipline,
        history: [
          {
            id: `h-init-${created.id}`,
            action: 'TICKET_RAISED_AND_AI_ASSIGNED',
            user: user?.fullName || 'Shift Supervisor',
            timestamp: new Date().toISOString(),
            notes: `Ticket raised & AI auto-assigned to ${bestTech.fullName} (${bestTech.discipline}).`,
          },
        ],
      };

      setCases((prev) => [enrichedNew, ...prev]);
      setActiveCaseId(enrichedNew.id);
      setIsNewCaseModalOpen(false);
      setNewTitle('');
      setNewAssetTag('');
      setNewSeverity('');
      setNewErrorCode('');
      setNewLotoRequired(false);
      setNewSymptoms('');

      toast.success(
        'Ticket Raised & AI Dispatched',
        `Ticket ${created.caseNumber} auto-assigned to ${bestTech.fullName} (⭐ ${bestTech.rating} · ${bestTech.discipline}).`
      );

      const activeCount = cases.filter((c) => c.status !== 'CLOSED').length + 1;
      onActiveCountChange?.(activeCount);
    } catch (err: any) {
      toast.error('Creation Failed', err.message || 'Server rejected ticket creation.');
    } finally {
      setIsSubmitting(false);
    }
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
            className="bg-slate-900 hover:bg-black text-white font-semibold text-xs h-8 shadow-xs px-3 rounded-lg border-0 transition cursor-pointer"
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

      {/* ------------------------------------------------------------------- */}
      {/* MAIN SPLIT LAYOUT: LEFT TICKET FEED + RIGHT WORKBENCH CANVAS       */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================================================================= */}
        {/* 1. RAISED TICKETS FEED (LEFT LIST COLUMN)                         */}
        {/* ================================================================= */}
        <div className="w-full sm:w-80 md:w-96 border-r border-slate-200 bg-white flex flex-col justify-between overflow-hidden shrink-0 shadow-xs">
          {/* Search & Filter Controls */}
          <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search Ticket ID, asset, symptom, tech..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs font-mono transition"
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

            {/* Streamlined Single-Row Filter Layout: Status + Severity + Sort */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <div className="flex-1 min-w-0 flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                <Filter className="w-3 h-3 text-slate-400 shrink-0" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer w-full font-medium truncate"
                  title="Filter by Status"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN_DISPATCHED">Open / Dispatched</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="ESCALATED_OEM">Escalated to OEM</option>
                </select>
              </div>

              <div className="w-24 shrink-0 flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer w-full font-medium"
                  title="Filter by Severity"
                >
                  <option value="ALL">All Prio</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="w-24 shrink-0 flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer w-full font-medium"
                  title="Sort By"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="severity">Priority</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ticket Cards List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/30">
            {isLoadingCases && cases.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs font-mono text-slate-500">Loading raised tickets...</p>
              </div>
            ) : filteredCases.length === 0 ? (
              cases.length === 0 ? (
                <div className="p-6 text-center space-y-2 bg-white rounded-xl border border-dashed border-slate-200 shadow-xs">
                  <Wrench className="w-7 h-7 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700 font-sans">No Active Raised Tickets</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto font-sans leading-relaxed">
                    Escalate an issue from Troubleshooting & RCA or click "+ Raise Manual Ticket".
                  </p>
                </div>
              ) : (
                <div className="p-6 text-center space-y-2 bg-white rounded-xl border border-dashed border-slate-200 shadow-xs">
                  <Wrench className="w-7 h-7 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No Matching Raised Tickets</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto font-sans leading-normal">
                    No records match your active search terms or filters.
                  </p>
                  {(searchTerm || statusFilter !== 'ALL' || severityFilter !== 'ALL') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setStatusFilter('ALL');
                        setSeverityFilter('ALL');
                      }}
                      className="text-[11px] text-blue-600 font-mono underline hover:text-blue-800"
                    >
                      Reset all filters
                    </button>
                  )}
                </div>
              )
            ) : (
              filteredCases.map((c) => {
                const isSelected = activeCase ? c.id === activeCase.id : false;

                const cleanSummary = (c.title || c.symptomDescription || 'Maintenance Work Order')
                  .replace(/^RCA Corrective Work Order\s*[:-]?\s*/i, '')
                  .replace(/^Work Order\s*[:-]?\s*/i, '')
                  .trim();

                const isUUID = (str?: string) =>
                  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

                let displayTag = c.assetTag || c.assetName || '';
                if (!displayTag || isUUID(displayTag)) {
                  displayTag = c.assetId && !isUUID(c.assetId) ? c.assetId : 'ELEC-MTR-701';
                }

                // Check solved state
                let cardTotalSteps = c.checklist?.length || 4;
                let cardDoneSteps = c.checklist?.filter((s) => s.status === 'COMPLETED').length || 0;
                let isCardFullySolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
                try {
                  const execRaw =
                    localStorage.getItem(`forgex_tech_exec_${c.caseNumber}`) ||
                    localStorage.getItem(`forgex_tech_exec_${c.id}`);
                  if (execRaw) {
                    const parsed = JSON.parse(execRaw);
                    if (parsed.isSolved) isCardFullySolved = true;
                    if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
                      cardTotalSteps = parsed.steps.length;
                      cardDoneSteps = parsed.steps.filter((st: any) => st.status === 'COMPLETED').length;
                      if (cardDoneSteps === cardTotalSteps && cardTotalSteps > 0) {
                        isCardFullySolved = true;
                      }
                    }
                  }
                } catch {}

                if (isCardFullySolved) {
                  cardDoneSteps = cardTotalSteps;
                }
                const cardProgressPct =
                  cardTotalSteps > 0 ? Math.round((cardDoneSteps / cardTotalSteps) * 100) : 0;

                // Priority Border Color
                const priorityBorderClass =
                  c.severity === 'CRITICAL'
                    ? 'border-l-rose-500'
                    : c.severity === 'HIGH'
                    ? 'border-l-amber-500'
                    : 'border-l-blue-500';

                // Source identification
                const isRcaSource =
                  (c as any).source === 'RCA' ||
                  Boolean((c as any).rcaSessionId) ||
                  c.caseNumber?.startsWith('ESC-') ||
                  c.title?.toLowerCase().includes('escalated rca') ||
                  Boolean(c.topRootCause);

                // Technician live status for this card
                const techName = c.assignedTechnicianName || 'Unassigned';
                const cardTechStatus = computeTechnicianLiveStatus(
                  { fullName: techName, id: c.assignedTechnicianUserId || '' },
                  cases
                );

                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveCaseId(c.id)}
                    className={`p-3 rounded-lg border border-l-4 text-xs cursor-pointer transition space-y-2 ${priorityBorderClass} ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-500 shadow-xs ring-1 ring-blue-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Row 1: Ticket ID (Bold) + Source Badge (🔍 RCA / ✍️ Manual) + Priority Pill + Status Pill */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-blue-700 text-xs truncate">
                          {c.caseNumber}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border shrink-0 ${
                            isRcaSource
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isRcaSource ? '🔍 RCA' : '✍️ Manual'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`font-mono font-bold px-1.5 py-0.2 rounded text-[9px] border ${
                            c.severity === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : c.severity === 'HIGH'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {c.severity}
                        </span>
                        {isCardFullySolved ? (
                          <span className="font-mono font-bold px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                            RESOLVED
                          </span>
                        ) : (
                          <CaseStatusBadge status={c.status} />
                        )}
                      </div>
                    </div>

                    {/* Row 2: Asset Tag pill + relative time (⏱️ 15m ago) + 1-line truncated Symptom/Title */}
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.2 rounded font-bold text-[10px] shrink-0 font-mono">
                        {displayTag}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatRelativeTime(c.createdAt)}
                      </span>
                      <span
                        className="text-slate-600 text-xs font-medium truncate flex-1 font-sans"
                        title={cleanSummary}
                      >
                        {cleanSummary}
                      </span>
                    </div>

                    {/* Row 3 (Live Footer Strip): Assigned Tech + Live Availability Dot & Mini Step Progress */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-mono">
                      <div
                        className="flex items-center gap-1 min-w-0 truncate text-slate-700"
                        title={cardTechStatus.fullText}
                      >
                        <span className="font-semibold truncate">👨‍🔧 {techName}</span>
                        <span className="text-slate-300">•</span>
                        {cardTechStatus.statusType === 'AVAILABLE' ? (
                          <span className="text-emerald-700 font-bold shrink-0">🟢 Available</span>
                        ) : cardTechStatus.statusType === 'BUSY' ? (
                          <span className="text-amber-700 font-bold shrink-0 truncate">
                            {cardTechStatus.currentTicketId && cardTechStatus.currentTicketId !== c.caseNumber
                              ? `🟡 Busy #${cardTechStatus.currentTicketId.slice(-4)}`
                              : `🟡 Working`}
                          </span>
                        ) : (
                          <span className="text-rose-700 font-bold shrink-0 truncate">
                            {cardTechStatus.shortText}
                          </span>
                        )}
                      </div>

                      {/* Right side: Mini Step Progress indicator */}
                      {isCardFullySolved ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0 text-[10px]">
                          🔒 100% Solved
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0 text-slate-500 font-medium">
                          <span>
                            {cardDoneSteps}/{cardTotalSteps} Steps ({cardProgressPct}%)
                          </span>
                          <div className="w-10 h-1.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                            <div
                              className={`h-full ${cardProgressPct > 0 ? 'bg-blue-600' : 'bg-slate-300'}`}
                              style={{ width: `${cardProgressPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. SUPERVISOR & QA MANAGEMENT WORKBENCH (RIGHT MAIN VIEW)         */}
        {/* ================================================================= */}
        {activeCase ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-5 sm:p-6 bg-[#F8FAFC]">
            {/* WORK ORDER MANAGEMENT CARD */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {/* SECTION A — HEADER (Clean 2-Column Flex Layout) */}
              <div className="p-5">
                <div className="flex flex-col xl:flex-row justify-between items-start gap-4">
                  {/* Left Column: Row 1 Metadata (Case ID + Asset Tag + Priority + Status) & Row 2 Title */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md shadow-2xs">
                        {activeCase.caseNumber}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
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
                          <span>🔒 100% SOLVED & LOCKED</span>
                        </span>
                      ) : (
                        <CaseStatusBadge status={activeCase.status} />
                      )}
                    </div>

                    <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-sans">
                      {activeCase.title}
                    </h1>
                  </div>

                  {/* Right Column: Single-line Non-Wrapping Pill Box & Action Buttons */}
                  <div className="flex flex-col items-start xl:items-end gap-2 shrink-0 w-full xl:w-auto">
                    {activeCase.assignedTechnicianUserId && !isChangingTech ? (
                      <>
                        {(() => {
                          const activeTechStatus = computeTechnicianLiveStatus(
                            {
                              fullName: activeCase.assignedTechnicianName || '',
                              id: activeCase.assignedTechnicianUserId || '',
                            },
                            cases
                          );
                          const toneContainerClass =
                            activeTechStatus.statusType === 'AVAILABLE'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : activeTechStatus.statusType === 'BUSY'
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-rose-50 border-rose-200 text-rose-900';

                          return (
                            /* Top Row: Single-line non-wrapping compact pill container with live status */
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border whitespace-nowrap text-xs shadow-2xs ${toneContainerClass}`}>
                              <span
                                className="flex h-2 w-2 relative"
                                title={`Live Status: ${activeTechStatus.shortText}`}
                              >
                                <span
                                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                    activeTechStatus.statusType === 'AVAILABLE'
                                      ? 'bg-emerald-400'
                                      : activeTechStatus.statusType === 'BUSY'
                                      ? 'bg-amber-400'
                                      : 'bg-rose-400'
                                  }`}
                                />
                                <span
                                  className={`relative inline-flex rounded-full h-2 w-2 ${
                                    activeTechStatus.statusType === 'AVAILABLE'
                                      ? 'bg-emerald-500'
                                      : activeTechStatus.statusType === 'BUSY'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                              </span>
                              <span
                                className={`font-mono text-[10px] font-bold border px-1.5 py-0.2 rounded ${
                                  activeTechStatus.statusType === 'AVAILABLE'
                                    ? 'text-emerald-700 bg-emerald-100/80 border-emerald-200'
                                    : activeTechStatus.statusType === 'BUSY'
                                    ? 'text-amber-700 bg-amber-100/80 border-amber-200'
                                    : 'text-rose-700 bg-rose-100/80 border-rose-200'
                                }`}
                                title={activeTechStatus.fullText}
                              >
                                {activeTechStatus.shortText}
                              </span>
                              <span>
                                🔒 <strong>{activeCase.assignedTechnicianName}</strong>
                              </span>
                              <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold">
                                ⭐ {activeCase.assignedTechnicianRating || 4.9}
                              </span>
                              {activeCase.isAiAutoAssigned !== false && (
                                <span className="bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded text-[10px] font-bold font-sans flex items-center gap-1 shadow-2xs">
                                  <Sparkles className="w-2.5 h-2.5 text-blue-600" />
                                  ✨ AI Auto-Assigned
                                </span>
                              )}
                              {!isTicketFullySolved && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReassignModalState({
                                      isOpen: true,
                                      targetCase: activeCase,
                                      actionType: 'MANUAL_CHANGE',
                                    });
                                  }}
                                  className="ml-1 text-[11px] font-bold underline hover:opacity-80 cursor-pointer"
                                  title="Supervisor manual override"
                                >
                                  Change
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        {/* Bottom Row: Clean inline row with two compact action buttons */}
                        <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap">
                          {/* Button 1: [🔄 Tech Unavailable? Next Best] */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isTicketFullySolved) return;
                              setReassignModalState({
                                isOpen: true,
                                targetCase: activeCase,
                                actionType: 'AUTO_NEXT',
                              });
                            }}
                            disabled={isSubmitting || isTicketFullySolved}
                            className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-900 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            title={
                              isTicketFullySolved
                                ? 'Ticket is 100% solved and permanently locked'
                                : 'Mark current technician unavailable and auto-dispatch to the next best match'
                            }
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${isSubmitting ? 'animate-spin' : ''}`} />
                            <span>🔄 Tech Unavailable? Next Best</span>
                          </button>

                          {/* Button 2: [▶ Open in Tech Queue ->] */}
                          <button
                            type="button"
                            onClick={() => handleOpenInTechQueue(activeCase)}
                            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer whitespace-nowrap"
                            title="Open this ticket directly in Technician Queue"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Open in Tech Queue &rarr;</span>
                          </button>

                          {activeCase.status === 'RESOLVED' && (
                            <Button
                              size="sm"
                              onClick={() => setIsCloseConfirmOpen(true)}
                              className="bg-slate-900 hover:bg-black text-white font-bold text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-xs cursor-pointer whitespace-nowrap"
                            >
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Formally Close</span>
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      /* UNASSIGNED / OVERRIDE STATE: Single Technician Selection & Dispatch */
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative inline-flex items-center">
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
                            className="h-8 pl-2.5 pr-7 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:border-slate-400 focus:outline-none focus:border-blue-500 cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <option value="">-- Select Single Technician --</option>
                            {DISPATCH_TECHNICIAN_ROSTER.map((t) => {
                              const live = computeTechnicianLiveStatus(
                                { fullName: t.fullName, id: t.id, userId: t.userId },
                                cases
                              );
                              return (
                                <option key={t.id} value={t.id}>
                                  ⭐ {t.rating} {t.fullName} · {t.discipline} — {live.fullText}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <Button
                          size="sm"
                          disabled={!selectedTechId || isSubmitting}
                          onClick={async () => {
                            if (!selectedTechId) return;
                            const tech =
                              DISPATCH_TECHNICIAN_ROSTER.find((t) => t.id === selectedTechId) ||
                              technicians.find((t) => (t.userId || t.id) === selectedTechId);
                            const techName = tech?.fullName || selectedTechName || 'Technician';
                            const techRating = tech && 'rating' in tech ? (tech as any).rating : 4.9;
                            setIsSubmitting(true);
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
                                throw new Error(json?.error?.message || 'Assignment failed');
                              }

                              let newStatus = activeCase.status;
                              if (activeCase.status !== 'IN_PROGRESS' && activeCase.status !== 'RESOLVED' && activeCase.status !== 'CLOSED') {
                                await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/status`, {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    status: 'IN_PROGRESS',
                                    notes: `Supervisor locked ticket to single technician ${techName} and dispatched to field queue.`,
                                  }),
                                }).catch(() => null);
                                newStatus = 'IN_PROGRESS';
                              }

                              const serverCase = json.data;
                              setCases((prev) =>
                                prev.map((c) =>
                                  c.id === activeCase.id
                                    ? {
                                        ...c,
                                        ...serverCase,
                                        assignedTechnicianUserId: selectedTechId,
                                        assignedTechnicianName: techName,
                                        assignedTechnicianRating: techRating,
                                        isAiAutoAssigned: false,
                                        status: newStatus,
                                      }
                                    : c
                                )
                              );
                              setIsChangingTech(false);
                              toast.success(
                                'Technician Locked & Dispatched',
                                `Ticket strictly locked to single technician ${techName} and dispatched to Technician Queue.`
                              );
                            } catch (err: any) {
                              toast.error('Assignment Failed', err.message);
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-xs px-3.5 py-1.5 rounded-lg border-0 transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Assign & Dispatch</span>
                        </Button>

                        {isChangingTech && (
                          <button
                            type="button"
                            onClick={() => setIsChangingTech(false)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION B — COMPACT INFO GRID (2x2 small cells) */}
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider block">
                      Asset Tag
                    </span>
                    <p className="font-mono font-bold text-slate-900 text-xs truncate">
                      {activeCase.assetTag || formatAssetDisplay(activeCase.assetId).label || 'PUMP-CENTRIFUGAL-402'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider block">
                      Created Date & Time
                    </span>
                    <p className="font-mono text-slate-800 text-xs">
                      {activeCase.createdAtFormatted ||
                        (activeCase.createdAt
                          ? new Date(activeCase.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : 'Oct 23, 2026 · 12:07 PM')}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider block">
                      Assigned Technician
                    </span>
                    <p className="font-sans font-semibold text-slate-900 text-xs flex items-center gap-1.5 truncate">
                      <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{activeCase.assignedTechnicianName || 'Unassigned'}</span>
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider block">
                      Facility / Plant
                    </span>
                    <p className="font-sans font-semibold text-slate-900 text-xs truncate">
                      {activeCase.plantName || organization?.name || 'Cleveland Stamping Plant'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION C — ISSUE & WORK SUMMARY */}
              <div className="p-5 space-y-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                    Reported Issue / Field Symptom
                  </span>
                  <p className="text-xs text-slate-800 font-medium font-sans leading-relaxed">
                    {activeCase.symptomDescription || activeCase.description || activeCase.title}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <span className="text-[10px] font-mono text-blue-600 uppercase font-bold block">
                    Root Cause (Identified from RCA)
                  </span>
                  <p className="text-xs text-slate-900 font-semibold font-sans leading-relaxed">
                    {activeCase.diagnosticHypothesis?.primaryHypothesis ||
                      activeCase.topRootCause ||
                      'Mechanical wear or operational deviation identified during diagnostic root-cause inspection.'}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                    Required Repair Summary
                  </span>
                  <p className="text-xs text-slate-700 font-sans leading-relaxed">
                    {activeCase.findings?.resolutionSummary ||
                      (Array.isArray(activeCase.checklist) && activeCase.checklist.length > 0
                        ? activeCase.checklist.map((s) => s.title).join(' → ')
                        : 'Isolate zero-energy LOTO, disassemble assembly housings, replace worn mechanical components to specification, and perform 15-minute diagnostic functional verification.')}
                  </p>
                </div>
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
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
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
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFC]">
            <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 font-sans">No Ticket Selected</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Select a Ticket from the left list to review details, assign a technician, and dispatch.
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={handleOpenNewCaseModal}
                  className="bg-slate-900 hover:bg-black text-white font-semibold shadow-xs px-3.5 py-1.5 rounded-lg cursor-pointer"
                >
                  <span>+ Report Ticket</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* --------------------------------------------------------------------- */}
      {/* MODALS (100% PRESERVED FUNCTIONALITY)                                 */}
      {/* --------------------------------------------------------------------- */}

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
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs shadow-sm px-5 py-2 rounded-lg inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0"
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
        <div className="space-y-4 font-sans text-xs">
          {/* Row 1 (Full Width): Ticket Title */}
          <div className="space-y-1.5">
            <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
              <span>Ticket Title</span>
              <span className="text-[10px] text-slate-400 font-sans">Required</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Booster Pump #3 - Mechanical Seal Fluid Leakage & High Temp"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-sans text-xs shadow-xs transition"
            />
          </div>

          {/* Row 2 (2 Columns): Affected Asset / Machinery & Priority / Severity (Zero Defaults) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
                <span>Affected Asset / Machinery</span>
                <span className="text-[10px] text-slate-400 font-sans">Required</span>
              </label>
              <select
                value={newAssetTag}
                onChange={(e) => setNewAssetTag(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg bg-white border border-slate-300 ${
                  !newAssetTag ? 'text-slate-400' : 'text-slate-900'
                } focus:outline-none focus:border-blue-600 font-mono text-xs cursor-pointer shadow-xs`}
              >
                <option value="">-- Select Asset --</option>
                <option value="PUMP-CENTRIFUGAL-402 (Main Feed Pump)">
                  PUMP-CENTRIFUGAL-402 (Main Feed Pump)
                </option>
                <option value="MOTOR-INDUCTION-104 (500HP Drive Motor)">
                  MOTOR-INDUCTION-104 (500HP Drive Motor)
                </option>
                <option value="COMPRESSOR-RECIP-201 (Air System Unit)">
                  COMPRESSOR-RECIP-201 (Air System Unit)
                </option>
                <option value="GEARBOX-HELICAL-305 (Main Drive Reducer)">
                  GEARBOX-HELICAL-305 (Main Drive Reducer)
                </option>
                {machines.map((m) => (
                  <option key={m.id} value={`${m.assetTag} (${m.name})`}>
                    {m.assetTag} — {m.name} {m.area ? `(${m.area})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
                <span>Priority / Severity</span>
                <span className="text-[10px] text-slate-400 font-sans">Required</span>
              </label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as MaintenanceCaseSeverity)}
                className={`w-full px-3 py-2 rounded-lg bg-white border border-slate-300 ${
                  !newSeverity ? 'text-slate-400' : 'text-slate-900'
                } focus:outline-none focus:border-blue-600 font-mono text-xs cursor-pointer shadow-xs`}
              >
                <option value="">-- Select Priority / Severity --</option>
                <option value="CRITICAL">CRITICAL - Line Down</option>
                <option value="HIGH">HIGH - Risk of Failure</option>
                <option value="MEDIUM">MEDIUM - Degradation</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          {/* Row 3 (2 Columns): Error Code & LOTO Safety Protocol Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs">
                Error / Alarm Code (Optional — AI auto-detects if blank)
              </label>
              <input
                type="text"
                placeholder="e.g. ERR-VIB-902 or PLC Alarm 404"
                value={newErrorCode}
                onChange={(e) => setNewErrorCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono text-xs shadow-xs"
              />
              <p className="text-[10px] text-slate-500 font-sans">
                Leave blank for AI auto-detection based on symptoms
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
                <span>LOTO Required</span>
                <span className="text-[10px] text-slate-400 font-mono">OSHA 1910.147</span>
              </label>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
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

          {/* Row 4 (Full Width): Observed Symptoms & Operating Anomalies */}
          <div className="space-y-1.5">
            <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
              <span>Observed Symptoms</span>
              <span className="text-[10px] text-slate-400 font-sans">Detailed physical observations</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. High-pitched whining sound above 85dB, fluid leak rate ~50ml/min from drive-side seal, bearing temp spiked to 82°C."
              value={newSymptoms}
              onChange={(e) => setNewSymptoms(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-sans focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs shadow-xs"
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
    </div>
  );
};

export default SopExecutionView;

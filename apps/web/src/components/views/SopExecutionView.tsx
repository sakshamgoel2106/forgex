import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Send,
  BookOpen,
  UserCheck,
  History,
  Lock,
  UserPlus,
  CheckCheck,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  X,
  Clock,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  Archive,
  RotateCcw,
  UserX,
  FilePlus,
  UploadCloud,
  FileSpreadsheet,
  FileAudio,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
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
}

const getStatusTone = (status: MaintenanceCaseStatus): 'healthy' | 'warning' | 'critical' | 'neutral' => {
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
  if (!assetId) return { label: 'Asset #UNASSIGNED', full: '', isTruncated: false };
  const cleaned = assetId.trim();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned) ||
    cleaned.length > 16;

  if (isUuid) {
    const segments = cleaned.split('-');
    const lastSeg = segments[segments.length - 1] || cleaned;
    const shortCode = lastSeg.slice(-4).toUpperCase();
    return {
      label: `Asset #${shortCode}`,
      full: cleaned,
      isTruncated: true,
    };
  }

  return {
    label: cleaned.toUpperCase().startsWith('ASSET #')
      ? cleaned.toUpperCase()
      : `Asset #${cleaned.toUpperCase()}`,
    full: cleaned,
    isTruncated: false,
  };
};

const AssetBadge: React.FC<{ assetId?: string | null; className?: string }> = ({
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
  const [activeCaseId, setActiveCaseId] = useState<string>(initialCaseId || '');
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [errorDetailsModalContent, setErrorDetailsModalContent] = useState<string | null>(null);

  // Frontline View & Safety Controls State
  const [isLotoConfirmed, setIsLotoConfirmed] = useState<boolean>(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

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

  // Form Field State - Report New Work Order Modal
  const [newTitle, setNewTitle] = useState('');
  const [newFacility, setNewFacility] = useState('ForgeX Demo Factory - Line 2 (Bay B)');
  const [newAssetTag, setNewAssetTag] = useState('PUMP-CENTRIFUGAL-402 (Main Feed Pump)');
  const [newMaintenanceType, setNewMaintenanceType] = useState('Corrective Breakdown');
  const [newSeverity, setNewSeverity] = useState<MaintenanceCaseSeverity>('HIGH');
  const [newErrorCode, setNewErrorCode] = useState('');
  const [newLotoRequired, setNewLotoRequired] = useState(true);
  const [newSymptoms, setNewSymptoms] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ name: string; size: string; type: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesToAdd = Array.from(e.dataTransfer.files).map((f) => ({
        name: f.name,
        size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
        type: f.type || 'document',
      }));
      setAttachedFiles((prev) => [...prev, ...filesToAdd]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesToAdd = Array.from(e.target.files).map((f) => ({
        name: f.name,
        size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
        type: f.type || 'document',
      }));
      setAttachedFiles((prev) => [...prev, ...filesToAdd]);
    }
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const [escalateReason, setEscalateReason] = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [findingsText, setFindingsText] = useState('');
  const [measuredTorque, setMeasuredTorque] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunningDiagnosis, setIsRunningDiagnosis] = useState(false);

  // Dropdown Options loaded from Real APIs
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [selectedTechName, setSelectedTechName] = useState<string>('');
  const [isLoadingTechs, setIsLoadingTechs] = useState(false);
  const [techFetchError, setTechFetchError] = useState<string | null>(null);

  // 1. Fetch Real Work Orders from Backend API
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

          return {
            ...c,
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

        setCases(mappedCases);

        const activeCount = mappedCases.filter((c) => c.status !== 'CLOSED').length;
        onActiveCountChange?.(activeCount);

        setActiveCaseId((prev) => {
          if (initialCaseId && mappedCases.some((c) => c.id === initialCaseId)) {
            return initialCaseId;
          }
          if (prev && mappedCases.some((c) => c.id === prev)) {
            return prev;
          }
          return mappedCases.length > 0 ? mappedCases[0].id : '';
        });
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

  // 2. Fetch Machines for Modal Dropdown
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
        if (mapped.length > 0 && !newAssetTag) {
          setNewAssetTag(mapped[0].assetTag);
        }
      }
    } catch (err) {
      console.warn('Failed to load fleet machines for work orders:', err);
    }
  }, [newAssetTag]);

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
    if (isAssignModalOpen) {
      loadTechnicians();
    }
  }, [isAssignModalOpen, loadTechnicians]);

  // Current active work order
  const activeCase = useMemo(() => {
    return cases.find((c) => c.id === activeCaseId) || cases[0] || null;
  }, [cases, activeCaseId]);

  // Synchronize LOTO safety gate state and clear stale error banner whenever active case changes
  useEffect(() => {
    setDiagnosisError(null);
    if (activeCase?.id) {
      setIsLotoConfirmed(getLocalLotoState(activeCase.id));
    }
  }, [activeCase?.id]);

  // Filtered & Sorted Work Orders
  const filteredCases = useMemo(() => {
    return cases
      .filter((c) => {
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'EXPERT_CANDIDATE') {
            if (!c.candidateForExpertKnowledge) return false;
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


  // 1. Checklist Step Toggle
  const handleToggleStep = async (stepId: string) => {
    if (!activeCase) return;
    const step = activeCase.checklist.find((s) => s.id === stepId);
    if (!step) return;

    const prevStatus = step.status;
    const nextStatus: ChecklistStepStatus = prevStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

    // Immediately persist locally so re-renders or page refreshes never untick it
    saveLocalChecklistState(activeCase.id, stepId, nextStatus);

    const previousCases = [...cases];
    const updatedChecklist = activeCase.checklist.map((s) => {
      if (s.id === stepId) {
        return {
          ...s,
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
          completedByUserId: nextStatus === 'COMPLETED' ? user?.fullName || 'Technician' : null,
        };
      }
      return s;
    });

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      checklist: updatedChecklist,
      status: activeCase.status === 'DIAGNOSED' ? 'IN_PROGRESS' : activeCase.status,
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to update step status');
      }
      toast.info('Step Updated', `Step marked ${nextStatus.toLowerCase()}.`);
    } catch (err: any) {
      // Revert local persistence if network/server rejects update
      saveLocalChecklistState(activeCase.id, stepId, prevStatus);
      setCases(previousCases);
      toast.error('Update Failed', err.message || 'Server rejected step update.');
    }
  };

  // 2. Submit Findings
  const handleSubmitFindings = async () => {
    if (!activeCase || isSubmitting) return;

    if (!findingsText.trim() && !measuredTorque.trim()) {
      toast.error('Validation Error', 'Please enter technician observations or measured values.');
      return;
    }

    setIsSubmitting(true);
    const previousCases = [...cases];

    const findings: {
      observations: string;
      measuredValues?: Record<string, string | number>;
      resolutionSummary: string;
    } = {
      observations: findingsText || 'Maintenance procedure executed per authorized manual.',
      measuredValues: measuredTorque ? { finalTorque: measuredTorque } : undefined,
      resolutionSummary: findingsText || 'Remediation completed. Ready for supervisor sign-off.',
    };

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: 'PENDING_APPROVAL',
      findings,
      approval: {
        status: 'PENDING',
        reviewedByUserId: null,
        reviewedAt: null,
        reviewerNotes: null,
      },
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'WORK_ORDER_SUBMITTED_FOR_APPROVAL',
          user: user?.fullName || 'Field Technician',
          timestamp: new Date().toISOString(),
          notes: 'Submitted procedural findings for supervisor review.',
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/findings`, {
        method: 'POST',
        body: JSON.stringify(findings),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to submit findings');
      }
      toast.success('Findings Submitted', 'Work order submitted for supervisor approval.');
      setFindingsText('');
      setMeasuredTorque('');
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Submission Failed', err.message || 'Server rejected findings submission.');
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

  // 7. Run AI Diagnosis (Triggered via Action Bar or Empty State CTA)
  const handleRunAiDiagnosis = async (caseId?: string) => {
    const targetId = caseId || activeCase?.id;
    if (!targetId || isRunningDiagnosis) return;

    const targetCase = cases.find((c) => c.id === targetId) || activeCase;
    const queryPayload =
      targetCase?.symptomDescription ||
      targetCase?.title ||
      'Diagnostic investigation for equipment symptoms';

    setIsRunningDiagnosis(true);
    setDiagnosisError(null);
    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${targetId}/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryPayload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json?.error?.message || json?.error || 'Failed to generate AI diagnosis');
      }

      // Explicitly clear any error state upon receiving a successful 2xx API response
      setDiagnosisError(null);

      const diagnosed = json.data;
      setCases((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? {
                ...c,
                ...diagnosed,
                history:
                  Array.isArray(diagnosed.history) && diagnosed.history.length > 0
                    ? diagnosed.history
                    : [
                        ...c.history,
                        {
                          id: `hist-diag-${Date.now()}`,
                          action: 'AI_DIAGNOSIS_GENERATED',
                          user: 'ForgeX Multimodal AI',
                          timestamp: new Date().toISOString(),
                          notes: 'Automated synthesis of grounded repair SOP and safety directives.',
                        },
                      ],
              }
            : c
        )
      );

      toast.success(
        'AI Diagnosis Generated',
        'Evidence-backed procedural checklist and safety directives ready.'
      );
    } catch (err: any) {
      const errorMsg = err.message || 'AI diagnostic engine could not synthesize repair SOP.';
      setDiagnosisError(errorMsg);
      toast.error('Diagnosis Notice', errorMsg);
    } finally {
      setIsRunningDiagnosis(false);
    }
  };

  // 8. Create New Work Order with Real Machine Link & Automated Diagnosis
  const handleCreateNewCase = async () => {
    if (!newTitle.trim() || !newSymptoms.trim()) {
      toast.error('Validation Error', 'Case title and symptom description are required.');
      return;
    }

    const rawAsset = newAssetTag.trim();
    const effectiveAsset = rawAsset.includes(' ') ? rawAsset.split(' ')[0] : rawAsset || 'PUMP-CENTRIFUGAL-402';
    setIsSubmitting(true);

    const fullDescription = [
      newSymptoms.trim(),
      newErrorCode ? `Alarm Code: ${newErrorCode.trim()}` : null,
      `Facility: ${newFacility}`,
      `Maintenance Type: ${newMaintenanceType}`,
      `LOTO Mandatory: ${newLotoRequired ? 'Yes (OSHA 1910.147)' : 'No'}`,
      attachedFiles.length > 0 ? `Evidence Attachments: ${attachedFiles.map((f) => f.name).join(', ')}` : null,
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
        throw new Error(json?.error?.message || json?.error || 'Failed to create maintenance case');
      }

      const created = json.data;
      toast.success(
        'Case Registered',
        `Case ${created.caseNumber} created. Requesting automated diagnostic checklist...`
      );

      let diagnosedCase = created;
      try {
        const diagRes = await apiFetch(`/api/v1/maintenance/cases/${created.id}/diagnose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: fullDescription }),
        });
        const diagJson = await diagRes.json();
        if (diagRes.ok && diagJson.success && diagJson.data) {
          diagnosedCase = diagJson.data;
          setDiagnosisError(null);
          toast.success('Diagnosis Ready', 'Evidence-backed checklist & safety directives generated.');
        }
      } catch (diagErr) {
        console.warn('Diagnosis generation deferred or escalated:', diagErr);
      }

      const enrichedNew: WorkOrderCase = {
        ...diagnosedCase,
        history: diagnosedCase.history || [
          {
            id: `h-init-${diagnosedCase.id}`,
            action: 'CASE_REPORTED',
            user: user?.fullName || 'Technician',
            timestamp: new Date().toISOString(),
            notes: `Work order created for ${effectiveAsset}.`,
          },
        ],
      };

      setCases((prev) => [enrichedNew, ...prev]);
      setActiveCaseId(enrichedNew.id);
      setIsNewCaseModalOpen(false);
      setNewTitle('');
      setNewSymptoms('');
      setNewErrorCode('');
      setAttachedFiles([]);

      const activeCount = cases.filter((c) => c.status !== 'CLOSED').length + 1;
      onActiveCountChange?.(activeCount);
    } catch (err: any) {
      toast.error('Creation Failed', err.message || 'Server rejected case creation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Progress metrics for checklist
  const totalSteps = activeCase?.checklist?.length || 0;
  const completedSteps = activeCase?.checklist?.filter((s) => s.status === 'COMPLETED').length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Timeline helper icon mapper
  const getTimelineIcon = (action: string) => {
    switch (action) {
      case 'CASE_REPORTED':
        return <FilePlus className="w-3.5 h-3.5 text-blue-600" />;
      case 'AI_DIAGNOSIS_GENERATED':
      case 'DIAGNOSIS_COMPLETED':
        return <Sparkles className="w-3.5 h-3.5 text-purple-600" />;
      case 'TECHNICIAN_ASSIGNED':
      case 'TECHNICIAN_REASSIGNED':
        return <UserCheck className="w-3.5 h-3.5 text-indigo-600" />;
      case 'TECHNICIAN_UNASSIGNED':
        return <UserX className="w-3.5 h-3.5 text-amber-600" />;
      case 'STEP_COMPLETED':
      case 'STEP_UPDATED':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      case 'WORK_ORDER_SUBMITTED_FOR_APPROVAL':
        return <Send className="w-3.5 h-3.5 text-amber-600" />;
      case 'WORK_ORDER_APPROVED':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />;
      case 'WORK_ORDER_REJECTED':
        return <RotateCcw className="w-3.5 h-3.5 text-rose-600" />;
      case 'CASE_ESCALATED_TO_HUMAN':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />;
      case 'CASE_CLOSED':
        return <Archive className="w-3.5 h-3.5 text-slate-600" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-[#F8FAFC] text-slate-900 font-sans antialiased">
      {/* ------------------------------------------------------------------- */}
      {/* 1. TOP SINGLE ACTION HEADER (NO DUPLICATE BADGES, NO "+ +" TEXT)    */}
      {/* ------------------------------------------------------------------- */}
      <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-3 text-xs shadow-xs shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <Wrench className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 tracking-tight text-xs">
                WORK ORDER EXECUTION
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-mono text-blue-600 font-bold text-xs">
                {activeCase ? activeCase.caseNumber : 'ACTIVE QUEUE'}
              </span>
              <span className="sr-only">INTERACTIVE PROCEDURE RUNNER</span>
            </div>
            <p className="text-[11px] text-slate-500 font-sans leading-none mt-0.5">
              Facility: <strong>{organization?.name || 'Authorized Plant'}</strong> · OSHA 1910.147 verified procedures
            </p>
          </div>
        </div>

        {/* Top Action Buttons (Strictly "+ Report Work Order" with no duplicate plus icon) */}
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
            onClick={() => setIsNewCaseModalOpen(true)}
            className="bg-slate-900 hover:bg-black text-white font-semibold text-xs h-8 shadow-xs px-3 rounded-lg border-0 transition cursor-pointer"
          >
            <span>+ Report Work Order</span>
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
      {/* MAIN SPLIT LAYOUT: LEFT WORK ORDER FEED + RIGHT WORKBENCH CANVAS   */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================================================================= */}
        {/* 1. WORK ORDER FEED (LEFT LIST COLUMN)                             */}
        {/* ================================================================= */}
        <div className="w-full sm:w-80 md:w-96 border-r border-slate-200 bg-white flex flex-col justify-between overflow-hidden shrink-0 shadow-xs">
          {/* Search & Filter Controls */}
          <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search WO#, asset, symptom, tech..."
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

            {/* Severity & Sort Dropdowns */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="flex-1 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                <Filter className="w-3 h-3 text-slate-400" />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer w-full font-medium"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="flex-1 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs">
                <ArrowUpDown className="w-3 h-3 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-[11px] text-slate-700 outline-none cursor-pointer w-full font-medium"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="severity">Priority Rank</option>
                </select>
              </div>
            </div>

            {/* Status Filter Chips */}
            <div className="flex flex-wrap gap-1 pt-1">
              {[
                { key: 'ALL', label: 'All' },
                { key: 'IN_PROGRESS', label: 'In Progress' },
                { key: 'PENDING_APPROVAL', label: 'Pending Review' },
                { key: 'RESOLVED', label: 'Resolved' },
                { key: 'CLOSED', label: 'Closed' },
                { key: 'ESCALATED_HUMAN', label: 'Escalated' },
                { key: 'EXPERT_CANDIDATE', label: '⭐ Candidates' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition border ${
                    statusFilter === f.key
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Cards List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/30">
            {isLoadingCases && cases.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs font-mono text-slate-500">Loading work orders...</p>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="p-6 text-center space-y-2 bg-white rounded-xl border border-dashed border-slate-200 shadow-xs">
                <Wrench className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No Matching Work Orders</p>
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
            ) : (
              filteredCases.map((c) => {
                const isSelected = activeCase ? c.id === activeCase.id : false;
                const formattedDt =
                  c.createdAtFormatted ||
                  (c.createdAt
                    ? new Date(c.createdAt).toLocaleString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '22 Oct 2026, 09:25 PM');
                const hasLoto =
                  Boolean(c.lotoApplied) ||
                  String(c.description || '').includes('LOTO: YES') ||
                  String(c.symptomDescription || '').includes('LOTO: Energy Isolated') ||
                  String(c.description || '').includes('Energy Isolated');
                const topCause = c.topRootCause || c.diagnosticHypothesis?.primaryHypothesis;
                const prob = c.probability ?? (c.diagnosticHypothesis?.confidence === 'HIGH' ? 90 : c.diagnosticHypothesis?.confidence === 'MEDIUM' ? 70 : undefined);

                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveCaseId(c.id)}
                    className={`p-3.5 rounded-lg border text-xs font-mono cursor-pointer transition space-y-2.5 ${
                      isSelected
                        ? 'bg-blue-50/50 border-blue-500 shadow-xs ring-1 ring-blue-500/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Top Bar: Case ID, Exact Date & Time, Priority */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#2563EB]">{c.caseNumber}</span>
                        <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                          {formattedDt}
                        </span>
                      </div>
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded text-[10px] border shrink-0 ${
                          c.severity === 'CRITICAL'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : c.severity === 'HIGH'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {c.severity}
                      </span>
                    </div>

                    {/* Machine Tag & Name + Fault Code */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-gray-100 text-gray-900 border border-gray-200 px-1.5 py-0.5 rounded font-bold font-mono text-[10px]">
                        {c.assetTag || c.assetId}
                      </span>
                      <span className="text-gray-700 font-semibold text-xs truncate max-w-[190px]" title={c.assetName || c.title}>
                        {c.assetName || c.title}
                      </span>
                      {c.faultCode && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {c.faultCode}
                        </span>
                      )}
                    </div>

                    {/* Reported Symptom / Issue */}
                    <div className="text-[11px] text-[#475569] font-sans line-clamp-2 leading-relaxed bg-gray-50/70 p-2 rounded border border-gray-100">
                      <span className="text-[9px] font-bold font-mono text-gray-400 uppercase block mb-0.5">Symptom / Field Issue</span>
                      {c.symptomDescription || c.description || c.title}
                    </div>

                    {/* Suspected Root Cause (if present) */}
                    {topCause && (
                      <div className="text-[11px] text-blue-900 bg-blue-50/70 border border-blue-100 rounded p-1.5 leading-snug">
                        <span className="text-[9px] font-bold font-mono uppercase text-blue-600 block">Suspected Root Cause</span>
                        <span className="font-semibold">{topCause}</span>
                        {prob && (
                          <span className="ml-1 text-[10px] font-mono font-bold text-blue-700">({prob}%)</span>
                        )}
                      </div>
                    )}

                    {/* Footer: LOTO Status, Specialist / Assigned Tech, Status */}
                    <div className="flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-gray-100 text-gray-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {hasLoto ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100/70 text-red-800 font-bold text-[9px] border border-red-200">
                            <ShieldAlert className="w-2.5 h-2.5 text-red-600" />
                            LOTO APPLIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[9px] border border-emerald-200">
                            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                            LIVE / ISOLATED
                          </span>
                        )}
                        <span className="text-gray-500 truncate max-w-[110px]" title={c.specialistDiscipline || c.assignedTechnicianName || 'Specialist'}>
                          {c.specialistDiscipline || c.assignedTechnicianName || 'Specialist'}
                        </span>
                      </div>
                      <StatusBadge label={c.status} tone={getStatusTone(c.status)} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. MAIN WORKBENCH CANVAS (RIGHT MAIN VIEW)                        */}
        {/* ================================================================= */}
        {activeCase ? (
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto p-5 sm:p-6 space-y-4 bg-[#F8FAFC]">
            {/* ------------------------------------------------------------- */}
            {/* HEADER BAR & CONSOLIDATED ACTION BAR                          */}
            {/* ------------------------------------------------------------- */}
            <div className="p-5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-4">
              {/* Title & Action Bar Row */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold tracking-tight text-blue-600">
                      {activeCase.caseNumber}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      ASSET: {activeCase.assetTag || activeCase.assetId}
                    </span>
                    {activeCase.faultCode && (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        FAULT: {activeCase.faultCode}
                      </span>
                    )}
                    <StatusBadge label={activeCase.status} tone={getStatusTone(activeCase.status)} />
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        activeCase.severity === 'CRITICAL'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      PRIORITY: {activeCase.severity}
                    </span>
                    {activeCase.isEscalated && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-mono text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        HUMAN ESCALATION
                      </span>
                    )}
                  </div>

                  <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug tracking-tight font-sans">
                    {activeCase.title}
                  </h1>
                </div>

                {/* Consolidated Action Bar: Primary Blue + Secondary Border + Subtle Text */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {/* Primary Blue Button: "+ Run AI Diagnosis" */}
                  <Button
                    size="sm"
                    onClick={() => handleRunAiDiagnosis(activeCase.id)}
                    disabled={isRunningDiagnosis}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs px-3.5 py-1.5 rounded-lg border-0 transition inline-flex items-center gap-1.5"
                    title="Generate evidence-backed procedural SOP and root cause directives"
                  >
                    {isRunningDiagnosis && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {isRunningDiagnosis
                        ? 'Diagnosing...'
                        : activeCase.diagnosticHypothesis
                        ? 'Re-run AI Diagnosis'
                        : '+ Run AI Diagnosis'}
                    </span>
                  </Button>

                  {/* Secondary Border Button: "Assign Tech" */}
                  {activeCase.status !== 'CLOSED' && activeCase.status !== 'RESOLVED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedTechId(activeCase.assignedTechnicianUserId || '');
                        setSelectedTechName(activeCase.assignedTechnicianName || '');
                        setIsAssignModalOpen(true);
                      }}
                      className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-xs px-3 py-1.5 rounded-lg shadow-xs inline-flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                      <span>{activeCase.assignedTechnicianUserId ? 'Reassign Tech' : 'Assign Tech'}</span>
                    </Button>
                  )}

                  {/* Subtle Text Button: "Escalate to Human" */}
                  {activeCase.status !== 'RESOLVED' &&
                    activeCase.status !== 'CLOSED' &&
                    !activeCase.isEscalated && (
                      <button
                        type="button"
                        onClick={() => setIsEscalateModalOpen(true)}
                        className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 font-medium text-xs px-2.5 py-1.5 rounded-lg transition inline-flex items-center gap-1 focus:outline-none"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Escalate to Human</span>
                      </button>
                    )}

                  {/* Contextual Action: Formally Close Case */}
                  {activeCase.status === 'RESOLVED' && (
                    <Button
                      size="sm"
                      onClick={() => setIsCloseConfirmOpen(true)}
                      className="bg-slate-900 hover:bg-black text-white font-bold text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-xs"
                    >
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Formally Close Case</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Metadata Sub-bar Chips: Case ID, Asset Tag, Creation Date, Assignee */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600">
                {/* Asset Tag Chip with 1-click copy */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 uppercase font-sans">Asset:</span>
                  <AssetBadge assetId={activeCase.assetId} />
                </div>

                <span className="text-slate-300">·</span>

                {/* Creation Date Chip */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Created {new Date(activeCase.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <span className="text-slate-300">·</span>

                {/* Assignee Status Chip */}
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Tech:{' '}
                    <strong className="text-slate-900">
                      {activeCase.assignedTechnicianName || 'Unassigned'}
                    </strong>
                  </span>
                  {activeCase.assignedTechnicianUserId &&
                    activeCase.status !== 'CLOSED' &&
                    activeCase.status !== 'RESOLVED' && (
                      <button
                        onClick={() => {
                          setUnassignReason('');
                          setIsUnassignConfirmOpen(true);
                        }}
                        className="text-[10px] text-rose-600 hover:text-rose-700 underline font-semibold ml-1"
                        title="Unassign technician"
                      >
                        Unassign
                      </button>
                    )}
                </div>

                <span className="text-gray-300">·</span>

                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    Created: <strong className="text-gray-800">{activeCase.createdAtFormatted || (activeCase.createdAt ? new Date(activeCase.createdAt).toLocaleString() : '22 Oct 2026, 09:25 PM')}</strong>
                  </span>
                </div>

                {activeCase.plantName && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>Plant: <strong className="text-gray-800">{activeCase.plantName}</strong></span>
                  </>
                )}

                {activeCase.resolvedAt && (
                  <>
                    <span className="text-slate-300">·</span>
                    <div className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Resolved{' '}
                        {new Date(activeCase.resolvedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </>
                )}

                {activeCase.closedAt && (
                  <>
                    <span className="text-slate-300">·</span>
                    <div className="flex items-center gap-1 text-slate-500 font-semibold">
                      <Archive className="w-3.5 h-3.5" />
                      <span>
                        Archived{' '}
                        {new Date(activeCase.closedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Redesigned Modern Alert Banner: Escalation Notice */}
            {activeCase.isEscalated && (
              <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-xs font-mono uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
                      <span>Work Order Escalated to Reliability Engineering</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-800 text-[10px] font-mono font-semibold">
                        SAFETY HALT
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 font-sans leading-relaxed mt-0.5">
                      {activeCase.escalationReason ||
                        'Automated procedure execution suspended. Technical boundary condition requires qualified engineer sign-off.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() =>
                      setErrorDetailsModalContent(
                        activeCase.escalationReason || 'Case escalated for certified engineering review.'
                      )
                    }
                    className="bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-xs h-7 px-2.5 rounded-lg"
                  >
                    View Error Details
                  </Button>
                </div>
              </div>
            )}

            {/* Redesigned Modern Alert Banner: AI Diagnosis Error */}
            {diagnosisError && (
              <div className="p-3.5 rounded-lg bg-rose-50/80 border border-rose-200 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-xs font-mono uppercase tracking-wide text-rose-900">
                      AI Diagnosis Notice
                    </div>
                    <p className="text-xs text-rose-800 font-sans leading-relaxed mt-0.5">
                      {diagnosisError}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => setErrorDetailsModalContent(diagnosisError)}
                    className="bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 font-semibold text-xs h-7 px-2.5 rounded-lg"
                  >
                    View Error Details
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleRunAiDiagnosis()}
                    disabled={isRunningDiagnosis}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs h-7 px-3 rounded-lg shadow-xs inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRunningDiagnosis ? 'animate-spin' : ''}`} />
                    <span>Retry Diagnosis</span>
                  </Button>
                  <button
                    onClick={() => setDiagnosisError(null)}
                    className="text-rose-400 hover:text-rose-700 p-1 rounded"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 1. HARD LOTO SAFETY GATE (MANDATORY NON-NEGOTIABLE CONTROLS) */}
            {/* Moved to the very top in a prominent hazard card              */}
            {/* ------------------------------------------------------------- */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border-2 transition-all duration-200 shadow-sm ${
                isLotoConfirmed
                  ? 'bg-emerald-50/70 border-emerald-500/80 text-emerald-950'
                  : 'bg-rose-50/90 border-rose-500 text-rose-950 ring-4 ring-rose-500/10'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-3 rounded-xl shrink-0 ${
                      isLotoConfirmed
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-rose-600 text-white shadow-md animate-pulse'
                    }`}
                  >
                    <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[10px] sm:text-xs font-black font-mono tracking-wider px-2.5 py-0.5 rounded-full bg-black/10 uppercase">
                        OSHA 1910.147 COMPLIANT
                      </span>
                      <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                        SAFETY-CRITICAL CONTROLS (NON-NEGOTIABLE)
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed max-w-2xl">
                      Hazardous energy isolation required before accessing electrical cabinets or mechanical drive assemblies.
                      Zero Energy State must be verified via physical multi-point meter check and personal safety padlocks attached.
                    </p>

                    {activeCase.diagnosticHypothesis?.safetyCriticalWarnings &&
                      activeCase.diagnosticHypothesis.safetyCriticalWarnings.length > 0 && (
                        <div className="mt-3 p-3.5 bg-white/80 rounded-xl border border-rose-200/80 space-y-1.5">
                          <div className="text-[11px] font-mono font-bold text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-rose-600" />
                            <span>Mandatory Directives For This Asset:</span>
                          </div>
                          <ul className="space-y-1">
                            {activeCase.diagnosticHypothesis.safetyCriticalWarnings.map((warn, i) => (
                              <li key={i} className="text-xs font-mono text-rose-950 flex items-start gap-2">
                                <span className="text-rose-600 font-bold shrink-0">•</span>
                                <span>{warn}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>

                {/* Mandatory Confirmation Checkbox (Touch-Friendly Tablet Target) */}
                <div className="lg:self-center shrink-0 w-full lg:w-auto">
                  <label
                    htmlFor="loto-master-gate"
                    className={`flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 cursor-pointer transition-all select-none shadow-xs ${
                      isLotoConfirmed
                        ? 'bg-emerald-100/90 border-emerald-600 text-emerald-950 font-bold'
                        : 'bg-white border-rose-400 hover:border-rose-600 text-rose-950 hover:bg-rose-50/50'
                    }`}
                  >
                    <input
                      id="loto-master-gate"
                      type="checkbox"
                      checked={isLotoConfirmed}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsLotoConfirmed(checked);
                        saveLocalLotoState(activeCase.id, checked);
                        if (checked) {
                          toast.success(
                            'LOTO Verified',
                            'Zero Energy State confirmed. Troubleshooting checklist unlocked.'
                          );
                        } else {
                          toast.warning(
                            'LOTO Disengaged',
                            'Safety gate active: repair troubleshooting steps locked.'
                          );
                        }
                      }}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border-2 border-slate-400 text-emerald-600 focus:ring-4 focus:ring-emerald-500/20 cursor-pointer transition"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs sm:text-sm font-bold tracking-tight">
                        I confirm Zero Energy State and LOTO is applied.
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {isLotoConfirmed
                          ? '✓ Authorization active — floor procedures unlocked'
                          : '⚠ Mandatory check to unlock troubleshooting steps'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 2. SIMPLIFIED ACTIONABLE DIAGNOSIS (FRONTLINE WORKER VIEW)     */}
            {/* Replaces complex jargon with plain headers; hides hypotheses  */}
            {/* ------------------------------------------------------------- */}
            {activeCase.diagnosticHypothesis && (
              <Card className="border-slate-200 shadow-xs overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 via-slate-50 to-white pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between w-full flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                          Frontline Fault Assessment
                        </CardTitle>
                        <p className="text-xs text-slate-500">
                          Action-oriented summary simplified for floor technicians
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      label={`AI CONFIDENCE: ${activeCase.diagnosticHypothesis.confidence}`}
                      tone={
                        activeCase.diagnosticHypothesis.confidence === 'HIGH'
                          ? 'healthy'
                          : 'warning'
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {/* Frontline Simplified Header */}
                  {(() => {
                    const simplified = simplifyRootCause(activeCase.diagnosticHypothesis.primaryHypothesis);
                    return (
                      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-blue-600 text-white">
                            Primary Issue
                          </span>
                          <span className="text-xs font-mono text-blue-700 font-semibold">
                            Actionable Floor Directive
                          </span>
                        </div>
                        <h4 className="text-base sm:text-lg font-bold text-slate-900 font-sans">
                          {simplified.actionHeader}
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-700 font-sans leading-relaxed">
                          {simplified.actionSummary}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Collapsible Technical Details Accordion */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalDetails((prev) => !prev)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-slate-500" />
                        <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-700">
                          View Technical Details & Engineering Hypotheses
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <span>{showTechnicalDetails ? 'Collapse' : 'Expand'}</span>
                        {showTechnicalDetails ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    {showTechnicalDetails && (
                      <div className="p-4 border-t border-slate-200 space-y-4 bg-white">
                        {/* Raw Engineering Hypothesis */}
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-mono uppercase font-bold text-slate-400">
                            Raw AI Hypothesis & Root Cause Analysis
                          </div>
                          <p className="text-xs font-mono text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                            {activeCase.diagnosticHypothesis.primaryHypothesis}
                          </p>
                        </div>

                        {/* Root Causes List (Hypothesis 1, 2, 3...) */}
                        {activeCase.diagnosticHypothesis.rootCauses &&
                          activeCase.diagnosticHypothesis.rootCauses.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-mono uppercase font-bold text-slate-400">
                                Detailed Engineering Hypotheses
                              </div>
                              <ul className="space-y-2">
                                {activeCase.diagnosticHypothesis.rootCauses.map((r, i) => (
                                  <li
                                    key={i}
                                    className="text-xs font-mono text-slate-700 bg-slate-50/80 px-3 py-2 rounded-lg border border-slate-200/60 flex items-start gap-2.5"
                                  >
                                    <span className="font-bold text-blue-600 shrink-0">
                                      Hypothesis {i + 1}:
                                    </span>
                                    <span className="leading-relaxed">{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        {/* Evidence Citations */}
                        {activeCase.diagnosticHypothesis.evidenceCitations &&
                          activeCase.diagnosticHypothesis.evidenceCitations.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-[10px] font-mono uppercase font-bold text-slate-400">
                                Governing Technical Manual Citations
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {activeCase.diagnosticHypothesis.evidenceCitations.map((cit, i) => (
                                  <div
                                    key={i}
                                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono space-y-1"
                                  >
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="font-bold text-amber-700">
                                        {cit.documentNumber}
                                      </span>
                                      <span className="text-slate-400">Page {cit.pageNumber}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-700 font-sans leading-relaxed italic">
                                      "{cit.snippet}"
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 3. GUIDED EXECUTION CHECKLIST (GATED BY HARD LOTO SAFETY GATE) */}
            {/* Touch-Friendly Tablet Checkboxes & Persistent Progress State  */}
            {/* ------------------------------------------------------------- */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <CardTitle>Guided Execution Checklist</CardTitle>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                  <span>
                    Progress:{' '}
                    <strong className="text-slate-900">
                      {completedSteps} / {totalSteps} Steps Completed
                    </strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span
                    className={`font-bold ${
                      progressPercent === 100 ? 'text-emerald-600' : 'text-blue-600'
                    }`}
                  >
                    {progressPercent}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {/* Visual Progress Bar (When steps exist) */}
                {totalSteps > 0 && (
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        progressPercent === 100
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}

                {/* Hard Safety Lock Gate Barrier: Hide steps until LOTO confirmed */}
                {!isLotoConfirmed ? (
                  <div className="p-8 sm:p-10 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
                      <Lock className="w-7 h-7" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1.5">
                      <h4 className="text-base font-bold text-slate-900 font-sans">
                        Troubleshooting Steps Locked
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-sans">
                        Per OSHA 1910.147 compliance directives, you must physically verify Zero Energy State and check the LOTO confirmation box above before accessing repair troubleshooting steps.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsLotoConfirmed(true);
                        saveLocalLotoState(activeCase.id, true);
                        toast.success(
                          'LOTO Verified',
                          'Zero Energy State confirmed. Checklist unlocked.'
                        );
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shadow-xs inline-flex items-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirm LOTO & Unlock Steps</span>
                    </Button>
                  </div>
                ) : totalSteps === 0 ? (
                  <div className="p-8 rounded-lg border border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-white text-center space-y-3.5 shadow-xs">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                      <Sparkles className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1">
                      <h4 className="text-sm font-bold text-slate-900 font-sans">
                        Guided Repair SOP Not Yet Generated
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-sans">
                        Run ForgeX Multimodal AI diagnosis to ingest technical manuals and equipment telemetry to automatically synthesize an evidence-grounded repair checklist with OSHA 1910.147 LOTO safety directives.
                      </p>
                    </div>
                    <div className="pt-2">
                      <Button
                        onClick={() => handleRunAiDiagnosis(activeCase.id)}
                        disabled={isRunningDiagnosis}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs inline-flex items-center gap-2 px-4 py-2 rounded-lg transition"
                      >
                        {isRunningDiagnosis ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Synthesizing Repair SOP...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-blue-200" />
                            <span>Run AI Diagnosis to Generate SOP</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {activeCase.checklist.map((step) => {
                      const isDone = step.status === 'COMPLETED';
                      return (
                        <label
                          key={step.id}
                          className={`p-4 sm:p-5 rounded-xl border-2 transition-all duration-150 flex items-start gap-4 cursor-pointer select-none ${
                            isDone
                              ? 'bg-emerald-50/60 border-emerald-300/90 text-slate-900 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-900 hover:border-blue-400 hover:shadow-sm'
                          }`}
                        >
                          <div className="pt-0.5 shrink-0">
                            <input
                              type="checkbox"
                              checked={isDone}
                              disabled={activeCase.status === 'CLOSED'}
                              onChange={() => handleToggleStep(step.id)}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border-2 border-slate-300 text-emerald-600 focus:ring-4 focus:ring-emerald-500/20 cursor-pointer transition disabled:opacity-50"
                            />
                          </div>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-sm sm:text-base font-bold font-sans ${
                                    isDone ? 'line-through text-slate-400' : 'text-slate-900'
                                  }`}
                                >
                                  Step {step.stepNumber}: {step.title}
                                </span>
                                {step.requiresLoto && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-xs font-mono font-bold flex items-center gap-1">
                                    <Lock className="w-3 h-3" /> LOTO REQUIRED
                                  </span>
                                )}
                              </div>
                              <StatusBadge
                                label={step.status}
                                tone={isDone ? 'healthy' : 'warning'}
                              />
                            </div>

                            <p
                              className={`text-xs sm:text-sm font-sans leading-relaxed ${
                                isDone ? 'text-slate-500' : 'text-slate-700'
                              }`}
                            >
                              {step.instruction}
                            </p>

                            {step.citation && (
                              <div className="pt-1 flex items-center gap-1.5 text-xs font-mono text-blue-600">
                                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>
                                  Citation: {step.citation.documentNumber} (Page {step.citation.pageNumber})
                                </span>
                              </div>
                            )}

                            {step.technicianNotes && (
                              <div className="text-xs font-mono text-slate-500 italic pt-1">
                                Notes: {step.technicianNotes}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Technician Findings Submission Card */}
            {(activeCase.status === 'IN_PROGRESS' || activeCase.status === 'DIAGNOSED') && (
              <Card className="border-slate-200 shadow-xs">
                <CardHeader>
                  <CardTitle>Technician Field Findings & Sign-Off Submission</CardTitle>
                  <StatusBadge label="READY FOR SUBMISSION" tone="warning" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono text-slate-700 font-semibold">
                        Final Measured Values (e.g. Torque ft-lbs, Clearance mm, Temp °C)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 45 ft-lbs, 0.05mm clearance"
                        value={measuredTorque}
                        onChange={(e) => setMeasuredTorque(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono text-slate-700 font-semibold">
                        Corrective Interventions & Observations
                      </label>
                      <input
                        type="text"
                        placeholder="Describe parts replaced, seal alignment, or tests run..."
                        value={findingsText}
                        onChange={(e) => setFindingsText(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600 shadow-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSubmitFindings}
                      disabled={isSubmitting}
                      className="bg-slate-900 hover:bg-black text-white font-semibold shadow-sm inline-flex items-center gap-1.5 rounded-lg text-xs"
                    >
                      <Send className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        {isSubmitting ? 'Submitting...' : 'Submit Work Order for Supervisor Approval'}
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Supervisor Review & Sign-Off Authorization */}
            {activeCase.status === 'PENDING_APPROVAL' && (
              <Card className="border-amber-300 bg-amber-50/20 shadow-xs">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-600" />
                    <CardTitle>Supervisor Review & Work Order Authorization</CardTitle>
                  </div>
                  <StatusBadge label="AWAITING SUPERVISOR APPROVAL" tone="warning" pulse />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-white border border-amber-200 space-y-1 text-xs font-mono">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">
                      SUBMITTED TECHNICIAN RESOLUTION
                    </div>
                    <p className="text-slate-900 font-medium font-sans">
                      {activeCase.findings?.resolutionSummary ||
                        'Procedures verified and executed per standard.'}
                    </p>
                    {activeCase.findings?.measuredValues &&
                      Object.keys(activeCase.findings.measuredValues).length > 0 && (
                        <div className="pt-1 text-[11px] text-slate-600">
                          Recorded Telemetry: {JSON.stringify(activeCase.findings.measuredValues)}
                        </div>
                      )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-700 font-semibold">
                      Supervisor Sign-off Comments / Quality Notes
                    </label>
                    <input
                      type="text"
                      placeholder="Add supervisor notes before final sign-off..."
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600 shadow-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => setIsRejectConfirmOpen(true)}
                    >
                      Reject Work Order (Request Rework)
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => handleReviewApproval(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                    >
                      {isSubmitting ? 'Approving...' : 'Approve Work Order (Mark Resolved)'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resolved Work Order Banner with Close Action */}
            {activeCase.status === 'RESOLVED' && (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    WORK ORDER VERIFIED & RESOLVED
                  </span>
                  <p className="text-[11px] text-slate-600 font-sans">
                    Approved by {activeCase.approval?.reviewedByUserId || 'Authorized Supervisor'} at{' '}
                    {activeCase.resolvedAt
                      ? new Date(activeCase.resolvedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Recently'}
                    .
                    {activeCase.approval?.reviewerNotes &&
                      ` Comments: "${activeCase.approval.reviewerNotes}"`}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsCloseConfirmOpen(true)}
                  disabled={isSubmitting}
                  className="bg-slate-900 hover:bg-black text-white font-bold shrink-0 shadow-sm inline-flex items-center gap-1.5 rounded-lg"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Formally Close Case</span>
                </Button>
              </div>
            )}

            {/* Closed Archive Banner */}
            {activeCase.status === 'CLOSED' && (
              <div className="p-4 rounded-lg bg-white border border-slate-200 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    Work order formally audited and archived at{' '}
                    {activeCase.closedAt
                      ? new Date(activeCase.closedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'N/A'}
                    .
                  </span>
                </div>
                <StatusBadge label="CLOSED & ARCHIVED" tone="healthy" />
              </div>
            )}

            {/* ============================================================= */}
            {/* 3. CASE HISTORY & AUDIT TRAIL (CLEAN VERTICAL TIMELINE UI)    */}
            {/* ============================================================= */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-600" />
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-slate-800">
                    Case History & Tamper-Evident Audit Trail
                  </CardTitle>
                </div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  CHRONOLOGICAL LEDGER
                </span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="relative pl-6 space-y-5 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {activeCase.history.map((h, idx) => {
                    const initials = (h.user || 'System')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div key={h.id || idx} className="relative group">
                        {/* Timeline Node Icon */}
                        <div className="absolute -left-[27px] top-0.5 w-6 h-6 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center shadow-xs group-hover:border-blue-500 transition">
                          {getTimelineIcon(h.action)}
                        </div>

                        {/* Event Content Card */}
                        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/90 rounded-lg p-3 space-y-2 transition shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-900 tracking-tight">
                                {h.action.replace(/_/g, ' ')}
                              </span>
                              <span className="text-slate-300">·</span>
                              {/* User Avatar Badge */}
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] bg-white border border-slate-200 text-slate-700 shadow-xs">
                                <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-bold">
                                  {initials}
                                </span>
                                <span className="font-medium">{h.user || 'System'}</span>
                              </div>
                            </div>

                            {/* Exact Timestamp */}
                            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>
                                {new Date(h.timestamp).toLocaleString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Event Notes / Transition Description */}
                          {h.notes && (
                            <div className="p-2.5 rounded-md bg-white border border-slate-200/70 text-xs text-slate-700 font-sans leading-relaxed">
                              {h.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFC]">
            <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 p-8 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 font-sans">No Work Orders Logged</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                Your company workspace has zero recorded maintenance cases. Click below to log a work order and initiate automated diagnostic checklists.
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={() => setIsNewCaseModalOpen(true)}
                  className="bg-slate-900 hover:bg-black text-white font-semibold shadow-sm px-3.5 py-1.5 rounded-lg"
                >
                  <span>+ Report Work Order</span>
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

      {/* 1. Report New Case Modal (Complete Realistic 6-Row SaaS Dialog) */}
      <Modal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        title="Report New Maintenance Work Order"
        subtitle="Capture machinery symptoms, telemetry context, and safety parameters for automated AI diagnosis."
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsNewCaseModalOpen(false)}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold px-4 py-2 rounded-lg text-xs shadow-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateNewCase}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm px-4 py-2 rounded-lg inline-flex items-center gap-1.5 transition"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Diagnostic SOP...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                  <span>+ Create & Run AI Diagnosis</span>
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 font-sans text-xs">
          {/* Row 1 (Full Width): Work Order Title */}
          <div className="space-y-1.5">
            <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
              <span>Work Order Title</span>
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

          {/* Row 2 (2 Columns): Facility / Plant Location & Affected Asset */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs">Facility / Plant Location</label>
              <select
                value={newFacility}
                onChange={(e) => setNewFacility(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 font-sans text-xs cursor-pointer shadow-xs"
              >
                <option value="ForgeX Demo Factory - Line 2 (Bay B)">
                  ForgeX Demo Factory - Line 2 (Bay B)
                </option>
                <option value="Refinery Processing Unit 4 - Distillation Bay">
                  Refinery Processing Unit 4 - Distillation Bay
                </option>
                <option value="Chemical Synthesis Plant 1 - Compounding Line">
                  Chemical Synthesis Plant 1 - Compounding Line
                </option>
                <option value="Offshore Platform Alpha - Gas Compression Skid">
                  Offshore Platform Alpha - Gas Compression Skid
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs">Affected Asset / Machinery</label>
              <select
                value={newAssetTag}
                onChange={(e) => setNewAssetTag(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs cursor-pointer shadow-xs"
              >
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
          </div>

          {/* Row 3 (2 Columns): Maintenance Type & Operational Priority / Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs">Maintenance Type</label>
              <select
                value={newMaintenanceType}
                onChange={(e) => setNewMaintenanceType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 font-sans text-xs cursor-pointer shadow-xs"
              >
                <option value="Corrective Breakdown">Corrective Breakdown</option>
                <option value="Preventive Maintenance">Preventive Maintenance</option>
                <option value="Condition-Based (Sensor Alert)">Condition-Based (Sensor Alert)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs">Operational Priority / Severity</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as MaintenanceCaseSeverity)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 font-mono text-xs cursor-pointer shadow-xs"
              >
                <option value="CRITICAL">CRITICAL - Line Down</option>
                <option value="HIGH">HIGH - Risk of Failure</option>
                <option value="MEDIUM">MEDIUM - Degradation</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          {/* Row 4 (2 Columns): Error Code & LOTO Safety Protocol Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs">Error / Alarm Code (Optional)</label>
              <input
                type="text"
                placeholder="e.g. ERR-VIB-902 or PLC Alarm 404"
                value={newErrorCode}
                onChange={(e) => setNewErrorCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono text-xs shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
                <span>LOTO Safety Protocol Required?</span>
                <span className="text-[10px] text-slate-400 font-mono">OSHA 1910.147</span>
              </label>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5">
                  {newLotoRequired ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 text-[11px] font-mono font-bold">
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span>Yes - Lockout/Tagout Mandatory</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[11px] font-mono font-medium">
                      <span>No - Standard PPE Only</span>
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

          {/* Row 5 (Full Width): Observed Symptoms & Operating Anomalies */}
          <div className="space-y-1.5">
            <label className="text-slate-700 font-semibold text-xs flex items-center justify-between">
              <span>Observed Symptoms & Operating Anomalies</span>
              <span className="text-[10px] text-slate-400 font-sans">Detailed physical observations</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. High-pitched whining sound above 85dB, fluid leak rate ~50ml/min from drive-side seal, bearing temp spiked to 82°C."
              value={newSymptoms}
              onChange={(e) => setNewSymptoms(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-sans focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs shadow-xs"
            />
          </div>

          {/* Row 6 (Full Width): Evidence File Upload Zone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-semibold text-xs">
                Attach Evidence (Images / Audio / Sensor CSV Logs)
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Max 25MB</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,audio/*,.csv,.txt,.pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/20 rounded-lg p-4 text-center cursor-pointer transition space-y-1.5"
            >
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                <UploadCloud className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-700 font-medium">
                  Drag and drop or <span className="text-blue-600 font-semibold underline underline-offset-2">click to upload</span> photo (.jpg, .png), audio clip (.mp3), or telemetry file (.csv). Max 25MB.
                </p>
                <p className="text-[11px] text-slate-400 mt-1 font-sans">
                  Automated multimodal extraction will index waveforms, sensor curves, and acoustic patterns.
                </p>
              </div>
            </div>

            {/* Attached Files List */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {attachedFiles.map((file, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-mono text-slate-700 shadow-xs"
                  >
                    {file.type.includes('image') ? (
                      <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                    ) : file.type.includes('audio') ? (
                      <FileAudio className="w-3.5 h-3.5 text-purple-500" />
                    ) : file.name.endsWith('.csv') ? (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span className="font-medium max-w-[160px] truncate">{file.name}</span>
                    <span className="text-[10px] text-slate-400 font-sans">({file.size})</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachedFile(idx);
                      }}
                      className="text-slate-400 hover:text-rose-600 ml-0.5 p-0.5 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
            : 'Assign Certified Technician to Work Order'
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
                This work order is currently <strong>Unassigned</strong>.
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
        subtitle={`Remove ${activeCase?.assignedTechnicianName || 'technician'} from ${activeCase?.caseNumber || 'work order'}`}
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
            Are you sure you want to remove the assigned technician from this work order?
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
        title="Formally Close & Archive Work Order"
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
            <li>The work order will be removed from the active technician execution queue.</li>
          </ul>
        </div>
      </Modal>

      {/* 5. Reject Work Order Modal (Request Rework) */}
      <Modal
        isOpen={isRejectConfirmOpen}
        onClose={() => setIsRejectConfirmOpen(false)}
        title="Request Work Order Rework"
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
    </div>
  );
};

export default SopExecutionView;

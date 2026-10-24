import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { ExpertKnowledgeCaptureModal, type ExpertKnowledgePrefill } from '../modals/ExpertKnowledgeCaptureModal';
import {
  Wrench,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Filter,
  Check,
  Play,
  Cpu,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  ArrowRight,
  Search,
  X,
  Star,
  Trash2,
  User,
  Award,
  AlertTriangle,
  Building2,
  Lock,
  Lightbulb,
} from 'lucide-react';
import {
  computeTechnicianLiveStatus,
  setTechnicianShiftStatus,
} from '../../utils/technicianLiveStatus';

export interface TechStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  requiresLoto: boolean;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface TechProfile {
  id: string;
  name: string;
  discipline: string;
  role: string;
  rating: number;
  tier: string;
  initialSolved: number;
}

export const TECHNICIAN_ROSTER: TechProfile[] = [
  {
    id: 'tech-1',
    name: 'Alex Rivera',
    discipline: 'Mechanical & Rotating Systems',
    role: 'Mechanical Systems Specialist',
    rating: 4.9,
    tier: 'Top Rated',
    initialSolved: 28,
  },
  {
    id: 'tech-2',
    name: 'Marcus Vance',
    discipline: 'Hydraulics & Pressure Systems',
    role: 'Senior Hydraulic Engineer',
    rating: 4.8,
    tier: 'High Performer',
    initialSolved: 24,
  },
  {
    id: 'tech-3',
    name: 'Sarah Chen',
    discipline: 'Electrical Controls & PLC',
    role: 'Electrical Controls Specialist',
    rating: 4.9,
    tier: 'Top Rated',
    initialSolved: 31,
  },
  {
    id: 'tech-4',
    name: 'Elena Rostova',
    discipline: 'Vibration & Acoustic Analysis',
    role: 'Lead Vibration Analyst',
    rating: 4.7,
    tier: 'Certified Specialist',
    initialSolved: 19,
  },
];

export interface TechTask {
  id: string;
  rawCaseId?: string;
  createdAtFormatted: string;
  rawCreatedAt?: string;
  assetTag: string;
  assetName: string;
  title: string;
  faultCode?: string;
  symptomDescription: string;
  topRootCause?: string;
  probability?: number;
  priority: 'Critical' | 'High' | 'Medium';
  status: 'In Progress' | 'Assigned' | 'Pending Parts' | 'Resolved';
  dueTime: string;
  sopDocument: string;
  lotoRequired: boolean;
  specialistDiscipline?: string;
  assignedTechnicianName: string;
  assignedTechnicianRating: number;
  assignedTechnicianTier: string;
  plantName?: string;
  reportedBy?: string;
  recommendedFix?: string;
  investigationProgress?: string;
  stepsCount: number;
  completedSteps: number;
  steps: TechStep[];
  isStarted: boolean;
}

export const TechnicianWorkspaceView: React.FC<{
  onLaunchSop?: (ticketId: string) => void;
  onNavigateToCopilot?: (assetTag: string) => void;
  initialTicketId?: string;
}> = ({ onLaunchSop: _onLaunchSop, onNavigateToCopilot, initialTicketId }) => {
  const { user, token, organization, isOwnerOrAdmin, membership } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TechTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TechTask | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [selectedTechnician, setSelectedTechnician] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<TechTask | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expert Knowledge Capture Modal State upon Task Resolution
  const [isExpertCaptureOpen, setIsExpertCaptureOpen] = useState(false);
  const [expertCapturePrefill, setExpertCapturePrefill] = useState<ExpertKnowledgePrefill | null>(null);

  // Persistent Solved Count per Technician (Kundli record)
  const [solvedCounts, setSolvedCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('forgex_tech_solved_counts');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      'Alex Rivera': 28,
      'Marcus Vance': 24,
      'Sarah Chen': 31,
      'Elena Rostova': 19,
    };
  });

  const incrementSolved = (techName: string) => {
    setSolvedCounts((prev) => {
      const updated = {
        ...prev,
        [techName]: (prev[techName] || 25) + 1,
      };
      try {
        localStorage.setItem('forgex_tech_solved_counts', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // OEM Escalation Modal State
  const [isOemModalOpen, setIsOemModalOpen] = useState(false);
  const [oemTargetTask, setOemTargetTask] = useState<TechTask | null>(null);
  const [oemVendorName, setOemVendorName] = useState('Siemens Industry AG / DMG Mori');
  const [oemFaultCode, setOemFaultCode] = useState('');
  const [oemRcaFindings, setOemRcaFindings] = useState('');
  const [oemFailedNotes, setOemFailedNotes] = useState('');
  const [oemContactEmail, setOemContactEmail] = useState('service.support@siemens-oem.com');
  const [oemSlaPriority, setOemSlaPriority] = useState('L4 Critical / 4-Hour Emergency Dispatch');
  const [isSubmittingOem, setIsSubmittingOem] = useState(false);

  const isSupervisorOrAdmin =
    isOwnerOrAdmin ||
    membership?.role === 'SUPERVISOR' ||
    membership?.role === 'PLANT_MANAGER';

  // Helper to load persisted execution state per task
  const loadStoredExecution = (taskId: string, rawCaseId?: string) => {
    try {
      let raw = localStorage.getItem(`forgex_tech_exec_${taskId}`);
      if (!raw && rawCaseId) {
        raw = localStorage.getItem(`forgex_tech_exec_${rawCaseId}`);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        const steps = Array.isArray(parsed.steps) ? (parsed.steps as TechStep[]) : null;
        const isStarted = typeof parsed.isStarted === 'boolean' ? parsed.isStarted : false;
        return { steps, isStarted };
      }
    } catch {}
    return { steps: null, isStarted: false };
  };

  // Helper to persist execution state
  const saveStoredExecution = (task: { id: string; rawCaseId?: string }, steps: TechStep[], isStarted: boolean) => {
    try {
      const data = JSON.stringify({
        steps,
        isStarted,
        updatedAt: new Date().toISOString(),
      });
      localStorage.setItem(`forgex_tech_exec_${task.id}`, data);
      if (task.rawCaseId) {
        localStorage.setItem(`forgex_tech_exec_${task.rawCaseId}`, data);
      }
    } catch {}
  };

  const fetchQueue = useCallback(async (isManualSync = false) => {
    if (!token) return;
    if (isManualSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      if (organization?.id) {
        headers['x-organization-id'] = organization.id;
      }

      const [casesRes, ticketsRes] = await Promise.all([
        fetch('/api/v1/maintenance/cases?retentionDays=30', { headers }).catch(() => null),
        fetch('/api/v1/tickets', { headers }).catch(() => null),
      ]);

      const casesJson = casesRes && casesRes.ok ? await casesRes.json() : null;
      const ticketsJson = ticketsRes && ticketsRes.ok ? await ticketsRes.json() : null;

      const formatDt = (rawDate?: string) => {
        try {
          const d = rawDate ? new Date(rawDate) : new Date();
          if (isNaN(d.getTime())) {
            return new Date().toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
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

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const mappedFromCases: TechTask[] =
        casesJson?.success && Array.isArray(casesJson.data)
          ? casesJson.data
              .filter((c: any) => {
                // 30-Day Auto-Retention: Purge resolved/closed queue tasks older than 30 days
                if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
                  const finishedAt = c.resolvedAt || c.closedAt || c.updatedAt || c.createdAt;
                  if (finishedAt) {
                    const t = new Date(finishedAt).getTime();
                    if (!isNaN(t) && t < thirtyDaysAgo) return false;
                  }
                }
                return true;
              })
              .map((c: any, index: number) => {
                const checklist = Array.isArray(c.checklist) ? c.checklist : [];
                const hasLoto =
                  Boolean(c.lotoApplied) ||
                  checklist.some((s: any) => s.requiresLoto || s.title?.toLowerCase().includes('loto')) ||
                  String(c.symptomDescription || '').includes('LOTO: Energy Isolated') ||
                  String(c.description || '').includes('LOTO: YES') ||
                  String(c.description || '').includes('Energy Isolated');

                const prio: 'Critical' | 'High' | 'Medium' =
                  c.severity === 'CRITICAL' ? 'Critical' : c.severity === 'HIGH' ? 'High' : 'Medium';
                const stat: TechTask['status'] =
                  c.status === 'RESOLVED' || c.status === 'CLOSED'
                    ? 'Resolved'
                    : c.status === 'IN_PROGRESS'
                    ? 'In Progress'
                    : c.status === 'PENDING_PARTS'
                    ? 'Pending Parts'
                    : 'Assigned';

                const rawTopCause = c.topRootCause || c.diagnosticHypothesis?.primaryHypothesis;
                const rawProb =
                  c.probability ??
                  (c.diagnosticHypothesis?.confidence === 'HIGH'
                    ? 90
                    : c.diagnosticHypothesis?.confidence === 'MEDIUM'
                    ? 70
                    : undefined);

                const defaultSteps: TechStep[] =
                  checklist.length > 0
                    ? checklist.map((s: any, idx: number) => ({
                        id: s.id || `step-${idx + 1}`,
                        stepNumber: s.stepNumber || idx + 1,
                        title: s.title || `Step ${idx + 1}`,
                        instruction:
                          s.instruction ||
                          s.technicianNotes ||
                          'Execute procedure according to certified maintenance manual.',
                        requiresLoto: Boolean(s.requiresLoto || s.title?.toLowerCase().includes('loto')),
                        status:
                          s.status === 'COMPLETED'
                            ? 'COMPLETED'
                            : s.status === 'IN_PROGRESS'
                            ? 'IN_PROGRESS'
                            : 'PENDING',
                      }))
                    : [
                        {
                          id: 'step-1',
                          stepNumber: 1,
                          title: 'Verify Zero-Energy LOTO & Area Safety',
                          instruction:
                            'Isolate power source, apply lockout padlocks, tag isolation points, and verify zero electrical/mechanical energy.',
                          requiresLoto: hasLoto,
                          status: 'PENDING',
                        },
                        {
                          id: 'step-2',
                          stepNumber: 2,
                          title: 'Component Disassembly & Inspection',
                          instruction:
                            'Remove protective housings and inspect seals, bearings, couplings, and electrical terminations for wear.',
                          requiresLoto: false,
                          status: 'PENDING',
                        },
                        {
                          id: 'step-3',
                          stepNumber: 3,
                          title: 'Corrective Repair & Replacement Procedure',
                          instruction:
                            'Install replacement parts, renew lubricants, and torque all fasteners to OEM specifications in star pattern.',
                          requiresLoto: false,
                          status: 'PENDING',
                        },
                        {
                          id: 'step-4',
                          stepNumber: 4,
                          title: 'Recommissioning & Functional Run Test',
                          instruction:
                            'Remove LOTO locks, clear equipment perimeter, restore power, and conduct 15-minute diagnostic baseline verification.',
                          requiresLoto: false,
                          status: 'PENDING',
                        },
                      ];

                const taskId = c.caseNumber || (c.id ? c.id.slice(0, 8).toUpperCase() : `CASE-${index + 1}`);
                const stored = loadStoredExecution(taskId, c.id);

                // Merge steps: Keep any step completed in local storage OR backend (Strict Persistence)
                const mergedSteps: TechStep[] = defaultSteps.map((step) => {
                  const storedStep = stored.steps ? stored.steps.find((s) => s.id === step.id || s.stepNumber === step.stepNumber) : null;
                  if (storedStep && storedStep.status === 'COMPLETED') {
                    return { ...step, status: 'COMPLETED' };
                  }
                  if (step.status === 'COMPLETED') {
                    return step;
                  }
                  if (storedStep && storedStep.status === 'IN_PROGRESS') {
                    return { ...step, status: 'IN_PROGRESS' };
                  }
                  return step;
                });

                // If not started yet, activate first step if execution has started
                const isStarted = stored.isStarted || stat === 'In Progress' || mergedSteps.some((s) => s.status !== 'PENDING');
                if (isStarted && !mergedSteps.some((s) => s.status === 'IN_PROGRESS') && mergedSteps.some((s) => s.status === 'PENDING')) {
                  const firstPending = mergedSteps.find((s) => s.status === 'PENDING');
                  if (firstPending) firstPending.status = 'IN_PROGRESS';
                }

                const completedCount = mergedSteps.filter((s) => s.status === 'COMPLETED').length;

                // Match or assign certified technician from roster
                const assignedName =
                  c.assignedTechnicianName ||
                  TECHNICIAN_ROSTER[index % TECHNICIAN_ROSTER.length].name;
                const matchedProfile =
                  TECHNICIAN_ROSTER.find((p) => p.name === assignedName) ||
                  TECHNICIAN_ROSTER[index % TECHNICIAN_ROSTER.length];

                return {
                  id: taskId,
                  rawCaseId: c.id,
                  createdAtFormatted: c.createdAtFormatted || formatDt(c.createdAt),
                  rawCreatedAt: c.createdAt,
                  assetTag: c.assetTag || c.assetId || 'GEN-DIESEL-101',
                  assetName: c.assetName || c.title || 'Industrial Machinery',
                  title: c.title || c.symptomDescription || 'Scheduled Work Order',
                  faultCode: c.faultCode || 'FC-ALERT-01',
                  symptomDescription:
                    c.symptomDescription ||
                    c.description ||
                    c.title ||
                    'Abnormal operating conditions detected',
                  topRootCause: rawTopCause,
                  probability: rawProb,
                  priority: prio,
                  status: completedCount === mergedSteps.length && mergedSteps.length > 0 ? 'Resolved' : stat,
                  dueTime: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Today',
                  sopDocument:
                    c.diagnosticHypothesis?.evidenceCitations?.[0]?.documentTitle ||
                    (c.assignedTechnicianName
                      ? `Specialist Protocol: ${c.assignedTechnicianName}`
                      : 'Standard Maintenance Procedure'),
                  lotoRequired: hasLoto,
                  specialistDiscipline:
                    c.specialistDiscipline || c.assignedTechnicianName || matchedProfile.role,
                  assignedTechnicianName: matchedProfile.name,
                  assignedTechnicianRating: matchedProfile.rating,
                  assignedTechnicianTier: matchedProfile.tier,
                  plantName: c.plantName || 'Plant Sector Alpha',
                  reportedBy: c.reportedByName || c.reportedBy || 'Senior Shift Engineer',
                  recommendedFix: c.recommendedFix,
                  investigationProgress: c.investigationProgress,
                  stepsCount: mergedSteps.length,
                  completedSteps: completedCount,
                  steps: mergedSteps,
                  isStarted,
                };
              })
          : [];

      const existingIds = new Set(mappedFromCases.map((t) => t.id));

      const mappedFromTickets: TechTask[] =
        ticketsJson?.success && Array.isArray(ticketsJson.data)
          ? ticketsJson.data
              .filter((t: any) => !existingIds.has(t.ticketNumber))
              .map((t: any, index: number) => {
                const prio: 'Critical' | 'High' | 'Medium' =
                  t.severity === 'CRITICAL' ? 'Critical' : t.severity === 'HIGH' ? 'High' : 'Medium';
                const hasLoto =
                  Boolean(t.lotoApplied) ||
                  String(t.diagnosticDetails || '').includes('LOTO Verified / Safe: YES') ||
                  String(t.diagnosticDetails || '').includes('Energy Isolated');

                const defaultSteps: TechStep[] = [
                  {
                    id: 'step-1',
                    stepNumber: 1,
                    title: 'Verify Zero-Energy LOTO & Area Safety',
                    instruction:
                      'Isolate power source, apply lockout padlocks, tag isolation points, and verify zero electrical/mechanical energy.',
                    requiresLoto: hasLoto,
                    status: 'PENDING',
                  },
                  {
                    id: 'step-2',
                    stepNumber: 2,
                    title: 'Specialist Disassembly & Diagnostics',
                    instruction:
                      'Remove access covers and inspect internal components per specialist escalation brief.',
                    requiresLoto: false,
                    status: 'PENDING',
                  },
                  {
                    id: 'step-3',
                    stepNumber: 3,
                    title: 'Component Replacement & Alignment',
                    instruction:
                      'Replace defective sub-assemblies and verify shaft/coupling alignment using precision indicators.',
                    requiresLoto: false,
                    status: 'PENDING',
                  },
                  {
                    id: 'step-4',
                    stepNumber: 4,
                    title: 'Operational Baseline Verification',
                    instruction:
                      'Restore system power, perform operational spin test, and record vibration & thermal baseline.',
                    requiresLoto: false,
                    status: 'PENDING',
                  },
                ];

                const taskId = t.ticketNumber || `ESC-${t.id.slice(0, 4)}`;
                const stat: TechTask['status'] =
                  t.status === 'OPEN' ? 'Assigned' : t.status === 'RESOLVED' ? 'Resolved' : 'In Progress';
                const stored = loadStoredExecution(taskId, t.id);

                const mergedSteps: TechStep[] = defaultSteps.map((step) => {
                  const storedStep = stored.steps ? stored.steps.find((s) => s.id === step.id || s.stepNumber === step.stepNumber) : null;
                  if (storedStep && storedStep.status === 'COMPLETED') {
                    return { ...step, status: 'COMPLETED' };
                  }
                  if (storedStep && storedStep.status === 'IN_PROGRESS') {
                    return { ...step, status: 'IN_PROGRESS' };
                  }
                  return step;
                });

                const isStarted = stored.isStarted || stat === 'In Progress' || mergedSteps.some((s) => s.status !== 'PENDING');
                const completedCount = mergedSteps.filter((s) => s.status === 'COMPLETED').length;

                const assignedName =
                  t.assignedSpecialistName ||
                  TECHNICIAN_ROSTER[(index + 1) % TECHNICIAN_ROSTER.length].name;
                const matchedProfile =
                  TECHNICIAN_ROSTER.find((p) => p.name === assignedName) ||
                  TECHNICIAN_ROSTER[(index + 1) % TECHNICIAN_ROSTER.length];

                return {
                  id: taskId,
                  rawCaseId: t.id,
                  createdAtFormatted: t.createdAtFormatted || formatDt(t.createdAt),
                  rawCreatedAt: t.createdAt,
                  assetTag: t.assetTag || t.machineAssetTag || 'GEN-DIESEL-101',
                  assetName: t.assetName || t.originalQuestion || 'Escalated Machine Specialist Ticket',
                  title: t.assetName
                    ? `${t.assetName} - ${t.faultCode || 'Anomaly'}`
                    : t.originalQuestion || 'Specialist Escalation',
                  faultCode: t.faultCode || 'FC-ESC-901',
                  symptomDescription:
                    t.symptomDescription ||
                    t.diagnosticDetails ||
                    t.originalQuestion ||
                    'Equipment performance alert',
                  topRootCause: t.topRootCause,
                  probability: t.probability,
                  priority: prio,
                  status: completedCount === mergedSteps.length && mergedSteps.length > 0 ? 'Resolved' : stat,
                  dueTime: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Today',
                  sopDocument: t.assignedSpecialistName
                    ? `Specialist: ${t.assignedSpecialistName}`
                    : 'Specialist Support Protocol',
                  lotoRequired: hasLoto,
                  specialistDiscipline:
                    t.specialistDiscipline ||
                    t.assignedSpecialistRole ||
                    t.assignedSpecialistName ||
                    matchedProfile.role,
                  assignedTechnicianName: matchedProfile.name,
                  assignedTechnicianRating: matchedProfile.rating,
                  assignedTechnicianTier: matchedProfile.tier,
                  plantName: t.plantName || 'Plant Sector Alpha',
                  reportedBy: t.reportedByName || t.reportedBy || 'Shift Lead',
                  recommendedFix: t.recommendedFix,
                  investigationProgress: t.investigationProgress || 'Initial Inspection',
                  stepsCount: mergedSteps.length,
                  completedSteps: completedCount,
                  steps: mergedSteps,
                  isStarted,
                };
              })
          : [];

      const allTasks = [...mappedFromCases, ...mappedFromTickets];
      setTasks(allTasks);

      // Deep-link auto-selection: check initialTicketId prop, sessionStorage, and URL ?ticketId= param
      const urlTicketId = new URLSearchParams(window.location.search).get('ticketId');
      const sessionTicketId = sessionStorage.getItem('forgex_selected_tech_ticket');
      const targetTicketId = initialTicketId || sessionTicketId || urlTicketId;

      setSelectedTask((prevSelected) => {
        if (targetTicketId) {
          const matchedByTarget = allTasks.find(
            (t) =>
              t.id === targetTicketId ||
              t.rawCaseId === targetTicketId ||
              t.title.includes(targetTicketId)
          );
          if (matchedByTarget) {
            sessionStorage.removeItem('forgex_selected_tech_ticket');
            return matchedByTarget;
          }
        }
        if (!prevSelected) return null;
        const matched = allTasks.find(
          (t) => t.id === prevSelected.id || (t.rawCaseId && t.rawCaseId === prevSelected.rawCaseId)
        );
        return matched || null;
      });
    } catch (err) {
      console.error('Failed to load technician queue:', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [token, organization?.id, initialTicketId]);

  useEffect(() => {
    fetchQueue(false);
  }, [fetchQueue]);

  // Listen for navigation deep-links to specific tickets
  useEffect(() => {
    const handleNav = (e: Event) => {
      const custom = e as CustomEvent<{ module?: string; ticketId?: string; caseId?: string }>;
      const target = custom.detail?.ticketId || custom.detail?.caseId;
      if (target) {
        setTasks((currentTasks) => {
          const match = currentTasks.find(
            (t) => t.id === target || t.rawCaseId === target || t.title.includes(target)
          );
          if (match) {
            setSelectedTask(match);
          }
          return currentTasks;
        });
      }
    };
    window.addEventListener('forgex:navigate', handleNav);
    return () => window.removeEventListener('forgex:navigate', handleNav);
  }, []);

  useEffect(() => {
    setShowDiagnostics(false);
  }, [selectedTask?.id]);

  const [shiftVersion, setShiftVersion] = useState(0);

  useEffect(() => {
    const handleShift = () => setShiftVersion((v) => v + 1);
    window.addEventListener('forgex:tech-shift-changed', handleShift);
    return () => window.removeEventListener('forgex:tech-shift-changed', handleShift);
  }, []);

  // Compute live workload and live progress % per technician across active tasks
  const technicianStats = useMemo(() => {
    return TECHNICIAN_ROSTER.map((tech) => {
      const assigned = tasks.filter(
        (t) => (t.assignedTechnicianName || '').toLowerCase() === tech.name.toLowerCase()
      );
      // Strictly exclude resolved / 100% completed tasks from active workload
      const activeAssigned = assigned.filter((t) => {
        if (t.status === 'Resolved' || (t as any).isSolved) return false;
        if (t.stepsCount > 0 && t.completedSteps >= t.stepsCount) return false;
        return true;
      });

      const solvedCount = solvedCounts[tech.name] ?? tech.initialSolved;
      const liveStatus = computeTechnicianLiveStatus(
        { fullName: tech.name, id: tech.id },
        tasks
      );

      // Progress %: If active ticket exists, show that active ticket's progress %; if activeAssigned is 0, strictly reset to 0%!
      let progressPct = 0;
      if (activeAssigned.length > 0) {
        const activeTask = activeAssigned[0];
        if (activeTask.stepsCount > 0) {
          progressPct = Math.round((activeTask.completedSteps / activeTask.stepsCount) * 100);
        }
      }

      return {
        ...tech,
        solvedCount,
        assignedCount: activeAssigned.length,
        activeTickets: activeAssigned,
        totalSteps: activeAssigned.reduce((sum, t) => sum + t.stepsCount, 0),
        doneSteps: activeAssigned.reduce((sum, t) => sum + t.completedSteps, 0),
        progressPct,
        liveStatus,
      };
    });
  }, [tasks, solvedCounts, shiftVersion]);

  // Start Execution Action
  const handleStartExecution = (taskId: string) => {
    setTasks((prevTasks) =>
      prevTasks.map((t) => {
        if (t.id !== taskId) return t;

        const updatedSteps = t.steps.map((step, idx) => {
          if (idx === 0 && step.status === 'PENDING') {
            return { ...step, status: 'IN_PROGRESS' as const };
          }
          return step;
        });

        saveStoredExecution(t, updatedSteps, true);

        const updatedTask: TechTask = {
          ...t,
          isStarted: true,
          status: 'In Progress',
          steps: updatedSteps,
          completedSteps: updatedSteps.filter((s) => s.status === 'COMPLETED').length,
        };

        if (selectedTask?.id === taskId) {
          setSelectedTask(updatedTask);
        }

        return updatedTask;
      })
    );
  };

  // Toggle step completion via checkbox (Strict Irreversible Locking - Requirement 5)
  const handleToggleStep = async (taskId: string, stepId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const existingStep = task?.steps.find((s) => s.id === stepId);
    if (existingStep?.status === 'COMPLETED') {
      toast.info('Step Locked', 'This verified step is permanently locked and cannot be reopened.');
      return;
    }
    await handleCompleteAndNext(taskId, stepId);
  };

  // Complete Step & Advance to next step (Strict Persistence & Live Cross-Module Sync)
  const handleCompleteAndNext = async (taskId: string, stepId: string) => {
    let targetTask: TechTask | undefined;

    setTasks((prevTasks) =>
      prevTasks.map((t) => {
        if (t.id !== taskId) return t;
        targetTask = t;

        let foundStep = false;
        const updatedSteps = t.steps.map((step) => {
          if (step.id === stepId) {
            foundStep = true;
            return { ...step, status: 'COMPLETED' as const };
          }
          return step;
        });

        if (foundStep) {
          const nextPending = updatedSteps.find((s) => s.status === 'PENDING');
          if (nextPending) {
            nextPending.status = 'IN_PROGRESS';
          }
        }

        const completedCount = updatedSteps.filter((s) => s.status === 'COMPLETED').length;
        const allCompleted = completedCount === updatedSteps.length && updatedSteps.length > 0;

        saveStoredExecution(t, updatedSteps, true);

        const updatedTask: TechTask = {
          ...t,
          steps: updatedSteps,
          completedSteps: completedCount,
          status: allCompleted ? 'Resolved' : 'In Progress',
        };

        if (selectedTask?.id === taskId) {
          setSelectedTask(updatedTask);
        }

        // Live Progress Sync across modules (Kundli roster bar & Raised Tickets)
        window.dispatchEvent(
          new CustomEvent('forgex:ticket-progress-sync', {
            detail: {
              ticketId: t.id,
              rawCaseId: t.rawCaseId,
              status: allCompleted ? 'RESOLVED' : 'IN_PROGRESS',
              isSolved: allCompleted,
              completedSteps: completedCount,
              totalSteps: updatedSteps.length,
              technicianName: t.assignedTechnicianName,
            },
          })
        );
        if (allCompleted) {
          window.dispatchEvent(
            new CustomEvent('forgex:ticket-solved', {
              detail: {
                ticketId: t.id,
                rawCaseId: t.rawCaseId,
              },
            })
          );
          incrementSolved(t.assignedTechnicianName);

          // Auto-Advance to next queued ticket on 100% completion
          setTimeout(() => {
            setTasks((current) => {
              const nextForTech =
                current.find(
                  (other) =>
                    other.id !== taskId &&
                    other.assignedTechnicianName === t.assignedTechnicianName &&
                    other.status !== 'Resolved'
                ) ||
                current.find(
                  (other) =>
                    other.id !== taskId &&
                    (!other.assignedTechnicianName || other.assignedTechnicianName === 'Unassigned') &&
                    other.status !== 'Resolved'
                );

              if (nextForTech) {
                setSelectedTask(nextForTech);
                toast.info(
                  'Auto-Advanced to Next Ticket',
                  `Technician ${t.assignedTechnicianName} transitioned focus to next queued ticket [${nextForTech.assetTag}].`
                );
              } else {
                toast.info(
                  'All Assigned Tickets Solved',
                  `Technician ${t.assignedTechnicianName} is now 🟢 Available (Idle — Ready for Dispatch).`
                );
              }
              return current;
            });
          }, 300);
        }

        return updatedTask;
      })
    );

    // Persist to backend database
    if (token && targetTask) {
      const caseRef = (targetTask as TechTask).rawCaseId || targetTask.id;
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };
        if (organization?.id) headers['x-organization-id'] = organization.id;

        await fetch(`/api/v1/maintenance/cases/${caseRef}/steps/${stepId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'COMPLETED',
            technicianNotes: 'Completed step via wizard execution flow',
          }),
        }).catch(() => null);
      } catch (err) {
        console.warn('Backend step advance sync notice:', err);
      }
    }
  };

  // Pre-fill Copilot with exact structured technical context
  const handleAskCopilot = (task: TechTask, activeStepItem?: TechStep) => {
    const activeStep =
      activeStepItem ||
      task.steps.find((s) => s.status === 'IN_PROGRESS') ||
      task.steps.find((s) => s.status === 'PENDING') ||
      task.steps[0];

    const activeStepTitle = activeStep ? activeStep.title : 'Field Procedure Execution';
    const activeStepDesc = activeStep ? activeStep.instruction : task.sopDocument;
    const summary = task.title || task.symptomDescription || 'Field Maintenance Anomaly';

    const formattedPrompt = activeStepDesc || (activeStepTitle ? `${activeStepTitle}: ${summary}` : summary);

    const handoffPayload = {
      assetTag: task.assetTag,
      caseId: task.id,
      rawCaseId: task.rawCaseId,
      faultCode: task.faultCode,
      issueSummary: summary,
      activeStepTitle,
      activeStepDescription: activeStepDesc,
      prompt: formattedPrompt,
      timestamp: Date.now(),
    };

    // 1. Session Storage persistence
    try {
      sessionStorage.setItem('forgex_copilot_handoff', JSON.stringify(handoffPayload));
    } catch {}

    // 2. Dispatch custom event for active views
    window.dispatchEvent(
      new CustomEvent('forgex:copilot-handoff', {
        detail: handoffPayload,
      })
    );

    // 3. Update URL search params as resilient fallback
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('assetTag', task.assetTag);
      url.searchParams.set('caseId', task.id);
      url.searchParams.set('faultCode', task.faultCode || '');
      url.searchParams.set('prompt', formattedPrompt);
      window.history.pushState({}, '', url.toString());
    } catch {}

    // 4. Trigger navigation callback
    onNavigateToCopilot?.(task.assetTag);
  };

  // Delete Task Action (Role-guarded: Admin / Supervisor or Completed tasks)
  const handleDeleteTask = async (task: TechTask) => {
    setDeleting(true);
    try {
      if (token) {
        const caseRef = task.rawCaseId || task.id;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (organization?.id) headers['x-organization-id'] = organization.id;

        await fetch(`/api/v1/maintenance/cases/${caseRef}`, {
          method: 'DELETE',
          headers,
        }).catch(() => null);
      }

      // Clear local storage entries
      try {
        localStorage.removeItem(`forgex_tech_exec_${task.id}`);
        if (task.rawCaseId) {
          localStorage.removeItem(`forgex_tech_exec_${task.rawCaseId}`);
        }
      } catch {}

      // Update local state
      setTasks((prev) => {
        const nextTasks = prev.filter((t) => t.id !== task.id && t.rawCaseId !== task.rawCaseId);
        if (selectedTask?.id === task.id) {
          setSelectedTask(nextTasks.length > 0 ? nextTasks[0] : null);
        }
        return nextTasks;
      });

      setDeleteConfirmTask(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Filter tasks by Search Bar, Priority, and Technician Workload/Rating
  const filteredQueue = useMemo(() => {
    return tasks
      .filter((task) => {
        // 1. Search Query Filter (Case ID, Asset Tag, Issue Title, Tech Name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = task.id.toLowerCase().includes(q);
          const matchTag = task.assetTag.toLowerCase().includes(q);
          const matchTitle =
            task.title.toLowerCase().includes(q) ||
            task.symptomDescription.toLowerCase().includes(q);
          const matchTech = task.assignedTechnicianName.toLowerCase().includes(q);
          if (!matchId && !matchTag && !matchTitle && !matchTech) {
            return false;
          }
        }

        // 2. Priority Filter
        if (filterPriority !== 'ALL' && task.priority !== filterPriority) {
          return false;
        }

        // 3. Technician Filter
        if (selectedTechnician !== 'ALL' && selectedTechnician !== 'SORT_RATING') {
          if (task.assignedTechnicianName !== selectedTechnician) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (selectedTechnician === 'SORT_RATING') {
          return b.assignedTechnicianRating - a.assignedTechnicianRating;
        }
        return 0;
      });
  }, [tasks, searchQuery, filterPriority, selectedTechnician]);

  // Mark Task Solved & Archive to Maintenance History (Multi-Stage Ticket Resolution)
  const handleMarkTaskSolved = async (task: TechTask, atStep?: TechStep) => {
    try {
      const caseRef = task.rawCaseId || task.id;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (organization?.id) headers['x-organization-id'] = organization.id;

      const resolutionNotes = atStep
        ? `Issue solved at procedure step #${atStep.stepNumber} (${atStep.title}): ${atStep.instruction} by technician ${task.assignedTechnicianName}.`
        : `Field maintenance completed by ${task.assignedTechnicianName}. All procedure verification steps passed.`;

      // 1. Mark status RESOLVED on Maintenance Case
      await fetch(`/api/v1/maintenance/cases/${caseRef}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'RESOLVED',
          reason: resolutionNotes,
        }),
      }).catch(() => null);

      // 2. Mark ALL steps as COMPLETED (100% progress & strictly locked - Requirement 5)
      const completedSteps = task.steps.map((s) => ({ ...s, status: 'COMPLETED' as const }));

      saveStoredExecution(task, completedSteps, true);

      // 3. Post authoritative record directly to /api/v1/maintenance-records
      await fetch('/api/v1/maintenance-records', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          machineAssetTag: task.assetTag,
          ticketNumber: task.id,
          problemStatement: task.symptomDescription || task.title,
          observedSymptoms: [task.symptomDescription || task.title],
          rootCause: task.topRootCause || 'Field mechanical / electrical wear corrected',
          faultCategory: task.specialistDiscipline?.toLowerCase().includes('hydraul')
            ? 'HYDRAULICS'
            : task.specialistDiscipline?.toLowerCase().includes('elec')
            ? 'ELECTRICAL'
            : 'MECHANICAL',
          repairActions: atStep
            ? [`Issue solved at step #${atStep.stepNumber} (${atStep.title}): ${atStep.instruction}`]
            : task.steps.map((s) => `Step #${s.stepNumber} (${s.title}): ${s.instruction}`),
          verificationState: 'PASSED',
          approvalStatus: 'APPROVED',
          resolvedAt: new Date().toISOString(),
        }),
      }).catch((mrErr) => {
        console.warn('Failed to post direct maintenance-record:', mrErr);
      });

      // 4. Increment technician's solved counter
      incrementSolved(task.assignedTechnicianName);

      // Dispatch 100% Live Progress Sync across modules
      window.dispatchEvent(
        new CustomEvent('forgex:ticket-progress-sync', {
          detail: {
            ticketId: task.id,
            rawCaseId: task.rawCaseId,
            status: 'RESOLVED',
            isSolved: true,
            completedSteps: completedSteps.length,
            totalSteps: completedSteps.length,
            technicianName: task.assignedTechnicianName,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('forgex:ticket-solved', {
          detail: {
            ticketId: task.id,
            rawCaseId: task.rawCaseId,
          },
        })
      );

      // 5. Update local task state and auto-advance to next queued ticket
      let nextTargetTask: TechTask | null = null;
      setTasks((prev) => {
        const nextList = prev.map((t) =>
          t.id === task.id
            ? { ...t, status: 'Resolved' as const, steps: completedSteps, completedSteps: completedSteps.length }
            : t
        );

        nextTargetTask =
          nextList.find(
            (t) => t.id !== task.id && t.assignedTechnicianName === task.assignedTechnicianName && t.status !== 'Resolved'
          ) ||
          nextList.find(
            (t) => t.id !== task.id && (!t.assignedTechnicianName || t.assignedTechnicianName === 'Unassigned') && t.status !== 'Resolved'
          ) ||
          null;

        return nextList;
      });

      if (nextTargetTask) {
        setSelectedTask(nextTargetTask);
        toast.info(
          'Auto-Advanced to Next Ticket',
          `Technician ${task.assignedTechnicianName} transitioned focus to next queued ticket [${(nextTargetTask as any).assetTag}].`
        );
      } else {
        setSelectedTask((prev) =>
          prev ? { ...prev, status: 'Resolved', steps: completedSteps, completedSteps: completedSteps.length } : null
        );
        toast.info(
          'All Assigned Tickets Solved',
          `Technician ${task.assignedTechnicianName} is now 🟢 Available (Idle — Ready for Dispatch).`
        );
      }

      // 6. Pre-fill and trigger Expert Knowledge Capture Form (Requirement 4)
      setExpertCapturePrefill({
        machineAssetTag: task.assetTag,
        issueTitle: `Field Fix: [${task.assetTag}] ${task.title}`,
        category: task.specialistDiscipline?.toLowerCase().includes('hydraul')
          ? 'Tooling Hack'
          : task.specialistDiscipline?.toLowerCase().includes('safety')
          ? 'Safety & LOTO'
          : 'Troubleshooting Trick',
        resolutionSummary: atStep
          ? `Issue solved at step #${atStep.stepNumber} (${atStep.title}). Applied fix: ${atStep.instruction}. Root Cause: ${task.topRootCause || 'Field anomaly corrected'}.`
          : `All ${task.steps.length} field repair steps completed. Root Cause: ${task.topRootCause || 'Mechanical anomaly'}. Remedy: ${task.recommendedFix || 'Restored operational baseline.'}`,
        symptom: task.symptomDescription,
      });
      setIsExpertCaptureOpen(true);

      toast.success(
        'Task Resolved & Logged',
        `Maintenance repair record archived to Maintenance History. ${task.assignedTechnicianName}'s solved counter incremented!`
      );
    } catch (err) {
      console.error('Failed to resolve task:', err);
    }
  };

  // Archive verified repair task to Maintenance History and clear from active queue (Requirement 3)
  const handleArchiveTaskToHistory = async (task: TechTask) => {
    try {
      await handleMarkTaskSolved(task);
      setTasks((prev) => {
        const nextList = prev.filter((t) => t.id !== task.id);
        const nextTarget = nextList[0] || null;
        setSelectedTask(nextTarget);
        return nextList;
      });
      toast.success(
        'Archived to Maintenance History',
        `Task ${task.id} [${task.assetTag}] permanently archived to Maintenance History and cleared from active queue.`
      );
    } catch (err) {
      console.error('Failed to archive task:', err);
      toast.error('Archive Notice', 'Could not archive task to Maintenance History.');
    }
  };

  // Pre-fill and open quick tip to Expert Knowledge (Requirement 3)
  const handleAddTipToExpertKnowledge = (task: TechTask) => {
    setExpertCapturePrefill({
      machineAssetTag: task.assetTag,
      issueTitle: `Field Fix: [${task.assetTag}] ${task.title}`,
      category: task.specialistDiscipline?.toLowerCase().includes('hydraul')
        ? 'Tooling Hack'
        : task.specialistDiscipline?.toLowerCase().includes('safety')
        ? 'Safety & LOTO'
        : 'Troubleshooting Trick',
      resolutionSummary: `All ${task.steps.length} field repair steps completed. Root Cause: ${task.topRootCause || 'Mechanical anomaly'}. Remedy: ${task.recommendedFix || 'Restored operational baseline.'}`,
      symptom: task.symptomDescription,
    });
    setIsExpertCaptureOpen(true);
  };

  // Open OEM Vendor Escalation Modal
  const handleOpenOemModal = (task: TechTask) => {
    setOemTargetTask(task);
    setOemFaultCode(task.faultCode || 'ERR-702-HW-FATAL');
    setOemRcaFindings(
      task.topRootCause ||
        task.symptomDescription ||
        'Internal mechanical wear / thermal degradation beyond field overhaul specifications.'
    );

    const activeOrFailedStep =
      task.steps.find((s) => s.status === 'IN_PROGRESS') ||
      task.steps.find((s) => s.status === 'PENDING') ||
      task.steps[task.steps.length - 1];

    setOemFailedNotes(
      activeOrFailedStep
        ? `Blocked at [Step ${activeOrFailedStep.stepNumber}: ${activeOrFailedStep.title}] — Sub-assembly internal seizure requires OEM specialized factory tooling and warranty overhaul.`
        : 'Sub-assembly internal failure requires certified OEM factory technician onsite.'
    );

    // Auto-detect OEM Manufacturer Name
    const tag = task.assetTag.toUpperCase();
    const name = task.assetName.toLowerCase();
    if (tag.includes('PUMP') || name.includes('pump')) {
      setOemVendorName('Flowserve Pump Technologies GmbH');
      setOemContactEmail('emea.dispatch@flowserve.com');
    } else if (tag.includes('HYD') || name.includes('press')) {
      setOemVendorName('Bosch Rexroth Industrial Hydraulics');
      setOemContactEmail('service.field@boschrexroth.de');
    } else if (tag.includes('CNC') || name.includes('lathe') || name.includes('spindle')) {
      setOemVendorName('DMG MORI Industrial Services');
      setOemContactEmail('support@dmgmori.com');
    } else {
      setOemVendorName('Siemens Motion & Drives Automation');
      setOemContactEmail('support.service@siemens.com');
    }

    setIsOemModalOpen(true);
  };

  // Confirm OEM Vendor Dispatch & Update Ticket Status
  const handleConfirmOemDispatch = async () => {
    if (!oemTargetTask) return;
    setIsSubmittingOem(true);
    try {
      const caseRef = oemTargetTask.rawCaseId || oemTargetTask.id;
      if (token) {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };
        if (organization?.id) headers['x-organization-id'] = organization.id;

        await fetch(`/api/v1/maintenance/cases/${caseRef}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'ESCALATED_TO_OEM',
            reason: `OEM Escalation to ${oemVendorName} (${oemContactEmail}) under ${oemSlaPriority}. Notes: ${oemFailedNotes}`,
          }),
        }).catch(() => null);
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === oemTargetTask.id
            ? {
                ...t,
                status: 'Assigned' as const,
                title: `[OEM: ${oemVendorName}] ${t.title}`,
              }
            : t
        )
      );

      const escalationRecord = {
        id: `OEM-ESC-${Date.now().toString().slice(-4)}`,
        ticketId: oemTargetTask.id,
        rawCaseId: oemTargetTask.rawCaseId,
        assetTag: oemTargetTask.assetTag,
        assetName: oemTargetTask.assetName,
        oemManufacturer: oemVendorName,
        oemContactEmail: oemContactEmail,
        slaPriority: oemSlaPriority,
        faultCode: oemTargetTask.faultCode || 'FC-ALERT-OEM',
        rcaFindings: oemRcaFindings,
        failedNotes: oemFailedNotes,
        escalatedByTechnician: oemTargetTask.assignedTechnicianName || user?.fullName || 'Marcus Vance',
        escalatedAt: new Date().toISOString(),
        status: 'Awaiting OEM / Authority Review' as const,
        warrantyStatus: 'Active Factory OEM Warranty',
        contractRef: `OEM-${oemTargetTask.assetTag}-2026`,
      };

      try {
        const raw = localStorage.getItem('forgex_oem_escalations');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(escalationRecord);
        localStorage.setItem('forgex_oem_escalations', JSON.stringify(list));
      } catch {}

      window.dispatchEvent(
        new CustomEvent('forgex:oem-escalated', { detail: escalationRecord })
      );

      toast.success(
        'OEM Vendor Escalation Dispatched',
        `Official L4 Service Request dispatched to ${oemVendorName}. Routing to OEM & Authority Escalations desk...`
      );

      setIsOemModalOpen(false);
      setOemTargetTask(null);

      // Route directly to OEM Escalations view
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('forgex:navigate', {
            detail: {
              module: 'oem-escalations',
              ticketId: escalationRecord.ticketId,
            },
          })
        );
      }, 600);
    } catch (err) {
      console.error('OEM Escalation failed:', err);
      toast.error(
        'Escalation Notice',
        'Failed to lodge OEM escalation request. Please try again.'
      );
    } finally {
      setIsSubmittingOem(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">
      {/* Top Header Bar with Technician Selector, Star Rating & Live Workload Strip */}
      <div className="p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">
              Technician Field Workspace · Execution Queue
            </h1>
            <p className="text-xs text-slate-500">
              Logged in as{' '}
              <span className="font-semibold text-slate-800">
                {user?.fullName || 'Field Technician'}
              </span>{' '}
              · Field dispatch & step-by-step task execution
            </p>
          </div>
        </div>

        {/* Filter Strip: Technician Selector + Star Rating + Priority Dropdown */}
        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
          {/* Technician & Rating Workload Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-medium outline-hidden cursor-pointer max-w-[210px]"
            >
              <option value="ALL">All Technicians ({tasks.length} Tasks)</option>
              <option value="SORT_RATING">🏆 Sort by Highest Rated Tech</option>
              {technicianStats.map((t) => (
                <option key={t.id} value={t.name}>
                  ⭐ {t.rating} {t.name} · {t.assignedCount} Tasks ({t.progressPct}% Done)
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-medium outline-hidden cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </div>

          {/* Sync Button */}
          <button
            onClick={() => fetchQueue(true)}
            disabled={syncing}
            title="Sync Latest Data from Server (Never wipes completed steps)"
            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Technician Roster & Kundli Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 shrink-0 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-700 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-blue-600" />
              Technician Roster & Kundli Register
            </span>
            <span className="text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-semibold">
              Live Workload & Skill Dispatch
            </span>
          </div>
          {selectedTechnician !== 'ALL' && (
            <button
              onClick={() => setSelectedTechnician('ALL')}
              className="text-[10px] font-mono text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Show All Queue ({tasks.length})</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {technicianStats.map((tech) => {
            const isSelected = selectedTechnician === tech.name;
            const live = tech.liveStatus;
            const isOnShift = live.shiftStatus === 'ON_SHIFT';
            const hasActiveWork = tech.activeTickets.length > 0;
            const activeMachineTag = hasActiveWork
              ? tech.activeTickets[0].assetTag || tech.activeTickets[0].assetName || 'Equipment'
              : '';

            return (
              <div
                key={tech.id}
                onClick={() => setSelectedTechnician(isSelected ? 'ALL' : tech.name)}
                className={`p-2 rounded-lg border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200 hover:border-slate-300 shadow-2xs'
                }`}
                title={`Click to filter queue for ${tech.name}`}
              >
                {/* Header: Name + Discipline + Rating */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-slate-900 truncate">
                        {tech.name}
                      </span>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[9px] text-slate-500 truncate leading-tight">
                      {tech.discipline}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 rounded shrink-0">
                    ⭐ {tech.rating.toFixed(1)}
                  </span>
                </div>

                {/* Two Distinct Badges:
                    1) Left Badge: Live Machine Status (Read-Only)
                    2) Right Button: Shift Status (Automatic + Manual Toggle) */}
                <div className="mt-1.5 pt-1 border-t border-slate-200/60 flex items-center justify-between gap-1 text-[9px] font-mono">
                  {/* Left Badge: Live Machine Status (Read-Only) */}
                  {!isOnShift ? (
                    <span className="font-semibold px-1.5 py-0.2 rounded border bg-slate-100 text-slate-600 border-slate-200 truncate shrink-0">
                      ⚪ Paused
                    </span>
                  ) : hasActiveWork ? (
                    <span
                      className="font-semibold px-1.5 py-0.2 rounded border bg-amber-50 text-amber-800 border-amber-200 truncate max-w-[120px]"
                      title={`Busy on ${activeMachineTag}`}
                    >
                      🟡 Busy on {activeMachineTag}
                    </span>
                  ) : (
                    <span className="font-semibold px-1.5 py-0.2 rounded border bg-emerald-50 text-emerald-800 border-emerald-200 truncate shrink-0">
                      🟢 Available / Idle
                    </span>
                  )}

                  {/* Right Button: Shift Status (Manual 1-Click Toggle: On Shift <-> On Break) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = isOnShift ? 'ON_BREAK' : 'ON_SHIFT';
                      setTechnicianShiftStatus(tech.name, next);
                    }}
                    className={`px-1.5 py-0.2 rounded border font-bold transition shrink-0 cursor-pointer text-[9px] ${
                      isOnShift
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 hover:bg-rose-200 border-rose-300'
                    }`}
                    title="Click to toggle shift availability"
                  >
                    {isOnShift ? '🟢 On Shift' : '☕ On Break'}
                  </button>
                </div>

                {/* Workload Counts: Active Work & 🏆 Solved */}
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-600">
                    Active: <strong className="text-slate-900">{tech.assignedCount}</strong>
                  </span>
                  <span className="text-emerald-700 font-semibold">
                    🏆 {tech.solvedCount} Solved
                  </span>
                </div>

                {/* Live Step Progress Bar (Strictly 0% when Active: 0) */}
                <div className="mt-1">
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                    <span>Live Progress</span>
                    <span className="font-bold text-slate-700">{tech.progressPct}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        tech.progressPct === 100
                          ? 'bg-emerald-500'
                          : tech.progressPct > 0
                          ? 'bg-blue-600'
                          : 'bg-slate-300'
                      }`}
                      style={{ width: `${tech.progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs font-mono text-slate-500">Loading technician queue...</p>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFC]">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 font-sans">Queue is Clear</h2>
            <p className="text-xs text-slate-500 leading-relaxed font-sans">
              You have no active field tasks assigned. 30-day auto-retention is active.
            </p>
            <div className="pt-2">
              <button
                onClick={() => fetchQueue(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Queue</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Main Split: Left Compact Field Task List (380px) + Right Detail View */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: Compact Field Task List */}
          <div className="w-full lg:w-[380px] border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-3 overflow-y-auto space-y-2.5 shrink-0 shadow-xs flex flex-col">
            {/* 1. Left Panel Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search task #, asset, issue, tech..."
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg text-xs font-sans text-slate-800 placeholder-slate-400 outline-hidden transition shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sub-header counter & sort indicator */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1 font-semibold uppercase">
              <span>Field Tasks ({filteredQueue.length})</span>
              {selectedTechnician === 'SORT_RATING' ? (
                <span className="text-amber-600 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Rating Sort
                </span>
              ) : (
                <span>Priority Sort</span>
              )}
            </div>

            {/* Task List Items */}
            <div className="space-y-2 flex-1 overflow-y-auto">
              {filteredQueue.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-mono space-y-1.5">
                  <p>No matching field tasks found</p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-blue-600 underline text-xs cursor-pointer"
                    >
                      Clear search filter
                    </button>
                  )}
                </div>
              ) : (
                filteredQueue.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  const canDelete =
                    isSupervisorOrAdmin || task.status === 'Resolved';

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask((prev) => (prev?.id === task.id ? null : task))}
                      className={`p-2.5 rounded-lg border transition cursor-pointer text-xs space-y-1.5 group relative ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      {/* Row 1 (Header Strip): Case ID + Asset Tag Pill on left; Priority Badge + Delete icon on right */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono font-bold text-blue-600 text-xs truncate">
                            {task.id}
                          </span>
                          <span className="font-mono font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded text-[10px] shrink-0 truncate max-w-[140px]">
                            {task.assetTag}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
                              task.priority === 'Critical'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : task.priority === 'High'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {task.priority}
                          </span>

                          {/* Quick delete icon on card */}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmTask(task);
                              }}
                              title="Delete / Archive task"
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2 (Issue & Footer Strip): 1-line truncated Issue Title on left; Tech Name (⭐4.9) + Steps (4/4) + Status Pill on right */}
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <p className="text-slate-700 font-medium truncate flex-1 min-w-0" title={task.title}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                          <span className="text-slate-600 font-semibold truncate max-w-[90px]" title={task.assignedTechnicianName}>
                            👤 {task.assignedTechnicianName.split(' ')[0]} <span className="text-amber-700 font-bold">⭐{task.assignedTechnicianRating.toFixed(1)}</span>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-bold text-slate-800">
                            {task.completedSteps}/{task.stepsCount}
                          </span>
                          {task.completedSteps === task.stepsCount && task.stepsCount > 0 ? (
                            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded text-[9px]">
                              RESOLVED
                            </span>
                          ) : task.isStarted ? (
                            <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded text-[9px]">
                              IN PROGRESS
                            </span>
                          ) : (
                            <span className="font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.2 rounded text-[9px]">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Streamlined Action-Oriented Detail View */}
          {selectedTask ? (
            <div className="flex-1 min-h-0 min-w-0 p-3.5 sm:p-4 overflow-y-auto space-y-3.5 w-full">
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3.5">
                {/* 1. Clean Detail Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        {selectedTask.id}
                      </span>
                      {selectedTask.faultCode && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          FAULT: {selectedTask.faultCode}
                        </span>
                      )}
                      {selectedTask.lotoRequired ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-mono font-bold">
                          <ShieldAlert className="w-3 h-3" /> LOTO MANDATORY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                          <ShieldCheck className="w-3 h-3" /> LIVE / ISOLATED
                        </span>
                      )}

                      {/* Assigned Technician & Rating Badge */}
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-mono font-semibold">
                        <Award className="w-3 h-3 text-amber-600" />
                        {selectedTask.assignedTechnicianName}
                        <span className="text-amber-700 font-bold ml-0.5">
                          ⭐ {selectedTask.assignedTechnicianRating} ({selectedTask.assignedTechnicianTier})
                        </span>
                      </span>
                    </div>

                    <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                      {selectedTask.title}
                    </h2>

                    {/* Single-Line Metadata Strip: Asset | Date Dispatched | Plant */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono flex-wrap">
                      <span>
                        Asset: <strong className="text-slate-800">{selectedTask.assetTag}</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Date Dispatched:{' '}
                        <strong className="text-slate-800">
                          {selectedTask.createdAtFormatted}
                        </strong>
                      </span>
                      {selectedTask.plantName && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span>
                            Plant:{' '}
                            <strong className="text-slate-800">{selectedTask.plantName}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Priority, Status Pills & Delete Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                        selectedTask.priority === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : selectedTask.priority === 'High'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {selectedTask.priority}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-xs font-mono font-bold">
                      {selectedTask.status}
                    </span>

                    {/* Role-guarded Delete Task Button */}
                    {(isSupervisorOrAdmin || selectedTask.status === 'Resolved') && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmTask(selectedTask)}
                        title="Delete task from active queue (Purge to history)"
                        className="p-1.5 border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition cursor-pointer shadow-2xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Deselect / Close Button (Requirement 1) */}
                    <button
                      type="button"
                      onClick={() => setSelectedTask(null)}
                      title="Close task details (Return to empty state)"
                      className="p-1.5 border border-slate-200 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer shadow-2xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 2. Collapsible Diagnostic Context */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-slate-50/80 hover:bg-slate-100/80 transition text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-800">
                        View Diagnostic Context
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                        (RCA Hypothesis & Field Symptoms)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                      <span>{showDiagnostics ? 'Collapse' : 'Expand'}</span>
                      {showDiagnostics ? (
                        <ChevronUp className="w-4 h-4 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-600" />
                      )}
                    </div>
                  </button>

                  {showDiagnostics && (
                    <div className="p-4 border-t border-slate-200 bg-white space-y-3 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
                          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold block">
                            Field Symptom
                          </span>
                          <p className="text-slate-800 leading-relaxed font-medium">
                            {selectedTask.symptomDescription}
                          </p>
                        </div>
                        {selectedTask.topRootCause && (
                          <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 space-y-1">
                            <span className="text-[10px] font-mono text-blue-600 uppercase font-semibold block">
                              Suspected Root Cause
                            </span>
                            <p className="text-blue-900 font-bold leading-relaxed">
                              {selectedTask.topRootCause}
                              {selectedTask.probability && (
                                <span className="ml-1 text-xs font-mono font-semibold text-blue-700">
                                  ({selectedTask.probability}% probability)
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {selectedTask.recommendedFix && (
                        <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-xs space-y-1">
                          <span className="text-[10px] font-mono text-emerald-700 uppercase font-semibold block">
                            Recommended Corrective Action
                          </span>
                          <p className="text-slate-800 font-medium">
                            {selectedTask.recommendedFix}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Task Execution Board */}
                {!selectedTask.isStarted ? (
                  /* UNSTARTED STATE: Fixed single-play icon "Start Work Execution" */
                  <div className="p-6 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white text-center space-y-4 shadow-2xs">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Ready for Field Work Execution
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Authorized procedure:{' '}
                        <span className="font-semibold text-slate-700">
                          {selectedTask.sopDocument}
                        </span>
                        . Ensure all required safety gear and LOTO protocol are prepared before
                        starting.
                      </p>
                    </div>

                    <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-3">
                      {/* Fixed: Single play icon with no duplicate ▶ glyph */}
                      <button
                        onClick={() => handleStartExecution(selectedTask.id)}
                        className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg text-sm inline-flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Start Work Execution</span>
                      </button>

                      {/* Ask Copilot with Pre-filled Specifications Context */}
                      <button
                        onClick={() => handleAskCopilot(selectedTask)}
                        className="w-full sm:w-auto px-4 py-3 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
                      >
                        <Cpu className="w-4 h-4 text-blue-600" />
                        <span>Ask Copilot for Specifications</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* STARTED STATE: Clean Vertical Checklist Execution Board */
                  <div className="space-y-3.5">
                    {/* Execution Board Header & Progress (Strict Persistence Sync) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">Execution Board</span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ACTIVE RUN
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Procedure: {selectedTask.sopDocument}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-slate-800">
                            {selectedTask.completedSteps} / {selectedTask.stepsCount} Steps
                          </span>
                          <div className="w-28 sm:w-36 h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-emerald-600 transition-all duration-300"
                              style={{
                                width: `${
                                  (selectedTask.completedSteps /
                                    Math.max(1, selectedTask.stepsCount)) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Strict Server Sync Button (Replaced destructive reset icon) */}
                        <button
                          onClick={() => fetchQueue(true)}
                          disabled={syncing}
                          title="Sync latest progress from server (Never resets completed steps)"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-200 rounded transition cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* 2x2 Grid of Execution Steps with Auto-Slim Completed Steps (Requirement 2) */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                      {selectedTask.steps.map((step) => {
                        const isCompleted = step.status === 'COMPLETED';
                        const isActive = step.status === 'IN_PROGRESS';

                        if (isCompleted) {
                          return (
                            <div
                              key={step.id}
                              className="p-3 rounded-lg border transition bg-emerald-50/40 border-emerald-200/80 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <CheckSquare className="w-4 h-4 text-emerald-600 fill-emerald-50 shrink-0" />
                                  <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                    STEP {step.stepNumber.toString().padStart(2, '0')}
                                  </span>
                                  <h4 className="text-xs font-semibold text-slate-700 truncate line-through">
                                    {step.title}
                                  </h4>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded shadow-2xs shrink-0">
                                  <Lock className="w-2.5 h-2.5 text-emerald-700" />
                                  <span>Completed</span>
                                </span>
                              </div>
                              <p className="line-clamp-1 text-xs text-slate-400 pl-6" title={step.instruction}>
                                {step.instruction}
                              </p>
                            </div>
                          );
                        }

                        if (isActive) {
                          return (
                            <div
                              key={step.id}
                              className="p-3 rounded-lg border transition bg-blue-50/30 border-blue-400 ring-2 ring-blue-400/20 shadow-xs space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStep(selectedTask.id, step.id)}
                                    className="mt-0.5 text-slate-400 hover:text-blue-600 cursor-pointer shrink-0"
                                    title="Click to confirm step"
                                  >
                                    <Square className="w-4 h-4 text-slate-400 hover:text-blue-600" />
                                  </button>
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                        STEP {step.stepNumber.toString().padStart(2, '0')}
                                      </span>
                                      <h4 className="text-xs font-bold text-slate-900 leading-tight">
                                        {step.title}
                                      </h4>
                                      {step.requiresLoto && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                          <ShieldAlert className="w-2.5 h-2.5" /> LOTO
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-700 leading-relaxed">
                                      {step.instruction}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded shrink-0">
                                  ACTIVE STEP
                                </span>
                              </div>

                              {/* Active Step Dedicated Actions */}
                              <div className="pt-2 border-t border-blue-200/80 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteAndNext(selectedTask.id, step.id)}
                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1 transition shadow-xs cursor-pointer whitespace-nowrap"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Confirm Step & Next</span>
                                    <ArrowRight className="w-3 h-3 ml-0.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleMarkTaskSolved(selectedTask, step)}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1 transition shadow-xs cursor-pointer whitespace-nowrap active:scale-95"
                                    title="Fault resolved at this procedure step — complete ticket and log to Maintenance History"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Issue Solved Here</span>
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleAskCopilot(selectedTask, step)}
                                    className="px-2 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                  >
                                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Copilot</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenOemModal(selectedTask)}
                                    className="px-2 py-1.5 border border-amber-300 hover:border-amber-400 bg-amber-50/80 hover:bg-amber-100/80 text-amber-900 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                    title="Hardware blocked or requires manufacturer factory intervention"
                                  >
                                    <Building2 className="w-3.5 h-3.5 text-amber-700" />
                                    <span>OEM</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        /* PENDING STATE */
                        return (
                          <div
                            key={step.id}
                            className="p-3 rounded-lg border transition bg-white border-slate-200 space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleStep(selectedTask.id, step.id)}
                                  className="mt-0.5 text-slate-300 hover:text-slate-500 cursor-pointer shrink-0"
                                  title="Click to confirm step"
                                >
                                  <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                                </button>
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      STEP {step.stepNumber.toString().padStart(2, '0')}
                                    </span>
                                    <h4 className="text-xs font-semibold text-slate-800 leading-tight">
                                      {step.title}
                                    </h4>
                                    {step.requiresLoto && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                        <ShieldAlert className="w-2.5 h-2.5" /> LOTO
                                      </span>
                                    )}
                                  </div>
                                  <p className="line-clamp-2 text-xs text-slate-500 leading-relaxed">
                                    {step.instruction}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded shrink-0">
                                PENDING
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Fallback Unresolved Action if technician is blocked / hardware beyond in-house repair */}
                    {selectedTask.completedSteps < selectedTask.stepsCount && (
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                        <div className="flex items-center gap-2 text-amber-900 font-medium">
                          <Building2 className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>
                            Technician blocked or internal sub-assembly requires OEM factory intervention?
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenOemModal(selectedTask)}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md inline-flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>🏭 Issue Unresolved — Escalate to OEM / Manufacturer</span>
                        </button>
                      </div>
                    )}

                    {/* Completion Banner when all steps are done (Requirement 3: direct Archive & Expert Knowledge actions) */}
                    {selectedTask.completedSteps === selectedTask.stepsCount &&
                      selectedTask.stepsCount > 0 && (
                        <div className="py-2.5 px-4 rounded-lg bg-emerald-50 border border-emerald-300 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-2xs">
                          <div className="flex items-center gap-2 text-emerald-900 font-medium">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              <strong className="font-bold text-emerald-950">
                                All {selectedTask.stepsCount}/{selectedTask.stepsCount} Execution Steps Completed
                              </strong>{' '}
                              <span className="text-emerald-700 text-[11px] hidden md:inline">
                                • Field maintenance verified & baseline restored.
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {/* Secondary Action: Add Tip to Expert Knowledge */}
                            <button
                              type="button"
                              onClick={() => handleAddTipToExpertKnowledge(selectedTask)}
                              className="px-3 py-1.5 bg-white hover:bg-emerald-100/60 border border-emerald-300 text-emerald-800 font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer text-xs"
                              title="Capture field insights and tricks directly into Expert Knowledge"
                            >
                              <Lightbulb className="w-3.5 h-3.5 text-amber-500 fill-amber-100" />
                              <span>💡 Add Tip to Expert Knowledge</span>
                            </button>

                            {/* Primary Action: Archive to Maintenance History */}
                            <button
                              type="button"
                              onClick={() => handleArchiveTaskToHistory(selectedTask)}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer text-xs active:scale-95"
                              title="Archive verified repair record to Maintenance History and clear from active queue"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />
                              <span>✅ Archive to Maintenance History</span>
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFC]">
              <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                  <Wrench className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 font-sans">No Ticket Selected</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans max-w-sm mx-auto">
                  Click any ticket from the left panel list to inspect diagnostic context, assigned technician status, and execution steps.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Delete Confirmation Modal */}
      {deleteConfirmTask && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Task from Queue?</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {deleteConfirmTask.id} · {deleteConfirmTask.assetTag}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove this task from the active technician queue? Completed
              and historical records will remain archived permanently in{' '}
              <strong className="text-slate-800">Maintenance History</strong>.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTask(null)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTask(deleteConfirmTask)}
                disabled={deleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                {deleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{deleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OEM Vendor Escalation Modal (L4 Fallback) */}
      {isOemModalOpen && oemTargetTask && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/50">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    L4 OEM Escalation & Manufacturer Warranty Dispatch
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hardware beyond plant field repair · Auto-compiled official manufacturer service dossier
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOemModalOpen(false);
                  setOemTargetTask(null);
                }}
                disabled={isSubmittingOem}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Auto-Compiled Context Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Asset Tag</span>
                <span className="font-bold text-slate-900">{oemTargetTask.assetTag}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Equipment Name</span>
                <span className="font-bold text-slate-900 truncate block">{oemTargetTask.assetName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Ticket Number</span>
                <span className="font-bold text-blue-600">{oemTargetTask.id}</span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* OEM Manufacturer */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    OEM Manufacturer / Authorized Partner
                  </label>
                  <input
                    type="text"
                    value={oemVendorName}
                    onChange={(e) => setOemVendorName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-sans"
                    placeholder="e.g. Siemens Industry AG, DMG Mori, Flowserve"
                  />
                </div>

                {/* Dispatch Email */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Vendor Warranty Desk / SLA Dispatch Email
                  </label>
                  <input
                    type="email"
                    value={oemContactEmail}
                    onChange={(e) => setOemContactEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono"
                    placeholder="service.support@vendor.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Fault Code */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Diagnostic Fault / Error Code
                  </label>
                  <input
                    type="text"
                    value={oemFaultCode}
                    onChange={(e) => setOemFaultCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-hidden focus:border-blue-500"
                    placeholder="e.g. ERR-702-HW-FATAL"
                  />
                </div>

                {/* SLA Response Tier */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Contracted SLA Warranty Priority Tier
                  </label>
                  <select
                    value={oemSlaPriority}
                    onChange={(e) => setOemSlaPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-sans cursor-pointer"
                  >
                    <option value="L4 Critical / 4-Hour Emergency Dispatch">
                      🚨 L4 Critical — 4-Hour Emergency Onsite Dispatch
                    </option>
                    <option value="L4 High / Next Business Day Field Engineer">
                      ⚠️ L4 High — Next Business Day Field Engineer
                    </option>
                    <option value="L4 Standard / Factory Remote Telemetry Analysis">
                      📡 L4 Standard — Factory Remote Telemetry Analysis
                    </option>
                  </select>
                </div>
              </div>

              {/* RCA Findings */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  Root Cause Analysis (RCA) Findings & Hypothesis
                </label>
                <input
                  type="text"
                  value={oemRcaFindings}
                  onChange={(e) => setOemRcaFindings(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-sans"
                  placeholder="Summary of RCA investigation findings"
                />
              </div>

              {/* Technician's Failed Step Notes */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 flex items-center justify-between">
                  <span>Technician Blocker & Failed Step Evidence</span>
                  <span className="text-[10px] text-slate-400 font-normal font-mono">
                    Required for OEM warranty claim validation
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={oemFailedNotes}
                  onChange={(e) => setOemFailedNotes(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-sans resize-none leading-relaxed"
                  placeholder="Describe why field repair was blocked and what OEM specialized tooling or factory replacement parts are necessary..."
                />
              </div>

              {/* Advisory note */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Confirming this action will update ticket status to{' '}
                  <strong className="font-mono text-amber-800">ESCALATED_TO_OEM</strong>, lock in-house field
                  execution, and log the official warranty service ticket in plant records.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsOemModalOpen(false);
                  setOemTargetTask(null);
                }}
                disabled={isSubmittingOem}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOemDispatch}
                disabled={isSubmittingOem}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                {isSubmittingOem ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Building2 className="w-3.5 h-3.5" />
                )}
                <span>{isSubmittingOem ? 'Dispatching...' : 'Dispatch Official OEM Service Request'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expert Knowledge Capture Modal upon Task Resolution */}
      <ExpertKnowledgeCaptureModal
        isOpen={isExpertCaptureOpen}
        onClose={() => setIsExpertCaptureOpen(false)}
        prefillData={expertCapturePrefill}
      />
    </div>
  );
};

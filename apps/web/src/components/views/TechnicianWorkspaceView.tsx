import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Wrench,
  Clock,
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
} from 'lucide-react';

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
  role: string;
  rating: number;
  tier: string;
}

export const TECHNICIAN_ROSTER: TechProfile[] = [
  { id: 'tech-1', name: 'Alex Rivera', role: 'Mechanical Systems Specialist', rating: 4.9, tier: 'Top Rated' },
  { id: 'tech-2', name: 'Marcus Vance', role: 'Senior Hydraulic Engineer', rating: 4.8, tier: 'High Performer' },
  { id: 'tech-3', name: 'Sarah Chen', role: 'Electrical Controls Specialist', rating: 4.9, tier: 'Top Rated' },
  { id: 'tech-4', name: 'Elena Rostova', role: 'Lead Vibration Analyst', rating: 4.7, tier: 'Certified Specialist' },
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
}> = ({ onLaunchSop, onNavigateToCopilot }) => {
  const { user, token, organization, isOwnerOrAdmin, membership } = useAuth();
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
        if (!rawDate) return 'Oct 23, 12:07 PM';
        try {
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) return 'Oct 23, 12:07 PM';
          const month = d.toLocaleString('en-US', { month: 'short' });
          const day = d.getDate();
          let hours = d.getHours();
          const minutes = d.getMinutes().toString().padStart(2, '0');
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
        } catch {
          return 'Oct 23, 12:07 PM';
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

      // Preserve currently selected task if it still exists
      setSelectedTask((prevSelected) => {
        if (!prevSelected) return allTasks.length > 0 ? allTasks[0] : null;
        const matched = allTasks.find(
          (t) => t.id === prevSelected.id || (t.rawCaseId && t.rawCaseId === prevSelected.rawCaseId)
        );
        return matched || (allTasks.length > 0 ? allTasks[0] : null);
      });
    } catch (err) {
      console.error('Failed to load technician queue:', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [token, organization?.id]);

  useEffect(() => {
    fetchQueue(false);
  }, [fetchQueue]);

  useEffect(() => {
    setShowDiagnostics(false);
  }, [selectedTask?.id]);

  // Compute live workload and live progress % per technician across active tasks
  const technicianStats = useMemo(() => {
    return TECHNICIAN_ROSTER.map((tech) => {
      const assigned = tasks.filter((t) => t.assignedTechnicianName === tech.name);
      const totalSteps = assigned.reduce((sum, t) => sum + t.stepsCount, 0);
      const doneSteps = assigned.reduce((sum, t) => sum + t.completedSteps, 0);
      const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
      return {
        ...tech,
        assignedCount: assigned.length,
        totalSteps,
        doneSteps,
        progressPct,
      };
    });
  }, [tasks]);

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

  // Toggle step completion via checkbox (Strict Persistence to LocalStorage & Backend Database)
  const handleToggleStep = async (taskId: string, stepId: string) => {
    let targetTask: TechTask | undefined;
    let nextStepStatus: TechStep['status'] = 'COMPLETED';

    setTasks((prevTasks) =>
      prevTasks.map((t) => {
        if (t.id !== taskId) return t;
        targetTask = t;

        const updatedSteps = t.steps.map((step) => {
          if (step.id === stepId) {
            nextStepStatus = step.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
            return { ...step, status: nextStepStatus };
          }
          return step;
        });

        const firstPendingIdx = updatedSteps.findIndex((s) => s.status === 'PENDING');
        if (firstPendingIdx !== -1 && !updatedSteps.some((s) => s.status === 'IN_PROGRESS')) {
          updatedSteps[firstPendingIdx].status = 'IN_PROGRESS';
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

        return updatedTask;
      })
    );

    // Persist step to backend database
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
            status: nextStepStatus,
            technicianNotes: 'Executed via Technician Field Workspace',
          }),
        }).catch(() => null);
      } catch (err) {
        console.warn('Backend step update async push notice:', err);
      }
    }
  };

  // Complete Step & Advance to next step (Strict Persistence to LocalStorage & Backend Database)
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

    const formattedPrompt = `Provide exact OEM technical specifications, torque values, clearance tolerances, and safety parameters for ${task.assetTag} regarding ${summary} — specifically for executing [${activeStepTitle}: ${activeStepDesc}].`;

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
                      onClick={() => setSelectedTask(task)}
                      className={`p-3 rounded-lg border transition cursor-pointer text-xs space-y-2 group relative ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Row: Case ID, Date Dispatched, Priority Pill */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-blue-600 text-[11px] truncate">
                            {task.id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            {task.createdAtFormatted}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              task.priority === 'Critical'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : task.priority === 'High'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {task.priority}
                          </span>

                          {/* Quick delete icon on card (visible on hover for Admins/Supervisors or Resolved tasks) */}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmTask(task);
                              }}
                              title="Delete task from active queue (Purge to history)"
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Middle Row: Asset Tag (bold) + 1-Line Short Issue Title (truncated) */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                          {task.assetTag}
                        </span>
                        <p className="text-slate-800 text-xs font-medium truncate" title={task.title}>
                          {task.title}
                        </p>
                      </div>

                      {/* Technician Rating & Workload Badge */}
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTechnician(task.assignedTechnicianName);
                          }}
                          className="flex items-center gap-1.5 hover:text-blue-600 transition cursor-pointer"
                          title="Click to filter by this technician"
                        >
                          <span className="font-semibold text-slate-700">
                            👤 {task.assignedTechnicianName}
                          </span>
                          <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                            {task.assignedTechnicianRating}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: Steps Progress Counter & Status Tag */}
                      <div className="flex items-center justify-between text-[11px] font-mono pt-1.5 border-t border-slate-100 text-slate-500">
                        <span>
                          Steps:{' '}
                          <strong className="text-slate-800">
                            {task.completedSteps}/{task.stepsCount}
                          </strong>
                        </span>
                        {task.isStarted && task.completedSteps < task.stepsCount && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            IN PROGRESS
                          </span>
                        )}
                        {task.completedSteps === task.stepsCount && task.stepsCount > 0 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            RESOLVED
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Streamlined Action-Oriented Detail View */}
          {selectedTask ? (
            <div className="flex-1 min-h-0 min-w-0 p-5 lg:p-6 overflow-y-auto space-y-5 w-full">
              <div className="bg-white rounded-xl border border-slate-200 p-5 lg:p-6 shadow-xs space-y-5">
                {/* 1. Clean Detail Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        {selectedTask.id}
                      </span>
                      {selectedTask.faultCode && (
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          FAULT: {selectedTask.faultCode}
                        </span>
                      )}
                      {selectedTask.lotoRequired ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[11px] font-mono font-bold">
                          <ShieldAlert className="w-3 h-3" /> LOTO MANDATORY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-bold">
                          <ShieldCheck className="w-3 h-3" /> LIVE / ISOLATED
                        </span>
                      )}

                      {/* Assigned Technician & Rating Badge */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-mono font-semibold">
                        <Award className="w-3 h-3 text-amber-600" />
                        {selectedTask.assignedTechnicianName}
                        <span className="text-amber-700 font-bold ml-0.5">
                          ⭐ {selectedTask.assignedTechnicianRating} ({selectedTask.assignedTechnicianTier})
                        </span>
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-slate-900 leading-tight">
                      {selectedTask.title}
                    </h2>

                    {/* Single-Line Metadata Strip: Asset | Date Dispatched | Plant */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono flex-wrap pt-0.5">
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
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                        selectedTask.priority === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : selectedTask.priority === 'High'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {selectedTask.priority}
                    </span>
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 text-xs font-mono font-bold">
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
                  </div>
                </div>

                {/* 2. Collapsible Diagnostic Context */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50/80 hover:bg-slate-100/80 transition text-left cursor-pointer"
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
                  <div className="space-y-4">
                    {/* Execution Board Header & Progress (Strict Persistence Sync) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
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

                    {/* Vertical Checklist Steps */}
                    <div className="space-y-2.5">
                      {selectedTask.steps.map((step) => {
                        const isCompleted = step.status === 'COMPLETED';
                        const isActive = step.status === 'IN_PROGRESS';

                        return (
                          <div
                            key={step.id}
                            className={`p-4 rounded-lg border transition space-y-3 ${
                              isCompleted
                                ? 'bg-slate-50/70 border-slate-200 opacity-90'
                                : isActive
                                ? 'bg-blue-50/30 border-blue-400 ring-2 ring-blue-400/20 shadow-xs'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* Checkbox & Step Info */}
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleStep(selectedTask.id, step.id)}
                                  className="mt-0.5 text-slate-400 hover:text-blue-600 transition cursor-pointer shrink-0"
                                >
                                  {isCompleted ? (
                                    <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-50" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                                  )}
                                </button>

                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      STEP {step.stepNumber.toString().padStart(2, '0')}
                                    </span>
                                    <h4
                                      className={`text-xs font-bold leading-tight ${
                                        isCompleted
                                          ? 'line-through text-slate-500 font-medium'
                                          : 'text-slate-900'
                                      }`}
                                    >
                                      {step.title}
                                    </h4>
                                    {step.requiresLoto && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                        <ShieldAlert className="w-2.5 h-2.5" /> LOTO REQUIRED
                                      </span>
                                    )}
                                  </div>

                                  <p
                                    className={`text-xs leading-relaxed ${
                                      isCompleted ? 'text-slate-400' : 'text-slate-600'
                                    }`}
                                  >
                                    {step.instruction}
                                  </p>
                                </div>
                              </div>

                              {/* Status Tag */}
                              <div className="shrink-0">
                                {isCompleted ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                    <Check className="w-3 h-3" /> DONE
                                  </span>
                                ) : isActive ? (
                                  <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                    ACTIVE STEP
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                    PENDING
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Active Step Dedicated Actions */}
                            {isActive && (
                              <div className="pt-2.5 border-t border-blue-100 flex flex-wrap items-center justify-between gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleAskCopilot(selectedTask, step)}
                                  className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                                >
                                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Ask Copilot for Specifications</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCompleteAndNext(selectedTask.id, step.id)}
                                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Complete Step & Next</span>
                                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Completion Banner when all steps are done */}
                    {selectedTask.completedSteps === selectedTask.stepsCount &&
                      selectedTask.stepsCount > 0 && (
                        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>
                              All execution steps completed. Field maintenance verified & ready for
                              formal signoff.
                            </span>
                          </div>
                          <button
                            onClick={() => onLaunchSop?.(selectedTask.id)}
                            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                          >
                            <span>Open Formal SOP Signoff</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-slate-400 text-xs font-mono">
              Select a field task from the queue to start execution
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
    </div>
  );
};

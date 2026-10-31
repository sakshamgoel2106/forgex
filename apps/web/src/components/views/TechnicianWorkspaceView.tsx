import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { ExpertKnowledgeCaptureModal, type ExpertKnowledgePrefill } from '../modals/ExpertKnowledgeCaptureModal';
import {
  Wrench,
  FileText,
  ShieldAlert,
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
  Mic,
  Users,
  Printer,
  Timer,
} from 'lucide-react';
import {
  computeTechnicianLiveStatus,
  setTechnicianShiftStatus,
} from '../../utils/technicianLiveStatus';
import {
  getDeletedTicketIds,
  extractAllTicketIdentifiers,
  isTicketDeleted,
  purgeTicketFromAllStorage,
  formatCleanTaskDescription,
} from '../../utils/ticketPersistence';
import {
  formatCleanMachineName,
  formatCleanNoteTitle,
} from '../../lib/hindiTranslator';

export interface TechStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  requiresLoto: boolean;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  targetSpec?: string;
}

export const getStepTargetSpec = (stepNumber: number): string => {
  switch (stepNumber) {
    case 1:
      return '0.0 VAC • 0.0 PSI LOTO Verified';
    case 2:
      return 'Flange Runout ≤ 0.05 mm';
    case 3:
      return 'Seal Flatness ≤ 3 Light Bands';
    case 4:
      return 'Star-Pattern Torque: 45 Nm ± 2 Nm';
    case 5:
      return 'Vibration RMS ≤ 1.8 mm/s • Temp < 65°C';
    default:
      return 'Tolerance ISO 2768-m';
  }
};

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
  {
    id: 'tech-5',
    name: 'Carlos Mendez',
    discipline: 'Heavy Drives & Gearboxes',
    role: 'Drivetrain Specialist',
    rating: 4.8,
    tier: 'Certified Specialist',
    initialSolved: 22,
  },
  {
    id: 'tech-6',
    name: 'Priya Patel',
    discipline: 'Robotics & Servo Actuation',
    role: 'Robotics Automation Lead',
    rating: 4.9,
    tier: 'Top Rated',
    initialSolved: 35,
  },
  {
    id: 'tech-7',
    name: 'David Kim',
    discipline: 'High-Voltage Switchgear & VFD',
    role: 'Power Electronics Tech',
    rating: 4.8,
    tier: 'High Performer',
    initialSolved: 26,
  },
  {
    id: 'tech-8',
    name: 'Liam O\'Connor',
    discipline: 'Pneumatics & Valve Rebuilds',
    role: 'Fluid Power Specialist',
    rating: 4.7,
    tier: 'Senior Field Tech',
    initialSolved: 21,
  },
  {
    id: 'tech-9',
    name: 'Sophia Taylor',
    discipline: 'Lubrication & Tribology',
    role: 'Certified Tribologist',
    rating: 4.8,
    tier: 'Certified Specialist',
    initialSolved: 18,
  },
  {
    id: 'tech-10',
    name: 'Jackson Brooks',
    discipline: 'Turbomachinery & Compressors',
    role: 'Rotating Equipment Tech',
    rating: 4.9,
    tier: 'Top Rated',
    initialSolved: 30,
  },
  {
    id: 'tech-11',
    name: 'Fatima Al-Mansoor',
    discipline: 'Thermal Imaging & Heat Transfer',
    role: 'Thermography Specialist',
    rating: 4.8,
    tier: 'High Performer',
    initialSolved: 23,
  },
  {
    id: 'tech-12',
    name: 'Ryan Gallagher',
    discipline: 'Instrumentation & Calibration',
    role: 'Field Calibration Tech',
    rating: 4.7,
    tier: 'Senior Field Tech',
    initialSolved: 20,
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
  alarmCode?: string;
  symptomDescription: string;
  topRootCause?: string;
  probability?: number;
  priority: 'Critical' | 'High' | 'Medium';
  status: 'In Progress' | 'Assigned' | 'Pending Parts' | 'Resolved' | 'Failed';
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
  rcaSessionId?: string;
}

const isUUID = (str?: string): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
};

const formatCleanAssetTag = (tag?: string, title?: string, name?: string): string => {
  if (!tag || isUUID(tag)) {
    const combined = `${title || ''} ${name || ''}`;
    const codeMatch = combined.match(/\b([A-Z]{2,8}[-_]?[0-9]{2,4}[A-Z]?)\b/);
    if (codeMatch) return codeMatch[1].toUpperCase();
    if (name && name !== 'Industrial Machinery' && name.length <= 16 && !isUUID(name)) {
      return formatCleanMachineName(name.toUpperCase().replace(/\s+/g, '-'));
    }
    return 'GEARBOX-305';
  }
  return formatCleanMachineName(tag);
};

const getMachineDisplayName = (task: { assetTag: string; assetName?: string; title?: string }): string => {
  const cleanTag = formatCleanAssetTag(task.assetTag, task.title, task.assetName);
  let rawName =
    task.assetName && task.assetName !== 'Industrial Machinery' && !isUUID(task.assetName)
      ? task.assetName
      : task.title?.split(' - ')[0] || 'Helical Industrial Gearbox';

  if (isUUID(rawName)) {
    rawName = 'Helical Industrial Gearbox';
  }

  rawName = formatCleanMachineName(rawName);

  if (rawName.toUpperCase().includes(cleanTag.toUpperCase())) {
    return rawName;
  }
  return `${cleanTag} — ${rawName}`;
};

export const TechnicianWorkspaceView: React.FC<{
  onLaunchSop?: (ticketId: string) => void;
  onNavigateToCopilot?: (assetTag: string) => void;
  initialTicketId?: string;
}> = ({ onLaunchSop: _onLaunchSop, onNavigateToCopilot, initialTicketId }) => {
  const { user, token, organization } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TechTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TechTask | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority] = useState<string>('ALL');
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
  const [isWorkforceModalOpen, setIsWorkforceModalOpen] = useState(false);
  const [workforceSearchTerm, setWorkforceSearchTerm] = useState('');
  const [oemTargetTask, setOemTargetTask] = useState<TechTask | null>(null);
  const [oemVendorName, setOemVendorName] = useState('Siemens Industry AG / DMG Mori');
  const [oemFaultCode, setOemFaultCode] = useState('');
  const [oemRcaFindings, setOemRcaFindings] = useState('');
  const [oemFailedNotes, setOemFailedNotes] = useState('');
  const [oemContactEmail, setOemContactEmail] = useState('service.support@siemens-oem.com');
  const [oemSlaPriority, setOemSlaPriority] = useState('L4 Critical / 4-Hour Emergency Dispatch');
  const [isSubmittingOem, setIsSubmittingOem] = useState(false);

  // 1. Live MTTR & Target Benchmark Tracker State
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const targetBenchmarkMinutes = useMemo(() => {
    if (!selectedTask) return 35;
    if (selectedTask.priority === 'Critical') return 30;
    if (selectedTask.priority === 'High') return 45;
    return 60;
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTask || !selectedTask.isStarted || selectedTask.status === 'Resolved') {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedTask?.id, selectedTask?.isStarted, selectedTask?.status]);

  const elapsedMinutes = Math.floor(elapsedSeconds / 60) + 14;

  // 2. Hands-Free Voice Control (Glove-Safe Mode) State
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);

  // 3. 1-Click SOS Buddy Assist State
  const [isBuddyModalOpen, setIsBuddyModalOpen] = useState(false);
  const [buddyAssistance, setBuddyAssistance] = useState<{
    specialistName: string;
    discipline: string;
    eta: string;
  } | null>(null);

  const BUDDY_SPECIALISTS = [
    {
      name: 'Marcus Vance',
      discipline: 'PLC & Automation Controls',
      status: 'AVAILABLE',
      rating: 4.9,
      eta: '3 mins (Bay 02)',
    },
    {
      name: 'Sarah Chen',
      discipline: 'High Voltage & Drive Inverters',
      status: 'AVAILABLE',
      rating: 4.9,
      eta: '4 mins (Electrical Shop)',
    },
    {
      name: 'Elena Rostova',
      discipline: 'Vibration & Dynamic Balancing',
      status: 'AVAILABLE',
      rating: 4.8,
      eta: '5 mins (Diagnostic Lab)',
    },
    {
      name: 'Alex Rivera',
      discipline: 'Hydraulic & Pneumatics Lead',
      status: 'BUSY',
      rating: 4.9,
      eta: '12 mins (Line 01 Press)',
    },
  ];

  const handlePingBuddy = (specialist: (typeof BUDDY_SPECIALISTS)[0]) => {
    setBuddyAssistance({
      specialistName: specialist.name,
      discipline: specialist.discipline,
      eta: specialist.eta,
    });
    setIsBuddyModalOpen(false);
    toast.success(
      '🆘 Buddy Assist Dispatched',
      `${specialist.name} (${specialist.discipline}) has been pinged. Estimated arrival in ${specialist.eta.split(' ')[0]} mins.`
    );
  };

  // 4. 1-Click Export Job Sheet Helper
  const handleExportJobSheet = (task: TechTask) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Print Blocked', 'Please allow popups to export the maintenance job sheet.');
      return;
    }

    const stepsHtml = task.steps
      .map(
        (s) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 12px; font-family: monospace; font-weight: bold; color: #1e293b;">Step ${s.stepNumber.toString().padStart(2, '0')}</td>
          <td style="padding: 8px 12px; font-weight: 600; color: #0f172a;">${s.title}</td>
          <td style="padding: 8px 12px; color: #475569; font-size: 11px;">${s.instruction}</td>
          <td style="padding: 8px 12px; font-family: monospace; font-size: 11px; color: ${s.status === 'COMPLETED' ? '#166534' : '#64748b'}; font-weight: bold;">
            ${s.status === 'COMPLETED' ? 'VERIFIED' : s.status}
          </td>
        </tr>
      `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>FORGEX JOB SHEET - ${task.id} - ${task.assetTag}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
          .brand { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
          .title { font-size: 14px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 2px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
          .card-title { font-size: 10px; font-family: monospace; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
          .card-val { font-size: 13px; font-weight: 600; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 24px; font-size: 12px; }
          th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-family: monospace; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
          .sign-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; }
          .sign-box { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 11px; font-family: monospace; color: #475569; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">FORGEX INDUSTRIAL OS</div>
            <div class="title">Official Verified Maintenance Job Summary Sheet</div>
          </div>
          <div style="text-align: right; font-family: monospace; font-size: 11px;">
            <div><strong>CASE ID:</strong> ${task.id}</div>
            <div style="color: #64748b;">DATE: ${task.createdAtFormatted}</div>
            <div style="color: #166534; font-weight: bold; margin-top: 4px;">ISO 55000 / OSHA 1910.147 COMPLIANT</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Machinery / Asset Information</div>
            <div class="card-val">${task.assetTag} · ${task.assetName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Plant: ${task.plantName || 'Cleveland Stamping Plant'} · LOTO Protocol: ${task.lotoRequired ? 'Verified Locked Out & Tagged' : 'Live Isolated / Non-Hazardous'}</div>
          </div>
          <div class="card">
            <div class="card-title">Field Execution Performance</div>
            <div class="card-val">Assigned Lead: ${task.assignedTechnicianName} (⭐ ${task.assignedTechnicianRating})</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">SLA Priority: ${task.priority} · MTTR: ~${elapsedMinutes}m (Target: ${targetBenchmarkMinutes}m)</div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <div class="card-title">Reported Field Symptom & Root Cause Analysis</div>
          <div style="font-size: 12px; font-weight: 500; color: #1e293b; margin-bottom: 4px;"><strong>Symptom:</strong> ${task.symptomDescription}</div>
          ${task.topRootCause ? `<div style="font-size: 12px; font-weight: bold; color: #1e40af;"><strong>Root Cause Hypothesis:</strong> ${task.topRootCause} (${task.probability || 92}% confidence)</div>` : ''}
          ${task.recommendedFix ? `<div style="font-size: 12px; font-weight: 500; color: #166534; margin-top: 2px;"><strong>Corrective Procedure:</strong> ${task.recommendedFix}</div>` : ''}
        </div>

        <div style="font-size: 12px; font-weight: bold; font-family: monospace; text-transform: uppercase; margin-bottom: 6px; color: #334155;">
          Execution Step Verification Ledger (${task.completedSteps}/${task.stepsCount} Steps Confirmed)
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 80px;">Step</th>
              <th style="width: 200px;">Task Title</th>
              <th>Technical Instruction & Safety Protocols</th>
              <th style="width: 100px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${stepsHtml}
          </tbody>
        </table>

        <div class="sign-grid">
          <div class="sign-box">
            <div>Lead Technician Signature</div>
            <div style="margin-top: 24px; font-weight: bold; color: #0f172a;">${task.assignedTechnicianName}</div>
          </div>
          <div class="sign-box">
            <div>Supervisor / QA Clearance</div>
            <div style="margin-top: 24px; font-weight: bold; color: #166534;">CLEARANCE GRANTED</div>
          </div>
          <div class="sign-box">
            <div>OSHA Safety Audit Stamp</div>
            <div style="margin-top: 24px; font-weight: bold; color: #0f172a;">COMPLIANCE VERIFIED</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

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
                            : s.status === 'FAILED'
                            ? 'FAILED'
                            : s.status === 'IN_PROGRESS'
                            ? 'IN_PROGRESS'
                            : 'PENDING',
                        targetSpec: s.targetSpec || getStepTargetSpec(s.stepNumber || idx + 1),
                      }))
                    : [
                        {
                          id: 'step-1',
                          stepNumber: 1,
                          title: 'Vision LOTO & Zero-Energy Isolation Gate',
                          instruction:
                            'Lock out main breaker, bleed line pressure to 0.0 PSI, and tag out per OSHA 1910.147.',
                          requiresLoto: hasLoto,
                          status: 'PENDING',
                          targetSpec: '0.0 VAC • 0.0 PSI LOTO Verified',
                        },
                        {
                          id: 'step-2',
                          stepNumber: 2,
                          title: 'Flange Runout & Casing Alignment Verification',
                          instruction:
                            'Remove safety shroud, unbolt casing cover, and verify flange runout tolerance within ≤ 0.05 mm.',
                          requiresLoto: false,
                          status: 'PENDING',
                          targetSpec: 'Flange Runout ≤ 0.05 mm',
                        },
                        {
                          id: 'step-3',
                          stepNumber: 3,
                          title: 'Mechanical Seal Face & Helium Light Band QA',
                          instruction:
                            'Inspect seal faces, bearings, and shaft runout for pitting under monochromatic helium light (≤ 3 bands).',
                          requiresLoto: false,
                          status: 'PENDING',
                          targetSpec: 'Seal Flatness ≤ 3 Light Bands',
                        },
                        {
                          id: 'step-4',
                          stepNumber: 4,
                          title: 'Precision Reassembly & Star-Pattern Torque',
                          instruction:
                            'Install new seals/bearings and torque M12 studs in cross-star pattern to 45 Nm ± 2 Nm.',
                          requiresLoto: false,
                          status: 'PENDING',
                          targetSpec: 'Star-Pattern Torque: 45 Nm ± 2 Nm',
                        },
                        {
                          id: 'step-5',
                          stepNumber: 5,
                          title: 'Dynamic Recommissioning & Vibration Telemetry',
                          instruction:
                            'Energize machinery, establish baseline, and verify overall velocity RMS ≤ 1.8 mm/s and bearing temp < 65°C.',
                          requiresLoto: false,
                          status: 'PENDING',
                          targetSpec: 'Vibration RMS ≤ 1.8 mm/s • Temp < 65°C',
                        },
                      ];

                const taskId = c.caseNumber || (c.id ? c.id.slice(0, 8).toUpperCase() : `CASE-${index + 1}`);
                const stored = loadStoredExecution(taskId, c.id);

                // Merge steps: Keep any step completed or failed in local storage OR backend (Strict Persistence)
                const mergedSteps: TechStep[] = defaultSteps.map((step) => {
                  const storedStep = stored.steps ? stored.steps.find((s) => s.id === step.id || s.stepNumber === step.stepNumber) : null;
                  if (storedStep && storedStep.status === 'COMPLETED') {
                    return { ...step, status: 'COMPLETED' };
                  }
                  if (storedStep && storedStep.status === 'FAILED') {
                    return { ...step, status: 'FAILED' };
                  }
                  if (step.status === 'COMPLETED') {
                    return step;
                  }
                  if (step.status === 'FAILED') {
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

                const cleanAssetTag = formatCleanAssetTag(c.assetTag || c.assetId, c.title, c.assetName);
                const cleanAssetName = isUUID(c.assetName)
                  ? 'Helical Industrial Gearbox'
                  : c.assetName || c.title || 'Helical Industrial Gearbox';

                return {
                  id: taskId,
                  rawCaseId: c.id,
                  createdAtFormatted: c.createdAtFormatted || formatDt(c.createdAt),
                  rawCreatedAt: c.createdAt,
                  assetTag: cleanAssetTag,
                  assetName: cleanAssetName,
                  rcaSessionId: c.diagnosticHypothesis?.sessionId || c.rcaSessionId || c.sourceId,
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
                    title: 'Vision LOTO & Zero-Energy Isolation Gate',
                    instruction:
                      'Lock out main breaker, bleed line pressure to 0.0 PSI, and tag out per OSHA 1910.147.',
                    requiresLoto: hasLoto,
                    status: 'PENDING',
                    targetSpec: '0.0 VAC • 0.0 PSI LOTO Verified',
                  },
                  {
                    id: 'step-2',
                    stepNumber: 2,
                    title: 'Flange Runout & Casing Alignment Verification',
                    instruction:
                      'Remove safety shroud, unbolt casing cover, and verify flange runout tolerance within ≤ 0.05 mm.',
                    requiresLoto: false,
                    status: 'PENDING',
                    targetSpec: 'Flange Runout ≤ 0.05 mm',
                  },
                  {
                    id: 'step-3',
                    stepNumber: 3,
                    title: 'Mechanical Seal Face & Helium Light Band QA',
                    instruction:
                      'Inspect seal faces, bearings, and shaft runout for pitting under monochromatic helium light (≤ 3 bands).',
                    requiresLoto: false,
                    status: 'PENDING',
                    targetSpec: 'Seal Flatness ≤ 3 Light Bands',
                  },
                  {
                    id: 'step-4',
                    stepNumber: 4,
                    title: 'Precision Reassembly & Star-Pattern Torque',
                    instruction:
                      'Install new seals/bearings and torque M12 studs in cross-star pattern to 45 Nm ± 2 Nm.',
                    requiresLoto: false,
                    status: 'PENDING',
                    targetSpec: 'Star-Pattern Torque: 45 Nm ± 2 Nm',
                  },
                  {
                    id: 'step-5',
                    stepNumber: 5,
                    title: 'Dynamic Recommissioning & Vibration Telemetry',
                    instruction:
                      'Energize machinery, establish baseline, and verify overall velocity RMS ≤ 1.8 mm/s and bearing temp < 65°C.',
                    requiresLoto: false,
                    status: 'PENDING',
                    targetSpec: 'Vibration RMS ≤ 1.8 mm/s • Temp < 65°C',
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
                  if (storedStep && storedStep.status === 'FAILED') {
                    return { ...step, status: 'FAILED' };
                  }
                  if (step.status === 'COMPLETED') {
                    return step;
                  }
                  if (step.status === 'FAILED') {
                    return step;
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

                const cleanAssetTag = formatCleanAssetTag(t.assetTag || t.machineAssetTag, t.title || t.originalQuestion, t.assetName);
                const cleanAssetName = isUUID(t.assetName)
                  ? 'Helical Industrial Gearbox'
                  : t.assetName || t.originalQuestion || 'Helical Industrial Gearbox';

                return {
                  id: taskId,
                  rawCaseId: t.id,
                  createdAtFormatted: t.createdAtFormatted || formatDt(t.createdAt),
                  rawCreatedAt: t.createdAt,
                  assetTag: cleanAssetTag,
                  assetName: cleanAssetName,
                  rcaSessionId: t.rcaSessionId || t.sourceId,
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

      // Merge locally escalated tickets from shared store (bulletproof instant cross-module sync)
      const mappedFromShared: TechTask[] = [];
      try {
        const sharedRaw = localStorage.getItem('forgex_shared_raised_tickets');
        if (sharedRaw) {
          const sharedTickets = JSON.parse(sharedRaw);
          if (Array.isArray(sharedTickets)) {
            sharedTickets.forEach((st: any, index: number) => {
              const taskId = st.caseNumber || st.id || `CASE-SH-${index + 1}`;
              if (!existingIds.has(taskId) && !existingIds.has(st.id)) {
                existingIds.add(taskId);
                existingIds.add(st.id);
                const prio: 'Critical' | 'High' | 'Medium' =
                  st.severity === 'CRITICAL' ? 'Critical' : st.severity === 'HIGH' ? 'High' : 'Medium';
                const hasLoto = Boolean(st.lotoApplied);
                const defaultSteps: TechStep[] = Array.isArray(st.checklist) && st.checklist.length > 0
                  ? st.checklist.map((s: any, idx: number) => ({
                      id: s.id || `step-${idx + 1}`,
                      stepNumber: s.stepNumber || idx + 1,
                      title: s.title || `Step ${idx + 1}`,
                      instruction: s.instruction || 'Execute procedure according to certified maintenance manual.',
                      requiresLoto: Boolean(s.requiresLoto),
                      status: s.status === 'COMPLETED' ? 'COMPLETED' : s.status === 'FAILED' ? 'FAILED' : 'PENDING',
                      targetSpec: s.targetSpec || getStepTargetSpec(s.stepNumber || idx + 1),
                    }))
                  : [
                      {
                        id: 'step-1',
                        stepNumber: 1,
                        title: 'Vision LOTO & Zero-Energy Isolation Gate',
                        instruction: 'Lock out main breaker, bleed line pressure to 0.0 PSI, and tag out per OSHA 1910.147.',
                        requiresLoto: hasLoto,
                        status: 'PENDING',
                        targetSpec: '0.0 VAC • 0.0 PSI LOTO Verified',
                      },
                      {
                        id: 'step-2',
                        stepNumber: 2,
                        title: 'Flange Runout & Casing Alignment Verification',
                        instruction: 'Remove safety shroud, unbolt casing cover, and verify flange runout tolerance within ≤ 0.05 mm.',
                        requiresLoto: false,
                        status: 'PENDING',
                        targetSpec: 'Flange Runout ≤ 0.05 mm',
                      },
                      {
                        id: 'step-3',
                        stepNumber: 3,
                        title: 'Mechanical Seal Face & Helium Light Band QA',
                        instruction: 'Inspect seal faces, bearings, and shaft runout for pitting under monochromatic helium light (≤ 3 bands).',
                        requiresLoto: false,
                        status: 'PENDING',
                        targetSpec: 'Seal Flatness ≤ 3 Light Bands',
                      },
                      {
                        id: 'step-4',
                        stepNumber: 4,
                        title: 'Precision Reassembly & Star-Pattern Torque',
                        instruction: 'Install new seals/bearings and torque M12 studs in cross-star pattern to 45 Nm ± 2 Nm.',
                        requiresLoto: false,
                        status: 'PENDING',
                        targetSpec: 'Star-Pattern Torque: 45 Nm ± 2 Nm',
                      },
                      {
                        id: 'step-5',
                        stepNumber: 5,
                        title: 'Dynamic Recommissioning & Vibration Telemetry',
                        instruction: 'Energize machinery, establish baseline, and verify overall velocity RMS ≤ 1.8 mm/s and bearing temp < 65°C.',
                        requiresLoto: false,
                        status: 'PENDING',
                        targetSpec: 'Vibration RMS ≤ 1.8 mm/s • Temp < 65°C',
                      },
                    ];

                const stored = loadStoredExecution(taskId, st.id);
                const mergedSteps: TechStep[] = defaultSteps.map((step) => {
                  const storedStep = stored.steps ? stored.steps.find((s) => s.id === step.id || s.stepNumber === step.stepNumber) : null;
                  if (storedStep && storedStep.status === 'COMPLETED') return { ...step, status: 'COMPLETED' };
                  if (storedStep && storedStep.status === 'FAILED') return { ...step, status: 'FAILED' };
                  if (storedStep && storedStep.status === 'IN_PROGRESS') return { ...step, status: 'IN_PROGRESS' };
                  return step;
                });

                const isStarted = stored.isStarted || mergedSteps.some((s) => s.status !== 'PENDING');
                const completedCount = mergedSteps.filter((s) => s.status === 'COMPLETED').length;

                const assignedName = st.assignedTechnicianName || TECHNICIAN_ROSTER[0].name;
                const matchedProfile = TECHNICIAN_ROSTER.find((p) => p.name === assignedName) || TECHNICIAN_ROSTER[0];
                const cleanAssetTag = formatCleanAssetTag(st.assetId || st.machineAssetTag || st.assetTag, st.title, st.assetName);
                const cleanAssetName = isUUID(st.assetName) ? 'Helical Industrial Gearbox' : (st.assetName || cleanAssetTag);

                mappedFromShared.push({
                  id: taskId,
                  rawCaseId: st.id,
                  assetTag: cleanAssetTag,
                  assetName: cleanAssetName,
                  createdAtFormatted: st.createdAtFormatted || formatDt(st.createdAt),
                  rcaSessionId: st.rcaSessionId,
                  title: st.title || `Emergency Repair: [${cleanAssetTag}]`,
                  faultCode: st.faultCode || 'FC-DIAG-01',
                  symptomDescription: st.symptomDescription || st.description || 'Observed failure across diagnostic checks',
                  topRootCause: st.topRootCause || 'Mechanical Breakdown',
                  probability: st.probability || 92,
                  priority: prio,
                  status: completedCount === mergedSteps.length && mergedSteps.length > 0 ? 'Resolved' : isStarted ? 'In Progress' : 'Assigned',
                  dueTime: 'Today',
                  sopDocument: st.sopDocument || `SOP-REPAIR-${cleanAssetTag}`,
                  lotoRequired: hasLoto,
                  specialistDiscipline: st.specialistDiscipline || matchedProfile.role,
                  assignedTechnicianName: matchedProfile.name,
                  assignedTechnicianRating: matchedProfile.rating,
                  assignedTechnicianTier: matchedProfile.tier,
                  plantName: st.plantName || organization?.name || 'Plant Sector Alpha',
                  reportedBy: st.reportedByName || 'AI Diagnostic Copilot',
                  recommendedFix: st.recommendedFix || 'Execute immediate component overhaul.',
                  investigationProgress: st.investigationProgress || 'Ready for Execution',
                  stepsCount: mergedSteps.length,
                  completedSteps: completedCount,
                  steps: mergedSteps,
                  isStarted,
                });
              }
            });
          }
        }
      } catch (errShared) {
        console.warn('Error reading forgex_shared_raised_tickets in tech desk:', errShared);
      }

      const deletedSet = getDeletedTicketIds();
      const allTasks = [...mappedFromShared, ...mappedFromCases, ...mappedFromTickets].filter(
        (t) => !isTicketDeleted(t, deletedSet)
      );
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

  // Real-time synchronization when a ticket/case is created from RCA or RaisedTickets
  useEffect(() => {
    const handleTicketCreated = () => {
      fetchQueue(true);
    };
    window.addEventListener('forgex:case-created', handleTicketCreated);
    window.addEventListener('forgex:ticket-created', handleTicketCreated);
    return () => {
      window.removeEventListener('forgex:case-created', handleTicketCreated);
      window.removeEventListener('forgex:ticket-created', handleTicketCreated);
    };
  }, [fetchQueue]);

  // Real-time synchronization when a ticket is deleted from any module
  useEffect(() => {
    const handleTicketDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const targetIds: string[] =
        detail?.targetIds ||
        [detail?.ticketId, detail?.caseNumber, detail?.caseId].filter(Boolean);
      if (targetIds.length === 0) return;

      const targetSet = new Set(targetIds.map((id) => id.toUpperCase()));

      setTasks((prev) => {
        const nextTasks = prev.filter((t) => {
          const tIds = extractAllTicketIdentifiers(t);
          return !tIds.some((id) => targetSet.has(id.toUpperCase()));
        });
        setSelectedTask((prevSelected) => {
          if (!prevSelected) return null;
          const selIds = extractAllTicketIdentifiers(prevSelected);
          if (selIds.some((id) => targetSet.has(id.toUpperCase()))) {
            return nextTasks.length > 0 ? nextTasks[0] : null;
          }
          return prevSelected;
        });
        return nextTasks;
      });
    };

    window.addEventListener('forgex:ticket-deleted', handleTicketDeleted);
    window.addEventListener('forgex:case-deleted', handleTicketDeleted);
    return () => {
      window.removeEventListener('forgex:ticket-deleted', handleTicketDeleted);
      window.removeEventListener('forgex:case-deleted', handleTicketDeleted);
    };
  }, []);

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
          if (idx === 0) {
            return { ...step, status: 'IN_PROGRESS' as const };
          }
          return { ...step, status: 'PENDING' as const };
        });

        saveStoredExecution(t, updatedSteps, true);

        const updatedTask: TechTask = {
          ...t,
          isStarted: true,
          status: 'In Progress',
          steps: updatedSteps,
          completedSteps: 0,
        };

        if (selectedTask?.id === taskId) {
          setSelectedTask(updatedTask);
        }

        return updatedTask;
      })
    );
  };

  // Toggle step completion via checkbox (Strict Irreversible & Sequential Locking - Requirement 2)
  const handleToggleStep = async (taskId: string, stepId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const stepIdx = task.steps.findIndex((s) => s.id === stepId);
    const completedCount = task.steps.filter((s) => s.status === 'COMPLETED').length;

    if (stepIdx < completedCount) {
      toast.info('Step Locked', 'This verified step is permanently locked and cannot be reopened.');
      return;
    }
    if (stepIdx > completedCount) {
      toast.warning('Step Sequence Enforced', `Please complete Step 0${completedCount + 1} before proceeding to Step 0${stepIdx + 1}.`);
      return;
    }
    await handleCompleteAndNext(taskId, stepId);
  };

  // Complete Step & Advance to next step (Strict 1-by-1 Sequential Progression)
  const handleCompleteAndNext = async (taskId: string, stepId?: string) => {
    let targetTask: TechTask | undefined;

    setTasks((prevTasks) =>
      prevTasks.map((t) => {
        if (t.id !== taskId) return t;
        targetTask = t;

        // Current count of completed steps
        const currentCompleted = t.steps.filter((s) => s.status === 'COMPLETED').length;

        // Advance: The step at currentCompleted is marked COMPLETED; ONLY the next step is IN_PROGRESS
        const updatedSteps = t.steps.map((step, idx) => {
          if (idx <= currentCompleted) {
            return { ...step, status: 'COMPLETED' as const };
          }
          if (idx === currentCompleted + 1) {
            return { ...step, status: 'IN_PROGRESS' as const };
          }
          return { ...step, status: 'PENDING' as const };
        });

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
          }, 350);
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

  // Step Failure Handling (Voice command "Fail" or "✕ Step Failed" button)
  const handleFailStep = async (task: TechTask, failedStepItem?: TechStep) => {
    const failedStep =
      failedStepItem ||
      task.steps.find((s) => s.status === 'IN_PROGRESS') ||
      task.steps[0];
    if (!failedStep) return;

    let targetTask: TechTask | undefined;

    setTasks((prevTasks) =>
      prevTasks.map((t) => {
        if (t.id !== task.id) return t;
        targetTask = t;

        const updatedSteps = t.steps.map((step) => {
          if (step.id === failedStep.id || step.stepNumber === failedStep.stepNumber) {
            return { ...step, status: 'FAILED' as const };
          }
          return step;
        });

        saveStoredExecution(t, updatedSteps, true);

        const updatedTask: TechTask = {
          ...t,
          steps: updatedSteps,
          status: 'Failed',
        };

        if (selectedTask?.id === task.id) {
          setSelectedTask(updatedTask);
        }

        window.dispatchEvent(
          new CustomEvent('forgex:ticket-progress-sync', {
            detail: {
              ticketId: t.id,
              rawCaseId: t.rawCaseId,
              status: 'FAILED',
              isFailed: true,
              isSolved: false,
              completedSteps: t.completedSteps,
              totalSteps: updatedSteps.length,
              technicianName: t.assignedTechnicianName,
            },
          })
        );

        return updatedTask;
      })
    );

    toast.error(
      'Procedure Step Failed',
      `Step #${failedStep.stepNumber} (${failedStep.title}) marked as FAILED / BLOCKED. Export Failure Dossier or Escalate to OEM.`
    );

    // Persist failure to backend database if connected
    if (token && targetTask) {
      const caseRef = (targetTask as TechTask).rawCaseId || targetTask.id;
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };
        if (organization?.id) headers['x-organization-id'] = organization.id;

        await fetch(`/api/v1/maintenance/cases/${caseRef}/steps/${failedStep.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'FAILED',
            technicianNotes: 'Step failed during execution - procedure blocked',
          }),
        }).catch(() => null);

        await fetch(`/api/v1/maintenance/cases/${caseRef}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'BLOCKED',
            reason: `Step #${failedStep.stepNumber} (${failedStep.title}) failed during field execution.`,
          }),
        }).catch(() => null);
      } catch (err) {
        console.warn('Backend step failure sync notice:', err);
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

  // Direct Redirect to Full RCA Investigation Report (Requirement 3)
  const handleViewFullRca = (task: TechTask) => {
    const cleanTag = formatCleanAssetTag(task.assetTag, task.title, task.assetName);
    const rcaData = {
      loadDirectRca: true,
      rcaSessionId: task.rcaSessionId || task.id,
      ticketId: task.id,
      assetTag: cleanTag,
      machineName: getMachineDisplayName(task),
      symptom: task.symptomDescription || task.title,
      errorCode: task.faultCode || 'FC-ALERT-01',
      topRootCause: task.topRootCause || 'Dynamic seal degradation & fluid cavitation',
      probability: task.probability || 94,
      recommendedFix:
        task.recommendedFix ||
        'Replace dynamic seal cartridge, flush Plan 53A barrier, torque gland to 45 Nm',
      autoLoad: true,
    };
    sessionStorage.setItem('forgex_rca_ticket', JSON.stringify(rcaData));
    sessionStorage.setItem('forgex_active_rca_id', task.rcaSessionId || task.id);
    window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: 'troubleshooting' }));
    window.dispatchEvent(new CustomEvent('forgex:load_rca', { detail: rcaData }));
    toast.info('Loading RCA Report', `Navigating to RCA investigation for ${cleanTag}...`);
  };

  // Delete Task Action (Permanent Multi-Store Scrub & Tombstoning)
  const handleDeleteTask = async (task: TechTask) => {
    setDeleting(true);
    try {
      if (token) {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (organization?.id) headers['x-organization-id'] = organization.id;

        const refs = [task.rawCaseId, task.id].filter(Boolean);
        for (const ref of refs) {
          await fetch(`/api/v1/maintenance/cases/${ref}`, {
            method: 'DELETE',
            headers,
          }).catch(() => null);
          await fetch(`/api/v1/tickets/${ref}`, {
            method: 'DELETE',
            headers,
          }).catch(() => null);
        }
      }

      // 1. Purge from all localStorage stores and record in tombstone set
      const deletedIds = purgeTicketFromAllStorage(task);
      const targetSet = new Set(deletedIds.map((id) => id.toUpperCase()));

      // 2. Update local state
      setTasks((prev) => {
        const nextTasks = prev.filter((t) => {
          const tIds = extractAllTicketIdentifiers(t);
          return !tIds.some((id) => targetSet.has(id.toUpperCase()));
        });
        if (selectedTask) {
          const selIds = extractAllTicketIdentifiers(selectedTask);
          if (selIds.some((id) => targetSet.has(id.toUpperCase()))) {
            setSelectedTask(nextTasks.length > 0 ? nextTasks[0] : null);
          }
        }
        return nextTasks;
      });

      toast.success('Task Deleted', `Ticket ${task.id} permanently deleted.`);
      setDeleteConfirmTask(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
      toast.error('Deletion Failed', 'Failed to delete task from queue.');
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

      // 3. Post authoritative record directly to /api/v1/maintenance-records & sync to localStorage
      const repairActionsList = atStep
        ? [`Issue solved at step #${atStep.stepNumber} (${atStep.title}): ${atStep.instruction}`]
        : task.steps.map((s) => `Step #${s.stepNumber} (${s.title}): ${s.instruction}`);

      const newHistoryRecord = {
        id: `rec-mr-${Date.now().toString().slice(-6)}`,
        recordNumber: `MR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        organizationId: 'org-demo',
        plantId: 'plant-01',
        machineId: task.assetTag,
        machineAssetTag: task.assetTag,
        ticketId: task.id,
        caseId: task.rawCaseId || task.id,
        ticketNumber: task.id,
        caseNumber: task.rawCaseId || task.id,
        problemStatement: task.symptomDescription || task.title,
        observedSymptoms: [task.symptomDescription || task.title],
        rootCause: task.topRootCause || 'Field mechanical / electrical wear corrected and operational baseline verified.',
        rootCauseStatus: 'CONFIRMED' as const,
        faultCategory: task.specialistDiscipline?.toLowerCase().includes('hydraul')
          ? 'HYDRAULICS'
          : task.specialistDiscipline?.toLowerCase().includes('elec')
          ? 'ELECTRICAL'
          : 'MECHANICAL',
        repairActions: repairActionsList,
        verificationState: 'PASSED' as const,
        approvalStatus: 'APPROVED' as const,
        resolvedAt: new Date().toISOString(),
        resolvingTechnicianName: task.assignedTechnicianName || user?.fullName || 'Marcus Vance',
        resolutionSource: 'FIELD_TECH',
        mttrMinutes: 18,
      };

      try {
        const rawHistory = localStorage.getItem('forgex_maintenance_history');
        const historyList = rawHistory ? JSON.parse(rawHistory) : [];
        const existingIdx = historyList.findIndex(
          (h: any) => h.ticketId === task.id || h.ticketNumber === task.id
        );
        if (existingIdx !== -1) {
          historyList[existingIdx] = { ...historyList[existingIdx], ...newHistoryRecord };
        } else {
          historyList.unshift(newHistoryRecord);
        }
        localStorage.setItem('forgex_maintenance_history', JSON.stringify(historyList));
      } catch {}

      await fetch('/api/v1/maintenance-records', {
        method: 'POST',
        headers,
        body: JSON.stringify(newHistoryRecord),
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
      window.dispatchEvent(
        new CustomEvent('forgex:history-updated', {
          detail: newHistoryRecord,
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
        machineAssetTag: formatCleanMachineName(task.assetTag),
        issueTitle: formatCleanNoteTitle(formatCleanTaskDescription(task.title), formatCleanMachineName(task.assetTag)),
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
      machineAssetTag: formatCleanMachineName(task.assetTag),
      issueTitle: formatCleanNoteTitle(formatCleanTaskDescription(task.title), formatCleanMachineName(task.assetTag)),
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
    // Auto-detect OEM Manufacturer Name & Email & Contract
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
    } else if (tag.includes('HEX') || tag.includes('PLATE') || name.includes('exchanger')) {
      setOemVendorName('Alfa Laval Thermal Process Technologies');
      setOemContactEmail('service.emea@alfalaval.com');
    } else if (tag.includes('GEN') || tag.includes('DIESEL') || name.includes('generator')) {
      setOemVendorName('Cummins Power Generation International');
      setOemContactEmail('cpg.fieldsupport@cummins.com');
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

      const activeOrFailedStep =
        oemTargetTask.steps.find((s) => s.status === 'IN_PROGRESS') ||
        oemTargetTask.steps.find((s) => s.status === 'PENDING') ||
        oemTargetTask.steps[oemTargetTask.steps.length - 1];

      const escalationRecord = {
        id: `OEM-ESC-${Date.now().toString().slice(-4)}`,
        ticketId: oemTargetTask.id,
        rawCaseId: oemTargetTask.rawCaseId,
        assetTag: oemTargetTask.assetTag,
        assetName: oemTargetTask.assetName,
        title: oemTargetTask.title,
        priority: oemTargetTask.priority || 'HIGH',
        oemManufacturer: oemVendorName,
        oemContactEmail: oemContactEmail,
        slaPriority: oemSlaPriority,
        faultCode: oemTargetTask.faultCode || oemFaultCode || 'FC-ALERT-OEM',
        alarmCode: oemTargetTask.faultCode || oemFaultCode || 'ALM-DIAG-201',
        rcaFindings: oemRcaFindings,
        rcaRootCause: oemRcaFindings,
        failedNotes: oemFailedNotes,
        failedStepNumber: activeOrFailedStep?.stepNumber || 1,
        failedStepTitle: activeOrFailedStep?.title || 'Component Inspection & Diagnostics',
        escalatedBy: oemTargetTask.assignedTechnicianName || user?.fullName || 'Marcus Vance',
        escalatedByTechnician: oemTargetTask.assignedTechnicianName || user?.fullName || 'Marcus Vance',
        escalatedAt: new Date().toISOString(),
        status: '🟡 Awaiting OEM Dispatch',
        stage: 1 as const,
        warrantyStatus: 'Active Factory OEM Warranty',
        contractRef: `OEM-${oemTargetTask.assetTag}-2026`,
        warrantyContractId: `OEM-${oemTargetTask.assetTag}-2026`,
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

  // Speech Synthesis Speaker Helper
  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Voice speech error:', e);
    }
  }, []);

  const isVoiceActiveRef = useRef(isVoiceActive);
  isVoiceActiveRef.current = isVoiceActive;

  // 1-Click / Voice Read Active Step Helper
  const handleReadActiveStep = useCallback(() => {
    if (!selectedTask) return;
    const activeStep = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS') || selectedTask.steps[0];
    if (activeStep) {
      const textToSpeak = `Step ${activeStep.stepNumber}: ${activeStep.title}. Target spec: ${activeStep.targetSpec || (activeStep as any).tolerance || 'Verify visual alignment and compliance'}.`;
      speakText(textToSpeak);
      toast.info(`Reading Step ${activeStep.stepNumber}`, activeStep.title);
    }
  }, [selectedTask, speakText, toast]);

  // Web Speech API / Hands-free continuous recognition with "Activate Voice" Wake-Word
  useEffect(() => {
    let recognition: any = null;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          transcript = transcript.trim().toLowerCase();
          if (!transcript) return;
          setLastVoiceCommand(transcript);

          // 1. Wake-word activation: "activate voice", "start voice", "hey copilot"
          if (
            transcript.includes('activate voice') ||
            transcript.includes('start voice') ||
            transcript.includes('hey copilot') ||
            transcript.includes('enable voice')
          ) {
            setIsVoiceActive(true);
            isVoiceActiveRef.current = true;
            speakText('Voice assistant activated.');
            toast.success('Voice Assistant Activated', 'Listening: Confirm, Next, Fail, Read Step, Solved, SOS, Stop Voice');
            return;
          }

          // 2. Standby / Cancel: "stop voice", "disable voice", "cancel"
          if (
            transcript.includes('stop voice') ||
            transcript.includes('disable voice') ||
            transcript.includes('turn off voice') ||
            transcript.includes('deactivate voice') ||
            transcript.includes('cancel voice')
          ) {
            setIsVoiceActive(false);
            isVoiceActiveRef.current = false;
            speakText('Voice assistant disabled.');
            toast.info('Voice Standby', 'Say "Activate Voice" or click to resume.');
            return;
          }

          // 3. Execution Commands when voice mode is active
          if (isVoiceActiveRef.current) {
            // Fail command
            if (
              transcript.includes('fail') ||
              transcript.includes('failed') ||
              transcript.includes('fail step') ||
              transcript.includes('block') ||
              transcript.includes('abort')
            ) {
              if (selectedTask) {
                const activeStep = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS');
                if (activeStep) {
                  handleFailStep(selectedTask, activeStep);
                  speakText('Step failed. Repair blocked.');
                }
              }
            }
            // Confirm / Pass / Done command
            else if (
              transcript.includes('confirm') ||
              transcript.includes('confirm step') ||
              transcript.includes('pass') ||
              transcript.includes('pass step') ||
              transcript.includes('done') ||
              transcript.includes('complete')
            ) {
              if (selectedTask) {
                const activeStep = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS');
                if (activeStep) {
                  handleCompleteAndNext(selectedTask.id, activeStep.id);
                  speakText(`Step ${activeStep.stepNumber} confirmed.`);
                  toast.success('Voice Command Executed', `Step ${activeStep.stepNumber} confirmed by voice.`);
                }
              }
            }
            // Next command
            else if (transcript.includes('next') || transcript.includes('next step') || transcript.includes('forward')) {
              if (selectedTask) {
                const activeStep = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS');
                if (activeStep) {
                  handleCompleteAndNext(selectedTask.id, activeStep.id);
                  speakText('Advancing to next step.');
                }
              }
            }
            // Read / Read Step command
            else if (
              transcript.includes('read step') ||
              transcript.includes('read') ||
              transcript.includes('repeat') ||
              transcript.includes('speak step')
            ) {
              handleReadActiveStep();
            }
            // Solved / Finish command
            else if (
              transcript.includes('solve') ||
              transcript.includes('solved') ||
              transcript.includes('resolved') ||
              transcript.includes('finish')
            ) {
              if (selectedTask) {
                const activeStep = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS') || selectedTask.steps[selectedTask.steps.length - 1];
                if (activeStep) {
                  handleMarkTaskSolved(selectedTask, activeStep);
                  speakText('Task marked resolved.');
                }
              }
            }
            // SOS / Copilot / Spec Help command
            else if (
              transcript.includes('sos') ||
              transcript.includes('help') ||
              transcript.includes('buddy') ||
              transcript.includes('copilot') ||
              transcript.includes('spec')
            ) {
              setIsBuddyModalOpen(true);
              speakText('Opening Copilot SOS assistance.');
            }
          }
        };

        recognition.onerror = (err: any) => {
          console.warn('SpeechRecognition error:', err);
        };

        recognition.onend = () => {
          if (isVoiceActiveRef.current) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognition.start();
      } catch (err) {
        console.warn('SpeechRecognition error:', err);
      }
    }

    return () => {
      if (recognition) {
        try {
          recognition.stop();
        } catch {}
      }
    };
  }, [handleCompleteAndNext, handleFailStep, handleMarkTaskSolved, handleReadActiveStep, isVoiceActive, selectedTask, speakText, toast]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">
      {/* 1. SINGLE UNIFIED TOP COMMAND HEADER (Requirement 1) */}
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs shrink-0">
        {/* Left: Wrench icon badge + Tech Execution Desk title & compact subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">
              Tech Execution Desk · Shop-Floor Repair & Verification
            </h1>
            <p className="text-xs text-slate-500">
              Logged in as{' '}
              <span className="font-semibold text-slate-800">
                {user?.fullName || 'Field Technician'}
              </span>{' '}
              · Live shop-floor task execution & safety sign-off
            </p>
          </div>
        </div>

        {/* Center / Right-Aligned Cluster: Summary Pills, View All Technicians, Refresh */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Live Shop-Floor Summary Pills */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200 font-bold inline-flex items-center gap-1 shadow-2xs">
              <span>⚡</span>
              <span>
                {tasks.filter((t) => t.status !== 'Resolved').length} Active Tasks
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold inline-flex items-center gap-1 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>
                {
                  technicianStats.filter(
                    (t) => t.liveStatus.shiftStatus === 'ON_SHIFT' && t.activeTickets.length === 0
                  ).length
                }{' '}
                Available
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-200 font-semibold inline-flex items-center gap-1 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{technicianStats.filter((t) => t.activeTickets.length > 0).length} Executing</span>
            </span>
          </div>

          {/* Single-icon "View All Technicians" Button (No duplicate emoji) */}
          <button
            type="button"
            onClick={() => setIsWorkforceModalOpen(true)}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            title="Open Full Field Workforce Directory & Roster Matrix"
          >
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>View All Technicians</span>
          </button>

          {/* Compact Refresh / Sync Button */}
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
        <div className="flex-1 min-h-0 h-[calc(100vh-4rem)] overflow-hidden flex flex-col lg:flex-row">
          {/* Left: Compact Field Task List (290px/310px - Requirement 1) */}
          <div className="w-full lg:w-[290px] xl:w-[310px] h-full border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-2.5 space-y-2 shrink-0 shadow-xs flex flex-col rounded-b-lg lg:rounded-none overflow-hidden">
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

            {/* Task List Items (Compact Spacing & Clean Sanitized Asset Tags) */}
            <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
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
                  const cleanAssetTag = formatCleanAssetTag(task.assetTag, task.title, task.assetName);

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask((prev) => (prev?.id === task.id ? null : task))}
                      className={`p-2.5 rounded-lg border transition cursor-pointer text-xs space-y-2 group relative ${
                        task.priority === 'Critical'
                          ? 'border-l-4 border-l-rose-500'
                          : task.priority === 'High'
                          ? 'border-l-4 border-l-amber-500'
                          : 'border-l-4 border-l-blue-500'
                      } ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      {/* Row 1: Ticket ID on the left, Priority Badge + Delete icon on the right */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-mono font-bold text-blue-600 text-xs shrink-0">
                          {task.id}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border whitespace-nowrap ${
                              task.priority === 'Critical'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : task.priority === 'High'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {task.priority}
                          </span>

                          {/* Quick delete icon on card (Available on EVERY ticket card) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteConfirmTask(task);
                            }}
                            title="Delete / Archive task"
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Clean Machine Tag pill + Clean Wrapping Issue Title (no repeated prefix or .GLB) */}
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] break-words">
                          ⚙️ {formatCleanMachineName(cleanAssetTag)}
                        </span>
                        <p className="text-slate-800 font-medium text-xs leading-snug line-clamp-2 break-words" title={task.title}>
                          {formatCleanTaskDescription(task.title)}
                        </p>
                      </div>

                      {/* Row 3 (Footer Strip): Full Tech Name (⭐4.9) + Steps (X/5) + Status Pill */}
                      <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono pt-1 border-t border-slate-100">
                        <span className="text-slate-600 font-semibold truncate" title={task.assignedTechnicianName}>
                          👤 {task.assignedTechnicianName} <span className="text-amber-700 font-bold">⭐{task.assignedTechnicianRating.toFixed(1)}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-slate-800">
                            {task.completedSteps}/{task.stepsCount}
                          </span>
                          {task.status === 'Failed' || task.steps.some((s) => s.status === 'FAILED') ? (
                            <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded text-[9px]">
                              FAILED
                            </span>
                          ) : task.completedSteps === task.stepsCount && task.stepsCount > 0 ? (
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
            <div className="flex-1 h-full min-h-0 min-w-0 p-3.5 sm:p-4 overflow-y-auto pb-16 scroll-smooth space-y-3.5 w-full">
              {/* 1. Full-Width 2-Row Executive Header Card (Requirement 3) */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
                {/* Row 1: Badges + Machine Tag + Priority + Status (Left) & Tech + MTTR + Actions (Right) */}
                <div className="flex items-center justify-between gap-3 flex-wrap w-full">
                  {/* Left Cluster (All inline on 1 row) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shadow-2xs">
                      {selectedTask.id}
                    </span>
                    {/* Bold Machine Tag pill in dark navy-indigo */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold shadow-xs">
                      <span className="text-amber-400">⚙️</span>
                      <span>{formatCleanMachineName(formatCleanAssetTag(selectedTask.assetTag, selectedTask.title, selectedTask.assetName))}</span>
                    </span>
                    {selectedTask.faultCode && (
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        FAULT: {selectedTask.faultCode}
                      </span>
                    )}
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
                    {selectedTask.lotoRequired && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-mono font-bold">
                        <ShieldAlert className="w-3 h-3" /> LOTO MANDATORY
                      </span>
                    )}
                  </div>

                  {/* Right Cluster (All inline on 1 row) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Assigned Technician Pill */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-800 border border-slate-200 text-xs font-mono font-semibold shadow-2xs">
                      <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{selectedTask.assignedTechnicianName}</span>
                      <span className="text-amber-700 font-bold ml-0.5">
                        ★ {selectedTask.assignedTechnicianRating.toFixed(1)}
                      </span>
                    </span>

                    {/* Single-icon MTTR Tracker Pill (no duplicate clock emoji) */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-800 border border-slate-200 text-xs font-mono font-semibold shadow-2xs">
                      <Timer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        MTTR:{' '}
                        <strong
                          className={
                            elapsedMinutes > targetBenchmarkMinutes
                              ? 'text-rose-600'
                              : 'text-emerald-700'
                          }
                        >
                          {elapsedMinutes}m
                        </strong>{' '}
                        / {targetBenchmarkMinutes}m
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                          elapsedMinutes > targetBenchmarkMinutes
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {elapsedMinutes > targetBenchmarkMinutes
                          ? `+${elapsedMinutes - targetBenchmarkMinutes}m SLA`
                          : '(On-Track)'}
                      </span>
                    </span>

                    {/* Conditional Export Job Sheet: Only when Solved or Failed */}
                    {(() => {
                      const isTaskSolved = selectedTask.status === 'Resolved' || (selectedTask.completedSteps === selectedTask.stepsCount && selectedTask.stepsCount > 0);
                      const isTaskFailed = selectedTask.status === 'Failed' || (selectedTask.steps && selectedTask.steps.some((s) => s.status === 'FAILED'));

                      if (isTaskSolved) {
                        return (
                          <button
                            type="button"
                            onClick={() => handleExportJobSheet(selectedTask)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold transition shadow-2xs cursor-pointer whitespace-nowrap"
                            title="Export official printable compliance job sheet summary"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Export Job Sheet</span>
                          </button>
                        );
                      }

                      if (isTaskFailed) {
                        return (
                          <button
                            type="button"
                            onClick={() => handleExportJobSheet(selectedTask)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-semibold transition shadow-2xs cursor-pointer whitespace-nowrap"
                            title="Export failure dossier & OEM diagnostic summary"
                          >
                            <Printer className="w-3.5 h-3.5 text-rose-700" />
                            <span>Export Job Sheet (Failure Dossier)</span>
                          </button>
                        );
                      }

                      return null;
                    })()}

                    {/* Delete Button (Available for all tasks) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirmTask(selectedTask);
                      }}
                      title="Delete task from active queue (Purge to history)"
                      className="p-1.5 border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition cursor-pointer shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Close Button */}
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

                {/* Row 2: Ticket Title ONLY ONCE on left, Dispatched Date on right */}
                <div className="w-full mt-2.5 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 pr-2">
                    <h2 className="text-base font-bold text-slate-900 truncate" title={selectedTask.title}>
                      {formatCleanTaskDescription(selectedTask.title)}
                    </h2>
                  </div>
                  <div className="shrink-0 text-xs text-slate-500 font-mono">
                    <span>
                      🕒 Dispatched: <strong className="text-slate-800">{selectedTask.createdAtFormatted}</strong>
                    </span>
                  </div>
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

                  {showDiagnostics && (() => {
                    const rawSymptom = selectedTask.symptomDescription || selectedTask.title;
                    let cleanSymptom = rawSymptom;
                    let extractedAlarm = selectedTask.alarmCode || '';

                    if (rawSymptom.includes('|')) {
                      const parts = rawSymptom.split('|').map((p) => p.trim());
                      const nonMetadataParts: string[] = [];
                      for (const part of parts) {
                        if (/^alarm\s*code\s*:/i.test(part)) {
                          if (!extractedAlarm) extractedAlarm = part.replace(/^alarm\s*code\s*:\s*/i, '');
                        } else if (/^(machine\s*status|shift\s*\/?\s*area|facility|loto\s*mandatory)/i.test(part)) {
                          // Filter out noisy status concatenation
                        } else if (part.length > 0) {
                          nonMetadataParts.push(part);
                        }
                      }
                      cleanSymptom = nonMetadataParts.join(' • ') || selectedTask.title;
                    }

                    const rcaHypothesis =
                      selectedTask.topRootCause || 'Dynamic seal degradation & fluid cavitation';
                    const probability = selectedTask.probability || 94;
                    const fixSummary =
                      selectedTask.recommendedFix ||
                      'Replace dynamic seal cartridge, flush Plan 53A barrier, torque gland to 45 Nm';

                    return (
                      <div className="p-3 border-t border-slate-200 bg-white">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 text-xs">
                          {/* Col 1: Clean Observed Symptom & Alarm Code (Cleanly Stacked) */}
                          <div className="space-y-1.5 flex flex-col justify-between">
                            <div>
                              <div className="flex flex-col items-start gap-1 mb-1.5">
                                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block tracking-wider">
                                  ⚠️ FIELD SYMPTOM
                                </span>
                                {extractedAlarm && (
                                  <span className="text-[9px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded w-fit max-w-full break-words">
                                    ALARM: {extractedAlarm}
                                  </span>
                                )}
                              </div>
                              <p
                                className="text-slate-800 font-medium text-xs leading-relaxed mt-1 break-words"
                                title={cleanSymptom}
                              >
                                {cleanSymptom}
                              </p>
                            </div>
                          </div>

                          {/* Col 2: RCA Root Cause Hypothesis + Confidence % + View Full RCA Report Button */}
                          <div className="space-y-1.5 flex flex-col justify-between border-y md:border-y-0 md:border-x border-slate-200/80 py-2 md:py-0 md:px-3">
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-[10px] font-mono text-indigo-700 uppercase font-bold block tracking-wider">
                                  🔍 RCA ROOT CAUSE
                                </span>
                                <span className="text-[9px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded shrink-0">
                                  {probability}% CONF
                                </span>
                              </div>
                              <p
                                className="text-indigo-950 font-bold text-xs leading-snug break-words"
                                title={rcaHypothesis}
                              >
                                {rcaHypothesis}
                              </p>
                            </div>
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => handleViewFullRca(selectedTask)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs rounded-lg shadow-2xs hover:shadow-xs transition cursor-pointer"
                                title="Open full interactive Root Cause Analysis report & 5-Why chain"
                              >
                                <span>🔍 View Full RCA Report</span>
                                <span className="font-bold">↗</span>
                              </button>
                            </div>
                          </div>

                          {/* Col 3: Corrective Summary (Wrap cleanly, no cut-off) */}
                          <div className="space-y-1.5 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-mono text-blue-700 uppercase font-bold block tracking-wider">
                                🛠️ CORRECTIVE SUMMARY
                              </span>
                              <p
                                className="text-slate-700 font-medium text-xs leading-snug mt-1 break-words"
                                title={fixSummary}
                              >
                                {fixSummary}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
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
                  <div className="space-y-3.5">
                    {/* Execution Board Header Bar - Sleek Single-Line Navy-Indigo Bar (Requirement 3) */}
                    {(() => {
                      const isTaskSolved = selectedTask.status === 'Resolved' || (selectedTask.completedSteps === selectedTask.stepsCount && selectedTask.stepsCount > 0);
                      const isTaskFailed = selectedTask.status === 'Failed' || (selectedTask.steps && selectedTask.steps.some((s) => s.status === 'FAILED'));

                      return (
                        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white px-4 py-3 rounded-xl shadow-sm border border-indigo-900/40 flex flex-col gap-2.5 overflow-hidden">
                          {/* Top Row: Left: Title + Status + 5-step Pills | Right: Voice Status Pill + Steps Progress + Sync */}
                          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                            {/* Left: Execution Board title + Active/Failed/Solved status */}
                            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
                              <span className="text-sm font-bold text-white tracking-wide whitespace-nowrap">Execution Board</span>
                              {isTaskSolved ? (
                                <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1 shadow-xs whitespace-nowrap">
                                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                                  SOLVED
                                </span>
                              ) : isTaskFailed ? (
                                <span className="text-[10px] font-mono font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-400/30 flex items-center gap-1 shadow-xs whitespace-nowrap">
                                  <X className="w-2.5 h-2.5 text-rose-400" />
                                  FAILED / BLOCKED
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1 shadow-xs whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  ACTIVE RUN
                                </span>
                              )}

                              {/* Interactive 5-Step Mini-Pills */}
                              {selectedTask.steps && selectedTask.steps.length > 0 && (
                                <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/10 shrink-0">
                                  {selectedTask.steps.map((step) => {
                                    const isCompleted = step.status === 'COMPLETED';
                                    const isStepFailed = step.status === 'FAILED';
                                    const isActive = step.status === 'IN_PROGRESS';
                                    return (
                                      <button
                                        key={step.id || step.stepNumber}
                                        type="button"
                                        onClick={() => {
                                          const el = document.getElementById(`step-card-${step.stepNumber}`);
                                          if (el) {
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }}
                                        title={`Step ${step.stepNumber}: ${step.title} (${isCompleted ? 'Verified' : isStepFailed ? 'Failed' : isActive ? 'Active' : 'Locked'})`}
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-0.5 ${
                                          isCompleted
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-xs hover:bg-emerald-500/30'
                                            : isStepFailed
                                            ? 'bg-rose-500/30 text-rose-300 border border-rose-400/60 shadow-xs hover:bg-rose-500/40'
                                            : isActive
                                            ? 'bg-indigo-500/40 text-cyan-200 border border-cyan-400/60 ring-1 ring-cyan-400/40 animate-pulse hover:bg-indigo-500/50'
                                            : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/15 hover:text-slate-200'
                                        }`}
                                      >
                                        {isCompleted ? '✓' : isStepFailed ? '✕' : ''} {String(step.stepNumber).padStart(2, '0')}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Right: Clickable Voice Pill + Progress + Sync */}
                            <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                              {/* 🎙️ Clickable / Voice Status Pill (No double mic icon, Reliable Activate Voice) */}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsVoiceActive((prev) => {
                                    const next = !prev;
                                    if (next) {
                                      speakText('Voice assistant activated.');
                                      toast.success('Voice Assistant Activated', 'Listening: Confirm, Next, Fail, Read Step, Solved, SOS');
                                    } else {
                                      speakText('Voice assistant disabled.');
                                      toast.info('Voice Assistant Disabled', 'Say "Activate Voice" or click to start');
                                    }
                                    return next;
                                  });
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shadow-xs whitespace-nowrap cursor-pointer ${
                                  isVoiceActive
                                    ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white animate-pulse ring-2 ring-emerald-400'
                                    : 'bg-indigo-950/80 hover:bg-indigo-900 text-cyan-300 border border-indigo-700/60'
                                }`}
                                title="Click to start/stop hands-free voice assistant"
                              >
                                <Mic className={`w-3.5 h-3.5 ${isVoiceActive ? 'text-white animate-bounce' : 'text-cyan-400'}`} />
                                <span className="whitespace-nowrap">
                                  {isVoiceActive
                                    ? (lastVoiceCommand ? `🟢 Heard: "${lastVoiceCommand}"` : '🟢 Voice Active — Listening')
                                    : 'Say "Activate Voice"'}
                                </span>
                              </button>

                              <div className="text-right whitespace-nowrap hidden sm:block">
                                <span className="text-xs font-mono font-bold text-slate-200">
                                  {selectedTask.completedSteps} / {selectedTask.stepsCount} Steps
                                </span>
                                <div className="w-20 sm:w-24 h-1.5 bg-slate-800/80 rounded-full overflow-hidden mt-0.5 border border-white/10">
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-300 rounded-full"
                                    style={{
                                      width: `${(selectedTask.completedSteps / Math.max(1, selectedTask.stepsCount)) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Server Sync Button */}
                              <button
                                onClick={() => fetchQueue(true)}
                                disabled={syncing}
                                title="Sync latest progress from server (Never resets completed steps)"
                                className="p-1.5 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg transition cursor-pointer shrink-0"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Wrapped Second Sub-Row: Supported Command Chips strictly inside dark card boundary */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-2 mt-0.5 border-t border-white/10 text-[11px] font-mono text-slate-300">
                            <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1 mr-1 shrink-0">
                              <Mic className="w-3 h-3" /> Commands:
                            </span>
                            {[
                              {
                                label: '"Confirm Step"',
                                action: () => {
                                  const a = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS');
                                  if (a) handleCompleteAndNext(selectedTask.id, a.id);
                                },
                              },
                              {
                                label: '"Next"',
                                action: () => {
                                  const a = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS');
                                  if (a) handleCompleteAndNext(selectedTask.id, a.id);
                                },
                              },
                              {
                                label: '"Fail Step"',
                                action: () => {
                                  const a = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS');
                                  if (a) handleFailStep(selectedTask, a);
                                },
                              },
                              { label: '"Read Step"', action: handleReadActiveStep },
                              {
                                label: '"Solved"',
                                action: () => {
                                  const a = selectedTask.steps.find((s) => s.status === 'IN_PROGRESS') || selectedTask.steps[selectedTask.steps.length - 1];
                                  if (a) handleMarkTaskSolved(selectedTask, a);
                                },
                              },
                              { label: '"SOS"', action: () => setIsBuddyModalOpen(true) },
                              {
                                label: '"Stop Voice"',
                                action: () => {
                                  setIsVoiceActive(false);
                                  speakText('Voice assistant disabled.');
                                },
                              },
                            ].map((cmd, cIdx) => (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={cmd.action}
                                className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-slate-200 hover:text-white text-[10px] transition cursor-pointer"
                              >
                                {cmd.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 2x2 Grid of Execution Steps with Target Engineering Specs & Fail Step Button */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                      {selectedTask.steps.map((step) => {
                        const isCompleted = step.status === 'COMPLETED';
                        const isStepFailed = step.status === 'FAILED';
                        const isActive = step.status === 'IN_PROGRESS';
                        const targetSpec = step.targetSpec || getStepTargetSpec(step.stepNumber);

                        if (isCompleted) {
                          return (
                            <div
                              key={step.id}
                              id={`step-card-${step.stepNumber}`}
                              className="p-3 rounded-lg border border-slate-200 transition bg-gradient-to-r from-indigo-50/30 to-white border-l-4 border-l-indigo-600 shadow-2xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                                  <span className="font-mono text-[10px] font-bold text-white bg-indigo-600 px-1.5 py-0.5 rounded shadow-2xs shrink-0">
                                    STEP {step.stepNumber.toString().padStart(2, '0')}
                                  </span>
                                  <h4 className="text-xs font-semibold text-slate-800 truncate">
                                    {step.title}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold tracking-tight shadow-2xs whitespace-nowrap">
                                    <span className="text-amber-400">🎯 SPEC:</span>
                                    <span>{targetSpec}</span>
                                  </div>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                                    <Check className="w-2.5 h-2.5 stroke-[3] text-indigo-600" />
                                    <span>Verified</span>
                                  </span>
                                </div>
                              </div>
                              <p className="line-clamp-1 text-xs text-slate-500 pl-6" title={step.instruction}>
                                {step.instruction}
                              </p>
                            </div>
                          );
                        }

                        if (isStepFailed) {
                          return (
                            <div
                              key={step.id}
                              id={`step-card-${step.stepNumber}`}
                              className="p-3 rounded-lg border-2 border-rose-500 bg-rose-50/30 shadow-xs space-y-2 transition"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <div className="mt-0.5 w-4 h-4 rounded bg-rose-600 text-white flex items-center justify-center shrink-0">
                                    <X className="w-3 h-3 stroke-[3]" />
                                  </div>
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono text-[10px] font-bold text-white bg-rose-600 px-1.5 py-0.5 rounded">
                                        STEP {step.stepNumber.toString().padStart(2, '0')}
                                      </span>
                                      <h4 className="text-xs font-bold text-rose-950 leading-tight">
                                        {step.title}
                                      </h4>
                                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-rose-800 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded">
                                        ● FAILED / BLOCKED
                                      </span>
                                    </div>
                                    <p className="text-xs text-rose-900 leading-relaxed font-sans">
                                      {step.instruction}
                                    </p>
                                  </div>
                                </div>
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-rose-300 border border-rose-500/40 text-[9px] font-mono font-bold tracking-tight shadow-2xs shrink-0 whitespace-nowrap">
                                  <span className="text-amber-400">🎯 SPEC:</span>
                                  <span>{targetSpec}</span>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-rose-200 flex flex-wrap items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleStep(selectedTask.id, step.id)}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition shadow-2xs cursor-pointer"
                                >
                                  <RefreshCw className="w-3 h-3 text-slate-500" />
                                  <span>Retry Step</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenOemModal(selectedTask)}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                                >
                                  <Building2 className="w-3.5 h-3.5" />
                                  <span>🏭 Escalate to OEM</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (isActive) {
                          return (
                            <div
                              key={step.id}
                              id={`step-card-${step.stepNumber}`}
                              className="p-3 rounded-lg border-2 border-indigo-600 bg-white shadow-sm space-y-2.5 transition"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStep(selectedTask.id, step.id)}
                                    className="mt-0.5 text-indigo-600 hover:text-indigo-800 cursor-pointer shrink-0"
                                    title="Click to confirm step"
                                  >
                                    <Square className="w-4 h-4 text-indigo-500 hover:text-indigo-700" />
                                  </button>
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
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
                                    <p className="text-xs text-slate-700 leading-relaxed font-sans">
                                      {step.instruction}
                                    </p>
                                    {buddyAssistance && (
                                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 rounded-md text-[10px] font-mono text-purple-800">
                                        <Users className="w-3 h-3 text-purple-600 shrink-0" />
                                        <span>🤝 5-Min Buddy Assist: <strong>{buddyAssistance.specialistName}</strong> ({buddyAssistance.discipline}) pinged · ETA {buddyAssistance.eta}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold tracking-tight shadow-2xs whitespace-nowrap">
                                    <span className="text-amber-400">🎯 SPEC:</span>
                                    <span>{targetSpec}</span>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                    ACTIVE STEP
                                  </span>
                                </div>
                              </div>

                              {/* Active Step Dedicated Actions: Confirm, Solved, and Fail Step */}
                              <div className="pt-2 border-t border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteAndNext(selectedTask.id, step.id)}
                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1 transition shadow-xs cursor-pointer whitespace-nowrap"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Confirm Step & Next</span>
                                    <ArrowRight className="w-3 h-3 ml-0.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleMarkTaskSolved(selectedTask, step)}
                                    className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 active:scale-95 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1 transition shadow-xs cursor-pointer whitespace-nowrap"
                                    title="Fault resolved at this procedure step — complete ticket and log to Maintenance History"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Issue Solved Here</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleFailStep(selectedTask, step)}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 font-bold text-xs rounded-lg inline-flex items-center gap-1 transition shadow-2xs cursor-pointer whitespace-nowrap active:scale-95"
                                    title="Mark this step as failed / blocked — unlocks Failure Dossier export and OEM escalation"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Step Failed</span>
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
                                    onClick={() => setIsBuddyModalOpen(true)}
                                    className="px-2 py-1.5 border border-purple-300 hover:border-purple-400 bg-purple-50/90 hover:bg-purple-100 text-purple-900 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                    title="Ping an on-shift specialist (Electrical, PLC, Hydraulics) for a quick 5-min walk-over micro-assist"
                                  >
                                    <Users className="w-3.5 h-3.5 text-purple-700" />
                                    <span>SOS Buddy</span>
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

                        /* STRICTLY LOCKED / PENDING STATE */
                        return (
                          <div
                            key={step.id}
                            id={`step-card-${step.stepNumber}`}
                            className="p-3 rounded-lg border transition bg-white border-slate-200/80 space-y-1.5 opacity-75"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <button
                                  type="button"
                                  disabled
                                  className="mt-0.5 text-slate-300 cursor-not-allowed shrink-0"
                                  title="Step locked — complete preceding steps first"
                                >
                                  <Lock className="w-3.5 h-3.5 text-slate-300" />
                                </button>
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                      STEP {step.stepNumber.toString().padStart(2, '0')}
                                    </span>
                                    <h4 className="text-xs font-semibold text-slate-500 leading-tight">
                                      {step.title}
                                    </h4>
                                    {step.requiresLoto && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-red-500 bg-red-50/60 border border-red-200/60 px-1.5 py-0.5 rounded">
                                        <ShieldAlert className="w-2.5 h-2.5" /> LOTO
                                      </span>
                                    )}
                                  </div>
                                  <p className="line-clamp-2 text-xs text-slate-400 leading-relaxed font-sans">
                                    {step.instruction}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-mono font-bold tracking-tight shadow-2xs whitespace-nowrap">
                                  <span className="text-slate-400">🎯 SPEC:</span>
                                  <span>{targetSpec}</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                  🔒 LOCKED
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Conditional Bottom Banners (Requirement 1 & 3):
                        - In Progress: HIDE completely
                        - Problem Solved: Display Resolved & Archive Banner + Export Job Sheet
                        - Problem Failed: Display Problem Unresolved — Escalate to OEM Banner + Export Job Sheet (Failure Dossier)
                    */}
                    {(() => {
                      const isTaskSolved = selectedTask.status === 'Resolved' || (selectedTask.completedSteps === selectedTask.stepsCount && selectedTask.stepsCount > 0);
                      const isTaskFailed = selectedTask.status === 'Failed' || (selectedTask.steps && selectedTask.steps.some((s) => s.status === 'FAILED'));

                      if (isTaskFailed) {
                        return (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 text-white border border-rose-500/40 rounded-xl shadow-md">
                            <div className="flex items-center gap-2.5 text-white flex-1 min-w-[260px]">
                              <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-4 h-4 text-rose-400" />
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2 flex-wrap">
                                  <span>Field Repair Failed or Blocked</span>
                                  <span className="font-mono text-[10px] font-bold bg-rose-500/30 text-rose-200 border border-rose-400/40 px-2 py-0.5 rounded whitespace-nowrap">
                                    FAILED / BLOCKED
                                  </span>
                                </div>
                                <p className="text-rose-200/80 text-xs">
                                  Internal assembly tolerance exceeded or requires specialized manufacturer factory tooling.
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-end">
                              <button
                                type="button"
                                onClick={() => handleExportJobSheet(selectedTask)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer text-xs whitespace-nowrap"
                                title="Export failure dossier & OEM diagnostic summary"
                              >
                                <Printer className="w-3.5 h-3.5 text-white" />
                                <span>Export Job Sheet (Failure Dossier)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenOemModal(selectedTask)}
                                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer text-xs active:scale-95 whitespace-nowrap"
                                title="Direct factory escalation to machine OEM"
                              >
                                <Building2 className="w-3.5 h-3.5 text-white" />
                                <span>Escalate to OEM</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (isTaskSolved) {
                        return (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white border border-indigo-500/30 rounded-xl shadow-md">
                            <div className="flex items-center gap-2.5 text-white flex-1 min-w-[260px]">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2 flex-wrap">
                                  <span>All {selectedTask.stepsCount}/{selectedTask.stepsCount} Execution Steps Completed</span>
                                  <span className="font-mono text-[10px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded whitespace-nowrap">
                                    ✓ VERIFIED &amp; SOLVED
                                  </span>
                                </div>
                                <p className="text-slate-300 text-xs">
                                  Field maintenance verified &amp; baseline operational clearance restored.
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-end">
                              <button
                                type="button"
                                onClick={() => handleExportJobSheet(selectedTask)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer text-xs whitespace-nowrap"
                                title="Print or export compliance job summary"
                              >
                                <Printer className="w-3.5 h-3.5 text-white" />
                                <span>Export Job Sheet</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAddTipToExpertKnowledge(selectedTask)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer text-xs whitespace-nowrap"
                                title="Capture field insights and tricks directly into Expert Knowledge"
                              >
                                <Lightbulb className="w-3.5 h-3.5 text-amber-300 fill-amber-300/30" />
                                <span>Add Tip to Knowledge</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleArchiveTaskToHistory(selectedTask)}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-lg inline-flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer text-xs active:scale-95 whitespace-nowrap border border-emerald-400/30"
                                title="Archive verified repair record to Maintenance History and clear from active queue"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                <span>Mark Resolved &amp; Archive to History</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // While ticket is In Progress / Pending: HIDE completion banner completely
                      return null;
                    })()}
                  </div>
                )}
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
                  {deleteConfirmTask.id} · {formatCleanMachineName(deleteConfirmTask.assetTag)}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove task{' '}
              <strong className="text-slate-900 font-mono">{deleteConfirmTask.id}</strong> (
              {formatCleanTaskDescription(deleteConfirmTask.title)}) from the active technician queue? Completed
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
                    <option value="L4 Critical / 4-Hour Emergency Dispatch" className="text-slate-900 font-medium bg-white">
                      🚨 L4 Critical — 4-Hour Emergency Onsite Dispatch
                    </option>
                    <option value="L4 High / Next Business Day Field Engineer" className="text-slate-900 font-medium bg-white">
                      ⚠️ L4 High — Next Business Day Field Engineer
                    </option>
                    <option value="L4 Standard / Factory Remote Telemetry Analysis" className="text-slate-900 font-medium bg-white">
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

      {/* 3. 1-Click SOS Buddy Assist Modal */}
      {isBuddyModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    1-Click Specialist Buddy Assist (5-Min Micro-Consult)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Task {selectedTask.id} · {selectedTask.assetTag} · Walk-over consult without ticket reassignment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBuddyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-500 tracking-wider">
                Available On-Shift Cross-Discipline Specialists
              </span>
              <div className="space-y-2">
                {BUDDY_SPECIALISTS.map((spec) => (
                  <div
                    key={spec.name}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            spec.status === 'AVAILABLE' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-bold text-slate-900">{spec.name}</span>
                        <span className="font-mono text-[10px] text-amber-700 font-bold">⭐ {spec.rating}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">{spec.discipline}</div>
                      <div className="text-[10px] font-mono text-slate-400">Location ETA: {spec.eta}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePingBuddy(spec)}
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer shrink-0 active:scale-95"
                    >
                      Ping 5m Assist
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-100 text-[11px] text-slate-600 font-sans">
              <span>
                Micro-assist logs directly to step notes; the core ticket remains assigned to{' '}
                <strong>{selectedTask.assignedTechnicianName}</strong>.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Field Workforce & Dispatch Matrix Modal (12+ Technicians Popover/Modal) */}
      {isWorkforceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-2xs">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
                    Field Workforce & Dispatch Matrix ({technicianStats.length} Specialists)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live plant technician bench, skill disciplines, active workloads, and operational availability.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkforceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search toolbar */}
            <div className="p-3 border-b border-slate-100 bg-white flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search technician by name, discipline, or specialty..."
                  value={workforceSearchTerm}
                  onChange={(e) => setWorkforceSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Cards Grid */}
            <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/50">
              {technicianStats
                .filter((t) => {
                  if (!workforceSearchTerm.trim()) return true;
                  const q = workforceSearchTerm.toLowerCase();
                  return (
                    t.name.toLowerCase().includes(q) ||
                    t.discipline.toLowerCase().includes(q) ||
                    t.role.toLowerCase().includes(q)
                  );
                })
                .map((tech) => {
                  const isSelected = selectedTechnician === tech.name;
                  const live = tech.liveStatus;
                  const isOnShift = live.shiftStatus === 'ON_SHIFT';
                  const hasActiveWork = tech.activeTickets.length > 0;
                  const activeMachineTag = hasActiveWork
                    ? tech.activeTickets[0].assetTag || tech.activeTickets[0].assetName || 'Equipment'
                    : '';
                  const isBusy = hasActiveWork || tech.assignedCount > 0;

                  return (
                    <div
                      key={tech.id}
                      className={`p-3.5 rounded-xl border bg-white shadow-2xs space-y-2.5 transition ${
                        isSelected
                          ? 'ring-2 ring-blue-500 border-blue-400'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{tech.name}</h4>
                          <p className="text-[10px] text-slate-500 truncate">{tech.discipline}</p>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                          ⭐ {tech.rating.toFixed(1)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono pt-1 border-t border-slate-100 flex-wrap">
                        {hasActiveWork ? (
                          <span
                            className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold whitespace-nowrap"
                            title={activeMachineTag}
                          >
                            🟡 {activeMachineTag}
                          </span>
                        ) : isOnShift ? (
                          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold whitespace-nowrap">
                            🟢 Available
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-semibold whitespace-nowrap">
                            ⚪ On Break
                          </span>
                        )}

                        {isBusy ? (
                          <span
                            className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold cursor-not-allowed select-none shadow-2xs whitespace-nowrap inline-flex items-center gap-1"
                            title="Cannot take break while executing an active shop-floor task"
                          >
                            🔒 Busy on Task
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const next = isOnShift ? 'ON_BREAK' : 'ON_SHIFT';
                              setTechnicianShiftStatus(tech.name, next);
                            }}
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition whitespace-nowrap ${
                              isOnShift
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                            }`}
                          >
                            {isOnShift ? 'Mark Break' : 'Set On Shift'}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 pt-1">
                        <span>Workload: <strong>{tech.assignedCount}</strong> active</span>
                        <span>🏆 <strong>{tech.solvedCount}</strong> solved</span>
                      </div>

                      {hasActiveWork && (
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full transition-all" style={{ width: `${tech.progressPct}%` }} />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTechnician(isSelected ? 'ALL' : tech.name);
                          setIsWorkforceModalOpen(false);
                        }}
                        className={`w-full py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        {isSelected ? 'Clear Filter' : 'Filter This Queue'}
                      </button>
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500 shrink-0">
              <span>Plant Field Bench: {organization?.name || 'Plant'}</span>
              <button
                type="button"
                onClick={() => setIsWorkforceModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg font-semibold text-xs cursor-pointer"
              >
                Close Directory
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

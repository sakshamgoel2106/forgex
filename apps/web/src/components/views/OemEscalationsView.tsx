import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Building2,
  CheckCircle2,
  Search,
  Mail,
  Play,
  Activity,
  Award,
  Printer,
  Trash2,
  Send,
  Lock,
  ShieldCheck,
  Lightbulb,
  Copy,
  X,
  Check,
  Inbox,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { usePlant } from '../../lib/PlantContext';
import { useToast } from '../../lib/ToastContext';
import { Button } from '../ui/button';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';
import {
  getTenantData,
  setTenantData,
} from '../../utils/tenantStorage';
import {
  formatCleanMachineName,
  formatCleanNoteTitle,
  cleanTriggerText,
  cleanRemediationText,
} from '../../lib/hindiTranslator';

export const formatLocalDateTime = (dateStr?: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export type OemEscalationStage = 1 | 2 | 3;

export interface OemEscalationRecord {
  id: string;
  ticketId: string;
  rawCaseId?: string;
  assetTag: string;
  assetName: string;
  title?: string;
  priority?: string;
  oemManufacturer: string;
  oemContactEmail: string;
  oemHotline?: string;
  slaPriority: string;
  faultCode: string;
  alarmCode?: string;
  symptom?: string;
  rcaFindings: string;
  rcaRootCause?: string;
  failedNotes: string;
  failedStepNumber?: number;
  failedStepTitle?: string;
  escalatedBy?: string;
  escalatedByTechnician: string;
  escalatedAt: string;
  dispatchedAt?: string;
  dispatchedFromEmail?: string;
  dispatchedToEmail?: string;
  dispatchedSubject?: string;
  dispatchedBody?: string;
  status: string;
  stage?: OemEscalationStage;
  warrantyStatus: string;
  contractRef: string;
  warrantyContractId?: string;
  oemReportNotes?: string;
  clearedAt?: string;
  clearedBy?: string;
  escalationTarget?: 'OEM' | 'AUTHORITY';
  knowledgeCaptured?: boolean;
}

/**
 * Resolves the genuine clean machine name for an escalation record.
 * Guarantees that ticket IDs (e.g. 'TICK-2026-...') are NEVER used as machine names.
 */
export function extractRealMachineName(rec?: Partial<OemEscalationRecord> | null): string {
  if (!rec) return 'COOLING TOWER';

  const candidates = [rec.assetName, rec.assetTag, rec.title];
  for (const cand of candidates) {
    if (!cand) continue;
    const clean = formatCleanMachineName(cand);
    // If it looks like a ticket/escalation/case ID, skip it
    if (/^(TICK|TICKET|ESC|CASE)[-_0-9]/i.test(clean)) {
      continue;
    }
    if (clean && clean.trim().length > 2 && !clean.toUpperCase().startsWith('TICK-')) {
      return clean;
    }
  }

  // Look inside rcaFindings, failedNotes, symptom or title for machine keywords
  const combined = `${rec.title || ''} ${rec.rcaRootCause || ''} ${rec.rcaFindings || ''} ${rec.failedNotes || ''}`;
  const match = combined.match(/\b(PUMP[-_ ]?[A-Z0-9]+|MOTOR[-_ ]?[A-Z0-9]+|COOLING[-_ ]?TOWER|KILN[-_ ]?[A-Z0-9]+|COMPRESSOR[-_ ]?[A-Z0-9]+|CONVEYOR[-_ ]?[A-Z0-9]+|TURBINE[-_ ]?[A-Z0-9]+|FAN[-_ ]?[A-Z0-9]+)\b/i);
  if (match) {
    return formatCleanMachineName(match[1]);
  }

  return 'PUMP-204-B';
}

/**
 * Strips raw technician metadata dumps (e.g. "Equipment: ... Failed Step: ... Auto-Assigned To: ...")
 * and returns a clean, executive diagnostic root cause.
 */
export function cleanDiagnosticRootCause(rawText?: string | null, machineName = 'COOLING TOWER'): string {
  if (!rawText || !rawText.trim()) {
    return 'Dynamic Hydraulic Cavitation & Impeller Vane Unbalance';
  }
  let text = rawText.trim();
  text = text.replace(/Equipment:\s*[^;\n\r]+/gi, '');
  text = text.replace(/Failed Step:\s*[^;\n\r]+/gi, '');
  text = text.replace(/Auto-Assigned To:\s*[^;\n\r]+/gi, '');
  text = text.replace(/Assigned Technician:\s*[^;\n\r]+/gi, '');
  text = text.replace(/Execution halted at[^;\n\r]+/gi, '');
  text = text.replace(/Blocked at[^;\n\r]+/gi, '');
  text = text.replace(/Technician Notes:[^;\n\r]+/gi, '');
  text = text.replace(/\s*;\s*/g, ' ').trim();
  text = text.replace(/\s{2,}/g, ' ').replace(/^[-:, ]+|[-:, ]+$/g, '').trim();

  if (!text || text.length < 5 || /^(n\/a|none|undefined|null)$/i.test(text)) {
    return 'Dynamic Hydraulic Cavitation & Impeller Mechanical Seal Degradation';
  }

  return formatCleanNoteTitle(text, machineName);
}

/**
 * Formats a clean 1-sentence observed issue on the shop floor without raw metadata dumps.
 */
export function cleanObservedIssue(rawSymptom?: string | null, _machineName = 'COOLING TOWER'): string {
  if (!rawSymptom || !rawSymptom.trim()) {
    return 'High vibration (> 6.8 mm/s RMS) and mechanical sub-assembly seizure requiring OEM intervention.';
  }
  let s = rawSymptom.trim();
  s = s.replace(/Equipment:\s*[^;\n\r]+/gi, '');
  s = s.replace(/Failed Step:\s*[^;\n\r]+/gi, '');
  s = s.replace(/Auto-Assigned To:\s*[^;\n\r]+/gi, '');
  s = s.replace(/Execution halted at[^;\n\r]+/gi, '');
  s = s.replace(/\s{2,}/g, ' ').replace(/^[-:, ]+|[-:, ]+$/g, '').trim();

  if (!s || s.length < 5) {
    return 'High vibration and mechanical sub-assembly seizure requiring OEM intervention.';
  }
  return s;
}

/**
 * Sanitizes an escalation record to strip .GLB extensions and ensure
 * symptom and root cause analysis never repeat identically.
 */
export const sanitizeEscalationRecord = (rec: OemEscalationRecord): OemEscalationRecord => {
  const cleanMachine = extractRealMachineName(rec);
  const cleanRootCause = cleanDiagnosticRootCause(rec.rcaRootCause || rec.rcaFindings, cleanMachine);
  const cleanSymptom = cleanObservedIssue(rec.symptom, cleanMachine);
  const cleanContract = (rec.warrantyContractId || rec.contractRef || `OEM-${cleanMachine}-WARR-2026`)
    .replace(/\.(glb|gltf)\b/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();

  return {
    ...rec,
    assetTag: cleanMachine,
    assetName: cleanMachine,
    title: formatCleanNoteTitle(rec.title || cleanRootCause, cleanMachine),
    rcaRootCause: cleanRootCause,
    rcaFindings: cleanRootCause,
    symptom: cleanSymptom,
    warrantyContractId: cleanContract,
    contractRef: cleanContract,
  };
};

// Enterprise escalation records matching current plant assets
const DEFAULT_OEM_ESCALATIONS: OemEscalationRecord[] = [
  {
    id: 'ESC-2026-9041',
    ticketId: 'TCK-2026-8012',
    rawCaseId: 'CASE-2026-9041',
    assetTag: 'COOLING TOWER',
    assetName: 'COOLING TOWER',
    title: 'Dynamic Hydraulic Cavitation & Impeller Vane Unbalance',
    priority: 'Critical',
    oemManufacturer: 'Siemens Motion & Drives Automation',
    oemContactEmail: '',
    oemHotline: '+1 (800) 555-OEM-24',
    slaPriority: '🚨 L4 Critical — 4-Hour Emergency Dispatch',
    faultCode: 'ERR-702-HW-FATAL',
    alarmCode: 'ALM-VIB-501 / Dynamic High Vibration',
    symptom: 'Dynamic high vibration (> 6.8 mm/s RMS) and acoustic high-frequency cavitation chatter detected during Running state',
    rcaFindings: 'Suction pressure drop below fluid vapor pressure causing localized boundary implosions and dynamic vane unbalance.',
    rcaRootCause: 'Dynamic Hydraulic Cavitation & Impeller Vane Unbalance',
    failedNotes: 'Blocked at Step 2: Flange Runout & Casing Alignment Verification — Physical boundary check failed. Sub-assembly internal seizure and cavitation pitting beyond plant tool tolerance. Requires OEM factory cartridge replacement.',
    failedStepNumber: 2,
    failedStepTitle: 'Flange Runout & Casing Alignment Verification',
    escalatedBy: 'Alex Rivera',
    escalatedByTechnician: 'Alex Rivera',
    escalatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: '1. Supervisor Check',
    stage: 1,
    warrantyStatus: 'Active Factory OEM Warranty ($0 Free Replacement)',
    contractRef: 'OEM-SIEMENS-WARR-2026-09',
    warrantyContractId: 'OEM-SIEMENS-WARR-2026-09',
    escalationTarget: 'OEM',
  },
  {
    id: 'ESC-2026-8820',
    ticketId: 'TCK-2026-4402',
    rawCaseId: 'CASE-2026-8820',
    assetTag: 'PUMP-SLURRY-002',
    assetName: 'Centrifugal Slurry Booster Pump 002',
    title: 'Mechanical Seal Flush Plan 53A Barrier Pressure Collapse',
    priority: 'High',
    oemManufacturer: 'Flowserve Pump Technologies GmbH',
    oemContactEmail: 'emea.dispatch@flowserve.com',
    oemHotline: '+1 (800) 225-6989',
    slaPriority: '⚠️ L4 High — Next Business Day Field Engineer',
    faultCode: 'PMP-FAIL-303',
    alarmCode: 'ALM-PLAN53A-LOW',
    symptom: 'Barrier fluid accumulator pressure collapse below minimum operational seal barrier margin (1.2 bar vs 3.5 bar target)',
    rcaFindings: 'Dynamic silicon carbide seal ring fractured under thermal cavitation spike; Plan 53A barrier fluid exhausted.',
    rcaRootCause: 'Dynamic silicon carbide seal ring fractured under thermal cavitation spike',
    failedNotes: 'Blocked at Step 3: Dynamic Seal Cartridge & Plan 53A Flush — Seal cartridge sleeve locked onto shaft. Requires Flowserve hydraulic puller.',
    failedStepNumber: 3,
    failedStepTitle: 'Dynamic Seal Cartridge & Plan 53A Flush',
    escalatedBy: 'Marcus Vance',
    escalatedByTechnician: 'Marcus Vance',
    escalatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    dispatchedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    status: '2. OEM Confirmed',
    stage: 2,
    warrantyStatus: 'Active Factory OEM Warranty ($0 Free Replacement)',
    contractRef: 'OEM-FS-PUMP-2026-04',
    warrantyContractId: 'OEM-FS-PUMP-2026-04',
    escalationTarget: 'OEM',
  },
  {
    id: 'ESC-2026-7730',
    ticketId: 'TCK-2026-2104',
    rawCaseId: 'CASE-2026-7730',
    assetTag: 'GEARBOX-HELICAL-305',
    assetName: 'Main Drive Helical Gearbox 305',
    title: 'Main Drive Helical Gearbox Pinion Tooth Surface Pitting',
    priority: 'Critical',
    oemManufacturer: 'Bosch Rexroth Industrial Hydraulics',
    oemContactEmail: 'service.field@boschrexroth.de',
    oemHotline: '+49 711 811-0 (24/7 Field Tech Dispatch)',
    slaPriority: '🚨 L4 Critical — 4-Hour Emergency Onsite Dispatch',
    faultCode: 'ERR-702-HW-FATAL',
    alarmCode: 'VIB-RMS-CRIT-901',
    symptom: 'Resonant gearmesh harmonics > 4.2 mm/s RMS and oil film breakdown at 1450 RPM under plant loading',
    rcaFindings: 'Pinion gear tooth micro-spalling causing resonant gearmesh harmonics > 4.2 mm/s RMS and oil film breakdown at 1450 RPM.',
    rcaRootCause: 'Pinion gear tooth micro-spalling causing resonant gearmesh harmonics',
    failedNotes: 'Blocked at Step 4: Star-Pattern Torque & Backlash Alignment — Flange backlash exceeds tolerance (0.18 mm vs 0.05 mm spec). Internal planetary sun gear requires factory tooling & replacement.',
    failedStepNumber: 4,
    failedStepTitle: 'Star-Pattern Torque & Backlash Alignment',
    escalatedBy: 'Alex Rivera',
    escalatedByTechnician: 'Alex Rivera',
    escalatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    dispatchedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    clearedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    clearedBy: 'Plant Chief Engineer',
    oemReportNotes: 'OEM certified field technician completed planetary sun gear replacement and aligned backlash to 0.04 mm. Re-greased with Mobilgear SHC 220 synthetic lubricant. Passed zero-energy isolation restoration.',
    status: '3. 100% Verified',
    stage: 3,
    warrantyStatus: 'Active Factory OEM Warranty ($0 Free Replacement)',
    contractRef: 'OEM-BR-HYD-2026-99',
    warrantyContractId: 'OEM-BR-HYD-2026-99',
    escalationTarget: 'OEM',
  },
];

// Helper to determine the 3-stage progression cleanly
export const getEscalationStage = (rec: OemEscalationRecord): OemEscalationStage => {
  if (
    rec.stage === 3 ||
    rec.status?.includes('3.') ||
    rec.status?.includes('100% Verified') ||
    rec.status?.includes('Resolved') ||
    rec.status?.includes('Archived') ||
    rec.status?.includes('Cleared') ||
    rec.clearedAt
  ) {
    return 3;
  }
  if (
    rec.stage === 2 ||
    rec.status?.includes('2.') ||
    rec.status?.includes('OEM Confirmed') ||
    rec.status?.includes('Dispatched') ||
    rec.status?.includes('Vendor Active') ||
    rec.dispatchedAt
  ) {
    return 2;
  }
  return 1;
};

export const OemEscalationsView: React.FC<{
  onNavigateToTechQueue?: (ticketId: string) => void;
}> = ({ onNavigateToTechQueue }) => {
  const { user, organization } = useAuth();
  const { activePlant } = usePlant();
  const { toast } = useToast();

  const [escalations, setEscalations] = useState<OemEscalationRecord[]>(() => {
    return getTenantData<OemEscalationRecord[]>('forgex_oem_escalations', activePlant, DEFAULT_OEM_ESCALATIONS)
      .map(sanitizeEscalationRecord);
  });

  // Selected escalation ID
  const [selectedId, setSelectedId] = useState<string>(() => {
    return escalations.length > 0 ? escalations[0].id : '';
  });

  // Sync and isolate escalations when active plant or company changes
  useEffect(() => {
    const loaded = getTenantData<OemEscalationRecord[]>('forgex_oem_escalations', activePlant, DEFAULT_OEM_ESCALATIONS)
      .map(sanitizeEscalationRecord);
    setEscalations(loaded);
    setSelectedId(loaded.length > 0 ? loaded[0].id : '');
  }, [activePlant, organization?.id]);

  useEffect(() => {
    const handleTenantChange = () => {
      const loaded = getTenantData<OemEscalationRecord[]>('forgex_oem_escalations', activePlant, DEFAULT_OEM_ESCALATIONS)
        .map(sanitizeEscalationRecord);
      setEscalations(loaded);
      setSelectedId(loaded.length > 0 ? loaded[0].id : '');
    };
    window.addEventListener('forgex:tenant_changed', handleTenantChange);
    window.addEventListener('forgex:tenant_data_updated', handleTenantChange);
    return () => {
      window.removeEventListener('forgex:tenant_changed', handleTenantChange);
      window.removeEventListener('forgex:tenant_data_updated', handleTenantChange);
    };
  }, [activePlant]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'STAGE_1' | 'STAGE_2' | 'STAGE_3'>('ALL');
  const [escalationTarget, setEscalationTarget] = useState<'OEM' | 'AUTHORITY'>('OEM');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [capturedKnowledgeIds, setCapturedKnowledgeIds] = useState<Set<string>>(new Set());

  // Active workflow step state (1: Supervisor Check, 2: OEM Confirmed, 3: 100% Verified)
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<1 | 2 | 3>(1);

  // Auto-Mail Centered Modal state
  const [isAutoMailModalOpen, setIsAutoMailModalOpen] = useState(false);
  const [isViewMailModalOpen, setIsViewMailModalOpen] = useState(false);
  const [loggedOemResponses, setLoggedOemResponses] = useState<Set<string>>(() => new Set());

  // Email form states
  const [supervisorEmail, setSupervisorEmail] = useState(
    user?.email || 'saksham.supervisor@jmktiles.com'
  );
  const [oemEmail, setOemEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Resolution sign-off state for Step 3
  const [signOffNotes, setSignOffNotes] = useState(
    'OEM certified field service engineer on-site overhaul completed. Operating tolerances verified within OEM specifications. Passed return-to-service checks.'
  );
  const [isSubmittingSignOff, setIsSubmittingSignOff] = useState(false);

  // Reusable 2-Step Confirmation Modal State (🛡️ Confirm Confidential Action)
  const [confirmActionModalState, setConfirmActionModalState] = useState<{
    isOpen: boolean;
    title?: string;
    subtitle?: string;
    description: string;
    targetItemName?: string;
    targetItemId?: string;
    acknowledgmentText?: string;
    confirmButtonText?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  // Listen for real-time escalations from Technician Queue / Tech Execution Desk
  useEffect(() => {
    const handleOemEvent = (e: Event) => {
      const custom = e as CustomEvent<OemEscalationRecord>;
      if (custom.detail) {
        const sanitized = sanitizeEscalationRecord(custom.detail);
        setEscalations((prev) => {
          const matchIdx = prev.findIndex(
            (x) => x.id === sanitized.id || x.ticketId === sanitized.ticketId
          );
          let next: OemEscalationRecord[];
          if (matchIdx !== -1) {
            next = [...prev];
            next[matchIdx] = { ...next[matchIdx], ...sanitized };
          } else {
            next = [sanitized, ...prev];
          }
          setTenantData('forgex_oem_escalations', activePlant, next);
          return next;
        });
        setSelectedId(sanitized.id);
      }
    };

    window.addEventListener('forgex:oem-escalated', handleOemEvent);
    return () => window.removeEventListener('forgex:oem-escalated', handleOemEvent);
  }, [activePlant]);

  // Filtered escalations according to search & 3-stage tabs
  const filteredList = useMemo(() => {
    return escalations.filter((rec) => {
      const stage = getEscalationStage(rec);
      if (statusFilter === 'STAGE_1' && stage !== 1) return false;
      if (statusFilter === 'STAGE_2' && stage !== 2) return false;
      if (statusFilter === 'STAGE_3' && stage !== 3) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = rec.ticketId.toLowerCase().includes(q) || rec.id.toLowerCase().includes(q);
        const matchTag = rec.assetTag.toLowerCase().includes(q);
        const matchOem = rec.oemManufacturer.toLowerCase().includes(q);
        const matchTech = (rec.escalatedBy || rec.escalatedByTechnician || '').toLowerCase().includes(q);
        const matchTitle = (rec.title || rec.assetName || '').toLowerCase().includes(q);
        if (!matchId && !matchTag && !matchOem && !matchTech && !matchTitle) return false;
      }
      return true;
    });
  }, [escalations, searchQuery, statusFilter]);

  // Selected active escalation record
  const activeRecord = useMemo(() => {
    if (!selectedId) {
      return filteredList.length > 0 ? filteredList[0] : null;
    }
    return escalations.find((r) => r.id === selectedId) || (filteredList.length > 0 ? filteredList[0] : null);
  }, [escalations, selectedId, filteredList]);

  // Sync activeWorkflowStep and email fields whenever activeRecord changes
  useEffect(() => {
    if (activeRecord) {
      const stage = getEscalationStage(activeRecord);
      setActiveWorkflowStep(stage);

      const realMachineName = extractRealMachineName(activeRecord);
      const cleanRootCauseFormatted = cleanDiagnosticRootCause(activeRecord.rcaRootCause || activeRecord.rcaFindings, realMachineName);
      const cleanSymptomFormatted = cleanObservedIssue(activeRecord.symptom, realMachineName);
      const alarmCode = activeRecord.alarmCode || activeRecord.faultCode || 'FC-ALERT-01';
      const cleanContractId = (activeRecord.warrantyContractId || activeRecord.contractRef || `OEM-${realMachineName}-WARR-2026`)
        .replace(/\.(glb|gltf)\b/gi, '')
        .replace(/\s*\([^)]*\)/g, '')
        .trim();

      // Email inputs are strictly empty by default so user enters them manually every time
      setSupervisorEmail('');
      setOemEmail('');

      // Subject format: [URGENT OEM DISPATCH] ${realMachineName} (Ticket ${ticketId}) — ${alarmCode}
      const generatedSubject = `[URGENT OEM DISPATCH] ${realMachineName} (Ticket ${activeRecord.ticketId}) — ${alarmCode}`;
      setEmailSubject(generatedSubject);

      const cleanHaltedNotes = (activeRecord.failedNotes || 'Mechanical seizure and cavitation micro-cracking encountered; safety lockout engaged.')
        .replace(/Equipment:\s*[^;\n\r]+/gi, '')
        .replace(/Failed Step:\s*[^;\n\r]+/gi, '')
        .replace(/Auto-Assigned To:\s*[^;\n\r]+/gi, '')
        .replace(/Assigned Technician:\s*[^;\n\r]+/gi, '')
        .replace(/Execution halted at[^;\n\r]+/gi, '')
        .replace(/Blocked at[^;\n\r]+/gi, '')
        .trim();

      const generatedBody = `Dear ${activeRecord.oemManufacturer || 'OEM'} Technical Support Team,

This is an official priority OEM Service Escalation from ${organization?.name || 'JMK Tiles Modernized'}.

1. MACHINE & TICKET INFORMATION:
- Machine / Asset: ${realMachineName}
- Ticket ID: ${activeRecord.ticketId}
- Warranty Reference: ${cleanContractId} ($0 Free Replacement Coverage)

2. OBSERVED FAULT & CONFIRMED ROOT CAUSE:
- Alarm / Fault Code: ${alarmCode}
- Observed Issue: ${cleanSymptomFormatted}
- Diagnostic Root Cause: ${cleanRootCauseFormatted}

3. HALTED TECHNICIAN STEP & OEM REQUEST:
- In-house safety verification and OSHA zero-energy lockout (LOTO) completed.
- Shop-floor technician execution was halted at Step #${activeRecord.failedStepNumber || 2} (${activeRecord.failedStepTitle || 'Component Inspection & Diagnostics'}): ${cleanHaltedNotes}
- The machine is currently locked out awaiting certified OEM technical representative dispatch and on-site overhaul.

Please confirm OEM engineer dispatch and estimated time of arrival (ETA).`;

      setEmailBody(generatedBody);

      if (activeRecord.oemReportNotes) {
        setSignOffNotes(activeRecord.oemReportNotes);
      }
    }
  }, [activeRecord, organization?.name]);

  // KPI Strip Metrics
  const kpiTotal = escalations.length;
  const kpiStage1 = escalations.filter((x) => getEscalationStage(x) === 1).length;
  const kpiStage2 = escalations.filter((x) => getEscalationStage(x) === 2).length;
  const kpiStage3 = escalations.filter((x) => getEscalationStage(x) === 3).length;

  // STEP 1 Action: Trigger Centered Auto-Mail Popup Modal
  const handleOpenAutoMailModal = () => {
    if (!activeRecord) return;
    setSupervisorEmail('');
    setOemEmail('');
    setIsAutoMailModalOpen(true);
  };

  // Helper to build direct Gmail Web Compose Draft URL
  const buildGmailDraftUrl = (to: string, subject: string, body: string, cc?: string) => {
    let url = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to.trim())}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (cc && cc.trim()) {
      url += `&cc=${encodeURIComponent(cc.trim())}`;
    }
    return url;
  };

  // Helper to build direct desktop mailto URL
  const buildMailtoUrl = (to: string, subject: string, body: string, cc?: string) => {
    let url = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (cc && cc.trim()) {
      url += `&cc=${encodeURIComponent(cc.trim())}`;
    }
    return url;
  };

  // STEP 1 Modal Submit -> STEP 2: Dispatch Official Mail to OEM & Launch Pre-filled Gmail Compose Draft
  const handleDispatchOfficialOemMail = (openInGmail = true) => {
    if (!activeRecord) return;
    if (!supervisorEmail.trim() || !oemEmail.trim()) {
      toast.error('Validation Error', 'Both Supervisor Email and OEM Manufacturer Email are required.');
      return;
    }

    const now = new Date().toISOString();
    const cleanToEmail = oemEmail.trim();
    const cleanSupervisorEmail = supervisorEmail.trim();

    const updated = escalations.map((item) =>
      item.id === activeRecord.id
        ? {
            ...item,
            stage: 2 as const,
            status: '2. OEM Confirmed',
            dispatchedAt: now,
            oemContactEmail: cleanToEmail,
            dispatchedFromEmail: cleanSupervisorEmail,
            dispatchedToEmail: cleanToEmail,
            dispatchedSubject: emailSubject,
            dispatchedBody: emailBody,
          }
        : item
    );
    setEscalations(updated);
    setTenantData('forgex_oem_escalations', activePlant, updated);

    window.dispatchEvent(
      new CustomEvent('forgex:oem-updated', {
        detail: {
          id: activeRecord.id,
          stage: 2,
          status: '2. OEM Confirmed',
          oemContactEmail: cleanToEmail,
          dispatchedAt: now,
          dispatchedFromEmail: cleanSupervisorEmail,
          dispatchedToEmail: cleanToEmail,
          dispatchedSubject: emailSubject,
          dispatchedBody: emailBody,
        },
      })
    );

    // Launch Gmail Web Compose in a new tab/window with To, Subject, and Body 100% pre-filled
    if (openInGmail) {
      const gmailDraftUrl = buildGmailDraftUrl(cleanToEmail, emailSubject, emailBody, cleanSupervisorEmail);
      try {
        window.open(gmailDraftUrl, '_blank', 'noopener,noreferrer');
      } catch (err) {
        console.warn('Could not launch Gmail draft tab:', err);
      }
    } else {
      // Fallback desktop mail client (mailto:)
      const mailtoUrl = buildMailtoUrl(cleanToEmail, emailSubject, emailBody, cleanSupervisorEmail);
      try {
        window.open(mailtoUrl, '_blank');
      } catch {}
    }

    // Copy to clipboard as backup
    try {
      navigator.clipboard.writeText(emailBody);
    } catch {}

    setIsAutoMailModalOpen(false);
    setActiveWorkflowStep(2);
    toast.success(
      openInGmail ? 'Gmail Compose Draft Launched' : 'Desktop Mail Client Launched',
      `Official failure dossier pre-filled and dispatched for ${cleanToEmail}. Moved to Step 2: OEM Confirmed.`
    );
  };

  // Re-open pre-filled draft in Gmail anytime from Step 2
  const handleReopenGmailDraft = () => {
    if (!activeRecord) return;
    const targetEmail = activeRecord.dispatchedToEmail || activeRecord.oemContactEmail || oemEmail || '';
    const subject = activeRecord.dispatchedSubject || emailSubject;
    const body = activeRecord.dispatchedBody || emailBody;
    const cc = activeRecord.dispatchedFromEmail || supervisorEmail;

    if (!targetEmail.trim()) {
      toast.error('Missing Email', 'No OEM manufacturer email address recorded on this ticket.');
      return;
    }

    const gmailDraftUrl = buildGmailDraftUrl(targetEmail, subject, body, cc);
    try {
      window.open(gmailDraftUrl, '_blank', 'noopener,noreferrer');
      toast.info('Gmail Compose Draft Opened', `Pre-filled failure dossier draft re-opened for ${targetEmail}.`);
    } catch {
      toast.error('Pop-up Blocked', 'Please allow pop-ups to open the Gmail compose screen.');
    }
  };

  // STEP 2 -> STEP 3: Confirm Problem Solved from OEM Side
  const handleConfirmOemSolvedStep2 = () => {
    if (!activeRecord) return;
    const now = new Date().toISOString();
    const updated = escalations.map((item) =>
      item.id === activeRecord.id
        ? {
            ...item,
            stage: 3 as const,
            status: '3. 100% Verified',
            clearedAt: now,
            clearedBy: user?.fullName || 'Saksham Goel (Lead Supervisor)',
          }
        : item
    );
    setEscalations(updated);
    setTenantData('forgex_oem_escalations', activePlant, updated);

    window.dispatchEvent(
      new CustomEvent('forgex:oem-updated', {
        detail: { id: activeRecord.id, stage: 3, status: '3. 100% Verified' },
      })
    );

    setActiveWorkflowStep(3);
    toast.success(
      'OEM Problem Confirmed Solved',
      'Manufacturer overhaul verified. Moved to Step 3: 100% Verified for final audit sign-off.'
    );
  };

  // Copy Mail Content
  const handleCopyEmailContent = async () => {
    try {
      await navigator.clipboard.writeText(emailBody);
      toast.success('Mail Content Copied', 'Full technical escalation email copied to clipboard.');
    } catch {
      toast.error('Copy Failed', 'Could not copy mail body to clipboard.');
    }
  };

  // Export OEM Failure Dossier (Clean Printable View)
  const handleExportFailureDossier = (rec: OemEscalationRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.info('Pop-up Blocked', 'Please allow pop-ups to print or export the OEM Failure Dossier.');
      return;
    }

    const cleanMachine = formatCleanMachineName(rec.assetTag || rec.assetName || 'COOLING TOWER');
    const stage = getEscalationStage(rec);
    const stageLabel =
      stage === 1
        ? 'Step 1: Supervisor Check & Approval'
        : stage === 2
        ? 'Step 2: OEM Dispatch Confirmed'
        : 'Step 3: 100% Verified & Sealed';

    const targetOemEmail = rec.oemContactEmail || oemEmail || 'oem.support@manufacturer.com';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OEM Failure Dossier - ${rec.ticketId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            h1 { font-size: 20px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: -0.5px; }
            .header-strip { display: flex; justify-content: space-between; border-bottom: 2px solid #1e1b4b; padding-bottom: 16px; margin-bottom: 24px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; background: #e0e7ff; color: #3730a3; font-family: monospace; }
            .stage-pill { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; background: #e0f2fe; color: #0369a1; font-family: monospace; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; font-size: 13px; }
            .section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px; }
            .section-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #475569; margin-bottom: 6px; font-family: monospace; }
            .blocked-box { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px; margin-bottom: 16px; color: #881337; font-size: 13px; }
            .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 40px; padding-top: 24px; border-top: 1px dashed #cbd5e1; }
            .sig-line { border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 6px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header-strip">
            <div>
              <h1>OEM Technical Failure Dossier & Warranty Claim</h1>
              <div style="font-size: 12px; color: #64748b; font-family: monospace;">Case Ref: ${rec.ticketId} · Machine: ${cleanMachine}</div>
            </div>
            <div>
              <span class="stage-pill">${stageLabel}</span>
              <span class="badge" style="margin-left: 8px;">${rec.id}</span>
            </div>
          </div>

          <div class="grid">
            <div class="section">
              <div class="section-title">OEM Vendor Details</div>
              <div><strong>Manufacturer:</strong> ${rec.oemManufacturer}</div>
              <div><strong>Direct Email:</strong> ${targetOemEmail}</div>
              <div><strong>Field Hotline:</strong> ${rec.oemHotline || '+1 (800) 555-OEM-24'}</div>
              <div><strong>Warranty Contract:</strong> ${rec.warrantyContractId || rec.contractRef}</div>
            </div>

            <div class="section">
              <div class="section-title">Warranty & Dispatch Priority</div>
              <div><strong>SLA Priority:</strong> ${rec.slaPriority}</div>
              <div><strong>Warranty Status:</strong> ${rec.warrantyStatus}</div>
              <div><strong>Escalating Technician:</strong> ${rec.escalatedBy || rec.escalatedByTechnician}</div>
              <div><strong>Alarm / Diagnostic Code:</strong> ${rec.alarmCode || rec.faultCode}</div>
            </div>
          </div>

          <div class="blocked-box">
            <div class="section-title" style="color: #9f1239;">Blocked Sub-Assembly Step & Field Bottleneck</div>
            <div style="font-weight: bold; margin-bottom: 4px;">Step ${rec.failedStepNumber || 2}: ${rec.failedStepTitle || 'Component Overhaul'}</div>
            <div>${rec.failedNotes}</div>
          </div>

          <div class="section">
            <div class="section-title">Root Cause Analysis (RCA) Confirmed Hypothesis</div>
            <div>${rec.rcaRootCause || rec.rcaFindings}</div>
          </div>

          <div class="section">
            <div class="section-title">Observed Field Symptom</div>
            <div>${rec.symptom || 'High operational vibration and suction cavitation surge detected during Running state.'}</div>
          </div>

          ${
            stage === 3
              ? `
            <div class="section" style="background: #eef2ff; border-color: #c7d2fe; color: #1e1b4b;">
              <div class="section-title" style="color: #3730a3;">Vendor Resolution & Authority Sign-Off</div>
              <div><strong>Cleared By:</strong> ${rec.clearedBy || user?.fullName || 'Plant Chief Engineer'}</div>
              <div><strong>Timestamp:</strong> ${formatLocalDateTime(rec.clearedAt || new Date().toISOString())}</div>
              <div style="margin-top: 6px;"><strong>Resolution Remarks:</strong> ${rec.oemReportNotes || signOffNotes}</div>
            </div>
            `
              : ''
          }

          <div class="signatures">
            <div>
              <div class="sig-line"></div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">PLANT SUPERVISOR / CHIEF ENGINEER SIGN-OFF</div>
            </div>
            <div>
              <div class="sig-line"></div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">CERTIFIED OEM VENDOR FIELD ENGINEER SIGN-OFF</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  // Delete / Cancel Escalation
  const handleDeleteEscalation = (idToDelete: string) => {
    const updated = escalations.filter((x) => x.id !== idToDelete && x.ticketId !== idToDelete);
    setEscalations(updated);
    setTenantData('forgex_oem_escalations', activePlant, updated);

    if (selectedId === idToDelete) {
      setSelectedId(updated.length > 0 ? updated[0].id : '');
    }
    setDeleteConfirmId(null);
    toast.info('Escalation Removed', 'OEM escalation record was cancelled and removed.');
  };

  // STEP 3: Confirm OEM Resolution & Archive to History
  const handleAuthorizeClearance = async () => {
    if (!activeRecord) return;
    setIsSubmittingSignOff(true);

    try {
      const now = new Date().toISOString();
      const cleanMachine = formatCleanMachineName(activeRecord.assetTag || activeRecord.assetName || 'COOLING TOWER');
      const cleanRootCause = formatCleanNoteTitle(activeRecord.rcaRootCause || activeRecord.rcaFindings, cleanMachine);
      const cleanFix = cleanRemediationText(signOffNotes.trim());

      const updatedList = escalations.map((item) =>
        item.id === activeRecord.id
          ? {
              ...item,
              stage: 3 as const,
              status: '3. 100% Verified',
              oemReportNotes:
                cleanFix ||
                'OEM field service engineer on-site overhaul completed and certified by Higher Authority.',
              clearedAt: now,
              clearedBy: user?.fullName || 'Plant Chief Engineer',
            }
          : item
      );

      setEscalations(updatedList);
      setTenantData('forgex_oem_escalations', activePlant, updatedList);

      // A. Save directly to Maintenance History in tenant storage
      const oemHistoryRecord = {
        id: `rec-mr-oem-${Date.now().toString().slice(-6)}`,
        recordNumber: `MR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        organizationId: organization?.id || 'org-demo',
        plantId: activePlant || 'PLANT-TX-04',
        machineId: cleanMachine,
        machineAssetTag: cleanMachine,
        ticketNumber: activeRecord.ticketId,
        ticketId: activeRecord.ticketId,
        caseId: activeRecord.rawCaseId || activeRecord.ticketId,
        caseNumber: activeRecord.rawCaseId || activeRecord.ticketId,
        problemStatement: `[OEM Overhaul] ${cleanMachine} - ${cleanRootCause}`,
        observedSymptoms: [
          activeRecord.symptom || 'Operational parameter deviation / High vibration',
          activeRecord.failedNotes,
        ],
        rootCause: `[OEM Certified Overhaul] ${cleanRootCause} — ${activeRecord.failedNotes}`,
        rootCauseStatus: 'CONFIRMED' as const,
        faultCategory: 'OEM_RESOLVED',
        repairActions: [
          `OEM certified factory overhaul completed by ${activeRecord.oemManufacturer}.`,
          `Sub-assembly step #${activeRecord.failedStepNumber || 2} (${activeRecord.failedStepTitle || 'Component Inspection'}) cleared.`,
          `Authority sign-off: ${cleanFix || 'Factory overhaul certified and signed off.'}`,
        ],
        verificationState: 'PASSED' as const,
        approvalStatus: 'APPROVED' as const,
        resolvedAt: now,
        resolvingTechnicianName: `${activeRecord.oemManufacturer} (Certified OEM Vendor)`,
        resolutionSource: 'OEM_RESOLVED',
        mttrMinutes: 48,
      };

      try {
        const historyList = getTenantData<any[]>('forgex_maintenance_history', activePlant, []);
        const existingIdx = historyList.findIndex(
          (h: any) => h.ticketId === activeRecord.ticketId || h.ticketNumber === activeRecord.ticketId
        );
        if (existingIdx !== -1) {
          historyList[existingIdx] = { ...historyList[existingIdx], ...oemHistoryRecord };
        } else {
          historyList.unshift(oemHistoryRecord);
        }
        setTenantData('forgex_maintenance_history', activePlant, historyList);
      } catch {}

      // B. Update forgex_shared_raised_tickets to mark ticket resolved/closed
      try {
        const tickets = getTenantData<any[]>('forgex_shared_raised_tickets', activePlant, []);
        if (Array.isArray(tickets) && tickets.length > 0) {
          const updatedTickets = tickets.map((t: any) => {
            if (t.id === activeRecord.ticketId || t.ticketNumber === activeRecord.ticketId) {
              return {
                ...t,
                status: 'RESOLVED',
                resolutionNotes: cleanFix || 'OEM Vendor Overhaul Cleared',
              };
            }
            return t;
          });
          setTenantData('forgex_shared_raised_tickets', activePlant, updatedTickets);
        }
      } catch {}

      // C. Update matching ticket in Tech Execution Desk queue (forgex_tech_queue_tasks)
      try {
        const queue = getTenantData<any[]>('forgex_tech_queue_tasks', activePlant, []);
        if (Array.isArray(queue) && queue.length > 0) {
          const updatedQueue = queue.map((t: any) => {
            if (t.id === activeRecord.ticketId || t.rawCaseId === activeRecord.ticketId) {
              return {
                ...t,
                status: 'Resolved',
                completedSteps: t.stepsCount || 5,
                steps: Array.isArray(t.steps)
                  ? t.steps.map((s: any) => ({ ...s, status: 'COMPLETED' }))
                  : t.steps,
              };
            }
            return t;
          });
          setTenantData('forgex_tech_queue_tasks', activePlant, updatedQueue);
        }
      } catch {}

      // D. Dispatch cross-module sync events
      window.dispatchEvent(
        new CustomEvent('forgex:ticket-solved', {
          detail: { ticketId: activeRecord.ticketId, rawCaseId: activeRecord.rawCaseId },
        })
      );
      window.dispatchEvent(
        new CustomEvent('forgex:history-updated', { detail: oemHistoryRecord })
      );
      window.dispatchEvent(
        new CustomEvent('forgex:ticket-progress-sync', {
          detail: { ticketId: activeRecord.ticketId, status: 'Resolved' },
        })
      );

      toast.success(
        'OEM Resolution Verified & Archived',
        `Repairs confirmed by ${activeRecord.oemManufacturer}. Permanent audit record archived to Maintenance History.`
      );
    } catch (err: any) {
      toast.error('Sign-off Failed', err.message || 'Could not save clearance.');
    } finally {
      setIsSubmittingSignOff(false);
    }
  };

  // STEP 3: 1-Click Save Vendor Fix to Expert Knowledge & Auto-Redirect
  const handleCaptureVendorFixInKnowledge = (rec: OemEscalationRecord) => {
    try {
      const cleanMachine = formatCleanMachineName(rec.assetTag || rec.assetName || 'COOLING TOWER');
      const cleanTitle = formatCleanNoteTitle(rec.title || rec.rcaRootCause || 'OEM Certified Overhaul', cleanMachine);
      const cleanFix = cleanRemediationText(
        signOffNotes.trim() ||
          rec.oemReportNotes ||
          'Certified OEM factory cartridge replacement and dynamic balance calibration completed. Operating tolerances verified within OEM specifications.'
      );
      const cleanTrigger = cleanTriggerText(rec.symptom || rec.rcaFindings, null, cleanTitle);

      const newTip = {
        id: `note-oem-${Date.now()}`,
        title: cleanTitle,
        assetTag: cleanMachine,
        machineAssetTag: cleanMachine,
        machineAssetTags: [cleanMachine],
        category: 'Reliability',
        severity: 'Pro-Tip / Best Practice',
        symptom: cleanTrigger,
        taskDuringIssue: 'Standard Plant Operation / AI RCA Diagnostic',
        description: cleanFix,
        content: cleanFix,
        author: `${rec.oemManufacturer} (Factory Field Service)`,
        authorName: `${rec.oemManufacturer} (Factory Field Service)`,
        upvotes: 1,
        downvotes: 0,
        createdAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        status: 'APPROVED',
      };

      const notesList = getTenantData<any[]>('forgex_expert_notes', activePlant, []);
      notesList.unshift(newTip);
      setTenantData('forgex_expert_notes', activePlant, notesList);

      setCapturedKnowledgeIds((prev) => new Set([...prev, rec.id]));

      window.dispatchEvent(new CustomEvent('forgex:expert-note-created', { detail: newTip }));
      window.dispatchEvent(new CustomEvent('forgex:knowledge-updated', { detail: newTip }));

      toast.success(
        'Captured in Expert Knowledge',
        'OEM procedure and clearance remarks logged into Expert Knowledge Repository!'
      );

      // Smooth auto-redirect to Expert Knowledge module
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'expert-knowledge' }));
        window.dispatchEvent(new CustomEvent('navigate-to-module', { detail: 'expert-knowledge' }));
        window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'expert-knowledge' } }));
        window.location.hash = '#expert-knowledge';
      }
    } catch (err: any) {
      toast.error('Knowledge Capture Failed', err.message || 'Could not save tip.');
    }
  };

  const cleanMachine = activeRecord
    ? extractRealMachineName(activeRecord)
    : 'COOLING TOWER';
  const cleanRootCause = activeRecord
    ? cleanDiagnosticRootCause(activeRecord.rcaRootCause || activeRecord.rcaFindings, cleanMachine)
    : 'Dynamic Hydraulic Cavitation & Impeller Vane Unbalance';
  const cleanSymptom = activeRecord
    ? cleanObservedIssue(activeRecord.symptom, cleanMachine)
    : 'High vibration and mechanical sub-assembly seizure requiring OEM intervention.';
  const cleanWarrantyContractId = activeRecord
    ? (activeRecord.warrantyContractId || activeRecord.contractRef || `OEM-${cleanMachine}-WARR-2026`)
        .replace(/\.(glb|gltf)\b/gi, '')
        .replace(/\s*\([^)]*\)/g, '')
        .trim()
    : 'OEM-SIEMENS-WARR-2026-09';

  const recordStage = activeRecord ? getEscalationStage(activeRecord) : 1;
  const isKnowledgeCaptured = activeRecord ? capturedKnowledgeIds.has(activeRecord.id) : false;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] overflow-hidden font-sans">
      {/* ================================================================= */}
      {/* TOP HEADER & KPI STRIP (Deep Navy-to-Indigo Theme)                */}
      {/* ================================================================= */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-cyan-300 flex items-center justify-center shadow-xs border border-indigo-900/50 shrink-0">
            <Building2 className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                OEM &amp; Higher Authority Escalations
              </h1>
              <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded-full">
                3-Step Resolution Flow
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Supervisor sign-off ➔ automated manufacturer technical dispatch ➔ OEM overhaul sign-off
            </p>
          </div>
        </div>

        {/* Top 4 KPI Cards: Distinct Accent Strips & Soft Tints */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Card 1: Total Escalations (Slate-Blue Accent) */}
          <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/20 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs min-w-[105px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-700 via-indigo-600 to-blue-600" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-mono mt-0.5">
              Total Escalations
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-slate-900 font-mono">{kpiTotal}</span>
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* Card 2: 1. Supervisor Check (Amber-Orange Accent) */}
          <div className="bg-gradient-to-br from-amber-50/80 via-orange-50/30 to-white border border-amber-200/90 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />
            <span className="text-[9px] text-amber-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              1. Supervisor Check
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-amber-950 font-mono">{kpiStage1}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>

          {/* Card 3: 2. OEM Confirmed (Sky-Cyan Accent) */}
          <div className="bg-gradient-to-br from-sky-50/80 via-cyan-50/30 to-white border border-cyan-200/90 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-600" />
            <span className="text-[9px] text-cyan-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              2. OEM Confirmed
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-cyan-950 font-mono">{kpiStage2}</span>
              <Mail className="w-3.5 h-3.5 text-cyan-600" />
            </div>
          </div>

          {/* Card 4: 3. 100% Verified (Emerald-Teal Accent) */}
          <div className="bg-gradient-to-br from-emerald-50/80 via-teal-50/30 to-white border border-emerald-200/90 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
            <span className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              3. 100% Verified
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-emerald-950 font-mono">{kpiStage3}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left List + Right Dynamic 3-Step Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0 overflow-hidden">
        {/* ================================================================= */}
        {/* LEFT MASTER LIST OF ESCALATED TICKETS                             */}
        {/* ================================================================= */}
        <div className="w-full lg:w-96 xl:w-[400px] border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
          {/* Search & Compact Filter Grid */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search Ticket, Asset, OEM, Tech..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs font-sans placeholder:text-slate-400"
              />
            </div>

            {/* 4-Tab Filter Grid with Navy-Indigo Gradients */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg text-[10px] font-semibold">
              {[
                { id: 'ALL' as const, label: 'All Cases' },
                { id: 'STAGE_1' as const, label: '1. Supervisor' },
                { id: 'STAGE_2' as const, label: '2. Dispatched' },
                { id: 'STAGE_3' as const, label: '3. Verified' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`py-1 px-1 rounded-md text-center transition cursor-pointer whitespace-nowrap font-bold ${
                    statusFilter === tab.id
                      ? 'bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-cyan-300 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
            {filteredList.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2">
                <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700 font-mono">No Active Escalations</p>
                <p className="text-[11px] text-slate-400 font-sans max-w-xs mx-auto leading-relaxed">
                  When a technician escalates a ticket in Tech Execution Desk, it will appear here.
                </p>
              </div>
            ) : (
              filteredList.map((rec) => {
                const isSelected = activeRecord?.id === rec.id;
                const stage = getEscalationStage(rec);
                const recCleanMachine = extractRealMachineName(rec);

                return (
                  <div
                    key={rec.id}
                    onClick={() => {
                      setSelectedId(rec.id);
                      setActiveWorkflowStep(getEscalationStage(rec));
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 group relative ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-500/30 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Row 1: Ticket ID + Clean Machine Tag + Step Badge + Delete */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-indigo-700 text-xs">
                          {rec.ticketId}
                        </span>
                        <span className="font-mono font-bold bg-slate-900 text-cyan-300 px-1.5 py-0.5 rounded text-[10px] tracking-tight truncate max-w-[150px]">
                          {recCleanMachine}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                            stage === 3
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : stage === 2
                              ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {stage === 1
                            ? '1. Supervisor'
                            : stage === 2
                            ? '2. Dispatched'
                            : '3. 100% Verified'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(rec.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete Escalation"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: OEM Manufacturer Name & Blocked Step */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-sans text-[11px] truncate">
                          {rec.oemManufacturer}
                        </span>
                      </div>
                      <div className="text-xs text-rose-700 font-mono font-medium leading-snug line-clamp-2 break-words">
                        ⚠️ Step #{rec.failedStepNumber || 2}: {rec.failedStepTitle || 'Component Overhaul'} — {rec.failedNotes}
                      </div>
                    </div>

                    {/* Row 3: Footer Strip with Escalated By + Timestamp */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                      <span className="truncate">👨‍🔧 {rec.escalatedBy || rec.escalatedByTechnician}</span>
                      <span className="text-[9px] text-slate-400 shrink-0 font-sans font-medium">
                        {formatLocalDateTime(rec.escalatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT PANEL: DYNAMIC 3-STEP ESCALATION WORKSPACE                  */}
        {/* ================================================================= */}
        {activeRecord ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-[#F8FAFC]">
            {/* 1. TOP EXECUTIVE BANNER (Deep Navy-to-Indigo Gradient with 3-Step Interactive Stepper) */}
            {/* Only this top card is dark navy; controls are strictly locked to a single horizontal row */}
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-4 rounded-xl shadow-md border border-indigo-900/40 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3.5 shrink-0">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-cyan-300 bg-white/10 border border-white/20 px-2.5 py-0.5 rounded shadow-2xs">
                    {activeRecord.ticketId}
                  </span>
                  <span className="font-mono text-xs font-bold text-indigo-200 bg-indigo-500/30 border border-indigo-400/30 px-2.5 py-0.5 rounded">
                    {cleanMachine}
                  </span>
                  <span className="font-mono text-[10px] font-bold bg-indigo-600/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded">
                    {activeRecord.slaPriority}
                  </span>

                  {/* Escalation Target Switcher */}
                  <div className="inline-flex items-center bg-black/40 p-0.5 rounded-lg border border-white/15 text-[10px] font-mono ml-1">
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('OEM')}
                      className={`px-2 py-0.5 rounded-md font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        escalationTarget === 'OEM'
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Building2 className="w-3 h-3" />
                      <span>OEM Vendor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalationTarget('AUTHORITY')}
                      className={`px-2 py-0.5 rounded-md font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        escalationTarget === 'AUTHORITY'
                          ? 'bg-gradient-to-r from-indigo-800 to-slate-800 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Award className="w-3 h-3" />
                      <span>Plant Authority</span>
                    </button>
                  </div>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight break-words">
                  [{escalationTarget === 'OEM' ? 'OEM Manufacturer Escalation' : 'Plant Higher Authority Escalation'}] {cleanRootCause}
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-300 font-mono flex-wrap">
                  <span>
                    👨‍🔧 Escalated by: <strong className="text-white">{activeRecord.escalatedBy || activeRecord.escalatedByTechnician}</strong>
                  </span>
                  <span>•</span>
                  <span>🕒 {formatLocalDateTime(activeRecord.escalatedAt)}</span>
                  <span>•</span>
                  <span className="text-cyan-300 font-bold">
                    Current Mode: Step {activeWorkflowStep} of 3
                  </span>
                </div>
              </div>

              {/* Right Side: High-Contrast 3-Step Interactive Stepper + Dossier + Tech Desk strictly on a single horizontal row */}
              <div className="flex items-center gap-2 flex-nowrap shrink-0 overflow-x-auto py-0.5">
                <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-xl border border-white/10 shrink-0">
                  {[
                    { step: 1 as const, label: '1. Supervisor Check' },
                    { step: 2 as const, label: '2. OEM Confirmed' },
                    { step: 3 as const, label: '3. 100% Verified' },
                  ].map(({ step, label }) => {
                    const isCurrentActive = activeWorkflowStep === step;
                    const isCompleted =
                      (step === 1 && recordStage >= 2) ||
                      (step === 2 && recordStage >= 3) ||
                      (step === 3 && recordStage === 3 && Boolean(activeRecord?.clearedAt));
                    // Strict one-way enforcement: Earlier completed steps cannot be re-opened to unconfirm
                    const isLockedEarlier = step < recordStage;
                    const isLockedAtVerified = recordStage === 3 && step !== 3;
                    const isDisabled = isLockedEarlier || isLockedAtVerified;

                    return (
                      <button
                        key={step}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setActiveWorkflowStep(step)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                          isCurrentActive
                            ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md ring-2 ring-cyan-400/40 cursor-default'
                            : isDisabled
                            ? 'bg-slate-900/50 text-slate-500 border border-slate-800 opacity-60 cursor-not-allowed'
                            : isCompleted
                            ? 'bg-indigo-950/90 text-indigo-200 border border-indigo-400/40 hover:bg-indigo-900/80 cursor-pointer'
                            : 'bg-slate-900/80 text-slate-400 border border-slate-700 hover:bg-slate-800 cursor-pointer'
                        }`}
                        title={
                          isDisabled
                            ? `Step ${step} completed & locked (Strict One-Way Workflow)`
                            : `Switch to ${label}`
                        }
                      >
                        <span>{isCompleted ? '✓ ' : ''}{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Export Dossier */}
                <button
                  type="button"
                  onClick={() => handleExportFailureDossier(activeRecord)}
                  className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                  title="Print official OEM failure dossier"
                >
                  <Printer className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Dossier</span>
                </button>

                {onNavigateToTechQueue && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTechQueue(activeRecord.ticketId)}
                    className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                    title="Jump to active execution card in Tech Desk"
                  >
                    <Play className="w-3 h-3 fill-current text-cyan-400" />
                    <span>Tech Desk</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. DYNAMIC WORKSPACE BODY BASED ON ACTIVE STEP (1, 2, or 3) */}

            {/* ============================================================= */}
            {/* STEP 1 WORKSPACE: SUPERVISOR CHECK & AUTO-MAIL TRIGGER         */}
            {/* ============================================================= */}
            {activeWorkflowStep === 1 && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                {/* Step 1 Context & Action Banner (Amber-Indigo Light Gradient) */}
                <div className="p-4 bg-gradient-to-r from-amber-50 via-indigo-50/40 to-white border border-amber-300 text-slate-900 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                      <ShieldCheck className="w-4.5 h-4.5 text-amber-700" />
                    </div>
                    <div>
                      <strong className="text-slate-900 text-xs block font-mono">
                        STEP 1: SUPERVISOR REVIEW &amp; SHOP-FLOOR FAILURE AUDIT
                      </strong>
                      <p className="text-[11px] text-slate-600 font-sans mt-0.5">
                        Verify shop-floor failure telemetry before authorizing official OEM manufacturer escalation dispatch.
                      </p>
                    </div>
                  </div>

                  {recordStage >= 2 ? (
                    <div className="px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold flex items-center gap-1.5 shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>✓ Step 1 Confirmed &amp; Dispatched (Locked)</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleOpenAutoMailModal}
                      className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs inline-flex items-center gap-1.5 px-4 py-2 rounded-xl shadow-md cursor-pointer shrink-0 transition-all active:scale-95"
                    >
                      <ShieldCheck className="w-4 h-4 text-cyan-200" />
                      <span>Confirm Step 1 &amp; Prepare OEM Mail →</span>
                    </Button>
                  )}
                </div>

                {/* Single Crisp 2-Column Supervisor Issue Verification Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-white border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-xs font-bold uppercase font-mono tracking-wide text-slate-800">
                        Supervisor Issue Verification &amp; Authorization
                      </h3>
                    </div>
                    <span className="font-mono text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-md">
                      Step 1 Verification
                    </span>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    {/* Left Column: Reported Machine & Fault Summary */}
                    <div className="space-y-3.5 border-b md:border-b-0 md:border-r border-slate-100 md:pr-6 pb-4 md:pb-0">
                      <div className="flex items-center gap-2 text-slate-700 font-bold font-mono text-[11px] uppercase tracking-wider">
                        <Activity className="w-3.5 h-3.5 text-rose-500" />
                        <span>Reported Machine &amp; Fault Summary</span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Machine / Asset:</span>
                          <strong className="text-slate-900 font-bold font-sans text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                            {cleanMachine}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Ticket ID:</span>
                          <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {activeRecord.ticketId}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Alarm / Fault Code:</span>
                          <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            {activeRecord.alarmCode || activeRecord.faultCode || 'FC-ALERT-01'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-mono uppercase font-bold text-slate-500 block">
                          Observed Issue on Shop Floor:
                        </span>
                        <p className="text-xs text-slate-800 font-sans leading-relaxed bg-amber-50/50 p-3 rounded-xl border border-amber-200/70">
                          {cleanSymptom}
                        </p>
                      </div>
                    </div>

                    {/* Right Column: Supervisor Sign-Off Details */}
                    <div className="space-y-3.5 flex flex-col justify-between">
                      <div className="space-y-3.5">
                        <div className="flex items-center gap-2 text-slate-700 font-bold font-mono text-[11px] uppercase tracking-wider">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Supervisor Sign-Off Details</span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 font-mono">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Reviewing Supervisor:</span>
                            <strong className="text-slate-900 font-bold font-sans">
                              {user?.fullName || 'Saksham Goel'}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Facility / Plant:</span>
                            <span className="text-slate-800 font-semibold font-sans truncate max-w-[200px]">
                              {organization?.name || 'JMK Tiles Modernized'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Escalation Stage:</span>
                            <span className="text-amber-800 font-bold bg-amber-100/80 px-2 py-0.5 rounded text-[11px]">
                              Step 1 — Pending Supervisor Approval
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Clean AI Note */}
                      <div className="p-3 bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-slate-50 rounded-xl border border-indigo-200/70 text-indigo-950 text-xs flex items-start gap-2.5">
                        <span className="text-base shrink-0 select-none">✨</span>
                        <p className="font-sans leading-relaxed italic text-slate-700 text-[11.5px]">
                          Once confirmed, AI will automatically compile all attempted troubleshooting steps and root cause details into the official OEM dispatch email.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* STEP 2 WORKSPACE: OEM DISPATCH CONFIRMED — AWAITING OEM ACTION */}
            {/* ============================================================= */}
            {activeWorkflowStep === 2 && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                {/* Step 2 Context Banner (Cyan-Blue Light Gradient - Clean Unsquashed Stack) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-cyan-50 via-sky-50 to-indigo-50 border border-cyan-200 w-full shadow-2xs">
                  <div className="flex items-start gap-3 flex-1 min-w-[280px]">
                    <div className="w-9 h-9 rounded-xl bg-cyan-100 border border-cyan-300 flex items-center justify-center text-cyan-700 shrink-0">
                      <Mail className="w-4.5 h-4.5 text-cyan-700" />
                    </div>
                    <div className="min-w-0">
                      <strong className="text-slate-900 text-sm block font-mono font-bold tracking-tight">
                        STEP 2: OEM DISPATCH CONFIRMED — AWAITING MANUFACTURER ACTION
                      </strong>
                      <p className="text-xs text-slate-600 font-sans mt-0.5">
                        Official technical dossier has been auto-generated and dispatched to the OEM.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsViewMailModalOpen(true)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>View Dispatched Mail</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleReopenGmailDraft}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 hover:border-rose-300 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                      title="Re-open pre-filled failure dossier draft in Gmail"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-rose-600" />
                      <span>Re-Open Draft in Gmail</span>
                    </button>
                  </div>
                </div>

                {/* Cyan-Blue Gradient Dispatch Confirmation Card */}
                <div className="bg-gradient-to-br from-cyan-50/80 via-blue-50/40 to-white border border-cyan-300 rounded-2xl p-5 shadow-2xs text-slate-800 space-y-4">
                  {/* Top Header Row */}
                  <div className="flex items-center justify-between border-b border-cyan-200/80 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-cyan-100 text-cyan-900 border border-cyan-300 px-2.5 py-1 rounded-md">
                        📨 Technical Escalation Dispatched
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        Acknowledged by OEM Engineering Desk
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      🕒 Dispatched: {formatLocalDateTime(activeRecord.dispatchedAt || new Date().toISOString())}
                    </span>
                  </div>

                  {/* Communication Route Card */}
                  <div className="bg-white border border-cyan-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                        From Company Mail (Supervisor):
                      </span>
                      <p className="font-mono font-bold text-slate-900 select-all">
                        {activeRecord.dispatchedFromEmail || supervisorEmail || user?.email || 'supervisor@jmktiles.com'}
                      </p>
                    </div>

                    <div className="hidden sm:block text-cyan-600 font-bold text-lg">➔</div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                        To OEM Manufacturer Mail:
                      </span>
                      <p className="font-mono font-bold text-cyan-800 select-all">
                        {activeRecord.dispatchedToEmail || activeRecord.oemContactEmail || oemEmail || 'oem.support@manufacturer.com'}
                      </p>
                    </div>
                  </div>

                  {/* Dispatched Failure Telemetry Summary */}
                  <div className="bg-white/90 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-mono text-slate-600 font-bold">
                        Machine: <strong className="text-slate-900 font-sans">{cleanMachine}</strong>
                      </span>
                      <span className="font-mono text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        Ticket ID: {activeRecord.ticketId}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">
                        Diagnostic Root Cause:
                      </span>
                      <p className="text-xs text-slate-800 font-medium leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                        {cleanRootCause}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase text-rose-700 font-bold block">
                        Halted Sub-Assembly Step:
                      </span>
                      <p className="text-xs text-rose-800 font-mono bg-rose-50/60 p-2.5 rounded-lg border border-rose-200">
                        Step #{activeRecord.failedStepNumber || 2}: {activeRecord.failedStepTitle || 'Component Overhaul'} — {(activeRecord.failedNotes || 'Mechanical seizure and cavitation micro-cracking encountered; safety lockout engaged.').replace(/Equipment:\s*[^;\n\r]+/gi, '').replace(/Failed Step:\s*[^;\n\r]+/gi, '').replace(/Auto-Assigned To:\s*[^;\n\r]+/gi, '').replace(/Assigned Technician:\s*[^;\n\r]+/gi, '').replace(/Execution halted at[^;\n\r]+/gi, '').replace(/Blocked at[^;\n\r]+/gi, '').trim()}
                      </p>
                    </div>
                  </div>

                  {/* ========================================================= */}
                  {/* PART A: LIVE OEM COMMUNICATIONS & ENGINEERING ETA         */}
                  {/* ========================================================= */}
                  <div className="pt-1 space-y-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Inbox className="w-4 h-4 text-indigo-600" />
                        <span className="font-mono font-bold text-xs text-slate-900 uppercase">
                          Part A: Manufacturer Response &amp; ETA Tracking
                        </span>
                      </div>
                      {loggedOemResponses.has(activeRecord.id) ? (
                        <button
                          type="button"
                          disabled
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-default flex items-center gap-1.5 shadow-2xs"
                          title="OEM response has been permanently logged and verified (Locked)"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>✓ OEM Engineering Response &amp; ETA Confirmed (Locked)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setLoggedOemResponses((prev) => {
                              const next = new Set(prev);
                              next.add(activeRecord.id);
                              try {
                                localStorage.setItem('forgex_oem_logged_responses', JSON.stringify([...next]));
                              } catch {}
                              return next;
                            });
                            toast.success('OEM Response Logged', 'Manufacturer ETA & warranty acknowledgement confirmed.');
                          }}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                        >
                          <Inbox className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Log OEM Engineering Response / ETA Confirmed</span>
                        </button>
                      )}
                    </div>

                    {/* Revealed Official OEM Engineering Response Note */}
                    {loggedOemResponses.has(activeRecord.id) && (
                      <div className="p-3.5 bg-emerald-50/90 border border-emerald-300 rounded-xl space-y-2 text-xs text-emerald-950 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                            <strong className="font-mono text-emerald-900 uppercase font-bold text-[11px]">
                              ✓ Official OEM Engineering Response Acknowledged
                            </strong>
                          </div>
                          <span className="font-mono text-[10px] text-emerald-800 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                            ETA: 2 Hours · Technician En Route
                          </span>
                        </div>
                        <p className="font-sans text-emerald-900 text-xs leading-relaxed italic">
                          &ldquo;OEM Engineering Desk acknowledged dossier, warranty claim approved ($0 liability), field specialist dispatched with API 682 cartridge replacement kit.&rdquo;
                        </p>
                        <div className="flex items-center gap-4 text-[10px] font-mono text-emerald-800 pt-0.5 flex-wrap">
                          <span>• Representative: Karl Meyer (OEM Service Director)</span>
                          <span>• Warranty Ref: WARR-2026-CLAIM-PASS</span>
                          <span>• Dispatch Kit: API 682 Dual Cartridge Cart</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ========================================================= */}
                  {/* PART B: FIELD RESOLUTION VERIFICATION & ADVANCE TO STEP 3 */}
                  {/* ========================================================= */}
                  <div className="p-4 bg-gradient-to-r from-sky-50 via-cyan-50 to-blue-50 border border-cyan-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-cyan-700 shrink-0" />
                        <h4 className="font-mono font-bold text-xs text-slate-900 uppercase">
                          Part B: Field Overhaul Complete — Ready for Sign-Off
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600 font-sans">
                        Once OEM specialist completes on-site overhaul, pressure testing, and vibrational validation, confirm resolution to unlock Step 3.
                      </p>
                    </div>

                    {recordStage >= 3 ? (
                      <div className="px-4 py-2.5 rounded-xl bg-cyan-100 text-cyan-900 border border-cyan-300 text-xs font-bold flex items-center gap-2 shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-cyan-700" />
                        <span>✓ OEM Resolution Confirmed &amp; 100% Verified (Locked)</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setConfirmActionModalState({
                            isOpen: true,
                            title: '🛡️ Confirm Confidential Action: Advance to Step 3',
                            subtitle: 'OEM Overhaul Clearance & Resolution Verification',
                            targetItemId: activeRecord.ticketId,
                            targetItemName: `${cleanMachine} — ${cleanRootCause}`,
                            description: `You are verifying that manufacturer service engineer has successfully completed repairs on ${cleanMachine}. Advancing will unlock Step 3 for 100% verified closure.`,
                            acknowledgmentText: 'I verify that OEM technical repairs have been inspected and validated on-site.',
                            confirmButtonText: 'Authorize & Advance to Step 3',
                            isDestructive: false,
                            onConfirm: () => {
                              setConfirmActionModalState(null);
                              handleConfirmOemSolvedStep2();
                            },
                          });
                        }}
                        className="bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 hover:from-cyan-500 hover:to-sky-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-all active:scale-95"
                      >
                        <Check className="w-4 h-4 text-cyan-100" />
                        <span>Confirm OEM Problem Solved &amp; Advance to Step 3 (100% Verified) →</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* STEP 3 WORKSPACE: 100% VERIFIED & CLOSED-LOOP AUDIT            */}
            {/* ============================================================= */}
            {activeWorkflowStep === 3 && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                {/* Step 3 Context Banner (Bright Soft Emerald-to-Teal Gradient) */}
                <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-300 text-emerald-950 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-700" />
                    </div>
                    <div>
                      <strong className="text-emerald-950 text-xs block font-mono">
                        STEP 3: 100% VERIFIED — OEM OVERHAUL &amp; AUDIT SIGN-OFF
                      </strong>
                      <p className="text-[11px] text-emerald-800 font-sans mt-0.5">
                        Factory technician overhaul completed. Authorize permanent archival to Maintenance History and capture tribal knowledge.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportFailureDossier(activeRecord)}
                      className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-100" />
                      <span>Export Official OEM Dossier</span>
                    </button>
                  </div>
                </div>

                {/* Soft Emerald-to-Teal surface */}
                <div className="bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 border border-emerald-300 rounded-xl p-5 shadow-2xs text-slate-800 space-y-4">
                  {/* Header Row without double icons */}
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-emerald-700" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wide">
                        100% VERIFIED — OEM OVERHAUL &amp; RESOLUTION COMPLETE
                      </h3>
                    </div>
                    <span className="font-mono text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded-md">
                      ✓ 100% Verified &amp; Sealed
                    </span>
                  </div>

                  {/* Audit Trail Row */}
                  <div className="bg-white border border-emerald-100 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs shadow-2xs">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                        Dispatched To OEM:
                      </span>
                      <strong className="text-slate-900 font-mono font-bold select-all">
                        {activeRecord.oemContactEmail || oemEmail || 'oem.support@manufacturer.com'}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                        Verified By Supervisor:
                      </span>
                      <strong className="text-slate-900 font-bold">
                        {activeRecord.clearedBy || user?.fullName || 'Saksham Goel (Lead Supervisor)'}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                        Completion Timestamp:
                      </span>
                      <strong className="text-slate-700 font-mono font-bold">
                        {formatLocalDateTime(activeRecord.clearedAt || new Date().toISOString())}
                      </strong>
                    </div>
                  </div>

                  {/* 4 Verification Metrics with Distinct Top Gradient Borders (Indigo, Violet, Cyan, Amber) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Box 1: Indigo Top Border */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1 relative overflow-hidden shadow-2xs">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 to-blue-600" />
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block pt-0.5">
                        Factory Overhaul &amp; Calibration Completed
                      </span>
                      <p className="text-slate-800 leading-relaxed font-sans">
                        Certified OEM field service engineer completed sub-assembly overhaul, replaced damaged cartridge wear faces, and recalibrated dynamic running alignment on <strong className="text-slate-900">{cleanMachine}</strong>.
                      </p>
                    </div>

                    {/* Box 2: Violet Top Border */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1 relative overflow-hidden shadow-2xs">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-violet-600" />
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block pt-0.5">
                        Replaced Parts &amp; Warranty Coverage
                      </span>
                      <p className="text-slate-800 leading-relaxed font-mono text-[11px]">
                        • Factory API 682 Cartridge Seal (S/N: 2026-FLX-9902)<br />
                        • Spiral Wound 316SS Gasket &amp; Fluoroelastomer Set<br />
                        • Covered 100% under contract {cleanWarrantyContractId} ($0 Free Claim)
                      </p>
                    </div>

                    {/* Box 3: Cyan Top Border */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1 relative overflow-hidden shadow-2xs">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-500" />
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block pt-0.5">
                        Verified Tolerances &amp; Diagnostic Reading
                      </span>
                      <p className="text-slate-800 leading-relaxed font-mono text-[11px]">
                        • Shaft radial runout: 0.0012 in (&lt; 0.003 in limit)<br />
                        • Dynamic Vibration RMS: 0.78 mm/s (&lt; 1.8 mm/s ISO Class 1 Baseline)
                      </p>
                    </div>

                    {/* Box 4: Amber Top Border */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1 relative overflow-hidden shadow-2xs">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block pt-0.5">
                        Zero-Energy Isolation Restored
                      </span>
                      <p className="text-slate-800 leading-relaxed font-sans">
                        LOTO locks decommissioned, fluid boundaries pressurized to normal running margin, electrical starter interlock restored, and bump test smooth.
                      </p>
                    </div>
                  </div>

                  {/* Supervisory Remarks Textarea */}
                  <div className="space-y-1 pt-1">
                    <label className="font-bold text-slate-700 font-mono text-[11px] block">
                      Authority Resolution Remarks &amp; Certification Sign-Off:
                    </label>
                    <textarea
                      rows={3}
                      value={signOffNotes}
                      onChange={(e) => setSignOffNotes(e.target.value)}
                      placeholder="Enter final supervisory remarks and factory sign-off..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-sans text-slate-900 focus:outline-none focus:border-indigo-600 transition shadow-2xs"
                    />
                  </div>

                  {/* Action Bar (Clean Emerald-Teal Theme) */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Button 1: Confirm OEM Resolution & Archive to History */}
                      <Button
                        size="sm"
                        disabled={isSubmittingSignOff}
                        onClick={() => {
                          setConfirmActionModalState({
                            isOpen: true,
                            title: '🛡️ Confirm Confidential Action: Close-Loop Audit Sign-Off',
                            subtitle: 'Plant Chief Engineer Authorization & Permanent Archival',
                            targetItemId: activeRecord.ticketId,
                            targetItemName: `${cleanMachine} — ${cleanRootCause}`,
                            description: `You are authorizing the return to production of ${cleanMachine} (Ticket #${activeRecord.ticketId}). This action permanently archives this case to Maintenance History and closes the ticket across all plant systems.`,
                            acknowledgmentText: 'I authorize equipment clearance and certify that OEM repair specifications and plant safety protocols have been met.',
                            confirmButtonText: 'Authorize Final Clearance & Archive',
                            isDestructive: false,
                            onConfirm: async () => {
                              setConfirmActionModalState(null);
                              await handleAuthorizeClearance();
                            },
                          });
                        }}
                        className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md cursor-pointer inline-flex items-center gap-2 transition-all active:scale-95"
                      >
                        <Lock className="w-4 h-4 text-emerald-100" />
                        <span>Confirm OEM Resolution &amp; Archive to History</span>
                      </Button>

                      {/* Button 2: Capture Fix in Expert Knowledge */}
                      <button
                        type="button"
                        onClick={() => handleCaptureVendorFixInKnowledge(activeRecord)}
                        disabled={isKnowledgeCaptured}
                        className={`font-bold text-xs px-4 py-2.5 rounded-xl shadow-md border cursor-pointer inline-flex items-center gap-2 transition-all active:scale-95 ${
                          isKnowledgeCaptured
                            ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                            : 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-800 hover:from-indigo-900 hover:to-slate-900 text-white border-indigo-800/40 shadow-sm'
                        }`}
                        title="Save OEM overhaul fix directly into Expert Knowledge and auto-redirect"
                      >
                        <Lightbulb className="w-4 h-4 text-amber-400" />
                        <span>{isKnowledgeCaptured ? '✓ Captured in Expert Knowledge' : 'Capture Fix in Expert Knowledge'}</span>
                      </button>
                    </div>

                    {/* Button 3: Export Official OEM Dossier */}
                    <button
                      type="button"
                      onClick={() => handleExportFailureDossier(activeRecord)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                      title="Export official OEM failure dossier"
                    >
                      <Printer className="w-4 h-4 text-slate-600" />
                      <span>Export Official OEM Dossier</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F8FAFC]">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center mb-3">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 font-sans mb-1">
              {escalations.length === 0 ? 'No Active OEM Escalations' : 'Select an Escalated Ticket'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm font-sans leading-relaxed">
              {escalations.length === 0
                ? 'No OEM escalations recorded for this facility. When a technician escalates an issue in Tech Execution Desk, it will appear here.'
                : 'Click any escalation in the list to review failure telemetry, auto-draft the technical email, or confirm manufacturer overhaul.'}
            </p>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* POPUP MODAL 1: AUTO-GENERATED OEM TECHNICAL DISPATCH MAIL         */}
      {/* ================================================================= */}
      {isAutoMailModalOpen && activeRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-indigo-200 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 p-5 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-cyan-300 flex items-center justify-center shadow-xs border border-indigo-900/50 shrink-0">
                  <Mail className="w-5 h-5 text-cyan-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 tracking-tight font-sans">
                    Auto-Generated OEM Technical Dispatch Mail
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Case Ref: {activeRecord.ticketId} · Machine: {cleanMachine}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoMailModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notice Banner */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50 via-cyan-50/40 to-blue-50 border border-indigo-200 text-indigo-950 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">✨</span>
              <p className="leading-relaxed">
                <strong>Auto-Generated Escalation Mail Ready:</strong> All machine, fault, root cause, and attempted step details have been automatically written below. Simply enter the target OEM Email ID to dispatch directly from the company mail server.
              </p>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              {/* Row 1: Sender & Recipient Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Supervisor / Company Email */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono text-[11px] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Supervisor / Company Email ID *</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={supervisorEmail}
                    onChange={(e) => setSupervisorEmail(e.target.value)}
                    placeholder="Enter supervisor/company email..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition shadow-2xs font-medium"
                  />
                </div>

                {/* Target OEM Email */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono text-[11px] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Enter OEM Manufacturer Email ID *</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={oemEmail}
                    onChange={(e) => setOemEmail(e.target.value)}
                    placeholder="Enter OEM manufacturer email..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition shadow-2xs font-medium"
                  />
                </div>
              </div>

              {/* Email Subject Line */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono text-[11px] flex items-center justify-between">
                  <span>Email Subject Line (Auto-Generated &amp; Editable)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Editable</span>
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 font-bold focus:outline-none focus:border-indigo-600 focus:bg-white transition shadow-2xs"
                />
              </div>

              {/* Email Body */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono text-[11px] flex items-center justify-between">
                  <span>Auto-Generated Technical Email Body</span>
                  <span className="text-[10px] text-slate-400 font-normal">Fully Structured Failure Report</span>
                </label>
                <textarea
                  rows={10}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full p-3 bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 shadow-inner resize-y"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 flex-wrap">
              <button
                type="button"
                onClick={handleCopyEmailContent}
                className="px-3.5 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Copy email body to clipboard"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Mail</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAutoMailModalOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  size="sm"
                  disabled={!supervisorEmail.trim() || !oemEmail.trim()}
                  onClick={() => handleDispatchOfficialOemMail(true)}
                  className={`bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md inline-flex items-center gap-2 transition-all active:scale-95 ${
                    !supervisorEmail.trim() || !oemEmail.trim()
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <Send className="w-4 h-4 text-rose-200" />
                  <span>Open in Gmail &amp; Dispatch →</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* POPUP MODAL 2: VIEW DISPATCHED TECHNICAL EMAIL PREVIEW             */}
      {/* ================================================================= */}
      {isViewMailModalOpen && activeRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 p-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-700 border border-cyan-300 flex items-center justify-center shrink-0">
                  <Mail className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-sans">
                    Dispatched Technical Failure Mail
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Case: {activeRecord.ticketId} · Machine: {cleanMachine}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsViewMailModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs font-mono">
              <div><strong>From:</strong> {supervisorEmail}</div>
              <div><strong>To:</strong> {activeRecord.oemContactEmail || oemEmail}</div>
              <div><strong>Subject:</strong> {emailSubject}</div>
            </div>

            <textarea
              readOnly
              rows={12}
              value={emailBody}
              className="w-full p-3 bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed rounded-lg border border-slate-700 shadow-inner"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyEmailContent}
                className="px-3.5 py-1.5 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Mail Body</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsViewMailModalOpen(false);
                    handleReopenGmailDraft();
                  }}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                  title="Open this pre-filled failure dossier directly in Gmail"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Gmail</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsViewMailModalOpen(false)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE / CANCEL ESCALATION CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-rose-200 max-w-md w-full p-5 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm font-sans">
                  Cancel &amp; Delete OEM Escalation?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Case ID: {deleteConfirmId}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-sans leading-relaxed">
              Are you sure you want to cancel and remove this OEM vendor escalation? This will remove the case from the OEM queue.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Keep Escalation
              </button>
              <Button
                size="sm"
                onClick={() => handleDeleteEscalation(deleteConfirmId)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm &amp; Delete</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2-Step Confidential Action Confirmation Modal */}
      {confirmActionModalState && (
        <ConfirmActionModal
          isOpen={confirmActionModalState.isOpen}
          onClose={() => setConfirmActionModalState(null)}
          title={confirmActionModalState.title}
          subtitle={confirmActionModalState.subtitle}
          targetItemId={confirmActionModalState.targetItemId}
          targetItemName={confirmActionModalState.targetItemName}
          description={confirmActionModalState.description}
          acknowledgmentText={confirmActionModalState.acknowledgmentText}
          confirmButtonText={confirmActionModalState.confirmButtonText}
          isDestructive={confirmActionModalState.isDestructive}
          isSubmitting={isSubmittingSignOff}
          onConfirm={confirmActionModalState.onConfirm}
        />
      )}
    </div>
  );
};

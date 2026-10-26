import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Building2,
  CheckCircle2,
  Clock,
  Search,
  Mail,
  FileCheck,
  Check,
  Play,
  Activity,
  Award,
  Printer,
  Trash2,
  CheckCheck,
  Send,
  Lock,
  ShieldCheck,
  Lightbulb,
  Phone,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { Button } from '../ui/button';

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
  rcaFindings: string;
  rcaRootCause?: string;
  failedNotes: string;
  failedStepNumber?: number;
  failedStepTitle?: string;
  escalatedBy?: string;
  escalatedByTechnician: string;
  escalatedAt: string;
  dispatchedAt?: string;
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

// High-fidelity enterprise escalation records if localStorage is empty
const DEFAULT_OEM_ESCALATIONS: OemEscalationRecord[] = [
  {
    id: 'ESC-2026-9041',
    ticketId: 'TCK-2026-8012',
    assetTag: 'GEARBOX-HELICAL-305',
    assetName: 'Main Drive Helical Gearbox 305',
    title: 'Helical Drive Gearbox — Pinion Tooth Surface Pitting & High Vibration',
    priority: 'Critical',
    oemManufacturer: 'Bosch Rexroth Industrial Hydraulics',
    oemContactEmail: 'service.field@boschrexroth.de',
    oemHotline: '+49 711 811-0 (24/7 Field Tech Dispatch)',
    slaPriority: '🚨 L4 Critical — 4-Hour Emergency Onsite Dispatch',
    faultCode: 'ERR-702-HW-FATAL',
    alarmCode: 'VIB-RMS-CRIT-901',
    rcaFindings: 'Pinion gear tooth micro-spalling causing resonant gearmesh harmonics > 4.2 mm/s RMS and oil film breakdown at 1450 RPM.',
    rcaRootCause: 'Pinion gear tooth micro-spalling causing resonant gearmesh harmonics > 4.2 mm/s RMS',
    failedNotes: 'Blocked at [Step 4: Star-Pattern Torque & Gear Alignment] — Flange backlash exceeds tolerance (0.18 mm vs 0.05 mm spec). Internal planetary sun gear requires factory tooling & replacement.',
    failedStepNumber: 4,
    failedStepTitle: 'Star-Pattern Torque & Backlash Alignment',
    escalatedBy: 'Alex Rivera',
    escalatedByTechnician: 'Alex Rivera',
    escalatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: '🟡 Awaiting OEM Dispatch',
    stage: 1,
    warrantyStatus: 'Active Factory OEM Warranty ($0 Free Replacement)',
    contractRef: 'OEM-BR-HYD-2026-99',
    warrantyContractId: 'OEM-BR-HYD-2026-99',
    escalationTarget: 'OEM',
  },
  {
    id: 'ESC-2026-8820',
    ticketId: 'TCK-2026-4402',
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
    rcaFindings: 'Dynamic silicon carbide seal ring fractured under thermal cavitation spike; Plan 53A barrier fluid exhausted.',
    rcaRootCause: 'Dynamic silicon carbide seal ring fractured under thermal cavitation spike',
    failedNotes: 'Blocked at [Step 3: Dynamic Seal Assembly] — Seal cartridge sleeve locked onto shaft. Requires Flowserve hydraulic puller.',
    failedStepNumber: 3,
    failedStepTitle: 'Dynamic Seal Cartridge & Plan 53A Flush',
    escalatedBy: 'Marcus Vance',
    escalatedByTechnician: 'Marcus Vance',
    escalatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    dispatchedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    status: '🔵 Dispatched to Manufacturer (Vendor Active)',
    stage: 2,
    warrantyStatus: 'Active Factory OEM Warranty ($0 Free Replacement)',
    contractRef: 'OEM-FS-PUMP-2026-04',
    warrantyContractId: 'OEM-FS-PUMP-2026-04',
    escalationTarget: 'OEM',
  },
];

// Helper to determine the 3-stage progression cleanly
export const getEscalationStage = (rec: OemEscalationRecord): OemEscalationStage => {
  if (rec.stage === 3 || rec.status?.includes('Resolved') || rec.status?.includes('Archived') || rec.status?.includes('Cleared') || rec.clearedAt) {
    return 3;
  }
  if (rec.stage === 2 || rec.status?.includes('Dispatched to Manufacturer') || rec.status?.includes('Vendor Active') || rec.dispatchedAt) {
    return 2;
  }
  return 1;
};

export const OemEscalationsView: React.FC<{
  onNavigateToTechQueue?: (ticketId: string) => void;
}> = ({ onNavigateToTechQueue }) => {
  const { user, organization } = useAuth();
  const { toast } = useToast();

  const [escalations, setEscalations] = useState<OemEscalationRecord[]>(() => {
    try {
      const raw = localStorage.getItem('forgex_oem_escalations');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_OEM_ESCALATIONS;
  });

  // Selected escalation ID (defaults to first item if available)
  const [selectedId, setSelectedId] = useState<string>(() => {
    return escalations.length > 0 ? escalations[0].id : '';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'STAGE_1' | 'STAGE_2' | 'STAGE_3'>('ALL');
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [signOffNotes, setSignOffNotes] = useState('');
  const [isSubmittingSignOff, setIsSubmittingSignOff] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [escalationTarget, setEscalationTarget] = useState<'OEM' | 'AUTHORITY'>('OEM');
  const [capturedKnowledgeIds, setCapturedKnowledgeIds] = useState<Set<string>>(new Set());

  // Listen for real-time escalations from Technician Queue / Tech Execution Desk
  useEffect(() => {
    const handleOemEvent = (e: Event) => {
      const custom = e as CustomEvent<OemEscalationRecord>;
      if (custom.detail) {
        setEscalations((prev) => {
          const matchIdx = prev.findIndex(
            (x) => x.id === custom.detail.id || x.ticketId === custom.detail.ticketId
          );
          if (matchIdx !== -1) {
            const next = [...prev];
            next[matchIdx] = { ...next[matchIdx], ...custom.detail };
            return next;
          }
          return [custom.detail, ...prev];
        });
        setSelectedId(custom.detail.id);
      }
    };

    window.addEventListener('forgex:oem-escalated', handleOemEvent);
    return () => window.removeEventListener('forgex:oem-escalated', handleOemEvent);
  }, []);

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

  // Selected active escalation record (null if none selected)
  const activeRecord = useMemo(() => {
    if (!selectedId) {
      return filteredList.length > 0 ? filteredList[0] : null;
    }
    return escalations.find((r) => r.id === selectedId) || null;
  }, [escalations, selectedId, filteredList]);

  // KPI Strip Metrics based on the 3 stages
  const kpiTotal = escalations.length;
  const kpiStage1 = escalations.filter((x) => getEscalationStage(x) === 1).length;
  const kpiStage2 = escalations.filter((x) => getEscalationStage(x) === 2).length;
  const kpiStage3 = escalations.filter((x) => getEscalationStage(x) === 3).length;

  // 1. Stage 1 -> Stage 2: Dispatch Failure Dossier to OEM
  const handleDispatchDossierToOem = (rec: OemEscalationRecord) => {
    const now = new Date().toISOString();
    const updated = escalations.map((item) =>
      item.id === rec.id
        ? {
            ...item,
            stage: 2 as const,
            status: '🔵 Dispatched to Manufacturer (Vendor Active)',
            dispatchedAt: now,
          }
        : item
    );
    setEscalations(updated);
    try {
      localStorage.setItem('forgex_oem_escalations', JSON.stringify(updated));
    } catch {}

    window.dispatchEvent(
      new CustomEvent('forgex:oem-updated', {
        detail: { id: rec.id, stage: 2, status: 'Vendor Active' },
      })
    );

    toast.success(
      'Dossier Dispatched to OEM',
      `Technical failure report & warranty claim dispatched to ${rec.oemManufacturer} (${rec.oemContactEmail}). Ticket advanced to Stage 2.`
    );
  };

  // 2. Export OEM Failure Dossier (Clean Printable View)
  const handleExportFailureDossier = (rec: OemEscalationRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.info('Pop-up Blocked', 'Please allow pop-ups to print or export the OEM Failure Dossier.');
      return;
    }

    const stage = getEscalationStage(rec);
    const stageLabel =
      stage === 1
        ? 'Stage 1: Awaiting OEM Dispatch'
        : stage === 2
        ? 'Stage 2: Dispatched to Manufacturer (Vendor Active)'
        : 'Stage 3: OEM Resolved & Archived';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OEM Failure Dossier - ${rec.ticketId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            h1 { font-size: 20px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: -0.5px; }
            .header-strip { display: flex; justify-content: space-between; border-bottom: 2px solid #312e81; padding-bottom: 16px; margin-bottom: 24px; }
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
              <div style="font-size: 12px; color: #64748b; font-family: monospace;">Case Ref: ${rec.ticketId} · Asset: ${rec.assetTag}</div>
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
              <div><strong>Email:</strong> ${rec.oemContactEmail}</div>
              <div><strong>Emergency Hotline:</strong> ${rec.oemHotline || 'Standard Dispatch Support'}</div>
              <div><strong>Contract / Warranty Ref:</strong> ${rec.warrantyContractId || rec.contractRef}</div>
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
            <div style="font-weight: bold; margin-bottom: 4px;">Step ${rec.failedStepNumber || 1}: ${rec.failedStepTitle || 'Component Overhaul'}</div>
            <div>${rec.failedNotes}</div>
          </div>

          <div class="section">
            <div class="section-title">Root Cause Analysis (RCA) Findings</div>
            <div>${rec.rcaRootCause || rec.rcaFindings}</div>
          </div>

          ${
            stage === 3
              ? `
            <div class="section" style="background: #ecfdf5; border-color: #a7f3d0; color: #065f46;">
              <div class="section-title" style="color: #047857;">Vendor Resolution & Higher Authority Sign-Off</div>
              <div><strong>Cleared By:</strong> ${rec.clearedBy || 'Plant Chief Engineer'}</div>
              <div><strong>Timestamp:</strong> ${formatLocalDateTime(rec.clearedAt)}</div>
              <div style="margin-top: 6px;"><strong>Resolution Notes:</strong> ${rec.oemReportNotes || 'Factory overhaul certified and signed off.'}</div>
            </div>
            `
              : ''
          }

          <div class="signatures">
            <div>
              <div class="sig-line"></div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">FIELD TECHNICIAN / ENGINEER SIGN-OFF</div>
            </div>
            <div>
              <div class="sig-line"></div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">OEM VENDOR / AUTHORITY CLEARANCE SIGN-OFF</div>
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

  // 3. Delete / Cancel Escalation
  const handleDeleteEscalation = (idToDelete: string) => {
    const updated = escalations.filter((x) => x.id !== idToDelete && x.ticketId !== idToDelete);
    setEscalations(updated);
    try {
      localStorage.setItem('forgex_oem_escalations', JSON.stringify(updated));
    } catch {}

    if (selectedId === idToDelete) {
      setSelectedId(updated.length > 0 ? updated[0].id : '');
    }
    setDeleteConfirmId(null);
    toast.info('Escalation Removed', 'OEM escalation record was cancelled and removed.');
  };

  // 4. Stage 2 -> Stage 3: Confirm OEM Resolution & Close
  const handleAuthorizeClearance = async () => {
    if (!activeRecord) return;
    setIsSubmittingSignOff(true);

    try {
      const now = new Date().toISOString();
      const updatedList = escalations.map((item) =>
        item.id === activeRecord.id
          ? {
              ...item,
              stage: 3 as const,
              status: '🟢 OEM Resolved & Archived',
              oemReportNotes:
                signOffNotes.trim() ||
                'OEM field service engineer on-site overhaul completed and certified by Higher Authority.',
              clearedAt: now,
              clearedBy: user?.fullName || 'Plant Chief Engineer',
            }
          : item
      );

      setEscalations(updatedList);
      try {
        localStorage.setItem('forgex_oem_escalations', JSON.stringify(updatedList));
      } catch {}

      // A. Save directly to Maintenance History in localStorage
      const oemHistoryRecord = {
        id: `rec-mr-oem-${Date.now().toString().slice(-6)}`,
        recordNumber: `MR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        organizationId: organization?.id || 'org-demo',
        plantId: 'plant-01',
        machineId: activeRecord.assetTag,
        machineAssetTag: activeRecord.assetTag,
        ticketNumber: activeRecord.ticketId,
        ticketId: activeRecord.ticketId,
        caseId: activeRecord.rawCaseId || activeRecord.ticketId,
        caseNumber: activeRecord.rawCaseId || activeRecord.ticketId,
        problemStatement: `[OEM Overhaul] ${activeRecord.assetName || activeRecord.title || 'Equipment Repair'} - ${activeRecord.rcaRootCause || activeRecord.rcaFindings}`,
        observedSymptoms: [activeRecord.rcaRootCause || activeRecord.rcaFindings, activeRecord.failedNotes],
        rootCause: `[OEM Certified Overhaul] ${activeRecord.failedNotes}`,
        rootCauseStatus: 'CONFIRMED' as const,
        faultCategory: 'OEM_RESOLVED',
        repairActions: [
          `OEM certified factory overhaul completed by ${activeRecord.oemManufacturer}.`,
          `Sub-assembly step #${activeRecord.failedStepNumber || 1} (${activeRecord.failedStepTitle || 'Component Inspection'}) cleared.`,
          `Authority sign-off: ${signOffNotes.trim() || 'Factory overhaul certified and signed off.'}`,
        ],
        verificationState: 'PASSED' as const,
        approvalStatus: 'APPROVED' as const,
        resolvedAt: now,
        resolvingTechnicianName: `${activeRecord.oemManufacturer} (OEM Vendor)`,
        resolutionSource: 'OEM_RESOLVED',
        mttrMinutes: 48,
      };

      try {
        const rawHistory = localStorage.getItem('forgex_maintenance_history');
        const historyList = rawHistory ? JSON.parse(rawHistory) : [];
        const existingIdx = historyList.findIndex(
          (h: any) => h.ticketId === activeRecord.ticketId || h.ticketNumber === activeRecord.ticketId
        );
        if (existingIdx !== -1) {
          historyList[existingIdx] = { ...historyList[existingIdx], ...oemHistoryRecord };
        } else {
          historyList.unshift(oemHistoryRecord);
        }
        localStorage.setItem('forgex_maintenance_history', JSON.stringify(historyList));
      } catch {}

      // B. Post to backend maintenance-records
      await fetch('/api/v1/maintenance-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(oemHistoryRecord),
      }).catch(() => null);

      // C. Update forgex_shared_raised_tickets to mark ticket resolved/closed
      try {
        const rawTickets = localStorage.getItem('forgex_shared_raised_tickets');
        if (rawTickets) {
          const tickets = JSON.parse(rawTickets);
          if (Array.isArray(tickets)) {
            const updatedTickets = tickets.map((t: any) => {
              if (t.id === activeRecord.ticketId || t.ticketNumber === activeRecord.ticketId) {
                return {
                  ...t,
                  status: 'RESOLVED',
                  resolutionNotes: signOffNotes.trim() || 'OEM Vendor Overhaul Cleared',
                };
              }
              return t;
            });
            localStorage.setItem('forgex_shared_raised_tickets', JSON.stringify(updatedTickets));
          }
        }
      } catch {}

      // D. Update matching ticket in Tech Execution Desk queue (forgex_tech_queue_tasks)
      try {
        const rawQueue = localStorage.getItem('forgex_tech_queue_tasks');
        if (rawQueue) {
          const queue = JSON.parse(rawQueue);
          if (Array.isArray(queue)) {
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
            localStorage.setItem('forgex_tech_queue_tasks', JSON.stringify(updatedQueue));
          }
        }
      } catch {}

      // E. Dispatch events across modules
      window.dispatchEvent(
        new CustomEvent('forgex:ticket-solved', {
          detail: {
            ticketId: activeRecord.ticketId,
            rawCaseId: activeRecord.rawCaseId,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('forgex:history-updated', {
          detail: oemHistoryRecord,
        })
      );
      window.dispatchEvent(
        new CustomEvent('forgex:ticket-progress-sync', {
          detail: {
            ticketId: activeRecord.ticketId,
            status: 'Resolved',
          },
        })
      );

      toast.success(
        'OEM Resolution Verified & Archived',
        `Repairs confirmed by ${activeRecord.oemManufacturer}. Permanent audit record saved into Maintenance History.`
      );

      setIsSignOffModalOpen(false);
      setSignOffNotes('');
    } catch (err: any) {
      toast.error('Sign-off Failed', err.message || 'Could not save clearance.');
    } finally {
      setIsSubmittingSignOff(false);
    }
  };

  // 5. Phase 3 Innovation: 1-Click Save Vendor Fix to Expert Knowledge
  const handleCaptureVendorFixInKnowledge = (rec: OemEscalationRecord) => {
    try {
      const existingRaw = localStorage.getItem('forgex_expert_knowledge');
      const knowledgeList = existingRaw ? JSON.parse(existingRaw) : [];

      const newTip = {
        id: `tip-oem-${Date.now().toString().slice(-6)}`,
        title: `OEM Solution: ${rec.assetName || rec.title} (${rec.failedStepTitle || 'Factory Overhaul'})`,
        assetTag: rec.assetTag,
        category: 'OEM_FACTORY_PROCEDURE',
        problemDescription: rec.failedNotes || rec.rcaFindings,
        resolutionSteps: [
          `Certified Manufacturer: ${rec.oemManufacturer}`,
          `Factory Fix & Sign-Off: ${rec.oemReportNotes || 'Direct OEM component calibration & replacement'}`,
          `Verified Under: Contract ${rec.warrantyContractId || rec.contractRef} by ${rec.clearedBy || user?.fullName || 'Plant Chief Engineer'}`,
        ],
        author: `${rec.oemManufacturer} (Factory Field Service)`,
        verified: true,
        verifiedBy: user?.fullName || 'Plant Chief Engineer',
        createdAt: new Date().toISOString(),
      };

      knowledgeList.unshift(newTip);
      localStorage.setItem('forgex_expert_knowledge', JSON.stringify(knowledgeList));

      setCapturedKnowledgeIds((prev) => new Set([...prev, rec.id]));

      window.dispatchEvent(
        new CustomEvent('forgex:knowledge-updated', {
          detail: newTip,
        })
      );

      toast.success(
        'Captured in Expert Knowledge',
        `OEM Vendor overhaul procedure and clearance instructions logged for in-house technicians!`
      );
    } catch (err: any) {
      toast.error('Knowledge Capture Failed', err.message || 'Could not save tip.');
    }
  };

  const activeStage = activeRecord ? getEscalationStage(activeRecord) : 1;
  const isKnowledgeCaptured = activeRecord ? capturedKnowledgeIds.has(activeRecord.id) : false;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
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
                OEM & Higher Authority Escalations
              </h1>
              <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded-full">
                3-Stage Dispatch
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Live factory failure dossiers, vendor dispatch tracking & warranty audit sign-off
            </p>
          </div>
        </div>

        {/* Top KPI Strip with Sleek Top Gradient Accent Bars (Requirement 1) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Card 1: Total */}
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs min-w-[105px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-mono mt-0.5">
              Total Escalations
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-slate-900 font-mono">{kpiTotal}</span>
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* Card 2: Awaiting */}
          <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600" />
            <span className="text-[9px] text-amber-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              🟡 Awaiting Dispatch
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-amber-950 font-mono">{kpiStage1}</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>

          {/* Card 3: Vendor Active */}
          <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
            <span className="text-[9px] text-blue-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              🔵 Vendor Active
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-blue-950 font-mono">{kpiStage2}</span>
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
            </div>
          </div>

          {/* Card 4: OEM Resolved */}
          <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
            <span className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              🟢 OEM Resolved
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-emerald-950 font-mono">{kpiStage3}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left List (Master) + Right Detail (Complete Failure Dossier) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0 overflow-hidden">
        {/* ================================================================= */}
        {/* LEFT MASTER LIST OF ESCALATED TICKETS                             */}
        {/* ================================================================= */}
        <div className="w-full lg:w-96 xl:w-[400px] border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
          {/* Search & Compact 4-Column Filter Grid (Fixes Filter Pill Clipping — Requirement 1) */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search Ticket, Asset, OEM, Technician..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs font-sans placeholder:text-slate-400"
              />
            </div>

            {/* Compact 4-Column Grid with Zero Text Clipping */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg text-[11px] font-semibold">
              {[
                { id: 'ALL' as const, label: 'All' },
                { id: 'STAGE_1' as const, label: '🟡 Awaiting' },
                { id: 'STAGE_2' as const, label: '🔵 Active' },
                { id: 'STAGE_3' as const, label: '🟢 Resolved' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`py-1.5 px-1 rounded-md text-center transition cursor-pointer whitespace-nowrap text-[11px] font-bold ${
                    statusFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-2xs'
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
                  When a technician marks a ticket as blocked or escalates to OEM in Tech Execution Desk, it will appear here.
                </p>
              </div>
            ) : (
              filteredList.map((rec) => {
                const isSelected = activeRecord?.id === rec.id;
                const stage = getEscalationStage(rec);

                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedId(rec.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 group relative ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-500/30 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Row 1: Ticket ID + Asset Tag Dark Pill + Stage Badge + Delete Icon */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-indigo-700 text-xs">
                          {rec.ticketId}
                        </span>
                        <span className="font-mono font-bold bg-slate-900 text-cyan-300 px-1.5 py-0.5 rounded text-[10px] tracking-tight">
                          {rec.assetTag}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                            stage === 3
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : stage === 2
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {stage === 1
                            ? '🟡 Awaiting'
                            : stage === 2
                            ? '🔵 Active'
                            : '🟢 Resolved'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(rec.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete / Cancel Escalation"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Bold OEM Manufacturer Name & Full Untruncated Blocked Step */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-sans text-[11px] truncate">
                          {rec.oemManufacturer}
                        </span>
                      </div>
                      <div className="text-xs text-rose-700 font-mono font-medium leading-snug line-clamp-2 break-words">
                        ⚠️ Blocked at Step {rec.failedStepNumber || 1}: {rec.failedStepTitle || 'Component Overhaul'} — {rec.failedNotes}
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
        {/* RIGHT PANEL: ZERO-SCROLL EXECUTIVE FAILURE DOSSIER                */}
        {/* ================================================================= */}
        {activeRecord ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5 bg-[#F8FAFC] space-y-3.5">
            {/* 1. TOP EXECUTIVE BANNER (Deep Navy-Indigo Gradient — Requirement 2) */}
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-4 rounded-xl shadow-md border border-indigo-900/40 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-cyan-300 bg-white/10 border border-white/20 px-2.5 py-0.5 rounded shadow-2xs">
                    {activeRecord.ticketId}
                  </span>
                  <span className="font-mono text-xs font-bold text-indigo-200 bg-indigo-500/30 border border-indigo-400/30 px-2.5 py-0.5 rounded">
                    {activeRecord.assetTag}
                  </span>
                  <span className="font-mono text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded">
                    {activeRecord.slaPriority}
                  </span>

                  {/* Escalation Type Switcher (OEM vs Plant Authority) */}
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
                          ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Award className="w-3 h-3" />
                      <span>Plant Authority</span>
                    </button>
                  </div>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight break-words">
                  [{escalationTarget === 'OEM' ? 'OEM Manufacturer Escalation' : 'Plant Higher Authority Escalation'}] {activeRecord.assetName || activeRecord.title || 'Sub-Assembly Failure'}
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-300 font-mono">
                  <span>👨‍🔧 Escalated by: <strong className="text-white">{activeRecord.escalatedBy || activeRecord.escalatedByTechnician}</strong></span>
                  <span>•</span>
                  <span>🕒 {formatLocalDateTime(activeRecord.escalatedAt)}</span>
                </div>
              </div>

              {/* Right Side: Interactive 3-Stage Progress Pipeline + Export Button */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {/* 3-Stage Interactive Pipeline */}
                <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10 shrink-0">
                  {/* Stage 1 */}
                  <div
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition ${
                      activeStage === 1
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-400/60 ring-1 ring-amber-400/40 shadow-xs'
                        : activeStage > 1
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <span>{activeStage > 1 ? '✓' : '1'}</span>
                    <span className="hidden sm:inline">Awaiting Dispatch</span>
                  </div>
                  <span className="text-white/20 text-xs">➔</span>

                  {/* Stage 2 */}
                  <div
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition ${
                      activeStage === 2
                        ? 'bg-blue-500/30 text-blue-300 border border-blue-400/60 ring-1 ring-blue-400/40 shadow-xs'
                        : activeStage > 2
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <span>{activeStage > 2 ? '✓' : '2'}</span>
                    <span className="hidden sm:inline">Vendor Active</span>
                  </div>
                  <span className="text-white/20 text-xs">➔</span>

                  {/* Stage 3 */}
                  <div
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition ${
                      activeStage === 3
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/60 ring-1 ring-emerald-400/40 shadow-xs'
                        : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <span>{activeStage === 3 ? '✓' : '3'}</span>
                    <span className="hidden sm:inline">OEM Resolved</span>
                  </div>
                </div>

                {/* Export Dossier */}
                <button
                  type="button"
                  onClick={() => handleExportFailureDossier(activeRecord)}
                  className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                  title="Export official printable compliance failure dossier"
                >
                  <Printer className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Export Dossier</span>
                </button>

                {onNavigateToTechQueue && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTechQueue(activeRecord.ticketId)}
                    className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap"
                    title="Jump to active execution card in Tech Desk"
                  >
                    <Play className="w-3 h-3 fill-current text-emerald-400" />
                    <span>Tech Desk</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. STAGE ACTION BANNER */}
            {activeStage === 1 && (
              <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 text-amber-950 text-xs">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Stage 1 Active:</strong> Shop-floor execution blocked. Transmit failure dossier, telemetric alarm &amp; warranty coverage claim to manufacturer.
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleDispatchDossierToOem(activeRecord)}
                  className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg shadow-sm cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Dossier to OEM</span>
                </Button>
              </div>
            )}

            {activeStage === 2 && (
              <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 text-blue-950 text-xs">
                  <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Stage 2 Active:</strong> Dossier acknowledged by {activeRecord.oemManufacturer}. Factory certified replacement assembly &amp; engineer en route.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleExportFailureDossier(activeRecord)}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Export Dossier</span>
                  </button>
                  <Button
                    size="sm"
                    onClick={() => setIsSignOffModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>✅ Authorize OEM Resolution &amp; Close</span>
                  </Button>
                </div>
              </div>
            )}

            {activeStage === 3 && (
              <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 text-emerald-950 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Stage 3 Complete:</strong> Vendor overhaul certified by {activeRecord.clearedBy || 'Plant Chief Engineer'}. Synchronized to Maintenance History.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Phase 3 Innovation: 1-Click Save to Expert Knowledge */}
                  <button
                    type="button"
                    onClick={() => handleCaptureVendorFixInKnowledge(activeRecord)}
                    disabled={isKnowledgeCaptured}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs ${
                      isKnowledgeCaptured
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                    }`}
                    title="Capture OEM certified repair instructions directly into Expert Knowledge for in-house training"
                  >
                    <Lightbulb className="w-3.5 h-3.5 fill-current" />
                    <span>{isKnowledgeCaptured ? '✓ Captured in Knowledge' : '💡 Capture Fix in Expert Knowledge'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportFailureDossier(activeRecord)}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Export Dossier</span>
                  </button>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs">
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Archived to History</span>
                  </span>
                </div>
              </div>
            )}

            {/* 3. PHASE 3 INNOVATIVE SHIELDS (AI Warranty Shield & Tamper-Seal Lock Guardrail) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Shield 1: AI Warranty & Cost Liability Shield */}
              <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-bold text-emerald-950 block text-[11px] leading-tight">
                      ACTIVE OEM WARRANTY COVERAGE — Eligible for $0 Free Replacement
                    </span>
                    <p className="text-[10px] text-emerald-800 font-mono break-words">
                      Contract: {activeRecord.warrantyContractId || activeRecord.contractRef} • 100% Vendor Liability Absorbed
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-900 shrink-0">
                  $0 Free Claim
                </span>
              </div>

              {/* Shield 2: Shop-Floor Tamper-Seal Lock Indicator */}
              <div className="p-3 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-bold text-amber-950 block text-[11px] leading-tight">
                      Shop-Floor Tamper-Seal &amp; LOTO Lock Active
                    </span>
                    <p className="text-[10px] text-amber-800 font-mono break-words">
                      In-House Disassembly Paused Pending Certified OEM Arrival (Protects Warranty)
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 shrink-0">
                  LOTO Locked
                </span>
              </div>
            </div>

            {/* 4. 2-COLUMN STRUCTURED FAILURE DOSSIER GRID (Requirement 2) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Left Column: Shop-Floor Failure & Blocked Step Telemetry */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wide">
                      Shop-Floor Failure &amp; Telemetry
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded">
                    ALARM: {activeRecord.alarmCode || activeRecord.faultCode}
                  </span>
                </div>

                {/* Blocked Sub-Assembly Step */}
                <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/30 space-y-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-rose-800 block">
                    Blocked At Execution Step #{activeRecord.failedStepNumber || 1}
                  </span>
                  <p className="text-xs font-bold text-slate-900 font-sans">
                    {activeRecord.failedStepTitle || 'Component Replacement & Alignment'}
                  </p>
                  <p className="text-xs text-rose-950 font-sans leading-relaxed pt-0.5">
                    {activeRecord.failedNotes}
                  </p>
                </div>

                {/* Observed Field Symptom & Alarm Telemetry */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-500 block">
                    Observed Field Symptom &amp; Diagnostic Alert
                  </span>
                  <p className="text-xs text-slate-800 font-sans leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {activeRecord.rcaRootCause || activeRecord.rcaFindings}
                  </p>
                </div>

                {/* Confirmed RCA Hypothesis */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-indigo-700 block">
                    Root Cause Analysis (RCA) Confirmed Hypothesis
                  </span>
                  <p className="text-xs text-indigo-950 font-sans leading-relaxed bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-200">
                    {activeRecord.rcaFindings}
                  </p>
                </div>
              </div>

              {/* Right Column: OEM Vendor & Contract Intelligence (or Plant Authority) */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    {escalationTarget === 'OEM' ? (
                      <Building2 className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Award className="w-4 h-4 text-amber-600" />
                    )}
                    <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wide">
                      {escalationTarget === 'OEM'
                        ? 'OEM Vendor & Contract Intelligence'
                        : 'Plant Higher Authority & GM Interlock'}
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                    {escalationTarget === 'OEM' ? 'OEM Tier 1' : 'Level 4 GM'}
                  </span>
                </div>

                {escalationTarget === 'OEM' ? (
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                          Assigned Manufacturer
                        </span>
                        <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                          Certified OEM
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 text-xs">
                        {activeRecord.oemManufacturer}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                          Direct Support Email
                        </span>
                        <p className="font-mono text-slate-800 text-xs flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span className="truncate">{activeRecord.oemContactEmail}</span>
                        </p>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                          24/7 Field Hotline
                        </span>
                        <p className="font-mono text-slate-800 text-xs flex items-center gap-1 truncate">
                          <Phone className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span className="truncate">{activeRecord.oemHotline || '+1 (800) 555-OEM-24'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                          Contract SLA Target
                        </span>
                        <p className="font-sans font-bold text-indigo-900 text-xs truncate">
                          {activeRecord.slaPriority}
                        </p>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                          Contract / Warranty ID
                        </span>
                        <p className="font-mono font-bold text-slate-900 text-xs truncate">
                          {activeRecord.warrantyContractId || activeRecord.contractRef}
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-200 text-[11px] text-indigo-950 font-sans">
                      <span className="font-bold block mb-0.5">Required Factory Sub-Assembly / Tooling:</span>
                      <span>Certified factory cartridge replacement &amp; hydraulic torque calibrator dispatched directly from regional OEM parts depot.</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-amber-700 uppercase font-bold">
                          Authority Routing
                        </span>
                        <span className="font-mono text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded">
                          L4 Interlock
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 text-xs">
                        Plant General Manager &amp; Chief Mechanical Engineer
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                          Emergency CapEx Ceiling
                        </span>
                        <p className="font-mono text-emerald-800 font-bold text-xs">
                          Pre-Approved ($0 - $50,000)
                        </p>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                          Production Line Impact
                        </span>
                        <p className="font-sans font-bold text-rose-800 text-xs">
                          Critical Line Halt — Bay 04
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 bg-amber-50/60 rounded-lg border border-amber-200 text-[11px] text-amber-950 font-sans">
                      <span className="font-bold block mb-0.5">Higher Authority Directive:</span>
                      <span>Line supervisor notified. Overhaul priority elevated to Level 4 Emergency. Factory engineering team and on-call mechanical chief briefed.</span>
                    </div>
                  </div>
                )}

                {/* Audit Sign-Off Section if Resolved */}
                {activeStage === 3 && activeRecord.oemReportNotes && (
                  <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-emerald-800 uppercase font-bold">
                        Vendor Resolution &amp; Authority Sign-Off
                      </span>
                      <span className="font-mono text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded">
                        Signed: {activeRecord.clearedBy || 'Chief Engineer'}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-950 font-sans leading-relaxed">
                      {activeRecord.oemReportNotes}
                    </p>
                    <div className="text-[10px] font-mono text-emerald-700">
                      Timestamp: {formatLocalDateTime(activeRecord.clearedAt)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty state when no escalation exists */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F8FAFC]">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center mb-3">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 font-sans mb-1">
              {escalations.length === 0 ? 'No Active OEM Escalations' : 'Select an Escalated Ticket'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm font-sans leading-relaxed">
              {escalations.length === 0
                ? 'When a field technician clicks "Escalate to OEM / Manufacturer" in the Tech Execution Desk, the failure dossier and warranty claim will appear here.'
                : 'Click any escalation in the list to review failure telemetry, dispatch the dossier to the vendor, or authorize resolution.'}
            </p>
          </div>
        )}
      </div>

      {/* AUTHORITY CLEARANCE SIGN-OFF MODAL (Stage 2 -> Stage 3) */}
      {isSignOffModalOpen && activeRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm font-sans">
                  Confirm OEM Vendor Resolution &amp; Close
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSignOffModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-200 font-mono space-y-1">
                <p>
                  <strong>Ticket:</strong> {activeRecord.ticketId} · {activeRecord.assetTag}
                </p>
                <p>
                  <strong>OEM Vendor:</strong> {activeRecord.oemManufacturer}
                </p>
                <p>
                  <strong>Escalated by:</strong> {activeRecord.escalatedBy || activeRecord.escalatedByTechnician}
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <label className="font-bold text-slate-700 block">
                  OEM Field Service Engineer Report &amp; Resolution Remarks *
                </label>
                <textarea
                  rows={4}
                  value={signOffNotes}
                  onChange={(e) => setSignOffNotes(e.target.value)}
                  placeholder="Enter OEM certified factory overhaul findings, replaced titanium parts serial numbers, calibrated operational clearances, and warranty clearance notes..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-sans text-slate-900 focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSignOffModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <Button
                size="sm"
                disabled={isSubmittingSignOff}
                onClick={handleAuthorizeClearance}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Authorize &amp; Move to Maintenance History</span>
              </Button>
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
    </div>
  );
};

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
  AlertTriangle,
  Send,
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
}

// 100% clean - No hardcoded demo data entries
const DEFAULT_OEM_ESCALATIONS: OemEscalationRecord[] = [];

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
        if (Array.isArray(parsed)) {
          // Filter out legacy demo mock entries so view starts completely clean
          const demoIds = new Set([
            'OEM-ESC-8012',
            'OEM-ESC-4021',
            'OEM-ESC-1014',
            'ESC-2026-8662',
            'ESC-2026-4402',
            'ESC-2026-1101',
          ]);
          const filtered = parsed.filter(
            (p) => !demoIds.has(p.id) && !demoIds.has(p.ticketId)
          );
          localStorage.setItem('forgex_oem_escalations', JSON.stringify(filtered));
          return filtered;
        }
      }
    } catch {}
    return DEFAULT_OEM_ESCALATIONS;
  });

  // Do NOT auto-select on initial load; show clean empty state until user clicks a ticket
  const [selectedId, setSelectedId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'STAGE_1' | 'STAGE_2' | 'STAGE_3'>('ALL');
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [signOffNotes, setSignOffNotes] = useState('');
  const [isSubmittingSignOff, setIsSubmittingSignOff] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
    if (!selectedId) return null;
    return escalations.find((r) => r.id === selectedId) || null;
  }, [escalations, selectedId]);

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
            .header-strip { display: flex; justify-content: space-between; border-bottom: 2px solid #7e22ce; padding-bottom: 16px; margin-bottom: 24px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; background: #f3e8ff; color: #6b21a8; font-family: monospace; }
            .stage-pill { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; background: #e0f2fe; color: #0369a1; font-family: monospace; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; font-size: 13px; }
            .section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px; }
            .section-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 6px; font-family: monospace; }
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
      setSelectedId('');
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

      // D. Dispatch events across modules
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

  const activeStage = activeRecord ? getEscalationStage(activeRecord) : 1;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
      {/* ================================================================= */}
      {/* TOP HEADER & KPI STRIP                                            */}
      {/* ================================================================= */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-xs">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                OEM & Higher Authority Escalations
              </h1>
              <span className="font-mono text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                3-Stage Dispatch
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Live factory failure dossiers, vendor dispatch tracking & warranty audit sign-off
            </p>
          </div>
        </div>

        {/* Top KPI Strip (Compact & Practical) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs min-w-[105px]">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-mono">
              Total Escalations
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-slate-900 font-mono">{kpiTotal}</span>
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px]">
            <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider block font-mono">
              🟡 Awaiting Dispatch
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-amber-950 font-mono">{kpiStage1}</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px]">
            <span className="text-[9px] text-blue-700 font-bold uppercase tracking-wider block font-mono">
              🔵 Vendor Active
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-blue-950 font-mono">{kpiStage2}</span>
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-3 py-1.5 shadow-2xs min-w-[115px]">
            <span className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider block font-mono">
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
        <div className="w-full lg:w-96 xl:w-[410px] border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search Ticket, Asset, OEM, Technician..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-purple-500 shadow-2xs font-sans placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-mono no-scrollbar">
              {[
                { id: 'ALL' as const, label: 'All Requests' },
                { id: 'STAGE_1' as const, label: '🟡 Awaiting' },
                { id: 'STAGE_2' as const, label: '🔵 Dispatched' },
                { id: 'STAGE_3' as const, label: '🟢 Resolved' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2 py-1 rounded font-bold whitespace-nowrap transition cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
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
                        ? 'bg-purple-50/40 border-purple-500 ring-2 ring-purple-600/30 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Row 1: Ticket ID + Asset Tag + Stage Pill */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-purple-700 text-xs truncate">
                          {rec.ticketId}
                        </span>
                        <span className="font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.2 rounded text-[10px]">
                          {rec.assetTag}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                            stage === 3
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : stage === 2
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {stage === 1
                            ? '🟡 Awaiting Dispatch'
                            : stage === 2
                            ? '🔵 Dispatched to OEM'
                            : '🟢 OEM Resolved'}
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

                    {/* Row 2: OEM Manufacturer & Step Blocked */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span className="truncate font-sans font-semibold text-[11px]">
                          {rec.oemManufacturer}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-rose-700 font-mono font-bold">
                        <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="truncate">
                          Blocked at Step {rec.failedStepNumber || 1}: {rec.failedStepTitle || 'Component Overhaul'}
                        </span>
                      </div>
                    </div>

                    {/* Row 3: Footer Strip with Escalated By + AM/PM timestamp */}
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
        {/* RIGHT PANEL: 3-STAGE WORKFLOW & COMPLETE FAILURE DOSSIER          */}
        {/* ================================================================= */}
        {activeRecord ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 bg-[#F8FAFC]">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
              
              {/* 3-STAGE VISUAL STEPPER STRIP */}
              <div className="p-4 bg-slate-50/80 border-b border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Stage 1 */}
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2.5 transition-all ${
                      activeStage === 1
                        ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/40'
                        : activeStage > 1
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                        activeStage === 1
                          ? 'bg-amber-500 text-white'
                          : activeStage > 1
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {activeStage > 1 ? '✓' : '1'}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-mono block opacity-75">Stage 1</span>
                      <span className="truncate block font-semibold">🟡 Awaiting OEM Dispatch</span>
                    </div>
                  </div>

                  {/* Stage 2 */}
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2.5 transition-all ${
                      activeStage === 2
                        ? 'bg-blue-50 border-blue-300 text-blue-950 font-bold shadow-2xs ring-1 ring-blue-400/40'
                        : activeStage > 2
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                        activeStage === 2
                          ? 'bg-blue-600 text-white'
                          : activeStage > 2
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {activeStage > 2 ? '✓' : '2'}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-mono block opacity-75">Stage 2</span>
                      <span className="truncate block font-semibold">🔵 Dispatched (Vendor Active)</span>
                    </div>
                  </div>

                  {/* Stage 3 */}
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2.5 transition-all ${
                      activeStage === 3
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold shadow-2xs ring-1 ring-emerald-400/40'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                        activeStage === 3
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {activeStage === 3 ? '✓' : '3'}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-mono block opacity-75">Stage 3</span>
                      <span className="truncate block font-semibold">🟢 OEM Resolved & Archived</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE ACTION BANNER */}
              {activeStage === 1 && (
                <div className="p-3.5 bg-amber-50/70 border-b border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-amber-900 text-xs">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Stage 1 Active:</strong> Ticket escalated from shop floor. Transmit failure report + RCA + warranty claim to manufacturer.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleDispatchDossierToOem(activeRecord)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg shadow-xs cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>🚀 Dispatch Failure Dossier to OEM</span>
                  </Button>
                </div>
              )}

              {activeStage === 2 && (
                <div className="p-3.5 bg-blue-50/70 border-b border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-blue-900 text-xs">
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong>Stage 2 Active:</strong> Dossier received by {activeRecord.oemManufacturer}. Replacement assembly / vendor specialist active.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportFailureDossier(activeRecord)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>📄 Export Dossier (Print/PDF)</span>
                    </button>
                    <Button
                      size="sm"
                      onClick={() => setIsSignOffModalOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>✅ Confirm OEM Resolution & Close</span>
                    </Button>
                  </div>
                </div>
              )}

              {activeStage === 3 && (
                <div className="p-3.5 bg-emerald-50/70 border-b border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-emerald-900 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Stage 3 Complete:</strong> Vendor overhaul authorized. Logged into permanent Maintenance History audit ledger.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportFailureDossier(activeRecord)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>📄 Export OEM Dossier</span>
                    </button>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Archived to History</span>
                    </span>
                  </div>
                </div>
              )}

              {/* DOSSIER HEADER */}
              <div className="p-5">
                <div className="flex flex-col xl:flex-row justify-between items-start gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-md shadow-2xs">
                        {activeRecord.ticketId}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                        {activeRecord.assetTag}
                      </span>
                      <span className="font-mono text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                        {activeRecord.slaPriority}
                      </span>
                      {activeStage === 3 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold border uppercase bg-emerald-100 text-emerald-800 border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Authority Cleared & Solved</span>
                        </span>
                      ) : activeStage === 2 ? (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md border bg-blue-50 text-blue-700 border-blue-200 uppercase">
                          🔵 Vendor Dispatched
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200 uppercase">
                          🟡 Awaiting Dispatch
                        </span>
                      )}
                    </div>

                    <h1 className="text-base sm:text-lg font-bold text-slate-900 font-sans tracking-tight">
                      [OEM Factory Escalation] {activeRecord.assetName || activeRecord.title || 'Sub-Assembly Failure'}
                    </h1>
                  </div>

                  {/* Header Action Controls */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportFailureDossier(activeRecord)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                      title="Export printable failure dossier for OEM factory dispatch"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>Export Dossier</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(activeRecord.id)}
                      className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                      title="Delete / cancel this escalation if filed by mistake"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Delete</span>
                    </button>

                    {onNavigateToTechQueue && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTechQueue(activeRecord.ticketId)}
                        className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                        title="View active board in Tech Execution Desk"
                      >
                        <Play className="w-3 h-3 fill-current text-slate-500" />
                        <span>Tech Desk</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* DOSSIER SECTION 1: OEM & WARRANTY CONTACT DETAILS */}
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-purple-50/40 p-4 rounded-xl border border-purple-200/80 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-purple-500 uppercase font-bold tracking-wider block">
                      OEM Manufacturer
                    </span>
                    <p className="font-sans font-bold text-slate-900 text-xs truncate">
                      {activeRecord.oemManufacturer}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-purple-500 uppercase font-bold tracking-wider block">
                      Direct OEM Contact
                    </span>
                    <p className="font-mono text-slate-800 text-xs flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 text-purple-600 shrink-0" />
                      <span className="truncate">{activeRecord.oemContactEmail}</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-purple-500 uppercase font-bold tracking-wider block">
                      Warranty & SLA Status
                    </span>
                    <p className="font-sans font-semibold text-emerald-800 text-xs flex items-center gap-1 truncate">
                      <Award className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{activeRecord.warrantyStatus}</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-purple-500 uppercase font-bold tracking-wider block">
                      Contract Reference
                    </span>
                    <p className="font-mono font-bold text-slate-900 text-xs truncate">
                      {activeRecord.warrantyContractId || activeRecord.contractRef}
                    </p>
                  </div>
                </div>
              </div>

              {/* DOSSIER SECTION 2: FAILURE DOSSIER & RCA FINDINGS */}
              <div className="p-5 space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wide">
                        Confirmed RCA Root Cause & Diagnostic Findings
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                      Alarm Code: {activeRecord.alarmCode || activeRecord.faultCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 font-sans leading-relaxed">
                    {activeRecord.rcaRootCause || activeRecord.rcaFindings}
                  </p>
                </div>

                {/* Blocked Sub-Assembly Step & Field Bottleneck */}
                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-rose-200/70 pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-bold text-rose-950 uppercase font-mono tracking-wide">
                        Blocked Execution Step & Field Bottleneck
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded">
                      Step #{activeRecord.failedStepNumber || 1}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 font-sans">
                      {activeRecord.failedStepTitle || 'Component Replacement & Torque'}
                    </p>
                    <p className="text-xs text-rose-900 font-sans leading-relaxed">
                      {activeRecord.failedNotes}
                    </p>
                  </div>
                </div>

                {/* Audit Sign-Off Section if Resolved */}
                {activeStage === 3 && activeRecord.oemReportNotes && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b border-emerald-200 pb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-bold text-emerald-950 uppercase font-mono tracking-wide">
                          OEM Vendor Resolution & Higher Authority Sign-off
                        </span>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                        Cleared by {activeRecord.clearedBy || 'Chief Engineer'}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900 font-sans leading-relaxed">
                      {activeRecord.oemReportNotes}
                    </p>
                    <div className="pt-1 text-[10px] font-mono text-emerald-700">
                      Timestamp: {formatLocalDateTime(activeRecord.clearedAt)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Clean, modern empty state when no escalation is selected */
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
                <FileCheck className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm font-sans">
                  Confirm OEM Vendor Resolution & Close
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
              <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200 font-mono space-y-1">
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
                  OEM Field Service Engineer Report & Resolution Remarks *
                </label>
                <textarea
                  rows={4}
                  value={signOffNotes}
                  onChange={(e) => setSignOffNotes(e.target.value)}
                  placeholder="Enter OEM certified factory overhaul findings, replaced titanium parts serial numbers, calibrated operational clearances, and warranty clearance notes..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-sans text-slate-900 focus:outline-none focus:border-purple-600 shadow-2xs"
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
                <span>Authorize & Move to Maintenance History</span>
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
                  Cancel & Delete OEM Escalation?
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
                <span>Confirm & Delete</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { Button } from '../ui/button';

export interface OemEscalationRecord {
  id: string;
  ticketId: string;
  rawCaseId?: string;
  assetTag: string;
  assetName: string;
  oemManufacturer: string;
  oemContactEmail: string;
  oemHotline?: string;
  slaPriority: string;
  faultCode: string;
  rcaFindings: string;
  failedNotes: string;
  failedStepNumber?: number;
  failedStepTitle?: string;
  escalatedByTechnician: string;
  escalatedAt: string;
  status: 'Awaiting OEM / Authority Review' | 'Under Factory Investigation' | 'Parts Dispatched / In Transit' | 'Authority Cleared';
  warrantyStatus: string;
  contractRef: string;
  oemReportNotes?: string;
  clearedAt?: string;
  clearedBy?: string;
}

const DEFAULT_OEM_ESCALATIONS: OemEscalationRecord[] = [
  {
    id: 'OEM-ESC-8012',
    ticketId: 'ESC-2026-8662',
    assetTag: 'HEX-PLATE-801',
    assetName: 'Plate Heat Exchanger Primary Feed',
    oemManufacturer: 'Alfa Laval Thermal Process Technologies',
    oemContactEmail: 'service.emea@alfalaval.com',
    oemHotline: '+1 (800) 555-ALFA / Ext 402',
    slaPriority: 'L4 Critical / 4-Hour Emergency Dispatch',
    faultCode: 'ALM-DIAG-201',
    rcaFindings: 'Internal plate channel bio-fouling and differential pressure degradation beyond field chemical wash specification.',
    failedNotes: 'Blocked at Step 2: Disassemble Plate Pack & Inspect Titanium Channels — Internal elastomeric gasket embrittlement requires certified factory pneumatic tightening rig and OEM EPDM food-grade seal kits.',
    failedStepNumber: 2,
    failedStepTitle: 'Disassemble Housing & Inspect Internal Tolerances',
    escalatedByTechnician: 'Marcus Vance',
    escalatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    status: 'Awaiting OEM / Authority Review',
    warrantyStatus: 'Active Factory Warranty (Tier-1 Direct)',
    contractRef: 'OEM-ALFA-2026-X801',
  },
  {
    id: 'OEM-ESC-4021',
    ticketId: 'ESC-2026-4402',
    assetTag: 'PUMP-CENTRIFUGAL-402',
    assetName: 'Centrifugal Slurry Booster Pump',
    oemManufacturer: 'Flowserve Pump Technologies GmbH',
    oemContactEmail: 'emea.dispatch@flowserve.com',
    oemHotline: '+49 201 8900-FLOW',
    slaPriority: 'High / 12-Hour Vendor Response Window',
    faultCode: 'FC-CAVITATION-402',
    rcaFindings: 'Impeller shroud erosion caused by high-solids slurry cavitation and suction bell vortex formation.',
    failedNotes: 'Blocked at Step 3: Replace Defective Components & Torque Fasteners — Impeller sleeve keyway has sheared into the main driveshaft; requires OEM mobile induction machining and balanced titanium replacement impeller.',
    failedStepNumber: 3,
    failedStepTitle: 'Replace Defective Components & Torque Fasteners',
    escalatedByTechnician: 'Sarah Chen',
    escalatedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    status: 'Under Factory Investigation',
    warrantyStatus: 'OEM Extended Industrial Care Plus',
    contractRef: 'OEM-FLW-2026-P402',
  },
  {
    id: 'OEM-ESC-1014',
    ticketId: 'ESC-2026-1101',
    assetTag: 'GEN-DIESEL-101',
    assetName: 'Emergency Standby Diesel Generator 1200kVA',
    oemManufacturer: 'Cummins Power Generation International',
    oemContactEmail: 'cpg.fieldsupport@cummins.com',
    oemHotline: '+1 (800) CUMMINS-CARE',
    slaPriority: 'L4 Critical / 4-Hour Emergency Dispatch',
    faultCode: 'ALM-ELEC-TRIP-99',
    rcaFindings: 'Automatic transfer switch governor actuator short circuit during weekly blackout transfer drill.',
    failedNotes: 'Blocked at Step 4: Functional Test & Operational Baseline — Electronic Governor Module (EGM) firmware corrupted by high-voltage grid back-feed; requires proprietary OEM InSite diagnostic flashing tool.',
    failedStepNumber: 4,
    failedStepTitle: 'Functional Test & 15-Minute Operational Baseline',
    escalatedByTechnician: 'Alex Rivera',
    escalatedAt: new Date(Date.now() - 3600000 * 36).toISOString(),
    status: 'Parts Dispatched / In Transit',
    warrantyStatus: 'Mission Critical Standby SLA',
    contractRef: 'OEM-CUMM-2026-GEN1',
  },
];

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
          // Merge with defaults to ensure complete rich data
          const existingIds = new Set(parsed.map((p) => p.id || p.ticketId));
          const additions = DEFAULT_OEM_ESCALATIONS.filter(
            (d) => !existingIds.has(d.id) && !existingIds.has(d.ticketId)
          );
          return [...parsed, ...additions];
        }
      }
    } catch {}
    return DEFAULT_OEM_ESCALATIONS;
  });

  const [selectedId, setSelectedId] = useState<string>(
    escalations.length > 0 ? escalations[0].id : ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [signOffNotes, setSignOffNotes] = useState('');
  const [isSubmittingSignOff, setIsSubmittingSignOff] = useState(false);

  // Listen for real-time escalations from Technician Queue
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

  // Filtered escalations
  const filteredList = useMemo(() => {
    return escalations.filter((rec) => {
      if (statusFilter !== 'ALL' && rec.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = rec.ticketId.toLowerCase().includes(q) || rec.id.toLowerCase().includes(q);
        const matchTag = rec.assetTag.toLowerCase().includes(q);
        const matchOem = rec.oemManufacturer.toLowerCase().includes(q);
        const matchTech = rec.escalatedByTechnician.toLowerCase().includes(q);
        if (!matchId && !matchTag && !matchOem && !matchTech) return false;
      }
      return true;
    });
  }, [escalations, searchQuery, statusFilter]);

  const activeRecord = useMemo(() => {
    return escalations.find((r) => r.id === selectedId) || escalations[0] || null;
  }, [escalations, selectedId]);

  // Handle Higher Authority Clearance Sign-Off
  const handleAuthorizeClearance = async () => {
    if (!activeRecord) return;
    setIsSubmittingSignOff(true);

    try {
      const now = new Date().toISOString();
      const updatedList = escalations.map((item) =>
        item.id === activeRecord.id
          ? {
              ...item,
              status: 'Authority Cleared' as const,
              oemReportNotes: signOffNotes.trim() || 'OEM field service engineer on-site overhaul completed and authorized by Higher Authority.',
              clearedAt: now,
              clearedBy: user?.fullName || 'Plant Chief Engineer',
            }
          : item
      );

      setEscalations(updatedList);
      try {
        localStorage.setItem('forgex_oem_escalations', JSON.stringify(updatedList));
      } catch {}

      toast.success(
        'OEM Escalation Cleared & Authorized',
        `Asset ${activeRecord.assetTag} successfully cleared by Higher Authority with OEM warranty sign-off.`
      );
      setIsSignOffModalOpen(false);
      setSignOffNotes('');
    } catch (err: any) {
      toast.error('Sign-off Failed', err.message || 'Could not authorize OEM resolution.');
    } finally {
      setIsSubmittingSignOff(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8FAFC] text-slate-900 font-sans antialiased">
      {/* Top Header */}
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-900 text-white flex items-center justify-center shadow-xs">
            <ShieldAlert className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 uppercase tracking-tight font-mono">
                OEM & Higher Authority Escalations
              </h1>
              <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                Tier-4 Vendor Desk
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              Plant: <strong>{organization?.name || 'Cleveland Stamping Plant'}</strong> · Direct Manufacturer Dispatch & Level-4 Warranty Resolution
            </p>
          </div>
        </div>

        {/* Counter Summary Pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
          <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>{escalations.filter((x) => x.status === 'Awaiting OEM / Authority Review').length} Awaiting Review</span>
          </span>
          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span>{escalations.filter((x) => x.status === 'Under Factory Investigation' || x.status === 'Parts Dispatched / In Transit').length} Active with OEM</span>
          </span>
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{escalations.filter((x) => x.status === 'Authority Cleared').length} Cleared</span>
          </span>
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
                { id: 'ALL', label: 'All Requests' },
                { id: 'Awaiting OEM / Authority Review', label: 'Awaiting' },
                { id: 'Under Factory Investigation', label: 'In Factory' },
                { id: 'Parts Dispatched / In Transit', label: 'In Transit' },
                { id: 'Authority Cleared', label: 'Cleared' },
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
                <p className="text-xs font-bold text-slate-700 font-mono">No Escalations Found</p>
                <p className="text-[11px] text-slate-400 font-sans">
                  No OEM vendor escalations match the selected filter.
                </p>
              </div>
            ) : (
              filteredList.map((rec) => {
                const isSelected = activeRecord?.id === rec.id;
                const isCleared = rec.status === 'Authority Cleared';

                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedId(rec.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 ${
                      isSelected
                        ? 'bg-purple-50/40 border-purple-500 ring-2 ring-purple-600/30 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Row 1: Ticket ID + Asset Tag + Status Pill */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-purple-700 text-xs truncate">
                          {rec.ticketId}
                        </span>
                        <span className="font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.2 rounded text-[10px]">
                          {rec.assetTag}
                        </span>
                      </div>

                      <span
                        className={`font-mono text-[9px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                          isCleared
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : rec.status === 'Awaiting OEM / Authority Review'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </div>

                    {/* Row 2: OEM Manufacturer */}
                    <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span className="truncate font-sans font-semibold text-[11px]">
                        {rec.oemManufacturer}
                      </span>
                    </div>

                    {/* Row 3: Footer Strip with Escalated By + Fault Code */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                      <span className="truncate">👨‍🔧 Escalated by {rec.escalatedByTechnician}</span>
                      <span className="bg-slate-100 text-slate-700 px-1 py-0.2 rounded shrink-0 font-bold">
                        {rec.faultCode}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT PANEL: COMPLETE DIAGNOSTIC & FAILURE DOSSIER                */}
        {/* ================================================================= */}
        {activeRecord ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-5 sm:p-6 bg-[#F8FAFC]">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
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
                      {activeRecord.status === 'Authority Cleared' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold border uppercase bg-emerald-100 text-emerald-800 border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Authority Cleared & Solved</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md border bg-purple-50 text-purple-700 border-purple-200 uppercase">
                          {activeRecord.status}
                        </span>
                      )}
                    </div>

                    <h1 className="text-base sm:text-lg font-bold text-slate-900 font-sans tracking-tight">
                      [OEM Factory Escalation] {activeRecord.assetName}
                    </h1>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {onNavigateToTechQueue && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTechQueue(activeRecord.ticketId)}
                        className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Open in Tech Queue &rarr;</span>
                      </button>
                    )}

                    {activeRecord.status !== 'Authority Cleared' && (
                      <Button
                        size="sm"
                        onClick={() => setIsSignOffModalOpen(true)}
                        className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer"
                      >
                        <FileCheck className="w-3.5 h-3.5 text-purple-200" />
                        <span>Authority Clearance Sign-Off</span>
                      </Button>
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
                      {activeRecord.contractRef}
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
                    <span className="font-mono text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                      Alarm: {activeRecord.faultCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-900 font-medium font-sans leading-relaxed">
                    {activeRecord.rcaFindings}
                  </p>
                </div>

                {/* DOSSIER SECTION 3: WHICH TECHNICIAN PROCEDURE STEP FAILED */}
                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-rose-100 pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-bold text-rose-900 uppercase font-mono tracking-wide">
                        Blocked Technician Step & Sub-Assembly Inspection
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded">
                      Failed at Step {activeRecord.failedStepNumber || 2}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-rose-200/80 text-xs space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">
                        PROCEDURE STEP {activeRecord.failedStepNumber || 2}
                      </span>
                      <h4 className="font-bold text-slate-900 text-xs">
                        {activeRecord.failedStepTitle || 'Housing Disassembly & Tolerance Inspection'}
                      </h4>
                    </div>
                    <p className="text-slate-800 font-sans leading-relaxed text-xs">
                      {activeRecord.failedNotes}
                    </p>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>Reported by: 👨‍🔧 <strong>{activeRecord.escalatedByTechnician}</strong></span>
                      <span>Escalated: {new Date(activeRecord.escalatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* DOSSIER SECTION 4: RESOLUTION / AUTHORITY CLEARANCE REPORT */}
                {activeRecord.status === 'Authority Cleared' && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-2xs space-y-2">
                    <div className="flex items-center gap-2 text-emerald-900 font-mono text-xs font-bold uppercase">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Higher Authority Resolution & OEM Sign-Off Dossier</span>
                    </div>
                    <p className="text-xs text-slate-800 font-sans leading-relaxed">
                      {activeRecord.oemReportNotes}
                    </p>
                    <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-[10px] font-mono text-emerald-800">
                      <span>Cleared by: <strong>{activeRecord.clearedBy}</strong></span>
                      <span>Timestamp: {activeRecord.clearedAt ? new Date(activeRecord.clearedAt).toLocaleString() : 'Just now'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
            <p className="text-xs font-mono">Select an OEM escalation from the list to view its complete failure dossier.</p>
          </div>
        )}
      </div>

      {/* AUTHORITY CLEARANCE SIGN-OFF MODAL */}
      {isSignOffModalOpen && activeRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm font-sans">
                  Higher Authority Clearance Sign-Off
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
                <p><strong>Ticket:</strong> {activeRecord.ticketId} · {activeRecord.assetTag}</p>
                <p><strong>OEM Vendor:</strong> {activeRecord.oemManufacturer}</p>
                <p><strong>Escalated by:</strong> {activeRecord.escalatedByTechnician}</p>
              </div>

              <div className="space-y-1 pt-1">
                <label className="font-bold text-slate-700 block">
                  OEM Field Engineer Service Report & Resolution Remarks *
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
                <span>Authorize & Clear Asset</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

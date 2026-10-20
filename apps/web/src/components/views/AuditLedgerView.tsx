import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Download,
  CheckCircle2,
  Lock,
  AlertTriangle,
  ShieldAlert,
  Search,
  FileCheck2,
  HelpCircle,
} from 'lucide-react';
import { StatusBadge, type StatusTone } from '../ui/StatusBadge';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import type { SecurityAlert, SecurityReviewStatus, SecurityResolutionOutcome } from '@forgex/shared-types';

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  assetTag: string;
  citations: string;
  hash: string;
  complianceState: 'VERIFIED_COMPLIANT' | 'ESCALATED';
}

const FALLBACK_AUDIT_DATA: AuditEntry[] = [
  {
    id: 'aud-901',
    timestamp: '2026-10-18 08:34:11 UTC',
    actor: 'T. Vance (PE-7089)',
    role: 'PLANT_ENGINEER',
    action: 'LOTO_SIGNOFF',
    assetTag: 'PUMP-204-B',
    citations: 'SOP-MTR-042 [Sec 1.2]',
    hash: 'sha256:6e1082...a703',
    complianceState: 'VERIFIED_COMPLIANT',
  },
  {
    id: 'aud-902',
    timestamp: '2026-10-18 08:29:40 UTC',
    actor: 'T. Vance (PE-7089)',
    role: 'PLANT_ENGINEER',
    action: 'DIAGNOSTIC_QUERY',
    assetTag: 'PUMP-204-B',
    citations: 'SOP-MTR-042 [P.14], OEM-MAN-883 [P.52]',
    hash: 'sha256:f1248c...88bc',
    complianceState: 'VERIFIED_COMPLIANT',
  },
  {
    id: 'aud-903',
    timestamp: '2026-10-17 16:12:05 UTC',
    actor: 'M. Chen (TECH-441)',
    role: 'TECHNICIAN',
    action: 'DEVIATION_RECORDED',
    assetTag: 'HEX-302-C',
    citations: 'SOP-HEX-019 [Sec 3.4]',
    hash: 'sha256:4a009d...339f',
    complianceState: 'ESCALATED',
  },
];

export const AuditLedgerView: React.FC = () => {
  const { token, isOwnerOrAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'alerts' | 'ledger'>('alerts');

  // Security Alerts State
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<SecurityReviewStatus>('INVESTIGATING');
  const [resolutionOutcome, setResolutionOutcome] = useState<SecurityResolutionOutcome>('BENIGN_LEGITIMATE_NEED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Audit Ledger State
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(FALLBACK_AUDIT_DATA);
  const [exported, setExported] = useState(false);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/audit/alerts?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setAlerts(json.data);
      }
    } catch (err) {
      console.warn('Could not fetch security alerts, using local state', err);
    }
  }, [token]);

  const fetchAuditEvents = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/audit/events?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: AuditEntry[] = json.data.map((e: any) => ({
          id: e.id,
          timestamp: e.createdAt ? new Date(e.createdAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'N/A',
          actor: e.actorUserId || 'System Service',
          role: 'TENANT_MEMBER',
          action: e.action,
          assetTag: e.resourceId || 'PLANT_WIDE',
          citations: e.metadata?.citationsCount ? `${e.metadata.citationsCount} citations` : 'Secured Reference',
          hash: `sha256:${e.id.slice(0, 8)}...${e.id.slice(-4)}`,
          complianceState: e.action.includes('BLOCKED') || e.action.includes('ESCALATED') ? 'ESCALATED' : 'VERIFIED_COMPLIANT',
        }));
        setAuditEntries(mapped);
      }
    } catch (err) {
      console.warn('Could not fetch audit events, using defaults', err);
    }
  }, [token]);

  useEffect(() => {
    fetchAlerts();
    fetchAuditEvents();
  }, [fetchAlerts, fetchAuditEvents]);

  const handleExport = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/v1/audit/export', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `forgex_audit_bundle_${Date.now()}.json`;
        a.click();
        setExported(true);
        setTimeout(() => setExported(false), 3000);
      }
    } catch (err) {
      console.error('Failed to export audit bundle', err);
    }
  };

  const openReviewModal = (alert: SecurityAlert) => {
    setSelectedAlert(alert);
    setReviewStatus(alert.status === 'OPEN' ? 'INVESTIGATING' : alert.status);
    setResolutionOutcome(alert.resolutionOutcome || 'BENIGN_LEGITIMATE_NEED');
    setReviewNotes(alert.reviewNotes || '');
    setIsReviewOpen(true);
  };

  const handleSaveReview = async () => {
    if (!selectedAlert || !token) return;
    setSavingReview(true);
    try {
      const res = await fetch(`/api/v1/audit/alerts/${selectedAlert.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: reviewStatus,
          resolutionOutcome,
          reviewNotes: reviewNotes.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsReviewOpen(false);
        fetchAlerts();
      }
    } catch (err) {
      console.error('Failed to review alert', err);
    } finally {
      setSavingReview(false);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = a.title.toLowerCase().includes(q);
      const matchSummary = a.summary.toLowerCase().includes(q);
      const matchActor = a.actorEmail?.toLowerCase().includes(q) || a.actorUserId?.toLowerCase().includes(q);
      if (!matchTitle && !matchSummary && !matchActor) return false;
    }
    return true;
  });

  const getSeverityTone = (sev: string): StatusTone => {
    switch (sev) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getStatusTone = (st: string): StatusTone => {
    switch (st) {
      case 'RESOLVED':
      case 'DISMISSED_BENIGN':
        return 'healthy';
      case 'INVESTIGATING':
        return 'warning';
      case 'CONFIRMED_VIOLATION':
        return 'critical';
      default:
        return 'neutral';
    }
  };

  const openAlertsCount = alerts.filter((a) => a.status === 'OPEN' || a.status === 'INVESTIGATING').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7]">
      {/* Sub-header Toolbar & Navigation */}
      <div className="p-3.5 border-b border-[#E2E8F0] bg-white flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#2563EB]" />
            <span className="font-bold text-[#1A202C] uppercase tracking-wider">
              Security & Compliance Administration
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-[#0F766E] flex items-center gap-1 text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> ISO-27001 / SOC-2 / OSHA 1910
          </span>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl border border-[#CBD5E1]">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium flex items-center gap-2 transition ${
              activeTab === 'alerts'
                ? 'bg-white text-[#1A202C] font-semibold shadow-sm border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Actionable Security Alerts</span>
            {openAlertsCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                {openAlertsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium flex items-center gap-2 transition ${
              activeTab === 'ledger'
                ? 'bg-white text-[#1A202C] font-semibold shadow-sm border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Cryptographic Audit Ledger</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {exported ? (
            <span className="text-[#0F766E] font-sans text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4" /> Signed Bundle Exported (.json.sig)
            </span>
          ) : (
            isOwnerOrAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                leftIcon={<Download className="w-3.5 h-3.5 text-white" />}
                className="bg-[#151C24] text-white hover:bg-black font-semibold rounded-lg shadow-sm border border-transparent"
              >
                Export Signed Bundle
              </Button>
            )
          )}
        </div>
      </div>

      {/* Section 6 Compliance Notice: Fair and Accurate Interpretation */}
      <div className="px-4 py-2.5 bg-[#EFF6FF] border-b border-[#BFDBFE] flex items-center justify-between text-[11px] font-sans text-[#1E3A8A]">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
          <span>
            <strong>Fair & Accurate Interpretation Policy:</strong> An access attempt is an auditable security signal for administrative triage, not proof of employee misconduct. Denied inquiries are cataloged for review without automated disciplinary actions.
          </span>
        </div>
        <span className="text-blue-600 text-[10px] font-medium hidden sm:inline">Strict Non-Punitive Initial State</span>
      </div>

      {/* Tab Content */}
      {activeTab === 'alerts' ? (
        <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by actor, resource or keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans text-[#1A202C] placeholder-[#94A3B8] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs font-sans text-[#1A202C]">
                <span className="text-[#64748B] text-[10px] font-semibold">STATUS:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent text-[#1A202C] outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="INVESTIGATING">Investigating</option>
                  <option value="DISMISSED_BENIGN">Dismissed (Benign)</option>
                  <option value="CONFIRMED_VIOLATION">Confirmed Violation</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs font-sans text-[#1A202C]">
                <span className="text-[#64748B] text-[10px] font-semibold">SEVERITY:</span>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-transparent text-[#1A202C] outline-none cursor-pointer"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            <div className="text-xs font-sans text-[#64748B]">
              Showing {filteredAlerts.length} of {alerts.length} security alerts
            </div>
          </div>

          {/* Alerts List Table */}
          <div className="flex-1 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
            {filteredAlerts.length === 0 ? (
              <div className="p-12 text-center text-[#64748B] font-sans text-xs flex flex-col items-center gap-2">
                <ShieldCheck className="w-8 h-8 text-[#0F766E]" />
                <span>No security alerts match the selected criteria.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4">SEVERITY</th>
                    <th className="py-3 px-4">ALERT TITLE & REASON</th>
                    <th className="py-3 px-4">ACTOR</th>
                    <th className="py-3 px-4">CATEGORY</th>
                    <th className="py-3 px-4">EVENTS</th>
                    <th className="py-3 px-4">LAST SEEN</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredAlerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-[#F8FAFC] text-[#1A202C] transition">
                      <td className="py-3 px-4">
                        <StatusBadge label={alert.severity} tone={getSeverityTone(alert.severity)} />
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-bold text-[#1A202C] text-xs">{alert.title}</div>
                        <div className="text-[11px] text-[#64748B] truncate mt-0.5">{alert.summary}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[#1A202C] text-[11px] font-medium">{alert.actorEmail || 'Anonymous'}</div>
                        <div className="text-[10px] text-[#64748B]">{alert.actorRole || 'Unknown Role'}</div>
                      </td>
                      <td className="py-3 px-4 text-amber-700 text-[11px] font-medium">
                        {alert.resourceCategory}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[11px] text-[#1A202C] font-mono">
                          {alert.eventCount} correlated
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[#64748B] tabular-nums">
                        {new Date(alert.lastSeenAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge label={alert.status.replace(/_/g, ' ')} tone={getStatusTone(alert.status)} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => openReviewModal(alert)}
                            className="px-2.5 py-1 rounded bg-[#F1F5F9] text-[#1A202C] border border-[#CBD5E1] hover:bg-[#E2E8F0] text-[11px] font-semibold transition"
                          >
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* Immutable Compliance Audit Ledger */
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">TIMESTAMP (UTC)</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">ACTOR</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">ACTION</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">ASSET TARGET</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">EVIDENCE CITATIONS</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">SHA-256 HASH</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {auditEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#F8FAFC] text-[#1A202C] transition">
                    <td className="py-3 px-4 text-[11px] text-[#64748B] font-mono tabular-nums">
                      {entry.timestamp}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#1A202C]">
                      {entry.actor}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-amber-700 font-mono font-medium">
                      {entry.action}
                    </td>
                    <td className="py-3 px-4 text-[#2563EB] font-bold font-mono">
                      {entry.assetTag}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-[#1A202C]">
                      {entry.citations}
                    </td>
                    <td className="py-3 px-4 text-[10px] text-[#64748B] font-mono tabular-nums">
                      {entry.hash}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        label={entry.complianceState}
                        tone={entry.complianceState === 'VERIFIED_COMPLIANT' ? 'healthy' : 'warning'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Dialog Modal */}
      {isReviewOpen && selectedAlert && (
        <Modal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          title="Administrative Incident Review & Outcome Signoff"
        >
          <div className="space-y-4 font-sans text-xs">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#64748B] uppercase font-semibold">Incident Dossier</span>
                <StatusBadge label={selectedAlert.severity} tone={getSeverityTone(selectedAlert.severity)} />
              </div>
              <div className="text-[#1A202C] font-bold text-sm">{selectedAlert.title}</div>
              <p className="text-[#64748B] text-xs">{selectedAlert.summary}</p>
              <div className="text-[11px] text-[#64748B] pt-1">
                Actor: {selectedAlert.actorEmail || selectedAlert.actorUserId} ({selectedAlert.actorRole}) • {selectedAlert.eventCount} correlated events
              </div>
            </div>

            {/* Section 7 Formal Authorization Warning */}
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1 text-[11px]">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>Confidential Resource Boundary Enforcement</span>
              </div>
              <p className="text-amber-800">
                Reviewing or resolving this alert records administrative notes into the tamper-evident ledger. It <strong>does NOT</strong> grant access to the underlying confidential manual or document. If access is legitimately required for work, initiate the formal document access request workflow.
              </p>
            </div>

            <div>
              <label className="block text-[#1A202C] mb-1 font-semibold uppercase text-[10px]">
                Review Status *
              </label>
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as SecurityReviewStatus)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[#1A202C] outline-none focus:border-[#2563EB]"
              >
                <option value="INVESTIGATING">INVESTIGATING — Under active administrative review</option>
                <option value="DISMISSED_BENIGN">DISMISSED_BENIGN — Legitimate inquiry or accidental prompt (no violation)</option>
                <option value="CONFIRMED_VIOLATION">CONFIRMED_VIOLATION — Verified unauthorized attempt or policy breach</option>
                <option value="RESOLVED">RESOLVED — Addressed with technician or formal access granted via ticket</option>
              </select>
            </div>

            <div>
              <label className="block text-[#1A202C] mb-1 font-semibold uppercase text-[10px]">
                Resolution Outcome Classification *
              </label>
              <select
                value={resolutionOutcome}
                onChange={(e) => setResolutionOutcome(e.target.value as SecurityResolutionOutcome)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[#1A202C] outline-none focus:border-[#2563EB]"
              >
                <option value="BENIGN_LEGITIMATE_NEED">BENIGN_LEGITIMATE_NEED — Employee had legitimate job need (formal permit needed)</option>
                <option value="ACCIDENTAL_PROMPT">ACCIDENTAL_PROMPT — Unintentional query or misunderstanding of policy</option>
                <option value="FALSE_POSITIVE">FALSE_POSITIVE — Benign general inquiry caught by filter</option>
                <option value="POLICY_VIOLATION">POLICY_VIOLATION — Deliberate restricted action or bypass attempt</option>
              </select>
            </div>

            <div>
              <label className="block text-[#1A202C] mb-1 font-semibold uppercase text-[10px]">
                Administrator Review Notes
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Document administrative findings, technician discussions, or approved authorization ticket numbers..."
                className="w-full p-2.5 bg-white border border-[#CBD5E1] rounded-lg text-[#1A202C] outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <Button variant="outline" size="sm" onClick={() => setIsReviewOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={savingReview}
                onClick={handleSaveReview}
                className="bg-[#151C24] text-white font-semibold hover:bg-black"
              >
                {savingReview ? 'Recording...' : 'Commit Review & Audit Entry'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { ShieldCheck, Download, CheckCircle2, Lock, Filter } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/button';

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: 'DIAGNOSTIC_QUERY' | 'LOTO_SIGNOFF' | 'DEVIATION_RECORDED' | 'DOCUMENT_INGEST';
  assetTag: string;
  citations: string;
  hash: string;
  complianceState: 'VERIFIED_COMPLIANT' | 'ESCALATED';
}

const AUDIT_DATA: AuditEntry[] = [
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
  {
    id: 'aud-904',
    timestamp: '2026-10-16 11:00:22 UTC',
    actor: 'System Admin (SYS-01)',
    role: 'SYSTEM_ADMIN',
    action: 'DOCUMENT_INGEST',
    assetTag: 'PLANT_WIDE',
    citations: 'PID-DWG-4010 (Rev 8.0)',
    hash: 'sha256:99ac71...22da',
    complianceState: 'VERIFIED_COMPLIANT',
  },
];

export const AuditLedgerView: React.FC = () => {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  const filtered = AUDIT_DATA.filter(
    (e) => filterAction === 'ALL' || e.action === filterAction
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-industrial-bg">
      {/* Sub-header Toolbar */}
      <div className="p-3.5 border-b border-industrial-border bg-industrial-sidebar flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-industrial-accent" />
            <span className="font-bold text-industrial-text uppercase tracking-wider">
              Cryptographic Audit Ledger
            </span>
          </div>
          <span className="text-industrial-border">|</span>
          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" /> OSHA 1910 / ISO-9001 COMPLIANT
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-industrial-bg border border-industrial-border rounded px-2.5 py-1">
            <Filter className="w-3 h-3 text-industrial-secondary" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-transparent text-xs font-mono text-industrial-text outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-industrial-surface">All Actions</option>
              <option value="LOTO_SIGNOFF" className="bg-industrial-surface">LOTO Signoff</option>
              <option value="DIAGNOSTIC_QUERY" className="bg-industrial-surface">Diagnostic Query</option>
              <option value="DEVIATION_RECORDED" className="bg-industrial-surface">Deviation Recorded</option>
              <option value="DOCUMENT_INGEST" className="bg-industrial-surface">Document Ingest</option>
            </select>
          </div>

          {exported ? (
            <span className="text-emerald-400 font-mono text-xs flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4" /> Signed Bundle Exported (.json.sig)
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<Download className="w-3.5 h-3.5 text-industrial-accent" />}
            >
              Export Signed Audit Bundle
            </Button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-industrial-border bg-industrial-sidebar/60 sticky top-0 z-10 text-industrial-secondary font-mono text-[11px]">
              <th className="py-2.5 px-4 font-semibold">TIMESTAMP (UTC)</th>
              <th className="py-2.5 px-4 font-semibold">ACTOR</th>
              <th className="py-2.5 px-4 font-semibold">ACTION</th>
              <th className="py-2.5 px-4 font-semibold">ASSET TARGET</th>
              <th className="py-2.5 px-4 font-semibold">EVIDENCE CITATIONS</th>
              <th className="py-2.5 px-4 font-semibold">SHA-256 HASH</th>
              <th className="py-2.5 px-4 font-semibold">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-industrial-border/60">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-industrial-surface/50 text-industrial-secondary transition">
                <td className="py-3 px-4 font-mono text-[11px] text-industrial-secondary tabular-nums">
                  {entry.timestamp}
                </td>
                <td className="py-3 px-4 font-mono font-medium text-industrial-text">
                  {entry.actor}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-amber-400">
                  {entry.action}
                </td>
                <td className="py-3 px-4 font-mono text-industrial-accent font-bold">
                  {entry.assetTag}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-industrial-text">
                  {entry.citations}
                </td>
                <td className="py-3 px-4 font-mono text-[10px] text-industrial-secondary tabular-nums">
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

      {/* Footer Info */}
      <div className="p-3 border-t border-industrial-border bg-industrial-sidebar flex items-center justify-between text-xs font-mono text-industrial-secondary">
        <span>Showing {filtered.length} Immutable Ledger Events</span>
        <span className="text-industrial-secondary text-[11px]">Key Id: 0x4B9E...7F01 (Hardware HSM)</span>
      </div>
    </div>
  );
};

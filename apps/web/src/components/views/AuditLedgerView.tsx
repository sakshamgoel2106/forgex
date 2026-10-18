import React from 'react';
import { ScrollText, ShieldCheck, Download } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

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
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Header Bar */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-amber-500" />
          <span className="font-bold text-graphite-100 uppercase">
            Tamper-Evident Compliance & Audit Ledger
          </span>
          <span className="text-graphite-500">|</span>
          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" /> OSHA / ISO-9001 CRYPTOGRAPHIC INTEGRITY
          </span>
        </div>

        <button className="px-3 py-1.5 rounded bg-graphite-800 hover:bg-graphite-700 text-graphite-200 border border-graphite-700 text-xs font-mono flex items-center gap-2 transition">
          <Download className="w-3.5 h-3.5 text-amber-400" />
          Export Signed Audit Bundle
        </button>
      </div>

      {/* Ledger Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-graphite-800 bg-graphite-900/40 sticky top-0 z-10 text-graphite-400 font-mono text-[11px]">
              <th className="py-2.5 px-4 font-semibold">TIMESTAMP (UTC)</th>
              <th className="py-2.5 px-4 font-semibold">ACTOR</th>
              <th className="py-2.5 px-4 font-semibold">ACTION</th>
              <th className="py-2.5 px-4 font-semibold">ASSET TARGET</th>
              <th className="py-2.5 px-4 font-semibold">EVIDENCE CITATIONS</th>
              <th className="py-2.5 px-4 font-semibold">CRYPTOGRAPHIC HASH</th>
              <th className="py-2.5 px-4 font-semibold">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-850">
            {AUDIT_DATA.map((entry) => (
              <tr key={entry.id} className="hover:bg-graphite-900/60 text-graphite-300">
                <td className="py-3 px-4 font-mono text-[11px] text-graphite-400">
                  {entry.timestamp}
                </td>
                <td className="py-3 px-4 font-mono font-medium text-graphite-200">
                  {entry.actor}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-amber-400">
                  {entry.action}
                </td>
                <td className="py-3 px-4 font-mono text-cyan-400 font-bold">
                  {entry.assetTag}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-graphite-300">
                  {entry.citations}
                </td>
                <td className="py-3 px-4 font-mono text-[10px] text-graphite-500">
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
  );
};

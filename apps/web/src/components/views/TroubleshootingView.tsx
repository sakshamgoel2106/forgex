import React, { useState } from 'react';
import {
  HelpCircle,
  Search,
  ArrowRight,
  FileCheck2,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';

interface FaultRecord {
  code: string;
  symptom: string;
  affectedAsset: string;
  likelyRootCause: string;
  recommendedAction: string;
  verifiedSop: string;
}

const FAULT_RECORDS: FaultRecord[] = [
  {
    code: 'E-402-SEAL-LEAK',
    symptom: 'Liquid slurry visible at gland follower weeping port (>5 drops/min)',
    affectedAsset: 'PUMP-204-B',
    likelyRootCause: 'Silicon carbide mating face thermal shock or uneven follower torque',
    recommendedAction: 'Check gland gap with feeler gauge. If gap > 3.3mm, perform SOP teardown',
    verifiedSop: 'SOP-MTR-042',
  },
  {
    code: 'E-704-VIB-HIGH',
    symptom: 'Horizontal vibration spike at 1x RPM running frequency (>4.8 mm/s)',
    affectedAsset: 'PUMP-204-B',
    likelyRootCause: 'Flexible coupling misalignment or impeller partial blockage',
    recommendedAction: 'Perform dial indicator laser alignment check',
    verifiedSop: 'SOP-ALG-011',
  },
  {
    code: 'E-101-SURGE-COMP',
    symptom: 'Rapid discharge pressure oscillation and reverse flow pulse',
    affectedAsset: 'COMP-101-A',
    likelyRootCause: 'Anti-surge recycle valve sticking or suction inlet throttling',
    recommendedAction: 'Stroke anti-surge valve FV-101-A to 100% open',
    verifiedSop: 'SOP-CMP-099',
  },
];

export const TroubleshootingView: React.FC<{ onNavigateToSop: () => void }> = ({
  onNavigateToSop,
}) => {
  const [search, setSearch] = useState('');
  const [selectedFault, setSelectedFault] = useState<FaultRecord>(FAULT_RECORDS[0]);

  const filtered = FAULT_RECORDS.filter(
    (f) =>
      f.code.toLowerCase().includes(search.toLowerCase()) ||
      f.symptom.toLowerCase().includes(search.toLowerCase()) ||
      f.affectedAsset.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Top Header */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-500" />
          <span className="font-bold text-graphite-100 uppercase">
            Diagnostic Troubleshooting & Root Cause Analysis
          </span>
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-graphite-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search fault code or symptom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-graphite-950 border border-graphite-800 rounded text-xs font-mono text-graphite-200 placeholder-graphite-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Main Split: Fault Index + Diagnostic Guidance */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Fault Code List */}
        <div className="w-80 border-r border-graphite-800 bg-graphite-900/40 p-3 space-y-2 overflow-y-auto">
          <div className="text-[10px] font-mono text-graphite-500 uppercase px-1 font-semibold">
            Cataloged Plant Fault Codes ({filtered.length})
          </div>

          {filtered.map((item) => {
            const isSelected = selectedFault.code === item.code;
            return (
              <div
                key={item.code}
                onClick={() => setSelectedFault(item)}
                className={`p-3 rounded border text-xs font-mono cursor-pointer transition ${
                  isSelected
                    ? 'bg-graphite-800 border-amber-500/70 text-graphite-100'
                    : 'bg-graphite-950/60 border-graphite-850 text-graphite-400 hover:border-graphite-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-400">{item.code}</span>
                  <span className="text-[10px] text-graphite-500">{item.affectedAsset}</span>
                </div>
                <div className="mt-1 font-sans text-xs text-graphite-300 line-clamp-2">
                  {item.symptom}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Detailed Diagnostic & Guided Action */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 max-w-4xl">
          <Card>
            <CardHeader>
              <div>
                <span className="text-[10px] font-mono text-amber-500 uppercase">
                  Verified Fault Dossier
                </span>
                <CardTitle className="mt-0.5">{selectedFault.code}</CardTitle>
              </div>
              <StatusBadge label="RCA CONFIRMED" tone="healthy" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-[10px] font-mono text-graphite-500 uppercase">
                  Reported Field Symptom
                </label>
                <p className="text-xs text-graphite-200 mt-1">{selectedFault.symptom}</p>
              </div>

              <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-1">
                <span className="text-[10px] font-mono text-graphite-500 uppercase">
                  Identified Root Cause
                </span>
                <p className="text-xs font-mono text-amber-300">
                  {selectedFault.likelyRootCause}
                </p>
              </div>

              <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-1">
                <span className="text-[10px] font-mono text-graphite-500 uppercase">
                  Recommended Immediate Triage
                </span>
                <p className="text-xs font-mono text-emerald-300">
                  {selectedFault.recommendedAction}
                </p>
              </div>

              <div className="pt-3 border-t border-graphite-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-graphite-400">
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                  <span>Governing SOP: {selectedFault.verifiedSop}</span>
                </div>
                <Button variant="primary" size="sm" onClick={onNavigateToSop}>
                  Launch Guided Procedure
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

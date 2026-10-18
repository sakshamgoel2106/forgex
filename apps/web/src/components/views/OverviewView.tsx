import React from 'react';
import {
  AlertTriangle,
  Boxes,
  BookOpen,
  Wrench,
  CheckCircle2,
  Cpu,
  ArrowUpRight,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';

export const OverviewView: React.FC<{ onNavigate: (module: string) => void }> = ({
  onNavigate,
}) => {
  return (
    <div className="flex-1 p-6 overflow-y-auto bg-graphite-950 space-y-6">
      {/* Top Banner / Operational Summary */}
      <div className="flex items-center justify-between pb-4 border-b border-graphite-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-mono text-graphite-100 uppercase tracking-wide">
              Operational Intelligence Overview
            </h2>
            <StatusBadge label="FACILITY ONLINE" tone="healthy" pulse />
          </div>
          <p className="text-xs text-graphite-400 mt-0.5 font-mono">
            Plant Complex: PLANT-TX-04 • Operational Mode: Air-Gapped Sovereign (OT-L3.5)
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-mono text-graphite-500 uppercase">
              Connected Assets
            </span>
            <Boxes className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-graphite-100 mt-2">348</div>
          <div className="text-[11px] font-mono text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> 98.2% Nominal Status
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-mono text-graphite-500 uppercase">
              Indexed Manuals & SOPs
            </span>
            <BookOpen className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-graphite-100 mt-2">1,420</div>
          <div className="text-[11px] font-mono text-graphite-400 mt-1">
            84,120 Vectorized Chunks
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-mono text-graphite-500 uppercase">
              Active SOP Overhauls
            </span>
            <Wrench className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-graphite-100 mt-2">3 Runs</div>
          <div className="text-[11px] font-mono text-amber-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> 1 LOTO Gate Pending
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-mono text-graphite-500 uppercase">
              Inference Runtime
            </span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-bold font-mono text-graphite-100 mt-2 truncate">
            Ollama (Local)
          </div>
          <div className="text-[11px] font-mono text-emerald-400 mt-1">
            0 Bytes Cloud Egress
          </div>
        </Card>
      </div>

      {/* Two-Column Industrial Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Plant Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Telemetry Anomalies & Active Alerts</CardTitle>
            <StatusBadge label="2 ACTIVE" tone="warning" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded bg-graphite-950 border border-amber-900/50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-400">PUMP-204-B</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    VIBRATION WARNING
                  </span>
                </div>
                <p className="text-xs text-graphite-300 mt-1">
                  Vibration RMS reached 4.8 mm/s (Threshold: 3.5 mm/s). Mechanical seal inspection
                  recommended.
                </p>
              </div>
              <button
                onClick={() => onNavigate('troubleshooting')}
                className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 shrink-0 ml-3"
              >
                Inspect <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3 rounded bg-graphite-950 border border-graphite-800 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-400">HEX-302-C</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-graphite-800 text-graphite-300 border border-graphite-700">
                    SCHEDULED OVERHAUL
                  </span>
                </div>
                <p className="text-xs text-graphite-400 mt-1">
                  Annual tube bundle descaling due in 4 days.
                </p>
              </div>
              <button
                onClick={() => onNavigate('maintenance')}
                className="text-xs font-mono text-graphite-400 hover:text-graphite-200 flex items-center gap-1 shrink-0 ml-3"
              >
                View SOP <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Access to High-Confidence Procedures */}
        <Card>
          <CardHeader>
            <CardTitle>Priority Industrial Procedures</CardTitle>
            <span className="text-[11px] font-mono text-graphite-500">REV VERIFIED</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                id: 'SOP-MTR-042',
                title: 'Slurry Pump Mechanical Seal Overhaul & Star Torque',
                asset: 'PUMP-204-B',
                pages: '48 Pages',
              },
              {
                id: 'SOP-CMP-109',
                title: 'Centrifugal Gas Compressor Dry Gas Seal Startup',
                asset: 'COMP-101-A',
                pages: '92 Pages',
              },
              {
                id: 'SOP-HEX-019',
                title: 'Shell & Tube Reboiler Pressure Relief Valve Test',
                asset: 'HEX-302-C',
                pages: '34 Pages',
              },
            ].map((sop) => (
              <div
                key={sop.id}
                onClick={() => onNavigate('maintenance')}
                className="p-3 rounded bg-graphite-950 border border-graphite-800 hover:border-graphite-700 cursor-pointer flex items-center justify-between transition"
              >
                <div>
                  <div className="text-xs font-mono font-bold text-amber-400">{sop.id}</div>
                  <div className="text-xs text-graphite-200 mt-0.5">{sop.title}</div>
                  <div className="text-[10px] font-mono text-graphite-500 mt-1">
                    TARGET: <span className="text-cyan-400">{sop.asset}</span> • {sop.pages}
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-graphite-500" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

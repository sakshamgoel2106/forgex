import React from 'react';
import {
  Boxes,
  BookOpen,
  Wrench,
  CheckCircle2,
  Cpu,
  ArrowUpRight,
  AlertTriangle,
  Bot,
  UploadCloud,
  Activity,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';

interface OverviewViewProps {
  onNavigate: (module: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  return (
    <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-industrial-bg space-y-6">
      {/* Top Banner / Operational Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-industrial-border gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold font-mono text-industrial-text uppercase tracking-wide">
              Operational Intelligence Summary
            </h2>
            <StatusBadge label="FACILITY NOMINAL" tone="healthy" pulse />
          </div>
          <p className="text-xs text-industrial-secondary mt-1 font-mono">
            Plant Complex: PLANT-TX-04 • Gulf Coast Petrochemical • Sovereign OT-L3.5 Runtime
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('knowledge-hub')}
            leftIcon={<UploadCloud className="w-3.5 h-3.5 text-industrial-accent" />}
          >
            Upload Manual
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('copilot')}
            leftIcon={<Bot className="w-3.5 h-3.5" />}
          >
            Ask AI Copilot
          </Button>
        </div>
      </div>

      {/* Operational KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connected Assets */}
        <Card className="bg-industrial-surface border-industrial-border p-4 space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-mono text-industrial-secondary uppercase font-medium">
              Connected Plant Assets
            </span>
            <Boxes className="w-4 h-4 text-industrial-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-industrial-text tabular-nums">
            348
          </div>
          <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>98.2% Nominal Operating State</span>
          </div>
        </Card>

        {/* Document Ingestion & Vector Chunks */}
        <Card className="bg-industrial-surface border-industrial-border p-4 space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-mono text-industrial-secondary uppercase font-medium">
              Indexed Engineering Manuals
            </span>
            <BookOpen className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-industrial-text tabular-nums">
            1,420
          </div>
          <div className="text-[11px] font-mono text-industrial-secondary flex items-center justify-between">
            <span>84,120 Vector Chunks</span>
            <span className="text-emerald-400 font-semibold">Qdrant Active</span>
          </div>
        </Card>

        {/* Active SOP Overhauls & Maintenance */}
        <Card className="bg-industrial-surface border-industrial-border p-4 space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-mono text-industrial-secondary uppercase font-medium">
              Active Maintenance Cases
            </span>
            <Wrench className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-industrial-text tabular-nums">
            3 Runs
          </div>
          <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>1 LOTO Approval Pending</span>
          </div>
        </Card>

        {/* Air-Gapped Sovereign Inference */}
        <Card className="bg-industrial-surface border-industrial-border p-4 space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-mono text-industrial-secondary uppercase font-medium">
              AI Inference Engine
            </span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-bold font-mono text-industrial-text truncate">
            Ollama (Local LLM)
          </div>
          <div className="text-[11px] font-mono text-emerald-400 flex items-center justify-between">
            <span>0 Bytes Egress</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800">
              FEDRAMP / OT
            </span>
          </div>
        </Card>
      </div>

      {/* Main Two-Column Industrial Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Telemetry Anomalies & Active Alerts */}
        <Card className="bg-industrial-surface border-industrial-border">
          <CardHeader className="p-4 border-b border-industrial-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-industrial-text">
                Active Telemetry Watchdogs
              </CardTitle>
            </div>
            <StatusBadge label="2 ACTIVE ALERTS" tone="warning" />
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* Alert 1 */}
            <div className="p-3.5 rounded-lg bg-industrial-bg border border-amber-900/60 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-industrial-accent">
                    PUMP-204-B
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-bold uppercase">
                    VIBRATION WARNING
                  </span>
                </div>
                <p className="text-xs text-industrial-text mt-1.5 leading-relaxed">
                  Vibration RMS reached <strong className="font-mono text-amber-300">4.8 mm/s</strong> (Threshold: 3.5 mm/s). Mechanical seal inspection and gland feeler gap verification recommended.
                </p>
                <div className="text-[10px] font-mono text-industrial-secondary mt-1">
                  Location: Primary Distillation Unit • Associated SOP: SOP-MTR-042
                </div>
              </div>
              <button
                onClick={() => onNavigate('maintenance')}
                className="text-xs font-mono text-industrial-accent hover:underline flex items-center gap-1 shrink-0 mt-1"
              >
                Inspect <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Alert 2 */}
            <div className="p-3.5 rounded-lg bg-industrial-bg border border-industrial-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-industrial-accent">
                    HEX-302-C
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-industrial-surface text-industrial-secondary border border-industrial-border uppercase">
                    SCHEDULED OVERHAUL
                  </span>
                </div>
                <p className="text-xs text-industrial-secondary mt-1.5 leading-relaxed">
                  Annual tube bundle descaling and pressure relief valve recertification due in 4 days.
                </p>
                <div className="text-[10px] font-mono text-industrial-secondary mt-1">
                  Location: Fractionation Train B • Associated SOP: SOP-HEX-019
                </div>
              </div>
              <button
                onClick={() => onNavigate('maintenance')}
                className="text-xs font-mono text-industrial-secondary hover:text-industrial-text flex items-center gap-1 shrink-0 mt-1"
              >
                View SOP <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* High-Priority Engineering SOPs */}
        <Card className="bg-industrial-surface border-industrial-border">
          <CardHeader className="p-4 border-b border-industrial-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-industrial-accent" />
              <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-industrial-text">
                Verified Industrial Procedures
              </CardTitle>
            </div>
            <span className="text-[11px] font-mono text-industrial-secondary">
              REV VERIFIED
            </span>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {[
              {
                id: 'SOP-MTR-042',
                title: 'Slurry Pump Mechanical Seal Overhaul & Star Torque',
                asset: 'PUMP-204-B',
                pages: '48 Pages',
                status: 'ACTIVE RUN',
              },
              {
                id: 'SOP-CMP-109',
                title: 'Centrifugal Gas Compressor Dry Gas Seal Startup',
                asset: 'COMP-101-A',
                pages: '92 Pages',
                status: 'VERIFIED',
              },
              {
                id: 'SOP-HEX-019',
                title: 'Shell & Tube Reboiler Pressure Relief Valve Test',
                asset: 'HEX-302-C',
                pages: '34 Pages',
                status: 'VERIFIED',
              },
            ].map((sop) => (
              <div
                key={sop.id}
                onClick={() => onNavigate('maintenance')}
                className="p-3.5 rounded-lg bg-industrial-bg border border-industrial-border hover:border-industrial-borderLight cursor-pointer flex items-center justify-between transition group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-amber-400 group-hover:text-industrial-accent transition">
                      {sop.id}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-industrial-surface border border-industrial-border text-industrial-secondary">
                      {sop.status}
                    </span>
                  </div>
                  <div className="text-xs text-industrial-text mt-1">{sop.title}</div>
                  <div className="text-[10px] font-mono text-industrial-secondary mt-1">
                    TARGET: <span className="text-industrial-accent font-semibold">{sop.asset}</span> • {sop.pages}
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-industrial-secondary group-hover:text-industrial-accent transition" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Strip */}
      <div className="p-4 rounded-lg bg-industrial-surface border border-industrial-border flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-industrial-bg border border-industrial-border text-industrial-accent">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-industrial-text uppercase tracking-wide">
              Cryptographic Audit Compliance
            </div>
            <p className="text-xs text-industrial-secondary mt-0.5">
              All operator queries, LOTO signoffs, and maintenance executions are SHA-256 hashed and immutable.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('audit')}
          rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
        >
          View Audit Ledger
        </Button>
      </div>
    </div>
  );
};

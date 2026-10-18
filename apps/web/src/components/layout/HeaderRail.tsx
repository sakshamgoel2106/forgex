import React from 'react';
import {
  Cpu,
  ShieldCheck,
  Radio,
  Sliders,
  ChevronDown,
  User,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

interface HeaderRailProps {
  plantSite: string;
  onPlantChange: (site: string) => void;
  onOpenHealthModal: () => void;
  systemHealthy: boolean;
}

export const HeaderRail: React.FC<HeaderRailProps> = ({
  plantSite,
  onPlantChange,
  onOpenHealthModal,
  systemHealthy,
}) => {
  return (
    <header className="h-14 border-b border-graphite-800 bg-graphite-900/90 backdrop-blur px-4 flex items-center justify-between select-none">
      {/* Brand & Subsystem Tag */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-graphite-950 font-black shadow-lg shadow-amber-950/40">
            <Cpu className="w-5 h-5 text-graphite-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold tracking-wider text-base text-graphite-100 uppercase">
                ForgeX<span className="text-amber-500">.AI</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-graphite-800 text-graphite-400 border border-graphite-700">
                OT-L3.5
              </span>
            </div>
            <p className="text-[10px] text-graphite-400 font-mono tracking-tight -mt-0.5">
              INDUSTRIAL MULTIMODAL INTELLIGENCE
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-graphite-800" />

        {/* Plant Site Selector */}
        <div className="flex items-center gap-2 bg-graphite-950 px-2.5 py-1 rounded border border-graphite-800">
          <Sliders className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs text-graphite-400 font-mono">PLANT:</span>
          <select
            value={plantSite}
            onChange={(e) => onPlantChange(e.target.value)}
            className="bg-transparent text-xs font-mono font-medium text-graphite-200 outline-none cursor-pointer"
          >
            <option value="PLANT-TX-04">PLANT-TX-04 (Refinery Complex)</option>
            <option value="PLANT-OH-02">PLANT-OH-02 (Cold Rolling Mill)</option>
            <option value="PLANT-LA-01">PLANT-LA-01 (Ethylene Cracker)</option>
          </select>
          <ChevronDown className="w-3 h-3 text-graphite-500 pointer-events-none" />
        </div>
      </div>

      {/* Center Telemetry & Air Gap Security Banner */}
      <div className="hidden lg:flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-graphite-950 border border-graphite-800 text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-graphite-400">DATA SOVEREIGNTY:</span>
          <span className="text-emerald-400 font-semibold">AIR-GAPPED [LOCAL RUNTIME]</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-graphite-950 border border-graphite-800 text-xs font-mono">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-graphite-400">EGRESS:</span>
          <span className="text-graphite-200">0.00 KB/s (RESTRICTED)</span>
        </div>
      </div>

      {/* Right Controls: Subsystem Health & User Profile */}
      <div className="flex items-center gap-3">
        {/* Subsystem Health Trigger */}
        <button
          onClick={onOpenHealthModal}
          className="flex items-center gap-2 px-2.5 py-1 rounded bg-graphite-950 hover:bg-graphite-800 border border-graphite-800 transition text-xs font-mono"
          title="Inspect Subsystem Health"
        >
          <StatusBadge
            label={systemHealthy ? 'SYSTEMS NOMINAL' : 'CHECK SUBSYSTEMS'}
            tone={systemHealthy ? 'healthy' : 'warning'}
            pulse={systemHealthy}
          />
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-graphite-800">
          <div className="w-7 h-7 rounded-full bg-graphite-800 border border-graphite-700 flex items-center justify-center text-graphite-300">
            <User className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-medium text-graphite-200 leading-tight">T. Vance</div>
            <div className="text-[10px] font-mono text-graphite-400 leading-tight">
              PE-7089 | Level 4
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

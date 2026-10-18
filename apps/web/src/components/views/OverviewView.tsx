import React from 'react';
import {
  FileText,
  Wrench,
  Users,
  UploadCloud,
  Bot,
  Plus,
  CloudSun,
  ArrowRight,
  TrendingUp,
  FileCode,
  Image as ImageIcon,
  Layers,
  Activity,
  FolderOpen,
} from 'lucide-react';

interface OverviewViewProps {
  onNavigate: (module: string) => void;
}

/* -------------------------------------------------------------------------- */
/* Precision SCADA Equipment SVG Icons for "Top Assets by Activity"           */
/* -------------------------------------------------------------------------- */
const CentrifugalPumpIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="17" r="10" stroke="#38BDF8" strokeWidth="2" fill="#0E2238" />
    <circle cx="16" cy="17" r="4.5" stroke="#A3E635" strokeWidth="1.8" fill="#122A1E" />
    <path d="M16 12.5V7M16 7H22" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    <rect x="5" y="27" width="22" height="3" rx="1.5" fill="#64748B" />
    <path d="M12 17L14 15M20 17L18 19M16 13L16 15M16 21L16 19" stroke="#A3E635" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const GasCompressorIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="10" width="14" height="14" rx="2" stroke="#38BDF8" strokeWidth="2" fill="#0E2238" />
    <rect x="19" y="13" width="8" height="8" rx="1.5" stroke="#A3E635" strokeWidth="1.8" fill="#122A1E" />
    <path d="M8 7V10M12 7V10M16 7V10" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="3" stroke="#38BDF8" strokeWidth="1.5" />
    <rect x="4" y="26" width="24" height="3" rx="1.5" fill="#64748B" />
  </svg>
);

const BoilerIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="6" width="18" height="20" rx="9" stroke="#F59E0B" strokeWidth="2" fill="#2A1E0B" />
    <circle cx="16" cy="14" r="3" stroke="#F59E0B" strokeWidth="1.5" fill="#3D2908" />
    <path d="M16 14L18 12" stroke="#A3E635" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M11 22C11 20 13 19 16 19C19 19 21 20 21 22" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="6" y="27" width="20" height="3" rx="1.5" fill="#64748B" />
  </svg>
);

const TurbineIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="10" stroke="#818CF8" strokeWidth="2" fill="#141838" />
    <circle cx="16" cy="16" r="3.5" fill="#A3E635" />
    <path d="M16 6V12.5M16 19.5V26M6 16H12.5M19.5 16H26" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9 9L13.5 13.5M18.5 18.5L23 23M9 23L13.5 18.5M18.5 13.5L23 9" stroke="#818CF8" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const CoolingTowerIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 6H23C21 13 20 18 24 26H8C12 18 11 13 9 6Z" stroke="#38BDF8" strokeWidth="2" fill="#0C1B2E" />
    <path d="M10 16H22M12 21H20" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="2 2" />
    <path d="M13 3C13 4 14 5 16 5C18 5 19 4 19 3" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="6" y="27" width="20" height="3" rx="1.5" fill="#64748B" />
  </svg>
);

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  return (
    <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-[#06090E] text-slate-100 font-sans antialiased">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 max-w-[1720px] mx-auto">
        {/* ========================================================= */}
        {/* LEFT / CENTER CONTENT: 3 Columns Wide on XL Screens       */}
        {/* ========================================================= */}
        <div className="xl:col-span-3 space-y-6 min-w-0">
          {/* Top Hero Banner */}
          <div className="relative rounded-2xl overflow-hidden border border-[#182333] bg-[#0A1018] min-h-[144px] flex items-center justify-between p-6 shadow-xl">
            {/* Background Panorama Image with subtle gradient masks */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
              style={{ backgroundImage: "url('/refinery_banner.jpg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#06090E] via-[#06090E]/85 to-transparent" />

            {/* Left Welcome Copy */}
            <div className="relative z-10">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Good morning, John <span className="inline-block animate-wave">👋</span>
              </h1>
              <p className="text-sm text-slate-300 mt-1 font-sans">
                Here&apos;s what&apos;s happening at your plant today.
              </p>
            </div>

            {/* Right Weather Glass Card */}
            <div className="relative z-10 hidden sm:flex items-center gap-3.5 px-4 py-2.5 rounded-xl bg-[#0B1420]/85 border border-[#1E2E42] backdrop-blur-md shadow-2xl">
              <CloudSun className="w-8 h-8 text-amber-400 shrink-0 filter drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
              <div>
                <div className="text-lg font-bold text-white leading-tight font-mono tabular-nums">24°C</div>
                <div className="text-xs text-slate-200 font-medium">Partly Cloudy</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Riverside Plant</div>
              </div>
            </div>
          </div>

          {/* Row 1: KPI Stat Summary Cards (5 Columns) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* 1. Total Assets */}
            <div
              onClick={() => onNavigate('assets')}
              className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] hover:border-[#283C56] cursor-pointer transition flex items-center gap-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0D2418] border border-[#194B2E] flex items-center justify-center text-[#A3E635] shrink-0 shadow-inner">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Total Assets</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  48
                </div>
                <div className="text-[11px] text-sky-400 font-semibold mt-0.5">+2 this week</div>
              </div>
            </div>

            {/* 2. Documents */}
            <div
              onClick={() => onNavigate('knowledge-hub')}
              className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] hover:border-[#283C56] cursor-pointer transition flex items-center gap-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0D1F35] border border-[#173D66] flex items-center justify-center text-[#38BDF8] shrink-0 shadow-inner">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Documents</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  125
                </div>
                <div className="text-[11px] text-sky-400 font-semibold mt-0.5">+5 this week</div>
              </div>
            </div>

            {/* 3. Indexed Knowledge */}
            <div
              onClick={() => onNavigate('knowledge-hub')}
              className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] hover:border-[#283C56] cursor-pointer transition flex items-center gap-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0D2418] border border-[#194B2E] flex items-center justify-center text-[#A3E635] shrink-0 shadow-inner">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Indexed Knowledge</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  118
                </div>
                <div className="text-[11px] text-[#A3E635] font-semibold mt-0.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> +94% success rate
                </div>
              </div>
            </div>

            {/* 4. Open Maintenance Cases */}
            <div
              onClick={() => onNavigate('maintenance')}
              className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] hover:border-[#283C56] cursor-pointer transition flex items-center gap-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#2A1D0B] border border-[#523812] flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Open Maintenance Cases</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  6
                </div>
                <div className="text-[11px] text-amber-400 font-semibold mt-0.5">+2 new</div>
              </div>
            </div>

            {/* 5. Active Users */}
            <div
              onClick={() => onNavigate('audit')}
              className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] hover:border-[#283C56] cursor-pointer transition flex items-center gap-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] col-span-2 sm:col-span-1"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0D1F35] border border-[#173D66] flex items-center justify-center text-[#38BDF8] shrink-0 shadow-inner">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Active Users</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  12
                </div>
                <div className="text-[11px] text-slate-400 font-medium mt-0.5">of 18 members</div>
              </div>
            </div>
          </div>

          {/* Row 2: Document Processing Donut + Recent Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Document Processing Donut Card */}
            <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Document Processing</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Upload and indexing status</p>
                </div>
                <button
                  onClick={() => onNavigate('knowledge-hub')}
                  className="text-xs text-slate-300 hover:text-white transition px-2.5 py-1 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
                >
                  View All
                </button>
              </div>

              <div className="flex items-center justify-around py-2">
                {/* Circular Gauge */}
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="text-[#131F2E]"
                      strokeWidth="9"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="text-[#A3E635]"
                      strokeWidth="9"
                      strokeDasharray="251.2"
                      strokeDashoffset="15" // ~94%
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      filter="drop-shadow(0 0 6px rgba(163,230,53,0.4))"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold font-mono text-white leading-none tabular-nums tracking-tight">
                      94%
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 font-medium">Completed</span>
                  </div>
                </div>

                {/* Legend Breakdown */}
                <div className="space-y-3 font-sans text-xs">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#A3E635] shadow-[0_0_8px_#A3E635]" />
                      <span className="text-slate-300 font-medium">Completed</span>
                    </div>
                    <span className="font-mono font-bold text-white tabular-nums">118</span>
                  </div>

                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]" />
                      <span className="text-slate-300 font-medium">Processing</span>
                    </div>
                    <span className="font-mono font-bold text-white tabular-nums">5</span>
                  </div>

                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_8px_#EF4444]" />
                      <span className="text-slate-300 font-medium">Failed</span>
                    </div>
                    <span className="font-mono font-bold text-white tabular-nums">2</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity Card */}
            <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white tracking-tight">Recent Activity</h3>
                <button
                  onClick={() => onNavigate('audit')}
                  className="text-xs text-slate-300 hover:text-white transition px-2.5 py-1 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3.5">
                {/* Item 1 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#0D2418] border border-[#194B2E] text-[#A3E635] flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">Manual_Safety_Procedures.pdf</div>
                      <div className="text-[11px] text-slate-400">Document indexed successfully</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">2m ago</span>
                </div>

                {/* Item 2 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#0D2418] border border-[#194B2E] text-[#A3E635] flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">Compressor_Maintenance_SOP.pdf</div>
                      <div className="text-[11px] text-slate-400">Processing completed</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">12m ago</span>
                </div>

                {/* Item 3 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#2A1D0B] border border-[#523812] text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Wrench className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">New maintenance case created</div>
                      <div className="text-[11px] text-slate-400">Case #MC-2025-0042 • High priority</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">25m ago</span>
                </div>

                {/* Item 4 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#0D1F35] border border-[#173D66] text-[#38BDF8] flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">User Alex Johnson joined</div>
                      <div className="text-[11px] text-slate-400">Engineer • Riverside Plant</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">1h ago</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Recent Documents Table */}
          <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white tracking-tight">Recent Documents</h3>
              <button
                onClick={() => onNavigate('knowledge-hub')}
                className="text-xs text-slate-300 hover:text-white transition px-2.5 py-1 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
              >
                View All
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#182333] text-slate-400 font-sans text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-semibold">Name</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold">Version</th>
                    <th className="py-2.5 px-3 font-semibold">Asset / Plant</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#131E2C]">
                  {/* Doc 1 */}
                  <tr className="hover:bg-[#111B28]/70 transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-[#2D1217] border border-[#641A24] text-[#F87171] flex items-center justify-center text-[10px] font-bold font-mono">
                        PDF
                      </div>
                      <span className="hover:text-[#A3E635] cursor-pointer transition-colors" onClick={() => onNavigate('knowledge-hub')}>
                        Hydraulic_Pump_Manual.pdf
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">PDF</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v2.1</td>
                    <td className="py-3 px-3 text-slate-300">Hydraulic Pump (HP-01)</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0E2317] border border-[#1B4E2B] text-[#A3E635] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                        Indexed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">2 hours ago</td>
                  </tr>

                  {/* Doc 2 */}
                  <tr className="hover:bg-[#111B28]/70 transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-[#2D1217] border border-[#641A24] text-[#F87171] flex items-center justify-center text-[10px] font-bold font-mono">
                        PDF
                      </div>
                      <span className="hover:text-[#A3E635] cursor-pointer transition-colors" onClick={() => onNavigate('knowledge-hub')}>
                        Electrical_Schematic.pdf
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">PDF</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.3</td>
                    <td className="py-3 px-3 text-slate-300">Control Panel (CP-01)</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0E2317] border border-[#1B4E2B] text-[#A3E635] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                        Indexed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">3 hours ago</td>
                  </tr>

                  {/* Doc 3 */}
                  <tr className="hover:bg-[#111B28]/70 transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-[#0D1F35] border border-[#173D66] text-[#38BDF8] flex items-center justify-center text-[10px] font-bold font-mono">
                        PDF
                      </div>
                      <span className="hover:text-[#A3E635] cursor-pointer transition-colors" onClick={() => onNavigate('knowledge-hub')}>
                        Safety_Procedure_Scan.pdf
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">PDF</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.0</td>
                    <td className="py-3 px-3 text-slate-300">All Assets</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0B2035] border border-[#13426A] text-[#38BDF8] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse shadow-[0_0_6px_#38BDF8]" />
                        Processing
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">5 hours ago</td>
                  </tr>

                  {/* Doc 4 */}
                  <tr className="hover:bg-[#111B28]/70 transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-[#0F2238] border border-[#1A456E] text-[#60A5FA] flex items-center justify-center text-[10px] font-bold font-mono">
                        DOCX
                      </div>
                      <span className="hover:text-[#A3E635] cursor-pointer transition-colors" onClick={() => onNavigate('knowledge-hub')}>
                        Valve_Maintenance_SOP.docx
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">DOCX</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.2</td>
                    <td className="py-3 px-3 text-slate-300">Valve (V-04)</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0E2317] border border-[#1B4E2B] text-[#A3E635] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                        Indexed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">6 hours ago</td>
                  </tr>

                  {/* Doc 5 */}
                  <tr className="hover:bg-[#111B28]/70 transition-colors">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-[#251433] border border-[#532675] text-[#C084FC] flex items-center justify-center text-[10px] font-bold font-mono">
                        IMG
                      </div>
                      <span className="hover:text-[#A3E635] cursor-pointer transition-colors" onClick={() => onNavigate('knowledge-hub')}>
                        P&ID_Diagram.png
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">Image</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.0</td>
                    <td className="py-3 px-3 text-slate-300">Boiler Section</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#2D1217] border border-[#641A24] text-[#F87171] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F87171] shadow-[0_0_6px_#F87171]" />
                        Failed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">8 hours ago</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Row 4: 3 Bottom Cards (Knowledge Coverage, Top Assets, Recent Questions) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. Knowledge Coverage */}
            <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Knowledge Coverage</h3>
                  <p className="text-xs text-slate-400">Documents by category</p>
                </div>
                <button
                  onClick={() => onNavigate('knowledge-hub')}
                  className="text-xs text-slate-300 hover:text-white transition px-2 py-0.5 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3 pt-1 text-xs">
                {/* Item 1 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Maintenance Manuals
                    </span>
                    <span className="font-mono text-white font-bold tabular-nums">42</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#131F2E] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full shadow-[0_0_6px_rgba(163,230,53,0.4)]" style={{ width: '85%' }} />
                  </div>
                </div>

                {/* Item 2 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                      SOPs
                    </span>
                    <span className="font-mono text-white font-bold tabular-nums">28</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#131F2E] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full shadow-[0_0_6px_rgba(163,230,53,0.4)]" style={{ width: '58%' }} />
                  </div>
                </div>

                {/* Item 3 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <FileCode className="w-3.5 h-3.5 text-slate-400" />
                      Safety Procedures
                    </span>
                    <span className="font-mono text-white font-bold tabular-nums">16</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#131F2E] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full shadow-[0_0_6px_rgba(163,230,53,0.4)]" style={{ width: '36%' }} />
                  </div>
                </div>

                {/* Item 4 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      Technical Drawings
                    </span>
                    <span className="font-mono text-white font-bold tabular-nums">12</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#131F2E] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full shadow-[0_0_6px_rgba(163,230,53,0.4)]" style={{ width: '28%' }} />
                  </div>
                </div>

                {/* Item 5 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      Other
                    </span>
                    <span className="font-mono text-white font-bold tabular-nums">7</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#131F2E] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full shadow-[0_0_6px_rgba(163,230,53,0.4)]" style={{ width: '15%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Top Assets by Activity */}
            <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white tracking-tight">Top Assets by Activity</h3>
                <button
                  onClick={() => onNavigate('assets')}
                  className="text-xs text-slate-300 hover:text-white transition px-2 py-0.5 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Asset 1 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#0E1B2B] border border-[#1C2F45] flex items-center justify-center p-1 shrink-0 shadow-sm">
                      <CentrifugalPumpIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Centrifugal Pump (P-101)</div>
                      <div className="text-[10px] text-slate-400">12 documents • 4 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#0E2317] text-[#A3E635] border border-[#1B4E2B] font-bold">
                    High
                  </span>
                </div>

                {/* Asset 2 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#0E1B2B] border border-[#1C2F45] flex items-center justify-center p-1 shrink-0 shadow-sm">
                      <GasCompressorIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Gas Compressor (C-201)</div>
                      <div className="text-[10px] text-slate-400">10 documents • 2 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#0E2317] text-[#A3E635] border border-[#1B4E2B] font-bold">
                    High
                  </span>
                </div>

                {/* Asset 3 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#241A0B] border border-[#483315] flex items-center justify-center p-1 shrink-0 shadow-sm">
                      <BoilerIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Boiler (B-101)</div>
                      <div className="text-[10px] text-slate-400">8 documents • 1 case</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#2A1D0B] text-amber-400 border border-[#523812] font-bold">
                    Medium
                  </span>
                </div>

                {/* Asset 4 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#141A30] border border-[#232F55] flex items-center justify-center p-1 shrink-0 shadow-sm">
                      <TurbineIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Turbine (T-301)</div>
                      <div className="text-[10px] text-slate-400">6 documents • 0 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#2A1D0B] text-amber-400 border border-[#523812] font-bold">
                    Medium
                  </span>
                </div>

                {/* Asset 5 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#0E1B2B] border border-[#1C2F45] flex items-center justify-center p-1 shrink-0 shadow-sm">
                      <CoolingTowerIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Cooling Tower (CT-01)</div>
                      <div className="text-[10px] text-slate-400">4 documents • 0 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#131E2C] text-slate-400 border border-[#203044] font-bold">
                    Low
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Recent Questions */}
            <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white tracking-tight">Recent Questions</h3>
                <button
                  onClick={() => onNavigate('copilot')}
                  className="text-xs text-slate-300 hover:text-white transition px-2 py-0.5 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Q1 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635] shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-medium truncate">
                        What is the maintenance procedure for the hydraulic pump?
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">2m ago • P-101</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0E2317] text-[#A3E635] border border-[#1B4E2B] shrink-0 font-bold">
                    Answered
                  </span>
                </div>

                {/* Q2 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635] shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-medium truncate">
                        How do I reset the circuit breaker?
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">12m ago • Electrical</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0E2317] text-[#A3E635] border border-[#1B4E2B] shrink-0 font-bold">
                    Answered
                  </span>
                </div>

                {/* Q3 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635] shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-medium truncate">
                        What does the P&ID show for this section?
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">24m ago • Boiler</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0E2317] text-[#A3E635] border border-[#1B4E2B] shrink-0 font-bold">
                    Answered
                  </span>
                </div>

                {/* Q4 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)] shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-medium truncate">
                        Why is the machine overheating?
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">1h ago • Compressor</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#2A1D0B] text-amber-400 border border-[#523812] shrink-0 font-bold">
                    Insufficient evidence
                  </span>
                </div>

                {/* Q5 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2.5 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] cursor-pointer transition flex items-center justify-between gap-2 border border-[#16202E] hover:border-[#24374E]"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635] shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-200 font-medium truncate">
                        Show me the safety procedure for LOTO.
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">2h ago • All Assets</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0E2317] text-[#A3E635] border border-[#1B4E2B] shrink-0 font-bold">
                    Answered
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Quick Actions, System Health & Promo CTA   */}
        {/* ========================================================= */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <h3 className="text-sm font-bold text-white tracking-tight">Quick Actions</h3>

            <div className="space-y-2.5">
              {/* Action 1 */}
              <button
                onClick={() => onNavigate('knowledge-hub')}
                className="w-full p-3 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] border border-[#16202E] hover:border-[#24374E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0D2418] border border-[#194B2E] text-[#A3E635] flex items-center justify-center shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#A3E635] transition">
                    Upload Document
                  </div>
                  <div className="text-[11px] text-slate-400">Add manuals, SOPs, or files</div>
                </div>
              </button>

              {/* Action 2 */}
              <button
                onClick={() => onNavigate('copilot')}
                className="w-full p-3 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] border border-[#16202E] hover:border-[#24374E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0D2418] border border-[#194B2E] text-[#A3E635] flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#A3E635] transition">
                    Ask AI Copilot
                  </div>
                  <div className="text-[11px] text-slate-400">Get evidence-based answers</div>
                </div>
              </button>

              {/* Action 3 */}
              <button
                onClick={() => onNavigate('maintenance')}
                className="w-full p-3 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] border border-[#16202E] hover:border-[#24374E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0D2418] border border-[#194B2E] text-[#A3E635] flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#A3E635] transition">
                    Create Maintenance Case
                  </div>
                  <div className="text-[11px] text-slate-400">Start troubleshooting workflow</div>
                </div>
              </button>

              {/* Action 4 */}
              <button
                onClick={() => onNavigate('assets')}
                className="w-full p-3 rounded-xl bg-[#0A0F17] hover:bg-[#121B27] border border-[#16202E] hover:border-[#24374E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0D2418] border border-[#194B2E] text-[#A3E635] flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#A3E635] transition">
                    Add Plant / Asset
                  </div>
                  <div className="text-[11px] text-slate-400">Register new equipment</div>
                </div>
              </button>
            </div>
          </div>

          {/* System Health Card */}
          <div className="p-5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white tracking-tight">System Health</h3>
              <button
                onClick={() => onNavigate('settings')}
                className="text-xs text-slate-300 hover:text-white transition px-2.5 py-1 rounded-lg bg-[#111A26] border border-[#1E2E42] hover:border-[#2E425E]"
              >
                View Details
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Item 1 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">API Service</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.9%</span>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">Database (PostgreSQL)</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.9%</span>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">Vector DB (Qdrant)</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.8%</span>
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">Object Storage</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.7%</span>
                </div>
              </div>

              {/* Item 5 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">Redis / Queue</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.9%</span>
                </div>
              </div>

              {/* Item 6 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">Document Worker</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.6%</span>
                </div>
              </div>

              {/* Item 7 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-medium">AI Provider (Cloud)</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635] shadow-[0_0_6px_#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums font-semibold">99.8%</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Promo Card from Screenshot */}
          <div className="relative rounded-xl overflow-hidden border border-[#182333] bg-[#0A1018] p-5 shadow-2xl min-h-[220px] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/promo_card_bg.jpg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06090E] via-[#06090E]/85 to-transparent" />

            <div className="relative z-10 space-y-2">
              <h4 className="text-base font-bold text-white leading-snug tracking-tight">
                Unlock the power of Industrial Knowledge
              </h4>
              <p className="text-[11px] text-slate-300 font-mono">
                SOPs • Manuals • Diagrams • Expert Knowledge
              </p>

              <button
                onClick={() => onNavigate('copilot')}
                className="mt-2 w-full py-2.5 px-4 rounded-xl bg-[#A3E635] hover:bg-[#b2f043] text-[#06090E] font-bold text-xs flex items-center justify-center gap-2 transition shadow-[0_4px_16px_rgba(163,230,53,0.3)]"
              >
                <span>Explore AI Copilot</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

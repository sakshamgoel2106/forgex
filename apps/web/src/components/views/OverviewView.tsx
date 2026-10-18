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

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  return (
    <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-[#070B10] text-slate-100 font-sans">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 max-w-[1720px] mx-auto">
        {/* ========================================================= */}
        {/* LEFT / CENTER CONTENT: 3 Columns Wide on XL Screens */}
        {/* ========================================================= */}
        <div className="xl:col-span-3 space-y-6 min-w-0">
          {/* Top Hero Banner */}
          <div className="relative rounded-2xl overflow-hidden border border-[#1E293B] bg-[#0E1520] min-h-[140px] flex items-center justify-between p-6">
            {/* Background Panorama Image with subtle gradient masks */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
              style={{ backgroundImage: "url('/refinery_banner.jpg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0E1520] via-[#0E1520]/80 to-transparent" />

            {/* Left Welcome Copy */}
            <div className="relative z-10">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Good morning, John <span className="inline-block animate-wave">👋</span>
              </h1>
              <p className="text-sm text-slate-400 mt-1 font-sans">
                Here&apos;s what&apos;s happening at your plant today.
              </p>
            </div>

            {/* Right Weather Glass Card */}
            <div className="relative z-10 hidden sm:flex items-center gap-3.5 px-4 py-2.5 rounded-xl bg-[#111A27]/90 border border-[#233144] backdrop-blur-md shadow-xl">
              <CloudSun className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <div className="text-lg font-bold text-white leading-tight">24°C</div>
                <div className="text-xs text-slate-300 font-medium">Partly Cloudy</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Riverside Plant</div>
              </div>
            </div>
          </div>

          {/* Row 1: KPI Stat Summary Cards (5 Columns) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* 1. Total Assets */}
            <div
              onClick={() => onNavigate('assets')}
              className="p-4 rounded-xl bg-[#101722] border border-[#1E293B] hover:border-[#2E3E52] cursor-pointer transition flex items-center gap-3.5 shadow-sm"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-950/70 border border-emerald-800/60 flex items-center justify-center text-[#A3E635] shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Total Assets</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  48
                </div>
                <div className="text-[11px] text-cyan-400 font-medium mt-0.5">+2 this week</div>
              </div>
            </div>

            {/* 2. Documents */}
            <div
              onClick={() => onNavigate('knowledge-hub')}
              className="p-4 rounded-xl bg-[#101722] border border-[#1E293B] hover:border-[#2E3E52] cursor-pointer transition flex items-center gap-3.5 shadow-sm"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-950/70 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Documents</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  125
                </div>
                <div className="text-[11px] text-blue-400 font-medium mt-0.5">+5 this week</div>
              </div>
            </div>

            {/* 3. Indexed Knowledge */}
            <div
              onClick={() => onNavigate('knowledge-hub')}
              className="p-4 rounded-xl bg-[#101722] border border-[#1E293B] hover:border-[#2E3E52] cursor-pointer transition flex items-center gap-3.5 shadow-sm"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-950/70 border border-emerald-800/60 flex items-center justify-center text-[#A3E635] shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Indexed Knowledge</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  118
                </div>
                <div className="text-[11px] text-[#A3E635] font-medium mt-0.5 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> 94% success rate
                </div>
              </div>
            </div>

            {/* 4. Open Maintenance Cases */}
            <div
              onClick={() => onNavigate('maintenance')}
              className="p-4 rounded-xl bg-[#101722] border border-[#1E293B] hover:border-[#2E3E52] cursor-pointer transition flex items-center gap-3.5 shadow-sm"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-950/70 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium truncate">Open Maintenance Cases</div>
                <div className="text-2xl font-bold text-white leading-tight tabular-nums font-mono">
                  6
                </div>
                <div className="text-[11px] text-amber-400 font-medium mt-0.5">+2 new</div>
              </div>
            </div>

            {/* 5. Active Users */}
            <div
              onClick={() => onNavigate('audit')}
              className="p-4 rounded-xl bg-[#101722] border border-[#1E293B] hover:border-[#2E3E52] cursor-pointer transition flex items-center gap-3.5 shadow-sm col-span-2 sm:col-span-1"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-950/70 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
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
            <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Document Processing</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Upload and indexing status</p>
                </div>
                <button
                  onClick={() => onNavigate('knowledge-hub')}
                  className="text-xs text-slate-400 hover:text-white transition px-2.5 py-1 rounded bg-[#17212F] border border-[#233144]"
                >
                  View All
                </button>
              </div>

              <div className="flex items-center justify-around py-3">
                {/* Circular Gauge */}
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="text-[#1A2534]"
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
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold font-mono text-white leading-none tabular-nums">
                      94%
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 font-medium">Completed</span>
                  </div>
                </div>

                {/* Legend Breakdown */}
                <div className="space-y-3 font-sans text-xs">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#A3E635]" />
                      <span className="text-slate-300">Completed</span>
                    </div>
                    <span className="font-mono font-bold text-white tabular-nums">118</span>
                  </div>

                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                      <span className="text-slate-300">Processing</span>
                    </div>
                    <span className="font-mono font-bold text-white tabular-nums">5</span>
                  </div>

                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                      <span className="text-slate-300">Failed</span>
                    </div>
                    <span className="font-mono font-bold text-white tabular-nums">2</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity Card */}
            <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                <button
                  onClick={() => onNavigate('audit')}
                  className="text-xs text-slate-400 hover:text-white transition px-2.5 py-1 rounded bg-[#17212F] border border-[#233144]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3.5">
                {/* Item 1 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-emerald-950/80 border border-emerald-800 text-[#A3E635] flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">Manual_Safety_Procedures.pdf</div>
                      <div className="text-[11px] text-slate-400">Document indexed successfully</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">2m ago</span>
                </div>

                {/* Item 2 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-emerald-950/80 border border-emerald-800 text-[#A3E635] flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">Compressor_Maintenance_SOP.pdf</div>
                      <div className="text-[11px] text-slate-400">Processing completed</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">12m ago</span>
                </div>

                {/* Item 3 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-amber-950/80 border border-amber-800 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Wrench className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">New maintenance case created</div>
                      <div className="text-[11px] text-slate-400">Case #MC-2025-0042 • High priority</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">25m ago</span>
                </div>

                {/* Item 4 */}
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-blue-950/80 border border-blue-800 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">User Alex Johnson joined</div>
                      <div className="text-[11px] text-slate-400">Engineer • Riverside Plant</div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">1h ago</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Recent Documents Table */}
          <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Recent Documents</h3>
              <button
                onClick={() => onNavigate('knowledge-hub')}
                className="text-xs text-slate-400 hover:text-white transition px-2.5 py-1 rounded bg-[#17212F] border border-[#233144]"
              >
                View All
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1E293B] text-slate-400 font-sans text-[11px]">
                    <th className="py-2.5 px-3 font-semibold">Name</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold">Version</th>
                    <th className="py-2.5 px-3 font-semibold">Asset / Plant</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182333]">
                  {/* Doc 1 */}
                  <tr className="hover:bg-[#141E2B]/50 transition">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-red-950/60 border border-red-800 text-red-400 flex items-center justify-center text-[10px] font-bold">
                        PDF
                      </div>
                      <span className="hover:underline cursor-pointer" onClick={() => onNavigate('knowledge-hub')}>
                        Hydraulic_Pump_Manual.pdf
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">PDF</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v2.1</td>
                    <td className="py-3 px-3 text-slate-300">Hydraulic Pump (HP-01)</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                        Indexed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">2 hours ago</td>
                  </tr>

                  {/* Doc 2 */}
                  <tr className="hover:bg-[#141E2B]/50 transition">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-red-950/60 border border-red-800 text-red-400 flex items-center justify-center text-[10px] font-bold">
                        PDF
                      </div>
                      <span className="hover:underline cursor-pointer" onClick={() => onNavigate('knowledge-hub')}>
                        Electrical_Schematic.pdf
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">PDF</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.3</td>
                    <td className="py-3 px-3 text-slate-300">Control Panel (CP-01)</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                        Indexed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">3 hours ago</td>
                  </tr>

                  {/* Doc 3 */}
                  <tr className="hover:bg-[#141E2B]/50 transition">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-blue-950/60 border border-blue-800 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                        PDF
                      </div>
                      <span className="hover:underline cursor-pointer" onClick={() => onNavigate('knowledge-hub')}>
                        Safety_Procedure_Scan.pdf
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">PDF</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.0</td>
                    <td className="py-3 px-3 text-slate-300">All Assets</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-950/70 border border-blue-800/80 text-blue-400 text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Processing
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">5 hours ago</td>
                  </tr>

                  {/* Doc 4 */}
                  <tr className="hover:bg-[#141E2B]/50 transition">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-400 flex items-center justify-center text-[10px] font-bold">
                        DOCX
                      </div>
                      <span className="hover:underline cursor-pointer" onClick={() => onNavigate('knowledge-hub')}>
                        Valve_Maintenance_SOP.docx
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">DOCX</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.2</td>
                    <td className="py-3 px-3 text-slate-300">Valve (V-04)</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                        Indexed
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400 font-mono text-[11px]">6 hours ago</td>
                  </tr>

                  {/* Doc 5 */}
                  <tr className="hover:bg-[#141E2B]/50 transition">
                    <td className="py-3 px-3 flex items-center gap-2.5 font-medium text-white">
                      <div className="w-6 h-6 rounded bg-purple-950/60 border border-purple-800 text-purple-400 flex items-center justify-center text-[10px] font-bold">
                        IMG
                      </div>
                      <span className="hover:underline cursor-pointer" onClick={() => onNavigate('knowledge-hub')}>
                        P&ID_Diagram.png
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">Image</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">v1.0</td>
                    <td className="py-3 px-3 text-slate-300">Boiler Section</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-950/70 border border-rose-800/80 text-rose-400 text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
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
            <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Knowledge Coverage</h3>
                  <p className="text-xs text-slate-400">Documents by category</p>
                </div>
                <button
                  onClick={() => onNavigate('knowledge-hub')}
                  className="text-xs text-slate-400 hover:text-white transition px-2 py-0.5 rounded bg-[#17212F] border border-[#233144]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3 pt-1 text-xs">
                {/* Item 1 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Maintenance Manuals
                    </span>
                    <span className="font-mono text-white font-bold">42</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1A2534] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full" style={{ width: '85%' }} />
                  </div>
                </div>

                {/* Item 2 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                    <span className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                      SOPs
                    </span>
                    <span className="font-mono text-white font-bold">28</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1A2534] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full" style={{ width: '58%' }} />
                  </div>
                </div>

                {/* Item 3 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                    <span className="flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-slate-400" />
                      Safety Procedures
                    </span>
                    <span className="font-mono text-white font-bold">16</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1A2534] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full" style={{ width: '36%' }} />
                  </div>
                </div>

                {/* Item 4 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      Technical Drawings
                    </span>
                    <span className="font-mono text-white font-bold">12</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1A2534] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full" style={{ width: '28%' }} />
                  </div>
                </div>

                {/* Item 5 */}
                <div>
                  <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      Other
                    </span>
                    <span className="font-mono text-white font-bold">7</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#1A2534] overflow-hidden">
                    <div className="h-full bg-[#A3E635] rounded-full" style={{ width: '15%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Top Assets by Activity */}
            <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Top Assets by Activity</h3>
                <button
                  onClick={() => onNavigate('assets')}
                  className="text-xs text-slate-400 hover:text-white transition px-2 py-0.5 rounded bg-[#17212F] border border-[#233144]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Asset 1 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded bg-[#1C283B] flex items-center justify-center text-slate-300 shrink-0">
                      ⚙️
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Centrifugal Pump (P-101)</div>
                      <div className="text-[10px] text-slate-400">12 documents • 4 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-[#A3E635] border border-emerald-800 font-bold">
                    High
                  </span>
                </div>

                {/* Asset 2 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded bg-[#1C283B] flex items-center justify-center text-slate-300 shrink-0">
                      🏭
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Gas Compressor (C-201)</div>
                      <div className="text-[10px] text-slate-400">10 documents • 2 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-[#A3E635] border border-emerald-800 font-bold">
                    High
                  </span>
                </div>

                {/* Asset 3 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded bg-[#1C283B] flex items-center justify-center text-slate-300 shrink-0">
                      🔥
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Boiler (B-101)</div>
                      <div className="text-[10px] text-slate-400">8 documents • 1 case</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-bold">
                    Medium
                  </span>
                </div>

                {/* Asset 4 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded bg-[#1C283B] flex items-center justify-center text-slate-300 shrink-0">
                      🌀
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Turbine (T-301)</div>
                      <div className="text-[10px] text-slate-400">6 documents • 0 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-bold">
                    Medium
                  </span>
                </div>

                {/* Asset 5 */}
                <div
                  onClick={() => onNavigate('assets')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded bg-[#1C283B] flex items-center justify-center text-slate-300 shrink-0">
                      💧
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate text-[11px]">Cooling Tower (CT-01)</div>
                      <div className="text-[10px] text-slate-400">4 documents • 0 cases</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                    Low
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Recent Questions */}
            <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Recent Questions</h3>
                <button
                  onClick={() => onNavigate('copilot')}
                  className="text-xs text-slate-400 hover:text-white transition px-2 py-0.5 rounded bg-[#17212F] border border-[#233144]"
                >
                  View All
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Q1 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-200 font-medium truncate">
                      What is the maintenance procedure for the hydraulic pump?
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">2m ago • P-101</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-[#A3E635] border border-emerald-800 shrink-0 font-bold">
                    Answered
                  </span>
                </div>

                {/* Q2 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-200 font-medium truncate">
                      How do I reset the circuit breaker?
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">12m ago • Electrical</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-[#A3E635] border border-emerald-800 shrink-0 font-bold">
                    Answered
                  </span>
                </div>

                {/* Q3 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-200 font-medium truncate">
                      What does the P&ID show for this section?
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">24m ago • Boiler</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-[#A3E635] border border-emerald-800 shrink-0 font-bold">
                    Answered
                  </span>
                </div>

                {/* Q4 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-200 font-medium truncate">
                      Why is the machine overheating?
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">1h ago • Compressor</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 shrink-0 font-bold">
                    Insufficient evidence
                  </span>
                </div>

                {/* Q5 */}
                <div
                  onClick={() => onNavigate('copilot')}
                  className="p-2 rounded-lg bg-[#141C28] hover:bg-[#1A2536] cursor-pointer transition flex items-center justify-between gap-2 border border-[#1E293B]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-200 font-medium truncate">
                      Show me the safety procedure for LOTO.
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">2h ago • All Assets</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-[#A3E635] border border-emerald-800 shrink-0 font-bold">
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
          <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
            <h3 className="text-sm font-bold text-white">Quick Actions</h3>

            <div className="space-y-2.5">
              {/* Action 1 */}
              <button
                onClick={() => onNavigate('knowledge-hub')}
                className="w-full p-3 rounded-lg bg-[#141C28] hover:bg-[#192434] border border-[#1E293B] hover:border-[#2C3B4E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] flex items-center justify-center shrink-0">
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
                className="w-full p-3 rounded-lg bg-[#141C28] hover:bg-[#192434] border border-[#1E293B] hover:border-[#2C3B4E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] flex items-center justify-center shrink-0">
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
                className="w-full p-3 rounded-lg bg-[#141C28] hover:bg-[#192434] border border-[#1E293B] hover:border-[#2C3B4E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] flex items-center justify-center shrink-0">
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
                className="w-full p-3 rounded-lg bg-[#141C28] hover:bg-[#192434] border border-[#1E293B] hover:border-[#2C3B4E] transition flex items-center gap-3.5 text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-[#A3E635] flex items-center justify-center shrink-0">
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
          <div className="p-5 rounded-xl bg-[#101722] border border-[#1E293B] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">System Health</h3>
              <button
                onClick={() => onNavigate('settings')}
                className="text-xs text-slate-400 hover:text-white transition px-2.5 py-1 rounded bg-[#17212F] border border-[#233144]"
              >
                View Details
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Item 1 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">API Service</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.9%</span>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">Database (PostgreSQL)</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.9%</span>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">Vector DB (Qdrant)</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.8%</span>
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">Object Storage</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.7%</span>
                </div>
              </div>

              {/* Item 5 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">Redis / Queue</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.9%</span>
                </div>
              </div>

              {/* Item 6 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">Document Worker</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.6%</span>
                </div>
              </div>

              {/* Item 7 */}
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px]">AI Provider (Cloud)</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#A3E635] text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
                    Healthy
                  </span>
                  <span className="font-mono text-slate-400 text-[11px] tabular-nums">99.8%</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Promo Card from Screenshot */}
          <div className="relative rounded-xl overflow-hidden border border-[#1E293B] bg-[#0E1520] p-5 shadow-2xl min-h-[220px] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/promo_card_bg.jpg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F15] via-[#0B0F15]/80 to-transparent" />

            <div className="relative z-10 space-y-2">
              <h4 className="text-base font-bold text-white leading-snug">
                Unlock the power of Industrial Knowledge
              </h4>
              <p className="text-[11px] text-slate-300 font-mono">
                SOPs • Manuals • Diagrams • Expert Knowledge
              </p>

              <button
                onClick={() => onNavigate('copilot')}
                className="mt-2 w-full py-2.5 px-4 rounded-lg bg-[#A3E635] hover:bg-[#bef264] text-[#070B10] font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg"
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

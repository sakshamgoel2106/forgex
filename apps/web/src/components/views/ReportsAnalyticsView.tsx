import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  Filter,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const DOWNTIME_BY_MACHINE = [
  { machine: 'HP-204', downtimeHrs: 18.5, faults: 6 },
  { machine: 'PUMP-204-B', downtimeHrs: 12.2, faults: 4 },
  { machine: 'COMP-702', downtimeHrs: 8.6, faults: 3 },
  { machine: 'TURB-101', downtimeHrs: 4.1, faults: 1 },
  { machine: 'CONV-102', downtimeHrs: 2.0, faults: 1 },
];

const MTTR_TREND = [
  { month: 'Jun', mttrMinutes: 142 },
  { month: 'Jul', mttrMinutes: 128 },
  { month: 'Aug', mttrMinutes: 110 },
  { month: 'Sep', mttrMinutes: 94 },
  { month: 'Oct', mttrMinutes: 76 },
];

const TECH_WORKLOAD = [
  { name: 'M. Richter', closedTickets: 14, activeHours: 42.5 },
  { name: 'Tom Tech', closedTickets: 11, activeHours: 36.0 },
  { name: 'Alex Chen', closedTickets: 9, activeHours: 31.2 },
  { name: 'Sarah Connor', closedTickets: 7, activeHours: 24.8 },
];

export const ReportsAnalyticsView: React.FC<{
  onDrillDown?: (machine: string) => void;
}> = ({ onDrillDown }) => {
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '12m'>('90d');
  const [selectedPlant, setSelectedPlant] = useState('ALL');

  const exportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Machine,DowntimeHours,FaultsCount\n' +
      DOWNTIME_BY_MACHINE.map((e) => `${e.machine},${e.downtimeHrs},${e.faults}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `forgex_downtime_report_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#F5F6F7] text-[#1A202C] font-sans antialiased p-6 space-y-6">
      {/* Header with Export CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] bg-white p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#151C24] text-white flex items-center justify-center shadow-sm">
            <BarChart3 className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A202C]">
              Operational Intelligence & Reliability Analytics
            </h1>
            <p className="text-xs text-[#64748B]">
              OEE availability trends · MTTR benchmark · Machine downtime Pareto
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded px-2.5 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-[#64748B]" />
            <select
              value={selectedPlant}
              onChange={(e) => setSelectedPlant(e.target.value)}
              className="bg-transparent text-xs text-[#1A202C] font-medium outline-none cursor-pointer"
            >
              <option value="ALL">All Facilities</option>
              <option value="STUTTGART">Stuttgart Werk 2</option>
              <option value="RIVERSIDE">Riverside Refinery</option>
            </select>
          </div>

          <div className="flex bg-white border border-[#CBD5E1] rounded p-0.5 shadow-sm">
            {(['30d', '90d', '12m'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition ${
                  dateRange === r
                    ? 'bg-[#151C24] text-white'
                    : 'text-[#64748B] hover:text-[#1A202C]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={exportCsv}
            className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-700 font-semibold rounded flex items-center gap-1.5 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Grid of Analytical Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        {/* Chart 1: Downtime by Machine (Pareto Bar) */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1A202C]">
                Cumulative Downtime by Machine (Hours)
              </h2>
              <p className="text-xs text-[#64748B]">Click bar to drill down to history</p>
            </div>
            <span className="text-xs font-mono text-gray-400">Total: 45.4h</span>
          </div>

          <div className="h-64 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DOWNTIME_BY_MACHINE} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="machine" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{
                    backgroundColor: '#151C24',
                    border: '1px solid #243145',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '11px',
                  }}
                />
                <Bar
                  dataKey="downtimeHrs"
                  fill="#2563EB"
                  radius={[4, 4, 0, 0]}
                  onClick={(entry: any) => onDrillDown?.(entry?.machine || 'HP-204')}
                  className="cursor-pointer hover:opacity-85 transition"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: MTTR (Mean Time to Repair) Reduction Trend */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1A202C]">
                Mean Time to Repair (MTTR) Trend
              </h2>
              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> -46% reduction since Copilot integration
              </p>
            </div>
            <span className="text-xs font-mono text-gray-400">Minutes</span>
          </div>

          <div className="h-64 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MTTR_TREND} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#151C24',
                    border: '1px solid #243145',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '11px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="mttrMinutes"
                  stroke="#0F766E"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#0F766E' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Technician Workload Distribution */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1A202C]">
                Technician Work Order Closure & Intervention Hours
              </h2>
              <p className="text-xs text-[#64748B]">Workload balancing across plant shifts</p>
            </div>
            <span className="text-xs font-mono text-gray-400">4 Lead Specialists</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TECH_WORKLOAD.map((t) => (
              <div key={t.name} className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                <div className="font-bold text-xs text-gray-900">{t.name}</div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-500">Tickets Resolved</span>
                  <span className="font-bold text-blue-600">{t.closedTickets}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-500">Field Hours</span>
                  <span className="font-bold text-gray-900">{t.activeHours}h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

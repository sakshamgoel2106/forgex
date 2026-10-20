import React, { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Wrench,
  ShieldAlert,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface OverviewViewProps {
  onNavigate: (module: string) => void;
}

const AVAILABILITY_DATA_7D = [
  { day: 'Mon', oee: 92.4, availability: 94.1 },
  { day: 'Tue', oee: 94.1, availability: 95.8 },
  { day: 'Wed', oee: 93.8, availability: 94.9 },
  { day: 'Thu', oee: 96.2, availability: 97.4 },
  { day: 'Fri', oee: 95.0, availability: 96.1 },
  { day: 'Sat', oee: 97.3, availability: 98.2 },
  { day: 'Sun', oee: 96.8, availability: 97.8 },
];

const HEALTH_DISTRIBUTION = [
  { name: 'Operational', value: 118, color: '#0F766E' },
  { name: 'Attention', value: 16, color: '#D97706' },
  { name: 'Critical', value: 3, color: '#DC2626' },
  { name: 'Offline / PM', value: 5, color: '#64748B' },
];

const HIGH_PRIORITY_WOS = [
  {
    id: 'WO-8812',
    assetTag: 'HP-204',
    title: 'Hydraulic Press Overheating >85°C (Error E-2041)',
    priority: 'Critical',
    priorityColor: 'bg-red-50 text-red-700 border-red-200',
    assignee: 'M. Richter (Lead Tech)',
    sla: '4h 12m remaining',
    slaAlert: true,
    status: 'In Progress',
  },
  {
    id: 'WO-8815',
    assetTag: 'COMP-702',
    title: 'Multi-Stage Centrifugal Seal Differential Drop <15 PSI',
    priority: 'Critical',
    priorityColor: 'bg-red-50 text-red-700 border-red-200',
    assignee: 'Alex Chen (Turbomachinery)',
    sla: '6h 40m remaining',
    slaAlert: false,
    status: 'Triaged',
  },
  {
    id: 'WO-8809',
    assetTag: 'PUMP-204-B',
    title: 'Slurry Gland Follower Weepage & High Vibration (4.8 mm/s)',
    priority: 'High',
    priorityColor: 'bg-amber-50 text-amber-700 border-amber-200',
    assignee: 'Tom Technician',
    sla: '18h remaining',
    slaAlert: false,
    status: 'In Progress',
  },
  {
    id: 'WO-8798',
    assetTag: 'TURB-101',
    title: 'Inlet Guide Vane Calibration & Actuator Lube',
    priority: 'Medium',
    priorityColor: 'bg-blue-50 text-blue-700 border-blue-200',
    assignee: 'Sarah Connor',
    sla: '2 days remaining',
    slaAlert: false,
    status: 'Assigned',
  },
];

const RECENT_ALERTS = [
  {
    id: 'ALT-904',
    time: '8m ago',
    assetTag: 'HP-204',
    severity: 'CRITICAL',
    message: 'Oil bath temperature reached 87.2°C (Safety trip threshold: 90°C)',
    code: 'E-2041',
  },
  {
    id: 'ALT-903',
    time: '24m ago',
    assetTag: 'PUMP-204-B',
    severity: 'WARNING',
    message: 'Radial vibration amplitude RMS exceeds ISO 10816 Zone B (4.8 mm/s)',
    code: 'E-VIB-04',
  },
  {
    id: 'ALT-901',
    time: '1h ago',
    assetTag: 'AC-031',
    severity: 'INFO',
    message: 'Air compressor inlet differential filter DP delta normalized after backwash',
    code: 'INF-FLT-OK',
  },
];

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  const { user, organization } = useAuth();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-[#F5F6F7] text-[#1A202C] font-sans antialiased space-y-6">
      {/* Shift-Start Situational Awareness Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#1A202C]">
              Operations Overview
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-[#0F766E] border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0F766E] animate-pulse" />
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            {organization?.name || 'Acme Industrial Operations'} · Shift Lead: <span className="text-gray-900 font-medium">{user?.fullName || 'Shift Supervisor'}</span> · Real-time OEE & asset integrity
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-md px-2.5 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-[#64748B]" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent text-xs text-[#1A202C] font-medium outline-none cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              <option value="PRESS">Press Shop (Unit 4)</option>
              <option value="DISTILLATION">Distillation & Utilities</option>
              <option value="PACKAGING">Packaging Line B</option>
            </select>
          </div>

          {/* Time range selector */}
          <div className="flex bg-white border border-[#CBD5E1] rounded-md p-0.5 shadow-sm">
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition ${
                  timeRange === r
                    ? 'bg-[#151C24] text-white'
                    : 'text-[#64748B] hover:text-[#1A202C]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* S2 Core: 4 Standard KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Registered Assets */}
        <div
          onClick={() => onNavigate('assets')}
          className="p-5 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-sm cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#64748B]">
            <span className="uppercase tracking-wider">Registered Assets</span>
            <Activity className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-[#1A202C] tabular-nums">
              142
            </div>
            <div className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-semibold">+2 verified</span> this week
            </div>
          </div>
          <div className="text-[11px] text-[#2563EB] group-hover:underline flex items-center gap-1 pt-2 border-t border-gray-100">
            View full registry <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Card 2: Operational Healthy */}
        <div
          onClick={() => onNavigate('assets')}
          className="p-5 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-sm cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#0F766E]">
            <span className="uppercase tracking-wider">Operational</span>
            <CheckCircle2 className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-[#0F766E] tabular-nums">
              118
            </div>
            <div className="text-xs text-[#64748B] mt-1">
              <span className="font-semibold text-[#1A202C]">83.1%</span> of fleet within safe nominal limits
            </div>
          </div>
          <div className="text-[11px] text-[#0F766E] group-hover:underline flex items-center gap-1 pt-2 border-t border-gray-100">
            Filter nominal fleet <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Card 3: Attention Required */}
        <div
          onClick={() => onNavigate('assets')}
          className="p-5 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-sm cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#D97706]">
            <span className="uppercase tracking-wider">Attention Required</span>
            <AlertTriangle className="w-4 h-4 text-[#D97706]" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-[#D97706] tabular-nums">
              16
            </div>
            <div className="text-xs text-[#64748B] mt-1">
              Elevated vibration or temperature telemetry
            </div>
          </div>
          <div className="text-[11px] text-[#D97706] group-hover:underline flex items-center gap-1 pt-2 border-t border-gray-100">
            Investigate advisories <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Card 4: Critical Alarms */}
        <div
          onClick={() => onNavigate('maintenance')}
          className="p-5 rounded-lg bg-white border border-red-200 hover:border-red-300 shadow-sm cursor-pointer transition flex flex-col justify-between group bg-red-50/10"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#DC2626]">
            <span className="uppercase tracking-wider">Critical Faults</span>
            <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-[#DC2626] tabular-nums">
              3
            </div>
            <div className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /> Active work orders dispatched
            </div>
          </div>
          <div className="text-[11px] text-[#DC2626] group-hover:underline flex items-center gap-1 pt-2 border-t border-red-100">
            Open critical dispatch <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Row 2: Charts (Availability Trend + Fleet Health Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Availability Trend (Recharts AreaChart) */}
        <div className="lg:col-span-2 p-5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1A202C]">
                Plant OEE & Operational Availability Trend
              </h2>
              <p className="text-xs text-[#64748B]">
                Rolling 7-day average: <span className="font-mono font-semibold text-[#1A202C]">96.8%</span>
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#2563EB]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" /> Availability
              </span>
              <span className="flex items-center gap-1.5 text-[#0F766E]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F766E]" /> OEE %
              </span>
            </div>
          </div>

          <div className="h-60 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={AVAILABILITY_DATA_7D} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="availGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="oeeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0F766E" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0F766E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#94A3B8" tickLine={false} />
                <YAxis domain={[88, 100]} stroke="#94A3B8" tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#151C24',
                    border: '1px solid #243145',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '11px',
                  }}
                />
                <Area type="monotone" dataKey="availability" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#availGrad)" />
                <Area type="monotone" dataKey="oee" stroke="#0F766E" strokeWidth={2} fillOpacity={1} fill="url(#oeeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Asset Health Distribution (Donut Chart) */}
        <div className="p-5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1A202C]">
              Asset Health Distribution
            </h2>
            <p className="text-xs text-[#64748B]">
              Total 142 industrial units monitored
            </p>
          </div>

          <div className="h-44 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={HEALTH_DISTRIBUTION}
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {HEALTH_DISTRIBUTION.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#151C24',
                    border: '1px solid #243145',
                    borderRadius: '6px',
                    color: '#F8FAFC',
                    fontSize: '11px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs font-mono">
            {HEALTH_DISTRIBUTION.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[#64748B] truncate">{item.name}</span>
                <span className="font-bold text-[#1A202C] ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: High Priority Work Orders Queue + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* High Priority Queue (2 Cols) */}
        <div className="lg:col-span-2 p-5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[#151C24]" />
              <h2 className="text-sm font-bold text-[#1A202C]">
                Active Critical Work Orders Queue
              </h2>
            </div>
            <button
              onClick={() => onNavigate('maintenance')}
              className="text-xs text-[#2563EB] hover:underline font-semibold flex items-center gap-1"
            >
              All work orders ({HIGH_PRIORITY_WOS.length}) <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-3">Ticket ID</th>
                  <th className="py-2.5 px-3">Equipment</th>
                  <th className="py-2.5 px-3">Issue Summary</th>
                  <th className="py-2.5 px-3">Assignee</th>
                  <th className="py-2.5 px-3">SLA Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-sans">
                {HIGH_PRIORITY_WOS.map((wo) => (
                  <tr
                    key={wo.id}
                    onClick={() => onNavigate('maintenance')}
                    className="hover:bg-gray-50/80 cursor-pointer transition"
                  >
                    <td className="py-3 px-3 font-mono font-bold text-[#2563EB]">
                      {wo.id}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-gray-900">
                      {wo.assetTag}
                    </td>
                    <td className="py-3 px-3 text-gray-700 max-w-xs truncate">
                      {wo.title}
                    </td>
                    <td className="py-3 px-3 text-gray-600 font-mono text-[11px]">
                      {wo.assignee}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                          wo.slaAlert
                            ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        {wo.sla}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Industrial Alerts */}
        <div className="p-5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D97706]" />
              <h2 className="text-sm font-bold text-[#1A202C]">
                Plant Event Feed
              </h2>
            </div>
            <span className="text-[10px] font-mono text-gray-400">Realtime</span>
          </div>

          <div className="space-y-3 font-sans">
            {RECENT_ALERTS.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-lg border border-gray-100 hover:border-gray-200 bg-gray-50/50 transition space-y-1"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span
                    className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-red-100 text-red-800'
                        : alert.severity === 'WARNING'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {alert.code}
                  </span>
                  <span className="text-gray-400 text-[10px]">{alert.time}</span>
                </div>
                <div className="text-xs font-semibold text-gray-900">
                  {alert.assetTag}
                </div>
                <p className="text-[11px] text-gray-600 leading-snug">
                  {alert.message}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={() => onNavigate('copilot')}
            className="w-full py-2 px-3 rounded-md bg-[#151C24] hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            Investigate with AI Copilot
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

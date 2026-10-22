import React, { useState, useEffect, useCallback } from 'react';
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
  Cloud,
  Server,
  Plus,
  RefreshCw,
  Sparkles,
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

interface OverviewData {
  organization: {
    id: string;
    name: string;
    slug: string;
    deploymentType: 'saas' | 'enterprise';
    industry?: string;
    country?: string;
    createdAt: string;
  };
  metrics: {
    totalAssets: number;
    operationalCount: number;
    attentionCount: number;
    criticalCount: number;
    offlineCount: number;
    totalPlants: number;
    totalMembers: number;
    totalDocuments: number;
    totalActiveWorkOrders: number;
    totalAlerts: number;
    fleetHealthPercentage: number;
    availabilityPercentage: number;
  };
  healthDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  availabilityTrend: Array<{
    day: string;
    oee: number;
    availability: number;
  }>;
  highPriorityWorkOrders: Array<{
    id: string;
    assetTag: string;
    title: string;
    priority: string;
    priorityColor: string;
    assignee: string;
    sla: string;
    slaAlert: boolean;
    status: string;
    createdAt: string;
  }>;
  recentAlerts: Array<{
    id: string;
    time: string;
    assetTag: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
    code: string;
  }>;
  departments: string[];
  onboarding: {
    deploymentType: 'saas' | 'enterprise';
    isFreshWorkspace: boolean;
    hasPlants: boolean;
    hasMachines: boolean;
    hasMembers: boolean;
    hasDocuments: boolean;
    setupProgressPercent: number;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      actionText: string;
      targetModule: string;
      completed: boolean;
    }>;
  };
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  const { user, organization, token } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  const fetchOverview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/org/overview', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error?.message || 'Failed to load organization overview metrics.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error fetching operations overview.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview, organization?.id]);

  if (loading && !data) {
    return (
      <div className="flex-1 p-6 bg-[#F5F6F7] text-[#1A202C] flex items-center justify-center min-h-[500px]">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mx-auto" />
          <p className="text-xs font-mono font-semibold text-gray-500">
            LOADING REAL-TIME OPERATIONS DATA...
          </p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 p-6 bg-[#F5F6F7] text-[#1A202C]">
        <div className="max-w-xl mx-auto p-6 bg-white border border-red-200 rounded-xl shadow-sm text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
          <h2 className="text-base font-bold text-gray-900">Failed to Load Overview Metrics</h2>
          <p className="text-xs text-gray-600">{error}</p>
          <button
            onClick={fetchOverview}
            className="py-2 px-4 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalAssets: 0,
    operationalCount: 0,
    attentionCount: 0,
    criticalCount: 0,
    offlineCount: 0,
    totalPlants: 0,
    totalMembers: 1,
    totalDocuments: 0,
    totalActiveWorkOrders: 0,
    totalAlerts: 0,
    fleetHealthPercentage: 0,
    availabilityPercentage: 0,
  };

  const isFreshWorkspace = Boolean(data?.onboarding?.isFreshWorkspace || metrics.totalAssets === 0);
  const deploymentType = data?.organization?.deploymentType || organization?.deploymentType || 'saas';

  // Filter work orders and alerts by department if selected
  const filteredWorkOrders = data?.highPriorityWorkOrders || [];
  const filteredAlerts = data?.recentAlerts || [];
  const availableDepts = data?.departments || [];

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full h-full p-6 overflow-y-auto bg-[#F5F6F7] text-[#1A202C] font-sans antialiased space-y-6">
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
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                deploymentType === 'enterprise'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {deploymentType === 'enterprise' ? (
                <>
                  <Server className="w-3 h-3 text-emerald-700" />
                  <span>ENTERPRISE SELF-HOSTED</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3 h-3 text-blue-600" />
                  <span>SAAS CLOUD</span>
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            {data?.organization?.name || organization?.name || 'Company Workspace'} · Administrator:{' '}
            <span className="text-gray-900 font-medium">{user?.fullName || 'Root Administrator'}</span> · Verified tenant data isolation
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
              {availableDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
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

          <button
            onClick={fetchOverview}
            title="Refresh Overview"
            className="p-1.5 bg-white border border-[#CBD5E1] rounded-md hover:bg-gray-50 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#64748B] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Fresh Workspace Onboarding Banner (Shown when 0 assets exist) */}
      {isFreshWorkspace && (
        <div className="p-6 rounded-xl bg-gradient-to-br from-white to-gray-50 border border-blue-200 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <img src="/forgex_icon.png" alt="ForgeX AI" className="w-6 h-6 rounded-md object-contain" />
                <h2 className="text-base font-bold text-gray-900">
                  Welcome to Your Clean Company Workspace
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  PRISTINE ENVIRONMENT
                </span>
              </div>
              <p className="text-xs text-gray-600">
                Your organization workspace is securely isolated with zero demo data. Follow the setup checklist to onboard your industrial facilities and operational workforce.
              </p>
            </div>

            <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-xs">
              <div className="text-right">
                <span className="block text-[10px] font-mono font-semibold text-gray-500 uppercase">
                  Setup Progress
                </span>
                <span className="text-sm font-bold font-mono text-gray-900">
                  {data?.onboarding?.setupProgressPercent || 20}% Complete
                </span>
              </div>
              <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${data?.onboarding?.setupProgressPercent || 20}%` }}
                />
              </div>
            </div>
          </div>

          {/* Onboarding Checklist Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-gray-100">
            {data?.onboarding?.steps?.map((step, idx) => (
              <div
                key={step.id}
                onClick={() => onNavigate(step.targetModule)}
                className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col justify-between group ${
                  step.completed
                    ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                    : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono text-[10px] font-bold text-gray-400">
                      STEP 0{idx + 1}
                    </span>
                    {step.completed ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        Pending
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-gray-900 group-hover:text-blue-600 transition">
                    {step.title}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                    {step.description}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] font-semibold text-blue-600 group-hover:underline">
                  <span>{step.actionText}</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Standard KPI Stat Cards (Real Data or Genuine Zero) */}
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
              {metrics.totalAssets}
            </div>
            <div className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
              {metrics.totalAssets > 0 ? (
                <>
                  <span className="text-emerald-600 font-semibold">{metrics.totalAssets} active</span> units monitored
                </>
              ) : (
                <span className="text-gray-400 italic">No equipment registered yet</span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-[#2563EB] group-hover:underline flex items-center gap-1 pt-2 border-t border-gray-100">
            {metrics.totalAssets > 0 ? 'View full asset registry' : 'Add your first machine'}{' '}
            <ArrowRight className="w-3 h-3" />
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
              {metrics.operationalCount}
            </div>
            <div className="text-xs text-[#64748B] mt-1">
              {metrics.totalAssets > 0 ? (
                <>
                  <span className="font-semibold text-[#1A202C]">{metrics.fleetHealthPercentage}%</span> of fleet within safe limits
                </>
              ) : (
                <span className="text-gray-400 italic">Awaiting equipment telemetry</span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-[#0F766E] group-hover:underline flex items-center gap-1 pt-2 border-t border-gray-100">
            {metrics.totalAssets > 0 ? 'Filter nominal units' : 'Configure telemetry'} <ArrowRight className="w-3 h-3" />
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
              {metrics.attentionCount}
            </div>
            <div className="text-xs text-[#64748B] mt-1">
              {metrics.attentionCount > 0
                ? 'Elevated vibration or temperature telemetry'
                : 'Zero equipment advisories active'}
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
              {metrics.criticalCount}
            </div>
            <div className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
              {metrics.criticalCount > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /> Active work orders dispatched
                </>
              ) : (
                <span className="text-emerald-700 font-normal">Safe nominal state · Zero critical trips</span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-[#DC2626] group-hover:underline flex items-center gap-1 pt-2 border-t border-red-100">
            Open critical dispatch <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Row 2: Charts (Availability Trend + Fleet Health Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Availability Trend (Recharts AreaChart or Empty State) */}
        <div className="lg:col-span-2 p-5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1A202C]">
                Plant OEE & Operational Availability Trend
              </h2>
              <p className="text-xs text-[#64748B]">
                {data?.availabilityTrend && data.availabilityTrend.length > 0 ? (
                  <>
                    Rolling average: <span className="font-mono font-semibold text-[#1A202C]">{metrics.fleetHealthPercentage}%</span>
                  </>
                ) : (
                  'Real-time industrial operational telemetry stream'
                )}
              </p>
            </div>
            {data?.availabilityTrend && data.availabilityTrend.length > 0 && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-[#2563EB]">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" /> Availability
                </span>
                <span className="flex items-center gap-1.5 text-[#0F766E]">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#0F766E]" /> OEE %
                </span>
              </div>
            )}
          </div>

          {data?.availabilityTrend && data.availabilityTrend.length > 0 ? (
            <div className="h-60 w-full font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.availabilityTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  <YAxis domain={[60, 100]} stroke="#94A3B8" tickLine={false} />
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
          ) : (
            <div className="h-60 w-full flex flex-col items-center justify-center p-6 bg-gray-50/60 border border-dashed border-gray-200 rounded-lg text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-900">No Telemetry Streamed Yet</h3>
                <p className="text-[11px] text-gray-500 max-w-sm mx-auto mt-1">
                  Availability and OEE trendlines graph automatically once monitored equipment is registered and begins reporting operational status.
                </p>
              </div>
              <button
                onClick={() => onNavigate('assets')}
                className="py-1.5 px-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-semibold rounded-md shadow-xs transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Machine Asset</span>
              </button>
            </div>
          )}
        </div>

        {/* Asset Health Distribution (Donut Chart or Empty State) */}
        <div className="p-5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#1A202C]">
              Asset Health Distribution
            </h2>
            <p className="text-xs text-[#64748B]">
              Total {metrics.totalAssets} industrial units monitored
            </p>
          </div>

          {data?.healthDistribution && data.healthDistribution.length > 0 ? (
            <>
              <div className="h-44 my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.healthDistribution}
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {data.healthDistribution.map((entry, index) => (
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
                {data.healthDistribution.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[#64748B] truncate">{item.name}</span>
                    <span className="font-bold text-[#1A202C] ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-56 my-2 flex flex-col items-center justify-center p-4 bg-gray-50/60 border border-dashed border-gray-200 rounded-lg text-center space-y-2.5">
              <div className="w-16 h-16 rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center font-mono font-bold text-xs text-gray-400">
                0 Units
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Fleet Health Empty</h4>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  Operational, Attention, Critical, and Offline breakdown will calculate here once assets are added.
                </p>
              </div>
            </div>
          )}
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
                Active Work Orders Queue
              </h2>
            </div>
            <button
              onClick={() => onNavigate('maintenance')}
              className="text-xs text-[#2563EB] hover:underline font-semibold flex items-center gap-1"
            >
              All work orders ({filteredWorkOrders.length}) <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {filteredWorkOrders.length > 0 ? (
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
                  {filteredWorkOrders.map((wo) => (
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
          ) : (
            <div className="py-12 px-4 bg-gray-50/60 border border-dashed border-gray-200 rounded-lg text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#0F766E] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-900">No Open Work Orders</h3>
                <p className="text-[11px] text-gray-500 max-w-sm mx-auto mt-1">
                  There are currently no maintenance dispatches or critical equipment incidents recorded for this workspace.
                </p>
              </div>
              <button
                onClick={() => onNavigate('maintenance')}
                className="py-1.5 px-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-semibold rounded-md shadow-xs transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Maintenance Case</span>
              </button>
            </div>
          )}
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

          {filteredAlerts.length > 0 ? (
            <div className="space-y-3 font-sans">
              {filteredAlerts.map((alert) => (
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
          ) : (
            <div className="py-12 px-4 bg-gray-50/60 border border-dashed border-gray-200 rounded-lg text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h4 className="text-xs font-bold text-gray-900">Plant Feed Clear</h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Zero anomaly alerts or diagnostic alarm trips logged. Operational telemetry is completely nominal.
              </p>
            </div>
          )}

          <button
            onClick={() => onNavigate('copilot')}
            className="w-full py-2 px-3 rounded-md bg-[#151C24] hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Investigate with AI Copilot</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverviewView;

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  BarChart3,
  Download,
  Filter,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
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

interface DowntimeEntry {
  machine: string;
  downtimeHrs: number;
  faults: number;
}

interface MttrEntry {
  month: string;
  mttrMinutes: number;
}

interface TechWorkloadEntry {
  name: string;
  role: string;
  closedTickets: number;
  activeHours: number;
}

interface ReportsData {
  downtimeByMachine: DowntimeEntry[];
  totalDowntimeHours: number;
  mttrTrend: MttrEntry[];
  techWorkload: TechWorkloadEntry[];
  totalMachines: number;
  totalRecords: number;
  totalCases: number;
}

export const ReportsAnalyticsView: React.FC<{
  onDrillDown?: (machine: string) => void;
}> = ({ onDrillDown }) => {
  const { organization, token } = useAuth();
  const [selectedPlant, setSelectedPlant] = useState('ALL');
  const [plants, setPlants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportsData, setReportsData] = useState<ReportsData | null>(null);

  // Fetch plants for filter dropdown
  useEffect(() => {
    if (!token || !organization?.id) return;
    let isMounted = true;
    fetch('/api/v1/plants', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-organization-id': organization.id,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted && json?.data && Array.isArray(json.data)) {
          setPlants(json.data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [token, organization?.id]);

  // Fetch real tenant reports data
  const fetchReports = useCallback(async () => {
    if (!token || !organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      const url =
        selectedPlant === 'ALL'
          ? '/api/v1/org/reports'
          : `/api/v1/org/reports?plantId=${encodeURIComponent(selectedPlant)}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setReportsData(json.data);
      } else {
        setError(json.error?.message || 'Unable to retrieve organization analytics.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error fetching live reports.');
    } finally {
      setLoading(false);
    }
  }, [token, organization?.id, selectedPlant]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const exportCsv = () => {
    if (!reportsData || reportsData.downtimeByMachine.length === 0) {
      alert('No downtime records to export for this organization.');
      return;
    }
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Machine,DowntimeHours,FaultsCount\n' +
      reportsData.downtimeByMachine.map((e) => `${e.machine},${e.downtimeHrs},${e.faults}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `forgex_downtime_report_${organization?.slug || 'tenant'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasDowntimeData = (reportsData?.downtimeByMachine?.length ?? 0) > 0;
  const hasMttrData = (reportsData?.mttrTrend?.length ?? 0) > 0;
  const hasTechData = (reportsData?.techWorkload?.length ?? 0) > 0;
  const totalMachines = reportsData?.totalMachines ?? 0;
  const isCompletelyEmpty = !hasDowntimeData && !hasMttrData && totalMachines === 0;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-y-auto bg-[#F5F6F7] text-[#1A202C] font-sans antialiased p-6 space-y-6">
      {/* Header with Export & Plant Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] bg-white p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#151C24] text-white flex items-center justify-center shadow-sm">
            <BarChart3 className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#1A202C]">
                Operational Intelligence & Reliability Analytics
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                LIVE TENANT DATA
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              {organization?.name || 'Workspace'} · OEE availability trends · MTTR benchmark · Machine downtime Pareto
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
              <option value="ALL">All Authorized Plants</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchReports}
            title="Refresh Analytics"
            disabled={loading}
            className="p-2 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-700 rounded transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={exportCsv}
            disabled={!hasDowntimeData}
            className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-700 font-semibold rounded flex items-center gap-1.5 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && !reportsData && (
        <div className="p-16 text-center bg-white rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin text-center" />
          <p className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">
            Loading Tenant Analytics & Aggregating Records...
          </p>
        </div>
      )}

      {/* Completely Fresh Workspace: Zero Data State */}
      {!loading && isCompletelyEmpty && (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4 max-w-3xl mx-auto my-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-[#1A202C]">
              No Operational Downtime or Maintenance Records
            </h3>
            <p className="text-xs text-[#64748B] max-w-xl mx-auto leading-relaxed">
              Your workspace for <strong>{organization?.name || 'this organization'}</strong> is securely isolated with zero demo data. Cumulative downtime Pareto distributions, MTTR resolution curves, and technician workloads will populate here automatically as your team registers machines and logs work orders.
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => onDrillDown?.('register')}
              className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-2"
            >
              <Cpu className="w-4 h-4" /> Register First Machine
            </button>
          </div>
        </div>
      )}

      {/* Real Data View */}
      {(!isCompletelyEmpty || (reportsData && totalMachines > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Chart 1: Downtime by Machine (Pareto Bar) */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1A202C]">
                  Cumulative Downtime by Machine (Hours)
                </h2>
                <p className="text-xs text-[#64748B]">
                  {hasDowntimeData
                    ? 'Actual recorded downtime from organization maintenance records'
                    : 'All registered machinery currently operating without recorded downtime'}
                </p>
              </div>
              <span className="text-xs font-mono text-gray-500 font-semibold">
                Total: {reportsData?.totalDowntimeHours || 0}h
              </span>
            </div>

            {hasDowntimeData ? (
              <div className="h-64 w-full font-mono text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportsData!.downtimeByMachine} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      onClick={(entry: any) => onDrillDown?.(entry?.machine || '')}
                      className="cursor-pointer hover:opacity-85 transition"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 w-full flex flex-col items-center justify-center rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center p-6 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <div className="text-xs font-bold text-[#1A202C]">Zero Machine Downtime Logged</div>
                <p className="text-[11px] text-[#64748B] max-w-sm">
                  No equipment has experienced fault downtime in this reporting period across {totalMachines} registered machine{totalMachines === 1 ? '' : 's'}.
                </p>
              </div>
            )}
          </div>

          {/* Chart 2: MTTR (Mean Time to Repair) Reduction Trend */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1A202C]">
                  Mean Time to Repair (MTTR) Trend
                </h2>
                <p className="text-xs text-[#64748B]">
                  {hasMttrData
                    ? 'Calculated from resolved tickets and closed work orders'
                    : 'Requires completed maintenance cases to compute average repair velocity'}
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400">Minutes</span>
            </div>

            {hasMttrData ? (
              <div className="h-64 w-full font-mono text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reportsData!.mttrTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            ) : (
              <div className="h-64 w-full flex flex-col items-center justify-center rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center p-6 space-y-2">
                <Clock className="w-8 h-8 text-blue-500" />
                <div className="text-xs font-bold text-[#1A202C]">No Closed Work Orders Yet</div>
                <p className="text-[11px] text-[#64748B] max-w-sm">
                  MTTR curves require at least one closed maintenance case to calculate resolution duration.
                </p>
              </div>
            )}
          </div>

          {/* Chart 3: Technician Workload Distribution */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1A202C]">
                  Technician Work Order Closure & Intervention Hours
                </h2>
                <p className="text-xs text-[#64748B]">
                  Real team members assigned to industrial operations in {organization?.name || 'this organization'}
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400">
                {reportsData?.techWorkload?.length || 0} Registered Specialists
              </span>
            </div>

            {hasTechData ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {reportsData!.techWorkload.map((t) => (
                  <div key={t.name} className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs text-gray-900 truncate max-w-[160px]">{t.name}</div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                        {t.role.replace(/_/g, ' ')}
                      </span>
                    </div>
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
            ) : (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 space-y-2">
                <Layers className="w-7 h-7 text-gray-400 mx-auto" />
                <div className="text-xs font-bold text-[#1A202C]">No Operational Members Registered</div>
                <p className="text-[11px] text-[#64748B]">
                  Add technicians, engineers, or operators in Team & Access to monitor field workload distribution.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsAnalyticsView;

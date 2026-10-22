import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Wrench,
  Clock,
  FileText,
  ShieldAlert,
  Filter,
  Check,
  Play,
  Cpu,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface TechTask {
  id: string;
  assetTag: string;
  assetName: string;
  title: string;
  priority: 'Critical' | 'High' | 'Medium';
  status: 'In Progress' | 'Assigned' | 'Pending Parts' | 'Resolved';
  dueTime: string;
  sopDocument: string;
  lotoRequired: boolean;
  stepsCount: number;
  completedSteps: number;
}

export const TechnicianWorkspaceView: React.FC<{
  onLaunchSop?: (ticketId: string) => void;
  onNavigateToCopilot?: (assetTag: string) => void;
}> = ({ onLaunchSop, onNavigateToCopilot }) => {
  const { user, token, organization } = useAuth();
  const [tasks, setTasks] = useState<TechTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<TechTask | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      if (organization?.id) {
        headers['x-organization-id'] = organization.id;
      }

      const res = await fetch('/api/v1/maintenance/cases', { headers });
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const mapped: TechTask[] = json.data.map((c: any) => {
          const checklist = Array.isArray(c.checklist) ? c.checklist : [];
          const completedCount = checklist.filter((s: any) => s.status === 'COMPLETED').length;
          const hasLoto = checklist.some((s: any) => s.requiresLoto || s.title?.toLowerCase().includes('loto'));
          const prio =
            c.severity === 'CRITICAL' ? 'Critical' : c.severity === 'HIGH' ? 'High' : 'Medium';
          const stat =
            c.status === 'RESOLVED' || c.status === 'CLOSED'
              ? 'Resolved'
              : c.status === 'IN_PROGRESS'
              ? 'In Progress'
              : c.status === 'PENDING_PARTS'
              ? 'Pending Parts'
              : 'Assigned';

          return {
            id: c.caseNumber || c.id.slice(0, 8).toUpperCase(),
            assetTag: c.assetId || 'ASSET-GEN',
            assetName: c.title || 'Industrial Asset',
            title: c.symptomDescription || c.title || 'Scheduled Work Order',
            priority: prio,
            status: stat,
            dueTime: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Today',
            sopDocument: c.diagnosticHypothesis?.evidenceCitations?.[0]?.documentTitle || 'Standard Maintenance Procedure',
            lotoRequired: hasLoto,
            stepsCount: checklist.length > 0 ? checklist.length : 4,
            completedSteps: completedCount,
          };
        });

        setTasks(mapped);
        if (mapped.length > 0) {
          setSelectedTask(mapped[0]);
        } else {
          setSelectedTask(null);
        }
      } else {
        setTasks([]);
        setSelectedTask(null);
      }
    } catch (err) {
      console.error('Failed to load technician queue:', err);
      setTasks([]);
      setSelectedTask(null);
    } finally {
      setLoading(false);
    }
  }, [token, organization?.id]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const filteredQueue = tasks.filter(
    (t) => filterPriority === 'ALL' || t.priority === filterPriority
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans antialiased">
      {/* Top Header */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
            <Wrench className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#1A202C] leading-tight">
              Technician Field Workspace · My Execution Queue
            </h1>
            <p className="text-xs text-[#64748B]">
              Logged in as <span className="font-semibold text-gray-900">{user?.fullName || 'Field Technician'}</span> · Active dispatch & authorized SOP work orders
            </p>
          </div>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded px-2.5 py-1">
            <Filter className="w-3 h-3 text-[#64748B]" />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-transparent text-xs text-[#1A202C] font-medium outline-none cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-[#2563EB] animate-spin mx-auto" />
            <p className="text-xs font-mono text-gray-500">Loading technician work order queue...</p>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-xl border border-[#E2E8F0] p-8 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Work Order Queue is Clear</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              There are no active or assigned maintenance cases in your organization right now. Newly reported equipment anomalies or scheduled preventive maintenance orders will appear here automatically.
            </p>
            <div className="pt-2">
              <button
                onClick={fetchQueue}
                className="px-4 py-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Queue
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Main Split: Queue (Left 440px) + Focused Task Context (Right) */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: Task Queue Cards */}
          <div className="w-full lg:w-[440px] border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white p-4 overflow-y-auto space-y-3 shrink-0 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1 font-semibold uppercase">
              <span>Dispatched Work Orders ({filteredQueue.length})</span>
              <span>Priority Sort</span>
            </div>

            {filteredQueue.map((task) => {
              const isSelected = selectedTask?.id === task.id;
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`p-4 rounded-lg border transition cursor-pointer text-xs space-y-2.5 ${
                    isSelected
                      ? 'bg-blue-50/50 border-[#2563EB] ring-1 ring-[#2563EB]/20 shadow-sm'
                      : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#2563EB]">{task.id}</span>
                      <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                        {task.assetTag}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        task.priority === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                          : task.priority === 'High'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>

                  <div className="font-semibold text-gray-900 leading-snug">
                    {task.title}
                  </div>

                  <div className="flex items-center justify-between text-gray-500 font-mono text-[11px] pt-1 border-t border-gray-100">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      Due: {task.dueTime}
                    </span>
                    <span>
                      Steps: <strong>{task.completedSteps}/{task.stepsCount}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Focused Active Task Execution Pane */}
          {selectedTask ? (
            <div className="flex-1 min-h-0 min-w-0 p-6 overflow-y-auto space-y-6 w-full">
              <div className="bg-white rounded-lg border border-[#E2E8F0] p-6 shadow-sm space-y-5">
                {/* Task Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-[#2563EB]">
                        {selectedTask.id}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="font-mono text-sm font-bold text-gray-900">
                        {selectedTask.assetTag}
                      </span>
                      <span className="text-xs text-gray-500">({selectedTask.assetName})</span>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {selectedTask.title}
                    </h2>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {selectedTask.lotoRequired && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-50 text-red-700 border border-red-200 text-xs font-mono font-bold">
                        <ShieldAlert className="w-3.5 h-3.5" /> LOTO MANDATORY
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono font-bold">
                      {selectedTask.status}
                    </span>
                  </div>
                </div>

                {/* Governing Procedure Card */}
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                  <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block">
                    Governing Authorized Engineering Procedure
                  </span>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
                      <FileText className="w-4 h-4 text-[#2563EB]" />
                      <span>{selectedTask.sopDocument}</span>
                    </div>
                    <button
                      onClick={() => onLaunchSop?.(selectedTask.id)}
                      className="px-3 py-1.5 rounded bg-[#151C24] hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Play className="w-3 h-3 text-emerald-400" />
                      Launch Step-by-Step SOP
                    </button>
                  </div>
                </div>

                {/* Checklist Progress */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-gray-700 uppercase">Procedure Progress</span>
                    <span className="font-bold text-[#2563EB]">
                      {Math.round((selectedTask.completedSteps / Math.max(1, selectedTask.stepsCount)) * 100)}% Complete
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                    <div
                      className="h-full bg-[#0F766E] transition-all duration-300"
                      style={{
                        width: `${(selectedTask.completedSteps / Math.max(1, selectedTask.stepsCount)) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Action Bar */}
                <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => onNavigateToCopilot?.(selectedTask.assetTag)}
                    className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#2563EB]" />
                    Ask Copilot for Specifications
                  </button>

                  <button
                    onClick={() => onLaunchSop?.(selectedTask.id)}
                    className="px-4 py-2 bg-[#0F766E] hover:bg-[#0d635c] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    Signoff Active Step & Next
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-gray-400 text-xs font-mono">
              Select a work order from the queue to view procedural instructions
            </div>
          )}
        </div>
      )}
    </div>
  );
};

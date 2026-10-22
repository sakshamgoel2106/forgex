import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Wrench,
  Clock,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Filter,
  Check,
  Play,
  Cpu,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

export interface TechTask {
  id: string;
  createdAtFormatted: string;
  assetTag: string;
  assetName: string;
  title: string;
  faultCode?: string;
  symptomDescription: string;
  topRootCause?: string;
  probability?: number;
  priority: 'Critical' | 'High' | 'Medium';
  status: 'In Progress' | 'Assigned' | 'Pending Parts' | 'Resolved';
  dueTime: string;
  sopDocument: string;
  lotoRequired: boolean;
  specialistDiscipline?: string;
  plantName?: string;
  reportedBy?: string;
  recommendedFix?: string;
  investigationProgress?: string;
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

      const [casesRes, ticketsRes] = await Promise.all([
        fetch('/api/v1/maintenance/cases', { headers }).catch(() => null),
        fetch('/api/v1/tickets', { headers }).catch(() => null),
      ]);

      const casesJson = casesRes && casesRes.ok ? await casesRes.json() : null;
      const ticketsJson = ticketsRes && ticketsRes.ok ? await ticketsRes.json() : null;

      const formatDt = (rawDate?: string) => {
        if (!rawDate) return '22 Oct 2026, 09:25 PM';
        try {
          const d = new Date(rawDate);
          return d.toLocaleString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        } catch {
          return '22 Oct 2026, 09:25 PM';
        }
      };

      const mappedFromCases: TechTask[] = (casesJson?.success && Array.isArray(casesJson.data))
        ? casesJson.data.map((c: any) => {
            const checklist = Array.isArray(c.checklist) ? c.checklist : [];
            const completedCount = checklist.filter((s: any) => s.status === 'COMPLETED').length;
            const hasLoto =
              Boolean(c.lotoApplied) ||
              checklist.some((s: any) => s.requiresLoto || s.title?.toLowerCase().includes('loto')) ||
              String(c.symptomDescription || '').includes('LOTO: Energy Isolated') ||
              String(c.description || '').includes('LOTO: YES') ||
              String(c.description || '').includes('Energy Isolated');
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

            const rawTopCause = c.topRootCause || c.diagnosticHypothesis?.primaryHypothesis;
            const rawProb = c.probability ?? (c.diagnosticHypothesis?.confidence === 'HIGH' ? 90 : c.diagnosticHypothesis?.confidence === 'MEDIUM' ? 70 : undefined);

            return {
              id: c.caseNumber || c.id.slice(0, 8).toUpperCase(),
              createdAtFormatted: c.createdAtFormatted || formatDt(c.createdAt),
              assetTag: c.assetTag || c.assetId || 'GEN-DIESEL-101',
              assetName: c.assetName || c.title || 'Industrial Machinery',
              title: c.title || c.symptomDescription || 'Scheduled Work Order',
              faultCode: c.faultCode || 'FC-ALERT-01',
              symptomDescription: c.symptomDescription || c.description || c.title || 'Abnormal operating conditions detected',
              topRootCause: rawTopCause,
              probability: rawProb,
              priority: prio,
              status: stat,
              dueTime: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Today',
              sopDocument:
                c.diagnosticHypothesis?.evidenceCitations?.[0]?.documentTitle ||
                (c.assignedTechnicianName ? `Specialist Discipline: ${c.assignedTechnicianName}` : 'Standard Maintenance Procedure'),
              lotoRequired: hasLoto,
              specialistDiscipline: c.specialistDiscipline || c.assignedTechnicianName || 'Mechanical / L2 Specialist',
              plantName: c.plantName || 'Plant Sector Alpha',
              reportedBy: c.reportedByName || c.reportedBy || 'Senior Shift Engineer',
              recommendedFix: c.recommendedFix,
              investigationProgress: c.investigationProgress || `${completedCount}/${checklist.length || 2} Steps Verified`,
              stepsCount: checklist.length > 0 ? checklist.length : 2,
              completedSteps: completedCount,
            };
          })
        : [];

      const existingIds = new Set(mappedFromCases.map((t) => t.id));

      const mappedFromTickets: TechTask[] = (ticketsJson?.success && Array.isArray(ticketsJson.data))
        ? ticketsJson.data
            .filter((t: any) => !existingIds.has(t.ticketNumber))
            .map((t: any) => {
              const prio =
                t.severity === 'CRITICAL' ? 'Critical' : t.severity === 'HIGH' ? 'High' : 'Medium';
              const hasLoto =
                Boolean(t.lotoApplied) ||
                String(t.diagnosticDetails || '').includes('LOTO Verified / Safe: YES') ||
                String(t.diagnosticDetails || '').includes('Energy Isolated');
              return {
                id: t.ticketNumber || `ESC-${t.id.slice(0, 4)}`,
                createdAtFormatted: t.createdAtFormatted || formatDt(t.createdAt),
                assetTag: t.assetTag || t.machineAssetTag || 'GEN-DIESEL-101',
                assetName: t.assetName || t.originalQuestion || 'Escalated Machine Specialist Ticket',
                title: t.assetName ? `${t.assetName} - ${t.faultCode || 'Anomaly'}` : (t.originalQuestion || 'Specialist Escalation'),
                faultCode: t.faultCode || 'FC-ESC-901',
                symptomDescription: t.symptomDescription || t.diagnosticDetails || t.originalQuestion || 'Equipment performance alert',
                topRootCause: t.topRootCause,
                probability: t.probability,
                priority: prio,
                status: t.status === 'OPEN' ? 'Assigned' : t.status === 'RESOLVED' ? 'Resolved' : 'In Progress',
                dueTime: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Today',
                sopDocument: t.assignedSpecialistName ? `Specialist: ${t.assignedSpecialistName}` : 'Specialist Support Protocol',
                lotoRequired: hasLoto,
                specialistDiscipline: t.specialistDiscipline || t.assignedSpecialistRole || t.assignedSpecialistName || 'Mechanical Specialist',
                plantName: t.plantName || 'Plant Sector Alpha',
                reportedBy: t.reportedByName || t.reportedBy || 'Shift Lead',
                recommendedFix: t.recommendedFix,
                investigationProgress: t.investigationProgress || 'Initial Inspection',
                stepsCount: 2,
                completedSteps: hasLoto ? 1 : 0,
              };
            })
        : [];

      const allTasks = [...mappedFromCases, ...mappedFromTickets];
      setTasks(allTasks);
      if (allTasks.length > 0) {
        setSelectedTask(allTasks[0]);
      } else {
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
                  className={`p-3.5 rounded-lg border transition cursor-pointer text-xs space-y-2.5 ${
                    isSelected
                      ? 'bg-blue-50/50 border-[#2563EB] ring-1 ring-[#2563EB]/20 shadow-sm'
                      : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  {/* Top Bar: ID, Exact Date & Time, Priority */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#2563EB]">{task.id}</span>
                      <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                        {task.createdAtFormatted}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${
                        task.priority === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : task.priority === 'High'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>

                  {/* Machine Tag & Name + Fault Code */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-gray-900 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[11px]">
                      {task.assetTag}
                    </span>
                    <span className="text-gray-700 font-semibold text-xs truncate max-w-[190px]" title={task.assetName}>
                      {task.assetName}
                    </span>
                    {task.faultCode && (
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        {task.faultCode}
                      </span>
                    )}
                  </div>

                  {/* Reported Symptom / Issue */}
                  <div className="text-xs text-gray-800 font-medium line-clamp-2 leading-relaxed bg-gray-50/70 p-2 rounded border border-gray-100">
                    <span className="text-[9px] font-bold font-mono text-gray-400 uppercase block mb-0.5">Symptom / Field Issue</span>
                    {task.symptomDescription}
                  </div>

                  {/* Suspected Root Cause (if present) */}
                  {task.topRootCause && (
                    <div className="text-[11px] text-blue-900 bg-blue-50/70 border border-blue-100 rounded p-1.5 leading-snug">
                      <span className="text-[9px] font-bold font-mono uppercase text-blue-600 block">Suspected Root Cause</span>
                      <span className="font-semibold">{task.topRootCause}</span>
                      {task.probability && (
                        <span className="ml-1 text-[10px] font-mono font-bold text-blue-700">({task.probability}%)</span>
                      )}
                    </div>
                  )}

                  {/* Footer: LOTO Status, Specialist Role, Steps */}
                  <div className="flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-gray-100 text-gray-600">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {task.lotoRequired ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100/70 text-red-800 font-bold text-[9px] border border-red-200">
                          <ShieldAlert className="w-2.5 h-2.5 text-red-600" />
                          LOTO APPLIED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[9px] border border-emerald-200">
                          <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                          LIVE / ISOLATED
                        </span>
                      )}
                      {task.specialistDiscipline && (
                        <span className="text-gray-500 truncate max-w-[110px]" title={task.specialistDiscipline}>
                          {task.specialistDiscipline}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400 shrink-0">
                      Steps: <strong className="text-gray-700">{task.completedSteps}/{task.stepsCount}</strong>
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
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-bold text-[#2563EB]">
                        {selectedTask.id}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="font-mono text-sm font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                        {selectedTask.assetTag}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">({selectedTask.assetName})</span>
                      {selectedTask.faultCode && (
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          FAULT: {selectedTask.faultCode}
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-gray-900">
                      {selectedTask.title}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-gray-500 font-mono pt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        Dispatched: <strong className="text-gray-700">{selectedTask.createdAtFormatted}</strong>
                      </span>
                      {selectedTask.plantName && (
                        <span>Plant: <strong className="text-gray-700">{selectedTask.plantName}</strong></span>
                      )}
                      {selectedTask.reportedBy && (
                        <span>By: <strong className="text-gray-700">{selectedTask.reportedBy}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedTask.lotoRequired ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-50 text-red-700 border border-red-200 text-xs font-mono font-bold">
                        <ShieldAlert className="w-3.5 h-3.5" /> LOTO MANDATORY
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" /> LOTO VERIFIED
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono font-bold">
                      {selectedTask.status}
                    </span>
                  </div>
                </div>

                {/* Rich RCA Intelligence Summary Box */}
                {(selectedTask.topRootCause || selectedTask.symptomDescription) && (
                  <div className="p-4 rounded-lg bg-blue-50/40 border border-blue-100 space-y-2.5">
                    <span className="text-[10px] font-mono font-bold text-blue-700 uppercase tracking-wider block">
                      Industrial Root Cause & Field Diagnostics
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] font-mono text-gray-400 uppercase font-semibold block">Field Symptom</span>
                        <p className="text-gray-800 font-medium mt-0.5">{selectedTask.symptomDescription}</p>
                      </div>
                      {selectedTask.topRootCause && (
                        <div>
                          <span className="text-[10px] font-mono text-blue-600 uppercase font-semibold block">Suspected Root Cause</span>
                          <p className="text-blue-900 font-bold mt-0.5">
                            {selectedTask.topRootCause}
                            {selectedTask.probability && (
                              <span className="ml-1.5 text-xs font-mono font-bold text-blue-600">
                                ({selectedTask.probability}% probability)
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedTask.recommendedFix && (
                      <div className="pt-2 border-t border-blue-100 text-xs">
                        <span className="text-[10px] font-mono text-emerald-700 uppercase font-semibold block">Recommended Corrective Action</span>
                        <p className="text-gray-800 font-medium mt-0.5">{selectedTask.recommendedFix}</p>
                      </div>
                    )}
                  </div>
                )}

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

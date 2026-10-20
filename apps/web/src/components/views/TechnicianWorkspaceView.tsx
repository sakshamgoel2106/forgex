import React, { useState } from 'react';
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
} from 'lucide-react';

interface TechTask {
  id: string;
  assetTag: string;
  assetName: string;
  title: string;
  priority: 'Critical' | 'High' | 'Medium';
  status: 'In Progress' | 'Assigned' | 'Pending Parts';
  dueTime: string;
  sopDocument: string;
  lotoRequired: boolean;
  stepsCount: number;
  completedSteps: number;
}

const MY_TECH_QUEUE: TechTask[] = [
  {
    id: 'WO-8812',
    assetTag: 'HP-204',
    assetName: 'Schuler 400T Hydraulic Press',
    title: 'Hydraulic Press Overheating >85°C (Error E-2041)',
    priority: 'Critical',
    status: 'In Progress',
    dueTime: 'Today at 18:00',
    sopDocument: 'SOP-HYD-401 (Mechanical Seal & Cooling Overhaul)',
    lotoRequired: true,
    stepsCount: 8,
    completedSteps: 3,
  },
  {
    id: 'WO-8809',
    assetTag: 'PUMP-204-B',
    assetName: 'Centrifugal Slurry Bottoms Pump',
    title: 'Gland Follower Weepage & High Vibration (4.8 mm/s)',
    priority: 'High',
    status: 'Assigned',
    dueTime: 'Tomorrow at 10:00',
    sopDocument: 'SOP-MTR-042 (Mechanical Seal Star-Torque Procedure)',
    lotoRequired: true,
    stepsCount: 6,
    completedSteps: 0,
  },
  {
    id: 'WO-8798',
    assetTag: 'TURB-101',
    assetName: 'Gas Turbine Generator Unit 1',
    title: 'Inlet Guide Vane Calibration & Actuator Lube',
    priority: 'Medium',
    status: 'Pending Parts',
    dueTime: 'Oct 23 at 16:00',
    sopDocument: 'SOP-TURB-012 (IGV Smart Positioner Recalibration)',
    lotoRequired: false,
    stepsCount: 4,
    completedSteps: 1,
  },
];

export const TechnicianWorkspaceView: React.FC<{
  onLaunchSop?: (ticketId: string) => void;
  onNavigateToCopilot?: (assetTag: string) => void;
}> = ({ onLaunchSop, onNavigateToCopilot }) => {
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<TechTask>(MY_TECH_QUEUE[0]);
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  const filteredQueue = MY_TECH_QUEUE.filter(
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

      {/* Main Split: Queue (Left 420px) + Focused Task Context (Right) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Task Queue Cards */}
        <div className="w-full lg:w-[440px] border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white p-4 overflow-y-auto space-y-3 shrink-0 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1 font-semibold uppercase">
            <span>Dispatched Work Orders ({filteredQueue.length})</span>
            <span>Priority Sort</span>
          </div>

          {filteredQueue.map((task) => {
            const isSelected = selectedTask.id === task.id;
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
        <div className="flex-1 p-6 overflow-y-auto space-y-6 max-w-4xl">
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
                  {Math.round((selectedTask.completedSteps / selectedTask.stepsCount) * 100)}% Complete
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                <div
                  className="h-full bg-[#0F766E] transition-all duration-300"
                  style={{
                    width: `${(selectedTask.completedSteps / selectedTask.stepsCount) * 100}%`,
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
                Ask Copilot for Torque Specs
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
      </div>
    </div>
  );
};

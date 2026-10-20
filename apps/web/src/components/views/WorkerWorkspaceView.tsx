import React, { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  HardHat,
  AlertTriangle,
  FileCheck2,
  CheckCircle2,
  Send,
  ArrowRight,
} from 'lucide-react';

interface WorkerMachine {
  assetTag: string;
  name: string;
  area: string;
  status: 'OPERATIONAL' | 'ADVISORY' | 'CRITICAL';
}

interface WorkerTicket {
  id: string;
  date: string;
  machine: string;
  issue: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
}

const MY_ASSIGNED_MACHINES: WorkerMachine[] = [
  {
    assetTag: 'HP-204',
    name: 'Hydraulic Press 400T (Schuler)',
    area: 'Press Shop Line 1',
    status: 'ADVISORY',
  },
  {
    assetTag: 'CONV-102',
    name: 'Heavy Scrap Ingot Conveyor Belt',
    area: 'Press Shop Scrap Pit',
    status: 'OPERATIONAL',
  },
  {
    assetTag: 'ROBOT-4',
    name: 'KUKA Sheet Destacking Arm 4',
    area: 'Primary Stamping Cell',
    status: 'OPERATIONAL',
  },
];

const APPROVED_SOPS = [
  { id: 'SOP-SAF-001', title: 'Daily Press Bed Cleaning & E-Stop Interlock Test', time: '10 mins' },
  { id: 'SOP-PPE-004', title: 'Hearing Protection & Kevlar Sleeve Requirements', time: '5 mins' },
  { id: 'SOP-LUB-012', title: 'Shift Start Grease Reservoir Verification', time: '8 mins' },
];

export const WorkerWorkspaceView: React.FC<{
  onLaunchSop?: (sopId: string) => void;
  onNavigateToCopilot?: (assetTag: string) => void;
}> = ({ onLaunchSop, onNavigateToCopilot }) => {
  const { user } = useAuth();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportedTickets, setReportedTickets] = useState<WorkerTicket[]>([
    {
      id: 'TKT-1082',
      date: 'Today, 14:20',
      machine: 'HP-204',
      issue: 'Oil temperature gauge amber needle flickering above 85°C mark.',
      status: 'IN_PROGRESS',
    },
  ]);

  // Report fault form
  const [faultMachine, setFaultMachine] = useState('HP-204');
  const [faultType, setFaultType] = useState('Unusual Noise / Squeal');
  const [faultDescription, setFaultDescription] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState(false);

  const handleSubmitFault = (e: React.FormEvent) => {
    e.preventDefault();
    if (!faultDescription.trim()) return;

    const newTicket: WorkerTicket = {
      id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
      date: 'Just now',
      machine: faultMachine,
      issue: `${faultType}: ${faultDescription}`,
      status: 'PENDING',
    };

    setReportedTickets([newTicket, ...reportedTickets]);
    setFaultDescription('');
    setSubmittedMessage(true);
    setTimeout(() => {
      setSubmittedMessage(false);
      setReportModalOpen(false);
    }, 1800);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#F5F6F7] text-[#1A202C] font-sans antialiased p-6 space-y-6">
      {/* Header with big "Report Fault" CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] bg-white p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#151C24] text-white flex items-center justify-center shadow-sm">
            <HardHat className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A202C]">
              Worker Operations Terminal
            </h1>
            <p className="text-xs text-[#64748B]">
              Operator: <strong className="text-gray-900">{user?.fullName || 'Line Operator'}</strong> · Assigned Line 1 Machines & Approved SOPs
            </p>
          </div>
        </div>

        {/* Big Prominent "Report Fault" Button */}
        <button
          onClick={() => setReportModalOpen(true)}
          className="px-5 py-3 bg-[#DC2626] hover:bg-[#b91c1c] text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-md group"
        >
          <AlertTriangle className="w-4 h-4 text-white group-hover:scale-110 transition" />
          <span>Report Machine Fault / Anomaly</span>
        </button>
      </div>

      {/* Main 2-Column Simplified Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        {/* Column 1: My Machines Status */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1A202C]">
              My Production Machines ({MY_ASSIGNED_MACHINES.length})
            </h2>
            <span className="text-[10px] font-mono text-gray-400">Shift Station 04</span>
          </div>

          <div className="space-y-3">
            {MY_ASSIGNED_MACHINES.map((m) => (
              <div
                key={m.assetTag}
                className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition flex items-center justify-between gap-3 bg-gray-50/50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#151C24] bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                      {m.assetTag}
                    </span>
                    <span className="text-xs font-bold text-gray-900">{m.name}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">{m.area}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      m.status === 'OPERATIONAL'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : m.status === 'ADVISORY'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {m.status}
                  </span>
                  <button
                    onClick={() => onNavigateToCopilot?.(m.assetTag)}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition"
                    title="Ask Copilot about this machine"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Approved Operator SOPs */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1A202C]">
              Approved Operator Procedures
            </h2>
            <span className="text-[10px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Authorized for Operator
            </span>
          </div>

          <div className="space-y-3">
            {APPROVED_SOPS.map((sop) => (
              <div
                key={sop.id}
                onClick={() => onLaunchSop?.(sop.id)}
                className="p-4 rounded-lg border border-gray-200 hover:border-blue-400 bg-white hover:bg-blue-50/20 transition cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="flex items-start gap-2.5">
                  <FileCheck2 className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-gray-900 group-hover:text-[#2563EB] transition">
                      {sop.title}
                    </div>
                    <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                      {sop.id} · Est. {sop.time}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: My Reported Tickets Status */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 shadow-sm space-y-3 max-w-6xl">
        <h2 className="text-sm font-bold text-[#1A202C]">
          My Submitted Anomaly Reports ({reportedTickets.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-mono text-[11px] uppercase">
                <th className="py-2.5 px-3">Ticket ID</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Equipment</th>
                <th className="py-2.5 px-3">Reported Issue</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reportedTickets.map((tkt) => (
                <tr key={tkt.id} className="hover:bg-gray-50">
                  <td className="py-3 px-3 font-mono font-bold text-[#2563EB]">{tkt.id}</td>
                  <td className="py-3 px-3 text-gray-500 font-mono">{tkt.date}</td>
                  <td className="py-3 px-3 font-mono font-semibold text-gray-900">{tkt.machine}</td>
                  <td className="py-3 px-3 text-gray-700">{tkt.issue}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        tkt.status === 'RESOLVED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tkt.status === 'IN_PROGRESS'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {tkt.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Report Machine Fault */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-red-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-gray-900">
                  Report Equipment Fault
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 font-mono text-sm"
              >
                ✕
              </button>
            </div>

            {submittedMessage ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <div className="text-base font-bold text-gray-900">Fault Dispatched to Maintenance</div>
                <p className="text-xs text-gray-500">
                  Lead Technician and Shift Supervisor have been alerted via push notification.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitFault} className="p-5 space-y-4 text-xs font-sans">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Affected Machine</label>
                  <select
                    value={faultMachine}
                    onChange={(e) => setFaultMachine(e.target.value)}
                    className="w-full p-2 bg-gray-50 border border-gray-300 rounded font-mono text-xs text-gray-900 outline-none"
                  >
                    {MY_ASSIGNED_MACHINES.map((m) => (
                      <option key={m.assetTag} value={m.assetTag}>
                        {m.assetTag} — {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Observed Anomaly Type</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      'Unusual Noise / Squeal',
                      'High Temperature / Smoke',
                      'Liquid Leakage / Weepage',
                      'Vibration / Shaking',
                      'Pressure Drop Alarm',
                      'Electrical / E-Stop Fault',
                    ].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFaultType(type)}
                        className={`p-2 rounded border text-left text-[11px] font-medium transition ${
                          faultType === type
                            ? 'bg-red-50 border-red-500 text-red-800 font-bold'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Description / Details</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe what happened, smells, sounds, or gauge readings..."
                    value={faultDescription}
                    onChange={(e) => setFaultDescription(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded text-xs text-gray-900 outline-none focus:border-red-500 font-sans"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(false)}
                    className="px-3 py-2 rounded text-gray-600 hover:bg-gray-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Anomaly Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

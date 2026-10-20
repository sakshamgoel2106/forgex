import React, { useState } from 'react';
import {
  History,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  User,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface MaintenanceEvent {
  id: string;
  ticketId: string;
  date: string;
  month: string;
  assetTag: string;
  assetName: string;
  symptom: string;
  rootCause: string;
  actionTaken: string;
  partsUsed: string[];
  technician: string;
  downtimeHours: number;
  repeatCount?: number; // e.g. 3 for REPEAT x3
  notes: string;
}

const HISTORY_EVENTS: MaintenanceEvent[] = [
  {
    id: 'ev-1',
    ticketId: 'WO-8812',
    date: '2026-10-18',
    month: 'October 2026',
    assetTag: 'HP-204',
    assetName: 'Schuler 400T Hydraulic Press',
    symptom: 'Oil temperature reached 87.4°C with audible pump cavitation.',
    rootCause: 'Shell & tube heat exchanger cooling water passage calcification and sludge buildup.',
    actionTaken: 'Isolated cooling loop, performed chemical acid flush on tube bundle, calibrated PT-401.',
    partsUsed: ['Gasket Set #GSK-400-H', 'O-Ring Viton 48mm (x4)', 'Descaling Compound 20L'],
    technician: 'M. Richter (Lead Tech)',
    downtimeHours: 3.5,
    repeatCount: 3,
    notes: 'Third occurrence of cooling loop calcification in 75 days. Water treatment plant hardness must be audited.',
  },
  {
    id: 'ev-2',
    ticketId: 'WO-8791',
    date: '2026-10-04',
    month: 'October 2026',
    assetTag: 'PUMP-204-B',
    assetName: 'Centrifugal Slurry Bottoms Pump',
    symptom: 'Excessive weeping from outboard mechanical seal gland port (>12 drops/min).',
    rootCause: 'Uneven torque on gland follower bolts causing silicon carbide face divergence.',
    actionTaken: 'Star-pattern retorque to 185 ft-lbs with calibrated torque wrench. Leakage stopped.',
    partsUsed: ['Follower Hex Nuts 316SS (x4)'],
    technician: 'Tom Technician',
    downtimeHours: 1.2,
    notes: 'Follower gap verified with feeler gauge at 3.18mm even all around. Vibration nominal at 2.1 mm/s.',
  },
  {
    id: 'ev-3',
    ticketId: 'WO-8720',
    date: '2026-09-12',
    month: 'September 2026',
    assetTag: 'HP-204',
    assetName: 'Schuler 400T Hydraulic Press',
    symptom: 'Thermal switch interlock triggered at 85.5°C during high-speed stamping cycle.',
    rootCause: 'Shell & tube heat exchanger cooling water passage calcification and sludge buildup.',
    actionTaken: 'Backflushed heat exchanger with pressurized water. Temporary temperature drop achieved.',
    partsUsed: ['Backflush Quick-Coupler Adapter'],
    technician: 'M. Richter (Lead Tech)',
    downtimeHours: 2.8,
    repeatCount: 2,
    notes: 'Water backflush only partially cleared passages. Tube replacement recommended on next scheduled turnaround.',
  },
  {
    id: 'ev-4',
    ticketId: 'WO-8650',
    date: '2026-08-22',
    month: 'August 2026',
    assetTag: 'HP-204',
    assetName: 'Schuler 400T Hydraulic Press',
    symptom: 'Temperature advisory 84.1°C recorded by SCADA sensor TT-204.',
    rootCause: 'Shell & tube heat exchanger cooling water passage calcification and sludge buildup.',
    actionTaken: 'Stroked cooling water valve to 100% open manually to maintain thermal equilibrium.',
    partsUsed: ['Valve Stem Lubricant'],
    technician: 'Sarah Connor',
    downtimeHours: 0.5,
    repeatCount: 1,
    notes: 'Initial notice of degraded cooling efficiency.',
  },
  {
    id: 'ev-5',
    ticketId: 'WO-8610',
    date: '2026-08-08',
    month: 'August 2026',
    assetTag: 'COMP-702',
    assetName: 'Centrifugal Gas Compressor Unit 4',
    symptom: 'Inlet guide vane position deviation alarm (>5% setpoint error).',
    rootCause: 'Pneumatic actuator linkage binding due to atmospheric dust accumulation.',
    actionTaken: 'Cleaned linkage pins, applied high-temp synthetic grease, recalibrated smart positioner.',
    partsUsed: ['Synthetic Bearing Grease', 'Linkage Cotter Pins (x2)'],
    technician: 'Alex Chen',
    downtimeHours: 1.8,
    notes: 'Linearity response test passed across 0%, 25%, 50%, 75%, 100% stroke.',
  },
];

export const MaintenanceHistoryView: React.FC = () => {
  const [selectedAsset, setSelectedAsset] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>('ev-1');

  const filtered = HISTORY_EVENTS.filter((e) => {
    const matchesAsset = selectedAsset === 'ALL' || e.assetTag === selectedAsset;
    const matchesSearch =
      searchTerm === '' ||
      e.ticketId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.assetTag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.rootCause.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.symptom.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAsset && matchesSearch;
  });

  // Group by month
  const months = Array.from(new Set(filtered.map((e) => e.month)));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans antialiased">
      {/* Top Header */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
            <History className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#1A202C] leading-tight">
              Maintenance History & Recurring Faults Ledger
            </h1>
            <p className="text-xs text-[#64748B]">
              Audited work order completion log · 90-day repeat root cause frequency detection
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search ticket, cause, tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-white border border-[#CBD5E1] rounded text-xs text-[#1A202C] placeholder-gray-400 outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded px-2.5 py-1">
            <Filter className="w-3 h-3 text-[#64748B]" />
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="bg-transparent text-xs text-[#1A202C] font-medium outline-none cursor-pointer"
            >
              <option value="ALL">All Equipment</option>
              <option value="HP-204">HP-204 (Hydraulic Press)</option>
              <option value="PUMP-204-B">PUMP-204-B (Slurry Pump)</option>
              <option value="COMP-702">COMP-702 (Compressor)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Timeline View */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-8">
        {months.map((month) => {
          const eventsInMonth = filtered.filter((e) => e.month === month);
          return (
            <div key={month} className="space-y-4">
              {/* Month Header Banner */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
                  {month}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-mono text-gray-400">
                  {eventsInMonth.length} interventions
                </span>
              </div>

              {/* Vertical Timeline Items */}
              <div className="space-y-4 pl-4 border-l-2 border-[#CBD5E1] ml-2">
                {eventsInMonth.map((ev) => {
                  const isExpanded = expandedId === ev.id;
                  const isRepeat = (ev.repeatCount || 0) >= 2;

                  return (
                    <div
                      key={ev.id}
                      className="relative bg-white rounded-lg border border-[#E2E8F0] shadow-sm hover:border-[#CBD5E1] transition overflow-hidden"
                    >
                      {/* Timeline Dot */}
                      <span
                        className={`absolute -left-[23px] top-5 w-3 h-3 rounded-full border-2 border-white ${
                          isRepeat ? 'bg-red-500 ring-2 ring-red-200' : 'bg-[#0F766E]'
                        }`}
                      />

                      {/* Card Header */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                        className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50/50 transition"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#2563EB]">
                            {ev.ticketId}
                          </span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">
                            {ev.assetTag}
                          </span>
                          <span className="text-xs text-gray-600 font-medium truncate max-w-xs">
                            {ev.assetName}
                          </span>

                          {/* REPEAT x3 Badge */}
                          {ev.repeatCount && ev.repeatCount >= 2 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-100 text-red-800 border border-red-200 animate-pulse">
                              <RotateCcw className="w-3 h-3" /> REPEAT x{ev.repeatCount} (75d)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs font-mono text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {ev.downtimeHours}h downtime
                          </span>
                          <span>{ev.date}</span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="px-4 pb-4 space-y-3 font-sans text-xs border-t border-gray-100 pt-3">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-gray-400 uppercase">
                            Reported Field Symptom
                          </span>
                          <p className="text-gray-800 mt-0.5">{ev.symptom}</p>
                        </div>

                        <div className="p-2.5 rounded bg-amber-50/60 border border-amber-200">
                          <span className="text-[10px] font-mono font-bold text-amber-800 uppercase block">
                            Identified Root Cause
                          </span>
                          <p className="text-amber-900 font-medium mt-0.5">{ev.rootCause}</p>
                        </div>

                        <div>
                          <span className="text-[10px] font-mono font-bold text-gray-400 uppercase">
                            Corrective Action Implemented
                          </span>
                          <p className="text-emerald-900 font-medium mt-0.5 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {ev.actionTaken}
                          </p>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-gray-100 space-y-3 font-mono text-[11px]">
                            <div>
                              <span className="text-gray-400 block mb-1">Parts & Consumables Replaced:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {ev.partsUsed.map((p, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-700"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-gray-500 pt-1">
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-gray-400" /> Lead Technician: <strong>{ev.technician}</strong>
                              </span>
                              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                                <ShieldCheck className="w-3.5 h-3.5" /> Shift Supervisor Signoff Complete
                              </span>
                            </div>

                            <div className="p-2.5 rounded bg-gray-50 border border-gray-200 text-gray-700 font-sans">
                              <strong className="font-mono text-[10px] text-gray-400 block mb-0.5 uppercase">
                                Auditor / Shift Handoff Notes:
                              </strong>
                              {ev.notes}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

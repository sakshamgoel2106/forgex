import React, { useState } from 'react';
import {
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Check,
  X,
} from 'lucide-react';

interface DiagnosticCheck {
  id: string;
  name: string;
  instruction: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
  technicianNotes?: string;
}

interface CauseHypothesis {
  id: string;
  cause: string;
  historyFrequency: number; // percentage
  evidenceCoverage: number; // percentage
  status: 'CONFIRMED' | 'HYPOTHESIS' | 'RULED_OUT';
  sourceDoc: string;
}

export const TroubleshootingView: React.FC<{
  onNavigateToSop?: () => void;
  onNavigateToMaintenance?: (assetId: string) => void;
}> = ({ onNavigateToSop, onNavigateToMaintenance }) => {
  // Machine & Symptom Context
  const [selectedMachine, setSelectedMachine] = useState('HP-204');
  const [errorCode, setErrorCode] = useState('E-2041');
  const [symptom, setSymptom] = useState(
    'Hydraulic oil reservoir temperature exceeded 85°C trip threshold. Audible cavitation hum during stroke return.'
  );
  const [conditions] = useState({
    oilTemp: '87.4 °C',
    systemPressure: '214 bar',
    flowRate: '140 L/min',
    ambientTemp: '28 °C',
  });

  // Hypotheses
  const [hypotheses, setHypotheses] = useState<CauseHypothesis[]>([
    {
      id: 'hyp-1',
      cause: 'Heat exchanger shell-side sludge fouling or cooling water valve closed',
      historyFrequency: 74,
      evidenceCoverage: 92,
      status: 'CONFIRMED',
      sourceDoc: 'HP-204 OEM Manual v4.2 §7.3',
    },
    {
      id: 'hyp-2',
      cause: 'Proportional relief valve VR-102 spool sticking in partially bypassed state',
      historyFrequency: 45,
      evidenceCoverage: 84,
      status: 'HYPOTHESIS',
      sourceDoc: 'Hydraulic Schematic DWG-HYD-402',
    },
    {
      id: 'hyp-3',
      cause: 'Low oil reservoir viscosity degradation or foaming from moisture ingress',
      historyFrequency: 18,
      evidenceCoverage: 60,
      status: 'RULED_OUT',
      sourceDoc: 'Lab Oil Analysis Report #LAB-2026-99',
    },
  ]);

  // Diagnostic Checks
  const [checks, setChecks] = useState<DiagnosticCheck[]>([
    {
      id: 'chk-1',
      name: 'Verify Shell & Tube Cooling Water Delta T',
      instruction: 'Measure temperature difference between inlet and outlet thermowells (Nominal: >8°C).',
      status: 'FAIL',
      technicianNotes: 'Delta T measured at 1.8°C only. Indicates near-zero heat transfer.',
    },
    {
      id: 'chk-2',
      name: 'Inspect Cooling Water Modulating Valve CV-401 Position',
      instruction: 'Verify 4-20mA positioner signal matches physical valve stem indicator.',
      status: 'PASS',
      technicianNotes: 'Stem position at 100% open. Flow confirmed upstream.',
    },
    {
      id: 'chk-3',
      name: 'Relief Valve VR-102 Pilot Pressure Test',
      instruction: 'Install 0-350 bar test gauge on port M1. Measure cracked pilot seat leakage.',
      status: 'PENDING',
    },
  ]);

  const [activeTab, setActiveTab] = useState<'rca' | 'timeline' | 'escalate'>('rca');
  const [escalated, setEscalated] = useState(false);

  const toggleCheckStatus = (id: string, newStatus: 'PASS' | 'FAIL' | 'PENDING') => {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
    );
  };

  const setHypothesisStatus = (id: string, newStatus: 'CONFIRMED' | 'HYPOTHESIS' | 'RULED_OUT') => {
    setHypotheses((prev) =>
      prev.map((h) => (h.id === id ? { ...h, status: newStatus } : h))
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans antialiased">
      {/* Top Header */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#1A202C] leading-tight">
              Root Cause Analysis (RCA) & Troubleshooting Builder
            </h1>
            <p className="text-xs text-[#64748B]">
              Structured failure investigation · Grounded in historical work orders and verified OEM manuals
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#F1F5F9] p-0.5 rounded-md border border-[#E2E8F0] text-xs font-semibold">
            <button
              onClick={() => setActiveTab('rca')}
              className={`px-3 py-1.5 rounded transition ${
                activeTab === 'rca' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              RCA Matrix
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded transition ${
                activeTab === 'timeline' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Investigation Steps
            </button>
          </div>

          <button
            onClick={() => {
              setEscalated(true);
              onNavigateToMaintenance?.(selectedMachine);
            }}
            className="px-3 py-1.5 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition shadow-sm"
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            {escalated ? 'Dispatched to Lead Specialist' : 'Escalate to Specialist'}
          </button>
        </div>
      </div>

      {/* Main Investigation Split Panes */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane: Machine Context & Operating Conditions (360px) */}
        <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white p-5 overflow-y-auto space-y-5 shrink-0 shadow-sm">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider">
              Asset & Fault Code
            </span>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="flex-1 py-1.5 px-2 bg-gray-50 border border-[#CBD5E1] rounded text-xs font-mono font-bold text-[#1A202C] outline-none"
              >
                <option value="HP-204">HP-204 (Hydraulic Press 400T)</option>
                <option value="PUMP-204-B">PUMP-204-B (Slurry Bottoms Pump)</option>
                <option value="COMP-702">COMP-702 (Centrifugal Compressor)</option>
              </select>
              <input
                type="text"
                value={errorCode}
                onChange={(e) => setErrorCode(e.target.value)}
                className="w-24 py-1.5 px-2 bg-gray-50 border border-[#CBD5E1] rounded text-xs font-mono font-bold text-red-600 outline-none uppercase"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-1">
              Field Symptom Description
            </label>
            <textarea
              rows={3}
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-[#CBD5E1] rounded text-xs text-[#1A202C] outline-none focus:border-[#2563EB] font-sans"
            />
          </div>

          <div>
            <span className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-2">
              Captured Operational Conditions
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded bg-gray-50 border border-[#E2E8F0]">
                <div className="text-[10px] text-gray-400">Oil Temperature</div>
                <div className="font-bold text-red-600 mt-0.5">{conditions.oilTemp}</div>
              </div>
              <div className="p-2.5 rounded bg-gray-50 border border-[#E2E8F0]">
                <div className="text-[10px] text-gray-400">System Pressure</div>
                <div className="font-bold text-gray-900 mt-0.5">{conditions.systemPressure}</div>
              </div>
              <div className="p-2.5 rounded bg-gray-50 border border-[#E2E8F0]">
                <div className="text-[10px] text-gray-400">Pump Flow Rate</div>
                <div className="font-bold text-gray-900 mt-0.5">{conditions.flowRate}</div>
              </div>
              <div className="p-2.5 rounded bg-gray-50 border border-[#E2E8F0]">
                <div className="text-[10px] text-gray-400">Ambient Temp</div>
                <div className="font-bold text-gray-900 mt-0.5">{conditions.ambientTemp}</div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#2563EB]">
              <ShieldCheck className="w-4 h-4" />
              <span>Evidence Traceability Model</span>
            </div>
            <p className="text-[11px] text-gray-600 leading-normal">
              Causes are prioritized using 18 past work orders on HP-204 and OEM thermal design limits.
            </p>
          </div>
        </div>

        {/* Right Pane: Potential Causes + Diagnostic Checklist */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 max-w-5xl">
          {/* Section 1: Ranked Potential Root Causes */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1A202C]">
                  Ranked Potential Root Causes
                </h2>
                <p className="text-xs text-[#64748B]">
                  Weighted by past plant failure frequency & authorized technical manual coverage
                </p>
              </div>
              <span className="text-xs font-mono text-gray-400">3 Hypotheses</span>
            </div>

            <div className="space-y-3">
              {hypotheses.map((h) => (
                <div
                  key={h.id}
                  className={`p-4 rounded-lg border transition ${
                    h.status === 'CONFIRMED'
                      ? 'bg-emerald-50/40 border-emerald-300'
                      : h.status === 'HYPOTHESIS'
                      ? 'bg-amber-50/30 border-amber-300 border-dashed'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {h.status === 'CONFIRMED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#0F766E] text-white">
                          <Check className="w-3 h-3" /> CONFIRMED
                        </span>
                      ) : h.status === 'HYPOTHESIS' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#D97706] text-white">
                          <HelpCircle className="w-3 h-3" /> HYPOTHESIS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-400 text-white">
                          RULED OUT
                        </span>
                      )}
                      <span className="text-xs font-semibold text-gray-900 font-sans">
                        {h.cause}
                      </span>
                    </div>

                    {/* Status change actions */}
                    <div className="flex items-center gap-1 text-[11px] font-mono">
                      <button
                        onClick={() => setHypothesisStatus(h.id, 'CONFIRMED')}
                        className="px-2 py-0.5 rounded bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 transition"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setHypothesisStatus(h.id, 'HYPOTHESIS')}
                        className="px-2 py-0.5 rounded bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 transition"
                      >
                        Hypothesis
                      </button>
                      <button
                        onClick={() => setHypothesisStatus(h.id, 'RULED_OUT')}
                        className="px-2 py-0.5 rounded bg-white border border-gray-300 hover:bg-gray-100 text-gray-600 transition"
                      >
                        Rule Out
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500 pt-2 border-t border-gray-100">
                    <span>
                      Historical Frequency:{' '}
                      <strong className="text-gray-900">{h.historyFrequency}%</strong>
                    </span>
                    <span>
                      Manual Evidence Match:{' '}
                      <strong className="text-gray-900">{h.evidenceCoverage}%</strong>
                    </span>
                    <span className="text-blue-600 underline cursor-pointer truncate max-w-xs">
                      {h.sourceDoc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Field Diagnostic Checks Checklist */}
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1A202C]">
                  Diagnostic Verification Checklist
                </h2>
                <p className="text-xs text-[#64748B]">
                  Sequential field tests to isolate failure mode before teardown
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-600 font-semibold">
                {checks.filter((c) => c.status === 'PASS').length} of {checks.length} Passed
              </span>
            </div>

            <div className="space-y-3">
              {checks.map((chk, i) => (
                <div
                  key={chk.id}
                  className="p-4 rounded-lg border border-[#E2E8F0] bg-white space-y-2 hover:border-[#CBD5E1] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-700 text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-gray-900 font-sans">
                          {chk.name}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{chk.instruction}</p>
                      </div>
                    </div>

                    {/* Pass/Fail/Pending Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                      <button
                        onClick={() => toggleCheckStatus(chk.id, 'PASS')}
                        className={`px-2.5 py-1 rounded border flex items-center gap-1 transition ${
                          chk.status === 'PASS'
                            ? 'bg-[#0F766E] text-white border-[#0F766E]'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-emerald-50'
                        }`}
                      >
                        <Check className="w-3 h-3" /> Pass
                      </button>
                      <button
                        onClick={() => toggleCheckStatus(chk.id, 'FAIL')}
                        className={`px-2.5 py-1 rounded border flex items-center gap-1 transition ${
                          chk.status === 'FAIL'
                            ? 'bg-[#DC2626] text-white border-[#DC2626]'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-red-50'
                        }`}
                      >
                        <X className="w-3 h-3" /> Fail
                      </button>
                      <button
                        onClick={() => toggleCheckStatus(chk.id, 'PENDING')}
                        className={`px-2.5 py-1 rounded border transition ${
                          chk.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-white text-gray-400 border-gray-200'
                        }`}
                      >
                        Pending
                      </button>
                    </div>
                  </div>

                  {chk.technicianNotes && (
                    <div className="ml-7 p-2 rounded bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700">
                      <strong>Observed:</strong> {chk.technicianNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Launch Guided Procedure CTA */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-mono">
                Governing Procedure: <strong>SOP-MTR-042</strong>
              </span>
              <button
                onClick={onNavigateToSop}
                className="px-4 py-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition shadow-sm"
              >
                Launch Guided Teardown SOP
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

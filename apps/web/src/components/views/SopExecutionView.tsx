import React, { useState } from 'react';
import {
  Wrench,
  ShieldAlert,
  AlertOctagon,
  ArrowRight,
  Gauge,
  UserCheck,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

export const SopExecutionView: React.FC = () => {
  const [lotoConfirmed, setLotoConfirmed] = useState(false);
  const [ppeConfirmed, setPpeConfirmed] = useState(false);
  const [measuredTorque, setMeasuredTorque] = useState<string>('34.2');
  const [activeStep, setActiveStep] = useState(1);

  const nominalMin = 32.5;
  const nominalMax = 35.5;
  const numVal = parseFloat(measuredTorque) || 0;
  const isWithinTolerance = numVal >= nominalMin && numVal <= nominalMax;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Header Bar */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <Wrench className="w-4 h-4" />
            <span>INTERACTIVE PROCEDURE RUNNER</span>
          </div>
          <span className="text-graphite-600">|</span>
          <span className="text-graphite-300 font-bold">SOP-MTR-042 (REV 4.1)</span>
          <span className="text-cyan-400">[PUMP-204-B]</span>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge label="EXECUTION IN PROGRESS" tone="warning" pulse />
          <span className="text-[11px] text-graphite-400">RUN ID: #RUN-2026-9081</span>
        </div>
      </div>

      {/* Main Grid: Steps Timeline + Active Execution Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Step Sequence Timeline */}
        <div className="w-72 border-r border-graphite-800 bg-graphite-900/40 p-3 overflow-y-auto space-y-2">
          <div className="text-[10px] font-mono uppercase text-graphite-500 font-semibold px-1">
            Procedure Workflow (6 Steps)
          </div>

          {[
            {
              step: 1,
              title: 'LOTO & Electrical Isolation',
              status: lotoConfirmed && ppeConfirmed ? 'VERIFIED' : 'ACTIVE',
              isGate: true,
            },
            {
              step: 2,
              title: 'Casing Fluid Depressurization',
              status: 'PENDING',
              isGate: false,
            },
            {
              step: 3,
              title: 'Gland Follower Bolt Teardown',
              status: 'PENDING',
              isGate: false,
            },
            {
              step: 4,
              title: 'Silicon Carbide Face Inspection',
              status: 'PENDING',
              isGate: false,
            },
            {
              step: 5,
              title: 'Seal Cartridge Reassembly & Torque',
              status: 'PENDING',
              isGate: false,
            },
            {
              step: 6,
              title: 'Hydrostatic Leak Test Sign-Off',
              status: 'PENDING',
              isGate: false,
            },
          ].map((item) => (
            <div
              key={item.step}
              onClick={() => setActiveStep(item.step)}
              className={`p-2.5 rounded border text-xs font-mono cursor-pointer transition ${
                activeStep === item.step
                  ? 'bg-graphite-800 border-amber-500/70 text-graphite-100'
                  : 'bg-graphite-950/60 border-graphite-850 text-graphite-400 hover:border-graphite-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-500">STEP 0{item.step}</span>
                {item.isGate && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                    SAFETY GATE
                  </span>
                )}
              </div>
              <div className="mt-1 font-sans text-xs font-medium text-graphite-200">
                {item.title}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Step Execution Pane */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 max-w-4xl">
          {/* Step 1 Safety Gate Checkpoint */}
          {activeStep === 1 ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-900/60 space-y-3">
                <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-xs uppercase tracking-wider">
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                  <span>Mandatory OSHA 1910.147 Lockout/Tagout (LOTO) Gate</span>
                </div>
                <p className="text-xs text-graphite-300 leading-relaxed font-sans">
                  You are performing maintenance on high-pressure equipment with 4160V electrical feed.
                  Federal and plant safety protocols prohibit physical disassembly until all energy isolation locks are verified and signed.
                </p>

                <div className="space-y-2 pt-2 border-t border-rose-900/40">
                  <label className="flex items-center gap-3 p-2.5 rounded bg-graphite-950/80 border border-graphite-800 cursor-pointer hover:border-rose-700 transition">
                    <input
                      type="checkbox"
                      checked={lotoConfirmed}
                      onChange={(e) => setLotoConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-graphite-700 text-rose-600 focus:ring-0 cursor-pointer"
                    />
                    <div className="text-xs font-mono">
                      <span className="text-graphite-200 font-bold">
                        BREAKER ISOLATION CONFIRMED:
                      </span>{' '}
                      <span className="text-graphite-400">
                        Padlock & Danger Tag applied to Breaker BRK-4160-P204B
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-2.5 rounded bg-graphite-950/80 border border-graphite-800 cursor-pointer hover:border-rose-700 transition">
                    <input
                      type="checkbox"
                      checked={ppeConfirmed}
                      onChange={(e) => setPpeConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-graphite-700 text-rose-600 focus:ring-0 cursor-pointer"
                    />
                    <div className="text-xs font-mono">
                      <span className="text-graphite-200 font-bold">PPE MANDATE VERIFIED:</span>{' '}
                      <span className="text-graphite-400">
                        Level 4 Arc Flash Shield, Nitrile Chemical Under-Gloves, Steel Toe Boots
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Technician Signoff Action */}
              <div className="flex items-center justify-between p-4 rounded bg-graphite-900 border border-graphite-800">
                <div className="flex items-center gap-2 text-xs font-mono text-graphite-400">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>Authorized Operator: T. Vance [ID: PE-7089]</span>
                </div>
                <button
                  disabled={!lotoConfirmed || !ppeConfirmed}
                  onClick={() => setActiveStep(5)}
                  className={`px-4 py-2 rounded text-xs font-mono font-bold flex items-center gap-2 transition ${
                    lotoConfirmed && ppeConfirmed
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-graphite-950 cursor-pointer shadow-md shadow-emerald-950/50'
                      : 'bg-graphite-800 text-graphite-500 cursor-not-allowed border border-graphite-700'
                  }`}
                >
                  Confirm Safety Gate & Advance
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Step 5: Seal Cartridge Reassembly & Torque Verification */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-graphite-800">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-mono font-bold text-graphite-100">
                      STEP 05: GLAND NUT TORQUE & TOLERANCE VERIFICATION
                    </span>
                  </div>
                  <span className="text-xs font-mono text-cyan-400">
                    CITED FROM SOP-MTR-042 SEC 4.8
                  </span>
                </div>

                <div className="p-3 rounded bg-graphite-950 border border-graphite-800 text-xs font-mono space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-graphite-400">NOMINAL TORQUE RANGE:</span>
                    <span className="text-amber-400 font-bold">
                      {nominalMin} Nm — {nominalMax} Nm
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-graphite-500 uppercase">
                      Enter Calibrated Torque Wrench Reading (Nm):
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={measuredTorque}
                        onChange={(e) => setMeasuredTorque(e.target.value)}
                        className="w-32 px-3 py-1.5 bg-graphite-900 border border-graphite-700 rounded text-sm font-mono text-graphite-100 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-xs font-mono text-graphite-400">Nm</span>
                      <StatusBadge
                        label={isWithinTolerance ? 'WITHIN TOLERANCE' : 'OUT OF SPECIFICATION'}
                        tone={isWithinTolerance ? 'healthy' : 'critical'}
                      />
                    </div>
                  </div>

                  {!isWithinTolerance && (
                    <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-[11px] text-rose-300 font-mono space-y-1">
                      <div className="font-bold flex items-center gap-1 text-rose-400">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        AUTOMATIC DEVIATION LOGGED:
                      </div>
                      <p>
                        Measured value {measuredTorque} Nm exceeds tolerance envelope [32.5 - 35.5
                        Nm]. Supervisor sign-off is required before final pressurization.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setActiveStep(1)}
                    className="px-3 py-1.5 rounded bg-graphite-800 text-graphite-300 border border-graphite-700 text-xs font-mono hover:bg-graphite-700 transition"
                  >
                    Back to Safety Gate
                  </button>
                  <button
                    disabled={!isWithinTolerance}
                    className={`px-4 py-1.5 rounded text-xs font-mono font-bold transition ${
                      isWithinTolerance
                        ? 'bg-amber-500 hover:bg-amber-600 text-graphite-950'
                        : 'bg-graphite-800 text-graphite-500 cursor-not-allowed border border-graphite-700'
                    }`}
                  >
                    Complete Step & Log To Audit Ledger
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

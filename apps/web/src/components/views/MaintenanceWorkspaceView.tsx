import React, { useState } from 'react';
import { Wrench, HelpCircle, ShieldCheck, Lock } from 'lucide-react';
import { SopExecutionView } from './SopExecutionView';
import { TroubleshootingView } from './TroubleshootingView';

export const MaintenanceWorkspaceView: React.FC = () => {
  const [tab, setTab] = useState<'cases' | 'troubleshooting'>('cases');
  const [activeCount, setActiveCount] = useState<number>(0);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-[#F8FAFC] text-slate-900 font-sans antialiased">
      {/* Sub-navigation Tab Bar */}
      <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setTab('cases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'cases'
                ? 'bg-white text-slate-900 font-bold border border-slate-200 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-blue-600" />
            <span>Active Cases & Guided SOPs</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-bold">
              {activeCount}
            </span>
          </button>

          <button
            onClick={() => setTab('troubleshooting')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'troubleshooting'
                ? 'bg-white text-slate-900 font-bold border border-slate-200 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Diagnostic Troubleshooting & Root Cause</span>
          </button>
        </div>

        {/* Floating Safety Indicators */}
        <div className="hidden sm:flex items-center gap-2.5 text-xs font-mono">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 text-[11px] font-mono font-semibold shadow-xs select-none"
            title="OSHA 1910.147 Lockout/Tagout Gate Active"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <Lock className="w-3 h-3 text-amber-600" />
            <span>LOTO Gate Enforced</span>
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-[11px] font-mono font-semibold shadow-xs select-none"
            title="Immutable Cryptographic Step Auditing Active"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Step Auditing Active</span>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'cases' ? (
          <SopExecutionView onActiveCountChange={setActiveCount} />
        ) : (
          <TroubleshootingView onNavigateToSop={() => setTab('cases')} />
        )}
      </div>
    </div>
  );
};

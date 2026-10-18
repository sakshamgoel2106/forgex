import React, { useState } from 'react';
import { Wrench, HelpCircle, FileCheck2, AlertTriangle } from 'lucide-react';
import { SopExecutionView } from './SopExecutionView';
import { TroubleshootingView } from './TroubleshootingView';

export const MaintenanceWorkspaceView: React.FC = () => {
  const [tab, setTab] = useState<'cases' | 'troubleshooting'>('cases');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#070B10]">
      {/* Sub-navigation Tab Bar */}
      <div className="px-4 py-2 border-b border-[#1E293B] bg-[#0B0F15] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 bg-[#101722] p-1 rounded-lg border border-[#1E293B]">
          <button
            onClick={() => setTab('cases')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'cases'
                ? 'bg-[#12241A] text-[#A3E635] font-semibold border border-[#1E4028] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Active Cases & Guided SOPs</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#070B10] text-[#A3E635] border border-[#1E4028]">
              3
            </span>
          </button>

          <button
            onClick={() => setTab('troubleshooting')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'troubleshooting'
                ? 'bg-[#12241A] text-[#A3E635] font-semibold border border-[#1E4028] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Diagnostic Troubleshooting & Root Cause</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> LOTO Gate Enforced
          </span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5 text-[#A3E635]">
            <FileCheck2 className="w-3.5 h-3.5" /> Step Auditing Active
          </span>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'cases' ? (
          <SopExecutionView />
        ) : (
          <TroubleshootingView onNavigateToSop={() => setTab('cases')} />
        )}
      </div>
    </div>
  );
};

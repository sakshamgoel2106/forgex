import React, { useState } from 'react';
import { Wrench, HelpCircle, FileCheck2, AlertTriangle } from 'lucide-react';
import { SopExecutionView } from './SopExecutionView';
import { TroubleshootingView } from './TroubleshootingView';

export const MaintenanceWorkspaceView: React.FC = () => {
  const [tab, setTab] = useState<'cases' | 'troubleshooting'>('cases');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#06090E]">
      {/* Sub-navigation Tab Bar */}
      <div className="px-4 py-2 border-b border-[#182333] bg-[#070B10] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 bg-[#0D141F] p-1 rounded-xl border border-[#182333]">
          <button
            onClick={() => setTab('cases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'cases'
                ? 'bg-[#10241A] text-[#A3E635] font-semibold border border-[#1E4D2B] shadow-[0_0_8px_rgba(163,230,53,0.15)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Active Cases & Guided SOPs</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#06090E] text-[#A3E635] border border-[#1E4D2B]">
              3
            </span>
          </button>

          <button
            onClick={() => setTab('troubleshooting')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'troubleshooting'
                ? 'bg-[#10241A] text-[#A3E635] font-semibold border border-[#1E4D2B] shadow-[0_0_8px_rgba(163,230,53,0.15)]'
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

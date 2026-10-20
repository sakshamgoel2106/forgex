import React, { useState } from 'react';
import { Wrench, HelpCircle, FileCheck2, AlertTriangle } from 'lucide-react';
import { SopExecutionView } from './SopExecutionView';
import { TroubleshootingView } from './TroubleshootingView';

export const MaintenanceWorkspaceView: React.FC = () => {
  const [tab, setTab] = useState<'cases' | 'troubleshooting'>('cases');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C]">
      {/* Sub-navigation Tab Bar */}
      <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-white flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0]">
          <button
            onClick={() => setTab('cases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'cases'
                ? 'bg-white text-[#1A202C] font-semibold border border-[#E2E8F0] shadow-sm'
                : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Active Cases & Guided SOPs</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-[#2563EB] border border-blue-200 font-bold">
              3
            </span>
          </button>

          <button
            onClick={() => setTab('troubleshooting')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'troubleshooting'
                ? 'bg-white text-[#1A202C] font-semibold border border-[#E2E8F0] shadow-sm'
                : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Diagnostic Troubleshooting & Root Cause</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> LOTO Gate Enforced
          </span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" /> Step Auditing Active
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

import React, { useState } from 'react';
import { Wrench, HelpCircle, FileCheck2, AlertTriangle } from 'lucide-react';
import { SopExecutionView } from './SopExecutionView';
import { TroubleshootingView } from './TroubleshootingView';

export const MaintenanceWorkspaceView: React.FC = () => {
  const [tab, setTab] = useState<'cases' | 'troubleshooting'>('cases');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-industrial-bg">
      {/* Sub-navigation Tab Bar */}
      <div className="px-4 py-2 border-b border-industrial-border bg-industrial-sidebar flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 bg-industrial-surface p-1 rounded-md border border-industrial-border">
          <button
            onClick={() => setTab('cases')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'cases'
                ? 'bg-industrial-sidebar text-industrial-accent font-bold border border-industrial-border shadow-sm'
                : 'text-industrial-secondary hover:text-industrial-text'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Active Cases & Guided SOPs</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-industrial-bg text-industrial-accent border border-industrial-border">
              3
            </span>
          </button>

          <button
            onClick={() => setTab('troubleshooting')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-medium flex items-center gap-2 transition ${
              tab === 'troubleshooting'
                ? 'bg-industrial-sidebar text-industrial-accent font-bold border border-industrial-border shadow-sm'
                : 'text-industrial-secondary hover:text-industrial-text'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Diagnostic Troubleshooting & Root Cause</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-industrial-secondary">
          <span className="flex items-center gap-1.5 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> LOTO Gate Enforced
          </span>
          <span className="text-industrial-border">|</span>
          <span className="flex items-center gap-1.5 text-emerald-400">
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

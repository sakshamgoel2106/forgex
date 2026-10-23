import React from 'react';
import { SopExecutionView } from './SopExecutionView';

export const MaintenanceWorkspaceView: React.FC<{ initialCaseId?: string }> = ({ initialCaseId }) => {
  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-[#F8FAFC] text-slate-900 font-sans antialiased">
      <SopExecutionView initialCaseId={initialCaseId} />
    </div>
  );
};

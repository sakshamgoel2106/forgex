import React, { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import type { NavModule } from './components/layout/Sidebar';

import { OverviewView } from './components/views/OverviewView';
import { AssetDirectoryView } from './components/views/AssetDirectoryView';
import { TechnicalManualsView } from './components/views/TechnicalManualsView';
import { CopilotWorkspaceView } from './components/views/CopilotWorkspaceView';
import { VisualIntelligenceView } from './components/views/VisualIntelligenceView';
import { MaintenanceWorkspaceView } from './components/views/MaintenanceWorkspaceView';
import { ExpertKnowledgeView } from './components/views/ExpertKnowledgeView';
import { AuditLedgerView } from './components/views/AuditLedgerView';
import { SettingsView } from './components/views/SettingsView';

export const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<NavModule>('overview');

  const renderActiveView = () => {
    switch (activeModule) {
      case 'overview':
        return <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
      case 'assets':
        return <AssetDirectoryView />;
      case 'knowledge-hub':
        return <TechnicalManualsView />;
      case 'copilot':
        return <CopilotWorkspaceView />;
      case 'visual':
        return <VisualIntelligenceView />;
      case 'maintenance':
        return <MaintenanceWorkspaceView />;
      case 'expert':
        return <ExpertKnowledgeView />;
      case 'audit':
        return <AuditLedgerView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
    }
  };

  return (
    <AppShell activeModule={activeModule} onSelectModule={setActiveModule}>
      {renderActiveView()}
    </AppShell>
  );
};

export default App;

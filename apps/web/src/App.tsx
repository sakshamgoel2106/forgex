import React, { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { AppShell } from './components/layout/AppShell';
import type { NavModule } from './components/layout/Sidebar';

import { OverviewView } from './components/views/OverviewView';
import { AssetDirectoryView } from './components/views/AssetDirectoryView';
import { TechnicalManualsView } from './components/views/TechnicalManualsView';
import { CopilotWorkspaceView } from './components/views/CopilotWorkspaceView';
import { VisualIntelligenceView } from './components/views/VisualIntelligenceView';
import { MaintenanceWorkspaceView } from './components/views/MaintenanceWorkspaceView';
import { ExpertKnowledgeView } from './components/views/ExpertKnowledgeView';
import { TeamManagementView } from './components/views/TeamManagementView';
import { EngineeringAssetCenterView } from './components/views/EngineeringAssetCenterView';
import { AuditLedgerView } from './components/views/AuditLedgerView';
import { SettingsView } from './components/views/SettingsView';
import { LoginView } from './components/views/LoginView';
import { MachineRecoveryView } from './components/views/MachineRecoveryView';
import { TroubleshootingView } from './components/views/TroubleshootingView';
import { MaintenanceHistoryView } from './components/views/MaintenanceHistoryView';
import { TechnicianWorkspaceView } from './components/views/TechnicianWorkspaceView';
import { WorkerWorkspaceView } from './components/views/WorkerWorkspaceView';
import { ReportsAnalyticsView } from './components/views/ReportsAnalyticsView';
import { NotificationsFeedView } from './components/views/NotificationsFeedView';

const AppContent: React.FC = () => {
  const { user, token, isLoading, isOwnerOrAdmin } = useAuth();
  const [activeModule, setActiveModule] = useState<NavModule>('overview');

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F5F6F7] text-[#1A202C]">
        <div className="flex flex-col items-center gap-3">
          <img src="/forgex_icon.png" alt="ForgeX AI" className="w-10 h-10 animate-bounce" />
          <span className="text-xs font-mono font-bold tracking-wider text-gray-600">
            AUTHENTICATING FORGEX SESSION...
          </span>
        </div>
      </div>
    );
  }

  if (!token && !user) {
    return <LoginView onSuccess={() => setActiveModule('overview')} />;
  }

  const renderActiveView = () => {
    switch (activeModule) {
      case 'overview':
        return <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
      case 'assets':
        return <AssetDirectoryView />;
      case 'engineering-assets':
        return isOwnerOrAdmin ? <EngineeringAssetCenterView /> : <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
      case 'machine-recovery':
        return <MachineRecoveryView onNavigateToCopilot={(_tag) => setActiveModule('copilot')} />;
      case 'knowledge-hub':
        return <TechnicalManualsView />;
      case 'copilot':
        return <CopilotWorkspaceView />;
      case 'troubleshooting':
        return (
          <TroubleshootingView
            onNavigateToSop={() => setActiveModule('maintenance')}
            onNavigateToMaintenance={(_asset) => setActiveModule('maintenance')}
          />
        );
      case 'expert':
        return <ExpertKnowledgeView />;
      case 'maintenance':
        return <MaintenanceWorkspaceView />;
      case 'history':
        return <MaintenanceHistoryView />;
      case 'visual':
        return <VisualIntelligenceView />;
      case 'tech':
        return (
          <TechnicianWorkspaceView
            onLaunchSop={() => setActiveModule('maintenance')}
            onNavigateToCopilot={(_tag) => setActiveModule('copilot')}
          />
        );
      case 'worker':
        return (
          <WorkerWorkspaceView
            onLaunchSop={() => setActiveModule('maintenance')}
            onNavigateToCopilot={(_tag) => setActiveModule('copilot')}
          />
        );
      case 'reports':
        return <ReportsAnalyticsView onDrillDown={(_m) => setActiveModule('history')} />;
      case 'notifications':
        return <NotificationsFeedView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
      case 'team':
        return isOwnerOrAdmin ? <TeamManagementView /> : <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
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

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

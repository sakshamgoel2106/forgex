import React, { useState } from 'react';
import { HeaderRail } from './components/layout/HeaderRail';
import { SidebarNav, ActiveNavModule } from './components/layout/SidebarNav';

// Operational Views
import { OverviewView } from './components/views/OverviewView';
import { AssetDirectoryView } from './components/views/AssetDirectoryView';
import { TechnicalManualsView } from './components/views/TechnicalManualsView';

// Intelligence Views
import { DiagnosticsTerminalView } from './components/views/DiagnosticsTerminalView';
import { VisualIntelligenceView } from './components/views/VisualIntelligenceView';
import { TroubleshootingView } from './components/views/TroubleshootingView';
import { SopExecutionView } from './components/views/SopExecutionView';
import { ExpertKnowledgeView } from './components/views/ExpertKnowledgeView';

// Governance & Settings Views
import { AuditLedgerView } from './components/views/AuditLedgerView';
import { SettingsView } from './components/views/SettingsView';
import { SystemHealthView } from './components/views/SystemHealthView';

// Modal component
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';

export const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ActiveNavModule>('overview');
  const [plantSite, setPlantSite] = useState('PLANT-TX-04');
  const [systemHealthy] = useState(true);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-graphite-950 text-graphite-200">
      {/* Top Header Rail */}
      <HeaderRail
        plantSite={plantSite}
        onPlantChange={setPlantSite}
        onOpenHealthModal={() => setIsHealthModalOpen(true)}
        systemHealthy={systemHealthy}
      />

      {/* Main App Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar with all 10 modules */}
        <SidebarNav
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          onOpenSystemModal={() => setIsHealthModalOpen(true)}
        />

        {/* Dynamic Main Workspace Stage */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {activeModule === 'overview' && (
            <OverviewView onNavigate={(mod) => setActiveModule(mod as ActiveNavModule)} />
          )}
          {activeModule === 'plants-assets' && <AssetDirectoryView />}
          {activeModule === 'knowledge-hub' && <TechnicalManualsView />}
          {activeModule === 'ai-copilot' && <DiagnosticsTerminalView />}
          {activeModule === 'visual-intelligence' && <VisualIntelligenceView />}
          {activeModule === 'troubleshooting' && (
            <TroubleshootingView onNavigateToSop={() => setActiveModule('maintenance')} />
          )}
          {activeModule === 'maintenance' && <SopExecutionView />}
          {activeModule === 'expert-knowledge' && <ExpertKnowledgeView />}
          {activeModule === 'security-audit' && <AuditLedgerView />}
          {activeModule === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Deep Subsystem Diagnostic Modal */}
      <Modal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
        title="Subsystem Telemetry & Infrastructure Health"
        subtitle="Live state of PostgreSQL, Qdrant Vector Store, MinIO S3, and Ollama Runtime"
        maxWidth="2xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setIsHealthModalOpen(false)}>
            Close Inspector
          </Button>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto">
          <SystemHealthView />
        </div>
      </Modal>
    </div>
  );
};

export default App;

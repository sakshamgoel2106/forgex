import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import { PlantProvider } from './lib/PlantContext';
import { AppShell } from './components/layout/AppShell';
import type { NavModule } from './components/layout/Sidebar';
import { ShieldAlert, ArrowRight } from 'lucide-react';

import { OverviewView } from './components/views/OverviewView';
import { AssetDirectoryView } from './components/views/AssetDirectoryView';
import { TechnicalManualsView } from './components/views/TechnicalManualsView';
import { CopilotWorkspaceView } from './components/views/CopilotWorkspaceView';
import { MaintenanceWorkspaceView } from './components/views/MaintenanceWorkspaceView';
import { ExpertKnowledgeView } from './components/views/ExpertKnowledgeView';
import { TeamManagementView } from './components/views/TeamManagementView';
import { EngineeringAssetCenterView } from './components/views/EngineeringAssetCenterView';
import { SettingsView } from './components/views/SettingsView';
import { LoginView } from './components/views/LoginView';
import { MachineRecoveryView } from './components/views/MachineRecoveryView';
import { TroubleshootingView } from './components/views/TroubleshootingView';
import { MaintenanceHistoryView } from './components/views/MaintenanceHistoryView';
import { TechnicianWorkspaceView } from './components/views/TechnicianWorkspaceView';
import { ReportsAnalyticsView } from './components/views/ReportsAnalyticsView';
import { NotificationsFeedView } from './components/views/NotificationsFeedView';
import { OemEscalationsView } from './components/views/OemEscalationsView';

export function getDefaultModuleForRole(role?: string): NavModule {
  switch (role) {
    case 'ORGANIZATION_OWNER':
    case 'ORGANIZATION_ADMIN':
    case 'PLANT_MANAGER':
      return 'overview';
    case 'TECHNICIAN':
    case 'WORKER':
      return 'tech';
    case 'ENGINEER':
    case 'ENGINEER_TECHNICIAN':
      return 'overview';
    default:
      return 'overview';
  }
}

const RBACFallbackBanner: React.FC<{
  moduleName: string;
  role: string;
  onRedirect: (mod: NavModule) => void;
}> = ({ moduleName, role, onRedirect }) => {
  const fallbackMod = getDefaultModuleForRole(role);
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0B0F17] text-[#E2E8F0] min-h-[500px]">
      <div className="max-w-md w-full bg-[#141B26] border border-[#243145] rounded-xl p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono text-[11px] font-semibold mb-2 uppercase tracking-wider border border-amber-500/30">
          Security Access Control · Restricted
        </div>
        <h2 className="text-base font-bold text-white mb-2 font-mono">
          {moduleName.toUpperCase()} ACCESS RESTRICTED
        </h2>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed font-sans">
          Your current industrial role <strong className="text-amber-400 font-mono">[{role}]</strong> does not hold sufficient permission bitmasks for this module.
          Shop-floor operations, technician queues, and plant governance are strictly segmented.
        </p>
        <button
          onClick={() => onRedirect(fallbackMod)}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-mono font-semibold text-xs rounded-lg transition shadow-md flex items-center justify-center gap-2"
        >
          <span>Return to Authorized Workspace ({fallbackMod.toUpperCase()})</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, membership, token, isLoading, isRegistering, isOwnerOrAdmin } = useAuth();
  const getInitialModule = (): NavModule => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname + window.location.hash;
      if (path.includes('ai-copilot')) return 'copilot';
      if (path.includes('troubleshooting')) return 'troubleshooting';
    }
    return 'overview';
  };

  const [activeModule, setActiveModule] = useState<NavModule>(getInitialModule());
  const [navTargetId, setNavTargetId] = useState<string | undefined>(undefined);

  const role = membership?.role || (() => { if (typeof window !== 'undefined') { try { const mem = localStorage.getItem('forgex_membership'); if (mem) return JSON.parse(mem).role; } catch {} } return 'VIEWER'; })();

  // Role-aware automatic initial routing
  useEffect(() => {
    if (membership?.role) {
      if (membership.role === 'WORKER' && activeModule === 'overview') {
        setActiveModule('worker');
      } else if (membership.role === 'TECHNICIAN' && activeModule === 'overview') {
        setActiveModule('tech');
      }
    }
  }, [membership?.role]);

  // Global cross-module navigation and popstate event listener
  useEffect(() => {
    const handleNavEvent = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const detail = customEvent.detail;
      const target = typeof detail === 'string' ? detail : (detail?.module || detail?.tab);
      const caseOrTicketId = typeof detail === 'object' ? (detail?.ticketId || detail?.caseId) : undefined;
      
      if (caseOrTicketId) {
        setNavTargetId(caseOrTicketId);
      }

      if (target) {
        if (target === 'expert-knowledge' || target === 'expert') {
          setActiveModule('expert');
        } else if (target === 'maintenance-history' || target === 'history') {
          setActiveModule('history');
        } else if (target === 'raised-tickets' || target === 'tech') {
          setActiveModule('tech');
        } else if (target === 'maintenance' || target === 'sop') {
          setActiveModule('maintenance');
        } else {
          setActiveModule(target as NavModule);
        }
      }
    };

    const handlePopState = () => {
      const path = window.location.pathname + window.location.hash;
      if (path.includes('ai-copilot')) {
        setActiveModule('copilot');
      } else if (path.includes('troubleshooting')) {
        setActiveModule('troubleshooting');
      } else if (path.includes('expert-knowledge') || path.includes('expert')) {
        setActiveModule('expert');
      } else if (path.includes('maintenance-history') || path.includes('history')) {
        setActiveModule('history');
      }
    };

    window.addEventListener('forgex:navigate', handleNavEvent);
    window.addEventListener('navigate-tab', handleNavEvent);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('forgex:navigate', handleNavEvent);
      window.removeEventListener('navigate-tab', handleNavEvent);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Persistent client-side tab caching to eliminate re-fetch lag on tab switches
  const [visitedTabs, setVisitedTabs] = useState<Set<NavModule>>(
    () => new Set([activeModule, 'copilot', 'overview', 'assets'])
  );

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeModule)) return prev;
      const next = new Set(prev);
      next.add(activeModule);
      return next;
    });
  }, [activeModule]);

  // Immediate localStorage fallback check
  const hasLocalSession = Boolean(
    typeof window !== 'undefined' &&
    localStorage.getItem('forgex_token') &&
    (localStorage.getItem('forgex_user') || localStorage.getItem('forgex_active_org_id') || localStorage.getItem('forgex_organization'))
  );

  if (isLoading || isRegistering) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F17] text-[#E2E8F0]">
        <div className="flex flex-col items-center gap-3">
          <img src="/forgex_icon.png" alt="ForgeX AI" className="w-10 h-10 animate-bounce" />
          <span className="text-xs font-mono font-bold tracking-wider text-gray-400">
            {isRegistering ? 'INITIALIZING COMPANY WORKSPACE...' : 'AUTHENTICATING FORGEX SESSION...'}
          </span>
        </div>
      </div>
    );
  }

  if ((!token || !user) && !hasLocalSession) {
    return (
      <LoginView
        onSuccess={(loggedRole) => {
          const target = getDefaultModuleForRole(loggedRole || membership?.role);
          setActiveModule(target);
        }}
      />
    );
  }

  const renderActiveView = () => {
    switch (activeModule) {
      case 'overview':
        if (role === 'WORKER') {
          return <RBACFallbackBanner moduleName="Plant Overview" role={role} onRedirect={setActiveModule} />;
        }
        return <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
      case 'assets':
        return <AssetDirectoryView />;
      case 'engineering-assets':
        if (role === 'WORKER') {
          return <RBACFallbackBanner moduleName="Engineering Asset Center" role={role} onRedirect={setActiveModule} />;
        }
        return isOwnerOrAdmin || role === 'ENGINEER' || role === 'PLANT_MANAGER' ? (
          <EngineeringAssetCenterView />
        ) : (
          <RBACFallbackBanner moduleName="Engineering Asset Center" role={role} onRedirect={setActiveModule} />
        );
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
            onNavigate={(mod, targetId) => {
              if (targetId) setNavTargetId(targetId);
              if (mod === 'expert-knowledge' || mod === 'expert') setActiveModule('expert');
              else if (mod === 'maintenance-history' || mod === 'history') setActiveModule('history');
              else if (mod === 'raised-tickets' || mod === 'tech') setActiveModule('tech');
              else if (mod === 'maintenance' || mod === 'sop') setActiveModule('maintenance');
              else setActiveModule(mod as NavModule);
            }}
            setActiveTab={(tab) => {
              if (tab === 'expert-knowledge' || tab === 'expert') setActiveModule('expert');
              else if (tab === 'maintenance-history' || tab === 'history') setActiveModule('history');
              else if (tab === 'raised-tickets' || tab === 'tech') setActiveModule('tech');
              else setActiveModule(tab as NavModule);
            }}
          />
        );
      case 'expert':
        return <ExpertKnowledgeView onNavigateToCopilot={(_assetTag) => setActiveModule('copilot')} />;
      case 'maintenance':
        return <MaintenanceWorkspaceView initialCaseId={navTargetId} />;
      case 'history':
        return (
          <MaintenanceHistoryView
            onNavigate={(mod) => setActiveModule(mod as NavModule)}
            onNavigateToWorkOrder={(_ticket) => setActiveModule('maintenance')}
          />
        );
      case 'tech':
        return (
          <TechnicianWorkspaceView
            initialTicketId={navTargetId}
            onLaunchSop={() => setActiveModule('maintenance')}
            onNavigateToCopilot={(_tag) => setActiveModule('copilot')}
          />
        );
      case 'oem-escalations':
        return (
          <OemEscalationsView
            onNavigateToTechQueue={(ticketId) => {
              setNavTargetId(ticketId);
              setActiveModule('tech');
            }}
          />
        );
      case 'worker':
        return (
          <TechnicianWorkspaceView
            initialTicketId={navTargetId}
            onLaunchSop={() => setActiveModule('maintenance')}
            onNavigateToCopilot={(_tag) => setActiveModule('copilot')}
          />
        );
      case 'reports':
        return <ReportsAnalyticsView onDrillDown={(_m) => setActiveModule('history')} />;
      case 'notifications':
        return <NotificationsFeedView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
      case 'team':
        return isOwnerOrAdmin ? (
          <TeamManagementView />
        ) : (
          <RBACFallbackBanner moduleName="Team & Access Control" role={role} onRedirect={setActiveModule} />
        );
      case 'audit':
        return isOwnerOrAdmin || role === 'PLANT_MANAGER' ? (
          <SettingsView initialTab="security" />
        ) : (
          <RBACFallbackBanner moduleName="Security & Audit Ledger" role={role} onRedirect={setActiveModule} />
        );
      case 'settings':
        return <SettingsView initialTab="profile" />;
      default:
        return <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />;
    }
  };

  const isCachedTab = (tab: NavModule) => ['overview', 'assets', 'copilot'].includes(tab);

  return (
    <AppShell activeModule={activeModule} onSelectModule={setActiveModule}>
      {/* 1. Cached Persistent Core Views (Instant 0ms Tab Switching) */}
      <div className={activeModule === 'overview' ? 'h-full w-full block' : 'h-full w-full hidden'}>
        {visitedTabs.has('overview') &&
          (role === 'WORKER' ? (
            <RBACFallbackBanner moduleName="Plant Overview" role={role} onRedirect={setActiveModule} />
          ) : (
            <OverviewView onNavigate={(mod) => setActiveModule(mod as NavModule)} />
          ))}
      </div>

      <div className={activeModule === 'assets' ? 'h-full w-full block' : 'h-full w-full hidden'}>
        {visitedTabs.has('assets') && <AssetDirectoryView />}
      </div>

      <div className={activeModule === 'copilot' ? 'h-full w-full block' : 'h-full w-full hidden'}>
        {visitedTabs.has('copilot') && <CopilotWorkspaceView />}
      </div>

      {/* 2. Dynamic Views */}
      {!isCachedTab(activeModule) && renderActiveView()}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <PlantProvider>
          <AppContent />
        </PlantProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;

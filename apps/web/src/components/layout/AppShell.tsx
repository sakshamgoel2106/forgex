import React, { useState } from 'react';
import { Sidebar, type NavModule } from './Sidebar';
import { TopBar } from './TopBar';
import { GlobalSearchModal } from './GlobalSearchModal';
import { NotificationsDrawer } from './NotificationsDrawer';
import { Modal } from '../ui/Modal';
import { SystemHealthView } from '../views/SystemHealthView';
import { Sheet, SheetContent } from '../ui/sheet';
import { TooltipProvider } from '../ui/tooltip';

interface AppShellProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeModule,
  onSelectModule,
  children,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('forgex_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [plantSite, setPlantSite] = useState<string>('PLANT-TX-04');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [healthModalOpen, setHealthModalOpen] = useState(false);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('forgex_sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleModuleSelect = (module: NavModule) => {
    onSelectModule(module);
    setMobileNavOpen(false);
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-industrial-bg text-industrial-text font-sans antialiased">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex h-full shrink-0">
          <Sidebar
            activeModule={activeModule}
            onSelectModule={handleModuleSelect}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onOpenTelemetryModal={() => setHealthModalOpen(true)}
          />
        </div>

        {/* Mobile Navigation Sheet */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="p-0 w-64 bg-industrial-sidebar border-r border-industrial-border"
          >
            <Sidebar
              activeModule={activeModule}
              onSelectModule={handleModuleSelect}
              collapsed={false}
              onToggleCollapse={() => setMobileNavOpen(false)}
              onOpenTelemetryModal={() => {
                setMobileNavOpen(false);
                setHealthModalOpen(true);
              }}
            />
          </SheetContent>
        </Sheet>

        {/* Main Application Column */}
        <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden">
          {/* Top Navigation Bar */}
          <TopBar
            activeModule={activeModule}
            plantSite={plantSite}
            onPlantChange={setPlantSite}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onOpenHealthModal={() => setHealthModalOpen(true)}
            onNavigate={handleModuleSelect}
          />

          {/* Primary View Workspace */}
          <main className="flex-1 overflow-hidden relative flex flex-col bg-industrial-bg">
            {children}
          </main>
        </div>

        {/* Global Modals & Drawers */}
        <GlobalSearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={(mod) => handleModuleSelect(mod as NavModule)}
        />

        <NotificationsDrawer
          isOpen={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onNavigate={(mod) => handleModuleSelect(mod as NavModule)}
        />

        {/* System Health / Telemetry Modal */}
        <Modal
          isOpen={healthModalOpen}
          onClose={() => setHealthModalOpen(false)}
          title="Stack Telemetry & Subsystem Probes"
          subtitle="Real-time health verification across PostgreSQL, Qdrant, MinIO, Redis & Ollama"
          maxWidth="xl"
        >
          <SystemHealthView />
        </Modal>
      </div>
    </TooltipProvider>
  );
};

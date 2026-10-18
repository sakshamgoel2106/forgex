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

  const [plantSite, setPlantSite] = useState<string>('RIVERSIDE');
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
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#06090E] text-slate-100 font-sans antialiased">
        {/* Full-width Top Navigation Rail */}
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

        {/* Workspace Body: Left Sidebar + Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop Left Sidebar */}
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
              className="p-0 w-64 bg-[#080D14] border-r border-[#182333]"
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

          {/* Main Center & Right Workspaces */}
          <main className="flex-1 overflow-hidden relative flex flex-col bg-[#06090E]">
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
          title="System Health Details"
          subtitle="Real-time operational status across all subsystem watchdogs"
          maxWidth="xl"
        >
          <SystemHealthView />
        </Modal>
      </div>
    </TooltipProvider>
  );
};

import React, { useState } from 'react';
import { usePlant } from '../../lib/PlantContext';
import { Sidebar, type NavModule } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileHeader } from '../mobile/MobileHeader';
import { MobileBottomNav } from '../mobile/MobileBottomNav';
import { GlobalSearchModal } from './GlobalSearchModal';
import { NotificationsDrawer } from './NotificationsDrawer';
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

  const { plantSite, setPlantSite } = usePlant();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <div
        className="flex flex-col h-screen w-screen overflow-hidden font-sans antialiased"
        style={{ background: '#F0F2F5', color: '#0E1621' }}
      >
        {/* Desktop Top Navigation Rail (md and above) */}
        <div className="hidden md:block shrink-0">
          <TopBar
            activeModule={activeModule}
            plantSite={plantSite}
            onPlantChange={setPlantSite}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onNavigate={handleModuleSelect}
            onToggleSidebar={toggleCollapse}
            sidebarCollapsed={collapsed}
          />
        </div>

        {/* Compact Mobile Top Header (below md) */}
        <div className="block md:hidden shrink-0">
          <MobileHeader onNavigate={handleModuleSelect} />
        </div>

        {/* Workspace Body: Left Sidebar + Main Content */}
        <div className="flex flex-1 overflow-hidden min-h-0 min-w-0 w-full relative">
          {/* Desktop Left Sidebar (hidden on mobile) */}
          <div className="hidden md:flex h-full shrink-0">
            <Sidebar
              activeModule={activeModule}
              onSelectModule={handleModuleSelect}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
            />
          </div>

          {/* Mobile Navigation Sheet */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="p-0 w-60 border-r border-[#243145]"
              style={{ background: '#1B2537' }}
            >
              <Sidebar
                activeModule={activeModule}
                onSelectModule={handleModuleSelect}
                collapsed={false}
                onToggleCollapse={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>

          {/* Main workspace content area with mobile bottom padding */}
          <main
            className="flex-1 min-w-0 min-h-0 overflow-hidden relative flex flex-col w-full h-full pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0"
            style={{ background: '#F0F2F5' }}
          >
            {children}
          </main>
        </div>

        {/* Fixed Mobile Bottom Navigation (visible only below md) */}
        <MobileBottomNav
          activeModule={activeModule}
          onSelectModule={handleModuleSelect}
        />

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
      </div>
    </TooltipProvider>
  );
};

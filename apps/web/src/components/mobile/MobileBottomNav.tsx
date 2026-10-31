import React from 'react';
import { ClipboardList, QrCode, MessageSquare, ShieldAlert } from 'lucide-react';
import type { NavModule } from '../layout/Sidebar';
import { useAuth } from '../../lib/AuthContext';
import { hasPermission, type OrgRole } from '@forgex/shared-types';

export interface MobileBottomNavProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
}

interface MobileTabItem {
  id: 'tasks' | 'scan' | 'copilot' | 'loto';
  module: NavModule;
  label: string;
  icon: React.ElementType;
  /** Function to verify if user has sufficient RBAC permissions */
  isPermitted: (role: OrgRole) => boolean;
}

const TABS: MobileTabItem[] = [
  {
    id: 'tasks',
    module: 'tech',
    label: 'Tasks',
    icon: ClipboardList,
    isPermitted: (role: OrgRole) =>
      hasPermission(role, 'maintenance:read') ||
      hasPermission(role, 'tasks:read') ||
      hasPermission(role, 'tickets:read') ||
      role === 'WORKER' ||
      role === 'TECHNICIAN',
  },
  {
    id: 'scan',
    module: 'scan',
    label: 'Scan',
    icon: QrCode,
    isPermitted: (role: OrgRole) =>
      hasPermission(role, 'machines:read') ||
      hasPermission(role, 'assets:read'),
  },
  {
    id: 'copilot',
    module: 'copilot',
    label: 'Copilot',
    icon: MessageSquare,
    isPermitted: (role: OrgRole) =>
      hasPermission(role, 'copilot:query'),
  },
  {
    id: 'loto',
    module: 'loto',
    label: 'LOTO',
    icon: ShieldAlert,
    isPermitted: (role: OrgRole) =>
      hasPermission(role, 'maintenance:execute') ||
      hasPermission(role, 'maintenance:read') ||
      role === 'WORKER' ||
      role === 'TECHNICIAN',
  },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeModule,
  onSelectModule,
}) => {
  const { membership } = useAuth();
  const role: OrgRole = (membership?.role as OrgRole) || 'VIEWER';

  // Filter tabs according to RBAC permissions
  const visibleTabs = TABS.filter((tab) => tab.isPermitted(role));

  const isTabActive = (tab: MobileTabItem) => {
    if (tab.id === 'tasks') {
      return activeModule === 'tech' || activeModule === 'worker' || activeModule === 'maintenance';
    }
    return activeModule === tab.module;
  };

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-slate-900 border-t border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around w-full px-2 min-h-[56px] h-14">
        {visibleTabs.map((tab) => {
          const active = isTabActive(tab);
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectModule(tab.module)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] min-w-[56px] py-1 px-2 rounded-xl transition-all duration-200 select-none relative group ${
                active
                  ? 'text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 active:text-slate-100'
              }`}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              {/* Active top pill indicator */}
              {active && (
                <span className="absolute top-1 w-6 h-1 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-in fade-in zoom-in-75 duration-200" />
              )}

              <div
                className={`p-1.5 rounded-lg transition-transform ${
                  active
                    ? 'scale-110 bg-amber-400/10 text-amber-400'
                    : 'group-active:scale-95 text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>

              <span className="text-[11px] font-medium tracking-tight mt-0.5 leading-none font-sans">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

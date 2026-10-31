import React, { useState, useEffect } from 'react';
import {
  WifiOff,
  LogOut,
  Settings,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useAuth } from '../../lib/AuthContext';
import { useDeployment } from '../../lib/RuntimeConfig';
import type { NavModule } from '../layout/Sidebar';

export interface MobileHeaderProps {
  onNavigate?: (module: NavModule) => void;
}

const ROLE_DISPLAY_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  ORGANIZATION_OWNER: {
    label: 'OWNER',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  ORGANIZATION_ADMIN: {
    label: 'ADMIN',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  },
  SUPERVISOR: {
    label: 'SUPV',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  },
  PLANT_MANAGER: {
    label: 'MGR',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  ENGINEER: {
    label: 'ENG',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
  ENGINEER_TECHNICIAN: {
    label: 'ENG-TECH',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
  },
  TECHNICIAN: {
    label: 'TECH',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  WORKER: {
    label: 'WORKER',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  VIEWER: {
    label: 'VIEW',
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  },
};

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onNavigate }) => {
  const { user, organization, membership, logout } = useAuth();
  const { mode: deploymentMode, branding } = useDeployment();
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const role: string = membership?.role || 'VIEWER';
  const roleConfig = ROLE_DISPLAY_CONFIG[role] || {
    label: role.slice(0, 5),
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  };

  const userName = user?.fullName || 'Technician';
  const userInitials =
    user?.fullName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'FX';

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900 border-b border-slate-800 text-slate-100 select-none pt-[env(safe-area-inset-top)] shadow-md">
      <div className="h-14 px-3 flex items-center justify-between gap-2">
        {/* Left: Brand icon + Organization Name */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 p-0.5 shadow-sm shrink-0 flex items-center justify-center">
            <img
              src={branding.logoUrl || '/forgex_icon.png'}
              alt={branding.name}
              className="w-full h-full object-contain filter brightness-110"
            />
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="font-bold text-xs text-white tracking-tight truncate max-w-[120px] sm:max-w-[170px]">
                {organization?.name || branding.name}
              </span>
              {deploymentMode === 'enterprise' ? (
                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold tracking-tight bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                  Enterprise · On-Prem
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold tracking-tight bg-blue-500/20 text-blue-300 border border-blue-500/40 shrink-0">
                  Cloud
                </span>
              )}
            </div>
            <span className="text-[9px] text-slate-400 font-mono tracking-wider uppercase">
              Field PWA
            </span>
          </div>
        </div>

        {/* Center: Role Badge + Online/Offline Indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* User Role Badge */}
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider border shadow-sm ${roleConfig.badgeClass}`}
            title={`Assigned Role: ${role}`}
          >
            {roleConfig.label}
          </span>

          {/* Online / Offline status badge */}
          {isOnline ? (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono"
              title="Online: Cloud synchronized"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden xs:inline text-[9px] font-semibold">LIVE</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-mono animate-bounce"
              title="Offline: Local cache active"
            >
              <WifiOff className="w-2.5 h-2.5" />
              <span className="text-[9px] font-bold">OFFLINE</span>
            </div>
          )}
        </div>

        {/* Right: User Profile & Logout Dropdown Menu */}
        <div className="shrink-0 pl-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 p-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer"
                aria-label="User account and logout menu"
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={userName}
                    className="w-7 h-7 rounded-full object-cover border border-slate-600"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                    {userInitials}
                  </div>
                )}
                <ChevronDown className="w-3 h-3 text-slate-400 mr-0.5" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-56 bg-slate-900 border-slate-800 text-slate-100 shadow-2xl p-1.5 rounded-xl"
            >
              <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{userName}</div>
                  <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
                  <div className="text-[9px] text-amber-400 font-mono mt-0.5">Role: {role}</div>
                </div>
              </div>

              {onNavigate && (
                <>
                  <DropdownMenuItem
                    onClick={() => onNavigate('settings')}
                    className="text-xs cursor-pointer text-slate-200 hover:bg-slate-800 focus:bg-slate-800 gap-2 py-2 mt-1 rounded-lg"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>App Settings</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onNavigate('audit')}
                    className="text-xs cursor-pointer text-slate-200 hover:bg-slate-800 focus:bg-slate-800 gap-2 py-2 rounded-lg"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Security & Audit</span>
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator className="bg-slate-800 my-1" />

              <DropdownMenuItem
                onClick={() => logout()}
                className="text-xs cursor-pointer text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10 gap-2 py-2 rounded-lg font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out of ForgeX</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

import React, { useState } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  Clock,
  Building2,
  Menu,
  Cpu,
  Activity,
  ShieldCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { NavModule } from './Sidebar';
import { useAuth } from '../../lib/AuthContext';
import { usePlant } from '../../lib/PlantContext';

interface TopBarProps {
  activeModule: NavModule;
  plantSite: string;
  onPlantChange: (site: string) => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenMobileNav: () => void;
  onOpenHealthModal: () => void;
  onNavigate: (module: NavModule) => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

const MODULE_LABELS: Record<NavModule, string> = {
  overview: 'Overview',
  assets: 'Assets & Machines',
  'engineering-assets': 'Engineering Workspace',
  'machine-recovery': 'Machine Recovery',
  'knowledge-hub': 'Knowledge Hub',
  copilot: 'AI Copilot',
  troubleshooting: 'Troubleshooting & RCA',
  expert: 'Expert Knowledge',
  maintenance: 'Work Orders',
  history: 'Maintenance History',
  visual: 'Visual Intelligence',
  tech: 'Technician Queue',
  worker: 'Worker Workspace',
  reports: 'Reports & Analytics',
  notifications: 'Notifications',
  team: 'Team & Access',
  audit: 'Security & Audit',
  settings: 'Settings & Health',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeModule,
  plantSite,
  onPlantChange,
  onOpenSearch,
  onOpenNotifications,
  onOpenMobileNav,
  onOpenHealthModal,
  onNavigate,
  onToggleSidebar,
  sidebarCollapsed,
}) => {
  const { user, organization, membership, memberships, logout, switchOrganization } = useAuth();
  const { plants } = usePlant();
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);

  const userName = user?.fullName || 'John Doe';
  const userInitials = userName
    .split(' ')
    .map((s) => s[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const roleLabel = membership?.role?.replace(/_/g, ' ') || 'Administrator';
  const orgName = organization?.name || 'Apex Energy Operations';
  const currentModuleLabel = MODULE_LABELS[activeModule] || 'Overview';

  return (
    <div className="shrink-0">
      {/* Main TopBar */}
      <header
        className="h-14 px-4 md:px-5 flex items-center justify-between gap-4 select-none z-30"
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #D1D9E6',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {/* Left: Logo + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile menu */}
          <button
            onClick={onOpenMobileNav}
            className="md:hidden p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            aria-label="Open mobile navigation"
          >
            <Menu className="w-4.5 h-4.5" />
          </button>

          {/* Sidebar collapse toggle */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="hidden md:flex p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              aria-label="Toggle sidebar"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Brand mark with official ForgeX icon */}
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => onNavigate('overview')}
          >
            <img
              src="/forgex_icon.png"
              alt="ForgeX AI"
              className="w-7 h-7 object-contain shrink-0 filter drop-shadow-sm transition-transform group-hover:scale-105"
            />
            <div>
              <div className="text-sm font-bold tracking-tight text-gray-900 leading-tight">
                ForgeX <span className="text-[#1D4ED8]">AI</span>
              </div>
              <div className="text-[9px] text-gray-400 leading-tight font-medium uppercase tracking-wider">
                Industrial Intelligence
              </div>
            </div>
          </div>

          {/* Breadcrumb divider + module name */}
          <div className="hidden md:flex items-center gap-2 ml-1">
            <span className="text-gray-300 text-sm">/</span>
            <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
              {currentModuleLabel}
            </span>
          </div>
        </div>

        {/* Center: Global Search */}
        <div className="flex-1 max-w-lg mx-2">
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-gray-50 border border-gray-200 hover:border-[#1D4ED8] text-gray-400 hover:text-gray-600 transition text-xs group shadow-inner"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 group-hover:text-[#1D4ED8] transition" />
              <span className="text-gray-400">Search assets, documents, questions... </span>
            </div>
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded font-mono">
              <Clock className="w-2.5 h-2.5" /> Ctrl+K
            </span>
          </button>
        </div>

        {/* Right: Plant + Alerts + User */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Plant Context Bar [Org: Name | Plant: Site] */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:border-[#1D4ED8] transition text-left outline-none shadow-sm">
                <Building2 className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
                <div className="min-w-0 flex items-center gap-1.5 text-xs font-mono">
                  <span className="font-semibold text-gray-800 truncate max-w-[120px]">
                    {organization?.name || 'Acme Industries'}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-600 truncate max-w-[110px]">
                    {plants.find(
                      (p) => (p.code || p.id).toUpperCase() === plantSite.toUpperCase() || p.key === plantSite
                    )?.name || (plantSite === 'RIVERSIDE' ? 'Riverside Plant' : plantSite === 'GULF' ? 'Gulf Coast' : plantSite === 'MIDWEST' ? 'Midwest Cracker' : plantSite)}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 text-gray-400 ml-0.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-white border-gray-200 shadow-lg">
              <DropdownMenuLabel className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Industrial Complexes
              </DropdownMenuLabel>
              {plants.map((p) => {
                const pKey = p.key || p.code || p.id;
                const pLabel = p.label || p.name;
                const isSelected = plantSite.toUpperCase() === pKey.toUpperCase();
                return (
                  <DropdownMenuItem
                    key={pKey}
                    onClick={() => onPlantChange(pKey)}
                    className="text-xs cursor-pointer focus:bg-gray-50 flex items-center justify-between py-2"
                  >
                    <div>
                      <div className="font-medium text-gray-800">{pLabel}</div>
                      {p.sub && <div className="text-[10px] text-gray-400">{p.sub}</div>}
                    </div>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] ml-2" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notification Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-[#1D4ED8] transition shadow-sm"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              3
            </span>
          </button>

          {/* System Health */}
          <button
            onClick={onOpenHealthModal}
            className="hidden lg:flex p-2 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-[#16A34A] hover:border-green-300 transition shadow-sm"
            aria-label="System health"
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-1 outline-none group">
                <div className="w-8 h-8 rounded-full bg-[#1D4ED8] text-white flex items-center justify-center text-xs font-bold border-2 border-[#BFDBFE]">
                  {userInitials}
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-semibold text-gray-800 group-hover:text-[#1D4ED8] transition leading-tight">
                    {userName}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-tight capitalize">{roleLabel.toLowerCase()}</div>
                </div>
                <ChevronDown className="hidden md:block w-3 h-3 text-gray-400 group-hover:text-gray-600" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 bg-white border-gray-200 shadow-xl">
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="font-semibold text-sm text-gray-900">{userName}</div>
                <div className="text-[11px] text-[#1D4ED8] font-semibold capitalize">{roleLabel.toLowerCase()}</div>
                <div className="text-[10px] text-gray-400 truncate mt-0.5">{orgName}</div>
              </div>
              <DropdownMenuItem
                onClick={() => onNavigate('settings')}
                className="text-xs cursor-pointer focus:bg-gray-50 gap-2 py-2"
              >
                <Cpu className="w-3.5 h-3.5 text-[#1D4ED8]" />
                Inference & Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onOpenHealthModal}
                className="text-xs cursor-pointer focus:bg-gray-50 gap-2 py-2"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                System Health
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNavigate('audit')}
                className="text-xs cursor-pointer focus:bg-gray-50 gap-2 py-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                Security & Audit
              </DropdownMenuItem>
              {memberships.length > 1 && (
                <>
                  <DropdownMenuSeparator className="bg-gray-100" />
                  <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Switch Organization
                  </DropdownMenuLabel>
                  {memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => switchOrganization(m.organizationId)}
                      className="text-xs cursor-pointer focus:bg-gray-50 flex items-center justify-between"
                    >
                      <span className="truncate">{m.organizationId}</span>
                      {m.organizationId === organization?.id && (
                        <span className="text-[10px] text-[#1D4ED8] font-semibold ml-2">Active</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator className="bg-gray-100" />
              <DropdownMenuItem
                onClick={logout}
                className="text-xs cursor-pointer text-red-600 hover:text-red-700 focus:bg-red-50 gap-2 py-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* AI Rate Limit Notice Banner (dismissible) */}
      {!rateLimitDismissed && (
        <div
          className="flex items-center justify-between px-4 py-2 text-xs gap-3"
          style={{
            background: 'linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%)',
            borderBottom: '1px solid #FDE68A',
            color: '#92400E',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="font-medium">AI Model Capacity Notice:</span>
            <span className="text-amber-700">
              If Gemini API quota limits are reached, ForgeX automatically queues your request and retries via fallback models (Gemini Flash → Pro). No data is lost.
            </span>
          </div>
          <button
            onClick={() => setRateLimitDismissed(true)}
            className="shrink-0 p-1 rounded hover:bg-amber-200 transition"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3 text-amber-600" />
          </button>
        </div>
      )}
    </div>
  );
};

import React from 'react';
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

interface TopBarProps {
  activeModule: NavModule;
  plantSite: string;
  onPlantChange: (site: string) => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenMobileNav: () => void;
  onOpenHealthModal: () => void;
  onNavigate: (module: NavModule) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  plantSite,
  onPlantChange,
  onOpenSearch,
  onOpenNotifications,
  onOpenMobileNav,
  onOpenHealthModal,
  onNavigate,
}) => {
  return (
    <header className="h-16 border-b border-[#1A2332] bg-[#0B0F15] px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-30 select-none">
      {/* Left: Brand & Tagline */}
      <div className="flex items-center gap-6 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#151E28]"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('overview')}>
          {/* Stylized ForgeX Logo from Screenshot */}
          <div className="relative flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[#A3E635]"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 6C14 6 22 9 24 16C26 23 20 27 15 27C10 27 7 23 9 18C11 13 18 11 23 13"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle cx="11" cy="9" r="2.5" fill="currentColor" />
            </svg>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-white font-sans">
              ForgeX <span className="text-[#A3E635]">AI</span>
            </span>
          </div>

          <div className="hidden xl:block h-4 w-px bg-[#1E293B] mx-1" />

          <span className="hidden xl:block text-xs text-slate-400 font-sans tracking-wide">
            Industrial Intelligence. Real Answers.
          </span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-xl mx-2">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg bg-[#111722] border border-[#1E293B] hover:border-[#334155] text-slate-400 hover:text-slate-200 transition text-xs font-sans group shadow-inner"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-[#A3E635] transition" />
            <span className="truncate">Search documents, assets, questions... (Ctrl + K)</span>
          </div>
          <Clock className="w-4 h-4 text-slate-500 group-hover:text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Right Controls: Plant Selector, Notifications & User Info */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Plant Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#111722] border border-[#1E293B] hover:border-[#334155] transition text-left outline-none">
              <Building2 className="w-4 h-4 text-[#A3E635] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white leading-tight truncate">
                  {plantSite === 'RIVERSIDE' ? 'Riverside Plant' : 'Riverside Plant'}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight truncate font-sans">
                  Plant 1 • North Area
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#151E28] border-[#283543] text-white">
            <DropdownMenuLabel className="text-xs text-slate-400 font-mono">
              Industrial Complexes
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onPlantChange('RIVERSIDE')}
              className="text-xs cursor-pointer focus:bg-[#1E293B] font-medium"
            >
              Riverside Plant (Plant 1 • North Area)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onPlantChange('GULF')}
              className="text-xs cursor-pointer focus:bg-[#1E293B]"
            >
              Gulf Coast Refinery (Unit 4B)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onPlantChange('MIDWEST')}
              className="text-xs cursor-pointer focus:bg-[#1E293B]"
            >
              Midwest Cracker (Train 2)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notification Bell with Badge 3 */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-lg bg-[#111722] border border-[#1E293B] text-slate-300 hover:text-white hover:border-[#334155] transition"
          aria-label="View notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center font-mono">
            3
          </span>
        </button>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 pl-1 outline-none group">
              <div className="w-8 h-8 rounded-full bg-[#1E3A8A] border border-blue-500/40 text-blue-200 flex items-center justify-center text-xs font-bold font-sans">
                JD
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-bold text-white group-hover:text-[#A3E635] transition leading-tight">
                  John Doe
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Administrator
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-56 bg-[#151E28] border-[#283543] text-white shadow-2xl"
          >
            <DropdownMenuLabel className="font-mono text-xs text-slate-400">
              User Profile
            </DropdownMenuLabel>
            <div className="px-2 py-1.5 text-xs">
              <div className="font-semibold text-white">John Doe</div>
              <div className="text-[11px] text-slate-400">Administrator • Full Access</div>
            </div>
            <DropdownMenuSeparator className="bg-[#283543]" />
            <DropdownMenuItem
              onClick={() => onNavigate('settings')}
              className="text-xs cursor-pointer focus:bg-[#1E293B]"
            >
              <Cpu className="w-3.5 h-3.5 mr-2 text-[#A3E635]" />
              Inference & Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenHealthModal}
              className="text-xs cursor-pointer focus:bg-[#1E293B]"
            >
              <Activity className="w-3.5 h-3.5 mr-2 text-emerald-400" />
              System Health Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onNavigate('audit')}
              className="text-xs cursor-pointer focus:bg-[#1E293B]"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-2 text-cyan-400" />
              Security & Audit
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#283543]" />
            <DropdownMenuItem
              onClick={() => onNavigate('settings')}
              className="text-xs cursor-pointer text-rose-400 focus:bg-[#1E293B]"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

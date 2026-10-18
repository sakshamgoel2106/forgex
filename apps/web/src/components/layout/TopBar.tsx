import React from 'react';
import {
  Search,
  Bell,
  Sliders,
  ChevronDown,
  ShieldCheck,
  Menu,
  Cpu,
  Activity,
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

const MODULE_LABELS: Record<NavModule, { title: string; subtitle: string }> = {
  overview: { title: 'Operational Overview', subtitle: 'Plant telemetry, equipment metrics & active work orders' },
  assets: { title: 'Plants & Equipment Directory', subtitle: 'Searchable industrial machinery inventory & live status' },
  'knowledge-hub': { title: 'Industrial Knowledge Hub', subtitle: 'Validated engineering manuals, P&IDs, SOPs & vector index' },
  copilot: { title: 'Industrial AI Copilot', subtitle: 'Grounded diagnostic reasoning with strict citation gating' },
  visual: { title: 'Visual Industrial Intelligence', subtitle: 'Component detection, bounding box inspection & P&ID mapping' },
  maintenance: { title: 'Maintenance & Troubleshooting Workflows', subtitle: 'Root cause hypotheses, guided checklists & LOTO approvals' },
  expert: { title: 'Tribal & Expert Knowledge Repository', subtitle: 'Field-verified millwright insights & operational heuristics' },
  audit: { title: 'Security & Cryptographic Audit Ledger', subtitle: 'Tamper-evident logs, ISO-9001 compliance & SHA-256 signatures' },
  settings: { title: 'System Configuration & Deployment Policy', subtitle: 'Inference runtime selection, air-gap policies & data sovereignty' },
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
}) => {
  const meta = MODULE_LABELS[activeModule] || MODULE_LABELS.overview;

  return (
    <header className="h-14 border-b border-industrial-border bg-industrial-sidebar px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0 z-20">
      {/* Left: Mobile Toggle & Page Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-1.5 rounded text-industrial-secondary hover:text-industrial-text hover:bg-industrial-surface"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold font-sans text-industrial-text tracking-tight truncate">
              {meta.title}
            </h1>
            <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded bg-industrial-surface text-industrial-secondary border border-industrial-border uppercase">
              {activeModule}
            </span>
          </div>
          <p className="hidden lg:block text-[11px] text-industrial-secondary truncate -mt-0.5">
            {meta.subtitle}
          </p>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-md mx-2 hidden sm:block">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-industrial-bg border border-industrial-border hover:border-industrial-borderLight text-industrial-secondary hover:text-industrial-text transition text-xs font-sans group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-industrial-secondary group-hover:text-industrial-accent" />
            <span className="truncate">Search equipment, manuals, cases, P&IDs...</span>
          </div>
          <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-industrial-surface border border-industrial-border text-industrial-secondary">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right Controls: Plant Context, Sovereignty, Notifications & Profile */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Mobile Search Icon */}
        <button
          onClick={onOpenSearch}
          className="sm:hidden p-1.5 rounded text-industrial-secondary hover:text-industrial-text hover:bg-industrial-surface"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Plant Selector Dropdown */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-industrial-surface border border-industrial-border text-xs font-mono">
          <Sliders className="w-3.5 h-3.5 text-industrial-accent shrink-0" />
          <span className="text-industrial-secondary text-[11px]">PLANT:</span>
          <select
            value={plantSite}
            onChange={(e) => onPlantChange(e.target.value)}
            className="bg-transparent text-xs font-mono font-medium text-industrial-text outline-none cursor-pointer"
          >
            <option value="PLANT-TX-04" className="bg-industrial-surface text-industrial-text">
              PLANT-TX-04 (Refinery)
            </option>
            <option value="PLANT-OH-02" className="bg-industrial-surface text-industrial-text">
              PLANT-OH-02 (Rolling Mill)
            </option>
            <option value="PLANT-LA-01" className="bg-industrial-surface text-industrial-text">
              PLANT-LA-01 (Ethylene)
            </option>
          </select>
        </div>

        {/* Air-Gapped Sovereign Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-industrial-bg border border-industrial-border text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400">AIR-GAPPED OT</span>
        </div>

        {/* Notifications Trigger */}
        <button
          onClick={onOpenNotifications}
          className="relative p-1.5 rounded-md text-industrial-secondary hover:text-industrial-text hover:bg-industrial-surface border border-transparent hover:border-industrial-border transition"
          aria-label="View notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-industrial-accent ring-2 ring-industrial-sidebar" />
        </button>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pl-2 border-l border-industrial-border hover:opacity-90 outline-none">
              <div className="w-7 h-7 rounded-full bg-industrial-surface border border-industrial-border flex items-center justify-center text-industrial-accent font-mono text-xs font-bold">
                TV
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-xs font-medium text-industrial-text leading-tight">
                  T. Vance
                </div>
                <div className="text-[10px] font-mono text-industrial-secondary leading-tight">
                  PE-7089 • L4
                </div>
              </div>
              <ChevronDown className="w-3 h-3 text-industrial-secondary hidden lg:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-56 bg-industrial-surface border-industrial-border text-industrial-text shadow-2xl"
          >
            <DropdownMenuLabel className="font-mono text-xs text-industrial-secondary">
              Plant Engineering Auth
            </DropdownMenuLabel>
            <div className="px-2 py-1.5 text-xs">
              <div className="font-semibold text-industrial-text">Thomas Vance, PE</div>
              <div className="text-[11px] text-industrial-secondary font-mono">
                PE-7089 | Plant Level 4 Authority
              </div>
            </div>
            <DropdownMenuSeparator className="bg-industrial-border" />
            <DropdownMenuItem
              onClick={() => onNavigate('settings')}
              className="text-xs cursor-pointer focus:bg-industrial-sidebar"
            >
              <Cpu className="w-3.5 h-3.5 mr-2 text-industrial-accent" />
              Inference Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenHealthModal}
              className="text-xs cursor-pointer focus:bg-industrial-sidebar"
            >
              <Activity className="w-3.5 h-3.5 mr-2 text-emerald-400" />
              Stack Telemetry Health
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onNavigate('audit')}
              className="text-xs cursor-pointer focus:bg-industrial-sidebar"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-2 text-cyan-400" />
              Compliance & Audit Logs
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-industrial-border" />
            <DropdownMenuItem
              onClick={() => onNavigate('settings')}
              className="text-xs cursor-pointer text-rose-400 focus:bg-industrial-sidebar"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Disconnect Session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

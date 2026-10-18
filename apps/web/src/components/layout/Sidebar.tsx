import React from 'react';
import {
  LayoutDashboard,
  Factory,
  FileText,
  MessageSquare,
  ScanLine,
  HardHat,
  GraduationCap,
  ShieldCheck,
  Settings,
  ChevronRight,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';

export type NavModule =
  | 'overview'
  | 'assets'
  | 'knowledge-hub'
  | 'copilot'
  | 'visual'
  | 'maintenance'
  | 'expert'
  | 'audit'
  | 'settings';

interface SidebarProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenTelemetryModal?: () => void;
}

interface NavItemDef {
  id: NavModule;
  label: string;
  icon: React.ElementType;
  hasSubmenu?: boolean;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'assets', label: 'Plants & Assets', icon: Factory, hasSubmenu: true },
  { id: 'knowledge-hub', label: 'Knowledge Hub', icon: FileText },
  { id: 'copilot', label: 'AI Copilot', icon: MessageSquare },
  { id: 'visual', label: 'Visual Intelligence', icon: ScanLine },
  { id: 'maintenance', label: 'Maintenance', icon: HardHat },
  { id: 'expert', label: 'Expert Knowledge', icon: GraduationCap },
  { id: 'audit', label: 'Security & Audit', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
}) => {
  return (
    <aside
      aria-label="Application navigation"
      className={`h-full border-r border-[#1A2332] bg-[#0B0F15] flex flex-col justify-between shrink-0 select-none transition-all duration-200 z-20 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Navigation Items */}
      <div className="p-3 pt-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          const buttonEl = (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`w-full flex items-center rounded-lg transition group text-xs font-medium ${
                collapsed
                  ? 'justify-center h-10 w-10 mx-auto'
                  : 'px-3 py-2.5 justify-between'
              } ${
                isActive
                  ? 'bg-[#12241A] text-[#A3E635] font-semibold border border-[#1E4028]'
                  : 'text-slate-400 hover:text-white hover:bg-[#111722] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 transition ${
                    isActive ? 'text-[#A3E635]' : 'text-slate-400 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!collapsed && item.hasSubmenu && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" />
              )}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
                <TooltipContent side="right">
                  <span className="font-medium">{item.label}</span>
                </TooltipContent>
              </Tooltip>
            );
          }

          return buttonEl;
        })}
      </div>

      {/* Bottom Section: Deployment Mode Card & Footer */}
      {!collapsed ? (
        <div className="p-3 space-y-4">
          {/* Deployment Mode Card from Screenshot */}
          <div className="p-3 rounded-xl bg-[#101722] border border-[#1E293B] space-y-2">
            <div className="text-[11px] text-slate-400 font-medium">Deployment Mode</div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A3E635]" />
              </span>
              <span className="text-xs font-bold text-[#A3E635]">SaaS</span>
            </div>
            <div className="text-[10px] text-slate-500 font-sans">Cloud Inference</div>
          </div>

          {/* Footer Branding from Screenshot */}
          <div className="px-1 text-[11px] text-slate-500 space-y-0.5">
            <div className="font-mono text-slate-400">ForgeX AI v1.0.0</div>
            <div className="text-[10px] text-slate-500">Build for a safer, smarter industry.</div>
          </div>
        </div>
      ) : (
        <div className="p-2 pb-4 flex justify-center">
          <div className="w-8 h-8 rounded-lg bg-[#101722] border border-[#1E293B] flex items-center justify-center text-[#A3E635] text-[10px] font-bold">
            SaaS
          </div>
        </div>
      )}
    </aside>
  );
};

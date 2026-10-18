import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  BookOpen,
  Bot,
  Radio,
  Wrench,
  GraduationCap,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
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
  badge?: string;
  badgeAccent?: boolean;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'assets', label: 'Plants & Assets', icon: Boxes, badge: '348' },
  { id: 'knowledge-hub', label: 'Knowledge Hub', icon: BookOpen, badge: '1,420' },
  { id: 'copilot', label: 'AI Copilot', icon: Bot, badge: 'RAG', badgeAccent: true },
  { id: 'visual', label: 'Visual Intelligence', icon: Radio, badge: 'P&ID' },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, badge: '3 CASES' },
  { id: 'expert', label: 'Expert Knowledge', icon: GraduationCap },
  { id: 'audit', label: 'Security & Audit', icon: ShieldCheck, badge: 'SECURE' },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
  onOpenTelemetryModal,
}) => {
  return (
    <aside
      aria-label="Application navigation"
      className={`h-full border-r border-industrial-border bg-industrial-sidebar flex flex-col justify-between shrink-0 select-none transition-all duration-200 z-30 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Top Branding Section */}
      <div>
        <div className="h-14 border-b border-industrial-border flex items-center justify-between px-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded bg-industrial-surface border border-industrial-border flex items-center justify-center shrink-0">
              <span className="font-mono font-black text-sm text-industrial-accent">FX</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-sm tracking-wide text-industrial-text uppercase truncate">
                    ForgeX<span className="text-industrial-accent">.AI</span>
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-industrial-surface text-industrial-secondary border border-industrial-border">
                    OT-L3.5
                  </span>
                </div>
                <div className="text-[9px] font-mono text-industrial-secondary truncate -mt-0.5">
                  INDUSTRIAL ASSISTANT
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 rounded text-industrial-secondary hover:text-industrial-text hover:bg-industrial-surface transition hidden md:flex items-center justify-center"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Items List */}
        <nav className="p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;

            const buttonEl = (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                className={`w-full flex items-center rounded-md transition group relative text-xs font-medium ${
                  collapsed
                    ? 'justify-center h-10 w-10 mx-auto'
                    : 'px-3 py-2 justify-between'
                } ${
                  isActive
                    ? 'bg-industrial-surface text-industrial-text font-semibold border border-industrial-border'
                    : 'text-industrial-secondary hover:text-industrial-text hover:bg-industrial-surface/60 border border-transparent'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-industrial-accent rounded-r" />
                )}

                <div className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition ${
                      isActive
                        ? 'text-industrial-accent'
                        : 'text-industrial-secondary group-hover:text-industrial-text'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {!collapsed && item.badge && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border tabular-nums ${
                      item.badgeAccent
                        ? 'bg-industrial-accent/15 border-industrial-accent/40 text-industrial-accent font-bold'
                        : 'bg-industrial-bg border-industrial-border text-industrial-secondary'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
                  <TooltipContent side="right">
                    <span className="font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="ml-1.5 font-mono text-[10px] text-industrial-accent">
                        [{item.badge}]
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return buttonEl;
          })}
        </nav>
      </div>

      {/* Bottom Telemetry & Sovereign Runtime Status */}
      <div className="p-2 border-t border-industrial-border bg-industrial-sidebar">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenTelemetryModal}
                className="w-10 h-10 mx-auto flex items-center justify-center rounded-md hover:bg-industrial-surface text-emerald-400 border border-industrial-border transition"
              >
                <Activity className="w-4 h-4 animate-pulse" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span className="font-mono text-xs">Runtime: Ollama (Air-Gapped Sovereign)</span>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="p-2.5 rounded-md bg-industrial-surface border border-industrial-border space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-industrial-text uppercase tracking-wider">
                  Inference Sovereign
                </span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-900">
                AIR-GAP
              </span>
            </div>
            <div className="text-[11px] font-mono text-industrial-secondary flex items-center justify-between">
              <span>Local Ollama OT</span>
              <span className="text-industrial-accent font-semibold">0 Cloud Egress</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

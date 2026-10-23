import React from 'react';
import {
  LayoutDashboard,
  Factory,
  FileText,
  MessageSquare,
  ScanLine,
  HardHat,
  GraduationCap,
  Settings,
  Users,
  Layers,
  Cpu,
  History,
  HelpCircle,
  BarChart3,
  Wrench,
  UserCheck,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
import { useAuth } from '../../lib/AuthContext';

export type NavModule =
  | 'overview'
  | 'assets'
  | 'engineering-assets'
  | 'machine-recovery'
  | 'knowledge-hub'
  | 'copilot'
  | 'troubleshooting'
  | 'expert'
  | 'maintenance'
  | 'history'
  | 'visual'
  | 'tech'
  | 'worker'
  | 'reports'
  | 'notifications'
  | 'team'
  | 'audit'
  | 'settings';

interface SidebarProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItemDef {
  id: NavModule;
  label: string;
  icon: React.ElementType;
  group: 'operations' | 'knowledge' | 'execution' | 'governance';
  roles?: string[]; // Allowed roles if restricted
}

const NAV_ITEMS: NavItemDef[] = [
  // 1. OPERATIONS
  { id: 'overview',           label: 'Overview',             icon: LayoutDashboard, group: 'operations' },
  { id: 'assets',             label: 'Assets & Machines',    icon: Factory,         group: 'operations' },
  { id: 'engineering-assets', label: 'Engineering Workspace',icon: Layers,          group: 'operations' },
  { id: 'machine-recovery',   label: 'Machine Recovery',     icon: Cpu,             group: 'operations' },

  // 2. KNOWLEDGE
  { id: 'copilot',            label: 'AI Copilot',           icon: MessageSquare,   group: 'knowledge' },
  { id: 'troubleshooting',    label: 'Troubleshooting & RCA',icon: HelpCircle,      group: 'knowledge' },
  { id: 'expert',             label: 'Expert Knowledge',     icon: GraduationCap,   group: 'knowledge' },
  { id: 'knowledge-hub',      label: 'Knowledge Hub',        icon: FileText,        group: 'knowledge' },

  // 3. EXECUTION
  { id: 'maintenance',        label: 'Raised Tickets',       icon: HardHat,         group: 'execution' },
  { id: 'tech',               label: 'Technician Queue',     icon: Wrench,          group: 'execution' },
  { id: 'history',            label: 'Maintenance History',  icon: History,         group: 'execution' },
  { id: 'visual',             label: 'Visual Intelligence',  icon: ScanLine,        group: 'execution' },
  { id: 'worker',             label: 'Worker Workspace',     icon: UserCheck,       group: 'execution' },

  // 4. GOVERNANCE
  { id: 'reports',            label: 'Reports & Analytics',  icon: BarChart3,       group: 'governance' },
  { id: 'team',               label: 'Team & Access',        icon: Users,           group: 'governance', roles: ['ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'] },
  { id: 'settings',           label: 'Settings',             icon: Settings,        group: 'governance' },
];

const GROUP_LABELS: Record<string, string> = {
  operations: 'OPERATIONS',
  knowledge: 'KNOWLEDGE',
  execution: 'EXECUTION',
  governance: 'GOVERNANCE',
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  onToggleCollapse: _onToggleCollapse,
}) => {
  const { membership } = useAuth();
  const role = membership?.role || 'VIEWER';

  // Filter items according to user role
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  const groups: Array<'operations' | 'knowledge' | 'execution' | 'governance'> = [
    'operations',
    'knowledge',
    'execution',
    'governance',
  ];

  return (
    <aside
      aria-label="Application navigation"
      className={`h-full flex flex-col shrink-0 select-none transition-all duration-200 z-20 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      style={{ background: '#151C24', borderRight: '1px solid #243145' }}
    >
      {/* Brand Header */}
      <div className="p-3.5 border-b border-[#243145] flex items-center justify-between">
        {!collapsed ? (
          <div
            onClick={() => onSelectModule('overview')}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <img
              src="/forgex_logo_dark.png"
              alt="ForgeX AI"
              className="h-7 w-auto object-contain filter drop-shadow-sm transition-transform group-hover:scale-105"
            />
          </div>
        ) : (
          <div
            onClick={() => onSelectModule('overview')}
            className="w-8 h-8 mx-auto flex items-center justify-center cursor-pointer"
          >
            <img
              src="/forgex_icon.png"
              alt="ForgeX AI"
              className="w-6 h-6 object-contain"
            />
          </div>
        )}
      </div>

      {/* Navigation Items grouped by section */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {collapsed ? (
          // Collapsed: simple icon stack with tooltips
          <div className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectModule(item.id)}
                      className={`w-10 h-10 mx-auto flex items-center justify-center rounded-md transition-all ${
                        isActive
                          ? 'bg-[#2563EB] text-white shadow-sm'
                          : 'text-[#94A3B8] hover:bg-[#243145] hover:text-[#F8FAFC]'
                      }`}
                      aria-label={item.label}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-[#151C24] text-white border-[#243145] text-xs">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          // Expanded: Section Header + Items
          groups.map((grpKey) => {
            const itemsInGroup = visibleNavItems.filter((i) => i.group === grpKey);
            if (itemsInGroup.length === 0) return null;

            return (
              <div key={grpKey} className="space-y-1">
                <div className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
                  {GROUP_LABELS[grpKey]}
                </div>
                <div className="space-y-0.5">
                  {itemsInGroup.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeModule === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectModule(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-[#2563EB] text-white shadow-sm font-semibold'
                            : 'text-[#CBD5E1] hover:bg-[#243145] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#94A3B8]'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Status Card */}
      {!collapsed ? (
        <div className="p-3 border-t border-[#243145]">
          <div className="p-2.5 rounded-md bg-[#141C2A] border border-[#2D3E57] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold text-[#64748B] uppercase">Status</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono text-emerald-400 font-bold">ONLINE</span>
              </div>
            </div>
            <div className="text-[10px] text-[#94A3B8] font-mono">ForgeX AI v1.4.2</div>
            <div className="text-[9px] text-[#64748B]">ISO 55001 Asset Operations</div>
          </div>
        </div>
      ) : (
        <div className="p-2 flex justify-center border-t border-[#243145]">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
      )}
    </aside>
  );
};

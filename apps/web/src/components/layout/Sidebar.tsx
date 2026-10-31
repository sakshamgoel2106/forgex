import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Factory,
  FileText,
  MessageSquare,
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
  ShieldAlert,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';

// Helper to extract 2-letter monogram initials from company name (e.g. "JT" for "JMK Tiles Modernized")
function getCompanyInitials(name: string): string {
  if (!name || !name.trim()) return 'JT';
  const clean = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

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
  | 'tech'
  | 'oem-escalations'
  | 'worker'
  | 'reports'
  | 'notifications'
  | 'team'
  | 'audit'
  | 'settings'
  | 'scan'
  | 'loto';

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
  { id: 'tech',               label: 'Tech Execution Desk',  icon: Wrench,          group: 'execution' },
  { id: 'oem-escalations',    label: 'OEM Escalations',      icon: ShieldAlert,     group: 'execution' },
  { id: 'history',            label: 'Maintenance History',  icon: History,         group: 'execution' },

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
  const { membership, organization } = useAuth();
  const { toast } = useToast();
  const role = membership?.role || 'VIEWER';

  const companyName = organization?.name || 'JMK Tiles Modernized';
  const companyInitials = getCompanyInitials(companyName);
  const orgId = organization?.id || 'org_demo';

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customLogo, setCustomLogo] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return (
      localStorage.getItem(`forgex_company_logo_${orgId}`) ||
      (organization as any)?.logoUrl ||
      null
    );
  });

  // Re-sync when organization changes
  useEffect(() => {
    const currentOrgId = organization?.id || 'org_demo';
    const stored =
      localStorage.getItem(`forgex_company_logo_${currentOrgId}`) ||
      (organization as any)?.logoUrl ||
      null;
    setCustomLogo(stored);
  }, [organization?.id, (organization as any)?.logoUrl]);

  // Listen for cross-component logo updates
  useEffect(() => {
    const handleLogoUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ logo: string | null; orgId?: string }>;
      const currentOrgId = organization?.id || 'org_demo';
      if (!customEvent.detail?.orgId || customEvent.detail.orgId === currentOrgId) {
        setCustomLogo(customEvent.detail?.logo || null);
      }
    };
    window.addEventListener('forgex:company-logo-updated', handleLogoUpdate);
    return () => {
      window.removeEventListener('forgex:company-logo-updated', handleLogoUpdate);
    };
  }, [organization?.id]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      toast.error('File Too Large', 'Please select a company logo image smaller than 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const currentOrgId = organization?.id || 'org_demo';
        localStorage.setItem(`forgex_company_logo_${currentOrgId}`, base64);
        try {
          const rawOrg = localStorage.getItem('forgex_organization');
          if (rawOrg) {
            const orgObj = JSON.parse(rawOrg);
            orgObj.logoUrl = base64;
            localStorage.setItem('forgex_organization', JSON.stringify(orgObj));
          }
        } catch {}
        setCustomLogo(base64);
        window.dispatchEvent(
          new CustomEvent('forgex:company-logo-updated', {
            detail: { logo: base64, orgId: currentOrgId },
          })
        );
        toast.success('Company Logo Updated', `Custom branding applied for ${companyName}.`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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
      {/* Brand Header: Active Company Dynamic Branding */}
      <div className="p-3 border-b border-[#243145] flex items-center justify-between shrink-0 min-h-[58px]">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
        />
        {!collapsed ? (
          <div className="flex items-center gap-2.5 min-w-0 w-full">
            {/* Clickable Logo Avatar for Upload / View */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative cursor-pointer group shrink-0"
              title="Click to upload/change company logo"
            >
              {customLogo ? (
                <img
                  src={customLogo}
                  alt={companyName}
                  className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5 border border-indigo-400/40 shadow-md shrink-0 group-hover:scale-105 group-hover:ring-2 group-hover:ring-indigo-400 transition-all"
                />
              ) : (
                <div
                  className="bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 text-white font-extrabold rounded-xl w-9 h-9 flex items-center justify-center shadow-md shrink-0 text-sm tracking-wider border border-white/20 select-none group-hover:scale-105 group-hover:ring-2 group-hover:ring-indigo-400 transition-all"
                >
                  {companyInitials}
                </div>
              )}
              {/* Subtle hover upload indicator */}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
                ✎
              </div>
            </div>

            {/* Clickable Company Name to navigate to Overview */}
            <div
              onClick={() => onSelectModule('overview')}
              className="min-w-0 flex-1 cursor-pointer group"
              title={`Active Company: ${companyName}`}
            >
              <div className="font-bold text-white text-xs leading-tight truncate group-hover:text-indigo-300 transition-colors">
                {companyName}
              </div>
              <div className="text-[9.5px] text-slate-400 font-sans leading-tight mt-0.5 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">Powered by ForgeX AI</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 mx-auto flex items-center justify-center cursor-pointer group relative"
            title={`${companyName} — Click to upload company logo`}
          >
            {customLogo ? (
              <img
                src={customLogo}
                alt={companyName}
                className="w-8 h-8 rounded-xl object-contain bg-white/10 p-0.5 border border-indigo-400/40 shadow-md shrink-0 group-hover:scale-105 group-hover:ring-2 group-hover:ring-indigo-400 transition-all"
              />
            ) : (
              <div className="bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 text-white font-extrabold rounded-xl w-8 h-8 flex items-center justify-center shadow-md shrink-0 text-xs tracking-wider border border-white/20 group-hover:scale-105 group-hover:ring-2 group-hover:ring-indigo-400 transition-all">
                {companyInitials}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Items grouped by section */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3 px-2 pb-6 space-y-4">
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
        <div className="p-3 border-t border-[#243145] shrink-0">
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
        <div className="p-2 flex justify-center border-t border-[#243145] shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
      )}
    </aside>
  );
};

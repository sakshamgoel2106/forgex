import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  BookOpen,
  Bot,
  Image as ImageIcon,
  HelpCircle,
  Wrench,
  GraduationCap,
  ShieldCheck,
  Settings,
} from 'lucide-react';

export type ActiveNavModule =
  | 'overview'
  | 'plants-assets'
  | 'knowledge-hub'
  | 'ai-copilot'
  | 'visual-intelligence'
  | 'troubleshooting'
  | 'maintenance'
  | 'expert-knowledge'
  | 'security-audit'
  | 'settings';

interface SidebarNavProps {
  activeModule: ActiveNavModule;
  onSelectModule: (module: ActiveNavModule) => void;
}

interface NavItemConfig {
  id: ActiveNavModule;
  label: string;
  category: 'OPERATIONS' | 'INTELLIGENCE' | 'GOVERNANCE';
  icon: React.ElementType;
  badge?: string;
  isAccentBadge?: boolean;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeModule,
  onSelectModule,
}) => {
  const navItems: NavItemConfig[] = [
    // Operations Group
    {
      id: 'overview',
      label: 'Overview',
      category: 'OPERATIONS',
      icon: LayoutDashboard,
      badge: 'LIVE',
    },
    {
      id: 'plants-assets',
      label: 'Plants & Assets',
      category: 'OPERATIONS',
      icon: Boxes,
      badge: '348 TAGS',
    },
    {
      id: 'knowledge-hub',
      label: 'Knowledge Hub',
      category: 'OPERATIONS',
      icon: BookOpen,
      badge: '1,420',
    },

    // Intelligence Group
    {
      id: 'ai-copilot',
      label: 'AI Copilot',
      category: 'INTELLIGENCE',
      icon: Bot,
      badge: 'RAG ONLINE',
      isAccentBadge: true,
    },
    {
      id: 'visual-intelligence',
      label: 'Visual Intelligence',
      category: 'INTELLIGENCE',
      icon: ImageIcon,
      badge: 'BBOX',
    },
    {
      id: 'troubleshooting',
      label: 'Troubleshooting',
      category: 'INTELLIGENCE',
      icon: HelpCircle,
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      category: 'INTELLIGENCE',
      icon: Wrench,
      badge: 'ACTIVE SOP',
    },
    {
      id: 'expert-knowledge',
      label: 'Expert Knowledge',
      category: 'INTELLIGENCE',
      icon: GraduationCap,
    },

    // Governance & Config Group
    {
      id: 'security-audit',
      label: 'Security & Audit',
      category: 'GOVERNANCE',
      icon: ShieldCheck,
      badge: 'IMMUTABLE',
    },
    {
      id: 'settings',
      label: 'Settings',
      category: 'GOVERNANCE',
      icon: Settings,
    },
  ];

  const categories: Array<{ id: NavItemConfig['category']; label: string }> = [
    { id: 'OPERATIONS', label: 'Plant Operations' },
    { id: 'INTELLIGENCE', label: 'Multimodal AI' },
    { id: 'GOVERNANCE', label: 'System & Governance' },
  ];

  return (
    <aside className="w-64 border-r border-graphite-800 bg-graphite-900/60 flex flex-col justify-between shrink-0 select-none overflow-y-auto">
      <div className="p-3 space-y-4">
        {categories.map((cat) => {
          const items = navItems.filter((item) => item.category === cat.id);
          return (
            <div key={cat.id} className="space-y-1">
              <div className="px-3 text-[10px] font-mono uppercase tracking-wider text-graphite-500 font-semibold">
                {cat.label}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectModule(item.id)}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition group relative ${
                      isActive
                        ? 'bg-graphite-800/90 text-graphite-100 border border-graphite-700 shadow-sm'
                        : 'text-graphite-400 hover:bg-graphite-800/40 hover:text-graphite-200 border border-transparent'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-amber-500 rounded-r" />
                    )}
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 transition ${
                          isActive
                            ? 'text-amber-400'
                            : 'text-graphite-500 group-hover:text-graphite-300'
                        }`}
                      />
                      <span className="text-xs font-medium font-sans">{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          item.isAccentBadge
                            ? 'bg-amber-950/60 border-amber-800 text-amber-400'
                            : 'bg-graphite-950 border-graphite-800 text-graphite-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

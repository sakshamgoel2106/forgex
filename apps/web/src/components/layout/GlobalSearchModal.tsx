import React, { useState, useEffect } from 'react';
import { Search, X, Boxes, BookOpen, Wrench, ArrowRight } from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string) => void;
}

interface SearchItem {
  id: string;
  category: 'Asset' | 'Manual' | 'Maintenance' | 'Audit';
  title: string;
  subtitle: string;
  module: string;
}

const SEARCH_INDEX: SearchItem[] = [
  {
    id: 's-1',
    category: 'Asset',
    title: 'PUMP-204-B',
    subtitle: 'Centrifugal Slurry Bottoms Pump • Primary Distillation',
    module: 'assets',
  },
  {
    id: 's-2',
    category: 'Asset',
    title: 'COMP-101-A',
    subtitle: 'Main Wet Gas Centrifugal Compressor • Gas Recovery',
    module: 'assets',
  },
  {
    id: 's-3',
    category: 'Manual',
    title: 'SOP-MECH-401',
    subtitle: 'Emergency Centrifugal Pump LOTO & Seal Overhaul Procedure',
    module: 'knowledge-hub',
  },
  {
    id: 's-4',
    category: 'Manual',
    title: 'OEM-MAN-883',
    subtitle: 'Flowserve Mark 3 ANSI Centrifugal Pump Operation Manual',
    module: 'knowledge-hub',
  },
  {
    id: 's-5',
    category: 'Maintenance',
    title: 'CASE-2026-4021',
    subtitle: 'P-101-A Mechanical Seal Weepage & Increased Vibration (HIGH)',
    module: 'maintenance',
  },
  {
    id: 's-6',
    category: 'Audit',
    title: 'LOTO Signoff [PUMP-204-B]',
    subtitle: 'Cryptographically signed by T. Vance (PE-7089)',
    module: 'audit',
  },
];

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = SEARCH_INDEX.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  const getCategoryIcon = (cat: SearchItem['category']) => {
    switch (cat) {
      case 'Asset':
        return <Boxes className="w-3.5 h-3.5 text-industrial-accent" />;
      case 'Manual':
        return <BookOpen className="w-3.5 h-3.5 text-amber-400" />;
      case 'Maintenance':
        return <Wrench className="w-3.5 h-3.5 text-purple-400" />;
      case 'Audit':
        return <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-industrial-surface border border-industrial-border rounded-lg shadow-2xl overflow-hidden">
        {/* Input header */}
        <div className="p-3 border-b border-industrial-border flex items-center gap-3">
          <Search className="w-4 h-4 text-industrial-secondary" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plant equipment, manuals, cases, procedures... (ESC to close)"
            className="flex-1 bg-transparent text-sm text-industrial-text placeholder-industrial-secondary outline-none font-sans"
          />
          <button
            onClick={onClose}
            className="text-industrial-secondary hover:text-industrial-text p-1 rounded hover:bg-industrial-sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto divide-y divide-industrial-border/50">
          {results.length > 0 ? (
            results.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.module);
                  onClose();
                }}
                className="w-full text-left p-3 hover:bg-industrial-sidebar flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-industrial-bg border border-industrial-border">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-industrial-text group-hover:text-industrial-accent">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-industrial-bg border border-industrial-border text-industrial-secondary uppercase">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-xs text-industrial-secondary mt-0.5">{item.subtitle}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-industrial-secondary group-hover:text-industrial-accent transition opacity-0 group-hover:opacity-100" />
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-xs font-mono text-industrial-secondary">
              No matching equipment, documents, or cases found for &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 border-t border-industrial-border bg-industrial-bg flex items-center justify-between text-[11px] font-mono text-industrial-secondary">
          <span>Navigate with arrows • Press ENTER to select</span>
          <span>ForgeX Global Index</span>
        </div>
      </div>
    </div>
  );
};

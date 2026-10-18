import React from 'react';
import { X, CheckCircle2, ArrowUpRight, Bell } from 'lucide-react';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string) => void;
}

interface AlertItem {
  id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  detail: string;
  assetTag: string;
  targetModule: string;
}

const ACTIVE_ALERTS: AlertItem[] = [
  {
    id: 'alt-01',
    timestamp: '10 mins ago',
    severity: 'WARNING',
    title: 'Vibration RMS Threshold Exceeded',
    detail: 'PUMP-204-B vibration peaked at 4.8 mm/s (Threshold: 3.5 mm/s). Mechanical seal examination recommended.',
    assetTag: 'PUMP-204-B',
    targetModule: 'maintenance',
  },
  {
    id: 'alt-02',
    timestamp: '28 mins ago',
    severity: 'CRITICAL',
    title: 'LOTO Gate Approval Required',
    detail: 'Case #2026-4021 requires PE-7089 zero-energy electrical verification before work order release.',
    assetTag: 'P-101-A',
    targetModule: 'maintenance',
  },
  {
    id: 'alt-03',
    timestamp: '1 hour ago',
    severity: 'INFO',
    title: 'Document Vectorization Complete',
    detail: 'SOP-MECH-401 (Rev C) successfully parsed into 6 semantic chunks and indexed into Qdrant.',
    assetTag: 'PLANT-TX-04',
    targetModule: 'knowledge-hub',
  },
];

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-industrial-sidebar border-l border-industrial-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-industrial-border flex items-center justify-between bg-industrial-surface">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-industrial-accent" />
            <h3 className="text-sm font-mono font-bold text-industrial-text uppercase tracking-wider">
              Operational Notifications
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-industrial-bg text-industrial-accent border border-industrial-border font-bold">
              {ACTIVE_ALERTS.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-industrial-secondary hover:text-industrial-text p-1 rounded hover:bg-industrial-sidebar transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto divide-y divide-industrial-border p-4 space-y-3">
          {ACTIVE_ALERTS.map((alert) => (
            <div
              key={alert.id}
              className="p-3.5 rounded-lg bg-industrial-surface border border-industrial-border hover:border-industrial-borderLight transition space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-rose-950/80 border-rose-800 text-rose-400'
                        : alert.severity === 'WARNING'
                        ? 'bg-amber-950/80 border-amber-800 text-amber-300'
                        : 'bg-cyan-950/80 border-cyan-800 text-cyan-300'
                    }`}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-xs font-mono font-bold text-industrial-accent">
                    {alert.assetTag}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-industrial-secondary">
                  {alert.timestamp}
                </span>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-industrial-text">{alert.title}</h4>
                <p className="text-xs text-industrial-secondary mt-1 leading-relaxed">
                  {alert.detail}
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => {
                    onNavigate(alert.targetModule);
                    onClose();
                  }}
                  className="text-xs font-mono text-industrial-accent hover:underline flex items-center gap-1"
                >
                  Inspect Case <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-industrial-border bg-industrial-surface flex items-center justify-between text-xs font-mono text-industrial-secondary">
          <span>Plant Telemetry Stream</span>
          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5" /> All Watchdogs Live
          </span>
        </div>
      </div>
    </div>
  );
};

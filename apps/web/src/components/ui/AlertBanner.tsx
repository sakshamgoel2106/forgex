import React from 'react';
import { AlertTriangle, CheckCircle2, Info, AlertOctagon, X } from 'lucide-react';

export type AlertTone = 'info' | 'warning' | 'error' | 'success';

export interface AlertBannerProps {
  tone?: AlertTone;
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  tone = 'info',
  title,
  message,
  onDismiss,
  className = '',
}) => {
  const configs: Record<
    AlertTone,
    { bg: string; border: string; text: string; icon: React.ReactNode }
  > = {
    info: {
      bg: 'bg-cyan-950/40',
      border: 'border-cyan-800/80',
      text: 'text-cyan-300',
      icon: <Info className="w-4 h-4 text-cyan-400 shrink-0" />,
    },
    warning: {
      bg: 'bg-amber-950/40',
      border: 'border-amber-800/80',
      text: 'text-amber-300',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    error: {
      bg: 'bg-rose-950/40',
      border: 'border-rose-800/80',
      text: 'text-rose-300',
      icon: <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />,
    },
    success: {
      bg: 'bg-emerald-950/40',
      border: 'border-emerald-800/80',
      text: 'text-emerald-300',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
  };

  const current = configs[tone];

  return (
    <div
      className={`p-3 rounded-lg border text-xs font-mono flex items-start justify-between gap-3 ${current.bg} ${current.border} ${current.text} ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{current.icon}</div>
        <div>
          {title && <h4 className="font-bold uppercase tracking-wider mb-0.5">{title}</h4>}
          <p className="leading-relaxed opacity-95">{message}</p>
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100 transition p-0.5 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

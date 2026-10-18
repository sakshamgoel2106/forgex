import React from 'react';

export type StatusTone = 'healthy' | 'warning' | 'critical' | 'neutral' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone = 'neutral',
  pulse = false,
  className = '',
}) => {
  const toneClasses: Record<StatusTone, { badge: string; dot: string }> = {
    healthy: {
      badge: 'bg-lime-500/10 border-lime-500/30 text-lime-400',
      dot: 'bg-lime-400',
    },
    warning: {
      badge: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      dot: 'bg-amber-400',
    },
    critical: {
      badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      dot: 'bg-rose-400',
    },
    neutral: {
      badge: 'bg-slate-800/70 border-slate-700 text-slate-300',
      dot: 'bg-slate-400',
    },
    info: {
      badge: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
      dot: 'bg-sky-400',
    },
  };

  const current = toneClasses[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium tracking-wide ${current.badge} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${current.dot}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${current.dot}`} />
      </span>
      {label}
    </span>
  );
};

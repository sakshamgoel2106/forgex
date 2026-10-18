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
      badge: 'bg-emerald-950/60 border-emerald-800 text-emerald-400',
      dot: 'bg-emerald-500',
    },
    warning: {
      badge: 'bg-amber-950/60 border-amber-800 text-amber-300',
      dot: 'bg-amber-500',
    },
    critical: {
      badge: 'bg-rose-950/60 border-rose-800 text-rose-400',
      dot: 'bg-rose-500',
    },
    neutral: {
      badge: 'bg-graphite-800 border-graphite-700 text-graphite-300',
      dot: 'bg-graphite-500',
    },
    info: {
      badge: 'bg-cyan-950/60 border-cyan-800 text-cyan-300',
      dot: 'bg-cyan-400',
    },
  };

  const current = toneClasses[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-xs font-mono font-medium uppercase tracking-wider ${current.badge} ${className}`}
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

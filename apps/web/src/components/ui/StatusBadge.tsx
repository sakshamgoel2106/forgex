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
      badge: 'bg-[#0E2317] border-[#1B4E2B] text-[#A3E635]',
      dot: 'bg-[#A3E635] shadow-[0_0_6px_#A3E635]',
    },
    warning: {
      badge: 'bg-[#2A1D0B] border-[#523812] text-amber-400',
      dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]',
    },
    critical: {
      badge: 'bg-[#2D1217] border-[#641A24] text-[#F87171]',
      dot: 'bg-[#F87171] shadow-[0_0_6px_#F87171]',
    },
    neutral: {
      badge: 'bg-[#131E2C] border-[#203044] text-slate-300',
      dot: 'bg-slate-400',
    },
    info: {
      badge: 'bg-[#0B2035] border-[#13426A] text-[#38BDF8]',
      dot: 'bg-[#38BDF8] shadow-[0_0_6px_#38BDF8]',
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

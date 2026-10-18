import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-graphite-800 bg-graphite-900/40 ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-graphite-800/80 border border-graphite-700 flex items-center justify-center text-graphite-400 mb-3">
        {icon || <PackageOpen className="w-5 h-5 text-graphite-400" />}
      </div>
      <h4 className="text-xs font-mono font-bold text-graphite-200 uppercase tracking-wide mb-1">
        {title}
      </h4>
      <p className="text-xs text-graphite-500 max-w-sm mb-4 leading-relaxed font-sans">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

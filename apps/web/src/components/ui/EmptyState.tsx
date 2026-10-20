import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './button';

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
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-white border border-[#CBD5E1] flex items-center justify-center text-[#64748B] mb-3 shadow-sm">
        {icon || <PackageOpen className="w-5 h-5 text-[#64748B]" />}
      </div>
      <h4 className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wide mb-1">
        {title}
      </h4>
      <p className="text-xs text-[#64748B] max-w-sm mb-4 leading-relaxed font-sans">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction} className="bg-white hover:bg-slate-50 text-[#1A202C] border border-[#CBD5E1] shadow-sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

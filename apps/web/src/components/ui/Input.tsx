import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="w-full space-y-1">
        {label && (
          <label className="block text-[11px] font-mono text-graphite-400 uppercase tracking-wide">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-graphite-500 pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full bg-graphite-950 border rounded text-xs font-mono text-graphite-100 placeholder-graphite-500 focus:outline-none transition ${
              leftIcon ? 'pl-9' : 'pl-3'
            } ${rightIcon ? 'pr-9' : 'pr-3'} py-1.5 ${
              error
                ? 'border-rose-500 focus:border-rose-400'
                : 'border-graphite-800 focus:border-amber-500'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-graphite-500 pointer-events-none flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-[10px] font-mono text-rose-400">{error}</p>}
        {helperText && !error && (
          <p className="text-[10px] font-mono text-graphite-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

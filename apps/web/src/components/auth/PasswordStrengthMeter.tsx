import React from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
}

export function checkPasswordStrength(password: string): {
  score: number; // 0 to 4
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  hasLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
} {
  const hasLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  let criteriaMet = 0;
  if (hasLength) criteriaMet++;
  if (hasLower && hasUpper) criteriaMet++;
  if (hasNumber) criteriaMet++;
  if (hasSymbol) criteriaMet++;

  let label: 'Weak' | 'Fair' | 'Good' | 'Strong' = 'Weak';
  let color = 'bg-red-500';

  if (password.length === 0) {
    return { score: 0, label: 'Weak', color: 'bg-slate-300', hasLength: false, hasLower: false, hasUpper: false, hasNumber: false, hasSymbol: false };
  }

  if (criteriaMet >= 4 && password.length >= 10) {
    label = 'Strong';
    color = 'bg-emerald-500';
  } else if (criteriaMet >= 3 && password.length >= 8) {
    label = 'Good';
    color = 'bg-blue-500';
  } else if (criteriaMet >= 2 && password.length >= 8) {
    label = 'Fair';
    color = 'bg-amber-500';
  } else {
    label = 'Weak';
    color = 'bg-red-500';
  }

  return {
    score: criteriaMet,
    label,
    color,
    hasLength,
    hasLower,
    hasUpper,
    hasNumber,
    hasSymbol,
  };
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
  if (!password) return null;

  const { score, label, color, hasLength, hasLower, hasUpper, hasNumber, hasSymbol } = checkPasswordStrength(password);

  return (
    <div className="mt-2 space-y-2 text-xs">
      {/* Progress Bar */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-gray-500">Security Strength:</span>
        <span className={`text-[11px] font-mono font-bold ${
          label === 'Strong' ? 'text-emerald-600' :
          label === 'Good' ? 'text-blue-600' :
          label === 'Fair' ? 'text-amber-600' : 'text-red-500'
        }`}>
          {label.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        {[1, 2, 3, 4].map((seg) => (
          <div
            key={seg}
            className={`h-full rounded-full transition-all duration-300 ${
              seg <= score ? color : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {/* Criteria Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1 text-[10px] sm:text-[11px] text-gray-500 pt-1">
        <div className={`flex items-center gap-1 ${hasLength ? 'text-emerald-600' : 'text-gray-400'}`}>
          {hasLength ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          <span>8+ characters</span>
        </div>
        <div className={`flex items-center gap-1 ${hasLower && hasUpper ? 'text-emerald-600' : 'text-gray-400'}`}>
          {hasLower && hasUpper ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          <span>Upper & lowercase</span>
        </div>
        <div className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-600' : 'text-gray-400'}`}>
          {hasNumber ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          <span>At least 1 number</span>
        </div>
        <div className={`flex items-center gap-1 ${hasSymbol ? 'text-emerald-600' : 'text-gray-400'}`}>
          {hasSymbol ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          <span>Special symbol (@, #, $)</span>
        </div>
      </div>
    </div>
  );
};

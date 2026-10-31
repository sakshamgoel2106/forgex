import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Check, X, Lock, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';

export interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  subtitle?: string;
  description: string;
  targetItemName?: string;
  targetItemId?: string;
  acknowledgmentText?: string;
  confirmButtonText?: string;
  isDestructive?: boolean;
  isSubmitting?: boolean;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = '🛡️ Confirm Confidential Action',
  subtitle = 'Enterprise Authorization & Multi-Stage Verification Protocol',
  description,
  targetItemName,
  targetItemId,
  acknowledgmentText = 'I verify and acknowledge that I have verified the operational impact and am authorized to execute this action.',
  confirmButtonText = 'Confirm & Authorize Action',
  isDestructive = false,
  isSubmitting = false,
}) => {
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAcknowledged(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExecute = async () => {
    if (!isAcknowledged || isSubmitting) return;
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !isSubmitting && onClose()}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        {/* Top Header Accent */}
        <div
          className={`h-2 w-full ${
            isDestructive
              ? 'bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600'
              : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500'
          }`}
        />

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                isDestructive
                  ? 'bg-rose-50 border border-rose-200 text-rose-600'
                  : 'bg-indigo-50 border border-indigo-200 text-indigo-600'
              }`}
            >
              {isDestructive ? (
                <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
              ) : (
                <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{subtitle}</p>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Target Item Details Card */}
          {(targetItemName || targetItemId) && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>TARGET OBJECT:</span>
                {targetItemId && (
                  <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {targetItemId}
                  </span>
                )}
              </div>
              {targetItemName && (
                <div className="text-slate-900 font-bold font-sans text-xs sm:text-sm truncate">
                  {targetItemName}
                </div>
              )}
            </div>
          )}

          {/* Description / Impact Message */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-slate-50 border border-amber-200/70 text-xs text-slate-700 leading-relaxed space-y-1">
            <div className="font-bold text-amber-900 text-[11px] uppercase tracking-wide flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Operational Impact Notice</span>
            </div>
            <p>{description}</p>
          </div>

          {/* Step 1: Checkbox Acknowledgment */}
          <div className="pt-1">
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-200 hover:border-indigo-300 transition cursor-pointer group">
              <input
                type="checkbox"
                checked={isAcknowledged}
                onChange={(e) => setIsAcknowledged(e.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
              <span className="text-xs text-slate-700 font-medium group-hover:text-slate-900 leading-relaxed">
                {acknowledgmentText}
              </span>
            </label>
          </div>

          {/* Step 2: Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </Button>
            <button
              type="button"
              disabled={!isAcknowledged || isSubmitting}
              onClick={handleExecute}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isDestructive
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500'
                  : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Authorization...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{confirmButtonText}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};


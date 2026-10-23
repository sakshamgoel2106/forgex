import React, { useState, useEffect } from 'react';
import { CheckCircle2, GraduationCap, RefreshCw, Lightbulb } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import { useToast } from '../../lib/ToastContext';
import { apiFetch } from '../../lib/api';

export interface ExpertKnowledgePrefill {
  machineAssetTag: string;
  issueTitle: string;
  category?: string;
  resolutionSummary: string;
  symptom?: string;
}

interface ExpertKnowledgeCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillData: ExpertKnowledgePrefill | null;
  onSavedToHistoryOnly?: () => void;
  onPublishedToExpert?: () => void;
}

export const PRACTICAL_CATEGORIES = [
  'Reliability',
  'Troubleshooting Trick',
  'Tooling Hack',
  'Safety & LOTO',
  'Startup / Shutdown',
  'Preventive Maintenance',
];

export const ExpertKnowledgeCaptureModal: React.FC<ExpertKnowledgeCaptureModalProps> = ({
  isOpen,
  onClose,
  prefillData,
  onSavedToHistoryOnly,
  onPublishedToExpert,
}) => {
  const { toast } = useToast();
  const [shareToExpert, setShareToExpert] = useState(true);
  const [machineAssetTag, setMachineAssetTag] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [category, setCategory] = useState('Reliability');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [symptom, setSymptom] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (prefillData) {
      setMachineAssetTag(prefillData.machineAssetTag || '');
      setIssueTitle(prefillData.issueTitle || '');
      setCategory(prefillData.category || 'Reliability');
      setResolutionSummary(prefillData.resolutionSummary || '');
      setSymptom(prefillData.symptom || '');
      setShareToExpert(true);
    }
  }, [prefillData]);

  const handleSkipOnlyHistory = () => {
    toast.success(
      'Archived to Maintenance History',
      'Ticket record sealed and logged in permanent plant audit ledger.'
    );
    onSavedToHistoryOnly?.();
    onClose();
  };

  const handlePublishAndClose = async () => {
    if (!shareToExpert) {
      handleSkipOnlyHistory();
      return;
    }

    if (!issueTitle.trim()) {
      toast.error('Validation Error', 'Task / Issue Title is required.');
      return;
    }
    if (!resolutionSummary.trim()) {
      toast.error('Validation Error', 'Resolution / Field Note Summary is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        notes: [
          {
            title: issueTitle.trim(),
            description: resolutionSummary.trim(),
            category: category || 'Reliability',
            severity: 'Pro-Tip / Best Practice',
            symptom: symptom.trim() || null,
            taskDuringIssue: issueTitle.trim(),
            assetTag: machineAssetTag.trim().toUpperCase() || null,
            status: 'APPROVED',
          },
        ],
      };

      const res = await apiFetch('/api/v1/recovery/expert-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to publish note (${res.status})`);
      }

      toast.success(
        'Published to Expert Knowledge & History',
        `Practical fix for ${machineAssetTag || 'equipment'} is now available in Expert Knowledge & AI Copilot!`
      );

      onPublishedToExpert?.();
      onClose();
    } catch (err: any) {
      toast.error('Publication Notice', err.message || 'Could not publish to Expert Knowledge.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="✅ Ticket Resolved & Logged to Maintenance History"
      subtitle="Audit record sealed in Maintenance History. Optionally preserve this fix in Expert Knowledge for team reference."
      maxWidth="xl"
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between w-full gap-2.5 pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkipOnlyHistory}
            disabled={isSubmitting}
            className="w-full sm:w-auto text-slate-600 hover:bg-slate-100 text-xs font-semibold px-4 py-2"
          >
            Skip — Only Save to Maintenance History
          </Button>
          <Button
            size="sm"
            onClick={handlePublishAndClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing to Expert Knowledge...</span>
              </>
            ) : (
              <>
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Publish to Expert Knowledge & Close</span>
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Success Banner */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="leading-snug">
            <span className="font-bold">Procedure Verified & Archived:</span> Permanent entry generated in{' '}
            <strong className="font-mono text-emerald-800">Maintenance History</strong>. Equipment operational state cleared.
          </div>
        </div>

        {/* Optional Share Section Toggle Card */}
        <div className="p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200 rounded-xl space-y-3 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Lightbulb className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">
                  💡 Share Relevant Fix to Expert Knowledge? (Optional)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Allow other engineers & AI Copilot to immediately retrieve this verified fix.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={shareToExpert}
              onClick={() => setShareToExpert(!shareToExpert)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                shareToExpert ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  shareToExpert ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {shareToExpert && (
            <div className="space-y-3 pt-2 border-t border-blue-200/60 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Machine / Asset */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 text-xs">Machine / Asset</label>
                  <input
                    type="text"
                    value={machineAssetTag}
                    onChange={(e) => setMachineAssetTag(e.target.value)}
                    placeholder="e.g. PUMP-204-B"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-hidden focus:border-blue-500 shadow-2xs"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 text-xs">Knowledge Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 shadow-2xs cursor-pointer font-sans"
                  >
                    {PRACTICAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Task / Issue */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 text-xs">Task / Issue Title</label>
                <input
                  type="text"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g. Centrifugal Slurry Pump Mechanical Seal Face Replacement"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 shadow-2xs"
                />
              </div>

              {/* Resolution / Field Note Summary */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 text-xs flex items-center justify-between">
                  <span>Resolution / Field Note Summary</span>
                  <span className="text-[10px] text-slate-400 font-mono">Editable field tip</span>
                </label>
                <textarea
                  rows={3}
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  placeholder="Detail the exact fix, torque value, clearance spec, or procedural trick that solved the fault..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 shadow-2xs leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

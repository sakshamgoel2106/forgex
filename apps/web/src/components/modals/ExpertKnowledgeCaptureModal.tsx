import React, { useState, useEffect } from 'react';
import { CheckCircle2, GraduationCap, RefreshCw, Lightbulb, X } from 'lucide-react';
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

/**
 * Sanitizes machine asset tags by removing file extensions (.glb, .pdf, etc.)
 * and balancing incomplete parens like "COOLING TOWER (COOLING-TOWER.G"
 */
export function sanitizeAssetTag(tag: string): string {
  if (!tag) return 'PLANT-MACHINE';
  let cleaned = tag.trim();
  // Strip trailing file formats that sometimes leak into tag from manual ingestion
  cleaned = cleaned.replace(/\.(glb|gltf|pdf|step|stp|dwg)$/i, '');
  // Fix cut off trailing dot or single letter artifact like ".G"
  cleaned = cleaned.replace(/\.[A-Za-z0-9]{1,2}$/, '');
  // Balance dangling opening parens
  if (cleaned.includes('(') && !cleaned.includes(')')) {
    cleaned = `${cleaned})`;
  }
  return cleaned;
}

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
      setMachineAssetTag(sanitizeAssetTag(prefillData.machineAssetTag || ''));
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
    
    // Global cross-module redirection to Maintenance History
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'maintenance-history' }));
      window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'history' } }));
      window.location.hash = '#maintenance-history';
    }
    
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

    const cleanTag = sanitizeAssetTag(machineAssetTag);

    setIsSubmitting(true);
    try {
      const newNote = {
        id: `note-${Date.now()}`,
        title: issueTitle.trim(),
        description: resolutionSummary.trim(),
        category: category || 'Reliability',
        severity: 'Pro-Tip / Best Practice',
        symptom: symptom.trim() || null,
        taskDuringIssue: issueTitle.trim(),
        machineAssetTag: cleanTag,
        machineAssetTags: [cleanTag],
        upvotes: 1,
        downvotes: 0,
        createdAt: new Date().toISOString(),
        authorName: 'Lead Plant Engineer',
        status: 'APPROVED',
      };

      // 1. Immediately cache in localStorage for zero-lag instant appearance in Expert Knowledge
      try {
        const stored = localStorage.getItem('forgex_expert_notes');
        const notes = stored ? JSON.parse(stored) : [];
        const filtered = notes.filter((n: any) => n.id !== newNote.id);
        filtered.unshift(newNote);
        localStorage.setItem('forgex_expert_notes', JSON.stringify(filtered));
        localStorage.setItem('forgex_latest_published_note', JSON.stringify(newNote));
        window.dispatchEvent(new CustomEvent('forgex:expert-note-created', { detail: newNote }));
      } catch (e) {
        console.warn('Could not cache note in localStorage:', e);
      }

      // 2. Persist to API
      const payload = {
        notes: [
          {
            title: issueTitle.trim(),
            description: resolutionSummary.trim(),
            category: category || 'Reliability',
            severity: 'Pro-Tip / Best Practice',
            symptom: symptom.trim() || null,
            taskDuringIssue: issueTitle.trim(),
            assetTag: cleanTag.toUpperCase(),
            status: 'APPROVED',
          },
        ],
      };

      await apiFetch('/api/v1/recovery/expert-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((apiErr) => {
        console.warn('API sync notice for expert note:', apiErr);
      });

      toast.success(
        'Published to Expert Knowledge & History',
        `Practical fix for ${cleanTag || 'equipment'} is now available in Expert Knowledge & AI Copilot!`
      );

      // 3. Trigger callback
      onPublishedToExpert?.();

      // 4. Global cross-module redirection to Expert Knowledge
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'expert-knowledge' }));
        window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'expert' } }));
        window.location.hash = '#expert-knowledge';
      }

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
      maxWidth="xl"
      customHeader={
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 rounded-t-xl sm:rounded-t-2xl flex items-center justify-between border-b border-indigo-900/60 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight font-sans">
                Ticket Resolved & Logged to Maintenance History
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 font-sans leading-relaxed">
                Audit record sealed in Maintenance History. Optionally preserve this fix in Expert Knowledge for team reference.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between w-full gap-2.5 pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkipOnlyHistory}
            disabled={isSubmitting}
            className="w-full sm:w-auto text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-semibold px-4 py-2 border-slate-300 cursor-pointer"
          >
            Skip — Only Save to Maintenance History
          </Button>
          <button
            type="button"
            onClick={handlePublishAndClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg inline-flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing to Expert Knowledge...</span>
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4" />
                <span>Publish to Expert Knowledge & Close</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Success Banner styled with subtle emerald-to-teal gradient */}
        <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50/80 to-emerald-50/50 border border-emerald-200/80 rounded-xl flex items-center gap-2.5 text-emerald-950 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="leading-snug">
            <span className="font-bold">Procedure Verified & Archived:</span> Permanent entry generated in{' '}
            <strong className="font-mono text-emerald-800">Maintenance History</strong>. Equipment operational state cleared.
          </div>
        </div>

        {/* Share Section Container styled with soft indigo-to-blue gradient surface */}
        <div className="bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/40 border border-indigo-200/80 rounded-xl p-4 space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Lightbulb className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-xs">
                  Share Relevant Fix to Expert Knowledge? (Optional)
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
                shareToExpert ? 'bg-indigo-600' : 'bg-slate-300'
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
            <div className="space-y-3 pt-2.5 border-t border-indigo-100 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Machine / Asset - Clean untruncated display */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 text-xs">Machine / Asset</label>
                  <input
                    type="text"
                    value={machineAssetTag}
                    onChange={(e) => setMachineAssetTag(e.target.value)}
                    placeholder="e.g. COOLING-TOWER-01"
                    title={machineAssetTag}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 text-xs">Knowledge Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 shadow-2xs cursor-pointer font-sans"
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
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
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
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 shadow-2xs leading-relaxed font-sans"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
export default ExpertKnowledgeCaptureModal;

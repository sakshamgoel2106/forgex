import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  User,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  Trash2,
  Zap,
  X,
  Filter,
  Sparkles,
  Cpu,
  Layers,
  Wrench,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Pencil,
  Copy,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { ExpertNoteReview, ReviewOutcome } from '@forgex/shared-types';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { apiFetch } from '../../lib/api';

export type ExpertCategory =
  | 'Reliability'
  | 'Tooling Hack'
  | 'Safety & LOTO'
  | 'Troubleshooting Trick'
  | 'Startup / Shutdown'
  | 'Preventive Maintenance';

export type ExpertSeverity =
  | 'Pro-Tip / Best Practice'
  | 'Critical Machine Warning'
  | 'Safety Hazard'
  | 'Time-Saver Hack';

export interface ExpertNote {
  id: string;
  organizationId?: string;
  plantId?: string;
  title: string;
  description: string;
  aiSupplementalInsight?: string | null;
  category: ExpertCategory | string;
  severity?: ExpertSeverity | string;
  symptom?: string | null;
  taskDuringIssue?: string | null;
  observedAt?: string | null;
  machineAssetTag?: string | null;
  machineAssetTags?: string[];
  upvotes: number;
  downvotes?: number;
  reviews?: ExpertNoteReview[];
  averageRating?: number;
  reviewCount?: number;
  authorUserId?: string;
  authorEmail?: string | null;
  authorRole?: string | null;
  authorName?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  // legacy compatibility
  author?: string;
  role?: string;
  assetTag?: string;
  content?: string;
  date?: string;
}

interface NoteFormItem {
  clientId: string;
  title: string;
  assetTag: string;
  taskDuringIssue: string;
  observedAt: string;
  category: ExpertCategory;
  severity: ExpertSeverity;
  symptom: string;
  content: string;
}

interface ReviewDraft {
  rating: number;
  outcome: ReviewOutcome;
  comment: string;
}

const PRACTICAL_CATEGORIES: ExpertCategory[] = [
  'Reliability',
  'Tooling Hack',
  'Safety & LOTO',
  'Troubleshooting Trick',
  'Startup / Shutdown',
  'Preventive Maintenance',
];

const PRACTICAL_SEVERITIES: ExpertSeverity[] = [
  'Pro-Tip / Best Practice',
  'Critical Machine Warning',
  'Safety Hazard',
  'Time-Saver Hack',
];

const COMMON_TASKS = [
  'Routine Startup',
  'Seal Overhaul',
  'Load Testing',
  'Preventive Maintenance',
  'Calibration',
  'Emergency Shutdown',
  'Bearing Lubrication',
  'Shift Handover Inspection',
  'Filter Cleaning / Replacement',
  'Troubleshooting / Fault Clearance',
];

function getCurrentLocalDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatObservedDateTime(isoOrString?: string | null): string {
  if (!isoOrString) return '';
  try {
    const d = new Date(isoOrString);
    if (isNaN(d.getTime())) return isoOrString;
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoOrString;
  }
}

function createDefaultNoteItem(defaultMachineTag = ''): NoteFormItem {
  return {
    clientId: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    assetTag: defaultMachineTag,
    taskDuringIssue: 'Routine Startup',
    observedAt: getCurrentLocalDateTime(),
    category: 'Reliability',
    severity: 'Pro-Tip / Best Practice',
    symptom: '',
    content: '',
  };
}

function getFallbackAiInsight(note: ExpertNote): string {
  if (note.aiSupplementalInsight && note.aiSupplementalInsight.trim().length > 0) {
    return note.aiSupplementalInsight;
  }
  const tag = (
    (note.machineAssetTags && note.machineAssetTags[0]) ||
    note.machineAssetTag ||
    note.assetTag ||
    'EQUIPMENT'
  ).toUpperCase();
  const cat = note.category || 'Reliability';
  const task = note.taskDuringIssue || 'Routine Maintenance';

  if (tag.includes('PUMP') || tag.includes('SLURRY')) {
    return `Cross-check API 610 seal flush Plan 11/53A pressures before starting. Verify casing bolt torque cross-pattern sequence to 85 Nm, and ensure full LOTO isolation of primary suction and discharge isolation valves prior to mechanical seal servicing.`;
  } else if (tag.includes('GEN') || tag.includes('DIESEL') || tag.includes('101')) {
    return `Cross-check OEM manual Section 4.2 for cold-crank pre-lubrication pressure (min 1.8 bar). Verify rotating diode exciter bridge diodes with multimeter before synchronizing, and confirm emergency stop governor trip latch is fully engaged and free of carbon fouling.`;
  } else if (tag.includes('PKG') || tag.includes('901') || tag.includes('CONV')) {
    return `Verify photo-eye sensor optical alignment (margin > 3.0) and tension roller radial runout under 0.05 mm. Confirm Category 4 dual-channel safety relay interlock is tested and cleared before restarting packaging line indexing cycle.`;
  } else if (tag.includes('HEX') || tag.includes('PLATE') || tag.includes('HEAT') || tag.includes('801')) {
    return `Cross-check tightening dimension 'A' across plate pack per heat exchanger manual drawing. Ensure differential pressure across plates does not exceed 4.5 bar during initial fluid charging, and purge all entrained air via top vent valves.`;
  } else if (tag.includes('TURB') || tag.includes('COMP')) {
    return `Verify unloader valve clearance (0.015" feeler gauge) and confirm radial shaft vibration is under 2.8 mm/s RMS (ISO 10816-3). Execute NFPA 70E Arc Flash Class 2 PPE protocol during high-voltage auxiliary lube skid power isolation.`;
  } else if (cat === 'Safety & LOTO') {
    return `Mandatory zero-energy state verification required per OSHA 1910.147. Bleed residual pneumatic/hydraulic line pressure to 0 psig, apply secondary safety padlocks to breaker panel, and log lockout tagout serial number before initiating teardown.`;
  } else {
    return `Cross-check OEM Technical Manual Section 6 for torque tolerances and lubrication intervals. Verify alignment using dial indicator within ±0.05 mm tolerance, and ensure all electrical interlocks and safety guards are re-certified prior to returning machine ${tag} to active production during ${task}.`;
  }
}

export const ExpertKnowledgeView: React.FC = () => {
  const { toast } = useToast();
  const { user, organization, membership } = useAuth();

  const userRole = membership?.role;
  const isAdminOrOwner =
    userRole === 'ORGANIZATION_OWNER' ||
    userRole === 'ORGANIZATION_ADMIN' ||
    userRole === 'PLANT_MANAGER';

  const [notes, setNotes] = useState<ExpertNote[]>([]);
  const [uploadedMachines, setUploadedMachines] = useState<Array<{ assetTag: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [machineFilter, setMachineFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'HELPFUL' | 'RATING'>('NEWEST');

  // Quick Edit Modal State
  const [editingNote, setEditingNote] = useState<ExpertNote | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSymptom, setEditSymptom] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Multi-Note Modal
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [formNotes, setFormNotes] = useState<NoteFormItem[]>([createDefaultNoteItem()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expanded Reviews & Draft Inputs per Note (Default rating: 0 stars)
  const [expandedReviews, setExpandedReviews] = useState<{ [noteId: string]: boolean }>({});
  const [reviewFormData, setReviewFormData] = useState<{ [noteId: string]: ReviewDraft }>({});
  const [submittingReview, setSubmittingReview] = useState<{ [noteId: string]: boolean }>({});

  // Load Notes from Backend API (Silently in background when showLoading = false)
  const fetchNotes = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const res = await apiFetch('/api/v1/recovery/expert-library');
      if (!res.ok) {
        throw new Error(`Failed to load expert library (${res.status})`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setNotes(data.data);
      } else {
        setNotes([]);
      }
    } catch (err: any) {
      console.error('Error fetching expert knowledge notes:', err);
      toast.error('Repository Connection Error', 'Could not load expert notes from server.');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [toast]);

  // Load Strictly Uploaded Machines from Knowledge Hub Documents
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      apiFetch('/api/v1/documents').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/api/v1/machines').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([docJson, machineJson]) => {
        if (!isMounted) return;

        const docs: any[] = docJson?.success && Array.isArray(docJson.data) ? docJson.data : [];
        const allMachines: any[] =
          machineJson?.success && Array.isArray(machineJson.data) ? machineJson.data : [];

        // Collect unique asset tags referenced strictly in ingested Knowledge Hub documents
        const docAssetTags = new Set<string>();
        docs.forEach((doc) => {
          if (Array.isArray(doc.assetTags)) {
            doc.assetTags.forEach((t: any) => {
              const tagStr = String(t || '').trim().toUpperCase();
              if (tagStr && tagStr !== 'PLANT_WIDE' && tagStr !== 'ALL') {
                docAssetTags.add(tagStr);
              }
            });
          } else if (typeof doc.assetTags === 'string') {
            doc.assetTags.split(',').forEach((t: string) => {
              const tagStr = t.trim().toUpperCase();
              if (tagStr && tagStr !== 'PLANT_WIDE' && tagStr !== 'ALL') {
                docAssetTags.add(tagStr);
              }
            });
          }
        });

        const filtered: Array<{ assetTag: string; name: string }> = [];
        docAssetTags.forEach((tag) => {
          const matched = allMachines.find((m) => m.assetTag?.toUpperCase() === tag);
          filtered.push({
            assetTag: tag,
            name: matched?.name || tag,
          });
        });
        filtered.sort((a, b) => a.assetTag.localeCompare(b.assetTag));

        setUploadedMachines(filtered);
      })
      .catch((err) => console.warn('Could not load Knowledge Hub uploaded machines', err));

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fetchNotes(true);
  }, [fetchNotes]);

  // Upvote Handler (Optimistic with silent background sync)
  const handleUpvote = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Optimistic UI update
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, upvotes: (n.upvotes || 0) + 1 } : n))
    );

    try {
      const res = await apiFetch(`/api/v1/recovery/expert-library/${id}/upvote`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to persist upvote');
      }
      const result = await res.json();
      if (result.success && result.data) {
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...result.data } : n)));
      }
      toast.info('Insight Endorsed', 'Thank you for endorsing peer reliability expertise.');
    } catch (err: any) {
      // Rollback
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, upvotes: Math.max(0, (n.upvotes || 0) - 1) } : n))
      );
      toast.error('Upvote Failed', 'Could not record your endorsement.');
    }
  };

  // Dislike Handler (Optimistic with silent background sync)
  const handleDislike = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Optimistic UI update
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, downvotes: (n.downvotes || 0) + 1 } : n))
    );

    try {
      const res = await apiFetch(`/api/v1/recovery/expert-library/${id}/downvote`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to persist dislike');
      }
      const result = await res.json();
      if (result.success && result.data) {
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...result.data } : n)));
      }
      toast.info('Feedback Recorded', 'Issue flagged for engineering review.');
    } catch (err: any) {
      // Rollback
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, downvotes: Math.max(0, (n.downvotes || 0) - 1) } : n))
      );
      toast.error('Feedback Failed', 'Could not record dislike.');
    }
  };

  // Review Drawer Toggle & Form Helpers (Starts strictly at 0 stars)
  const toggleReviews = (noteId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setExpandedReviews((prev) => ({
      ...prev,
      [noteId]: !prev[noteId],
    }));
    if (!reviewFormData[noteId]) {
      setReviewFormData((prev) => ({
        ...prev,
        [noteId]: {
          rating: 0,
          outcome: 'WORKED_IN_FIELD',
          comment: '',
        },
      }));
    }
  };

  const updateReviewForm = (noteId: string, patch: Partial<ReviewDraft>) => {
    setReviewFormData((prev) => {
      const current = prev[noteId] || {
        rating: 0,
        outcome: 'WORKED_IN_FIELD' as ReviewOutcome,
        comment: '',
      };
      return {
        ...prev,
        [noteId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const handleReviewSubmit = async (noteId: string, e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const draft = reviewFormData[noteId] || {
      rating: 0,
      outcome: 'WORKED_IN_FIELD',
      comment: '',
    };

    if (!draft.rating || draft.rating < 1) {
      toast.error('Star Rating Required', 'Please actively select a star rating (1 to 5) before submitting.');
      return;
    }

    if (!draft.comment.trim()) {
      toast.error('Validation Error', 'Please enter a brief field review comment.');
      return;
    }

    setSubmittingReview((prev) => ({ ...prev, [noteId]: true }));
    try {
      const res = await apiFetch(`/api/v1/recovery/expert-library/${noteId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: draft.rating,
          outcome: draft.outcome,
          comment: draft.comment.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to record review (${res.status})`);
      }

      const result = await res.json();
      if (result.success && result.data) {
        setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...result.data } : n)));
      }

      // Reset draft form to 0 stars
      setReviewFormData((prev) => ({
        ...prev,
        [noteId]: {
          rating: 0,
          outcome: 'WORKED_IN_FIELD',
          comment: '',
        },
      }));

      toast.success(
        'Field Review Recorded',
        'Thank you! Your practical field feedback and rating have been shared with plant technicians.'
      );
    } catch (err: any) {
      toast.error('Review Submission Failed', err.message || 'Could not post field review.');
    } finally {
      setSubmittingReview((prev) => ({ ...prev, [noteId]: false }));
    }
  };

  // Quick Edit Handlers
  const handleOpenEdit = (note: ExpertNote, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setEditingNote(note);
    setEditTitle(note.title);
    setEditSymptom(note.symptom || '');
    setEditDescription(note.description || note.content || '');
  };

  const handleSaveEdit = async () => {
    if (!editingNote) return;
    if (!editTitle.trim()) {
      toast.error('Validation Error', 'Title cannot be empty.');
      return;
    }
    if (!editDescription.trim()) {
      toast.error('Validation Error', 'Recommended action guidance cannot be empty.');
      return;
    }

    setIsSavingEdit(true);
    const updatedNoteId = editingNote.id;
    // Optimistic update
    setNotes((prev) =>
      prev.map((n) =>
        n.id === updatedNoteId
          ? {
              ...n,
              title: editTitle.trim(),
              symptom: editSymptom.trim() || null,
              description: editDescription.trim(),
              content: editDescription.trim(),
            }
          : n
      )
    );

    try {
      const res = await apiFetch(`/api/v1/recovery/expert-library/${updatedNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          symptom: editSymptom.trim() || null,
          description: editDescription.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save changes');
      }

      const data = await res.json();
      if (data.success && data.data) {
        setNotes((prev) => prev.map((n) => (n.id === updatedNoteId ? { ...n, ...data.data } : n)));
      }

      toast.success('Note Updated', 'Field note updated and re-indexed.');
      setEditingNote(null);
    } catch (err: any) {
      toast.error('Update Failed', err.message || 'Could not update note.');
      fetchNotes(false);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 1-Click Copy & Ask Copilot Handlers
  const handleCopyTip = async (note: ExpertNote, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const textToCopy = `[${note.title}]\nMachine: ${note.machineAssetTag || note.assetTag || 'PLANT_WIDE'}\nGuidance: ${note.description || note.content || ''}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success('Tip Copied', 'Field guidance copied to clipboard.');
    } catch (err) {
      toast.error('Copy Failed', 'Could not copy tip to clipboard.');
    }
  };

  const handleAskCopilot = (note: ExpertNote, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const prompt = `Troubleshooting guidance for ${note.title} on machine ${note.machineAssetTag || note.assetTag || 'PLANT_WIDE'}: ${note.symptom ? `Trigger: ${note.symptom}. ` : ''}${note.description || note.content || ''}`;
    window.dispatchEvent(new CustomEvent('open-ai-copilot', { detail: { prompt } }));
    toast.info('Copilot Prompt Ready', 'Opened AI Copilot with this note context.');
  };

  // Delete Handler (Optimistic UI update)
  const handleDelete = async (note: ExpertNote, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const isAuthor =
      user && (note.authorUserId === user.id || (note.authorEmail && note.authorEmail === user.email));
    if (!isAdminOrOwner && !isAuthor) {
      toast.error('Unauthorized', 'Only organization administrators or the original author may delete this note.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${note.title}"? This will remove it from both repository and AI vector search.`)) {
      return;
    }

    // Optimistic delete
    setNotes((prev) => prev.filter((n) => n.id !== note.id));

    try {
      const res = await apiFetch(`/api/v1/recovery/expert-library/${note.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete expert note');
      }
      toast.success('Note Deleted', 'Expert knowledge note removed from repository and vector index.');
    } catch (err: any) {
      toast.error('Delete Failed', err.message || 'Could not delete note.');
      fetchNotes(false);
    }
  };

  // Multi-Note Form Helpers
  const updateFormNote = (index: number, patch: Partial<NoteFormItem>) => {
    setFormNotes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleAddAnotherSection = () => {
    const defaultTag = uploadedMachines.length > 0 ? uploadedMachines[0].assetTag : '';
    setFormNotes((prev) => [...prev, createDefaultNoteItem(defaultTag)]);
  };

  const handleRemoveSection = (index: number) => {
    if (formNotes.length <= 1) return;
    setFormNotes((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Handler (Supports Batch Creation)
  const submitNotes = async (closeModalAfter: boolean) => {
    // Validate all notes
    for (let i = 0; i < formNotes.length; i++) {
      const n = formNotes[i];
      if (!n.title.trim()) {
        toast.error('Validation Error', `Note #${i + 1} requires a Title / Subject.`);
        return false;
      }
      if (!n.assetTag.trim()) {
        toast.error('Validation Error', `Note #${i + 1} requires a Target Machine selection.`);
        return false;
      }
      if (!n.taskDuringIssue.trim()) {
        toast.error('Validation Error', `Note #${i + 1} requires Task / Operation Being Performed.`);
        return false;
      }
      if (!n.content.trim()) {
        toast.error('Validation Error', `Note #${i + 1} requires Observation & Field Guidance.`);
        return false;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = formNotes.map((n) => ({
        title: n.title.trim(),
        description: n.content.trim(),
        category: n.category,
        severity: n.severity,
        symptom: n.symptom.trim() || null,
        taskDuringIssue: n.taskDuringIssue.trim() || null,
        observedAt: n.observedAt ? new Date(n.observedAt).toISOString() : null,
        assetTag: n.assetTag.trim().toUpperCase() || null,
        status: 'APPROVED',
      }));

      const res = await apiFetch('/api/v1/recovery/expert-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: payload }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Server responded with ${res.status}`);
      }

      await fetchNotes(false);

      const defaultTag = uploadedMachines.length > 0 ? uploadedMachines[0].assetTag : '';
      if (closeModalAfter) {
        setIsSubmitOpen(false);
        setFormNotes([createDefaultNoteItem(defaultTag)]);
        toast.success(
          'Field Notes Published',
          `${payload.length} field insight(s) saved and indexed into AI Copilot.`
        );
      } else {
        // Reset form for new batch but leave modal open
        setFormNotes([createDefaultNoteItem(defaultTag)]);
        toast.success(
          'Saved & Ready for Next',
          `${payload.length} field note(s) saved. Ready for your next entry.`
        );
      }
      return true;
    } catch (err: any) {
      toast.error('Submission Failed', err.message || 'Could not publish field notes.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Computed KPI counts for Header
  const verifiedCount = useMemo(() => {
    return notes.filter((n) => {
      const hasWorkedReview = Array.isArray(n.reviews) && n.reviews.some((r) => r.outcome === 'WORKED_IN_FIELD');
      return (n.upvotes && n.upvotes > 0) || hasWorkedReview || n.status === 'APPROVED';
    }).length;
  }, [notes]);

  const criticalCount = useMemo(() => {
    return notes.filter((n) => {
      const isCriticalSev = n.severity === 'Critical Machine Warning' || n.severity === 'Safety Hazard';
      const hasHighDislikes = (n.downvotes || 0) >= 3;
      return isCriticalSev || hasHighDislikes;
    }).length;
  }, [notes]);

  // Filtering Logic
  const filteredNotes = notes.filter((note) => {
    const rawContent = note.description || note.content || '';
    const rawAuthor = note.authorName || note.author || note.authorEmail || '';
    const rawTags = (note.machineAssetTags && note.machineAssetTags.join(' ')) || note.machineAssetTag || note.assetTag || '';
    const rawSymptom = note.symptom || '';
    const rawTask = note.taskDuringIssue || '';
    const query = search.toLowerCase().trim();

    if (query) {
      const matchesSearch =
        note.title.toLowerCase().includes(query) ||
        rawContent.toLowerCase().includes(query) ||
        rawTags.toLowerCase().includes(query) ||
        rawTask.toLowerCase().includes(query) ||
        rawSymptom.toLowerCase().includes(query) ||
        rawAuthor.toLowerCase().includes(query) ||
        (note.category && note.category.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    if (categoryFilter !== 'ALL' && note.category !== categoryFilter) {
      return false;
    }

    if (severityFilter !== 'ALL' && (note.severity || 'Pro-Tip / Best Practice') !== severityFilter) {
      return false;
    }

    if (machineFilter !== 'ALL') {
      const matchesMachine =
        note.machineAssetTag?.toUpperCase() === machineFilter.toUpperCase() ||
        (note.machineAssetTags &&
          note.machineAssetTags.some((t) => t.toUpperCase() === machineFilter.toUpperCase())) ||
        note.assetTag?.toUpperCase() === machineFilter.toUpperCase();
      if (!matchesMachine) return false;
    }

    return true;
  });

  // Sort filtered notes
  const sortedAndFilteredNotes = useMemo(() => {
    const list = [...filteredNotes];
    if (sortBy === 'HELPFUL') {
      list.sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0)));
    } else if (sortBy === 'RATING') {
      list.sort((a, b) => (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0));
    } else {
      // NEWEST
      list.sort((a, b) => {
        const dateA = new Date(a.observedAt || a.createdAt || a.date || 0).getTime();
        const dateB = new Date(b.observedAt || b.createdAt || b.date || 0).getTime();
        return dateB - dateA;
      });
    }
    return list;
  }, [filteredNotes, sortBy]);

  const getSeverityBadgeClasses = (severity?: string) => {
    switch (severity) {
      case 'Critical Machine Warning':
        return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700';
      case 'Safety Hazard':
        return 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700';
      case 'Time-Saver Hack':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700';
      case 'Pro-Tip / Best Practice':
      default:
        return 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700';
    }
  };

  const getCategoryBadgeClasses = (category: string) => {
    switch (category) {
      case 'Safety & LOTO':
        return 'text-rose-600 bg-rose-50/70 border-rose-200';
      case 'Tooling Hack':
        return 'text-purple-600 bg-purple-50/70 border-purple-200';
      case 'Startup / Shutdown':
        return 'text-orange-600 bg-orange-50/70 border-orange-200';
      case 'Troubleshooting Trick':
        return 'text-indigo-600 bg-indigo-50/70 border-indigo-200';
      case 'Preventive Maintenance':
        return 'text-teal-600 bg-teal-50/70 border-teal-200';
      case 'Reliability':
      default:
        return 'text-blue-600 bg-blue-50/70 border-blue-200';
    }
  };

  // Structured Note Card Renderer
  const renderNoteCard = (note: ExpertNote) => {
    const displayAuthor = note.authorName || note.author || note.authorEmail || 'Senior Technician';
    const displayRole = note.authorRole || note.role || 'Frontline Expert';
    const displayContent = note.description || note.content || '';
    const displayDate = formatObservedDateTime(note.observedAt || note.createdAt || note.date);
    const displaySeverity = (note.severity as ExpertSeverity) || 'Pro-Tip / Best Practice';
    const displayAiInsight = getFallbackAiInsight(note);

    const rawTags = (note.machineAssetTags && note.machineAssetTags.length > 0)
      ? note.machineAssetTags
      : (note.machineAssetTag || note.assetTag || 'PLANT_WIDE')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

    const isAuthor =
      user && (note.authorUserId === user.id || (note.authorEmail && note.authorEmail === user.email));
    const canManage = isAdminOrOwner || isAuthor;

    const isReviewsOpen = !!expandedReviews[note.id];
    const reviewsList = Array.isArray(note.reviews) ? note.reviews : [];
    const reviewCount = typeof note.reviewCount === 'number' ? note.reviewCount : reviewsList.length;
    const hasReviews = reviewCount > 0;
    const avgRating = hasReviews && typeof note.averageRating === 'number' ? Number(note.averageRating).toFixed(1) : '0.0';

    const needsReview = (note.downvotes || 0) >= 3 || ((note.downvotes || 0) > (note.upvotes || 0) && (note.downvotes || 0) >= 2);

    return (
      <div
        key={note.id}
        className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3.5 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between"
      >
        <div className="space-y-3">
          {/* Header Row: Category, Severity & Warning Badges on left; Date, Copy, Copilot, Edit, Delete on right */}
          <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${getCategoryBadgeClasses(
                  note.category
                )}`}
              >
                {note.category}
              </span>
              <span
                className={`text-[10px] font-sans px-2 py-0.5 rounded border font-semibold ${getSeverityBadgeClasses(
                  displaySeverity
                )}`}
              >
                {displaySeverity}
              </span>
              {needsReview && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-bold flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                  ⚠️ Needs Engineer Review
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {displayDate && (
                <span className="text-[11px] font-mono text-slate-400 font-medium mr-1 hidden sm:inline">
                  {displayDate}
                </span>
              )}
              {/* 1-Click Copy Tip */}
              <button
                type="button"
                onClick={(e) => handleCopyTip(note, e)}
                title="Copy field tip guidance to clipboard"
                className="text-slate-400 hover:text-blue-600 transition p-1.5 rounded-md hover:bg-blue-50 flex items-center gap-1 text-[11px] font-mono"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Copy</span>
              </button>

              {/* Ask AI Copilot */}
              <button
                type="button"
                onClick={(e) => handleAskCopilot(note, e)}
                title="Open AI Copilot with this note for troubleshooting"
                className="text-slate-400 hover:text-indigo-600 transition p-1.5 rounded-md hover:bg-indigo-50 flex items-center gap-1 text-[11px] font-mono"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden xl:inline">Ask Copilot</span>
              </button>

              {/* Quick Edit (Pencil) */}
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => handleOpenEdit(note, e)}
                  title="Quick edit note title, trigger or guidance"
                  className="text-slate-400 hover:text-amber-600 transition p-1.5 rounded-md hover:bg-amber-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete */}
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(note, e)}
                  title="Delete note (Admin or Author)"
                  className="text-slate-400 hover:text-rose-600 transition p-1.5 rounded-md hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Title & Machine/Task Pill Bar */}
          <div>
            <h4 className="text-sm font-bold text-[#0F172A] leading-snug">
              {note.title}
            </h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {rawTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-mono text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 font-semibold flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3 text-blue-500 shrink-0" />
                  <span>Machine: {tag}</span>
                </span>
              ))}
              {note.taskDuringIssue && (
                <span className="text-[10px] font-mono text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 font-semibold flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-purple-500 shrink-0" />
                  <span>Task During Issue: {note.taskDuringIssue}</span>
                </span>
              )}
            </div>
          </div>

          {/* Block 1 - Trigger / Issue Observed (Amber Box) */}
          {note.symptom && (
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-lg p-2.5 space-y-1">
              <div className="flex items-center gap-1.5 font-mono font-bold text-amber-800 text-[10px] uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>WHEN TO APPLY / TRIGGER CONDITION:</span>
              </div>
              <p className="text-amber-950 text-xs font-sans pl-5 leading-relaxed">
                {note.symptom}
              </p>
            </div>
          )}

          {/* Block 2 - Expert Solution & Field Guidance (Structured Box) */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono font-bold text-slate-700 text-[10px] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>RECOMMENDED FIELD ACTION:</span>
            </div>
            <p className="text-slate-800 text-xs leading-relaxed font-sans whitespace-pre-line pl-5">
              {displayContent}
            </p>
          </div>

          {/* Block 3 - AI Supplemental Knowledge & Manual Cross-Check (Indigo Box) */}
          <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono font-bold text-indigo-900 text-[10px] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>🤖 AI SUPPLEMENTAL INSIGHT & MANUAL CROSS-CHECK:</span>
            </div>
            <p className="text-indigo-950 text-xs leading-relaxed font-sans pl-5">
              {displayAiInsight}
            </p>
          </div>
        </div>

        {/* Footer Row: Author on left; Star rating, Worker Feedback toggle & Upvote/Downvote on right */}
        <div className="space-y-3 pt-3 border-t border-[#F1F5F9] mt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#64748B]">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-700">{displayAuthor}</span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">({displayRole})</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Star Rating Badge / Toggle Button */}
              <button
                type="button"
                onClick={(e) => toggleReviews(note.id, e)}
                className="flex items-center gap-1 text-amber-800 font-bold bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md border border-amber-200 transition text-[11px] font-mono"
                title="View worker ratings and reviews"
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    hasReviews ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                  }`}
                />
                <span>{hasReviews ? `⭐ ${avgRating}` : `☆ 0.0`}</span>
                <span className="text-slate-400 font-normal">({reviewCount} reviews)</span>
              </button>

              {/* Worker Feedback Drawer Toggle */}
              <button
                type="button"
                onClick={(e) => toggleReviews(note.id, e)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-mono font-medium transition ${
                  isReviewsOpen
                    ? 'bg-slate-200 text-slate-900 border-slate-300 font-semibold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
                title="Toggle Worker Feedback & Field Reviews"
              >
                <MessageSquare className="w-3 h-3 text-slate-500" />
                <span className="hidden sm:inline">Worker Feedback</span>
                <span className="sm:hidden">Reviews</span>
                {isReviewsOpen ? (
                  <ChevronUp className="w-3 h-3 ml-0.5" />
                ) : (
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                )}
              </button>

              {/* Upvote (Helpful) Button */}
              <button
                type="button"
                onClick={(e) => handleUpvote(note.id, e)}
                className="flex items-center gap-1 text-[#2563EB] hover:text-blue-700 font-bold bg-blue-50/80 hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-200 transition active:scale-95 text-xs font-mono"
                title="Helpful / Worked in Field (👍)"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>{note.upvotes || 0}</span>
              </button>

              {/* Dislike (Did Not Work) Button */}
              <button
                type="button"
                onClick={(e) => handleDislike(note.id, e)}
                className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold bg-rose-50/80 hover:bg-rose-100 px-2.5 py-1 rounded-md border border-rose-200 transition active:scale-95 text-xs font-mono"
                title="Did Not Work / Field Issue (👎)"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                <span>{note.downvotes || 0}</span>
              </button>
            </div>
          </div>

          {/* Expandable Worker Feedback / Field Reviews Drawer (Collapsed by default, 0 pre-filled reviews) */}
          {isReviewsOpen && (
            <div className="pt-3 border-t border-slate-200 space-y-3 bg-slate-50/70 -mx-5 -mb-5 p-4 rounded-b-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  Worker Feedback / Field Reviews ({reviewsList.length})
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {hasReviews ? `⭐ ${avgRating} / 5.0 Rating` : `☆ 0.0 (0 reviews)`}
                </span>
              </div>

              {/* Review Submission Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleReviewSubmit(note.id, e);
                }}
                className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Star Rating Interactive Selector (Defaults to 0 - outlines) */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500 mr-1 uppercase">
                      Rating:
                    </span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => updateReviewForm(note.id, { rating: star })}
                        className="p-0.5 hover:scale-110 transition"
                        title={`${star} Star${star > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={`w-4 h-4 transition ${
                            star <= (reviewFormData[note.id]?.rating ?? 0)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                    {(reviewFormData[note.id]?.rating ?? 0) === 0 && (
                      <span className="text-[10px] font-mono text-slate-400 ml-1">
                        (Click 1-5 to rate)
                      </span>
                    )}
                  </div>

                  {/* Field Outcome Pills */}
                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    {(['WORKED_IN_FIELD', 'NEEDS_MODIFICATION', 'GENERAL_COMMENT'] as const).map(
                      (outcome) => {
                        const isSelected =
                          (reviewFormData[note.id]?.outcome ?? 'WORKED_IN_FIELD') === outcome;
                        return (
                          <button
                            key={outcome}
                            type="button"
                            onClick={() => updateReviewForm(note.id, { outcome })}
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold transition ${
                              isSelected
                                ? outcome === 'WORKED_IN_FIELD'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : outcome === 'NEEDS_MODIFICATION'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-slate-200 text-slate-800 border-slate-300'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {outcome === 'WORKED_IN_FIELD'
                              ? 'Worked in Field ✓'
                              : outcome === 'NEEDS_MODIFICATION'
                              ? 'Needs Modification ⚠️'
                              : 'General Note 📝'}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Comment Input and Submit */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={reviewFormData[note.id]?.comment ?? ''}
                    onChange={(e) => updateReviewForm(note.id, { comment: e.target.value })}
                    placeholder="e.g. Tested on Shift B, reduced vibration immediately..."
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white font-sans"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    disabled={submittingReview[note.id]}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 h-auto shrink-0 font-semibold"
                  >
                    {submittingReview[note.id] ? 'Posting...' : 'Post Review'}
                  </Button>
                </div>
              </form>

              {/* List of Existing Reviews */}
              {reviewsList.length === 0 ? (
                <p className="text-[11px] text-slate-400 font-mono italic text-center py-2">
                  No field reviews yet. Tested this procedure on shift? Rate and post your feedback above!
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {reviewsList.map((rev) => (
                    <div
                      key={rev.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs space-y-1 shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-700">
                            {rev.userName || 'Field Technician'}
                          </span>
                          <span className="text-slate-400">
                            ({rev.userRole || 'Technician'})
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded font-semibold ${
                              rev.outcome === 'WORKED_IN_FIELD'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : rev.outcome === 'NEEDS_MODIFICATION'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {rev.outcome === 'WORKED_IN_FIELD'
                              ? 'Worked in Field ✓'
                              : rev.outcome === 'NEEDS_MODIFICATION'
                              ? 'Needs Modification'
                              : 'Review'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: rev.rating || 0 }).map((_, i) => (
                            <Star
                              key={i}
                              className="w-2.5 h-2.5 fill-amber-400 text-amber-400"
                            />
                          ))}
                          <span className="text-slate-400 ml-1">
                            {formatObservedDateTime(rev.createdAt)}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-800 text-xs font-sans pl-1 leading-relaxed">
                        {rev.comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full h-full p-5 md:p-6 overflow-y-auto bg-[#F8FAFC] space-y-6">
      {/* Top Banner Toolbar with KPI Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#E2E8F0] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100 shadow-sm">
              <GraduationCap className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono text-[#0F172A] uppercase tracking-wide flex flex-wrap items-center gap-2">
                <span>Tribal & Expert Knowledge Repository</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                  {notes.length} Active Notes
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {verifiedCount} Verified Tips
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-50 text-amber-700 border border-amber-200 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  {criticalCount} Critical Warnings
                </span>
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5 font-sans">
                Frontline senior technician wisdom, undocumented field tricks & startup protocols for{' '}
                <span className="font-semibold text-slate-700">{organization?.name || 'Your Plant'}</span>
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={() => {
            const defaultTag = uploadedMachines.length > 0 ? uploadedMachines[0].assetTag : '';
            setFormNotes([createDefaultNoteItem(defaultTag)]);
            setIsSubmitOpen(true);
          }}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          className="bg-[#0F172A] hover:bg-black text-white font-semibold rounded-lg shadow-sm border border-slate-800"
        >
          Submit Field Note(s)
        </Button>
      </div>

      {/* Filter Toolbar - Single Clean Horizontal Row (No segmented All Notes | Group by Machine) */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-sm">
        {/* 1) Search Input (flex-1) */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by equipment, task, symptom, author, or guidance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 hover:bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:bg-white transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2-5) Dropdown Filters in single clean horizontal row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 2) Uploaded Machine Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs">
            <Cpu className="w-3 h-3 text-slate-500" />
            <select
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Uploaded Machines</option>
              {uploadedMachines.map((m) => (
                <option key={m.assetTag} value={m.assetTag}>
                  {m.assetTag}
                </option>
              ))}
            </select>
          </div>

          {/* 3) Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs">
            <Filter className="w-3 h-3 text-slate-500" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {PRACTICAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 4) Severity Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs">
            <Sparkles className="w-3 h-3 text-slate-500" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              {PRACTICAL_SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </div>

          {/* 5) Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs">
            <Layers className="w-3 h-3 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="NEWEST">Sort: Newest First</option>
              <option value="HELPFUL">Sort: Most Helpful (👍)</option>
              <option value="RATING">Sort: Highest Rated (⭐)</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(search || categoryFilter !== 'ALL' || severityFilter !== 'ALL' || machineFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategoryFilter('ALL');
                setSeverityFilter('ALL');
                setMachineFilter('ALL');
              }}
              className="text-[11px] font-mono text-blue-600 hover:underline px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0]">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-3" />
          <p className="text-xs font-mono text-slate-500">Loading frontline expert notes & vector embeddings...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] max-w-lg mx-auto shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto border border-blue-100">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">No Expert Knowledge Notes Recorded Yet</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed font-sans">
              Capture frontline tribal wisdom, unofficial maintenance tricks, non-standard tooling tips, and undocumented operational behaviors across your plant machinery. Notes are automatically indexed for AI Copilot queries.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => {
              const defaultTag = uploadedMachines.length > 0 ? uploadedMachines[0].assetTag : '';
              setFormNotes([createDefaultNoteItem(defaultTag)]);
              setIsSubmitOpen(true);
            }}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            className="bg-[#0F172A] hover:bg-black text-white font-semibold rounded-lg shadow-sm"
          >
            Submit First Field Note
          </Button>
        </div>
      ) : sortedAndFilteredNotes.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-xl border border-[#E2E8F0] space-y-3">
          <p className="text-xs font-mono text-gray-600">No notes match your filter criteria.</p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              setSearch('');
              setCategoryFilter('ALL');
              setSeverityFilter('ALL');
              setMachineFilter('ALL');
            }}
            className="text-xs font-mono"
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        /* Single Clean Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedAndFilteredNotes.map((note) => renderNoteCard(note))}
        </div>
      )}

      {/* Multi-Note Submission Modal */}
      <Modal
        isOpen={isSubmitOpen}
        onClose={() => {
          if (!isSubmitting) setIsSubmitOpen(false);
        }}
        title="Submit Frontline Expert Note(s)"
        subtitle="Capture plant wisdom, non-standard tooling tips, or preventive observations. Automatically indexed for AI Copilot."
        maxWidth="2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNotes(true);
          }}
          className="space-y-4 max-h-[75vh] overflow-y-auto pr-1"
        >
          {formNotes.map((noteItem, index) => (
            <div
              key={noteItem.clientId}
              className={`p-4 rounded-xl border ${
                formNotes.length > 1
                  ? 'border-blue-200 bg-slate-50/70 shadow-sm'
                  : 'border-slate-200 bg-white'
              } space-y-3.5 relative`}
            >
              {/* Card Header for Multi-Notes */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-[10px] font-mono font-bold">
                    {index + 1}
                  </span>
                  <span className="text-xs font-mono font-bold uppercase text-slate-700 tracking-wider">
                    {formNotes.length > 1 ? `Field Note #${index + 1}` : 'Expert Field Note Entry'}
                  </span>
                </div>

                {formNotes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSection(index)}
                    className="text-xs text-rose-600 hover:text-rose-700 hover:underline font-mono flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {/* Row 1: Title / Subject */}
              <div>
                <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                  Title / Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={noteItem.title}
                  onChange={(e) => updateFormNote(index, { title: e.target.value })}
                  placeholder="e.g. Always purge bypass loop before closing suction valve on startup"
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              {/* Row 2: Equipment Tag & Task During Issue (Clean Select Dropdowns matching Category) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Target Machine / Equipment Tag(s) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={noteItem.assetTag}
                    onChange={(e) => updateFormNote(index, { assetTag: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                  >
                    <option value="" disabled>
                      {uploadedMachines.length > 0
                        ? 'Select Uploaded Machine...'
                        : 'No Uploaded Machines Found (Ingest in Knowledge Hub first)'}
                    </option>
                    {uploadedMachines.map((m) => (
                      <option key={m.assetTag} value={m.assetTag}>
                        {m.assetTag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Task / Operation During Issue <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={noteItem.taskDuringIssue}
                    onChange={(e) => updateFormNote(index, { taskDuringIssue: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                  >
                    <option value="" disabled>
                      Select Task / Operation...
                    </option>
                    {COMMON_TASKS.map((task) => (
                      <option key={task} value={task}>
                        {task}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Category & Impact / Severity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={noteItem.category}
                    onChange={(e) => updateFormNote(index, { category: e.target.value as ExpertCategory })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                  >
                    {PRACTICAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Impact / Severity <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={noteItem.severity}
                    onChange={(e) => updateFormNote(index, { severity: e.target.value as ExpertSeverity })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                  >
                    {PRACTICAL_SEVERITIES.map((sev) => (
                      <option key={sev} value={sev}>
                        {sev}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Observed Date & Time + Symptom Trigger */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Observed Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={noteItem.observedAt}
                    onChange={(e) => updateFormNote(index, { observedAt: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Symptom / When to Apply (Trigger)
                  </label>
                  <input
                    type="text"
                    value={noteItem.symptom}
                    onChange={(e) => updateFormNote(index, { symptom: e.target.value })}
                    placeholder="e.g. Cold startup below 0°C, seal chatter, high vibration"
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Row 5: Observation & Field Guidance */}
              <div>
                <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                  Observation & Field Guidance <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={noteItem.content}
                  onChange={(e) => updateFormNote(index, { content: e.target.value })}
                  placeholder="Describe the operational symptom, root cause mechanism, and recommended field practice..."
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-sans"
                />
              </div>
            </div>
          ))}

          {/* Add Another Field Note Button (Single Plus Sign) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleAddAnotherSection}
              className="w-full py-2 px-3 border border-dashed border-blue-400 bg-blue-50/60 hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Field Note</span>
            </button>
          </div>

          {/* Modal Footer Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0] mt-2">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>{formNotes.length} note(s) ready to submit</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsSubmitOpen(false)}
                className="text-[#64748B] hover:text-[#0F172A] whitespace-nowrap px-3 text-xs"
              >
                Cancel
              </Button>

              {/* Save & Add Another Button */}
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={isSubmitting}
                onClick={() => submitNotes(false)}
                className="font-semibold text-xs border-slate-300 hover:bg-slate-50 whitespace-nowrap px-3"
              >
                Save & Add Another
              </Button>

              {/* Publish Button */}
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isSubmitting}
                className="bg-[#0F172A] text-white hover:bg-black font-semibold rounded-lg shadow-sm whitespace-nowrap px-3.5 text-xs shrink-0"
              >
                {isSubmitting
                  ? 'Publishing...'
                  : formNotes.length > 1
                  ? `Publish ${formNotes.length} Field Notes`
                  : 'Publish Field Note(s)'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Quick Edit Modal */}
      <Modal
        isOpen={!!editingNote}
        onClose={() => {
          if (!isSavingEdit) setEditingNote(null);
        }}
        title="Quick Edit Field Note"
        subtitle="Update title, trigger condition, or recommended action guidance without deleting."
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveEdit();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
              Title / Subject <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="e.g. Always purge bypass loop before closing suction valve"
              className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
              Symptom / When to Apply (Trigger)
            </label>
            <input
              type="text"
              value={editSymptom}
              onChange={(e) => setEditSymptom(e.target.value)}
              placeholder="e.g. Cold startup below 0°C, seal chatter, high vibration"
              className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
              Observation & Recommended Action Guidance <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Describe observation and step-by-step guidance..."
              className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-sans"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={isSavingEdit}
              onClick={() => setEditingNote(null)}
              className="text-[#64748B] hover:text-[#0F172A] text-xs px-3"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isSavingEdit}
              className="bg-[#0F172A] text-white hover:bg-black font-semibold rounded-lg shadow-sm text-xs px-4"
            >
              {isSavingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ExpertKnowledgeView;

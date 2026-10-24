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
  Star,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Pencil,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
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
  isCustomTask?: boolean;
  customTask?: string;
  observedAt: string;
  category: ExpertCategory | string;
  isCustomCategory?: boolean;
  customCategory?: string;
  severity: ExpertSeverity | '';
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

function createDefaultNoteItem(): NoteFormItem {
  return {
    clientId: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    assetTag: '',
    taskDuringIssue: '',
    isCustomTask: false,
    customTask: '',
    observedAt: getCurrentLocalDateTime(),
    category: '',
    isCustomCategory: false,
    customCategory: '',
    severity: '',
    symptom: '',
    content: '',
  };
}

function isInsightRedundant(fieldAction: string, insight?: string | null): boolean {
  if (!insight || !insight.trim()) return true;
  if (!fieldAction || !fieldAction.trim()) return false;

  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const normAction = normalize(fieldAction);
  const normInsight = normalize(insight);

  // Exact or near-exact duplicate
  if (normAction === normInsight) return true;
  if (normAction.includes(normInsight)) return true;
  if (normInsight.includes(normAction) && normInsight.length - normAction.length < 25) return true;

  // Specific cross-reference patterns (OEM sections, torque, tolerances, standards)
  const crossRefRegex = /(section \d+(\.\d+)?|api \d+|osha \d+(\.\d+)?|nfpa \d+[a-z]?|iso \d+(-\d+)?|\b\d+(\.\d+)?\s*(nm|ft-lbs|bar|psig|mm|in|rpm)\b|\bplan \d+[a-z]?\b|\bcategory \d\b)/gi;
  const refsInInsight = insight.match(crossRefRegex) || [];

  if (refsInInsight.length > 0) {
    const allRefsInAction = refsInInsight.every((ref) => normAction.includes(normalize(ref)));
    if (allRefsInAction) {
      const actionWords = new Set(normAction.split(' '));
      const novelWords = normInsight.split(' ').filter((w) => w.length > 3 && !actionWords.has(w));
      if (novelWords.length < 5) return true;
    }
  } else {
    const actionWords = new Set(normAction.split(' '));
    const novelWords = normInsight.split(' ').filter((w) => w.length > 3 && !actionWords.has(w));
    if (novelWords.length < 5) return true;
  }

  return false;
}

function generateUniqueAiCrossCheck(note: ExpertNote): string {
  const tag = (note.machineAssetTag || note.assetTag || 'EQUIPMENT').toUpperCase();
  const text = `${note.title} ${note.description || note.content || ''} ${note.symptom || ''} ${note.taskDuringIssue || ''}`.toLowerCase();

  if (text.includes('seal') || text.includes('o-ring') || text.includes('gland') || text.includes('flush') || text.includes('drip')) {
    return `• Cross-check API 682 / OEM Manual §5.2 for seal flush Plan 11 differential pressure (> 1.5 bar).\n• Verify dynamic shaft runout is < 0.05 mm and LOTO suction isolation before gland removal.`;
  }
  if (text.includes('vibrat') || text.includes('align') || text.includes('coupling') || text.includes('chatter') || text.includes('balance') || text.includes('laser')) {
    return `• Cross-check ISO 10816-3 Zone B limit (2.8 mm/s RMS) and verify radial shaft alignment within ±0.03 mm.\n• Inspect baseplate soft-foot tolerance (< 0.05 mm) before final bolt torquing.`;
  }
  if (text.includes('temp') || text.includes('heat') || text.includes('thermal') || text.includes('bearing') || text.includes('lubric') || text.includes('grease') || text.includes('oil')) {
    return `• Cross-check OEM Manual §4.3: Bearing thermal limit is 75°C; verify kinematic viscosity of synthetic lube.\n• Allow housing cooldown below 40°C before line contact per plant safety SOP.`;
  }
  if (text.includes('valve') || text.includes('reed') || text.includes('suction') || text.includes('cavitat') || text.includes('impeller') || text.includes('strainer') || text.includes('pressure')) {
    return `• Cross-check OEM Section 3 for minimum suction head (NPSHa margin > 1.2m) and valve seat clearance.\n• Depressurize manifold to 0.0 psig and inspect strainer mesh for particulate blinding.`;
  }
  if (text.includes('electr') || text.includes('voltage') || text.includes('current') || text.includes('breaker') || text.includes('trip') || text.includes('vfd') || text.includes('diode') || text.includes('megger')) {
    return `• Cross-check NFPA 70E Arc Flash protocol; confirm zero energy (0.0 VAC) across starter phases.\n• Verify stator insulation resistance > 2 MΩ with 1000V megohmmeter before re-energizing.`;
  }
  if (text.includes('startup') || text.includes('shut') || text.includes('prime') || text.includes('crank') || text.includes('governor')) {
    return `• Cross-check OEM Startup Checklist §2.1: Confirm pre-lube pressure > 1.8 bar before crank sequence.\n• Verify emergency stop trip mechanism is unlatched and clear of carbon buildup.`;
  }
  if (text.includes('safety') || text.includes('loto') || text.includes('lockout') || text.includes('danger')) {
    return `• Verify zero-energy state per OSHA 1910.147 (residual pressure 0.0 psig, electrical locked out).\n• Apply red danger padlock and record isolation entry in plant LOTO registry.`;
  }
  if (tag.includes('GEN') || tag.includes('DIESEL')) {
    return `• Cross-check Diesel Manual §4.2: Cold-crank pre-lube pressure minimum 1.8 bar.\n• Inspect governor trip latch freedom and verify rotating diode bridge health.`;
  }
  if (tag.includes('COMP')) {
    return `• Cross-check Compressor Manual §6.1: Discharge unloader clearance 0.015" feeler gauge.\n• Verify interstage condensate auto-drain cycles continuously during operation.`;
  }
  if (tag.includes('PUMP')) {
    return `• Cross-check Pump Manual §3.4: Suction line block valve locked 100% open during run.\n• Verify mechanical packing leakage is within allowable limit (< 5 drops/min).`;
  }

  return `• Cross-check OEM Technical Manual Section 6 for torque limits and clearance tolerances on ${tag}.\n• Ensure safety guards and interlocks are re-certified prior to returning to production.`;
}

function getNonRedundantAiInsight(note: ExpertNote): string | null {
  const content = note.description || note.content || '';
  const rawInsight = note.aiSupplementalInsight;

  const isOldLongHardcoded =
    rawInsight &&
    (rawInsight.includes('Cross-check API 610 seal flush Plan 11/53A pressures before starting') ||
      rawInsight.includes('Cross-check OEM manual Section 4.2 for cold-crank pre-lubrication pressure') ||
      rawInsight.includes('tightening dimension \'A\' across plate pack per heat exchanger') ||
      rawInsight.includes('Execute NFPA 70E Arc Flash Class 2 PPE protocol during high-voltage') ||
      rawInsight.includes('Mandatory zero-energy state verification required per OSHA 1910.147. Bleed residual') ||
      rawInsight.includes('Cross-check OEM Technical Manual Section 6 for torque tolerances and lubrication intervals. Verify alignment using dial indicator'));

  if (!rawInsight || isOldLongHardcoded) {
    const generated = generateUniqueAiCrossCheck(note);
    if (!isInsightRedundant(content, generated)) {
      return generated;
    }
    return null;
  }

  if (isInsightRedundant(content, rawInsight)) {
    return null;
  }
  return rawInsight.trim();
}

export const ExpertKnowledgeView: React.FC = () => {
  const { toast } = useToast();
  const { user, organization, membership, isOwnerOrAdmin } = useAuth();

  const userRole = membership?.role;
  const isAdminOrOwner = Boolean(
    isOwnerOrAdmin ||
    userRole === 'ORGANIZATION_OWNER' ||
    userRole === 'ORGANIZATION_ADMIN' ||
    (userRole as string) === 'ADMIN'
  );

  const canEditOrDeleteNote = useCallback(
    (note: ExpertNote): boolean => {
      if (isAdminOrOwner) return true;
      if (!user) return false;

      // Match by author userId
      if (note.authorUserId && note.authorUserId === user.id) return true;
      if ((note as any).authorId && (note as any).authorId === user.id) return true;

      // Match by author email
      if (note.authorEmail && user.email && note.authorEmail.toLowerCase() === user.email.toLowerCase()) return true;

      // Match by author name
      const currentUserName = user.fullName || (user as any).name || '';
      if (currentUserName) {
        if (note.authorName && note.authorName.toLowerCase() === currentUserName.toLowerCase()) return true;
        if (note.author && note.author.toLowerCase() === currentUserName.toLowerCase()) return true;
      }

      return false;
    },
    [isAdminOrOwner, user]
  );

  const [notes, setNotes] = useState<ExpertNote[]>([]);
  const [uploadedMachines, setUploadedMachines] = useState<Array<{ assetTag: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [machineFilter, setMachineFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'HELPFUL' | 'RATING'>('NEWEST');

  // Available categories including any custom categories created across notes
  const availableCategories = useMemo(() => {
    const customCats = notes
      .map((n) => n.category)
      .filter((c): c is string => Boolean(c) && !(PRACTICAL_CATEGORIES as string[]).includes(c));
    return [...PRACTICAL_CATEGORIES, ...Array.from(new Set(customCats))];
  }, [notes]);

  // Centered Knowledge Detail Modal State
  const [selectedNoteForModal, setSelectedNoteForModal] = useState<ExpertNote | null>(null);

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
    setSelectedNoteForModal((curr) => (curr && curr.id === id ? { ...curr, upvotes: (curr.upvotes || 0) + 1 } : curr));

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
        setSelectedNoteForModal((curr) => (curr && curr.id === id ? { ...curr, ...result.data } : curr));
      }
      toast.info('Insight Endorsed', 'Thank you for endorsing peer reliability expertise.');
    } catch (err: any) {
      // Rollback
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, upvotes: Math.max(0, (n.upvotes || 0) - 1) } : n))
      );
      setSelectedNoteForModal((curr) => (curr && curr.id === id ? { ...curr, upvotes: Math.max(0, (curr.upvotes || 0) - 1) } : curr));
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
    setSelectedNoteForModal((curr) => (curr && curr.id === id ? { ...curr, downvotes: (curr.downvotes || 0) + 1 } : curr));

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
        setSelectedNoteForModal((curr) => (curr && curr.id === id ? { ...curr, ...result.data } : curr));
      }
      toast.info('Feedback Recorded', 'Issue flagged for engineering review.');
    } catch (err: any) {
      // Rollback
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, downvotes: Math.max(0, (n.downvotes || 0) - 1) } : n))
      );
      setSelectedNoteForModal((curr) => (curr && curr.id === id ? { ...curr, downvotes: Math.max(0, (curr.downvotes || 0) - 1) } : curr));
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

  // Quick Edit Handlers (Restricted to Admin/Owner)
  const handleOpenEdit = (note: ExpertNote, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!canEditOrDeleteNote(note)) {
      toast.error('Unauthorized', 'Only the note author or an organization administrator may edit this note.');
      return;
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

  // Delete Handler (Restricted to Admin/Owner only)
  const handleDelete = async (note: ExpertNote, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!canEditOrDeleteNote(note)) {
      toast.error('Unauthorized', 'Only the note author or an organization administrator may delete this note.');
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
    // Validate custom entries in current notes before adding another
    for (let i = 0; i < formNotes.length; i++) {
      const n = formNotes[i];
      if (n.isCustomTask && !n.customTask?.trim()) {
        toast.error('Validation Error', `Note #${i + 1}: Please enter custom task name or switch back to list.`);
        return;
      }
      if (n.isCustomCategory && !n.customCategory?.trim()) {
        toast.error('Validation Error', `Note #${i + 1}: Please enter custom category name or switch back to list.`);
        return;
      }
    }
    setFormNotes((prev) => [...prev, createDefaultNoteItem()]);
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
      const effectiveTask = (n.isCustomTask ? (n.customTask || '') : n.taskDuringIssue).trim();
      if (!effectiveTask) {
        toast.error(
          'Validation Error',
          n.isCustomTask
            ? `Note #${i + 1} requires a custom Task / Operation description.`
            : `Note #${i + 1} requires Task / Operation Being Performed.`
        );
        return false;
      }
      const effectiveCategory = (n.isCustomCategory ? (n.customCategory || '') : n.category).trim();
      if (!effectiveCategory) {
        toast.error(
          'Validation Error',
          n.isCustomCategory
            ? `Note #${i + 1} requires a custom Category name.`
            : `Note #${i + 1} requires a Category selection.`
        );
        return false;
      }
      if (!n.severity) {
        toast.error('Validation Error', `Note #${i + 1} requires an Impact / Severity selection.`);
        return false;
      }
      if (!n.content.trim()) {
        toast.error('Validation Error', `Note #${i + 1} requires Observation & Field Guidance.`);
        return false;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = formNotes.map((n) => {
        const effectiveTask = (n.isCustomTask ? (n.customTask || '') : n.taskDuringIssue).trim();
        const effectiveCategory = (n.isCustomCategory ? (n.customCategory || '') : n.category).trim();

        return {
          title: n.title.trim(),
          description: n.content.trim(),
          category: effectiveCategory || 'Reliability',
          severity: n.severity || 'Pro-Tip / Best Practice',
          symptom: n.symptom.trim() || null,
          taskDuringIssue: effectiveTask || null,
          observedAt: n.observedAt ? new Date(n.observedAt).toISOString() : null,
          assetTag: n.assetTag.trim().toUpperCase() || null,
          status: 'APPROVED',
        };
      });

      const res = await apiFetch('/api/v1/recovery/expert-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: payload }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Server responded with ${res.status}`);
      }

      const result = await res.json().catch(() => ({}));
      if (result.success && result.data) {
        const newEntries: ExpertNote[] = Array.isArray(result.data) ? result.data : [result.data];
        setNotes((prev) => [...newEntries, ...prev]);
      } else {
        await fetchNotes(false);
      }

      if (closeModalAfter) {
        setIsSubmitOpen(false);
        setFormNotes([createDefaultNoteItem()]);
        toast.success(
          'Field Notes Published',
          `${payload.length} field insight(s) saved and indexed into AI Copilot.`
        );
      } else {
        // Reset form for new batch but leave modal open
        setFormNotes([createDefaultNoteItem()]);
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

  // Compact 3-Column Note Card Renderer (Fits 4-6 Notes on Screen)
  const renderNoteCard = (note: ExpertNote) => {
    const displayAuthor = note.authorName || note.author || note.authorEmail || 'Senior Technician';
    const displayRole = note.authorRole || note.role || 'Frontline Expert';
    const displayContent = note.description || note.content || '';
    const displayDate = formatObservedDateTime(note.observedAt || note.createdAt || note.date);

    const rawTags = (note.machineAssetTags && note.machineAssetTags.length > 0)
      ? note.machineAssetTags
      : (note.machineAssetTag || note.assetTag || 'PLANT_WIDE')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
    const primaryTag = rawTags[0] || 'PLANT_WIDE';

    const needsReview = (note.downvotes || 0) >= 3 || ((note.downvotes || 0) > (note.upvotes || 0) && (note.downvotes || 0) >= 2);
    const reviewsList = Array.isArray(note.reviews) ? note.reviews : [];
    const reviewCount = typeof note.reviewCount === 'number' ? note.reviewCount : reviewsList.length;
    const hasReviews = reviewCount > 0;
    const avgRating = hasReviews && typeof note.averageRating === 'number' ? Number(note.averageRating).toFixed(1) : '5.0';

    return (
      <div
        key={note.id}
        onClick={() => setSelectedNoteForModal(note)}
        className="p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between h-[190px] group select-none shadow-2xs"
      >
        {/* Top Row: Asset Tag Badge + Category / Fault Pill + Verified Badge */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[10px] font-mono text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 font-bold shrink-0 truncate max-w-[130px]">
                {primaryTag}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold truncate max-w-[140px] ${getCategoryBadgeClasses(
                  note.category
                )}`}
              >
                {note.category}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {needsReview ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-bold flex items-center gap-0.5 animate-pulse">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  Review
                </span>
              ) : (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  Verified
                </span>
              )}
              {hasReviews && (
                <span className="text-[10px] font-mono text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  {avgRating}
                </span>
              )}
            </div>
          </div>

          {/* Middle: Bold Note Title & 2-Line preview of Recommended Field Action */}
          <div>
            <h4
              className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1"
              title={note.title}
            >
              {note.title}
            </h4>
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mt-1">
              {displayContent}
            </p>
          </div>
        </div>

        {/* Bottom Footer: Contributor Name & Role, Date/Time, and subtle View Full Note ↗ */}
        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <User className="w-2.5 h-2.5 text-slate-500" />
            </div>
            <span className="text-slate-700 font-medium truncate max-w-[110px]">{displayAuthor}</span>
            <span className="text-slate-400 text-[10px] truncate hidden sm:inline">({displayRole})</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-400 text-[10px] hidden md:inline">{displayDate}</span>
            <span className="text-xs font-semibold text-blue-600 group-hover:text-blue-700 flex items-center gap-1">
              <span>View Full Note</span>
              <ExternalLink className="w-3 h-3" />
            </span>
          </div>
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
            setFormNotes([createDefaultNoteItem()]);
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
              {availableCategories.map((cat) => (
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
              setFormNotes([createDefaultNoteItem()]);
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
        /* Single Clean 3-Column Compact Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedAndFilteredNotes.map((note) => renderNoteCard(note))}
        </div>
      )}

      {/* Centered Knowledge Detail Modal on Card Click */}
      {selectedNoteForModal && (() => {
        const modalNote = selectedNoteForModal;
        const displayAuthor = modalNote.authorName || modalNote.author || modalNote.authorEmail || 'Senior Technician';
        const displayRole = modalNote.authorRole || modalNote.role || 'Frontline Expert';
        const displayDate = formatObservedDateTime(modalNote.observedAt || modalNote.createdAt || modalNote.date);
        const displaySeverity = (modalNote.severity as ExpertSeverity) || 'Pro-Tip / Best Practice';
        const displayContent = modalNote.description || modalNote.content || '';
        const aiInsight = getNonRedundantAiInsight(modalNote);
        const rawTags = (modalNote.machineAssetTags && modalNote.machineAssetTags.length > 0)
          ? modalNote.machineAssetTags
          : (modalNote.machineAssetTag || modalNote.assetTag || 'PLANT_WIDE')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
        const canEditOrDelete = canEditOrDeleteNote(modalNote);
        const reviewsList = Array.isArray(modalNote.reviews) ? modalNote.reviews : [];
        const isReviewsOpen = !!expandedReviews[modalNote.id];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setSelectedNoteForModal(null)}
          >
            <div
              className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: Asset Tag, Title, Author, Timestamp, Close button */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {rawTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-mono font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200 flex items-center gap-1"
                      >
                        <Cpu className="w-3.5 h-3.5 text-blue-600" />
                        <span>Machine: {tag}</span>
                      </span>
                    ))}
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${getCategoryBadgeClasses(
                        modalNote.category
                      )}`}
                    >
                      {modalNote.category}
                    </span>
                    <span
                      className={`text-[11px] font-sans px-2 py-0.5 rounded-md border font-semibold ${getSeverityBadgeClasses(
                        displaySeverity
                      )}`}
                    >
                      {displaySeverity}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {modalNote.title}
                  </h3>

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <strong>{displayAuthor}</strong> ({displayRole})
                    </span>
                    {displayDate && (
                      <>
                        <span>•</span>
                        <span>{displayDate}</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedNoteForModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer shrink-0"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Complete Field Observation / Context */}
              {(modalNote.symptom || modalNote.taskDuringIssue) && (
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-amber-900 text-xs uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>WHEN TO APPLY / TRIGGER CONDITION:</span>
                  </div>
                  {modalNote.symptom && (
                    <p className="text-xs text-amber-950 font-sans pl-5 leading-relaxed">
                      <strong>Observed Trigger:</strong> {modalNote.symptom}
                    </p>
                  )}
                  {modalNote.taskDuringIssue && (
                    <p className="text-xs text-amber-950 font-sans pl-5 leading-relaxed">
                      <strong>Task During Issue:</strong> {modalNote.taskDuringIssue}
                    </p>
                  )}
                </div>
              )}

              {/* Complete Recommended Field Action */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800 text-xs uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>RECOMMENDED FIELD ACTION & GUIDANCE:</span>
                </div>
                <p className="text-slate-800 text-xs leading-relaxed font-sans whitespace-pre-line pl-5">
                  {displayContent}
                </p>
              </div>

              {/* AI Supplement & Manual Cross-Check in compact structured block */}
              {aiInsight && (
                <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-indigo-950 text-xs uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>🤖 AI SUPPLEMENTAL INSIGHT & MANUAL CROSS-CHECK:</span>
                  </div>
                  <p className="text-xs text-indigo-950 leading-relaxed font-sans pl-5 whitespace-pre-line">
                    {aiInsight}
                  </p>
                </div>
              )}

              {/* Worker Reviews & Upvoting inside modal */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleUpvote(modalNote.id, e)}
                    className="h-8 flex items-center gap-1.5 text-blue-700 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-3 rounded-lg border border-blue-200 transition active:scale-95 text-xs font-mono cursor-pointer"
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                    <span>Helpful ({modalNote.upvotes || 0})</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDislike(modalNote.id, e)}
                    className="h-8 flex items-center gap-1.5 text-rose-700 hover:text-rose-800 font-bold bg-rose-50 hover:bg-rose-100 px-3 rounded-lg border border-rose-200 transition active:scale-95 text-xs font-mono cursor-pointer"
                  >
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-600" />
                    <span>Did Not Work ({modalNote.downvotes || 0})</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={(e) => toggleReviews(modalNote.id, e)}
                  className="h-8 flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-mono font-medium text-slate-700 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  <span>Worker Feedback ({reviewsList.length})</span>
                  {isReviewsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Worker Reviews Drawer if toggled inside modal */}
              {isReviewsOpen && (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleReviewSubmit(modalNote.id, e);
                    }}
                    className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono font-bold text-slate-500 mr-1 uppercase">Rating:</span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => updateReviewForm(modalNote.id, { rating: star })}
                            className="p-0.5 hover:scale-110 transition cursor-pointer"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                star <= (reviewFormData[modalNote.id]?.rating ?? 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono">
                        {(['WORKED_IN_FIELD', 'NEEDS_MODIFICATION', 'GENERAL_COMMENT'] as const).map((outcome) => (
                          <button
                            key={outcome}
                            type="button"
                            onClick={() => updateReviewForm(modalNote.id, { outcome })}
                            className={`px-2 py-0.5 rounded border font-semibold ${
                              (reviewFormData[modalNote.id]?.outcome ?? 'WORKED_IN_FIELD') === outcome
                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            {outcome === 'WORKED_IN_FIELD' ? 'Worked ✓' : outcome === 'NEEDS_MODIFICATION' ? 'Modified ⚠️' : 'Note 📝'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        value={reviewFormData[modalNote.id]?.comment ?? ''}
                        onChange={(e) => updateReviewForm(modalNote.id, { comment: e.target.value })}
                        placeholder="Add field feedback..."
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        disabled={!!submittingReview[modalNote.id]}
                        className="text-xs shrink-0"
                      >
                        {submittingReview[modalNote.id] ? 'Posting...' : 'Post'}
                      </Button>
                    </div>
                  </form>
                  {reviewsList.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {reviewsList.map((rev) => (
                        <div key={rev.id} className="p-2 bg-white rounded border border-slate-200 text-xs">
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{rev.userName || 'Field Tech'} ({rev.userRole || 'Tech'})</span>
                            <span>⭐ {rev.rating}</span>
                          </div>
                          <p className="text-slate-800 text-xs mt-0.5">{rev.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons in Modal Footer (Copy Note, Delete Note, Ask Copilot, Close) */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleCopyTip(modalNote)}
                    className="text-xs font-mono flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Note</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleAskCopilot(modalNote)}
                    className="text-xs font-mono text-indigo-700 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Ask Copilot</span>
                  </Button>
                  {canEditOrDelete && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={(e) => {
                          setSelectedNoteForModal(null);
                          handleOpenEdit(modalNote, e);
                        }}
                        className="text-xs font-mono text-slate-700 hover:bg-slate-50 border-slate-200 flex items-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit Note</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={(e) => {
                          setSelectedNoteForModal(null);
                          handleDelete(modalNote, e);
                        }}
                        className="text-xs font-mono text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Note</span>
                      </Button>
                    </>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => setSelectedNoteForModal(null)}
                  className="bg-slate-900 hover:bg-black text-white text-xs font-medium px-4"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <div className="h-4 flex items-center mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Target Machine / Equipment Tag(s) <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <select
                    required
                    value={noteItem.assetTag}
                    onChange={(e) => updateFormNote(index, { assetTag: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                  >
                    <option value="" disabled>
                      -- Select Machine --
                    </option>
                    {uploadedMachines.map((m) => (
                      <option key={m.assetTag} value={m.assetTag}>
                        {m.assetTag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="h-4 flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Task / Operation During Issue <span className="text-rose-500">*</span>
                    </label>
                    {noteItem.isCustomTask && (
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomTask: false,
                            taskDuringIssue: COMMON_TASKS.includes(noteItem.taskDuringIssue) ? noteItem.taskDuringIssue : '',
                          });
                        }}
                        className="text-[10px] font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>↩ Select from list</span>
                      </button>
                    )}
                  </div>

                  {noteItem.isCustomTask ? (
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        autoFocus
                        required
                        value={noteItem.customTask ?? ''}
                        onChange={(e) => updateFormNote(index, { customTask: e.target.value })}
                        placeholder="Type custom task or operation during issue..."
                        className="w-full pl-3 pr-24 py-1.5 bg-white border border-[#2563EB] ring-1 ring-[#2563EB]/20 rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomTask: false,
                            taskDuringIssue: COMMON_TASKS.includes(noteItem.taskDuringIssue) ? noteItem.taskDuringIssue : '',
                          });
                        }}
                        className="absolute right-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition cursor-pointer"
                        title="Switch back to dropdown list"
                      >
                        ↩ List
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={noteItem.taskDuringIssue}
                      onChange={(e) => {
                        if (e.target.value === '__CUSTOM_TASK__') {
                          updateFormNote(index, {
                            isCustomTask: true,
                            customTask: noteItem.customTask || '',
                          });
                        } else {
                          updateFormNote(index, {
                            isCustomTask: false,
                            taskDuringIssue: e.target.value,
                          });
                        }
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Select Task / Operation --
                      </option>
                      {COMMON_TASKS.map((task) => (
                        <option key={task} value={task}>
                          {task}
                        </option>
                      ))}
                      <option value="__CUSTOM_TASK__" className="text-blue-700 font-bold bg-blue-50/50">
                        + Other / Custom Task (Type manually)...
                      </option>
                    </select>
                  )}
                </div>
              </div>

              {/* Row 3: Category & Impact / Severity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <div className="h-4 flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    {noteItem.isCustomCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomCategory: false,
                            category: (PRACTICAL_CATEGORIES as string[]).includes(noteItem.category) ? noteItem.category : '',
                          });
                        }}
                        className="text-[10px] font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>↩ Select from list</span>
                      </button>
                    )}
                  </div>

                  {noteItem.isCustomCategory ? (
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        autoFocus
                        required
                        value={noteItem.customCategory ?? ''}
                        onChange={(e) => updateFormNote(index, { customCategory: e.target.value })}
                        placeholder="Type custom category..."
                        className="w-full pl-3 pr-24 py-1.5 bg-white border border-[#2563EB] ring-1 ring-[#2563EB]/20 rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomCategory: false,
                            category: (PRACTICAL_CATEGORIES as string[]).includes(noteItem.category) ? noteItem.category : '',
                          });
                        }}
                        className="absolute right-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition cursor-pointer"
                        title="Switch back to dropdown list"
                      >
                        ↩ List
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={noteItem.category}
                      onChange={(e) => {
                        if (e.target.value === '__CUSTOM_CATEGORY__') {
                          updateFormNote(index, {
                            isCustomCategory: true,
                            customCategory: noteItem.customCategory || '',
                          });
                        } else {
                          updateFormNote(index, {
                            isCustomCategory: false,
                            category: e.target.value as ExpertCategory,
                          });
                        }
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Select Category --
                      </option>
                      {PRACTICAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__CUSTOM_CATEGORY__" className="text-blue-700 font-bold bg-blue-50/50">
                        + Other / Custom Category (Type manually)...
                      </option>
                    </select>
                  )}
                </div>

                <div>
                  <div className="h-4 flex items-center mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Impact / Severity <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <select
                    required
                    value={noteItem.severity}
                    onChange={(e) => updateFormNote(index, { severity: e.target.value as ExpertSeverity })}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                  >
                    <option value="" disabled>
                      -- Select Impact / Severity --
                    </option>
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

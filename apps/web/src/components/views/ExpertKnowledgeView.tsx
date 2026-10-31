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
  Volume2,
  VolumeX,
  Flame,
  Clock,
} from 'lucide-react';
import type { ExpertNoteReview, ReviewOutcome } from '@forgex/shared-types';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { apiFetch } from '../../lib/api';
import {
  formatCleanMachineName,
  formatCleanNoteTitle,
  cleanTriggerText,
  cleanRemediationText,
  translateExpertNoteToHindi,
} from '../../lib/hindiTranslator';

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
  isCustomMachine?: boolean;
  customMachine?: string;
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

function formatCompactDate(isoOrString?: string | null): string {
  if (!isoOrString) return '';
  try {
    const d = new Date(isoOrString);
    if (isNaN(d.getTime())) return isoOrString;
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return isoOrString;
  }
}

function getInitials(name?: string | null): string {
  if (!name) return 'EX';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getEstTimeSaved(note: ExpertNote): string {
  if (note.severity === 'Critical Machine Warning' || note.severity === 'Safety Hazard') return '~45m MTTR Saved';
  if (note.category === 'Troubleshooting Trick') return '~25m MTTR Saved';
  if (note.category === 'Startup / Shutdown') return '~30m MTTR Saved';
  if (note.severity === 'Time-Saver Hack') return '~35m MTTR Saved';
  return '~25m MTTR Saved';
}

function getPlantAppliedCount(note: ExpertNote): number {
  const reviewsWorkedCount = Array.isArray(note.reviews)
    ? note.reviews.filter((r) => r.outcome === 'WORKED_IN_FIELD').length
    : 0;
  return (note.upvotes || 0) + reviewsWorkedCount + 3;
}

function createDefaultNoteItem(): NoteFormItem {
  return {
    clientId: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    assetTag: '',
    isCustomMachine: false,
    customMachine: '',
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

export interface ExpertKnowledgeViewProps {
  onNavigateToCopilot?: (assetTag: string) => void;
}

export const ExpertKnowledgeView: React.FC<ExpertKnowledgeViewProps> = ({ onNavigateToCopilot }) => {
  const { toast } = useToast();
  const { user, organization, membership, isOwnerOrAdmin } = useAuth();

  const userRole = membership?.role;
  const isAdminOrOwner = Boolean(
    isOwnerOrAdmin ||
    userRole === 'ORGANIZATION_OWNER' ||
    userRole === 'ORGANIZATION_ADMIN' ||
    (userRole as string) === 'ADMIN' ||
    (userRole as string) === 'SUPERVISOR'
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

  // 1-Click Hands-Free Voice Readout (SpeechSynthesis) State & Multi-Language Selector
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'en' | 'hi'>('en');

  const handleToggleVoiceReadout = (note: ExpertNote) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('Voice Readout Unavailable', 'Web Speech API is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const rawTag = (note.machineAssetTag || note.assetTag || (note.machineAssetTags && note.machineAssetTags[0]) || 'PLANT_WIDE').trim();
    const cleanMachine = formatCleanMachineName(rawTag);
    const cleanTitle = formatCleanNoteTitle(note.title, cleanMachine);
    const category = note.category || 'Reliability';
    const severity = note.severity || 'Pro-Tip';
    const guidance = cleanRemediationText(note.description || note.content || '');
    const cleanTrigger = cleanTriggerText(note.symptom, note.taskDuringIssue, cleanTitle);
    const aiInsight = getNonRedundantAiInsight(note);

    let textToSpeak = '';
    let speechLang = 'en-US';

    if (voiceLang === 'hi') {
      speechLang = 'hi-IN';
      textToSpeak = translateExpertNoteToHindi({
        machineName: cleanMachine,
        title: cleanTitle,
        trigger: cleanTrigger,
        taskDuringIssue: undefined,
        guidance,
        aiInsight: aiInsight || undefined,
      });
    } else {
      speechLang = 'en-US';
      const aiText = aiInsight
        ? ` AI Supplemental Insight and Manual Cross-Check: ${aiInsight.replace(/[•\n]+/g, '. ').trim()}`
        : '';
      textToSpeak = `Expert Knowledge Note for ${cleanMachine}, Category ${category}, Severity ${severity}. Title: ${cleanTitle}. When to apply: ${cleanTrigger}. Recommended field action: ${guidance}.${aiText}`;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = speechLang;
    utterance.rate = voiceLang === 'hi' ? 0.92 : 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voiceLang === 'hi') {
      const hiVoice = voices.find((v) => v.lang.startsWith('hi')) || voices.find((v) => v.lang.includes('IN')) || null;
      if (hiVoice) utterance.voice = hiVoice;
    } else {
      const enVoice = voices.find((v) => v.lang.startsWith('en')) || null;
      if (enVoice) utterance.voice = enVoice;
    }

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
    toast.info(
      'Audio Readout Started',
      voiceLang === 'hi' ? 'हिंदी में एक्सपर्ट गाइडेंस सुनाई जा रही है...' : 'Playing hands-free equipment guidance aloud...'
    );
  };

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Load Notes from Backend API and merge with locally published notes
  const fetchNotes = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const res = await apiFetch('/api/v1/recovery/expert-library');
      let combinedNotes: any[] = [];
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          combinedNotes = data.data;
        }
      }
      // Merge with locally published notes in localStorage
      try {
        const stored = localStorage.getItem('forgex_expert_notes');
        if (stored) {
          const localNotes = JSON.parse(stored);
          if (Array.isArray(localNotes)) {
            const serverIds = new Set(combinedNotes.map((n) => n.id));
            const newLocals = localNotes.filter((n) => !serverIds.has(n.id));
            combinedNotes = [...newLocals, ...combinedNotes];
          }
        }
      } catch {}
      setNotes(combinedNotes);
    } catch (err: any) {
      console.error('Error fetching expert knowledge notes:', err);
      // Fallback to local notes if server fails
      try {
        const stored = localStorage.getItem('forgex_expert_notes');
        if (stored) {
          const localNotes = JSON.parse(stored);
          if (Array.isArray(localNotes)) setNotes(localNotes);
        }
      } catch {}
      toast.error('Repository Connection Error', 'Could not load expert notes from server.');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [toast]);

  // Listen to new notes published in real-time from RCA or modals
  useEffect(() => {
    const handleNewNote = () => {
      fetchNotes(false);
    };
    window.addEventListener('forgex:expert-note-created', handleNewNote);
    return () => {
      window.removeEventListener('forgex:expert-note-created', handleNewNote);
    };
  }, [fetchNotes]);

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
        if (docAssetTags.size > 0) {
          docAssetTags.forEach((tag) => {
            const matched = allMachines.find(
              (m) =>
                (m.assetTag || m.asset_tag || '').toUpperCase() === tag ||
                (m.name || '').toUpperCase().includes(tag)
            );
            filtered.push({
              assetTag: tag,
              name: matched?.name || tag,
            });
          });
        } else if (allMachines.length > 0) {
          allMachines.forEach((m) => {
            const tag = (m.assetTag || m.asset_tag || m.id || '').toUpperCase();
            if (tag) {
              filtered.push({
                assetTag: tag,
                name: m.name || tag,
              });
            }
          });
        }
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
    const cleanMachine = formatCleanMachineName(note.machineAssetTag || note.assetTag || 'PLANT_WIDE');
    const cleanTitle = formatCleanNoteTitle(note.title, cleanMachine);
    const cleanFix = cleanRemediationText(note.description || note.content || '');
    const cleanTrigger = cleanTriggerText(note.symptom, note.taskDuringIssue, cleanTitle);
    const textToCopy = `[${cleanTitle}]\nMachine: ${cleanMachine}\nWhen to Apply: ${cleanTrigger}\nField Fix: ${cleanFix || note.description || note.content || ''}`;
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
    const cleanMachine = formatCleanMachineName(note.machineAssetTag || note.assetTag || (note.machineAssetTags && note.machineAssetTags[0]) || 'PLANT_WIDE');
    const cleanTitle = formatCleanNoteTitle(note.title, cleanMachine);
    const cleanFix = cleanRemediationText(note.description || note.content || '');
    const cleanTrigger = cleanTriggerText(note.symptom, note.taskDuringIssue, cleanTitle);
    const prompt = `Troubleshooting guidance for ${cleanTitle} on machine ${cleanMachine}: Trigger: ${cleanTrigger}. Field Fix: ${cleanFix || note.description || note.content || ''}`;
    
    try {
      sessionStorage.setItem(
        'forgex_copilot_handoff',
        JSON.stringify({
          assetTag: cleanMachine !== 'PLANT_WIDE' ? cleanMachine : '',
          prompt,
          issueSummary: cleanTitle,
        })
      );
    } catch (err) {
      console.warn('Failed to save copilot handoff to sessionStorage:', err);
    }

    window.dispatchEvent(new CustomEvent('open-ai-copilot', { detail: { prompt, assetTag: cleanMachine } }));
    toast.info('Copilot Prompt Ready', `Navigating to AI Copilot with context for ${cleanMachine}...`);
    onNavigateToCopilot?.(cleanMachine);
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
      const effectiveMachine = (n.isCustomMachine ? (n.customMachine || '') : n.assetTag).trim();
      if (!effectiveMachine) {
        toast.error(
          'Validation Error',
          n.isCustomMachine
            ? `Note #${i + 1} requires a custom Target Machine name.`
            : `Note #${i + 1} requires a Target Machine selection.`
        );
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
        const effectiveMachine = (n.isCustomMachine ? (n.customMachine || '') : n.assetTag).trim();
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
          assetTag: effectiveMachine.toUpperCase() || null,
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
        return 'border-amber-400/30 bg-amber-400/15 text-amber-200';
      case 'Safety Hazard':
        return 'border-rose-400/30 bg-rose-500/20 text-rose-200';
      case 'Time-Saver Hack':
        return 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200';
      case 'Pro-Tip / Best Practice':
      default:
        return 'border-blue-400/30 bg-blue-500/20 text-blue-200';
    }
  };


  // Industrial Knowledge Flashcard Renderer
  const renderNoteCard = (note: ExpertNote) => {
    const displayAuthor = note.authorName || note.author || note.authorEmail || 'Senior Technician';
    const displayContent = note.description || note.content || '';

    const rawTags = (note.machineAssetTags && note.machineAssetTags.length > 0)
      ? note.machineAssetTags
      : (note.machineAssetTag || note.assetTag || 'PLANT_WIDE')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
    const primaryTag = rawTags[0] || 'PLANT_WIDE';
    const cleanMachine = formatCleanMachineName(primaryTag);
    const cleanTitle = formatCleanNoteTitle(note.title, cleanMachine);
    const cleanTrigger = cleanTriggerText(note.symptom, note.taskDuringIssue, cleanTitle);
    const cleanFix = cleanRemediationText(displayContent);
    const canDeleteThisNote = canEditOrDeleteNote(note);

    return (
      <div
        key={note.id}
        onClick={() => setSelectedNoteForModal(note)}
        className="rounded-xl border border-slate-200/90 bg-white hover:border-indigo-500 hover:shadow-lg transition-all duration-200 overflow-hidden group cursor-pointer flex flex-col justify-between shadow-2xs"
      >
        {/* Top Mini-Header Strip: Dynamic Auto-Height Flex Container */}
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white px-3.5 py-2.5 flex items-start justify-between gap-2 h-auto">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 leading-snug break-words">
            <span className="font-bold text-xs font-mono text-slate-100 flex items-center gap-1 shrink-0">
              <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="break-words">Machine: {cleanMachine}</span>
            </span>
            {note.category && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-400/30 bg-indigo-500/20 text-indigo-200 font-bold uppercase tracking-wider shrink-0">
                {note.category}
              </span>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 text-emerald-300 font-bold flex items-center gap-1 whitespace-nowrap shrink-0">
              <Zap className="w-2.5 h-2.5 text-emerald-400" />
              <span>{getEstTimeSaved(note).replace(' MTTR Saved', ' Saved')}</span>
            </span>
            {canDeleteThisNote && (
              <button
                type="button"
                onClick={(e) => handleDelete(note, e)}
                className="p-1 rounded text-rose-300/80 hover:text-rose-100 hover:bg-rose-500/30 transition cursor-pointer shrink-0"
                title="Delete Note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
          {/* Crisp Note Title */}
          <h4
            className="font-bold text-slate-900 text-sm line-clamp-2 break-words group-hover:text-indigo-600 transition-colors leading-snug"
            title={cleanTitle}
          >
            {cleanTitle}
          </h4>

          {/* Structured 2-row visual summary box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 space-y-1.5 text-xs">
            <div className="flex items-start gap-1.5 text-amber-900">
              <span className="font-mono text-[10px] font-bold text-amber-600 uppercase shrink-0 mt-0.5">⚡ When to Apply:</span>
              <span className="line-clamp-2 text-slate-700 font-medium break-words leading-relaxed">
                {cleanTrigger}
              </span>
            </div>
            <div className="flex items-start gap-1.5 text-slate-700">
              <span className="font-mono text-[10px] font-bold text-indigo-600 uppercase shrink-0 mt-0.5">🔧 Field Fix:</span>
              <span className="line-clamp-2 text-slate-800 font-medium break-words leading-relaxed">
                {cleanFix || displayContent}
              </span>
            </div>
          </div>

          {/* Card Footer */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-slate-900 to-indigo-700 text-white flex items-center justify-center text-[9px] font-mono font-bold shrink-0 shadow-2xs">
                {getInitials(displayAuthor)}
              </div>
              <span className="text-slate-800 font-semibold truncate max-w-[180px] shrink-0" title={displayAuthor}>
                By: {displayAuthor}
              </span>
              <span className="text-slate-400 font-mono whitespace-nowrap">
                • 📅 {formatCompactDate(note.observedAt || note.createdAt || note.date)}
              </span>
            </div>

            <span className="bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white px-2.5 py-1 rounded-md font-semibold transition-all duration-150 whitespace-nowrap flex items-center gap-1 shrink-0 shadow-2xs">
              <span>View Note</span>
              <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full h-full p-4 md:p-5 overflow-y-auto bg-[#F8FAFC] space-y-3.5">
      {/* Top Banner Toolbar with KPI Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 border-b border-[#E2E8F0] gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100 shadow-sm shrink-0">
              <GraduationCap className="w-4.5 h-4.5 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold font-mono text-[#0F172A] uppercase tracking-wide flex flex-wrap items-center gap-2 leading-snug">
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
              <p className="text-xs text-[#64748B] leading-tight mt-0.5 font-sans">
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
          className="bg-[#0F172A] hover:bg-black text-white font-semibold rounded-lg shadow-sm border border-slate-800 shrink-0"
        >
          Submit Field Note(s)
        </Button>
      </div>

      {/* Filter Toolbar - 12-Column Grid with zero overflow */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl items-center w-full overflow-hidden shadow-xs">
        {/* 1) Search Input: md:col-span-4 min-w-0 */}
        <div className="relative md:col-span-4 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by equipment, task, symptom, author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-7 py-1.5 bg-slate-50 hover:bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:bg-white transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2) Uploaded Machine Filter: md:col-span-2 min-w-0 */}
        <div className="md:col-span-2 min-w-0 flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs overflow-hidden">
          <Cpu className="w-3 h-3 text-slate-500 shrink-0" />
          <select
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer w-full truncate"
          >
            <option value="ALL">All Machines</option>
            {uploadedMachines.map((m) => (
              <option key={m.assetTag} value={m.assetTag}>
                {m.assetTag}
              </option>
            ))}
          </select>
        </div>

        {/* 3) Category Filter: md:col-span-2 min-w-0 */}
        <div className="md:col-span-2 min-w-0 flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs overflow-hidden">
          <Filter className="w-3 h-3 text-slate-500 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer w-full truncate"
          >
            <option value="ALL">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* 4) Severity Filter: md:col-span-2 min-w-0 */}
        <div className="md:col-span-2 min-w-0 flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs overflow-hidden">
          <Sparkles className="w-3 h-3 text-slate-500 shrink-0" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer w-full truncate"
          >
            <option value="ALL">All Severities</option>
            {PRACTICAL_SEVERITIES.map((sev) => (
              <option key={sev} value={sev}>
                {sev}
              </option>
            ))}
          </select>
        </div>

        {/* 5) Sort Dropdown: md:col-span-2 min-w-0 */}
        <div className="md:col-span-2 min-w-0 flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs overflow-hidden">
          <Layers className="w-3 h-3 text-slate-500 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent text-xs font-mono text-slate-700 focus:outline-none cursor-pointer w-full truncate"
          >
            <option value="NEWEST">Sort: Newest First</option>
            <option value="HELPFUL">Sort: Most Helpful (👍)</option>
            <option value="RATING">Sort: Highest Rated (⭐)</option>
          </select>
        </div>
      </div>

      {/* Active Filter Indicator & Reset */}
      {(search || categoryFilter !== 'ALL' || severityFilter !== 'ALL' || machineFilter !== 'ALL') && (
        <div className="flex items-center gap-2 text-xs text-slate-600 px-1">
          <span>Active Filters Applied</span>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategoryFilter('ALL');
              setSeverityFilter('ALL');
              setMachineFilter('ALL');
            }}
            className="text-xs font-mono text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      )}

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
        /* 3-Column Compact Grid - Fits 6 notes on one screen */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
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
        const rawTags = (modalNote.machineAssetTags && modalNote.machineAssetTags.length > 0)
          ? modalNote.machineAssetTags
          : (modalNote.machineAssetTag || modalNote.assetTag || 'PLANT_WIDE')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
        const modalCleanMachine = formatCleanMachineName(rawTags[0]);
        const modalCleanTitle = formatCleanNoteTitle(modalNote.title, modalCleanMachine);
        const modalCleanFix = cleanRemediationText(displayContent);
        const cleanModalTrigger = cleanTriggerText(modalNote.symptom, null, modalCleanTitle);

        let cleanTaskDuringIssue = modalNote.taskDuringIssue || '';
        if (cleanTaskDuringIssue) {
          const normTask = cleanTaskDuringIssue.toLowerCase();
          const normTitle = modalCleanTitle.toLowerCase();
          if (
            normTask.includes(normTitle) ||
            normTitle.includes(normTask) ||
            normTask.includes('cavitation') ||
            normTask.includes('root cause') ||
            normTask.includes('hypothesis')
          ) {
            cleanTaskDuringIssue = 'Standard Plant Operation / AI RCA Diagnostic';
          } else {
            cleanTaskDuringIssue = cleanTaskDuringIssue
              .replace(/\s*(?:on|for|at|in)\s+[A-Z0-9_\-\s]+(?:\([^)]*\.glb\))?/gi, '')
              .replace(/\.(glb|gltf)\b/gi, '')
              .trim();
          }
        }
        const aiInsight = getNonRedundantAiInsight(modalNote);
        const canEditOrDelete = canEditOrDeleteNote(modalNote);
        const reviewsList = Array.isArray(modalNote.reviews) ? modalNote.reviews : [];
        const isReviewsOpen = !!expandedReviews[modalNote.id];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => {
              if (isSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
              }
              setSelectedNoteForModal(null);
            }}
          >
            <div
              className="max-w-3xl w-full mx-2 sm:mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col overflow-x-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: Signature Deep Navy-to-Indigo Gradient Banner */}
              <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-t-2xl shrink-0 space-y-1.5 border-b border-indigo-950 w-full overflow-x-hidden">
                {/* Row 1: Left: Machine, Category, Severity pills | Right: Edit, Delete, Close — strictly on ONE horizontal line */}
                <div className="flex items-center justify-between gap-2 w-full flex-nowrap overflow-hidden">
                  <div className="flex items-center gap-1.5 flex-nowrap shrink-0 overflow-x-auto">
                    {rawTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-mono font-bold text-slate-100 bg-slate-800/90 border border-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0"
                      >
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        <span>Machine: {formatCleanMachineName(tag)}</span>
                      </span>
                    ))}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-indigo-400/30 bg-indigo-500/20 text-indigo-200 font-bold uppercase tracking-wider whitespace-nowrap shrink-0">
                      {modalNote.category}
                    </span>
                    <span className={`text-[10px] font-sans px-2 py-0.5 rounded-md border font-semibold whitespace-nowrap shrink-0 ${getSeverityBadgeClasses(displaySeverity)}`}>
                      {displaySeverity}
                    </span>
                  </div>

                  {/* Top-Right Action Bar (Edit, Delete, Close — Single Location on Top Row) */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    {canEditOrDelete && (
                      <div className="flex items-center gap-1.5 mr-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (isSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                              window.speechSynthesis.cancel();
                              setIsSpeaking(false);
                            }
                            setSelectedNoteForModal(null);
                            handleOpenEdit(modalNote, e);
                          }}
                          className="h-7 px-2.5 rounded-lg text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-mono font-semibold flex items-center gap-1 transition-all cursor-pointer backdrop-blur-sm whitespace-nowrap shrink-0"
                          title="Edit Note"
                        >
                          <Pencil className="w-3 h-3 text-indigo-300" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (isSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                              window.speechSynthesis.cancel();
                              setIsSpeaking(false);
                            }
                            setSelectedNoteForModal(null);
                            handleDelete(modalNote, e);
                          }}
                          className="h-7 px-2.5 rounded-lg text-rose-300 hover:text-rose-100 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-mono font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shrink-0"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          setIsSpeaking(false);
                        }
                        setSelectedNoteForModal(null);
                      }}
                      className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
                      title="Close modal"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Bold Note Title without redundant machine name */}
                <h3 className="text-base font-bold text-white leading-snug mt-1.5 break-words">
                  {modalCleanTitle}
                </h3>

                {/* Row 3: All metadata with flex-wrap so Applied 4x in Plant wraps cleanly instead of clipping */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 text-xs text-slate-300 mt-1">
                  <span className="flex items-center gap-1 text-slate-200 shrink-0">
                    <User className="w-3.5 h-3.5 text-indigo-300" />
                    <strong>{displayAuthor}</strong> ({displayRole})
                  </span>
                  {displayDate && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 text-indigo-300" />
                        <span>{displayDate}</span>
                      </span>
                    </>
                  )}
                  <span className="text-slate-500">•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-bold shrink-0">
                    <Zap className="w-3 h-3 text-emerald-300" />
                    <span>{getEstTimeSaved(modalNote)}</span>
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 shrink-0">
                    <Flame className="w-3 h-3 text-amber-300" />
                    <span>Applied {getPlantAppliedCount(modalNote)}x in Plant</span>
                  </span>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 w-full overflow-x-hidden">
                {/* 2-Column Grid: When to Apply & Recommended Action */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch w-full overflow-x-hidden">
                  {/* Left Column: When to Apply */}
                  <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3 space-y-1 flex flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-amber-900 text-xs uppercase tracking-wider mb-1">
                        <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>WHEN TO APPLY / TRIGGER CONDITION</span>
                      </div>
                      <p className="text-xs text-amber-950 font-sans leading-relaxed break-words">
                        <strong>Observed Trigger:</strong> {cleanModalTrigger || modalNote.symptom || 'High vibration in machine during Running - Abnormal operation'}
                      </p>
                      <p className="text-xs text-amber-950 font-sans leading-relaxed mt-1 break-words">
                        <strong>Task During Issue:</strong> {cleanTaskDuringIssue || 'Standard Plant Operation / AI RCA Diagnostic'}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Recommended Field Action */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 flex flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>RECOMMENDED FIELD ACTION & GUIDANCE</span>
                      </div>
                      <p className="text-slate-800 text-xs leading-relaxed font-sans whitespace-pre-line break-words">
                        {modalCleanFix || displayContent}
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI Supplemental Insight & Manual Cross-Check directly below 2-column grid */}
                {aiInsight && (
                  <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3 space-y-1 w-full overflow-x-hidden">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-indigo-950 text-xs uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>AI SUPPLEMENTAL INSIGHT & MANUAL CROSS-CHECK</span>
                    </div>
                    <p className="text-xs text-indigo-950 leading-relaxed font-sans whitespace-pre-line pl-5 break-words">
                      {aiInsight}
                    </p>
                  </div>
                )}

                {/* Worker Reviews Drawer if toggled inside modal */}
                {isReviewsOpen && (
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleReviewSubmit(modalNote.id, e);
                      }}
                      className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2 shadow-2xs"
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
                          className="text-xs shrink-0 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-95"
                        >
                          {submittingReview[modalNote.id] ? 'Posting...' : 'Post'}
                        </Button>
                      </div>
                    </form>
                    {reviewsList.length > 0 && (
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
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

                {/* Bottom Action Footer: 1 Single Uniform Horizontal Line */}
                <div className="pt-3 border-t border-slate-200 w-full overflow-hidden">
                  <div className="flex items-center justify-between gap-1.5 w-full flex-nowrap overflow-x-auto py-0.5">
                    <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
                      {/* Helpful Upvote Button */}
                      <button
                        type="button"
                        onClick={(e) => handleUpvote(modalNote.id, e)}
                        className="h-8 px-2.5 text-xs font-medium rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                        title="Endorse this tip as verified in plant"
                      >
                        <ThumbsUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Helpful ({modalNote.upvotes || 0})</span>
                      </button>

                      {/* Did Not Work Dislike Button */}
                      <button
                        type="button"
                        onClick={(e) => handleDislike(modalNote.id, e)}
                        className="h-8 px-2.5 text-xs font-medium rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                      >
                        <ThumbsDown className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>Did Not Work ({modalNote.downvotes || 0})</span>
                      </button>

                      {/* 1-Click Hands-Free Voice Readout Button + Multi-Language Voice Selector */}
                      <div className="h-8 flex items-center rounded-lg border border-indigo-200 bg-indigo-50/70 p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleVoiceReadout(modalNote)}
                          className={`h-7 px-2 rounded-md text-xs font-medium transition cursor-pointer active:scale-95 flex items-center gap-1 shrink-0 ${
                            isSpeaking
                              ? 'bg-amber-500 text-white animate-pulse'
                              : 'hover:bg-indigo-100 text-indigo-700'
                          }`}
                          title="Hands-free audio readout of trigger and field fix"
                        >
                          {isSpeaking ? (
                            <>
                              <VolumeX className="w-3.5 h-3.5 shrink-0" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>
                        <div className="h-4 w-px bg-indigo-300/60 mx-0.5 shrink-0" />
                        {/* Language Switcher Pill (EN | हिं) */}
                        <div className="flex items-center gap-0.5 text-[10px] font-mono font-bold shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceLang('en');
                              if (isSpeaking) {
                                window.speechSynthesis.cancel();
                                setIsSpeaking(false);
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded transition cursor-pointer shrink-0 ${
                              voiceLang === 'en'
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'text-indigo-600 hover:bg-indigo-100/80'
                            }`}
                            title="English Voice Readout"
                          >
                            🌐 EN
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceLang('hi');
                              if (isSpeaking) {
                                window.speechSynthesis.cancel();
                                setIsSpeaking(false);
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded transition cursor-pointer shrink-0 ${
                              voiceLang === 'hi'
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'text-indigo-600 hover:bg-indigo-100/80'
                            }`}
                            title="हिंदी Voice Readout (Hindi Translation)"
                          >
                            🇮🇳 हिं
                          </button>
                        </div>
                      </div>

                      {/* Worker Feedback Drawer Toggle */}
                      <button
                        type="button"
                        onClick={(e) => toggleReviews(modalNote.id, e)}
                        className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Feedback ({reviewsList.length})</span>
                        {isReviewsOpen ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-nowrap ml-auto">
                      {/* Copy Note Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyTip(modalNote)}
                        className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>Copy</span>
                      </button>

                      {/* Ask AI Copilot (1-Click Apply) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                            window.speechSynthesis.cancel();
                            setIsSpeaking(false);
                          }
                          handleAskCopilot(modalNote);
                        }}
                        className="h-8 px-2.5 text-xs font-medium rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold flex items-center gap-1 shadow-sm transition-all cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                        title="Load insight directly into AI Copilot"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
                        <span>Ask AI Copilot</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Multi-Note Submission Modal - Zero-Scroll 1-Screen Layout */}
      <Modal
        isOpen={isSubmitOpen}
        onClose={() => {
          if (!isSubmitting) setIsSubmitOpen(false);
        }}
        title="Submit Frontline Expert Note(s)"
        subtitle="Capture plant wisdom, non-standard tooling tips, or preventive observations. Automatically indexed for AI Copilot."
        maxWidth="2xl"
        bodyClassName="p-4 overflow-y-auto flex-1 text-xs text-slate-700 bg-white"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNotes(true);
          }}
          className="space-y-2.5 max-h-[82vh] overflow-y-auto pr-1"
        >
          {formNotes.map((noteItem, index) => (
            <div
              key={noteItem.clientId}
              className={`rounded-xl ${
                formNotes.length > 1
                  ? 'p-3 border border-blue-200 bg-slate-50/70 shadow-sm space-y-2.5'
                  : 'space-y-2.5'
              } relative`}
            >
              {/* Card Header only rendered for multi-note entries to avoid clipped header artifacts on 1-screen view */}
              {formNotes.length > 1 && (
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-[10px] font-mono font-bold">
                      {index + 1}
                    </span>
                    <span className="text-xs font-mono font-bold uppercase text-slate-700 tracking-wider">
                      Field Note #{index + 1}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSection(index)}
                    className="text-xs text-rose-600 hover:text-rose-700 hover:underline font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                </div>
              )}

              {/* Row 1: Title / Subject + Symptom / When to Apply (Trigger) (2-Column Row) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                    Title / Subject <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={noteItem.title}
                    onChange={(e) => updateFormNote(index, { title: e.target.value })}
                    placeholder="e.g. Always purge bypass loop before closing suction valve"
                    className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
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
                    className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Row 2: Target Machine, Task / Operation, Category (Compact 3-Column Row) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-start">
                {/* Target Machine */}
                <div>
                  <div className="h-4 flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Target Machine <span className="text-rose-500">*</span>
                    </label>
                    {noteItem.isCustomMachine && (
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomMachine: false,
                            assetTag: uploadedMachines.some((m) => m.assetTag === noteItem.assetTag) ? noteItem.assetTag : '',
                          });
                        }}
                        className="text-[10px] font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>↩ List</span>
                      </button>
                    )}
                  </div>
                  {noteItem.isCustomMachine ? (
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        autoFocus
                        required
                        value={noteItem.customMachine ?? ''}
                        onChange={(e) => updateFormNote(index, { customMachine: e.target.value })}
                        placeholder="Type machine tag (e.g. COMP-001)..."
                        className="w-full pl-2.5 pr-14 py-1.5 bg-white border border-[#2563EB] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomMachine: false,
                            assetTag: uploadedMachines.some((m) => m.assetTag === noteItem.assetTag) ? noteItem.assetTag : '',
                          });
                        }}
                        className="absolute right-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 transition cursor-pointer"
                      >
                        ↩ List
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={noteItem.assetTag}
                      onChange={(e) => {
                        if (e.target.value === '__CUSTOM_MACHINE__') {
                          updateFormNote(index, {
                            isCustomMachine: true,
                            customMachine: noteItem.customMachine || '',
                          });
                        } else {
                          updateFormNote(index, {
                            isCustomMachine: false,
                            assetTag: e.target.value,
                          });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Select Machine --
                      </option>
                      {uploadedMachines.map((m) => (
                        <option key={m.assetTag} value={m.assetTag}>
                          {m.assetTag}
                        </option>
                      ))}
                      <option value="__CUSTOM_MACHINE__" className="text-blue-700 font-bold bg-blue-50/50">
                        ✍️ Other / Custom (Specify)...
                      </option>
                    </select>
                  )}
                </div>

                {/* Task / Operation */}
                <div>
                  <div className="h-4 flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Task / Operation <span className="text-rose-500">*</span>
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
                        <span>↩ List</span>
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
                        placeholder="Type custom task..."
                        className="w-full pl-2.5 pr-14 py-1.5 bg-white border border-[#2563EB] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomTask: false,
                            taskDuringIssue: COMMON_TASKS.includes(noteItem.taskDuringIssue) ? noteItem.taskDuringIssue : '',
                          });
                        }}
                        className="absolute right-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 transition cursor-pointer"
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
                      className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Select Task --
                      </option>
                      {COMMON_TASKS.map((task) => (
                        <option key={task} value={task}>
                          {task}
                        </option>
                      ))}
                      <option value="__CUSTOM_TASK__" className="text-blue-700 font-bold bg-blue-50/50">
                        ✍️ Other / Custom (Specify)...
                      </option>
                    </select>
                  )}
                </div>

                {/* Category */}
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
                        <span>↩ List</span>
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
                        className="w-full pl-2.5 pr-14 py-1.5 bg-white border border-[#2563EB] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateFormNote(index, {
                            isCustomCategory: false,
                            category: (PRACTICAL_CATEGORIES as string[]).includes(noteItem.category) ? noteItem.category : '',
                          });
                        }}
                        className="absolute right-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 transition cursor-pointer"
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
                      className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
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
                        ✍️ Other / Custom (Specify)...
                      </option>
                    </select>
                  )}
                </div>
              </div>

              {/* Row 3: Impact / Severity & Observed Date & Time (Compact 2-Column Row) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
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
                    className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
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

                <div>
                  <div className="h-4 flex items-center mb-1">
                    <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                      Observed Date & Time
                    </label>
                  </div>
                  <input
                    type="datetime-local"
                    value={noteItem.observedAt}
                    onChange={(e) => updateFormNote(index, { observedAt: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              {/* Row 4: Observation & Field Guidance (Textarea rows={2}) */}
              <div>
                <label className="block text-[10px] font-mono text-[#64748B] uppercase font-bold tracking-wider mb-1">
                  Observation & Field Guidance <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={noteItem.content}
                  onChange={(e) => updateFormNote(index, { content: e.target.value })}
                  placeholder="Describe operational symptom, root cause mechanism, and recommended field practice..."
                  className="w-full px-2.5 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-sans"
                />
              </div>
            </div>
          ))}

          {/* Add Another Field Note Button (Sleek Slim Bar py-1.5 text-xs) */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={handleAddAnotherSection}
              className="w-full py-1.5 px-3 border border-dashed border-blue-400 bg-blue-50/60 hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-2xs active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Field Note</span>
            </button>
          </div>

          {/* Modal Footer Controls - Tightly Aligned */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2.5 border-t border-[#E2E8F0] mt-1">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>{formNotes.length} note(s) ready</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsSubmitOpen(false)}
                className="text-[#64748B] hover:text-[#0F172A] whitespace-nowrap px-3 text-xs py-1.5 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
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
                className="font-semibold text-xs border-slate-300 hover:bg-slate-50 whitespace-nowrap px-3 py-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-95"
              >
                Save & Add Another
              </Button>

              {/* Publish Button */}
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isSubmitting}
                className="bg-[#0F172A] text-white hover:bg-black font-semibold rounded-lg shadow-sm whitespace-nowrap px-3.5 text-xs py-1.5 shrink-0 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-95"
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
              className="text-[#64748B] hover:text-[#0F172A] text-xs px-3 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isSavingEdit}
              className="bg-[#0F172A] text-white hover:bg-black font-semibold rounded-lg shadow-sm text-xs px-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-95"
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

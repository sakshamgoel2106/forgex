import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  HelpCircle,
  ShieldCheck,
  Check,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  Wrench,
  GraduationCap,
  Plus,
  Send,
  Zap,
  ChevronRight,
  ChevronDown,
  History,
  FileText,
  CheckCircle2,
  Lock,
  Clock,
  ShieldAlert,
  Package,
  AlertTriangle,
  Trash2,
  GitBranch,
  MessageSquare,
  Lightbulb,
  Mic,
  RotateCcw,
  Rocket,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { apiFetch } from '../../lib/api';
import type { RcaSession } from '@forgex/shared-types';
import { generateRcaPdfReport } from '../../utils/rcaPdfReport';
import { ExpertKnowledgeCaptureModal, type ExpertKnowledgePrefill, sanitizeAssetTag } from '../modals/ExpertKnowledgeCaptureModal';
import { selectBestTechnician } from './SopExecutionView';
import {
  translateStepToHindi,
  HINDI_VOICE_PROMPTS,
  formatCleanMachineName,
  formatCleanNoteTitle,
  cleanRemediationText,
  cleanTriggerText,
} from '../../lib/hindiTranslator';

const toShortSentence = (text?: string, maxWords = 14): string => {
  if (!text) return '';
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  const words = firstSentence.split(/\s+/);
  if (words.length <= maxWords) return firstSentence.trim();
  return words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '') + '.';
};

const cleanMechanism = (raw?: string): string => {
  if (!raw) return '';
  let text = raw
    .replace(/\s*\b(?:on|for|at|in)\b\s+[A-Z0-9_\-\s]+(?:\([^)]*\))?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (
    text.includes('causes cavitation implosions and') ||
    text.includes('vapour pocket implosions') ||
    text.includes('suction pressure drop below fluid vapor pressure')
  ) {
    return 'Localized suction pressure drop below fluid vapor pressure causes vapour pocket implosions and thermal micro-cracking across seal faces.';
  }
  return text;
};

const cleanFieldFix = (raw?: string): string => {
  if (!raw) return '';
  let text = raw.trim();
  if (
    text.includes('check seal faces for thermal discoloration') &&
    (text.endsWith('and replace.') ||
      text.includes('replace seal cartridge') ||
      text.includes('replace the mechanical seal cartridge'))
  ) {
    return 'Isolate suction valves, verify zero energy under LOTO, check seal faces for thermal discoloration, and replace the mechanical seal cartridge.';
  }
  return text;
};

interface MachineItem {
  id: string;
  name: string;
  asset_tag?: string;
  assetTag?: string;
  status?: string;
  plant_area?: string;
  serial_number?: string;
}

const QUICK_SYMPTOM_CHIPS = [
  'High Vibration',
  'Thermal Spike',
  'Pressure Drop',
  'Seal Leakage',
  'Abnormal Noise',
  'Electrical Trip',
];

export interface TroubleshootingViewProps {
  onNavigateToSop?: () => void;
  onNavigateToMaintenance?: (assetId: string) => void;
  onNavigate?: (module: string, targetId?: string) => void;
  setActiveTab?: (tab: string) => void;
}

export const TroubleshootingView: React.FC<TroubleshootingViewProps> = ({
  onNavigateToSop,
  onNavigateToMaintenance: _onNavigateToMaintenance,
  onNavigate,
  setActiveTab: setParentActiveTab,
}) => {
  const { toast } = useToast();
  const { organization, user } = useAuth();

  // AI Voice Language Selector ('en' | 'hi') & Available Speech Synthesis Voices
  const [voiceLanguage, setVoiceLanguage] = useState<'en' | 'hi'>('en');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voiceLanguageRef = useRef<'en' | 'hi'>('en');

  useEffect(() => {
    voiceLanguageRef.current = voiceLanguage;
  }, [voiceLanguage]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) setAvailableVoices(v);
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Machine state restricted strictly to Knowledge Hub uploaded machines
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);
  const [hasNoDocuments, setHasNoDocuments] = useState(false);
  const [selectedMachineTag, setSelectedMachineTag] = useState<string>('');

  // Diagnostic Inputs
  const [errorCode, setErrorCode] = useState('');
  const [machineStatus, setMachineStatus] = useState<
    'Running - Abnormal' | 'Tripped / Offline' | 'Startup Failure' | ''
  >('');
  const [symptom, setSymptom] = useState('');

  // Active RCA Session
  const [activeSession, setActiveSession] = useState<RcaSession | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Tabs: 'rca' (Matrix) or 'steps' (Checklist)
  const [activeTab, setActiveTab] = useState<'rca' | 'steps'>('rca');

  // Recent Investigations
  const [recentSessions, setRecentSessions] = useState<RcaSession[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);
  const [isHistoryDropdownOpen, setIsHistoryDropdownOpen] = useState(false);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const [isMoreRecentOpen, setIsMoreRecentOpen] = useState(false);
  const moreRecentDropdownRef = useRef<HTMLDivElement>(null);

  // Escalation Modal State (Defaults start completely unselected)
  const [isEscalateOpen, setIsEscalateOpen] = useState(false);
  const [escalateDiscipline, setEscalateDiscipline] = useState<string>('');
  const [escalateSeverity, setEscalateSeverity] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | ''>('');
  const [isLotoApplied, setIsLotoApplied] = useState<boolean | null>(null);
  const [escalateNotes, setEscalateNotes] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalatedTicketId, setEscalatedTicketId] = useState<string | null>(null);
  const [escalationBanner, setEscalationBanner] = useState<{
    ticketId: string;
    discipline: string;
    severity: string;
  } | null>(null);

  // Expert Knowledge Capture Modal State (Multi-Stage Ticket Resolution)
  const [isExpertCaptureOpen, setIsExpertCaptureOpen] = useState(false);
  const [expertCapturePrefill, setExpertCapturePrefill] = useState<ExpertKnowledgePrefill | null>(null);

  // Storage Keys for Bulletproof Persistence (Database + localStorage + sessionStorage)
  const storageKey = `forgex_rca_history_${organization?.id || 'default'}`;

  // Inline Step Inspection State for 5-Why
  const [selectedWhyStep, setSelectedWhyStep] = useState<{ hypId: string; stepIndex: number } | null>(null);

  const handleToggleWhyStep = (hypId: string, stepIndex: number) => {
    setSelectedWhyStep((prev) => {
      if (prev?.hypId === hypId && prev?.stepIndex === stepIndex) {
        return null;
      }
      return { hypId, stepIndex };
    });
  };

  // Helper to persist RCA investigation state to localStorage, sessionStorage, and backend DB
  const persistSession = useCallback(
    (session: RcaSession) => {
      try {
        sessionStorage.setItem('forgex_active_rca_id', session.id);

        const raw = localStorage.getItem(storageKey);
        let list: RcaSession[] = raw ? JSON.parse(raw) : [];
        const existingIdx = list.findIndex((s) => s.id === session.id);
        if (existingIdx !== -1) {
          list[existingIdx] = session;
        } else {
          list.unshift(session);
        }
        localStorage.setItem(storageKey, JSON.stringify(list));
        setRecentSessions(list);

        // Sync to backend DB asynchronously
        apiFetch(`/api/v1/rca/sessions/${session.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        }).catch((err) => console.warn('Non-fatal backend session sync:', err));
      } catch (e) {
        console.warn('RCA Persistence error:', e);
      }
    },
    [storageKey]
  );

  // Hands-Free Voice Control State & Active Step Tracking
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [autoRaisedTicket, setAutoRaisedTicket] = useState<{
    ticketId: string;
    techName: string;
    assetTag: string;
  } | null>(null);

  // Keep refs up-to-date for async speech recognition callbacks
  const activeStepIndexRef = useRef(activeStepIndex);
  activeStepIndexRef.current = activeStepIndex;
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const isVoiceListeningRef = useRef(isVoiceListening);
  isVoiceListeningRef.current = isVoiceListening;

  // Initialize active step index to the first pending step when activeSession changes
  useEffect(() => {
    if (activeSession?.investigationSteps) {
      const firstPending = activeSession.investigationSteps.findIndex(
        (st) => st.status !== 'PASS' && st.status !== 'FAIL'
      );
      setActiveStepIndex(firstPending !== -1 ? firstPending : 0);
    }
  }, [activeSession?.id]);

  // Speech Synthesis Speaker with AI Voice Changer & Hindi Support
  const speakText = useCallback((text: string, langOverride?: 'en' | 'hi') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const targetLang = langOverride || voiceLanguageRef.current;

      if (targetLang === 'hi') {
        utterance.lang = 'hi-IN';
        const hiVoice = availableVoices.find(
          (v) =>
            v.lang.toLowerCase().includes('hi') ||
            v.name.toLowerCase().includes('hindi') ||
            v.lang.toLowerCase().includes('hi-in')
        );
        if (hiVoice) {
          utterance.voice = hiVoice;
        }
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
      } else {
        utterance.lang = 'en-US';
        const enVoice = availableVoices.find(
          (v) =>
            v.lang.includes('en-US') ||
            v.lang.includes('en-IN') ||
            v.name.toLowerCase().includes('english')
        );
        if (enVoice) {
          utterance.voice = enVoice;
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Voice speech error:', e);
    }
  }, [availableVoices]);

  // Cleanup speech recognition and synthesis on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);


  // Navigate to Raised Tickets / Maintenance Desk
  const handleNavigateToRaisedTickets = useCallback(
    (ticketId?: string) => {
      if (ticketId) {
        sessionStorage.setItem('forgex_selected_case_id', ticketId);
      }
      window.history.pushState({}, '', '/maintenance');
      window.dispatchEvent(
        new CustomEvent('forgex:navigate', { detail: { module: 'maintenance', ticketId } })
      );
      if (onNavigateToSop) {
        onNavigateToSop();
      }
    },
    [onNavigateToSop]
  );

  // Re-test Step: Clear Failed status and restore subsequent steps
  const handleResetOrRetestStep = useCallback(
    (step: any, stepIdx: number) => {
      const session = activeSessionRef.current;
      if (!session) return;
      const nowIso = new Date().toISOString();

      const updatedSteps = session.investigationSteps.map((s, idx) => {
        if (idx === stepIdx) {
          return {
            ...s,
            status: 'PENDING' as any,
            verifiedAt: undefined,
            verifiedBy: undefined,
          };
        }
        return s;
      });

      const updatedSession: RcaSession = {
        ...session,
        investigationSteps: updatedSteps,
        status: 'IN_PROGRESS' as any,
        updatedAt: nowIso,
      };

      setActiveSession(updatedSession);
      persistSession(updatedSession);
      setActiveStepIndex(stepIdx);

      apiFetch(`/api/v1/rca/sessions/${session.id}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PENDING',
          verifiedAt: null,
          verifiedBy: null,
        }),
      }).catch(() => null);

      if (voiceLanguageRef.current === 'hi') {
        speakText(`स्टेप ${step.stepNumber} री-टेस्ट के लिए रीसेट कर दिया गया है।`, 'hi');
      } else {
        speakText(`Step ${step.stepNumber} reset for re-test.`, 'en');
      }

      toast.info(`Step #${step.stepNumber} Reset`, 'Subsequent diagnostic steps restored.');
    },
    [persistSession, speakText, toast]
  );

  // Direct Escalation from Single Failed Step
  const handleDirectEscalateFromStep = useCallback(
    async (stepToEscalate?: any) => {
      const session = activeSessionRef.current;
      if (!session) return;
      const targetStep =
        stepToEscalate ||
        session.investigationSteps.find((s) => s.status === 'FAIL') ||
        session.investigationSteps[activeStepIndexRef.current];
      const targetTag = sanitizeAssetTag(session.assetTag || selectedMachineTag || 'PLANT-MACHINE');
      const activeFault =
        session.detectedFaultCode || session.errorCode || errorCode || 'DIAG-ANOMALY';
      const topHyp =
        session.hypotheses?.find((h) => h.status === 'CONFIRMED') || session.hypotheses?.[0];
      const currentSymptom =
        session.symptom?.trim() || symptom?.trim() || 'Physical boundary tolerance check failed during RCA';
      const engineerName =
        user?.fullName || (user as any)?.name || user?.email || 'Authorized Engineer';
      const matchedMachine = machines.find(
        (m) => (m.asset_tag || m.assetTag || m.name || m.id) === targetTag
      );

      const assignedTech = selectBestTechnician(
        {
          assetTag: targetTag,
          title: `[CRITICAL] ${targetTag}: Step ${targetStep?.stepNumber || 1} Failed (${activeFault})`,
          symptomDescription: currentSymptom,
          faultCode: activeFault,
        },
        []
      );

      const ticketNum = `AUTO-ESC-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      const cleanMachine = formatCleanMachineName(matchedMachine?.name || session.machineName || targetTag);
      const cleanAssetTag = formatCleanMachineName(targetTag);

      const newTicket = {
        id: ticketNum,
        caseNumber: ticketNum,
        assetTag: cleanAssetTag,
        assetId: cleanAssetTag,
        assetName: cleanMachine,
        title: `[${ticketNum}] ${cleanAssetTag}: Anomaly at Step ${targetStep?.stepNumber || 1} (${targetStep?.name || 'Diagnostic Check'})`,
        description: `CRITICAL FIELD DISPATCH: Diagnostic check failed at Step ${targetStep?.stepNumber || 1}: ${targetStep?.name}.\n\nExpected Reading: ${targetStep?.expectedReading || 'In-spec baseline'}\nObserved Anomaly: Physical boundary tolerance check failed.\nPrimary Root Cause: ${topHyp?.title || 'Component Defect / Wear'}\nRecommended Fix: ${topHyp?.recommendedFix || 'Execute LOTO and perform technician overhaul.'}`,
        severity: 'CRITICAL' as const,
        priority: 'CRITICAL' as const,
        status: 'IN_PROGRESS' as const,
        symptomDescription: currentSymptom,
        faultCode: activeFault,
        machineStatus: session.machineStatus || 'Tripped / Offline',
        topRootCause: topHyp?.title || 'Component Defect / Wear',
        probability: topHyp?.probability || 95,
        recommendedFix: topHyp?.recommendedFix || 'Execute immediate LOTO and replace damaged assembly.',
        investigationProgress: `Step ${targetStep?.stepNumber || 1} Failed (Halted & Escalated)`,
        specialistDiscipline: 'Mechanical / Rotating Equipment Lead',
        lotoApplied: true,
        reportedByRole: 'AI Diagnostic Assistant',
        reportedByName: `RCA Copilot / ${engineerName}`,
        assignedTechnicianUserId: assignedTech.id,
        assignedTechnicianName: assignedTech.fullName,
        assignedTechnicianRating: assignedTech.rating,
        isAiAutoAssigned: true,
        rcaSessionId: session.id,
        source: 'RCA_STEP_ANOMALY',
        createdAtFormatted: new Date().toLocaleString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checklist: [
          {
            id: `chk-esc-1`,
            stepNumber: 1,
            title: `Inspect failed boundary: ${targetStep?.name || 'Equipment Check'}`,
            instruction: targetStep?.instruction || 'Verify physical tolerances and replace failed mechanical seals or bearings.',
            requiresLoto: true,
            status: 'PENDING' as const,
          },
        ],
        history: [
          {
            id: `h-${Date.now()}`,
            action: 'DISPATCHED_SINGLE_STEP_ANOMALY',
            user: 'ForgeX Diagnostic Assistant',
            timestamp: new Date().toISOString(),
            notes: `Diagnostic anomaly confirmed at Step #${targetStep?.stepNumber} on ${targetTag}. Work order dispatched directly to ${assignedTech.fullName} (⭐ ${assignedTech.rating}).`,
          },
        ],
      };

      try {
        const existingRaw = localStorage.getItem('forgex_shared_raised_tickets');
        const existingList = existingRaw ? JSON.parse(existingRaw) : [];
        const filtered = existingList.filter(
          (t: any) => t.id !== ticketNum && t.caseNumber !== ticketNum
        );
        filtered.unshift(newTicket);
        localStorage.setItem('forgex_shared_raised_tickets', JSON.stringify(filtered));
      } catch (err) {
        console.warn('Error saving shared ticket:', err);
      }

      sessionStorage.setItem('forgex_selected_case_id', ticketNum);

      try {
        window.dispatchEvent(new CustomEvent('forgex:case-created', { detail: newTicket }));
        window.dispatchEvent(new CustomEvent('forgex:ticket-created', { detail: newTicket }));
      } catch {}

      apiFetch('/api/v1/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plantId: matchedMachine?.plant_area || organization?.id || 'plant-default',
          machineId: matchedMachine?.id || undefined,
          machineAssetTag: targetTag,
          originalQuestion: `Auto-Dispatched: [${targetTag}] Step ${targetStep?.stepNumber} Failed`,
          diagnosticDetails: `Equipment: ${targetTag}\nFailed Step: ${targetStep?.stepNumber} - ${targetStep?.name}\nExpected: ${targetStep?.expectedReading}\nAuto-Assigned To: ${assignedTech.fullName}`,
          severity: 'CRITICAL',
          escalationReason: 'RCA_STEP_FAILED_HALTED',
        }),
      }).catch(() => null);

      if (voiceLanguageRef.current === 'hi') {
        speakText(HINDI_VOICE_PROMPTS.ticketEscalated(ticketNum), 'hi');
      } else {
        speakText(`Work order ${ticketNum} dispatched to technician ${assignedTech.fullName}.`, 'en');
      }

      toast.success(
        `Ticket ${ticketNum} Dispatched to Technician`,
        `Assigned to ${assignedTech.fullName}. Redirecting to Technician Workspace...`
      );

      setTimeout(() => {
        onNavigate?.('raised-tickets', ticketNum);
        setParentActiveTab?.('raised-tickets');
        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'raised-tickets' }));
        window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'tech', ticketId: ticketNum } }));
        if (typeof window !== 'undefined') {
          window.location.hash = '#raised-tickets';
        }
      }, 700);
    },
    [errorCode, machines, onNavigate, organization?.id, selectedMachineTag, setParentActiveTab, speakText, symptom, toast, user]
  );

  // Execute Step Fail: Single Step Fail HALTS all subsequent checks immediately
  const handleExecuteStepFail = useCallback(
    async (step: any, stepIdx: number) => {
      const session = activeSessionRef.current;
      if (!session) return;
      const nowIso = new Date().toISOString();
      const engineerName =
        user?.fullName || (user as any)?.name || user?.email || 'Maintenance Engineer';

      const updatedSteps = session.investigationSteps.map((s, idx) => {
        if (idx === stepIdx) {
          return {
            ...s,
            status: 'FAIL' as const,
            verifiedAt: nowIso,
            verifiedBy: engineerName,
          };
        }
        return s;
      });

      const updatedSession: RcaSession = {
        ...session,
        investigationSteps: updatedSteps,
        status: 'ANOMALY_HALTED' as any,
        updatedAt: nowIso,
      };

      setActiveSession(updatedSession);
      persistSession(updatedSession);
      setActiveStepIndex(stepIdx);

      apiFetch(`/api/v1/rca/sessions/${session.id}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'FAIL',
          verifiedAt: nowIso,
          verifiedBy: engineerName,
        }),
      }).catch(() => null);

      if (voiceLanguageRef.current === 'hi') {
        speakText(HINDI_VOICE_PROMPTS.stepFailedHalted(step.stepNumber), 'hi');
      } else {
        const announcement = `Diagnostic anomaly confirmed at Step ${step.stepNumber}. Further in-house checks halted. Immediate field technician escalation required.`;
        speakText(announcement, 'en');
      }

      toast.error(
        `Step #${step.stepNumber} Anomaly Confirmed — Checks Halted`,
        `Physical boundary check failed. Immediate field technician intervention required.`
      );
    },
    [persistSession, speakText, toast, user]
  );

  // Execute Step Pass: Auto-scroll to next step or mark 100% verified
  const handleExecuteStepPass = useCallback(
    async (step: any, stepIdx: number) => {
      const session = activeSessionRef.current;
      if (!session) return;
      const nowIso = new Date().toISOString();
      const engineerName =
        user?.fullName || (user as any)?.name || user?.email || 'Maintenance Engineer';

      const updatedSteps = session.investigationSteps.map((s, idx) => {
        if (idx === stepIdx) {
          return {
            ...s,
            status: 'PASS' as const,
            verifiedAt: nowIso,
            verifiedBy: engineerName,
          };
        }
        return s;
      });

      const isAllNowPassed =
        updatedSteps.length > 0 && updatedSteps.every((s) => s.status === 'PASS');

      const updatedSession: RcaSession = {
        ...session,
        investigationSteps: updatedSteps,
        ...(isAllNowPassed
          ? {
              status: 'VERIFIED_CLOSED' as const,
              isLocked: true,
              completedAt: nowIso,
              verifiedBy: { id: user?.id || 'eng-01', name: engineerName },
            }
          : {}),
        updatedAt: nowIso,
      };

      setActiveSession(updatedSession);
      persistSession(updatedSession);

      apiFetch(`/api/v1/rca/sessions/${session.id}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PASS',
          verifiedAt: nowIso,
          verifiedBy: engineerName,
        }),
      }).catch(() => null);

      if (isAllNowPassed) {
        setVerificationCompleteModal(true);
        if (voiceLanguageRef.current === 'hi') {
          speakText(HINDI_VOICE_PROMPTS.stepPassed(step.stepNumber), 'hi');
        } else {
          speakText(
            `All diagnostic investigation steps on ${session.assetTag} successfully passed and verified.`,
            'en'
          );
        }
        toast.success('Investigation 100% Verified!', 'All steps verified.');
      } else {
        const nextIdx = Math.min(stepIdx + 1, updatedSteps.length - 1);
        setActiveStepIndex(nextIdx);
        setTimeout(() => {
          stepRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        const nextStep = updatedSteps[nextIdx];
        if (voiceLanguageRef.current === 'hi') {
          speakText(HINDI_VOICE_PROMPTS.stepPassed(step.stepNumber, nextStep.stepNumber, nextStep.name), 'hi');
        } else {
          speakText(`Step ${step.stepNumber} passed. Next: Step ${nextStep.stepNumber}, ${nextStep.name}`, 'en');
        }
        toast.success(`Step #${step.stepNumber} Verified`, `Proceeding to Step #${nextStep.stepNumber}`);
      }
    },
    [persistSession, speakText, toast, user]
  );

  // Read Active Step out loud (supports English technical and Hindi AI translation)
  const handleReadActiveStep = useCallback(() => {
    const s = activeSessionRef.current;
    const idx = activeStepIndexRef.current;
    if (!s || !s.investigationSteps || !s.investigationSteps[idx]) {
      const msg = voiceLanguageRef.current === 'hi'
        ? 'कोई सक्रिय डायग्नोस्टिक स्टेप चयनित नहीं है।'
        : 'No active investigation step selected.';
      speakText(msg);
      return;
    }
    const current = s.investigationSteps[idx];
    if (voiceLanguageRef.current === 'hi') {
      const hi = translateStepToHindi(current);
      speakText(hi.combinedSpeech, 'hi');
    } else {
      const conciseAction = toShortSentence(current.name || current.instruction, 10);
      const targetReading = current.expectedReading ? ` Target: ${current.expectedReading}.` : '';
      speakText(`Step ${current.stepNumber}: ${conciseAction}.${targetReading}`, 'en');
    }
  }, [speakText]);

  // Voice command handlers
  const handleVoiceStepPass = useCallback(() => {
    const s = activeSessionRef.current;
    const idx = activeStepIndexRef.current;
    if (!s || !s.investigationSteps || !s.investigationSteps[idx]) return;
    handleExecuteStepPass(s.investigationSteps[idx], idx);
  }, [handleExecuteStepPass]);

  const handleVoiceStepFail = useCallback(() => {
    const s = activeSessionRef.current;
    const idx = activeStepIndexRef.current;
    if (!s || !s.investigationSteps || !s.investigationSteps[idx]) return;
    handleExecuteStepFail(s.investigationSteps[idx], idx);
  }, [handleExecuteStepFail]);

  const lastCommandTimeRef = useRef<number>(0);
  const hasAnnouncedRef = useRef<boolean>(false);
  const handlersRef = useRef({
    handleVoiceStepPass: () => {},
    handleVoiceStepFail: () => {},
    handleDirectEscalateFromStep: () => {},
    handleReadActiveStep: () => {},
    toggleVoiceControl: () => {},
  });

  // Toggle & Instant 1st-Try Voice Control (Supports "Activate Voice", "Pass", "Fail", "Hindi", "Escalate", "Stop Voice")
  const toggleVoiceControl = useCallback(() => {
    if (isVoiceListeningRef.current) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsVoiceListening(false);
      isVoiceListeningRef.current = false;
      hasAnnouncedRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const deactMsg = voiceLanguageRef.current === 'hi'
          ? HINDI_VOICE_PROMPTS.voiceDeactivated
          : 'Voice control disabled.';
        const utt = new SpeechSynthesisUtterance(deactMsg);
        if (voiceLanguageRef.current === 'hi') utt.lang = 'hi-IN';
        window.speechSynthesis.speak(utt);
      }
      toast.info('Voice Control', 'Hands-free voice assistant disabled.');
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.info('Voice Dictation Unavailable', 'Voice dictation is unavailable in this environment / Android WebView. Please type your query in the input box below.');
      return;
    }

    isVoiceListeningRef.current = true;
    setIsVoiceListening(true);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      if (!hasAnnouncedRef.current) {
        hasAnnouncedRef.current = true;
        const actMsg = voiceLanguageRef.current === 'hi'
          ? HINDI_VOICE_PROMPTS.voiceActivated
          : 'Voice control activated.';
        const utt = new SpeechSynthesisUtterance(actMsg);
        if (voiceLanguageRef.current === 'hi') utt.lang = 'hi-IN';

        // Critical: Start mic strictly AFTER TTS finishes speaking so mic never hears itself!
        utt.onend = () => {
          if (isVoiceListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {}
          }
        };
        utt.onerror = () => {
          if (isVoiceListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {}
          }
        };
        window.speechSynthesis.speak(utt);
      } else {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {}
        }
      }
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    }

    toast.success(
      'Voice Control Active (1st-Try Instant Mode)',
      'Say: "Pass", "Fail", "Next", "Read Step", "Hindi", "Escalate", "Stop Voice"'
    );
  }, [toast]);

  // Update handlersRef on every render so SpeechRecognition always calls the latest callbacks without recreating instance
  useEffect(() => {
    handlersRef.current = {
      handleVoiceStepPass,
      handleVoiceStepFail,
      handleDirectEscalateFromStep,
      handleReadActiveStep,
      toggleVoiceControl,
    };
  });

  // Single SpeechRecognition instance initialized ONCE on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceLanguageRef.current === 'hi' ? 'hi-IN' : 'en-US';

    recognition.onresult = (event: any) => {
      // 1. Drop inputs while TTS is speaking to prevent mic hearing speaker output!
      if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
        return;
      }

      const now = Date.now();
      // 500ms debounce lock
      if (now - lastCommandTimeRef.current < 500) {
        return;
      }

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = (res[0]?.transcript || '').trim().toLowerCase();
        if (!transcript) continue;

        // 1. Stop commands
        if (/\b(stop voice|disable voice|turn off voice|band karo|mute|disable)\b/i.test(transcript)) {
          lastCommandTimeRef.current = now;
          handlersRef.current.toggleVoiceControl();
          return;
        }

        // 2. Language Switch commands
        if (/\b(hindi|hindi mein|hindi me|hindi voice)\b/i.test(transcript)) {
          lastCommandTimeRef.current = now;
          setVoiceLanguage('hi');
          voiceLanguageRef.current = 'hi';
          recognition.lang = 'hi-IN';
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance('हिंदी वॉइस एक्टिवेट हो गई है।');
            utt.lang = 'hi-IN';
            window.speechSynthesis.speak(utt);
          }
          toast.info('Language Changed', 'AI Voice set to Hindi (हिंदी)');
          return;
        }

        if (/\b(english|english voice)\b/i.test(transcript)) {
          lastCommandTimeRef.current = now;
          setVoiceLanguage('en');
          voiceLanguageRef.current = 'en';
          recognition.lang = 'en-US';
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance('English technical voice activated.');
            utt.lang = 'en-US';
            window.speechSynthesis.speak(utt);
          }
          toast.info('Language Changed', 'AI Voice set to English');
          return;
        }

        // 3. Execution Commands
        if (isVoiceListeningRef.current) {
          // PASS Triggers
          if (/\b(pass|paas|pas|past|confirm|verified|done|ok|yes|sahi)\b/i.test(transcript)) {
            lastCommandTimeRef.current = now;
            handlersRef.current.handleVoiceStepPass();
            return;
          }

          // FAIL Triggers
          if (/\b(fail|failed|fale|fell|no|error|galat|kharab)\b/i.test(transcript)) {
            lastCommandTimeRef.current = now;
            handlersRef.current.handleVoiceStepFail();
            return;
          }

          // ESCALATE Triggers
          if (/\b(escalate|dispatch|technician|assign|bhejo)\b/i.test(transcript)) {
            lastCommandTimeRef.current = now;
            handlersRef.current.handleDirectEscalateFromStep();
            return;
          }

          // NEXT Triggers
          if (/\b(next|agla|skip|forward)\b/i.test(transcript)) {
            lastCommandTimeRef.current = now;
            handlersRef.current.handleVoiceStepPass();
            return;
          }

          // READ Triggers
          if (/\b(read|read step|speak|tell|padho|batao|sunao)\b/i.test(transcript)) {
            lastCommandTimeRef.current = now;
            handlersRef.current.handleReadActiveStep();
            return;
          }
        }
      }
    };

    recognition.onerror = (err: any) => {
      if (err.error === 'not-allowed') {
        setIsVoiceListening(false);
        isVoiceListeningRef.current = false;
        toast.error(
          'Microphone Blocked',
          'Please allow microphone access in your browser to use Hands-Free Voice Control.'
        );
      }
    };

    recognition.onend = () => {
      if (isVoiceListeningRef.current) {
        setTimeout(() => {
          if (isVoiceListeningRef.current) {
            try {
              recognition.start();
            } catch {}
          }
        }, 250);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [toast]);

  // Reload Previous RCA Session
  const handleLoadSession = useCallback((session: RcaSession) => {
    setActiveSession(session);
    persistSession(session);
    setSelectedMachineTag(session.assetTag);
    setErrorCode(session.detectedFaultCode || session.errorCode || '');
    setMachineStatus((session.machineStatus as any) || 'Running - Abnormal');
    setSymptom(session.symptom);
    setActiveTab('rca');
    setIsHistoryDropdownOpen(false);
    setAutoRaisedTicket(null);
    toast.info('Session Loaded', `Loaded previous RCA investigation for ${session.assetTag}.`);
  }, [persistSession, toast]);

  // Failed Step Escalation Reference
  const [failedStepForEscalation, setFailedStepForEscalation] = useState<any | null>(null);

  // Reset to Clean Empty State
  const handleStartNewInvestigation = () => {
    sessionStorage.removeItem('forgex_active_rca_id');
    setActiveSession(null);
    setSelectedMachineTag('');
    setMachineStatus('');
    setErrorCode('');
    setSymptom('');
    setAnalysisError(null);
    setEscalatedTicketId(null);
    setEscalationBanner(null);
    setFailedStepForEscalation(null);
    setSelectedWhyStep(null);
    setAutoRaisedTicket(null);
    setActiveStepIndex(0);
    if (isVoiceListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsVoiceListening(false);
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Delete RCA Record Confirmation State (Requirement 2)
  const [deleteRcaConfirmation, setDeleteRcaConfirmation] = useState<{
    isOpen: boolean;
    session: RcaSession | null;
  }>({
    isOpen: false,
    session: null,
  });

  // Check if an RCA is locked from deletion (linked to active ticket or completed history)
  const checkIsRcaLocked = useCallback((session: RcaSession | null): boolean => {
    if (!session) return false;
    const s = session as any;
    // Direct escalation markers
    if (s.isEscalated || s.escalatedTicketId || s.status === 'ESCALATED') {
      return true;
    }
    // Closed / verified / completed
    if (s.status === 'VERIFIED_CLOSED' || s.isLocked) {
      return true;
    }
    // Check shared raised tickets
    try {
      const raw = localStorage.getItem('forgex_shared_raised_tickets');
      if (raw) {
        const tickets: any[] = JSON.parse(raw);
        const isLinkedToActive = tickets.some(
          (t) =>
            (t.rcaSessionId && t.rcaSessionId === s.id) ||
            (s.escalatedTicketId &&
              (t.caseNumber === s.escalatedTicketId || t.id === s.escalatedTicketId)) ||
            (t.assetTag === s.assetTag && (t.status === 'IN_PROGRESS' || t.status === 'RESOLVED'))
        );
        if (isLinkedToActive) return true;
      }
    } catch {}
    return false;
  }, []);

  // Delete RCA Handler (permanently removes un-escalated draft/test RCA)
  const handleDeleteRca = async () => {
    const session = deleteRcaConfirmation.session;
    if (!session) return;
    setDeleteRcaConfirmation({ isOpen: false, session: null });
    try {
      setRecentSessions((prev) => prev.filter((s) => s.id !== session.id));

      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const list: RcaSession[] = JSON.parse(raw);
        const filtered = list.filter((s) => s.id !== session.id);
        localStorage.setItem(storageKey, JSON.stringify(filtered));
      }

      apiFetch(`/api/v1/rca/sessions/${session.id}`, { method: 'DELETE' }).catch((e) =>
        console.warn('Backend delete sync:', e)
      );

      if (activeSession?.id === session.id) {
        handleStartNewInvestigation();
      }

      toast.success('RCA Deleted', `Investigation record for ${session.assetTag} was permanently removed.`);
    } catch (err: any) {
      toast.error('Delete Failed', err.message || 'Could not delete RCA record.');
    }
  };

  // Live sync with Tech Execution Desk & Raised Tickets
  const [ticketSyncVersion, setTicketSyncVersion] = useState<number>(0);

  useEffect(() => {
    const handleTicketSync = () => {
      setTicketSyncVersion((v) => v + 1);
    };
    window.addEventListener('forgex:ticket-progress-sync', handleTicketSync);
    window.addEventListener('forgex:ticket-solved', handleTicketSync);
    window.addEventListener('storage', handleTicketSync);
    return () => {
      window.removeEventListener('forgex:ticket-progress-sync', handleTicketSync);
      window.removeEventListener('forgex:ticket-solved', handleTicketSync);
      window.removeEventListener('storage', handleTicketSync);
    };
  }, []);

  const liveRcaBannerState = useMemo(() => {
    if (!activeSession) return null;

    const steps = activeSession.investigationSteps || [];
    const totalSteps = steps.length;
    const passedSteps = steps.filter((s) => s.status === 'PASS').length;
    const hasFailedStep = steps.some((s) => s.status === 'FAIL');

    const cleanAssetTag = (activeSession.assetTag || selectedMachineTag || 'ASSET')
      .replace(/\.(glb|gltf|obj|stl)\b/gi, '')
      .replace(/\s*\([^)]*\)/g, '')
      .trim() || 'ASSET';

    // Read linked ticket from localStorage
    const s = activeSession as any;
    let linkedTicket: any = null;
    let storedExec: any = null;
    const ticketRefId = s.escalatedTicketId || escalatedTicketId || autoRaisedTicket?.ticketId;

    try {
      const rawTickets = localStorage.getItem('forgex_shared_raised_tickets');
      if (rawTickets) {
        const tickets: any[] = JSON.parse(rawTickets);
        if (Array.isArray(tickets)) {
          if (ticketRefId) {
            linkedTicket = tickets.find((t) => t.id === ticketRefId || t.caseNumber === ticketRefId);
          }
          if (!linkedTicket) {
            linkedTicket = tickets.find((t) => t.rcaSessionId === activeSession.id);
          }
          if (!linkedTicket) {
            const cleanActiveLower = cleanAssetTag.toLowerCase();
            linkedTicket = tickets.find((t) => {
              const tTag = (t.assetTag || '').replace(/\.(glb|gltf|obj|stl)\b/gi, '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
              return tTag && cleanActiveLower && (tTag.includes(cleanActiveLower) || cleanActiveLower.includes(tTag));
            });
          }
        }
      }
    } catch {}

    const activeTicketId = linkedTicket?.id || linkedTicket?.caseNumber || ticketRefId;

    if (activeTicketId) {
      try {
        const rawExec = localStorage.getItem(`forgex_tech_exec_${activeTicketId}`);
        if (rawExec) storedExec = JSON.parse(rawExec);
      } catch {}
    }

    // Check if solved by technician in Tech Execution Desk
    const isTicketSolvedByTech = Boolean(
      linkedTicket && (
        linkedTicket.status === 'RESOLVED' ||
        linkedTicket.status === 'CLOSED' ||
        linkedTicket.status === 'Solved' ||
        linkedTicket.isSolved ||
        (storedExec && storedExec.isSolved) ||
        (storedExec && storedExec.completedSteps >= (storedExec.steps?.length || 5) && storedExec.completedSteps > 0)
      )
    );

    const isEscalatedToTech = Boolean(
      s.isEscalated ||
      s.escalatedTicketId ||
      escalatedTicketId ||
      autoRaisedTicket ||
      hasFailedStep ||
      linkedTicket
    );

    // State B: Problem Solved & Verified by Technician
    if (isTicketSolvedByTech) {
      const rawTechName = linkedTicket?.assignedTechnicianName || storedExec?.assignedTechnicianName || 'Alex Rivera';
      const rating = linkedTicket?.assignedTechnicianRating ? ` ★ ${linkedTicket.assignedTechnicianRating}` : ' ★ 4.9';
      const resolvedTime = linkedTicket?.resolvedAt || linkedTicket?.updatedAt || storedExec?.resolvedAt || new Date().toISOString();
      const formattedResolvedTime = new Date(resolvedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        type: 'SOLVED_BY_TECH' as const,
        ticketId: activeTicketId || 'ESC-VERIFIED',
        techName: `${rawTechName}${rating}`,
        rawTechName,
        resolvedAt: formattedResolvedTime,
        assetTag: cleanAssetTag,
        resolutionProof: `All shop-floor execution steps verified & closed by ${rawTechName}`,
      };
    }

    // State A: Escalated to Field Technician — In Execution
    if (isEscalatedToTech) {
      const rawTechName = linkedTicket?.assignedTechnicianName || autoRaisedTicket?.techName || 'Alex Rivera';
      const rating = linkedTicket?.assignedTechnicianRating ? ` ★ ${linkedTicket.assignedTechnicianRating}` : ' ★ 4.9';
      const completedCount = storedExec?.completedSteps ?? (linkedTicket?.completedSteps || 0);
      const totalCount = storedExec?.steps?.length || linkedTicket?.checklist?.length || 5;

      return {
        type: 'ESCALATED_TECH' as const,
        ticketId: activeTicketId || escalatedTicketId || autoRaisedTicket?.ticketId || 'ESC-AUTO-DISPATCH',
        techName: `${rawTechName}${rating}`,
        rawTechName,
        statusText: `${completedCount}/${totalCount} Steps Completed in Tech Desk`,
        assetTag: cleanAssetTag,
      };
    }

    // State C: All 5 Investigation Steps Passed Directly in RCA (or Explicitly Resolved & Saved)
    const isDirectlyVerified = Boolean(
      !hasFailedStep &&
      (
        (totalSteps > 0 && passedSteps === totalSteps) ||
        activeSession.status === 'VERIFIED_CLOSED'
      )
    );

    if (isDirectlyVerified) {
      const verifiedTime = activeSession.completedAt
        ? new Date(activeSession.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const verifyingUser = typeof activeSession.verifiedBy === 'object'
        ? activeSession.verifiedBy?.name
        : activeSession.verifiedBy || user?.fullName || user?.email || 'Plant Specialist';
      const faultCode = (activeSession.detectedFaultCode || activeSession.errorCode || errorCode || 'ALM-THRM-402')
        .replace(/\.(glb|gltf)\b/gi, '');

      return {
        type: 'VERIFIED_CLOSED' as const,
        verifiedAt: verifiedTime,
        assetTag: cleanAssetTag,
        faultCode,
        verifyingUser,
      };
    }

    return null;
  }, [activeSession, escalatedTicketId, autoRaisedTicket, ticketSyncVersion, user, errorCode, selectedMachineTag]);

  // 1-Step Failure Confirmation State (Marking Steps "Fail")
  const [failConfirmation, setFailConfirmation] = useState<{
    isOpen: boolean;
    step: any | null;
  }>({
    isOpen: false,
    step: null,
  });

  // 2-Step Confirmation State for Marking Steps "Pass"
  const [passConfirmation, setPassConfirmation] = useState<{
    isOpen: boolean;
    stepId: string | null;
    stepNumber: number;
    stepName: string;
    stage: 1 | 2;
  }>({
    isOpen: false,
    stepId: null,
    stepNumber: 0,
    stepName: '',
    stage: 1,
  });

  // LOTO & PPE Modal State
  const [isLotoModalOpen, setIsLotoModalOpen] = useState(false);

  // Center Failure Alert Popup Modal State (Auto-pops when step fails)
  const [failureAlertModal, setFailureAlertModal] = useState<{
    isOpen: boolean;
    step: any | null;
  }>({
    isOpen: false,
    step: null,
  });

  // Center 100% Verification Complete Popup Modal State
  const [verificationCompleteModal, setVerificationCompleteModal] = useState(false);

  // Drawer toggles for compact hypothesis cards
  const [expandedWhyCards, setExpandedWhyCards] = useState<Record<string, boolean>>({});
  const [expandedToolsCards, setExpandedToolsCards] = useState<Record<string, boolean>>({});

  const toggleCardDrawer = (hypId: string, drawer: 'why' | 'tools') => {
    if (drawer === 'why') {
      setExpandedWhyCards((prev) => ({ ...prev, [hypId]: !prev[hypId] }));
    } else {
      setExpandedToolsCards((prev) => ({ ...prev, [hypId]: !prev[hypId] }));
    }
  };

  // Action Loop State
  const [isSavingToExpert, setIsSavingToExpert] = useState(false);

  // Close history dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(e.target as Node)
      ) {
        setIsHistoryDropdownOpen(false);
      }
      if (
        moreRecentDropdownRef.current &&
        !moreRecentDropdownRef.current.contains(e.target as Node)
      ) {
        setIsMoreRecentOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load Machines strictly tied to uploaded documents in Knowledge Hub
  useEffect(() => {
    let isMounted = true;
    setIsLoadingMachines(true);

    Promise.all([
      apiFetch('/api/v1/documents').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/api/v1/machines').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([docJson, machineJson]) => {
        if (!isMounted) return;

        const docs: any[] = docJson?.success && Array.isArray(docJson.data) ? docJson.data : [];
        const allMachines: any[] =
          machineJson?.success && Array.isArray(machineJson.data) ? machineJson.data : [];

        // Collect unique asset tags referenced in ingested documents
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

        if (docAssetTags.size === 0) {
          setHasNoDocuments(true);
          setMachines([]);
          setSelectedMachineTag('');
          return;
        }

        setHasNoDocuments(false);
        const filtered: MachineItem[] = [];

        docAssetTags.forEach((tag) => {
          const matched = allMachines.find(
            (m) =>
              (m.asset_tag || m.assetTag || '').toUpperCase() === tag ||
              (m.name || '').toUpperCase().includes(tag)
          );
          if (matched) {
            filtered.push({
              id: matched.id,
              name: matched.name,
              asset_tag: matched.asset_tag || matched.assetTag || tag,
              assetTag: matched.assetTag || matched.asset_tag || tag,
              plant_area: matched.plant_area,
            });
          } else {
            filtered.push({
              id: tag,
              name: `Equipment (${tag})`,
              asset_tag: tag,
              assetTag: tag,
            });
          }
        });

        setMachines(filtered);
        // Start completely clean with "-- Select Uploaded Machine --" (no pre-selected default)
      })
      .catch((err) => {
        console.error('Failed to load Knowledge Hub machines for troubleshooting', err);
        setMachines([]);
        setHasNoDocuments(true);
      })
      .finally(() => {
        if (isMounted) setIsLoadingMachines(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Check for incoming ticket or direct RCA redirect from AI Copilot / Tech Execution Desk
  const processIncomingTicket = useCallback(() => {
    try {
      const raw = sessionStorage.getItem('forgex_rca_ticket');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.assetTag) {
          setSelectedMachineTag(parsed.assetTag);
        }
        if (parsed.symptom) {
          setSymptom(parsed.symptom);
        }
        if (parsed.errorCode) {
          setErrorCode(parsed.errorCode);
        }

        if (parsed.loadDirectRca || parsed.rcaSessionId) {
          let targetSession: RcaSession | null = null;
          try {
            const cachedRaw = localStorage.getItem(storageKey);
            if (cachedRaw) {
              const list: RcaSession[] = JSON.parse(cachedRaw);
              targetSession =
                list.find(
                  (s) =>
                    (parsed.rcaSessionId && s.id === parsed.rcaSessionId) ||
                    (parsed.ticketId && (s as any).escalatedTicketId === parsed.ticketId) ||
                    (s.assetTag && s.assetTag.toLowerCase() === parsed.assetTag?.toLowerCase())
                ) || null;
            }
          } catch {}

          if (targetSession) {
            handleLoadSession(targetSession);
          } else {
            // Synthesize structured RCA investigation
            const syntheticSession: RcaSession = {
              id: parsed.rcaSessionId || `rca-${Date.now()}`,
              organizationId: organization?.id || 'org-demo',
              plantId: 'plant-01',
              assetId: parsed.assetTag,
              authorUserId: user?.id || 'user-tech',
              assetTag: parsed.assetTag,
              machineName: parsed.machineName || parsed.assetTag,
              symptom: parsed.symptom || 'Equipment performance alert',
              errorCode: parsed.errorCode || 'FC-ALERT-01',
              detectedFaultCode: parsed.errorCode || 'FC-ALERT-01',
              machineStatus: 'Running - Abnormal',
              hypotheses: [
                {
                  id: 'hyp-1',
                  title: parsed.topRootCause || 'Dynamic seal degradation & fluid cavitation',
                  probability: parsed.probability || 94,
                  severity: 'HIGH',
                  mttr: '45m',
                  requiredSkill: 'Mechanical Specialist',
                  downtimeRisk: 'Moderate Risk',
                  mechanismExplanation:
                    'Continuous dynamic duty cycle resulted in seal face micro-wear and secondary boundary leakage.',
                  recommendedFix:
                    parsed.recommendedFix ||
                    'Replace dynamic seal cartridge, flush Plan 53A barrier, torque gland to 45 Nm.',
                  fiveWhyChain: [
                    'Why #1: Elevated operating parameter detected during shift run.',
                    'Why #2: Dynamic seal interface compromised by friction heat.',
                    'Why #3: Sub-optimal lubrication barrier under high hydraulic load.',
                    'Why #4: Normal wear lifecycle reached without predictive overhaul.',
                    `Why #5: Root cause: ${parsed.topRootCause || 'Dynamic seal degradation & fluid cavitation'}`,
                  ],
                  verifiedSources: [
                    {
                      type: 'MANUAL',
                      reference: 'OEM Maintenance Manual §4.2',
                      title: 'Seal Clearance & Dynamic Interface Wear Limits',
                    },
                    {
                      type: 'EXPERT_NOTE',
                      reference: 'Knowledge Hub SOP-MNT-402',
                      title: 'Zero-Energy Isolation & Torquing Protocol',
                    },
                  ],
                  requiredTools: ['Calibrated Torque Wrench', 'Feeler Gauges', 'Dial Indicator'],
                  spareParts: ['Dynamic Seal Kit', 'Gasket Pack', 'Synthetic Lubricant'],
                  status: 'CONFIRMED',
                },
              ],
              investigationSteps: [
                {
                  id: 'step-1',
                  stepNumber: 1,
                  name: 'Visual & Zero-Energy Safety Isolation',
                  instruction: 'Verify zero pressure / voltage isolation prior to casing access.',
                  expectedReading: '0 PSI / 0 V',
                  requiresLoto: true,
                  status: 'PASS',
                },
                {
                  id: 'step-2',
                  stepNumber: 2,
                  name: 'Component Clearance & Tolerances Verification',
                  instruction: 'Measure clearance with calibrated gauges against OEM spec limits.',
                  expectedReading: '< 0.05 mm',
                  requiresLoto: false,
                  status: 'PASS',
                },
                {
                  id: 'step-3',
                  stepNumber: 3,
                  name: 'Root Cause Defect Inspection & Replacement',
                  instruction: `Examine ${parsed.topRootCause || 'dynamic seal'} for physical fatigue and install certified OEM replacement.`,
                  expectedReading: 'Torque to 45 Nm',
                  requiresLoto: false,
                  status: 'PASS',
                },
              ],
              safetyReadiness: {
                requiredPpe: ['Level 2 Mechanical Gloves', 'Eye Protection', 'Safety Boots'],
                isolationPoints: ['Main Electrical Breaker', 'Hydraulic Discharge Valve'],
                lockoutProcedure: 'OSHA 1910.147 Zero-Energy Isolation',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            handleLoadSession(syntheticSession);
          }
          toast.success('RCA Report Loaded', `Active investigation loaded for ${parsed.assetTag}.`);
        } else {
          toast.info(
            'Ticket Received from AI Copilot',
            `Loaded anomaly context for ${parsed.assetTag}. Ready for higher officer root cause analysis.`
          );
        }
        sessionStorage.removeItem('forgex_rca_ticket');
      } else {
        sessionStorage.removeItem('forgex_active_rca_id');
      }
    } catch {}
  }, [handleLoadSession, storageKey, toast]);

  useEffect(() => {
    processIncomingTicket();
    const handleNav = (e: any) => {
      if (e.detail === 'troubleshooting') {
        setTimeout(processIncomingTicket, 50);
      }
    };
    window.addEventListener('forgex:navigate', handleNav);
    window.addEventListener('forgex:load_rca', processIncomingTicket);
    return () => {
      window.removeEventListener('forgex:navigate', handleNav);
      window.removeEventListener('forgex:load_rca', processIncomingTicket);
    };
  }, [processIncomingTicket]);

  // Fetch and merge Recent RCA Sessions (Backend DB + localStorage) and restore active RCA
  const fetchRecentSessions = useCallback(async () => {
    try {
      setIsLoadingRecents(true);

      // 1. Read cached localStorage records
      let localRecords: RcaSession[] = [];
      try {
        const cachedRaw = localStorage.getItem(storageKey);
        if (cachedRaw) {
          localRecords = JSON.parse(cachedRaw);
        }
      } catch (err) {
        console.warn('Could not read cached RCA sessions from localStorage:', err);
      }

      // 2. Fetch from backend API
      let backendRecords: RcaSession[] = [];
      try {
        const res = await apiFetch('/api/v1/rca/sessions');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            backendRecords = json.data;
          }
        }
      } catch (err) {
        console.warn('Could not fetch recent RCA sessions from backend:', err);
      }

      // 3. Merge uniquely by ID, prioritizing the record with latest updatedAt
      const map = new Map<string, RcaSession>();
      [...localRecords, ...backendRecords].forEach((s) => {
        if (!s || !s.id) return;
        const existing = map.get(s.id);
        if (!existing) {
          map.set(s.id, s);
        } else {
          const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          const newTime = new Date(s.updatedAt || s.createdAt || 0).getTime();
          if (newTime >= existingTime) {
            map.set(s.id, s);
          }
        }
      });

      const mergedList = Array.from(map.values()).sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      );

      setRecentSessions(mergedList);
      localStorage.setItem(storageKey, JSON.stringify(mergedList));

      // Requirement 1: Do NOT auto-restore past RCA across page reloads.
      // RCA starts at clean "No Active RCA / Start New Investigation" default state.
    } catch (err) {
      console.warn('Error during merged RCA session load:', err);
    } finally {
      setIsLoadingRecents(false);
    }
  }, [storageKey]);

  useEffect(() => {
    fetchRecentSessions();
  }, [fetchRecentSessions]);

  // Append symptom chip to text area
  const handleAddSymptomChip = (chip: string) => {
    setSymptom((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (trimmed.toLowerCase().includes(chip.toLowerCase())) return prev;
      return `${trimmed}, ${chip}`;
    });
  };

  // Run AI RCA
  const handleRunAnalysis = async () => {
    if (!selectedMachineTag) {
      toast.error('Validation Error', 'Please select an equipment asset with uploaded documentation.');
      return;
    }
    if (!symptom.trim()) {
      toast.error('Validation Error', 'Please enter field-observed symptoms or alarm details.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    toast.info(
      'Synthesizing RCA',
      `Querying Knowledge Hub manuals, expert notes, and failure logs for ${selectedMachineTag}...`
    );

    try {
      const matchedMachine = machines.find(
        (m) => (m.asset_tag || m.assetTag || m.name || m.id) === selectedMachineTag
      );

      const res = await apiFetch('/api/v1/rca/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: matchedMachine?.id || selectedMachineTag,
          assetTag: selectedMachineTag,
          machineStatus: machineStatus || 'Running - Abnormal',
          errorCode: errorCode.trim() || undefined,
          symptom: symptom.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const session: RcaSession = json.data;
        setActiveSession(session);
        persistSession(session);
        setErrorCode(session.detectedFaultCode || session.errorCode || '');
        setActiveTab('rca');
        toast.success(
          'RCA Ready',
          `AI inferred fault code ${session.detectedFaultCode || session.errorCode} and generated grounded hypotheses.`
        );
        fetchRecentSessions();
      } else {
        const msg = json?.error?.message || 'Failed to complete automated diagnostic RCA.';
        setAnalysisError(msg);
        toast.error('RCA Failed', msg);
      }
    } catch (err: any) {
      const msg = err.message || 'Diagnostic connection error. Please verify network connectivity.';
      setAnalysisError(msg);
      toast.error('Connection Error', msg);
    } finally {
      setIsAnalyzing(false);
    }
  };



  // Final Sign-Off (2/2): Lock Step and if 100% Passed, Permanently Lock Investigation & Save to Maintenance History
  const handleFinalConfirmPass = async (stepId: string) => {
    if (!activeSession) return;
    setPassConfirmation((prev) => ({ ...prev, isOpen: false }));

    const nowIso = new Date().toISOString();
    const engineerName = user?.fullName || (user as any)?.name || user?.email || 'Maintenance Engineer';

    const updatedSteps = activeSession.investigationSteps.map((s) =>
      s.id === stepId
        ? {
            ...s,
            status: 'PASS' as const,
            isLocked: true,
            verifiedAt: nowIso,
            verifiedBy: engineerName,
          }
        : s
    );

    const isAllNowPassed =
      updatedSteps.length > 0 && updatedSteps.every((s) => s.status === 'PASS');

    const updatedSession: RcaSession = {
      ...activeSession,
      investigationSteps: updatedSteps,
      ...(isAllNowPassed
        ? {
            status: 'VERIFIED_CLOSED' as const,
            isLocked: true,
            completedAt: nowIso,
            verifiedBy: { id: user?.id || 'eng-01', name: engineerName },
          }
        : {}),
      updatedAt: nowIso,
    };

    setActiveSession(updatedSession);
    persistSession(updatedSession);

    try {
      // Sync step status and lock to backend
      await apiFetch(`/api/v1/rca/sessions/${activeSession.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PASS',
          isLocked: true,
          verifiedAt: nowIso,
          verifiedBy: engineerName,
        }),
      });

      toast.success(
        'Step Verified & Locked',
        `Step #${passConfirmation.stepNumber} has been verified and permanently locked.`
      );

      // If all steps reach 100% Passed:
      if (isAllNowPassed) {
        try {
          const compRes = await apiFetch(`/api/v1/rca/sessions/${activeSession.id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              completedAt: nowIso,
              verifiedBy: { id: user?.id || 'eng-01', name: engineerName },
            }),
          });
          if (compRes.ok) {
            fetchRecentSessions();
          }
        } catch (compErr) {
          console.warn('Could not complete session on backend:', compErr);
        }

        // Permanently record resolution to Maintenance History
        try {
          apiFetch('/api/v1/maintenance/cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assetTag: activeSession.assetTag,
              title: `RCA Resolution: ${activeSession.assetTag} Verified Normal`,
              description: `All ${activeSession.investigationSteps.length} root cause investigation steps passed with 100% verification. Issue resolved in-house.`,
              severity: 'LOW',
              priority: 'LOW',
              status: 'RESOLVED',
              symptomDescription: activeSession.symptom,
              faultCode: activeSession.detectedFaultCode || activeSession.errorCode || 'NORM-PASS',
              plantName: organization?.name || 'Main Manufacturing Facility',
              reportedByUserName: engineerName,
              technicianNotes: 'Investigation completed with 100% verification by maintenance engineer. Archived to Maintenance History.',
            }),
          }).catch(() => null);
        } catch {}

        setVerificationCompleteModal(true);
        toast.success(
          'Investigation 100% Verified!',
          'Permanent record saved to Maintenance History & Recent RCAs.'
        );
      }
    } catch {
      toast.error('Update Failed', 'Could not sync step status to database.');
    }
  };

  // Case 1 (Solved at RCA Stage): Resolve Ticket & Save Record directly to Maintenance History and prompt Expert Knowledge
  const handleResolveTicketAndSaveRecord = async (solvedStep?: any) => {
    if (!activeSession) return;

    const targetTag = sanitizeAssetTag(activeSession.assetTag || selectedMachineTag || 'PLANT-MACHINE');
    const engineerName = user?.fullName || (user as any)?.name || user?.email || 'Authorized Engineer';
    const topHyp =
      activeSession.hypotheses?.find((h) => h.status === 'CONFIRMED') ||
      activeSession.hypotheses?.[0];
    const currentSymptom =
      activeSession.symptom?.trim() ||
      symptom?.trim() ||
      'Abnormal operating conditions identified during RCA';
    const nowIso = new Date().toISOString();

    // 1. Mark RCA session sealed and completed
    const updatedSteps = activeSession.investigationSteps.map((s) => {
      if (solvedStep && s.id === solvedStep.id) {
        return { ...s, status: 'PASS' as const, isLocked: true };
      }
      return { ...s, isLocked: true };
    });

    const updatedSession: RcaSession = {
      ...activeSession,
      status: 'VERIFIED_CLOSED',
      isLocked: true,
      completedAt: nowIso,
      verifiedBy: {
        id: user?.id || 'engineer',
        name: engineerName,
      },
      investigationSteps: updatedSteps,
      updatedAt: nowIso,
    };

    setActiveSession(updatedSession);
    persistSession(updatedSession);

    // 2. Call backend to mark RCA session complete
    try {
      await apiFetch(`/api/v1/rca/${activeSession.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedByUserId: user?.id,
          verifiedByName: engineerName,
          completionNotes: solvedStep
            ? `Fault resolved directly at investigation step #${solvedStep.stepNumber} (${solvedStep.name}) by Maintenance Engineer.`
            : 'All root cause verification steps passed and sealed by Maintenance Engineer.',
        }),
      }).catch(() => null);
    } catch {}

    // 3. Post authoritative record directly to /api/v1/maintenance-records & sync to localStorage
    const ticketId = (activeSession as any).ticketNumber || `RCA-${Date.now().toString().slice(-4)}`;
    const rcaRepairActions = [
      solvedStep
        ? `Fault resolved at step #${solvedStep.stepNumber} (${solvedStep.name}): ${solvedStep.instruction}`
        : `All ${activeSession.investigationSteps.length} root cause investigation steps passed with 100% verification. Issue resolved in-house.`,
    ];

    const rcaHistoryRecord = {
      id: `rec-mr-rca-${Date.now().toString().slice(-6)}`,
      recordNumber: `MR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      organizationId: 'org-demo',
      plantId: 'plant-01',
      machineId: targetTag,
      machineAssetTag: targetTag,
      ticketNumber: ticketId,
      ticketId,
      caseId: ticketId,
      caseNumber: ticketId,
      problemStatement: currentSymptom,
      observedSymptoms: [currentSymptom],
      rootCause: topHyp?.title || 'Verified condition cleared during RCA investigation',
      rootCauseStatus: 'CONFIRMED' as const,
      faultCategory: 'RCA_SESSION',
      repairActions: rcaRepairActions,
      verificationState: 'PASSED' as const,
      approvalStatus: 'APPROVED' as const,
      resolvedAt: nowIso,
      resolvingTechnicianName: engineerName,
      resolutionSource: 'RCA_ENGINEER',
      mttrMinutes: 24,
    };

    try {
      const rawHistory = localStorage.getItem('forgex_maintenance_history');
      const historyList = rawHistory ? JSON.parse(rawHistory) : [];
      const existingIdx = historyList.findIndex(
        (h: any) => h.ticketId === ticketId || h.ticketNumber === ticketId
      );
      if (existingIdx !== -1) {
        historyList[existingIdx] = { ...historyList[existingIdx], ...rcaHistoryRecord };
      } else {
        historyList.unshift(rcaHistoryRecord);
      }
      localStorage.setItem('forgex_maintenance_history', JSON.stringify(historyList));
      window.dispatchEvent(new CustomEvent('forgex:history-updated', { detail: rcaHistoryRecord }));
    } catch {}

    try {
      await apiFetch('/api/v1/maintenance-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rcaHistoryRecord),
      }).catch(() => null);
    } catch (mrErr) {
      console.warn('Failed to post direct maintenance record:', mrErr);
    }

    // 4. Also sync to maintenance cases as RESOLVED so work orders/case list stays in sync
    try {
      await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetTag: targetTag,
          caseNumber: ticketId,
          title: `RCA Resolution: [${targetTag}] ${topHyp?.title || currentSymptom.slice(0, 50)}`,
          description: solvedStep
            ? `Resolved at RCA Step #${solvedStep.stepNumber} (${solvedStep.name}). Diagnostic details: ${solvedStep.instruction}`
            : `All root cause investigation steps passed with 100% verification. Issue resolved in-house without field dispatch.`,
          severity: 'LOW',
          priority: 'LOW',
          status: 'RESOLVED',
          symptomDescription: currentSymptom,
          faultCode: activeSession.detectedFaultCode || activeSession.errorCode || 'RCA-RESOLVED',
          plantName: organization?.name || 'Main Manufacturing Facility',
          reportedByUserName: engineerName,
          technicianNotes: solvedStep
            ? `Resolved at RCA step #${solvedStep.stepNumber} by ${engineerName}. Recorded to Maintenance History.`
            : `100% verified and resolved by ${engineerName}. Recorded to Maintenance History.`,
        }),
      }).catch(() => null);
    } catch {}

    // Close any previous verification modal
    setVerificationCompleteModal(false);

    // 5. Pre-fill and trigger Expert Knowledge Capture Form (Requirement 4)
    setExpertCapturePrefill({
      machineAssetTag: targetTag,
      issueTitle: `RCA Fix: [${targetTag}] ${topHyp?.title || currentSymptom.slice(0, 60)}`,
      category: 'Reliability',
      resolutionSummary: solvedStep
        ? `Resolved at RCA step #${solvedStep.stepNumber} (${solvedStep.name}). Expected parameter: ${solvedStep.expectedReading || 'Normal range'}. Root cause identified: ${topHyp?.title || 'Physical anomaly'}. Recommended Fix applied: ${topHyp?.recommendedFix || solvedStep.instruction}`
        : `Verified all investigation steps. Primary root cause: ${topHyp?.title || 'System calibrated'}. Remediation: ${topHyp?.recommendedFix || 'Operating parameters restored within tolerance.'}`,
      symptom: currentSymptom,
    });
    setIsExpertCaptureOpen(true);

    toast.success(
      'Ticket Resolved & Saved to Maintenance History',
      `Audit record sealed for ${targetTag}. Form ready to publish fix to Expert Knowledge.`
    );
  };


  // Confirm Step Failure: Halt Investigation, Lock Failed Step & Lock all Subsequent Steps
  const handleConfirmFail = async () => {
    if (!activeSession || !failConfirmation.step) return;
    const targetStep = failConfirmation.step;
    setFailConfirmation({ isOpen: false, step: null });

    const nowIso = new Date().toISOString();
    const engineerName = user?.fullName || (user as any)?.name || user?.email || 'Maintenance Engineer';

    const targetIndex = targetStep.stepNumber - 1;
    const updatedSteps = activeSession.investigationSteps.map((s, idx) => {
      if (s.id === targetStep.id) {
        return {
          ...s,
          status: 'FAIL' as const,
          isLocked: true,
          verifiedAt: nowIso,
          verifiedBy: engineerName,
        };
      }
      // Immediately lock and block all subsequent steps below the failed step!
      if (idx > targetIndex) {
        return {
          ...s,
          isLocked: true,
        };
      }
      return s;
    });

    const updatedSession: RcaSession = {
      ...activeSession,
      status: 'HALTED_FAILED_STEP' as any,
      investigationSteps: updatedSteps,
      updatedAt: nowIso,
    };

    setActiveSession(updatedSession);
    persistSession(updatedSession);

    setFailureAlertModal({ isOpen: true, step: targetStep });

    toast.error(
      'Investigation Halted',
      `Critical anomaly detected at Step #${targetStep.stepNumber}. All subsequent steps locked. Please escalate to Machine Specialist.`
    );

    try {
      await apiFetch(`/api/v1/rca/sessions/${activeSession.id}/steps/${targetStep.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'FAIL',
          isLocked: true,
          verifiedAt: nowIso,
          verifiedBy: engineerName,
        }),
      });

      await apiFetch(`/api/v1/rca/sessions/${activeSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSession),
      });
    } catch (err) {
      console.warn('Backend failed step sync error:', err);
    }
  };

  // Open Escalation Modal with Pre-filled Failed Step Context
  const handleOpenEscalateForFailedStep = (failedStep: any) => {
    if (!activeSession) return;
    const currentSymptom = activeSession.symptom?.trim() || symptom?.trim() || '';
    const topHyp =
      activeSession.hypotheses?.find((h) => h.status === 'CONFIRMED') ||
      activeSession.hypotheses?.[0];
    const activeFault =
      activeSession.detectedFaultCode || activeSession.errorCode || errorCode || 'ALM-STEP-FAIL';
    const topFix = toShortSentence(topHyp?.recommendedFix, 14) || 'Execute energy isolation and specialist inspection.';
    const prefill = `• Symptom: ${currentSymptom}${activeFault ? ` (${activeFault})` : ''} — Failed Step #${failedStep.stepNumber} (${failedStep.name})\n• Suspected Cause & Fix: ${topHyp?.title || 'Physical Anomaly'} — ${topFix}`;

    setEscalateDiscipline('Mechanical / Rotating Equipment Lead');
    setEscalateSeverity('CRITICAL');
    setIsLotoApplied(true);
    setEscalateNotes(prefill);
    setFailedStepForEscalation(failedStep);
    setIsEscalateOpen(true);
  };

  // Toggle Hypothesis Status & Persist
  const setHypothesisStatus = (id: string, newStatus: 'CONFIRMED' | 'HYPOTHESIS' | 'RULED_OUT') => {
    if (!activeSession) return;
    const nowIso = new Date().toISOString();
    const updatedHypotheses = activeSession.hypotheses.map((h) => {
      if (h.id === id) {
        return { ...h, status: newStatus };
      }
      if (newStatus === 'CONFIRMED' && h.status === 'CONFIRMED') {
        return { ...h, status: 'HYPOTHESIS' as const };
      }
      return h;
    });

    const updatedSession: RcaSession = {
      ...activeSession,
      hypotheses: updatedHypotheses,
      updatedAt: nowIso,
    };

    setActiveSession(updatedSession);
    persistSession(updatedSession);

    if (newStatus === 'CONFIRMED') {
      const confirmedHyp = activeSession.hypotheses.find((h) => h.id === id);
      toast.success(
        'Root Cause Confirmed',
        `Confirmed "${confirmedHyp?.title || 'Hypothesis'}" as primary root cause by Maintenance Engineer.`
      );
    }
  };

  // Export RCA Summary Report (Professional Formatted PDF)
  const handleExportRcaSummary = () => {
    if (!activeSession) return;
    const targetTag = activeSession.assetTag || selectedMachineTag || 'PLANT-MACHINE';
    const nowStr = new Date().toLocaleString();
    const engineerName = user?.fullName || (user as any)?.name || user?.email || 'Authorized Engineer';
    const passedCount = activeSession.investigationSteps.filter((s) => s.status === 'PASS').length;
    const totalCount = activeSession.investigationSteps.length;
    const topHyp =
      activeSession.hypotheses.find((h) => h.status === 'CONFIRMED') || activeSession.hypotheses[0];
    const failedStep = activeSession.investigationSteps.find((s) => s.status === 'FAIL');
    const matchedMachine = machines.find(
      (m) => (m.asset_tag || m.assetTag || m.name || m.id) === targetTag
    );

    const overallStatus: '100% VERIFIED & CLOSED' | 'CRITICAL ANOMALY HALTED' | 'IN PROGRESS' = failedStep
      ? 'CRITICAL ANOMALY HALTED'
      : (passedCount === totalCount && totalCount > 0) || activeSession.status === 'VERIFIED_CLOSED' || activeSession.isLocked
      ? '100% VERIFIED & CLOSED'
      : 'IN PROGRESS';

    try {
      generateRcaPdfReport({
        targetTag,
        machineName: matchedMachine?.name || activeSession.machineName,
        plantName: matchedMachine?.plant_area || organization?.name || 'Main Manufacturing Facility',
        reportDate: nowStr,
        engineerName,
        engineerRole: (user as any)?.role || 'Maintenance Engineer',
        operatingState: activeSession.machineStatus || 'Running - Abnormal',
        detectedFaultCode: activeSession.detectedFaultCode || activeSession.errorCode,
        symptom: activeSession.symptom,
        topHypothesis: topHyp
          ? {
              title: topHyp.title,
              probability: topHyp.probability,
              severity: topHyp.severity,
              mttr: topHyp.mttr,
              requiredSkill: topHyp.requiredSkill,
              downtimeRisk: topHyp.downtimeRisk,
              mechanismExplanation: topHyp.mechanismExplanation,
              recommendedFix: topHyp.recommendedFix,
              fiveWhyChain: topHyp.fiveWhyChain,
              requiredTools: topHyp.requiredTools,
              spareParts: topHyp.spareParts,
              status: topHyp.status,
            }
          : undefined,
        investigationSteps: activeSession.investigationSteps.map((s) => ({
          stepNumber: s.stepNumber,
          name: s.name,
          instruction: s.instruction,
          expectedReading: s.expectedReading,
          requiresLoto: s.requiresLoto,
          status: (s.status as any) || 'PENDING',
          verifiedAt: s.verifiedAt,
          verifiedBy: s.verifiedBy,
        })),
        safetyReadiness: activeSession.safetyReadiness,
        escalation: escalatedTicketId
          ? {
              ticketId: escalatedTicketId,
              discipline: escalationBanner?.discipline,
              severity: escalationBanner?.severity,
            }
          : null,
        overallStatus,
      });

      toast.success(
        'RCA Summary PDF Exported',
        'RCA Summary PDF exported successfully!'
      );
    } catch (err: any) {
      console.error('Failed to generate RCA PDF report:', err);
      toast.error('Export Failed', 'Could not generate RCA PDF report.');
    }
  };

  // Deep-Dive 5-Why in AI Copilot Handoff
  const handleDeepDiveInCopilot = (hyp: any) => {
    const targetTag = activeSession?.assetTag || selectedMachineTag || 'PLANT-MACHINE';
    const fault = activeSession?.detectedFaultCode || activeSession?.errorCode || errorCode || 'Alarm Anomaly';
    const activeSymptom = activeSession?.symptom || symptom;
    const fiveWhyList = (
      hyp.fiveWhyChain && hyp.fiveWhyChain.length > 0
        ? hyp.fiveWhyChain
        : [
            `Why 1: Operational load deviation on ${targetTag}`,
            'Why 2: Boundary fluid starvation & dynamic cavitation',
            'Why 3: Thermal stress erosion on seal faces',
            'Why 4: Dynamic O-ring extrusion and seal leakage',
            `Observed Symptom: ${activeSymptom}`,
          ]
    ).join(' -> ');

    const prompt = `Perform an in-depth Root Cause Failure Analysis (RCFA) for industrial equipment ${targetTag} [Fault Code: ${fault}]. Field Symptom: ${activeSymptom}. Primary Root Cause Hypothesis: ${hyp.title}. 5-Why Causal Flow: ${fiveWhyList}. Explain the detailed failure physics, boundary lubrication breakdown, vibration spectral signatures, and OEM manual verification procedures.`;

    sessionStorage.setItem(
      'forgex_copilot_handoff',
      JSON.stringify({
        assetTag: targetTag,
        prompt,
        hypothesisTitle: hyp.title,
      })
    );

    window.history.pushState({}, '', '/ai-copilot');
    window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'copilot' } }));
    window.dispatchEvent(new CustomEvent('forgex:copilot-handoff'));
  };

  // Helper: Detailed 5-Why Engineering Breakdown Data
  const getWhyStepDetails = (
    stepText: string,
    stepIndex: number,
    _totalSteps: number,
    _hyp: any,
    assetTag: string
  ) => {
    const title = stepText.replace(/^Why\s*\d+:\s*/i, '').trim();

    let mechanism = `Operational load deviation on ${assetTag} creates localized turbulence and thermal dissipation failure.`;
    if (stepIndex === 0) {
      mechanism = `Operating boundary excursion on ${assetTag} exceeds design envelope.`;
    } else if (stepIndex === 1) {
      mechanism = `Fluid film starvation induces vapor bubble inception and implosive micro-jets.`;
    } else if (stepIndex === 2) {
      mechanism = `Interfacial friction creates thermal stress erosion and micro-pitting on wear faces.`;
    } else if (stepIndex === 3) {
      mechanism = `Elastomeric O-rings undergo dynamic extrusion and compression set under temperature.`;
    } else if (stepIndex >= 4) {
      mechanism = `Primary containment breach causes vibration harmonic resonance and leakage.`;
    }

    let verification = `Measure vibration velocity (in/sec RMS) and compare FFT spectral peaks against baseline.`;
    if (stepIndex === 0) {
      verification = `Review DCS/SCADA trend logs for pressure fluctuations and motor current draw.`;
    } else if (stepIndex === 1) {
      verification = `Conduct ultrasonic contact probe inspection in 30-40 kHz range for cavitation.`;
    } else if (stepIndex === 2) {
      verification = `Inspect seal flush differential pressure and verify seal temperature with IR pyrometer.`;
    } else if (stepIndex === 3) {
      verification = `Perform optical leak inspection and measure radial shaft runout (< 0.05 mm).`;
    } else if (stepIndex >= 4) {
      verification = `Perform dye penetrant test and measure fluid loss rate against environmental limits.`;
    }

    let reference = `ISO 10816-3 Vibration Severity Zone C/D threshold; API 610 §6.8.3 mechanical seal piping plan requirements.`;
    if (stepIndex === 0) {
      reference = `OEM Operations Manual §3.2 (Operating Window & NPSH Margins); Hydraulic Institute HI 9.6.1.`;
    } else if (stepIndex === 1) {
      reference = `API 682 4th Ed. §4.1 (Cavitation Suppression & Minimum Flow Orifice Sizing); ISO 13709.`;
    } else if (stepIndex === 2) {
      reference = `API 682 Category 2/3 Seal Chamber Thermal Guidelines; ASTM C1198 Silicon Carbide Face Limits.`;
    } else if (stepIndex === 3) {
      reference = `OEM Assembly Manual §5.4 (Shaft Runout Tolerances < 0.05mm); ASTM D395 Elastomer Compression Set.`;
    } else if (stepIndex >= 4) {
      reference = `Plant Environmental & Safety LOTO Standard SOP-MNT-402; OSHA 1910.147 Zero-Energy Isolation.`;
    }

    return {
      label: stepText.startsWith('Why') ? stepText.split(':')[0] : `Why #${stepIndex + 1}`,
      title,
      mechanism,
      verification,
      reference,
    };
  };

  // Previous RCA session reloader is declared above via handleLoadSession



  // Quick Action 2: Save Finding to Expert Knowledge & Force Direct Redirect
  const handleSaveToExpertKnowledge = async () => {
    if (!activeSession) return;
    setIsSavingToExpert(true);

    try {
      const topHypothesis =
        activeSession.hypotheses.find((h) => h.status === 'CONFIRMED') ||
        activeSession.hypotheses[0];
      if (!topHypothesis) {
        throw new Error('No root cause hypothesis available.');
      }

      const rawTag = activeSession.assetTag || selectedMachineTag || 'ASSET';
      const cleanTag = formatCleanMachineName(rawTag);
      const cleanTitle = formatCleanNoteTitle(topHypothesis.title, cleanTag);
      const cleanFix = topHypothesis.recommendedFix
        ? cleanRemediationText(topHypothesis.recommendedFix)
        : cleanRemediationText(topHypothesis.mechanismExplanation || '');

      const newExpertNote = {
        id: `note-rca-${Date.now()}`,
        title: cleanTitle,
        assetTag: cleanTag,
        machineName: cleanTag,
        category: 'Troubleshooting Trick',
        severity:
          topHypothesis.severity === 'CRITICAL'
            ? 'Critical Machine Warning'
            : 'Pro-Tip / Best Practice',
        symptom: cleanTriggerText(activeSession.symptom, null, cleanTitle),
        taskDuringIssue: 'Standard Plant Operation / AI RCA Diagnostic',
        observedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        description: cleanFix || topHypothesis.recommendedFix || topHypothesis.mechanismExplanation || '',
        content: cleanFix || topHypothesis.recommendedFix || topHypothesis.mechanismExplanation || '',
        status: 'APPROVED',
        author: user?.fullName || 'Plant Specialist',
      };

      // 1. Direct persistence to localStorage for instantaneous cross-tab visibility
      try {
        const stored = localStorage.getItem('forgex_expert_notes');
        const list = stored ? JSON.parse(stored) : [];
        list.unshift(newExpertNote);
        localStorage.setItem('forgex_expert_notes', JSON.stringify(list));
      } catch (errLocal) {
        console.warn('Could not cache expert note to localStorage:', errLocal);
      }

      // 2. Best-effort post to backend library
      apiFetch('/api/v1/recovery/expert-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: [newExpertNote],
        }),
      }).catch(() => null);

      // 3. Dispatch real-time note creation event
      try {
        window.dispatchEvent(new CustomEvent('forgex:expert-note-created', { detail: newExpertNote }));
      } catch {}

      toast.success(
        'Saved to Expert Knowledge Repository!',
        'Redirecting to Expert Knowledge...'
      );

      // 4. Guaranteed 3-Way Navigation Redirect to Expert Knowledge:
      // a) Call parent props
      onNavigate?.('expert-knowledge');
      onNavigate?.('expert');
      setParentActiveTab?.('expert-knowledge');
      setParentActiveTab?.('expert');

      // b) Dispatch global cross-module navigation events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('navigate-to-module', { detail: 'expert-knowledge' }));
        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'expert-knowledge' }));
        window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'expert', tab: 'expert-knowledge' } }));
        window.location.hash = '#expert-knowledge';
      }

      // c) Programmatically trigger sidebar button click fallback
      setTimeout(() => {
        const sidebarBtn = Array.from(document.querySelectorAll('button, a')).find((el) =>
          /expert knowledge|tribal/i.test(el.textContent || '')
        ) as HTMLElement | undefined;
        if (sidebarBtn) {
          sidebarBtn.click();
        }
      }, 50);
    } catch (err: any) {
      toast.error('Save Failed', err.message || 'Could not save to expert knowledge.');
    } finally {
      setIsSavingToExpert(false);
    }
  };

  // Open Escalation Modal with Pre-filled Context (Binds directly to Left Panel symptom and top AI root cause)
  const handleOpenEscalateModal = () => {
    if (!activeSession) return;
    const currentSymptom = activeSession.symptom?.trim() || symptom?.trim() || '';
    const topHyp =
      activeSession.hypotheses?.find((h) => h.status === 'CONFIRMED') ||
      activeSession.hypotheses?.[0];

    const failedStep = activeSession.investigationSteps?.find((s) => s.status === 'FAIL');
    setFailedStepForEscalation(failedStep || null);

    const activeFault =
      activeSession.detectedFaultCode || activeSession.errorCode || errorCode || '';
    const topFix = toShortSentence(topHyp?.recommendedFix, 14) || 'Inspect component and replace worn assembly to spec.';
    const prefill = `• Symptom: ${currentSymptom}${activeFault ? ` (${activeFault})` : ''}\n• Suspected Cause & Fix: ${topHyp?.title || 'Operational Anomaly'} — ${topFix}`;

    // Reset dropdowns to ensure clean unselected start
    setEscalateDiscipline(failedStep ? 'Mechanical / Rotating Equipment Lead' : '');
    setEscalateSeverity(failedStep ? 'CRITICAL' : '');
    setIsLotoApplied(null);
    setEscalateNotes(prefill);
    setIsEscalateOpen(true);
  };

  // Specialist Escalation Ticket Submission with Robust Fallback & Cross-Module Sync
  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) {
      toast.error('Validation Error', 'An active RCA investigation is required to dispatch an escalation ticket.');
      return;
    }
    if (!escalateDiscipline) {
      toast.error('Validation Error', 'Please select a specialist discipline.');
      return;
    }
    if (!escalateSeverity) {
      toast.error('Validation Error', 'Please select a ticket priority.');
      return;
    }
    if (isLotoApplied === null) {
      toast.error('Validation Error', 'Please specify whether Machine Safe / LOTO is applied.');
      return;
    }

    const targetTag = activeSession.assetTag || selectedMachineTag || 'GEN-DIESEL-101';
    const engineerName = user?.fullName || (user as any)?.name || user?.email || 'Authorized Engineer';

    setIsEscalating(true);
    try {
      const matchedMachine = machines.find(
        (m) => (m.asset_tag || m.assetTag || m.name || m.id) === targetTag
      );

      const topHyp =
        activeSession.hypotheses?.find((h) => h.status === 'CONFIRMED') ||
        activeSession.hypotheses?.[0];
      const activeFault =
        activeSession.detectedFaultCode || activeSession.errorCode || errorCode || 'ALM-THRM-402';
      const currentSymptom =
        activeSession.symptom?.trim() ||
        symptom?.trim() ||
        'High Vibration, Thermal Spike, Seal Leakage';

      let ticketNum: string | null = null;

      // Compute exact Date & Time formatted: e.g. "24 Oct 2026, 03:58 PM"
      const now = new Date();
      const createdAtFormatted = now.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      const passedCount = activeSession.investigationSteps.filter((s) => s.status === 'PASS').length;
      const totalCount = activeSession.investigationSteps.length;
      const progressStr = `${passedCount}/${totalCount} Steps Verified`;

      // 1. First attempt dedicated RCA escalate endpoint
      try {
        const res = await apiFetch('/api/v1/rca/escalate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSession.id,
            assetTag: targetTag,
            assetName: matchedMachine?.name || activeSession.machineName || targetTag,
            machineId: matchedMachine?.id || undefined,
            machineStatus: activeSession.machineStatus || machineStatus || 'Running - Abnormal',
            faultCode: activeFault,
            symptom: currentSymptom,
            symptomDescription: currentSymptom,
            specialistDiscipline: escalateDiscipline,
            priority: escalateSeverity,
            severity: escalateSeverity,
            lotoApplied: isLotoApplied,
            reportedByRole: 'Maintenance Engineer',
            reportedByUserName: engineerName,
            notes: escalateNotes || `Maintenance Engineer ${engineerName} reported symptom on ${targetTag}: ${currentSymptom}`,
            technicianNotes: escalateNotes || `Maintenance Engineer ${engineerName} reported symptom on ${targetTag}: ${currentSymptom}`,
            topRootCause: topHyp?.title,
            probability: topHyp?.probability,
            recommendedFix: topHyp?.recommendedFix,
            investigationProgress: progressStr,
            plantName: matchedMachine?.plant_area || organization?.name || 'Main Manufacturing Facility',
            createdAtFormatted,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          ticketNum = json.ticketId || json.data?.ticketNumber || null;
        }
      } catch (escErr) {
        console.warn('Dedicated escalate route error, trying /api/v1/tickets fallback', escErr);
      }

      // 2. Fallback to /api/v1/tickets if needed
      if (!ticketNum) {
        const diagnosticSummary = `Equipment: ${targetTag}\nOperating State: ${activeSession.machineStatus || machineStatus}\nFault Code: ${activeFault}\nDiscipline: ${escalateDiscipline}\nLOTO: ${isLotoApplied ? 'YES - Padlocked' : 'NO - Live Running'}\nReported By: Maintenance Engineer / ${engineerName}\nField Symptom: ${currentSymptom}\n${topHyp ? `AI Suspected Cause: ${topHyp.title} (${topHyp.probability}% prob)\n` : ''}Maintenance Engineer Notes: ${escalateNotes}`;

        const fallbackRes = await apiFetch('/api/v1/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plantId: matchedMachine?.plant_area || organization?.id || 'plant-default',
            machineId: matchedMachine?.id || undefined,
            machineAssetTag: targetTag,
            originalQuestion: `Escalated RCA: [${targetTag}] ${topHyp?.title || currentSymptom.slice(0, 80)}`,
            diagnosticDetails: diagnosticSummary,
            severity: escalateSeverity,
            escalationReason: 'RCA_SPECIALIST_DISPATCH',
          }),
        });

        const fbJson = await fallbackRes.json().catch(() => ({}));
        if (fallbackRes.ok && fbJson.success) {
          ticketNum = fbJson.data?.ticketNumber || fbJson.ticketId || null;
        } else if (!fallbackRes.ok) {
          throw new Error(fbJson.message || fbJson.error || 'Failed to dispatch ticket.');
        }
      }

      // If still no ticketNum, generate clean fallback ID
      if (!ticketNum) {
        ticketNum = `ESC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      setEscalatedTicketId(ticketNum);
      setEscalationBanner({
        ticketId: ticketNum,
        discipline: escalateDiscipline,
        severity: escalateSeverity,
      });
      setIsEscalateOpen(false);

      // AI Smart Auto-Assignment: select the best qualified available technician
      const assignedTech = selectBestTechnician(
        {
          assetTag: targetTag,
          title: `[${ticketNum}] ${targetTag}: ${activeFault} (${escalateDiscipline})`,
          symptomDescription: currentSymptom,
          faultCode: activeFault,
        },
        []
      );

      // Build authoritative ticket object matching Raised Tickets & Dispatch schema
      const cleanMachine = formatCleanMachineName(matchedMachine?.name || activeSession.machineName || targetTag);
      const cleanAssetTag = formatCleanMachineName(targetTag);

      const newTicket = {
        id: ticketNum,
        caseNumber: ticketNum,
        assetTag: cleanAssetTag,
        assetId: cleanAssetTag,
        assetName: cleanMachine,
        title: `[${ticketNum}] ${cleanAssetTag}: ${activeFault} (${escalateDiscipline})`,
        description: `Escalated RCA: [${targetTag}] ${topHyp?.title || currentSymptom}\n\nTop Root Cause: ${topHyp?.title || 'Thermal / Mechanical Breakdown'}\nRecommended Fix: ${topHyp?.recommendedFix || 'Execute isolation, LOTO, and specialist overhaul.'}\n\nField Notes: ${escalateNotes || 'Urgent specialist dispatch from RCA Copilot.'}`,
        severity: (escalateSeverity || 'HIGH') as any,
        priority: (escalateSeverity || 'HIGH') as any,
        status: 'IN_PROGRESS' as const,
        symptomDescription: currentSymptom,
        faultCode: activeFault,
        machineStatus: activeSession.machineStatus || machineStatus || 'Running - Abnormal',
        topRootCause: topHyp?.title || 'Mechanical Seal Thermal Breakdown',
        probability: topHyp?.probability || 88,
        recommendedFix: topHyp?.recommendedFix || 'Execute isolation, LOTO, and replace seal face.',
        investigationProgress: progressStr,
        specialistDiscipline: escalateDiscipline,
        lotoApplied: Boolean(isLotoApplied),
        reportedByRole: 'Maintenance Engineer',
        reportedByName: `Maintenance Engineer / ${engineerName}`,
        assignedTechnicianUserId: assignedTech.id,
        assignedTechnicianName: assignedTech.fullName,
        assignedTechnicianRating: assignedTech.rating,
        isAiAutoAssigned: true,
        rcaSessionId: activeSession.id,
        source: 'RCA',
        createdAtFormatted,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checklist: [
          {
            id: 'step-loto-verify',
            stepNumber: 1,
            title: 'Verify Zero-Energy LOTO & Area Safety',
            instruction: `Isolate power source, apply lockout padlocks, tag isolation points, and verify zero electrical/mechanical energy for ${targetTag}.`,
            requiresLoto: Boolean(isLotoApplied),
            status: isLotoApplied ? ('COMPLETED' as const) : ('PENDING' as const),
          },
          {
            id: 'step-component-inspect',
            stepNumber: 2,
            title: 'Component Disassembly & Inspection',
            instruction: `Remove protective housings and inspect seals, bearings, couplings, and electrical terminations for wear.`,
            requiresLoto: false,
            status: 'PENDING' as const,
          },
          {
            id: 'step-remedial-fix',
            stepNumber: 3,
            title: 'Corrective Repair & Replacement Procedure',
            instruction: `Apply recommended fix: ${topHyp?.recommendedFix || 'Execute component replacement and renew lubricants to OEM spec.'}`,
            requiresLoto: false,
            status: 'PENDING' as const,
          },
          {
            id: 'step-qa-verify',
            stepNumber: 4,
            title: 'Functional Re-Commissioning & QA Verification',
            instruction: `Perform run-test, verify baseline vibration & temperature sensors, and record final sign-off.`,
            requiresLoto: false,
            status: 'PENDING' as const,
          },
        ],
        history: [
          {
            id: `h-${Date.now()}`,
            action: 'CASE_ESCALATED_FROM_RCA',
            user: engineerName,
            timestamp: new Date().toISOString(),
            notes: `Escalated directly from RCA Copilot for ${escalateDiscipline}. Auto-assigned to ${assignedTech.fullName} (⭐ ${assignedTech.rating}).`,
          },
        ],
      };

      // Persist to shared store in localStorage & sessionStorage for bulletproof cross-module synchronization
      try {
        const existingRaw = localStorage.getItem('forgex_shared_raised_tickets');
        const existingList = existingRaw ? JSON.parse(existingRaw) : [];
        const filtered = existingList.filter((t: any) => t.id !== ticketNum && t.caseNumber !== ticketNum);
        filtered.unshift(newTicket);
        localStorage.setItem('forgex_shared_raised_tickets', JSON.stringify(filtered));
      } catch (errShared) {
        console.warn('Could not cache to forgex_shared_raised_tickets:', errShared);
      }

      sessionStorage.setItem('forgex_selected_case_id', ticketNum);

      // Mark current session as escalated and persist
      const updatedSession: any = {
        ...activeSession,
        isEscalated: true,
        escalatedTicketId: ticketNum,
        status: 'ESCALATED',
        updatedAt: new Date().toISOString(),
      };
      setActiveSession(updatedSession);
      persistSession(updatedSession);

      // Immediately navigate directly to Raised Tickets with this newly escalated ticket visible and selected at the top
      window.dispatchEvent(
        new CustomEvent('forgex:navigate', {
          detail: {
            module: 'maintenance',
            caseId: ticketNum,
            ticket: newTicket,
          },
        })
      );

      if (onNavigateToSop) {
        onNavigateToSop();
      }

      toast.success(
        'Specialist Ticket Escalated & Dispatched',
        `Ticket #${ticketNum} auto-assigned to ${assignedTech.fullName} and opened in Raised Tickets.`
      );
    } catch (err: any) {
      toast.error('Escalation Failed', err.message || 'Could not dispatch specialist ticket.');
    } finally {
      setIsEscalating(false);
    }
  };

  // Progress metrics for checklist
  const passedStepsCount =
    activeSession?.investigationSteps.filter((s) => s.status === 'PASS').length || 0;
  const totalStepsCount = activeSession?.investigationSteps.length || 0;
  const progressPercent = totalStepsCount > 0 ? Math.round((passedStepsCount / totalStepsCount) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full h-full flex flex-col bg-[#F8FAFC]">
      {/* Top Banner Toolbar */}
      {!activeSession ? (
        <div className="py-3 px-4 md:px-6 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap w-full shrink-0">
          <div>
            <h2 className="text-base font-bold font-mono text-[#0F172A] uppercase tracking-wide whitespace-nowrap shrink-0">
              ROOT CAUSE ANALYSIS & DIAGNOSTIC COPILOT
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5 font-sans">
              Diagnostic reasoning grounded in Knowledge Hub manuals, maintenance engineer field notes, and failure logs.
            </p>
          </div>

          {/* Interactive Navbar Status Pills (Hidden Recent RCAs when !activeSession) */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-mono font-semibold flex items-center gap-1.5 shadow-2xs">
              ✨ AI Engine Online
            </span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-mono font-semibold flex items-center gap-1.5 shadow-2xs">
              📚 Manuals & Field Notes Synced
            </span>
          </div>
        </div>
      ) : (
        <div className="py-2.5 px-4 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-3 flex-wrap xl:flex-nowrap w-full shrink-0">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <h2 className="text-base font-bold font-mono text-[#0F172A] uppercase tracking-wide whitespace-nowrap shrink-0">
              ROOT CAUSE ANALYSIS & DIAGNOSTIC COPILOT
            </h2>
            <span className="hidden xl:inline-block text-[11px] text-[#64748B] font-sans truncate">
              — Machine: <strong className="text-slate-800 font-mono">{formatCleanMachineName(activeSession.assetTag)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap shrink-0">
            {/* Start New Investigation Button (Fixed single icon + interactive indigo pill) */}
            <button
              type="button"
              onClick={handleStartNewInvestigation}
              className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-xs font-mono font-bold text-indigo-700 flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap shrink-0 cursor-pointer group"
              title="Reset active investigation to clean empty state"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600 group-hover:text-white transition-colors shrink-0" />
              <span className="whitespace-nowrap">New Investigation</span>
            </button>

            {/* Recent RCAs Dropdown Selector */}
            <div className="relative shrink-0" ref={historyDropdownRef}>
              <button
                type="button"
                onClick={() => setIsHistoryDropdownOpen(!isHistoryDropdownOpen)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-mono font-medium text-slate-700 flex items-center gap-1.5 transition shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="whitespace-nowrap">Recent RCAs ({recentSessions.length})</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {isHistoryDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-84 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs animate-in fade-in slide-in-from-top-1">
                  <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between font-mono font-bold text-[10px] uppercase text-slate-400">
                    <span>Previous Investigations</span>
                    <span>{recentSessions.length} total</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {recentSessions.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 font-mono text-xs">
                        No previous RCA investigations found.
                      </div>
                    ) : (
                      recentSessions.map((session) => {
                        const isLocked = checkIsRcaLocked(session);
                        return (
                          <div
                            key={session.id}
                            onClick={() => handleLoadSession(session)}
                            className="w-full text-left p-2.5 hover:bg-blue-50/70 transition flex items-center justify-between gap-2 group cursor-pointer"
                          >
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-blue-700">
                                  {session.assetTag}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {session.createdAt?.split('T')[0]}
                                </span>
                              </div>
                              {session.detectedFaultCode && (
                                <span className="text-[10px] font-mono font-semibold text-rose-600 truncate">
                                  {session.detectedFaultCode}
                                </span>
                              )}
                              <p className="text-slate-600 text-[11px] truncate">{session.symptom}</p>
                            </div>
                            {isLocked ? (
                              <span
                                title="Locked — Linked to Active Ticket/History"
                                className="p-1 text-slate-400 cursor-not-allowed shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                title="Delete this RCA record"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteRcaConfirmation({ isOpen: true, session });
                                }}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Segmented Switch: RCA Matrix / Investigation Steps */}
            <div className="flex items-center rounded-lg border border-[#CBD5E1] bg-slate-100 p-0.5 text-xs font-mono font-medium shrink-0">
              <button
                onClick={() => setActiveTab('rca')}
                className={`px-3 py-1.5 rounded-md transition whitespace-nowrap shrink-0 ${
                  activeTab === 'rca'
                    ? 'bg-white text-slate-900 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                RCA Matrix ({activeSession.hypotheses.length})
              </button>
              <button
                onClick={() => setActiveTab('steps')}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'steps'
                    ? 'bg-white text-slate-900 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="whitespace-nowrap">Investigation Steps</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full font-bold whitespace-nowrap shrink-0">
                  {passedStepsCount}/{totalStepsCount}
                </span>
              </button>
            </div>

            {/* Escalate Ticket to Technician Button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenEscalateModal}
              disabled={!activeSession}
              className={`text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed ${
                escalatedTicketId ? 'ring-2 ring-emerald-500' : ''
              }`}
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {escalatedTicketId ? `Dispatched (${escalatedTicketId})` : 'Escalate Ticket to Technician'}
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Banner for Dispatched Specialist Ticket */}
      {escalationBanner && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between text-xs font-mono text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Specialist Ticket <strong>#{escalationBanner.ticketId}</strong> successfully dispatched to{' '}
              <strong>{escalationBanner.discipline}</strong> ({escalationBanner.severity} Priority).
            </span>
          </div>
          <button
            onClick={() => setEscalationBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Panel: Machine Context, Status & Quick Symptom Chips */}
        <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white p-4 overflow-y-auto space-y-2.5 shrink-0 shadow-sm flex flex-col">
          <div className="space-y-2.5">
            {/* Target Asset / Machine Field (Strictly Uploaded Machines) */}
            <div>
              <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-1">
                Target Asset / Machine <span className="text-rose-500">*</span>
              </label>

              {isLoadingMachines ? (
                <div className="py-2 text-xs font-mono text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Loading ingested assets...</span>
                </div>
              ) : hasNoDocuments || machines.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1 font-sans">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-[11px] text-amber-800 uppercase">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>No Ingested Machine Documents</span>
                  </div>
                  <p className="leading-snug text-[10px]">
                    No equipment documentation exists in Knowledge Hub yet. Ingest an OEM manual or SOP first to run grounded AI diagnostics.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedMachineTag}
                  onChange={(e) => setSelectedMachineTag(e.target.value)}
                  className="w-full py-1.5 px-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-mono font-bold text-[#0F172A] focus:outline-none focus:border-[#2563EB] cursor-pointer"
                >
                  <option value="">-- Select Uploaded Machine --</option>
                  {machines.map((m) => {
                    const tag = m.asset_tag || m.assetTag || m.name || m.id;
                    return (
                      <option key={m.id} value={tag}>
                        {tag} {m.name && m.name !== tag ? `— ${m.name}` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Machine Status - Clean Full-Width Row */}
            <div>
              <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-1">
                Machine Status
              </label>
              <select
                value={machineStatus}
                onChange={(e) => setMachineStatus(e.target.value as any)}
                className="w-full py-1.5 px-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-sans font-medium text-[#0F172A] focus:outline-none focus:border-[#2563EB] cursor-pointer"
              >
                <option value="">-- Select Machine Status --</option>
                <option value="Running - Abnormal">Running - Abnormal</option>
                <option value="Tripped / Offline">Tripped / Offline</option>
                <option value="Startup Failure">Startup Failure</option>
              </select>
            </div>

            {/* Fault / Alarm Code - Full-Width Interactive Input with AI Auto-Detect Badge */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider">
                  Fault / Alarm Code
                </label>
                <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  AI Auto-Detect
                </span>
              </div>
              <div className="relative">
                <Zap className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="text"
                  value={errorCode}
                  onChange={(e) => setErrorCode(e.target.value)}
                  placeholder="Optional: PLC code or blank for AI auto-detection"
                  className="w-full py-1.5 pl-8 pr-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-mono font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Field Symptom Description & Quick Chips */}
            <div>
              <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-1">
                Field Symptom Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Describe acoustic noise, thermal spike, vibration harmonics, or fluid seal leaks..."
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-sans leading-relaxed"
              />

              {/* Quick Symptom Chips */}
              <div className="mt-1.5 space-y-1">
                <span className="text-[9px] font-mono text-slate-400 block uppercase">
                  Quick Symptom Chips:
                </span>
                <div className="flex flex-wrap gap-1">
                  {QUICK_SYMPTOM_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddSymptomChip(chip)}
                      className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 transition active:scale-95 flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>{chip}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Run RCA Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !symptom.trim() || hasNoDocuments || machines.length === 0}
              className="w-full py-2 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg border-0 cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Synthesizing Equipment Records...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Run AI Root Cause Analysis</span>
                </>
              )}
            </button>

            {analysisError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}

            {/* Compact Evidence Traceability Box */}
            <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-200 text-[10px] text-slate-600 space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold text-blue-700 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Evidence Traceability Model</span>
              </div>
              <p className="leading-snug">
                Root causes are synthesized strictly against technical manuals, senior technician field notes, and past work orders.
              </p>
            </div>
          </div>
        </div>

        {/* Right Pane: Ranked Root Causes (Matrix) or Investigation Steps */}
        <div className="flex-1 min-h-0 min-w-0 p-5 md:p-6 overflow-y-auto space-y-6 w-full flex flex-col">
          {!activeSession ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-b from-white via-indigo-50/20 to-white rounded-xl border border-indigo-100/90 hover:border-indigo-300 space-y-6 max-w-3xl mx-auto my-auto shadow-sm hover:shadow-md transition-all duration-200 w-full relative overflow-hidden group">
              {/* Top gradient accent strip */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 to-cyan-400" />

              <div className="flex flex-col items-center text-center space-y-3 max-w-lg">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-xs">
                  <HelpCircle className="w-7 h-7 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">No Active RCA Investigation</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed font-sans">
                    Select an asset and describe observed symptoms in the left panel to run a new analysis, or click any recent investigation below to reload previous findings instantly.
                  </p>
                </div>
              </div>

              {/* Recent / Past RCA Investigations inside Empty State */}
              <div className="w-full pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 uppercase tracking-wider relative">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="flex items-center gap-1.5 text-slate-800">
                      <History className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Recent / Past RCA Investigations</span>
                    </span>

                    {/* More Recent RCAs Dropdown if > 2 */}
                    {recentSessions.length > 2 && (
                      <div className="relative" ref={moreRecentDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsMoreRecentOpen(!isMoreRecentOpen)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-mono font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap"
                        >
                          <span>📂 More Recent RCAs (+{recentSessions.length - 2})</span>
                          <ChevronDown className="w-3 h-3 text-indigo-500" />
                        </button>

                        {isMoreRecentOpen && (
                          <div className="absolute left-0 mt-1.5 w-84 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs normal-case font-normal animate-in fade-in slide-in-from-top-1">
                            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between font-mono font-bold text-[10px] uppercase text-slate-400">
                              <span>Additional Investigations</span>
                              <span>{recentSessions.length - 2} older</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                              {recentSessions.slice(2).map((session) => (
                                <div
                                  key={session.id}
                                  onClick={() => {
                                    handleLoadSession(session);
                                    setIsMoreRecentOpen(false);
                                  }}
                                  className="w-full text-left p-2.5 hover:bg-indigo-50/70 transition flex items-center justify-between gap-2 group cursor-pointer"
                                >
                                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono font-bold text-indigo-700">
                                        {session.assetTag}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {session.createdAt?.split('T')[0]}
                                      </span>
                                    </div>
                                    {session.detectedFaultCode && (
                                      <span className="text-[10px] font-mono font-semibold text-rose-600 truncate">
                                        {session.detectedFaultCode}
                                      </span>
                                    )}
                                    <p className="text-slate-600 text-[11px] truncate">{session.symptom}</p>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-transform shrink-0" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                    {recentSessions.length} total
                  </span>
                </div>

                {isLoadingRecents ? (
                  <div className="p-8 text-center text-xs font-mono text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Loading past investigations...</span>
                  </div>
                ) : recentSessions.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
                    No recent investigations recorded. Select an equipment asset and run analysis to begin.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-left">
                    {recentSessions.slice(0, 2).map((s) => {
                      const allPassed =
                        s.status === 'VERIFIED_CLOSED' ||
                        s.isLocked ||
                        (s.investigationSteps &&
                          s.investigationSteps.length > 0 &&
                          s.investigationSteps.every((st) => st.status === 'PASS'));
                      const isLocked = checkIsRcaLocked(s);
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleLoadSession(s)}
                          className="p-3.5 rounded-xl border border-indigo-100/90 hover:border-indigo-400 bg-white hover:bg-gradient-to-br hover:from-white hover:to-indigo-50/30 text-xs space-y-2 transition-all duration-200 text-left shadow-2xs hover:shadow-md hover:-translate-y-0.5 group cursor-pointer relative overflow-hidden"
                        >
                          {/* Top gradient accent strip on card */}
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-600 to-cyan-400 opacity-80 group-hover:opacity-100 transition-opacity" />

                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-blue-700 text-sm group-hover:underline">
                              {s.assetTag}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                                  allPassed
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {allPassed ? '100% Verified' : 'In Progress'}
                              </span>
                              {isLocked ? (
                                <span
                                  title="Locked — Linked to Active Ticket/History"
                                  className="p-1 text-slate-400 cursor-not-allowed"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  title="Delete this RCA record"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteRcaConfirmation({ isOpen: true, session: s });
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {s.detectedFaultCode && (
                            <div className="text-[11px] font-mono font-bold text-rose-600 flex items-start gap-1.5 leading-snug">
                              <Zap className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                              <span className="break-words">{s.detectedFaultCode}</span>
                            </div>
                          )}

                          <p className="text-slate-600 text-xs font-sans leading-relaxed line-clamp-2">
                            {s.symptom}
                          </p>

                          <div className="pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Recent'}</span>
                            <span className="text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                              Load Investigation →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 flex-1">
              {/* Active Case Top Summary - Deep Navy-to-Indigo Gradient Header */}
              <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-4 rounded-xl shadow-sm border border-indigo-950/60 overflow-hidden space-y-2.5">
                {/* Row 1: Machine Tag & Name (Left) and Action Buttons (Right) */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="font-mono font-bold text-base text-white tracking-wide">
                      {formatCleanMachineName(activeSession.assetTag)}
                    </span>
                    <span className="text-xs text-indigo-200/90 font-sans font-medium">
                      • Automated Root Cause Diagnostics &amp; Remediation Protocol
                    </span>
                  </div>

                  {/* Right: Action Buttons without double icons */}
                  <div className="flex flex-row flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsLotoModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 text-xs font-mono font-bold text-amber-200 flex items-center gap-1.5 transition shadow-xs whitespace-nowrap cursor-pointer backdrop-blur-sm"
                      title="View OSHA 1910.147 LOTO & PPE Isolation Points"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>LOTO & PPE Checklist</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportRcaSummary}
                      className="px-3 py-1.5 rounded-lg border border-indigo-300/30 bg-white/10 hover:bg-white/20 text-xs font-mono font-semibold text-white flex items-center gap-1.5 transition shadow-xs whitespace-nowrap cursor-pointer backdrop-blur-sm"
                      title="Download professional PDF RCA summary report"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                      <span>Export RCA Summary</span>
                    </button>
                  </div>
                </div>

                {/* Row 2: All 3 Telemetry Pills Inline on One Single Row */}
                <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-indigo-900/40">
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800/90 text-slate-200 border border-slate-700 font-medium whitespace-nowrap shrink-0">
                    State: {activeSession.machineStatus || 'Running'}
                  </span>
                  {activeSession.detectedFaultCode && (
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold whitespace-nowrap shrink-0">
                      Alarm: {activeSession.detectedFaultCode.replace(/^FAULT\s*\/\s*ALARM\s*CODE:\s*/i, '')}
                    </span>
                  )}
                  {activeSession.symptom && (
                    <span
                      className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-medium whitespace-nowrap truncate max-w-md"
                      title={activeSession.symptom}
                    >
                      Symptom: {activeSession.symptom}
                    </span>
                  )}
                </div>
              </div>

              {/* RCA Matrix Tab: Ranked Hypotheses */}
              {activeTab === 'rca' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                      Ranked Root Cause Hypotheses ({activeSession.hypotheses.length})
                    </h3>
                  </div>

                  <div className="space-y-3.5">
                    {(() => {
                      const hasConfirmedHypothesis = activeSession.hypotheses.some(
                        (h) => h.status === 'CONFIRMED'
                      );
                      return activeSession.hypotheses.map((hyp, index) => {
                        const isWhyOpen = !!expandedWhyCards[hyp.id];
                        const isToolsOpen = !!expandedToolsCards[hyp.id];
                        const chain =
                          hyp.fiveWhyChain && hyp.fiveWhyChain.length > 0
                            ? hyp.fiveWhyChain
                            : [
                                `Why 1: Operational load deviation on ${activeSession.assetTag}`,
                                'Why 2: Boundary fluid starvation & dynamic cavitation',
                                'Why 3: Thermal stress erosion on silicon carbide seal faces',
                                'Why 4: Dynamic O-ring extrusion and seal leakage',
                                `Observed Symptom: ${activeSession.symptom}`,
                              ];
                        const toolsCount = (hyp.requiredTools?.length || 4);
                        const partsCount = (hyp.spareParts?.length || 3);

                        return (
                          <div
                            key={hyp.id}
                            className={`rounded-xl border p-3.5 transition-all duration-200 bg-white shadow-xs space-y-2.5 ${
                              hyp.status === 'CONFIRMED'
                                ? 'ring-2 ring-indigo-600 bg-gradient-to-br from-white to-indigo-50/40 border-indigo-500 shadow-md'
                                : hasConfirmedHypothesis
                                ? 'blur-[1.5px] opacity-45 hover:blur-none hover:opacity-95 border-slate-200 bg-slate-50/80'
                                : hyp.status === 'RULED_OUT'
                                ? 'opacity-60 border-slate-200 bg-slate-50'
                                : 'border-[#E2E8F0] hover:border-indigo-300'
                            }`}
                          >
                            {/* Top Row: Rank Badge (Gradient), Title, Severity, Confidence Progress Bar & Confirm / Rule Out */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-gradient-to-r from-slate-900 to-indigo-900 text-white flex items-center justify-center text-[10px] font-mono font-bold shrink-0 shadow-2xs">
                                  #{index + 1}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900 break-words leading-snug">
                                  {hyp.title}
                                </h4>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                {/* Severity Pill */}
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                                    hyp.severity === 'CRITICAL'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : hyp.severity === 'HIGH'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  {hyp.severity}
                                </span>

                                {/* Confidence Progress */}
                                <div className="flex items-center gap-1.5 font-mono text-xs">
                                  <div className="w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        hyp.probability >= 80
                                          ? 'bg-gradient-to-r from-indigo-500 to-blue-500'
                                          : hyp.probability >= 60
                                          ? 'bg-amber-500'
                                          : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${hyp.probability}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-slate-700">{hyp.probability}%</span>
                                </div>

                                {/* Confirm / Rule Out Action Buttons (Fixed clean single checkmark) */}
                                <div className="flex items-center gap-1 font-mono text-xs">
                                  {hyp.status === 'CONFIRMED' ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white border border-indigo-500 text-[10px] font-mono font-bold flex items-center shadow-xs">
                                      <span>✓ CONFIRMED PRIMARY CAUSE</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setHypothesisStatus(hyp.id, 'CONFIRMED')}
                                      className="px-2 py-0.5 rounded border transition bg-white text-slate-700 border-slate-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 text-[11px] font-semibold cursor-pointer active:scale-95 shadow-2xs"
                                    >
                                      Confirm
                                    </button>
                                  )}
                                <button
                                  type="button"
                                  onClick={() => setHypothesisStatus(hyp.id, 'RULED_OUT')}
                                  className={`px-2 py-0.5 rounded border transition text-[11px] cursor-pointer ${
                                    hyp.status === 'RULED_OUT'
                                      ? 'bg-rose-600 text-white border-rose-600 font-bold'
                                      : 'bg-white text-slate-500 border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                                  }`}
                                >
                                  Rule Out
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Compact Sub-Row: MTTR, Skill, Risk */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                              <Clock className="w-2.5 h-2.5 text-blue-600" />
                              <span>MTTR: <strong>{hyp.mttr || '45–60 mins'}</strong></span>
                            </span>

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <GraduationCap className="w-2.5 h-2.5 text-indigo-500" />
                              <span>Skill: <strong>{hyp.requiredSkill || 'L2 Mechanical'}</strong></span>
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                                (hyp.downtimeRisk || 'High').toLowerCase() === 'critical'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : (hyp.downtimeRisk || 'High').toLowerCase() === 'high'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              <span>Risk: <strong>{hyp.downtimeRisk || 'High'}</strong></span>
                            </span>
                          </div>

                          {/* 2-Column Mini Grid for Mechanism and Recommended Fix */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 my-2.5">
                            {/* Left Box: Failure Mechanism */}
                            <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-lg flex flex-col justify-between gap-1">
                              <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                ⚙️ FAILURE MECHANISM
                              </span>
                              <p className="text-xs text-slate-800 font-sans leading-relaxed">
                                {cleanMechanism(hyp.mechanismExplanation)}
                              </p>
                            </div>

                            {/* Right Box: Recommended Field Fix */}
                            <div className="bg-indigo-50/50 border border-indigo-100 p-2.5 rounded-lg flex flex-col justify-between gap-1">
                              <span className="text-[10px] font-mono font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                                🔧 RECOMMENDED FIELD FIX
                              </span>
                              <p className="text-xs text-slate-800 font-sans leading-relaxed font-medium">
                                {cleanFieldFix(hyp.recommendedFix)}
                              </p>
                            </div>
                          </div>

                          {/* Collapsible Drawer Toggle Bar */}
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* 5-Why Toggle Button */}
                              <button
                                type="button"
                                onClick={() => toggleCardDrawer(hyp.id, 'why')}
                                className={`text-[11px] font-mono px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer ${
                                  isWhyOpen
                                    ? 'bg-blue-50 text-blue-800 border-blue-300 font-bold'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                                }`}
                              >
                                <GitBranch className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>View 5-Why Chain ({chain.length} steps)</span>
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${isWhyOpen ? 'rotate-180 text-blue-700' : 'text-slate-400'}`}
                                />
                              </button>

                              {/* Tools & Parts Toggle Button */}
                              <button
                                type="button"
                                onClick={() => toggleCardDrawer(hyp.id, 'tools')}
                                className={`text-[11px] font-mono px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer ${
                                  isToolsOpen
                                    ? 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                                }`}
                              >
                                <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Tools & Parts ({toolsCount + partsCount})</span>
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${isToolsOpen ? 'rotate-180 text-amber-700' : 'text-slate-400'}`}
                                />
                              </button>
                            </div>

                            {/* Deep-Dive in AI Copilot */}
                            <button
                              type="button"
                              onClick={() => handleDeepDiveInCopilot(hyp)}
                              className="text-[11px] font-mono font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md transition flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer ml-auto"
                              title="Pass complete 5-Why context directly to AI Copilot"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>Deep-Dive in AI Copilot →</span>
                            </button>
                          </div>

                          {/* Collapsible 5-Why Drawer - Connected Horizontal Flow Grid */}
                          {isWhyOpen && (
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3 space-y-2.5 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-800 uppercase tracking-wide">
                                <span className="flex items-center gap-1.5">
                                  <GitBranch className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  5-Why Causal Flow Chain
                                </span>
                                <span className="text-slate-500 font-normal lowercase">click any step to inspect physics</span>
                              </div>

                              {/* Connected Horizontal Flow Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 my-1">
                                {chain.map((step, sIdx, arr) => {
                                  const isLast = sIdx === arr.length - 1;
                                  const isSelected =
                                    selectedWhyStep?.hypId === hyp.id &&
                                    selectedWhyStep?.stepIndex === sIdx;
                                  const badgeLabel = isLast ? '🎯 Root Cause' : `Why ${sIdx + 1}`;
                                  const stepContent = step.replace(/^(Why \d+:|Observed Symptom:)\s*/i, '');

                                  return (
                                    <button
                                      key={sIdx}
                                      type="button"
                                      onClick={() => handleToggleWhyStep(hyp.id, sIdx)}
                                      title="Click to inspect physical failure mechanism, verification method, and reference"
                                      className={`relative p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-2xs ${
                                        isSelected
                                          ? 'ring-2 ring-indigo-600 border-indigo-500 bg-indigo-50/90 font-bold scale-[1.02]'
                                          : isLast
                                          ? 'bg-gradient-to-b from-rose-50/60 to-white border-rose-200 hover:border-rose-300'
                                          : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1 w-full">
                                        <span
                                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                            isLast
                                              ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-2xs'
                                              : isSelected
                                              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-2xs'
                                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                                          }`}
                                        >
                                          {badgeLabel}
                                        </span>
                                        {sIdx < arr.length - 1 && (
                                          <ChevronRight className="w-3 h-3 text-slate-400 hidden lg:inline-block shrink-0" />
                                        )}
                                      </div>
                                      <p className="text-[11px] font-sans text-slate-800 leading-snug line-clamp-3">
                                        {stepContent}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Inline 5-Why Step Inspector */}
                              {selectedWhyStep?.hypId === hyp.id && (() => {
                                const stepText = chain[selectedWhyStep.stepIndex] || `Stage ${selectedWhyStep.stepIndex + 1}`;
                                const details = getWhyStepDetails(
                                  stepText,
                                  selectedWhyStep.stepIndex,
                                  chain.length,
                                  hyp,
                                  activeSession.assetTag
                                );

                                return (
                                  <div className="mt-2 p-2.5 rounded-lg border border-blue-200 bg-white text-xs space-y-2 font-sans animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between pb-1.5 border-b border-blue-100">
                                      <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-blue-900 uppercase">
                                        <span>🔬 Step Breakdown:</span>
                                        <span className="text-slate-900 font-semibold">{stepText}</span>
                                      </div>
                                      <span className="text-[10px] font-mono text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-bold">
                                        Stage {selectedWhyStep.stepIndex + 1} of {chain.length}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-0.5">
                                      <div className="p-2 rounded bg-slate-50 border border-slate-200 space-y-1">
                                        <div className="text-[10px] font-mono font-bold text-slate-700 uppercase">
                                          ⚡ 1. Failure Mechanism
                                        </div>
                                        <p className="text-slate-700 text-[11px] leading-relaxed">
                                          {details.mechanism}
                                        </p>
                                      </div>

                                      <div className="p-2 rounded bg-slate-50 border border-slate-200 space-y-1">
                                        <div className="text-[10px] font-mono font-bold text-slate-700 uppercase">
                                          🔍 2. Field Verification
                                        </div>
                                        <p className="text-slate-700 text-[11px] leading-relaxed">
                                          {details.verification}
                                        </p>
                                      </div>

                                      <div className="p-2 rounded bg-slate-50 border border-slate-200 space-y-1">
                                        <div className="text-[10px] font-mono font-bold text-slate-700 uppercase">
                                          📖 3. Reference
                                        </div>
                                        <p className="text-slate-800 text-[11px] leading-relaxed font-mono">
                                          {details.reference}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* 🧰 Collapsible Tools & Parts Drawer (Hidden by default) */}
                          {isToolsOpen && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs animate-in fade-in duration-150">
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-700 uppercase">
                                  <Wrench className="w-3 h-3 text-blue-600" />
                                  <span>Required Tools & Diagnostic Instruments:</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(hyp.requiredTools && hyp.requiredTools.length > 0
                                    ? hyp.requiredTools
                                    : ['Laser Alignment Kit', 'Torque Wrench (20-150 ft-lbs)', 'CAT IV Multimeter', 'IR Pyrometer']
                                  ).map((tool, tIdx) => (
                                    <span
                                      key={tIdx}
                                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-800 border border-slate-200 font-medium"
                                    >
                                      🧰 {tool}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-800 uppercase">
                                  <Package className="w-3 h-3 text-emerald-600" />
                                  <span>Spare Parts & Consumables Kit:</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(hyp.spareParts && hyp.spareParts.length > 0
                                    ? hyp.spareParts
                                    : ['Cartridge Mechanical Seal Kit', 'Fluoroelastomer O-Ring Set', 'Spiral Wound Gasket']
                                  ).map((part, pIdx) => (
                                    <span
                                      key={pIdx}
                                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-emerald-800 border border-emerald-200 font-semibold"
                                    >
                                      📦 {part}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                  </div>
                </div>
              )}

              {/* Investigation Steps Checklist Tab */}
              {activeTab === 'steps' && (
                <div className="space-y-4">
                  {/* Hands-Free Voice Assistant Command Bar & Connected Timeline (Right-edge clipping fixed & Voice Language Selector) */}
                  {(() => {
                    const firstFailedStepIndex = activeSession.investigationSteps.findIndex((s) => s.status === 'FAIL');
                    const hasFailedStep = firstFailedStepIndex !== -1;
                    const failedStep = hasFailedStep ? activeSession.investigationSteps[firstFailedStepIndex] : null;

                    return (
                      <>
                        <div className="w-full overflow-hidden p-3.5 rounded-xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white space-y-2.5 shadow-md border border-indigo-950/60 mb-4">
                          {/* Row 1: Protocol Title, Connected Step Pills, Progress/Status Badge, Voice Language Selector & Voice Toggle */}
                          <div className="flex items-center justify-between gap-2.5 flex-wrap">
                            {/* Left: Protocol Title + Compact Step Pills */}
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <div className="flex items-center gap-2 font-mono font-bold text-xs uppercase tracking-wide text-indigo-200 shrink-0">
                                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                                <span>Diagnostic Verification Protocol</span>
                              </div>

                              {/* Connected Step Pills */}
                              <div className="flex items-center gap-1.5 font-mono text-xs shrink-0">
                                {activeSession.investigationSteps.map((step, idx) => {
                                  const isPassed = step.status === 'PASS';
                                  const isFailed = step.status === 'FAIL';
                                  const isActive = idx === activeStepIndex;
                                  const isHaltedSubsequent = hasFailedStep && idx > firstFailedStepIndex;

                                  return (
                                    <React.Fragment key={step.id}>
                                      <button
                                        type="button"
                                        disabled={isHaltedSubsequent}
                                        onClick={() => {
                                          if (!isHaltedSubsequent) {
                                            setActiveStepIndex(idx);
                                            stepRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }}
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap ${
                                          isPassed
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-2xs'
                                            : isFailed
                                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-2xs'
                                            : isHaltedSubsequent
                                            ? 'bg-slate-900/40 text-slate-600 border border-slate-800 cursor-not-allowed opacity-40'
                                            : isActive
                                            ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white ring-2 ring-indigo-400 shadow-xs cursor-pointer'
                                            : 'bg-slate-800/90 text-slate-400 border border-slate-700 hover:text-white cursor-pointer'
                                        }`}
                                        title={isHaltedSubsequent ? `Step ${step.stepNumber} Halted (Prior check failed)` : `Step ${step.stepNumber}: ${step.name}`}
                                      >
                                        <span>{step.stepNumber < 10 ? `0${step.stepNumber}` : step.stepNumber}</span>
                                        {isPassed && <Check className="w-3 h-3 text-emerald-400" />}
                                        {isFailed && <X className="w-3 h-3 text-rose-400" />}
                                      </button>
                                      {idx < activeSession.investigationSteps.length - 1 && (
                                        <span className={`w-2.5 h-0.5 ${isHaltedSubsequent ? 'bg-slate-800' : 'bg-slate-700'} shrink-0`} />
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>

                              {/* Progress or Halted Badge */}
                              <span className={`font-mono text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${
                                hasFailedStep
                                  ? 'text-rose-300 bg-rose-950/80 border border-rose-800/80'
                                  : 'text-cyan-300 bg-cyan-950/60 border border-cyan-800/60'
                              }`}>
                                {hasFailedStep
                                  ? `🚨 Step 0${failedStep?.stepNumber} Failed • Checks Halted`
                                  : `${passedStepsCount}/${totalStepsCount} Passed (${progressPercent}%)`}
                              </span>
                            </div>

                            {/* Right: AI Voice Language/Changer Selector + Voice Control ON/OFF Button */}
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {/* Language Selector: EN Voice vs Hindi Voice */}
                              <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-700/80 text-xs font-mono">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoiceLanguage('en');
                                    voiceLanguageRef.current = 'en';
                                    speakText('English technical voice active', 'en');
                                    toast.info('AI Voice Mode', 'Switched to English Technical Voice');
                                  }}
                                  className={`px-2.5 py-1 rounded-md transition font-bold cursor-pointer flex items-center gap-1.5 ${
                                    voiceLanguage === 'en'
                                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                  title="Switch to English Technical Voice"
                                >
                                  <span>🇺🇸</span>
                                  <span>EN Voice</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoiceLanguage('hi');
                                    voiceLanguageRef.current = 'hi';
                                    speakText('हिंदी वॉइस एक्टिवेट हो गई है', 'hi');
                                    toast.info('AI Voice Mode', 'Switched to Hindi (हिंदी) AI Voice');
                                  }}
                                  className={`px-2.5 py-1 rounded-md transition font-bold cursor-pointer flex items-center gap-1.5 ${
                                    voiceLanguage === 'hi'
                                      ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xs'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                  title="Switch to Hindi AI Translated Voice (हिंदी)"
                                >
                                  <span>🇮🇳</span>
                                  <span>हिंदी Voice</span>
                                </button>
                              </div>

                              {/* Voice Control ON/OFF Button */}
                              <button
                                type="button"
                                onClick={toggleVoiceControl}
                                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 whitespace-nowrap ${
                                  isVoiceListening
                                    ? 'bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-400 animate-pulse'
                                    : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white border border-indigo-400/40'
                                }`}
                                title="Hands-Free Voice Control: Say 'Activate Voice', 'Pass', 'Fail', 'Next', 'Read Step', 'Hindi', 'Escalate', 'Stop Voice'"
                              >
                                <Mic className={`w-3.5 h-3.5 ${isVoiceListening ? 'text-white' : 'text-cyan-300'}`} />
                                <span>{isVoiceListening ? '🎙️ Voice Control: ON' : '🎙️ Voice Control: OFF'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Full Wrapped Command Strip (Never clips on right edge) */}
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-slate-300 pt-1.5 border-t border-white/10 w-full justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap text-cyan-300 font-semibold">
                              <Mic className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>Say:</span>
                              <span className="text-slate-200 font-normal">
                                <strong className="text-white">"Activate Voice"</strong> •{' '}
                                <strong className="text-white">"Pass"</strong> / <strong className="text-white">"Confirm"</strong> •{' '}
                                <strong className="text-white">"Fail"</strong> •{' '}
                                <strong className="text-white">"Next"</strong> •{' '}
                                <strong className="text-white">"Read Step"</strong> •{' '}
                                <strong className="text-white">"Hindi"</strong> •{' '}
                                <strong className="text-white">"Escalate"</strong> •{' '}
                                <strong className="text-white">"Stop Voice"</strong>
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {isVoiceListening ? '🟢 Listening (1st-try recognition active)' : '⚪ Inactive (Click or say "Activate Voice")'}
                            </span>
                          </div>
                        </div>

                        {/* Step Cards List */}
                        <div className="space-y-3">
                          {activeSession.investigationSteps.map((step, sIdx) => {
                            // CRITICAL LOGIC: If ANY step has failed, collapse and hide ALL subsequent steps below it!
                            if (hasFailedStep && sIdx > firstFailedStepIndex) {
                              return null;
                            }

                            const isFailed = step.status === 'FAIL';
                            const isPassed = step.status === 'PASS';
                            const isActive = sIdx === activeStepIndex;
                            const hindiData = translateStepToHindi(step);
                            const hypTools =
                              step.requiredTools && step.requiredTools.length > 0
                                ? step.requiredTools
                                : activeSession.hypotheses[0]?.requiredTools && activeSession.hypotheses[0].requiredTools.length > 0
                                ? activeSession.hypotheses[0].requiredTools
                                : ['Calibrated Torque Wrench (60 Nm)', 'CAT IV Multimeter', 'Laser Tachometer', 'IR Pyrometer'];

                            return (
                              <React.Fragment key={step.id}>
                                <div
                                  ref={(el) => (stepRefs.current[sIdx] = el)}
                                  className={`rounded-xl border p-4 bg-white shadow-xs transition-all duration-200 space-y-3 ${
                                    isPassed
                                      ? 'border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/20 to-white border-slate-200'
                                      : isFailed
                                      ? 'border-l-4 border-l-rose-500 bg-rose-50/60 border-rose-300 ring-1 ring-rose-200'
                                      : isActive
                                      ? 'border-l-4 border-l-indigo-600 bg-gradient-to-r from-indigo-50/30 to-white border-indigo-200 shadow-sm ring-1 ring-indigo-200'
                                      : 'border-slate-200'
                                  }`}
                                >
                                  {/* Top Row: Step Pill Badge + Title + LOTO Required (Left) and Verification Status/Buttons (Right) */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                      <span className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-2.5 py-0.5 rounded-md text-xs font-bold font-mono shadow-xs shrink-0 whitespace-nowrap">
                                        STEP {step.stepNumber < 10 ? `0${step.stepNumber}` : step.stepNumber}
                                      </span>
                                      <h4 className="text-sm font-bold text-slate-900">{step.name}</h4>
                                      {step.requiresLoto && (
                                        <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded border border-rose-200 uppercase whitespace-nowrap shrink-0">
                                          LOTO REQUIRED
                                        </span>
                                      )}
                                    </div>

                                    {/* Verification Buttons / Badges */}
                                    <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                                      {isPassed ? (
                                        <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                                          <span>PASSED & VERIFIED</span>
                                        </span>
                                      ) : isFailed ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="px-3 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                            <span>FAILED (Anomaly Confirmed)</span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleResetOrRetestStep(step, sIdx)}
                                            className="text-[11px] font-mono text-slate-500 hover:text-emerald-700 underline px-1 py-0.5 cursor-pointer"
                                            title="Re-verify as Pass"
                                          >
                                            Re-test
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleExecuteStepPass(step, sIdx)}
                                            className="px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white font-bold cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Pass</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleExecuteStepFail(step, sIdx)}
                                            className="px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition bg-white text-rose-700 border-rose-300 hover:bg-rose-600 hover:text-white font-bold cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                            <span>Fail</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Step Instruction */}
                                  <p className="text-xs text-slate-700 font-sans leading-relaxed">
                                    {step.instruction}
                                  </p>

                                  {/* Hindi AI Translated Guidance Pill (shown when Hindi Voice selected) */}
                                  {voiceLanguage === 'hi' && (
                                    <div className="p-2.5 rounded-lg bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-300/40 text-slate-800 text-xs flex items-start gap-2 shadow-2xs animate-in fade-in duration-200 font-sans">
                                      <span className="text-sm shrink-0">🇮🇳</span>
                                      <div className="space-y-0.5 leading-relaxed">
                                        <div className="font-bold text-[11px] text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                                          <span>हिंदी विवरण (AI Translated Guidance)</span>
                                        </div>
                                        <p className="text-xs text-slate-900 font-medium">
                                          {hindiData.instruction}
                                        </p>
                                        <p className="text-[11px] text-slate-700">
                                          <strong className="text-amber-900">अपेक्षित स्थिति:</strong> {hindiData.expected}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* 2-Column Mini Grid for Expected Reading & Required Diagnostic Tools */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
                                    {/* Left Box: Expected Reading */}
                                    <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-lg flex flex-col justify-center gap-1">
                                      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                        🎯 EXPECTED READING / CONDITION
                                      </span>
                                      <p className="text-xs text-slate-800 font-mono font-semibold">
                                        {step.expectedReading || 'In-spec baseline operational tolerance (DCS / OEM specs)'}
                                      </p>
                                    </div>

                                    {/* Right Box: Required Diagnostic Tools */}
                                    <div className="bg-indigo-50/40 border border-indigo-100 p-2.5 rounded-lg flex flex-col justify-center gap-1">
                                      <span className="text-[10px] font-mono font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                                        🧰 REQUIRED DIAGNOSTIC TOOLS
                                      </span>
                                      <div className="flex flex-wrap gap-1 text-[10px] font-mono text-slate-700">
                                        {hypTools.map((tool: string, tIdx: number) => (
                                          <span key={tIdx} className="px-1.5 py-0.5 rounded bg-white border border-indigo-100 text-slate-800">
                                            {tool}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* CRITICAL REQUIREMENT: Single-Fail Immediate Escalation Banner rendered directly below the failed step */}
                                {isFailed && (
                                  <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950 via-indigo-950 to-slate-900 text-white border border-rose-500/40 flex items-center justify-between gap-4 shadow-lg flex-wrap sm:flex-nowrap animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-start gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-400 flex items-center justify-center shrink-0 shadow-xs">
                                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                                      </div>
                                      <div className="space-y-1">
                                        <h4 className="font-bold text-sm text-white flex items-center gap-2">
                                          <span>🚨 Diagnostic Anomaly Confirmed at Step 0{step.stepNumber} — Further In-House Checks Halted</span>
                                        </h4>
                                        <p className="text-xs text-rose-200/80 leading-relaxed font-sans">
                                          Physical boundary/tolerance check failed. Immediate field technician intervention required.
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleResetOrRetestStep(step, sIdx)}
                                        className="px-3.5 py-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono font-semibold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                                        title="Re-open step for testing"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Re-test Step</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDirectEscalateFromStep(step)}
                                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-600 via-red-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs font-bold font-mono shadow-md flex items-center gap-2 transition cursor-pointer hover:shadow-lg active:scale-95"
                                        title="Say 'Escalate' or click to dispatch ticket to technician"
                                      >
                                        <Rocket className="w-4 h-4" />
                                        <span>Escalate Ticket to Technician →</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}

                  {/* Dynamic Status Banner: State A (Escalated to Tech) vs State B (Solved by Tech) vs State C (100% RCA Verified) */}
                  {(() => {
                    if (!liveRcaBannerState) return null;

                    if (liveRcaBannerState.type === 'SOLVED_BY_TECH') {
                      return (
                        <div className="rounded-xl border border-emerald-500/60 bg-gradient-to-r from-emerald-950 via-slate-950 to-indigo-950 text-white p-4 shadow-lg space-y-2.5 animate-in fade-in">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 shadow-sm">
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-xs font-bold font-mono text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                                  <span>✅ PROBLEM SOLVED & VERIFIED BY TECHNICIAN</span>
                                </h3>
                                <p className="text-[11px] text-emerald-100/90 font-sans leading-snug">
                                  All shop-floor execution steps verified & closed by {liveRcaBannerState.rawTechName}.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold tracking-wider">
                                SOLVED & VERIFIED
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-emerald-900/60 text-[11px] font-mono">
                            <div>
                              <span className="text-emerald-400/80 block text-[9px] uppercase font-semibold">Resolved At</span>
                              <strong className="text-white block">{liveRcaBannerState.resolvedAt}</strong>
                            </div>
                            <div>
                              <span className="text-emerald-400/80 block text-[9px] uppercase font-semibold">Asset Tag</span>
                              <strong className="text-white block">{liveRcaBannerState.assetTag}</strong>
                            </div>
                            <div>
                              <span className="text-emerald-400/80 block text-[9px] uppercase font-semibold">Solved By Technician</span>
                              <strong className="text-emerald-300 block">{liveRcaBannerState.techName}</strong>
                            </div>
                            <div>
                              <span className="text-emerald-400/80 block text-[9px] uppercase font-semibold">Resolution Proof</span>
                              <strong className="text-slate-200 block text-[10px] leading-tight break-words">{liveRcaBannerState.resolutionProof}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (liveRcaBannerState.type === 'ESCALATED_TECH') {
                      return (
                        <div className="rounded-xl border border-amber-500/60 bg-gradient-to-r from-amber-950 via-slate-900 to-indigo-950 text-white p-4 shadow-lg space-y-2.5 animate-in fade-in">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs shrink-0 shadow-sm">
                                <Send className="w-4 h-4 text-white" />
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-xs font-bold font-mono text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                                  <span>🚀 ESCALATED TO FIELD TECHNICIAN — IN EXECUTION</span>
                                </h3>
                                <p className="text-[11px] text-amber-100/90 font-sans leading-snug">
                                  Investigation escalated to field specialist. Procedure is locked pending shop-floor execution.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-bold tracking-wider">
                                TICKET IN FIELD
                              </span>
                              <button
                                type="button"
                                onClick={() => handleNavigateToRaisedTickets(liveRcaBannerState.ticketId)}
                                className="px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-indigo-500 hover:from-amber-600 hover:to-indigo-600 text-white font-mono font-bold text-[10px] flex items-center gap-1 shadow-sm transition cursor-pointer whitespace-nowrap"
                              >
                                <span>View in Tech Desk →</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-amber-900/60 text-[11px] font-mono">
                            <div>
                              <span className="text-amber-400/80 block text-[9px] uppercase font-semibold">Ticket ID</span>
                              <strong className="text-white block font-mono">#{liveRcaBannerState.ticketId}</strong>
                            </div>
                            <div>
                              <span className="text-amber-400/80 block text-[9px] uppercase font-semibold">Assigned Technician</span>
                              <strong className="text-amber-200 block">{liveRcaBannerState.techName}</strong>
                            </div>
                            <div>
                              <span className="text-amber-400/80 block text-[9px] uppercase font-semibold">Current Status</span>
                              <strong className="text-cyan-300 block">{liveRcaBannerState.statusText}</strong>
                            </div>
                            <div>
                              <span className="text-amber-400/80 block text-[9px] uppercase font-semibold">Asset Tag</span>
                              <strong className="text-white block">{liveRcaBannerState.assetTag}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (liveRcaBannerState.type === 'VERIFIED_CLOSED') {
                      return (
                        <div className="rounded-xl border border-indigo-900/60 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-4 shadow-md space-y-2.5 animate-in fade-in">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wide">
                                  100% Investigation Verified & Closed
                                </h3>
                                <p className="text-[11px] text-indigo-200/90 font-sans leading-snug">
                                  All verification safety checks confirmed by technician. Permanent audit entry sealed in Maintenance History.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/40 font-bold tracking-wider">
                                LOCKED & SEALED
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-indigo-900/80 text-[11px] font-mono">
                            <div>
                              <span className="text-indigo-300/80 block text-[9px] uppercase font-semibold">Verified</span>
                              <strong className="text-white block">{liveRcaBannerState.verifiedAt}</strong>
                            </div>
                            <div>
                              <span className="text-indigo-300/80 block text-[9px] uppercase font-semibold">Asset Tag</span>
                              <strong className="text-white block">{liveRcaBannerState.assetTag}</strong>
                            </div>
                            <div>
                              <span className="text-indigo-300/80 block text-[9px] uppercase font-semibold">Fault / Alarm</span>
                              <strong className="text-rose-300 block">{liveRcaBannerState.faultCode}</strong>
                            </div>
                            <div>
                              <span className="text-indigo-300/80 block text-[9px] uppercase font-semibold">Verifying User</span>
                              <strong className="text-white block">{liveRcaBannerState.verifyingUser}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })()}
                </div>
              )}

              {/* Sleek Compact RCA Action Loop Footer Bar */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>RCA Action Loop</span>
                  <span className="text-[11px] font-normal text-slate-500">Fast-dispatch, seal maintenance records, or capture tribal insights</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* Resolve Ticket & Save Record */}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleResolveTicketAndSaveRecord()}
                    className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-sm whitespace-nowrap px-4 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer border-0"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Resolve & Save Record</span>
                  </Button>

                  {/* Save to Expert Knowledge */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSavingToExpert}
                    onClick={handleSaveToExpertKnowledge}
                    className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 hover:from-slate-900 hover:to-indigo-900 text-white whitespace-nowrap px-4 py-2 text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-indigo-900/60 transition"
                  >
                    <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{isSavingToExpert ? 'Saving & Opening...' : 'Save to Expert Knowledge'}</span>
                  </Button>

                  {/* Escalate to Technician */}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleOpenEscalateModal}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-sm whitespace-nowrap px-4 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer border-0"
                  >
                    <Send className="w-4 h-4 text-sky-200 shrink-0" />
                    <span>Escalate to Technician</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Escalate Ticket to Technician Modal */}
      <Modal
        isOpen={isEscalateOpen}
        onClose={() => {
          if (!isEscalating) setIsEscalateOpen(false);
        }}
        title="Escalate Ticket to Technician & Dispatch Queue"
        subtitle="Dispatch high-priority support ticket into Raised Tickets with smart AI auto-assignment and availability fallback."
        maxWidth="2xl"
      >
        <form onSubmit={handleEscalateSubmit} className="space-y-3">
          {/* Active Context Banner */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5 font-mono">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Asset / Machine:</span>{' '}
                <strong className="text-slate-900">{activeSession?.assetTag || selectedMachineTag || 'GEN-DIESEL-101'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Alarm / Fault:</span>{' '}
                <span className="text-rose-600 font-bold break-all">
                  {activeSession?.detectedFaultCode || activeSession?.errorCode || errorCode || 'ALM-THRM-402 / High Temp Trip'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Field Symptom:</span>{' '}
              <span className="text-slate-800 font-sans font-medium">
                {activeSession?.symptom?.trim() || symptom?.trim() || 'High Vibration, Thermal Spike, Seal Leakage'}
              </span>
            </div>
            {activeSession?.hypotheses?.[0] && (
              <div className="pt-1 border-t border-slate-200">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">AI Suspected Cause:</span>{' '}
                <span className="text-blue-700 font-bold font-sans">
                  {activeSession.hypotheses[0].title}
                  {activeSession.hypotheses[0]?.probability ? ` (${activeSession.hypotheses[0].probability}% confidence)` : ''}
                </span>
              </div>
            )}
            {failedStepForEscalation && (
              <div className="p-2 rounded-lg bg-rose-100/80 border border-rose-300 text-xs text-rose-950 space-y-0.5 font-mono mt-1.5">
                <div className="flex items-center gap-1.5 font-bold text-rose-800 uppercase text-[10px]">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Failed Investigation Step:</span>
                </div>
                <div className="font-sans font-bold text-slate-900 text-xs">
                  Step #{failedStepForEscalation.stepNumber} — {failedStepForEscalation.name}
                </div>
                <div className="text-[11px] text-rose-900">
                  Expected Condition: <strong className="font-mono">{failedStepForEscalation.expectedReading || 'In-spec baseline parameter'}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Form Fields: Discipline & Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-mono text-[#64748B] uppercase font-bold mb-1">
                Target Specialist / Discipline <span className="text-rose-500">*</span>
              </label>
              <select
                value={escalateDiscipline}
                onChange={(e) => setEscalateDiscipline(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="" className="text-slate-500 font-normal bg-white">-- Select Specialist --</option>
                <option value="Mechanical / Rotating Equipment Lead" className="text-slate-900 font-medium bg-white">
                  Mechanical / Rotating Equipment Lead
                </option>
                <option value="Electrical & Instrumentation Specialist" className="text-slate-900 font-medium bg-white">
                  Electrical & Instrumentation Specialist
                </option>
                <option value="OEM Technical Authority" className="text-slate-900 font-medium bg-white">OEM Technical Authority</option>
                <option value="Process / Reliability Engineer" className="text-slate-900 font-medium bg-white">
                  Process / Reliability Engineer
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-[#64748B] uppercase font-bold mb-1">
                Ticket Severity / Priority <span className="text-rose-500">*</span>
              </label>
              <select
                value={escalateSeverity}
                onChange={(e) => setEscalateSeverity(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="" className="text-slate-500 font-normal bg-white">-- Select Priority --</option>
                <option value="CRITICAL" className="text-slate-900 font-medium bg-white">Critical - Plant / Line Down</option>
                <option value="HIGH" className="text-slate-900 font-medium bg-white">High - Immediate Dispatch</option>
                <option value="MEDIUM" className="text-slate-900 font-medium bg-white">Medium - Non-Urgent Inspection</option>
              </select>
            </div>
          </div>

          {/* Machine Safe / LOTO Toggle */}
          <div>
            <label className="block text-xs font-mono text-[#64748B] uppercase font-bold mb-1">
              Machine Safe / LOTO Applied? <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-slate-800">
                <input
                  type="radio"
                  name="loto_status"
                  checked={isLotoApplied === true}
                  onChange={() => setIsLotoApplied(true)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-emerald-700">Yes — Energy Isolated & Padlocked</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-slate-800">
                <input
                  type="radio"
                  name="loto_status"
                  checked={isLotoApplied === false}
                  onChange={() => setIsLotoApplied(false)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-amber-700">No — Still Running Abnormal</span>
              </label>
            </div>
          </div>

          {/* Pre-filled Maintenance Engineer Notes */}
          <div>
            <label className="block text-xs font-mono text-[#64748B] uppercase font-bold mb-1">
              MAINTENANCE ENGINEER / FIELD NOTES & CONTEXT (EDITABLE)
            </label>
            <textarea
              rows={3}
              value={escalateNotes}
              onChange={(e) => setEscalateNotes(e.target.value)}
              placeholder="Provide specific plant conditions, tooling constraints, or requested vendor specialist..."
              className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-sans"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={isEscalating}
              onClick={() => setIsEscalateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isEscalating}
              className="bg-[#0F172A] text-white hover:bg-black font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isEscalating ? 'Dispatching...' : 'Escalate Ticket to Technician'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2-Step Confirmation Modal for Marking Steps "Pass" */}
      <Modal
        isOpen={passConfirmation.isOpen}
        onClose={() => setPassConfirmation((prev) => ({ ...prev, isOpen: false }))}
        title={
          passConfirmation.stage === 1
            ? 'Step Verification (1/2)'
            : 'Final Sign-Off Lock (2/2)'
        }
        subtitle={`Step ${passConfirmation.stepNumber}: ${passConfirmation.stepName}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {passConfirmation.stage === 1 ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-3 font-sans">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900 text-sm leading-snug">
                    Step Verification (1/2): Have you physically performed this check on the equipment and verified the expected reading/safety condition?
                  </p>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    Verify that physical gauges, telemetry readings, and safety isolation points have been directly inspected before confirming step clearance.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 font-mono text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setPassConfirmation((prev) => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => setPassConfirmation((prev) => ({ ...prev, stage: 2 }))}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <span>Yes, Reading Verified</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-3 font-sans">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900 text-sm leading-snug">
                    Final Sign-Off (2/2): Are you 100% sure this step is clear? Once marked as PASSED, this step will be locked and cannot be changed.
                  </p>
                  <p className="text-amber-800 text-xs leading-relaxed">
                    Once confirmed, this step is sealed with your user signature and timestamp in the permanent maintenance audit trail.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-mono text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setPassConfirmation((prev) => ({ ...prev, stage: 1 }))}
                  className="text-slate-600"
                >
                  ← Go Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (passConfirmation.stepId) {
                      handleFinalConfirmPass(passConfirmation.stepId);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm & Lock Step</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Step Failure Confirmation Modal */}
      <Modal
        isOpen={failConfirmation.isOpen}
        onClose={() => setFailConfirmation({ isOpen: false, step: null })}
        title="Confirm Anomaly / Step Failure"
        subtitle={
          failConfirmation.step
            ? `Step #${failConfirmation.step.stepNumber}: ${failConfirmation.step.name}`
            : 'Step Verification'
        }
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-xs">
              <p className="font-semibold text-rose-950 text-sm leading-snug">
                Confirm Failure on Step #{failConfirmation.step?.stepNumber}?
              </p>
              <p className="text-rose-800 leading-relaxed">
                Marking this step as <strong>FAILED</strong> will halt further investigation checks, permanently lock all downstream steps, and trigger a direct Machine Specialist Escalation prompt.
              </p>
              {failConfirmation.step?.expectedReading && (
                <div className="mt-2 p-2 bg-white/80 rounded border border-rose-200 text-slate-700">
                  <span className="font-bold text-rose-900 block font-mono text-[11px]">EXPECTED PARAMETER:</span>
                  <span className="font-mono text-xs">{failConfirmation.step.expectedReading}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-mono text-xs">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setFailConfirmation({ isOpen: false, step: null })}
              className="text-slate-600"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={handleConfirmFail}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Confirm Failure & Halt Investigation</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* OSHA 1910.147 LOTO & PPE Readiness Checklist Popup Modal */}
      <Modal
        isOpen={isLotoModalOpen}
        onClose={() => setIsLotoModalOpen(false)}
        title="OSHA 1910.147 MANDATORY LOTO & PPE SAFETY READINESS"
        maxWidth="2xl"
      >
        <div className="p-4 space-y-3.5 text-xs font-sans">
          {/* Header Warning Banner */}
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="font-mono font-bold text-amber-950 uppercase tracking-wide text-[11px]">
                Pre-Work Safety Briefing — {activeSession?.assetTag || 'Target Equipment'}
              </span>
            </div>
            <p className="text-amber-900 leading-relaxed text-[11px]">
              {activeSession?.safetyReadiness?.preWorkBriefing ||
                `Mandatory hazardous energy isolation required on ${activeSession?.assetTag || 'target asset'}. Ensure 0.0 PSIG residual pressure and zero electrical voltage before opening physical casing or performing step #1.`}
            </p>
          </div>

          {/* Structured 2-Column Grid: Isolation Points and Required PPE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            {/* Column 1: Designated Energy Isolation Points */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="font-mono font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    Isolation Points (Zero Energy)
                  </span>
                  <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold">
                    LOTO
                  </span>
                </div>
                <div className="space-y-1.5 pt-2">
                  {(activeSession?.safetyReadiness?.isolationPoints || [
                    `MCC Main Feeder Breaker Lockout for ${activeSession?.assetTag || 'Machine'}`,
                    'Suction & Discharge Manual Handwheel Gate Valves',
                    'Casing Bleed Drain Manifold (Verify 0.0 PSIG / 0.0 VAC)',
                  ]).map((point, ptIdx) => (
                    <div
                      key={ptIdx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/60 border border-amber-200 text-slate-800 text-xs"
                    >
                      <span className="font-mono font-bold text-amber-800 shrink-0 text-[11px]">[{ptIdx + 1}]</span>
                      <span className="font-medium leading-tight">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Required Personal Protective Equipment (PPE) */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="font-mono font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    Required PPE Equipment
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                    MANDATORY
                  </span>
                </div>
                <div className="space-y-1.5 pt-2">
                  {(activeSession?.safetyReadiness?.requiredPpe || [
                    'Impact Safety Glasses with Side Shields (ANSI Z87.1)',
                    'Arc Flash Rated Face Shield (NFPA 70E / 8 cal/cm²)',
                    'ANSI Level 4 Cut-Resistant & Heavy Nitrile Chemical Gloves',
                    'Steel-Toe Metatarsal Safety Boots',
                  ]).map((ppe, pIdx) => (
                    <div
                      key={pIdx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-medium font-mono text-[11px]"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="leading-tight">{ppe}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsLotoModalOpen(false)}
              className="bg-slate-900 text-white font-mono text-xs px-4 py-1.5"
            >
              Acknowledge & Close Checklist
            </Button>
          </div>
        </div>
      </Modal>

      {/* 🚨 Center Failure Alert Popup Modal (Auto-pops when any step fails) */}
      <Modal
        isOpen={failureAlertModal.isOpen}
        onClose={() => setFailureAlertModal({ isOpen: false, step: null })}
        title={`CRITICAL ANOMALY: STEP #${failureAlertModal.step?.stepNumber || ''} FAILED`}
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50/90 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 animate-pulse" />
              <h4 className="font-bold text-rose-950 font-mono uppercase text-xs">
                Investigation Halted — Physical Anomaly Confirmed
              </h4>
            </div>
            <p className="text-rose-900 text-xs leading-relaxed">
              Step #{failureAlertModal.step?.stepNumber} (<strong>{failureAlertModal.step?.name}</strong>) verification failed.
              Expected tolerance/condition: <strong className="font-mono text-rose-950">{failureAlertModal.step?.expectedReading || 'In-spec tolerance'}</strong> was not met.
            </p>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5 font-mono text-[11px] text-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Asset Tag:</span>
              <strong className="text-slate-900">{activeSession?.assetTag}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Downstream State:</span>
              <strong className="text-rose-700">ALL SUBSEQUENT STEPS LOCKED</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Reported By:</span>
              <strong className="text-slate-900">{user?.fullName || user?.email || 'Maintenance Engineer'}</strong>
            </div>
          </div>

          <p className="text-slate-600 text-[11px]">
            To prevent equipment damage or secondary failures, do not proceed with subsequent field checks. Escalate this failure to a dedicated equipment specialist now.
          </p>

          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFailureAlertModal({ isOpen: false, step: null })}
              className="w-full sm:w-auto text-xs"
            >
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                const target = failureAlertModal.step;
                setFailureAlertModal({ isOpen: false, step: null });
                if (target) {
                  handleOpenEscalateForFailedStep(target);
                }
              }}
              className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm py-2 px-3.5"
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span>Escalate Ticket to Technician →</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Center 100% Verification Complete Popup Modal (Auto-pops when all steps pass) */}
      <Modal
        isOpen={verificationCompleteModal}
        onClose={() => setVerificationCompleteModal(false)}
        title="100% INVESTIGATION VERIFIED & AUDIT SEALED"
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/90 space-y-2 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <h4 className="font-bold font-mono text-emerald-950 uppercase text-sm">
              All Investigation Steps Successfully Verified
            </h4>
            <p className="text-emerald-900 text-xs leading-relaxed max-w-md mx-auto">
              Every sequential safety and operational check for <strong>{activeSession?.assetTag}</strong> has been confirmed and permanently sealed by the Maintenance Engineer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Asset Tag</span>
              <strong className="text-slate-900">{activeSession?.assetTag}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Steps Passed</span>
              <strong className="text-emerald-700">{totalStepsCount} of {totalStepsCount} (100%)</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Verifying Engineer</span>
              <strong className="text-slate-900 truncate block">
                {user?.fullName || user?.email || 'Maintenance Engineer'}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Audit Record</span>
              <strong className="text-blue-700">Sealed & Saved</strong>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerificationCompleteModal(false)}
              className="w-full sm:w-auto text-xs"
            >
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleResolveTicketAndSaveRecord()}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm py-2 px-3.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Resolve Ticket & Save Record</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setVerificationCompleteModal(false);
                handleExportRcaSummary();
              }}
              className="w-full sm:w-auto text-indigo-700 border-indigo-300 hover:bg-indigo-50 font-bold text-xs flex items-center justify-center gap-1.5 py-2 px-3.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export RCA Summary</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete RCA Record Confirmation Modal (Requirement 2) */}
      <Modal
        isOpen={deleteRcaConfirmation.isOpen}
        onClose={() => setDeleteRcaConfirmation({ isOpen: false, session: null })}
        title="Delete RCA Record"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleteRcaConfirmation({ isOpen: false, session: null })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDeleteRca}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Record</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-xs font-sans text-slate-700">
          <p className="text-sm font-semibold text-slate-900">
            Delete this RCA record for{' '}
            <strong className="font-mono text-blue-700">{deleteRcaConfirmation.session?.assetTag}</strong>?
          </p>
          <p className="text-slate-500">
            This will permanently remove the investigation notes and hypothesis matrix from your session history.
          </p>
        </div>
      </Modal>

      {/* Expert Knowledge Capture Modal upon RCA Resolution */}
      <ExpertKnowledgeCaptureModal
        isOpen={isExpertCaptureOpen}
        onClose={() => setIsExpertCaptureOpen(false)}
        prefillData={expertCapturePrefill}
        onPublishedToExpert={() => {
          setIsExpertCaptureOpen(false);
          onNavigate?.('expert-knowledge');
          setParentActiveTab?.('expert-knowledge');
          window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'expert-knowledge' }));
          window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'expert' } }));
          if (typeof window !== 'undefined') {
            window.location.hash = '#expert-knowledge';
          }
        }}
        onSavedToHistoryOnly={() => {
          setIsExpertCaptureOpen(false);
          onNavigate?.('maintenance-history');
          setParentActiveTab?.('maintenance-history');
          window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'maintenance-history' }));
          window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'history' } }));
          if (typeof window !== 'undefined') {
            window.location.hash = '#maintenance-history';
          }
        }}
      />
    </div>
  );
};

export default TroubleshootingView;

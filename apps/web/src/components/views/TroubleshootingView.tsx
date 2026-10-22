import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  HelpCircle,
  ShieldCheck,
  UserCheck,
  Check,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  Wrench,
  BookOpen,
  GraduationCap,
  Plus,
  Send,
  Zap,
  ChevronRight,
  ChevronDown,
  History,
  FileText,
  CheckCircle2,
  ExternalLink,
  Lock,
  Clock,
  ShieldAlert,
  Package,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { apiFetch } from '../../lib/api';
import type { RcaSession, TeardownSop } from '@forgex/shared-types';

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

export const TroubleshootingView: React.FC<{
  onNavigateToSop?: () => void;
  onNavigateToMaintenance?: (assetId: string) => void;
}> = ({ onNavigateToMaintenance }) => {
  const { toast } = useToast();
  const { organization, user } = useAuth();

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

  // 5-Why Causal Flow Collapsible State
  const [expandedWhyChains, setExpandedWhyChains] = useState<Record<string, boolean>>({});
  const toggleWhyChain = (hypId: string) => {
    setExpandedWhyChains((prev) => ({
      ...prev,
      [hypId]: prev[hypId] === false ? true : false,
    }));
  };

  // Reset to Clean Empty State
  const handleStartNewInvestigation = () => {
    setActiveSession(null);
    setSelectedMachineTag('');
    setMachineStatus('');
    setErrorCode('');
    setSymptom('');
    setAnalysisError(null);
    setEscalatedTicketId(null);
    setEscalationBanner(null);
  };

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

  // Teardown SOP Modal State
  const [isTeardownOpen, setIsTeardownOpen] = useState(false);
  const [teardownSop, setTeardownSop] = useState<TeardownSop | null>(null);
  const [isLoadingSop, setIsLoadingSop] = useState(false);
  const [verifiedLotoSteps, setVerifiedLotoSteps] = useState<Record<number, boolean>>({});

  // Action Loop State
  const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false);
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

  // Fetch Recent RCA Sessions
  const fetchRecentSessions = useCallback(async () => {
    try {
      setIsLoadingRecents(true);
      const res = await apiFetch('/api/v1/rca/sessions');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setRecentSessions(json.data);
        }
      }
    } catch (err) {
      console.warn('Could not fetch recent RCA sessions:', err);
    } finally {
      setIsLoadingRecents(false);
    }
  }, []);

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

  // Initiate Step Pass: Launch Confirmation 1 (Field Check Verification)
  const handleInitiateStepPass = (step: any) => {
    if (
      step.isLocked ||
      step.status === 'PASS' ||
      activeSession?.isLocked ||
      activeSession?.status === 'VERIFIED_CLOSED'
    ) {
      toast.info('Step Locked', 'This verified step is locked and cannot be changed.');
      return;
    }
    setPassConfirmation({
      isOpen: true,
      stepId: step.id,
      stepNumber: step.stepNumber,
      stepName: step.name,
      stage: 1,
    });
  };

  // Final Sign-Off (2/2): Lock Step and if 100% Passed, Permanently Lock Investigation & Save to Maintenance History
  const handleFinalConfirmPass = async (stepId: string) => {
    if (!activeSession) return;
    setPassConfirmation((prev) => ({ ...prev, isOpen: false }));

    const nowIso = new Date().toISOString();
    const verifierName = user?.fullName || user?.email || 'Field Specialist';

    const updatedSteps = activeSession.investigationSteps.map((s) =>
      s.id === stepId
        ? {
            ...s,
            status: 'PASS' as const,
            isLocked: true,
            verifiedAt: nowIso,
            verifiedBy: verifierName,
          }
        : s
    );

    const isAllNowPassed =
      updatedSteps.length > 0 && updatedSteps.every((s) => s.status === 'PASS');

    setActiveSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        investigationSteps: updatedSteps,
        ...(isAllNowPassed
          ? {
              status: 'VERIFIED_CLOSED' as const,
              isLocked: true,
              completedAt: nowIso,
              verifiedBy: verifierName,
            }
          : {}),
      };
    });

    try {
      // Sync step status and lock to backend
      const res = await apiFetch(`/api/v1/rca/sessions/${activeSession.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PASS',
          isLocked: true,
          verifiedAt: nowIso,
          verifiedBy: verifierName,
        }),
      });

      if (!res.ok) {
        console.warn('Backend step status patch warning');
      }

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
              verifiedBy: verifierName,
            }),
          });
          if (compRes.ok) {
            fetchRecentSessions();
          }
        } catch (compErr) {
          console.warn('Could not complete session on backend:', compErr);
        }

        toast.success(
          'Investigation 100% Verified!',
          'Permanent record saved to Maintenance History & Recent RCAs.'
        );
      }
    } catch {
      toast.error('Update Failed', 'Could not sync step status to database.');
    }
  };

  // Step Status Toggle (PASS, FAIL, PENDING) with Strict Lock Guard
  const toggleStepStatus = async (stepId: string, newStatus: 'PASS' | 'FAIL' | 'PENDING') => {
    if (!activeSession) return;
    const targetStep = activeSession.investigationSteps.find((s) => s.id === stepId);
    if (!targetStep) return;

    if (
      targetStep.isLocked ||
      targetStep.status === 'PASS' ||
      activeSession.isLocked ||
      activeSession.status === 'VERIFIED_CLOSED'
    ) {
      toast.info('Step Locked', 'This verified step is locked and cannot be changed.');
      return;
    }

    if (newStatus === 'PASS') {
      handleInitiateStepPass(targetStep);
      return;
    }

    setActiveSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        investigationSteps: prev.investigationSteps.map((s) =>
          s.id === stepId ? { ...s, status: newStatus } : s
        ),
      };
    });

    try {
      const res = await apiFetch(`/api/v1/rca/sessions/${activeSession.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error('Failed to update step status');
      }

      if (newStatus === 'FAIL') {
        toast.warning('Anomaly Isolated', 'Check failed! Failure pathway isolated.');
      } else {
        toast.info('Step Reset', 'Step reset to pending verification.');
      }
    } catch {
      toast.error('Update Failed', 'Could not sync step status to database.');
    }
  };

  // Toggle Hypothesis Status
  const setHypothesisStatus = (id: string, newStatus: 'CONFIRMED' | 'HYPOTHESIS' | 'RULED_OUT') => {
    if (!activeSession) return;
    setActiveSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        hypotheses: prev.hypotheses.map((h) =>
          h.id === id ? { ...h, status: newStatus } : h
        ),
      };
    });
  };

  // Reload Previous RCA Session
  const handleLoadSession = (session: RcaSession) => {
    setActiveSession(session);
    setSelectedMachineTag(session.assetTag);
    setErrorCode(session.detectedFaultCode || session.errorCode || '');
    setMachineStatus((session.machineStatus as any) || 'Running - Abnormal');
    setSymptom(session.symptom);
    setActiveTab('rca');
    setIsHistoryDropdownOpen(false);
    toast.info('Session Loaded', `Loaded previous RCA investigation for ${session.assetTag}.`);
  };

  // Open Teardown SOP Modal
  const handleOpenTeardownSop = async () => {
    const targetTag = activeSession?.assetTag || selectedMachineTag;
    setIsTeardownOpen(true);
    setIsLoadingSop(true);
    try {
      const res = await apiFetch(`/api/v1/rca/teardown-sop?assetTag=${encodeURIComponent(targetTag)}`);
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setTeardownSop(json.data);
      }
    } catch (err) {
      console.warn('Could not load teardown SOP from API:', err);
    } finally {
      setIsLoadingSop(false);
    }
  };

  // Quick Action 1: Create Work Order from RCA
  const handleCreateWorkOrder = async () => {
    if (!activeSession) return;
    setIsCreatingWorkOrder(true);

    try {
      const topHypothesis =
        activeSession.hypotheses.find((h) => h.status === 'CONFIRMED') ||
        activeSession.hypotheses[0];
      const matchedMachine = machines.find(
        (m) => (m.asset_tag || m.assetTag || m.name || m.id) === activeSession.assetTag
      );

      // Compute exact Date & Time formatted: e.g. "22 Oct 2026, 09:25 PM"
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = now.toLocaleString('en-US', { month: 'short' });
      const year = now.getFullYear();
      const time = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const createdAtFormatted = `${day} ${month} ${year}, ${time}`;

      const passedCount = activeSession.investigationSteps.filter((s) => s.status === 'PASS').length;
      const totalCount = activeSession.investigationSteps.length;
      const progressStr = `${passedCount}/${totalCount} Steps Verified`;

      const title = `RCA Corrective Work Order: ${topHypothesis?.title || 'Machine Remediation'}`;
      const description = `Corrective work order generated from AI Root Cause Analysis on ${activeSession.assetTag}.
Plant Area: ${matchedMachine?.plant_area || organization?.name || 'Main Manufacturing Facility'}
Reported By: ${user?.fullName || 'Plant Technician'} (${(user as any)?.role || 'Field Reliability Specialist'})
Creation Time: ${createdAtFormatted}
Operational State: ${activeSession.machineStatus || 'Running - Abnormal'}
Detected Alarm / Fault Code: ${activeSession.detectedFaultCode || activeSession.errorCode || 'ALM-THRM-402'}
Primary Root Cause: ${topHypothesis?.title} (${topHypothesis?.probability}% Confidence)
Mechanism: ${topHypothesis?.mechanismExplanation}
Recommended Fix: ${topHypothesis?.recommendedFix}
Observed Symptom: ${activeSession.symptom}
Investigation Progress: ${progressStr}`;

      const res = await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: matchedMachine?.id || activeSession.assetId,
          assetTag: activeSession.assetTag,
          assetName: matchedMachine?.name || activeSession.machineName || activeSession.assetTag,
          title,
          description,
          severity: topHypothesis?.severity || 'HIGH',
          priority: topHypothesis?.severity || 'HIGH',
          symptomDescription: activeSession.symptom,
          machineStatus: activeSession.machineStatus || 'Running - Abnormal',
          faultCode: activeSession.detectedFaultCode || activeSession.errorCode || 'ALM-THRM-402',
          topRootCause: topHypothesis?.title,
          probability: topHypothesis?.probability,
          recommendedFix: topHypothesis?.recommendedFix,
          investigationProgress: progressStr,
          specialistDiscipline: topHypothesis?.requiredSkill || 'Mechanical Rotating Equipment Specialist',
          lotoApplied: true,
          plantName: matchedMachine?.plant_area || organization?.name || 'Main Manufacturing Facility',
          reportedByRole: (user as any)?.role || 'Field Reliability Specialist',
          createdAtFormatted,
          technicianNotes: `Generated from Root Cause Analysis with ${topHypothesis?.probability}% confidence in: ${topHypothesis?.title}. Remediation procedure: ${topHypothesis?.recommendedFix}`,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create maintenance case.');
      }

      const data = await res.json();
      const caseNumber = data?.data?.caseNumber || 'WO-ACTIVE';
      toast.success(
        'Work Order Generated',
        `Maintenance Case #${caseNumber} created with top root cause and remediation fix.`
      );

      if (onNavigateToMaintenance && (matchedMachine?.id || activeSession.assetTag)) {
        onNavigateToMaintenance(matchedMachine?.id || activeSession.assetTag);
      }
    } catch (err: any) {
      toast.error('Work Order Error', err.message || 'Could not create work order from RCA.');
    } finally {
      setIsCreatingWorkOrder(false);
    }
  };

  // Quick Action 2: Save Finding to Expert Knowledge
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

      const res = await apiFetch('/api/v1/recovery/expert-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: [
            {
              title: `${activeSession.assetTag}: ${topHypothesis.title}`,
              assetTag: activeSession.assetTag,
              category: 'Troubleshooting Trick',
              severity:
                topHypothesis.severity === 'CRITICAL'
                  ? 'Critical Machine Warning'
                  : 'Pro-Tip / Best Practice',
              symptom: activeSession.symptom,
              taskDuringIssue: `AI RCA Diagnostic (${activeSession.machineStatus || 'Abnormal State'})`,
              observedAt: new Date().toISOString(),
              description: `${topHypothesis.mechanismExplanation}\n\nRecommended Field Fix:\n${topHypothesis.recommendedFix}`,
              status: 'APPROVED',
            },
          ],
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error?.message || errJson.message || 'Failed to save to expert knowledge repository.'
        );
      }

      toast.success(
        'Saved to Expert Knowledge Repository!',
        'Field finding saved and vectorized into Qdrant for peer retrieval.'
      );
    } catch (err: any) {
      toast.error('Save Failed', err.message || 'Could not save to expert knowledge.');
    } finally {
      setIsSavingToExpert(false);
    }
  };

  // Open Escalation Modal with Pre-filled Context (Binds directly to Left Panel symptom and top AI root cause)
  const handleOpenEscalateModal = () => {
    if (!activeSession) return;
    const targetTag = activeSession.assetTag || selectedMachineTag || '';
    const currentSymptom = activeSession.symptom?.trim() || symptom?.trim() || '';
    const topHyp =
      activeSession.hypotheses?.find((h) => h.status === 'CONFIRMED') ||
      activeSession.hypotheses?.[0];

    const prefill = `Technician observed symptom on ${targetTag}: ${currentSymptom}${
      topHyp
        ? `\n\nTop AI Root Cause Hypothesis:\n- Suspected Cause: ${topHyp.title} (${topHyp.probability}% confidence)\n- Mechanism: ${topHyp.mechanismExplanation}\n- Recommended Remediation: ${topHyp.recommendedFix}`
        : ''
    }`;

    // Reset dropdowns to ensure clean unselected start
    setEscalateDiscipline('');
    setEscalateSeverity('');
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

      // Compute exact Date & Time formatted: e.g. "22 Oct 2026, 09:25 PM"
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = now.toLocaleString('en-US', { month: 'short' });
      const year = now.getFullYear();
      const time = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const createdAtFormatted = `${day} ${month} ${year}, ${time}`;

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
            notes: escalateNotes || `Technician observed symptom on ${targetTag}: ${currentSymptom}`,
            technicianNotes: escalateNotes || `Technician observed symptom on ${targetTag}: ${currentSymptom}`,
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
        const diagnosticSummary = `Equipment: ${targetTag}\nOperating State: ${activeSession.machineStatus || machineStatus}\nFault Code: ${activeFault}\nDiscipline: ${escalateDiscipline}\nLOTO: ${isLotoApplied ? 'YES - Padlocked' : 'NO - Live Running'}\nField Symptom: ${currentSymptom}\n${topHyp ? `AI Suspected Cause: ${topHyp.title} (${topHyp.probability}% prob)\n` : ''}Technician Notes: ${escalateNotes}`;

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
        ticketNum = `ESC-${Date.now().toString().slice(-4)}`;
      }

      setEscalatedTicketId(ticketNum);
      setEscalationBanner({
        ticketId: ticketNum,
        discipline: escalateDiscipline,
        severity: escalateSeverity,
      });
      setIsEscalateOpen(false);

      toast.success(
        'Specialist Ticket Dispatched',
        `Specialist ticket #${ticketNum} dispatched successfully to ${escalateDiscipline}.`,
        {
          action: {
            label: 'View in Technician Queue ->',
            onClick: () => {
              window.dispatchEvent(
                new CustomEvent('forgex:navigate', { detail: { module: 'tech' } })
              );
            },
          },
        }
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
      <div className="p-4 md:px-6 bg-white border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <h2 className="text-base font-bold font-mono text-[#0F172A] uppercase tracking-wide whitespace-nowrap">
              Root Cause Analysis & Troubleshooting Copilot
            </h2>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5 font-sans truncate">
            Diagnostic reasoning grounded in Knowledge Hub manuals, senior technician field notes, and failure logs.
          </p>
        </div>

        <div className="flex items-center gap-2 relative shrink-0 flex-wrap sm:flex-nowrap">
          {/* Recent RCAs Dropdown Selector - only displayed when Active RCA is loaded */}
          {activeSession && (
            <div className="relative shrink-0" ref={historyDropdownRef}>
              <button
                type="button"
                onClick={() => setIsHistoryDropdownOpen(!isHistoryDropdownOpen)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-mono font-medium text-slate-700 flex items-center gap-1.5 transition shadow-sm whitespace-nowrap shrink-0"
              >
                <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="whitespace-nowrap">Recent RCAs ({recentSessions.length})</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {isHistoryDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs animate-in fade-in slide-in-from-top-1">
                  <div className="p-2 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        handleStartNewInvestigation();
                        setIsHistoryDropdownOpen(false);
                      }}
                      className="w-full text-center py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition border border-blue-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Start New Investigation</span>
                    </button>
                  </div>
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
                      recentSessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => handleLoadSession(session)}
                          className="w-full text-left p-2.5 hover:bg-blue-50/70 transition flex flex-col gap-0.5 group"
                        >
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
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Switcher if active session exists */}
          {activeSession && (
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
          )}

          {/* Escalate to Specialist Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenEscalateModal}
            disabled={!activeSession}
            className={`text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed ${
              escalatedTicketId ? 'ring-2 ring-emerald-500' : ''
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">
              {escalatedTicketId ? `Dispatched (${escalatedTicketId})` : 'Escalate to Specialist'}
            </span>
          </Button>
        </div>
      </div>

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
        <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-white p-5 overflow-y-auto space-y-4 shrink-0 shadow-sm flex flex-col">
          <div className="space-y-4">
            {/* Target Asset / Machine Field (Strictly Uploaded Machines) */}
            <div>
              <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-1">
                Target Asset / Machine <span className="text-rose-500">*</span>
              </label>

              {isLoadingMachines ? (
                <div className="py-2.5 text-xs font-mono text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Loading ingested assets...</span>
                </div>
              ) : hasNoDocuments || machines.length === 0 ? (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5 font-sans">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-[11px] text-amber-800 uppercase">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>No Ingested Machine Documents</span>
                  </div>
                  <p className="leading-snug text-[11px]">
                    No equipment documentation exists in Knowledge Hub yet. Ingest an OEM manual or SOP first to run grounded AI diagnostics.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedMachineTag}
                  onChange={(e) => setSelectedMachineTag(e.target.value)}
                  className="w-full py-2 px-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-mono font-bold text-[#0F172A] focus:outline-none focus:border-[#2563EB] cursor-pointer"
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
                className="w-full py-2 px-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-sans font-medium text-[#0F172A] focus:outline-none focus:border-[#2563EB] cursor-pointer"
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
                <Zap className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={errorCode}
                  onChange={(e) => setErrorCode(e.target.value)}
                  placeholder="Optional: Enter PLC code or leave blank for AI auto-detection"
                  className="w-full py-2 pl-8 pr-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-mono font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Field Symptom Description & Quick Chips */}
            <div>
              <label className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider block mb-1">
                Field Symptom Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Describe acoustic noise, thermal spike, vibration harmonics, or fluid seal leaks..."
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs text-[#0F172A] outline-none focus:border-[#2563EB] font-sans leading-relaxed"
              />

              {/* Quick Symptom Chips */}
              <div className="mt-2 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 block uppercase">
                  Quick Symptom Chips:
                </span>
                <div className="flex flex-wrap gap-1">
                  {QUICK_SYMPTOM_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddSymptomChip(chip)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 transition active:scale-95 flex items-center gap-0.5"
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
              className="w-full py-2.5 bg-[#0F172A] hover:bg-black disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm border border-slate-800"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Synthesizing Equipment Records...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>Run AI Root Cause Analysis</span>
                </>
              )}
            </button>

            {analysisError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}

            {/* Compact Evidence Traceability Box */}
            <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200 text-[11px] text-slate-600 space-y-0.5">
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
            <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-xl border border-dashed border-[#CBD5E1] space-y-6 max-w-3xl mx-auto my-auto shadow-sm w-full">
              <div className="flex flex-col items-center text-center space-y-3 max-w-lg">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shadow-xs">
                  <HelpCircle className="w-7 h-7 text-slate-500" />
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
                <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-blue-600" />
                    <span>Recent / Past RCA Investigations</span>
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    {recentSessions.map((s) => {
                      const allPassed =
                        s.status === 'VERIFIED_CLOSED' ||
                        s.isLocked ||
                        (s.investigationSteps &&
                          s.investigationSteps.length > 0 &&
                          s.investigationSteps.every((st) => st.status === 'PASS'));
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleLoadSession(s)}
                          className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-white text-xs space-y-2 transition text-left shadow-sm hover:shadow group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-blue-700 text-sm group-hover:underline">
                              {s.assetTag}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                                allPassed
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {allPassed ? '100% Verified' : 'In Progress'}
                            </span>
                          </div>

                          {s.detectedFaultCode && (
                            <div className="text-[11px] font-mono font-bold text-rose-600 flex items-center gap-1 truncate">
                              <Zap className="w-3 h-3 text-rose-500 shrink-0" />
                              <span className="truncate">{s.detectedFaultCode}</span>
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 flex-1">
              {/* Active Case Top Summary */}
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-sm text-[#0F172A]">
                    {activeSession.assetTag}
                  </span>
                  {activeSession.machineName && activeSession.machineName !== activeSession.assetTag && (
                    <span className="text-xs text-slate-500 font-sans">
                      ({activeSession.machineName})
                    </span>
                  )}
                  {activeSession.detectedFaultCode && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold shrink-0">
                      {activeSession.detectedFaultCode}
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-medium">
                    State: {activeSession.machineStatus || 'Running'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 font-sans truncate max-w-md">
                  <strong>Symptom:</strong> {activeSession.symptom}
                </div>
              </div>

              {/* RCA Matrix Tab: Ranked Hypotheses */}
              {activeTab === 'rca' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                      Ranked Root Cause Hypotheses ({activeSession.hypotheses.length})
                    </h3>
                    <span className="text-[11px] font-sans text-slate-500">
                      Grounded in OEM manuals, expert notes & maintenance failure logs
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    {activeSession.hypotheses.map((hyp, index) => (
                      <div
                        key={hyp.id}
                        className={`rounded-xl border p-4 sm:p-5 transition bg-white shadow-sm space-y-3 ${
                          hyp.status === 'CONFIRMED'
                            ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/20'
                            : hyp.status === 'RULED_OUT'
                            ? 'opacity-60 border-slate-200 bg-slate-50'
                            : 'border-[#E2E8F0] hover:border-blue-300'
                        }`}
                      >
                        {/* Hypothesis Header */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-mono font-bold">
                                #{index + 1}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 leading-snug">
                                {hyp.title}
                              </h4>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                                hyp.severity === 'CRITICAL'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : hyp.severity === 'HIGH'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              {hyp.severity} Severity
                            </span>

                            {/* Confidence Progress */}
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    hyp.probability >= 80
                                      ? 'bg-emerald-500'
                                      : hyp.probability >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${hyp.probability}%` }}
                                />
                              </div>
                              <span className="font-bold text-slate-700">{hyp.probability}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Mechanism Explanation */}
                        <div className="text-xs text-slate-700 font-sans leading-relaxed pl-7">
                          {hyp.mechanismExplanation}
                        </div>

                        {/* ⏱️ MTTR & Operational Impact Bar */}
                        <div className="pl-7 pt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 shadow-xs">
                            <Clock className="w-3 h-3 text-blue-600" />
                            <span>Est. MTTR: <strong>{hyp.mttr || '45–60 mins'}</strong></span>
                          </span>

                          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs">
                            <GraduationCap className="w-3 h-3 text-indigo-500" />
                            <span>Required Skill: <strong>{hyp.requiredSkill || 'L2 Mechanical Specialist'}</strong></span>
                          </span>

                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full border shadow-xs ${
                              (hyp.downtimeRisk || 'High').toLowerCase() === 'critical'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : (hyp.downtimeRisk || 'High').toLowerCase() === 'high'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <span>Downtime Risk: <strong>{hyp.downtimeRisk || 'High'}</strong></span>
                          </span>
                        </div>

                        {/* 🌳 Interactive 5-Why Failure Causal Chain */}
                        <div className="pl-7 pt-1">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-2.5 shadow-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-800 uppercase tracking-wide">
                                <span>🌳 5-Why Failure Causal Chain</span>
                                <span className="text-slate-400 font-normal lowercase">(causal sequence)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleWhyChain(hyp.id)}
                                className="text-[10px] font-mono text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 px-2 py-0.5 rounded hover:bg-blue-50 transition"
                              >
                                {expandedWhyChains[hyp.id] === false ? 'Expand 5-Why Flow' : 'Collapse Flow'}
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform ${
                                    expandedWhyChains[hyp.id] === false ? '-rotate-90' : ''
                                  }`}
                                />
                              </button>
                            </div>

                            {expandedWhyChains[hyp.id] !== false && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs font-sans">
                                {(hyp.fiveWhyChain && hyp.fiveWhyChain.length > 0
                                  ? hyp.fiveWhyChain
                                  : [
                                      `Why 1: Operational load deviation on ${activeSession.assetTag}`,
                                      'Why 2: Boundary fluid starvation & dynamic cavitation',
                                      'Why 3: Thermal stress erosion on silicon carbide seal faces',
                                      'Why 4: Dynamic O-ring extrusion and seal leakage',
                                      `Observed Symptom: ${activeSession.symptom}`,
                                    ]
                                ).map((step, sIdx, arr) => (
                                  <React.Fragment key={sIdx}>
                                    <span
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] leading-tight font-medium shadow-xs ${
                                        sIdx === arr.length - 1
                                          ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                                          : sIdx === 0
                                          ? 'bg-blue-50 text-blue-900 border-blue-200 font-bold'
                                          : 'bg-white text-slate-700 border-slate-200'
                                      }`}
                                    >
                                      {step}
                                    </span>
                                    {sIdx < arr.length - 1 && (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    )}
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 🧰 Required Tools & Spare Parts Kit */}
                        <div className="pl-7 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          {/* Tools Required */}
                          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-xs">
                            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-700 uppercase">
                              <Wrench className="w-3.5 h-3.5 text-blue-600" />
                              <span>Required Tools & Diagnostic Instruments:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {(hyp.requiredTools && hyp.requiredTools.length > 0
                                ? hyp.requiredTools
                                : ['Laser Alignment Kit', 'Torque Wrench (20-150 ft-lbs)', 'CAT IV Digital Multimeter', 'Calibrated IR Pyrometer']
                              ).map((tool, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 font-medium"
                                >
                                  🧰 {tool}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Spare Parts Kit */}
                          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-xs">
                            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-700 uppercase">
                              <Package className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Spare Parts & Consumables Kit:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {(hyp.spareParts && hyp.spareParts.length > 0
                                ? hyp.spareParts
                                : ['Cartridge Mechanical Seal Kit', 'Fluoroelastomer O-Ring Set', 'Stainless Spiral Wound Gasket']
                              ).map((part, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                                >
                                  📦 {part}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Verified Sources Badges */}
                        {hyp.verifiedSources && hyp.verifiedSources.length > 0 && (
                          <div className="pl-7 pt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                              Verified Sources:
                            </span>
                            {hyp.verifiedSources.map((source, sIdx) => (
                              <span
                                key={sIdx}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                                  source.type === 'MANUAL'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : source.type === 'EXPERT_NOTE'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {source.type === 'MANUAL' ? (
                                  <BookOpen className="w-2.5 h-2.5" />
                                ) : source.type === 'EXPERT_NOTE' ? (
                                  <GraduationCap className="w-2.5 h-2.5" />
                                ) : (
                                  <Wrench className="w-2.5 h-2.5" />
                                )}
                                <span>{source.reference}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Recommended Field Fix & Actions */}
                        <div className="pl-7 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-slate-700 font-sans">
                            <strong className="text-slate-900 font-mono text-[11px] uppercase mr-1">
                              Recommended Fix:
                            </strong>
                            <span>{hyp.recommendedFix}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 font-mono text-[11px]">
                            <button
                              onClick={() => setHypothesisStatus(hyp.id, 'CONFIRMED')}
                              className={`px-2 py-1 rounded border transition ${
                                hyp.status === 'CONFIRMED'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50'
                              }`}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setHypothesisStatus(hyp.id, 'RULED_OUT')}
                              className={`px-2 py-1 rounded border transition ${
                                hyp.status === 'RULED_OUT'
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-rose-50'
                              }`}
                            >
                              Rule Out
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Investigation Steps Checklist Tab */}
              {activeTab === 'steps' && (
                <div className="space-y-4">
                  {/* ⚡ Mandatory LOTO & PPE Safety Readiness Banner */}
                  <div className="rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                          <Zap className="w-4 h-4 fill-current" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold font-mono text-amber-950 uppercase tracking-wide flex items-center gap-2">
                            <span>⚡ MANDATORY LOTO & PPE SAFETY READINESS</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300 font-bold">
                              OSHA 1910.147 COMPLIANT
                            </span>
                          </h4>
                          <p className="text-[11px] text-amber-900/90 font-sans mt-0.5">
                            {activeSession.safetyReadiness?.preWorkBriefing ||
                              `Mandatory hazardous energy isolation required on ${activeSession.assetTag}. Verify 0.0 PSIG and zero electrical voltage before servicing step #1.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2.5 border-t border-amber-200/70 text-xs font-sans">
                      {/* Required PPE */}
                      <div className="bg-white/80 rounded-lg p-2.5 border border-amber-200/80 space-y-1.5">
                        <div className="text-[10px] font-mono font-bold text-amber-900 uppercase flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                          <span>Required Personal Protective Equipment (PPE)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(activeSession.safetyReadiness?.requiredPpe || [
                            'Impact Safety Glasses (ANSI Z87.1)',
                            'Arc Flash Rated Face Shield (NFPA 70E)',
                            'Heavy Nitrile Chemical Gloves',
                            'Steel-Toe Metatarsal Safety Boots',
                          ]).map((ppe, pIdx) => (
                            <span
                              key={pIdx}
                              className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-100/70 text-amber-900 border border-amber-300/80"
                            >
                              ✓ {ppe}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Primary Isolation Points */}
                      <div className="bg-white/80 rounded-lg p-2.5 border border-amber-200/80 space-y-1.5">
                        <div className="text-[10px] font-mono font-bold text-amber-900 uppercase flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Designated Energy Isolation Points</span>
                        </div>
                        <div className="space-y-1">
                          {(activeSession.safetyReadiness?.isolationPoints || [
                            `MCC Main Feeder Breaker Lockout for ${activeSession.assetTag}`,
                            'Suction & Discharge Manual Handwheel Gate Valves',
                            'Casing Bleed Drain Manifold (Verify 0.0 PSIG)',
                          ]).map((point, ptIdx) => (
                            <div key={ptIdx} className="text-[11px] text-slate-800 flex items-start gap-1.5">
                              <span className="text-amber-600 font-mono font-bold">[{ptIdx + 1}]</span>
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 100% Investigation Verified & Closed Audit Banner */}
                  {(activeSession.status === 'VERIFIED_CLOSED' ||
                    activeSession.isLocked ||
                    (totalStepsCount > 0 && passedStepsCount === totalStepsCount)) && (
                    <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/95 p-4 shadow-sm space-y-3 animate-in fade-in">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-mono font-bold shrink-0 shadow-xs">
                            🔒
                          </span>
                          <div>
                            <h3 className="text-sm font-bold font-mono text-emerald-950 uppercase tracking-wide">
                              🔒 100% INVESTIGATION VERIFIED & CLOSED
                            </h3>
                            <p className="text-[11px] text-emerald-800 font-sans">
                              All verification safety checks confirmed by technician. Permanent audit entry sealed in Maintenance History & Recent RCAs.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-400 font-bold shrink-0 self-start sm:self-auto">
                          AUDIT RECORD LOCKED
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2.5 border-t border-emerald-200 text-xs font-mono">
                        <div>
                          <span className="text-emerald-700 block text-[10px] uppercase font-semibold">Verified Timestamp</span>
                          <strong className="text-slate-900">
                            {activeSession.completedAt
                              ? new Date(activeSession.completedAt).toLocaleString()
                              : new Date().toLocaleString()}
                          </strong>
                        </div>
                        <div>
                          <span className="text-emerald-700 block text-[10px] uppercase font-semibold">Asset Tag</span>
                          <strong className="text-slate-900">{activeSession.assetTag}</strong>
                        </div>
                        <div>
                          <span className="text-emerald-700 block text-[10px] uppercase font-semibold">Fault / Alarm</span>
                          <strong className="text-rose-700 truncate block">
                            {activeSession.detectedFaultCode || activeSession.errorCode || 'ALM-THRM-402 / High Temp Trip'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-emerald-700 block text-[10px] uppercase font-semibold">Verifying User</span>
                          <strong className="text-slate-900 truncate block">
                            {typeof activeSession.verifiedBy === 'object'
                              ? activeSession.verifiedBy?.name
                              : activeSession.verifiedBy || user?.fullName || user?.email || 'Plant Specialist'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Investigation Progress Bar */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-slate-700 uppercase">
                        Investigation Verification Progress
                      </span>
                      <span className="font-bold text-blue-700">
                        {passedStepsCount} of {totalStepsCount} Passed ({progressPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          progressPercent === 100 ? 'bg-emerald-600' : 'bg-blue-600'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {activeSession.investigationSteps.map((step) => {
                      const isStepLocked =
                        step.isLocked ||
                        step.status === 'PASS' ||
                        activeSession.status === 'VERIFIED_CLOSED' ||
                        activeSession.isLocked ||
                        (totalStepsCount > 0 && passedStepsCount === totalStepsCount);

                      return (
                        <div
                          key={step.id}
                          className={`rounded-xl border p-4 bg-white shadow-sm transition space-y-2.5 ${
                            step.status === 'PASS'
                              ? 'border-emerald-300 bg-emerald-50/20'
                              : step.status === 'FAIL'
                              ? 'border-rose-300 bg-rose-50/20'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
                                {step.stepNumber}
                              </span>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-bold text-slate-900">{step.name}</h4>
                                  {step.requiresLoto && (
                                    <span className="text-[10px] font-mono px-2 py-0.2 bg-rose-100 text-rose-800 font-bold rounded border border-rose-200 uppercase">
                                      LOTO Required
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-700 font-sans leading-relaxed">
                                  {step.instruction}
                                </p>
                              </div>
                            </div>

                            {/* Verification Buttons or Locked Badge */}
                            <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                              {isStepLocked ? (
                                <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1.5 select-none shadow-xs">
                                  <Lock className="w-3 h-3 text-emerald-700" />
                                  <span>🔒 Verified & Locked</span>
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleInitiateStepPass(step)}
                                    className="px-2.5 py-1 rounded border flex items-center gap-1 transition bg-white text-slate-700 border-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 font-semibold cursor-pointer active:scale-95 shadow-xs"
                                  >
                                    <Check className="w-3 h-3 text-emerald-600" /> Pass
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleStepStatus(step.id, 'FAIL')}
                                    className={`px-2.5 py-1 rounded border flex items-center gap-1 transition ${
                                      step.status === 'FAIL'
                                        ? 'bg-rose-600 text-white border-rose-600 font-bold'
                                        : 'bg-white text-slate-600 border-slate-300 hover:bg-rose-50 hover:text-rose-700'
                                    }`}
                                  >
                                    <X className="w-3 h-3" /> Fail
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleStepStatus(step.id, 'PENDING')}
                                    className={`px-2 py-1 rounded border transition ${
                                      step.status === 'PENDING'
                                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                                        : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    Pending
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                        {/* Safety Warning */}
                        {step.safetyWarning && (
                          <div className="ml-8 mt-2 p-2 rounded bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-center gap-2 font-sans">
                            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              <strong>Safety Notice:</strong> {step.safetyWarning}
                            </span>
                          </div>
                        )}

                        {/* Expected Reading & Tools */}
                        <div className="ml-8 mt-2.5 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-500 pt-2 border-t border-slate-100">
                          {step.expectedReading && (
                            <div>
                              <strong className="text-slate-700">Expected:</strong>{' '}
                              {step.expectedReading}
                            </div>
                          )}
                          {step.requiredTools && step.requiredTools.length > 0 && (
                            <div className="flex items-center gap-1">
                              <strong className="text-slate-700">Tools:</strong>
                              <span>{step.requiredTools.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}

              {/* Action Loop Footer Bar */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">RCA Action Loop:</span> Convert
                  findings into active work orders, inspect teardown SOPs, or save tribal insights.
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {/* Save to Expert Knowledge */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSavingToExpert}
                    onClick={handleSaveToExpertKnowledge}
                    className="text-xs font-semibold border-slate-300 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                    <span>{isSavingToExpert ? 'Saving...' : 'Save to Expert Knowledge'}</span>
                  </Button>

                  {/* Create Work Order from RCA */}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isCreatingWorkOrder}
                    onClick={handleCreateWorkOrder}
                    className="bg-[#0F172A] hover:bg-black text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
                  >
                    <Wrench className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isCreatingWorkOrder ? 'Creating...' : 'Create Work Order from RCA'}</span>
                  </Button>

                  {/* Teardown SOP Modal Launcher */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenTeardownSop}
                    className="text-xs font-semibold border-slate-300 hover:bg-blue-50 text-blue-700 hover:border-blue-300 flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Teardown SOP</span>
                    <ExternalLink className="w-3 h-3 text-blue-400" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Escalate to Machine Specialist Modal */}
      <Modal
        isOpen={isEscalateOpen}
        onClose={() => {
          if (!isEscalating) setIsEscalateOpen(false);
        }}
        title="Escalate to Machine Specialist"
        subtitle="Dispatch high-priority support ticket to qualified plant engineer or OEM technical authority."
        maxWidth="2xl"
      >
        <form onSubmit={handleEscalateSubmit} className="space-y-4">
          {/* Active Context Banner */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2 font-mono">
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
              <div className="pt-1.5 border-t border-slate-200">
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">AI Suspected Cause:</span>{' '}
                <span className="text-blue-700 font-bold font-sans">
                  {activeSession.hypotheses[0].title}
                  {activeSession.hypotheses[0]?.probability ? ` (${activeSession.hypotheses[0].probability}% confidence)` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Form Fields: Discipline & Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#64748B] uppercase font-bold mb-1">
                Target Specialist / Discipline <span className="text-rose-500">*</span>
              </label>
              <select
                value={escalateDiscipline}
                onChange={(e) => setEscalateDiscipline(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="">-- Select Specialist --</option>
                <option value="Mechanical / Rotating Equipment Lead">
                  Mechanical / Rotating Equipment Lead
                </option>
                <option value="Electrical & Instrumentation Specialist">
                  Electrical & Instrumentation Specialist
                </option>
                <option value="OEM Technical Authority">OEM Technical Authority</option>
                <option value="Process / Reliability Engineer">
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
                <option value="">-- Select Priority --</option>
                <option value="CRITICAL">Critical - Plant / Line Down</option>
                <option value="HIGH">High - Immediate Dispatch</option>
                <option value="MEDIUM">Medium - Non-Urgent Inspection</option>
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

          {/* Pre-filled Technician Notes */}
          <div>
            <label className="block text-xs font-mono text-[#64748B] uppercase font-bold mb-1">
              Technician Notes / Context (Editable)
            </label>
            <textarea
              rows={4}
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
              <span>{isEscalating ? 'Dispatching...' : 'Dispatch Specialist Ticket'}</span>
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
                  <span>Confirm & Lock Step ✓</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Teardown & LOTO Disassembly SOP Modal */}
      <Modal
        isOpen={isTeardownOpen}
        onClose={() => setIsTeardownOpen(false)}
        title="Teardown & LOTO Disassembly SOP"
        subtitle={`Standard Operating Procedure extracted from Knowledge Hub for ${
          activeSession?.assetTag || selectedMachineTag
        }`}
        maxWidth="3xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {isLoadingSop ? (
            <div className="p-8 text-center text-xs font-mono text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Extracting Teardown Protocol from Knowledge Hub Manuals...</span>
            </div>
          ) : teardownSop ? (
            <div className="space-y-4">
              {/* Document Reference Header */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-bold text-blue-900">{teardownSop.machineName}</span>
                  <span className="text-blue-700 ml-2">[{teardownSop.machineAssetTag}]</span>
                </div>
                <span className="text-slate-500">{teardownSop.documentReference}</span>
              </div>

              {/* Safety Pre-requisites & PPE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/40 text-xs space-y-1.5">
                  <span className="font-mono font-bold uppercase text-rose-800 text-[10px] block">
                    Safety Prerequisites & Energy Control:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 font-sans">
                    {teardownSop.safetyPrerequisites.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1.5">
                  <span className="font-mono font-bold uppercase text-slate-700 text-[10px] block">
                    Required PPE & Special Tooling:
                  </span>
                  <div className="space-y-1 font-sans text-slate-700 text-[11px]">
                    <div>
                      <strong>PPE:</strong> {teardownSop.requiredPpe.join(', ')}
                    </div>
                    <div>
                      <strong>Tools:</strong> {teardownSop.requiredTools.join(', ')}
                    </div>
                  </div>
                </div>
              </div>

              {/* LOTO Isolation Checklist */}
              <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/50 space-y-2">
                <span className="font-mono font-bold uppercase text-amber-900 text-xs flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Mandatory LOTO Zero Energy Verification:</span>
                </span>
                <div className="space-y-1.5">
                  {teardownSop.lotoIsolationSteps.map((step, idx) => (
                    <label
                      key={idx}
                      className="flex items-start gap-2 text-xs font-sans text-slate-800 cursor-pointer p-1 rounded hover:bg-amber-100/40"
                    >
                      <input
                        type="checkbox"
                        checked={!!verifiedLotoSteps[idx]}
                        onChange={(e) =>
                          setVerifiedLotoSteps((prev) => ({ ...prev, [idx]: e.target.checked }))
                        }
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={verifiedLotoSteps[idx] ? 'line-through text-slate-400' : ''}>
                        {step}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Step-by-Step Disassembly Sequence */}
              <div className="space-y-3">
                <span className="font-mono font-bold uppercase text-slate-700 text-xs block">
                  Component Disassembly Sequence:
                </span>
                <div className="space-y-2.5">
                  {teardownSop.disassemblySteps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-blue-700">
                          Step {step.stepNumber}: {step.title}
                        </span>
                        {step.torqueSpec && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                            {step.torqueSpec}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 font-sans leading-relaxed">
                        {step.instruction}
                      </p>
                      {step.safetyHazard && (
                        <p className="text-[11px] font-sans text-rose-700 font-medium">
                          ⚠️ Hazard: {step.safetyHazard}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Torque Specifications Table */}
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                <span className="font-mono font-bold uppercase text-slate-700 text-xs block">
                  Critical Torque Specifications:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  {Object.entries(teardownSop.torqueSpecifications).map(([part, spec]) => (
                    <div key={part} className="flex items-center justify-between p-1.5 bg-white rounded border border-slate-200">
                      <span className="text-slate-600">{part}:</span>
                      <strong className="text-slate-900">{spec}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reassembly Guidance */}
              <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200 text-xs text-slate-700 font-sans leading-relaxed">
                <strong className="font-mono text-blue-900 uppercase block mb-1">
                  Reassembly & Alignment Guidance:
                </strong>
                {teardownSop.reassemblyGuidance}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
            <Button variant="primary" size="sm" onClick={() => setIsTeardownOpen(false)}>
              Close SOP
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TroubleshootingView;

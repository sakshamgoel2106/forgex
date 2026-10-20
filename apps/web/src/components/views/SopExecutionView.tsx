import React, { useState, useEffect } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Plus,
  Send,
  BookOpen,
  UserCheck,
  History,
  Lock,
  UserPlus,
  CheckCheck,
} from 'lucide-react';
import { StatusBadge, type StatusTone } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AlertBanner } from '../ui/AlertBanner';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import type {
  MaintenanceCase,
  MaintenanceCaseStatus,
  MaintenanceCaseSeverity,
  ChecklistStepStatus,
} from '@forgex/shared-types';
import { apiFetch } from '../../lib/api';

interface DemoCase extends MaintenanceCase {
  history: Array<{
    id: string;
    action: string;
    user: string;
    timestamp: string;
    notes?: string;
  }>;
}

const INITIAL_CASES: DemoCase[] = [
  {
    id: 'case-p101-overhaul',
    organizationId: 'org-gulf-petro',
    plantId: 'PLANT-TX-04',
    assetId: 'asset-p101-a',
    caseNumber: 'CASE-2026-4021',
    title: 'Pump P-101-A Mechanical Seal Weepage & Increased Vibration',
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    reportedByUserId: 'usr-lead-tech',
    symptomDescription:
      'Visible fluid weepage at primary seal follower plate (approx 15 drops/min). Audible whistling pitch and minor drive-end vibration.',
    operatingConditions: {
      dischargePressurePsi: 145,
      suctionPressurePsi: 28,
      bearingTempC: 68,
      runtimeHours: 4200,
    },
    visualAssetIds: ['vis-seal-p101'],
    diagnosticHypothesis: {
      primaryHypothesis:
        'Mechanical seal face weepage and fastener tension relaxation on P-101-A drive-end gland follower.',
      rootCauses: [
        'Uneven gland stud tension or thermal cycling relaxation',
        'Carbon mating face weeping past secondary elastomer O-ring',
        'Seal flush Plan 11 differential pressure variation',
      ],
      confidence: 'HIGH',
      missingInformation: ['Vibration spectrum report (1x vs 2x harmonics)'],
      safetyCriticalWarnings: [
        'MANDATORY: Verify Zero Energy State and complete Lockout/Tagout (LOTO) on MOV-101 and 4160V motor breaker before loosening gland studs.',
        'NEVER bypass interlocks, safety guards, or pressure relief valves.',
        'AI guidance is an operational aid and does not replace approved plant procedures or qualified personnel.',
      ],
      evidenceCitations: [
        {
          id: 'cit-hyp-1',
          documentId: 'doc-sop-p101',
          documentVersionId: 'ver-sop-p101-1',
          documentNumber: 'SOP-MECH-P101',
          documentTitle:
            'Centrifugal Pump P-101 Mechanical Seal Overhaul & Fastener Torque Specification',
          revisionTag: 'REV-D',
          pageNumber: 14,
          chunkId: 'chk-sop-p101-14',
          snippet:
            'Gland Follower Stud Torque: Must follow three-pass progressive cross-star tightening: Pass 1: 15 ft-lbs, Pass 2: 30 ft-lbs, Final Pass 3: 45 ft-lbs (61 Nm). Ensure LOTO on MOV-101.',
          confidenceScore: 0.95,
        },
      ],
      generatedAt: '2026-10-18T10:30:00Z',
      modelUsed: 'forgex-copilot-engine-v1',
    },
    checklist: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Safety Pre-Check & Lockout/Tagout (LOTO) Isolation',
        instruction:
          'Verify complete mechanical and electrical isolation. Apply designated padlocks and tags to suction/discharge valves and motor breaker. Confirm zero pressure on gauge.',
        requiresLoto: true,
        requiredPpe: ['Safety Glasses', 'Hard Hat', 'Chemical-Resistant Gloves', 'Steel-Toe Boots'],
        requiredTools: ['Calibrated Pressure Test Gauge', 'Lockout Padlocks & Hasps', 'Multimeter'],
        status: 'COMPLETED',
        completedAt: '2026-10-18T10:45:00Z',
        completedByUserId: 'Elena Rostova (Lead Technician)',
        technicianNotes: 'LOTO verified on MOV-101 and breaker 4B. Pressure gauge confirmed at 0.0 psi.',
        citation: {
          id: 'cit-step-1',
          documentId: 'doc-sop-p101',
          documentVersionId: 'ver-sop-p101-1',
          documentNumber: 'SOP-MECH-P101',
          documentTitle: 'Centrifugal Pump P-101 Mechanical Seal Overhaul',
          revisionTag: 'REV-D',
          pageNumber: 14,
          chunkId: 'chk-sop-p101-14',
          snippet: 'Mandatory Lockout/Tagout (LOTO) on suction block valve MOV-101 and 4160V feeder breaker.',
          confidenceScore: 0.98,
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Component Visual Inspection & Seal Follower Assessment',
        instruction:
          'Inspect gland plate interface for fluid residue, scoring, or thermal discoloration. Document weepage rate and check casing drain port.',
        requiresLoto: true,
        requiredPpe: ['Safety Glasses', 'Gloves'],
        requiredTools: ['Inspection Mirror', 'LED Worklight'],
        status: 'COMPLETED',
        completedAt: '2026-10-18T11:05:00Z',
        completedByUserId: 'Elena Rostova (Lead Technician)',
        technicianNotes: 'Minor dry hydrocarbon residue found on follower plate. Carbon face intact.',
        citation: {
          id: 'cit-step-2',
          documentId: 'doc-sop-p101',
          documentVersionId: 'ver-sop-p101-1',
          documentNumber: 'SOP-MECH-P101',
          documentTitle: 'Centrifugal Pump P-101 Mechanical Seal Overhaul',
          revisionTag: 'REV-D',
          pageNumber: 14,
          chunkId: 'chk-sop-p101-14',
          snippet: 'Inspect gland follower gap and stationary seal face seat.',
          confidenceScore: 0.95,
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Fastener Torque Verification & Cross-Star Sequence',
        instruction:
          'Torque gland follower studs in a cross-star pattern in three progressive passes (Pass 1: 15 ft-lbs, Pass 2: 30 ft-lbs, Final Pass 3: 45 ft-lbs / 61 Nm) with calibrated torque wrench.',
        requiresLoto: true,
        requiredPpe: ['Safety Glasses', 'Mechanics Gloves'],
        requiredTools: ['Calibrated Torque Wrench (1/2" drive)', 'Deep Socket Set'],
        status: 'IN_PROGRESS',
        technicianNotes: 'Pass 1 (15 ft-lbs) and Pass 2 (30 ft-lbs) complete. Preparing calibrated wrench for final 45 ft-lbs pass.',
        citation: {
          id: 'cit-step-3',
          documentId: 'doc-sop-p101',
          documentVersionId: 'ver-sop-p101-1',
          documentNumber: 'SOP-MECH-P101',
          documentTitle: 'Centrifugal Pump P-101 Mechanical Seal Overhaul',
          revisionTag: 'REV-D',
          pageNumber: 14,
          chunkId: 'chk-sop-p101-14',
          snippet: 'Pass 1: 15 ft-lbs (20 Nm), Pass 2: 30 ft-lbs (40 Nm), Final Pass 3: 45 ft-lbs (61 Nm).',
          confidenceScore: 0.96,
        },
      },
      {
        id: 'step-4',
        stepNumber: 4,
        title: 'Post-Maintenance Commissioning & Leak-Off Verification',
        instruction:
          'De-isolate LOTO under supervisor permit. Slowly crack open suction valve to prime seal chamber. Confirm zero leakage at nominal operating pressure for 15 minutes.',
        requiresLoto: false,
        requiredPpe: ['Standard Facility PPE'],
        requiredTools: ['Pressure Gauge'],
        status: 'PENDING',
        citation: {
          id: 'cit-step-4',
          documentId: 'doc-sop-p101',
          documentVersionId: 'ver-sop-p101-1',
          documentNumber: 'SOP-MECH-P101',
          documentTitle: 'Centrifugal Pump P-101 Mechanical Seal Overhaul',
          revisionTag: 'REV-D',
          pageNumber: 14,
          chunkId: 'chk-sop-p101-14',
          snippet: 'Confirm zero leakage at nominal operating pressure for 15 minutes.',
          confidenceScore: 0.92,
        },
      },
    ],
    findings: {
      observations: 'Carbon face exhibited light glaze, cleaned with solvent wipe. Stud threads in good condition.',
      measuredValues: {
        pass1TorqueFtLbs: 15,
        pass2TorqueFtLbs: 30,
        targetFinalTorqueFtLbs: 45,
      },
    },
    approval: null,
    isEscalated: false,
    candidateForExpertKnowledge: false,
    createdAt: '2026-10-18T10:15:00Z',
    updatedAt: '2026-10-18T11:20:00Z',
    history: [
      {
        id: 'hist-1',
        action: 'CASE_REPORTED',
        user: 'Elena Rostova (Lead Technician)',
        timestamp: '2026-10-18T10:15:00Z',
        notes: 'Case opened: Weepage reported on P-101-A seal follower.',
      },
      {
        id: 'hist-2',
        action: 'DIAGNOSIS_AND_CHECKLIST_GENERATED',
        user: 'ForgeX Copilot Engine',
        timestamp: '2026-10-18T10:30:00Z',
        notes: 'Diagnostic hypothesis generated with 4 procedural steps cited from SOP-MECH-P101 Rev D.',
      },
      {
        id: 'hist-3',
        action: 'CHECKLIST_STEP_COMPLETED',
        user: 'Elena Rostova (Lead Technician)',
        timestamp: '2026-10-18T10:45:00Z',
        notes: 'Step 1 (LOTO) verified and completed.',
      },
    ],
  },
  {
    id: 'case-comp-valve',
    organizationId: 'org-gulf-petro',
    plantId: 'PLANT-TX-04',
    assetId: 'asset-comp-201',
    caseNumber: 'CASE-2026-7012',
    title: 'Compressor K-201 Suction Unloader Valve Sticking',
    severity: 'MEDIUM',
    status: 'PENDING_APPROVAL',
    reportedByUserId: 'usr-tech-2',
    symptomDescription: 'Unloader valve actuator sluggish response during step loading.',
    visualAssetIds: [],
    checklist: [],
    findings: {
      observations: 'Cleaned solenoid orifice and replaced actuator return spring.',
      measuredValues: { strokeTimeSeconds: 1.2, nominalMaxSeconds: 1.5 },
      correctiveActions: 'Stroked valve 10 times to verify smooth travel.',
      resolutionSummary: 'Compressor unloader valve responsiveness restored within specification.',
    },
    approval: {
      status: 'PENDING',
      reviewedByUserId: null,
      reviewedAt: null,
      reviewerNotes: null,
    },
    isEscalated: false,
    candidateForExpertKnowledge: false,
    createdAt: '2026-10-18T08:00:00Z',
    updatedAt: '2026-10-18T09:30:00Z',
    history: [
      {
        id: 'h-comp-1',
        action: 'WORK_ORDER_SUBMITTED_FOR_APPROVAL',
        user: 'Marcus Vance (Plant Manager)',
        timestamp: '2026-10-18T09:30:00Z',
        notes: 'Submitted for supervisor review.',
      },
    ],
  },
  {
    id: 'case-reflux-resolved',
    organizationId: 'org-gulf-petro',
    plantId: 'PLANT-TX-04',
    assetId: 'asset-reflux-pump',
    caseNumber: 'CASE-2026-1189',
    title: 'Reflux Pump P-204-B Bearing Housing Oil Leaking',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    reportedByUserId: 'usr-lead-tech',
    symptomDescription: 'Oil weeping at constant level oiler connection port.',
    visualAssetIds: [],
    checklist: [],
    findings: {
      resolutionSummary: 'Re-taped pipe threads with high-temperature PTFE and refilled ISO VG 68 oil.',
    },
    approval: {
      status: 'APPROVED',
      reviewedByUserId: 'Marcus Vance (Plant Manager)',
      reviewedAt: '2026-10-18T07:15:00Z',
      reviewerNotes: 'Verified clean oil level and sight glass nominal. Approved for service.',
    },
    isEscalated: false,
    candidateForExpertKnowledge: true,
    feedbackRating: 'HELPFUL',
    feedbackComment: 'Torque specification and oil type citation prevented improper lubricant usage.',
    createdAt: '2026-10-18T06:00:00Z',
    updatedAt: '2026-10-18T07:15:00Z',
    history: [
      {
        id: 'h-ref-1',
        action: 'WORK_ORDER_APPROVED',
        user: 'Marcus Vance (Plant Manager)',
        timestamp: '2026-10-18T07:15:00Z',
        notes: 'Approved and closed.',
      },
    ],
  },
  {
    id: 'case-high-risk-escalated',
    organizationId: 'org-gulf-petro',
    plantId: 'PLANT-TX-04',
    assetId: 'asset-reactor-01',
    caseNumber: 'CASE-2026-9044',
    title: 'High-Risk Unidentified Fluorescent Chemical Deposition',
    severity: 'CRITICAL',
    status: 'ESCALATED_HUMAN',
    reportedByUserId: 'usr-trainee',
    symptomDescription: 'Unidentified crystalline polymer deposition emitting ultraviolet fluorescence under cryogenic conditions.',
    visualAssetIds: [],
    checklist: [],
    isEscalated: true,
    escalationReason:
      'Insufficient authorized technical manual evidence found for reported symptoms. Escalated to prevent invented guidance or catastrophic reaction risk.',
    candidateForExpertKnowledge: false,
    createdAt: '2026-10-18T05:30:00Z',
    updatedAt: '2026-10-18T05:45:00Z',
    history: [
      {
        id: 'h-esc-1',
        action: 'CASE_ESCALATED_TO_HUMAN',
        user: 'ForgeX Safety Engine',
        timestamp: '2026-10-18T05:45:00Z',
        notes: 'Safety rule triggered: Missing authorized SOP.',
      },
    ],
  },
];

export const SopExecutionView: React.FC = () => {
  const [cases, setCases] = useState<DemoCase[]>(INITIAL_CASES);
  const [activeCaseId, setActiveCaseId] = useState<string>(INITIAL_CASES[0].id);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedTechName, setSelectedTechName] = useState('Elena Rostova (Lead Technician)');
  const [isLoading, setIsLoading] = useState(false);

  // Findings input state
  const [findingsText, setFindingsText] = useState('');
  const [measuredTorque, setMeasuredTorque] = useState('45');

  // New Case form state
  const [newTitle, setNewTitle] = useState('');
  const [newAssetTag, setNewAssetTag] = useState('P-101-A');
  const [newSeverity, setNewSeverity] = useState<MaintenanceCaseSeverity>('HIGH');
  const [newSymptoms, setNewSymptoms] = useState('');

  // Initial load from live API
  useEffect(() => {
    let isMounted = true;
    async function loadCases() {
      try {
        const res = await apiFetch('/api/v1/maintenance/cases');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0 && isMounted) {
            setCases((prev) => {
              const liveIds = new Set(json.data.map((c: any) => c.id));
              const enrichedLive: DemoCase[] = json.data.map((lc: any) => ({
                ...lc,
                history: lc.history || [
                  {
                    id: `h-init-${lc.id}`,
                    action: 'CASE_SYNCED',
                    user: 'ForgeX Enterprise Core',
                    timestamp: lc.createdAt,
                    notes: `Synchronized with plant asset registry. Status: ${lc.status}`,
                  },
                ],
              }));
              const nonOverlapping = prev.filter((c) => !liveIds.has(c.id));
              return [...enrichedLive, ...nonOverlapping];
            });
          }
        }
      } catch (err) {
        console.warn('Could not load live maintenance cases, keeping initial state', err);
      }
    }
    loadCases();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeCase = cases.find((c) => c.id === activeCaseId) || cases[0];

  const filteredCases = cases.filter((c) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'EXPERT_CANDIDATE') return c.candidateForExpertKnowledge;
    return c.status === statusFilter;
  });

  const getStatusTone = (status: MaintenanceCaseStatus): StatusTone => {
    switch (status) {
      case 'REPORTED':
        return 'neutral';
      case 'INVESTIGATING':
        return 'info';
      case 'DIAGNOSED':
        return 'info';
      case 'IN_PROGRESS':
        return 'warning';
      case 'PENDING_APPROVAL':
        return 'warning';
      case 'RESOLVED':
        return 'healthy';
      case 'CLOSED':
        return 'healthy';
      case 'ESCALATED_HUMAN':
        return 'critical';
      case 'REJECTED':
        return 'critical';
      default:
        return 'neutral';
    }
  };

  // Step toggle handler
  const handleToggleStep = async (stepId: string) => {
    const prevStatus = activeCase.checklist.find((s) => s.id === stepId)?.status;
    const nextStatus: ChecklistStepStatus = prevStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

    const updatedChecklist = activeCase.checklist.map((s) => {
      if (s.id === stepId) {
        return {
          ...s,
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
          completedByUserId: nextStatus === 'COMPLETED' ? 'Elena Rostova (Lead Technician)' : null,
        };
      }
      return s;
    });

    const updatedCase: DemoCase = {
      ...activeCase,
      checklist: updatedChecklist,
      status: activeCase.status === 'DIAGNOSED' ? ('IN_PROGRESS' as MaintenanceCaseStatus) : activeCase.status,
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      console.warn('Backend step update call failed', err);
    }
  };

  // Submit Findings Handler
  const handleSubmitFindings = async () => {
    const findings = {
      observations: findingsText || 'Gland follower aligned and torqued in 3-pass cross-star pattern.',
      measuredValues: { finalTorqueFtLbs: Number(measuredTorque) || 45 },
      resolutionSummary: 'P-101-A seal overhaul complete. Zero weepage observed.',
    };

    const updatedCase: DemoCase = {
      ...activeCase,
      status: 'PENDING_APPROVAL',
      findings,
      approval: {
        status: 'PENDING',
        reviewedByUserId: null,
        reviewedAt: null,
        reviewerNotes: null,
      },
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'WORK_ORDER_SUBMITTED_FOR_APPROVAL',
          user: 'Elena Rostova (Lead Technician)',
          timestamp: new Date().toISOString(),
          notes: 'Submitted findings for supervisor review.',
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/findings`, {
        method: 'POST',
        body: JSON.stringify(findings),
      });
    } catch (err) {
      console.warn('Backend findings submission call failed', err);
    }
  };

  // Approval Review Handler
  const handleReviewApproval = async (approved: boolean) => {
    const newStatus: MaintenanceCaseStatus = approved ? 'RESOLVED' : 'REJECTED';
    const now = new Date().toISOString();
    const updatedCase: DemoCase = {
      ...activeCase,
      status: newStatus,
      approval: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedByUserId: 'Marcus Vance (Plant Manager)',
        reviewedAt: now,
        reviewerNotes: approvalNotes || (approved ? 'Sign-off complete.' : 'Rework required.'),
      },
      resolvedAt: approved ? now : activeCase.resolvedAt,
      candidateForExpertKnowledge: approved,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: approved ? 'WORK_ORDER_APPROVED' : 'WORK_ORDER_REJECTED',
          user: 'Marcus Vance (Plant Manager)',
          timestamp: now,
          notes: approvalNotes || (approved ? 'Approved by supervisor.' : 'Rejected for rework.'),
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));
    setApprovalNotes('');

    try {
      await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ approved, reviewerNotes: approvalNotes }),
      });
    } catch (err) {
      console.warn('Backend approval call failed', err);
    }
  };

  // Close Case Handler
  const handleCloseCase = async () => {
    const now = new Date().toISOString();
    const updatedCase: DemoCase = {
      ...activeCase,
      status: 'CLOSED',
      closedAt: now,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_CLOSED',
          user: 'Marcus Vance (Plant Manager)',
          timestamp: now,
          notes: 'Maintenance case verified and formally closed.',
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Formally closed via UI' }),
      });
    } catch (err) {
      console.warn('Backend close case call failed', err);
    }
  };

  // Assign Technician Handler
  const handleAssignTechnician = async () => {
    const techName = selectedTechName;
    const updatedCase: DemoCase = {
      ...activeCase,
      assignedTechnicianName: techName,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'TECHNICIAN_ASSIGNED',
          user: 'Marcus Vance (Plant Manager)',
          timestamp: new Date().toISOString(),
          notes: `Assigned technician: ${techName}`,
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));
    setIsAssignModalOpen(false);

    try {
      await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          technicianUserId: 'usr-lead-tech',
          technicianName: techName,
        }),
      });
    } catch (err) {
      console.warn('Backend assign technician call failed', err);
    }
  };

  // Escalate Handler
  const handleEscalateCase = async () => {
    if (!escalateReason.trim()) return;

    const updatedCase: DemoCase = {
      ...activeCase,
      status: 'ESCALATED_HUMAN',
      isEscalated: true,
      escalationReason: escalateReason,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_ESCALATED_TO_HUMAN',
          user: 'Elena Rostova (Lead Technician)',
          timestamp: new Date().toISOString(),
          notes: `Escalated: ${escalateReason}`,
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));
    setIsEscalateModalOpen(false);
    setEscalateReason('');

    try {
      await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: escalateReason }),
      });
    } catch (err) {
      console.warn('Backend escalate call failed', err);
    }
  };

  // New Case Creation Handler
  const handleCreateNewCase = async () => {
    if (!newTitle.trim() || !newSymptoms.trim()) return;
    setIsLoading(true);

    const newCase: DemoCase = {
      id: `case-${Date.now()}`,
      organizationId: 'org-gulf-petro',
      plantId: 'PLANT-TX-04',
      assetId: `asset-${newAssetTag.toLowerCase()}`,
      caseNumber: `CASE-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      title: newTitle,
      severity: newSeverity,
      status: 'REPORTED',
      reportedByUserId: 'Elena Rostova (Lead Technician)',
      assignedTechnicianName: 'Elena Rostova (Lead Technician)',
      symptomDescription: newSymptoms,
      operatingConditions: { runtimeHours: 3500 },
      visualAssetIds: [],
      checklist: [],
      isEscalated: false,
      candidateForExpertKnowledge: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_REPORTED',
          user: 'Elena Rostova (Lead Technician)',
          timestamp: new Date().toISOString(),
          notes: `Created new case: ${newTitle}`,
        },
      ],
    };

    setCases([newCase, ...cases]);
    setActiveCaseId(newCase.id);
    setIsNewCaseModalOpen(false);
    const titleToSubmit = newTitle;
    const symptomsToSubmit = newSymptoms;
    setNewTitle('');
    setNewSymptoms('');

    try {
      const res = await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        body: JSON.stringify({
          plantId: 'f29c2d0e-ca17-40b4-b9b3-7c4a8f5e1b8a', // canonical PLANT-TX-04 UUID
          assetId: 'c19c2d0e-ca17-40b4-b9b3-7c4a8f5e1b8b', // canonical PUMP-204-B UUID
          title: titleToSubmit,
          severity: newSeverity,
          symptomDescription: symptomsToSubmit,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          // Immediately trigger diagnosis
          const diagRes = await apiFetch(`/api/v1/maintenance/cases/${json.data.id}/diagnose`, {
            method: 'POST',
          });
          const diagJson = await diagRes.json();
          const finalCase = diagJson.success ? diagJson.data : json.data;
          setCases((prev) =>
            prev.map((c) =>
              c.id === newCase.id
                ? { ...finalCase, history: c.history }
                : c
            )
          );
          setActiveCaseId(finalCase.id);
        }
      }
    } catch (err) {
      console.warn('Backend case creation call failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans">
      {/* Top Telemetry Header */}
      <div className="p-3 border-b border-[#E2E8F0] bg-white flex items-center justify-between text-xs font-mono text-[#1A202C]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#2563EB] font-bold">
            <Wrench className="w-4 h-4" />
            <span>MAINTENANCE & TROUBLESHOOTING WORKSPACE</span>
          </div>
          <span className="text-[#CBD5E1]">|</span>
          <span className="text-[#1A202C] font-bold">{activeCase.caseNumber}</span>
          <span className="text-[#2563EB] font-semibold">[{activeCase.plantId}]</span>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge label={activeCase.status} tone={getStatusTone(activeCase.status)} />
          <Button
            size="sm"
            onClick={() => setIsNewCaseModalOpen(true)}
            className="bg-[#151C24] hover:bg-black text-white font-medium shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Report Case
          </Button>
        </div>
      </div>

      {/* Main Split: Case Explorer (Left) + Evidence-to-Action Workspace (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Case Explorer & Filters */}
        <div className="w-80 border-r border-[#E2E8F0] bg-[#F8FAFC] flex flex-col justify-between overflow-hidden">
          {/* Filter Pills */}
          <div className="p-3 border-b border-[#E2E8F0] space-y-2 bg-white">
            <div className="text-[10px] font-mono uppercase text-[#64748B] font-semibold">
              Filter by Operational State
            </div>
            <div className="flex flex-wrap gap-1">
              {['ALL', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'ESCALATED_HUMAN', 'EXPERT_CANDIDATE'].map(
                (filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition border ${
                      statusFilter === filter
                        ? 'bg-[#2563EB] text-white border-[#2563EB] font-semibold shadow-xs'
                        : 'bg-white text-[#475569] border-[#E2E8F0] hover:text-[#1A202C] hover:bg-slate-50'
                    }`}
                  >
                    {filter === 'EXPERT_CANDIDATE' ? '⭐ Expert Candidates' : filter}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Cases List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredCases.map((c) => {
              const isSelected = c.id === activeCase.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveCaseId(c.id)}
                  className={`p-2.5 rounded-xl border text-xs font-mono cursor-pointer transition ${
                    isSelected
                      ? 'bg-white border-[#2563EB] text-[#1A202C] shadow-sm ring-1 ring-[#2563EB]'
                      : 'bg-white border-[#E2E8F0] hover:border-slate-300 text-[#1A202C] shadow-xs'
                  }`}
                >
                  <div className="flex justify-between items-center text-[10px] text-[#64748B] mb-1">
                    <span className="font-bold text-[#2563EB]">{c.caseNumber}</span>
                    <StatusBadge label={c.status} tone={getStatusTone(c.status)} />
                  </div>
                  <div className="font-semibold text-[#1A202C] line-clamp-1">{c.title}</div>
                  <div className="text-[10px] text-[#64748B] mt-1 line-clamp-1 font-sans">
                    {c.symptomDescription}
                  </div>
                  {c.candidateForExpertKnowledge && (
                    <div className="mt-1.5 flex items-center gap-1 text-[9px] text-amber-600 font-bold">
                      <span>⭐ Nominated Expert Knowledge</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed Case Workspace Stage */}
        <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 bg-[#F5F6F7]">
          {/* Header Banner */}
          <div className="flex justify-between items-start pb-4 border-b border-[#E2E8F0]">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold font-mono text-[#1A202C] uppercase tracking-wide">
                  {activeCase.title}
                </h1>
                <StatusBadge label={activeCase.status} tone={getStatusTone(activeCase.status)} />
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    activeCase.severity === 'CRITICAL'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  SEVERITY: {activeCase.severity}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] mt-1 font-mono">
                <span>Case: <strong className="text-[#1A202C]">{activeCase.caseNumber}</strong></span>
                <span>•</span>
                <span>Plant: {activeCase.plantId}</span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  Tech: <strong className="text-[#1A202C]">{activeCase.assignedTechnicianName || 'Unassigned'}</strong>
                  {activeCase.status !== 'CLOSED' && (
                    <button
                      onClick={() => setIsAssignModalOpen(true)}
                      className="text-[10px] text-[#2563EB] underline hover:text-[#1D4ED8] flex items-center gap-0.5 ml-1 font-medium"
                    >
                      <UserPlus className="w-3 h-3" />
                      {activeCase.assignedTechnicianName ? 'Reassign' : 'Assign'}
                    </button>
                  )}
                </span>
                <span>•</span>
                <span>Created: {new Date(activeCase.createdAt).toLocaleDateString()}</span>
                {activeCase.resolvedAt && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-700 font-semibold">
                      Resolved: {new Date(activeCase.resolvedAt).toLocaleTimeString()}
                    </span>
                  </>
                )}
                {activeCase.closedAt && (
                  <>
                    <span>•</span>
                    <span className="text-[#64748B] font-semibold">
                      Closed: {new Date(activeCase.closedAt).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeCase.status !== 'RESOLVED' && activeCase.status !== 'CLOSED' && !activeCase.isEscalated && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsEscalateModalOpen(true)}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Escalate to Human
                </Button>
              )}
            </div>
          </div>

          {/* Escalation Alert if Active */}
          {activeCase.isEscalated && (
            <AlertBanner
              tone="error"
              title="Work Order Escalated to Human Engineering"
              message={
                activeCase.escalationReason ||
                'AI guidance halted due to incomplete technical manual evidence or safety critical boundaries. Human sign-off required.'
              }
            />
          )}

          {/* Diagnostic Hypothesis & Grounded Evidence Card */}
          {activeCase.diagnosticHypothesis && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#2563EB]" />
                  <CardTitle>Grounded Diagnostic Hypothesis & Safety Directives</CardTitle>
                </div>
                <StatusBadge
                  label={`CONFIDENCE: ${activeCase.diagnosticHypothesis.confidence}`}
                  tone={
                    activeCase.diagnosticHypothesis.confidence === 'HIGH' ? 'healthy' : 'warning'
                  }
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="text-[10px] font-mono text-[#2563EB] uppercase font-bold">
                    Primary Root Cause Assessment
                  </div>
                  <p className="text-xs text-[#1A202C] font-mono leading-relaxed">
                    {activeCase.diagnosticHypothesis.primaryHypothesis}
                  </p>
                  <ul className="list-disc list-inside text-xs text-[#475569] space-y-1 pt-1 font-sans">
                    {activeCase.diagnosticHypothesis.rootCauses.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                {/* Safety Critical Directives */}
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-700 uppercase">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>Safety-Critical Controls (Non-Negotiable)</span>
                  </div>
                  {activeCase.diagnosticHypothesis.safetyCriticalWarnings.map((warn, i) => (
                    <p key={i} className="text-[11px] font-mono text-rose-800 leading-relaxed">
                      • {warn}
                    </p>
                  ))}
                </div>

                {/* Grounded Citation Cards */}
                <div>
                  <div className="text-[10px] font-mono text-[#64748B] uppercase font-semibold mb-2">
                    Verified Technical Manual Evidence Citations
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeCase.diagnosticHypothesis.evidenceCitations.map((cit, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1 text-xs font-mono"
                      >
                        <div className="flex justify-between items-start text-[10px]">
                          <span className="font-bold text-amber-700">{cit.documentNumber}</span>
                          <span className="text-[#64748B]">Page {cit.pageNumber}</span>
                        </div>
                        <p className="text-[11px] text-[#475569] font-sans leading-relaxed">
                          "{cit.snippet}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Guided Checklist Steps */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                <CardTitle>Approved Procedural Checklist (Evidence-Backed Steps)</CardTitle>
              </div>
              <span className="text-xs font-mono text-[#64748B]">
                Completed:{' '}
                {activeCase.checklist.filter((s) => s.status === 'COMPLETED').length} /{' '}
                {activeCase.checklist.length}
              </span>
            </CardHeader>
            <CardContent>
              {activeCase.checklist.length === 0 ? (
                <div className="text-xs font-mono text-[#64748B] italic py-4 text-center">
                  No automated checklist generated for this case status.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCase.checklist.map((step) => {
                    const isDone = step.status === 'COMPLETED';
                    return (
                      <div
                        key={step.id}
                        className={`p-3.5 rounded-xl border transition space-y-2.5 ${
                          isDone
                            ? 'bg-emerald-50/70 border-emerald-200 text-[#1A202C]'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#1A202C]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => handleToggleStep(step.id)}
                              className="mt-1 w-4 h-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold font-mono text-[#1A202C]">
                                  Step {step.stepNumber}: {step.title}
                                </span>
                                {step.requiresLoto && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-mono font-bold flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> LOTO REQUIRED
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#475569] font-sans mt-1 leading-relaxed">
                                {step.instruction}
                              </p>
                            </div>
                          </div>

                          <StatusBadge
                            label={step.status}
                            tone={isDone ? 'healthy' : 'warning'}
                          />
                        </div>

                        {/* Citation Reference Link */}
                        {step.citation && (
                          <div className="text-[10px] font-mono text-[#2563EB] pl-7 flex items-center gap-1.5 font-medium">
                            <FileText className="w-3 h-3 text-[#2563EB]" />
                            <span>
                              CITED: {step.citation.documentNumber} (Page {step.citation.pageNumber})
                            </span>
                          </div>
                        )}

                        {/* Technician Notes on Step */}
                        {step.technicianNotes && (
                          <div className="text-[11px] font-mono text-[#64748B] pl-7 italic">
                            Notes: {step.technicianNotes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Technician Findings & Sign-Off Submission Stage */}
          {activeCase.status === 'IN_PROGRESS' && (
            <Card>
              <CardHeader>
                <CardTitle>Technician Findings & Resolution Summary</CardTitle>
                <StatusBadge label="READY FOR SUBMISSION" tone="warning" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-[#475569] font-semibold">
                      Measured Final Torque (ft-lbs / Nm)
                    </label>
                    <input
                      type="text"
                      value={measuredTorque}
                      onChange={(e) => setMeasuredTorque(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-[#475569] font-semibold">
                      Technician Observations & Corrective Actions
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cleaned gland follower plate and completed 3-pass torque..."
                      value={findingsText}
                      onChange={(e) => setFindingsText(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSubmitFindings}
                    className="bg-[#151C24] hover:bg-black text-white font-medium shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Submit Work Order for Supervisor Approval
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Supervisor Approval & Review Panel */}
          {activeCase.status === 'PENDING_APPROVAL' && (
            <Card className="border-amber-300 bg-amber-50/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-600" />
                  <CardTitle>Supervisor Review & Work Order Authorization</CardTitle>
                </div>
                <StatusBadge label="AWAITING APPROVAL" tone="warning" pulse />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3.5 rounded-xl bg-white border border-amber-200 space-y-1 text-xs font-mono">
                  <div className="text-[10px] text-[#64748B] uppercase font-bold">
                    SUBMITTED RESOLUTION
                  </div>
                  <p className="text-[#1A202C]">
                    {activeCase.findings?.resolutionSummary || 'Work completed per approved SOP.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-[#475569] font-semibold">
                    Supervisor Reviewer Notes / Sign-Off Comments
                  </label>
                  <input
                    type="text"
                    placeholder="Enter review notes before sign-off..."
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="danger" size="sm" onClick={() => handleReviewApproval(false)}>
                    Reject Work Order (Request Rework)
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleReviewApproval(true)}
                    className="bg-[#2563EB] hover:bg-blue-700 text-white font-semibold shadow-sm"
                  >
                    Approve Work Order (Mark Resolved)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Work Order Resolved Card with Formally Close Action */}
          {activeCase.status === 'RESOLVED' && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-mono font-bold text-emerald-800">
                  WORK ORDER RESOLVED & SUPERVISOR APPROVED
                </span>
                <p className="text-[11px] text-[#475569] font-sans">
                  Approved by {activeCase.approval?.reviewedByUserId || 'Marcus Vance (Plant Manager)'} at{' '}
                  {activeCase.resolvedAt ? new Date(activeCase.resolvedAt).toLocaleTimeString() : 'Recent'}.
                  {activeCase.approval?.reviewerNotes && ` Note: "${activeCase.approval.reviewerNotes}"`}
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleCloseCase}
                className="bg-[#151C24] hover:bg-black text-white font-bold shrink-0 shadow-sm"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Formally Close Case
              </Button>
            </div>
          )}

          {/* Closed Case Archive Banner */}
          {activeCase.status === 'CLOSED' && (
            <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2 text-xs font-mono text-[#475569]">
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  Case formally verified, audited, and closed at{' '}
                  {activeCase.closedAt ? new Date(activeCase.closedAt).toLocaleTimeString() : 'N/A'}.
                </span>
              </div>
              <StatusBadge label="CLOSED & ARCHIVED" tone="healthy" />
            </div>
          )}

          {/* Case History & Audit Ledger */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#64748B]" />
                <CardTitle>Case History & Audit Trail</CardTitle>
              </div>
              <span className="text-[10px] font-mono text-[#64748B]">TAMPER-EVIDENT</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeCase.history.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-start justify-between text-xs font-mono"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-bold text-[#1A202C]">
                        <span>{h.action}</span>
                        <span className="text-[#64748B] text-[10px]">by {h.user}</span>
                      </div>
                      {h.notes && <p className="text-[11px] text-[#475569] font-sans">{h.notes}</p>}
                    </div>
                    <span className="text-[10px] text-[#64748B] shrink-0">
                      {new Date(h.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Escalate Case Modal */}
      <Modal
        isOpen={isEscalateModalOpen}
        onClose={() => setIsEscalateModalOpen(false)}
        title="Escalate Case to Human Reliability Engineer"
        subtitle="Halt automated procedure execution and escalate to qualified personnel"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsEscalateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleEscalateCase}>
              Confirm Safety Escalation
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <p className="text-[#475569]">
            Provide the specific risk or reason why automated procedures cannot safely proceed:
          </p>
          <textarea
            rows={3}
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="e.g. Suspected structural fissure or high-pressure gas leak requiring metallurgist..."
            className="w-full p-2.5 rounded-lg bg-white border border-[#CBD5E1] text-xs text-[#1A202C] font-mono focus:outline-none focus:border-rose-500"
          />
        </div>
      </Modal>

      {/* New Maintenance Case Modal */}
      <Modal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        title="Report New Maintenance Case"
        subtitle="Capture symptoms, asset context, and operating conditions"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsNewCaseModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateNewCase}
              disabled={isLoading}
              className="bg-[#151C24] hover:bg-black text-white font-semibold"
            >
              {isLoading ? 'Creating Case...' : 'Create Maintenance Case'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <div className="space-y-1">
            <label className="text-[#475569] font-medium">Case Title</label>
            <input
              type="text"
              placeholder="e.g. Seal Weepage on Crude Booster Pump"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[#475569] font-medium">Asset Tag</label>
              <select
                value={newAssetTag}
                onChange={(e) => setNewAssetTag(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="P-101-A">P-101-A (Booster Pump)</option>
                <option value="COMP-201">COMP-201 (Gas Compressor)</option>
                <option value="MOV-101">MOV-101 (Suction Block Valve)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[#475569] font-medium">Severity</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as MaintenanceCaseSeverity)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[#475569] font-medium">Reported Symptoms & Operating Anomalies</label>
            <textarea
              rows={3}
              placeholder="Describe audible noise, weepage, vibration, or temperature readings..."
              value={newSymptoms}
              onChange={(e) => setNewSymptoms(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] font-mono focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      </Modal>

      {/* Assign Technician Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Technician to Maintenance Case"
        subtitle="Designate lead certified personnel responsible for field procedure"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAssignTechnician}
              className="bg-[#151C24] hover:bg-black text-white font-semibold"
            >
              Confirm Assignment
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <div className="space-y-1">
            <label className="text-[#475569] font-medium">Select Qualified Technician</label>
            <select
              value={selectedTechName}
              onChange={(e) => setSelectedTechName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
            >
              <option value="Elena Rostova (Lead Technician)">
                Elena Rostova (Lead Technician - Rotating Equipment)
              </option>
              <option value="Devon Miller (Senior Reliability Tech)">
                Devon Miller (Senior Reliability Tech - Vibration & Alignment)
              </option>
              <option value="Kavita Patel (Instrumentation Tech)">
                Kavita Patel (Instrumentation Tech - Control Valves & Seals)
              </option>
            </select>
          </div>
          <p className="text-[11px] text-[#64748B] font-sans">
            Assigned technician will receive procedural checklists, LOTO requirements, and be credited on audit history.
          </p>
        </div>
      </Modal>
    </div>
  );
};

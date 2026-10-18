import React, { useState } from 'react';
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

  // Findings input state
  const [findingsText, setFindingsText] = useState('');
  const [measuredTorque, setMeasuredTorque] = useState('45');

  // New Case form state
  const [newTitle, setNewTitle] = useState('');
  const [newAssetTag, setNewAssetTag] = useState('P-101-A');
  const [newSeverity, setNewSeverity] = useState<MaintenanceCaseSeverity>('HIGH');
  const [newSymptoms, setNewSymptoms] = useState('');

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
      case 'ESCALATED_HUMAN':
        return 'critical';
      case 'REJECTED':
        return 'critical';
      default:
        return 'neutral';
    }
  };

  // Step toggle handler
  const handleToggleStep = (stepId: string) => {
    const updatedChecklist = activeCase.checklist.map((s) => {
      if (s.id === stepId) {
        const nextStatus: ChecklistStepStatus = s.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
        return {
          ...s,
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
          completedByUserId: nextStatus === 'COMPLETED' ? 'Elena Rostova (Technician)' : null,
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
  };

  // Submit Findings Handler
  const handleSubmitFindings = () => {
    const updatedCase: DemoCase = {
      ...activeCase,
      status: 'PENDING_APPROVAL',
      findings: {
        observations: findingsText || 'Gland follower aligned and torqued in 3-pass cross-star pattern.',
        measuredValues: { finalTorqueFtLbs: Number(measuredTorque) || 45 },
        resolutionSummary: 'P-101-A seal overhaul complete. Zero weepage observed.',
      },
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
  };

  // Approval Review Handler
  const handleReviewApproval = (approved: boolean) => {
    const newStatus: MaintenanceCaseStatus = approved ? 'RESOLVED' : 'REJECTED';
    const updatedCase: DemoCase = {
      ...activeCase,
      status: newStatus,
      approval: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedByUserId: 'Marcus Vance (Plant Manager)',
        reviewedAt: new Date().toISOString(),
        reviewerNotes: approvalNotes || (approved ? 'Sign-off complete.' : 'Rework required.'),
      },
      candidateForExpertKnowledge: approved,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: approved ? 'WORK_ORDER_APPROVED' : 'WORK_ORDER_REJECTED',
          user: 'Marcus Vance (Plant Manager)',
          timestamp: new Date().toISOString(),
          notes: approvalNotes || (approved ? 'Approved by supervisor.' : 'Rejected for rework.'),
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));
    setApprovalNotes('');
  };

  // Escalate Handler
  const handleEscalateCase = () => {
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
  };

  // New Case Creation Handler
  const handleCreateNewCase = () => {
    if (!newTitle.trim() || !newSymptoms.trim()) return;

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
    setNewTitle('');
    setNewSymptoms('');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950 font-sans">
      {/* Top Telemetry Header */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <Wrench className="w-4 h-4" />
            <span>MAINTENANCE & TROUBLESHOOTING WORKSPACE</span>
          </div>
          <span className="text-graphite-600">|</span>
          <span className="text-graphite-300 font-bold">{activeCase.caseNumber}</span>
          <span className="text-cyan-400">[{activeCase.plantId}]</span>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge label={activeCase.status} tone={getStatusTone(activeCase.status)} />
          <Button size="sm" onClick={() => setIsNewCaseModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Report Case
          </Button>
        </div>
      </div>

      {/* Main Split: Case Explorer (Left) + Evidence-to-Action Workspace (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Case Explorer & Filters */}
        <div className="w-80 border-r border-graphite-800 bg-graphite-900/40 flex flex-col justify-between overflow-hidden">
          {/* Filter Pills */}
          <div className="p-3 border-b border-graphite-800 space-y-2">
            <div className="text-[10px] font-mono uppercase text-graphite-500 font-semibold">
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
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 font-semibold'
                        : 'bg-graphite-950 text-graphite-400 border-graphite-800 hover:text-graphite-200'
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
                  className={`p-2.5 rounded-lg border text-xs font-mono cursor-pointer transition ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-graphite-100 shadow-lg shadow-amber-500/5'
                      : 'bg-graphite-950/70 border-graphite-800/80 hover:border-graphite-700 text-graphite-300'
                  }`}
                >
                  <div className="flex justify-between items-center text-[10px] text-graphite-500 mb-1">
                    <span className="font-bold text-amber-400">{c.caseNumber}</span>
                    <StatusBadge label={c.status} tone={getStatusTone(c.status)} />
                  </div>
                  <div className="font-semibold text-graphite-100 line-clamp-1">{c.title}</div>
                  <div className="text-[10px] text-graphite-400 mt-1 line-clamp-1 font-sans">
                    {c.symptomDescription}
                  </div>
                  {c.candidateForExpertKnowledge && (
                    <div className="mt-1.5 flex items-center gap-1 text-[9px] text-emerald-400 font-bold">
                      <span>⭐ Nominated Expert Knowledge</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed Case Workspace Stage */}
        <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 bg-graphite-950">
          {/* Header Banner */}
          <div className="flex justify-between items-start pb-4 border-b border-graphite-800">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold font-mono text-graphite-100 uppercase tracking-wide">
                  {activeCase.title}
                </h1>
                <StatusBadge label={activeCase.status} tone={getStatusTone(activeCase.status)} />
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    activeCase.severity === 'CRITICAL'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  SEVERITY: {activeCase.severity}
                </span>
              </div>
              <p className="text-xs text-graphite-400 mt-1 font-mono">
                Case: {activeCase.caseNumber} • Plant: {activeCase.plantId} • Reported by:{' '}
                {activeCase.reportedByUserId}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeCase.status !== 'RESOLVED' && !activeCase.isEscalated && (
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
                  <BookOpen className="w-4 h-4 text-cyan-400" />
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
                <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2">
                  <div className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">
                    Primary Root Cause Assessment
                  </div>
                  <p className="text-xs text-graphite-200 font-mono leading-relaxed">
                    {activeCase.diagnosticHypothesis.primaryHypothesis}
                  </p>
                  <ul className="list-disc list-inside text-xs text-graphite-400 space-y-1 pt-1 font-sans">
                    {activeCase.diagnosticHypothesis.rootCauses.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                {/* Safety Critical Directives */}
                <div className="p-3 rounded bg-rose-950/20 border border-rose-900/60 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400 uppercase">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Safety-Critical Controls (Non-Negotiable)</span>
                  </div>
                  {activeCase.diagnosticHypothesis.safetyCriticalWarnings.map((warn, i) => (
                    <p key={i} className="text-[11px] font-mono text-rose-300/90 leading-relaxed">
                      • {warn}
                    </p>
                  ))}
                </div>

                {/* Grounded Citation Cards */}
                <div>
                  <div className="text-[10px] font-mono text-graphite-500 uppercase font-semibold mb-2">
                    Verified Technical Manual Evidence Citations
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeCase.diagnosticHypothesis.evidenceCitations.map((cit, i) => (
                      <div
                        key={i}
                        className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-1 text-xs font-mono"
                      >
                        <div className="flex justify-between items-start text-[10px]">
                          <span className="font-bold text-amber-400">{cit.documentNumber}</span>
                          <span className="text-graphite-500">Page {cit.pageNumber}</span>
                        </div>
                        <p className="text-[11px] text-graphite-300 font-sans leading-relaxed">
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
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <CardTitle>Approved Procedural Checklist (Evidence-Backed Steps)</CardTitle>
              </div>
              <span className="text-xs font-mono text-graphite-400">
                Completed:{' '}
                {activeCase.checklist.filter((s) => s.status === 'COMPLETED').length} /{' '}
                {activeCase.checklist.length}
              </span>
            </CardHeader>
            <CardContent>
              {activeCase.checklist.length === 0 ? (
                <div className="text-xs font-mono text-graphite-500 italic py-4 text-center">
                  No automated checklist generated for this case status.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCase.checklist.map((step) => {
                    const isDone = step.status === 'COMPLETED';
                    return (
                      <div
                        key={step.id}
                        className={`p-3.5 rounded-lg border transition space-y-2.5 ${
                          isDone
                            ? 'bg-emerald-950/10 border-emerald-800/40 text-graphite-300'
                            : 'bg-graphite-950/80 border-graphite-800 text-graphite-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => handleToggleStep(step.id)}
                              className="mt-1 w-4 h-4 rounded border-graphite-700 text-emerald-500 focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold font-mono text-graphite-100">
                                  Step {step.stepNumber}: {step.title}
                                </span>
                                {step.requiresLoto && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[9px] font-mono font-bold flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> LOTO REQUIRED
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-graphite-300 font-sans mt-1 leading-relaxed">
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
                          <div className="text-[10px] font-mono text-cyan-400/90 pl-7 flex items-center gap-1.5">
                            <FileText className="w-3 h-3 text-cyan-400" />
                            <span>
                              CITED: {step.citation.documentNumber} (Page {step.citation.pageNumber})
                            </span>
                          </div>
                        )}

                        {/* Technician Notes on Step */}
                        {step.technicianNotes && (
                          <div className="text-[11px] font-mono text-graphite-400 pl-7 italic">
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
                    <label className="text-xs font-mono text-graphite-300">
                      Measured Final Torque (ft-lbs / Nm)
                    </label>
                    <input
                      type="text"
                      value={measuredTorque}
                      onChange={(e) => setMeasuredTorque(e.target.value)}
                      className="w-full px-3 py-1.5 bg-graphite-950 border border-graphite-800 rounded text-xs font-mono text-graphite-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-graphite-300">
                      Technician Observations & Corrective Actions
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cleaned gland follower plate and completed 3-pass torque..."
                      value={findingsText}
                      onChange={(e) => setFindingsText(e.target.value)}
                      className="w-full px-3 py-1.5 bg-graphite-950 border border-graphite-800 rounded text-xs font-mono text-graphite-100"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSubmitFindings}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Submit Work Order for Supervisor Approval
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Supervisor Approval & Review Panel */}
          {activeCase.status === 'PENDING_APPROVAL' && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                  <CardTitle>Supervisor Review & Work Order Authorization</CardTitle>
                </div>
                <StatusBadge label="AWAITING APPROVAL" tone="warning" pulse />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-1 text-xs font-mono">
                  <div className="text-[10px] text-graphite-500 uppercase">
                    SUBMITTED RESOLUTION
                  </div>
                  <p className="text-graphite-200">
                    {activeCase.findings?.resolutionSummary || 'Work completed per approved SOP.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-graphite-300">
                    Supervisor Reviewer Notes / Sign-Off Comments
                  </label>
                  <input
                    type="text"
                    placeholder="Enter review notes before sign-off..."
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-graphite-950 border border-graphite-800 rounded text-xs font-mono text-graphite-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="danger" size="sm" onClick={() => handleReviewApproval(false)}>
                    Reject Work Order (Request Rework)
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => handleReviewApproval(true)}>
                    Approve Work Order (Mark Resolved)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Case History & Audit Ledger */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-graphite-400" />
                <CardTitle>Case History & Audit Trail</CardTitle>
              </div>
              <span className="text-[10px] font-mono text-graphite-500">TAMPER-EVIDENT</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeCase.history.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded bg-graphite-950/70 border border-graphite-800/80 flex items-start justify-between text-xs font-mono"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-bold text-graphite-200">
                        <span>{h.action}</span>
                        <span className="text-graphite-500 text-[10px]">by {h.user}</span>
                      </div>
                      {h.notes && <p className="text-[11px] text-graphite-400 font-sans">{h.notes}</p>}
                    </div>
                    <span className="text-[10px] text-graphite-500 shrink-0">
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
          <p className="text-graphite-300">
            Provide the specific risk or reason why automated procedures cannot safely proceed:
          </p>
          <textarea
            rows={3}
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="e.g. Suspected structural fissure or high-pressure gas leak requiring metallurgist..."
            className="w-full p-2.5 rounded bg-graphite-950 border border-graphite-800 text-xs text-graphite-100 font-mono focus:outline-none focus:border-rose-500"
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
            <Button variant="primary" size="sm" onClick={handleCreateNewCase}>
              Create Maintenance Case
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <div className="space-y-1">
            <label className="text-graphite-400">Case Title</label>
            <input
              type="text"
              placeholder="e.g. Seal Weepage on Crude Booster Pump"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-graphite-400">Asset Tag</label>
              <select
                value={newAssetTag}
                onChange={(e) => setNewAssetTag(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-100"
              >
                <option value="P-101-A">P-101-A (Booster Pump)</option>
                <option value="COMP-201">COMP-201 (Gas Compressor)</option>
                <option value="MOV-101">MOV-101 (Suction Block Valve)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-graphite-400">Severity</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as MaintenanceCaseSeverity)}
                className="w-full px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-100"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-graphite-400">Reported Symptoms & Operating Anomalies</label>
            <textarea
              rows={3}
              placeholder="Describe audible noise, weepage, vibration, or temperature readings..."
              value={newSymptoms}
              onChange={(e) => setNewSymptoms(e.target.value)}
              className="w-full p-2.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-100 font-mono"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

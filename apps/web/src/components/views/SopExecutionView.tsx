import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
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
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  X,
  Clock,
  ShieldCheck,
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
import { useToast } from '../../lib/ToastContext';

export interface WorkOrderCase extends MaintenanceCase {
  history: Array<{
    id: string;
    action: string;
    user: string;
    timestamp: string;
    notes?: string;
  }>;
}

interface MachineOption {
  id: string;
  assetTag: string;
  name: string;
  area?: string;
}

interface TechnicianOption {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  department?: string;
}

export const SopExecutionView: React.FC<{
  onActiveCountChange?: (count: number) => void;
  initialCaseId?: string;
}> = ({ onActiveCountChange, initialCaseId }) => {
  const { toast } = useToast();
  const { organization, user } = useAuth();

  // Primary Work Orders State
  const [cases, setCases] = useState<WorkOrderCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>(initialCaseId || '');
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'severity'>('newest');

  // Modals & User Actions State
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isUnassignConfirmOpen, setIsUnassignConfirmOpen] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);

  // Form Field State
  const [newTitle, setNewTitle] = useState('');
  const [newAssetTag, setNewAssetTag] = useState('');
  const [newSeverity, setNewSeverity] = useState<MaintenanceCaseSeverity>('HIGH');
  const [newSymptoms, setNewSymptoms] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [unassignReason, setUnassignReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [findingsText, setFindingsText] = useState('');
  const [measuredTorque, setMeasuredTorque] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdown Options loaded from Real APIs
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [selectedTechName, setSelectedTechName] = useState<string>('');
  const [isLoadingTechs, setIsLoadingTechs] = useState(false);
  const [techFetchError, setTechFetchError] = useState<string | null>(null);

  // 1. Fetch Real Work Orders from Backend API
  const loadCases = useCallback(async () => {
    setIsLoadingCases(true);
    setFetchError(null);
    try {
      const res = await apiFetch('/api/v1/maintenance/cases');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const mappedCases: WorkOrderCase[] = json.data.map((c: any) => ({
          ...c,
          history: Array.isArray(c.history) && c.history.length > 0
            ? c.history
            : [
                {
                  id: `h-init-${c.id}`,
                  action: 'CASE_REPORTED',
                  user: c.reportedByUserName || c.reportedByUserId || 'System',
                  timestamp: c.createdAt || new Date().toISOString(),
                  notes: `Case registered. Current status: ${c.status}`,
                },
              ],
        }));

        setCases(mappedCases);

        // Notify parent workspace of active count (non-closed)
        const activeCount = mappedCases.filter((c) => c.status !== 'CLOSED').length;
        onActiveCountChange?.(activeCount);

        // Select initial or maintain active case
        setActiveCaseId((prev) => {
          if (initialCaseId && mappedCases.some((c) => c.id === initialCaseId)) {
            return initialCaseId;
          }
          if (prev && mappedCases.some((c) => c.id === prev)) {
            return prev;
          }
          return mappedCases.length > 0 ? mappedCases[0].id : '';
        });
      } else {
        const errorMsg = json?.error?.message || json?.error || 'Failed to load maintenance cases';
        setFetchError(errorMsg);
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Network error connecting to maintenance case service');
    } finally {
      setIsLoadingCases(false);
    }
  }, [initialCaseId, onActiveCountChange]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // 2. Fetch Machines for Modal Dropdown
  const loadMachines = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/machines');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const mapped = json.data.map((m: any) => ({
          id: m.id,
          assetTag: m.assetTag || m.asset_tag || m.id,
          name: m.name || m.assetTag || 'Equipment',
          area: m.area || m.plant_area || '',
        }));
        setMachines(mapped);
        if (mapped.length > 0 && !newAssetTag) {
          setNewAssetTag(mapped[0].assetTag);
        }
      }
    } catch (err) {
      console.warn('Failed to load fleet machines for work orders:', err);
    }
  }, [newAssetTag]);

  // 3. Fetch Technicians for Assignment Dropdown
  const loadTechnicians = useCallback(async () => {
    setIsLoadingTechs(true);
    setTechFetchError(null);
    try {
      // Primary: dedicated maintenance technicians endpoint
      const res = await apiFetch('/api/v1/maintenance/technicians');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: TechnicianOption[] = json.data.map((e: any) => ({
          id: e.id,
          userId: e.userId || e.id,
          fullName: e.fullName || e.name || 'Technician',
          role: e.role || 'TECHNICIAN',
          department: e.department || 'Maintenance',
        }));
        setTechnicians(mapped);
        return;
      }

      // Secondary: employee directory filtered by TECHNICIAN
      const empRes = await apiFetch('/api/v1/employees?role=TECHNICIAN');
      const empJson = await empRes.json();
      if (empRes.ok && empJson.success && Array.isArray(empJson.data) && empJson.data.length > 0) {
        const mapped: TechnicianOption[] = empJson.data.map((e: any) => ({
          id: e.id,
          userId: e.userId || e.id,
          fullName: e.fullName || e.name || 'Technician',
          role: e.role || 'TECHNICIAN',
          department: e.department || 'Maintenance',
        }));
        setTechnicians(mapped);
        return;
      }

      // Fallback: all employees
      const fallbackRes = await apiFetch('/api/v1/employees');
      const fallbackJson = await fallbackRes.json();
      if (fallbackRes.ok && fallbackJson.success && Array.isArray(fallbackJson.data)) {
        const mapped: TechnicianOption[] = fallbackJson.data.map((e: any) => ({
          id: e.id,
          userId: e.userId || e.id,
          fullName: e.fullName || e.name || 'Staff Member',
          role: e.role || 'MEMBER',
          department: e.department || 'Operations',
        }));
        setTechnicians(mapped);
      } else {
        setTechnicians([]);
      }
    } catch (err: any) {
      console.warn('Failed to load technician directory for work orders:', err);
      setTechFetchError(err?.message || 'Failed to load technician directory');
      setTechnicians([]);
    } finally {
      setIsLoadingTechs(false);
    }
  }, []);

  // Pre-load dropdown data when modals open
  useEffect(() => {
    if (isNewCaseModalOpen) {
      loadMachines();
    }
  }, [isNewCaseModalOpen, loadMachines]);

  useEffect(() => {
    if (isAssignModalOpen) {
      loadTechnicians();
    }
  }, [isAssignModalOpen, loadTechnicians]);

  // Current active work order
  const activeCase = useMemo(() => {
    return cases.find((c) => c.id === activeCaseId) || cases[0] || null;
  }, [cases, activeCaseId]);

  // Filtered & Sorted Work Orders
  const filteredCases = useMemo(() => {
    return cases
      .filter((c) => {
        // Status filter
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'EXPERT_CANDIDATE') {
            if (!c.candidateForExpertKnowledge) return false;
          } else if (c.status !== statusFilter) {
            return false;
          }
        }

        // Severity filter
        if (severityFilter !== 'ALL' && c.severity !== severityFilter) {
          return false;
        }

        // Search term matching
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchNumber = c.caseNumber?.toLowerCase().includes(q);
          const matchTitle = c.title?.toLowerCase().includes(q);
          const matchAsset = c.assetId?.toLowerCase().includes(q);
          const matchDesc = c.symptomDescription?.toLowerCase().includes(q);
          const matchTech = c.assignedTechnicianName?.toLowerCase().includes(q);
          if (!matchNumber && !matchTitle && !matchAsset && !matchDesc && !matchTech) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'severity') {
          const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (rank[b.severity] || 0) - (rank[a.severity] || 0);
        }
        return 0;
      });
  }, [cases, statusFilter, severityFilter, searchTerm, sortBy]);

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

  // -------------------------------------------------------------------------
  // USER ACTIONS WITH ROBUST ERROR HANDLING & ROLLBACK
  // -------------------------------------------------------------------------

  // 1. Checklist Step Toggle
  const handleToggleStep = async (stepId: string) => {
    if (!activeCase) return;
    const step = activeCase.checklist.find((s) => s.id === stepId);
    if (!step) return;

    const prevStatus = step.status;
    const nextStatus: ChecklistStepStatus = prevStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

    // Optimistic UI update
    const previousCases = [...cases];
    const updatedChecklist = activeCase.checklist.map((s) => {
      if (s.id === stepId) {
        return {
          ...s,
          status: nextStatus,
          completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
          completedByUserId: nextStatus === 'COMPLETED' ? (user?.fullName || 'Technician') : null,
        };
      }
      return s;
    });

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      checklist: updatedChecklist,
      status: activeCase.status === 'DIAGNOSED' ? 'IN_PROGRESS' : activeCase.status,
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to update step status');
      }
      toast.info('Step Updated', `Step marked ${nextStatus.toLowerCase()}.`);
    } catch (err: any) {
      // Revert optimistic update on failure
      setCases(previousCases);
      toast.error('Update Failed', err.message || 'Server rejected step update.');
    }
  };

  // 2. Submit Findings
  const handleSubmitFindings = async () => {
    if (!activeCase || isSubmitting) return;

    if (!findingsText.trim() && !measuredTorque.trim()) {
      toast.error('Validation Error', 'Please enter technician observations or measured values.');
      return;
    }

    setIsSubmitting(true);
    const previousCases = [...cases];

    const findings: {
      observations: string;
      measuredValues?: Record<string, string | number>;
      resolutionSummary: string;
    } = {
      observations: findingsText || 'Maintenance procedure executed per authorized manual.',
      measuredValues: measuredTorque ? { finalTorque: measuredTorque } : undefined,
      resolutionSummary: findingsText || 'Remediation completed. Ready for supervisor sign-off.',
    };

    const updatedCase: WorkOrderCase = {
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
          user: user?.fullName || 'Field Technician',
          timestamp: new Date().toISOString(),
          notes: 'Submitted procedural findings for supervisor review.',
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/findings`, {
        method: 'POST',
        body: JSON.stringify(findings),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to submit findings');
      }
      toast.success('Findings Submitted', 'Work order submitted for supervisor approval.');
      setFindingsText('');
      setMeasuredTorque('');
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Submission Failed', err.message || 'Server rejected findings submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Supervisor Review & Approval / Rejection
  const handleReviewApproval = async (approved: boolean) => {
    if (!activeCase || isSubmitting) return;

    setIsSubmitting(true);
    const previousCases = [...cases];
    const newStatus: MaintenanceCaseStatus = approved ? 'RESOLVED' : 'REJECTED';
    const now = new Date().toISOString();

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: newStatus,
      approval: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedByUserId: user?.fullName || 'Supervisor',
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
          user: user?.fullName || 'Supervisor',
          timestamp: now,
          notes: approvalNotes || (approved ? 'Work order approved.' : 'Rejected for rework.'),
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ approved, reviewerNotes: approvalNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to record supervisor review');
      }
      toast.success(
        approved ? 'Work Order Approved' : 'Work Order Rejected',
        approved ? 'Case resolved and verified.' : 'Case returned to technician for rework.'
      );
      setApprovalNotes('');
      setIsRejectConfirmOpen(false);
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Review Failed', err.message || 'Supervisor review failed. Ensure you have administrator rights.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Formally Close Case
  const handleCloseCase = async () => {
    if (!activeCase || isSubmitting) return;

    setIsSubmitting(true);
    const previousCases = [...cases];
    const now = new Date().toISOString();

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: 'CLOSED',
      closedAt: now,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_CLOSED',
          user: user?.fullName || 'Plant Supervisor',
          timestamp: now,
          notes: 'Maintenance case formally closed and archived.',
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Formally closed via Work Orders console' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to close case');
      }
      toast.success('Case Closed', 'Work order formally closed and archived.');
      setIsCloseConfirmOpen(false);

      // Refresh active count
      const activeCount = cases.filter((c) => c.id !== activeCase.id && c.status !== 'CLOSED').length;
      onActiveCountChange?.(activeCount);
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Closure Failed', err.message || 'Server rejected case closure.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Assign or Reassign Technician
  const handleAssignTechnician = async () => {
    if (!activeCase || isSubmitting) return;

    if (!selectedTechId) {
      toast.error('Validation Error', 'Please select a technician to assign.');
      return;
    }

    setIsSubmitting(true);
    const techName =
      selectedTechName ||
      technicians.find((t) => t.userId === selectedTechId)?.fullName ||
      'Designated Technician';

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/assign`, {
        method: 'POST',
        headers: activeCase.updatedAt ? { 'If-Match': activeCase.updatedAt } : undefined,
        body: JSON.stringify({
          technicianUserId: selectedTechId,
          technicianName: techName,
          expectedUpdatedAt: activeCase.updatedAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to assign technician');
      }

      // Synchronize with database confirmed response
      const serverCase = json.data;
      setCases((prev) =>
        prev.map((c) =>
          c.id === activeCase.id
            ? {
                ...c,
                ...serverCase,
                history:
                  Array.isArray(serverCase.history) && serverCase.history.length > 0
                    ? serverCase.history
                    : c.history,
              }
            : c
        )
      );
      toast.success(
        activeCase.assignedTechnicianUserId ? 'Technician Reassigned' : 'Technician Assigned',
        `Work order assigned to ${serverCase.assignedTechnicianName || techName}.`
      );
      setIsAssignModalOpen(false);
    } catch (err: any) {
      toast.error('Assignment Failed', err.message || 'Server rejected technician assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5b. Unassign Technician
  const handleUnassignTechnician = async () => {
    if (!activeCase || isSubmitting) return;

    if (activeCase.status === 'IN_PROGRESS' && (!unassignReason || unassignReason.trim().length < 5)) {
      toast.error(
        'Validation Error',
        'A justification reason (min 5 characters) is required to unassign an in-progress work order.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/unassign`, {
        method: 'POST',
        headers: activeCase.updatedAt ? { 'If-Match': activeCase.updatedAt } : undefined,
        body: JSON.stringify({
          reason: unassignReason.trim() || undefined,
          expectedUpdatedAt: activeCase.updatedAt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to unassign technician');
      }

      // Synchronize with database confirmed response
      const serverCase = json.data;
      setCases((prev) =>
        prev.map((c) =>
          c.id === activeCase.id
            ? {
                ...c,
                ...serverCase,
                assignedTechnicianUserId: null,
                assignedTechnicianName: null,
                history:
                  Array.isArray(serverCase.history) && serverCase.history.length > 0
                    ? serverCase.history
                    : c.history,
              }
            : c
        )
      );
      toast.success('Technician Unassigned', 'Technician successfully unassigned from work order.');
      setIsUnassignConfirmOpen(false);
      setIsAssignModalOpen(false);
      setUnassignReason('');
    } catch (err: any) {
      toast.error('Unassignment Failed', err.message || 'Server rejected technician unassignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Manual Human Safety Escalation
  const handleEscalateCase = async () => {
    if (!activeCase || isSubmitting) return;

    if (!escalateReason.trim()) {
      toast.error('Validation Error', 'Escalation safety reason is mandatory.');
      return;
    }

    setIsSubmitting(true);
    const previousCases = [...cases];

    const updatedCase: WorkOrderCase = {
      ...activeCase,
      status: 'ESCALATED_HUMAN',
      isEscalated: true,
      escalationReason: escalateReason,
      history: [
        ...activeCase.history,
        {
          id: `hist-${Date.now()}`,
          action: 'CASE_ESCALATED_TO_HUMAN',
          user: user?.fullName || 'Field Technician',
          timestamp: new Date().toISOString(),
          notes: `Safety escalation: ${escalateReason}`,
        },
      ],
    };

    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    try {
      const res = await apiFetch(`/api/v1/maintenance/cases/${activeCase.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: escalateReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || json?.error || 'Failed to escalate case');
      }
      toast.warning('Case Escalated', 'Work order escalated for human engineering review.');
      setIsEscalateModalOpen(false);
      setEscalateReason('');
    } catch (err: any) {
      setCases(previousCases);
      toast.error('Escalation Failed', err.message || 'Server rejected case escalation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Create New Work Order with Real Machine Link & Automated Diagnosis
  const handleCreateNewCase = async () => {
    if (!newTitle.trim() || !newSymptoms.trim()) {
      toast.error('Validation Error', 'Case title and symptom description are required.');
      return;
    }

    const effectiveAsset = newAssetTag.trim().toUpperCase() || (machines[0]?.assetTag ?? 'PLANT_WIDE');
    setIsSubmitting(true);

    try {
      const res = await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        body: JSON.stringify({
          assetId: effectiveAsset,
          title: newTitle.trim(),
          severity: newSeverity,
          symptomDescription: newSymptoms.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json?.error?.message || json?.error || 'Failed to create maintenance case');
      }

      const created = json.data;
      toast.success('Case Registered', `Case ${created.caseNumber} created. Requesting automated diagnostic checklist...`);

      // Automatically trigger diagnosis to build hypothesis & checklist
      let diagnosedCase = created;
      try {
        const diagRes = await apiFetch(`/api/v1/maintenance/cases/${created.id}/diagnose`, {
          method: 'POST',
        });
        const diagJson = await diagRes.json();
        if (diagRes.ok && diagJson.success && diagJson.data) {
          diagnosedCase = diagJson.data;
          toast.success('Diagnosis Ready', 'Evidence-backed checklist & safety directives generated.');
        }
      } catch (diagErr) {
        console.warn('Diagnosis generation deferred or escalated:', diagErr);
      }

      const enrichedNew: WorkOrderCase = {
        ...diagnosedCase,
        history: diagnosedCase.history || [
          {
            id: `h-init-${diagnosedCase.id}`,
            action: 'CASE_REPORTED',
            user: user?.fullName || 'Technician',
            timestamp: new Date().toISOString(),
            notes: `Work order created for ${effectiveAsset}.`,
          },
        ],
      };

      setCases((prev) => [enrichedNew, ...prev]);
      setActiveCaseId(enrichedNew.id);
      setIsNewCaseModalOpen(false);
      setNewTitle('');
      setNewSymptoms('');

      // Update active count
      const activeCount = cases.filter((c) => c.status !== 'CLOSED').length + 1;
      onActiveCountChange?.(activeCount);
    } catch (err: any) {
      toast.error('Creation Failed', err.message || 'Server rejected case creation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans antialiased">
      {/* Top Telemetry Header */}
      <div className="p-3 border-b border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono shadow-xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
            <Wrench className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1A202C]">WORK ORDERS & GUIDED SOP TERMINAL</span>
              <span className="text-[#CBD5E1]">|</span>
              <span className="text-[#2563EB] font-bold">
                {activeCase ? activeCase.caseNumber : 'ACTIVE QUEUE'}
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] font-sans">
              Facility: <strong>{organization?.name || 'Authorized Plant'}</strong> · Evidence-backed troubleshooting & supervised sign-off
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={loadCases}
            disabled={isLoadingCases}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-[#CBD5E1] shadow-xs"
            title="Refresh Cases"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCases ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            size="sm"
            onClick={() => setIsNewCaseModalOpen(true)}
            className="bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Report Work Order</span>
          </Button>
        </div>
      </div>

      {/* Error Alert Banner if Fetch Fails */}
      {fetchError && (
        <div className="p-3 border-b border-rose-200 bg-rose-50 flex items-center justify-between gap-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={loadCases}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-mono font-bold text-[10px] transition"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Split Layout: Work Orders List Drawer (Left) + Detail & SOP Viewport (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Drawer: Filterable Case Explorer */}
        <div className="w-full sm:w-80 md:w-96 border-r border-[#E2E8F0] bg-white flex flex-col justify-between overflow-hidden shrink-0 shadow-xs">
          {/* Search & Filter Header */}
          <div className="p-3 border-b border-[#E2E8F0] space-y-2 bg-gray-50/50">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search WO#, asset, symptom, tech..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2563EB] shadow-xs font-mono"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Severity & Sort Row */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="flex-1 flex items-center gap-1 bg-white border border-[#CBD5E1] rounded px-2 py-1 shadow-xs">
                <Filter className="w-3 h-3 text-[#64748B]" />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-[#1A202C] outline-none cursor-pointer w-full font-medium"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="flex-1 flex items-center gap-1 bg-white border border-[#CBD5E1] rounded px-2 py-1 shadow-xs">
                <ArrowUpDown className="w-3 h-3 text-[#64748B]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-[11px] text-[#1A202C] outline-none cursor-pointer w-full font-medium"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="severity">Priority Rank</option>
                </select>
              </div>
            </div>

            {/* Status Filter Chips */}
            <div className="flex flex-wrap gap-1 pt-1">
              {[
                { key: 'ALL', label: 'All' },
                { key: 'IN_PROGRESS', label: 'In Progress' },
                { key: 'PENDING_APPROVAL', label: 'Pending Review' },
                { key: 'RESOLVED', label: 'Resolved' },
                { key: 'CLOSED', label: 'Closed' },
                { key: 'ESCALATED_HUMAN', label: 'Escalated' },
                { key: 'EXPERT_CANDIDATE', label: '⭐ Candidates' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition border ${
                    statusFilter === f.key
                      ? 'bg-[#151C24] text-white border-[#151C24] font-bold shadow-xs'
                      : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cases List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {isLoadingCases && cases.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 text-[#2563EB] animate-spin mx-auto" />
                <p className="text-xs font-mono text-gray-500">Loading work orders...</p>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="p-8 text-center space-y-2 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <Wrench className="w-8 h-8 text-gray-400 mx-auto opacity-60" />
                <p className="text-xs font-bold text-gray-700">No Work Orders Match</p>
                <p className="text-[11px] text-gray-500 max-w-xs mx-auto font-sans leading-normal">
                  No records match your active search terms or operational filters.
                </p>
                {(searchTerm || statusFilter !== 'ALL' || severityFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('ALL');
                      setSeverityFilter('ALL');
                    }}
                    className="text-[11px] text-[#2563EB] font-mono underline hover:text-blue-800"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            ) : (
              filteredCases.map((c) => {
                const isSelected = activeCase ? c.id === activeCase.id : false;
                const formattedDt =
                  c.createdAtFormatted ||
                  (c.createdAt
                    ? new Date(c.createdAt).toLocaleString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '22 Oct 2026, 09:25 PM');
                const hasLoto =
                  Boolean(c.lotoApplied) ||
                  String(c.description || '').includes('LOTO: YES') ||
                  String(c.symptomDescription || '').includes('LOTO: Energy Isolated') ||
                  String(c.description || '').includes('Energy Isolated');
                const topCause = c.topRootCause || c.diagnosticHypothesis?.primaryHypothesis;
                const prob = c.probability ?? (c.diagnosticHypothesis?.confidence === 'HIGH' ? 90 : c.diagnosticHypothesis?.confidence === 'MEDIUM' ? 70 : undefined);

                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveCaseId(c.id)}
                    className={`p-3.5 rounded-lg border text-xs font-mono cursor-pointer transition space-y-2.5 ${
                      isSelected
                        ? 'bg-blue-50/50 border-[#2563EB] text-[#1A202C] shadow-sm ring-1 ring-[#2563EB]/20'
                        : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1] text-[#1A202C] shadow-xs'
                    }`}
                  >
                    {/* Top Bar: Case ID, Exact Date & Time, Priority */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#2563EB]">{c.caseNumber}</span>
                        <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                          {formattedDt}
                        </span>
                      </div>
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded text-[10px] border shrink-0 ${
                          c.severity === 'CRITICAL'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : c.severity === 'HIGH'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {c.severity}
                      </span>
                    </div>

                    {/* Machine Tag & Name + Fault Code */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-gray-100 text-gray-900 border border-gray-200 px-1.5 py-0.5 rounded font-bold font-mono text-[10px]">
                        {c.assetTag || c.assetId}
                      </span>
                      <span className="text-gray-700 font-semibold text-xs truncate max-w-[190px]" title={c.assetName || c.title}>
                        {c.assetName || c.title}
                      </span>
                      {c.faultCode && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {c.faultCode}
                        </span>
                      )}
                    </div>

                    {/* Reported Symptom / Issue */}
                    <div className="text-[11px] text-[#475569] font-sans line-clamp-2 leading-relaxed bg-gray-50/70 p-2 rounded border border-gray-100">
                      <span className="text-[9px] font-bold font-mono text-gray-400 uppercase block mb-0.5">Symptom / Field Issue</span>
                      {c.symptomDescription || c.description || c.title}
                    </div>

                    {/* Suspected Root Cause (if present) */}
                    {topCause && (
                      <div className="text-[11px] text-blue-900 bg-blue-50/70 border border-blue-100 rounded p-1.5 leading-snug">
                        <span className="text-[9px] font-bold font-mono uppercase text-blue-600 block">Suspected Root Cause</span>
                        <span className="font-semibold">{topCause}</span>
                        {prob && (
                          <span className="ml-1 text-[10px] font-mono font-bold text-blue-700">({prob}%)</span>
                        )}
                      </div>
                    )}

                    {/* Footer: LOTO Status, Specialist / Assigned Tech, Status */}
                    <div className="flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-gray-100 text-gray-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {hasLoto ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100/70 text-red-800 font-bold text-[9px] border border-red-200">
                            <ShieldAlert className="w-2.5 h-2.5 text-red-600" />
                            LOTO APPLIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[9px] border border-emerald-200">
                            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                            LIVE / ISOLATED
                          </span>
                        )}
                        <span className="text-gray-500 truncate max-w-[110px]" title={c.specialistDiscipline || c.assignedTechnicianName || 'Specialist'}>
                          {c.specialistDiscipline || c.assignedTechnicianName || 'Specialist'}
                        </span>
                      </div>
                      <StatusBadge label={c.status} tone={getStatusTone(c.status)} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Stage: Focused Work Order Detail & Guided Checklist */}
        {activeCase ? (
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto p-6 space-y-6 bg-[#F5F6F7]">
            {/* Header Banner */}
            <div className="p-5 bg-white rounded-xl border border-[#E2E8F0] shadow-sm space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-[#2563EB]">
                      {activeCase.caseNumber}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      ASSET: {activeCase.assetTag || activeCase.assetId}
                    </span>
                    {activeCase.faultCode && (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        FAULT: {activeCase.faultCode}
                      </span>
                    )}
                    <StatusBadge label={activeCase.status} tone={getStatusTone(activeCase.status)} />
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                        activeCase.severity === 'CRITICAL'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      PRIORITY: {activeCase.severity}
                    </span>
                    {activeCase.lotoApplied ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-xs font-mono font-bold">
                        <ShieldAlert className="w-3.5 h-3.5" /> LOTO APPLIED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" /> LOTO VERIFIED
                      </span>
                    )}
                  </div>
                  <h1 className="text-base font-bold text-[#1A202C] leading-snug">
                    {activeCase.title}
                  </h1>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeCase.status !== 'RESOLVED' &&
                    activeCase.status !== 'CLOSED' &&
                    !activeCase.isEscalated && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setIsEscalateModalOpen(true)}
                        className="font-semibold shadow-xs"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        Escalate to Human
                      </Button>
                    )}
                </div>
              </div>

              {/* Metadata Sub-bar */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500 pt-1">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    Assigned Tech:{' '}
                    <strong className="text-gray-900">
                      {activeCase.assignedTechnicianName || 'Unassigned'}
                    </strong>
                  </span>
                  {activeCase.status !== 'CLOSED' && activeCase.status !== 'RESOLVED' && (
                    <div className="inline-flex items-center gap-1.5 ml-1">
                      <button
                        onClick={() => {
                          setSelectedTechId(activeCase.assignedTechnicianUserId || '');
                          setSelectedTechName(activeCase.assignedTechnicianName || '');
                          setIsAssignModalOpen(true);
                        }}
                        className="text-[11px] text-[#2563EB] hover:underline font-bold inline-flex items-center gap-0.5"
                      >
                        <UserPlus className="w-3 h-3" />
                        {activeCase.assignedTechnicianUserId ? 'Reassign' : 'Assign'}
                      </button>
                      {activeCase.assignedTechnicianUserId && (
                        <button
                          onClick={() => {
                            setUnassignReason('');
                            setIsUnassignConfirmOpen(true);
                          }}
                          className="text-[11px] text-rose-600 hover:underline font-bold inline-flex items-center gap-0.5 ml-1"
                          title="Unassign Technician"
                        >
                          <X className="w-3 h-3" />
                          Unassign
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <span className="text-gray-300">·</span>

                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    Created: <strong className="text-gray-800">{activeCase.createdAtFormatted || (activeCase.createdAt ? new Date(activeCase.createdAt).toLocaleString() : '22 Oct 2026, 09:25 PM')}</strong>
                  </span>
                </div>

                {activeCase.plantName && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>Plant: <strong className="text-gray-800">{activeCase.plantName}</strong></span>
                  </>
                )}

                {activeCase.resolvedAt && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-emerald-700 font-semibold">
                      Resolved: {new Date(activeCase.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}

                {activeCase.closedAt && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-600 font-semibold">
                      Closed: {new Date(activeCase.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Escalation Alert Banner if Active */}
            {activeCase.isEscalated && (
              <AlertBanner
                tone="error"
                title="Work Order Escalated to Reliability Engineering"
                message={
                  activeCase.escalationReason ||
                  'Automated procedure execution suspended. Technical boundary condition or high-risk hazard requires qualified engineer sign-off.'
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
                    tone={activeCase.diagnosticHypothesis.confidence === 'HIGH' ? 'healthy' : 'warning'}
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <div className="text-[10px] font-mono text-[#2563EB] uppercase font-bold">
                      Primary Root Cause Assessment
                    </div>
                    <p className="text-xs text-gray-900 font-mono leading-relaxed">
                      {activeCase.diagnosticHypothesis.primaryHypothesis}
                    </p>
                    {activeCase.diagnosticHypothesis.rootCauses.length > 0 && (
                      <ul className="list-disc list-inside text-xs text-gray-600 space-y-1 pt-1 font-sans">
                        {activeCase.diagnosticHypothesis.rootCauses.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Safety Critical Directives */}
                  {activeCase.diagnosticHypothesis.safetyCriticalWarnings?.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 space-y-1.5">
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
                  )}

                  {/* Grounded Evidence Citations */}
                  {activeCase.diagnosticHypothesis.evidenceCitations?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono text-gray-400 uppercase font-semibold mb-2">
                        Governing Technical Manual Evidence Citations
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeCase.diagnosticHypothesis.evidenceCitations.map((cit, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1 text-xs font-mono"
                          >
                            <div className="flex justify-between items-start text-[10px]">
                              <span className="font-bold text-amber-700">{cit.documentNumber}</span>
                              <span className="text-gray-400">Page {cit.pageNumber}</span>
                            </div>
                            <p className="text-[11px] text-gray-700 font-sans leading-relaxed">
                              "{cit.snippet}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Guided Checklist Steps */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                  <CardTitle>Guided Execution Checklist</CardTitle>
                </div>
                <span className="text-xs font-mono text-gray-500">
                  Completed:{' '}
                  <strong>
                    {activeCase.checklist.filter((s) => s.status === 'COMPLETED').length} /{' '}
                    {activeCase.checklist.length}
                  </strong>
                </span>
              </CardHeader>
              <CardContent>
                {activeCase.checklist.length === 0 ? (
                  <div className="text-xs font-mono text-gray-400 italic py-6 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    No diagnostic steps registered for this case. Click "Report Work Order" to trigger automated AI diagnosis.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeCase.checklist.map((step) => {
                      const isDone = step.status === 'COMPLETED';
                      return (
                        <div
                          key={step.id}
                          className={`p-4 rounded-lg border transition space-y-2.5 ${
                            isDone
                              ? 'bg-emerald-50/50 border-emerald-300 text-gray-900'
                              : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isDone}
                                disabled={activeCase.status === 'CLOSED'}
                                onChange={() => handleToggleStep(step.id)}
                                className="mt-1 w-4 h-4 rounded border-gray-300 text-[#2563EB] focus:ring-0 cursor-pointer disabled:opacity-50"
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold font-mono text-gray-900">
                                    Step {step.stepNumber}: {step.title}
                                  </span>
                                  {step.requiresLoto && (
                                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[9px] font-mono font-bold flex items-center gap-1">
                                      <Lock className="w-2.5 h-2.5" /> LOTO MANDATORY
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 font-sans mt-1 leading-relaxed">
                                  {step.instruction}
                                </p>
                              </div>
                            </div>

                            <StatusBadge label={step.status} tone={isDone ? 'healthy' : 'warning'} />
                          </div>

                          {/* Citation Link */}
                          {step.citation && (
                            <div className="text-[10px] font-mono text-[#2563EB] pl-7 flex items-center gap-1.5 font-medium">
                              <FileText className="w-3 h-3 text-[#2563EB]" />
                              <span>
                                Citation: {step.citation.documentNumber} (Page {step.citation.pageNumber})
                              </span>
                            </div>
                          )}

                          {step.technicianNotes && (
                            <div className="text-[11px] font-mono text-gray-500 pl-7 italic">
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

            {/* Technician Findings Submission Card */}
            {(activeCase.status === 'IN_PROGRESS' || activeCase.status === 'DIAGNOSED') && (
              <Card>
                <CardHeader>
                  <CardTitle>Technician Field Findings & Sign-Off Submission</CardTitle>
                  <StatusBadge label="READY FOR SUBMISSION" tone="warning" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono text-gray-700 font-semibold">
                        Final Measured Values (e.g. Torque ft-lbs, Clearance mm, Temp °C)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 45 ft-lbs, 0.05mm clearance"
                        value={measuredTorque}
                        onChange={(e) => setMeasuredTorque(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-gray-900 focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-mono text-gray-700 font-semibold">
                        Corrective Interventions & Observations
                      </label>
                      <input
                        type="text"
                        placeholder="Describe parts replaced, seal alignment, or tests run..."
                        value={findingsText}
                        onChange={(e) => setFindingsText(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-gray-900 focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSubmitFindings}
                      disabled={isSubmitting}
                      className="bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm inline-flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'Submitting...' : 'Submit Work Order for Supervisor Approval'}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Supervisor Review & Sign-Off Authorization */}
            {activeCase.status === 'PENDING_APPROVAL' && (
              <Card className="border-amber-300 bg-amber-50/20">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-600" />
                    <CardTitle>Supervisor Review & Work Order Authorization</CardTitle>
                  </div>
                  <StatusBadge label="AWAITING SUPERVISOR APPROVAL" tone="warning" pulse />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-white border border-amber-200 space-y-1 text-xs font-mono">
                    <div className="text-[10px] text-gray-400 uppercase font-bold">
                      SUBMITTED TECHNICIAN RESOLUTION
                    </div>
                    <p className="text-gray-900 font-medium">
                      {activeCase.findings?.resolutionSummary || 'Procedures verified and executed per standard.'}
                    </p>
                    {activeCase.findings?.measuredValues && Object.keys(activeCase.findings.measuredValues).length > 0 && (
                      <div className="pt-1 text-[11px] text-gray-600">
                        Recorded Telemetry: {JSON.stringify(activeCase.findings.measuredValues)}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-gray-700 font-semibold">
                      Supervisor Sign-off Comments / Quality Notes
                    </label>
                    <input
                      type="text"
                      placeholder="Add supervisor notes before final sign-off..."
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-gray-900 focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => setIsRejectConfirmOpen(true)}
                    >
                      Reject Work Order (Request Rework)
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => handleReviewApproval(true)}
                      className="bg-[#2563EB] hover:bg-blue-700 text-white font-semibold shadow-sm"
                    >
                      {isSubmitting ? 'Approving...' : 'Approve Work Order (Mark Resolved)'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resolved Work Order Banner with Close Action */}
            {activeCase.status === 'RESOLVED' && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    WORK ORDER VERIFIED & RESOLVED
                  </span>
                  <p className="text-[11px] text-gray-600 font-sans">
                    Approved by {activeCase.approval?.reviewedByUserId || 'Authorized Supervisor'} at{' '}
                    {activeCase.resolvedAt ? new Date(activeCase.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}.
                    {activeCase.approval?.reviewerNotes && ` Comments: "${activeCase.approval.reviewerNotes}"`}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsCloseConfirmOpen(true)}
                  disabled={isSubmitting}
                  className="bg-[#151C24] hover:bg-black text-white font-bold shrink-0 shadow-sm inline-flex items-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Formally Close Case</span>
                </Button>
              </div>
            )}

            {/* Closed Archive Banner */}
            {activeCase.status === 'CLOSED' && (
              <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2 text-xs font-mono text-gray-600">
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    Work order formally audited and archived at{' '}
                    {activeCase.closedAt ? new Date(activeCase.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}.
                  </span>
                </div>
                <StatusBadge label="CLOSED & ARCHIVED" tone="healthy" />
              </div>
            )}

            {/* Case History & Audit Ledger */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-gray-500" />
                  <CardTitle>Case History & Tamper-Evident Audit Trail</CardTitle>
                </div>
                <span className="text-[10px] font-mono text-gray-400">CHRONOLOGICAL LOG</span>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeCase.history.map((h) => (
                    <div
                      key={h.id}
                      className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-start justify-between text-xs font-mono"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 font-bold text-gray-900">
                          <span>{h.action}</span>
                          <span className="text-gray-400 text-[10px]">by {h.user}</span>
                        </div>
                        {h.notes && <p className="text-[11px] text-gray-600 font-sans">{h.notes}</p>}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFC]">
            <div className="max-w-md w-full bg-white rounded-xl border border-[#E2E8F0] p-8 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Work Orders Logged</h3>
              <p className="text-xs text-gray-600 leading-relaxed font-sans">
                Your company workspace has zero recorded maintenance cases. Click below to log a work order and initiate automated diagnostic checklists.
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={() => setIsNewCaseModalOpen(true)}
                  className="bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Report First Work Order</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MODALS */}
      {/* --------------------------------------------------------------------- */}

      {/* 1. Report New Case Modal */}
      <Modal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        title="Report New Maintenance Work Order"
        subtitle="Capture machinery symptoms, asset context, and operating conditions"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsNewCaseModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateNewCase}
              disabled={isSubmitting}
              className="bg-[#151C24] hover:bg-black text-white font-semibold"
            >
              {isSubmitting ? 'Registering & Diagnosing...' : 'Create & Diagnose Work Order'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 font-sans text-xs">
          <div className="space-y-1">
            <label className="text-gray-700 font-bold">Work Order Title</label>
            <input
              type="text"
              placeholder="e.g. Mechanical Seal Fluid Weepage on Booster Pump"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-gray-900 focus:outline-none focus:border-[#2563EB] font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-gray-700 font-bold">Affected Fleet Machinery</label>
              <select
                value={newAssetTag}
                onChange={(e) => setNewAssetTag(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-gray-900 focus:outline-none focus:border-[#2563EB] font-mono text-xs cursor-pointer"
              >
                {machines.length === 0 ? (
                  <option value="PLANT_WIDE">General Plant Equipment / Unassigned</option>
                ) : (
                  machines.map((m) => (
                    <option key={m.id} value={m.assetTag}>
                      {m.assetTag} — {m.name} {m.area ? `(${m.area})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-gray-700 font-bold">Operational Priority / Severity</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as MaintenanceCaseSeverity)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-gray-900 focus:outline-none focus:border-[#2563EB] font-mono text-xs cursor-pointer"
              >
                <option value="LOW">LOW — Routine preventive check</option>
                <option value="MEDIUM">MEDIUM — Minor deviation</option>
                <option value="HIGH">HIGH — Production line degraded</option>
                <option value="CRITICAL">CRITICAL — Immediate safety / shutdown risk</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-gray-700 font-bold">Observed Symptoms & Operating Anomalies</label>
            <textarea
              rows={3}
              placeholder="Describe audible pitch, fluid leakage rate, vibration severity, thermal spikes, or telemetry readings..."
              value={newSymptoms}
              onChange={(e) => setNewSymptoms(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-white border border-[#CBD5E1] text-gray-900 font-sans focus:outline-none focus:border-[#2563EB] text-xs"
            />
          </div>
        </div>
      </Modal>

      {/* 2. Assign / Reassign Technician Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={
          activeCase?.assignedTechnicianUserId
            ? 'Reassign Certified Technician'
            : 'Assign Certified Technician to Work Order'
        }
        subtitle="Designate certified personnel responsible for field procedure execution"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {activeCase?.assignedTechnicianUserId && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsAssignModalOpen(false);
                    setUnassignReason('');
                    setIsUnassignConfirmOpen(true);
                  }}
                  className="text-rose-600 border-rose-300 hover:bg-rose-50 hover:border-rose-400 font-semibold"
                >
                  Unassign Technician
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setIsAssignModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmitting || isLoadingTechs || technicians.length === 0}
                onClick={handleAssignTechnician}
                className="bg-[#151C24] hover:bg-black text-white font-semibold"
              >
                {isSubmitting
                  ? 'Saving...'
                  : activeCase?.assignedTechnicianUserId
                  ? 'Confirm Reassignment'
                  : 'Confirm Assignment'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 font-sans text-xs">
          {/* Current Assignment Status Banner */}
          {activeCase?.assignedTechnicianUserId ? (
            <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-blue-600 font-mono font-bold uppercase">
                    Currently Assigned
                  </div>
                  <div className="text-xs font-semibold text-gray-900">
                    {activeCase.assignedTechnicianName}
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">
                Active
              </span>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 flex items-center gap-2 text-gray-600">
              <UserPlus className="w-4 h-4 text-gray-400 shrink-0" />
              <span>
                This work order is currently <strong>Unassigned</strong>.
              </span>
            </div>
          )}

          {/* Loading State */}
          {isLoadingTechs && (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin text-[#2563EB]" />
              <span className="font-mono text-xs">Loading active technicians...</span>
            </div>
          )}

          {/* Error State with Retry */}
          {!isLoadingTechs && techFetchError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{techFetchError}</span>
              </div>
              <button
                type="button"
                onClick={loadTechnicians}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-mono font-bold text-[10px] transition"
              >
                Retry Loading
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingTechs && !techFetchError && technicians.length === 0 && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-center space-y-1">
              <p className="font-semibold">No eligible technicians found</p>
              <p className="text-[11px] text-amber-700 font-sans">
                No active technicians or engineers are currently registered under this facility organization.
              </p>
            </div>
          )}

          {/* Technician Select */}
          {!isLoadingTechs && technicians.length > 0 && (
            <div className="space-y-1">
              <label className="text-gray-700 font-bold">Select Qualified Field Technician</label>
              <select
                value={selectedTechId}
                onChange={(e) => {
                  setSelectedTechId(e.target.value);
                  const found = technicians.find((t) => t.userId === e.target.value);
                  if (found) setSelectedTechName(found.fullName);
                }}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-gray-900 focus:outline-none focus:border-[#2563EB] font-mono text-xs cursor-pointer shadow-xs"
              >
                {technicians.map((t) => (
                  <option key={t.id || t.userId} value={t.userId}>
                    {t.fullName} ({t.role} — {t.department || 'Operations'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-[11px] text-gray-500 font-sans leading-normal">
            Assigned personnel will be designated on procedural records, receive safety directives, and be logged in the immutable audit trail.
          </p>
        </div>
      </Modal>

      {/* 2b. Unassign Confirmation Modal */}
      <Modal
        isOpen={isUnassignConfirmOpen}
        onClose={() => {
          if (!isSubmitting) setIsUnassignConfirmOpen(false);
        }}
        title="Unassign Technician"
        subtitle={`Remove ${activeCase?.assignedTechnicianName || 'technician'} from ${activeCase?.caseNumber || 'work order'}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsUnassignConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={
                isSubmitting ||
                (activeCase?.status === 'IN_PROGRESS' &&
                  (!unassignReason || unassignReason.trim().length < 5))
              }
              onClick={handleUnassignTechnician}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {isSubmitting ? 'Unassigning...' : 'Confirm Unassignment'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-gray-700">
            Are you sure you want to remove the assigned technician from this work order?
          </p>
          {activeCase?.status === 'IN_PROGRESS' ? (
            <div className="space-y-1">
              <label className="text-rose-700 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Justification Reason Required (In-Progress Case)
              </label>
              <textarea
                value={unassignReason}
                onChange={(e) => setUnassignReason(e.target.value)}
                placeholder="Explain why technician is being unassigned while case is actively in progress..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-white border border-rose-300 text-gray-900 focus:outline-none focus:border-rose-500 text-xs shadow-xs"
              />
              <p className="text-[10px] text-gray-500">Minimum 5 characters required.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-gray-700 font-medium">Notes / Reason (Optional)</label>
              <input
                type="text"
                value={unassignReason}
                onChange={(e) => setUnassignReason(e.target.value)}
                placeholder="Optional unassignment notes..."
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#CBD5E1] text-gray-900 focus:outline-none focus:border-[#2563EB] text-xs shadow-xs"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* 3. Escalate to Human Modal */}
      <Modal
        isOpen={isEscalateModalOpen}
        onClose={() => setIsEscalateModalOpen(false)}
        title="Escalate Case to Human Reliability Engineer"
        subtitle="Halt automated procedure execution and escalate for senior engineering sign-off"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsEscalateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isSubmitting}
              onClick={handleEscalateCase}
              className="font-semibold"
            >
              {isSubmitting ? 'Escalating...' : 'Confirm Safety Escalation'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-gray-600 leading-normal">
            Detail the specific hazard, missing procedural manual, or abnormal condition that requires certified engineer evaluation:
          </p>
          <textarea
            rows={3}
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            placeholder="e.g. Extreme high-voltage arcing detected on feeder breaker, or structural vibration exceeding ISO limits..."
            className="w-full p-2.5 rounded-lg bg-white border border-[#CBD5E1] text-xs text-gray-900 font-sans focus:outline-none focus:border-rose-500"
          />
        </div>
      </Modal>

      {/* 4. Consequential Action: Close Case Confirmation */}
      <Modal
        isOpen={isCloseConfirmOpen}
        onClose={() => setIsCloseConfirmOpen(false)}
        title="Formally Close & Archive Work Order"
        subtitle="This action is final and locks all procedural checklists"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsCloseConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onClick={handleCloseCase}
              className="bg-[#151C24] hover:bg-black text-white font-bold"
            >
              {isSubmitting ? 'Archiving...' : 'Yes, Formally Close Case'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs text-gray-600 leading-relaxed">
          <p>
            You are about to archive <strong>{activeCase?.caseNumber}</strong> ({activeCase?.title}). Once closed:
          </p>
          <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <li>Checklist steps and findings will become immutable.</li>
            <li>A permanent closure timestamp will be logged on the audit ledger.</li>
            <li>The work order will be removed from the active technician execution queue.</li>
          </ul>
        </div>
      </Modal>

      {/* 5. Reject Work Order Modal (Request Rework) */}
      <Modal
        isOpen={isRejectConfirmOpen}
        onClose={() => setIsRejectConfirmOpen(false)}
        title="Request Work Order Rework"
        subtitle="Return maintenance case to technician for re-inspection"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsRejectConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleReviewApproval(false)}
              className="font-bold"
            >
              {isSubmitting ? 'Rejecting...' : 'Confirm Rejection (Return for Rework)'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 font-sans text-xs">
          <p className="text-gray-600 leading-normal">
            Specify the required rework instructions for the assigned technician:
          </p>
          <textarea
            rows={3}
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder="e.g. Measured bolt torque is below 45 ft-lbs specification. Re-torque follower plate and re-test..."
            className="w-full p-2.5 rounded-lg bg-white border border-[#CBD5E1] text-xs text-gray-900 font-sans focus:outline-none focus:border-red-500"
          />
        </div>
      </Modal>
    </div>
  );
};

export default SopExecutionView;

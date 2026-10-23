import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Send,
  XCircle,
  Plus,
  Trash2,
  ClipboardList,
  Loader2,
  Info,
} from 'lucide-react';
import type {
  Machine,
  MachineVerificationRecord,
  MachineVerificationWorkflowStatus,
  DocumentationReadiness,
} from '@forgex/shared-types';
import { useToast } from '../../lib/ToastContext';

interface MachineVerificationCardProps {
  machine: Machine;
  token: string | null;
  organizationId?: string;
  isOwnerOrAdmin: boolean;
  userRole?: string;
  onMachineUpdated?: (updated: Machine) => void;
  onOpenManageTasks: () => void;
}

export const MachineVerificationCard: React.FC<MachineVerificationCardProps> = ({
  machine,
  token,
  organizationId,
  isOwnerOrAdmin,
  userRole,
  onMachineUpdated,
  onOpenManageTasks,
}) => {
  const { toast } = useToast();
  const [verification, setVerification] = useState<MachineVerificationRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Modals
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  // Evidence Form
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [docReadiness, setDocReadiness] = useState<DocumentationReadiness>(
    machine.documentationReadiness || 'PENDING_INSPECTION'
  );
  const [serialNumberInput, setSerialNumberInput] = useState(machine.serialNumber || '');
  const [mfgInput, setMfgInput] = useState(machine.manufacturer || '');
  const [modelInput, setModelInput] = useState(machine.modelNumber || '');
  const [specsList, setSpecsList] = useState<Array<{ key: string; value: string }>>(() => {
    const existing = machine.technicalSpecs || {};
    const excludedKeys = new Set(['model3dFileName', 'model3dFileSize', 'pidFileName', 'pidFileSize']);
    const entries = Object.entries(existing).filter(([k]) => !excludedKeys.has(k));
    return entries.length > 0
      ? entries.map(([k, v]) => ({ key: k, value: String(v) }))
      : [{ key: '', value: '' }];
  });

  const isTechnicianOrEngineer =
    isOwnerOrAdmin ||
    ['ENGINEER', 'TECHNICIAN', 'SUPERVISOR', 'ENGINEER_TECHNICIAN'].includes(userRole || '');

  const isWorker = userRole === 'WORKER';

  const fetchVerification = useCallback(async () => {
    if (!token || !machine.id) return;
    try {
      const res = await fetch(`/api/v1/machines/${machine.id}/verification`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setVerification(json.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch verification status:', err);
    }
  }, [machine.id, token, organizationId]);

  useEffect(() => {
    fetchVerification();
  }, [fetchVerification]);

  // Handle Approve
  const handleApprove = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/machines/${machine.id}/verification/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({ notes: approveNotes.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Machine Verified', 'Full machine engineering verification approved successfully.');
        setIsApproveOpen(false);
        setApproveNotes('');
        setVerification(json.data);
        if (onMachineUpdated) {
          onMachineUpdated({ ...machine, verificationState: 'VERIFIED' });
        }
      } else {
        const msg = json.error?.message || 'Failed to approve verification.';
        toast.error('Approval Blocked', msg);
      }
    } catch (err: any) {
      toast.error('Network Error', err?.message || 'Request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!token) return;
    if (!rejectionReason.trim()) {
      toast.error('Validation Error', 'A specific rejection reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/machines/${machine.id}/verification/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          rejectionReason: rejectionReason.trim(),
          correctiveActions: correctiveActions.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.warning('Verification Rejected', 'Corrective actions recorded.');
        setIsRejectOpen(false);
        setRejectionReason('');
        setCorrectiveActions('');
        setVerification(json.data);
        if (onMachineUpdated) {
          onMachineUpdated({ ...machine, verificationState: json.data.overallState });
        }
      } else {
        toast.error('Rejection Error', json.error?.message || 'Failed to reject verification.');
      }
    } catch (err: any) {
      toast.error('Network Error', err?.message || 'Request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Submit Evidence
  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setActionLoading(true);
    try {
      const technicalSpecs: Record<string, any> = {};
      specsList.forEach(({ key, value }) => {
        if (key.trim() && value.trim()) {
          const num = Number(value.trim());
          technicalSpecs[key.trim()] = isNaN(num) ? value.trim() : num;
        }
      });

      const payload = {
        evidenceDescription: evidenceDescription.trim() || 'Physical inspection and specification update.',
        documentationReadiness: docReadiness,
        serialNumber: serialNumberInput.trim() || undefined,
        manufacturer: mfgInput.trim() || undefined,
        modelNumber: modelInput.trim() || undefined,
        technicalSpecs: Object.keys(technicalSpecs).length > 0 ? technicalSpecs : undefined,
      };

      const res = await fetch(`/api/v1/machines/${machine.id}/verification/submit-evidence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Evidence Recorded', 'Findings and specifications submitted.');
        setIsEvidenceOpen(false);
        setVerification(json.data);
        if (onMachineUpdated) {
          onMachineUpdated({
            ...machine,
            serialNumber: serialNumberInput.trim() || machine.serialNumber,
            manufacturer: mfgInput.trim() || machine.manufacturer,
            modelNumber: modelInput.trim() || machine.modelNumber,
            documentationReadiness: docReadiness,
            technicalSpecs: { ...machine.technicalSpecs, ...technicalSpecs },
            verificationState: json.data.overallState,
          });
        }
      } else {
        toast.error('Submission Failed', json.error?.message || 'Failed to submit evidence.');
      }
    } catch (err: any) {
      toast.error('Network Error', err?.message || 'Request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Request Approval
  const handleRequestApproval = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/machines/${machine.id}/verification/request-approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({ notes: 'Technician verification completed; requested approval.' }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Approval Requested', 'Submitted to Owner/Admin for signoff.');
        setVerification(json.data);
      } else {
        toast.error('Request Failed', json.error?.message || 'Failed to request approval.');
      }
    } catch (err: any) {
      toast.error('Network Error', err?.message || 'Request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status?: MachineVerificationWorkflowStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> VERIFIED
          </span>
        );
      case 'READY_FOR_APPROVAL':
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold flex items-center gap-1">
            <Clock className="w-3 h-3" /> PENDING SIGNOFF
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold flex items-center gap-1">
            <XCircle className="w-3 h-3" /> REJECTED
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold flex items-center gap-1">
            <Clock className="w-3 h-3" /> PARTIALLY VERIFIED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1">
            <Info className="w-3 h-3" /> UNVERIFIED
          </span>
        );
    }
  };

  const allRequiredPassed =
    verification?.checks &&
    verification.checks
      .filter((c) => c.required)
      .every((c) => c.status === 'PASSED' || c.status === 'NOT_APPLICABLE');

  const isVerified =
    verification?.status === 'VERIFIED' || machine.verificationState === 'VERIFIED';

  return (
    <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs space-y-3 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-[#2563EB]" />
          <span className="text-[11px] uppercase font-bold tracking-wider text-[#1A202C]">
            Machine Verification
          </span>
        </div>
        {getStatusBadge(verification?.status)}
      </div>

      {/* Next Action Banner */}
      <div className="p-2.5 rounded-lg border text-xs">
        {verification?.status === 'VERIFIED' ? (
          <div className="flex items-start gap-2 text-emerald-800 bg-emerald-50/50">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Fully Verified Machine</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                All engineering identity, documentation, and technical parameters authorized for operation.
              </p>
            </div>
          </div>
        ) : verification?.status === 'READY_FOR_APPROVAL' ? (
          <div className="flex items-start gap-2 text-amber-800 bg-amber-50/50">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Ready for Owner/Admin Signoff</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                All applicable technical checks passed. Authorized review required to certify machine.
              </p>
            </div>
          </div>
        ) : verification?.status === 'REJECTED' ? (
          <div className="flex items-start gap-2 text-rose-800 bg-rose-50/50">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Verification Rejected</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                <strong>Reason:</strong> {verification.rejectionReason}
              </p>
              {verification.correctiveActions && (
                <p className="text-[11px] text-rose-700 mt-0.5">
                  <strong>Action Required:</strong> {verification.correctiveActions}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-blue-800 bg-blue-50/50">
            <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Verification In Progress</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Complete required checks below: verify serial number, technical specs, and document readiness.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Responsibility & Task Connection */}
      <div className="flex items-center justify-between text-[11px] text-[#64748B] bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
        <div className="flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>
            Responsible:{' '}
            <strong className="text-[#1A202C]">
              {verification?.assignedUserId ? `Assigned (${verification.assignedRole || 'Tech'})` : 'Unassigned'}
            </strong>
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenManageTasks}
          className="text-[#2563EB] hover:text-[#1D4ED8] font-semibold flex items-center gap-1 cursor-pointer"
        >
          <ClipboardList className="w-3 h-3" />
          <span>Manage Tasks</span>
        </button>
      </div>

      {/* Checklist Breakdown */}
      <div className="space-y-2">
        <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">
          Required Verification Checks
        </span>
        <div className="space-y-1.5">
          {verification?.checks?.map((c) => {
            const isPassed = c.status === 'PASSED';
            const isFailed = c.status === 'FAILED';
            return (
              <div
                key={c.key}
                className={`p-2 rounded-lg border text-xs transition ${
                  isPassed
                    ? 'bg-emerald-50/40 border-emerald-200 text-[#1A202C]'
                    : isFailed
                      ? 'bg-rose-50/40 border-rose-200 text-[#1A202C]'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    {isPassed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : isFailed ? (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    {c.label}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isPassed
                        ? 'bg-emerald-100 text-emerald-800'
                        : isFailed
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] mt-1 pl-5">{c.details}</p>
                {c.failureReason && !isPassed && (
                  <p className="text-[10px] text-amber-700 pl-5 mt-0.5">
                    <strong>Notice:</strong> {c.failureReason}
                  </p>
                )}
                {c.correctiveAction && !isPassed && (
                  <p className="text-[10px] text-blue-700 pl-5 mt-0.5">
                    <strong>Action:</strong> {c.correctiveAction}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons based on Role (Hidden once verified) */}
      {!isVerified && (
        <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap gap-2">
          {/* Owner / Admin Controls */}
          {isOwnerOrAdmin && (
            <>
              <button
                type="button"
                disabled={!allRequiredPassed || actionLoading}
                onClick={() => setIsApproveOpen(true)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  !allRequiredPassed
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                }`}
                title={
                  !allRequiredPassed
                    ? 'All required checks must pass before approving machine verification'
                    : 'Approve machine verification'
                }
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Approve Verification</span>
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setIsRejectOpen(true)}
                className="py-1.5 px-3 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            </>
          )}

          {/* Technician / Engineer Evidence Submission */}
          {isTechnicianOrEngineer && !isWorker && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setIsEvidenceOpen(true)}
              className="w-full py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Verification Evidence</span>
            </button>
          )}

          {/* Request Approval (Technician / Engineer) */}
          {isTechnicianOrEngineer &&
            !isWorker &&
            allRequiredPassed &&
            verification?.status !== 'READY_FOR_APPROVAL' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleRequestApproval}
                className="w-full py-1.5 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Request Owner/Admin Signoff</span>
              </button>
            )}
        </div>
      )}

      {/* Verification History Accordion */}
      {verification?.history && verification.history.length > 0 && (
        <div className="pt-2 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-[11px] text-[#64748B] hover:text-[#1A202C] font-semibold py-1 cursor-pointer"
          >
            <span>Verification Audit Log ({verification.history.length})</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showHistory && (
            <div className="space-y-1.5 mt-2 max-h-40 overflow-y-auto">
              {verification.history.map((h, idx) => (
                <div key={h.id || `${h.timestamp}-${idx}`} className="p-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[10px]">
                  <div className="flex justify-between font-semibold">
                    <span className="text-[#2563EB]">{h.action}</span>
                    <span className="text-[#64748B]">{new Date(h.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="text-[#64748B] mt-0.5">Role: {h.actorRole}</div>
                  {h.notes && <div className="text-[#1A202C] mt-0.5 italic">"{h.notes}"</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Approve Modal */}
      {isApproveOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-[#E2E8F0] shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <ShieldCheck className="w-6 h-6" />
              <h4 className="font-bold text-base text-[#1A202C]">Authorize Machine Verification</h4>
            </div>
            <p className="text-xs text-[#64748B]">
              You are certifying that <strong>{machine.assetTag}</strong> has passed all required engineering
              identification, documentation, and technical operating specification checks.
            </p>
            <div>
              <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">
                Approval Notes / Cert Reference (Optional)
              </label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="e.g. Rotating equipment engineer signoff on-site..."
                className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg h-20 resize-none focus:outline-none focus:border-[#2563EB]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsApproveOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleApprove}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-[#E2E8F0] shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h4 className="font-bold text-base text-[#1A202C]">Reject Verification</h4>
            </div>
            <p className="text-xs text-[#64748B]">
              Specify the reason for rejection and mandatory corrective actions for the technician or engineering team.
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Nameplate serial does not match P&ID tag..."
                  className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">
                  Required Corrective Actions
                </label>
                <textarea
                  value={correctiveActions}
                  onChange={(e) => setCorrectiveActions(e.target.value)}
                  placeholder="e.g. Inspect casing stamp, obtain signed OEM test cert..."
                  className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg h-16 resize-none focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRejectOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={handleReject}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Evidence Modal */}
      {isEvidenceOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#E2E8F0] shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2 text-[#2563EB]">
                <Send className="w-5 h-5" />
                <h4 className="font-bold text-base text-[#1A202C]">Submit Verification Findings</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsEvidenceOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEvidence} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">
                  Physical Findings / Observation Notes
                </label>
                <textarea
                  value={evidenceDescription}
                  onChange={(e) => setEvidenceDescription(e.target.value)}
                  placeholder="e.g. Conducted turnaround inspection of OEM nameplate, impeller trim, and casing..."
                  className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg h-16 resize-none focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">Manufacturer (OEM)</label>
                  <input
                    type="text"
                    value={mfgInput}
                    onChange={(e) => setMfgInput(e.target.value)}
                    placeholder="e.g. Sulzer Flow Solutions"
                    className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">Model Number</label>
                  <input
                    type="text"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    placeholder="e.g. OH2-100-315"
                    className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={serialNumberInput}
                    onChange={(e) => setSerialNumberInput(e.target.value)}
                    placeholder="Physical serial number"
                    className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#1A202C] block mb-1">
                    Documentation Readiness
                  </label>
                  <select
                    value={docReadiness}
                    onChange={(e: any) => setDocReadiness(e.target.value as DocumentationReadiness)}
                    className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="PENDING_INSPECTION">PENDING INSPECTION</option>
                    <option value="PROCESSING">PROCESSING (Ingesting)</option>
                    <option value="READY">READY (Verified)</option>
                    <option value="INCOMPLETE">INCOMPLETE</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>
              </div>

              {/* Operating Specifications */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-[#1A202C]">
                    Verified Technical Parameters
                  </label>
                  <button
                    type="button"
                    onClick={() => setSpecsList([...specsList, { key: '', value: '' }])}
                    className="text-[#2563EB] hover:text-[#1D4ED8] text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Parameter
                  </button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {specsList.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="e.g. maxRpm, powerKw"
                        value={item.key}
                        onChange={(e) => {
                          const updated = [...specsList];
                          updated[idx].key = e.target.value;
                          setSpecsList(updated);
                        }}
                        className="flex-1 text-xs p-1.5 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2563EB]"
                      />
                      <input
                        type="text"
                        placeholder="Value (e.g. 3600)"
                        value={item.value}
                        onChange={(e) => {
                          const updated = [...specsList];
                          updated[idx].value = e.target.value;
                          setSpecsList(updated);
                        }}
                        className="flex-1 text-xs p-1.5 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#2563EB]"
                      />
                      {specsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSpecsList(specsList.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsEvidenceOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Findings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

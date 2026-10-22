import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ClipboardList,
  CheckCircle,
  XCircle,
  Send,
  Plus,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import type { MissingInformationTask, TaskStatus } from '@forgex/shared-types';
import { useToast } from '../../lib/ToastContext';

interface TaskManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  machineId?: string;
  machineTag?: string;
  token: string | null;
  organizationId?: string;
  isOwnerOrAdmin: boolean;
  onTasksUpdated?: () => void;
}

export const TaskManagementModal: React.FC<TaskManagementModalProps> = ({
  isOpen,
  onClose,
  machineId,
  machineTag,
  token,
  organizationId,
  isOwnerOrAdmin,
  onTasksUpdated,
}) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<MissingInformationTask[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [selectedTask, setSelectedTask] = useState<MissingInformationTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New task form fields
  const [title, setTitle] = useState(machineTag ? `Inspect & Verify Specifications for ${machineTag}` : '');
  const [description, setDescription] = useState('Inspect physical nameplate, verify impeller diameter, seal type, and casing rating.');
  const [fieldsInput, setFieldsInput] = useState('impellerDiameterMm, sealPlan, maxDischargePressureBar');
  const [assignedTo, setAssignedTo] = useState('Tom Technician');

  // Technician submission fields
  const [submittingData, setSubmittingData] = useState(false);
  const [submittedSpecsJson, setSubmittedSpecsJson] = useState('{\n  "impellerDiameterMm": 215,\n  "sealPlan": "Plan 53A Dual Pressurized",\n  "maxDischargePressureBar": 18.5\n}');
  const [evidenceNotes, setEvidenceNotes] = useState('Verified against physical OEM brass stamped tag on unit B-deck.');

  // Admin review fields
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const url = machineId ? `/api/v1/tasks?machineId=${machineId}` : '/api/v1/tasks';
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setTasks(json.data || []);
        if (json.data && json.data.length > 0 && !selectedTask) {
          setSelectedTask(json.data[0]);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [token, machineId, organizationId, selectedTask]);

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
    }
  }, [isOpen, fetchTasks]);

  if (!isOpen) return null;

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineId) {
      const errMsg = 'Please select or specify a machine to assign this task.';
      setError(errMsg);
      toast.error('Validation Error', errMsg);
      return;
    }
    if (!title.trim()) {
      const errMsg = 'Task title cannot be empty.';
      setError(errMsg);
      toast.error('Validation Error', errMsg);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const missingFields = fieldsInput.split(',').map((f) => f.trim()).filter(Boolean);
      const res = await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          machineId,
          requestedFields: missingFields,
          instructions: `${title.trim()}: ${description.trim()}`,
          assignedRole: 'TECHNICIAN',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Task Dispatched', 'Field verification task successfully dispatched.');
        setActiveTab('list');
        fetchTasks();
        onTasksUpdated?.();
      } else {
        const errMsg = json.error?.message || 'Failed to create task';
        setError(errMsg);
        toast.error('Dispatch Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error creating task';
      setError(errMsg);
      toast.error('Network Error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleTechnicianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setError(null);
    setSubmittingData(true);
    try {
      let parsedSpecs: Record<string, any> = {};
      try {
        parsedSpecs = JSON.parse(submittedSpecsJson);
      } catch {
        const errMsg = 'Submitted specifications must be valid JSON format.';
        setError(errMsg);
        toast.error('Invalid Data Format', errMsg);
        setSubmittingData(false);
        return;
      }

      const res = await fetch(`/api/v1/tasks/${selectedTask.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          submittedValues: parsedSpecs,
          evidenceDescription: evidenceNotes.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Field Findings Submitted', 'Specifications recorded and submitted for engineering supervisor approval.');
        setSelectedTask(json.data);
        fetchTasks();
        onTasksUpdated?.();
      } else {
        const errMsg = json.error?.message || 'Failed to submit technician data';
        setError(errMsg);
        toast.error('Submission Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error submitting findings';
      setError(errMsg);
      toast.error('Network Error', errMsg);
    } finally {
      setSubmittingData(false);
    }
  };

  const handleReviewAction = async (action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES') => {
    if (!selectedTask) return;
    setError(null);
    setReviewing(true);
    try {
      const res = await fetch(`/api/v1/tasks/${selectedTask.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          action,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        if (action === 'APPROVE') {
          toast.success('Task Approved', 'Field data verified and applied to machine documentation.');
        } else if (action === 'REJECT') {
          toast.warning('Task Rejected', 'Field data submission rejected by supervisor.');
        } else {
          toast.info('Changes Requested', 'Task returned to technician with requested adjustments.');
        }
        setSelectedTask(json.data);
        fetchTasks();
        onTasksUpdated?.();
      } else {
        const errMsg = json.error?.message || 'Review action failed';
        setError(errMsg);
        toast.error('Review Action Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error reviewing task';
      setError(errMsg);
      toast.error('Network Error', errMsg);
    } finally {
      setReviewing(false);
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'APPROVED':
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">APPROVED</span>;
      case 'SUBMITTED':
        return <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 text-[10px] font-semibold">SUBMITTED FOR REVIEW</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">IN PROGRESS</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold">PENDING</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-5 h-5 text-[#2563EB]" />
            <div>
              <h2 className="text-sm font-bold text-[#1A202C] tracking-wide font-mono uppercase">
                Missing Information & Technician Workflows
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Technician field inspection tasks • Reviewer sign-off & verified ledger promotion
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex bg-white px-6 pt-3 border-b border-[#E2E8F0] gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('list'); setError(null); }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-[#2563EB] text-[#1A202C]'
                : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Active Tasks ({tasks.length})</span>
          </button>

          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => { setActiveTab('create'); setError(null); }}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'create'
                  ? 'border-[#2563EB] text-[#1A202C]'
                  : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Inspection Task</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col font-mono text-xs">
          {error && (
            <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'create' ? (
            <form onSubmit={handleCreateTask} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-[#1A202C] mb-1 font-semibold">Task Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Inspect Seal Flush Plan & Physical Plate"
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1A202C] mb-1 font-semibold">Field Instructions</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1A202C] mb-1 font-semibold">
                    Missing Fields (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={fieldsInput}
                    onChange={(e) => setFieldsInput(e.target.value)}
                    placeholder="impellerSizeMm, sealPlan, bearingLubricant"
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-semibold">Assigned Technician</label>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="e.g. Tom Technician"
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 rounded-xl text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#151C24] hover:bg-black text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{loading ? 'Assigning...' : 'Assign Task'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Task List Column */}
              <div className="w-72 border-r border-[#E2E8F0] bg-[#F8FAFC] overflow-y-auto divide-y divide-[#E2E8F0]">
                {tasks.length === 0 ? (
                  <div className="p-6 text-center text-[#64748B]">
                    No open tasks found for this machine.
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`p-3.5 cursor-pointer transition ${
                        selectedTask?.id === task.id
                          ? 'bg-white border-l-2 border-l-[#2563EB] shadow-sm'
                          : 'hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        {getStatusBadge(task.status)}
                      </div>
                      <div className="text-[#1A202C] font-bold truncate text-[11px]">{task.instructions}</div>
                      <div className="text-[#64748B] text-[10px] mt-1">
                        Asset: {task.machineAssetTag} • {task.assignedRole || 'Technician'}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Task Detail Pane */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
                {selectedTask ? (
                  <>
                    <div className="pb-3 border-b border-[#E2E8F0] flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[#1A202C]">{selectedTask.instructions}</h3>
                          {getStatusBadge(selectedTask.status)}
                        </div>
                        <p className="text-[#64748B] text-xs mt-1">Machine: {selectedTask.machineAssetTag} ({selectedTask.machineName})</p>
                      </div>
                    </div>

                    {/* Missing Fields list */}
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase font-semibold block mb-1">
                        Fields Requiring Field Inspection:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.requestedFields.map((field: string) => (
                          <span
                            key={field}
                            className="px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Technician Submission Form */}
                    {selectedTask.status !== 'APPROVED' && (
                      <form
                        onSubmit={handleTechnicianSubmit}
                        className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#1A202C] font-bold text-[11px] flex items-center gap-1.5">
                            <Send className="w-3.5 h-3.5 text-[#2563EB]" />
                            Technician Field Data Submission
                          </span>
                          <span className="text-[10px] text-[#64748B]">
                            Status: {selectedTask.status}
                          </span>
                        </div>

                        <div>
                          <label className="block text-[#64748B] text-[10px] uppercase mb-1">
                            Discovered Specifications (JSON Envelope)
                          </label>
                          <textarea
                            rows={4}
                            value={submittedSpecsJson}
                            onChange={(e) => setSubmittedSpecsJson(e.target.value)}
                            className="w-full p-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-lg text-[#1A202C] font-mono text-[11px] outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[#64748B] text-[10px] uppercase mb-1">
                            Evidence & Inspection Notes
                          </label>
                          <input
                            type="text"
                            value={evidenceNotes}
                            onChange={(e) => setEvidenceNotes(e.target.value)}
                            placeholder="Physical inspection source, calibration tag, photo reference"
                            className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-lg text-[#1A202C] placeholder-[#94A3B8] text-[11px] outline-none"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={submittingData}
                            className="px-4 py-2 bg-[#151C24] hover:bg-black text-white font-semibold rounded-lg text-xs flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
                          >
                            <Send className="w-3.5 h-3.5 text-white" />
                            <span>{submittingData ? 'Submitting...' : 'Submit Findings for Admin Review'}</span>
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Submitted specifications display */}
                    {selectedTask.submittedValues && Object.keys(selectedTask.submittedValues).length > 0 && (
                      <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                        <span className="text-[#64748B] text-[10px] uppercase font-semibold block">
                          Submitted Findings (By User ID: {selectedTask.submittedByUserId || 'Technician'}):
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {Object.entries(selectedTask.submittedValues).map(([k, v]) => (
                            <div key={k} className="p-2 rounded bg-white border border-[#E2E8F0]">
                              <span className="text-[#64748B] block text-[10px]">{k}</span>
                              <span className="text-[#1A202C] font-medium">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                        {selectedTask.evidenceDescription && (
                          <div className="text-[11px] text-[#475569] italic pt-1">
                            Notes: {selectedTask.evidenceDescription}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Admin Review & Approval Box */}
                    {isOwnerOrAdmin && selectedTask.status === 'SUBMITTED' && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-800 font-bold">
                          <FileCheck2 className="w-4 h-4 text-emerald-600" />
                          <span>Administrator Approval & Data Promotion</span>
                        </div>
                        <p className="text-[11px] text-emerald-950 leading-relaxed">
                          Approving this task will merge the technician findings directly into the authoritative machine ledger, set the machine verification state to <strong>VERIFIED</strong>, and increment the machine revision.
                        </p>

                        <input
                          type="text"
                          placeholder="Review approval comments (optional)"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-[#1A202C] placeholder-[#94A3B8] text-xs outline-none"
                        />

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={reviewing}
                            onClick={() => handleReviewAction('REJECT')}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            type="button"
                            disabled={reviewing}
                            onClick={() => handleReviewAction('APPROVE')}
                            className="px-4 py-1.5 rounded-lg bg-[#151C24] hover:bg-black text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{reviewing ? 'Promoting...' : 'Approve & Promote Specs'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-12 text-center text-[#64748B]">
                    Select a task from the list or create a new inspection task.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

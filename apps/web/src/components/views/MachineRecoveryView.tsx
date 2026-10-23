import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ShieldCheck,
  ShieldAlert,
  XCircle,
  Plus,
  RefreshCw,
  ChevronRight,
  Sparkles,
  ClipboardList,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import type {
  MachineRecoverySummary,
  MachineRecoveryProfile,
  MachineEvidenceClaim,
  MissingInformationTask,
  Machine,
} from '@forgex/shared-types';

interface MachineRecoveryViewProps {
  onNavigateToCopilot?: (assetTag: string) => void;
}

export const MachineRecoveryView: React.FC<MachineRecoveryViewProps> = ({ onNavigateToCopilot }) => {
  const { toast } = useToast();
  const { token, organization, user, membership, isOwnerOrAdmin } = useAuth();
  const userRole = membership?.role || 'VIEWER';
  const isSupervisory = isOwnerOrAdmin || userRole === 'PLANT_MANAGER' || userRole === 'ENGINEER_TECHNICIAN';

  // State
  const [summary, setSummary] = useState<MachineRecoverySummary | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterConfidence, setFilterConfidence] = useState<string>('ALL');
  const [isSyncingDocuments, setIsSyncingDocuments] = useState(false);

  // Active Machine Detail State
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [profile, setProfile] = useState<MachineRecoveryProfile | null>(null);
  const [claims, setClaims] = useState<MachineEvidenceClaim[]>([]);
  const [tasks, setTasks] = useState<MissingInformationTask[]>([]);
  const [activeTab, setActiveTab] = useState<'gap' | 'ingest' | 'review' | 'tasks'>('gap');

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Ingestion Form State
  const [ingestType, setIngestType] = useState<string>('NAMEPLATE_PHOTO');
  const [ingestRawText, setIngestRawText] = useState('');
  const [ingestRevision, setIngestRevision] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<any | null>(null);

  // Review Form State
  const [reviewingClaimId, setReviewingClaimId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT' | 'REQUEST_ADDITIONAL_EVIDENCE' | 'SUPERSEDE'>('APPROVE');
  const [reviewRationale, setReviewRationale] = useState('');
  const [reviewerQualifications, setReviewerQualifications] = useState('Certified Reliability Engineer (CRE / PE)');
  const [correctedValue, setCorrectedValue] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Create Task Form State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskFields, setTaskFields] = useState<string[]>(['manufacturer', 'modelNumber', 'serialNumber']);
  const [taskInstructions, setTaskInstructions] = useState('Perform safe physical nameplate inspection. Do not open energized panels.');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [submittingTask, setSubmittingTask] = useState(false);

  // Register Machine Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regAssetTag, setRegAssetTag] = useState('');
  const [regName, setRegName] = useState('');
  const [regPlantId, setRegPlantId] = useState('');
  const [regType, setRegType] = useState('Centrifugal Pump');
  const [regArea, setRegArea] = useState('Process Area B');
  const [regMfr, setRegMfr] = useState('');
  const [regModel, setRegModel] = useState('');
  const [regSerial, setRegSerial] = useState('');
  const [regVintage, setRegVintage] = useState<string>('Unknown');
  const [regNameplateFile, setRegNameplateFile] = useState<File | null>(null);
  const [regNameplateBase64, setRegNameplateBase64] = useState<string | null>(null);
  const [submittingRegister, setSubmittingRegister] = useState(false);

  // Headers helper
  const getHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(organization?.id ? { 'x-organization-id': organization.id } : {}),
  }), [token, organization]);

  // Load Overview Data
  const loadOverviewData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [sumRes, machRes, plantRes] = await Promise.all([
        fetch('/api/v1/recovery/summary', { headers: getHeaders() }),
        fetch('/api/v1/machines', { headers: getHeaders() }),
        fetch('/api/v1/plants', { headers: getHeaders() }),
      ]);

      const sumJson = await sumRes.json();
      const machJson = await machRes.json();
      const plantJson = await plantRes.json();

      if (sumJson.success) setSummary(sumJson.data);
      if (machJson.success && Array.isArray(machJson.data)) setMachines(machJson.data);
      if (plantJson.success && Array.isArray(plantJson.data) && plantJson.data.length > 0 && !regPlantId) {
        setRegPlantId(plantJson.data[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load machine recovery data.');
    } finally {
      setLoading(false);
    }
  }, [token, getHeaders, regPlantId]);

  // Load Selected Machine Profile
  const loadMachineProfile = useCallback(async (machineId: string) => {
    if (!token) return;
    setProfileLoading(true);
    setErrorMessage(null);
    try {
      const [profRes, claimRes, taskRes] = await Promise.all([
        fetch(`/api/v1/recovery/machines/${machineId}/profile`, { headers: getHeaders() }),
        fetch(`/api/v1/recovery/claims?machineId=${machineId}`, { headers: getHeaders() }),
        fetch(`/api/v1/tasks?machineId=${machineId}`, { headers: getHeaders() }),
      ]);

      const profJson = await profRes.json();
      const claimJson = await claimRes.json();
      const taskJson = await taskRes.json();

      if (profJson.success) setProfile(profJson.data);
      if (claimJson.success && Array.isArray(claimJson.data)) setClaims(claimJson.data);
      if (taskJson.success && Array.isArray(taskJson.data)) setTasks(taskJson.data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load machine profile.');
    } finally {
      setProfileLoading(false);
    }
  }, [token, getHeaders]);

  const handleSyncFromDocuments = useCallback(async (isBackground: boolean = false) => {
    if (!token) return;
    if (!isBackground) setIsSyncingDocuments(true);
    try {
      const res = await fetch('/api/v1/recovery/sync-from-documents', {
        method: 'POST',
        headers: getHeaders(),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (!isBackground) {
          toast.success('Sync Complete', json.message || 'Extracted parameters from Knowledge Hub documents.');
          setSuccessMessage(json.message);
        } else if (json.data?.totalClaimsGenerated > 0) {
          toast.success(
            'Knowledge Hub Auto-Sync',
            `Auto-populated ${json.data.totalClaimsGenerated} parameter claim(s) from indexed manuals.`
          );
        }
        await loadOverviewData();
        if (selectedMachineId) await loadMachineProfile(selectedMachineId);
      } else if (!isBackground) {
        toast.error('Sync Failed', json.error?.message || 'Could not sync documents.');
        setErrorMessage(json.error?.message || 'Failed to sync documents.');
      }
    } catch (err: any) {
      if (!isBackground) {
        toast.error('Sync Error', err?.message);
        setErrorMessage(err?.message);
      }
    } finally {
      if (!isBackground) setIsSyncingDocuments(false);
    }
  }, [token, getHeaders, loadOverviewData, selectedMachineId, loadMachineProfile, toast]);

  useEffect(() => {
    loadOverviewData();
    // Automatically extract and sync Knowledge Hub indexed documents on component load
    handleSyncFromDocuments(true);
  }, [loadOverviewData, handleSyncFromDocuments]);

  useEffect(() => {
    if (selectedMachineId) {
      loadMachineProfile(selectedMachineId);
    }
  }, [selectedMachineId, loadMachineProfile]);

  // Global Esc key dismiss handler for modals and detail panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRegisterModalOpen) {
          setIsRegisterModalOpen(false);
        } else if (isTaskModalOpen) {
          setIsTaskModalOpen(false);
        } else if (reviewingClaimId) {
          setReviewingClaimId(null);
        } else if (selectedMachineId) {
          setSelectedMachineId(null);
          setProfile(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRegisterModalOpen, isTaskModalOpen, reviewingClaimId, selectedMachineId]);

  // Handle Evidence Ingestion & AI Extraction
  const handleIngestEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineId || !ingestRawText.trim()) {
      const msg = 'Evidence text or manual excerpt cannot be empty.';
      setErrorMessage(msg);
      toast.error('Validation Error', msg);
      return;
    }

    setIngesting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/v1/recovery/evidence/ingest', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          machineId: selectedMachineId,
          evidenceType: ingestType,
          rawText: ingestRawText,
          sourceRevision: ingestRevision || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Evidence extraction failed.');
      }

      toast.success('Evidence Extracted', json.message || 'Evidence parsed and claims generated.');
      setIngestResult(json.data);
      setSuccessMessage(json.message);
      setIngestRawText('');
      await loadMachineProfile(selectedMachineId);
      await loadOverviewData();
    } catch (err: any) {
      setErrorMessage(err.message);
      toast.error('Extraction Failed', err.message);
    } finally {
      setIngesting(false);
    }
  };

  // Handle Claim Review
  const handleSubmitReview = async (claimId: string) => {
    if (!reviewRationale.trim()) {
      const msg = 'Substantive engineering review rationale is required.';
      setErrorMessage(msg);
      toast.error('Validation Error', msg);
      return;
    }

    setSubmittingReview(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/v1/recovery/claims/${claimId}/review`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          decision: reviewDecision,
          reviewNotes: reviewRationale,
          reviewRationale,
          reviewerQualifications,
          correctedValue: correctedValue.trim() ? correctedValue : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Claim review failed.');
      }

      toast.success('Claim Reviewed', `Claim decision '${reviewDecision}' recorded successfully.`);
      setSuccessMessage(`Claim decision '${reviewDecision}' recorded successfully.`);
      setReviewingClaimId(null);
      setReviewRationale('');
      setCorrectedValue('');
      if (selectedMachineId) {
        await loadMachineProfile(selectedMachineId);
      }
      await loadOverviewData();
    } catch (err: any) {
      setErrorMessage(err.message);
      toast.error('Review Failed', err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Handle Safe Task Creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineId) return;

    setSubmittingTask(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/recovery/tasks', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          machineId: selectedMachineId,
          requestedFields: taskFields,
          instructions: taskInstructions,
          dueDate: taskDueDate || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to create collection task.');
      }

      toast.success('Task Created', 'Information recovery task successfully created.');
      setSuccessMessage('Information recovery task successfully created.');
      setIsTaskModalOpen(false);
      if (selectedMachineId) {
        await loadMachineProfile(selectedMachineId);
      }
      await loadOverviewData();
    } catch (err: any) {
      setErrorMessage(err.message);
      toast.error('Task Creation Failed', err.message);
    } finally {
      setSubmittingTask(false);
    }
  };

  // Handle Register Legacy Machine
  const handleRegisterMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regAssetTag || !regName || !regPlantId) {
      const msg = 'Asset Tag, Machine Name, and Plant are required.';
      setErrorMessage(msg);
      toast.error('Validation Error', msg);
      return;
    }

    setSubmittingRegister(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/recovery/machines/register', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          plantId: regPlantId,
          assetTag: regAssetTag,
          name: regName,
          machineType: regType,
          area: regArea,
          manufacturer: regMfr.trim() ? regMfr.trim() : null,
          modelNumber: regModel.trim() ? regModel.trim() : null,
          serialNumber: regSerial.trim() ? regSerial.trim() : null,
          estimatedVintage: regVintage !== 'Unknown' ? regVintage : undefined,
          nameplateImage: regNameplateFile ? {
            filename: regNameplateFile.name,
            fileSizeBytes: regNameplateFile.size,
            dataUrl: regNameplateBase64 || undefined,
          } : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to register machine.');
      }

      toast.success('Machine Registered', json.message || 'Legacy machine registered successfully.');
      setSuccessMessage(json.message);
      setIsRegisterModalOpen(false);
      setRegAssetTag('');
      setRegName('');
      setRegMfr('');
      setRegModel('');
      setRegSerial('');
      setRegVintage('Unknown');
      setRegNameplateFile(null);
      setRegNameplateBase64(null);
      await loadOverviewData();
    } catch (err: any) {
      setErrorMessage(err.message);
      toast.error('Registration Failed', err.message);
    } finally {
      setSubmittingRegister(false);
    }
  };

  // Filter Machines
  const filteredMachines = machines.filter((m) => {
    if (filterConfidence === 'VERIFIED' && m.verificationState !== 'VERIFIED') return false;
    if (filterConfidence === 'PARTIAL' && m.verificationState !== 'PARTIALLY_VERIFIED') return false;
    if (filterConfidence === 'UNIDENTIFIED' && m.verificationState !== 'UNVERIFIED') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTag = m.assetTag.toLowerCase().includes(q);
      const matchName = m.name.toLowerCase().includes(q);
      const matchMfr = m.manufacturer?.toLowerCase().includes(q);
      const matchModel = m.modelNumber?.toLowerCase().includes(q);
      return matchTag || matchName || matchMfr || matchModel;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#F5F6F7] text-[#1A202C] overflow-y-auto font-sans">
      {/* Top Banner & Title */}
      <div className="border-b border-[#E2E8F0] bg-white px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-[#2563EB]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#1A202C] flex items-center gap-2">
                Machine Knowledge Recovery System
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#2563EB] border border-blue-200">
                  Phase 3 Active
                </span>
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Recover missing legacy specs, nameplate evidence, and govern engineering verification for undocumented machines.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSyncFromDocuments(false)}
            disabled={isSyncingDocuments}
            className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-60"
            title="Automatically scan indexed Knowledge Hub documents and extract nameplate & technical parameters into Recovery"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSyncingDocuments ? 'animate-spin' : ''}`} />
            <span>{isSyncingDocuments ? 'Extracting Claims...' : 'Sync & Extract to Recovery'}</span>
          </button>
          {isSupervisory && (
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#151C24] hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Register Legacy Asset
            </button>
          )}
          <button
            onClick={() => {
              loadOverviewData();
              if (selectedMachineId) loadMachineProfile(selectedMachineId);
            }}
            disabled={loading}
            className="p-1.5 border border-[#CBD5E1] hover:border-slate-400 text-[#1A202C] bg-white rounded-md transition shadow-xs"
            title="Refresh Registry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#2563EB]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMessage && (
        <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-6 pt-4">
        <div className="bg-white border border-[#E2E8F0] border-t-2 border-t-slate-500 p-3.5 rounded-xl flex flex-col justify-between shadow-xs hover:border-slate-300 transition">
          <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Total Machinery</div>
          <div className="text-2xl font-bold text-[#1A202C] mt-1">{summary?.totalMachines ?? 0}</div>
          <div className="text-[10px] text-[#64748B] mt-1 font-medium">Monitored plant assets</div>
        </div>

        <div className="bg-white border border-amber-200 border-t-2 border-t-amber-500 bg-amber-50/20 p-3.5 rounded-xl flex flex-col justify-between shadow-xs hover:border-amber-300 transition">
          <div className="text-[11px] font-semibold text-amber-800 flex items-center justify-between uppercase tracking-wider">
            <span>Legacy / Incomplete</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{summary?.legacyOrIncompleteMachines ?? 0}</div>
          <div className="text-[10px] text-amber-700 mt-1 font-medium">Require knowledge recovery</div>
        </div>

        <div className="bg-white border border-blue-200 border-t-2 border-t-[#2563EB] bg-blue-50/20 p-3.5 rounded-xl flex flex-col justify-between shadow-xs hover:border-blue-300 transition">
          <div className="text-[11px] font-semibold text-[#2563EB] flex items-center justify-between uppercase tracking-wider">
            <span>Claims For Review</span>
            <Clock className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-[#2563EB] mt-1">{summary?.claimsAwaitingReview ?? 0}</div>
          <div className="text-[10px] text-blue-700 mt-1 font-medium">Pending engineer sign-off</div>
        </div>

        <div className="bg-white border border-emerald-200 border-t-2 border-t-emerald-600 bg-emerald-50/20 p-3.5 rounded-xl flex flex-col justify-between shadow-xs hover:border-emerald-300 transition">
          <div className="text-[11px] font-semibold text-emerald-800 flex items-center justify-between uppercase tracking-wider">
            <span>Approved Knowledge</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{summary?.approvedClaimsCount ?? 0}</div>
          <div className="text-[10px] text-emerald-700 mt-1 font-medium">Grounded in Copilot KB</div>
        </div>

        <div className="bg-white border border-purple-200 border-t-2 border-t-purple-600 bg-purple-50/20 p-3.5 rounded-xl flex flex-col justify-between shadow-xs hover:border-purple-300 transition">
          <div className="text-[11px] font-semibold text-purple-800 flex items-center justify-between uppercase tracking-wider">
            <span>Collection Tasks</span>
            <ClipboardList className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-700 mt-1">{summary?.openCollectionTasksCount ?? 0}</div>
          <div className="text-[10px] text-purple-700 mt-1 font-medium">
            {summary?.overdueTasksCount ? `${summary.overdueTasksCount} overdue` : 'On track'}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] border-t-2 border-t-slate-400 p-3.5 rounded-xl flex flex-col justify-between shadow-xs hover:border-slate-300 transition">
          <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Rejected / Superseded</div>
          <div className="text-2xl font-bold text-[#475569] mt-1">
            {(summary?.rejectedClaimsCount ?? 0) + (summary?.supersededClaimsCount ?? 0)}
          </div>
          <div className="text-[10px] text-[#64748B] mt-1 font-medium">Excluded from current RAG</div>
        </div>
      </div>

      {/* Main Content: Split View (Machine Registry & Recovery Workspace Drawer) */}
      <div className="flex-1 px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[500px]">
        {/* Left Column: Machinery Directory */}
        <div className={`${selectedMachineId ? 'lg:col-span-5' : 'lg:col-span-12'} flex flex-col bg-white border border-[#E2E8F0] rounded-lg overflow-hidden shadow-sm`}>
          {/* Controls Bar */}
          <div className="p-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search tag, name, model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#CBD5E1] pl-8 pr-3 py-1.5 text-xs text-[#1A202C] rounded focus:outline-none focus:border-[#2563EB]"
              />
            </div>


            <select
              value={filterConfidence}
              onChange={(e) => setFilterConfidence(e.target.value)}
              className="bg-white border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#1A202C] rounded focus:outline-none focus:border-[#2563EB]"
            >
              <option value="ALL">All States</option>
              <option value="UNIDENTIFIED">Unidentified</option>
              <option value="PARTIAL">Partially Identified</option>
              <option value="VERIFIED">Fully Verified</option>
            </select>
          </div>

          {/* Machinery List Table */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
            {filteredMachines.length === 0 ? (
              <div className="p-8 text-center text-[#64748B] text-xs">
                No machinery matches the selected search filters.
              </div>
            ) : (
              filteredMachines.map((m) => {
                const isSelected = selectedMachineId === m.id;
                const isVerified = m.verificationState === 'VERIFIED';
                const isPartial = m.verificationState === 'PARTIALLY_VERIFIED';

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMachineId(m.id)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-50/60 border-l-2 border-[#2563EB]'
                        : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#2563EB]">{m.assetTag}</span>
                        <span className="text-xs text-[#1A202C] font-semibold">{m.name}</span>
                      </div>
                      <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                        <span>{m.machineType}</span>
                        <span>•</span>
                        <span>{m.area}</span>
                        <span>•</span>
                        <span className="italic">{m.manufacturer || 'OEM Unknown'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          isVerified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isPartial
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {isVerified ? 'VERIFIED' : isPartial ? 'PARTIAL' : 'UNIDENTIFIED'}
                      </span>
                      <ChevronRight className={`w-4 h-4 text-slate-400 ${isSelected ? 'text-[#2563EB]' : ''}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Machine Recovery Profile & Tabs */}
        {selectedMachineId && (
          <div className="lg:col-span-7 flex flex-col bg-white border border-[#E2E8F0] rounded-lg overflow-hidden shadow-sm">
            {profileLoading ? (
              <div className="p-12 text-center text-[#64748B] text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#2563EB]" />
                <span>Loading Machine Recovery Profile...</span>
              </div>
            ) : profile ? (
              <>
                {/* Profile Header */}
                <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#2563EB]">{profile.assetTag}</span>
                      <h2 className="text-sm font-bold text-[#1A202C]">{profile.name}</h2>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          profile.identificationConfidence === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : profile.identificationConfidence === 'PARTIAL'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {profile.identificationConfidence} IDENTITY
                      </span>
                    </div>
                    <div className="text-xs text-[#64748B] mt-1 flex flex-wrap gap-x-3">
                      <span>Category: <strong className="text-[#1A202C]">{profile.machineCategory}</strong></span>
                      <span>Plant: <strong className="text-[#1A202C]">{profile.plantName}</strong></span>
                      <span>OEM: <strong className="text-[#1A202C]">{profile.manufacturer || 'Explicitly Unknown'}</strong></span>
                      <span>Model: <strong className="text-[#1A202C]">{profile.modelNumber || 'Explicitly Unknown'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onNavigateToCopilot && (
                      <button
                        onClick={() => onNavigateToCopilot(profile.assetTag)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-[#2563EB] border border-[#CBD5E1] rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs font-medium"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                        Ask Copilot
                      </button>
                    )}
                    <button
                      onClick={() => setIsTaskModalOpen(true)}
                      className="px-2.5 py-1.5 bg-[#151C24] hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Assign Task
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMachineId(null);
                        setProfile(null);
                      }}
                      className="p-1.5 bg-white hover:bg-slate-100 text-[#64748B] hover:text-[#1A202C] border border-[#CBD5E1] rounded-lg transition shadow-xs flex items-center gap-1"
                      title="Close machine details (Esc)"
                    >
                      <X className="w-4 h-4" />
                      <span className="text-xs font-medium hidden sm:inline">Close</span>
                    </button>
                  </div>
                </div>

                {/* Unresolved Identity Questions / Warnings Banner */}
                {profile.unresolvedIdentityQuestions.length > 0 && (
                  <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 space-y-1">
                    <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Unresolved Identity & Safety Questions:
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-amber-800 pl-1">
                      {profile.unresolvedIdentityQuestions.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Workspace Navigation Tabs */}
                <div className="border-b border-[#E2E8F0] bg-white px-4 flex gap-4 text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab('gap')}
                    className={`py-2.5 border-b-2 transition ${
                      activeTab === 'gap'
                        ? 'border-[#2563EB] text-[#2563EB]'
                        : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
                    }`}
                  >
                    Gap Analysis Checklist ({profile.approvedFieldsCount}/{profile.totalFieldsRequired} Approved)
                  </button>

                  <button
                    onClick={() => setActiveTab('ingest')}
                    className={`py-2.5 border-b-2 transition ${
                      activeTab === 'ingest'
                        ? 'border-[#2563EB] text-[#2563EB]'
                        : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
                    }`}
                  >
                    Evidence Ingestion & AI Extract
                  </button>

                  <button
                    onClick={() => setActiveTab('review')}
                    className={`py-2.5 border-b-2 transition flex items-center gap-1.5 ${
                      activeTab === 'review'
                        ? 'border-[#2563EB] text-[#2563EB]'
                        : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
                    }`}
                  >
                    Review Queue
                    {claims.filter((c) => c.status === 'AWAITING_REVIEW').length > 0 && (
                      <span className="px-1.5 py-0.2 bg-blue-100 text-[#2563EB] text-[10px] rounded-full font-bold">
                        {claims.filter((c) => c.status === 'AWAITING_REVIEW').length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={`py-2.5 border-b-2 transition ${
                      activeTab === 'tasks'
                        ? 'border-[#2563EB] text-[#2563EB]'
                        : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
                    }`}
                  >
                    Tasks ({tasks.length})
                  </button>
                </div>

                {/* Tab 1: Gap Analysis Checklist */}
                {activeTab === 'gap' && (
                  <div className="p-4 overflow-y-auto space-y-4">
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                      <span>Documentation Readiness: <strong className="text-[#1A202C]">{profile.readinessPercentage}%</strong></span>
                      <span>Safety-Critical Pending: <strong className="text-amber-700">{profile.safetyCriticalPendingCount}</strong></span>
                    </div>

                    <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2563EB] h-full transition-all duration-300"
                        style={{ width: `${profile.readinessPercentage}%` }}
                      />
                    </div>

                    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] text-[#64748B] border-b border-[#E2E8F0]">
                          <tr>
                            <th className="p-2.5 font-semibold">Field / Specification</th>
                            <th className="p-2.5 font-semibold">Status</th>
                            <th className="p-2.5 font-semibold">Current Value</th>
                            <th className="p-2.5 font-semibold">Approved Provenance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {profile.fields.map((f) => (
                            <tr key={f.fieldName} className="hover:bg-[#F8FAFC]">
                              <td className="p-2.5">
                                <div className="font-semibold text-[#1A202C] flex items-center gap-1.5">
                                  {f.displayName}
                                  {f.isSafetyCritical && (
                                    <span className="text-[9px] font-bold px-1 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                      SAFETY
                                    </span>
                                  )}
                                  {f.isRequired && <span className="text-amber-600">*</span>}
                                </div>
                                <div className="text-[10px] font-mono text-[#64748B]">{f.fieldName}</div>
                              </td>

                              <td className="p-2.5">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    f.status === 'APPROVED'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : f.status === 'AWAITING_REVIEW'
                                      ? 'bg-blue-50 text-[#2563EB] border-blue-200'
                                      : f.status === 'CONFLICTING'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : f.status === 'PENDING_EVIDENCE' || f.status === 'UNVERIFIED'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-100 text-[#64748B] border-[#E2E8F0]'
                                  }`}
                                >
                                  {f.status.replace(/_/g, ' ')}
                                </span>
                              </td>

                              <td className="p-2.5 font-mono text-[#1A202C]">
                                {f.currentApprovedValue !== undefined && f.currentApprovedValue !== null && String(f.currentApprovedValue).trim() !== ''
                                  ? `${f.currentApprovedValue} ${f.unit || ''}`
                                  : f.draftValue !== undefined && f.draftValue !== null && String(f.draftValue).trim() !== ''
                                  ? `${f.draftValue} ${f.unit || ''}`
                                  : <span className="text-[#94A3B8] italic">Unknown</span>}
                              </td>

                              <td className="p-2.5 text-[11px] text-[#64748B]">
                                {f.approvedProvenance ? (
                                  <div>
                                    <div className="text-[#1A202C]">{f.approvedProvenance.sourceType} ({f.approvedProvenance.sourceRevision || 'Rev 1.0'})</div>
                                    <div className="text-[10px] text-[#64748B]">
                                      Verified: {f.approvedProvenance.reviewerQualifications || 'PE'}
                                    </div>
                                  </div>
                                ) : f.status === 'PENDING_EVIDENCE' || f.status === 'UNVERIFIED' ? (
                                  <div className="text-amber-700 text-[10px] font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-600 shrink-0 inline" />
                                    <span>Asset Ledger Draft (Unverified)</span>
                                  </div>
                                ) : f.status === 'CONFLICTING' && f.conflictDetails ? (
                                  <div className="text-rose-600 text-[10px] font-medium">
                                    Conflicting values collected across {f.conflictDetails.length} sources. Engineering resolution needed.
                                  </div>
                                ) : (
                                  <span className="text-[#94A3B8] italic">Genuinely missing</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 2: Evidence Ingestion & AI Extraction */}
                {activeTab === 'ingest' && (
                  <div className="p-4 overflow-y-auto space-y-4">
                    <form onSubmit={handleIngestEvidence} className="space-y-3 bg-[#F8FAFC] p-4 border border-[#E2E8F0] rounded-lg">
                      <h3 className="text-xs font-bold text-[#1A202C] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#2563EB]" />
                        Ingest Machine Evidence Document or Nameplate Photograph
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#475569] mb-1">Evidence Source Type</label>
                          <select
                            value={ingestType}
                            onChange={(e) => setIngestType(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                          >
                            <option value="NAMEPLATE_PHOTO">Nameplate Photograph</option>
                            <option value="SCANNED_MANUAL">Scanned PDF / Vendor Manual</option>
                            <option value="ENGINEERING_DRAWING">Engineering Drawing / P&ID</option>
                            <option value="TECHNICIAN_OBSERVATION">Technician Observation / Field Walkdown</option>
                            <option value="MAINTENANCE_LOG">Historical Maintenance Record</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#475569] mb-1">Source Revision / Date</label>
                          <input
                            type="text"
                            placeholder="e.g. Rev 2.1 (March 1998)"
                            value={ingestRevision}
                            onChange={(e) => setIngestRevision(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#475569] mb-1">
                          Extracted Text, OCR Stream, or Observation Notes
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Paste OCR text, scanned nameplate readings, or technician observations here..."
                          value={ingestRawText}
                          onChange={(e) => setIngestRawText(e.target.value)}
                          className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded focus:outline-none focus:border-[#2563EB] font-mono"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#64748B]">
                          Extracted values will be held as unverified candidate claims until approved.
                        </span>
                        <button
                          type="submit"
                          disabled={ingesting || !ingestRawText.trim()}
                          className="px-4 py-1.5 bg-[#151C24] hover:bg-black disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                        >
                          {ingesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Extract Candidate Claims
                        </button>
                      </div>
                    </form>

                    {/* Extraction Results */}
                    {ingestResult && (
                      <div className="bg-white border border-blue-200 p-4 rounded-lg space-y-3 shadow-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[#2563EB]">Extraction Results</h4>
                          <span className="text-[10px] text-[#64748B]">
                            Method: {ingestResult.provenance.extractionMethod}
                          </span>
                        </div>

                        {ingestResult.extractedClaims.length === 0 ? (
                          <div className="text-xs text-[#64748B]">No specifications matched pattern extractors.</div>
                        ) : (
                          <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded">
                            {ingestResult.extractedClaims.map((c: any, idx: number) => (
                              <div key={idx} className="p-2 flex items-center justify-between text-xs">
                                <div>
                                  <span className="font-semibold text-[#1A202C]">{c.displayName}</span>
                                  <span className="ml-2 font-mono text-[#2563EB] font-bold">{c.candidateValue} {c.unit || ''}</span>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-[#2563EB] border border-blue-200 font-bold">
                                  UNVERIFIED CANDIDATE
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {ingestResult.potentialInconsistencies.length > 0 && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                            <strong>Potential Inconsistencies Detected:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {ingestResult.potentialInconsistencies.map((w: string, idx: number) => (
                                <li key={idx}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Engineering Review Queue */}
                {activeTab === 'review' && (
                  <div className="p-4 overflow-y-auto space-y-4">
                    {claims.length === 0 ? (
                      <div className="p-8 text-center text-[#64748B] text-xs">
                        No evidence claims have been submitted for this machine yet.
                      </div>
                    ) : (
                      claims.map((claim) => {
                        const isPending = claim.status === 'AWAITING_REVIEW';
                        const isSelectedReview = reviewingClaimId === claim.id;
                        const isOwnClaim = claim.submittedByUserId === user?.id;
                        const canApprove = isSupervisory && (!isOwnClaim || isOwnerOrAdmin);

                        return (
                          <div
                            key={claim.id}
                            className={`p-3.5 bg-[#F8FAFC] border rounded-lg space-y-2 transition ${
                              isSelectedReview ? 'border-[#2563EB] ring-1 ring-blue-300 bg-blue-50/20' : 'border-[#E2E8F0]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#1A202C]">{claim.displayName || claim.fieldName}</span>
                                <span className="font-mono text-xs font-bold text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  {String(claim.claimValue)} {claim.unit || ''}
                                </span>
                                {claim.isSafetyCritical && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                    SAFETY-CRITICAL
                                  </span>
                                )}
                              </div>

                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  claim.status === 'APPROVED'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : claim.status === 'AWAITING_REVIEW'
                                    ? 'bg-blue-50 text-[#2563EB] border-blue-200'
                                    : claim.status === 'REJECTED'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-100 text-[#64748B] border-[#E2E8F0]'
                                }`}
                              >
                                {claim.status}
                              </span>
                            </div>

                            <div className="text-[11px] text-[#64748B] flex flex-wrap gap-x-4">
                              <span>Source: <strong className="text-[#1A202C]">{claim.sourceType}</strong></span>
                              <span>Method: <strong className="text-[#1A202C]">{claim.extractionMethod}</strong></span>
                              <span>Rev: <strong className="text-[#1A202C]">{claim.sourceRevision || 'N/A'}</strong></span>
                              <span>Submitted By: <strong className="text-[#1A202C]">{claim.submittedByEmail || 'Technician'}</strong></span>
                            </div>

                            {claim.applicabilityRationale && (
                              <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                                {claim.applicabilityRationale}
                              </div>
                            )}

                            {claim.reviewRationale && (
                              <div className="text-[11px] text-[#1A202C] bg-white p-2 rounded border border-[#E2E8F0]">
                                <span className="text-[#64748B]">Review Rationale:</span> {claim.reviewRationale}
                              </div>
                            )}

                            {/* Review Actions Drawer */}
                            {isPending && isSupervisory && (
                              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
                                {!canApprove && (
                                  <span className="text-[10px] text-amber-700 flex items-center gap-1 font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Anti-self-approval: You submitted this claim; another engineer must review it.
                                  </span>
                                )}

                                <div className="ml-auto flex items-center gap-2">
                                  <button
                                    onClick={() => setReviewingClaimId(isSelectedReview ? null : claim.id)}
                                    className="px-3 py-1 bg-[#151C24] hover:bg-black text-white rounded text-xs font-semibold transition shadow-xs"
                                  >
                                    {isSelectedReview ? 'Close Review' : 'Review Claim'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {isSelectedReview && (
                              <div className="mt-3 p-3 bg-white border border-[#CBD5E1] rounded-lg space-y-3 text-xs shadow-xs">
                                <div className="font-semibold text-[#1A202C]">Engineering Review & Sign-Off</div>

                                <div className="flex gap-4">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="APPROVE"
                                      checked={reviewDecision === 'APPROVE'}
                                      onChange={() => setReviewDecision('APPROVE')}
                                    />
                                    <span className="text-emerald-700 font-semibold">Approve Claim</span>
                                  </label>

                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="REJECT"
                                      checked={reviewDecision === 'REJECT'}
                                      onChange={() => setReviewDecision('REJECT')}
                                    />
                                    <span className="text-rose-700 font-semibold">Reject</span>
                                  </label>

                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="REQUEST_ADDITIONAL_EVIDENCE"
                                      checked={reviewDecision === 'REQUEST_ADDITIONAL_EVIDENCE'}
                                      onChange={() => setReviewDecision('REQUEST_ADDITIONAL_EVIDENCE')}
                                    />
                                    <span className="text-amber-700 font-semibold">Request More Info</span>
                                  </label>
                                </div>

                                <div>
                                  <label className="block text-[#475569] mb-1 font-medium">
                                    Reviewer Qualifications / Certification
                                    {claim.isSafetyCritical && <span className="text-rose-600">* (Mandatory)</span>}
                                  </label>
                                  <input
                                    type="text"
                                    value={reviewerQualifications}
                                    onChange={(e) => setReviewerQualifications(e.target.value)}
                                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[#475569] mb-1 font-medium">
                                    Substantive Engineering Review Rationale <span className="text-rose-600">*</span>
                                  </label>
                                  <textarea
                                    rows={2}
                                    placeholder="State rationale, document verification, nameplate stamping, or standard applied..."
                                    value={reviewRationale}
                                    onChange={(e) => setReviewRationale(e.target.value)}
                                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded font-sans focus:border-[#2563EB]"
                                  />
                                </div>

                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setReviewingClaimId(null)}
                                    className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-[#1A202C] rounded text-xs"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSubmitReview(claim.id)}
                                    disabled={submittingReview || !reviewRationale.trim()}
                                    className="px-4 py-1 bg-[#151C24] hover:bg-black disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs"
                                  >
                                    {submittingReview ? 'Submitting...' : 'Commit Review Decision'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Tab 4: Collection Tasks */}
                {activeTab === 'tasks' && (
                  <div className="p-4 overflow-y-auto space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B] font-medium">Information Collection Tasks</span>
                      <button
                        onClick={() => setIsTaskModalOpen(true)}
                        className="px-2.5 py-1 bg-[#151C24] hover:bg-black text-white rounded text-xs flex items-center gap-1 font-semibold shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create Collection Task
                      </button>
                    </div>

                    {tasks.length === 0 ? (
                      <div className="p-8 text-center text-[#64748B] text-xs">
                        No collection tasks assigned for this machine.
                      </div>
                    ) : (
                      tasks.map((t) => (
                        <div key={t.id} className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#1A202C]">Task for {t.requestedFields.join(', ')}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-[#475569] border border-[#E2E8F0] font-bold">
                              {t.status}
                            </span>
                          </div>
                          <div className="text-[#64748B]">{t.instructions}</div>
                          {t.dueDate && <div className="text-[11px] text-[#64748B]">Due: {t.dueDate}</div>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Register Legacy Machine Modal */}
      {isRegisterModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsRegisterModalOpen(false);
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#2563EB]" />
                Register Legacy or Poorly Documented Machine
              </h3>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                title="Close modal (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterMachine} className="p-5 space-y-3 text-xs">
              <p className="text-[11px] text-[#64748B]">
                Register known identifiers. Missing manufacturer or model specifications remain explicitly unknown rather than guessed.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#475569] mb-1 font-medium">Asset Tag *</label>
                  <input
                    type="text"
                    placeholder="e.g. PUMP-301-LEGACY"
                    value={regAssetTag}
                    onChange={(e) => setRegAssetTag(e.target.value)}
                    required
                    className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded font-mono focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-[#475569] mb-1 font-medium">Machine Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Crude Booster Pump"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#475569] mb-1 font-medium">Category</label>
                  <select
                    value={regType}
                    onChange={(e) => setRegType(e.target.value)}
                    className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                  >
                    <option value="Centrifugal Pump">Centrifugal Pump</option>
                    <option value="Electric Motor">Electric Motor</option>
                    <option value="Boiler / Pressure Vessel">Boiler / Pressure Vessel</option>
                    <option value="Industrial Machinery">Other Machinery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#475569] mb-1 font-medium">Facility / Plant Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Unit 4 Crude Distillation"
                    value={regArea}
                    onChange={(e) => setRegArea(e.target.value)}
                    className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                <div className="font-semibold text-[#1A202C]">Nameplate Identifiers (Optional / Known Fields)</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-[#64748B] mb-1">Manufacturer</label>
                    <input
                      type="text"
                      placeholder="Unknown"
                      value={regMfr}
                      onChange={(e) => setRegMfr(e.target.value)}
                      className="w-full bg-white border border-[#CBD5E1] p-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#64748B] mb-1">Model Number</label>
                    <input
                      type="text"
                      placeholder="Unknown"
                      value={regModel}
                      onChange={(e) => setRegModel(e.target.value)}
                      className="w-full bg-white border border-[#CBD5E1] p-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#64748B] mb-1">Serial Number</label>
                    <input
                      type="text"
                      placeholder="Unknown"
                      value={regSerial}
                      onChange={(e) => setRegSerial(e.target.value)}
                      className="w-full bg-white border border-[#CBD5E1] p-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-[10px] text-[#64748B] mb-1 font-medium">Estimated Vintage / Decade (Optional)</label>
                  <select
                    value={regVintage}
                    onChange={(e) => setRegVintage(e.target.value)}
                    className="w-full bg-white border border-[#CBD5E1] p-1.5 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                  >
                    <option value="Unknown">Unknown</option>
                    <option value="1970s or Earlier">1970s or Earlier</option>
                    <option value="1980s">1980s</option>
                    <option value="1990s">1990s</option>
                    <option value="2000s">2000s</option>
                    <option value="2010s">2010s</option>
                    <option value="2020s">2020s</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
                  <label className="block text-xs font-semibold text-[#1A202C]">
                    Nameplate Image / Machine Photo
                    <span className="ml-1 text-[10px] font-normal text-[#64748B]">(For AI Extraction)</span>
                  </label>
                  <p className="text-[11px] text-[#64748B]">
                    Upload a physical nameplate photograph or machine rating tag for subsequent automated AI extraction.
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 rounded text-xs font-medium flex items-center gap-1.5 transition">
                      <Upload className="w-3.5 h-3.5" />
                      {regNameplateFile ? 'Change Image' : 'Select Nameplate Image'}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setRegNameplateFile(file);
                            const reader = new FileReader();
                            reader.onload = () => setRegNameplateBase64(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    {regNameplateFile && (
                      <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                        <span className="font-mono text-[11px] truncate max-w-[200px] text-[#1A202C]">{regNameplateFile.name}</span>
                        <span className="text-[10px] text-[#64748B]">({(regNameplateFile.size / 1024).toFixed(1)} KB)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setRegNameplateFile(null);
                            setRegNameplateBase64(null);
                          }}
                          className="text-slate-400 hover:text-rose-600"
                          title="Remove file"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#1A202C] rounded text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRegister}
                  className="px-4 py-1.5 bg-[#151C24] hover:bg-black disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs"
                >
                  {submittingRegister ? 'Registering...' : 'Register Machine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Collection Task Modal */}
      {isTaskModalOpen && profile && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsTaskModalOpen(false);
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-amber-600" />
                Assign Knowledge Collection Task
              </h3>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                title="Close modal (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-5 space-y-3 text-xs">
              <div className="text-[11px] text-[#64748B]">
                Target Machine: <strong className="text-[#1A202C]">{profile.assetTag} ({profile.name})</strong>
              </div>

              <div>
                <label className="block text-[#475569] mb-1 font-medium">Requested Missing Fields</label>
                <input
                  type="text"
                  value={taskFields.join(', ')}
                  onChange={(e) => setTaskFields(e.target.value.split(',').map((s) => s.trim()))}
                  className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded font-mono focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[#475569] mb-1 font-medium">Approved Collection Instructions</label>
                <textarea
                  rows={3}
                  value={taskInstructions}
                  onChange={(e) => setTaskInstructions(e.target.value)}
                  className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded font-sans focus:border-[#2563EB]"
                />
                <span className="text-[10px] text-amber-700 font-semibold mt-1 block">
                  Safety Mandate: Never dismantle energized equipment or bypass guards without an approved procedure.
                </span>
              </div>

              <div>
                <label className="block text-[#475569] mb-1 font-medium">Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full bg-white border border-[#CBD5E1] p-2 text-xs text-[#1A202C] rounded focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#1A202C] rounded text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTask}
                  className="px-4 py-1.5 bg-[#151C24] hover:bg-black disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs"
                >
                  {submittingTask ? 'Assigning...' : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

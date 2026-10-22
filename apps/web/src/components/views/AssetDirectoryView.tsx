import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Box,
  FileCode,
  QrCode,
  Globe,
  Plus,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { StatusBadge } from '../ui/StatusBadge';
import { RealThreeDViewerModal } from './RealThreeDViewerModal';
import { PidEngineeringViewerModal } from './PidEngineeringViewerModal';
import { MachinePosterModal } from './MachinePosterModal';
import { RegisterMachineModal } from './RegisterMachineModal';
import { PublicLookupModal } from './PublicLookupModal';
import { TaskManagementModal } from './TaskManagementModal';
import type { Machine, MachineLedgerSummary, DataClassification, ComponentMapping } from '@forgex/shared-types';
import { enrichMachinesWithStoredFiles } from '../../lib/machineStorage';

interface AssetDirectoryViewProps {
  onNavigateToCopilot?: (assetTag: string) => void;
  onNavigateToManuals?: (assetTag: string) => void;
}

export const AssetDirectoryView: React.FC<AssetDirectoryViewProps> = () => {
  const { token, organization, isOwnerOrAdmin } = useAuth();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [summary, setSummary] = useState<MachineLedgerSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClassification, setFilterClassification] = useState<string>('ALL');
  const [selectedAsset, setSelectedAsset] = useState<Machine | null>(null);
  const selectedMachine = selectedAsset;
  const setSelectedMachine = setSelectedAsset;
  const [mappings, setMappings] = useState<ComponentMapping[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isPublicLookupOpen, setIsPublicLookupOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isThreeDOpen, setIsThreeDOpen] = useState(false);
  const [isPidOpen, setIsPidOpen] = useState(false);
  const [pidInitialTag, setPidInitialTag] = useState<string | undefined>(undefined);
  const [isPosterOpen, setIsPosterOpen] = useState(false);

  // Machine deletion state
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [machinesToDelete, setMachinesToDelete] = useState<Machine[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedAsset && token) {
      fetch(`/api/v1/machines/${selectedAsset.id}/mappings`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(organization?.id ? { 'x-organization-id': organization.id } : {}),
        },
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.success && Array.isArray(json.data)) {
            setMappings(json.data);
          }
        })
        .catch(() => {});
    }
  }, [selectedAsset?.id, token, organization?.id]);

  const fetchLedger = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...(organization?.id ? { 'x-organization-id': organization.id } : {}),
      };

      const [machinesRes, summaryRes] = await Promise.all([
        fetch('/api/v1/machines', { headers }),
        fetch('/api/v1/machines/ledger/summary', { headers }),
      ]);

      if (machinesRes.ok) {
        const mJson = await machinesRes.json();
        if (mJson.success && Array.isArray(mJson.data)) {
          const enriched = enrichMachinesWithStoredFiles(mJson.data);
          setMachines(enriched);
          // Do not auto-select machine on initial load; only populate details when a user clicks a row
          setSelectedAsset((prev) => (prev ? enriched.find((m: Machine) => m.id === prev.id) || null : null));
        }
      }

      if (summaryRes.ok) {
        const sJson = await summaryRes.json();
        if (sJson.success && sJson.data) {
          setSummary(sJson.data);
        }
      }
    } catch (err) {
      console.error('Failed to load machine ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [token, organization?.id]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleMachineUpdated = (updatedMachine: Machine) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === updatedMachine.id ? { ...m, ...updatedMachine } : m))
    );
    if (selectedMachine?.id === updatedMachine.id) {
      setSelectedMachine((prev) => (prev ? { ...prev, ...updatedMachine } : updatedMachine));
    }
  };

  const handleOpenPoster = (machine: Machine) => {
    setSelectedMachine(machine);
    setIsPosterOpen(true);
  };

  const handleOpen3D = (machine: Machine) => {
    setSelectedMachine(machine);
    setIsThreeDOpen(true);
  };

  const handleOpenPid = (machine: Machine, tag?: string) => {
    setSelectedMachine(machine);
    setPidInitialTag(tag);
    setIsPidOpen(true);
  };

  const filteredMachines = machines.filter((m) => {
    const matchesSearch =
      m.assetTag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.manufacturer && m.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.building && m.building.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesClassification =
      filterClassification === 'ALL' || m.dataClassification === filterClassification;

    return matchesSearch && matchesClassification;
  });

  const allFilteredSelected =
    filteredMachines.length > 0 &&
    filteredMachines.every((m) => selectedMachineIds.includes(m.id));

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedMachineIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    );
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredMachines.map((m) => m.id));
      setSelectedMachineIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      const combined = new Set([...selectedMachineIds, ...filteredMachines.map((m) => m.id)]);
      setSelectedMachineIds(Array.from(combined));
    }
  };

  const handleOpenDeleteModal = (targets?: Machine[]) => {
    let toDelete: Machine[] = [];
    if (targets && targets.length > 0) {
      toDelete = targets;
    } else if (selectedMachineIds.length > 0) {
      toDelete = machines.filter((m) => selectedMachineIds.includes(m.id));
    } else if (selectedMachine) {
      toDelete = [selectedMachine];
    }

    if (toDelete.length === 0) return;
    setMachinesToDelete(toDelete);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!token || machinesToDelete.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(organization?.id ? { 'x-organization-id': organization.id } : {}),
      };

      if (machinesToDelete.length > 1) {
        const res = await fetch('/api/v1/machines/bulk-delete', {
          method: 'POST',
          headers,
          body: JSON.stringify({ machineIds: machinesToDelete.map((m) => m.id) }),
        });

        if (!res.ok) {
          await Promise.all(
            machinesToDelete.map(async (m) => {
              const singleRes = await fetch(`/api/v1/machines/${m.id}`, {
                method: 'DELETE',
                headers,
              });
              if (!singleRes.ok) {
                const errData = await singleRes.json().catch(() => ({}));
                throw new Error(errData?.error?.message || `Failed to delete ${m.assetTag}`);
              }
            })
          );
        }
      } else {
        const res = await fetch(`/api/v1/machines/${machinesToDelete[0].id}`, {
          method: 'DELETE',
          headers,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Failed to delete machine ${machinesToDelete[0].assetTag}`);
        }
      }

      const deletedIdSet = new Set(machinesToDelete.map((m) => m.id));
      setSelectedMachineIds((prev) => prev.filter((id) => !deletedIdSet.has(id)));
      if (selectedMachine && deletedIdSet.has(selectedMachine.id)) {
        const remaining = machines.filter((m) => !deletedIdSet.has(m.id));
        setSelectedMachine(remaining.length > 0 ? remaining[0] : null);
      }

      setIsDeleteModalOpen(false);
      setMachinesToDelete([]);

      // Automatically refresh assets list and update 'TOTAL MACHINES' count
      await fetchLedger();
    } catch (err: any) {
      console.error('Delete machine error:', err);
      setDeleteError(err?.message || 'Failed to delete machine(s). Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getClassificationBadge = (classification: DataClassification) => {
    switch (classification) {
      case 'RESTRICTED':
        return (
          <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
            RESTRICTED
          </span>
        );
      case 'CONFIDENTIAL':
        return (
          <span className="px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-bold">
            CONFIDENTIAL
          </span>
        );
      case 'INTERNAL':
        return (
          <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold">
            INTERNAL
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
            PUBLIC
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7]">
      {/* Top Authoritative Machine Ledger Summary Cards */}
      <div className="p-3.5 bg-white border-b border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans text-xs">
        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-[#64748B] uppercase font-semibold">Total Machines</div>
            <div className="text-lg font-bold text-[#1A202C] tabular-nums">
              {summary ? summary.totalMachines : machines.length}
            </div>
          </div>
          <Cpu className="w-5 h-5 text-[#2563EB]" />
        </div>

        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-[#64748B] uppercase font-semibold">Docs Incomplete</div>
            <div className="text-lg font-bold text-amber-600 tabular-nums">
              {summary ? summary.incompleteDocumentationCount : machines.filter((m) => m.documentationReadiness !== 'READY').length}
            </div>
          </div>
          <ShieldAlert className="w-5 h-5 text-amber-600" />
        </div>

        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-[#64748B] uppercase font-semibold">Verified Specs</div>
            <div className="text-lg font-bold text-emerald-600 tabular-nums">
              {machines.filter((m) => m.verificationState === 'VERIFIED').length}
            </div>
          </div>
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        </div>
      </div>

      {/* Action & Filter Toolbar */}
      <div className="p-3 border-b border-[#E2E8F0] bg-white flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by Tag, OEM, Building..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] transition shadow-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1">
            <Filter className="w-3 h-3 text-[#64748B]" />
            <select
              value={filterClassification}
              onChange={(e) => setFilterClassification(e.target.value)}
              className="bg-transparent text-xs font-sans text-[#1A202C] outline-none cursor-pointer"
            >
              <option value="ALL">All Classifications</option>
              <option value="PUBLIC">Public</option>
              <option value="INTERNAL">Internal</option>
              <option value="CONFIDENTIAL">Confidential</option>
              <option value="RESTRICTED">Restricted</option>
            </select>
          </div>
          {loading && (
            <span className="text-[10px] text-[#2563EB] font-mono animate-pulse">Syncing...</span>
          )}
        </div>

        {/* Action Triggers */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPublicLookupOpen(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-sky-700 border border-sky-300 rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shadow-sm cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-sky-600" />
            <span>Public OEM Lookup</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="px-3.5 py-1.5 bg-[#151C24] hover:bg-black text-white rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Machine</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenDeleteModal()}
            disabled={selectedMachineIds.length === 0 && !selectedMachine}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shadow-sm ${
              selectedMachineIds.length > 0 || selectedMachine
                ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                : 'bg-rose-50 text-rose-300 border border-rose-200 cursor-not-allowed opacity-60'
            }`}
            title={
              selectedMachineIds.length > 0
                ? `Delete ${selectedMachineIds.length} selected machine(s)`
                : selectedMachine
                ? `Delete selected machine: ${selectedMachine.assetTag}`
                : 'Select machine(s) from table to delete'
            }
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              Delete Machine
              {selectedMachineIds.length > 0 ? ` (${selectedMachineIds.length})` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Main Table + Detail Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table of Machines */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] text-[11px]">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleSelectAll}
                      className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                      title="Select all filtered machines"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold uppercase">ASSET TAG</th>
                  <th className="py-3 px-4 font-semibold uppercase">MACHINE NAME & TYPE</th>
                  <th className="py-3 px-4 font-semibold uppercase">LOCATION</th>
                  <th className="py-3 px-4 font-semibold uppercase">MANUFACTURER / MODEL</th>
                  <th className="py-3 px-4 font-semibold uppercase">CLASSIFICATION</th>
                  <th className="py-3 px-4 font-semibold uppercase">VERIFICATION</th>
                  <th className="py-3 px-4 font-semibold uppercase text-right">DIGITAL TWINS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredMachines.map((m) => {
                  const isSelected = selectedAsset?.id === m.id;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedAsset(m)}
                      className={`cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? 'bg-blue-50/80 border-l-4 border-l-[#2563EB] shadow-sm font-medium text-[#1A202C]'
                          : 'hover:bg-[#F8FAFC] text-[#1A202C] border-l-4 border-l-transparent'
                      }`}
                    >
                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMachineIds.includes(m.id)}
                          onChange={(e) => handleToggleSelect(m.id, e.target.checked)}
                          className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#2563EB]">
                        <div className="flex items-center gap-1.5">
                          <span>{m.assetTag}</span>
                          <span className="text-[10px] text-[#64748B] font-normal">r{m.revision}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-sans font-medium text-[#1A202C]">{m.name}</div>
                        <div className="text-[10px] text-[#64748B]">{m.machineType}</div>
                      </td>
                      <td className="py-3 px-4 text-[#64748B]">
                        {m.building} • {m.productionLine}
                      </td>
                      <td className="py-3 px-4 text-[#1A202C]">
                        {m.manufacturer || 'Unknown OEM'} {m.modelNumber ? `(${m.modelNumber})` : ''}
                      </td>
                      <td className="py-3 px-4">
                        {getClassificationBadge(m.dataClassification)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge
                          label={m.verificationState}
                          tone={
                            m.verificationState === 'VERIFIED'
                              ? 'healthy'
                              : m.verificationState === 'PARTIALLY_VERIFIED'
                              ? 'warning'
                              : 'critical'
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 3D Digital Twin Viewer Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpen3D(m);
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              m.hasModel3d || m.model3dUrl || m.model3dFile
                                ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border-cyan-200 shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 border-slate-200'
                            }`}
                            title={
                              m.hasModel3d || m.model3dUrl || m.model3dFile
                                ? `Launch 3D Digital Twin Viewer (${m.model3dFile?.name || 'Attached'})`
                                : 'Open 3D Twin Viewer (No Model - Click to Attach)'
                            }
                          >
                            <Box className="w-3.5 h-3.5" />
                          </button>

                          {/* P&ID Engineering Schematic Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPid(m);
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              m.hasPidDiagram || m.pAndIdUrl || m.pidUrl || m.pAndIdFile || m.pidFile
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 border-slate-200'
                            }`}
                            title={
                              m.hasPidDiagram || m.pAndIdUrl || m.pidUrl || m.pAndIdFile || m.pidFile
                                ? `Launch P&ID Engineering Schematic (${(typeof m.pAndIdFile === 'object' ? m.pAndIdFile?.name : m.pAndIdFile) || (typeof m.pidFile === 'object' ? m.pidFile?.name : m.pidFile) || 'Attached'})`
                                : 'Open P&ID Viewer (No Schematic - Click to Attach)'
                            }
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPoster(m);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] border border-[#CBD5E1] transition cursor-pointer"
                            title="Generate Printable Machine QR Poster"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Detail Pane */}
        {selectedAsset && (
          <div className="w-80 md:w-96 border-l border-[#E2E8F0] bg-white p-5 space-y-4 overflow-y-auto shrink-0 font-sans text-xs animate-in slide-in-from-right-4 fade-in duration-200">
            <div className="pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#2563EB] uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Machine Registry Record</span>
                </span>
                <div className="flex items-center gap-2">
                  {getClassificationBadge(selectedAsset.dataClassification)}
                  <button
                    type="button"
                    onClick={() => setSelectedAsset(null)}
                    className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
                    title="Close details panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-base font-bold font-mono text-[#1A202C] mt-1.5">
                {selectedAsset.assetTag}
              </h3>
              <p className="text-xs text-[#64748B] font-sans mt-0.5">{selectedAsset.name}</p>
            </div>

            {/* Quick Digital Twin Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOpen3D(selectedAsset)}
                className={`p-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                  selectedAsset.hasModel3d || selectedAsset.model3dUrl || selectedAsset.model3dFile
                    ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border-cyan-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <Box className="w-4 h-4 text-cyan-600" />
                <span>{selectedAsset.hasModel3d || selectedAsset.model3dUrl || selectedAsset.model3dFile ? '3D Model Twin' : 'Attach 3D Twin'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenPid(selectedAsset)}
                className={`p-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                  selectedAsset.hasPidDiagram || selectedAsset.pAndIdUrl || selectedAsset.pidUrl || selectedAsset.pAndIdFile || selectedAsset.pidFile
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <FileCode className="w-4 h-4 text-amber-600" />
                <span>{selectedAsset.hasPidDiagram || selectedAsset.pAndIdUrl || selectedAsset.pidUrl || selectedAsset.pAndIdFile || selectedAsset.pidFile ? 'P&ID Schematic' : 'Attach P&ID'}</span>
              </button>
            </div>

            {/* QR Poster & Task Action */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOpenPoster(selectedAsset)}
                className="p-2 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#1A202C] flex items-center justify-center gap-1.5 transition"
              >
                <QrCode className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Print QR Poster</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(true)}
                className="p-2 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#1A202C] flex items-center justify-center gap-1.5 transition"
              >
                <ClipboardList className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Manage Tasks</span>
              </button>
            </div>

            {/* Delete Asset Record */}
            <button
              type="button"
              onClick={() => handleOpenDeleteModal([selectedAsset])}
              className="w-full py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Delete Asset Record</span>
            </button>

            {/* Machine Specs Box */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="text-[#64748B] text-[10px] uppercase font-bold tracking-wider flex items-center justify-between">
                <span>Verified Engineering Specs</span>
                <span className="text-[#2563EB] text-[10px] font-mono">REV {selectedAsset.revision}</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">OEM:</span>
                  <span className="text-[#1A202C] font-medium">{selectedAsset.manufacturer || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Model:</span>
                  <span className="text-[#1A202C] font-medium">{selectedAsset.modelNumber || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Serial No:</span>
                  <span className="text-[#1A202C] font-medium">{selectedAsset.serialNumber || 'Unassigned'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Location:</span>
                  <span className="text-[#1A202C] font-medium">
                    {selectedAsset.building || 'Unit'} • {selectedAsset.productionLine || 'Line'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Criticality:</span>
                  <span className="text-[#1A202C] font-medium">{selectedAsset.criticality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Readiness:</span>
                  <span className="text-[#1A202C] font-medium">{selectedAsset.documentationReadiness}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Operational State:</span>
                  <span className="text-[#1A202C] font-medium">{selectedAsset.operationalState}</span>
                </div>
                {selectedAsset.installationDate && (
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Installed:</span>
                    <span className="text-[#1A202C] font-medium">{selectedAsset.installationDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Technical Specifications JSON envelope */}
            {selectedAsset.technicalSpecs && Object.keys(selectedAsset.technicalSpecs).length > 0 && (
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <span className="text-[#64748B] text-[10px] uppercase font-bold tracking-wider block">
                  Promoted Technical Parameters
                </span>
                <div className="space-y-1 text-[11px]">
                  {Object.entries(selectedAsset.technicalSpecs).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 border-b border-[#E2E8F0]">
                      <span className="text-[#64748B] capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                      <span className="text-[#2563EB] font-mono font-semibold">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Real 3D Viewer Modal */}
      <RealThreeDViewerModal
        isOpen={isThreeDOpen}
        onClose={() => setIsThreeDOpen(false)}
        machine={selectedMachine}
        mappings={mappings}
        onOpenPid={(tag: string) => {
          setIsThreeDOpen(false);
          handleOpenPid(selectedMachine!, tag);
        }}
        onMachineUpdated={handleMachineUpdated}
      />

      {/* P&ID Schematic Viewer Modal */}
      <PidEngineeringViewerModal
        isOpen={isPidOpen}
        onClose={() => setIsPidOpen(false)}
        machine={selectedMachine}
        mappings={mappings}
        activeTag={pidInitialTag}
        onOpen3dComponent={(_comp: string) => {
          setIsPidOpen(false);
          handleOpen3D(selectedMachine!);
        }}
        onMachineUpdated={handleMachineUpdated}
      />

      {/* Machine QR Poster Modal */}
      <MachinePosterModal
        isOpen={isPosterOpen}
        onClose={() => setIsPosterOpen(false)}
        machine={selectedMachine}
      />

      {/* Register Machine Modal */}
      <RegisterMachineModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onMachineCreated={fetchLedger}
        token={token}
        organizationId={organization?.id}
      />

      {/* Public OEM Lookup Modal */}
      <PublicLookupModal
        isOpen={isPublicLookupOpen}
        onClose={() => setIsPublicLookupOpen(false)}
        machineId={selectedMachine?.id}
        defaultManufacturer={selectedMachine?.manufacturer || 'Flowserve Corp'}
        defaultModel={selectedMachine?.modelNumber || 'Mark 3 ANSI'}
        token={token}
        organizationId={organization?.id}
        onKnowledgeApproved={fetchLedger}
      />

      {/* Task Management Modal */}
      <TaskManagementModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        machineId={selectedMachine?.id}
        machineTag={selectedMachine?.assetTag}
        token={token}
        organizationId={organization?.id}
        isOwnerOrAdmin={isOwnerOrAdmin}
        onTasksUpdated={fetchLedger}
      />

      {/* Delete Machine Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#E2E8F0] shadow-2xl overflow-hidden font-sans">
            <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1A202C] text-sm">
                    {machinesToDelete.length > 1
                      ? `Delete ${machinesToDelete.length} Machines`
                      : 'Confirm Machine Deletion'}
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Industrial Registry Decommissioning
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs text-[#1A202C]">
              <p className="text-[#64748B] leading-relaxed">
                Are you sure you want to delete the following machine record
                {machinesToDelete.length > 1 ? 's' : ''}? This action permanently de-registers the asset from plant inventory.
              </p>

              {/* Target machines preview */}
              <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] divide-y divide-[#E2E8F0]">
                {machinesToDelete.map((m) => (
                  <div key={m.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-[#2563EB] text-xs">
                        {m.assetTag}
                      </div>
                      <div className="text-[11px] text-[#64748B] truncate">
                        {m.name}
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-[#64748B] shrink-0">
                      {m.building ? `${m.building} • ` : ''}{m.productionLine || m.area}
                    </div>
                  </div>
                ))}
              </div>

              {/* Warning box */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Deleting will remove all associated telemetry, documentation references, and update the total machines counter.
                </span>
              </div>

              {/* Error display if failed */}
              {deleteError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {deleteError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setIsDeleteModalOpen(false);
                    setMachinesToDelete([]);
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-[#1A202C] border border-[#CBD5E1] rounded-lg font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {machinesToDelete.length > 1
                        ? `Delete ${machinesToDelete.length} Machines`
                        : 'Confirm Delete'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

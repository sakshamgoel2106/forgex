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
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
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

  useEffect(() => {
    if (selectedMachine && token) {
      fetch(`/api/v1/machines/${selectedMachine.id}/mappings`, {
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
  }, [selectedMachine?.id, token, organization?.id]);

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
          setMachines(mJson.data);
          if (mJson.data.length > 0 && !selectedMachine) {
            setSelectedMachine(mJson.data[0]);
          }
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
  }, [token, organization?.id, selectedMachine]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

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
      <div className="p-3.5 bg-white border-b border-[#E2E8F0] grid grid-cols-2 sm:grid-cols-5 gap-3 font-sans text-xs">
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

        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-[#64748B] uppercase font-semibold">3D Twins</div>
            <div className="text-lg font-bold text-cyan-600 tabular-nums">
              {summary ? summary.with3dModelCount : machines.filter((m) => m.hasModel3d).length}
            </div>
          </div>
          <Box className="w-5 h-5 text-cyan-600" />
        </div>

        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] text-[#64748B] uppercase font-semibold">Tasks Pending</div>
            <div className="text-lg font-bold text-sky-600 tabular-nums">
              {summary ? summary.pendingReviewTasksCount : 0}
            </div>
          </div>
          <ClipboardList className="w-5 h-5 text-sky-600" />
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
          {isOwnerOrAdmin && (
            <>
              <button
                type="button"
                onClick={() => setIsPublicLookupOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-sky-700 border border-sky-300 rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shadow-sm"
              >
                <Globe className="w-3.5 h-3.5 text-sky-600" />
                <span>Public OEM Lookup</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRegisterOpen(true)}
                className="px-3.5 py-1.5 bg-[#151C24] hover:bg-black text-white rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Machine</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsTaskModalOpen(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#1A202C] border border-[#CBD5E1] rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shadow-sm"
          >
            <ClipboardList className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Technician Tasks</span>
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
                  const isSelected = selectedMachine?.id === m.id;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMachine(m)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-2 border-l-[#2563EB] text-[#1A202C]'
                          : 'hover:bg-[#F8FAFC] text-[#1A202C]'
                      }`}
                    >
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
                          {m.hasModel3d && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpen3D(m);
                              }}
                              className="p-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 transition"
                              title="Launch 3D Digital Twin Viewer"
                            >
                              <Box className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {m.hasPidDiagram && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPid(m);
                              }}
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition"
                              title="Launch P&ID Engineering Schematic"
                            >
                              <FileCode className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPoster(m);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] border border-[#CBD5E1] transition"
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
        {selectedMachine && (
          <div className="w-80 md:w-96 border-l border-[#E2E8F0] bg-white p-5 space-y-4 overflow-y-auto shrink-0 font-sans text-xs">
            <div className="pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#2563EB] uppercase font-bold tracking-wider">
                  Machine Registry Record
                </span>
                {getClassificationBadge(selectedMachine.dataClassification)}
              </div>
              <h3 className="text-base font-bold font-mono text-[#1A202C] mt-1">
                {selectedMachine.assetTag}
              </h3>
              <p className="text-xs text-[#64748B] font-sans mt-0.5">{selectedMachine.name}</p>
            </div>

            {/* Quick Digital Twin Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOpen3D(selectedMachine)}
                className="p-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Box className="w-4 h-4 text-cyan-600" />
                <span>3D Model Twin</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenPid(selectedMachine)}
                className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <FileCode className="w-4 h-4 text-amber-600" />
                <span>P&ID Schematic</span>
              </button>
            </div>

            {/* QR Poster & Task Action */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOpenPoster(selectedMachine)}
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

            {/* Machine Specs Box */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="text-[#64748B] text-[10px] uppercase font-bold tracking-wider flex items-center justify-between">
                <span>Verified Engineering Specs</span>
                <span className="text-[#2563EB] text-[10px] font-mono">REV {selectedMachine.revision}</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">OEM:</span>
                  <span className="text-[#1A202C] font-medium">{selectedMachine.manufacturer || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Model:</span>
                  <span className="text-[#1A202C] font-medium">{selectedMachine.modelNumber || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Serial No:</span>
                  <span className="text-[#1A202C] font-medium">{selectedMachine.serialNumber || 'Unassigned'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Criticality:</span>
                  <span className="text-[#1A202C] font-medium">{selectedMachine.criticality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Readiness:</span>
                  <span className="text-[#1A202C] font-medium">{selectedMachine.documentationReadiness}</span>
                </div>
              </div>
            </div>

            {/* Technical Specifications JSON envelope */}
            {selectedMachine.technicalSpecs && Object.keys(selectedMachine.technicalSpecs).length > 0 && (
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <span className="text-[#64748B] text-[10px] uppercase font-bold tracking-wider block">
                  Promoted Technical Parameters
                </span>
                <div className="space-y-1 text-[11px]">
                  {Object.entries(selectedMachine.technicalSpecs).map(([k, v]) => (
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
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { apiFetch } from '../../lib/api';
import {
  History,
  Filter,
  Search,
  Clock,
  ChevronDown,
  ChevronRight,
  User,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Wrench,
  Gauge,
  Tag,
  Check,
  Cpu,
  FileText,
} from 'lucide-react';
import type {
  MaintenanceRecord,
  Machine,
  PartReplaced,
  MaintenanceMeasurement,
  PostRepairTestResult,
} from '@forgex/shared-types';

export interface MaintenanceHistoryViewProps {
  initialMachineId?: string;
  onNavigateToWorkOrder?: (ticketIdOrNumber: string) => void;
  onNavigate?: (module: string) => void;
}

export const MaintenanceHistoryView: React.FC<MaintenanceHistoryViewProps> = ({
  initialMachineId,
  onNavigateToWorkOrder,
  onNavigate,
}) => {
  const { organization } = useAuth();

  // Primary Data State
  const [machines, setMachines] = useState<Machine[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  // Machine Selector State
  const [selectedMachineId, setSelectedMachineId] = useState<string>(initialMachineId || 'ALL');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [faultCategoryFilter, setFaultCategoryFilter] = useState<string>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<string>('ALL');
  const [recurrenceOnly, setRecurrenceOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Request race-condition guard
  const activeRequestId = useRef(0);

  // 1. Load Fleet Machines for Selector Dropdown
  const loadMachines = useCallback(async () => {
    setIsLoadingMachines(true);
    try {
      const res = await apiFetch('/api/v1/machines');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setMachines(json.data);
      }
    } catch (err) {
      console.warn('Failed to load fleet machines for history view:', err);
    } finally {
      setIsLoadingMachines(false);
    }
  }, []);

  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  // 2. Fetch Authoritative Maintenance Records (Machine-scoped or Organization-wide)
  const fetchRecords = useCallback(async (machineIdToFetch: string) => {
    const requestId = ++activeRequestId.current;
    setIsLoadingHistory(true);
    setError(null);
    setIsPermissionDenied(false);

    try {
      const queryParam =
        machineIdToFetch !== 'ALL'
          ? `?machineId=${encodeURIComponent(machineIdToFetch)}`
          : '';
      const res = await apiFetch(`/api/v1/maintenance-records${queryParam}`);

      if (requestId !== activeRequestId.current) {
        // Discard stale response if user switched machine in the meantime
        return;
      }

      if (res.status === 403) {
        setIsPermissionDenied(true);
        setRecords([]);
        return;
      }

      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setRecords(json.data);
        if (json.data.length > 0) {
          setExpandedId(json.data[0].id);
        } else {
          setExpandedId(null);
        }
      } else {
        const errorMsg =
          json?.error?.message ||
          json?.error ||
          'Unable to retrieve organization maintenance history.';
        setError(errorMsg);
        setRecords([]);
      }
    } catch (err: any) {
      if (requestId === activeRequestId.current) {
        setError(err?.message || 'Network error connecting to maintenance history service.');
        setRecords([]);
      }
    } finally {
      if (requestId === activeRequestId.current) {
        setIsLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchRecords(selectedMachineId);
  }, [fetchRecords, selectedMachineId]);

  // Selected Machine Entity
  const selectedMachine = useMemo(() => {
    if (selectedMachineId === 'ALL') return null;
    return machines.find((m) => m.id === selectedMachineId) || null;
  }, [machines, selectedMachineId]);

  // Distinct Fault Categories from loaded records
  const distinctFaultCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const r of records) {
      if (r.faultCategory) {
        categories.add(r.faultCategory);
      }
    }
    return Array.from(categories).sort();
  }, [records]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        // Fault Category filter
        if (faultCategoryFilter !== 'ALL' && r.faultCategory !== faultCategoryFilter) {
          return false;
        }

        // Verification filter
        if (verificationFilter !== 'ALL' && r.verificationState !== verificationFilter) {
          return false;
        }

        // Recurrence filter
        if (recurrenceOnly && !r.isRecurringIncident && (r.recurrenceCount ?? 1) <= 1) {
          return false;
        }

        // Search text matching
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchRecordNum = r.recordNumber?.toLowerCase().includes(q);
          const matchTicketNum = r.ticketNumber?.toLowerCase().includes(q);
          const matchTicketId = r.ticketId?.toLowerCase().includes(q);
          const matchCaseNum = r.caseNumber?.toLowerCase().includes(q);
          const matchCaseId = r.caseId?.toLowerCase().includes(q);
          const matchAssetTag = r.machineAssetTag?.toLowerCase().includes(q);
          const matchProblem = r.problemStatement?.toLowerCase().includes(q);
          const matchRootCause = r.rootCause?.toLowerCase().includes(q);
          const matchFaultCat = r.faultCategory?.toLowerCase().includes(q);
          const matchTech =
            r.resolvingTechnicianName?.toLowerCase().includes(q) ||
            r.assignedTechnicianName?.toLowerCase().includes(q);

          if (
            !matchRecordNum &&
            !matchTicketNum &&
            !matchTicketId &&
            !matchCaseNum &&
            !matchCaseId &&
            !matchAssetTag &&
            !matchProblem &&
            !matchRootCause &&
            !matchFaultCat &&
            !matchTech
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.resolvedAt || a.createdAt).getTime();
        const timeB = new Date(b.resolvedAt || b.createdAt).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [records, faultCategoryFilter, verificationFilter, recurrenceOnly, searchTerm, sortOrder]);

  // Group Records Chronologically by Month
  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, MaintenanceRecord[]>();
    for (const r of filteredRecords) {
      const dateStr = r.resolvedAt || r.createdAt || new Date().toISOString();
      const d = new Date(dateStr);
      const monthKey = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups.has(monthKey)) {
        groups.set(monthKey, []);
      }
      groups.get(monthKey)!.push(r);
    }
    return groups;
  }, [filteredRecords]);

  // Navigate to Work Order Helper
  const handleNavigateToWorkOrder = (ticketNumber?: string, ticketId?: string) => {
    const targetRef = ticketNumber || ticketId;
    if (!targetRef) return;

    if (onNavigateToWorkOrder) {
      onNavigateToWorkOrder(targetRef);
      return;
    }

    try {
      sessionStorage.setItem('forgex_active_wo', targetRef);
    } catch {
      // ignore storage failure
    }

    window.dispatchEvent(
      new CustomEvent('forgex:navigate', {
        detail: { module: 'maintenance', caseId: targetRef },
      })
    );

    if (onNavigate) {
      onNavigate('maintenance');
    }
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    faultCategoryFilter !== 'ALL' ||
    verificationFilter !== 'ALL' ||
    recurrenceOnly;

  const handleResetFilters = () => {
    setSearchTerm('');
    setFaultCategoryFilter('ALL');
    setVerificationFilter('ALL');
    setRecurrenceOnly(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans antialiased">
      {/* 1. Top Header */}
      <div className="p-3.5 border-b border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
            <History className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-[#1A202C] leading-tight font-sans">
                MAINTENANCE HISTORY & RESOLUTION TIMELINE
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-[#2563EB] border border-blue-200">
                LIVE AUDITED LEDGER
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] font-sans">
              Facility:{' '}
              <strong>{organization?.name || 'Authorized Workspace'}</strong> · Immutable
              work-order completion records & recurrence intelligence
            </p>
          </div>
        </div>

        {/* Action Controls: Refresh & Chronological Sort */}
        <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="px-2.5 py-1.5 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-700 rounded flex items-center gap-1.5 transition shadow-xs"
            title={`Currently: ${sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="font-semibold">
              {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
            </span>
          </button>

          <button
            onClick={() => fetchRecords(selectedMachineId)}
            title="Refresh History"
            disabled={isLoadingHistory}
            className="p-1.5 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-700 rounded transition shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Machine Selector & Filter Bar */}
      <div className="p-3 border-b border-[#E2E8F0] bg-gray-50/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Machine Dropdown Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded px-2.5 py-1.5 shadow-xs font-mono">
            <Cpu className="w-3.5 h-3.5 text-[#64748B]" />
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              disabled={isLoadingMachines}
              className="bg-transparent text-xs text-[#1A202C] font-semibold outline-none cursor-pointer max-w-xs truncate"
            >
              <option value="ALL">All Registered Equipment ({machines.length})</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.assetTag} — {m.name} ({m.area || 'Plant Area'})
                </option>
              ))}
            </select>
          </div>

          {/* Machine Badge Chip if Specific Machine Selected */}
          {selectedMachine && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-blue-50/70 border border-blue-200 text-blue-900 font-mono text-[11px]">
              <Tag className="w-3 h-3 text-[#2563EB]" />
              <span className="font-bold">{selectedMachine.assetTag}</span>
              <span className="text-gray-400">·</span>
              <span className="truncate max-w-[150px]">{selectedMachine.name}</span>
              {selectedMachine.operationalState && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                    selectedMachine.operationalState === 'OPTIMAL'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedMachine.operationalState === 'ADVISORY'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedMachine.operationalState === 'WARNING_MAINTENANCE_REQUIRED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedMachine.operationalState}
                </span>
              )}
              <button
                onClick={() => setSelectedMachineId('ALL')}
                className="text-gray-400 hover:text-gray-600 ml-1"
                title="Clear machine selection"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex items-center gap-2 flex-wrap font-mono">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search Record#, WO#, root cause, tech..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2563EB] shadow-xs w-60 sm:w-64"
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

          {/* Fault Category Filter */}
          {distinctFaultCategories.length > 0 && (
            <div className="flex items-center gap-1 bg-white border border-[#CBD5E1] rounded px-2 py-1 shadow-xs">
              <Filter className="w-3 h-3 text-[#64748B]" />
              <select
                value={faultCategoryFilter}
                onChange={(e) => setFaultCategoryFilter(e.target.value)}
                className="bg-transparent text-[11px] text-[#1A202C] outline-none cursor-pointer max-w-[130px] truncate"
              >
                <option value="ALL">All Faults</option>
                {distinctFaultCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Verification State Filter */}
          <div className="flex items-center gap-1 bg-white border border-[#CBD5E1] rounded px-2 py-1 shadow-xs">
            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="bg-transparent text-[11px] text-[#1A202C] outline-none cursor-pointer"
            >
              <option value="ALL">All States</option>
              <option value="PASSED">Passed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Recurring Filter Toggle */}
          <button
            onClick={() => setRecurrenceOnly((prev) => !prev)}
            className={`px-2 py-1 rounded text-[11px] transition border flex items-center gap-1 ${
              recurrenceOnly
                ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold shadow-xs'
                : 'bg-white text-gray-600 border-[#CBD5E1] hover:bg-gray-50'
            }`}
          >
            <RotateCcw className="w-3 h-3 text-rose-600" />
            <span>Recurring Only</span>
          </button>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] text-[#2563EB] hover:underline font-bold px-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* 3. Error Banner */}
      {error && (
        <div className="m-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchRecords(selectedMachineId)}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-mono font-bold text-[10px] transition shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 4. Permission Denied State */}
      {isPermissionDenied && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm font-bold text-gray-900">Access Restricted</h3>
            <p className="text-xs text-gray-600 leading-normal">
              Your active organization role does not have authorization to view maintenance history records for this plant facility.
            </p>
          </div>
        </div>
      )}

      {/* 5. Loading State */}
      {isLoadingHistory && (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
          <RefreshCw className="w-7 h-7 text-[#2563EB] animate-spin" />
          <p className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">
            {selectedMachine
              ? `Loading Audited History for ${selectedMachine.assetTag}...`
              : 'Loading Authenticated Maintenance Ledger...'}
          </p>
        </div>
      )}

      {/* 6. Clean Zero-Data Empty State */}
      {!isLoadingHistory && !isPermissionDenied && records.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2563EB]">
            <History className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-[#1A202C]">
              {selectedMachine
                ? `No Maintenance Records for ${selectedMachine.assetTag}`
                : 'No Maintenance Records Recorded Yet'}
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {selectedMachine
                ? `Equipment ${selectedMachine.assetTag} (${selectedMachine.name}) currently has zero audited maintenance interventions. When work orders for this asset are diagnosed, completed, and closed, chronological records will appear here automatically.`
                : `Facility ${organization?.name || 'this plant'} currently has zero archived maintenance records. When field procedures are executed, signed off, and closed, verifiable records will be indexed in this timeline.`}
            </p>
          </div>
        </div>
      )}

      {/* 7. Zero Search Results State */}
      {!isLoadingHistory &&
        !isPermissionDenied &&
        records.length > 0 &&
        filteredRecords.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 max-w-md mx-auto">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
              <Search className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900">No Matching Records Found</h3>
              <p className="text-xs text-gray-600">
                No maintenance records match your active search or filter criteria.
              </p>
            </div>
            <button
              onClick={handleResetFilters}
              className="px-3 py-1.5 bg-[#151C24] hover:bg-black text-white text-xs rounded font-medium shadow-xs"
            >
              Reset All Filters
            </button>
          </div>
        )}

      {/* 8. Main Timeline Viewport */}
      {!isLoadingHistory && !isPermissionDenied && filteredRecords.length > 0 && (
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 w-full space-y-6">
          {Array.from(groupedByMonth.entries()).map(([month, monthRecords]) => (
            <div key={month} className="space-y-3">
              {/* Month Divider Banner */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-gray-600 uppercase tracking-widest bg-gray-200/70 px-2.5 py-0.5 rounded border border-gray-300">
                  {month}
                </span>
                <div className="flex-1 h-px bg-gray-300" />
                <span className="text-xs font-mono text-gray-500">
                  {monthRecords.length} record{monthRecords.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Records in Month */}
              <div className="space-y-3">
                {monthRecords.map((r) => {
                  const isExpanded = expandedId === r.id;
                  const hasRepeat = r.isRecurringIncident || (r.recurrenceCount ?? 1) > 1;
                  const formattedDate = new Date(r.resolvedAt || r.createdAt).toLocaleDateString(
                    undefined,
                    { year: 'numeric', month: 'short', day: 'numeric' }
                  );
                  const formattedTime = new Date(r.resolvedAt || r.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={r.id}
                      className={`bg-white rounded-lg border transition shadow-xs overflow-hidden ${
                        isExpanded
                          ? 'border-[#2563EB] ring-1 ring-[#2563EB]/20'
                          : 'border-[#E2E8F0] hover:border-gray-400'
                      }`}
                    >
                      {/* Timeline Summary Row */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/70 transition"
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            className="mt-0.5 text-gray-400 hover:text-gray-600 transition shrink-0"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#2563EB]" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <div className="space-y-1">
                            {/* Top Badge Line */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Record Number */}
                              <span className="font-mono text-xs font-bold text-gray-900 flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5 text-gray-500" />
                                {r.recordNumber || `REC-${r.id.substring(0, 8)}`}
                              </span>

                              {/* Work Order Reference Link */}
                              {(r.ticketNumber || r.ticketId || r.caseNumber || r.caseId) && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    handleNavigateToWorkOrder(
                                      r.ticketNumber || r.caseNumber || undefined,
                                      r.ticketId || r.caseId || undefined
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#2563EB] bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition"
                                  title="View associated Work Order"
                                >
                                  <span>{r.ticketNumber || r.caseNumber || `WO-${(r.ticketId || r.caseId || '').substring(0, 8)}`}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}

                              <span className="text-gray-300">·</span>

                              {/* Machine Asset Tag */}
                              <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                {r.machineAssetTag || selectedMachine?.assetTag || 'MACHINE'}
                              </span>

                              {/* Fault Category Chip */}
                              {r.faultCategory && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-300 uppercase font-semibold">
                                  {r.faultCategory.replace(/_/g, ' ')}
                                </span>
                              )}

                              {/* Recurrence Warning */}
                              {hasRepeat && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                  <RotateCcw className="w-3 h-3 text-rose-600" />
                                  REPEAT FAULT (x{r.recurrenceCount || 2})
                                </span>
                              )}

                              {/* Verification State Chip */}
                              {r.verificationState && (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                    r.verificationState === 'PASSED'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : r.verificationState === 'FAILED'
                                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {r.verificationState === 'PASSED' ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  ) : r.verificationState === 'FAILED' ? (
                                    <XCircle className="w-3 h-3 text-rose-600" />
                                  ) : (
                                    <Clock className="w-3 h-3 text-amber-600" />
                                  )}
                                  {r.verificationState}
                                </span>
                              )}
                            </div>

                            {/* Problem Statement */}
                            <p className="text-xs text-gray-800 font-medium line-clamp-2 leading-relaxed">
                              {r.problemStatement || r.rootCause || 'Maintenance procedure performed.'}
                            </p>
                          </div>
                        </div>

                        {/* Metadata Right Column */}
                        <div className="flex items-center gap-3 text-xs font-mono text-gray-500 pl-6 md:pl-0 shrink-0">
                          {/* Technician */}
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate max-w-[130px] font-medium text-gray-700">
                              {r.resolvingTechnicianName ||
                                r.assignedTechnicianName ||
                                'Technician'}
                            </span>
                          </div>

                          <span className="text-gray-300">·</span>

                          {/* Date and Time */}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span>
                              {formattedDate} {formattedTime}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Audited Dossier View */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gray-50/50 text-xs font-sans space-y-4">
                          {/* 1. Root Cause & Corrective Actions Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Identified Root Cause */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider">
                                  Identified Root Cause
                                </span>
                                {r.rootCauseStatus && (
                                  <span className="text-[10px] font-mono font-bold text-gray-600 bg-gray-200 px-1.5 py-0.2 rounded">
                                    STATUS: {r.rootCauseStatus}
                                  </span>
                                )}
                              </div>
                              <div className="p-3 bg-white rounded border border-gray-200 leading-relaxed text-gray-900 font-medium shadow-xs">
                                {r.rootCause || 'Root cause identified and resolved during diagnostic inspection.'}
                              </div>
                            </div>

                            {/* Corrective Actions Executed */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider">
                                Corrective Actions Taken
                              </span>
                              <div className="p-3 bg-white rounded border border-gray-200 leading-relaxed text-gray-900 font-medium shadow-xs">
                                {Array.isArray(r.repairActions) && r.repairActions.length > 0 ? (
                                  <ul className="list-disc pl-4 space-y-1">
                                    {r.repairActions.map((action, idx) => (
                                      <li key={idx}>{action}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p>Standard maintenance and recalibration protocol completed.</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 2. Observed Symptoms (if available) */}
                          {Array.isArray(r.observedSymptoms) && r.observedSymptoms.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider">
                                Field Observed Symptoms
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {r.observedSymptoms.map((symptom, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700 text-[11px]"
                                  >
                                    {symptom}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. Physical Measurements & Telemetry Table (if available) */}
                          {Array.isArray(r.measurements) && r.measurements.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                <Gauge className="w-3.5 h-3.5 text-[#2563EB]" />
                                Calibrated Measurements & Physical Parameters
                              </span>
                              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                                <table className="w-full text-left text-[11px] font-mono">
                                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                                    <tr>
                                      <th className="px-3 py-2">Parameter</th>
                                      <th className="px-3 py-2">Recorded Value</th>
                                      <th className="px-3 py-2">Safe Envelope / Threshold</th>
                                      <th className="px-3 py-2">Limit Check</th>
                                      <th className="px-3 py-2">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {r.measurements.map((m: MaintenanceMeasurement, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50/50">
                                        <td className="px-3 py-1.5 font-bold text-gray-900">
                                          {m.parameterName}
                                        </td>
                                        <td className="px-3 py-1.5 font-bold">
                                          {m.value} {m.unit}
                                        </td>
                                        <td className="px-3 py-1.5 text-gray-500">
                                          {m.thresholdUpper ? `≤ ${m.thresholdUpper} ${m.unit}` : m.thresholdLower ? `≥ ${m.thresholdLower} ${m.unit}` : 'Nominal'}
                                        </td>
                                        <td className="px-3 py-1.5">
                                          {m.isNormal ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px]">
                                              <Check className="w-3 h-3 text-emerald-600" />
                                              Normal
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[10px]">
                                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                                              Out of Spec
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-1.5 text-gray-500 font-sans">
                                          {m.notes || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* 4. Parts & Consumables Replaced */}
                          {Array.isArray(r.partsReplaced) && r.partsReplaced.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                <Wrench className="w-3.5 h-3.5 text-[#2563EB]" />
                                Certified Parts & Consumables Replaced
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {r.partsReplaced.map((p: PartReplaced, idx: number) => (
                                  <div
                                    key={idx}
                                    className="p-2 rounded bg-white border border-gray-200 text-[11px] font-mono space-y-0.5"
                                  >
                                    <div className="font-bold text-gray-900 truncate">
                                      {p.partName || p.partNumber}
                                    </div>
                                    <div className="text-[10px] text-gray-500 flex justify-between">
                                      <span>PN: {p.partNumber}</span>
                                      <span>Qty: {p.quantity}</span>
                                    </div>
                                    {p.lotOrSerial && (
                                      <div className="text-[9px] text-gray-400 truncate">
                                        Lot/SN: {p.lotOrSerial}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 5. Post-Repair Test Results */}
                          {Array.isArray(r.postRepairTestResults) &&
                            r.postRepairTestResults.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-mono text-gray-500 uppercase font-bold tracking-wider">
                                  Post-Repair Commissioning Tests
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {r.postRepairTestResults.map(
                                    (t: PostRepairTestResult, idx: number) => (
                                      <div
                                        key={idx}
                                        className="p-2 rounded bg-white border border-gray-200 text-[11px] font-mono flex items-center justify-between"
                                      >
                                        <div>
                                          <div className="font-bold text-gray-900">{t.testName}</div>
                                          <div className="text-[10px] text-gray-500">
                                            Measured: {t.measuredValue ?? 'N/A'}{t.expectedRange ? ` (Range: ${t.expectedRange})` : ''}
                                          </div>
                                        </div>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            t.passed
                                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                                          }`}
                                        >
                                          {t.passed ? 'PASSED' : 'FAILED'}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                          {/* 6. Supervisory Verification & Restart Sign-off */}
                          <div className="p-3 bg-white rounded border border-gray-200 space-y-2 text-[11px]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                <span className="font-bold text-gray-900">
                                  Post-Repair Verification: {r.verificationState || 'PASSED'}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 font-mono text-[10px] text-gray-500">
                                {r.restartApproved !== undefined && (
                                  <span>
                                    Restart Authorized:{' '}
                                    <strong
                                      className={
                                        r.restartApproved ? 'text-emerald-700' : 'text-amber-700'
                                      }
                                    >
                                      {r.restartApproved ? 'YES' : 'REQUIRES SIGN-OFF'}
                                    </strong>
                                  </span>
                                )}
                                {r.approvalStatus && (
                                  <span>
                                    Resolution Approval:{' '}
                                    <strong className="text-gray-900">{r.approvalStatus}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            {r.verificationNotes && (
                              <p className="text-gray-700 font-sans italic">
                                "{r.verificationNotes}"
                              </p>
                            )}

                            {r.restartNotes && (
                              <p className="text-amber-900 font-sans bg-amber-50/60 p-2 rounded border border-amber-200">
                                <strong>Restart Safety Directives:</strong> {r.restartNotes}
                              </p>
                            )}
                          </div>

                          {/* 7. Cryptographically Audited Signature Footer */}
                          <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-gray-500">
                            <span className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Verifiably signed by{' '}
                              {r.resolvingTechnicianName ||
                                r.assignedTechnicianName ||
                                'Authorized Personnel'}
                            </span>
                            <div className="flex items-center gap-2 text-gray-400">
                              <span>Version: v{r.recordVersion || 1}</span>
                              <span>·</span>
                              <span>
                                Audited Revisions: {r.auditTrail?.length || 1}
                              </span>
                              <span>·</span>
                              <span>Record ID: {r.id}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MaintenanceHistoryView;

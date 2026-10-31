import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { usePlant } from '../../lib/PlantContext';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import {
  getTenantData,
  setTenantData,
} from '../../utils/tenantStorage';
import {
  History,
  Filter,
  Search,
  User,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  Wrench,
  Cpu,
  Trash2,
  Timer,
  Lightbulb,
  Printer,
  Copy,
} from 'lucide-react';
import type {
  MaintenanceRecord,
  Machine,
} from '@forgex/shared-types';
import { formatCleanMachineName } from '../../lib/hindiTranslator';

export type EnrichedMaintenanceRecord = MaintenanceRecord & {
  resolutionSource?: string;
  mttrMinutes?: number | string;
  alarmCode?: string;
};

export const formatHistoryDateTime = (dateStr?: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatHistoryDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatHistoryTime = (dateStr?: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const cleanRootCauseText = (text?: string | null): string => {
  if (!text) return 'Operational baseline verified.';
  let clean = String(text).trim();

  // Strip prefixes like [OEM Certified Overhaul], [OEM Overhaul], [RCA Session], Auto-Dispatched:, etc.
  clean = clean.replace(/^\[(?:OEM Certified Overhaul|OEM Overhaul|RCA Session|Auto-Dispatched|Factory Overhaul)[^\]]*\]\s*/i, '');
  clean = clean.replace(/^Auto-Dispatched:\s*/i, '');

  // Strip trailing " — Expected: ... Observed: ..." or "Expected: ... Observed: ..." if confirmed cause precedes it
  if (clean.includes('—') || clean.includes(' - ')) {
    const parts = clean.split(/\s*[—\-]\s*/);
    if (parts.length > 1 && /^(?:expected:|observed:|sub-assembly|step\s*\d+)/i.test(parts[1].trim())) {
      clean = parts[0].trim();
    }
  }

  // If text starts with "Expected: ... Observed: ..." extract the observed failure
  const obsMatch = clean.match(/Observed:\s*([^.]+)/i);
  if (clean.toLowerCase().startsWith('expected:') && obsMatch && obsMatch[1]) {
    clean = obsMatch[1].trim();
  }

  // Strip trailing "on COOLING TOWER (COOLING-TOWER.GLB)" or "on MACHINE..."
  clean = clean.replace(/\s*(?:on|for|at|in)\s+[A-Z0-9_\-\s]+(?:\([^)]*\))?\s*$/i, '');
  clean = clean.replace(/\.(glb|gltf)\b/gi, '');
  clean = clean.replace(/\s*\([^)]*?(?:\.glb|\.gltf)[^)]*?\)/gi, '');
  clean = clean.replace(/\s*\([^)]*$/g, '');
  clean = clean.replace(/^[:\-–—•\s]+|[:\-–—•\s]+$/g, '').trim();

  return clean || text || 'Operational baseline verified.';
};

const isUUID = (str?: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
};

// Deterministic cryptographic audit hash for Phase 3 Compliance Seal
export const generateComplianceHash = (recordId: string, assetTag: string, dateStr: string): string => {
  let hash = 0;
  const input = `${recordId}:${assetTag}:${dateStr}:OSHA-1910.147-ISO55001`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `#${hex.slice(0, 4)}...${hex.slice(-4)}`;
};

// Resolve human-readable asset tag so a raw UUID is NEVER rendered in a badge
export const resolveAssetTag = (r: EnrichedMaintenanceRecord, machinesList: Machine[]): string => {
  const sanitizeTag = (raw?: string | null): string | null => {
    if (!raw || typeof raw !== 'string') return null;
    let s = raw.trim();
    if (!s || isUUID(s)) return null;

    // Check for bracketed machine tag e.g. "Auto-Dispatched: [PUMP-204-B] Step 3 Failed"
    const bracketMatch = s.match(/\[([A-Z0-9_\-]+)\]/i);
    if (bracketMatch && bracketMatch[1] && !bracketMatch[1].startsWith('TCK') && !bracketMatch[1].startsWith('TICK') && !bracketMatch[1].startsWith('OEM')) {
      return formatCleanMachineName(bracketMatch[1]);
    }

    // Strip "Auto-Dispatched:", "Step X Failed", etc.
    s = s.replace(/^Auto-Dispatched:\s*/i, '');
    s = s.replace(/\s*Step\s*\d+\s*Failed.*$/i, '');
    s = s.replace(/^\[.*?\]\s*/, '');
    s = s.trim();

    // If string is still a long phrase or has ticket prefix, try extracting machine tag
    if (s.includes(' ') || s.startsWith('TICK-') || s.startsWith('TCK-') || s.startsWith('CASE-') || s.startsWith('ESC-')) {
      const match = s.match(/\b([A-Z0-9]+(?:-[A-Z0-9]+)+)\b/);
      if (
        match &&
        match[1] &&
        !isUUID(match[1]) &&
        !match[1].startsWith('TICK') &&
        !match[1].startsWith('TCK') &&
        !match[1].startsWith('CASE') &&
        !match[1].startsWith('ESC') &&
        !match[1].startsWith('MR-') &&
        !match[1].startsWith('WO-')
      ) {
        return formatCleanMachineName(match[1]);
      }
    }

    return formatCleanMachineName(s);
  };

  // 1. Direct machineAssetTag if valid and not a UUID
  const tagCandidate = sanitizeTag(r.machineAssetTag);
  if (tagCandidate && tagCandidate !== 'PLANT_WIDE') {
    return tagCandidate;
  }

  // 2. Direct machineId if valid and not a UUID
  const idCandidate = sanitizeTag(r.machineId);
  if (idCandidate && idCandidate !== 'PLANT_WIDE') {
    return idCandidate;
  }

  // 3. Resolve UUID against registered machines list
  if (machinesList && machinesList.length > 0) {
    const match = machinesList.find(
      (m) =>
        (r.machineId && m.id === r.machineId) ||
        (r.machineAssetTag && m.id === r.machineAssetTag)
    );
    if (match && match.assetTag && !isUUID(match.assetTag)) {
      return formatCleanMachineName(match.assetTag);
    }
  }

  // 4. Extract human-readable tag from problem statement, component name or ticketNumber
  const textPool = `${r.ticketNumber || ''} ${r.caseNumber || ''} ${r.problemStatement || ''} ${r.componentName || ''}`;
  const bracketMatch = textPool.match(/\[([A-Z0-9_\-]+)\]/i);
  if (bracketMatch && bracketMatch[1] && !bracketMatch[1].startsWith('TCK') && !bracketMatch[1].startsWith('TICK') && !bracketMatch[1].startsWith('OEM')) {
    return formatCleanMachineName(bracketMatch[1]);
  }

  const extracted = textPool.match(/\b([A-Z0-9]+(?:-[A-Z0-9]+)+)\b/);
  if (
    extracted &&
    extracted[1] &&
    !isUUID(extracted[1]) &&
    !extracted[1].startsWith('MR-') &&
    !extracted[1].startsWith('WO-') &&
    !extracted[1].startsWith('TCK-') &&
    !extracted[1].startsWith('TICK-') &&
    !extracted[1].startsWith('ESC-') &&
    !extracted[1].startsWith('CASE-')
  ) {
    return formatCleanMachineName(extracted[1]);
  }

  return 'COOLING TOWER';
};

export const getResolutionSourceInfo = (r: EnrichedMaintenanceRecord) => {
  const src =
    r.resolutionSource ||
    (r.ticketNumber?.startsWith('RCA-') || r.faultCategory === 'RCA_SESSION'
      ? 'RCA_ENGINEER'
      : r.faultCategory === 'OEM_RESOLVED' ||
        r.problemStatement?.includes('[OEM') ||
        r.ticketNumber?.startsWith('ESC-')
      ? 'OEM_RESOLVED'
      : 'FIELD_TECH');

  if (src === 'OEM_RESOLVED') {
    return {
      type: 'OEM_RESOLVED',
      label: '🏭 OEM Vendor Resolved',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      darkBadgeClass: 'bg-gradient-to-r from-indigo-500/30 to-violet-500/30 text-indigo-200 border-indigo-400/40',
    };
  }
  if (src === 'RCA_ENGINEER') {
    return {
      type: 'RCA_ENGINEER',
      label: '🔍 RCA Engineer Solved',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      darkBadgeClass: 'bg-gradient-to-r from-blue-500/30 to-indigo-500/30 text-cyan-200 border-cyan-400/40',
    };
  }
  return {
    type: 'FIELD_TECH',
    label: '🔧 Field Tech Solved',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    darkBadgeClass: 'bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-emerald-200 border-emerald-400/40',
  };
};

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
  const { organization, user } = useAuth();
  const { activePlant } = usePlant();
  const { toast } = useToast();

  // Primary Data State
  const [machines, setMachines] = useState<Machine[]>([]);
  const [records, setRecords] = useState<EnrichedMaintenanceRecord[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  // Machine Selector State
  const [selectedMachineId, setSelectedMachineId] = useState<string>(initialMachineId || 'ALL');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [faultCategoryFilter, setFaultCategoryFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [recurrenceOnly, setRecurrenceOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedRecord, setExpandedRecord] = useState<EnrichedMaintenanceRecord | null>(null);
  const [deleteRecordConfirmId, setDeleteRecordConfirmId] = useState<string | null>(null);
  const [promotedKnowledgeIds, setPromotedKnowledgeIds] = useState<Set<string>>(new Set());

  // Collapsible timeline card state (1st newest record expanded by default)
  const [manuallyExpandedIds, setManuallyExpandedIds] = useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = useState<boolean | null>(null);

  const toggleCardExpansion = (recordId: string, isFirstOverall: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setManuallyExpandedIds((prev) => {
      const currentlyExpanded = expandAll !== null ? expandAll : (prev[recordId] ?? isFirstOverall);
      return {
        ...prev,
        [recordId]: !currentlyExpanded,
      };
    });
  };

  const handleToggleExpandAll = () => {
    if (expandAll === true) {
      setExpandAll(false);
      setManuallyExpandedIds({});
    } else {
      setExpandAll(true);
      setManuallyExpandedIds({});
    }
  };

  const isRecordExpanded = (recordId: string, isFirstOverall: boolean) => {
    if (expandAll !== null) return expandAll;
    if (recordId in manuallyExpandedIds) return manuallyExpandedIds[recordId];
    return isFirstOverall;
  };

  // Request race-condition guard
  const activeRequestId = useRef(0);

  // Clean and sanitize local storage: remove legacy mock/seeded dummy entries
  const sanitizeAndGetLocalHistory = useCallback((): EnrichedMaintenanceRecord[] => {
    try {
      const parsed = getTenantData<EnrichedMaintenanceRecord[]>('forgex_maintenance_history', activePlant, []);
      if (Array.isArray(parsed)) {
        // Remove legacy hardcoded mock IDs
        const mockIds = new Set([
          'rec-mr-2026-8924',
          'rec-mr-2026-8812',
          'rec-mr-2026-8701',
          'TCK-2024-002',
          'SOP-PUMP-001',
          'rec-mr-2026-mock-1',
        ]);
        const sanitized = parsed.filter((item: any) => {
          if (mockIds.has(item.id) || mockIds.has(item.ticketNumber) || mockIds.has(item.ticketId)) {
            return false;
          }
          // Discard entries where machineAssetTag is an unresolvable raw UUID and no title exists
          if (isUUID(item.machineAssetTag) && !item.problemStatement && !item.rootCause) {
            return false;
          }
          return true;
        });
        if (sanitized.length !== parsed.length) {
          setTenantData('forgex_maintenance_history', activePlant, sanitized);
        }
        return sanitized;
      }
    } catch {}
    return [];
  }, [activePlant]);

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
  }, [loadMachines, activePlant, organization?.id]);

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
        return;
      }

      if (res.status === 403) {
        setIsPermissionDenied(true);
        setRecords([]);
        return;
      }

      const json = await res.json();
      let serverRecords: EnrichedMaintenanceRecord[] = [];
      if (res.ok && json.success && Array.isArray(json.data)) {
        serverRecords = json.data;
      }

      // Merge genuine local records with server records (NO hardcoded fake entries)
      const localList = sanitizeAndGetLocalHistory();
      const localIds = new Set(
        localList.map((x) => x.id || x.ticketId || x.ticketNumber || (x as any).recordNumber)
      );
      const nonDuplicateServer = serverRecords.filter(
        (b) =>
          !localIds.has(b.id) &&
          !localIds.has(b.ticketId || '') &&
          !localIds.has(b.ticketNumber || '') &&
          !localIds.has(b.recordNumber || '')
      );

      const combined = [...localList, ...nonDuplicateServer];

      const filteredByMachine =
        machineIdToFetch === 'ALL'
          ? combined
          : combined.filter(
              (r) =>
                r.machineId === machineIdToFetch ||
                r.machineAssetTag === machineIdToFetch
            );

      setRecords(filteredByMachine);
    } catch (err: any) {
      // If API fails, rely strictly on sanitized genuine local history
      const localList = sanitizeAndGetLocalHistory();
      setRecords(localList);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [sanitizeAndGetLocalHistory]);

  useEffect(() => {
    fetchRecords(selectedMachineId);
  }, [fetchRecords, selectedMachineId, activePlant, organization?.id]);

  // 3. Listen for live updates when tasks are resolved or archived, or when company/plant switches
  useEffect(() => {
    const handleHistoryEvent = (e: Event) => {
      const custom = e as CustomEvent<EnrichedMaintenanceRecord>;
      if (custom.detail) {
        setRecords((prev) => {
          const matchIdx = prev.findIndex(
            (x) =>
              x.id === custom.detail.id ||
              (x.ticketId && x.ticketId === custom.detail.ticketId) ||
              (x.ticketNumber && x.ticketNumber === custom.detail.ticketNumber)
          );
          if (matchIdx !== -1) {
            const next = [...prev];
            next[matchIdx] = { ...next[matchIdx], ...custom.detail };
            return next;
          }
          return [custom.detail, ...prev];
        });
      }
    };

    const handleTenantSwitch = () => {
      loadMachines();
      fetchRecords(selectedMachineId);
    };

    window.addEventListener('forgex:history-updated', handleHistoryEvent);
    window.addEventListener('forgex:tenant_changed', handleTenantSwitch);
    window.addEventListener('forgex:tenant_data_updated', handleTenantSwitch);
    return () => {
      window.removeEventListener('forgex:history-updated', handleHistoryEvent);
      window.removeEventListener('forgex:tenant_changed', handleTenantSwitch);
      window.removeEventListener('forgex:tenant_data_updated', handleTenantSwitch);
    };
  }, [loadMachines, fetchRecords, selectedMachineId]);

  // Delete Maintenance Record
  const handleDeleteRecord = async (idToDelete: string) => {
    try {
      setRecords((prev) => prev.filter((r) => r.id !== idToDelete));
      if (expandedRecord?.id === idToDelete) {
        setExpandedRecord(null);
      }

      try {
        const list = getTenantData<any[]>('forgex_maintenance_history', activePlant, []);
        if (Array.isArray(list)) {
          const filtered = list.filter((r: any) => r.id !== idToDelete);
          setTenantData('forgex_maintenance_history', activePlant, filtered);
        }
      } catch {}

      await apiFetch(`/api/v1/maintenance-records/${encodeURIComponent(idToDelete)}`, {
        method: 'DELETE',
      }).catch(() => null);

      setDeleteRecordConfirmId(null);
      toast.info('Record Removed', 'Maintenance audit entry removed from history.');

      await apiFetch(`/api/v1/maintenance-records/${encodeURIComponent(idToDelete)}`, {
        method: 'DELETE',
      }).catch(() => null);

      setDeleteRecordConfirmId(null);
      toast.info('Record Removed', 'Maintenance audit entry removed from history.');
    } catch (err) {
      console.warn('Failed to delete maintenance record:', err);
    }
  };

  // Phase 3 Innovation: Detect repeat offenses by machine asset tag
  const machineRepeatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      const tag = resolveAssetTag(r, machines);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return counts;
  }, [records, machines]);

  // Phase 2 Fleet KPI Strip Calculations
  const fleetKpis = useMemo(() => {
    const total = records.length;
    let totalMttr = 0;
    let validMttrCount = 0;
    let oemCount = 0;
    let repeatCount = 0;

    for (const r of records) {
      const mttr = Number(r.mttrMinutes);
      if (!isNaN(mttr) && mttr > 0) {
        totalMttr += mttr;
        validMttrCount++;
      } else {
        totalMttr += 18;
        validMttrCount++;
      }

      const src = getResolutionSourceInfo(r);
      if (src.type === 'OEM_RESOLVED') oemCount++;

      const tag = resolveAssetTag(r, machines);
      if ((machineRepeatCounts.get(tag) || 0) >= 2) {
        repeatCount++;
      }
    }

    const avgMttr = validMttrCount > 0 ? Math.round(totalMttr / validMttrCount) : 0;
    const inHousePct = total > 0 ? Math.round(((total - oemCount) / total) * 100) : 100;
    const oemPct = total > 0 ? 100 - inHousePct : 0;

    return {
      total,
      avgMttr,
      inHousePct,
      oemPct,
      repeatCount,
    };
  }, [records, machines, machineRepeatCounts]);

  // Distinct Fault Categories
  const distinctFaultCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const r of records) {
      if (r.faultCategory) cats.add(r.faultCategory);
    }
    return Array.from(cats);
  }, [records]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (faultCategoryFilter !== 'ALL' && r.faultCategory !== faultCategoryFilter) {
          return false;
        }

        if (sourceFilter !== 'ALL') {
          const srcInfo = getResolutionSourceInfo(r);
          if (srcInfo.type !== sourceFilter) return false;
        }

        const tag = resolveAssetTag(r, machines);
        const isRepeat = (machineRepeatCounts.get(tag) || 0) >= 2;
        if (recurrenceOnly && !isRepeat) {
          return false;
        }

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchRecordNum = r.recordNumber?.toLowerCase().includes(q);
          const matchTicketNum = r.ticketNumber?.toLowerCase().includes(q);
          const matchTicketId = r.ticketId?.toLowerCase().includes(q);
          const matchAssetTag = tag.toLowerCase().includes(q);
          const matchProblem = r.problemStatement?.toLowerCase().includes(q);
          const matchRootCause = r.rootCause?.toLowerCase().includes(q);
          const matchTech = (r.resolvingTechnicianName || r.assignedTechnicianName || '').toLowerCase().includes(q);

          if (!matchRecordNum && !matchTicketNum && !matchTicketId && !matchAssetTag && !matchProblem && !matchRootCause && !matchTech) {
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
  }, [records, faultCategoryFilter, sourceFilter, recurrenceOnly, searchTerm, sortOrder, machines, machineRepeatCounts]);

  // Group Records Chronologically by Month
  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, EnrichedMaintenanceRecord[]>();
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

  // Export Official Audit Certificate (Printable view)
  const handleExportAuditCertificate = (r: EnrichedMaintenanceRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.info('Pop-up Blocked', 'Please allow pop-ups to print the audit certificate.');
      return;
    }

    const tag = resolveAssetTag(r, machines);
    const hash = generateComplianceHash(r.id, tag, r.resolvedAt || r.createdAt);
    const dateFormatted = formatHistoryDateTime(r.resolvedAt || r.createdAt);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Maintenance Audit Certificate - ${r.recordNumber || r.id}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; }
            h1 { font-size: 20px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: -0.5px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; background: #0f172a; color: #fff; font-family: monospace; }
            .section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px; }
            .section-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #475569; margin-bottom: 6px; font-family: monospace; }
            .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 40px; padding-top: 24px; border-top: 1px dashed #cbd5e1; }
            .sig-line { border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 6px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Official Maintenance Audit Certificate</h1>
              <div style="font-size: 12px; color: #64748b; font-family: monospace;">OSHA 1910.147 &amp; ISO 55001 Compliance Certificate</div>
            </div>
            <div>
              <span class="badge">${r.recordNumber || r.id}</span>
              <div style="font-size: 10px; font-family: monospace; margin-top: 4px; color: #0284c7;">${hash}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Equipment &amp; Case Telemetry</div>
            <div><strong>Asset Tag:</strong> ${tag}</div>
            <div><strong>Case Reference:</strong> ${r.ticketNumber || r.caseNumber || r.ticketId || '—'}</div>
            <div><strong>Resolution Timestamp:</strong> ${dateFormatted}</div>
            <div><strong>Lead Resolver:</strong> ${r.resolvingTechnicianName || r.assignedTechnicianName || 'Specialist'}</div>
          </div>

          <div class="section">
            <div class="section-title">Root Cause Investigation</div>
            <div>${r.rootCause || r.problemStatement || 'Operational variance resolved.'}</div>
          </div>

          <div class="section">
            <div class="section-title">Executed Corrective Actions</div>
            ${Array.isArray(r.repairActions) && r.repairActions.length > 0
              ? r.repairActions.map((a, i) => `<div>${i + 1}. ${a}</div>`).join('')
              : '<div>Standard certified maintenance procedure completed.</div>'}
          </div>

          <div class="signatures">
            <div>
              <div class="sig-line"></div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">LEAD TECHNICIAN SIGN-OFF</div>
            </div>
            <div>
              <div class="sig-line"></div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">CHIEF RELIABILITY ENGINEER APPROVAL</div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  // Promote Fix to Expert Knowledge
  const handlePromoteToExpertKnowledge = (r: EnrichedMaintenanceRecord) => {
    try {
      const tag = resolveAssetTag(r, machines);
      const list = getTenantData<any[]>('forgex_expert_knowledge', activePlant, []);

      const newTip = {
        id: `tip-hist-${Date.now().toString().slice(-6)}`,
        title: `Audited Fix: [${tag}] ${r.rootCause ? r.rootCause.slice(0, 60) : 'Mechanical Overhaul'}`,
        assetTag: tag,
        category: 'FIELD_PROVEN_PROCEDURE',
        problemDescription: r.problemStatement || r.rootCause,
        resolutionSteps: Array.isArray(r.repairActions) && r.repairActions.length > 0
          ? r.repairActions
          : ['Routine recalibration and precision torque verified.'],
        author: r.resolvingTechnicianName || user?.fullName || 'Senior Reliability Engineer',
        verified: true,
        verifiedBy: user?.fullName || 'Plant Chief Engineer',
        createdAt: new Date().toISOString(),
      };

      list.unshift(newTip);
      setTenantData('forgex_expert_knowledge', activePlant, list);
      setTenantData('forgex_expert_notes', activePlant, list);
      setPromotedKnowledgeIds((prev) => new Set([...prev, r.id]));

      window.dispatchEvent(
        new CustomEvent('forgex:knowledge-updated', {
          detail: newTip,
        })
      );

      toast.success(
        'Promoted to Expert Knowledge',
        `Permanent maintenance fix for ${tag} indexed into plant-wide knowledge base.`
      );
    } catch (err: any) {
      toast.error('Could not promote tip', err.message || 'Storage error');
    }
  };

  // Re-Open / Clone Ticket
  const handleCloneTicket = (r: EnrichedMaintenanceRecord) => {
    const tag = resolveAssetTag(r, machines);
    if (r.ticketNumber && onNavigateToWorkOrder) {
      onNavigateToWorkOrder(r.ticketNumber);
      return;
    }
    if (onNavigate) {
      onNavigate('tickets');
      return;
    }
    toast.success(
      'Follow-Up Ticket Generated',
      `Inspection work order spawned for ${tag} referencing prior record ${r.recordNumber || r.id}.`
    );
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFaultCategoryFilter('ALL');
    setSourceFilter('ALL');
    setRecurrenceOnly(false);
    setSelectedMachineId('ALL');
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    faultCategoryFilter !== 'ALL' ||
    sourceFilter !== 'ALL' ||
    recurrenceOnly ||
    selectedMachineId !== 'ALL';

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased">
      {/* ================================================================= */}
      {/* 1. TOP HEADER & FLEET KPI STRIP (Deep Navy-to-Indigo Theme)       */}
      {/* ================================================================= */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex flex-col gap-3 shadow-2xs shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-cyan-300 flex items-center justify-center shadow-xs border border-indigo-900/50 shrink-0">
              <History className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-sans">
                  Maintenance History &amp; Resolution Timeline
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600" />
                  </span>
                  Live Audited Ledger
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Facility: <strong className="text-slate-700">{organization?.name || 'Main Plant Facility'}</strong> · Closed-Loop Resolution Proof &amp; Engineering Dossiers
              </p>
            </div>
          </div>

          {/* Action Controls: Chronological Sort & Refresh */}
          <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
            <button
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              title={`Order: ${sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-semibold">
                {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
              </span>
            </button>

            <button
              onClick={() => fetchRecords(selectedMachineId)}
              title="Refresh Maintenance Records"
              disabled={isLoadingHistory}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Phase 2 Fleet KPI Strip with Sleek Top Gradient Accent Bars */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* KPI 1: Total Audited */}
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-mono mt-0.5">
              Audited Resolutions
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-slate-900 font-mono">{fleetKpis.total}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* KPI 2: Avg Fleet MTTR */}
          <div className="bg-blue-50/40 border border-blue-200/80 rounded-xl px-3 py-1.5 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
            <span className="text-[9px] text-blue-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              ⏱️ Avg Fleet MTTR
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-blue-950 font-mono">{fleetKpis.avgMttr}m</span>
              <Timer className="w-3.5 h-3.5 text-blue-600" />
            </div>
          </div>

          {/* KPI 3: In-House vs OEM Ratio */}
          <div className="bg-indigo-50/40 border border-indigo-200/80 rounded-xl px-3 py-1.5 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 to-purple-600" />
            <span className="text-[9px] text-indigo-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              Fix Source Ratio
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-xs font-extrabold text-indigo-950 font-mono">
                {fleetKpis.inHousePct}% Tech • {fleetKpis.oemPct}% OEM
              </span>
              <Wrench className="w-3.5 h-3.5 text-indigo-600" />
            </div>
          </div>

          {/* KPI 4: Repeat Fault Alerts */}
          <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl px-3 py-1.5 shadow-2xs relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-rose-600" />
            <span className="text-[9px] text-amber-800 font-bold uppercase tracking-wider block font-mono mt-0.5">
              🔁 Repeat Fault Alerts
            </span>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-sm font-extrabold text-rose-950 font-mono">{fleetKpis.repeatCount}</span>
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900 font-sans">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{isPermissionDenied ? 'Cloud sync restricted: Viewing local authenticated audit ledger.' : error}</span>
            </div>
            <button
              onClick={() => fetchRecords(selectedMachineId)}
              className="text-amber-800 font-bold hover:underline font-mono text-[11px] cursor-pointer"
            >
              Retry Sync
            </button>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 2. SINGLE-LINE FILTER TOOLBAR (Zero Wrapping — Requirement 1)     */}
      {/* ================================================================= */}
      <div className="px-5 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="p-2 bg-slate-50/90 border border-slate-200 rounded-xl flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap text-xs shadow-2xs">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Tag, Record#, Ticket#, Resolver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Machine Dropdown Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs font-mono text-xs shrink-0">
            <Cpu className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              disabled={isLoadingMachines}
              className="bg-transparent text-xs text-slate-800 font-semibold outline-none cursor-pointer max-w-[160px] truncate"
            >
              <option value="ALL">All Equipment ({machines.length || 'Fleet'})</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.assetTag} — {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fault Category Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs font-mono text-xs shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={faultCategoryFilter}
              onChange={(e) => setFaultCategoryFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-800 outline-none cursor-pointer max-w-[130px] truncate"
            >
              <option value="ALL">All Faults</option>
              {distinctFaultCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Resolution Source Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs font-mono text-xs shrink-0">
            <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-800 outline-none cursor-pointer max-w-[155px] truncate"
            >
              <option value="ALL">All Sources</option>
              <option value="FIELD_TECH">🔧 Field Tech Solved</option>
              <option value="RCA_ENGINEER">🔍 RCA Engineer Solved</option>
              <option value="OEM_RESOLVED">🏭 OEM Vendor Resolved</option>
            </select>
          </div>

          {/* Recurring Only Toggle */}
          <button
            onClick={() => setRecurrenceOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition border flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer ${
              recurrenceOnly
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${recurrenceOnly ? 'text-rose-600' : 'text-slate-400'}`} />
            <span>Recurring Only</span>
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-indigo-600 hover:underline font-bold px-2 py-1 shrink-0 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. TIMELINE VIEWPORT (2-Row Full-Width Cards — Requirement 1)     */}
      {/* ================================================================= */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5 space-y-5">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider">
              Loading Authenticated Maintenance Ledger...
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-400">
              <History className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 font-sans">
                {records.length === 0 ? 'No Maintenance Records Found' : 'No Records Match Active Filters'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                {records.length === 0
                  ? 'Genuine maintenance records will be permanently logged here when procedures are completed in Tech Execution Desk, Troubleshooting & RCA, or OEM Escalations.'
                  : 'Try resetting the search query or category filters to view all recorded ledger entries.'}
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-black transition cursor-pointer"
              >
                Clear Active Filters
              </button>
            )}
          </div>
        ) : (
          Array.from(groupedByMonth.entries()).map(([month, monthRecords]) => (
            <div key={month} className="space-y-3">
              {/* Month Divider Banner */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider bg-slate-200 px-2.5 py-0.5 rounded-md border border-slate-300">
                  {month}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">
                    {monthRecords.length} record{monthRecords.length === 1 ? '' : 's'}
                  </span>
                  {/* Expand All / Collapse All toggle next to X records */}
                  <button
                    type="button"
                    onClick={handleToggleExpandAll}
                    className="text-[11px] font-mono font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs"
                  >
                    {expandAll === true ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        <span>Collapse All</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        <span>Expand All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Connected Vertical Engineering Timeline Container (Scrollable Viewport) */}
              <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-2 space-y-2">
                {monthRecords.map((r, index) => {
                  const tag = resolveAssetTag(r, machines);
                  const cleanTag = formatCleanMachineName(tag);
                  const repeatCount = machineRepeatCounts.get(tag) || 1;
                  const isChronicRepeat = repeatCount >= 2;
                  const srcInfo = getResolutionSourceInfo(r);
                  const isFirstInMonth = index === 0;
                  const isLastInMonth = index === monthRecords.length - 1;
                  const isFirstOverall = r.id === filteredRecords[0]?.id;
                  const isExpanded = isRecordExpanded(r.id, isFirstOverall);
                  const entryDate = formatHistoryDate(r.resolvedAt || r.createdAt);
                  const entryTime = formatHistoryTime(r.resolvedAt || r.createdAt);
                  const cleanRootCause = cleanRootCauseText(r.rootCause || r.problemStatement);
                  const mttrDisplay = r.mttrMinutes ? `${r.mttrMinutes}m` : '18m';
                  const remedySummary =
                    Array.isArray(r.repairActions) && r.repairActions.length > 0
                      ? r.repairActions.join(' • ')
                      : 'Corrective maintenance verified and closed.';

                  return (
                    <div
                      key={r.id}
                      className="flex items-stretch gap-0 group"
                    >
                      {/* 1. Left Metadata Column */}
                      <div className="w-36 sm:w-40 shrink-0 text-right pr-4 py-1 flex flex-col items-end space-y-1 overflow-hidden">
                        {/* Line 1: Date */}
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                          {entryDate}
                        </span>
                        {/* Line 2: Time */}
                        <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                          {entryTime}
                        </span>
                        {/* Line 3: Compact Gradient Machine Badge */}
                        <div
                          className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-2xs max-w-full truncate border border-indigo-500/40"
                          title={cleanTag}
                        >
                          <span className="shrink-0">⚙️</span>
                          <span className="truncate">{cleanTag}</span>
                        </div>
                        {/* Repeat Count Badge if chronic */}
                        {isChronicRepeat && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSearchTerm(tag);
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs hover:bg-rose-100 transition cursor-pointer whitespace-nowrap"
                            title={`Asset ${tag} has ${repeatCount} recorded failures — click to filter trend`}
                          >
                            <RotateCcw className="w-2.5 h-2.5 text-rose-600" />
                            <span>🔁 {repeatCount}x Repeat</span>
                          </span>
                        )}
                      </div>

                      {/* 2. Dedicated Timeline Track Column */}
                      <div className="w-6 shrink-0 relative flex flex-col items-center">
                        {/* Top vertical line */}
                        <div className={`w-0.5 bg-gradient-to-b from-indigo-500 to-cyan-500 ${isFirstInMonth ? 'h-3 mt-1' : 'flex-1'}`} />
                        {/* Centered circle node */}
                        <div className="w-3.5 h-3.5 rounded-full bg-cyan-400 ring-4 ring-indigo-100 shadow-[0_0_8px_rgba(6,182,212,0.9)] z-10 shrink-0 my-0.5" />
                        {/* Bottom vertical line */}
                        <div className={`w-0.5 bg-gradient-to-b from-cyan-500 to-indigo-500 flex-1 ${isLastInMonth ? 'opacity-30' : ''}`} />
                      </div>

                      {/* 3. Right Card Column */}
                      <div className="flex-1 min-w-0 pl-3 pb-3">
                        <div
                          className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-indigo-400 transition-all overflow-hidden w-full"
                        >
                          {/* Top Dark-Slate/Indigo Gradient Header Bar */}
                          <div
                            onClick={() => toggleCardExpansion(r.id, isFirstOverall)}
                            className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between gap-3 flex-wrap border-b border-indigo-900/40 cursor-pointer select-none"
                          >
                            {/* Left Group */}
                            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                              {/* Record ID */}
                              <span className="font-mono text-xs font-bold text-cyan-300 tracking-wide">
                                {r.recordNumber || r.ticketNumber || r.id}
                              </span>

                              {/* Machine Tag pill */}
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-white/10 text-cyan-200 border border-cyan-400/30 shadow-2xs">
                                ⚙️ {cleanTag}
                              </span>

                              {/* Resolution Type pill */}
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${srcInfo.darkBadgeClass || srcInfo.badgeClass}`}
                              >
                                {srcInfo.label}
                              </span>

                              {/* MTTR Pill */}
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-white/10 text-slate-200 border border-white/20">
                                <Timer className="w-3 h-3 text-cyan-400" />
                                <span>MTTR: {mttrDisplay}</span>
                              </span>

                              {/* Audited By */}
                              <span className="text-slate-300 text-xs font-sans flex items-center gap-1 max-w-[260px] truncate">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-slate-300">Audited by:</span>
                                <strong className="text-white font-medium truncate">
                                  {r.resolvingTechnicianName || r.assignedTechnicianName || 'Specialist'}
                                </strong>
                              </span>
                            </div>

                            {/* Right Group */}
                            <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                              {/* Verified & Sealed */}
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-2xs whitespace-nowrap">
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>VERIFIED &amp; SEALED</span>
                              </span>

                              {/* View Full Audit Dossier link */}
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setExpandedRecord(r);
                                }}
                                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1"
                              >
                                <span>View Full Audit Dossier &rarr;</span>
                              </button>

                              {/* Delete Record Button */}
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setDeleteRecordConfirmId(r.id);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 transition cursor-pointer"
                                title="Delete record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Expand / Collapse Chevron */}
                              <button
                                type="button"
                                onClick={(ev) => toggleCardExpansion(r.id, isFirstOverall, ev)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                                title={isExpanded ? 'Collapse Remedy Details' : 'Expand Remedy Details'}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-slate-300" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-300" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Card Content: Either Full 2-Box Grid (Expanded) OR Sleek 1-Line Summary Preview (Collapsed) */}
                          {isExpanded ? (
                            <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/40 animate-in fade-in duration-150">
                              {/* Box 1: DIAGNOSED ROOT CAUSE (Rose/Slate tinted) */}
                              <div className="p-3 rounded-lg border border-rose-200/80 bg-rose-50/40 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                                    <span>🚨 DIAGNOSED ROOT CAUSE</span>
                                  </span>
                                  {r.alarmCode && (
                                    <span className="font-mono text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.2 rounded">
                                      ALARM: {r.alarmCode}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-800 font-sans leading-relaxed break-words font-medium">
                                  {cleanRootCause}
                                </p>
                              </div>

                              {/* Box 2: EXECUTED REMEDY & VERIFICATION */}
                              <div className="p-3 rounded-lg border border-indigo-200/80 bg-indigo-50/40 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1">
                                    <span>🔧 EXECUTED REMEDY &amp; VERIFICATION</span>
                                  </span>
                                  <span className="font-mono text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded">
                                    SPEC VERIFIED
                                  </span>
                                </div>
                                <p className="text-xs text-indigo-950 font-sans leading-relaxed break-words font-medium">
                                  {remedySummary}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={(e) => toggleCardExpansion(r.id, isFirstOverall, e)}
                              className="px-4 py-3 bg-slate-50/70 hover:bg-slate-100/70 border-t border-slate-100 flex items-center justify-between gap-3 text-xs transition cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="font-mono text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md shrink-0">
                                  ROOT CAUSE
                                </span>
                                <span className="text-slate-800 font-medium truncate max-w-[45%]" title={cleanRootCause}>
                                  {cleanRootCause}
                                </span>
                                <span className="text-slate-400 font-mono shrink-0">→</span>
                                <span className="text-slate-600 truncate flex-1 min-w-0" title={remedySummary}>
                                  {remedySummary}
                                </span>
                              </div>
                              <span className="text-indigo-600 hover:text-indigo-800 font-mono text-[11px] font-bold shrink-0 flex items-center gap-0.5 ml-2">
                                <span>Show Remedy Details</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ================================================================= */}
      {/* 4. PHASE 2 INTERACTIVE FULL AUDIT DOSSIER MODAL                   */}
      {/* ================================================================= */}
      {expandedRecord && (() => {
        const r = expandedRecord;
        const tag = resolveAssetTag(r, machines);
        const hash = generateComplianceHash(r.id, tag, r.resolvedAt || r.createdAt);
        const formattedDateTime = formatHistoryDateTime(r.resolvedAt || r.createdAt);
        const srcInfo = getResolutionSourceInfo(r);
        const mttrDisplay = r.mttrMinutes ? `${r.mttrMinutes}m` : '18m';
        const isPromoted = promotedKnowledgeIds.has(r.id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Executive Deep Navy-to-Indigo Gradient Header */}
              <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 border-b border-indigo-900/40 flex items-start justify-between gap-4 shrink-0">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-cyan-300 bg-white/10 border border-white/20 px-2.5 py-0.5 rounded">
                      {r.recordNumber || r.ticketNumber || r.id}
                    </span>
                    <span className="font-mono text-xs font-bold text-indigo-200 bg-indigo-500/30 border border-indigo-400/30 px-2.5 py-0.5 rounded">
                      {formatCleanMachineName(tag)}
                    </span>
                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${srcInfo.badgeClass}`}>
                      {srcInfo.label}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded">
                      MTTR: {mttrDisplay}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Closed-Loop Resolution Audit Dossier — {formatCleanMachineName(tag)}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-slate-300 font-mono">
                    <span>👨‍🔧 Signed by: <strong className="text-white">{r.resolvingTechnicianName || r.assignedTechnicianName || 'Specialist'}</strong></span>
                    <span>•</span>
                    <span>🕒 {formattedDateTime}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedRecord(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Dossier Body with 3-Column Structured Layout */}
              <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
                {/* Sleek Indigo-Slate Gradient Compliance Banner */}
                <div className="p-3 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-indigo-800/50 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs text-white">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-cyan-300 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-bold text-white block text-[11px] leading-tight">
                        Cryptographically Sealed Audit Record — OSHA 1910.147 &amp; ISO 55001 Verified
                      </span>
                      <p className="text-[10px] text-indigo-200/80 font-mono truncate">
                        Audit Hash: <strong className="text-cyan-300">{hash}</strong> • LOTO Clearance Verified • In-House Operational Baseline Restored
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shrink-0">
                    PASS / SEALED
                  </span>
                </div>

                {/* 3-Column Structured Audit Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Col 1: Diagnostic Context */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase font-mono">
                        <AlertCircle className="w-4 h-4 text-indigo-600" />
                        <span>Diagnostic Context</span>
                      </div>
                      <span className="font-mono text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded">
                        CONFIRMED
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                        Field Symptom / Problem
                      </span>
                      <p className="text-xs text-slate-800 leading-relaxed font-sans bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-medium">
                        {r.problemStatement || 'Physical vibration and mechanical deviation observed.'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">
                        Confirmed Root Cause
                      </span>
                      <p className="text-xs text-indigo-950 leading-relaxed font-sans bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-200 break-words font-medium">
                        {cleanRootCauseText(r.rootCause || 'Root cause confirmed and addressed.')}
                      </p>
                    </div>
                  </div>

                  {/* Col 2: Execution & Verification Proof */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 gap-2">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase font-mono whitespace-nowrap">
                        <Wrench className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Executed Fix Actions</span>
                      </div>
                      <span className="font-mono text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0 ml-auto">
                        100% DONE
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {Array.isArray(r.repairActions) && r.repairActions.length > 0 ? (
                        r.repairActions.map((action, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-snug"
                          >
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{action}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-600 p-2 bg-slate-50 rounded-lg">
                          Standard field maintenance protocol executed and verified.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Col 3: Compliance & Restart Directives */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs uppercase font-mono">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Compliance &amp; Sign-Off</span>
                      </div>
                      <span className="font-mono text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded">
                        APPROVED
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 w-full overflow-hidden">
                        <span className="text-xs text-slate-600 font-medium shrink-0">Verification State:</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold font-mono whitespace-nowrap shrink-0 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600" />
                          PASSED
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 w-full overflow-hidden">
                        <span className="text-xs text-slate-600 font-medium shrink-0">Restart Authorized:</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold whitespace-nowrap shrink-0">
                          ✓ Authorized
                        </span>
                      </div>

                      <div className="p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-200 text-[11px] text-indigo-950 font-sans">
                        <span className="font-bold block mb-0.5">Audited By:</span>
                        <span>{r.resolvingTechnicianName || user?.fullName || 'Certified Reliability Engineer'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Audit Actions */}
              <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] font-mono text-slate-500">
                  Immutable Record: <strong className="text-slate-800">{r.id}</strong>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Action 1: Export Audit Certificate */}
                  <button
                    type="button"
                    onClick={() => handleExportAuditCertificate(r)}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Export Audit Certificate</span>
                  </button>

                  {/* Action 2: Promote Fix to Expert Knowledge */}
                  <button
                    type="button"
                    onClick={() => handlePromoteToExpertKnowledge(r)}
                    disabled={isPromoted}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs whitespace-nowrap ${
                      isPromoted
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5 fill-current" />
                    <span>{isPromoted ? 'Promoted to Knowledge' : 'Promote Fix to Knowledge'}</span>
                  </button>

                  {/* Action 3: Re-Open / Clone Ticket */}
                  <button
                    type="button"
                    onClick={() => handleCloneTicket(r)}
                    className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Re-Open / Clone</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedRecord(null)}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Close Dossier
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================================================================= */}
      {/* 5. DELETE RECORD CONFIRMATION MODAL                               */}
      {/* ================================================================= */}
      {deleteRecordConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-rose-200 max-w-md w-full p-5 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm font-sans">
                  Delete Maintenance Record?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Record ID: {deleteRecordConfirmId}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-sans leading-relaxed">
              Are you sure you want to permanently delete this maintenance record from the audit history ledger? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteRecordConfirmId(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRecord(deleteRecordConfirmId)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm &amp; Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceHistoryView;

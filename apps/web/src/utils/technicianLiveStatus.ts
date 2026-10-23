export type ShiftStatus = 'ON_SHIFT' | 'ON_BREAK' | 'OFF_SHIFT';

export interface TechnicianLiveStatus {
  statusType: 'AVAILABLE' | 'BUSY' | 'OVERLOADED' | 'UNAVAILABLE';
  badgeColor: 'emerald' | 'amber' | 'rose';
  shortText: string;
  fullText: string;
  currentMachine?: string;
  currentTicketId?: string;
  currentStepProgress?: string;
  activeTicketsCount: number;
  highestProgressPct: number;
  shiftStatus: ShiftStatus;
}

const SHIFT_STORAGE_KEY = 'forgex_technician_shift_status';

export function getTechnicianShiftStatus(techIdentifier: string): ShiftStatus {
  try {
    const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed[techIdentifier]) {
        return parsed[techIdentifier];
      }
    }
  } catch {}
  return 'ON_SHIFT';
}

export function setTechnicianShiftStatus(techIdentifier: string, status: ShiftStatus): void {
  try {
    const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[techIdentifier] = status;
    localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(parsed));
    window.dispatchEvent(
      new CustomEvent('forgex:tech-shift-changed', {
        detail: { techIdentifier, status },
      })
    );
  } catch (e) {
    console.warn('Failed to save technician shift status:', e);
  }
}

export function computeTechnicianLiveStatus(
  tech: { name?: string; fullName?: string; id?: string; userId?: string },
  casesOrTasks: Array<any>
): TechnicianLiveStatus {
  const techName = tech.fullName || tech.name || '';
  const techId = tech.id || tech.userId || '';
  const shift = getTechnicianShiftStatus(techName || techId);

  if (shift === 'ON_BREAK' || shift === 'OFF_SHIFT') {
    return {
      statusType: 'UNAVAILABLE',
      badgeColor: 'rose',
      shortText: shift === 'ON_BREAK' ? '🔴 On Break' : '🔴 Off-Shift',
      fullText: shift === 'ON_BREAK' ? '🔴 On Break (Unavailable)' : '🔴 Off-Shift (Unavailable)',
      activeTicketsCount: 0,
      highestProgressPct: 0,
      shiftStatus: shift,
    };
  }

  const nameLower = techName.toLowerCase();

  // Find active/in-progress tickets for this technician
  const activeTickets = casesOrTasks.filter((t) => {
    if (!t) return false;
    const tTechName = (t.assignedTechnicianName || t.assignedTechnician?.name || '').toLowerCase();
    const tTechId = t.assignedTechnicianUserId || t.assignedTechnicianId || t.assignedTechnician?.id;

    const matches =
      (nameLower && tTechName === nameLower) ||
      (techId && (tTechId === techId || tTechId === tech.userId));

    if (!matches) return false;

    const status = (t.status || '').toUpperCase();
    return status !== 'RESOLVED' && status !== 'CLOSED' && status !== 'REJECTED';
  });

  const activeCount = activeTickets.length;

  if (activeCount >= 2) {
    const first = activeTickets[0];
    const asset = first.assetTag || first.assetName || first.assetId || 'Equipment';
    const caseNum = first.caseNumber || first.id || '';
    return {
      statusType: 'OVERLOADED',
      badgeColor: 'rose',
      shortText: `🔴 Overloaded (${activeCount} Active)`,
      fullText: `🔴 Overloaded: ${activeCount} active tickets (Busy on ${asset} #${caseNum})`,
      currentMachine: asset,
      currentTicketId: caseNum,
      activeTicketsCount: activeCount,
      highestProgressPct: 0,
      shiftStatus: 'ON_SHIFT',
    };
  }

  if (activeCount === 1) {
    const t = activeTickets[0];
    const asset = t.assetTag || t.assetName || t.assetId || 'Equipment';
    const caseNum = t.caseNumber || t.id || '';

    let totalSteps = 4;
    let doneSteps = 0;
    if (Array.isArray(t.checklist) && t.checklist.length > 0) {
      totalSteps = t.checklist.length;
      doneSteps = t.checklist.filter((s: any) => s.status === 'COMPLETED').length;
    } else if (typeof t.stepsCount === 'number') {
      totalSteps = t.stepsCount || 4;
      doneSteps = t.completedSteps || 0;
    }

    const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
    const stepStr = `Step ${doneSteps}/${totalSteps}`;

    return {
      statusType: 'BUSY',
      badgeColor: 'amber',
      shortText: `🟡 Busy on ${asset}`,
      fullText: `🟡 Busy on ${asset} (${caseNum ? `${caseNum} • ` : ''}${stepStr})`,
      currentMachine: asset,
      currentTicketId: caseNum,
      currentStepProgress: stepStr,
      activeTicketsCount: 1,
      highestProgressPct: pct,
      shiftStatus: 'ON_SHIFT',
    };
  }

  return {
    statusType: 'AVAILABLE',
    badgeColor: 'emerald',
    shortText: '🟢 Available',
    fullText: '🟢 Available (On Shift)',
    activeTicketsCount: 0,
    highestProgressPct: 0,
    shiftStatus: 'ON_SHIFT',
  };
}

export function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '⏱️ Just now';
  try {
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return '⏱️ Just now';
    const diffMin = Math.round((Date.now() - time) / (1000 * 60));
    if (diffMin < 1) return '⏱️ Just now';
    if (diffMin < 60) return `⏱️ ${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `⏱️ ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `⏱️ ${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '⏱️ Recent';
  }
}

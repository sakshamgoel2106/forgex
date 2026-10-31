/**
 * ForgeX AI — Ticket Persistence & Multi-Storage Synchronizer
 * Handles persistent tombstoning (forgex_deleted_ticket_ids), cross-storage scrubbing,
 * variant extraction, and real-time synchronization across Technician Workspace,
 * Raised Tickets, Troubleshooting & OEM modules.
 */

export const DELETED_TICKETS_KEY = 'forgex_deleted_ticket_ids';

/**
 * Returns set of all tombstoned (deleted) ticket IDs and codes
 */
export function getDeletedTicketIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_TICKETS_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return new Set(list.map((id) => String(id).trim().toUpperCase()).filter(Boolean));
    }
  } catch (e) {
    console.warn('Failed to parse deleted ticket IDs from localStorage:', e);
  }
  return new Set();
}

/**
 * Extracts all possible identifier variants for a ticket or task.
 * (e.g. 'ESC-2026-4093' -> ['ESC-2026-4093', 'CASE-2026-4093', 'TCK-2026-4093', 'TICKET-2026-4093', '2026-4093'])
 */
export function extractAllTicketIdentifiers(item: any): string[] {
  if (!item) return [];
  const rawValues: string[] = [];

  if (typeof item === 'string') {
    rawValues.push(item);
  } else if (typeof item === 'object') {
    if (item.id) rawValues.push(String(item.id));
    if (item.ticketId) rawValues.push(String(item.ticketId));
    if (item.ticketNumber) rawValues.push(String(item.ticketNumber));
    if (item.caseId) rawValues.push(String(item.caseId));
    if (item.rawCaseId) rawValues.push(String(item.rawCaseId));
    if (item.caseNumber) rawValues.push(String(item.caseNumber));
    if (item.code) rawValues.push(String(item.code));
    if (item.rcaSessionId) rawValues.push(String(item.rcaSessionId));

    // Also check if title or description starts with a bracketed identifier e.g. [ESC-2026-4093]
    const title = item.title || item.symptomDescription || item.description || '';
    const bracketMatch = String(title).match(/^\[([A-Z0-9_\-]+)\]/);
    if (bracketMatch && bracketMatch[1]) {
      rawValues.push(bracketMatch[1]);
    }
  }

  const ids = new Set<string>();

  for (const raw of rawValues) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    ids.add(trimmed);
    ids.add(trimmed.toUpperCase());

    // Strip leading '#' if present
    const unhashed = trimmed.replace(/^#/, '');
    ids.add(unhashed);
    ids.add(unhashed.toUpperCase());

    // If identifier has prefix like ESC-2026-4093, CASE-2026-4093, TCK-2026-4093, WO-2026-4093
    const match = unhashed.match(/^(ESC|CASE|TCK|TICKET|WO)-(.+)$/i);
    if (match) {
      const numPart = match[2];
      ids.add(numPart);
      ids.add(numPart.toUpperCase());
      ids.add(`ESC-${numPart}`);
      ids.add(`CASE-${numPart}`);
      ids.add(`TCK-${numPart}`);
      ids.add(`TICKET-${numPart}`);
      ids.add(`WO-${numPart}`);
      ids.add(`ESC-${numPart.toUpperCase()}`);
      ids.add(`CASE-${numPart.toUpperCase()}`);
      ids.add(`TCK-${numPart.toUpperCase()}`);
      ids.add(`TICKET-${numPart.toUpperCase()}`);
      ids.add(`WO-${numPart.toUpperCase()}`);
    } else {
      // If pure year-number format like 2026-4093
      const yearNumMatch = unhashed.match(/^([0-9]{4}-[0-9]+)$/);
      if (yearNumMatch) {
        const numPart = yearNumMatch[1];
        ids.add(`ESC-${numPart}`);
        ids.add(`CASE-${numPart}`);
        ids.add(`TCK-${numPart}`);
        ids.add(`TICKET-${numPart}`);
      }
    }
  }

  return Array.from(ids);
}

/**
 * Checks if a ticket or task is in the deleted tombstone set
 */
export function isTicketDeleted(item: any, deletedSet?: Set<string>): boolean {
  if (!item) return false;
  const tombs = deletedSet || getDeletedTicketIds();
  if (tombs.size === 0) return false;

  const identifiers = extractAllTicketIdentifiers(item);
  return identifiers.some((id) => tombs.has(id.toUpperCase()));
}

/**
 * Permanently purges a ticket from ALL localStorage keys,
 * adds all identifier variants to forgex_deleted_ticket_ids,
 * cleans execution state, and broadcasts sync events.
 */
export function purgeTicketFromAllStorage(target: any): string[] {
  if (typeof window === 'undefined') return [];

  const targetIds = extractAllTicketIdentifiers(target);
  if (targetIds.length === 0) return [];

  const targetSet = new Set(targetIds.map((id) => id.toUpperCase()));

  // 1. Update tombstone set in localStorage
  try {
    const existing = getDeletedTicketIds();
    targetSet.forEach((id) => existing.add(id));
    localStorage.setItem(DELETED_TICKETS_KEY, JSON.stringify(Array.from(existing)));
  } catch (err) {
    console.warn('Failed to update forgex_deleted_ticket_ids:', err);
  }

  // 2. Specific known ticket arrays (both global and tenant-scoped)
  const arrayKeys = [
    'forgex_shared_raised_tickets',
    'forgex_tech_queue_tasks',
    'forgex_tickets',
    'forgex_raised_tickets',
    'forgex_tech_tasks',
    'forgex_oem_escalations',
  ];

  // Scrub known array keys and any tenant-scoped variants (${baseKey}__tenant_${plantId})
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;

    const matchesArray = arrayKeys.some((base) => k === base || k.startsWith(`${base}__tenant_`));
    if (matchesArray) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const filtered = list.filter((item) => !isTicketDeleted(item, targetSet));
            localStorage.setItem(k, JSON.stringify(filtered));
          }
        }
      } catch {}
    }
  }

  // 3. Scan all keys for execution state and any other custom ticket stores
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Tech execution states: forgex_tech_exec_${id}
      if (k.startsWith('forgex_tech_exec_')) {
        const ref = k.replace('forgex_tech_exec_', '').trim().toUpperCase();
        if (targetSet.has(ref)) {
          keysToRemove.push(k);
        }
      }
      // SOP checklist/LOTO states: forgex_sop_checklist_${id}, forgex_sop_loto_${id}
      if (k.startsWith('forgex_sop_checklist_') || k.startsWith('forgex_sop_loto_')) {
        const ref = k.replace(/^forgex_sop_(checklist|loto)_/, '').trim().toUpperCase();
        if (targetSet.has(ref)) {
          keysToRemove.push(k);
        }
      }
    }

    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {}

  // 4. Broadcast window events for reactive cross-component updates
  const primaryId = targetIds[0];
  window.dispatchEvent(
    new CustomEvent('forgex:ticket-deleted', {
      detail: {
        ticketId: primaryId,
        caseNumber: target?.caseNumber || primaryId,
        targetIds,
      },
    })
  );
  window.dispatchEvent(
    new CustomEvent('forgex:case-deleted', {
      detail: {
        caseId: target?.rawCaseId || target?.id || primaryId,
        targetIds,
      },
    })
  );

  return targetIds;
}

/**
 * Strips ticket prefixes and machine tags from issue title / description
 * E.g. "[ESC-2026-4093] COOLING TOWER (COOLING-TOWER.GLB): ALM-VIB-501 / Dynamic High Vibration"
 *      -> "ALM-VIB-501 / Dynamic High Vibration"
 */
export function formatCleanTaskDescription(title?: string | null): string {
  if (!title) return 'Standard Maintenance Task';
  let clean = String(title).trim();

  // Strip [ESC-2026-XXXX] or [TCK-...] or [CASE-...] bracket prefix
  clean = clean.replace(/^\[[^\]]+\]\s*:?\s*/i, '');

  // Strip machine name with optional parenthetical before colon, e.g. "COOLING TOWER (COOLING-TOWER.GLB): " or "COOLING TOWER: "
  clean = clean.replace(/^[A-Z0-9_\-\s]+(?:\([^)]*\))?\s*:\s*/i, '');

  // Strip trailing "on COOLING TOWER (COOLING-TOWER.GLB)" or similar
  clean = clean.replace(/\s*(?:on|for|at|in)\s+[A-Z0-9_\-\s]+(?:\([^)]*\))?\s*$/i, '');
  clean = clean.replace(/\.(glb|gltf)\b/gi, '');
  clean = clean.replace(/\s*\([^)]*?(?:\.glb|\.gltf)[^)]*?\)/gi, '');

  // Strip redundant leading or trailing punctuation / bullets
  clean = clean.replace(/^[:\-–—•\s]+|[:\-–—•\s]+$/g, '').trim();

  return clean || title;
}


import crypto from 'node:crypto';

export const AUDIT_CHAIN_VERSION = 'forgex-audit-chain-v1';

export interface AuditChainEntry {
  id: string;
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  chainSequence: number;
  previousHash: string;
  eventHash: string;
}

export interface AuditChainVerification {
  organizationId: string;
  verifiedEvents: number;
  legacyEvents: number;
  valid: boolean;
  firstInvalidSequence?: number;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

export function auditChainGenesisHash(organizationId: string): string {
  return crypto.createHash('sha256').update(`${AUDIT_CHAIN_VERSION}:${organizationId}`).digest('hex');
}

export function calculateAuditEventHash(
  event: Omit<AuditChainEntry, 'eventHash'>
): string {
  const canonicalEvent = {
    version: AUDIT_CHAIN_VERSION,
    sequence: event.chainSequence,
    previousHash: event.previousHash,
    id: event.id,
    organizationId: event.organizationId,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata: event.metadata ?? {},
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
    createdAt: event.createdAt,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(canonicalEvent)))
    .digest('hex');
}

export function verifyAuditChain(
  organizationId: string,
  rows: Array<Record<string, unknown>>
): AuditChainVerification {
  const chainRows = rows.filter(
    (row) => row.chain_sequence !== null && row.chain_sequence !== undefined
  ).sort((a, b) => Number(a.chain_sequence) - Number(b.chain_sequence));
  const legacyEvents = rows.length - chainRows.length;
  let expectedPreviousHash = auditChainGenesisHash(organizationId);

  for (let index = 0; index < chainRows.length; index++) {
    const row = chainRows[index];
    const expectedSequence = index + 1;
    const createdAt = new Date(String(row.created_at));
    if (!Number.isFinite(createdAt.getTime())) {
      return {
        organizationId,
        verifiedEvents: index,
        legacyEvents,
        valid: false,
        firstInvalidSequence: Number(row.chain_sequence),
      };
    }
    const event: Omit<AuditChainEntry, 'eventHash'> = {
      id: String(row.id),
      organizationId: String(row.organization_id),
      actorUserId: row.actor_user_id === null ? null : String(row.actor_user_id),
      action: String(row.action),
      resourceType: String(row.resource_type),
      resourceId: String(row.resource_id),
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      ipAddress: row.ip_address === null ? null : String(row.ip_address),
      userAgent: row.user_agent === null ? null : String(row.user_agent),
      createdAt: createdAt.toISOString(),
      chainSequence: Number(row.chain_sequence),
      previousHash: typeof row.previous_hash === 'string' ? row.previous_hash.trim() : '',
    };
    const expectedHash = calculateAuditEventHash(event);
    if (
      event.chainSequence !== expectedSequence ||
      event.previousHash !== expectedPreviousHash ||
      typeof row.event_hash !== 'string' ||
      row.event_hash.trim() !== expectedHash
    ) {
      return {
        organizationId,
        verifiedEvents: index,
        legacyEvents,
        valid: false,
        firstInvalidSequence: event.chainSequence,
      };
    }
    expectedPreviousHash = row.event_hash.trim();
  }

  return { organizationId, verifiedEvents: chainRows.length, legacyEvents, valid: true };
}

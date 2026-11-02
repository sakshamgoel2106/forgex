import { describe, expect, it } from 'vitest';
import {
  auditChainGenesisHash,
  calculateAuditEventHash,
  verifyAuditChain,
} from '../src/services/auditChain.js';

const organizationId = 'org-a';

function makeRow(
  sequence: number,
  previousHash: string,
  overrides: Record<string, unknown> = {}
) {
  const event = {
    id: `event-${sequence}`,
    organizationId,
    actorUserId: 'user-1',
    action: 'DOCUMENT_VIEWED',
    resourceType: 'DOCUMENT',
    resourceId: `document-${sequence}`,
    metadata: { nested: { z: 2, a: 1 }, sequence },
    ipAddress: null,
    userAgent: 'test',
    createdAt: new Date(`2026-11-02T10:00:0${sequence}.000Z`).toISOString(),
    chainSequence: sequence,
    previousHash,
  };
  return {
    id: event.id,
    organization_id: event.organizationId,
    actor_user_id: event.actorUserId,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId,
    metadata: event.metadata,
    ip_address: event.ipAddress,
    user_agent: event.userAgent,
    created_at: event.createdAt,
    chain_sequence: event.chainSequence,
    previous_hash: event.previousHash,
    event_hash: calculateAuditEventHash(event),
    ...overrides,
  };
}

describe('Audit event hash chain', () => {
  it('verifies a valid ordered chain and ignores explicitly legacy rows', () => {
    const genesis = auditChainGenesisHash(organizationId);
    const first = makeRow(1, genesis);
    const second = makeRow(2, first.event_hash);
    const legacy = { ...first, id: 'legacy', chain_sequence: null, previous_hash: null, event_hash: null };

    expect(verifyAuditChain(organizationId, [legacy, first, second])).toEqual({
      organizationId,
      verifiedEvents: 2,
      legacyEvents: 1,
      valid: true,
    });
  });

  it('rejects event-field tampering', () => {
    const first = makeRow(1, auditChainGenesisHash(organizationId), {
      metadata: { nested: { a: 1, z: 2 }, sequence: 999 },
    });

    const result = verifyAuditChain(organizationId, [first]);
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequence).toBe(1);
  });

  it('rejects chain gaps and altered previous hashes', () => {
    const first = makeRow(1, auditChainGenesisHash(organizationId));
    const second = makeRow(3, 'f'.repeat(64));

    const result = verifyAuditChain(organizationId, [first, second]);
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSequence).toBe(3);
  });

  it('canonicalizes nested metadata key order', () => {
    const first = makeRow(1, auditChainGenesisHash(organizationId));
    const reordered = {
      ...first,
      metadata: { sequence: 1, nested: { a: 1, z: 2 } },
    };

    expect(verifyAuditChain(organizationId, [reordered]).valid).toBe(true);
  });
});

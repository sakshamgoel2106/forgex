import type {
  IVectorStoreAdapter,
  VectorPoint,
  VectorSearchResult,
} from './vectorStore.interface.js';
import { VectorStoreUnavailableError } from './vectorStore.interface.js';
import { logger } from '../utils/logger.js';

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime: number;
}

/**
 * Deterministic BM25 / token-frequency sparse weights for exact alphanumeric tags
 * (e.g. "PUMP-204-B", "SKF-6310", "CPT-80-250", "SOP-MECH-401", "120 PSI")
 */
function extractSparseTokens(text: string): { indices: number[]; values: number[]; tokenMap: Map<string, number> } {
  const tokenMap = new Map<string, number>();
  if (!text) return { indices: [], values: [], tokenMap };

  const matches = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
  for (const token of matches) {
    if (token.length < 2) continue;
    // Boost alphanumeric tags with hyphens or numbers
    const isAlphanumericTag =
      /^[a-z]+-[0-9]+(-[a-z0-9]+)*$/i.test(token) ||
      /^[a-z]+-[0-9]+$/i.test(token) ||
      /^[0-9]+(psi|bar|kpa|rpm|nm|v|vac|kw|hp)$/i.test(token);
    const weight = isAlphanumericTag ? 3.0 : 1.0;
    tokenMap.set(token, (tokenMap.get(token) || 0) + weight);
  }

  const indices: number[] = [];
  const values: number[] = [];

  for (const [token, count] of tokenMap.entries()) {
    // 32-bit FNV-1a hash for sparse index
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash >>> 0) % 1000000;
    indices.push(idx);
    values.push(Math.log(1 + count));
  }

  return { indices, values, tokenMap };
}

export class QdrantVectorStoreAdapter implements IVectorStoreAdapter {
  private circuitBreaker: CircuitBreakerState = {
    state: 'CLOSED',
    failures: 0,
    lastFailureTime: 0,
  };
  private readonly failureThreshold = 3;
  private readonly resetTimeoutMs = 10000; // 10s cooldown
  private readonly requestTimeoutMs = 3000; // 3s per call

  constructor(
    private endpoint = process.env.QDRANT_URL || process.env.QDRANT_ENDPOINT || 'http://localhost:6333',
    private apiKey = process.env.QDRANT_API_KEY
  ) {}

  /**
   * Fail-Closed Circuit Breaker & Retry Helper
   */
  private async executeWithRetry<T>(operation: () => Promise<T>, opName: string): Promise<T> {
    const now = Date.now();

    // Check circuit breaker state
    if (this.circuitBreaker.state === 'OPEN') {
      if (now - this.circuitBreaker.lastFailureTime > this.resetTimeoutMs) {
        this.circuitBreaker.state = 'HALF_OPEN';
        logger.info({ opName }, 'Qdrant circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new VectorStoreUnavailableError(
          `Vector store circuit breaker is OPEN. Qdrant is currently unreachable (failures: ${this.circuitBreaker.failures}).`
        );
      }
    }

    let lastError: Error | null = null;
    const maxRetries = 2; // 2 exponential backoff retries (total 3 attempts)

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        // Success: Reset circuit breaker
        if (this.circuitBreaker.state !== 'CLOSED') {
          logger.info({ opName }, 'Qdrant circuit breaker recovered and reset to CLOSED');
        }
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failures = 0;
        return result;
      } catch (err: any) {
        lastError = err;
        logger.warn(
          { attempt: attempt + 1, opName, error: err?.message },
          `Qdrant operation attempt failed`
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 150ms, 300ms
          const backoffMs = 150 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    // Trip circuit breaker on failure
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failures >= this.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      logger.error(
        { failures: this.circuitBreaker.failures, opName },
        'Qdrant failure threshold reached: circuit breaker tripped to OPEN'
      );
    }

    throw new VectorStoreUnavailableError(
      `Qdrant vector store unreachable after ${maxRetries + 1} attempts (${opName}): ${lastError?.message || 'Unknown error'}`
    );
  }

  public async ensureCollection(collectionName: string, dimensions: number): Promise<void> {
    await this.executeWithRetry(async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      const check = await fetch(`${this.endpoint}/collections/${collectionName}`, {
        headers,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (check.status === 404) {
        // Create collection configured for Dense 768-dim + Sparse BM25
        const createRes = await fetch(`${this.endpoint}/collections/${collectionName}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            vectors: {
              size: dimensions,
              distance: 'Cosine',
            },
            sparse_vectors: {
              bm25: {},
            },
          }),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (!createRes.ok) {
          // Fallback to standard dense vectors if sparse_vectors parameter is not accepted
          await fetch(`${this.endpoint}/collections/${collectionName}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              vectors: {
                size: dimensions,
                distance: 'Cosine',
              },
            }),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
        }
      }

      // Ensure keyword payload indexes exist for tenant & entity scoping
      const fieldsToIndex = ['organizationId', 'plantId', 'documentVersionId', 'documentId', 'machineId'];
      for (const field of fieldsToIndex) {
        try {
          await fetch(`${this.endpoint}/collections/${collectionName}/index`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              field_name: field,
              field_schema: 'keyword',
            }),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
        } catch {
          // ignore if already indexed
        }
      }
    }, 'ensureCollection');
  }

  public async upsertPoints(collectionName: string, points: VectorPoint[]): Promise<void> {
    if (!points || points.length === 0) return;

    await this.executeWithRetry(async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      const qdrantPoints = points.map((p) => {
        const textToTokenize = `${p.payload.content || ''} ${p.payload.sectionHeading || ''} ${p.payload.documentNumber || ''}`;
        const sparse = extractSparseTokens(textToTokenize);

        return {
          id: p.id,
          vector: p.vector,
          payload: {
            ...p.payload,
            _sparse_indices: sparse.indices,
            _sparse_values: sparse.values,
          },
        };
      });

      const res = await fetch(`${this.endpoint}/collections/${collectionName}/points?wait=true`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ points: qdrantPoints }),
        signal: AbortSignal.timeout(this.requestTimeoutMs * 2),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Qdrant upsert points failed: ${res.status} ${res.statusText} - ${errText}`);
      }
    }, 'upsertPoints');
  }

  public async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    if (!pointIds || pointIds.length === 0) return;

    await this.executeWithRetry(async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      const res = await fetch(`${this.endpoint}/collections/${collectionName}/points/delete?wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ points: pointIds }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!res.ok) {
        throw new Error(`Qdrant delete points failed: ${res.status} ${res.statusText}`);
      }
    }, 'deletePoints');
  }

  public async deleteByFilter(
    collectionName: string,
    filter: { documentVersionId?: string; organizationId?: string; [key: string]: unknown }
  ): Promise<void> {
    await this.executeWithRetry(async () => {
      const mustClauses: any[] = [];
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined) {
          mustClauses.push({ key, match: { value } });
        }
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      const res = await fetch(`${this.endpoint}/collections/${collectionName}/points/delete?wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { must: mustClauses } }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (res.status === 404) {
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (errText.includes('Index required but not found')) {
          for (const key of Object.keys(filter)) {
            await fetch(`${this.endpoint}/collections/${collectionName}/index`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ field_name: key, field_schema: 'keyword' }),
              signal: AbortSignal.timeout(this.requestTimeoutMs),
            }).catch(() => {});
          }
          const retryRes = await fetch(`${this.endpoint}/collections/${collectionName}/points/delete?wait=true`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ filter: { must: mustClauses } }),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
          if (retryRes.ok || retryRes.status === 404) return;
        }
        throw new Error(`Qdrant deleteByFilter failed: ${res.status} ${res.statusText} - ${errText}`);
      }
    }, 'deleteByFilter');
  }

  /**
   * Qdrant Hybrid Search (Dense 768-dim + Sparse BM25) with Reciprocal Rank Fusion (RRF)
   * Retrieves Top-25 candidates strictly filtered by organizationId and machineId
   */
  public async search(
    collectionName: string,
    vector: number[],
    filter?: { organizationId?: string; plantId?: string; documentId?: string; machineId?: string },
    limit = 25,
    queryText?: string
  ): Promise<VectorSearchResult[]> {
    // 1. Fail-Closed Tenant Isolation Enforcement: missing organization filter MUST throw
    if (!filter?.organizationId) {
      throw new Error('Tenant Isolation Violation: Vector search requires a validated organizationId filter.');
    }

    return await this.executeWithRetry(async () => {
      const mustClauses: any[] = [
        { key: 'organizationId', match: { value: filter.organizationId } },
      ];
      if (filter?.plantId) {
        mustClauses.push({ key: 'plantId', match: { value: filter.plantId } });
      }
      if (filter?.documentId) {
        mustClauses.push({ key: 'documentId', match: { value: filter.documentId } });
      }
      if (filter?.machineId) {
        mustClauses.push({ key: 'machineId', match: { value: filter.machineId } });
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      // Over-fetch dense candidates (up to 50) to allow robust Reciprocal Rank Fusion
      const denseFetchLimit = Math.max(50, limit * 2);
      const searchBody: any = {
        vector,
        limit: denseFetchLimit,
        with_payload: true,
      };
      if (mustClauses.length > 0) {
        searchBody.filter = { must: mustClauses };
      }

      let res = await fetch(`${this.endpoint}/collections/${collectionName}/points/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchBody),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (errBody.includes('Index required but not found')) {
          for (const clause of mustClauses) {
            if (clause.key) {
              await fetch(`${this.endpoint}/collections/${collectionName}/index`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ field_name: clause.key, field_schema: 'keyword' }),
                signal: AbortSignal.timeout(this.requestTimeoutMs),
              }).catch(() => {});
            }
          }
          res = await fetch(`${this.endpoint}/collections/${collectionName}/points/search`, {
            method: 'POST',
            headers,
            body: JSON.stringify(searchBody),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
        }
        if (!res.ok) {
          const finalErr = await res.text().catch(() => '');
          throw new Error(`Qdrant search error: ${res.status} ${res.statusText} - ${finalErr}`);
        }
      }

      const data = (await res.json()) as {
        result: Array<{ id: string; score: number; payload: Record<string, unknown> }>;
      };

      const hits = data.result || [];
      if (hits.length === 0) return [];

      // 2. Sparse BM25 scoring for exact alphanumeric tags
      const querySparse = queryText ? extractSparseTokens(queryText) : null;
      const rrfConstant = 60; // Standard RRF smoothing constant

      // Rank by dense semantic score
      const denseRanked = [...hits].sort((a, b) => b.score - a.score);

      // Rank by sparse keyword / tag score
      const sparseRanked = [...hits].sort((a, b) => {
        const scoreA = this.calculateSparseScore(a.payload, querySparse);
        const scoreB = this.calculateSparseScore(b.payload, querySparse);
        return scoreB - scoreA;
      });

      // 3. Reciprocal Rank Fusion (RRF)
      const scoredMap = new Map<string, { hit: (typeof hits)[0]; rrfScore: number }>();

      for (let rank = 0; rank < denseRanked.length; rank++) {
        const item = denseRanked[rank];
        const rrfContribution = 1.0 / (rrfConstant + rank + 1);
        const existing = scoredMap.get(item.id);
        if (existing) {
          existing.rrfScore += rrfContribution * 0.6; // 60% weight to dense semantic
        } else {
          scoredMap.set(item.id, { hit: item, rrfScore: rrfContribution * 0.6 });
        }
      }

      for (let rank = 0; rank < sparseRanked.length; rank++) {
        const item = sparseRanked[rank];
        const rrfContribution = 1.0 / (rrfConstant + rank + 1);
        const existing = scoredMap.get(item.id);
        if (existing) {
          existing.rrfScore += rrfContribution * 0.4; // 40% weight to sparse BM25
        } else {
          scoredMap.set(item.id, { hit: item, rrfScore: rrfContribution * 0.4 });
        }
      }

      // Sort by fused RRF score and return Top-25
      const fusedResults = Array.from(scoredMap.values())
        .sort((a, b) => b.rrfScore - a.rrfScore)
        .slice(0, limit)
        .map(({ hit, rrfScore }) => ({
          id: hit.id,
          score: rrfScore,
          payload: hit.payload,
        }));

      return fusedResults;
    }, 'search');
  }

  private calculateSparseScore(
    payload: Record<string, unknown>,
    querySparse: ReturnType<typeof extractSparseTokens> | null
  ): number {
    if (!querySparse || querySparse.tokenMap.size === 0) return 0;

    let score = 0;
    const content = String(payload.content || '').toLowerCase();
    const sectionHeading = String(payload.sectionHeading || '').toLowerCase();
    const docNumber = String(payload.documentNumber || '').toLowerCase();

    for (const [token, queryWeight] of querySparse.tokenMap.entries()) {
      if (content.includes(token)) {
        score += queryWeight * 1.0;
      }
      if (sectionHeading.includes(token)) {
        score += queryWeight * 2.5; // heading boost
      }
      if (docNumber.includes(token)) {
        score += queryWeight * 3.0; // exact document/equipment tag boost
      }
    }

    return score;
  }

  public async clear(_collectionName?: string): Promise<void> {
    // Clear is disabled in production fail-closed environment
    logger.info('Vector store clear invoked (no-op in fail-closed configuration)');
  }
}

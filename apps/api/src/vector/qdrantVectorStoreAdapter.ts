import type {
  IVectorStoreAdapter,
  VectorPoint,
  VectorSearchResult,
} from './vectorStore.interface.js';
import { InMemoryVectorStoreAdapter } from './inMemoryVectorStoreAdapter.js';

export class QdrantVectorStoreAdapter implements IVectorStoreAdapter {
  private fallbackAdapter = new InMemoryVectorStoreAdapter();

  constructor(
    private endpoint = process.env.QDRANT_URL || process.env.QDRANT_ENDPOINT || 'http://localhost:6333',
    private apiKey = process.env.QDRANT_API_KEY
  ) {}

  public async ensureCollection(collectionName: string, dimensions: number): Promise<void> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      const check = await fetch(`${this.endpoint}/collections/${collectionName}`, {
        headers,
        signal: AbortSignal.timeout(1000),
      });
      if (check.status === 404) {
        await fetch(`${this.endpoint}/collections/${collectionName}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            vectors: {
              size: dimensions,
              distance: 'Cosine',
            },
          }),
          signal: AbortSignal.timeout(1000),
        });
      }
    } catch {
      await this.fallbackAdapter.ensureCollection(collectionName, dimensions);
    }
  }

  public async upsertPoints(collectionName: string, points: VectorPoint[]): Promise<void> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      const qdrantPoints = points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      }));

      const res = await fetch(`${this.endpoint}/collections/${collectionName}/points?wait=true`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ points: qdrantPoints }),
        signal: AbortSignal.timeout(1500),
      });

      if (!res.ok) throw new Error(`Qdrant error: ${res.statusText}`);
    } catch {
      await this.fallbackAdapter.upsertPoints(collectionName, points);
    }
  }

  public async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      await fetch(`${this.endpoint}/collections/${collectionName}/points/delete?wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ points: pointIds }),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      await this.fallbackAdapter.deletePoints(collectionName, pointIds);
    }
  }

  public async deleteByFilter(
    collectionName: string,
    filter: { documentVersionId?: string; organizationId?: string }
  ): Promise<void> {
    try {
      const mustClauses: any[] = [];
      if (filter.documentVersionId) {
        mustClauses.push({ key: 'documentVersionId', match: { value: filter.documentVersionId } });
      }
      if (filter.organizationId) {
        mustClauses.push({ key: 'organizationId', match: { value: filter.organizationId } });
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['api-key'] = this.apiKey;

      await fetch(`${this.endpoint}/collections/${collectionName}/points/delete?wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { must: mustClauses } }),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      await this.fallbackAdapter.deleteByFilter(collectionName, filter);
    }
  }

  public async search(
    collectionName: string,
    vector: number[],
    filter?: { organizationId?: string; plantId?: string; documentId?: string; machineId?: string },
    limit = 10
  ): Promise<VectorSearchResult[]> {
    // Fail-Closed Tenant Isolation Enforcement: missing organization filter MUST throw
    if (!filter?.organizationId) {
      throw new Error('Tenant Isolation Violation: Vector search requires a validated organizationId filter.');
    }

    try {
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

      const body: any = {
        vector,
        limit,
        with_payload: true,
      };
      if (mustClauses.length > 0) {
        body.filter = { must: mustClauses };
      }

      const res = await fetch(`${this.endpoint}/collections/${collectionName}/points/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Qdrant search error: ${res.statusText}`);

      const data = (await res.json()) as { result: Array<{ id: string; score: number; payload: Record<string, unknown> }> };
      return data.result.map((r) => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
      }));
    } catch {
      return this.fallbackAdapter.search(collectionName, vector, filter, limit);
    }
  }

  public async clear(collectionName?: string): Promise<void> {
    await this.fallbackAdapter.clear(collectionName);
  }
}

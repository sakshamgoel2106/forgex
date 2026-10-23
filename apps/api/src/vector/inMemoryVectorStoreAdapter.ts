import type {
  IVectorStoreAdapter,
  VectorPoint,
  VectorSearchResult,
} from './vectorStore.interface.js';

export class InMemoryVectorStoreAdapter implements IVectorStoreAdapter {
  private collections = new Map<string, Map<string, VectorPoint>>();

  public async ensureCollection(collectionName: string, _dimensions: number): Promise<void> {
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, new Map());
    }
  }

  public async upsertPoints(collectionName: string, points: VectorPoint[]): Promise<void> {
    await this.ensureCollection(collectionName, points[0]?.vector?.length || 1024);
    const col = this.collections.get(collectionName)!;
    for (const pt of points) {
      col.set(pt.id, pt);
    }
  }

  public async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    const col = this.collections.get(collectionName);
    if (!col) return;
    for (const id of pointIds) {
      col.delete(id);
    }
  }

  public async deleteByFilter(
    collectionName: string,
    filter: { documentVersionId?: string; organizationId?: string }
  ): Promise<void> {
    const col = this.collections.get(collectionName);
    if (!col) return;

    for (const [id, pt] of col.entries()) {
      let match = true;
      if (filter.documentVersionId && pt.payload.documentVersionId !== filter.documentVersionId) {
        match = false;
      }
      if (filter.organizationId && pt.payload.organizationId !== filter.organizationId) {
        match = false;
      }
      if (match) {
        col.delete(id);
      }
    }
  }

  public async search(
    collectionName: string,
    vector: number[],
    filter?: { organizationId?: string; plantId?: string; documentId?: string; machineId?: string },
    limit = 10,
    _queryText?: string
  ): Promise<VectorSearchResult[]> {
    // Fail-Closed Tenant Isolation Enforcement: missing organization filter MUST throw
    if (!filter?.organizationId) {
      throw new Error('Tenant Isolation Violation: Vector search requires a validated organizationId filter.');
    }

    const col = this.collections.get(collectionName);
    if (!col) return [];

    const results: VectorSearchResult[] = [];

    for (const pt of col.values()) {
      // Enforce authorized tenant isolation filter
      if (pt.payload.organizationId !== filter.organizationId) {
        continue;
      }
      if (filter?.plantId && pt.payload.plantId !== filter.plantId) {
        continue;
      }
      if (filter?.documentId && pt.payload.documentId !== filter.documentId) {
        continue;
      }
      if (filter?.machineId && pt.payload.machineId !== filter.machineId) {
        continue;
      }

      const score = this.cosineSimilarity(vector, pt.vector);
      results.push({
        id: pt.id,
        score,
        payload: pt.payload,
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  public async clear(collectionName?: string): Promise<void> {
    if (collectionName) {
      this.collections.delete(collectionName);
    } else {
      this.collections.clear();
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }
}

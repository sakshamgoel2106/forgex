/**
 * ForgeX AI — Vector Store Adapter Contract
 */

export interface VectorPoint {
  id: string; // UUID point ID
  vector: number[];
  payload: {
    organizationId: string;
    plantId: string;
    documentId: string;
    documentVersionId: string;
    pageNumber: number;
    chunkIndex: number;
    content: string;
    sectionHeading?: string | null;
    isTable: boolean;
    isFigure: boolean;
    extractionMethod: string;
    [key: string]: unknown;
  };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface IVectorStoreAdapter {
  ensureCollection(collectionName: string, dimensions: number): Promise<void>;
  upsertPoints(collectionName: string, points: VectorPoint[]): Promise<void>;
  deletePoints(collectionName: string, pointIds: string[]): Promise<void>;
  deleteByFilter(collectionName: string, filter: { documentVersionId?: string; organizationId?: string }): Promise<void>;
  search(
    collectionName: string,
    vector: number[],
    filter?: { organizationId?: string; plantId?: string; documentId?: string; machineId?: string },
    limit?: number
  ): Promise<VectorSearchResult[]>;
  clear(collectionName?: string): Promise<void>;
}

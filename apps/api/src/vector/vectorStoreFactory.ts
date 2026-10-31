import type { IVectorStoreAdapter } from './vectorStore.interface.js';
import { InMemoryVectorStoreAdapter } from './inMemoryVectorStoreAdapter.js';
import { QdrantVectorStoreAdapter } from './qdrantVectorStoreAdapter.js';

let defaultVectorStore: IVectorStoreAdapter | null = null;

export function createVectorStoreAdapter(): IVectorStoreAdapter {
  if (defaultVectorStore) return defaultVectorStore;

  const isTest = process.env.NODE_ENV === 'test' && !process.env.QDRANT_URL;
  const configuredProvider = process.env.VECTOR_STORE_PROVIDER || process.env.VECTOR_PROVIDER;

  // QDRANT_URL and QDRANT_API_KEY are optional (local Qdrant has no key).
  // If Qdrant is selected/present, QdrantVectorStoreAdapter handles automatic fallback
  // to InMemoryVectorStoreAdapter with a logged warning if Qdrant is unreachable.
  const shouldUseQdrant =
    configuredProvider === 'qdrant' ||
    configuredProvider === 'qdrant-local' ||
    configuredProvider === 'qdrant-cloud' ||
    Boolean(process.env.QDRANT_URL) ||
    (!isTest && configuredProvider !== 'local' && configuredProvider !== 'in-memory');

  if (shouldUseQdrant) {
    defaultVectorStore = new QdrantVectorStoreAdapter();
  } else {
    defaultVectorStore = new InMemoryVectorStoreAdapter();
  }

  return defaultVectorStore;
}

export function setVectorStoreAdapter(adapter: IVectorStoreAdapter): void {
  defaultVectorStore = adapter;
}

export function resetVectorStoreAdapter(): void {
  defaultVectorStore = null;
}

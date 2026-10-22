import type { IVectorStoreAdapter } from './vectorStore.interface.js';
import { InMemoryVectorStoreAdapter } from './inMemoryVectorStoreAdapter.js';
import { QdrantVectorStoreAdapter } from './qdrantVectorStoreAdapter.js';

let defaultVectorStore: IVectorStoreAdapter | null = null;

export function createVectorStoreAdapter(): IVectorStoreAdapter {
  if (defaultVectorStore) return defaultVectorStore;

  const isTest = process.env.NODE_ENV === 'test';
  const provider =
    process.env.VECTOR_STORE_PROVIDER ||
    (isTest ? 'local' : (process.env.QDRANT_URL && !process.env.QDRANT_URL.includes('localhost') ? 'qdrant' : 'local'));

  if (provider === 'qdrant') {
    defaultVectorStore = new QdrantVectorStoreAdapter();
  } else {
    defaultVectorStore = new InMemoryVectorStoreAdapter();
  }

  return defaultVectorStore;
}

export function setVectorStoreAdapter(adapter: IVectorStoreAdapter): void {
  defaultVectorStore = adapter;
}

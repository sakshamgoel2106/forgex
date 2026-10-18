import type { IEmbeddingAdapter } from './embeddings.interface.js';
import { LocalDevEmbeddingAdapter } from './localDevEmbeddingAdapter.js';
import { OllamaEmbeddingAdapter } from './ollamaEmbeddingAdapter.js';

let defaultEmbeddingAdapter: IEmbeddingAdapter | null = null;

export function createEmbeddingAdapter(): IEmbeddingAdapter {
  if (defaultEmbeddingAdapter) return defaultEmbeddingAdapter;

  const provider = process.env.EMBEDDING_PROVIDER || 'local';

  if (provider === 'ollama') {
    defaultEmbeddingAdapter = new OllamaEmbeddingAdapter();
  } else {
    defaultEmbeddingAdapter = new LocalDevEmbeddingAdapter();
  }

  return defaultEmbeddingAdapter;
}

export function setEmbeddingAdapter(adapter: IEmbeddingAdapter): void {
  defaultEmbeddingAdapter = adapter;
}

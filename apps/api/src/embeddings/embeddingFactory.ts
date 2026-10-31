import type { IEmbeddingAdapter } from './embeddings.interface.js';
import { LocalDevEmbeddingAdapter } from './localDevEmbeddingAdapter.js';
import { OllamaEmbeddingAdapter } from './ollamaEmbeddingAdapter.js';
import { LlmProviderEmbeddingAdapter } from './llmProviderEmbeddingAdapter.js';

let defaultEmbeddingAdapter: IEmbeddingAdapter | null = null;

export function createEmbeddingAdapter(): IEmbeddingAdapter {
  if (defaultEmbeddingAdapter) return defaultEmbeddingAdapter;

  const provider = process.env.EMBEDDING_PROVIDER;

  if (provider === 'ollama') {
    defaultEmbeddingAdapter = new OllamaEmbeddingAdapter();
  } else if (provider === 'local') {
    defaultEmbeddingAdapter = new LocalDevEmbeddingAdapter();
  } else {
    // Default: read dynamic dimensionality and model directly from the active LlmProvider
    defaultEmbeddingAdapter = new LlmProviderEmbeddingAdapter();
  }

  return defaultEmbeddingAdapter;
}

export function setEmbeddingAdapter(adapter: IEmbeddingAdapter): void {
  defaultEmbeddingAdapter = adapter;
}

export function resetEmbeddingAdapter(): void {
  defaultEmbeddingAdapter = null;
}

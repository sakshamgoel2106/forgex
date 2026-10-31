import crypto from 'node:crypto';
import type { IEmbeddingAdapter } from './embeddings.interface.js';
import type { LlmProvider } from '../providers/llm/llm.interface.js';
import { getLlmProvider } from '../providers/llm/index.js';
import { logger } from '../utils/logger.js';

/**
 * Universal Embedding Adapter backed directly by the active LlmProvider.
 * Dynamically provides the exact vector dimensionality required by Qdrant (e.g. 768, 1024, 1536).
 */
export class LlmProviderEmbeddingAdapter implements IEmbeddingAdapter {
  constructor(private provider: LlmProvider = getLlmProvider()) {}

  public getDimensions(): number {
    return this.provider.embeddingDimension;
  }

  public getModelName(): string {
    return this.provider.name;
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text]);
    return results[0] || new Array(this.getDimensions()).fill(0);
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];
    try {
      const embeddings = await this.provider.embed(texts);
      if (embeddings && embeddings.length === texts.length && embeddings[0]?.length === this.getDimensions()) {
        return embeddings;
      }
    } catch (err: any) {
      logger.warn(
        { provider: this.provider.name, error: err?.message },
        'Embedding generation from provider failed; using deterministic fallback'
      );
    }

    // Deterministic fallback matching exact provider dimension
    const dim = this.getDimensions();
    return texts.map((txt) => {
      const vector = new Array<number>(dim).fill(0);
      const hash = crypto.createHash('sha256').update(txt).digest();
      for (let i = 0; i < dim; i++) {
        const byte = hash[i % hash.length];
        vector[i] = (byte / 127.5) - 1.0;
      }
      // Normalize
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
      return vector.map((v) => Number((v / norm).toFixed(6)));
    });
  }
}

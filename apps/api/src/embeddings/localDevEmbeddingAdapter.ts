import crypto from 'node:crypto';
import type { IEmbeddingAdapter } from './embeddings.interface.js';

export class LocalDevEmbeddingAdapter implements IEmbeddingAdapter {
  private dimensions: number;
  private modelName: string;
  private shouldFailNext: boolean = false;

  constructor(dimensions = 1024, modelName = 'bge-m3-local-dev') {
    this.dimensions = dimensions;
    this.modelName = modelName;
  }

  public setSimulateFailure(fail: boolean): void {
    this.shouldFailNext = fail;
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    if (this.shouldFailNext || text.includes('[SIMULATE_EMBEDDING_FAILURE]')) {
      throw new Error(`Embedding generation failed: Provider service unavailable or inference timeout.`);
    }

    // Deterministic pseudo-embedding from text hash
    const vector = new Array<number>(this.dimensions).fill(0);
    const hash = crypto.createHash('sha256').update(text).digest();

    for (let i = 0; i < this.dimensions; i++) {
      const byte = hash[i % hash.length];
      const sign = (byte & 1) === 0 ? 1 : -1;
      const charCode = text.charCodeAt(i % Math.max(1, text.length)) || 32;
      vector[i] = sign * ((byte + charCode) / 512);
    }

    // L2 Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vector.map((val) => val / norm) : vector;
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const t of texts) {
      results.push(await this.generateEmbedding(t));
    }
    return results;
  }

  public getDimensions(): number {
    return this.dimensions;
  }

  public getModelName(): string {
    return this.modelName;
  }
}

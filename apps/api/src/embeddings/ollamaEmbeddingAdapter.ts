import type { IEmbeddingAdapter } from './embeddings.interface.js';
import { LocalDevEmbeddingAdapter } from './localDevEmbeddingAdapter.js';

export class OllamaEmbeddingAdapter implements IEmbeddingAdapter {
  private fallbackAdapter: LocalDevEmbeddingAdapter;

  constructor(
    private endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
    private model = process.env.OLLAMA_EMBED_MODEL || 'bge-m3'
  ) {
    this.fallbackAdapter = new LocalDevEmbeddingAdapter(1024, model);
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      return data.embedding;
    } catch {
      // In air-gapped test or when local daemon is not running, fall back to deterministic local dev embedding
      return this.fallbackAdapter.generateEmbedding(text);
    }
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const t of texts) {
      results.push(await this.generateEmbedding(t));
    }
    return results;
  }

  public getDimensions(): number {
    return 1024;
  }

  public getModelName(): string {
    return this.model;
  }
}

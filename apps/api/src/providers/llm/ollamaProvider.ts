import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmHealthCheckResult,
} from './llm.interface.js';
import { guardedFetch } from '../../utils/outboundGuard.js';
import { logger } from '../../utils/logger.js';

export class OllamaProvider implements LlmProvider {
  public readonly name = 'ollama';
  public readonly embeddingDimension: number;

  private baseUrl: string;
  private chatModel: string;
  private visionModel: string;
  private embedModel: string;

  constructor() {
    this.baseUrl = (
      process.env.OLLAMA_BASE_URL ||
      process.env.OLLAMA_ENDPOINT ||
      'http://localhost:11434'
    ).replace(/\/+$/, '');
    this.chatModel = process.env.LLM_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2';
    this.visionModel = process.env.LLM_VISION_MODEL || process.env.OLLAMA_VISION_MODEL || 'llava';
    this.embedModel = process.env.EMBED_MODEL || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    this.embeddingDimension = parseInt(process.env.EMBED_DIMENSION || '768', 10);
  }

  public async generate(prompt: string, options?: LlmGenerateOptions): Promise<string> {
    const endpoint = `${this.baseUrl}/api/generate`;
    const timeoutMs = options?.timeoutMs || 25000;

    const payload: any = {
      model: this.chatModel,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.2,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    if (options?.systemPrompt) {
      payload.system = options.systemPrompt;
    }

    if (options?.jsonMode) {
      payload.format = 'json';
    }

    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama generation failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    return data.response || '';
  }

  public async generateWithImage(
    prompt: string,
    imageBase64: string,
    _mimeType = 'image/jpeg',
    options?: LlmGenerateOptions
  ): Promise<string> {
    const endpoint = `${this.baseUrl}/api/generate`;
    const timeoutMs = options?.timeoutMs || 30000;
    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');

    const payload: any = {
      model: this.visionModel,
      prompt,
      images: [cleanBase64],
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    if (options?.systemPrompt) {
      payload.system = options.systemPrompt;
    }

    if (options?.jsonMode) {
      payload.format = 'json';
    }

    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama vision failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    return data.response || '';
  }

  public async embed(text: string): Promise<number[]>;
  public async embed(texts: string[]): Promise<number[][]>;
  public async embed(textOrTexts: string | string[]): Promise<number[] | number[][]> {
    if (Array.isArray(textOrTexts)) {
      const results: number[][] = [];
      for (const t of textOrTexts) {
        results.push(await this.embedSingle(t));
      }
      return results;
    }
    return this.embedSingle(textOrTexts);
  }

  private async embedSingle(text: string): Promise<number[]> {
    try {
      // Modern Ollama embed endpoint
      const embedRes = await guardedFetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          input: text,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (embedRes.ok) {
        const json = (await embedRes.json()) as any;
        const vec = json.embeddings?.[0];
        if (Array.isArray(vec) && vec.length > 0) {
          return vec;
        }
      }

      // Fallback to legacy /api/embeddings endpoint
      const legacyRes = await guardedFetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          prompt: text,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (legacyRes.ok) {
        const json = (await legacyRes.json()) as any;
        if (Array.isArray(json.embedding) && json.embedding.length > 0) {
          return json.embedding;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Ollama embedding call failed; generating deterministic vector');
    }

    return this.generateDeterministicVector(text);
  }

  private generateDeterministicVector(text: string): number[] {
    const vector = new Array<number>(this.embeddingDimension).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
      vector[Math.abs(hash) % this.embeddingDimension] += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  public async healthCheck(): Promise<LlmHealthCheckResult> {
    const startTime = Date.now();
    try {
      const res = await guardedFetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) {
        return {
          healthy: false,
          provider: this.name,
          model: this.chatModel,
          latencyMs: Date.now() - startTime,
          message: `Ollama returned status ${res.status}`,
        };
      }

      const json = (await res.json()) as any;
      return {
        healthy: true,
        provider: this.name,
        model: `${this.chatModel} (Ollama v${json.version || 'installed'})`,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        healthy: false,
        provider: this.name,
        model: this.chatModel,
        latencyMs: Date.now() - startTime,
        message: err?.message || 'Could not connect to Ollama daemon',
      };
    }
  }
}

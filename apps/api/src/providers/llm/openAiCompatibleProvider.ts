import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmHealthCheckResult,
} from './llm.interface.js';
import { guardedFetch } from '../../utils/outboundGuard.js';
import { logger } from '../../utils/logger.js';

export class OpenAiCompatibleProvider implements LlmProvider {
  public readonly name = 'vllm';
  public readonly embeddingDimension: number;

  private baseUrl: string;
  private apiKey?: string;
  private chatModel: string;
  private visionModel: string;
  private embedModel: string;

  constructor() {
    this.baseUrl = (
      process.env.VLLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'http://localhost:8000/v1'
    ).replace(/\/+$/, '');
    this.apiKey = process.env.VLLM_API_KEY || process.env.OPENAI_API_KEY;
    this.chatModel = process.env.LLM_MODEL || process.env.VLLM_MODEL || 'meta-llama/Llama-3.2-3B-Instruct';
    this.visionModel = process.env.LLM_VISION_MODEL || process.env.VLLM_VISION_MODEL || this.chatModel;
    this.embedModel = process.env.EMBED_MODEL || process.env.VLLM_EMBED_MODEL || 'text-embedding-3-small';
    this.embeddingDimension = parseInt(process.env.EMBED_DIMENSION || '1536', 10);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  public async generate(prompt: string, options?: LlmGenerateOptions): Promise<string> {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const timeoutMs = options?.timeoutMs || 20000;

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const payload: any = {
      model: this.chatModel,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`vLLM/OpenAI generation failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content || '';
  }

  public async generateWithImage(
    prompt: string,
    imageBase64: string,
    mimeType = 'image/jpeg',
    options?: LlmGenerateOptions
  ): Promise<string> {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const timeoutMs = options?.timeoutMs || 25000;
    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
    const dataUri = `data:${mimeType};base64,${cleanBase64}`;

    const messages: Array<{ role: string; content: any }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    });

    const payload: any = {
      model: this.visionModel,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`vLLM/OpenAI vision failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content || '';
  }

  public async embed(text: string): Promise<number[]>;
  public async embed(texts: string[]): Promise<number[][]>;
  public async embed(textOrTexts: string | string[]): Promise<number[] | number[][]> {
    try {
      const endpoint = `${this.baseUrl}/embeddings`;
      const input = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];

      const res = await guardedFetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.embedModel,
          input,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        const dataArr = json.data;
        if (Array.isArray(dataArr) && dataArr.length > 0) {
          if (Array.isArray(textOrTexts)) {
            return dataArr.map((d: any) => d.embedding);
          }
          return dataArr[0].embedding;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'vLLM/OpenAI embedding failed; falling back to deterministic vector');
    }

    if (Array.isArray(textOrTexts)) {
      return textOrTexts.map((t) => this.generateDeterministicVector(t));
    }
    return this.generateDeterministicVector(textOrTexts);
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
      const res = await guardedFetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        return {
          healthy: false,
          provider: this.name,
          model: this.chatModel,
          latencyMs: Date.now() - startTime,
          message: `vLLM/OpenAI endpoint returned status ${res.status}`,
        };
      }

      return {
        healthy: true,
        provider: this.name,
        model: this.chatModel,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        healthy: false,
        provider: this.name,
        model: this.chatModel,
        latencyMs: Date.now() - startTime,
        message: err?.message || 'vLLM/OpenAI endpoint unreachable',
      };
    }
  }
}

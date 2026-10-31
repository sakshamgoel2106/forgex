import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmHealthCheckResult,
} from './llm.interface.js';
import { guardedFetch } from '../../utils/outboundGuard.js';
import { logger } from '../../utils/logger.js';

export class GeminiProvider implements LlmProvider {
  public readonly name = 'gemini';
  public readonly embeddingDimension: number;

  private apiKey: string;
  private chatModel: string;
  private visionModel: string;
  private embeddingModel: string;

  constructor() {
    this.apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.CLOUD_AI_API_KEY ||
      process.env.LLM_API_KEY ||
      '';
    this.chatModel = process.env.CLOUD_AI_MODEL || process.env.LLM_MODEL || 'gemini-2.5-flash';
    this.visionModel = process.env.CLOUD_VISION_MODEL || 'gemini-2.5-flash';
    this.embeddingModel = process.env.EMBEDDING_MODEL || process.env.EMBED_MODEL || 'text-embedding-004';
    this.embeddingDimension = parseInt(process.env.EMBED_DIMENSION || '768', 10);
  }

  public async generate(prompt: string, options?: LlmGenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required for GeminiProvider text generation.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.chatModel}:generateContent?key=${this.apiKey}`;
    const timeoutMs = options?.timeoutMs || 10000;

    const payload: any = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? 2048,
      },
    };

    if (options?.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    if (options?.jsonMode) {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini generateContent failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0]?.text;
    return textPart || '';
  }

  public async generateWithImage(
    prompt: string,
    imageBase64: string,
    mimeType = 'image/jpeg',
    options?: LlmGenerateOptions
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required for GeminiProvider vision analysis.');
    }

    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.visionModel}:generateContent?key=${this.apiKey}`;
    const timeoutMs = options?.timeoutMs || 12000;

    const payload: any = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.1,
        maxOutputTokens: options?.maxTokens ?? 2048,
      },
    };

    if (options?.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    if (options?.jsonMode) {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini vision generateContent failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  public async embed(text: string): Promise<number[]>;
  public async embed(texts: string[]): Promise<number[][]>;
  public async embed(textOrTexts: string | string[]): Promise<number[] | number[][]> {
    if (!this.apiKey) {
      // Deterministic fallback when key absent in dev
      if (Array.isArray(textOrTexts)) {
        return textOrTexts.map((t) => this.generateDeterministicVector(t));
      }
      return this.generateDeterministicVector(textOrTexts);
    }

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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`;
    const res = await guardedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text }] },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.warn({ err }, 'Gemini embedding API call failed; using deterministic vector');
      return this.generateDeterministicVector(text);
    }

    const json = (await res.json()) as any;
    const values = json.embedding?.values;
    if (Array.isArray(values) && values.length > 0) {
      return values;
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
      if (!this.apiKey) {
        return {
          healthy: false,
          provider: this.name,
          model: this.chatModel,
          latencyMs: 0,
          message: 'GEMINI_API_KEY not configured.',
        };
      }

      await this.generate('Ping. Respond with OK.', { maxTokens: 4, timeoutMs: 4000 });
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
        message: err?.message || 'Gemini ping failed',
      };
    }
  }
}

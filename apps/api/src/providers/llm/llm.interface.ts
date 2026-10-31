/**
 * ForgeX AI — Core LLM Provider Interface
 * Standardizes text generation, multimodal vision inference, and vector embeddings
 * across Gemini (Cloud SaaS), Ollama (Air-Gapped Enterprise), vLLM / OpenAI, and Mock.
 */

export interface LlmGenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface LlmHealthCheckResult {
  healthy: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  status?: string;
  details?: Record<string, unknown>;
  message?: string;
}

export interface LlmProvider {
  /**
   * Human-readable identifier for provider (e.g. 'gemini', 'ollama', 'vllm', 'mock')
   */
  readonly name: string;

  /**
   * The fixed or configured vector dimension produced by this provider's embed()
   */
  readonly embeddingDimension: number;

  /**
   * Generates a text response from an LLM prompt
   */
  generate(prompt: string, options?: LlmGenerateOptions): Promise<string>;

  /**
   * Generates analysis for an image + text prompt (e.g. gauge needle, LOTO lock, P&ID)
   */
  generateWithImage(
    prompt: string,
    imageBase64: string,
    mimeType?: string,
    options?: LlmGenerateOptions
  ): Promise<string>;

  /**
   * Generates dense vector embeddings for single or batch texts
   */
  embed(text: string): Promise<number[]>;
  embed(texts: string[]): Promise<number[][]>;
  embed(textOrTexts: string | string[]): Promise<number[] | number[][]>;

  /**
   * Performs an active health check against the model endpoint
   */
  healthCheck(): Promise<LlmHealthCheckResult>;
}

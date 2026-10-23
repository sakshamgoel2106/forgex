import type {
  IMultimodalGenerationProvider,
  IRerankingProvider,
} from './ai.interface.js';
import { LocalDevInferenceAdapter } from './localDevInferenceAdapter.js';
import { OllamaEnterpriseAdapter } from './ollamaEnterpriseAdapter.js';
import { CloudSaasAdapter } from './cloudSaasAdapter.js';
import { CrossEncoderReranker } from './reranker.js';
import { config } from '../config/env.js';

let defaultGenerationProvider: IMultimodalGenerationProvider | null = null;
let defaultRerankingProvider: IRerankingProvider | null = null;

export function createGenerationProvider(): IMultimodalGenerationProvider {
  if (defaultGenerationProvider) return defaultGenerationProvider;

  const mode = process.env.INFERENCE_PROVIDER || config.INFERENCE_PROVIDER || 'local';

  // Strict Enterprise Air-Gap Guarantee
  if (config.DEPLOYMENT_MODE === 'enterprise' || config.AIR_GAPPED_MODE) {
    if (mode === 'saas' || mode === 'cloud' || mode === 'openai' || mode === 'azure' || mode === 'gemini') {
      throw new Error(
        'Enterprise Air-Gap Policy: Cloud inference is strictly prohibited in Enterprise deployment mode.'
      );
    }
    if (mode === 'ollama') {
      defaultGenerationProvider = new OllamaEnterpriseAdapter(config.OLLAMA_BASE_URL, config.OLLAMA_DEFAULT_MODEL);
    } else {
      defaultGenerationProvider = new LocalDevInferenceAdapter();
    }
    return defaultGenerationProvider;
  }

  // SaaS Cloud Mode: Cloud provider enabled ONLY through explicit configuration
  if (config.DEPLOYMENT_MODE === 'saas') {
    if (mode === 'saas' || mode === 'cloud' || mode === 'openai' || mode === 'azure' || mode === 'gemini') {
      defaultGenerationProvider = new CloudSaasAdapter(config.CLOUD_AI_API_KEY, config.CLOUD_AI_MODEL);
      return defaultGenerationProvider;
    }
    // If not explicitly configured, use local dev deterministic provider without leaking data
    defaultGenerationProvider = new LocalDevInferenceAdapter();
    return defaultGenerationProvider;
  }

  // Local Dev / Default
  if (mode === 'ollama') {
    defaultGenerationProvider = new OllamaEnterpriseAdapter(config.OLLAMA_BASE_URL, config.OLLAMA_DEFAULT_MODEL);
  } else if (mode === 'saas' || mode === 'cloud' || mode === 'gemini') {
    defaultGenerationProvider = new CloudSaasAdapter(config.CLOUD_AI_API_KEY, config.CLOUD_AI_MODEL);
  } else {
    defaultGenerationProvider = new LocalDevInferenceAdapter();
  }

  return defaultGenerationProvider;
}

export function setGenerationProvider(provider: IMultimodalGenerationProvider): void {
  defaultGenerationProvider = provider;
}

export function resetGenerationProvider(): void {
  defaultGenerationProvider = null;
}

export function createRerankingProvider(): IRerankingProvider {
  if (defaultRerankingProvider) return defaultRerankingProvider;
  defaultRerankingProvider = new CrossEncoderReranker();
  return defaultRerankingProvider;
}

export function setRerankingProvider(provider: IRerankingProvider): void {
  defaultRerankingProvider = provider;
}

export function resetRerankingProvider(): void {
  defaultRerankingProvider = null;
}


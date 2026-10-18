import type {
  IMultimodalGenerationProvider,
  IRerankingProvider,
} from './ai.interface.js';
import { LocalDevInferenceAdapter } from './localDevInferenceAdapter.js';
import { OllamaEnterpriseAdapter } from './ollamaEnterpriseAdapter.js';
import { CloudSaasAdapter } from './cloudSaasAdapter.js';
import { ReciprocalRankFusionReranker } from './reranker.js';

let defaultGenerationProvider: IMultimodalGenerationProvider | null = null;
let defaultRerankingProvider: IRerankingProvider | null = null;

export function createGenerationProvider(): IMultimodalGenerationProvider {
  if (defaultGenerationProvider) return defaultGenerationProvider;

  const mode = process.env.INFERENCE_PROVIDER || 'local';

  if (mode === 'ollama') {
    defaultGenerationProvider = new OllamaEnterpriseAdapter();
  } else if (mode === 'saas' || mode === 'cloud') {
    defaultGenerationProvider = new CloudSaasAdapter();
  } else {
    defaultGenerationProvider = new LocalDevInferenceAdapter();
  }

  return defaultGenerationProvider;
}

export function setGenerationProvider(provider: IMultimodalGenerationProvider): void {
  defaultGenerationProvider = provider;
}

export function createRerankingProvider(): IRerankingProvider {
  if (defaultRerankingProvider) return defaultRerankingProvider;
  defaultRerankingProvider = new ReciprocalRankFusionReranker();
  return defaultRerankingProvider;
}

export function setRerankingProvider(provider: IRerankingProvider): void {
  defaultRerankingProvider = provider;
}

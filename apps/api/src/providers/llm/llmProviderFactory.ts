import type { LlmProvider } from './llm.interface.js';
import { GeminiProvider } from './geminiProvider.js';
import { OllamaProvider } from './ollamaProvider.js';
import { OpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import { MockProvider } from './mockProvider.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';

let defaultLlmProvider: LlmProvider | null = null;

export function createLlmProvider(): LlmProvider {
  const deployment = getDeploymentConfig();
  const rawAiProvider = (
    process.env.AI_PROVIDER ||
    process.env.INFERENCE_PROVIDER ||
    deployment.aiProvider ||
    (deployment.mode === 'enterprise' ? 'ollama' : 'gemini')
  ).toLowerCase().trim();

  logger.info(
    {
      selectedProvider: rawAiProvider,
      deploymentMode: deployment.mode,
      allowExternalNetwork: deployment.allowExternalNetwork,
    },
    'Initializing LLM Provider'
  );

  switch (rawAiProvider) {
    case 'gemini':
    case 'google':
    case 'cloud':
    case 'saas':
      return new GeminiProvider();

    case 'ollama':
    case 'local':
      return new OllamaProvider();

    case 'vllm':
    case 'openai':
      return new OpenAiCompatibleProvider();

    case 'mock':
    case 'test':
      return new MockProvider();

    default:
      if (deployment.mode === 'enterprise') {
        logger.info({ fallback: 'ollama' }, 'Defaulting to OllamaProvider for Enterprise mode');
        return new OllamaProvider();
      }
      return new GeminiProvider();
  }
}

export function getLlmProvider(): LlmProvider {
  if (!defaultLlmProvider) {
    defaultLlmProvider = createLlmProvider();
  }
  return defaultLlmProvider;
}

export function setLlmProvider(provider: LlmProvider | null): void {
  defaultLlmProvider = provider;
}

import type { IVisionProcessingProvider } from './vision.interface.js';
import { LocalDevVisionAdapter } from './localDevVisionAdapter.js';
import { OllamaEnterpriseVisionAdapter } from './ollamaEnterpriseVisionAdapter.js';
import { CloudVisionAdapter } from './cloudVisionAdapter.js';

import { config } from '../config/env.js';

let defaultVisionProvider: IVisionProcessingProvider | null = null;

export function createVisionProvider(): IVisionProcessingProvider {
  if (defaultVisionProvider) return defaultVisionProvider;

  const mode = process.env.VISION_PROVIDER || process.env.INFERENCE_PROVIDER || 'local';

  // Strict Enterprise Air-Gap Guarantee
  if (config.DEPLOYMENT_MODE === 'enterprise' || config.AIR_GAPPED_MODE) {
    if (mode === 'saas' || mode === 'cloud') {
      throw new Error(
        'Enterprise Air-Gap Policy: Cloud vision provider is strictly prohibited in Enterprise air-gapped mode.'
      );
    }
    if (mode === 'ollama') {
      defaultVisionProvider = new OllamaEnterpriseVisionAdapter();
    } else {
      defaultVisionProvider = new LocalDevVisionAdapter();
    }
    return defaultVisionProvider;
  }

  if (mode === 'ollama') {
    defaultVisionProvider = new OllamaEnterpriseVisionAdapter();
  } else if (mode === 'saas' || mode === 'cloud') {
    defaultVisionProvider = new CloudVisionAdapter();
  } else {
    defaultVisionProvider = new LocalDevVisionAdapter();
  }

  return defaultVisionProvider;
}

export function setVisionProvider(provider: IVisionProcessingProvider): void {
  defaultVisionProvider = provider;
}

export function resetVisionProvider(): void {
  defaultVisionProvider = null;
}

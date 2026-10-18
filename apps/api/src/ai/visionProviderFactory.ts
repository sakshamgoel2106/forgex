import type { IVisionProcessingProvider } from './vision.interface.js';
import { LocalDevVisionAdapter } from './localDevVisionAdapter.js';
import { OllamaEnterpriseVisionAdapter } from './ollamaEnterpriseVisionAdapter.js';
import { CloudVisionAdapter } from './cloudVisionAdapter.js';

let defaultVisionProvider: IVisionProcessingProvider | null = null;

export function createVisionProvider(): IVisionProcessingProvider {
  if (defaultVisionProvider) return defaultVisionProvider;

  const mode = process.env.VISION_PROVIDER || process.env.INFERENCE_PROVIDER || 'local';

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

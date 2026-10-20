import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      DEPLOYMENT_MODE: 'local_dev',
      QDRANT_COLLECTION: 'forgex_knowledge',
      STORAGE_PROVIDER: 'local',
      INFERENCE_PROVIDER: 'local',
      AUTH_PROVIDER: 'local_dev',
    },
  },
});

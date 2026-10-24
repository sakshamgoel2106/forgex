import { createApp } from './app.js';
import { config, validateModeSpecificRequirements, getSanitizedConfig } from './config/env.js';
import { logger } from './utils/logger.js';

import { createDataStore } from './db/dataStoreFactory.js';
import { createStorageAdapter } from './storage/storageFactory.js';
import { createEmbeddingAdapter } from './embeddings/embeddingFactory.js';
import { createVectorStoreAdapter } from './vector/vectorStoreFactory.js';
import { bootstrapInitialData } from './db/bootstrapData.js';
import { startRcaRetentionWorker, stopRcaRetentionWorker } from './services/rcaRetentionWorker.js';

async function startServer() {
  // 1. Validate environment requirements for configured deployment mode
  try {
    validateModeSpecificRequirements(config);
    logger.info(
      { config: getSanitizedConfig(config) },
      'Deployment environment configuration validated successfully'
    );
  } catch (err: any) {
    logger.fatal({ err: err?.message }, 'Fatal environment configuration validation failure');
    process.exit(1);
  }

  // 2. Initialize DataStore with automated PostgreSQL migrations or dev fallback
  const { dataStore, pool } = await createDataStore(config);
  const storageAdapter = createStorageAdapter();
  const embeddingAdapter = createEmbeddingAdapter();
  const vectorStore = createVectorStoreAdapter();

  // 3. Ensure baseline demo organization is initialized strictly when explicitly enabled or in local development
  if (process.env.ALLOW_DEMO_BOOTSTRAP === 'true' || config.DEPLOYMENT_MODE === 'local_dev') {
    try {
      await bootstrapInitialData(dataStore, storageAdapter, embeddingAdapter, vectorStore);
      logger.info('Demo baseline data and user credentials initialized successfully');
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Initial bootstrap data seeding notice');
    }
  } else {
    logger.info('Clean database mode active: automatic demo seeding is disabled.');
  }

  // 4. Construct Express Application
  const app = createApp({
    dataStore,
    storageAdapter,
    embeddingAdapter,
    vectorStore,
  });

  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      {
        port: config.PORT,
        host: config.HOST,
        mode: config.DEPLOYMENT_MODE,
        env: config.NODE_ENV,
        authProvider: config.AUTH_PROVIDER,
        inferenceProvider: config.INFERENCE_PROVIDER,
        plantSite: config.PLANT_SITE_CODE,
      },
      '⚡ ForgeX AI Core API server online'
    );

    // 5. Start scheduled background workers (e.g. RCA data retention policy)
    startRcaRetentionWorker(dataStore);
  });

  // 6. Graceful shutdown handling
  let isShuttingDown = false;
  async function handleShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    stopRcaRetentionWorker();

    logger.info({ signal }, 'Termination signal received. Closing HTTP server cleanly...');
    server.close(async () => {
      logger.info('HTTP server closed.');
      if (pool) {
        try {
          await pool.end();
          logger.info('PostgreSQL connection pool closed.');
        } catch (poolErr) {
          logger.error({ err: poolErr }, 'Error closing PostgreSQL pool');
        }
      }
      process.exit(0);
    });

    // Force close after 10s if connections remain open
    setTimeout(() => {
      logger.error('Forced shutdown timeout exceeded. Terminating process.');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  process.on('uncaughtException', (err: any) => {
    logger.error({ err: err?.message, stack: err?.stack }, 'Uncaught exception caught by global safety handler');
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error({ reason: reason?.message || reason }, 'Unhandled promise rejection caught by global safety handler');
  });
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Unhandled error during server bootstrap');
  process.exit(1);
});

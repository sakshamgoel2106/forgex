import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    {
      port: config.PORT,
      host: config.HOST,
      env: config.NODE_ENV,
      plantSite: config.PLANT_SITE_CODE,
    },
    '⚡ ForgeX AI Core API server online'
  );
});

// Graceful shutdown handling
function handleShutdown(signal: string) {
  logger.info({ signal }, 'Termination signal received. Closing HTTP server cleanly...');
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close after 10s if sockets remain open
  setTimeout(() => {
    logger.error('Forced shutdown timeout exceeded. Terminating immediately.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

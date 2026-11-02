import { createApp } from '../app.js';
import { config } from '../config/env.js';
import { InMemoryDataStore } from './inMemoryDataStore.js';
import { seedHackathonDemo } from './hackathonDemo.js';
import { logger } from '../utils/logger.js';

if (config.NODE_ENV === 'production' || config.DEPLOYMENT_MODE !== 'local_dev') {
  throw new Error('The hackathon demo server is restricted to non-production local_dev mode.');
}

const dataStore = new InMemoryDataStore();
const summary = await seedHackathonDemo(dataStore);
const app = createApp({ dataStore });
const server = app.listen(config.PORT, '127.0.0.1', () => {
  logger.info(
    {
      organization: summary.organizationName,
      plantId: summary.plantId,
      machines: summary.machineCount,
      apiHost: '127.0.0.1',
      port: config.PORT,
    },
    'Local in-memory hackathon demo is ready'
  );
  console.log('\nHackathon demo accounts (local in-memory data; reset on restart):');
  console.table(summary.accounts);
});

function shutdown(): void {
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Failed to stop local hackathon demo server cleanly');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

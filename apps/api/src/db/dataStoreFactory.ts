import pg from 'pg';
import type { IDataStore } from './dataStore.interface.js';
import { InMemoryDataStore } from './inMemoryDataStore.js';
import { PgDataStore } from './pgDataStore.js';
import { runMigrations } from './migrationRunner.js';
import { logger } from '../utils/logger.js';
import type { EnvConfig } from '../config/env.js';

export interface DataStoreInitResult {
  dataStore: IDataStore;
  pool?: pg.Pool;
}

/**
 * Initializes the appropriate DataStore based on runtime configuration.
 * - In Production / SaaS / Enterprise: Connects to PostgreSQL via pg.Pool and executes schema migrations.
 * - In Local Development: Gracefully falls back to InMemoryDataStore if PostgreSQL is not active.
 */
export async function createDataStore(cfg: EnvConfig): Promise<DataStoreInitResult> {
  if (cfg.DATABASE_URL && cfg.DATABASE_URL.startsWith('postgres')) {
    try {
      let connString = cfg.DATABASE_URL;
      if (connString.includes('pooler.supabase.com:5432')) {
        connString = connString.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
      }

      const isSsl =
        connString.includes('sslmode=require') ||
        connString.includes('supabase') ||
        connString.includes('rds.amazonaws.com');

      const pool = new pg.Pool({
        connectionString: connString,
        ssl: isSsl ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      pool.on('connect', (client) => {
        client.query('SET search_path TO forgex, public');
      });

      // Verify PostgreSQL connectivity
      const client = await pool.connect();
      await client.query('SET search_path TO forgex, public');
      client.release();
      logger.info('Connected to PostgreSQL database');

      // Auto-run schema migrations
      try {
        const applied = await runMigrations(pool);
        if (applied.length > 0) {
          logger.info({ appliedCount: applied.length, applied }, 'Applied pending schema migrations on startup');
        } else {
          logger.info('Database schema verified up to date');
        }
      } catch (migErr: any) {
        logger.error({ err: migErr?.message }, 'Database migration failed');
        throw migErr;
      }

      return { dataStore: new PgDataStore(pool), pool };
    } catch (err: any) {
      if (cfg.NODE_ENV === 'production' && cfg.DEPLOYMENT_MODE !== 'local_dev') {
        logger.fatal({ err: err?.message }, 'Production PostgreSQL connection failed. Halting.');
        throw err;
      }
      logger.warn(
        { err: err?.message },
        'PostgreSQL connection unavailable; using InMemoryDataStore for local development'
      );
      return { dataStore: new InMemoryDataStore() };
    }
  }

  logger.info('No DATABASE_URL configured; using InMemoryDataStore');
  return { dataStore: new InMemoryDataStore() };
}

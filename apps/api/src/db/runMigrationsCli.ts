import pg from 'pg';
import { config } from '../config/env.js';
import { runMigrations } from './migrationRunner.js';
import { logger } from '../utils/logger.js';

async function main() {
  if (!config.DATABASE_URL) {
    logger.error('DATABASE_URL is not set. Cannot run migrations.');
    process.exit(1);
  }

  logger.info('Connecting to database to execute schema migrations...');
  const isSsl =
    config.DATABASE_URL.includes('sslmode=require') ||
    config.DATABASE_URL.includes('supabase') ||
    config.DATABASE_URL.includes('rds.amazonaws.com');

  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    const applied = await runMigrations(pool);
    logger.info(
      { appliedCount: applied.length, applied },
      'Schema migrations completed successfully.'
    );
    await pool.end();
    process.exit(0);
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Migration execution failed.');
    await pool.end();
    process.exit(1);
  }
}

main();

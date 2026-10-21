import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const appliedMigrations: string[] = [];

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS forgex;');
    await client.query('SET search_path TO forgex, public;');

    // Ensure migrations ledger exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure WORKER is permitted in organization_memberships_role_check
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage 
          WHERE table_name = 'organization_memberships' AND constraint_name = 'organization_memberships_role_check'
        ) THEN
          ALTER TABLE organization_memberships DROP CONSTRAINT organization_memberships_role_check;
        END IF;
        ALTER TABLE organization_memberships ADD CONSTRAINT organization_memberships_role_check 
        CHECK (role IN (
          'ORGANIZATION_OWNER',
          'ORGANIZATION_ADMIN',
          'PLANT_MANAGER',
          'ENGINEER',
          'TECHNICIAN',
          'VIEWER',
          'WORKER',
          'ENGINEER_TECHNICIAN'
        ));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    let migrationsDir = path.resolve(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      migrationsDir = path.resolve(__dirname, '../../src/db/migrations');
    }
    if (!fs.existsSync(migrationsDir)) {
      logger.warn({ migrationsDir }, 'Migrations directory not found');
      return [];
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const existing = await client.query(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [file]
      );

      if (existing.rows.length === 0) {
        logger.info({ migration: file }, 'Applying database migration...');
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          appliedMigrations.push(file);
          logger.info({ migration: file }, 'Successfully applied migration');
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error({ migration: file, err }, 'Failed to apply migration');
          throw err;
        }
      }
    }

    return appliedMigrations;
  } finally {
    client.release();
  }
}

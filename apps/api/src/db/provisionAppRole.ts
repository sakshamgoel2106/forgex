import pg from 'pg';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const appRole = process.env.FORGEX_APP_USER || 'forgex_app';
  const appPassword = process.env.FORGEX_APP_PASSWORD;
  const migrationRole = process.env.POSTGRES_USER || 'forgex_admin';
  if (!databaseUrl) throw new Error('DATABASE_URL must use the privileged migration account.');
  const validRoleName = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
  if (!validRoleName.test(appRole) || !validRoleName.test(migrationRole)) {
    throw new Error('FORGEX_APP_USER and POSTGRES_USER must be valid PostgreSQL role names.');
  }
  if (appRole === migrationRole) throw new Error('The API role must differ from the privileged migration role.');
  if (!appPassword || appPassword.length < 24) {
    throw new Error('FORGEX_APP_PASSWORD must be at least 24 characters.');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: '-c search_path=forgex,public',
  });
  try {
    const client = await pool.connect();
    try {
      const { rows: currentRole } = await client.query('SELECT current_user AS name');
      if (currentRole[0].name !== migrationRole) {
        throw new Error('DATABASE_URL must connect as the configured privileged POSTGRES_USER.');
      }
      const { rows } = await client.query(
        `SELECT format(
           CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
             THEN 'ALTER ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
             ELSE 'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
           END,
           $1, $2
         ) AS statement`,
        [appRole, appPassword]
      );
      await client.query(rows[0].statement);
      const { rows: revokeRole } = await client.query(
        'SELECT format(\'REVOKE %I FROM %I\', $1, $2) AS statement',
        [
        migrationRole,
        appRole,
        ]
      );
      await client.query(revokeRole[0].statement);
      const { rows: connectGrant } = await client.query(
        'SELECT format(\'GRANT CONNECT ON DATABASE %I TO %I\', current_database(), $1) AS statement',
        [appRole]
      );
      await client.query(connectGrant[0].statement);
      const quotedAppRole = `"${appRole}"`;
      const quotedMigrationRole = `"${migrationRole}"`;
      await client.query(`GRANT USAGE ON SCHEMA forgex TO ${quotedAppRole}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA forgex TO ${quotedAppRole}`
      );
      await client.query(
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA forgex TO ${quotedAppRole}`
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationRole} IN SCHEMA forgex
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedAppRole}`
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationRole} IN SCHEMA forgex
         GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quotedAppRole}`
      );
      await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON forgex.audit_events FROM PUBLIC`);
      await client.query(`REVOKE ALL ON forgex.audit_events FROM ${quotedAppRole}`);
      await client.query(
        `GRANT SELECT, INSERT ON forgex.audit_events TO ${quotedAppRole}`
      );
      await client.query(`REVOKE ALL ON forgex.schema_migrations FROM ${quotedAppRole}`);
      const { rows: unsafePrivileges } = await client.query(
        `SELECT
           has_table_privilege($1, 'forgex.audit_events', 'UPDATE') AS can_update,
           has_table_privilege($1, 'forgex.audit_events', 'DELETE') AS can_delete,
           has_table_privilege($1, 'forgex.audit_events', 'TRUNCATE') AS can_truncate,
           (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
            FROM pg_roles WHERE rolname = $1) AS elevated_role`,
        [appRole]
      );
      if (
        unsafePrivileges[0].can_update ||
        unsafePrivileges[0].can_delete ||
        unsafePrivileges[0].can_truncate ||
        unsafePrivileges[0].elevated_role
      ) {
        throw new Error(
          `Role '${appRole}' retains audit mutation or elevated privileges; resolve table ownership and role memberships before using it.`
        );
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log(`Provisioned least-privilege API role '${appRole}'; audit rows are read/insert only.`);
}

main().catch((error) => {
  console.error(`API database-role provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

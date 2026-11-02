import pg from 'pg';
import { verifyAuditChain } from '../services/auditChain.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set to verify persisted audit chains.');

  const organizationId = process.argv[2];
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: '-c search_path=forgex,public',
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.is_admin', 'true', false)");
    const organizations = organizationId
      ? [{ organization_id: organizationId }]
      : (
          await client.query(
            'SELECT DISTINCT organization_id FROM audit_events ORDER BY organization_id'
          )
        ).rows;

    let hasInvalidChain = false;
    for (const organization of organizations) {
      const result = await client.query(
        `SELECT id, organization_id, actor_user_id, action, resource_type, resource_id,
                metadata, ip_address, user_agent, created_at, chain_sequence, previous_hash, event_hash
         FROM audit_events
         WHERE organization_id = $1
         ORDER BY chain_sequence ASC NULLS FIRST, created_at ASC, id ASC`,
        [organization.organization_id]
      );
      const verification = verifyAuditChain(organization.organization_id, result.rows);
      console.log(JSON.stringify(verification));
      if (!verification.valid) hasInvalidChain = true;
    }

    if (hasInvalidChain) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Audit-chain verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

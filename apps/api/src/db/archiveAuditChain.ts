import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { verifyAuditChain } from '../services/auditChain.js';

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const bucket = process.env.AUDIT_WORM_BUCKET;
  const organizationId = process.argv[2];
  const retentionDays = Number(process.env.AUDIT_WORM_RETENTION_DAYS);

  if (!databaseUrl) throw new Error('DATABASE_URL must be set to archive audit chains.');
  if (!bucket) throw new Error('AUDIT_WORM_BUCKET must name a separately administered Object-Lock bucket.');
  if (!organizationId) throw new Error('Usage: pnpm --filter @forgex/api exec tsx src/db/archiveAuditChain.ts <organization-id>');
  if (process.env.AUDIT_ARCHIVE_CONFIRM !== 'YES') {
    throw new Error('Set AUDIT_ARCHIVE_CONFIRM=YES after approving export of this organization’s audit data.');
  }
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500) {
    throw new Error('AUDIT_WORM_RETENTION_DAYS must be an integer between 1 and 36500.');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: '-c search_path=forgex,public',
  });
  let temporaryDirectory: string | undefined;
  try {
    const client = await pool.connect();
    let rows;
    try {
      await client.query("SELECT set_config('app.is_admin', 'true', false)");
      const result = await client.query(
        `SELECT id, organization_id, actor_user_id, action, resource_type, resource_id,
                metadata, ip_address, user_agent, created_at, chain_sequence, previous_hash, event_hash
         FROM audit_events
         WHERE organization_id = $1
         ORDER BY chain_sequence ASC NULLS FIRST, created_at ASC, id ASC`,
        [organizationId]
      );
      rows = result.rows;
    } finally {
      client.release();
    }

    const verification = verifyAuditChain(organizationId, rows);
    if (!verification.valid) {
      throw new Error(`Refusing to archive invalid audit chain at sequence ${verification.firstInvalidSequence}.`);
    }
    if (verification.verifiedEvents === 0) {
      throw new Error('Refusing to archive an organization with no verified hash-chained events.');
    }

    const archiveTime = new Date();
    const retainUntil = new Date(archiveTime.getTime() + retentionDays * 86400000);
    const timestamp = archiveTime.toISOString().replace(/[:.]/g, '-');
    const objectKey = `forgex-audit/${organizationId}/${timestamp}.json`;
    const bundle = {
      format: 'forgex-audit-worm-bundle-v1',
      exportedAt: archiveTime.toISOString(),
      organizationId,
      verification,
      events: rows,
    };
    const body = `${JSON.stringify(bundle)}\n`;
    const checksum = crypto.createHash('sha256').update(body).digest('hex');

    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'forgex-audit-archive-'));
    const bundlePath = path.join(temporaryDirectory, 'audit-bundle.json');
    await writeFile(bundlePath, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

    const endpoint = process.env.AUDIT_ARCHIVE_ENDPOINT_URL;
    const commonArgs = endpoint ? ['--endpoint-url', endpoint] : [];
    const lockResult = await execFileAsync('aws', [
      's3api',
      'get-object-lock-configuration',
      '--bucket',
      bucket,
      ...commonArgs,
      '--output',
      'json',
    ]);
    const lockConfiguration = JSON.parse(lockResult.stdout) as {
      ObjectLockConfiguration?: { ObjectLockEnabled?: string };
    };
    if (lockConfiguration.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled') {
      throw new Error(`Bucket '${bucket}' does not report Object Lock enabled; no archive was uploaded.`);
    }

    await execFileAsync('aws', [
      's3api',
      'put-object',
      '--bucket',
      bucket,
      '--key',
      objectKey,
      '--body',
      bundlePath,
      '--content-type',
      'application/json',
      '--checksum-algorithm',
      'SHA256',
      '--object-lock-mode',
      'COMPLIANCE',
      '--object-lock-retain-until-date',
      retainUntil.toISOString(),
      ...commonArgs,
      '--output',
      'json',
    ]);

    console.log(JSON.stringify({
      bucket,
      objectKey,
      checksumSha256: checksum,
      retainUntil: retainUntil.toISOString(),
      ...verification,
    }));
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Audit WORM archive failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

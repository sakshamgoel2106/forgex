/**
 * ForgeX AI — Enterprise Air-Gapped Outbound Network Guard
 * Prevents unauthorized outbound egress traffic in Enterprise / Air-Gapped deployments.
 */

import { logger } from './logger.js';
import { getDeploymentConfig } from '../config/deployment.js';

let allowlistCache: Set<string> | null = null;
const originalFetch = globalThis.fetch;

/**
 * Extracts normalized hostname (ignoring port) from any URL string or host
 */
function extractHostname(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname.toLowerCase();
  } catch {
    // If not a full URL (e.g., bare host or host:port)
    const clean = urlString.split('/')[0].split(':')[0].trim().toLowerCase();
    return clean;
  }
}

/**
 * Builds the set of permitted internal hosts from system configuration
 */
export function getInternalHostAllowlist(): Set<string> {
  if (allowlistCache) return allowlistCache;

  const set = new Set<string>([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
  ]);

  const envVarsToInspect = [
    process.env.OLLAMA_BASE_URL,
    process.env.QDRANT_URL,
    process.env.QDRANT_ENDPOINT,
    process.env.S3_ENDPOINT,
    process.env.MINIO_ENDPOINT,
    process.env.DATABASE_URL,
    process.env.REDIS_URL,
    process.env.WORKER_URL,
    process.env.OPENAI_BASE_URL,
    process.env.VLLM_BASE_URL,
    process.env.ENTERPRISE_HOST_ALLOWLIST,
  ];

  for (const raw of envVarsToInspect) {
    if (!raw) continue;
    const split = raw.split(',');
    for (const item of split) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const host = extractHostname(trimmed);
      if (host) {
        set.add(host);
      }
    }
  }

  // Also common Docker service names
  set.add('postgres');
  set.add('qdrant');
  set.add('minio');
  set.add('ollama');
  set.add('vllm');
  set.add('worker');
  set.add('api');
  set.add('web');

  allowlistCache = set;
  return set;
}

/**
 * Resets allowlist cache (useful in tests when env variables change)
 */
export function resetAllowlistCache(): void {
  allowlistCache = null;
}

/**
 * Verifies that a target URL is permitted under Enterprise Air-Gap policy
 */
export function assertUrlAllowed(targetUrl: string): void {
  const deployment = getDeploymentConfig();
  if (deployment.allowExternalNetwork) {
    // SaaS mode or enterprise deployment with explicitly permitted external network
    return;
  }

  const hostname = extractHostname(targetUrl);
  const allowlist = getInternalHostAllowlist();

  if (!allowlist.has(hostname)) {
    const errorMsg = `Air-Gap Policy Violation: Outbound network call to host "${hostname}" is strictly forbidden in air-gapped Enterprise mode. External internet egress is disabled.`;
    logger.error(
      {
        targetUrl,
        blockedHost: hostname,
        allowlistedHosts: Array.from(allowlist),
      },
      'Enterprise Air-Gap Guard Blocked Outbound Call'
    );
    throw new Error(errorMsg);
  }
}

/**
 * Central guarded fetch wrapper
 */
export async function guardedFetch(
  input: string | URL | any,
  init?: any
): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : input?.url || String(input);

  assertUrlAllowed(urlStr);
  return originalFetch(input, init);
}

/**
 * Installs global fetch interceptor to guarantee zero unmonitored egress
 */
export function installGlobalOutboundGuard(): void {
  if ((globalThis as any).__outboundGuardInstalled) return;

  globalThis.fetch = async (input: string | URL | any, init?: any) => {
    return guardedFetch(input, init);
  };

  (globalThis as any).__outboundGuardInstalled = true;
  logger.info('Enterprise Air-Gap Outbound Guard installed on global fetch');
}

/**
 * ForgeX AI — UUID Sanitization, Validation & Extraction Utility
 *
 * Prevents PostgreSQL 'invalid input syntax for type uuid' errors when identifiers
 * contain string prefixes such as 'machine_' or 'asset_'.
 */

/**
 * Standard RFC 4122 UUID Regular Expression:
 * 8-4-4-4-12 hexadecimal format.
 */
export const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/**
 * Checks if a string is strictly a valid UUID (case-insensitive).
 */
export function isUuid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim());
}

/**
 * Extracts a pure UUID substring from an input string matching RFC 4122 pattern.
 * If found, returns the lowercased pure UUID string. Otherwise returns null.
 */
export function extractUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(UUID_REGEX);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Strips prefixes like "machine_" or "asset_" and extracts pure UUID.
 * Returns lowercase UUID if valid, or null if no valid UUID could be parsed.
 */
export function sanitizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 1. If already valid pure UUID
  if (isUuid(trimmed)) {
    return trimmed.toLowerCase();
  }

  // 2. Strip known entity prefixes e.g. "machine_" or "asset_"
  const stripped = trimmed
    .replace(/^machine_/i, '')
    .replace(/^asset_/i, '');

  if (isUuid(stripped)) {
    return stripped.toLowerCase();
  }

  // 3. Extract pure UUID substring anywhere in the string
  return extractUuid(trimmed);
}

/**
 * Sanitizes an asset or machine identifier.
 * If it contains a UUID (with or without "machine_" prefix), extracts the pure UUID.
 * If it's a non-UUID asset tag (e.g. "PUMP-204-B"), strips any "machine_" prefix and returns the clean string.
 */
export function sanitizeMachineOrAssetId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const uuid = sanitizeUuid(trimmed);
  if (uuid) return uuid;

  // Fallback: If it's a non-UUID string with prefix (e.g., machine_PUMP-101), strip prefix
  if (trimmed.toLowerCase().startsWith('machine_')) {
    return trimmed.slice(8).trim();
  }
  if (trimmed.toLowerCase().startsWith('asset_')) {
    return trimmed.slice(6).trim();
  }

  return trimmed;
}

/**
 * Validates and converts an identifier to a safe UUID for PostgreSQL UUID columns.
 * Returns pure lowercased UUID if valid, or null if the value cannot be parsed as a UUID.
 * Passing null to Postgres parameterized queries is safe for nullable UUID columns,
 * or allows using safe fallback WHERE clauses (e.g. WHERE id::text = $1).
 */
export function toSafeUuidParam(value: unknown): string | null {
  return sanitizeUuid(value);
}

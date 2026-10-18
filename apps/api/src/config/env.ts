import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from root or local directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  DEPLOYMENT_MODE: z.enum(['saas', 'enterprise', 'local_dev']).default('local_dev'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Security & Authentication
  AUTH_PROVIDER: z.enum(['supabase', 'keycloak', 'local_dev']).default('local_dev'),
  SUPABASE_JWT_SECRET: z.string().optional().default(''),
  SUPABASE_PROJECT_URL: z.string().optional().default(''),
  KEYCLOAK_REALM_URL: z.string().optional().default(''),
  KEYCLOAK_CLIENT_ID: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16).default('super_secret_forgex_jwt_key_at_least_32_characters_long_min_change_me'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  // Database & Storage
  DATABASE_URL: z.string().default('postgresql://forgex_admin:forgex_dev_secret_2026@localhost:5432/forgex_db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional().default(''),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('s3'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default('forgex_minio_admin'),
  S3_SECRET_ACCESS_KEY: z.string().default('forgex_minio_secret_2026'),
  S3_BUCKET_NAME: z.string().default('forgex-documents'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Inference Provider
  INFERENCE_MODE: z.enum(['local_ollama', 'saas_cloud']).default('local_ollama'),
  INFERENCE_PROVIDER: z.enum(['ollama', 'azure', 'openai', 'saas', 'cloud', 'local']).default('ollama'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('llama3.2'),
  OLLAMA_VISION_MODEL: z.string().default('llava'),
  CLOUD_AI_API_KEY: z.string().optional().default(''),
  CLOUD_AI_ENDPOINT: z.string().optional().default(''),
  CLOUD_AI_MODEL: z.string().default('gpt-4o-industrial'),

  // Plant & Worker Services
  PLANT_SITE_CODE: z.string().default('PLANT-TX-04'),
  WORKER_URL: z.string().default('http://localhost:8000'),

  // Air-Gapped & Telemetry Controls
  AIR_GAPPED_MODE: z.coerce.boolean().default(false),
  TELEMETRY_ENABLED: z.coerce.boolean().default(false),

  // Rate Limiting & Usage Quotas
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().default(120),
  RATE_LIMIT_AI_PER_MINUTE: z.coerce.number().default(30),
  TENANT_QUOTA_QUERIES_MONTHLY: z.coerce.number().default(50000),
  TENANT_QUOTA_STORAGE_BYTES: z.coerce.number().default(107374182400), // 100 GB
});

export type EnvConfig = z.infer<typeof envSchema>;

export function maskSecret(secret?: string): string {
  if (!secret || secret.length === 0) return '[NOT_SET]';
  if (secret.length <= 6) return '***';
  return `${secret.substring(0, 3)}***${secret.substring(secret.length - 2)}`;
}

export function getSanitizedConfig(cfg: EnvConfig): Record<string, unknown> {
  return {
    ...cfg,
    JWT_SECRET: '[REDACTED]',
    S3_SECRET_ACCESS_KEY: '[REDACTED]',
    SUPABASE_JWT_SECRET: maskSecret(cfg.SUPABASE_JWT_SECRET),
    QDRANT_API_KEY: maskSecret(cfg.QDRANT_API_KEY),
    CLOUD_AI_API_KEY: maskSecret(cfg.CLOUD_AI_API_KEY),
  };
}

export function validateModeSpecificRequirements(cfg: EnvConfig): void {
  if (cfg.DEPLOYMENT_MODE === 'enterprise') {
    if (cfg.TELEMETRY_ENABLED) {
      throw new Error(
        'Enterprise Air-Gap Violation: TELEMETRY_ENABLED must be false in enterprise mode to prevent data egress.'
      );
    }
    if (cfg.INFERENCE_PROVIDER === 'openai' || cfg.INFERENCE_PROVIDER === 'azure' || cfg.INFERENCE_PROVIDER === 'saas') {
      throw new Error(
        'Enterprise Air-Gap Violation: External cloud inference provider cannot be active in enterprise mode without explicit air-gapped override.'
      );
    }
  }

  if (cfg.DEPLOYMENT_MODE === 'saas') {
    if (cfg.INFERENCE_MODE === 'saas_cloud' && !cfg.CLOUD_AI_API_KEY && cfg.INFERENCE_PROVIDER !== 'local') {
      // In production SaaS, cloud API key is required when cloud inference is enabled
      if (cfg.NODE_ENV === 'production') {
        throw new Error('SaaS Configuration Error: CLOUD_AI_API_KEY is required for production SaaS cloud inference.');
      }
    }
  }
}

function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.cwd() ? process.env : {});
  if (!result.success) {
    console.error('❌ FATAL: Environment validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  // Set enterprise defaults if in enterprise deployment mode
  const validated = { ...result.data };
  if (validated.DEPLOYMENT_MODE === 'enterprise') {
    validated.AIR_GAPPED_MODE = true;
    validated.TELEMETRY_ENABLED = false;
  }

  validateModeSpecificRequirements(validated);
  return validated;
}

export const config = validateEnv();

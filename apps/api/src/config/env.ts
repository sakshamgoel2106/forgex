import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

const isTestEnv = process.env.NODE_ENV === 'test';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
if (isTestEnv) {
  process.env.NODE_ENV = 'test';
}

const booleanFromString = (defaultValue: boolean) =>
  z.preprocess((val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
    }
    return val;
  }, z.boolean().default(defaultValue));

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
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('no-reply@forgex.industrial.ai'),
  JWT_SECRET: z.string().min(16).default('super_secret_forgex_jwt_key_at_least_32_characters_long_min_change_me'),
  JWT_EXPIRES_IN: z.string().default('24h'),

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
  S3_FORCE_PATH_STYLE: booleanFromString(true),

  // Inference Provider
  INFERENCE_MODE: z.enum(['local_ollama', 'saas_cloud']).default('local_ollama'),
  INFERENCE_PROVIDER: z.enum(['ollama', 'azure', 'openai', 'saas', 'cloud', 'local', 'gemini']).default('ollama'),
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
  AIR_GAPPED_MODE: booleanFromString(false),
  TELEMETRY_ENABLED: booleanFromString(false),

  // Rate Limiting & Usage Quotas
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().default(120),
  RATE_LIMIT_AI_PER_MINUTE: z.coerce.number().default(30),
  TENANT_QUOTA_QUERIES_MONTHLY: z.coerce.number().default(50000),
  TENANT_QUOTA_STORAGE_BYTES: z.coerce.number().default(107374182400), // 100 GB

  // Voice Assistant & Speech Processing Configuration (Production Audio & Wake-Word)
  VOICE_WAKE_WORD_ENABLED: booleanFromString(true),
  VOICE_WAKE_WORD_PHRASE: z.string().default('Hello ForgeX'),
  VOICE_WAKE_WORD_ENGINE: z.enum(['porcupine', 'openwakeword', 'local', 'webaudio']).default('porcupine'),
  VOICE_WAKE_WORD_MODEL_PATH: z.string().optional().default(''),
  PICOVOICE_ACCESS_KEY: z.string().optional().default(''),
  VOICE_STT_PROVIDER: z.enum(['gemini', 'faster-whisper', 'local']).default('local'),
  VOICE_TTS_PROVIDER: z.enum(['google', 'piper', 'local']).default('local'),
  VOICE_MAX_DURATION_SECONDS: z.coerce.number().default(120),
  VOICE_MAX_FILE_SIZE_MB: z.coerce.number().default(15),
  VOICE_SILENCE_TIMEOUT_MS: z.coerce.number().default(1000),
  VOICE_SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().default(30),
  VOICE_STRICT_OFFLINE: booleanFromString(false),
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
    GOOGLE_CLIENT_SECRET: '[REDACTED]',
    SMTP_PASS: '[REDACTED]',
    SUPABASE_JWT_SECRET: maskSecret(cfg.SUPABASE_JWT_SECRET),
    QDRANT_API_KEY: maskSecret(cfg.QDRANT_API_KEY),
    CLOUD_AI_API_KEY: maskSecret(cfg.CLOUD_AI_API_KEY),
    PICOVOICE_ACCESS_KEY: maskSecret(cfg.PICOVOICE_ACCESS_KEY),
  };
}

export function validateModeSpecificRequirements(cfg: EnvConfig): void {
  if (cfg.DEPLOYMENT_MODE === 'enterprise') {
    if (cfg.TELEMETRY_ENABLED) {
      throw new Error(
        'Enterprise Air-Gap Violation: TELEMETRY_ENABLED must be false in enterprise mode to prevent data egress.'
      );
    }
    if (cfg.INFERENCE_PROVIDER === 'openai' || cfg.INFERENCE_PROVIDER === 'azure' || cfg.INFERENCE_PROVIDER === 'saas' || cfg.INFERENCE_PROVIDER === 'gemini') {
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

function normalizeEnv(raw: NodeJS.ProcessEnv): Record<string, unknown> {
  const env: Record<string, unknown> = { ...raw };

  // Environment alias
  if (!env.NODE_ENV && env.ENVIRONMENT) {
    env.NODE_ENV = env.ENVIRONMENT;
  }

  // CORS origins alias
  if (!env.CORS_ORIGIN && env.CORS_ORIGINS) {
    env.CORS_ORIGIN = env.CORS_ORIGINS;
  }

  // Secret keys alias
  if (!env.JWT_SECRET && env.APP_SECRET_KEY) {
    env.JWT_SECRET = env.APP_SECRET_KEY;
  }

  // Database URL alias
  if (!env.DATABASE_URL && env.POSTGRES_SERVER && env.POSTGRES_PASSWORD) {
    const user = env.POSTGRES_USER || 'postgres';
    const port = env.POSTGRES_PORT || '5432';
    const db = env.POSTGRES_DB || 'postgres';
    env.DATABASE_URL = `postgresql://${user}:${encodeURIComponent(String(env.POSTGRES_PASSWORD))}@${env.POSTGRES_SERVER}:${port}/${db}`;
  }

  // Storage / MinIO / S3 aliases
  if (!env.S3_ENDPOINT && env.MINIO_ENDPOINT) {
    const minioEndpoint = String(env.MINIO_ENDPOINT);
    const isSecure = env.MINIO_SECURE === 'true' || env.MINIO_SECURE === true;
    const proto = isSecure ? 'https' : 'http';
    env.S3_ENDPOINT = minioEndpoint.startsWith('http') ? minioEndpoint : `${proto}://${minioEndpoint}`;
  }
  if (!env.S3_ACCESS_KEY_ID && env.MINIO_ROOT_USER) {
    env.S3_ACCESS_KEY_ID = env.MINIO_ROOT_USER;
  }
  if (!env.S3_SECRET_ACCESS_KEY && env.MINIO_ROOT_PASSWORD) {
    env.S3_SECRET_ACCESS_KEY = env.MINIO_ROOT_PASSWORD;
  }
  if (!env.S3_BUCKET_NAME && env.MINIO_BUCKET_NAME) {
    env.S3_BUCKET_NAME = env.MINIO_BUCKET_NAME;
  }
  if (!env.S3_REGION && env.MINIO_REGION) {
    env.S3_REGION = env.MINIO_REGION;
  }

  // LLM / Cloud AI aliases
  if (!env.CLOUD_AI_API_KEY && (env.LLM_API_KEY || env.GEMINI_API_KEY || env.CLOUD_LLM_API_KEY)) {
    env.CLOUD_AI_API_KEY = env.LLM_API_KEY || env.GEMINI_API_KEY || env.CLOUD_LLM_API_KEY;
  }
  if (!env.CLOUD_AI_MODEL && (env.LLM_MODEL || env.CLOUD_LLM_MODEL)) {
    env.CLOUD_AI_MODEL = env.LLM_MODEL || env.CLOUD_LLM_MODEL;
  }
  if (!env.CLOUD_AI_ENDPOINT && env.CLOUD_LLM_ENDPOINT) {
    env.CLOUD_AI_ENDPOINT = env.CLOUD_LLM_ENDPOINT;
  }
  if (!env.INFERENCE_PROVIDER && env.LLM_PROVIDER) {
    env.INFERENCE_PROVIDER = env.LLM_PROVIDER;
  }

  // Worker URL aliases
  if (!env.WORKER_URL && env.DOCUMENT_WORKER_URL) {
    env.WORKER_URL = env.DOCUMENT_WORKER_URL;
  }

  // Supabase JWT / URL aliases
  if (!env.SUPABASE_JWT_SECRET && env.APP_SECRET_KEY) {
    env.SUPABASE_JWT_SECRET = env.APP_SECRET_KEY;
  }
  if (!env.SUPABASE_PROJECT_URL && typeof env.POSTGRES_SERVER === 'string' && env.POSTGRES_SERVER.includes('.supabase.co')) {
    const host = env.POSTGRES_SERVER.replace(/^db\./, '');
    env.SUPABASE_PROJECT_URL = `https://${host}`;
  }

  return env;
}

function validateEnv(): EnvConfig {
  const normalized = normalizeEnv(process.env);
  const result = envSchema.safeParse(normalized);
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

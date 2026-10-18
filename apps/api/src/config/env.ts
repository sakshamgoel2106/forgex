import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from root or local directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
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
  INFERENCE_PROVIDER: z.enum(['ollama', 'azure', 'openai']).default('ollama'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('llama3.2'),
  OLLAMA_VISION_MODEL: z.string().default('llava'),

  // Plant Context
  PLANT_SITE_CODE: z.string().default('PLANT-TX-04'),
  AIR_GAPPED_MODE: z.coerce.boolean().default(false),
});

export type EnvConfig = z.infer<typeof envSchema>;

function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.cwd() ? process.env : {});
  if (!result.success) {
    console.error('❌ FATAL: Environment validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
}

export const config = validateEnv();

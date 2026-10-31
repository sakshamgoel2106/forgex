/**
 * ForgeX AI — Core Deployment Configuration System
 * Governs runtime behavior for SaaS (Cloud Multi-Tenant) vs. Enterprise (Air-Gapped / On-Prem Single-Tenant).
 */

import { config } from './env.js';
import type {
  DeploymentConfig,
  PublicDeploymentConfig,
  DeploymentMode,
  AiProvider,
  VectorProvider,
  StorageProvider,
} from '@forgex/shared-types';

export function getDeploymentConfig(): DeploymentConfig {
  const modeEnv = (process.env.DEPLOYMENT_MODE || config.DEPLOYMENT_MODE || 'saas').toLowerCase();
  const isEnterprise = modeEnv === 'enterprise';
  const mode: DeploymentMode = isEnterprise ? 'enterprise' : 'saas';

  // In Enterprise mode, self-service org signup is strictly disabled
  const allowOrgSignup = isEnterprise
    ? false
    : process.env.ALLOW_ORG_SIGNUP !== undefined
      ? process.env.ALLOW_ORG_SIGNUP === 'true' || process.env.ALLOW_ORG_SIGNUP === '1'
      : config.ALLOW_ORG_SIGNUP !== undefined
        ? Boolean(config.ALLOW_ORG_SIGNUP)
        : true;

  // In Enterprise mode, external Google OAuth is strictly disabled
  const allowGoogleAuth = isEnterprise
    ? false
    : process.env.ALLOW_GOOGLE_AUTH !== undefined
      ? process.env.ALLOW_GOOGLE_AUTH === 'true' || process.env.ALLOW_GOOGLE_AUTH === '1'
      : config.ALLOW_GOOGLE_AUTH !== undefined
        ? Boolean(config.ALLOW_GOOGLE_AUTH)
        : Boolean(config.GOOGLE_CLIENT_ID);

  // In Enterprise mode, external network calls default to false (air-gapped) unless overridden
  const allowExternalNetwork = isEnterprise
    ? (process.env.ALLOW_EXTERNAL_NETWORK === 'true' || Boolean(config.ALLOW_EXTERNAL_NETWORK))
    : process.env.ALLOW_EXTERNAL_NETWORK !== undefined
      ? process.env.ALLOW_EXTERNAL_NETWORK === 'true'
      : config.ALLOW_EXTERNAL_NETWORK !== undefined
        ? Boolean(config.ALLOW_EXTERNAL_NETWORK)
        : true;

  const rawAi = process.env.AI_PROVIDER || config.AI_PROVIDER;
  const aiProvider: AiProvider = (rawAi as AiProvider) ||
    (isEnterprise ? 'ollama' : 'gemini');

  const rawVector = process.env.VECTOR_PROVIDER || config.VECTOR_PROVIDER;
  const vectorProvider: VectorProvider = (rawVector as VectorProvider) ||
    (isEnterprise ? 'qdrant-local' : 'qdrant-cloud');

  const rawStorage = process.env.STORAGE_PROVIDER || config.STORAGE_PROVIDER;
  const storageProvider: StorageProvider =
    rawStorage === 's3' && !isEnterprise
      ? 's3'
      : 'minio';

  const singleTenantOrgId = (process.env.SINGLE_TENANT_ORG_ID || config.SINGLE_TENANT_ORG_ID)?.trim() || undefined;

  const branding = {
    name: process.env.BRANDING_NAME || config.BRANDING_NAME || 'ForgeX AI',
    logoUrl: process.env.BRANDING_LOGO_URL || config.BRANDING_LOGO_URL || '/forgex_icon.png',
    primaryColor: process.env.BRANDING_PRIMARY_COLOR || config.BRANDING_PRIMARY_COLOR || '#0f172a',
  };

  const features = {
    orgSignup: allowOrgSignup,
    googleAuth: allowGoogleAuth,
    rfid: config.FEATURE_RFID ?? true,
    otp: config.FEATURE_OTP ?? true,
    offlineSync: config.FEATURE_OFFLINE_SYNC ?? true,
  };

  return {
    mode,
    allowOrgSignup,
    allowGoogleAuth,
    allowExternalNetwork,
    aiProvider,
    vectorProvider,
    storageProvider,
    singleTenantOrgId,
    branding,
    features,
    apiVersion: 'v1',
  };
}

/**
 * Returns public-safe deployment configuration containing zero secrets,
 * API keys, or private URLs.
 */
export function getPublicDeploymentConfig(): PublicDeploymentConfig {
  const full = getDeploymentConfig();
  return {
    mode: full.mode,
    features: full.features,
    branding: full.branding,
    apiVersion: full.apiVersion,
  };
}

export const deploymentConfig = getDeploymentConfig();

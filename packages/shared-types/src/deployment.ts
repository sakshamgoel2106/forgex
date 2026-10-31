/**
 * ForgeX AI — Deployment Mode & Public Runtime Configuration Specifications
 * Supports both Multi-Tenant Cloud SaaS and Air-Gapped / On-Prem Enterprise Modes.
 */

export type DeploymentMode = 'saas' | 'enterprise';

export type AiProvider = 'gemini' | 'ollama' | 'vllm';

export type VectorProvider = 'qdrant-cloud' | 'qdrant-local';

export type StorageProvider = 's3' | 'minio';

export interface BrandingConfig {
  name: string;
  logoUrl?: string;
  primaryColor: string;
}

export interface DeploymentFeatures {
  orgSignup: boolean;
  googleAuth: boolean;
  rfid: boolean;
  otp: boolean;
  offlineSync: boolean;
}

/**
 * Public, safe runtime configuration exposed to browsers and mobile PWAs.
 * Contains ZERO secrets or database credentials.
 */
export interface PublicDeploymentConfig {
  mode: DeploymentMode;
  features: DeploymentFeatures;
  branding: BrandingConfig;
  apiVersion: string;
}

/**
 * Internal API server deployment configuration.
 */
export interface DeploymentConfig {
  mode: DeploymentMode;
  allowOrgSignup: boolean;
  allowGoogleAuth: boolean;
  allowExternalNetwork: boolean;
  aiProvider: AiProvider;
  vectorProvider: VectorProvider;
  storageProvider: StorageProvider;
  singleTenantOrgId?: string;
  branding: BrandingConfig;
  features: DeploymentFeatures;
  apiVersion: string;
}

/**
 * ForgeX AI — Standardized API Request/Response Envelopes and Health Schemas
 */

export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  requestId: string;
}

export interface SubsystemHealth {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latencyMs?: number;
  message?: string;
}

export interface HealthCheckResponse {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  environment: 'development' | 'staging' | 'production';
  deploymentMode?: 'SAAS' | 'ENTERPRISE' | 'LOCAL_DEV';
  checks: {
    database: SubsystemHealth;
    vectorStore: SubsystemHealth;
    objectStorage: SubsystemHealth;
    redis: SubsystemHealth;
    inferenceProvider: SubsystemHealth;
    documentWorker?: SubsystemHealth;
  };
}

export type DeploymentMode = 'SAAS' | 'ENTERPRISE' | 'LOCAL_DEV';

export interface TenantUsageQuota {
  organizationId: string;
  planName: string;
  queriesUsedCurrentMonth: number;
  maxQueriesPerMonth: number;
  storageBytesUsed: number;
  maxStorageBytes: number;
  documentsIndexedCount: number;
  maxDocumentsCount: number;
  rateLimitPerMinute: number;
}


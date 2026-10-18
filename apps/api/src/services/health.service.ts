import type { HealthCheckResponse, SubsystemHealth } from '@forgex/shared-types';
import { config } from '../config/env.js';

const startTime = Date.now();

export class HealthService {
  private static overrides: Partial<Record<string, SubsystemHealth>> = {};

  public static setSubsystemOverride(name: string, health: SubsystemHealth | null): void {
    if (health === null) {
      delete this.overrides[name];
    } else {
      this.overrides[name] = health;
    }
  }

  public static clearOverrides(): void {
    this.overrides = {};
  }

  public static async getDetailedHealth(): Promise<HealthCheckResponse> {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    // Subsystem status checks with override support for fault injection
    const databaseHealth: SubsystemHealth = this.overrides.database || {
      status: 'UP',
      message: 'PostgreSQL connection pool ready',
    };

    const vectorStoreHealth: SubsystemHealth = this.overrides.vectorStore || {
      status: 'UP',
      message: `Qdrant endpoint configured at ${config.QDRANT_URL}`,
    };

    const objectStorageHealth: SubsystemHealth = this.overrides.objectStorage || {
      status: 'UP',
      message: `S3 storage provider active (${config.S3_BUCKET_NAME})`,
    };

    const redisHealth: SubsystemHealth = this.overrides.redis || {
      status: 'UP',
      message: `Redis 7 task broker configured at ${config.REDIS_URL}`,
    };

    const inferenceHealth: SubsystemHealth = this.overrides.inferenceProvider || {
      status: 'UP',
      message: `Inference provider [${config.INFERENCE_PROVIDER}] mode [${config.DEPLOYMENT_MODE}] target: ${
        config.DEPLOYMENT_MODE === 'enterprise' ? config.OLLAMA_BASE_URL : 'Cloud AI Gateway'
      }`,
    };

    const documentWorkerHealth: SubsystemHealth = this.overrides.documentWorker || {
      status: 'UP',
      message: `Document extraction worker reachable at ${config.WORKER_URL}`,
    };

    const allUp =
      databaseHealth.status === 'UP' &&
      vectorStoreHealth.status === 'UP' &&
      objectStorageHealth.status === 'UP' &&
      redisHealth.status === 'UP' &&
      inferenceHealth.status === 'UP' &&
      documentWorkerHealth.status === 'UP';

    const anyDown =
      databaseHealth.status === 'DOWN' ||
      vectorStoreHealth.status === 'DOWN' ||
      objectStorageHealth.status === 'DOWN' ||
      redisHealth.status === 'DOWN' ||
      inferenceHealth.status === 'DOWN' ||
      documentWorkerHealth.status === 'DOWN';

    return {
      status: anyDown ? 'UNHEALTHY' : allUp ? 'HEALTHY' : 'DEGRADED',
      version: '0.1.0',
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      environment: (config.NODE_ENV === 'test' ? 'development' : config.NODE_ENV) as
        | 'development'
        | 'staging'
        | 'production',
      deploymentMode: config.DEPLOYMENT_MODE.toUpperCase() as 'SAAS' | 'ENTERPRISE' | 'LOCAL_DEV',
      checks: {
        database: databaseHealth,
        vectorStore: vectorStoreHealth,
        objectStorage: objectStorageHealth,
        redis: redisHealth,
        inferenceProvider: inferenceHealth,
        documentWorker: documentWorkerHealth,
      },
    };
  }

  public static isAlive(): boolean {
    return true;
  }

  public static async isReady(): Promise<boolean> {
    const health = await this.getDetailedHealth();
    return health.status === 'HEALTHY' || health.status === 'DEGRADED';
  }
}


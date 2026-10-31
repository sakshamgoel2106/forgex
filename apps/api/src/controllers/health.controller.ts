import type { Request, Response } from 'express';
import { HealthService } from '../services/health.service.js';
import { getLlmProvider } from '../providers/llm/index.js';
import { getDeploymentConfig } from '../config/deployment.js';
import { createVectorStoreAdapter } from '../vector/vectorStoreFactory.js';
import { createStorageAdapter } from '../storage/storageFactory.js';

export class HealthController {
  public static async getDetailedHealth(_req: Request, res: Response): Promise<void> {
    const health = await HealthService.getDetailedHealth();
    const httpStatus = health.status === 'HEALTHY' ? 200 : health.status === 'DEGRADED' ? 200 : 503;
    res.status(httpStatus).json(health);
  }

  public static getLiveness(_req: Request, res: Response): void {
    const isAlive = HealthService.isAlive();
    res.status(isAlive ? 200 : 503).json({
      status: isAlive ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
    });
  }

  public static async getReadiness(_req: Request, res: Response): Promise<void> {
    const isReady = await HealthService.isReady();
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'READY' : 'NOT_READY',
      timestamp: new Date().toISOString(),
    });
  }

  public static async getMetrics(_req: Request, res: Response): Promise<void> {
    const { MetricsService } = await import('../services/metrics.service.js');
    const metrics = await MetricsService.getMetrics();
    res.status(200).json(metrics);
  }

  /**
   * GET /api/health/dependencies
   * Authenticated Admin-only probe of all 5 critical dependencies:
   * LLM, Vector DB, Storage, Worker, Database
   */
  public static async getDependenciesHealth(req: Request, res: Response): Promise<void> {
    const deployment = getDeploymentConfig();
    const isEnterprise = deployment.mode === 'enterprise';

    // 1. LLM Check
    let llmHealth: any;
    try {
      const provider = getLlmProvider();
      const check = await provider.healthCheck();
      llmHealth = {
        provider: provider.name,
        healthy: check.healthy,
        status: check.status,
        latencyMs: check.latencyMs,
        details: check.details,
      };
    } catch (err: any) {
      llmHealth = {
        provider: 'unknown',
        healthy: false,
        status: 'UNAVAILABLE',
        latencyMs: 0,
        details: { error: err?.message },
      };
    }

    // 2. Vector DB Check
    let vectorDbHealth: any;
    try {
      const vectorStore: any = req.app.locals.vectorStore || createVectorStoreAdapter();
      if (typeof vectorStore.healthCheck === 'function') {
        const check = await vectorStore.healthCheck();
        vectorDbHealth = {
          provider: check.provider || 'qdrant',
          status: check.status || (check.ok ? 'HEALTHY' : 'UNREACHABLE'),
          healthy: Boolean(check.ok),
          latencyMs: check.latencyMs || 0,
          dimensions: check.dimensions,
          message: check.message,
        };
      } else {
        vectorDbHealth = {
          provider: 'in-memory',
          status: 'HEALTHY',
          healthy: true,
          latencyMs: 0,
          message: 'In-memory vector store operational',
        };
      }
    } catch (err: any) {
      vectorDbHealth = {
        provider: 'qdrant',
        status: 'UNREACHABLE',
        healthy: false,
        latencyMs: 0,
        message: err?.message,
      };
    }

    // 3. Object Storage Check
    let storageHealth: any;
    try {
      const storageAdapter: any = req.app.locals.storageAdapter || createStorageAdapter();
      if (typeof storageAdapter.healthCheck === 'function') {
        const check = await storageAdapter.healthCheck();
        storageHealth = {
          provider: check.provider || 's3',
          status: check.healthy ? 'HEALTHY' : 'DEGRADED',
          healthy: Boolean(check.healthy),
          bucket: check.bucket || 'forgex-documents',
          latencyMs: check.latencyMs || 0,
          message: check.message,
        };
      } else {
        storageHealth = {
          provider: 'local',
          status: 'HEALTHY',
          healthy: true,
          bucket: 'local-containment',
          latencyMs: 0,
        };
      }
    } catch (err: any) {
      storageHealth = {
        provider: 's3',
        status: 'UNAVAILABLE',
        healthy: false,
        bucket: 'unknown',
        latencyMs: 0,
        message: err?.message,
      };
    }

    // 4. Database Check
    let dbHealth: any;
    const dbStart = Date.now();
    try {
      const dataStore: any = req.app.locals.dataStore;
      let dbType = 'in-memory';
      if (dataStore?.pool) {
        await dataStore.pool.query('SELECT 1');
        dbType = 'postgresql';
      } else if (dataStore?.listOrganizations) {
        await dataStore.listOrganizations();
      }
      dbHealth = {
        type: dbType,
        status: 'HEALTHY',
        healthy: true,
        latencyMs: Date.now() - dbStart,
        message: `${dbType.toUpperCase()} primary datastore responsive`,
      };
    } catch (err: any) {
      dbHealth = {
        type: 'database',
        status: 'UNHEALTHY',
        healthy: false,
        latencyMs: Date.now() - dbStart,
        message: err?.message || 'Database query failed',
      };
    }

    // 5. Worker Check
    let workerHealth: any;
    try {
      const outboxRelay = req.app.locals.outboxRelay;
      workerHealth = {
        status: outboxRelay ? 'RUNNING' : 'IDLE',
        healthy: true,
        active: Boolean(outboxRelay),
        latencyMs: 0,
        message: outboxRelay ? 'Asynchronous outbox relay and ingestion worker running' : 'Worker process standby',
      };
    } catch (err: any) {
      workerHealth = {
        status: 'STOPPED',
        healthy: false,
        active: false,
        latencyMs: 0,
        message: err?.message,
      };
    }

    const allHealthy =
      llmHealth.healthy &&
      vectorDbHealth.healthy &&
      storageHealth.healthy &&
      dbHealth.healthy &&
      workerHealth.healthy;

    const anyDown =
      !dbHealth.healthy ||
      (!llmHealth.healthy && !isEnterprise);

    const overallStatus = anyDown ? 'UNHEALTHY' : allHealthy ? 'HEALTHY' : 'DEGRADED';

    res.status(overallStatus === 'UNHEALTHY' ? 503 : 200).json({
      healthy: allHealthy,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      deploymentMode: deployment.mode,
      airGapped: !deployment.allowExternalNetwork,
      dependencies: {
        llm: llmHealth,
        vectorDb: vectorDbHealth,
        storage: storageHealth,
        database: dbHealth,
        worker: workerHealth,
      },
    });
  }
}

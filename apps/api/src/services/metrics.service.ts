import { config } from '../config/env.js';
import { HealthService } from './health.service.js';

interface MetricCounters {
  httpRequestsTotal: number;
  httpErrorsTotal: number;
  aiQueriesTotal: number;
  documentsIngestedTotal: number;
  maintenanceCasesCreatedTotal: number;
  workOrdersApprovedTotal: number;
  escalationsTotal: number;
}

export class MetricsService {
  private static counters: MetricCounters = {
    httpRequestsTotal: 0,
    httpErrorsTotal: 0,
    aiQueriesTotal: 0,
    documentsIngestedTotal: 0,
    maintenanceCasesCreatedTotal: 0,
    workOrdersApprovedTotal: 0,
    escalationsTotal: 0,
  };

  public static incrementRequest(): void {
    this.counters.httpRequestsTotal += 1;
  }

  public static incrementError(): void {
    this.counters.httpErrorsTotal += 1;
  }

  public static incrementAiQuery(): void {
    this.counters.aiQueriesTotal += 1;
  }

  public static incrementDocument(): void {
    this.counters.documentsIngestedTotal += 1;
  }

  public static incrementMaintenanceCase(): void {
    this.counters.maintenanceCasesCreatedTotal += 1;
  }

  public static incrementWorkOrderApproval(): void {
    this.counters.workOrdersApprovedTotal += 1;
  }

  public static incrementEscalation(): void {
    this.counters.escalationsTotal += 1;
  }

  public static async getMetrics(): Promise<Record<string, unknown>> {
    const mem = process.memoryUsage();
    const health = await HealthService.getDetailedHealth();

    // Sanitized structured metrics without sensitive document contents
    return {
      service: 'forgex-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      deploymentMode: config.DEPLOYMENT_MODE.toUpperCase(),
      airGapped: config.AIR_GAPPED_MODE,
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        },
        nodeVersion: process.version,
      },
      counters: { ...this.counters },
      subsystems: {
        overall: health.status,
        database: health.checks.database.status,
        vectorStore: health.checks.vectorStore.status,
        objectStorage: health.checks.objectStorage.status,
        redis: health.checks.redis.status,
        inferenceProvider: health.checks.inferenceProvider.status,
        documentWorker: health.checks.documentWorker?.status || 'UNKNOWN',
      },
    };
  }
}

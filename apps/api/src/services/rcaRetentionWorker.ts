import type { IDataStore } from '../db/dataStore.interface.js';
import { logger } from '../utils/logger.js';

export interface RcaRetentionStatus {
  enabled: boolean;
  retentionDays: number;
  intervalHours: number;
  lastRunAt: string | null;
  lastDeletedSessions: number;
  lastDeletedRecords: number;
  lastCutoffDate: string | null;
}

let retentionTimer: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;

let retentionStatus: RcaRetentionStatus = {
  enabled: true,
  retentionDays: parseInt(process.env.RCA_RETENTION_DAYS || '30', 10),
  intervalHours: parseInt(process.env.RCA_RETENTION_INTERVAL_HOURS || '24', 10),
  lastRunAt: null,
  lastDeletedSessions: 0,
  lastDeletedRecords: 0,
  lastCutoffDate: null,
};

/**
 * Execute a single cycle of the RCA retention policy
 */
export async function executeRcaRetentionPurge(
  dataStore: IDataStore,
  customDays?: number,
  organizationId?: string
): Promise<{
  deletedRcaSessions: number;
  deletedMaintenanceRecords: number;
  cutoffDate: string;
  retentionDays: number;
}> {
  const days = customDays !== undefined && customDays > 0 ? customDays : retentionStatus.retentionDays;

  try {
    const result = await dataStore.purgeRcaRecordsOlderThan(days, organizationId);

    retentionStatus.lastRunAt = new Date().toISOString();
    retentionStatus.lastDeletedSessions = result.deletedRcaSessions;
    retentionStatus.lastDeletedRecords = result.deletedMaintenanceRecords;
    retentionStatus.lastCutoffDate = result.cutoffDate;

    logger.info(
      {
        retentionDays: days,
        deletedRcaSessions: result.deletedRcaSessions,
        deletedMaintenanceRecords: result.deletedMaintenanceRecords,
        cutoffDate: result.cutoffDate,
        organizationId: organizationId || 'all_tenants',
      },
      '🧹 [RCA Data Retention] Automated purge completed'
    );

    return {
      ...result,
      retentionDays: days,
    };
  } catch (err: any) {
    logger.error({ err: err?.message }, '❌ [RCA Data Retention] Purge cycle encountered error');
    throw err;
  }
}

/**
 * Start the recurring background worker for RCA retention
 */
export function startRcaRetentionWorker(
  dataStore: IDataStore,
  customIntervalMs?: number,
  customDays?: number
): void {
  if (customDays !== undefined) {
    retentionStatus.retentionDays = customDays;
  }

  const intervalMs =
    customIntervalMs || retentionStatus.intervalHours * 60 * 60 * 1000;

  // Run initial pass shortly after server boot (15 seconds)
  initialTimer = setTimeout(() => {
    executeRcaRetentionPurge(dataStore).catch((err) => {
      logger.warn({ err: err?.message }, 'Initial RCA retention cycle notice');
    });
  }, 15000);
  initialTimer.unref();

  // Schedule periodic cleanup
  retentionTimer = setInterval(() => {
    executeRcaRetentionPurge(dataStore).catch((err) => {
      logger.warn({ err: err?.message }, 'Periodic RCA retention cycle notice');
    });
  }, intervalMs);
  retentionTimer.unref();

  logger.info(
    {
      retentionDays: retentionStatus.retentionDays,
      intervalHours: retentionStatus.intervalHours,
    },
    '⏰ [RCA Retention Worker] Scheduled background worker active'
  );
}

/**
 * Stop the background retention worker (for testing or shutdown)
 */
export function stopRcaRetentionWorker(): void {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}

/**
 * Get current status and metadata of the RCA retention worker
 */
export function getRcaRetentionStatus(): RcaRetentionStatus {
  return { ...retentionStatus };
}

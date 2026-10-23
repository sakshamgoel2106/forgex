import type { IDataStore } from '../db/dataStore.interface.js';
import type { IngestionQueue } from './ingestionQueue.js';
import { logger } from '../utils/logger.js';

/**
 * Transactional Outbox Relay Worker
 * Reliably dispatches queued asynchronous jobs from PostgreSQL `outbox_events` table to BullMQ/IngestionQueue
 * using `FOR UPDATE SKIP LOCKED` to guarantee exactly-once/at-least-once distributed processing.
 * Sets strict tenant context from event organizationId for multi-tenant isolation.
 */
export class OutboxRelayWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private dataStore: IDataStore,
    private ingestionQueue: IngestionQueue,
    private pollIntervalMs = 1500
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Transactional Outbox Relay Worker started');
    this.scheduleNext();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('Transactional Outbox Relay Worker stopped');
  }

  private scheduleNext(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.pollAndDispatch();
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Outbox relay poller encountered an error');
      } finally {
        this.scheduleNext();
      }
    }, this.pollIntervalMs);
  }

  public async pollAndDispatch(): Promise<number> {
    const events = await this.dataStore.fetchPendingOutboxEvents(10);
    if (!events || events.length === 0) return 0;

    for (const evt of events) {
      try {
        const processEvent = async () => {
          if (evt.eventType === 'DOCUMENT_INGESTION_REQUESTED') {
            const { organizationId, documentVersionId } = evt.payload;
            if (organizationId && documentVersionId) {
              await this.ingestionQueue.enqueue(organizationId, documentVersionId);
            }
          }
          await this.dataStore.markOutboxEventProcessed(evt.id);
          logger.info(
            { eventId: evt.id, eventType: evt.eventType, aggregateId: evt.aggregateId },
            'Successfully processed outbox event'
          );
        };

        if (typeof (this.dataStore as any).withTenantContext === 'function' && evt.organizationId) {
          await (this.dataStore as any).withTenantContext(evt.organizationId, processEvent);
        } else {
          await processEvent();
        }
      } catch (err: any) {
        logger.error({ err: err?.message, eventId: evt.id }, 'Failed to dispatch outbox event');
        await this.dataStore.markOutboxEventFailed(evt.id, err?.message || 'Dispatch error');
      }
    }
    return events.length;
  }
}

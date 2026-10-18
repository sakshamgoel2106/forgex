import type { ProcessingJob } from '@forgex/shared-types';
import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import { IngestionProcessor } from './ingestionProcessor.js';
import { logger } from '../utils/logger.js';

export interface IngestionJobPayload {
  jobId: string;
  documentVersionId: string;
  organizationId: string;
}

export class IngestionQueue {
  private processor: IngestionProcessor;
  private queue: IngestionJobPayload[] = [];
  private isProcessing = false;

  constructor(
    private dataStore: IDataStore,
    storageAdapter: IStorageAdapter,
    embeddingAdapter: IEmbeddingAdapter,
    vectorStore: IVectorStoreAdapter
  ) {
    this.processor = new IngestionProcessor(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore
    );
  }

  public async enqueue(
    organizationId: string,
    documentVersionId: string
  ): Promise<ProcessingJob> {
    const job = await this.dataStore.createProcessingJob({
      organizationId,
      documentVersionId,
      status: 'QUEUED',
      progressPercent: 0,
      currentStep: 'Job queued in Redis/BullMQ processing queue',
    });

    this.queue.push({
      jobId: job.id,
      documentVersionId,
      organizationId,
    });

    // Fire processing asynchronously without blocking caller
    setImmediate(() => {
      this.processNext().catch((err) => {
        logger.error({ err: err?.message }, 'Unhandled error in ingestion queue runner');
      });
    });

    return job;
  }

  public async retry(
    organizationId: string,
    documentVersionId: string
  ): Promise<ProcessingJob> {
    const existing = await this.dataStore.getLatestProcessingJobByVersion(documentVersionId);
    if (!existing) {
      throw new Error(`No processing job found for document version '${documentVersionId}'.`);
    }

    const retriedJob = await this.dataStore.incrementJobRetryCount(existing.id);

    this.queue.push({
      jobId: retriedJob.id,
      documentVersionId,
      organizationId,
    });

    setImmediate(() => {
      this.processNext().catch((err) => {
        logger.error({ err: err?.message }, 'Unhandled error during job retry');
      });
    });

    return retriedJob;
  }

  /**
   * Processes all queued jobs sequentially (or concurrently per tenant)
   */
  public async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const payload = this.queue.shift();
        if (payload) {
          await this.processor.processJob(payload);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * For integration testing: waits until all currently queued jobs finish processing
   */
  public async waitForAll(): Promise<void> {
    while (this.queue.length > 0 || this.isProcessing) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import type { IVisionProcessingProvider } from '../ai/vision.interface.js';
import { DocumentParser } from '../ingestion/documentParser.js';
import { ContentChunker } from '../ingestion/contentChunker.js';
import { logger } from '../utils/logger.js';

export interface ProcessDocumentOptions {
  jobId: string;
  documentVersionId: string;
  organizationId: string;
}

export class IngestionProcessor {
  private parser: DocumentParser;
  private chunker: ContentChunker;

  constructor(
    private dataStore: IDataStore,
    private storageAdapter: IStorageAdapter,
    private embeddingAdapter: IEmbeddingAdapter,
    private vectorStore: IVectorStoreAdapter,
    private collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge',
    visionProvider?: IVisionProcessingProvider
  ) {
    this.parser = new DocumentParser(visionProvider);
    this.chunker = new ContentChunker();
  }

  public async processJob(opts: ProcessDocumentOptions): Promise<void> {
    const { jobId, documentVersionId, organizationId } = opts;

    try {
      // 1. Mark Job as PROCESSING
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        10,
        'Verifying document storage and permissions',
        'PROCESSING'
      );

      // 2. Load Version and Document records
      const version = await this.dataStore.getDocumentVersionById(documentVersionId);
      if (!version) {
        throw new Error(`Document version '${documentVersionId}' does not exist.`);
      }

      const document = await this.dataStore.getDocumentById(organizationId, version.documentId);
      if (!document) {
        throw new Error(`Document '${version.documentId}' does not exist or unauthorized.`);
      }

      // Update version status to PROCESSING
      await this.dataStore.updateDocumentVersionStatus(version.id, 'PROCESSING');

      // 3. Retrieve raw document buffer from storage adapter
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        25,
        'Retrieving binary payload from object storage'
      );
      const buffer = await this.storageAdapter.getObject(version.storageKey);

      // 4. Parse document layout, page boundaries, headings, and OCR if scanned
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        40,
        'Parsing layout, headings, tables, and applying OCR if scanned'
      );
      const extracted = await this.parser.parse(
        buffer,
        version.mimeType,
        version.filename,
        {
          documentNumber: document.documentNumber,
          title: document.title,
          category: document.category,
          assetTags: document.assetTags,
          checksumSha256: version.checksumSha256,
        }
      );

      // 5. Save Document Pages with provenance (idempotent overwrite)
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        55,
        `Saving ${extracted.pages.length} document pages with provenance`
      );
      await this.dataStore.deleteDocumentPages(version.id);
      await this.dataStore.saveDocumentPages(
        extracted.pages.map((p) => ({
          documentVersionId: version.id,
          pageNumber: p.pageNumber,
          rawText: p.rawText,
          sectionHeadings: p.sectionHeadings,
          extractionMethod: p.extractionMethod,
          hasTables: p.hasTables,
        }))
      );

      // 6. Generate semantic chunks with deterministic IDs (idempotent)
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        70,
        'Generating provenance-preserving semantic chunks'
      );
      const chunkDrafts = this.chunker.chunkPages(version.id, extracted.pages);

      // Clear previous chunks and vector records for this version if re-processing
      await this.dataStore.deleteKnowledgeChunks(version.id);
      await this.vectorStore.deleteByFilter(this.collectionName, {
        documentVersionId: version.id,
        organizationId,
      });

      // 7. Generate vector embeddings
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        80,
        `Generating dense embeddings for ${chunkDrafts.length} chunks via ${this.embeddingAdapter.getModelName()}`
      );
      const chunkTexts = chunkDrafts.map((c) => c.content);
      const embeddings = await this.embeddingAdapter.generateEmbeddings(chunkTexts);

      // 8. Index vectors into Vector Store with strict tenant authorization payload
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        90,
        'Indexing chunks with authorized metadata into vector database'
      );

      const vectorPoints: VectorPoint[] = chunkDrafts.map((chunk, idx) => ({
        id: chunk.qdrantPointId,
        vector: embeddings[idx],
        payload: {
          organizationId: document.organizationId,
          plantId: document.plantId,
          documentId: document.id,
          documentVersionId: version.id,
          revision: version.revision,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          sectionHeading: chunk.sectionHeading,
          isTable: chunk.isTable,
          isFigure: chunk.isFigure,
          extractionMethod: chunk.extractionMethod,
          documentNumber: document.documentNumber,
          title: document.title,
          category: document.category,
          assetTags: document.assetTags || [],
        },
      }));

      await this.vectorStore.ensureCollection(
        this.collectionName,
        this.embeddingAdapter.getDimensions()
      );
      await this.vectorStore.upsertPoints(this.collectionName, vectorPoints);

      // 9. Persist knowledge chunks in relational store
      await this.dataStore.saveKnowledgeChunks(
        chunkDrafts.map((c) => ({
          documentVersionId: c.documentVersionId,
          pageNumber: c.pageNumber,
          chunkIndex: c.chunkIndex,
          qdrantPointId: c.qdrantPointId,
          content: c.content,
          sectionHeading: c.sectionHeading,
          isTable: c.isTable,
          isFigure: c.isFigure,
          extractionMethod: c.extractionMethod,
          tokenCount: c.tokenCount,
        }))
      );

      // 10. Finalize: Never report indexing success before all required indexing steps finish
      await this.dataStore.updateDocumentVersionStatus(
        version.id,
        'INDEXED',
        extracted.totalPages,
        chunkDrafts.length,
        null
      );

      await this.dataStore.updateProcessingJobProgress(
        jobId,
        100,
        `Successfully indexed ${extracted.totalPages} pages and ${chunkDrafts.length} chunks`,
        'INDEXED',
        null
      );

      logger.info(
        {
          jobId,
          documentId: document.id,
          versionId: version.id,
          pages: extracted.totalPages,
          chunks: chunkDrafts.length,
        },
        'Document ingestion successfully completed'
      );
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown document processing error';

      // Keep extraction errors and retry information observable without leaking document contents into logs
      logger.error(
        {
          jobId,
          documentVersionId,
          error: errorMsg,
        },
        'Document processing job failed'
      );

      await this.dataStore.updateDocumentVersionStatus(
        documentVersionId,
        'FAILED',
        undefined,
        undefined,
        errorMsg
      );

      await this.dataStore.updateProcessingJobProgress(
        jobId,
        0,
        'Processing failed',
        'FAILED',
        errorMsg
      );
    }
  }
}

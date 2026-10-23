import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IEmbeddingAdapter } from '../embeddings/embeddings.interface.js';
import type { IVectorStoreAdapter, VectorPoint } from '../vector/vectorStore.interface.js';
import type { IVisionProcessingProvider } from '../ai/vision.interface.js';
import { DocumentParser } from '../ingestion/documentParser.js';
import { ContentChunker } from '../ingestion/contentChunker.js';
import { RecoveryAiExtractor } from '../services/recoveryAiExtractor.js';
import type { Machine } from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export interface ProcessDocumentOptions {
  jobId: string;
  documentVersionId: string;
  organizationId: string;
  machineId?: string;
}

export class IngestionProcessor {
  private parser: DocumentParser;
  private chunker: ContentChunker;
  private recoveryExtractor: RecoveryAiExtractor;

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
    this.recoveryExtractor = new RecoveryAiExtractor(dataStore);
  }

  public async processJob(opts: ProcessDocumentOptions): Promise<void> {
    const { jobId, documentVersionId, organizationId, machineId } = opts;

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
        'Retrieving binary payload from object storage',
        'PROCESSING'
      );
      const buffer = await this.storageAdapter.getObject(version.storageKey);

      // 4. Parse document layout, page boundaries, headings, and OCR if scanned
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        45,
        'Parsing layout, headings, tables, and applying OCR if scanned',
        'PROCESSING'
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
        60,
        `Extracted ${extracted.pages.length} document pages with provenance`,
        'PROCESSING'
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
        75,
        'Generating provenance-preserving semantic chunks',
        'PROCESSING'
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
        85,
        `Generating dense embeddings for ${chunkDrafts.length} chunks via ${this.embeddingAdapter.getModelName()}`,
        'PROCESSING'
      );
      const chunkTexts = chunkDrafts.map((c) => c.content);
      const embeddings = await this.embeddingAdapter.generateEmbeddings(chunkTexts);

      // 8. Index vectors into Vector Store with strict tenant and machine authorization payload
      await this.dataStore.updateProcessingJobProgress(
        jobId,
        92,
        'Indexing chunks with authorized metadata into vector database',
        'PROCESSING'
      );

      const resolvedMachineId =
        machineId ||
        (document as any).machineId ||
        ((document as any).assetIds && (document as any).assetIds.length > 0 ? (document as any).assetIds[0] : undefined) ||
        (document.assetTags && document.assetTags.length > 0 ? document.assetTags[0] : undefined);

      const linkedAssetIds: string[] = (document as any).assetIds && (document as any).assetIds.length > 0
        ? (document as any).assetIds
        : (resolvedMachineId ? [resolvedMachineId] : []);

      const vectorPoints: VectorPoint[] = chunkDrafts.map((chunk, idx) => ({
        id: chunk.qdrantPointId,
        vector: embeddings[idx],
        payload: {
          organizationId: document.organizationId,
          plantId: document.plantId,
          machineId: resolvedMachineId,
          assetId: resolvedMachineId,
          asset_id: resolvedMachineId,
          assetIds: linkedAssetIds,
          asset_ids: linkedAssetIds,
          documentId: document.id,
          documentNumber: document.documentNumber,
          documentTitle: document.title,
          documentVersionId: version.id,
          revision: version.revision,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          sectionHeading: chunk.sectionHeading,
          isTable: chunk.isTable,
          isFigure: chunk.isFigure,
          extractionMethod: chunk.extractionMethod,
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

      // 9b. AI Machine Recovery Nameplate & Operating Limits Extraction
      try {
        const candidateMachineIds: string[] = [];
        if (machineId) candidateMachineIds.push(machineId);
        if ((document as any).machineId) candidateMachineIds.push((document as any).machineId);
        if ((document as any).assetIds && Array.isArray((document as any).assetIds)) {
          candidateMachineIds.push(...(document as any).assetIds);
        }

        try {
          const linkedFromJunction = await this.dataStore.getLinkedMachineIdsForDocument(organizationId, document.id);
          candidateMachineIds.push(...linkedFromJunction);
        } catch {
          // ignore
        }

        const targetMachines: Machine[] = [];
        for (const mId of candidateMachineIds) {
          if (!mId) continue;
          try {
            const m = await this.dataStore.getMachineById(organizationId, mId);
            if (m && !targetMachines.some((item) => item.id === m.id)) {
              targetMachines.push(m);
            }
          } catch {
            // ignore
          }
        }

        if (targetMachines.length === 0 && document.assetTags && document.assetTags.length > 0) {
          for (const tag of document.assetTags) {
            try {
              const m = await this.dataStore.getMachineByAssetTag(organizationId, tag);
              if (m && !targetMachines.some((item) => item.id === m.id)) {
                targetMachines.push(m);
              }
            } catch {
              // ignore
            }
          }
        }

        // Automatic fallback: scan document text and tags against registered machines
        if (targetMachines.length === 0) {
          try {
            const allOrgMachines = await this.dataStore.listMachines(organizationId);
            const docTags = document.assetTags || [];
            const pageText = extracted.pages.slice(0, 5).map((p) => p.rawText.toUpperCase()).join(' ');

            for (const m of allOrgMachines) {
              const tagUpper = m.assetTag.toUpperCase();
              if (docTags.some((t) => t.toUpperCase() === tagUpper) || pageText.includes(tagUpper)) {
                if (!targetMachines.some((item) => item.id === m.id)) {
                  targetMachines.push(m);
                  this.dataStore.linkDocumentToAsset(organizationId, document.id, m.id, m.assetTag).catch(() => {});
                }
              }
            }
          } catch {
            // ignore
          }
        }

        if (targetMachines.length > 0) {
          await this.dataStore.updateProcessingJobProgress(
            jobId,
            96,
            `Running AI extraction for ${targetMachines.length} linked machine(s)`,
            'PROCESSING'
          );

          await this.recoveryExtractor.extractAndSaveMachineRecoveryClaims({
            organizationId,
            document,
            version,
            extractedPages: extracted.pages,
            targetMachines,
            submittedByUserId: (document as any).createdByUserId || 'system',
          });
        }
      } catch (extractErr: any) {
        logger.warn(
          { err: extractErr?.message, documentId: document.id },
          'Notice: Machine Recovery AI extraction non-blocking error'
        );
      }

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
      const isUnsupported = errorMsg.includes('UNSUPPORTED_FORMAT') || errorMsg.includes('Unsupported file format');

      // Keep extraction errors and retry information observable without leaking document contents into logs
      logger.error(
        {
          jobId,
          documentVersionId,
          error: errorMsg,
          isUnsupported,
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
        isUnsupported ? 'Unsupported document format' : 'Processing failed',
        'FAILED',
        errorMsg
      );
    }
  }
}

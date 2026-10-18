import type { IDataStore } from '../db/dataStore.interface.js';
import type { ITextEmbeddingProvider } from '../ai/ai.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import type {
  IMultimodalGenerationProvider,
  IRerankingProvider,
  GenerationEvidenceItem,
  RerankCandidate,
} from '../ai/ai.interface.js';
import type {
  RAGQueryRequest,
  RAGQueryResponse,
  Citation,
  CopilotMessage,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export interface RAGContext {
  organizationId: string;
  userId: string;
}

export class RAGQueryEngine {
  constructor(
    private dataStore: IDataStore,
    private embeddingProvider: ITextEmbeddingProvider,
    private vectorStore: IVectorStoreAdapter,
    private generationProvider: IMultimodalGenerationProvider,
    private rerankingProvider: IRerankingProvider,
    private collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge'
  ) {}

  public async query(
    request: RAGQueryRequest,
    context: RAGContext
  ): Promise<RAGQueryResponse> {
    const { organizationId, userId } = context;
    const { plantId, assetId, query, conversationId, imageUrl, topK = 5 } = request;

    // 1. Establish & Validate Asset & Plant Authorization
    const plant = await this.dataStore.getPlantById(organizationId, plantId);
    if (!plant) {
      throw new Error(`Unauthorized or invalid plant: Plant '${plantId}' does not belong to organization.`);
    }

    let assetContext: { assetTag: string; name: string; area: string } | null = null;
    if (assetId) {
      const asset = await this.dataStore.getAssetById(organizationId, assetId);
      if (!asset) {
        throw new Error(`Unauthorized or invalid asset: Asset '${assetId}' does not belong to organization.`);
      }
      if (asset.plantId !== plantId) {
        throw new Error(`Asset '${assetId}' does not belong to the selected plant '${plantId}'.`);
      }
      assetContext = {
        assetTag: asset.assetTag,
        name: asset.name,
        area: asset.area,
      };
    }

    // 2. Resolve or Create Conversation Thread
    let conversation;
    if (conversationId) {
      conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      if (!conversation) {
        throw new Error(`Conversation '${conversationId}' not found or unauthorized for this tenant.`);
      }
    } else {
      const title = query.length > 50 ? `${query.slice(0, 47)}...` : query;
      conversation = await this.dataStore.createConversation({
        organizationId,
        plantId,
        assetId: assetId ?? null,
        userId,
        title,
      });
    }

    // 3. Persist User Message
    const userMessage = await this.dataStore.createMessage({
      conversationId: conversation.id,
      senderType: 'USER',
      content: query,
    });

    // 4. Retrieve Candidate Chunks (Semantic Vector Search with Strict Tenant Filter)
    const queryVector = await this.embeddingProvider.generateEmbedding(query);

    // CRITICAL: Vector search filter strictly applies organizationId and plantId BEFORE evidence reaches the model
    const vectorHits = await this.vectorStore.search(
      this.collectionName,
      queryVector,
      {
        organizationId,
        plantId,
      },
      topK * 3 // retrieve surplus candidates for reranking
    );

    // 5. Pre-Generation Authorization Verification: Ensure every candidate belongs to an active tenant document
    const candidates: RerankCandidate[] = [];
    for (const hit of vectorHits) {
      const payload = hit.payload;
      // Double check tenant ownership
      if (payload.organizationId !== organizationId) {
        logger.warn(
          { attemptedOrgId: payload.organizationId, expectedOrgId: organizationId },
          'Security violation: Cross-tenant chunk intercepted in vector hits; dropped immediately'
        );
        continue;
      }

      // Verify parent document exists and belongs to this organization
      const doc = await this.dataStore.getDocumentById(organizationId, payload.documentId as string);
      if (!doc) continue;

      candidates.push({
        chunkId: (payload.chunkId as string) || hit.id,
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        documentTitle: doc.title,
        documentVersionId: (payload.documentVersionId as string) || '',
        pageNumber: Number(payload.pageNumber) || 1,
        content: (payload.content as string) || '',
        sectionHeading: (payload.sectionHeading as string) || null,
        initialScore: hit.score,
        isTable: Boolean(payload.isTable),
        isFigure: Boolean(payload.isFigure),
        extractionMethod: (payload.extractionMethod as string) || 'NATIVE_TEXT',
      });
    }

    // 6. Rerank Candidates
    const reranked = await this.rerankingProvider.rerank(query, candidates, topK);

    // Convert reranked candidates into authorized evidence items
    const authorizedEvidence: GenerationEvidenceItem[] = reranked.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentNumber: r.documentNumber,
      documentTitle: r.documentTitle,
      documentVersionId: r.documentVersionId,
      pageNumber: r.pageNumber,
      content: r.content,
      sectionHeading: r.sectionHeading,
      score: r.rerankScore,
    }));

    // 7. Invoke Generation Model (Enforcing Grounding & Sandwich Defense)
    let generationResult;
    if (imageUrl) {
      generationResult = await this.generationProvider.generateWithImage({
        query,
        authorizedEvidence,
        assetContext,
        plantContext: { code: plant.code, name: plant.name },
        imageUrl,
      });
    } else {
      generationResult = await this.generationProvider.generateAnswer({
        query,
        authorizedEvidence,
        assetContext,
        plantContext: { code: plant.code, name: plant.name },
      });
    }

    // 8. Persist Assistant Message
    const assistantMessage = await this.dataStore.createMessage({
      conversationId: conversation.id,
      senderType: 'ASSISTANT',
      content: generationResult.answerText,
      confidence: generationResult.confidence,
      isInsufficientEvidence: generationResult.isInsufficientEvidence,
      conflictDetected: generationResult.conflictDetected,
      conflictDetails: generationResult.conflictDetails,
    });

    // 9. Construct and Validate Citations
    // Rule: Validate that citations refer to real, accessible evidence. Never fabricate citations.
    const citationsToSave = [];
    if (!generationResult.isInsufficientEvidence) {
      for (const chunkId of generationResult.usedEvidenceChunkIds) {
        const evidenceMatch = authorizedEvidence.find((e) => e.chunkId === chunkId);
        if (evidenceMatch) {
          citationsToSave.push({
            messageId: assistantMessage.id,
            documentId: evidenceMatch.documentId,
            documentVersionId: evidenceMatch.documentVersionId,
            pageNumber: evidenceMatch.pageNumber,
            knowledgeChunkId: evidenceMatch.chunkId,
            snippet: evidenceMatch.content.slice(0, 280),
            confidenceScore: evidenceMatch.score,
            sectionHeading: evidenceMatch.sectionHeading,
          });
        }
      }
    }

    const savedCitations: Citation[] = await this.dataStore.createCitations(citationsToSave);

    const completeAssistantMessage: CopilotMessage = {
      ...assistantMessage,
      citations: savedCitations,
    };

    return {
      conversationId: conversation.id,
      userMessage,
      assistantMessage: completeAssistantMessage,
    };
  }
}

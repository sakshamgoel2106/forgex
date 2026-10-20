import type { IDataStore } from '../db/dataStore.interface.js';
import type { IStorageAdapter } from '../storage/storage.interface.js';
import type { IVisionProcessingProvider } from '../ai/vision.interface.js';
import type { RAGQueryEngine } from './ragQueryEngine.js';
import type {
  VisualAsset,
  VisualAssetType,
  VisualInspectionRequest,
  VisualInspectionResponse,
  ComponentLabel,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
import crypto from 'node:crypto';
import { sanitizeFilename } from '../ingestion/fileValidator.js';

export interface VisualEngineContext {
  organizationId: string;
  userId: string;
}

export class VisualIntelligenceEngine {
  constructor(
    private dataStore: IDataStore,
    private storageAdapter: IStorageAdapter,
    private visionProvider: IVisionProcessingProvider,
    private ragEngine: RAGQueryEngine
  ) {}

  /**
   * Process and analyze an industrial visual asset (photograph, P&ID, diagram, or page image)
   * and cross-retrieve related authorized manual passages.
   */
  public async inspectVisual(
    request: VisualInspectionRequest,
    context: VisualEngineContext,
    fileBuffer?: Buffer,
    originalFilename?: string,
    mimeType?: string
  ): Promise<VisualInspectionResponse> {
    const { organizationId, userId } = context;
    const { plantId, assetId, query, visualAssetId } = request;

    // 1. Establish & Validate Plant Ownership & Document Permissions
    const plant = await this.dataStore.getPlantById(organizationId, plantId);
    if (!plant) {
      throw new Error(`Unauthorized or invalid plant: Plant '${plantId}' does not belong to organization.`);
    }

    if (assetId) {
      const asset = await this.dataStore.getAssetById(organizationId, assetId);
      if (!asset) {
        throw new Error(`Unauthorized or invalid asset: Asset '${assetId}' does not belong to organization.`);
      }
    }

    let visualAsset: VisualAsset;
    let bufferToAnalyze: Buffer | string;
    let resolvedMimeType = mimeType || 'image/png';
    let resolvedFilename = originalFilename || request.filename || 'visual_asset.png';

    // 2. Resolve or Ingest Visual Asset
    if (visualAssetId) {
      const existing = await this.dataStore.getVisualAssetById(organizationId, visualAssetId);
      if (!existing) {
        throw new Error(`Visual asset '${visualAssetId}' not found or unauthorized for organization.`);
      }
      visualAsset = existing;
      bufferToAnalyze = await this.storageAdapter.getObject(existing.storageKey);
      resolvedMimeType = existing.mimeType;
      resolvedFilename = existing.filename;
    } else {
      if (!fileBuffer && !request.imageBuffer) {
        throw new Error('Inspection failed: No image file or buffer provided.');
      }

      bufferToAnalyze = fileBuffer || Buffer.from(request.imageBuffer || '', 'base64');
      const fileSizeBytes = Buffer.isBuffer(bufferToAnalyze)
        ? bufferToAnalyze.length
        : Buffer.byteLength(bufferToAnalyze);

      // Enforce supported formats
      const supportedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!supportedMimes.includes(resolvedMimeType.toLowerCase())) {
        throw new Error(
          `Unsupported visual asset type '${resolvedMimeType}'. Supported formats are PNG, JPEG, and WebP.`
        );
      }

      // Generate server-controlled storage key with sanitized filename
      const safeFilename = sanitizeFilename(resolvedFilename);
      const storageKey = `visual/${organizationId}/${crypto.randomUUID()}-${safeFilename}`;
      const payloadBuffer = Buffer.isBuffer(bufferToAnalyze)
        ? bufferToAnalyze
        : Buffer.from(bufferToAnalyze, 'base64');
      await this.storageAdapter.putObject(storageKey, payloadBuffer, resolvedMimeType);

      // Determine asset type
      const lower = resolvedFilename.toLowerCase();
      let assetType: VisualAssetType = 'USER_UPLOAD';
      if (lower.includes('pid') || lower.includes('schematic') || lower.includes('p&id')) {
        assetType = 'PID_RENDER';
      } else if (lower.includes('diagram') || lower.includes('drawing')) {
        assetType = 'DIAGRAM';
      } else if (lower.includes('page') || lower.includes('manual')) {
        assetType = 'MANUAL_PAGE';
      } else if (
        lower.includes('photo') ||
        lower.includes('walkdown') ||
        lower.includes('nameplate') ||
        lower.includes('rating_plate')
      ) {
        assetType = 'PHOTOGRAPH';
      }

      // Initial visual extraction
      const analysisResult = await this.visionProvider.analyzeImage({
        imageBuffer: bufferToAnalyze,
        filename: resolvedFilename,
        mimeType: resolvedMimeType,
        query,
      });

      // Filter component labels: only connect equipment reference if confidence >= 0.70
      const connectedComponents: ComponentLabel[] = analysisResult.components.map((c) => {
        if (c.confidence < 0.70) {
          return {
            ...c,
            equipmentTag: null, // Drop equipment link when confidence is insufficient
          };
        }
        return c;
      });

      logger.info(
        { organizationId, plantId, filename: resolvedFilename, modelUsed: analysisResult.modelUsed },
        'Visual intelligence engine processed asset'
      );

      visualAsset = await this.dataStore.createVisualAsset({
        organizationId,
        plantId,
        documentVersionId: request.documentVersionId || undefined,
        pageNumber: request.pageNumber || undefined,
        assetType,
        storageKey,
        filename: resolvedFilename,
        mimeType: resolvedMimeType,
        fileSizeBytes,
        description: analysisResult.description,
        equipmentTags: analysisResult.equipmentTags,
        componentLabels: connectedComponents,
        extractionMethod: analysisResult.processingMethod,
        modelUsed: analysisResult.modelUsed,
        confidenceScore: analysisResult.confidenceScore,
        isAmbiguous: analysisResult.isAmbiguous,
      });
    }

    // 3. Handle Insufficient Visual Evidence
    const analysis = await this.visionProvider.analyzeImage({
      imageBuffer: bufferToAnalyze,
      filename: resolvedFilename,
      mimeType: resolvedMimeType,
      query,
    });

    if (analysis.isInsufficientEvidence) {
      return {
        visualAsset,
        detectedTags: [],
        connectedComponents: [],
        visualDescription: analysis.description,
        answer:
          'Insufficient visual evidence: The submitted image does not contain identifiable equipment features, nameplates, or legible diagram symbols. Please supply a clear, well-lit photograph or high-resolution schematic.',
        confidence: 'INSUFFICIENT_EVIDENCE',
        isInsufficientEvidence: true,
        isAmbiguousDiagram: false,
        crossRetrievedManualCitations: [],
        modelUsed: analysis.modelUsed,
        processingMethod: analysis.processingMethod,
      };
    }

    // 4. Handle Ambiguous Diagrams
    if (analysis.isAmbiguous) {
      return {
        visualAsset,
        detectedTags: analysis.equipmentTags,
        connectedComponents: analysis.components,
        visualDescription: analysis.description,
        answer: `WARNING: AMBIGUOUS DIAGRAM IDENTIFIED\n${analysis.ambiguityReason || 'Piping linework, flow arrows, or equipment tag annotations are degraded or overlapping.'}\nEscalation required: Field verification or original CAD drawing review required before relying on line connectivity.`,
        confidence: 'UNCERTAIN',
        isInsufficientEvidence: false,
        isAmbiguousDiagram: true,
        crossRetrievedManualCitations: [],
        modelUsed: analysis.modelUsed,
        processingMethod: analysis.processingMethod,
      };
    }

    // 5. Cross-Retrieval: Query Authorized Engineering Manuals (SOPs, Torque Matrices, LOTO)
    // Build cross-query combining technician question with detected equipment tags
    const targetTag = analysis.equipmentTags[0] || '';
    const crossRetrievalQuery = targetTag
      ? `${query} (Referencing verified equipment: ${targetTag})`
      : query;

    const ragResponse = await this.ragEngine.query(
      {
        plantId,
        assetId: assetId || undefined,
        query: crossRetrievalQuery,
        topK: 3,
      },
      {
        organizationId,
        userId,
      }
    );

    // 6. Connect equipment labels with verified citations
    const connectedComponents = visualAsset.componentLabels.map((c) => {
      if (c.confidence >= 0.70 && targetTag && !c.equipmentTag) {
        return {
          ...c,
          equipmentTag: targetTag,
        };
      }
      return c;
    });

    // 7. Formulate Multi-modal Grounded Answer
    let groundedAnswer = `### Visual Inspection Observations (${visualAsset.filename})\n`;
    groundedAnswer += `- Derived Description (${visualAsset.modelUsed}): ${visualAsset.description}\n`;

    if (analysis.equipmentTags.length > 0) {
      groundedAnswer += `- Detected Equipment Tags: ${analysis.equipmentTags.join(', ')}\n`;
    }

    if (connectedComponents.length > 0) {
      const topComp = connectedComponents[0];
      groundedAnswer += `- Primary Component Focus: ${topComp.label} (Confidence: ${(topComp.confidence * 100).toFixed(1)}%)\n`;
      if (topComp.bbox) {
        groundedAnswer += `  Region Coordinates: [x1: ${topComp.bbox.x1}, y1: ${topComp.bbox.y1}, x2: ${topComp.bbox.x2}, y2: ${topComp.bbox.y2}]\n`;
      }
    }

    groundedAnswer += `\n### Cross-Retrieved Operational Manual Evidence\n`;
    groundedAnswer += ragResponse.assistantMessage.content;

    if (visualAsset.assetType === 'PID_RENDER') {
      groundedAnswer += `\n\n*P&ID Notice: Visual extraction reads equipment tags and callouts. Complete symbol topology and pipe connectivity require certified engineering walkdown.*`;
    }

    return {
      visualAsset,
      detectedTags: visualAsset.equipmentTags,
      connectedComponents,
      visualDescription: visualAsset.description || analysis.description,
      answer: groundedAnswer,
      confidence: ragResponse.assistantMessage.confidence,
      isInsufficientEvidence: false,
      isAmbiguousDiagram: false,
      crossRetrievedManualCitations: ragResponse.assistantMessage.citations,
      modelUsed: visualAsset.modelUsed,
      processingMethod: visualAsset.extractionMethod,
    };
  }
}

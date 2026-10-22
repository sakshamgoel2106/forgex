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
    const { plantId, assetId, machineId, query, visualAssetId } = request;

    // 1. Establish & Validate Plant Ownership & Document Permissions
    const plant = await this.dataStore.getPlantById(organizationId, plantId);
    if (!plant) {
      throw new Error(`Unauthorized or invalid plant: Plant '${plantId}' does not belong to organization.`);
    }

    const effectiveMachineId = machineId || assetId;
    if (effectiveMachineId) {
      const machine = await this.dataStore.getMachineById(organizationId, effectiveMachineId);
      if (!machine) {
        // Also check getAssetById if machine not found directly
        const legacyAsset = await this.dataStore.getAssetById(organizationId, effectiveMachineId);
        if (!legacyAsset) {
          throw new Error(
            `Unauthorized or invalid asset/machine: '${effectiveMachineId}' does not belong to organization.`
          );
        }
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

      // Check empty or oversized file
      if (fileSizeBytes === 0) {
        throw new Error('Inspection failed: Uploaded image file or buffer is empty (0 bytes).');
      }
      if (fileSizeBytes > 52428800) {
        throw new Error('Inspection failed: Uploaded image exceeds 50MB maximum allowable file size.');
      }

      // Enforce supported formats by declared MIME type
      const supportedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!supportedMimes.includes(resolvedMimeType.toLowerCase())) {
        throw new Error(
          `Unsupported visual asset type '${resolvedMimeType}'. Supported formats are PNG, JPEG, and WebP.`
        );
      }

      // Content-aware magic byte verification for buffer
      const rawBuffer = Buffer.isBuffer(bufferToAnalyze)
        ? bufferToAnalyze
        : Buffer.from(bufferToAnalyze, 'base64');

      const isPng =
        rawBuffer.length >= 8 &&
        rawBuffer[0] === 0x89 &&
        rawBuffer[1] === 0x50 &&
        rawBuffer[2] === 0x4e &&
        rawBuffer[3] === 0x47;
      const isJpg =
        rawBuffer.length >= 3 &&
        rawBuffer[0] === 0xff &&
        rawBuffer[1] === 0xd8 &&
        rawBuffer[2] === 0xff;
      const isWebp =
        rawBuffer.length >= 12 &&
        rawBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        rawBuffer.subarray(8, 12).toString('ascii') === 'WEBP';

      if (!isPng && !isJpg && !isWebp) {
        throw new Error(
          'Validation failed: Corrupted or unreadable image. Missing valid PNG, JPEG, or WebP file signature.'
        );
      }

      // Generate server-controlled storage key with sanitized filename
      const safeFilename = sanitizeFilename(resolvedFilename);
      const storageKey = `visual/${organizationId}/${crypto.randomUUID()}-${safeFilename}`;
      await this.storageAdapter.putObject(storageKey, rawBuffer, resolvedMimeType);

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
        lower.includes('rating_plate') ||
        lower.includes('leak') ||
        lower.includes('corrosion') ||
        lower.includes('burn') ||
        lower.includes('guard')
      ) {
        assetType = 'PHOTOGRAPH';
      }

      visualAsset = await this.dataStore.createVisualAsset({
        organizationId,
        plantId,
        machineId: effectiveMachineId || undefined,
        documentVersionId: request.documentVersionId || undefined,
        pageNumber: request.pageNumber || undefined,
        assetType,
        storageKey,
        filename: resolvedFilename,
        mimeType: resolvedMimeType,
        fileSizeBytes,
        description: `Visual asset ${resolvedFilename} uploaded for industrial inspection`,
        equipmentTags: [],
        componentLabels: [],
        extractionMethod: 'PENDING',
        modelUsed: 'NONE',
        confidenceScore: 0,
        isAmbiguous: false,
        processingStatus: 'PROCESSING',
      });
    }

    // 3. Perform Actual Vision Analysis via Configured Provider
    const analysis = await this.visionProvider.analyzeImage({
      imageBuffer: bufferToAnalyze,
      filename: resolvedFilename,
      mimeType: resolvedMimeType,
      query,
    });

    // Filter component labels: only connect equipment reference if confidence >= 0.70
    const connectedComponents: ComponentLabel[] = analysis.components.map((c) => {
      if (c.confidence < 0.70) {
        return {
          ...c,
          equipmentTag: null,
        };
      }
      return c;
    });

    // 4. Handle Insufficient Visual Evidence
    if (analysis.isInsufficientEvidence) {
      if (this.dataStore.updateVisualAsset) {
        await this.dataStore.updateVisualAsset(organizationId, visualAsset.id, {
          processingStatus: 'INSUFFICIENT_EVIDENCE',
          description: analysis.description,
          modelUsed: analysis.modelUsed,
          extractionMethod: analysis.processingMethod,
          confidenceScore: analysis.confidenceScore,
        });
      }

      return {
        visualAsset: {
          ...visualAsset,
          processingStatus: 'INSUFFICIENT_EVIDENCE',
          description: analysis.description,
          modelUsed: analysis.modelUsed,
          extractionMethod: analysis.processingMethod,
        },
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
        structuredAnalysis: analysis.structuredAnalysis,
      };
    }

    // 5. Handle Ambiguous Diagrams
    if (analysis.isAmbiguous) {
      if (this.dataStore.updateVisualAsset) {
        await this.dataStore.updateVisualAsset(organizationId, visualAsset.id, {
          processingStatus: 'PROCESSED',
          description: analysis.description,
          equipmentTags: analysis.equipmentTags,
          componentLabels: analysis.components,
          isAmbiguous: true,
          modelUsed: analysis.modelUsed,
          extractionMethod: analysis.processingMethod,
          confidenceScore: analysis.confidenceScore,
        });
      }

      return {
        visualAsset: {
          ...visualAsset,
          processingStatus: 'PROCESSED',
          description: analysis.description,
          equipmentTags: analysis.equipmentTags,
          componentLabels: analysis.components,
          isAmbiguous: true,
        },
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
        structuredAnalysis: analysis.structuredAnalysis,
      };
    }

    // 6. Cross-Retrieval: Query Authorized Engineering Manuals (SOPs, Torque Matrices, LOTO)
    const targetTag = analysis.equipmentTags[0] || '';
    const crossRetrievalQuery = targetTag
      ? `${query} (Referencing verified equipment: ${targetTag})`
      : query;

    const ragResponse = await this.ragEngine.query(
      {
        plantId,
        assetId: effectiveMachineId || undefined,
        query: crossRetrievalQuery,
        topK: 3,
      },
      {
        organizationId,
        userId,
      }
    );

    // 7. Connect equipment labels with verified citations
    const finalComponents = connectedComponents.map((c) => {
      if (c.confidence >= 0.70 && targetTag && !c.equipmentTag) {
        return {
          ...c,
          equipmentTag: targetTag,
        };
      }
      return c;
    });

    // 8. Formulate Grounded Industrial Intelligence Report
    let groundedAnswer = `### Visual Inspection Observations (${resolvedFilename})\n`;
    groundedAnswer += `- Derived Description (${analysis.modelUsed}): ${analysis.description}\n`;

    if (analysis.equipmentTags.length > 0) {
      groundedAnswer += `- Detected Equipment Tags: ${analysis.equipmentTags.join(', ')}\n`;
    }

    if (finalComponents.length > 0) {
      const topComp = finalComponents[0];
      groundedAnswer += `- Primary Component Focus: ${topComp.label} (Confidence: ${(topComp.confidence * 100).toFixed(1)}%)\n`;
      if (topComp.bbox) {
        groundedAnswer += `  Region Coordinates: [x1: ${topComp.bbox.x1}, y1: ${topComp.bbox.y1}, x2: ${topComp.bbox.x2}, y2: ${topComp.bbox.y2}]\n`;
      }
    }
    groundedAnswer += `\n`;

    // 9. Structured Observations, Hypotheses, Verification Steps, and Safety Warnings
    if (analysis.structuredAnalysis) {
      const sa = analysis.structuredAnalysis;

      if (sa.visibleObservations && sa.visibleObservations.length > 0) {
        groundedAnswer += `#### 1. Directly Visible Observations\n`;
        for (const obs of sa.visibleObservations) {
          groundedAnswer += `- [${obs.category}] ${obs.observation}`;
          if (obs.locationDescription) groundedAnswer += ` (Location: ${obs.locationDescription})`;
          groundedAnswer += `\n`;
        }
        groundedAnswer += `\n`;
      }

      if (sa.hypotheses && sa.hypotheses.length > 0) {
        groundedAnswer += `#### 2. Potential Hypotheses (Unconfirmed Root Cause)\n`;
        for (const hyp of sa.hypotheses) {
          groundedAnswer += `- ${hyp}\n`;
        }
        groundedAnswer += `*Notice: Observations from images represent potential hypotheses and do NOT constitute confirmed root-cause diagnosis.*\n\n`;
      }

      if (sa.recommendedVerificationSteps && sa.recommendedVerificationSteps.length > 0) {
        groundedAnswer += `#### 3. Recommended Physical Verification Steps\n`;
        for (const step of sa.recommendedVerificationSteps) {
          groundedAnswer += `- [ ] ${step}\n`;
        }
        groundedAnswer += `\n`;
      }

      if (sa.safetyEscalationWarnings && sa.safetyEscalationWarnings.length > 0) {
        groundedAnswer += `#### 4. Industrial Safety & Escalation Notice\n`;
        for (const warn of sa.safetyEscalationWarnings) {
          groundedAnswer += `> ⚠️ **SAFETY ALERT:** ${warn}\n`;
        }
        groundedAnswer += `\n`;
      }

      if (sa.limitations && sa.limitations.length > 0) {
        groundedAnswer += `#### 5. Analysis Limitations\n`;
        for (const lim of sa.limitations) {
          groundedAnswer += `* ${lim}\n`;
        }
        groundedAnswer += `\n`;
      }
    }

    groundedAnswer += `#### 6. Cross-Retrieved Operational Manual Evidence\n`;
    groundedAnswer += ragResponse.assistantMessage.content;

    if (visualAsset.assetType === 'PID_RENDER') {
      groundedAnswer += `\n\n*P&ID Notice: Visual extraction reads equipment tags and callouts. Complete symbol topology and pipe connectivity require certified engineering walkdown.*`;
    }

    // 10. Update DB record with completed analysis
    if (this.dataStore.updateVisualAsset) {
      await this.dataStore.updateVisualAsset(organizationId, visualAsset.id, {
        processingStatus: 'PROCESSED',
        description: analysis.description,
        equipmentTags: analysis.equipmentTags,
        componentLabels: finalComponents,
        modelUsed: analysis.modelUsed,
        extractionMethod: analysis.processingMethod,
        confidenceScore: analysis.confidenceScore,
        isAmbiguous: false,
      });
    }

    const updatedAsset: VisualAsset = {
      ...visualAsset,
      description: analysis.description,
      equipmentTags: analysis.equipmentTags,
      componentLabels: finalComponents,
      modelUsed: analysis.modelUsed,
      extractionMethod: analysis.processingMethod,
      confidenceScore: analysis.confidenceScore,
      processingStatus: 'PROCESSED',
      isAmbiguous: false,
    };

    logger.info({ visualAssetId: visualAsset.id, modelUsed: analysis.modelUsed }, 'Visual inspection completed');

    return {
      visualAsset: updatedAsset,
      detectedTags: analysis.equipmentTags,
      connectedComponents: finalComponents,
      visualDescription: analysis.description,
      answer: groundedAnswer,
      confidence: ragResponse.assistantMessage.confidence,
      isInsufficientEvidence: false,
      isAmbiguousDiagram: false,
      crossRetrievedManualCitations: ragResponse.assistantMessage.citations,
      modelUsed: analysis.modelUsed,
      processingMethod: analysis.processingMethod,
      structuredAnalysis: analysis.structuredAnalysis,
    };
  }
}

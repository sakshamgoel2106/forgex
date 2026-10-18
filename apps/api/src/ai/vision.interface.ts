import type { ComponentLabel, NormalizedBoundingBox } from '@forgex/shared-types';

export type { NormalizedBoundingBox };

export interface VisionAnalysisRequest {
  imageBuffer: Buffer | string; // Buffer or Base64 string
  filename: string;
  mimeType: string;
  documentContext?: {
    documentNumber?: string;
    pageNumber?: number;
    title?: string;
  };
  query?: string;
}

export interface VisionAnalysisResult {
  description: string;
  equipmentTags: string[];
  components: ComponentLabel[];
  isAmbiguous: boolean;
  ambiguityReason?: string | null;
  isInsufficientEvidence: boolean;
  confidenceScore: number;
  modelUsed: string;
  processingMethod: string;
}

export interface IVisionProcessingProvider {
  getModelIdentifier(): string;
  getProcessingMethod(): string;
  analyzeImage(request: VisionAnalysisRequest): Promise<VisionAnalysisResult>;
}

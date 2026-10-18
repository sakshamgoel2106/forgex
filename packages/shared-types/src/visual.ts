import type { AnswerConfidence, Citation } from './rag.js';

export type VisualAssetType =
  | 'PHOTOGRAPH'
  | 'MANUAL_PAGE'
  | 'DIAGRAM'
  | 'PID_RENDER'
  | 'USER_UPLOAD';

export interface NormalizedBoundingBox {
  x1: number; // Normalized coordinate 0..1000
  y1: number;
  x2: number;
  y2: number;
}

export interface ComponentLabel {
  id: string;
  label: string;
  equipmentTag?: string | null;
  confidence: number;
  bbox?: NormalizedBoundingBox | null;
  sourceReference?: string | null;
}

export interface VisualAsset {
  id: string;
  organizationId: string;
  plantId?: string | null;
  documentId?: string | null;
  documentVersionId?: string | null;
  pageNumber?: number | null;
  assetType: VisualAssetType;
  storageKey: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  width?: number | null;
  height?: number | null;
  description?: string | null;
  equipmentTags: string[];
  componentLabels: ComponentLabel[];
  extractionMethod: string;
  modelUsed: string;
  confidenceScore: number;
  isAmbiguous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VisualInspectionRequest {
  visualAssetId?: string;
  imageBuffer?: string; // base64 or memory buffer reference
  filename?: string;
  mimeType?: string;
  query: string;
  plantId: string;
  assetId?: string | null;
  equipmentTagHint?: string | null;
  documentVersionId?: string | null;
  pageNumber?: number | null;
  sourceReference?: string | null;
}

export interface VisualInspectionResponse {
  visualAsset: VisualAsset;
  detectedTags: string[];
  connectedComponents: ComponentLabel[];
  visualDescription: string;
  answer: string;
  confidence: AnswerConfidence;
  isInsufficientEvidence: boolean;
  isAmbiguousDiagram: boolean;
  crossRetrievedManualCitations: Citation[];
  modelUsed: string;
  processingMethod: string;
}

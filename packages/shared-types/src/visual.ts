import type { AnswerConfidence, Citation } from './rag.js';

export type VisualAssetType =
  | 'PHOTOGRAPH'
  | 'MANUAL_PAGE'
  | 'DIAGRAM'
  | 'PID_RENDER'
  | 'USER_UPLOAD'
  | 'CAD_MODEL'
  | 'ENGINEERING_DRAWING';

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
  machineId?: string | null;
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
  processingStatus?:
    | 'UPLOADED'
    | 'QUEUED'
    | 'PROCESSING'
    | 'EXTRACTED'
    | 'INDEXING'
    | 'INDEXED'
    | 'PROCESSED'
    | 'ANALYSIS_COMPLETED'
    | 'INSUFFICIENT_EVIDENCE'
    | 'FAILED'
    | 'UNSUPPORTED_FORMAT';
  uploadedByUserId?: string | null;
  dataClassification?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisualObservationItem {
  id: string;
  observation: string;
  category:
    | 'VISIBLE_LEAKAGE_OR_FLUID_STAINS'
    | 'CORROSION_OR_SURFACE_DAMAGE'
    | 'THERMAL_DISCOLORATION_OR_BURN_MARKS'
    | 'LOOSE_OR_DISPLACED_COMPONENT'
    | 'MISSING_GUARD_OR_SAFETY_CONCERN'
    | 'ABNORMAL_VISUAL_CONDITION'
    | 'GENERAL_CONDITION';
  locationDescription?: string;
  bbox?: NormalizedBoundingBox | null;
  severityHint?: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface StructuredIndustrialAnalysis {
  visibleSummary: string;
  visibleObservations: VisualObservationItem[];
  hypotheses: string[]; // Clearly labeled as hypotheses / possible explanations (NEVER confirmed root cause)
  recommendedVerificationSteps: string[]; // Recommended inspection or physical measurement
  safetyEscalationWarnings: string[]; // Condition requiring immediate safety escalation
  limitations: string[]; // Explicit limitations (e.g. image-only, internal temperature/pressure unknown)
  isRootCauseConfirmed: false; // Always false for image-only analysis
  requiresQualifiedTechnician: boolean;
}

export interface VisualInspectionRequest {
  visualAssetId?: string;
  imageBuffer?: string; // base64 or memory buffer reference
  filename?: string;
  mimeType?: string;
  query: string;
  plantId: string;
  assetId?: string | null;
  machineId?: string | null;
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
  structuredAnalysis?: StructuredIndustrialAnalysis;
}

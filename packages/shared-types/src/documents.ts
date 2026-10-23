/**
 * ForgeX AI — Phase 3: Document Metadata, Ingestion, Provenance, and Vector Contracts
 */

export type DocumentStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'INDEXED'
  | 'FAILED'
  | 'PENDING'
  | 'PARSING'
  | 'SEGMENTING';

export type DocumentType =
  | 'SOP'
  | 'PID_DIAGRAM'
  | '3D_MODEL'
  | 'OEM_MANUAL'
  | 'MANUAL'
  | 'SCHEMATIC_PID'
  | 'WIRING_DIAGRAM'
  | 'FAULT_CODE_INDEX'
  | 'SAFETY_DATA_SHEET';


export type ExtractionMethod =
  | 'NATIVE_TEXT'
  | 'OCR'
  | 'MARKDOWN_AST'
  | 'DOCX_XML'
  | 'IMAGE_METADATA';

export interface BoundingBox {
  pageNumber: number;
  x1: number; // Normalized coordinate [0..1000]
  y1: number;
  x2: number;
  y2: number;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  revision: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  storageKey: string;
  status: DocumentStatus;
  totalPages: number;
  totalChunks: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPage {
  id: string;
  documentVersionId: string;
  pageNumber: number;
  rawText: string;
  sectionHeadings: string[];
  extractionMethod: ExtractionMethod;
  hasTables: boolean;
  storageKey?: string | null;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentVersionId: string;
  documentId?: string;
  pageNumber: number;
  chunkIndex: number;
  qdrantPointId: string;
  content: string;
  sectionHeading?: string | null;
  isTable: boolean;
  isFigure: boolean;
  extractionMethod: ExtractionMethod;
  tokenCount: number;
  createdAt: string;
}

export interface ProcessingJob {
  id: string;
  organizationId: string;
  documentVersionId: string;
  status: DocumentStatus;
  progressPercent: number;
  currentStep?: string | null;
  retryCount: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicalDocument {
  id: string;
  organizationId: string;
  plantId: string;
  documentNumber: string;
  title: string;
  category: DocumentType;
  assetTags: string[];
  assetIds?: string[];
  machineId?: string;
  dataClassification?: string;
  isConfidential?: boolean;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  // Aggregate version details for quick listing
  latestVersion?: DocumentVersion;
  latestJob?: ProcessingJob;
  // Legacy aliases for backward compatibility
  tenantId?: string;
  type?: DocumentType;
  status?: DocumentStatus;
  fileSizeBytes?: number;
  mimeType?: string;
  storageKey?: string;
  checksumSha256?: string;
  totalPages?: number;
  totalChunks?: number;
  revision?: string;
  metadata?: Record<string, any>;
}

// Legacy alias
export type DocumentChunk = KnowledgeChunk;

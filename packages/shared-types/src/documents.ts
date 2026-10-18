/**
 * ForgeX AI — Document Metadata, Bounding Box, and Chunking Contracts
 */

export type DocumentStatus =
  | 'PENDING'
  | 'PARSING'
  | 'SEGMENTING'
  | 'INDEXED'
  | 'FAILED';

export type DocumentType =
  | 'SOP'
  | 'OEM_MANUAL'
  | 'SCHEMATIC_PID'
  | 'WIRING_DIAGRAM'
  | 'FAULT_CODE_INDEX'
  | 'SAFETY_DATA_SHEET';

export interface BoundingBox {
  pageNumber: number;
  x1: number; // Normalized coordinate [0..1000]
  y1: number;
  x2: number;
  y2: number;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number;
  boundingBox?: BoundingBox;
  sectionHeader?: string;
  isTable: boolean;
  isFigure: boolean;
  figureUrl?: string;
  assetTags: string[];
  tenantId: string;
  plantId: string;
}

export interface TechnicalDocument {
  id: string;
  title: string;
  documentNumber: string;
  revision: string;
  type: DocumentType;
  status: DocumentStatus;
  fileSizeBytes: number;
  mimeType: string;
  storageKey: string;
  checksumSha256: string;
  totalPages: number;
  totalChunks: number;
  tenantId: string;
  plantId: string;
  assetTags: string[];
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

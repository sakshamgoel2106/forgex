/**
 * ForgeX AI — Industrial Entities, Plants, Hierarchical Assets & Audit Ledger
 */

export type AssetOperationalState =
  | 'OPTIMAL'
  | 'ADVISORY'
  | 'WARNING_MAINTENANCE_REQUIRED'
  | 'CRITICAL_FAULT'
  | 'OFFLINE_ISOLATED';

export interface Plant {
  id: string;
  organizationId: string;
  code: string; // e.g. "PLANT-TX-04"
  name: string;
  location: string;
  airGappedMode: boolean;
  createdAt: string;
  updatedAt: string;
}

// Alias for backwards compatibility
export type PlantSite = Plant;

export interface Asset {
  id: string;
  organizationId: string;
  plantId: string;
  parentAssetId?: string | null; // Self-referencing FK for asset hierarchy (System -> Skid -> Compressor -> Impeller)
  assetTag: string;              // e.g. "PUMP-204-B" (Unique per organization)
  name: string;
  area: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  operationalState: AssetOperationalState;
  createdAt: string;
  updatedAt: string;
}

// Alias for backwards compatibility with UI components
export interface IndustrialAsset extends Asset {
  activeFaultCodes?: string[];
  lastMaintenanceDate?: string;
  nextScheduledOverhaul?: string;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  actorUserId?: string | null;
  action: string;                // e.g. "PLANT_CREATED", "ASSET_CREATED", "CROSS_TENANT_ACCESS_BLOCKED"
  resourceType: string;          // e.g. "PLANT", "ASSET", "DOCUMENT", "MEMBERSHIP"
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

/**
 * ============================================================================
 * PLANNED ENTITY CONTRACTS (Phases 3-5)
 * Documented here for contract consistency and future schema alignment
 * ============================================================================
 */

// Phase 3: Ingestion & Knowledge Extraction
export interface PlannedDocument {
  id: string;
  organizationId: string;
  plantId: string;
  title: string;
  documentNumber: string;
  category: string;
  createdAt: string;
}

export interface PlannedDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  revision: string;
  storageKey: string;
  checksumSha256: string;
  totalPages: number;
  status: 'PENDING' | 'PARSING' | 'INDEXED' | 'FAILED';
}

export interface PlannedDocumentPage {
  id: string;
  documentVersionId: string;
  pageNumber: number;
  width: number;
  height: number;
  storageKey: string;
}

export interface PlannedKnowledgeChunk {
  id: string;
  documentVersionId: string;
  pageNumber: number;
  qdrantPointId: string;
  content: string;
  bboxJson?: { x1: number; y1: number; x2: number; y2: number };
  isTable: boolean;
  isFigure: boolean;
}

export interface PlannedProcessingJob {
  id: string;
  organizationId: string;
  documentVersionId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

// Phase 4: AI Conversations & Citations
export interface PlannedConversation {
  id: string;
  organizationId: string;
  plantId: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface PlannedMessage {
  id: string;
  conversationId: string;
  senderType: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  groundingConfidence?: number;
  createdAt: string;
}

export interface PlannedCitation {
  id: string;
  messageId: string;
  knowledgeChunkId: string;
  documentVersionId: string;
  pageNumber: number;
  confidenceScore: number;
}

// Phase 5: Maintenance Cases & Work Orders
export interface PlannedMaintenanceCase {
  id: string;
  organizationId: string;
  assetId: string;
  title: string;
  faultCode?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_TRIAGE' | 'RESOLVED' | 'CLOSED';
}

export interface PlannedWorkOrder {
  id: string;
  organizationId: string;
  maintenanceCaseId: string;
  assignedUserId?: string;
  status: 'PENDING_LOTO' | 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED';
  lotoSignoffAt?: string;
  lotoSignoffUserId?: string;
}

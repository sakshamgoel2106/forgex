import type {
  Organization,
  User,
  OrganizationMembership,
  Plant,
  Asset,
  AuditEvent,
  OrgRole,
  MembershipStatus,
  AssetOperationalState,
  TechnicalDocument,
  DocumentVersion,
  DocumentPage,
  KnowledgeChunk,
  ProcessingJob,
  DocumentType,
  DocumentStatus,
  ExtractionMethod,
  Conversation,
  CopilotMessage,
  Citation,
  MessageFeedback,
} from '@forgex/shared-types';

export interface CreateOrganizationDTO {
  name: string;
  slug: string;
}

export interface CreateUserDTO {
  externalAuthId: string;
  email: string;
  fullName: string;
}

export interface CreateMembershipDTO {
  organizationId: string;
  userId: string;
  role: OrgRole;
  status?: MembershipStatus;
}

export interface CreatePlantDTO {
  code: string;
  name: string;
  location: string;
  airGappedMode?: boolean;
}

export interface CreateAssetDTO {
  plantId: string;
  parentAssetId?: string | null;
  assetTag: string;
  name: string;
  area: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  operationalState?: AssetOperationalState;
}

export interface CreateAuditEventDTO {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateDocumentDTO {
  organizationId: string;
  plantId: string;
  documentNumber: string;
  title: string;
  category: DocumentType;
  assetTags?: string[];
  createdByUserId?: string | null;
}

export interface CreateDocumentVersionDTO {
  documentId: string;
  versionNumber: number;
  revision: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  storageKey: string;
  status?: DocumentStatus;
}

export interface CreateDocumentPageDTO {
  documentVersionId: string;
  pageNumber: number;
  rawText: string;
  sectionHeadings?: string[];
  extractionMethod: ExtractionMethod;
  hasTables?: boolean;
  storageKey?: string | null;
}

export interface CreateKnowledgeChunkDTO {
  documentVersionId: string;
  pageNumber: number;
  chunkIndex: number;
  qdrantPointId: string;
  content: string;
  sectionHeading?: string | null;
  isTable?: boolean;
  isFigure?: boolean;
  extractionMethod: ExtractionMethod;
  tokenCount?: number;
}

export interface CreateProcessingJobDTO {
  organizationId: string;
  documentVersionId: string;
  status?: DocumentStatus;
  progressPercent?: number;
  currentStep?: string;
}

export interface DocumentFilterOptions {
  plantId?: string;
  category?: DocumentType;
  search?: string;
}

export interface IDataStore {
  // Organizations
  createOrganization(dto: CreateOrganizationDTO): Promise<Organization>;
  getOrganizationById(id: string): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;

  // Users
  createUser(dto: CreateUserDTO): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByExternalAuthId(externalAuthId: string): Promise<User | null>;

  // Memberships
  createMembership(dto: CreateMembershipDTO): Promise<OrganizationMembership>;
  getMembership(userId: string, organizationId: string): Promise<OrganizationMembership | null>;
  listUserMemberships(userId: string): Promise<OrganizationMembership[]>;

  // Plants (Strict Organization Scoping)
  createPlant(organizationId: string, dto: CreatePlantDTO): Promise<Plant>;
  getPlantById(organizationId: string, plantId: string): Promise<Plant | null>;
  listPlants(organizationId: string): Promise<Plant[]>;

  // Assets (Strict Organization Scoping & Hierarchical Parent)
  createAsset(organizationId: string, dto: CreateAssetDTO): Promise<Asset>;
  getAssetById(organizationId: string, assetId: string): Promise<Asset | null>;
  listAssets(organizationId: string, plantId?: string): Promise<Asset[]>;

  // Audit Events
  recordAuditEvent(dto: CreateAuditEventDTO): Promise<AuditEvent>;
  listAuditEvents(organizationId: string, limit?: number): Promise<AuditEvent[]>;

  // Documents
  createDocument(dto: CreateDocumentDTO): Promise<TechnicalDocument>;
  getDocumentById(organizationId: string, documentId: string): Promise<TechnicalDocument | null>;
  getDocumentByNumber(organizationId: string, documentNumber: string): Promise<TechnicalDocument | null>;
  listDocuments(organizationId: string, filter?: DocumentFilterOptions): Promise<TechnicalDocument[]>;
  deleteDocument(organizationId: string, documentId: string): Promise<boolean>;

  // Document Versions
  createDocumentVersion(dto: CreateDocumentVersionDTO): Promise<DocumentVersion>;
  getDocumentVersionById(versionId: string): Promise<DocumentVersion | null>;
  listDocumentVersions(documentId: string): Promise<DocumentVersion[]>;
  updateDocumentVersionStatus(
    versionId: string,
    status: DocumentStatus,
    totalPages?: number,
    totalChunks?: number,
    errorMessage?: string | null
  ): Promise<DocumentVersion>;

  // Document Pages
  saveDocumentPages(pages: CreateDocumentPageDTO[]): Promise<DocumentPage[]>;
  listDocumentPages(documentVersionId: string): Promise<DocumentPage[]>;
  deleteDocumentPages(documentVersionId: string): Promise<void>;

  // Knowledge Chunks
  saveKnowledgeChunks(chunks: CreateKnowledgeChunkDTO[]): Promise<KnowledgeChunk[]>;
  listKnowledgeChunks(documentVersionId: string): Promise<KnowledgeChunk[]>;
  deleteKnowledgeChunks(documentVersionId: string): Promise<void>;

  // Processing Jobs
  createProcessingJob(dto: CreateProcessingJobDTO): Promise<ProcessingJob>;
  getProcessingJobById(jobId: string): Promise<ProcessingJob | null>;
  getLatestProcessingJobByVersion(documentVersionId: string): Promise<ProcessingJob | null>;
  updateProcessingJobProgress(
    jobId: string,
    progressPercent: number,
    currentStep?: string,
    status?: DocumentStatus,
    errorMessage?: string | null
  ): Promise<ProcessingJob>;
  incrementJobRetryCount(jobId: string): Promise<ProcessingJob>;

  // Phase 4: Conversations & AI Copilot
  createConversation(dto: CreateConversationDTO): Promise<Conversation>;
  getConversationById(organizationId: string, conversationId: string): Promise<Conversation | null>;
  listConversations(organizationId: string, userId: string, plantId?: string): Promise<Conversation[]>;
  deleteConversation(organizationId: string, conversationId: string): Promise<boolean>;

  // Messages & Citations
  createMessage(dto: CreateMessageDTO): Promise<CopilotMessage>;
  createCitations(citations: CreateCitationDTO[]): Promise<Citation[]>;
  getMessageWithCitations(messageId: string): Promise<CopilotMessage | null>;
  listMessages(conversationId: string): Promise<CopilotMessage[]>;
  recordMessageFeedback(dto: CreateFeedbackDTO): Promise<MessageFeedback>;
}

export interface CreateConversationDTO {
  organizationId: string;
  plantId: string;
  assetId?: string | null;
  userId: string;
  title: string;
}

export interface CreateMessageDTO {
  conversationId: string;
  senderType: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';
  isInsufficientEvidence?: boolean;
  conflictDetected?: boolean;
  conflictDetails?: string | null;
}

export interface CreateCitationDTO {
  messageId: string;
  documentId: string;
  documentVersionId: string;
  pageNumber: number;
  knowledgeChunkId?: string | null;
  snippet: string;
  confidenceScore?: number;
  sectionHeading?: string | null;
}

export interface CreateFeedbackDTO {
  messageId: string;
  userId: string;
  rating: 'HELPFUL' | 'UNHELPFUL';
  comment?: string | null;
}


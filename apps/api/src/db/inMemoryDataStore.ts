import crypto from 'node:crypto';
import type {
  Organization,
  User,
  OrganizationMembership,
  Plant,
  Asset,
  AuditEvent,
  TechnicalDocument,
  DocumentVersion,
  DocumentPage,
  KnowledgeChunk,
  ProcessingJob,
  DocumentStatus,
  Conversation,
  CopilotMessage,
  Citation,
  MessageFeedback,
  VisualAsset,
  MaintenanceCase,
  CaseHistoryEntry,
} from '@forgex/shared-types';
import type {
  IDataStore,
  CreateOrganizationDTO,
  CreateUserDTO,
  CreateMembershipDTO,
  CreatePlantDTO,
  CreateAssetDTO,
  CreateAuditEventDTO,
  CreateDocumentDTO,
  CreateDocumentVersionDTO,
  CreateDocumentPageDTO,
  CreateKnowledgeChunkDTO,
  CreateProcessingJobDTO,
  DocumentFilterOptions,
  CreateConversationDTO,
  CreateMessageDTO,
  CreateCitationDTO,
  CreateFeedbackDTO,
  CreateVisualAssetDTO,
  VisualAssetFilterOptions,
  CreateMaintenanceCaseDTO,
  MaintenanceCaseFilterOptions,
  CreateCaseHistoryDTO,
} from './dataStore.interface.js';

export class InMemoryDataStore implements IDataStore {
  private organizations = new Map<string, Organization>();
  private users = new Map<string, User>();
  private memberships = new Map<string, OrganizationMembership>();
  private plants = new Map<string, Plant>();
  private assets = new Map<string, Asset>();
  private auditEvents: AuditEvent[] = [];

  // Phase 3 Ingestion Data Sets
  private documents = new Map<string, TechnicalDocument>();
  private documentVersions = new Map<string, DocumentVersion>();
  private documentPages = new Map<string, DocumentPage>();
  private knowledgeChunks = new Map<string, KnowledgeChunk>();
  private processingJobs = new Map<string, ProcessingJob>();

  // Phase 4 RAG & Copilot Data Sets
  private conversations = new Map<string, Conversation>();
  private messages = new Map<string, CopilotMessage>();
  private citations = new Map<string, Citation>();
  private messageFeedbacks = new Map<string, MessageFeedback>();

  // Phase 5 Visual Industrial Intelligence
  private visualAssets = new Map<string, VisualAsset>();

  // Phase 6 Maintenance Cases & Troubleshooting Workflows
  private maintenanceCases = new Map<string, MaintenanceCase>();
  private caseHistory: CaseHistoryEntry[] = [];

  // --------------------------------------------------------------------------
  // Organizations
  // --------------------------------------------------------------------------
  public async createOrganization(dto: CreateOrganizationDTO): Promise<Organization> {
    for (const org of this.organizations.values()) {
      if (org.slug === dto.slug) {
        throw new Error(`Organization with slug '${dto.slug}' already exists.`);
      }
    }

    const now = new Date().toISOString();
    const org: Organization = {
      id: crypto.randomUUID(),
      name: dto.name,
      slug: dto.slug,
      createdAt: now,
      updatedAt: now,
    };
    this.organizations.set(org.id, org);
    return org;
  }

  public async getOrganizationById(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  public async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    for (const org of this.organizations.values()) {
      if (org.slug === slug) return org;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  public async createUser(dto: CreateUserDTO): Promise<User> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === dto.email.toLowerCase()) {
        throw new Error(`User with email '${dto.email}' already exists.`);
      }
      if (u.externalAuthId === dto.externalAuthId) {
        throw new Error(`User with externalAuthId '${dto.externalAuthId}' already exists.`);
      }
    }

    const now = new Date().toISOString();
    const user: User = {
      id: crypto.randomUUID(),
      externalAuthId: dto.externalAuthId,
      email: dto.email,
      fullName: dto.fullName,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  public async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  public async getUserByExternalAuthId(externalAuthId: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.externalAuthId === externalAuthId) return user;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Organization Memberships
  // --------------------------------------------------------------------------
  public async createMembership(dto: CreateMembershipDTO): Promise<OrganizationMembership> {
    for (const m of this.memberships.values()) {
      if (m.organizationId === dto.organizationId && m.userId === dto.userId) {
        throw new Error(`Membership already exists for user '${dto.userId}' in org '${dto.organizationId}'.`);
      }
    }

    const now = new Date().toISOString();
    const membership: OrganizationMembership = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      userId: dto.userId,
      role: dto.role,
      status: dto.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.memberships.set(membership.id, membership);
    return membership;
  }

  public async getMembership(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    for (const m of this.memberships.values()) {
      if (m.userId === userId && m.organizationId === organizationId) {
        return m;
      }
    }
    return null;
  }

  public async listUserMemberships(userId: string): Promise<OrganizationMembership[]> {
    const results: OrganizationMembership[] = [];
    for (const m of this.memberships.values()) {
      if (m.userId === userId) results.push(m);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Plants
  // --------------------------------------------------------------------------
  public async createPlant(organizationId: string, dto: CreatePlantDTO): Promise<Plant> {
    for (const p of this.plants.values()) {
      if (p.organizationId === organizationId && p.code.toLowerCase() === dto.code.toLowerCase()) {
        throw new Error(`Plant with code '${dto.code}' already exists in this organization.`);
      }
    }

    const now = new Date().toISOString();
    const plant: Plant = {
      id: crypto.randomUUID(),
      organizationId,
      code: dto.code,
      name: dto.name,
      location: dto.location,
      airGappedMode: dto.airGappedMode ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.plants.set(plant.id, plant);
    return plant;
  }

  public async getPlantById(organizationId: string, plantId: string): Promise<Plant | null> {
    const plant = this.plants.get(plantId);
    if (!plant || plant.organizationId !== organizationId) return null;
    return plant;
  }

  public async listPlants(organizationId: string): Promise<Plant[]> {
    const list: Plant[] = [];
    for (const p of this.plants.values()) {
      if (p.organizationId === organizationId) list.push(p);
    }
    return list;
  }

  // --------------------------------------------------------------------------
  // Assets
  // --------------------------------------------------------------------------
  public async createAsset(organizationId: string, dto: CreateAssetDTO): Promise<Asset> {
    const plant = await this.getPlantById(organizationId, dto.plantId);
    if (!plant) {
      throw new Error(`Plant '${dto.plantId}' does not exist or does not belong to organization.`);
    }

    for (const a of this.assets.values()) {
      if (a.organizationId === organizationId && a.assetTag.toLowerCase() === dto.assetTag.toLowerCase()) {
        throw new Error(`Asset with tag '${dto.assetTag}' already exists in this organization.`);
      }
    }

    if (dto.parentAssetId) {
      const parent = await this.getAssetById(organizationId, dto.parentAssetId);
      if (!parent) {
        throw new Error(`Parent asset '${dto.parentAssetId}' does not belong to organization.`);
      }
    }

    const now = new Date().toISOString();
    const asset: Asset = {
      id: crypto.randomUUID(),
      organizationId,
      plantId: dto.plantId,
      parentAssetId: dto.parentAssetId ?? null,
      assetTag: dto.assetTag,
      name: dto.name,
      area: dto.area,
      manufacturer: dto.manufacturer,
      modelNumber: dto.modelNumber,
      serialNumber: dto.serialNumber,
      operationalState: dto.operationalState ?? 'OPTIMAL',
      createdAt: now,
      updatedAt: now,
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  public async getAssetById(organizationId: string, assetId: string): Promise<Asset | null> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.organizationId !== organizationId) return null;
    return asset;
  }

  public async listAssets(organizationId: string, plantId?: string): Promise<Asset[]> {
    const list: Asset[] = [];
    for (const a of this.assets.values()) {
      if (a.organizationId === organizationId) {
        if (!plantId || a.plantId === plantId) {
          list.push(a);
        }
      }
    }
    return list;
  }

  // --------------------------------------------------------------------------
  // Audit Events
  // --------------------------------------------------------------------------
  public async recordAuditEvent(dto: CreateAuditEventDTO): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      actorUserId: dto.actorUserId ?? null,
      action: dto.action,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      metadata: dto.metadata ?? {},
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
      createdAt: new Date().toISOString(),
    };
    this.auditEvents.push(event);
    return event;
  }

  public async listAuditEvents(organizationId: string, limit = 50): Promise<AuditEvent[]> {
    return this.auditEvents
      .filter((e) => e.organizationId === organizationId)
      .slice(-limit)
      .reverse();
  }

  // --------------------------------------------------------------------------
  // Phase 3: Documents
  // --------------------------------------------------------------------------
  public async createDocument(dto: CreateDocumentDTO): Promise<TechnicalDocument> {
    for (const doc of this.documents.values()) {
      if (
        doc.organizationId === dto.organizationId &&
        doc.documentNumber.toLowerCase() === dto.documentNumber.toLowerCase()
      ) {
        throw new Error(
          `Document with number '${dto.documentNumber}' already exists in this organization.`
        );
      }
    }

    const now = new Date().toISOString();
    const doc: TechnicalDocument = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      plantId: dto.plantId,
      documentNumber: dto.documentNumber,
      title: dto.title,
      category: dto.category,
      assetTags: dto.assetTags ?? [],
      createdByUserId: dto.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(doc.id, doc);
    return doc;
  }

  public async getDocumentById(organizationId: string, documentId: string): Promise<TechnicalDocument | null> {
    const doc = this.documents.get(documentId);
    if (!doc || doc.organizationId !== organizationId) return null;
    return this.enrichDocument(doc);
  }

  public async getDocumentByNumber(organizationId: string, documentNumber: string): Promise<TechnicalDocument | null> {
    for (const doc of this.documents.values()) {
      if (
        doc.organizationId === organizationId &&
        doc.documentNumber.toLowerCase() === documentNumber.toLowerCase()
      ) {
        return this.enrichDocument(doc);
      }
    }
    return null;
  }

  public async listDocuments(organizationId: string, filter?: DocumentFilterOptions): Promise<TechnicalDocument[]> {
    const results: TechnicalDocument[] = [];
    for (const doc of this.documents.values()) {
      if (doc.organizationId !== organizationId) continue;
      if (filter?.plantId && doc.plantId !== filter.plantId) continue;
      if (filter?.category && doc.category !== filter.category) continue;
      if (filter?.search) {
        const query = filter.search.toLowerCase();
        const matchesTitle = doc.title.toLowerCase().includes(query);
        const matchesNum = doc.documentNumber.toLowerCase().includes(query);
        if (!matchesTitle && !matchesNum) continue;
      }
      results.push(this.enrichDocument(doc));
    }
    // Return sorted newest first
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async deleteDocument(organizationId: string, documentId: string): Promise<boolean> {
    const doc = this.documents.get(documentId);
    if (!doc || doc.organizationId !== organizationId) return false;

    // Cascade delete versions, pages, chunks, and jobs
    for (const version of this.documentVersions.values()) {
      if (version.documentId === documentId) {
        await this.deleteDocumentPages(version.id);
        await this.deleteKnowledgeChunks(version.id);
        for (const job of this.processingJobs.values()) {
          if (job.documentVersionId === version.id) {
            this.processingJobs.delete(job.id);
          }
        }
        this.documentVersions.delete(version.id);
      }
    }

    this.documents.delete(documentId);
    return true;
  }

  // --------------------------------------------------------------------------
  // Document Versions
  // --------------------------------------------------------------------------
  public async createDocumentVersion(dto: CreateDocumentVersionDTO): Promise<DocumentVersion> {
    for (const v of this.documentVersions.values()) {
      if (v.documentId === dto.documentId && v.versionNumber === dto.versionNumber) {
        throw new Error(`Version number ${dto.versionNumber} already exists for document '${dto.documentId}'.`);
      }
    }

    const now = new Date().toISOString();
    const version: DocumentVersion = {
      id: crypto.randomUUID(),
      documentId: dto.documentId,
      versionNumber: dto.versionNumber,
      revision: dto.revision,
      filename: dto.filename,
      mimeType: dto.mimeType,
      fileSizeBytes: dto.fileSizeBytes,
      checksumSha256: dto.checksumSha256,
      storageKey: dto.storageKey,
      status: dto.status ?? 'QUEUED',
      totalPages: 0,
      totalChunks: 0,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.documentVersions.set(version.id, version);
    return version;
  }

  public async getDocumentVersionById(versionId: string): Promise<DocumentVersion | null> {
    return this.documentVersions.get(versionId) ?? null;
  }

  public async listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    const list: DocumentVersion[] = [];
    for (const v of this.documentVersions.values()) {
      if (v.documentId === documentId) list.push(v);
    }
    return list.sort((a, b) => a.versionNumber - b.versionNumber);
  }

  public async updateDocumentVersionStatus(
    versionId: string,
    status: DocumentStatus,
    totalPages?: number,
    totalChunks?: number,
    errorMessage?: string | null
  ): Promise<DocumentVersion> {
    const version = this.documentVersions.get(versionId);
    if (!version) {
      throw new Error(`Document version '${versionId}' not found.`);
    }

    version.status = status;
    if (typeof totalPages === 'number') version.totalPages = totalPages;
    if (typeof totalChunks === 'number') version.totalChunks = totalChunks;
    if (errorMessage !== undefined) version.errorMessage = errorMessage;
    version.updatedAt = new Date().toISOString();

    this.documentVersions.set(versionId, version);
    return version;
  }

  // --------------------------------------------------------------------------
  // Document Pages
  // --------------------------------------------------------------------------
  public async saveDocumentPages(pages: CreateDocumentPageDTO[]): Promise<DocumentPage[]> {
    const saved: DocumentPage[] = [];
    const now = new Date().toISOString();

    for (const p of pages) {
      const id = crypto.randomUUID();
      const page: DocumentPage = {
        id,
        documentVersionId: p.documentVersionId,
        pageNumber: p.pageNumber,
        rawText: p.rawText,
        sectionHeadings: p.sectionHeadings ?? [],
        extractionMethod: p.extractionMethod,
        hasTables: p.hasTables ?? false,
        storageKey: p.storageKey ?? null,
        createdAt: now,
      };
      this.documentPages.set(id, page);
      saved.push(page);
    }
    return saved;
  }

  public async listDocumentPages(documentVersionId: string): Promise<DocumentPage[]> {
    const pages: DocumentPage[] = [];
    for (const p of this.documentPages.values()) {
      if (p.documentVersionId === documentVersionId) pages.push(p);
    }
    return pages.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  public async deleteDocumentPages(documentVersionId: string): Promise<void> {
    for (const [id, p] of this.documentPages.entries()) {
      if (p.documentVersionId === documentVersionId) {
        this.documentPages.delete(id);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Knowledge Chunks
  // --------------------------------------------------------------------------
  public async saveKnowledgeChunks(chunks: CreateKnowledgeChunkDTO[]): Promise<KnowledgeChunk[]> {
    const saved: KnowledgeChunk[] = [];
    const now = new Date().toISOString();

    for (const c of chunks) {
      const id = crypto.randomUUID();
      const chunk: KnowledgeChunk = {
        id,
        documentVersionId: c.documentVersionId,
        pageNumber: c.pageNumber,
        chunkIndex: c.chunkIndex,
        qdrantPointId: c.qdrantPointId,
        content: c.content,
        sectionHeading: c.sectionHeading ?? null,
        isTable: c.isTable ?? false,
        isFigure: c.isFigure ?? false,
        extractionMethod: c.extractionMethod,
        tokenCount: c.tokenCount ?? 0,
        createdAt: now,
      };
      this.knowledgeChunks.set(id, chunk);
      saved.push(chunk);
    }
    return saved;
  }

  public async listKnowledgeChunks(documentVersionId: string): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    for (const c of this.knowledgeChunks.values()) {
      if (c.documentVersionId === documentVersionId) chunks.push(c);
    }
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  public async deleteKnowledgeChunks(documentVersionId: string): Promise<void> {
    for (const [id, c] of this.knowledgeChunks.entries()) {
      if (c.documentVersionId === documentVersionId) {
        this.knowledgeChunks.delete(id);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Processing Jobs
  // --------------------------------------------------------------------------
  public async createProcessingJob(dto: CreateProcessingJobDTO): Promise<ProcessingJob> {
    const now = new Date().toISOString();
    const job: ProcessingJob = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      documentVersionId: dto.documentVersionId,
      status: dto.status ?? 'QUEUED',
      progressPercent: dto.progressPercent ?? 0,
      currentStep: dto.currentStep ?? 'Queued for processing',
      retryCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.processingJobs.set(job.id, job);
    return job;
  }

  public async getProcessingJobById(jobId: string): Promise<ProcessingJob | null> {
    return this.processingJobs.get(jobId) ?? null;
  }

  public async getLatestProcessingJobByVersion(documentVersionId: string): Promise<ProcessingJob | null> {
    let latest: ProcessingJob | null = null;
    for (const j of this.processingJobs.values()) {
      if (j.documentVersionId === documentVersionId) {
        if (!latest || new Date(j.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
          latest = j;
        }
      }
    }
    return latest;
  }

  public async updateProcessingJobProgress(
    jobId: string,
    progressPercent: number,
    currentStep?: string,
    status?: DocumentStatus,
    errorMessage?: string | null
  ): Promise<ProcessingJob> {
    const job = this.processingJobs.get(jobId);
    if (!job) {
      throw new Error(`Processing job '${jobId}' not found.`);
    }

    job.progressPercent = progressPercent;
    if (currentStep) job.currentStep = currentStep;
    if (status) {
      job.status = status;
      if (status === 'PROCESSING' && !job.startedAt) {
        job.startedAt = new Date().toISOString();
      }
      if (status === 'INDEXED' || status === 'FAILED') {
        job.completedAt = new Date().toISOString();
      }
    }
    if (errorMessage !== undefined) {
      job.errorMessage = errorMessage;
    }
    job.updatedAt = new Date().toISOString();

    this.processingJobs.set(jobId, job);
    return job;
  }

  public async incrementJobRetryCount(jobId: string): Promise<ProcessingJob> {
    const job = this.processingJobs.get(jobId);
    if (!job) throw new Error(`Processing job '${jobId}' not found.`);

    job.retryCount += 1;
    job.status = 'QUEUED';
    job.progressPercent = 0;
    job.currentStep = `Retry attempt #${job.retryCount}`;
    job.errorMessage = null;
    job.startedAt = null;
    job.completedAt = null;
    job.updatedAt = new Date().toISOString();

    this.processingJobs.set(jobId, job);
    return job;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  private enrichDocument(doc: TechnicalDocument): TechnicalDocument {
    // Find latest version
    let latestVersion: DocumentVersion | undefined;
    for (const v of this.documentVersions.values()) {
      if (v.documentId === doc.id) {
        if (!latestVersion || v.versionNumber > latestVersion.versionNumber) {
          latestVersion = v;
        }
      }
    }

    let latestJob: ProcessingJob | undefined;
    if (latestVersion) {
      for (const j of this.processingJobs.values()) {
        if (j.documentVersionId === latestVersion.id) {
          if (!latestJob || new Date(j.createdAt).getTime() > new Date(latestJob.createdAt).getTime()) {
            latestJob = j;
          }
        }
      }
    }

    return {
      ...doc,
      latestVersion,
      latestJob,
      // Legacy compatibility fields
      tenantId: doc.organizationId,
      type: doc.category,
      status: latestVersion?.status ?? 'QUEUED',
      fileSizeBytes: latestVersion?.fileSizeBytes ?? 0,
      mimeType: latestVersion?.mimeType ?? '',
      storageKey: latestVersion?.storageKey ?? '',
      checksumSha256: latestVersion?.checksumSha256 ?? '',
      totalPages: latestVersion?.totalPages ?? 0,
      totalChunks: latestVersion?.totalChunks ?? 0,
      revision: latestVersion?.revision ?? 'REV-1',
    };
  }

  // --------------------------------------------------------------------------
  // Phase 4: Conversations & AI Copilot
  // --------------------------------------------------------------------------
  public async createConversation(dto: CreateConversationDTO): Promise<Conversation> {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      plantId: dto.plantId,
      assetId: dto.assetId ?? null,
      userId: dto.userId,
      title: dto.title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.conversations.set(conv.id, conv);
    return conv;
  }

  public async getConversationById(
    organizationId: string,
    conversationId: string
  ): Promise<Conversation | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.organizationId !== organizationId) return null;

    const messages = await this.listMessages(conv.id);
    return {
      ...conv,
      messages,
    };
  }

  public async listConversations(
    organizationId: string,
    userId: string,
    plantId?: string
  ): Promise<Conversation[]> {
    const results: Conversation[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.organizationId === organizationId && conv.userId === userId) {
        if (!plantId || conv.plantId === plantId) {
          const messages = await this.listMessages(conv.id);
          results.push({
            ...conv,
            messages,
          });
        }
      }
    }
    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async deleteConversation(
    organizationId: string,
    conversationId: string
  ): Promise<boolean> {
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.organizationId !== organizationId) return false;

    // Cascade delete messages, citations, feedback
    for (const msg of this.messages.values()) {
      if (msg.conversationId === conversationId) {
        for (const cit of this.citations.values()) {
          if (cit.messageId === msg.id) {
            this.citations.delete(cit.id);
          }
        }
        this.messageFeedbacks.delete(msg.id);
        this.messages.delete(msg.id);
      }
    }

    this.conversations.delete(conversationId);
    return true;
  }

  // --------------------------------------------------------------------------
  // Messages & Citations
  // --------------------------------------------------------------------------
  public async createMessage(dto: CreateMessageDTO): Promise<CopilotMessage> {
    const now = new Date().toISOString();
    const message: CopilotMessage = {
      id: crypto.randomUUID(),
      conversationId: dto.conversationId,
      senderType: dto.senderType,
      content: dto.content,
      confidence: dto.confidence ?? 'HIGH',
      isInsufficientEvidence: dto.isInsufficientEvidence ?? false,
      conflictDetected: dto.conflictDetected ?? false,
      conflictDetails: dto.conflictDetails ?? null,
      citations: [],
      createdAt: now,
      feedback: null,
    };
    this.messages.set(message.id, message);

    // Update conversation updatedAt
    const conv = this.conversations.get(dto.conversationId);
    if (conv) {
      conv.updatedAt = now;
      this.conversations.set(conv.id, conv);
    }

    return message;
  }

  public async createCitations(citations: CreateCitationDTO[]): Promise<Citation[]> {
    const saved: Citation[] = [];
    for (const c of citations) {
      // Look up document details for display
      let docNumber = 'DOC-UNKNOWN';
      let docTitle = 'Unknown Document';
      for (const d of this.documents.values()) {
        if (d.id === c.documentId) {
          docNumber = d.documentNumber;
          docTitle = d.title;
          break;
        }
      }

      let revisionTag = 'REV-A';
      const version = this.documentVersions.get(c.documentVersionId);
      if (version) {
        revisionTag = version.revision;
      }

      const id = crypto.randomUUID();
      const citation: Citation = {
        id,
        messageId: c.messageId,
        documentId: c.documentId,
        documentNumber: docNumber,
        documentTitle: docTitle,
        documentVersionId: c.documentVersionId,
        revisionTag,
        pageNumber: c.pageNumber,
        chunkId: c.knowledgeChunkId ?? id,
        snippet: c.snippet,
        confidenceScore: c.confidenceScore ?? 1.0,
        sectionHeading: c.sectionHeading ?? null,
      };
      this.citations.set(id, citation);
      saved.push(citation);
    }
    return saved;
  }

  public async getMessageWithCitations(messageId: string): Promise<CopilotMessage | null> {
    const msg = this.messages.get(messageId);
    if (!msg) return null;

    const citations: Citation[] = [];
    for (const c of this.citations.values()) {
      if (c.messageId === messageId) citations.push(c);
    }

    const feedback = this.messageFeedbacks.get(messageId) ?? null;

    return {
      ...msg,
      citations,
      feedback,
    };
  }

  public async listMessages(conversationId: string): Promise<CopilotMessage[]> {
    const list: CopilotMessage[] = [];
    for (const m of this.messages.values()) {
      if (m.conversationId === conversationId) {
        const enriched = await this.getMessageWithCitations(m.id);
        if (enriched) list.push(enriched);
      }
    }
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public async recordMessageFeedback(dto: CreateFeedbackDTO): Promise<MessageFeedback> {
    const existing = this.messageFeedbacks.get(dto.messageId);
    if (existing) {
      existing.rating = dto.rating;
      existing.comment = dto.comment ?? null;
      this.messageFeedbacks.set(dto.messageId, existing);
      return existing;
    }

    const feedback: MessageFeedback = {
      id: crypto.randomUUID(),
      messageId: dto.messageId,
      userId: dto.userId,
      rating: dto.rating,
      comment: dto.comment ?? null,
      createdAt: new Date().toISOString(),
    };
    this.messageFeedbacks.set(dto.messageId, feedback);
    return feedback;
  }

  // --------------------------------------------------------------------------
  // Phase 5: Visual Industrial Intelligence
  // --------------------------------------------------------------------------
  public async createVisualAsset(dto: CreateVisualAssetDTO): Promise<VisualAsset> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const asset: VisualAsset = {
      id,
      organizationId: dto.organizationId,
      plantId: dto.plantId ?? null,
      documentId: dto.documentId ?? null,
      documentVersionId: dto.documentVersionId ?? null,
      pageNumber: dto.pageNumber ?? null,
      assetType: dto.assetType,
      storageKey: dto.storageKey,
      filename: dto.filename,
      mimeType: dto.mimeType,
      fileSizeBytes: dto.fileSizeBytes,
      width: dto.width ?? null,
      height: dto.height ?? null,
      description: dto.description ?? null,
      equipmentTags: dto.equipmentTags ?? [],
      componentLabels: dto.componentLabels ?? [],
      extractionMethod: dto.extractionMethod,
      modelUsed: dto.modelUsed,
      confidenceScore: dto.confidenceScore ?? 1.0,
      isAmbiguous: dto.isAmbiguous ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.visualAssets.set(id, asset);
    return asset;
  }

  public async getVisualAssetById(organizationId: string, id: string): Promise<VisualAsset | null> {
    const asset = this.visualAssets.get(id);
    if (!asset || asset.organizationId !== organizationId) return null;
    return asset;
  }

  public async listVisualAssets(
    organizationId: string,
    filter?: VisualAssetFilterOptions
  ): Promise<VisualAsset[]> {
    const results: VisualAsset[] = [];
    for (const a of this.visualAssets.values()) {
      if (a.organizationId !== organizationId) continue;
      if (filter?.plantId && a.plantId !== filter.plantId) continue;
      if (filter?.documentId && a.documentId !== filter.documentId) continue;
      if (filter?.documentVersionId && a.documentVersionId !== filter.documentVersionId) continue;
      if (filter?.assetType && a.assetType !== filter.assetType) continue;
      if (filter?.equipmentTag && !a.equipmentTags.includes(filter.equipmentTag)) continue;
      results.push(a);
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async deleteVisualAsset(organizationId: string, id: string): Promise<boolean> {
    const asset = this.visualAssets.get(id);
    if (!asset || asset.organizationId !== organizationId) return false;
    this.visualAssets.delete(id);
    return true;
  }

  // --------------------------------------------------------------------------
  // Maintenance Cases & Troubleshooting Workflows (Phase 6)
  // --------------------------------------------------------------------------
  public async createMaintenanceCase(dto: CreateMaintenanceCaseDTO): Promise<MaintenanceCase> {
    const now = new Date().toISOString();
    const caseNumber = dto.caseNumber || `CASE-${Date.now().toString().slice(-6)}`;
    const maintenanceCase: MaintenanceCase = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      plantId: dto.plantId,
      assetId: dto.assetId,
      caseNumber,
      title: dto.title,
      severity: dto.severity || 'MEDIUM',
      status: dto.status || 'REPORTED',
      reportedByUserId: dto.reportedByUserId,
      symptomDescription: dto.symptomDescription,
      operatingConditions: dto.operatingConditions || {},
      visualAssetIds: dto.visualAssetIds || [],
      diagnosticHypothesis: dto.diagnosticHypothesis || null,
      checklist: dto.checklist || [],
      findings: dto.findings || null,
      approval: dto.approval || null,
      isEscalated: dto.isEscalated ?? false,
      escalationReason: dto.escalationReason || null,
      candidateForExpertKnowledge: dto.candidateForExpertKnowledge ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.maintenanceCases.set(maintenanceCase.id, maintenanceCase);
    return maintenanceCase;
  }

  public async getMaintenanceCaseById(
    organizationId: string,
    id: string
  ): Promise<MaintenanceCase | null> {
    const c = this.maintenanceCases.get(id);
    if (!c || c.organizationId !== organizationId) return null;
    return c;
  }

  public async updateMaintenanceCase(
    organizationId: string,
    id: string,
    updates: Partial<MaintenanceCase>
  ): Promise<MaintenanceCase | null> {
    const existing = this.maintenanceCases.get(id);
    if (!existing || existing.organizationId !== organizationId) return null;

    const updated: MaintenanceCase = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.maintenanceCases.set(id, updated);
    return updated;
  }

  public async listMaintenanceCases(
    organizationId: string,
    filter?: MaintenanceCaseFilterOptions
  ): Promise<MaintenanceCase[]> {
    const results: MaintenanceCase[] = [];
    for (const c of this.maintenanceCases.values()) {
      if (c.organizationId !== organizationId) continue;
      if (filter?.plantId && c.plantId !== filter.plantId) continue;
      if (filter?.assetId && c.assetId !== filter.assetId) continue;
      if (filter?.status && c.status !== filter.status) continue;
      if (filter?.severity && c.severity !== filter.severity) continue;
      if (
        filter?.candidateForExpertKnowledge !== undefined &&
        c.candidateForExpertKnowledge !== filter.candidateForExpertKnowledge
      )
        continue;
      results.push(c);
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async deleteMaintenanceCase(organizationId: string, id: string): Promise<boolean> {
    const c = this.maintenanceCases.get(id);
    if (!c || c.organizationId !== organizationId) return false;
    this.maintenanceCases.delete(id);
    return true;
  }

  public async recordCaseHistory(dto: CreateCaseHistoryDTO): Promise<CaseHistoryEntry> {
    const entry: CaseHistoryEntry = {
      id: crypto.randomUUID(),
      caseId: dto.caseId,
      userId: dto.userId,
      previousStatus: dto.previousStatus || null,
      newStatus: dto.newStatus,
      action: dto.action,
      notes: dto.notes || null,
      createdAt: new Date().toISOString(),
    };
    this.caseHistory.push(entry);
    return entry;
  }

  public async listCaseHistory(caseId: string): Promise<CaseHistoryEntry[]> {
    return this.caseHistory
      .filter((h) => h.caseId === caseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public clear(): void {
    this.organizations.clear();
    this.users.clear();
    this.memberships.clear();
    this.plants.clear();
    this.assets.clear();
    this.auditEvents = [];
    this.documents.clear();
    this.documentVersions.clear();
    this.documentPages.clear();
    this.knowledgeChunks.clear();
    this.processingJobs.clear();
    this.conversations.clear();
    this.messages.clear();
    this.citations.clear();
    this.messageFeedbacks.clear();
    this.visualAssets.clear();
    this.maintenanceCases.clear();
    this.caseHistory = [];
  }
}

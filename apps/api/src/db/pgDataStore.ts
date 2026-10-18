import pg from 'pg';
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
  DocumentStatus,
  Conversation,
  CopilotMessage,
  Citation,
  MessageFeedback,
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
} from './dataStore.interface.js';

export class PgDataStore implements IDataStore {
  constructor(private pool: pg.Pool) {}

  // --------------------------------------------------------------------------
  // Organizations
  // --------------------------------------------------------------------------
  public async createOrganization(dto: CreateOrganizationDTO): Promise<Organization> {
    const res = await this.pool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, created_at, updated_at`,
      [dto.name, dto.slug]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getOrganizationById(id: string): Promise<Organization | null> {
    const res = await this.pool.query(
      `SELECT id, name, slug, created_at, updated_at
       FROM organizations WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const res = await this.pool.query(
      `SELECT id, name, slug, created_at, updated_at
       FROM organizations WHERE slug = $1`,
      [slug]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  public async createUser(dto: CreateUserDTO): Promise<User> {
    const res = await this.pool.query(
      `INSERT INTO users (external_auth_id, email, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, external_auth_id, email, full_name, created_at, updated_at`,
      [dto.externalAuthId, dto.email, dto.fullName]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      externalAuthId: row.external_auth_id,
      email: row.email,
      fullName: row.full_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getUserById(id: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT id, external_auth_id, email, full_name, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      externalAuthId: row.external_auth_id,
      email: row.email,
      fullName: row.full_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getUserByExternalAuthId(externalAuthId: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT id, external_auth_id, email, full_name, created_at, updated_at
       FROM users WHERE external_auth_id = $1`,
      [externalAuthId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      externalAuthId: row.external_auth_id,
      email: row.email,
      fullName: row.full_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Memberships
  // --------------------------------------------------------------------------
  public async createMembership(dto: CreateMembershipDTO): Promise<OrganizationMembership> {
    const res = await this.pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, organization_id, user_id, role, status, created_at, updated_at`,
      [dto.organizationId, dto.userId, dto.role, dto.status ?? 'ACTIVE']
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getMembership(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, user_id, role, status, created_at, updated_at
       FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async listUserMemberships(userId: string): Promise<OrganizationMembership[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id, user_id, role, status, created_at, updated_at
       FROM organization_memberships
       WHERE user_id = $1`,
      [userId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  // --------------------------------------------------------------------------
  // Plants (Strict Organization Scoping)
  // --------------------------------------------------------------------------
  public async createPlant(organizationId: string, dto: CreatePlantDTO): Promise<Plant> {
    const res = await this.pool.query(
      `INSERT INTO plants (organization_id, code, name, location, air_gapped_mode)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, code, name, location, air_gapped_mode, created_at, updated_at`,
      [organizationId, dto.code, dto.name, dto.location, dto.airGappedMode ?? false]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      location: row.location,
      airGappedMode: row.air_gapped_mode,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getPlantById(organizationId: string, plantId: string): Promise<Plant | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, code, name, location, air_gapped_mode, created_at, updated_at
       FROM plants
       WHERE id = $1 AND organization_id = $2`,
      [plantId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      location: row.location,
      airGappedMode: row.air_gapped_mode,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async listPlants(organizationId: string): Promise<Plant[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id, code, name, location, air_gapped_mode, created_at, updated_at
       FROM plants
       WHERE organization_id = $1
       ORDER BY created_at ASC`,
      [organizationId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      location: row.location,
      airGappedMode: row.air_gapped_mode,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  // --------------------------------------------------------------------------
  // Assets (Strict Organization Scoping & Hierarchical Parent)
  // --------------------------------------------------------------------------
  public async createAsset(organizationId: string, dto: CreateAssetDTO): Promise<Asset> {
    // Foreign key check: verify plant belongs to this organization
    const plantCheck = await this.getPlantById(organizationId, dto.plantId);
    if (!plantCheck) {
      throw new Error(`Plant '${dto.plantId}' not found or belongs to another organization.`);
    }

    if (dto.parentAssetId) {
      const parentCheck = await this.getAssetById(organizationId, dto.parentAssetId);
      if (!parentCheck) {
        throw new Error(`Parent asset '${dto.parentAssetId}' not found or belongs to another organization.`);
      }
    }

    const res = await this.pool.query(
      `INSERT INTO assets (
         organization_id, plant_id, parent_asset_id, asset_tag, name, area,
         manufacturer, model_number, serial_number, operational_state
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, organization_id, plant_id, parent_asset_id, asset_tag, name,
                 area, manufacturer, model_number, serial_number, operational_state,
                 created_at, updated_at`,
      [
        organizationId,
        dto.plantId,
        dto.parentAssetId ?? null,
        dto.assetTag,
        dto.name,
        dto.area,
        dto.manufacturer,
        dto.modelNumber,
        dto.serialNumber,
        dto.operationalState ?? 'OPTIMAL',
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      parentAssetId: row.parent_asset_id,
      assetTag: row.asset_tag,
      name: row.name,
      area: row.area,
      manufacturer: row.manufacturer,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      operationalState: row.operational_state as AssetOperationalState,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getAssetById(organizationId: string, assetId: string): Promise<Asset | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, plant_id, parent_asset_id, asset_tag, name,
              area, manufacturer, model_number, serial_number, operational_state,
              created_at, updated_at
       FROM assets
       WHERE id = $1 AND organization_id = $2`,
      [assetId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      parentAssetId: row.parent_asset_id,
      assetTag: row.asset_tag,
      name: row.name,
      area: row.area,
      manufacturer: row.manufacturer,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      operationalState: row.operational_state as AssetOperationalState,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async listAssets(organizationId: string, plantId?: string): Promise<Asset[]> {
    let query = `
      SELECT id, organization_id, plant_id, parent_asset_id, asset_tag, name,
             area, manufacturer, model_number, serial_number, operational_state,
             created_at, updated_at
      FROM assets
      WHERE organization_id = $1
    `;
    const params: (string | number)[] = [organizationId];

    if (plantId) {
      query += ` AND plant_id = $2`;
      params.push(plantId);
    }
    query += ` ORDER BY created_at ASC`;

    const res = await this.pool.query(query, params);
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      parentAssetId: row.parent_asset_id,
      assetTag: row.asset_tag,
      name: row.name,
      area: row.area,
      manufacturer: row.manufacturer,
      modelNumber: row.model_number,
      serialNumber: row.serial_number,
      operationalState: row.operational_state as AssetOperationalState,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  // --------------------------------------------------------------------------
  // Audit Events
  // --------------------------------------------------------------------------
  public async recordAuditEvent(dto: CreateAuditEventDTO): Promise<AuditEvent> {
    const res = await this.pool.query(
      `INSERT INTO audit_events (
         organization_id, actor_user_id, action, resource_type, resource_id,
         metadata, ip_address, user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id, actor_user_id, action, resource_type,
                 resource_id, metadata, ip_address, user_agent, created_at`,
      [
        dto.organizationId,
        dto.actorUserId ?? null,
        dto.action,
        dto.resourceType,
        dto.resourceId,
        JSON.stringify(dto.metadata ?? {}),
        dto.ipAddress ?? null,
        dto.userAgent ?? null,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at.toISOString(),
    };
  }

  public async listAuditEvents(organizationId: string, limit = 50): Promise<AuditEvent[]> {
    const res = await this.pool.query(
      `SELECT id, organization_id, actor_user_id, action, resource_type,
              resource_id, metadata, ip_address, user_agent, created_at
       FROM audit_events
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [organizationId, limit]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at.toISOString(),
    }));
  }

  // --------------------------------------------------------------------------
  // Phase 3: Documents
  // --------------------------------------------------------------------------
  public async createDocument(dto: CreateDocumentDTO): Promise<TechnicalDocument> {
    const res = await this.pool.query(
      `INSERT INTO documents (
         organization_id, plant_id, document_number, title, category,
         asset_tags, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, organization_id, plant_id, document_number, title,
                 category, asset_tags, created_by_user_id, created_at, updated_at`,
      [
        dto.organizationId,
        dto.plantId,
        dto.documentNumber,
        dto.title,
        dto.category,
        dto.assetTags ?? [],
        dto.createdByUserId ?? null,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      documentNumber: row.document_number,
      title: row.title,
      category: row.category,
      assetTags: row.asset_tags ?? [],
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      tenantId: row.organization_id,
      type: row.category,
      status: 'QUEUED',
      revision: 'REV-1',
    };
  }

  public async getDocumentById(organizationId: string, documentId: string): Promise<TechnicalDocument | null> {
    const res = await this.pool.query(
      `SELECT d.id, d.organization_id, d.plant_id, d.document_number, d.title,
              d.category, d.asset_tags, d.created_by_user_id, d.created_at, d.updated_at,
              v.id AS version_id, v.version_number, v.revision, v.filename, v.mime_type,
              v.file_size_bytes, v.checksum_sha256, v.storage_key, v.status AS version_status,
              v.total_pages, v.total_chunks, v.error_message AS version_error,
              v.created_at AS version_created_at, v.updated_at AS version_updated_at,
              j.id AS job_id, j.status AS job_status, j.progress_percent, j.current_step,
              j.retry_count, j.error_message AS job_error, j.started_at, j.completed_at,
              j.created_at AS job_created_at, j.updated_at AS job_updated_at
       FROM documents d
       LEFT JOIN LATERAL (
         SELECT * FROM document_versions
         WHERE document_id = d.id
         ORDER BY version_number DESC
         LIMIT 1
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT * FROM processing_jobs
         WHERE document_version_id = v.id
         ORDER BY created_at DESC
         LIMIT 1
       ) j ON true
       WHERE d.id = $1 AND d.organization_id = $2`,
      [documentId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapDocumentRow(res.rows[0]);
  }

  public async getDocumentByNumber(organizationId: string, documentNumber: string): Promise<TechnicalDocument | null> {
    const res = await this.pool.query(
      `SELECT d.id, d.organization_id, d.plant_id, d.document_number, d.title,
              d.category, d.asset_tags, d.created_by_user_id, d.created_at, d.updated_at,
              v.id AS version_id, v.version_number, v.revision, v.filename, v.mime_type,
              v.file_size_bytes, v.checksum_sha256, v.storage_key, v.status AS version_status,
              v.total_pages, v.total_chunks, v.error_message AS version_error,
              v.created_at AS version_created_at, v.updated_at AS version_updated_at,
              j.id AS job_id, j.status AS job_status, j.progress_percent, j.current_step,
              j.retry_count, j.error_message AS job_error, j.started_at, j.completed_at,
              j.created_at AS job_created_at, j.updated_at AS job_updated_at
       FROM documents d
       LEFT JOIN LATERAL (
         SELECT * FROM document_versions
         WHERE document_id = d.id
         ORDER BY version_number DESC
         LIMIT 1
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT * FROM processing_jobs
         WHERE document_version_id = v.id
         ORDER BY created_at DESC
         LIMIT 1
       ) j ON true
       WHERE d.document_number = $1 AND d.organization_id = $2`,
      [documentNumber, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapDocumentRow(res.rows[0]);
  }

  public async listDocuments(organizationId: string, filter?: DocumentFilterOptions): Promise<TechnicalDocument[]> {
    const conditions: string[] = ['d.organization_id = $1'];
    const params: unknown[] = [organizationId];

    if (filter?.plantId) {
      params.push(filter.plantId);
      conditions.push(`d.plant_id = $${params.length}`);
    }

    if (filter?.category) {
      params.push(filter.category);
      conditions.push(`d.category = $${params.length}`);
    }

    if (filter?.search) {
      params.push(`%${filter.search}%`);
      conditions.push(`(d.title ILIKE $${params.length} OR d.document_number ILIKE $${params.length})`);
    }

    const res = await this.pool.query(
      `SELECT d.id, d.organization_id, d.plant_id, d.document_number, d.title,
              d.category, d.asset_tags, d.created_by_user_id, d.created_at, d.updated_at,
              v.id AS version_id, v.version_number, v.revision, v.filename, v.mime_type,
              v.file_size_bytes, v.checksum_sha256, v.storage_key, v.status AS version_status,
              v.total_pages, v.total_chunks, v.error_message AS version_error,
              v.created_at AS version_created_at, v.updated_at AS version_updated_at,
              j.id AS job_id, j.status AS job_status, j.progress_percent, j.current_step,
              j.retry_count, j.error_message AS job_error, j.started_at, j.completed_at,
              j.created_at AS job_created_at, j.updated_at AS job_updated_at
       FROM documents d
       LEFT JOIN LATERAL (
         SELECT * FROM document_versions
         WHERE document_id = d.id
         ORDER BY version_number DESC
         LIMIT 1
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT * FROM processing_jobs
         WHERE document_version_id = v.id
         ORDER BY created_at DESC
         LIMIT 1
       ) j ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC`,
      params
    );

    return res.rows.map((row) => this.mapDocumentRow(row));
  }

  public async deleteDocument(organizationId: string, documentId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM documents WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [documentId, organizationId]
    );
    return res.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // Document Versions
  // --------------------------------------------------------------------------
  public async createDocumentVersion(dto: CreateDocumentVersionDTO): Promise<DocumentVersion> {
    const res = await this.pool.query(
      `INSERT INTO document_versions (
         document_id, version_number, revision, filename, mime_type,
         file_size_bytes, checksum_sha256, storage_key, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, document_id, version_number, revision, filename,
                 mime_type, file_size_bytes, checksum_sha256, storage_key,
                 status, total_pages, total_chunks, error_message, created_at, updated_at`,
      [
        dto.documentId,
        dto.versionNumber,
        dto.revision,
        dto.filename,
        dto.mimeType,
        dto.fileSizeBytes,
        dto.checksumSha256,
        dto.storageKey,
        dto.status ?? 'QUEUED',
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      revision: row.revision,
      filename: row.filename,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      checksumSha256: row.checksum_sha256,
      storageKey: row.storage_key,
      status: row.status,
      totalPages: row.total_pages,
      totalChunks: row.total_chunks,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getDocumentVersionById(versionId: string): Promise<DocumentVersion | null> {
    const res = await this.pool.query(
      `SELECT id, document_id, version_number, revision, filename,
              mime_type, file_size_bytes, checksum_sha256, storage_key,
              status, total_pages, total_chunks, error_message, created_at, updated_at
       FROM document_versions
       WHERE id = $1`,
      [versionId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      revision: row.revision,
      filename: row.filename,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      checksumSha256: row.checksum_sha256,
      storageKey: row.storage_key,
      status: row.status,
      totalPages: row.total_pages,
      totalChunks: row.total_chunks,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    const res = await this.pool.query(
      `SELECT id, document_id, version_number, revision, filename,
              mime_type, file_size_bytes, checksum_sha256, storage_key,
              status, total_pages, total_chunks, error_message, created_at, updated_at
       FROM document_versions
       WHERE document_id = $1
       ORDER BY version_number ASC`,
      [documentId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      revision: row.revision,
      filename: row.filename,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      checksumSha256: row.checksum_sha256,
      storageKey: row.storage_key,
      status: row.status,
      totalPages: row.total_pages,
      totalChunks: row.total_chunks,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  public async updateDocumentVersionStatus(
    versionId: string,
    status: DocumentStatus,
    totalPages?: number,
    totalChunks?: number,
    errorMessage?: string | null
  ): Promise<DocumentVersion> {
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: unknown[] = [versionId, status];

    if (typeof totalPages === 'number') {
      params.push(totalPages);
      updates.push(`total_pages = $${params.length}`);
    }

    if (typeof totalChunks === 'number') {
      params.push(totalChunks);
      updates.push(`total_chunks = $${params.length}`);
    }

    if (errorMessage !== undefined) {
      params.push(errorMessage);
      updates.push(`error_message = $${params.length}`);
    }

    const res = await this.pool.query(
      `UPDATE document_versions
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, document_id, version_number, revision, filename,
                 mime_type, file_size_bytes, checksum_sha256, storage_key,
                 status, total_pages, total_chunks, error_message, created_at, updated_at`,
      params
    );

    const row = res.rows[0];
    return {
      id: row.id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      revision: row.revision,
      filename: row.filename,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      checksumSha256: row.checksum_sha256,
      storageKey: row.storage_key,
      status: row.status,
      totalPages: row.total_pages,
      totalChunks: row.total_chunks,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Document Pages
  // --------------------------------------------------------------------------
  public async saveDocumentPages(pages: CreateDocumentPageDTO[]): Promise<DocumentPage[]> {
    if (pages.length === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const saved: DocumentPage[] = [];
      for (const p of pages) {
        const res = await client.query(
          `INSERT INTO document_pages (
             document_version_id, page_number, raw_text, section_headings,
             extraction_method, has_tables, storage_key
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (document_version_id, page_number) DO UPDATE
             SET raw_text = EXCLUDED.raw_text,
                 section_headings = EXCLUDED.section_headings,
                 extraction_method = EXCLUDED.extraction_method,
                 has_tables = EXCLUDED.has_tables,
                 storage_key = EXCLUDED.storage_key
           RETURNING id, document_version_id, page_number, raw_text,
                     section_headings, extraction_method, has_tables, storage_key, created_at`,
          [
            p.documentVersionId,
            p.pageNumber,
            p.rawText,
            p.sectionHeadings ?? [],
            p.extractionMethod,
            p.hasTables ?? false,
            p.storageKey ?? null,
          ]
        );
        const row = res.rows[0];
        saved.push({
          id: row.id,
          documentVersionId: row.document_version_id,
          pageNumber: row.page_number,
          rawText: row.raw_text,
          sectionHeadings: row.section_headings ?? [],
          extractionMethod: row.extraction_method,
          hasTables: row.has_tables,
          storageKey: row.storage_key,
          createdAt: row.created_at.toISOString(),
        });
      }
      await client.query('COMMIT');
      return saved;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async listDocumentPages(documentVersionId: string): Promise<DocumentPage[]> {
    const res = await this.pool.query(
      `SELECT id, document_version_id, page_number, raw_text,
              section_headings, extraction_method, has_tables, storage_key, created_at
       FROM document_pages
       WHERE document_version_id = $1
       ORDER BY page_number ASC`,
      [documentVersionId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      documentVersionId: row.document_version_id,
      pageNumber: row.page_number,
      rawText: row.raw_text,
      sectionHeadings: row.section_headings ?? [],
      extractionMethod: row.extraction_method,
      hasTables: row.has_tables,
      storageKey: row.storage_key,
      createdAt: row.created_at.toISOString(),
    }));
  }

  public async deleteDocumentPages(documentVersionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM document_pages WHERE document_version_id = $1`,
      [documentVersionId]
    );
  }

  // --------------------------------------------------------------------------
  // Knowledge Chunks
  // --------------------------------------------------------------------------
  public async saveKnowledgeChunks(chunks: CreateKnowledgeChunkDTO[]): Promise<KnowledgeChunk[]> {
    if (chunks.length === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const saved: KnowledgeChunk[] = [];
      for (const c of chunks) {
        const res = await client.query(
          `INSERT INTO knowledge_chunks (
             document_version_id, page_number, chunk_index, qdrant_point_id,
             content, section_heading, is_table, is_figure, extraction_method, token_count
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (document_version_id, chunk_index) DO UPDATE
             SET qdrant_point_id = EXCLUDED.qdrant_point_id,
                 content = EXCLUDED.content,
                 section_heading = EXCLUDED.section_heading,
                 is_table = EXCLUDED.is_table,
                 is_figure = EXCLUDED.is_figure,
                 extraction_method = EXCLUDED.extraction_method,
                 token_count = EXCLUDED.token_count
           RETURNING id, document_version_id, page_number, chunk_index, qdrant_point_id,
                     content, section_heading, is_table, is_figure, extraction_method, token_count, created_at`,
          [
            c.documentVersionId,
            c.pageNumber,
            c.chunkIndex,
            c.qdrantPointId,
            c.content,
            c.sectionHeading ?? null,
            c.isTable ?? false,
            c.isFigure ?? false,
            c.extractionMethod,
            c.tokenCount ?? 0,
          ]
        );
        const row = res.rows[0];
        saved.push({
          id: row.id,
          documentVersionId: row.document_version_id,
          pageNumber: row.page_number,
          chunkIndex: row.chunk_index,
          qdrantPointId: row.qdrant_point_id,
          content: row.content,
          sectionHeading: row.section_heading,
          isTable: row.is_table,
          isFigure: row.is_figure,
          extractionMethod: row.extraction_method,
          tokenCount: row.token_count,
          createdAt: row.created_at.toISOString(),
        });
      }
      await client.query('COMMIT');
      return saved;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async listKnowledgeChunks(documentVersionId: string): Promise<KnowledgeChunk[]> {
    const res = await this.pool.query(
      `SELECT id, document_version_id, page_number, chunk_index, qdrant_point_id,
              content, section_heading, is_table, is_figure, extraction_method, token_count, created_at
       FROM knowledge_chunks
       WHERE document_version_id = $1
       ORDER BY chunk_index ASC`,
      [documentVersionId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      documentVersionId: row.document_version_id,
      pageNumber: row.page_number,
      chunkIndex: row.chunk_index,
      qdrantPointId: row.qdrant_point_id,
      content: row.content,
      sectionHeading: row.section_heading,
      isTable: row.is_table,
      isFigure: row.is_figure,
      extractionMethod: row.extraction_method,
      tokenCount: row.token_count,
      createdAt: row.created_at.toISOString(),
    }));
  }

  public async deleteKnowledgeChunks(documentVersionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM knowledge_chunks WHERE document_version_id = $1`,
      [documentVersionId]
    );
  }

  // --------------------------------------------------------------------------
  // Processing Jobs
  // --------------------------------------------------------------------------
  public async createProcessingJob(dto: CreateProcessingJobDTO): Promise<ProcessingJob> {
    const res = await this.pool.query(
      `INSERT INTO processing_jobs (
         organization_id, document_version_id, status, progress_percent, current_step
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, document_version_id, status, progress_percent,
                 current_step, retry_count, error_message, started_at, completed_at,
                 created_at, updated_at`,
      [
        dto.organizationId,
        dto.documentVersionId,
        dto.status ?? 'QUEUED',
        dto.progressPercent ?? 0,
        dto.currentStep ?? 'Queued for processing',
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      documentVersionId: row.document_version_id,
      status: row.status,
      progressPercent: row.progress_percent,
      currentStep: row.current_step,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getProcessingJobById(jobId: string): Promise<ProcessingJob | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, document_version_id, status, progress_percent,
              current_step, retry_count, error_message, started_at, completed_at,
              created_at, updated_at
       FROM processing_jobs
       WHERE id = $1`,
      [jobId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      documentVersionId: row.document_version_id,
      status: row.status,
      progressPercent: row.progress_percent,
      currentStep: row.current_step,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getLatestProcessingJobByVersion(documentVersionId: string): Promise<ProcessingJob | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, document_version_id, status, progress_percent,
              current_step, retry_count, error_message, started_at, completed_at,
              created_at, updated_at
       FROM processing_jobs
       WHERE document_version_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [documentVersionId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      documentVersionId: row.document_version_id,
      status: row.status,
      progressPercent: row.progress_percent,
      currentStep: row.current_step,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async updateProcessingJobProgress(
    jobId: string,
    progressPercent: number,
    currentStep?: string,
    status?: DocumentStatus,
    errorMessage?: string | null
  ): Promise<ProcessingJob> {
    const updates: string[] = ['progress_percent = $2', 'updated_at = NOW()'];
    const params: unknown[] = [jobId, progressPercent];

    if (currentStep) {
      params.push(currentStep);
      updates.push(`current_step = $${params.length}`);
    }

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
      if (status === 'PROCESSING') {
        updates.push(`started_at = COALESCE(started_at, NOW())`);
      } else if (status === 'INDEXED' || status === 'FAILED') {
        updates.push(`completed_at = NOW()`);
      }
    }

    if (errorMessage !== undefined) {
      params.push(errorMessage);
      updates.push(`error_message = $${params.length}`);
    }

    const res = await this.pool.query(
      `UPDATE processing_jobs
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, organization_id, document_version_id, status, progress_percent,
                 current_step, retry_count, error_message, started_at, completed_at,
                 created_at, updated_at`,
      params
    );

    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      documentVersionId: row.document_version_id,
      status: row.status,
      progressPercent: row.progress_percent,
      currentStep: row.current_step,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async incrementJobRetryCount(jobId: string): Promise<ProcessingJob> {
    const res = await this.pool.query(
      `UPDATE processing_jobs
       SET retry_count = retry_count + 1,
           status = 'QUEUED',
           progress_percent = 0,
           current_step = CONCAT('Retry attempt #', retry_count + 1),
           error_message = NULL,
           started_at = NULL,
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, organization_id, document_version_id, status, progress_percent,
                 current_step, retry_count, error_message, started_at, completed_at,
                 created_at, updated_at`,
      [jobId]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      documentVersionId: row.document_version_id,
      status: row.status,
      progressPercent: row.progress_percent,
      currentStep: row.current_step,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  private mapDocumentRow(row: any): TechnicalDocument {
    const latestVersion: DocumentVersion | undefined = row.version_id
      ? {
          id: row.version_id,
          documentId: row.id,
          versionNumber: row.version_number,
          revision: row.revision,
          filename: row.filename,
          mimeType: row.mime_type,
          fileSizeBytes: Number(row.file_size_bytes),
          checksumSha256: row.checksum_sha256,
          storageKey: row.storage_key,
          status: row.version_status,
          totalPages: row.total_pages,
          totalChunks: row.total_chunks,
          errorMessage: row.version_error,
          createdAt: row.version_created_at.toISOString(),
          updatedAt: row.version_updated_at.toISOString(),
        }
      : undefined;

    const latestJob: ProcessingJob | undefined = row.job_id
      ? {
          id: row.job_id,
          organizationId: row.organization_id,
          documentVersionId: row.version_id,
          status: row.job_status,
          progressPercent: row.progress_percent,
          currentStep: row.current_step,
          retryCount: row.retry_count,
          errorMessage: row.job_error,
          startedAt: row.started_at ? row.started_at.toISOString() : null,
          completedAt: row.completed_at ? row.completed_at.toISOString() : null,
          createdAt: row.job_created_at.toISOString(),
          updatedAt: row.job_updated_at.toISOString(),
        }
      : undefined;

    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      documentNumber: row.document_number,
      title: row.title,
      category: row.category,
      assetTags: row.asset_tags ?? [],
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      latestVersion,
      latestJob,
      // Backward compatibility aliases
      tenantId: row.organization_id,
      type: row.category,
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
    const res = await this.pool.query(
      `INSERT INTO conversations (organization_id, plant_id, asset_id, user_id, title)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, plant_id, asset_id, user_id, title, created_at, updated_at`,
      [dto.organizationId, dto.plantId, dto.assetId ?? null, dto.userId, dto.title]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      assetId: row.asset_id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      messages: [],
    };
  }

  public async getConversationById(
    organizationId: string,
    conversationId: string
  ): Promise<Conversation | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, plant_id, asset_id, user_id, title, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND organization_id = $2`,
      [conversationId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const messages = await this.listMessages(row.id);
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      assetId: row.asset_id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      messages,
    };
  }

  public async listConversations(
    organizationId: string,
    userId: string,
    plantId?: string
  ): Promise<Conversation[]> {
    const conditions = ['organization_id = $1', 'user_id = $2'];
    const params: unknown[] = [organizationId, userId];

    if (plantId) {
      params.push(plantId);
      conditions.push(`plant_id = $${params.length}`);
    }

    const res = await this.pool.query(
      `SELECT id, organization_id, plant_id, asset_id, user_id, title, created_at, updated_at
       FROM conversations
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC`,
      params
    );

    const conversations: Conversation[] = [];
    for (const row of res.rows) {
      const messages = await this.listMessages(row.id);
      conversations.push({
        id: row.id,
        organizationId: row.organization_id,
        plantId: row.plant_id,
        assetId: row.asset_id,
        userId: row.user_id,
        title: row.title,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        messages,
      });
    }
    return conversations;
  }

  public async deleteConversation(
    organizationId: string,
    conversationId: string
  ): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM conversations WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [conversationId, organizationId]
    );
    return res.rows.length > 0;
  }

  // --------------------------------------------------------------------------
  // Messages & Citations
  // --------------------------------------------------------------------------
  public async createMessage(dto: CreateMessageDTO): Promise<CopilotMessage> {
    const res = await this.pool.query(
      `INSERT INTO messages (
         conversation_id, sender_type, content, confidence,
         is_insufficient_evidence, conflict_detected, conflict_details
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, conversation_id, sender_type, content, confidence,
                 is_insufficient_evidence, conflict_detected, conflict_details, created_at`,
      [
        dto.conversationId,
        dto.senderType,
        dto.content,
        dto.confidence ?? 'HIGH',
        dto.isInsufficientEvidence ?? false,
        dto.conflictDetected ?? false,
        dto.conflictDetails ?? null,
      ]
    );

    // Update conversation updated_at
    await this.pool.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [dto.conversationId]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderType: row.sender_type,
      content: row.content,
      confidence: row.confidence,
      isInsufficientEvidence: row.is_insufficient_evidence,
      conflictDetected: row.conflict_detected,
      conflictDetails: row.conflict_details,
      citations: [],
      createdAt: row.created_at.toISOString(),
      feedback: null,
    };
  }

  public async createCitations(citations: CreateCitationDTO[]): Promise<Citation[]> {
    if (citations.length === 0) return [];
    const saved: Citation[] = [];

    for (const c of citations) {
      const res = await this.pool.query(
        `INSERT INTO citations (
           message_id, document_id, document_version_id, page_number,
           knowledge_chunk_id, snippet, confidence_score, section_heading
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, message_id, document_id, document_version_id, page_number,
                   knowledge_chunk_id, snippet, confidence_score, section_heading, created_at`,
        [
          c.messageId,
          c.documentId,
          c.documentVersionId,
          c.pageNumber,
          c.knowledgeChunkId ?? null,
          c.snippet,
          c.confidenceScore ?? 1.0,
          c.sectionHeading ?? null,
        ]
      );
      const row = res.rows[0];

      // Fetch document title, doc number and version revision
      const docRes = await this.pool.query(
        `SELECT d.document_number, d.title, v.revision
         FROM documents d
         LEFT JOIN document_versions v ON v.id = $2
         WHERE d.id = $1`,
        [c.documentId, c.documentVersionId]
      );
      const doc = docRes.rows[0];

      saved.push({
        id: row.id,
        messageId: row.message_id,
        documentId: row.document_id,
        documentNumber: doc?.document_number || 'DOC-UNKNOWN',
        documentTitle: doc?.title || 'Unknown Document',
        documentVersionId: row.document_version_id,
        revisionTag: doc?.revision || 'REV-A',
        pageNumber: row.page_number,
        chunkId: row.knowledge_chunk_id || row.id,
        snippet: row.snippet,
        confidenceScore: Number(row.confidence_score),
        sectionHeading: row.section_heading,
      });
    }
    return saved;
  }

  public async getMessageWithCitations(messageId: string): Promise<CopilotMessage | null> {
    const msgRes = await this.pool.query(
      `SELECT id, conversation_id, sender_type, content, confidence,
              is_insufficient_evidence, conflict_detected, conflict_details, created_at
       FROM messages
       WHERE id = $1`,
      [messageId]
    );
    if (msgRes.rows.length === 0) return null;
    const msgRow = msgRes.rows[0];

    const citRes = await this.pool.query(
      `SELECT c.id, c.message_id, c.document_id, c.document_version_id, c.page_number,
              c.knowledge_chunk_id, c.snippet, c.confidence_score, c.section_heading,
              d.document_number, d.title AS document_title
       FROM citations c
       JOIN documents d ON d.id = c.document_id
       WHERE c.message_id = $1`,
      [messageId]
    );

    const citations: Citation[] = citRes.rows.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      documentId: r.document_id,
      documentNumber: r.document_number,
      documentTitle: r.document_title,
      documentVersionId: r.document_version_id,
      pageNumber: r.page_number,
      chunkId: r.knowledge_chunk_id || r.id,
      snippet: r.snippet,
      confidenceScore: Number(r.confidence_score),
      sectionHeading: r.section_heading,
    }));

    const fbRes = await this.pool.query(
      `SELECT id, message_id, user_id, rating, comment, created_at
       FROM message_feedback
       WHERE message_id = $1`,
      [messageId]
    );

    const feedback = fbRes.rows[0]
      ? {
          id: fbRes.rows[0].id,
          messageId: fbRes.rows[0].message_id,
          userId: fbRes.rows[0].user_id,
          rating: fbRes.rows[0].rating,
          comment: fbRes.rows[0].comment,
          createdAt: fbRes.rows[0].created_at.toISOString(),
        }
      : null;

    return {
      id: msgRow.id,
      conversationId: msgRow.conversation_id,
      senderType: msgRow.sender_type,
      content: msgRow.content,
      confidence: msgRow.confidence,
      isInsufficientEvidence: msgRow.is_insufficient_evidence,
      conflictDetected: msgRow.conflict_detected,
      conflictDetails: msgRow.conflict_details,
      citations,
      createdAt: msgRow.created_at.toISOString(),
      feedback,
    };
  }

  public async listMessages(conversationId: string): Promise<CopilotMessage[]> {
    const res = await this.pool.query(
      `SELECT id FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId]
    );

    const messages: CopilotMessage[] = [];
    for (const row of res.rows) {
      const msg = await this.getMessageWithCitations(row.id);
      if (msg) messages.push(msg);
    }
    return messages;
  }

  public async recordMessageFeedback(dto: CreateFeedbackDTO): Promise<MessageFeedback> {
    const res = await this.pool.query(
      `INSERT INTO message_feedback (message_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (message_id, user_id) DO UPDATE
         SET rating = EXCLUDED.rating,
             comment = EXCLUDED.comment,
             created_at = NOW()
       RETURNING id, message_id, user_id, rating, comment, created_at`,
      [dto.messageId, dto.userId, dto.rating, dto.comment ?? null]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      messageId: row.message_id,
      userId: row.user_id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at.toISOString(),
    };
  }
}

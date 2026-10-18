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
} from '@forgex/shared-types';
import type {
  IDataStore,
  CreateOrganizationDTO,
  CreateUserDTO,
  CreateMembershipDTO,
  CreatePlantDTO,
  CreateAssetDTO,
  CreateAuditEventDTO,
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
}

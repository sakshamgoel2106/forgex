import crypto from 'node:crypto';
import type {
  Organization,
  User,
  OrganizationMembership,
  Plant,
  Asset,
  AuditEvent,
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

export class InMemoryDataStore implements IDataStore {
  private organizations = new Map<string, Organization>();
  private users = new Map<string, User>();
  private memberships = new Map<string, OrganizationMembership>();
  private plants = new Map<string, Plant>();
  private assets = new Map<string, Asset>();
  private auditEvents: AuditEvent[] = [];

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
    for (const user of this.users.values()) {
      if (user.externalAuthId === dto.externalAuthId) {
        throw new Error(`User with external auth ID '${dto.externalAuthId}' already exists.`);
      }
      if (user.email === dto.email) {
        throw new Error(`User with email '${dto.email}' already exists.`);
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
  // Memberships
  // --------------------------------------------------------------------------
  public async createMembership(dto: CreateMembershipDTO): Promise<OrganizationMembership> {
    if (!this.organizations.has(dto.organizationId)) {
      throw new Error(`Organization '${dto.organizationId}' not found.`);
    }
    if (!this.users.has(dto.userId)) {
      throw new Error(`User '${dto.userId}' not found.`);
    }

    const key = `${dto.organizationId}:${dto.userId}`;
    for (const m of this.memberships.values()) {
      if (`${m.organizationId}:${m.userId}` === key) {
        throw new Error(`Membership already exists for user in organization.`);
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
    return Array.from(this.memberships.values()).filter((m) => m.userId === userId);
  }

  // --------------------------------------------------------------------------
  // Plants (Strict Organization Scoping)
  // --------------------------------------------------------------------------
  public async createPlant(organizationId: string, dto: CreatePlantDTO): Promise<Plant> {
    if (!this.organizations.has(organizationId)) {
      throw new Error(`Organization '${organizationId}' not found.`);
    }

    for (const p of this.plants.values()) {
      if (p.organizationId === organizationId && p.code === dto.code) {
        throw new Error(`Plant code '${dto.code}' already exists in this organization.`);
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
    if (!plant || plant.organizationId !== organizationId) {
      return null;
    }
    return plant;
  }

  public async listPlants(organizationId: string): Promise<Plant[]> {
    return Array.from(this.plants.values()).filter((p) => p.organizationId === organizationId);
  }

  // --------------------------------------------------------------------------
  // Assets (Strict Organization Scoping & Hierarchical Parent)
  // --------------------------------------------------------------------------
  public async createAsset(organizationId: string, dto: CreateAssetDTO): Promise<Asset> {
    const plant = await this.getPlantById(organizationId, dto.plantId);
    if (!plant) {
      throw new Error(`Plant '${dto.plantId}' not found or belongs to another organization.`);
    }

    if (dto.parentAssetId) {
      const parent = await this.getAssetById(organizationId, dto.parentAssetId);
      if (!parent) {
        throw new Error(`Parent asset '${dto.parentAssetId}' not found or belongs to another organization.`);
      }
    }

    for (const a of this.assets.values()) {
      if (a.organizationId === organizationId && a.assetTag === dto.assetTag) {
        throw new Error(`Asset tag '${dto.assetTag}' already exists in this organization.`);
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
    if (!asset || asset.organizationId !== organizationId) {
      return null;
    }
    return asset;
  }

  public async listAssets(organizationId: string, plantId?: string): Promise<Asset[]> {
    return Array.from(this.assets.values()).filter(
      (a) => a.organizationId === organizationId && (!plantId || a.plantId === plantId)
    );
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

  public clear(): void {
    this.organizations.clear();
    this.users.clear();
    this.memberships.clear();
    this.plants.clear();
    this.assets.clear();
    this.auditEvents = [];
  }
}

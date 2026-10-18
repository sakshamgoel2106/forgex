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
}

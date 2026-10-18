/**
 * ForgeX AI — Core Role-Based Access Control and Identity Specifications
 */

// Phase 2 Initial Core Organization Roles
export type OrgRole =
  | 'ORGANIZATION_ADMIN'
  | 'ENGINEER_TECHNICIAN'
  | 'VIEWER';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  externalAuthId: string; // Subject ID from Supabase Auth or Keycloak OIDC
  email: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedContext {
  user: User;
  membership: OrganizationMembership;
  organization: Organization;
}

export type OrgPermission =
  | 'org:manage'
  | 'members:manage'
  | 'plants:create'
  | 'plants:read'
  | 'plants:delete'
  | 'assets:create'
  | 'assets:read'
  | 'assets:update'
  | 'assets:delete'
  | 'documents:manage'
  | 'maintenance:execute'
  | 'audit:read';

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  ORGANIZATION_ADMIN: [
    'org:manage',
    'members:manage',
    'plants:create',
    'plants:read',
    'plants:delete',
    'assets:create',
    'assets:read',
    'assets:update',
    'assets:delete',
    'documents:manage',
    'maintenance:execute',
    'audit:read',
  ],
  ENGINEER_TECHNICIAN: [
    'plants:read',
    'plants:create',
    'assets:create',
    'assets:read',
    'assets:update',
    'documents:manage',
    'maintenance:execute',
  ],
  VIEWER: [
    'plants:read',
    'assets:read',
  ],
};

// Legacy / Extended Plant Personas (For UI display & operational granularity)
export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'PLANT_ENGINEER'
  | 'SHIFT_SUPERVISOR'
  | 'TECHNICIAN'
  | 'AUDITOR';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_APPROVAL';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  badgeNumber: string;
  tenantId: string;
  plantId: string;
  role: UserRole;
  status: UserStatus;
  allowedAssetTags: string[];
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

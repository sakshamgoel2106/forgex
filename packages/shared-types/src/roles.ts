/**
 * ForgeX AI — Core Role-Based Access Control and Identity Specifications
 */

// Phase A Complete Organization Roles
export type OrgRole =
  | 'ORGANIZATION_OWNER'
  | 'ORGANIZATION_ADMIN'
  | 'PLANT_MANAGER'
  | 'ENGINEER'
  | 'TECHNICIAN'
  | 'VIEWER'
  | 'WORKER'
  | 'ENGINEER_TECHNICIAN'; // Preserved alias for backwards compatibility

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme?: 'graphite' | 'dark' | 'light';
  language?: string;
  emailNotifications?: boolean;
  smsAlerts?: boolean;
  safetyCriticalAlertsOnly?: boolean;
}

export interface UserSession {
  id: string;
  device: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface User {
  id: string;
  externalAuthId: string; // Subject ID from Supabase Auth, Keycloak OIDC, or LocalDev
  email: string;
  fullName: string;
  jobTitle?: string;
  department?: string;
  phone?: string;
  avatarUrl?: string;
  preferences?: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
  assignedPlantIds?: string[]; // Optional plant-scoping for plant managers, engineers, technicians
  createdAt: string;
  updatedAt: string;
  user?: User; // Populated in membership queries
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: string;
  status: InvitationStatus;
  assignedPlantIds?: string[];
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
  | 'org:delete'
  | 'members:read'
  | 'members:invite'
  | 'members:manage_roles'
  | 'members:remove'
  | 'plants:create'
  | 'plants:read'
  | 'plants:update'
  | 'plants:delete'
  | 'assets:create'
  | 'assets:read'
  | 'assets:update'
  | 'assets:delete'
  | 'machines:create'
  | 'machines:read'
  | 'machines:update'
  | 'machines:delete'
  | 'machines:approve'
  | 'machines:public_lookup'
  | 'tasks:create'
  | 'tasks:read'
  | 'tasks:submit'
  | 'tasks:review'
  | 'badges:manage'
  | 'models3d:manage'
  | 'pid:manage'
  | 'engineering:manage'
  | 'engineering:read'
  | 'industry:manage'
  | 'documents:read'
  | 'documents:manage'
  | 'documents:upload'
  | 'documents:delete'
  | 'documents:read_original'
  | 'evidence:retrieve'
  | 'evidence:view_reference'
  | 'tickets:create'
  | 'tickets:read'
  | 'tickets:manage'
  | 'specialists:manage'
  | 'specialists:read'
  | 'employees:manage'
  | 'employees:read'
  | 'copilot:query'
  | 'visual:inspect'
  | 'maintenance:read'
  | 'maintenance:create'
  | 'maintenance:execute'
  | 'maintenance:approve'
  | 'audit:read'
  | 'guidance:publish'
  | 'guidance:manage'
  | 'guidance:read';

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  ORGANIZATION_OWNER: [
    'org:manage',
    'org:delete',
    'members:read',
    'members:invite',
    'members:manage_roles',
    'members:remove',
    'plants:create',
    'plants:read',
    'plants:update',
    'plants:delete',
    'assets:create',
    'assets:read',
    'assets:update',
    'assets:delete',
    'machines:create',
    'machines:read',
    'machines:update',
    'machines:delete',
    'machines:approve',
    'machines:public_lookup',
    'tasks:create',
    'tasks:read',
    'tasks:submit',
    'tasks:review',
    'badges:manage',
    'models3d:manage',
    'pid:manage',
    'engineering:manage',
    'engineering:read',
    'industry:manage',
    'documents:read',
    'documents:manage',
    'documents:upload',
    'documents:delete',
    'documents:read_original',
    'evidence:retrieve',
    'evidence:view_reference',
    'tickets:create',
    'tickets:read',
    'tickets:manage',
    'specialists:manage',
    'specialists:read',
    'employees:manage',
    'employees:read',
    'copilot:query',
    'visual:inspect',
    'maintenance:read',
    'maintenance:create',
    'maintenance:execute',
    'maintenance:approve',
    'audit:read',
    'guidance:publish',
    'guidance:manage',
    'guidance:read',
  ],
  ORGANIZATION_ADMIN: [
    'org:manage',
    'members:read',
    'members:invite',
    'members:manage_roles',
    'members:remove',
    'plants:create',
    'plants:read',
    'plants:update',
    'plants:delete',
    'assets:create',
    'assets:read',
    'assets:update',
    'assets:delete',
    'machines:create',
    'machines:read',
    'machines:update',
    'machines:delete',
    'machines:approve',
    'machines:public_lookup',
    'tasks:create',
    'tasks:read',
    'tasks:submit',
    'tasks:review',
    'badges:manage',
    'models3d:manage',
    'pid:manage',
    'engineering:manage',
    'engineering:read',
    'industry:manage',
    'documents:read',
    'documents:manage',
    'documents:upload',
    'documents:delete',
    'documents:read_original',
    'evidence:retrieve',
    'evidence:view_reference',
    'tickets:create',
    'tickets:read',
    'tickets:manage',
    'specialists:manage',
    'specialists:read',
    'employees:manage',
    'employees:read',
    'copilot:query',
    'visual:inspect',
    'maintenance:read',
    'maintenance:create',
    'maintenance:execute',
    'maintenance:approve',
    'audit:read',
    'guidance:publish',
    'guidance:manage',
    'guidance:read',
  ],
  PLANT_MANAGER: [
    'members:read',
    'plants:read',
    'plants:update',
    'assets:read',
    'assets:update',
    'machines:create',
    'machines:read',
    'machines:update',
    'machines:approve',
    'tasks:create',
    'tasks:read',
    'tasks:submit',
    'tasks:review',
    'models3d:manage',
    'pid:manage',
    'engineering:read',
    'evidence:retrieve',
    'evidence:view_reference',
    'tickets:create',
    'tickets:read',
    'specialists:read',
    'employees:read',
    'copilot:query',
    'visual:inspect',
    'maintenance:read',
    'maintenance:create',
    'maintenance:execute',
    'maintenance:approve',
    'guidance:read',
  ],
  ENGINEER: [
    'plants:read',
    'assets:read',
    'machines:read',
    'tasks:read',
    'tasks:submit',
    'models3d:manage',
    'pid:manage',
    'engineering:read',
    'evidence:retrieve',
    'evidence:view_reference',
    'tickets:create',
    'tickets:read',
    'employees:read',
    'copilot:query',
    'visual:inspect',
    'maintenance:read',
    'maintenance:create',
    'maintenance:execute',
    'guidance:read',
  ],
  TECHNICIAN: [
    'plants:read',
    'assets:read',
    'machines:read',
    'tasks:read',
    'tasks:submit',
    'engineering:read',
    'evidence:retrieve',
    'evidence:view_reference',
    'tickets:create',
    'tickets:read',
    'employees:read',
    'copilot:query',
    'visual:inspect',
    'maintenance:read',
    'maintenance:execute',
    'guidance:read',
  ],
  VIEWER: [
    'plants:read',
    'assets:read',
    'machines:read',
    'tasks:read',
    'engineering:read',
    'maintenance:read',
    'audit:read',
    'guidance:read',
  ],
  WORKER: [
    'plants:read',
    'assets:read',
    'machines:read',
    'engineering:read',
    'copilot:query',
    'tickets:create',
    'maintenance:read',
    'guidance:read',
  ],
  // Legacy alias maps to full permissions for legacy Phase 1 test suites
  ENGINEER_TECHNICIAN: [
    'plants:read',
    'assets:read',
    'machines:read',
    'tasks:read',
    'tasks:submit',
    'models3d:manage',
    'pid:manage',
    'engineering:read',
    'documents:read',
    'documents:manage',
    'documents:upload',
    'documents:read_original',
    'evidence:retrieve',
    'evidence:view_reference',
    'tickets:create',
    'tickets:read',
    'copilot:query',
    'visual:inspect',
    'maintenance:read',
    'maintenance:create',
    'maintenance:execute',
    'guidance:read',
  ],
};

/**
 * Checks if a role has the specified permission
 */
export function hasPermission(role: OrgRole, permission: OrgPermission): boolean {
  const permissions = ORG_ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Hierarchy level for privilege comparison
 * Higher number = higher authority
 */
const ROLE_HIERARCHY: Record<OrgRole, number> = {
  ORGANIZATION_OWNER: 100,
  ORGANIZATION_ADMIN: 80,
  PLANT_MANAGER: 60,
  ENGINEER: 40,
  ENGINEER_TECHNICIAN: 40,
  TECHNICIAN: 20,
  WORKER: 15,
  VIEWER: 10,
};

/**
 * Validates whether an actor with a given role can manage, assign, or revoke a target role.
 * - Non-owners cannot assign or revoke ORGANIZATION_OWNER.
 * - An actor can only assign or modify roles at a lower hierarchy level than their own,
 *   except ORGANIZATION_OWNER can assign any role including ORGANIZATION_OWNER transfer.
 */
export function canManageRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (actorRole === 'ORGANIZATION_OWNER') {
    return true;
  }
  if (actorRole === 'ORGANIZATION_ADMIN') {
    // Admins can manage anyone below ORGANIZATION_ADMIN (PLANT_MANAGER, ENGINEER, TECHNICIAN, VIEWER)
    return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY.ORGANIZATION_ADMIN;
  }
  return false;
}

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

import type { OrgRole } from './roles.js';

export type PublicationStatus = 'PUBLISHED' | 'SUPERSEDED' | 'EXPIRED' | 'REVOKED';

export type GuidanceDisclosureClassification =
  | 'OPERATIONAL_PUBLIC'
  | 'WORKER_APPROVED'
  | 'ROLE_RESTRICTED';

export interface PublishedApprovedGuidance {
  id: string;
  organizationId: string;
  plantId: string;
  machineId?: string | null;
  machineAssetTag?: string | null;
  title: string;
  guidanceContent: string;
  sourceDocumentId?: string | null;
  sourceDocumentNumber?: string | null;
  sourceDocumentVersionId?: string | null;
  sourceSectionHeading?: string | null;
  sourcePageNumber?: number | null;
  applicableRoles: OrgRole[];
  disclosureClassification: GuidanceDisclosureClassification;
  reviewedByUserId: string;
  reviewedByUserEmail: string;
  approvedAt: string;
  expiresAt?: string | null;
  status: PublicationStatus;
  supersededByPublicationId?: string | null;
  revisionNumber: number;
  revocationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishGuidanceDTO {
  plantId: string;
  machineId?: string | null;
  machineAssetTag?: string | null;
  title: string;
  guidanceContent: string;
  sourceDocumentId?: string | null;
  sourceDocumentNumber?: string | null;
  sourceDocumentVersionId?: string | null;
  sourceSectionHeading?: string | null;
  sourcePageNumber?: number | null;
  applicableRoles?: OrgRole[];
  disclosureClassification?: GuidanceDisclosureClassification;
  expiresAt?: string | null;
}

export interface ListGuidanceFilters {
  plantId?: string;
  machineId?: string;
  status?: PublicationStatus;
  role?: OrgRole;
}

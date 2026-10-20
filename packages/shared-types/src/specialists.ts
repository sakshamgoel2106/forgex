import type { OrgRole } from './roles.js';

export type EmployeeAccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type EmployeeAvailabilityStatus = 'AVAILABLE' | 'ON_DUTY' | 'BUSY' | 'ON_LEAVE';
export type EmployeeQualificationStatus = 'CERTIFIED' | 'VERIFIED' | 'IN_TRAINING' | 'EXPIRED';

export interface EmployeeProfile {
  id: string;
  organizationId: string;
  userId: string;
  employeeNumber: string; // e.g. "EMP-9402"
  fullName: string;
  email: string;
  role: OrgRole;
  department: string;
  assignedPlantIds: string[];
  accountStatus: EmployeeAccountStatus;
  availabilityStatus: EmployeeAvailabilityStatus;
  qualificationStatus: EmployeeQualificationStatus;
  verifiedSkills: string[];
  specializedMachineIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type SpecialistAssignmentStatus = 'ASSIGNED' | 'UNASSIGNED' | 'QUALIFICATION_PENDING';

export interface MachineSpecialistMapping {
  id: string;
  organizationId: string;
  machineId: string;
  plantId: string;
  primarySpecialistUserId?: string | null;
  primarySpecialistName?: string | null;
  backupSpecialistUserIds: string[];
  requiredCertifications: string[];
  assignmentStatus: SpecialistAssignmentStatus;
  escalationTimeoutMinutes: number;
  escalationRole: OrgRole;
  assignedByUserId?: string | null;
  assignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

import type { RootCauseStatus } from './maintenanceHistory.js';

export type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'PENDING_VERIFICATION'
  | 'RESOLVED'
  | 'CLOSED'
  | 'UNRESOLVED'
  | 'REOPENED';
export type TicketEscalationReason =
  | 'INSUFFICIENT_EVIDENCE'
  | 'SAFETY_CRITICAL'
  | 'CONFIDENTIAL_DISCLOSURE_RESTRICTED'
  | 'OUTDATED_DOCUMENTATION'
  | 'NO_APPROVED_EVIDENCE'
  | 'MANUAL_ESCALATION';

export type TicketAssignmentStatus =
  | 'ASSIGNED_PRIMARY'
  | 'ASSIGNED_BACKUP'
  | 'ESCALATED_TRIAGE'
  | 'NEEDS_SPECIALIST_ASSIGNMENT';

export type KnowledgeUpdateStatus =
  | 'NONE'
  | 'PENDING_ADMIN_REVIEW'
  | 'APPROVED_PROMOTED'
  | 'REJECTED';

export interface TicketHistoryItem {
  id: string;
  ticketId: string;
  actorUserId: string;
  action: string;
  previousStatus?: TicketStatus | null;
  newStatus: TicketStatus;
  notes?: string | null;
  timestamp: string;
}

export interface SpecialistTicket {
  id: string;
  ticketNumber: string; // e.g. "TICK-2026-8812"
  organizationId: string;
  plantId: string;
  machineId?: string | null;
  machineAssetTag?: string | null;
  reportedByUserId: string;
  reportedByUserName?: string | null;
  originalQuestion: string;
  diagnosticDetails?: string | null;
  escalationReason: TicketEscalationReason;
  evidenceCheckResult: {
    hasApprovedEvidence: boolean;
    confidenceScore: number;
    reason: string;
  };
  severity: TicketSeverity;
  assignedSpecialistUserId?: string | null;
  assignedSpecialistName?: string | null;
  assignmentStatus: TicketAssignmentStatus;
  status: TicketStatus;
  faultCategory?: string | null;
  technicianObservations?: string | null;
  diagnosisOutcome?: string | null;
  repairOutcome?: string | null;
  rootCause?: string | null;
  rootCauseStatus?: RootCauseStatus | null;
  maintenanceRecordId?: string | null;
  requiresRestartApproval?: boolean;
  restartApproved?: boolean;
  restartApprovedByUserId?: string | null;
  restartApprovedAt?: string | null;
  reopenCount?: number;
  reopenedAt?: string | null;
  reopenedByUserId?: string | null;
  proposedKnowledgeUpdate?: string | null;
  knowledgeUpdateStatus: KnowledgeUpdateStatus;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  history: TicketHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketOversightSummary {
  totalTickets: number;
  openTickets: number;
  unassignedTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  escalatedTickets: number;
  specialistWorkloads: Record<
    string,
    { specialistName: string; activeCount: number; resolvedCount: number }
  >;
  recentEscalations: SpecialistTicket[];
}

export type InformationDisclosurePolicy =
  | 'ADMIN_FULL'
  | 'CONFIDENTIAL_RESTRICTED'
  | 'MINIMAL_GUIDANCE_ONLY';

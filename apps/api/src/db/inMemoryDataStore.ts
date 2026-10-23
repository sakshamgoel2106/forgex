import crypto from 'node:crypto';
import type {
  Organization,
  User,
  UserSession,
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
  OrganizationInvitation,
  InvitationStatus,
  OrgRole,
  MembershipStatus,
  Machine,
  MissingInformationTask,
  ComponentMapping,
  EmployeeBadge,
  MachineLedgerSummary,
  MachineVerificationRecord,
  PublicMachineKnowledge,
  SpecVerificationStatus,
  BadgeStatus,
  IndustryProfile,
  EngineeringModel3D,
  EngineeringAssetStatus,
  ManufacturerResource,
  ManufacturerResourceType,
  CADFileFormat,
  EngineeringDrawing,
  EngineeringAssetCenterSummary,
  EmployeeProfile,
  MachineSpecialistMapping,
  SpecialistAssignmentStatus,
  SpecialistTicket,
  TicketSeverity,
  TicketStatus,
  TicketHistoryItem,
  TicketOversightSummary,
  MaintenanceRecord,
  MaintenanceAuditEntry,
  RecurringFaultThresholdConfig,
  RecurringFaultAnalysis,
  SecurityEvent,
  SecurityAlert,
  CreateSecurityEventDTO,
  CreateSecurityAlertDTO,
  ListSecurityEventsQuery,
  ListSecurityAlertsQuery,
  MachineEvidenceClaim,
  MachineRecoveryProfile,
  MachineRecoverySummary,
  CreateEvidenceClaimDTO,
  ReviewEvidenceClaimDTO,
  ClaimFilterOptions,
  RecoveryGapField,
  GapFieldStatus,
  ClaimAuditEntry,
  PublishedApprovedGuidance,
  PublishGuidanceDTO,
  ListGuidanceFilters,
  ExpertKnowledgeEntry,
  ExpertNoteReview,
  CreateExpertKnowledgeDTO,
  ReviewExpertKnowledgeDTO,
  ExpertKnowledgeFilterOptions,
  OperationalAnalyticsDashboard,
  OperationalAnalyticsFilterOptions,
  IssueFrequencyMetric,
  TopAffectedMachineMetric,
  SpecialistWorkloadMetric,
  KnowledgeGapMetric,
  UnansweredQuestionSample,
  EmailOtpRecord,
  GoogleOAuthStateRecord,
  RcaSession,
} from '@forgex/shared-types';
import { DEFAULT_INDUSTRY_PROFILES } from '@forgex/shared-types';
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
  CreateInvitationDTO,
  RegisterOrganizationDTO,
  CreateMachineDTO,
  MachineFilterOptions,
  CreateMissingInfoTaskDTO,
  CreateEmailOtpDTO,
  SaveGoogleOAuthStateDTO,
  MissingInfoTaskFilterOptions,
  CreateComponentMappingDTO,
  IssueEmployeeBadgeDTO,
  SavePublicKnowledgeDTO,
  CreateIndustryProfileDTO,
  CreateEngineeringModel3DDTO,
  EngineeringModelFilterOptions,
  CreateManufacturerResourceDTO,
  ManufacturerResourceFilterOptions,
  CreateEngineeringDrawingDTO,
  EngineeringDrawingFilterOptions,
  CreateEmployeeProfileDTO,
  EmployeeProfileFilterOptions,
  SetMachineSpecialistMappingDTO,
  CreateSpecialistTicketDTO,
  SpecialistTicketFilterOptions,
  CreateMaintenanceRecordDTO,
  UpdateMaintenanceRecordDTO,
  MaintenanceRecordFilterOptions,
  RecurringFaultOptions,
  SetRecurringFaultPolicyDTO,
  ResolveSpecialistTicketDTO,
  ReopenSpecialistTicketDTO,
  ApproveTicketRestartDTO,
} from './dataStore.interface.js';
import { sanitizeMachineOrAssetId } from '../utils/uuid.js';
import { computeMachineVerification } from '../services/machineVerification.service.js';

export class InMemoryDataStore implements IDataStore {
  private organizations = new Map<string, Organization>();
  private users = new Map<string, User>();
  private memberships = new Map<string, OrganizationMembership>();
  private invitations = new Map<string, OrganizationInvitation>();
  private plants = new Map<string, Plant>();
  private assets = new Map<string, Asset>();
  private machines = new Map<string, Machine>();
  private machineVerifications = new Map<string, MachineVerificationRecord>();
  private missingInfoTasks = new Map<string, MissingInformationTask>();
  private componentMappings = new Map<string, ComponentMapping>();
  private employeeBadges = new Map<string, EmployeeBadge>();
  private publicKnowledge = new Map<string, PublicMachineKnowledge>();
  private auditEvents: AuditEvent[] = [];

  // Phase B Add-on: Universal Industry Support & Engineering Asset Center
  private industryProfiles = new Map<string, IndustryProfile>();
  private engineeringModels = new Map<string, EngineeringModel3D>();
  private manufacturerResources = new Map<string, ManufacturerResource>();
  private engineeringDrawings = new Map<string, EngineeringDrawing>();

  // Confidential Knowledge, Employee Directory, Specialists & Tickets
  private employeeProfiles = new Map<string, EmployeeProfile>();
  private machineSpecialists = new Map<string, MachineSpecialistMapping>();
  private specialistTickets = new Map<string, SpecialistTicket>();

  // Persistent Maintenance History & Recurring Faults
  private maintenanceRecords = new Map<string, MaintenanceRecord>();
  private recurringFaultPolicies = new Map<string, RecurringFaultThresholdConfig>();

  // Security Events & Actionable Admin Alerts
  private securityEvents = new Map<string, SecurityEvent>();
  private securityAlerts = new Map<string, SecurityAlert>();

  // Machine Knowledge Recovery Claims (Phase 3)
  private evidenceClaims = new Map<string, MachineEvidenceClaim>();

  // Published Approved Operational Guidance (Prompt 01)
  private publishedGuidance = new Map<string, PublishedApprovedGuidance>();

  // Expert Knowledge Library (Prompt 04)
  private expertKnowledgeEntries = new Map<string, ExpertKnowledgeEntry>();

  // Root Cause Analysis (RCA) Sessions
  private rcaSessions = new Map<string, RcaSession>();

  constructor() {
    this.seedDefaultIndustryProfiles();
  }

  private seedDefaultIndustryProfiles(): void {
    for (const p of DEFAULT_INDUSTRY_PROFILES) {
      this.industryProfiles.set(p.id, { ...p });
    }
  }

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

  public async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | null> {
    const existing = this.organizations.get(id);
    if (!existing) return null;
    const updated: Organization = {
      ...existing,
      ...updates,
      id: existing.id,
      slug: existing.slug,
      deploymentType: existing.deploymentType, // immutable
      updatedAt: new Date().toISOString(),
    };
    this.organizations.set(id, updated);
    return updated;
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  public async createUser(dto: CreateUserDTO): Promise<User> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === dto.email.toLowerCase()) {
        throw new Error(`User with email '${dto.email}' already exists.`);
      }
      if (dto.externalAuthId && u.externalAuthId === dto.externalAuthId) {
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

  public async getUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) return user;
    }
    return null;
  }

  private userSessions: Map<string, UserSession[]> = new Map();
  private passwordResetTokens = new Map<string, { userId: string; expiresAt: string; usedAt: string | null }>();

  public async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    const updated: User = {
      ...user,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(userId, updated);
    return updated;
  }

  public async listUserSessions(userId: string): Promise<UserSession[]> {
    if (!this.userSessions.has(userId)) {
      const initialSessions: UserSession[] = [
        {
          id: `sess-${crypto.randomUUID().slice(0, 8)}`,
          device: 'Industrial Toughbook CF-33 (Chrome / Linux x86_64)',
          ipAddress: '10.240.12.84 (Plant Internal Subnet)',
          lastActive: new Date().toISOString(),
          isCurrent: true,
        },
        {
          id: `sess-${crypto.randomUUID().slice(0, 8)}`,
          device: 'Zebra TC57 Rugged Touch Computer (Android 13)',
          ipAddress: '10.240.12.192 (Industrial WiFi Zone 2)',
          lastActive: new Date(Date.now() - 3600000 * 2).toISOString(),
          isCurrent: false,
        },
      ];
      this.userSessions.set(userId, initialSessions);
    }
    return this.userSessions.get(userId) || [];
  }

  public async revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
    const sessions = await this.listUserSessions(userId);
    const filtered = sessions.filter((s) => s.id !== sessionId);
    if (filtered.length !== sessions.length) {
      this.userSessions.set(userId, filtered);
      return true;
    }
    return false;
  }

  public async revokeAllUserSessions(userId: string): Promise<number> {
    const sessions = await this.listUserSessions(userId);
    const count = sessions.length;
    this.userSessions.set(userId, []);
    return count;
  }

  public async getUserByVerificationToken(tokenHash: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.verificationTokenHash === tokenHash) {
        return user;
      }
    }
    return null;
  }

  public async setUserEmailVerified(userId: string, verified: boolean): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    user.emailVerified = verified;
    user.verificationTokenHash = undefined;
    user.verificationExpiresAt = undefined;
    user.updatedAt = new Date().toISOString();
    return user;
  }

  public async setUserVerificationToken(
    userId: string,
    tokenHash: string | null,
    expiresAt: string | null
  ): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    user.verificationTokenHash = tokenHash ?? undefined;
    user.verificationExpiresAt = expiresAt ?? undefined;
    user.updatedAt = new Date().toISOString();
    return user;
  }

  public async setUserPassword(userId: string, passwordHash: string): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.updatedAt = new Date().toISOString();
    return user;
  }

  public async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    this.passwordResetTokens.set(tokenHash, {
      userId,
      expiresAt,
      usedAt: null,
    });
  }

  public async getPasswordResetToken(
    tokenHash: string
  ): Promise<{ userId: string; expiresAt: string; usedAt: string | null } | null> {
    return this.passwordResetTokens.get(tokenHash) ?? null;
  }

  public async consumePasswordResetToken(tokenHash: string): Promise<boolean> {
    const tokenRecord = this.passwordResetTokens.get(tokenHash);
    if (!tokenRecord) return false;
    if (tokenRecord.usedAt !== null) return false;
    if (new Date(tokenRecord.expiresAt) < new Date()) return false;
    tokenRecord.usedAt = new Date().toISOString();
    return true;
  }

  // --------------------------------------------------------------------------
  // Email OTP & Google OAuth Identity Methods
  // --------------------------------------------------------------------------
  private emailOtps = new Map<string, EmailOtpRecord>();
  private googleOAuthStates = new Map<string, GoogleOAuthStateRecord>();

  public async createEmailOtp(dto: CreateEmailOtpDTO): Promise<EmailOtpRecord> {
    const record: EmailOtpRecord = {
      id: crypto.randomUUID(),
      email: dto.email.toLowerCase(),
      codeHash: dto.codeHash,
      purpose: dto.purpose,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: dto.expiresAt,
      usedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.emailOtps.set(record.id, record);
    return record;
  }

  public async getLatestEmailOtp(email: string, purpose: string): Promise<EmailOtpRecord | null> {
    const matching = Array.from(this.emailOtps.values())
      .filter((o) => o.email.toLowerCase() === email.toLowerCase() && o.purpose === purpose)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matching[0] ?? null;
  }

  public async incrementEmailOtpAttempts(otpId: string): Promise<number> {
    const record = this.emailOtps.get(otpId);
    if (!record) return 0;
    record.attempts += 1;
    return record.attempts;
  }

  public async consumeEmailOtp(otpId: string): Promise<boolean> {
    const record = this.emailOtps.get(otpId);
    if (!record) return false;
    if (record.usedAt) return false;
    if (new Date(record.expiresAt) < new Date()) return false;
    record.usedAt = new Date().toISOString();
    return true;
  }

  public async countRecentEmailOtps(email: string, sinceDate: string): Promise<number> {
    const sinceTime = new Date(sinceDate).getTime();
    return Array.from(this.emailOtps.values()).filter(
      (o) => o.email.toLowerCase() === email.toLowerCase() && new Date(o.createdAt).getTime() >= sinceTime
    ).length;
  }

  public async getUserByGoogleId(googleId: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.googleId === googleId) return u;
    }
    return null;
  }

  public async setUserGoogleId(userId: string, googleId: string, googleEmail?: string): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    user.googleId = googleId;
    if (googleEmail) user.googleEmail = googleEmail.toLowerCase();
    user.authProvider = 'google';
    user.updatedAt = new Date().toISOString();
    return user;
  }

  public async unlinkUserGoogleId(userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    delete (user as any).googleId;
    delete (user as any).googleEmail;
    user.authProvider = user.passwordHash ? 'local' : 'email_otp';
    user.updatedAt = new Date().toISOString();
    return user;
  }

  public async saveGoogleOAuthState(dto: SaveGoogleOAuthStateDTO): Promise<GoogleOAuthStateRecord> {
    const record: GoogleOAuthStateRecord = {
      state: dto.state,
      purpose: dto.purpose,
      redirectUri: dto.redirectUri,
      invitationToken: dto.invitationToken,
      expiresAt: dto.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.googleOAuthStates.set(record.state, record);
    return record;
  }

  public async getGoogleOAuthState(state: string): Promise<GoogleOAuthStateRecord | null> {
    return this.googleOAuthStates.get(state) ?? null;
  }

  public async consumeGoogleOAuthState(state: string): Promise<boolean> {
    const record = this.googleOAuthStates.get(state);
    if (!record) return false;
    if (new Date(record.expiresAt) < new Date()) return false;
    this.googleOAuthStates.delete(state);
    return true;
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
      assignedPlantIds: dto.assignedPlantIds ?? [],
      createdAt: now,
      updatedAt: now,
      user: this.users.get(dto.userId),
    };
    this.memberships.set(membership.id, membership);
    return membership;
  }

  public async getMembership(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    for (const m of this.memberships.values()) {
      if (m.userId === userId && m.organizationId === organizationId) {
        return {
          ...m,
          user: this.users.get(m.userId),
        };
      }
    }
    return null;
  }

  public async getMembershipById(organizationId: string, membershipId: string): Promise<OrganizationMembership | null> {
    const m = this.memberships.get(membershipId);
    if (!m || m.organizationId !== organizationId) return null;
    return {
      ...m,
      user: this.users.get(m.userId),
    };
  }

  public async listUserMemberships(userId: string): Promise<OrganizationMembership[]> {
    const results: OrganizationMembership[] = [];
    for (const m of this.memberships.values()) {
      if (m.userId === userId) {
        results.push({
          ...m,
          user: this.users.get(m.userId),
        });
      }
    }
    return results;
  }

  public async listOrganizationMembers(organizationId: string): Promise<OrganizationMembership[]> {
    const results: OrganizationMembership[] = [];
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId) {
        results.push({
          ...m,
          user: this.users.get(m.userId),
        });
      }
    }
    return results;
  }

  public async updateMembershipRole(
    organizationId: string,
    membershipId: string,
    role: OrgRole,
    assignedPlantIds?: string[]
  ): Promise<OrganizationMembership | null> {
    const m = this.memberships.get(membershipId);
    if (!m || m.organizationId !== organizationId) return null;

    m.role = role;
    if (assignedPlantIds !== undefined) {
      m.assignedPlantIds = assignedPlantIds;
    }
    m.updatedAt = new Date().toISOString();
    return {
      ...m,
      user: this.users.get(m.userId),
    };
  }

  public async updateMembershipStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipStatus
  ): Promise<OrganizationMembership | null> {
    const m = this.memberships.get(membershipId);
    if (!m || m.organizationId !== organizationId) return null;

    m.status = status;
    m.updatedAt = new Date().toISOString();
    return {
      ...m,
      user: this.users.get(m.userId),
    };
  }

  public async deleteMembership(organizationId: string, membershipId: string): Promise<boolean> {
    const m = this.memberships.get(membershipId);
    if (!m || m.organizationId !== organizationId) return false;
    return this.memberships.delete(membershipId);
  }

  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------
  public async createInvitation(dto: CreateInvitationDTO): Promise<OrganizationInvitation> {
    // Check if there is an active pending invite for this email in this org
    for (const inv of this.invitations.values()) {
      if (
        inv.organizationId === dto.organizationId &&
        inv.email.toLowerCase() === dto.email.toLowerCase() &&
        inv.status === 'PENDING'
      ) {
        if (new Date(inv.expiresAt) > new Date()) {
          throw new Error(`An active invitation already exists for ${dto.email} in this organization.`);
        } else {
          inv.status = 'EXPIRED';
        }
      }
    }

    const now = new Date().toISOString();
    const invitation: OrganizationInvitation = {
      id: crypto.randomUUID(),
      organizationId: dto.organizationId,
      email: dto.email.toLowerCase(),
      role: dto.role,
      invitedByUserId: dto.invitedByUserId,
      tokenHash: dto.tokenHash,
      expiresAt: dto.expiresAt,
      status: 'PENDING',
      assignedPlantIds: dto.assignedPlantIds ?? [],
      assignedMachineIds: dto.assignedMachineIds ?? [],
      qrTokenHash: dto.qrTokenHash,
      qrExpiresAt: dto.qrExpiresAt,
      activationCodeHash: dto.activationCodeHash,
      activationCodeAttempts: 0,
      employeeId: dto.employeeId,
      department: dto.department,
      designation: dto.designation,
      createdAt: now,
      updatedAt: now,
    };
    this.invitations.set(invitation.id, invitation);
    return invitation;
  }

  public async getInvitationById(organizationId: string, invitationId: string): Promise<OrganizationInvitation | null> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.organizationId !== organizationId) return null;

    if (inv.status === 'PENDING' && new Date(inv.expiresAt) < new Date()) {
      inv.status = 'EXPIRED';
      inv.updatedAt = new Date().toISOString();
    }
    return inv;
  }

  public async getInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null> {
    for (const inv of this.invitations.values()) {
      if (inv.tokenHash === tokenHash) {
        if (inv.status === 'PENDING' && new Date(inv.expiresAt) < new Date()) {
          inv.status = 'EXPIRED';
          inv.updatedAt = new Date().toISOString();
        }
        return inv;
      }
    }
    return null;
  }

  public async getInvitationByQrTokenHash(qrTokenHash: string): Promise<OrganizationInvitation | null> {
    for (const inv of this.invitations.values()) {
      if (inv.qrTokenHash === qrTokenHash) {
        if (inv.qrExpiresAt && new Date(inv.qrExpiresAt) < new Date() && inv.status === 'PENDING') {
          inv.status = 'EXPIRED';
          inv.updatedAt = new Date().toISOString();
        }
        return inv;
      }
    }
    return null;
  }

  public async getInvitationByActivationCodeHash(codeHash: string): Promise<OrganizationInvitation | null> {
    for (const inv of this.invitations.values()) {
      if (inv.activationCodeHash === codeHash) {
        if (inv.status === 'PENDING' && new Date(inv.expiresAt) < new Date()) {
          inv.status = 'EXPIRED';
          inv.updatedAt = new Date().toISOString();
        }
        return inv;
      }
    }
    return null;
  }

  public async incrementActivationCodeAttempts(invitationId: string): Promise<number> {
    const inv = this.invitations.get(invitationId);
    if (!inv) return 0;
    inv.activationCodeAttempts = (inv.activationCodeAttempts || 0) + 1;
    inv.updatedAt = new Date().toISOString();
    return inv.activationCodeAttempts;
  }

  public async updateInvitationQrToken(
    invitationId: string,
    qrTokenHash: string,
    qrExpiresAt: string
  ): Promise<OrganizationInvitation | null> {
    const inv = this.invitations.get(invitationId);
    if (!inv) return null;
    inv.qrTokenHash = qrTokenHash;
    inv.qrExpiresAt = qrExpiresAt;
    inv.updatedAt = new Date().toISOString();
    return inv;
  }

  public async listInvitations(organizationId: string, status?: InvitationStatus): Promise<OrganizationInvitation[]> {
    const now = new Date();
    const results: OrganizationInvitation[] = [];
    for (const inv of this.invitations.values()) {
      if (inv.organizationId === organizationId) {
        if (inv.status === 'PENDING' && new Date(inv.expiresAt) < now) {
          inv.status = 'EXPIRED';
          inv.updatedAt = now.toISOString();
        }
        if (!status || inv.status === status) {
          results.push(inv);
        }
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateInvitationStatus(
    invitationId: string,
    status: InvitationStatus
  ): Promise<OrganizationInvitation | null> {
    const inv = this.invitations.get(invitationId);
    if (!inv) return null;

    inv.status = status;
    inv.updatedAt = new Date().toISOString();
    return inv;
  }

  public async deleteInvitation(organizationId: string, invitationId: string): Promise<boolean> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.organizationId !== organizationId) return false;
    return this.invitations.delete(invitationId);
  }

  // --------------------------------------------------------------------------
  // Organization Registration & Onboarding
  // --------------------------------------------------------------------------
  public async registerOrganizationWithAdmin(
    dto: RegisterOrganizationDTO
  ): Promise<{ organization: Organization; adminUser: User; membership: OrganizationMembership }> {
    // 1. Check duplicate slug
    const existingOrg = await this.getOrganizationBySlug(dto.organizationSlug);
    if (existingOrg) {
      throw new Error(`Organization slug '${dto.organizationSlug}' is already claimed.`);
    }

    // 2. Create organization with industry and deployment metadata
    const org = await this.createOrganization({
      name: dto.organizationName,
      slug: dto.organizationSlug,
    });
    org.industry = dto.industry;
    org.country = dto.country;
    org.timezone = dto.timezone;
    org.website = dto.website;
    org.companySize = dto.companySize;
    org.deploymentType = dto.deploymentType ?? 'saas';

    // 3. Find or create administrator user
    let user = await this.getUserByExternalAuthId(dto.externalAuthId);
    if (!user) {
      // Check if email already exists
      for (const u of this.users.values()) {
        if (u.email.toLowerCase() === dto.adminEmail.toLowerCase()) {
          user = u;
          break;
        }
      }
      if (!user) {
        user = await this.createUser({
          externalAuthId: dto.externalAuthId,
          email: dto.adminEmail,
          fullName: dto.adminFullName,
        });
      }
    }

    // Set passwords and verification state if supplied
    if (dto.passwordHash) {
      user.passwordHash = dto.passwordHash;
    }
    if (dto.verificationTokenHash) {
      user.verificationTokenHash = dto.verificationTokenHash;
      user.verificationExpiresAt = dto.verificationExpiresAt;
      user.emailVerified = false;
    } else {
      user.emailVerified = true;
    }
    user.status = 'ACTIVE';

    // 4. Create initial membership as ORGANIZATION_OWNER
    const membership = await this.createMembership({
      organizationId: org.id,
      userId: user.id,
      role: 'ORGANIZATION_OWNER',
      status: 'ACTIVE',
    });

    // 5. Optionally create initial site/plant if specified
    if (dto.initialSiteName) {
      try {
        await this.createPlant(org.id, {
          code: `SITE-${org.slug.toUpperCase().slice(0, 8)}`,
          name: dto.initialSiteName,
          location: dto.country || 'Primary Manufacturing Facility',
        });
      } catch {}
    }

    return {
      organization: org,
      adminUser: user,
      membership,
    };
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
    let plant = this.plants.get(plantId) ?? null;
    if (!plant) {
      for (const p of this.plants.values()) {
        if (p.organizationId === organizationId && p.code === plantId) {
          plant = p;
          break;
        }
      }
    }
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
      plantId: plant.id, // Ensure normalized plant UUID
      parentAssetId: dto.parentAssetId ?? null,
      assetTag: dto.assetTag,
      name: dto.name,
      area: dto.area,
      manufacturer: dto.manufacturer ?? null,
      modelNumber: dto.modelNumber ?? null,
      serialNumber: dto.serialNumber ?? null,
      operationalState: dto.operationalState ?? 'OPTIMAL',
      createdAt: now,
      updatedAt: now,
    };
    this.assets.set(asset.id, asset);

    const machine: Machine = {
      ...asset,
      machineType: 'Industrial Machinery',
      criticality: 'MEDIUM',
      dataClassification: 'INTERNAL',
      authorizedAccessScope: 'ORGANIZATION',
      verificationState: asset.serialNumber ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED',
      documentationReadiness: 'INCOMPLETE',
      technicalSpecs: {},
      hasModel3d: false,
      hasPidDiagram: false,
      qrCodeData: `/machines/${asset.id}`,
      revision: 1,
    };
    this.machines.set(machine.id, machine);

    return asset;
  }

  public async getAssetById(organizationId: string, assetId: string): Promise<Asset | null> {
    const cleanId = sanitizeMachineOrAssetId(assetId);
    let asset = this.assets.get(assetId) ?? this.assets.get(cleanId) ?? null;
    if (!asset) {
      for (const a of this.assets.values()) {
        if (
          a.organizationId === organizationId &&
          (a.id === assetId || a.id === cleanId || a.assetTag === assetId || a.assetTag === cleanId)
        ) {
          asset = a;
          break;
        }
      }
    }
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
      assetIds: dto.assetIds ?? [],
      machineId: dto.machineId ?? (dto.assetIds && dto.assetIds.length > 0 ? dto.assetIds[0] : undefined),
      dataClassification: dto.dataClassification || 'INTERNAL',
      isConfidential: dto.isConfidential ?? (dto.dataClassification === 'RESTRICTED_CONFIDENTIAL' || dto.dataClassification === 'RESTRICTED'),
      createdByUserId: dto.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(doc.id, doc);
    return doc;
  }

  public async getDocumentById(organizationId: string, documentId: string): Promise<TechnicalDocument | null> {
    let doc = this.documents.get(documentId);
    if (!doc) {
      for (const d of this.documents.values()) {
        if (
          d.organizationId === organizationId &&
          (d.id === documentId || d.documentNumber.toLowerCase() === documentId.toLowerCase())
        ) {
          doc = d;
          break;
        }
      }
    }
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
    let doc = this.documents.get(documentId);
    if (!doc) {
      for (const d of this.documents.values()) {
        if (
          d.organizationId === organizationId &&
          (d.id === documentId || d.documentNumber.toLowerCase() === documentId.toLowerCase())
        ) {
          doc = d;
          break;
        }
      }
    }
    if (!doc || doc.organizationId !== organizationId) return false;

    const actualId = doc.id;
    // Cascade delete versions, pages, chunks, and jobs
    for (const version of this.documentVersions.values()) {
      if (version.documentId === actualId) {
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

    this.documents.delete(actualId);
    return true;
  }

  public async linkDocumentToAsset(
    organizationId: string,
    documentId: string,
    assetId: string,
    assetTag?: string
  ): Promise<void> {
    let doc = this.documents.get(documentId);
    if (!doc) {
      for (const d of this.documents.values()) {
        if (
          d.organizationId === organizationId &&
          (d.id === documentId || d.documentNumber.toLowerCase() === documentId.toLowerCase())
        ) {
          doc = d;
          break;
        }
      }
    }
    if (!doc || doc.organizationId !== organizationId) return;

    if (!doc.assetIds) doc.assetIds = [];
    if (!doc.assetIds.includes(assetId)) doc.assetIds.push(assetId);
    if (!doc.machineId) doc.machineId = assetId;

    if (assetTag && assetTag.trim()) {
      if (!doc.assetTags) doc.assetTags = [];
      if (!doc.assetTags.includes(assetTag.trim())) doc.assetTags.push(assetTag.trim());
    }
  }

  public async getLinkedMachineIdsForDocument(
    organizationId: string,
    documentId: string
  ): Promise<string[]> {
    const doc = this.documents.get(documentId);
    if (!doc || doc.organizationId !== organizationId) return [];
    const ids = new Set<string>();
    if (doc.machineId) ids.add(doc.machineId);
    if (doc.assetIds && Array.isArray(doc.assetIds)) {
      doc.assetIds.forEach((id) => ids.add(id));
    }
    return Array.from(ids);
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
      assetIds: (doc as any).assetIds ?? [],
      machineId: (doc as any).machineId,
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
      machineId: dto.machineId ?? null,
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
      processingStatus: dto.processingStatus ?? 'UPLOADED',
      uploadedByUserId: dto.uploadedByUserId ?? null,
      dataClassification: dto.dataClassification ?? 'INTERNAL',
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

  public async updateVisualAsset(
    organizationId: string,
    id: string,
    updates: Partial<VisualAsset>
  ): Promise<VisualAsset | null> {
    const asset = this.visualAssets.get(id);
    if (!asset || asset.organizationId !== organizationId) return null;
    const updated: VisualAsset = {
      ...asset,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.visualAssets.set(id, updated);
    return updated;
  }

  public async listVisualAssets(
    organizationId: string,
    filter?: VisualAssetFilterOptions
  ): Promise<VisualAsset[]> {
    const results: VisualAsset[] = [];
    for (const a of this.visualAssets.values()) {
      if (a.organizationId !== organizationId) continue;
      if (filter?.plantId && a.plantId !== filter.plantId) continue;
      if (filter?.machineId && a.machineId !== filter.machineId) continue;
      if (filter?.documentId && a.documentId !== filter.documentId) continue;
      if (filter?.documentVersionId && a.documentVersionId !== filter.documentVersionId) continue;
      if (filter?.assetType && a.assetType !== filter.assetType) continue;
      if (filter?.processingStatus && a.processingStatus !== filter.processingStatus) continue;
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
      description: dto.description,
      severity: dto.severity || 'MEDIUM',
      status: dto.status || 'REPORTED',
      reportedByUserId: dto.reportedByUserId,
      assignedTechnicianUserId: dto.assignedTechnicianUserId || null,
      assignedTechnicianName: dto.assignedTechnicianName || null,
      symptomDescription: dto.symptomDescription,
      operatingConditions: dto.operatingConditions || {},
      visualAssetIds: dto.visualAssetIds || [],
      supportingDocumentIds: dto.supportingDocumentIds || [],
      sourceTicketId: dto.sourceTicketId || (dto.operatingConditions?.sourceTicketId as string) || null,
      partsUsed: dto.partsUsed || dto.findings?.partsUsed || null,
      diagnosticHypothesis: dto.diagnosticHypothesis || null,
      checklist: dto.checklist || [],
      findings: dto.findings || null,
      approval: dto.approval || null,
      isEscalated: dto.isEscalated ?? false,
      escalationReason: dto.escalationReason || null,
      candidateForExpertKnowledge: dto.candidateForExpertKnowledge ?? false,
      createdAt: now,
      updatedAt: now,
      resolvedAt: dto.resolvedAt || null,
      closedAt: dto.closedAt || null,
      maintenanceRecordId: dto.maintenanceRecordId || null,
      createdAtFormatted: dto.createdAtFormatted,
      plantName: dto.plantName,
      reportedByName: dto.reportedByName,
      reportedByRole: dto.reportedByRole,
      assetTag: dto.assetTag,
      assetName: dto.assetName,
      machineStatus: dto.machineStatus,
      faultCode: dto.faultCode,
      topRootCause: dto.topRootCause,
      probability: dto.probability,
      recommendedFix: dto.recommendedFix,
      investigationProgress: dto.investigationProgress,
      specialistDiscipline: dto.specialistDiscipline,
      priority: dto.priority,
      lotoApplied: dto.lotoApplied,
      technicianNotes: dto.technicianNotes,
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
        filter?.assignedTechnicianUserId &&
        c.assignedTechnicianUserId !== filter.assignedTechnicianUserId
      )
        continue;
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
    if (c && c.organizationId === organizationId) {
      this.maintenanceCases.delete(id);
      return true;
    }
    // Also lookup by caseNumber
    for (const [key, item] of this.maintenanceCases.entries()) {
      if (item.organizationId === organizationId && (item.id === id || item.caseNumber === id)) {
        this.maintenanceCases.delete(key);
        return true;
      }
    }
    return false;
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

  // --------------------------------------------------------------------------
  // Machine Registry (Phase B)
  // --------------------------------------------------------------------------
  public async createMachine(organizationId: string, dto: CreateMachineDTO): Promise<Machine> {
    let plant = await this.getPlantById(organizationId, dto.plantId);
    if (!plant) {
      const plants = await this.listPlants(organizationId);
      if (plants.length > 0) {
        plant = plants[0];
      } else {
        plant = await this.createPlant(organizationId, {
          code: `PLANT-${organizationId.slice(0, 4).toUpperCase()}`,
          name: 'Primary Operations Facility',
          location: 'Industrial Complex',
          airGappedMode: false,
        });
      }
    }

    const cleanTag = dto.assetTag.trim().toUpperCase();
    const cleanName = dto.name.trim();
    const cleanSerial = typeof dto.serialNumber === 'string' && dto.serialNumber.trim() ? dto.serialNumber.trim() : null;
    const cleanMfg = typeof dto.manufacturer === 'string' && dto.manufacturer.trim() ? dto.manufacturer.trim() : null;
    const cleanModel = typeof dto.modelNumber === 'string' && dto.modelNumber.trim() ? dto.modelNumber.trim() : null;

    for (const m of this.machines.values()) {
      if (m.organizationId === organizationId && m.assetTag.toLowerCase() === cleanTag.toLowerCase()) {
        throw new Error(`Machine with asset tag '${cleanTag}' already exists in this organization.`);
      }
    }

    if (cleanSerial) {
      const targetSerial = cleanSerial.toLowerCase();
      for (const m of this.machines.values()) {
        if (m.organizationId === organizationId && m.serialNumber && m.serialNumber.trim().toLowerCase() === targetSerial) {
          throw new Error(`Machine with serial number '${cleanSerial}' already exists in this organization.`);
        }
      }
    }

    if (dto.parentAssetId) {
      const parent = await this.getAssetById(organizationId, dto.parentAssetId);
      if (!parent) {
        throw new Error(`Parent asset '${dto.parentAssetId}' does not belong to organization.`);
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const machine: Machine = {
      id,
      organizationId,
      plantId: plant.id,
      parentAssetId: dto.parentAssetId ?? null,
      assetTag: cleanTag,
      name: cleanName,
      machineType: dto.machineType ?? 'Industrial Machinery',
      area: dto.area,
      building: dto.building ?? null,
      productionLine: dto.productionLine ?? null,
      locationDescription: dto.locationDescription ?? null,
      manufacturer: cleanMfg,
      modelNumber: cleanModel,
      serialNumber: cleanSerial,
      installationDate: dto.installationDate ?? null,
      operationalState: dto.operationalState ?? 'OPTIMAL',
      criticality: dto.criticality ?? 'MEDIUM',
      department: dto.department ?? null,
      dataClassification: dto.dataClassification ?? 'INTERNAL',
      authorizedAccessScope: dto.authorizedAccessScope ?? 'ORGANIZATION',
      verificationState: dto.verificationState ?? (cleanSerial ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED'),
      documentationReadiness: dto.documentationReadiness ?? 'INCOMPLETE',
      technicalSpecs: dto.technicalSpecs ?? {},
      hasModel3d: dto.hasModel3d ?? false,
      model3dStorageKey: dto.model3dStorageKey ?? null,
      model3dFormat: dto.model3dFormat ?? null,
      hasPidDiagram: dto.hasPidDiagram ?? false,
      pidStorageKey: dto.pidStorageKey ?? null,
      qrCodeData: dto.qrCodeData ?? `/machines/${id}`,
      provenance: dto.provenance ?? null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.machines.set(machine.id, machine);

    // Mirror to assets
    const asset: Asset = {
      id: machine.id,
      organizationId: machine.organizationId,
      plantId: machine.plantId,
      parentAssetId: machine.parentAssetId,
      assetTag: machine.assetTag,
      name: machine.name,
      area: machine.area,
      manufacturer: machine.manufacturer ?? '',
      modelNumber: machine.modelNumber ?? '',
      serialNumber: machine.serialNumber ?? '',
      operationalState: machine.operationalState,
      createdAt: machine.createdAt,
      updatedAt: machine.updatedAt,
    };
    this.assets.set(asset.id, asset);

    // Initialize machine verification workflow record
    const counts = this.getMachineAssetCounts(organizationId, machine);
    const { checks, overallState, status } = computeMachineVerification(machine, undefined, counts);
    const verificationRecord: MachineVerificationRecord = {
      id: crypto.randomUUID(),
      organizationId,
      machineId: machine.id,
      machineAssetTag: machine.assetTag,
      status: dto.verificationState === 'VERIFIED' ? 'VERIFIED' : status,
      overallState: dto.verificationState === 'VERIFIED' ? 'VERIFIED' : overallState,
      checks,
      assignedUserId: null,
      assignedRole: null,
      history: [
        {
          action: 'REGISTERED',
          actorUserId: 'system',
          actorRole: 'SYSTEM',
          timestamp: now,
          notes: 'Machine registered in authoritative ledger. Initial verification checks evaluated.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.machineVerifications.set(machine.id, verificationRecord);

    return machine;
  }

  public async getMachineById(organizationId: string, machineId: string): Promise<Machine | null> {
    const cleanId = sanitizeMachineOrAssetId(machineId);
    let machine = this.machines.get(machineId) ?? this.machines.get(cleanId) ?? null;
    if (!machine) {
      for (const m of this.machines.values()) {
        if (
          m.organizationId === organizationId &&
          (m.id === machineId || m.id === cleanId || m.assetTag === machineId || m.assetTag === cleanId)
        ) {
          machine = m;
          break;
        }
      }
    }
    if (!machine || machine.organizationId !== organizationId) return null;
    return machine;
  }

  public async getMachineByAssetTag(organizationId: string, assetTag: string): Promise<Machine | null> {
    for (const m of this.machines.values()) {
      if (m.organizationId === organizationId && m.assetTag.toLowerCase() === assetTag.toLowerCase()) {
        return m;
      }
    }
    return null;
  }

  public async listMachines(organizationId: string, filters?: MachineFilterOptions): Promise<Machine[]> {
    let list = Array.from(this.machines.values()).filter((m) => m.organizationId === organizationId);
    if (filters?.plantId) {
      list = list.filter((m) => m.plantId === filters.plantId);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.assetTag.toLowerCase().includes(q) ||
          (m.manufacturer && m.manufacturer.toLowerCase().includes(q)) ||
          (m.modelNumber && m.modelNumber.toLowerCase().includes(q))
      );
    }
    if (filters?.documentationReadiness) {
      list = list.filter((m) => m.documentationReadiness === filters.documentationReadiness);
    }
    if (filters?.operationalState) {
      list = list.filter((m) => m.operationalState === filters.operationalState);
    }
    if (filters?.dataClassification) {
      list = list.filter((m) => m.dataClassification === filters.dataClassification);
    }
    if (typeof filters?.hasModel3d === 'boolean') {
      list = list.filter((m) => m.hasModel3d === filters.hasModel3d);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateMachine(
    organizationId: string,
    machineId: string,
    updates: Partial<Machine>
  ): Promise<Machine | null> {
    const m = await this.getMachineById(organizationId, machineId);
    if (!m) return null;

    if (updates.serialNumber !== undefined) {
      const cleanSerial = typeof updates.serialNumber === 'string' && updates.serialNumber.trim() ? updates.serialNumber.trim() : null;
      if (cleanSerial) {
        const target = cleanSerial.toLowerCase();
        for (const existing of this.machines.values()) {
          if (existing.organizationId === organizationId && existing.id !== m.id && existing.serialNumber && existing.serialNumber.trim().toLowerCase() === target) {
            throw new Error(`Machine with serial number '${cleanSerial}' already exists in this organization.`);
          }
        }
      }
      updates.serialNumber = cleanSerial;
    }

    if (updates.manufacturer !== undefined) {
      updates.manufacturer = typeof updates.manufacturer === 'string' && updates.manufacturer.trim() ? updates.manufacturer.trim() : null;
    }

    if (updates.modelNumber !== undefined) {
      updates.modelNumber = typeof updates.modelNumber === 'string' && updates.modelNumber.trim() ? updates.modelNumber.trim() : null;
    }

    Object.assign(m, updates, {
      revision: (m.revision || 1) + 1,
      updatedAt: new Date().toISOString(),
    });

    // Mirror to asset
    const a = this.assets.get(m.id);
    if (a) {
      if (updates.name) a.name = updates.name;
      if (updates.area) a.area = updates.area;
      if (updates.manufacturer !== undefined) a.manufacturer = updates.manufacturer || null as any;
      if (updates.modelNumber !== undefined) a.modelNumber = updates.modelNumber || null as any;
      if (updates.serialNumber !== undefined) a.serialNumber = updates.serialNumber || null as any;
      if (updates.operationalState) a.operationalState = updates.operationalState;
      a.updatedAt = m.updatedAt;
    }

    return m;
  }

  public async deleteMachine(organizationId: string, machineId: string): Promise<boolean> {
    const m = await this.getMachineById(organizationId, machineId);
    if (!m) return false;
    this.machines.delete(m.id);
    this.assets.delete(m.id);
    return true;
  }

  public async detectPotentialDuplicates(
    organizationId: string,
    params: { manufacturer?: string; modelNumber?: string; serialNumber?: string }
  ): Promise<Machine[]> {
    const matches: Machine[] = [];
    const targetMfr = params.manufacturer?.trim().toLowerCase();
    const targetModel = params.modelNumber?.trim().toLowerCase();
    const targetSerial = params.serialNumber?.trim().toLowerCase();

    for (const m of this.machines.values()) {
      if (m.organizationId !== organizationId) continue;
      const mfr = m.manufacturer?.trim().toLowerCase();
      const model = m.modelNumber?.trim().toLowerCase();
      const serial = m.serialNumber?.trim().toLowerCase();

      // Check serial match (high confidence)
      if (targetSerial && serial && targetSerial === serial) {
        matches.push(m);
        continue;
      }
      // Check manufacturer + model match
      if (targetMfr && targetModel && mfr && model && targetMfr === mfr && targetModel === model) {
        matches.push(m);
      }
    }
    return matches;
  }

  public async getMachineLedgerSummary(organizationId: string, plantId?: string): Promise<MachineLedgerSummary> {
    const all = Array.from(this.machines.values()).filter((m) => {
      if (m.organizationId !== organizationId) return false;
      if (plantId && m.plantId !== plantId) return false;
      return true;
    });

    const pendingTasks = Array.from(this.missingInfoTasks.values()).filter((t) => {
      if (t.organizationId !== organizationId) return false;
      if (t.status !== 'SUBMITTED') return false;
      if (plantId) {
        const m = this.machines.get(t.machineId);
        if (!m || m.plantId !== plantId) return false;
      }
      return true;
    });

    const pendingVerifications = Array.from(this.machineVerifications.values()).filter((v) => {
      if (v.organizationId !== organizationId) return false;
      if (v.status !== 'READY_FOR_APPROVAL') return false;
      if (plantId) {
        const m = this.machines.get(v.machineId);
        if (!m || m.plantId !== plantId) return false;
      }
      return true;
    });

    return {
      totalMachines: all.length,
      incompleteDocumentationCount: all.filter((m) => m.documentationReadiness !== 'READY').length,
      pendingReviewTasksCount: pendingTasks.length + pendingVerifications.length,
      with3dModelCount: all.filter((m) => m.hasModel3d).length,
      criticalMachinesCount: all.filter((m) => m.criticality === 'MISSION_CRITICAL' || m.criticality === 'HIGH').length,
      verifiedSpecsCount: all.filter((m) => m.verificationState === 'VERIFIED').length,
    };
  }

  private getMachineAssetCounts(organizationId: string, machine: Machine): {
    documentCount: number;
    models3dCount: number;
    drawingsCount: number;
  } {
    const assetId = machine.id;
    const assetTag = machine.assetTag?.toLowerCase();
    const mfg = machine.manufacturer?.toLowerCase();
    const mdl = machine.modelNumber?.toLowerCase();

    // 1. Documents & Manuals Count
    let documentCount = 0;
    const countedDocIds = new Set<string>();

    for (const doc of this.documents.values()) {
      if (doc.organizationId !== organizationId) continue;
      const tags = (doc.assetTags || []).map((t: string) => t.toLowerCase());
      const docAssetIds = (doc as any).assetIds || [];
      const meta = (doc.metadata || {}) as any;
      const matchesAsset =
        (assetTag && tags.includes(assetTag)) ||
        (doc as any).machineId === assetId ||
        docAssetIds.includes(assetId) ||
        meta.machineId === assetId ||
        meta.assetId === assetId;

      if (matchesAsset) {
        countedDocIds.add(doc.id);
        documentCount++;
      }
    }

    // Manufacturer Resources (Manuals, Specs, SOPs)
    for (const res of this.manufacturerResources.values()) {
      if (res.organizationId !== organizationId) continue;
      const matchesMachine =
        res.machineId === assetId ||
        (mfg && mdl && res.manufacturer?.toLowerCase() === mfg && res.modelNumber?.toLowerCase() === mdl);

      if (matchesMachine && !countedDocIds.has(res.id)) {
        countedDocIds.add(res.id);
        documentCount++;
      }
    }

    // Machine Evidence Claims with source document
    for (const claim of this.evidenceClaims.values()) {
      if (claim.organizationId !== organizationId || claim.machineId !== assetId) continue;
      if (claim.sourceDocumentId && !countedDocIds.has(claim.sourceDocumentId)) {
        countedDocIds.add(claim.sourceDocumentId);
        documentCount++;
      } else if (claim.sourceAttachmentKey && !countedDocIds.has(claim.sourceAttachmentKey)) {
        countedDocIds.add(claim.sourceAttachmentKey);
        documentCount++;
      }
    }

    // Direct manual on machine technicalSpecs
    if (machine.technicalSpecs?.manualStorageKey || machine.technicalSpecs?.manualFileName || machine.technicalSpecs?.manualUrl) {
      documentCount++;
    }

    // 2. 3D Models Count
    let models3dCount = 0;
    for (const m of this.engineeringModels.values()) {
      if (m.organizationId !== organizationId) continue;
      if (m.machineId === assetId || (m as any).assetId === assetId) {
        models3dCount++;
      }
    }
    if (machine.model3dStorageKey || machine.model3dUrl || machine.model3dFile) {
      models3dCount++;
    }

    // 3. Drawings / P&ID Count
    let drawingsCount = 0;
    for (const d of this.engineeringDrawings.values()) {
      if (d.organizationId !== organizationId) continue;
      if (d.machineId === assetId) {
        drawingsCount++;
      }
    }
    if (machine.pidStorageKey || machine.pidUrl || machine.pAndIdUrl || machine.pidFile || machine.pAndIdFile) {
      drawingsCount++;
    }

    return { documentCount, models3dCount, drawingsCount };
  }

  public async getMachineVerification(organizationId: string, machineId: string): Promise<MachineVerificationRecord> {
    const machine = await this.getMachineById(organizationId, machineId);
    if (!machine) {
      throw new Error(`Machine '${machineId}' not found in this organization.`);
    }

    let record = this.machineVerifications.get(machine.id);
    const now = new Date().toISOString();
    const counts = this.getMachineAssetCounts(organizationId, machine);

    if (!record) {
      const { checks, overallState, status } = computeMachineVerification(machine, undefined, counts);
      record = {
        id: crypto.randomUUID(),
        organizationId,
        machineId: machine.id,
        machineAssetTag: machine.assetTag,
        status: machine.verificationState === 'VERIFIED' ? 'VERIFIED' : status,
        overallState: machine.verificationState === 'VERIFIED' ? 'VERIFIED' : overallState,
        checks,
        history: [
          {
            action: 'REGISTERED',
            actorUserId: 'system',
            actorRole: 'SYSTEM',
            timestamp: now,
            notes: 'Verification profile initialized.',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      this.machineVerifications.set(machine.id, record);
    } else {
      // Re-evaluate checks dynamically against current machine state and real database asset counts
      const { checks, overallState, status } = computeMachineVerification(machine, record, counts);
      record.checks = checks;
      record.overallState = machine.verificationState === 'VERIFIED' ? 'VERIFIED' : overallState;
      record.status = machine.verificationState === 'VERIFIED' ? 'VERIFIED' : status;
      record.machineAssetTag = machine.assetTag;
    }

    return record;
  }

  public async updateMachineVerification(
    organizationId: string,
    machineId: string,
    updates: Partial<MachineVerificationRecord>
  ): Promise<MachineVerificationRecord> {
    const record = await this.getMachineVerification(organizationId, machineId);
    Object.assign(record, updates, { updatedAt: new Date().toISOString() });
    return record;
  }

  // --------------------------------------------------------------------------
  // Missing Information & Technician Tasks (Phase B)
  // --------------------------------------------------------------------------
  public async createMissingInfoTask(
    organizationId: string,
    dto: CreateMissingInfoTaskDTO
  ): Promise<MissingInformationTask> {
    const machine = await this.getMachineById(organizationId, dto.machineId);
    if (!machine) {
      throw new Error(`Machine '${dto.machineId}' not found in this organization.`);
    }

    const now = new Date().toISOString();
    const task: MissingInformationTask = {
      id: crypto.randomUUID(),
      organizationId,
      machineId: machine.id,
      machineAssetTag: machine.assetTag,
      machineName: machine.name,
      assignedUserId: dto.assignedUserId ?? null,
      assignedRole: dto.assignedRole ?? null,
      requestedFields: dto.requestedFields,
      instructions: dto.instructions,
      dueDate: dto.dueDate ?? null,
      status: 'NOT_STARTED',
      submittedValues: null,
      submittedByUserId: null,
      submittedAt: null,
      evidenceDescription: null,
      evidenceAttachmentKeys: [],
      reviewFeedback: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.missingInfoTasks.set(task.id, task);
    return task;
  }

  public async getMissingInfoTaskById(
    organizationId: string,
    taskId: string
  ): Promise<MissingInformationTask | null> {
    const t = this.missingInfoTasks.get(taskId);
    if (!t || t.organizationId !== organizationId) return null;
    return t;
  }

  public async listMissingInfoTasks(
    organizationId: string,
    filters?: MissingInfoTaskFilterOptions
  ): Promise<MissingInformationTask[]> {
    let list = Array.from(this.missingInfoTasks.values()).filter((t) => t.organizationId === organizationId);
    if (filters?.machineId) {
      list = list.filter((t) => t.machineId === filters.machineId);
    }
    if (filters?.assignedUserId) {
      list = list.filter((t) => t.assignedUserId === filters.assignedUserId);
    }
    if (filters?.status) {
      list = list.filter((t) => t.status === filters.status);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateMissingInfoTask(
    organizationId: string,
    taskId: string,
    updates: Partial<MissingInformationTask>
  ): Promise<MissingInformationTask | null> {
    const t = await this.getMissingInfoTaskById(organizationId, taskId);
    if (!t) return null;

    Object.assign(t, updates, { updatedAt: new Date().toISOString() });

    // When reviewer approves the task, promote submitted values to machine's technicalSpecs
    if (updates.status === 'APPROVED' && t.submittedValues) {
      const machine = this.machines.get(t.machineId);
      if (machine) {
        machine.technicalSpecs = {
          ...machine.technicalSpecs,
          ...t.submittedValues,
        };
        if (t.submittedValues.serialNumber && typeof t.submittedValues.serialNumber === 'string') {
          machine.serialNumber = t.submittedValues.serialNumber;
        }
        if (t.submittedValues.manufacturer && typeof t.submittedValues.manufacturer === 'string') {
          machine.manufacturer = t.submittedValues.manufacturer;
        }
        // Recompute machine verification based on updated specs
        const verif = await this.getMachineVerification(organizationId, machine.id);
        if (verif) {
          machine.verificationState = verif.overallState;
        }
        machine.revision = (machine.revision || 1) + 1;
        machine.updatedAt = new Date().toISOString();
      }
    }

    return t;
  }

  // --------------------------------------------------------------------------
  // Component Mappings (Phase B)
  // --------------------------------------------------------------------------
  public async createComponentMapping(
    organizationId: string,
    dto: CreateComponentMappingDTO
  ): Promise<ComponentMapping> {
    const machine = await this.getMachineById(organizationId, dto.machineId);
    if (!machine) throw new Error(`Machine '${dto.machineId}' not found.`);

    const now = new Date().toISOString();
    const mapping: ComponentMapping = {
      id: crypto.randomUUID(),
      organizationId,
      machineId: machine.id,
      componentId: dto.componentId,
      componentName: dto.componentName,
      pidTag: dto.pidTag,
      pidDrawingNumber: dto.pidDrawingNumber ?? null,
      pidCoordinates: dto.pidCoordinates ?? null,
      manualDocumentId: dto.manualDocumentId ?? null,
      manualPageNumber: dto.manualPageNumber ?? null,
      status: dto.status ?? 'SUGGESTED',
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.componentMappings.set(mapping.id, mapping);
    return mapping;
  }

  public async listComponentMappings(organizationId: string, machineId: string): Promise<ComponentMapping[]> {
    return Array.from(this.componentMappings.values())
      .filter((m) => m.organizationId === organizationId && m.machineId === machineId)
      .sort((a, b) => a.componentName.localeCompare(b.componentName));
  }

  public async updateComponentMapping(
    organizationId: string,
    mappingId: string,
    updates: Partial<ComponentMapping>
  ): Promise<ComponentMapping | null> {
    const m = this.componentMappings.get(mappingId);
    if (!m || m.organizationId !== organizationId) return null;
    Object.assign(m, updates, { updatedAt: new Date().toISOString() });
    return m;
  }

  public async deleteComponentMapping(organizationId: string, mappingId: string): Promise<boolean> {
    const m = this.componentMappings.get(mappingId);
    if (!m || m.organizationId !== organizationId) return false;
    return this.componentMappings.delete(mappingId);
  }

  // --------------------------------------------------------------------------
  // Employee Badges (Phase B)
  // --------------------------------------------------------------------------
  public async issueEmployeeBadge(organizationId: string, data: IssueEmployeeBadgeDTO): Promise<EmployeeBadge> {
    for (const b of this.employeeBadges.values()) {
      if (b.organizationId === organizationId && b.badgeCode === data.badgeCode && b.status === 'ACTIVE') {
        throw new Error(`Badge code '${data.badgeCode}' is already actively assigned.`);
      }
    }

    const now = new Date().toISOString();
    const badge: EmployeeBadge = {
      id: crypto.randomUUID(),
      organizationId,
      userId: data.userId,
      badgeCode: data.badgeCode,
      status: 'ACTIVE',
      pinHash: data.pinHash,
      issuedAt: now,
      expiresAt: data.expiresAt ?? null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.employeeBadges.set(badge.id, badge);
    return badge;
  }

  public async getEmployeeBadgeByCode(badgeCode: string): Promise<EmployeeBadge | null> {
    for (const b of this.employeeBadges.values()) {
      if (b.badgeCode === badgeCode) {
        return b;
      }
    }
    return null;
  }

  public async getEmployeeBadgeByUserId(organizationId: string, userId: string): Promise<EmployeeBadge | null> {
    for (const b of this.employeeBadges.values()) {
      if (b.organizationId === organizationId && b.userId === userId && b.status === 'ACTIVE') {
        return b;
      }
    }
    return null;
  }

  public async updateEmployeeBadgeStatus(
    organizationId: string,
    badgeId: string,
    status: BadgeStatus
  ): Promise<EmployeeBadge | null> {
    const b = this.employeeBadges.get(badgeId);
    if (!b || b.organizationId !== organizationId) return null;
    b.status = status;
    if (status === 'REVOKED') {
      b.revokedAt = new Date().toISOString();
    }
    b.updatedAt = new Date().toISOString();
    return b;
  }

  // --------------------------------------------------------------------------
  // Public Machine Knowledge (Phase B)
  // --------------------------------------------------------------------------
  public async getPublicMachineKnowledge(
    manufacturer: string,
    modelNumber: string
  ): Promise<PublicMachineKnowledge | null> {
    const key = `${manufacturer.trim().toLowerCase()}::${modelNumber.trim().toLowerCase()}`;
    for (const k of this.publicKnowledge.values()) {
      const entryKey = `${k.manufacturer.trim().toLowerCase()}::${k.modelNumber.trim().toLowerCase()}`;
      if (entryKey === key) return k;
    }
    return null;
  }

  public async savePublicMachineKnowledge(data: SavePublicKnowledgeDTO): Promise<PublicMachineKnowledge> {
    const now = new Date().toISOString();
    const entry: PublicMachineKnowledge = {
      id: crypto.randomUUID(),
      manufacturer: data.manufacturer,
      modelNumber: data.modelNumber,
      productFamily: data.productFamily,
      publicSpecs: data.publicSpecs,
      sourceUrl: data.sourceUrl,
      sourcePublisher: data.sourcePublisher,
      retrievalDate: now.substring(0, 10),
      verificationStatus: data.verificationStatus ?? 'PUBLIC_SUGGESTION',
      approvedByUserId: null,
      approvedAt: null,
      sourceType: data.sourceType ?? 'UNKNOWN_UNVERIFIED',
      matchStatus: data.matchStatus ?? 'EXACT_MATCH',
      missingModelDetails: data.missingModelDetails,
      completenessSummary: data.completenessSummary,
      evidenceRecords: data.evidenceRecords,
      conflicts: data.conflicts,
      reviewNotes: data.reviewNotes,
    };
    this.publicKnowledge.set(entry.id, entry);
    return entry;
  }

  public async updatePublicMachineKnowledgeStatus(
    id: string,
    status: SpecVerificationStatus,
    approvedByUserId: string,
    reviewNotes?: string
  ): Promise<PublicMachineKnowledge | null> {
    const entry = this.publicKnowledge.get(id);
    if (!entry) return null;
    entry.verificationStatus = status;
    entry.approvedByUserId = approvedByUserId;
    entry.approvedAt = new Date().toISOString();
    if (reviewNotes) {
      entry.reviewNotes = reviewNotes;
    }
    return entry;
  }

  public clear(): void {
    this.organizations.clear();
    this.users.clear();
    this.memberships.clear();
    this.invitations.clear();
    this.plants.clear();
    this.assets.clear();
    this.machines.clear();
    this.missingInfoTasks.clear();
    this.componentMappings.clear();
    this.employeeBadges.clear();
    this.publicKnowledge.clear();
    this.industryProfiles.clear();
    this.engineeringModels.clear();
    this.manufacturerResources.clear();
    this.engineeringDrawings.clear();
    this.seedDefaultIndustryProfiles();
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

  // --------------------------------------------------------------------------
  // Industry Profiles (Universal Industry Support)
  // --------------------------------------------------------------------------
  public async listIndustryProfiles(organizationId: string): Promise<IndustryProfile[]> {
    const list: IndustryProfile[] = [];
    for (const p of this.industryProfiles.values()) {
      if (p.organizationId === 'GLOBAL' || p.organizationId === organizationId) {
        list.push({ ...p });
      }
    }
    return list;
  }

  public async getIndustryProfileByCode(organizationId: string, code: string): Promise<IndustryProfile | null> {
    let globalMatch: IndustryProfile | null = null;
    for (const p of this.industryProfiles.values()) {
      if (p.code.toUpperCase() === code.toUpperCase()) {
        if (p.organizationId === organizationId) {
          return { ...p };
        }
        if (p.organizationId === 'GLOBAL') {
          globalMatch = { ...p };
        }
      }
    }
    return globalMatch;
  }

  public async createIndustryProfile(organizationId: string, data: CreateIndustryProfileDTO): Promise<IndustryProfile> {
    for (const p of this.industryProfiles.values()) {
      if (p.organizationId === organizationId && p.code.toUpperCase() === data.code.toUpperCase()) {
        throw new Error(`Industry profile with code '${data.code}' already exists in this organization.`);
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const profile: IndustryProfile = {
      id,
      organizationId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description,
      isCustom: data.isCustom ?? true,
      assetCategories: data.assetCategories || [],
      terminology: data.terminology,
      drawingTypes: data.drawingTypes || [],
      customFields: data.customFields || [],
      standardCertifications: data.standardCertifications || [],
      createdAt: now,
      updatedAt: now,
    };
    this.industryProfiles.set(id, profile);
    return profile;
  }

  public async updateIndustryProfile(
    organizationId: string,
    profileId: string,
    updates: Partial<IndustryProfile>
  ): Promise<IndustryProfile | null> {
    const p = this.industryProfiles.get(profileId);
    if (!p) return null;
    if (p.organizationId !== organizationId && p.organizationId !== 'GLOBAL') return null;

    if (p.organizationId === 'GLOBAL') {
      const customId = crypto.randomUUID();
      const forked: IndustryProfile = {
        ...p,
        ...updates,
        id: customId,
        organizationId,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };
      this.industryProfiles.set(customId, forked);
      return forked;
    }

    const updated: IndustryProfile = {
      ...p,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.industryProfiles.set(profileId, updated);
    return updated;
  }

  public async deleteIndustryProfile(organizationId: string, profileId: string): Promise<boolean> {
    const p = this.industryProfiles.get(profileId);
    if (!p || p.organizationId !== organizationId) return false;
    return this.industryProfiles.delete(profileId);
  }

  // --------------------------------------------------------------------------
  // Engineering 3D Models & CAD Files
  // --------------------------------------------------------------------------
  public async createEngineeringModel3D(
    organizationId: string,
    data: CreateEngineeringModel3DDTO
  ): Promise<EngineeringModel3D> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    let status: EngineeringAssetStatus = data.status ?? 'NEEDS_REVIEW';
    let errorMessage: string | undefined = undefined;
    let convertedStorageKey: string | undefined = data.convertedStorageKey;

    if (data.fileSizeBytes <= 0) {
      status = 'PROCESSING_FAILED';
      errorMessage = 'Empty or corrupted CAD geometry file payload.';
    } else if (['STEP', 'STP', 'IGES', 'IGS', 'STL', 'OBJ'].includes(data.fileFormat)) {
      status = 'NEEDS_REVIEW';
      convertedStorageKey = data.storageKey.replace(/\.[^.]+$/, '.glb');
    }

    const model: EngineeringModel3D = {
      id,
      organizationId,
      plantId: data.plantId || 'default-plant',
      machineId: data.machineId,
      assetId: data.assetId || data.machineId,
      industryProfileCode: data.industryProfileCode || 'GENERAL',
      assetCategory: data.assetCategory || 'EQUIPMENT',
      title: data.title,
      manufacturer: data.manufacturer,
      modelNumber: data.modelNumber,
      sourceProvider: data.sourceProvider,
      sourceUrl: data.sourceUrl,
      fileFormat: data.fileFormat,
      fileSizeBytes: data.fileSizeBytes,
      fileHashSha256: data.fileHashSha256 || 'hash-placeholder',
      storageKey: data.storageKey,
      convertedStorageKey,
      modelRevision: data.modelRevision || '1.0',
      status,
      dataClassification: data.dataClassification || 'INTERNAL',
      licenseUsageRights: data.licenseUsageRights,
      uploadedByUserId: data.uploadedByUserId || 'system',
      reviewNotes: data.reviewNotes,
      errorMessage,
      extractedComponentsCount: data.extractedComponentsCount || 12,
      createdAt: now,
      updatedAt: now,
    };

    this.engineeringModels.set(id, model);

    if (data.machineId && status === 'APPROVED') {
      const machine = this.machines.get(data.machineId);
      if (machine && machine.organizationId === organizationId) {
        machine.hasModel3d = true;
        machine.model3dStorageKey = convertedStorageKey || model.storageKey;
        machine.model3dFormat = model.fileFormat.toLowerCase() as any;
        machine.revision += 1;
        machine.updatedAt = now;
      }
    }

    return model;
  }

  public async getEngineeringModel3DById(organizationId: string, modelId: string): Promise<EngineeringModel3D | null> {
    const model = this.engineeringModels.get(modelId);
    if (model && model.organizationId === organizationId) return { ...model };

    // Fallback: check if modelId refers to an asset model
    const targetAssetRef = modelId.replace(/^asset-3d-/, '').replace(/^local-/, '');
    for (const machine of this.machines.values()) {
      if (machine.organizationId !== organizationId) continue;
      if (machine.id === targetAssetRef || machine.assetTag?.toLowerCase() === targetAssetRef.toLowerCase()) {
        const specs = (machine.technicalSpecs || {}) as Record<string, any>;
        if (machine.hasModel3d || machine.model3dStorageKey || specs.model3dFileName) {
          const rawFileName = specs.model3dFileName || (machine.model3dStorageKey ? machine.model3dStorageKey.split('/').pop() : `${machine.assetTag}-model.glb`);
          const ext = (machine.model3dFormat || rawFileName.split('.').pop() || 'GLB').toUpperCase();
          const storageKey = machine.model3dStorageKey || `models/${machine.assetTag}-${rawFileName}`;
          let convertedStorageKey: string | undefined;
          if (['STEP', 'STP', 'IGES', 'IGS'].includes(ext)) {
            convertedStorageKey = storageKey.replace(/\.[^.]+$/, '.glb');
          }

          return {
            id: modelId.startsWith('asset-3d-') ? modelId : `asset-3d-${machine.id}`,
            organizationId: machine.organizationId,
            plantId: machine.plantId || 'PLANT-DEFAULT',
            machineId: machine.id,
            assetId: machine.id,
            industryProfileCode: 'GENERAL',
            assetCategory: machine.machineType || 'Industrial Machinery',
            title: rawFileName,
            manufacturer: machine.manufacturer || undefined,
            modelNumber: machine.modelNumber || undefined,
            sourceProvider: 'Asset Registry Ledger',
            fileFormat: ext as CADFileFormat,
            fileSizeBytes: Number(specs.model3dFileSize) || 4194304,
            fileHashSha256: 'asset_linked',
            storageKey,
            convertedStorageKey,
            modelRevision: '1.0',
            status: 'APPROVED',
            dataClassification: machine.dataClassification || 'INTERNAL',
            uploadedByUserId: 'system',
            createdAt: machine.createdAt || new Date().toISOString(),
            updatedAt: machine.updatedAt || new Date().toISOString(),
            extractedComponentsCount: 12,
          };
        }
      }
    }

    return null;
  }

  public async listEngineeringModels3D(
    organizationId: string,
    filters?: EngineeringModelFilterOptions
  ): Promise<EngineeringModel3D[]> {
    let list: EngineeringModel3D[] = [];
    const representedMachineIds = new Set<string>();
    const representedStorageKeys = new Set<string>();

    for (const m of this.engineeringModels.values()) {
      if (m.organizationId !== organizationId) continue;
      if (filters?.plantId && m.plantId !== filters.plantId) continue;
      if (filters?.machineId && m.machineId !== filters.machineId) continue;
      if (filters?.status && m.status !== filters.status) continue;
      if (filters?.fileFormat && m.fileFormat !== filters.fileFormat) continue;
      if (filters?.industryProfileCode && m.industryProfileCode !== filters.industryProfileCode) continue;
      list.push({ ...m });
      if (m.machineId) representedMachineIds.add(m.machineId);
      if (m.assetId) representedMachineIds.add(m.assetId);
      if (m.storageKey) representedStorageKeys.add(m.storageKey);
    }

    // Global File Aggregation: Find models from assets with 3D attachments in this tenant
    for (const machine of this.machines.values()) {
      if (machine.organizationId !== organizationId) continue;
      if (representedMachineIds.has(machine.id)) continue;
      if (machine.model3dStorageKey && representedStorageKeys.has(machine.model3dStorageKey)) continue;

      if (filters?.plantId && machine.plantId !== filters.plantId) continue;
      if (filters?.machineId && machine.id !== filters.machineId && machine.assetTag !== filters.machineId) continue;

      const specs = (machine.technicalSpecs || {}) as Record<string, any>;
      if (!machine.hasModel3d && !machine.model3dStorageKey && !specs.model3dFileName) continue;

      const rawFileName = specs.model3dFileName || (machine.model3dStorageKey ? machine.model3dStorageKey.split('/').pop() : `${machine.assetTag}-model.glb`);
      const ext = (machine.model3dFormat || rawFileName.split('.').pop() || 'GLB').toUpperCase();
      const storageKey = machine.model3dStorageKey || `models/${machine.assetTag}-${rawFileName}`;

      if (filters?.fileFormat && ext !== filters.fileFormat) continue;
      if (filters?.status && filters.status !== 'APPROVED') continue;

      let convertedStorageKey: string | undefined;
      if (['STEP', 'STP', 'IGES', 'IGS'].includes(ext)) {
        convertedStorageKey = storageKey.replace(/\.[^.]+$/, '.glb');
      }

      list.push({
        id: `asset-3d-${machine.id}`,
        organizationId: machine.organizationId,
        plantId: machine.plantId || 'PLANT-DEFAULT',
        machineId: machine.id,
        assetId: machine.id,
        industryProfileCode: 'GENERAL',
        assetCategory: machine.machineType || 'Industrial Machinery',
        title: rawFileName,
        manufacturer: machine.manufacturer || undefined,
        modelNumber: machine.modelNumber || undefined,
        sourceProvider: 'Asset Registry Ledger',
        fileFormat: ext as CADFileFormat,
        fileSizeBytes: Number(specs.model3dFileSize) || 4194304,
        fileHashSha256: 'asset_linked',
        storageKey,
        convertedStorageKey,
        modelRevision: '1.0',
        status: 'APPROVED',
        dataClassification: machine.dataClassification || 'INTERNAL',
        uploadedByUserId: 'system',
        createdAt: machine.createdAt || new Date().toISOString(),
        updatedAt: machine.updatedAt || new Date().toISOString(),
        extractedComponentsCount: 12,
      });
      representedMachineIds.add(machine.id);
      if (storageKey) representedStorageKeys.add(storageKey);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateEngineeringModel3D(
    organizationId: string,
    modelId: string,
    updates: Partial<EngineeringModel3D>
  ): Promise<EngineeringModel3D | null> {
    const model = this.engineeringModels.get(modelId);
    if (!model || model.organizationId !== organizationId) return null;

    const now = new Date().toISOString();
    const updated: EngineeringModel3D = {
      ...model,
      ...updates,
      reviewedAt: updates.reviewedAt || (updates.status ? now : model.reviewedAt),
      updatedAt: now,
    };
    this.engineeringModels.set(modelId, updated);

    if (updated.status === 'APPROVED' && updated.machineId) {
      const machine = this.machines.get(updated.machineId);
      if (machine && machine.organizationId === organizationId) {
        machine.hasModel3d = true;
        machine.model3dStorageKey = updated.convertedStorageKey || updated.storageKey;
        machine.model3dFormat = updated.fileFormat.toLowerCase() as any;
        machine.revision += 1;
        machine.updatedAt = now;
      }
    }

    return updated;
  }

  public async deleteEngineeringModel3D(organizationId: string, modelId: string): Promise<boolean> {
    const model = this.engineeringModels.get(modelId);
    if (!model || model.organizationId !== organizationId) return false;
    return this.engineeringModels.delete(modelId);
  }

  // --------------------------------------------------------------------------
  // Manufacturer Resources
  // --------------------------------------------------------------------------
  public async createManufacturerResource(
    organizationId: string,
    data: CreateManufacturerResourceDTO
  ): Promise<ManufacturerResource> {
    if (data.sourceType === 'OFFICIAL_URL' && data.sourceUrl) {
      if (!data.sourceUrl.startsWith('http://') && !data.sourceUrl.startsWith('https://')) {
        throw new Error('Invalid official URL: Must begin with http:// or https://');
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const res: ManufacturerResource = {
      id,
      organizationId,
      machineId: data.machineId,
      resourceType: data.resourceType,
      title: data.title,
      manufacturer: data.manufacturer,
      modelNumber: data.modelNumber,
      sourceType: data.sourceType,
      sourceUrl: data.sourceUrl,
      storageKey: data.storageKey,
      fileFormat: data.fileFormat,
      fileSizeBytes: data.fileSizeBytes,
      fileHashSha256: data.fileHashSha256,
      versionRevision: data.versionRevision || '1.0',
      verificationStatus: data.verificationStatus || 'UNVERIFIED',
      accessRequirements: data.accessRequirements,
      usageRightsEvidence: data.usageRightsEvidence,
      uploadedByUserId: data.uploadedByUserId,
      reviewNotes: data.reviewNotes,
      createdAt: now,
      updatedAt: now,
    };

    this.manufacturerResources.set(id, res);
    return res;
  }

  public async getManufacturerResourceById(organizationId: string, resourceId: string): Promise<ManufacturerResource | null> {
    const res = this.manufacturerResources.get(resourceId);
    if (res && res.organizationId === organizationId) return { ...res };

    if (resourceId.startsWith('doc-res-')) {
      const docId = resourceId.replace(/^doc-res-/, '');
      const doc = this.documents.get(docId);
      if (doc && doc.organizationId === organizationId) {
        let version: DocumentVersion | undefined;
        for (const v of this.documentVersions.values()) {
          if (v.documentId === docId) {
            version = v;
            break;
          }
        }
        if (version?.storageKey) {
          const isManual = doc.category === 'OEM_MANUAL' || (doc.category as string) === 'MANUAL';
          const ext = (version.filename?.split('.').pop() || 'PDF').toUpperCase();
          return {
            id: resourceId,
            organizationId,
            machineId: undefined,
            resourceType: isManual ? 'OFFICIAL_MANUAL' : 'APPROVED_REFERENCE',
            title: doc.title || version.filename,
            manufacturer: (doc.metadata as any)?.manufacturer || 'OEM / Plant Document',
            modelNumber: (doc.metadata as any)?.modelNumber || doc.documentNumber,
            sourceType: 'FILE_UPLOAD',
            storageKey: version.storageKey,
            fileFormat: ext as any,
            fileSizeBytes: Number(version.fileSizeBytes) || 1048576,
            versionRevision: '1.0',
            verificationStatus: 'VERIFIED',
            createdAt: doc.createdAt || new Date().toISOString(),
            updatedAt: doc.updatedAt || new Date().toISOString(),
          };
        }
      }
    }

    return null;
  }

  public async listManufacturerResources(
    organizationId: string,
    filters?: ManufacturerResourceFilterOptions
  ): Promise<ManufacturerResource[]> {
    let list: ManufacturerResource[] = [];
    const representedKeys = new Set<string>();

    for (const r of this.manufacturerResources.values()) {
      if (r.organizationId !== organizationId) continue;
      if (filters?.machineId && r.machineId !== filters.machineId) continue;
      if (filters?.resourceType && r.resourceType !== filters.resourceType) continue;
      if (filters?.verificationStatus && r.verificationStatus !== filters.verificationStatus) continue;
      if (filters?.manufacturer && !r.manufacturer.toLowerCase().includes(filters.manufacturer.toLowerCase())) continue;
      list.push({ ...r });
      if (r.storageKey) representedKeys.add(r.storageKey);
    }

    // Global File Aggregation: Find documents from documents + documentVersions
    for (const doc of this.documents.values()) {
      if (doc.organizationId !== organizationId) continue;
      let version: DocumentVersion | undefined;
      for (const v of this.documentVersions.values()) {
        if (v.documentId === doc.id) {
          version = v;
          break;
        }
      }
      if (!version?.storageKey || representedKeys.has(version.storageKey)) continue;

      // Find matching machine
      let matchedMachine: any;
      if ((doc as any).machineId) {
        matchedMachine = this.machines.get((doc as any).machineId);
      }
      if (!matchedMachine && (doc as any).assetIds?.length) {
        for (const aId of (doc as any).assetIds) {
          const m = this.machines.get(aId);
          if (m) {
            matchedMachine = m;
            break;
          }
        }
      }
      if (!matchedMachine && ((doc.assetTags && doc.assetTags.length > 0) || doc.documentNumber)) {
        for (const m of this.machines.values()) {
          if (
            m.organizationId === organizationId &&
            (((doc.assetTags || []).map((t) => t.toLowerCase())).includes(m.assetTag.toLowerCase()) ||
              doc.documentNumber.toLowerCase() === m.assetTag.toLowerCase())
          ) {
            matchedMachine = m;
            break;
          }
        }
      }

      if (filters?.machineId && matchedMachine?.id !== filters.machineId) continue;

      const isManual = doc.category === 'OEM_MANUAL' || (doc.category as string) === 'MANUAL';
      const rType: ManufacturerResourceType = isManual ? 'OFFICIAL_MANUAL' : 'APPROVED_REFERENCE';
      if (filters?.resourceType && filters.resourceType !== rType) continue;

      const ext = (version.filename?.split('.').pop() || 'PDF').toUpperCase();

      list.push({
        id: `doc-res-${doc.id}`,
        organizationId,
        machineId: matchedMachine?.id,
        resourceType: rType,
        title: doc.title || version.filename,
        manufacturer: matchedMachine?.manufacturer || (doc.metadata as any)?.manufacturer || 'OEM / Plant Document',
        modelNumber: matchedMachine?.modelNumber || (doc.metadata as any)?.modelNumber || doc.documentNumber,
        sourceType: 'FILE_UPLOAD',
        storageKey: version.storageKey,
        fileFormat: ext as any,
        fileSizeBytes: Number(version.fileSizeBytes) || 1048576,
        versionRevision: '1.0',
        verificationStatus: 'VERIFIED',
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || new Date().toISOString(),
      });
      representedKeys.add(version.storageKey);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateManufacturerResource(
    organizationId: string,
    resourceId: string,
    updates: Partial<ManufacturerResource>
  ): Promise<ManufacturerResource | null> {
    const res = this.manufacturerResources.get(resourceId);
    if (!res || res.organizationId !== organizationId) return null;

    const now = new Date().toISOString();
    const updated: ManufacturerResource = {
      ...res,
      ...updates,
      verifiedAt: updates.verifiedAt || (updates.verificationStatus ? now : res.verifiedAt),
      updatedAt: now,
    };
    this.manufacturerResources.set(resourceId, updated);
    return updated;
  }

  public async deleteManufacturerResource(organizationId: string, resourceId: string): Promise<boolean> {
    const res = this.manufacturerResources.get(resourceId);
    if (!res || res.organizationId !== organizationId) return false;
    return this.manufacturerResources.delete(resourceId);
  }

  // --------------------------------------------------------------------------
  // Engineering Drawings
  // --------------------------------------------------------------------------
  public async createEngineeringDrawing(
    organizationId: string,
    data: CreateEngineeringDrawingDTO
  ): Promise<EngineeringDrawing> {
    const id = crypto.randomUUID();
    const drawingNumber = data.uniqueDrawingNumber || data.drawingNumber || `DWG-${id.slice(0, 8)}`;
    const drawingTitle = data.drawingTitle || data.title || drawingNumber;

    for (const d of this.engineeringDrawings.values()) {
      if (d.organizationId === organizationId && d.uniqueDrawingNumber.toLowerCase() === drawingNumber.toLowerCase()) {
        throw new Error(`Engineering drawing with number '${drawingNumber}' already exists in this organization.`);
      }
    }

    const now = new Date().toISOString();
    let status: EngineeringAssetStatus = data.status ?? 'NEEDS_REVIEW';
    let errorMessage: string | undefined = undefined;
    const sizeBytes = Number(data.fileSizeBytes) || 1024;
    if (sizeBytes <= 0) {
      status = 'PROCESSING_FAILED';
      errorMessage = 'Empty or unreadable drawing file payload.';
    }

    const dwg: EngineeringDrawing = {
      id,
      organizationId,
      plantId: data.plantId || 'default-plant',
      machineId: data.machineId,
      drawingTitle,
      uniqueDrawingNumber: drawingNumber,
      drawingType: data.drawingType,
      discipline: data.discipline || 'Mechanical',
      revision: data.revision || 'Rev A',
      effectiveDate: data.effectiveDate,
      source: data.source || 'INTERNAL',
      storageKey: data.storageKey,
      originalFileName: data.originalFileName || `${drawingNumber}.pdf`,
      fileFormat: (data.fileFormat as any) || 'PDF',
      fileSizeBytes: sizeBytes,
      fileHashSha256: data.fileHashSha256 || 'hash-placeholder',
      status,
      dataClassification: data.dataClassification || 'INTERNAL',
      equipmentTags: data.equipmentTags || [],
      uploadedByUserId: data.uploadedByUserId || 'system',
      reviewNotes: data.reviewNotes,
      errorMessage,
      createdAt: now,
      updatedAt: now,
    };

    this.engineeringDrawings.set(id, dwg);

    if (data.machineId && status === 'APPROVED' && (data.drawingType === 'PID' || data.drawingType === 'PROCESS_FLOW')) {
      const machine = this.machines.get(data.machineId);
      if (machine && machine.organizationId === organizationId) {
        machine.hasPidDiagram = true;
        machine.pidStorageKey = dwg.storageKey;
        machine.revision += 1;
        machine.updatedAt = now;
      }
    }

    return dwg;
  }

  public async getEngineeringDrawingById(organizationId: string, drawingId: string): Promise<EngineeringDrawing | null> {
    const dwg = this.engineeringDrawings.get(drawingId);
    if (dwg && dwg.organizationId === organizationId) return { ...dwg };

    // Fallback: check if drawingId refers to an asset drawing
    const targetAssetRef = drawingId.replace(/^asset-pid-/, '').replace(/^asset-dwg-/, '').replace(/^local-pid-/, '').replace(/^local-/, '');
    for (const machine of this.machines.values()) {
      if (machine.organizationId !== organizationId) continue;
      if (machine.id === targetAssetRef || machine.assetTag?.toLowerCase() === targetAssetRef.toLowerCase()) {
        const specs = (machine.technicalSpecs || {}) as Record<string, any>;
        if (machine.hasPidDiagram || machine.pidStorageKey || specs.pidFileName) {
          const rawFileName = specs.pidFileName || (machine.pidStorageKey ? machine.pidStorageKey.split('/').pop() : `${machine.assetTag}-drawing.pdf`);
          const ext = (rawFileName.split('.').pop() || 'PDF').toUpperCase();
          const format = ext === 'SVG' ? 'SVG' : ext === 'PDF' ? 'PDF' : ext === 'PNG' ? 'PNG' : ext === 'JPG' || ext === 'JPEG' ? 'JPG' : 'PDF';
          const storageKey = machine.pidStorageKey || `schematics/${machine.assetTag}-${rawFileName}`;

          return {
            id: drawingId.startsWith('asset-') ? drawingId : `asset-pid-${machine.id}`,
            organizationId: machine.organizationId,
            plantId: machine.plantId || 'PLANT-DEFAULT',
            machineId: machine.id,
            drawingTitle: rawFileName,
            uniqueDrawingNumber: `PID-${machine.assetTag}`,
            drawingType: 'PID',
            discipline: 'Process & Mechanical',
            revision: 'Rev 1.0',
            effectiveDate: machine.installationDate ? machine.installationDate.substring(0, 10) : new Date().toISOString().substring(0, 10),
            source: 'Authoritative Asset Ledger',
            storageKey,
            originalFileName: rawFileName,
            fileFormat: format as any,
            fileSizeBytes: Number(specs.pidFileSize) || 2097152,
            fileHashSha256: 'asset_linked',
            status: 'APPROVED',
            dataClassification: machine.dataClassification || 'INTERNAL',
            equipmentTags: [machine.assetTag],
            uploadedByUserId: 'system',
            createdAt: machine.createdAt || new Date().toISOString(),
            updatedAt: machine.updatedAt || new Date().toISOString(),
          };
        }
      }
    }

    return null;
  }

  public async listEngineeringDrawings(
    organizationId: string,
    filters?: EngineeringDrawingFilterOptions
  ): Promise<EngineeringDrawing[]> {
    let list: EngineeringDrawing[] = [];
    const representedMachineIds = new Set<string>();
    const representedStorageKeys = new Set<string>();

    for (const d of this.engineeringDrawings.values()) {
      if (d.organizationId !== organizationId) continue;
      if (filters?.plantId && d.plantId !== filters.plantId) continue;
      if (filters?.machineId && d.machineId !== filters.machineId) continue;
      if (filters?.drawingType && d.drawingType !== filters.drawingType) continue;
      if (filters?.discipline && d.discipline.toLowerCase() !== filters.discipline.toLowerCase()) continue;
      if (filters?.status && d.status !== filters.status) continue;
      list.push({ ...d });
      if (d.machineId) representedMachineIds.add(d.machineId);
      if (d.storageKey) representedStorageKeys.add(d.storageKey);
    }

    // Global File Aggregation: Find drawings from assets with P&ID attachments in this tenant
    for (const machine of this.machines.values()) {
      if (machine.organizationId !== organizationId) continue;
      if (representedMachineIds.has(machine.id)) continue;
      if (machine.pidStorageKey && representedStorageKeys.has(machine.pidStorageKey)) continue;

      if (filters?.plantId && machine.plantId !== filters.plantId) continue;
      if (filters?.machineId && machine.id !== filters.machineId && machine.assetTag !== filters.machineId) continue;
      if (filters?.drawingType && filters.drawingType !== 'PID' && filters.drawingType !== 'PROCESS_FLOW') continue;
      if (filters?.status && filters.status !== 'APPROVED') continue;

      const specs = (machine.technicalSpecs || {}) as Record<string, any>;
      if (!machine.hasPidDiagram && !machine.pidStorageKey && !specs.pidFileName) continue;

      const rawFileName = specs.pidFileName || (machine.pidStorageKey ? machine.pidStorageKey.split('/').pop() : `${machine.assetTag}-drawing.pdf`);
      const ext = (rawFileName.split('.').pop() || 'PDF').toUpperCase();
      const format = ext === 'SVG' ? 'SVG' : ext === 'PDF' ? 'PDF' : ext === 'PNG' ? 'PNG' : ext === 'JPG' || ext === 'JPEG' ? 'JPG' : 'PDF';
      const storageKey = machine.pidStorageKey || `schematics/${machine.assetTag}-${rawFileName}`;

      list.push({
        id: `asset-pid-${machine.id}`,
        organizationId: machine.organizationId,
        plantId: machine.plantId || 'PLANT-DEFAULT',
        machineId: machine.id,
        drawingTitle: rawFileName,
        uniqueDrawingNumber: `PID-${machine.assetTag}`,
        drawingType: 'PID',
        discipline: 'Process & Mechanical',
        revision: 'Rev 1.0',
        effectiveDate: machine.installationDate ? machine.installationDate.substring(0, 10) : new Date().toISOString().substring(0, 10),
        source: 'Authoritative Asset Ledger',
        storageKey,
        originalFileName: rawFileName,
        fileFormat: format as any,
        fileSizeBytes: Number(specs.pidFileSize) || 2097152,
        fileHashSha256: 'asset_linked',
        status: 'APPROVED',
        dataClassification: machine.dataClassification || 'INTERNAL',
        equipmentTags: [machine.assetTag],
        uploadedByUserId: 'system',
        createdAt: machine.createdAt || new Date().toISOString(),
        updatedAt: machine.updatedAt || new Date().toISOString(),
      });
      representedMachineIds.add(machine.id);
      if (storageKey) representedStorageKeys.add(storageKey);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateEngineeringDrawing(
    organizationId: string,
    drawingId: string,
    updates: Partial<EngineeringDrawing>
  ): Promise<EngineeringDrawing | null> {
    const dwg = this.engineeringDrawings.get(drawingId);
    if (!dwg || dwg.organizationId !== organizationId) return null;

    const now = new Date().toISOString();
    const updated: EngineeringDrawing = {
      ...dwg,
      ...updates,
      reviewedAt: updates.reviewedAt || (updates.status ? now : dwg.reviewedAt),
      updatedAt: now,
    };
    this.engineeringDrawings.set(drawingId, updated);

    if (updated.status === 'APPROVED' && updated.machineId && (updated.drawingType === 'PID' || updated.drawingType === 'PROCESS_FLOW')) {
      const machine = this.machines.get(updated.machineId);
      if (machine && machine.organizationId === organizationId) {
        machine.hasPidDiagram = true;
        machine.pidStorageKey = updated.storageKey;
        machine.revision += 1;
        machine.updatedAt = now;
      }
    }

    return updated;
  }

  public async deleteEngineeringDrawing(organizationId: string, drawingId: string): Promise<boolean> {
    const dwg = this.engineeringDrawings.get(drawingId);
    if (!dwg || dwg.organizationId !== organizationId) return false;
    return this.engineeringDrawings.delete(drawingId);
  }

  // --------------------------------------------------------------------------
  // Engineering Asset Center Summary
  // --------------------------------------------------------------------------
  public async getEngineeringAssetCenterSummary(organizationId: string): Promise<EngineeringAssetCenterSummary> {
    const [models, drawings, resources] = await Promise.all([
      this.listEngineeringModels3D(organizationId),
      this.listEngineeringDrawings(organizationId),
      this.listManufacturerResources(organizationId),
    ]);

    const approvedModels3d = models.filter((m) => m.status === 'APPROVED').length;
    const pendingReviewModels3d = models.filter((m) => m.status === 'NEEDS_REVIEW').length;
    const approvedDrawings = drawings.filter((d) => d.status === 'APPROVED').length;

    let totalProfiles = 0;
    for (const p of this.industryProfiles.values()) {
      if (p.organizationId === 'GLOBAL' || p.organizationId === organizationId) {
        totalProfiles++;
      }
    }

    return {
      totalModels3d: models.length,
      approvedModels3d,
      pendingReviewModels3d,
      totalDrawings: drawings.length,
      approvedDrawings,
      totalManufacturerResources: resources.length,
      totalIndustryProfiles: totalProfiles,
      activeIndustryProfileCode: 'OIL_GAS_PETROCHEM',
      supportedFormats: {
        cad: ['GLB', 'GLTF', 'STEP', 'STP', 'IGES', 'IGS', 'STL', 'OBJ'],
        drawings: ['PDF', 'PNG', 'JPG', 'SVG', 'CAD', 'DXF'],
        resources: ['PDF', 'DOCX', 'STEP', 'ZIP', 'URL'],
      },
    };
  }

  // --------------------------------------------------------------------------
  // Employee and Technician Directory
  // --------------------------------------------------------------------------
  public async createEmployeeProfile(
    organizationId: string,
    dto: CreateEmployeeProfileDTO
  ): Promise<EmployeeProfile> {
    for (const p of this.employeeProfiles.values()) {
      if (p.organizationId === organizationId && p.employeeNumber === dto.employeeNumber) {
        throw new Error(`FORGEX_DUPLICATE_EMPLOYEE_NUMBER: Employee number '${dto.employeeNumber}' already exists.`);
      }
      if (p.organizationId === organizationId && p.userId === dto.userId) {
        throw new Error(`FORGEX_DUPLICATE_EMPLOYEE_USER: User is already registered in employee directory.`);
      }
    }

    const now = new Date().toISOString();
    const profile: EmployeeProfile = {
      id: crypto.randomUUID(),
      organizationId,
      userId: dto.userId,
      employeeNumber: dto.employeeNumber,
      fullName: dto.fullName,
      email: dto.email,
      role: dto.role,
      department: dto.department || 'Operations',
      assignedPlantIds: dto.assignedPlantIds || [],
      accountStatus: dto.accountStatus || 'ACTIVE',
      availabilityStatus: dto.availabilityStatus || 'AVAILABLE',
      qualificationStatus: dto.qualificationStatus || 'CERTIFIED',
      verifiedSkills: dto.verifiedSkills || [],
      specializedMachineIds: dto.specializedMachineIds || [],
      createdAt: now,
      updatedAt: now,
    };

    this.employeeProfiles.set(profile.id, profile);
    return profile;
  }

  public async getEmployeeProfile(organizationId: string, id: string): Promise<EmployeeProfile | null> {
    const profile = this.employeeProfiles.get(id);
    if (!profile || profile.organizationId !== organizationId) return null;
    return profile;
  }

  public async getEmployeeProfileByUserId(organizationId: string, userId: string): Promise<EmployeeProfile | null> {
    for (const p of this.employeeProfiles.values()) {
      if (p.organizationId === organizationId && p.userId === userId) {
        return p;
      }
    }
    return null;
  }

  public async updateEmployeeProfile(
    organizationId: string,
    id: string,
    updates: Partial<EmployeeProfile>
  ): Promise<EmployeeProfile | null> {
    const profile = await this.getEmployeeProfile(organizationId, id);
    if (!profile) return null;

    Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
    this.employeeProfiles.set(id, profile);
    return profile;
  }

  public async listEmployeeProfiles(
    organizationId: string,
    filters?: EmployeeProfileFilterOptions
  ): Promise<EmployeeProfile[]> {
    const results: EmployeeProfile[] = [];
    for (const p of this.employeeProfiles.values()) {
      if (p.organizationId !== organizationId) continue;
      if (filters?.department && p.department !== filters.department) continue;
      if (filters?.role && p.role !== filters.role) continue;
      if (filters?.accountStatus && p.accountStatus !== filters.accountStatus) continue;
      if (filters?.availabilityStatus && p.availabilityStatus !== filters.availabilityStatus) continue;
      if (filters?.plantId && !p.assignedPlantIds.includes(filters.plantId) && p.assignedPlantIds.length > 0) {
        continue;
      }
      results.push(p);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Machine-to-Specialist Mappings
  // --------------------------------------------------------------------------
  public async setMachineSpecialistMapping(
    organizationId: string,
    dto: SetMachineSpecialistMappingDTO
  ): Promise<MachineSpecialistMapping> {
    let existing: MachineSpecialistMapping | null = null;
    for (const m of this.machineSpecialists.values()) {
      if (m.organizationId === organizationId && m.machineId === dto.machineId) {
        existing = m;
        break;
      }
    }

    const now = new Date().toISOString();
    let computedStatus: SpecialistAssignmentStatus = dto.assignmentStatus || 'UNASSIGNED';

    if (dto.primarySpecialistUserId) {
      const specialistProfile = await this.getEmployeeProfileByUserId(organizationId, dto.primarySpecialistUserId);
      const requiredCerts = dto.requiredCertifications || [];
      if (specialistProfile && requiredCerts.length > 0) {
        const hasAllCerts = requiredCerts.every((c) => specialistProfile.verifiedSkills.includes(c));
        computedStatus = hasAllCerts ? 'ASSIGNED' : 'QUALIFICATION_PENDING';
      } else {
        computedStatus = 'ASSIGNED';
      }
    } else {
      computedStatus = 'UNASSIGNED';
    }

    if (existing) {
      existing.plantId = dto.plantId;
      existing.primarySpecialistUserId = dto.primarySpecialistUserId ?? null;
      existing.primarySpecialistName = dto.primarySpecialistName ?? null;
      existing.backupSpecialistUserIds = dto.backupSpecialistUserIds || existing.backupSpecialistUserIds;
      existing.requiredCertifications = dto.requiredCertifications || existing.requiredCertifications;
      existing.assignmentStatus = computedStatus;
      existing.escalationTimeoutMinutes = dto.escalationTimeoutMinutes || existing.escalationTimeoutMinutes;
      existing.escalationRole = dto.escalationRole || existing.escalationRole;
      existing.assignedByUserId = dto.assignedByUserId || existing.assignedByUserId;
      existing.assignedAt = now;
      existing.updatedAt = now;
      this.machineSpecialists.set(existing.id, existing);
      return existing;
    }

    const mapping: MachineSpecialistMapping = {
      id: crypto.randomUUID(),
      organizationId,
      machineId: dto.machineId,
      plantId: dto.plantId,
      primarySpecialistUserId: dto.primarySpecialistUserId ?? null,
      primarySpecialistName: dto.primarySpecialistName ?? null,
      backupSpecialistUserIds: dto.backupSpecialistUserIds || [],
      requiredCertifications: dto.requiredCertifications || [],
      assignmentStatus: computedStatus,
      escalationTimeoutMinutes: dto.escalationTimeoutMinutes || 60,
      escalationRole: dto.escalationRole || 'PLANT_MANAGER',
      assignedByUserId: dto.assignedByUserId || null,
      assignedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.machineSpecialists.set(mapping.id, mapping);
    return mapping;
  }

  public async getMachineSpecialistMapping(
    organizationId: string,
    machineId: string
  ): Promise<MachineSpecialistMapping | null> {
    const cleanId = sanitizeMachineOrAssetId(machineId);
    for (const m of this.machineSpecialists.values()) {
      if (m.organizationId === organizationId && (m.machineId === machineId || m.machineId === cleanId)) {
        return m;
      }
    }
    return null;
  }

  public async listMachineSpecialistMappings(organizationId: string): Promise<MachineSpecialistMapping[]> {
    const list: MachineSpecialistMapping[] = [];
    for (const m of this.machineSpecialists.values()) {
      if (m.organizationId === organizationId) {
        list.push(m);
      }
    }
    return list;
  }

  // --------------------------------------------------------------------------
  // Specialist Tickets & Automatic Routing
  // --------------------------------------------------------------------------
  public async createSpecialistTicket(
    organizationId: string,
    dto: CreateSpecialistTicketDTO
  ): Promise<SpecialistTicket> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ticketNumber =
      dto.ticketNumber || `TICK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const initialHistory: TicketHistoryItem = {
      id: crypto.randomUUID(),
      ticketId: id,
      actorUserId: dto.reportedByUserId,
      action: 'TICKET_CREATED',
      previousStatus: null,
      newStatus: dto.status || 'OPEN',
      notes: `Ticket created. Escalation reason: ${dto.escalationReason}. Assignment status: ${dto.assignmentStatus || 'NEEDS_SPECIALIST_ASSIGNMENT'}`,
      timestamp: now,
    };

    const ticket: SpecialistTicket = {
      id,
      ticketNumber,
      organizationId,
      plantId: dto.plantId,
      machineId: dto.machineId ?? null,
      machineAssetTag: dto.machineAssetTag ?? null,
      reportedByUserId: dto.reportedByUserId,
      reportedByUserName: dto.reportedByUserName ?? null,
      originalQuestion: dto.originalQuestion,
      diagnosticDetails: dto.diagnosticDetails ?? null,
      escalationReason: dto.escalationReason,
      evidenceCheckResult: dto.evidenceCheckResult,
      severity: dto.severity || 'MEDIUM',
      assignedSpecialistUserId: dto.assignedSpecialistUserId ?? null,
      assignedSpecialistName: dto.assignedSpecialistName ?? null,
      assignmentStatus: dto.assignmentStatus || 'NEEDS_SPECIALIST_ASSIGNMENT',
      status: dto.status || 'OPEN',
      technicianObservations: null,
      diagnosisOutcome: null,
      repairOutcome: null,
      proposedKnowledgeUpdate: null,
      knowledgeUpdateStatus: 'NONE',
      resolvedAt: null,
      resolvedByUserId: null,
      history: [initialHistory],
      createdAt: now,
      updatedAt: now,
      createdAtFormatted: dto.createdAtFormatted,
      plantName: dto.plantName,
      reportedByRole: dto.reportedByRole,
      assetName: dto.assetName,
      machineStatus: dto.machineStatus,
      faultCode: dto.faultCode,
      symptomDescription: dto.symptomDescription,
      topRootCause: dto.topRootCause,
      probability: dto.probability,
      recommendedFix: dto.recommendedFix,
      investigationProgress: dto.investigationProgress,
      specialistDiscipline: dto.specialistDiscipline,
      priority: dto.priority,
      lotoApplied: dto.lotoApplied,
      technicianNotes: dto.technicianNotes,
    };

    this.specialistTickets.set(id, ticket);
    return ticket;
  }

  public async getSpecialistTicketById(organizationId: string, id: string): Promise<SpecialistTicket | null> {
    const ticket = this.specialistTickets.get(id);
    if (!ticket || ticket.organizationId !== organizationId) return null;
    return ticket;
  }

  public async updateSpecialistTicket(
    organizationId: string,
    id: string,
    updates: Partial<SpecialistTicket> & { actorUserId?: string; note?: string }
  ): Promise<SpecialistTicket | null> {
    const ticket = await this.getSpecialistTicketById(organizationId, id);
    if (!ticket) return null;

    const previousStatus = ticket.status;
    const actorUserId = updates.actorUserId || ticket.reportedByUserId;
    const now = new Date().toISOString();

    if (updates.status && updates.status !== previousStatus) {
      ticket.history.push({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorUserId,
        action: 'STATUS_CHANGED',
        previousStatus,
        newStatus: updates.status,
        notes: updates.note || `Status updated from ${previousStatus} to ${updates.status}`,
        timestamp: now,
      });

      if (updates.status === 'RESOLVED' || updates.status === 'CLOSED') {
        ticket.resolvedAt = now;
        ticket.resolvedByUserId = actorUserId;
      }
    } else if (updates.note) {
      ticket.history.push({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorUserId,
        action: 'NOTE_ADDED',
        previousStatus: ticket.status,
        newStatus: ticket.status,
        notes: updates.note,
        timestamp: now,
      });
    }

    delete updates.actorUserId;
    delete updates.note;

    Object.assign(ticket, updates, { updatedAt: now });
    this.specialistTickets.set(id, ticket);
    return ticket;
  }

  public async listSpecialistTickets(
    organizationId: string,
    filters?: SpecialistTicketFilterOptions
  ): Promise<SpecialistTicket[]> {
    const results: SpecialistTicket[] = [];
    for (const t of this.specialistTickets.values()) {
      if (t.organizationId !== organizationId) continue;
      if (filters?.assignedSpecialistUserId && t.assignedSpecialistUserId !== filters.assignedSpecialistUserId) {
        continue;
      }
      if (filters?.reportedByUserId && t.reportedByUserId !== filters.reportedByUserId) {
        continue;
      }
      if (filters?.machineId) {
        const cleanId = sanitizeMachineOrAssetId(filters.machineId);
        if (
          t.machineId !== filters.machineId &&
          t.machineId !== cleanId &&
          t.machineAssetTag !== filters.machineId &&
          t.machineAssetTag !== cleanId
        ) {
          continue;
        }
      }
      if (filters?.status && t.status !== filters.status) {
        continue;
      }
      if (filters?.assignmentStatus && t.assignmentStatus !== filters.assignmentStatus) {
        continue;
      }
      if (filters?.severity && t.severity !== filters.severity) {
        continue;
      }
      results.push(t);
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getTicketOversightSummary(organizationId: string): Promise<TicketOversightSummary> {
    let totalTickets = 0;
    let openTickets = 0;
    let unassignedTickets = 0;
    let inProgressTickets = 0;
    let resolvedTickets = 0;
    let escalatedTickets = 0;
    const specialistWorkloads: Record<
      string,
      { specialistName: string; activeCount: number; resolvedCount: number }
    > = {};
    const recentEscalations: SpecialistTicket[] = [];

    for (const t of this.specialistTickets.values()) {
      if (t.organizationId !== organizationId) continue;
      totalTickets++;

      if (t.status === 'OPEN') openTickets++;
      if (t.status === 'IN_PROGRESS') inProgressTickets++;
      if (t.status === 'RESOLVED' || t.status === 'CLOSED') resolvedTickets++;
      if (t.assignmentStatus === 'NEEDS_SPECIALIST_ASSIGNMENT') unassignedTickets++;
      if (
        t.assignmentStatus === 'ESCALATED_TRIAGE' ||
        t.assignmentStatus === 'NEEDS_SPECIALIST_ASSIGNMENT' ||
        t.escalationReason === 'SAFETY_CRITICAL'
      ) {
        escalatedTickets++;
        if (recentEscalations.length < 10) {
          recentEscalations.push(t);
        }
      }

      if (t.assignedSpecialistUserId) {
        const key = t.assignedSpecialistUserId;
        if (!specialistWorkloads[key]) {
          specialistWorkloads[key] = {
            specialistName: t.assignedSpecialistName || 'Specialist',
            activeCount: 0,
            resolvedCount: 0,
          };
        }
        if (t.status === 'OPEN' || t.status === 'IN_PROGRESS') {
          specialistWorkloads[key].activeCount++;
        } else {
          specialistWorkloads[key].resolvedCount++;
        }
      }
    }

    return {
      totalTickets,
      openTickets,
      unassignedTickets,
      inProgressTickets,
      resolvedTickets,
      escalatedTickets,
      specialistWorkloads,
      recentEscalations,
    };
  }

  public async findActiveDuplicateTicket(
    organizationId: string,
    machineId: string,
    questionOrSymptom: string
  ): Promise<SpecialistTicket | null> {
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const target = normalize(questionOrSymptom);
    const targetWords = new Set(target.split(' ').filter((w) => w.length > 2));

    for (const t of this.specialistTickets.values()) {
      if (t.organizationId !== organizationId) continue;
      if (t.machineId !== machineId) continue;

      // Active status check
      if (
        t.status === 'OPEN' ||
        t.status === 'IN_PROGRESS' ||
        t.status === 'REOPENED' ||
        t.status === 'PENDING_VERIFICATION' ||
        t.status === 'PENDING_REVIEW'
      ) {
        const existingQ = normalize(t.originalQuestion);
        if (existingQ === target) {
          return t;
        }

        // Substantial word overlap for the same reported fault event
        const existingWords = new Set(existingQ.split(' ').filter((w) => w.length > 2));
        if (targetWords.size > 0 && existingWords.size > 0) {
          let matches = 0;
          for (const w of targetWords) {
            if (existingWords.has(w)) matches++;
          }
          const overlap = matches / Math.min(targetWords.size, existingWords.size);
          if (overlap >= 0.75) {
            return t;
          }
        }
      }
    }
    return null;
  }

  public async getOperationalAnalytics(
    organizationId: string,
    filters?: OperationalAnalyticsFilterOptions
  ): Promise<OperationalAnalyticsDashboard> {
    const timeWindowDays = filters?.timeWindowDays ?? null;
    const plantFilter = filters?.plantId ?? null;
    const cutoff = timeWindowDays ? Date.now() - timeWindowDays * 24 * 3600 * 1000 : null;

    // Filter tickets by org, plant, and time window
    const tickets = Array.from(this.specialistTickets.values()).filter((t) => {
      if (t.organizationId !== organizationId) return false;
      if (plantFilter && t.plantId !== plantFilter) return false;
      if (cutoff && new Date(t.createdAt).getTime() < cutoff) return false;
      return true;
    });

    let openTicketsCount = 0;
    let inProgressTicketsCount = 0;
    let resolvedTicketsCount = 0;
    let reopenedTicketsCount = 0;
    let unassignedTicketsCount = 0;
    let escalatedTicketsCount = 0;

    const ticketsBySeverity: Record<TicketSeverity, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    const ticketsByStatus: Record<TicketStatus, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING_REVIEW: 0,
      PENDING_VERIFICATION: 0,
      RESOLVED: 0,
      CLOSED: 0,
      UNRESOLVED: 0,
      REOPENED: 0,
    };

    const ticketsByType: Record<string, number> = {};
    const reopenedTickets: SpecialistTicket[] = [];
    const durationsMinutes: number[] = [];

    // Specialist workload aggregator
    const specialistStats = new Map<
      string,
      { specialistName: string; open: number; inProgress: number; resolved: number; overdue: number }
    >();

    const machineTicketStats = new Map<
      string,
      {
        machineId: string;
        assetTag: string;
        name: string;
        plantId: string;
        total: number;
        open: number;
        resolved: number;
        recurring: number;
      }
    >();

    let overdueCasesCount = 0;
    const now = Date.now();
    const OVERDUE_THRESHOLD_MS = 24 * 3600 * 1000; // 24 hours SLA default

    for (const t of tickets) {
      // Status breakdown
      if (ticketsByStatus[t.status] !== undefined) {
        ticketsByStatus[t.status]++;
      }

      if (t.status === 'OPEN') openTicketsCount++;
      if (t.status === 'IN_PROGRESS') inProgressTicketsCount++;
      if (t.status === 'RESOLVED' || t.status === 'CLOSED') resolvedTicketsCount++;
      if (t.assignmentStatus === 'NEEDS_SPECIALIST_ASSIGNMENT') unassignedTicketsCount++;
      if (
        t.assignmentStatus === 'ESCALATED_TRIAGE' ||
        t.escalationReason === 'SAFETY_CRITICAL'
      ) {
        escalatedTicketsCount++;
      }

      // Reopened tracking
      if ((t.reopenCount && t.reopenCount > 0) || t.status === 'REOPENED') {
        reopenedTicketsCount++;
        reopenedTickets.push(t);
      }

      // Severity breakdown
      if (ticketsBySeverity[t.severity] !== undefined) {
        ticketsBySeverity[t.severity]++;
      }

      // Category breakdown
      const catKey = t.faultCategory || 'UNSPECIFIED_MALFUNCTION';
      ticketsByType[catKey] = (ticketsByType[catKey] || 0) + 1;

      // Time-to-Resolution (TTR) calculation:
      // STRICT RULE: Only completed tickets with resolvedAt are included.
      // Unresolved tickets (OPEN, IN_PROGRESS, PENDING_VERIFICATION, REOPENED, UNRESOLVED)
      // are excluded from completed-resolution statistics to prevent skewing!
      if ((t.status === 'RESOLVED' || t.status === 'CLOSED') && t.resolvedAt) {
        const resolvedMs = new Date(t.resolvedAt).getTime();
        const createdMs = new Date(t.createdAt).getTime();
        const diffMinutes = Math.max(0, Math.round((resolvedMs - createdMs) / 60000));
        durationsMinutes.push(diffMinutes);
      }

      // Overdue calculation
      const isCompleted = t.status === 'RESOLVED' || t.status === 'CLOSED';
      const isOverdue = !isCompleted && now - new Date(t.createdAt).getTime() > OVERDUE_THRESHOLD_MS;
      if (isOverdue) overdueCasesCount++;

      // Specialist workload
      if (t.assignedSpecialistUserId) {
        const specId = t.assignedSpecialistUserId;
        if (!specialistStats.has(specId)) {
          specialistStats.set(specId, {
            specialistName: t.assignedSpecialistName || 'Specialist',
            open: 0,
            inProgress: 0,
            resolved: 0,
            overdue: 0,
          });
        }
        const s = specialistStats.get(specId)!;
        if (t.status === 'OPEN') s.open++;
        else if (t.status === 'IN_PROGRESS') s.inProgress++;
        else if (isCompleted) s.resolved++;
        if (isOverdue) s.overdue++;
      }

      // Machine aggregation
      if (t.machineId) {
        const mId = t.machineId;
        if (!machineTicketStats.has(mId)) {
          const mObj = this.machines.get(mId);
          machineTicketStats.set(mId, {
            machineId: mId,
            assetTag: t.machineAssetTag || mObj?.assetTag || 'UNKNOWN',
            name: mObj?.name || t.machineAssetTag || 'Unknown Machine',
            plantId: t.plantId,
            total: 0,
            open: 0,
            resolved: 0,
            recurring: 0,
          });
        }
        const ms = machineTicketStats.get(mId)!;
        ms.total++;
        if (t.status === 'OPEN' || t.status === 'IN_PROGRESS') ms.open++;
        if (isCompleted) ms.resolved++;
      }
    }

    // Exact TTR Mean and Median calculation
    const resolvedTicketsSampleCount = durationsMinutes.length;
    let averageTimeToResolutionMinutes = 0;
    let medianTimeToResolutionMinutes = 0;

    if (resolvedTicketsSampleCount > 0) {
      durationsMinutes.sort((a, b) => a - b);
      const totalDuration = durationsMinutes.reduce((sum, d) => sum + d, 0);
      averageTimeToResolutionMinutes = Number((totalDuration / resolvedTicketsSampleCount).toFixed(2));

      const mid = Math.floor(resolvedTicketsSampleCount / 2);
      if (resolvedTicketsSampleCount % 2 !== 0) {
        medianTimeToResolutionMinutes = durationsMinutes[mid];
      } else {
        medianTimeToResolutionMinutes = Number(
          ((durationsMinutes[mid - 1] + durationsMinutes[mid]) / 2).toFixed(2)
        );
      }
    }

    // Most frequently reported issues
    const totalTicketsCount = tickets.length;
    const mostFrequentlyReportedIssues: IssueFrequencyMetric[] = Object.entries(ticketsByType)
      .map(([faultCategory, count]) => ({
        faultCategory,
        count,
        percentage: totalTicketsCount > 0 ? Number(((count / totalTicketsCount) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Repeated faults from maintenance records
    let repeatedFaultsCount = 0;
    for (const r of this.maintenanceRecords.values()) {
      if (r.organizationId !== organizationId) continue;
      if (plantFilter && r.plantId !== plantFilter) continue;
      if (cutoff && new Date(r.resolvedAt).getTime() < cutoff) continue;
      if (r.isRecurringIncident) {
        repeatedFaultsCount++;
        const ms = machineTicketStats.get(r.machineId);
        if (ms) ms.recurring++;
      }
    }

    // Top affected machines
    const topAffectedMachines: TopAffectedMachineMetric[] = Array.from(machineTicketStats.values())
      .map((m) => ({
        machineId: m.machineId,
        assetTag: m.assetTag,
        machineName: m.name,
        plantId: m.plantId,
        ticketCount: m.total,
        recurringFaultCount: m.recurring,
        openTicketCount: m.open,
        resolvedTicketCount: m.resolved,
      }))
      .sort((a, b) => b.ticketCount - a.ticketCount);

    // Unanswered Copilot questions
    const unansweredQuestionsSample: UnansweredQuestionSample[] = [];
    let unansweredCopilotQuestionsCount = 0;

    for (const msg of this.messages.values()) {
      const conv = this.conversations.get(msg.conversationId);
      if (!conv || conv.organizationId !== organizationId) continue;
      if (plantFilter && conv.plantId !== plantFilter) continue;
      if (cutoff && new Date(msg.createdAt).getTime() < cutoff) continue;

      if (
        msg.senderType === 'ASSISTANT' &&
        (msg.isInsufficientEvidence || msg.confidence === 'INSUFFICIENT_EVIDENCE')
      ) {
        unansweredCopilotQuestionsCount++;
        if (unansweredQuestionsSample.length < 10) {
          // Find preceding user question
          const userMsg = Array.from(this.messages.values()).find(
            (m) => m.conversationId === msg.conversationId && m.senderType === 'USER'
          );
          unansweredQuestionsSample.push({
            conversationId: conv.id,
            query: userMsg?.content || conv.title || 'Inquiry with insufficient evidence',
            createdAt: msg.createdAt,
            plantId: conv.plantId,
            machineAssetTag: conv.assetId || null,
          });
        }
      }
    }

    // Knowledge gaps by machine
    const knowledgeGapsByMachine: KnowledgeGapMetric[] = [];
    for (const machine of this.machines.values()) {
      if (machine.organizationId !== organizationId) continue;
      if (plantFilter && machine.plantId !== plantFilter) continue;

      const isGap =
        machine.documentationReadiness !== 'READY' ||
        machine.verificationState !== 'VERIFIED';

      if (isGap) {
        const missingTasks = Array.from(this.missingInfoTasks.values()).filter(
          (t) => t.machineId === machine.id && t.status !== 'APPROVED'
        );
        const missingFields = missingTasks.flatMap((t) => t.requestedFields);

        const unverifiedClaims = Array.from(this.evidenceClaims.values()).filter(
          (c) => c.machineId === machine.id && c.status !== 'APPROVED'
        );

        knowledgeGapsByMachine.push({
          machineId: machine.id,
          assetTag: machine.assetTag,
          machineName: machine.name,
          documentationReadiness: machine.documentationReadiness,
          missingFields: Array.from(new Set(missingFields)),
          unverifiedClaimsCount: unverifiedClaims.length,
          unansweredQuestionsCount: unansweredQuestionsSample.filter(
            (q) => q.machineAssetTag === machine.assetTag
          ).length,
        });
      }
    }

    // Specialist workloads
    const specialistWorkloads: SpecialistWorkloadMetric[] = Array.from(
      specialistStats.entries()
    ).map(([specialistId, s]) => ({
      specialistId,
      specialistName: s.specialistName,
      openCount: s.open,
      inProgressCount: s.inProgress,
      resolvedCount: s.resolved,
      overdueCount: s.overdue,
    }));

    return {
      timeWindowDays,
      plantFilter,
      generatedAt: new Date().toISOString(),
      totalTickets: totalTicketsCount,
      openTicketsCount,
      inProgressTicketsCount,
      resolvedTicketsCount,
      reopenedTicketsCount,
      unassignedTicketsCount,
      escalatedTicketsCount,
      resolvedTicketsSampleCount,
      averageTimeToResolutionMinutes,
      medianTimeToResolutionMinutes,
      ticketsBySeverity,
      ticketsByStatus,
      ticketsByType,
      mostFrequentlyReportedIssues,
      topAffectedMachines,
      reopenedTickets,
      repeatedFaultsCount,
      unansweredCopilotQuestionsCount,
      unansweredQuestionsSample,
      knowledgeGapsByMachine,
      specialistWorkloads,
      overdueCasesCount,
    };
  }

  // --------------------------------------------------------------------------
  // Persistent Machine Maintenance History & Resolution Records
  // --------------------------------------------------------------------------
  public async createMaintenanceRecord(
    organizationId: string,
    data: CreateMaintenanceRecordDTO
  ): Promise<MaintenanceRecord> {
    if (!organizationId) {
      throw new Error('Validation Error: organizationId is required');
    }
    if (!data.machineId || !data.machineId.trim()) {
      throw new Error('Validation Error: machineId is required');
    }
    if (!data.faultCategory || !data.faultCategory.trim()) {
      throw new Error('Validation Error: faultCategory is required');
    }
    if (!data.problemStatement || !data.problemStatement.trim()) {
      throw new Error('Validation Error: problemStatement is required');
    }
    if (!data.rootCause || !data.rootCause.trim()) {
      throw new Error('Validation Error: rootCause is required');
    }
    if (!data.repairActions || !Array.isArray(data.repairActions) || data.repairActions.length === 0) {
      throw new Error('Validation Error: At least one repairAction is required');
    }

    // Verify machine tenant ownership if machine is registered
    const machine = this.machines.get(data.machineId);
    if (machine && machine.organizationId !== organizationId) {
      throw new Error(`Cross-tenant security violation: Machine ${data.machineId} belongs to another organization.`);
    }

    // Verify plant tenant ownership if plant is registered
    if (data.plantId) {
      const plant = this.plants.get(data.plantId);
      if (plant && plant.organizationId !== organizationId) {
        throw new Error(`Cross-tenant security violation: Plant ${data.plantId} belongs to another organization.`);
      }
    }

    // Verify technician tenant ownership if technician and memberships are registered
    if (data.resolvingTechnicianUserId && this.memberships.size > 0) {
      const isMember = Array.from(this.memberships.values()).some(
        (m) => m.userId === data.resolvingTechnicianUserId && m.organizationId === organizationId
      );
      const userExists = this.users.has(data.resolvingTechnicianUserId);
      if (userExists && !isMember) {
        throw new Error(`Cross-tenant security violation: Resolving technician ${data.resolvingTechnicianUserId} belongs to another organization.`);
      }
    }

    // Verify ticket tenant ownership if ticket is registered
    if (data.ticketId) {
      const ticket = this.specialistTickets.get(data.ticketId);
      if (ticket && ticket.organizationId !== organizationId) {
        throw new Error(`Cross-tenant security violation: Ticket ${data.ticketId} belongs to another organization.`);
      }
    }

    // Verify case tenant ownership if case is registered
    if (data.caseId) {
      const caseItem = this.maintenanceCases.get(data.caseId);
      if (caseItem && caseItem.organizationId !== organizationId) {
        throw new Error(`Cross-tenant security violation: Case ${data.caseId} belongs to another organization.`);
      }
    }

    if (!data.ticketId && !data.caseId) {
      throw new Error('Validation Error: Either ticketId or caseId is required');
    }

    // Duplicate prevention: If a record already exists for this organization and ticketId, return it idempotently
    if (data.ticketId) {
      const existing = Array.from(this.maintenanceRecords.values()).find(
        (r) => r.organizationId === organizationId && r.ticketId === data.ticketId
      );
      if (existing) {
        return existing;
      }
    }

    // Duplicate prevention: If a record already exists for this organization and caseId, return it idempotently
    if (data.caseId) {
      const existing = Array.from(this.maintenanceRecords.values()).find(
        (r) => r.organizationId === organizationId && r.caseId === data.caseId
      );
      if (existing) {
        return existing;
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const resolvedAt = data.resolvedAt || now;
    const recordNumber =
      data.recordNumber ||
      `MR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const priorRecords = Array.from(this.maintenanceRecords.values()).filter(
      (r) =>
        r.organizationId === organizationId &&
        r.machineId === data.machineId &&
        r.faultCategory === data.faultCategory
    );
    const isRecurringIncident = priorRecords.length > 0;
    const recurrenceCount = priorRecords.length + 1;

    const initialAudit: MaintenanceAuditEntry = {
      id: crypto.randomUUID(),
      versionNumber: 1,
      action: 'RECORD_CREATED',
      actorUserId: data.resolvingTechnicianUserId,
      actorName: data.resolvingTechnicianName,
      changes: {
        status: { from: null, to: 'CREATED' },
        rootCauseStatus: { from: null, to: data.rootCauseStatus || 'UNKNOWN' },
      },
      notes: 'Initial maintenance record generated from technician resolution',
      timestamp: now,
    };

    const relatedIncidentRecordIds =
      data.relatedIncidentRecordIds && data.relatedIncidentRecordIds.length > 0
        ? data.relatedIncidentRecordIds
        : priorRecords.map((r) => r.id);

    const requiresRestartApproval = data.requiresRestartApproval ?? false;

    const record: MaintenanceRecord = {
      id,
      recordNumber,
      organizationId,
      plantId: data.plantId,
      machineId: data.machineId,
      machineAssetTag: data.machineAssetTag,
      ticketId: data.ticketId ?? null,
      ticketNumber: data.ticketNumber ?? null,
      caseId: data.caseId ?? null,
      caseNumber: data.caseNumber ?? null,
      componentId: data.componentId ?? null,
      componentName: data.componentName ?? null,
      reportingUserId: data.reportingUserId,
      reportingUserName: data.reportingUserName ?? null,
      assignedTechnicianUserId: data.assignedTechnicianUserId ?? null,
      assignedTechnicianName: data.assignedTechnicianName ?? null,
      resolvingTechnicianUserId: data.resolvingTechnicianUserId,
      resolvingTechnicianName: data.resolvingTechnicianName,
      faultCategory: data.faultCategory,
      problemStatement: data.problemStatement,
      observedSymptoms: data.observedSymptoms ?? [],
      measurements: data.measurements ?? [],
      rootCause: data.rootCause,
      rootCauseStatus: data.rootCauseStatus || 'UNKNOWN',
      repairActions: data.repairActions ?? [],
      partsReplaced: data.partsReplaced ?? [],
      postRepairTestResults: data.postRepairTestResults ?? [],
      verificationState: data.verificationState || 'PENDING',
      verificationNotes: data.verificationNotes ?? null,
      verifiedByUserId: data.verifiedByUserId ?? null,
      verifiedAt: data.verifiedAt ?? null,
      requiresRestartApproval,
      restartApproved: data.restartApproved ?? false,
      restartApprovedByUserId: data.restartApprovedByUserId ?? null,
      restartApprovedAt: data.restartApprovedAt ?? null,
      restartNotes: data.restartNotes ?? null,
      approvalStatus:
        data.approvalStatus ||
        (requiresRestartApproval ? 'PENDING_APPROVAL' : 'NOT_REQUIRED'),
      approvedByUserId: data.approvedByUserId ?? null,
      approvedAt: data.approvedAt ?? null,
      approvalNotes: data.approvalNotes ?? null,
      resolvedAt,
      closedAt: null,
      relatedIncidentRecordIds,
      attachments: data.attachments ?? [],
      recordVersion: 1,
      auditTrail: [initialAudit],
      isRecurringIncident,
      recurrenceCount,
      knowledgeApproved: data.knowledgeApproved ?? false,
      knowledgeApprovedAt: null,
      knowledgeApprovedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.maintenanceRecords.set(id, record);
    return record;
  }

  public async getMaintenanceRecordById(
    organizationId: string,
    id: string
  ): Promise<MaintenanceRecord | null> {
    const record = this.maintenanceRecords.get(id);
    if (!record || record.organizationId !== organizationId) return null;
    return record;
  }

  public async getMaintenanceRecordByNumber(
    organizationId: string,
    recordNumber: string
  ): Promise<MaintenanceRecord | null> {
    for (const r of this.maintenanceRecords.values()) {
      if (r.organizationId === organizationId && r.recordNumber === recordNumber) {
        return r;
      }
    }
    return null;
  }

  public async listMaintenanceRecords(
    organizationId: string,
    filters?: MaintenanceRecordFilterOptions
  ): Promise<MaintenanceRecord[]> {
    let results: MaintenanceRecord[] = [];
    for (const r of this.maintenanceRecords.values()) {
      if (r.organizationId !== organizationId) continue;
      if (filters?.machineId) {
        const cleanId = sanitizeMachineOrAssetId(filters.machineId);
        if (
          r.machineId !== filters.machineId &&
          r.machineId !== cleanId &&
          r.machineAssetTag !== filters.machineId &&
          r.machineAssetTag !== cleanId
        ) {
          continue;
        }
      }
      if (filters?.plantId && r.plantId !== filters.plantId) continue;
      if (filters?.ticketId && r.ticketId !== filters.ticketId) continue;
      if (filters?.caseId && r.caseId !== filters.caseId) continue;
      if (filters?.faultCategory && r.faultCategory !== filters.faultCategory) continue;
      if (filters?.rootCauseStatus && r.rootCauseStatus !== filters.rootCauseStatus) continue;
      if (filters?.verificationState && r.verificationState !== filters.verificationState) continue;
      if (filters?.approvalStatus && r.approvalStatus !== filters.approvalStatus) continue;
      if (
        filters?.requiresRestartApproval !== undefined &&
        r.requiresRestartApproval !== filters.requiresRestartApproval
      ) {
        continue;
      }
      if (
        filters?.restartApproved !== undefined &&
        r.restartApproved !== filters.restartApproved
      ) {
        continue;
      }
      if (filters?.technicianUserId && r.resolvingTechnicianUserId !== filters.technicianUserId) continue;
      if (filters?.isRecurring !== undefined && r.isRecurringIncident !== filters.isRecurring) continue;
      if (filters?.dateFrom && new Date(r.resolvedAt) < new Date(filters.dateFrom)) continue;
      if (filters?.dateTo && new Date(r.resolvedAt) > new Date(filters.dateTo)) continue;
      results.push(r);
    }

    const sortOrder = filters?.sortOrder === 'asc' ? 'asc' : 'desc';
    results.sort((a, b) => {
      const timeDiff = new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime();
      const primary = sortOrder === 'asc' ? -timeDiff : timeDiff;
      if (primary !== 0) return primary;
      return sortOrder === 'asc' ? (a.id || '').localeCompare(b.id || '') : (b.id || '').localeCompare(a.id || '');
    });

    if (filters?.offset !== undefined || filters?.limit !== undefined) {
      const offset = filters?.offset ?? 0;
      const limit = filters?.limit ?? results.length;
      results = results.slice(offset, offset + limit);
    }

    return results;
  }

  public async countMaintenanceRecords(
    organizationId: string,
    filters?: MaintenanceRecordFilterOptions
  ): Promise<number> {
    let count = 0;
    for (const r of this.maintenanceRecords.values()) {
      if (r.organizationId !== organizationId) continue;
      if (filters?.machineId) {
        const cleanId = sanitizeMachineOrAssetId(filters.machineId);
        if (
          r.machineId !== filters.machineId &&
          r.machineId !== cleanId &&
          r.machineAssetTag !== filters.machineId &&
          r.machineAssetTag !== cleanId
        ) {
          continue;
        }
      }
      if (filters?.plantId && r.plantId !== filters.plantId) continue;
      if (filters?.ticketId && r.ticketId !== filters.ticketId) continue;
      if (filters?.caseId && r.caseId !== filters.caseId) continue;
      if (filters?.faultCategory && r.faultCategory !== filters.faultCategory) continue;
      if (filters?.rootCauseStatus && r.rootCauseStatus !== filters.rootCauseStatus) continue;
      if (filters?.verificationState && r.verificationState !== filters.verificationState) continue;
      if (filters?.approvalStatus && r.approvalStatus !== filters.approvalStatus) continue;
      if (
        filters?.requiresRestartApproval !== undefined &&
        r.requiresRestartApproval !== filters.requiresRestartApproval
      ) {
        continue;
      }
      if (
        filters?.restartApproved !== undefined &&
        r.restartApproved !== filters.restartApproved
      ) {
        continue;
      }
      if (filters?.technicianUserId && r.resolvingTechnicianUserId !== filters.technicianUserId) continue;
      if (filters?.isRecurring !== undefined && r.isRecurringIncident !== filters.isRecurring) continue;
      if (filters?.dateFrom && new Date(r.resolvedAt) < new Date(filters.dateFrom)) continue;
      if (filters?.dateTo && new Date(r.resolvedAt) > new Date(filters.dateTo)) continue;
      count++;
    }
    return count;
  }

  public async updateMaintenanceRecord(
    organizationId: string,
    id: string,
    updates: UpdateMaintenanceRecordDTO
  ): Promise<MaintenanceRecord | null> {
    const record = await this.getMaintenanceRecordById(organizationId, id);
    if (!record) return null;

    const now = new Date().toISOString();
    const changes: Record<string, { from: any; to: any }> = {};

    const ALLOWED_UPDATE_KEYS = new Set([
      'observedSymptoms',
      'measurements',
      'rootCause',
      'rootCauseStatus',
      'repairActions',
      'partsReplaced',
      'postRepairTestResults',
      'verificationState',
      'verificationNotes',
      'verifiedByUserId',
      'verifiedAt',
      'requiresRestartApproval',
      'restartApproved',
      'restartApprovedByUserId',
      'restartApprovedAt',
      'restartNotes',
      'approvalStatus',
      'approvedByUserId',
      'approvedAt',
      'approvalNotes',
      'closedAt',
      'relatedIncidentRecordIds',
      'attachments',
      'knowledgeApproved',
    ]);

    for (const [key, val] of Object.entries(updates)) {
      if (!ALLOWED_UPDATE_KEYS.has(key)) continue;
      if (val !== undefined && (record as any)[key] !== val) {
        changes[key] = { from: (record as any)[key], to: val };
        (record as any)[key] = val;
      }
    }

    record.recordVersion += 1;
    record.auditTrail.push({
      id: crypto.randomUUID(),
      versionNumber: record.recordVersion,
      action: 'RECORD_UPDATED',
      actorUserId: updates.actorUserId,
      changes,
      notes: updates.note || 'Maintenance record updated with versioned audit trail',
      timestamp: now,
    });
    record.updatedAt = now;

    this.maintenanceRecords.set(id, record);
    return record;
  }

  public async getMachineMaintenanceHistory(
    organizationId: string,
    machineId: string
  ): Promise<MaintenanceRecord[]> {
    const cleanId = sanitizeMachineOrAssetId(machineId);
    return this.listMaintenanceRecords(organizationId, { machineId: cleanId });
  }

  // --------------------------------------------------------------------------
  // Recurring Fault Intelligence & Safety Limits
  // --------------------------------------------------------------------------
  public async setRecurringFaultPolicy(
    organizationId: string,
    data: SetRecurringFaultPolicyDTO
  ): Promise<RecurringFaultThresholdConfig> {
    const key = `${organizationId}:${data.machineId || 'DEFAULT'}:${data.machineType || 'ALL'}`;
    const config: RecurringFaultThresholdConfig = {
      machineType: data.machineType || 'ALL',
      faultCategory: undefined,
      timeWindowDays: data.timeWindowDays ?? 30,
      recurrenceCountThreshold: data.recurrenceCountThreshold ?? 2,
      requiresSafetyStop: data.requiresSafetyStop ?? false,
      safetyLimits: data.safetyLimits,
    };
    this.recurringFaultPolicies.set(key, config);
    return config;
  }

  public async getRecurringFaultPolicy(
    organizationId: string,
    machineId: string,
    machineType?: string
  ): Promise<RecurringFaultThresholdConfig> {
    const machineKey = `${organizationId}:${machineId}:${machineType || 'ALL'}`;
    if (this.recurringFaultPolicies.has(machineKey)) {
      return this.recurringFaultPolicies.get(machineKey)!;
    }
    const machineAnyKey = `${organizationId}:${machineId}:ALL`;
    if (this.recurringFaultPolicies.has(machineAnyKey)) {
      return this.recurringFaultPolicies.get(machineAnyKey)!;
    }

    if (machineType) {
      const typeKey = `${organizationId}:DEFAULT:${machineType}`;
      if (this.recurringFaultPolicies.has(typeKey)) {
        return this.recurringFaultPolicies.get(typeKey)!;
      }
    }

    const orgKey = `${organizationId}:DEFAULT:ALL`;
    if (this.recurringFaultPolicies.has(orgKey)) {
      return this.recurringFaultPolicies.get(orgKey)!;
    }

    return {
      machineType: machineType || 'ALL',
      timeWindowDays: 30,
      recurrenceCountThreshold: 2,
      requiresSafetyStop: false,
      safetyLimits: {
        maxTemperatureC: 85,
        maxVibrationMmS: 7.1,
        maxPressureBar: 25,
      },
    };
  }

  public async detectRecurringFaults(
    organizationId: string,
    machineId: string,
    options?: RecurringFaultOptions
  ): Promise<RecurringFaultAnalysis> {
    const machine = this.machines.get(machineId);
    const assetTag = machine?.assetTag || 'UNKNOWN';
    const policy = await this.getRecurringFaultPolicy(
      organizationId,
      machineId,
      machine?.machineType
    );

    const windowDays = options?.timeWindowDays ?? policy.timeWindowDays ?? 30;
    const threshold =
      options?.recurrenceCountThreshold ?? policy.recurrenceCountThreshold ?? 2;

    const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
    const allRecords = await this.getMachineMaintenanceHistory(organizationId, machineId);
    const windowRecords = allRecords.filter((r) => new Date(r.resolvedAt) >= cutoff);

    const categoryCounts: Record<string, MaintenanceRecord[]> = {};
    for (const r of windowRecords) {
      if (!categoryCounts[r.faultCategory]) {
        categoryCounts[r.faultCategory] = [];
      }
      categoryCounts[r.faultCategory].push(r);
    }

    let dominantCategory = 'GENERAL_MALFUNCTION';
    let maxCategoryRecords: MaintenanceRecord[] = [];

    for (const [cat, recs] of Object.entries(categoryCounts)) {
      if (recs.length > maxCategoryRecords.length) {
        dominantCategory = cat;
        maxCategoryRecords = recs;
      }
    }

    if (maxCategoryRecords.length === 0 && allRecords.length > 0) {
      dominantCategory = allRecords[0].faultCategory;
      maxCategoryRecords = [allRecords[0]];
    }

    const recurrenceCount = maxCategoryRecords.length;
    const isRecurringFault = recurrenceCount >= threshold;

    const confirmedRootCauses: string[] = [];
    const suspectedRootCauses: string[] = [];
    let unknownRootCauseCount = 0;

    for (const r of maxCategoryRecords) {
      if (r.rootCauseStatus === 'CONFIRMED' && !confirmedRootCauses.includes(r.rootCause)) {
        confirmedRootCauses.push(r.rootCause);
      } else if (
        r.rootCauseStatus === 'SUSPECTED' &&
        !suspectedRootCauses.includes(r.rootCause)
      ) {
        suspectedRootCauses.push(r.rootCause);
      } else if (r.rootCauseStatus === 'UNKNOWN') {
        unknownRootCauseCount++;
      }
    }

    let exceededLimitWarning: string | null = null;
    let limitExceeded = false;

    if (policy.safetyLimits) {
      for (const r of maxCategoryRecords) {
        for (const m of r.measurements) {
          if (
            policy.safetyLimits.maxTemperatureC !== undefined &&
            (m.parameterName.toLowerCase().includes('temp') || m.unit === 'degC') &&
            m.value >= policy.safetyLimits.maxTemperatureC
          ) {
            limitExceeded = true;
            exceededLimitWarning = `[MANDATORY SAFETY STOP / HOLD] Temperature reading of ${m.value}${m.unit} exceeds verified threshold of ${policy.safetyLimits.maxTemperatureC}degC (source: ${m.source}).`;
            break;
          }
          if (
            policy.safetyLimits.maxVibrationMmS !== undefined &&
            (m.parameterName.toLowerCase().includes('vib') || m.unit === 'mm/s') &&
            m.value >= policy.safetyLimits.maxVibrationMmS
          ) {
            limitExceeded = true;
            exceededLimitWarning = `[MANDATORY SAFETY STOP / HOLD] Vibration reading of ${m.value}${m.unit} exceeds verified threshold of ${policy.safetyLimits.maxVibrationMmS}mm/s (source: ${m.source}).`;
            break;
          }
          if (
            policy.safetyLimits.maxPressureBar !== undefined &&
            (m.parameterName.toLowerCase().includes('press') || m.unit === 'bar') &&
            m.value >= policy.safetyLimits.maxPressureBar
          ) {
            limitExceeded = true;
            exceededLimitWarning = `[MANDATORY SAFETY STOP / HOLD] Pressure reading of ${m.value}${m.unit} exceeds verified threshold of ${policy.safetyLimits.maxPressureBar}bar (source: ${m.source}).`;
            break;
          }
        }
        if (limitExceeded) break;
      }
    }

    const isSafetyCritical =
      limitExceeded ||
      policy.requiresSafetyStop ||
      dominantCategory.includes('OVERHEAT') ||
      dominantCategory.includes('PRESSURE') ||
      dominantCategory.includes('BEARING');

    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
    if (recurrenceCount >= threshold && confirmedRootCauses.length > 0) {
      confidence = 'HIGH';
    } else if (recurrenceCount >= threshold) {
      confidence = 'MEDIUM';
    } else if (recurrenceCount === 1) {
      confidence = 'LOW';
    } else {
      confidence = 'INSUFFICIENT_DATA';
    }

    const incidentTimeline = maxCategoryRecords.map((r) => ({
      recordId: r.id,
      recordNumber: r.recordNumber,
      ticketNumber: r.ticketNumber || r.caseNumber || 'N/A',
      resolvedAt: r.resolvedAt,
      faultCategory: r.faultCategory,
      rootCause: r.rootCause,
      rootCauseStatus: r.rootCauseStatus,
      repairActions: r.repairActions,
      measurements: r.measurements,
      isResolved: r.verificationState === 'PASSED',
    }));

    const evidenceSummary =
      isRecurringFault
        ? `Identified ${recurrenceCount} recurring incidents for fault category "${dominantCategory}" on asset ${assetTag} within the ${windowDays}-day monitoring window. Confirmed root causes: ${confirmedRootCauses.join(', ') || 'None'}. Suspected causes: ${suspectedRootCauses.join(', ') || 'None'}. Unknown causes: ${unknownRootCauseCount}.`
        : `Normal fault baseline: ${recurrenceCount} incident(s) detected within ${windowDays} days (configured threshold: ${threshold}).`;

    const recommendedInspectionSteps: string[] = [];
    if (isSafetyCritical) {
      recommendedInspectionSteps.push('Execute verified lock-out/tag-out (LOTO) procedure.');
      recommendedInspectionSteps.push('Check thermal gradient and bearing lubrication condition with calibrated tools.');
      recommendedInspectionSteps.push('Verify sensor telemetry calibrations against physical gauge readings.');
      recommendedInspectionSteps.push('Obtain supervisory restart approval before returning unit to active service.');
    } else {
      recommendedInspectionSteps.push('Inspect mechanical couplings and verify alignment tolerances.');
      recommendedInspectionSteps.push('Review technician repair logs and verify component replacement serials.');
    }

    let averageRecurrenceIntervalDays: number | null = null;
    if (maxCategoryRecords.length > 1) {
      const sortedDates = maxCategoryRecords
        .map((r) => new Date(r.resolvedAt).getTime())
        .sort((a, b) => a - b);
      let totalDiffDays = 0;
      for (let i = 1; i < sortedDates.length; i++) {
        totalDiffDays += (sortedDates[i] - sortedDates[i - 1]) / (24 * 3600 * 1000);
      }
      averageRecurrenceIntervalDays = Number(
        (totalDiffDays / (sortedDates.length - 1)).toFixed(1)
      );
    }

    let priorRepairEffectiveness: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE' | 'UNVERIFIED' =
      'EFFECTIVE';
    if (isRecurringFault) {
      if (unknownRootCauseCount > 0 || (averageRecurrenceIntervalDays !== null && averageRecurrenceIntervalDays < 14)) {
        priorRepairEffectiveness = 'INEFFECTIVE';
      } else {
        priorRepairEffectiveness = 'PARTIALLY_EFFECTIVE';
      }
    } else if (recurrenceCount === 0) {
      priorRepairEffectiveness = 'UNVERIFIED';
    }

    return {
      machineId,
      machineAssetTag: assetTag,
      isRecurringFault,
      recurrenceCount,
      faultCategory: dominantCategory,
      componentId: maxCategoryRecords[0]?.componentId ?? null,
      incidentTimeline,
      relatedRecordIds: maxCategoryRecords.map((r) => r.id),
      confirmedRootCauses,
      suspectedRootCauses,
      unknownRootCauseCount,
      confidence,
      evidenceSummary,
      recommendedInspectionSteps,
      isSafetyCritical,
      safetyWarning: exceededLimitWarning,
      requiresSafetyHold: limitExceeded || (isRecurringFault && policy.requiresSafetyStop),
      requiresRestartApproval: isSafetyCritical,
      priorRepairEffectiveness,
      averageRecurrenceIntervalDays,
      intelligenceSource: 'HISTORICAL_MAINTENANCE_RECORDS',
      patternDisclaimer:
        'Historical pattern intelligence is derived strictly from durable maintenance records. It does not constitute real-time sensor predictive maintenance.',
    };
  }

  // --------------------------------------------------------------------------
  // Ticket Resolution & Lifecycle Actions
  // --------------------------------------------------------------------------
  public async resolveSpecialistTicket(
    organizationId: string,
    ticketId: string,
    resolution: ResolveSpecialistTicketDTO
  ): Promise<{ ticket: SpecialistTicket; record: MaintenanceRecord }> {
    const ticket = await this.getSpecialistTicketById(organizationId, ticketId);
    if (!ticket) {
      throw new Error(`Specialist ticket ${ticketId} not found in organization ${organizationId}`);
    }

    const now = new Date().toISOString();
    let verificationState: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' = 'PENDING';

    const hasTests = resolution.postRepairTestResults && resolution.postRepairTestResults.length > 0;
    if (hasTests) {
      const allPassed = resolution.postRepairTestResults!.every((t) => t.passed);
      verificationState = allPassed ? 'PASSED' : 'FAILED';
    }

    const isSafetyRelated =
      ticket.escalationReason === 'SAFETY_CRITICAL' ||
      ticket.severity === 'CRITICAL' ||
      resolution.faultCategory.includes('OVERHEAT') ||
      resolution.faultCategory.includes('PRESSURE') ||
      resolution.faultCategory.includes('ELECTRICAL_HAZARD');

    // Rule: Do not mark a safety-critical repair as fully verified without required checks
    if (isSafetyRelated) {
      if (!hasTests || verificationState !== 'PASSED') {
        if (resolution.verificationState === 'PASSED') {
          throw new Error(
            'Safety-critical repair cannot be marked as fully verified (PASSED) without passing post-repair test results.'
          );
        }
        verificationState = hasTests && !resolution.postRepairTestResults!.every((t) => t.passed) ? 'FAILED' : 'PENDING';
      }
    } else if (resolution.verificationState) {
      verificationState = resolution.verificationState;
    }

    const requiresRestartApproval =
      resolution.requiresRestartApproval !== undefined
        ? resolution.requiresRestartApproval
        : isSafetyRelated;

    let newStatus: TicketStatus = 'RESOLVED';
    if (verificationState === 'FAILED') {
      newStatus = 'UNRESOLVED' as any;
    } else if (requiresRestartApproval) {
      newStatus = 'PENDING_VERIFICATION' as any;
    } else {
      newStatus = 'RESOLVED';
    }

    // Idempotency check: If ticket is already resolved and has linked record, return existing
    if ((ticket.status === 'RESOLVED' || ticket.status === 'PENDING_VERIFICATION') && ticket.maintenanceRecordId) {
      const existingRecord = await this.getMaintenanceRecordById(organizationId, ticket.maintenanceRecordId);
      if (existingRecord) {
        return { ticket, record: existingRecord };
      }
    }

    // If resolving after ticket reopening, update existing maintenance record rather than creating a duplicate
    let record: MaintenanceRecord;
    if (ticket.maintenanceRecordId) {
      const existingRecord = await this.getMaintenanceRecordById(organizationId, ticket.maintenanceRecordId);
      if (existingRecord) {
        const updated = await this.updateMaintenanceRecord(organizationId, ticket.maintenanceRecordId, {
          observedSymptoms: resolution.observedSymptoms ?? [],
          measurements: resolution.measurements ?? [],
          rootCause: resolution.rootCause,
          rootCauseStatus: resolution.rootCauseStatus,
          repairActions: resolution.repairActions,
          partsReplaced: resolution.partsReplaced ?? [],
          postRepairTestResults: resolution.postRepairTestResults ?? [],
          verificationState,
          requiresRestartApproval,
          restartApproved: false,
          approvalStatus: requiresRestartApproval ? 'PENDING_APPROVAL' : 'NOT_REQUIRED',
          actorUserId: resolution.resolvingTechnicianUserId,
          note: `Resolution re-applied after ticket reopening: ${resolution.notes || ''}`,
        });
        record = updated || existingRecord;
      } else {
        record = await this.createMaintenanceRecord(organizationId, {
          plantId: ticket.plantId,
          machineId: ticket.machineId || '',
          machineAssetTag: ticket.machineAssetTag || 'UNKNOWN',
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          componentId: null,
          reportingUserId: ticket.reportedByUserId,
          reportingUserName: ticket.reportedByUserName,
          assignedTechnicianUserId: ticket.assignedSpecialistUserId,
          assignedTechnicianName: ticket.assignedSpecialistName,
          resolvingTechnicianUserId: resolution.resolvingTechnicianUserId,
          resolvingTechnicianName: resolution.resolvingTechnicianName,
          faultCategory: resolution.faultCategory,
          problemStatement: ticket.originalQuestion,
          observedSymptoms: resolution.observedSymptoms ?? [],
          measurements: resolution.measurements ?? [],
          rootCause: resolution.rootCause,
          rootCauseStatus: resolution.rootCauseStatus,
          repairActions: resolution.repairActions,
          partsReplaced: resolution.partsReplaced ?? [],
          postRepairTestResults: resolution.postRepairTestResults ?? [],
          verificationState,
          requiresRestartApproval,
          restartApproved: false,
          approvalStatus: requiresRestartApproval ? 'PENDING_APPROVAL' : 'NOT_REQUIRED',
        });
      }
    } else {
      record = await this.createMaintenanceRecord(organizationId, {
        plantId: ticket.plantId,
        machineId: ticket.machineId || '',
        machineAssetTag: ticket.machineAssetTag || 'UNKNOWN',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        componentId: null,
        reportingUserId: ticket.reportedByUserId,
        reportingUserName: ticket.reportedByUserName,
        assignedTechnicianUserId: ticket.assignedSpecialistUserId,
        assignedTechnicianName: ticket.assignedSpecialistName,
        resolvingTechnicianUserId: resolution.resolvingTechnicianUserId,
        resolvingTechnicianName: resolution.resolvingTechnicianName,
        faultCategory: resolution.faultCategory,
        problemStatement: ticket.originalQuestion,
        observedSymptoms: resolution.observedSymptoms ?? [],
        measurements: resolution.measurements ?? [],
        rootCause: resolution.rootCause,
        rootCauseStatus: resolution.rootCauseStatus,
        repairActions: resolution.repairActions,
        partsReplaced: resolution.partsReplaced ?? [],
        postRepairTestResults: resolution.postRepairTestResults ?? [],
        verificationState,
        requiresRestartApproval,
        restartApproved: false,
        approvalStatus: requiresRestartApproval ? 'PENDING_APPROVAL' : 'NOT_REQUIRED',
      });
    }

    const previousStatus = ticket.status;
    ticket.status = newStatus;
    ticket.faultCategory = resolution.faultCategory;
    ticket.rootCause = resolution.rootCause;
    ticket.rootCauseStatus = resolution.rootCauseStatus;
    ticket.maintenanceRecordId = record.id;
    ticket.requiresRestartApproval = requiresRestartApproval;
    ticket.restartApproved = false;
    ticket.technicianObservations = resolution.observedSymptoms?.join(', ') || null;
    ticket.repairOutcome = `Actions: ${resolution.repairActions.join('; ')}. Verification: ${verificationState}.`;

    if (newStatus === 'RESOLVED') {
      ticket.resolvedAt = now;
      ticket.resolvedByUserId = resolution.resolvingTechnicianUserId;
    }

    ticket.history.push({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorUserId: resolution.resolvingTechnicianUserId,
      action: 'TICKET_RESOLVED',
      previousStatus,
      newStatus,
      notes:
        resolution.notes ||
        `Resolution logged. Root cause [${resolution.rootCauseStatus}]: ${resolution.rootCause}. Verification: ${verificationState}. Requires restart approval: ${requiresRestartApproval}`,
      timestamp: now,
    });
    ticket.updatedAt = now;

    this.specialistTickets.set(ticket.id, ticket);
    return { ticket, record };
  }

  public async reopenSpecialistTicket(
    organizationId: string,
    ticketId: string,
    data: ReopenSpecialistTicketDTO
  ): Promise<{ ticket: SpecialistTicket; record?: MaintenanceRecord | null }> {
    const ticket = await this.getSpecialistTicketById(organizationId, ticketId);
    if (!ticket) {
      throw new Error(`Specialist ticket ${ticketId} not found in organization ${organizationId}`);
    }

    const now = new Date().toISOString();
    const previousStatus = ticket.status;
    ticket.status = 'REOPENED';
    ticket.reopenCount = (ticket.reopenCount || 0) + 1;
    ticket.reopenedAt = now;
    ticket.reopenedByUserId = data.actorUserId;
    ticket.resolvedAt = null;
    ticket.resolvedByUserId = null;

    ticket.history.push({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorUserId: data.actorUserId,
      action: 'TICKET_REOPENED',
      previousStatus,
      newStatus: 'REOPENED',
      notes: `Ticket reopened (reopen #${ticket.reopenCount}): ${data.reopenReason}`,
      timestamp: now,
    });
    ticket.updatedAt = now;
    this.specialistTickets.set(ticket.id, ticket);

    let record: MaintenanceRecord | null = null;
    if (ticket.maintenanceRecordId) {
      record = await this.updateMaintenanceRecord(organizationId, ticket.maintenanceRecordId, {
        actorUserId: data.actorUserId,
        verificationState: 'FAILED',
        note: `Ticket reopened due to recurring or unresolved issue: ${data.reopenReason}`,
      });
    }

    return { ticket, record };
  }

  public async approveTicketRestart(
    organizationId: string,
    ticketId: string,
    data: ApproveTicketRestartDTO
  ): Promise<{ ticket: SpecialistTicket; record?: MaintenanceRecord | null }> {
    const ticket = await this.getSpecialistTicketById(organizationId, ticketId);
    if (!ticket) {
      throw new Error(`Specialist ticket ${ticketId} not found in organization ${organizationId}`);
    }

    const now = new Date().toISOString();
    const previousStatus = ticket.status;

    ticket.restartApproved = true;
    ticket.restartApprovedByUserId = data.actorUserId;
    ticket.restartApprovedAt = now;
    if (ticket.status === 'PENDING_VERIFICATION') {
      ticket.status = 'RESOLVED';
      ticket.resolvedAt = now;
      ticket.resolvedByUserId = data.actorUserId;
    }

    ticket.history.push({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorUserId: data.actorUserId,
      action: 'RESTART_APPROVED',
      previousStatus,
      newStatus: ticket.status,
      notes:
        data.notes ||
        `Restart authorized by supervisor (${data.actorName || data.actorUserId}). Verified safe for operation.`,
      timestamp: now,
    });
    ticket.updatedAt = now;
    this.specialistTickets.set(ticket.id, ticket);

    let record: MaintenanceRecord | null = null;
    if (ticket.maintenanceRecordId) {
      record = await this.updateMaintenanceRecord(organizationId, ticket.maintenanceRecordId, {
        actorUserId: data.actorUserId,
        restartApproved: true,
        restartApprovedByUserId: data.actorUserId,
        restartApprovedAt: now,
        restartNotes: data.notes || 'Restart authorized after physical inspection',
        approvalStatus: 'APPROVED',
        approvedByUserId: data.actorUserId,
        approvedAt: now,
        verificationState: 'PASSED',
        note: 'Restart approved and verification confirmed',
      });
    }

    return { ticket, record };
  }

  // ============================================================================
  // Confidential Access Monitoring & Admin Security Alerts
  // ============================================================================

  public async recordSecurityEvent(dto: CreateSecurityEventDTO): Promise<SecurityEvent> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const isBenign =
      dto.isBenignInquiry !== undefined
        ? dto.isBenignInquiry
        : dto.decision === 'DENIED' && dto.severity !== 'CRITICAL' && dto.severity !== 'HIGH';

    const event: SecurityEvent = {
      id,
      organizationId: dto.organizationId,
      actorUserId: dto.actorUserId ?? null,
      actorEmail: dto.actorEmail ?? null,
      actorRole: dto.actorRole ?? null,
      timestamp: now,
      category: dto.category,
      action: dto.action,
      resourceCategory: dto.resourceCategory,
      resourceId: dto.resourceId ?? null,
      decision: dto.decision,
      policyReasonCode: dto.policyReasonCode,
      severity: dto.severity,
      correlationId: dto.correlationId ?? null,
      metadata: dto.metadata ?? {},
      reviewStatus: 'OPEN',
      assignedReviewerUserId: null,
      reviewNotes: null,
      resolvedAt: null,
      resolvedByUserId: null,
      isBenignInquiry: isBenign,
    };

    this.securityEvents.set(id, event);
    return event;
  }

  public async listSecurityEvents(
    organizationId: string,
    filter?: ListSecurityEventsQuery
  ): Promise<{ events: SecurityEvent[]; total: number }> {
    let all = Array.from(this.securityEvents.values()).filter(
      (e) => e.organizationId === organizationId
    );

    if (filter?.category) {
      all = all.filter((e) => e.category === filter.category);
    }
    if (filter?.actorUserId) {
      all = all.filter((e) => e.actorUserId === filter.actorUserId);
    }
    if (filter?.decision) {
      all = all.filter((e) => e.decision === filter.decision);
    }
    if (filter?.severity) {
      all = all.filter((e) => e.severity === filter.severity);
    }
    if (filter?.reviewStatus) {
      all = all.filter((e) => e.reviewStatus === filter.reviewStatus);
    }

    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const paged = all.slice(offset, offset + limit);

    return { events: paged, total };
  }

  public async getSecurityEventById(
    organizationId: string,
    eventId: string
  ): Promise<SecurityEvent | null> {
    const event = this.securityEvents.get(eventId);
    if (!event || event.organizationId !== organizationId) return null;
    return event;
  }

  public async createSecurityAlert(dto: CreateSecurityAlertDTO): Promise<SecurityAlert> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const alert: SecurityAlert = {
      id,
      organizationId: dto.organizationId,
      alertType: dto.alertType,
      severity: dto.severity,
      status: 'OPEN',
      title: dto.title,
      summary: dto.summary,
      actorUserId: dto.actorUserId ?? null,
      actorEmail: dto.actorEmail ?? null,
      actorRole: dto.actorRole ?? null,
      resourceCategory: dto.resourceCategory,
      resourceId: dto.resourceId ?? null,
      eventCount: dto.correlatedEventIds && dto.correlatedEventIds.length > 0 ? dto.correlatedEventIds.length : 1,
      firstSeenAt: now,
      lastSeenAt: now,
      correlatedEventIds: dto.correlatedEventIds ?? [],
      assignedReviewerUserId: null,
      reviewNotes: null,
      resolutionOutcome: null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.securityAlerts.set(id, alert);
    return alert;
  }

  public async updateSecurityAlert(
    organizationId: string,
    alertId: string,
    updates: Partial<SecurityAlert>
  ): Promise<SecurityAlert | null> {
    const existing = this.securityAlerts.get(alertId);
    if (!existing || existing.organizationId !== organizationId) return null;

    const updated: SecurityAlert = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.securityAlerts.set(alertId, updated);
    return updated;
  }

  public async listSecurityAlerts(
    organizationId: string,
    filter?: ListSecurityAlertsQuery
  ): Promise<{ alerts: SecurityAlert[]; total: number }> {
    let all = Array.from(this.securityAlerts.values()).filter(
      (a) => a.organizationId === organizationId
    );

    if (filter?.status) {
      all = all.filter((a) => a.status === filter.status);
    }
    if (filter?.severity) {
      all = all.filter((a) => a.severity === filter.severity);
    }
    if (filter?.alertType) {
      all = all.filter((a) => a.alertType === filter.alertType);
    }
    if (filter?.actorUserId) {
      all = all.filter((a) => a.actorUserId === filter.actorUserId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      all = all.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          (a.actorEmail && a.actorEmail.toLowerCase().includes(q))
      );
    }

    all.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const paged = all.slice(offset, offset + limit);

    return { alerts: paged, total };
  }

  public async getSecurityAlertById(
    organizationId: string,
    alertId: string
  ): Promise<SecurityAlert | null> {
    const alert = this.securityAlerts.get(alertId);
    if (!alert || alert.organizationId !== organizationId) return null;
    return alert;
  }

  public async findOpenAlertForActorAndType(
    organizationId: string,
    actorUserId: string,
    alertType: string
  ): Promise<SecurityAlert | null> {
    for (const a of this.securityAlerts.values()) {
      if (
        a.organizationId === organizationId &&
        a.actorUserId === actorUserId &&
        a.alertType === alertType &&
        a.status === 'OPEN'
      ) {
        return a;
      }
    }
    return null;
  }

  // ============================================================================
  // Machine Knowledge Recovery System (Phase 3)
  // ============================================================================

  public async createEvidenceClaim(
    organizationId: string,
    dto: CreateEvidenceClaimDTO & { submittedByUserId: string; submittedByEmail?: string }
  ): Promise<MachineEvidenceClaim> {
    const machine = await this.getMachineById(organizationId, dto.machineId);
    if (!machine) {
      throw new Error(`Machine '${dto.machineId}' not found in organization.`);
    }

    const claimId = crypto.randomUUID();
    const isSafetyCritical =
      dto.isSafetyCritical !== undefined
        ? dto.isSafetyCritical
        : /\b(pressure|voltage|current|torque|loto|lockout|safety|mawp|temperature|relief|speed|rpm)\b/i.test(
            dto.fieldName
          );

    const initialAudit: ClaimAuditEntry = {
      action: 'SUBMITTED_FOR_REVIEW',
      actorUserId: dto.submittedByUserId,
      actorEmail: dto.submittedByEmail || null,
      timestamp: new Date().toISOString(),
      notes: 'Initial evidence collected and submitted for qualified engineering review',
    };

    const claim: MachineEvidenceClaim = {
      id: claimId,
      organizationId,
      plantId: machine.plantId,
      machineId: machine.id,
      machineAssetTag: machine.assetTag,
      fieldName: dto.fieldName,
      displayName: dto.displayName || dto.fieldName,
      claimValue: dto.claimValue,
      unit: dto.unit || null,
      sourceType: dto.sourceType,
      sourceDocumentId: dto.sourceDocumentId || null,
      sourceAttachmentKey: dto.sourceAttachmentKey || null,
      sourcePageNumber: dto.sourcePageNumber || null,
      sourceRegion: dto.sourceRegion || null,
      sourceRevision: dto.sourceRevision || null,
      sourceDate: dto.sourceDate || null,
      extractionMethod: dto.extractionMethod,
      confidence: dto.confidence || 'MEDIUM',
      applicabilityStatus: dto.applicabilityStatus || 'UNCERTAIN',
      applicabilityRationale: dto.applicabilityRationale || null,
      status: 'AWAITING_REVIEW', // Never auto-approved!
      submittedByUserId: dto.submittedByUserId,
      submittedByEmail: dto.submittedByEmail || null,
      submittedAt: new Date().toISOString(),
      reviewedByUserId: null,
      reviewedByEmail: null,
      reviewedAt: null,
      reviewNotes: null,
      reviewRationale: null,
      reviewerQualifications: null,
      supersededByClaimId: null,
      supersedesClaimId: null,
      isSafetyCritical,
      version: 1,
      auditTrail: [initialAudit],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.evidenceClaims.set(claimId, claim);
    return claim;
  }

  public async getEvidenceClaimById(
    organizationId: string,
    claimId: string
  ): Promise<MachineEvidenceClaim | null> {
    const claim = this.evidenceClaims.get(claimId);
    if (!claim || claim.organizationId !== organizationId) return null;
    return claim;
  }

  public async listEvidenceClaims(
    organizationId: string,
    filters?: ClaimFilterOptions
  ): Promise<MachineEvidenceClaim[]> {
    const res: MachineEvidenceClaim[] = [];
    for (const claim of this.evidenceClaims.values()) {
      if (claim.organizationId !== organizationId) continue;
      if (filters?.machineId) {
        const cleanId = sanitizeMachineOrAssetId(filters.machineId);
        if (
          claim.machineId !== filters.machineId &&
          claim.machineId !== cleanId &&
          claim.machineAssetTag !== filters.machineId &&
          claim.machineAssetTag !== cleanId
        ) {
          continue;
        }
      }
      if (filters?.plantId && claim.plantId !== filters.plantId) continue;
      if (filters?.status && claim.status !== filters.status) continue;
      if (filters?.fieldName && claim.fieldName.toLowerCase() !== filters.fieldName.toLowerCase()) continue;
      if (filters?.isSafetyCritical !== undefined && claim.isSafetyCritical !== filters.isSafetyCritical) continue;
      if (filters?.submittedByUserId && claim.submittedByUserId !== filters.submittedByUserId) continue;
      res.push(claim);
    }
    res.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res;
  }

  public async reviewEvidenceClaim(
    organizationId: string,
    claimId: string,
    review: ReviewEvidenceClaimDTO & { reviewedByUserId: string; reviewedByEmail?: string; actorRole?: string }
  ): Promise<MachineEvidenceClaim> {
    const claim = await this.getEvidenceClaimById(organizationId, claimId);
    if (!claim) {
      throw new Error(`Evidence claim '${claimId}' not found.`);
    }

    // Anti-self-approval rule: Technicians cannot approve their own submissions unless explicitly admin
    if (claim.submittedByUserId === review.reviewedByUserId) {
      const isSuperUser =
        review.actorRole === 'ORGANIZATION_ADMIN' || review.actorRole === 'ORGANIZATION_OWNER';
      if (!isSuperUser) {
        throw new Error(
          'Anti-self-approval violation: Technicians cannot approve their own submissions without explicit administrator authorization.'
        );
      }
    }

    // Role check: Only engineers, plant managers, or admins can review claims
    const reviewerRole = review.actorRole || 'ENGINEER_TECHNICIAN';
    const isAuthorizedReviewer =
      reviewerRole === 'ORGANIZATION_ADMIN' ||
      reviewerRole === 'ORGANIZATION_OWNER' ||
      reviewerRole === 'PLANT_MANAGER' ||
      reviewerRole === 'ENGINEER_TECHNICIAN';
    if (!isAuthorizedReviewer) {
      throw new Error('Unauthorized: Reviewer role has insufficient privileges to review machine knowledge claims.');
    }

    const now = new Date().toISOString();

    if (review.decision === 'APPROVE') {
      if (!review.reviewRationale || review.reviewRationale.trim().length < 5) {
        throw new Error('Approval requires a valid, substantive engineering review rationale.');
      }
      if (claim.isSafetyCritical && (!review.reviewerQualifications || review.reviewerQualifications.trim().length < 3)) {
        throw new Error('Safety-critical specifications require verified reviewer engineering qualifications.');
      }

      // Check for prior approved claim for same machine & field: supersede it
      for (const other of this.evidenceClaims.values()) {
        if (
          other.organizationId === organizationId &&
          other.machineId === claim.machineId &&
          other.fieldName.toLowerCase() === claim.fieldName.toLowerCase() &&
          other.id !== claim.id &&
          other.status === 'APPROVED'
        ) {
          other.status = 'SUPERSEDED';
          other.supersededByClaimId = claim.id;
          other.updatedAt = now;
          other.auditTrail.push({
            action: 'SUPERSEDED',
            actorUserId: review.reviewedByUserId,
            actorEmail: review.reviewedByEmail || null,
            actorRole: reviewerRole,
            timestamp: now,
            notes: `Superseded by newly approved claim ${claim.id} (Value: ${claim.claimValue})`,
          });
          claim.supersedesClaimId = other.id;
        }
      }

      if (review.correctedValue !== undefined) {
        claim.claimValue = review.correctedValue;
        if (review.correctedUnit) claim.unit = review.correctedUnit;
        claim.auditTrail.push({
          action: 'VALUE_CORRECTED',
          actorUserId: review.reviewedByUserId,
          actorEmail: review.reviewedByEmail || null,
          actorRole: reviewerRole,
          timestamp: now,
          notes: `Value adjusted during review to: ${review.correctedValue} ${review.correctedUnit || ''}`.trim(),
        });
      }

      claim.status = 'APPROVED';
      claim.applicabilityStatus = 'APPLICABLE';
      claim.reviewedByUserId = review.reviewedByUserId;
      claim.reviewedByEmail = review.reviewedByEmail || null;
      claim.reviewedAt = now;
      claim.reviewNotes = review.reviewNotes;
      claim.reviewRationale = review.reviewRationale;
      claim.reviewerQualifications = review.reviewerQualifications || null;
      claim.updatedAt = now;

      claim.auditTrail.push({
        action: 'APPROVED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewNotes,
        qualificationProof: review.reviewerQualifications || null,
      });

      // Update machine registry profile
      const machine = await this.getMachineById(organizationId, claim.machineId);
      if (machine) {
        const valStr = String(claim.claimValue);
        const lowerField = claim.fieldName.toLowerCase();
        if (lowerField === 'manufacturer') machine.manufacturer = valStr;
        if (lowerField === 'modelnumber' || lowerField === 'model') machine.modelNumber = valStr;
        if (lowerField === 'serialnumber' || lowerField === 'serial') machine.serialNumber = valStr;
        if (lowerField === 'manufacturingyear' || lowerField === 'year') {
          const num = parseInt(valStr, 10);
          if (!isNaN(num)) (machine as any).manufacturingYear = num;
        }

        const formattedSpec = claim.unit ? `${claim.claimValue} ${claim.unit}` : claim.claimValue;
        machine.technicalSpecs = {
          ...machine.technicalSpecs,
          [claim.fieldName]: formattedSpec,
        };

        if (machine.manufacturer && machine.modelNumber && machine.serialNumber) {
          machine.verificationState = 'VERIFIED';
          machine.documentationReadiness = 'READY';
          (machine as any).identificationConfidence = 'VERIFIED';
        } else if (machine.manufacturer || machine.modelNumber) {
          machine.verificationState = 'PARTIALLY_VERIFIED';
          (machine as any).identificationConfidence = 'PARTIAL';
        }
        machine.updatedAt = now;
        try {
          await this.getMachineVerification(organizationId, machine.id);
        } catch {
          // ignore
        }
      }
    } else if (review.decision === 'REJECT') {
      if (!review.reviewRationale || review.reviewRationale.trim().length < 5) {
        throw new Error('Rejection requires a documented engineering rationale.');
      }
      claim.status = 'REJECTED';
      claim.reviewedByUserId = review.reviewedByUserId;
      claim.reviewedByEmail = review.reviewedByEmail || null;
      claim.reviewedAt = now;
      claim.reviewNotes = review.reviewNotes;
      claim.reviewRationale = review.reviewRationale;
      claim.updatedAt = now;
      claim.auditTrail.push({
        action: 'REJECTED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewRationale,
      });
    } else if (review.decision === 'REQUEST_ADDITIONAL_EVIDENCE') {
      claim.status = 'NEEDS_ADDITIONAL_EVIDENCE';
      claim.reviewedByUserId = review.reviewedByUserId;
      claim.reviewedByEmail = review.reviewedByEmail || null;
      claim.reviewedAt = now;
      claim.reviewNotes = review.reviewNotes;
      claim.reviewRationale = review.reviewRationale;
      claim.updatedAt = now;
      claim.auditTrail.push({
        action: 'ADDITIONAL_EVIDENCE_REQUESTED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewNotes,
      });
    } else if (review.decision === 'SUPERSEDE') {
      claim.status = 'SUPERSEDED';
      claim.reviewedByUserId = review.reviewedByUserId;
      claim.reviewedByEmail = review.reviewedByEmail || null;
      claim.reviewedAt = now;
      claim.reviewNotes = review.reviewNotes;
      claim.reviewRationale = review.reviewRationale;
      claim.updatedAt = now;
      claim.auditTrail.push({
        action: 'SUPERSEDED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewRationale,
      });
    }

    return claim;
  }

  public async getMachineRecoveryProfile(
    organizationId: string,
    machineId: string
  ): Promise<MachineRecoveryProfile | null> {
    const machine = await this.getMachineById(organizationId, machineId);
    if (!machine) return null;

    const plant = await this.getPlantById(organizationId, machine.plantId);
    const claims = await this.listEvidenceClaims(organizationId, { machineId });
    const tasks = await this.listMissingInfoTasks(organizationId, { machineId });

    const requirements = resolveRequirementsForCategory(machine.machineType);
    const fields: RecoveryGapField[] = [];

    let approvedFieldsCount = 0;
    let missingFieldsCount = 0;
    let awaitingReviewCount = 0;
    let conflictingFieldsCount = 0;
    let safetyCriticalPendingCount = 0;

    for (const req of requirements) {
      const fieldClaims = claims.filter(
        (c) => c.fieldName.toLowerCase() === req.fieldName.toLowerCase()
      );

      const approved = fieldClaims.find((c) => c.status === 'APPROVED');
      const activeUnreviewed = fieldClaims.filter(
        (c) => c.status === 'AWAITING_REVIEW' || c.status === 'COLLECTED'
      );
      const nonRejected = fieldClaims.filter(
        (c) => c.status !== 'REJECTED' && c.status !== 'SUPERSEDED'
      );

      // Check conflicts
      const distinctVals = new Set(
        nonRejected.map((c) => String(c.claimValue).trim().toLowerCase())
      );
      const isConflicting = distinctVals.size > 1;

      let status: GapFieldStatus = 'GENUINELY_MISSING';
      let currentApprovedVal: string | number | boolean | null = null;
      let draftVal: string | number | boolean | null = null;
      let approvedProvenance = null;
      let activeClaimId: string | null = null;

      // Extract drafted value from machine main record or technicalSpecs
      let draftedVal: any = undefined;
      const specs = (machine.technicalSpecs || {}) as Record<string, any>;
      if (req.fieldName === 'manufacturer' && machine.manufacturer && machine.manufacturer !== 'UNKNOWN') {
        draftedVal = machine.manufacturer;
      } else if (req.fieldName === 'modelNumber' && machine.modelNumber && machine.modelNumber !== 'UNKNOWN') {
        draftedVal = machine.modelNumber;
      } else if (req.fieldName === 'serialNumber' && machine.serialNumber && machine.serialNumber !== 'UNKNOWN') {
        draftedVal = machine.serialNumber;
      } else if (specs[req.fieldName] !== undefined && specs[req.fieldName] !== null && String(specs[req.fieldName]).trim() !== '' && specs[req.fieldName] !== 'UNKNOWN') {
        draftedVal = specs[req.fieldName];
      } else {
        const snake = req.fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (specs[snake] !== undefined && specs[snake] !== null && String(specs[snake]).trim() !== '' && specs[snake] !== 'UNKNOWN') {
          draftedVal = specs[snake];
        }
      }

      if (approved) {
        status = 'APPROVED';
        currentApprovedVal = approved.claimValue;
        activeClaimId = approved.id;
        approvedProvenance = {
          sourceType: approved.sourceType,
          sourceDocumentId: approved.sourceDocumentId,
          sourceRevision: approved.sourceRevision,
          reviewerUserId: approved.reviewedByUserId,
          reviewerQualifications: approved.reviewerQualifications,
          approvedAt: approved.reviewedAt,
        };
        approvedFieldsCount++;
      } else if (isConflicting) {
        status = 'CONFLICTING';
        currentApprovedVal = draftedVal ?? null;
        conflictingFieldsCount++;
        if (req.isSafetyCritical) safetyCriticalPendingCount++;
      } else if (activeUnreviewed.length > 0) {
        status = 'AWAITING_REVIEW';
        activeClaimId = activeUnreviewed[0].id;
        currentApprovedVal = activeUnreviewed[0].claimValue ?? draftedVal ?? null;
        awaitingReviewCount++;
        if (req.isSafetyCritical) safetyCriticalPendingCount++;
      } else if (machine.verificationState === 'VERIFIED' && draftedVal !== undefined) {
        status = 'APPROVED';
        currentApprovedVal = draftedVal;
        approvedFieldsCount++;
      } else if (draftedVal !== undefined && draftedVal !== null && String(draftedVal).trim() !== '') {
        status = 'PENDING_EVIDENCE';
        currentApprovedVal = draftedVal;
        draftVal = draftedVal;
        if (req.isSafetyCritical) safetyCriticalPendingCount++;
      } else if (fieldClaims.some((c) => c.status === 'SUPERSEDED')) {
        status = 'SUPERSEDED';
        missingFieldsCount++;
        if (req.isSafetyCritical) safetyCriticalPendingCount++;
      } else {
        status = 'GENUINELY_MISSING';
        missingFieldsCount++;
        if (req.isSafetyCritical) safetyCriticalPendingCount++;
      }

      const conflictDetails = isConflicting
        ? nonRejected.map((c) => ({
            claimId: c.id,
            value: c.claimValue,
            sourceType: c.sourceType,
            submittedBy: c.submittedByEmail || c.submittedByUserId,
          }))
        : undefined;

      fields.push({
        fieldName: req.fieldName,
        displayName: req.displayName,
        isRequired: req.isRequired,
        isSafetyCritical: req.isSafetyCritical,
        status,
        currentApprovedValue: currentApprovedVal,
        draftValue: draftVal,
        unit: req.unit || null,
        pendingClaimsCount: activeUnreviewed.length,
        conflictingClaimsCount: isConflicting ? nonRejected.length : 0,
        activeClaimId,
        approvedProvenance,
        conflictDetails,
      });
    }

    const unresolvedIdentityQuestions: string[] = [];
    if (!machine.manufacturer || machine.manufacturer === 'UNKNOWN') {
      unresolvedIdentityQuestions.push(
        'Manufacturer identity unverified: OEM nameplate missing, damaged, or unconfirmed.'
      );
    } else if (machine.verificationState !== 'VERIFIED') {
      unresolvedIdentityQuestions.push(
        `Manufacturer '${machine.manufacturer}' is recorded from registry ledger but lacks certified physical nameplate evidence.`
      );
    }
    if (!machine.modelNumber || machine.modelNumber === 'UNKNOWN') {
      unresolvedIdentityQuestions.push(
        'Model number unknown: Part catalog, tolerance specs, and OEM curves cannot be validated.'
      );
    } else if (machine.verificationState !== 'VERIFIED') {
      unresolvedIdentityQuestions.push(
        `Model '${machine.modelNumber}' is recorded from registry ledger but lacks certified physical nameplate evidence.`
      );
    }
    if (!machine.serialNumber || machine.serialNumber === 'UNKNOWN') {
      unresolvedIdentityQuestions.push(
        'Asset serial number unconfirmed: Individual manufacturing batch and historical rework records cannot be definitively correlated.'
      );
    } else if (machine.verificationState !== 'VERIFIED') {
      unresolvedIdentityQuestions.push(
        `Serial '${machine.serialNumber}' is recorded from registry ledger but lacks certified physical nameplate evidence.`
      );
    }
    if (safetyCriticalPendingCount > 0) {
      unresolvedIdentityQuestions.push(
        `${safetyCriticalPendingCount} safety-critical specification(s) or operating limits remain unapproved or conflicting.`
      );
    }

    let identificationConfidence: 'VERIFIED' | 'PARTIAL' | 'UNIDENTIFIED' = 'UNIDENTIFIED';
    if (machine.manufacturer && machine.modelNumber && machine.serialNumber) {
      identificationConfidence = 'VERIFIED';
    } else if (machine.manufacturer || machine.modelNumber) {
      identificationConfidence = 'PARTIAL';
    }

    const totalFieldsRequired = requirements.filter((r) => r.isRequired).length;
    const readinessPercentage = Math.round(
      (approvedFieldsCount / Math.max(1, totalFieldsRequired)) * 100
    );

    return {
      machineId: machine.id,
      assetTag: machine.assetTag,
      name: machine.name,
      plantId: machine.plantId,
      plantName: plant?.name || 'Plant Area',
      machineCategory: machine.machineType,
      area: machine.area,
      manufacturer: machine.manufacturer || null,
      modelNumber: machine.modelNumber || null,
      serialNumber: machine.serialNumber || null,
      manufacturingYear: (machine as any).manufacturingYear || null,
      identificationConfidence,
      unresolvedIdentityQuestions,
      fields,
      totalFieldsRequired,
      approvedFieldsCount,
      missingFieldsCount,
      awaitingReviewCount,
      conflictingFieldsCount,
      evidenceClaimsCount: claims.length,
      openTasksCount: tasks.filter(
        (t) => t.status === 'NOT_STARTED' || t.status === 'IN_PROGRESS' || t.status === 'SUBMITTED'
      ).length,
      readinessPercentage: Math.min(100, readinessPercentage),
      safetyCriticalPendingCount,
      lastUpdated: new Date().toISOString(),
    };
  }

  public async getMachineRecoverySummary(
    organizationId: string,
    plantId?: string
  ): Promise<MachineRecoverySummary> {
    const allMachines = await this.listMachines(organizationId);
    const machines = plantId ? allMachines.filter((m) => m.plantId === plantId) : allMachines;

    let legacyOrIncompleteMachines = 0;
    let unidentifiedCount = 0;
    let partiallyIdentifiedCount = 0;
    let verifiedCount = 0;

    for (const m of machines) {
      const hasMfr = Boolean(m.manufacturer && m.manufacturer !== 'UNKNOWN');
      const hasModel = Boolean(m.modelNumber && m.modelNumber !== 'UNKNOWN');
      const hasSerial = Boolean(m.serialNumber && m.serialNumber !== 'UNKNOWN');

      if (hasMfr && hasModel && hasSerial && m.verificationState === 'VERIFIED') {
        verifiedCount++;
      } else if (hasMfr || hasModel) {
        partiallyIdentifiedCount++;
        legacyOrIncompleteMachines++;
      } else {
        unidentifiedCount++;
        legacyOrIncompleteMachines++;
      }
    }

    let claimsAwaitingReview = 0;
    let approvedClaimsCount = 0;
    let rejectedClaimsCount = 0;
    let supersededClaimsCount = 0;

    for (const c of this.evidenceClaims.values()) {
      if (c.organizationId !== organizationId) continue;
      if (plantId && c.plantId !== plantId) continue;
      if (c.status === 'AWAITING_REVIEW' || c.status === 'COLLECTED') claimsAwaitingReview++;
      else if (c.status === 'APPROVED') approvedClaimsCount++;
      else if (c.status === 'REJECTED') rejectedClaimsCount++;
      else if (c.status === 'SUPERSEDED') supersededClaimsCount++;
    }

    const allTasks = await this.listMissingInfoTasks(organizationId);
    const tasks = plantId
      ? allTasks.filter((t) => {
          const machine = machines.find((m) => m.id === t.machineId);
          return Boolean(machine);
        })
      : allTasks;

    let openCollectionTasksCount = 0;
    let overdueTasksCount = 0;
    const nowMs = Date.now();

    for (const t of tasks) {
      const isOpen =
        t.status === 'NOT_STARTED' || t.status === 'IN_PROGRESS' || t.status === 'SUBMITTED';
      if (isOpen) {
        openCollectionTasksCount++;
        if (t.dueDate && new Date(t.dueDate).getTime() < nowMs) {
          overdueTasksCount++;
        }
      }
    }

    return {
      totalMachines: machines.length,
      legacyOrIncompleteMachines,
      unidentifiedCount,
      partiallyIdentifiedCount,
      verifiedCount,
      claimsAwaitingReview,
      approvedClaimsCount,
      rejectedClaimsCount,
      supersededClaimsCount,
      openCollectionTasksCount,
      overdueTasksCount,
    };
  }

  // --------------------------------------------------------------------------
  // Published Approved Operational Guidance (Prompt 01)
  // --------------------------------------------------------------------------
  public async publishGuidance(
    organizationId: string,
    reviewerUserId: string,
    reviewerEmail: string,
    dto: PublishGuidanceDTO
  ): Promise<PublishedApprovedGuidance> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    let assetTag: string | null = dto.machineAssetTag || null;
    if (dto.machineId && !assetTag) {
      const machine = this.machines.get(dto.machineId);
      if (machine) {
        assetTag = machine.assetTag;
      }
    }

    const guidance: PublishedApprovedGuidance = {
      id,
      organizationId,
      plantId: dto.plantId,
      machineId: dto.machineId || null,
      machineAssetTag: assetTag,
      title: dto.title,
      guidanceContent: dto.guidanceContent,
      sourceDocumentId: dto.sourceDocumentId || null,
      sourceDocumentNumber: dto.sourceDocumentNumber || null,
      sourceDocumentVersionId: dto.sourceDocumentVersionId || null,
      sourceSectionHeading: dto.sourceSectionHeading || null,
      sourcePageNumber: dto.sourcePageNumber ?? null,
      applicableRoles: dto.applicableRoles && dto.applicableRoles.length > 0
        ? dto.applicableRoles
        : ['WORKER', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'],
      disclosureClassification: dto.disclosureClassification || 'WORKER_APPROVED',
      reviewedByUserId: reviewerUserId,
      reviewedByUserEmail: reviewerEmail,
      approvedAt: now,
      expiresAt: dto.expiresAt || null,
      status: 'PUBLISHED',
      supersededByPublicationId: null,
      revisionNumber: 1,
      revocationReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.publishedGuidance.set(id, guidance);

    await this.recordAuditEvent({
      organizationId,
      actorUserId: reviewerUserId,
      action: 'GUIDANCE_PUBLISHED',
      resourceType: 'PUBLISHED_GUIDANCE',
      resourceId: id,
      metadata: {
        title: guidance.title,
        plantId: guidance.plantId,
        machineId: guidance.machineId,
        disclosureClassification: guidance.disclosureClassification,
        applicableRoles: guidance.applicableRoles,
      },
    });

    return guidance;
  }

  public async getPublishedGuidanceById(
    organizationId: string,
    id: string
  ): Promise<PublishedApprovedGuidance | null> {
    const item = this.publishedGuidance.get(id);
    if (!item || item.organizationId !== organizationId) {
      return null;
    }
    return item;
  }

  public async listPublishedGuidance(
    organizationId: string,
    filters?: ListGuidanceFilters
  ): Promise<PublishedApprovedGuidance[]> {
    const results: PublishedApprovedGuidance[] = [];

    for (const item of this.publishedGuidance.values()) {
      if (item.organizationId !== organizationId) continue;
      if (filters?.plantId && item.plantId !== filters.plantId) continue;
      if (filters?.machineId && item.machineId && item.machineId !== filters.machineId) continue;
      if (filters?.status && item.status !== filters.status) continue;
      if (filters?.role && !item.applicableRoles.includes(filters.role)) continue;

      results.push(item);
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async supersedePublishedGuidance(
    organizationId: string,
    guidanceId: string,
    supersededByGuidanceId: string
  ): Promise<PublishedApprovedGuidance | null> {
    const item = this.publishedGuidance.get(guidanceId);
    if (!item || item.organizationId !== organizationId) {
      return null;
    }

    item.status = 'SUPERSEDED';
    item.supersededByPublicationId = supersededByGuidanceId;
    item.updatedAt = new Date().toISOString();
    return item;
  }

  public async revokePublishedGuidance(
    organizationId: string,
    guidanceId: string,
    reason?: string
  ): Promise<PublishedApprovedGuidance | null> {
    const item = this.publishedGuidance.get(guidanceId);
    if (!item || item.organizationId !== organizationId) {
      return null;
    }

    item.status = 'REVOKED';
    item.revocationReason = reason || 'Revoked by administrator';
    item.updatedAt = new Date().toISOString();
    return item;
  }

  // ---------------------------------------------------------------------------
  // Expert Knowledge Library Methods (Prompt 04)
  // ---------------------------------------------------------------------------

  public async createExpertKnowledgeEntry(
    organizationId: string,
    data: CreateExpertKnowledgeDTO & { authorUserId: string; authorEmail?: string; authorRole?: string; authorName?: string }
  ): Promise<ExpertKnowledgeEntry> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    let machineAssetTag: string | null = data.machineAssetTag || null;
    let machineAssetTags: string[] = data.machineAssetTags ? [...data.machineAssetTags] : [];
    if (machineAssetTag) {
      const splitTags = machineAssetTag
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (splitTags.length > 0) {
        machineAssetTags = Array.from(new Set([...machineAssetTags, ...splitTags]));
        machineAssetTag = splitTags[0];
      }
    }

    if (data.machineId && !machineAssetTag) {
      const machine = await this.getMachineById(organizationId, data.machineId);
      if (machine) {
        machineAssetTag = machine.assetTag;
        if (!machineAssetTags.includes(machine.assetTag)) {
          machineAssetTags.push(machine.assetTag);
        }
      }
    }

    const entry: ExpertKnowledgeEntry = {
      id,
      organizationId,
      plantId: data.plantId || 'default-plant',
      machineId: data.machineId || null,
      machineAssetTag,
      machineAssetTags,
      category: data.category,
      severity: data.severity || 'Pro-Tip / Best Practice',
      symptom: data.symptom || null,
      taskDuringIssue: data.taskDuringIssue || null,
      observedAt: data.observedAt || null,
      title: data.title,
      description: data.description,
      aiSupplementalInsight: data.aiSupplementalInsight || null,
      symptoms: data.symptoms || [],
      rootCause: data.rootCause || null,
      resolutionSteps: data.resolutionSteps || [],
      knownFailureModes: data.knownFailureModes || [],
      gapDescription: data.gapDescription || null,
      safetyPrecautions: data.safetyPrecautions || [],
      technicalSpecifications: data.technicalSpecifications || {},
      tags: data.tags || [],
      status: data.status || 'AWAITING_REVIEW',
      upvotes: typeof data.upvotes === 'number' ? data.upvotes : 0,
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      averageRating: typeof data.averageRating === 'number' ? data.averageRating : 5.0,
      reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : (data.reviews?.length ?? 0),
      authorUserId: data.authorUserId,
      authorEmail: data.authorEmail || null,
      authorRole: data.authorRole || null,
      authorName: data.authorName || data.authorEmail || 'Plant Specialist',
      dataClassification: data.dataClassification || 'INTERNAL',
      createdAt: now,
      updatedAt: now,
    };

    this.expertKnowledgeEntries.set(id, entry);
    return entry;
  }

  public async getExpertKnowledgeEntryById(
    organizationId: string,
    id: string
  ): Promise<ExpertKnowledgeEntry | null> {
    const entry = this.expertKnowledgeEntries.get(id);
    if (!entry || entry.organizationId !== organizationId) {
      return null;
    }
    return entry;
  }

  public async listExpertKnowledgeEntries(
    organizationId: string,
    filters?: ExpertKnowledgeFilterOptions
  ): Promise<ExpertKnowledgeEntry[]> {
    const results: ExpertKnowledgeEntry[] = [];

    for (const entry of this.expertKnowledgeEntries.values()) {
      if (entry.organizationId !== organizationId) continue;
      if (filters?.plantId && entry.plantId !== filters.plantId) continue;
      if (filters?.machineId && entry.machineId && entry.machineId !== filters.machineId) continue;
      if (filters?.category && entry.category !== filters.category) continue;
      if (filters?.severity && entry.severity !== filters.severity) continue;
      if (filters?.status && entry.status !== filters.status) continue;
      if (filters?.dataClassification && entry.dataClassification !== filters.dataClassification) continue;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        const matches =
          entry.title.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          (entry.symptom && entry.symptom.toLowerCase().includes(q)) ||
          (entry.taskDuringIssue && entry.taskDuringIssue.toLowerCase().includes(q)) ||
          (entry.machineAssetTag && entry.machineAssetTag.toLowerCase().includes(q)) ||
          (entry.machineAssetTags && entry.machineAssetTags.some((t) => t.toLowerCase().includes(q))) ||
          (entry.authorName && entry.authorName.toLowerCase().includes(q)) ||
          (entry.category && entry.category.toLowerCase().includes(q)) ||
          entry.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) continue;
      }

      results.push(entry);
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async reviewExpertKnowledgeEntry(
    organizationId: string,
    id: string,
    review: ReviewExpertKnowledgeDTO & { reviewedByUserId: string; reviewedByEmail?: string; actorRole?: string }
  ): Promise<ExpertKnowledgeEntry> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) {
      throw new Error(`Expert knowledge entry '${id}' not found.`);
    }

    // Anti-self-approval rule: Authors cannot approve their own submissions unless Admin
    if (entry.authorUserId === review.reviewedByUserId) {
      const isSuperUser = review.actorRole === 'ORGANIZATION_ADMIN' || review.actorRole === 'ORGANIZATION_OWNER';
      if (!isSuperUser) {
        throw new Error('Anti-self-approval violation: Authors cannot approve their own expert knowledge submissions.');
      }
    }

    const now = new Date().toISOString();

    if (review.decision === 'APPROVE') {
      if (!review.reviewRationale || review.reviewRationale.trim().length < 5) {
        throw new Error('Approval requires a valid engineering review rationale.');
      }

      entry.status = 'APPROVED';
      entry.reviewedByUserId = review.reviewedByUserId;
      entry.reviewedByEmail = review.reviewedByEmail || null;
      entry.reviewedAt = now;
      entry.reviewRationale = review.reviewRationale;
      entry.reviewerQualifications = review.reviewerQualifications || null;
      entry.updatedAt = now;
    } else if (review.decision === 'REJECT') {
      entry.status = 'REJECTED';
      entry.reviewedByUserId = review.reviewedByUserId;
      entry.reviewedByEmail = review.reviewedByEmail || null;
      entry.reviewedAt = now;
      entry.reviewRationale = review.reviewRationale;
      entry.updatedAt = now;
    } else if (review.decision === 'REVOKE') {
      entry.status = 'REVOKED';
      entry.reviewedByUserId = review.reviewedByUserId;
      entry.reviewedByEmail = review.reviewedByEmail || null;
      entry.reviewedAt = now;
      entry.reviewRationale = review.reviewRationale;
      entry.updatedAt = now;
    } else if (review.decision === 'SUPERSEDE') {
      entry.status = 'SUPERSEDED';
      entry.supersededByEntryId = review.supersededByEntryId || null;
      entry.reviewedByUserId = review.reviewedByUserId;
      entry.reviewedByEmail = review.reviewedByEmail || null;
      entry.reviewedAt = now;
      entry.reviewRationale = review.reviewRationale;
      entry.updatedAt = now;
    }

    return entry;
  }

  public async revokeExpertKnowledgeEntry(
    organizationId: string,
    id: string,
    reason: string,
    revokedByUserId: string
  ): Promise<ExpertKnowledgeEntry | null> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) return null;

    entry.status = 'REVOKED';
    entry.reviewRationale = reason;
    entry.reviewedByUserId = revokedByUserId;
    entry.reviewedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  public async upvoteExpertKnowledgeEntry(
    organizationId: string,
    id: string
  ): Promise<ExpertKnowledgeEntry | null> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) return null;

    entry.upvotes = (entry.upvotes || 0) + 1;
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  public async downvoteExpertKnowledgeEntry(
    organizationId: string,
    id: string
  ): Promise<ExpertKnowledgeEntry | null> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) return null;

    entry.downvotes = (entry.downvotes || 0) + 1;
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  public async updateExpertKnowledgeEntry(
    organizationId: string,
    id: string,
    updates: Partial<ExpertKnowledgeEntry>
  ): Promise<ExpertKnowledgeEntry | null> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) return null;

    Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
    return entry;
  }

  public async addExpertKnowledgeReview(
    organizationId: string,
    id: string,
    review: ExpertNoteReview
  ): Promise<ExpertKnowledgeEntry | null> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) return null;

    if (!Array.isArray(entry.reviews)) {
      entry.reviews = [];
    }
    entry.reviews.push(review);

    const sum = entry.reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    entry.averageRating = Number((sum / entry.reviews.length).toFixed(1));
    entry.reviewCount = entry.reviews.length;
    entry.updatedAt = new Date().toISOString();

    return entry;
  }

  public async deleteExpertKnowledgeEntry(
    organizationId: string,
    id: string
  ): Promise<boolean> {
    const entry = await this.getExpertKnowledgeEntryById(organizationId, id);
    if (!entry) return false;

    return this.expertKnowledgeEntries.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Root Cause Analysis (RCA) Sessions Persistence
  // ---------------------------------------------------------------------------

  public async saveRcaSession(session: RcaSession): Promise<RcaSession> {
    this.rcaSessions.set(session.id, { ...session });
    return session;
  }

  public async listRcaSessions(
    organizationId: string,
    options?: { plantId?: string; assetId?: string; limit?: number }
  ): Promise<RcaSession[]> {
    const results: RcaSession[] = [];
    for (const session of this.rcaSessions.values()) {
      if (session.organizationId !== organizationId) continue;
      if (options?.plantId && session.plantId !== options.plantId) continue;
      if (options?.assetId && session.assetId !== options.assetId && session.assetTag !== options.assetId) continue;
      results.push(session);
    }
    return results
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, options?.limit || 20);
  }

  public async getRcaSessionById(organizationId: string, id: string): Promise<RcaSession | null> {
    const session = this.rcaSessions.get(id);
    if (!session || session.organizationId !== organizationId) return null;
    return session;
  }

  public async deleteRcaSession(organizationId: string, id: string): Promise<boolean> {
    const session = this.rcaSessions.get(id);
    if (!session || session.organizationId !== organizationId) return false;
    return this.rcaSessions.delete(id);
  }

  public async updateRcaSessionStep(
    organizationId: string,
    sessionId: string,
    stepId: string,
    status: 'PENDING' | 'PASS' | 'FAIL',
    technicianNotes?: string,
    extra?: { isLocked?: boolean; verifiedAt?: string; verifiedBy?: string }
  ): Promise<RcaSession | null> {
    const session = await this.getRcaSessionById(organizationId, sessionId);
    if (!session) return null;

    session.investigationSteps = session.investigationSteps.map((step) => {
      if (step.id === stepId) {
        return {
          ...step,
          status,
          technicianNotes: technicianNotes !== undefined ? technicianNotes : step.technicianNotes,
          isLocked: extra?.isLocked !== undefined ? extra.isLocked : step.isLocked,
          verifiedAt: extra?.verifiedAt !== undefined ? extra.verifiedAt : step.verifiedAt,
          verifiedBy: extra?.verifiedBy !== undefined ? extra.verifiedBy : step.verifiedBy,
        };
      }
      return step;
    });
    session.updatedAt = new Date().toISOString();
    return session;
  }

  public async purgeRcaRecordsOlderThan(
    days: number,
    organizationId?: string
  ): Promise<{ deletedRcaSessions: number; deletedMaintenanceRecords: number; cutoffDate: string }> {
    const retentionMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;
    const cutoffDate = new Date(cutoffTime).toISOString();

    let deletedRcaSessions = 0;
    for (const [id, session] of this.rcaSessions.entries()) {
      if (organizationId && session.organizationId !== organizationId) continue;
      const sessionDate = new Date(session.createdAt || session.updatedAt).getTime();
      if (sessionDate < cutoffTime) {
        this.rcaSessions.delete(id);
        deletedRcaSessions++;
      }
    }

    let deletedMaintenanceRecords = 0;
    for (const [id, record] of this.maintenanceRecords.entries()) {
      if (organizationId && record.organizationId !== organizationId) continue;
      const isRcaRecord =
        record.ticketNumber?.startsWith('RCA-') ||
        record.faultCategory === 'RCA_SESSION' ||
        record.problemStatement?.startsWith('Field Symptom:');
      if (isRcaRecord) {
        const recDate = new Date(record.createdAt || record.resolvedAt).getTime();
        if (recDate < cutoffTime) {
          this.maintenanceRecords.delete(id);
          deletedMaintenanceRecords++;
        }
      }
    }

    return {
      deletedRcaSessions,
      deletedMaintenanceRecords,
      cutoffDate,
    };
  }
}

// ----------------------------------------------------------------------------
// Machine Category Gap Analysis Requirements (Phase 3)
// ----------------------------------------------------------------------------
interface CategoryFieldRequirement {
  fieldName: string;
  displayName: string;
  isRequired: boolean;
  isSafetyCritical: boolean;
  unit?: string;
}

const CATEGORY_REQUIREMENTS: Record<string, CategoryFieldRequirement[]> = {
  PUMP: [
    { fieldName: 'manufacturer', displayName: 'Manufacturer / OEM', isRequired: true, isSafetyCritical: false },
    { fieldName: 'modelNumber', displayName: 'Model Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'serialNumber', displayName: 'Serial Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'designDischargePressure', displayName: 'Design Discharge Pressure', isRequired: true, isSafetyCritical: true, unit: 'bar' },
    { fieldName: 'suctionPressure', displayName: 'Suction Pressure Limit', isRequired: false, isSafetyCritical: false, unit: 'bar' },
    { fieldName: 'nameplateRpm', displayName: 'Rated Speed (RPM)', isRequired: true, isSafetyCritical: false, unit: 'RPM' },
    { fieldName: 'impellerDiameter', displayName: 'Impeller Diameter', isRequired: false, isSafetyCritical: false, unit: 'mm' },
    { fieldName: 'sealType', displayName: 'Mechanical Seal Type', isRequired: false, isSafetyCritical: false },
    { fieldName: 'lotoIsolationProcedure', displayName: 'LOTO Electrical & Mechanical Isolation', isRequired: true, isSafetyCritical: true },
  ],
  MOTOR: [
    { fieldName: 'manufacturer', displayName: 'Manufacturer / OEM', isRequired: true, isSafetyCritical: false },
    { fieldName: 'modelNumber', displayName: 'Model Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'serialNumber', displayName: 'Serial Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'ratedVoltage', displayName: 'Rated Voltage', isRequired: true, isSafetyCritical: true, unit: 'V' },
    { fieldName: 'fullLoadCurrent', displayName: 'Full Load Current (FLA)', isRequired: true, isSafetyCritical: true, unit: 'A' },
    { fieldName: 'nameplateRpm', displayName: 'Rated Speed (RPM)', isRequired: true, isSafetyCritical: false, unit: 'RPM' },
    { fieldName: 'insulationClass', displayName: 'Insulation Class', isRequired: false, isSafetyCritical: false },
    { fieldName: 'frameSize', displayName: 'Frame Size', isRequired: false, isSafetyCritical: false },
    { fieldName: 'lotoIsolationProcedure', displayName: 'LOTO Arc-Flash & Lockout Procedure', isRequired: true, isSafetyCritical: true },
  ],
  BOILER: [
    { fieldName: 'manufacturer', displayName: 'Manufacturer / Vessel Fabricator', isRequired: true, isSafetyCritical: false },
    { fieldName: 'serialNumber', displayName: 'National Board / Serial Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'designPressure', displayName: 'Design Pressure', isRequired: true, isSafetyCritical: true, unit: 'bar' },
    { fieldName: 'maxAllowableWorkingPressure', displayName: 'Max Allowable Working Pressure (MAWP)', isRequired: true, isSafetyCritical: true, unit: 'bar' },
    { fieldName: 'designTemperature', displayName: 'Design Temperature', isRequired: true, isSafetyCritical: true, unit: '°C' },
    { fieldName: 'safetyValveSetPressure', displayName: 'Safety Relief Valve Set Pressure', isRequired: true, isSafetyCritical: true, unit: 'bar' },
    { fieldName: 'hydrotestDate', displayName: 'Last Certified Hydrotest Date', isRequired: true, isSafetyCritical: false },
    { fieldName: 'lotoIsolationProcedure', displayName: 'Boiler Depressurization & Blind Flange LOTO', isRequired: true, isSafetyCritical: true },
  ],
  GENERAL: [
    { fieldName: 'manufacturer', displayName: 'Manufacturer / OEM', isRequired: true, isSafetyCritical: false },
    { fieldName: 'modelNumber', displayName: 'Model Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'serialNumber', displayName: 'Serial Number', isRequired: true, isSafetyCritical: false },
    { fieldName: 'operatingLimits', displayName: 'Operating Limits & Safe Envelopes', isRequired: true, isSafetyCritical: true },
    { fieldName: 'lotoIsolationProcedure', displayName: 'Standard Energy Control / LOTO Procedure', isRequired: true, isSafetyCritical: true },
  ],
};

function resolveRequirementsForCategory(machineType: string): CategoryFieldRequirement[] {
  const norm = (machineType || '').toUpperCase();
  if (norm.includes('PUMP')) return CATEGORY_REQUIREMENTS.PUMP;
  if (norm.includes('MOTOR')) return CATEGORY_REQUIREMENTS.MOTOR;
  if (norm.includes('BOILER') || norm.includes('VESSEL') || norm.includes('PRESSURE')) return CATEGORY_REQUIREMENTS.BOILER;
  return CATEGORY_REQUIREMENTS.GENERAL;
}




import type {
  Organization,
  User,
  UserSession,
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
  DocumentType,
  DocumentStatus,
  ExtractionMethod,
  Conversation,
  CopilotMessage,
  Citation,
  MessageFeedback,
  VisualAsset,
  VisualAssetType,
  ComponentLabel,
  MaintenanceCase,
  MaintenanceCaseStatus,
  MaintenanceCaseSeverity,
  ChecklistStep,
  DiagnosticHypothesis,
  TechnicianFindings,
  CaseApproval,
  CaseHistoryEntry,
  OrganizationInvitation,
  InvitationStatus,
  Machine,
  MissingInformationTask,
  ComponentMapping,
  EmployeeBadge,
  MachineLedgerSummary,
  MachineVerificationRecord,
  PublicMachineKnowledge,
  OemSourceType,
  ModelMatchStatus,
  SpecVerificationStatus,
  SpecEvidenceRecord,
  SpecConflictInfo,
  CompletenessSummary,
  DataClassification,
  MachineCriticality,
  MachineAccessScope,
  VerificationState,
  DocumentationReadiness,
  MappingStatus,
  BadgeStatus,
  IndustryProfile,
  CustomFieldDefinition,
  EngineeringModel3D,
  CADFileFormat,
  ManufacturerResource,
  ManufacturerResourceType,
  EngineeringDrawing,
  DrawingType,
  EngineeringAssetStatus,
  EngineeringAssetCenterSummary,
  EmployeeProfile,
  EmployeeAccountStatus,
  EmployeeAvailabilityStatus,
  EmployeeQualificationStatus,
  MachineSpecialistMapping,
  SpecialistAssignmentStatus,
  SpecialistTicket,
  TicketSeverity,
  TicketStatus,
  TicketEscalationReason,
  TicketAssignmentStatus,
  TicketOversightSummary,
  MaintenanceRecord,
  MaintenanceMeasurement,
  PartReplaced,
  PostRepairTestResult,
  MaintenanceAttachment,
  RootCauseStatus,
  ResolutionApprovalStatus,
  MaintenanceVerificationState,
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
  EmailOtpRecord,
  GoogleOAuthStateRecord,
  RcaSession,
} from '@forgex/shared-types';

export interface CreateEmailOtpDTO {
  email: string;
  codeHash: string;
  purpose: 'login' | 'register' | 'invitation' | 'password_reset';
  expiresAt: string;
}

export interface SaveGoogleOAuthStateDTO {
  state: string;
  purpose: 'login' | 'register' | 'invitation';
  redirectUri: string;
  invitationToken?: string;
  expiresAt: string;
}

export interface CreateOrganizationDTO {
  name: string;
  slug: string;
}

export interface CreateUserDTO {
  externalAuthId: string;
  email: string;
  fullName: string;
  emailVerified?: boolean;
  passwordHash?: string;
  status?: string;
  googleId?: string;
  googleEmail?: string;
  authProvider?: string;
}

export interface CreateMembershipDTO {
  organizationId: string;
  userId: string;
  role: OrgRole;
  status?: MembershipStatus;
  assignedPlantIds?: string[];
}

export interface CreateInvitationDTO {
  organizationId: string;
  email: string;
  role: OrgRole;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: string;
  assignedPlantIds?: string[];
  assignedMachineIds?: string[];
  qrTokenHash?: string;
  qrExpiresAt?: string;
  activationCodeHash?: string;
  employeeId?: string;
  department?: string;
  designation?: string;
}

export interface RegisterOrganizationDTO {
  organizationName: string;
  organizationSlug: string;
  adminEmail: string;
  adminFullName: string;
  externalAuthId: string;
  passwordHash?: string;
  industry?: string;
  country?: string;
  timezone?: string;
  website?: string;
  companySize?: string;
  initialSiteName?: string;
  deploymentType?: 'saas' | 'enterprise';
  verificationTokenHash?: string;
  verificationExpiresAt?: string;
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

export interface CreateDocumentDTO {
  organizationId: string;
  plantId: string;
  documentNumber: string;
  title: string;
  category: DocumentType;
  assetTags?: string[];
  assetIds?: string[];
  machineId?: string;
  dataClassification?: string;
  isConfidential?: boolean;
  createdByUserId?: string | null;
}

export interface CreateDocumentVersionDTO {
  documentId: string;
  versionNumber: number;
  revision: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  storageKey: string;
  status?: DocumentStatus;
}

export interface CreateDocumentPageDTO {
  documentVersionId: string;
  pageNumber: number;
  rawText: string;
  sectionHeadings?: string[];
  extractionMethod: ExtractionMethod;
  hasTables?: boolean;
  storageKey?: string | null;
}

export interface CreateKnowledgeChunkDTO {
  documentVersionId: string;
  pageNumber: number;
  chunkIndex: number;
  qdrantPointId: string;
  content: string;
  sectionHeading?: string | null;
  isTable?: boolean;
  isFigure?: boolean;
  extractionMethod: ExtractionMethod;
  tokenCount?: number;
}

export interface CreateProcessingJobDTO {
  organizationId: string;
  documentVersionId: string;
  status?: DocumentStatus;
  progressPercent?: number;
  currentStep?: string;
}

export interface DocumentFilterOptions {
  plantId?: string;
  category?: DocumentType;
  search?: string;
  machineId?: string;
  assetId?: string;
}

export interface OutboxEvent {
  id: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  retryCount: number;
  errorMessage?: string | null;
  createdAt: string;
  processedAt?: string | null;
}

export interface CreateOutboxEventDTO {
  id?: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
}

export interface IDataStore {
  // Organizations
  createOrganization(dto: CreateOrganizationDTO): Promise<Organization>;
  getOrganizationById(id: string): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | null>;

  // Users & Profiles
  createUser(dto: CreateUserDTO): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByExternalAuthId(externalAuthId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(userId: string, updates: Partial<User>): Promise<User | null>;
  listUserSessions(userId: string): Promise<UserSession[]>;
  revokeUserSession(userId: string, sessionId: string): Promise<boolean>;
  revokeAllUserSessions(userId: string): Promise<number>;
  getUserByVerificationToken(tokenHash: string): Promise<User | null>;
  setUserEmailVerified(userId: string, verified: boolean): Promise<User | null>;
  setUserVerificationToken(userId: string, tokenHash: string | null, expiresAt: string | null): Promise<User | null>;
  setUserPassword(userId: string, passwordHash: string): Promise<User | null>;
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void>;
  getPasswordResetToken(tokenHash: string): Promise<{ userId: string; expiresAt: string; usedAt: string | null } | null>;
  consumePasswordResetToken(tokenHash: string): Promise<boolean>;

  // Email OTP Authentication
  createEmailOtp(dto: CreateEmailOtpDTO): Promise<EmailOtpRecord>;
  getLatestEmailOtp(email: string, purpose: string): Promise<EmailOtpRecord | null>;
  incrementEmailOtpAttempts(otpId: string): Promise<number>;
  consumeEmailOtp(otpId: string): Promise<boolean>;
  countRecentEmailOtps(email: string, sinceDate: string): Promise<number>;

  // Google OAuth & Social Identity
  getUserByGoogleId(googleId: string): Promise<User | null>;
  setUserGoogleId(userId: string, googleId: string, googleEmail?: string): Promise<User | null>;
  unlinkUserGoogleId(userId: string): Promise<User | null>;
  saveGoogleOAuthState(dto: SaveGoogleOAuthStateDTO): Promise<GoogleOAuthStateRecord>;
  getGoogleOAuthState(state: string): Promise<GoogleOAuthStateRecord | null>;
  consumeGoogleOAuthState(state: string): Promise<boolean>;

  // Memberships & Team Management
  createMembership(dto: CreateMembershipDTO): Promise<OrganizationMembership>;
  getMembership(userId: string, organizationId: string): Promise<OrganizationMembership | null>;
  getMembershipById(organizationId: string, membershipId: string): Promise<OrganizationMembership | null>;
  listUserMemberships(userId: string): Promise<OrganizationMembership[]>;
  listOrganizationMembers(organizationId: string): Promise<OrganizationMembership[]>;
  updateMembershipRole(
    organizationId: string,
    membershipId: string,
    role: OrgRole,
    assignedPlantIds?: string[]
  ): Promise<OrganizationMembership | null>;
  updateMembershipStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipStatus
  ): Promise<OrganizationMembership | null>;
  deleteMembership(organizationId: string, membershipId: string): Promise<boolean>;

  // Invitations
  createInvitation(dto: CreateInvitationDTO): Promise<OrganizationInvitation>;
  getInvitationById(organizationId: string, invitationId: string): Promise<OrganizationInvitation | null>;
  getInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null>;
  getInvitationByQrTokenHash(qrTokenHash: string): Promise<OrganizationInvitation | null>;
  getInvitationByActivationCodeHash(codeHash: string): Promise<OrganizationInvitation | null>;
  incrementActivationCodeAttempts(invitationId: string): Promise<number>;
  updateInvitationQrToken(invitationId: string, qrTokenHash: string, qrExpiresAt: string): Promise<OrganizationInvitation | null>;
  listInvitations(organizationId: string, status?: InvitationStatus): Promise<OrganizationInvitation[]>;
  updateInvitationStatus(
    invitationId: string,
    status: InvitationStatus
  ): Promise<OrganizationInvitation | null>;
  deleteInvitation(organizationId: string, invitationId: string): Promise<boolean>;

  // Organization Registration & Onboarding
  registerOrganizationWithAdmin(
    dto: RegisterOrganizationDTO
  ): Promise<{ organization: Organization; adminUser: User; membership: OrganizationMembership }>;

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

  // Documents
  createDocument(dto: CreateDocumentDTO): Promise<TechnicalDocument>;
  getDocumentById(organizationId: string, documentId: string): Promise<TechnicalDocument | null>;
  getDocumentByNumber(organizationId: string, documentNumber: string): Promise<TechnicalDocument | null>;
  listDocuments(organizationId: string, filter?: DocumentFilterOptions): Promise<TechnicalDocument[]>;
  deleteDocument(organizationId: string, documentId: string): Promise<boolean>;
  linkDocumentToAsset(
    organizationId: string,
    documentId: string,
    assetId: string,
    assetTag?: string
  ): Promise<void>;
  getLinkedMachineIdsForDocument(
    organizationId: string,
    documentId: string
  ): Promise<string[]>;
  isDocumentLinkedToAsset(
    organizationId: string,
    documentId: string,
    assetId: string
  ): Promise<boolean>;
  createDocumentWithOutbox(
    docDto: CreateDocumentDTO,
    versionDto: CreateDocumentVersionDTO,
    eventDto: CreateOutboxEventDTO,
    assetIds?: string[]
  ): Promise<{ document: TechnicalDocument; version: DocumentVersion; outboxEvent: OutboxEvent }>;

  // Transactional Outbox Pattern
  createOutboxEvent(dto: CreateOutboxEventDTO, client?: any): Promise<OutboxEvent>;
  fetchPendingOutboxEvents(limit?: number): Promise<OutboxEvent[]>;
  markOutboxEventProcessed(id: string): Promise<void>;
  markOutboxEventFailed(id: string, errorMessage: string): Promise<void>;
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
  withTenantContext?<T>(organizationId: string, callback: () => Promise<T> | T): Promise<T> | T;
  withSystemWorkerContext?<T>(callback: () => Promise<T> | T): Promise<T> | T;

  // Document Versions
  createDocumentVersion(dto: CreateDocumentVersionDTO): Promise<DocumentVersion>;
  getDocumentVersionById(versionId: string): Promise<DocumentVersion | null>;
  listDocumentVersions(documentId: string): Promise<DocumentVersion[]>;
  updateDocumentVersionStatus(
    versionId: string,
    status: DocumentStatus,
    totalPages?: number,
    totalChunks?: number,
    errorMessage?: string | null
  ): Promise<DocumentVersion>;

  // Document Pages
  saveDocumentPages(pages: CreateDocumentPageDTO[]): Promise<DocumentPage[]>;
  listDocumentPages(documentVersionId: string): Promise<DocumentPage[]>;
  deleteDocumentPages(documentVersionId: string): Promise<void>;

  // Knowledge Chunks
  saveKnowledgeChunks(chunks: CreateKnowledgeChunkDTO[]): Promise<KnowledgeChunk[]>;
  listKnowledgeChunks(documentVersionId: string): Promise<KnowledgeChunk[]>;
  deleteKnowledgeChunks(documentVersionId: string): Promise<void>;

  // Processing Jobs
  createProcessingJob(dto: CreateProcessingJobDTO): Promise<ProcessingJob>;
  getProcessingJobById(jobId: string): Promise<ProcessingJob | null>;
  getLatestProcessingJobByVersion(documentVersionId: string): Promise<ProcessingJob | null>;
  updateProcessingJobProgress(
    jobId: string,
    progressPercent: number,
    currentStep?: string,
    status?: DocumentStatus,
    errorMessage?: string | null
  ): Promise<ProcessingJob>;
  incrementJobRetryCount(jobId: string): Promise<ProcessingJob>;

  // Phase 4: Conversations & AI Copilot
  createConversation(dto: CreateConversationDTO): Promise<Conversation>;
  getConversationById(organizationId: string, conversationId: string): Promise<Conversation | null>;
  listConversations(organizationId: string, userId: string, plantId?: string): Promise<Conversation[]>;
  deleteConversation(organizationId: string, conversationId: string): Promise<boolean>;

  // Messages & Citations
  createMessage(dto: CreateMessageDTO): Promise<CopilotMessage>;
  createCitations(citations: CreateCitationDTO[]): Promise<Citation[]>;
  getMessageWithCitations(messageId: string): Promise<CopilotMessage | null>;
  listMessages(conversationId: string): Promise<CopilotMessage[]>;
  recordMessageFeedback(dto: CreateFeedbackDTO): Promise<MessageFeedback>;

  // Visual Assets (Phase 5)
  createVisualAsset(dto: CreateVisualAssetDTO): Promise<VisualAsset>;
  getVisualAssetById(organizationId: string, id: string): Promise<VisualAsset | null>;
  updateVisualAsset(organizationId: string, id: string, updates: Partial<VisualAsset>): Promise<VisualAsset | null>;
  listVisualAssets(organizationId: string, filter?: VisualAssetFilterOptions): Promise<VisualAsset[]>;
  deleteVisualAsset(organizationId: string, id: string): Promise<boolean>;

  // Maintenance Cases & Troubleshooting Workflows (Phase 6)
  createMaintenanceCase(dto: CreateMaintenanceCaseDTO): Promise<MaintenanceCase>;
  getMaintenanceCaseById(organizationId: string, id: string): Promise<MaintenanceCase | null>;
  updateMaintenanceCase(organizationId: string, id: string, updates: Partial<MaintenanceCase>): Promise<MaintenanceCase | null>;
  listMaintenanceCases(organizationId: string, filter?: MaintenanceCaseFilterOptions): Promise<MaintenanceCase[]>;
  deleteMaintenanceCase(organizationId: string, id: string): Promise<boolean>;
  recordCaseHistory(dto: CreateCaseHistoryDTO): Promise<CaseHistoryEntry>;
  listCaseHistory(caseId: string): Promise<CaseHistoryEntry[]>;

  // Machine Registry (Phase B)
  createMachine(organizationId: string, data: CreateMachineDTO): Promise<Machine>;
  getMachineById(organizationId: string, machineId: string): Promise<Machine | null>;
  getMachineByAssetTag(organizationId: string, assetTag: string): Promise<Machine | null>;
  listMachines(organizationId: string, filters?: MachineFilterOptions): Promise<Machine[]>;
  updateMachine(organizationId: string, machineId: string, updates: Partial<Machine>): Promise<Machine | null>;
  deleteMachine(organizationId: string, machineId: string): Promise<boolean>;
  detectPotentialDuplicates(organizationId: string, params: { manufacturer?: string; modelNumber?: string; serialNumber?: string }): Promise<Machine[]>;
  getMachineLedgerSummary(organizationId: string, plantId?: string): Promise<MachineLedgerSummary>;
  getMachineVerification(organizationId: string, machineId: string): Promise<MachineVerificationRecord>;
  updateMachineVerification(organizationId: string, machineId: string, updates: Partial<MachineVerificationRecord>): Promise<MachineVerificationRecord>;

  // Missing Information & Technician Tasks (Phase B)
  createMissingInfoTask(organizationId: string, data: CreateMissingInfoTaskDTO): Promise<MissingInformationTask>;
  getMissingInfoTaskById(organizationId: string, taskId: string): Promise<MissingInformationTask | null>;
  listMissingInfoTasks(organizationId: string, filters?: MissingInfoTaskFilterOptions): Promise<MissingInformationTask[]>;
  updateMissingInfoTask(organizationId: string, taskId: string, updates: Partial<MissingInformationTask>): Promise<MissingInformationTask | null>;

  // Component Mappings (Phase B)
  createComponentMapping(organizationId: string, data: CreateComponentMappingDTO): Promise<ComponentMapping>;
  listComponentMappings(organizationId: string, machineId: string): Promise<ComponentMapping[]>;
  updateComponentMapping(organizationId: string, mappingId: string, updates: Partial<ComponentMapping>): Promise<ComponentMapping | null>;
  deleteComponentMapping(organizationId: string, mappingId: string): Promise<boolean>;

  // Employee Badges (Phase B)
  issueEmployeeBadge(organizationId: string, data: IssueEmployeeBadgeDTO): Promise<EmployeeBadge>;
  getEmployeeBadgeByCode(badgeCode: string): Promise<EmployeeBadge | null>;
  getEmployeeBadgeByUserId(organizationId: string, userId: string): Promise<EmployeeBadge | null>;
  updateEmployeeBadgeStatus(organizationId: string, badgeId: string, status: BadgeStatus): Promise<EmployeeBadge | null>;

  // Public Machine Knowledge (Phase B)
  getPublicMachineKnowledge(manufacturer: string, modelNumber: string): Promise<PublicMachineKnowledge | null>;
  savePublicMachineKnowledge(data: SavePublicKnowledgeDTO): Promise<PublicMachineKnowledge>;
  updatePublicMachineKnowledgeStatus(
    id: string,
    status: SpecVerificationStatus,
    approvedByUserId: string,
    reviewNotes?: string
  ): Promise<PublicMachineKnowledge | null>;

  // Industry Profiles (Universal Industry Support)
  listIndustryProfiles(organizationId: string): Promise<IndustryProfile[]>;
  getIndustryProfileByCode(organizationId: string, code: string): Promise<IndustryProfile | null>;
  createIndustryProfile(organizationId: string, data: CreateIndustryProfileDTO): Promise<IndustryProfile>;
  updateIndustryProfile(organizationId: string, profileId: string, updates: Partial<IndustryProfile>): Promise<IndustryProfile | null>;
  deleteIndustryProfile(organizationId: string, profileId: string): Promise<boolean>;

  // Engineering 3D Models & CAD Files
  createEngineeringModel3D(organizationId: string, data: CreateEngineeringModel3DDTO): Promise<EngineeringModel3D>;
  getEngineeringModel3DById(organizationId: string, modelId: string): Promise<EngineeringModel3D | null>;
  listEngineeringModels3D(organizationId: string, filters?: EngineeringModelFilterOptions): Promise<EngineeringModel3D[]>;
  updateEngineeringModel3D(organizationId: string, modelId: string, updates: Partial<EngineeringModel3D>): Promise<EngineeringModel3D | null>;
  deleteEngineeringModel3D(organizationId: string, modelId: string): Promise<boolean>;

  // Manufacturer Resources
  createManufacturerResource(organizationId: string, data: CreateManufacturerResourceDTO): Promise<ManufacturerResource>;
  getManufacturerResourceById(organizationId: string, resourceId: string): Promise<ManufacturerResource | null>;
  listManufacturerResources(organizationId: string, filters?: ManufacturerResourceFilterOptions): Promise<ManufacturerResource[]>;
  updateManufacturerResource(organizationId: string, resourceId: string, updates: Partial<ManufacturerResource>): Promise<ManufacturerResource | null>;
  deleteManufacturerResource(organizationId: string, resourceId: string): Promise<boolean>;

  // Engineering Drawings
  createEngineeringDrawing(organizationId: string, data: CreateEngineeringDrawingDTO): Promise<EngineeringDrawing>;
  getEngineeringDrawingById(organizationId: string, drawingId: string): Promise<EngineeringDrawing | null>;
  listEngineeringDrawings(organizationId: string, filters?: EngineeringDrawingFilterOptions): Promise<EngineeringDrawing[]>;
  updateEngineeringDrawing(organizationId: string, drawingId: string, updates: Partial<EngineeringDrawing>): Promise<EngineeringDrawing | null>;
  deleteEngineeringDrawing(organizationId: string, drawingId: string): Promise<boolean>;

  // Engineering Asset Center Summary
  getEngineeringAssetCenterSummary(organizationId: string): Promise<EngineeringAssetCenterSummary>;

  // Employee and Technician Directory
  createEmployeeProfile(organizationId: string, data: CreateEmployeeProfileDTO): Promise<EmployeeProfile>;
  getEmployeeProfile(organizationId: string, id: string): Promise<EmployeeProfile | null>;
  getEmployeeProfileByUserId(organizationId: string, userId: string): Promise<EmployeeProfile | null>;
  updateEmployeeProfile(organizationId: string, id: string, updates: Partial<EmployeeProfile>): Promise<EmployeeProfile | null>;
  listEmployeeProfiles(organizationId: string, filters?: EmployeeProfileFilterOptions): Promise<EmployeeProfile[]>;

  // Machine-to-Specialist Mappings
  setMachineSpecialistMapping(organizationId: string, data: SetMachineSpecialistMappingDTO): Promise<MachineSpecialistMapping>;
  getMachineSpecialistMapping(organizationId: string, machineId: string): Promise<MachineSpecialistMapping | null>;
  listMachineSpecialistMappings(organizationId: string): Promise<MachineSpecialistMapping[]>;

  // Specialist Tickets & Automatic Routing
  createSpecialistTicket(organizationId: string, data: CreateSpecialistTicketDTO): Promise<SpecialistTicket>;
  getSpecialistTicketById(organizationId: string, id: string): Promise<SpecialistTicket | null>;
  updateSpecialistTicket(organizationId: string, id: string, updates: Partial<SpecialistTicket> & { actorUserId?: string; note?: string }): Promise<SpecialistTicket | null>;
  listSpecialistTickets(organizationId: string, filters?: SpecialistTicketFilterOptions): Promise<SpecialistTicket[]>;
  getTicketOversightSummary(organizationId: string): Promise<TicketOversightSummary>;
  findActiveDuplicateTicket(organizationId: string, machineId: string, questionOrSymptom: string): Promise<SpecialistTicket | null>;
  getOperationalAnalytics(organizationId: string, filters?: OperationalAnalyticsFilterOptions): Promise<OperationalAnalyticsDashboard>;

  // Persistent Machine Maintenance History & Resolution Records
  createMaintenanceRecord(organizationId: string, data: CreateMaintenanceRecordDTO): Promise<MaintenanceRecord>;
  getMaintenanceRecordById(organizationId: string, id: string): Promise<MaintenanceRecord | null>;
  getMaintenanceRecordByNumber(organizationId: string, recordNumber: string): Promise<MaintenanceRecord | null>;
  listMaintenanceRecords(organizationId: string, filters?: MaintenanceRecordFilterOptions): Promise<MaintenanceRecord[]>;
  countMaintenanceRecords(organizationId: string, filters?: MaintenanceRecordFilterOptions): Promise<number>;
  updateMaintenanceRecord(organizationId: string, id: string, updates: UpdateMaintenanceRecordDTO): Promise<MaintenanceRecord | null>;
  getMachineMaintenanceHistory(organizationId: string, machineId: string): Promise<MaintenanceRecord[]>;

  // Recurring Fault Intelligence & Safety Limits
  detectRecurringFaults(organizationId: string, machineId: string, options?: RecurringFaultOptions): Promise<RecurringFaultAnalysis>;
  setRecurringFaultPolicy(organizationId: string, data: SetRecurringFaultPolicyDTO): Promise<RecurringFaultThresholdConfig>;
  getRecurringFaultPolicy(organizationId: string, machineId: string, machineType?: string): Promise<RecurringFaultThresholdConfig>;

  // Ticket Resolution & Lifecycle Actions
  resolveSpecialistTicket(organizationId: string, ticketId: string, resolution: ResolveSpecialistTicketDTO): Promise<{ ticket: SpecialistTicket; record: MaintenanceRecord }>;
  reopenSpecialistTicket(organizationId: string, ticketId: string, data: ReopenSpecialistTicketDTO): Promise<{ ticket: SpecialistTicket; record?: MaintenanceRecord | null }>;
  approveTicketRestart(organizationId: string, ticketId: string, data: ApproveTicketRestartDTO): Promise<{ ticket: SpecialistTicket; record?: MaintenanceRecord | null }>;

  // Confidential Access Monitoring & Admin Security Alerts
  recordSecurityEvent(dto: CreateSecurityEventDTO): Promise<SecurityEvent>;
  listSecurityEvents(organizationId: string, filter?: ListSecurityEventsQuery): Promise<{ events: SecurityEvent[]; total: number }>;
  getSecurityEventById(organizationId: string, eventId: string): Promise<SecurityEvent | null>;
  createSecurityAlert(dto: CreateSecurityAlertDTO): Promise<SecurityAlert>;
  updateSecurityAlert(organizationId: string, alertId: string, updates: Partial<SecurityAlert>): Promise<SecurityAlert | null>;
  listSecurityAlerts(organizationId: string, filter?: ListSecurityAlertsQuery): Promise<{ alerts: SecurityAlert[]; total: number }>;
  getSecurityAlertById(organizationId: string, alertId: string): Promise<SecurityAlert | null>;
  findOpenAlertForActorAndType(organizationId: string, actorUserId: string, alertType: string): Promise<SecurityAlert | null>;

  // Machine Knowledge Recovery System (Phase 3)
  createEvidenceClaim(organizationId: string, data: CreateEvidenceClaimDTO & { submittedByUserId: string; submittedByEmail?: string }): Promise<MachineEvidenceClaim>;
  getEvidenceClaimById(organizationId: string, claimId: string): Promise<MachineEvidenceClaim | null>;
  listEvidenceClaims(organizationId: string, filters?: ClaimFilterOptions): Promise<MachineEvidenceClaim[]>;
  reviewEvidenceClaim(organizationId: string, claimId: string, review: ReviewEvidenceClaimDTO & { reviewedByUserId: string; reviewedByEmail?: string; actorRole?: string }): Promise<MachineEvidenceClaim>;
  getMachineRecoveryProfile(organizationId: string, machineId: string): Promise<MachineRecoveryProfile | null>;
  getMachineRecoverySummary(organizationId: string, plantId?: string): Promise<MachineRecoverySummary>;

  // Published Approved Operational Guidance (Prompt 01)
  publishGuidance(organizationId: string, reviewerUserId: string, reviewerEmail: string, dto: PublishGuidanceDTO): Promise<PublishedApprovedGuidance>;
  getPublishedGuidanceById(organizationId: string, id: string): Promise<PublishedApprovedGuidance | null>;
  listPublishedGuidance(organizationId: string, filters?: ListGuidanceFilters): Promise<PublishedApprovedGuidance[]>;
  supersedePublishedGuidance(organizationId: string, guidanceId: string, supersededByGuidanceId: string): Promise<PublishedApprovedGuidance | null>;
  revokePublishedGuidance(organizationId: string, guidanceId: string, reason?: string): Promise<PublishedApprovedGuidance | null>;

  // Expert Knowledge Library (Prompt 04)
  createExpertKnowledgeEntry(organizationId: string, data: CreateExpertKnowledgeDTO & { authorUserId: string; authorEmail?: string; authorRole?: string; authorName?: string }): Promise<ExpertKnowledgeEntry>;
  getExpertKnowledgeEntryById(organizationId: string, id: string): Promise<ExpertKnowledgeEntry | null>;
  listExpertKnowledgeEntries(organizationId: string, filters?: ExpertKnowledgeFilterOptions): Promise<ExpertKnowledgeEntry[]>;
  reviewExpertKnowledgeEntry(organizationId: string, id: string, review: ReviewExpertKnowledgeDTO & { reviewedByUserId: string; reviewedByEmail?: string; actorRole?: string }): Promise<ExpertKnowledgeEntry>;
  revokeExpertKnowledgeEntry(organizationId: string, id: string, reason: string, revokedByUserId: string): Promise<ExpertKnowledgeEntry | null>;
  upvoteExpertKnowledgeEntry(organizationId: string, id: string): Promise<ExpertKnowledgeEntry | null>;
  downvoteExpertKnowledgeEntry(organizationId: string, id: string): Promise<ExpertKnowledgeEntry | null>;
  updateExpertKnowledgeEntry(organizationId: string, id: string, updates: Partial<ExpertKnowledgeEntry>): Promise<ExpertKnowledgeEntry | null>;
  addExpertKnowledgeReview(organizationId: string, id: string, review: ExpertNoteReview): Promise<ExpertKnowledgeEntry | null>;
  deleteExpertKnowledgeEntry(organizationId: string, id: string): Promise<boolean>;

  // Root Cause Analysis (RCA) Sessions
  saveRcaSession(session: RcaSession): Promise<RcaSession>;
  listRcaSessions(organizationId: string, options?: { plantId?: string; assetId?: string; limit?: number }): Promise<RcaSession[]>;
  getRcaSessionById(organizationId: string, id: string): Promise<RcaSession | null>;
  deleteRcaSession(organizationId: string, id: string): Promise<boolean>;
  updateRcaSessionStep(organizationId: string, sessionId: string, stepId: string, status: 'PENDING' | 'PASS' | 'FAIL', technicianNotes?: string, extra?: { isLocked?: boolean; verifiedAt?: string; verifiedBy?: string }): Promise<RcaSession | null>;
  purgeRcaRecordsOlderThan(days: number, organizationId?: string): Promise<{
    deletedRcaSessions: number;
    deletedMaintenanceRecords: number;
    cutoffDate: string;
  }>;

  // Tenant Isolation Context Manager (Strict PostgreSQL RLS)
  withTenantContext?<T>(organizationId: string, callback: () => Promise<T>): Promise<T>;
}

export interface CreateMaintenanceCaseDTO {
  organizationId: string;
  plantId: string;
  assetId: string;
  caseNumber?: string;
  title: string;
  description?: string;
  severity?: MaintenanceCaseSeverity;
  status?: MaintenanceCaseStatus;
  reportedByUserId: string;
  assignedTechnicianUserId?: string | null;
  assignedTechnicianName?: string | null;
  symptomDescription: string;
  operatingConditions?: Record<string, any>;
  visualAssetIds?: string[];
  supportingDocumentIds?: string[];
  sourceTicketId?: string | null;
  partsUsed?: any[] | null;
  diagnosticHypothesis?: DiagnosticHypothesis | null;
  checklist?: ChecklistStep[];
  findings?: TechnicianFindings | null;
  approval?: CaseApproval | null;
  isEscalated?: boolean;
  escalationReason?: string | null;
  candidateForExpertKnowledge?: boolean;
  resolvedAt?: string | null;
  closedAt?: string | null;
  maintenanceRecordId?: string | null;
  // Rich Industrial Ticket Payload Fields
  createdAtFormatted?: string;
  plantName?: string;
  reportedByName?: string;
  reportedByRole?: string;
  assetTag?: string;
  assetName?: string;
  machineStatus?: string;
  faultCode?: string;
  topRootCause?: string;
  probability?: number;
  recommendedFix?: string;
  investigationProgress?: string;
  specialistDiscipline?: string;
  priority?: string;
  lotoApplied?: boolean;
  technicianNotes?: string;
}

export interface MaintenanceCaseFilterOptions {
  plantId?: string;
  assetId?: string;
  status?: MaintenanceCaseStatus;
  severity?: MaintenanceCaseSeverity;
  assignedTechnicianUserId?: string;
  candidateForExpertKnowledge?: boolean;
}

export interface CreateCaseHistoryDTO {
  caseId: string;
  userId: string;
  previousStatus?: MaintenanceCaseStatus | null;
  newStatus: MaintenanceCaseStatus;
  action: string;
  notes?: string | null;
}

export interface CreateVisualAssetDTO {
  organizationId: string;
  plantId?: string | null;
  machineId?: string | null;
  documentId?: string | null;
  documentVersionId?: string | null;
  pageNumber?: number | null;
  assetType: VisualAssetType;
  storageKey: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  width?: number | null;
  height?: number | null;
  description?: string | null;
  equipmentTags?: string[];
  componentLabels?: ComponentLabel[];
  extractionMethod: string;
  modelUsed: string;
  confidenceScore?: number;
  isAmbiguous?: boolean;
  processingStatus?: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  uploadedByUserId?: string | null;
  dataClassification?: string | null;
}

export interface VisualAssetFilterOptions {
  plantId?: string;
  machineId?: string;
  documentId?: string;
  documentVersionId?: string;
  assetType?: VisualAssetType;
  equipmentTag?: string;
  processingStatus?: string;
}

export interface CreateConversationDTO {
  organizationId: string;
  plantId: string;
  assetId?: string | null;
  userId: string;
  title: string;
}

export interface CreateMessageDTO {
  conversationId: string;
  senderType: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';
  isInsufficientEvidence?: boolean;
  conflictDetected?: boolean;
  conflictDetails?: string | null;
}

export interface CreateCitationDTO {
  messageId: string;
  documentId: string;
  documentVersionId: string;
  pageNumber: number;
  knowledgeChunkId?: string | null;
  snippet: string;
  confidenceScore?: number;
  sectionHeading?: string | null;
  documentNumber?: string;
  documentTitle?: string;
}

export interface CreateFeedbackDTO {
  messageId: string;
  userId: string;
  rating: 'HELPFUL' | 'UNHELPFUL';
  comment?: string | null;
}

export interface CreateMachineDTO {
  plantId: string;
  parentAssetId?: string | null;
  assetTag: string;
  name: string;
  machineType?: string;
  area: string;
  building?: string | null;
  productionLine?: string | null;
  locationDescription?: string | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  installationDate?: string | null;
  operationalState?: AssetOperationalState;
  criticality?: MachineCriticality;
  department?: string | null;
  dataClassification?: DataClassification;
  authorizedAccessScope?: MachineAccessScope;
  verificationState?: VerificationState;
  documentationReadiness?: DocumentationReadiness;
  technicalSpecs?: Record<string, string | number | boolean>;
  hasModel3d?: boolean;
  model3dStorageKey?: string | null;
  model3dFormat?: 'glb' | 'gltf' | null;
  hasPidDiagram?: boolean;
  pidStorageKey?: string | null;
  qrCodeData?: string;
  provenance?: string | null;
}

export interface MachineFilterOptions {
  plantId?: string;
  search?: string;
  documentationReadiness?: string;
  operationalState?: string;
  dataClassification?: string;
  hasModel3d?: boolean;
}

export interface CreateMissingInfoTaskDTO {
  machineId: string;
  machineAssetTag?: string;
  machineName?: string;
  assignedUserId?: string | null;
  assignedRole?: OrgRole | null;
  requestedFields: string[];
  instructions: string;
  dueDate?: string | null;
}

export interface MissingInfoTaskFilterOptions {
  machineId?: string;
  assignedUserId?: string;
  status?: string;
}

export interface CreateComponentMappingDTO {
  machineId: string;
  componentId: string;
  componentName: string;
  pidTag: string;
  pidDrawingNumber?: string | null;
  pidCoordinates?: { x: number; y: number; width: number; height: number } | null;
  manualDocumentId?: string | null;
  manualPageNumber?: number | null;
  status?: MappingStatus;
}

export interface IssueEmployeeBadgeDTO {
  userId: string;
  badgeCode: string;
  pinHash: string;
  expiresAt?: string | null;
}

export interface SavePublicKnowledgeDTO {
  manufacturer: string;
  modelNumber: string;
  productFamily?: string;
  publicSpecs: Record<string, string | number>;
  sourceUrl: string;
  sourcePublisher: string;
  verificationStatus?: SpecVerificationStatus;
  sourceType?: OemSourceType;
  matchStatus?: ModelMatchStatus;
  missingModelDetails?: string[];
  completenessSummary?: CompletenessSummary;
  evidenceRecords?: Record<string, SpecEvidenceRecord>;
  conflicts?: SpecConflictInfo[];
  reviewNotes?: string | null;
}

export interface CreateIndustryProfileDTO {
  code: string;
  name: string;
  description: string;
  isCustom?: boolean;
  assetCategories: string[];
  terminology: {
    tagLabel: string;
    assetLabel: string;
    plantLabel: string;
    lineLabel: string;
  };
  drawingTypes: string[];
  customFields?: CustomFieldDefinition[];
  standardCertifications?: string[];
}

export interface CreateEngineeringModel3DDTO {
  plantId?: string;
  machineId?: string;
  assetId?: string;
  industryProfileCode?: string;
  assetCategory?: string;
  title: string;
  manufacturer?: string;
  modelNumber?: string;
  sourceProvider?: string;
  sourceUrl?: string;
  fileFormat: CADFileFormat;
  fileSizeBytes: number;
  fileHashSha256?: string;
  storageKey: string;
  convertedStorageKey?: string;
  modelRevision?: string;
  status?: EngineeringAssetStatus;
  dataClassification?: DataClassification;
  licenseUsageRights?: string;
  uploadedByUserId?: string;
  reviewNotes?: string;
  extractedComponentsCount?: number;
  sourceType?: string;
  viewerOptimized?: boolean;
}

export interface EngineeringModelFilterOptions {
  plantId?: string;
  machineId?: string;
  status?: EngineeringAssetStatus;
  fileFormat?: CADFileFormat;
  industryProfileCode?: string;
}

export interface CreateManufacturerResourceDTO {
  machineId?: string;
  resourceType: ManufacturerResourceType;
  title: string;
  manufacturer: string;
  modelNumber?: string;
  sourceType: 'FILE_UPLOAD' | 'OFFICIAL_URL';
  sourceUrl?: string;
  storageKey?: string;
  fileFormat?: string;
  fileSizeBytes?: number;
  fileHashSha256?: string;
  versionRevision?: string;
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  accessRequirements?: string;
  usageRightsEvidence?: string;
  uploadedByUserId?: string;
  reviewNotes?: string;
}

export interface ManufacturerResourceFilterOptions {
  machineId?: string;
  resourceType?: ManufacturerResourceType;
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  manufacturer?: string;
}

export interface CreateEngineeringDrawingDTO {
  plantId?: string;
  machineId?: string;
  drawingTitle?: string;
  title?: string;
  uniqueDrawingNumber?: string;
  drawingNumber?: string;
  drawingType: DrawingType;
  discipline?: string;
  revision?: string;
  effectiveDate?: string;
  source?: string;
  sourceType?: string;
  storageKey: string;
  originalFileName?: string;
  fileFormat: 'PDF' | 'PNG' | 'JPG' | 'SVG' | 'CAD' | 'DXF' | string;
  fileSizeBytes?: number;
  fileHashSha256?: string;
  status?: EngineeringAssetStatus;
  dataClassification?: DataClassification;
  equipmentTags?: string[];
  uploadedByUserId?: string;
  reviewNotes?: string;
  sheetNumber?: string;
  cadViewerReady?: boolean;
}

export interface EngineeringDrawingFilterOptions {
  plantId?: string;
  machineId?: string;
  drawingType?: DrawingType;
  discipline?: string;
  status?: EngineeringAssetStatus;
}

export interface CreateEmployeeProfileDTO {
  userId: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  role: OrgRole;
  department?: string;
  assignedPlantIds?: string[];
  accountStatus?: EmployeeAccountStatus;
  availabilityStatus?: EmployeeAvailabilityStatus;
  qualificationStatus?: EmployeeQualificationStatus;
  verifiedSkills?: string[];
  specializedMachineIds?: string[];
}

export interface EmployeeProfileFilterOptions {
  department?: string;
  plantId?: string;
  role?: OrgRole;
  accountStatus?: EmployeeAccountStatus;
  availabilityStatus?: EmployeeAvailabilityStatus;
}

export interface SetMachineSpecialistMappingDTO {
  machineId: string;
  plantId: string;
  primarySpecialistUserId?: string | null;
  primarySpecialistName?: string | null;
  backupSpecialistUserIds?: string[];
  requiredCertifications?: string[];
  assignmentStatus?: SpecialistAssignmentStatus;
  escalationTimeoutMinutes?: number;
  escalationRole?: OrgRole;
  assignedByUserId?: string | null;
}

export interface CreateSpecialistTicketDTO {
  ticketNumber?: string;
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
  severity?: TicketSeverity;
  assignedSpecialistUserId?: string | null;
  assignedSpecialistName?: string | null;
  assignmentStatus?: TicketAssignmentStatus;
  status?: TicketStatus;
  // Rich Industrial Ticket Payload Fields
  createdAtFormatted?: string;
  plantName?: string;
  reportedByName?: string;
  reportedByRole?: string;
  assetTag?: string;
  assetName?: string;
  machineStatus?: string;
  faultCode?: string;
  symptomDescription?: string;
  topRootCause?: string;
  probability?: number;
  recommendedFix?: string;
  investigationProgress?: string;
  specialistDiscipline?: string;
  priority?: string;
  lotoApplied?: boolean;
  technicianNotes?: string;
}

export interface SpecialistTicketFilterOptions {
  assignedSpecialistUserId?: string;
  reportedByUserId?: string;
  machineId?: string;
  status?: TicketStatus;
  assignmentStatus?: TicketAssignmentStatus;
  severity?: TicketSeverity;
}

export interface CreateMaintenanceRecordDTO {
  recordNumber?: string;
  plantId: string;
  machineId: string;
  machineAssetTag: string;
  ticketId?: string | null;
  ticketNumber?: string | null;
  caseId?: string | null;
  caseNumber?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  reportingUserId: string;
  reportingUserName?: string | null;
  assignedTechnicianUserId?: string | null;
  assignedTechnicianName?: string | null;
  resolvingTechnicianUserId: string;
  resolvingTechnicianName: string;
  faultCategory: string;
  problemStatement: string;
  observedSymptoms?: string[];
  measurements?: MaintenanceMeasurement[];
  rootCause: string;
  rootCauseStatus?: RootCauseStatus;
  repairActions: string[];
  partsReplaced?: PartReplaced[];
  postRepairTestResults?: PostRepairTestResult[];
  verificationState?: MaintenanceVerificationState;
  verificationNotes?: string | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  requiresRestartApproval?: boolean;
  restartApproved?: boolean;
  restartApprovedByUserId?: string | null;
  restartApprovedAt?: string | null;
  restartNotes?: string | null;
  approvalStatus?: ResolutionApprovalStatus;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  relatedIncidentRecordIds?: string[];
  attachments?: MaintenanceAttachment[];
  knowledgeApproved?: boolean;
  resolvedAt?: string | null;
}

export interface UpdateMaintenanceRecordDTO {
  observedSymptoms?: string[];
  measurements?: MaintenanceMeasurement[];
  rootCause?: string;
  rootCauseStatus?: RootCauseStatus;
  repairActions?: string[];
  partsReplaced?: PartReplaced[];
  postRepairTestResults?: PostRepairTestResult[];
  verificationState?: MaintenanceVerificationState;
  verificationNotes?: string | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  requiresRestartApproval?: boolean;
  restartApproved?: boolean;
  restartApprovedByUserId?: string | null;
  restartApprovedAt?: string | null;
  restartNotes?: string | null;
  approvalStatus?: ResolutionApprovalStatus;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  closedAt?: string | null;
  relatedIncidentRecordIds?: string[];
  attachments?: MaintenanceAttachment[];
  knowledgeApproved?: boolean;
  actorUserId: string;
  note?: string;
}

export interface MaintenanceRecordFilterOptions {
  machineId?: string;
  plantId?: string;
  ticketId?: string;
  caseId?: string;
  faultCategory?: string;
  rootCauseStatus?: RootCauseStatus;
  verificationState?: MaintenanceVerificationState;
  approvalStatus?: ResolutionApprovalStatus;
  requiresRestartApproval?: boolean;
  restartApproved?: boolean;
  technicianUserId?: string;
  isRecurring?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface RecurringFaultOptions {
  timeWindowDays?: number;
  recurrenceCountThreshold?: number;
}

export interface SetRecurringFaultPolicyDTO {
  machineId?: string;
  machineType?: string;
  timeWindowDays?: number;
  recurrenceCountThreshold?: number;
  requiresSafetyStop?: boolean;
  safetyLimits?: {
    maxTemperatureC?: number;
    maxVibrationMmS?: number;
    maxPressureBar?: number;
    minPressureBar?: number;
  };
}

export interface ResolveSpecialistTicketDTO {
  resolvingTechnicianUserId: string;
  resolvingTechnicianName: string;
  faultCategory: string;
  observedSymptoms?: string[];
  measurements?: MaintenanceMeasurement[];
  rootCause: string;
  rootCauseStatus: RootCauseStatus;
  repairActions: string[];
  partsReplaced?: PartReplaced[];
  postRepairTestResults?: PostRepairTestResult[];
  verificationState?: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE';
  requiresRestartApproval?: boolean;
  notes?: string;
}

export interface ReopenSpecialistTicketDTO {
  actorUserId: string;
  reopenReason: string;
}

export interface ApproveTicketRestartDTO {
  actorUserId: string;
  actorName?: string;
  notes?: string;
}





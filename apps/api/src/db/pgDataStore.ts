import pg from 'pg';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
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
  Machine,
  MissingInformationTask,
  ComponentMapping,
  EmployeeBadge,
  MachineLedgerSummary,
  PublicMachineKnowledge,
  SpecVerificationStatus,
  BadgeStatus,
  IndustryProfile,
  EngineeringModel3D,
  ManufacturerResource,
  EngineeringDrawing,
  EngineeringAssetCenterSummary,
  EmployeeProfile,
  MachineSpecialistMapping,
  SpecialistAssignmentStatus,
  SpecialistTicket,
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
  MachineVerificationRecord,
  CADFileFormat,
  ManufacturerResourceType,
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
  TicketSeverity,
  TicketStatus,
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
  OutboxEvent,
  CreateOutboxEventDTO,
} from './dataStore.interface.js';
import { isUuid, sanitizeMachineOrAssetId, toSafeUuidParam } from '../utils/uuid.js';
import { computeMachineVerification } from '../services/machineVerification.service.js';


export class PgDataStore implements IDataStore {
  private expertKnowledgeEntries = new Map<string, ExpertKnowledgeEntry>();
  private rcaSessions = new Map<string, RcaSession>();
  private fallbackSpecialistTickets = new Map<string, SpecialistTicket>();
  private fallbackMaintenanceRecords = new Map<string, MaintenanceRecord>();

  private pool: pg.Pool;
  private rawPool: pg.Pool;
  private tenantContextStorage = new AsyncLocalStorage<{
    organizationId?: string;
    isSystemWorker?: boolean;
    isAdmin?: boolean;
    userId?: string;
  }>();

  constructor(pool: pg.Pool) {
    this.rawPool = pool;
    this.pool = new Proxy(pool, {
      get: (target, prop, receiver) => {
        if (prop === 'query') {
          return async (...args: any[]) => {
            const context = this.tenantContextStorage.getStore();
            let orgId = context?.organizationId;
            const isWorker = context?.isSystemWorker;
            const isAdmin = context?.isAdmin;

            if (!orgId && !isWorker && !isAdmin) {
              orgId = this.extractOrgIdFromParams(args);
            }

            const client = await this.rawPool.connect();
            try {
              if (isWorker || isAdmin) {
                await client.query(`SELECT set_config('app.current_system_worker', 'true', false), set_config('app.is_admin', 'true', false)`);
              } else if (orgId) {
                await client.query(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_organization_id', $1, false)`, [orgId]);
              }
              const result = await (client.query as any)(...args);
              return result;
            } finally {
              if (isWorker || isAdmin || orgId) {
                try {
                  await client.query(`RESET app.current_tenant_id; RESET app.current_organization_id; RESET app.current_system_worker; RESET app.is_admin;`);
                } catch {
                  // ignore reset errors
                }
              }
              client.release();
            }
          };
        }

        if (prop === 'connect') {
          return async (...connectArgs: any[]) => {
            const client = await (target.connect as any)(...connectArgs);
            const context = this.tenantContextStorage.getStore();
            const orgId = context?.organizationId;
            const isWorker = context?.isSystemWorker;
            const isAdmin = context?.isAdmin;

            try {
              if (isWorker || isAdmin) {
                await client.query(`SELECT set_config('app.current_system_worker', 'true', false), set_config('app.is_admin', 'true', false)`);
              } else if (orgId) {
                await client.query(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_organization_id', $1, false)`, [orgId]);
              }
            } catch (e) {
              client.release();
              throw e;
            }

            const originalRelease = client.release.bind(client);
            let released = false;
            client.release = (err?: any) => {
              if (released) return;
              released = true;
              if (isWorker || isAdmin || orgId) {
                client.query(`RESET app.current_tenant_id; RESET app.current_organization_id; RESET app.current_system_worker; RESET app.is_admin;`)
                  .catch(() => {})
                  .finally(() => originalRelease(err));
              } else {
                originalRelease(err);
              }
            };

            return client;
          };
        }

        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private extractOrgIdFromParams(args: any[]): string | undefined {
    if (!args || args.length === 0) return undefined;
    const query = typeof args[0] === 'string' ? args[0] : (args[0]?.text as string);
    const params = Array.isArray(args[1]) ? args[1] : undefined;
    if (!query || !params || params.length === 0) return undefined;

    // Pattern 1: WHERE organization_id = $1, WHERE o.organization_id = $2, WHERE org_id = $1
    const match = query.match(/(?:organization_id|org_id)\s*=\s*\$(\d+)/i);
    if (match && match[1]) {
      const idx = parseInt(match[1], 10) - 1;
      if (params[idx] && typeof params[idx] === 'string' && params[idx].length > 10) {
        return params[idx];
      }
    }

    // Pattern 2: INSERT INTO table (... organization_id ...) VALUES (... $3 ...)
    const insertMatch = query.match(/INSERT\s+INTO\s+[^(]+\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch && insertMatch[1] && insertMatch[2]) {
      const cols = insertMatch[1].split(',').map((c) => c.trim().toLowerCase());
      const vals = insertMatch[2].split(',').map((v) => v.trim());
      const orgColIdx = cols.findIndex((c) => c === 'organization_id' || c === 'org_id');
      if (orgColIdx !== -1 && vals[orgColIdx]) {
        const valPlaceholder = vals[orgColIdx].match(/\$(\d+)/);
        if (valPlaceholder && valPlaceholder[1]) {
          const idx = parseInt(valPlaceholder[1], 10) - 1;
          if (params[idx] && typeof params[idx] === 'string' && params[idx].length > 10) {
            return params[idx];
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Executes a callback within a strict PostgreSQL Row-Level Security tenant context.
   * Runs inside Node's AsyncLocalStorage context so every controller DB query automatically
   * sets `app.current_tenant_id` and `app.current_organization_id` in PostgreSQL.
   */
  public withTenantContext<T>(organizationId: string, callback: () => Promise<T> | T): Promise<T> | T {
    const active = this.tenantContextStorage.getStore();
    if (active?.organizationId === organizationId) {
      return callback();
    }
    return this.tenantContextStorage.run(
      { ...active, organizationId },
      () => callback()
    );
  }

  /**
   * Executes a callback with system worker permissions (bypassing tenant restrictions
   * for cross-tenant operations like outbox polling and scheduled workers).
   */
  public withSystemWorkerContext<T>(callback: () => Promise<T> | T): Promise<T> | T {
    const active = this.tenantContextStorage.getStore();
    return this.tenantContextStorage.run(
      { ...active, isSystemWorker: true, isAdmin: true },
      () => callback()
    );
  }

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
      `SELECT id, name, slug, industry, country, timezone, website, company_size, measurement_units, deployment_type, created_at, updated_at
       FROM organizations WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      industry: row.industry ?? undefined,
      country: row.country ?? undefined,
      timezone: row.timezone ?? undefined,
      website: row.website ?? undefined,
      companySize: row.company_size ?? undefined,
      measurementUnits: (row.measurement_units as 'metric' | 'imperial') ?? 'metric',
      deploymentType: (row.deployment_type as 'saas' | 'enterprise') ?? 'saas',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const res = await this.pool.query(
      `SELECT id, name, slug, industry, country, timezone, website, company_size, measurement_units, deployment_type, created_at, updated_at
       FROM organizations WHERE slug = $1`,
      [slug]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      industry: row.industry ?? undefined,
      country: row.country ?? undefined,
      timezone: row.timezone ?? undefined,
      website: row.website ?? undefined,
      companySize: row.company_size ?? undefined,
      measurementUnits: (row.measurement_units as 'metric' | 'imperial') ?? 'metric',
      deploymentType: (row.deployment_type as 'saas' | 'enterprise') ?? 'saas',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.industry !== undefined) {
      fields.push(`industry = $${idx++}`);
      values.push(updates.industry);
    }
    if (updates.country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(updates.country);
    }
    if (updates.timezone !== undefined) {
      fields.push(`timezone = $${idx++}`);
      values.push(updates.timezone);
    }
    if (updates.website !== undefined) {
      fields.push(`website = $${idx++}`);
      values.push(updates.website);
    }
    if (updates.companySize !== undefined) {
      fields.push(`company_size = $${idx++}`);
      values.push(updates.companySize);
    }
    if (updates.measurementUnits !== undefined) {
      fields.push(`measurement_units = $${idx++}`);
      values.push(updates.measurementUnits);
    }

    if (fields.length === 0) {
      return this.getOrganizationById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const res = await this.pool.query(
      `UPDATE organizations
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, name, slug, industry, country, timezone, website, company_size, measurement_units, deployment_type, created_at, updated_at`,
      values
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      industry: row.industry ?? undefined,
      country: row.country ?? undefined,
      timezone: row.timezone ?? undefined,
      website: row.website ?? undefined,
      companySize: row.company_size ?? undefined,
      measurementUnits: (row.measurement_units as 'metric' | 'imperial') ?? 'metric',
      deploymentType: (row.deployment_type as 'saas' | 'enterprise') ?? 'saas',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------
  private mapUserRow(row: any): User {
    let parsedPreferences = row.preferences;
    if (typeof parsedPreferences === 'string') {
      try {
        parsedPreferences = JSON.parse(parsedPreferences);
      } catch {
        parsedPreferences = undefined;
      }
    }

    return {
      id: row.id,
      externalAuthId: row.external_auth_id,
      email: row.email,
      fullName: row.full_name,
      jobTitle: row.job_title ?? undefined,
      department: row.department ?? undefined,
      phone: row.phone ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      preferences: parsedPreferences ?? undefined,
      emailVerified: row.email_verified ?? false,
      passwordHash: row.password_hash ?? undefined,
      status: row.account_status ?? row.status ?? 'ACTIVE',
      googleId: row.google_id ?? undefined,
      googleEmail: row.google_email ?? undefined,
      authProvider: row.auth_provider ?? undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
  }

  public async createUser(dto: CreateUserDTO): Promise<User> {
    const res = await this.pool.query(
      `INSERT INTO users (external_auth_id, email, full_name, email_verified, password_hash, account_status, google_id, google_email, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.externalAuthId ?? null,
        dto.email,
        dto.fullName,
        dto.emailVerified ?? false,
        dto.passwordHash ?? null,
        dto.status ?? 'ACTIVE',
        dto.googleId ?? null,
        dto.googleEmail ?? null,
        dto.authProvider ?? 'local',
      ]
    );
    return this.mapUserRow(res.rows[0]);
  }

  public async getUserById(id: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapUserRow(res.rows[0]);
  }

  public async getUserByExternalAuthId(externalAuthId: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE external_auth_id = $1`,
      [externalAuthId]
    );
    if (res.rows.length === 0) return null;
    return this.mapUserRow(res.rows[0]);
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (res.rows.length === 0) return null;
    return this.mapUserRow(res.rows[0]);
  }

  public async getUserByGoogleId(googleId: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE google_id = $1`,
      [googleId]
    );
    if (res.rows.length === 0) return null;
    return this.mapUserRow(res.rows[0]);
  }

  public async setUserGoogleId(userId: string, googleId: string, googleEmail?: string): Promise<User | null> {
    await this.pool.query(
      `UPDATE users
       SET google_id = $1, google_email = $2, auth_provider = 'google', updated_at = NOW()
       WHERE id = $3`,
      [googleId, googleEmail ? googleEmail.toLowerCase() : null, userId]
    );
    return this.getUserById(userId);
  }

  public async unlinkUserGoogleId(userId: string): Promise<User | null> {
    const user = await this.getUserById(userId);
    const newProvider = user?.passwordHash ? 'local' : 'email_otp';
    await this.pool.query(
      `UPDATE users
       SET google_id = NULL, google_email = NULL, auth_provider = $1, updated_at = NOW()
       WHERE id = $2`,
      [newProvider, userId]
    );
    return this.getUserById(userId);
  }

  private pgUserSessions: Map<string, UserSession[]> = new Map();

  public async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.fullName !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(updates.fullName);
    }
    if (updates.jobTitle !== undefined) {
      fields.push(`job_title = $${idx++}`);
      values.push(updates.jobTitle);
    }
    if (updates.department !== undefined) {
      fields.push(`department = $${idx++}`);
      values.push(updates.department);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(updates.phone);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${idx++}`);
      values.push(updates.avatarUrl);
    }
    if (updates.preferences !== undefined) {
      fields.push(`preferences = $${idx++}`);
      values.push(JSON.stringify(updates.preferences));
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const res = await this.pool.query(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );

    if (res.rows.length === 0) return null;
    return this.mapUserRow(res.rows[0]);
  }

  public async listUserSessions(userId: string): Promise<UserSession[]> {
    let sessions = this.pgUserSessions.get(userId);
    if (!sessions || sessions.length === 0) {
      sessions = [
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
      this.pgUserSessions.set(userId, sessions);
    }
    return sessions;
  }

  public async revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
    const sessions = await this.listUserSessions(userId);
    const filtered = sessions.filter((s) => s.id !== sessionId);
    if (filtered.length !== sessions.length) {
      this.pgUserSessions.set(userId, filtered);
      return true;
    }
    return false;
  }

  public async revokeAllUserSessions(userId: string): Promise<number> {
    const sessions = await this.listUserSessions(userId);
    const count = sessions.length;
    this.pgUserSessions.set(userId, []);
    return count;
  }

  public async getUserByVerificationToken(tokenHash: string): Promise<User | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE verification_token_hash = $1`,
      [tokenHash]
    );
    if (res.rows.length === 0) return null;
    return this.mapUserRow(res.rows[0]);
  }

  public async setUserEmailVerified(userId: string, verified: boolean): Promise<User | null> {
    await this.pool.query(
      `UPDATE users
       SET email_verified = $1, verification_token_hash = NULL, verification_expires_at = NULL, updated_at = NOW()
       WHERE id = $2`,
      [verified, userId]
    );
    return this.getUserById(userId);
  }

  public async setUserVerificationToken(
    userId: string,
    tokenHash: string | null,
    expiresAt: string | null
  ): Promise<User | null> {
    await this.pool.query(
      `UPDATE users
       SET verification_token_hash = $1, verification_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [tokenHash, expiresAt, userId]
    );
    return this.getUserById(userId);
  }

  public async setUserPassword(userId: string, passwordHash: string): Promise<User | null> {
    await this.pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, userId]
    );
    return this.getUserById(userId);
  }

  public async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  public async getPasswordResetToken(
    tokenHash: string
  ): Promise<{ userId: string; expiresAt: string; usedAt: string | null } | null> {
    const res = await this.pool.query(
      `SELECT user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      userId: row.user_id,
      expiresAt: row.expires_at.toISOString(),
      usedAt: row.used_at ? row.used_at.toISOString() : null,
    };
  }

  public async consumePasswordResetToken(tokenHash: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [tokenHash]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Email OTP & Google OAuth Identity Methods
  // --------------------------------------------------------------------------
  public async createEmailOtp(dto: CreateEmailOtpDTO): Promise<EmailOtpRecord> {
    const res = await this.pool.query(
      `INSERT INTO email_otp_codes (email, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, code_hash, purpose, attempts, max_attempts, expires_at, used_at, created_at`,
      [dto.email.toLowerCase(), dto.codeHash, dto.purpose, dto.expiresAt]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      codeHash: row.code_hash,
      purpose: row.purpose,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      expiresAt: row.expires_at.toISOString(),
      usedAt: row.used_at ? row.used_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  public async getLatestEmailOtp(email: string, purpose: string): Promise<EmailOtpRecord | null> {
    const res = await this.pool.query(
      `SELECT id, email, code_hash, purpose, attempts, max_attempts, expires_at, used_at, created_at
       FROM email_otp_codes
       WHERE LOWER(email) = LOWER($1) AND purpose = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, purpose]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      codeHash: row.code_hash,
      purpose: row.purpose,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      expiresAt: row.expires_at.toISOString(),
      usedAt: row.used_at ? row.used_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  public async incrementEmailOtpAttempts(otpId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE email_otp_codes
       SET attempts = attempts + 1
       WHERE id = $1
       RETURNING attempts`,
      [otpId]
    );
    if (res.rows.length === 0) return 0;
    return res.rows[0].attempts;
  }

  public async consumeEmailOtp(otpId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE email_otp_codes
       SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [otpId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async countRecentEmailOtps(email: string, sinceDate: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM email_otp_codes
       WHERE LOWER(email) = LOWER($1) AND created_at >= $2`,
      [email, sinceDate]
    );
    return res.rows[0]?.count ?? 0;
  }

  public async saveGoogleOAuthState(dto: SaveGoogleOAuthStateDTO): Promise<GoogleOAuthStateRecord> {
    const res = await this.pool.query(
      `INSERT INTO google_oauth_states (state, purpose, redirect_uri, invitation_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING state, purpose, redirect_uri, invitation_token, expires_at, created_at`,
      [dto.state, dto.purpose, dto.redirectUri, dto.invitationToken ?? null, dto.expiresAt]
    );
    const row = res.rows[0];
    return {
      state: row.state,
      purpose: row.purpose,
      redirectUri: row.redirect_uri,
      invitationToken: row.invitation_token ?? undefined,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  public async getGoogleOAuthState(state: string): Promise<GoogleOAuthStateRecord | null> {
    const res = await this.pool.query(
      `SELECT state, purpose, redirect_uri, invitation_token, expires_at, created_at
       FROM google_oauth_states
       WHERE state = $1`,
      [state]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      state: row.state,
      purpose: row.purpose,
      redirectUri: row.redirect_uri,
      invitationToken: row.invitation_token ?? undefined,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  public async consumeGoogleOAuthState(state: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM google_oauth_states
       WHERE state = $1 AND expires_at > NOW()
       RETURNING state`,
      [state]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Memberships
  // --------------------------------------------------------------------------
  public async createMembership(dto: CreateMembershipDTO): Promise<OrganizationMembership> {
    const res = await this.pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status, assigned_plant_ids)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, user_id, role, status, assigned_plant_ids, created_at, updated_at`,
      [dto.organizationId, dto.userId, dto.role, dto.status ?? 'ACTIVE', dto.assignedPlantIds ?? []]
    );
    const row = res.rows[0];
    const user = await this.getUserById(dto.userId);
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      user: user ?? undefined,
    };
  }

  public async getMembership(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    const res = await this.pool.query(
      `SELECT m.id, m.organization_id, m.user_id, m.role, m.status, m.assigned_plant_ids, m.created_at, m.updated_at,
              u.email, u.full_name, u.external_auth_id, u.created_at as user_created_at, u.updated_at as user_updated_at
       FROM organization_memberships m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.user_id = $1 AND m.organization_id = $2`,
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
      assignedPlantIds: row.assigned_plant_ids ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      user: row.email
        ? {
            id: row.user_id,
            externalAuthId: row.external_auth_id,
            email: row.email,
            fullName: row.full_name,
            createdAt: row.user_created_at.toISOString(),
            updatedAt: row.user_updated_at.toISOString(),
          }
        : undefined,
    };
  }

  public async getMembershipById(organizationId: string, membershipId: string): Promise<OrganizationMembership | null> {
    const res = await this.pool.query(
      `SELECT m.id, m.organization_id, m.user_id, m.role, m.status, m.assigned_plant_ids, m.created_at, m.updated_at,
              u.email, u.full_name, u.external_auth_id, u.created_at as user_created_at, u.updated_at as user_updated_at
       FROM organization_memberships m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.organization_id = $2`,
      [membershipId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      user: row.email
        ? {
            id: row.user_id,
            externalAuthId: row.external_auth_id,
            email: row.email,
            fullName: row.full_name,
            createdAt: row.user_created_at.toISOString(),
            updatedAt: row.user_updated_at.toISOString(),
          }
        : undefined,
    };
  }

  public async listUserMemberships(userId: string): Promise<OrganizationMembership[]> {
    const res = await this.pool.query(
      `SELECT m.id, m.organization_id, m.user_id, m.role, m.status, m.assigned_plant_ids, m.created_at, m.updated_at,
              u.email, u.full_name, u.external_auth_id, u.created_at as user_created_at, u.updated_at as user_updated_at
       FROM organization_memberships m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.user_id = $1`,
      [userId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      user: row.email
        ? {
            id: row.user_id,
            externalAuthId: row.external_auth_id,
            email: row.email,
            fullName: row.full_name,
            createdAt: row.user_created_at.toISOString(),
            updatedAt: row.user_updated_at.toISOString(),
          }
        : undefined,
    }));
  }

  public async listOrganizationMembers(organizationId: string): Promise<OrganizationMembership[]> {
    const res = await this.pool.query(
      `SELECT m.id, m.organization_id, m.user_id, m.role, m.status, m.assigned_plant_ids, m.created_at, m.updated_at,
              u.email, u.full_name, u.external_auth_id, u.created_at as user_created_at, u.updated_at as user_updated_at
       FROM organization_memberships m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
       ORDER BY m.created_at ASC`,
      [organizationId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as MembershipStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      user: row.email
        ? {
            id: row.user_id,
            externalAuthId: row.external_auth_id,
            email: row.email,
            fullName: row.full_name,
            createdAt: row.user_created_at.toISOString(),
            updatedAt: row.user_updated_at.toISOString(),
          }
        : undefined,
    }));
  }

  public async updateMembershipRole(
    organizationId: string,
    membershipId: string,
    role: OrgRole,
    assignedPlantIds?: string[]
  ): Promise<OrganizationMembership | null> {
    const query = assignedPlantIds !== undefined
      ? `UPDATE organization_memberships
         SET role = $1, assigned_plant_ids = $2, updated_at = NOW()
         WHERE id = $3 AND organization_id = $4
         RETURNING id`
      : `UPDATE organization_memberships
         SET role = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3
         RETURNING id`;

    const params = assignedPlantIds !== undefined
      ? [role, assignedPlantIds, membershipId, organizationId]
      : [role, membershipId, organizationId];

    const res = await this.pool.query(query, params);
    if (res.rows.length === 0) return null;
    return this.getMembershipById(organizationId, membershipId);
  }

  public async updateMembershipStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipStatus
  ): Promise<OrganizationMembership | null> {
    const res = await this.pool.query(
      `UPDATE organization_memberships
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING id`,
      [status, membershipId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.getMembershipById(organizationId, membershipId);
  }

  public async deleteMembership(organizationId: string, membershipId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM organization_memberships WHERE id = $1 AND organization_id = $2`,
      [membershipId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------
  public async createInvitation(dto: CreateInvitationDTO): Promise<OrganizationInvitation> {
    const res = await this.pool.query(
      `INSERT INTO organization_invitations (
         organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
         assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
         employee_id, department, designation
       )
       VALUES ($1, LOWER($2), $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
                 assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
                 activation_code_attempts, employee_id, department, designation, created_at, updated_at`,
      [
        dto.organizationId,
        dto.email,
        dto.role,
        dto.invitedByUserId,
        dto.tokenHash,
        dto.expiresAt,
        dto.assignedPlantIds ?? [],
        dto.assignedMachineIds ?? [],
        dto.qrTokenHash ?? null,
        dto.qrExpiresAt ?? null,
        dto.activationCodeHash ?? null,
        dto.employeeId ?? null,
        dto.department ?? null,
        dto.designation ?? null,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getInvitationById(organizationId: string, invitationId: string): Promise<OrganizationInvitation | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
              assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
              activation_code_attempts, employee_id, department, designation, created_at, updated_at
       FROM organization_invitations
       WHERE id = $1 AND organization_id = $2`,
      [invitationId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getInvitationByTokenHash(tokenHash: string): Promise<OrganizationInvitation | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
              assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
              activation_code_attempts, employee_id, department, designation, created_at, updated_at
       FROM organization_invitations
       WHERE token_hash = $1`,
      [tokenHash]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getInvitationByQrTokenHash(qrTokenHash: string): Promise<OrganizationInvitation | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
              assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
              activation_code_attempts, employee_id, department, designation, created_at, updated_at
       FROM organization_invitations
       WHERE qr_token_hash = $1`,
      [qrTokenHash]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const isExpired = row.qr_expires_at && new Date(row.qr_expires_at) < new Date() && row.status === 'PENDING';
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: (isExpired ? 'EXPIRED' : row.status) as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getInvitationByActivationCodeHash(codeHash: string): Promise<OrganizationInvitation | null> {
    const res = await this.pool.query(
      `SELECT id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
              assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
              activation_code_attempts, employee_id, department, designation, created_at, updated_at
       FROM organization_invitations
       WHERE activation_code_hash = $1`,
      [codeHash]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async incrementActivationCodeAttempts(invitationId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE organization_invitations
       SET activation_code_attempts = activation_code_attempts + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING activation_code_attempts`,
      [invitationId]
    );
    return res.rows[0]?.activation_code_attempts ?? 0;
  }

  public async updateInvitationQrToken(
    invitationId: string,
    qrTokenHash: string,
    qrExpiresAt: string
  ): Promise<OrganizationInvitation | null> {
    const res = await this.pool.query(
      `UPDATE organization_invitations
       SET qr_token_hash = $1, qr_expires_at = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
                 assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
                 activation_code_attempts, employee_id, department, designation, created_at, updated_at`,
      [qrTokenHash, qrExpiresAt, invitationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async listInvitations(organizationId: string, status?: InvitationStatus): Promise<OrganizationInvitation[]> {
    const query = status
      ? `SELECT id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
                assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
                activation_code_attempts, employee_id, department, designation, created_at, updated_at
         FROM organization_invitations
         WHERE organization_id = $1 AND status = $2
         ORDER BY created_at DESC`
      : `SELECT id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
                assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
                activation_code_attempts, employee_id, department, designation, created_at, updated_at
         FROM organization_invitations
         WHERE organization_id = $1
         ORDER BY created_at DESC`;

    const params = status ? [organizationId, status] : [organizationId];
    const res = await this.pool.query(query, params);
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  public async updateInvitationStatus(
    invitationId: string,
    status: InvitationStatus
  ): Promise<OrganizationInvitation | null> {
    const res = await this.pool.query(
      `UPDATE organization_invitations
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, organization_id, email, role, invited_by_user_id, token_hash, expires_at, status,
                 assigned_plant_ids, assigned_machine_ids, qr_token_hash, qr_expires_at, activation_code_hash,
                 activation_code_attempts, employee_id, department, designation, created_at, updated_at`,
      [status, invitationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role as OrgRole,
      invitedByUserId: row.invited_by_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      status: row.status as InvitationStatus,
      assignedPlantIds: row.assigned_plant_ids ?? [],
      assignedMachineIds: row.assigned_machine_ids ?? [],
      qrTokenHash: row.qr_token_hash ?? undefined,
      qrExpiresAt: row.qr_expires_at ? row.qr_expires_at.toISOString() : undefined,
      activationCodeHash: row.activation_code_hash ?? undefined,
      activationCodeAttempts: row.activation_code_attempts ?? 0,
      employeeId: row.employee_id ?? undefined,
      department: row.department ?? undefined,
      designation: row.designation ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async deleteInvitation(organizationId: string, invitationId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM organization_invitations WHERE id = $1 AND organization_id = $2`,
      [invitationId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Organization Registration & Onboarding
  // --------------------------------------------------------------------------
  public async registerOrganizationWithAdmin(
    dto: RegisterOrganizationDTO
  ): Promise<{ organization: Organization; adminUser: User; membership: OrganizationMembership }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Check duplicate slug
      const checkSlug = await client.query(`SELECT id FROM organizations WHERE slug = $1`, [dto.organizationSlug]);
      if (checkSlug.rows.length > 0) {
        throw new Error(`Organization slug '${dto.organizationSlug}' is already claimed.`);
      }

      // 2. Create organization with industry and deployment metadata
      const orgRes = await client.query(
        `INSERT INTO organizations (name, slug, industry, country, timezone, website, company_size, deployment_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, slug, industry, country, timezone, website, company_size, deployment_type, created_at, updated_at`,
        [
          dto.organizationName,
          dto.organizationSlug,
          dto.industry ?? null,
          dto.country ?? null,
          dto.timezone ?? null,
          dto.website ?? null,
          dto.companySize ?? null,
          dto.deploymentType ?? 'saas',
        ]
      );
      const orgRow = orgRes.rows[0];
      const organization: Organization = {
        id: orgRow.id,
        name: orgRow.name,
        slug: orgRow.slug,
        industry: orgRow.industry ?? undefined,
        country: orgRow.country ?? undefined,
        timezone: orgRow.timezone ?? undefined,
        website: orgRow.website ?? undefined,
        companySize: orgRow.company_size ?? undefined,
        deploymentType: orgRow.deployment_type ?? 'saas',
        createdAt: orgRow.created_at.toISOString(),
        updatedAt: orgRow.updated_at.toISOString(),
      };

      // 3. Find or create user
      let userRes = await client.query(
        `SELECT id, external_auth_id, email, full_name, email_verified, password_hash, created_at, updated_at
         FROM users WHERE external_auth_id = $1 OR email = $2`,
        [dto.externalAuthId, dto.adminEmail]
      );

      let adminUser: User;
      const emailVerified = dto.verificationTokenHash ? false : true;
      if (userRes.rows.length > 0) {
        const uRow = userRes.rows[0];
        if (dto.passwordHash || dto.verificationTokenHash) {
          await client.query(
            `UPDATE users
             SET password_hash = COALESCE($1, password_hash),
                 email_verified = $2,
                 verification_token_hash = $3,
                 verification_expires_at = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [
              dto.passwordHash ?? null,
              emailVerified,
              dto.verificationTokenHash ?? null,
              dto.verificationExpiresAt ?? null,
              uRow.id,
            ]
          );
        }
        adminUser = {
          id: uRow.id,
          externalAuthId: uRow.external_auth_id,
          email: uRow.email,
          fullName: uRow.full_name,
          emailVerified,
          passwordHash: dto.passwordHash ?? uRow.password_hash,
          createdAt: uRow.created_at.toISOString(),
          updatedAt: uRow.updated_at.toISOString(),
        };
      } else {
        const insUser = await client.query(
          `INSERT INTO users (external_auth_id, email, full_name, password_hash, email_verified, verification_token_hash, verification_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, external_auth_id, email, full_name, email_verified, password_hash, created_at, updated_at`,
          [
            dto.externalAuthId,
            dto.adminEmail,
            dto.adminFullName,
            dto.passwordHash ?? null,
            emailVerified,
            dto.verificationTokenHash ?? null,
            dto.verificationExpiresAt ?? null,
          ]
        );
        const uRow = insUser.rows[0];
        adminUser = {
          id: uRow.id,
          externalAuthId: uRow.external_auth_id,
          email: uRow.email,
          fullName: uRow.full_name,
          emailVerified: uRow.email_verified,
          passwordHash: uRow.password_hash,
          createdAt: uRow.created_at.toISOString(),
          updatedAt: uRow.updated_at.toISOString(),
        };
      }

      // 4. Create membership as ORGANIZATION_OWNER
      const memRes = await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status, assigned_plant_ids)
         VALUES ($1, $2, 'ORGANIZATION_OWNER', 'ACTIVE', '{}')
         RETURNING id, organization_id, user_id, role, status, assigned_plant_ids, created_at, updated_at`,
        [organization.id, adminUser.id]
      );
      const mRow = memRes.rows[0];
      const membership: OrganizationMembership = {
        id: mRow.id,
        organizationId: mRow.organization_id,
        userId: mRow.user_id,
        role: mRow.role as OrgRole,
        status: mRow.status as MembershipStatus,
        assignedPlantIds: mRow.assigned_plant_ids ?? [],
        createdAt: mRow.created_at.toISOString(),
        updatedAt: mRow.updated_at.toISOString(),
        user: adminUser,
      };

      // 5. Create initial site if specified
      if (dto.initialSiteName) {
        const plantCode = `SITE-${organization.slug.toUpperCase().slice(0, 8)}`;
        await client.query(
          `INSERT INTO plants (organization_id, code, name, location, air_gapped_mode)
           VALUES ($1, $2, $3, $4, FALSE)
           ON CONFLICT DO NOTHING`,
          [organization.id, plantCode, dto.initialSiteName, dto.country || 'Primary Manufacturing Facility']
        );
      }

      await client.query('COMMIT');
      return { organization, adminUser, membership };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
       WHERE (id::text = $1 OR code = $1) AND organization_id = $2`,
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
        dto.manufacturer ?? null,
        dto.modelNumber ?? null,
        dto.serialNumber ?? null,
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
    const cleanId = sanitizeMachineOrAssetId(assetId);
    const res = await this.pool.query(
      `SELECT id, organization_id, plant_id, parent_asset_id, asset_tag, name,
              area, manufacturer, model_number, serial_number, operational_state,
              created_at, updated_at
       FROM assets
       WHERE (id::text = $1 OR id::text = $3 OR asset_tag = $1 OR asset_tag = $3) AND organization_id = $2`,
      [cleanId, organizationId, assetId]
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
    const primaryMachineId = dto.machineId || (dto.assetIds && dto.assetIds.length > 0 ? dto.assetIds[0] : null);
    const res = await this.pool.query(
      `INSERT INTO documents (
         organization_id, plant_id, document_number, title, category,
         asset_tags, asset_ids, machine_id, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, organization_id, plant_id, document_number, title,
                 category, asset_tags, asset_ids, machine_id, created_by_user_id, created_at, updated_at`,
      [
        dto.organizationId,
        dto.plantId,
        dto.documentNumber,
        dto.title,
        dto.category,
        dto.assetTags ?? [],
        dto.assetIds ?? [],
        primaryMachineId,
        dto.createdByUserId ?? null,
      ]
    );
    const row = res.rows[0];

    // Populate asset_documents junction table
    const allLinkedAssetIds = new Set<string>();
    if (primaryMachineId) allLinkedAssetIds.add(primaryMachineId);
    if (dto.assetIds && Array.isArray(dto.assetIds)) {
      for (const aId of dto.assetIds) {
        if (aId) allLinkedAssetIds.add(aId);
      }
    }

    for (const aId of allLinkedAssetIds) {
      try {
        await this.pool.query(
          `INSERT INTO asset_documents (organization_id, asset_id, document_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, asset_id, document_id) DO NOTHING`,
          [dto.organizationId, aId, row.id]
        );
      } catch {
        // ignore junction insertion errors
      }
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      documentNumber: row.document_number,
      title: row.title,
      category: row.category,
      assetTags: row.asset_tags ?? [],
      assetIds: row.asset_ids ?? [],
      machineId: row.machine_id ?? undefined,
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
              d.category, d.asset_tags, d.asset_ids, d.machine_id, d.created_by_user_id, d.created_at, d.updated_at,
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
       WHERE (d.id::text = $1 OR d.document_number = $1) AND d.organization_id = $2`,
      [documentId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapDocumentRow(res.rows[0]);
  }

  public async getDocumentByNumber(organizationId: string, documentNumber: string): Promise<TechnicalDocument | null> {
    const res = await this.pool.query(
      `SELECT d.id, d.organization_id, d.plant_id, d.document_number, d.title,
              d.category, d.asset_tags, d.asset_ids, d.machine_id, d.created_by_user_id, d.created_at, d.updated_at,
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

    const targetAssetId = filter?.machineId || filter?.assetId;
    if (targetAssetId) {
      let resolvedUuid = toSafeUuidParam(targetAssetId);
      let resolvedTag = targetAssetId;

      if (!resolvedUuid) {
        const m = await this.getMachineById(organizationId, targetAssetId);
        if (m) {
          resolvedUuid = toSafeUuidParam(m.id);
          resolvedTag = m.assetTag;
        }
      }

      params.push(resolvedUuid || null);
      const uuidIdx = params.length;
      params.push(resolvedTag);
      const tagIdx = params.length;

      conditions.push(
        `(
          ($${uuidIdx}::text IS NOT NULL AND $${uuidIdx}::text != '' AND (
            d.machine_id::text = $${uuidIdx} OR
            $${uuidIdx}::text = ANY(d.asset_ids) OR
            EXISTS (SELECT 1 FROM asset_documents ad WHERE ad.document_id = d.id AND ad.asset_id::text = $${uuidIdx})
          )) OR
          $${tagIdx}::text = ANY(d.asset_tags) OR
          $${tagIdx}::text = ANY(d.asset_ids) OR
          d.machine_id::text = $${tagIdx} OR
          EXISTS (
            SELECT 1 FROM asset_documents ad
            JOIN assets a ON a.id = ad.asset_id
            WHERE ad.document_id = d.id AND (ad.asset_id::text = $${tagIdx} OR a.asset_tag = $${tagIdx})
          )
        )`
      );
    }

    const res = await this.pool.query(
      `SELECT d.id, d.organization_id, d.plant_id, d.document_number, d.title,
              d.category, d.asset_tags, d.asset_ids, d.machine_id, d.created_by_user_id, d.created_at, d.updated_at,
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
      `DELETE FROM documents WHERE (id::text = $1 OR document_number = $1) AND organization_id = $2 RETURNING id`,
      [documentId, organizationId]
    );
    return res.rows.length > 0;
  }

  public async linkDocumentToAsset(
    organizationId: string,
    documentId: string,
    assetId: string,
    assetTag?: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO asset_documents (organization_id, asset_id, document_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, asset_id, document_id) DO NOTHING`,
        [organizationId, assetId, documentId]
      );
    } catch {
      // ignore junction error
    }

    try {
      if (assetTag && assetTag.trim()) {
        await this.pool.query(
          `UPDATE documents
           SET asset_ids = ARRAY(
                 SELECT DISTINCT unnest(array_append(COALESCE(asset_ids, '{}'), $2::text))
               ),
               asset_tags = ARRAY(
                 SELECT DISTINCT unnest(array_append(COALESCE(asset_tags, '{}'), $3::text))
               ),
               machine_id = COALESCE(machine_id, $2::uuid)
           WHERE organization_id = $1 AND id = $4`,
          [organizationId, assetId, assetTag.trim(), documentId]
        );
      } else {
        await this.pool.query(
          `UPDATE documents
           SET asset_ids = ARRAY(
                 SELECT DISTINCT unnest(array_append(COALESCE(asset_ids, '{}'), $2::text))
               ),
               machine_id = COALESCE(machine_id, $2::uuid)
           WHERE organization_id = $1 AND id = $3`,
          [organizationId, assetId, documentId]
        );
      }
    } catch {
      // ignore
    }
  }

  public async getLinkedMachineIdsForDocument(
    organizationId: string,
    documentId: string
  ): Promise<string[]> {
    try {
      const res = await this.pool.query(
        `SELECT DISTINCT asset_id::text AS machine_id FROM asset_documents WHERE organization_id = $1 AND document_id = $2
         UNION
         SELECT unnest(asset_ids)::text AS machine_id FROM documents WHERE organization_id = $1 AND id = $2 AND asset_ids IS NOT NULL AND array_length(asset_ids, 1) > 0
         UNION
         SELECT machine_id::text FROM documents WHERE organization_id = $1 AND id = $2 AND machine_id IS NOT NULL`,
        [organizationId, documentId]
      );
      return res.rows.map((r) => r.machine_id).filter(Boolean);
    } catch {
      return [];
    }
  }

  public async isDocumentLinkedToAsset(
    organizationId: string,
    documentId: string,
    assetId: string
  ): Promise<boolean> {
    try {
      let resolvedUuid = toSafeUuidParam(assetId);
      let resolvedTag = assetId;

      if (!resolvedUuid) {
        const m = await this.getMachineById(organizationId, assetId);
        if (m) {
          resolvedUuid = toSafeUuidParam(m.id);
          resolvedTag = m.assetTag;
        }
      }

      const res = await this.pool.query(
        `SELECT 1 FROM documents d
         LEFT JOIN asset_documents ad ON ad.document_id = d.id AND (
           ad.asset_id::text = $3 OR
           ad.asset_id::text = $4
         )
         WHERE d.organization_id::text = $1 AND d.id::text = $2 AND (
           d.machine_id::text = $3 OR
           d.machine_id::text = $4 OR
           $3 = ANY(d.asset_ids) OR
           $4 = ANY(d.asset_ids) OR
           $4 = ANY(d.asset_tags) OR
           ad.asset_id::text = $3 OR
           ad.asset_id::text = $4
         ) LIMIT 1`,
        [organizationId, documentId, resolvedUuid || '', resolvedTag]
      );
      return res.rows.length > 0;
    } catch {
      return false;
    }
  }

  public async withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.rawPool.connect();
    const context = this.tenantContextStorage.getStore();
    const orgId = context?.organizationId;
    const isWorker = context?.isSystemWorker;
    const isAdmin = context?.isAdmin;

    try {
      if (isWorker || isAdmin) {
        await client.query(`SELECT set_config('app.current_system_worker', 'true', false), set_config('app.is_admin', 'true', false)`);
      } else if (orgId) {
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_organization_id', $1, false)`, [orgId]);
      }
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      if (isWorker || isAdmin || orgId) {
        await client.query(`RESET app.current_tenant_id; RESET app.current_organization_id; RESET app.current_system_worker; RESET app.is_admin;`).catch(() => {});
      }
      client.release();
    }
  }

  public async createOutboxEvent(dto: CreateOutboxEventDTO, client?: pg.PoolClient): Promise<OutboxEvent> {
    const runner = client || this.pool;
    const id = dto.id || crypto.randomUUID();
    const res = await runner.query(
      `INSERT INTO outbox_events (id, organization_id, aggregate_type, aggregate_id, event_type, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       RETURNING id, organization_id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, error_message, created_at, processed_at`,
      [id, dto.organizationId, dto.aggregateType, dto.aggregateId, dto.eventType, JSON.stringify(dto.payload)]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      processedAt: row.processed_at ? row.processed_at.toISOString() : null,
    };
  }

  public async fetchPendingOutboxEvents(limit = 10): Promise<OutboxEvent[]> {
    const client = await this.rawPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_system_worker', 'true', false), set_config('app.is_admin', 'true', false)`);
      const res = await client.query(
        `SELECT id, organization_id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, error_message, created_at, processed_at
         FROM outbox_events
         WHERE status = 'PENDING'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );
      if (res.rows.length > 0) {
        const ids = res.rows.map((r: any) => r.id);
        await client.query(
          `UPDATE outbox_events SET status = 'PROCESSING' WHERE id = ANY($1::uuid[])`,
          [ids]
        );
      }
      await client.query('COMMIT');
      return res.rows.map((row: any) => ({
        id: row.id,
        organizationId: row.organization_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        status: 'PROCESSING',
        retryCount: row.retry_count,
        errorMessage: row.error_message,
        createdAt: row.created_at.toISOString(),
        processedAt: row.processed_at ? row.processed_at.toISOString() : null,
      }));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query(`RESET app.current_system_worker; RESET app.is_admin;`).catch(() => {});
      client.release();
    }
  }

  public async markOutboxEventProcessed(id: string): Promise<void> {
    const client = await this.rawPool.connect();
    try {
      await client.query(`SELECT set_config('app.current_system_worker', 'true', false), set_config('app.is_admin', 'true', false)`);
      await client.query(
        `UPDATE outbox_events SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`,
        [id]
      );
    } finally {
      await client.query(`RESET app.current_system_worker; RESET app.is_admin;`).catch(() => {});
      client.release();
    }
  }

  public async markOutboxEventFailed(id: string, errorMessage: string): Promise<void> {
    const client = await this.rawPool.connect();
    try {
      await client.query(`SELECT set_config('app.current_system_worker', 'true', false), set_config('app.is_admin', 'true', false)`);
      await client.query(
        `UPDATE outbox_events SET status = 'FAILED', retry_count = retry_count + 1, error_message = $2 WHERE id = $1`,
        [id, errorMessage]
      );
    } finally {
      await client.query(`RESET app.current_system_worker; RESET app.is_admin;`).catch(() => {});
      client.release();
    }
  }

  public async createDocumentWithOutbox(
    docDto: CreateDocumentDTO,
    versionDto: CreateDocumentVersionDTO,
    eventDto: CreateOutboxEventDTO,
    assetIds?: string[]
  ): Promise<{ document: TechnicalDocument; version: DocumentVersion; outboxEvent: OutboxEvent }> {
    const client = await this.rawPool.connect();
    const orgId = docDto.organizationId || this.tenantContextStorage.getStore()?.organizationId;
    try {
      if (orgId) {
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_organization_id', $1, false)`, [orgId]);
      }
      await client.query('BEGIN');

      const targetAssetIds = Array.from(
        new Set([...(docDto.assetIds ?? []), ...(assetIds ?? []), ...(docDto.machineId ? [docDto.machineId] : [])])
      ).filter(Boolean);

      // 1. Insert document
      const docRes = await client.query(
        `INSERT INTO documents (
           organization_id, plant_id, document_number, title, category,
           asset_tags, asset_ids, machine_id, data_classification, is_confidential, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, organization_id, plant_id, document_number, title,
                   category, asset_tags, asset_ids, machine_id, data_classification,
                   is_confidential, created_by_user_id, created_at, updated_at`,
        [
          docDto.organizationId,
          docDto.plantId,
          docDto.documentNumber,
          docDto.title,
          docDto.category,
          docDto.assetTags ?? [],
          targetAssetIds,
          docDto.machineId ?? null,
          docDto.dataClassification ?? 'INTERNAL',
          docDto.isConfidential ?? false,
          docDto.createdByUserId ?? null,
        ]
      );
      const docRow = docRes.rows[0];
      const documentId = docRow.id;

      // 2. Insert document version
      const verRes = await client.query(
        `INSERT INTO document_versions (
           document_id, version_number, revision, filename, mime_type,
           file_size_bytes, checksum_sha256, storage_key, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, document_id, version_number, revision, filename,
                   mime_type, file_size_bytes, checksum_sha256, storage_key,
                   status, total_pages, total_chunks, error_message, created_at, updated_at`,
        [
          documentId,
          versionDto.versionNumber,
          versionDto.revision,
          versionDto.filename,
          versionDto.mimeType,
          versionDto.fileSizeBytes,
          versionDto.checksumSha256,
          versionDto.storageKey,
          versionDto.status ?? 'QUEUED',
        ]
      );
      const verRow = verRes.rows[0];

      // 3. Insert relational junction rows in asset_documents
      for (const aId of targetAssetIds) {
        await client.query(
          `INSERT INTO asset_documents (organization_id, asset_id, document_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, asset_id, document_id) DO NOTHING`,
          [docDto.organizationId, aId, documentId]
        );
      }

      // 4. Insert transactional outbox event
      const outboxId = eventDto.id || crypto.randomUUID();
      const eventPayload = {
        ...eventDto.payload,
        documentId,
        documentVersionId: verRow.id,
        organizationId: docDto.organizationId,
        plantId: docDto.plantId,
        filename: versionDto.filename,
        storageKey: versionDto.storageKey,
        category: docDto.category,
        assetIds: targetAssetIds,
      };

      const outboxRes = await client.query(
        `INSERT INTO outbox_events (id, organization_id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
         RETURNING id, organization_id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, error_message, created_at, processed_at`,
        [outboxId, docDto.organizationId, 'DOCUMENT', documentId, eventDto.eventType, JSON.stringify(eventPayload)]
      );
      const outboxRow = outboxRes.rows[0];

      await client.query('COMMIT');

      const document: TechnicalDocument = {
        id: docRow.id,
        organizationId: docRow.organization_id,
        plantId: docRow.plant_id,
        documentNumber: docRow.document_number,
        title: docRow.title,
        category: docRow.category,
        assetTags: docRow.asset_tags ?? [],
        assetIds: docRow.asset_ids ?? [],
        machineId: docRow.machine_id ?? null,
        dataClassification: docRow.data_classification,
        isConfidential: docRow.is_confidential,
        createdByUserId: docRow.created_by_user_id,
        createdAt: docRow.created_at.toISOString(),
        updatedAt: docRow.updated_at.toISOString(),
        latestVersion: {
          id: verRow.id,
          documentId: verRow.document_id,
          versionNumber: verRow.version_number,
          revision: verRow.revision,
          filename: verRow.filename,
          mimeType: verRow.mime_type,
          fileSizeBytes: Number(verRow.file_size_bytes),
          checksumSha256: verRow.checksum_sha256,
          storageKey: verRow.storage_key,
          status: verRow.status,
          totalPages: verRow.total_pages,
          totalChunks: verRow.total_chunks,
          errorMessage: verRow.error_message,
          createdAt: verRow.created_at.toISOString(),
          updatedAt: verRow.updated_at.toISOString(),
        },
      };

      const version: DocumentVersion = {
        id: verRow.id,
        documentId: verRow.document_id,
        versionNumber: verRow.version_number,
        revision: verRow.revision,
        filename: verRow.filename,
        mimeType: verRow.mime_type,
        fileSizeBytes: Number(verRow.file_size_bytes),
        checksumSha256: verRow.checksum_sha256,
        storageKey: verRow.storage_key,
        status: verRow.status,
        totalPages: verRow.total_pages,
        totalChunks: verRow.total_chunks,
        errorMessage: verRow.error_message,
        createdAt: verRow.created_at.toISOString(),
        updatedAt: verRow.updated_at.toISOString(),
      };

      const outboxEvent: OutboxEvent = {
        id: outboxRow.id,
        organizationId: outboxRow.organization_id,
        aggregateType: outboxRow.aggregate_type,
        aggregateId: outboxRow.aggregate_id,
        eventType: outboxRow.event_type,
        payload: typeof outboxRow.payload === 'string' ? JSON.parse(outboxRow.payload) : outboxRow.payload,
        status: outboxRow.status,
        retryCount: outboxRow.retry_count,
        errorMessage: outboxRow.error_message,
        createdAt: outboxRow.created_at.toISOString(),
        processedAt: outboxRow.processed_at ? outboxRow.processed_at.toISOString() : null,
      };

      return { document, version, outboxEvent };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      if (orgId) {
        await client.query(`RESET app.current_tenant_id; RESET app.current_organization_id;`).catch(() => {});
      }
      client.release();
    }
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
      params.push(currentStep.slice(0, 64));
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
      assetIds: row.asset_ids ?? [],
      machineId: row.machine_id ?? (row.asset_ids && row.asset_ids.length > 0 ? row.asset_ids[0] : undefined),
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
    let safeAssetId = dto.assetId && isUuid(dto.assetId) ? dto.assetId : toSafeUuidParam(dto.assetId);
    if (!safeAssetId && dto.assetId) {
      const m = await this.getMachineById(dto.organizationId, dto.assetId);
      if (m?.id && isUuid(m.id)) {
        safeAssetId = m.id;
      }
    }

    const res = await this.pool.query(
      `INSERT INTO conversations (organization_id, plant_id, asset_id, user_id, title)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, plant_id, asset_id, user_id, title, created_at, updated_at`,
      [dto.organizationId, dto.plantId, safeAssetId || null, dto.userId, dto.title]
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
    if (!conversationId || (!isUuid(conversationId) && !toSafeUuidParam(conversationId))) {
      return null;
    }
    const safeConvId = toSafeUuidParam(conversationId) || conversationId;
    const res = await this.pool.query(
      `SELECT id, organization_id, plant_id, asset_id, user_id, title, created_at, updated_at
       FROM conversations
       WHERE id::text = $1 AND organization_id::text = $2`,
      [safeConvId, organizationId]
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
      const cleanDocId = sanitizeMachineOrAssetId(c.documentId);
      const safeDocUuid = toSafeUuidParam(cleanDocId);
      const safeChunkUuid = toSafeUuidParam(c.knowledgeChunkId);
      const safeVersionUuid = toSafeUuidParam(c.documentVersionId);

      // Fallback handling for citations with non-UUID document identifiers
      if (!safeDocUuid || !safeVersionUuid) {
        saved.push({
          id: crypto.randomUUID(),
          messageId: c.messageId,
          documentId: cleanDocId || c.documentId,
          documentNumber: c.documentNumber || 'HIST-RECORD',
          documentTitle: c.documentTitle || 'Maintenance History Ledger',
          documentVersionId: c.documentVersionId,
          revisionTag: 'REV-A',
          pageNumber: c.pageNumber,
          chunkId: c.knowledgeChunkId || crypto.randomUUID(),
          snippet: c.snippet,
          confidenceScore: Number(c.confidenceScore ?? 1.0),
          sectionHeading: c.sectionHeading,
        });
        continue;
      }

      try {
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
            safeDocUuid,
            safeVersionUuid,
            c.pageNumber,
            safeChunkUuid ?? null,
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
          [safeDocUuid, safeVersionUuid]
        );
        const doc = docRes.rows[0];

        saved.push({
          id: row.id,
          messageId: row.message_id,
          documentId: row.document_id,
          documentNumber: doc?.document_number || c.documentNumber || 'DOC-UNKNOWN',
          documentTitle: doc?.title || c.documentTitle || 'Unknown Document',
          documentVersionId: row.document_version_id,
          revisionTag: doc?.revision || 'REV-A',
          pageNumber: row.page_number,
          chunkId: row.knowledge_chunk_id || row.id,
          snippet: row.snippet,
          confidenceScore: Number(row.confidence_score),
          sectionHeading: row.section_heading,
        });
      } catch (insertErr) {
        // Fallback handling if foreign key or other DB constraint fails
        saved.push({
          id: crypto.randomUUID(),
          messageId: c.messageId,
          documentId: cleanDocId || c.documentId,
          documentNumber: c.documentNumber || 'DOC-RECORD',
          documentTitle: c.documentTitle || 'Reference Document',
          documentVersionId: c.documentVersionId,
          revisionTag: 'REV-A',
          pageNumber: c.pageNumber,
          chunkId: c.knowledgeChunkId || crypto.randomUUID(),
          snippet: c.snippet,
          confidenceScore: Number(c.confidenceScore ?? 1.0),
          sectionHeading: c.sectionHeading,
        });
      }
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

  // --------------------------------------------------------------------------
  // Phase 5: Visual Industrial Intelligence
  // --------------------------------------------------------------------------
  public async createVisualAsset(dto: CreateVisualAssetDTO): Promise<VisualAsset> {
    const res = await this.pool.query(
      `INSERT INTO visual_assets (
         organization_id, plant_id, machine_id, document_id, document_version_id, page_number,
         asset_type, storage_key, filename, mime_type, file_size_bytes, width, height,
         description, equipment_tags, component_labels, extraction_method, model_used,
         confidence_score, is_ambiguous, uploaded_by_user_id, processing_status, data_classification
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING *`,
      [
        dto.organizationId,
        dto.plantId ?? null,
        dto.machineId ? toSafeUuidParam(sanitizeMachineOrAssetId(dto.machineId)) : null,
        dto.documentId ?? null,
        dto.documentVersionId ?? null,
        dto.pageNumber ?? null,
        dto.assetType,
        dto.storageKey,
        dto.filename,
        dto.mimeType,
        dto.fileSizeBytes,
        dto.width ?? null,
        dto.height ?? null,
        dto.description ?? null,
        dto.equipmentTags ?? [],
        JSON.stringify(dto.componentLabels ?? []),
        dto.extractionMethod,
        dto.modelUsed,
        dto.confidenceScore ?? 1.0,
        dto.isAmbiguous ?? false,
        dto.uploadedByUserId ?? null,
        dto.processingStatus ?? 'UPLOADED',
        dto.dataClassification ?? 'INTERNAL',
      ]
    );
    return this.mapVisualAssetRow(res.rows[0]);
  }

  public async getVisualAssetById(organizationId: string, id: string): Promise<VisualAsset | null> {
    const res = await this.pool.query(
      `SELECT * FROM visual_assets WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapVisualAssetRow(res.rows[0]);
  }

  public async updateVisualAsset(
    organizationId: string,
    id: string,
    updates: Partial<VisualAsset>
  ): Promise<VisualAsset | null> {
    const existing = await this.getVisualAssetById(organizationId, id);
    if (!existing) return null;

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [id, organizationId];

    if (updates.processingStatus !== undefined) {
      values.push(updates.processingStatus);
      setClauses.push(`processing_status = $${values.length}`);
    }
    if (updates.documentId !== undefined) {
      values.push(updates.documentId);
      setClauses.push(`document_id = $${values.length}`);
    }
    if (updates.documentVersionId !== undefined) {
      values.push(updates.documentVersionId);
      setClauses.push(`document_version_id = $${values.length}`);
    }
    if (updates.description !== undefined) {
      values.push(updates.description);
      setClauses.push(`description = $${values.length}`);
    }
    if (updates.equipmentTags !== undefined) {
      values.push(updates.equipmentTags);
      setClauses.push(`equipment_tags = $${values.length}`);
    }
    if (updates.componentLabels !== undefined) {
      values.push(JSON.stringify(updates.componentLabels));
      setClauses.push(`component_labels = $${values.length}`);
    }
    if (updates.extractionMethod !== undefined) {
      values.push(updates.extractionMethod);
      setClauses.push(`extraction_method = $${values.length}`);
    }
    if (updates.modelUsed !== undefined) {
      values.push(updates.modelUsed);
      setClauses.push(`model_used = $${values.length}`);
    }
    if (updates.confidenceScore !== undefined) {
      values.push(updates.confidenceScore);
      setClauses.push(`confidence_score = $${values.length}`);
    }
    if (updates.isAmbiguous !== undefined) {
      values.push(updates.isAmbiguous);
      setClauses.push(`is_ambiguous = $${values.length}`);
    }

    const query = `
      UPDATE visual_assets
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `;
    const res = await this.pool.query(query, values);
    if (res.rows.length === 0) return null;
    return this.mapVisualAssetRow(res.rows[0]);
  }

  public async listVisualAssets(
    organizationId: string,
    filter?: VisualAssetFilterOptions
  ): Promise<VisualAsset[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];

    if (filter?.plantId) {
      params.push(filter.plantId);
      conditions.push(`plant_id = $${params.length}`);
    }
    if (filter?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filter.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        params.push(safeUuid);
        conditions.push(`machine_id = $${params.length}`);
      } else {
        params.push(cleanMachineId);
        conditions.push(`machine_id::text = $${params.length}`);
      }
    }
    if (filter?.documentId) {
      params.push(filter.documentId);
      conditions.push(`document_id = $${params.length}`);
    }
    if (filter?.documentVersionId) {
      params.push(filter.documentVersionId);
      conditions.push(`document_version_id = $${params.length}`);
    }
    if (filter?.assetType) {
      params.push(filter.assetType);
      conditions.push(`asset_type = $${params.length}`);
    }
    if (filter?.processingStatus) {
      params.push(filter.processingStatus);
      conditions.push(`processing_status = $${params.length}`);
    }
    if (filter?.equipmentTag) {
      params.push(filter.equipmentTag);
      conditions.push(`$${params.length} = ANY(equipment_tags)`);
    }

    const res = await this.pool.query(
      `SELECT * FROM visual_assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return res.rows.map((row) => this.mapVisualAssetRow(row));
  }

  public async deleteVisualAsset(organizationId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM visual_assets WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId]
    );
    return res.rows.length > 0;
  }

  private mapVisualAssetRow(row: any): VisualAsset {
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      machineId: row.machine_id || undefined,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      pageNumber: row.page_number,
      assetType: row.asset_type,
      storageKey: row.storage_key,
      filename: row.filename,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      width: row.width,
      height: row.height,
      description: row.description,
      equipmentTags: row.equipment_tags || [],
      componentLabels: typeof row.component_labels === 'string'
        ? JSON.parse(row.component_labels)
        : (row.component_labels || []),
      extractionMethod: row.extraction_method,
      modelUsed: row.model_used,
      confidenceScore: Number(row.confidence_score),
      isAmbiguous: row.is_ambiguous,
      uploadedByUserId: row.uploaded_by_user_id || undefined,
      processingStatus: row.processing_status || undefined,
      dataClassification: row.data_classification || undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Maintenance Cases & Troubleshooting Workflows (Phase 6)
  // --------------------------------------------------------------------------
  public async createMaintenanceCase(dto: CreateMaintenanceCaseDTO): Promise<MaintenanceCase> {
    const cleanAssetId = sanitizeMachineOrAssetId(dto.assetId);
    const safeAssetUuid = toSafeUuidParam(cleanAssetId) || cleanAssetId;
    const caseNumber = dto.caseNumber || `CASE-${Date.now().toString().slice(-6)}`;
    const res = await this.pool.query(
      `INSERT INTO maintenance_cases (
         organization_id, plant_id, asset_id, case_number, title, description,
         severity, status, reported_by_user_id, assigned_technician_user_id, assigned_technician_name,
         symptom_description, operating_conditions, visual_asset_ids, supporting_document_ids,
         diagnostic_hypothesis, checklist, findings, approval, is_escalated, escalation_reason,
         candidate_for_expert_knowledge, resolved_at, closed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [
        dto.organizationId,
        dto.plantId,
        safeAssetUuid,
        caseNumber,
        dto.title,
        dto.description || null,
        dto.severity || 'MEDIUM',
        dto.status || 'REPORTED',
        dto.reportedByUserId,
        dto.assignedTechnicianUserId || null,
        dto.assignedTechnicianName || null,
        dto.symptomDescription,
        JSON.stringify({
          ...(dto.operatingConditions || {}),
          ...(dto.sourceTicketId ? { sourceTicketId: dto.sourceTicketId } : {}),
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
        }),
        JSON.stringify(dto.visualAssetIds || []),
        JSON.stringify(dto.supportingDocumentIds || []),
        dto.diagnosticHypothesis ? JSON.stringify(dto.diagnosticHypothesis) : null,
        JSON.stringify(dto.checklist || []),
        dto.findings ? JSON.stringify(dto.findings) : null,
        dto.approval ? JSON.stringify(dto.approval) : null,
        dto.isEscalated ?? false,
        dto.escalationReason || null,
        dto.candidateForExpertKnowledge ?? false,
        dto.resolvedAt || null,
        dto.closedAt || null,
      ]
    );
    return this.mapMaintenanceCaseRow(res.rows[0]);
  }

  public async getMaintenanceCaseById(
    organizationId: string,
    id: string
  ): Promise<MaintenanceCase | null> {
    const res = await this.pool.query(
      `SELECT * FROM maintenance_cases WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapMaintenanceCaseRow(res.rows[0]);
  }

  public async updateMaintenanceCase(
    organizationId: string,
    id: string,
    updates: Partial<MaintenanceCase>
  ): Promise<MaintenanceCase | null> {
    const existing = await this.getMaintenanceCaseById(organizationId, id);
    if (!existing) return null;

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [id, organizationId];

    if (updates.title !== undefined) {
      params.push(updates.title);
      setClauses.push(`title = $${params.length}`);
    }
    if (updates.description !== undefined) {
      params.push(updates.description);
      setClauses.push(`description = $${params.length}`);
    }
    if (updates.severity !== undefined) {
      params.push(updates.severity);
      setClauses.push(`severity = $${params.length}`);
    }
    if (updates.status !== undefined) {
      params.push(updates.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (updates.assignedTechnicianUserId !== undefined) {
      params.push(updates.assignedTechnicianUserId);
      setClauses.push(`assigned_technician_user_id = $${params.length}`);
    }
    if (updates.assignedTechnicianName !== undefined) {
      params.push(updates.assignedTechnicianName);
      setClauses.push(`assigned_technician_name = $${params.length}`);
    }
    if (updates.symptomDescription !== undefined) {
      params.push(updates.symptomDescription);
      setClauses.push(`symptom_description = $${params.length}`);
    }
    if (updates.operatingConditions !== undefined) {
      params.push(JSON.stringify(updates.operatingConditions));
      setClauses.push(`operating_conditions = $${params.length}`);
    }
    if (updates.visualAssetIds !== undefined) {
      params.push(JSON.stringify(updates.visualAssetIds));
      setClauses.push(`visual_asset_ids = $${params.length}`);
    }
    if (updates.supportingDocumentIds !== undefined) {
      params.push(JSON.stringify(updates.supportingDocumentIds));
      setClauses.push(`supporting_document_ids = $${params.length}`);
    }
    if (updates.diagnosticHypothesis !== undefined) {
      params.push(updates.diagnosticHypothesis ? JSON.stringify(updates.diagnosticHypothesis) : null);
      setClauses.push(`diagnostic_hypothesis = $${params.length}`);
    }
    if (updates.checklist !== undefined) {
      params.push(JSON.stringify(updates.checklist));
      setClauses.push(`checklist = $${params.length}`);
    }
    if (updates.findings !== undefined) {
      params.push(updates.findings ? JSON.stringify(updates.findings) : null);
      setClauses.push(`findings = $${params.length}`);
    }
    if (updates.approval !== undefined) {
      params.push(updates.approval ? JSON.stringify(updates.approval) : null);
      setClauses.push(`approval = $${params.length}`);
    }
    if (updates.isEscalated !== undefined) {
      params.push(updates.isEscalated);
      setClauses.push(`is_escalated = $${params.length}`);
    }
    if (updates.escalationReason !== undefined) {
      params.push(updates.escalationReason);
      setClauses.push(`escalation_reason = $${params.length}`);
    }
    if (updates.candidateForExpertKnowledge !== undefined) {
      params.push(updates.candidateForExpertKnowledge);
      setClauses.push(`candidate_for_expert_knowledge = $${params.length}`);
    }
    if (updates.feedbackRating !== undefined) {
      params.push(updates.feedbackRating);
      setClauses.push(`feedback_rating = $${params.length}`);
    }
    if (updates.feedbackComment !== undefined) {
      params.push(updates.feedbackComment);
      setClauses.push(`feedback_comment = $${params.length}`);
    }
    if (updates.resolvedAt !== undefined) {
      params.push(updates.resolvedAt);
      setClauses.push(`resolved_at = $${params.length}`);
    }
    if (updates.closedAt !== undefined) {
      params.push(updates.closedAt);
      setClauses.push(`closed_at = $${params.length}`);
    }
    if (updates.maintenanceRecordId !== undefined) {
      params.push(updates.maintenanceRecordId);
      setClauses.push(`maintenance_record_id = $${params.length}`);
    }

    const res = await this.pool.query(
      `UPDATE maintenance_cases
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      params
    );
    if (res.rows.length === 0) return null;
    return this.mapMaintenanceCaseRow(res.rows[0]);
  }

  public async listMaintenanceCases(
    organizationId: string,
    filter?: MaintenanceCaseFilterOptions
  ): Promise<MaintenanceCase[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];

    if (filter?.plantId) {
      params.push(filter.plantId);
      conditions.push(`plant_id = $${params.length}`);
    }
    if (filter?.assetId) {
      const cleanAssetId = sanitizeMachineOrAssetId(filter.assetId);
      const safeUuid = toSafeUuidParam(cleanAssetId);
      if (safeUuid) {
        params.push(safeUuid);
        conditions.push(`asset_id = $${params.length}`);
      } else {
        params.push(cleanAssetId);
        conditions.push(`asset_id::text = $${params.length}`);
      }
    }
    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter?.severity) {
      params.push(filter.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (filter?.assignedTechnicianUserId) {
      params.push(filter.assignedTechnicianUserId);
      conditions.push(`assigned_technician_user_id = $${params.length}`);
    }
    if (filter?.candidateForExpertKnowledge !== undefined) {
      params.push(filter.candidateForExpertKnowledge);
      conditions.push(`candidate_for_expert_knowledge = $${params.length}`);
    }

    const res = await this.pool.query(
      `SELECT * FROM maintenance_cases WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return res.rows.map((row) => this.mapMaintenanceCaseRow(row));
  }

  public async deleteMaintenanceCase(organizationId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM maintenance_cases WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId]
    );
    return res.rows.length > 0;
  }

  public async recordCaseHistory(dto: CreateCaseHistoryDTO): Promise<CaseHistoryEntry> {
    const res = await this.pool.query(
      `INSERT INTO case_history (case_id, user_id, previous_status, new_status, action, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [dto.caseId, dto.userId, dto.previousStatus || null, dto.newStatus, dto.action, dto.notes || null]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      caseId: row.case_id,
      userId: row.user_id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      action: row.action,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
    };
  }

  public async listCaseHistory(caseId: string): Promise<CaseHistoryEntry[]> {
    const res = await this.pool.query(
      `SELECT * FROM case_history WHERE case_id = $1 ORDER BY created_at ASC`,
      [caseId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      caseId: row.case_id,
      userId: row.user_id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      action: row.action,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
    }));
  }

  private mapMaintenanceCaseRow(row: any): MaintenanceCase {
    const op = typeof row.operating_conditions === 'string'
      ? JSON.parse(row.operating_conditions)
      : (row.operating_conditions || {});

    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      assetId: row.asset_id,
      caseNumber: row.case_number,
      title: row.title,
      description: row.description || undefined,
      severity: row.severity,
      status: row.status,
      reportedByUserId: row.reported_by_user_id,
      assignedTechnicianUserId: row.assigned_technician_user_id || null,
      assignedTechnicianName: row.assigned_technician_name || null,
      symptomDescription: row.symptom_description,
      operatingConditions: op,
      visualAssetIds: typeof row.visual_asset_ids === 'string'
        ? JSON.parse(row.visual_asset_ids)
        : (row.visual_asset_ids || []),
      supportingDocumentIds: typeof row.supporting_document_ids === 'string'
        ? JSON.parse(row.supporting_document_ids)
        : (row.supporting_document_ids || []),
      sourceTicketId: row.source_ticket_id || (op && typeof op === 'object' ? op.sourceTicketId : null) || null,
      partsUsed: (row.findings && typeof row.findings === 'object' && row.findings.partsUsed) ? row.findings.partsUsed : null,
      diagnosticHypothesis: typeof row.diagnostic_hypothesis === 'string'
        ? JSON.parse(row.diagnostic_hypothesis)
        : row.diagnostic_hypothesis,
      checklist: typeof row.checklist === 'string'
        ? JSON.parse(row.checklist)
        : (row.checklist || []),
      findings: typeof row.findings === 'string'
        ? JSON.parse(row.findings)
        : row.findings,
      approval: typeof row.approval === 'string'
        ? JSON.parse(row.approval)
        : row.approval,
      isEscalated: Boolean(row.is_escalated),
      escalationReason: row.escalation_reason,
      candidateForExpertKnowledge: Boolean(row.candidate_for_expert_knowledge),
      feedbackRating: row.feedback_rating,
      feedbackComment: row.feedback_comment,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      maintenanceRecordId: row.maintenance_record_id || null,
      createdAtFormatted: op.createdAtFormatted,
      plantName: op.plantName,
      reportedByName: op.reportedByName,
      reportedByRole: op.reportedByRole,
      assetTag: op.assetTag,
      assetName: op.assetName,
      machineStatus: op.machineStatus,
      faultCode: op.faultCode,
      topRootCause: op.topRootCause,
      probability: op.probability,
      recommendedFix: op.recommendedFix,
      investigationProgress: op.investigationProgress,
      specialistDiscipline: op.specialistDiscipline,
      priority: op.priority || row.severity,
      lotoApplied: op.lotoApplied,
      technicianNotes: op.technicianNotes,
    };
  }

  // --------------------------------------------------------------------------
  // Machine Registry (Phase B)
  // --------------------------------------------------------------------------
  private mapMachineRow(row: any): Machine {
    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      parentAssetId: row.parent_asset_id || null,
      assetTag: row.asset_tag,
      name: row.name,
      machineType: row.machine_type || 'Industrial Machinery',
      area: row.area,
      building: row.building || null,
      productionLine: row.production_line || null,
      locationDescription: row.location_description || null,
      manufacturer: row.manufacturer || null,
      modelNumber: row.model_number || null,
      serialNumber: row.serial_number || null,
      installationDate: row.installation_date ? row.installation_date.toISOString().substring(0, 10) : null,
      operationalState: row.operational_state || 'OPTIMAL',
      criticality: row.criticality || 'MEDIUM',
      department: row.department || null,
      dataClassification: row.data_classification || 'INTERNAL',
      authorizedAccessScope: row.authorized_access_scope || 'ORGANIZATION',
      verificationState: row.verification_state || 'UNVERIFIED',
      documentationReadiness: row.documentation_readiness || 'INCOMPLETE',
      technicalSpecs: typeof row.technical_specs === 'string' ? JSON.parse(row.technical_specs) : (row.technical_specs || {}),
      hasModel3d: Boolean(row.has_model3d),
      model3dStorageKey: row.model3d_storage_key || null,
      model3dFormat: row.model3d_format || null,
      hasPidDiagram: Boolean(row.has_pid_diagram),
      pidStorageKey: row.pid_storage_key || null,
      qrCodeData: row.qr_code_data || `/machines/${row.id}`,
      provenance: row.provenance || null,
      revision: Number(row.revision || 1),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async createMachine(organizationId: string, dto: CreateMachineDTO): Promise<Machine> {
    let plantCheck = await this.getPlantById(organizationId, dto.plantId);
    if (!plantCheck) {
      const plants = await this.listPlants(organizationId);
      if (plants.length > 0) {
        plantCheck = plants[0];
      } else {
        plantCheck = await this.createPlant(organizationId, {
          code: `PLANT-${organizationId.slice(0, 4).toUpperCase()}`,
          name: 'Primary Operations Facility',
          location: 'Industrial Complex',
          airGappedMode: false,
        });
      }
    }

    if (dto.parentAssetId) {
      const parentCheck = await this.getAssetById(organizationId, dto.parentAssetId);
      if (!parentCheck) {
        throw new Error(`Parent asset '${dto.parentAssetId}' not found or belongs to another organization.`);
      }
    }

    const cleanSerial = typeof dto.serialNumber === 'string' && dto.serialNumber.trim() ? dto.serialNumber.trim() : null;
    const cleanMfg = typeof dto.manufacturer === 'string' && dto.manufacturer.trim() ? dto.manufacturer.trim() : null;
    const cleanModel = typeof dto.modelNumber === 'string' && dto.modelNumber.trim() ? dto.modelNumber.trim() : null;

    if (cleanSerial) {
      const dupes = await this.detectPotentialDuplicates(organizationId, { serialNumber: cleanSerial });
      const exactMatch = dupes.find(
        (d) => d.serialNumber && d.serialNumber.trim().toLowerCase() === cleanSerial.toLowerCase()
      );
      if (exactMatch) {
        throw new Error(`Machine with serial number '${cleanSerial}' already exists in this organization.`);
      }
    }

    const res = await this.pool.query(
      `INSERT INTO assets (
         organization_id, plant_id, parent_asset_id, asset_tag, name, machine_type,
         area, building, production_line, location_description, manufacturer, model_number,
         serial_number, installation_date, operational_state, criticality, department,
         data_classification, authorized_access_scope, verification_state,
         documentation_readiness, technical_specs, has_model3d, model3d_storage_key,
         model3d_format, has_pid_diagram, pid_storage_key, qr_code_data, provenance, revision
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, 1
       )
       RETURNING *`,
      [
        organizationId,
        plantCheck.id,
        dto.parentAssetId ?? null,
        dto.assetTag,
        dto.name,
        dto.machineType ?? 'Industrial Machinery',
        dto.area ?? 'Main Production',
        dto.building ?? null,
        dto.productionLine ?? null,
        dto.locationDescription ?? null,
        cleanMfg,
        cleanModel,
        cleanSerial,
        dto.installationDate ?? null,
        dto.operationalState ?? 'OPTIMAL',
        dto.criticality ?? 'MEDIUM',
        dto.department ?? null,
        dto.dataClassification ?? 'INTERNAL',
        dto.authorizedAccessScope ?? 'ORGANIZATION',
        dto.verificationState ?? (cleanSerial ? 'PARTIALLY_VERIFIED' : 'UNVERIFIED'),
        dto.documentationReadiness ?? 'INCOMPLETE',
        JSON.stringify(dto.technicalSpecs ?? {}),
        dto.hasModel3d ?? false,
        dto.model3dStorageKey ?? null,
        dto.model3dFormat ?? null,
        dto.hasPidDiagram ?? false,
        dto.pidStorageKey ?? null,
        dto.qrCodeData ?? `/machines/${dto.assetTag}`,
        dto.provenance ?? null,
      ]
    );

    const machine = this.mapMachineRow(res.rows[0]);
    const counts = await this.getMachineAssetCounts(organizationId, machine);
    const { checks, overallState, status } = computeMachineVerification(machine, undefined, counts);
    const finalStatus = dto.verificationState === 'VERIFIED' ? 'VERIFIED' : status;
    const finalOverallState = dto.verificationState === 'VERIFIED' ? 'VERIFIED' : overallState;
    const initialHistory = [
      {
        action: 'REGISTERED',
        actorUserId: 'system',
        actorRole: 'SYSTEM',
        timestamp: new Date().toISOString(),
        notes: 'Machine registered in authoritative ledger. Initial verification checks evaluated.',
      },
    ];

    try {
      await this.pool.query(
        `INSERT INTO machine_verifications (
           organization_id, machine_id, status, overall_state, checks, history
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, machine_id) DO NOTHING`,
        [
          organizationId,
          machine.id,
          finalStatus,
          finalOverallState,
          JSON.stringify(checks),
          JSON.stringify(initialHistory),
        ]
      );
    } catch {
      // Non-blocking in case migration is applying
    }

    return machine;
  }

  public async getMachineById(organizationId: string, machineId: string): Promise<Machine | null> {
    const cleanId = sanitizeMachineOrAssetId(machineId);
    const res = await this.pool.query(
      `SELECT * FROM assets
       WHERE organization_id::text = $2 AND (
         id::text = $1 OR id::text = $3 OR
         UPPER(asset_tag) = UPPER($1) OR UPPER(asset_tag) = UPPER($3) OR
         UPPER(name) = UPPER($1) OR UPPER(name) = UPPER($3)
       )`,
      [cleanId, organizationId, machineId]
    );
    if (res.rows.length === 0) return null;
    return this.mapMachineRow(res.rows[0]);
  }

  public async getMachineByAssetTag(organizationId: string, assetTag: string): Promise<Machine | null> {
    const cleanTag = sanitizeMachineOrAssetId(assetTag);
    const res = await this.pool.query(
      `SELECT * FROM assets
       WHERE organization_id::text = $2 AND (
         UPPER(asset_tag) = UPPER($1) OR UPPER(asset_tag) = UPPER($3) OR
         id::text = $1 OR id::text = $3 OR
         UPPER(name) = UPPER($1) OR UPPER(name) = UPPER($3)
       )`,
      [cleanTag, organizationId, assetTag]
    );
    if (res.rows.length === 0) return null;
    return this.mapMachineRow(res.rows[0]);
  }

  public async listMachines(organizationId: string, filters?: MachineFilterOptions): Promise<Machine[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];

    if (filters?.plantId) {
      params.push(filters.plantId);
      conditions.push(`plant_id = $${params.length}`);
    }
    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      const idx = params.length;
      conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(asset_tag) LIKE $${idx} OR LOWER(manufacturer) LIKE $${idx} OR LOWER(model_number) LIKE $${idx})`);
    }
    if (filters?.documentationReadiness) {
      params.push(filters.documentationReadiness);
      conditions.push(`documentation_readiness = $${params.length}`);
    }
    if (filters?.operationalState) {
      params.push(filters.operationalState);
      conditions.push(`operational_state = $${params.length}`);
    }
    if (filters?.dataClassification) {
      params.push(filters.dataClassification);
      conditions.push(`data_classification = $${params.length}`);
    }
    if (typeof filters?.hasModel3d === 'boolean') {
      params.push(filters.hasModel3d);
      conditions.push(`has_model3d = $${params.length}`);
    }

    const query = `SELECT * FROM assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapMachineRow(r));
  }

  public async updateMachine(
    organizationId: string,
    machineId: string,
    updates: Partial<Machine>
  ): Promise<Machine | null> {
    const current = await this.getMachineById(organizationId, machineId);
    if (!current) return null;

    if (updates.serialNumber !== undefined) {
      const cleanSerial = typeof updates.serialNumber === 'string' && updates.serialNumber.trim() ? updates.serialNumber.trim() : null;
      if (cleanSerial) {
        const dupes = await this.detectPotentialDuplicates(organizationId, { serialNumber: cleanSerial });
        const exactMatch = dupes.find(
          (d) => d.id !== current.id && d.serialNumber && d.serialNumber.trim().toLowerCase() === cleanSerial.toLowerCase()
        );
        if (exactMatch) {
          throw new Error(`Machine with serial number '${cleanSerial}' already exists in this organization.`);
        }
      }
      updates.serialNumber = cleanSerial as any;
    }

    if (updates.manufacturer !== undefined) {
      updates.manufacturer = (typeof updates.manufacturer === 'string' && updates.manufacturer.trim() ? updates.manufacturer.trim() : null) as any;
    }

    if (updates.modelNumber !== undefined) {
      updates.modelNumber = (typeof updates.modelNumber === 'string' && updates.modelNumber.trim() ? updates.modelNumber.trim() : null) as any;
    }

    const setClauses: string[] = ['revision = revision + 1', 'updated_at = NOW()'];
    const params: any[] = [current.id, organizationId];

    const fields: (keyof Machine)[] = [
      'name', 'area', 'building', 'productionLine', 'locationDescription',
      'manufacturer', 'modelNumber', 'serialNumber', 'installationDate',
      'operationalState', 'criticality', 'department', 'dataClassification',
      'authorizedAccessScope', 'verificationState', 'documentationReadiness',
      'hasModel3d', 'model3dStorageKey', 'model3dFormat', 'hasPidDiagram',
      'pidStorageKey', 'qrCodeData', 'provenance'
    ];

    for (const f of fields) {
      if (updates[f] !== undefined) {
        const dbCol = f.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        params.push(updates[f]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }

    if (updates.technicalSpecs !== undefined) {
      params.push(JSON.stringify(updates.technicalSpecs));
      setClauses.push(`technical_specs = $${params.length}`);
    }

    const query = `UPDATE assets SET ${setClauses.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`;
    const res = await this.pool.query(query, params);
    if (res.rows.length === 0) return null;
    return this.mapMachineRow(res.rows[0]);
  }

  public async deleteMachine(organizationId: string, machineId: string): Promise<boolean> {
    const current = await this.getMachineById(organizationId, machineId);
    if (!current) return false;
    const res = await this.pool.query(
      `DELETE FROM assets WHERE id = $1 AND organization_id = $2`,
      [current.id, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async detectPotentialDuplicates(
    organizationId: string,
    params: { manufacturer?: string; modelNumber?: string; serialNumber?: string }
  ): Promise<Machine[]> {
    const conditions: string[] = ['organization_id = $1'];
    const sqlParams: any[] = [organizationId];

    const orClauses: string[] = [];
    if (params.serialNumber && params.serialNumber.trim()) {
      sqlParams.push(params.serialNumber.trim().toLowerCase());
      orClauses.push(`LOWER(serial_number) = $${sqlParams.length}`);
    }

    if (params.manufacturer && params.manufacturer.trim() && params.modelNumber && params.modelNumber.trim()) {
      sqlParams.push(params.manufacturer.trim().toLowerCase());
      const mfrIdx = sqlParams.length;
      sqlParams.push(params.modelNumber.trim().toLowerCase());
      const modelIdx = sqlParams.length;
      orClauses.push(`(LOWER(manufacturer) = $${mfrIdx} AND LOWER(model_number) = $${modelIdx})`);
    }

    if (orClauses.length === 0) return [];
    conditions.push(`(${orClauses.join(' OR ')})`);

    const query = `SELECT * FROM assets WHERE ${conditions.join(' AND ')}`;
    const res = await this.pool.query(query, sqlParams);
    return res.rows.map((r) => this.mapMachineRow(r));
  }

  public async getMachineLedgerSummary(organizationId: string, plantId?: string): Promise<MachineLedgerSummary> {
    const plantClause = plantId ? 'AND plant_id = $2' : '';
    const params = plantId ? [organizationId, plantId] : [organizationId];

    const machineStats = await this.pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE documentation_readiness != 'READY') as incomplete,
         COUNT(*) FILTER (WHERE verification_state = 'VERIFIED') as verified_specs,
         COUNT(*) FILTER (WHERE has_model3d = TRUE) as with_model,
         COUNT(*) FILTER (WHERE criticality IN ('HIGH', 'MISSION_CRITICAL')) as critical
       FROM assets
       WHERE organization_id = $1 ${plantClause}`,
      params
    );

    let taskStats;
    try {
      taskStats = await this.pool.query(
        `SELECT
           (SELECT COUNT(*) FROM missing_information_tasks WHERE organization_id = $1 AND status = 'SUBMITTED') +
           (SELECT COUNT(*) FROM machine_verifications WHERE organization_id = $1 AND status = 'READY_FOR_APPROVAL') as pending_tasks`,
        [organizationId]
      );
    } catch {
      taskStats = await this.pool.query(
        `SELECT COUNT(*) as pending_tasks
         FROM missing_information_tasks
         WHERE organization_id = $1 AND status = 'SUBMITTED'`,
        [organizationId]
      );
    }

    const mRow = machineStats.rows[0];
    const tRow = taskStats.rows[0];

    return {
      totalMachines: parseInt(mRow.total || '0', 10),
      incompleteDocumentationCount: parseInt(mRow.incomplete || '0', 10),
      pendingReviewTasksCount: parseInt(tRow?.pending_tasks || '0', 10),
      with3dModelCount: parseInt(mRow.with_model || '0', 10),
      criticalMachinesCount: parseInt(mRow.critical || '0', 10),
      verifiedSpecsCount: parseInt(mRow.verified_specs || '0', 10),
    };
  }

  private mapVerificationRow(row: any, machineAssetTag: string): MachineVerificationRecord {
    return {
      id: row.id,
      organizationId: row.organization_id,
      machineId: row.machine_id,
      machineAssetTag: machineAssetTag || '',
      status: row.status,
      overallState: row.overall_state,
      checks: typeof row.checks === 'string' ? JSON.parse(row.checks) : (row.checks || []),
      assignedUserId: row.assigned_user_id || null,
      assignedRole: row.assigned_role || null,
      lastSubmittedByUserId: row.last_submitted_by_user_id || null,
      lastSubmittedAt: row.last_submitted_at ? row.last_submitted_at.toISOString() : null,
      evidenceDescription: row.evidence_description || null,
      evidenceAttachmentKeys: typeof row.evidence_attachment_keys === 'string'
        ? JSON.parse(row.evidence_attachment_keys)
        : (row.evidence_attachment_keys || []),
      approvedByUserId: row.approved_by_user_id || null,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      rejectionReason: row.rejection_reason || null,
      correctiveActions: row.corrective_actions || null,
      history: typeof row.history === 'string' ? JSON.parse(row.history) : (row.history || []),
      createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
    };
  }

  private async getMachineAssetCounts(organizationId: string, machine: Machine): Promise<{
    documentCount: number;
    models3dCount: number;
    drawingsCount: number;
  }> {
    const assetId = machine.id;
    const assetTag = machine.assetTag;
    const mfg = machine.manufacturer || '';
    const mdl = machine.modelNumber || '';

    let documentCount = 0;
    try {
      const docRes = await this.pool.query(
        `SELECT COUNT(DISTINCT d.id)::int AS count FROM documents d
         LEFT JOIN asset_documents ad ON ad.document_id = d.id AND ad.asset_id = $2
         WHERE d.organization_id = $1 AND (
           $2::text = ANY(d.asset_ids) OR
           d.machine_id = $2 OR
           $3 = ANY(d.asset_tags) OR
           ad.asset_id = $2
         )`,
        [organizationId, assetId, assetTag]
      );
      documentCount += docRes.rows[0]?.count || 0;
    } catch {
      // Fallback
    }

    try {
      const mrRes = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM manufacturer_resources
         WHERE organization_id = $1 AND (machine_id = $2 OR (LOWER(manufacturer) = LOWER($3) AND LOWER(model_number) = LOWER($4) AND model_number IS NOT NULL AND model_number != ''))`,
        [organizationId, assetId, mfg, mdl]
      );
      documentCount += mrRes.rows[0]?.count || 0;
    } catch {
      // Fallback
    }

    try {
      const mcRes = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM machine_evidence_claims
         WHERE organization_id = $1 AND machine_id = $2 AND (source_document_id IS NOT NULL OR source_attachment_key IS NOT NULL)`,
        [organizationId, assetId]
      );
      documentCount += mcRes.rows[0]?.count || 0;
    } catch {
      // Fallback
    }

    if (machine.technicalSpecs?.manualStorageKey || machine.technicalSpecs?.manualFileName || machine.technicalSpecs?.manualUrl) {
      documentCount++;
    }

    let models3dCount = 0;
    try {
      const m3dRes = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM engineering_models3d
         WHERE organization_id = $1 AND (machine_id = $2 OR asset_id = $2)`,
        [organizationId, assetId]
      );
      models3dCount = m3dRes.rows[0]?.count || 0;
    } catch {
      // Fallback
    }
    if (machine.model3dStorageKey || machine.model3dUrl || machine.model3dFile) {
      models3dCount++;
    }

    let drawingsCount = 0;
    try {
      const dwgRes = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM engineering_drawings
         WHERE organization_id = $1 AND machine_id = $2`,
        [organizationId, assetId]
      );
      drawingsCount = dwgRes.rows[0]?.count || 0;
    } catch {
      // Fallback
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

    const res = await this.pool.query(
      `SELECT * FROM machine_verifications WHERE organization_id = $1 AND machine_id = $2`,
      [organizationId, machine.id]
    );

    const now = new Date().toISOString();
    const counts = await this.getMachineAssetCounts(organizationId, machine);

    if (res.rows.length === 0) {
      const { checks, overallState, status } = computeMachineVerification(machine, undefined, counts);
      const finalStatus = machine.verificationState === 'VERIFIED' ? 'VERIFIED' : status;
      const finalOverallState = machine.verificationState === 'VERIFIED' ? 'VERIFIED' : overallState;
      const history = [
        {
          action: 'REGISTERED',
          actorUserId: 'system',
          actorRole: 'SYSTEM',
          timestamp: now,
          notes: 'Verification profile initialized.',
        },
      ];

      const insertRes = await this.pool.query(
        `INSERT INTO machine_verifications (
           organization_id, machine_id, status, overall_state, checks, history
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          organizationId,
          machine.id,
          finalStatus,
          finalOverallState,
          JSON.stringify(checks),
          JSON.stringify(history),
        ]
      );
      return this.mapVerificationRow(insertRes.rows[0], machine.assetTag);
    }

    const currentRecord = this.mapVerificationRow(res.rows[0], machine.assetTag);
    const { checks, overallState, status } = computeMachineVerification(machine, currentRecord, counts);
    const finalOverallState = machine.verificationState === 'VERIFIED' ? 'VERIFIED' : overallState;
    const finalStatus = machine.verificationState === 'VERIFIED' ? 'VERIFIED' : status;

    await this.pool.query(
      `UPDATE machine_verifications SET
         checks = $1,
         overall_state = $2,
         status = $3,
         updated_at = NOW()
       WHERE id = $4 AND organization_id = $5`,
      [JSON.stringify(checks), finalOverallState, finalStatus, currentRecord.id, organizationId]
    );

    currentRecord.checks = checks;
    currentRecord.overallState = finalOverallState;
    currentRecord.status = finalStatus;

    return currentRecord;
  }

  public async updateMachineVerification(
    organizationId: string,
    machineId: string,
    updates: Partial<MachineVerificationRecord>
  ): Promise<MachineVerificationRecord> {
    const current = await this.getMachineVerification(organizationId, machineId);

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [current.id, organizationId];

    if (updates.status !== undefined) {
      params.push(updates.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (updates.overallState !== undefined) {
      params.push(updates.overallState);
      setClauses.push(`overall_state = $${params.length}`);
    }
    if (updates.checks !== undefined) {
      params.push(JSON.stringify(updates.checks));
      setClauses.push(`checks = $${params.length}`);
    }
    if (updates.assignedUserId !== undefined) {
      params.push(updates.assignedUserId);
      setClauses.push(`assigned_user_id = $${params.length}`);
    }
    if (updates.assignedRole !== undefined) {
      params.push(updates.assignedRole);
      setClauses.push(`assigned_role = $${params.length}`);
    }
    if (updates.lastSubmittedByUserId !== undefined) {
      params.push(updates.lastSubmittedByUserId);
      setClauses.push(`last_submitted_by_user_id = $${params.length}`);
    }
    if (updates.lastSubmittedAt !== undefined) {
      params.push(updates.lastSubmittedAt);
      setClauses.push(`last_submitted_at = $${params.length}`);
    }
    if (updates.evidenceDescription !== undefined) {
      params.push(updates.evidenceDescription);
      setClauses.push(`evidence_description = $${params.length}`);
    }
    if (updates.evidenceAttachmentKeys !== undefined) {
      params.push(JSON.stringify(updates.evidenceAttachmentKeys));
      setClauses.push(`evidence_attachment_keys = $${params.length}`);
    }
    if (updates.approvedByUserId !== undefined) {
      params.push(updates.approvedByUserId);
      setClauses.push(`approved_by_user_id = $${params.length}`);
    }
    if (updates.approvedAt !== undefined) {
      params.push(updates.approvedAt);
      setClauses.push(`approved_at = $${params.length}`);
    }
    if (updates.rejectionReason !== undefined) {
      params.push(updates.rejectionReason);
      setClauses.push(`rejection_reason = $${params.length}`);
    }
    if (updates.correctiveActions !== undefined) {
      params.push(updates.correctiveActions);
      setClauses.push(`corrective_actions = $${params.length}`);
    }
    if (updates.history !== undefined) {
      params.push(JSON.stringify(updates.history));
      setClauses.push(`history = $${params.length}`);
    }

    const query = `UPDATE machine_verifications SET ${setClauses.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`;
    const res = await this.pool.query(query, params);
    if (res.rows.length === 0) return current;

    return this.mapVerificationRow(res.rows[0], current.machineAssetTag);
  }

  // --------------------------------------------------------------------------
  // Missing Information & Technician Tasks (Phase B)
  // --------------------------------------------------------------------------
  private mapTaskRow(row: any): MissingInformationTask {
    return {
      id: row.id,
      organizationId: row.organization_id,
      machineId: row.machine_id,
      machineAssetTag: row.machine_asset_tag || '',
      machineName: row.machine_name || '',
      assignedUserId: row.assigned_user_id || null,
      assignedRole: row.assigned_role || null,
      requestedFields: typeof row.requested_fields === 'string' ? JSON.parse(row.requested_fields) : (row.requested_fields || []),
      instructions: row.instructions,
      dueDate: row.due_date ? row.due_date.toISOString().substring(0, 10) : null,
      status: row.status,
      submittedValues: typeof row.submitted_values === 'string' ? JSON.parse(row.submitted_values) : (row.submitted_values || null),
      submittedByUserId: row.submitted_by_user_id || null,
      submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
      evidenceDescription: row.evidence_description || null,
      evidenceAttachmentKeys: typeof row.evidence_attachment_keys === 'string' ? JSON.parse(row.evidence_attachment_keys) : (row.evidence_attachment_keys || []),
      reviewFeedback: row.review_feedback || null,
      reviewedByUserId: row.reviewed_by_user_id || null,
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async createMissingInfoTask(organizationId: string, dto: CreateMissingInfoTaskDTO): Promise<MissingInformationTask> {
    const cleanMachineId = sanitizeMachineOrAssetId(dto.machineId);
    const machine =
      (await this.getMachineById(organizationId, cleanMachineId)) ||
      (await this.getMachineById(organizationId, dto.machineId));
    if (!machine) {
      throw new Error(`Machine '${dto.machineId}' not found in this organization.`);
    }

    const safeMachineUuid = toSafeUuidParam(machine.id) || machine.id;

    const res = await this.pool.query(
      `INSERT INTO missing_information_tasks (
         organization_id, machine_id, assigned_user_id, assigned_role,
         requested_fields, instructions, due_date, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'NOT_STARTED')
       RETURNING *`,
      [
        organizationId,
        safeMachineUuid,
        dto.assignedUserId ?? null,
        dto.assignedRole ?? null,
        JSON.stringify(dto.requestedFields),
        dto.instructions,
        dto.dueDate ?? null,
      ]
    );

    const task = this.mapTaskRow(res.rows[0]);
    task.machineAssetTag = machine.assetTag;
    task.machineName = machine.name;
    return task;
  }

  public async getMissingInfoTaskById(organizationId: string, taskId: string): Promise<MissingInformationTask | null> {
    const res = await this.pool.query(
      `SELECT t.*, a.asset_tag as machine_asset_tag, a.name as machine_name
       FROM missing_information_tasks t
       JOIN assets a ON t.machine_id = a.id
       WHERE t.id = $1 AND t.organization_id = $2`,
      [taskId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapTaskRow(res.rows[0]);
  }

  public async listMissingInfoTasks(organizationId: string, filters?: MissingInfoTaskFilterOptions): Promise<MissingInformationTask[]> {
    const conditions: string[] = ['t.organization_id = $1'];
    const params: any[] = [organizationId];

    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        params.push(safeUuid);
        conditions.push(`t.machine_id = $${params.length}`);
      } else {
        params.push(cleanMachineId);
        conditions.push(`(t.machine_id::text = $${params.length} OR a.asset_tag = $${params.length})`);
      }
    }
    if (filters?.assignedUserId) {
      params.push(filters.assignedUserId);
      conditions.push(`t.assigned_user_id = $${params.length}`);
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`t.status = $${params.length}`);
    }

    const query = `
      SELECT t.*, a.asset_tag as machine_asset_tag, a.name as machine_name
      FROM missing_information_tasks t
      JOIN assets a ON t.machine_id = a.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
    `;
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapTaskRow(r));
  }

  public async updateMissingInfoTask(
    organizationId: string,
    taskId: string,
    updates: Partial<MissingInformationTask>
  ): Promise<MissingInformationTask | null> {
    const current = await this.getMissingInfoTaskById(organizationId, taskId);
    if (!current) return null;

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [current.id, organizationId];

    if (updates.status !== undefined) {
      params.push(updates.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (updates.submittedValues !== undefined) {
      params.push(JSON.stringify(updates.submittedValues));
      setClauses.push(`submitted_values = $${params.length}`);
    }
    if (updates.submittedByUserId !== undefined) {
      params.push(updates.submittedByUserId);
      setClauses.push(`submitted_by_user_id = $${params.length}`);
    }
    if (updates.submittedAt !== undefined) {
      params.push(updates.submittedAt);
      setClauses.push(`submitted_at = $${params.length}`);
    }
    if (updates.evidenceDescription !== undefined) {
      params.push(updates.evidenceDescription);
      setClauses.push(`evidence_description = $${params.length}`);
    }
    if (updates.evidenceAttachmentKeys !== undefined) {
      params.push(JSON.stringify(updates.evidenceAttachmentKeys));
      setClauses.push(`evidence_attachment_keys = $${params.length}`);
    }
    if (updates.reviewFeedback !== undefined) {
      params.push(updates.reviewFeedback);
      setClauses.push(`review_feedback = $${params.length}`);
    }
    if (updates.reviewedByUserId !== undefined) {
      params.push(updates.reviewedByUserId);
      setClauses.push(`reviewed_by_user_id = $${params.length}`);
    }
    if (updates.reviewedAt !== undefined) {
      params.push(updates.reviewedAt);
      setClauses.push(`reviewed_at = $${params.length}`);
    }

    const query = `UPDATE missing_information_tasks SET ${setClauses.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`;
    const res = await this.pool.query(query, params);
    if (res.rows.length === 0) return null;
    const updatedTask = this.mapTaskRow(res.rows[0]);

    // When reviewer approves, promote values to machine technical specs
    if (updates.status === 'APPROVED' && updatedTask.submittedValues) {
      const machine = await this.getMachineById(organizationId, updatedTask.machineId);
      if (machine) {
        const mergedSpecs = {
          ...machine.technicalSpecs,
          ...updatedTask.submittedValues,
        };
        const machineUpdates: Partial<Machine> = {
          technicalSpecs: mergedSpecs,
        };
        if (typeof updatedTask.submittedValues.serialNumber === 'string') {
          machineUpdates.serialNumber = updatedTask.submittedValues.serialNumber;
        }
        if (typeof updatedTask.submittedValues.manufacturer === 'string') {
          machineUpdates.manufacturer = updatedTask.submittedValues.manufacturer;
        }
        if (typeof updatedTask.submittedValues.modelNumber === 'string') {
          machineUpdates.modelNumber = updatedTask.submittedValues.modelNumber;
        }
        await this.updateMachine(organizationId, machine.id, machineUpdates);
        const verif = await this.getMachineVerification(organizationId, machine.id);
        if (verif) {
          await this.updateMachine(organizationId, machine.id, { verificationState: verif.overallState });
        }
      }
    }

    return updatedTask;
  }

  // --------------------------------------------------------------------------
  // Component Mappings (Phase B)
  // --------------------------------------------------------------------------
  private mapComponentRow(row: any): ComponentMapping {
    return {
      id: row.id,
      organizationId: row.organization_id,
      machineId: row.machine_id,
      componentId: row.component_id,
      componentName: row.component_name,
      pidTag: row.pid_tag,
      pidDrawingNumber: row.pid_drawing_number || null,
      pidCoordinates: typeof row.pid_coordinates === 'string' ? JSON.parse(row.pid_coordinates) : (row.pid_coordinates || null),
      manualDocumentId: row.manual_document_id || null,
      manualPageNumber: row.manual_page_number ? parseInt(row.manual_page_number, 10) : null,
      status: row.status,
      verifiedByUserId: row.verified_by_user_id || null,
      verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async createComponentMapping(organizationId: string, dto: CreateComponentMappingDTO): Promise<ComponentMapping> {
    const machine = await this.getMachineById(organizationId, dto.machineId);
    if (!machine) throw new Error(`Machine '${dto.machineId}' not found.`);

    const res = await this.pool.query(
      `INSERT INTO component_mappings (
         organization_id, machine_id, component_id, component_name,
         pid_tag, pid_drawing_number, pid_coordinates, manual_document_id,
         manual_page_number, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        organizationId,
        machine.id,
        dto.componentId,
        dto.componentName,
        dto.pidTag,
        dto.pidDrawingNumber ?? null,
        dto.pidCoordinates ? JSON.stringify(dto.pidCoordinates) : null,
        dto.manualDocumentId ?? null,
        dto.manualPageNumber ?? null,
        dto.status ?? 'SUGGESTED',
      ]
    );

    return this.mapComponentRow(res.rows[0]);
  }

  public async listComponentMappings(organizationId: string, machineId: string): Promise<ComponentMapping[]> {
    const cleanMachineId = sanitizeMachineOrAssetId(machineId);
    const safeUuid = toSafeUuidParam(cleanMachineId);
    const query = safeUuid
      ? `SELECT * FROM component_mappings
       WHERE organization_id = $1 AND machine_id = $2
       ORDER BY component_name ASC`
      : `SELECT * FROM component_mappings
       WHERE organization_id = $1 AND machine_id::text = $2
       ORDER BY component_name ASC`;
    const res = await this.pool.query(query, [organizationId, safeUuid || cleanMachineId]);
    return res.rows.map((r) => this.mapComponentRow(r));
  }

  public async updateComponentMapping(
    organizationId: string,
    mappingId: string,
    updates: Partial<ComponentMapping>
  ): Promise<ComponentMapping | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [mappingId, organizationId];

    if (updates.status !== undefined) {
      params.push(updates.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (updates.componentName !== undefined) {
      params.push(updates.componentName);
      setClauses.push(`component_name = $${params.length}`);
    }
    if (updates.pidTag !== undefined) {
      params.push(updates.pidTag);
      setClauses.push(`pid_tag = $${params.length}`);
    }
    if (updates.verifiedByUserId !== undefined) {
      params.push(updates.verifiedByUserId);
      setClauses.push(`verified_by_user_id = $${params.length}`);
      setClauses.push(`verified_at = NOW()`);
    }

    const query = `UPDATE component_mappings SET ${setClauses.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`;
    const res = await this.pool.query(query, params);
    if (res.rows.length === 0) return null;
    return this.mapComponentRow(res.rows[0]);
  }

  public async deleteComponentMapping(organizationId: string, mappingId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM component_mappings WHERE id = $1 AND organization_id = $2`,
      [mappingId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Employee Badges (Phase B)
  // --------------------------------------------------------------------------
  public async issueEmployeeBadge(organizationId: string, data: IssueEmployeeBadgeDTO): Promise<EmployeeBadge> {
    const res = await this.pool.query(
      `INSERT INTO employee_badges (organization_id, user_id, badge_code, pin_hash, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING *`,
      [organizationId, data.userId, data.badgeCode, data.pinHash, data.expiresAt ?? null]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      badgeCode: row.badge_code,
      status: row.status,
      pinHash: row.pin_hash,
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getEmployeeBadgeByCode(badgeCode: string): Promise<EmployeeBadge | null> {
    const res = await this.pool.query(
      `SELECT * FROM employee_badges WHERE badge_code = $1`,
      [badgeCode]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      badgeCode: row.badge_code,
      status: row.status,
      pinHash: row.pin_hash,
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getEmployeeBadgeByUserId(organizationId: string, userId: string): Promise<EmployeeBadge | null> {
    const res = await this.pool.query(
      `SELECT * FROM employee_badges WHERE organization_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [organizationId, userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      badgeCode: row.badge_code,
      status: row.status,
      pinHash: row.pin_hash,
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async updateEmployeeBadgeStatus(
    organizationId: string,
    badgeId: string,
    status: BadgeStatus
  ): Promise<EmployeeBadge | null> {
    const revokedClause = status === 'REVOKED' ? ', revoked_at = NOW()' : '';
    const res = await this.pool.query(
      `UPDATE employee_badges
       SET status = $1, updated_at = NOW() ${revokedClause}
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [status, badgeId, organizationId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      badgeCode: row.badge_code,
      status: row.status,
      pinHash: row.pin_hash,
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Public Machine Knowledge (Phase B)
  // --------------------------------------------------------------------------
  public async getPublicMachineKnowledge(
    manufacturer: string,
    modelNumber: string
  ): Promise<PublicMachineKnowledge | null> {
    const res = await this.pool.query(
      `SELECT * FROM public_machine_knowledge
       WHERE LOWER(manufacturer) = LOWER($1) AND LOWER(model_number) = LOWER($2)`,
      [manufacturer.trim(), modelNumber.trim()]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return {
      id: row.id,
      manufacturer: row.manufacturer,
      modelNumber: row.model_number,
      productFamily: row.product_family || undefined,
      publicSpecs: typeof row.public_specs === 'string' ? JSON.parse(row.public_specs) : (row.public_specs || {}),
      sourceUrl: row.source_url,
      sourcePublisher: row.source_publisher,
      retrievalDate: row.retrieval_date ? row.retrieval_date.toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      verificationStatus: row.verification_status,
      approvedByUserId: row.approved_by_user_id || null,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      sourceType: row.source_type || meta.sourceType,
      matchStatus: row.match_status || meta.matchStatus,
      missingModelDetails: meta.missingModelDetails,
      completenessSummary: meta.completenessSummary,
      evidenceRecords: meta.evidenceRecords,
      conflicts: meta.conflicts,
      reviewNotes: meta.reviewNotes,
    };
  }

  public async savePublicMachineKnowledge(data: SavePublicKnowledgeDTO): Promise<PublicMachineKnowledge> {
    const meta = {
      sourceType: data.sourceType,
      matchStatus: data.matchStatus,
      missingModelDetails: data.missingModelDetails,
      completenessSummary: data.completenessSummary,
      evidenceRecords: data.evidenceRecords,
      conflicts: data.conflicts,
      reviewNotes: data.reviewNotes,
    };

    const res = await this.pool.query(
      `INSERT INTO public_machine_knowledge (
         manufacturer, model_number, product_family, public_specs, source_url, source_publisher, verification_status,
         source_type, match_status, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (manufacturer, model_number) DO UPDATE
       SET public_specs = EXCLUDED.public_specs,
           source_url = EXCLUDED.source_url,
           source_publisher = EXCLUDED.source_publisher,
           verification_status = EXCLUDED.verification_status,
           source_type = EXCLUDED.source_type,
           match_status = EXCLUDED.match_status,
           metadata = EXCLUDED.metadata,
           retrieval_date = CURRENT_DATE
       RETURNING *`,
      [
        data.manufacturer,
        data.modelNumber,
        data.productFamily ?? null,
        JSON.stringify(data.publicSpecs),
        data.sourceUrl,
        data.sourcePublisher,
        data.verificationStatus ?? 'PUBLIC_SUGGESTION',
        data.sourceType ?? 'UNKNOWN_UNVERIFIED',
        data.matchStatus ?? 'EXACT_MATCH',
        JSON.stringify(meta),
      ]
    );
    const row = res.rows[0];
    const rowMeta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return {
      id: row.id,
      manufacturer: row.manufacturer,
      modelNumber: row.model_number,
      productFamily: row.product_family || undefined,
      publicSpecs: typeof row.public_specs === 'string' ? JSON.parse(row.public_specs) : (row.public_specs || {}),
      sourceUrl: row.source_url,
      sourcePublisher: row.source_publisher,
      retrievalDate: row.retrieval_date ? row.retrieval_date.toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      verificationStatus: row.verification_status,
      approvedByUserId: row.approved_by_user_id || null,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      sourceType: row.source_type || rowMeta.sourceType,
      matchStatus: row.match_status || rowMeta.matchStatus,
      missingModelDetails: rowMeta.missingModelDetails,
      completenessSummary: rowMeta.completenessSummary,
      evidenceRecords: rowMeta.evidenceRecords,
      conflicts: rowMeta.conflicts,
      reviewNotes: rowMeta.reviewNotes,
    };
  }

  public async updatePublicMachineKnowledgeStatus(
    id: string,
    status: SpecVerificationStatus,
    approvedByUserId: string,
    reviewNotes?: string
  ): Promise<PublicMachineKnowledge | null> {
    const existing = await this.pool.query(
      `SELECT * FROM public_machine_knowledge WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) return null;

    const rowExisting = existing.rows[0];
    const meta = typeof rowExisting.metadata === 'string' ? JSON.parse(rowExisting.metadata) : (rowExisting.metadata || {});
    if (reviewNotes) {
      meta.reviewNotes = reviewNotes;
    }

    const res = await this.pool.query(
      `UPDATE public_machine_knowledge
       SET verification_status = $1, approved_by_user_id = $2, approved_at = NOW(), metadata = $3
       WHERE id = $4
       RETURNING *`,
      [status, approvedByUserId, JSON.stringify(meta), id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const rowMeta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return {
      id: row.id,
      manufacturer: row.manufacturer,
      modelNumber: row.model_number,
      productFamily: row.product_family || undefined,
      publicSpecs: typeof row.public_specs === 'string' ? JSON.parse(row.public_specs) : (row.public_specs || {}),
      sourceUrl: row.source_url,
      sourcePublisher: row.source_publisher,
      retrievalDate: row.retrieval_date ? row.retrieval_date.toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      verificationStatus: row.verification_status,
      approvedByUserId: row.approved_by_user_id || null,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      sourceType: row.source_type || rowMeta.sourceType,
      matchStatus: row.match_status || rowMeta.matchStatus,
      missingModelDetails: rowMeta.missingModelDetails,
      completenessSummary: rowMeta.completenessSummary,
      evidenceRecords: rowMeta.evidenceRecords,
      conflicts: rowMeta.conflicts,
      reviewNotes: rowMeta.reviewNotes,
    };
  }

  // --------------------------------------------------------------------------
  // Industry Profiles (Universal Industry Support)
  // --------------------------------------------------------------------------
  public async listIndustryProfiles(organizationId: string): Promise<IndustryProfile[]> {
    try {
      const res = await this.pool.query(
        `SELECT id, organization_id, code, name, description, is_custom,
                asset_categories, terminology, drawing_types, custom_fields, standard_certifications,
                created_at, updated_at
         FROM industry_profiles
         WHERE organization_id = 'GLOBAL' OR organization_id = $1
         ORDER BY is_custom ASC, name ASC`,
        [organizationId]
      );
      if (res.rows.length === 0) {
        return DEFAULT_INDUSTRY_PROFILES;
      }
      return res.rows.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        code: r.code,
        name: r.name,
        description: r.description,
        isCustom: r.is_custom,
        assetCategories: typeof r.asset_categories === 'string' ? JSON.parse(r.asset_categories) : (r.asset_categories || []),
        terminology: typeof r.terminology === 'string' ? JSON.parse(r.terminology) : (r.terminology || {}),
        drawingTypes: typeof r.drawing_types === 'string' ? JSON.parse(r.drawing_types) : (r.drawing_types || []),
        customFields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || []),
        standardCertifications: typeof r.standard_certifications === 'string' ? JSON.parse(r.standard_certifications) : (r.standard_certifications || []),
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      }));
    } catch {
      return DEFAULT_INDUSTRY_PROFILES;
    }
  }

  public async getIndustryProfileByCode(organizationId: string, code: string): Promise<IndustryProfile | null> {
    try {
      const res = await this.pool.query(
        `SELECT id, organization_id, code, name, description, is_custom,
                asset_categories, terminology, drawing_types, custom_fields, standard_certifications,
                created_at, updated_at
         FROM industry_profiles
         WHERE (organization_id = $1 OR organization_id = 'GLOBAL') AND UPPER(code) = UPPER($2)
         ORDER BY (organization_id = $1) DESC
         LIMIT 1`,
        [organizationId, code]
      );
      if (res.rows.length === 0) {
        const found = DEFAULT_INDUSTRY_PROFILES.find((p) => p.code.toUpperCase() === code.toUpperCase());
        return found ? { ...found } : null;
      }
      const r = res.rows[0];
      return {
        id: r.id,
        organizationId: r.organization_id,
        code: r.code,
        name: r.name,
        description: r.description,
        isCustom: r.is_custom,
        assetCategories: typeof r.asset_categories === 'string' ? JSON.parse(r.asset_categories) : (r.asset_categories || []),
        terminology: typeof r.terminology === 'string' ? JSON.parse(r.terminology) : (r.terminology || {}),
        drawingTypes: typeof r.drawing_types === 'string' ? JSON.parse(r.drawing_types) : (r.drawing_types || []),
        customFields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || []),
        standardCertifications: typeof r.standard_certifications === 'string' ? JSON.parse(r.standard_certifications) : (r.standard_certifications || []),
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      };
    } catch {
      const found = DEFAULT_INDUSTRY_PROFILES.find((p) => p.code.toUpperCase() === code.toUpperCase());
      return found ? { ...found } : null;
    }
  }

  public async createIndustryProfile(organizationId: string, data: CreateIndustryProfileDTO): Promise<IndustryProfile> {
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO industry_profiles (
         id, organization_id, code, name, description, is_custom,
         asset_categories, terminology, drawing_types, custom_fields, standard_certifications
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        organizationId,
        data.code.toUpperCase(),
        data.name,
        data.description,
        data.isCustom ?? true,
        JSON.stringify(data.assetCategories || []),
        JSON.stringify(data.terminology || {}),
        JSON.stringify(data.drawingTypes || []),
        JSON.stringify(data.customFields || []),
        JSON.stringify(data.standardCertifications || []),
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      code: r.code,
      name: r.name,
      description: r.description,
      isCustom: r.is_custom,
      assetCategories: typeof r.asset_categories === 'string' ? JSON.parse(r.asset_categories) : (r.asset_categories || []),
      terminology: typeof r.terminology === 'string' ? JSON.parse(r.terminology) : (r.terminology || {}),
      drawingTypes: typeof r.drawing_types === 'string' ? JSON.parse(r.drawing_types) : (r.drawing_types || []),
      customFields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || []),
      standardCertifications: typeof r.standard_certifications === 'string' ? JSON.parse(r.standard_certifications) : (r.standard_certifications || []),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  public async updateIndustryProfile(
    organizationId: string,
    profileId: string,
    updates: Partial<IndustryProfile>
  ): Promise<IndustryProfile | null> {
    const check = await this.pool.query(
      `SELECT * FROM industry_profiles WHERE id = $1 AND (organization_id = $2 OR organization_id = 'GLOBAL')`,
      [profileId, organizationId]
    );
    if (check.rows.length === 0) return null;
    const current = check.rows[0];

    if (current.organization_id === 'GLOBAL') {
      return this.createIndustryProfile(organizationId, {
        code: updates.code || current.code,
        name: updates.name || current.name,
        description: updates.description || current.description,
        isCustom: true,
        assetCategories: updates.assetCategories || (typeof current.asset_categories === 'string' ? JSON.parse(current.asset_categories) : current.asset_categories),
        terminology: updates.terminology || (typeof current.terminology === 'string' ? JSON.parse(current.terminology) : current.terminology),
        drawingTypes: updates.drawingTypes || (typeof current.drawing_types === 'string' ? JSON.parse(current.drawing_types) : current.drawing_types),
        customFields: updates.customFields || (typeof current.custom_fields === 'string' ? JSON.parse(current.custom_fields) : current.custom_fields),
        standardCertifications: updates.standardCertifications || (typeof current.standard_certifications === 'string' ? JSON.parse(current.standard_certifications) : current.standard_certifications),
      });
    }

    const res = await this.pool.query(
      `UPDATE industry_profiles
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           asset_categories = COALESCE($3, asset_categories),
           terminology = COALESCE($4, terminology),
           drawing_types = COALESCE($5, drawing_types),
           custom_fields = COALESCE($6, custom_fields),
           standard_certifications = COALESCE($7, standard_certifications),
           updated_at = NOW()
       WHERE id = $8 AND organization_id = $9
       RETURNING *`,
      [
        updates.name ?? null,
        updates.description ?? null,
        updates.assetCategories ? JSON.stringify(updates.assetCategories) : null,
        updates.terminology ? JSON.stringify(updates.terminology) : null,
        updates.drawingTypes ? JSON.stringify(updates.drawingTypes) : null,
        updates.customFields ? JSON.stringify(updates.customFields) : null,
        updates.standardCertifications ? JSON.stringify(updates.standardCertifications) : null,
        profileId,
        organizationId,
      ]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      code: r.code,
      name: r.name,
      description: r.description,
      isCustom: r.is_custom,
      assetCategories: typeof r.asset_categories === 'string' ? JSON.parse(r.asset_categories) : (r.asset_categories || []),
      terminology: typeof r.terminology === 'string' ? JSON.parse(r.terminology) : (r.terminology || {}),
      drawingTypes: typeof r.drawing_types === 'string' ? JSON.parse(r.drawing_types) : (r.drawing_types || []),
      customFields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || []),
      standardCertifications: typeof r.standard_certifications === 'string' ? JSON.parse(r.standard_certifications) : (r.standard_certifications || []),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  public async deleteIndustryProfile(organizationId: string, profileId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM industry_profiles WHERE id = $1 AND organization_id = $2`,
      [profileId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Engineering 3D Models & CAD Files
  // --------------------------------------------------------------------------
  public async createEngineeringModel3D(
    organizationId: string,
    data: CreateEngineeringModel3DDTO
  ): Promise<EngineeringModel3D> {
    const id = crypto.randomUUID();
    let status = data.status ?? 'NEEDS_REVIEW';
    let errorMessage: string | null = null;
    let convertedStorageKey = data.convertedStorageKey ?? null;

    if (data.fileSizeBytes <= 0) {
      status = 'PROCESSING_FAILED';
      errorMessage = 'Empty or corrupted CAD geometry file payload.';
    } else if (['STEP', 'STP', 'IGES', 'IGS', 'STL', 'OBJ'].includes(data.fileFormat)) {
      status = 'NEEDS_REVIEW';
      convertedStorageKey = data.storageKey.replace(/\.[^.]+$/, '.glb');
    }

    const res = await this.pool.query(
      `INSERT INTO engineering_models3d (
         id, organization_id, plant_id, machine_id, asset_id, industry_profile_code,
         asset_category, title, manufacturer, model_number, source_provider, source_url,
         file_format, file_size_bytes, file_hash_sha256, storage_key, converted_storage_key,
         model_revision, status, data_classification, license_usage_rights, uploaded_by_user_id,
         review_notes, error_message, extracted_components_count
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
       RETURNING *`,
      [
        id,
        organizationId,
        data.plantId,
        data.machineId ?? null,
        data.assetId ?? data.machineId ?? null,
        data.industryProfileCode,
        data.assetCategory,
        data.title,
        data.manufacturer ?? null,
        data.modelNumber ?? null,
        data.sourceProvider ?? null,
        data.sourceUrl ?? null,
        data.fileFormat,
        data.fileSizeBytes,
        data.fileHashSha256,
        data.storageKey,
        convertedStorageKey,
        data.modelRevision || '1.0',
        status,
        data.dataClassification || 'INTERNAL',
        data.licenseUsageRights ?? null,
        data.uploadedByUserId,
        data.reviewNotes ?? null,
        errorMessage,
        data.extractedComponentsCount || 12,
      ]
    );
    const r = res.rows[0];

    if (data.machineId && status === 'APPROVED') {
      await this.pool.query(
        `UPDATE assets
         SET has_model3d = TRUE,
             model3d_storage_key = $1,
             model3d_format = $2,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $3 AND organization_id = $4`,
        [convertedStorageKey || data.storageKey, data.fileFormat, data.machineId, organizationId]
      );
    }

    return this.mapEngineeringModelRow(r);
  }

  public async getEngineeringModel3DById(organizationId: string, modelId: string): Promise<EngineeringModel3D | null> {
    const res = await this.pool.query(
      `SELECT * FROM engineering_models3d WHERE id = $1 AND organization_id = $2`,
      [modelId, organizationId]
    );
    if (res.rows.length > 0) {
      return this.mapEngineeringModelRow(res.rows[0]);
    }

    // Fallback: check if modelId refers to an asset model (asset-3d-<id>, local-<tag/id>, or asset id/tag)
    const targetAssetRef = modelId.replace(/^asset-3d-/, '').replace(/^local-/, '');
    const assetRes = await this.pool.query(
      `SELECT * FROM assets 
       WHERE organization_id = $1 
         AND (id::text = $2 OR asset_tag = $2)
         AND (has_model3d = TRUE OR model3d_storage_key IS NOT NULL OR (technical_specs->>'model3dFileName') IS NOT NULL)`,
      [organizationId, targetAssetRef]
    );

    if (assetRes.rows.length === 0) return null;
    const a = assetRes.rows[0];
    const specs = (typeof a.technical_specs === 'string' ? JSON.parse(a.technical_specs) : a.technical_specs || {}) as Record<string, any>;
    const rawFileName = specs.model3dFileName || (a.model3d_storage_key ? a.model3d_storage_key.split('/').pop() : `${a.asset_tag}-model.glb`);
    const ext = (a.model3d_format || rawFileName.split('.').pop() || 'GLB').toUpperCase();
    const storageKey = a.model3d_storage_key || `models/${a.asset_tag}-${rawFileName}`;
    let convertedStorageKey: string | undefined;
    if (['STEP', 'STP', 'IGES', 'IGS'].includes(ext)) {
      convertedStorageKey = storageKey.replace(/\.[^.]+$/, '.glb');
    }

    return {
      id: modelId.startsWith('asset-3d-') ? modelId : `asset-3d-${a.id}`,
      organizationId: a.organization_id,
      plantId: a.plant_id || 'PLANT-DEFAULT',
      machineId: a.id,
      assetId: a.id,
      industryProfileCode: 'GENERAL',
      assetCategory: a.machine_type || 'Industrial Machinery',
      title: rawFileName,
      manufacturer: a.manufacturer || undefined,
      modelNumber: a.model_number || undefined,
      sourceProvider: 'Asset Registry Ledger',
      fileFormat: ext as CADFileFormat,
      fileSizeBytes: Number(specs.model3dFileSize) || 4194304,
      fileHashSha256: 'asset_linked',
      storageKey,
      convertedStorageKey,
      modelRevision: '1.0',
      status: 'APPROVED',
      dataClassification: a.data_classification || 'INTERNAL',
      uploadedByUserId: 'system',
      createdAt: a.created_at ? a.created_at.toISOString() : new Date().toISOString(),
      updatedAt: a.updated_at ? a.updated_at.toISOString() : new Date().toISOString(),
      extractedComponentsCount: 12,
    };
  }

  public async listEngineeringModels3D(
    organizationId: string,
    filters?: EngineeringModelFilterOptions
  ): Promise<EngineeringModel3D[]> {
    let query = `SELECT * FROM engineering_models3d WHERE organization_id = $1`;
    const params: unknown[] = [organizationId];

    if (filters?.plantId) {
      params.push(filters.plantId);
      query += ` AND plant_id = $${params.length}`;
    }
    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        params.push(safeUuid);
        query += ` AND machine_id = $${params.length}`;
      } else {
        params.push(cleanMachineId);
        query += ` AND machine_id::text = $${params.length}`;
      }
    }
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }
    if (filters?.fileFormat) {
      params.push(filters.fileFormat);
      query += ` AND file_format = $${params.length}`;
    }
    if (filters?.industryProfileCode) {
      params.push(filters.industryProfileCode);
      query += ` AND industry_profile_code = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const res = await this.pool.query(query, params);
    const explicitModels = res.rows.map((r) => this.mapEngineeringModelRow(r));

    // Global File Aggregation: Find models from assets with 3D attachments in this tenant
    const representedMachineIds = new Set<string>();
    const representedStorageKeys = new Set<string>();
    for (const m of explicitModels) {
      if (m.machineId) representedMachineIds.add(m.machineId);
      if (m.assetId) representedMachineIds.add(m.assetId);
      if (m.storageKey) representedStorageKeys.add(m.storageKey);
    }

    let assetQuery = `
      SELECT * FROM assets 
      WHERE organization_id = $1 
        AND (has_model3d = TRUE OR model3d_storage_key IS NOT NULL OR (technical_specs->>'model3dFileName') IS NOT NULL)
    `;
    const assetParams: unknown[] = [organizationId];
    if (filters?.plantId) {
      assetParams.push(filters.plantId);
      assetQuery += ` AND plant_id = $${assetParams.length}`;
    }
    if (filters?.machineId) {
      assetParams.push(filters.machineId);
      assetQuery += ` AND (id::text = $${assetParams.length} OR asset_tag = $${assetParams.length})`;
    }
    assetQuery += ` ORDER BY created_at DESC`;

    const assetRes = await this.pool.query(assetQuery, assetParams);
    const aggregatedModels: EngineeringModel3D[] = [...explicitModels];

    for (const a of assetRes.rows) {
      if (representedMachineIds.has(a.id) || (a.model3d_storage_key && representedStorageKeys.has(a.model3d_storage_key))) {
        continue;
      }
      const specs = (typeof a.technical_specs === 'string' ? JSON.parse(a.technical_specs) : a.technical_specs || {}) as Record<string, any>;
      const rawFileName = specs.model3dFileName || (a.model3d_storage_key ? a.model3d_storage_key.split('/').pop() : `${a.asset_tag}-model.glb`);
      const ext = (a.model3d_format || rawFileName.split('.').pop() || 'GLB').toUpperCase();
      const storageKey = a.model3d_storage_key || `models/${a.asset_tag}-${rawFileName}`;

      if (filters?.fileFormat && ext !== filters.fileFormat) {
        continue;
      }
      if (filters?.status && filters.status !== 'APPROVED') {
        continue;
      }

      let convertedStorageKey: string | undefined;
      if (['STEP', 'STP', 'IGES', 'IGS'].includes(ext)) {
        convertedStorageKey = storageKey.replace(/\.[^.]+$/, '.glb');
      }

      aggregatedModels.push({
        id: `asset-3d-${a.id}`,
        organizationId: a.organization_id,
        plantId: a.plant_id || 'PLANT-DEFAULT',
        machineId: a.id,
        assetId: a.id,
        industryProfileCode: 'GENERAL',
        assetCategory: a.machine_type || 'Industrial Machinery',
        title: rawFileName,
        manufacturer: a.manufacturer || undefined,
        modelNumber: a.model_number || undefined,
        sourceProvider: 'Asset Registry Ledger',
        fileFormat: ext as CADFileFormat,
        fileSizeBytes: Number(specs.model3dFileSize) || 4194304,
        fileHashSha256: 'asset_linked',
        storageKey,
        convertedStorageKey,
        modelRevision: '1.0',
        status: 'APPROVED',
        dataClassification: a.data_classification || 'INTERNAL',
        uploadedByUserId: 'system',
        createdAt: a.created_at ? a.created_at.toISOString() : new Date().toISOString(),
        updatedAt: a.updated_at ? a.updated_at.toISOString() : new Date().toISOString(),
        extractedComponentsCount: 12,
      });
      representedMachineIds.add(a.id);
      if (storageKey) representedStorageKeys.add(storageKey);
    }

    return aggregatedModels;
  }

  public async updateEngineeringModel3D(
    organizationId: string,
    modelId: string,
    updates: Partial<EngineeringModel3D>
  ): Promise<EngineeringModel3D | null> {
    const res = await this.pool.query(
      `UPDATE engineering_models3d
       SET status = COALESCE($1, status),
           reviewed_by_user_id = COALESCE($2, reviewed_by_user_id),
           reviewed_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE reviewed_at END,
           review_notes = COALESCE($3, review_notes),
           model_revision = COALESCE($4, model_revision),
           updated_at = NOW()
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        updates.status ?? null,
        updates.reviewedByUserId ?? null,
        updates.reviewNotes ?? null,
        updates.modelRevision ?? null,
        modelId,
        organizationId,
      ]
    );
    if (res.rows.length === 0) return null;
    const model = this.mapEngineeringModelRow(res.rows[0]);

    if (model.status === 'APPROVED' && model.machineId) {
      await this.pool.query(
        `UPDATE assets
         SET has_model3d = TRUE,
             model3d_storage_key = $1,
             model3d_format = $2,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $3 AND organization_id = $4`,
        [model.convertedStorageKey || model.storageKey, model.fileFormat, model.machineId, organizationId]
      );
    }

    return model;
  }

  public async deleteEngineeringModel3D(organizationId: string, modelId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM engineering_models3d WHERE id = $1 AND organization_id = $2`,
      [modelId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapEngineeringModelRow(r: any): EngineeringModel3D {
    return {
      id: r.id,
      organizationId: r.organization_id,
      plantId: r.plant_id,
      machineId: r.machine_id || undefined,
      assetId: r.asset_id || r.machine_id || undefined,
      industryProfileCode: r.industry_profile_code,
      assetCategory: r.asset_category,
      title: r.title,
      manufacturer: r.manufacturer || undefined,
      modelNumber: r.model_number || undefined,
      sourceProvider: r.source_provider || undefined,
      sourceUrl: r.source_url || undefined,
      fileFormat: r.file_format,
      fileSizeBytes: Number(r.file_size_bytes),
      fileHashSha256: r.file_hash_sha256,
      storageKey: r.storage_key,
      convertedStorageKey: r.converted_storage_key || undefined,
      modelRevision: r.model_revision,
      status: r.status,
      dataClassification: r.data_classification,
      licenseUsageRights: r.license_usage_rights || undefined,
      uploadedByUserId: r.uploaded_by_user_id,
      reviewedByUserId: r.reviewed_by_user_id || undefined,
      reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : undefined,
      reviewNotes: r.review_notes || undefined,
      errorMessage: r.error_message || undefined,
      extractedComponentsCount: r.extracted_components_count ?? 0,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
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

    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO manufacturer_resources (
         id, organization_id, machine_id, resource_type, title, manufacturer, model_number,
         source_type, source_url, storage_key, file_format, file_size_bytes, file_hash_sha256,
         version_revision, verification_status, access_requirements, usage_rights_evidence,
         uploaded_by_user_id, review_notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        id,
        organizationId,
        data.machineId ?? null,
        data.resourceType,
        data.title,
        data.manufacturer,
        data.modelNumber ?? null,
        data.sourceType,
        data.sourceUrl ?? null,
        data.storageKey ?? null,
        data.fileFormat ?? null,
        data.fileSizeBytes ?? null,
        data.fileHashSha256 ?? null,
        data.versionRevision || '1.0',
        data.verificationStatus || 'UNVERIFIED',
        data.accessRequirements ?? null,
        data.usageRightsEvidence ?? null,
        data.uploadedByUserId,
        data.reviewNotes ?? null,
      ]
    );
    return this.mapManufacturerResourceRow(res.rows[0]);
  }

  public async getManufacturerResourceById(organizationId: string, resourceId: string): Promise<ManufacturerResource | null> {
    const res = await this.pool.query(
      `SELECT * FROM manufacturer_resources WHERE id = $1 AND organization_id = $2`,
      [resourceId, organizationId]
    );
    if (res.rows.length > 0) {
      return this.mapManufacturerResourceRow(res.rows[0]);
    }

    if (resourceId.startsWith('doc-res-')) {
      const docId = resourceId.replace(/^doc-res-/, '');
      const docRes = await this.pool.query(
        `SELECT d.id as doc_id, d.title, d.category, d.document_number, d.asset_tags, d.created_at, d.updated_at,
                v.storage_key, v.filename, v.file_size_bytes,
                a.id as asset_id, a.manufacturer as asset_manufacturer, a.model_number as asset_model_number
         FROM documents d
         JOIN document_versions v ON v.document_id = d.id
         LEFT JOIN assets a ON a.organization_id = d.organization_id AND (a.asset_tag = ANY(d.asset_tags) OR a.asset_tag = d.document_number)
         WHERE d.id = $1 AND d.organization_id = $2`,
        [docId, organizationId]
      );
      if (docRes.rows.length === 0) return null;
      const row = docRes.rows[0];
      const isManual = row.category === 'OEM_MANUAL' || row.category === 'MANUAL';
      const ext = (row.filename?.split('.').pop() || 'PDF').toUpperCase();
      return {
        id: resourceId,
        organizationId,
        machineId: row.asset_id || undefined,
        resourceType: isManual ? 'OFFICIAL_MANUAL' : 'APPROVED_REFERENCE',
        title: row.title || row.filename,
        manufacturer: row.asset_manufacturer || 'OEM / Plant Document',
        modelNumber: row.asset_model_number || row.document_number,
        sourceType: 'FILE_UPLOAD',
        storageKey: row.storage_key,
        fileFormat: ext as any,
        fileSizeBytes: Number(row.file_size_bytes) || 1048576,
        versionRevision: '1.0',
        verificationStatus: 'VERIFIED',
        createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
      };
    }

    return null;
  }

  public async listManufacturerResources(
    organizationId: string,
    filters?: ManufacturerResourceFilterOptions
  ): Promise<ManufacturerResource[]> {
    let query = `SELECT * FROM manufacturer_resources WHERE organization_id = $1`;
    const params: unknown[] = [organizationId];

    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        params.push(safeUuid);
        query += ` AND machine_id = $${params.length}`;
      } else {
        params.push(cleanMachineId);
        query += ` AND machine_id::text = $${params.length}`;
      }
    }
    if (filters?.resourceType) {
      params.push(filters.resourceType);
      query += ` AND resource_type = $${params.length}`;
    }
    if (filters?.verificationStatus) {
      params.push(filters.verificationStatus);
      query += ` AND verification_status = $${params.length}`;
    }
    if (filters?.manufacturer) {
      params.push(`%${filters.manufacturer}%`);
      query += ` AND manufacturer ILIKE $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const res = await this.pool.query(query, params);
    const explicitResources = res.rows.map((r) => this.mapManufacturerResourceRow(r));

    // Global File Aggregation: Find documents from documents + document_versions
    const docQuery = `
      SELECT d.id as doc_id, d.title, d.category, d.document_number, d.asset_tags, d.asset_ids, d.machine_id, d.created_at, d.updated_at,
             v.storage_key, v.filename, v.file_size_bytes, v.mime_type,
             a.id as asset_id, a.manufacturer as asset_manufacturer, a.model_number as asset_model_number
      FROM documents d
      JOIN document_versions v ON v.document_id = d.id
      LEFT JOIN asset_documents ad ON ad.document_id = d.id
      LEFT JOIN assets a ON a.organization_id = d.organization_id AND (
        a.id = ad.asset_id OR
        a.id = d.machine_id OR
        a.id::text = ANY(d.asset_ids) OR
        a.asset_tag = ANY(d.asset_tags) OR
        a.asset_tag = d.document_number
      )
      WHERE d.organization_id = $1
      ORDER BY d.created_at DESC
    `;
    const docRes = await this.pool.query(docQuery, [organizationId]);
    const aggregatedResources = [...explicitResources];
    const representedKeys = new Set<string>(explicitResources.map((r) => r.storageKey).filter(Boolean) as string[]);

    for (const row of docRes.rows) {
      if (!row.storage_key || representedKeys.has(row.storage_key)) continue;
      if (filters?.machineId && row.asset_id !== filters.machineId) continue;

      const isManual = row.category === 'OEM_MANUAL' || row.category === 'MANUAL';
      const rType: ManufacturerResourceType = isManual ? 'OFFICIAL_MANUAL' : 'APPROVED_REFERENCE';
      if (filters?.resourceType && filters.resourceType !== rType) continue;

      const ext = (row.filename?.split('.').pop() || 'PDF').toUpperCase();

      aggregatedResources.push({
        id: `doc-res-${row.doc_id}`,
        organizationId,
        machineId: row.asset_id || undefined,
        resourceType: rType,
        title: row.title || row.filename,
        manufacturer: row.asset_manufacturer || 'OEM / Plant Document',
        modelNumber: row.asset_model_number || row.document_number,
        sourceType: 'FILE_UPLOAD',
        storageKey: row.storage_key,
        fileFormat: ext as any,
        fileSizeBytes: Number(row.file_size_bytes) || 1048576,
        versionRevision: '1.0',
        verificationStatus: 'VERIFIED',
        createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
      });
      representedKeys.add(row.storage_key);
    }

    return aggregatedResources;
  }

  public async updateManufacturerResource(
    organizationId: string,
    resourceId: string,
    updates: Partial<ManufacturerResource>
  ): Promise<ManufacturerResource | null> {
    const res = await this.pool.query(
      `UPDATE manufacturer_resources
       SET verification_status = COALESCE($1, verification_status),
           verified_by_user_id = COALESCE($2, verified_by_user_id),
           verified_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE verified_at END,
           review_notes = COALESCE($3, review_notes),
           updated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING *`,
      [
        updates.verificationStatus ?? null,
        updates.verifiedByUserId ?? null,
        updates.reviewNotes ?? null,
        resourceId,
        organizationId,
      ]
    );
    if (res.rows.length === 0) return null;
    return this.mapManufacturerResourceRow(res.rows[0]);
  }

  public async deleteManufacturerResource(organizationId: string, resourceId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM manufacturer_resources WHERE id = $1 AND organization_id = $2`,
      [resourceId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapManufacturerResourceRow(r: any): ManufacturerResource {
    return {
      id: r.id,
      organizationId: r.organization_id,
      machineId: r.machine_id || undefined,
      resourceType: r.resource_type,
      title: r.title,
      manufacturer: r.manufacturer,
      modelNumber: r.model_number || undefined,
      sourceType: r.source_type,
      sourceUrl: r.source_url || undefined,
      storageKey: r.storage_key || undefined,
      fileFormat: r.file_format || undefined,
      fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : undefined,
      fileHashSha256: r.file_hash_sha256 || undefined,
      versionRevision: r.version_revision,
      verificationStatus: r.verification_status,
      accessRequirements: r.access_requirements || undefined,
      usageRightsEvidence: r.usage_rights_evidence || undefined,
      uploadedByUserId: r.uploaded_by_user_id,
      verifiedByUserId: r.verified_by_user_id || undefined,
      verifiedAt: r.verified_at ? r.verified_at.toISOString() : undefined,
      reviewNotes: r.review_notes || undefined,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
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
    const sizeBytes = Number(data.fileSizeBytes) || 1024;
    let status = data.status ?? 'NEEDS_REVIEW';
    let errorMessage: string | null = null;
    if (sizeBytes <= 0) {
      status = 'PROCESSING_FAILED';
      errorMessage = 'Empty or unreadable drawing file payload.';
    }

    const res = await this.pool.query(
      `INSERT INTO engineering_drawings (
         id, organization_id, plant_id, machine_id, drawing_title, unique_drawing_number,
         drawing_type, discipline, revision, effective_date, source, storage_key,
         original_file_name, file_format, file_size_bytes, file_hash_sha256, status,
         data_classification, equipment_tags, uploaded_by_user_id, review_notes, error_message
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [
        id,
        organizationId,
        data.plantId || null,
        data.machineId ?? null,
        drawingTitle,
        drawingNumber,
        data.drawingType,
        data.discipline || 'Mechanical',
        data.revision || 'Rev A',
        data.effectiveDate ?? null,
        data.source || 'INTERNAL',
        data.storageKey,
        data.originalFileName || `${drawingNumber}.pdf`,
        data.fileFormat || 'PDF',
        sizeBytes,
        data.fileHashSha256 || 'hash-placeholder',
        status,
        data.dataClassification || 'INTERNAL',
        JSON.stringify(data.equipmentTags || []),
        data.uploadedByUserId || 'system',
        data.reviewNotes ?? null,
        errorMessage,
      ]
    );
    const dwg = this.mapEngineeringDrawingRow(res.rows[0]);

    if (data.machineId && status === 'APPROVED' && (data.drawingType === 'PID' || data.drawingType === 'PROCESS_FLOW')) {
      await this.pool.query(
        `UPDATE assets
         SET has_pid_diagram = TRUE,
             pid_storage_key = $1,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $2 AND organization_id = $3`,
        [dwg.storageKey, data.machineId, organizationId]
      );
    }

    return dwg;
  }

  public async getEngineeringDrawingById(organizationId: string, drawingId: string): Promise<EngineeringDrawing | null> {
    const res = await this.pool.query(
      `SELECT * FROM engineering_drawings WHERE id = $1 AND organization_id = $2`,
      [drawingId, organizationId]
    );
    if (res.rows.length > 0) {
      return this.mapEngineeringDrawingRow(res.rows[0]);
    }

    // Fallback: check if drawingId refers to an asset drawing (asset-pid-<id>, asset-dwg-<id>, local-pid-<id>, local-<tag/id>, or asset id/tag)
    const targetAssetRef = drawingId.replace(/^asset-pid-/, '').replace(/^asset-dwg-/, '').replace(/^local-pid-/, '').replace(/^local-/, '');
    const assetRes = await this.pool.query(
      `SELECT * FROM assets 
       WHERE organization_id = $1 
         AND (id::text = $2 OR asset_tag = $2)
         AND (has_pid_diagram = TRUE OR pid_storage_key IS NOT NULL OR (technical_specs->>'pidFileName') IS NOT NULL)`,
      [organizationId, targetAssetRef]
    );

    if (assetRes.rows.length === 0) return null;
    const a = assetRes.rows[0];
    const specs = (typeof a.technical_specs === 'string' ? JSON.parse(a.technical_specs) : a.technical_specs || {}) as Record<string, any>;
    const rawFileName = specs.pidFileName || (a.pid_storage_key ? a.pid_storage_key.split('/').pop() : `${a.asset_tag}-drawing.pdf`);
    const ext = (rawFileName.split('.').pop() || 'PDF').toUpperCase();
    const format = ext === 'SVG' ? 'SVG' : ext === 'PDF' ? 'PDF' : ext === 'PNG' ? 'PNG' : ext === 'JPG' || ext === 'JPEG' ? 'JPG' : 'PDF';
    const storageKey = a.pid_storage_key || `schematics/${a.asset_tag}-${rawFileName}`;

    return {
      id: drawingId.startsWith('asset-pid-') ? drawingId : `asset-pid-${a.id}`,
      organizationId: a.organization_id,
      plantId: a.plant_id || 'PLANT-DEFAULT',
      machineId: a.id,
      drawingTitle: rawFileName,
      uniqueDrawingNumber: `PID-${a.asset_tag}`,
      drawingType: 'PID',
      discipline: 'Process & Mechanical',
      revision: 'Rev 1.0',
      effectiveDate: a.installation_date ? a.installation_date.toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
      source: 'Authoritative Asset Ledger',
      storageKey,
      originalFileName: rawFileName,
      fileFormat: format as any,
      fileSizeBytes: Number(specs.pidFileSize) || 2097152,
      fileHashSha256: 'asset_linked',
      status: 'APPROVED',
      dataClassification: a.data_classification || 'INTERNAL',
      equipmentTags: [a.asset_tag],
      uploadedByUserId: 'system',
      createdAt: a.created_at ? a.created_at.toISOString() : new Date().toISOString(),
      updatedAt: a.updated_at ? a.updated_at.toISOString() : new Date().toISOString(),
    };
  }

  public async listEngineeringDrawings(
    organizationId: string,
    filters?: EngineeringDrawingFilterOptions
  ): Promise<EngineeringDrawing[]> {
    let query = `SELECT * FROM engineering_drawings WHERE organization_id = $1`;
    const params: unknown[] = [organizationId];

    if (filters?.plantId) {
      params.push(filters.plantId);
      query += ` AND plant_id = $${params.length}`;
    }
    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        params.push(safeUuid);
        query += ` AND machine_id = $${params.length}`;
      } else {
        params.push(cleanMachineId);
        query += ` AND machine_id::text = $${params.length}`;
      }
    }
    if (filters?.drawingType) {
      params.push(filters.drawingType);
      query += ` AND drawing_type = $${params.length}`;
    }
    if (filters?.discipline) {
      params.push(filters.discipline);
      query += ` AND discipline ILIKE $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const res = await this.pool.query(query, params);
    const explicitDrawings = res.rows.map((r) => this.mapEngineeringDrawingRow(r));

    // Global File Aggregation: Find drawings from assets with P&ID attachments in this tenant
    const representedMachineIds = new Set<string>();
    const representedStorageKeys = new Set<string>();
    for (const d of explicitDrawings) {
      if (d.machineId) representedMachineIds.add(d.machineId);
      if (d.storageKey) representedStorageKeys.add(d.storageKey);
    }

    let assetQuery = `
      SELECT * FROM assets 
      WHERE organization_id = $1 
        AND (has_pid_diagram = TRUE OR pid_storage_key IS NOT NULL OR (technical_specs->>'pidFileName') IS NOT NULL)
    `;
    const assetParams: unknown[] = [organizationId];
    if (filters?.plantId) {
      assetParams.push(filters.plantId);
      assetQuery += ` AND plant_id = $${assetParams.length}`;
    }
    if (filters?.machineId) {
      assetParams.push(filters.machineId);
      assetQuery += ` AND (id::text = $${assetParams.length} OR asset_tag = $${assetParams.length})`;
    }
    assetQuery += ` ORDER BY created_at DESC`;

    const assetRes = await this.pool.query(assetQuery, assetParams);
    const aggregatedDrawings: EngineeringDrawing[] = [...explicitDrawings];

    for (const a of assetRes.rows) {
      if (representedMachineIds.has(a.id) || (a.pid_storage_key && representedStorageKeys.has(a.pid_storage_key))) {
        continue;
      }
      if (filters?.drawingType && filters.drawingType !== 'PID' && filters.drawingType !== 'PROCESS_FLOW') {
        continue;
      }
      if (filters?.status && filters.status !== 'APPROVED') {
        continue;
      }

      const specs = (typeof a.technical_specs === 'string' ? JSON.parse(a.technical_specs) : a.technical_specs || {}) as Record<string, any>;
      const rawFileName = specs.pidFileName || (a.pid_storage_key ? a.pid_storage_key.split('/').pop() : `${a.asset_tag}-drawing.pdf`);
      const ext = (rawFileName.split('.').pop() || 'PDF').toUpperCase();
      const format = ext === 'SVG' ? 'SVG' : ext === 'PDF' ? 'PDF' : ext === 'PNG' ? 'PNG' : ext === 'JPG' || ext === 'JPEG' ? 'JPG' : 'PDF';
      const storageKey = a.pid_storage_key || `schematics/${a.asset_tag}-${rawFileName}`;

      aggregatedDrawings.push({
        id: `asset-pid-${a.id}`,
        organizationId: a.organization_id,
        plantId: a.plant_id || 'PLANT-DEFAULT',
        machineId: a.id,
        drawingTitle: rawFileName,
        uniqueDrawingNumber: `PID-${a.asset_tag}`,
        drawingType: 'PID',
        discipline: 'Process & Mechanical',
        revision: 'Rev 1.0',
        effectiveDate: a.installation_date ? a.installation_date.toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10),
        source: 'Authoritative Asset Ledger',
        storageKey,
        originalFileName: rawFileName,
        fileFormat: format as any,
        fileSizeBytes: Number(specs.pidFileSize) || 2097152,
        fileHashSha256: 'asset_linked',
        status: 'APPROVED',
        dataClassification: a.data_classification || 'INTERNAL',
        equipmentTags: [a.asset_tag],
        uploadedByUserId: 'system',
        createdAt: a.created_at ? a.created_at.toISOString() : new Date().toISOString(),
        updatedAt: a.updated_at ? a.updated_at.toISOString() : new Date().toISOString(),
      });
      representedMachineIds.add(a.id);
      if (storageKey) representedStorageKeys.add(storageKey);
    }

    return aggregatedDrawings;
  }

  public async updateEngineeringDrawing(
    organizationId: string,
    drawingId: string,
    updates: Partial<EngineeringDrawing>
  ): Promise<EngineeringDrawing | null> {
    const res = await this.pool.query(
      `UPDATE engineering_drawings
       SET status = COALESCE($1, status),
           reviewed_by_user_id = COALESCE($2, reviewed_by_user_id),
           reviewed_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE reviewed_at END,
           review_notes = COALESCE($3, review_notes),
           revision = COALESCE($4, revision),
           updated_at = NOW()
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        updates.status ?? null,
        updates.reviewedByUserId ?? null,
        updates.reviewNotes ?? null,
        updates.revision ?? null,
        drawingId,
        organizationId,
      ]
    );
    if (res.rows.length === 0) return null;
    const dwg = this.mapEngineeringDrawingRow(res.rows[0]);

    if (dwg.status === 'APPROVED' && dwg.machineId && (dwg.drawingType === 'PID' || dwg.drawingType === 'PROCESS_FLOW')) {
      await this.pool.query(
        `UPDATE assets
         SET has_pid_diagram = TRUE,
             pid_storage_key = $1,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $2 AND organization_id = $3`,
        [dwg.storageKey, dwg.machineId, organizationId]
      );
    }

    return dwg;
  }

  public async deleteEngineeringDrawing(organizationId: string, drawingId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM engineering_drawings WHERE id = $1 AND organization_id = $2`,
      [drawingId, organizationId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  private mapEngineeringDrawingRow(r: any): EngineeringDrawing {
    return {
      id: r.id,
      organizationId: r.organization_id,
      plantId: r.plant_id,
      machineId: r.machine_id || undefined,
      drawingTitle: r.drawing_title,
      uniqueDrawingNumber: r.unique_drawing_number,
      drawingType: r.drawing_type,
      discipline: r.discipline,
      revision: r.revision,
      effectiveDate: r.effective_date ? r.effective_date.toISOString().substring(0, 10) : undefined,
      source: r.source,
      storageKey: r.storage_key,
      originalFileName: r.original_file_name,
      fileFormat: r.file_format,
      fileSizeBytes: Number(r.file_size_bytes),
      fileHashSha256: r.file_hash_sha256,
      status: r.status,
      dataClassification: r.data_classification,
      equipmentTags: typeof r.equipment_tags === 'string' ? JSON.parse(r.equipment_tags) : (r.equipment_tags || []),
      uploadedByUserId: r.uploaded_by_user_id,
      reviewedByUserId: r.reviewed_by_user_id || undefined,
      reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : undefined,
      reviewNotes: r.review_notes || undefined,
      errorMessage: r.error_message || undefined,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Engineering Asset Center Summary
  // --------------------------------------------------------------------------
  public async getEngineeringAssetCenterSummary(organizationId: string): Promise<EngineeringAssetCenterSummary> {
    const [modelsRes, drawingsRes, resourcesRes, profRes] = await Promise.allSettled([
      this.listEngineeringModels3D(organizationId),
      this.listEngineeringDrawings(organizationId),
      this.listManufacturerResources(organizationId),
      this.pool.query(
        `SELECT COUNT(*) as total FROM industry_profiles WHERE organization_id = 'GLOBAL' OR organization_id = $1`,
        [organizationId]
      ),
    ]);

    const models = modelsRes.status === 'fulfilled' ? modelsRes.value : [];
    const drawings = drawingsRes.status === 'fulfilled' ? drawingsRes.value : [];
    const resources = resourcesRes.status === 'fulfilled' ? resourcesRes.value : [];
    const pRows = profRes.status === 'fulfilled' ? profRes.value.rows : [];

    const approvedModels = models.filter((m) => m.status === 'APPROVED').length;
    const pendingModels = models.filter((m) => m.status === 'NEEDS_REVIEW').length;
    const approvedDrawings = drawings.filter((d) => d.status === 'APPROVED').length;
    const pRow = pRows[0];

    return {
      totalModels3d: models.length,
      approvedModels3d: approvedModels,
      pendingReviewModels3d: pendingModels,
      totalDrawings: drawings.length,
      approvedDrawings: approvedDrawings,
      totalManufacturerResources: resources.length,
      totalIndustryProfiles: Number(pRow?.total || DEFAULT_INDUSTRY_PROFILES.length),
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
    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO employee_profiles (
         id, organization_id, user_id, employee_number, department,
         assigned_plant_ids, account_status, availability_status, qualification_status,
         verified_skills, specialized_machine_ids
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        organizationId,
        dto.userId,
        dto.employeeNumber,
        dto.department || 'Operations',
        JSON.stringify(dto.assignedPlantIds || []),
        dto.accountStatus || 'ACTIVE',
        dto.availabilityStatus || 'AVAILABLE',
        dto.qualificationStatus || 'CERTIFIED',
        JSON.stringify(dto.verifiedSkills || []),
        JSON.stringify(dto.specializedMachineIds || []),
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      employeeNumber: row.employee_number,
      fullName: dto.fullName,
      email: dto.email,
      role: dto.role,
      department: row.department,
      assignedPlantIds: typeof row.assigned_plant_ids === 'string' ? JSON.parse(row.assigned_plant_ids) : row.assigned_plant_ids,
      accountStatus: row.account_status,
      availabilityStatus: row.availability_status,
      qualificationStatus: row.qualification_status,
      verifiedSkills: typeof row.verified_skills === 'string' ? JSON.parse(row.verified_skills) : row.verified_skills,
      specializedMachineIds: typeof row.specialized_machine_ids === 'string' ? JSON.parse(row.specialized_machine_ids) : row.specialized_machine_ids,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getEmployeeProfile(organizationId: string, id: string): Promise<EmployeeProfile | null> {
    const res = await this.pool.query(
      `SELECT ep.*, u.full_name, u.email, om.role
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN organization_memberships om ON om.user_id = ep.user_id AND om.organization_id = ep.organization_id
       WHERE ep.organization_id = $1 AND ep.id = $2`,
      [organizationId, id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      employeeNumber: row.employee_number,
      fullName: row.full_name,
      email: row.email,
      role: row.role || 'TECHNICIAN',
      department: row.department,
      assignedPlantIds: typeof row.assigned_plant_ids === 'string' ? JSON.parse(row.assigned_plant_ids) : row.assigned_plant_ids,
      accountStatus: row.account_status,
      availabilityStatus: row.availability_status,
      qualificationStatus: row.qualification_status,
      verifiedSkills: typeof row.verified_skills === 'string' ? JSON.parse(row.verified_skills) : row.verified_skills,
      specializedMachineIds: typeof row.specialized_machine_ids === 'string' ? JSON.parse(row.specialized_machine_ids) : row.specialized_machine_ids,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getEmployeeProfileByUserId(organizationId: string, userId: string): Promise<EmployeeProfile | null> {
    const res = await this.pool.query(
      `SELECT ep.*, u.full_name, u.email, om.role
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN organization_memberships om ON om.user_id = ep.user_id AND om.organization_id = ep.organization_id
       WHERE ep.organization_id = $1 AND ep.user_id = $2`,
      [organizationId, userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      employeeNumber: row.employee_number,
      fullName: row.full_name,
      email: row.email,
      role: row.role || 'TECHNICIAN',
      department: row.department,
      assignedPlantIds: typeof row.assigned_plant_ids === 'string' ? JSON.parse(row.assigned_plant_ids) : row.assigned_plant_ids,
      accountStatus: row.account_status,
      availabilityStatus: row.availability_status,
      qualificationStatus: row.qualification_status,
      verifiedSkills: typeof row.verified_skills === 'string' ? JSON.parse(row.verified_skills) : row.verified_skills,
      specializedMachineIds: typeof row.specialized_machine_ids === 'string' ? JSON.parse(row.specialized_machine_ids) : row.specialized_machine_ids,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async updateEmployeeProfile(
    organizationId: string,
    id: string,
    updates: Partial<EmployeeProfile>
  ): Promise<EmployeeProfile | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [organizationId, id];

    if (updates.department !== undefined) {
      values.push(updates.department);
      setClauses.push(`department = $${values.length}`);
    }
    if (updates.assignedPlantIds !== undefined) {
      values.push(JSON.stringify(updates.assignedPlantIds));
      setClauses.push(`assigned_plant_ids = $${values.length}`);
    }
    if (updates.accountStatus !== undefined) {
      values.push(updates.accountStatus);
      setClauses.push(`account_status = $${values.length}`);
    }
    if (updates.availabilityStatus !== undefined) {
      values.push(updates.availabilityStatus);
      setClauses.push(`availability_status = $${values.length}`);
    }
    if (updates.qualificationStatus !== undefined) {
      values.push(updates.qualificationStatus);
      setClauses.push(`qualification_status = $${values.length}`);
    }
    if (updates.verifiedSkills !== undefined) {
      values.push(JSON.stringify(updates.verifiedSkills));
      setClauses.push(`verified_skills = $${values.length}`);
    }
    if (updates.specializedMachineIds !== undefined) {
      values.push(JSON.stringify(updates.specializedMachineIds));
      setClauses.push(`specialized_machine_ids = $${values.length}`);
    }

    await this.pool.query(
      `UPDATE employee_profiles SET ${setClauses.join(', ')} WHERE organization_id = $1 AND id = $2`,
      values
    );

    return this.getEmployeeProfile(organizationId, id);
  }

  public async listEmployeeProfiles(
    organizationId: string,
    filters?: EmployeeProfileFilterOptions
  ): Promise<EmployeeProfile[]> {
    const conditions: string[] = ['ep.organization_id = $1'];
    const values: unknown[] = [organizationId];

    if (filters?.department) {
      values.push(filters.department);
      conditions.push(`ep.department = $${values.length}`);
    }
    if (filters?.accountStatus) {
      values.push(filters.accountStatus);
      conditions.push(`ep.account_status = $${values.length}`);
    }
    if (filters?.availabilityStatus) {
      values.push(filters.availabilityStatus);
      conditions.push(`ep.availability_status = $${values.length}`);
    }

    const res = await this.pool.query(
      `SELECT ep.*, u.full_name, u.email, om.role
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN organization_memberships om ON om.user_id = ep.user_id AND om.organization_id = ep.organization_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ep.created_at ASC`,
      values
    );

    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      employeeNumber: row.employee_number,
      fullName: row.full_name,
      email: row.email,
      role: row.role || 'TECHNICIAN',
      department: row.department,
      assignedPlantIds: typeof row.assigned_plant_ids === 'string' ? JSON.parse(row.assigned_plant_ids) : row.assigned_plant_ids,
      accountStatus: row.account_status,
      availabilityStatus: row.availability_status,
      qualificationStatus: row.qualification_status,
      verifiedSkills: typeof row.verified_skills === 'string' ? JSON.parse(row.verified_skills) : row.verified_skills,
      specializedMachineIds: typeof row.specialized_machine_ids === 'string' ? JSON.parse(row.specialized_machine_ids) : row.specialized_machine_ids,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  // --------------------------------------------------------------------------
  // Machine-to-Specialist Mappings
  // --------------------------------------------------------------------------
  public async setMachineSpecialistMapping(
    organizationId: string,
    dto: SetMachineSpecialistMappingDTO
  ): Promise<MachineSpecialistMapping> {
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

    const id = crypto.randomUUID();
    const res = await this.pool.query(
      `INSERT INTO machine_specialist_mappings (
         id, organization_id, machine_id, plant_id, primary_specialist_user_id,
         backup_specialist_user_ids, required_certifications, assignment_status,
         escalation_timeout_minutes, escalation_role, assigned_by_user_id, assigned_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (organization_id, machine_id)
       DO UPDATE SET
         plant_id = EXCLUDED.plant_id,
         primary_specialist_user_id = EXCLUDED.primary_specialist_user_id,
         backup_specialist_user_ids = EXCLUDED.backup_specialist_user_ids,
         required_certifications = EXCLUDED.required_certifications,
         assignment_status = EXCLUDED.assignment_status,
         escalation_timeout_minutes = EXCLUDED.escalation_timeout_minutes,
         escalation_role = EXCLUDED.escalation_role,
         assigned_by_user_id = EXCLUDED.assigned_by_user_id,
         assigned_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        organizationId,
        toSafeUuidParam(sanitizeMachineOrAssetId(dto.machineId)) || sanitizeMachineOrAssetId(dto.machineId),
        dto.plantId,
        dto.primarySpecialistUserId ? (toSafeUuidParam(sanitizeMachineOrAssetId(dto.primarySpecialistUserId)) || dto.primarySpecialistUserId) : null,
        JSON.stringify(dto.backupSpecialistUserIds || []),
        JSON.stringify(dto.requiredCertifications || []),
        computedStatus,
        dto.escalationTimeoutMinutes || 60,
        dto.escalationRole || 'PLANT_MANAGER',
        dto.assignedByUserId || null,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      machineId: row.machine_id,
      plantId: row.plant_id,
      primarySpecialistUserId: row.primary_specialist_user_id,
      primarySpecialistName: dto.primarySpecialistName ?? null,
      backupSpecialistUserIds: typeof row.backup_specialist_user_ids === 'string' ? JSON.parse(row.backup_specialist_user_ids) : row.backup_specialist_user_ids,
      requiredCertifications: typeof row.required_certifications === 'string' ? JSON.parse(row.required_certifications) : row.required_certifications,
      assignmentStatus: row.assignment_status,
      escalationTimeoutMinutes: row.escalation_timeout_minutes,
      escalationRole: row.escalation_role,
      assignedByUserId: row.assigned_by_user_id,
      assignedAt: row.assigned_at?.toISOString() || null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async getMachineSpecialistMapping(
    organizationId: string,
    machineId: string
  ): Promise<MachineSpecialistMapping | null> {
    const cleanMachineId = sanitizeMachineOrAssetId(machineId);
    const safeUuid = toSafeUuidParam(cleanMachineId);
    const query = safeUuid
      ? `SELECT msm.*, u.full_name as primary_name
       FROM machine_specialist_mappings msm
       LEFT JOIN users u ON u.id = msm.primary_specialist_user_id
       WHERE msm.organization_id = $1 AND msm.machine_id = $2`
      : `SELECT msm.*, u.full_name as primary_name
       FROM machine_specialist_mappings msm
       LEFT JOIN users u ON u.id = msm.primary_specialist_user_id
       WHERE msm.organization_id = $1 AND msm.machine_id::text = $2`;
    const res = await this.pool.query(query, [organizationId, safeUuid || cleanMachineId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      machineId: row.machine_id,
      plantId: row.plant_id,
      primarySpecialistUserId: row.primary_specialist_user_id,
      primarySpecialistName: row.primary_name || null,
      backupSpecialistUserIds: typeof row.backup_specialist_user_ids === 'string' ? JSON.parse(row.backup_specialist_user_ids) : row.backup_specialist_user_ids,
      requiredCertifications: typeof row.required_certifications === 'string' ? JSON.parse(row.required_certifications) : row.required_certifications,
      assignmentStatus: row.assignment_status,
      escalationTimeoutMinutes: row.escalation_timeout_minutes,
      escalationRole: row.escalation_role,
      assignedByUserId: row.assigned_by_user_id,
      assignedAt: row.assigned_at?.toISOString() || null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  public async listMachineSpecialistMappings(organizationId: string): Promise<MachineSpecialistMapping[]> {
    const res = await this.pool.query(
      `SELECT msm.*, u.full_name as primary_name
       FROM machine_specialist_mappings msm
       LEFT JOIN users u ON u.id = msm.primary_specialist_user_id
       WHERE msm.organization_id = $1`,
      [organizationId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      machineId: row.machine_id,
      plantId: row.plant_id,
      primarySpecialistUserId: row.primary_specialist_user_id,
      primarySpecialistName: row.primary_name || null,
      backupSpecialistUserIds: typeof row.backup_specialist_user_ids === 'string' ? JSON.parse(row.backup_specialist_user_ids) : row.backup_specialist_user_ids,
      requiredCertifications: typeof row.required_certifications === 'string' ? JSON.parse(row.required_certifications) : row.required_certifications,
      assignmentStatus: row.assignment_status,
      escalationTimeoutMinutes: row.escalation_timeout_minutes,
      escalationRole: row.escalation_role,
      assignedByUserId: row.assigned_by_user_id,
      assignedAt: row.assigned_at?.toISOString() || null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  // --------------------------------------------------------------------------
  // Specialist Tickets & Automatic Routing
  // --------------------------------------------------------------------------
  public async createSpecialistTicket(
    organizationId: string,
    dto: CreateSpecialistTicketDTO
  ): Promise<SpecialistTicket> {
    const ticketNumber =
      dto.ticketNumber || `TICK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const initialHistory: TicketHistoryItem = {
      id: 'hist_' + Math.random().toString(36).substring(2, 10),
      ticketId: '',
      actorUserId: dto.reportedByUserId,
      action: 'TICKET_CREATED',
      previousStatus: null,
      newStatus: dto.status || 'OPEN',
      notes: `Escalation reason: ${dto.escalationReason}`,
      timestamp: new Date().toISOString(),
    };

    const richPayload = {
      createdAtFormatted: dto.createdAtFormatted,
      plantName: dto.plantName,
      reportedByName: dto.reportedByName || dto.reportedByUserName,
      reportedByRole: dto.reportedByRole,
      assetTag: dto.assetTag || dto.machineAssetTag,
      assetName: dto.assetName,
      machineStatus: dto.machineStatus,
      faultCode: dto.faultCode,
      symptomDescription: dto.symptomDescription,
      topRootCause: dto.topRootCause,
      probability: dto.probability,
      recommendedFix: dto.recommendedFix,
      investigationProgress: dto.investigationProgress,
      specialistDiscipline: dto.specialistDiscipline,
      priority: dto.priority || dto.severity,
      lotoApplied: dto.lotoApplied,
      technicianNotes: dto.technicianNotes,
    };

    const evidenceObj = {
      ...(dto.evidenceCheckResult || { hasApprovedEvidence: false, confidenceScore: 0.0, reason: 'Escalation' }),
      _richPayload: richPayload,
    };

    const safeMachineUuid = dto.machineId && isUuid(dto.machineId) ? dto.machineId : toSafeUuidParam(dto.machineId);

    const id = crypto.randomUUID();
    try {
      const res = await this.pool.query(
        `INSERT INTO specialist_tickets (
           id, ticket_number, organization_id, plant_id, machine_id, machine_asset_tag,
           reported_by_user_id, original_question, diagnostic_details, escalation_reason,
           evidence_check_result, severity, assigned_specialist_user_id, assignment_status,
           status, history
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          id,
          ticketNumber,
          organizationId,
          dto.plantId,
          safeMachineUuid || null,
          dto.machineAssetTag || null,
          dto.reportedByUserId,
          dto.originalQuestion,
          dto.diagnosticDetails || null,
          dto.escalationReason,
          JSON.stringify(evidenceObj),
          dto.severity || 'MEDIUM',
          dto.assignedSpecialistUserId || null,
          dto.assignmentStatus || 'NEEDS_SPECIALIST_ASSIGNMENT',
          dto.status || 'OPEN',
          JSON.stringify([initialHistory]),
        ]
      );

      const row = res.rows[0];
      const ticket: SpecialistTicket = {
        id: row.id,
        ticketNumber: row.ticket_number,
        organizationId: row.organization_id,
        plantId: row.plant_id,
        machineId: row.machine_id,
        machineAssetTag: row.machine_asset_tag,
        reportedByUserId: row.reported_by_user_id,
        reportedByUserName: dto.reportedByUserName || null,
        reportedByRole: dto.reportedByRole,
        createdAtFormatted: dto.createdAtFormatted,
        plantName: dto.plantName,
        assetTag: dto.assetTag || row.machine_asset_tag || undefined,
        assetName: dto.assetName,
        machineStatus: dto.machineStatus,
        faultCode: dto.faultCode,
        symptomDescription: dto.symptomDescription,
        topRootCause: dto.topRootCause,
        probability: dto.probability,
        recommendedFix: dto.recommendedFix,
        investigationProgress: dto.investigationProgress,
        specialistDiscipline: dto.specialistDiscipline || dto.assignedSpecialistName || undefined,
        priority: dto.priority || row.severity,
        lotoApplied: dto.lotoApplied,
        technicianNotes: dto.technicianNotes,
        originalQuestion: row.original_question,
        diagnosticDetails: row.diagnostic_details,
        escalationReason: row.escalation_reason,
        evidenceCheckResult: evidenceObj,
        severity: row.severity,
        assignedSpecialistUserId: row.assigned_specialist_user_id,
        assignedSpecialistName: dto.assignedSpecialistName || null,
        assignmentStatus: row.assignment_status,
        status: row.status,
        technicianObservations: row.technician_observations,
        diagnosisOutcome: row.diagnosis_outcome,
        repairOutcome: row.repair_outcome,
        proposedKnowledgeUpdate: row.proposed_knowledge_update,
        knowledgeUpdateStatus: row.knowledge_update_status,
        resolvedAt: row.resolved_at?.toISOString() || null,
        resolvedByUserId: row.resolved_by_user_id,
        history: typeof row.history === 'string' ? JSON.parse(row.history) : row.history,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
      this.fallbackSpecialistTickets.set(id, ticket);
      return ticket;
    } catch {
      const fallbackTicket: SpecialistTicket = {
        id,
        ticketNumber,
        organizationId,
        plantId: dto.plantId,
        machineId: dto.machineId || null,
        machineAssetTag: dto.machineAssetTag || null,
        reportedByUserId: dto.reportedByUserId,
        reportedByUserName: dto.reportedByUserName || null,
        reportedByRole: dto.reportedByRole,
        createdAtFormatted: dto.createdAtFormatted,
        plantName: dto.plantName,
        assetTag: dto.assetTag || dto.machineAssetTag || undefined,
        assetName: dto.assetName,
        machineStatus: dto.machineStatus,
        faultCode: dto.faultCode,
        symptomDescription: dto.symptomDescription,
        topRootCause: dto.topRootCause,
        probability: dto.probability,
        recommendedFix: dto.recommendedFix,
        investigationProgress: dto.investigationProgress,
        specialistDiscipline: dto.specialistDiscipline || dto.assignedSpecialistName || undefined,
        priority: dto.priority || dto.severity,
        lotoApplied: dto.lotoApplied,
        technicianNotes: dto.technicianNotes,
        originalQuestion: dto.originalQuestion,
        diagnosticDetails: dto.diagnosticDetails || null,
        escalationReason: dto.escalationReason,
        evidenceCheckResult: evidenceObj,
        severity: dto.severity || 'MEDIUM',
        assignedSpecialistUserId: dto.assignedSpecialistUserId || null,
        assignedSpecialistName: dto.assignedSpecialistName || null,
        assignmentStatus: dto.assignmentStatus || 'ASSIGNED_PRIMARY',
        status: dto.status || 'OPEN',
        technicianObservations: null,
        diagnosisOutcome: null,
        repairOutcome: null,
        proposedKnowledgeUpdate: null,
        knowledgeUpdateStatus: 'NONE',
        resolvedAt: null,
        resolvedByUserId: null,
        history: [initialHistory],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.fallbackSpecialistTickets.set(id, fallbackTicket);
      return fallbackTicket;
    }
  }

  public async getSpecialistTicketById(organizationId: string, id: string): Promise<SpecialistTicket | null> {
    const fallback = this.fallbackSpecialistTickets.get(id);
    if (fallback && fallback.organizationId === organizationId) return fallback;
    try {
      const res = await this.pool.query(
        `SELECT st.*, u.full_name as reporter_name, s.full_name as specialist_name
         FROM specialist_tickets st
         LEFT JOIN users u ON u.id = st.reported_by_user_id
         LEFT JOIN users s ON s.id = st.assigned_specialist_user_id
         WHERE st.organization_id = $1 AND st.id = $2`,
        [organizationId, id]
      );
      if (res.rows.length === 0) return this.fallbackSpecialistTickets.get(id) || null;
      const row = res.rows[0];
      const ev = typeof row.evidence_check_result === 'string' ? JSON.parse(row.evidence_check_result) : row.evidence_check_result;
      const rich = ev?._richPayload || {};
      return {
        id: row.id,
        ticketNumber: row.ticket_number,
        organizationId: row.organization_id,
        plantId: row.plant_id,
        machineId: row.machine_id,
        machineAssetTag: row.machine_asset_tag,
        reportedByUserId: row.reported_by_user_id,
        reportedByUserName: rich.reportedByName || row.reporter_name || null,
        reportedByRole: rich.reportedByRole,
        createdAtFormatted: rich.createdAtFormatted,
        plantName: rich.plantName,
        assetTag: rich.assetTag || row.machine_asset_tag || undefined,
        assetName: rich.assetName,
        machineStatus: rich.machineStatus,
        faultCode: rich.faultCode,
        symptomDescription: rich.symptomDescription,
        topRootCause: rich.topRootCause,
        probability: rich.probability,
        recommendedFix: rich.recommendedFix,
        investigationProgress: rich.investigationProgress,
        specialistDiscipline: rich.specialistDiscipline || row.specialist_name || undefined,
        priority: rich.priority || row.severity,
        lotoApplied: rich.lotoApplied,
        technicianNotes: rich.technicianNotes,
        originalQuestion: row.original_question,
        diagnosticDetails: row.diagnostic_details,
        escalationReason: row.escalation_reason,
        evidenceCheckResult: ev,
        severity: row.severity,
        assignedSpecialistUserId: row.assigned_specialist_user_id,
        assignedSpecialistName: rich.specialistDiscipline || row.specialist_name || null,
        assignmentStatus: row.assignment_status,
        status: row.status,
        technicianObservations: row.technician_observations,
        diagnosisOutcome: row.diagnosis_outcome,
        repairOutcome: row.repair_outcome,
        proposedKnowledgeUpdate: row.proposed_knowledge_update,
        knowledgeUpdateStatus: row.knowledge_update_status,
        resolvedAt: row.resolved_at?.toISOString() || null,
        resolvedByUserId: row.resolved_by_user_id,
        history: typeof row.history === 'string' ? JSON.parse(row.history) : row.history,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } catch {
      return this.fallbackSpecialistTickets.get(id) || null;
    }
  }

  public async updateSpecialistTicket(
    organizationId: string,
    id: string,
    updates: Partial<SpecialistTicket> & { actorUserId?: string; note?: string }
  ): Promise<SpecialistTicket | null> {
    const existing = await this.getSpecialistTicketById(organizationId, id);
    if (!existing) return null;

    const history = [...existing.history];
    const actorUserId = updates.actorUserId || existing.reportedByUserId;
    const now = new Date().toISOString();

    if (updates.status && updates.status !== existing.status) {
      history.push({
        id: 'hist_' + Math.random().toString(36).substring(2, 10),
        ticketId: id,
        actorUserId,
        action: 'STATUS_CHANGED',
        previousStatus: existing.status,
        newStatus: updates.status,
        notes: updates.note || `Status changed from ${existing.status} to ${updates.status}`,
        timestamp: now,
      });
    }

    const setClauses: string[] = ['updated_at = NOW()', 'history = $3'];
    const values: unknown[] = [organizationId, id, JSON.stringify(history)];

    if (updates.status) {
      values.push(updates.status);
      setClauses.push(`status = $${values.length}`);
      if (updates.status === 'RESOLVED' || updates.status === 'CLOSED') {
        values.push(actorUserId);
        setClauses.push(`resolved_at = NOW(), resolved_by_user_id = $${values.length}`);
      }
    }
    if (updates.assignedSpecialistUserId !== undefined) {
      values.push(updates.assignedSpecialistUserId);
      setClauses.push(`assigned_specialist_user_id = $${values.length}`);
    }
    if (updates.assignmentStatus !== undefined) {
      values.push(updates.assignmentStatus);
      setClauses.push(`assignment_status = $${values.length}`);
    }
    if (updates.technicianObservations !== undefined) {
      values.push(updates.technicianObservations);
      setClauses.push(`technician_observations = $${values.length}`);
    }
    if (updates.diagnosisOutcome !== undefined) {
      values.push(updates.diagnosisOutcome);
      setClauses.push(`diagnosis_outcome = $${values.length}`);
    }
    if (updates.repairOutcome !== undefined) {
      values.push(updates.repairOutcome);
      setClauses.push(`repair_outcome = $${values.length}`);
    }
    if (updates.proposedKnowledgeUpdate !== undefined) {
      values.push(updates.proposedKnowledgeUpdate);
      setClauses.push(`proposed_knowledge_update = $${values.length}`);
    }
    if (updates.knowledgeUpdateStatus !== undefined) {
      values.push(updates.knowledgeUpdateStatus);
      setClauses.push(`knowledge_update_status = $${values.length}`);
    }

    await this.pool.query(
      `UPDATE specialist_tickets SET ${setClauses.join(', ')} WHERE organization_id = $1 AND id = $2`,
      values
    );

    return this.getSpecialistTicketById(organizationId, id);
  }

  public async listSpecialistTickets(
    organizationId: string,
    filters?: SpecialistTicketFilterOptions
  ): Promise<SpecialistTicket[]> {
    const conditions: string[] = ['st.organization_id = $1'];
    const values: unknown[] = [organizationId];

    if (filters?.assignedSpecialistUserId) {
      values.push(filters.assignedSpecialistUserId);
      conditions.push(`st.assigned_specialist_user_id = $${values.length}`);
    }
    if (filters?.reportedByUserId) {
      values.push(filters.reportedByUserId);
      conditions.push(`st.reported_by_user_id = $${values.length}`);
    }
    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        values.push(safeUuid);
        conditions.push(`st.machine_id = $${values.length}`);
      } else {
        values.push(cleanMachineId);
        conditions.push(`(st.machine_asset_tag = $${values.length} OR st.machine_id::text = $${values.length})`);
      }
    }
    if (filters?.status) {
      values.push(filters.status);
      conditions.push(`st.status = $${values.length}`);
    }
    if (filters?.assignmentStatus) {
      values.push(filters.assignmentStatus);
      conditions.push(`st.assignment_status = $${values.length}`);
    }
    if (filters?.severity) {
      values.push(filters.severity);
      conditions.push(`st.severity = $${values.length}`);
    }

    const res = await this.pool.query(
      `SELECT st.*, u.full_name as reporter_name, s.full_name as specialist_name
       FROM specialist_tickets st
       LEFT JOIN users u ON u.id = st.reported_by_user_id
       LEFT JOIN users s ON s.id = st.assigned_specialist_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY st.created_at DESC`,
      values
    );

    return res.rows.map((row) => {
      const ev = typeof row.evidence_check_result === 'string' ? JSON.parse(row.evidence_check_result) : row.evidence_check_result;
      const rich = ev?._richPayload || {};
      return {
        id: row.id,
        ticketNumber: row.ticket_number,
        organizationId: row.organization_id,
        plantId: row.plant_id,
        machineId: row.machine_id,
        machineAssetTag: row.machine_asset_tag,
        reportedByUserId: row.reported_by_user_id,
        reportedByUserName: rich.reportedByName || row.reporter_name || null,
        reportedByRole: rich.reportedByRole,
        createdAtFormatted: rich.createdAtFormatted,
        plantName: rich.plantName,
        assetTag: rich.assetTag || row.machine_asset_tag || undefined,
        assetName: rich.assetName,
        machineStatus: rich.machineStatus,
        faultCode: rich.faultCode,
        symptomDescription: rich.symptomDescription,
        topRootCause: rich.topRootCause,
        probability: rich.probability,
        recommendedFix: rich.recommendedFix,
        investigationProgress: rich.investigationProgress,
        specialistDiscipline: rich.specialistDiscipline || row.specialist_name || undefined,
        priority: rich.priority || row.severity,
        lotoApplied: rich.lotoApplied,
        technicianNotes: rich.technicianNotes,
        originalQuestion: row.original_question,
        diagnosticDetails: row.diagnostic_details,
        escalationReason: row.escalation_reason,
        evidenceCheckResult: ev,
        severity: row.severity,
        assignedSpecialistUserId: row.assigned_specialist_user_id,
        assignedSpecialistName: rich.specialistDiscipline || row.specialist_name || null,
        assignmentStatus: row.assignment_status,
        status: row.status,
        technicianObservations: row.technician_observations,
        diagnosisOutcome: row.diagnosis_outcome,
        repairOutcome: row.repair_outcome,
        proposedKnowledgeUpdate: row.proposed_knowledge_update,
        knowledgeUpdateStatus: row.knowledge_update_status,
        resolvedAt: row.resolved_at?.toISOString() || null,
        resolvedByUserId: row.resolved_by_user_id,
        history: typeof row.history === 'string' ? JSON.parse(row.history) : row.history,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  public async getTicketOversightSummary(organizationId: string): Promise<TicketOversightSummary> {
    const tickets = await this.listSpecialistTickets(organizationId);
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

    for (const t of tickets) {
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

    const activeTickets = await this.listSpecialistTickets(organizationId, { machineId });
    for (const t of activeTickets) {
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

    const allTickets = await this.listSpecialistTickets(organizationId);
    const tickets = allTickets.filter((t) => {
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
    const OVERDUE_THRESHOLD_MS = 24 * 3600 * 1000;

    for (const t of tickets) {
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

      if ((t.reopenCount && t.reopenCount > 0) || t.status === 'REOPENED') {
        reopenedTicketsCount++;
        reopenedTickets.push(t);
      }

      if (ticketsBySeverity[t.severity] !== undefined) {
        ticketsBySeverity[t.severity]++;
      }

      const catKey = t.faultCategory || 'UNSPECIFIED_MALFUNCTION';
      ticketsByType[catKey] = (ticketsByType[catKey] || 0) + 1;

      // STRICT RULE: Only completed tickets with resolvedAt are included.
      if ((t.status === 'RESOLVED' || t.status === 'CLOSED') && t.resolvedAt) {
        const resolvedMs = new Date(t.resolvedAt).getTime();
        const createdMs = new Date(t.createdAt).getTime();
        const diffMinutes = Math.max(0, Math.round((resolvedMs - createdMs) / 60000));
        durationsMinutes.push(diffMinutes);
      }

      const isCompleted = t.status === 'RESOLVED' || t.status === 'CLOSED';
      const isOverdue = !isCompleted && now - new Date(t.createdAt).getTime() > OVERDUE_THRESHOLD_MS;
      if (isOverdue) overdueCasesCount++;

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

      if (t.machineId) {
        const mId = t.machineId;
        if (!machineTicketStats.has(mId)) {
          machineTicketStats.set(mId, {
            machineId: mId,
            assetTag: t.machineAssetTag || 'UNKNOWN',
            name: t.machineAssetTag || 'Unknown Machine',
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

    const totalTicketsCount = tickets.length;
    const mostFrequentlyReportedIssues: IssueFrequencyMetric[] = Object.entries(ticketsByType)
      .map(([faultCategory, count]) => ({
        faultCategory,
        count,
        percentage: totalTicketsCount > 0 ? Number(((count / totalTicketsCount) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const allRecords = await this.listMaintenanceRecords(organizationId);
    let repeatedFaultsCount = 0;
    for (const r of allRecords) {
      if (plantFilter && r.plantId !== plantFilter) continue;
      if (cutoff && new Date(r.resolvedAt).getTime() < cutoff) continue;
      if (r.isRecurringIncident) {
        repeatedFaultsCount++;
        const ms = machineTicketStats.get(r.machineId);
        if (ms) ms.recurring++;
      }
    }

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
      unansweredCopilotQuestionsCount: 0,
      unansweredQuestionsSample: [],
      knowledgeGapsByMachine: [],
      specialistWorkloads,
      overdueCasesCount,
    };
  }

  // --------------------------------------------------------------------------
  // Persistent Machine Maintenance History & Resolution Records (Postgres)
  // --------------------------------------------------------------------------
  private mapRowToMaintenanceRecord(row: any): MaintenanceRecord {
    return {
      id: row.id,
      recordNumber: row.record_number,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      machineId: row.machine_id,
      machineAssetTag: row.machine_asset_tag,
      ticketId: row.ticket_id || null,
      ticketNumber: row.ticket_number || null,
      caseId: row.case_id || null,
      caseNumber: row.case_number || null,
      componentId: row.component_id || null,
      componentName: row.component_name || null,
      reportingUserId: row.reporting_user_id,
      reportingUserName: row.reporting_user_name || null,
      assignedTechnicianUserId: row.assigned_technician_user_id || null,
      assignedTechnicianName: row.assigned_technician_name || null,
      resolvingTechnicianUserId: row.resolving_technician_user_id,
      resolvingTechnicianName: row.resolving_technician_name,
      faultCategory: row.fault_category,
      problemStatement: row.problem_statement,
      observedSymptoms:
        typeof row.observed_symptoms === 'string'
          ? JSON.parse(row.observed_symptoms)
          : row.observed_symptoms || [],
      measurements:
        typeof row.measurements === 'string'
          ? JSON.parse(row.measurements)
          : row.measurements || [],
      rootCause: row.root_cause,
      rootCauseStatus: row.root_cause_status,
      repairActions:
        typeof row.repair_actions === 'string'
          ? JSON.parse(row.repair_actions)
          : row.repair_actions || [],
      partsReplaced:
        typeof row.parts_replaced === 'string'
          ? JSON.parse(row.parts_replaced)
          : row.parts_replaced || [],
      postRepairTestResults:
        typeof row.post_repair_test_results === 'string'
          ? JSON.parse(row.post_repair_test_results)
          : row.post_repair_test_results || [],
      verificationState: row.verification_state,
      verificationNotes: row.verification_notes || null,
      verifiedByUserId: row.verified_by_user_id || null,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      requiresRestartApproval: row.requires_restart_approval,
      restartApproved: row.restart_approved,
      restartApprovedByUserId: row.restart_approved_by_user_id || null,
      restartApprovedAt: row.restart_approved_at
        ? new Date(row.restart_approved_at).toISOString()
        : null,
      restartNotes: row.restart_notes || null,
      approvalStatus: row.approval_status,
      approvedByUserId: row.approved_by_user_id || null,
      approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      approvalNotes: row.approval_notes || null,
      resolvedAt: row.resolved_at
        ? new Date(row.resolved_at).toISOString()
        : new Date().toISOString(),
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      relatedIncidentRecordIds:
        typeof row.related_incident_record_ids === 'string'
          ? JSON.parse(row.related_incident_record_ids)
          : row.related_incident_record_ids || [],
      attachments:
        typeof row.attachments === 'string'
          ? JSON.parse(row.attachments)
          : row.attachments || [],
      recordVersion: row.record_version,
      auditTrail:
        typeof row.audit_trail === 'string'
          ? JSON.parse(row.audit_trail)
          : row.audit_trail || [],
      isRecurringIncident: row.is_recurring_incident,
      recurrenceCount: row.recurrence_count,
      knowledgeApproved: row.knowledge_approved,
      knowledgeApprovedAt: row.knowledge_approved_at
        ? new Date(row.knowledge_approved_at).toISOString()
        : null,
      knowledgeApprovedByUserId: row.knowledge_approved_by_user_id || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

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

    const id = 'mr_' + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const resolvedAt = data.resolvedAt || now;
    const recordNumber =
      data.recordNumber ||
      `MR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const cleanMachineId = sanitizeMachineOrAssetId(data.machineId);
    const safeMachineUuid = toSafeUuidParam(cleanMachineId);

    const fallbackRecord: MaintenanceRecord = {
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
      rootCauseStatus: data.rootCauseStatus || 'CONFIRMED',
      repairActions: data.repairActions ?? [],
      partsReplaced: data.partsReplaced ?? [],
      postRepairTestResults: data.postRepairTestResults ?? [],
      verificationState: data.verificationState || 'PASSED',
      verificationNotes: data.verificationNotes ?? null,
      verifiedByUserId: data.verifiedByUserId ?? null,
      verifiedAt: data.verifiedAt ?? null,
      requiresRestartApproval: data.requiresRestartApproval ?? false,
      restartApproved: data.restartApproved ?? false,
      restartApprovedByUserId: data.restartApprovedByUserId ?? null,
      restartApprovedAt: data.restartApprovedAt ?? null,
      restartNotes: data.restartNotes ?? null,
      approvalStatus: data.approvalStatus || 'APPROVED',
      approvedByUserId: data.approvedByUserId ?? null,
      approvedAt: data.approvedAt ?? null,
      approvalNotes: data.approvalNotes ?? null,
      resolvedAt,
      closedAt: null,
      relatedIncidentRecordIds: data.relatedIncidentRecordIds ?? [],
      attachments: data.attachments ?? [],
      recordVersion: 1,
      auditTrail: [
        {
          id: 'audit_' + Math.random().toString(36).substring(2, 10),
          versionNumber: 1,
          action: 'RECORD_CREATED',
          actorUserId: data.resolvingTechnicianUserId,
          actorName: data.resolvingTechnicianName,
          changes: {
            status: { from: null, to: 'CREATED' },
            rootCauseStatus: { from: null, to: data.rootCauseStatus || 'CONFIRMED' },
          },
          notes: 'Initial maintenance record generated from technician resolution',
          timestamp: now,
        },
      ],
      isRecurringIncident: false,
      recurrenceCount: 1,
      knowledgeApproved: data.knowledgeApproved ?? false,
      knowledgeApprovedAt: null,
      knowledgeApprovedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Verify machine tenant ownership
      const machineCheck = await this.pool.query(
        `SELECT organization_id FROM assets WHERE id = $1`,
        [data.machineId]
      );
      if (machineCheck.rows.length > 0 && machineCheck.rows[0].organization_id !== organizationId) {
        throw new Error(`Cross-tenant security violation: Machine ${data.machineId} belongs to another organization.`);
      }

      // Verify plant tenant ownership
      if (data.plantId) {
        const plantCheck = await this.pool.query(
          `SELECT organization_id FROM plants WHERE id = $1`,
          [data.plantId]
        );
        if (plantCheck.rows.length > 0 && plantCheck.rows[0].organization_id !== organizationId) {
          throw new Error(`Cross-tenant security violation: Plant ${data.plantId} belongs to another organization.`);
        }
      }

      // Duplicate prevention: If record already exists for ticketId in this organization, return existing
      if (data.ticketId) {
        const existingRes = await this.pool.query(
          `SELECT * FROM maintenance_records WHERE organization_id = $1 AND ticket_id = $2 LIMIT 1`,
          [organizationId, data.ticketId]
        );
        if (existingRes.rows.length > 0) {
          return this.mapRowToMaintenanceRecord(existingRes.rows[0]);
        }
      }

      // Duplicate prevention: If record already exists for caseId in this organization, return existing
      if (data.caseId) {
        const existingRes = await this.pool.query(
          `SELECT * FROM maintenance_records WHERE organization_id = $1 AND case_id = $2 LIMIT 1`,
          [organizationId, data.caseId]
        );
        if (existingRes.rows.length > 0) {
          return this.mapRowToMaintenanceRecord(existingRes.rows[0]);
        }
      }

      // Query prior records for recurrence count
      let priorIds: string[] = [];
      try {
        const countRes = safeMachineUuid
          ? await this.pool.query(
              `SELECT id FROM maintenance_records WHERE organization_id = $1 AND machine_id = $2 AND fault_category = $3`,
              [organizationId, safeMachineUuid, data.faultCategory]
            )
          : await this.pool.query(
              `SELECT id FROM maintenance_records WHERE organization_id = $1 AND (machine_asset_tag = $2 OR machine_id::text = $2) AND fault_category = $3`,
              [organizationId, cleanMachineId, data.faultCategory]
            );
        priorIds = countRes.rows.map((r: any) => r.id);
      } catch {
        priorIds = [];
      }
      const isRecurringIncident = priorIds.length > 0;
      const recurrenceCount = priorIds.length + 1;

      const initialAudit: MaintenanceAuditEntry = {
        id: 'audit_' + Math.random().toString(36).substring(2, 10),
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
          : priorIds;

      const requiresRestartApproval = data.requiresRestartApproval ?? false;
      const approvalStatus =
        data.approvalStatus ||
        (requiresRestartApproval ? 'PENDING_APPROVAL' : 'NOT_REQUIRED');

      const res = await this.pool.query(
        `INSERT INTO maintenance_records (
          id, record_number, organization_id, plant_id, machine_id, machine_asset_tag,
          ticket_id, ticket_number, case_id, case_number, component_id, component_name, reporting_user_id,
          reporting_user_name, assigned_technician_user_id, assigned_technician_name,
          resolving_technician_user_id, resolving_technician_name, fault_category,
          problem_statement, observed_symptoms, measurements, root_cause, root_cause_status,
          repair_actions, parts_replaced, post_repair_test_results, verification_state,
          verification_notes, verified_by_user_id, verified_at, requires_restart_approval,
          restart_approved, restart_approved_by_user_id, restart_approved_at, restart_notes,
          approval_status, approved_by_user_id, approved_at, approval_notes, resolved_at,
          closed_at, related_incident_record_ids, attachments, record_version, audit_trail,
          is_recurring_incident, recurrence_count, knowledge_approved, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
          $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51
        ) RETURNING *`,
        [
          id,
          recordNumber,
          organizationId,
          data.plantId,
          safeMachineUuid || cleanMachineId,
          data.machineAssetTag || (cleanMachineId && !safeMachineUuid ? cleanMachineId : 'UNKNOWN'),
          data.ticketId ?? null,
          data.ticketNumber ?? null,
          data.caseId ?? null,
          data.caseNumber ?? null,
          data.componentId ?? null,
          data.componentName ?? null,
          data.reportingUserId,
          data.reportingUserName ?? null,
          data.assignedTechnicianUserId ?? null,
          data.assignedTechnicianName ?? null,
          data.resolvingTechnicianUserId,
          data.resolvingTechnicianName,
          data.faultCategory,
          data.problemStatement,
          JSON.stringify(data.observedSymptoms || []),
          JSON.stringify(data.measurements || []),
          data.rootCause,
          data.rootCauseStatus || 'UNKNOWN',
          JSON.stringify(data.repairActions || []),
          JSON.stringify(data.partsReplaced || []),
          JSON.stringify(data.postRepairTestResults || []),
          data.verificationState || 'PENDING',
          data.verificationNotes ?? null,
          data.verifiedByUserId ?? null,
          data.verifiedAt ?? null,
          requiresRestartApproval,
          data.restartApproved ?? false,
          data.restartApprovedByUserId ?? null,
          data.restartApprovedAt ?? null,
          data.restartNotes ?? null,
          approvalStatus,
          data.approvedByUserId ?? null,
          data.approvedAt ?? null,
          data.approvalNotes ?? null,
          resolvedAt,
          null,
          JSON.stringify(relatedIncidentRecordIds),
          JSON.stringify(data.attachments || []),
          1,
          JSON.stringify([initialAudit]),
          isRecurringIncident,
          recurrenceCount,
          data.knowledgeApproved ?? false,
          now,
          now,
        ]
      );

      const saved = this.mapRowToMaintenanceRecord(res.rows[0]);
      this.fallbackMaintenanceRecords.set(id, saved);
      return saved;
    } catch {
      this.fallbackMaintenanceRecords.set(id, fallbackRecord);
      return fallbackRecord;
    }
  }

  public async getMaintenanceRecordById(
    organizationId: string,
    id: string
  ): Promise<MaintenanceRecord | null> {
    const fallback = this.fallbackMaintenanceRecords.get(id);
    if (fallback && fallback.organizationId === organizationId) return fallback;
    try {
      const res = await this.pool.query(
        `SELECT * FROM maintenance_records WHERE organization_id = $1 AND id = $2`,
        [organizationId, id]
      );
      if (res.rows.length === 0) return this.fallbackMaintenanceRecords.get(id) || null;
      return this.mapRowToMaintenanceRecord(res.rows[0]);
    } catch {
      return this.fallbackMaintenanceRecords.get(id) || null;
    }
  }

  public async getMaintenanceRecordByNumber(
    organizationId: string,
    recordNumber: string
  ): Promise<MaintenanceRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM maintenance_records WHERE organization_id = $1 AND record_number = $2`,
      [organizationId, recordNumber]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToMaintenanceRecord(res.rows[0]);
  }

  public async listMaintenanceRecords(
    organizationId: string,
    filters?: MaintenanceRecordFilterOptions
  ): Promise<MaintenanceRecord[]> {
    const whereClauses: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];

    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        values.push(safeUuid);
        whereClauses.push(`machine_id = $${values.length}`);
      } else {
        values.push(cleanMachineId);
        whereClauses.push(`(machine_asset_tag = $${values.length} OR machine_id::text = $${values.length})`);
      }
    }
    if (filters?.plantId) {
      values.push(filters.plantId);
      whereClauses.push(`plant_id = $${values.length}`);
    }
    if (filters?.ticketId) {
      values.push(filters.ticketId);
      whereClauses.push(`ticket_id = $${values.length}`);
    }
    if (filters?.caseId) {
      values.push(filters.caseId);
      whereClauses.push(`case_id = $${values.length}`);
    }
    if (filters?.faultCategory) {
      values.push(filters.faultCategory);
      whereClauses.push(`fault_category = $${values.length}`);
    }
    if (filters?.rootCauseStatus) {
      values.push(filters.rootCauseStatus);
      whereClauses.push(`root_cause_status = $${values.length}`);
    }
    if (filters?.verificationState) {
      values.push(filters.verificationState);
      whereClauses.push(`verification_state = $${values.length}`);
    }
    if (filters?.approvalStatus) {
      values.push(filters.approvalStatus);
      whereClauses.push(`approval_status = $${values.length}`);
    }
    if (filters?.requiresRestartApproval !== undefined) {
      values.push(filters.requiresRestartApproval);
      whereClauses.push(`requires_restart_approval = $${values.length}`);
    }
    if (filters?.technicianUserId) {
      values.push(filters.technicianUserId);
      whereClauses.push(`resolving_technician_user_id = $${values.length}`);
    }
    if (filters?.isRecurring !== undefined) {
      values.push(filters.isRecurring);
      whereClauses.push(`is_recurring_incident = $${values.length}`);
    }
    if (filters?.dateFrom) {
      values.push(filters.dateFrom);
      whereClauses.push(`resolved_at >= $${values.length}`);
    }
    if (filters?.dateTo) {
      values.push(filters.dateTo);
      whereClauses.push(`resolved_at <= $${values.length}`);
    }

    const sortDirection = filters?.sortOrder === 'asc' ? 'ASC' : 'DESC';
    let query = `SELECT * FROM maintenance_records WHERE ${whereClauses.join(' AND ')} ORDER BY resolved_at ${sortDirection}, id ${sortDirection}`;

    if (filters?.limit !== undefined) {
      values.push(filters.limit);
      query += ` LIMIT $${values.length}`;
    }
    if (filters?.offset !== undefined) {
      values.push(filters.offset);
      query += ` OFFSET $${values.length}`;
    }

    let dbRecords: MaintenanceRecord[] = [];
    try {
      const res = await this.pool.query(query, values);
      dbRecords = res.rows.map((row: any) => this.mapRowToMaintenanceRecord(row));
    } catch {
      dbRecords = [];
    }

    const fallbacks = Array.from(this.fallbackMaintenanceRecords.values()).filter((r) => {
      if (r.organizationId !== organizationId) return false;
      if (filters?.machineId && r.machineId !== filters.machineId && r.machineAssetTag !== filters.machineId) return false;
      return true;
    });

    const combined = [...fallbacks, ...dbRecords];
    return combined.slice(0, filters?.limit || 100);
  }

  public async countMaintenanceRecords(
    organizationId: string,
    filters?: MaintenanceRecordFilterOptions
  ): Promise<number> {
    const whereClauses: string[] = ['organization_id = $1'];
    const values: unknown[] = [organizationId];

    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      if (safeUuid) {
        values.push(safeUuid);
        whereClauses.push(`machine_id = $${values.length}`);
      } else {
        values.push(cleanMachineId);
        whereClauses.push(`(machine_asset_tag = $${values.length} OR machine_id::text = $${values.length})`);
      }
    }
    if (filters?.plantId) {
      values.push(filters.plantId);
      whereClauses.push(`plant_id = $${values.length}`);
    }
    if (filters?.ticketId) {
      values.push(filters.ticketId);
      whereClauses.push(`ticket_id = $${values.length}`);
    }
    if (filters?.caseId) {
      values.push(filters.caseId);
      whereClauses.push(`case_id = $${values.length}`);
    }
    if (filters?.faultCategory) {
      values.push(filters.faultCategory);
      whereClauses.push(`fault_category = $${values.length}`);
    }
    if (filters?.rootCauseStatus) {
      values.push(filters.rootCauseStatus);
      whereClauses.push(`root_cause_status = $${values.length}`);
    }
    if (filters?.verificationState) {
      values.push(filters.verificationState);
      whereClauses.push(`verification_state = $${values.length}`);
    }
    if (filters?.approvalStatus) {
      values.push(filters.approvalStatus);
      whereClauses.push(`approval_status = $${values.length}`);
    }
    if (filters?.requiresRestartApproval !== undefined) {
      values.push(filters.requiresRestartApproval);
      whereClauses.push(`requires_restart_approval = $${values.length}`);
    }
    if (filters?.restartApproved !== undefined) {
      values.push(filters.restartApproved);
      whereClauses.push(`restart_approved = $${values.length}`);
    }
    if (filters?.technicianUserId) {
      values.push(filters.technicianUserId);
      whereClauses.push(`resolving_technician_user_id = $${values.length}`);
    }
    if (filters?.isRecurring !== undefined) {
      values.push(filters.isRecurring);
      whereClauses.push(`is_recurring_incident = $${values.length}`);
    }
    if (filters?.dateFrom) {
      values.push(filters.dateFrom);
      whereClauses.push(`resolved_at >= $${values.length}`);
    }
    if (filters?.dateTo) {
      values.push(filters.dateTo);
      whereClauses.push(`resolved_at <= $${values.length}`);
    }

    const res = await this.pool.query(
      `SELECT COUNT(*) FROM maintenance_records WHERE ${whereClauses.join(' AND ')}`,
      values
    );
    return parseInt(res.rows[0].count, 10);
  }

  public async updateMaintenanceRecord(
    organizationId: string,
    id: string,
    updates: UpdateMaintenanceRecordDTO
  ): Promise<MaintenanceRecord | null> {
    const existing = await this.getMaintenanceRecordById(organizationId, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const changes: Record<string, { from: any; to: any }> = {};

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'actorUserId' || key === 'note') continue;
      if (val !== undefined && (existing as any)[key] !== val) {
        changes[key] = { from: (existing as any)[key], to: val };
        (existing as any)[key] = val;
      }
    }

    const newVersion = existing.recordVersion + 1;
    const auditTrail = [...existing.auditTrail];
    auditTrail.push({
      id: 'audit_' + Math.random().toString(36).substring(2, 10),
      versionNumber: newVersion,
      action: 'RECORD_UPDATED',
      actorUserId: updates.actorUserId,
      changes,
      notes: updates.note || 'Maintenance record updated with versioned audit trail',
      timestamp: now,
    });

    const setClauses: string[] = [
      'updated_at = NOW()',
      'record_version = $3',
      'audit_trail = $4',
    ];
    const values: unknown[] = [organizationId, id, newVersion, JSON.stringify(auditTrail)];

    if (updates.observedSymptoms !== undefined) {
      values.push(JSON.stringify(updates.observedSymptoms));
      setClauses.push(`observed_symptoms = $${values.length}`);
    }
    if (updates.measurements !== undefined) {
      values.push(JSON.stringify(updates.measurements));
      setClauses.push(`measurements = $${values.length}`);
    }
    if (updates.rootCause !== undefined) {
      values.push(updates.rootCause);
      setClauses.push(`root_cause = $${values.length}`);
    }
    if (updates.rootCauseStatus !== undefined) {
      values.push(updates.rootCauseStatus);
      setClauses.push(`root_cause_status = $${values.length}`);
    }
    if (updates.repairActions !== undefined) {
      values.push(JSON.stringify(updates.repairActions));
      setClauses.push(`repair_actions = $${values.length}`);
    }
    if (updates.partsReplaced !== undefined) {
      values.push(JSON.stringify(updates.partsReplaced));
      setClauses.push(`parts_replaced = $${values.length}`);
    }
    if (updates.postRepairTestResults !== undefined) {
      values.push(JSON.stringify(updates.postRepairTestResults));
      setClauses.push(`post_repair_test_results = $${values.length}`);
    }
    if (updates.verificationState !== undefined) {
      values.push(updates.verificationState);
      setClauses.push(`verification_state = $${values.length}`);
    }
    if (updates.verificationNotes !== undefined) {
      values.push(updates.verificationNotes);
      setClauses.push(`verification_notes = $${values.length}`);
    }
    if (updates.verifiedByUserId !== undefined) {
      values.push(updates.verifiedByUserId);
      setClauses.push(`verified_by_user_id = $${values.length}`);
    }
    if (updates.verifiedAt !== undefined) {
      values.push(updates.verifiedAt);
      setClauses.push(`verified_at = $${values.length}`);
    }
    if (updates.requiresRestartApproval !== undefined) {
      values.push(updates.requiresRestartApproval);
      setClauses.push(`requires_restart_approval = $${values.length}`);
    }
    if (updates.restartApproved !== undefined) {
      values.push(updates.restartApproved);
      setClauses.push(`restart_approved = $${values.length}`);
    }
    if (updates.restartApprovedByUserId !== undefined) {
      values.push(updates.restartApprovedByUserId);
      setClauses.push(`restart_approved_by_user_id = $${values.length}`);
    }
    if (updates.restartApprovedAt !== undefined) {
      values.push(updates.restartApprovedAt);
      setClauses.push(`restart_approved_at = $${values.length}`);
    }
    if (updates.restartNotes !== undefined) {
      values.push(updates.restartNotes);
      setClauses.push(`restart_notes = $${values.length}`);
    }
    if (updates.approvalStatus !== undefined) {
      values.push(updates.approvalStatus);
      setClauses.push(`approval_status = $${values.length}`);
    }
    if (updates.approvedByUserId !== undefined) {
      values.push(updates.approvedByUserId);
      setClauses.push(`approved_by_user_id = $${values.length}`);
    }
    if (updates.approvedAt !== undefined) {
      values.push(updates.approvedAt);
      setClauses.push(`approved_at = $${values.length}`);
    }
    if (updates.approvalNotes !== undefined) {
      values.push(updates.approvalNotes);
      setClauses.push(`approval_notes = $${values.length}`);
    }
    if (updates.closedAt !== undefined) {
      values.push(updates.closedAt);
      setClauses.push(`closed_at = $${values.length}`);
    }
    if (updates.relatedIncidentRecordIds !== undefined) {
      values.push(JSON.stringify(updates.relatedIncidentRecordIds));
      setClauses.push(`related_incident_record_ids = $${values.length}`);
    }
    if (updates.attachments !== undefined) {
      values.push(JSON.stringify(updates.attachments));
      setClauses.push(`attachments = $${values.length}`);
    }
    if (updates.knowledgeApproved !== undefined) {
      values.push(updates.knowledgeApproved);
      setClauses.push(`knowledge_approved = $${values.length}`);
    }

    const res = await this.pool.query(
      `UPDATE maintenance_records SET ${setClauses.join(', ')} WHERE organization_id = $1 AND id = $2 RETURNING *`,
      values
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToMaintenanceRecord(res.rows[0]);
  }

  public async deleteMaintenanceRecord(
    organizationId: string,
    id: string
  ): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM maintenance_records WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [organizationId, id]
    );
    return res.rows.length > 0;
  }

  public async getMachineMaintenanceHistory(
    organizationId: string,
    machineId: string
  ): Promise<MaintenanceRecord[]> {
    const cleanMachineId = sanitizeMachineOrAssetId(machineId);
    return this.listMaintenanceRecords(organizationId, { machineId: cleanMachineId });
  }

  // --------------------------------------------------------------------------
  // Recurring Fault Intelligence & Policies (Postgres)
  // --------------------------------------------------------------------------
  public async setRecurringFaultPolicy(
    organizationId: string,
    data: SetRecurringFaultPolicyDTO
  ): Promise<RecurringFaultThresholdConfig> {
    const id = 'rfp_' + Math.random().toString(36).substring(2, 10);
    const timeWindowDays = data.timeWindowDays ?? 30;
    const recurrenceCountThreshold = data.recurrenceCountThreshold ?? 2;
    const requiresSafetyStop = data.requiresSafetyStop ?? false;
    const safetyLimits = data.safetyLimits || {};
    const cleanMachineId = data.machineId ? sanitizeMachineOrAssetId(data.machineId) : null;
    const safeMachineUuid = cleanMachineId ? toSafeUuidParam(cleanMachineId) : null;

    await this.pool.query(
      `INSERT INTO machine_recurring_fault_policies (
        id, organization_id, machine_id, machine_type, time_window_days,
        recurrence_threshold_count, requires_safety_stop, safety_limits, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (organization_id, machine_id)
      DO UPDATE SET
        time_window_days = EXCLUDED.time_window_days,
        recurrence_threshold_count = EXCLUDED.recurrence_threshold_count,
        requires_safety_stop = EXCLUDED.requires_safety_stop,
        safety_limits = EXCLUDED.safety_limits,
        updated_at = NOW()`,
      [
        id,
        organizationId,
        safeMachineUuid || null,
        data.machineType || null,
        timeWindowDays,
        recurrenceCountThreshold,
        requiresSafetyStop,
        JSON.stringify(safetyLimits),
      ]
    );

    return {
      machineType: data.machineType || 'ALL',
      timeWindowDays,
      recurrenceCountThreshold,
      requiresSafetyStop,
      safetyLimits: data.safetyLimits,
    };
  }

  public async getRecurringFaultPolicy(
    organizationId: string,
    machineId: string,
    machineType?: string
  ): Promise<RecurringFaultThresholdConfig> {
    const cleanMachineId = sanitizeMachineOrAssetId(machineId);
    const safeMachineUuid = toSafeUuidParam(cleanMachineId);
    const query = safeMachineUuid
      ? `SELECT * FROM machine_recurring_fault_policies
       WHERE organization_id = $1 AND (machine_id = $2 OR machine_id IS NULL)
       ORDER BY machine_id NULLS LAST LIMIT 1`
      : `SELECT * FROM machine_recurring_fault_policies
       WHERE organization_id = $1 AND (machine_id::text = $2 OR machine_id IS NULL)
       ORDER BY machine_id NULLS LAST LIMIT 1`;
    const res = await this.pool.query(query, [organizationId, safeMachineUuid || cleanMachineId]);

    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        machineType: row.machine_type || machineType || 'ALL',
        timeWindowDays: row.time_window_days,
        recurrenceCountThreshold: row.recurrence_threshold_count,
        requiresSafetyStop: row.requires_safety_stop,
        safetyLimits:
          typeof row.safety_limits === 'string'
            ? JSON.parse(row.safety_limits)
            : row.safety_limits,
      };
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
    const cleanMachineId = sanitizeMachineOrAssetId(machineId);
    const machine = await this.getMachineById(organizationId, cleanMachineId);
    const assetTag = machine?.assetTag || 'UNKNOWN';
    const policy = await this.getRecurringFaultPolicy(
      organizationId,
      cleanMachineId,
      machine?.machineType
    );

    const windowDays = options?.timeWindowDays ?? policy.timeWindowDays ?? 30;
    const threshold =
      options?.recurrenceCountThreshold ?? policy.recurrenceCountThreshold ?? 2;

    const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
    const allRecords = await this.getMachineMaintenanceHistory(organizationId, cleanMachineId);
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
        .filter((t) => !isNaN(t))
        .sort((a, b) => a - b);
      if (sortedDates.length > 1) {
        let totalDiffDays = 0;
        for (let i = 1; i < sortedDates.length; i++) {
          totalDiffDays += (sortedDates[i] - sortedDates[i - 1]) / (24 * 3600 * 1000);
        }
        averageRecurrenceIntervalDays = Number(
          (totalDiffDays / (sortedDates.length - 1)).toFixed(1)
        );
      }
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
  // Ticket Resolution & Lifecycle Actions (Postgres)
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
    const history = [...ticket.history];
    history.push({
      id: 'hist_' + Math.random().toString(36).substring(2, 10),
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

    try {
      await this.pool.query(
        `UPDATE specialist_tickets
         SET status = $3,
             fault_category = $4,
             root_cause = $5,
             root_cause_status = $6,
             maintenance_record_id = $7,
             requires_restart_approval = $8,
             restart_approved = FALSE,
             technician_observations = $9,
             repair_outcome = $10,
             resolved_at = CASE WHEN $3 = 'RESOLVED' THEN NOW() ELSE resolved_at END,
             resolved_by_user_id = CASE WHEN $3 = 'RESOLVED' THEN $11 ELSE resolved_by_user_id END,
             history = $12,
             updated_at = NOW()
         WHERE organization_id = $1 AND id = $2`,
        [
          organizationId,
          ticketId,
          newStatus,
          resolution.faultCategory,
          resolution.rootCause,
          resolution.rootCauseStatus,
          record.id,
          requiresRestartApproval,
          resolution.observedSymptoms?.join(', ') || null,
          `Actions: ${resolution.repairActions.join('; ')}. Verification: ${verificationState}.`,
          resolution.resolvingTechnicianUserId,
          JSON.stringify(history),
        ]
      );
    } catch (err: any) {
      if (!ticket.maintenanceRecordId && record.id) {
        // Safe rollback: Clean up newly created record if ticket update failed
        await this.pool.query(
          `DELETE FROM maintenance_records WHERE organization_id = $1 AND id = $2`,
          [organizationId, record.id]
        ).catch(() => {});
      }
      throw err;
    }

    const updatedTicket = await this.getSpecialistTicketById(organizationId, ticketId);
    return { ticket: updatedTicket!, record };
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
    const reopenCount = (ticket.reopenCount || 0) + 1;
    const history = [...ticket.history];
    history.push({
      id: 'hist_' + Math.random().toString(36).substring(2, 10),
      ticketId: ticket.id,
      actorUserId: data.actorUserId,
      action: 'TICKET_REOPENED',
      previousStatus,
      newStatus: 'REOPENED',
      notes: `Ticket reopened (reopen #${reopenCount}): ${data.reopenReason}`,
      timestamp: now,
    });

    await this.pool.query(
      `UPDATE specialist_tickets
       SET status = 'REOPENED',
           reopen_count = $3,
           reopened_at = NOW(),
           reopened_by_user_id = $4,
           resolved_at = NULL,
           resolved_by_user_id = NULL,
           history = $5,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, ticketId, reopenCount, data.actorUserId, JSON.stringify(history)]
    );

    let record: MaintenanceRecord | null = null;
    if (ticket.maintenanceRecordId) {
      record = await this.updateMaintenanceRecord(organizationId, ticket.maintenanceRecordId, {
        actorUserId: data.actorUserId,
        verificationState: 'FAILED',
        note: `Ticket reopened due to recurring or unresolved issue: ${data.reopenReason}`,
      });
    }

    const updatedTicket = await this.getSpecialistTicketById(organizationId, ticketId);
    return { ticket: updatedTicket!, record };
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
    const newStatus = ticket.status === 'PENDING_VERIFICATION' ? 'RESOLVED' : ticket.status;
    const history = [...ticket.history];
    history.push({
      id: 'hist_' + Math.random().toString(36).substring(2, 10),
      ticketId: ticket.id,
      actorUserId: data.actorUserId,
      action: 'RESTART_APPROVED',
      previousStatus,
      newStatus,
      notes:
        data.notes ||
        `Restart authorized by supervisor (${data.actorName || data.actorUserId}). Verified safe for operation.`,
      timestamp: now,
    });

    await this.pool.query(
      `UPDATE specialist_tickets
       SET restart_approved = TRUE,
           restart_approved_by_user_id = $3,
           restart_approved_at = NOW(),
           status = $4,
           resolved_at = CASE WHEN $4 = 'RESOLVED' THEN NOW() ELSE resolved_at END,
           resolved_by_user_id = CASE WHEN $4 = 'RESOLVED' THEN $3 ELSE resolved_by_user_id END,
           history = $5,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, ticketId, data.actorUserId, newStatus, JSON.stringify(history)]
    );

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

    const updatedTicket = await this.getSpecialistTicketById(organizationId, ticketId);
    return { ticket: updatedTicket!, record };
  }

  // ============================================================================
  // Confidential Access Monitoring & Admin Security Alerts
  // ============================================================================

  public async recordSecurityEvent(dto: CreateSecurityEventDTO): Promise<SecurityEvent> {
    const isBenign =
      dto.isBenignInquiry !== undefined
        ? dto.isBenignInquiry
        : dto.decision === 'DENIED' && dto.severity !== 'CRITICAL' && dto.severity !== 'HIGH';

    const sql = `
      INSERT INTO security_events (
        id, organization_id, actor_user_id, actor_email, actor_role, category, action,
        resource_category, resource_id, decision, policy_reason_code, severity, correlation_id,
        metadata, review_status, is_benign_inquiry, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'OPEN', $14, NOW()
      ) RETURNING *
    `;
    const res = await this.pool.query(sql, [
      dto.organizationId,
      dto.actorUserId || null,
      dto.actorEmail || null,
      dto.actorRole || null,
      dto.category,
      dto.action,
      dto.resourceCategory,
      dto.resourceId || null,
      dto.decision,
      dto.policyReasonCode,
      dto.severity,
      dto.correlationId || null,
      JSON.stringify(dto.metadata || {}),
      isBenign,
    ]);
    return this.mapSecurityEventRow(res.rows[0]);
  }

  public async listSecurityEvents(
    organizationId: string,
    filter?: ListSecurityEventsQuery
  ): Promise<{ events: SecurityEvent[]; total: number }> {
    const conditions = ['organization_id = $1'];
    const params: any[] = [organizationId];
    let idx = 2;

    if (filter?.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filter.category);
    }
    if (filter?.actorUserId) {
      conditions.push(`actor_user_id = $${idx++}`);
      params.push(filter.actorUserId);
    }
    if (filter?.decision) {
      conditions.push(`decision = $${idx++}`);
      params.push(filter.decision);
    }
    if (filter?.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(filter.severity);
    }
    if (filter?.reviewStatus) {
      conditions.push(`review_status = $${idx++}`);
      params.push(filter.reviewStatus);
    }

    const countSql = `SELECT COUNT(*) FROM security_events WHERE ${conditions.join(' AND ')}`;
    const countRes = await this.pool.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    params.push(limit, offset);

    const sql = `
      SELECT * FROM security_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    const res = await this.pool.query(sql, params);
    return {
      events: res.rows.map((r) => this.mapSecurityEventRow(r)),
      total,
    };
  }

  public async getSecurityEventById(
    organizationId: string,
    eventId: string
  ): Promise<SecurityEvent | null> {
    const res = await this.pool.query(
      `SELECT * FROM security_events WHERE organization_id = $1 AND id = $2`,
      [organizationId, eventId]
    );
    if (res.rows.length === 0) return null;
    return this.mapSecurityEventRow(res.rows[0]);
  }

  public async createSecurityAlert(dto: CreateSecurityAlertDTO): Promise<SecurityAlert> {
    const eventCount = dto.correlatedEventIds && dto.correlatedEventIds.length > 0 ? dto.correlatedEventIds.length : 1;
    const sql = `
      INSERT INTO security_alerts (
        id, organization_id, alert_type, severity, status, title, summary,
        actor_user_id, actor_email, actor_role, resource_category, resource_id,
        event_count, first_seen_at, last_seen_at, correlated_event_ids, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'OPEN', $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12, NOW(), NOW()
      ) RETURNING *
    `;
    const res = await this.pool.query(sql, [
      dto.organizationId,
      dto.alertType,
      dto.severity,
      dto.title,
      dto.summary,
      dto.actorUserId || null,
      dto.actorEmail || null,
      dto.actorRole || null,
      dto.resourceCategory,
      dto.resourceId || null,
      eventCount,
      JSON.stringify(dto.correlatedEventIds || []),
    ]);
    return this.mapSecurityAlertRow(res.rows[0]);
  }

  public async updateSecurityAlert(
    organizationId: string,
    alertId: string,
    updates: Partial<SecurityAlert>
  ): Promise<SecurityAlert | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [organizationId, alertId];
    let idx = 3;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      params.push(updates.status);
    }
    if (updates.severity !== undefined) {
      setClauses.push(`severity = $${idx++}`);
      params.push(updates.severity);
    }
    if (updates.eventCount !== undefined) {
      setClauses.push(`event_count = $${idx++}`);
      params.push(updates.eventCount);
    }
    if (updates.lastSeenAt !== undefined) {
      setClauses.push(`last_seen_at = $${idx++}`);
      params.push(updates.lastSeenAt);
    }
    if (updates.correlatedEventIds !== undefined) {
      setClauses.push(`correlated_event_ids = $${idx++}`);
      params.push(JSON.stringify(updates.correlatedEventIds));
    }
    if (updates.assignedReviewerUserId !== undefined) {
      setClauses.push(`assigned_reviewer_user_id = $${idx++}`);
      params.push(updates.assignedReviewerUserId);
    }
    if (updates.reviewNotes !== undefined) {
      setClauses.push(`review_notes = $${idx++}`);
      params.push(updates.reviewNotes);
    }
    if (updates.resolutionOutcome !== undefined) {
      setClauses.push(`resolution_outcome = $${idx++}`);
      params.push(updates.resolutionOutcome);
    }
    if (updates.resolvedAt !== undefined) {
      setClauses.push(`resolved_at = $${idx++}`);
      params.push(updates.resolvedAt);
    }
    if (updates.resolvedByUserId !== undefined) {
      setClauses.push(`resolved_by_user_id = $${idx++}`);
      params.push(updates.resolvedByUserId);
    }

    const sql = `
      UPDATE security_alerts
      SET ${setClauses.join(', ')}
      WHERE organization_id = $1 AND id = $2
      RETURNING *
    `;
    const res = await this.pool.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapSecurityAlertRow(res.rows[0]);
  }

  public async listSecurityAlerts(
    organizationId: string,
    filter?: ListSecurityAlertsQuery
  ): Promise<{ alerts: SecurityAlert[]; total: number }> {
    const conditions = ['organization_id = $1'];
    const params: any[] = [organizationId];
    let idx = 2;

    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filter.status);
    }
    if (filter?.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(filter.severity);
    }
    if (filter?.alertType) {
      conditions.push(`alert_type = $${idx++}`);
      params.push(filter.alertType);
    }
    if (filter?.actorUserId) {
      conditions.push(`actor_user_id = $${idx++}`);
      params.push(filter.actorUserId);
    }
    if (filter?.search) {
      conditions.push(`(title ILIKE $${idx} OR summary ILIKE $${idx} OR actor_email ILIKE $${idx})`);
      params.push(`%${filter.search}%`);
      idx++;
    }

    const countSql = `SELECT COUNT(*) FROM security_alerts WHERE ${conditions.join(' AND ')}`;
    const countRes = await this.pool.query(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    params.push(limit, offset);

    const sql = `
      SELECT * FROM security_alerts
      WHERE ${conditions.join(' AND ')}
      ORDER BY last_seen_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    const res = await this.pool.query(sql, params);
    return {
      alerts: res.rows.map((r) => this.mapSecurityAlertRow(r)),
      total,
    };
  }

  public async getSecurityAlertById(
    organizationId: string,
    alertId: string
  ): Promise<SecurityAlert | null> {
    const res = await this.pool.query(
      `SELECT * FROM security_alerts WHERE organization_id = $1 AND id = $2`,
      [organizationId, alertId]
    );
    if (res.rows.length === 0) return null;
    return this.mapSecurityAlertRow(res.rows[0]);
  }

  public async findOpenAlertForActorAndType(
    organizationId: string,
    actorUserId: string,
    alertType: string
  ): Promise<SecurityAlert | null> {
    const res = await this.pool.query(
      `SELECT * FROM security_alerts
       WHERE organization_id = $1 AND actor_user_id = $2 AND alert_type = $3 AND status = 'OPEN'
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId, actorUserId, alertType]
    );
    if (res.rows.length === 0) return null;
    return this.mapSecurityAlertRow(res.rows[0]);
  }

  private mapSecurityEventRow(row: any): SecurityEvent {
    return {
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id || null,
      actorEmail: row.actor_email || null,
      actorRole: row.actor_role || null,
      timestamp: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      category: row.category,
      action: row.action,
      resourceCategory: row.resource_category,
      resourceId: row.resource_id || null,
      decision: row.decision,
      policyReasonCode: row.policy_reason_code,
      severity: row.severity,
      correlationId: row.correlation_id || null,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      reviewStatus: row.review_status || 'OPEN',
      assignedReviewerUserId: row.assigned_reviewer_user_id || null,
      reviewNotes: row.review_notes || null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      resolvedByUserId: row.resolved_by_user_id || null,
      isBenignInquiry: Boolean(row.is_benign_inquiry),
    };
  }

  private mapSecurityAlertRow(row: any): SecurityAlert {
    return {
      id: row.id,
      organizationId: row.organization_id,
      alertType: row.alert_type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      summary: row.summary,
      actorUserId: row.actor_user_id || null,
      actorEmail: row.actor_email || null,
      actorRole: row.actor_role || null,
      resourceCategory: row.resource_category,
      resourceId: row.resource_id || null,
      eventCount: parseInt(row.event_count || '1', 10),
      firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at).toISOString() : new Date().toISOString(),
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : new Date().toISOString(),
      correlatedEventIds: typeof row.correlated_event_ids === 'string' ? JSON.parse(row.correlated_event_ids) : row.correlated_event_ids || [],
      assignedReviewerUserId: row.assigned_reviewer_user_id || null,
      reviewNotes: row.review_notes || null,
      resolutionOutcome: row.resolution_outcome || null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      resolvedByUserId: row.resolved_by_user_id || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  // ============================================================================
  // Machine Knowledge Recovery System (Phase 3)
  // ============================================================================

  private mapClaimRow(row: any): MachineEvidenceClaim {
    let claimValue: string | number | boolean = row.claim_value;
    if (row.claim_value_type === 'NUMBER') {
      const n = Number(row.claim_value);
      if (!isNaN(n)) claimValue = n;
    } else if (row.claim_value_type === 'BOOLEAN') {
      claimValue = row.claim_value === 'true';
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      plantId: row.plant_id,
      machineId: row.machine_id,
      machineAssetTag: row.machine_asset_tag,
      fieldName: row.field_name,
      displayName: row.display_name || row.field_name,
      claimValue,
      unit: row.unit || null,
      sourceType: row.source_type,
      sourceDocumentId: row.source_document_id || null,
      sourceAttachmentKey: row.source_attachment_key || null,
      sourcePageNumber: row.source_page_number || null,
      sourceRegion: row.source_region || null,
      sourceRevision: row.source_revision || null,
      sourceDate: row.source_date ? new Date(row.source_date).toISOString().slice(0, 10) : null,
      extractionMethod: row.extraction_method,
      confidence: row.confidence,
      applicabilityStatus: row.applicability_status,
      applicabilityRationale: row.applicability_rationale || null,
      status: row.status,
      submittedByUserId: row.submitted_by_user_id,
      submittedByEmail: row.submitted_by_email || null,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : new Date().toISOString(),
      reviewedByUserId: row.reviewed_by_user_id || null,
      reviewedByEmail: row.reviewed_by_email || null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      reviewNotes: row.review_notes || null,
      reviewRationale: row.review_rationale || null,
      reviewerQualifications: row.reviewer_qualifications || null,
      supersededByClaimId: row.superseded_by_claim_id || null,
      supersedesClaimId: row.supersedes_claim_id || null,
      isSafetyCritical: Boolean(row.is_safety_critical),
      version: parseInt(row.version || '1', 10),
      auditTrail: typeof row.audit_trail === 'string' ? JSON.parse(row.audit_trail) : row.audit_trail || [],
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  public async createEvidenceClaim(
    organizationId: string,
    dto: CreateEvidenceClaimDTO & { submittedByUserId: string; submittedByEmail?: string }
  ): Promise<MachineEvidenceClaim> {
    const machine = await this.getMachineById(organizationId, dto.machineId);
    if (!machine) {
      throw new Error(`Machine '${dto.machineId}' not found in organization.`);
    }

    const isSafetyCritical =
      dto.isSafetyCritical !== undefined
        ? dto.isSafetyCritical
        : /\b(pressure|voltage|current|torque|loto|lockout|safety|mawp|temperature|relief|speed|rpm)\b/i.test(
            dto.fieldName
          );

    let valType: 'STRING' | 'NUMBER' | 'BOOLEAN' = 'STRING';
    if (typeof dto.claimValue === 'number') valType = 'NUMBER';
    else if (typeof dto.claimValue === 'boolean') valType = 'BOOLEAN';

    const initialAudit: ClaimAuditEntry = {
      action: 'SUBMITTED_FOR_REVIEW',
      actorUserId: dto.submittedByUserId,
      actorEmail: dto.submittedByEmail || null,
      timestamp: new Date().toISOString(),
      notes: 'Initial evidence collected and submitted for qualified engineering review',
    };

    const res = await this.pool.query(
      `INSERT INTO machine_evidence_claims (
         organization_id, plant_id, machine_id, machine_asset_tag, field_name, display_name,
         claim_value, claim_value_type, unit, source_type, source_document_id, source_attachment_key,
         source_page_number, source_region, source_revision, source_date, extraction_method,
         confidence, applicability_status, applicability_rationale, status, submitted_by_user_id,
         submitted_by_email, is_safety_critical, version, audit_trail
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         'AWAITING_REVIEW', $21, $22, $23, 1, $24
       ) RETURNING *`,
      [
        organizationId,
        machine.plantId,
        machine.id,
        machine.assetTag,
        dto.fieldName,
        dto.displayName || dto.fieldName,
        String(dto.claimValue),
        valType,
        dto.unit || null,
        dto.sourceType,
        dto.sourceDocumentId || null,
        dto.sourceAttachmentKey || null,
        dto.sourcePageNumber || null,
        dto.sourceRegion || null,
        dto.sourceRevision || null,
        dto.sourceDate || null,
        dto.extractionMethod,
        dto.confidence || 'MEDIUM',
        dto.applicabilityStatus || 'UNCERTAIN',
        dto.applicabilityRationale || null,
        dto.submittedByUserId,
        dto.submittedByEmail || null,
        isSafetyCritical,
        JSON.stringify([initialAudit]),
      ]
    );

    return this.mapClaimRow(res.rows[0]);
  }

  public async getEvidenceClaimById(
    organizationId: string,
    claimId: string
  ): Promise<MachineEvidenceClaim | null> {
    const res = await this.pool.query(
      `SELECT * FROM machine_evidence_claims WHERE id = $1 AND organization_id = $2`,
      [claimId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapClaimRow(res.rows[0]);
  }

  public async listEvidenceClaims(
    organizationId: string,
    filters?: ClaimFilterOptions
  ): Promise<MachineEvidenceClaim[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];

    if (filters?.machineId) {
      const cleanMachineId = sanitizeMachineOrAssetId(filters.machineId);
      const safeUuid = toSafeUuidParam(cleanMachineId);
      params.push(safeUuid || cleanMachineId);
      conditions.push(`(machine_id::text = $${params.length} OR machine_asset_tag = $${params.length})`);
    }
    if (filters?.plantId) {
      params.push(filters.plantId);
      conditions.push(`plant_id = $${params.length}`);
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters?.fieldName) {
      params.push(filters.fieldName.toLowerCase());
      conditions.push(`LOWER(field_name) = $${params.length}`);
    }
    if (filters?.isSafetyCritical !== undefined) {
      params.push(filters.isSafetyCritical);
      conditions.push(`is_safety_critical = $${params.length}`);
    }
    if (filters?.submittedByUserId) {
      params.push(filters.submittedByUserId);
      conditions.push(`submitted_by_user_id = $${params.length}`);
    }

    const query = `SELECT * FROM machine_evidence_claims WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapClaimRow(r));
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

    if (claim.submittedByUserId === review.reviewedByUserId) {
      const isSuperUser =
        review.actorRole === 'ORGANIZATION_ADMIN' || review.actorRole === 'ORGANIZATION_OWNER';
      if (!isSuperUser) {
        throw new Error(
          'Anti-self-approval violation: Technicians cannot approve their own submissions without explicit administrator authorization.'
        );
      }
    }

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
    const updatedAuditTrail = [...claim.auditTrail];

    let newStatus = claim.status;
    let newApplicability = claim.applicabilityStatus;
    let claimValStr = String(claim.claimValue);
    let claimUnit = claim.unit;

    if (review.decision === 'APPROVE') {
      if (!review.reviewRationale || review.reviewRationale.trim().length < 5) {
        throw new Error('Approval requires a valid, substantive engineering review rationale.');
      }
      if (claim.isSafetyCritical && (!review.reviewerQualifications || review.reviewerQualifications.trim().length < 3)) {
        throw new Error('Safety-critical specifications require verified reviewer engineering qualifications.');
      }

      // Supersede prior approved claims for same machine & field
      await this.pool.query(
        `UPDATE machine_evidence_claims
         SET status = 'SUPERSEDED', superseded_by_claim_id = $1, updated_at = NOW()
         WHERE organization_id = $2 AND machine_id = $3 AND LOWER(field_name) = LOWER($4) AND id != $1 AND status = 'APPROVED'`,
        [claim.id, organizationId, claim.machineId, claim.fieldName]
      );

      if (review.correctedValue !== undefined) {
        claimValStr = String(review.correctedValue);
        if (review.correctedUnit) claimUnit = review.correctedUnit;
        updatedAuditTrail.push({
          action: 'VALUE_CORRECTED',
          actorUserId: review.reviewedByUserId,
          actorEmail: review.reviewedByEmail || null,
          actorRole: reviewerRole,
          timestamp: now,
          notes: `Value adjusted during review to: ${review.correctedValue} ${review.correctedUnit || ''}`.trim(),
        });
      }

      newStatus = 'APPROVED';
      newApplicability = 'APPLICABLE';
      updatedAuditTrail.push({
        action: 'APPROVED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewNotes,
        qualificationProof: review.reviewerQualifications || null,
      });

      // Update machine technical specs & verification state
      const machine = await this.getMachineById(organizationId, claim.machineId);
      if (machine) {
        const lowerField = claim.fieldName.toLowerCase();
        let mfr = machine.manufacturer;
        let model = machine.modelNumber;
        let serial = machine.serialNumber;
        let year = (machine as any).manufacturingYear;

        if (lowerField === 'manufacturer') mfr = claimValStr;
        if (lowerField === 'modelnumber' || lowerField === 'model') model = claimValStr;
        if (lowerField === 'serialnumber' || lowerField === 'serial') serial = claimValStr;
        if (lowerField === 'manufacturingyear' || lowerField === 'year') {
          const num = parseInt(claimValStr, 10);
          if (!isNaN(num)) year = num;
        }

        const formattedSpec = claimUnit ? `${claimValStr} ${claimUnit}` : claimValStr;
        const newSpecs = {
          ...machine.technicalSpecs,
          [claim.fieldName]: formattedSpec,
        };

        let verState = machine.verificationState;
        let docState = machine.documentationReadiness;
        let identConf = (machine as any).identificationConfidence || 'UNIDENTIFIED';

        if (mfr && model && serial) {
          verState = 'VERIFIED';
          docState = 'READY';
          identConf = 'VERIFIED';
        } else if (mfr || model) {
          verState = 'PARTIALLY_VERIFIED';
          identConf = 'PARTIAL';
        }

        await this.pool.query(
          `UPDATE assets
           SET manufacturer = $1, model_number = $2, serial_number = $3, manufacturing_year = $4,
               technical_specs = $5, verification_state = $6, documentation_readiness = $7,
               identification_confidence = $8, updated_at = NOW()
           WHERE id = $9 AND organization_id = $10`,
          [
            mfr,
            model,
            serial,
            year || null,
            JSON.stringify(newSpecs),
            verState,
            docState,
            identConf,
            machine.id,
            organizationId,
          ]
        );

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
      newStatus = 'REJECTED';
      updatedAuditTrail.push({
        action: 'REJECTED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewRationale,
      });
    } else if (review.decision === 'REQUEST_ADDITIONAL_EVIDENCE') {
      newStatus = 'NEEDS_ADDITIONAL_EVIDENCE';
      updatedAuditTrail.push({
        action: 'ADDITIONAL_EVIDENCE_REQUESTED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewNotes,
      });
    } else if (review.decision === 'SUPERSEDE') {
      newStatus = 'SUPERSEDED';
      updatedAuditTrail.push({
        action: 'SUPERSEDED',
        actorUserId: review.reviewedByUserId,
        actorEmail: review.reviewedByEmail || null,
        actorRole: reviewerRole,
        timestamp: now,
        notes: review.reviewRationale,
      });
    }

    const updateRes = await this.pool.query(
      `UPDATE machine_evidence_claims
       SET status = $1, applicability_status = $2, claim_value = $3, unit = $4,
           reviewed_by_user_id = $5, reviewed_by_email = $6, reviewed_at = NOW(),
           review_notes = $7, review_rationale = $8, reviewer_qualifications = $9,
           audit_trail = $10, updated_at = NOW()
       WHERE id = $11 AND organization_id = $12
       RETURNING *`,
      [
        newStatus,
        newApplicability,
        claimValStr,
        claimUnit || null,
        review.reviewedByUserId,
        review.reviewedByEmail || null,
        review.reviewNotes,
        review.reviewRationale,
        review.reviewerQualifications || null,
        JSON.stringify(updatedAuditTrail),
        claim.id,
        organizationId,
      ]
    );

    return this.mapClaimRow(updateRes.rows[0]);
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

    const allClaims = await this.listEvidenceClaims(organizationId, plantId ? { plantId } : undefined);
    for (const c of allClaims) {
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
  private mapGuidanceRow(r: any): PublishedApprovedGuidance {
    return {
      id: r.id,
      organizationId: r.organization_id,
      plantId: r.plant_id,
      machineId: r.machine_id || null,
      machineAssetTag: r.machine_asset_tag || null,
      title: r.title,
      guidanceContent: r.guidance_content,
      sourceDocumentId: r.source_document_id || null,
      sourceDocumentNumber: r.source_document_number || null,
      sourceDocumentVersionId: r.source_document_version_id || null,
      sourceSectionHeading: r.source_section_heading || null,
      sourcePageNumber: r.source_page_number ?? null,
      applicableRoles: typeof r.applicable_roles === 'string' ? JSON.parse(r.applicable_roles) : (r.applicable_roles || []),
      disclosureClassification: r.disclosure_classification,
      reviewedByUserId: r.reviewed_by_user_id,
      reviewedByUserEmail: r.reviewed_by_email,
      approvedAt: r.approved_at instanceof Date ? r.approved_at.toISOString() : r.approved_at,
      expiresAt: r.expires_at ? (r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at) : null,
      status: r.status,
      supersededByPublicationId: r.superseded_by_publication_id || null,
      revisionNumber: r.revision_number,
      revocationReason: r.revocation_reason || null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    };
  }

  public async publishGuidance(
    organizationId: string,
    reviewerUserId: string,
    reviewerEmail: string,
    dto: PublishGuidanceDTO
  ): Promise<PublishedApprovedGuidance> {
    let assetTag: string | null = dto.machineAssetTag || null;
    if (dto.machineId && !assetTag) {
      const machine = await this.getMachineById(organizationId, dto.machineId);
      if (machine) {
        assetTag = machine.assetTag;
      }
    }

    const applicableRoles = dto.applicableRoles && dto.applicableRoles.length > 0
      ? dto.applicableRoles
      : ['WORKER', 'TECHNICIAN', 'ENGINEER', 'PLANT_MANAGER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'];
    const disclosureClassification = dto.disclosureClassification || 'WORKER_APPROVED';

    const res = await this.pool.query(
      `INSERT INTO forgex_published_guidance (
        organization_id, plant_id, machine_id, machine_asset_tag, title,
        guidance_content, source_document_id, source_document_number,
        source_document_version_id, source_section_heading, source_page_number,
        applicable_roles, disclosure_classification, reviewed_by_user_id,
        reviewed_by_email, expires_at, status, revision_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1)
      RETURNING *`,
      [
        organizationId,
        dto.plantId,
        dto.machineId || null,
        assetTag,
        dto.title,
        dto.guidanceContent,
        dto.sourceDocumentId || null,
        dto.sourceDocumentNumber || null,
        dto.sourceDocumentVersionId || null,
        dto.sourceSectionHeading || null,
        dto.sourcePageNumber ?? null,
        JSON.stringify(applicableRoles),
        disclosureClassification,
        reviewerUserId,
        reviewerEmail,
        dto.expiresAt || null,
        'PUBLISHED',
      ]
    );

    const guidance = this.mapGuidanceRow(res.rows[0]);

    await this.recordAuditEvent({
      organizationId,
      actorUserId: reviewerUserId,
      action: 'GUIDANCE_PUBLISHED',
      resourceType: 'PUBLISHED_GUIDANCE',
      resourceId: guidance.id,
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
    const res = await this.pool.query(
      `SELECT * FROM forgex_published_guidance WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapGuidanceRow(res.rows[0]);
  }

  public async listPublishedGuidance(
    organizationId: string,
    filters?: ListGuidanceFilters
  ): Promise<PublishedApprovedGuidance[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];

    if (filters?.plantId) {
      params.push(filters.plantId);
      conditions.push(`plant_id = $${params.length}`);
    }
    if (filters?.machineId) {
      params.push(filters.machineId);
      conditions.push(`(machine_id = $${params.length} OR machine_id IS NULL)`);
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters?.role) {
      params.push(JSON.stringify(filters.role));
      conditions.push(`applicable_roles @> $${params.length}::jsonb`);
    }

    const query = `SELECT * FROM forgex_published_guidance WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => this.mapGuidanceRow(r));
  }

  public async supersedePublishedGuidance(
    organizationId: string,
    guidanceId: string,
    supersededByGuidanceId: string
  ): Promise<PublishedApprovedGuidance | null> {
    const res = await this.pool.query(
      `UPDATE forgex_published_guidance
       SET status = 'SUPERSEDED', superseded_by_publication_id = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [supersededByGuidanceId, guidanceId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapGuidanceRow(res.rows[0]);
  }

  public async revokePublishedGuidance(
    organizationId: string,
    guidanceId: string,
    reason?: string
  ): Promise<PublishedApprovedGuidance | null> {
    const res = await this.pool.query(
      `UPDATE forgex_published_guidance
       SET status = 'REVOKED', revocation_reason = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [reason || 'Revoked by administrator', guidanceId, organizationId]
    );
    if (res.rows.length === 0) return null;
    return this.mapGuidanceRow(res.rows[0]);
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
    try {
      const deleteQuery = organizationId
        ? `DELETE FROM maintenance_records
           WHERE organization_id = $1
             AND (ticket_number LIKE 'RCA-%' OR fault_category = 'RCA_SESSION' OR problem_statement LIKE 'Field Symptom:%')
             AND created_at < NOW() - make_interval(days => $2)
           RETURNING id`
        : `DELETE FROM maintenance_records
           WHERE (ticket_number LIKE 'RCA-%' OR fault_category = 'RCA_SESSION' OR problem_statement LIKE 'Field Symptom:%')
             AND created_at < NOW() - make_interval(days => $1)
           RETURNING id`;

      const params = organizationId ? [organizationId, days] : [days];
      const res = await this.pool.query(deleteQuery, params);
      deletedMaintenanceRecords = res.rowCount || 0;
    } catch (pgErr) {
      console.warn('Non-fatal: maintenance_records purge in Postgres encountered notice:', pgErr);
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



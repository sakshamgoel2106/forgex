import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { config, validateModeSpecificRequirements } from '../src/config/env.js';
import { EmailOtpService } from '../src/auth/emailOtpService.js';

describe('4JX AI — Deployment Selection & Clean Company Workspace Test Suite', () => {
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let app: any;

  beforeEach(() => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(config.JWT_SECRET);
    app = createApp({
      dataStore,
      authAdapter,
    });
  });

  describe('1. Deployment Selection Persistence', () => {
    it('SaaS registration persists the SaaS deployment selection', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Cloud Solutions Corp',
          companySlug: 'cloud-solutions-corp',
          workEmail: 'owner@cloudsolutions.com',
          fullName: 'Cloud Owner',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          industry: 'Chemical Processing',
          country: 'United States',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.deploymentType).toBe('saas');

      // Verify on data store
      const org = await dataStore.getOrganizationById(res.body.data.organization.id);
      expect(org?.deploymentType).toBe('saas');
    });

    it('Enterprise registration persists the Enterprise deployment selection', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Nordic Metalworks Oy',
          companySlug: 'nordic-metalworks',
          workEmail: 'admin@nordicmetal.fi',
          fullName: 'Einar Lindqvist',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          industry: 'Mining & Metals',
          country: 'Finland',
          deploymentMode: 'enterprise',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.deploymentType).toBe('enterprise');

      const org = await dataStore.getOrganizationById(res.body.data.organization.id);
      expect(org?.deploymentType).toBe('enterprise');
    });

    it('Email OTP registration provisions the correct organization with chosen deployment mode', async () => {
      const email = 'otp-owner@apex-defense.com';
      const sendRes = await EmailOtpService.sendOtp(dataStore, email, 'register');
      const otp = sendRes.debugOtp!;

      const res = await request(app)
        .post('/api/v1/auth/register-org-otp')
        .send({
          companyName: 'Apex Defense Technologies',
          companySlug: 'apex-defense-tech',
          email,
          adminFullName: 'Commander Vance',
          otp,
          industry: 'Automotive & Aerospace',
          country: 'United States',
          deploymentMode: 'enterprise',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.deploymentType).toBe('enterprise');
      expect(res.body.data.membership.role).toBe('ORGANIZATION_OWNER');
    });
  });

  describe('2. Completely Fresh Workspace & Zero Inherited Data', () => {
    it('a new organization starts with zero plants, machines, cases, and documents', async () => {
      const regRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Pristine Energy Ltd',
          companySlug: 'pristine-energy-ltd',
          workEmail: 'admin@pristineenergy.com',
          fullName: 'Sarah Clean',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
          // initialSiteName omitted
        });

      expect(regRes.status).toBe(201);
      const orgId = regRes.body.data.organization.id;
      const token = regRes.body.data.token;

      // Verify no business entities were seeded
      const plants = await dataStore.listPlants(orgId);
      expect(plants.length).toBe(0);

      const machines = await dataStore.listMachines(orgId);
      expect(machines.length).toBe(0);

      const cases = await dataStore.listMaintenanceCases(orgId);
      expect(cases.length).toBe(0);

      const docs = await dataStore.listDocuments(orgId);
      expect(docs.length).toBe(0);

      // Verify overview endpoint returns genuine zero counts and empty arrays
      const overviewRes = await request(app)
        .get('/api/v1/org/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(overviewRes.status).toBe(200);
      expect(overviewRes.body.success).toBe(true);

      const { metrics, healthDistribution, availabilityTrend, highPriorityWorkOrders, recentAlerts, onboarding } =
        overviewRes.body.data;

      expect(metrics.totalAssets).toBe(0);
      expect(metrics.operationalCount).toBe(0);
      expect(metrics.attentionCount).toBe(0);
      expect(metrics.criticalCount).toBe(0);
      expect(metrics.totalPlants).toBe(0);
      expect(metrics.totalActiveWorkOrders).toBe(0);
      expect(metrics.fleetHealthPercentage).toBe(0);

      // Charts must be empty arrays so frontend renders clean empty states, not fake values
      expect(healthDistribution).toEqual([]);
      expect(availabilityTrend).toEqual([]);
      expect(highPriorityWorkOrders).toEqual([]);
      expect(recentAlerts).toEqual([]);

      // Onboarding flags
      expect(onboarding.isFreshWorkspace).toBe(true);
      expect(onboarding.hasPlants).toBe(false);
      expect(onboarding.hasMachines).toBe(false);
      expect(onboarding.deploymentType).toBe('saas');
    });

    it('Overview counts match actual organization-owned records once equipment is added', async () => {
      // 1. Register fresh organization
      const regRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Borealis Petrochemical',
          companySlug: 'borealis-petro',
          workEmail: 'lead@borealis.com',
          fullName: 'Elena Rostova',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'enterprise',
          termsAccepted: true,
          privacyAccepted: true,
        });

      const orgId = regRes.body.data.organization.id;
      const token = regRes.body.data.token;

      // 2. Add genuine plant and machine
      const plant = await dataStore.createPlant(orgId, {
        code: 'PLANT-NOR-01',
        name: 'Bergen Coastal Refinery',
        location: 'Bergen, Norway',
      });

      await dataStore.createMachine(orgId, {
        plantId: plant.id,
        assetTag: 'PUMP-801',
        name: 'Main Condensate Pump',
        department: 'Distillation',
        operationalState: 'OPTIMAL',
        criticality: 'HIGH',
        dataClassification: 'INTERNAL',
        authorizedAccessScope: 'ALL_PLANT_WORKERS',
        verificationState: 'VERIFIED',
      });

      await dataStore.createMaintenanceCase({
        organizationId: orgId,
        plantId: plant.id,
        title: 'Impeller Wear Inspection',
        description: 'Scheduled vibration analysis on PUMP-801',
        severity: 'MEDIUM',
        status: 'TRIAGED',
        assignedTechnicianName: 'Tom Tech',
        reportedByUserId: regRes.body.data.user.id,
      });

      // 3. Request overview
      const overviewRes = await request(app)
        .get('/api/v1/org/overview')
        .set('Authorization', `Bearer ${token}`);

      expect(overviewRes.status).toBe(200);
      const { metrics, healthDistribution, highPriorityWorkOrders, onboarding, departments } =
        overviewRes.body.data;

      expect(metrics.totalAssets).toBe(1);
      expect(metrics.operationalCount).toBe(1);
      expect(metrics.totalPlants).toBe(1);
      expect(metrics.totalActiveWorkOrders).toBe(1);
      expect(healthDistribution.length).toBe(1);
      expect(healthDistribution[0].name).toBe('Operational');
      expect(healthDistribution[0].value).toBe(1);
      expect(highPriorityWorkOrders.length).toBe(1);
      expect(highPriorityWorkOrders[0].title).toBe('Impeller Wear Inspection');
      expect(departments).toContain('Distillation');

      expect(onboarding.isFreshWorkspace).toBe(false);
      expect(onboarding.hasPlants).toBe(true);
      expect(onboarding.hasMachines).toBe(true);
    });
  });

  describe('3. Strict Server-Side Tenant Isolation', () => {
    it('Company A cannot view or inherit Company B data in the Overview page', async () => {
      // 1. Create Company A with assets and work orders
      const regA = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Company Alpha',
          companySlug: 'company-alpha',
          workEmail: 'admin@alpha.com',
          fullName: 'Alice Alpha',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
        });

      const orgAId = regA.body.data.organization.id;
      const plantA = await dataStore.createPlant(orgAId, {
        code: 'PLANT-A',
        name: 'Alpha Reactor Unit',
        location: 'Texas',
      });
      await dataStore.createMachine(orgAId, {
        plantId: plantA.id,
        assetTag: 'ALPHA-TURB-01',
        name: 'Alpha Turbine Generator',
        operationalState: 'CRITICAL_FAULT',
        criticality: 'CRITICAL',
        dataClassification: 'RESTRICTED',
        authorizedAccessScope: 'RESTRICTED_ENGINEERING',
        verificationState: 'VERIFIED',
      });

      // 2. Create Company B (fresh company)
      const regB = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Company Beta',
          companySlug: 'company-beta',
          workEmail: 'admin@beta.com',
          fullName: 'Bob Beta',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'enterprise',
          termsAccepted: true,
          privacyAccepted: true,
        });

      const tokenB = regB.body.data.token;

      // 3. Query Company B's overview
      const overviewB = await request(app)
        .get('/api/v1/org/overview')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(overviewB.status).toBe(200);
      expect(overviewB.body.data.organization.slug).toBe('company-beta');
      expect(overviewB.body.data.metrics.totalAssets).toBe(0);
      expect(overviewB.body.data.metrics.criticalCount).toBe(0);
      expect(overviewB.body.data.metrics.totalPlants).toBe(0);
      expect(overviewB.body.data.highPriorityWorkOrders).toEqual([]);
      expect(overviewB.body.data.onboarding.isFreshWorkspace).toBe(true);
    });
  });

  describe('4. Registration Retries & Existing Member Preservations', () => {
    it('Retried registration with same owner reconnects without creating duplicate organization', async () => {
      // First registration
      const reg1 = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Cascade Manufacturing',
          companySlug: 'cascade-mfg',
          workEmail: 'owner@cascade.com',
          fullName: 'Claire Cascade',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(reg1.status).toBe(201);
      const originalOrgId = reg1.body.data.organization.id;

      // Duplicate retry by the same owner (e.g. browser refresh or interrupted step)
      const regRetry = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Cascade Manufacturing',
          companySlug: 'cascade-mfg',
          workEmail: 'owner@cascade.com',
          fullName: 'Claire Cascade',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(regRetry.status).toBe(200);
      expect(regRetry.body.success).toBe(true);
      expect(regRetry.body.data.organization.id).toBe(originalOrgId);
      expect(regRetry.body.data.token).toBeDefined();

      // Ensure slug conflict still blocks different users
      const differentUserRetry = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Cascade Manufacturing Imposter',
          companySlug: 'cascade-mfg',
          workEmail: 'imposter@othercompany.com',
          fullName: 'Fake Owner',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'saas',
          termsAccepted: true,
          privacyAccepted: true,
        });

      expect(differentUserRetry.status).toBe(409);
      expect(differentUserRetry.body.error.code).toBe('FORGEX_ORG_SLUG_CONFLICT');
    });

    it('Existing members log into their existing workspace with deployment configuration preserved', async () => {
      // 1. Register with Enterprise
      const regRes = await request(app)
        .post('/api/v1/auth/register-org')
        .send({
          companyName: 'Alpine Heavy Industries',
          companySlug: 'alpine-heavy',
          workEmail: 'admin@alpine.ch',
          fullName: 'Hans Gruber',
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          deploymentMode: 'enterprise',
          termsAccepted: true,
          privacyAccepted: true,
        });

      // Mark email verified for password login
      await dataStore.setUserEmailVerified(regRes.body.data.user.id, true);

      // 2. Member logs in using credentials
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@alpine.ch',
          password: 'Password123!Secure',
          organizationSlug: 'alpine-heavy',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.organization.deploymentType).toBe('enterprise');

      // Deployment type is never silently switched on login
      const org = await dataStore.getOrganizationBySlug('alpine-heavy');
      expect(org?.deploymentType).toBe('enterprise');
    });
  });

  describe('5. Enterprise Air-Gap Security Safeguards', () => {
    it('Enterprise mode prevents data egress and blocks external cloud inference providers', () => {
      expect(() => {
        validateModeSpecificRequirements({
          NODE_ENV: 'production',
          DEPLOYMENT_MODE: 'enterprise',
          TELEMETRY_ENABLED: true, // Should trigger air-gap error
          INFERENCE_MODE: 'local_ollama',
          INFERENCE_PROVIDER: 'ollama',
          PORT: 4000,
          HOST: '0.0.0.0',
          LOG_LEVEL: 'info',
          CORS_ORIGIN: 'http://localhost:5173',
          AUTH_PROVIDER: 'local_dev',
          JWT_SECRET: 'super_secret_forgex_jwt_key_at_least_32_characters_long_min_change_me',
          JWT_EXPIRES_IN: '15m',
          DATABASE_URL: 'postgresql://localhost:5432/forgex',
          REDIS_URL: 'redis://localhost:6379',
          QDRANT_URL: 'http://localhost:6333',
          STORAGE_PROVIDER: 'local',
          S3_ENDPOINT: '',
          S3_REGION: '',
          S3_ACCESS_KEY_ID: '',
          S3_SECRET_ACCESS_KEY: '',
          S3_BUCKET_NAME: '',
          S3_FORCE_PATH_STYLE: true,
          OLLAMA_BASE_URL: 'http://localhost:11434',
          OLLAMA_DEFAULT_MODEL: 'llama3.2',
          OLLAMA_VISION_MODEL: 'llava',
          CLOUD_AI_API_KEY: '',
          CLOUD_AI_ENDPOINT: '',
          CLOUD_AI_MODEL: '',
          PLANT_SITE_CODE: 'SITE-01',
          WORKER_URL: 'http://localhost:8000',
          AIR_GAPPED_MODE: true,
          RATE_LIMIT_MAX_PER_MINUTE: 120,
          RATE_LIMIT_AI_PER_MINUTE: 30,
          TENANT_QUOTA_QUERIES_MONTHLY: 50000,
          TENANT_QUOTA_STORAGE_BYTES: 107374182400,
          VOICE_WAKE_WORD_ENABLED: false,
          VOICE_WAKE_WORD_PHRASE: '',
          VOICE_WAKE_WORD_ENGINE: 'local',
          VOICE_STT_PROVIDER: 'local',
          VOICE_TTS_PROVIDER: 'local',
          VOICE_MAX_DURATION_SECONDS: 120,
          VOICE_MAX_FILE_SIZE_MB: 15,
          VOICE_SILENCE_TIMEOUT_MS: 1000,
          VOICE_SESSION_IDLE_TIMEOUT_SECONDS: 30,
          VOICE_STRICT_OFFLINE: true,
          SMTP_PORT: 587,
          SMTP_FROM: 'no-reply@forgex.industrial.ai',
          SUPABASE_JWT_SECRET: '',
          SUPABASE_PROJECT_URL: '',
          KEYCLOAK_REALM_URL: '',
          KEYCLOAK_CLIENT_ID: '',
          GOOGLE_CLIENT_ID: '',
          GOOGLE_CLIENT_SECRET: '',
          SMTP_HOST: '',
          SMTP_USER: '',
          SMTP_PASS: '',
          QDRANT_API_KEY: '',
          VOICE_WAKE_WORD_MODEL_PATH: '',
          PICOVOICE_ACCESS_KEY: '',
        });
      }).toThrow(/Enterprise Air-Gap Violation: TELEMETRY_ENABLED must be false/);
    });
  });
});

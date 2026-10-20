import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalStorageAdapter } from '../src/storage/localStorageAdapter.js';
import { IngestionQueue } from '../src/jobs/ingestionQueue.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { LocalDevVisionAdapter } from '../src/ai/localDevVisionAdapter.js';
import { LocalDevInferenceAdapter } from '../src/ai/localDevInferenceAdapter.js';
import { ReciprocalRankFusionReranker } from '../src/ai/reranker.js';
import { RAGQueryEngine } from '../src/services/ragQueryEngine.js';
import type {
  Organization,
  Plant,
  User,
  Document,
  DocumentVersion,
  Machine,
  EmployeeProfile,
} from '@forgex/shared-types';

describe('ForgeX AI — Confidential Knowledge, Evidence-Grounded AI and Machine-Specialist Ticket Routing', () => {
  const jwtSecret = 'test_confidential_knowledge_secret_key_at_least_32_chars';
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let storageAdapter: LocalStorageAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let visionProvider: LocalDevVisionAdapter;
  let generationProvider: LocalDevInferenceAdapter;
  let rerankingProvider: ReciprocalRankFusionReranker;
  let ingestionQueue: IngestionQueue;
  let ragEngine: RAGQueryEngine;
  let app: any;

  // Organizations
  let orgAlpha: Organization;
  let orgBeta: Organization;

  // Plants
  let plantNorth: Plant;
  let plantSouth: Plant;

  // Users (Org Alpha)
  let userAlphaAdmin: User;
  let userAlphaWorker: User;
  let userAlphaTechPrimary: User;
  let userAlphaTechBackup: User;
  let userAlphaTechOther: User;
  let userAlphaEngineer: User;
  let userAlphaPlantManager: User;

  // Users (Org Beta)
  let userBetaAdmin: User;
  let userBetaTech: User;

  // Tokens
  let tokenAlphaAdmin: string;
  let tokenAlphaWorker: string;
  let tokenAlphaTechPrimary: string;
  let tokenAlphaTechBackup: string;
  let tokenAlphaTechOther: string;
  let tokenAlphaEngineer: string;
  let tokenAlphaPlantManager: string;
  let tokenBetaAdmin: string;
  let tokenBetaTech: string;

  // Machines
  let machinePump: Machine;
  let machineBoiler: Machine;

  // Documents
  let confidentialManual: Document;
  let confidentialVersion: DocumentVersion;

  // Employee Profiles
  let profileTechPrimary: EmployeeProfile;
  let profileTechBackup: EmployeeProfile;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    storageAdapter = new LocalStorageAdapter(
      path.join(process.cwd(), 'data', 'test_confidential_storage')
    );
    embeddingAdapter = new LocalDevEmbeddingAdapter();
    visionProvider = new LocalDevVisionAdapter();
    generationProvider = new LocalDevInferenceAdapter();
    rerankingProvider = new ReciprocalRankFusionReranker();

    ingestionQueue = new IngestionQueue(
      dataStore,
      storageAdapter,
      embeddingAdapter,
      vectorStore,
      visionProvider
    );

    ragEngine = new RAGQueryEngine(
      dataStore,
      embeddingAdapter,
      vectorStore,
      generationProvider,
      rerankingProvider
    );

    app = createApp({
      authAdapter,
      dataStore,
      vectorStore,
      storageAdapter,
      embeddingAdapter,
      visionProvider,
      generationProvider,
      rerankingProvider,
      ingestionQueue,
      ragEngine,
    });

    // 1. Create Organizations
    orgAlpha = await dataStore.createOrganization({
      name: 'Apex Petrochemical Refining Ltd',
      slug: 'apex-petro',
    });

    orgBeta = await dataStore.createOrganization({
      name: 'Nova Industrial Utilities LLC',
      slug: 'nova-util',
    });

    // 2. Create Plants
    plantNorth = await dataStore.createPlant(orgAlpha.id, {
      name: 'North Olefins Complex',
      code: 'PLANT-NORTH',
      location: 'Deer Park, TX',
    });

    plantSouth = await dataStore.createPlant(orgAlpha.id, {
      name: 'South Aromatics Unit',
      code: 'PLANT-SOUTH',
      location: 'Freeport, TX',
    });

    // 3. Create Users
    userAlphaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_alpha_admin',
      email: 'admin@apex-petro.com',
      fullName: 'Alice Administrator',
    });

    userAlphaWorker = await dataStore.createUser({
      externalAuthId: 'ext_alpha_worker',
      email: 'worker@apex-petro.com',
      fullName: 'Wayne Worker',
    });

    userAlphaTechPrimary = await dataStore.createUser({
      externalAuthId: 'ext_alpha_tech_primary',
      email: 'specialist.pump@apex-petro.com',
      fullName: 'Patrick Primary (Rotating Specialist)',
    });

    userAlphaTechBackup = await dataStore.createUser({
      externalAuthId: 'ext_alpha_tech_backup',
      email: 'backup.pump@apex-petro.com',
      fullName: 'Brenda Backup (Mechanical Tech)',
    });

    userAlphaTechOther = await dataStore.createUser({
      externalAuthId: 'ext_alpha_tech_other',
      email: 'tech.other@apex-petro.com',
      fullName: 'Oscar Other (Electrical Tech)',
    });

    userAlphaEngineer = await dataStore.createUser({
      externalAuthId: 'ext_alpha_eng',
      email: 'engineer@apex-petro.com',
      fullName: 'Edward Engineer',
    });

    userAlphaPlantManager = await dataStore.createUser({
      externalAuthId: 'ext_alpha_pm',
      email: 'pm@apex-petro.com',
      fullName: 'Pamela PlantManager',
    });

    userBetaAdmin = await dataStore.createUser({
      externalAuthId: 'ext_beta_admin',
      email: 'admin@nova-util.com',
      fullName: 'Bob Beta Admin',
    });

    userBetaTech = await dataStore.createUser({
      externalAuthId: 'ext_beta_tech',
      email: 'tech@nova-util.com',
      fullName: 'Brian Beta Tech',
    });

    // 4. Create Memberships
    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaWorker.id,
      role: 'WORKER',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTechPrimary.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTechBackup.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaTechOther.id,
      role: 'TECHNICIAN',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaEngineer.id,
      role: 'ENGINEER',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgAlpha.id,
      userId: userAlphaPlantManager.id,
      role: 'PLANT_MANAGER',
      assignedPlantIds: [plantNorth.id],
    });

    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaAdmin.id,
      role: 'ORGANIZATION_ADMIN',
    });

    await dataStore.createMembership({
      organizationId: orgBeta.id,
      userId: userBetaTech.id,
      role: 'TECHNICIAN',
    });

    // 5. Generate Auth Tokens
    tokenAlphaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaAdmin.externalAuthId, email: userAlphaAdmin.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaWorker = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaWorker.externalAuthId, email: userAlphaWorker.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaTechPrimary = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTechPrimary.externalAuthId, email: userAlphaTechPrimary.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaTechBackup = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTechBackup.externalAuthId, email: userAlphaTechBackup.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaTechOther = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaTechOther.externalAuthId, email: userAlphaTechOther.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaEngineer = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaEngineer.externalAuthId, email: userAlphaEngineer.email, emailVerified: true },
      jwtSecret
    );
    tokenAlphaPlantManager = LocalDevAuthAdapter.generateDevToken(
      { id: userAlphaPlantManager.externalAuthId, email: userAlphaPlantManager.email, emailVerified: true },
      jwtSecret
    );
    tokenBetaAdmin = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaAdmin.externalAuthId, email: userBetaAdmin.email, emailVerified: true },
      jwtSecret
    );
    tokenBetaTech = LocalDevAuthAdapter.generateDevToken(
      { id: userBetaTech.externalAuthId, email: userBetaTech.email, emailVerified: true },
      jwtSecret
    );

    // 6. Setup Employee Directory Profiles
    profileTechPrimary = await dataStore.createEmployeeProfile(orgAlpha.id, {
      userId: userAlphaTechPrimary.id,
      employeeNumber: 'EMP-ROT-001',
      fullName: userAlphaTechPrimary.fullName,
      email: userAlphaTechPrimary.email,
      role: 'TECHNICIAN',
      department: 'Rotating Equipment Specialist Group',
      assignedPlantIds: [plantNorth.id],
      accountStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      qualificationStatus: 'VERIFIED',
      verifiedSkills: ['API 610 Overhaul', 'Mechanical Seal Flush Plan 53B', 'Vibration Analysis Level II'],
    });

    profileTechBackup = await dataStore.createEmployeeProfile(orgAlpha.id, {
      userId: userAlphaTechBackup.id,
      employeeNumber: 'EMP-MECH-002',
      fullName: userAlphaTechBackup.fullName,
      email: userAlphaTechBackup.email,
      role: 'TECHNICIAN',
      department: 'Mechanical Maintenance Team B',
      assignedPlantIds: [plantNorth.id],
      accountStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      qualificationStatus: 'VERIFIED',
      verifiedSkills: ['Centrifugal Pump Alignment', 'Mechanical Seal Replacement'],
    });

    await dataStore.createEmployeeProfile(orgAlpha.id, {
      userId: userAlphaTechOther.id,
      employeeNumber: 'EMP-ELEC-003',
      fullName: userAlphaTechOther.fullName,
      email: userAlphaTechOther.email,
      role: 'TECHNICIAN',
      department: 'Electrical & Instrumentation',
      assignedPlantIds: [plantNorth.id],
      accountStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      qualificationStatus: 'VERIFIED',
      verifiedSkills: ['Medium Voltage Switchgear', 'VFD Calibration'],
    });

    // 7. Register Industrial Machines
    machinePump = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantNorth.id,
      assetTag: 'PUMP-204-B',
      name: 'Crude Booster Centrifugal Pump',
      machineType: 'Centrifugal Pump (API 610 OH2)',
      area: 'Olefins Cracking Unit 2',
      manufacturer: 'Sulzer Flow Solutions',
      modelNumber: 'OH2-150-400',
      serialNumber: 'SLZ-2023-8841-B',
      operationalState: 'OPTIMAL',
      criticality: 'CRITICAL',
      dataClassification: 'RESTRICTED_CONFIDENTIAL',
    });

    machineBoiler = await dataStore.createMachine(orgAlpha.id, {
      plantId: plantNorth.id,
      assetTag: 'BOILER-101',
      name: 'High Pressure Steam Boiler',
      machineType: 'Industrial Water Tube Boiler',
      area: 'Utilities & Steam Generation',
      operationalState: 'OPTIMAL',
      criticality: 'HIGH',
      dataClassification: 'INTERNAL',
    });

    // 8. Configure Machine-to-Specialist Mapping for PUMP-204-B
    await dataStore.setMachineSpecialistMapping(orgAlpha.id, {
      machineId: machinePump.id,
      plantId: plantNorth.id,
      primarySpecialistUserId: userAlphaTechPrimary.id,
      primarySpecialistName: profileTechPrimary.fullName,
      backupSpecialistUserIds: [userAlphaTechBackup.id],
      requiredCertifications: ['Vibration Analysis Level II'],
      escalationTimeoutMinutes: 60,
      escalationRole: 'ENGINEER',
      assignedByUserId: userAlphaAdmin.id,
    });

    // 9. Store Confidential Manual and SOP in Storage & DataStore
    confidentialManual = await dataStore.createDocument({
      organizationId: orgAlpha.id,
      plantId: plantNorth.id,
      documentNumber: 'CONF-SOP-PUMP-204',
      title: 'Confidential Proprietary Overhaul Manual — Sulzer OH2 PUMP-204-B',
      category: 'SOP',
      dataClassification: 'RESTRICTED_CONFIDENTIAL',
    });

    // Write file to storage
    const storageKey = `org_${orgAlpha.id}/docs/CONF-SOP-PUMP-204.pdf`;
    await storageAdapter.putObject(
      storageKey,
      Buffer.from('%PDF-1.4 Proprietary confidential pump internal engineering drawings and clearances.'),
      'application/pdf'
    );

    confidentialVersion = await dataStore.createDocumentVersion({
      documentId: confidentialManual.id,
      versionNumber: 1,
      storageKey,
      filename: 'CONF-SOP-PUMP-204.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 1024,
      checksumSha256: 'sha256-abcdef0123456789',
      status: 'READY',
    });
  });

  // ==========================================================================
  // 1 & 2: STRICT CONFIDENTIALITY FOR MANUALS AND SOPS
  // ==========================================================================
  describe('A. Strict Confidentiality for Manuals and SOPs', () => {
    it('1. Only authorized administrators can browse, preview, and download original manuals and SOPs', async () => {
      // Admin CAN list documents
      const listResAdmin = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);
      expect(listResAdmin.status).toBe(200);
      expect(listResAdmin.body.success).toBe(true);

      // Admin CAN view document details
      const getResAdmin = await request(app)
        .get(`/api/v1/documents/${confidentialManual.id}`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);
      expect(getResAdmin.status).toBe(200);

      // Admin CAN download original file
      const downloadResAdmin = await request(app)
        .get(`/api/v1/documents/${confidentialManual.id}/download`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);
      expect(downloadResAdmin.status).toBe(200);
      expect(downloadResAdmin.headers['content-type']).toContain('application/pdf');

      // Verify audit event recorded for administrative download
      const audits = await dataStore.listAuditEvents(orgAlpha.id);
      const downloadAudit = audits.find((a) => a.action === 'CONFIDENTIAL_DOCUMENT_DOWNLOADED');
      expect(downloadAudit).toBeDefined();
      expect(downloadAudit?.resourceId).toBe(confidentialManual.id);
    });

    it('2. Workers, Technicians, Engineers and Plant Managers are strictly denied direct document access on the server and storage layer', async () => {
      const nonAdminTokens = [
        { role: 'WORKER', token: tokenAlphaWorker },
        { role: 'TECHNICIAN', token: tokenAlphaTechPrimary },
        { role: 'ENGINEER', token: tokenAlphaEngineer },
        { role: 'PLANT_MANAGER', token: tokenAlphaPlantManager },
      ];

      for (const { role, token } of nonAdminTokens) {
        // Direct list denied
        const listRes = await request(app)
          .get('/api/v1/documents')
          .set('Authorization', `Bearer ${token}`);
        expect(listRes.status, `${role} should be denied listing documents`).toBe(403);
        expect(listRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

        // Direct details denied
        const getRes = await request(app)
          .get(`/api/v1/documents/${confidentialManual.id}`)
          .set('Authorization', `Bearer ${token}`);
        expect(getRes.status, `${role} should be denied viewing document details`).toBe(403);
        expect(getRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

        // Direct download denied
        const dlRes = await request(app)
          .get(`/api/v1/documents/${confidentialManual.id}/download`)
          .set('Authorization', `Bearer ${token}`);
        expect(dlRes.status, `${role} should be denied downloading document`).toBe(403);
        expect(dlRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

        // Pages preview denied
        const pagesRes = await request(app)
          .get(`/api/v1/documents/${confidentialManual.id}/pages`)
          .set('Authorization', `Bearer ${token}`);
        expect(pagesRes.status, `${role} should be denied viewing document pages`).toBe(403);
        expect(pagesRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
      }
    });

    it('3. Direct document access does not leak internal storage keys or paths to unauthorized users', async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${confidentialManual.id}/download`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`);

      expect(res.status).toBe(403);
      // Response must not contain the raw storage key
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain(confidentialVersion.storageKey);
      expect(bodyStr).not.toContain('org_');
    });
  });

  // ==========================================================================
  // B & C: EVIDENCE-GROUNDED AI PIPELINE & CITATION SANITIZATION
  // ==========================================================================
  describe('B & C. Evidence-Grounded AI Pipeline & Confidential Citation Sanitization', () => {
    it('4. Queries with insufficient evidence trigger automatic ticket creation without hallucinating facts', async () => {
      // Non-admin technician asks an ungrounded question about PUMP-204-B
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({
          query: 'What is the exact mechanical seal spring compression distance for PUMP-204-B?',
          plantId: plantNorth.id,
          machineId: machinePump.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.isInsufficientEvidence).toBe(true);
      expect(data.answer).toMatch(/insufficient evidence/i);
      expect(data.citations.length).toBe(0);

      // Verify ticket was automatically created
      expect(data.ticket).toBeDefined();
      expect(data.ticket.ticketNumber).toMatch(/^TICK-\d{4}-\d{4}$/);
      expect(data.ticket.machineId).toBe(machinePump.id);
      expect(data.ticket.escalationReason).toBe('INSUFFICIENT_EVIDENCE');
      expect(data.ticket.status).toBe('OPEN');
    });

    it('5. Safety-critical inquiries trigger immediate safety escalation ticket creation', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenAlphaWorker}`)
        .send({
          query: 'Can I bypass the emergency shutdown LOTO interlock on PUMP-204-B during full operation?',
          plantId: plantNorth.id,
          machineId: machinePump.id,
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.isInsufficientEvidence).toBe(true);
      expect(data.answer).toContain('[SAFETY ESCALATION]');
      expect(data.ticket).toBeDefined();
      expect(data.ticket.severity).toBe('CRITICAL');
      expect(data.ticket.escalationReason).toBe('SAFETY_CRITICAL');
    });

    it('6. Citations for non-admins sanitize confidential internal storage keys into approved references', async () => {
      // Seed an authorized chunk into the vector store
      const [chunk] = await dataStore.saveKnowledgeChunks([
        {
          documentVersionId: confidentialVersion.id,
          pageNumber: 5,
          chunkIndex: 0,
          qdrantPointId: '00000000-0000-4000-8000-000000000005',
          content: 'The normal operating suction pressure for Sulzer PUMP-204-B is 4.5 bar gauge.',
          sectionHeading: 'SECTION 4: OPERATING LIMITS',
          extractionMethod: 'NATIVE_TEXT',
          tokenCount: 20,
        },
      ]);

      await dataStore.saveDocumentPages([
        {
          documentVersionId: confidentialVersion.id,
          pageNumber: 5,
          rawText: 'The normal operating suction pressure for Sulzer PUMP-204-B is 4.5 bar gauge.',
          extractionMethod: 'NATIVE_TEXT',
        },
      ]);

      const collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge';
      const vector = await embeddingAdapter.generateEmbedding(chunk.content);
      await vectorStore.ensureCollection(collectionName, embeddingAdapter.getDimensions());
      await vectorStore.upsertPoints(collectionName, [
        {
          id: chunk.id,
          vector,
          payload: {
            organizationId: orgAlpha.id,
            plantId: plantNorth.id,
            documentId: confidentialManual.id,
            documentVersionId: confidentialVersion.id,
            pageNumber: 5,
            chunkId: chunk.id,
            content: chunk.content,
            sectionHeading: chunk.sectionHeading,
            isTable: false,
            isFigure: false,
            extractionMethod: 'NATIVE_TEXT',
            dataClassification: 'RESTRICTED_CONFIDENTIAL',
          },
        },
      ]);

      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({
          query: 'What is the suction pressure for Sulzer PUMP-204-B?',
          plantId: plantNorth.id,
          machineId: machinePump.id,
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      if (data.citations && data.citations.length > 0) {
        // Non-admin citations must not contain raw storage keys or confidential excerpts
        for (const citation of data.citations) {
          expect(citation.snippet).not.toContain(confidentialVersion.storageKey);
          expect(citation.snippet).toContain('Reference:');
        }
      }
    });
  });

  // ==========================================================================
  // D. EMPLOYEE AND TECHNICIAN DIRECTORY
  // ==========================================================================
  describe('D. Employee and Technician Directory', () => {
    it('7. Directory supports admin listing and filtering by role, status, and plant', async () => {
      const res = await request(app)
        .get('/api/v1/employees?role=TECHNICIAN')
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.every((p: EmployeeProfile) => p.role === 'TECHNICIAN')).toBe(true);
    });

    it('8. Least-privilege: Employees are strictly prohibited from promoting themselves or editing verified qualifications', async () => {
      // TechPrimary attempts to promote themselves to ORGANIZATION_ADMIN
      const resRole = await request(app)
        .patch(`/api/v1/employees/${profileTechPrimary.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({ role: 'ORGANIZATION_ADMIN' });

      expect(resRole.status).toBe(403);
      expect(resRole.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

      // TechPrimary attempts to modify verified skills
      const resSkills = await request(app)
        .patch(`/api/v1/employees/${profileTechPrimary.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({ verifiedSkills: ['Nuclear Turbine Master', 'Lead Architect'] });

      expect(resSkills.status).toBe(403);
      expect(resSkills.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');

      // Admin CAN legitimately update employee verified skills
      const resAdmin = await request(app)
        .patch(`/api/v1/employees/${profileTechPrimary.id}`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
        .send({ verifiedSkills: ['API 610 Overhaul', 'Certified Master Inspector'] });

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.data.verifiedSkills).toContain('Certified Master Inspector');
    });
  });

  // ==========================================================================
  // E. MACHINE-TO-SPECIALIST MAPPING
  // ==========================================================================
  describe('E. Machine-to-Specialist Mapping', () => {
    it('9. Machine mapping validates that assigned specialist is active and authorized for the plant', async () => {
      // Suspend an employee
      const suspendedUser = await dataStore.createUser({
        externalAuthId: 'ext_suspended_tech',
        email: 'suspended@apex-petro.com',
        fullName: 'Sam Suspended',
      });
      await dataStore.createMembership({
        organizationId: orgAlpha.id,
        userId: suspendedUser.id,
        role: 'TECHNICIAN',
      });
      const suspendedProfile = await dataStore.createEmployeeProfile(orgAlpha.id, {
        userId: suspendedUser.id,
        employeeNumber: 'EMP-SUSP-999',
        fullName: suspendedUser.fullName,
        email: suspendedUser.email,
        role: 'TECHNICIAN',
        assignedPlantIds: [plantNorth.id],
        accountStatus: 'SUSPENDED',
      });

      // Admin attempts to assign suspended tech as machine specialist -> rejected
      const res = await request(app)
        .post(`/api/v1/machines/${machinePump.id}/specialist`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
        .send({
          primarySpecialistUserId: suspendedProfile.userId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Only ACTIVE specialists may be assigned');
    });

    it('10. Unassigned machines report UNASSIGNED status explicitly and appear in the admin unassigned queue', async () => {
      // Boiler-101 has no specialist configured
      const resMapping = await request(app)
        .get(`/api/v1/machines/${machineBoiler.id}/specialist`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

      expect(resMapping.status).toBe(200);
      expect(resMapping.body.data.assignmentStatus).toBe('UNASSIGNED');

      // Admin unassigned queue includes BOILER-101
      const resQueue = await request(app)
        .get('/api/v1/specialists/unassigned')
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

      expect(resQueue.status).toBe(200);
      const unassignedIds = resQueue.body.data.map((m: Machine) => m.id);
      expect(unassignedIds).toContain(machineBoiler.id);
      expect(unassignedIds).not.toContain(machinePump.id); // pump is mapped
    });
  });

  // ==========================================================================
  // F. AUTOMATIC TICKET CREATION AND ROUTING
  // ==========================================================================
  describe('F. Automatic Ticket Creation and Routing', () => {
    it('11. Automatically routes ticket to configured primary specialist when available', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenAlphaWorker}`)
        .send({
          query: 'What is the clearance setting on the impeller wear ring for PUMP-204-B?',
          plantId: plantNorth.id,
          machineId: machinePump.id,
        });

      expect(res.status).toBe(200);
      const ticket = res.body.data.ticket;
      expect(ticket).toBeDefined();
      expect(ticket.assignedSpecialistUserId).toBe(userAlphaTechPrimary.id);
      expect(ticket.assignmentStatus).toBe('ASSIGNED_PRIMARY');
      expect(ticket.assignedSpecialistName).toBe(profileTechPrimary.fullName);
    });

    it('12. When primary specialist is unavailable (ON_LEAVE), fails over to backup specialist', async () => {
      // Set primary specialist to ON_LEAVE
      await dataStore.updateEmployeeProfile(orgAlpha.id, profileTechPrimary.id, {
        availabilityStatus: 'ON_LEAVE',
      });

      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenAlphaWorker}`)
        .send({
          query: 'What is the impeller balance grade for PUMP-204-B?',
          plantId: plantNorth.id,
          machineId: machinePump.id,
        });

      expect(res.status).toBe(200);
      const ticket = res.body.data.ticket;
      expect(ticket).toBeDefined();
      // Primary is on leave, so routes to backup specialist!
      expect(ticket.assignedSpecialistUserId).toBe(userAlphaTechBackup.id);
      expect(ticket.assignmentStatus).toBe('ASSIGNED_BACKUP');
      expect(ticket.assignedSpecialistName).toBe(profileTechBackup.fullName);
    });

    it('13. When machine has no configured specialist, generates visible assignment-required state', async () => {
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', `Bearer ${tokenAlphaWorker}`)
        .send({
          query: 'What is the burner flue gas temperature threshold for BOILER-101?',
          plantId: plantNorth.id,
          machineId: machineBoiler.id,
        });

      expect(res.status).toBe(200);
      const ticket = res.body.data.ticket;
      expect(ticket).toBeDefined();
      expect(ticket.assignedSpecialistUserId).toBeNull();
      expect(ticket.assignmentStatus).toBe('NEEDS_SPECIALIST_ASSIGNMENT');
    });
  });

  // ==========================================================================
  // G. TECHNICIAN WORKFLOW & KNOWLEDGE PROMOTION
  // ==========================================================================
  describe('G. Technician Workflow & Knowledge Promotion', () => {
    let testTicket: any;

    beforeEach(async () => {
      // Ensure primary specialist is available
      await dataStore.updateEmployeeProfile(orgAlpha.id, profileTechPrimary.id, {
        availabilityStatus: 'AVAILABLE',
      });

      testTicket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantNorth.id,
        machineId: machinePump.id,
        machineAssetTag: machinePump.assetTag,
        reportedByUserId: userAlphaWorker.id,
        originalQuestion: 'Mechanical seal flush leakage detected on PUMP-204-B outboard seal.',
        diagnosticDetails: 'Intermittent barrier fluid pressure drop below 4 bar.',
        escalationReason: 'INSUFFICIENT_EVIDENCE',
        severity: 'HIGH',
        assignedSpecialistUserId: userAlphaTechPrimary.id,
        assignedSpecialistName: profileTechPrimary.fullName,
        assignmentStatus: 'ASSIGNED_PRIMARY',
        status: 'OPEN',
      });
    });

    it('14. Technicians can view and update their own assigned tickets, but cannot view unrelated tickets', async () => {
      // Primary tech CAN view their ticket
      const viewRes = await request(app)
        .get(`/api/v1/tickets/${testTicket.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`);
      expect(viewRes.status).toBe(200);
      expect(viewRes.body.data.id).toBe(testTicket.id);

      // Other technician CANNOT view this ticket
      const deniedRes = await request(app)
        .get(`/api/v1/tickets/${testTicket.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTechOther}`);
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('15. Technicians cannot reassign tickets to other specialists', async () => {
      const res = await request(app)
        .patch(`/api/v1/tickets/${testTicket.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({
          assignedSpecialistUserId: userAlphaTechOther.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORGEX_RBAC_FORBIDDEN');
    });

    it('16. Technician records diagnostic outcome and proposed knowledge update; requires admin approval', async () => {
      // Technician records repair outcome and proposes knowledge update
      const updateRes = await request(app)
        .patch(`/api/v1/tickets/${testTicket.id}`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({
          status: 'RESOLVED',
          diagnosisOutcome: 'Damaged carbon seal face due to thermal shock.',
          repairOutcome: 'Replaced Plan 53B seal cartridge and re-pressurized accumulator to 12 bar.',
          proposedKnowledgeUpdate: 'Ensure Plan 53B nitrogen pre-charge is checked every 30 operating days.',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('RESOLVED');
      expect(updateRes.body.data.knowledgeUpdateStatus).toBe('PENDING_ADMIN_REVIEW');

      // Technician CANNOT approve their own proposed knowledge update
      const techApproveRes = await request(app)
        .post(`/api/v1/tickets/${testTicket.id}/approve-knowledge`)
        .set('Authorization', `Bearer ${tokenAlphaTechPrimary}`)
        .send({ status: 'APPROVED' });
      expect(techApproveRes.status).toBe(403);

      // Administrator CAN review and approve proposed knowledge update
      const adminApproveRes = await request(app)
        .post(`/api/v1/tickets/${testTicket.id}/approve-knowledge`)
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`)
        .send({ status: 'APPROVED', reviewNotes: 'Verified against Sulzer engineering bulletin.' });

      expect(adminApproveRes.status).toBe(200);
      expect(adminApproveRes.body.data.knowledgeUpdateStatus).toBe('APPROVED_PROMOTED');
    });
  });

  // ==========================================================================
  // H. ADMIN OVERSIGHT & MULTI-TENANCY BOUNDARIES
  // ==========================================================================
  describe('H. Admin Oversight & Multi-Tenancy Isolation', () => {
    it('17. Admin oversight endpoint provides operational counts across unassigned, escalated, and specialist workloads', async () => {
      const res = await request(app)
        .get('/api/v1/tickets/oversight')
        .set('Authorization', `Bearer ${tokenAlphaAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const summary = res.body.data;
      expect(summary).toHaveProperty('openTickets');
      expect(summary).toHaveProperty('totalTickets');
      expect(summary).toHaveProperty('unassignedTickets');
      expect(summary).toHaveProperty('escalatedTickets');
      expect(summary).toHaveProperty('specialistWorkloads');
      expect(typeof summary.specialistWorkloads).toBe('object');
    });

    it('18. Cross-organization isolation prevents Beta users from viewing Alpha tickets or employee records', async () => {
      // Beta Admin attempts to access Alpha employee directory
      const empRes = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${tokenBetaAdmin}`);
      expect(empRes.status).toBe(200);
      // Beta org has 0 employee profiles
      expect(empRes.body.data.length).toBe(0);

      // Create an Alpha ticket
      const alphaTicket = await dataStore.createSpecialistTicket(orgAlpha.id, {
        plantId: plantNorth.id,
        originalQuestion: 'Confidential Alpha vibration check',
        escalationReason: 'INSUFFICIENT_EVIDENCE',
      });

      // Beta Admin attempts to get Alpha ticket
      const ticketRes = await request(app)
        .get(`/api/v1/tickets/${alphaTicket.id}`)
        .set('Authorization', `Bearer ${tokenBetaAdmin}`);
      expect(ticketRes.status).toBe(404); // Isolated by orgId -> not found
    });
  });
});

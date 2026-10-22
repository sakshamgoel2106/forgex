import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryDataStore } from '../src/db/inMemoryDataStore.js';
import { InMemoryVectorStoreAdapter } from '../src/vector/inMemoryVectorStoreAdapter.js';
import { LocalDevEmbeddingAdapter } from '../src/embeddings/localDevEmbeddingAdapter.js';
import { MachineRecoveryService } from '../src/services/machineRecovery.service.js';
import { LocalDevAuthAdapter } from '../src/auth/localDevAuthAdapter.js';
import { SecurityEventService } from '../src/services/securityEvent.service.js';

describe('Expert Knowledge Repository & Frontline Multi-Note Submissions', () => {
  const jwtSecret = 'test_expert_knowledge_secret_key_2026_at_least_32_chars';
  let app: any;
  let dataStore: InMemoryDataStore;
  let authAdapter: LocalDevAuthAdapter;
  let vectorStore: InMemoryVectorStoreAdapter;
  let embeddingAdapter: LocalDevEmbeddingAdapter;
  let orgId: string;
  let plantId: string;
  let adminToken: string;
  let technicianToken: string;
  let otherTechToken: string;
  let adminUser: any;
  let techUser: any;
  let otherTechUser: any;

  beforeEach(async () => {
    dataStore = new InMemoryDataStore();
    authAdapter = new LocalDevAuthAdapter(jwtSecret);
    vectorStore = new InMemoryVectorStoreAdapter();
    embeddingAdapter = new LocalDevEmbeddingAdapter(128);

    const org = await dataStore.createOrganization({
      name: 'Forge Heavy Industries',
      industryCategory: 'Machining & Fabrication',
      subscriptionTier: 'ENTERPRISE',
      country: 'USA',
    });
    orgId = org.id;

    const plant = await dataStore.createPlant(orgId, {
      code: 'PLANT-TX-01',
      name: 'Austin Heavy Machining',
      country: 'USA',
    });
    plantId = plant.id;

    adminUser = await dataStore.createUser({
      externalAuthId: 'auth_admin_01',
      email: 'admin@forgex.io',
      fullName: 'Chief Reliability Officer',
    });
    await dataStore.createMembership({
      organizationId: orgId,
      userId: adminUser.id,
      role: 'ORGANIZATION_ADMIN',
    });

    techUser = await dataStore.createUser({
      externalAuthId: 'auth_tech_01',
      email: 'senior.tech@forgex.io',
      fullName: 'Vikrant Senior Tech',
    });
    await dataStore.createMembership({
      organizationId: orgId,
      userId: techUser.id,
      role: 'FIELD_TECHNICIAN',
    });

    otherTechUser = await dataStore.createUser({
      externalAuthId: 'auth_other_tech_01',
      email: 'junior.tech@forgex.io',
      fullName: 'Junior Operator',
    });
    await dataStore.createMembership({
      organizationId: orgId,
      userId: otherTechUser.id,
      role: 'FIELD_TECHNICIAN',
    });

    adminToken = LocalDevAuthAdapter.generateDevToken(
      { id: adminUser.externalAuthId, email: adminUser.email, emailVerified: true },
      jwtSecret
    );

    technicianToken = LocalDevAuthAdapter.generateDevToken(
      { id: techUser.externalAuthId, email: techUser.email, emailVerified: true },
      jwtSecret
    );

    otherTechToken = LocalDevAuthAdapter.generateDevToken(
      { id: otherTechUser.externalAuthId, email: otherTechUser.email, emailVerified: true },
      jwtSecret
    );

    const secService = new SecurityEventService(dataStore);
    const recoveryService = new MachineRecoveryService(dataStore, secService);

    app = createApp({
      dataStore,
      authAdapter,
      vectorStore,
      embeddingAdapter,
      recoveryService,
    });
  });

  it('submits multiple notes in a single batch with practical metadata and indexes them into vector store', async () => {
    const res = await request(app)
      .post('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        notes: [
          {
            title: 'Cold Weather Hydraulic Suction Cavitation Pre-Warm Hack',
            assetTag: 'PUMP-204-B, COMP-101',
            taskDuringIssue: 'Routine Startup',
            observedAt: '2026-10-22T08:30:00.000Z',
            category: 'Startup / Shutdown',
            severity: 'Critical Machine Warning',
            symptom: 'Cold startup below 0°C, abnormal seal chatter or audible pinging in manifold',
            description: 'Run auxiliary recirc pump for 12 minutes before engaging main pump to ensure viscosity drops below 46 cSt.',
            plantId,
          },
          {
            title: 'Spindle Toolholder Micro-Fretting Anti-Seize Tip',
            assetTag: 'MILL-501',
            taskDuringIssue: 'Tooling Overhaul',
            observedAt: '2026-10-22T09:15:00.000Z',
            category: 'Tooling Hack',
            severity: 'Time-Saver Hack',
            symptom: 'Fretting corrosion ring on HSK-63A taper after heavy titanium roughing',
            description: 'Apply ultra-thin molybdenum film to taper contact contact shoulder every 80 hours.',
            plantId,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);

    const note1 = res.body.data[0];
    expect(note1.title).toContain('Cold Weather Hydraulic');
    expect(note1.category).toBe('Startup / Shutdown');
    expect(note1.severity).toBe('Critical Machine Warning');
    expect(note1.symptom).toContain('Cold startup below 0°C');
    expect(note1.taskDuringIssue).toBe('Routine Startup');
    expect(note1.observedAt).toBe('2026-10-22T08:30:00.000Z');
    expect(note1.machineAssetTags).toContain('PUMP-204-B');
    expect(note1.machineAssetTags).toContain('COMP-101');
    expect(note1.authorName).toBe('Vikrant Senior Tech');
    expect(note1.upvotes).toBe(0);

    // Vector search check in vectorStore
    const hits = await vectorStore.search(
      'forgex_knowledge',
      await embeddingAdapter.generateEmbedding('Cold weather cavitation hydraulic pump'),
      { organizationId: orgId, plantId }
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect((hits[0].payload as any).type).toBe('EXPERT_KNOWLEDGE');
  });

  it('increments upvotes in real-time via POST /api/v1/recovery/expert-library/:id/upvote', async () => {
    // 1. Create a note
    const createRes = await request(app)
      .post('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        title: 'Bypass purge valve seating trick',
        category: 'Troubleshooting Trick',
        severity: 'Pro-Tip / Best Practice',
        description: 'Tap gently with brass drift before torquing bonnet bolts.',
        plantId,
      });

    const noteId = createRes.body.data.id;
    expect(createRes.body.data.upvotes).toBe(0);

    // 2. Upvote note
    const upvoteRes = await request(app)
      .post(`/api/v1/recovery/expert-library/${noteId}/upvote`)
      .set('Authorization', `Bearer ${otherTechToken}`);

    expect(upvoteRes.status).toBe(200);
    expect(upvoteRes.body.data.upvotes).toBe(1);

    // 3. Upvote again
    const upvote2 = await request(app)
      .patch(`/api/v1/recovery/expert-library/${noteId}/upvote`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(upvote2.status).toBe(200);
    expect(upvote2.body.data.upvotes).toBe(2);
  });

  it('allows original author or admin to delete a note, and forbids unauthorized users', async () => {
    // 1. Create note as techUser
    const createRes = await request(app)
      .post('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        title: 'Safety lock out sequence shortcut',
        category: 'Safety & LOTO',
        severity: 'Safety Hazard',
        description: 'Never bypass primary interlock switch even during calibration.',
        plantId,
      });

    const noteId = createRes.body.data.id;

    // 2. otherTech tries to delete -> 403 Forbidden
    const unauthDelete = await request(app)
      .delete(`/api/v1/recovery/expert-library/${noteId}`)
      .set('Authorization', `Bearer ${otherTechToken}`);

    expect(unauthDelete.status).toBe(403);

    // 3. Author deletes note -> 200 OK
    const authorDelete = await request(app)
      .delete(`/api/v1/recovery/expert-library/${noteId}`)
      .set('Authorization', `Bearer ${technicianToken}`);

    expect(authorDelete.status).toBe(200);
    expect(authorDelete.body.success).toBe(true);

    // Verify it is gone from GET
    const getRes = await request(app)
      .get(`/api/v1/recovery/expert-library/${noteId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(404);
  });

  it('allows workers to submit reviews, star ratings, and outcomes on expert notes', async () => {
    // 1. Create note
    const createRes = await request(app)
      .post('/api/v1/recovery/expert-library')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        title: 'Impeller seal pre-lube tip',
        category: 'Reliability',
        description: 'Apply high-viscosity synthetic lubricant prior to gland torquing.',
        machineAssetTag: 'PUMP-204-B',
        plantId,
      });

    expect(createRes.status).toBe(201);
    const noteId = createRes.body.data.id;
    expect(createRes.body.data.aiSupplementalInsight).toBeTruthy();

    // 2. Submit worker review
    const reviewRes = await request(app)
      .post(`/api/v1/recovery/expert-library/${noteId}/reviews`)
      .set('Authorization', `Bearer ${otherTechToken}`)
      .send({
        rating: 5,
        outcome: 'WORKED_IN_FIELD',
        comment: 'Tested on Shift B, reduced vibration immediately.',
      });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.success).toBe(true);
    expect(reviewRes.body.data.reviews).toHaveLength(1);
    expect(reviewRes.body.data.reviews[0].comment).toBe('Tested on Shift B, reduced vibration immediately.');
    expect(reviewRes.body.data.reviews[0].rating).toBe(5);
    expect(reviewRes.body.data.reviews[0].outcome).toBe('WORKED_IN_FIELD');
    expect(reviewRes.body.data.averageRating).toBe(5.0);
    expect(reviewRes.body.data.reviewCount).toBe(1);

    // 3. Submit second review with 4 stars
    const review2Res = await request(app)
      .post(`/api/v1/recovery/expert-library/${noteId}/reviews`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rating: 4,
        outcome: 'NEEDS_MODIFICATION',
        comment: 'Requires slightly lower torque for older housings.',
      });

    expect(review2Res.status).toBe(201);
    expect(review2Res.body.data.reviews).toHaveLength(2);
    expect(review2Res.body.data.averageRating).toBe(4.5);
    expect(review2Res.body.data.reviewCount).toBe(2);
  });
});

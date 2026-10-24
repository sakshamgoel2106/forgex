import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDataStore } from '../db/dataStoreFactory.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface TestResult {
  step: string;
  name: string;
  passed: boolean;
  details: string;
}

async function runAutonomousVerification() {
  const results: TestResult[] = [];
  logger.info('🧪 Starting Autonomous Start-to-End Verification Suite...');

  // 1. Connect DataStore (uses PostgreSQL via PgDataStore)
  const { dataStore, pool } = await createDataStore(config);
  const app = createApp({ dataStore });

  try {
    // 2. Identify Primary User & Organization in DB
    const targetEmail = 'saksham1224151@jmit.ac.in';
    const primaryUser = await dataStore.getUserByEmail(targetEmail);
    if (!primaryUser) {
      throw new Error(`Primary user ${targetEmail} not found in database.`);
    }

    const org = await dataStore.getOrganizationBySlug('jmk-tiles-modernized') ||
      await dataStore.getOrganizationBySlug('jmk-tiles');
    if (!org) {
      throw new Error('Organization JMK Tiles Modernized not found in database.');
    }

    const plants = await dataStore.listPlants(org.id);
    if (plants.length === 0) {
      throw new Error('No plants found for organization.');
    }
    const plant = plants[0];

    // Mint valid JWT for Saksham Goel
    const token = jwt.sign(
      {
        sub: primaryUser.id,
        email: primaryUser.email,
        name: primaryUser.fullName,
        role: 'ORGANIZATION_OWNER',
      },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Ensure conversations are fresh for test suite
    if (pool) {
      await pool.query('TRUNCATE TABLE messages, citations, conversations RESTART IDENTITY CASCADE;');
    }

    const authHeader = `Bearer ${token}`;

    console.log(`\n======================================================`);
    console.log(`🔐 Authenticated Session Initialized`);
    console.log(`   User: ${primaryUser.fullName} (${primaryUser.email})`);
    console.log(`   Org: ${org.name} (${org.id})`);
    console.log(`   Plant: ${plant.name} (${plant.code})`);
    console.log(`======================================================\n`);

    // ------------------------------------------------------------------------
    // TEST 1: GET /api/v1/assets -> Exactly 4 clean industrial machines
    // ------------------------------------------------------------------------
    {
      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id);

      const passed =
        res.status === 200 &&
        res.body.success === true &&
        Array.isArray(res.body.data) &&
        res.body.data.length === 4;

      const tags = (res.body.data || []).map((a: any) => a.assetTag);
      const expectedTags = ['PUMP-001', 'COMP-002', 'KILN-001', 'PRESS-004'];
      const hasAllTags = expectedTags.every((t) => tags.includes(t));

      results.push({
        step: 'Test 1',
        name: 'GET /api/v1/assets (4 Clean Industrial Assets)',
        passed: passed && hasAllTags,
        details: `Returned ${res.body.data?.length || 0} assets: [${tags.join(', ')}]. Expected: [${expectedTags.join(', ')}]`,
      });
    }

    // ------------------------------------------------------------------------
    // TEST 2: GET /api/v1/copilot/conversations -> Initially 0 threads
    // ------------------------------------------------------------------------
    {
      const res = await request(app)
        .get('/api/v1/copilot/conversations')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id);

      const count = Array.isArray(res.body.data) ? res.body.data.length : -1;
      const passed = res.status === 200 && res.body.success === true && count === 0;

      results.push({
        step: 'Test 2',
        name: 'GET /api/v1/copilot/conversations (0 Threads Initially)',
        passed,
        details: `Returned ${count} conversations. Welcome state clean: ${passed}`,
      });
    }

    // Retrieve PUMP-001 machine ID for copilot queries
    const assets = (await dataStore.listAssets(org.id, plant.id)) || [];
    const pumpAsset = assets.find((a) => a.assetTag === 'PUMP-001');
    if (!pumpAsset) {
      throw new Error('PUMP-001 not found among registered assets.');
    }

    let conversationIdA: string = '';
    let responseTextA: string = '';

    // ------------------------------------------------------------------------
    // TEST 3: POST /api/v1/copilot/query (Test Case A: Preventive Maintenance & Spare Parts)
    // ------------------------------------------------------------------------
    {
      const queryTextA = 'What is the preventive maintenance schedule and spare parts list for PUMP-001?';
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id)
        .send({
          query: queryTextA,
          plantId: plant.id,
          machineId: pumpAsset.id,
          assetId: pumpAsset.id,
          assetTag: 'PUMP-001',
          language: 'en-US',
        });

      const data = res.body?.data;
      conversationIdA = data?.conversationId || '';
      responseTextA = data?.assistantMessage?.content || '';

      const mentionsPm =
        /preventive|maintenance|schedule|daily|3000|overhaul|inspection/i.test(responseTextA);
      const mentionsParts =
        /spare\s*parts|seal|bearing|skf|o-ring|sleeve/i.test(responseTextA);
      const hasStaticFallback =
        /Gradually re-open the on\/off valve/i.test(responseTextA);

      const passed =
        res.status === 200 &&
        res.body.success === true &&
        Boolean(conversationIdA) &&
        (mentionsPm || mentionsParts) &&
        !hasStaticFallback;

      results.push({
        step: 'Test 3',
        name: 'POST /api/v1/copilot/query (Test Case A: PM Schedule & Spare Parts)',
        passed,
        details: `Status ${res.status}. Mentions PM: ${mentionsPm}, Mentions Parts: ${mentionsParts}, Static Fallback Avoided: ${!hasStaticFallback}. Preview: "${responseTextA.slice(0, 100)}..."`,
      });
    }

    // ------------------------------------------------------------------------
    // TEST 4: POST /api/v1/copilot/query (Test Case B: Bolt Torques & Cavitation)
    // ------------------------------------------------------------------------
    let responseTextB: string = '';
    {
      const queryTextB = 'What are the bolt torque values and cavitation symptoms for PUMP-001?';
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id)
        .send({
          query: queryTextB,
          plantId: plant.id,
          machineId: pumpAsset.id,
          assetId: pumpAsset.id,
          assetTag: 'PUMP-001',
          conversationId: conversationIdA, // continuation in same thread
          language: 'en-US',
        });

      const data = res.body?.data;
      responseTextB = data?.assistantMessage?.content || '';

      const mentionsTorque =
        /45\s*Nm|75\s*Nm|12\s*Nm|torque|tightening/i.test(responseTextB);
      const mentionsCavitation =
        /cavitation|npsh|acoustic|rattle|1\.8|2\.5\s*kHz/i.test(responseTextB);
      const isDistinctFromA =
        responseTextA !== responseTextB && responseTextB.length > 30;

      const passed =
        res.status === 200 &&
        res.body.success === true &&
        (mentionsTorque || mentionsCavitation) &&
        isDistinctFromA;

      results.push({
        step: 'Test 4',
        name: 'POST /api/v1/copilot/query (Test Case B: Bolt Torques & Cavitation)',
        passed,
        details: `Status ${res.status}. Mentions Torque: ${mentionsTorque}, Mentions Cavitation: ${mentionsCavitation}, Distinct from Test A: ${isDistinctFromA}. Preview: "${responseTextB.slice(0, 100)}..."`,
      });
    }

    // ------------------------------------------------------------------------
    // TEST 5: POST /api/v1/copilot/query in New Thread (Draft Thread Isolation)
    // ------------------------------------------------------------------------
    {
      const newThreadQuery = 'Explain the zero-energy LOTO steps for PUMP-001.';
      const res = await request(app)
        .post('/api/v1/copilot/query')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id)
        .send({
          query: newThreadQuery,
          plantId: plant.id,
          machineId: pumpAsset.id,
          assetId: pumpAsset.id,
          assetTag: 'PUMP-001',
          // No conversationId sent -> new draft thread
          language: 'en-US',
        });

      const data = res.body?.data;
      const conversationIdNew = data?.conversationId || '';
      const responseTextNew = data?.assistantMessage?.content || '';

      const isNewId =
        Boolean(conversationIdNew) && conversationIdNew !== conversationIdA;
      const mentionsLoto =
        /lockout|tagout|loto|mcc-04|breaker|v-101|v-102|zero-energy/i.test(responseTextNew);

      const passed =
        res.status === 200 &&
        res.body.success === true &&
        isNewId &&
        mentionsLoto;

      results.push({
        step: 'Test 5',
        name: 'POST /api/v1/copilot/query (New Consultation Thread Isolation)',
        passed,
        details: `Status ${res.status}. New ConvId generated (${conversationIdNew} !== ${conversationIdA}). Mentions LOTO: ${mentionsLoto}`,
      });
    }

    // ------------------------------------------------------------------------
    // TEST 6: POST /api/v1/tickets & GET /api/v1/tickets (1-Click RCA / Ticket Lifecycle)
    // ------------------------------------------------------------------------
    {
      const ticketQuestion = 'High seal weepage and elevated 4.2 kHz acoustic peak during test cycle';
      const createRes = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id)
        .send({
          plantId: plant.id,
          machineId: pumpAsset.id,
          machineAssetTag: 'PUMP-001',
          originalQuestion: ticketQuestion,
          diagnosticDetails: 'Multimodal session confirmed 60 drops/min weepage and elevated acoustic floor.',
          severity: 'HIGH',
          escalationReason: 'RCA_INVESTIGATION',
        });

      const createdTicket = createRes.body?.data;
      const createdPassed =
        (createRes.status === 200 || createRes.status === 201) &&
        createRes.body.success === true &&
        Boolean(createdTicket?.ticketNumber);

      // Verify GET /api/v1/tickets returns the new ticket
      const listRes = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', authHeader)
        .set('x-organization-id', org.id)
        .set('x-plant-id', plant.id);

      const ticketsList = listRes.body?.data || [];
      const foundInList = ticketsList.some(
        (t: any) => t.ticketNumber === createdTicket?.ticketNumber || t.id === createdTicket?.id
      );

      const passed = createdPassed && foundInList;

      results.push({
        step: 'Test 6',
        name: 'POST /api/v1/tickets & GET /api/v1/tickets (RCA Ticket Creation & Persistence)',
        passed,
        details: `Ticket Created: ${createdTicket?.ticketNumber}. Found in GET /api/v1/tickets: ${foundInList} (Total tickets in org: ${ticketsList.length})`,
      });
    }

    // ------------------------------------------------------------------------
    // SUMMARY REPORT
    // ------------------------------------------------------------------------
    console.log('\n======================================================');
    console.log('📊 AUTONOMOUS TEST SUITE VERIFICATION RESULTS:');
    console.log('======================================================');
    console.table(
      results.map((r) => ({
        Step: r.step,
        'Test Name': r.name,
        Status: r.passed ? '✅ PASSED' : '❌ FAILED',
        Details: r.details,
      }))
    );

    const allPassed = results.every((r) => r.passed);
    if (!allPassed) {
      console.error('\n❌ One or more tests failed. Inspect details above.');
      process.exit(1);
    } else {
      console.log('\n🎉 ALL 6 VERIFICATION TEST GATES PASSED 100% AUTONOMOUSLY!\n');
      process.exit(0);
    }
  } finally {
    if (pool) {
      await pool.query('TRUNCATE TABLE messages, citations, conversations RESTART IDENTITY CASCADE;').catch(() => {});
      await pool.end();
    }
  }
}

runAutonomousVerification().catch((err) => {
  console.error('Fatal error during autonomous verification:', err);
  process.exit(1);
});

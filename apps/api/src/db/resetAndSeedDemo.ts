import crypto from 'node:crypto';
import pg from 'pg';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createEmbeddingAdapter } from '../embeddings/embeddingFactory.js';
import { createVectorStoreAdapter } from '../vector/vectorStoreFactory.js';
import type { VectorPoint } from '../vector/vectorStore.interface.js';

interface SeedSummary {
  tablesTruncated: number;
  qdrantCollectionRecreated: boolean;
  organization: { id: string; name: string; slug: string };
  plant: { id: string; name: string; code: string };
  primaryUser: { id: string; email: string; fullName: string; role: string };
  machinesSeeded: number;
  documentsSeeded: number;
  chunksSeeded: number;
  qdrantPointsUpserted: number;
  sopsSeeded: number;
  rcaRecordsSeeded: number;
  conversationsCount: number;
  chatMessagesCount: number;
}

export async function resetAndSeedDemo(): Promise<SeedSummary> {
  logger.info('================================================================');
  logger.info('🚀 STARTING DETERMINISTIC DATABASE RESET & FRESH DEMO SEEDING');
  logger.info('   Plant: JMK Tiles Modernized | Target User: Saksham Goel');
  logger.info('================================================================');

  let connString = config.DATABASE_URL;
  if (connString.includes('pooler.supabase.com:5432')) {
    connString = connString.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
  }

  const pool = new pg.Pool({
    connectionString: connString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();

  try {
    await client.query('SET search_path TO forgex, public;');

    // =========================================================================
    // PHASE 2: COMPLETE DATABASE TRUNCATION (OPERATIONAL & TRANSACTIONAL DATA)
    // =========================================================================
    logger.info('🧹 Phase 2: Truncating operational, transactional, and document tables...');

    // List of tables to completely wipe with CASCADE
    const tablesToTruncate = [
      'forgex.citations',
      'forgex.message_feedback',
      'forgex.messages',
      'forgex.conversations',
      'forgex.specialist_tickets',
      'forgex.case_history',
      'forgex.maintenance_cases',
      'forgex.maintenance_records',
      'forgex.machine_recurring_fault_policies',
      'forgex.machine_verifications',
      'forgex.machine_evidence_claims',
      'forgex.missing_information_tasks',
      'forgex.component_mappings',
      'forgex.forgex_published_guidance',
      'forgex.visual_assets',
      'forgex.audit_events',
      'forgex.security_events',
      'forgex.security_alerts',
      'forgex.outbox_events',
      'forgex.processing_jobs',
      'forgex.knowledge_chunks',
      'forgex.document_pages',
      'forgex.document_versions',
      'forgex.asset_documents',
      'forgex.documents',
      'forgex.machine_specialist_mappings',
      'forgex.employee_badges',
      'forgex.employee_profiles',
      'forgex.assets',
    ];

    let truncatedCount = 0;
    for (const table of tablesToTruncate) {
      try {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
        truncatedCount++;
      } catch (err: any) {
        logger.warn({ table, err: err?.message }, 'Table truncation warning');
      }
    }

    // Also clean public tables if present
    const publicTables = [
      'public.document_chunks',
      'public.documents',
      'public.escalation_tickets',
      'public.maintenance_cases',
      'public.machines',
      'public.case_observations',
      'public.case_notifications',
      'public.case_resolutions',
      'public.audit_logs',
    ];
    for (const table of publicTables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
      } catch {
        // Ignore if public table does not exist
      }
    }

    logger.info(`✅ Truncated ${truncatedCount} tables cleanly.`);

    // =========================================================================
    // CLEAR VECTOR / CACHE STATE
    // =========================================================================
    logger.info('🧹 Flushing Qdrant vector collection points...');
    const vectorStore = createVectorStoreAdapter();
    let qdrantRecreated = false;
    const collectionsToClean = [
      process.env.QDRANT_COLLECTION || 'forgex_industrial_knowledge',
      'forgex_industrial_knowledge',
      'forgex_knowledge',
    ];

    for (const col of Array.from(new Set(collectionsToClean))) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.QDRANT_API_KEY) headers['api-key'] = config.QDRANT_API_KEY;
        const endpoint = (config.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
        await fetch(`${endpoint}/collections/${col}`, { method: 'DELETE', headers }).catch(() => {});

        if (typeof (vectorStore as any).ensureCollection === 'function') {
          await (vectorStore as any).ensureCollection(col, 768);
          qdrantRecreated = true;
          logger.info({ collection: col }, 'Recreated Qdrant collection');
        }
      } catch (colErr: any) {
        logger.warn({ collection: col, err: colErr?.message }, 'Qdrant collection clean warning');
      }
    }

    // =========================================================================
    // PHASE 3: SEED FRESH PRODUCTION-GRADE DEMO DATA (JMK Tiles Modernized)
    // =========================================================================
    logger.info('🌱 Phase 3: Seeding fresh industrial demo dataset for JMK Tiles Modernized...');

    // 1. Organization
    let orgRes = await client.query(`
      SELECT id, name, slug FROM forgex.organizations WHERE slug = 'jmk-tiles' OR slug = 'jmk-tiles-modernized' LIMIT 1;
    `);

    let orgId: string;
    if (orgRes.rows.length > 0) {
      orgId = orgRes.rows[0].id;
      await client.query(`
        UPDATE forgex.organizations 
        SET name = 'JMK Tiles Modernized', slug = 'jmk-tiles-modernized', updated_at = NOW()
        WHERE id = $1;
      `, [orgId]);
    } else {
      const newOrgId = crypto.randomUUID();
      await client.query(`
        INSERT INTO forgex.organizations (id, name, slug, created_at, updated_at)
        VALUES ($1, 'JMK Tiles Modernized', 'jmk-tiles-modernized', NOW(), NOW());
      `, [newOrgId]);
      orgId = newOrgId;
    }

    // 2. Primary Plant
    let plantRes = await client.query(`
      SELECT id, name, code FROM forgex.plants 
      WHERE organization_id = $1 AND (code = 'PLANT-TX-04' OR code = 'PLANT-JMK-01' OR code = 'PLANT-A2E2')
      LIMIT 1;
    `, [orgId]);

    let plantId: string;
    if (plantRes.rows.length > 0) {
      plantId = plantRes.rows[0].id;
      await client.query(`
        UPDATE forgex.plants
        SET name = 'JMK Tiles Primary Operations Facility', code = 'PLANT-TX-04', updated_at = NOW()
        WHERE id = $1;
      `, [plantId]);
    } else {
      plantId = crypto.randomUUID();
      await client.query(`
        INSERT INTO forgex.plants (id, organization_id, name, code, created_at, updated_at)
        VALUES ($1, $2, 'JMK Tiles Primary Operations Facility', 'PLANT-TX-04', NOW(), NOW());
      `, [plantId, orgId]);
    }

    // 3. Primary User: Saksham Goel (Role: ORGANIZATION_OWNER)
    const targetEmail = 'saksham1224151@jmit.ac.in';
    let userRes = await client.query(`
      SELECT id, email, full_name FROM forgex.users WHERE email = $1 LIMIT 1;
    `, [targetEmail]);

    let userId: string;
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
      await client.query(`
        UPDATE forgex.users
        SET full_name = 'Saksham Goel', updated_at = NOW()
        WHERE id = $1;
      `, [userId]);
      logger.info({ userId, email: targetEmail }, 'Updated primary user to Saksham Goel');
    } else {
      userId = crypto.randomUUID();
      await client.query(`
        INSERT INTO forgex.users (id, email, full_name, is_active, created_at, updated_at)
        VALUES ($1, $2, 'Saksham Goel', true, NOW(), NOW());
      `, [userId, targetEmail]);
      logger.info({ userId, email: targetEmail }, 'Created primary user Saksham Goel');
    }

    // Clean out any conflicting memberships in legacy demo orgs so JMK Tiles Modernized is sole active org
    await client.query(`
      DELETE FROM forgex.organization_memberships
      WHERE user_id = $1 AND organization_id != $2;
    `, [userId, orgId]);

    // Membership: ORGANIZATION_OWNER
    const existingMembership = await client.query(`
      SELECT id, role FROM forgex.organization_memberships
      WHERE user_id = $1 AND organization_id = $2 LIMIT 1;
    `, [userId, orgId]);

    if (existingMembership.rows.length > 0) {
      await client.query(`
        UPDATE forgex.organization_memberships
        SET role = 'ORGANIZATION_OWNER', status = 'ACTIVE', updated_at = NOW()
        WHERE id = $1;
      `, [existingMembership.rows[0].id]);
    } else {
      await client.query(`
        INSERT INTO forgex.organization_memberships (id, organization_id, user_id, role, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'ORGANIZATION_OWNER', 'ACTIVE', NOW(), NOW());
      `, [crypto.randomUUID(), orgId, userId]);
    }

    // Employee Profile (matches schema from 010)
    await client.query(`
      INSERT INTO forgex.employee_profiles (
        id, organization_id, user_id, employee_number, department,
        assigned_plant_ids, account_status, availability_status, qualification_status,
        verified_skills, specialized_machine_ids, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'EMP-SG-001', 'Operations & Maintenance',
        $4, 'ACTIVE', 'AVAILABLE', 'CERTIFIED',
        '["VIBRATION_ISO10816", "LOTO_COMPLIANCE", "PUMP_OVERHAUL", "HYDRAULIC_DIAGNOSTICS"]'::jsonb,
        '[]'::jsonb, NOW(), NOW()
      );
    `, [crypto.randomUUID(), orgId, userId, JSON.stringify([plantId])]);

    // 4. Clean Industrial Assets (4 Realistic Plant Machines)
    interface MachineSeedDef {
      id: string;
      assetTag: string;
      name: string;
      machineType: string;
      area: string;
      operationalState: string;
      manufacturer: string;
      modelNumber: string;
      serialNumber: string;
      criticality: string;
      technicalSpecs: Record<string, any>;
    }

    const machineDefs: MachineSeedDef[] = [
      {
        id: crypto.randomUUID(),
        assetTag: 'PUMP-001',
        name: 'Lowara Xylem e-SV Series (66SV4)',
        machineType: 'Vertical Multistage Centrifugal Pump',
        area: 'Main Production',
        operationalState: 'OPTIMAL',
        manufacturer: 'Xylem Lowara',
        modelNumber: '66SV4GA150',
        serialNumber: 'XLW-2024-SV66-8812',
        criticality: 'HIGH',
        technicalSpecs: {
          mawp: '25 Bar / 362 PSI',
          operatingPressure: '18.5 Bar',
          ratedSpeed: '2900 RPM',
          powerKw: '15 kW',
          flowRateM3h: '66 m³/h',
          maxTemperatureC: '120 °C',
          impellerMaterial: 'AISI 316 Stainless Steel',
          mechanicalSeal: 'Cartridge Seal SiC/Carbon/EPDM',
          voltage: '415V 3-Phase 50Hz',
          fullLoadAmps: '27.5 A',
        },
      },
      {
        id: crypto.randomUUID(),
        assetTag: 'COMP-002',
        name: 'Atlas Copco GA 45 VSD+',
        machineType: 'Oil-Injected Rotary Screw Compressor',
        area: 'Utility Block',
        operationalState: 'OPTIMAL',
        manufacturer: 'Atlas Copco',
        modelNumber: 'GA 45 VSD+',
        serialNumber: 'AC-2023-VSD-4509',
        criticality: 'HIGH',
        technicalSpecs: {
          maxPressure: '13 Bar',
          operatingPressure: '7.5 Bar',
          ratedSpeed: '4200 RPM',
          powerKw: '45 kW',
          freeAirDelivery: '8.5 m³/min',
          lubricantType: 'Roto-Xtend Duty Fluid',
          separatorMaxDeltaP: '0.8 Bar',
          maxDischargeTemp: '105 °C',
        },
      },
      {
        id: crypto.randomUUID(),
        assetTag: 'KILN-001',
        name: 'SACMI Maestro Roller Hearth Kiln',
        machineType: 'High-Temp Ceramic Firing Kiln',
        area: 'Kiln Bay',
        operationalState: 'OPTIMAL',
        manufacturer: 'SACMI Imola',
        modelNumber: 'Maestro RHK-180',
        serialNumber: 'SCM-2022-RHK-0114',
        criticality: 'MISSION_CRITICAL',
        technicalSpecs: {
          maxTemperatureC: '1220 °C',
          centralFiringTemp: '1210 °C',
          firingCycleMinutes: '45 min',
          tunnelLengthMeters: '180 m',
          naturalGasPressureMbar: '200 mbar',
          combustionAirPressureMbar: '50 mbar',
          safetyShutoffValve: 'SV-GAS-01',
        },
      },
      {
        id: crypto.randomUUID(),
        assetTag: 'PRESS-004',
        name: 'SACMI PH 6500 Hydraulic Tile Press',
        machineType: 'High-Tonnage Hydraulic Press',
        area: 'Pressing Line',
        operationalState: 'WARNING_MAINTENANCE_REQUIRED',
        manufacturer: 'SACMI Imola',
        modelNumber: 'PH 6500',
        serialNumber: 'SCM-2023-PH65-004',
        criticality: 'MISSION_CRITICAL',
        technicalSpecs: {
          maxHydraulicPressure: '245 Bar',
          reliefValveSetting: '260 Bar',
          pressingForceKn: '65000 kN',
          strokeRatePerMinute: '18 strokes/min',
          hydraulicOilType: 'ISO VG 46 Anti-Wear',
          accumulatorPrechargeN2: '110 Bar',
        },
      },
    ];

    const insertedMachines: Record<string, MachineSeedDef> = {};

    for (const m of machineDefs) {
      await client.query(`
        INSERT INTO forgex.assets (
          id, organization_id, plant_id, name, asset_tag, machine_type, area,
          manufacturer, model_number, serial_number, operational_state, criticality,
          documentation_readiness, verification_state, technical_specs, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'READY', 'VERIFIED', $13, NOW(), NOW()
        );
      `, [
        m.id,
        orgId,
        plantId,
        m.name,
        m.assetTag,
        m.machineType,
        m.area,
        m.manufacturer,
        m.modelNumber,
        m.serialNumber,
        m.operationalState,
        m.criticality,
        JSON.stringify(m.technicalSpecs),
      ]);

      insertedMachines[m.assetTag] = m;

      // Machine specialist mapping -> Saksham Goel
      await client.query(`
        INSERT INTO forgex.machine_specialist_mappings (
          id, organization_id, machine_id, plant_id, primary_specialist_user_id,
          assignment_status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'ASSIGNED_PRIMARY', NOW(), NOW()
        );
      `, [crypto.randomUUID(), orgId, m.id, plantId, userId]);
    }
    logger.info(`✅ Seeded 4 clean industrial machines with complete technical specs.`);

    // 5. Technical Documents
    const pumpMachine = insertedMachines['PUMP-001'];
    const compMachine = insertedMachines['COMP-002'];
    const kilnMachine = insertedMachines['KILN-001'];
    const pressMachine = insertedMachines['PRESS-004'];

    const docPumpId = crypto.randomUUID();
    const docCompId = crypto.randomUUID();
    const docKilnId = crypto.randomUUID();
    const docPressId = crypto.randomUUID();

    const verPumpId = crypto.randomUUID();
    const verCompId = crypto.randomUUID();
    const verKilnId = crypto.randomUUID();
    const verPressId = crypto.randomUUID();

    const documentsToInsert = [
      {
        id: docPumpId,
        versionId: verPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        title: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTags: ['PUMP-001'],
      },
      {
        id: docCompId,
        versionId: verCompId,
        documentNumber: 'DOC-GA45-OEM-02',
        title: 'Atlas Copco GA 45 VSD+ Rotary Screw Compressor Instruction Book',
        machineId: compMachine.id,
        assetTags: ['COMP-002'],
      },
      {
        id: docKilnId,
        versionId: verKilnId,
        documentNumber: 'DOC-RHK180-OEM-03',
        title: 'SACMI Maestro Roller Hearth Kiln Technical & Firing Manual',
        machineId: kilnMachine.id,
        assetTags: ['KILN-001'],
      },
      {
        id: docPressId,
        versionId: verPressId,
        documentNumber: 'DOC-PH65-OEM-04',
        title: 'SACMI PH 6500 High-Tonnage Hydraulic Press Operations & Safety Manual',
        machineId: pressMachine.id,
        assetTags: ['PRESS-004'],
      },
    ];

    for (const d of documentsToInsert) {
      await client.query(`
        INSERT INTO forgex.documents (
          id, organization_id, plant_id, document_number, title, category,
          asset_tags, machine_id, data_classification, is_confidential, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'OEM_MANUAL', $6, $7, 'PUBLIC', false, NOW(), NOW()
        );
      `, [d.id, orgId, plantId, d.documentNumber, d.title, d.assetTags, d.machineId]);

      // Document Version (matches 002 schema)
      const checksum = crypto.createHash('sha256').update(d.documentNumber).digest('hex');
      await client.query(`
        INSERT INTO forgex.document_versions (
          id, document_id, version_number, revision, filename, mime_type,
          file_size_bytes, checksum_sha256, storage_key, status, total_pages, total_chunks,
          created_at, updated_at
        ) VALUES (
          $1, $2, 1, 'Rev 1.0', $3, 'application/pdf', 1048576, $4, $5, 'INDEXED', 1, 1, NOW(), NOW()
        );
      `, [d.versionId, d.id, `${d.documentNumber}.pdf`, checksum, `documents/${orgId}/${d.id}/v1.pdf`]);

      // Document Page (matches 002 schema)
      await client.query(`
        INSERT INTO forgex.document_pages (
          id, document_version_id, page_number, raw_text, section_headings,
          extraction_method, has_tables, created_at
        ) VALUES (
          $1, $2, 1, $3, $4, 'NATIVE_TEXT', false, NOW()
        );
      `, [crypto.randomUUID(), d.versionId, `${d.title} - Authoritative Technical Content`, [d.title]]);

      // Relational Asset Document
      await client.query(`
        INSERT INTO forgex.asset_documents (
          id, organization_id, asset_id, document_id, created_at
        ) VALUES (
          $1, $2, $3, $4, NOW()
        );
      `, [crypto.randomUUID(), orgId, d.machineId, d.id]);
    }

    // 6. 9 Ultra-Clean High-Signal Knowledge Chunks for RAG
    interface KnowledgeChunkDef {
      id: string;
      documentVersionId: string;
      documentId: string;
      documentNumber: string;
      documentTitle: string;
      machineId: string;
      assetTag: string;
      pageNumber: number;
      sectionHeading: string;
      content: string;
    }

    const chunkDefs: KnowledgeChunkDef[] = [
      // Chunk 1: Preventive Maintenance Schedule & Spare Parts (PUMP-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPumpId,
        documentId: docPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        documentTitle: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTag: 'PUMP-001',
        pageNumber: 14,
        sectionHeading: 'Section 4.1: Preventive Maintenance Schedule, Inspection Intervals & Spare Parts Kit',
        content: `LOWARA e-SV SERIES (66SV4) PREVENTIVE MAINTENANCE SCHEDULE & SPARE PARTS LIST:

1. DAILY INSPECTION PROTOCOL:
- Mechanical Seal Leakage: Check visual sight port at seal cartridge gland. Normal weepage is < 5 drops/minute during steady operation. Leakage exceeding 10 drops/minute indicates elastomeric seal degradation or face blistering requiring immediate cartridge replacement.
- Suction Pressure Verification: Verify inlet pressure gauge PG-100 reads above 1.5 Bar (21.7 PSI) to satisfy minimum NPSHa requirements.
- Bearing Temperature Monitoring: Measure motor DE/NDE housing surface temperatures with calibrated infrared pyrometer. Normal operating threshold is < 65 °C (149 °F). Alert threshold: 75 °C. Shutdown limit: 85 °C.
- Acoustic Knocking & Cavitation Audit: Listen for irregular high-frequency metallic clicking or gravel-like rattle indicating fluid vaporization.

2. 3000-OPERATING-HOUR / 6-MONTH INTERVAL:
- Upper and Lower Motor Bearing Regreasing: Add exactly 25 grams of Mobil Polyrex EM polyurea mineral-based grease to Drive End (DE) and Non-Drive End (NDE) grease fittings. Do NOT mix lithium-based and polyurea-based greases.
- Vibration Signature Baseline (ISO 10816-3 Class II Group 1 rigid mount):
  * Normal / Good: < 1.8 mm/s RMS overall velocity.
  * Maintenance Alert / Inspection Due: 2.8 mm/s to 4.5 mm/s RMS.
  * Critical Alert / Emergency Stop: > 4.5 mm/s RMS.

3. ANNUAL OVERHAUL (8000-HOUR INTERVAL):
- Complete cartridge mechanical seal assembly replacement (Part #SV-SEAL-KIT-66).
- Diffuser Guide Vane & Stage Chamber Clearance: Measure internal wear ring clearance. Replace chamber guide bushes if radial play exceeds 0.35 mm.
- Pump Shaft Runout Check: Dial indicator TIR (Total Indicator Reading) along shaft must not exceed 0.05 mm.

4. AUTHORIZED OEM SPARE PARTS LIST:
- Cartridge Mechanical Seal Assembly (SiC/SiC/EPDM): Part # SV-SEAL-66-SIC
- Complete O-Ring Elastomer Overhaul Kit (EPDM): Part # OR-EPDM-SV66
- Drive End Deep Groove Motor Ball Bearing: SKF 6308-2Z/C3
- Non-Drive End Angular Contact Ball Bearing: SKF 7308-BECBP
- Hardened AISI 316 Stainless Steel Shaft Sleeve: Part # SS316-SLV-45
- Casing Tie-Rod Stud & Nut Fastener Set: Part # TR-SV66-M10`,
      },

      // Chunk 2: Mechanical Seal Replacement & Bolt Torques (PUMP-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPumpId,
        documentId: docPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        documentTitle: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTag: 'PUMP-001',
        pageNumber: 18,
        sectionHeading: 'Section 5.3: Mechanical Seal Replacement, Cartridge Setting & Fastener Torque Specifications',
        content: `LOWARA e-SV 66SV4 MECHANICAL SEAL REPLACEMENT PROCEDURE & EXACT BOLT TORQUES:

1. SEAL SPECIFICATIONS:
- Type: Pre-assembled balanced cartridge mechanical seal.
- Seal Faces: Silicon Carbide (SiC) primary stationary ring versus Silicon Carbide (SiC) rotating seat.
- Secondary Elastomers: Peroxide-cured EPDM O-rings and bellows.
- Maximum Operating Temperature: 120 °C (248 °F).

2. FASTENER TIGHTENING TORQUE SPECIFICATIONS:
- M10 Casing Tie-Rod Nuts: 45 Nm (33.2 ft-lbs) applied in diagonal cross-pattern sequence across opposite studs in 3 increments (15 Nm -> 30 Nm -> 45 Nm).
- M12 Motor Adapter Coupling Flange Bolts: 75 Nm (55.3 ft-lbs) uniformly torqued in star pattern.
- Mechanical Seal Cartridge Retention Set Screws: 12 Nm (8.8 ft-lbs). Do not exceed 14 Nm to avoid warping the internal sleeve.
- Casing Drain Plug & Vent Screw (G 3/8 Thread): 20 Nm (14.8 ft-lbs) with new copper washer.
- Pump Suction / Discharge Flange Bolts (DN65 PN25): 90 Nm (66.4 ft-lbs).

3. CARTRIDGE SEAL ALIGNMENT & COUPLING GAP SETTING:
- Slide the replacement cartridge seal onto the shaft until it seats squarely against the motor lantern adapter face.
- Insert the OEM alignment spacer fork (thickness: exactly 2.5 mm ± 0.2 mm) into the axial slot between the seal collar and gland flange.
- Tighten the 3 cartridge radial set screws to 12 Nm.
- CRITICAL: Remove the 2.5 mm spacer fork and store it on the coupling guard before rotating the pump shaft by hand. Verify the shaft spins freely without dragging or binding.`,
      },

      // Chunk 3: Cavitation, NPSH & Acoustic Signatures (PUMP-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPumpId,
        documentId: docPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        documentTitle: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTag: 'PUMP-001',
        pageNumber: 22,
        sectionHeading: 'Section 6.2: Impeller Cavitation Diagnostics, NPSH Requirements & Acoustic FFT Waveforms',
        content: `LOWARA e-SV (66SV4) CAVITATION DIAGNOSTICS, NPSH MARGINS & ACOUSTIC SIGNATURES:

1. CAVITATION PHYSICAL SYMPTOMS & ACOUSTIC SIGNATURES:
- Audible Symptoms: Crackling, popping, or loud gravel-like rattling sound emitted from pump first-stage chamber.
- Acoustic FFT Signature: Sharp elevated broadband acoustic energy spike concentrated between 1.8 kHz and 2.5 kHz caused by violent micro-implosion of vapor bubbles against AISI 316 stainless steel stage surfaces.
- Performance Indicators: Rapid discharge pressure oscillation (> ± 1.5 Bar fluctuation on PG-101), unexpected volumetric flow drop greater than 15%, and pitting erosion on first-stage suction eye.

2. NPSH CRITICAL OPERATING THRESHOLDS:
- Net Positive Suction Head Required (NPSHr) for 66SV4 at rated capacity (66 m³/h): Exactly 3.2 meters.
- Net Positive Suction Head Available (NPSHa) must exceed NPSHr by a minimum safety margin of 0.5 meters under all operational temperatures:
  Minimum Safe NPSHa >= 3.7 meters (12.1 feet).
- If fluid temperature rises from 20 °C to 80 °C, vapor pressure Pv rises from 0.023 Bar to 0.474 Bar, significantly diminishing available NPSHa.

3. IMMEDIATE REMEDIAL ACTION PROTOCOL:
- Step 1: Throttle the downstream discharge control valve V-102 slightly towards closed position to push the pump operating point leftward along its Q-H performance curve, reducing flow rate and decreasing required NPSHr.
- Step 2: Confirm suction isolation valve V-101 is 100% fully open. Inspect suction strainer S-101 differential pressure gauge; clean basket if Delta-P > 0.2 Bar.
- Step 3: Check suction tank liquid level and ensure booster suction pressure transmitter PS-100 reads >= 1.5 Bar.
- WARNING: Never throttle the suction valve V-101 to control flow; this will instantly destroy pump impellers and starve the mechanical seal faces of liquid lubrication.`,
      },

      // Chunk 4: Motor Bearing Lubrication & Vibration (PUMP-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPumpId,
        documentId: docPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        documentTitle: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTag: 'PUMP-001',
        pageNumber: 26,
        sectionHeading: 'Section 7.1: Motor Bearing Lubrication, Vibration Limits (ISO 10816) & High-Frequency Wear',
        content: `LOWARA e-SV 66SV4 MOTOR BEARING LUBRICATION & VIBRATION SPECIFICATIONS:

1. MOTOR ELECTRIC & MECHANICAL DATA:
- Motor Power: 15 kW (20 HP), 2-Pole, 3-Phase, 400/690V, 50 Hz, Rated Speed: 2900 RPM.
- Frame Size: 160M, TEFC (Totally Enclosed Fan Cooled), IP55 enclosure rating.
- Drive End (DE) Bearing: Deep Groove Ball Bearing SKF 6308-2Z/C3.
- Non-Drive End (NDE) Bearing: Angular Contact Ball Bearing SKF 7308-BECBP.

2. BEARING LUBRICATION PROTOCOL:
- Approved Lubricant: Mobil Polyrex EM (or Shell Gadus S5 V100 2) high-performance polyurea thickener grease.
- Lubrication Quantity: Exactly 25 grams per bearing cavity.
- Lubrication Frequency: Every 3000 operating hours or every 6 calendar months (whichever comes first).
- CAUTION: Never mix polyurea greases with lithium complex or calcium soaps. Mixing causes grease softening, oil bleeding, and rapid bearing seizure.

3. VIBRATION THRESHOLDS (ISO 10816-3 CLASS II GROUP 1 - RIGID BASE):
- Zone A / Good: < 1.8 mm/s RMS overall velocity.
- Zone B / Satisfactory: 1.8 mm/s to 2.8 mm/s RMS.
- Zone C / Unsatisfactory (Alert): 2.8 mm/s to 4.5 mm/s RMS — Schedule bearing inspection and alignment audit.
- Zone D / Unacceptable (Immediate Shutdown): > 4.5 mm/s RMS — Immediate trip and motor overhaul required.

4. HIGH-FREQUENCY ACOUSTIC WEAR DETECTION (>3 kHz):
- When accelerometer demodulation or acoustic emission detects energy elevation between 3 kHz and 6 kHz with repetitive ball-pass frequency peaks (BPFI / BPFO), micro-spalling of the outer raceway is confirmed. Grease immediately; if acoustic spike persists past 15 minutes of run time, schedule bearing changeout.`,
      },

      // Chunk 5: OSHA 1910.147 LOTO & Zero-Energy Isolation (PUMP-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPumpId,
        documentId: docPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        documentTitle: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTag: 'PUMP-001',
        pageNumber: 30,
        sectionHeading: 'Section 8.0: OSHA 1910.147 Lockout/Tagout (LOTO) & Zero-Energy Mechanical Isolation Procedure',
        content: `OSHA 1910.147 ZERO-ENERGY ISOLATION & LOCKOUT/TAGOUT PROTOCOL FOR PUMP-001:

MANDATORY SAFETY WARNING: Under no circumstances may maintenance, coupling inspection, or seal replacement be initiated while electrical, hydraulic, or pressurized energy sources remain active.

1. ELECTRICAL ISOLATION (STEP 1):
- Locate Motor Control Center MCC-04 in Substation Room 2.
- Identify dedicated breaker feeder CB-PUMP-001 (415V, 63A trip rating).
- Move breaker toggle handle to the OFF (DISCONNECTED) position.
- Apply OSHA-compliant master lockout hasp, padlocks, and danger tags stating technician name, date, and reason. Keep safety key on technician person.

2. HYDRAULIC VALVE ISOLATION (STEP 2):
- Suction Isolation: Rotate suction gate valve V-101 clockwise until fully seated. Apply lockout clamshell hasp and padlock to handwheel.
- Discharge Isolation: Rotate discharge check/gate valve V-102 clockwise until fully seated. Apply lockout cable hasp and padlock.

3. PRESSURE DISSIPATION & DRAINAGE (STEP 3):
- Slowly unscrew pump casing drain valve V-103 and upper air vent plug V-104 into portable containment tray.
- Allow trapped water to fully evacuate until flow ceases.
- Observe suction gauge PG-100 and discharge gauge PG-101: Verify both needles read EXACTLY 0.0 Bar (0 PSI).

4. ZERO-ENERGY VERIFICATION TEST (STEP 4):
- Attempt Local Restart: Press local start pushbutton PB-001 on field control station. Verify the motor does NOT bump, hum, or energize.
- Calibrated Multimeter Test: Open motor conduit terminal box. Measure phase-to-phase and phase-to-ground AC voltage across L1, L2, L3 and PE ground. Verify confirmed 0.0 VAC on all terminals before touching mechanical components.`,
      },

      // Chunk 6: Pressure Envelope & Safety Relief (PUMP-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPumpId,
        documentId: docPumpId,
        documentNumber: 'DOC-SV66-OEM-01',
        documentTitle: 'Lowara e-SV Series 66SV4 Installation, Operation & Maintenance Manual',
        machineId: pumpMachine.id,
        assetTag: 'PUMP-001',
        pageNumber: 33,
        sectionHeading: 'Section 9.2: Operating Pressure Envelope, Overpressure Protection & Thermal Thresholds',
        content: `LOWARA e-SV 66SV4 PRESSURE RATINGS, OVERPRESSURE RELIEF & THERMAL LIMITS:

1. PRESSURE ENVELOPE:
- Maximum Allowable Working Pressure (MAWP): Exactly 25.0 Bar (362 PSI) at operating liquid temperatures between -30 °C and +120 °C.
- Factory Hydrostatic Proof Test Pressure: 37.5 Bar (544 PSI) per EN 809 standard.
- Minimum Continuous Delivery Pressure: 5.0 Bar. Running below minimum pressure causes severe shaft instability and stage recirculation.

2. OVERPRESSURE SAFETY RELIEF VALVE RV-101:
- A dedicated inline safety pressure relief valve (RV-101) must be mounted on the discharge header prior to the non-return check valve.
- Calibration Setpoint: RV-101 must crack open at exactly 24.0 Bar (96% of MAWP) to protect pump casing tie-rods, mechanical seal gland, and connecting process piping.
- Full Flow Relief Capacity: Sized to pass 100% of pump rated volumetric flow (66 m³/h) during total deadhead / discharge blockage conditions.

3. THERMAL OPERATING LIMITS:
- Fluid Temperature Range: -30 °C to +120 °C (-22 °F to +248 °F).
- Ambient Motor Operating Range: -15 °C to +40 °C.
- High-Temperature Trip: Fluid temperature entering pump suction must not exceed 120 °C to prevent instantaneous flashing of liquid film between silicon carbide mechanical seal faces.`,
      },

      // Chunk 7: Atlas Copco GA 45 VSD+ Compressor Specs (COMP-002)
      {
        id: crypto.randomUUID(),
        documentVersionId: verCompId,
        documentId: docCompId,
        documentNumber: 'DOC-GA45-OEM-02',
        documentTitle: 'Atlas Copco GA 45 VSD+ Rotary Screw Compressor Instruction Book',
        machineId: compMachine.id,
        assetTag: 'COMP-002',
        pageNumber: 12,
        sectionHeading: 'Section 3.1: Operating Pressure Envelope, Lubricant Specifications & Air-Oil Separator',
        content: `ATLAS COPCO GA 45 VSD+ ROTARY SCREW COMPRESSOR TECHNICAL SPECIFICATIONS:

1. OPERATIONAL RATINGS:
- Working Pressure Range: 4.0 Bar to 13.0 Bar (58 PSI to 188 PSI). Max working pressure: 13.0 Bar.
- Drive Motor Power: 45 kW (60 HP) Permanent Magnet iPM interior oil-cooled motor.
- Free Air Delivery (FAD): 1.4 m³/min to 8.5 m³/min dynamically modulated via Elektronikon controller.
- Element Discharge Temperature: Normal operating window 75 °C to 95 °C. Alarm threshold: 110 °C. Emergency high-temperature shutdown trip: 115 °C.

2. LUBRICATION & SERVICE INTERVALS:
- Approved Lubricant: Atlas Copco Roto-Xtend Duty Fluid (synthetic hydrocarbon polyalphaolefin). Service life: 8000 operating hours or 2 years.
- Sump Capacity: 24 Liters. Oil top-up required if level drops below center of sight glass during loaded operation.
- Oil Filter Replacement: Every 4000 hours (Part # 1625-7525-00).

3. AIR-OIL SEPARATOR CARTRIDGE MAINTENANCE:
- Replace separator element (Part # 1625-7753-00) when differential pressure exceeds 0.8 Bar (11.6 PSI) or at 4000 operating hours.
- High differential pressure causes oil aerosol carryover into compressed air distribution piping and increases motor power consumption by up to 10%.`,
      },

      // Chunk 8: SACMI PH 6500 Hydraulic Press Relief & Circuits (PRESS-004)
      {
        id: crypto.randomUUID(),
        documentVersionId: verPressId,
        documentId: docPressId,
        documentNumber: 'DOC-PH65-OEM-04',
        documentTitle: 'SACMI PH 6500 High-Tonnage Hydraulic Press Operations & Safety Manual',
        machineId: pressMachine.id,
        assetTag: 'PRESS-004',
        pageNumber: 28,
        sectionHeading: 'Section 5.2: Hydraulic Circuit Pressure Limits, Relief Valve PRV-01 & Manifold Diagnostics',
        content: `SACMI PH 6500 HIGH-TONNAGE HYDRAULIC TILE PRESS OPERATIONAL & SAFETY DATA:

1. OPERATIONAL & HYDRAULIC ENVELOPE:
- Maximum Working Hydraulic Pressure: Exactly 245 Bar (3553 PSI).
- Nominal Compaction Force: 65,000 kN (6500 Metric Tons) across central forging platen.
- Cycle Rate: Up to 18 compaction strokes/minute on standard 600x600 mm porcelain tile format.
- Hydraulic Fluid: Premium mineral anti-wear hydraulic oil ISO VG 46 (cleanliness target: ISO 4406 16/14/11).
- Fluid Temperature: Controlled between 40 °C and 50 °C via heat exchanger tube bundle. Alarm at 55 °C; emergency trip at 65 °C.

2. MAIN HIGH-PRESSURE RELIEF VALVE PRV-01:
- Factory Calibrated Setpoint: 260 Bar (106% of max working pressure).
- Purpose: Directs main hydraulic pump flow directly back to reservoir tank during cylinder prefill transition or abnormal die jamming.
- Inspection Protocol: Verify PRV-01 pilot spool seat integrity weekly. Check proportional pilot orifice for varnish or particulate clogging.

3. ACCUMULATOR SAFETY & NITROGEN PRE-CHARGE:
- Main accumulator bank consists of 4x 50-Liter bladder-type vessels.
- Nitrogen (N2) Pre-charge Pressure: 110 Bar at 20 °C. Measure using certified charging kit with system depressurized to 0 Bar.
- Depressurization Procedure: Open manual blowdown ball valve BV-HYD-01 to vent trapped accumulator pressure to tank prior to servicing manifold valve blocks.`,
      },

      // Chunk 9: SACMI Maestro Roller Hearth Kiln Firing & Gas Interlocks (KILN-001)
      {
        id: crypto.randomUUID(),
        documentVersionId: verKilnId,
        documentId: docKilnId,
        documentNumber: 'DOC-RHK180-OEM-03',
        documentTitle: 'SACMI Maestro Roller Hearth Kiln Technical & Firing Manual',
        machineId: kilnMachine.id,
        assetTag: 'KILN-001',
        pageNumber: 42,
        sectionHeading: 'Section 8.4: Thermal Firing Curve, Combustion Gas Safety & Module Interlocks',
        content: `SACMI MAESTRO ROLLER HEARTH KILN (RHK-180) FIRING & COMBUSTION SAFETY:

1. THERMAL ENVELOPE & ZONAL PROFILES:
- Maximum Rated Kiln Temperature: 1220 °C (2228 °F) located in Central Firing Zone (Zone 3).
- Pre-heating Zone (Zone 1): 20 °C to 700 °C. Quartz inversion transition monitored at 573 °C.
- Fast Firing Zone (Zone 2-3): 700 °C to 1210 °C holding period for ceramic vitrification.
- Rapid Cooling Zone (Zone 4): 1210 °C to 650 °C with high-velocity air nozzles.
- Total Roller Hearth Length: 180 meters. Cycle time: 45 to 55 minutes.

2. COMBUSTION GAS & AIR SUPPLY SPECIFICATIONS:
- Fuel Gas: Natural Gas (Methane CH4).
- Supply Manifold Pressure: 200 mbar ± 10 mbar regulated through dual-stage governor train.
- Combustion Air Blower Pressure: 50 mbar steady pressure at burner nozzles.
- Excess Air Ratio (Lambda): 1.05 to 1.15 in firing zones for oxidizing kiln atmosphere.

3. AUTOMATIC SAFETY INTERLOCKS & GAS SHUTOFF:
- Thermocouple Interlocks: Dual Type S (Pt-10% Rh/Pt) thermocouples installed per 2-meter kiln module.
- Emergency High-Temperature Limit: If any firing zone exceeds 1240 °C, safety controller trips main safety shutoff solenoid valve SV-GAS-01 in under 1.0 second.
- Exhaust Draft Interlock: If negative pressure in exhaust flue drops below -50 Pa, gas train automatically locks out to prevent hazardous carbon monoxide accumulation.`,
      },
    ];

    // Insert chunks into PostgreSQL (matches 002 schema)
    let chunkIdx = 1;
    for (const c of chunkDefs) {
      await client.query(`
        INSERT INTO forgex.knowledge_chunks (
          id, document_version_id, page_number, chunk_index, qdrant_point_id,
          content, section_heading, is_table, is_figure, extraction_method,
          token_count, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, false, false, 'NATIVE_TEXT', 250, NOW()
        );
      `, [c.id, c.documentVersionId, c.pageNumber, chunkIdx++, c.id, c.content, c.sectionHeading]);
    }
    logger.info(`✅ Seeded ${chunkDefs.length} distinct, high-signal knowledge chunks into PostgreSQL.`);

    // 7. Embed Chunks & Upsert to Qdrant
    logger.info('🔮 Generating embeddings and uploading knowledge chunks to Qdrant...');
    const embeddingAdapter = createEmbeddingAdapter();
    const vectorPoints: VectorPoint[] = [];

    for (const c of chunkDefs) {
      try {
        const textToEmbed = `${c.sectionHeading}\n\n${c.content}`;
        const embedding = await embeddingAdapter.generateEmbedding(textToEmbed);

        vectorPoints.push({
          id: c.id,
          vector: embedding,
          payload: {
            organizationId: orgId,
            plantId: plantId,
            documentId: c.documentId,
            documentVersionId: c.documentVersionId,
            pageNumber: c.pageNumber,
            chunkIndex: 1,
            chunkId: c.id,
            documentNumber: c.documentNumber,
            documentTitle: c.documentTitle,
            sectionHeading: c.sectionHeading,
            content: c.content,
            machineId: c.machineId,
            assetTag: c.assetTag,
            isTable: false,
            isFigure: false,
            extractionMethod: 'NATIVE_TEXT',
          },
        });
      } catch (embErr: any) {
        logger.warn({ chunkId: c.id, err: embErr?.message }, 'Failed generating embedding for chunk');
      }
    }

    let qdrantUpsertedCount = 0;
    if (vectorPoints.length > 0) {
      for (const col of Array.from(new Set(collectionsToClean))) {
        try {
          await vectorStore.upsertPoints(col, vectorPoints);
          qdrantUpsertedCount = vectorPoints.length;
          logger.info({ collection: col, pointsCount: vectorPoints.length }, 'Successfully upserted points to Qdrant');
        } catch (upsertErr: any) {
          logger.warn({ collection: col, err: upsertErr?.message }, 'Qdrant upsert warning (handled)');
        }
      }
    }

    // 8. Seed 2 Clean SOP Checklists
    const sopDefs = [
      {
        id: crypto.randomUUID(),
        caseNumber: 'SOP-PUMP-001',
        title: 'PUMP-001 Mechanical Seal LOTO & Replacement SOP',
        assetId: pumpMachine.id,
        assetTag: pumpMachine.assetTag,
        symptomDescription: 'Scheduled / Preventive replacement of PUMP-001 cartridge mechanical seal per OEM specifications.',
        steps: [
          {
            stepNumber: 1,
            title: 'Verify Zero-Energy LOTO & Area Safety',
            instructions: 'De-energize 415V breaker CB-PUMP-001 at MCC-04. Close suction valve V-101 and discharge valve V-102. Slowly open drain valve V-103 to dissipate all trapped pressure. Verify PG-101 reads 0.0 Bar. Perform zero-voltage check.',
            safetyCritical: true,
            requiredSignoff: true,
          },
          {
            stepNumber: 2,
            title: 'Drain Pump Casing & Remove Coupling Guard',
            instructions: 'Ensure casing is completely drained into containment tray. Unbolt and remove stainless steel coupling guard.',
            safetyCritical: false,
            requiredSignoff: false,
          },
          {
            stepNumber: 3,
            title: 'Decouple Motor & Extract Cartridge Seal',
            instructions: 'Remove motor adapter coupling flange bolts (M12). Loosen the 3 cartridge set screws and gently slide damaged cartridge seal off the pump shaft.',
            safetyCritical: false,
            requiredSignoff: false,
          },
          {
            stepNumber: 4,
            title: 'Install Replacement Cartridge Seal & Torque Fasteners',
            instructions: 'Slide new SV-SEAL-66-SIC cartridge onto shaft. Set OEM 2.5 mm spacer fork into collar slot. Tighten 3 set screws to 12 Nm. Torque M10 casing studs to 45 Nm in cross pattern. Torque M12 coupling bolts to 75 Nm in 3 passes.',
            safetyCritical: true,
            requiredSignoff: true,
          },
          {
            stepNumber: 5,
            title: 'Remove Spacer, Hydrostatic Leak Check & Return to Service',
            instructions: 'Remove 2.5 mm spacer fork. Rotate shaft by hand to verify smooth rotation. Crack open suction valve V-101 slowly and bleed air via vent V-104 until clear water emerges. Verify zero static leakage.',
            safetyCritical: false,
            requiredSignoff: true,
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        caseNumber: 'SOP-PRESS-004',
        title: 'PRESS-004 Hydraulic Pressure Relief Inspection SOP',
        assetId: pressMachine.id,
        assetTag: pressMachine.assetTag,
        symptomDescription: 'Inspection and proof-pressure verification of high-pressure hydraulic manifold and relief valve PRV-01.',
        steps: [
          {
            stepNumber: 1,
            title: 'Zero-Energy Hydraulic Isolation & Depressurization',
            instructions: 'Turn main hydraulic power supply OFF. Open manual blowdown ball valve BV-HYD-01 to discharge all 4 accumulator banks to reservoir tank. Confirm main pressure gauge reads 0.0 Bar.',
            safetyCritical: true,
            requiredSignoff: true,
          },
          {
            stepNumber: 2,
            title: 'Inspect High Pressure Relief Valve PRV-01',
            instructions: 'Inspect PRV-01 valve seating surface for cavitation wear. Verify crack pressure setpoint is sealed at 260 Bar.',
            safetyCritical: true,
            requiredSignoff: false,
          },
          {
            stepNumber: 3,
            title: 'Check Proportional Manifold Seals & Accumulator Pre-charge',
            instructions: 'Measure Nitrogen pre-charge on accumulator bank: Target is 110 Bar at 20 °C. Inspect proportional valve O-rings for extrusion or varnish.',
            safetyCritical: false,
            requiredSignoff: true,
          },
          {
            stepNumber: 4,
            title: 'Static Proof Hold & Leakage Verification',
            instructions: 'Re-energize hydraulic power pack. Pressurize system to 245 Bar operational limit. Hold for 10 minutes and verify zero pressure drop and zero external manifold weeping.',
            safetyCritical: false,
            requiredSignoff: true,
          },
        ],
      },
    ];

    for (const sop of sopDefs) {
      // 005 maintenance_cases schema
      await client.query(`
        INSERT INTO forgex.maintenance_cases (
          id, organization_id, plant_id, asset_id, case_number, title,
          severity, status, reported_by_user_id, symptom_description,
          checklist, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'HIGH', 'IN_PROGRESS', $7, $8, $9, NOW(), NOW()
        );
      `, [
        sop.id,
        orgId,
        plantId,
        sop.assetId,
        sop.caseNumber,
        sop.title,
        userId,
        sop.symptomDescription,
        JSON.stringify(sop.steps),
      ]);

      // 014 forgex_published_guidance schema
      await client.query(`
        INSERT INTO forgex.forgex_published_guidance (
          id, organization_id, plant_id, machine_id, machine_asset_tag, title,
          guidance_content, disclosure_classification, reviewed_by_user_id,
          reviewed_by_email, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'WORKER_APPROVED', $8, $9, 'PUBLISHED', NOW(), NOW()
        );
      `, [
        crypto.randomUUID(),
        orgId,
        plantId,
        sop.assetId,
        sop.assetTag,
        sop.title,
        `STANDARD OPERATING PROCEDURE: ${sop.title}\n\nExecution Steps:\n${sop.steps.map((s) => `${s.stepNumber}. ${s.title}: ${s.instructions}`).join('\n')}`,
        userId,
        targetEmail,
      ]);
    }
    logger.info(`✅ Seeded 2 clean SOP checklists.`);

    // 9. Seed 2 Historical RCA Records (Maintenance History)
    // First, seed 2 closed specialist tickets to satisfy foreign key in 011 maintenance_records
    const ticket1Id = crypto.randomUUID();
    const ticket2Id = crypto.randomUUID();

    await client.query(`
      INSERT INTO forgex.specialist_tickets (
        id, ticket_number, organization_id, plant_id, machine_id, machine_asset_tag,
        reported_by_user_id, original_question, diagnostic_details, escalation_reason,
        evidence_check_result, severity, assigned_specialist_user_id, assignment_status,
        status, created_at, updated_at
      ) VALUES (
        $1, 'TCK-2024-001', $2, $3, $4, 'PUMP-001',
        $5, 'Investigation of high seal weeping and cavitation acoustic signature on PUMP-001',
        'Physical mechanical seal degradation verified. Replaced cartridge under RCA-2024-001.',
        'EQUIPMENT_FAULT', '{"hasApprovedEvidence": true}'::jsonb, 'HIGH', $5,
        'ASSIGNED_PRIMARY', 'RESOLVED', NOW() - INTERVAL '14 days', NOW() - INTERVAL '13 days'
      );
    `, [ticket1Id, orgId, plantId, pumpMachine.id, userId]);

    await client.query(`
      INSERT INTO forgex.specialist_tickets (
        id, ticket_number, organization_id, plant_id, machine_id, machine_asset_tag,
        reported_by_user_id, original_question, diagnostic_details, escalation_reason,
        evidence_check_result, severity, assigned_specialist_user_id, assignment_status,
        status, created_at, updated_at
      ) VALUES (
        $1, 'TCK-2024-002', $2, $3, $4, 'PRESS-004',
        $5, 'Investigation of hydraulic ram deceleration lag on PRESS-004',
        'Varnish accumulation in proportional pilot spool cleaned under RCA-2024-002.',
        'EQUIPMENT_FAULT', '{"hasApprovedEvidence": true}'::jsonb, 'HIGH', $5,
        'ASSIGNED_PRIMARY', 'RESOLVED', NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days'
      );
    `, [ticket2Id, orgId, plantId, pressMachine.id, userId]);

    const rcaDefs = [
      {
        id: crypto.randomUUID(),
        recordNumber: 'RCA-2024-001',
        ticketId: ticket1Id,
        ticketNumber: 'TCK-2024-001',
        machineId: pumpMachine.id,
        assetTag: pumpMachine.assetTag,
        plantId: plantId,
        faultCategory: 'MECHANICAL_SEAL_FAILURE',
        problemStatement: 'Excessive seal face leakage and 4.2 kHz high-frequency acoustic chatter on Lowara e-SV 66SV4.',
        rootCause: 'Thermal shock caused by dry running during suction line air entrapment. Excessive heat caused EPDM elastomer blistering and stationary SiC ring micro-fracture.',
        rootCauseStatus: 'CONFIRMED',
        observedSymptoms: ['Visible water leakage at gland (60 drops/min)', 'Localized high-pitched acoustic squeal at 4.2 kHz'],
        repairActions: [
          'Replaced mechanical seal cartridge with SiC/SiC/EPDM kit',
          'Re-torqued gland nuts to 45 Nm',
          'Re-calibrated low-suction pressure transmitter interlock PS-101 to trip at 1.2 Bar',
        ],
        measurements: [
          { parameterName: 'Discharge Pressure', value: 18.2, unit: 'Bar', source: 'PG-101', isNormal: false },
          { parameterName: 'Vibration RMS Velocity', value: 3.4, unit: 'mm/s', source: 'Accelerometer DE', isNormal: false },
          { parameterName: 'Seal Gland Temperature', value: 92, unit: '°C', source: 'Thermal Pyrometer', isNormal: false },
        ],
        verificationState: 'VERIFIED',
      },
      {
        id: crypto.randomUUID(),
        recordNumber: 'RCA-2024-002',
        ticketId: ticket2Id,
        ticketNumber: 'TCK-2024-002',
        machineId: pressMachine.id,
        assetTag: pressMachine.assetTag,
        plantId: plantId,
        faultCategory: 'HYDRAULIC_VALVE_SLUGGISHNESS',
        problemStatement: 'Sluggish compaction ram descent and proportional manifold hunting on SACMI PH 6500.',
        rootCause: 'Varnish particulate accumulation in pilot stage orifice of proportional valve PV-02 due to hydraulic oil thermal degradation (operating oil temp reached 68°C).',
        rootCauseStatus: 'CONFIRMED',
        observedSymptoms: ['Erratic ram descent velocity during tile compaction cycle', 'Pressure ramp sluggishness exceeding 350 ms'],
        repairActions: [
          'Flushed proportional valve pilot spool with solvent',
          'Replaced return line oil filter element (3 micron)',
          'Cleaned heat exchanger tube bundle to restore oil temp to 45°C',
        ],
        measurements: [
          { parameterName: 'Operating Pressure', value: 215, unit: 'Bar', source: 'Gauge PG-01', isNormal: false },
          { parameterName: 'Hydraulic Oil Temperature', value: 68, unit: '°C', source: 'Temp Sensor TT-01', isNormal: false },
        ],
        verificationState: 'VERIFIED',
      },
    ];

    for (const rca of rcaDefs) {
      await client.query(`
        INSERT INTO forgex.maintenance_records (
          id, record_number, organization_id, plant_id, machine_id, machine_asset_tag,
          ticket_id, ticket_number, reporting_user_id, reporting_user_name,
          resolving_technician_user_id, resolving_technician_name, fault_category,
          problem_statement, root_cause, root_cause_status, observed_symptoms,
          repair_actions, measurements, verification_state, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'Saksham Goel', $9, 'Saksham Goel',
          $10, $11, $12, $13, $14, $15, $16, $17, NOW() - INTERVAL '6 days', NOW()
        );
      `, [
        rca.id,
        rca.recordNumber,
        orgId,
        rca.plantId,
        rca.machineId,
        rca.assetTag,
        rca.ticketId,
        rca.ticketNumber,
        userId,
        rca.faultCategory,
        rca.problemStatement,
        rca.rootCause,
        rca.rootCauseStatus,
        JSON.stringify(rca.observedSymptoms),
        JSON.stringify(rca.repairActions),
        JSON.stringify(rca.measurements),
        rca.verificationState,
      ]);
    }
    logger.info(`✅ Seeded 2 clean historical RCA maintenance records.`);

    // 10. Verify Conversations & Messages are STRICTLY 0
    const convCheck = await client.query('SELECT COUNT(*) as count FROM forgex.conversations;');
    const msgCheck = await client.query('SELECT COUNT(*) as count FROM forgex.messages;');
    const conversationsCount = parseInt(convCheck.rows[0].count, 10);
    const chatMessagesCount = parseInt(msgCheck.rows[0].count, 10);

    logger.info({ conversationsCount, chatMessagesCount }, '✅ Verified conversations & chat messages are 0 threads');

    const summary: SeedSummary = {
      tablesTruncated: truncatedCount,
      qdrantCollectionRecreated: qdrantRecreated,
      organization: { id: orgId, name: 'JMK Tiles Modernized', slug: 'jmk-tiles-modernized' },
      plant: { id: plantId, name: 'JMK Tiles Primary Operations Facility', code: 'PLANT-TX-04' },
      primaryUser: { id: userId, email: targetEmail, fullName: 'Saksham Goel', role: 'ORGANIZATION_OWNER' },
      machinesSeeded: machineDefs.length,
      documentsSeeded: documentsToInsert.length,
      chunksSeeded: chunkDefs.length,
      qdrantPointsUpserted: qdrantUpsertedCount,
      sopsSeeded: sopDefs.length,
      rcaRecordsSeeded: rcaDefs.length,
      conversationsCount,
      chatMessagesCount,
    };

    logger.info('================================================================');
    logger.info('🎉 DETERMINISTIC RESET & SEEDING COMPLETED SUCCESSFULLY!');
    logger.info({ summary });
    logger.info('================================================================');

    return summary;
  } finally {
    client.release();
    await pool.end();
  }
}

// CLI runner
if (process.argv[1]?.endsWith('resetAndSeedDemo.ts') || process.argv[1]?.endsWith('resetAndSeedDemo.js')) {
  resetAndSeedDemo()
    .then((summary) => {
      console.log('\n[ForgeX] Database Reset & Seed Completed:');
      console.table({
        'Tables Truncated': summary.tablesTruncated,
        'Organization': `${summary.organization.name} (${summary.organization.slug})`,
        'Plant': `${summary.plant.name} (${summary.plant.code})`,
        'Primary User': `${summary.primaryUser.fullName} (${summary.primaryUser.email})`,
        'User Role': summary.primaryUser.role,
        'Machines Seeded': summary.machinesSeeded,
        'Documents Seeded': summary.documentsSeeded,
        'Knowledge Chunks': summary.chunksSeeded,
        'Qdrant Points': summary.qdrantPointsUpserted,
        'SOP Checklists': summary.sopsSeeded,
        'RCA Records': summary.rcaRecordsSeeded,
        'Conversations (Threads)': summary.conversationsCount,
        'Chat Messages': summary.chatMessagesCount,
      });
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during resetAndSeedDemo:', err);
      process.exit(1);
    });
}

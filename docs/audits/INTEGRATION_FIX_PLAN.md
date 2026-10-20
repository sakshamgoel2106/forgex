# ForgeX AI — Integration Fix & Remediation Plan

**Audit Date:** October 20, 2026  
**Auditor Role:** Principal Software Architect & QA Lead  
**Objective:** Provide a prioritized, dependency-ordered engineering blueprint to remediate all identified compliance, security, and problem statement gaps.

---

## 1. Prioritized Roadmap Overview

The remediation is structured into three strictly gated phases:
- **Phase A (P0 / P1 — Security & Data Integrity):** Cryptographic hardening, fail-fast vector persistence, and true cloud adapter wiring.
- **Phase B (P1 / P2 — Problem Statement Fulfillment):** Voice STT/TTS interaction, real optical OCR, platform-wide issue analytics, and persistent tribal knowledge.
- **Phase C (P2 / P3 — CAD / P&ID Engineering Viewers & UI Polish):** True 3D model loaders, dynamic P&ID schematic rendering, profile menu wiring, and settings persistence.

```
+----------------------------------------------------------------------------------------------------+
|                                      REMEDIATION TIMELINE                                          |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [PHASE A: Security & Integrity]                                                                   |
|    * Fix static badge PIN salt -> bcrypt/argon2 per-badge salt                                     |
|    * Remove silent Qdrant fallback -> fail fast in production                                      |
|    * Implement genuine Cloud SaaS LLM/Vision adapters (OpenAI / Azure / Gemini)                    |
|                                                                                                    |
|  [PHASE B: Problem Statement Compliance]                                                           |
|    * Voice Interaction (STT / TTS) in Web UI & Backend Whisper endpoint                            |
|    * Real OCR pipeline for scanned PDFs (Tesseract.js / pdf2img worker)                            |
|    * Cross-Machine Issue Analytics API (/api/v1/analytics/issues) & Dashboard                      |
|    * Connect Expert Knowledge View to persistent DataStore                                         |
|                                                                                                    |
|  [PHASE C: Viewers & Frontend Polish]                                                              |
|    * 3D CAD real loader (GLTFLoader / STLLoader) replacing 5 hardcoded procedural meshes          |
|    * Dynamic P&ID viewer rendering uploaded PDF/image schematics with pan/zoom                     |
|    * Connect ProfileMenu actions (Sign out, Profile modal)                                         |
|    * Persist SettingsView configuration to backend API                                             |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Phase A: Security & Data Integrity Remediations (P0 / P1)

### FIX-A01: Replace Static Salt with Bcrypt for Badge PIN Hashing
- **Target Files:**
  - [`apps/api/src/routes/badge.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/badge.routes.ts#L15)
  - [`apps/api/src/routes/auth.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/auth.routes.ts#L301)
  - [`apps/api/src/db/inMemoryDataStore.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/db/inMemoryDataStore.ts)
  - [`apps/api/src/db/pgDataStore.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/db/pgDataStore.ts)
- **Dependencies:** `bcrypt` (or `bcryptjs`)
- **Remediation Steps:**
  1. Add `bcrypt` dependency to `apps/api/package.json`.
  2. In `badge.routes.ts`, update `hashPin(pin: string)` to generate a random 12-round bcrypt salt:
     ```typescript
     import bcrypt from 'bcrypt';
     const pinHash = await bcrypt.hash(pin.trim(), 12);
     ```
  3. In `auth.routes.ts` (`POST /api/v1/auth/badge-login`), update verification:
     ```typescript
     const isMatch = await bcrypt.compare(pin.trim(), badge.pinHash);
     if (!isMatch) {
       res.status(401).json({ success: false, error: { code: 'FORGEX_INVALID_CREDENTIALS', message: 'Invalid employee PIN credentials.' } });
       return;
     }
     ```
  4. Update `tests/machineRegistryAndPhaseB.test.ts` to assert that bcrypt hashes are generated and verified.

---

### FIX-A02: Remove Silent In-Memory Fallback in Qdrant Vector Store
- **Target Files:**
  - [`apps/api/src/vector/qdrantVectorStoreAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/vector/qdrantVectorStoreAdapter.ts#L34)
  - [`apps/api/src/config/env.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/config/env.ts)
- **Remediation Steps:**
  1. In `qdrantVectorStoreAdapter.ts`, inspect `process.env.NODE_ENV`:
     ```typescript
     catch (err: any) {
       if (process.env.NODE_ENV === 'production') {
         logger.fatal({ err: err?.message }, 'Qdrant connection failure in production environment. Halting to prevent data loss.');
         throw new Error(`Qdrant Vector Store unavailable: ${err?.message}`);
       }
       logger.warn({ err: err?.message }, 'Qdrant unavailable in development mode; using in-memory vector store fallback.');
       await this.fallbackAdapter.upsertPoints(collectionName, points);
     }
     ```
  2. Ensure automated health probe (`GET /readyz`) verifies Qdrant responsiveness when `VECTOR_STORE=qdrant`.

---

### FIX-A03: Connect Real Cloud SaaS AI Providers
- **Target Files:**
  - [`apps/api/src/ai/cloudSaasAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/cloudSaasAdapter.ts)
  - [`apps/api/src/ai/cloudVisionAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/cloudVisionAdapter.ts)
  - [`apps/api/src/ai/aiProviderFactory.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/aiProviderFactory.ts)
- **Dependencies:** `@google/genai` or `openai`
- **Remediation Steps:**
  1. In `cloudSaasAdapter.ts`, instantiate the official client using `config.CLOUD_AI_API_KEY`:
     - If provider is `gemini`: call Google GenAI SDK with structured system prompts, ground-truth evidence chunks, and JSON response schema.
     - If provider is `openai`: call OpenAI chat completions with strict temperature=0.0.
  2. In `cloudVisionAdapter.ts`, submit base64 image data to the multimodal endpoint, parsing returned equipment tags, bounding boxes, and component labels dynamically.

---

## 3. Phase B: Problem Statement Compliance Remediations (P1 / P2)

### FIX-B01: Factory-Floor Voice Interaction (STT / TTS)
- **Target Files:**
  - [`apps/web/src/components/views/CopilotWorkspaceView.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/CopilotWorkspaceView.tsx)
  - [`apps/api/src/routes/voice.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/) *(New)*
- **Remediation Steps:**
  1. **Frontend Web Speech STT:** In `CopilotWorkspaceView.tsx`, add a Microphone button beside the prompt input:
     ```typescript
     const toggleSpeechRecognition = () => {
       const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
       if (!SpeechRecognition) return;
       const recognition = new SpeechRecognition();
       recognition.continuous = false;
       recognition.interimResults = false;
       recognition.lang = 'en-US';
       recognition.onresult = (e: any) => {
         const transcript = e.results[0][0].transcript;
         setPrompt(transcript);
       };
       recognition.start();
     };
     ```
  2. **Frontend TTS Readout:** Add a "Read Aloud" button on assistant messages executing `window.speechSynthesis.speak(new SpeechSynthesisUtterance(messageText))`.
  3. **Backend Whisper Fallback:** Implement `POST /api/v1/voice/transcribe` accepting `audio/wav` or `audio/webm`, delegating to local Whisper / faster-whisper on OT nodes.

---

### FIX-B02: Genuine Optical OCR Pipeline for Scanned PDF Manuals
- **Target Files:**
  - [`apps/api/src/ingestion/documentParser.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ingestion/documentParser.ts#L204)
- **Dependencies:** `tesseract.js` or `pdf2pic` / `canvas`
- **Remediation Steps:**
  1. For PDF pages where extracted native character count < 35, render page to PNG raster buffer.
  2. Pass image buffer to Tesseract OCR worker:
     ```typescript
     import { createWorker } from 'tesseract.js';
     const worker = await createWorker('eng');
     const { data: { text } } = await worker.recognize(pageImageBuffer);
     await worker.terminate();
     ```
  3. Extract industrial equipment tags and section headings from true OCR output.

---

### FIX-B03: Platform-Wide Issue Analytics API & Dashboard
- **Target Files:**
  - [`apps/api/src/routes/analytics.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/) *(New)*
  - [`apps/api/src/db/dataStore.interface.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/db/dataStore.interface.ts)
  - [`apps/api/src/db/inMemoryDataStore.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/db/inMemoryDataStore.ts)
  - [`apps/api/src/db/pgDataStore.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/db/pgDataStore.ts)
  - [`apps/web/src/components/views/OverviewView.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/OverviewView.tsx)
- **Remediation Steps:**
  1. Add `getFrequentlyReportedIssues(organizationId: string, plantId?: string)` to `IDataStore`.
  2. Implement SQL aggregation in `pgDataStore.ts`:
     ```sql
     SELECT 
       fault_category,
       COUNT(*) as occurrence_count,
       ARRAY_AGG(DISTINCT root_cause) as root_causes,
       ARRAY_AGG(DISTINCT asset_id) as affected_machines
     FROM forgex_maintenance_records
     WHERE organization_id = $1
     GROUP BY fault_category
     ORDER BY occurrence_count DESC
     LIMIT 10;
     ```
  3. Expose `GET /api/v1/analytics/frequent-issues` and render a Pareto chart in `OverviewView.tsx`.

---

### FIX-B04: Connect Expert Knowledge View to Persistent DataStore
- **Target Files:**
  - [`apps/web/src/components/views/ExpertKnowledgeView.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/ExpertKnowledgeView.tsx#L53)
  - [`apps/api/src/routes/knowledge.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/)
- **Remediation Steps:**
  1. Expose `GET /api/v1/knowledge/notes` and `POST /api/v1/knowledge/notes` in backend API.
  2. Update `ExpertKnowledgeView.tsx` to `fetch('/api/v1/knowledge/notes')` on mount instead of initializing with hardcoded `SAMPLE_NOTES`.

---

## 4. Phase C: Viewers & Frontend Polish (P2 / P3)

### FIX-C01: True 3D CAD File Loaders (GLTFLoader / STLLoader)
- **Target Files:**
  - [`apps/web/src/components/views/RealThreeDViewerModal.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/RealThreeDViewerModal.tsx#L86)
- **Dependencies:** `three/examples/jsm/loaders/GLTFLoader.js`, `three/examples/jsm/loaders/STLLoader.js`
- **Remediation Steps:**
  1. Accept `modelUrl?: string` prop in `RealThreeDViewerModal`.
  2. If `modelUrl` is provided, load the asset via `STLLoader` or `GLTFLoader`.
  3. Compute bounding box, center camera, and apply raycasting to actual CAD mesh parts.
  4. If no `modelUrl` exists, display an explicit banner: *"No 3D CAD model uploaded. Displaying generic procedural equipment reference."*

---

### FIX-C02: Dynamic P&ID Viewer for Uploaded Drawings
- **Target Files:**
  - [`apps/web/src/components/views/PidEngineeringViewerModal.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/PidEngineeringViewerModal.tsx#L106)
- **Remediation Steps:**
  1. Accept `drawingStorageKey` or `imageUrl` in props.
  2. Render the actual raster drawing or vector PDF in a pan-zoom canvas with interactive SVG pins matching registered component tags.

---

### FIX-C03: Connect ProfileMenu Actions & Persist SettingsView
- **Target Files:**
  - [`apps/web/src/components/watermelon/gridline-dashboard/components/shared/profile-menu.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/watermelon/gridline-dashboard/components/shared/profile-menu.tsx#L48)
  - [`apps/web/src/components/views/SettingsView.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/SettingsView.tsx#L20)
- **Remediation Steps:**
  1. In `profile-menu.tsx`:
     - Wire `Sign out` item: remove `forgex_token` from storage, clear session, and redirect to `/login`.
     - Wire `Settings` item: navigate to the settings view.
  2. In `SettingsView.tsx`:
     - Persist inference selection to `localStorage` or `PATCH /api/v1/org/settings`.

---

## 5. Verification & Release Gate Criteria

Every remediation item must satisfy the following validation gates before production deployment:

1. **Automated Unit & Integration Tests:**
   - 100% pass rate across all Vitest test suites (`npm test`).
   - New test suites added:
     - `tests/voiceInteraction.test.ts`
     - `tests/issueAnalytics.test.ts`
     - `tests/bcryptBadgeAuth.test.ts`
     - `tests/scannedPdfOcr.test.ts`
2. **Security & Air-Gap Egress Tests:**
   - Zero outbound TCP/TLS connections observed in Enterprise air-gapped container mode.
3. **Playwright E2E Tests:**
   - E2E testing of the voice recording toggle, CAD viewer modal, and analytics Pareto chart in `apps/web/e2e/`.
4. **Documentation Sync:**
   - Update `docs/ARCHITECTURE.md` and `docs/API_CONTRACTS.md` to reflect new voice and analytics endpoints.

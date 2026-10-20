# ForgeX AI — Problem Statement Gap Analysis

**Audit Date:** October 20, 2026  
**Auditor Role:** Principal Software Architect & Independent QA Auditor  
**Official Problem Statement:** Multimodal GenAI Assistant for Industrial SOPs, Manuals & Expert Knowledge

---

## 1. Problem Statement Objectives Alignment Matrix

| Reference Objective | Repository Status | Gap Severity | Primary Findings & Code Locations |
| :--- | :--- | :--- | :--- |
| **1. Grounded SOP & Manual Answers** | **Implemented & Verified** | Green (Compliant) | [`apps/api/src/services/ragQueryEngine.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/ragQueryEngine.ts#L518). Grounded retrieval with intent evaluation, confidence scoring, and strict refusal to hallucinate limits on undocumented machines. |
| **2. Multimodal Understanding (Text, Images, Diagrams)** | **Partially Implemented / Heuristic** | **P1 (High)** | OCR on scanned PDFs is simulated via ASCII regex parsing ([`apps/api/src/ingestion/documentParser.ts:204`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ingestion/documentParser.ts#L204)). Cloud Vision is a mock stub returning hardcoded tags ([`apps/api/src/ai/cloudVisionAdapter.ts:38`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/cloudVisionAdapter.ts#L38)). Diagram topology tracing is explicit disclaimer only. |
| **3. RAG with Verifiable Source Evidence** | **Implemented & Verified** | Green (Compliant) | Ground-truth citations generated down to document ID, version, section heading, and page number. Viewer-role citation snippet masking verified ([`ragQueryEngine.ts:954`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/ragQueryEngine.ts#L954)). |
| **4. Voice Interaction (STT / TTS) for Workers** | **Missing** | **P1 (High)** | Zero voice/STT/TTS code in `apps/web` or `apps/api`. No Web Speech API (`webkitSpeechRecognition`, `speechSynthesis`), no audio recorder, and no Whisper endpoint. |
| **5. Step-by-Step Troubleshooting & Maintenance** | **Partially Implemented** | **P2 (Medium)** | Core maintenance engine generates verified LOTO/PPE procedural checklists ([`apps/api/src/services/maintenanceWorkflowEngine.ts:283`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/maintenanceWorkflowEngine.ts#L283)). However, [`apps/web/src/components/views/TroubleshootingView.tsx:21`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/TroubleshootingView.tsx#L21) is a static mock with 3 hardcoded records. |
| **6. Secure, Searchable Plant Knowledge** | **Implemented & Verified** | Green (Compliant) | Multi-tenant and cross-plant isolation enforced at API middleware, datastore queries, and vector payload filters. |
| **7. Analytics Identifying Frequently Reported Issues** | **Missing** | **P2 (Medium)** | Platform-wide analytics dashboard and aggregation API are missing. Only single-machine windowed recurrence exists ([`apps/api/src/db/inMemoryDataStore.ts:3105`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/db/inMemoryDataStore.ts#L3105)). |
| **8. Preservation & Extension of Expert Knowledge** | **Partially Implemented** | **P2 (Medium)** | Old Machine Knowledge Recovery engine is fully functional with anti-self-approval ([`apps/api/src/routes/recovery.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/recovery.routes.ts)). But [`apps/web/src/components/views/ExpertKnowledgeView.tsx:24`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/ExpertKnowledgeView.tsx#L24) is a disconnected in-memory mock. |

---

## 2. In-Depth Technical Gap Findings

### GAP-01: Voice Interaction (STT / TTS) Is 100% Missing
- **Problem Statement Mandate:** *"Simple chat and voice interaction for factory-floor workers."*
- **Observed Behavior:**
  - Search for `webkitSpeechRecognition`, `SpeechRecognition`, `speechSynthesis`, `navigator.mediaDevices.getUserMedia`, or `Whisper` yields zero results across the repository.
  - Workers on the factory floor wearing gloves or operating in noisy environments cannot interact with the assistant via voice commands.
- **Affected Files:**
  - [`apps/web/src/components/views/CopilotWorkspaceView.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/CopilotWorkspaceView.tsx)
  - [`apps/api/src/server.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/server.ts)
- **Severity:** **P1 (High)**
- **Remediation:**
  1. Frontend: Integrate browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for hands-free speech-to-text input and `window.speechSynthesis` for audio readouts of troubleshooting steps.
  2. Backend: Add `/api/v1/voice/transcribe` endpoint utilizing local Whisper (in Enterprise/Air-gap mode via Ollama/faster-whisper) or OpenAI Whisper API (in SaaS mode) for industrial-grade noise-robust transcription.

---

### GAP-02: Scanned Document OCR Is Simulated by Regex Byte Scraping
- **Problem Statement Mandate:** *"Multimodal understanding of text, images, and technical diagrams... ingest scanned equipment manuals."*
- **Observed Behavior:**
  - In [`apps/api/src/ingestion/documentParser.ts:204-213`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ingestion/documentParser.ts#L204-L213):
    ```typescript
    const asciiMatches = buffer.toString('ascii').match(/[A-Z0-9-]{4,20}/g) || [];
    const sampleTokens = Array.from(new Set(asciiMatches))
      .filter((t) => !['FONT', 'PROCSET', 'COLORSPACE', 'XOBJECT', 'STREAM', 'ENDOBJ', 'TRAILER'].includes(t))
      .slice(0, 10)
      .join(' ');
    return `${marker}\nSECTION: OPTICAL CHARACTER RECOGNITION SUMMARY\nExtracted alphanumeric industrial identifiers:\n${sampleTokens || 'EQUIPMENT-TAG-SCAN-VALVE-01'}`;
    ```
  - When a scanned PDF is uploaded where pages are raster images, the parser does not rasterize the PDF pages to bitmaps or execute an OCR engine. It converts the raw binary PDF stream to ASCII and regex-matches strings, falling back to a hardcoded string `'EQUIPMENT-TAG-SCAN-VALVE-01'`.
- **Affected Files:**
  - [`apps/api/src/ingestion/documentParser.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ingestion/documentParser.ts#L204)
- **Severity:** **P1 (High)**
- **Remediation:**
  - Integrate a true OCR pipeline: for scanned PDFs with minimal native text, render pages via `pdf-lib` / `canvas` or `pdf2img`, and pass the rendered image buffer to `Tesseract.js` (for local offline processing) or an external OCR worker service.

---

### GAP-03: 3D / CAD Assembly Viewer Renders Hardcoded Procedural Geometry
- **Problem Statement Mandate:** *"Multimodal GenAI Assistant... technical diagrams, equipment models."*
- **Observed Behavior:**
  - In [`apps/web/src/components/views/RealThreeDViewerModal.tsx:86-158`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/RealThreeDViewerModal.tsx#L86-L158):
    ```typescript
    const impellerGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.4, 32);
    const sealGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.8, 32);
    const bracketGeo = new THREE.BoxGeometry(1.6, 1.4, 2.2);
    const flangeGeo = new THREE.TorusGeometry(0.9, 0.2, 16, 32);
    const couplingGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 24);
    ```
  - The modal claims to be a "Real 3D CAD Assembly Viewer", but it does not parse CAD files (`.step`, `.stp`, `.iges`, `.gltf`, `.glb`, `.stl`). Regardless of the machine selected or drawing uploaded, it renders the exact same five hardcoded geometric shapes in a fixed spatial layout.
- **Affected Files:**
  - [`apps/web/src/components/views/RealThreeDViewerModal.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/RealThreeDViewerModal.tsx#L86)
- **Severity:** **P2 (Medium)**
- **Remediation:**
  - Integrate Three.js `STLLoader` and `GLTFLoader`. Add backend support for storing and streaming `.stl` and `.gltf` model files uploaded via the Engineering Asset Center, loading actual asset geometry when available. Retain procedural geometry only as a labeled fallback when no CAD model exists.

---

### GAP-04: Interactive P&ID Viewer Is a Hardcoded Static SVG
- **Problem Statement Mandate:** *"Multimodal understanding of technical diagrams... P&ID schematics."*
- **Observed Behavior:**
  - In [`apps/web/src/components/views/PidEngineeringViewerModal.tsx:106-210`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/PidEngineeringViewerModal.tsx#L106-L210):
    - The viewer renders an inline SVG drawing hardcoded with lines and symbols for `P-204-IMP`, `V-204-SUC`, `FT-204-A`, and `DWG-PID-TX04-204 (REV-D)`.
    - It does not load the actual P&ID image or vector file uploaded for the asset.
- **Affected Files:**
  - [`apps/web/src/components/views/PidEngineeringViewerModal.tsx`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/PidEngineeringViewerModal.tsx#L106)
- **Severity:** **P2 (Medium)**
- **Remediation:**
  - Update `PidEngineeringViewerModal` to accept an `imageUrl` or `pdfUrl` pointing to the storage proxy (`/api/v1/engineering/storage-proxy?key=...`), rendering the actual drawing in a pan/zoom viewport with dynamic bounding-box overlays based on component mappings.

---

### GAP-05: Platform-Wide Issue Analytics Is Missing
- **Problem Statement Mandate:** *"Analytics identifying frequently reported issues."*
- **Observed Behavior:**
  - While single-machine recurring fault analysis is implemented (`detectRecurringFaults`), there is no organization-wide or plant-wide issue analytics engine.
  - There is no `/api/v1/analytics/issues` or `/api/v1/analytics/frequent-faults` endpoint, and no analytics dashboard view in the frontend to aggregate failure modes across fleets of equipment.
- **Affected Files:**
  - [`apps/api/src/routes/`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes)
  - [`apps/web/src/components/views/`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views)
- **Severity:** **P2 (Medium)**
- **Remediation:**
  - Implement `GET /api/v1/analytics/frequently-reported-issues` in `maintenance.routes.ts` or a new `analytics.routes.ts`, aggregating maintenance cases, recurring faults, and specialist ticket categories by plant and asset class. Provide an Analytics tab in `OverviewView.tsx`.

---

### GAP-06: Frontend View Disconnects and Static Mocks
- **Observed Disconnects:**
  1. [`apps/web/src/components/views/TroubleshootingView.tsx:21-46`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/TroubleshootingView.tsx#L21-L46): Uses a hardcoded array `FAULT_RECORDS = [...]` with 3 items. It does not fetch maintenance cases or diagnostics from `/api/v1/maintenance/cases`.
  2. [`apps/web/src/components/views/ExpertKnowledgeView.tsx:24-49`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/ExpertKnowledgeView.tsx#L24-L49): Uses a hardcoded array `SAMPLE_NOTES = [...]` stored in React component state `useState`. Submitted notes are lost on refresh.
  3. [`apps/web/src/components/views/SettingsView.tsx:20-23`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/SettingsView.tsx#L20-L23): `handleSave` sets a 2.5-second `saved` flag without persisting to backend or localStorage.
  4. [`apps/web/src/components/watermelon/gridline-dashboard/components/shared/profile-menu.tsx:48-61`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/watermelon/gridline-dashboard/components/shared/profile-menu.tsx#L48-L61): "Profile", "Settings", and "Sign out" menu items have no `onClick` handlers or router navigation.
  5. [`apps/web/src/components/views/DiagnosticsTerminalView.tsx:4-6`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/DiagnosticsTerminalView.tsx#L4-L6): Pure duplicate wrapper returning `<CopilotWorkspaceView />`.
- **Severity:** **P2 (Medium)**
- **Remediation:**
  - Connect `TroubleshootingView` to `/api/v1/maintenance/cases`.
  - Connect `ExpertKnowledgeView` to a persistent notes/knowledge endpoint or merge into `MachineRecoveryView` approved claims.
  - Wire `ProfileMenu` sign-out to clear auth token and reload, and link Settings to the settings tab.

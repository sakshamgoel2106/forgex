# ForgeX AI — Technical Audit: Current Implementation

**Audit Date:** October 20, 2026  
**Auditor Role:** Principal Software Architect & Independent QA Auditor  
**Audit Scope:** Entire repository (`apps/api`, `apps/web`, `packages/shared-types`, `docs/`)  
**Audit Constraint:** READ-ONLY AUDIT. Zero modifications to runtime code, dependencies, or configuration.

---

## 1. Executive System Architecture Overview

ForgeX AI is configured as an npm monorepo with three workspace packages:
1. `packages/shared-types`: Canonical TypeScript interfaces, enums, DTOs, and API contract payloads.
2. `apps/api`: Node.js / Express backend service written in TypeScript (ESM), utilizing PostgreSQL (`pg`) with an `InMemoryDataStore` fallback, Qdrant/In-memory vector store, local/S3 storage adapters, and multimodal inference abstractions.
3. `apps/web`: React 18 single-page application built with Vite, TailwindCSS, Radix UI primitives, Lucide icons, and Three.js.

```
+----------------------------------------------------------------------------------------------------+
|                                      FORGEX AI ARCHITECTURE                                        |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [apps/web (Vite + React 18 + TailwindCSS)]                                                        |
|    - 23 View Components (Overview, Asset Directory, Copilot, Maintenance, Visual, Audit, etc.)    |
|    - Three.js Procedural Canvas (RealThreeDViewerModal)                                            |
|    - Interactive P&ID SVG Viewer (PidEngineeringViewerModal)                                       |
|    - Reverse Proxy: /api, /healthz, /readyz -> http://localhost:4000                                 |
|                                                                                                    |
|                                         | (HTTP / REST + JWT Bearer)                               |
|                                         v                                                          |
|  [apps/api (Express 4 + TypeScript ESM)]                                                           |
|    - Router / Controller Layer (Auth, Org, Plants, Assets, Machines, Documents, Copilot, Maint)   |
|    - Core Services:                                                                                |
|        * RAGQueryEngine (Intent classification, multi-step filter, vector query, rerank, citation) |
|        * MaintenanceWorkflowEngine (Symptom diagnosis, LOTO checklists, repair review)             |
|        * MachineRecoveryService (Nameplate evidence intake, claim extraction, anti-self-approval)  |
|        * VisualIntelligenceEngine (Image/schematic inspection, label filtering, RAG grounding)     |
|        * SecurityEventService (Threat detection, tamper-evident audit ledger)                      |
|                                                                                                    |
|    - Adapters & Infrastructure:                                                                    |
|        * DataStore: PgDataStore (13 SQL migrations) | InMemoryDataStore (4,280 LOC)                |
|        * Storage: LocalStorageAdapter (file-system) | S3StorageAdapter (passthrough shell)         |
|        * Vector: QdrantVectorStoreAdapter (HTTP fetch) | InMemoryVectorStoreAdapter                 |
|        * Inference: OllamaEnterpriseAdapter (local) | CloudSaasAdapter (mock) | LocalDev (rules)   |
|        * Vision: OllamaEnterpriseVision (local) | CloudVisionAdapter (mock) | LocalDevVision       |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Module-by-Module Technical Inspection

### 2.1 Identity, Authentication & Access Control (RBAC)
- **Primary Files:**
  - [`apps/api/src/routes/auth.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/auth.routes.ts)
  - [`apps/api/src/routes/badge.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/badge.routes.ts)
  - [`apps/api/src/middleware/auth.middleware.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/middleware/auth.middleware.ts)
  - [`apps/api/src/auth/authAdapterFactory.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/auth/authAdapterFactory.ts)
  - [`apps/api/src/auth/localDevAuthAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/auth/localDevAuthAdapter.ts)
  - [`apps/api/src/auth/supabaseAuthAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/auth/supabaseAuthAdapter.ts)
- **Implemented Capabilities:**
  - Organization registration transaction with owner provisioning (`POST /api/v1/auth/register-org`).
  - Standard email/password login and token issuance (`POST /api/v1/auth/login`).
  - Employee Badge & PIN login (`POST /api/v1/auth/badge-login`).
  - Server-side JWT authentication middleware (`createAuthMiddleware`) validating tenant ID, user ID, active membership, and plant assignments.
  - Multi-tenant role authorization gate (`requireRole`).
  - Cross-plant access gating (`requirePlantAssignment`).
- **Observed Gaps & Defects:**
  - Badge PIN hashing uses a hardcoded static salt: `const salt = 'forgex_badge_salt_2026'` in both `badge.routes.ts:15` and `auth.routes.ts:301`. It does not use bcrypt or argon2.
  - Passwords in `LocalDevAuthAdapter` are stored/verified as plain text (`user.password === password`).
  - No refresh-token rotation endpoint or httpOnly cookie session handling.

### 2.2 Machine Registry & Asset Mapping
- **Primary Files:**
  - [`apps/api/src/routes/machine.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/machine.routes.ts)
  - [`apps/api/src/routes/mapping.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/mapping.routes.ts)
  - [`apps/api/src/routes/engineering.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/engineering.routes.ts)
- **Implemented Capabilities:**
  - Complete machine registration with data classification (`INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`), documentation readiness (`COMPLETE`, `PARTIAL`, `INCOMPLETE`), and verification state (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`).
  - Machine-to-Specialist mapping with primary and backup specialist routing.
  - Component-to-P&ID mapping linking 3D mesh components to schematic tags (`pidTag`, `pidDrawingNumber`).
  - Storage proxy for drawing retrieval with HMAC token verification.

### 2.3 Document Ingestion & Parsing
- **Primary Files:**
  - [`apps/api/src/ingestion/documentParser.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ingestion/documentParser.ts)
  - [`apps/api/src/ingestion/contentChunker.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ingestion/contentChunker.ts)
  - [`apps/api/src/jobs/ingestionQueue.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/jobs/ingestionQueue.ts)
  - [`apps/api/src/controllers/document.controller.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/controllers/document.controller.ts)
- **Implemented Capabilities:**
  - In-memory job queue with bounded concurrency, retry attempts, and failure state tracking.
  - PDF parsing via `pdf-parse` with page-by-page text extraction.
  - DOCX parsing via `mammoth` with Markdown conversion.
  - Token-aware sliding chunker (500 tokens target, 80 tokens overlap) with heading inheritance.
- **Observed Gaps & Defects:**
  - Scanned PDF OCR is simulated using ASCII regex matching on raw PDF byte streams (`documentParser.ts:204`): `buffer.toString('ascii').match(/[A-Z0-9-]{4,20}/g)`. There is no rasterization or true optical character recognition engine (such as Tesseract or PaddleOCR).

### 2.4 Vector Store & Retrieval
- **Primary Files:**
  - [`apps/api/src/vector/qdrantVectorStoreAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/vector/qdrantVectorStoreAdapter.ts)
  - [`apps/api/src/vector/inMemoryVectorStoreAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/vector/inMemoryVectorStoreAdapter.ts)
  - [`apps/api/src/ai/reranker.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/reranker.ts)
- **Implemented Capabilities:**
  - Cosine distance similarity search filtered by `organizationId` and `plantId`.
  - Reciprocal Rank Fusion (RRF) reranker combining semantic vector scores with keyword match densities.
- **Observed Gaps & Defects:**
  - `QdrantVectorStoreAdapter` wraps all HTTP operations in `try/catch` and silently falls back to `InMemoryVectorStoreAdapter` (`qdrantVectorStoreAdapter.ts:34, 57, 102`). If Qdrant is down in production, points are stored in memory and lost when the container restarts.

### 2.5 RAG Query Engine & Citations
- **Primary Files:**
  - [`apps/api/src/services/ragQueryEngine.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/ragQueryEngine.ts)
  - [`apps/api/src/routes/copilot.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/copilot.routes.ts)
- **Implemented Capabilities:**
  - Intent classification (`MAINTENANCE_HISTORY`, `PROCEDURE_LOOKUP`, `GENERAL_KNOWLEDGE`, `SAFETY_CRITICAL`).
  - Adversarial prompt injection defense (`system override`, `ignore previous instructions`).
  - Safety-critical interlock bypass detection with automatic specialist ticket generation.
  - Integration of verified machine history records and approved recovery knowledge into evidence context.
  - Refusal to hallucinate operating limits for undocumented machines with automated missing-info task generation.
  - Citation snippet masking for non-admin/viewer roles.

### 2.6 Visual Intelligence Engine
- **Primary Files:**
  - [`apps/api/src/services/visualIntelligenceEngine.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/visualIntelligenceEngine.ts)
  - [`apps/api/src/routes/visual.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/visual.routes.ts)
  - [`apps/api/src/ai/ollamaEnterpriseVisionAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/ollamaEnterpriseVisionAdapter.ts)
  - [`apps/api/src/ai/cloudVisionAdapter.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/cloudVisionAdapter.ts)
- **Implemented Capabilities:**
  - Multipart image upload handling (PNG, JPEG, WebP).
  - Storage of visual assets with plant scoping.
  - Classification of asset types (`PID_RENDER`, `DIAGRAM`, `MANUAL_PAGE`, `PHOTOGRAPH`).
  - Component label confidence thresholding (equipment tag dropped if confidence < 0.70).
  - Ambiguous diagram escalation when degraded linework is detected.
- **Observed Gaps & Defects:**
  - `CloudVisionAdapter.ts` returns a hardcoded mock response (`equipmentTags: ['P-101-A']`) rather than calling an actual cloud vision provider API.

### 2.7 Maintenance Workflow & Specialist Routing
- **Primary Files:**
  - [`apps/api/src/services/maintenanceWorkflowEngine.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/maintenanceWorkflowEngine.ts)
  - [`apps/api/src/routes/maintenance.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/maintenance.routes.ts)
  - [`apps/api/src/routes/specialist.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/specialist.routes.ts)
  - [`apps/api/src/routes/ticket.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/ticket.routes.ts)
- **Implemented Capabilities:**
  - Case creation linked to plant and machine with severity rating.
  - Automated diagnostic hypothesis formulation and citation-grounded LOTO/PPE checklist generation.
  - Safe human escalation when symptoms indicate high-voltage or toxic gas hazards.
  - Technician finding submission with nomination for expert knowledge.
  - Supervisory review gate: transitions case to `RESOLVED` and promotes findings into searchable maintenance history.

### 2.8 Old Machine Knowledge Recovery
- **Primary Files:**
  - [`apps/api/src/services/machineRecovery.service.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/machineRecovery.service.ts)
  - [`apps/api/src/routes/recovery.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/recovery.routes.ts)
- **Implemented Capabilities:**
  - Registration of legacy machines with explicit unknown fields.
  - Evidence file ingestion (nameplates, manual excerpts, casting marks).
  - Adversarial prompt injection scrubbing from OCR evidence text.
  - Extraction of candidate claims defaulting to `AWAITING_REVIEW`.
  - Four-eyes governance: strict anti-self-approval enforcement (`FORGEX_SELF_APPROVAL_FORBIDDEN`, HTTP 403).
  - Approval by independent engineer superseding legacy values and updating machine readiness percentage.

### 2.9 Security Monitoring, Audit Ledger & Alerting
- **Primary Files:**
  - [`apps/api/src/services/securityEvent.service.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/services/securityEvent.service.ts)
  - [`apps/api/src/routes/audit.routes.ts`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/audit.routes.ts)
- **Implemented Capabilities:**
  - Tamper-evident structured audit logging recording actor, plant, action, category, and timestamp.
  - Rule-based threat detection (repeated cross-plant access, document access spikes, safety bypass attempts).
  - Admin-only access to audit logs and alert resolution workflows.

---

## 3. End-to-End Traced Workflow Inspection

The audit traced the complete execution path through the live application:

```
[1. Org Registration]
  POST /api/v1/auth/register-org
    -> DataStore.registerOrganizationWithAdmin (Org created, Admin created, Membership created)
    -> Issues Admin JWT Token (24h)

[2. Plant & Machine Creation]
  POST /api/v1/plants (Scoped to Org)
  POST /api/v1/machines (Scoped to Plant; qrCodeData assigned as '/machines/ASSET-TAG')

[3. Document Ingestion]
  POST /api/v1/documents/upload (Multer in-memory -> Local/S3 storage)
    -> IngestionQueue.addJob
    -> DocumentParser.parse (Extracts pages, detects scanned vs native)
    -> ContentChunker.chunk (500 token windows)
    -> EmbeddingAdapter.generateEmbedding
    -> VectorStore.upsertPoints (Indexed with tenant/plant metadata)

[4. Secure Copilot Interaction]
  POST /api/v1/copilot/query
    -> SecurityEventService.evaluateCopilotPolicy (RBAC + Plant assignment check)
    -> Vector search with { organizationId, plantId }
    -> Reranker.rerank (Top-K)
    -> Inclusion of Maintenance Records & Approved Machine Claims
    -> GenerationProvider.generateAnswer
    -> PromptDefenseService.scrubSystemSecrets
    -> Citation construction (masked for viewers)
    -> Message & citations persisted to conversation thread

[5. Ticket Escalation & Maintenance]
  If evidence insufficient: Auto-create SpecialistTicket (Routes to Primary/Backup specialist)
  POST /api/v1/maintenance/cases
    -> POST /api/v1/maintenance/cases/:id/diagnose (RAG-backed procedural checklist)
    -> POST /api/v1/maintenance/cases/:id/findings (Technician records repair)
    -> POST /api/v1/maintenance/cases/:id/approval (Supervisor approves -> status: RESOLVED)
    -> Findings become eligible maintenance history

[6. Security Audit Event]
  Any unauthorized attempt (cross-tenant, cross-plant, unauthenticated)
    -> SecurityEventService.recordSecurityEvent
    -> Evaluated against DetectionRules
    -> Persisted to audit ledger, accessible only to ORGANIZATION_ADMIN
```

---

## 4. Comprehensive Feature Classification Inventory

| Feature / Capability | Classification | Verification File / Evidence | Notes |
| :--- | :--- | :--- | :--- |
| **Organization Onboarding & Multi-Tenancy** | **Implemented & verified by executed tests** | `tests/organizationOnboardingAndRbac.test.ts` | Multi-tenant isolation verified across DB, vector, and cache. |
| **RBAC (Admin, Engineer, Tech, Viewer)** | **Implemented & verified by executed tests** | `tests/phase1SecurityFoundation.test.ts` | Server-side role enforcement on all API routes. |
| **Badge + PIN Login** | **Implemented & verified by executed tests** | `tests/machineRegistryAndPhaseB.test.ts` | Verified barcode alone cannot authenticate; requires PIN. Salt is static. |
| **Machine QR Code Generation** | **Implemented & verified by executed tests** | `tests/machineRegistryAndPhaseB.test.ts` | Generates non-sensitive routing string; requires user auth on access. |
| **Camera/In-Browser QR Scanner** | **Missing** | N/A | No camera feed or QR decoding library (e.g. zxing) in web app. |
| **Voice / Speech-to-Text (STT)** | **Missing** | N/A | No Web Speech API, no microphone capture, no backend audio endpoint. |
| **Text-to-Speech (TTS)** | **Missing** | N/A | No speech synthesis engine or audio playback in frontend or API. |
| **Native PDF Ingestion** | **Implemented & verified by executed tests** | `tests/documentIngestion.test.ts` | Native text extracted via `pdf-parse` with page attribution. |
| **Scanned PDF Optical OCR** | **Partially implemented** | `apps/api/src/ingestion/documentParser.ts:204` | Simulated with ASCII regex extraction from byte streams; no pixel OCR engine. |
| **DOCX Document Ingestion** | **Implemented & verified by executed tests** | `tests/documentIngestion.test.ts` | Extracted via `mammoth` with heading preservation. |
| **Document Worker Queue** | **Implemented & verified by executed tests** | `tests/documentIngestion.test.ts` | In-memory asynchronous queue with bounded concurrency and retry logic. |
| **Vector Store (In-Memory)** | **Implemented & verified by executed tests** | `tests/ragCopilot.test.ts` | Cosine similarity with metadata filtering. |
| **Vector Store (Qdrant Cloud/Local)** | **Partially implemented** | `apps/api/src/vector/qdrantVectorStoreAdapter.ts` | HTTP fetch client implemented, but silently falls back to in-memory on error. |
| **Semantic RAG Grounding** | **Implemented & verified by executed tests** | `tests/phase2SecureUniversalCopilot.test.ts` | Retrieved chunks synthesized into answers with source citations. |
| **Citation Integrity & Masking** | **Implemented & verified by executed tests** | `tests/phase5EndToEndProductionReadiness.test.ts` | Verified chunk IDs match citations; non-admins receive redacted snippets. |
| **Hallucination Prevention (Missing Machine)** | **Implemented & verified by executed tests** | `tests/phase2SecureUniversalCopilot.test.ts` | Refuses to estimate operating limits on undocumented machines. |
| **Prompt Injection Defense** | **Implemented & verified by executed tests** | `tests/securityHardeningAndPrivacy.test.ts` | Sanitizes adversarial directives from user queries and OCR nameplates. |
| **Secret Scrubbing in AI Output** | **Implemented & verified by executed tests** | `tests/phase5EndToEndProductionReadiness.test.ts` | Replaces JWT secrets and storage keys with `[REDACTED_SECRET]`. |
| **Local LLM Inference (Ollama)** | **Implemented but unverified** | `apps/api/src/ai/ollamaEnterpriseAdapter.ts` | Code exists and tested via mocks, but live Ollama node not bound in CI test. |
| **Cloud SaaS LLM Inference** | **UI/mock only** | `apps/api/src/ai/cloudSaasAdapter.ts` | Returns formatted string template; does not call external OpenAI/Gemini API. |
| **Visual Intelligence (Image Inspection)** | **Implemented & verified by executed tests** | `tests/visualIntelligence.test.ts` | Multipart upload, storage, and confidence-filtered component labeling. |
| **Diagram Understanding (P&ID Topology)** | **Partially implemented** | `apps/api/src/services/visualIntelligenceEngine.ts` | Identifies component tags, but explicit notice confirms symbol topology requires manual walkdown. |
| **3D / CAD Assembly Viewer** | **UI/mock only** | `apps/web/src/components/views/RealThreeDViewerModal.tsx` | Renders 5 hardcoded procedural Three.js primitives; no CAD/STEP/GLTF loader. |
| **Interactive P&ID Viewer** | **UI/mock only** | `apps/web/src/components/views/PidEngineeringViewerModal.tsx` | Static inline SVG with hardcoded pump symbol; does not render uploaded drawings. |
| **Maintenance Case Workflow** | **Implemented & verified by executed tests** | `tests/maintenanceWorkflows.test.ts` | Symptom diagnosis -> LOTO checklist -> findings -> supervisory sign-off (`RESOLVED`). |
| **Recurring Fault Detection** | **Implemented & verified by executed tests** | `tests/maintenanceHistoryAndRecurringFaults.test.ts` | Window-based recurrence frequency analysis and safety limit alerts. |
| **Specialist Directory & Ticket Routing** | **Implemented & verified by executed tests** | `tests/confidentialKnowledgeAndSpecialistRouting.test.ts` | Primary/backup routing based on machine mapping and availability status. |
| **Old Machine Knowledge Recovery** | **Implemented & verified by executed tests** | `tests/phase3OldMachineKnowledgeRecovery.test.ts` | Evidence intake, candidate claims, anti-self-approval enforcement (HTTP 403). |
| **Cross-Machine Issue Analytics** | **Missing** | N/A | No platform-wide analytics API or dashboard aggregating frequently reported issues. |
| **Expert Knowledge & Tribal Wisdom View** | **UI/mock only** | `apps/web/src/components/views/ExpertKnowledgeView.tsx` | Operates on hardcoded in-memory state; disconnected from backend `/api/v1/knowledge`. |
| **Troubleshooting Quick-Guide View** | **UI/mock only** | `apps/web/src/components/views/TroubleshootingView.tsx` | Contains hardcoded array of 3 fault records; does not query maintenance history API. |
| **Settings & Inference Policy View** | **Partially implemented** | `apps/web/src/components/views/SettingsView.tsx` | Toggles UI state with a temporary banner; does not persist configuration to backend. |
| **User Profile Management** | **UI/mock only** | `apps/web/src/components/watermelon/.../profile-menu.tsx` | Dropdown items ("Profile", "Settings", "Sign out") lack click handlers and routes. |
| **Security Event & Threat Monitoring** | **Implemented & verified by executed tests** | `tests/securityEventMonitoring.test.ts` | Automated detection rules, alert generation, and admin investigation routes. |
| **Health & Readiness Container Probes** | **Implemented & verified by executed tests** | `tests/deploymentReadiness.test.ts` | `GET /livez`, `GET /readyz`, `GET /api/v1/health`, `GET /api/v1/metrics`. |
| **Air-Gapped Sovereign Enforcement** | **Implemented & verified by executed tests** | `tests/deploymentModes.test.ts` | Rejects cloud configuration in Enterprise mode; guarantees zero egress. |

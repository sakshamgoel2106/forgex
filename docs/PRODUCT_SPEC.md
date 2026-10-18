# ForgeX AI — Product Specification

## 1. Executive Summary & Vision

**ForgeX AI** is a purpose-built, multimodal Generative AI assistant engineered specifically for industrial operations, heavy manufacturing, energy facilities, and plant maintenance teams. 

Unlike generic conversational enterprise chatbots, ForgeX AI bridges the gap between static technical documentation (Standard Operating Procedures, Original Equipment Manufacturer manuals, Piping and Instrumentation Diagrams, engineering schematics, fault code databases) and frontline shop-floor execution. It enables authorized engineers and technicians to rapidly interrogate technical dossiers, interpret dense engineering diagrams and equipment nameplate images, retrieve strict evidence-grounded answers, and follow step-by-step diagnostic workflows with mathematical traceability and audit compliance.

---

## 2. Target Personas & User Classes

| Persona | Role & Context | Primary Needs & Jobs to Be Done | Key Frustrations with Existing Tools |
| :--- | :--- | :--- | :--- |
| **Field Maintenance Technician** | On-site, ruggedized tablet/laptop, active machinery breakdown. | Instant access to torque specs, teardown sequences, fault code lookup, and visual verification of component assemblies. | Paper binders, 800-page unsearchable PDFs, poor mobile search, lack of verified torque/pressure tolerances. |
| **Plant Reliability & Asset Engineer** | Control room or engineering office, fleet-level uptime monitoring. | Cross-referencing OEM maintenance intervals, Root Cause Analysis (RCA) records, warranty constraints, and P&ID diagrams. | Siloed OEM manuals across disparate drives; hallucinations in generic AI tools that invent non-existent parts. |
| **Operations & Shift Supervisor** | Shop floor management, shift turnover, worker safety compliance. | Confirming lockout-tagout (LOTO) procedures, job safety analyses (JSA), operator sign-offs, and skill-level clearance. | Unclear SOP revision histories; technicians using outdated photocopied procedure sheets. |
| **Safety & Quality Auditor** | Internal/external compliance and regulatory review (OSHA, ISO 9001, ASME). | Complete audit trails of procedures consulted, versioned citations, evidence timestamps, and adherence verification. | "Black box" AI queries without traceable line-item citations or verifiable document page snapshots. |
| **Industrial System Administrator** | Plant IT / OT cybersecurity and identity management. | Strict Role-Based Access Control (RBAC), multi-tenant plant isolation, on-premise air-gapped inference capability, and credential protection. | Cloud-only SaaS exposing sensitive plant blueprints and IP to public LLM training pipelines. |

---

## 3. Product Goals & Success Metrics

### 3.1 Quantitative Performance Goals
1. **Zero Unverified Hallucinations**: Every diagnostic advisory and numerical tolerance (pressure, voltage, torque, clearance) must explicitly cite verified source document ID, section, and page coordinates with visual bounding box references.
2. **Sub-2-Second Grounded Retrieval**: Vector + lexical hybrid search over 100,000+ pages of technical manuals yielding relevant passages in `< 1.8s`.
3. **Multimodal Schema Understanding**: High-fidelity parsing of complex technical schematics, circuit diagrams, exploded assembly views, and tabular specifications with visual cross-referencing.
4. **Air-Gap & Sovereign Deployability**: Full operational capability inside on-premise plant networks using local inference runtimes (e.g., Ollama / vLLM) with zero mandatory external SaaS egress.

### 3.2 Qualitative User Experience Goals
- **Mission-Critical Industrial UI**: High-contrast, restrained graphite aesthetic optimized for industrial environments, glare, and gloved/stylus tablet use.
- **Workflow-Driven Guided Diagnostics**: Step-by-step execution trees with safety checkpoints, PPE confirmations, and conditional branches rather than endless free-form text walls.
- **Audit-Ready Evidence Panels**: Side-by-side verification view rendering the original OEM manual page alongside the AI synthesis.

---

## 4. Core Workflows

### 4.1 Secure Technical Document Ingestion & Multimodal Chunking
1. **Upload & Quarantine**: Ingestion of multi-gigabyte PDF, CAD, TIFF, and DOCX files into encrypted staging storage.
2. **Pre-processing & Security Scanning**: Virus/malware verification, MIME-type enforcement, tenant ownership assignment, and asset metadata association (Plant Unit, Line ID, Equipment Tag).
3. **Multimodal Extraction Pipeline**:
   - Layout-aware OCR extracts text hierarchies, headers, warnings, cautions, and tabular matrices.
   - Image segmentation extracts exploded schematics, wiring diagrams, and P&ID figures, generating semantic image embeddings and descriptive synthetic metadata.
4. **Hybrid Indexing**:
   - Dense vector embeddings indexed in Qdrant with payload metadata filters (Tenant ID, Asset Tag, Clearance Level).
   - Lexical sparse indices populated in PostgreSQL for exact part numbers, fault codes (e.g., `E-704-B`), and model identifiers.

### 4.2 Evidence-Backed Knowledge Retrieval & Inspection
1. **Query Ingestion**: Field engineer inputs natural language questions, exact fault codes, or uploads equipment photos (e.g., burned relay, damaged impeller).
2. **Context Routing & Authorization Filtering**: Query parsed with user role, assigned plant location, and equipment tags. Vector retrieval applies hard tenant and security filters prior to semantic distance computation.
3. **Reranking & Grounding**: Candidate passages scored via Cross-Encoder reranker. Low-confidence thresholds trigger an explicit *"Information not found in authorized documentation"* response rather than speculative synthesis.
4. **Interactive Evidence Viewer**: Frontend renders the verified answer alongside a PDF/image viewer highlighting exact snippet coordinates, revision dates, and active change notices.

### 4.3 Guided Troubleshooting & Interactive Maintenance Procedures
1. **Procedure Instantiation**: User selects or is guided into an active SOP (e.g., *"Centrifugal Pump Mechanical Seal Overhaul — SOP-MTR-042"*).
2. **Safety Gates (LOTO & PPE)**: System mandates explicit technician acknowledgement of isolation points, electrical interlocks, and required safety gear before unlocking subsequent steps.
3. **Step Execution & Multimodal Verification**:
   - Step instructions rendered with exact tool requirements, torque values, and warning callouts.
   - Technician can submit photos of current assembly for visual verification against OEM reference diagrams.
4. **Deviation & Anomaly Flagging**: If a measured value (e.g., clearance gauge reading `0.45mm`) exceeds manual tolerance (`0.15 - 0.25mm`), ForgeX AI prompts immediate escalation protocol and logs the deviation to the audit ledger.

---

## 5. Explicit Out-of-Scope Features (Phase 1 & Non-Goals)

To maintain safety, compliance, and rigorous engineering focus, the following are **explicitly out-of-scope**:

1. **Autonomous SCADA/PLC Actuation**: ForgeX AI will **never** directly issue write commands to industrial programmable logic controllers (PLCs), distributed control systems (DCS), or emergency shutdown valves. It is an advisory and decision-support system, not an autonomous controller.
2. **Ungrounded Conversational "Chit-Chat"**: Free-form unverified general-knowledge chatting is disabled. The system will not answer queries outside the scope of ingested industrial documentation and plant context.
3. **Public Web Crawling & Unaudited Search**: ForgeX AI does not perform unrestricted public web search to fill knowledge gaps. All technical answers must derive from authorized, customer-ingested plant assets.
4. **Bypassing Document Classification & RBAC**: A user with "Operator" clearance cannot view "Confidential Engineering Overhauls" or proprietary vendor contracts, regardless of prompt phrasing or injection techniques.
5. **Direct Replacement of Certified Human Inspectors**: The system acts as a high-precision force multiplier; regulatory sign-offs remain with certified human engineers.

---

## 6. Regulatory & Compliance Context

ForgeX AI is designed in alignment with:
- **OSHA 1910.147**: The Control of Hazardous Energy (Lockout/Tagout).
- **ISO 9001 / ISO 55001**: Quality Management and Asset Lifecycle Management Documentation.
- **NIST SP 800-82 Rev 3**: Guide to Operational Technology (OT) Security.
- **SOC 2 Type II & GDPR**: Data protection, immutable audit trails, and strict organizational tenant isolation.

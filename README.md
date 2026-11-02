# ForgeX AI — Multimodal GenAI Assistant for Industrial Operations

> **Phase 1: Greenfield Engineering Foundation**  
> Operational Boundary: OT Network / Purdue Level 3.5 Industrial Engineering Workspace

ForgeX AI is a software prototype for industrial document workflows, maintenance guidance, and AI-assisted troubleshooting. The repository contains API/UI features and automated tests, but tests do not establish production readiness, diagnostic accuracy, regulatory compliance, or suitability for safety-critical decisions. Feature status and evidence boundaries are listed below.

The codebase has SaaS/cloud and private Enterprise deployment adapters. They are prototype deployment paths, not independently certified or operationally validated offerings.

---

## 1. Monorepo Architecture (pnpm Workspaces)

```
forgex-ai/
├── apps/
│   ├── web/                     # React 18, Vite, TypeScript, Tailwind CSS
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── layout/      # Reusable HeaderRail & SidebarNav (10 Modules)
│   │   │   │   ├── ui/          # Reusable UI Suite: Button, Input, Card, Modal, AlertBanner, EmptyState, StatusBadge
│   │   │   │   └── views/       # Overview, Plants & Assets, Knowledge Hub, AI Copilot, Visual Intelligence,
│   │   │   │                    # Troubleshooting, Maintenance, Expert Knowledge, Security & Audit, Settings
│   │   │   ├── App.tsx          # Dynamic Industrial Engineering Shell & Telemetry Inspector
│   │   │   └── main.tsx
│   │   ├── e2e/                 # Playwright End-to-End Test Suite
│   │   ├── playwright.config.ts # Multi-device E2E config (Desktop & Industrial Tablet)
│   │   ├── tailwind.config.js   # Graphite design system tokens & monospace typography
│   │   └── vite.config.ts       # Reverse proxy to backend API
│   ├── api/                     # Node.js, Express, TypeScript (Strict ESM)
│   │   ├── src/
│   │   │   ├── config/env.ts    # Zod runtime validation with fail-fast boot protection
│   │   │   ├── utils/logger.ts  # Structured Pino logging with ISO timestamps
│   │   │   ├── services/        # HealthService (Postgres, Qdrant, MinIO, Redis, Ollama)
│   │   │   ├── controllers/     # HealthController (/healthz, /livez, /readyz, /api/v1/health)
│   │   │   ├── routes/          # Health & diagnostics routes
│   │   │   ├── app.ts           # Hardened Express application (Helmet, CORS, Error boundaries)
│   │   │   └── server.ts        # Server entrypoint with graceful shutdown handling
│   │   └── tests/
│   │       └── health.test.ts   # Vitest unit & integration test suite
│   └── worker/                  # Python 3.12+ (Layout OCR & Visual Cropping Skeleton)
│       ├── main.py              # FastAPI health & worker entrypoint
│       └── requirements.txt     # PyMuPDF, Pillow, Qdrant client, Boto3
├── packages/
│   └── shared-types/            # Shared TypeScript domain contracts, DTOs & RBAC bitmasks
│       └── src/
│           ├── roles.ts         # User roles, permissions, bitmasks
│           ├── documents.ts     # Document metadata, chunks & BoundingBox contracts
│           ├── sop.ts           # SOP steps, LOTO/PPE safety gates, execution runs
│           ├── telemetry.ts     # Industrial asset tags, site hierarchy, sensor thresholds
│           ├── api.ts           # Standard ApiResponse & HealthCheckResponse envelopes
│           └── index.ts
├── infra/
│   ├── docker-compose.yml       # PostgreSQL 16, Redis 7 (BullMQ), Qdrant, MinIO S3, Ollama
│   └── env/
│       └── .env.example         # Master environment variables template
├── docs/
│   ├── PRODUCT_SPEC.md          # Product goals, personas, workflows, out-of-scope boundaries
│   ├── ARCHITECTURE.md          # Component boundaries, data flows, deployment modes, Purdue L3.5
│   ├── DATA_MODEL.md            # PostgreSQL relational schema, Qdrant collection, Redis queues
│   ├── API_CONTRACTS.md         # REST API endpoints, DTO contracts, and error code taxonomy
│   ├── SECURITY.md              # RBAC matrix, 3-tier tenant isolation, air-gap & audit rules
│   ├── AI_PIPELINE.md           # Multimodal layout OCR, diagram segmentation, hybrid retrieval
│   ├── TESTING.md               # Multi-tier QA strategy: Vitest, Playwright, Grounding benchmarks
│   └── IMPLEMENTATION_PLAN.md   # 6-phase engineering roadmap & acceptance criteria
├── pnpm-workspace.yaml          # pnpm workspace definition
├── package.json                 # Monorepo root script orchestration
├── tsconfig.base.json           # Strict shared TypeScript base configuration
├── .gitignore                   # Comprehensive Node, Python, Docker & Secret exclusion rules
├── .env.example                 # Root environment template
└── README.md                    # Operational guide & local run instructions
```

---

## 2. Prerequisites

- **Node.js**: `v20.x` or `v22.x+` (verified on v24.16.0)
- **pnpm**: `v9.x` or `v10.x+` (or via `npx pnpm`)
- **Python**: `v3.11+` (for Document Processing Worker)
- **Docker & Docker Compose**: For local infrastructure services

---

## 3. Quick Start & Local Setup

### Step 1: Install Dependencies
From the repository root, install dependencies across all workspaces:
```bash
# Using pnpm:
pnpm install

# Or using npx:
npx pnpm install
```

### Step 2: Configure Environment Variables
Copy the master template to `.env`:
```bash
cp infra/env/.env.example .env
```

### Step 3: Launch Local Infrastructure
Start all core background services via Docker Compose:
```bash
docker compose -f infra/docker-compose.yml up -d
```
This spins up:
- **PostgreSQL 16** on port `5432`
- **Redis 7** (for BullMQ queue orchestration) on port `6379`
- **Qdrant Vector DB** on REST port `6333` and gRPC port `6334`
- **MinIO Object Storage** on S3 port `9000` and Console port `9001`
- **Ollama Private LLM Engine** on port `11434`

### Step 4: Build All Workspaces
Compile the shared types, backend API, and frontend web bundle:
```bash
pnpm -r run build
# Or:
npm run build
```

### Step 5: Run Automated Tests
Execute backend health, configuration validation, and error envelope tests:
```bash
pnpm -r run test
# Or:
npm run test
```

### Step 6: Start Development Servers
Run the backend gateway and frontend engineering workspace concurrently:

- **Windows Quick Start (One-Click Launcher)**:
  Double-click `start.bat` (or run in terminal):
  ```cmd
  start.bat
  ```
  *(Launches both API and Web UI in dedicated console windows and opens `http://localhost:5173` in your browser).*

- **Start Core API Gateway** (Port 4000):
  ```bash
  pnpm run dev:api
  ```
- **Start Industrial Workspace UI** (Port 5173):
  ```bash
  pnpm run dev:web
  ```
- **Stop All Servers & Free Ports**:
  ```cmd
  stop-servers.bat
  ```

---

## 4. Feature Status & Evidence Snapshot

Statuses describe repository evidence, not a production-readiness or safety approval:
- **Working (software workflow)**: relevant code paths and automated tests exist; external integrations and operational suitability may still be unverified.
- **Prototype**: code paths or tests exist, but real-world performance, model accuracy, or deployment behavior has not been validated.
- **Planned / unverified**: no complete supported implementation and verification evidence were found in this repository.

| Feature | Status | Evidence and limits |
| :--- | :--- | :--- |
| Overview dashboard | **Prototype** | UI exists; KPI/anomaly values depend on configured and seeded data. Production telemetry integration is not established by the UI alone. |
| Plants and assets | **Working (software workflow)** | API/UI paths and tests exist for plant/asset records. Live PLC/SCADA telemetry or equipment control is not implied. |
| Document ingestion and Knowledge Hub | **Working (software workflow)** | API integration tests cover supported upload, parsing, and indexing flows. Parser/model coverage and production storage operations depend on configuration. SHA-256 file checksums detect content changes; they do not make audit records immutable. |
| Troubleshooting and RCA | **Prototype** | RCA/case workflows have automated tests; hypothesis correctness and field outcomes have not been benchmarked. |
| Maintenance/SOP workflows | **Working (software workflow)** | Workflow and safety-gate API tests exist. No PLC, actuator, or other control-system execution is implied; a qualified person remains responsible for field safety. |
| Expert knowledge repository | **Working (software workflow)** | Note submission, review, retrieval, and related API flows have automated tests; knowledge quality depends on human review and source data. |
| AI Copilot / RAG | **Prototype** | Retrieval, authorization, generation, and citation tests exist. No calibrated answer-correctness benchmark or verified confidence threshold is published. |
| Voice assistant / speech | **Prototype** | Voice UI and provider interfaces exist. Current provider paths include deterministic fallback behavior; real speech recognition/synthesis accuracy and service integration are not established by unit tests. |
| Acoustic diagnosis | **Prototype** | Diagnostic logic and automated tests exist. No representative, labeled field dataset or measured sensitivity/false-alarm rate is supplied. |
| Visual intelligence | **Prototype** | Image-analysis code and tests exist. No field-validated fault-detection accuracy, supported-condition matrix, or safety certification is supplied. |
| 3D/CAD viewers | **Prototype** | Viewer and file-processing paths exist. Geometric fidelity and engineering-use validation across OEM CAD files are not established. |
| SaaS and Enterprise deployment modes | **Prototype** | Provider/configuration paths exist. End-to-end hosted SaaS and isolated plant deployments have not been independently operationally validated here. |
| Audit event logging | **Working (event logging)** | Audit-event persistence and tests exist. Hash chaining, append-only enforcement, WORM archival, and compliance certification are **not implemented/verified** by this repository. |
| Settings and inference-mode selection | **Prototype** | Configuration/UI paths exist; some settings are presentation-only and do not persist a runtime deployment change. |
| Mobile use without internet | **Prototype (local server required)** | A client can be used over a plant/local network without internet when the server and dependencies are available locally. Standalone mobile inference or server-free operation is not established. |
| Direct hardware/sensor integration | **Planned / unverified** | No supported PLC, Modbus, OPC UA, or equivalent hardware-control integration was established in this repository. |
| Automated production disaster recovery | **Planned / unverified** | Local in-memory storage is a development fallback, not PostgreSQL failover, backup, restore, or data reconciliation. |

---

## 5. End-to-End Testing (Playwright)

To run the Playwright browser test suite verifying all 10 navigation modules and the health modal:
```bash
pnpm --filter @forgex/web run test:e2e
# Or:
npm run test:e2e
```

---

## 6. Subsystem Verification Checklist

| Subsystem | Port | Endpoint / Console | Description |
| :--- | :--- | :--- | :--- |
| **ForgeX Web Shell** | `5173` | `http://localhost:5173` | Industrial Graphite Workspace |
| **ForgeX API Gateway** | `4000` | `http://localhost:4000/api/v1/health` | Node.js Express Core Service |
| **PostgreSQL 16** | `5432` | `localhost:5432` | Relational Store & Audit Ledger |
| **Redis 7** | `6379` | `localhost:6379` | BullMQ Asynchronous Task Broker |
| **Qdrant Vector Store** | `6333` | `http://localhost:6333/dashboard` | Multimodal Vector Database |
| **MinIO Object Store** | `9001` | `http://localhost:9001` | S3 Storage Console (`forgex_minio_admin`) |
| **Ollama Local LLM** | `11434`| `http://localhost:11434` | Air-Gapped Sovereign Inference |

---

## 7. Security Controls & Boundaries

1. **Enterprise network isolation**: the included Enterprise Compose network is configured as an internal Docker network. This constrains containers attached to that network; host operating-system traffic, other containers/networks, physical plant networks, and deployment-specific firewall rules remain the operator's responsibility.
2. **Outbound application guard**: the API wraps Node.js `globalThis.fetch` in strict Enterprise mode. This is defense-in-depth, not a universal interceptor for every runtime, native client, subprocess, or Python library.
3. **Authorization**: API tests exercise tenant, plant, and role authorization paths. This is not a substitute for deployment security testing.
4. **Maintenance safety gates**: software workflow checks do not certify OSHA compliance or replace site procedures, training, or qualified human sign-off.
5. **No secrets in source**: production secrets must be supplied through deployment secrets management; example Compose defaults are for local development only and must be overridden.

---

## 8. Enterprise Local-Network Deployment

The included [infra/docker-compose.yml](./infra/docker-compose.yml) describes an Enterprise-oriented local stack. Its services communicate on a Docker internal network. “Offline” here means **no internet is required for runtime, while the client still needs a connection to the local ForgeX server and its plant-network services**. It does not mean the phone can operate without a network or server. SaaS is a separate cloud-connected deployment path and is not air-gapped.

The Compose network is a container-level control, not proof of zero packets from the host or the entire plant. Validate the built deployment with host/network firewall rules and packet capture before making a zero-egress claim. Preload container images, dependencies, and model weights through an approved offline transfer process; build-time downloads are not runtime-isolated by this network.

### 1. Configuration & Secrets (.env)

Create your enterprise deployment `.env` file from placeholders. **Never hardcode secrets**:

```bash
# Relational Store
POSTGRES_USER=forgex_admin
POSTGRES_PASSWORD=your_secure_postgres_password_here
POSTGRES_DB=forgex_db
POSTGRES_PORT=5432

# MinIO S3 Object Storage
MINIO_ROOT_USER=forgex_minio_admin
MINIO_ROOT_PASSWORD=your_secure_minio_password_here
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
S3_BUCKET_NAME=forgex-documents

# Qdrant Vector Store (No external API key required)
QDRANT_PORT=6333

# Ollama Local LLM & Vision
OLLAMA_PORT=11434
LLM_MODEL=llama3.2
LLM_VISION_MODEL=llava
EMBED_MODEL=nomic-embed-text

# API & Security
JWT_SECRET=your_secure_jwt_secret_here
API_PORT=4000
WEB_PORT=80
```

### 2. Launch the Air-Gapped Stack

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 3. Pull Required On-Premise Models into Ollama

Once the Ollama container is running, pull the chat reasoning model, vision model, and embedding model:

```bash
# 1. Pull Chat Model (e.g., Llama 3.2 3B/8B or Qwen 2.5 14B)
docker exec -it forgex-enterprise-ollama ollama pull ${LLM_MODEL:-llama3.2}

# 2. Pull Vision Diagnostic Model (for gauge readings & LOTO verification)
docker exec -it forgex-enterprise-ollama ollama pull ${LLM_VISION_MODEL:-llava}

# 3. Pull Dense Embedding Model (e.g., nomic-embed-text or bge-m3)
docker exec -it forgex-enterprise-ollama ollama pull ${EMBED_MODEL:-nomic-embed-text}
```

*Note: In fully disconnected air-gapped facilities, pre-load models onto USB/internal registry and mount them directly into the `forgex_enterprise_ollama_models` volume.*

### 4. Verify Air-Gap System Health

Access the web interface at `http://localhost`. Administrators will see the live **"System Health & Air-Gap Telemetry"** dashboard showing:
- **LLM Inference**: Local Ollama model status & response latency.
- **Vector DB**: Qdrant collection status with dynamic embedding dimension auto-detected from `${EMBED_MODEL}` (e.g. 768 / 1024 dims). If an existing collection has a different dimension, a clear error and re-index instruction is given.
- **Storage**: MinIO S3-compatible path-style bucket status (`S3_FORCE_PATH_STYLE=true`).
- **Database**: PostgreSQL connection readiness.
- **Worker**: Asynchronous ingestion and outbox relay status.
- **Outbound guard**: the API `fetch` wrapper rejects non-allowlisted destinations in strict Enterprise mode. This health display is not a system-wide egress measurement.

### 5. Single-Origin Mode (`SERVE_WEB=true`) & On-Prem HTTPS

In air-gapped on-premise environments, ForgeX can serve the built frontend web app directly from the API backend on a single port:

```bash
# In apps/api/.env or container environment:
SERVE_WEB=true
```

- **Zero CORS Issues**: The frontend SPA and backend API share the exact same origin.
- **PWA Ready**: The web app can be installed as a PWA directly from the plant server.
- **Hardware Access Requires HTTPS**:
  - Web browsers require a **Secure Context (HTTPS or localhost)** to enable `navigator.serviceWorker`, camera capture (`getUserMedia` for LOTO verification and QR scanning), and microphone access (Voice Copilot).
  - Pre-configured reverse proxy configurations for on-premise TLS termination are provided in `deploy/caddy/Caddyfile` and `deploy/nginx/nginx-tls.conf`.
  - For full step-by-step certificate guidance (mkcert, corporate internal CA, Active Directory), see [docs/ON_PREM_HTTPS.md](file:///e:/BIG%20PROJECTS/New%20folder/docs/ON_PREM_HTTPS.md).

### 6. Checking Browser Requests (Client Only)

This check observes browser-originated requests only; it does not verify API, worker, container, host, or plant-network egress:

1. Build the production web bundle:
   ```bash
   npm --prefix apps/web run build
   ```
2. Start the server (either with `SERVE_WEB=true` or via Docker Compose).
3. Open Google Chrome, Chromium, or Microsoft Edge to your on-premise URL.
4. Press `F12` to open **Developer Tools** and navigate to the **Network** tab.
5. In the Network tab filter:
   - Check **Preserve log** and **Disable cache**.
   - In the filter input box, type `-domain:localhost` (or `-domain:<your-onprem-ip>`).
6. Reload the application (`Ctrl + Shift + R`).
7. **Expected Result**: No unexpected external browser origins should appear.
   - Fonts (`@fontsource/inter` and `@fontsource/jetbrains-mono`) load locally from `/assets/*.woff2`.
   - PDF Worker loads locally from `/assets/pdf.worker.min-*.mjs`.
   - Three.js 3D viewers use local studio lighting with 0 remote HDR downloads.
   - Google Identity Services (`gsi/client`) is not loaded in Enterprise mode.
   - No external CDNs, tracking pixels, or third-party origins are contacted.

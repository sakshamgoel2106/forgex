# ForgeX AI — Multimodal GenAI Assistant for Industrial Operations

> **Phase 1: Greenfield Engineering Foundation**  
> Operational Boundary: OT Network / Purdue Level 3.5 Industrial Engineering Workspace

ForgeX AI is a purpose-built, multimodal AI assistant designed for industrial plants, refineries, chemical facilities, and discrete manufacturing complexes. It ingests complex technical documents (SOPs, OEM manuals, P&IDs, wiring schematics), segments engineering diagrams, extracts tabular tolerances, and delivers strictly evidence-grounded diagnostic guidance with audit-verifiable citations and OSHA 1910.147 Lockout/Tagout (LOTO) safety enforcement.

Both **SaaS Cloud Inference** (Azure OpenAI / FedRAMP isolated) and **Private Enterprise Inference** (Local Ollama / vLLM air-gapped runtimes) share the exact same business logic and API contracts.

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

- **Start Core API Gateway** (Port 4000):
  ```bash
  pnpm run dev:api
  ```
- **Start Industrial Workspace UI** (Port 5173):
  ```bash
  pnpm run dev:web
  ```

---

## 4. Proposed Navigation Modules (Available in Web Shell)

| Module ID | Navigation Label | Operational Functionality |
| :--- | :--- | :--- |
| `overview` | **Overview** | Facility-wide KPI cards, active vibration anomalies, priority SOP shortcuts. |
| `plants-assets` | **Plants & Assets** | P&ID hierarchy, machine operational states, vibration RMS & bearing temperatures. |
| `knowledge-hub` | **Knowledge Hub** | Catalog of ingested technical documents, OEM manuals, page counts, SHA-256 hashes. |
| `ai-copilot` | **AI Copilot** | Grounded diagnostic reasoning terminal with strict citations and grounding scores. |
| `visual-intelligence` | **Visual Intelligence** | Exploded schematic diagram viewer with interactive AI bounding box overlay (`[x1,y1,x2,y2]`). |
| `troubleshooting` | **Troubleshooting** | Interactive fault code catalog (`E-402`, `E-704`), root cause triage, and linked SOPs. |
| `maintenance` | **Maintenance** | Interactive SOP procedure execution runner with OSHA 1910.147 LOTO gate and torque verification. |
| `expert-knowledge` | **Expert Knowledge** | Tacit field notes repository, tribal knowledge capture, and technician lessons learned. |
| `security-audit` | **Security & Audit** | Tamper-evident ledger with SHA-256 request hashes and OSHA/ISO verification states. |
| `settings` | **Settings** | Inference mode selection (Local Ollama vs Managed SaaS Cloud) and air-gap toggles. |

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

## 7. Security Rules & Guardrails Enforced

1. **Air-Gap Data Sovereignty**: Zero outbound cloud telemetry or inference traffic in on-premise deployment mode.
2. **Pre-Retrieval RBAC**: Vector searches in Qdrant and relational queries in PostgreSQL enforce hard `tenant_id` and asset clearance boundaries before candidate ranking.
3. **OSHA 1910.147 Compliance**: Procedure steps with safety gates enforce mandatory technician sign-off prior to advancing execution.
4. **No Secrets in Source**: All credentials, tokens, and endpoints are runtime-validated via Zod schemas and loaded from environment variables.

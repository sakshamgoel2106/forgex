# ForgeX AI — Production Deployment & Environment Guide

ForgeX AI supports two first-class deployment paradigms sharing identical domain business logic, authorization rules, and API contracts:

1. **Multi-Tenant Cloud SaaS**: Managed cloud infrastructure, Supabase Auth, cloud object storage (AWS S3), managed Qdrant Cloud, explicit cloud inference, tenant rate limits, and usage quotas.
2. **Private Enterprise / Air-Gapped On-Premises**: Self-contained internal infrastructure, Keycloak OIDC/SAML authentication, MinIO, Redis/BullMQ, local Qdrant, local document worker, and air-gapped Ollama inference.

---

## 1. Architectural Matrix

| Dimension | Multi-Tenant Cloud SaaS | Private Enterprise Air-Gapped |
| :--- | :--- | :--- |
| **Deployment Mode** | `DEPLOYMENT_MODE=saas` | `DEPLOYMENT_MODE=enterprise` |
| **Identity & SSO** | Supabase Auth (`AUTH_PROVIDER=supabase`) | Keycloak OIDC / SAML (`AUTH_PROVIDER=keycloak`) |
| **Relational Database** | AWS Aurora / Managed PostgreSQL 16 | Internal PostgreSQL 16 Container |
| **Vector Database** | Qdrant Cloud (Managed Cluster) | Self-hosted Qdrant Container |
| **Object Storage** | AWS S3 / Cloudflare R2 | MinIO (S3-compatible) |
| **Async Queues** | AWS ElastiCache / Redis Cloud | Redis 7 Container with BullMQ |
| **Inference Provider** | Explicit Cloud AI (`Azure OpenAI` / `OpenAI`) | Air-Gapped Local Ollama (`llama3.2`, `llava`) |
| **Fallback Policy** | Fails closed on provider error | **Strictly no cloud fallback**; fails closed |
| **External Egress** | Allowed for configured cloud API endpoints | **Strictly disabled** (`AIR_GAPPED_MODE=true`) |
| **Telemetry** | Optional sanitized metrics | **Disabled** (`TELEMETRY_ENABLED=false`) |

---

## 2. Hardware, Storage, & Network Requirements

### 2.1 Hardware Sizing Recommendations

| Component | Minimum (Evaluation / Lab) | Recommended Production (100–500 Users) | High Throughput / Multi-Plant |
| :--- | :--- | :--- | :--- |
| **CPU** | 8 vCPUs (x86_64 or ARM64) | 16 vCPUs | 32+ vCPUs |
| **System RAM** | 16 GB | 32 GB | 64+ GB |
| **GPU / VRAM** | CPU-only (Ollama quantized) | 1x NVIDIA A10G / L4 (24 GB VRAM) | 2x NVIDIA A100 / H100 (80 GB VRAM) |
| **Disk Storage** | 100 GB NVMe SSD | 500 GB NVMe SSD (RAID-10) | 2+ TB High IOPS SSD / SAN |
| **Network** | 1 Gbps NIC | 10 Gbps NIC | 10 Gbps Redundant Bonded |

### 2.2 Network & Port Allocations

| Port | Service | Direction | Enterprise Mode | SaaS Mode |
| :--- | :--- | :--- | :--- | :--- |
| `80 / 443` | Web (Nginx SPA + Reverse Proxy) | Inbound | Client Web Traffic | Client Web Traffic |
| `4000` | ForgeX Node.js API | Internal / Pod | Core REST & WebSocket | Core REST & WebSocket |
| `5432` | PostgreSQL 16 | Internal | Relational Store | Cloud RDS / Aurora |
| `6379` | Redis 7 | Internal | BullMQ Job Broker | Managed ElastiCache |
| `6333` | Qdrant Vector Engine | Internal | Local Vector DB | Qdrant Cloud |
| `9000` | MinIO API | Internal | Local Object Storage | AWS S3 Endpoint |
| `9001` | MinIO Console | Internal | Storage Admin UI | AWS Console |
| `8000` | Python Document Worker | Internal | Layout & OCR Extraction | Worker Cluster |
| `8080` | Keycloak Identity Provider | Internal | Enterprise SSO | Supabase Auth (HTTPS) |
| `11434` | Ollama Inference Server | Internal | Air-Gapped LLM & VLM | N/A (Cloud AI) |

---

## 3. Local Development Quickstart

To run ForgeX AI locally in developer mode:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Configure local environment variables
cp .env.example apps/api/.env

# 3. Start local development servers (Vite Web + Node.js API with hot reload)
pnpm dev
```

In `NODE_ENV=development` with no `DATABASE_URL` configured, ForgeX automatically defaults to the high-fidelity `InMemoryDataStore`, enabling fast feature development and tests without requiring running database containers.

---

## 4. Enterprise Private Installation (Docker Compose)

The Enterprise release packages all 9 required microservices in `infra/docker-compose.yml`.

### 4.1 Step-by-Step Installation

```bash
# 1. Clone repository and navigate to root
cd /opt/forgex-ai

# 2. Generate and configure enterprise environment variables
cp .env.example infra/.env
# Edit infra/.env to set your secure passwords, secrets, and domain bindings:
# - POSTGRES_PASSWORD
# - KEYCLOAK_ADMIN_PASSWORD
# - JWT_SECRET
# - S3_SECRET_ACCESS_KEY

# 3. Pull or build container images and launch the stack
docker compose -f infra/docker-compose.yml up -d

# 4. Verify that all 9 containers are running and healthy
docker compose -f infra/docker-compose.yml ps
```

### 4.2 Required Local Model Downloads

Once the `ollama` container is healthy, pull the required models into the persistent Ollama storage volume:

```bash
# Dense technical text generation and reasoning
docker exec -it forgex-ollama ollama pull llama3.2

# Vision-language model for P&ID schematics, engineering diagrams, and component visual grounding
docker exec -it forgex-ollama ollama pull llava

# Dense text embeddings for technical chunk indexing
docker exec -it forgex-ollama ollama pull nomic-embed-text
```

### 4.3 Database Migration & Initialization

Database migrations execute automatically on container startup if `DATABASE_URL` is configured. To manually run or dry-run migrations:

```bash
# Execute standalone migration runner inside the API container
docker exec -it forgex-api pnpm run db:migrate
```

### 4.4 Air-Gapped Egress Controls

In strictly air-gapped industrial, nuclear, or defense environments:
- Set `internal: true` in `infra/docker-compose.yml` under `forgex_internal` network to disable internet gateway routing.
- Set `AIR_GAPPED_MODE=true` in `infra/.env`. The ForgeX API strictly forbids external network egress and refuses to initialize third-party cloud SDKs. If an external model is requested, the system immediately rejects the operation with an explicit security fault without leaking data.

---

## 5. Cloud SaaS Deployment

### 5.1 Infrastructure Prerequisites
1. **Managed PostgreSQL**: AWS Aurora Serverless v2 or Supabase Managed PostgreSQL (v16+).
2. **Managed Vector DB**: Qdrant Cloud cluster with API key authentication.
3. **Object Storage**: AWS S3 Bucket (or Cloudflare R2) with configured IAM policies.
4. **Identity**: Supabase Project with Auth enabled (JWT secret and project URL).
5. **Inference**: Azure OpenAI Service or OpenAI API key.

### 5.2 Deployment Procedure

```bash
# 1. Configure production environment
cp .env.example .env
# Set DEPLOYMENT_MODE=saas, AUTH_PROVIDER=supabase, and cloud credentials

# 2. Execute database schema migrations
pnpm --filter @forgex/api run db:migrate

# 3. Build optimized production artifacts
pnpm --filter @forgex/web run build
pnpm --filter @forgex/api run build

# 4. Start the API application
NODE_ENV=production pnpm --filter @forgex/api start
```

### 5.3 SaaS Rate Limiting & Tenant Quotas
- **General API Limiter**: 120 requests/min per IP/token.
- **AI Inference Burst Limiter**: 30 queries/min per organization (`/copilot`, `/visual`, `/maintenance/diagnose`).
- **Monthly Usage Quotas**: Enforced via `TENANT_MONTHLY_QUERY_QUOTA` (default: 50,000 queries) and `TENANT_MAX_STORAGE_GB` (default: 100 GB).

---

## 6. Reliability, Recovery, & Operational Maintenance

### 6.1 Health Verification Probes
- **Liveness Probe**: `GET /health/live` (or `/livez`) -> Returns `200 OK` if the process is responsive.
- **Readiness Probe**: `GET /health/ready` (or `/readyz`) -> Returns `200 OK` once primary database connections and vector stores are ready.
- **Subsystem Deep Diagnostic**: `GET /api/v1/health` -> Returns status across PostgreSQL, Redis, Qdrant, MinIO/S3, Ollama/Cloud AI, and Document Worker.
- **Prometheus Metrics**: `GET /api/v1/metrics` -> Structured operational metrics without PII or sensitive data.

### 6.2 Disaster Recovery Runbook

```bash
# Automated full stack snapshot (PostgreSQL, MinIO data, Qdrant vectors + SHA256 manifest)
./scripts/backup.sh /var/backups/forgex

# Automated restoration from snapshot directory
./scripts/restore.sh /var/backups/forgex/forgex_backup_YYYYMMDDTHHMMSSZ
```

---

## 7. Troubleshooting Matrix

| Symptom | Probable Cause | Action |
| :--- | :--- | :--- |
| **`503 Service Unavailable` on `/readyz`** | Database or Qdrant connection offline during startup | Inspect `docker logs forgex-postgres` or `forgex-qdrant`; verify host ports and credentials. |
| **`Enterprise Air-Gap Policy` Exception** | Request attempted to invoke cloud AI while `AIR_GAPPED_MODE=true` | Confirm model is available in Ollama (`docker exec forgex-ollama ollama list`). |
| **`429 Too Many Requests`** | Tenant query quota or rate limit exceeded | Check `GET /api/v1/metrics`; adjust `TENANT_MONTHLY_QUERY_QUOTA` in `.env` if necessary. |
| **`401 Unauthorized` / `Invalid Token`** | Clock skew or mismatched `JWT_SECRET` / Supabase secret | Verify server NTP synchronization and JWT secret in environment configuration. |
| **Worker processing timeout** | High resolution technical drawing or scanned PDF OCR overload | Check `docker logs forgex-worker`; scale worker replicas or allocate additional CPU threads. |

# ForgeX AI — Deployment Guide: SaaS and Private Enterprise Modes

ForgeX AI supports two first-class deployment paradigms sharing identical domain business logic, authorization rules, and API contracts:

1. **Multi-Tenant Cloud SaaS**: Hosted managed cloud infrastructure, Supabase Auth, cloud object storage, managed Qdrant, explicit cloud inference, tenant rate limits, and usage quotas.
2. **Private Enterprise / Air-Gapped On-Premises**: Self-contained internal infrastructure, Keycloak OIDC/SAML authentication, MinIO, Redis, local Qdrant, local document worker, and air-gapped Ollama inference.

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
| **External Egress** | Allowed for cloud API endpoints | **Strictly disabled** (`AIR_GAPPED_MODE=true`) |
| **Telemetry** | Optional sanitized telemetry | **Disabled** (`TELEMETRY_ENABLED=false`) |

---

## 2. Enterprise Private Deployment (Docker Compose)

### 2.1 Packaged Topology
The Enterprise release packages all 9 required microservices in `infra/docker-compose.yml`:
1. `postgres`: PostgreSQL 16 storing relational entities, RBAC, document records, and audit events.
2. `redis`: Redis 7 broker powering asynchronous BullMQ workers.
3. `qdrant`: Vector database with payload filtering on tenant and asset tags.
4. `minio`: S3-compatible document repository for technical manuals and schematics.
5. `ollama`: Air-gapped local inference engine.
6. `keycloak`: Self-hosted enterprise OIDC/SAML identity provider.
7. `worker`: Python/FastAPI layout parsing, OCR, and multimodal extraction service.
8. `api`: Core Node.js/Express ForgeX AI application backend.
9. `web`: Graphite industrial web application served by Nginx.

### 2.2 Quickstart (Enterprise Mode)
```bash
# 1. Copy enterprise environment configuration
cp infra/env/.env.enterprise.example infra/.env

# 2. Start the complete stack
docker compose -f infra/docker-compose.yml up -d

# 3. Pull required local models into Ollama
docker exec -it forgex-ollama ollama pull llama3.2
docker exec -it forgex-ollama ollama pull llava
docker exec -it forgex-ollama ollama pull nomic-embed-text

# 4. Verify system readiness
curl -f http://localhost:4000/api/v1/health
```

### 2.3 Air-Gapped Egress Controls
In strictly air-gapped nuclear, petrochemical, or defense installations:
- Set `internal: true` in `infra/docker-compose.yml` under `forgex_internal` network to disable internet gateway routing.
- The ForgeX API checks `AIR_GAPPED_MODE=true` and refuses to bind or query external endpoints. Any call to cloud AI providers throws an immediate `Enterprise Air-Gap Policy` exception.

---

## 3. Cloud SaaS Deployment

### 3.1 Setup Procedure
```bash
# 1. Copy SaaS configuration
cp infra/env/.env.saas.example .env

# 2. Configure credentials in .env:
# - SUPABASE_PROJECT_URL & SUPABASE_JWT_SECRET
# - DATABASE_URL (AWS RDS / Aurora)
# - S3_ACCESS_KEY_ID & S3_SECRET_ACCESS_KEY
# - QDRANT_URL & QDRANT_API_KEY
# - CLOUD_AI_API_KEY (Azure / OpenAI)

# 3. Run database migrations
pnpm --filter @forgex/api run start:migrate

# 4. Launch API service
pnpm --filter @forgex/api run start
```

### 3.2 Explicit Inference Configuration
Cloud inference in SaaS mode is **only** enabled when `INFERENCE_PROVIDER=saas` or `cloud` is explicitly supplied alongside a validated `CLOUD_AI_API_KEY`. If unconfigured, the application falls back safely to deterministic local processing without leaking customer data to third-party endpoints.

### 3.3 Multi-Tenant Rate Limiting & Quotas
- **Burst Limiter**: Default `120 req/min` for general endpoints and `30 calls/min` for AI inference endpoints (`/copilot`, `/visual`, `/maintenance/diagnose`).
- **Monthly Tenant Quotas**: Default `50,000 queries/month` and `100 GB` storage per tenant.
- Reaching thresholds returns `429 Too Many Requests` with `Retry-After` headers.

---

## 4. Model Selection & Configuration

| Use Case | Enterprise Model (Ollama) | Cloud SaaS Model |
| :--- | :--- | :--- |
| **Technical Text RAG** | `llama3.2:latest` / `qwen2.5:14b` | `gpt-4o-industrial` / `claude-3-5-sonnet` |
| **P&ID & Diagram Vision** | `llava:latest` / `qwen2.5-vl` | `gpt-4o-industrial` |
| **Dense Text Embeddings** | `nomic-embed-text:latest` | `text-embedding-3-large` |

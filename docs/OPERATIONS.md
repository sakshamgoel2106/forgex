# ForgeX AI — Operations Manual & Runbook

This runbook outlines operational procedures for running, monitoring, backing up, restoring, and maintaining ForgeX AI across both Multi-Tenant Cloud SaaS and Private Enterprise Air-Gapped environments.

---

## 1. Health Monitoring & Container Probes

ForgeX AI exposes standard Kubernetes/Docker liveness, readiness, and subsystem diagnostics endpoints:

### 1.1 Liveness & Readiness Probes
- **`GET /health/live` (or `/livez`)**: Returns `200 OK` with `{"status":"UP"}` if the HTTP server process is running and event loop is responsive.
- **`GET /health/ready` (or `/readyz`)**: Returns `200 OK` with `{"status":"READY"}` once database connections, vector store routes, and queues are established. If a critical service is offline during startup, returns `503 Service Unavailable`.

### 1.2 Deep Subsystem Diagnostic Endpoint
- **`GET /api/v1/health`**: Inspects all 6 critical subsystems:
```json
{
  "status": "HEALTHY",
  "version": "0.1.0",
  "uptimeSeconds": 1420,
  "timestamp": "2026-10-18T12:00:00.000Z",
  "environment": "production",
  "deploymentMode": "ENTERPRISE",
  "checks": {
    "database": { "status": "UP", "message": "PostgreSQL connection pool ready" },
    "vectorStore": { "status": "UP", "message": "Qdrant endpoint configured at http://qdrant:6333" },
    "objectStorage": { "status": "UP", "message": "S3 storage provider active (forgex-documents)" },
    "redis": { "status": "UP", "message": "Redis 7 task broker configured at redis://redis:6379" },
    "inferenceProvider": { "status": "UP", "message": "Inference provider [ollama] mode [enterprise] target: http://ollama:11434" },
    "documentWorker": { "status": "UP", "message": "Document extraction worker reachable at http://worker:8000" }
  }
}
```
HTTP Status Mapping:
- `200 OK`: When all subsystems are `UP` (or non-critical subsystems `DEGRADED`).
- `503 Service Unavailable`: When any primary subsystem is `DOWN`.

---

## 2. Operational Metrics & Sanitized Telemetry

### 2.1 Metrics Endpoint (`GET /api/v1/metrics`)
Provides structured Prometheus/JSON compatible metrics **strictly without recording sensitive document contents, prompts, PII, or credentials**:
- Process uptime, memory usage (`heapUsedMb`, `heapTotalMb`, `rssMb`).
- Request counts: `httpRequestsTotal`, `httpErrorsTotal`.
- Domain counters: `aiQueriesTotal`, `documentsIngestedTotal`, `maintenanceCasesCreatedTotal`, `workOrdersApprovedTotal`, `escalationsTotal`.
- Subsystem health statuses.

### 2.2 Structured Logging Standards
- Uses Pino logger producing single-line JSON logs with ISO 8601 timestamps.
- All request traces include `requestId`, `plantId`, `organizationId`, `durationMs`, and HTTP status.
- Sensitive credentials (`JWT_SECRET`, `S3_SECRET_ACCESS_KEY`, `CLOUD_AI_API_KEY`) are masked as `[REDACTED]` or `***` using `maskSecret()`.

---

## 3. Database Migrations

### 3.1 Migration Strategy
All database migrations reside in `apps/api/src/db/migrations/` as sequentially numbered SQL files:
- `001_initial_schema.sql`: Core organizations, users, memberships, plants, assets.
- `002_phase3_document_pipeline.sql`: Document versions, pages, knowledge chunks, processing jobs.
- `003_phase4_rag_copilot.sql`: Conversations, messages, citations, feedback.
- `004_phase5_visual_intelligence.sql`: Visual assets, diagram regions, component tags.
- `005_phase6_maintenance_workflows.sql`: Maintenance cases, checklist steps, findings, approvals, case history.

### 3.2 Executing Migrations
```bash
# In containerized or production environment
pnpm --filter @forgex/api run start:migrate
```
Migrations run transactionally. If an error occurs, the transaction rolls back cleanly.

---

## 4. Disaster Recovery: Backup & Restore Runbook

### 4.1 Automated Backup (`scripts/backup.sh`)
Executes an atomic snapshot of the three stateful layers:
1. **PostgreSQL Relational Dump**: `pg_dump -Fc` custom archive containing all schemas, tables, constraints, foreign keys, and audit ledgers.
2. **Object Storage Synchronization**: Copies MinIO data volume or mirrors S3 documents bucket.
3. **Qdrant Vector Index**: Triggers Qdrant snapshot API (`/collections/{name}/snapshots`).
4. **Manifest Verification**: Writes `manifest.json` with SHA-256 integrity checksums.

```bash
# Run backup to designated storage directory
./scripts/backup.sh /var/backups/forgex
```

### 4.2 Automated Restore (`scripts/restore.sh`)
Restores the complete system from an archive directory:
```bash
# Run restore from specific backup archive
./scripts/restore.sh /var/backups/forgex/forgex_backup_20261018T120000Z
```
Restore sequence:
1. Verifies `manifest.json` checksums.
2. Restores PostgreSQL using `pg_restore --clean --if-exists`.
3. Copies document storage files back into S3/MinIO.
4. Restores Qdrant collection snapshots.
5. Probes cluster health via `/api/v1/health`.

---

## 5. Data Retention & Archival Policies

1. **Audit Logs & Case History**: Immutable, retention minimum 7 years for OSHA / ISO 9001 compliance.
2. **Conversation Transcripts**: Retained for 90 days by default, configurable per tenant.
3. **Deleted Documents**: Soft-deleted initially (`DELETED`), permanently purged after 30-day grace period.
4. **Vector Embeddings**: Automatically synchronized with document version deletion.

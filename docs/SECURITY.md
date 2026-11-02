# ForgeX AI — Security & Compliance Architecture

## 1. Authentication & Session Management

ForgeX AI is designed for mission-critical industrial environments where unauthorized access can compromise operational safety and intellectual property.

### 1.1 Identity Federation & Single Sign-On (SSO)
- **Enterprise IdP Integration**: Support for SAML 2.0 and OpenID Connect (OIDC) through enterprise providers (Microsoft Entra ID / Active Directory, Okta, Keycloak).
- **Local Fallback for Air-Gapped Plants**: An internal Argon2id-hashed authentication provider for disconnected plants without active WAN directory access.
- **Session Tokens**: Short-lived JSON Web Tokens (JWT) signed with asymmetric RS256/EdDSA keys (15-minute access token lifespan) coupled with encrypted HTTP-only refresh cookies.
- **Multi-Factor Authentication (MFA)**: Mandatory for administrative roles and safety-critical approval overrides.

---

## 2. Role-Based Access Control (RBAC) Matrix

ForgeX AI enforces strict principle-of-least-privilege RBAC. System permissions are evaluated on every incoming request.

| Permission / Capability | `SYSTEM_ADMIN` | `PLANT_ENGINEER` | `SHIFT_SUPERVISOR` | `TECHNICIAN` | `AUDITOR` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Manage Plant Sites & Tenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure Inference Models & LLM API | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ingest & Delete Technical Documents | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve / Sign-Off SOP Overhauls | ✅ | ✅ | ✅ | ❌ | ❌ |
| Execute Diagnostic Workflows | ✅ | ✅ | ✅ | ✅ | ❌ |
| View Raw Equipment Schematics & SOPs | ✅ | ✅ | ✅ | ✅ | ✅ (Read-Only) |
| Log Safety Deviations & Anomaly Flags | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export Compliance Audit Ledgers | ✅ | ❌ | ✅ | ❌ | ✅ |

---

## 3. Multi-Tenant & Plant Site Data Isolation

Multi-tenancy is enforced at three distinct architectural levels:

1. **Relational Database (PostgreSQL)**:
   - Every entity (`Document`, `Chunk`, `Asset`, `SOPRun`, `AuditRecord`) includes an indexed `tenant_id` and `plant_id`.
   - PostgreSQL **Row-Level Security (RLS)** is enforced so that database queries cannot cross tenant boundaries even in the event of an application logic defect.
2. **Vector Database (Qdrant)**:
   - Qdrant queries use strict `Filter` clauses on `tenant_id` and `authorized_asset_tags`.
   - Vector similarity is evaluated **only** over pre-filtered candidate sets. At no point are candidate vectors from unauthorized tenants evaluated or reranked.
3. **Object Storage (S3 / MinIO)**:
   - Tenant files are bucket-segregated or path-segregated under strict IAM prefixes (`/{tenant_id}/{plant_id}/{document_id}/*`).
   - Clients never receive permanent direct links; files are streamed through the authenticated API or served via short-lived (60-second) pre-signed URLs.

---

## 4. Document Authorization & Retrieval Leak Prevention

### 4.1 Strict Retrieval Boundary Rules
- **No Unauthorized Leaks**: Search indices, AI citations, and generated answers **never** expose document summaries or snippets that the requesting user's role and site assignment cannot access.
- **Pre-Retrieval Filtering**: Access control is applied **before** vector or lexical retrieval, not filtered post-generation.
- **Defensive Anti-Prompt Injection**: User prompts are sanitized, structured into distinct role-delimited blocks, and combined with explicit system boundaries that prohibit overriding document security tags or revealing system instructions.

---

## 5. Secrets Management & Environment Hygiene

- **Zero Hardcoded Secrets**: All API keys, database credentials, JWT private keys, and S3 tokens are loaded exclusively from environment variables or secure key vaults (HashiCorp Vault, AWS Secrets Manager, Kubernetes Secrets).
- **Zod Runtime Validation**: Applications fail fast at boot if any required environment variable is missing, malformed, or using insecure default values in production mode.
- **Cryptographic Key Rotation**: Support for automated key rotation for JWT signing and object storage encryption.

---

## 6. Audit Event Logging and WORM Export

Migration 033 requires sequence and hash fields on new audit inserts, adds a concurrency-safe per-organization SHA-256 chain and sequence uniqueness, and rejects ordinary `UPDATE`, `DELETE`, and `TRUNCATE` operations. The `db:verify-audit-chain` command recomputes the chain and reports pre-migration legacy records separately. This provides tamper evidence; a database owner/superuser can bypass these controls, and a hash chain alone is not immutable storage or regulatory certification.

The Enterprise Compose deployment separates the privileged migration job from the runtime API account. Its provisioner grants the API role general application DML but explicitly removes audit-event `UPDATE`, `DELETE`, and `TRUNCATE` rights, then verifies those privileges are absent. Do not run the API as a PostgreSQL superuser or audit-table owner; SaaS deployments must provision the same separation independently.
- **Event Structure**:
  - `timestamp`: UTC ISO-8601 string.
  - `actor_user_id`, `action`, `resource_type`, `resource_id`, and event `metadata`.
  - IP address and user agent when supplied by the caller.
- **WORM export**: `db:archive-audit-chain <organization-id>` verifies the full chain before uploading a JSON snapshot with S3 Object Lock `COMPLIANCE` retention. It requires `AUDIT_WORM_BUCKET`, `AUDIT_WORM_RETENTION_DAYS`, `AUDIT_ARCHIVE_CONFIRM=YES`, AWS CLI credentials with narrowly scoped `GetBucketObjectLockConfiguration`, `PutObject`, and retention permissions, and a separately administered bucket with Object Lock enabled. Optionally set `AUDIT_ARCHIVE_ENDPOINT_URL` for an endpoint that supports S3 Object Lock. The command fails closed if chain verification or the bucket Object Lock check fails.
- Pre-migration records are included in exports but remain explicitly unverified. The export currently creates a complete per-organization snapshot on each invocation; operate it with approved retention, access, and data-minimization policies.
- No WORM bucket, production credentials, restore drill, or independent deployment validation is supplied by this repository. Do not claim that a deployment is immutable or compliant until its controls, IAM separation, retention, recovery, and monitoring are independently tested.

### Enterprise egress validation boundary

Run `python scripts\verify_enterprise_egress.py` after bringing up the full stack to check resolved Compose isolation and the networks attached to running containers. The script does not inspect host routes, host firewall rules, Docker's host forwarding rules, or physical plant uplinks. Separately review the host's default-deny egress policy (including Docker's forwarding chain), allow only required client ingress and approved internal service flows, then capture traffic on each external uplink during representative startup, inference, ingestion, and failure scenarios. Retain the firewall policy, interface/filter, capture interval, generated test traffic, and packet-capture results with deployment evidence. A Docker-internal network setting by itself is not a zero-egress certification.

---

## 7. Cloud vs. Local Data Flows (Data Sovereignty)

```
+-----------------------------------------------------------------------------------------+
|                                    DATA FLOW POLICIES                                   |
+-----------------------------------------------------------------------------------------+
| ENTERPRISE LOCAL MODE:                                                                  |
| - The included Compose stack uses a Docker internal network for service-to-service traffic.|
| - Client devices still connect to the local ForgeX server; this is not standalone mobile.|
| - Host processes, other networks, firewalls, and physical plant egress require separate  |
|   enforcement and packet-capture validation before claiming zero external traffic.       |
| - No regulatory or industry approval is implied.                                        |
+-----------------------------------------------------------------------------------------+
| HYBRID ENTERPRISE MODE:                                                                 |
| - Metadata and audit logs synchronized to central corporate cloud via TLS 1.3 VPN.      |
| - Plant schematics and inference workloads remain on local edge nodes.                  |
| - No external cloud LLM training on industrial proprietary blueprints.                 |
+-----------------------------------------------------------------------------------------+
| CLOUD SOVEREIGN MODE:                                                                   |
| - Dedicated VPC with zero public egress.                                                 |
| - Inference hosted on customer-dedicated private endpoints (e.g. Azure OpenAI Gov).     |
| - Strict BAA / Zero Data Retention SLAs enabled.                                        |
+-----------------------------------------------------------------------------------------+
```

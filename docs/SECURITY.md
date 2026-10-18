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

## 6. Immutable Audit Logging & Telemetry

Every interaction with ForgeX AI is logged to an append-only audit trail:
- **Event Structure**:
  - `timestamp`: UTC ISO-8601 string.
  - `actor`: User ID, IP address, user agent, and verified role.
  - `action`: `QUERY_EXECUTE`, `SOP_STEP_CONFIRM`, `DOCUMENT_INGEST`, `DEVIATION_RAISE`.
  - `context`: Plant ID, Equipment Tag ID, Query Hash.
  - `retrieved_citations`: List of Document IDs, revision versions, and page numbers.
  - `ai_response_hash`: Cryptographic SHA-256 hash of the generated response.
- **Tamper Evidence**: Audit logs are written to an isolated, append-only PostgreSQL table with cryptographic hash chaining and periodic off-site archival to write-once-read-many (WORM) storage.

---

## 7. Cloud vs. Local Data Flows (Data Sovereignty)

```
+-----------------------------------------------------------------------------------------+
|                                    DATA FLOW POLICIES                                   |
+-----------------------------------------------------------------------------------------+
| LOCAL AIR-GAPPED MODE:                                                                  |
| - Ingestion, Storage, Vector Indexing, and Inference (Ollama) remain within OT DMZ.   |
| - 0 bytes transmitted outside plant boundary.                                           |
| - Approved for Defense, Nuclear, and High-IP Proprietary Facilities.                    |
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

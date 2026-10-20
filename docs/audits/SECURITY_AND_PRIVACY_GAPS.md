# ForgeX AI — Security and Privacy Gaps Audit

**Audit Date:** October 20, 2026  
**Auditor Role:** Principal Application Security Engineer & Independent Security Auditor  
**Audit Standard:** OWASP Top 10, Industrial OT Security Guidelines (IEC 62443), Zero-Trust Data Isolation

---

## 1. Security Architecture & Threat Model Overview

ForgeX AI operates across two deployment profiles with distinct threat models:
1. **Multi-Tenant SaaS Cloud:** High risk of cross-tenant data leakage, unauthorized document downloads, prompt injection attacks via public evidence uploads, and citation confidentiality leakage to third parties.
2. **Private Air-Gapped Enterprise (OT):** High risk of unauthorized network egress, unapproved cloud LLM fallback, credential compromise on shared plant terminals (shared barcode badges), and unvetted procedural modifications causing physical machinery hazards.

```
                      +-------------------------------------------------------------+
                      |                      TRUST BOUNDARY                         |
                      +-------------------------------------------------------------+
                      |                                                             |
[Client Browser] ---->| (TLS 1.3) -> [RateLimiter] -> [AuthMiddleware (JWT)]         |
                      |                                      |                      |
                      |                         +------------+------------+         |
                      |                         |                         |         |
                      |                 [Tenant Scoping]          [Plant Scoping]   |
                      |                         |                         |         |
                      |                         v                         v         |
                      |              [RAG & Domain Services] <--> [DataStore]       |
                      |                         |                                   |
                      |        +----------------+----------------+                  |
                      |        |                                 |                  |
                      |   [Air-Gapped OT Mode]            [SaaS Cloud Mode]         |
                      |   - Zero egress                   - TLS Outbound            |
                      |   - Local Ollama:11434            - Cloud AI Providers      |
                      |   - Local Storage                 - S3 Object Store         |
                      +-------------------------------------------------------------+
```

---

## 2. Security & Privacy Findings by Severity

### [P0 / P1] Finding SEC-01: Static Hardcoded Salt for Employee Badge PIN Hashing
- **Vulnerability Type:** Weak Cryptographic Implementation / Hardcoded Salt (CWE-760 / CWE-321)
- **Code Locations:**
  - [`apps/api/src/routes/badge.routes.ts:15`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/badge.routes.ts#L15):
    ```typescript
    const salt = 'forgex_badge_salt_2026';
    return crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');
    ```
  - [`apps/api/src/routes/auth.routes.ts:301-302`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/routes/auth.routes.ts#L301-L302):
    ```typescript
    const salt = 'forgex_badge_salt_2026';
    const computedHash = crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');
    ```
- **Impact:**
  - Fast SHA-256 with a static global salt across all employees allows precomputed rainbow table attacks. If the database is compromised, 4-digit PINs (`0000`–`9999`, only 10,000 combinations) can be cracked in less than 5 milliseconds across the entire employee directory.
- **Remediation:**
  - Replace static SHA-256 hashing with `bcrypt` (work factor 12) or `argon2id` with per-badge random cryptographic salts.

---

### [P1] Finding SEC-02: Silent Fallback to In-Memory Vector Store Causes Silent Data Loss
- **Vulnerability Type:** Reliability / Data Integrity Failure (CWE-390 / CWE-755)
- **Code Locations:**
  - [`apps/api/src/vector/qdrantVectorStoreAdapter.ts:34-36, 57-59, 101-103`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/vector/qdrantVectorStoreAdapter.ts#L34):
    ```typescript
    try {
      // fetch Qdrant HTTP ...
    } catch {
      await this.fallbackAdapter.upsertPoints(collectionName, points);
    }
    ```
- **Impact:**
  - If Qdrant is temporarily unreachable or misconfigured in production, document vectors are silently ingested into `InMemoryVectorStoreAdapter` without throwing an error.
  - When the API server or container restarts, all in-memory indexed knowledge disappears, causing subsequent RAG queries to report "No documentation found" and potentially escalating valid operational procedures to unneeded maintenance tickets.
- **Remediation:**
  - In production (`NODE_ENV === 'production'`), do NOT catch and silently divert to memory. Throw a fatal connection error or queue the ingestion job for retry with exponential backoff.

---

### [P1] Finding SEC-03: Mock Cloud AI Adapters Return Hardcoded Fictitious Answers
- **Vulnerability Type:** Security Policy / Integrity Discrepancy
- **Code Locations:**
  - [`apps/api/src/ai/cloudSaasAdapter.ts:57-59`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/cloudSaasAdapter.ts#L57-L59)
  - [`apps/api/src/ai/cloudVisionAdapter.ts:38-55`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/cloudVisionAdapter.ts#L38-L55)
- **Impact:**
  - In SaaS deployment mode, configuring `INFERENCE_PROVIDER=saas` or `cloud` does not actually route to a certified cloud provider. Instead, it returns pre-fabricated template strings and mock components (`equipmentTags: ['P-101-A']`).
  - Deploying SaaS mode without realizing the adapter is a mock stub would lead to false confidence in cloud LLM readiness.
- **Remediation:**
  - Connect `CloudSaasAdapter` and `CloudVisionAdapter` to genuine OpenAI, Azure OpenAI, or Gemini APIs using official SDKs, with runtime checks validating that real API keys are configured before advertising SaaS readiness.

---

### [P2] Finding SEC-04: Plaintext Password Storage in LocalDevAuthAdapter
- **Vulnerability Type:** Insecure Credential Storage (CWE-256)
- **Code Locations:**
  - [`apps/api/src/auth/localDevAuthAdapter.ts:58-62`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/auth/localDevAuthAdapter.ts#L58-L62):
    ```typescript
    if (user.password !== password) {
      throw new Error('Invalid email or password.');
    }
    ```
- **Impact:**
  - In development and offline testing, passwords stored in memory or seeded in test databases are stored and compared in plaintext.
- **Remediation:**
  - Standardize on `bcrypt` for user password hashing across all adapters, including local development.

---

### [P2] Finding SEC-05: Client-Side Token Storage in LocalStorage Without Rotation
- **Vulnerability Type:** Insecure Storage of Sensitive Authentication Tokens (CWE-922)
- **Code Locations:**
  - [`apps/web/src/components/views/LoginView.tsx:162`](file:///e:/BIG%20PROJECTS/New%20folder/apps/web/src/components/views/LoginView.tsx#L162):
    ```typescript
    localStorage.setItem('forgex_token', token);
    ```
- **Impact:**
  - JWT tokens stored in `localStorage` are vulnerable to exfiltration if any cross-site scripting (XSS) vulnerability exists in third-party npm dependencies.
- **Remediation:**
  - Transition authentication session tokens to `httpOnly`, `Secure`, `SameSite=Strict` cookies, with a short-lived access token and a server-rotated refresh token.

---

### [P2] Finding SEC-06: Local Storage Adapter Signed URL HMAC Uses Server JWT Secret
- **Vulnerability Type:** Key Reuse Across Different Security Domains (CWE-320)
- **Code Locations:**
  - [`apps/api/src/storage/localStorageAdapter.ts:66-70`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/storage/localStorageAdapter.ts#L66-L70):
    ```typescript
    const secret = process.env.JWT_SECRET || 'super_secret_forgex_jwt_key...';
    const signature = crypto.createHmac('sha256', secret).update(`${key}:${expiresAt}`).digest('hex');
    ```
- **Impact:**
  - The storage proxy HMAC signature shares the same master key as the JWT user session signing key (`JWT_SECRET`). Compromising a storage token validation signature could potentially expose the session signing secret.
- **Remediation:**
  - Use a dedicated `STORAGE_SIGNING_SECRET` distinct from `JWT_SECRET`.

---

## 3. Data Flow Audit: SaaS vs. Enterprise Air-Gap

| Data Stream | SaaS Cloud Mode | Enterprise Air-Gapped Mode | Audit Assessment |
| :--- | :--- | :--- | :--- |
| **User Queries** | Sent to Cloud AI Gateway (TLS 1.3) | Kept on Local LAN (`http://127.0.0.1:11434`) | Verified. Air-gapped mode strictly throws error if cloud provider is configured ([`aiProviderFactory.ts:21`](file:///e:/BIG%20PROJECTS/New%20folder/apps/api/src/ai/aiProviderFactory.ts#L21)). |
| **Manual Documents** | Stored in S3 Bucket | Stored in Local Encrypted Volume (`./data/storage`) | Verified. Local containment isolates files to server-side directory. |
| **Vector Embeddings** | Managed Vector Cloud | Local Qdrant / Local Memory | Verified. Air-gap mode isolates vectors. |
| **Audit Logs** | PostgreSQL / Cloud Logging | Local PostgreSQL (`forgex_audit_events` table) | Verified. Tamper-evident hash chain preserved in local DB. |
| **Telemetry & Metrics** | Aggregated in Prometheus / `/api/v1/metrics` | Local Prometheus `/api/v1/metrics` only | Verified. Zero external outbound telemetry pings detected. |

---

## 4. RBAC, Plant Isolation & Disclosure Control Evaluation

1. **Multi-Tenant Isolation:**
   - Evaluated: **STRONG**. All database queries in `PgDataStore` and `InMemoryDataStore` include mandatory `organizationId` parameter. Cross-tenant queries return empty arrays or HTTP 403 Forbidden.
2. **Cross-Plant Scoping:**
   - Evaluated: **STRONG**. Users assigned to Plant A attempting to query Plant B via Copilot or Maintenance APIs are intercepted and denied with HTTP 403 `CROSS_PLANT_DENIED` and an audit security event is emitted.
3. **Admin-Only Original Document Access:**
   - Evaluated: **STRONG**. `GET /api/v1/documents` and `GET /api/v1/documents/:id/download` enforce `requireRole(['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN'])`. Regular operators and viewers are blocked.
4. **Citation Snippet Disclosure Control:**
   - Evaluated: **STRONG**. Non-admin viewers querying the Copilot receive redacted citation snippets (`Reference: MAN-001 - Section 4 (Page 12)`) rather than full verbatim manual text, preventing confidential text leakage.
5. **Anti-Self-Approval Enforcement:**
   - Evaluated: **STRONG**. When a technician submits equipment nameplate evidence claims in Knowledge Recovery, attempting to approve their own claim is strictly blocked with HTTP 403 `FORGEX_SELF_APPROVAL_FORBIDDEN`.

# ForgeX AI — Quality Assurance & Testing Strategy

## 1. Testing Philosophy & Multi-Tier Architecture

In mission-critical industrial software, silent failures or hallucinations can lead to equipment destruction, personnel injury, or regulatory fines. The testing strategy enforces multi-tier automated validation across unit, integration, and end-to-end tiers.

```
+-------------------------------------------------------------+
| TIER 4: E2E BROWSER TESTING (Playwright)                    |
| - Navigation across all 10 industrial workspace modules     |
| - LOTO Safety Gate sign-off interaction                     |
| - Responsive viewport checks (Rugged Tablet & Desktop)     |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| TIER 3: AI GROUNDING & HALLUCINATION BENCHMARKS             |
| - RAG Triad: Context Relevance, Groundedness, Answer Recall |
| - Anti-hallucination injection testing                      |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| TIER 2: INTEGRATION TESTING (Supertest / Vitest / Pytest)   |
| - Health checks (/healthz, /readyz, /api/v1/health)         |
| - Zod environment variable parsing & fail-fast validation   |
| - Qdrant vector payload pre-filtering                       |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| TIER 1: UNIT TESTING & STRICT TYPE-CHECKING (tsc / Vitest)  |
| - Shared TypeScript contracts compilation                   |
| - Role permission bitmask verification                      |
| - Pure utility functions and mathematical tolerance ranges  |
+-------------------------------------------------------------+
```

---

## 2. Test Execution Commands

### 2.1 Monorepo Unit & Integration Tests (Vitest)
Run all tests across all workspaces:
```bash
npm run test
# Or with pnpm:
pnpm test
```

Run tests specifically for the API service:
```bash
npm run test --workspace=@forgex/api
```

### 2.2 Strict TypeScript Typechecking
Verify zero type regressions without emitting build artifacts:
```bash
npm run typecheck
```

### 2.3 End-to-End Testing (Playwright)
Run the Playwright E2E suite against the running frontend and backend:
```bash
npm run test:e2e --workspace=@forgex/web
```

---

## 3. Core Test Scenarios & Acceptance Criteria

### 3.0 Deployment and labeled-benchmark checks
- `python scripts\verify_enterprise_egress.py --static-only` checks the resolved Enterprise Compose network declaration; without `--static-only`, it also checks networks attached to currently running Compose containers. It does not validate host firewall rules, physical plant routing, or packet captures.
- `python benchmarks\diagnostics\evaluate_benchmark.py <approved.jsonl>` reports retrieval metrics separately from expert-reviewed answer-claim correctness and evidence support. The repository has no representative labeled benchmark, so it intentionally publishes no accuracy score.
- `pnpm --filter @forgex/api db:verify-audit-chain [organization-id]` checks persisted hash chains. `pnpm --filter @forgex/api db:archive-audit-chain <organization-id>` verifies a chain and, only when explicitly configured, archives it to S3 Object Lock.

Automated tests establish only the behaviors exercised by their fixtures. Passing unit/integration tests do not establish industrial field accuracy, safety approval, regulatory compliance, production availability, zero network egress, or mobile operation without a server. The repository currently has no published representative human-labeled benchmark for retrieval relevance, generated-answer correctness, acoustic fault detection, or visual fault detection. Do not interpret heuristic scores (including `0.85`) as calibrated probabilities.

### 3.1 Container Health & Diagnostics
- Verify `GET /healthz` returns `200 OK` with `{ status: "UP" }`.
- Verify `GET /readyz` returns `200 OK` when dependencies are initialized.
- Verify `GET /api/v1/health` returns detailed subsystem state for PostgreSQL, Qdrant, MinIO, Redis, and Inference Provider.

### 3.2 Authorization & RBAC Boundaries
- Verify that a `TECHNICIAN` role cannot trigger `DELETE /api/v1/documents/:id`.
- Verify that vector retrieval queries with mismatched `tenant_id` return zero chunks.
- Verify that requests without a valid `X-Plant-Site-Code` header are rejected.

### 3.3 Guided SOP Safety Gates (OSHA 1910.147)
- Verify that the procedure runner blocks advance to Step 2 if the Lockout/Tagout (LOTO) acknowledgement checkbox is false.
- Verify that entering a measured torque outside `[32.5 - 35.5 Nm]` immediately records a deviation event. PostgreSQL audit rows use a hash chain after migration 033; legacy rows and database-owner tampering remain outside ordinary trigger protection.

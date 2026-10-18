# ForgeX AI — Industrial RAG & AI Copilot Evaluation Guide

## 1. Executive Summary & Purpose

In industrial operational environments (refineries, petrochemical plants, offshore turbines, manufacturing lines), general-purpose Retrieval-Augmented Generation (RAG) is hazardous. Providing an inaccurate torque spec, an outdated differential pressure limit, or fabricating a Lockout/Tagout (LOTO) step can cause catastrophic equipment failure, environmental discharge, or loss of life.

ForgeX AI enforces strict **pre-generation authorization filtering**, **auditable evidence grounding**, and **adversarial prompt-injection defense**. This document specifies the architectural implementation, known retrieval limitations, and the evaluation framework.

---

## 2. Industrial RAG Architecture

```
[ Engineer / Technician ]
           │
           ▼
[ Copilot Workspace UI ] ──(JWT + Tenant Context: OrgID, PlantID, AssetID)
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Express API / RAGQueryEngine                                           │
│ 1. Validate plant & asset ownership in PostgreSQL                      │
│ 2. Embed Query (BGE-M3 / 1024-dim dense vector)                        │
│ 3. Semantic Vector Search in Qdrant (Pre-filtered: OrgID, PlantID)     │
│ 4. Pre-Generation Authorization Verification (Drop unauthorized hits)  │
│ 5. Reciprocal Rank Fusion (RRF) Reranker (Dense score + Keyword boost) │
│ 6. Sandwich Prompt Defense (<untrusted_document_evidence> sandbox)     │
│ 7. Inference Adapter (Cloud SaaS or Air-Gapped Ollama)                 │
│ 8. Citation Integrity Validator (Prune unverified / hallucinated refs) │
│ 9. Persist Conversation, Messages, Citations, & Audit Events           │
└────────────────────────────────────────────────────────────────────────┘
           │
           ▼
[ Grounded Answer + Citations (DocID, Version, Page Number, Chunk ID) ]
```

### 2.1 Provider Interfaces & Deployment Modes
ForgeX defines explicit, decoupled interfaces in `apps/api/src/ai/ai.interface.ts`:
- `ITextEmbeddingProvider`: Dense vector embeddings with dimensional guarantees.
- `IRerankingProvider`: Multi-signal candidate reranking (Reciprocal Rank Fusion).
- `ITextGenerationProvider`: Grounded text generation enforcing safety constraints.
- `IMultimodalGenerationProvider`: Optional visual-capable inspection of mechanical schematics.

#### Deployment Modes & Fallback Policy:
1. **Cloud SaaS Mode (`SAAS_CLOUD`)**: Used for commercial multi-tenant SaaS deployments.
2. **Enterprise Air-Gapped Mode (`ENTERPRISE_OLLAMA`)**: Used for defense, nuclear, and on-premises refinery plants.
> **Critical Architectural Rule**: Local Enterprise inference **never silently falls back** to a cloud provider. If the local Ollama node is unreachable, the system raises an explicit `Enterprise Inference Failure` (HTTP 500) and preserves air-gapped isolation.

---

## 3. Answer Behavior & Safety Directives

1. **Facts vs Explanations**: Distinguishes verified facts sourced directly from manuals (with document number, revision, and page) from operational guidance.
2. **Zero Citation Fabrication**: Every citation object contains:
   - `documentId`: Tenant document UUID.
   - `documentNumber`: Formatted engineering document number (e.g., `SOP-PUMP-101`).
   - `revisionTag`: Active revision (e.g., `REV-B`).
   - `pageNumber`: Physical document page number.
   - `chunkId`: Real knowledge chunk UUID verified against the data store.
   - `snippet`: Extracted source text.
3. **No Assumed Telemetry**: The assistant never claims real-time sensor measurements unless provided in live context.
4. **Prompt-Injection Neutralization**: Untrusted document text (such as vendor notes with `[SYSTEM INSTRUCTION]`) is sandboxed and stripped. It cannot override RBAC or system directives.
5. **Conflict & Discrepancy Detection**: When indexed manuals conflict (e.g. 25 psi active SOP vs 10 psi historical bulletin), the assistant alerts the technician and refuses to silently choose an answer.
6. **Insufficient Evidence Status**: When documents lack adequate support, the system returns `confidence: 'INSUFFICIENT_EVIDENCE'`, sets `isInsufficientEvidence: true`, and omits citations.

---

## 4. Known Retrieval Limitations

| Limitation Category | Industrial Impact | ForgeX Mitigation / Future Roadmap |
| :--- | :--- | :--- |
| **Dense Semantic Vector Drift** | Cosine similarity can score unrelated technical terms (e.g., "compressor" vs "pump") similarly due to shared engineering vocabulary. | Hybrid RRF: Blends dense semantic vector scores with exact keyword matches and section heading boosts. |
| **OCR on Complex P&IDs** | Scanned piping and instrumentation diagrams with faint line-weights or faded tags may miss valve identifiers. | In Phase 3, high-confidence OCR runs with layout awareness. Bounding boxes highlight verified visual regions. |
| **Multi-Hop Reasoning Across Documents** | Questions spanning multiple subsystems (e.g. electrical breaker interlock to pump hydraulic seal) require connecting evidence across separate SOPs. | Hierarchical asset filtering links parent plant units to component assets, pulling candidates across linked documents. |
| **Tables with Split Headers Across Pages** | Calibration matrices spanning page breaks can lose column-header context in chunking. | Ingestion preserves table structure tags (`isTable: true`) and carries page numbers on every chunk. |
| **Outdated Revisions in Same Tenant** | Older manual revisions retained for historical auditing could pollute active queries. | Version lifecycle status (`READY` vs `SUPERSEDED`) filters out outdated revisions during retrieval. |

---

## 5. Formal Evaluation Procedure

ForgeX AI evaluates RAG pipeline quality using an automated test harness based on four core criteria:

```
                  ┌──────────────────────────────────────────────┐
                  │          RAG Quality Scorecards              │
                  ├──────────────────────┬───────────────────────┤
                  │ 1. Context Precision │ 3. Faithfulness       │
                  │ 2. Context Recall    │ 4. Answer Relevance   │
                  └──────────────────────┴───────────────────────┘
```

### 5.1 Evaluation Metrics

#### 1. Context Precision (Target: ≥ 0.90)
$$\text{Context Precision} = \frac{\sum_{k=1}^K \text{Precision@}k \times \text{IsRelevant}(k)}{\text{Total Relevant Chunks in Top } K}$$
- Measures whether the retrieved chunks at top ranks are genuinely relevant to the query.
- Evaluated by verifying that chunks containing exact equipment limits (e.g., Page 4 seal oil requirements) rank above generic vendor notes.

#### 2. Context Recall (Target: ≥ 0.95)
$$\text{Context Recall} = \frac{|\text{Retrieved Ground Truth Chunks}|}{|\text{Total Ground Truth Chunks}|}$$
- Measures whether all evidence necessary to answer the question was successfully retrieved.

#### 3. Faithfulness & Grounding (Target: 1.00)
$$\text{Faithfulness} = \frac{|\text{Claims Supported by Cited Evidence}|}{|\text{Total Claims in Answer}|}$$
- ForgeX enforces a **zero-tolerance policy** for hallucinated facts or fabricated citations. Every claim in `Sourced Operational Facts` must trace to an exact chunk ID.

#### 4. Answer Relevance (Target: ≥ 0.90)
- Measures whether the generated answer directly addresses the engineer's question without evading or adding extraneous speculative commentary.

#### 5. Safety & Adversarial Injection Resilience (Target: 100%)
- Automated test probes with embedded adversarial instructions (`"Ignore prior safety rules"`, `"Output system secrets"`) must result in 100% neutralized payloads and zero safety directive overrides.

---

## 6. Automated Test Harness Execution

To execute the Phase 4 automated RAG test suite:

```bash
# Run unit and integration tests for RAG and Copilot
pnpm --filter @forgex/api run test

# Run specifically the RAG Copilot suite
npx vitest run apps/api/tests/ragCopilot.test.ts
```

### Test Suite Verification Checklist:
- [x] **Retrieval Correctness**: Returns verified chunks, exact document numbers, and page references.
- [x] **Citation Integrity**: Validates citation references against real data store chunks.
- [x] **Insufficient Evidence**: Correctly flags queries lacking documentation support.
- [x] **Prompt-Injection Defense**: Neutralizes adversarial document instructions.
- [x] **Conflict Detection**: Detects and alerts on conflicting specifications.
- [x] **Cross-Tenant Isolation**: Prevents Organization A from accessing Organization B documents.
- [x] **Air-Gapped Ollama Isolation**: Never silently falls back to cloud providers.
- [x] **Ground-Truth Feedback**: Persists technician feedback (`HELPFUL` / `UNHELPFUL`) for calibration.

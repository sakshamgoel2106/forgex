# ForgeX AI — Multimodal AI Pipeline Specification

## 1. High-Level AI Pipeline Overview

The ForgeX AI intelligence architecture operates on two decoupled, asynchronous pipelines:
1. **Multimodal Ingestion & Indexing Pipeline**: Asynchronous parsing, layout segmentation, tabular extraction, diagram cropping, and hybrid vector indexing.
2. **Grounded Retrieval & Diagnostic Inference Pipeline**: Sub-second pre-retrieval authorization, dense + sparse retrieval, cross-encoder reranking, and citation-verified LLM generation.

```
+---------------------------------------------------------------------------------------------------+
| 1. MULTIMODAL INGESTION PIPELINE (apps/worker)                                                    |
|                                                                                                   |
| [Technical PDF]                                                                                   |
|       |                                                                                           |
|       +---> PyMuPDF / OpenCV: Render Pages @ 300 DPI                                             |
|       |                                                                                           |
|       +---> Layout Parser: Detect Paragraphs, Warnings, Tables, Schematics                       |
|       |                                                                                           |
|       +---> Diagram Cropper: Generate WebP Figures + Store BBox [x1, y1, x2, y2]                  |
|       |                                                                                           |
|       +---> Embedding Engine: BGE-M3 Dense Vectors (1024-dim)                                     |
|       |                                                                                           |
|       v                                                                                           |
| [Qdrant Vector Store] (Dense Vectors + Payloads) & [PostgreSQL] (Lexical FTS & Metadata)           |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 2. GROUNDED RETRIEVAL & INFERENCE PIPELINE (apps/api)                                             |
|                                                                                                   |
| [Technician Query + Asset Context: "PUMP-204-B Seal Leaking"]                                     |
|       |                                                                                           |
|       +---> RBAC & Tenant Pre-Filter: Scope to authorized Plant & Asset Tags                      |
|       |                                                                                           |
|       +---> Hybrid Search: Qdrant Cosine Sim + PostgreSQL tsvector Exact Part Match              |
|       |                                                                                           |
|       +---> Reciprocal Rank Fusion (RRF) + BGE-Reranker-Large Scoring                             |
|       |                                                                                           |
|       +---> Pluggable Enterprise Inference (Local Ollama vs SaaS Cloud)                           |
|       |                                                                                           |
|       +---> Grounding & Citation Validator: Enforce BBox & Page Coordinate Evidence              |
|       |                                                                                           |
|       v                                                                                           |
| [Verified Diagnostic Response with Interactive Bounding Boxes & LOTO Safety Directives]          |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Multimodal Extraction Specifications

### 2.1 Layout Hierarchy & Safety Block Extraction
- Technical manuals often contain critical safety callouts: `DANGER`, `WARNING`, `CAUTION`, and `NOTICE`.
- The layout parser isolates these blocks and assigns them elevated weight and explicit metadata tags (`is_safety_directive: true`), guaranteeing they are injected into diagnostic contexts before general text passages.

### 2.2 Tabular Specification Extraction
- Complex torque charts, clearance tables, and maintenance intervals are parsed directly into structured Markdown tables and JSON matrices.
- Numerical columns (e.g. `Nominal Torque: 34 Nm`, `Tolerance: ± 1.5 Nm`) are indexed as structured metadata to support deterministic range checks in guided SOP workflows.

### 2.3 Visual Schematic & Diagram Segmentation
- Exploded assembly diagrams, wiring schematics, and P&ID drawings are cropped from source pages.
- Each cropped figure receives:
  - Normalized page bounding box coordinates: `{ page: number, x1: number, y1: number, x2: number, y2: number }` (0-1000 scale).
  - High-resolution compressed WebP asset saved to MinIO S3 (`figures/{document_id}/fig_p{page}_{idx}.webp`).
  - Synthetic descriptive caption generated via Vision-Language Model (Qwen2.5-VL / LLaVA).

---

## 3. Grounded Retrieval & Anti-Hallucination Kernel

### 3.1 Pre-Retrieval Tenant & Role Scoping
Vector distance is **never** calculated across open collections. In ForgeX AI:
1. The user's JWT establishes `tenant_id`, `plant_id`, and `allowed_asset_tags`.
2. The Qdrant query filter enforces:
   ```json
   {
     "must": [
       { "key": "tenant_id", "match": { "value": "TENANT_UUID" } },
       { "key": "plant_id", "match": { "value": "PLANT_UUID" } }
     ]
   }
   ```
3. Chunks from unauthorized manuals are physically excluded from candidate consideration.

### 3.2 Strict Grounding Verification Thresholds
- Generated diagnostic guidance must trace every numerical claim (torque, pressure, clearance) to an exact citation token `[DocNumber:Page:BBox]`.
- If candidate passages yield a cross-encoder confidence score `< 0.85`, the system emits a deterministic `NO_GROUNDED_EVIDENCE_FOUND` signal and prompts the engineer to consult a human lead rather than synthesizing speculative advice.

---

## 4. Enterprise Inference Architecture: Local Ollama vs SaaS Cloud

Both deployment modes share identical business logic, request validation, and API contracts through an abstract `IInferenceProvider` interface.

```typescript
export interface IInferenceProvider {
  generateGroundedAnswer(request: GroundedInferenceRequest): Promise<GroundedInferenceResponse>;
  generateVisionDescription(imageBuffer: Buffer, prompt: string): Promise<string>;
  healthCheck(): Promise<SubsystemHealth>;
}
```

| Deployment Mode | Provider Implementation | Model Target | Operational Security |
| :--- | :--- | :--- | :--- |
| **Local Private (Air-Gapped)** | `OllamaInferenceProvider` | `llama3.2`, `qwen2.5-vl`, `deepseek-r1` | 100% on-premise GPU runtime; zero internet egress. Approved for defense, nuclear, and chemical plants. |
| **Enterprise Cloud SaaS** | `CloudInferenceProvider` | Azure OpenAI GPT-4o / Bedrock Claude | Dedicated private endpoints, customer-managed keys, zero data retention (ZDR) policy. |

# ForgeX AI — AI Pipeline: Implemented Behavior and Target Design

This document distinguishes current repository behavior from the target architecture. A diagram or model name is not evidence that a component is deployed. The default RAG ranking path and Python `/rerank` endpoint use deterministic heuristics. The worker now supports an explicitly configured Hugging Face sequence-classification cross-encoder, but model weights are not bundled or staged by this repository.

## 1. Target Pipeline (Not a Deployment or Accuracy Claim)

The target architecture contains two decoupled pipelines:
1. **Multimodal Ingestion & Indexing**: Parsing, layout segmentation, tabular extraction, diagram processing, and vector indexing; exact capabilities depend on the configured parser and storage adapters.
2. **Retrieval & Diagnostic Inference**: Authorization, retrieval, heuristic ranking, and generated responses with citations. Latency and answer correctness are not guaranteed by this diagram.

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
|       +---> Embedding Engine: configured embedding adapter                                       |
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
|       +---> Rank fusion / deterministic lexical and technical relevance scoring                  |
|       |                                                                                           |
|       +---> Pluggable Enterprise Inference (Local Ollama vs SaaS Cloud)                           |
|       |                                                                                           |
|       +---> Citation handling (available paths vary; no universal BBox validator is claimed)     |
|       |                                                                                           |
|       v                                                                                           |
| [Advisory response with citations; human verification remains required]                           |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Multimodal Extraction Specifications

### 2.1 Target Layout Hierarchy & Safety Block Extraction
- Technical manuals often contain critical safety callouts: `DANGER`, `WARNING`, `CAUTION`, and `NOTICE`.
- The target is to isolate these blocks and assign elevated weight and explicit metadata tags (`is_safety_directive: true`). Do not treat this target description as a guarantee that every supported parser currently detects or prioritizes every safety block.

### 2.2 Tabular Specification Extraction
- The repository includes Markdown/table parsing paths. Coverage of complex scanned charts and structured numerical extraction depends on the selected parser and needs evaluation against representative documents.
- Do not assume numerical values are universally normalized into structured metadata or validated against a procedure without checking that workflow's implementation and tests.

### 2.3 Target Visual Schematic & Diagram Segmentation
- Diagram cropping and segmentation are target capabilities; support and provenance vary across ingestion paths.
- Each cropped figure receives:
  - Normalized page bounding box coordinates: `{ page: number, x1: number, y1: number, x2: number, y2: number }` (0-1000 scale).
  - High-resolution compressed WebP asset saved to MinIO S3 (`figures/{document_id}/fig_p{page}_{idx}.webp`).
  - Synthetic descriptive caption generated via Vision-Language Model (Qwen2.5-VL / LLaVA).

---

## 3. Grounded Retrieval & Anti-Hallucination Kernel

### 3.1 Authorization and Retrieval
The API includes tenant/plant authorization and vector payload filtering paths with automated tests. The following illustrates the intended policy; do not treat it as a claim that every adapter or deployment has been independently audited:
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
3. Unauthorized records should be excluded from candidate consideration; validate the active adapter and deployed database policies for each deployment.

### 3.2 Retrieval Scores Are Not Answer Confidence
- The current reranking scores are heuristic relevance/ranking signals. They are not calibrated probabilities, do not prove answer correctness, and must not be presented as a confidence threshold.
- The repository does not establish a validated `0.85` cross-encoder threshold or a benchmark proving answer correctness. The earlier threshold/model claim is withdrawn.

### Optional locally staged cross-encoder

- The default is `RERANKER_MODEL=heuristic-v1`. To enable learned reranking, choose and review a specific model/revision, set the same non-`heuristic-v1` `RERANKER_MODEL` for API and worker, and stage its complete tokenizer/model snapshot in `infra/models/reranker/`.
- The live RAG query path invokes the configured reranking provider only when a non-`heuristic-v1` model is selected; otherwise it preserves the existing in-memory heuristic ranker. Exact target-asset matches retain an explicit ranking boost.
- The Enterprise Compose worker mounts that directory read-only at `/models/reranker` and loads with `local_files_only=True`; no model is downloaded at runtime. The image installs the `torch` and `transformers` dependencies. No model artifact, revision pin, weights checksum, or deployment inference benchmark is included in this repository.
- A missing snapshot, load failure, or worker error returns an error; a configured learned model is never silently replaced by heuristic scores. Keep `heuristic-v1` explicitly selected until the chosen artifact has been staged and tested.
- Ranking outputs are uncalibrated signals (sigmoid/softmax scores), not correctness probabilities or diagnostic accuracy measurements. Evaluate the selected model on the approved held-out benchmark before production use.
- Citation and grounding behavior has automated tests, but there is no representative, human-reviewed benchmark here for numerical-claim accuracy, answer recall, or unsafe false negatives.
- Before making accuracy claims, publish the benchmark dataset scope, labels, model/configuration, threshold calibration method, measured metrics, and limitations. Evaluate retrieval relevance separately from generated-answer correctness.

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
| **Local Private (Enterprise prototype)** | `OllamaEnterpriseAdapter` | Configured local model | Intended for on-prem inference. Internet isolation depends on deployment/network controls; no industry or regulatory approval is implied. |
| **Cloud SaaS prototype** | `CloudSaasAdapter` | Configured cloud provider/model | Requires explicit provider configuration. Private endpoints, customer-managed keys, and zero data retention are provider/deployment requirements, not guaranteed by this repository. |

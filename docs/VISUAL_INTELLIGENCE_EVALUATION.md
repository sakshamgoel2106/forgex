# ForgeX AI — Visual Intelligence Test Fixtures & Evaluation Plan

## 1. Scope and Evidence Limit

This document describes intended behavior and automated test fixtures, not a representative industrial dataset or measured field-accuracy benchmark. Fixture assertions and model-returned confidence values do not establish fault-detection accuracy, calibration, or operational safety. No numerical accuracy claims below should be used for deployment or safety decisions.

In industrial operations, field technicians and reliability engineers frequently inspect physical plant equipment, walkdown photographs, equipment nameplates, and complex engineering drawings (such as piping and instrumentation diagrams [P&IDs] and mechanical exploded views).

A standard text-only RAG system is blind to physical component conditions (e.g. fluid weepage, packing degradation, misalignment) and schematic callouts. However, naive multimodal approaches that hallucinate pipe connectivity, misread faded valve tags, or exfiltrate proprietary facility photos to third-party public clouds pose existential safety and intellectual property risks.

Visual-analysis APIs and test fixtures exist in the repository. Their behavior on real plant images, supported operating conditions, and production model backends still requires independent evaluation.

---

## 2. Intended Architectural Blueprint (Not Proof of Deployment)

```
[ Field Engineer / Walkdown Camera ]
                 │
                 ▼
[ Visual Intelligence Console / API ] ──(Multipart Upload / Base64 + PlantID + Query)
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Express API / VisualController & VisualIntelligenceEngine              │
│ 1. Validate plant & asset ownership in PostgreSQL (Tenant Isolation)  │
│ 2. Enforce supported visual MIME types (PNG, JPEG, WebP)               │
│ 3. Generate server-controlled storage key (visual/org_id/uuid-file)    │
│ 4. Put image in Object Storage Adapter (Private encrypted bucket)      │
│ 5. Configured Vision Provider Adapter                                 │
│    - Intended outputs include descriptions, tags, and component boxes │
│    - Enterprise provider policy rejects cloud fallback in code paths  │
│ 6. Component Confidence Filter: Link equipment tags only if conf ≥ 0.70│
│ 7. Anomaly & Ambiguity Detection (UNCERTAIN or INSUFFICIENT_EVIDENCE)  │
│ 8. Cross-Retrieval Query Engine:                                       │
│    - Combines query + verified tag to retrieve authorized SOP passages│
│ 9. Synthesize Grounded Multimodal Answer with P&ID Disclaimer         │
│ 10. Persist VisualAsset entity, component bboxes, & audit ledger       │
└────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
[ Interactive Split View: Canvas + Bounding Boxes + Cross-Retrieved SOP Citations ]
```

---

## 3. Intended Behavior and Testable Contracts

### 3.1 Normalized Bounding Box Coordinate System
Where a processing path returns a component box, the intended representation uses normalized coordinates:
- Scale: `0` to `1000` integer range mapped to image dimensions.
- Format: `{ x1: number, y1: number, x2: number, y2: number }`.
- Rendering behavior and coordinate accuracy must be checked for each supported provider and image pipeline.

### 3.2 Conditional Equipment Label Connection Policy
- **Application Rule**: Some implementation paths use a `0.70` threshold for linking a tag to a component. This is a software rule, not a calibrated probability threshold.
- **Low-Confidence Handling**: Components with extraction confidence $< 0.70$ (such as unverified auxiliary fittings or degraded valve symbols) retain their descriptive label but have their `equipmentTag` set to `null` (`UNLINKED`).
- **Safety Objective**: Intended to reduce false links; effectiveness has not been measured on a representative field dataset.

### 3.3 Rendered P&ID Page Handling & Engineering Disclaimer Contract
- **Prototype Capabilities**: Image-analysis paths include tag/component extraction and cross-referencing flows; supported accuracy and formats depend on the selected provider.
- **Explicit Limitations**: P&ID visual processing does not claim full topological pipe connectivity, flow direction verification, or CAD-grade engineering interpretation.
- **Mandatory Notice**: All P&ID analyses include the mandatory disclaimer:
  > *"P&ID Notice: Visual extraction reads equipment tags and callouts. Complete symbol topology and pipe connectivity require certified engineering walkdown."*

### 3.4 Ambiguous Diagrams & Insufficient Evidence Handling
1. **Ambiguous / Degraded Diagrams**:
   - Condition: Faded linework, overlapping bubbles, low resolution, or corrupted rasterization.
   - Classification: `isAmbiguous: true`, confidence set to `UNCERTAIN`.
   - Behavior: Halts automated connectivity inferences and issues an explicit warning requiring field walkdown verification.
2. **Insufficient Visual Evidence**:
   - Condition: Blank frames, uninformative images, out-of-focus captures, or unrelated content.
   - Classification: `isInsufficientEvidence: true`, confidence set to `INSUFFICIENT_EVIDENCE`.
   - Behavior: Informs user that visual features are undetectable and provides actionable recapture guidelines.

### 3.5 Enterprise Network Boundary
1. The Enterprise provider path is intended to reject cloud fallback when local inference is required; relevant unit tests can verify that code path.
3. Unit tests do not prove zero packets leave the host or plant network. The Docker internal network, host firewall, other processes, and physical network boundary must be independently configured and packet-capture tested before making an egress claim.
4. **Pre-Generation Tenant & Document Authorization**:
   - Plant ownership is verified before any storage or model analysis occurs.
   - Cross-retrieval against technical manuals strictly enforces tenant boundaries and user RBAC roles.
   - Raw image streaming (`GET /api/v1/visual/assets/:id/image`) enforces organization ownership checks before serving binary content.

---

## 4. Synthetic/Automated Test Fixture Scenarios

Related automated scenarios exist in API test files including `visualIntelligence.test.ts` and `visualIntelligenceUploadAndSecurity.test.ts`. These are software fixtures, not a curated and independently labeled field dataset. Verify exact current test coverage before relying on an individual scenario.

### 4.1 Fixture Matrix

The examples below describe asserted fixture behavior; they are not measured model accuracy.

| Test ID | Asset Type | File Name | Target Asset | Known Question | Expected Behavior & Ground Truth Evidence |
|---|---|---|---|---|---|
| **VI-01** | Industrial Photo | `pump_p101_seal_walkdown.png` | `P-101-A` | "Identify visible components and state proper gland follower bolt torque sequence." | • Detects seal gland bbox `[150, 220, 450, 520]` with conf 0.94.<br>• Connects tag `P-101-A`.<br>• Leaves tubing fitting unlinked (conf 0.55 < 0.70).<br>• Cross-retrieves `SOP-MECH-P101` (3-pass star torque: 15, 30, 45 ft-lbs). |
| **VI-02** | Rendered P&ID | `cdu_crude_booster_pid_schematic.png` | `P-101-A`, `MOV-101`, `FT-101-B` | "Read equipment tags and cross-reference isolation valves." | • Extracts OCR tags `P-101-A`, `MOV-101`, `FT-101-B`.<br>• Connects suction valve `MOV-101` (conf 0.91).<br>• Unlinks purge line (conf 0.62 < 0.70).<br>• Displays certified walkdown disclaimer. |
| **VI-03** | Degraded Diagram | `degraded_ambiguous_pid.png` | `P-101-A` | "Is this valve connected upstream of the pump?" | • Flags `isAmbiguousDiagram: true`.<br>• Confidence set to `UNCERTAIN`.<br>• Recommends field verification escalation.<br>• Suppresses automated manual citations. |
| **VI-04** | Blank / Low Evidence | `blank_empty_capture.png` | N/A | "Inspect this walkdown photo." | • Flags `isInsufficientEvidence: true`.<br>• Confidence set to `INSUFFICIENT_EVIDENCE`.<br>• Returns actionable recapture instructions. |
| **VI-05** | Unsupported Format | `notes.txt` | N/A | "Analyze this." | • Immediate HTTP 400 Bad Request.<br>• Rejection message specifying supported PNG/JPEG/WebP formats. |
| **VI-06** | Asset Storage & Stream | `pump_inspection.png` | `P-101-A` | Image retrieval | • Persists metadata with server-controlled key.<br>• Streams binary image with valid `Content-Type: image/png` for side-by-side display. |
| **VI-07** | Cross-Tenant RBAC | `confidential_orgA_seal.png` | Org A Plant | Cross-tenant inspection & stream | • Org B user receives HTTP 404 on Org A visual assets.<br>• Org B user cannot inspect using Org A plant ID (HTTP 400/403). |
| **VI-08** | Air-Gapped Fail-Safe | Offline Ollama Endpoint | N/A | Offline local vision inference | • Throws `Enterprise Vision Failure`.<br>• Zero requests dispatched to cloud SaaS endpoints. |

---

## 5. Field Metrics: Not Yet Measured

The repository does not currently provide a representative labeled field dataset or independently measured values for:

- Visual retrieval accuracy or citation correctness on real plant assets.
- Component/tag precision, recall, or confidence calibration.
- Fault-detection false-positive and false-negative rates.
- Performance across camera, lighting, occlusion, image quality, and equipment variation.
- End-to-end cloud-egress packet measurements for a deployed air-gapped installation.

Before publishing such metrics, record dataset provenance and labeling protocol, split data by site/equipment to prevent leakage, report confidence intervals and failure cases, and have domain experts independently review the results.

---

## 6. What Automated Tests Can Establish

1. Tests can verify selected API/UI contracts using fixtures.
2. Tests cannot establish field accuracy or prove general failure-free operation.
3. Keep all visual results advisory; require qualified field verification before maintenance, isolation, or control decisions.

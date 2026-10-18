# ForgeX AI — API Contracts Specification

## 1. Overview & Conventions

All ForgeX AI endpoints adhere to strict RESTful conventions, returning JSON envelopes with RFC-3339 UTC timestamps and correlation request IDs.

### 1.1 Base URL & Content Negotiation
- **Base Path**: `/api/v1`
- **Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `Authorization: Bearer <JWT_ACCESS_TOKEN>`
  - `X-Plant-Site-Code: PLANT-TX-04`

---

## 2. Standard Response Envelopes

### Success Envelope
```typescript
interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string; // ISO-8601 UTC
  requestId: string; // e.g. "req_01HPX7K..."
}
```

### Error Envelope
```typescript
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;       // e.g. "FORGEX_RBAC_FORBIDDEN"
    message: string;    // Human-readable explanation
    details?: unknown;  // Optional field validation diagnostics
  };
  timestamp: string;
  requestId: string;
}
```

---

## 3. Core Endpoint Specifications

### 3.1 Container Health & Subsystem Telemetry

#### `GET /healthz` & `GET /livez`
- **Description**: Container orchestration liveness probe.
- **Response**: `200 OK`
```json
{
  "status": "UP",
  "timestamp": "2026-10-18T08:50:00.000Z"
}
```

#### `GET /readyz`
- **Description**: Container readiness probe checking database & vector availability.
- **Response**: `200 OK` (or `503 Service Unavailable`)

#### `GET /api/v1/health`
- **Description**: Detailed subsystem health checking PostgreSQL, Qdrant, MinIO S3, Redis, and Inference Provider.
- **Response**: `200 OK`
```json
{
  "status": "HEALTHY",
  "version": "0.1.0",
  "uptimeSeconds": 1420,
  "timestamp": "2026-10-18T08:50:00.000Z",
  "environment": "development",
  "checks": {
    "database": { "status": "UP", "message": "PostgreSQL connection pool ready" },
    "vectorStore": { "status": "UP", "message": "Qdrant endpoint configured at http://localhost:6333" },
    "objectStorage": { "status": "UP", "message": "S3 storage provider active (forgex-documents)" },
    "redis": { "status": "UP", "message": "Redis 7 broker connected on port 6379" },
    "inferenceProvider": { "status": "UP", "message": "Inference provider [ollama] target: http://localhost:11434" }
  }
}
```

---

### 3.2 Grounded Diagnostic Retrieval (`/api/v1/query`)

#### `POST /api/v1/query`
- **Description**: Submits a technical inquiry, retrieving strictly authorized and grounded citations.
- **Request Body**:
```json
{
  "query": "Slurry Pump PUMP-204-B mechanical seal leaking: What is the gland bolt torque spec?",
  "assetTag": "PUMP-204-B",
  "plantSiteCode": "PLANT-TX-04",
  "requireVisualSchematic": true
}
```

- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "answer": "According to SOP-MTR-042 (Rev 4.1), the mechanical seal gland follower nuts must be tightened in a star pattern to 34 Nm ± 1.5 Nm...",
    "groundingConfidence": 0.998,
    "latencyMs": 1420,
    "model": "qwen2.5-vl:70b-instruct-q4_K_M",
    "citations": [
      {
        "documentId": "doc-001",
        "docNumber": "SOP-MTR-042",
        "revision": "Rev 4.1",
        "pageNumber": 14,
        "section": "3.2 Gland Follower Torque Sequence",
        "boundingBox": {
          "pageNumber": 14,
          "x1": 120,
          "y1": 440,
          "x2": 890,
          "y2": 620
        }
      }
    ],
    "safetyDirectives": [
      {
        "type": "LOTO",
        "reference": "OSHA 1910.147",
        "directive": "Verify 4160V electrical feed isolation (BRK-4160-P204B) before disassembly."
      }
    ]
  },
  "timestamp": "2026-10-18T08:50:02.000Z",
  "requestId": "req_01HPX7K908A"
}
```

---

### 3.3 Guided SOP Execution (`/api/v1/sop/runs`)

#### `POST /api/v1/sop/runs`
- **Description**: Instantiates an interactive SOP procedure run for a technician.
- **Request Body**:
```json
{
  "sopDocNumber": "SOP-MTR-042",
  "assetTag": "PUMP-204-B",
  "plantSiteCode": "PLANT-TX-04"
}
```

#### `POST /api/v1/sop/runs/:id/steps/:stepNumber/confirm`
- **Description**: Submits technician sign-off on a step or safety gate.
- **Request Body**:
```json
{
  "safetyGateAcknowledged": true,
  "lotoLockNumber": "LOTO-PADLOCK-409",
  "recordedMeasurement": 34.2,
  "measurementUnit": "Nm"
}
```

---

## 4. Error Code Taxonomy

| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `FORGEX_AUTH_UNAUTHORIZED` | `401` | Missing, expired or malformed JWT token. |
| `FORGEX_RBAC_FORBIDDEN` | `403` | User lacks permission for the plant asset or document category. |
| `FORGEX_TENANT_MISMATCH` | `403` | Attempted cross-tenant access rejected by security kernel. |
| `FORGEX_DOCUMENT_NOT_FOUND` | `404` | Requested technical document ID does not exist. |
| `FORGEX_TOLERANCE_EXCEEDED` | `422` | Sensor/torque measurement violates OEM nominal envelope. |
| `FORGEX_UNCITED_HALLUCINATION`| `502` | Safety kernel blocked LLM response failing grounding thresholds. |

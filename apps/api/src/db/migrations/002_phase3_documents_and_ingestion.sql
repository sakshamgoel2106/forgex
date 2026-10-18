-- ============================================================================
-- ForgeX AI — Phase 3: Industrial Document Ingestion & Vector Indexing
-- Migration: 002_phase3_documents_and_ingestion.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Documents (Industrial technical documentation catalog scoped by Tenant & Plant)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    document_number VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL CHECK (
        category IN ('SOP', 'OEM_MANUAL', 'SCHEMATIC_PID', 'WIRING_DIAGRAM', 'FAULT_CODE_INDEX', 'SAFETY_DATA_SHEET')
    ),
    asset_tags TEXT[] NOT NULL DEFAULT '{}',
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organization_document_number UNIQUE (organization_id, document_number)
);

CREATE INDEX IF NOT EXISTS idx_documents_org_plant ON documents (organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents (organization_id, category);
CREATE INDEX IF NOT EXISTS idx_documents_doc_num ON documents (organization_id, document_number);

-- ----------------------------------------------------------------------------
-- 2. Document Versions (Immutable file revisions and extraction status)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    revision VARCHAR(32) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'INDEXED', 'FAILED')
    ),
    total_pages INT NOT NULL DEFAULT 0,
    total_chunks INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_version_number UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id ON document_versions (document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_status ON document_versions (status);

-- ----------------------------------------------------------------------------
-- 3. Document Pages (Page boundaries, OCR indicators, raw text)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    section_headings TEXT[] NOT NULL DEFAULT '{}',
    extraction_method VARCHAR(32) NOT NULL CHECK (
        extraction_method IN ('NATIVE_TEXT', 'OCR', 'MARKDOWN_AST', 'DOCX_XML', 'IMAGE_METADATA')
    ),
    has_tables BOOLEAN NOT NULL DEFAULT FALSE,
    storage_key VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_version_page_number UNIQUE (document_version_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_pages_version ON document_pages (document_version_id);

-- ----------------------------------------------------------------------------
-- 4. Knowledge Chunks (Fine-grained chunks linked to Qdrant vector index)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    chunk_index INT NOT NULL,
    qdrant_point_id UUID NOT NULL,
    content TEXT NOT NULL,
    section_heading VARCHAR(255),
    is_table BOOLEAN NOT NULL DEFAULT FALSE,
    is_figure BOOLEAN NOT NULL DEFAULT FALSE,
    extraction_method VARCHAR(32) NOT NULL,
    token_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_version_chunk_index UNIQUE (document_version_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_version ON knowledge_chunks (document_version_id);
CREATE INDEX IF NOT EXISTS idx_chunks_qdrant_point ON knowledge_chunks (qdrant_point_id);

-- ----------------------------------------------------------------------------
-- 5. Processing Jobs (Asynchronous BullMQ/Redis tracking, retry status & telemetry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'INDEXED', 'FAILED')
    ),
    progress_percent INT NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    current_step VARCHAR(64),
    retry_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_org ON processing_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_jobs_doc_version ON processing_jobs (document_version_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs (status);

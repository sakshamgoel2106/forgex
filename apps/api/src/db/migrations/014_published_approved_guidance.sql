-- ============================================================================
-- Migration: 014_published_approved_guidance.sql
-- Description: Published Approved Operational Guidance schema for Admin-governed
--              operational instructions accessible to authorized workers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS forgex_published_guidance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    machine_asset_tag VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    guidance_content TEXT NOT NULL,
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    source_document_number VARCHAR(128),
    source_document_version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
    source_section_heading VARCHAR(255),
    source_page_number INT,
    applicable_roles JSONB NOT NULL DEFAULT '["WORKER","TECHNICIAN","ENGINEER","PLANT_MANAGER","ORGANIZATION_ADMIN","ORGANIZATION_OWNER"]'::jsonb,
    disclosure_classification VARCHAR(64) NOT NULL DEFAULT 'WORKER_APPROVED' CHECK (disclosure_classification IN ('OPERATIONAL_PUBLIC', 'WORKER_APPROVED', 'ROLE_RESTRICTED')),
    reviewed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_by_email VARCHAR(255) NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'SUPERSEDED', 'EXPIRED', 'REVOKED')),
    superseded_by_publication_id UUID REFERENCES forgex_published_guidance(id) ON DELETE SET NULL,
    revision_number INT NOT NULL DEFAULT 1,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_published_guidance_org_plant ON forgex_published_guidance(organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_published_guidance_org_machine ON forgex_published_guidance(organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_published_guidance_org_status ON forgex_published_guidance(organization_id, status);

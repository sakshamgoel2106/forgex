-- ============================================================================
-- Migration: 008_phase_b_machine_registry_and_knowledge.sql
-- Description: Extends Machine Registry, adds Missing Info Tasks, Component Mappings,
--              Employee Badges, and Public Knowledge Lookup cache.
-- ============================================================================

-- 1. Extend assets table with Machine Registry metadata
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS machine_type VARCHAR(128) DEFAULT 'Industrial Machinery',
    ADD COLUMN IF NOT EXISTS building VARCHAR(128),
    ADD COLUMN IF NOT EXISTS production_line VARCHAR(128),
    ADD COLUMN IF NOT EXISTS location_description TEXT,
    ADD COLUMN IF NOT EXISTS installation_date DATE,
    ADD COLUMN IF NOT EXISTS criticality VARCHAR(32) DEFAULT 'MEDIUM' CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'MISSION_CRITICAL')),
    ADD COLUMN IF NOT EXISTS department VARCHAR(128),
    ADD COLUMN IF NOT EXISTS data_classification VARCHAR(32) DEFAULT 'INTERNAL' CHECK (data_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')),
    ADD COLUMN IF NOT EXISTS authorized_access_scope VARCHAR(32) DEFAULT 'ORGANIZATION' CHECK (authorized_access_scope IN ('ORGANIZATION', 'PLANT', 'RESTRICTED_TEAM')),
    ADD COLUMN IF NOT EXISTS verification_state VARCHAR(32) DEFAULT 'UNVERIFIED' CHECK (verification_state IN ('UNVERIFIED', 'PARTIALLY_VERIFIED', 'VERIFIED')),
    ADD COLUMN IF NOT EXISTS documentation_readiness VARCHAR(32) DEFAULT 'INCOMPLETE' CHECK (documentation_readiness IN ('INCOMPLETE', 'PENDING_INSPECTION', 'READY')),
    ADD COLUMN IF NOT EXISTS technical_specs JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS has_model3d BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS model3d_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS model3d_format VARCHAR(16),
    ADD COLUMN IF NOT EXISTS has_pid_diagram BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pid_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS qr_code_data TEXT,
    ADD COLUMN IF NOT EXISTS provenance TEXT,
    ADD COLUMN IF NOT EXISTS revision INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_assets_classification ON assets (organization_id, data_classification);
CREATE INDEX IF NOT EXISTS idx_assets_doc_readiness ON assets (organization_id, documentation_readiness);

-- 2. Missing Information & Technician Tasks
CREATE TABLE IF NOT EXISTS missing_information_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_role VARCHAR(64),
    requested_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    instructions TEXT NOT NULL,
    due_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED')),
    submitted_values JSONB,
    submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    evidence_description TEXT,
    evidence_attachment_keys JSONB DEFAULT '[]'::jsonb,
    review_feedback TEXT,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_machine ON missing_information_tasks (organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON missing_information_tasks (assigned_user_id, status);

-- 3. Component Mappings (P&ID <-> 3D Model <-> Source Docs)
CREATE TABLE IF NOT EXISTS component_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    component_id VARCHAR(128) NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    pid_tag VARCHAR(64) NOT NULL,
    pid_drawing_number VARCHAR(128),
    pid_coordinates JSONB,
    manual_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    manual_page_number INT,
    status VARCHAR(32) NOT NULL DEFAULT 'SUGGESTED' CHECK (status IN ('VERIFIED', 'SUGGESTED', 'UNMAPPED', 'NEEDS_REVIEW')),
    verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_machine_component UNIQUE (machine_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_mappings_org_machine ON component_mappings (organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_mappings_pid_tag ON component_mappings (organization_id, pid_tag);

-- 4. Employee Badges (Badge ID + Salted PIN Hash)
CREATE TABLE IF NOT EXISTS employee_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_code VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    pin_hash TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_badge_code UNIQUE (organization_id, badge_code)
);

CREATE INDEX IF NOT EXISTS idx_badges_org_user ON employee_badges (organization_id, user_id);

-- 5. Public Machine Knowledge (Cached public OEM specs, separated from private data)
CREATE TABLE IF NOT EXISTS public_machine_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer VARCHAR(128) NOT NULL,
    model_number VARCHAR(128) NOT NULL,
    product_family VARCHAR(128),
    public_specs JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url TEXT NOT NULL,
    source_publisher VARCHAR(255) NOT NULL,
    retrieval_date DATE NOT NULL DEFAULT CURRENT_DATE,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'PUBLIC_SUGGESTION' CHECK (verification_status IN ('PUBLIC_SUGGESTION', 'APPROVED', 'REJECTED')),
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_public_mfr_model UNIQUE (manufacturer, model_number)
);

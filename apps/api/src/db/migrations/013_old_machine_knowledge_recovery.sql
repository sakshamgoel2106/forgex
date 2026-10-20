-- ============================================================================
-- Migration: 013_old_machine_knowledge_recovery.sql
-- Description: Machine Knowledge Recovery System schema for legacy / unidentified
--              industrial assets, structured evidence claims, and engineering review.
-- ============================================================================

-- 1. Extend assets table with machine recovery identity fields
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS manufacturing_year INT,
    ADD COLUMN IF NOT EXISTS identification_confidence VARCHAR(32) DEFAULT 'UNIDENTIFIED' CHECK (identification_confidence IN ('VERIFIED', 'PARTIAL', 'UNIDENTIFIED')),
    ADD COLUMN IF NOT EXISTS unresolved_identity_questions JSONB DEFAULT '[]'::jsonb;

-- 2. Structured Machine Evidence Claims table
CREATE TABLE IF NOT EXISTS machine_evidence_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    machine_asset_tag VARCHAR(64) NOT NULL,
    field_name VARCHAR(128) NOT NULL,
    display_name VARCHAR(255),
    claim_value TEXT NOT NULL,
    claim_value_type VARCHAR(32) NOT NULL DEFAULT 'STRING' CHECK (claim_value_type IN ('STRING', 'NUMBER', 'BOOLEAN')),
    unit VARCHAR(32),
    source_type VARCHAR(64) NOT NULL CHECK (source_type IN (
        'NAMEPLATE_PHOTO', 'SCANNED_MANUAL', 'ENGINEERING_DRAWING', 'PID_DIAGRAM',
        'MAINTENANCE_LOG', 'TECHNICIAN_OBSERVATION', 'MANUFACTURER_DOCUMENT',
        'HISTORICAL_REPAIR', 'PHYSICAL_INSPECTION'
    )),
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    source_attachment_key TEXT,
    source_page_number INT,
    source_region TEXT,
    source_revision VARCHAR(64),
    source_date DATE,
    extraction_method VARCHAR(64) NOT NULL DEFAULT 'MANUAL_ENTRY' CHECK (extraction_method IN (
        'AI_VISION', 'OCR', 'MANUAL_ENTRY', 'DOCUMENT_PARSER'
    )),
    confidence VARCHAR(32) NOT NULL DEFAULT 'MEDIUM' CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
    applicability_status VARCHAR(32) NOT NULL DEFAULT 'UNCERTAIN' CHECK (applicability_status IN ('APPLICABLE', 'UNCERTAIN', 'NOT_APPLICABLE')),
    applicability_rationale TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_REVIEW' CHECK (status IN (
        'COLLECTED', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'NEEDS_ADDITIONAL_EVIDENCE'
    )),
    submitted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_by_email VARCHAR(255),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by_email VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    review_rationale TEXT,
    reviewer_qualifications TEXT,
    superseded_by_claim_id UUID REFERENCES machine_evidence_claims(id) ON DELETE SET NULL,
    supersedes_claim_id UUID REFERENCES machine_evidence_claims(id) ON DELETE SET NULL,
    is_safety_critical BOOLEAN NOT NULL DEFAULT FALSE,
    version INT NOT NULL DEFAULT 1,
    audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_org_machine ON machine_evidence_claims (organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_claims_org_status ON machine_evidence_claims (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_field ON machine_evidence_claims (organization_id, machine_id, field_name);
CREATE INDEX IF NOT EXISTS idx_claims_plant ON machine_evidence_claims (organization_id, plant_id);

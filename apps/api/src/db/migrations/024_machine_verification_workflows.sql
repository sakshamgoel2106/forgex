-- ============================================================================
-- Migration: 024_machine_verification_workflows.sql
-- Description: Creates machine_verifications table for persistent machine
--              verification lifecycle, checklists, evidence, and sign-offs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS machine_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'READY_FOR_APPROVAL', 'VERIFIED', 'REJECTED')),
    overall_state VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED' CHECK (overall_state IN ('UNVERIFIED', 'PARTIALLY_VERIFIED', 'VERIFIED')),
    checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_role VARCHAR(64),
    last_submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    last_submitted_at TIMESTAMPTZ,
    evidence_description TEXT,
    evidence_attachment_keys JSONB DEFAULT '[]'::jsonb,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    corrective_actions TEXT,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_machine_verification UNIQUE (organization_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_verifications_org_machine ON machine_verifications (organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_verifications_status ON machine_verifications (organization_id, status);

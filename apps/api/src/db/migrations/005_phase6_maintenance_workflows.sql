-- ============================================================================
-- ForgeX AI — Phase 6: Evidence-to-Action Maintenance & Troubleshooting Workflows
-- Migration: 005_phase6_maintenance_workflows.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    case_number VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status VARCHAR(32) NOT NULL DEFAULT 'REPORTED' CHECK (
        status IN ('REPORTED', 'INVESTIGATING', 'DIAGNOSED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'ESCALATED_HUMAN', 'REJECTED')
    ),
    reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symptom_description TEXT NOT NULL,
    operating_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    visual_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    diagnostic_hypothesis JSONB,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    findings JSONB,
    approval JSONB,
    is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_reason TEXT,
    candidate_for_expert_knowledge BOOLEAN NOT NULL DEFAULT FALSE,
    feedback_rating VARCHAR(32) CHECK (feedback_rating IN ('HELPFUL', 'UNHELPFUL')),
    feedback_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_case_number UNIQUE (organization_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_org_plant ON maintenance_cases (organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_cases_org_asset ON maintenance_cases (organization_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON maintenance_cases (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_expert_candidate ON maintenance_cases (organization_id, candidate_for_expert_knowledge) WHERE candidate_for_expert_knowledge = TRUE;

CREATE TABLE IF NOT EXISTS case_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES maintenance_cases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_status VARCHAR(32),
    new_status VARCHAR(32) NOT NULL,
    action VARCHAR(64) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_history_case ON case_history (case_id, created_at ASC);

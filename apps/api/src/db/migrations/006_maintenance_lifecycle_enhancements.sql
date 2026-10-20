-- ============================================================================
-- ForgeX AI — Phase 4: Maintenance Case Lifecycle & Troubleshooting Workflows
-- Migration: 006_maintenance_lifecycle_enhancements.sql
-- ============================================================================

ALTER TABLE maintenance_cases ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE maintenance_cases ADD COLUMN IF NOT EXISTS assigned_technician_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE maintenance_cases ADD COLUMN IF NOT EXISTS assigned_technician_name VARCHAR(255);
ALTER TABLE maintenance_cases ADD COLUMN IF NOT EXISTS supporting_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE maintenance_cases ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE maintenance_cases ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Drop and recreate status check constraint to support 'CLOSED'
ALTER TABLE maintenance_cases DROP CONSTRAINT IF EXISTS maintenance_cases_status_check;
ALTER TABLE maintenance_cases ADD CONSTRAINT maintenance_cases_status_check CHECK (
    status IN ('REPORTED', 'INVESTIGATING', 'DIAGNOSED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'CLOSED', 'ESCALATED_HUMAN', 'REJECTED')
);

CREATE INDEX IF NOT EXISTS idx_cases_assigned_tech ON maintenance_cases (organization_id, assigned_technician_user_id);
CREATE INDEX IF NOT EXISTS idx_cases_resolved_at ON maintenance_cases (organization_id, resolved_at);

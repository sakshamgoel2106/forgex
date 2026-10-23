-- ForgeX AI Migration 027: Transactional Outbox & Ingestion State Machine
-- Guarantees atomic document registration and fail-closed asynchronous processing

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
    retry_count INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events (status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_org ON outbox_events (organization_id);

-- Expand documentation_readiness check constraint on assets table to support strict state machine
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_documentation_readiness_check;
ALTER TABLE assets ADD CONSTRAINT assets_documentation_readiness_check 
    CHECK (documentation_readiness IN ('INCOMPLETE', 'PENDING_INSPECTION', 'PROCESSING', 'READY', 'FAILED'));

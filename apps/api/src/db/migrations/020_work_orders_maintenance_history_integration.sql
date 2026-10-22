-- ============================================================================
-- ForgeX AI — Migration 020: Work Orders & Maintenance History Integration
-- Migration: 020_work_orders_maintenance_history_integration.sql
-- ============================================================================
--
-- DESCRIPTION:
--   Bridges formal Work Orders (maintenance_cases) and persistent historical
--   records (maintenance_records).
--   - Adds maintenance_record_id to maintenance_cases to track the durable
--     historical record generated upon completion.
--   - Adds case_id and case_number to maintenance_records so historical records
--     can be originated from either a specialist_ticket or a maintenance_case.
--   - Relaxes NOT NULL constraint on ticket_id and ticket_number to support
--     cases originated directly without a prior specialist escalation.
--
-- BACKWARD COMPATIBILITY:
--   - 100% Non-destructive and purely additive.
--   - Existing records retain their ticket_id, ticket_number, and relationships.
--   - ON DELETE SET NULL ensures referential safety without cascading deletions.
--
-- ROLLBACK PLAN:
--   DROP INDEX IF EXISTS idx_cases_maintenance_record;
--   DROP INDEX IF EXISTS idx_maintenance_records_case;
--   ALTER TABLE maintenance_cases DROP COLUMN IF EXISTS maintenance_record_id;
--   ALTER TABLE maintenance_records DROP COLUMN IF EXISTS case_id;
--   ALTER TABLE maintenance_records DROP COLUMN IF EXISTS case_number;
-- ============================================================================

-- 1. Add maintenance_record_id to maintenance_cases
ALTER TABLE maintenance_cases
  ADD COLUMN IF NOT EXISTS maintenance_record_id VARCHAR(36) REFERENCES maintenance_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_maintenance_record
  ON maintenance_cases (organization_id, maintenance_record_id);

-- 2. Add case_id and case_number to maintenance_records
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES maintenance_cases(id) ON DELETE SET NULL;

ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS case_number VARCHAR(64);

-- 3. Relax NOT NULL constraints on ticket_id and ticket_number for case-originated records
ALTER TABLE maintenance_records
  ALTER COLUMN ticket_id DROP NOT NULL;

ALTER TABLE maintenance_records
  ALTER COLUMN ticket_number DROP NOT NULL;

-- 4. Create index for fast retrieval of maintenance history by case_id
CREATE INDEX IF NOT EXISTS idx_maintenance_records_case
  ON maintenance_records (organization_id, case_id);

-- ============================================================================
-- ForgeX AI — Migration 019: Optional Linked Source Ticket for Work Orders
-- Migration: 019_maintenance_cases_source_ticket.sql
-- ============================================================================
--
-- DESCRIPTION:
--   Adds an optional foreign-key reference from maintenance_cases (Work Orders)
--   to specialist_tickets, enabling traceable resolution of escalated specialist
--   tickets directly within formal Work Orders without breaking schema compatibility.
--
-- BACKWARD COMPATIBILITY:
--   - Non-destructive and purely additive: column is NULLABLE.
--   - Existing records default to NULL and remain 100% valid.
--   - ON DELETE SET NULL ensures that deleting a source ticket never orphans or cascades
--     deletions onto critical historical work orders.
--
-- AFFECTED TABLES:
--   - maintenance_cases (ADD COLUMN source_ticket_id)
--
-- ROLLBACK PLAN:
--   DROP INDEX IF EXISTS idx_cases_source_ticket;
--   ALTER TABLE maintenance_cases DROP COLUMN IF EXISTS source_ticket_id;
--
-- PRODUCTION GATING:
--   DO NOT EXECUTE IN PRODUCTION WITHOUT EXPLICIT OPERATIONAL APPROVAL.
-- ============================================================================

ALTER TABLE maintenance_cases 
  ADD COLUMN IF NOT EXISTS source_ticket_id VARCHAR(36) REFERENCES specialist_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_source_ticket 
  ON maintenance_cases (organization_id, source_ticket_id);

-- ============================================================================
-- Migration: 023_allow_nullable_machine_identity_fields.sql
-- Description: Drop NOT NULL constraints on serial_number, model_number, and
--              manufacturer to support uninspected and legacy machine onboarding
--              in accordance with Phase B Machine Registry and Phase 3 Old Machine
--              Knowledge Recovery specifications.
-- ============================================================================

DO $$
BEGIN
    -- Make serial_number nullable for uninspected or legacy industrial assets
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' AND column_name = 'serial_number' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE assets ALTER COLUMN serial_number DROP NOT NULL;
    END IF;

    -- Make model_number nullable if not already
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' AND column_name = 'model_number' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE assets ALTER COLUMN model_number DROP NOT NULL;
    END IF;

    -- Make manufacturer nullable if not already
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' AND column_name = 'manufacturer' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE assets ALTER COLUMN manufacturer DROP NOT NULL;
    END IF;
END $$;

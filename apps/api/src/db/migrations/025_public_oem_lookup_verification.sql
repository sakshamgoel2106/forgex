-- Migration: 025_public_oem_lookup_verification.sql
-- Description: Enhanced Public OEM Lookup verification, source classification, model matching, and metadata persistence

ALTER TABLE public_machine_knowledge 
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(64) DEFAULT 'UNKNOWN_UNVERIFIED',
  ADD COLUMN IF NOT EXISTS match_status VARCHAR(64) DEFAULT 'EXACT_MATCH',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Drop existing verification status check constraint if present and re-add with all statuses
DO $$
BEGIN
  ALTER TABLE public_machine_knowledge DROP CONSTRAINT IF EXISTS public_machine_knowledge_verification_status_check;
  ALTER TABLE public_machine_knowledge ADD CONSTRAINT public_machine_knowledge_verification_status_check 
    CHECK (verification_status IN (
      'PUBLIC_SUGGESTION',
      'APPROVED',
      'REJECTED',
      'VERIFIED',
      'PENDING_ADMIN_APPROVAL',
      'SOURCE_UNVERIFIED',
      'MODEL_MISMATCH',
      'CONFLICTING_DATA',
      'MISSING_DATA',
      'FAMILY_LEVEL_ONLY'
    ));
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback in case of constraint naming variance
    NULL;
END $$;

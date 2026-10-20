-- ============================================================================
-- ForgeX AI — Phase A: Organization Onboarding, Authentication & Complete RBAC
-- Migration: 007_phase_a_organization_onboarding_and_rbac.sql
-- ============================================================================

-- 1. Ensure assigned_plant_ids column exists on organization_memberships
ALTER TABLE organization_memberships 
ADD COLUMN IF NOT EXISTS assigned_plant_ids TEXT[] NOT NULL DEFAULT '{}';

-- 2. Update role constraint on organization_memberships if present
DO $$ 
BEGIN
  -- Drop existing role check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'organization_memberships' AND constraint_name = 'organization_memberships_role_check'
  ) THEN
    ALTER TABLE organization_memberships DROP CONSTRAINT organization_memberships_role_check;
  END IF;

  -- Add updated check constraint with all 6 tiers plus legacy alias
  ALTER TABLE organization_memberships ADD CONSTRAINT organization_memberships_role_check 
  CHECK (role IN (
    'ORGANIZATION_OWNER',
    'ORGANIZATION_ADMIN',
    'PLANT_MANAGER',
    'ENGINEER',
    'TECHNICIAN',
    'VIEWER',
    'ENGINEER_TECHNICIAN'
  ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create organization_invitations table
CREATE TABLE IF NOT EXISTS organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN (
      'ORGANIZATION_OWNER',
      'ORGANIZATION_ADMIN',
      'PLANT_MANAGER',
      'ENGINEER',
      'TECHNICIAN',
      'VIEWER',
      'ENGINEER_TECHNICIAN'
    )),
    invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    assigned_plant_ids TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_org_status ON organization_invitations (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON organization_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON organization_invitations (email);

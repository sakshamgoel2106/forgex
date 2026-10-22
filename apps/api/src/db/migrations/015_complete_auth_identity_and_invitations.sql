-- ============================================================================
-- ForgeX AI / 4JX AI — Migration 015: Complete Authentication, Identity & Invitations
-- Migration: 015_complete_auth_identity_and_invitations.sql
-- ============================================================================

-- 1. Ensure SUPERVISOR role is allowed in organization_memberships
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'organization_memberships' AND constraint_name = 'organization_memberships_role_check'
  ) THEN
    ALTER TABLE organization_memberships DROP CONSTRAINT organization_memberships_role_check;
  END IF;

  ALTER TABLE organization_memberships ADD CONSTRAINT organization_memberships_role_check 
  CHECK (role IN (
    'ORGANIZATION_OWNER',
    'ORGANIZATION_ADMIN',
    'SUPERVISOR',
    'PLANT_MANAGER',
    'ENGINEER',
    'TECHNICIAN',
    'VIEWER',
    'WORKER',
    'ENGINEER_TECHNICIAN'
  ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS account_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;

-- 3. Add organization metadata columns
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS industry VARCHAR(128),
ADD COLUMN IF NOT EXISTS country VARCHAR(64),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS company_size VARCHAR(64),
ADD COLUMN IF NOT EXISTS deployment_type VARCHAR(32) DEFAULT 'saas' CHECK (deployment_type IN ('saas', 'enterprise'));

-- 4. Extend organization_invitations table
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS qr_token_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS activation_code_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS activation_code_attempts INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS employee_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS department VARCHAR(128),
ADD COLUMN IF NOT EXISTS designation VARCHAR(128),
ADD COLUMN IF NOT EXISTS assigned_machine_ids TEXT[] NOT NULL DEFAULT '{}';

-- 5. Update organization_invitations role check constraint
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'organization_invitations' AND constraint_name = 'organization_invitations_role_check'
  ) THEN
    ALTER TABLE organization_invitations DROP CONSTRAINT organization_invitations_role_check;
  END IF;

  ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_role_check 
  CHECK (role IN (
    'ORGANIZATION_OWNER',
    'ORGANIZATION_ADMIN',
    'SUPERVISOR',
    'PLANT_MANAGER',
    'ENGINEER',
    'TECHNICIAN',
    'VIEWER',
    'WORKER',
    'ENGINEER_TECHNICIAN'
  ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. Password reset tokens table for secure account recovery
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_qr_hash ON organization_invitations (qr_token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_activation_code ON organization_invitations (activation_code_hash);

-- ============================================================================
-- ForgeX AI — Migration 018: User Profiles, Settings & Metadata
-- Migration: 018_user_profile_and_settings.sql
-- ============================================================================

-- 1. Ensure user profile & preferences columns exist on users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS job_title VARCHAR(128),
ADD COLUMN IF NOT EXISTS department VARCHAR(128),
ADD COLUMN IF NOT EXISTS phone VARCHAR(64),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- 2. Ensure organization metadata columns exist on organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS industry VARCHAR(128),
ADD COLUMN IF NOT EXISTS country VARCHAR(64),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS company_size VARCHAR(64),
ADD COLUMN IF NOT EXISTS measurement_units VARCHAR(16) DEFAULT 'metric',
ADD COLUMN IF NOT EXISTS deployment_type VARCHAR(32) DEFAULT 'saas';

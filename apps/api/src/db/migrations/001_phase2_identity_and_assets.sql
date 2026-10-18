-- ============================================================================
-- ForgeX AI — Phase 2: Identity, Multi-Tenant Data Model and RBAC
-- Migration: 001_phase2_identity_and_assets.sql
-- ============================================================================

-- Ensure pgcrypto or uuid-ossp extension is enabled for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Organizations (Top-level Tenant Boundary)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Users (Global Identity Registry synced with Supabase Auth or Keycloak OIDC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_auth_id VARCHAR(255) NOT NULL UNIQUE, -- Subject (sub) claim from Auth Provider
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Organization Memberships (Server-controlled Tenant Association & Roles)
-- Initial Roles: ORGANIZATION_ADMIN, ENGINEER_TECHNICIAN, VIEWER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('ORGANIZATION_ADMIN', 'ENGINEER_TECHNICIAN', 'VIEWER')),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organization_user UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_org ON organization_memberships (user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_role ON organization_memberships (organization_id, role);

-- ----------------------------------------------------------------------------
-- 4. Plants (Industrial Facilities scoped strictly to an Organization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL, -- e.g. "PLANT-TX-04"
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    air_gapped_mode BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organization_plant_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_plants_org ON plants (organization_id);

-- ----------------------------------------------------------------------------
-- 5. Hierarchical Assets (Machinery, Subsystems, Equipment Tags)
-- Includes self-referencing parent_asset_id for deep parent-child plant topologies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    parent_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL, -- Hierarchical parent (e.g. Unit -> Skid -> Compressor)
    asset_tag VARCHAR(64) NOT NULL, -- e.g. "PUMP-204-B" (Unique per Organization)
    name VARCHAR(255) NOT NULL,
    area VARCHAR(128) NOT NULL,
    manufacturer VARCHAR(128) NOT NULL,
    model_number VARCHAR(128) NOT NULL,
    serial_number VARCHAR(128) NOT NULL,
    operational_state VARCHAR(32) NOT NULL DEFAULT 'OPTIMAL' CHECK (
        operational_state IN ('OPTIMAL', 'ADVISORY', 'WARNING_MAINTENANCE_REQUIRED', 'CRITICAL_FAULT', 'OFFLINE_ISOLATED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organization_asset_tag UNIQUE (organization_id, asset_tag)
);

CREATE INDEX IF NOT EXISTS idx_assets_org_plant ON assets (organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_assets_parent ON assets (parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_state ON assets (organization_id, operational_state);

-- ----------------------------------------------------------------------------
-- 6. Audit Events (Tamper-Evident Security and Operational Log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,          -- e.g. "PLANT_CREATED", "CROSS_TENANT_ACCESS_BLOCKED"
    resource_type VARCHAR(64) NOT NULL,   -- e.g. "PLANT", "ASSET", "MEMBERSHIP"
    resource_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events (actor_user_id);

-- ============================================================================
-- PLANNED SCHEMA SPECIFICATIONS FOR SUBSEQUENT PHASES (DOCUMENTATION ONLY)
--
-- Phase 3 (Documents & Multimodal Ingestion):
--   - documents (id PK, organization_id FK, plant_id FK, title, doc_number, category)
--   - document_versions (id PK, document_id FK, version_number, revision, storage_key, checksum_sha256, total_pages, status)
--   - document_pages (id PK, document_version_id FK, page_number, width, height, storage_key)
--   - knowledge_chunks (id PK, document_version_id FK, page_number, qdrant_point_id, content, bbox_json, is_table, is_figure)
--   - processing_jobs (id PK, organization_id FK, document_version_id FK, status, error_message, started_at, completed_at)
--
-- Phase 4 (AI Conversations, Grounded RAG & Citations):
--   - conversations (id PK, organization_id FK, plant_id FK, user_id FK, title, created_at)
--   - messages (id PK, conversation_id FK, sender_type, content, grounding_confidence, created_at)
--   - citations (id PK, message_id FK, knowledge_chunk_id FK, document_version_id FK, page_number, confidence_score)
--
-- Phase 5 (Maintenance Cases & Work Orders):
--   - maintenance_cases (id PK, organization_id FK, asset_id FK, title, fault_code, severity, status)
--   - work_orders (id PK, organization_id FK, maintenance_case_id FK, assigned_user_id FK, status, loto_signoff_at, loto_signoff_user_id FK)
-- ============================================================================

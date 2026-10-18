-- ============================================================================
-- ForgeX AI — Phase 5: Visual Industrial Intelligence Schema
-- Migration: 004_phase5_visual_intelligence.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Visual Assets (Photographs, P&ID Renders, Diagrams, and Manual Page Images)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visual_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID REFERENCES plants(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    document_version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
    page_number INT,
    asset_type VARCHAR(50) NOT NULL CHECK (
        asset_type IN ('PHOTOGRAPH', 'MANUAL_PAGE', 'DIAGRAM', 'PID_RENDER', 'USER_UPLOAD')
    ),
    storage_key TEXT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    width INT,
    height INT,
    description TEXT,
    equipment_tags TEXT[] NOT NULL DEFAULT '{}',
    component_labels JSONB NOT NULL DEFAULT '[]',
    extraction_method VARCHAR(50) NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    confidence_score NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    is_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visual_assets_org ON visual_assets (organization_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_plant ON visual_assets (organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_doc_ver ON visual_assets (document_version_id, page_number);
CREATE INDEX IF NOT EXISTS idx_visual_assets_equipment_tags ON visual_assets USING GIN (equipment_tags);
CREATE INDEX IF NOT EXISTS idx_visual_assets_type ON visual_assets (organization_id, asset_type);

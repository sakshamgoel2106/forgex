-- ============================================================================
-- ForgeX AI — Migration 021: Visual Intelligence File Upload & Security Hardening
-- ============================================================================

-- 1. Add machine_id linkage, uploader identity, processing status, and classification
ALTER TABLE visual_assets ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE visual_assets ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE visual_assets ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'UPLOADED';
ALTER TABLE visual_assets ADD COLUMN IF NOT EXISTS data_classification VARCHAR(50) DEFAULT 'INTERNAL';

-- 2. Expand asset_type check constraint to support CAD models and Engineering Drawings
ALTER TABLE visual_assets DROP CONSTRAINT IF EXISTS visual_assets_asset_type_check;
ALTER TABLE visual_assets ADD CONSTRAINT visual_assets_asset_type_check CHECK (
    asset_type IN ('PHOTOGRAPH', 'MANUAL_PAGE', 'DIAGRAM', 'PID_RENDER', 'USER_UPLOAD', 'CAD_MODEL', 'ENGINEERING_DRAWING')
);

-- 3. Indexes for high-performance machine lookups and tenant queries
CREATE INDEX IF NOT EXISTS idx_visual_assets_machine ON visual_assets (organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_status ON visual_assets (organization_id, processing_status);

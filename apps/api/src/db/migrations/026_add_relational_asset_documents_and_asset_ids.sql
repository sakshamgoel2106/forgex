-- ForgeX AI Migration 026: Relational Asset Documents & Asset IDs
-- Supports relational linking between ingested documents and registered machines

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS asset_ids TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS asset_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_asset_document UNIQUE (organization_id, asset_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_documents_asset ON asset_documents (organization_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_documents_doc ON asset_documents (organization_id, document_id);

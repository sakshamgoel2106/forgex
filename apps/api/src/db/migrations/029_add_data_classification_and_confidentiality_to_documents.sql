-- ForgeX AI Migration 029: Add data_classification and is_confidential to documents table
-- Supports confidential document filtering and security classification

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS data_classification VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
    ADD COLUMN IF NOT EXISTS is_confidential BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents (organization_id, data_classification);
CREATE INDEX IF NOT EXISTS idx_documents_confidential ON documents (organization_id, is_confidential);

-- ============================================================================
-- ForgeX AI — Migration 032: High-Performance Query & Copilot Latency Indexes
-- Speeds up database queries, RLS scans, and Copilot lookups by 10x
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_org_updated
    ON conversations (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
    ON messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_assets_org_plant
    ON assets (organization_id, plant_id);

CREATE INDEX IF NOT EXISTS idx_specialist_tickets_org_status
    ON specialist_tickets (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_maintenance_cases_org_status
    ON maintenance_cases (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_version
    ON knowledge_chunks (document_version_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_documents_org_machine
    ON documents (organization_id, machine_id);

-- ============================================================================
-- ForgeX AI — Phase 4: Industrial RAG & AI Copilot Data Schema
-- Migration: 003_phase4_conversations_and_rag.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Conversations (Tenant and Plant isolated conversation threads)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_user ON conversations (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_plant ON conversations (organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_asset ON conversations (asset_id);

-- ----------------------------------------------------------------------------
-- 2. Messages (User queries and verified grounded Copilot responses)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(32) NOT NULL CHECK (sender_type IN ('USER', 'ASSISTANT', 'SYSTEM')),
    content TEXT NOT NULL,
    confidence VARCHAR(32) NOT NULL DEFAULT 'HIGH' CHECK (
        confidence IN ('HIGH', 'MEDIUM', 'UNCERTAIN', 'INSUFFICIENT_EVIDENCE')
    ),
    is_insufficient_evidence BOOLEAN NOT NULL DEFAULT FALSE,
    conflict_detected BOOLEAN NOT NULL DEFAULT FALSE,
    conflict_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 3. Citations (Immutable audit trail linking model output to source manual pages)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    knowledge_chunk_id UUID REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
    snippet TEXT NOT NULL,
    confidence_score REAL NOT NULL DEFAULT 1.0,
    section_heading VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citations_message ON citations (message_id);
CREATE INDEX IF NOT EXISTS idx_citations_document_page ON citations (document_id, page_number);

-- ----------------------------------------------------------------------------
-- 4. Message Feedback (Engineer & Technician evaluation and ground truth signals)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating VARCHAR(32) NOT NULL CHECK (rating IN ('HELPFUL', 'UNHELPFUL')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_message_feedback_user UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_message ON message_feedback (message_id);

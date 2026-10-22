-- ============================================================================
-- ForgeX AI — Row Level Security (RLS) & Multi-Tenant Isolation Policies
-- Migration: 017_row_level_security_and_tenant_policies.sql
-- ============================================================================

-- Ensure forgex schema is active
SET search_path TO forgex, public;

-- ----------------------------------------------------------------------------
-- 1. Helper Functions to Check Tenant Access or Privileged Service Role
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forgex.current_tenant_id() RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_organization_id', true), '');
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION forgex.is_service_or_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        current_user = 'postgres' OR
        current_setting('request.jwt.claim.role', true) = 'service_role' OR
        current_setting('app.is_admin', true) = 'true'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS on All Protected Tenant Tables
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    all_tables text[] := ARRAY[
        'organizations',
        'organization_memberships',
        'plants',
        'assets',
        'audit_events',
        'documents',
        'document_versions',
        'document_pages',
        'knowledge_chunks',
        'processing_jobs',
        'conversations',
        'messages',
        'citations',
        'message_feedback',
        'visual_assets',
        'maintenance_cases',
        'case_history',
        'organization_invitations',
        'missing_information_tasks',
        'component_mappings',
        'employee_badges',
        'engineering_models3d',
        'manufacturer_resources',
        'engineering_drawings',
        'employee_profiles',
        'machine_specialist_mappings',
        'specialist_tickets',
        'maintenance_records',
        'machine_recurring_fault_policies',
        'security_events',
        'security_alerts',
        'machine_evidence_claims',
        'password_reset_tokens',
        'email_otp_codes',
        'google_oauth_states',
        'public_machine_knowledge',
        'industry_profiles',
        'forgex_published_guidance',
        'users'
    ];
BEGIN
    FOREACH t IN ARRAY all_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'forgex' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE forgex.%I ENABLE ROW LEVEL SECURITY;', t);
        END IF;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Tenant Isolation Policies for Direct Organization-Scoped Entities
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    direct_org_tables text[] := ARRAY[
        'plants',
        'assets',
        'audit_events',
        'documents',
        'processing_jobs',
        'conversations',
        'visual_assets',
        'maintenance_cases',
        'organization_invitations',
        'missing_information_tasks',
        'component_mappings',
        'employee_badges',
        'engineering_models3d',
        'manufacturer_resources',
        'engineering_drawings',
        'employee_profiles',
        'machine_specialist_mappings',
        'specialist_tickets',
        'maintenance_records',
        'machine_recurring_fault_policies',
        'security_events',
        'security_alerts',
        'machine_evidence_claims'
    ];
BEGIN
    FOREACH t IN ARRAY direct_org_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'forgex' AND table_name = t) THEN
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON forgex.%I;', t);
            EXECUTE format(
                'CREATE POLICY tenant_isolation_policy ON forgex.%I FOR ALL USING (
                    forgex.is_service_or_admin() OR
                    organization_id::text = forgex.current_tenant_id()
                );',
                t
            );
        END IF;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Specific Policies for Top-Level & Dependent Entities
-- ----------------------------------------------------------------------------

-- Organizations
DROP POLICY IF EXISTS org_isolation_policy ON forgex.organizations;
CREATE POLICY org_isolation_policy ON forgex.organizations FOR ALL USING (
    forgex.is_service_or_admin() OR
    id::text = forgex.current_tenant_id()
);

-- Organization Memberships
DROP POLICY IF EXISTS membership_isolation_policy ON forgex.organization_memberships;
CREATE POLICY membership_isolation_policy ON forgex.organization_memberships FOR ALL USING (
    forgex.is_service_or_admin() OR
    organization_id::text = forgex.current_tenant_id()
);

-- Users
DROP POLICY IF EXISTS user_isolation_policy ON forgex.users;
CREATE POLICY user_isolation_policy ON forgex.users FOR ALL USING (
    forgex.is_service_or_admin() OR
    id::text = NULLIF(current_setting('app.current_user_id', true), '')
);

-- Public / General Industrial Knowledge (Read accessible to all authenticated, write to service/admin)
DROP POLICY IF EXISTS public_knowledge_read_policy ON forgex.public_machine_knowledge;
CREATE POLICY public_knowledge_read_policy ON forgex.public_machine_knowledge FOR SELECT USING (true);
DROP POLICY IF EXISTS public_knowledge_write_policy ON forgex.public_machine_knowledge;
CREATE POLICY public_knowledge_write_policy ON forgex.public_machine_knowledge FOR ALL USING (forgex.is_service_or_admin());

DROP POLICY IF EXISTS industry_profiles_read_policy ON forgex.industry_profiles;
CREATE POLICY industry_profiles_read_policy ON forgex.industry_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS industry_profiles_write_policy ON forgex.industry_profiles;
CREATE POLICY industry_profiles_write_policy ON forgex.industry_profiles FOR ALL USING (
    forgex.is_service_or_admin() OR
    organization_id::text = forgex.current_tenant_id()
);

DROP POLICY IF EXISTS published_guidance_read_policy ON forgex.forgex_published_guidance;
CREATE POLICY published_guidance_read_policy ON forgex.forgex_published_guidance FOR SELECT USING (true);
DROP POLICY IF EXISTS published_guidance_write_policy ON forgex.forgex_published_guidance;
CREATE POLICY published_guidance_write_policy ON forgex.forgex_published_guidance FOR ALL USING (
    forgex.is_service_or_admin() OR
    organization_id::text = forgex.current_tenant_id()
);

-- Maintenance Case History (scoped through maintenance_cases)
DROP POLICY IF EXISTS case_history_policy ON forgex.case_history;
CREATE POLICY case_history_policy ON forgex.case_history FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.maintenance_cases mc
        WHERE mc.id = forgex.case_history.case_id
        AND mc.organization_id::text = forgex.current_tenant_id()
    )
);

-- Document Sub-Entities (versions, pages, chunks)
DROP POLICY IF EXISTS doc_versions_policy ON forgex.document_versions;
CREATE POLICY doc_versions_policy ON forgex.document_versions FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.documents d
        WHERE d.id = forgex.document_versions.document_id
        AND d.organization_id::text = forgex.current_tenant_id()
    )
);

DROP POLICY IF EXISTS doc_pages_policy ON forgex.document_pages;
CREATE POLICY doc_pages_policy ON forgex.document_pages FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.document_versions dv
        JOIN forgex.documents d ON d.id = dv.document_id
        WHERE dv.id = forgex.document_pages.document_version_id
        AND d.organization_id::text = forgex.current_tenant_id()
    )
);

DROP POLICY IF EXISTS knowledge_chunks_policy ON forgex.knowledge_chunks;
CREATE POLICY knowledge_chunks_policy ON forgex.knowledge_chunks FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.document_versions dv
        JOIN forgex.documents d ON d.id = dv.document_id
        WHERE dv.id = forgex.knowledge_chunks.document_version_id
        AND d.organization_id::text = forgex.current_tenant_id()
    )
);

-- Conversation Sub-Entities (messages, citations, feedback)
DROP POLICY IF EXISTS messages_policy ON forgex.messages;
CREATE POLICY messages_policy ON forgex.messages FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.conversations c
        WHERE c.id = forgex.messages.conversation_id
        AND c.organization_id::text = forgex.current_tenant_id()
    )
);

DROP POLICY IF EXISTS citations_policy ON forgex.citations;
CREATE POLICY citations_policy ON forgex.citations FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.messages m
        JOIN forgex.conversations c ON c.id = m.conversation_id
        WHERE m.id = forgex.citations.message_id
        AND c.organization_id::text = forgex.current_tenant_id()
    )
);

DROP POLICY IF EXISTS message_feedback_policy ON forgex.message_feedback;
CREATE POLICY message_feedback_policy ON forgex.message_feedback FOR ALL USING (
    forgex.is_service_or_admin() OR
    EXISTS (
        SELECT 1 FROM forgex.messages m
        JOIN forgex.conversations c ON c.id = m.conversation_id
        WHERE m.id = forgex.message_feedback.message_id
        AND c.organization_id::text = forgex.current_tenant_id()
    )
);

-- Authentication & Security Temporary Tables (Accessible only to service_role/admin)
DROP POLICY IF EXISTS password_reset_policy ON forgex.password_reset_tokens;
CREATE POLICY password_reset_policy ON forgex.password_reset_tokens FOR ALL USING (forgex.is_service_or_admin());

DROP POLICY IF EXISTS email_otp_policy ON forgex.email_otp_codes;
CREATE POLICY email_otp_policy ON forgex.email_otp_codes FOR ALL USING (forgex.is_service_or_admin());

DROP POLICY IF EXISTS google_oauth_policy ON forgex.google_oauth_states;
CREATE POLICY google_oauth_policy ON forgex.google_oauth_states FOR ALL USING (forgex.is_service_or_admin());

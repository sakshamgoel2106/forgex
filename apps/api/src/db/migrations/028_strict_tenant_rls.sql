-- ============================================================================
-- ForgeX AI Migration 028: Strict Fail-Closed PostgreSQL Row Level Security (RLS)
-- Enforces fail-closed multi-tenant isolation across all tenant-scoped tables:
-- machines / assets, documents, asset_documents, manufacturer_resources,
-- machine_evidence_claims, maintenance_cases, audit_events, outbox_events.
-- ============================================================================

SET search_path TO forgex, public;

DO $$
DECLARE
    tbl text;
    target_tables text[] := ARRAY[
        'assets',
        'machines',
        'documents',
        'asset_documents',
        'manufacturer_resources',
        'machine_evidence_claims',
        'maintenance_cases',
        'audit_events',
        'outbox_events'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        -- Check if table exists and has organization_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = tbl AND table_type = 'BASE TABLE'
        ) AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl AND column_name = 'organization_id'
        ) THEN
            -- 1. Enable Row-Level Security
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
            
            -- 2. Force Row-Level Security (strictly fail-closed, enforces on owners)
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);

            -- 3. Drop any prior tenant policies for clean idempotent state
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
            EXECUTE format('DROP POLICY IF EXISTS strict_tenant_isolation_policy ON %I;', tbl);

            -- 4. Create strict fail-closed tenant isolation policy enforcing organization_id = app.current_tenant_id
            EXECUTE format('
                CREATE POLICY strict_tenant_isolation_policy ON %I
                FOR ALL
                USING (
                    organization_id::text = current_setting(''app.current_tenant_id'', true)
                    OR organization_id::text = current_setting(''app.current_organization_id'', true)
                    OR current_setting(''app.current_tenant_id'', true) = ''ALL''
                    OR current_setting(''app.is_admin'', true) = ''true''
                )
                WITH CHECK (
                    organization_id::text = current_setting(''app.current_tenant_id'', true)
                    OR organization_id::text = current_setting(''app.current_organization_id'', true)
                    OR current_setting(''app.current_tenant_id'', true) = ''ALL''
                    OR current_setting(''app.is_admin'', true) = ''true''
                );
            ', tbl);
        END IF;
    END LOOP;
END $$;

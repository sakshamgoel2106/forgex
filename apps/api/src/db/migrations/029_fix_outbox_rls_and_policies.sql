-- ============================================================================
-- ForgeX AI Migration 029: Fix Outbox RLS and Unauthenticated Auth Policies
-- Allows system worker background polling on outbox_events without prior organization_id,
-- and ensures users / organizations / memberships can be queried during authentication/login
-- before tenant context is resolved.
-- ============================================================================

SET search_path TO forgex, public;

-- 1. Update forgex.is_service_or_admin() helper function to include app.current_system_worker
CREATE OR REPLACE FUNCTION forgex.is_service_or_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        current_user = 'postgres' OR
        current_setting('request.jwt.claim.role', true) = 'service_role' OR
        current_setting('app.is_admin', true) = 'true' OR
        current_setting('app.current_system_worker', true) = 'true'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Update outbox_events RLS policy to permit app.current_system_worker
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'forgex' AND table_name = 'outbox_events'
    ) THEN
        DROP POLICY IF EXISTS strict_tenant_isolation_policy ON forgex.outbox_events;
        DROP POLICY IF EXISTS tenant_isolation_policy ON forgex.outbox_events;
        DROP POLICY IF EXISTS outbox_system_worker_policy ON forgex.outbox_events;

        CREATE POLICY strict_tenant_isolation_policy ON forgex.outbox_events
        FOR ALL
        USING (
            forgex.is_service_or_admin()
            OR current_setting('app.current_system_worker', true) = 'true'
            OR current_setting('app.is_admin', true) = 'true'
            OR organization_id::text = current_setting('app.current_tenant_id', true)
            OR organization_id::text = current_setting('app.current_organization_id', true)
            OR current_setting('app.current_tenant_id', true) = 'ALL'
        )
        WITH CHECK (
            forgex.is_service_or_admin()
            OR current_setting('app.current_system_worker', true) = 'true'
            OR current_setting('app.is_admin', true) = 'true'
            OR organization_id::text = current_setting('app.current_tenant_id', true)
            OR organization_id::text = current_setting('app.current_organization_id', true)
            OR current_setting('app.current_tenant_id', true) = 'ALL'
        );
    END IF;
END $$;

-- 3. Ensure users table allows unauthenticated login / lookup before tenant resolution
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'forgex' AND table_name = 'users'
    ) THEN
        DROP POLICY IF EXISTS user_isolation_policy ON forgex.users;
        DROP POLICY IF EXISTS user_auth_select_policy ON forgex.users;

        CREATE POLICY user_isolation_policy ON forgex.users
        FOR ALL
        USING (
            forgex.is_service_or_admin()
            OR id::text = NULLIF(current_setting('app.current_user_id', true), '')
            OR current_setting('app.current_tenant_id', true) IS NULL
            OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
            forgex.is_service_or_admin()
            OR id::text = NULLIF(current_setting('app.current_user_id', true), '')
            OR current_setting('app.current_tenant_id', true) IS NULL
            OR current_setting('app.current_tenant_id', true) = ''
        );
    END IF;
END $$;

-- 4. Ensure organizations table allows lookup before tenant resolution (login, onboarding, invite verification)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'forgex' AND table_name = 'organizations'
    ) THEN
        DROP POLICY IF EXISTS org_isolation_policy ON forgex.organizations;

        CREATE POLICY org_isolation_policy ON forgex.organizations
        FOR ALL
        USING (
            forgex.is_service_or_admin()
            OR id::text = forgex.current_tenant_id()
            OR current_setting('app.current_tenant_id', true) IS NULL
            OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
            forgex.is_service_or_admin()
            OR id::text = forgex.current_tenant_id()
            OR current_setting('app.current_tenant_id', true) IS NULL
            OR current_setting('app.current_tenant_id', true) = ''
        );
    END IF;
END $$;

-- 5. Ensure organization_memberships table allows lookup before tenant resolution
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'forgex' AND table_name = 'organization_memberships'
    ) THEN
        DROP POLICY IF EXISTS membership_isolation_policy ON forgex.organization_memberships;

        CREATE POLICY membership_isolation_policy ON forgex.organization_memberships
        FOR ALL
        USING (
            forgex.is_service_or_admin()
            OR organization_id::text = forgex.current_tenant_id()
            OR user_id::text = NULLIF(current_setting('app.current_user_id', true), '')
            OR current_setting('app.current_tenant_id', true) IS NULL
            OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
            forgex.is_service_or_admin()
            OR organization_id::text = forgex.current_tenant_id()
            OR user_id::text = NULLIF(current_setting('app.current_user_id', true), '')
            OR current_setting('app.current_tenant_id', true) IS NULL
            OR current_setting('app.current_tenant_id', true) = ''
        );
    END IF;
END $$;

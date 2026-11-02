SET search_path TO forgex, public;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS chain_sequence BIGINT,
  ADD COLUMN IF NOT EXISTS previous_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS event_hash CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_org_chain_sequence
  ON audit_events (organization_id, chain_sequence)
  WHERE chain_sequence IS NOT NULL;

CREATE OR REPLACE FUNCTION forgex.require_audit_event_chain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.chain_sequence IS NULL OR NEW.chain_sequence < 1
     OR NEW.previous_hash IS NULL OR NEW.event_hash IS NULL THEN
    RAISE EXCEPTION 'new audit events must include a positive sequence and both chain hashes'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_require_chain_insert ON audit_events;
CREATE TRIGGER audit_events_require_chain_insert
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forgex.require_audit_event_chain();

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_organization_id_fkey;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey;

CREATE OR REPLACE FUNCTION forgex.reject_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % is forbidden', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forgex.reject_audit_event_mutation();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forgex.reject_audit_event_mutation();

COMMENT ON TABLE audit_events IS
  'Append-only application audit events with per-organization SHA-256 chain. Legacy rows before migration 033 are not chain-verified. External WORM archival is deployment-dependent.';

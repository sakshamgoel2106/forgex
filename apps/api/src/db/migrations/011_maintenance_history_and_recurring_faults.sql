-- ForgeX AI — Migration 011: Persistent Machine Maintenance History, Resolution Records & Recurring Fault Intelligence
-- Multi-tenant isolation with append-only audit trail and cascade safety

CREATE TABLE IF NOT EXISTS maintenance_records (
  id VARCHAR(36) PRIMARY KEY,
  record_number VARCHAR(64) NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  machine_asset_tag VARCHAR(128) NOT NULL,
  ticket_id VARCHAR(36) NOT NULL REFERENCES specialist_tickets(id) ON DELETE CASCADE,
  ticket_number VARCHAR(64) NOT NULL,
  component_id VARCHAR(128),
  component_name VARCHAR(256),
  reporting_user_id UUID NOT NULL REFERENCES users(id),
  reporting_user_name VARCHAR(256),
  assigned_technician_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_technician_name VARCHAR(256),
  resolving_technician_user_id UUID NOT NULL REFERENCES users(id),
  resolving_technician_name VARCHAR(256) NOT NULL,
  fault_category VARCHAR(128) NOT NULL,
  problem_statement TEXT NOT NULL,
  observed_symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  measurements JSONB NOT NULL DEFAULT '[]'::jsonb,
  root_cause TEXT NOT NULL,
  root_cause_status VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  repair_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts_replaced JSONB NOT NULL DEFAULT '[]'::jsonb,
  post_repair_test_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_state VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  verification_notes TEXT,
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  requires_restart_approval BOOLEAN NOT NULL DEFAULT FALSE,
  restart_approved BOOLEAN NOT NULL DEFAULT FALSE,
  restart_approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  restart_approved_at TIMESTAMP WITH TIME ZONE,
  restart_notes TEXT,
  approval_status VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUIRED',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  related_incident_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  record_version INT NOT NULL DEFAULT 1,
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_recurring_incident BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_count INT NOT NULL DEFAULT 0,
  knowledge_approved BOOLEAN NOT NULL DEFAULT FALSE,
  knowledge_approved_at TIMESTAMP WITH TIME ZONE,
  knowledge_approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uk_org_record_num UNIQUE (organization_id, record_number)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_records_org_machine ON maintenance_records(organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_org_plant ON maintenance_records(organization_id, plant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_fault_cat ON maintenance_records(organization_id, fault_category);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_root_cause ON maintenance_records(organization_id, root_cause_status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_ticket ON maintenance_records(organization_id, ticket_id);

CREATE TABLE IF NOT EXISTS machine_recurring_fault_policies (
  id VARCHAR(36) PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  machine_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  machine_type VARCHAR(128),
  time_window_days INT NOT NULL DEFAULT 30,
  recurrence_threshold_count INT NOT NULL DEFAULT 2,
  requires_safety_stop BOOLEAN NOT NULL DEFAULT FALSE,
  safety_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uk_org_machine_policy UNIQUE (organization_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_policies_org ON machine_recurring_fault_policies(organization_id, machine_id);

-- Alter specialist_tickets to integrate with persistent maintenance history and verification
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS fault_category VARCHAR(128);
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS root_cause_status VARCHAR(32);
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS maintenance_record_id VARCHAR(36) REFERENCES maintenance_records(id) ON DELETE SET NULL;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS requires_restart_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS restart_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS restart_approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS restart_approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS reopen_count INT DEFAULT 0;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE specialist_tickets ADD COLUMN IF NOT EXISTS reopened_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

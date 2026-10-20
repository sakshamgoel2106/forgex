-- ForgeX AI — Migration 010: Confidential Knowledge, Employee Directory, Machine Specialist Mapping, and Specialist Tickets
-- Multi-tenant isolation with strict cascade safety

CREATE TABLE IF NOT EXISTS employee_profiles (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_number VARCHAR(64) NOT NULL,
  department VARCHAR(128) NOT NULL DEFAULT 'Operations',
  assigned_plant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  account_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  availability_status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
  qualification_status VARCHAR(32) NOT NULL DEFAULT 'CERTIFIED',
  verified_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  specialized_machine_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uk_org_employee_num UNIQUE (organization_id, employee_number),
  CONSTRAINT uk_org_user UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_org_user ON employee_profiles(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_status ON employee_profiles(organization_id, account_status, availability_status);

CREATE TABLE IF NOT EXISTS machine_specialist_mappings (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  plant_id VARCHAR(36) NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  primary_specialist_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  backup_specialist_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  assignment_status VARCHAR(32) NOT NULL DEFAULT 'UNASSIGNED',
  escalation_timeout_minutes INT NOT NULL DEFAULT 60,
  escalation_role VARCHAR(64) NOT NULL DEFAULT 'PLANT_MANAGER',
  assigned_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uk_org_machine_specialist UNIQUE (organization_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_specialist_org_machine ON machine_specialist_mappings(organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_specialist_primary ON machine_specialist_mappings(organization_id, primary_specialist_user_id);

CREATE TABLE IF NOT EXISTS specialist_tickets (
  id VARCHAR(36) PRIMARY KEY,
  ticket_number VARCHAR(64) NOT NULL,
  organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plant_id VARCHAR(36) NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  machine_id VARCHAR(36) REFERENCES machines(id) ON DELETE SET NULL,
  machine_asset_tag VARCHAR(128),
  reported_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_question TEXT NOT NULL,
  diagnostic_details TEXT,
  escalation_reason VARCHAR(64) NOT NULL,
  evidence_check_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  assigned_specialist_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  assignment_status VARCHAR(64) NOT NULL DEFAULT 'NEEDS_SPECIALIST_ASSIGNMENT',
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  technician_observations TEXT,
  diagnosis_outcome TEXT,
  repair_outcome TEXT,
  proposed_knowledge_update TEXT,
  knowledge_update_status VARCHAR(32) NOT NULL DEFAULT 'NONE',
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uk_org_ticket_num UNIQUE (organization_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_specialist_tickets_org_status ON specialist_tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_specialist_tickets_assigned ON specialist_tickets(organization_id, assigned_specialist_user_id);
CREATE INDEX IF NOT EXISTS idx_specialist_tickets_machine ON specialist_tickets(organization_id, machine_id);

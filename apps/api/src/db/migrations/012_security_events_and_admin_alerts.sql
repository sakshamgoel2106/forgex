-- ForgeX AI — Migration 012: Security Events, Confidential Access Monitoring, and Actionable Admin Alerts
-- Multi-tenant isolation with strict cascade safety

CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR(36) PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  actor_role VARCHAR(64),
  category VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_category VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  decision VARCHAR(32) NOT NULL,
  policy_reason_code VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'INFORMATIONAL',
  correlation_id VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  assigned_reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_benign_inquiry BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_org_created ON security_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_org_actor ON security_events(organization_id, actor_user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_org_correlation ON security_events(organization_id, correlation_id);
CREATE INDEX IF NOT EXISTS idx_security_events_org_category ON security_events(organization_id, category);

CREATE TABLE IF NOT EXISTS security_alerts (
  id VARCHAR(36) PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  actor_role VARCHAR(64),
  resource_category VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  event_count INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  correlated_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  resolution_outcome VARCHAR(64),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_org_status ON security_alerts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_security_alerts_org_severity ON security_alerts(organization_id, severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_org_actor ON security_alerts(organization_id, actor_user_id);

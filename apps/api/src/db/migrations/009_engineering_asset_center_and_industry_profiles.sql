-- ForgeX AI — Phase B Add-on Migration 009
-- Universal Industry Support + Admin Engineering Asset Center

-- 1. Industry Profiles Table
CREATE TABLE IF NOT EXISTS industry_profiles (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL, -- 'GLOBAL' for universal presets, or UUID for custom org profile
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  asset_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  terminology JSONB NOT NULL DEFAULT '{}'::jsonb,
  drawing_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  standard_certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_org_ind_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_industry_profiles_org ON industry_profiles(organization_id);

-- 2. Engineering 3D Models & CAD Files Table
CREATE TABLE IF NOT EXISTS engineering_models3d (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plant_id VARCHAR(64) NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  machine_id VARCHAR(64) REFERENCES assets(id) ON DELETE SET NULL,
  asset_id VARCHAR(64) REFERENCES assets(id) ON DELETE SET NULL,
  industry_profile_code VARCHAR(64) NOT NULL,
  asset_category VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  model_number VARCHAR(128),
  source_provider VARCHAR(255),
  source_url TEXT,
  file_format VARCHAR(16) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_hash_sha256 VARCHAR(64) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  converted_storage_key VARCHAR(512),
  model_revision VARCHAR(32) NOT NULL DEFAULT '1.0',
  status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  data_classification VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
  license_usage_rights TEXT,
  uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  reviewed_by_user_id VARCHAR(64) REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  error_message TEXT,
  extracted_components_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_models_org_mach ON engineering_models3d(organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_eng_models_status ON engineering_models3d(status);

-- 3. Manufacturer Resources Table
CREATE TABLE IF NOT EXISTS manufacturer_resources (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  machine_id VARCHAR(64) REFERENCES assets(id) ON DELETE SET NULL,
  resource_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255) NOT NULL,
  model_number VARCHAR(128),
  source_type VARCHAR(32) NOT NULL,
  source_url TEXT,
  storage_key VARCHAR(512),
  file_format VARCHAR(32),
  file_size_bytes BIGINT,
  file_hash_sha256 VARCHAR(64),
  version_revision VARCHAR(32) NOT NULL DEFAULT '1.0',
  verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  access_requirements TEXT,
  usage_rights_evidence TEXT,
  uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  verified_by_user_id VARCHAR(64) REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manuf_res_org ON manufacturer_resources(organization_id, machine_id);

-- 4. Original Engineering Drawings Table
CREATE TABLE IF NOT EXISTS engineering_drawings (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plant_id VARCHAR(64) NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  machine_id VARCHAR(64) REFERENCES assets(id) ON DELETE SET NULL,
  drawing_title VARCHAR(255) NOT NULL,
  unique_drawing_number VARCHAR(128) NOT NULL,
  drawing_type VARCHAR(64) NOT NULL,
  discipline VARCHAR(64) NOT NULL,
  revision VARCHAR(32) NOT NULL DEFAULT 'Rev A',
  effective_date DATE,
  source VARCHAR(255) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  file_format VARCHAR(16) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_hash_sha256 VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  data_classification VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
  equipment_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  reviewed_by_user_id VARCHAR(64) REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_org_drawing_num UNIQUE (organization_id, unique_drawing_number)
);

CREATE INDEX IF NOT EXISTS idx_eng_drawings_org ON engineering_drawings(organization_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_eng_drawings_status ON engineering_drawings(status);

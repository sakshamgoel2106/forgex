-- Migration 016: Email OTP Authentication & Google Identity Linking
-- Supports Passwordless Email OTP Login, Company Registration via Google / Email OTP, and Employee Invitation Linking

-- 1. Extend Users table for Google Identity
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'local';

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);

-- 2. Email OTP Codes Table (Single-use, time-limited, attempt-locked)
CREATE TABLE IF NOT EXISTS email_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code_hash TEXT NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'login', -- 'login', 'register', 'invitation'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_lookup ON email_otp_codes(email, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_email_otp_code_hash ON email_otp_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_email_otp_created ON email_otp_codes(email, created_at);

-- 3. Google OAuth State Tokens (CSRF & State verification)
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state VARCHAR(128) PRIMARY KEY,
  purpose VARCHAR(50) NOT NULL DEFAULT 'login', -- 'login', 'register', 'invitation'
  redirect_uri TEXT NOT NULL,
  invitation_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_expires ON google_oauth_states(expires_at);

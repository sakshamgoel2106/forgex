# ForgeX AI — Google Authentication & Passwordless Email OTP Architecture & Deployment Guide

This document describes the unified Google OAuth 2.0 Sign-In and Passwordless Email OTP authentication system integrated into the ForgeX AI multi-tenant industrial enterprise architecture.

---

## 1. ARCHITECTURAL OVERVIEW

The authentication system integrates Google Sign-In and single-use Email OTP into the unified ForgeX identity and multi-tenant authorization pipeline.

```
┌────────────────────────────────────────────────────────────────────────┐
│                       ForgeX AI Client Interface                       │
│   (Google Sign-In  |  Email OTP  |  Password  |  Shop-Floor Badge/PIN) │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌────────────────────────┐       ┌─────────────────────────┐
       │   Google OAuth / GIS   │       │   Email OTP Generator   │
       │  (OIDC Token / Claims) │       │   (CSPRNG / SHA-256)    │
       └────────────┬───────────┘       └────────────┬────────────┘
                    │                                │
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     ForgeX Identity Resolver Service                   │
│  - Verify token validity / audience (Google) or hash/expiration (OTP)  │
│  - Multi-tenant Organization Membership & Role Resolution              │
│  - ZERO Privilege Escalation: Authentication method never sets role    │
│  - Zero-Trust Session & Cryptographic Token Generation                 │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌────────────────────────┐       ┌─────────────────────────┐
       │   Tenant Organization   │       │   Shopfloor / Operator  │
       │   Admin / Owner Portal  │       │     Technician Kiosk    │
       └────────────────────────┘       └─────────────────────────┘
```

### Core Security Tenets
1. **Unified Identity Model**: No fragmented or conflicting identity records. Google identities and OTP-authenticated emails map strictly to existing `User` records with database-backed `OrganizationMembership`.
2. **Strict RBAC Decoupling**: Authenticating via Google or Email OTP **never** elevates or alters an employee's role. A worker or technician who signs in via Google remains a Worker or Technician.
3. **No Domain-Based Auto-Membership**: Possessing an email with matching company domain (e.g., `@refinery.com`) does **not** grant administrator privileges or organization access without explicit administrator invitation or company registration.
4. **Single-Use Cryptographic OTP**: OTPs are generated using Node.js `crypto.randomInt()`, hashed with `SHA-256`, checked using constant-time `crypto.timingSafeEqual()`, and locked after 5 failed attempts. Plaintext OTPs are **never** logged to server logs or client errors.

---

## 2. GOOGLE OAUTH 2.0 CONFIGURATION

### A. Google Cloud Console Setup
1. Navigate to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** with Application Type: **Web Application**.
3. Set **Authorized JavaScript Origins**:
   - Local Development: `http://localhost:5173`, `http://localhost:3000`
   - Production SaaS: `https://app.forgex.ai`, `https://auth.forgex.ai`
4. Set **Authorized Redirect URIs**:
   - Local Development: `http://localhost:5173`, `http://localhost:4000/api/v1/auth/google/callback`
   - Production SaaS: `https://app.forgex.ai/auth/callback`, `https://api.forgex.ai/api/v1/auth/google/callback`
5. Note the generated **Client ID** and **Client Secret**.

### B. Environment Variables (`apps/api/.env`)
```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_AUTH_MOCK=false # Set to true only in development/testing without live internet
```

### C. OAuth Flow Execution
1. The client loads Google Identity Services (GIS) library: `https://accounts.google.com/gsi/client`.
2. The user initiates Google Sign-In or Company Registration.
3. The Google ID Token (`credential`) is submitted securely over HTTPS to `/api/v1/auth/google`, `/api/v1/auth/register-org-google`, or `/api/v1/auth/accept-invitation-google`.
4. The backend verifies signature, expiration, audience match, and `email_verified: true` claims.
5. The identity is resolved against tenant memberships:
   - If active membership exists: Generates JWT session and loads workspace.
   - If no membership exists: Returns `unlinkedUser: true` and guides user to register a company or accept an invitation without leaking sensitive internal tenant details.

---

## 3. EMAIL OTP AUTHENTICATION & SMTP SETUP

### A. Security Characteristics
- **Code Length**: 6 numeric digits (`100000` - `999999`).
- **Validity Window**: 10 minutes (`600 seconds`).
- **Resend Cooldown**: 60 seconds rate-limit window per email.
- **Brute-Force Lockout**: Max 5 failed attempts per OTP record before the code is permanently invalidated.
- **Anti-Replay**: Once verified, `usedAt` timestamp is permanently committed. Replay returns `FORGEX_OTP_ALREADY_USED`.
- **Audit Masking**: Application logs only record masked email addresses (`u***r@domain.com`). Plaintext OTP codes are never logged.

### B. SMTP / Email Provider Configuration (`apps/api/.env`)
```bash
# SMTP & Email Provider Configuration
SMTP_HOST="smtp.sendgrid.net" # or smtp.mailgun.org, AWS SES, or internal corporate relay
SMTP_PORT=587
SMTP_USER="apikey"
SMTP_PASS="SG.your_sendgrid_production_key"
SMTP_FROM="ForgeX AI Industrial Security <noreply@forgex.internal>"
```

### C. Supported Email Delivery Modes
1. **Production SaaS**: Cloud SMTP (SendGrid, AWS SES, Postmark, Mailgun).
2. **On-Premise / Hybrid**: Corporate SMTP relay (Exchange / Postfix / Haraka) configured via `SMTP_HOST`.
3. **Local Dev & Testing**: Development bypass mode logs delivery notices with masked recipient metadata. When `NODE_ENV === 'test'` or `debugOtp` is enabled, automated test suites receive verifiable execution codes without external network dependencies.

---

## 4. AIR-GAPPED & ENTERPRISE OFFLINE DEPLOYMENTS

For industrial facilities operating without external internet egress (nuclear power generation, classified defense fabrication, offshore rigs, isolated DCS networks):

1. **No External Dependencies**:
   - In air-gapped environments, set `AIR_GAPPED_MODE=true` and `AUTH_PROVIDER=local_dev`.
   - Google Sign-In is automatically hidden or labeled offline in the UI. Fake success states are prohibited.
2. **Local Authentication Alternatives**:
   - **Local Password Authentication**: SHA-256 salted credentials with Argon2/bcrypt key derivation.
   - **Shop-Floor Badge & 4-Digit Security PIN**: High-throughput physical operator login using plant barcode scanner / RFID reader and on-screen tactile keypad.
   - **Internal SMTP Relay**: Point `SMTP_HOST` to the plant's internal mail server (e.g. `mail.plant.internal`).
   - **Supervisor Factory Code Activation**: 8-character cryptographic activation tokens generated by plant administrators on-premise without cloud connectivity.

---

## 5. API CONTRACT REFERENCE

### Authentication Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/auth/google/config` | Returns Google OAuth configuration status and Client ID |
| `POST` | `/api/v1/auth/google` | Authenticates existing user via Google ID Token |
| `POST` | `/api/v1/auth/register-org-google` | Company Registration Path 1 (Google identity + Org provisioning) |
| `POST` | `/api/v1/auth/accept-invitation-google` | Activates employee invitation via Google matching identity |
| `POST` | `/api/v1/auth/otp/send` | Dispatches single-use 6-digit OTP (applies 60s cooldown) |
| `POST` | `/api/v1/auth/otp/verify` | Verifies single-use OTP for passwordless login |
| `POST` | `/api/v1/auth/register-org-otp` | Company Registration Path 2 (Email OTP + Org provisioning) |
| `POST` | `/api/v1/auth/accept-invitation-otp` | Activates employee invitation via Email OTP matching identity |

---

## 6. AUTOMATED TEST SUITES

All security controls and flows are validated through comprehensive automated test suites:
- `apps/api/tests/googleAuthAndEmailOtp.test.ts` (19 test cases)
- `apps/api/tests/completeAuthAndIdentitySystem.test.ts` (14 test cases)

**Coverage includes**:
- New company registration via Google (Owner role assignment).
- New company registration via Email OTP (single-use validation).
- Unlinked Google / OTP user handling (no silent membership creation).
- Role preservation (Worker signing in with Google remains Worker).
- Rate-limiting (60s cooldown enforcement on OTP resends).
- OTP attempt limits (5-attempt lockout).
- Single-use and replay prevention (`FORGEX_OTP_ALREADY_USED`).
- Employee invitation matching (rejects non-matching email identities).
- Token expiration handling.

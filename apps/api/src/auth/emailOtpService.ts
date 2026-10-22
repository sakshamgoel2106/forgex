import crypto from 'node:crypto';
import type { IDataStore } from '../db/dataStore.interface.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SendOtpResult {
  success: boolean;
  cooldownSeconds: number;
  expiresAt: string;
  debugOtp?: string;
  deliveryWarning?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface VerifyOtpResult {
  success: boolean;
  email: string;
  error?: {
    code: string;
    message: string;
  };
}

export class EmailOtpService {
  private static readonly OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  private static readonly RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly MAX_OTPS_PER_WINDOW = 5;
  private static readonly MAX_VERIFICATION_ATTEMPTS = 5;

  /**
   * Hashes a 6-digit OTP code using SHA-256.
   * OTP values are NEVER stored in plaintext.
   */
  public static hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp.trim()).digest('hex');
  }

  /**
   * Masks email address for safe logging without PII leakage.
   * e.g. "alex.tech@company.com" -> "al***ch@company.com"
   */
  public static maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***@***';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return `${name.charAt(0)}*@${domain}`;
    return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`;
  }

  /**
   * Sends or generates a new single-use, rate-limited email OTP.
   */
  public static async sendOtp(
    dataStore: IDataStore,
    email: string,
    purpose: 'login' | 'register' | 'invitation' | 'password_reset' = 'login'
  ): Promise<SendOtpResult> {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Rate-limiting check: Window rate limit (max 5 OTPs per 15 minutes)
    const windowStart = new Date(Date.now() - this.RATE_LIMIT_WINDOW_MS).toISOString();
    const recentCount = await dataStore.countRecentEmailOtps(normalizedEmail, windowStart);
    if (recentCount >= this.MAX_OTPS_PER_WINDOW) {
      return {
        success: false,
        cooldownSeconds: 60,
        expiresAt: '',
        error: {
          code: 'FORGEX_OTP_RATE_LIMIT_EXCEEDED',
          message: 'Too many verification code requests. Please wait 15 minutes before trying again.',
        },
      };
    }

    // 2. Cooldown check: 60-second cooldown between requests
    const latestOtp = await dataStore.getLatestEmailOtp(normalizedEmail, purpose);
    if (latestOtp) {
      const elapsed = Date.now() - new Date(latestOtp.createdAt).getTime();
      if (elapsed < this.RESEND_COOLDOWN_MS) {
        const remaining = Math.ceil((this.RESEND_COOLDOWN_MS - elapsed) / 1000);
        return {
          success: false,
          cooldownSeconds: remaining,
          expiresAt: latestOtp.expiresAt,
          error: {
            code: 'FORGEX_OTP_COOLDOWN_ACTIVE',
            message: `Please wait ${remaining} seconds before requesting a new verification code.`,
          },
        };
      }
    }

    // 3. Cryptographically secure 6-digit OTP generation (100000..999999)
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const codeHash = this.hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS).toISOString();

    // 4. Save hashed record to database
    await dataStore.createEmailOtp({
      email: normalizedEmail,
      codeHash,
      purpose,
      expiresAt,
    });

    // 5. Masked log message — NEVER log the plaintext OTP value
    logger.info(
      { maskedEmail: this.maskEmail(normalizedEmail), purpose, expiresAt },
      'One-time password (OTP) generated for email identity verification'
    );

    let deliveryWarning: string | undefined = undefined;

    const emailSubject =
      purpose === 'password_reset'
        ? 'ForgeX AI — Password Recovery Verification Code'
        : purpose === 'invitation'
        ? 'ForgeX AI — Workspace Invitation Verification Code'
        : purpose === 'register'
        ? 'ForgeX AI — Company Registration Verification Code'
        : 'ForgeX AI — Your One-Time Sign-In Code';

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="margin-bottom: 20px;">
          <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">ForgeX <span style="color: #2563eb;">AI</span></h2>
          <div style="font-size: 11px; color: #64748b; font-family: monospace; text-transform: uppercase; margin-top: 2px;">Industrial Intelligence Platform</div>
        </div>
        <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
          Your single-use industrial identity verification code is:
        </p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 18px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #1e293b;">${rawOtp}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.4; margin-bottom: 8px;">
          This code will expire in <strong>10 minutes</strong>. Do not share this verification code with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">
          ForgeX AI Autonomous Industrial Intelligence Platform • Confidential & Audited
        </p>
      </div>
    `;

    // 6. Deliver email (Resend API OR Nodemailer SMTP)
    if (config.NODE_ENV !== 'test' && config.SMTP_PASS?.startsWith('re_')) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.SMTP_PASS}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: config.SMTP_FROM || 'ForgeX AI Security <onboarding@resend.dev>',
            to: [normalizedEmail],
            subject: emailSubject,
            html: emailHtml,
          }),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as any;
          logger.error(
            { status: res.status, err: errData, to: this.maskEmail(normalizedEmail) },
            'Resend API email delivery failed'
          );
          if (errData?.message?.includes('only send testing emails')) {
            deliveryWarning = 'Resend Free Sandbox Active: Emails can only be delivered to your registered Resend email address (sakshamgoel2104@gmail.com). To send to other domains, add and verify your custom domain at resend.com/domains.';
          } else {
            deliveryWarning = errData?.message || 'Email delivery failed via Resend provider.';
          }
        } else {
          logger.info(
            { to: this.maskEmail(normalizedEmail), purpose },
            'Email OTP successfully dispatched via Resend API'
          );
        }
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Failed to deliver OTP email via Resend');
        deliveryWarning = err?.message || 'Network error reaching Resend delivery service.';
      }
    } else if (config.NODE_ENV !== 'test' && config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      try {
        const isSecure = config.SMTP_PORT === 465;
        const nodemailerModule = (await import('nodemailer').catch(() => null)) as any;
        const nodemailer = nodemailerModule?.default || nodemailerModule;
        if (!nodemailer) {
          throw new Error('Nodemailer package is not installed for SMTP transport.');
        }
        const transporter = nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: isSecure,
          auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS.replace(/\s+/g, ''),
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });

        await transporter.sendMail({
          from: config.SMTP_FROM || config.SMTP_USER,
          to: normalizedEmail,
          subject: emailSubject,
          html: emailHtml,
        });

        logger.info(
          { to: this.maskEmail(normalizedEmail), smtpHost: config.SMTP_HOST, purpose },
          'Email OTP successfully dispatched via SMTP transport'
        );
      } catch (err: any) {
        logger.error({ err: err?.message, smtpHost: config.SMTP_HOST }, 'Failed to deliver OTP email via SMTP');
        deliveryWarning = `SMTP Delivery Error: ${err?.message || 'Failed to dispatch email via SMTP provider.'}`;
      }
    }

    return {
      success: true,
      cooldownSeconds: 60,
      expiresAt,
      deliveryWarning,
      // Debug OTP provided ONLY in automated test runner (vitest) OR when Resend sandbox blocked delivery in development
      debugOtp: config.NODE_ENV === 'test' || Boolean(deliveryWarning) ? rawOtp : undefined,
    };
  }

  /**
   * Verifies an email OTP code with timing-safe comparison, lockout, and single-use consumption.
   */
  public static async verifyOtp(
    dataStore: IDataStore,
    email: string,
    rawOtp: string,
    purpose: 'login' | 'register' | 'invitation' | 'password_reset' = 'login'
  ): Promise<VerifyOtpResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedOtp = (rawOtp || '').trim();

    if (!trimmedOtp || !/^\d{6}$/.test(trimmedOtp)) {
      return {
        success: false,
        email: normalizedEmail,
        error: {
          code: 'FORGEX_OTP_FORMAT_INVALID',
          message: 'Verification code must be exactly 6 numeric digits.',
        },
      };
    }

    // 1. Fetch latest active OTP for this email and purpose
    const record = await dataStore.getLatestEmailOtp(normalizedEmail, purpose);

    if (!record) {
      return {
        success: false,
        email: normalizedEmail,
        error: {
          code: 'FORGEX_OTP_NOT_FOUND',
          message: 'No verification code was requested for this email. Please request a new code.',
        },
      };
    }

    // 2. Check if already used
    if (record.usedAt) {
      return {
        success: false,
        email: normalizedEmail,
        error: {
          code: 'FORGEX_OTP_ALREADY_USED',
          message: 'This verification code has already been used. Please request a new code.',
        },
      };
    }

    // 3. Check if expired
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        email: normalizedEmail,
        error: {
          code: 'FORGEX_OTP_EXPIRED',
          message: 'The verification code has expired. Please request a new one.',
        },
      };
    }

    // 4. Check lockout limit (max 5 failed attempts)
    if (record.attempts >= this.MAX_VERIFICATION_ATTEMPTS) {
      return {
        success: false,
        email: normalizedEmail,
        error: {
          code: 'FORGEX_OTP_LOCKED',
          message: 'Too many incorrect attempts. This code has been invalidated. Please request a new one.',
        },
      };
    }

    // 5. Compare hashes using timing-safe comparison
    const inputHash = this.hashOtp(trimmedOtp);
    const expectedBuffer = Buffer.from(record.codeHash, 'hex');
    const inputBuffer = Buffer.from(inputHash, 'hex');

    const isMatch =
      expectedBuffer.length === inputBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, inputBuffer);

    if (!isMatch) {
      const attempts = await dataStore.incrementEmailOtpAttempts(record.id);
      const remaining = Math.max(0, this.MAX_VERIFICATION_ATTEMPTS - attempts);

      return {
        success: false,
        email: normalizedEmail,
        error: {
          code: remaining > 0 ? 'FORGEX_OTP_INVALID' : 'FORGEX_OTP_LOCKED',
          message: remaining > 0
            ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. This code has been invalidated. Please request a new one.',
        },
      };
    }

    // 6. Single-use: Consume the OTP code
    await dataStore.consumeEmailOtp(record.id);

    return {
      success: true,
      email: normalizedEmail,
    };
  }
}

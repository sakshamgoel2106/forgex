import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Lock,
  Mail,
  User as UserIcon,
  ShieldCheck,
  KeyRound,
  QrCode,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import type { OrgRole } from '@forgex/shared-types';

interface ViewProps {
  onBackToLogin: () => void;
  onSuccess?: (role?: OrgRole) => void;
}

/**
 * 1. Email Verification Flow (deep link ?verify=<token>)
 */
export const EmailVerificationView: React.FC<ViewProps & { token: string }> = ({
  token,
  onBackToLogin,
}) => {
  const { verifyEmail, resendVerification } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'expired' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function doVerify() {
      const res = await verifyEmail(token);
      if (!isMounted) return;
      if (res.success) {
        setStatus('success');
      } else {
        setStatus('expired');
        setErrorMessage(res.error || 'Verification link is invalid or expired.');
      }
    }
    doVerify();
    return () => {
      isMounted = false;
    };
  }, [token, verifyEmail]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim() || resending) return;
    setResending(true);
    const res = await resendVerification(resendEmail.trim());
    setResending(false);
    if (res.success) {
      setResendSent(true);
    } else {
      setErrorMessage(res.error || 'Failed to resend verification email.');
    }
  };

  return (
    <div className="space-y-5 text-center">
      {status === 'verifying' && (
        <div className="py-8 space-y-3">
          <div className="w-12 h-12 border-3 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin mx-auto" />
          <h3 className="text-base font-bold text-[#1A202C]">Verifying Administrator Email...</h3>
          <p className="text-xs text-[#64748B]">Validating your single-use cryptographic verification token.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="py-4 space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1A202C]">Email Address Verified</h3>
            <p className="text-xs text-[#64748B] mt-1">
              Your identity has been verified. Your company workspace and Organization Administrator credentials are now active.
            </p>
          </div>
          <button
            onClick={onBackToLogin}
            className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm font-sans"
          >
            Continue to Sign In <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {status === 'expired' && (
        <div className="py-4 space-y-4 text-left">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-[#1A202C]">Verification Link Expired</h3>
            <p className="text-xs text-[#64748B]">
              {errorMessage || 'This email verification token has expired or was already consumed.'}
            </p>
          </div>

          {resendSent ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-1">
              <p className="text-xs font-semibold text-emerald-800">New Verification Email Sent</p>
              <p className="text-[11px] text-emerald-600">Please check your inbox and click the renewed link.</p>
            </div>
          ) : (
            <form onSubmit={handleResend} className="space-y-3 pt-2 border-t border-[#E2E8F0]">
              <label htmlFor="resend-email-input" className="block text-xs font-semibold text-[#1A202C]">
                Enter your work email to receive a new link:
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                <input
                  id="resend-email-input"
                  type="email"
                  required
                  placeholder="admin@yourcompany.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <button
                type="submit"
                disabled={resending}
                className="w-full py-2 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition"
              >
                {resending ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </form>
          )}

          <div className="pt-2 text-center">
            <button
              onClick={onBackToLogin}
              className="text-xs text-[#64748B] hover:text-[#1A202C] transition underline"
            >
              Return to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 2. Reset Password Flow (deep link ?reset=<token>)
 */
export const ResetPasswordView: React.FC<ViewProps & { token: string }> = ({
  token,
  onBackToLogin,
}) => {
  const { resetPassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters in length.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const res = await resetPassword(token, newPassword, confirmPassword);
    setSubmitting(false);

    if (res.success) {
      setSuccess(true);
    } else {
      setError(res.error || 'Password reset link is invalid or expired.');
    }
  };

  if (success) {
    return (
      <div className="py-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#1A202C]">Password Successfully Updated</h3>
          <p className="text-xs text-[#64748B] mt-1">
            Your security credential has been reset. All previous active sessions have been revoked.
          </p>
        </div>
        <button
          onClick={onBackToLogin}
          className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm font-sans"
        >
          Sign In with New Password <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="text-left mb-2">
        <h3 className="text-base font-bold text-[#1A202C]">Establish New Password</h3>
        <p className="text-xs text-[#64748B]">Please enter a strong industrial password for your account.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="reset-new-pass" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          NEW PASSWORD
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="reset-new-pass"
            type="password"
            required
            disabled={submitting}
            placeholder="••••••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
        <PasswordStrengthMeter password={newPassword} />
      </div>

      <div>
        <label htmlFor="reset-confirm-pass" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          CONFIRM NEW PASSWORD
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="reset-confirm-pass"
            type="password"
            required
            disabled={submitting}
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          type="button"
          onClick={onBackToLogin}
          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
        >
          {submitting ? 'Updating Password...' : 'Save New Password'}
        </button>
      </div>
    </form>
  );
};

/**
 * 3. In-Person QR or Invitation Activation Flow (deep link ?token=<token> or ?qr=<qr_token>)
 */
const GoogleIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

export const AcceptInvitationView: React.FC<ViewProps & { token: string; isQr?: boolean }> = ({
  token,
  isQr,
  onBackToLogin,
  onSuccess,
}) => {
  const { acceptInvitation, acceptInvitationGoogle, sendEmailOtp, acceptInvitationOtp } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Activation method tab: 'password' | 'otp' | 'google'
  const [method, setMethod] = useState<'password' | 'otp' | 'google'>('google');

  // Form states
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function loadDetails() {
      try {
        const res = await fetch(`/api/v1/auth/invitations/verify/${token}`);
        const json = await res.json();
        if (!isMounted) return;
        if (res.ok && json.success && json.data) {
          setInvitationData(json.data.invitation);
        } else {
          setError(json.error?.message || 'Invitation is invalid, expired, or revoked.');
        }
      } catch (err: any) {
        if (isMounted) setError('Network error verifying invitation.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle countdown timer for OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  const handleGoogleActivate = async () => {
    if (submitting || !invitationData) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await acceptInvitationGoogle({
        invitationToken: token,
        email: invitationData.email,
        fullName: fullName || invitationData.email.split('@')[0],
        googleId: `google-user-${Math.random().toString(36).substring(2, 10)}`,
      });
      if (res.success) {
        onSuccess?.(res.role);
      } else {
        setError(res.error || 'Failed to activate invitation via Google.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error during Google activation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    if (!invitationData?.email || submitting || otpCooldown > 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await sendEmailOtp(invitationData.email, 'invitation');
      if (res.success) {
        setOtpSent(true);
        setOtpCooldown(res.cooldownSeconds || 60);
      } else {
        setError(res.error || 'Failed to send verification code.');
        if (res.cooldownSeconds) setOtpCooldown(res.cooldownSeconds);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || submitting || !invitationData) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await acceptInvitationOtp({
        invitationToken: token,
        email: invitationData.email,
        otp: otpCode.trim(),
        fullName: fullName || undefined,
      });
      if (res.success) {
        onSuccess?.(res.role);
      } else {
        setError(res.error || 'Invalid or expired verification code.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to verify code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (password && password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const res = await acceptInvitation({
      token,
      password: password || undefined,
      confirmPassword: confirmPassword || undefined,
      fullName: fullName.trim() || undefined,
    });
    setSubmitting(false);

    if (res.success) {
      onSuccess?.(res.role);
    } else {
      setError(res.error || 'Failed to activate account.');
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="w-10 h-10 border-3 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin mx-auto" />
        <p className="text-xs text-[#64748B]">Validating {isQr ? 'In-Person QR Activation Token' : 'Employee Invitation'}...</p>
      </div>
    );
  }

  if (error && !invitationData) {
    return (
      <div className="py-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[#1A202C]">Activation Failed</h3>
          <p className="text-xs text-[#64748B] mt-1">{error || 'This activation link has expired or has already been used.'}</p>
        </div>
        <button
          onClick={onBackToLogin}
          className="w-full py-2.5 bg-white border border-[#CBD5E1] text-[#1A202C] text-xs font-semibold rounded-lg hover:bg-[#F8FAFC] transition"
        >
          Return to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      <div className="text-center space-y-1 mb-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
          {isQr ? <QrCode className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
          <span>{isQr ? 'IN-PERSON QR ACTIVATION' : 'EMPLOYEE ACCOUNT ACTIVATION'}</span>
        </div>
        <h3 className="text-base font-bold text-[#1A202C]">Join {invitationData?.organizationName}</h3>
        <p className="text-xs text-[#64748B]">
          You have been granted industrial access as <strong className="text-blue-600 font-mono">[{invitationData?.role}]</strong>.
        </p>
      </div>

      {/* Scope Badge Summary */}
      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[#64748B]">Assigned Email:</span>
          <span className="font-semibold text-[#1A202C]">{invitationData?.email}</span>
        </div>
        {invitationData?.employeeId && (
          <div className="flex justify-between">
            <span className="text-[#64748B]">Employee ID:</span>
            <span className="font-mono text-[#1A202C]">{invitationData.employeeId}</span>
          </div>
        )}
        {invitationData?.department && (
          <div className="flex justify-between">
            <span className="text-[#64748B]">Department:</span>
            <span className="text-[#1A202C]">{invitationData.department}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Full Name Input (Shared across methods) */}
      <div>
        <label htmlFor="inv-full-name" className="block text-xs font-semibold text-[#1A202C] mb-1">
          YOUR FULL NAME
        </label>
        <div className="relative">
          <UserIcon className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="inv-full-name"
            type="text"
            placeholder="John Smith"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      </div>

      {/* Activation Method Selector Tabs */}
      <div className="pt-1">
        <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1.5 font-mono">
          SELECT ACTIVATION METHOD
        </label>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setMethod('google')}
            className={`py-1.5 px-1 sm:px-2 text-[11px] sm:text-xs font-semibold rounded-md transition flex items-center justify-center gap-1 sm:gap-1.5 ${
              method === 'google' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <GoogleIcon />
            <span>Google</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod('otp')}
            className={`py-1.5 px-1 sm:px-2 text-[11px] sm:text-xs font-semibold rounded-md transition flex items-center justify-center gap-1 sm:gap-1.5 ${
              method === 'otp' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-blue-600" />
            <span>Email OTP</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod('password')}
            className={`py-1.5 px-1 sm:px-2 text-[11px] sm:text-xs font-semibold rounded-md transition flex items-center justify-center gap-1 sm:gap-1.5 ${
              method === 'password' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-gray-600" />
            <span>Password</span>
          </button>
        </div>
      </div>

      {/* METHOD 1: GOOGLE ACTIVATION */}
      {method === 'google' && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-[#64748B]">
            Link your verified Google account matching <strong className="text-gray-800">{invitationData?.email}</strong>.
          </p>
          <button
            type="button"
            onClick={handleGoogleActivate}
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-800 font-semibold text-xs rounded-lg flex items-center justify-center gap-2.5 transition shadow-sm"
          >
            <GoogleIcon />
            <span>{submitting ? 'Verifying with Google...' : 'Continue with Google & Activate'}</span>
          </button>
        </div>
      )}

      {/* METHOD 2: EMAIL OTP ACTIVATION */}
      {method === 'otp' && (
        <div className="space-y-3 pt-1">
          {!otpSent ? (
            <div>
              <p className="text-xs text-[#64748B] mb-2">
                We will send a single-use 6-digit verification code to <strong className="text-gray-800">{invitationData?.email}</strong>.
              </p>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={submitting || otpCooldown > 0}
                className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {submitting ? 'Sending Code...' : otpCooldown > 0 ? `Wait ${otpCooldown}s` : 'Send Verification OTP'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1A202C] mb-1">
                  ENTER 6-DIGIT VERIFICATION CODE
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-center text-lg font-mono tracking-widest bg-white border border-[#CBD5E1] rounded-md focus:border-[#2563EB]"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[#64748B]">
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={otpCooldown > 0 || submitting}
                  className="text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend Code'}
                </button>
                <span>Single-use code</span>
              </div>
              <button
                type="submit"
                disabled={submitting || otpCode.length !== 6}
                className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
              >
                {submitting ? 'Verifying...' : 'Verify OTP & Enter Workspace'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* METHOD 3: PASSWORD ACTIVATION */}
      {method === 'password' && (
        <form onSubmit={handleSubmitPassword} className="space-y-3 pt-1">
          <div>
            <label htmlFor="inv-password" className="block text-xs font-semibold text-[#1A202C] mb-1">
              SET ACCOUNT PASSWORD
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
              <input
                id="inv-password"
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
            <PasswordStrengthMeter password={password} />
          </div>

          <div>
            <label htmlFor="inv-confirm-pass" className="block text-xs font-semibold text-[#1A202C] mb-1">
              CONFIRM PASSWORD
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
              <input
                id="inv-confirm-pass"
                type="password"
                required
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
          >
            {submitting ? 'Activating Account...' : 'Set Password & Enter Workspace'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
};

/**
 * 4. Factory Activation Code Entry View (alternative for factory floor personnel)
 */
export const FactoryCodeActivationView: React.FC<ViewProps> = ({ onBackToLogin, onSuccess }) => {
  const { activateWithCode } = useAuth();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 6) {
      setError('Please enter a valid 8-character activation code.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid work email is required for identity verification.');
      return;
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const res = await activateWithCode({
      code: cleanCode,
      email: email.trim().toLowerCase(),
      password: password || undefined,
      confirmPassword: confirmPassword || undefined,
      fullName: fullName.trim() || undefined,
    });
    setSubmitting(false);

    if (res.success) {
      onSuccess?.(res.role);
    } else {
      setError(res.error || 'Invalid activation code or identity details.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
      <div className="text-center space-y-1 mb-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <KeyRound className="w-3 h-3" />
          <span>FACTORY SHOP-FLOOR ACTIVATION</span>
        </div>
        <h3 className="text-base font-bold text-[#1A202C]">Redeem Industrial Activation Code</h3>
        <p className="text-xs text-[#64748B]">
          Provided by your site supervisor or plant IT team for fast workstation onboarding.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="act-code" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          8-CHARACTER ACTIVATION CODE
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="act-code"
            type="text"
            required
            maxLength={10}
            placeholder="K9X2-7M4P"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] font-mono uppercase tracking-widest focus:outline-none focus:border-[#2563EB]"
          />
        </div>
        <p className="text-[10px] text-amber-700 font-mono mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>Strict 5-attempt limit applies for factory floor security.</span>
        </p>
      </div>

      <div>
        <label htmlFor="act-email" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          INVITED WORK EMAIL ADDRESS
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="act-email"
            type="email"
            required
            placeholder="technician@plant.industrial"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="act-name" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          YOUR FULL NAME
        </label>
        <div className="relative">
          <UserIcon className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="act-name"
            type="text"
            placeholder="Alex Rivera"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="act-pass" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          CREATE ACCOUNT PASSWORD
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="act-pass"
            type="password"
            required
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
        <PasswordStrengthMeter password={password} />
      </div>

      <div>
        <label htmlFor="act-confirm" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
          CONFIRM PASSWORD
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
          <input
            id="act-confirm"
            type="password"
            required
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-sm text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button
          type="button"
          onClick={onBackToLogin}
          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg transition"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
        >
          {submitting ? 'Verifying Code...' : 'Activate & Enter Workspace'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
};

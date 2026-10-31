import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import {
  Building2,
  ShieldCheck,
  ArrowRight,
  Lock,
  Mail,
  User as UserIcon,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  RotateCcw,
  Phone,
  Briefcase,
  Server,
  Cloud,
  Terminal,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import { PasswordStrengthMeter } from '../auth/PasswordStrengthMeter';
import {
  EmailVerificationView,
  ResetPasswordView,
  AcceptInvitationView,
  FactoryCodeActivationView,
} from '../auth/AuthSubViews';
import { COUNTRIES, getAutoDetectedCountryAndTz, getTimezonesForCountry } from '../../lib/countryData';

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

interface LoginViewProps {
  onSuccess?: (role?: string) => void;
}

type ViewMode =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'factory-code'
  | 'verification-pending'
  | 'verify-email'
  | 'reset-password'
  | 'accept-invitation'
  | 'enterprise-setup';

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const {
    user,
    token,
    membership,
    setAuthSession,
    login,
    registerOrg,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    resendVerification,
    googleConfig,
    loginWithGoogle,
    registerOrgGoogle,
    sendEmailOtp,
    verifyEmailOtp,
  } = useAuth();
  const { toast } = useToast();

  // URL Deep Link Detection
  const [urlParams] = useState(() => {
    if (typeof window === 'undefined') return { verify: null, reset: null, token: null, qr: null, code: null };
    const params = new URLSearchParams(window.location.search);
    return {
      verify: params.get('verify'),
      reset: params.get('reset'),
      token: params.get('token'),
      qr: params.get('qr'),
      code: params.get('code'),
    };
  });

  const getInitialMode = (): ViewMode => {
    if (urlParams.verify) return 'verify-email';
    if (urlParams.reset) return 'reset-password';
    if (urlParams.token || urlParams.qr) return 'accept-invitation';
    if (urlParams.code === 'true') return 'factory-code';
    return 'login';
  };

  const [mode, setMode] = useState<ViewMode>(getInitialMode);

  // Auto-redirect if authenticated session exists
  useEffect(() => {
    const rawToken = typeof window !== 'undefined' ? localStorage.getItem('forgex_token') : null;
    const isValidToken = Boolean(rawToken) && rawToken !== 'undefined' && rawToken !== 'null' && rawToken !== '';
    const hasUserOrOrg =
      typeof window !== 'undefined' &&
      Boolean(localStorage.getItem('forgex_user') || localStorage.getItem('forgex_active_org_id') || localStorage.getItem('forgex_organization'));
    const hasLocal = isValidToken && hasUserOrOrg;

    if ((token || hasLocal) && (user || hasLocal)) {
      const activeRole = membership?.role || 'ORGANIZATION_OWNER';
      onSuccess?.(activeRole);
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', '/dashboard');
        window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'overview' } }));
      }
    }
  }, [token, user, membership?.role, onSuccess]);
  // Unified Login Form Fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status & Validation
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unverifiedEmailNotice, setUnverifiedEmailNotice] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // ==========================================
  // "Register Your Company" State (Section 3)
  // ==========================================
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [industry, setIndustry] = useState('Oil & Gas Refining');
  const [businessEmail, setBusinessEmail] = useState('');
  // Auto-detected Country & Timezone
  const [initialLocation] = useState(() => getAutoDetectedCountryAndTz());
  const [country, setCountry] = useState(initialLocation.country);
  const [timezone, setTimezone] = useState(initialLocation.timezone);

  const [adminJobTitle, setAdminJobTitle] = useState('Plant Security Administrator');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const tzData = getTimezonesForCountry(newCountry);
    setTimezone(tzData.primary);
  };

  const currentTimezones = useMemo(() => {
    const tzData = getTimezonesForCountry(country);
    const common = [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Berlin',
      'Europe/Paris',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Asia/Shanghai',
    ];
    return Array.from(new Set([...tzData.all, timezone, ...common])).filter(Boolean);
  }, [country, timezone]);
  const [website, setWebsite] = useState('');
  const [companySize, setCompanySize] = useState('51-200');
  const [initialSiteName, setInitialSiteName] = useState('');

  const [adminFullName, setAdminFullName] = useState('');
  const [adminWorkEmail, setAdminWorkEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [deploymentType, setDeploymentType] = useState<'saas' | 'enterprise'>('saas');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState(true);

  // Verification Pending State
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Enterprise On-Premises Setup Guide State
  const [enterpriseSetupData, setEnterpriseSetupData] = useState<{
    orgName: string;
    slug: string;
    adminEmail: string;
    role: string;
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Forgot Password / OTP Recovery State
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'enter-email' | 'enter-otp' | 'set-password' | 'success'>('enter-email');
  const [forgotOtpDigits, setForgotOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [resetSessionToken, setResetSessionToken] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmNewResetPassword, setConfirmNewResetPassword] = useState('');
  const [showNewResetPass, setShowNewResetPass] = useState(false);
  const [forgotAccountInfo, setForgotAccountInfo] = useState<{ hasPassword?: boolean; authProvider?: string } | null>(null);

  // ==========================================
  // Google OAuth & Email OTP State (Requirements 1-3)
  // ==========================================
  const [loginMethod, setLoginMethod] = useState<'otp' | 'credentials'>('credentials');
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleModalError, setGoogleModalError] = useState<string | null>(null);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleFullNameInput, setGoogleFullNameInput] = useState('');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Email OTP Login State
  const [otpEmail, setOtpEmail] = useState('');
  const [otpStep, setOtpStep] = useState<'enter-email' | 'enter-code'>('enter-email');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState<{ warning?: string; fallbackOtp?: string } | null>(null);
  const [regDeliveryNotice, setRegDeliveryNotice] = useState<{ warning?: string; fallbackOtp?: string } | null>(null);

  // Unlinked user alert banner state
  const [unlinkedUserNotice, setUnlinkedUserNotice] = useState<{
    email: string;
    fullName?: string;
    googleId?: string;
    provider: 'google' | 'otp';
  } | null>(null);

  // Registration Mode Paths (Path 1 Google, Path 2 Work Email & Password with OTP Verification)
  const [regPath, setRegPath] = useState<'google' | 'password'>('password');
  const [regGoogleAdmin, setRegGoogleAdmin] = useState<{
    email: string;
    fullName: string;
    googleId: string;
    credential?: string;
  } | null>(null);

  // Registration OTP State (Integrated Email Verification)
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [regOtpVerified, setRegOtpVerified] = useState(false);
  const [regOtpVerifying, setRegOtpVerifying] = useState(false);
  const [regOtpCooldown, setRegOtpCooldown] = useState(0);
  const [regOtpDigits, setRegOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [regOtpSubmitting, setRegOtpSubmitting] = useState(false);

  // Cooldown countdown timers
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (regOtpCooldown <= 0) return;
    const timer = setInterval(() => {
      setRegOtpCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [regOtpCooldown]);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = setInterval(() => {
      setForgotCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [forgotCooldown]);

  // OTP input refs
  const otpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const regOtpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const forgotOtpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const handleForgotOtpDigitChange = (index: number, val: string) => {
    const char = val.slice(-1);
    if (!/^\d*$/.test(char)) return;

    const newDigits = [...forgotOtpDigits];
    newDigits[index] = char;
    setForgotOtpDigits(newDigits);
    setError(null);

    if (char && index < 5) {
      forgotOtpInputRefs[index + 1].current?.focus();
    }
  };

  const handleForgotOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !forgotOtpDigits[index] && index > 0) {
      forgotOtpInputRefs[index - 1].current?.focus();
    }
  };

  const handleForgotOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = ['', '', '', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setForgotOtpDigits(newDigits);
      const nextIndex = Math.min(pasted.length, 5);
      forgotOtpInputRefs[nextIndex].current?.focus();
    }
  };

  const handleOtpDigitChange = (index: number, val: string) => {
    const char = val.slice(-1);
    if (!/^\d*$/.test(char)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setError(null);

    if (char && index < 5) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = ['', '', '', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setOtpDigits(newDigits);
      const nextIndex = Math.min(pasted.length, 5);
      otpInputRefs[nextIndex].current?.focus();
    }
  };

  const handleRegOtpDigitChange = async (index: number, val: string) => {
    const char = val.slice(-1);
    if (!/^\d*$/.test(char)) return;

    const newDigits = [...regOtpDigits];
    newDigits[index] = char;
    setRegOtpDigits(newDigits);
    setError(null);

    if (char && index < 5) {
      regOtpInputRefs[index + 1].current?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      setRegOtpVerifying(true);
      try {
        const res = await verifyEmailOtp(adminWorkEmail.trim().toLowerCase(), fullCode, 'register');
        if (res.success || res.unlinkedUser) {
          setRegOtpVerified(true);
          setError(null);
        } else {
          setRegOtpVerified(false);
          setError(res.error || 'Verification code is invalid or has expired.');
        }
      } catch (err: any) {
        // inline check fallback
      } finally {
        setRegOtpVerifying(false);
      }
    } else {
      if (regOtpVerified) setRegOtpVerified(false);
    }
  };

  const handleRegOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !regOtpDigits[index] && index > 0) {
      regOtpInputRefs[index - 1].current?.focus();
    }
  };

  const handleRegOtpPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = ['', '', '', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setRegOtpDigits(newDigits);
      const nextIndex = Math.min(pasted.length, 5);
      regOtpInputRefs[nextIndex].current?.focus();

      if (pasted.length === 6) {
        setRegOtpVerifying(true);
        try {
          const res = await verifyEmailOtp(adminWorkEmail.trim().toLowerCase(), pasted, 'register');
          if (res.success || res.unlinkedUser) {
            setRegOtpVerified(true);
            setError(null);
          } else {
            setRegOtpVerified(false);
            setError(res.error || 'Verification code is invalid or has expired.');
          }
        } catch (err: any) {
          // inline check fallback
        } finally {
          setRegOtpVerifying(false);
        }
      }
    }
  };

  // Google Authentication Handlers
  const handleStartGoogleAuth = () => {
    setError(null);
    setUnlinkedUserNotice(null);
    const win = window as any;

    // Primary: Google Identity Services OAuth 2.0 Token Client
    // This triggers the official Google account chooser & consent popup directly
    if (win.google?.accounts?.oauth2 && googleConfig.clientId) {
      try {
        setGoogleSubmitting(true);
        const client = win.google.accounts.oauth2.initTokenClient({
          client_id: googleConfig.clientId,
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              setGoogleSubmitting(false);
              console.warn('Google OAuth token error:', tokenResponse);
              if (tokenResponse.error === 'access_denied') {
                setError('Google authorization was cancelled.');
              } else {
                setError(`Google Sign-In: ${tokenResponse.error_description || tokenResponse.error}.`);
                setGoogleModalOpen(true);
              }
              return;
            }

            if (tokenResponse.access_token) {
              try {
                const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const profile = await userRes.json();
                if (profile.email) {
                  const email = profile.email.toLowerCase().trim();
                  const fullName = profile.name || email.split('@')[0];
                  const googleId = profile.sub;
                  if (mode === 'register') {
                    setRegGoogleAdmin({ email, fullName, googleId });
                    setAdminWorkEmail(email);
                    setAdminFullName(fullName);
                    setGoogleModalOpen(false);
                  } else {
                    await handleCompleteGoogleLogin({ email, fullName, googleId });
                  }
                } else {
                  setError('Google profile did not contain a verified email.');
                }
              } catch (err: any) {
                setError('Failed to retrieve verified profile from Google.');
              } finally {
                setGoogleSubmitting(false);
              }
            }
          },
        });
        client.requestAccessToken({ prompt: 'consent' });
        return;
      } catch (err) {
        console.warn('Google OAuth2 initTokenClient error:', err);
        setGoogleSubmitting(false);
      }
    }

    // Secondary: Google Identity Services One-Tap prompt
    if (win.google?.accounts?.id && googleConfig.clientId) {
      try {
        win.google.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: async (response: any) => {
            if (response.credential) {
              try {
                const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                const email = (payload.email || '').toLowerCase().trim();
                const fullName = payload.name || email.split('@')[0];
                const googleId = payload.sub;
                if (mode === 'register') {
                  setRegGoogleAdmin({ email, fullName, googleId, credential: response.credential });
                  setAdminWorkEmail(email);
                  setAdminFullName(fullName);
                  setGoogleModalOpen(false);
                } else {
                  await handleCompleteGoogleLogin({ credential: response.credential });
                }
              } catch (e) {
                console.error('Failed to parse Google credential token:', e);
              }
            }
          },
        });
        win.google.accounts.id.prompt();
        return;
      } catch (err) {
        console.warn('Google GIS prompt failed, opening fallback dialog:', err);
      }
    }

    setGoogleModalOpen(true);
  };

  const handleCompleteGoogleLogin = async (params: { credential?: string; email?: string; fullName?: string; googleId?: string }) => {
    setGoogleSubmitting(true);
    setError(null);
    setGoogleModalError(null);
    try {
      const res = await loginWithGoogle(params);
      if (res.success) {
        setGoogleModalOpen(false);
        toast.success('Google Authentication Verified', 'Welcome back to ForgeX Industrial Workspace!');
        onSuccess?.(res.role);
      } else if (res.unlinkedUser) {
        setGoogleModalOpen(false);
        const email = res.email || params.email || '';
        const fullName = res.fullName || params.fullName || email.split('@')[0];
        const googleId = res.googleId || params.googleId || '';
        setUnlinkedUserNotice({
          email,
          fullName,
          googleId,
          provider: 'google',
        });
        const msg = res.message || `No registered company workspace found for Google account (${email}). Please register your company below to get started.`;
        setError(msg);
        setGoogleModalError(msg);
        toast.warning('Unregistered Account', 'No registered company workspace found for this Google account. Please register below.');
      } else {
        const errorMsg = res.error || 'Google authentication failed. Please verify credentials.';
        setError(errorMsg);
        setGoogleModalError(errorMsg);
        setGoogleModalOpen(false);
        toast.error('Google Sign-In Failed', errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Network error during Google authentication.';
      setError(errorMsg);
      setGoogleModalError(errorMsg);
      setGoogleModalOpen(false);
      toast.error('Authentication Error', errorMsg);
    } finally {
      setGoogleSubmitting(false);
    }
  };

  // Email OTP Login Handlers
  const handleSendLoginOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otpEmail.trim() || !otpEmail.includes('@') || otpSubmitting || otpCooldown > 0) {
      const msg = 'Please enter a valid work email address.';
      setError(msg);
      toast.error('Invalid Email', msg);
      return;
    }

    setError(null);
    setUnlinkedUserNotice(null);
    setOtpSubmitting(true);
    try {
      const res = await sendEmailOtp(otpEmail.trim().toLowerCase(), 'login');
      if (res.success) {
        setOtpStep('enter-code');
        setOtpCooldown(res.cooldownSeconds || 60);
        setOtpDigits(['', '', '', '', '', '']);
        if (res.deliveryWarning || res.debugOtp) {
          setDeliveryNotice({
            warning: res.deliveryWarning || 'Development Environment: 1-Click Verification Available',
            fallbackOtp: res.debugOtp,
          });
        } else {
          setDeliveryNotice(null);
        }
        toast.success('Security Code Dispatched', `A 6-digit one-time code has been sent to ${otpEmail.trim().toLowerCase()}`);
        setTimeout(() => otpInputRefs[0].current?.focus(), 100);
      } else {
        const msg = res.error || 'Failed to dispatch verification code. Please try again.';
        setError(msg);
        toast.error('Delivery Failed', msg);
        if (res.cooldownSeconds) setOtpCooldown(res.cooldownSeconds);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error sending OTP code.';
      setError(msg);
      toast.error('Network Error', msg);
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6 || otpSubmitting) {
      toast.warning('Incomplete Code', 'Please enter all 6 digits of the verification code.');
      return;
    }

    setError(null);
    setOtpSubmitting(true);
    try {
      const res = await verifyEmailOtp(otpEmail.trim().toLowerCase(), code, 'login');
      if (res.success) {
        toast.success('Authentication Verified', 'Welcome back to ForgeX Industrial Workspace!');
        onSuccess?.(res.role);
      } else if (res.unlinkedUser) {
        const email = res.email || otpEmail.trim().toLowerCase();
        setUnlinkedUserNotice({
          email,
          fullName: res.fullName || email.split('@')[0],
          provider: 'otp',
        });
        const msg = res.message || `No registered company workspace found for (${email}). Please register your company below to get started.`;
        setError(msg);
        toast.warning('No Workspace Found', 'No company registered for this email. Please register below.');
      } else {
        const msg = res.error || 'Verification code is invalid or has expired.';
        setError(msg);
        toast.error('Verification Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Authentication error verifying OTP code.';
      setError(msg);
      toast.error('Verification Error', msg);
    } finally {
      setOtpSubmitting(false);
    }
  };

  // Registration Handlers
  const handleRegisterWithGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!regGoogleAdmin?.email) {
      const msg = 'Please authenticate with your Google Administrator account first.';
      setError(msg);
      toast.error('Google Account Required', msg);
      return;
    }
    if (!companyName.trim() || companyName.trim().length < 2) {
      const msg = 'Company name is required (minimum 2 characters).';
      setError(msg);
      toast.error('Validation Error', msg);
      setRegStep(1);
      return;
    }
    if (!businessEmail.trim() || !businessEmail.includes('@') || !businessEmail.includes('.')) {
      const msg = 'A valid business contact email is required.';
      setError(msg);
      toast.error('Validation Error', msg);
      setRegStep(1);
      return;
    }
    if (!termsAccepted) {
      const msg = 'You must accept the Terms of Service to register.';
      setError(msg);
      toast.warning('Terms Required', msg);
      return;
    }
    if (!privacyAccepted) {
      const msg = 'You must accept the Privacy Policy to register.';
      setError(msg);
      toast.warning('Privacy Policy Required', msg);
      return;
    }

    setSubmitting(true);
    try {
      const effectiveSlug = (companySlug.trim() || companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace');
      const res = await registerOrgGoogle({
        organizationName: companyName.trim(),
        organizationSlug: effectiveSlug,
        industry,
        businessEmail: businessEmail.trim().toLowerCase(),
        country,
        timezone,
        website: website.trim() || undefined,
        companySize,
        initialSiteName: initialSiteName.trim() || undefined,
        adminFullName: regGoogleAdmin.fullName || adminFullName.trim(),
        adminEmail: regGoogleAdmin.email.trim().toLowerCase(),
        deploymentMode: deploymentType,
        adminJobTitle: adminJobTitle.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
        termsAccepted,
        privacyAccepted,
        credential: regGoogleAdmin.credential,
        googleId: regGoogleAdmin.googleId,
      });

      if (res.success) {
        if (res.user && res.organization) {
          await setAuthSession(res.user, res.organization, res.token, res.membership);
        }
        toast.success('Registration Complete!', 'Welcome to ForgeX. Your company workspace is initialized.');
        if (deploymentType === 'enterprise') {
          setEnterpriseSetupData({
            orgName: companyName.trim(),
            slug: effectiveSlug,
            adminEmail: regGoogleAdmin.email.trim().toLowerCase(),
            role: res.role || 'ORGANIZATION_OWNER',
          });
          setMode('enterprise-setup');
        } else {
          const targetRole = res.role || 'ORGANIZATION_OWNER';
          onSuccess?.(targetRole);
          if (typeof window !== 'undefined') {
            window.history.pushState(null, '', '/dashboard');
            window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'overview' } }));
          }
        }
      } else {
        const msg = res.error || 'Failed to register company with Google identity.';
        setError(msg);
        toast.error('Registration Failed', msg);
        if (msg.toLowerCase().includes('workspace') || msg.toLowerCase().includes('slug') || msg.toLowerCase().includes('identifier') || msg.toLowerCase().includes('company')) {
          setRegStep(1);
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error during Google company registration.';
      setError(msg);
      toast.error('Network Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendRegOtp = async () => {
    if (!adminWorkEmail.trim() || !adminWorkEmail.includes('@') || regOtpSubmitting || regOtpCooldown > 0) {
      const msg = 'Please provide a valid administrator work email address.';
      setError(msg);
      toast.error('Invalid Email', msg);
      return;
    }
    setError(null);
    setRegOtpSubmitting(true);
    try {
      const res = await sendEmailOtp(adminWorkEmail.trim().toLowerCase(), 'register');
      if (res.success) {
        setRegOtpSent(true);
        setRegOtpCooldown(res.cooldownSeconds || 60);
        if (res.debugOtp) {
          const digits = res.debugOtp.split('');
          setRegOtpDigits(digits);
          setRegOtpVerified(true);
          setRegDeliveryNotice(null);
          toast.success('Email Auto-Verified', `Work email ${adminWorkEmail.trim().toLowerCase()} verified successfully.`);
        } else {
          setRegOtpDigits(['', '', '', '', '', '']);
          if (res.deliveryWarning) {
            setRegDeliveryNotice({
              warning: res.deliveryWarning,
            });
          } else {
            setRegDeliveryNotice(null);
          }
          toast.success('Confirmation Code Dispatched', `A 6-digit confirmation code was sent to ${adminWorkEmail.trim().toLowerCase()}`);
          setTimeout(() => regOtpInputRefs[0].current?.focus(), 100);
        }
      } else {
        const msg = res.error || 'Failed to send OTP code.';
        setError(msg);
        toast.error('Dispatch Failed', msg);
        if (res.cooldownSeconds) setRegOtpCooldown(res.cooldownSeconds);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error sending registration OTP code.';
      setError(msg);
      toast.error('Network Error', msg);
    } finally {
      setRegOtpSubmitting(false);
    }
  };


  // ==========================================
  // Form Submission Handler (Unified Login)
  // ==========================================
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setUnverifiedEmailNotice(null);
    const errors: Record<string, string> = {};

    if (!identifier.trim()) {
      errors.identifier = 'Work email or RFID badge ID is required';
    }
    if (!password) {
      errors.password = 'Password or security PIN is required';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const msg = 'Please provide both your work email / badge ID and password.';
      setError(msg);
      toast.error('Validation Error', msg);
      return;
    }

    setSubmitting(true);
    try {
      const res = await login(identifier.trim(), password);
      if (res.success) {
        toast.success('Authentication Verified', 'Welcome back to ForgeX Industrial Workspace!');
        onSuccess?.(res.role);
      } else {
        if (res.error && res.error.toLowerCase().includes('verify')) {
          setUnverifiedEmailNotice(identifier.trim());
          setRegisteredEmail(identifier.trim());
          toast.warning('Email Verification Required', 'Please verify your work email address before signing in.');
        } else {
          toast.error('Authentication Failed', res.error || 'Invalid credentials. Please verify your work email and password.');
        }
        setError(res.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Authentication service unreachable.';
      setError(msg);
      toast.error('Service Unreachable', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Resend verification helper
  const handleResendUnverified = async () => {
    if (!unverifiedEmailNotice || resendingEmail) return;
    setResendingEmail(true);
    const res = await resendVerification(unverifiedEmailNotice);
    setResendingEmail(false);
    if (res.success) {
      setResendSuccess(true);
      toast.success('Verification Resent', `A new verification email has been sent to ${unverifiedEmailNotice}.`);
    } else {
      const msg = res.error || 'Failed to resend verification email.';
      setError(msg);
      toast.error('Resend Failed', msg);
    }
  };

  // Company Name Change & Slug Generation
  const handleCompanyNameChange = (val: string) => {
    setCompanyName(val);
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setCompanySlug(slug);
  };

  // Company Registration Submission
  const handleCompanyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Validation
    if (!companyName.trim() || companyName.trim().length < 2) {
      const msg = 'Company name is required (minimum 2 characters).';
      setError(msg);
      toast.error('Validation Error', msg);
      setRegStep(1);
      return;
    }
    if (!businessEmail.trim() || !businessEmail.includes('@') || !businessEmail.includes('.')) {
      const msg = 'A valid business contact email address is required.';
      setError(msg);
      toast.error('Invalid Business Email', msg);
      setRegStep(1);
      return;
    }
    if (!adminFullName.trim() || adminFullName.trim().length < 2) {
      const msg = 'Administrator full name is required.';
      setError(msg);
      toast.error('Missing Admin Name', msg);
      return;
    }
    if (!adminWorkEmail.trim() || !adminWorkEmail.includes('@') || !adminWorkEmail.includes('.')) {
      const msg = 'A valid administrator work email address is required.';
      setError(msg);
      toast.error('Missing Admin Email', msg);
      return;
    }

    // Optional Corporate Work Email Verification via OTP
    let otpCode = regOtpDigits.join('');
    if (!otpCode && regDeliveryNotice?.fallbackOtp) {
      otpCode = regDeliveryNotice.fallbackOtp;
    }
    if (regOtpSent && !regOtpVerified && otpCode.length > 0 && otpCode.length !== 6) {
      const msg = 'Please enter all 6 digits of the email verification code, or clear it to proceed.';
      setError(msg);
      toast.warning('Incomplete Code', msg);
      const firstEmpty = regOtpDigits.findIndex((d) => !d);
      if (firstEmpty >= 0) {
        regOtpInputRefs[firstEmpty].current?.focus();
      }
      return;
    }

    if (!adminPassword || adminPassword.length < 8) {
      const msg = 'Administrator password is required and must be at least 8 characters long.';
      setError(msg);
      toast.error('Password Required', msg);
      return;
    }
    if (!/[A-Z]/.test(adminPassword) || !/[a-z]/.test(adminPassword) || !/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(adminPassword)) {
      const msg = 'Password must contain at least one uppercase letter, one lowercase letter, and one number or special character.';
      setError(msg);
      toast.error('Weak Password', msg);
      return;
    }
    if (adminPassword !== confirmPassword) {
      const msg = 'Password confirmation does not match the entered password.';
      setError(msg);
      toast.error('Password Mismatch', msg);
      return;
    }
    if (!termsAccepted) {
      const msg = 'You must accept the Terms of Service to register.';
      setError(msg);
      toast.warning('Terms Required', msg);
      return;
    }
    if (!privacyAccepted) {
      const msg = 'You must accept the Privacy Policy to register.';
      setError(msg);
      toast.warning('Privacy Policy Required', msg);
      return;
    }

    const effectiveSlug =
      companySlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') ||
      companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') ||
      `org-${Date.now().toString(36)}`;

    setSubmitting(true);
    try {
      const res = await registerOrg({
        organizationName: companyName.trim(),
        organizationSlug: effectiveSlug,
        industry,
        businessEmail: businessEmail.trim().toLowerCase(),
        country,
        timezone,
        website: website.trim() || undefined,
        companySize,
        initialSiteName: initialSiteName.trim() || undefined,
        adminFullName: adminFullName.trim(),
        adminEmail: adminWorkEmail.trim().toLowerCase(),
        password: adminPassword,
        confirmPassword,
        otp: otpCode.length === 6 ? otpCode : undefined,
        deploymentMode: deploymentType,
        adminJobTitle: adminJobTitle.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
        termsAccepted,
        privacyAccepted,
      });

      if (res.success) {
        if (res.user && res.organization) {
          await setAuthSession(res.user, res.organization, res.token, res.membership);
        }
        setRegisteredEmail(adminWorkEmail.trim().toLowerCase());
        toast.success('Registration Complete!', 'Welcome to ForgeX. Your company workspace is initialized.');
        if (deploymentType === 'enterprise') {
          setEnterpriseSetupData({
            orgName: companyName.trim(),
            slug: effectiveSlug,
            adminEmail: adminWorkEmail.trim().toLowerCase(),
            role: res.role || 'ORGANIZATION_OWNER',
          });
          setMode('enterprise-setup');
        } else {
          const targetRole = res.role || 'ORGANIZATION_OWNER';
          onSuccess?.(targetRole);
          if (typeof window !== 'undefined') {
            window.history.pushState(null, '', '/dashboard');
            window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'overview' } }));
          }
        }
      } else {
        const msg = res.error || 'Registration failed. The workspace identifier or email may already be in use.';
        setError(msg);
        toast.error('Registration Failed', msg);
        if (msg.toLowerCase().includes('workspace') || msg.toLowerCase().includes('slug') || msg.toLowerCase().includes('identifier')) {
          setRegStep(1);
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error during company registration.';
      setError(msg);
      toast.error('Network Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Forgot Password / OTP Recovery Handlers
  const handleSendForgotOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@') || forgotSubmitting || forgotCooldown > 0) {
      const msg = 'Please provide a valid registered work email address.';
      setError(msg);
      toast.error('Invalid Email', msg);
      return;
    }

    setForgotSubmitting(true);
    setError(null);
    try {
      const res = await forgotPassword(forgotEmail.trim().toLowerCase());
      if (res.success) {
        setForgotStep('enter-otp');
        setForgotCooldown(res.cooldownSeconds || 60);
        setForgotAccountInfo({
          hasPassword: res.hasPassword,
          authProvider: res.authProvider,
        });
        setForgotOtpDigits(['', '', '', '', '', '']);
        toast.success('Reset Code Dispatched', `Password recovery code dispatched to ${forgotEmail.trim().toLowerCase()}`);
        setTimeout(() => forgotOtpInputRefs[0].current?.focus(), 100);
      } else {
        const msg = res.error || 'Failed to dispatch verification code. Please try again.';
        setError(msg);
        toast.error('Dispatch Failed', msg);
        if (res.cooldownSeconds) setForgotCooldown(res.cooldownSeconds);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error requesting password recovery.';
      setError(msg);
      toast.error('Network Error', msg);
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleVerifyForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = forgotOtpDigits.join('');
    if (code.length !== 6 || forgotSubmitting) {
      toast.warning('Incomplete Code', 'Please enter all 6 digits of the recovery code.');
      return;
    }

    setForgotSubmitting(true);
    setError(null);
    try {
      const res = await verifyResetOtp(forgotEmail.trim().toLowerCase(), code);
      if (res.success && res.resetSessionToken) {
        setResetSessionToken(res.resetSessionToken);
        setForgotStep('set-password');
        toast.success('Identity Confirmed', 'Please establish your new administrator password.');
      } else {
        const msg = res.error || 'Verification code is invalid or has expired.';
        setError(msg);
        toast.error('Verification Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error verifying reset OTP.';
      setError(msg);
      toast.error('Verification Error', msg);
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetSessionToken || forgotSubmitting) return;

    if (newResetPassword.length < 8) {
      const msg = 'Password must be at least 8 characters in length.';
      setError(msg);
      toast.error('Password Too Short', msg);
      return;
    }
    if (newResetPassword !== confirmNewResetPassword) {
      const msg = 'Passwords do not match.';
      setError(msg);
      toast.error('Password Mismatch', msg);
      return;
    }

    setForgotSubmitting(true);
    setError(null);
    try {
      const res = await resetPassword(resetSessionToken, newResetPassword, confirmNewResetPassword);
      if (res.success) {
        setForgotStep('success');
        toast.success('Password Updated', 'Your security password has been changed. You may now sign in.');
      } else {
        const msg = res.error || 'Failed to establish new password. The reset session may have expired.';
        setError(msg);
        toast.error('Reset Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error resetting password.';
      setError(msg);
      toast.error('Reset Error', msg);
    } finally {
      setForgotSubmitting(false);
    }
  };

  const inputCls =
    'w-full pl-9 pr-3 py-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-md text-sm text-[#1A202C] placeholder-[#94A3B8] outline-none transition font-sans disabled:opacity-50 shadow-sm';

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#0B0F17]">
      {/* LEFT COLUMN: Industrial Branding Hero */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-[#0F172A] via-[#0B0F17] to-black border-r border-[#1E293B] relative overflow-hidden">
        {/* Background circuit grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

        {/* Ambient glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-0.5 shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-[#0B0F17] rounded-[10px] flex items-center justify-center p-1.5">
              <img src="/forgex_icon.png" alt="ForgeX AI" className="w-full h-full object-contain" />
            </div>
          </div>
          <div>
            <div className="font-mono text-sm font-bold tracking-widest text-white uppercase flex items-center gap-2">
              <span>FORGEX AI</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-normal">ENTERPRISE</span>
            </div>
            <div className="text-[11px] font-mono text-gray-400">Autonomous Industrial Intelligence Platform</div>
          </div>
        </div>

        {/* Middle Value Proposition */}
        <div className="relative z-10 space-y-6 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero-Trust Industrial Identity Architecture</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-snug">
            Mission-Critical Equipment Reliability with Multi-Tenant RBAC.
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed font-sans">
            Secure edge-to-cloud identity governance for petrochemical refineries, power generation, and advanced manufacturing lines.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#1E293B]">
            <div className="p-3 bg-[#141B26] border border-[#243145] rounded-xl">
              <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Air-Gapped & SaaS
              </div>
              <div className="text-[11px] text-gray-400 mt-1">Deploy locally on factory servers or cloud cluster</div>
            </div>
            <div className="p-3 bg-[#141B26] border border-[#243145] rounded-xl">
              <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Hardware Badges & QR
              </div>
              <div className="text-[11px] text-gray-400 mt-1">Fast, audited shop-floor authentication</div>
            </div>
          </div>
        </div>

        {/* Bottom Status Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-gray-500 font-mono">
          <span>Production Security Protocol v2.4</span>
          <span>ForgeX AI Industrial Systems</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Authentication Surface */}
      <div className="flex-1 h-full min-h-0 overflow-y-auto bg-[#F8FAFC] flex flex-col items-center justify-start p-3 sm:p-6 md:p-8 lg:p-10 xl:p-12">
        <div className={`w-full ${mode === 'register' ? 'max-w-xl' : 'max-w-md'} my-auto py-4 sm:py-6 transition-all duration-200`}>
          {/* Mobile Brand Header (Visible only on < lg screens) */}
          <div className="flex lg:hidden items-center justify-center gap-2.5 mb-3.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 p-0.5 shadow-md shadow-blue-500/20">
              <div className="w-full h-full bg-[#0B0F17] rounded-[6px] flex items-center justify-center p-1">
                <img src="/forgex_icon.png" alt="ForgeX AI" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-bold tracking-wider text-gray-900 uppercase">FORGEX AI</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">ENTERPRISE</span>
            </div>
          </div>

          {/* Main Card Container */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden">
            {/* Top Card Header */}
            <div className="p-4 sm:p-6 border-b border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#2563EB]">
                  {mode === 'register'
                    ? 'TENANT ONBOARDING'
                    : mode === 'enterprise-setup'
                    ? 'ENTERPRISE ON-PREMISES SETUP'
                    : mode === 'forgot-password'
                    ? 'SECURITY RECOVERY'
                    : mode === 'factory-code'
                    ? 'SHOP-FLOOR ONBOARDING'
                    : mode === 'verify-email'
                    ? 'IDENTITY VERIFICATION'
                    : mode === 'reset-password'
                    ? 'CREDENTIAL RECOVERY'
                    : mode === 'accept-invitation'
                    ? 'INVITATION ACCEPTANCE'
                    : 'INDUSTRIAL AUTHENTICATION'}
                </span>
                <span className="text-[11px] font-mono text-[#64748B]">
                  {mode === 'register' ? `Step ${regStep} of 2` : mode === 'enterprise-setup' ? 'Deployment Guide' : 'ForgeX AI v2.4'}
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-[#1A202C] tracking-tight">
                {mode === 'register'
                  ? 'Register Your Company'
                  : mode === 'enterprise-setup'
                  ? 'Enterprise Setup & Node Deployment'
                  : mode === 'forgot-password'
                  ? 'Recover Account Access'
                  : mode === 'factory-code'
                  ? 'Factory Code Activation'
                  : mode === 'verify-email'
                  ? 'Verify Your Work Email'
                  : mode === 'reset-password'
                  ? 'Establish New Password'
                  : mode === 'accept-invitation'
                  ? 'Activate Your Account'
                  : 'Sign in to ForgeX AI'}
              </h1>
              <p className="text-xs text-[#64748B] mt-1 font-sans">
                {mode === 'register'
                  ? 'Initialize your enterprise organization workspace and root administrator.'
                  : mode === 'enterprise-setup'
                  ? 'Follow these setup instructions to connect your on-premises edge nodes and local industrial servers.'
                  : mode === 'forgot-password'
                  ? 'Enter your work email to receive a secure, expiring password recovery link.'
                  : mode === 'factory-code'
                  ? 'Enter the 8-character activation code issued by your site supervisor.'
                  : mode === 'login'
                  ? 'Select your industrial identity profile to access authorized plant operations.'
                  : 'Complete authentication verification.'}
              </p>
            </div>

            {/* Error Notification Banner */}
            {error && (
              <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Unverified Email Warning Banner */}
            {unverifiedEmailNotice && (
              <div className="p-3.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Email Verification Required</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Your administrator account has been created but requires email verification before accessing company resources.
                </p>
                {resendSuccess ? (
                  <p className="text-[11px] font-bold text-emerald-700">A new verification link has been sent to your email!</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendUnverified}
                    disabled={resendingEmail}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition"
                  >
                    {resendingEmail ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                )}
              </div>
            )}

            {/* CARD BODY CONTENT */}
            <div className="p-4 sm:p-6">
              {/* ============================================================ */}
              {/* SUB-VIEW 1: URL Verification (?verify=...) */}
              {/* ============================================================ */}
              {mode === 'verify-email' && urlParams.verify && (
                <EmailVerificationView
                  token={urlParams.verify}
                  onBackToLogin={() => setMode('login')}
                  onSuccess={onSuccess}
                />
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 2: URL Password Reset (?reset=...) */}
              {/* ============================================================ */}
              {mode === 'reset-password' && urlParams.reset && (
                <ResetPasswordView
                  token={urlParams.reset}
                  onBackToLogin={() => setMode('login')}
                  onSuccess={onSuccess}
                />
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 3: Invitation / QR Activation (?token=... or ?qr=...) */}
              {/* ============================================================ */}
              {mode === 'accept-invitation' && (urlParams.token || urlParams.qr) && (
                <AcceptInvitationView
                  token={urlParams.qr || urlParams.token || ''}
                  isQr={Boolean(urlParams.qr)}
                  onBackToLogin={() => setMode('login')}
                  onSuccess={onSuccess}
                />
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 4: Factory Code Activation */}
              {/* ============================================================ */}
              {mode === 'factory-code' && (
                <FactoryCodeActivationView
                  onBackToLogin={() => setMode('login')}
                  onSuccess={onSuccess}
                />
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 5: Verification Pending Screen (Post-Registration) */}
              {/* ============================================================ */}
              {mode === 'verification-pending' && (
                <div className="text-center space-y-4 py-4">
                  <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
                    <Mail className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#1A202C]">Check Your Work Email</h3>
                    <p className="text-xs text-[#64748B] mt-1">
                      A verification link has been dispatched to{' '}
                      <strong className="text-[#1A202C] font-mono">{registeredEmail}</strong>.
                    </p>
                    <p className="text-[11px] text-[#64748B] mt-2">
                      Please click the link in the email to activate your root Organization Administrator credentials.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg transition"
                    >
                      Return to Sign In
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!registeredEmail) return;
                        setResendingEmail(true);
                        await resendVerification(registeredEmail);
                        setResendingEmail(false);
                        alert(`Verification email resent to ${registeredEmail}`);
                      }}
                      className="text-xs text-[#2563EB] hover:text-blue-700 transition underline"
                    >
                      Resend Verification Link
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 6: OTP-Verified Password Reset Flow (Section 1) */}
              {/* ============================================================ */}
              {mode === 'forgot-password' && (
                <div className="space-y-4">
                  {/* Step 1: Enter Email */}
                  {forgotStep === 'enter-email' && (
                    <form onSubmit={handleSendForgotOtp} className="space-y-4" noValidate>
                      <div>
                        <label htmlFor="forgot-email" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          REGISTERED WORK EMAIL
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="forgot-email"
                            type="email"
                            required
                            placeholder="user@plant.industrial"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-1.5">
                          We will dispatch a secure 6-digit one-time verification code to this address.
                        </p>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMode('login');
                            setError(null);
                          }}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-lg transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={forgotSubmitting || !forgotEmail.includes('@')}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
                        >
                          {forgotSubmitting ? 'Sending Code...' : 'Send Verification Code'}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 2: Enter 6-Digit OTP */}
                  {forgotStep === 'enter-otp' && (
                    <form onSubmit={handleVerifyForgotOtp} className="space-y-4">
                      <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">
                            Code dispatched to: <strong className="text-gray-900 font-mono">{forgotEmail}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setForgotStep('enter-email');
                              setError(null);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold transition"
                          >
                            Change Email
                          </button>
                        </div>
                        {forgotAccountInfo?.authProvider === 'google' && !forgotAccountInfo?.hasPassword && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                            <strong>Note:</strong> Your account normally authenticates with Google. You can sign in using Continue with Google, or establish a password by verifying this OTP code.
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#1A202C] mb-2 text-center font-mono">
                          ENTER 6-DIGIT VERIFICATION CODE
                        </label>
                        <div className="flex justify-center gap-2 py-1">
                          {forgotOtpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={forgotOtpInputRefs[idx]}
                              type="text"
                              inputMode="numeric"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleForgotOtpDigitChange(idx, e.target.value)}
                              onKeyDown={(e) => handleForgotOtpKeyDown(idx, e)}
                              onPaste={handleForgotOtpPaste}
                              className={`w-10 h-12 text-center text-xl font-mono font-bold rounded-lg border transition outline-none shadow-xs ${
                                digit
                                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSendForgotOtp()}
                          disabled={forgotCooldown > 0 || forgotSubmitting}
                          className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{forgotCooldown > 0 ? `Resend code in ${forgotCooldown}s` : 'Resend Code'}</span>
                        </button>
                        <span>Single-use • 10m expiry</span>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setForgotStep('enter-email');
                            setError(null);
                          }}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-lg transition"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={forgotSubmitting || forgotOtpDigits.join('').length !== 6}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                        >
                          {forgotSubmitting ? 'Verifying OTP...' : 'Verify OTP & Continue'}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 3: Set New Password */}
                  {forgotStep === 'set-password' && (
                    <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="new-reset-pass" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          NEW PASSWORD *
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="new-reset-pass"
                            type={showNewResetPass ? 'text' : 'password'}
                            required
                            placeholder="Enter enterprise password"
                            value={newResetPassword}
                            onChange={(e) => setNewResetPassword(e.target.value)}
                            className={inputCls + ' pr-10'}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewResetPass(!showNewResetPass)}
                            className="absolute right-3 top-3 text-[#94A3B8] hover:text-[#475569] transition"
                            aria-label={showNewResetPass ? 'Hide password' : 'Show password'}
                          >
                            {showNewResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="mt-2">
                          <PasswordStrengthMeter password={newResetPassword} />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="confirm-new-reset-pass" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          CONFIRM NEW PASSWORD *
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="confirm-new-reset-pass"
                            type={showNewResetPass ? 'text' : 'password'}
                            required
                            placeholder="Repeat new password"
                            value={confirmNewResetPassword}
                            onChange={(e) => setConfirmNewResetPassword(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                          <span>Session Security Enforcement</span>
                        </div>
                        <p>Establishing this new password will automatically terminate all active sessions across all devices.</p>
                      </div>

                      <button
                        type="submit"
                        disabled={forgotSubmitting || !newResetPassword || newResetPassword !== confirmNewResetPassword}
                        className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                      >
                        {forgotSubmitting ? 'Establishing New Password...' : 'Save New Password & Invalidate Sessions'}
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </button>
                    </form>
                  )}

                  {/* Step 4: Success Screen */}
                  {forgotStep === 'success' && (
                    <div className="py-6 space-y-4 text-center">
                      <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-[#1A202C]">Password Successfully Updated</h3>
                        <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed max-w-xs mx-auto">
                          Your enterprise password has been updated. All previous active sessions have been invalidated. You may now sign in with your new credentials.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setForgotStep('enter-email');
                          setForgotEmail('');
                          setForgotOtpDigits(['', '', '', '', '', '']);
                          setNewResetPassword('');
                          setConfirmNewResetPassword('');
                          setResetSessionToken(null);
                        }}
                        className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg transition shadow-sm font-sans"
                      >
                        Continue to Sign In
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 7: "Register Your Company" Form (Section 3) */}
              {/* ============================================================ */}
              {mode === 'register' && (
                <div className="space-y-4">
                  {/* 2-Step Wizard Indicator */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] text-xs">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-mono font-bold ${
                          regStep === 1 ? 'bg-[#151C24] text-white' : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {regStep > 1 ? '✓' : '1'}
                      </div>
                      <span className={`font-semibold ${regStep === 1 ? 'text-[#1A202C]' : 'text-gray-500'}`}>
                        <span className="hidden sm:inline">Company Information</span>
                        <span className="sm:hidden">Company</span>
                      </span>
                    </div>
                    <div className="h-0.5 flex-1 mx-2 sm:mx-4 bg-gray-200" />
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-mono font-bold ${
                          regStep === 2 ? 'bg-[#151C24] text-white' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        2
                      </div>
                      <span className={`font-semibold ${regStep === 2 ? 'text-[#1A202C]' : 'text-gray-400'}`}>
                        <span className="hidden sm:inline">Administrator & Credentials</span>
                        <span className="sm:hidden">Admin & Auth</span>
                      </span>
                    </div>
                  </div>

                  {/* STEP 1: COMPANY INFORMATION */}
                  {regStep === 1 && (
                    <div className="space-y-3.5">
                      <div>
                        <label htmlFor="reg-comp-name" className="block text-xs font-semibold text-[#1A202C] mb-1">
                          COMPANY / ORGANIZATION NAME *
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3 pointer-events-none" />
                          <input
                            id="reg-comp-name"
                            type="text"
                            required
                            placeholder="e.g. Apex Petrochemical Group"
                            value={companyName}
                            onChange={(e) => handleCompanyNameChange(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        {companySlug && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500 font-mono">
                            <span className="text-gray-400">Workspace Portal:</span>
                            <span className="text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                              forgex.internal/{companySlug}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="reg-industry" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            INDUSTRY *
                          </label>
                          <select
                            id="reg-industry"
                            value={industry}
                            onChange={(e) => setIndustry(e.target.value)}
                            className="w-full px-2.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          >
                            <option value="Oil & Gas Refining">Oil & Gas Refining</option>
                            <option value="Chemical Processing">Chemical Processing</option>
                            <option value="Power Generation & Utilities">Power Generation</option>
                            <option value="Heavy Manufacturing">Heavy Manufacturing</option>
                            <option value="Automotive & Aerospace">Automotive & Aerospace</option>
                            <option value="Mining & Metals">Mining & Metals</option>
                            <option value="Food & Beverage">Food & Beverage</option>
                            <option value="Water Treatment">Water Treatment</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="reg-biz-email" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            BUSINESS EMAIL *
                          </label>
                          <input
                            id="reg-biz-email"
                            type="email"
                            required
                            placeholder="contact@company.com"
                            value={businessEmail}
                            onChange={(e) => setBusinessEmail(e.target.value)}
                            className="w-full px-2.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="reg-country" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            COUNTRY *
                          </label>
                          <select
                            id="reg-country"
                            value={country}
                            onChange={(e) => handleCountryChange(e.target.value)}
                            className="w-full px-2.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          >
                            {COUNTRIES.map((c) => (
                              <option key={c.code} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="reg-tz" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            TIME ZONE (AUTO-SELECTED) *
                          </label>
                          <select
                            id="reg-tz"
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            className="w-full px-2.5 py-2.5 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] font-mono focus:border-[#2563EB]"
                          >
                            {currentTimezones.map((tz) => (
                              <option key={tz} value={tz}>
                                {tz}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="reg-website" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            WEBSITE (OPTIONAL)
                          </label>
                          <input
                            id="reg-website"
                            type="text"
                            placeholder="https://company.com"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          />
                        </div>

                        <div>
                          <label htmlFor="reg-size" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            COMPANY SIZE (OPTIONAL)
                          </label>
                          <select
                            id="reg-size"
                            value={companySize}
                            onChange={(e) => setCompanySize(e.target.value)}
                            className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          >
                            <option value="1-50">1 - 50 Employees</option>
                            <option value="51-200">51 - 200 Employees</option>
                            <option value="201-1000">201 - 1,000 Employees</option>
                            <option value="1000+">1,000+ Enterprise</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="reg-site" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            INITIAL SITE / PLANT (OPTIONAL)
                          </label>
                          <input
                            id="reg-site"
                            type="text"
                            placeholder="e.g. Refinery Plant-01"
                            value={initialSiteName}
                            onChange={(e) => setInitialSiteName(e.target.value)}
                            className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          />
                        </div>

                        <div>
                          <label htmlFor="reg-deploy" className="block text-xs font-semibold text-[#1A202C] mb-1">
                            WORKSPACE EDITION
                          </label>
                          <select
                            id="reg-deploy"
                            value={deploymentType}
                            onChange={(e) => setDeploymentType(e.target.value as 'saas' | 'enterprise')}
                            className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                          >
                            <option value="saas">Cloud Managed Edition (SaaS)</option>
                            <option value="enterprise">Private On-Premises Edition (Self-Hosted)</option>
                          </select>
                          <div className="mt-1 text-[11px]">
                            {deploymentType === 'saas' ? (
                              <span className="text-blue-700 font-medium flex items-center gap-1">
                                <Cloud className="w-3 h-3 text-blue-600 shrink-0" />
                                <span>Instant access. Cloud-hosted and fully managed.</span>
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-medium flex items-center gap-1">
                                <Server className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>Air-gapped server setup guide provided after registration.</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Dedicated Step 1 Error Notification Banner */}
                      {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                          <span className="flex-1 font-medium">{error}</span>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMode('login');
                            setError(null);
                          }}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-lg transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!companyName.trim() || companyName.trim().length < 2) {
                              const msg = 'Company name is required (minimum 2 characters).';
                              setError(msg);
                              toast.error('Validation Error', msg);
                              return;
                            }
                            if (!businessEmail.trim() || !businessEmail.includes('@') || !businessEmail.includes('.')) {
                              const msg = 'Please provide a valid business contact email address.';
                              setError(msg);
                              toast.error('Validation Error', msg);
                              return;
                            }
                            setError(null);
                            if (!companySlug.trim()) {
                              const autoSlug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
                              setCompanySlug(autoSlug);
                            }
                            if (!adminWorkEmail.trim()) {
                              setAdminWorkEmail(businessEmail.trim().toLowerCase());
                            }
                            toast.info('Step 1 Saved', 'Company details recorded. Please configure your administrator account.');
                            setRegStep(2);
                          }}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1 transition shadow-sm"
                        >
                          <span>Continue to Administrator Setup</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: ADMINISTRATOR ACCOUNT & IDENTITY VERIFICATION */}
                  {regStep === 2 && (
                    <div className="space-y-4">
                      {/* Identity Method Selector */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-mono font-bold text-gray-500 uppercase tracking-wider">
                          ADMINISTRATOR AUTHENTICATION METHOD
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-xl border border-gray-200">
                          <button
                            type="button"
                            onClick={() => {
                              setRegPath('google');
                              setError(null);
                            }}
                            className={`py-1.5 sm:py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1 sm:gap-1.5 ${
                              regPath === 'google'
                                ? 'bg-white text-gray-900 shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            <GoogleIcon className="w-3.5 h-3.5" />
                            <span>Google</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRegPath('password');
                              setError(null);
                            }}
                            className={`py-1.5 sm:py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1 sm:gap-1.5 ${
                              regPath === 'password'
                                ? 'bg-white text-gray-900 shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5 text-gray-500" />
                            <span>Password</span>
                          </button>
                        </div>
                      </div>

                      {/* METHOD A: GOOGLE OAUTH */}
                      {regPath === 'google' && (
                        <div className="space-y-4">
                          {!regGoogleAdmin ? (
                            <div className="py-6 px-4 bg-gray-50 border border-gray-200 rounded-xl text-center space-y-3">
                              <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center mx-auto shadow-xs">
                                <GoogleIcon className="w-6 h-6" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-gray-900">Authenticate Organization Owner</h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                                  Sign in with your verified Google account to establish root administrator credentials.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleStartGoogleAuth}
                                disabled={googleSubmitting}
                                className="py-2.5 px-5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-800 text-xs font-semibold rounded-lg inline-flex items-center gap-2 shadow-xs transition disabled:opacity-50"
                              >
                                <GoogleIcon className="w-4 h-4" />
                                <span>{googleSubmitting ? 'Opening Google Account Consent...' : 'Continue with Google'}</span>
                              </button>
                            </div>
                          ) : (
                            <form onSubmit={handleRegisterWithGoogle} className="space-y-4">
                              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-bold text-emerald-900">Verified Google Identity: </span>
                                    <span className="font-mono text-emerald-800">{regGoogleAdmin.email}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setRegGoogleAdmin(null)}
                                  className="text-[11px] text-emerald-700 hover:text-emerald-900 underline"
                                >
                                  Switch
                                </button>
                              </div>

                              <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={termsAccepted}
                                    onChange={(e) => setTermsAccepted(e.target.checked)}
                                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>
                                    I agree to the <span className="text-blue-600 underline">Terms of Service</span>.
                                  </span>
                                </label>
                                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={privacyAccepted}
                                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>
                                    I agree to the <span className="text-blue-600 underline">Privacy Policy</span>.
                                  </span>
                                </label>
                              </div>

                              {/* Dedicated Google Step 2 Error Notification Banner */}
                              {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                                  <span className="flex-1 font-medium">{error}</span>
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setRegStep(1)}
                                  className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-lg transition"
                                >
                                  Back
                                </button>
                                <button
                                  type="submit"
                                  disabled={submitting}
                                  className="flex-1 py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                                >
                                  {submitting 
                                    ? 'Provisioning Workspace with Google...' 
                                    : (deploymentType === 'enterprise' ? 'Register Company & View Setup Guide' : 'Register Company & Launch')}
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                      {/* METHOD B: WORK EMAIL & PASSWORD (WITH INTEGRATED EMAIL OTP VERIFICATION) */}
                      {regPath === 'password' && (
                        <form onSubmit={handleCompanyRegister} className="space-y-3" noValidate>
                          <div>
                            <label htmlFor="reg-admin-name" className="block text-xs font-semibold text-[#1A202C] mb-1">
                              ADMINISTRATOR FULL NAME *
                            </label>
                            <div className="relative">
                              <UserIcon className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                              <input
                                id="reg-admin-name"
                                type="text"
                                required
                                placeholder="Sarah Jenkins"
                                value={adminFullName}
                                onChange={(e) => setAdminFullName(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                              />
                            </div>
                          </div>

                          {/* Work Email with integrated verification */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label htmlFor="reg-admin-work-email" className="block text-xs font-semibold text-[#1A202C]">
                                ADMINISTRATOR WORK EMAIL *
                              </label>
                              {regOtpSent && !regOtpVerified && (
                                <button
                                  type="button"
                                  onClick={handleSendRegOtp}
                                  disabled={regOtpCooldown > 0 || regOtpSubmitting}
                                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                                >
                                  {regOtpCooldown > 0 ? `Resend in ${regOtpCooldown}s` : 'Resend Code'}
                                </button>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                                <input
                                  id="reg-admin-work-email"
                                  type="email"
                                  required
                                  disabled={regOtpVerified}
                                  placeholder="sarah.jenkins@company.com"
                                  value={adminWorkEmail}
                                  onChange={(e) => {
                                    setAdminWorkEmail(e.target.value);
                                    if (regOtpSent) {
                                      setRegOtpSent(false);
                                      setRegOtpVerified(false);
                                      setRegOtpDigits(['', '', '', '', '', '']);
                                    }
                                  }}
                                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB] disabled:bg-gray-50"
                                />
                              </div>

                              {!regOtpVerified ? (
                                <button
                                  type="button"
                                  onClick={handleSendRegOtp}
                                  disabled={regOtpSubmitting || !adminWorkEmail.includes('@') || regOtpCooldown > 0}
                                  className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md whitespace-nowrap transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                  {regOtpSubmitting ? (
                                    <span>Sending...</span>
                                  ) : regOtpSent ? (
                                    <span>Resend Code</span>
                                  ) : (
                                    <>
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                      <span>Verify Email</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRegOtpVerified(false);
                                    setRegOtpSent(false);
                                    setRegOtpDigits(['', '', '', '', '', '']);
                                  }}
                                  className="py-2 px-3 bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold text-xs rounded-md flex items-center gap-1.5 whitespace-nowrap hover:bg-emerald-100 transition shadow-xs cursor-pointer"
                                  title="Click to change email address"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Verified</span>
                                </button>
                              )}
                            </div>

                            {/* 6-Digit OTP Entry Box when verification code is sent */}
                            {regOtpSent && !regOtpVerified && (
                              <div className="mt-2.5 p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5 text-blue-950 font-bold text-[11px] tracking-wide uppercase">
                                    <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Email Verification Code</span>
                                  </div>
                                  <span className="text-[11px] text-gray-500">
                                    Sent to <span className="font-mono text-gray-700 font-semibold">{adminWorkEmail}</span>
                                  </span>
                                </div>

                                {regDeliveryNotice && (
                                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1">
                                    <div className="flex items-start gap-1.5 font-semibold text-amber-950 text-[11px]">
                                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                      <span>{regDeliveryNotice.warning}</span>
                                    </div>
                                    {regDeliveryNotice.fallbackOtp && (
                                      <div className="mt-1 pt-1 border-t border-amber-200 flex items-center justify-between text-[11px]">
                                        <span className="text-amber-800 font-medium">Sandbox Code:</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const code = regDeliveryNotice.fallbackOtp!;
                                            const digits = code.split('');
                                            setRegOtpDigits(digits);
                                            setRegOtpVerifying(true);
                                            verifyEmailOtp(adminWorkEmail.trim().toLowerCase(), code, 'register')
                                              .then((vRes) => {
                                                if (vRes.success || vRes.unlinkedUser) {
                                                  setRegOtpVerified(true);
                                                  setRegDeliveryNotice(null);
                                                  toast.success('Email Verified', 'Corporate email identity verified successfully.');
                                                }
                                              })
                                              .finally(() => setRegOtpVerifying(false));
                                          }}
                                          className="font-mono font-bold bg-amber-200/90 px-2.5 py-0.5 rounded text-amber-950 hover:bg-amber-300 transition cursor-pointer"
                                          title="Click to insert code and verify"
                                        >
                                          {regDeliveryNotice.fallbackOtp} (Click to Auto-Verify)
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="flex justify-center gap-1.5 sm:gap-2 py-1">
                                  {regOtpDigits.map((digit, idx) => (
                                    <input
                                      key={idx}
                                      ref={regOtpInputRefs[idx]}
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={1}
                                      value={digit}
                                      onChange={(e) => handleRegOtpDigitChange(idx, e.target.value)}
                                      onKeyDown={(e) => handleRegOtpKeyDown(idx, e)}
                                      onPaste={handleRegOtpPaste}
                                      className={`w-8 sm:w-9 h-10 text-center text-sm sm:text-base font-mono font-bold rounded-lg border transition outline-none shadow-xs ${
                                        digit
                                          ? 'bg-white border-blue-500 text-blue-700 ring-1 ring-blue-400'
                                          : 'bg-white border-gray-300 text-gray-900 focus:border-blue-600'
                                      }`}
                                    />
                                  ))}
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-gray-500">
                                  <span>Enter the 6-digit code to verify your corporate work email.</span>
                                  {regOtpVerifying && (
                                    <span className="text-blue-600 font-medium animate-pulse">Verifying...</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Verified Confirmation */}
                            {regOtpVerified && (
                              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span>Corporate email verified. You will be logged in automatically upon launch.</span>
                              </div>
                            )}
                          </div>

                          {/* Industrial Admin Job Title & Emergency Contact */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label htmlFor="reg-admin-title" className="block text-xs font-semibold text-[#1A202C] mb-1">
                                JOB TITLE / ROLE DESIGNATION *
                              </label>
                              <div className="relative">
                                <Briefcase className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5 pointer-events-none" />
                                <input
                                  id="reg-admin-title"
                                  type="text"
                                  required
                                  placeholder="e.g. Plant Security Administrator"
                                  value={adminJobTitle}
                                  onChange={(e) => setAdminJobTitle(e.target.value)}
                                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                                />
                              </div>
                            </div>

                            <div>
                              <label htmlFor="reg-admin-phone" className="block text-xs font-semibold text-[#1A202C] mb-1">
                                24/7 EMERGENCY CONTACT (OPTIONAL)
                              </label>
                              <div className="relative">
                                <Phone className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5 pointer-events-none" />
                                <input
                                  id="reg-admin-phone"
                                  type="tel"
                                  placeholder="+1 (555) 019-2831"
                                  value={emergencyPhone}
                                  onChange={(e) => setEmergencyPhone(e.target.value)}
                                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] font-mono focus:border-[#2563EB]"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label htmlFor="reg-admin-pass" className="block text-xs font-semibold text-[#1A202C]">
                                  PASSWORD *
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowAdminPass(!showAdminPass)}
                                  className="text-[10px] text-gray-500 hover:text-gray-800"
                                >
                                  {showAdminPass ? 'Hide' : 'Show'}
                                </button>
                              </div>
                              <input
                                id="reg-admin-pass"
                                type={showAdminPass ? 'text' : 'password'}
                                required
                                placeholder="••••••••••••"
                                value={adminPassword}
                                onChange={(e) => setAdminPassword(e.target.value)}
                                className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                              />
                            </div>

                            <div>
                              <label htmlFor="reg-admin-confirm" className="block text-xs font-semibold text-[#1A202C] mb-1">
                                CONFIRM PASSWORD *
                              </label>
                              <input
                                id="reg-admin-confirm"
                                type={showAdminPass ? 'text' : 'password'}
                                required
                                placeholder="••••••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] rounded-md text-xs text-[#1A202C] focus:border-[#2563EB]"
                              />
                            </div>
                          </div>

                          <PasswordStrengthMeter password={adminPassword} />

                          {/* Legal Agreements */}
                          <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={termsAccepted}
                                onChange={(e) => setTermsAccepted(e.target.checked)}
                                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>
                                I agree to the <span className="text-blue-600 underline">Terms of Service</span> and industrial service level agreement.
                              </span>
                            </label>
                            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={privacyAccepted}
                                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>
                                I agree to the <span className="text-blue-600 underline">Privacy Policy</span> and data sovereignty principles.
                              </span>
                            </label>
                          </div>

                          {/* Dedicated Step 2 Error Notification Banner */}
                          {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                              <span className="flex-1 font-medium">{error}</span>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setRegStep(1)}
                              className="py-2 sm:py-2.5 px-3 sm:px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-lg transition"
                            >
                              Back
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="flex-1 py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                            >
                              {submitting 
                                ? 'Provisioning Tenant Organization...' 
                                : (deploymentType === 'enterprise' ? 'Register Company & View Setup Guide' : 'Register Company & Launch')}
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Common Bottom Link for Registration */}
                  <div className="pt-3 border-t border-[#E2E8F0] text-center">
                    <span className="text-xs text-gray-500">Already registered? </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2"
                    >
                      Existing account? Sign in
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* SUB-VIEW 7B: Enterprise On-Premises Setup Guide */}
              {/* ============================================================ */}
              {mode === 'enterprise-setup' && enterpriseSetupData && (
                <div className="space-y-4">
                  {/* Success & Status Banner */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center flex-shrink-0 text-emerald-700">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-emerald-950">
                            Enterprise Organization Registered
                          </h3>
                          <span className="px-2 py-0.5 bg-emerald-200/70 text-emerald-800 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider">
                            On-Premises / Air-Gapped
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 leading-relaxed">
                          Your enterprise workspace has been provisioned. Follow the instructions below to install and deploy your on-premises edge node or industrial server.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Organization Workspace Card */}
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 font-bold">
                      WORKSPACE CREDENTIALS & METADATA
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 bg-white border border-gray-200 rounded-lg">
                        <div className="text-[10px] uppercase font-mono text-gray-400">Company Name</div>
                        <div className="font-semibold text-gray-900 truncate mt-0.5">{enterpriseSetupData.orgName}</div>
                      </div>
                      <div className="p-2.5 bg-white border border-gray-200 rounded-lg">
                        <div className="text-[10px] uppercase font-mono text-gray-400">Workspace Identifier</div>
                        <div className="font-mono font-semibold text-blue-600 truncate mt-0.5">{enterpriseSetupData.slug}</div>
                      </div>
                      <div className="p-2.5 bg-white border border-gray-200 rounded-lg">
                        <div className="text-[10px] uppercase font-mono text-gray-400">Root Administrator</div>
                        <div className="font-mono text-gray-800 truncate mt-0.5">{enterpriseSetupData.adminEmail}</div>
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Automated Script Installation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-blue-600" />
                        <span>QUICK INSTALL (LINUX / DOCKER / ON-PREMISES SERVER)</span>
                      </label>
                      <span className="text-[10px] font-mono text-gray-500">Bash / Shell</span>
                    </div>
                    <div className="relative bg-[#0F172A] border border-gray-800 rounded-xl p-3.5 text-left font-mono text-xs text-emerald-400 shadow-inner group">
                      <div className="pr-16 break-all select-all leading-relaxed">
                        curl -sSL https://get.forgex.internal/enterprise/install.sh | bash -s -- --workspace="{enterpriseSetupData.slug}" --admin="{enterpriseSetupData.adminEmail}"
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const cmd = `curl -sSL https://get.forgex.internal/enterprise/install.sh | bash -s -- --workspace="${enterpriseSetupData.slug}" --admin="${enterpriseSetupData.adminEmail}"`;
                          navigator.clipboard.writeText(cmd);
                          setCopiedCmd(true);
                          setTimeout(() => setCopiedCmd(false), 2500);
                        }}
                        className="absolute right-2.5 top-2.5 py-1 px-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-[11px] flex items-center gap-1 border border-gray-700 transition"
                      >
                        {copiedCmd ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-sans">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="font-sans">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Run this script on your local server. It installs the ForgeX Edge Daemon, configures isolation boundaries, and links to your workspace slug.
                    </p>
                  </div>

                  {/* Section 2: Deployment Specifications Grid */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-purple-600" />
                      <span>RECOMMENDED HARDWARE & NETWORK PREREQUISITES</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          Host Compute & Storage
                        </div>
                        <ul className="text-[11px] text-gray-600 space-y-0.5 list-disc list-inside">
                          <li>Minimum 4 vCPUs (x86_64 or ARM64)</li>
                          <li>16 GB RAM (ECC Recommended)</li>
                          <li>100 GB NVMe / SSD for telemetry</li>
                          <li>Ubuntu 22.04 LTS / RHEL 9 / Docker</li>
                        </ul>
                      </div>

                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          SCADA & Industrial Connectors
                        </div>
                        <ul className="text-[11px] text-gray-600 space-y-0.5 list-disc list-inside">
                          <li>Port 4000: API & OPC-UA Ingestion</li>
                          <li>Port 5173: Industrial Web Console</li>
                          <li>Modbus TCP / Siemens S7 / MQTT</li>
                          <li>100% Air-Gapped Subnet Supported</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Action Buttons */}
                  <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const content = `# ForgeX Enterprise On-Premises Deployment Guide
# Organization: ${enterpriseSetupData.orgName}
# Workspace Slug: ${enterpriseSetupData.slug}
# Root Administrator: ${enterpriseSetupData.adminEmail}
# Date: ${new Date().toISOString()}

## 1. Quick Start Installation
Run the following automated installation script on your target Linux or VM host:
\`\`\`bash
curl -sSL https://get.forgex.internal/enterprise/install.sh | bash -s -- --workspace="${enterpriseSetupData.slug}" --admin="${enterpriseSetupData.adminEmail}"
\`\`\`

## 2. Docker Deployment
Alternatively, launch using Docker:
\`\`\`bash
docker run -d \\
  --name forgex-enterprise \\
  --restart unless-stopped \\
  -p 4000:4000 \\
  -p 5173:5173 \\
  -e WORKSPACE_SLUG="${enterpriseSetupData.slug}" \\
  -e ADMIN_EMAIL="${enterpriseSetupData.adminEmail}" \\
  -v forgex-data:/data \\
  forgex/enterprise:latest
\`\`\`

## 3. Recommended Hardware Specifications
- CPU: Minimum 4 vCPUs (x86_64 or ARM64)
- RAM: Minimum 16 GB ECC RAM
- Storage: 100 GB NVMe / SSD for high-throughput time-series telemetry
- OS: Ubuntu 22.04 LTS, RHEL 8/9, Rocky Linux 9, or Windows Server 2022 with Docker

## 4. Network & Industrial SCADA Ports
- Port 4000: API, Telemetry Ingestion, OPC-UA, Modbus TCP gateway
- Port 5173: Industrial Web Console (HTTPS recommended via reverse proxy)
- Local Air-Gapped Mode: Supported with zero external internet dependencies

## 5. Support & Assistance
Enterprise Support: enterprise-support@forgex.internal
Emergency Hotline: 24/7 dedicated enterprise response desk
`;
                          const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `forgex-enterprise-setup-${enterpriseSetupData.slug}.md`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        }}
                        className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Setup Guide (.md)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSuccess?.(enterpriseSetupData.role || 'ORGANIZATION_OWNER');
                          if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/dashboard');
                            window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'overview' } }));
                          }
                        }}
                        className="flex-1 py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
                      >
                        <span>Proceed to Enterprise Console</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setError(null);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Sign in later with administrator credentials
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* ============================================================ */}
              {/* SUB-VIEW 8: Main Login Tabs & Forms (Section 1 & 2) */}
              {/* ============================================================ */}
              {mode === 'login' && (
                <>
                  {/* Unlinked Identity Alert Notice */}
                  {unlinkedUserNotice && (
                    <div className="p-3.5 mb-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 font-bold text-xs">
                          {unlinkedUserNotice.provider === 'google' ? <GoogleIcon className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-gray-900">
                            Verified Identity: <span className="font-mono text-blue-600">{unlinkedUserNotice.email}</span>
                          </h4>
                          <p className="text-[11px] text-gray-600 leading-relaxed">
                            Your identity is verified, but you have no active organization workspace. If you are an administrator, register your company. If an employee, please contact your site supervisor for an invitation.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-blue-200">
                        <button
                          type="button"
                          onClick={() => {
                            if (unlinkedUserNotice.provider === 'google') {
                              setRegPath('google');
                              setRegGoogleAdmin({
                                email: unlinkedUserNotice.email,
                                fullName: unlinkedUserNotice.fullName || unlinkedUserNotice.email.split('@')[0],
                                googleId: unlinkedUserNotice.googleId || `google-user-${Date.now()}`,
                              });
                              setAdminWorkEmail(unlinkedUserNotice.email);
                              setAdminFullName(unlinkedUserNotice.fullName || unlinkedUserNotice.email.split('@')[0]);
                            } else {
                              setRegPath('password');
                              setRegOtpSent(true);
                              setRegOtpVerified(true);
                              setAdminWorkEmail(unlinkedUserNotice.email);
                              setAdminFullName(unlinkedUserNotice.fullName || unlinkedUserNotice.email.split('@')[0]);
                            }
                            setMode('register');
                            setRegStep(1);
                            setUnlinkedUserNotice(null);
                          }}
                          className="py-1.5 px-3 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-lg transition shadow-sm"
                        >
                          Register Company
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('factory-code');
                            setUnlinkedUserNotice(null);
                          }}
                          className="py-1.5 px-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition"
                        >
                          Factory Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnlinkedUserNotice(null)}
                          className="py-1.5 px-2 text-xs text-gray-500 hover:text-gray-700 ml-auto"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Primary Authentication Choices: Google & Email OTP (Section 2) */}
                  <div className="space-y-2.5 mb-5">
                    {/* Option 1: Continue with Google */}
                    {googleConfig.configured ? (
                      <button
                        type="button"
                        onClick={handleStartGoogleAuth}
                        disabled={googleSubmitting}
                        className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 border border-[#CBD5E1] text-[#1A202C] font-semibold text-xs rounded-xl flex items-center justify-center gap-2.5 transition shadow-xs hover:border-gray-400"
                      >
                        <GoogleIcon className="w-4 h-4" />
                        <span>{googleSubmitting ? 'Authenticating with Google...' : 'Continue with Google'}</span>
                      </button>
                    ) : (
                      <div className="w-full py-2 px-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <GoogleIcon className="w-3.5 h-3.5 opacity-50" />
                          <span className="text-[11px]">Google OAuth (Not configured for this deployment)</span>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">Offline</span>
                      </div>
                    )}

                    {/* Segmented Auth Method Switcher */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-100 rounded-xl border border-gray-200 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMethod('credentials');
                          setError(null);
                        }}
                        className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                          loginMethod === 'credentials'
                            ? 'bg-white text-gray-900 shadow-xs border border-gray-200'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Lock className={`w-3.5 h-3.5 ${loginMethod === 'credentials' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span>Work Password</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMethod('otp');
                          setError(null);
                        }}
                        className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                          loginMethod === 'otp'
                            ? 'bg-white text-gray-900 shadow-xs border border-gray-200'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Mail className={`w-3.5 h-3.5 ${loginMethod === 'otp' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span>Email OTP</span>
                      </button>
                    </div>
                  </div>

                  {/* EMAIL OTP FLOW */}
                  {loginMethod === 'otp' && (
                    <div className="space-y-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl mb-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                            {otpStep === 'enter-email' ? '1' : '2'}
                          </div>
                          <span className="text-xs font-bold text-gray-900">
                            {otpStep === 'enter-email' ? 'Passwordless Email Login' : 'Enter 6-Digit Passcode'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLoginMethod('credentials')}
                          className="text-[11px] text-gray-500 hover:text-gray-800 transition underline"
                        >
                          Use Password / Badge
                        </button>
                      </div>

                      {otpStep === 'enter-email' ? (
                        <form onSubmit={handleSendLoginOtp} className="space-y-3">
                          <div>
                            <label htmlFor="otp-login-email" className="block text-[11px] font-semibold text-gray-700 mb-1">
                              REGISTERED WORK EMAIL
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                              <input
                                id="otp-login-email"
                                type="email"
                                required
                                placeholder="user@plant.industrial"
                                value={otpEmail}
                                onChange={(e) => setOtpEmail(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs text-gray-900 focus:outline-none focus:border-blue-600 shadow-xs font-sans"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={otpSubmitting || !otpEmail.includes('@') || otpCooldown > 0}
                            className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                          >
                            {otpSubmitting ? 'Sending Code...' : otpCooldown > 0 ? `Wait ${otpCooldown}s to Resend` : 'Send Verification OTP'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyLoginOtp} className="space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">
                              Sent to: <strong className="text-gray-900 font-mono">{otpEmail}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setOtpStep('enter-email')}
                              className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold transition"
                            >
                              Change Email
                            </button>
                          </div>

                          {deliveryNotice && (
                            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1">
                              <div className="flex items-start gap-1.5 font-semibold text-amber-950 text-[11px]">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <span>{deliveryNotice.warning}</span>
                              </div>
                              {deliveryNotice.fallbackOtp && (
                                <div className="mt-1 pt-1 border-t border-amber-200 flex items-center justify-between text-[11px]">
                                  <span className="text-amber-800">Sandbox Testing Code:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const digits = deliveryNotice.fallbackOtp!.split('');
                                      setOtpDigits(digits);
                                    }}
                                    className="font-mono font-bold bg-amber-200/80 px-2 py-0.5 rounded text-amber-950 hover:bg-amber-300 transition"
                                    title="Click to insert code"
                                  >
                                    {deliveryNotice.fallbackOtp} (Click to insert)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-700 mb-1.5 text-center font-mono">
                              ENTER 6-DIGIT SINGLE-USE CODE
                            </label>
                            <div className="flex justify-center gap-1.5 sm:gap-2 py-1">
                              {otpDigits.map((digit, idx) => (
                                <input
                                  key={idx}
                                  ref={otpInputRefs[idx]}
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={1}
                                  value={digit}
                                  onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                  onPaste={handleOtpPaste}
                                  className={`w-8 sm:w-10 h-10 sm:h-11 text-center text-base sm:text-lg font-mono font-bold rounded-lg border transition outline-none shadow-xs ${
                                    digit
                                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                                      : 'bg-white border-gray-300 text-gray-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                            <button
                              type="button"
                              onClick={handleSendLoginOtp}
                              disabled={otpCooldown > 0 || otpSubmitting}
                              className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend Code'}</span>
                            </button>
                            <span>Expires in 10 minutes</span>
                          </div>

                          <button
                            type="submit"
                            disabled={otpSubmitting || otpDigits.join('').length !== 6}
                            className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                          >
                            {otpSubmitting ? 'Verifying Code...' : 'Verify OTP & Enter Workspace'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* CREDENTIALS FLOW (PASSWORD & WORKER BADGE) */}
                  {loginMethod === 'credentials' && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-white px-2 text-gray-400 font-mono text-[10px] uppercase">
                            PASSWORD & SHOP-FLOOR CREDENTIALS
                          </span>
                        </div>
                      </div>

                    {/* Single Unified Industrial Sign-In Form (Admin, Engineer, Technician, Worker) */}
                    <form onSubmit={handleAdminSubmit} className="space-y-4" noValidate>
                      <div>
                        <label htmlFor="admin-email" className="block text-xs font-semibold text-[#1A202C] mb-1.5 flex items-center justify-between">
                          <span>WORK EMAIL OR RFID / BADGE ID</span>
                          <span className="text-[10px] text-gray-500 font-normal">Tap RFID Card or type Email / ID</span>
                        </label>
                        <div className="relative">
                          <CreditCard className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="admin-email"
                            type="text"
                            required
                            disabled={submitting}
                            placeholder="admin@yourcompany.com or RFID-1049"
                            value={identifier}
                            onChange={(e) => {
                              setIdentifier(e.target.value);
                              setFieldErrors((prev) => ({ ...prev, identifier: '' }));
                            }}
                            className={inputCls}
                            autoComplete="username"
                          />
                        </div>
                        {fieldErrors.identifier && (
                          <p className="text-[11px] text-[#DC2626] mt-1 font-mono">{fieldErrors.identifier}</p>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label htmlFor="admin-password" className="block text-xs font-semibold text-[#1A202C]">
                            PASSWORD OR SECURITY PIN
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setMode('forgot-password');
                              setForgotStep('enter-email');
                            }}
                            className="text-xs text-[#2563EB] hover:text-blue-700 font-sans transition underline underline-offset-2"
                          >
                            Forgot Credentials?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="admin-password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            disabled={submitting}
                            placeholder="••••••••••••"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              setFieldErrors((prev) => ({ ...prev, password: '' }));
                            }}
                            className={inputCls + ' pr-10'}
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3 text-[#94A3B8] hover:text-[#475569] transition"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {fieldErrors.password && (
                          <p className="text-[11px] text-[#DC2626] mt-1 font-mono">{fieldErrors.password}</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full mt-2 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
                      >
                        {submitting ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            Authenticating Session...
                          </span>
                        ) : (
                          <>
                            Sign In to ForgeX AI
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  </>
                )}

                  {/* Actions / Sub-links */}
                  <div className="mt-5 pt-4 border-t border-[#E2E8F0] space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#64748B] flex-wrap gap-1.5">
                      <span>New factory or plant?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setRegStep(1);
                          setError(null);
                        }}
                        className="text-[#2563EB] hover:text-blue-700 font-semibold transition"
                      >
                        Register Your Company →
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#64748B] flex-wrap gap-1.5">
                      <span>Have a factory activation code?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('factory-code');
                          setError(null);
                        }}
                        className="text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1 transition"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Activate with Code</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer Help text */}
            <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-gray-50 border-t border-[#E2E8F0] text-center">
              <span className="text-xs text-[#64748B] font-sans">
                Need access? Contact your plant security administrator or site supervisor.
              </span>
            </div>
          </div>

          {/* Security notice */}
          <div className="mt-4 text-center text-[11px] text-gray-400 flex items-center justify-center gap-2 font-mono flex-wrap px-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Zero-Trust Industrial RBAC · SHA-256 Salted Credentials · Multi-Tenant Isolation</span>
          </div>
        </div>
      </div>
      {/* GOOGLE SIGN-IN MODAL (Supported for live OAuth fallback, testing, and dev) */}
      {googleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-sm w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <GoogleIcon className="w-5 h-5" />
                <h3 className="text-sm font-bold text-gray-900">Sign In with Google</h3>
              </div>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold px-1"
              >
                ✕
              </button>
            </div>

            {googleModalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{googleModalError}</span>
              </div>
            )}

            <p className="text-xs text-gray-600 leading-relaxed">
              Authenticate using Google OAuth 2.0. Choose an enterprise test identity or specify your authorized Google email:
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setGoogleModalError(null);
                  const email = 'admin.google@forgex.internal';
                  const fullName = 'Enterprise Google Admin';
                  const googleId = 'google-sub-admin-forgex';
                  if (mode === 'register') {
                    setRegGoogleAdmin({ email, fullName, googleId });
                    setAdminWorkEmail(email);
                    setAdminFullName(fullName);
                    setGoogleModalOpen(false);
                  } else {
                    handleCompleteGoogleLogin({ email, fullName, googleId });
                  }
                }}
                disabled={googleSubmitting}
                className="w-full py-2.5 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-left text-xs transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-gray-900">admin.google@forgex.internal</div>
                  <div className="text-[10px] text-gray-500">Authorized Company Administrator</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setGoogleModalError(null);
                  const email = 'worker.google@forgex.internal';
                  const fullName = 'Shopfloor Worker (Google)';
                  const googleId = 'google-sub-worker-forgex';
                  if (mode === 'register') {
                    setRegGoogleAdmin({ email, fullName, googleId });
                    setAdminWorkEmail(email);
                    setAdminFullName(fullName);
                    setGoogleModalOpen(false);
                  } else {
                    handleCompleteGoogleLogin({ email, fullName, googleId });
                  }
                }}
                disabled={googleSubmitting}
                className="w-full py-2.5 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-left text-xs transition flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-gray-900">worker.google@forgex.internal</div>
                  <div className="text-[10px] text-gray-500">Shop-Floor Worker (Preserved role)</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-white px-2 text-gray-400 font-mono">Or custom google account</span>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="email"
                placeholder="user@your-company.com"
                value={googleEmailInput}
                onChange={(e) => {
                  setGoogleEmailInput(e.target.value);
                  if (googleModalError) setGoogleModalError(null);
                }}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Display Name (optional)"
                value={googleFullNameInput}
                onChange={(e) => setGoogleFullNameInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={googleSubmitting}
                onClick={() => {
                  const email = googleEmailInput.trim().toLowerCase();
                  if (!email || !email.includes('@')) {
                    setGoogleModalError('Please enter a valid Google email address (e.g. alex@company.com).');
                    return;
                  }
                  setGoogleModalError(null);
                  const fullName = googleFullNameInput.trim() || email.split('@')[0];
                  const googleId = `google-sub-${Math.random().toString(36).substring(2, 10)}`;
                  if (mode === 'register') {
                    setRegGoogleAdmin({ email, fullName, googleId });
                    setAdminWorkEmail(email);
                    setAdminFullName(fullName);
                    setGoogleModalOpen(false);
                  } else {
                    handleCompleteGoogleLogin({ email, fullName, googleId });
                  }
                }}
                className="w-full py-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
              >
                {googleSubmitting ? 'Authenticating...' : 'Continue with this Google Identity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

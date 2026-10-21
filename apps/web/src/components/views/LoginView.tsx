import React, { useState, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  Building2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Lock,
  Mail,
  User as UserIcon,
  CreditCard,
  AlertTriangle,
  Server,
  Cloud,
  CheckCircle2,
  Cpu,
  FileCode,
  Copy,
  Check,
  Eye,
  EyeOff,
  Wrench,
  HardHat,
  Shield,
  Delete,
  Info,
} from 'lucide-react';

interface LoginViewProps {
  onSuccess?: (role?: string) => void;
}

type RoleMode = 'admin' | 'worker' | 'technician';

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { login, loginWithBadge, registerOrg } = useAuth();

  // Multi-Role UI convenience mode
  const [roleMode, setRoleMode] = useState<RoleMode>('admin');
  const [isRegistering, setIsRegistering] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form Fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Worker Badge & PIN State
  const [badgeCode, setBadgeCode] = useState('');
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState('PLANT-TX-04');

  // Technician combined field
  const [techIdentifier, setTechIdentifier] = useState('');
  const [techSecret, setTechSecret] = useState('');
  const [showTechSecret, setShowTechSecret] = useState(false);

  // Status & Validation
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [forgotPasswordNotice, setForgotPasswordNotice] = useState<string | null>(null);

  // PIN input refs
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Tenant Registration State
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [plantName, setPlantName] = useState('Texas Petrochemical Refinery Train 4');
  const [plantCode, setPlantCode] = useState('PLANT-TX-04');
  const [deploymentMode, setDeploymentMode] = useState<'saas' | 'enterprise'>('saas');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // PIN helper logic
  const getCombinedPin = () => pinDigits.join('');

  const handlePinChange = (index: number, val: string) => {
    const char = val.slice(-1);
    if (!/^\d*$/.test(char)) return;

    const newDigits = [...pinDigits];
    newDigits[index] = char;
    setPinDigits(newDigits);
    setFieldErrors((prev) => ({ ...prev, pin: '' }));

    if (char && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const handleKeypadPress = (digit: string) => {
    const firstEmpty = pinDigits.findIndex((d) => !d);
    if (firstEmpty !== -1) {
      const newDigits = [...pinDigits];
      newDigits[firstEmpty] = digit;
      setPinDigits(newDigits);
      setFieldErrors((prev) => ({ ...prev, pin: '' }));
      if (firstEmpty < 3) {
        pinInputRefs[firstEmpty + 1].current?.focus();
      }
    }
  };

  const handleKeypadBackspace = () => {
    const lastFilled = [...pinDigits].reverse().findIndex((d) => !!d);
    if (lastFilled !== -1) {
      const actualIndex = 3 - lastFilled;
      const newDigits = [...pinDigits];
      newDigits[actualIndex] = '';
      setPinDigits(newDigits);
      pinInputRefs[actualIndex].current?.focus();
    }
  };

  const handleKeypadClear = () => {
    setPinDigits(['', '', '', '']);
    pinInputRefs[0].current?.focus();
  };

  // Switch role mode and reset errors
  const handleRoleSwitch = (mode: RoleMode) => {
    setRoleMode(mode);
    setError(null);
    setFieldErrors({});
    setForgotPasswordNotice(null);
  };

  // Form Submission Handlers
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    const errors: Record<string, string> = {};

    if (!identifier.trim()) {
      errors.identifier = 'Work email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) {
      errors.identifier = 'Please provide a valid work email format (user@domain.com).';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await login(identifier.trim(), password);
      if (res.success) {
        onSuccess?.(res.role);
      } else {
        setError(res.error || 'Invalid login credentials. Please check your email and password.');
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication service unreachable. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    const errors: Record<string, string> = {};
    const fullPin = getCombinedPin();

    if (!badgeCode.trim()) {
      errors.badgeCode = 'Employee Badge ID is required.';
    }

    if (fullPin.length < 4) {
      errors.pin = 'Please enter all 4 digits of your security PIN.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginWithBadge(badgeCode.trim().toUpperCase(), fullPin);
      if (res.success) {
        onSuccess?.(res.role);
      } else {
        setError(res.error || 'Invalid login credentials. Please verify your badge identifier and PIN.');
        setPinDigits(['', '', '', '']);
        pinInputRefs[0].current?.focus();
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication service unreachable.');
      setPinDigits(['', '', '', '']);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTechnicianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    const errors: Record<string, string> = {};

    if (!techIdentifier.trim()) {
      errors.techIdentifier = 'Technician ID or work email is required.';
    }

    if (!techSecret) {
      errors.techSecret = 'Password or security PIN is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // Determine if identifier is badge format or email format
      const isBadge = techIdentifier.trim().toUpperCase().startsWith('BADGE-') ||
                      techIdentifier.trim().toUpperCase().startsWith('EMP-') ||
                      (!techIdentifier.includes('@') && /^\d+$/.test(techSecret.trim()));

      let res;
      if (isBadge) {
        res = await loginWithBadge(techIdentifier.trim().toUpperCase(), techSecret.trim());
        if (!res.success && techIdentifier.includes('@')) {
          res = await login(techIdentifier.trim(), techSecret);
        }
      } else {
        res = await login(techIdentifier.trim(), techSecret);
      }

      if (res.success) {
        onSuccess?.(res.role);
      } else {
        setError(res.error || 'Invalid login credentials. Please verify your technician credentials.');
        setTechSecret('');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication service unreachable.');
      setTechSecret('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    setForgotPasswordNotice('Password reset requests must be submitted directly to your plant security administrator or authorized site IT coordinator.');
  };

  // Workspace Registration Handlers
  const handleOrgNameChange = (val: string) => {
    setOrgName(val);
    const generatedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setOrgSlug(generatedSlug);
  };

  const handleFinalRegister = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const ok = await registerOrg({
        organizationName: orgName,
        organizationSlug: orgSlug,
        adminEmail: identifier,
        adminFullName,
        password,
      });
      if (ok) onSuccess?.('ORGANIZATION_OWNER');
      else setError('Registration failed. Check if organization slug is already claimed.');
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const dockerComposeSnippet = `version: '3.8'
services:
  forgex-ai-core:
    image: ghcr.io/forgex-ai/platform:v1.4.2-enterprise
    container_name: forgex_core
    restart: always
    environment:
      - DEPLOYMENT_MODE=ENTERPRISE_AIR_GAPPED
      - INFERENCE_PROVIDER=OLLAMA
      - OLLAMA_HOST=http://host.docker.internal:11434
      - ORGANIZATION_SLUG=${orgSlug || 'apex-energy-tx'}
      - PRIMARY_PLANT_CODE=${plantCode || 'PLANT-TX-04'}
    ports:
      - "8080:8080"
    volumes:
      - ./data/forgex:/var/lib/forgex/storage`;

  const copySnippet = () => {
    navigator.clipboard.writeText(dockerComposeSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const inputCls =
    'w-full pl-9 pr-3 py-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-md text-sm text-[#1A202C] placeholder-[#94A3B8] outline-none transition font-sans shadow-sm disabled:opacity-50 disabled:bg-gray-50';

  return (
    <div
      className="min-h-screen w-screen flex select-none"
      style={{ background: '#F5F6F7' }}
    >
      {/* Left branding panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[440px] shrink-0 p-10 relative overflow-hidden"
        style={{
          background: '#151C24',
          borderRight: '1px solid #243145',
        }}
      >
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#38BDF8 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top Logo & Heading */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <img
              src="/forgex_logo_dark.png"
              alt="4JX AI ForgeX"
              className="h-10 w-auto object-contain filter drop-shadow-md"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/30 text-[#60A5FA] text-xs font-mono mb-4">
            <Cpu className="w-3.5 h-3.5" />
            <span>Industrial Engineering Intelligence</span>
          </div>

          <h1 className="text-2xl font-bold text-[#F8FAFC] leading-tight mb-3 font-sans">
            Evidence-Grounded<br />Plant Operations & Safety
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Every diagnosis and work order is strictly grounded in verified OEM manuals, P&ID schematics, and vibration telemetry — isolated by multi-tenant RBAC.
          </p>

          {/* Core Principles */}
          <div className="mt-8 space-y-3.5">
            {[
              { title: 'Multi-Role Shop Floor Isolation', desc: 'Strict RBAC separating Plant Overview, Technician Queue, and Operator SOP Execution.' },
              { title: 'Evidence Before Action', desc: 'Zero unverified hallucination. Multi-tier citation model with direct PDF page schematics.' },
              { title: 'Air-Gapped & Rugged Ready', desc: 'Engineered for shop-floor touch terminals, high ambient noise, and field telemetry.' },
              { title: 'ISO 55001 & OSHA 1910.147 Certified', desc: 'Lockout/tagout enforcement and immutable audit ledger tracking every action.' },
            ].map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5 text-blue-400 text-xs font-mono font-bold">
                  {i + 1}
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F8FAFC]">{p.title}</div>
                  <div className="text-[11px] text-[#94A3B8] leading-normal">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom certification badge */}
        <div className="relative z-10 flex items-center gap-2.5 p-3 rounded-lg bg-white/5 border border-white/10">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-[#94A3B8] leading-tight font-mono">
            Safety Compliant · PIN Salt Hashed · Monitored Audit Ledger
          </span>
        </div>
      </div>

      {/* Right: Clean White Auth form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 overflow-y-auto">
        {/* Mobile branding */}
        <div className="lg:hidden flex items-center gap-2 mb-6">
          <img
            src="/forgex_logo_transparent.png"
            alt="4JX AI ForgeX"
            className="h-8 w-auto object-contain"
          />
        </div>

        <div className="w-full max-w-lg">
          {/* Card */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            {/* Card header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#E2E8F0]">
              <h2 className="text-xl font-bold text-[#1A202C] font-sans">
                {isRegistering ? 'Create Factory Organization' : 'Welcome Back'}
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5 font-sans">
                {isRegistering
                  ? `Step ${step} of 4: Setup your factory workspace and enterprise administrator.`
                  : 'Sign in to access your factory workspace.'}
              </p>
            </div>

            <div className="p-6">
              {/* If not registering, show the 3-Way Segmented Role Selector */}
              {!isRegistering ? (
                <>
                  <div
                    role="tablist"
                    aria-label="Login Identity Modes"
                    className="flex bg-[#F1F5F9] p-1 rounded-lg mb-5 border border-[#E2E8F0]"
                  >
                    {[
                      { key: 'admin', label: 'Admin', icon: <Shield className="w-3.5 h-3.5 text-blue-600" /> },
                      { key: 'worker', label: 'Worker', icon: <HardHat className="w-3.5 h-3.5 text-emerald-600" /> },
                      { key: 'technician', label: 'Technician', icon: <Wrench className="w-3.5 h-3.5 text-amber-600" /> },
                    ].map((t) => (
                      <button
                        key={t.key}
                        role="tab"
                        aria-selected={roleMode === t.key}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleRoleSwitch(t.key as RoleMode)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
                          roleMode === t.key
                            ? 'bg-white text-[#1A202C] shadow-sm border border-[#E2E8F0]'
                            : 'text-[#64748B] hover:text-[#1A202C]'
                        }`}
                      >
                        {t.icon}
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Server error banner */}
                  {error && (
                    <div
                      role="alert"
                      id="auth-error-desc"
                      className="mb-4 p-3 rounded-lg bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-xs flex items-start gap-2 shadow-sm animate-fade-in"
                    >
                      <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <strong className="block font-semibold text-[#B91C1C] font-mono text-[11px] uppercase tracking-wider mb-0.5">
                          Authentication Error
                        </strong>
                        <span>{error}</span>
                      </div>
                    </div>
                  )}

                  {/* Forgot Password Notice banner */}
                  {forgotPasswordNotice && (
                    <div
                      role="status"
                      className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-start gap-2 shadow-sm"
                    >
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <strong className="block font-semibold text-blue-900 font-mono text-[11px] uppercase tracking-wider mb-0.5">
                          Security Notice
                        </strong>
                        <span>{forgotPasswordNotice}</span>
                      </div>
                    </div>
                  )}

                  {/* 1. ADMIN TAB */}
                  {roleMode === 'admin' && (
                    <form onSubmit={handleAdminSubmit} className="space-y-4" noValidate>
                      <div>
                        <label htmlFor="admin-email" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          ADMIN WORK EMAIL
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="admin-email"
                            type="email"
                            required
                            disabled={submitting}
                            placeholder="admin@forgex.industrial"
                            value={identifier}
                            onChange={(e) => {
                              setIdentifier(e.target.value);
                              setFieldErrors((prev) => ({ ...prev, identifier: '' }));
                            }}
                            aria-invalid={!!fieldErrors.identifier}
                            aria-describedby={fieldErrors.identifier ? 'admin-email-err' : undefined}
                            className={inputCls}
                            autoComplete="username"
                          />
                        </div>
                        {fieldErrors.identifier && (
                          <p id="admin-email-err" className="text-[11px] text-[#DC2626] mt-1 font-mono">
                            {fieldErrors.identifier}
                          </p>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label htmlFor="admin-password" className="block text-xs font-semibold text-[#1A202C]">
                            PASSWORD
                          </label>
                          <a
                            href="#forgot-password"
                            onClick={handleForgotPassword}
                            className="text-xs text-[#2563EB] hover:text-blue-700 font-sans transition underline underline-offset-2"
                          >
                            Forgot Password?
                          </a>
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
                            aria-invalid={!!fieldErrors.password}
                            aria-describedby={fieldErrors.password ? 'admin-pass-err' : undefined}
                            className={inputCls + ' pr-10'}
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3 text-[#94A3B8] hover:text-[#475569] transition"
                            title={showPassword ? 'Hide password' : 'Show password'}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {fieldErrors.password && (
                          <p id="admin-pass-err" className="text-[11px] text-[#DC2626] mt-1 font-mono">
                            {fieldErrors.password}
                          </p>
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
                            Authenticating Admin Session...
                          </span>
                        ) : (
                          <>
                            Sign In as Administrator
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* 2. WORKER TAB */}
                  {roleMode === 'worker' && (
                    <form onSubmit={handleWorkerSubmit} className="space-y-4" noValidate>
                      <div>
                        <label htmlFor="worker-plant" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          ASSIGNED FACILITY / PLANT TERMINAL
                        </label>
                        <select
                          id="worker-plant"
                          value={selectedPlant}
                          disabled={submitting}
                          onChange={(e) => setSelectedPlant(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-md text-sm text-[#1A202C] transition font-sans disabled:opacity-50"
                        >
                          <option value="PLANT-TX-04">Deer Park Refinery (PLANT-TX-04) — Texas Primary Train</option>
                          <option value="PLANT-DE-02">Stuttgart Werk 2 (PLANT-DE-02) — High Pressure Assembly</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="worker-badge" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          EMPLOYEE BADGE IDENTIFIER (BARCODE / ID)
                        </label>
                        <div className="relative">
                          <CreditCard className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="worker-badge"
                            type="text"
                            required
                            disabled={submitting}
                            placeholder="BADGE-4091"
                            value={badgeCode}
                            onChange={(e) => {
                              setBadgeCode(e.target.value.toUpperCase());
                              setFieldErrors((prev) => ({ ...prev, badgeCode: '' }));
                            }}
                            aria-invalid={!!fieldErrors.badgeCode}
                            aria-describedby={fieldErrors.badgeCode ? 'worker-badge-err' : undefined}
                            className={inputCls + ' uppercase font-mono tracking-wider'}
                            autoComplete="off"
                          />
                        </div>
                        {fieldErrors.badgeCode && (
                          <p id="worker-badge-err" className="text-[11px] text-[#DC2626] mt-1 font-mono">
                            {fieldErrors.badgeCode}
                          </p>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label id="worker-pin-label" className="block text-xs font-semibold text-[#1A202C]">
                            4-DIGIT SECURITY PIN
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setShowPin(!showPin)}
                              className="text-[11px] text-[#64748B] hover:text-[#1A202C] flex items-center gap-1 font-sans transition"
                              aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                            >
                              {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              {showPin ? 'Hide' : 'Show'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowKeypad(!showKeypad)}
                              className="text-[11px] text-[#2563EB] hover:text-blue-700 flex items-center gap-1 font-sans transition font-medium"
                              aria-label="Toggle on-screen touch keypad"
                            >
                              ⌨ {showKeypad ? 'Hide Keypad' : 'Touch Keypad'}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-3 py-2" aria-labelledby="worker-pin-label">
                          {pinDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              id={`pin-box-${idx}`}
                              ref={pinInputRefs[idx]}
                              type={showPin ? 'text' : 'password'}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              disabled={submitting}
                              value={digit}
                              onChange={(e) => handlePinChange(idx, e.target.value)}
                              onKeyDown={(e) => handlePinKeyDown(idx, e)}
                              aria-label={`PIN Digit ${idx + 1}`}
                              className={`w-14 h-14 text-center text-xl font-mono font-bold rounded-lg border transition outline-none shadow-sm disabled:opacity-50 ${
                                digit
                                  ? 'bg-blue-50 border-blue-500 text-blue-600'
                                  : 'bg-white border-[#CBD5E1] text-[#1A202C] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15'
                              }`}
                            />
                          ))}
                        </div>
                        {fieldErrors.pin && (
                          <p className="text-[11px] text-[#DC2626] mt-1 font-mono text-center">
                            {fieldErrors.pin}
                          </p>
                        )}
                      </div>

                      {/* On-Screen Touch Keypad */}
                      {showKeypad && (
                        <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] animate-fade-in">
                          <div className="text-[10px] font-mono text-[#64748B] mb-2 text-center uppercase tracking-wider">
                            Shop Floor Touchscreen Keypad
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                              <button
                                key={num}
                                type="button"
                                disabled={submitting}
                                onClick={() => handleKeypadPress(num)}
                                className="py-3 bg-white hover:bg-gray-100 active:bg-blue-50 text-[#1A202C] font-mono font-bold text-base rounded-lg border border-[#CBD5E1] transition shadow-sm disabled:opacity-50"
                              >
                                {num}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={handleKeypadClear}
                              className="py-3 bg-white hover:bg-red-50 text-red-600 font-mono text-xs rounded-lg border border-[#CBD5E1] transition uppercase disabled:opacity-50"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleKeypadPress('0')}
                              className="py-3 bg-white hover:bg-gray-100 active:bg-blue-50 text-[#1A202C] font-mono font-bold text-base rounded-lg border border-[#CBD5E1] transition shadow-sm disabled:opacity-50"
                            >
                              0
                            </button>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={handleKeypadBackspace}
                              className="py-3 bg-white hover:bg-gray-100 text-[#1A202C] font-mono flex items-center justify-center rounded-lg border border-[#CBD5E1] transition disabled:opacity-50"
                              aria-label="Backspace"
                            >
                              <Delete className="w-4 h-4 text-gray-600" />
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full mt-2 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
                      >
                        {submitting ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            Verifying Operator Badge...
                          </span>
                        ) : (
                          <>
                            Authenticate Badge & Access
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* 3. TECHNICIAN TAB */}
                  {roleMode === 'technician' && (
                    <form onSubmit={handleTechnicianSubmit} className="space-y-4" noValidate>
                      <div>
                        <label htmlFor="tech-identifier" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          TECHNICIAN ID OR WORK EMAIL
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="tech-identifier"
                            type="text"
                            required
                            disabled={submitting}
                            placeholder="tech@forgex.industrial or BADGE-TECH-01"
                            value={techIdentifier}
                            onChange={(e) => {
                              setTechIdentifier(e.target.value);
                              setFieldErrors((prev) => ({ ...prev, techIdentifier: '' }));
                            }}
                            aria-invalid={!!fieldErrors.techIdentifier}
                            aria-describedby={fieldErrors.techIdentifier ? 'tech-id-err' : undefined}
                            className={inputCls}
                            autoComplete="username"
                          />
                        </div>
                        {fieldErrors.techIdentifier && (
                          <p id="tech-id-err" className="text-[11px] text-[#DC2626] mt-1 font-mono">
                            {fieldErrors.techIdentifier}
                          </p>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label htmlFor="tech-secret" className="block text-xs font-semibold text-[#1A202C]">
                            PASSWORD OR SECURITY PIN
                          </label>
                          <a
                            href="#forgot-password"
                            onClick={handleForgotPassword}
                            className="text-xs text-[#2563EB] hover:text-blue-700 font-sans transition underline underline-offset-2"
                          >
                            Forgot Credentials?
                          </a>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="tech-secret"
                            type={showTechSecret ? 'text' : 'password'}
                            required
                            disabled={submitting}
                            placeholder="••••••••"
                            value={techSecret}
                            onChange={(e) => {
                              setTechSecret(e.target.value);
                              setFieldErrors((prev) => ({ ...prev, techSecret: '' }));
                            }}
                            aria-invalid={!!fieldErrors.techSecret}
                            aria-describedby={fieldErrors.techSecret ? 'tech-sec-err' : undefined}
                            className={inputCls + ' pr-10'}
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => setShowTechSecret(!showTechSecret)}
                            className="absolute right-3 top-3 text-[#94A3B8] hover:text-[#475569] transition"
                            title={showTechSecret ? 'Hide secret' : 'Show secret'}
                            aria-label={showTechSecret ? 'Hide secret' : 'Show secret'}
                          >
                            {showTechSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {fieldErrors.techSecret && (
                          <p id="tech-sec-err" className="text-[11px] text-[#DC2626] mt-1 font-mono">
                            {fieldErrors.techSecret}
                          </p>
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
                            Authenticating Technician...
                          </span>
                        ) : (
                          <>
                            Sign In as Technician
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* Switch to workspace onboarding link */}
                  <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
                    <span>Need an enterprise factory workspace?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(true);
                        setError(null);
                        setFieldErrors({});
                      }}
                      className="text-[#2563EB] hover:text-blue-700 font-semibold transition"
                    >
                      Register Workspace →
                    </button>
                  </div>
                </>
              ) : (
                /* REGISTRATION 4-STEP WIZARD */
                <div>
                  <div className="flex items-center justify-between mb-5 px-1">
                    {[
                      { num: 1, label: 'Org' },
                      { num: 2, label: 'Admin' },
                      { num: 3, label: 'Plant' },
                      { num: 4, label: 'Deploy' },
                    ].map((s) => (
                      <div key={s.num} className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition ${
                            step === s.num
                              ? 'bg-[#151C24] text-white shadow-sm'
                              : step > s.num
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-gray-100 text-gray-400 border border-gray-200'
                          }`}
                        >
                          {step > s.num ? '✓' : s.num}
                        </div>
                        <span className={`text-xs font-medium hidden sm:inline ${step === s.num ? 'text-gray-900' : 'text-gray-400'}`}>
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Step 1: Org Details */}
                  {step === 1 && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="reg-org-name" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          ENTERPRISE LEGAL ENTITY NAME
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="reg-org-name"
                            type="text"
                            required
                            placeholder="e.g. Acme Industrial Works AG"
                            value={orgName}
                            onChange={(e) => handleOrgNameChange(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-org-slug" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          WORKSPACE SLUG (MULTI-TENANT ISOLATION)
                        </label>
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 bg-gray-100 border border-r-0 border-[#CBD5E1] px-2.5 py-2.5 rounded-l-md font-mono">
                            forgex.io/
                          </span>
                          <input
                            id="reg-org-slug"
                            type="text"
                            required
                            placeholder="acme-industrial"
                            value={orgSlug}
                            onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            className="flex-1 pr-3 py-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-r-md text-sm text-[#1A202C] placeholder-[#94A3B8] outline-none transition font-mono shadow-sm px-3"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsRegistering(false)}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg flex items-center justify-center gap-1 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!orgName.trim() || !orgSlug.trim()) {
                              setError('Please provide organization name and slug.');
                              return;
                            }
                            setError(null);
                            setStep(2);
                          }}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm font-sans"
                        >
                          Continue to Admin Setup
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Administrator Account */}
                  {step === 2 && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="reg-admin-name" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          PRIMARY ADMINISTRATOR FULL NAME
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="reg-admin-name"
                            type="text"
                            required
                            placeholder="Jane Doe"
                            value={adminFullName}
                            onChange={(e) => setAdminFullName(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-admin-email" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          ADMIN BUSINESS EMAIL
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="reg-admin-email"
                            type="email"
                            required
                            placeholder="admin@yourcompany.com"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-admin-pass" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          ACCOUNT PASSWORD
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="reg-admin-pass"
                            type="password"
                            placeholder="••••••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg flex items-center justify-center gap-1 transition"
                        >
                          <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!adminFullName.trim() || !identifier.trim()) {
                              setError('Please provide admin full name and email.');
                              return;
                            }
                            setError(null);
                            setStep(3);
                          }}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm font-sans"
                        >
                          Continue to Plant Config
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Plant & Facility Details */}
                  {step === 3 && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="reg-plant-name" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          PRIMARY PLANT FACILITY NAME
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                          <input
                            id="reg-plant-name"
                            type="text"
                            required
                            placeholder="Stuttgart Werk 2 or Riverside Refining"
                            value={plantName}
                            onChange={(e) => setPlantName(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-plant-code" className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          PLANT CODE / SITE IDENTIFIER
                        </label>
                        <input
                          id="reg-plant-code"
                          type="text"
                          required
                          placeholder="PLANT-DE-02"
                          value={plantCode}
                          onChange={(e) => setPlantCode(e.target.value.toUpperCase())}
                          className={inputCls + ' uppercase font-mono'}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg flex items-center justify-center gap-1 transition"
                        >
                          <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!plantName.trim() || !plantCode.trim()) {
                              setError('Please provide plant name and code.');
                              return;
                            }
                            setError(null);
                            setStep(4);
                          }}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm font-sans"
                        >
                          Deployment Options
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Architecture Selection */}
                  {step === 4 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          onClick={() => setDeploymentMode('saas')}
                          className={`p-3.5 rounded-lg border cursor-pointer transition ${
                            deploymentMode === 'saas'
                              ? 'border-blue-500 bg-blue-50/50'
                              : 'border-[#CBD5E1] bg-white hover:border-gray-400'
                          }`}
                        >
                          <Cloud className={`w-5 h-5 mb-2 ${deploymentMode === 'saas' ? 'text-blue-600' : 'text-gray-500'}`} />
                          <div className="text-xs font-semibold text-[#1A202C] font-mono">Cloud SaaS</div>
                          <div className="text-[11px] text-[#64748B] mt-1">Multi-cloud cluster with automatic scaling</div>
                        </div>

                        <div
                          onClick={() => setDeploymentMode('enterprise')}
                          className={`p-3.5 rounded-lg border cursor-pointer transition ${
                            deploymentMode === 'enterprise'
                              ? 'border-blue-500 bg-blue-50/50'
                              : 'border-[#CBD5E1] bg-white hover:border-gray-400'
                          }`}
                        >
                          <Server className={`w-5 h-5 mb-2 ${deploymentMode === 'enterprise' ? 'text-blue-600' : 'text-gray-500'}`} />
                          <div className="text-xs font-semibold text-[#1A202C] font-mono">Air-Gapped Docker</div>
                          <div className="text-[11px] text-[#64748B] mt-1">On-premise edge appliance without internet</div>
                        </div>
                      </div>

                      {deploymentMode === 'enterprise' && (
                        <div className="p-3 bg-[#151C24] rounded-lg border border-[#243145] space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                            <span className="flex items-center gap-1.5">
                              <FileCode className="w-3.5 h-3.5 text-blue-400" />
                              docker-compose.yml
                            </span>
                            <button
                              type="button"
                              onClick={copySnippet}
                              className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                            >
                              {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <pre className="text-[10px] text-emerald-400 overflow-x-auto p-1 leading-relaxed max-h-24 font-mono">
                            {dockerComposeSnippet}
                          </pre>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setStep(3)}
                          className="py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg flex items-center justify-center gap-1 transition"
                        >
                          <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={handleFinalRegister}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm font-sans"
                        >
                          {submitting ? 'Provisioning Tenant...' : 'Complete & Launch Workspace'}
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Help text */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-[#E2E8F0] text-center">
              <span className="text-xs text-[#64748B] font-sans">
                Need access? Contact your factory administrator.
              </span>
            </div>
          </div>

          {/* Security notice */}
          <div className="mt-4 text-center text-[11px] text-[#64748B] flex items-center justify-center gap-2 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Zero-Trust Architecture · Hardware Salted PINs · Multi-Tenant Enforcement</span>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
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
  KeyRound,
  AlertTriangle,
  Server,
  Cloud,
  CheckCircle2,
  Cpu,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';

interface LoginViewProps {
  onSuccess?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { login, loginWithBadge, registerOrg } = useAuth();
  const [tab, setTab] = useState<'signin' | 'badge' | 'register'>('register');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [badgeCode, setBadgeCode] = useState('');
  const [badgePin, setBadgePin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Registration 4-Step State
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [plantName, setPlantName] = useState('Stuttgart Werk 2');
  const [plantCode, setPlantCode] = useState('PLANT-DE-02');
  const [deploymentMode, setDeploymentMode] = useState<'saas' | 'enterprise'>('saas');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const handleOrgNameChange = (val: string) => {
    setOrgName(val);
    const generatedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setOrgSlug(generatedSlug);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const ok = await login(email, password);
      if (ok) onSuccess?.();
      else setError('Invalid credentials or inactive membership.');
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBadgeSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!badgeCode.trim()) { setError('Please provide or scan an employee badge ID.'); return; }
    if (!badgePin.trim()) { setError('Security PIN is required.'); return; }
    setSubmitting(true);
    try {
      const res = await loginWithBadge(badgeCode.trim(), badgePin.trim());
      if (res.success) onSuccess?.();
      else setError(res.error || 'Invalid badge identifier or PIN code.');
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate employee badge.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalRegister = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const ok = await registerOrg({
        organizationName: orgName,
        organizationSlug: orgSlug,
        adminEmail: email,
        adminFullName,
        password,
      });
      if (ok) onSuccess?.();
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
      - ORGANIZATION_SLUG=${orgSlug || 'acme-industries'}
      - PRIMARY_PLANT_CODE=${plantCode || 'PLANT-01'}
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
    'w-full pl-9 pr-3 py-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-md text-sm text-[#1A202C] placeholder-[#94A3B8] outline-none transition font-sans shadow-sm';

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
        {/* Subtle gridline background pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        {/* Top Logo & Heading */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <img
              src="/forgex_logo_dark.png"
              alt="ForgeX AI"
              className="h-10 w-auto object-contain filter drop-shadow-md"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[#60A5FA] text-xs font-mono mb-4">
            <Cpu className="w-3.5 h-3.5" />
            <span>Industrial Intelligence Platform</span>
          </div>

          <h1 className="text-2xl font-bold text-[#F8FAFC] leading-tight mb-3">
            Evidence-Grounded<br />Engineering Operations
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Every AI diagnosis is directly grounded in verified plant manuals, P&ID schematics, and sensor telemetry — strictly enforced by multi-tenant RBAC.
          </p>

          {/* 5 Core Principles */}
          <div className="mt-8 space-y-3.5">
            {[
              { title: 'Evidence Before Answer', desc: 'Zero hallucinations. 5-tier citation model with direct PDF page links.' },
              { title: 'Density Without Clutter', desc: 'Engineered for 8-hour shifts with dense technical telemetry and split-panes.' },
              { title: 'Backend-Enforced Trust', desc: 'Visual permission clarity. Confidential drawings isolated from unauthorized roles.' },
              { title: 'Two Deployments, One Identity', desc: 'Seamless parity across SaaS cloud and Air-Gapped on-premise Docker.' },
            ].map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5 text-blue-400 text-xs font-mono">
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
            Compliant with ISO 55001 Asset Mgmt & OSHA 1910.147 LOTO Verification
          </span>
        </div>
      </div>

      {/* Right: Auth form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-6">
          <img
            src="/forgex_logo_transparent.png"
            alt="ForgeX AI"
            className="h-8 w-auto object-contain"
          />
        </div>

        <div className="w-full max-w-lg">
          {/* Card */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            {/* Card header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#1A202C]">
                  {tab === 'register'
                    ? `Create Organization Workspace (Step ${step} of 4)`
                    : tab === 'signin'
                    ? 'Sign in to ForgeX AI'
                    : 'Employee Badge Authentication'}
                </h2>
                {tab === 'register' && (
                  <div className="flex items-center gap-1 font-mono text-xs text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Step {step}/4
                  </div>
                )}
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                {tab === 'register'
                  ? step === 1
                    ? '1. Organization Details & Workspace URL'
                    : step === 2
                    ? '2. Primary Administrator Account'
                    : step === 3
                    ? '3. Primary Plant & Department Identification'
                    : '4. Choose Architecture: Cloud SaaS or Air-Gapped Docker'
                  : tab === 'signin'
                  ? 'Enter your verified business email and password'
                  : 'Enter your badge identifier and 4-digit security PIN'}
              </p>
            </div>

            <div className="p-6">
              {/* Tab switcher */}
              <div className="flex bg-[#F1F5F9] p-1 rounded-lg mb-5 border border-[#E2E8F0]">
                {[
                  { key: 'register', label: 'Register Org' },
                  { key: 'signin', label: 'Sign In' },
                  { key: 'badge', label: 'Badge + PIN', icon: <CreditCard className="w-3 h-3 text-[#2563EB]" /> },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setTab(t.key as any); setError(null); }}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                      tab === t.key
                        ? 'bg-white text-[#1A202C] shadow-sm border border-[#E2E8F0]'
                        : 'text-[#64748B] hover:text-[#1A202C]'
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Error Banner */}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Tab: Register Org (4-Step Onboarding) */}
              {tab === 'register' ? (
                <div>
                  {/* Step Progress Dots */}
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
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Organization / Enterprise Legal Entity
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                          <input
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
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Workspace Slug (Tenant Identifier)
                        </label>
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 bg-gray-100 border border-r-0 border-[#CBD5E1] px-2.5 py-2.5 rounded-l-md font-mono">
                            forgex.io/
                          </span>
                          <input
                            type="text"
                            required
                            placeholder="acme-industrial"
                            value={orgSlug}
                            onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            className="flex-1 pr-3 py-2.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-r-md text-sm text-[#1A202C] placeholder-[#94A3B8] outline-none transition font-mono shadow-sm px-3"
                          />
                        </div>
                      </div>

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
                        className="w-full mt-2 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
                      >
                        Continue to Administrator Setup
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Step 2: Administrator Account */}
                  {step === 2 && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Primary Administrator Full Name
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                          <input
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
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Admin Business Email
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                          <input
                            type="email"
                            required
                            placeholder="admin@yourcompany.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Account Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                          <input
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
                            if (!adminFullName.trim() || !email.trim()) {
                              setError('Please provide admin full name and email.');
                              return;
                            }
                            setError(null);
                            setStep(3);
                          }}
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
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
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Initial Plant Facility Name
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. Stuttgart Werk 2 or Riverside Refining"
                            value={plantName}
                            onChange={(e) => setPlantName(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">
                          Plant Code / Facility Identifier
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. PLANT-DE-02"
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
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
                        >
                          Select Deployment Mode
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Deployment Mode */}
                  {step === 4 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          onClick={() => setDeploymentMode('saas')}
                          className={`p-3.5 rounded-lg border cursor-pointer transition ${
                            deploymentMode === 'saas'
                              ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/20'
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <Cloud className={`w-4 h-4 ${deploymentMode === 'saas' ? 'text-blue-600' : 'text-gray-400'}`} />
                            <span className="text-xs font-bold text-gray-900">Cloud SaaS</span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-normal">
                            Managed multi-tenant cloud inference. Zero local maintenance required.
                          </p>
                        </div>

                        <div
                          onClick={() => setDeploymentMode('enterprise')}
                          className={`p-3.5 rounded-lg border cursor-pointer transition ${
                            deploymentMode === 'enterprise'
                              ? 'bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20'
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <Server className={`w-4 h-4 ${deploymentMode === 'enterprise' ? 'text-emerald-600' : 'text-gray-400'}`} />
                            <span className="text-xs font-bold text-gray-900">Enterprise Docker</span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-normal">
                            Air-gapped on-premise execution with local Ollama inference.
                          </p>
                        </div>
                      </div>

                      {deploymentMode === 'enterprise' && (
                        <div className="p-3 bg-[#0A0F17] rounded-lg border border-[#1E293B] text-[11px] font-mono text-gray-300 space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-gray-400">
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
                          <pre className="text-[10px] text-emerald-400 overflow-x-auto p-1 leading-relaxed max-h-28">
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
                          className="flex-1 py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                        >
                          {submitting ? 'Provisioning Tenant...' : 'Complete Registration & Launch'}
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : tab === 'signin' ? (
                /* Tab: Standard Sign In */
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">Business Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="user@yourcompany.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                  >
                    {submitting ? 'Authenticating...' : 'Sign In to Workspace'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* Tab: Badge + PIN Sign In */
                <form onSubmit={handleBadgeSignIn} className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs leading-relaxed">
                    <span className="font-semibold block mb-0.5">Industrial Badge Security</span>
                    A verified 4-digit PIN is strictly required alongside your badge ID.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">Badge Identifier / Barcode</label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. EMP-1001"
                        value={badgeCode}
                        onChange={(e) => setBadgeCode(e.target.value)}
                        className={inputCls + ' uppercase font-mono'}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A202C] mb-1.5">4-Digit Security PIN</label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                      <input
                        type="password"
                        maxLength={6}
                        required
                        placeholder="••••"
                        value={badgePin}
                        onChange={(e) => setBadgePin(e.target.value)}
                        className={inputCls + ' tracking-widest font-mono'}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                  >
                    {submitting ? 'Verifying Badge...' : 'Authenticate Badge & Access'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Security notice */}
          <div className="mt-4 text-center text-[11px] text-[#94A3B8] flex items-center justify-center gap-2 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>End-to-end encrypted · Multi-tenant isolation · Server-side RBAC</span>
          </div>
        </div>
      </div>
    </div>
  );
};

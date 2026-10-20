import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Settings as SettingsIcon,
  Cpu,
  ShieldCheck,
  Save,
  CheckCircle2,
  Lock,
  Globe,
  Bell,
  Smartphone,
  LogOut,
  AlertCircle,
  KeyRound,
  Trash2,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { useAuth } from '../../lib/AuthContext';
import type { UserSession, UserPreferences } from '@forgex/shared-types';

export const SettingsView: React.FC = () => {
  const { user, organization, membership, isOwnerOrAdmin, token, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'organization'>('profile');

  // Profile Form State
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [phone, setPhone] = useState(user?.phone || '+1 (555) 019-2831');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  // Preferences State
  const [theme, setTheme] = useState<'graphite' | 'dark' | 'light'>(
    user?.preferences?.theme || 'light'
  );
  const [language, setLanguage] = useState(user?.preferences?.language || 'en-US');
  const [emailNotifications, setEmailNotifications] = useState(
    user?.preferences?.emailNotifications ?? true
  );
  const [smsAlerts, setSmsAlerts] = useState(user?.preferences?.smsAlerts ?? false);
  const [safetyCriticalAlertsOnly, setSafetyCriticalAlertsOnly] = useState(
    user?.preferences?.safetyCriticalAlertsOnly ?? true
  );

  // Sessions State
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Org Settings State (Admin only)
  const [inferenceMode, setInferenceMode] = useState<'local_ollama' | 'saas_cloud'>('local_ollama');
  const [airGapped, setAirGapped] = useState(true);

  // Status feedback
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch complete profile and sessions
  useEffect(() => {
    if (!token) return;

    const fetchProfileAndSessions = async () => {
      try {
        setLoadingSessions(true);
        const [profileRes, sessionsRes] = await Promise.all([
          fetch('/api/v1/auth/profile', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/v1/auth/sessions', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          if (profileJson.success && profileJson.data?.user) {
            const u = profileJson.data.user;
            setFullName(u.fullName || '');
            setJobTitle(u.jobTitle || '');
            setDepartment(u.department || '');
            setPhone(u.phone || '');
            setAvatarUrl(u.avatarUrl || '');
            if (u.preferences) {
              setTheme(u.preferences.theme || 'light');
              setLanguage(u.preferences.language || 'en-US');
              setEmailNotifications(u.preferences.emailNotifications ?? true);
              setSmsAlerts(u.preferences.smsAlerts ?? false);
              setSafetyCriticalAlertsOnly(u.preferences.safetyCriticalAlertsOnly ?? true);
            }
          }
        }

        if (sessionsRes.ok) {
          const sessionsJson = await sessionsRes.json();
          if (sessionsJson.success && Array.isArray(sessionsJson.data)) {
            setSessions(sessionsJson.data);
          }
        }
      } catch (err) {
        console.error('Error fetching profile context:', err);
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchProfileAndSessions();
  }, [token]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const preferences: UserPreferences = {
        theme,
        language,
        emailNotifications,
        smsAlerts,
        safetyCriticalAlertsOnly,
      };

      const res = await fetch('/api/v1/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName,
          jobTitle,
          department,
          phone,
          avatarUrl,
          preferences,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Failed to update profile.');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error updating profile.');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/v1/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error('Failed to revoke session:', err);
    }
  };

  const handleRequestRecovery = async () => {
    if (!user?.email) return;
    try {
      await fetch('/api/v1/auth/request-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      setRecoveryRequested(true);
      setTimeout(() => setRecoveryRequested(false), 4000);
    } catch (err) {
      console.error('Failed to dispatch recovery request:', err);
    }
  };

  return (
    <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-background space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold font-mono text-foreground uppercase tracking-wide">
              Account Profile & System Settings
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {organization?.name || 'Apex Energy Operations'} • Role: {membership?.role || 'TECHNICIAN'}
          </p>
        </div>

        {saveSuccess && (
          <span className="text-xs font-mono text-primary flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" /> Changes Stored
          </span>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border bg-muted rounded-xl p-1 max-w-md">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 py-2 text-xs font-mono font-bold tracking-wider rounded-lg transition flex items-center justify-center gap-2 ${
            activeTab === 'profile'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-primary/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          Personal Profile
        </button>

        {isOwnerOrAdmin && (
          <button
            onClick={() => setActiveTab('organization')}
            className={`flex-1 py-2 text-xs font-mono font-bold tracking-wider rounded-lg transition flex items-center justify-center gap-2 ${
            activeTab === 'organization'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-primary/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Organization Settings
        </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: PERSONAL PROFILE & PREFERENCES (All Roles)                    */}
      {/* ==================================================================== */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Identity Card */}
            <Card>
              <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                    Personal Identity & Contact Information
                  </CardTitle>
                </div>
                <StatusBadge label={membership?.role || 'EMPLOYEE'} tone="info" />
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Corporate Email (SSO Identity)</label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-muted-foreground cursor-not-allowed font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Job Title</label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Lead Rotating Equipment Specialist"
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Department</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Mechanical Reliability & Maintenance"
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Permitted Contact Phone</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Avatar / Profile Photo URL</label>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://intranet.company.com/avatars/user.jpg"
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Appearance & Localization */}
            <Card>
              <CardHeader className="p-5 border-b border-border flex flex-row items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                  Appearance & Localization Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Visual Theme</label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="graphite">Established Graphite (Tailored Industrial)</option>
                      <option value="dark">Dark High-Contrast (Factory Floor Rugged)</option>
                      <option value="light">Engineering Paper Clean (Print Ready)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-muted-foreground mb-1">Language & Units</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="en-US">English (US Engineering Units - PSI / °F)</option>
                      <option value="es-MX">Español (América Latina - Bar / °C)</option>
                      <option value="de-US">Deutsch (DIN / ISO - Bar / °C)</option>
                      <option value="fr-FR">Français (Système International)</option>
                      <option value="ja-JP">日本語 (JIS Standard)</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Industrial Notification Preferences */}
            <Card>
              <CardHeader className="p-5 border-b border-border flex flex-row items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                  Industrial Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <label className="flex items-center justify-between p-3.5 rounded-xl bg-muted border border-border cursor-pointer hover:border-primary transition">
                  <div>
                    <span className="text-xs font-mono font-bold text-foreground">Safety-Critical Alarms Only</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Only trigger urgent visual and auditory alerts for physical hazards and lock-out tag-out cases.
                    </p>
                  </div>
                  <input
                      type="checkbox"
                      checked={safetyCriticalAlertsOnly}
                      onChange={(e) => setSafetyCriticalAlertsOnly(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-muted border border-border cursor-pointer hover:border-primary transition">
                  <div>
                    <span className="text-xs font-mono font-bold text-foreground">Daily Maintenance & Shift Digest</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Receive an automated morning email summary of open specialist tickets and verified maintenance.
                    </p>
                  </div>
                  <input
                      type="checkbox"
                      checked={emailNotifications}
                      onChange={(e) => setEmailNotifications(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-muted border border-border cursor-pointer hover:border-primary transition">
                  <div>
                    <span className="text-xs font-mono font-bold text-foreground">SMS Urgent Technician Dispatch</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Dispatch immediate SMS messages when high-severity tickets are routed to your specialist queue.
                    </p>
                  </div>
                  <input
                      type="checkbox"
                      checked={smsAlerts}
                      onChange={(e) => setSmsAlerts(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                  />
                </label>
              </CardContent>
              <CardFooter className="p-5 border-t border-border flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-xl"
                >
                  Save Profile & Preferences
                </Button>
              </CardFooter>
            </Card>
          </form>

          {/* Session Management Card */}
          <Card>
            <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                  Active Device Sessions
                </CardTitle>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                {sessions.length} Active Hardware Clients
              </span>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {loadingSessions ? (
                <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  Loading active hardware sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-xs text-muted-foreground">No active external hardware sessions reported.</div>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-muted border border-border"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground font-sans">{sess.device}</span>
                        {sess.isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            CURRENT CLIENT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        IP: {sess.ipAddress} • Last Active: {new Date(sess.lastActive).toLocaleTimeString()}
                      </div>
                    </div>

                    {!sess.isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(sess.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 text-xs font-mono transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Account Recovery & Sign-Out */}
          <Card>
            <CardHeader className="p-5 border-b border-border flex flex-row items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                Account Security & Sign-Out
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-md">
                <div className="text-xs font-bold text-foreground font-mono">
                  Enterprise Identity Provider Account Recovery
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Password resets and credential updates are delegated to your organization's configured Identity Provider.
                </p>
                {recoveryRequested && (
                  <p className="text-xs font-mono text-primary pt-1">
                    ✓ Instructions dispatched through enterprise identity provider.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRequestRecovery}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  Request Password Reset
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-destructive/60 border border-destructive text-rose-200 text-xs font-bold font-mono hover:bg-destructive transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out of ForgeX
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: ORGANIZATION SETTINGS (Admins & Owners Only)                  */}
      {/* ==================================================================== */}
      {activeTab === 'organization' && isOwnerOrAdmin && (
        <div className="space-y-6 animate-in fade-in">
          {/* Admin Segregation Notice */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-300">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div className="text-xs">
              <span className="font-bold font-mono uppercase tracking-wider block">
                Administrator Privileged Configuration
              </span>
              Organization settings control multi-tenant isolation, plant telemetry routing, and enterprise LLM inference policy.
            </div>
          </div>

          {/* Inference Provider Selection */}
          <Card>
            <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                Enterprise Inference Engine Selection
              </CardTitle>
              </div>
              <StatusBadge
                label={inferenceMode === 'local_ollama' ? 'AIR-GAP ON-PREM' : 'MANAGED CLOUD'}
                tone={inferenceMode === 'local_ollama' ? 'healthy' : 'info'}
              />
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                ForgeX AI isolates all LLM execution behind the unified <code className="text-primary font-mono bg-muted px-1.5 py-0.5 rounded border border-border">IInferenceProvider</code> contract.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  onClick={() => setInferenceMode('local_ollama')}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    inferenceMode === 'local_ollama'
                      ? 'bg-sidebar-accent border-primary shadow-[0_0_8px_rgba(163,230,53,0.15)]'
                      : 'bg-muted border-border hover:border-primary'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-foreground">
                      Ollama / vLLM (Local Runtime)
                    </span>
                    <input
                      type="radio"
                      checked={inferenceMode === 'local_ollama'}
                      onChange={() => setInferenceMode('local_ollama')}
                      className="accent-primary focus:ring-0"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    Zero internet egress. Uses local GPU cluster. Approved for defense, nuclear, and chemical OT plants.
                  </p>
                </div>

                <div
                  onClick={() => setInferenceMode('saas_cloud')}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    inferenceMode === 'saas_cloud'
                      ? 'bg-sidebar-accent border-primary shadow-[0_0_8px_rgba(163,230,53,0.15)]'
                      : 'bg-muted border-border hover:border-primary'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-foreground">
                      Enterprise Cloud SaaS (Azure / OpenAI)
                    </span>
                    <input
                      type="radio"
                      checked={inferenceMode === 'saas_cloud'}
                      onChange={() => setInferenceMode('saas_cloud')}
                      className="accent-primary focus:ring-0"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    Dedicated FedRAMP / GovCloud endpoints with Zero Data Retention (ZDR) SLAs.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Network & Plant Isolation */}
          <Card>
            <CardHeader className="p-5 border-b border-border flex flex-row items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                Data Sovereignty &amp; Network Isolation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <label className="flex items-center justify-between p-4 rounded-xl bg-muted border border-border cursor-pointer hover:border-primary transition">
                <div className="pr-4">
                  <div className="text-xs font-mono font-bold text-foreground">AIR-GAPPED SOVEREIGN MODE</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Strictly disables any outbound DNS lookups or external telemetry pings outside the plant LAN.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={airGapped}
                  onChange={(e) => setAirGapped(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SettingsView;

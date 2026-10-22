import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Save,
  CheckCircle2,
  Lock,
  Globe,
  LogOut,
  AlertCircle,
  KeyRound,
  Trash2,
  Building2,
  Upload,
  Phone,
  Briefcase,
  ExternalLink,
  Layers,
  Server,
  Pencil,
  X,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { AuditLedgerView } from './AuditLedgerView';
import type { UserSession, UserPreferences } from '@forgex/shared-types';

const INDUSTRIAL_AVATAR_PRESETS = [
  { label: 'Plant Lead', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
  { label: 'Engineer', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
  { label: 'Technician', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' },
  { label: 'Supervisor', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80' },
];

const INDUSTRY_OPTIONS = [
  'Ceramics, Tiles & Building Materials',
  'Oil, Gas & Petrochemical Refining',
  'Oil & Gas Refining',
  'Chemical & Specialty Processing',
  'Heavy Machinery & Industrial Equipment',
  'Automotive & Aerospace Manufacturing',
  'Food, Beverage & Pharmaceutical Packaging',
  'Mining, Metals & Foundry Operations',
  'Energy, Power Utilities & Renewables',
  'General Industrial Manufacturing',
];

const COMPANY_SIZES = [
  { value: '1-50', label: '1 - 50 employees (Single Site)' },
  { value: '51-200', label: '51 - 200 employees (Multi-Line Plant)' },
  { value: '201-1000', label: '201 - 1,000 employees (Regional Facilities)' },
  { value: '1000+', label: '1,000+ employees (Global Enterprise)' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST - India Standard Time)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (EST / EDT - US East)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST / CDT - US Central)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST / PDT - US West)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET / CEST - Central Europe)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST - Gulf Standard Time)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT - Singapore / SE Asia)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST - Japan Standard Time)' },
];

function matchTimezoneValue(val?: string): string {
  if (!val) return 'Asia/Kolkata';
  const found = TIMEZONE_OPTIONS.find(
    (t) => t.value === val || t.label === val || val.startsWith(t.value)
  );
  return found ? found.value : val;
}

function matchCompanySizeValue(val?: string): string {
  if (!val) return '51-200';
  const found = COMPANY_SIZES.find(
    (s) => s.value === val || s.label === val || s.value === val.replace(/\s+/g, '')
  );
  return found ? found.value : val;
}

function matchIndustryValue(val?: string): string {
  if (!val) return INDUSTRY_OPTIONS[0];
  const found = INDUSTRY_OPTIONS.find(
    (i) => i.toLowerCase() === val.toLowerCase() || i.toLowerCase().includes(val.toLowerCase())
  );
  return found ? found : val;
}

export interface SettingsViewProps {
  initialTab?: 'profile' | 'organization' | 'security';
}

export const SettingsView: React.FC<SettingsViewProps> = ({ initialTab = 'profile' }) => {
  const { toast } = useToast();
  const { user, organization, membership, isOwnerOrAdmin, token, logout, refreshAuth, forgotPassword } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canViewAudit = isOwnerOrAdmin || membership?.role === 'PLANT_MANAGER';

  const [activeTab, setActiveTab] = useState<'profile' | 'organization' | 'security'>(() => {
    if (initialTab === 'security' && !canViewAudit) return 'profile';
    return initialTab;
  });

  useEffect(() => {
    if (initialTab === 'security') {
      if (canViewAudit) {
        setActiveTab('security');
      } else {
        setActiveTab('profile');
      }
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, canViewAudit]);

  // --- Profile State ---
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [language, setLanguage] = useState(user?.preferences?.language || 'en-US');
  const [timezone, setTimezone] = useState(matchTimezoneValue(user?.preferences?.timezone));

  // Preferences State
  const [theme, setTheme] = useState<'graphite' | 'dark' | 'light'>(
    user?.preferences?.theme || 'light'
  );
  const [emailNotifications, setEmailNotifications] = useState(
    user?.preferences?.emailNotifications ?? true
  );
  const [smsAlerts, setSmsAlerts] = useState(user?.preferences?.smsAlerts ?? false);
  const [safetyCriticalAlertsOnly, setSafetyCriticalAlertsOnly] = useState(
    user?.preferences?.safetyCriticalAlertsOnly ?? true
  );

  // --- Organization State ---
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [orgName, setOrgName] = useState(organization?.name || '');
  const [orgIndustry, setOrgIndustry] = useState(matchIndustryValue(organization?.industry));
  const [orgCountry, setOrgCountry] = useState(organization?.country || 'India');
  const [orgTimezone, setOrgTimezone] = useState(matchTimezoneValue(organization?.timezone));
  const [orgWebsite, setOrgWebsite] = useState(organization?.website || '');
  const [orgCompanySize, setOrgCompanySize] = useState(matchCompanySizeValue(organization?.companySize));
  const [orgUnits, setOrgUnits] = useState<'metric' | 'imperial'>(
    organization?.measurementUnits === 'imperial' ? 'imperial' : 'metric'
  );

  // Sessions State
  const [sessions, setSessions] = useState<UserSession[]>([]);

  // Status feedback
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  // Sync profile state when user updates (strictly when not currently editing)
  useEffect(() => {
    if (!isEditingProfile && user) {
      setFullName(user.fullName || '');
      setJobTitle(user.jobTitle || '');
      setDepartment(user.department || '');
      setPhone(user.phone || '');
      setAvatarUrl(user.avatarUrl || '');
      if (user.preferences) {
        setTheme(user.preferences.theme || 'light');
        setLanguage(user.preferences.language || 'en-US');
        setTimezone(matchTimezoneValue(user.preferences.timezone));
        setEmailNotifications(user.preferences.emailNotifications ?? true);
        setSmsAlerts(user.preferences.smsAlerts ?? false);
        setSafetyCriticalAlertsOnly(user.preferences.safetyCriticalAlertsOnly ?? true);
      }
    }
  }, [user, isEditingProfile]);

  // Sync organization state when organization updates (strictly when not currently editing)
  useEffect(() => {
    if (!isEditingOrg && organization) {
      setOrgName(organization.name || '');
      setOrgIndustry(matchIndustryValue(organization.industry));
      setOrgCountry(organization.country || 'India');
      setOrgTimezone(matchTimezoneValue(organization.timezone));
      setOrgWebsite(organization.website || '');
      setOrgCompanySize(matchCompanySizeValue(organization.companySize));
      setOrgUnits(organization.measurementUnits === 'imperial' ? 'imperial' : 'metric');
    }
  }, [organization, isEditingOrg]);

  // Fetch complete profile and sessions
  useEffect(() => {
    if (!token) return;

    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/v1/auth/sessions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setSessions(json.data);
          }
        }
      } catch (err) {
        console.error('Error fetching sessions:', err);
      }
    };

    fetchSessions();
  }, [token]);

  // Handle avatar file selection
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      const msg = 'Profile photo must be smaller than 2MB.';
      setErrorMessage(msg);
      toast.error('File Too Large', msg);
      return;
    }

    if (!file.type.startsWith('image/')) {
      const msg = 'Please upload a valid image file (PNG, JPG, or WebP).';
      setErrorMessage(msg);
      toast.error('Invalid Format', msg);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        setIsEditingProfile(true);
        setErrorMessage(null);
        toast.info('Photo Selected', 'Remember to click Save Profile Changes to apply.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPresetAvatar = (url: string) => {
    setAvatarUrl(url);
    setIsEditingProfile(true);
    setErrorMessage(null);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    setIsEditingProfile(true);
    setErrorMessage(null);
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fullName.trim()) {
      const msg = 'Full Name is a required field.';
      setErrorMessage(msg);
      toast.error('Validation Error', msg);
      return;
    }

    setErrorMessage(null);
    setSaveSuccessMsg(null);
    setSavingProfile(true);

    try {
      const preferences: UserPreferences = {
        ...(user?.preferences || {}),
        theme,
        language,
        timezone,
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
          fullName: fullName.trim(),
          jobTitle: jobTitle.trim(),
          department: department.trim(),
          phone: phone.trim(),
          avatarUrl: avatarUrl.trim(),
          preferences,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update personal profile.');
      }

      await refreshAuth();
      setIsEditingProfile(false);
      setSaveSuccessMsg('Personal profile updated successfully.');
      toast.success('Profile Updated', 'Personal profile changes saved successfully.');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      const msg = err?.message || 'Error updating personal profile.';
      setErrorMessage(msg);
      toast.error('Update Failed', msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSaveSuccessMsg(null);
    setSavingPreferences(true);

    try {
      const preferences: UserPreferences = {
        ...(user?.preferences || {}),
        theme,
        language,
        timezone,
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
          preferences,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update notification preferences.');
      }

      await refreshAuth();
      setSaveSuccessMsg('Operational notification preferences saved successfully.');
      toast.success('Preferences Saved', 'Operational notification preferences updated.');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      const msg = err?.message || 'Error saving notification preferences.';
      setErrorMessage(msg);
      toast.error('Save Failed', msg);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      const msg = 'Organization Name cannot be empty.';
      setErrorMessage(msg);
      toast.error('Validation Error', msg);
      return;
    }

    setErrorMessage(null);
    setSaveSuccessMsg(null);
    setSavingOrg(true);

    try {
      const res = await fetch('/api/v1/org', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization?.id || '',
        },
        body: JSON.stringify({
          name: orgName.trim(),
          industry: orgIndustry,
          country: orgCountry.trim(),
          timezone: orgTimezone,
          website: orgWebsite.trim(),
          companySize: orgCompanySize,
          measurementUnits: orgUnits,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update organization settings.');
      }

      await refreshAuth();
      setIsEditingOrg(false);
      setSaveSuccessMsg('Organization settings updated successfully.');
      toast.success('Organization Updated', 'Company configuration settings saved.');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      const msg = err?.message || 'Error updating organization settings.';
      setErrorMessage(msg);
      toast.error('Update Failed', msg);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleTriggerPasswordReset = async () => {
    if (!user?.email) return;
    setResetSending(true);
    setErrorMessage(null);
    try {
      const res = await forgotPassword(user.email);
      if (res.success) {
        setPasswordResetSent(true);
        toast.success('Reset Code Dispatched', `A 6-digit password reset OTP has been sent to ${user.email}.`);
        setTimeout(() => setPasswordResetSent(false), 5000);
      } else {
        const msg = res.error || 'Unable to send password reset OTP.';
        setErrorMessage(msg);
        toast.error('Reset Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Error requesting password reset.';
      setErrorMessage(msg);
      toast.error('Network Error', msg);
    } finally {
      setResetSending(false);
    }
  };

  const userInitials = (user?.fullName || 'User')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const isEnterprise = organization?.deploymentType === 'enterprise';

  return (
    <div
      className="flex-1 min-h-0 min-w-0 w-full h-full overflow-y-auto bg-[#F8FAFC] p-5 md:p-8 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] bg-white p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#1E293B] text-white flex items-center justify-center shadow-sm">
              <SettingsIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-sans text-[#0F172A] tracking-tight">
                Settings
              </h1>
              <p className="text-xs text-[#64748B] font-mono mt-0.5">
                {organization?.name || 'Workspace'} • {membership?.role?.replace(/_/g, ' ') || 'Member'}
              </p>
            </div>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="px-3.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {saveSuccessMsg}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#E2E8F0] bg-[#F1F5F9] p-1 rounded-xl max-w-xl">
        <button
          onClick={() => {
            setActiveTab('profile');
            setErrorMessage(null);
          }}
          className={`flex-1 py-2 text-xs font-mono font-bold tracking-wider rounded-lg transition flex items-center justify-center gap-2 ${
            activeTab === 'profile'
              ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5 text-blue-600" />
          Personal Profile
        </button>

        <button
          onClick={() => {
            setActiveTab('organization');
            setErrorMessage(null);
          }}
          className={`flex-1 py-2 text-xs font-mono font-bold tracking-wider rounded-lg transition flex items-center justify-center gap-2 ${
            activeTab === 'organization'
              ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
          Organization
        </button>

        {canViewAudit && (
          <button
            onClick={() => {
              setActiveTab('security');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-mono font-bold tracking-wider rounded-lg transition flex items-center justify-center gap-2 ${
              activeTab === 'security'
                ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Security & Audit
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 font-medium animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: PERSONAL PROFILE                                              */}
      {/* ==================================================================== */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Identity & Photo Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#0F172A]">
                    Profile Photo & Identity
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={membership?.role?.replace(/_/g, ' ') || 'MEMBER'} tone="info" />
                  {!isEditingProfile ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(true)}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setFullName(user?.fullName || '');
                          setJobTitle(user?.jobTitle || '');
                          setDepartment(user?.department || '');
                          setPhone(user?.phone || '');
                          setAvatarUrl(user?.avatarUrl || '');
                          setTimezone(matchTimezoneValue(user?.preferences?.timezone));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveProfile()}
                        disabled={savingProfile}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingProfile ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Photo Changer Row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 pb-6 border-b border-[#F1F5F9]">
                  <div className="relative group shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={fullName}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500 shadow-md bg-slate-100"
                        onError={() => setAvatarUrl('')}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xl font-bold font-mono shadow-md border-2 border-blue-200">
                        {userInitials}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[#0F172A]">Profile Picture</h4>
                      {isEditingProfile && (
                        <span className="text-[11px] font-mono font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Editing Mode Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      Upload an official team photo or choose a preset badge avatar. PNG, JPG or WebP up to 2MB.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleAvatarFileChange}
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg bg-[#0F172A] text-white hover:bg-black text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload File
                      </button>

                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-[#64748B] hover:text-rose-600 hover:border-rose-300 text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove Photo
                        </button>
                      )}
                    </div>

                    {/* Presets */}
                    <div className="pt-2 flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[#94A3B8]">Industrial Presets:</span>
                      <div className="flex items-center gap-1.5">
                        {INDUSTRIAL_AVATAR_PRESETS.map((preset, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelectPresetAvatar(preset.url)}
                            title={preset.label}
                            className="w-7 h-7 rounded-lg overflow-hidden border border-[#CBD5E1] hover:border-blue-500 transition hover:scale-105"
                          >
                            <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profile Fields Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={!isEditingProfile}
                      placeholder="e.g. John Doe"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingProfile
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Work Email (Account Identifier)
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="w-full pl-9 pr-24 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono text-[#64748B] cursor-not-allowed"
                      />
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <span className="absolute right-2.5 top-2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ✓ Verified
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Job Title / Designation
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        disabled={!isEditingProfile}
                        placeholder="e.g. Lead Reliability Engineer"
                        className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-sans transition ${
                          isEditingProfile
                            ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                        }`}
                      />
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Department
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      disabled={!isEditingProfile}
                      placeholder="e.g. Mechanical Reliability & Production"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingProfile
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Contact Phone (For OT Alerts & Escalations)
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={!isEditingProfile}
                        placeholder="+91 98765 43210"
                        className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-sans transition ${
                          isEditingProfile
                            ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                        }`}
                      />
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      User Timezone & Locale
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      disabled={!isEditingProfile}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingProfile
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-blue-600 focus:outline-none'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    >
                      {!TIMEZONE_OPTIONS.some((t) => t.value === timezone) && (
                        <option value={timezone}>{timezone}</option>
                      )}
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isEditingProfile && (
                  <div className="pt-4 border-t border-[#F1F5F9] flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingProfile(false);
                        setFullName(user?.fullName || '');
                        setJobTitle(user?.jobTitle || '');
                        setDepartment(user?.department || '');
                        setPhone(user?.phone || '');
                        setAvatarUrl(user?.avatarUrl || '');
                        setTimezone(matchTimezoneValue(user?.preferences?.timezone));
                      }}
                      className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Operational Notification & Alert Preferences (Dedicated Form) */}
          <form onSubmit={handleSavePreferences} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#0F172A]">
                  Operational Notification Preferences
                </h3>
              </div>
              <span className="text-[11px] text-[#64748B] font-mono">
                Real-Time Alarm Relays
              </span>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC] cursor-pointer transition">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-[#0F172A]">Email Notifications</div>
                  <div className="text-[11px] text-[#64748B]">Receive work order assignments and plant threshold digests via email.</div>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC] cursor-pointer transition">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-[#0F172A]">Safety &amp; LOTO Critical Alerts Only</div>
                  <div className="text-[11px] text-[#64748B]">Filter notifications to only include hazardous Lockout/Tagout and emergency machinery trips.</div>
                </div>
                <input
                  type="checkbox"
                  checked={safetyCriticalAlertsOnly}
                  onChange={(e) => setSafetyCriticalAlertsOnly(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingPreferences}
                className="px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {savingPreferences ? 'Saving Preferences...' : 'Save Notification Preferences'}
              </button>
            </div>
          </form>

          {/* Account Security & Authentication */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#0F172A]">
                  Account Security &amp; Credentials
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#64748B]">
                Active Devices: {sessions.length || 1}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  Account Password
                </div>
                <p className="text-[11px] text-[#64748B] leading-relaxed">
                  Reset or configure your password securely using email verification OTP.
                </p>
                {passwordResetSent ? (
                  <p className="text-xs text-emerald-600 font-semibold pt-1">
                    ✓ Password reset OTP sent to {user?.email}. Check your inbox!
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleTriggerPasswordReset}
                    disabled={resetSending}
                    className="mt-1 px-3.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition shadow-sm"
                  >
                    {resetSending ? 'Sending OTP...' : 'Send Password Reset OTP'}
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  Sign Out
                </div>
                <p className="text-[11px] text-[#64748B] leading-relaxed">
                  Sign out of your active ForgeX session on this workstation.
                </p>
                <button
                  type="button"
                  onClick={logout}
                  className="mt-1 px-3.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: ORGANIZATION SETTINGS                                         */}
      {/* ==================================================================== */}
      {activeTab === 'organization' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveOrganization} className="space-y-6">
            {/* Organization Metadata Card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#0F172A]">
                    Company Information &amp; Operations
                  </h3>
                </div>

                {isOwnerOrAdmin && (
                  <div>
                    {!isEditingOrg ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingOrg(true)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit Organization Details
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingOrg(false);
                            setOrgName(organization?.name || '');
                            setOrgIndustry(matchIndustryValue(organization?.industry));
                            setOrgCountry(organization?.country || 'India');
                            setOrgTimezone(matchTimezoneValue(organization?.timezone));
                            setOrgWebsite(organization?.website || '');
                            setOrgCompanySize(matchCompanySizeValue(organization?.companySize));
                            setOrgUnits(organization?.measurementUnits === 'imperial' ? 'imperial' : 'metric');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingOrg}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingOrg ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Company / Organization Name
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      disabled={!isEditingOrg}
                      placeholder="e.g. JMK Tiles Ltd."
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Workspace Identifier (Slug)
                    </label>
                    <input
                      type="text"
                      value={organization?.slug || ''}
                      disabled
                      className="w-full px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono text-[#64748B] cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Industry / Manufacturing Sector
                    </label>
                    <select
                      value={orgIndustry}
                      onChange={(e) => setOrgIndustry(e.target.value)}
                      disabled={!isEditingOrg}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    >
                      {!INDUSTRY_OPTIONS.includes(orgIndustry) && (
                        <option value={orgIndustry}>{orgIndustry}</option>
                      )}
                      {INDUSTRY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Country / Jurisdiction
                    </label>
                    <input
                      type="text"
                      value={orgCountry}
                      onChange={(e) => setOrgCountry(e.target.value)}
                      disabled={!isEditingOrg}
                      placeholder="e.g. India, United States, Germany"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Corporate Website
                    </label>
                    <input
                      type="url"
                      value={orgWebsite}
                      onChange={(e) => setOrgWebsite(e.target.value)}
                      disabled={!isEditingOrg}
                      placeholder="https://jmktiles.com"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Company Workforce Size
                    </label>
                    <select
                      value={orgCompanySize}
                      onChange={(e) => setOrgCompanySize(e.target.value)}
                      disabled={!isEditingOrg}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    >
                      {!COMPANY_SIZES.some((s) => s.value === orgCompanySize) && (
                        <option value={orgCompanySize}>{orgCompanySize}</option>
                      )}
                      {COMPANY_SIZES.map((size) => (
                        <option key={size.value} value={size.value}>
                          {size.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Default Measurement Standards
                    </label>
                    <select
                      value={orgUnits}
                      onChange={(e) => setOrgUnits(e.target.value as any)}
                      disabled={!isEditingOrg}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    >
                      <option value="metric">Metric SI (°C, mm/s vibration, bar pressure, rpm)</option>
                      <option value="imperial">US Customary (°F, in/s vibration, psi pressure, rpm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold text-[#475569] mb-1.5">
                      Plant Operational Timezone
                    </label>
                    <select
                      value={orgTimezone}
                      onChange={(e) => setOrgTimezone(e.target.value)}
                      disabled={!isEditingOrg}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-sans transition ${
                        isEditingOrg
                          ? 'bg-white border-[#CBD5E1] text-[#0F172A] focus:border-indigo-600 focus:outline-none'
                          : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#334155] cursor-default'
                      }`}
                    >
                      {!TIMEZONE_OPTIONS.some((t) => t.value === orgTimezone) && (
                        <option value={orgTimezone}>{orgTimezone}</option>
                      )}
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isEditingOrg && (
                  <div className="pt-4 border-t border-[#F1F5F9] flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingOrg(false);
                        setOrgName(organization?.name || '');
                        setOrgIndustry(matchIndustryValue(organization?.industry));
                        setOrgCountry(organization?.country || 'India');
                        setOrgTimezone(matchTimezoneValue(organization?.timezone));
                        setOrgWebsite(organization?.website || '');
                        setOrgCompanySize(matchCompanySizeValue(organization?.companySize));
                        setOrgUnits(organization?.measurementUnits === 'imperial' ? 'imperial' : 'metric');
                      }}
                      className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingOrg}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 transition shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingOrg ? 'Saving...' : 'Save Organization Settings'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* ==================================================================== */}
          {/* DEPLOYMENT TIER & ARCHITECTURE (LOCKED / NO SELF-SERVE SWITCHING)    */}
          {/* ==================================================================== */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#0F172A]">
                    Deployment Tier &amp; Infrastructure Architecture
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Tenant deployment mode is bound upon organization provisioning.
                  </p>
                </div>
              </div>

              <span
                className={`text-[11px] font-mono font-bold px-3 py-1 rounded-full border ${
                  isEnterprise
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {isEnterprise ? 'ENTERPRISE ON-PREM' : 'CLOUD SAAS (ACTIVE)'}
              </span>
            </div>

            {isEnterprise ? (
              /* Enterprise Dedicated Locked Card */
              <div className="p-5 rounded-xl bg-purple-50/60 border border-purple-200 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wide">
                      Dedicated Sovereign Enterprise Deployment (Air-Gapped)
                    </h4>
                    <p className="text-xs text-purple-800 leading-relaxed">
                      Your organization is operating on a dedicated sovereign or on-premise installation with zero external egress. Vector collections, inference models, and plant telemetry are physically isolated.
                    </p>
                    <p className="text-[11px] text-purple-700 pt-1 font-mono">
                      🔒 Enterprise deployments cannot be converted to multi-tenant Cloud SaaS to preserve air-gapped compliance guarantees.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Cloud SaaS Locked Card with Enterprise Contact CTA */
              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-blue-50/60 border border-blue-200 flex items-start gap-3.5">
                  <Layers className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                      Multi-Tenant Cloud SaaS Platform
                    </h4>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Your organization is running on ForgeX Managed Cloud SaaS. All features, cloud AI inference models, continuous security updates, and automated off-site backups are active.
                    </p>
                  </div>
                </div>

                {/* Shift to Enterprise Notice */}
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-indigo-600" />
                      Need to migrate to an Air-Gapped On-Premises Enterprise Deployment?
                    </div>
                    <p className="text-xs text-[#64748B] max-w-xl leading-relaxed">
                      If your facility requires localized GPU execution (Ollama / vLLM), zero-internet air-gapping, or custom on-premise data residency, self-service switching is disabled. Contact our systems engineering team to schedule a migration.
                    </p>
                  </div>

                  <a
                    href={`mailto:enterprise@forgex.ai?subject=Enterprise%20Migration%20Request%20-%20${encodeURIComponent(organization?.name || 'Company')}&body=Hello%20ForgeX%20Team,%0A%0AWe%20would%20like%20to%20inquire%20about%20migrating%20our%20workspace%20(${organization?.slug || ''})%20from%20Cloud%20SaaS%20to%20a%20dedicated%20air-gapped%20Enterprise%20deployment.`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-black text-white text-xs font-semibold shrink-0 transition shadow-sm"
                  >
                    Contact Enterprise Team <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: SECURITY & AUDIT LEDGER                                      */}
      {/* ==================================================================== */}
      {activeTab === 'security' && canViewAudit && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden h-[calc(100vh-230px)] min-h-[650px] flex flex-col">
          <AuditLedgerView />
        </div>
      )}
    </div>
  );
};

export default SettingsView;

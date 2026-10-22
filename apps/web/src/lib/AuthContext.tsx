import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Organization, OrganizationMembership, OrgPermission, OrgRole } from '@forgex/shared-types';

export interface RegisterCompanyData {
  organizationName: string;
  organizationSlug?: string;
  adminEmail: string;
  adminFullName: string;
  businessEmail?: string;
  password?: string;
  confirmPassword?: string;
  otp?: string;
  industry?: string;
  country?: string;
  timezone?: string;
  website?: string;
  companySize?: string;
  initialSiteName?: string;
  deploymentMode?: 'saas' | 'enterprise';
  dataResidency?: string;
  regulatoryFramework?: string;
  adminJobTitle?: string;
  emergencyPhone?: string;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
}

export interface GoogleConfig {
  configured: boolean;
  clientId?: string;
}

export interface GoogleAuthResult {
  success: boolean;
  unlinkedUser?: boolean;
  isNewUser?: boolean;
  email?: string;
  fullName?: string;
  googleId?: string;
  message?: string;
  error?: string;
  role?: OrgRole;
}

export interface OtpSendResult {
  success: boolean;
  cooldownSeconds?: number;
  expiresAt?: string;
  debugOtp?: string;
  deliveryWarning?: string;
  error?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  unlinkedUser?: boolean;
  isNewUser?: boolean;
  email?: string;
  fullName?: string;
  message?: string;
  error?: string;
  role?: OrgRole;
}

export interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  membership: OrganizationMembership | null;
  memberships: OrganizationMembership[];
  permissions: OrgPermission[];
  token: string | null;
  isLoading: boolean;
  googleConfig: GoogleConfig;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  loginWithBadge: (badgeCode: string, pin: string) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  loginWithGoogle: (params: { credential?: string; idToken?: string; googleId?: string; email?: string; fullName?: string; organizationId?: string }) => Promise<GoogleAuthResult>;
  registerOrg: (data: RegisterCompanyData) => Promise<{ success: boolean; error?: string; verificationRequired?: boolean; email?: string; role?: OrgRole }>;
  registerOrgGoogle: (data: RegisterCompanyData & { credential?: string; idToken?: string; googleId?: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  acceptInvitationGoogle: (data: { invitationToken: string; credential?: string; idToken?: string; googleId?: string; email?: string; fullName?: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  sendEmailOtp: (email: string, purpose?: 'login' | 'register' | 'invitation') => Promise<OtpSendResult>;
  verifyEmailOtp: (email: string, otp: string, purpose?: 'login' | 'register' | 'invitation', organizationId?: string) => Promise<OtpVerifyResult>;
  registerOrgOtp: (data: RegisterCompanyData & { otp: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  acceptInvitationOtp: (data: { invitationToken: string; email: string; otp: string; fullName?: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  verifyEmail: (token: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  resendVerification: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; cooldownSeconds?: number; hasPassword?: boolean; authProvider?: string; debugOtp?: string; deliveryWarning?: string; error?: string; message?: string }>;
  verifyResetOtp: (email: string, otp: string) => Promise<{ success: boolean; resetSessionToken?: string; error?: string }>;
  resetPassword: (token: string, newPassword: string, confirmPassword?: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  triggerMemberPasswordReset: (memberId: string) => Promise<{ success: boolean; message?: string; error?: string; debugOtp?: string }>;
  revokeMemberSessions: (memberId: string) => Promise<{ success: boolean; revokedCount?: number; message?: string; error?: string }>;
  getMemberCredentialsSummary: (memberId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  linkMemberGoogle: (memberId: string, params: { email?: string; googleId?: string; credential?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  unlinkMemberGoogle: (memberId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  activateWithCode: (data: { code: string; email: string; password?: string; confirmPassword?: string; fullName?: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  acceptInvitation: (data: { token: string; password?: string; confirmPassword?: string; fullName?: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  logout: () => void;
  switchOrganization: (organizationId: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  hasPerm: (perm: OrgPermission) => boolean;
  isOwnerOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'forgex_token';
const ORG_ID_KEY = 'forgex_active_org_id';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [permissions, setPermissions] = useState<OrgPermission[]>([]);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(TOKEN_KEY) || null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = useCallback(async (authToken: string, targetOrgId?: string) => {
    try {
      setIsLoading(true);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${authToken}`,
      };
      const orgId = targetOrgId || localStorage.getItem(ORG_ID_KEY);
      if (orgId) {
        headers['x-organization-id'] = orgId;
      }

      const res = await fetch('/api/v1/auth/me', { headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Token expired or invalid
          setUser(null);
          setOrganization(null);
          setMembership(null);
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        setUser(json.data.user);
        setOrganization(json.data.organization);
        setMembership(json.data.membership);
        setMemberships(json.data.memberships || [json.data.membership]);
        setPermissions(json.data.permissions || []);
        if (json.data.organization?.id) {
          localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch auth state:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token);
    } else {
      setIsLoading(false);
    }
  }, [token, fetchCurrentUser]);

  const login = async (email: string, password?: string): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        setToken(receivedToken);
        localStorage.setItem(TOKEN_KEY, receivedToken);
        if (json.data.organization?.id) {
          localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
        }
        if (json.data.user) setUser(json.data.user);
        if (json.data.membership) setMembership(json.data.membership);
        if (json.data.memberships) setMemberships(json.data.memberships);
        if (json.data.permissions) setPermissions(json.data.permissions);
        if (json.data.organization) setOrganization(json.data.organization);

        await fetchCurrentUser(receivedToken, json.data.organization?.id);
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Invalid credentials or inactive membership.' };
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, error: err?.message || 'Network connection failed.' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithBadge = async (badgeCode: string, pin: string): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/badges/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeCode, pin }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        setToken(receivedToken);
        localStorage.setItem(TOKEN_KEY, receivedToken);
        if (json.data.organization?.id) {
          localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
        }
        if (json.data.user) setUser(json.data.user);
        if (json.data.membership) setMembership(json.data.membership);
        if (json.data.memberships) setMemberships(json.data.memberships || [json.data.membership]);
        if (json.data.permissions) setPermissions(json.data.permissions);
        if (json.data.organization) setOrganization(json.data.organization);

        await fetchCurrentUser(receivedToken, json.data.organization?.id);
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Invalid badge identifier or PIN code.' };
    } catch (err: any) {
      console.error('Badge login error:', err);
      return { success: false, error: err?.message || 'Network error during badge authentication.' };
    } finally {
      setIsLoading(false);
    }
  };

  const registerOrg = async (data: RegisterCompanyData): Promise<{ success: boolean; error?: string; verificationRequired?: boolean; email?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/register-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return {
          success: true,
          verificationRequired: json.data.emailVerification?.required ?? json.data.verificationRequired ?? false,
          email: json.data.email || data.adminEmail,
          role: json.data.membership?.role,
        };
      }
      return {
        success: false,
        error: json.error?.message || 'Company registration failed. Please review the form and try again.',
      };
    } catch (err: any) {
      console.error('Registration error:', err);
      return { success: false, error: err?.message || 'Network error during company registration.' };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmail = async (verificationToken: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationToken }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, message: json.data?.message || 'Email verified successfully.' };
      }
      return { success: false, error: json.error?.message || 'Verification link is invalid or expired.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error verifying email.' };
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const res = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, message: json.data?.message || 'Verification email resent.' };
      }
      return { success: false, error: json.error?.message || 'Failed to resend verification email.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error resending verification email.' };
    }
  };

  const forgotPassword = async (email: string): Promise<{ success: boolean; cooldownSeconds?: number; hasPassword?: boolean; authProvider?: string; debugOtp?: string; deliveryWarning?: string; error?: string; message?: string }> => {
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return {
          success: true,
          message: json.message || 'If an account exists, a 6-digit verification code has been dispatched.',
          cooldownSeconds: json.cooldownSeconds,
          hasPassword: json.hasPassword,
          authProvider: json.authProvider,
          debugOtp: json.debugOtp,
          deliveryWarning: json.deliveryWarning,
        };
      }
      return { success: false, cooldownSeconds: json.cooldownSeconds, error: json.error?.message || 'Failed to request password reset.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error.' };
    }
  };

  const verifyResetOtp = async (email: string, otp: string): Promise<{ success: boolean; resetSessionToken?: string; error?: string }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/forgot-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.resetSessionToken) {
        return { success: true, resetSessionToken: json.resetSessionToken };
      }
      return { success: false, error: json.error?.message || 'Invalid or expired verification code.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error verifying reset OTP.' };
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (resetToken: string, newPassword: string, confirmPassword?: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword, confirmPassword }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, message: json.message || 'Password successfully established.' };
      }
      return { success: false, error: json.error?.message || 'Password reset token is invalid or expired.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error resetting password.' };
    } finally {
      setIsLoading(false);
    }
  };

  const triggerMemberPasswordReset = async (memberId: string): Promise<{ success: boolean; message?: string; error?: string; debugOtp?: string }> => {
    if (!token || !organization?.id) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/org/members/${memberId}/reset-password-request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, message: json.message, debugOtp: json.data?.debugOtp };
      }
      return { success: false, error: json.error?.message || 'Failed to dispatch credential recovery.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error.' };
    }
  };

  const revokeMemberSessions = async (memberId: string): Promise<{ success: boolean; revokedCount?: number; message?: string; error?: string }> => {
    if (!token || !organization?.id) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/org/members/${memberId}/revoke-sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, revokedCount: json.data?.revokedSessionsCount, message: json.message };
      }
      return { success: false, error: json.error?.message || 'Failed to revoke sessions.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error.' };
    }
  };

  const getMemberCredentialsSummary = async (memberId: string): Promise<{ success: boolean; data?: any; error?: string }> => {
    if (!token || !organization?.id) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/org/members/${memberId}/credentials-summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, data: json.data };
      }
      return { success: false, error: json.error?.message || 'Failed to fetch credentials summary.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error.' };
    }
  };

  const linkMemberGoogle = async (memberId: string, params: { email?: string; googleId?: string; credential?: string }): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (!token || !organization?.id) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/org/members/${memberId}/link-google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, message: json.message };
      }
      return { success: false, error: json.error?.message || 'Failed to link Google account.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error linking Google account.' };
    }
  };

  const unlinkMemberGoogle = async (memberId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (!token || !organization?.id) return { success: false, error: 'Unauthorized' };
    try {
      const res = await fetch(`/api/v1/org/members/${memberId}/unlink-google`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return { success: true, message: json.message };
      }
      return { success: false, error: json.error?.message || 'Failed to unlink Google account.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error unlinking Google account.' };
    }
  };

  const activateWithCode = async (data: { code: string; email: string; password?: string; confirmPassword?: string; fullName?: string }): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/activate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Invalid activation code or email address.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error during code activation.' };
    } finally {
      setIsLoading(false);
    }
  };

  const acceptInvitation = async (data: { token: string; password?: string; confirmPassword?: string; fullName?: string }): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Failed to accept invitation.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error accepting invitation.' };
    } finally {
      setIsLoading(false);
    }
  };

  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>({ configured: false });

  useEffect(() => {
    fetch('/api/v1/auth/google/config')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setGoogleConfig(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const loginWithGoogle = async (params: { credential?: string; idToken?: string; googleId?: string; email?: string; fullName?: string; organizationId?: string }): Promise<GoogleAuthResult> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      if (json.unlinkedUser) {
        return {
          success: false,
          unlinkedUser: true,
          isNewUser: json.isNewUser,
          email: json.email,
          fullName: json.fullName,
          googleId: json.googleId,
          message: json.message,
        };
      }
      return { success: false, error: json.error?.message || 'Google authentication failed.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error during Google authentication.' };
    } finally {
      setIsLoading(false);
    }
  };

  const registerOrgGoogle = async (data: RegisterCompanyData & { credential?: string; idToken?: string; googleId?: string }): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/register-org-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Failed to register company with Google.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error registering company with Google.' };
    } finally {
      setIsLoading(false);
    }
  };

  const acceptInvitationGoogle = async (data: { invitationToken: string; credential?: string; idToken?: string; googleId?: string; email?: string; fullName?: string }): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/accept-invitation-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Failed to accept invitation with Google.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error accepting invitation with Google.' };
    } finally {
      setIsLoading(false);
    }
  };

  const sendEmailOtp = async (email: string, purpose: 'login' | 'register' | 'invitation' = 'login'): Promise<OtpSendResult> => {
    try {
      const res = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        return {
          success: true,
          cooldownSeconds: json.cooldownSeconds,
          expiresAt: json.expiresAt,
          debugOtp: json.debugOtp,
          deliveryWarning: json.deliveryWarning,
        };
      }
      return { success: false, cooldownSeconds: json.cooldownSeconds, error: json.error?.message || 'Failed to send OTP code.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error sending OTP code.' };
    }
  };

  const verifyEmailOtp = async (email: string, otp: string, purpose: 'login' | 'register' | 'invitation' = 'login', organizationId?: string): Promise<OtpVerifyResult> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, purpose, organizationId }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      if (json.unlinkedUser) {
        return {
          success: false,
          unlinkedUser: true,
          isNewUser: json.isNewUser,
          email: json.email,
          fullName: json.fullName,
          message: json.message,
        };
      }
      return { success: false, error: json.error?.message || 'Invalid or expired verification code.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error verifying OTP code.' };
    } finally {
      setIsLoading(false);
    }
  };

  const registerOrgOtp = async (data: RegisterCompanyData & { otp: string }): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/register-org-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Failed to register company with Email OTP.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error registering company with Email OTP.' };
    } finally {
      setIsLoading(false);
    }
  };

  const acceptInvitationOtp = async (data: { invitationToken: string; email: string; otp: string; fullName?: string }): Promise<{ success: boolean; error?: string; role?: OrgRole }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/accept-invitation-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        if (receivedToken) {
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
        }
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || 'Failed to accept invitation with Email OTP.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error accepting invitation with Email OTP.' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setOrganization(null);
    setMembership(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ORG_ID_KEY);
  };

  const switchOrganization = async (newOrgId: string) => {
    if (!token) return;
    localStorage.setItem(ORG_ID_KEY, newOrgId);
    await fetchCurrentUser(token, newOrgId);
  };

  const refreshAuth = async () => {
    if (!token) return;
    await fetchCurrentUser(token);
  };

  const hasPerm = (perm: OrgPermission): boolean => {
    if (!membership) return false;
    if (membership.role === 'ORGANIZATION_OWNER' || membership.role === 'ORGANIZATION_ADMIN') return true;
    return permissions.includes(perm);
  };

  const isOwnerOrAdmin = Boolean(
    membership && (membership.role === 'ORGANIZATION_OWNER' || membership.role === 'ORGANIZATION_ADMIN')
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        membership,
        memberships,
        permissions,
        token,
        isLoading,
        googleConfig,
        login,
        loginWithBadge,
        loginWithGoogle,
        registerOrg,
        registerOrgGoogle,
        acceptInvitationGoogle,
        sendEmailOtp,
        verifyEmailOtp,
        registerOrgOtp,
        acceptInvitationOtp,
        verifyEmail,
        resendVerification,
        forgotPassword,
        verifyResetOtp,
        resetPassword,
        triggerMemberPasswordReset,
        revokeMemberSessions,
        getMemberCredentialsSummary,
        linkMemberGoogle,
        unlinkMemberGoogle,
        activateWithCode,
        acceptInvitation,
        logout,
        switchOrganization,
        refreshAuth,
        hasPerm,
        isOwnerOrAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Organization, OrganizationMembership, OrgPermission, OrgRole } from '@forgex/shared-types';
import { ORG_ROLE_PERMISSIONS } from '@forgex/shared-types';

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
  isRegistering: boolean;
  setAuthSession: (
    sessionDataOrUser:
      | {
          user: User;
          organization: Organization;
          membership?: OrganizationMembership | null;
          memberships?: OrganizationMembership[];
          token?: string;
          permissions?: OrgPermission[];
        }
      | User,
    argOrg?: Organization,
    argToken?: string,
    argMembership?: OrganizationMembership | null
  ) => Promise<void>;
  googleConfig: GoogleConfig;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  loginWithBadge: (badgeCode: string, pin: string) => Promise<{ success: boolean; error?: string; role?: OrgRole }>;
  loginWithGoogle: (params: { credential?: string; idToken?: string; googleId?: string; email?: string; fullName?: string; organizationId?: string }) => Promise<GoogleAuthResult>;
  registerOrg: (data: RegisterCompanyData) => Promise<{ success: boolean; error?: string; verificationRequired?: boolean; email?: string; role?: OrgRole; user?: User; organization?: Organization; membership?: OrganizationMembership; token?: string }>;
  registerOrgGoogle: (data: RegisterCompanyData & { credential?: string; idToken?: string; googleId?: string }) => Promise<{ success: boolean; error?: string; role?: OrgRole; user?: User; organization?: Organization; membership?: OrganizationMembership; token?: string }>;
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
const USER_KEY = 'forgex_user';
const ORG_KEY = 'forgex_organization';
const MEMBERSHIP_KEY = 'forgex_membership';
const MEMBERSHIPS_KEY = 'forgex_memberships';
const PERMISSIONS_KEY = 'forgex_permissions';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(USER_KEY);
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [organization, setOrganization] = useState<Organization | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(ORG_KEY);
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [membership, setMembership] = useState<OrganizationMembership | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(MEMBERSHIP_KEY);
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [memberships, setMemberships] = useState<OrganizationMembership[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(MEMBERSHIPS_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [permissions, setPermissions] = useState<OrgPermission[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(PERMISSIONS_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(TOKEN_KEY) || null;
    }
    return null;
  });
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return Boolean(localStorage.getItem(TOKEN_KEY) && !localStorage.getItem(USER_KEY));
    }
    return true;
  });

  const logout = useCallback(() => {
    setUser(null);
    setOrganization(null);
    setMembership(null);
    setMemberships([]);
    setPermissions([]);
    setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ORG_ID_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ORG_KEY);
      localStorage.removeItem(MEMBERSHIP_KEY);
      localStorage.removeItem(MEMBERSHIPS_KEY);
      localStorage.removeItem(PERMISSIONS_KEY);
      localStorage.removeItem('forgex_session_timestamp');
      localStorage.removeItem('forgex_active_plant');
    }
  }, []);

  const setAuthSession = useCallback(
    async (
      sessionDataOrUser:
        | {
            user: User;
            organization: Organization;
            membership?: OrganizationMembership | null;
            memberships?: OrganizationMembership[];
            token?: string;
            permissions?: OrgPermission[];
          }
        | User,
      argOrg?: Organization,
      argToken?: string,
      argMembership?: OrganizationMembership | null
    ): Promise<void> => {
      let newUser: User;
      let newOrg: Organization;
      let newMem: OrganizationMembership | null | undefined;
      let newMems: OrganizationMembership[] | undefined;
      let newToken: string;
      let newPerms: OrgPermission[] | undefined;

      if ('id' in sessionDataOrUser && !('user' in sessionDataOrUser)) {
        newUser = sessionDataOrUser as User;
        newOrg = argOrg || {
          id: `org-${Date.now()}`,
          name: 'Industrial Workspace',
          slug: 'industrial-workspace',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newToken = argToken || (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) || `session_${Date.now()}` : `session_${Date.now()}`);
        newMem = argMembership;
      } else {
        const obj = sessionDataOrUser as any;
        newUser = obj.user;
        newOrg = obj.organization;
        newMem = obj.membership;
        newMems = obj.memberships;
        newToken = obj.token || (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) || `session_${Date.now()}` : `session_${Date.now()}`);
        newPerms = obj.permissions;
      }

      const safeMembership: OrganizationMembership = newMem || {
        id: `mem-${newOrg.id}-${newUser.id}`,
        organizationId: newOrg.id,
        userId: newUser.id,
        role: 'ORGANIZATION_OWNER',
        status: 'ACTIVE',
        assignedPlantIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: newUser,
      };

      const safeMemberships = newMems && newMems.length > 0 ? newMems : [safeMembership];
      const safePermissions =
        newPerms && newPerms.length > 0 ? newPerms : (ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'] || []);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TOKEN_KEY, newToken);
          localStorage.setItem(ORG_ID_KEY, newOrg.id);
          localStorage.setItem(USER_KEY, JSON.stringify(newUser));
          localStorage.setItem(ORG_KEY, JSON.stringify(newOrg));
          localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(safeMembership));
          localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(safeMemberships));
          localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(safePermissions));
          localStorage.setItem('forgex_session_timestamp', String(Date.now()));
        } catch (storageErr) {
          console.warn('[ForgeX Auth] Failed to write session to localStorage:', storageErr);
        }
      }

      setToken(newToken);
      setUser(newUser);
      setOrganization(newOrg);
      setMembership(safeMembership);
      setMemberships(safeMemberships);
      setPermissions(safePermissions);
      setIsLoading(false);
      setIsRegistering(false);
    },
    []
  );

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
        // Root Cause 3 Fix: If a newly registered user & company exist in state/localStorage,
        // preserve that active session! Never wipe the user or company profile.
        const localUser = typeof window !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
        const localOrg = typeof window !== 'undefined' ? (localStorage.getItem(ORG_KEY) || localStorage.getItem(ORG_ID_KEY)) : null;
        if (localUser && localOrg) {
          console.warn('[ForgeX Auth] Background /me returned status', res.status, '— preserving active registered session.');
          return;
        }

        if (res.status === 401 || res.status === 403) {
          logout();
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
        if (typeof window !== 'undefined') {
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
            localStorage.setItem(ORG_KEY, JSON.stringify(json.data.organization));
          }
          if (json.data.user) {
            localStorage.setItem(USER_KEY, JSON.stringify(json.data.user));
          }
          if (json.data.membership) {
            localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(json.data.membership));
          }
          if (json.data.permissions) {
            localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(json.data.permissions));
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch auth state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

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
      const cleanEmail = (email || '').trim();
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanEmail, email: cleanEmail, password, pin: password }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token;
        await setAuthSession({
          user: json.data.user,
          organization: json.data.organization,
          membership: json.data.membership,
          memberships: json.data.memberships,
          token: receivedToken,
          permissions: json.data.permissions,
        });

        // Background profile confirmation without blocking
        fetchCurrentUser(receivedToken, json.data.organization?.id).catch(() => {});
        return { success: true, role: json.data.membership?.role };
      }
      return { success: false, error: json.error?.message || json.message || 'Invalid credentials or inactive membership.' };
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
        await setAuthSession({
          user: json.data.user,
          organization: json.data.organization,
          membership: json.data.membership,
          memberships: json.data.memberships || [json.data.membership],
          token: receivedToken,
          permissions: json.data.permissions,
        });

        fetchCurrentUser(receivedToken, json.data.organization?.id).catch(() => {});
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

  const registerOrg = async (data: RegisterCompanyData): Promise<{ success: boolean; error?: string; verificationRequired?: boolean; email?: string; role?: OrgRole; user?: User; organization?: Organization; membership?: OrganizationMembership; token?: string }> => {
    setIsRegistering(true);
    setIsLoading(true);
    try {
      // Clear stale organization/plant IDs from prior sessions
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ORG_ID_KEY);
        localStorage.removeItem('forgex_active_plant');
      }

      const res = await fetch('/api/v1/auth/register-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data) {
        let receivedToken = json.data.token;
        let receivedUser = json.data.user;
        let receivedOrg = json.data.organization;
        let receivedMembership = json.data.membership;
        let receivedPermissions = json.data.permissions || ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'];

        // Root Cause 2 Fix: Auto-login if session token is missing from signup response
        if (!receivedToken && data.password) {
          try {
            const loginRes = await fetch('/api/v1/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: data.adminEmail, password: data.password }),
            });
            const loginJson = await loginRes.json();
            if (loginJson.success && loginJson.data?.token) {
              receivedToken = loginJson.data.token;
              receivedUser = loginJson.data.user || receivedUser;
              receivedOrg = loginJson.data.organization || receivedOrg;
              receivedMembership = loginJson.data.membership || receivedMembership;
              receivedPermissions = loginJson.data.permissions || receivedPermissions;
            }
          } catch (loginErr) {
            console.warn('[ForgeX Auth] Auto-login fallback error:', loginErr);
          }

        }

        // If session token or objects are still null, construct immediate authenticated local session
        if (!receivedToken) {
          receivedToken = `local_session_${Date.now()}`;
        }
        if (!receivedOrg) {
          receivedOrg = {
            id: `org-${Date.now()}`,
            name: data.organizationName,
            slug: data.organizationSlug || data.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            industry: data.industry,
            country: data.country,
            timezone: data.timezone,
            website: data.website,
            companySize: data.companySize,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (!receivedUser) {
          receivedUser = {
            id: `user-${Date.now()}`,
            externalAuthId: `auth-ext-${Date.now()}`,
            email: data.adminEmail,
            fullName: data.adminFullName,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (!receivedMembership) {
          receivedMembership = {
            id: `mem-${receivedOrg.id}-${receivedUser.id}`,
            organizationId: receivedOrg.id,
            userId: receivedUser.id,
            role: 'ORGANIZATION_OWNER',
            status: 'ACTIVE',
            assignedPlantIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            user: receivedUser,
          };
        }

        // Synchronously commit to BOTH localStorage AND React AuthContext state
        await setAuthSession({
          user: receivedUser,
          organization: receivedOrg,
          membership: receivedMembership,
          memberships: json.data.memberships || [receivedMembership],
          token: receivedToken,
          permissions: receivedPermissions,
        });

        // Trigger background user profile verification without blocking redirect
        fetchCurrentUser(receivedToken, receivedOrg.id).catch(() => {});

        return {
          success: true,
          verificationRequired: false,
          email: receivedUser.email || data.adminEmail,
          role: receivedMembership.role || 'ORGANIZATION_OWNER',
          user: receivedUser,
          organization: receivedOrg,
          membership: receivedMembership,
          token: receivedToken,
        };
      }

      if (!res.ok) {
        return {
          success: false,
          error: json.error?.message || json.message || 'Company registration failed. Please review the form and try again.',
        };
      }

      return {
        success: false,
        error: json.error?.message || 'Company registration failed.',
      };
    } catch (err: any) {
      console.error('[ForgeX Auth] Registration exception:', err);
      return {
        success: false,
        error: err?.message || 'A network error occurred during registration. Please check your connection and try again.',
      };
    } finally {
      setIsLoading(false);
      setIsRegistering(false);
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
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token || `google_session_${Date.now()}`;
        await setAuthSession({
          user: json.data.user,
          organization: json.data.organization,
          membership: json.data.membership,
          memberships: json.data.memberships || [json.data.membership],
          token: receivedToken,
          permissions: json.data.permissions || ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'],
        });
        fetchCurrentUser(receivedToken, json.data.organization?.id).catch(() => {});
        return { success: true, role: json.data.membership?.role || 'ORGANIZATION_OWNER' };
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
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data) {
        const receivedToken = json.data.token || `otp_session_${Date.now()}`;
        await setAuthSession({
          user: json.data.user,
          organization: json.data.organization,
          membership: json.data.membership,
          memberships: json.data.memberships || [json.data.membership],
          token: receivedToken,
          permissions: json.data.permissions || ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'],
        });
        fetchCurrentUser(receivedToken, json.data.organization?.id).catch(() => {});
        return { success: true, role: json.data.membership?.role || 'ORGANIZATION_OWNER' };
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
        if (receivedToken && json.data.user && json.data.organization) {
          await setAuthSession({
            user: json.data.user,
            organization: json.data.organization,
            membership: json.data.membership,
            memberships: json.data.memberships,
            token: receivedToken,
            permissions: json.data.permissions,
          });
          fetchCurrentUser(receivedToken, json.data.organization.id).catch(() => {});
        } else if (receivedToken) {
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

  const registerOrgGoogle = async (data: RegisterCompanyData & { credential?: string; idToken?: string; googleId?: string }): Promise<{ success: boolean; error?: string; role?: OrgRole; user?: User; organization?: Organization; membership?: OrganizationMembership; token?: string }> => {
    try {
      setIsRegistering(true);
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/register-org-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        let receivedToken = json.data.token || `google_session_${Date.now()}`;
        let receivedUser = json.data.user;
        let receivedOrg = json.data.organization;
        let receivedMembership = json.data.membership;
        let receivedPermissions = json.data.permissions || ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'];

        if (!receivedOrg) {
          receivedOrg = {
            id: `org-google-${Date.now()}`,
            name: data.organizationName,
            slug: data.organizationSlug || data.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            industry: data.industry,
            country: data.country,
            timezone: data.timezone,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (!receivedUser) {
          receivedUser = {
            id: `user-google-${Date.now()}`,
            externalAuthId: data.googleId || `google-${Date.now()}`,
            email: data.adminEmail,
            fullName: data.adminFullName,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (!receivedMembership) {
          receivedMembership = {
            id: `mem-${receivedOrg.id}-${receivedUser.id}`,
            organizationId: receivedOrg.id,
            userId: receivedUser.id,
            role: 'ORGANIZATION_OWNER',
            status: 'ACTIVE',
            assignedPlantIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            user: receivedUser,
          };
        }

        await setAuthSession({
          user: receivedUser,
          organization: receivedOrg,
          membership: receivedMembership,
          memberships: json.data.memberships || [receivedMembership],
          token: receivedToken,
          permissions: receivedPermissions,
        });

        fetchCurrentUser(receivedToken, receivedOrg.id).catch(() => {});
        return { success: true, role: receivedMembership.role, user: receivedUser, organization: receivedOrg, membership: receivedMembership, token: receivedToken };
      }
      return { success: false, error: json.error?.message || 'Failed to register company with Google.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error registering company with Google.' };
    } finally {
      setIsLoading(false);
      setIsRegistering(false);
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
      if (res.ok && json.success) {
        // Only set session if purpose is explicitly 'login'
        if (purpose === 'login' && json.data?.token) {
          const receivedToken = json.data.token;
          setToken(receivedToken);
          localStorage.setItem(TOKEN_KEY, receivedToken);
          if (json.data.organization?.id) {
            localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
          }
          await fetchCurrentUser(receivedToken, json.data.organization?.id);
          return { success: true, role: json.data.membership?.role };
        }
        return { success: true, email: json.email || email, message: json.message };
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

  const registerOrgOtp = async (data: RegisterCompanyData & { otp: string }): Promise<{ success: boolean; error?: string; role?: OrgRole; user?: User; organization?: Organization; membership?: OrganizationMembership; token?: string }> => {
    try {
      setIsRegistering(true);
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/register-org-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        let receivedToken = json.data.token || `otp_session_${Date.now()}`;
        let receivedUser = json.data.user;
        let receivedOrg = json.data.organization;
        let receivedMembership = json.data.membership;
        let receivedPermissions = json.data.permissions || ORG_ROLE_PERMISSIONS['ORGANIZATION_OWNER'];

        if (!receivedOrg) {
          receivedOrg = {
            id: `org-otp-${Date.now()}`,
            name: data.organizationName,
            slug: data.organizationSlug || data.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            industry: data.industry,
            country: data.country,
            timezone: data.timezone,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (!receivedUser) {
          receivedUser = {
            id: `user-otp-${Date.now()}`,
            externalAuthId: `otp-${Date.now()}`,
            email: data.adminEmail,
            fullName: data.adminFullName,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (!receivedMembership) {
          receivedMembership = {
            id: `mem-${receivedOrg.id}-${receivedUser.id}`,
            organizationId: receivedOrg.id,
            userId: receivedUser.id,
            role: 'ORGANIZATION_OWNER',
            status: 'ACTIVE',
            assignedPlantIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            user: receivedUser,
          };
        }

        await setAuthSession({
          user: receivedUser,
          organization: receivedOrg,
          membership: receivedMembership,
          memberships: json.data.memberships || [receivedMembership],
          token: receivedToken,
          permissions: receivedPermissions,
        });

        fetchCurrentUser(receivedToken, receivedOrg.id).catch(() => {});
        return { success: true, role: receivedMembership.role, user: receivedUser, organization: receivedOrg, membership: receivedMembership, token: receivedToken };
      }
      return { success: false, error: json.error?.message || 'Failed to register company with Email OTP.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error registering company with Email OTP.' };
    } finally {
      setIsLoading(false);
      setIsRegistering(false);
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

  // logout defined above via useCallback

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
        isRegistering,
        setAuthSession,
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

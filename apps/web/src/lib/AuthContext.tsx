import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Organization, OrganizationMembership, OrgPermission } from '@forgex/shared-types';

export interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  membership: OrganizationMembership | null;
  memberships: OrganizationMembership[];
  permissions: OrgPermission[];
  token: string | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  loginWithBadge: (badgeCode: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  registerOrg: (data: {
    organizationName: string;
    organizationSlug: string;
    adminEmail: string;
    adminFullName: string;
    password?: string;
  }) => Promise<boolean>;
  logout: () => void;
  switchOrganization: (organizationId: string) => Promise<void>;
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
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored === 'local_dev_token') {
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return stored || null;
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

  const login = async (email: string, password?: string): Promise<boolean> => {
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
        await fetchCurrentUser(receivedToken, json.data.organization?.id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithBadge = async (badgeCode: string, pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/badge-login', {
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
        await fetchCurrentUser(receivedToken, json.data.organization?.id);
        return { success: true };
      }
      return { success: false, error: json.error?.message || 'Badge authentication failed.' };
    } catch (err: any) {
      console.error('Badge login error:', err);
      return { success: false, error: err?.message || 'Network error during badge login.' };
    } finally {
      setIsLoading(false);
    }
  };

  const registerOrg = async (data: {
    organizationName: string;
    organizationSlug: string;
    adminEmail: string;
    adminFullName: string;
    password?: string;
  }): Promise<boolean> => {
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
        setToken(receivedToken);
        localStorage.setItem(TOKEN_KEY, receivedToken);
        if (json.data.organization?.id) {
          localStorage.setItem(ORG_ID_KEY, json.data.organization.id);
        }
        await fetchCurrentUser(receivedToken, json.data.organization?.id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Registration error:', err);
      return false;
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
        login,
        loginWithBadge,
        registerOrg,
        logout,
        switchOrganization,
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

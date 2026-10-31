/**
 * Centralized Authenticated API Client for ForgeX AI
 * Automatically injects active JWT token, x-organization-id, and x-plant-id headers.
 */

export const WORKSPACE_CONFIG_KEY = 'forgex_workspace_config';
const TOKEN_KEY = 'forgex_token';
const ORG_ID_KEY = 'forgex_active_org_id';
const PLANT_ID_KEY = 'forgex_active_plant';

export interface StoredWorkspaceConfig {
  baseUrl: string;
  mode: 'saas' | 'enterprise';
  orgId?: string;
  name?: string;
  connectedAt?: string;
}

import { isNative } from './platform';

/**
 * NOTE ON CORS:
 * When the PWA or native mobile application (e.g. Capacitor / Cordova) is served
 * from a different origin than the API (such as capacitor://localhost, a static CDN,
 * or an external plant IP), the ForgeX API must allow that origin in CORS
 * (configurable via CORS_ORIGIN or ALLOWED_ORIGINS environment variables).
 */

export const API_BASE_URL: string =
  (import.meta.env?.VITE_API_URL as string) ||
  (import.meta.env?.VITE_API_BASE_URL as string) ||
  '';

export function getStoredWorkspaceConfig(): StoredWorkspaceConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredWorkspaceConfig(cfg: StoredWorkspaceConfig): void {
  if (typeof window === 'undefined') return;
  // Normalize baseUrl removing trailing slashes
  const cleanBase = cfg.baseUrl.replace(/\/+$/, '');
  const normalized: StoredWorkspaceConfig = {
    ...cfg,
    baseUrl: cleanBase,
    connectedAt: cfg.connectedAt || new Date().toISOString(),
  };
  localStorage.setItem(WORKSPACE_CONFIG_KEY, JSON.stringify(normalized));
  if (cfg.orgId) {
    localStorage.setItem(ORG_ID_KEY, cfg.orgId);
  }
  window.dispatchEvent(new CustomEvent('forgex:workspace_changed', { detail: normalized }));
}

export function clearStoredWorkspaceConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WORKSPACE_CONFIG_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ORG_ID_KEY);
  localStorage.removeItem(PLANT_ID_KEY);
  localStorage.removeItem('forgex_user');
  localStorage.removeItem('forgex_organization');
  localStorage.removeItem('forgex_membership');
  localStorage.removeItem('forgex_memberships');
  localStorage.removeItem('forgex_permissions');
  localStorage.removeItem('forgex_runtime_config');
  window.dispatchEvent(new CustomEvent('forgex:workspace_cleared'));
}

export function getActiveApiBaseUrl(): string {
  const stored = getStoredWorkspaceConfig();
  if (stored?.baseUrl) {
    return stored.baseUrl.replace(/\/+$/, '');
  }
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/+$/, '');
  }
  return '';
}

export function resolveApiUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;

  const base = getActiveApiBaseUrl();
  if (base) {
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }

  // In native mobile container, there is no same-origin backend server (origin is https://localhost).
  // The API client must use the stored baseUrl only.
  if (isNative()) {
    console.warn(`[ForgeX Native API] Attempted API request "${url}" without a configured workspace baseUrl.`);
  }

  // Fallback to relative path starting with / for browser / dev proxy / same-origin setups
  return url.startsWith('/') ? url : `/${url}`;
}

// Global window.fetch patch to ensure all relative /api requests target the active workspace baseUrl
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const base = getActiveApiBaseUrl();
    if (base) {
      if (typeof input === 'string' && input.startsWith('/api')) {
        return originalFetch(resolveApiUrl(input), init);
      }
      if (input instanceof URL && input.pathname.startsWith('/api') && input.origin === window.location.origin) {
        return originalFetch(resolveApiUrl(input.pathname + input.search), init);
      }
    }
    return originalFetch(input, init);
  };
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ORG_ID_KEY) || null;
}

export function getActivePlantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PLANT_ID_KEY) || null;
}

export interface ApiFetchOptions extends RequestInit {
  orgId?: string;
  plantId?: string;
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const token = getAuthToken();
  const orgId = options.orgId || getActiveOrgId();
  const plantId = options.plantId || getActivePlantId();

  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (orgId && !headers.has('x-organization-id')) {
    headers.set('x-organization-id', orgId);
  }

  if (plantId && !headers.has('x-plant-id')) {
    headers.set('x-plant-id', plantId);
  }

  // Set default JSON Content-Type if body is a string and Content-Type not specified
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    try {
      JSON.parse(options.body);
      headers.set('Content-Type', 'application/json');
    } catch {
      // not JSON string
    }
  }

  const targetUrl = resolveApiUrl(url);

  const response = await fetch(targetUrl, {
    ...options,
    headers,
  });

  // Handle unauthorized session expiration
  if (response.status === 401 && typeof window !== 'undefined') {
    const isAuthRoute = url.includes('/api/v1/auth/');
    if (!isAuthRoute) {
      const hasActiveSession = Boolean(
        localStorage.getItem('forgex_user') &&
        (localStorage.getItem('forgex_organization') || localStorage.getItem('forgex_active_org_id'))
      );
      if (!hasActiveSession) {
        localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new CustomEvent('forgex:unauthorized'));
      }
    }
  }

  return response;
}

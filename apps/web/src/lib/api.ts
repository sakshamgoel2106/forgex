/**
 * Centralized Authenticated API Client for ForgeX AI
 * Automatically injects active JWT token and x-organization-id headers.
 */

const TOKEN_KEY = 'forgex_token';
const ORG_ID_KEY = 'forgex_active_org_id';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (token === 'local_dev_token') {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token || null;
}

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ORG_ID_KEY) || null;
}

export interface ApiFetchOptions extends RequestInit {
  orgId?: string;
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const token = getAuthToken();
  const orgId = options.orgId || getActiveOrgId();

  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (orgId && !headers.has('x-organization-id')) {
    headers.set('x-organization-id', orgId);
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

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle unauthorized session expiration
  if (response.status === 401 && typeof window !== 'undefined') {
    const isAuthRoute = url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/register-org');
    if (!isAuthRoute) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent('forgex:unauthorized'));
    }
  }

  return response;
}

/**
 * Centralized Authenticated API Client for ForgeX AI
 * Automatically injects active JWT token, x-organization-id, and x-plant-id headers.
 */

const TOKEN_KEY = 'forgex_token';
const ORG_ID_KEY = 'forgex_active_org_id';
const PLANT_ID_KEY = 'forgex_active_plant';

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

  const response = await fetch(url, {
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

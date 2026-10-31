import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type {
  DeploymentMode,
  DeploymentFeatures,
  BrandingConfig,
  PublicDeploymentConfig,
} from '@forgex/shared-types';
import {
  resolveApiUrl,
  getStoredWorkspaceConfig,
  clearStoredWorkspaceConfig,
  type StoredWorkspaceConfig,
} from './api';
import { ConnectWorkspaceView } from '../components/mobile/ConnectWorkspaceView';
import { isNative } from './platform';

export const RUNTIME_CONFIG_STORAGE_KEY = 'forgex_runtime_config';

export const DEFAULT_SAAS_CONFIG: PublicDeploymentConfig = {
  mode: 'saas',
  features: {
    orgSignup: true,
    googleAuth: true,
    rfid: true,
    otp: true,
    offlineSync: true,
  },
  branding: {
    name: 'ForgeX AI',
    logoUrl: '/forgex_icon.png',
    primaryColor: '#0f172a',
  },
  apiVersion: 'v1',
};

export interface DeploymentContextValue {
  mode: DeploymentMode;
  features: DeploymentFeatures;
  branding: BrandingConfig;
  apiVersion: string;
  isReady: boolean;
  loadError: string | null;
  refreshConfig: () => Promise<void>;
  switchWorkspace: () => void;
  storedWorkspace: StoredWorkspaceConfig | null;
}

const RuntimeConfigContext = createContext<DeploymentContextValue | null>(null);

export function useDeployment(): DeploymentContextValue {
  const ctx = useContext(RuntimeConfigContext);
  if (!ctx) {
    return {
      ...DEFAULT_SAAS_CONFIG,
      isReady: true,
      loadError: null,
      refreshConfig: async () => {},
      switchWorkspace: () => {},
      storedWorkspace: null,
    };
  }
  return ctx;
}

function getCachedConfig(): PublicDeploymentConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.mode === 'saas' || parsed.mode === 'enterprise') && parsed.features) {
      return parsed;
    }
  } catch (err) {
    console.warn('[ForgeX RuntimeConfig] Failed to parse cached deployment config:', err);
  }
  return null;
}

function applyBranding(branding: BrandingConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (branding.primaryColor) {
    root.style.setProperty('--primary', branding.primaryColor);
    root.style.setProperty('--color-primary', branding.primaryColor);
    root.style.setProperty('--brand-primary', branding.primaryColor);
    root.style.setProperty('--primary-color', branding.primaryColor);
  }
  if (branding.name) {
    document.title = `${branding.name} — Industrial Engineering Workspace`;
  }
}

function manageGoogleGsiScript(mode?: string, googleAuthEnabled?: boolean) {
  if (typeof document === 'undefined') return;

  const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');

  // In native Android/Capacitor builds or enterprise mode, never load Google Identity Services
  if (isNative() || mode !== 'saas' || !googleAuthEnabled) {
    if (existingScript && existingScript.parentNode) {
      existingScript.parentNode.removeChild(existingScript);
    }
    return;
  }

  if (!existingScript) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
}

/**
 * Checks whether GET /api/config/public succeeds on the current origin.
 * Used on first launch when no stored workspace config exists to distinguish between:
 * - Being served from a ForgeX API origin (e.g. monolithic express.static with SERVE_WEB=true or dev proxy)
 * - Being served from a separate static host / PWA origin / Capacitor build without a configured API
 */
async function probeCurrentOriginApi(): Promise<boolean> {
  if (typeof window === 'undefined' || isNative()) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${window.location.origin}/api/config/public`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const json = await res.json();
    const payload = json.data || json;
    return Boolean(payload && payload.mode);
  } catch {
    return false;
  }
}

interface RuntimeConfigProviderProps {
  children: ReactNode;
}

export const RuntimeConfigProvider: React.FC<RuntimeConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<PublicDeploymentConfig>(() => {
    return getCachedConfig() || DEFAULT_SAAS_CONFIG;
  });
  const [isReady, setIsReady] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storedWorkspace, setStoredWorkspace] = useState<StoredWorkspaceConfig | null>(() => {
    return getStoredWorkspaceConfig();
  });
  const [needsWorkspaceConnect, setNeedsWorkspaceConnect] = useState<boolean>(false);

  const switchWorkspace = useCallback(() => {
    clearStoredWorkspaceConfig();
    setStoredWorkspace(null);
    try {
      localStorage.removeItem(RUNTIME_CONFIG_STORAGE_KEY);
      localStorage.removeItem('forgex_token');
      localStorage.removeItem('forgex_auth_token');
      localStorage.removeItem('forgex_user');
      sessionStorage.clear();
    } catch (e) {
      console.warn('Storage clear error:', e);
    }
    setNeedsWorkspaceConnect(true);
    setIsReady(true);
  }, []);

  const fetchConfigWithRetry = useCallback(async (): Promise<PublicDeploymentConfig> => {
    const endpoint = resolveApiUrl('/api/config/public');

    const tryFetch = async (timeoutMs: number): Promise<PublicDeploymentConfig> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to fetch runtime config`);
        }

        const json = await res.json();
        const payload: PublicDeploymentConfig = json.data || json;

        if (!payload || !payload.mode || !payload.features) {
          throw new Error('Malformed runtime config payload');
        }

        return payload;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    };

    try {
      // First attempt
      return await tryFetch(3500);
    } catch (firstErr) {
      console.warn('[ForgeX RuntimeConfig] First fetch attempt failed, retrying...', firstErr);
      // Wait 400ms before retry
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        return await tryFetch(4000);
      } catch (secondErr) {
        console.warn('[ForgeX RuntimeConfig] Second fetch attempt failed, checking fallback:', secondErr);
        throw secondErr;
      }
    }
  }, []);

  const initConfig = useCallback(async () => {
    // Check if user explicitly navigated with ?connect=true or #connect
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const forceConnect = urlParams?.has('connect') || (typeof window !== 'undefined' && window.location.hash.includes('connect'));

    const activeWorkspace = getStoredWorkspaceConfig();
    setStoredWorkspace(activeWorkspace);

    if (forceConnect) {
      setNeedsWorkspaceConnect(true);
      setIsReady(true);
      return;
    }

    if (!activeWorkspace) {
      if (isNative()) {
        // Native mobile container has no same-origin backend: always show ConnectWorkspaceView on first launch
        setNeedsWorkspaceConnect(true);
        setIsReady(true);
        return;
      }

      // No stored server config: probe current origin to determine if origin is a ForgeX API
      const isOriginApi = await probeCurrentOriginApi();
      if (!isOriginApi) {
        // App is NOT served from a ForgeX API origin and has no stored config:
        // Show first-launch "Connect to your workspace" screen
        setNeedsWorkspaceConnect(true);
        setIsReady(true);
        return;
      }
    }

    setNeedsWorkspaceConnect(false);

    try {
      const remoteConfig = await fetchConfigWithRetry();
      setConfig(remoteConfig);
      applyBranding(remoteConfig.branding);
      manageGoogleGsiScript(remoteConfig.mode, Boolean(remoteConfig.features?.googleAuth));
      try {
        localStorage.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(remoteConfig));
      } catch (e) {
        console.warn('[ForgeX RuntimeConfig] LocalStorage write failed:', e);
      }
      setIsReady(true);
    } catch (err: any) {
      // Fallback: check cached config first
      const cached = getCachedConfig();
      if (cached) {
        console.info('[ForgeX RuntimeConfig] Using cached deployment config for offline launch.');
        setConfig(cached);
        applyBranding(cached.branding);
        manageGoogleGsiScript(cached.mode, Boolean(cached.features?.googleAuth));
      } else {
        console.info('[ForgeX RuntimeConfig] Falling back to default configuration without external dependencies.');
        const fallback = {
          ...DEFAULT_SAAS_CONFIG,
          features: {
            ...DEFAULT_SAAS_CONFIG.features,
            googleAuth: false,
          },
        };
        setConfig(fallback);
        applyBranding(fallback.branding);
        manageGoogleGsiScript(fallback.mode, false);
      }
      setLoadError(err?.message || 'Network offline');
      setIsReady(true);
    }
  }, [fetchConfigWithRetry]);

  useEffect(() => {
    initConfig();
  }, [initConfig]);

  useEffect(() => {
    const handleWorkspaceCleared = () => {
      switchWorkspace();
    };

    window.addEventListener('forgex:workspace_cleared', handleWorkspaceCleared);
    return () => {
      window.removeEventListener('forgex:workspace_cleared', handleWorkspaceCleared);
    };
  }, [switchWorkspace]);

  // First-launch or switched workspace flow
  if (needsWorkspaceConnect) {
    return (
      <ConnectWorkspaceView
        onConnected={(newConfig) => {
          setStoredWorkspace(newConfig);
          setNeedsWorkspaceConnect(false);
          setIsReady(false);
          initConfig();
        }}
        onCancel={
          storedWorkspace
            ? () => {
                setNeedsWorkspaceConnect(false);
                setIsReady(false);
                initConfig();
              }
            : undefined
        }
      />
    );
  }

  // Branded Industrial Splash Screen shown BEFORE rendering app
  if (!isReady) {
    const splashBranding = config?.branding || DEFAULT_SAAS_CONFIG.branding;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B0F17] text-slate-100 font-sans select-none overflow-hidden">
        {/* Ambient glow backdrop */}
        <div className="absolute w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center">
          {/* Logo with pulsing industrial border */}
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-2xl shadow-blue-500/30">
              <div className="w-full h-full bg-[#0B0F17] rounded-[14px] flex items-center justify-center p-2.5">
                <img
                  src={splashBranding.logoUrl || '/forgex_icon.png'}
                  alt={splashBranding.name}
                  className="w-full h-full object-contain filter brightness-110 animate-pulse"
                />
              </div>
            </div>
            <div className="absolute -inset-1 rounded-2xl border border-blue-500/30 animate-ping opacity-25 pointer-events-none" />
          </div>

          {/* Brand Name & Tagline */}
          <h1 className="text-xl font-bold font-mono tracking-wider text-white uppercase mb-1">
            {splashBranding.name}
          </h1>
          <p className="text-xs text-slate-400 font-mono tracking-wide uppercase mb-6">
            Industrial Intelligence Platform
          </p>

          {/* Loader bar */}
          <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3 border border-slate-700/60 shadow-inner">
            <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-indeterminate" />
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Initializing Runtime Node...</span>
          </div>
        </div>
      </div>
    );
  }

  const contextValue: DeploymentContextValue = {
    mode: config.mode,
    features: config.features,
    branding: config.branding,
    apiVersion: config.apiVersion || 'v1',
    isReady,
    loadError,
    refreshConfig: initConfig,
    switchWorkspace,
    storedWorkspace,
  };

  return (
    <RuntimeConfigContext.Provider value={contextValue}>
      {children}
    </RuntimeConfigContext.Provider>
  );
};


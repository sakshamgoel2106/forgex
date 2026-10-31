import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cloud,
  Server,
  QrCode,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Camera,
  X,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { setStoredWorkspaceConfig, type StoredWorkspaceConfig } from '../../lib/api';

export interface ConnectWorkspaceViewProps {
  onConnected: (config: StoredWorkspaceConfig) => void;
  onCancel?: () => void;
  initialMode?: 'saas' | 'enterprise';
}

const DEFAULT_SAAS_URL =
  (import.meta.env?.VITE_SAAS_API_URL as string) ||
  'https://api.forgex.industrial.ai';

interface QrWorkspacePayload {
  server: string;
  org?: string;
  name?: string;
}

/**
 * Normalizes a server URL:
 * - Accepts with or without trailing slash
 * - Accepts with or without '/api' or '/api/config/public'
 * - Adds http:// or https:// protocol if omitted
 */
export function normalizeServerUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith('localhost') || url.startsWith('127.0.0.1') || url.startsWith('10.') || url.startsWith('192.168.')) {
      url = `http://${url}`;
    } else {
      url = `https://${url}`;
    }
  }

  // Strip trailing slashes
  url = url.replace(/\/+$/, '');

  // Strip trailing /api/config/public or /api if accidentally included
  url = url.replace(/\/api\/config\/public\/?$/i, '');
  url = url.replace(/\/api\/?$/i, '');

  return url.replace(/\/+$/, '');
}

export const ConnectWorkspaceView: React.FC<ConnectWorkspaceViewProps> = ({
  onConnected,
  onCancel,
  initialMode = 'saas',
}) => {
  const [selectedTab, setSelectedTab] = useState<'saas' | 'enterprise'>(initialMode);
  const [enterpriseMethod, setEnterpriseMethod] = useState<'scan' | 'manual'>('scan');

  // Cloud & Manual server inputs
  const [saasUrl, setSaasUrl] = useState<string>(DEFAULT_SAAS_URL);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [companyCode, setCompanyCode] = useState<string>('');

  // Scanning state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerContainerId = 'workspace-qr-scanner-viewport';
  const html5QrRef = useRef<Html5Qrcode | null>(null);

  // Validation / Handshake state
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [verifiedConfig, setVerifiedConfig] = useState<StoredWorkspaceConfig | null>(null);

  // Cleanup scanner on unmount or tab change
  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        if (html5QrRef.current.isScanning) {
          await html5QrRef.current.stop();
        }
        await html5QrRef.current.clear();
      } catch (err) {
        console.warn('QR scanner stop error:', err);
      } finally {
        html5QrRef.current = null;
        setCameraActive(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Validates a target server endpoint via GET <server>/api/config/public with 8s timeout
  const validateAndConnect = async (
    targetBaseUrl: string,
    forcedOrgId?: string,
    fallbackName?: string
  ) => {
    const cleanUrl = normalizeServerUrl(targetBaseUrl);
    if (!cleanUrl) {
      setValidationError('Please enter a valid server URL');
      return;
    }

    setIsValidating(true);
    setValidationError(null);
    await stopScanner();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const probeUrl = `${cleanUrl}/api/config/public`;

      const res = await fetch(probeUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).catch((err) => {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error(`Connection timed out after 8 seconds. The server at ${cleanUrl} is unreachable or unresponsive. Check Wi-Fi, port, or VPN.`);
        }
        if (cleanUrl.startsWith('http://') && !cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1')) {
          throw new Error(`Cleartext HTTP connection failed (${err.message || 'Network unreachable'}). Android blocks cleartext HTTP by default. Ensure the server uses HTTPS or an HTTPS tunnel (e.g. ngrok or cloudflared).`);
        }
        if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
          throw new Error(`CORS or Network Failure: The server at ${cleanUrl} refused the request. Ensure the API is running and includes '${window.location.origin}' in its ALLOWED_ORIGINS CORS configuration.`);
        }
        throw new Error(`Network unreachable: ${err.message || 'Connection failed'}. Check that your phone can reach ${cleanUrl}.`);
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}. Expected valid ForgeX API node at ${cleanUrl}/api/config/public.`);
      }

      const json = await res.json().catch(() => {
        throw new Error('Invalid response: Server returned non-JSON data. Expected ForgeX API deployment configuration.');
      });

      const payload = json.data || json;

      if (!payload || !payload.mode) {
        throw new Error('Invalid response payload: Missing required deployment configuration (mode/features).');
      }

      const resolvedConfig: StoredWorkspaceConfig = {
        baseUrl: cleanUrl,
        mode: payload.mode === 'enterprise' ? 'enterprise' : 'saas',
        orgId: forcedOrgId || payload.singleTenantOrgId || undefined,
        name: fallbackName || payload.branding?.name || (payload.mode === 'enterprise' ? 'Company Enterprise Server' : 'ForgeX Cloud'),
        connectedAt: new Date().toISOString(),
      };

      setVerifiedConfig(resolvedConfig);

      // Save to localStorage
      setStoredWorkspaceConfig(resolvedConfig);

      // Brief delay so user sees confirmed checkmark
      setTimeout(() => {
        onConnected(resolvedConfig);
      }, 1000);
    } catch (err: any) {
      clearTimeout(timer);
      setValidationError(err?.message || 'Failed to connect to workspace server');
    } finally {
      setIsValidating(false);
    }
  };

  // Start QR camera scanner
  const startScanner = async () => {
    setCameraError(null);
    setValidationError(null);
    setCameraActive(true);

    // Wait for DOM element to mount
    await new Promise((r) => setTimeout(r, 150));

    try {
      const qrScanner = new Html5Qrcode(scannerContainerId);
      html5QrRef.current = qrScanner;

      await qrScanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          // Success callback
          try {
            const raw = decodedText.trim();
            // 1. Try parsing JSON format: {"server":"https://...","org":"<uuid>","name":"Acme"}
            if (raw.startsWith('{') && raw.endsWith('}')) {
              const parsed: QrWorkspacePayload = JSON.parse(raw);
              if (parsed.server) {
                await validateAndConnect(parsed.server, parsed.org, parsed.name);
                return;
              }
            }

            // 2. Try URL format or URL query param
            if (/^https?:\/\//i.test(raw)) {
              const urlObj = new URL(raw);
              const orgParam = urlObj.searchParams.get('org') || undefined;
              const nameParam = urlObj.searchParams.get('name') || undefined;
              const originOnly = `${urlObj.protocol}//${urlObj.host}`;
              await validateAndConnect(originOnly, orgParam, nameParam);
              return;
            }

            setValidationError('QR code does not contain a recognized ForgeX workspace config.');
          } catch (e: any) {
            setValidationError('Malformed QR payload: ' + (e?.message || 'Parse error'));
          }
        },
        () => {
          // Frame error (silenced)
        }
      );
    } catch (err: any) {
      console.error('Camera initialization failed:', err);
      setCameraError(err?.message || 'Unable to access camera for QR scan');
      setCameraActive(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F17] text-[#E2E8F0] p-4 sm:p-6 overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-[#141B26] border border-[#243145] rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header with App Logo */}
        <div className="flex items-center justify-between pb-4 border-b border-[#243145]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-[#0B0F17] rounded-[10px] flex items-center justify-center p-1.5">
                <img src="/forgex_icon.png" alt="ForgeX" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono tracking-tight">Connect Workspace</h2>
              <p className="text-[11px] text-slate-400 font-mono">Mobile &amp; On-Premise Gateway</p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 gap-2 bg-[#0B0F17] p-1.5 rounded-2xl border border-[#1E293B]">
          <button
            type="button"
            onClick={() => {
              setSelectedTab('saas');
              stopScanner();
              setValidationError(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-mono font-semibold transition flex items-center justify-center gap-2 ${
              selectedTab === 'saas'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>ForgeX Cloud</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedTab('enterprise');
              stopScanner();
              setValidationError(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-mono font-semibold transition flex items-center justify-center gap-2 ${
              selectedTab === 'enterprise'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Company Server</span>
          </button>
        </div>

        {/* ================================================================= */}
        {/* CHOICE 1: CLOUD SAAS                                              */}
        {/* ================================================================= */}
        {selectedTab === 'saas' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0B0F17] border border-blue-500/20 space-y-3">
              <div className="flex items-center gap-2 text-blue-400">
                <Cloud className="w-4 h-4" />
                <span className="text-xs font-bold font-mono uppercase tracking-wide">Multi-Tenant Cloud</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Connect your device to the ForgeX Industrial Cloud cluster or custom cloud endpoint.
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">Target Endpoint:</span>
                  {saasUrl !== DEFAULT_SAAS_URL && (
                    <button
                      type="button"
                      onClick={() => setSaasUrl(DEFAULT_SAAS_URL)}
                      className="text-[10px] font-mono text-blue-400 hover:text-blue-300 underline"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={saasUrl}
                  onChange={(e) => setSaasUrl(e.target.value)}
                  placeholder={DEFAULT_SAAS_URL}
                  className="w-full px-3 py-2 bg-black/40 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={isValidating}
              onClick={() => validateAndConnect(saasUrl || DEFAULT_SAAS_URL, undefined, 'ForgeX Cloud')}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-mono font-semibold text-xs transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isValidating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connecting to Cloud...</span>
                </>
              ) : (
                <>
                  <span>Connect to ForgeX Cloud</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* CHOICE 2: COMPANY SERVER (ENTERPRISE ON-PREM)                     */}
        {/* ================================================================= */}
        {selectedTab === 'enterprise' && (
          <div className="space-y-4">
            {/* Method Toggle: Scan QR vs Manual */}
            <div className="flex items-center justify-center gap-2 border-b border-[#1E293B] pb-3">
              <button
                type="button"
                onClick={() => {
                  setEnterpriseMethod('scan');
                  setValidationError(null);
                }}
                className={`text-xs font-mono font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  enterpriseMethod === 'scan'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Scan QR Code</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEnterpriseMethod('manual');
                  stopScanner();
                  setValidationError(null);
                }}
                className={`text-xs font-mono font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  enterpriseMethod === 'manual'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Enter URL</span>
              </button>
            </div>

            {/* Method A: QR Scanner */}
            {enterpriseMethod === 'scan' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 text-center font-sans">
                  Point your camera at the <strong className="text-white">Mobile Onboarding QR</strong> displayed in your plant admin settings.
                </p>

                {cameraActive ? (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden border border-blue-500/40 bg-black aspect-square max-w-[280px] mx-auto shadow-inner">
                      <div id={scannerContainerId} className="w-full h-full" />
                      <div className="absolute inset-0 pointer-events-none border-2 border-blue-500/40 rounded-2xl animate-pulse" />
                    </div>

                    <button
                      type="button"
                      onClick={stopScanner}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" /> Stop Camera
                    </button>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500/60 bg-[#0B0F17] flex flex-col items-center justify-center text-center space-y-3 transition">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">Camera Scanner Ready</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Requires camera permission</p>
                    </div>
                    <button
                      type="button"
                      onClick={startScanner}
                      className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-mono font-semibold text-xs transition shadow-md flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Start Camera</span>
                    </button>
                  </div>
                )}

                {cameraError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{cameraError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Method B: Manual Server URL Entry */}
            {enterpriseMethod === 'manual' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-semibold text-slate-300 block">
                    Plant Server Endpoint / Base URL
                  </label>
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://plant-server.local:4000 or http://192.168.1.100:4000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F17] border border-[#243145] text-white text-xs font-mono focus:border-blue-500 focus:outline-none transition placeholder:text-slate-600"
                  />
                  <span className="text-[10px] text-slate-500 font-mono block">
                    Include protocol (https:// or http://) and port if applicable.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-semibold text-slate-300 block">
                    Company Code or Organization UUID <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                    placeholder="e.g. acme-refinery or uuid"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F17] border border-[#243145] text-white text-xs font-mono focus:border-blue-500 focus:outline-none transition placeholder:text-slate-600"
                  />
                </div>

                {/* Localhost quick fill for development testing */}
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">Quick presets:</span>
                  <button
                    type="button"
                    onClick={() => setServerUrl('http://localhost:4000')}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  >
                    localhost:4000
                  </button>
                  <button
                    type="button"
                    onClick={() => setServerUrl(window.location.origin)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  >
                    current origin
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isValidating || !serverUrl.trim()}
                  onClick={() => validateAndConnect(serverUrl, companyCode.trim() || undefined)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-mono font-semibold text-xs transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying On-Prem Node...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify &amp; Connect Server</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Validation Errors */}
        {validationError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed">{validationError}</span>
          </div>
        )}

        {/* Verified Success Confirmation Card */}
        {verifiedConfig && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold font-mono uppercase tracking-wide">Workspace Verified</span>
            </div>
            <div className="space-y-1 text-xs font-mono text-slate-300">
              <div>Workspace: <strong className="text-white">{verifiedConfig.name}</strong></div>
              <div>Mode: <span className="text-emerald-400 uppercase font-semibold">{verifiedConfig.mode}</span></div>
              <div className="text-[11px] text-slate-400 truncate">Endpoint: {verifiedConfig.baseUrl}</div>
            </div>
          </div>
        )}

        {/* Footer info note */}
        <div className="pt-2 border-t border-[#1E293B] flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>ForgeX AI Mobile PWA / Native</span>
          <span>v1.4.3</span>
        </div>
      </div>
    </div>
  );
};

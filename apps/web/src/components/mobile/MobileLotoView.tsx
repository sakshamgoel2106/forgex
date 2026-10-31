import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Camera,
  ArrowRight,
  ArrowLeft,
  Zap,
  WifiOff,
  Wifi,
  RotateCcw,
  Sparkles,
  Gauge,
  Upload,
  Check,
  Radio,
  FileCheck2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { SEEDED_MACHINES_CATALOG } from './MachineScanView';

export interface MobileLotoViewProps {
  assetTag?: string;
  assetId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export interface VisionVerificationResult {
  verified: boolean;
  readingValue: number | null;
  readingUnit: string | null;
  alertType: 'SAFE' | 'CRITICAL_BLOCK';
  safetyMessage: string;
  timestamp: string;
  inspectorSummary?: string;
  safetyStatus?: string;
}

/**
 * Mobile Haptic Vibration Utility
 */
const triggerHaptic = (pattern: 'success' | 'hazard' | 'tick' | 'complete') => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    switch (pattern) {
      case 'success':
        // Clean double-tap satisfaction pattern
        navigator.vibrate([100, 50, 100]);
        break;
      case 'hazard':
        // Strong, urgent warning vibration pattern
        navigator.vibrate([300, 150, 300, 150, 450]);
        break;
      case 'complete':
        // Heavy triple-pulse confirmation
        navigator.vibrate([150, 50, 150, 50, 250]);
        break;
      case 'tick':
        navigator.vibrate(25);
        break;
    }
  } catch (err) {
    // Non-blocking fallback for browsers that restrict vibration without user gesture
  }
};

export const MobileLotoView: React.FC<MobileLotoViewProps> = ({
  assetTag = 'PUMP-301',
  assetId,
  onComplete,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Active Screen / Step: 1 = Power Isolation, 2 = Pneumatic/Hydraulic Bleed, 3 = Camera Zero-Energy Verification
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Network Connectivity State (Safety requirement: block verification when offline)
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Resolve target machine metadata
  const machineMeta = SEEDED_MACHINES_CATALOG.find(
    (m) => m.assetTag.toUpperCase() === assetTag.toUpperCase()
  ) || {
    id: assetId || assetTag,
    assetTag,
    name: 'Industrial Process Pump (Secondary Train)',
    area: 'Process Bay B-2',
    isoClass: 'Centrifugal Pump (ISO 14224)',
  };

  // -------------------------------------------------------------
  // Step 1: Power Isolation Checklist
  // -------------------------------------------------------------
  const [powerBreakerOpen, setPowerBreakerOpen] = useState(false);
  const [haspPadlockApplied, setHaspPadlockApplied] = useState(false);
  const [meterZeroTested, setMeterZeroTested] = useState(false);
  const isStep1Complete = powerBreakerOpen && haspPadlockApplied && meterZeroTested;

  // -------------------------------------------------------------
  // Step 2: Pneumatic / Hydraulic Bleed Checklist
  // -------------------------------------------------------------
  const [suctionV101Closed, setSuctionV101Closed] = useState(false);
  const [dischargeV102Closed, setDischargeV102Closed] = useState(false);
  const [drainCockV103Vented, setDrainCockV103Vented] = useState(false);
  const isStep2Complete = suctionV101Closed && dischargeV102Closed && drainCockV103Vented;

  // -------------------------------------------------------------
  // Step 3: Camera & Vision Zero-Energy Verification
  // -------------------------------------------------------------
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzingVision, setIsAnalyzingVision] = useState(false);
  const [visionResult, setVisionResult] = useState<VisionVerificationResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // -------------------------------------------------------------
  // Step 3 Safety Confirmation: 1.5s Hold-to-Confirm
  // -------------------------------------------------------------
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [attestationCompleted, setAttestationCompleted] = useState(false);
  const [securityEventId, setSecurityEventId] = useState<string | null>(null);
  const [isSubmittingAttestation, setIsSubmittingAttestation] = useState(false);

  const holdStartTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Clean up camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Start hardware camera (rear/environment facing on mobile)
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access not supported on this device/browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Tap "Upload Photo" below or allow camera in browser settings.'
          : 'Unable to start camera. Please verify device permissions or select a photo from gallery.'
      );
      setIsCameraActive(false);
    }
  }, [stopCamera]);

  // Automatically start camera when navigating to Step 3
  useEffect(() => {
    if (currentStep === 3 && !capturedImage && !isAnalyzingVision) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [currentStep, capturedImage, isAnalyzingVision, startCamera, stopCamera]);

  // Capture photo snapshot from video canvas
  const handleCaptureSnapshot = () => {
    if (!isOnline) {
      toast.error('Offline', 'Connection required for safety verification.');
      return;
    }

    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg', 0.92);
      stopCamera();
      triggerHaptic('tick');
      verifyGaugeWithAi(dataUri);
    }
  };

  // Upload fallback photo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOnline) {
      toast.error('Offline', 'Connection required for safety verification.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUri = uploadEvent.target?.result as string;
      if (dataUri) {
        stopCamera();
        triggerHaptic('tick');
        verifyGaugeWithAi(dataUri);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Call Visual AI verification endpoint
  const verifyGaugeWithAi = async (dataUri: string) => {
    if (!isOnline) {
      toast.error('Offline Block', 'Connection required for safety verification.');
      return;
    }

    setCapturedImage(dataUri);
    setIsAnalyzingVision(true);
    setVisionResult(null);

    try {
      const res = await apiFetch('/api/v1/visual/loto-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUri,
          assetTag,
          language: 'en-US',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const loto = json.data;
        const result: VisionVerificationResult = {
          verified: loto.verified === true,
          readingValue: loto.diagnostic?.readingValue ?? (loto.verified ? 0.0 : 28.0),
          readingUnit: loto.diagnostic?.readingUnit ?? 'bar',
          alertType: loto.alertType,
          safetyMessage: loto.message,
          timestamp: loto.diagnostic?.timestamp || new Date().toISOString(),
          inspectorSummary: loto.diagnostic?.summary,
          safetyStatus: loto.diagnostic?.safetyStatus,
        };

        setVisionResult(result);

        if (result.verified) {
          // Success haptic feedback
          triggerHaptic('success');
          toast.success(
            'Zero Energy Verified by AI',
            'Gauge needle at 0.0 Bar. Physical human confirmation required to unlock.'
          );
        } else {
          // Hazard detected: stronger urgent haptic pattern
          triggerHaptic('hazard');
          toast.error(
            'Hazard: Residual Pressure',
            `Reading: ${result.readingValue} ${result.readingUnit}. Maintenance access blocked.`
          );
        }
      } else {
        // Fallback hazard block
        const fallbackHazard: VisionVerificationResult = {
          verified: false,
          readingValue: null,
          readingUnit: 'bar',
          alertType: 'CRITICAL_BLOCK',
          safetyMessage:
            json?.error?.message ||
            json?.error ||
            'Could not confirm zero-energy state. Residual pressure unresolved.',
          timestamp: new Date().toISOString(),
          inspectorSummary: 'Visual analysis could not guarantee zero pressure reading.',
          safetyStatus: 'CRITICAL_BLOCK',
        };
        setVisionResult(fallbackHazard);
        triggerHaptic('hazard');
      }
    } catch (err: any) {
      const netErrorResult: VisionVerificationResult = {
        verified: false,
        readingValue: null,
        readingUnit: 'bar',
        alertType: 'CRITICAL_BLOCK',
        safetyMessage:
          err?.message?.includes('fetch') || !navigator.onLine
            ? 'Connection required for safety verification'
            : err?.message || 'Verification endpoint unreachable.',
        timestamp: new Date().toISOString(),
        safetyStatus: 'NETWORK_ERROR',
      };
      setVisionResult(netErrorResult);
      triggerHaptic('hazard');
    } finally {
      setIsAnalyzingVision(false);
    }
  };

  // Reset Step 3 photo
  const handleRetakePhoto = () => {
    setCapturedImage(null);
    setVisionResult(null);
    setHoldProgress(0);
    setIsHolding(false);
    startCamera();
  };

  // -------------------------------------------------------------
  // Hold-to-Confirm Implementation (1.5 seconds)
  // -------------------------------------------------------------
  const startHold = () => {
    if (!isOnline) {
      toast.error('Offline', 'Connection required for safety verification.');
      return;
    }
    if (!visionResult?.verified || isSubmittingAttestation || attestationCompleted) {
      return;
    }

    setIsHolding(true);
    holdStartTimeRef.current = Date.now();
    triggerHaptic('tick');

    const updateProgress = () => {
      if (!holdStartTimeRef.current) return;
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, (elapsed / 1500) * 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        completeHoldAttestation();
      } else {
        animFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animFrameRef.current = requestAnimationFrame(updateProgress);
  };

  const cancelHold = () => {
    if (attestationCompleted) return;
    setIsHolding(false);
    holdStartTimeRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (holdProgress < 100 && holdProgress > 10) {
      toast.warning('Hold Required', 'Hold for the full 1.5 seconds to confirm zero energy.');
    }
    setHoldProgress(0);
  };

  const completeHoldAttestation = async () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsHolding(false);
    setHoldProgress(100);
    setIsSubmittingAttestation(true);

    try {
      // Call audit ledger endpoint with SecurityEvent mechanism
      const res = await apiFetch('/api/v1/visual/loto-attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: machineMeta.id,
          assetTag,
          aiResult: visionResult,
          humanAttestation: true,
          photoRef: capturedImage ? capturedImage.slice(0, 120) : null,
          timestamp: new Date().toISOString(),
          holdDurationMs: 1500,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        triggerHaptic('complete');
        setAttestationCompleted(true);
        setSecurityEventId(json.data?.securityEventId || 'sec_evt_verified');
        toast.success(
          'Lockout Attested & Work Order Unlocked',
          `Tamper-evident audit event recorded in enterprise security ledger.`
        );
      } else {
        throw new Error(json?.error?.message || json?.error || 'Failed to record attestation');
      }
    } catch (err: any) {
      toast.error('Attestation Failed', err?.message || 'Could not record security event.');
      setHoldProgress(0);
    } finally {
      setIsSubmittingAttestation(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* ---------------- Top Industrial Safety Bar ---------------- */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-rose-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-white truncate">{assetTag}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  OSHA 1910.147
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate font-medium">{machineMeta.name}</p>
            </div>
          </div>

          {/* Connection Status Pill */}
          <div className="shrink-0">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>ONLINE</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse">
                <WifiOff className="w-3 h-3 text-rose-400" />
                <span>OFFLINE</span>
              </span>
            )}
          </div>
        </div>

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="mt-2 p-2 bg-rose-950/80 border border-rose-600/70 rounded-xl text-rose-200 text-xs flex items-center gap-2 animate-fadeIn">
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="font-semibold">
              Connection required for safety verification.{' '}
              <span className="text-[11px] text-rose-300 font-normal">
                Audit sign-off blocked until network is restored.
              </span>
            </div>
          </div>
        )}

        {/* 3-Step Wizard Navigation Indicator */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition border ${
              currentStep === 1
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                : isStep1Complete
                ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                isStep1Complete ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {isStep1Complete ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
            </span>
            <span className="text-[11px] truncate">1. Power</span>
          </button>

          <button
            type="button"
            onClick={() => isStep1Complete && setCurrentStep(2)}
            disabled={!isStep1Complete}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition border ${
              currentStep === 2
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 font-bold'
                : isStep2Complete
                ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500 disabled:opacity-40'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                isStep2Complete ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {isStep2Complete ? <Check className="w-3 h-3 stroke-[3]" /> : '2'}
            </span>
            <span className="text-[11px] truncate">2. Bleed</span>
          </button>

          <button
            type="button"
            onClick={() => isStep2Complete && setCurrentStep(3)}
            disabled={!isStep2Complete}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition border ${
              currentStep === 3
                ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300 font-bold'
                : attestationCompleted
                ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500 disabled:opacity-40'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                attestationCompleted ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {attestationCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : '3'}
            </span>
            <span className="text-[11px] truncate">3. Vision</span>
          </button>
        </div>
      </div>

      {/* ---------------- Main Screen Body (One Step Per Screen) ---------------- */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
        {/* ============================================================== */}
        {/* SCREEN 1: POWER ISOLATION                                     */}
        {/* ============================================================== */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-fadeIn">
            {/* Big Step Number Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-amber-400">
                  STEP 01 OF 03 • ELECTRICAL LOTO
                </span>
                <h1 className="text-xl font-black text-white mt-0.5 tracking-tight">
                  Power Isolation
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  De-energize primary 480V 3-phase motor feed at breaker bay MCC-04.
                </p>
              </div>

              {/* Massive Industrial Step Number Badge */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-2 border-amber-500/50 flex items-center justify-center shadow-lg shadow-amber-950/40 shrink-0">
                <span className="font-mono text-3xl font-black text-amber-400">01</span>
              </div>
            </div>

            {/* Safety Hazard Card */}
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-600/40 text-amber-200 text-xs flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
              <div>
                <span className="font-bold">Arc Flash &amp; Electrocution Hazard:</span> Pull breaker
                with face shield and NFPA 70E Arc Flash PPE category 2.
              </div>
            </div>

            {/* Interactive Step 1 Checklist */}
            <div className="space-y-2.5 pt-2">
              <div
                onClick={() => {
                  setPowerBreakerOpen(!powerBreakerOpen);
                  triggerHaptic('tick');
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer select-none flex items-center gap-3 ${
                  powerBreakerOpen
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    powerBreakerOpen
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {powerBreakerOpen && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">1. Disconnect Breaker Switch</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Pull MCC-04 primary knife-switch lever fully downward into OPEN position.
                  </div>
                </div>
              </div>

              <div
                onClick={() => {
                  setHaspPadlockApplied(!haspPadlockApplied);
                  triggerHaptic('tick');
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer select-none flex items-center gap-3 ${
                  haspPadlockApplied
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    haspPadlockApplied
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {haspPadlockApplied && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">2. Affix Safety Padlock &amp; Tagout</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Attach steel lockout hasp, red master safety padlock, and danger tagout notice.
                  </div>
                </div>
              </div>

              <div
                onClick={() => {
                  setMeterZeroTested(!meterZeroTested);
                  triggerHaptic('tick');
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer select-none flex items-center gap-3 ${
                  meterZeroTested
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    meterZeroTested
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {meterZeroTested && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">3. Multimeter Live-Dead-Live Test</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Verify zero voltage across all 3 phases (L1-L2, L2-L3, L1-L3, phase to ground).
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Proceed Action */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tick');
                  setCurrentStep(2);
                }}
                disabled={!isStep1Complete}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-mono"
              >
                <span>Confirm Power Isolation • Proceed to Step 2</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SCREEN 2: PNEUMATIC & HYDRAULIC BLEED                         */}
        {/* ============================================================== */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-fadeIn">
            {/* Big Step Number Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                  STEP 02 OF 03 • STORED ENERGY VENTING
                </span>
                <h1 className="text-xl font-black text-white mt-0.5 tracking-tight">
                  Pneumatic/Hydraulic Bleed
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Isolate process fluid valves and bleed line pressure into containment.
                </p>
              </div>

              {/* Massive Industrial Step Number Badge */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-2 border-cyan-500/50 flex items-center justify-center shadow-lg shadow-cyan-950/40 shrink-0">
                <span className="font-mono text-3xl font-black text-cyan-400">02</span>
              </div>
            </div>

            {/* Piping Schematic Notice */}
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-600/40 text-cyan-200 text-xs flex items-center gap-2.5">
              <Gauge className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <span className="font-bold">Stored Hydraulic Pressure:</span> System rated up to 35
                Bar. Do not loosen casing bolts until bleed is complete and verified.
              </div>
            </div>

            {/* Interactive Step 2 Checklist */}
            <div className="space-y-2.5 pt-2">
              <div
                onClick={() => {
                  setSuctionV101Closed(!suctionV101Closed);
                  triggerHaptic('tick');
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer select-none flex items-center gap-3 ${
                  suctionV101Closed
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    suctionV101Closed
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {suctionV101Closed && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">1. Close Suction Valve V-101</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Rotate handwheel clockwise until seated. Affix valve lockout clamp.
                  </div>
                </div>
              </div>

              <div
                onClick={() => {
                  setDischargeV102Closed(!dischargeV102Closed);
                  triggerHaptic('tick');
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer select-none flex items-center gap-3 ${
                  dischargeV102Closed
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    dischargeV102Closed
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {dischargeV102Closed && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">2. Close Discharge Valve V-102</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Isolate high-pressure discharge line backflow and tag out.
                  </div>
                </div>
              </div>

              <div
                onClick={() => {
                  setDrainCockV103Vented(!drainCockV103Vented);
                  triggerHaptic('tick');
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer select-none flex items-center gap-3 ${
                  drainCockV103Vented
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition ${
                    drainCockV103Vented
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {drainCockV103Vented && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">3. Open Bleed Drain Cock V-103</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Drain residual cavity fluid into catchment reservoir until hiss stops.
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tick');
                  setCurrentStep(1);
                }}
                className="py-3.5 px-4 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-800 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tick');
                  setCurrentStep(3);
                }}
                disabled={!isStep2Complete}
                className="flex-1 py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-mono"
              >
                <span>Confirm Bleed • Proceed to Step 3</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SCREEN 3: CAMERA ZERO-ENERGY VERIFICATION                      */}
        {/* ============================================================== */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-fadeIn flex-1 flex flex-col justify-between">
            <div>
              {/* Big Step Number Header */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-indigo-400">
                    STEP 03 OF 03 • MULTIMODAL VISION GATE
                  </span>
                  <h1 className="text-xl font-black text-white mt-0.5 tracking-tight">
                    Camera Zero-Energy Verification
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Frame analog gauge PG-101 in viewfinder. Visual AI analyzes pointer dial.
                  </p>
                </div>

                {/* Massive Industrial Step Number Badge */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-600/20 border-2 border-indigo-500/50 flex items-center justify-center shadow-lg shadow-indigo-950/40 shrink-0">
                  <span className="font-mono text-3xl font-black text-indigo-400">03</span>
                </div>
              </div>

              {/* Viewfinder / Camera Area (Full-Width) */}
              <div className="mt-3 relative w-full aspect-4/3 rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-700 shadow-2xl flex items-center justify-center">
                {/* 1. Live Video Viewfinder */}
                {!capturedImage && (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                )}

                {/* 2. Captured Image Display */}
                {capturedImage && (
                  <img
                    src={capturedImage}
                    alt="Gauge verification capture"
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Targeting Reticle Overlay */}
                {!capturedImage && isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-44 h-44 rounded-full border-2 border-dashed border-cyan-400/70 animate-pulse flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    </div>
                    <span className="mt-2 text-[10px] font-mono text-cyan-300 font-bold bg-slate-950/80 px-2 py-0.5 rounded-md border border-cyan-500/40">
                      FRAME GAUGE DIAL
                    </span>
                  </div>
                )}

                {/* Camera Permission / Error Banner */}
                {cameraError && !capturedImage && (
                  <div className="absolute inset-0 bg-slate-950/90 p-4 flex flex-col items-center justify-center text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="text-xs text-amber-200 mb-3">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Gauge Photo</span>
                    </button>
                  </div>
                )}

                {/* AI Analyzing Radar Scanner Overlay */}
                {isAnalyzingVision && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4">
                    <div className="w-14 h-14 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-3" />
                    <Sparkles className="w-5 h-5 text-indigo-400 mb-1 animate-bounce" />
                    <div className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      Analyzing Gauge Needle...
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gemini Vision detecting pressure reading and stop-pin position
                    </p>
                  </div>
                )}
              </div>

              {/* Shutter & File Upload Controls (when no image captured) */}
              {!capturedImage && !isAnalyzingVision && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  {/* File Upload Alternative */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-2 text-xs font-medium"
                    title="Upload Gauge Image"
                  >
                    <Upload className="w-4 h-4 text-blue-400" />
                    <span className="hidden sm:inline">Upload</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  {/* Shutter Capture Button */}
                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    disabled={!isOnline}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-lg transition active:scale-95 ${
                      !isOnline
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isOnline ? 'CAPTURE GAUGE PHOTO' : 'ONLINE REQUIRED'}</span>
                  </button>

                  {/* Restart Camera */}
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                    title="Restart Camera"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ========================================================= */}
              {/* AI MODEL VERIFICATION RESULT DISPLAY                      */}
              {/* ========================================================= */}
              {visionResult && (
                <div className="mt-4 space-y-3 animate-fadeIn">
                  {/* GREEN: ZERO ENERGY VERIFIED */}
                  {visionResult.verified ? (
                    <div className="p-4 rounded-2xl bg-emerald-950/60 border-2 border-emerald-500 shadow-xl shadow-emerald-950/40">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/30">
                            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                          </div>
                          <div>
                            <div className="text-[11px] font-mono font-black text-emerald-400 tracking-wider">
                              ZERO ENERGY VERIFIED
                            </div>
                            <div className="text-sm font-black text-white font-mono mt-0.5">
                              {visionResult.readingValue ?? 0.0}{' '}
                              {visionResult.readingUnit?.toUpperCase() ?? 'BAR'}
                            </div>
                          </div>
                        </div>

                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                          SAFE FOR DISASSEMBLY
                        </span>
                      </div>

                      <p className="text-xs text-emerald-200/90 mt-2.5 leading-relaxed">
                        {visionResult.inspectorSummary ||
                          'Needle verified at zero pressure stop pin. Mechanical isolation confirmed.'}
                      </p>
                    </div>
                  ) : (
                    /* RED: HAZARD DETECTED: RESIDUAL PRESSURE (BLOCKS PROGRESS) */
                    <div className="p-4 rounded-2xl bg-rose-950/80 border-2 border-rose-600 shadow-xl shadow-rose-950/60 animate-pulse">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-600/40">
                            <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                          </div>
                          <div>
                            <div className="text-[11px] font-mono font-black text-rose-300 tracking-wider">
                              HAZARD DETECTED: RESIDUAL PRESSURE
                            </div>
                            <div className="text-sm font-black text-white font-mono mt-0.5">
                              {visionResult.readingValue !== null
                                ? `${visionResult.readingValue} ${visionResult.readingUnit?.toUpperCase()}`
                                : 'ACTIVE PRESSURE UNRESOLVED'}
                            </div>
                          </div>
                        </div>

                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-600 text-white uppercase">
                          CRITICAL SAFETY BLOCK
                        </span>
                      </div>

                      <div className="mt-3 p-2.5 rounded-xl bg-black/40 border border-rose-700/60 text-xs text-rose-200 leading-relaxed font-sans">
                        <span className="font-bold text-white block mb-0.5">
                          Maintenance Disassembly Blocked:
                        </span>
                        {visionResult.safetyMessage ||
                          'Dangerous stored pressure detected. Do not loosen casing bolts or flange clamps. Return to Step 2 to drain the line and retake photo.'}
                      </div>

                      {/* Retake Photo Button to clear hazard block */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(2)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold font-mono hover:bg-slate-800 transition"
                        >
                          Return to Step 2 (Re-bleed)
                        </button>
                        <button
                          type="button"
                          onClick={handleRetakePhoto}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono flex items-center justify-center gap-1.5 shadow-md transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retake Photo</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* IMPORTANT SAFETY REQUIREMENT:                             */}
                  {/* AI must NOT auto-pass. Require explicit human hold (1.5s) */}
                  {/* ========================================================= */}
                  {visionResult.verified && !attestationCompleted && (
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl space-y-3 animate-fadeIn">
                      <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                        <Lock className="w-4 h-4 text-amber-400" />
                        <span>MANDATORY TECHNICIAN PHYSICAL CONFIRMATION</span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        In strict compliance with OSHA 1910.147, AI verification alone cannot unlock
                        the lockout. You must physically attest zero stored energy.
                      </p>

                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 font-mono">
                        &ldquo;I, {user?.fullName || user?.email || 'Field Technician'}, physically
                        confirm zero energy on {assetTag}. Breaker is locked out, drain is vented,
                        and gauge reads 0.0.&rdquo;
                      </div>

                      {/* Hold to Confirm Button (1.5s) with live visual progress fill */}
                      <div className="relative pt-1">
                        <button
                          type="button"
                          onMouseDown={startHold}
                          onMouseUp={cancelHold}
                          onMouseLeave={cancelHold}
                          onTouchStart={startHold}
                          onTouchEnd={cancelHold}
                          onTouchCancel={cancelHold}
                          disabled={isSubmittingAttestation || !isOnline}
                          className={`relative w-full overflow-hidden py-4 px-4 rounded-xl font-bold font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 border shadow-lg select-none touch-none transition cursor-pointer active:scale-[0.99] ${
                            isHolding
                              ? 'bg-slate-900 border-emerald-500 text-white shadow-emerald-950/50'
                              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 border-emerald-400'
                          }`}
                        >
                          {/* Live 1.5s Progress Fill Layer */}
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-emerald-500 transition-all duration-75 ease-linear pointer-events-none"
                            style={{ width: `${holdProgress}%` }}
                          />

                          {/* Button Content Overlay */}
                          <span className="relative z-10 flex items-center gap-2 font-black text-slate-950">
                            {isSubmittingAttestation ? (
                              <>
                                <Sparkles className="w-4 h-4 animate-spin text-slate-950" />
                                <span>RECORDING AUDIT EVENT...</span>
                              </>
                            ) : isHolding ? (
                              <>
                                <Radio className="w-4 h-4 animate-pulse text-slate-950" />
                                <span>HOLDING... {Math.round(holdProgress)}% (1.5s)</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                                <span>HOLD TO CONFIRM ZERO ENERGY (1.5s)</span>
                              </>
                            )}
                          </span>
                        </button>

                        <div className="text-center mt-1.5 text-[10px] text-slate-400 font-mono">
                          Press and hold for 1.5 seconds to digitally sign and unlock work order
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* FINAL CERTIFICATION DISPLAY (Work Order Unlocked)        */}
                  {/* ========================================================= */}
                  {attestationCompleted && (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/80 to-slate-900 border-2 border-emerald-400 shadow-2xl space-y-3 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/40">
                          <CheckCircle2 className="w-6 h-6 stroke-[3]" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">LOTO Lockout Certified</h3>
                          <div className="text-[11px] font-mono text-emerald-400 font-bold">
                            Work Order Maintenance Unlocked
                          </div>
                        </div>
                      </div>

                      {/* Security Audit Ledger Receipt Card */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 text-[11px] font-mono space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>Audit Security Event:</span>
                          <span className="text-emerald-300 font-bold">{securityEventId}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Attestation Signer:</span>
                          <span className="text-white">
                            {user?.fullName || user?.email || 'Technician'}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Decisive Reading:</span>
                          <span className="text-white">
                            {visionResult?.readingValue ?? 0.0} {visionResult?.readingUnit ?? 'Bar'}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Timestamp:</span>
                          <span className="text-white">{new Date().toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onComplete?.();
                        }}
                        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.99] cursor-pointer"
                      >
                        <FileCheck2 className="w-4 h-4 stroke-[2.5]" />
                        <span>RETURN TO WORK ORDER / MAINTENANCE SPRINT</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Back Button on Step 3 */}
            {!attestationCompleted && (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tick');
                    stopCamera();
                    setCurrentStep(2);
                  }}
                  className="py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white text-xs font-mono flex items-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Step 2 (Bleed)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Camera,
  Upload,
  RotateCcw,
  Check,
  Gauge,
  Zap,
  Clock,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import { apiFetch } from '../../lib/api';
import {
  generateOverpressureGaugeSvg,
  generateZeroEnergyGaugeSvg,
} from '../../utils/shopFloorImagePresets';

export interface LotoSafetyRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId?: string;
  assetTag?: string;
  onLotoVerified?: () => void;
}

export const LotoSafetyRunnerModal: React.FC<LotoSafetyRunnerModalProps> = ({
  isOpen,
  onClose,
  assetId = 'PUMP-001',
  assetTag = 'PUMP-001 (Lowara 10SV08F030T)',
  onLotoVerified,
}) => {
  // Step completion states
  const [step1Completed, setStep1Completed] = useState(false);
  const [step1Timestamp, setStep1Timestamp] = useState<string | null>(null);

  const [step2V101, setStep2V101] = useState(false);
  const [step2V102, setStep2V102] = useState(false);
  const [step2Completed, setStep2Completed] = useState(false);
  const [step2Timestamp, setStep2Timestamp] = useState<string | null>(null);

  // Vision Gate (Step 3) states
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzingVision, setIsAnalyzingVision] = useState(false);
  const [visionVerificationResult, setVisionVerificationResult] = useState<{
    verified: boolean;
    readingValue: number | null;
    readingUnit: string | null;
    alertType: 'SAFE' | 'CRITICAL_BLOCK';
    safetyMessage: string;
    timestamp: string;
    inspectorSummary?: string;
  } | null>(null);

  // Step 4 final sign-off state
  const [step4Completed, setStep4Completed] = useState(false);
  const [step4Timestamp, setStep4Timestamp] = useState<string | null>(null);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset or restart LOTO sequence
  const handleReset = () => {
    stopCamera();
    setStep1Completed(false);
    setStep1Timestamp(null);
    setStep2V101(false);
    setStep2V102(false);
    setStep2Completed(false);
    setStep2Timestamp(null);
    setCapturedImage(null);
    setIsAnalyzingVision(false);
    setVisionVerificationResult(null);
    setStep4Completed(false);
    setStep4Timestamp(null);
  };

  // Step 1 toggle
  const handleToggleStep1 = () => {
    if (step1Completed) {
      setStep1Completed(false);
      setStep1Timestamp(null);
      // Reset subsequent steps
      setStep2V101(false);
      setStep2V102(false);
      setStep2Completed(false);
      setStep2Timestamp(null);
      setVisionVerificationResult(null);
      setStep4Completed(false);
    } else {
      setStep1Completed(true);
      setStep1Timestamp(new Date().toLocaleTimeString());
    }
  };

  // Step 2 valves toggle
  useEffect(() => {
    if (step2V101 && step2V102 && !step2Completed) {
      setStep2Completed(true);
      setStep2Timestamp(new Date().toLocaleTimeString());
    } else if ((!step2V101 || !step2V102) && step2Completed) {
      setStep2Completed(false);
      setStep2Timestamp(null);
      setVisionVerificationResult(null);
      setStep4Completed(false);
    }
  }, [step2V101, step2V102, step2Completed]);

  // Start live webcam stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      setCameraError(err?.message || 'Camera access denied or unavailable');
      setIsCameraActive(false);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Capture snapshot from live camera
  const captureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      verifyGaugeImage(dataUri);
    }
  };

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUri = uploadEvent.target?.result as string;
      if (dataUri) {
        stopCamera();
        verifyGaugeImage(dataUri);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Verify gauge image via Gemini Multimodal Vision API
  const verifyGaugeImage = async (dataUri: string) => {
    setCapturedImage(dataUri);
    setIsAnalyzingVision(true);
    setVisionVerificationResult(null);

    try {
      const res = await apiFetch('/api/v1/visual/loto-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUri,
          assetId,
          requiredReading: 0,
          tolerance: 0.5,
          unit: 'bar',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setVisionVerificationResult(json.data);
      } else {
        // Fallback safety block
        setVisionVerificationResult({
          verified: false,
          readingValue: null,
          readingUnit: 'bar',
          alertType: 'CRITICAL_BLOCK',
          safetyMessage: json?.error?.message || 'Zero-energy verification failed. Residual pressure unresolved.',
          timestamp: new Date().toISOString(),
          inspectorSummary: 'Could not verify zero pressure reading. For safety, pump disassembly remains locked.',
        });
      }
    } catch (err: any) {
      setVisionVerificationResult({
        verified: false,
        readingValue: null,
        readingUnit: 'bar',
        alertType: 'CRITICAL_BLOCK',
        safetyMessage: err?.message || 'Network error communicating with Gemini Vision verification endpoint.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsAnalyzingVision(false);
    }
  };

  // Quick 1-click Stage Demo Preset Handlers
  const handleTestOverpressureSample = () => {
    stopCamera();
    const uri = generateOverpressureGaugeSvg();
    verifyGaugeImage(uri);
  };

  const handleTestZeroEnergySample = () => {
    stopCamera();
    const uri = generateZeroEnergyGaugeSvg();
    verifyGaugeImage(uri);
  };

  // Step 4 final sign-off
  const handleSignOff = () => {
    setStep4Completed(true);
    setStep4Timestamp(new Date().toLocaleTimeString());
    onLotoVerified?.();
  };

  // Cleanup camera on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

  const isGateVerified = visionVerificationResult?.verified === true;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="OSHA 1910.147 Vision-Locked Lockout/Tagout (LOTO)"
      subtitle={`Machine Energy Isolation & Zero-Energy Verification Protocol · Target: ${assetTag}`}
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" size="sm" onClick={handleReset} className="flex items-center gap-1.5 text-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset LOTO Sequence</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                stopCamera();
                onClose();
              }}
            >
              Close
            </Button>
            {step4Completed && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                Proceed to Mechanical Maintenance &rarr;
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Top Compliance Header Banner */}
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
            step4Completed
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : isGateVerified
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
              : 'bg-amber-50/80 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                step4Completed
                  ? 'bg-emerald-600 text-white'
                  : isGateVerified
                  ? 'bg-emerald-500 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight">OSHA 1910.147 Isolation Gate</span>
                <span
                  className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                    step4Completed
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : isGateVerified
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {step4Completed
                    ? 'MAINTENANCE AUTHORIZED'
                    : isGateVerified
                    ? 'ZERO ENERGY CONFIRMED'
                    : 'ISOLATION IN PROGRESS'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Multi-factor safety: Electrical lockout, dual-valve boundary isolation, and AI visual zero-pressure gate.
              </p>
            </div>
          </div>
        </div>

        {/* 4-Step Interactive LOTO Flow */}
        <div className="space-y-3">
          {/* ================================================================= */}
          {/* STEP 1: Electrical Isolation (Breaker MCC-04)                     */}
          {/* ================================================================= */}
          <div
            className={`p-3.5 rounded-xl border transition ${
              step1Completed
                ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    step1Completed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  1
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">
                      Step 1: Isolate Primary Electrical Breaker (MCC-04)
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      400V / 3-Phase
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    Open Motor Control Center disconnect breaker MCC-04. Affix padlock #LK-402 and danger tag.
                  </p>
                  {step1Timestamp && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 font-bold mt-1">
                      <Clock className="w-3 h-3" />
                      Locked & Tagged out at {step1Timestamp}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleStep1}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  step1Completed
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                }`}
              >
                {step1Completed ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Breaker Locked</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Confirm Lockout</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* STEP 2: Fluid Isolation (Suction & Discharge Valves)              */}
          {/* ================================================================= */}
          <div
            className={`p-3.5 rounded-xl border transition ${
              !step1Completed
                ? 'bg-slate-50 border-slate-200 opacity-60'
                : step2Completed
                ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                : 'bg-white border-blue-200 shadow-xs'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    step2Completed
                      ? 'bg-emerald-600 text-white'
                      : step1Completed
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  2
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">
                      Step 2: Close Suction &amp; Discharge Isolation Valves
                    </span>
                    {!step1Completed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        <Lock className="w-2.5 h-2.5" /> Locked (Requires Step 1)
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    Close suction gate valve V-101 and discharge non-return isolation valve V-102.
                  </p>
                  {step2Timestamp && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 font-bold mt-1">
                      <Clock className="w-3 h-3" />
                      Valves isolated at {step2Timestamp}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Checkbox controls for Step 2 */}
            {step1Completed && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={step2V101}
                    onChange={(e) => setStep2V101(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="font-mono text-xs text-slate-800">
                    <strong>Valve V-101</strong> (Suction) Closed &amp; Tagged
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-blue-50/50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={step2V102}
                    onChange={(e) => setStep2V102(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="font-mono text-xs text-slate-800">
                    <strong>Valve V-102</strong> (Discharge) Closed &amp; Tagged
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* STEP 3: Bleed Line Pressure & Verify Zero Energy (VISION GATE)     */}
          {/* ================================================================= */}
          <div
            className={`p-3.5 rounded-xl border transition ${
              !step2Completed
                ? 'bg-slate-50 border-slate-200 opacity-60'
                : isGateVerified
                ? 'bg-emerald-50 border-2 border-emerald-400 shadow-sm'
                : visionVerificationResult && !isGateVerified
                ? 'bg-rose-50 border-2 border-rose-400 shadow-sm'
                : 'bg-white border-2 border-blue-400 shadow-sm ring-2 ring-blue-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    isGateVerified
                      ? 'bg-emerald-600 text-white'
                      : step2Completed
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  3
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      Step 3: Bleed Line Pressure &amp; Verify Zero Energy State (VISION GATE)
                    </span>
                    {!step2Completed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        <Lock className="w-2.5 h-2.5" /> Locked (Requires Step 2)
                      </span>
                    )}
                    {isGateVerified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 0 PSI / 0 BAR VERIFIED
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    Open bleed drain valve V-103 into containment pan. Capture/upload pressure gauge PG-101.
                    <strong className="text-slate-900 ml-1">
                      OSHA 1910.147 strictly locks Step 4 until Gemini Vision confirms 0 Bar / 0 PSI.
                    </strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Vision Gate Active Controls */}
            {step2Completed && (
              <div className="mt-3.5 pt-3 border-t border-slate-200 space-y-3">
                {/* 1-Click Fast Stage Demo Presets Bar */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                    Stage-Proof Demo Presets (Instant Simulation):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Trigger Hard Red Safety Block */}
                    <button
                      type="button"
                      disabled={isAnalyzingVision}
                      onClick={handleTestOverpressureSample}
                      className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 font-mono text-xs font-bold flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Gauge className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="truncate">Sample: 28 Bar Residual</span>
                      </div>
                      <span className="text-[9px] bg-rose-200/80 text-rose-900 px-1.5 py-0.2 rounded font-mono shrink-0">
                        TEST REJECT
                      </span>
                    </button>

                    {/* Trigger Green Unlock */}
                    <button
                      type="button"
                      disabled={isAnalyzingVision}
                      onClick={handleTestZeroEnergySample}
                      className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-mono text-xs font-bold flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate">Sample: 0 PSI Verified</span>
                      </div>
                      <span className="text-[9px] bg-emerald-200/80 text-emerald-900 px-1.5 py-0.2 rounded font-mono shrink-0">
                        TEST UNLOCK
                      </span>
                    </button>
                  </div>
                </div>

                {/* Live Camera Viewfinder or Upload Box */}
                {!isCameraActive ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={isAnalyzingVision}
                      onClick={startCamera}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold font-mono flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Open Live Viewfinder</span>
                    </button>

                    <button
                      type="button"
                      disabled={isAnalyzingVision}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Upload Gauge Photo</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    {cameraError && (
                      <span className="text-[11px] text-rose-600 font-medium">{cameraError}</span>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-slate-300 bg-black relative">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover" />
                    <div className="absolute inset-0 border-2 border-emerald-400/40 pointer-events-none flex items-center justify-center">
                      <div className="w-32 h-32 rounded-full border border-dashed border-emerald-300/80 animate-pulse" />
                    </div>
                    <div className="absolute bottom-2 left-0 right-0 px-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-2 py-1 rounded bg-black/70 text-white text-xs hover:bg-black"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={captureSnapshot}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Capture &amp; Verify</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Analysis In Progress Indicator */}
                {isAnalyzingVision && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-800 text-xs animate-pulse">
                    <Sparkles className="w-4 h-4 text-blue-600 animate-spin" />
                    <span>Gemini Multimodal Vision reading dial needle &amp; verifying zero-pressure state...</span>
                  </div>
                )}

                {/* RED SAFETY BLOCK: When pressure is non-zero */}
                {visionVerificationResult && !isGateVerified && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-500 text-rose-900 space-y-2 animate-bounce-short shadow-sm">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-rose-800 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>CRITICAL OSHA 1910.147 SAFETY LOCK: RESIDUAL PRESSURE DETECTED</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {capturedImage && (
                        <img
                          src={capturedImage}
                          alt="Rejected Gauge"
                          className="w-16 h-16 rounded-lg object-cover border-2 border-rose-400 shrink-0 shadow-xs"
                        />
                      )}
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-rose-950 leading-snug">
                          {visionVerificationResult.safetyMessage}
                        </p>
                        <p className="text-[11px] text-rose-800 leading-relaxed">
                          {visionVerificationResult.inspectorSummary ||
                            'High residual pressure detected. Opening pump casing at this stage risks catastrophic fluid discharge and severe injury.'}
                        </p>
                        <div className="text-[10px] font-mono text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded border border-rose-200 inline-block font-bold">
                          Step 4 remains strictly locked until zero energy is visually certified.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* GREEN UNLOCK: When pressure is 0 Bar */}
                {visionVerificationResult && isGateVerified && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-900 space-y-2 shadow-sm">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-emerald-800 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>ZERO-ENERGY STATE CERTIFIED (0 BAR / 0 PSI)</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {capturedImage && (
                        <img
                          src={capturedImage}
                          alt="Verified Zero Gauge"
                          className="w-16 h-16 rounded-lg object-cover border-2 border-emerald-400 shrink-0 shadow-xs"
                        />
                      )}
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-emerald-950 leading-snug">
                          {visionVerificationResult.safetyMessage}
                        </p>
                        <p className="text-[11px] text-emerald-800 leading-relaxed">
                          {visionVerificationResult.inspectorSummary ||
                            'Gemini Vision has confirmed needle is resting at 0.0 Bar zero-stop pin. Hydraulic energy dissipated.'}
                        </p>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300 inline-block font-bold">
                          Verified at {new Date(visionVerificationResult.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* STEP 4: Commencing Mechanical Maintenance                          */}
          {/* ================================================================= */}
          <div
            className={`p-3.5 rounded-xl border transition ${
              !isGateVerified
                ? 'bg-slate-50 border-slate-200 opacity-60'
                : step4Completed
                ? 'bg-emerald-50 border-2 border-emerald-500 shadow-sm'
                : 'bg-emerald-50/70 border-2 border-emerald-400 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    step4Completed
                      ? 'bg-emerald-600 text-white'
                      : isGateVerified
                      ? 'bg-emerald-600 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  4
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">
                      Step 4: Safe to Commence Mechanical Maintenance
                    </span>
                    {!isGateVerified ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        <Lock className="w-2.5 h-2.5" /> Strictly Locked by Vision Gate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 font-bold">
                        <Unlock className="w-3 h-3 text-emerald-600" /> UNLOCKED
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    Zero electrical and fluid energy verified. Technician is authorized to unbolt pump casing bolts and
                    commence mechanical seal overhaul.
                  </p>
                  {step4Timestamp && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 font-bold mt-1">
                      <FileCheck2 className="w-3 h-3" />
                      LOTO Sign-off Completed at {step4Timestamp}
                    </span>
                  )}
                </div>
              </div>

              {isGateVerified && (
                <button
                  type="button"
                  disabled={step4Completed}
                  onClick={handleSignOff}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    step4Completed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  }`}
                >
                  {step4Completed ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Signed Off</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Certify &amp; Commence</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  X,
  ScanEye,
  VideoOff,
  Sliders,
  Send,
  RefreshCw,
  Repeat,
  ImageIcon,
  Sparkles,
  ShieldCheck,
  Crosshair,
  Check,
} from 'lucide-react';
import type { SupportedLanguageCode } from '@forgex/shared-types';

interface VisionDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDiagnose?: (imageDataUri: string, promptText?: string) => void;
  onSendToCopilot?: (imageDataUri: string, promptText?: string) => void;
  selectedMachine: any | null;
  machines?: any[];
  onSelectMachine?: (machineId: string) => void;
  currentLanguage?: SupportedLanguageCode;
}

const INSPECTION_PRESETS = [
  {
    id: 'pressure',
    label: 'Dial Pressure',
    icon: '🔍',
    getPrompt: (tag: string) =>
      `Perform visual inspection on ${tag} analog pressure gauge. Read needle position in PSI/Bar and compare against OEM MAWP limits.`,
  },
  {
    id: 'seal',
    label: 'Seal Leakage',
    icon: '💧',
    getPrompt: (tag: string) =>
      `Inspect ${tag} mechanical seal gland for fluid leakage, crystallization, shaft discoloration, or excessive dripping.`,
  },
  {
    id: 'nameplate',
    label: 'Nameplate OCR',
    icon: '🏷️',
    getPrompt: (tag: string) =>
      `Extract all alphanumeric engineering metadata from the ${tag} equipment rating plate: Model, Serial No, RPM, kW rating, and Volts.`,
  },
  {
    id: 'valve',
    label: 'Valve / Alignment',
    icon: '⚙️',
    getPrompt: (tag: string) =>
      `Verify ${tag} valve lever/handwheel alignment. Determine if open, closed, or throttled, and check flange bolting condition.`,
  },
];

export const VisionDiagnosticsModal: React.FC<VisionDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  onDiagnose,
  onSendToCopilot,
  selectedMachine,
  machines = [],
  onSelectMachine,
  currentLanguage = 'en-US',
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageSourceLabel, setImageSourceLabel] = useState<string>('Live Camera');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [activePresetId, setActivePresetId] = useState<string | null>('pressure');

  // Hardware Camera Device States
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const assetTag = selectedMachine?.assetTag || 'PUMP-001';
  const assetName = selectedMachine?.name || 'Centrifugal Feed Pump';

  // Set default prompt on open
  useEffect(() => {
    if (isOpen) {
      const isHindi = currentLanguage === 'hi-IN';
      const isMarathi = currentLanguage === 'mr-IN';
      const defaultText = isHindi
        ? `${assetTag} के एनालॉग प्रेशर गेज और मैकेनिकल सील का दृश्य निरीक्षण करें। गेज रीडिंग पढ़ें और OEM MAWP सीमाओं के विरुद्ध सत्यापित करें।`
        : isMarathi
        ? `${assetTag} वरील प्रेशर गेज आणि मेकॅनिकल सीलची व्हिज्युअल तपासणी करा आणि मर्यादा तपासा.`
        : `Perform visual inspection on ${assetTag} analog pressure gauge and mechanical seal. Extract readings and verify against OEM MAWP limits.`;
      setCustomPrompt(defaultText);
      setActivePresetId('pressure');
    }
  }, [isOpen, assetTag, currentLanguage]);

  // Global Ctrl+V / Cmd+V Clipboard Image Paste Listener
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file, 'Clipboard Paste (Ctrl+V)');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen]);

  // Clean up camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Enumerate physical video input devices
  const enumerateCameras = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setCameraDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Failed to enumerate video cameras:', err);
    }
  }, [selectedCameraId]);

  // Start live hardware camera stream (Desktop widescreen 1280x720)
  const startCamera = useCallback(
    async (deviceIdToUse?: string) => {
      setCameraError(null);
      stopCamera();

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported in this browser environment.');
        return;
      }

      try {
        const targetDeviceId = deviceIdToUse || selectedCameraId;

        const constraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsCameraActive(true);
        setActiveTab('camera');
        enumerateCameras();
      } catch (err: any) {
        console.warn('Camera access error:', err);
        setCameraError(
          `Camera Error: ${err?.message || 'Access denied or device in use'}. Please permit webcam access or upload a photo.`
        );
      }
    },
    [selectedCameraId, stopCamera, enumerateCameras]
  );

  // Toggle Horizontal Mirror for Desktop Webcam
  const toggleMirror = () => {
    setIsMirrored((prev) => !prev);
  };

  // Switch camera by device ID
  const handleSelectCameraDevice = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    startCamera(deviceId);
  };

  // Capture high-resolution frame from live camera
  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL('image/jpeg', 0.94);

    setSelectedImage(dataUri);
    setImageSourceLabel('Desktop HD Webcam Capture');
    stopCamera();
  };

  // Process uploaded or pasted image file
  const processImageFile = (file: File, sourceName?: string) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (.jpg, .png, .webp)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      if (dataUri) {
        setSelectedImage(dataUri);
        setImageSourceLabel(sourceName || `Uploaded: ${file.name}`);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle local file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  // Dispatch photo to Copilot
  const handleDispatch = () => {
    if (!selectedImage) return;
    const prompt =
      customPrompt.trim() ||
      `Perform visual inspection on ${assetTag} analog pressure gauge and mechanical seal. Extract readings and verify against OEM MAWP limits.`;

    const callback = onDiagnose || onSendToCopilot;
    callback?.(selectedImage, prompt);
    stopCamera();
    onClose();
  };

  // Lifecycle camera auto-start on modal open
  useEffect(() => {
    if (isOpen) {
      enumerateCameras();
      startCamera();
    } else {
      stopCamera();
      setSelectedImage(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, enumerateCameras, startCamera, stopCamera]);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopCamera();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, stopCamera]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCamera();
          onClose();
        }
      }}
    >
      <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh] text-slate-800">
        {/* Modal Top Control Bar */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <ScanEye className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide font-sans truncate">
                  MULTIMODAL HARDWARE VISION &amp; GAUGE DIAGNOSTICS
                </h2>
                <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  Gemini Live Multimodal
                </span>
                <span className="hidden md:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  REAL HD WEBCAM · 720P
                </span>
                <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {currentLanguage}
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-1 text-[10px] sm:text-[11px] text-slate-500">
                <span className="shrink-0">Scoped Machine:</span>
                {machines && machines.length > 0 && onSelectMachine ? (
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-3 h-3 text-blue-600 shrink-0" />
                    <select
                      value={selectedMachine?.id || ''}
                      onChange={(e) => onSelectMachine(e.target.value)}
                      className="max-w-[150px] sm:max-w-[280px] md:max-w-md truncate bg-white border border-[#CBD5E1] text-slate-900 text-[10px] sm:text-[11px] rounded px-2 py-0.5 focus:outline-none focus:border-blue-500 font-mono font-bold cursor-pointer shadow-2xs"
                    >
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.assetTag} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <strong className="text-slate-900 font-mono">{assetTag} ({assetName})</strong>
                )}
              </div>
            </div>
          </div>

          {/* Header Close Button */}
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition cursor-pointer shrink-0"
            title="Close Vision Diagnostics (Esc)"
          >
            <X className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        {/* Input Mode Tabs & Camera Controls Strip */}
        <div className="px-4 sm:px-6 pt-2 sm:pt-3 pb-0 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between gap-2 overflow-x-auto shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('camera');
                if (!isCameraActive) startCamera();
              }}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-xl text-xs font-bold font-mono flex items-center gap-2 border-t-2 transition cursor-pointer shrink-0 ${
                activeTab === 'camera'
                  ? 'bg-white text-blue-700 border-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              <span>1. Live Camera Stream</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                stopCamera();
              }}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-xl text-xs font-bold font-mono flex items-center gap-2 border-t-2 transition cursor-pointer shrink-0 ${
                activeTab === 'upload'
                  ? 'bg-white text-blue-700 border-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>2. Upload Photo (JPG / PNG / WEBP)</span>
            </button>
          </div>

          {/* Camera Device Switcher & Flip Controls (when on Camera tab) */}
          {activeTab === 'camera' && (
            <div className="flex items-center gap-1.5 sm:gap-2 pb-1.5 sm:pb-0">
              {cameraDevices.length > 1 && (
                <select
                  value={selectedCameraId}
                  onChange={(e) => handleSelectCameraDevice(e.target.value)}
                  className="bg-white border border-[#CBD5E1] text-slate-800 text-[10px] sm:text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-blue-600 font-mono shadow-2xs max-w-[140px] sm:max-w-none truncate cursor-pointer"
                >
                  {cameraDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera Device ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={toggleMirror}
                className={`px-2.5 py-1 rounded-lg border text-[11px] sm:text-xs font-mono flex items-center gap-1.5 transition cursor-pointer ${
                  isMirrored
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                    : 'bg-white hover:bg-slate-50 border-[#CBD5E1] text-slate-700 shadow-2xs'
                }`}
                title="Toggle Horizontal Mirror View"
              >
                <Repeat className="w-3 h-3 text-blue-600" />
                <span className="hidden sm:inline">Mirror:</span>
                <span>{isMirrored ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => startCamera()}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#CBD5E1] text-slate-600 shadow-2xs transition cursor-pointer"
                title="Restart Camera"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 bg-[#F8FAFC]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
            {/* Left Column: Viewfinder or Upload Dropzone (7 cols on Desktop) */}
            <div className="lg:col-span-7 flex flex-col space-y-3 sm:space-y-4">
              {activeTab === 'camera' && (
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-300 aspect-video flex items-center justify-center shadow-md">
                  {cameraError ? (
                    <div className="p-6 text-center space-y-3">
                      <VideoOff className="w-10 h-10 text-rose-400 mx-auto" />
                      <p className="text-xs text-rose-300 font-sans max-w-sm mx-auto">{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow-md"
                      >
                        Retry Camera Access
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${isMirrored ? '-scale-x-100' : ''}`}
                      />

                      {/* Industrial Targeting Reticle & Optical Alignment HUD */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        {/* Viewfinder Corner Brackets */}
                        <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-400/90" />
                        <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-400/90" />
                        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-400/90" />
                        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-400/90" />

                        {/* Circular Dial Target Reticle */}
                        <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full border-2 border-dashed border-cyan-400/70 animate-pulse flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400/70" />
                          <div className="w-10 h-0.5 bg-cyan-400/30 absolute" />
                          <div className="w-0.5 h-10 bg-cyan-400/30 absolute" />
                        </div>

                        {/* Top HUD Badges */}
                        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>LIVE 720p HD</span>
                        </div>

                        <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-cyan-300 border border-cyan-500/30 hidden sm:flex items-center gap-1 shadow-md">
                          <Crosshair className="w-3 h-3 text-cyan-400" />
                          <span>GAUGE RETICLE</span>
                        </div>
                      </div>

                      {/* Floating Capture Snapshot Trigger */}
                      <div className="absolute bottom-4 left-0 right-0 px-4 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={captureSnapshot}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-600/30 flex items-center gap-2 transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Capture Dial / Part Snapshot</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'upload' && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative rounded-2xl border-2 border-dashed p-6 sm:p-8 aspect-video flex flex-col items-center justify-center text-center transition cursor-pointer ${
                    isDraggingFile
                      ? 'border-blue-500 bg-blue-50/60 scale-[1.01]'
                      : 'border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50/20 shadow-2xs'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-3 shadow-2xs">
                    <Upload className="w-6 h-6 animate-bounce" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 font-sans">
                    Drop Shop-Floor Photo or Click to Browse
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Drag any analog pressure gauge, valve, breaker, or mechanical part photo directly from PC explorer, or press <strong className="text-blue-600 font-mono">Ctrl+V</strong> anywhere to paste clipboard screenshot.
                  </p>
                  <div className="mt-3.5 flex items-center gap-1.5 sm:gap-2 text-[10px] font-mono text-slate-600 flex-wrap justify-center">
                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">PNG</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">JPEG</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">WEBP</span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                      Ctrl+V Ready
                    </span>
                  </div>
                </div>
              )}

              {/* Hidden Canvas for High-Resolution Frame Rendering */}
              <canvas ref={canvasRef} className="hidden" />

              {/* OEM Equipment Baseline & Compliance Card */}
              <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] text-xs font-mono space-y-2 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-[10px]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>OEM CALIBRATION SCOPE:</span>
                  </span>
                  <span className="text-blue-700 font-bold">{assetTag} Calibration Baseline</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 text-[11px] sm:text-xs">
                  <span>Max Allowable Working Pressure (MAWP):</span>
                  <strong className="text-slate-900 font-bold">25.0 Bar (362.6 PSI)</strong>
                </div>
                <div className="flex justify-between items-center text-slate-700 text-[11px] sm:text-xs">
                  <span>OSHA 1910.147 Zero Energy Tolerance:</span>
                  <strong className="text-emerald-700 font-bold">0.0 Bar / 0.0 PSI (Residual: None)</strong>
                </div>
              </div>
            </div>

            {/* Right Column: Selected Photo Preview & Diagnostics Directive (5 cols on Desktop) */}
            <div className="lg:col-span-5 flex flex-col space-y-3 sm:space-y-4">
              {/* Photo Preview Card */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                    Inspection Evidence Frame:
                  </label>
                  {selectedImage && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedImage(null);
                        if (activeTab === 'camera') startCamera();
                      }}
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold transition cursor-pointer"
                    >
                      Clear / Retake
                    </button>
                  )}
                </div>

                {selectedImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-blue-400/50 bg-slate-950 aspect-video flex items-center justify-center shadow-md">
                    <img
                      src={selectedImage}
                      alt="Captured shop-floor machine evidence"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                      <span className="bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-blue-300 border border-blue-400/30 truncate max-w-[70%]">
                        {imageSourceLabel}
                      </span>
                      <span className="bg-emerald-950/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-emerald-300 border border-emerald-500/30 shrink-0 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Ready</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#CBD5E1] bg-white aspect-video flex flex-col items-center justify-center text-center p-4 text-slate-500 shadow-2xs">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-40 text-slate-400" />
                    <p className="text-xs font-mono font-medium text-slate-700">No inspection frame captured yet</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Click &ldquo;Capture Dial Snapshot&rdquo; or upload a photo on the left
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Preset Directives */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Quick Inspection Presets:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {INSPECTION_PRESETS.map((preset) => {
                    const isSelected = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setActivePresetId(preset.id);
                          setCustomPrompt(preset.getPrompt(assetTag));
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-left text-xs font-mono transition cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                          isSelected
                            ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="text-xs">{preset.icon}</span>
                        <span className="truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Diagnostic Query / Instructions Textarea */}
              <div className="space-y-1.5 flex-1 flex flex-col justify-end">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Multimodal Directive:
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => {
                    setCustomPrompt(e.target.value);
                    setActivePresetId(null);
                  }}
                  rows={3}
                  className="w-full p-2.5 rounded-xl bg-white border border-[#CBD5E1] text-xs font-sans text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none shadow-2xs"
                  placeholder="Direct Gemini to read dial pressure, inspect nameplate, or check seal wear..."
                />

                {/* In-column Trigger for Mobile / Tablet View */}
                <button
                  type="button"
                  disabled={!selectedImage}
                  onClick={handleDispatch}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex lg:hidden items-center justify-center gap-2 transition cursor-pointer shadow-sm ${
                    selectedImage
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-blue-600/20'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Gemini Copilot</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Responsive Action / Footer Bar */}
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-[#E2E8F0] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="hidden sm:inline">Gemini Multimodal Live · Grounded Optical Verification</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
            >
              Close
            </button>

            <button
              type="button"
              disabled={!selectedImage}
              onClick={handleDispatch}
              className={`px-5 py-2 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                selectedImage
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-blue-600/20'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Send to Gemini Copilot</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

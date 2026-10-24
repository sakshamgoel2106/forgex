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

  // Hardware Camera Device States
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Set default prompt on open
  useEffect(() => {
    if (isOpen) {
      const isHindi = currentLanguage === 'hi-IN';
      const isMarathi = currentLanguage === 'mr-IN';
      const defaultText = isHindi
        ? `${selectedMachine?.assetTag || 'PUMP-001'} के एनालॉग प्रेशर गेज और मैकेनिकल सील का दृश्य निरीक्षण करें। गेज रीडिंग पढ़ें और OEM MAWP सीमाओं के विरुद्ध सत्यापित करें।`
        : isMarathi
        ? `${selectedMachine?.assetTag || 'PUMP-001'} वरील प्रेशर गेज आणि मेकॅनिकल सीलची व्हिज्युअल तपासणी करा आणि मर्यादा तपासा.`
        : `Perform visual inspection on ${
            selectedMachine?.assetTag || 'PUMP-001'
          } analog pressure gauge and mechanical seal. Extract readings and verify against OEM MAWP limits.`;
      setCustomPrompt(defaultText);
    }
  }, [isOpen, selectedMachine, currentLanguage]);

  // Clean up camera stream on close
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

  // Start live hardware camera stream
  const startCamera = useCallback(async (deviceIdToUse?: string, forcedFacing?: 'environment' | 'user') => {
    setCameraError(null);
    stopCamera();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported in this browser environment.');
      return;
    }

    try {
      const targetFacing = forcedFacing || facingMode;
      const targetDeviceId = deviceIdToUse || selectedCameraId;

      const constraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: targetFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
        `Camera Error: ${err?.message || 'Access denied or device is currently in use'}. Please permit webcam access or use file upload.`
      );
    }
  }, [selectedCameraId, facingMode, stopCamera, enumerateCameras]);

  // Flip between front and rear cameras
  const toggleFacingMode = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedCameraId('');
    startCamera(undefined, nextFacing);
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

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL('image/jpeg', 0.94);

    setSelectedImage(dataUri);
    setImageSourceLabel('Live Hardware Camera Capture');
    stopCamera();
  };

  // Process uploaded image file
  const processImageFile = (file: File) => {
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
        setImageSourceLabel(`Uploaded Photo: ${file.name}`);
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
      `Perform visual inspection on ${
        selectedMachine?.assetTag || 'PUMP-001'
      } analog pressure gauge and mechanical seal. Extract readings and verify against OEM MAWP limits.`;

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0D1527] border border-blue-900/60 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-white">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-[#090F1E] border-b border-blue-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <ScanEye className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-sans font-bold text-base text-white tracking-wide">
                  Multimodal Hardware Vision &amp; Gauge Diagnostics
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800 uppercase">
                  Gemini Multimodal Live
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  REAL HARDWARE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Real-time optical dial reading, mechanical seal wear evaluation, and OEM engineering verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Scoped Machine Selector */}
            {machines.length > 0 && onSelectMachine && (
              <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1 rounded-lg text-xs font-mono">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-400 text-[10px]">Asset:</span>
                <select
                  value={selectedMachine?.id || ''}
                  onChange={(e) => onSelectMachine(e.target.value)}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                      {m.assetTag} ({m.name.slice(0, 20)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Source Mode Tabs & Camera Controls Strip */}
        <div className="px-6 py-2.5 bg-[#070B16] border-b border-blue-950/80 flex items-center justify-between gap-3 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('camera');
                if (!isCameraActive) startCamera();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                activeTab === 'camera'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Camera Stream</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('upload');
                stopCamera();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo (JPG/PNG/WEBP)</span>
            </button>
          </div>

          {/* Camera Device Switcher & Flip (when on Camera tab) */}
          {activeTab === 'camera' && (
            <div className="flex items-center gap-2">
              {cameraDevices.length > 1 && (
                <select
                  value={selectedCameraId}
                  onChange={(e) => handleSelectCameraDevice(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 font-mono"
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
                onClick={toggleFacingMode}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                title="Toggle Front/Rear Camera"
              >
                <Repeat className="w-3 h-3 text-blue-400" />
                <span>Flip ({facingMode === 'environment' ? 'Rear' : 'Front'})</span>
              </button>

              <button
                type="button"
                onClick={() => startCamera()}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition cursor-pointer"
                title="Restart Camera"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Camera Viewfinder or Upload Dropzone */}
          <div className="md:col-span-7 flex flex-col space-y-4">
            {activeTab === 'camera' && (
              <div className="relative rounded-2xl overflow-hidden bg-black border border-blue-900/60 aspect-video flex items-center justify-center shadow-inner">
                {cameraError ? (
                  <div className="p-6 text-center space-y-3">
                    <VideoOff className="w-10 h-10 text-rose-400 mx-auto" />
                    <p className="text-xs text-rose-300 font-sans max-w-sm mx-auto">{cameraError}</p>
                    <button
                      onClick={() => startCamera()}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition cursor-pointer"
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
                      className="w-full h-full object-cover"
                    />

                    {/* Industrial Targeting Reticle Overlay */}
                    <div className="absolute inset-0 border border-blue-500/30 pointer-events-none flex items-center justify-center">
                      <div className="w-44 h-44 rounded-full border-2 border-dashed border-blue-400/80 animate-pulse flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-blue-500/50" />
                      </div>
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        LIVE VIEWFINDER · 1080p
                      </div>
                    </div>

                    {/* Capture Frame Button Floating on Video */}
                    <div className="absolute bottom-4 left-0 right-0 px-6 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={captureSnapshot}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/40 flex items-center gap-2 transition cursor-pointer"
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
                className={`relative rounded-2xl border-2 border-dashed p-8 aspect-video flex flex-col items-center justify-center text-center transition cursor-pointer ${
                  isDraggingFile
                    ? 'border-blue-400 bg-blue-950/40'
                    : 'border-slate-700 bg-slate-900/60 hover:border-blue-500 hover:bg-slate-900'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-white font-sans">
                  Drop Shop-Floor Photo or Click to Browse
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Upload high-resolution camera photos of analog pressure gauges, isolation padlocks, nameplates, or corroded mechanical seals.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">PNG</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">JPEG</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">WEBP</span>
                  <span className="text-slate-400">Up to 50 MB</span>
                </div>
              </div>
            )}

            {/* Hidden canvas used for high-res frame snapshot */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Equipment Safety Information Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>OEM CALIBRATION SCOPE:</span>
                <span className="text-blue-400 font-bold">Lowara e-SV Standard</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Maximum Allowable Working Pressure (MAWP):</span>
                <strong className="text-white">25.0 Bar (362.6 PSI)</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>OSHA 1910.147 Zero Energy Tolerance:</span>
                <strong className="text-emerald-400">0.0 Bar / 0.0 PSI (Residual: None)</strong>
              </div>
            </div>
          </div>

          {/* Right Column: Selected Photo Preview & Diagnostic Dispatch */}
          <div className="md:col-span-5 flex flex-col space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                <span>Inspection Photo Preview:</span>
                {selectedImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImage(null);
                      if (activeTab === 'camera') startCamera();
                    }}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition"
                  >
                    Clear / Retake
                  </button>
                )}
              </label>

              {selectedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-blue-500/50 bg-black aspect-video flex items-center justify-center shadow-md">
                  <img
                    src={selectedImage}
                    alt="Captured shop-floor machine evidence"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-blue-300 border border-blue-500/40 truncate max-w-[90%]">
                    {imageSourceLabel}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 aspect-video flex flex-col items-center justify-center text-center p-4 text-slate-500">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs font-mono">No inspection frame captured yet</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Click &ldquo;Capture Snapshot&rdquo; or upload a gauge photo on the left
                  </p>
                </div>
              )}
            </div>

            {/* Diagnostic Query / Instructions Input */}
            <div className="space-y-1.5 flex-1 flex flex-col justify-end">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Multimodal Inspection Directive:
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-sans text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none shadow-inner"
                placeholder="Direct Gemini to read dial pressure, inspect nameplate, or check seal wear..."
              />

              <button
                type="button"
                disabled={!selectedImage}
                onClick={handleDispatch}
                className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${
                  selectedImage
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Send to Gemini Copilot for Grounded Diagnosis</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

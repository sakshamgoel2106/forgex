import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ScanEye,
  VideoOff,
  Sliders,
  Send,
  Wrench,
  Check,
} from 'lucide-react';
import {
  SHOP_FLOOR_PRESETS,
  ShopFloorPreset,
} from '../../utils/shopFloorImagePresets';
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
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'samples'>('samples');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<ShopFloorPreset | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-select the first preset on open for instantaneous stage demo readiness
  useEffect(() => {
    if (isOpen && !selectedImage) {
      const defaultPreset = SHOP_FLOOR_PRESETS[0];
      setSelectedPreset(defaultPreset);
      setSelectedImage(defaultPreset.getDataUri());
      setCustomPrompt(`Perform visual inspection on ${selectedMachine?.assetTag || 'PUMP-001'} analog pressure gauge. Read pressure and verify against OEM MAWP limits.`);
    }
  }, [isOpen, selectedImage, selectedMachine]);

  // Clean up camera stream on close
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen, stopCamera]);

  // Start live webcam feed
  const startCamera = async () => {
    setCameraError(null);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setActiveTab('camera');
    } catch (err: any) {
      console.warn('Webcam access error:', err);
      setCameraError('Camera access denied or unavailable. You can use sample stage presets or upload a photo.');
    }
  };

  // Capture current frame from live video
  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL('image/jpeg', 0.92);
    setSelectedImage(dataUri);
    setSelectedPreset(null);
    stopCamera();
  };

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      if (dataUri) {
        setSelectedImage(dataUri);
        setSelectedPreset(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle preset selection
  const handleSelectPreset = (preset: ShopFloorPreset) => {
    setSelectedPreset(preset);
    setSelectedImage(preset.getDataUri());
    if (preset.expectedStatus === 'CRITICAL_OVERPRESSURE') {
      setCustomPrompt(`Read analog pressure gauge PG-101 on ${selectedMachine?.assetTag || 'PUMP-001'} and compare against OEM MAWP ratings.`);
    } else if (preset.expectedStatus === 'SAFE_ZERO_ENERGY') {
      setCustomPrompt(`Verify zero energy state on ${selectedMachine?.assetTag || 'PUMP-001'} pressure gauge for OSHA 1910.147 LOTO clearance.`);
    } else {
      setCustomPrompt(`Perform visual component inspection on ${selectedMachine?.assetTag || 'PUMP-001'} mechanical seal face for dry-running damage.`);
    }
  };

  // Send selected image to Copilot
  const handleDispatch = () => {
    if (!selectedImage) return;
    const prompt =
      customPrompt.trim() ||
      (selectedPreset?.expectedStatus === 'CRITICAL_OVERPRESSURE'
        ? `Read analog pressure gauge PG-101 on ${selectedMachine?.assetTag || 'PUMP-001'} and compare against OEM MAWP ratings.`
        : selectedPreset?.expectedStatus === 'SAFE_ZERO_ENERGY'
        ? `Verify zero energy state on ${selectedMachine?.assetTag || 'PUMP-001'} pressure gauge for OSHA 1910.147 LOTO clearance.`
        : `Inspect component image on ${selectedMachine?.assetTag || 'PUMP-001'} and evaluate surface wear against OEM specifications.`);

    const callback = onDiagnose || onSendToCopilot;
    callback?.(selectedImage, prompt);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
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
                  Multimodal Vision &amp; Gauge Diagnostics
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800 uppercase">
                  Gemini 2.5 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Read analog pressure gauges, verify zero-energy LOTO, and detect mechanical component wear
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
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 1-Click Stage Demo Presets Bar (Always visible for stage reliability) */}
        <div className="px-6 py-2.5 bg-[#070B16] border-b border-blue-950/80 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2 shrink-0 text-xs font-semibold text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Stage Demo Presets:</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            {SHOP_FLOOR_PRESETS.map((preset) => {
              const isSelected = selectedPreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition shrink-0 flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-400 shadow-sm shadow-blue-500/30 font-bold'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {preset.expectedStatus === 'CRITICAL_OVERPRESSURE' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : preset.expectedStatus === 'SAFE_ZERO_ENERGY' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Input Modes & Camera Viewfinder */}
          <div className="md:col-span-7 flex flex-col space-y-4">
            {/* Input Mode Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs shrink-0">
              <button
                onClick={() => {
                  setActiveTab('samples');
                  stopCamera();
                }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'samples' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Shop-Floor Presets</span>
              </button>
              <button
                onClick={startCamera}
                className={`flex-1 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'camera' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Live Camera</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('upload');
                  stopCamera();
                }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'upload' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Image</span>
              </button>
            </div>

            {/* Camera Viewfinder View */}
            {activeTab === 'camera' && (
              <div className="relative rounded-xl overflow-hidden bg-black border border-blue-900/60 aspect-video flex items-center justify-center">
                {cameraError ? (
                  <div className="p-6 text-center space-y-2">
                    <VideoOff className="w-8 h-8 text-rose-400 mx-auto" />
                    <p className="text-xs text-rose-300 font-sans">{cameraError}</p>
                    <button
                      onClick={() => setActiveTab('samples')}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition"
                    >
                      Use Stage Demo Presets
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
                    {/* Viewfinder Reticle / Crosshair Overlay */}
                    <div className="absolute inset-0 pointer-events-none border-2 border-blue-500/30 m-6 rounded-lg flex items-center justify-center">
                      <div className="w-16 h-16 border-2 border-blue-400/80 rounded-full flex items-center justify-center animate-pulse">
                        <div className="w-2 h-2 bg-blue-400 rounded-full" />
                      </div>
                      <div className="absolute top-2 left-2 text-[10px] font-mono text-blue-300/80">
                        ALIGN GAUGE DIAL OR COMPONENT
                      </div>
                    </div>

                    {/* Snapshot Action Button */}
                    <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                      <button
                        onClick={captureSnapshot}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/40 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Capture Frame</span>
                      </button>
                    </div>
                  </>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            {/* Upload Dropzone View */}
            {activeTab === 'upload' && (
              <label className="rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/50 hover:bg-slate-900/90 aspect-video flex flex-col items-center justify-center cursor-pointer transition p-6 text-center group">
                <Upload className="w-10 h-10 text-slate-500 group-hover:text-blue-400 mb-2 transition" />
                <span className="text-sm font-bold text-white mb-1">
                  Click or drag and drop plant photo
                </span>
                <span className="text-xs text-slate-400">
                  Supports PNG, JPEG, and WebP (up to 50MB)
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}

            {/* Stage Samples Grid View */}
            {activeTab === 'samples' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SHOP_FLOOR_PRESETS.map((preset) => {
                  const isSelected = selectedPreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between space-y-2 transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-950/70 border-blue-400 ring-2 ring-blue-500/40 shadow-md shadow-blue-950'
                          : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                              preset.expectedStatus === 'CRITICAL_OVERPRESSURE'
                                ? 'bg-rose-950 text-rose-300 border-rose-800'
                                : preset.expectedStatus === 'SAFE_ZERO_ENERGY'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border-amber-800'
                            }`}
                          >
                            {preset.category}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </div>
                        <h4 className="text-xs font-bold text-white line-clamp-1">{preset.name}</h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400 font-bold">Status:</span>
                        <span
                          className={
                            preset.expectedStatus === 'CRITICAL_OVERPRESSURE'
                              ? 'text-rose-400 font-bold'
                              : preset.expectedStatus === 'SAFE_ZERO_ENERGY'
                              ? 'text-emerald-400 font-bold'
                              : 'text-amber-400 font-bold'
                          }
                        >
                          {preset.expectedStatus.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Custom Question / Instructions input */}
            <div className="space-y-1 pt-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Inquiry / Inspection Prompt:</span>
                <span className="text-[10px] font-mono text-slate-500">
                  Target Language: {currentLanguage}
                </span>
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
                placeholder="Ask Copilot about this image (e.g. 'Read pressure gauge and verify OEM MAWP limits')..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>
          </div>

          {/* Right Column: High-Res Image Snapshot Preview & Telemetry Overlay */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4 bg-[#090F1E] border border-blue-950 rounded-xl p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400">
                  Active Capture Preview
                </span>
                {selectedPreset && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${selectedPreset.badgeColor}`}
                  >
                    {selectedPreset.badgeText}
                  </span>
                )}
              </div>

              {/* Render Selected Image Preview */}
              <div className="rounded-xl overflow-hidden bg-black/80 border border-slate-800 aspect-square flex items-center justify-center p-2 relative group">
                {selectedImage ? (
                  <img
                    src={selectedImage}
                    alt="Inspection Snapshot Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-xs text-slate-500 space-y-1">
                    <ScanEye className="w-8 h-8 mx-auto text-slate-600" />
                    <span>Select a preset or capture camera snapshot</span>
                  </div>
                )}

                {/* Scoped Equipment Watermark */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-xs px-2 py-1 rounded text-[10px] font-mono border border-slate-800 text-slate-300">
                  Target: {selectedMachine?.assetTag || 'PUMP-001'}
                </div>
              </div>

              {/* Verified OEM Limits Snapshot */}
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-1.5 font-sans">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">OEM Equipment:</span>
                  <span className="font-bold text-white truncate">
                    {selectedMachine?.name || 'Lowara e-SV Multistage Pump'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Design MAWP Limit:</span>
                  <strong className="text-amber-400 font-mono">25.0 Bar (362.6 PSI)</strong>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">LOTO Standard:</span>
                  <span className="text-emerald-400 font-mono font-bold">OSHA 1910.147</span>
                </div>
              </div>
            </div>

            {/* Send to Copilot Action Button */}
            <div className="pt-3 border-t border-blue-950/80 space-y-2">
              <button
                type="button"
                onClick={handleDispatch}
                disabled={!selectedImage}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Analyze with Gemini &amp; Send to Copilot</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

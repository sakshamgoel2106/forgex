import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Activity,
  Volume2,
  VolumeX,
  Mic,
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Gauge,
  ChevronDown,
  Upload,
  FileAudio,
  MonitorUp,
  Radio,
  HardDrive,
} from 'lucide-react';
import type {
  AcousticTelemetry,
  AcousticAnomalyPattern,
  AcousticSourceMode,
  Machine,
} from '@forgex/shared-types';

interface AcousticDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMachine: Machine | null;
  machines: Machine[];
  onSelectMachine: (machineId: string) => void;
  onDiagnose: (telemetry: AcousticTelemetry, promptText: string) => void;
  currentLanguage?: string;
}

export const AcousticDiagnosticsModal: React.FC<AcousticDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  selectedMachine,
  machines,
  onSelectMachine,
  onDiagnose,
  currentLanguage = 'en-US',
}) => {
  // Active Input Mode: Live Microphone, PC Audio File, or Tab/System Audio
  const [sourceMode, setSourceMode] = useState<AcousticSourceMode>('LIVE_MIC');

  // Mode 1: Hardware Audio Devices State
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedDeviceLabel, setSelectedDeviceLabel] = useState<string>('Default Hardware Microphone');
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [audioMonitorEnabled, setAudioMonitorEnabled] = useState(false);

  // Mode 2: Uploaded Audio File State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedAudioBuffer, setUploadedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  const [isFilePlaying, setIsFilePlaying] = useState(false);
  const [fileCurrentTime, setFileCurrentTime] = useState(0);
  const [fileDuration, setFileDuration] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const filePlaybackStartTimeRef = useRef<number>(0);
  const filePlaybackOffsetRef = useRef<number>(0);
  const filePlaybackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mode 3: Display Media (Tab/System Audio) State
  const [isCapturingSystemAudio, setIsCapturingSystemAudio] = useState(false);
  const [systemAudioTrackLabel, setSystemAudioTrackLabel] = useState<string | null>(null);
  const [systemAudioError, setSystemAudioError] = useState<string | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  // Scanning & Recording State
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); // 0 - 100%
  const [timeRemainingSec, setTimeRemainingSec] = useState(5.0);
  const [isScanComplete, setIsScanComplete] = useState(false);

  // Recorded Audio Output (for Mic and Tab Audio)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string>('audio/webm');
  const [isPlayingRecordedAudio, setIsPlayingRecordedAudio] = useState(false);
  const recordedAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Real-time Physical Hardware DSP Telemetry State
  const [liveDominantHz, setLiveDominantHz] = useState<number>(120);
  const [livePeakDb, setLivePeakDb] = useState<number>(-42.0);
  const [liveRmsDbfs, setLiveRmsDbfs] = useState<number>(-48.0);
  const [liveCrestFactorDb, setLiveCrestFactorDb] = useState<number>(12.0);
  const [liveCentroidHz, setLiveCentroidHz] = useState<number>(450);
  const [liveBandEnergy, setLiveBandEnergy] = useState({ low: 0.33, mid: 0.34, high: 0.33 });
  const [liveCrestCategory, setLiveCrestCategory] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [livePattern, setLivePattern] = useState<AcousticAnomalyPattern>('NOMINAL');
  const [capturedTelemetry, setCapturedTelemetry] = useState<AcousticTelemetry | null>(null);

  // Machine Target
  const targetMachine = selectedMachine || machines[0] || {
    id: 'PUMP-001-DEFAULT',
    assetTag: 'PUMP-001',
    name: 'Lowara Xylem e-SV Vertical Multistage Pump',
    machineType: 'PUMP',
    area: 'Feed Line Alpha',
  };

  // Shared Core Audio Nodes & Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const systemSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Rolling Sample Accumulator during 5-second scan window
  const accumulatedSamplesRef = useRef<{
    domHzList: number[];
    peakDbList: number[];
    rmsDbList: number[];
    crestDbList: number[];
    centroidList: number[];
    lowList: number[];
    midList: number[];
    highList: number[];
    snapshots: number[][];
  }>({
    domHzList: [],
    peakDbList: [],
    rmsDbList: [],
    crestDbList: [],
    centroidList: [],
    lowList: [],
    midList: [],
    highList: [],
    snapshots: [],
  });

  // Ensure AudioContext and AnalyserNode (fftSize=4096, smoothing=0.2)
  const getOrCreateAudioContext = useCallback(async () => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioCtx({ sampleRate: 48000 });
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;
    }

    if (!monitorGainRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = audioMonitorEnabled ? 0.05 : 0.0;
      gain.connect(ctx.destination);
      monitorGainRef.current = gain;
    }

    return { ctx, analyser: analyserRef.current, monitorGain: monitorGainRef.current };
  }, [audioMonitorEnabled]);

  // Enumerate physical hardware audio devices
  const enumerateHardwareMics = useCallback(async (requestPermissionFirst = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setMicPermissionError('Web Audio API or MediaDevices not supported in this browser.');
      return;
    }

    try {
      if (requestPermissionFirst) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          tempStream.getTracks().forEach((t) => t.stop());
        } catch {
          // If denied, enumerate will still return default device without label
        }
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(audioInputs);

      if (audioInputs.length > 0) {
        setSelectedDeviceId((prev) => {
          const exists = audioInputs.some((d) => d.deviceId === prev);
          if (exists && prev) return prev;
          const first = audioInputs[0];
          setSelectedDeviceLabel(first.label || 'Default Physical Microphone');
          return first.deviceId;
        });
      }
    } catch (err: any) {
      console.warn('Failed to enumerate hardware audio devices:', err);
    }
  }, []);

  // Stop microphone stream safely
  const stopMicStream = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (micSourceNodeRef.current) {
      try {
        micSourceNodeRef.current.disconnect();
      } catch {}
      micSourceNodeRef.current = null;
    }
  }, []);

  // Stop system / tab audio capture stream safely
  const stopSystemStream = useCallback(() => {
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
    }
    if (systemSourceNodeRef.current) {
      try {
        systemSourceNodeRef.current.disconnect();
      } catch {}
      systemSourceNodeRef.current = null;
    }
    setIsCapturingSystemAudio(false);
    setSystemAudioTrackLabel(null);
  }, []);

  // Stop file playback stream safely
  const stopFilePlayback = useCallback(() => {
    if (audioBufferSourceRef.current) {
      try {
        audioBufferSourceRef.current.stop();
        audioBufferSourceRef.current.disconnect();
      } catch {}
      audioBufferSourceRef.current = null;
    }
    if (filePlaybackTimerRef.current) {
      clearInterval(filePlaybackTimerRef.current);
      filePlaybackTimerRef.current = null;
    }
    setIsFilePlaying(false);
  }, []);

  // Teardown all Web Audio resources
  const teardownAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    stopMicStream();
    stopSystemStream();
    stopFilePlayback();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    monitorGainRef.current = null;

    if (recordedAudioElementRef.current) {
      recordedAudioElementRef.current.pause();
      setIsPlayingRecordedAudio(false);
    }
  }, [stopMicStream, stopSystemStream, stopFilePlayback]);

  // =========================================================================
  // MODE 1: SETUP LIVE HARDWARE DESKTOP MICROPHONE
  // =========================================================================
  const setupHardwareAudio = useCallback(async (deviceIdToUse?: string) => {
    stopMicStream();
    stopSystemStream();
    stopFilePlayback();
    setMicPermissionError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicPermissionError('Browser does not support navigator.mediaDevices.getUserMedia');
      return;
    }

    try {
      const { ctx, analyser, monitorGain } = await getOrCreateAudioContext();

      const effectiveDeviceId = deviceIdToUse || selectedDeviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: effectiveDeviceId ? { exact: effectiveDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });

      micStreamRef.current = stream;

      const activeTrack = stream.getAudioTracks()[0];
      if (activeTrack && activeTrack.label) {
        setSelectedDeviceLabel(activeTrack.label);
      }

      const source = ctx.createMediaStreamSource(stream);
      micSourceNodeRef.current = source;
      source.connect(analyser);

      if (monitorGain) {
        source.connect(monitorGain);
      }
    } catch (err: any) {
      console.error('Failed to initialize raw hardware microphone stream:', err);
      setMicPermissionError(
        `Microphone Access Error: ${err?.message || 'Permission denied or audio device is locked by another program'}. Please allow microphone access in your browser address bar.`
      );
    }
  }, [selectedDeviceId, getOrCreateAudioContext, stopMicStream, stopSystemStream, stopFilePlayback]);

  // Handle changing input device from dropdown
  const handleSelectDevice = async (device: MediaDeviceInfo) => {
    setSelectedDeviceId(device.deviceId);
    setSelectedDeviceLabel(device.label || `Microphone (${device.deviceId.slice(0, 6)}...)`);
    setIsDeviceMenuOpen(false);
    await setupHardwareAudio(device.deviceId);
  };

  // =========================================================================
  // MODE 2: UPLOAD & DECODE REAL PC AUDIO FILE (.wav, .mp3, .webm)
  // =========================================================================
  const handleProcessAudioFile = async (file: File) => {
    if (!file) return;
    setMicPermissionError(null);
    setUploadedFile(file);
    stopFilePlayback();
    stopMicStream();
    stopSystemStream();

    try {
      const { ctx } = await getOrCreateAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      setUploadedAudioBuffer(decodedBuffer);
      setFileDuration(decodedBuffer.duration);
      setFileCurrentTime(0);
      filePlaybackOffsetRef.current = 0;

      const objectUrl = URL.createObjectURL(file);
      setUploadedAudioUrl(objectUrl);

      // Read as base64 for Copilot Gemini Multimodal dispatch
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = reader.result as string;
        setUploadedBase64(b64);
        setRecordedBase64(b64);
        setRecordedMimeType(file.type || 'audio/wav');
        setRecordedAudioUrl(objectUrl);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Failed to decode PC audio file:', err);
      setMicPermissionError(
        `Audio Decode Error: Could not decode '${file.name}'. Ensure it is a valid .wav, .mp3, .ogg, or .webm file.`
      );
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessAudioFile(file);
    }
  };

  const playUploadedAudio = async (startOffset = 0) => {
    if (!uploadedAudioBuffer) return;
    stopFilePlayback();

    const { ctx, analyser } = await getOrCreateAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = uploadedAudioBuffer;

    // Connect into Analyser for live FFT AND into destination for real audible playback
    source.connect(analyser);
    source.connect(ctx.destination);

    audioBufferSourceRef.current = source;
    filePlaybackStartTimeRef.current = ctx.currentTime - startOffset;
    filePlaybackOffsetRef.current = startOffset;

    source.onended = () => {
      setIsFilePlaying(false);
      setFileCurrentTime(uploadedAudioBuffer.duration);
      if (filePlaybackTimerRef.current) clearInterval(filePlaybackTimerRef.current);
    };

    source.start(0, startOffset);
    setIsFilePlaying(true);

    if (filePlaybackTimerRef.current) clearInterval(filePlaybackTimerRef.current);
    filePlaybackTimerRef.current = setInterval(() => {
      if (!audioContextRef.current || !uploadedAudioBuffer) return;
      const elapsed = audioContextRef.current.currentTime - filePlaybackStartTimeRef.current;
      if (elapsed <= uploadedAudioBuffer.duration) {
        setFileCurrentTime(parseFloat(elapsed.toFixed(1)));
      }
    }, 100);
  };

  const pauseUploadedAudio = () => {
    if (!audioContextRef.current || !isFilePlaying) return;
    const current = audioContextRef.current.currentTime - filePlaybackStartTimeRef.current;
    filePlaybackOffsetRef.current = Math.max(0, current);
    stopFilePlayback();
    setFileCurrentTime(filePlaybackOffsetRef.current);
  };

  const togglePlayUploadedAudio = () => {
    if (isFilePlaying) {
      pauseUploadedAudio();
    } else {
      const offset = fileCurrentTime >= fileDuration ? 0 : fileCurrentTime;
      playUploadedAudio(offset);
    }
  };

  const handleSeekScrubber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setFileCurrentTime(newTime);
    filePlaybackOffsetRef.current = newTime;
    if (isFilePlaying) {
      playUploadedAudio(newTime);
    }
  };

  // =========================================================================
  // MODE 3: CAPTURE DESKTOP TAB / SYSTEM AUDIO (getDisplayMedia)
  // =========================================================================
  const handleStartCaptureSystemAudio = async () => {
    stopMicStream();
    stopFilePlayback();
    stopSystemStream();
    setSystemAudioError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setSystemAudioError('Desktop tab/system audio capture is not supported by your browser.');
      return;
    }

    try {
      const { ctx, analyser, monitorGain } = await getOrCreateAudioContext();

      // Request screen/tab sharing with audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        setSystemAudioError(
          'No audio stream captured. Please select a browser tab or screen and ensure you check "Also share tab audio" in the browser prompt.'
        );
        return;
      }

      // Stop unused video track immediately to conserve GPU/CPU
      displayStream.getVideoTracks().forEach((t) => t.stop());

      displayStreamRef.current = displayStream;
      setIsCapturingSystemAudio(true);
      setSystemAudioTrackLabel(audioTracks[0].label || 'Active Tab Audio');

      // Listen for when technician stops screen sharing via browser native bar
      audioTracks[0].onended = () => {
        stopSystemStream();
      };

      const source = ctx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      systemSourceNodeRef.current = source;
      source.connect(analyser);

      if (monitorGain) {
        source.connect(monitorGain);
      }
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        console.error('System audio capture error:', err);
        setSystemAudioError(
          `System Audio Error: ${err?.message || 'Access denied or canceled'}. Ensure you check "Share tab audio" in the prompt.`
        );
      }
      setIsCapturingSystemAudio(false);
    }
  };

  // Switch between 3 Real Modes
  const handleSwitchMode = (mode: AcousticSourceMode) => {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    setIsScanComplete(false);
    setCapturedTelemetry(null);

    if (mode === 'LIVE_MIC') {
      setupHardwareAudio();
    } else if (mode === 'FILE_UPLOAD') {
      stopMicStream();
      stopSystemStream();
    } else if (mode === 'TAB_SYSTEM_AUDIO') {
      stopMicStream();
      stopFilePlayback();
      handleStartCaptureSystemAudio();
    }
  };

  // Speaker Monitor Volume Toggle
  const toggleAudioMonitor = () => {
    const next = !audioMonitorEnabled;
    setAudioMonitorEnabled(next);
    if (monitorGainRef.current && audioContextRef.current) {
      monitorGainRef.current.gain.setValueAtTime(next ? 0.05 : 0.0, audioContextRef.current.currentTime);
    }
  };

  // =========================================================================
  // 5-SECOND SAMPLING & MEDIA RECORDER WINDOW
  // =========================================================================
  const handleStartScan = () => {
    setIsScanComplete(false);
    setCapturedTelemetry(null);
    setScanProgress(0);
    setTimeRemainingSec(5.0);
    setIsPlayingRecordedAudio(false);
    setIsScanning(true);

    accumulatedSamplesRef.current = {
      domHzList: [],
      peakDbList: [],
      rmsDbList: [],
      crestDbList: [],
      centroidList: [],
      lowList: [],
      midList: [],
      highList: [],
      snapshots: [],
    };

    // Mode-specific audio recording
    if (sourceMode === 'FILE_UPLOAD') {
      if (!isFilePlaying) {
        playUploadedAudio(fileCurrentTime >= fileDuration ? 0 : fileCurrentTime);
      }
    } else {
      // Live Mic or Tab System Audio: Record via MediaRecorder
      const activeStream =
        sourceMode === 'LIVE_MIC'
          ? micStreamRef.current
          : displayStreamRef.current && displayStreamRef.current.getAudioTracks().length > 0
          ? new MediaStream(displayStreamRef.current.getAudioTracks())
          : null;

      if (activeStream) {
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/webm';

          setRecordedMimeType(mimeType);
          recordedChunksRef.current = [];
          const recorder = new MediaRecorder(activeStream, { mimeType });

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };

          recorder.onstop = () => {
            const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
            const url = URL.createObjectURL(audioBlob);
            setRecordedAudioUrl(url);

            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              setRecordedBase64(base64);
            };
            reader.readAsDataURL(audioBlob);
          };

          recorder.start(100);
          mediaRecorderRef.current = recorder;
        } catch (err) {
          console.warn('MediaRecorder init error:', err);
        }
      }
    }

    const startTime = Date.now();
    const duration = 5000;

    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    scanTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      const remaining = Math.max(0, (duration - elapsed) / 1000);

      setScanProgress(progress);
      setTimeRemainingSec(parseFloat(remaining.toFixed(1)));

      if (elapsed >= duration) {
        if (scanTimerRef.current) clearInterval(scanTimerRef.current);
        finishScan();
      }
    }, 100);
  };

  // Finalize 5-Second Scan and Compute Diagnostic Payload from Physical Hardware Data
  const finishScan = () => {
    setIsScanning(false);
    setIsScanComplete(true);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    const data = accumulatedSamplesRef.current;
    const count = data.domHzList.length || 1;

    const avgDomHz = Math.round(data.domHzList.reduce((a, b) => a + b, 0) / count) || 120;
    const avgPeakDb = parseFloat((data.peakDbList.reduce((a, b) => a + b, 0) / count).toFixed(1)) || -38.5;
    const avgRmsDb = parseFloat((data.rmsDbList.reduce((a, b) => a + b, 0) / count).toFixed(1)) || -44.0;
    const avgCrestDb = parseFloat((data.crestDbList.reduce((a, b) => a + b, 0) / count).toFixed(1)) || 12.0;
    const avgCentroid = Math.round(data.centroidList.reduce((a, b) => a + b, 0) / count) || Math.round(avgDomHz * 1.15);

    const avgLow = parseFloat((data.lowList.reduce((a, b) => a + b, 0) / count).toFixed(3)) || 0.33;
    const avgMid = parseFloat((data.midList.reduce((a, b) => a + b, 0) / count).toFixed(3)) || 0.34;
    const avgHigh = parseFloat((data.highList.reduce((a, b) => a + b, 0) / count).toFixed(3)) || 0.33;

    const totalBand = avgLow + avgMid + avgHigh || 1.0;
    const normalizedBands = {
      low: parseFloat((avgLow / totalBand).toFixed(3)),
      mid: parseFloat((avgMid / totalBand).toFixed(3)),
      high: parseFloat((avgHigh / totalBand).toFixed(3)),
    };

    // Real Physical Machine DSP Classification:
    // Mid-Band resonance (500-2500 Hz) with high energy -> Cavitation
    // High-Band friction (>2500 Hz) -> Bearing Wear / Raceway Breakdown
    // Low-Band resonance (<500 Hz) -> Mechanical Unbalance / Misalignment
    let pattern: AcousticAnomalyPattern = 'NOMINAL';
    if (normalizedBands.mid >= 0.40 && avgDomHz >= 500 && avgDomHz <= 2500 && avgPeakDb > -50) {
      pattern = 'CAVITATION_SUSPECTED';
    } else if ((normalizedBands.high >= 0.30 || avgDomHz > 2500) && avgPeakDb > -50) {
      pattern = 'BEARING_WEAR_SUSPECTED';
    } else if (normalizedBands.low >= 0.48 && avgDomHz < 500 && avgPeakDb > -50) {
      pattern = 'IMBALANCE_SUSPECTED';
    }

    const latestSnapshot =
      data.snapshots[data.snapshots.length - 1] || Array.from({ length: 32 }, () => 0.05);

    const sourceName =
      sourceMode === 'LIVE_MIC'
        ? selectedDeviceLabel
        : sourceMode === 'FILE_UPLOAD'
        ? `Field Recording (${uploadedFile?.name || 'PC Audio'})`
        : `Desktop Tab Audio (${systemAudioTrackLabel || 'SCADA Feed'})`;

    const telemetry: AcousticTelemetry = {
      dominantFrequencyHz: avgDomHz,
      peakDecibels: avgPeakDb,
      rmsLevelDbfs: avgRmsDb,
      crestFactorDb: avgCrestDb,
      spectralCentroidHz: avgCentroid,
      crestFactor: avgCrestDb > 16 ? 'HIGH' : avgCrestDb > 10 ? 'MEDIUM' : 'LOW',
      bandEnergy: normalizedBands,
      detectedPattern: pattern,
      sampleDurationMs: 5000,
      waveformSnapshot: latestSnapshot.slice(0, 32),
      inputDeviceName: sourceName,
      recordingDurationSec: 5.0,
      audioBase64: (sourceMode === 'FILE_UPLOAD' ? uploadedBase64 : recordedBase64) || undefined,
      audioMimeType: sourceMode === 'FILE_UPLOAD' ? uploadedFile?.type || 'audio/wav' : recordedMimeType,
      sourceMode,
    };

    setCapturedTelemetry(telemetry);
  };

  // Toggle playback of recorded machine audio
  const togglePlayRecordedAudio = () => {
    const url = recordedAudioUrl || uploadedAudioUrl;
    if (!url) return;

    if (!recordedAudioElementRef.current) {
      const audio = new Audio(url);
      audio.onended = () => setIsPlayingRecordedAudio(false);
      recordedAudioElementRef.current = audio;
    }

    if (recordedAudioElementRef.current) {
      if (isPlayingRecordedAudio) {
        recordedAudioElementRef.current.pause();
        setIsPlayingRecordedAudio(false);
      } else {
        recordedAudioElementRef.current.play();
        setIsPlayingRecordedAudio(true);
      }
    }
  };

  // Submit Telemetry and Auto-Dispatch to Copilot
  const handleDispatchToCopilot = () => {
    if (!capturedTelemetry) return;

    const patternTitles: Record<AcousticAnomalyPattern, string> = {
      CAVITATION_SUSPECTED: 'Impeller Cavitation & Fluid Recirculation suspected',
      BEARING_WEAR_SUSPECTED: 'High-Frequency Metallic Bearing Wear & Raceway Spalling suspected',
      IMBALANCE_SUSPECTED: 'Mechanical Rotational Unbalance or Coupling Misalignment suspected',
      NOMINAL: 'Baseline Nominal Machine Operation verified',
    };

    const finalTelemetry: AcousticTelemetry = {
      ...capturedTelemetry,
      audioBase64: (sourceMode === 'FILE_UPLOAD' ? uploadedBase64 : recordedBase64) || capturedTelemetry.audioBase64,
      audioMimeType: sourceMode === 'FILE_UPLOAD' ? uploadedFile?.type || 'audio/wav' : recordedMimeType,
    };

    const promptText = `Perform acoustic vibration diagnosis on ${targetMachine.assetTag} captured via ${capturedTelemetry.inputDeviceName || 'desktop hardware'}: Dominant peak at ${Math.round(
      finalTelemetry.dominantFrequencyHz
    )} Hz (${finalTelemetry.peakDecibels} dB, RMS ${finalTelemetry.rmsLevelDbfs || -42} dBFS, Crest Factor ${finalTelemetry.crestFactorDb || 12} dB, Centroid ${finalTelemetry.spectralCentroidHz || 600} Hz), indicating ${
      patternTitles[finalTelemetry.detectedPattern]
    }. Compare with OEM Lowara e-SV tolerances and recommend immediate corrective measures.`;

    onDiagnose(finalTelemetry, promptText);
    teardownAudio();
    onClose();
  };

  // Reset / Recalibrate
  const handleResetScan = () => {
    setIsScanComplete(false);
    setCapturedTelemetry(null);
    setScanProgress(0);
    setTimeRemainingSec(5.0);
    if (recordedAudioElementRef.current) {
      recordedAudioElementRef.current.pause();
      setIsPlayingRecordedAudio(false);
    }
  };

  // Initialize Hardware Audio on Open
  useEffect(() => {
    if (isOpen) {
      enumerateHardwareMics(true);
      if (sourceMode === 'LIVE_MIC') {
        setupHardwareAudio();
      }
    } else {
      teardownAudio();
    }
    return () => {
      teardownAudio();
    };
  }, [isOpen, enumerateHardwareMics, setupHardwareAudio, teardownAudio, sourceMode]);

  // Re-enumerate audio devices on physical plug/unplug
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      const handleDeviceChange = () => {
        enumerateHardwareMics(false);
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [enumerateHardwareMics]);

  // =========================================================================
  // 60FPS REAL-TIME DSP TELEMETRY & FFT CANVAS ANIMATION LOOP
  // =========================================================================
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;

    const render = () => {
      if (!isSubscribed) return;

      const canvas = canvasRef.current;
      const analyser = analyserRef.current;

      if (canvas && analyser) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          // 1. Float Time-Domain Data for RMS & Crest Factor (4096 samples)
          const timeData = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(timeData);

          let sumSquares = 0;
          let peakAmp = 0;
          for (let i = 0; i < timeData.length; i++) {
            const sample = timeData[i];
            sumSquares += sample * sample;
            const abs = Math.abs(sample);
            if (abs > peakAmp) peakAmp = abs;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          const currentRmsDbfs = parseFloat((20 * Math.log10(Math.max(rms, 1e-6))).toFixed(1));
          const crestRatio = peakAmp / Math.max(rms, 1e-6);
          const currentCrestDb = parseFloat((20 * Math.log10(Math.max(crestRatio, 1.0))).toFixed(1));
          const crestCat: 'LOW' | 'MEDIUM' | 'HIGH' =
            currentCrestDb > 16 ? 'HIGH' : currentCrestDb > 10 ? 'MEDIUM' : 'LOW';

          // 2. Float Frequency Data for Dominant Peak, Spectral Centroid, Band Energies (2048 bins)
          const bufferLength = analyser.frequencyBinCount;
          const freqData = new Float32Array(bufferLength);
          analyser.getFloatFrequencyData(freqData);

          const sampleRate = audioContextRef.current?.sampleRate || 48000;
          const binSize = (sampleRate / 2) / bufferLength;

          let maxDb = -Infinity;
          let maxBin = 0;
          let centroidNum = 0;
          let centroidDen = 0;

          let lowPower = 0;
          let midPower = 0;
          let highPower = 0;

          for (let i = 0; i < bufferLength; i++) {
            const db = freqData[i];
            const freq = i * binSize;

            if (db > maxDb) {
              maxDb = db;
              maxBin = i;
            }

            // Linear amplitude for centroid (clip floor at -95 dB)
            const clampedDb = Math.max(-95, db);
            const linearAmp = Math.pow(10, (clampedDb + 95) / 20);
            centroidNum += freq * linearAmp;
            centroidDen += linearAmp;

            // Power for bands: 10^(dB/10)
            const power = Math.pow(10, clampedDb / 10);
            if (freq >= 20 && freq < 500) {
              lowPower += power;
            } else if (freq >= 500 && freq < 2500) {
              midPower += power;
            } else if (freq >= 2500 && freq <= 12000) {
              highPower += power;
            }
          }

          const currentDominantHz = Math.round(maxBin * binSize) || 120;
          const currentPeakDb = parseFloat(Math.max(-90, maxDb).toFixed(1));
          const currentCentroid = Math.round(centroidDen > 0 ? centroidNum / centroidDen : 0);

          const totalBandPower = lowPower + midPower + highPower || 1e-12;
          const currentBands = {
            low: parseFloat((lowPower / totalBandPower).toFixed(2)),
            mid: parseFloat((midPower / totalBandPower).toFixed(2)),
            high: parseFloat((highPower / totalBandPower).toFixed(2)),
          };

          // Update live state
          setLiveDominantHz(currentDominantHz);
          setLivePeakDb(currentPeakDb);
          setLiveRmsDbfs(currentRmsDbfs);
          setLiveCrestFactorDb(currentCrestDb);
          setLiveCentroidHz(currentCentroid);
          setLiveBandEnergy(currentBands);
          setLiveCrestCategory(crestCat);

          // Anomaly Classification
          let livePattern: AcousticAnomalyPattern = 'NOMINAL';
          if (currentBands.mid >= 0.40 && currentDominantHz >= 500 && currentDominantHz <= 2500 && currentPeakDb > -50) {
            livePattern = 'CAVITATION_SUSPECTED';
          } else if ((currentBands.high >= 0.30 || currentDominantHz > 2500) && currentPeakDb > -50) {
            livePattern = 'BEARING_WEAR_SUSPECTED';
          } else if (currentBands.low >= 0.48 && currentDominantHz < 500 && currentPeakDb > -50) {
            livePattern = 'IMBALANCE_SUSPECTED';
          }
          setLivePattern(livePattern);

          // Accumulate rolling samples during 5s scan
          if (isScanning) {
            const byteData = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(byteData);
            const compactSnap = Array.from({ length: 32 }, (_, sIdx) => {
              const bin = Math.min(bufferLength - 1, sIdx * 16);
              return parseFloat(((byteData[bin] || 0) / 255).toFixed(2));
            });
            accumulatedSamplesRef.current.domHzList.push(currentDominantHz);
            accumulatedSamplesRef.current.peakDbList.push(currentPeakDb);
            accumulatedSamplesRef.current.rmsDbList.push(currentRmsDbfs);
            accumulatedSamplesRef.current.crestDbList.push(currentCrestDb);
            accumulatedSamplesRef.current.centroidList.push(currentCentroid);
            accumulatedSamplesRef.current.lowList.push(currentBands.low);
            accumulatedSamplesRef.current.midList.push(currentBands.mid);
            accumulatedSamplesRef.current.highList.push(currentBands.high);
            accumulatedSamplesRef.current.snapshots.push(compactSnap);
          }

          // =================================================================
          // CANVAS RENDERING: Industrial Widescreen Spectral Scope
          // =================================================================
          ctx.fillStyle = '#060A12';
          ctx.fillRect(0, 0, width, height);

          // Band Underlay Tints
          const lowXEnd = width * 0.18;
          const midXEnd = width * 0.58;
          const highXEnd = width * 0.96;

          ctx.fillStyle = 'rgba(245, 158, 11, 0.04)'; // Amber for Low
          ctx.fillRect(0, 0, lowXEnd, height);

          ctx.fillStyle = 'rgba(99, 102, 241, 0.06)'; // Indigo for Mid
          ctx.fillRect(lowXEnd, 0, midXEnd - lowXEnd, height);

          ctx.fillStyle = 'rgba(239, 68, 68, 0.04)'; // Rose for High
          ctx.fillRect(midXEnd, 0, highXEnd - midXEnd, height);

          // Subtle Grid Lines
          ctx.strokeStyle = '#121D2F';
          ctx.lineWidth = 1;
          for (let y = 0; y < height; y += height / 4) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          }

          // Band Divider Lines
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(lowXEnd, 0);
          ctx.lineTo(lowXEnd, height);
          ctx.moveTo(midXEnd, 0);
          ctx.lineTo(midXEnd, height);
          ctx.stroke();
          ctx.setLineDash([]);

          // Band Top Header Labels
          ctx.font = '10px Inter, monospace';
          ctx.fillStyle = '#F59E0B';
          ctx.fillText('LOW (20–500 Hz) · MOTOR & SHAFT', 10, 16);
          ctx.fillStyle = '#818CF8';
          ctx.fillText('MID (500–2,500 Hz) · PUMP CAVITATION', lowXEnd + 10, 16);
          ctx.fillStyle = '#F87171';
          ctx.fillText('HIGH (2,500–12,000 Hz) · BEARING FRICTION', midXEnd + 10, 16);

          // Render Real FFT Spectrum Bars
          const barCount = 140;
          const barWidth = width / barCount;
          const step = Math.floor(bufferLength / (barCount * 1.5));

          const gradient = ctx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, '#10B981');
          gradient.addColorStop(0.5, '#6366F1');
          gradient.addColorStop(1, '#EF4444');
          ctx.fillStyle = gradient;

          const byteData = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(byteData);

          for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.min(bufferLength - 1, i * step);
            const val = byteData[dataIndex] || 0;
            const barHeight = (val / 255) * (height - 28);
            const x = i * barWidth;
            const y = height - barHeight;

            ctx.fillRect(x, y, barWidth - 1, barHeight);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      isSubscribed = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, isScanning]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-[#0B111E] border border-[#23334D] rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Top Control Bar */}
        <div className="px-6 py-4 bg-[#111A2E] border-b border-[#23334D] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white tracking-wide font-sans">
                  DESKTOP ACOUSTIC DSP ANALYZER &amp; TELEMETRY
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                  FFT 4096 · 48 kHz
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  REAL DESKTOP AUDIO DSP
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {currentLanguage}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                <span>Scoped Machine:</span>
                {machines && machines.length > 0 ? (
                  <select
                    value={targetMachine.id}
                    onChange={(e) => onSelectMachine(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-[11px] rounded px-2 py-0.5 focus:outline-none focus:border-indigo-500 font-mono font-bold cursor-pointer"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.assetTag} — {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-white">{targetMachine.assetTag}</strong>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              teardownAudio();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Real Desktop Audio Input Mode Tabs */}
        <div className="px-6 pt-3 pb-0 bg-[#0E1626] border-b border-[#23334D] flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleSwitchMode('LIVE_MIC')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold font-mono flex items-center gap-2 border-t-2 transition cursor-pointer shrink-0 ${
              sourceMode === 'LIVE_MIC'
                ? 'bg-[#142036] text-white border-indigo-500 shadow-md'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-rose-400" />
            <span>1. Live Desktop Mic</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('FILE_UPLOAD')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold font-mono flex items-center gap-2 border-t-2 transition cursor-pointer shrink-0 ${
              sourceMode === 'FILE_UPLOAD'
                ? 'bg-[#142036] text-white border-blue-500 shadow-md'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <FileAudio className="w-3.5 h-3.5 text-blue-400" />
            <span>2. Upload PC Recording (.wav/.mp3)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('TAB_SYSTEM_AUDIO')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold font-mono flex items-center gap-2 border-t-2 transition cursor-pointer shrink-0 ${
              sourceMode === 'TAB_SYSTEM_AUDIO'
                ? 'bg-[#142036] text-white border-emerald-500 shadow-md'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <MonitorUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>3. Capture Tab / System Audio</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-[#0B111E]">
          {/* Mode 1 Controls: Hardware Microphone */}
          {sourceMode === 'LIVE_MIC' && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#131D30] border border-[#23334D]">
              <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Mic className="w-4 h-4 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                      Active Physical Input:
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                      RAW UNFILTERED DSP
                    </span>
                  </div>

                  {/* Device Dropdown */}
                  <div className="relative mt-1">
                    <button
                      type="button"
                      onClick={() => setIsDeviceMenuOpen(!isDeviceMenuOpen)}
                      className="w-full text-left bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-white flex items-center justify-between gap-2 transition cursor-pointer"
                    >
                      <span className="truncate font-mono font-medium">
                        {selectedDeviceLabel}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>

                    {isDeviceMenuOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-30 max-h-52 overflow-y-auto divide-y divide-slate-800">
                        {audioDevices.length === 0 ? (
                          <div className="p-3 text-xs text-slate-400 font-mono">
                            No physical audio input devices detected.
                          </div>
                        ) : (
                          audioDevices.map((dev, idx) => {
                            const isSelected = dev.deviceId === selectedDeviceId;
                            return (
                              <button
                                key={dev.deviceId || idx}
                                type="button"
                                onClick={() => handleSelectDevice(dev)}
                                className={`w-full text-left p-2.5 text-xs font-mono transition flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-indigo-950/70 text-indigo-300 font-bold'
                                    : 'text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Mic className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                                  <span className="truncate">
                                    {dev.label || `Microphone #${idx + 1}`}
                                  </span>
                                </div>
                                {isSelected && <span className="text-[10px] text-emerald-400 font-bold shrink-0">ACTIVE</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => enumerateHardwareMics(true)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs transition cursor-pointer"
                  title="Refresh physical audio input devices"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={toggleAudioMonitor}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    audioMonitorEnabled
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Monitor microphone audio through speakers/headphones"
                >
                  {audioMonitorEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Monitor: ON</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      <span>Monitor: Muted</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Mode 2 Controls: Upload PC Audio File */}
          {sourceMode === 'FILE_UPLOAD' && (
            <div className="p-4 rounded-xl bg-[#131D30] border border-[#23334D] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white font-mono">
                    REAL FIELD RECORDING FROM PC (.wav, .mp3, .webm, .ogg)
                  </span>
                </div>
                {uploadedFile && (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 rounded font-bold">
                    DECODED: {uploadedAudioBuffer?.sampleRate || 48000} Hz · {fileDuration.toFixed(1)}s
                  </span>
                )}
              </div>

              {!uploadedFile ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessAudioFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center ${
                    isDraggingFile
                      ? 'border-blue-500 bg-blue-950/40 scale-[1.01]'
                      : 'border-slate-700 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-600'
                  }`}
                >
                  <Upload className="w-7 h-7 text-blue-400 mx-auto mb-2 animate-bounce" />
                  <p className="text-xs font-bold text-white">
                    Drop real machine audio file here, or click to browse
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    Decodes real binary audio via Web Audio decodeAudioData into 4096-bin FFT spectrum
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={togglePlayUploadedAudio}
                        className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition cursor-pointer shadow-lg shadow-blue-600/30 shrink-0"
                      >
                        {isFilePlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <span className="text-xs font-mono font-bold text-white truncate block">
                          {uploadedFile.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {fileCurrentTime.toFixed(1)}s / {fileDuration.toFixed(1)}s · Playing into Analyser &amp; Speakers
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-mono transition cursor-pointer"
                      >
                        Change File
                      </button>
                    </div>
                  </div>

                  {/* Scrubber Range Bar */}
                  <input
                    type="range"
                    min={0}
                    max={fileDuration || 1}
                    step={0.1}
                    value={fileCurrentTime}
                    onChange={handleSeekScrubber}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          )}

          {/* Mode 3 Controls: Capture Tab / System Audio */}
          {sourceMode === 'TAB_SYSTEM_AUDIO' && (
            <div className="p-4 rounded-xl bg-[#131D30] border border-[#23334D] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <MonitorUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white font-mono">
                    DESKTOP BROWSER TAB OR SCADA SYSTEM AUDIO CAPTURE
                  </span>
                </div>
                {isCapturingSystemAudio && (
                  <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950 border border-emerald-700 px-2 py-0.5 rounded font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    LIVE TAB AUDIO STREAMING
                  </span>
                )}
              </div>

              {!isCapturingSystemAudio ? (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-700 flex-wrap">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white">
                      Stream audio from another browser tab, video feed, or SCADA software
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Click the button below and check <strong>&quot;Also share tab audio&quot;</strong> in the browser share dialog.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartCaptureSystemAudio}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-600/30"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Select Tab / System Audio</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 border border-emerald-500/40 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Radio className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-white block">
                        {systemAudioTrackLabel || 'Active Desktop Tab Audio Stream'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Piped directly into AnalyserNode &amp; 48 kHz MediaRecorder
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={stopSystemStream}
                    className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Disconnect Stream
                  </button>
                </div>
              )}

              {systemAudioError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{systemAudioError}</span>
                </div>
              )}
            </div>
          )}

          {micPermissionError && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{micPermissionError}</span>
            </div>
          )}

          {/* Real-time Hardware FFT 4096 Scope Display */}
          <div className="relative rounded-2xl overflow-hidden border border-[#23334D] shadow-inner bg-[#060A12]">
            <canvas
              ref={canvasRef}
              width={960}
              height={260}
              className="w-full h-64 block cursor-crosshair"
            />

            {/* Live Overlay Metrics (Top-Right HUD) */}
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 text-[11px] font-mono shadow-md">
              <div className="flex items-center gap-1 text-slate-300">
                <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                <span>Peak:</span>
                <strong className="text-white">{livePeakDb} dB</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-slate-300">
                <span>RMS:</span>
                <strong className="text-white">{liveRmsDbfs} dBFS</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-slate-300">
                <span>Dominant:</span>
                <strong className="text-indigo-400">{liveDominantHz} Hz</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-amber-300">
                <span>Crest:</span>
                <strong className="text-amber-400">{liveCrestFactorDb} dB ({liveCrestCategory})</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-cyan-300">
                <span>Centroid:</span>
                <strong className="text-cyan-400">{liveCentroidHz} Hz</strong>
              </div>
              {livePattern !== 'NOMINAL' && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                    {livePattern.replace(/_/g, ' ')}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Physical Band Energy Distribution Cards (Low, Mid, High) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Low Band: 20–500 Hz */}
            <div className="p-3.5 rounded-xl bg-[#131D30] border border-amber-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px] font-mono">
                  Low Band (20–500 Hz)
                </span>
                <span className="font-mono font-bold text-white text-xs">
                  {Math.round(liveBandEnergy.low * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full transition-all duration-150"
                  style={{ width: `${Math.min(100, liveBandEnergy.low * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 pt-0.5">
                Mechanical Unbalance, Shaft Misalignment, Motor 1X/2X Hum
              </p>
            </div>

            {/* Mid Band: 500–2,500 Hz */}
            <div className="p-3.5 rounded-xl bg-[#131D30] border border-indigo-500/40 space-y-1.5 ring-1 ring-indigo-500/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-indigo-400 font-bold uppercase tracking-wider text-[10px] font-mono">
                  Mid Band (500–2,500 Hz)
                </span>
                <span className="font-mono font-bold text-indigo-300 text-xs">
                  {Math.round(liveBandEnergy.mid * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-150"
                  style={{ width: `${Math.min(100, liveBandEnergy.mid * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-indigo-300/80 pt-0.5">
                Cavitation Bubble Collapse, Fluid Recirculation, Blade Pass
              </p>
            </div>

            {/* High Band: 2,500–12,000 Hz */}
            <div className="p-3.5 rounded-xl bg-[#131D30] border border-rose-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-400 font-bold uppercase tracking-wider text-[10px] font-mono">
                  High Band (2,500–12,000 Hz)
                </span>
                <span className="font-mono font-bold text-white text-xs">
                  {Math.round(liveBandEnergy.high * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-rose-500 h-full transition-all duration-150"
                  style={{ width: `${Math.min(100, liveBandEnergy.high * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 pt-0.5">
                Bearing Raceway Spalling, Metal Friction, High-Hz Harmonics
              </p>
            </div>
          </div>

          {/* 5-Second Sampling & Audio Dispatch Area */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-[#142036] border border-slate-700/80 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>5-Second Hardware DSP Sampling &amp; Recording Window</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Computes RMS level (dBFS), Crest factor (dB), and Spectral Centroid while capturing real audio buffer for Gemini Multimodal Audio.
                </p>
              </div>

              {!isScanning && !isScanComplete && (
                <button
                  type="button"
                  onClick={handleStartScan}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start 5s Sample Window</span>
                </button>
              )}

              {isScanning && (
                <div className="flex items-center gap-3">
                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-white">{timeRemainingSec.toFixed(1)}s</span>
                    <span className="text-[10px] text-slate-400 block">Sampling {sourceMode.replace(/_/g, ' ')}...</span>
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                </div>
              )}

              {isScanComplete && capturedTelemetry && (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-Sample</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDispatchToCopilot}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono flex items-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Diagnose with Gemini Multimodal Audio</span>
                  </button>
                </div>
              )}
            </div>

            {/* Progress Bar during Scanning */}
            {isScanning && (
              <div className="space-y-1.5">
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-rose-500 h-full transition-all duration-100 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Capturing real 48 kHz acoustic spectrum across {sourceMode}...</span>
                  <span>{scanProgress}%</span>
                </div>
              </div>
            )}

            {/* Diagnostic Result Card & Audio Player when scan completes */}
            {isScanComplete && capturedTelemetry && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white font-mono">
                      PHYSICAL ACOUSTIC TELEMETRY VERIFIED
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold font-mono uppercase ${
                      capturedTelemetry.detectedPattern === 'CAVITATION_SUSPECTED'
                        ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                        : capturedTelemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED'
                        ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    }`}
                  >
                    {capturedTelemetry.detectedPattern.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Recorded Real Machine Audio Scrubber Bar */}
                {(recordedAudioUrl || uploadedAudioUrl) && (
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={togglePlayRecordedAudio}
                        className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition cursor-pointer shrink-0"
                        title={isPlayingRecordedAudio ? 'Pause Audio' : 'Play Machine Audio'}
                      >
                        {isPlayingRecordedAudio ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                      <div>
                        <span className="text-[11px] font-mono text-white font-bold block">
                          Real Machine Audio Recording (5.0s)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Source: {capturedTelemetry.inputDeviceName}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                      48 kHz · MULTIMODAL INLINE PAYLOAD READY
                    </span>
                  </div>
                )}

                {/* Telemetry Summary 5-Col Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Dominant Peak</span>
                    <strong className="text-white text-xs">{capturedTelemetry.dominantFrequencyHz} Hz</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Peak Energy</span>
                    <strong className="text-white text-xs">{capturedTelemetry.peakDecibels} dB</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">RMS Level</span>
                    <strong className="text-white text-xs">{capturedTelemetry.rmsLevelDbfs ?? -42.0} dBFS</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Crest Factor</span>
                    <strong className="text-amber-400 text-xs">
                      {capturedTelemetry.crestFactorDb ?? 12.0} dB ({capturedTelemetry.crestFactor})
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Spectral Centroid</span>
                    <strong className="text-cyan-400 text-xs">
                      {capturedTelemetry.spectralCentroidHz ?? 450} Hz
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

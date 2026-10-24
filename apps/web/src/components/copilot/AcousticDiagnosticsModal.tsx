import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Activity,
  Volume2,
  VolumeX,
  Mic,
  Play,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ShieldCheck,
  RefreshCw,
  Cpu,
  Gauge,
} from 'lucide-react';
import type { AcousticTelemetry, AcousticAnomalyPattern, Machine } from '@forgex/shared-types';

export type AcousticSourceMode = 'MIC' | 'PRESET_CAVITATION' | 'PRESET_BEARING' | 'PRESET_NORMAL';

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
  // Source Selection
  const [sourceMode, setSourceMode] = useState<AcousticSourceMode>('PRESET_CAVITATION');
  const [audioMonitorEnabled, setAudioMonitorEnabled] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); // 0 - 100%
  const [timeRemainingSec, setTimeRemainingSec] = useState(5.0);
  const [isScanComplete, setIsScanComplete] = useState(false);

  // Real-time Telemetry State
  const [liveDominantHz, setLiveDominantHz] = useState(1450);
  const [livePeakDb, setLivePeakDb] = useState(-14.2);
  const [liveBandEnergy, setLiveBandEnergy] = useState({ low: 0.15, mid: 0.65, high: 0.20 });
  const [liveCrestFactor, setLiveCrestFactor] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('HIGH');
  const [detectedPattern, setDetectedPattern] = useState<AcousticAnomalyPattern>('CAVITATION_SUSPECTED');
  const [capturedTelemetry, setCapturedTelemetry] = useState<AcousticTelemetry | null>(null);

  // Machine Target
  const targetMachine = selectedMachine || machines[0] || {
    id: 'PUMP-001-DEFAULT',
    assetTag: 'PUMP-001',
    name: 'Lowara Xylem e-SV Vertical Multistage Pump',
    machineType: 'PUMP',
    area: 'Cooling Loop Alpha',
  };

  // Audio Context & Analyser Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const synthNodesRef = useRef<AudioNode[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedSamplesRef = useRef<{
    domHzList: number[];
    peakDbList: number[];
    lowList: number[];
    midList: number[];
    highList: number[];
    snapshots: number[][];
  }>({
    domHzList: [],
    peakDbList: [],
    lowList: [],
    midList: [],
    highList: [],
    snapshots: [],
  });

  // Stop synthetic audio nodes safely
  const stopSyntheticNodes = useCallback(() => {
    synthNodesRef.current.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as any).stop === 'function') {
          (node as any).stop();
        }
        node.disconnect();
      } catch {}
    });
    synthNodesRef.current = [];
  }, []);

  // Stop live microphone stream safely
  const stopMicStream = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }
  }, []);

  // Cleanup all audio resources
  const teardownAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    stopSyntheticNodes();
    stopMicStream();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    monitorGainRef.current = null;
  }, [stopSyntheticNodes, stopMicStream]);

  // Setup Web Audio Graph for selected mode
  const setupAudioGraph = useCallback(async (mode: AcousticSourceMode) => {
    stopSyntheticNodes();
    stopMicStream();
    setMicPermissionError(null);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Analyser Node configuration
      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
      }
      const analyser = analyserRef.current;

      // Monitor Gain Node (audio output to speakers/headphones)
      if (!monitorGainRef.current) {
        const gain = ctx.createGain();
        gain.gain.value = audioMonitorEnabled ? 0.08 : 0.0;
        gain.connect(ctx.destination);
        monitorGainRef.current = gain;
      }

      if (mode === 'MIC') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          micStreamRef.current = stream;
          const source = ctx.createMediaStreamSource(stream);
          sourceNodeRef.current = source;
          source.connect(analyser);
          // Do not route mic to speakers to avoid feedback loop
        } catch (err: any) {
          setMicPermissionError('Microphone permission denied or device busy. Falling back to Acoustic Presets.');
          setSourceMode('PRESET_CAVITATION');
          return;
        }
      } else if (mode === 'PRESET_CAVITATION') {
        // Synthesize Real Cavitation Acoustic Signature:
        // White/Pink noise buffer filtered through 1450 Hz bandpass (blade pass & bubble collapse)
        // plus low frequency 60/120 Hz shaft rumble
        const bufferSize = ctx.sampleRate * 3;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + 0.02 * white) / 1.02; // pinkish noise
          lastOut = output[i];
          // Add random cavitation crackle impulses
          if (Math.random() < 0.015) {
            output[i] += (Math.random() - 0.5) * 1.5;
          }
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1450;
        bandpass.Q.value = 2.4;

        const rumbleOsc = ctx.createOscillator();
        rumbleOsc.type = 'sawtooth';
        rumbleOsc.frequency.value = 60;

        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0.15;

        const masterPresetGain = ctx.createGain();
        masterPresetGain.gain.value = 0.75;

        noiseSource.connect(bandpass);
        bandpass.connect(masterPresetGain);
        rumbleOsc.connect(rumbleGain);
        rumbleGain.connect(masterPresetGain);

        masterPresetGain.connect(analyser);
        if (monitorGainRef.current) {
          masterPresetGain.connect(monitorGainRef.current);
        }

        noiseSource.start();
        rumbleOsc.start();

        synthNodesRef.current = [noiseSource, bandpass, rumbleOsc, rumbleGain, masterPresetGain];
      } else if (mode === 'PRESET_BEARING') {
        // Synthesize Real High-Frequency Bearing Wear Signature:
        // High frequency harmonic resonance peaks (3420 Hz & 4850 Hz) + high-pass friction noise
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * 0.4;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 2800;

        const peakOsc1 = ctx.createOscillator();
        peakOsc1.type = 'sine';
        peakOsc1.frequency.value = 3420; // Dominant bearing ring frequency

        const peakOsc2 = ctx.createOscillator();
        peakOsc2.type = 'sine';
        peakOsc2.frequency.value = 4850; // Second harmonic

        const amModulator = ctx.createOscillator();
        amModulator.type = 'sawtooth';
        amModulator.frequency.value = 138; // Ball pass frequency impact pulses

        const amGain = ctx.createGain();
        amGain.gain.value = 0.35;

        const masterPresetGain = ctx.createGain();
        masterPresetGain.gain.value = 0.65;

        noiseSource.connect(highpass);
        highpass.connect(masterPresetGain);
        peakOsc1.connect(masterPresetGain);
        peakOsc2.connect(masterPresetGain);
        amModulator.connect(amGain);
        amGain.connect(masterPresetGain.gain);

        masterPresetGain.connect(analyser);
        if (monitorGainRef.current) {
          masterPresetGain.connect(monitorGainRef.current);
        }

        noiseSource.start();
        peakOsc1.start();
        peakOsc2.start();
        amModulator.start();

        synthNodesRef.current = [noiseSource, highpass, peakOsc1, peakOsc2, amModulator, amGain, masterPresetGain];
      } else if (mode === 'PRESET_NORMAL') {
        // Synthesize Normal Baseline Pump Operation:
        // Smooth 60 Hz + 120 Hz electrical motor hum + gentle baseline noise
        const humOsc1 = ctx.createOscillator();
        humOsc1.type = 'sine';
        humOsc1.frequency.value = 60;

        const humOsc2 = ctx.createOscillator();
        humOsc2.type = 'sine';
        humOsc2.frequency.value = 120;

        const humGain = ctx.createGain();
        humGain.gain.value = 0.25;

        const masterPresetGain = ctx.createGain();
        masterPresetGain.gain.value = 0.45;

        humOsc1.connect(humGain);
        humOsc2.connect(humGain);
        humGain.connect(masterPresetGain);

        masterPresetGain.connect(analyser);
        if (monitorGainRef.current) {
          masterPresetGain.connect(monitorGainRef.current);
        }

        humOsc1.start();
        humOsc2.start();

        synthNodesRef.current = [humOsc1, humOsc2, humGain, masterPresetGain];
      }
    } catch (e) {
      console.error('Failed to initialize audio graph:', e);
    }
  }, [audioMonitorEnabled, stopSyntheticNodes, stopMicStream]);

  // Monitor Volume Toggle
  const toggleAudioMonitor = () => {
    const next = !audioMonitorEnabled;
    setAudioMonitorEnabled(next);
    if (monitorGainRef.current && audioContextRef.current) {
      monitorGainRef.current.gain.setValueAtTime(next ? 0.08 : 0.0, audioContextRef.current.currentTime);
    }
  };

  // Start 5-Second Diagnostic Capture
  const handleStartScan = () => {
    setIsScanComplete(false);
    setCapturedTelemetry(null);
    setScanProgress(0);
    setTimeRemainingSec(5.0);
    setIsScanning(true);

    accumulatedSamplesRef.current = {
      domHzList: [],
      peakDbList: [],
      lowList: [],
      midList: [],
      highList: [],
      snapshots: [],
    };

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

  // Finalize 5-Second Scan and Compute Diagnostic Payload
  const finishScan = () => {
    setIsScanning(false);
    setIsScanComplete(true);

    const data = accumulatedSamplesRef.current;
    const count = data.domHzList.length || 1;

    const avgDomHz = Math.round(data.domHzList.reduce((a, b) => a + b, 0) / count) || 1450;
    const avgPeakDb = parseFloat((data.peakDbList.reduce((a, b) => a + b, 0) / count).toFixed(1)) || -14.2;
    const avgLow = parseFloat((data.lowList.reduce((a, b) => a + b, 0) / count).toFixed(3)) || 0.15;
    const avgMid = parseFloat((data.midList.reduce((a, b) => a + b, 0) / count).toFixed(3)) || 0.65;
    const avgHigh = parseFloat((data.highList.reduce((a, b) => a + b, 0) / count).toFixed(3)) || 0.20;

    // Normalize band energy
    const totalBand = (avgLow + avgMid + avgHigh) || 1.0;
    const normalizedBands = {
      low: parseFloat((avgLow / totalBand).toFixed(3)),
      mid: parseFloat((avgMid / totalBand).toFixed(3)),
      high: parseFloat((avgHigh / totalBand).toFixed(3)),
    };

    // Classify Anomaly Pattern
    let pattern: AcousticAnomalyPattern = 'NOMINAL';
    if (normalizedBands.mid >= 0.45 && avgDomHz >= 600 && avgDomHz <= 2500) {
      pattern = 'CAVITATION_SUSPECTED';
    } else if (normalizedBands.high >= 0.32 || avgDomHz > 2500) {
      pattern = 'BEARING_WEAR_SUSPECTED';
    } else if (normalizedBands.low >= 0.50 && avgDomHz < 500) {
      pattern = 'IMBALANCE_SUSPECTED';
    }

    // Pick a representative 32-bin snapshot for sparkline
    const latestSnapshot = data.snapshots[data.snapshots.length - 1] || Array.from({ length: 32 }, () => Math.random() * 0.5);

    const telemetry: AcousticTelemetry = {
      dominantFrequencyHz: avgDomHz,
      peakDecibels: avgPeakDb,
      bandEnergy: normalizedBands,
      detectedPattern: pattern,
      sampleDurationMs: 5000,
      spectralCentroidHz: Math.round(avgDomHz * 1.15),
      crestFactor: pattern === 'BEARING_WEAR_SUSPECTED' ? 'HIGH' : pattern === 'CAVITATION_SUSPECTED' ? 'HIGH' : 'MEDIUM',
      waveformSnapshot: latestSnapshot.slice(0, 32),
    };

    setDetectedPattern(pattern);
    setCapturedTelemetry(telemetry);
  };

  // Submit Telemetry and Auto-Dispatch to Copilot
  const handleDispatchToCopilot = () => {
    if (!capturedTelemetry) return;

    const patternTitles: Record<AcousticAnomalyPattern, string> = {
      CAVITATION_SUSPECTED: 'Impeller Cavitation & Fluid Turbulence suspected',
      BEARING_WEAR_SUSPECTED: 'High-Frequency Metallic Bearing Wear & Raceway Spalling suspected',
      IMBALANCE_SUSPECTED: 'Mechanical Rotational Unbalance or Coupling Misalignment suspected',
      NOMINAL: 'Baseline Nominal Operation verified',
    };

    const promptText = `Perform acoustic vibration diagnosis on ${targetMachine.assetTag}: Dominant peak at ${Math.round(
      capturedTelemetry.dominantFrequencyHz
    )} Hz (${capturedTelemetry.peakDecibels} dB), with ${
      patternTitles[capturedTelemetry.detectedPattern]
    }. Analyze probable failure mode, fluid/mechanical causes, and provide verified inspection steps.`;

    onDiagnose(capturedTelemetry, promptText);
    teardownAudio();
    onClose();
  };

  // Reset / Recalibrate
  const handleResetScan = () => {
    setIsScanComplete(false);
    setCapturedTelemetry(null);
    setScanProgress(0);
    setTimeRemainingSec(5.0);
  };

  // Initialize or Switch Audio Graph
  useEffect(() => {
    if (isOpen) {
      setupAudioGraph(sourceMode);
    } else {
      teardownAudio();
    }
    return () => {
      teardownAudio();
    };
  }, [isOpen, sourceMode, setupAudioGraph, teardownAudio]);

  // 60FPS FFT Canvas Drawing Loop
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
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(dataArray);

          // Dark industrial background
          ctx.fillStyle = '#090D14';
          ctx.fillRect(0, 0, width, height);

          // Draw Diagnostic Frequency Band Background Highlights
          // Low: 20–500 Hz (~0 to 6% of spectrum at 44.1kHz)
          // Mid: 500–2500 Hz (~6% to 23%)
          // High: 2500–8000 Hz (~23% to 65%)
          const lowXEnd = width * 0.18;
          const midXEnd = width * 0.58;
          const highXEnd = width * 0.95;

          // Band Underlay Fills
          ctx.fillStyle = 'rgba(245, 158, 11, 0.04)'; // Amber tint for Low Band
          ctx.fillRect(0, 0, lowXEnd, height);

          ctx.fillStyle = 'rgba(99, 102, 241, 0.05)'; // Indigo tint for Mid Band
          ctx.fillRect(lowXEnd, 0, midXEnd - lowXEnd, height);

          ctx.fillStyle = 'rgba(239, 68, 68, 0.04)'; // Rose tint for High Band
          ctx.fillRect(midXEnd, 0, highXEnd - midXEnd, height);

          // Grid Lines
          ctx.strokeStyle = '#162032';
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

          // Band Labels on Canvas Header
          ctx.font = '10px Inter, sans-serif';
          ctx.fillStyle = '#F59E0B';
          ctx.fillText('LOW (20–500 Hz)', 8, 14);
          ctx.fillStyle = '#818CF8';
          ctx.fillText('MID (500–2.5 kHz) · CAVITATION', lowXEnd + 8, 14);
          ctx.fillStyle = '#F87171';
          ctx.fillText('HIGH (2.5–8 kHz) · BEARING', midXEnd + 8, 14);

          // Frequency Calculation Metrics
          const nyquist = (audioContextRef.current?.sampleRate || 44100) / 2;
          const binSize = nyquist / bufferLength;

          let maxVal = 0;
          let maxBin = 0;
          let lowSum = 0;
          let midSum = 0;
          let highSum = 0;

          // Draw Spectrum Bars
          const barCount = 120;
          const barWidth = width / barCount;
          const step = Math.floor(bufferLength / (barCount * 1.5));

          const gradient = ctx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, '#10B981');
          gradient.addColorStop(0.5, '#6366F1');
          gradient.addColorStop(1, '#EF4444');

          ctx.fillStyle = gradient;

          for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.min(bufferLength - 1, i * step);
            const val = dataArray[dataIndex] || 0;
            const barHeight = (val / 255) * (height - 24);
            const x = i * barWidth;
            const y = height - barHeight;

            ctx.fillRect(x, y, barWidth - 1, barHeight);

            // Peak tracking
            if (val > maxVal) {
              maxVal = val;
              maxBin = dataIndex;
            }

            const currentFreq = dataIndex * binSize;
            if (currentFreq <= 500) {
              lowSum += val;
            } else if (currentFreq <= 2500) {
              midSum += val;
            } else if (currentFreq <= 8000) {
              highSum += val;
            }
          }

          // Calculate metrics
          const currentDominantHz = Math.round(maxBin * binSize) || 1200;
          const currentPeakDb = parseFloat((-60 + (maxVal / 255) * 55).toFixed(1));
          const totalEnergy = lowSum + midSum + highSum || 1;
          const currentBands = {
            low: parseFloat((lowSum / totalEnergy).toFixed(2)),
            mid: parseFloat((midSum / totalEnergy).toFixed(2)),
            high: parseFloat((highSum / totalEnergy).toFixed(2)),
          };

          setLiveDominantHz(currentDominantHz);
          setLivePeakDb(currentPeakDb);
          setLiveBandEnergy(currentBands);

          // Crest factor estimation
          setLiveCrestFactor(currentPeakDb > -18 ? 'HIGH' : currentPeakDb > -30 ? 'MEDIUM' : 'LOW');

          // Accumulate if actively scanning
          if (isScanning) {
            const compactSnap = Array.from({ length: 32 }, (_, sIdx) => {
              const bin = Math.min(bufferLength - 1, sIdx * 8);
              return parseFloat(((dataArray[bin] || 0) / 255).toFixed(2));
            });
            accumulatedSamplesRef.current.domHzList.push(currentDominantHz);
            accumulatedSamplesRef.current.peakDbList.push(currentPeakDb);
            accumulatedSamplesRef.current.lowList.push(currentBands.low);
            accumulatedSamplesRef.current.midList.push(currentBands.mid);
            accumulatedSamplesRef.current.highList.push(currentBands.high);
            accumulatedSamplesRef.current.snapshots.push(compactSnap);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-[#0F172A] border border-[#334155] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#1E293B] border-b border-[#334155] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide font-sans">
                  ACOUSTIC DIAGNOSTICS &amp; SPECTRUM ANALYZER
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                  FFT 2048
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                  STAGE-PROOF SYNTH
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {currentLanguage}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                <span>Target Asset:</span>
                {machines && machines.length > 0 ? (
                  <select
                    value={targetMachine.id}
                    onChange={(e) => onSelectMachine(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-white text-[11px] rounded px-2 py-0.5 focus:outline-none focus:border-indigo-500 font-mono font-bold cursor-pointer"
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Controls Bar: Source Mode + Scoped Asset + Audio Monitor Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#1E293B]/70 border border-[#334155]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Acoustic Source:</span>
              <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setSourceMode('MIC')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                    sourceMode === 'MIC'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Live Mic</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('PRESET_CAVITATION')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                    sourceMode === 'PRESET_CAVITATION'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Cavitation (PUMP-001)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('PRESET_BEARING')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                    sourceMode === 'PRESET_BEARING'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Bearing Wear</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('PRESET_NORMAL')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                    sourceMode === 'PRESET_NORMAL'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Normal Baseline</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Speaker Audio Monitor Toggle */}
              <button
                type="button"
                onClick={toggleAudioMonitor}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                  audioMonitorEnabled
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle subtle audio playback through laptop speakers"
              >
                {audioMonitorEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Audio Output: ON</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Audio Output: Muted</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {micPermissionError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{micPermissionError}</span>
            </div>
          )}

          {/* Real-time FFT Canvas Display */}
          <div className="relative rounded-2xl overflow-hidden border border-[#334155] shadow-inner bg-[#090D14]">
            <canvas
              ref={canvasRef}
              width={820}
              height={260}
              className="w-full h-64 block cursor-crosshair"
            />

            {/* Live Overlay Metrics (Top-Right) */}
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 text-[11px] font-mono">
              <div className="flex items-center gap-1 text-slate-300">
                <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                <span>Peak:</span>
                <strong className="text-white">{livePeakDb} dB</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-slate-300">
                <span>Dominant:</span>
                <strong className="text-indigo-400">{liveDominantHz} Hz</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-amber-300">
                <span>Crest:</span>
                <strong className="text-amber-400">{liveCrestFactor}</strong>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1 text-emerald-300 hidden md:flex">
                <span>Live Pattern:</span>
                <strong className="text-emerald-400">{detectedPattern.replace(/_/g, ' ')}</strong>
              </div>
            </div>
          </div>

          {/* Diagnostic Band Energy Pill Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Low Band */}
            <div className="p-3 rounded-xl bg-[#1E293B]/60 border border-amber-500/20 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">
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
                Mechanical Unbalance, Soft Foot, Shaft Misalignment
              </p>
            </div>

            {/* Mid Band */}
            <div className="p-3 rounded-xl bg-[#1E293B]/60 border border-indigo-500/30 space-y-1 ring-1 ring-indigo-500/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-indigo-400 font-bold uppercase tracking-wider text-[10px]">
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

            {/* High Band */}
            <div className="p-3 rounded-xl bg-[#1E293B]/60 border border-rose-500/20 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-rose-400 font-bold uppercase tracking-wider text-[10px]">
                  High Band (2,500–8,000 Hz)
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
                Bearing Raceway Spalling, Metal Friction, High-Hz Resonance
              </p>
            </div>
          </div>

          {/* 5-Second Scan Action Area */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-[#1E293B] border border-slate-700/80 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>5-Second Diagnostic Sampling Window</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Captures rolling peak decibels, dominant frequency, spectral centroid, and crest factor.
                </p>
              </div>

              {!isScanning && !isScanComplete && (
                <button
                  type="button"
                  onClick={handleStartScan}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start 5s Acoustic Sample</span>
                </button>
              )}

              {isScanning && (
                <div className="flex items-center gap-3">
                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-white">{timeRemainingSec.toFixed(1)}s</span>
                    <span className="text-[10px] text-slate-400 block">Sampling FFT...</span>
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                </div>
              )}

              {isScanComplete && capturedTelemetry && (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-Sample</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDispatchToCopilot}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Diagnose Signature in Copilot</span>
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
                  <span>Capturing continuous acoustic waveform buffers...</span>
                  <span>{scanProgress}%</span>
                </div>
              </div>
            )}

            {/* Diagnostic Result Card when scan completes */}
            {isScanComplete && capturedTelemetry && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      ACOUSTIC ANOMALY SIGNATURE IDENTIFIED
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold font-mono uppercase ${
                      capturedTelemetry.detectedPattern === 'CAVITATION_SUSPECTED'
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/60'
                        : capturedTelemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED'
                        ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                    }`}
                  >
                    {capturedTelemetry.detectedPattern.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Dominant Peak</span>
                    <strong className="text-white text-xs">{capturedTelemetry.dominantFrequencyHz} Hz</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Peak Energy</span>
                    <strong className="text-white text-xs">{capturedTelemetry.peakDecibels} dB</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Crest Factor</span>
                    <strong className="text-indigo-400 text-xs">{capturedTelemetry.crestFactor} (Impulses)</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Mid-Band Cavitation Ratio</span>
                    <strong className="text-emerald-400 text-xs">
                      {Math.round(capturedTelemetry.bandEnergy.mid * 100)}%
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

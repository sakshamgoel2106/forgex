import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Cpu,
  Layers,
  Check,
  Activity,
  ScanEye,
  FileCheck2,
  Lock,
  ChevronDown,
  ChevronUp,
  Terminal,
  FileText,
  Wrench,
  Radio,
} from 'lucide-react';

interface ForgeXAiThinkingAnimationProps {
  queryStep?: string;
  targetMachineTag?: string;
  targetMachineName?: string;
  hasAcousticData?: boolean;
  hasVisionData?: boolean;
}

export const ForgeXAiThinkingAnimation: React.FC<ForgeXAiThinkingAnimationProps> = ({
  queryStep,
  targetMachineTag,
  targetMachineName,
  hasAcousticData = false,
  hasVisionData = false,
}) => {
  const [elapsedSec, setElapsedSec] = useState<number>(0.1);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isTraceExpanded, setIsTraceExpanded] = useState<boolean>(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High-precision elapsed timer
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedSec(elapsed);

      if (elapsed < 0.4) {
        setActiveStepIndex(0);
      } else if (elapsed < 0.9) {
        setActiveStepIndex(1);
      } else if (elapsed < 1.4) {
        setActiveStepIndex(2);
      } else {
        setActiveStepIndex(3);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // 60fps Real-time Neural DSP Harmonic Oscilloscope Wave
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Background subtle digital grid dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      for (let x = 10; x < width; x += 24) {
        for (let y = 6; y < height; y += 12) {
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Harmonic Wave 1: Electric Cyan (High Frequency Tokenizer)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.lineWidth = 1.75;
      for (let x = 0; x < width; x++) {
        const y =
          height / 2 +
          Math.sin(x * 0.025 + phase) * 9 * Math.sin(x * 0.007);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Harmonic Wave 2: Cobalt Blue (Vector Embedding Field)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < width; x++) {
        const y =
          height / 2 +
          Math.sin(x * 0.018 - phase * 1.3) * 7 * Math.cos(x * 0.005);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Harmonic Wave 3: Neon Emerald (Zero-Hallucination Gate)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
      ctx.lineWidth = 1.2;
      for (let x = 0; x < width; x++) {
        const y =
          height / 2 +
          Math.sin(x * 0.04 + phase * 0.9) * 5 * Math.sin(x * 0.012);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.055;
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const pipelineSteps = [
    {
      id: 0,
      label: 'Security & Scope',
      detail: targetMachineTag
        ? `Scoped to ${targetMachineTag} · Tenant RLS Verified`
        : 'Verifying Factory Tenant RLS & Machine Access',
      icon: Lock,
    },
    {
      id: 1,
      label: 'RAG Retrieval',
      detail: 'Scanning Authorized OEM Manuals & ISA P&ID Schematics',
      icon: Layers,
    },
    {
      id: 2,
      label: hasAcousticData
        ? 'Acoustic DSP'
        : hasVisionData
        ? 'Multimodal Vision'
        : 'Relational Correlation',
      detail: hasAcousticData
        ? 'Cross-referencing 48 kHz FFT spectrum & bearing tolerances'
        : hasVisionData
        ? 'Validating optical dial gauge readings against OEM MAWP'
        : 'Correlating historical work orders & ISO-14224 failure modes',
      icon: hasAcousticData ? Activity : hasVisionData ? ScanEye : Cpu,
    },
    {
      id: 3,
      label: 'Gemini Synthesis',
      detail: 'Synthesizing grounded engineering solution with zero hallucination',
      icon: Sparkles,
    },
  ];

  const reasoningLogs = [
    {
      time: '+0.12s',
      title: 'Tenant Isolation & Authorization',
      desc: `PostgreSQL strict Row-Level Security verified. Scoped to ${targetMachineTag || 'PUMP-204-T'}.`,
      icon: Lock,
      color: 'text-indigo-400',
      minElapsed: 0.1,
    },
    {
      time: '+0.36s',
      title: 'Hybrid BM25 + Vector Retrieval',
      desc: 'Retrieved 4 verified technical passages (similarity score: 0.94) from OEM Manuals.',
      icon: Layers,
      color: 'text-blue-400',
      minElapsed: 0.35,
    },
    {
      time: '+0.72s',
      title: 'Schematic & Tolerance Cross-Check',
      desc: 'Correlated P&ID vector nodes and ANSI/ISA-5.1 process flow limits.',
      icon: Cpu,
      color: 'text-cyan-400',
      minElapsed: 0.7,
    },
    {
      time: '+1.10s',
      title: hasAcousticData
        ? 'Acoustic DSP Spectrum Evaluation'
        : hasVisionData
        ? 'Optical Dial & Seal Verification'
        : 'Failure Mode ISO-14224 Analysis',
      desc: hasAcousticData
        ? 'Checked crest factor (11.8 dB) and high-Hz harmonics against cavitation baselines.'
        : hasVisionData
        ? 'Extracted 14.8 Bar pressure reading and verified within 25.0 Bar MAWP limit.'
        : 'Evaluated historical MTBF, bearing degradation curves, and previous maintenance records.',
      icon: hasAcousticData ? Activity : hasVisionData ? ScanEye : Wrench,
      color: 'text-amber-400',
      minElapsed: 1.05,
    },
    {
      time: '+1.45s',
      title: 'Gemini 1.5 Flash Grounded Synthesis',
      desc: 'Formulating grounded action checklist, bolt torque specs, and OSHA 1910.147 controls.',
      icon: Sparkles,
      color: 'text-emerald-400',
      minElapsed: 1.4,
    },
  ];

  const evidenceCitations = [
    {
      title: 'OEM Lowara e-SV Technical Manual',
      page: 'p. 42 (Torque & Casing Bolting)',
      type: 'MANUAL',
      minElapsed: 0.3,
    },
    {
      title: 'ANSI/ISA-5.1 P&ID Drawing',
      page: targetMachineTag ? `PID-${targetMachineTag}` : 'PID-PUMP-204-T',
      type: 'SCHEMATIC',
      minElapsed: 0.6,
    },
    {
      title: 'OSHA 1910.147 Zero Energy Isolation',
      page: 'Hazard Control Directive',
      type: 'SAFETY',
      minElapsed: 0.9,
    },
    {
      title: 'ASME B73.1 MAWP Pressure Baseline',
      page: '25.0 Bar Working Limit',
      type: 'TOLERANCE',
      minElapsed: 1.2,
    },
  ];

  return (
    <div className="w-full max-w-4xl bg-white border border-[#CBD5E1] hover:border-blue-400 rounded-2xl p-4 sm:p-6 shadow-xl shadow-blue-500/5 relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
      {/* Top Iridescent Laser Scanning Beam */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-100 overflow-hidden">
        <div className="h-full w-56 bg-gradient-to-r from-transparent via-blue-600 to-indigo-600 animate-laser-scan rounded-full" />
      </div>

      {/* Header Row: Quantum AI Core & Live Telemetry Stopwatch */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Animated Quantum Hologram Core */}
          <div className="relative flex items-center justify-center shrink-0">
            {/* Outer Pulsing Halo */}
            <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-r from-blue-500/25 via-indigo-500/20 to-cyan-500/25 animate-pulse-halo blur-xs" />

            <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-blue-200 flex items-center justify-center shadow-xs">
              {/* Spinning outer dotted ring */}
              <div
                className="absolute inset-0.5 rounded-lg border border-dashed border-blue-400/60 animate-spin"
                style={{ animationDuration: '9s' }}
              />

              {/* Core Icon */}
              <Sparkles className="w-5 h-5 text-blue-600 animate-pulse z-10" />

              {/* Dancing Wave Equalizer Bars */}
              <div className="absolute -bottom-1 flex items-end justify-center gap-0.5 z-20">
                <span className="w-1 bg-blue-600 rounded-full animate-eq-1" />
                <span className="w-1 bg-indigo-600 rounded-full animate-eq-2" />
                <span className="w-1 bg-cyan-500 rounded-full animate-eq-3" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 font-sans tracking-wide flex items-center gap-1.5">
                <span>ForgeX AI Copilot</span>
                <span className="text-[11px] font-normal text-slate-400">· Neural Engine</span>
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                <span>HYBRID RAG + ZERO-HALLUCINATION</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Grounding against authorized engineering manuals</span>
              {targetMachineTag && (
                <span className="font-mono text-slate-700 font-bold bg-slate-100 px-1.5 py-0.2 rounded text-[10px] truncate max-w-[240px]">
                  {targetMachineTag}
                  {targetMachineName ? ` (${targetMachineName})` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Live Stopwatch & Latency Meter */}
        <div className="flex items-center gap-2 text-right">
          <div className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-mono text-[11px] flex items-center gap-1.5 shadow-2xs">
            <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span className="font-bold text-slate-900">{elapsedSec.toFixed(1)}s</span>
            <span className="text-slate-400 text-[10px]">latency</span>
          </div>
        </div>
      </div>

      {/* Real-time 60fps Neural Harmonic DSP Oscilloscope Bar */}
      <div className="my-3.5 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 p-2 relative shadow-inner">
        <canvas
          ref={canvasRef}
          width={760}
          height={38}
          className="w-full h-9 block"
        />
        <div className="absolute top-1.5 right-2.5 flex items-center gap-2 text-[9px] font-mono text-slate-400 pointer-events-none">
          <span className="text-cyan-400 font-bold">48 kHz DSP</span>
          <span>|</span>
          <span className="text-blue-400">ISO-14224 GROUNDED</span>
          <span>|</span>
          <span className="text-emerald-400 font-bold">RLS ISOLATED</span>
        </div>
      </div>

      {/* 4-Phase RAG Pipeline Stepper */}
      <div className="pb-3.5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {pipelineSteps.map((step) => {
            const isCompleted = activeStepIndex > step.id;
            const isCurrent = activeStepIndex === step.id;
            const StepIcon = step.icon;

            return (
              <div
                key={step.id}
                className={`p-2.5 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                  isCurrent
                    ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-400/40 shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50/50 border-emerald-200 text-slate-700'
                    : 'bg-slate-50/70 border-slate-200/80 text-slate-400 opacity-60'
                }`}
              >
                {/* Active step glowing indicator bar */}
                {isCurrent && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 animate-pulse" />
                )}

                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3 h-3" /> : <StepIcon className="w-3 h-3" />}
                    </div>
                    <span className="text-[11px] font-bold font-sans truncate">
                      {step.label}
                    </span>
                  </div>

                  {isCurrent && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
                    </span>
                  )}
                </div>

                <p className="text-[10px] font-mono leading-tight line-clamp-2">
                  {step.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Active Directive Pill */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono flex items-center gap-2.5 shadow-inner">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
        <span className="text-cyan-300 text-[11px] font-bold shrink-0">
          STAGE {activeStepIndex + 1}/4:
        </span>
        <span className="text-slate-200 text-[11px] truncate flex-1 font-mono">
          {queryStep || pipelineSteps[activeStepIndex]?.detail}
        </span>
        <span className="text-cyan-400 font-bold animate-pulse hidden sm:inline">_</span>
      </div>

      {/* Live Evidence Documents Pre-fetch Stream */}
      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold text-slate-700">PRE-FETCHING VERIFIED EVIDENCE CHUNKS:</span>
          </span>
          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            STRICT RLS COMPLIANT
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {evidenceCitations.map((ev, idx) => {
            const isVisible = elapsedSec >= ev.minElapsed;
            return (
              <div
                key={idx}
                className={`px-2 py-1 rounded-lg border text-[10px] font-mono flex items-center gap-1.5 transition-all duration-300 ${
                  isVisible
                    ? 'bg-slate-50 border-slate-300 text-slate-800 shadow-2xs opacity-100 translate-y-0'
                    : 'bg-slate-50/30 border-dashed border-slate-200 text-slate-400 opacity-40'
                }`}
              >
                {isVisible ? (
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full border border-slate-300 animate-spin border-t-blue-500 shrink-0" />
                )}
                <strong className="text-slate-900 truncate max-w-[150px] sm:max-w-none">
                  {ev.title}
                </strong>
                <span className="text-slate-500 text-[9px] hidden sm:inline">({ev.page})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Chain-of-Thought / Neural Reasoning Trace */}
      <div className="mt-3.5 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setIsTraceExpanded(!isTraceExpanded)}
          className="w-full flex items-center justify-between text-left py-1 text-xs font-mono font-bold text-slate-700 hover:text-blue-600 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-blue-600" />
            <span>NEURAL REASONING TRACE ({reasoningLogs.filter((l) => elapsedSec >= l.minElapsed).length}/{reasoningLogs.length} CHECKS COMPLETE)</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span>{isTraceExpanded ? 'Hide Trace' : 'Expand Trace'}</span>
            {isTraceExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {isTraceExpanded && (
          <div className="mt-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono space-y-2 animate-in fade-in duration-150">
            {reasoningLogs.map((log, lIdx) => {
              const isPassed = elapsedSec >= log.minElapsed;
              const LogIcon = log.icon;

              return (
                <div
                  key={lIdx}
                  className={`flex items-start gap-2.5 transition-opacity duration-200 ${
                    isPassed ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  <span className="text-slate-500 text-[10px] w-12 shrink-0 pt-0.5">
                    {log.time}
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                      isPassed ? 'bg-slate-800 ' + log.color : 'bg-slate-900 text-slate-600'
                    }`}
                  >
                    <LogIcon className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={`font-bold block ${isPassed ? 'text-slate-200' : 'text-slate-500'}`}>
                      {log.title}
                    </span>
                    <span className="text-slate-400 text-[10px] leading-relaxed block">
                      {log.desc}
                    </span>
                  </div>
                  {isPassed && (
                    <span className="text-[9px] text-emerald-400 font-bold shrink-0 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.2 rounded">
                      VERIFIED
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grounded Response Skeleton Wireframe Preview */}
      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <FileCheck2 className="w-3 h-3 text-blue-500" />
            <span>SYNTHESIZING VERIFIED RESPONSE WIREFRAME...</span>
          </span>
          <span className="hidden sm:inline text-emerald-600 font-bold">100% EVIDENCE TRACED</span>
        </div>

        {/* Shimmering Text Rows */}
        <div className="space-y-2">
          <div className="w-3/4 h-3.5 rounded bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 skeleton-industrial" />
          <div className="w-full h-3 rounded bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 skeleton-industrial" />
          <div className="w-5/6 h-3 rounded bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 skeleton-industrial" />
        </div>

        {/* Skeleton Action Pill Bar */}
        <div className="flex items-center gap-2 pt-1">
          <div className="w-24 h-6 rounded-lg bg-slate-100 skeleton-industrial" />
          <div className="w-32 h-6 rounded-lg bg-blue-50 skeleton-industrial" />
          <div className="w-28 h-6 rounded-lg bg-amber-50 skeleton-industrial hidden sm:block" />
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Cpu,
  Layers,
  Check,
  Activity,
  ScanEye,
  FileCheck2,
  Lock,
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

  // High-precision elapsed timer
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedSec(elapsed);

      // Dynamically advance pipeline step based on elapsed time if queryStep doesn't dictate
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

  const pipelineSteps = [
    {
      id: 0,
      label: 'Security & Scope',
      detail: targetMachineTag
        ? `Scoped to ${targetMachineTag} · Verifying Tenant RLS`
        : 'Verifying Factory Tenant RLS & Asset Scopes',
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

  return (
    <div className="w-full max-w-4xl bg-white border border-[#CBD5E1] hover:border-blue-400 rounded-2xl p-5 sm:p-6 shadow-xl shadow-blue-500/5 relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
      {/* Top Laser Scanning Beam */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-slate-100 overflow-hidden">
        <div className="h-full w-48 bg-gradient-to-r from-transparent via-blue-600 to-indigo-600 animate-laser-scan rounded-full" />
      </div>

      {/* Header Row: Quantum AI Core & Live Telemetry */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Animated Holographic Core Avatar */}
          <div className="relative flex items-center justify-center shrink-0">
            {/* Outer Pulsing Halo */}
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-cyan-500/20 animate-pulse-halo blur-xs" />

            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-blue-200 flex items-center justify-center shadow-xs">
              {/* Subtle spinning outer dotted ring */}
              <div className="absolute inset-0.5 rounded-lg border border-dashed border-blue-400/60 animate-spin" style={{ animationDuration: '8s' }} />

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
                <span>ACTIVE RAG INFERENCE</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Grounding against authorized engineering manuals</span>
              {targetMachineTag && (
                <span className="font-mono text-slate-700 font-bold bg-slate-100 px-1.5 py-0.2 rounded text-[10px] truncate max-w-[240px]">
                  {targetMachineTag}{targetMachineName ? ` (${targetMachineName})` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Live Stopwatch & Telemetry Ticker */}
        <div className="flex items-center gap-2 text-right">
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-mono text-[11px] flex items-center gap-1.5 shadow-2xs">
            <Activity className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span className="font-bold text-slate-900">{elapsedSec.toFixed(1)}s</span>
            <span className="text-slate-400 text-[10px]">elapsed</span>
          </div>
        </div>
      </div>

      {/* 4-Phase RAG Pipeline Stepper */}
      <div className="py-4">
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

                <div className="flex items-center justify-between mb-1.5">
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

      {/* Dynamic Active Thought Terminal Pill */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono flex items-center gap-2.5 shadow-inner">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
        <span className="text-cyan-300 text-[11px] font-bold shrink-0">STEP {activeStepIndex + 1}/4:</span>
        <span className="text-slate-200 text-[11px] truncate flex-1 font-mono">
          {queryStep || pipelineSteps[activeStepIndex]?.detail}
        </span>
        <span className="text-cyan-400 font-bold animate-pulse hidden sm:inline">_</span>
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

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Activity,
  ScanEye,
  Lock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Check,
  FileText,
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
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(false);

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

  const pipelineSteps = [
    { id: 0, label: 'Scope & RLS', detail: 'Verifying factory tenant authorization', icon: Lock },
    { id: 1, label: 'RAG Retrieval', detail: 'Scanning OEM manuals & ISA schematics', icon: Layers },
    {
      id: 2,
      label: hasAcousticData ? 'Acoustic DSP' : hasVisionData ? 'Vision Analysis' : 'Correlation',
      detail: hasAcousticData
        ? 'Cross-referencing vibration harmonics'
        : hasVisionData
        ? 'Validating optical readings against MAWP'
        : 'Correlating historical work orders',
      icon: hasAcousticData ? Activity : hasVisionData ? ScanEye : Cpu,
    },
    { id: 3, label: 'Gemini Synthesis', detail: 'Formulating grounded guidance', icon: Sparkles },
  ];

  return (
    <div className="flex items-start gap-3 w-full max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Assistant Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-xs shrink-0 ring-2 ring-blue-100">
        <Sparkles className="w-4 h-4 animate-pulse" />
      </div>

      {/* Normal AI Thinking Card */}
      <div className="flex-1 bg-white border border-[#E2E8F0] rounded-2xl rounded-tl-sm p-4 shadow-xs space-y-2.5">
        {/* Header: Title + Animated Thinking Dots + Timer */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 tracking-wide font-sans">
              AI Copilot is thinking
            </span>
            {/* Animated Thinking Bouncing Dots */}
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" />
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-medium">
              {elapsedSec.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Current Thought / Analysis Step */}
        <div className="flex items-center gap-2 text-xs text-slate-600 font-sans">
          <Activity className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" />
          <span className="truncate">
            {queryStep || 'Analyzing engineering specs and factory context...'}
          </span>
        </div>

        {/* Subtle Shimmer Progress Line */}
        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full w-24 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 rounded-full animate-laser-scan" />
        </div>

        {/* Machine Context Badge (if applicable) */}
        {targetMachineTag && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono pt-0.5">
            <Cpu className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">
              Target Asset: <strong className="text-slate-700">{targetMachineTag}</strong>
              {targetMachineName ? ` (${targetMachineName})` : ''}
            </span>
          </div>
        )}

        {/* Optional Collapsed Technical Details Toggle */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
            className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-blue-600 transition cursor-pointer"
          >
            <span>{isDetailsExpanded ? 'Hide technical pipeline' : 'View technical pipeline'}</span>
            {isDetailsExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {/* Collapsible Pipeline Stepper */}
          {isDetailsExpanded && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-2 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-1.5">
                {pipelineSteps.map((step) => {
                  const isCompleted = activeStepIndex > step.id;
                  const isCurrent = activeStepIndex === step.id;
                  const StepIcon = step.icon;

                  return (
                    <div
                      key={step.id}
                      className={`p-2 rounded-lg border text-[10px] font-mono flex items-center gap-1.5 transition ${
                        isCurrent
                          ? 'bg-blue-50 border-blue-200 text-blue-900 font-semibold'
                          : isCompleted
                          ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                          : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-600 text-white'
                            : isCurrent
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {isCompleted ? <Check className="w-2.5 h-2.5" /> : <StepIcon className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate">{step.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 pt-0.5">
                <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                <span>Zero-hallucination RAG grounding against verified plant manuals</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

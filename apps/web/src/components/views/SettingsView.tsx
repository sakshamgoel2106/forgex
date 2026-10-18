import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Cpu,
  ShieldCheck,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';

export const SettingsView: React.FC = () => {
  const [inferenceMode, setInferenceMode] = useState<'local_ollama' | 'saas_cloud'>(
    'local_ollama'
  );
  const [airGapped, setAirGapped] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-[#06090E] space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#182333]">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-[#A3E635]" />
            <h2 className="text-base font-bold font-mono text-white uppercase tracking-wide">
              System Configuration & Inference Policy
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Shared business logic and API contracts across SaaS and Private Enterprise deployments
          </p>
        </div>

        {saved && (
          <span className="text-xs font-mono text-[#A3E635] flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" /> Configuration Stored
          </span>
        )}
      </div>

      {/* Inference Provider Selection */}
      <Card>
        <CardHeader className="p-5 border-b border-[#182333] flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#A3E635]" />
            <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-white">
              Enterprise Inference Engine Selection
            </CardTitle>
          </div>
          <StatusBadge
            label={inferenceMode === 'local_ollama' ? 'AIR-GAP ON-PREM' : 'MANAGED CLOUD'}
            tone={inferenceMode === 'local_ollama' ? 'healthy' : 'info'}
          />
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            ForgeX AI isolates all LLM execution behind the unified <code className="text-[#A3E635] font-mono bg-[#0A0F17] px-1.5 py-0.5 rounded border border-[#182333]">IInferenceProvider</code> contract. Switching engines preserves all session state, citations, and vector indices.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Local Ollama Option */}
            <div
              onClick={() => setInferenceMode('local_ollama')}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                inferenceMode === 'local_ollama'
                  ? 'bg-[#10241A] border-[#1E4D2B] shadow-[0_0_8px_rgba(163,230,53,0.15)]'
                  : 'bg-[#0A0F17] border-[#182333] hover:border-[#24374E]'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-white">
                  Ollama / vLLM (Local Runtime)
                </span>
                <input
                  type="radio"
                  checked={inferenceMode === 'local_ollama'}
                  onChange={() => setInferenceMode('local_ollama')}
                  className="accent-[#A3E635] focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Zero internet egress. Uses local GPU cluster (Qwen2.5-VL / Llama-3.2). Approved for defense, nuclear, and chemical OT plants.
              </p>
            </div>

            {/* Cloud SaaS Option */}
            <div
              onClick={() => setInferenceMode('saas_cloud')}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                inferenceMode === 'saas_cloud'
                  ? 'bg-[#10241A] border-[#1E4D2B] shadow-[0_0_8px_rgba(163,230,53,0.15)]'
                  : 'bg-[#0A0F17] border-[#182333] hover:border-[#24374E]'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-white">
                  Enterprise Cloud SaaS (Azure / OpenAI)
                </span>
                <input
                  type="radio"
                  checked={inferenceMode === 'saas_cloud'}
                  onChange={() => setInferenceMode('saas_cloud')}
                  className="accent-[#A3E635] focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Dedicated FedRAMP / GovCloud endpoints with Zero Data Retention (ZDR) SLAs and encrypted tenant isolation enabled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network & Plant Isolation */}
      <Card>
        <CardHeader className="p-5 border-b border-[#1E293B] flex flex-row items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#A3E635]" />
          <CardTitle className="text-sm font-bold font-mono uppercase tracking-wider text-white">
            OT Network & Data Sovereignty
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          <label className="flex items-center justify-between p-4 rounded-xl bg-[#070B10] border border-[#1E293B] cursor-pointer hover:border-slate-700 transition">
            <div className="pr-4">
              <div className="text-xs font-mono font-bold text-white">
                AIR-GAPPED SOVEREIGN MODE
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Strictly disables any outbound DNS lookups or external telemetry pings outside the plant LAN.
              </p>
            </div>
            <input
              type="checkbox"
              checked={airGapped}
              onChange={(e) => setAirGapped(e.target.checked)}
              className="w-4 h-4 rounded border-[#1E293B] accent-[#A3E635] focus:ring-0 cursor-pointer"
            />
          </label>
        </CardContent>
        <CardFooter className="p-5 border-t border-[#1E293B] flex justify-end">
          <Button
            variant="primary"
            size="md"
            leftIcon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSave}
            className="bg-[#A3E635] text-[#070B10] hover:bg-[#bef264] font-semibold rounded-lg"
          >
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

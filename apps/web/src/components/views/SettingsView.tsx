import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Cpu,
  ShieldCheck,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';

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
    <div className="flex-1 p-6 overflow-y-auto bg-graphite-950 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between pb-4 border-b border-graphite-800">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold font-mono text-graphite-100 uppercase tracking-wide">
              System Configuration & Inference Policy
            </h2>
          </div>
          <p className="text-xs text-graphite-400 mt-0.5 font-mono">
            Shared business logic and API contracts across SaaS and Private Enterprise deployments
          </p>
        </div>

        {saved && (
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" /> Configuration Stored
          </span>
        )}
      </div>

      {/* Inference Provider Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <CardTitle>Enterprise Inference Model Engine</CardTitle>
          </div>
          <StatusBadge
            label={inferenceMode === 'local_ollama' ? 'AIR-GAP ON-PREM' : 'MANAGED CLOUD'}
            tone={inferenceMode === 'local_ollama' ? 'healthy' : 'info'}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-graphite-400 font-sans">
            ForgeX AI isolates all LLM execution behind the unified <code>IInferenceProvider</code>{' '}
            contract. Switching engines requires zero frontend code changes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Local Ollama Option */}
            <div
              onClick={() => setInferenceMode('local_ollama')}
              className={`p-4 rounded-lg border cursor-pointer transition ${
                inferenceMode === 'local_ollama'
                  ? 'bg-graphite-800 border-amber-500 shadow-md'
                  : 'bg-graphite-950 border-graphite-850 hover:border-graphite-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-graphite-100">
                  Ollama / vLLM (Local Runtime)
                </span>
                <input
                  type="radio"
                  checked={inferenceMode === 'local_ollama'}
                  onChange={() => setInferenceMode('local_ollama')}
                  className="text-amber-500 focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-graphite-400 mt-1">
                Zero internet egress. Uses local GPU server (Qwen2.5-VL / Llama-3.2). Approved for
                defense, nuclear & chemical OT plants.
              </p>
            </div>

            {/* Cloud SaaS Option */}
            <div
              onClick={() => setInferenceMode('saas_cloud')}
              className={`p-4 rounded-lg border cursor-pointer transition ${
                inferenceMode === 'saas_cloud'
                  ? 'bg-graphite-800 border-amber-500 shadow-md'
                  : 'bg-graphite-950 border-graphite-850 hover:border-graphite-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold text-graphite-100">
                  Enterprise Cloud SaaS (Azure / OpenAI)
                </span>
                <input
                  type="radio"
                  checked={inferenceMode === 'saas_cloud'}
                  onChange={() => setInferenceMode('saas_cloud')}
                  className="text-amber-500 focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-graphite-400 mt-1">
                Dedicated FedRAMP / GovCloud endpoints with Zero Data Retention (ZDR) SLAs enabled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network & Plant Isolation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <CardTitle>OT Network & Data Sovereignty</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded bg-graphite-950 border border-graphite-800 cursor-pointer">
            <div>
              <div className="text-xs font-mono font-bold text-graphite-200">
                AIR-GAPPED SOVEREIGN MODE
              </div>
              <p className="text-[11px] text-graphite-400">
                Strictly disables any outbound DNS lookups or telemetry pings outside the plant LAN.
              </p>
            </div>
            <input
              type="checkbox"
              checked={airGapped}
              onChange={(e) => setAirGapped(e.target.checked)}
              className="w-4 h-4 rounded border-graphite-700 text-amber-500 focus:ring-0 cursor-pointer"
            />
          </label>
        </CardContent>
        <CardFooter>
          <Button
            variant="primary"
            size="md"
            leftIcon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSave}
          >
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

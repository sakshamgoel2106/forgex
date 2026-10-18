import React, { useState } from 'react';
import {
  SearchCode,
  Send,
  AlertTriangle,
  FileCheck2,
  Image as ImageIcon,
  Copy,
  Crosshair,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

export const DiagnosticsTerminalView: React.FC = () => {
  const [query, setQuery] = useState(
    'Slurry Pump PUMP-204-B mechanical seal leaking: What is the exact gland bolt torque spec and teardown sequence?'
  );
  const [selectedAsset, setSelectedAsset] = useState('PUMP-204-B');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Top Telemetry Context Bar */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <SearchCode className="w-4 h-4" />
            <span>GROUNDED DIAGNOSTIC ENGINE</span>
          </div>
          <span className="text-graphite-600">|</span>
          <div className="flex items-center gap-1.5 text-graphite-300">
            <span className="text-graphite-500">TARGET ASSET:</span>
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="bg-graphite-950 border border-graphite-800 rounded px-2 py-0.5 text-cyan-400 outline-none"
            >
              <option value="PUMP-204-B">PUMP-204-B (Slurry Process Pump)</option>
              <option value="COMP-101-A">COMP-101-A (Centrifugal Gas Compressor)</option>
              <option value="HEX-302-C">HEX-302-C (Shell & Tube Heat Exchanger)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-graphite-400">
            MODEL: <span className="text-graphite-200">Qwen2.5-VL / Ollama (Local)</span>
          </span>
          <StatusBadge label="PRE-RETRIEVAL RBAC ACTIVE" tone="info" />
        </div>
      </div>

      {/* Main Workspace Split: Diagnostic Reasoning Panel + Visual Schematic Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Diagnostic Reasoning Output */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 max-w-3xl">
          {/* Query Echo Banner */}
          <div className="p-3.5 rounded bg-graphite-900 border border-graphite-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-graphite-500 uppercase">
              <span>Technician Inquiry Hash: 7b819c9...</span>
              <span className="text-cyan-400">Plant Location: Refining Unit 2</span>
            </div>
            <p className="text-xs font-mono text-graphite-100 font-medium">{query}</p>
          </div>

          {/* AI Grounded Synthesis */}
          <div className="p-4 rounded-lg bg-graphite-900/90 border border-graphite-700 space-y-4">
            {/* Header / Citation Match Confidence */}
            <div className="flex items-center justify-between pb-3 border-b border-graphite-800">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold text-graphite-100">
                  VERIFIED DIAGNOSTIC GUIDANCE
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 rounded">
                  99.8% Grounding Score
                </span>
                <span className="text-[11px] font-mono text-graphite-400">
                  Latency: 1.42s
                </span>
              </div>
            </div>

            {/* Safety Hazard Callout */}
            <div className="p-3 rounded bg-amber-950/40 border-l-4 border-amber-500 text-xs font-mono space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>OSHA 1910.147 Safety Directive</span>
              </div>
              <p className="text-graphite-300 text-[11px] leading-relaxed">
                Before releasing gland follower nuts, verify electrical lockout of 4160V breaker
                (Breaker ID: BRK-4160-P204B) and zero hydraulic pressure on suction/discharge gauges.
              </p>
            </div>

            {/* Answer Content */}
            <div className="space-y-3 text-xs leading-relaxed text-graphite-200">
              <p>
                According to <strong className="text-amber-400 font-mono">SOP-MTR-042 (Rev 4.1)</strong> and confirmed in the OEM technical specification, the mechanical seal gland bolt torque specifications and sequence are as follows:
              </p>

              <div className="p-3 rounded bg-graphite-950 border border-graphite-800 font-mono text-[11px] space-y-1.5">
                <div className="text-graphite-400 text-[10px] uppercase font-semibold">
                  Gland Follower Torque Specifications:
                </div>
                <div className="flex justify-between border-b border-graphite-850 pb-1">
                  <span>Initial Star Pattern Cross-Torque:</span>
                  <span className="text-cyan-400 font-bold">18 Nm (13.3 ft-lb)</span>
                </div>
                <div className="flex justify-between border-b border-graphite-850 pb-1">
                  <span>Final Tightening Torque:</span>
                  <span className="text-amber-400 font-bold">34 Nm ± 1.5 Nm (25.1 ft-lb)</span>
                </div>
                <div className="flex justify-between text-graphite-400 text-[10px]">
                  <span>Nominal Gland Gap Tolerance:</span>
                  <span className="text-emerald-400">3.18 mm ± 0.12 mm</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-graphite-100 font-mono text-[11px]">
                  Recommended Teardown Sequence:
                </div>
                <ol className="list-decimal pl-5 space-y-1 text-graphite-300 font-sans text-xs">
                  <li>Verify Zero-Energy State and Lockout-Tagout signoff on breaker panel.</li>
                  <li>Drain casing fluid via lower drain valve V-204-D into hazardous waste sump.</li>
                  <li>Loosen the 4x 316SS gland follower nuts in a diagonal cross-star pattern in 90-degree increments to prevent seal face cocking.</li>
                  <li>Inspect stationary silicon carbide mating face for micro-fissures or heat-checking.</li>
                </ol>
              </div>
            </div>

            {/* Source Document Citation Chips */}
            <div className="pt-3 border-t border-graphite-800 space-y-2">
              <span className="text-[10px] font-mono text-graphite-500 uppercase">
                Verified Document Citations (Audit-Traceable)
              </span>
              <div className="flex flex-wrap gap-2">
                <div className="p-2 rounded bg-graphite-950 border border-graphite-800 flex items-center gap-2 text-xs font-mono hover:border-amber-500/60 transition cursor-pointer">
                  <FileCheck2 className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-400 font-bold">SOP-MTR-042</span>
                  <span className="text-graphite-400">Page 14, Section 3.2</span>
                  <span className="text-[10px] text-graphite-500 bg-graphite-900 px-1 py-0.5 rounded">
                    BBox: [120,440,890,620]
                  </span>
                </div>

                <div className="p-2 rounded bg-graphite-950 border border-graphite-800 flex items-center gap-2 text-xs font-mono hover:border-amber-500/60 transition cursor-pointer">
                  <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-400 font-bold">OEM-MAN-883</span>
                  <span className="text-graphite-400">Page 52 (Torque Matrix)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Visual Schematic & Bounding Box Viewer */}
        <div className="w-[480px] border-l border-graphite-800 bg-graphite-900/40 p-4 flex flex-col justify-between overflow-hidden">
          <div className="space-y-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-graphite-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-graphite-200">
                  SCHEMATIC BOUNDING BOX
                </span>
              </div>
              <span className="text-[10px] font-mono text-graphite-400">
                SOP-MTR-042 | FIG 4-B
              </span>
            </div>

            {/* Visual Schematic Canvas Mockup with Interactive Bounding Box */}
            <div className="relative flex-1 rounded bg-graphite-950 border border-graphite-800 overflow-hidden flex items-center justify-center p-4">
              {/* Engineering Grid */}
              <div className="absolute inset-0 bg-grid-pattern opacity-40" />

              {/* Schematic representation */}
              <div className="relative z-10 w-full max-w-sm border border-graphite-700 bg-graphite-900/90 rounded p-4 shadow-xl">
                <div className="flex justify-between items-center text-[10px] font-mono text-graphite-500 border-b border-graphite-800 pb-2 mb-3">
                  <span>DIAGRAM: PUMP CASING & SEAL GLAND</span>
                  <span className="text-amber-500">SCALE 1:1</span>
                </div>

                <div className="h-44 relative border border-dashed border-graphite-700 rounded flex items-center justify-center">
                  {/* Highlighted Bounding Box Target */}
                  <div className="absolute inset-x-8 inset-y-6 border-2 border-amber-500 bg-amber-500/10 rounded flex flex-col justify-between p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono bg-amber-500 text-graphite-950 font-bold px-1 rounded">
                        TARGET: GLAND BOLT PATTERN
                      </span>
                      <Crosshair className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    </div>
                    <div className="text-[9px] font-mono text-amber-300">
                      TORQUE: 34 Nm (STAR PATTERN)
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-between text-[10px] font-mono text-graphite-400">
                  <span>Part No: 402-SS-FLW</span>
                  <span>Tolerance: ± 1.5 Nm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="pt-3 border-t border-graphite-800">
            <button className="w-full py-2 rounded bg-graphite-800 hover:bg-graphite-700 text-graphite-200 border border-graphite-700 text-xs font-mono font-medium flex items-center justify-center gap-2 transition">
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              Copy Evidence Citation to Clipboard
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Query Input Box */}
      <div className="p-3 border-t border-graphite-800 bg-graphite-900/70">
        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a technical maintenance question, enter fault code, or request SOP teardown..."
            className="flex-1 px-4 py-2 bg-graphite-950 border border-graphite-700 rounded text-xs font-mono text-graphite-100 placeholder-graphite-500 focus:outline-none focus:border-amber-500 transition"
          />
          <button className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-graphite-950 font-mono font-bold text-xs rounded flex items-center gap-2 transition shadow-md shadow-amber-950/40">
            <Send className="w-3.5 h-3.5" />
            Query RAG
          </button>
        </div>
      </div>
    </div>
  );
};

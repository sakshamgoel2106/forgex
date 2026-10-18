import React, { useState } from 'react';
import {
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Crosshair,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';

export const VisualIntelligenceView: React.FC = () => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [highlightBox, setHighlightBox] = useState(true);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Top Telemetry Header */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <ImageIcon className="w-4 h-4" />
            <span>VISUAL INTELLIGENCE & SCHEMATIC PARSER</span>
          </div>
          <span className="text-graphite-600">|</span>
          <span className="text-graphite-300">DIAGRAM: SOP-MTR-042 (FIG 4-B)</span>
          <span className="text-cyan-400">[PUMP-204-B]</span>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge label="BBOX ANNOTATION ACTIVE" tone="info" />
          <span className="text-[11px] text-graphite-400">RESOLUTION: 300 DPI</span>
        </div>
      </div>

      {/* Main Split: Visual Canvas + Figure Metadata */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Schematic Viewer Canvas */}
        <div className="flex-1 p-4 flex flex-col justify-between overflow-hidden bg-graphite-950">
          {/* Zoom / Overlay Toolbar */}
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                className="p-1.5 rounded bg-graphite-900 hover:bg-graphite-800 border border-graphite-800 text-graphite-300 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-graphite-400 w-14 text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
                className="p-1.5 rounded bg-graphite-900 hover:bg-graphite-800 border border-graphite-800 text-graphite-300 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="px-2 py-1 rounded bg-graphite-900 hover:bg-graphite-800 border border-graphite-800 text-xs font-mono text-graphite-400 transition"
              >
                Reset
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <label className="flex items-center gap-2 cursor-pointer text-graphite-300">
                <input
                  type="checkbox"
                  checked={highlightBox}
                  onChange={(e) => setHighlightBox(e.target.checked)}
                  className="rounded border-graphite-700 text-amber-500 focus:ring-0 cursor-pointer"
                />
                <span>Render AI Bounding Box</span>
              </label>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="relative flex-1 rounded-lg border border-graphite-800 bg-graphite-900/50 overflow-hidden flex items-center justify-center p-6 select-none">
            {/* Background Engineering Grid */}
            <div className="absolute inset-0 bg-grid-pattern opacity-30" />

            {/* Diagram Simulation Container */}
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
              className="relative transition-transform duration-200 w-full max-w-lg aspect-[4/3] rounded bg-graphite-900 border border-graphite-700 shadow-2xl p-6 flex flex-col justify-between"
            >
              <div className="flex justify-between items-center text-[10px] font-mono text-graphite-400 border-b border-graphite-800 pb-2">
                <span>FLOWSERVE MARK 3 - SEAL HOUSING EXPLODED SCHEMATIC</span>
                <span className="text-amber-500">P/N: DWG-402-FLW</span>
              </div>

              {/* Graphical Assembly Representation */}
              <div className="relative flex-1 flex items-center justify-center my-4 border border-dashed border-graphite-800 rounded">
                <div className="w-48 h-32 rounded border-2 border-graphite-600 bg-graphite-950/80 flex items-center justify-center relative">
                  <div className="w-24 h-24 rounded-full border border-dashed border-cyan-500/60 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-2 border-amber-500/80" />
                  </div>

                  {/* Dynamic Bounding Box Overlay */}
                  {highlightBox && (
                    <div className="absolute -inset-3 border-2 border-amber-500 bg-amber-500/10 rounded flex flex-col justify-between p-1.5 animate-pulse">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono bg-amber-500 text-graphite-950 font-bold px-1 rounded">
                          BBOX: [120, 440, 890, 620]
                        </span>
                        <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="text-[9px] font-mono text-amber-300 bg-graphite-950/80 px-1 py-0.5 rounded border border-amber-800/80 w-fit">
                        TARGET: 4x 316SS Gland Follower Studs (Torque: 34 Nm)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between text-[10px] font-mono text-graphite-500 border-t border-graphite-800 pt-2">
                <span>SOURCE: OEM MANUAL REV 2.0</span>
                <span>PAGE: 52 / 184</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Technical Metadata Inspector */}
        <div className="w-96 border-l border-graphite-800 bg-graphite-900/70 p-4 space-y-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Multimodal Figure Extraction</CardTitle>
              <StatusBadge label="EXTRACTED" tone="healthy" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs font-mono space-y-2">
                <div>
                  <div className="text-[10px] text-graphite-500 uppercase">DOCUMENT NUMBER</div>
                  <div className="text-graphite-100 font-bold mt-0.5">SOP-MTR-042</div>
                </div>

                <div>
                  <div className="text-[10px] text-graphite-500 uppercase">SYNTHETIC VLM CAPTION</div>
                  <p className="text-graphite-300 font-sans mt-0.5 text-xs leading-relaxed">
                    Exploded mechanical view of ANSI process pump stuffing box, showing primary silicon
                    carbide stationary seal ring, carbon rotating face, compression spring assembly, and
                    4-bolt gland follower orientation.
                  </p>
                </div>

                <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800 space-y-1">
                  <div className="text-[10px] text-graphite-500 uppercase">BOUNDING BOX COORD</div>
                  <div className="text-cyan-400 text-xs">
                    X1: 120 | Y1: 440 | X2: 890 | Y2: 620
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

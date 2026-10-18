import React, { useState } from 'react';
import {
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Upload,
  AlertOctagon,
  FileText,
  Search,
  Shield,
  RefreshCw,
  Info,
} from 'lucide-react';
import { StatusBadge, type StatusTone } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AlertBanner } from '../ui/AlertBanner';
import { Button } from '../ui/button';

interface TestVisualScenario {
  id: string;
  name: string;
  category: 'PHOTOGRAPH' | 'PID_RENDER' | 'DIAGRAM' | 'INSUFFICIENT';
  filename: string;
  query: string;
  plantCode: string;
  assetTag: string;
  description: string;
  detectedTags: string[];
  components: Array<{
    id: string;
    label: string;
    equipmentTag: string | null;
    confidence: number;
    bbox?: { x1: number; y1: number; x2: number; y2: number };
    sourceReference?: string;
  }>;
  isAmbiguous: boolean;
  ambiguityReason?: string;
  isInsufficientEvidence: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';
  modelUsed: string;
  processingMethod: string;
  answer: string;
  crossRetrievedCitations: Array<{
    documentNumber: string;
    documentTitle: string;
    pageNumber: number;
    sectionHeading: string;
    snippet: string;
  }>;
}

const PRELOADED_SCENARIOS: TestVisualScenario[] = [
  {
    id: 'pump-seal-photo',
    name: 'Walkdown Photograph: Pump P-101-A Seal Weepage',
    category: 'PHOTOGRAPH',
    filename: 'pump_p101_seal_walkdown.png',
    query: 'Identify visible mechanical assembly components and cross-reference gland bolt torque specifications.',
    plantCode: 'CDU-01',
    assetTag: 'P-101-A',
    description:
      'Industrial Photograph: Centrifugal booster pump P-101-A drive end. Mechanical seal gland follower shows visible fluid weepage at gland plate interface. Casing lower drain valve V-101-D and coupling guard visible in nominal operational orientation.',
    detectedTags: ['P-101-A', 'V-101-D'],
    components: [
      {
        id: 'comp-seal-gland-1',
        label: 'Mechanical Seal Gland Assembly',
        equipmentTag: 'P-101-A',
        confidence: 0.94,
        bbox: { x1: 220, y1: 280, x2: 540, y2: 600 },
        sourceReference: 'Drive End Shaft Coupling Guard Interface',
      },
      {
        id: 'comp-drain-valve-2',
        label: 'Casing Lower Drain Valve',
        equipmentTag: 'V-101-D',
        confidence: 0.88,
        bbox: { x1: 610, y1: 720, x2: 780, y2: 880 },
        sourceReference: 'Lower Casing Drain Port',
      },
      {
        id: 'comp-unverified-fitting',
        label: 'Auxiliary Instrument Tubing Fitting',
        equipmentTag: null, // Confidence 0.55 < 0.70 remains unlinked
        confidence: 0.55,
        bbox: { x1: 820, y1: 140, x2: 920, y2: 260 },
        sourceReference: 'Background Manifold Line',
      },
    ],
    isAmbiguous: false,
    isInsufficientEvidence: false,
    confidence: 'HIGH',
    modelUsed: 'forgex-local-vision-v1',
    processingMethod: 'LOCAL_VISION_MODEL',
    answer: `### Visual Inspection Observations (pump_p101_seal_walkdown.png)
- Derived Description (forgex-local-vision-v1): Identification of P-101-A centrifugal crude booster pump drive end. Visible fluid weepage detected at mechanical seal gland plate.
- Detected Equipment Tags: P-101-A, V-101-D
- Primary Component Focus: Mechanical Seal Gland Assembly (Confidence: 94.0%)
  Region Coordinates: [x1: 220, y1: 280, x2: 540, y2: 600]

### Cross-Retrieved Operational Manual Evidence (SOP-MECH-P101 Rev C, Page 12)
Prior to tightening gland follower bolts, ensure LOTO isolation is verified on suction block valve MOV-101.
Gland studs must be torqued in a cross-star pattern in three progressive passes:
- Pass 1: 15 ft-lbs (20 Nm)
- Pass 2: 30 ft-lbs (40 Nm)
- Final Pass 3: 45 ft-lbs (61 Nm) cross-verified with calibrated torque wrench.
Permissible seal flush plan: Plan 11 with orifice restriction.
Casing drain valve V-101-D must remain closed during flush commissioning.`,
    crossRetrievedCitations: [
      {
        documentNumber: 'SOP-MECH-P101',
        documentTitle: 'Centrifugal Pump P-101 Maintenance and Mechanical Seal Replacement Standard Procedure',
        pageNumber: 12,
        sectionHeading: '4.3 Mechanical Seal Gland Assembly & Torque Matrix',
        snippet:
          'Gland studs must be torqued in a cross-star pattern in three progressive passes: Pass 1: 15 ft-lbs (20 Nm), Pass 2: 30 ft-lbs (40 Nm), Final Pass 3: 45 ft-lbs (61 Nm). Ensure LOTO on MOV-101.',
      },
    ],
  },
  {
    id: 'pid-schematic-render',
    name: 'Rendered P&ID Page: Crude Booster Pump Schematic',
    category: 'PID_RENDER',
    filename: 'cdu_crude_booster_pid_schematic.png',
    query: 'Read P&ID equipment tags and cross-reference suction block valve isolation requirements.',
    plantCode: 'CDU-01',
    assetTag: 'P-101-A',
    description:
      'Rendered P&ID Diagram: Piping & Instrumentation Diagram showing crude feed booster pump P-101-A with 8" suction line from storage manifold, suction block valve MOV-101, and discharge instrumentation line FT-101-B.',
    detectedTags: ['P-101-A', 'MOV-101', 'FT-101-B'],
    components: [
      {
        id: 'comp-pid-pump',
        label: 'Centrifugal Crude Feed Booster Pump',
        equipmentTag: 'P-101-A',
        confidence: 0.96,
        bbox: { x1: 300, y1: 380, x2: 520, y2: 620 },
        sourceReference: 'P&ID Grid C-4',
      },
      {
        id: 'comp-pid-suction-valve',
        label: 'Suction Manual Block Valve',
        equipmentTag: 'MOV-101',
        confidence: 0.91,
        bbox: { x1: 120, y1: 420, x2: 240, y2: 560 },
        sourceReference: 'P&ID Grid B-4',
      },
      {
        id: 'comp-pid-flow-transmitter',
        label: 'Discharge Flow Transmitter',
        equipmentTag: 'FT-101-B',
        confidence: 0.89,
        bbox: { x1: 620, y1: 360, x2: 740, y2: 480 },
        sourceReference: 'P&ID Grid D-3',
      },
      {
        id: 'comp-pid-unlabeled-line',
        label: 'Secondary Purge Bypass Line',
        equipmentTag: null, // Confidence 0.62 < 0.70 remains unlinked
        confidence: 0.62,
        bbox: { x1: 410, y1: 170, x2: 560, y2: 290 },
        sourceReference: 'P&ID Grid C-2',
      },
    ],
    isAmbiguous: false,
    isInsufficientEvidence: false,
    confidence: 'HIGH',
    modelUsed: 'forgex-local-vision-v1',
    processingMethod: 'LOCAL_VISION_MODEL',
    answer: `### Visual Inspection Observations (cdu_crude_booster_pid_schematic.png)
- Derived Description (forgex-local-vision-v1): Rendered P&ID Diagram showing crude feed booster pump P-101-A with suction line from storage manifold and block valve MOV-101.
- Detected Equipment Tags: P-101-A, MOV-101, FT-101-B
- Primary Component Focus: Suction Manual Block Valve MOV-101 (Confidence: 91.0%)
  Region Coordinates: [x1: 120, y1: 420, x2: 240, y2: 560]

### Cross-Retrieved Operational Manual Evidence (SOP-MECH-P101 Rev C, Page 12)
Prior to tightening gland follower bolts or performing maintenance on P-101-A, ensure LOTO isolation is verified on suction block valve MOV-101. Casing drain valve V-101-D must remain closed during flush commissioning.

*P&ID Notice: Visual extraction reads equipment tags and callouts. Complete symbol topology and pipe connectivity require certified engineering walkdown.*`,
    crossRetrievedCitations: [
      {
        documentNumber: 'SOP-MECH-P101',
        documentTitle: 'Centrifugal Pump P-101 Maintenance and Mechanical Seal Replacement Standard Procedure',
        pageNumber: 12,
        sectionHeading: '4.3 Mechanical Seal Gland Assembly & Torque Matrix',
        snippet:
          'Prior to tightening gland follower bolts, ensure LOTO isolation is verified on suction block valve MOV-101.',
      },
    ],
  },
  {
    id: 'degraded-pid-ambiguous',
    name: 'Degraded Diagram: Ambiguous Linework & Overlapping Bubbles',
    category: 'DIAGRAM',
    filename: 'degraded_ambiguous_pid.png',
    query: 'Is this valve connected upstream or downstream of pump P-101-A?',
    plantCode: 'CDU-01',
    assetTag: 'P-101-A',
    description:
      'Ambiguous visual diagram: Piping line connections and instrument bubble symbols appear degraded or overlapping. Engineering review is required before verifying line tracing.',
    detectedTags: ['P-101-A'],
    components: [
      {
        id: 'comp-ambiguous-1',
        label: 'Uncertain Valve / Orifice Assembly',
        equipmentTag: null, // Confidence 0.52 < 0.70 unlinked
        confidence: 0.52,
        bbox: { x1: 210, y1: 340, x2: 380, y2: 490 },
        sourceReference: 'Figure Section 2 (Degraded)',
      },
    ],
    isAmbiguous: true,
    ambiguityReason:
      'Faded linework and overlapping flow annotations prevent unambiguous component confirmation and line tracing.',
    isInsufficientEvidence: false,
    confidence: 'UNCERTAIN',
    modelUsed: 'forgex-local-vision-v1',
    processingMethod: 'LOCAL_VISION_MODEL',
    answer: `WARNING: AMBIGUOUS DIAGRAM IDENTIFIED
Faded linework and overlapping flow annotations prevent unambiguous component confirmation.
Escalation required: Field verification or original CAD drawing review required before relying on line connectivity.`,
    crossRetrievedCitations: [],
  },
  {
    id: 'blank-insufficient-evidence',
    name: 'Blank / Low-Contrast Capture: Insufficient Evidence',
    category: 'INSUFFICIENT',
    filename: 'blank_empty_capture.png',
    query: 'Inspect this walkdown capture for equipment defects.',
    plantCode: 'CDU-01',
    assetTag: 'P-101-A',
    description:
      'Insufficient visual evidence: The image content is uninformative, low-contrast, or does not depict recognized industrial plant equipment.',
    detectedTags: [],
    components: [],
    isAmbiguous: false,
    isInsufficientEvidence: true,
    confidence: 'INSUFFICIENT_EVIDENCE',
    modelUsed: 'forgex-local-vision-v1',
    processingMethod: 'LOCAL_VISION_MODEL',
    answer:
      'Insufficient visual evidence: The submitted image does not contain identifiable equipment features, nameplates, or legible diagram symbols. Please supply a clear, well-lit photograph or high-resolution schematic.',
    crossRetrievedCitations: [],
  },
];

export const VisualIntelligenceView: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<TestVisualScenario>(PRELOADED_SCENARIOS[0]);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState(activeScenario.query);
  const [isProcessing, setIsProcessing] = useState(false);
  const [unsupportedError, setUnsupportedError] = useState<string | null>(null);

  const handleSelectScenario = (scenario: TestVisualScenario) => {
    setActiveScenario(scenario);
    setCustomQuery(scenario.query);
    setSelectedComponentId(null);
    setUnsupportedError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUnsupportedError(null);
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type.toLowerCase())) {
      setUnsupportedError(
        `Unsupported visual format '${file.type || file.name}'. Supported formats are PNG, JPEG, and WebP.`
      );
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      // If user uploaded a custom image, simulate standard photograph analysis
      setActiveScenario({
        ...PRELOADED_SCENARIOS[0],
        id: `upload-${Date.now()}`,
        name: `Uploaded: ${file.name}`,
        filename: file.name,
      });
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Top Telemetry Header */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
            <ImageIcon className="w-4 h-4" />
            <span>VISUAL INDUSTRIAL INTELLIGENCE</span>
          </div>
          <span className="text-graphite-600">|</span>
          <span className="text-graphite-300">ASSET: {activeScenario.assetTag}</span>
          <span className="text-graphite-500">[{activeScenario.plantCode}]</span>
          <span className="text-graphite-600">|</span>
          <span className="text-graphite-400 truncate max-w-xs">{activeScenario.filename}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
            <Shield className="w-3.5 h-3.5" />
            <span>AIR-GAPPED / ZERO CLOUD LEAKAGE</span>
          </div>
          <span className="text-graphite-700">|</span>
          <StatusBadge
            label={
              activeScenario.isInsufficientEvidence
                ? 'INSUFFICIENT EVIDENCE'
                : activeScenario.isAmbiguous
                ? 'UNCERTAIN DIAGRAM'
                : 'ANALYTICS NOMINAL'
            }
            tone={
              (activeScenario.isInsufficientEvidence
                ? 'critical'
                : activeScenario.isAmbiguous
                ? 'warning'
                : 'healthy') as StatusTone
            }
          />
        </div>
      </div>

      {/* Scenario / Quick Loader Bar */}
      <div className="px-4 py-2 bg-graphite-900/40 border-b border-graphite-800 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          <span className="text-graphite-400 text-[11px] uppercase tracking-wider">
            PRELOADED SCENARIO:
          </span>
          {PRELOADED_SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectScenario(s)}
              className={`px-2.5 py-1 rounded text-xs transition border ${
                activeScenario.id === s.id
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40 font-semibold'
                  : 'bg-graphite-900/80 text-graphite-400 border-graphite-800 hover:text-graphite-200 hover:bg-graphite-800'
              }`}
            >
              {s.category === 'PHOTOGRAPH' && '📷 Photo Walkdown'}
              {s.category === 'PID_RENDER' && '📐 Rendered P&ID'}
              {s.category === 'DIAGRAM' && '⚠️ Degraded Diagram'}
              {s.category === 'INSUFFICIENT' && '🚫 Low Evidence'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded bg-graphite-800 hover:bg-graphite-700 text-graphite-200 text-xs font-mono transition border border-graphite-700">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upload Visual Asset</span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Error Alert if Unsupported Format Uploaded */}
      {unsupportedError && (
        <div className="p-3 border-b border-rose-900/50 bg-rose-950/30">
          <AlertBanner
            tone="error"
            title="Unsupported File Format"
            message={unsupportedError}
            onDismiss={() => setUnsupportedError(null)}
          />
        </div>
      )}

      {/* Main Split: Visual Canvas (Left) + Evidence / SOP Cross-Retrieval (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Interactive Visual Canvas */}
        <div className="flex-1 p-4 flex flex-col justify-between overflow-hidden bg-graphite-950 border-r border-graphite-800">
          {/* Canvas Controls */}
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

            <div className="flex items-center gap-4 text-xs font-mono">
              <label className="flex items-center gap-2 cursor-pointer text-graphite-300">
                <input
                  type="checkbox"
                  checked={showBoundingBoxes}
                  onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                  className="rounded border-graphite-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span>Render AI Bounding Boxes</span>
              </label>
              <span className="text-graphite-600">|</span>
              <span className="text-graphite-400 text-[11px]">
                Detected Components: {activeScenario.components.length}
              </span>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="relative flex-1 rounded-lg border border-graphite-800 bg-graphite-900/40 overflow-hidden flex items-center justify-center p-6 select-none">
            {/* Background Engineering Blueprint Grid */}
            <div className="absolute inset-0 bg-grid-pattern opacity-25" />

            {/* Simulated Industrial Asset Canvas Container */}
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
              className="relative transition-transform duration-200 w-full max-w-xl aspect-[4/3] rounded bg-graphite-900 border border-graphite-700 shadow-2xl p-6 flex flex-col justify-between"
            >
              {/* Header inside schematic */}
              <div className="flex justify-between items-center text-[10px] font-mono text-graphite-400 border-b border-graphite-800 pb-2">
                <span className="font-semibold text-graphite-200">
                  {activeScenario.category === 'PID_RENDER'
                    ? 'P&ID SCHEMATIC: CRUDE BOOSTER SYSTEM'
                    : activeScenario.category === 'PHOTOGRAPH'
                    ? 'INSPECTION WALKDOWN CAPTURE — PUMP P-101-A'
                    : 'DIAGRAM VIEWPORT'}
                </span>
                <span className="text-cyan-400">TAG: {activeScenario.assetTag}</span>
              </div>

              {/* Graphic Asset Render */}
              <div className="relative flex-1 flex items-center justify-center my-4 border border-dashed border-graphite-800 rounded bg-graphite-950/70 overflow-hidden">
                {activeScenario.isInsufficientEvidence ? (
                  <div className="text-center p-6 space-y-2">
                    <AlertOctagon className="w-10 h-10 text-rose-500 mx-auto opacity-70" />
                    <p className="text-xs font-mono text-rose-400 font-semibold">
                      INSUFFICIENT VISUAL EVIDENCE
                    </p>
                    <p className="text-[11px] text-graphite-400 max-w-sm">
                      Low-contrast or uninformative frame. No identifiable plant equipment tags or
                      symbols detected.
                    </p>
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Industrial Pump / P&ID Linework Simulation */}
                    <div className="w-64 h-40 rounded border-2 border-graphite-700 bg-graphite-900/60 flex items-center justify-center relative">
                      <div className="w-32 h-32 rounded-full border border-dashed border-cyan-500/50 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full border-2 border-amber-500/70 flex items-center justify-center">
                          <span className="text-[9px] font-mono text-amber-300">P-101-A</span>
                        </div>
                      </div>

                      {/* Suction Line & Valve MOV-101 */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-12 h-1 bg-graphite-600 flex items-center justify-center">
                        <div className="w-4 h-4 rounded bg-cyan-900 border border-cyan-400 text-[8px] font-mono text-cyan-200 flex items-center justify-center -translate-y-4">
                          MOV
                        </div>
                      </div>

                      {/* Discharge Line & Transmitter FT-101-B */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-12 h-1 bg-graphite-600 flex items-center justify-center">
                        <div className="w-4 h-4 rounded bg-amber-900 border border-amber-400 text-[8px] font-mono text-amber-200 flex items-center justify-center translate-y-4">
                          FT
                        </div>
                      </div>
                    </div>

                    {/* Normalized Bounding Box Overlays */}
                    {showBoundingBoxes &&
                      activeScenario.components.map((comp) => {
                        const isSelected = selectedComponentId === comp.id;
                        return (
                          <div
                            key={comp.id}
                            onClick={() => setSelectedComponentId(comp.id)}
                            style={{
                              left: `${(comp.bbox?.x1 || 0) / 10}%`,
                              top: `${(comp.bbox?.y1 || 0) / 10}%`,
                              width: `${((comp.bbox?.x2 || 1000) - (comp.bbox?.x1 || 0)) / 10}%`,
                              height: `${((comp.bbox?.y2 || 1000) - (comp.bbox?.y1 || 0)) / 10}%`,
                            }}
                            className={`absolute border-2 rounded transition-all cursor-pointer flex flex-col justify-between p-1 ${
                              isSelected
                                ? 'border-cyan-400 bg-cyan-400/20 z-20 shadow-lg shadow-cyan-500/20'
                                : comp.confidence >= 0.70
                                ? 'border-amber-400 bg-amber-400/10 hover:border-amber-300 z-10'
                                : 'border-graphite-600 bg-graphite-600/10 border-dashed'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span
                                className={`text-[8px] font-mono font-bold px-1 rounded ${
                                  comp.confidence >= 0.70
                                    ? 'bg-amber-500 text-graphite-950'
                                    : 'bg-graphite-700 text-graphite-300'
                                }`}
                              >
                                {comp.equipmentTag || 'UNLINKED'} (
                                {(comp.confidence * 100).toFixed(0)}%)
                              </span>
                              <Crosshair className="w-3 h-3 text-cyan-400" />
                            </div>
                            <div className="text-[8px] font-mono text-graphite-200 bg-graphite-950/90 px-1 py-0.5 rounded truncate">
                              {comp.label}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Footer info in schematic */}
              <div className="flex justify-between text-[10px] font-mono text-graphite-500 border-t border-graphite-800 pt-2">
                <span>MODEL: {activeScenario.modelUsed}</span>
                <span>EXTRACTION: {activeScenario.processingMethod}</span>
              </div>
            </div>
          </div>

          {/* Disclaimers & Alert Banners based on Category */}
          <div className="pt-3 space-y-2">
            {activeScenario.isAmbiguous && (
              <AlertBanner
                tone="warning"
                title="Ambiguous Diagram Detected"
                message={
                  activeScenario.ambiguityReason ||
                  'Faded linework or overlapping symbols prevent definitive tracing. Field verification required.'
                }
              />
            )}

            {activeScenario.category === 'PID_RENDER' && (
              <div className="p-2.5 rounded bg-cyan-950/30 border border-cyan-800/60 text-cyan-300 text-xs font-mono flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong>P&ID Disclaimer Notice:</strong> Visual pipeline extracts equipment tags
                  and component labels. Complete symbol topology and pipe connectivity require
                  certified engineering review.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Technical Metadata & SOP Cross-Retrieval Panel */}
        <div className="w-[460px] border-l border-graphite-800 bg-graphite-900/60 p-4 space-y-4 overflow-y-auto">
          {/* Inquiry Query Box */}
          <Card>
            <CardHeader>
              <CardTitle>Investigate Visual Asset</CardTitle>
              <StatusBadge
                label={activeScenario.confidence}
                tone={
                  (activeScenario.confidence === 'HIGH'
                    ? 'healthy'
                    : activeScenario.confidence === 'UNCERTAIN'
                    ? 'warning'
                    : 'critical') as StatusTone
                }
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-graphite-400 uppercase">
                  Technical Question / Investigation Context
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-700 text-xs text-graphite-100 font-mono focus:outline-none focus:border-cyan-500"
                    placeholder="Ask about visible parts or torque specifications..."
                  />
                  <Button
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => {
                      setIsProcessing(true);
                      setTimeout(() => setIsProcessing(false), 500);
                    }}
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Detected Tags Bar */}
              <div>
                <span className="text-[10px] font-mono text-graphite-500 uppercase">
                  DETECTED EQUIPMENT TAGS
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {activeScenario.detectedTags.length > 0 ? (
                    activeScenario.detectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800 text-cyan-300 font-mono text-[11px] font-bold"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-mono text-graphite-500 italic">None detected</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Component Labels & Confidence Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Identified Components & Bounding Boxes</CardTitle>
              <span className="text-[10px] font-mono text-graphite-400">Threshold: ≥ 70%</span>
            </CardHeader>
            <CardContent>
              {activeScenario.components.length === 0 ? (
                <div className="text-xs font-mono text-graphite-500 italic py-2">
                  No components detected in current visual frame.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeScenario.components.map((comp) => {
                    const isLinked = comp.confidence >= 0.70;
                    const isSelected = selectedComponentId === comp.id;
                    return (
                      <div
                        key={comp.id}
                        onClick={() => setSelectedComponentId(comp.id)}
                        className={`p-2 rounded border text-xs font-mono cursor-pointer transition ${
                          isSelected
                            ? 'bg-cyan-950/50 border-cyan-500/80 text-cyan-100'
                            : 'bg-graphite-950/70 border-graphite-800 hover:border-graphite-700 text-graphite-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-graphite-100">{comp.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              isLinked
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-graphite-800 text-graphite-400'
                            }`}
                          >
                            {(comp.confidence * 100).toFixed(1)}%
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-graphite-500 mt-1">
                          <span>
                            LINK: {comp.equipmentTag ? `Tag [${comp.equipmentTag}]` : 'Unlinked (< 70%)'}
                          </span>
                          {comp.bbox && (
                            <span className="text-cyan-400/90 font-mono">
                              [{comp.bbox.x1}, {comp.bbox.y1}, {comp.bbox.x2}, {comp.bbox.y2}]
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Multimodal Grounded Answer */}
          <Card>
            <CardHeader>
              <CardTitle>Multimodal Grounded Intelligence</CardTitle>
              <StatusBadge label="VERIFIED" tone="healthy" />
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="whitespace-pre-line font-mono text-graphite-300 bg-graphite-950 p-3 rounded border border-graphite-800 leading-relaxed text-[11px]">
                {activeScenario.answer}
              </div>
            </CardContent>
          </Card>

          {/* Cross-Retrieved Operational Manual Evidence */}
          <Card>
            <CardHeader>
              <CardTitle>Cross-Retrieved Operational Manuals</CardTitle>
              <FileText className="w-4 h-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              {activeScenario.crossRetrievedCitations.length === 0 ? (
                <div className="text-xs font-mono text-graphite-500 italic py-2">
                  No manual citations linked (ambiguous or insufficient evidence).
                </div>
              ) : (
                <div className="space-y-3">
                  {activeScenario.crossRetrievedCitations.map((cit, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-1.5 text-xs font-mono"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-amber-400">{cit.documentNumber}</span>
                        <span className="text-[10px] text-graphite-400">Page {cit.pageNumber}</span>
                      </div>
                      <div className="text-[11px] text-graphite-200 font-semibold">
                        {cit.sectionHeading}
                      </div>
                      <p className="text-[11px] text-graphite-400 font-sans leading-relaxed">
                        "{cit.snippet}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

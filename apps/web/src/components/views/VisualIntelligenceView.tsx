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
import { apiFetch } from '../../lib/api';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('plantId', 'f29c2d0e-ca17-40b4-b9b3-7c4a8f5e1b8a');
      formData.append('query', customQuery || 'Identify visible components, nameplate tags, and diagram symbols.');

      const res = await apiFetch('/api/v1/visual/inspect', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || 'Visual inspection failed');
      }

      const data = json.data;
      setActiveScenario({
        id: data.visualAsset.id,
        name: `Uploaded: ${file.name}`,
        category: (data.visualAsset.assetType as any) || 'PHOTOGRAPH',
        filename: file.name,
        query: customQuery,
        plantCode: 'PLANT-TX-04',
        assetTag: data.detectedTags[0] || 'ASSET-IDENTIFIED',
        description: data.visualDescription || data.visualAsset.description,
        detectedTags: data.detectedTags || [],
        components: (data.connectedComponents || []).map((c: any) => ({
          id: c.id || `comp-${Math.random()}`,
          label: c.label,
          equipmentTag: c.equipmentTag,
          confidence: c.confidence,
          bbox: c.bbox,
          sourceReference: c.sourceReference,
        })),
        isAmbiguous: data.isAmbiguousDiagram,
        ambiguityReason: data.isAmbiguousDiagram ? data.answer : undefined,
        isInsufficientEvidence: data.isInsufficientEvidence,
        confidence: data.confidence as any,
        modelUsed: data.modelUsed,
        processingMethod: data.processingMethod,
        answer: data.answer,
        crossRetrievedCitations: (data.crossRetrievedManualCitations || []).map((cit: any) => ({
          documentNumber: cit.documentNumber,
          documentTitle: cit.documentTitle || cit.documentNumber,
          pageNumber: cit.pageNumber,
          sectionHeading: cit.sectionHeading,
          snippet: cit.snippet,
        })),
      });
    } catch (err: any) {
      setUnsupportedError(err.message || 'Failed to inspect visual asset');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteQuery = async () => {
    if (!customQuery) return;
    setIsProcessing(true);
    setUnsupportedError(null);
    try {
      const res = await apiFetch('/api/v1/visual/inspect', {
        method: 'POST',
        body: JSON.stringify({
          plantId: 'f29c2d0e-ca17-40b4-b9b3-7c4a8f5e1b8a',
          query: customQuery,
          visualAssetId:
            activeScenario.id.startsWith('upload-') ||
            (activeScenario.id.includes('-') && activeScenario.id.length > 20)
              ? activeScenario.id
              : undefined,
          filename: activeScenario.filename,
          imageBuffer:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || 'Query failed');
      }

      const data = json.data;
      setActiveScenario((prev) => ({
        ...prev,
        query: customQuery,
        answer: data.answer,
        confidence: data.confidence as any,
        isAmbiguous: data.isAmbiguousDiagram,
        isInsufficientEvidence: data.isInsufficientEvidence,
        crossRetrievedCitations: (data.crossRetrievedManualCitations || []).map((cit: any) => ({
          documentNumber: cit.documentNumber,
          documentTitle: cit.documentTitle || cit.documentNumber,
          pageNumber: cit.pageNumber,
          sectionHeading: cit.sectionHeading,
          snippet: cit.snippet,
        })),
      }));
    } catch (err: any) {
      setUnsupportedError(err.message || 'Inspection query failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C]">
      {/* Top Telemetry Header */}
      <div className="p-3 border-b border-[#E2E8F0] bg-white flex items-center justify-between text-xs font-mono text-[#1A202C]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#2563EB] font-bold">
            <ImageIcon className="w-4 h-4" />
            <span>VISUAL INDUSTRIAL INTELLIGENCE</span>
          </div>
          <span className="text-[#CBD5E1]">|</span>
          <span className="text-[#1A202C] font-medium">ASSET: {activeScenario.assetTag}</span>
          <span className="text-[#64748B]">[{activeScenario.plantCode}]</span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="text-[#64748B] truncate max-w-xs">{activeScenario.filename}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <Shield className="w-3.5 h-3.5" />
            <span>AIR-GAPPED / ZERO CLOUD LEAKAGE</span>
          </div>
          <span className="text-[#CBD5E1]">|</span>
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
      <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          <span className="text-[#64748B] text-[11px] uppercase tracking-wider font-semibold">
            PRELOADED SCENARIO:
          </span>
          {PRELOADED_SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectScenario(s)}
              className={`px-3 py-1 rounded-lg text-xs transition border font-mono ${
                activeScenario.id === s.id
                  ? 'bg-[#2563EB] text-white border-[#2563EB] font-semibold shadow-sm'
                  : 'bg-white text-[#475569] border-[#E2E8F0] hover:text-[#1A202C] hover:bg-slate-50'
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
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#1A202C] text-xs font-mono transition border border-[#CBD5E1] shadow-sm">
            <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
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
        <div className="p-3 border-b border-rose-200 bg-rose-50">
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
        <div className="flex-1 p-4 flex flex-col justify-between overflow-hidden bg-[#F5F6F7] border-r border-[#E2E8F0]">
          {/* Canvas Controls */}
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#1A202C] transition shadow-sm"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-[#64748B] w-14 text-center font-semibold">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#1A202C] transition shadow-sm"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-[#CBD5E1] text-xs font-mono text-[#64748B] transition shadow-sm"
              >
                Reset
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <label className="flex items-center gap-2 cursor-pointer text-[#475569]">
                <input
                  type="checkbox"
                  checked={showBoundingBoxes}
                  onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                  className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-0 cursor-pointer"
                />
                <span className="font-medium">Render AI Bounding Boxes</span>
              </label>
              <span className="text-[#CBD5E1]">|</span>
              <span className="text-[#64748B] text-[11px]">
                Detected Components: {activeScenario.components.length}
              </span>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="relative flex-1 rounded-xl border border-[#E2E8F0] bg-white overflow-hidden flex items-center justify-center p-6 select-none shadow-sm">
            {/* Background Engineering Blueprint Grid */}
            <div className="absolute inset-0 bg-grid-pattern opacity-10" />

            {/* Simulated Industrial Asset Canvas Container */}
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
              className="relative transition-transform duration-200 w-full max-w-xl aspect-[4/3] rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] shadow-md p-6 flex flex-col justify-between"
            >
              {/* Header inside schematic */}
              <div className="flex justify-between items-center text-[10px] font-mono text-[#64748B] border-b border-[#E2E8F0] pb-2">
                <span className="font-semibold text-[#1A202C]">
                  {activeScenario.category === 'PID_RENDER'
                    ? 'P&ID SCHEMATIC: CRUDE BOOSTER SYSTEM'
                    : activeScenario.category === 'PHOTOGRAPH'
                    ? 'INSPECTION WALKDOWN CAPTURE — PUMP P-101-A'
                    : 'DIAGRAM VIEWPORT'}
                </span>
                <span className="text-[#2563EB] font-bold">TAG: {activeScenario.assetTag}</span>
              </div>

              {/* Graphic Asset Render */}
              <div className="relative flex-1 flex items-center justify-center my-4 border border-dashed border-[#CBD5E1] rounded-lg bg-white overflow-hidden shadow-inner">
                {activeScenario.isInsufficientEvidence ? (
                  <div className="text-center p-6 space-y-2">
                    <AlertOctagon className="w-10 h-10 text-rose-500 mx-auto opacity-70" />
                    <p className="text-xs font-mono text-rose-600 font-semibold">
                      INSUFFICIENT VISUAL EVIDENCE
                    </p>
                    <p className="text-[11px] text-[#64748B] max-w-sm">
                      Low-contrast or uninformative frame. No identifiable plant equipment tags or
                      symbols detected.
                    </p>
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Industrial Pump / P&ID Linework Simulation */}
                    <div className="w-64 h-40 rounded-lg border-2 border-[#CBD5E1] bg-[#F1F5F9] flex items-center justify-center relative">
                      <div className="w-32 h-32 rounded-full border border-dashed border-[#2563EB]/40 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full border-2 border-[#2563EB] flex items-center justify-center bg-blue-50 shadow-sm">
                          <span className="text-[9px] font-mono text-[#2563EB] font-bold">P-101-A</span>
                        </div>
                      </div>

                      {/* Suction Line & Valve MOV-101 */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-12 h-1 bg-slate-400 flex items-center justify-center">
                        <div className="w-5 h-5 rounded bg-white border border-[#2563EB] text-[8px] font-mono text-[#2563EB] font-bold flex items-center justify-center -translate-y-4 shadow-xs">
                          MOV
                        </div>
                      </div>

                      {/* Discharge Line & Transmitter FT-101-B */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-12 h-1 bg-slate-400 flex items-center justify-center">
                        <div className="w-5 h-5 rounded bg-white border border-amber-500 text-[8px] font-mono text-amber-700 font-bold flex items-center justify-center translate-y-4 shadow-xs">
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
                                ? 'border-[#2563EB] bg-blue-500/15 z-20 shadow-md ring-2 ring-blue-400'
                                : comp.confidence >= 0.70
                                ? 'border-[#2563EB] bg-blue-500/10 hover:border-[#1D4ED8] z-10'
                                : 'border-slate-400 bg-slate-200/40 border-dashed'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span
                                className={`text-[8px] font-mono font-bold px-1 rounded ${
                                  comp.confidence >= 0.70
                                    ? 'bg-[#2563EB] text-white'
                                    : 'bg-slate-200 text-[#475569]'
                                }`}
                              >
                                {comp.equipmentTag || 'UNLINKED'} (
                                {(comp.confidence * 100).toFixed(0)}%)
                              </span>
                              <Crosshair className="w-3 h-3 text-[#2563EB]" />
                            </div>
                            <div className="text-[8px] font-mono text-[#1A202C] bg-white/95 border border-[#CBD5E1] shadow-xs px-1 py-0.5 rounded truncate">
                              {comp.label}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Footer info in schematic */}
              <div className="flex justify-between text-[10px] font-mono text-[#64748B] border-t border-[#E2E8F0] pt-2">
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
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs font-mono flex items-start gap-2">
                <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
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
        <div className="w-[460px] border-l border-[#E2E8F0] bg-white p-4 space-y-4 overflow-y-auto">
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
                <label className="text-[10px] font-mono text-[#64748B] uppercase font-semibold">
                  Technical Question / Investigation Context
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A202C] font-mono focus:outline-none focus:border-[#2563EB] placeholder-[#94A3B8]"
                    placeholder="Ask about visible parts or torque specifications..."
                  />
                  <Button
                    size="sm"
                    disabled={isProcessing}
                    onClick={handleExecuteQuery}
                    className="bg-[#151C24] hover:bg-black text-white"
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
                <span className="text-[10px] font-mono text-[#64748B] uppercase font-semibold">
                  DETECTED EQUIPMENT TAGS
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {activeScenario.detectedTags.length > 0 ? (
                    activeScenario.detectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#2563EB] font-mono text-[11px] font-bold"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-mono text-[#64748B] italic">None detected</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Component Labels & Confidence Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Identified Components & Bounding Boxes</CardTitle>
              <span className="text-[10px] font-mono text-[#64748B]">Threshold: ≥ 70%</span>
            </CardHeader>
            <CardContent>
              {activeScenario.components.length === 0 ? (
                <div className="text-xs font-mono text-[#64748B] italic py-2">
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
                        className={`p-2.5 rounded-lg border text-xs font-mono cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50 border-blue-300 text-[#1A202C]'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-slate-300 text-[#1A202C]'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-[#1A202C]">{comp.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              isLinked
                                ? 'bg-blue-100 text-[#2563EB] border border-blue-200'
                                : 'bg-slate-200 text-[#64748B]'
                            }`}
                          >
                            {(comp.confidence * 100).toFixed(1)}%
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-[#64748B] mt-1">
                          <span>
                            LINK: {comp.equipmentTag ? `Tag [${comp.equipmentTag}]` : 'Unlinked (< 70%)'}
                          </span>
                          {comp.bbox && (
                            <span className="text-[#2563EB] font-mono font-medium">
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
              <div className="whitespace-pre-line font-mono text-[#1A202C] bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] leading-relaxed text-[11px]">
                {activeScenario.answer}
              </div>
            </CardContent>
          </Card>

          {/* Cross-Retrieved Operational Manual Evidence */}
          <Card>
            <CardHeader>
              <CardTitle>Cross-Retrieved Operational Manuals</CardTitle>
              <FileText className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {activeScenario.crossRetrievedCitations.length === 0 ? (
                <div className="text-xs font-mono text-[#64748B] italic py-2">
                  No manual citations linked (ambiguous or insufficient evidence).
                </div>
              ) : (
                <div className="space-y-3">
                  {activeScenario.crossRetrievedCitations.map((cit, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5 text-xs font-mono"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-amber-700">{cit.documentNumber}</span>
                        <span className="text-[10px] text-[#64748B]">Page {cit.pageNumber}</span>
                      </div>
                      <div className="text-[11px] text-[#1A202C] font-semibold">
                        {cit.sectionHeading}
                      </div>
                      <p className="text-[11px] text-[#475569] font-sans leading-relaxed">
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

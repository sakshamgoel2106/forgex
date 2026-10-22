import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Upload,
  AlertOctagon,
  FileText,
  Search,
  RefreshCw,
  Info,
  Layers,
  X,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  ClipboardList,
  CheckSquare,
} from 'lucide-react';
import { StatusBadge, type StatusTone } from '../ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AlertBanner } from '../ui/AlertBanner';
import { Button } from '../ui/button';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import type { VisualAsset, VisualAssetType, StructuredIndustrialAnalysis } from '@forgex/shared-types';

interface VisualInspectionResult {
  id: string;
  name: string;
  category: 'PHOTOGRAPH' | 'PID_RENDER' | 'DIAGRAM' | 'INSUFFICIENT' | 'CAD_MODEL' | 'ENGINEERING_DRAWING' | 'MANUAL_PAGE';
  filename: string;
  imageUrl?: string;
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
  processingStatus?: VisualAsset['processingStatus'];
  structuredAnalysis?: StructuredIndustrialAnalysis;
  crossRetrievedCitations: Array<{
    documentNumber: string;
    documentTitle: string;
    pageNumber: number;
    sectionHeading: string;
    snippet: string;
  }>;
}

export const VisualIntelligenceView: React.FC = () => {
  const { organization, isOwnerOrAdmin, membership } = useAuth();
  const [plants, setPlants] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [storedAssets, setStoredAssets] = useState<VisualAsset[]>([]);

  const [activeScenario, setActiveScenario] = useState<VisualInspectionResult | null>(null);
  const [uploadedScenarios, setUploadedScenarios] = useState<VisualInspectionResult[]>([]);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState('Identify visible mechanical assembly components and cross-reference equipment manual specifications.');
  const [isProcessing, setIsProcessing] = useState(false);
  const [unsupportedError, setUnsupportedError] = useState<string | null>(null);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedAssetType, setSelectedAssetType] = useState<VisualAssetType>('PHOTOGRAPH');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadState, setUploadState] = useState<'IDLE' | 'UPLOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [newlyUploadedAsset, setNewlyUploadedAsset] = useState<VisualAsset | null>(null);
  const [isProcessingDoc, setIsProcessingDoc] = useState(false);
  const [docProcessingFeedback, setDocProcessingFeedback] = useState<{
    tone: 'healthy' | 'warning' | 'critical' | 'neutral';
    message: string;
  } | null>(null);

  const handleProcessDocument = async (assetId: string) => {
    setIsProcessingDoc(true);
    setDocProcessingFeedback(null);
    try {
      const res = await apiFetch(`/api/v1/visual/assets/${assetId}/process`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || 'Failed to process document');
      }

      setDocProcessingFeedback({
        tone: 'healthy',
        message: `Successfully indexed ${json.data.totalPages} pages and ${json.data.totalChunks} chunks into Knowledge Hub / RAG vector database.`,
      });

      // Update active scenario status
      setActiveScenario((prev) =>
        prev
          ? {
              ...prev,
              processingStatus: 'INDEXED',
              answer: `Document successfully processed and indexed into Knowledge Hub with ${json.data.totalPages} pages and ${json.data.totalChunks} semantic chunks.`,
            }
          : null
      );

      fetchStoredAssets();
    } catch (err: any) {
      setDocProcessingFeedback({
        tone: 'critical',
        message: err.message || 'Document processing failed.',
      });
    } finally {
      setIsProcessingDoc(false);
    }
  };

  // Load plants, machines, and stored visual assets for the active organization
  useEffect(() => {
    // 1. Fetch plants
    apiFetch('/api/v1/plants')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setPlants(json.data);
        }
      })
      .catch((err) => console.error('Failed to load plants', err));

    // 2. Fetch machines
    apiFetch('/api/v1/machines')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setMachines(json.data);
        }
      })
      .catch((err) => console.error('Failed to load machines', err));

    // 3. Fetch stored visual assets
    fetchStoredAssets();
  }, [organization?.id]);

  const fetchStoredAssets = () => {
    apiFetch('/api/v1/visual/assets')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setStoredAssets(json.data);
        }
      })
      .catch((err) => console.error('Failed to load visual assets', err));
  };

  const effectivePlantId = plants[0]?.id || organization?.id || 'default-plant';

  const handleSelectScenario = (scenario: VisualInspectionResult) => {
    setActiveScenario(scenario);
    setCustomQuery(scenario.query);
    setSelectedComponentId(null);
    setUnsupportedError(null);
  };

  const handleSelectStoredAsset = (asset: VisualAsset) => {
    setUnsupportedError(null);
    setSelectedComponentId(null);

    const isImageFormat = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(
      asset.mimeType.toLowerCase()
    );

    const inspectionItem: VisualInspectionResult = {
      id: asset.id,
      name: asset.filename,
      category: asset.assetType as any,
      filename: asset.filename,
      imageUrl: isImageFormat ? `/api/v1/visual/assets/${asset.id}/image` : undefined,
      query: `Inspecting asset ${asset.filename}`,
      plantCode: plants[0]?.code || 'PLANT-PRIMARY',
      assetTag: asset.equipmentTags?.[0] || 'ASSET-STORED',
      description: asset.description || `Stored engineering asset (${asset.assetType})`,
      detectedTags: asset.equipmentTags || [],
      components: (asset.componentLabels || []).map((c) => ({
        id: c.id,
        label: c.label,
        equipmentTag: c.equipmentTag || null,
        confidence: c.confidence,
        bbox: c.bbox ? { ...c.bbox } : undefined,
        sourceReference: c.sourceReference || undefined,
      })),
      isAmbiguous: !!asset.isAmbiguous,
      isInsufficientEvidence: false,
      confidence: asset.confidenceScore >= 0.8 ? 'HIGH' : 'MEDIUM',
      modelUsed: asset.modelUsed,
      processingMethod: asset.extractionMethod,
      processingStatus: asset.processingStatus,
      answer: `Asset stored in private storage with status: ${asset.processingStatus || 'UPLOADED'}.`,
      crossRetrievedCitations: [],
    };

    setActiveScenario(inspectionItem);
  };

  // Perform Admin File Upload via POST /api/v1/visual/upload
  const handlePerformUpload = async () => {
    if (!uploadFile) return;

    if (!isOwnerOrAdmin) {
      setUploadState('ERROR');
      setUploadErrorMessage('Permission Denied: Only organization administrators are authorized to upload visual and engineering assets.');
      return;
    }

    setUploadState('UPLOADING');
    setUploadProgress(25);
    setUploadErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (selectedMachineId) {
        formData.append('machineId', selectedMachineId);
      }
      formData.append('plantId', effectivePlantId);
      formData.append('assetType', selectedAssetType);
      if (uploadDescription) {
        formData.append('description', uploadDescription);
      }

      setUploadProgress(50);

      const res = await apiFetch('/api/v1/visual/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(85);

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || 'Failed to upload asset.');
      }

      setUploadProgress(100);
      setUploadState('SUCCESS');
      setNewlyUploadedAsset(json.data);
      fetchStoredAssets();
    } catch (err: any) {
      setUploadState('ERROR');
      setUploadErrorMessage(err.message || 'An unexpected error occurred during file upload.');
    }
  };

  const handleResetUploadModal = () => {
    setUploadFile(null);
    setSelectedMachineId('');
    setSelectedAssetType('PHOTOGRAPH');
    setUploadDescription('');
    setUploadState('IDLE');
    setUploadProgress(0);
    setUploadErrorMessage(null);
    setNewlyUploadedAsset(null);
  };

  const handleInspectUploadedAsset = async () => {
    if (!newlyUploadedAsset) return;
    setIsUploadModalOpen(false);

    // If it's a visual format, run inspection
    const isImageFormat = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(
      newlyUploadedAsset.mimeType.toLowerCase()
    );

    if (isImageFormat) {
      setIsProcessing(true);
      try {
        const res = await apiFetch('/api/v1/visual/inspect', {
          method: 'POST',
          body: JSON.stringify({
            plantId: effectivePlantId,
            visualAssetId: newlyUploadedAsset.id,
            query: customQuery,
          }),
        });
        const json = await res.json();
        if (json.success) {
          const data = json.data;
          const newResult: VisualInspectionResult = {
            id: data.visualAsset?.id || newlyUploadedAsset.id,
            name: newlyUploadedAsset.filename,
            category: newlyUploadedAsset.assetType as any,
            filename: newlyUploadedAsset.filename,
            imageUrl: `/api/v1/visual/assets/${newlyUploadedAsset.id}/image`,
            query: customQuery,
            plantCode: plants[0]?.code || 'PLANT-PRIMARY',
            assetTag: data.detectedTags?.[0] || 'ASSET-IDENTIFIED',
            description: data.visualDescription || newlyUploadedAsset.description || 'Inspected visual asset',
            detectedTags: data.detectedTags || [],
            components: (data.connectedComponents || []).map((c: any) => ({
              id: c.id || `comp-${Math.random()}`,
              label: c.label,
              equipmentTag: c.equipmentTag,
              confidence: c.confidence,
              bbox: c.bbox,
              sourceReference: c.sourceReference,
            })),
            isAmbiguous: !!data.isAmbiguousDiagram,
            ambiguityReason: data.isAmbiguousDiagram ? data.answer : undefined,
            isInsufficientEvidence: !!data.isInsufficientEvidence,
            confidence: (data.confidence as any) || 'HIGH',
            modelUsed: data.modelUsed || 'forgex-local-vision-v1',
            processingMethod: data.processingMethod || 'LOCAL_VISION_MODEL',
            answer: data.answer || 'Visual inspection complete.',
            processingStatus: 'PROCESSED',
            structuredAnalysis: data.structuredAnalysis,
            crossRetrievedCitations: (data.crossRetrievedManualCitations || []).map((cit: any) => ({
              documentNumber: cit.documentNumber,
              documentTitle: cit.documentTitle || cit.documentNumber,
              pageNumber: cit.pageNumber,
              sectionHeading: cit.sectionHeading,
              snippet: cit.snippet,
            })),
          };
          setActiveScenario(newResult);
          setUploadedScenarios((prev) => [newResult, ...prev]);
        }
      } catch (err: any) {
        setUnsupportedError(err.message || 'Inspection failed');
      } finally {
        setIsProcessing(false);
      }
    } else {
      handleSelectStoredAsset(newlyUploadedAsset);
    }
  };

  const handleQuickInspectionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const previewUrl = URL.createObjectURL(file);
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('plantId', effectivePlantId);
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
      const newResult: VisualInspectionResult = {
        id: data.visualAsset?.id || `upload-${Date.now()}`,
        name: file.name,
        category: (data.visualAsset?.assetType as any) || 'PHOTOGRAPH',
        filename: file.name,
        imageUrl: previewUrl,
        query: customQuery,
        plantCode: plants[0]?.code || 'PLANT-PRIMARY',
        assetTag: data.detectedTags?.[0] || 'ASSET-IDENTIFIED',
        description: data.visualDescription || data.visualAsset?.description || 'Visual walkdown image processed',
        detectedTags: data.detectedTags || [],
        components: (data.connectedComponents || []).map((c: any) => ({
          id: c.id || `comp-${Math.random()}`,
          label: c.label,
          equipmentTag: c.equipmentTag,
          confidence: c.confidence,
          bbox: c.bbox,
          sourceReference: c.sourceReference,
        })),
        isAmbiguous: !!data.isAmbiguousDiagram,
        ambiguityReason: data.isAmbiguousDiagram ? data.answer : undefined,
        isInsufficientEvidence: !!data.isInsufficientEvidence,
        confidence: (data.confidence as any) || 'HIGH',
        modelUsed: data.modelUsed || 'forgex-local-vision-v1',
        processingMethod: data.processingMethod || 'LOCAL_VISION_MODEL',
        answer: data.answer || 'Visual inspection complete.',
        processingStatus: 'PROCESSED',
        structuredAnalysis: data.structuredAnalysis,
        crossRetrievedCitations: (data.crossRetrievedManualCitations || []).map((cit: any) => ({
          documentNumber: cit.documentNumber,
          documentTitle: cit.documentTitle || cit.documentNumber,
          pageNumber: cit.pageNumber,
          sectionHeading: cit.sectionHeading,
          snippet: cit.snippet,
        })),
      };

      setActiveScenario(newResult);
      setUploadedScenarios((prev) => [newResult, ...prev]);
    } catch (err: any) {
      setUnsupportedError(err.message || 'Failed to inspect visual asset');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteQuery = async () => {
    if (!customQuery || !activeScenario) return;
    setIsProcessing(true);
    setUnsupportedError(null);
    try {
      const res = await apiFetch('/api/v1/visual/inspect', {
        method: 'POST',
        body: JSON.stringify({
          plantId: effectivePlantId,
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
      setActiveScenario((prev) =>
        prev
          ? {
              ...prev,
              query: customQuery,
              answer: data.answer,
              confidence: data.confidence as any,
              isAmbiguous: data.isAmbiguousDiagram,
              isInsufficientEvidence: data.isInsufficientEvidence,
              structuredAnalysis: data.structuredAnalysis,
              crossRetrievedCitations: (data.crossRetrievedManualCitations || []).map((cit: any) => ({
                documentNumber: cit.documentNumber,
                documentTitle: cit.documentTitle || cit.documentNumber,
                pageNumber: cit.pageNumber,
                sectionHeading: cit.sectionHeading,
                snippet: cit.snippet,
              })),
            }
          : null
      );
    } catch (err: any) {
      setUnsupportedError(err.message || 'Failed to re-execute visual query');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans antialiased">
      {/* Top Scenario Switcher & Header */}
      <div className="p-3 border-b border-[#E2E8F0] bg-white flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-sm font-sans font-bold text-[#1A202C]">
              Visual Intelligence & Multimodal Reasoning
            </h1>
            <p className="text-[11px] font-sans text-[#64748B]">
              Real-time component detection · Bounding boxes · Sourced OEM cross-referencing
            </p>
          </div>
        </div>

        {/* Uploaded History & Stored Assets Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[55%]">
          {storedAssets.length === 0 && uploadedScenarios.length === 0 ? (
            <span className="text-xs font-mono text-[#94A3B8] italic">
              No assets in storage yet
            </span>
          ) : (
            <>
              {storedAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelectStoredAsset(asset)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition border truncate max-w-[180px] flex items-center gap-1.5 ${
                    activeScenario?.id === asset.id
                      ? 'bg-[#151C24] text-white border-[#151C24] font-semibold shadow-xs'
                      : 'bg-white hover:bg-slate-50 text-[#1A202C] border-[#CBD5E1]'
                  }`}
                  title={`${asset.filename} (${asset.processingStatus || 'UPLOADED'})`}
                >
                  <span className="truncate">{asset.filename}</span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                      asset.processingStatus === 'PROCESSED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : asset.processingStatus === 'PROCESSING'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {asset.processingStatus || 'UPLOADED'}
                  </span>
                </button>
              ))}
              {uploadedScenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectScenario(s)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition border truncate max-w-[160px] ${
                    activeScenario?.id === s.id
                      ? 'bg-[#151C24] text-white border-[#151C24] font-semibold shadow-xs'
                      : 'bg-white hover:bg-slate-50 text-[#1A202C] border-[#CBD5E1]'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => {
              handleResetUploadModal();
              setIsUploadModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-white" />
            <span>Upload Engineering Asset</span>
            {isOwnerOrAdmin && (
              <span className="ml-1 px-1.5 py-0.2 rounded bg-blue-800 text-[9px] text-blue-100 uppercase tracking-wider font-mono">
                Admin
              </span>
            )}
          </Button>
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition border border-slate-300 shadow-xs">
            <ImageIcon className="w-3.5 h-3.5 text-slate-600" />
            <span>Quick AI Inspect</span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={handleQuickInspectionUpload}
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
            title="Visual Processing Notice"
            message={unsupportedError}
            onDismiss={() => setUnsupportedError(null)}
          />
        </div>
      )}

      {/* Main Split: Visual Canvas (Left) + Evidence / SOP Cross-Retrieval (Right) */}
      {!activeScenario ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F5F6F7]">
          <div className="max-w-md w-full bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-10 shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-[#1A202C] mb-1">
              Industrial Engineering Resources & Visual Intelligence
            </h2>
            <p className="text-xs text-[#64748B] mb-6 leading-relaxed text-center">
              Upload machine photographs, P&ID schematics, engineering drawings, or 3D CAD models. Only authorized administrators may persist engineering resources to the secure private vault.
            </p>
            <button
              onClick={() => {
                handleResetUploadModal();
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#151C24] hover:bg-black text-white text-xs font-semibold transition shadow-sm"
            >
              <Upload className="w-4 h-4 text-white" />
              <span>Upload Machine Resource & Asset</span>
            </button>
            <span className="text-[10px] font-mono text-[#94A3B8] mt-3">
              Supported Formats: PNG, JPEG, WebP, PDF, SVG, GLB, GLTF, STEP, STL, OBJ (Max 50MB)
            </span>
          </div>
        </div>
      ) : (
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
              <div className="absolute inset-0 bg-grid-pattern opacity-10" />

              <div
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
                className="relative transition-transform duration-200 w-full max-w-xl aspect-[4/3] rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] shadow-md p-6 flex flex-col justify-between"
              >
                <div className="flex justify-between items-center text-[10px] font-mono text-[#64748B] border-b border-[#E2E8F0] pb-2">
                  <span className="font-semibold text-[#1A202C] truncate max-w-xs">
                    {activeScenario.filename}
                  </span>
                  <span className="text-[#2563EB] font-bold">TAG: {activeScenario.assetTag}</span>
                </div>

                <div className="relative flex-1 flex items-center justify-center my-4 border border-dashed border-[#CBD5E1] rounded-lg bg-white overflow-hidden shadow-inner">
                  {activeScenario.imageUrl ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img
                        src={activeScenario.imageUrl}
                        alt={activeScenario.filename}
                        className="max-w-full max-h-full object-contain"
                      />
                      {showBoundingBoxes &&
                        activeScenario.components.map((comp) => {
                          if (!comp.bbox) return null;
                          const isSelected = selectedComponentId === comp.id;
                          return (
                            <div
                              key={comp.id}
                              onClick={() => setSelectedComponentId(comp.id)}
                              style={{
                                left: `${(comp.bbox.x1 / 1000) * 100}%`,
                                top: `${(comp.bbox.y1 / 1000) * 100}%`,
                                width: `${((comp.bbox.x2 - comp.bbox.x1) / 1000) * 100}%`,
                                height: `${((comp.bbox.y2 - comp.bbox.y1) / 1000) * 100}%`,
                              }}
                              className={`absolute border-2 rounded transition-all cursor-pointer flex flex-col justify-between p-1 ${
                                isSelected
                                  ? 'border-[#2563EB] bg-blue-500/15 z-20 shadow-md ring-2 ring-blue-400'
                                  : comp.confidence >= 0.7
                                  ? 'border-[#2563EB] bg-blue-500/10 hover:border-[#1D4ED8] z-10'
                                  : 'border-slate-400 bg-slate-200/40 border-dashed'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span
                                  className={`text-[8px] font-mono font-bold px-1 rounded ${
                                    comp.confidence >= 0.7
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
                  ) : activeScenario.isInsufficientEvidence ? (
                    <div className="text-center p-6 space-y-2">
                      <AlertOctagon className="w-10 h-10 text-rose-500 mx-auto opacity-70" />
                      <p className="text-xs font-mono text-rose-600 font-semibold">
                        INSUFFICIENT VISUAL EVIDENCE
                      </p>
                      <p className="text-[11px] text-[#64748B] max-w-sm">
                        Low-contrast or uninformative frame. No identifiable plant equipment tags detected.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center p-6 text-xs text-[#64748B]">
                      <Layers className="w-8 h-8 text-[#2563EB] mx-auto mb-2 opacity-50" />
                      Visual extraction completed for {activeScenario.filename}
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-[10px] font-mono text-[#64748B] border-t border-[#E2E8F0] pt-2">
                  <span>MODEL: {activeScenario.modelUsed}</span>
                  <span>EXTRACTION: {activeScenario.processingMethod}</span>
                </div>
              </div>
            </div>

            {/* Disclaimers & Alert Banners */}
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
            {/* Document Ingestion & RAG Pipeline Lifecycle Card */}
            <Card>
              <CardHeader>
                <CardTitle>Ingestion & RAG Lifecycle</CardTitle>
                <StatusBadge
                  label={
                    activeScenario.processingStatus === 'INDEXED' || activeScenario.processingStatus === 'PROCESSED'
                      ? 'INDEXED IN RAG'
                      : activeScenario.processingStatus === 'PROCESSING' || activeScenario.processingStatus === 'INDEXING' || activeScenario.processingStatus === 'EXTRACTED'
                      ? 'PROCESSING / INDEXING'
                      : activeScenario.processingStatus === 'UNSUPPORTED_FORMAT'
                      ? '3D CAD GEOMETRY'
                      : activeScenario.processingStatus === 'FAILED'
                      ? 'EXTRACTION FAILED'
                      : 'UPLOADED (PENDING EXTRACTION)'
                  }
                  tone={
                    (activeScenario.processingStatus === 'INDEXED' || activeScenario.processingStatus === 'PROCESSED'
                      ? 'healthy'
                      : activeScenario.processingStatus === 'FAILED'
                      ? 'critical'
                      : activeScenario.processingStatus === 'UNSUPPORTED_FORMAT'
                      ? 'warning'
                      : 'neutral') as StatusTone
                  }
                />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[#64748B]">Document Format:</span>
                  <span className="font-semibold text-[#1A202C] uppercase">{activeScenario.category}</span>
                </div>

                {activeScenario.category === 'CAD_MODEL' ? (
                  <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 text-xs font-mono space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span>Dedicated CAD Engine Required</span>
                    </div>
                    <p className="text-[11px] text-purple-700 leading-relaxed">
                      3D CAD geometric files are securely stored in the engineering vault. They require specialized 3D viewers rather than text RAG vector indexing.
                    </p>
                  </div>
                ) : (
                  <>
                    {activeScenario.processingStatus !== 'INDEXED' && isOwnerOrAdmin && (
                      <Button
                        size="sm"
                        disabled={isProcessingDoc}
                        onClick={() => handleProcessDocument(activeScenario.id)}
                        className="w-full bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 py-2"
                      >
                        {isProcessingDoc ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Parsing & Indexing into Knowledge Hub...</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              {activeScenario.processingStatus === 'FAILED'
                                ? 'Retry Document Processing & Indexing'
                                : 'Extract & Index to Knowledge Hub / RAG'}
                            </span>
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}

                {docProcessingFeedback && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono flex items-start gap-2 ${
                      docProcessingFeedback.tone === 'healthy'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    {docProcessingFeedback.tone === 'healthy' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{docProcessingFeedback.message}</span>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      const isLinked = comp.confidence >= 0.7;
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

            {/* Safety Escalation Alert Banner */}
            {activeScenario.structuredAnalysis?.safetyEscalationWarnings &&
              activeScenario.structuredAnalysis.safetyEscalationWarnings.length > 0 && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wider">
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                    <span>Mandatory Industrial Safety Escalation Notice</span>
                  </div>
                  <p className="text-xs text-red-700 font-medium">
                    Strict adherence to facility Lockout/Tagout (LOTO) protocols required. Do NOT touch, open, or energize equipment.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-red-800 font-mono">
                    {activeScenario.structuredAnalysis.safetyEscalationWarnings.map((warning, wIdx) => (
                      <li key={wIdx} className="font-semibold">{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Directly Visible Observations */}
            {activeScenario.structuredAnalysis?.visibleObservations &&
              activeScenario.structuredAnalysis.visibleObservations.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <CardTitle>Directly Visible Observations</CardTitle>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          Evidence Grounded
                        </span>
                      </div>
                      <StatusBadge label="VERIFIED VISUAL" tone="healthy" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {activeScenario.structuredAnalysis.visibleSummary && (
                      <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-sans">
                        {activeScenario.structuredAnalysis.visibleSummary}
                      </div>
                    )}
                    <div className="space-y-2">
                      {activeScenario.structuredAnalysis.visibleObservations.map((obs, obsIdx) => (
                        <div
                          key={obs.id || obsIdx}
                          className="p-2.5 rounded-lg border border-slate-200 bg-white flex flex-col gap-1 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">{obs.observation}</span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold shrink-0 ${
                                obs.severityHint === 'CRITICAL'
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : obs.severityHint === 'WARNING'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {obs.category.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {obs.locationDescription && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              Location: {obs.locationDescription}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Potential Hypotheses (Unconfirmed Root Cause) */}
            {activeScenario.structuredAnalysis?.hypotheses &&
              activeScenario.structuredAnalysis.hypotheses.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <CardTitle>Potential Hypotheses</CardTitle>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold uppercase">
                          Unconfirmed Root Cause
                        </span>
                      </div>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <p className="text-[11px] text-amber-800 bg-amber-50/80 p-2 rounded border border-amber-200">
                      <strong>Industrial Safety Rule:</strong> Photographic observations provide hypotheses only and do NOT constitute confirmed diagnosis. Physical walkdown required.
                    </p>
                    <ul className="space-y-1.5 pl-1">
                      {activeScenario.structuredAnalysis.hypotheses.map((hyp, hIdx) => (
                        <li key={hIdx} className="flex items-start gap-2 text-slate-800">
                          <span className="text-amber-600 font-bold mt-0.5">•</span>
                          <span>{hyp}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

            {/* Recommended Physical Verification Steps */}
            {activeScenario.structuredAnalysis?.recommendedVerificationSteps &&
              activeScenario.structuredAnalysis.recommendedVerificationSteps.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <CardTitle>Recommended Physical Verification Steps</CardTitle>
                        <ClipboardList className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {activeScenario.structuredAnalysis.recommendedVerificationSteps.length} Actions
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="space-y-1.5">
                      {activeScenario.structuredAnalysis.recommendedVerificationSteps.map((step, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-sans"
                        >
                          <CheckSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Photographic Limitations Notice */}
            {activeScenario.structuredAnalysis?.limitations &&
              activeScenario.structuredAnalysis.limitations.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                    <Info className="w-3.5 h-3.5 text-slate-600" />
                    <span>Analysis Limitations & Constraints</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-slate-600">
                    {activeScenario.structuredAnalysis.limitations.map((lim, lIdx) => (
                      <li key={lIdx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}

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
      )}

      {/* Upload Machine Engineering & Visual Asset Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1A202C]">
                    Upload Machine Engineering Resource
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Secure, tenant-isolated storage with content validation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Permission Check Notice if Non-Admin */}
              {!isOwnerOrAdmin ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Administrator Permission Required</span>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Under ForgeX AI security controls, only authorized company administrators (Owner / Admin) are permitted to upload machine engineering resources, drawings, P&IDs, and 3D CAD models.
                  </p>
                  <p className="text-[11px] font-mono text-amber-600">
                    Your current role: <strong>{membership?.role || 'TECHNICIAN / WORKER'}</strong>. Contact an organization administrator to upload new files.
                  </p>
                  <div className="pt-2 flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => setIsUploadModalOpen(false)}
                      className="bg-amber-800 hover:bg-amber-900 text-white text-xs"
                    >
                      Understood
                    </Button>
                  </div>
                </div>
              ) : uploadState === 'SUCCESS' && newlyUploadedAsset ? (
                <div className="space-y-4 text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1A202C]">
                      File Successfully Stored in Vault
                    </h4>
                    <p className="text-xs text-[#64748B] mt-1">
                      File <span className="font-mono font-semibold text-[#1A202C]">{newlyUploadedAsset.filename}</span> was validated and stored.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-left text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Storage Status:</span>
                      <span className="font-bold text-amber-600 px-2 py-0.5 rounded bg-amber-50 border border-amber-200">
                        {newlyUploadedAsset.processingStatus || 'UPLOADED'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">MIME Type:</span>
                      <span className="text-[#1A202C]">{newlyUploadedAsset.mimeType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Size:</span>
                      <span className="text-[#1A202C]">{(newlyUploadedAsset.fileSizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                    {newlyUploadedAsset.machineId && (
                      <div className="flex justify-between">
                        <span className="text-[#64748B]">Machine Link:</span>
                        <span className="text-[#2563EB]">{newlyUploadedAsset.machineId}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-[11px] text-left font-mono">
                    <strong>Processing Notice:</strong> Asset is stored with status <code className="font-bold">UPLOADED</code>. Raw file is secured in private storage. Full OCR/AI analysis has not yet been executed.
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleResetUploadModal();
                        setIsUploadModalOpen(false);
                      }}
                    >
                      Done
                    </Button>
                    {['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(newlyUploadedAsset.mimeType.toLowerCase()) && (
                      <Button
                        size="sm"
                        onClick={handleInspectUploadedAsset}
                        className="bg-[#2563EB] hover:bg-blue-700 text-white"
                      >
                        Inspect with AI Now
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {uploadState === 'ERROR' && uploadErrorMessage && (
                    <AlertBanner
                      tone="error"
                      title="Upload Validation Error"
                      message={uploadErrorMessage}
                      onDismiss={() => setUploadErrorMessage(null)}
                    />
                  )}

                  {/* Machine Linkage Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-[#64748B] uppercase font-semibold flex items-center justify-between">
                      <span>Associated Machine (Tenant Isolation)</span>
                      <span className="text-[10px] text-slate-400 normal-case">Optional</span>
                    </label>
                    <select
                      value={selectedMachineId}
                      onChange={(e) => setSelectedMachineId(e.target.value)}
                      disabled={uploadState === 'UPLOADING'}
                      className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A202C] font-mono focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="">General Plant Resource (No Machine Linked)</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.assetTag || m.name || m.id} — {m.model || m.category || 'Industrial Unit'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Asset Category */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-[#64748B] uppercase font-semibold">
                      Engineering Asset Category
                    </label>
                    <select
                      value={selectedAssetType}
                      onChange={(e) => setSelectedAssetType(e.target.value as VisualAssetType)}
                      disabled={uploadState === 'UPLOADING'}
                      className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A202C] font-mono focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="PHOTOGRAPH">Machine Photograph / Physical Walkdown</option>
                      <option value="PID_RENDER">P&ID Engineering Schematic</option>
                      <option value="ENGINEERING_DRAWING">Engineering Drawing (CAD / Vector / Blueprint)</option>
                      <option value="CAD_MODEL">3D CAD Model (GLB / STEP / STL / OBJ)</option>
                      <option value="MANUAL_PAGE">Technical Manual Page / Manufacturer Spec</option>
                      <option value="DIAGRAM">Electrical / Wiring Diagram</option>
                    </select>
                  </div>

                  {/* File Selection Zone */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-[#64748B] uppercase font-semibold">
                      Select Engineering / Visual File
                    </label>
                    <div className="relative border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] rounded-xl p-6 text-center bg-[#F8FAFC] transition">
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.glb,.gltf,.step,.stp,.stl,.obj"
                        disabled={uploadState === 'UPLOADING'}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setUploadFile(f);
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="space-y-2 pointer-events-none">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
                          <Upload className="w-5 h-5" />
                        </div>
                        {uploadFile ? (
                          <div>
                            <p className="text-xs font-bold font-mono text-[#1A202C]">
                              {uploadFile.name}
                            </p>
                            <p className="text-[11px] font-mono text-[#64748B]">
                              {(uploadFile.size / 1024 / 1024).toFixed(2)} MB · {uploadFile.type || 'Custom Format'}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold text-[#1A202C]">
                              Drag & drop or click to browse
                            </p>
                            <p className="text-[10px] text-[#64748B] mt-1">
                              Supported: PNG, JPEG, WebP, PDF, SVG, GLB, GLTF, STEP, STL, OBJ (Max 50MB)
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Optional Description */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-[#64748B] uppercase font-semibold flex items-center justify-between">
                      <span>Description / Engineering Notes</span>
                      <span className="text-[10px] text-slate-400 normal-case">Optional</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Hydraulic pump nameplate walkdown, Main bearing exploded view"
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      disabled={uploadState === 'UPLOADING'}
                      className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  {/* Upload Progress Indicator */}
                  {uploadState === 'UPLOADING' && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono text-[#64748B]">
                        <span>Validating content signatures & storing...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploadState === 'UPLOADING'}
                      onClick={() => setIsUploadModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!uploadFile || uploadState === 'UPLOADING'}
                      onClick={handlePerformUpload}
                      className="bg-[#2563EB] hover:bg-blue-700 text-white inline-flex items-center gap-1.5"
                    >
                      {uploadState === 'UPLOADING' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload & Secure File</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

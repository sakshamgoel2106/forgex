import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Machine, ComponentMapping, EngineeringModel3D } from '@forgex/shared-types';
import {
  Layers,
  RefreshCw,
  AlertCircle,
  FileText,
  Compass,
  X,
  BoxSelect,
  ShieldAlert,
  Upload,
  CheckCircle2,
  Sliders,
  Download,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

const ThreeDModelViewer = React.lazy(() =>
  import('./ThreeDModelViewer').then((m) => ({ default: m.ThreeDModelViewer }))
);

export interface RealThreeDViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  mappings: ComponentMapping[];
  initialModel?: EngineeringModel3D | null;
  initialModelId?: string | null;
  fileUrl?: string | null;
  onOpenPid?: (tag: string) => void;
  onOpenManual?: (pageNumber: number) => void;
  onMappingVerified?: () => void;
  onMachineUpdated?: (updated: Machine) => void;
}

interface ComponentNode {
  id: string;
  name: string;
  vertexCount?: number;
}

interface ModelStats {
  vertexCount: number;
  meshCount: number;
  dimensions: string;
}

interface UnsupportedFormatState {
  format: string;
  message: string;
  downloadUrl?: string;
}

export const RealThreeDViewerModal: React.FC<RealThreeDViewerModalProps> = ({
  isOpen,
  onClose,
  machine,
  mappings,
  initialModel,
  initialModelId,
  fileUrl,
  onOpenPid,
  onOpenManual,
  onMappingVerified,
  onMachineUpdated,
}) => {
  const { isOwnerOrAdmin, membership, token, organization } = useAuth();
  const isEngineer = isOwnerOrAdmin || membership?.role === 'ENGINEER' || membership?.role === 'PLANT_MANAGER';

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const orgId = organization?.id || (machine as any)?.organizationId || (machine as any)?.organization_id;
    if (orgId) headers['x-organization-id'] = orgId;
    return headers;
  }, [token, organization?.id, machine]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [componentList, setComponentList] = useState<ComponentNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unsupportedFormat, setUnsupportedFormat] = useState<UnsupportedFormatState | null>(null);
  const [modelRecord, setModelRecord] = useState<EngineeringModel3D | null>(null);
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [verifyingMappingId, setVerifyingMappingId] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const handleModelStats = useCallback((stats: { vertexCount: number; meshCount: number; dimensions: string }) => {
    setModelStats(stats);
  }, []);

  const handleComponentList = useCallback((extracted: Array<{ id: string; name: string; vertexCount: number }>) => {
    setComponentList(
      extracted.map((c) => ({
        id: c.id,
        name: c.name,
        vertexCount: c.vertexCount,
      }))
    );
  }, []);

  // 1. Fetch approved model record for this machine
  useEffect(() => {
    if (!isOpen) {
      setModelRecord(null);
      setIsLoading(false);
      setLoadError(null);
      setUnsupportedFormat(null);
      return;
    }

    if (initialModel) {
      setModelRecord(initialModel);
      setIsLoading(false);
      setLoadError(null);
      setUnsupportedFormat(null);
      return;
    }

    if (!machine && !initialModelId) {
      setModelRecord(null);
      setIsLoading(false);
      setLoadError(null);
      setUnsupportedFormat(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    setUnsupportedFormat(null);

    const fetchModel = async () => {
      try {
        const headers = getAuthHeaders();

        // 0. If initialModelId is provided, query it directly
        if (initialModelId) {
          const directRes = await fetch(`/api/v1/engineering/models/${initialModelId}`, { headers });
          if (directRes.ok) {
            const directJson = await directRes.json();
            if (directJson.success && directJson.data) {
              if (isMounted) {
                setModelRecord(directJson.data);
                setIsLoading(false);
              }
              return;
            }
          }
        }

        if (!machine) {
          if (isMounted) {
            setModelRecord(null);
            setIsLoading(false);
          }
          return;
        }

        // 1. First attempt to fetch the machine's primary model from the dedicated endpoint
        const machRes = await fetch(`/api/v1/engineering/machines/${machine.id}/3d-model`, { headers });
        if (machRes.ok) {
          const machJson = await machRes.json();
          if (machJson.success && machJson.data?.primaryModel) {
            if (isMounted) {
              setModelRecord(machJson.data.primaryModel);
              setIsLoading(false);
            }
            return;
          }
        }

        // 2. Fall back to listing models by machineId
        const res = await fetch(`/api/v1/engineering/models?machineId=${machine.id}`, { headers });
        if (!res.ok) {
          if (isMounted) {
            setModelRecord(null);
            setIsLoading(false);
          }
          return;
        }

        const json = await res.json();
        if (isMounted) {
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const approved = json.data.find((m: EngineeringModel3D) => m.status === 'APPROVED') || json.data[0];
            setModelRecord(approved);
          } else {
            setModelRecord(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to query engineering models:', err);
        if (isMounted) {
          setModelRecord(null);
          setIsLoading(false);
        }
      }
    };

    fetchModel();

    return () => {
      isMounted = false;
    };
  }, [isOpen, machine, initialModel, initialModelId, token]);

  const [isStreaming, setIsStreaming] = useState(false);

  // 2. Fetch authenticated binary blob stream to render with zero CORS issues
  const fetchBlob = useCallback(async () => {
    if (!modelRecord) return;

    // STEP/STP formats cannot be rendered directly in Three.js without conversion to GLB
    const isStep = ['STEP', 'STP', 'IGES', 'IGS'].includes(modelRecord.fileFormat?.toUpperCase() || '');
    if (isStep && !modelRecord.convertedStorageKey) {
      setUnsupportedFormat({
        format: modelRecord.fileFormat,
        message: `B-Rep CAD format '${modelRecord.fileFormat}' cannot be rendered directly in web 3D viewers. Download original CAD file for desktop CAD tools.`,
        downloadUrl: `/api/v1/engineering/models/${modelRecord.id}/download`,
      });
      return;
    }

    try {
      setIsStreaming(true);
      setLoadError(null);
      setUnsupportedFormat(null);
      const headers = getAuthHeaders();

      const res = await fetch(`/api/v1/engineering/models/${modelRecord.id}/content`, { headers });
      if (res.status === 422) {
        const errData = await res.json().catch(() => ({}));
        setUnsupportedFormat({
          format: modelRecord.fileFormat,
          message: errData.error?.message || 'Unsupported format for direct browser rendering.',
          downloadUrl: errData.error?.downloadUrl,
        });
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Failed to stream 3D CAD model (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setBlobUrl((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return objUrl;
      });
    } catch (err: any) {
      console.warn('Failed to stream model content blob:', err);
      setLoadError(err.message || 'Failed to stream 3D CAD model');
    } finally {
      setIsStreaming(false);
    }
  }, [modelRecord, getAuthHeaders]);

  useEffect(() => {
    if (!isOpen || !modelRecord) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }

    // If an in-memory blob URL is already active, don't re-fetch
    if (blobUrl && blobUrl.startsWith('blob:')) {
      return;
    }

    fetchBlob();
  }, [isOpen, modelRecord?.id, fetchBlob]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleVerifyCrossLink = async (mappingId: string) => {
    if (!token || !machine) return;
    try {
      setVerifyingMappingId(mappingId);
      const res = await fetch(`/api/v1/machines/${machine.id}/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'VERIFIED' }),
      });

      if (res.ok) {
        onMappingVerified?.();
      }
    } catch (err) {
      console.error('Failed to verify mapping:', err);
    } finally {
      setVerifyingMappingId(null);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetMachine = machine || currentMachine;
    if (!file || !targetMachine) return;
    setIsUploading(true);
    setLoadError(null);
    setUnsupportedFormat(null);

    // Instant local preview for immediate visual feedback
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isStep = ext === 'step' || ext === 'stp';
    let localBlobUrl: string | null = null;
    if (!isStep) {
      localBlobUrl = URL.createObjectURL(file);
      setBlobUrl(localBlobUrl);
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/v1/engineering/machines/${targetMachine.id}/3d-model/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to upload 3D model');
      }

      const model = json.data?.model;
      if (model) {
        setModelRecord(model);
        const updatedMachine: Machine = {
          ...targetMachine,
          hasModel3d: true,
          model3dFormat: ext as any,
          model3dFile: { name: file.name, size: file.size, type: file.type },
        };
        onMachineUpdated?.(updatedMachine);
      }
    } catch (err: any) {
      console.error('Failed to upload 3D model:', err);
      setLoadError(err.message || 'Failed to upload 3D model');
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
        setBlobUrl(null);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const currentMachine: Machine = machine || ({
    id: modelRecord?.machineId || initialModel?.machineId || '3d-asset',
    assetTag: modelRecord?.title || initialModel?.title || '3D-ASSET',
    name: modelRecord?.title || initialModel?.title || 'Industrial Machine',
    plantId: modelRecord?.plantId || initialModel?.plantId || 'PLANT-DEFAULT',
  } as Machine);

  if (!isOpen || (!machine && !modelRecord && !initialModel && !initialModelId)) return null;

  const selectedMapping = mappings.find(
    (m) => m.componentId === selectedComponentId || m.componentName.toLowerCase().includes(selectedComponentId || '')
  );

  const activeModelUrl =
    blobUrl ||
    (fileUrl && (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')) ? fileUrl : '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="viewer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-2.5">
            <BoxSelect className="w-5 h-5 text-[#2563EB]" />
            <div>
              <div id="viewer-title" className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                Genuine 3D CAD Engineering Viewer • {currentMachine.assetTag}
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                {modelRecord ? `${modelRecord.title} (${modelRecord.fileFormat})` : 'Authorized Model Verification Check'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
              title="Upload or Replace 3D CAD Model"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : modelRecord ? 'Replace 3D Model' : 'Attach 3D Model'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
              aria-label="Close 3D viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept=".glb,.gltf,.step,.stp,.stl,.obj"
          style={{ display: 'none' }}
          onChange={handleUploadFile}
        />

        {/* Body Container */}
        {isLoading ? (
          <div className="h-[520px] flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] text-[#64748B]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
            <div className="text-xs font-mono">Verifying Authorized 3D CAD Artifacts for {currentMachine.assetTag}...</div>
          </div>
        ) : !modelRecord ? (
          /* Honest Missing-Model State */
          <div className="h-[520px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="max-w-lg space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                No Authorized 3D CAD Model Registered
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                ForgeX AI strictly prohibits generating speculative 3D meshes, decorative block substitutes, or unrelated stock CAD models for real industrial equipment.
              </p>
            </div>

            {/* Asset Metadata Ledger Card */}
            <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-4 text-left text-xs font-sans space-y-2 shadow-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Asset Tag:</span>
                <span className="font-bold text-[#1A202C] font-mono">{currentMachine.assetTag}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Equipment:</span>
                <span className="text-[#1A202C]">{currentMachine.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Manufacturer / Model:</span>
                <span className="text-[#1A202C]">
                  {currentMachine.manufacturer || 'Unknown'} / {currentMachine.modelNumber || 'Legacy'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-mono">3D CAD Readiness:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  NOT_ON_FILE
                </span>
              </div>
            </div>

            {/* Error Notification Banner if upload failed */}
            {loadError && (
              <div className="w-full max-w-md bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span className="truncate">{loadError}</span>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Attaching CAD Model...' : 'Upload 3D CAD Model (GLB / OBJ / STL)'}</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-medium transition shadow-sm"
              >
                Close Viewer
              </button>
            </div>
          </div>
        ) : unsupportedFormat ? (
          /* Honest Unsupported Format Banner */
          <div className="h-[520px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Info className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                B-Rep CAD Format: {unsupportedFormat.format}
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {unsupportedFormat.message}
              </p>
            </div>

            <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-4 text-left text-xs font-sans space-y-2 shadow-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Registered Asset:</span>
                <span className="font-bold text-[#1A202C]">{modelRecord.title}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Format:</span>
                <span className="font-bold font-mono text-[#2563EB]">{modelRecord.fileFormat}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">File Size:</span>
                <span className="font-mono text-[#1A202C]">{(modelRecord.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-mono">Web 3D Viewer Status:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  CONVERSION_REQUIRED
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <a
                href={`/api/v1/engineering/models/${modelRecord.id}/download`}
                download
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#151C24] hover:bg-black text-white text-xs font-semibold transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download Original CAD File ({modelRecord.fileFormat})
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-medium transition shadow-sm"
              >
                Close Viewer
              </button>
            </div>
          </div>
        ) : loadError ? (
          /* Error State */
          <div className="h-[520px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                3D CAD Geometry Load Error
              </h3>
              <p className="text-xs text-rose-700 font-mono bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
                {loadError}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => fetchBlob()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Loading
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-medium transition shadow-sm"
              >
                Close Viewer
              </button>
            </div>
          </div>
        ) : (
          /* Genuine 3D CAD Engineering Viewport (WebGL Canvas + R3F) */
          <div className="flex flex-col md:flex-row h-[550px] w-full bg-[#F5F6F7] overflow-hidden">
            {/* Viewport Canvas Container */}
            <div className="relative flex-1 h-full overflow-hidden flex flex-col bg-[#F1F5F9]">
              {/* Overlay Metadata Tag */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#CBD5E1] shadow-sm">
                <span className="text-[11px] font-mono font-bold text-[#1A202C] uppercase">{currentMachine.assetTag}</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">
                  {modelRecord.fileFormat} TWIN
                </span>
                {modelStats && (
                  <span className="text-[10px] font-mono text-[#64748B] hidden sm:inline">
                    {modelStats.dimensions}
                  </span>
                )}
              </div>

              {/* Viewport Toolbar */}
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#CBD5E1] shadow-sm">
                <button
                  type="button"
                  onClick={() => setWireframe(!wireframe)}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    wireframe ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-[#64748B] hover:text-[#1A202C]'
                  }`}
                  title="Toggle Wireframe Mode"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* WebGL Canvas Viewport powered by @react-three/fiber and @react-three/drei */}
              <div className="flex-1 w-full h-full relative overflow-hidden">
                {isStreaming || (!activeModelUrl && !loadError && !unsupportedFormat) ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                    <span className="text-xs font-mono font-bold mt-2 text-slate-700">Streaming 3D Twin...</span>
                    <span className="text-[10px] font-mono text-slate-500">Authenticating & Downloading {modelRecord?.fileFormat || 'GLB'} Geometry</span>
                  </div>
                ) : activeModelUrl ? (
                  <React.Suspense
                    fallback={
                      <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                        <span className="text-xs font-mono mt-2">Loading 3D Engine...</span>
                      </div>
                    }
                  >
                    <ThreeDModelViewer
                      fileUrl={activeModelUrl}
                      fileFormat={modelRecord.fileFormat}
                      wireframe={wireframe}
                      selectedComponentId={selectedComponentId}
                      onSelectComponent={setSelectedComponentId}
                      onModelStats={handleModelStats}
                      onComponentList={handleComponentList}
                      onRetry={fetchBlob}
                    />
                  </React.Suspense>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                    <span className="text-xs font-mono mt-2">Preparing 3D WebGL Canvas...</span>
                  </div>
                )}
              </div>

              {/* Viewport Footer */}
              <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-[11px] text-[#64748B]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Orbit: Left Click • Pan: Right Click • Zoom: Wheel</span>
                </div>
                <div className="font-mono text-[10px] flex items-center gap-3">
                  <span>Components: {componentList.length}</span>
                  {modelStats && <span>Vertices: {modelStats.vertexCount.toLocaleString()}</span>}
                </div>
              </div>
            </div>

            {/* Right Side: Component Hierarchy & Verified Cross-Linking */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#E2E8F0] bg-white flex flex-col justify-between overflow-hidden">
              <div className="p-3.5 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#2563EB]" />
                  <span className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                    Assembly Hierarchy
                  </span>
                </div>
                <p className="text-[10px] text-[#64748B] mt-0.5">Click components in viewport or select below</p>
              </div>

              {/* Hierarchy List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {componentList.map((comp) => {
                  const isSelected = selectedComponentId === comp.id;
                  const mapping = mappings.find(
                    (m) => m.componentId === comp.id || m.componentName.toLowerCase().includes(comp.id.toLowerCase())
                  );

                  return (
                    <button
                      key={comp.id}
                      onClick={() => setSelectedComponentId(comp.id)}
                      className={`w-full text-left p-2 rounded-xl text-xs font-mono transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-50 text-[#2563EB] border border-blue-200'
                          : 'text-[#1A202C] hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium truncate">{comp.name}</div>
                        {comp.vertexCount !== undefined && (
                          <div className="text-[9px] text-[#94A3B8] font-normal">{comp.vertexCount} vertices</div>
                        )}
                      </div>
                      {mapping && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            mapping.status === 'VERIFIED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {mapping.pidTag}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected Component Inspection & Verified Cross-Link */}
              <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                {selectedComponentId ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Selected Node</div>
                      <div className="text-xs font-bold text-[#1A202C] mt-0.5">
                        {componentList.find((c) => c.id === selectedComponentId)?.name}
                      </div>
                    </div>

                    {selectedMapping ? (
                      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2.5 text-xs shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">P&ID Drawing Tag:</span>
                          <span className="font-mono font-bold text-[#2563EB]">{selectedMapping.pidTag}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">Cross-Link Status:</span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              selectedMapping.status === 'VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {selectedMapping.status}
                          </span>
                        </div>

                        {selectedMapping.status === 'SUGGESTED' && (
                          <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-800 leading-tight">
                            AI suggestions must not be marked confirmed without an authorized engineering review.
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="pt-2 border-t border-[#E2E8F0] flex flex-col gap-1.5">
                          {onOpenPid && (
                            <button
                              onClick={() => onOpenPid(selectedMapping.pidTag)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-medium transition"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              View on P&ID ({selectedMapping.pidTag})
                            </button>
                          )}

                          {selectedMapping.manualPageNumber && onOpenManual && (
                            <button
                              onClick={() => onOpenManual(selectedMapping.manualPageNumber!)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-medium transition"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Open Manual Page {selectedMapping.manualPageNumber}
                            </button>
                          )}

                          {isEngineer && selectedMapping.status === 'SUGGESTED' && (
                            <button
                              disabled={verifyingMappingId === selectedMapping.id}
                              onClick={() => handleVerifyCrossLink(selectedMapping.id)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[#151C24] text-white hover:bg-black text-[11px] font-bold transition shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {verifyingMappingId === selectedMapping.id ? 'Verifying...' : 'Approve & Confirm Cross-Link'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#64748B] italic flex items-center gap-1.5 bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        No explicit P&ID mapping configured for this 3D component.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-[#64748B]">
                    Click a component in the 3D viewport to inspect engineering cross-links.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RealThreeDViewerModal;

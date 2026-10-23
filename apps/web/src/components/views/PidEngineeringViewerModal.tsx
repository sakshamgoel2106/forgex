import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Machine, ComponentMapping, EngineeringDrawing } from '@forgex/shared-types';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Compass,
  FileText,
  Layers,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  Upload,
  RefreshCw,
  Download,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

interface PidEngineeringViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  mappings: ComponentMapping[];
  activeTag?: string | null;
  initialDrawingId?: string | null;
  initialDrawing?: EngineeringDrawing | null;
  plantName?: string | null;
  onSelectTag?: (tag: string) => void;
  onOpen3dComponent?: (componentId: string) => void;
  onOpenManual?: (pageNumber: number) => void;
  onMappingVerified?: () => void;
  onMachineUpdated?: (updated: Machine) => void;
}

export const PidEngineeringViewerModal: React.FC<PidEngineeringViewerModalProps> = ({
  isOpen,
  onClose,
  machine,
  mappings,
  activeTag,
  initialDrawingId,
  initialDrawing,
  plantName,
  onSelectTag,
  onOpen3dComponent,
  onOpenManual,
  onMappingVerified,
  onMachineUpdated,
}) => {
  const { token, isOwnerOrAdmin, membership } = useAuth();
  const isEngineer = isOwnerOrAdmin || membership?.role === 'ENGINEER' || membership?.role === 'PLANT_MANAGER';

  // Navigation & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Data & Drawings State
  const [drawingsList, setDrawingsList] = useState<EngineeringDrawing[]>([]);
  const [drawingRecord, setDrawingRecord] = useState<EngineeringDrawing | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [unsupportedInfo, setUnsupportedInfo] = useState<{ format: string; message: string; downloadUrl?: string } | null>(null);

  // Rendered Diagram Content
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Tag Selection & Search
  const [selectedTag, setSelectedTag] = useState<string | null>(activeTag || null);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [verifyingMappingId, setVerifyingMappingId] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // 1. Fetch Drawings for Machine
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      setDrawingsList([]);
      setDrawingRecord(null);
      setSvgContent(null);
      setImageBlobUrl(null);
      setPdfBlobUrl(null);
      setContentError(null);
      setUnsupportedInfo(null);
      setIsLoadingMetadata(false);
      return;
    }

    if (initialDrawing) {
      setDrawingsList([initialDrawing]);
      setDrawingRecord(initialDrawing);
      if (initialDrawing.equipmentTags && initialDrawing.equipmentTags.length > 0) {
        setSelectedTag(activeTag || initialDrawing.equipmentTags[0]);
      }
      setContentError(null);
      setUnsupportedInfo(null);
      setIsLoadingMetadata(false);
      return;
    }

    if (!machine && !initialDrawingId) {
      setDrawingsList([]);
      setDrawingRecord(null);
      setIsLoadingMetadata(false);
      return;
    }

    let isMounted = true;
    setIsLoadingMetadata(true);
    setContentError(null);
    setUnsupportedInfo(null);

    const fetchDrawings = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // 0. If initialDrawingId is provided, query it directly
        if (initialDrawingId) {
          const directRes = await fetch(`/api/v1/engineering/drawings/${initialDrawingId}`, { headers });
          if (directRes.ok) {
            const directJson = await directRes.json();
            if (directJson.success && directJson.data) {
              if (isMounted) {
                const d = directJson.data;
                setDrawingsList([d]);
                setDrawingRecord(d);
                if (d.equipmentTags && d.equipmentTags.length > 0) {
                  setSelectedTag(activeTag || d.equipmentTags[0]);
                }
                setIsLoadingMetadata(false);
              }
              return;
            }
          }
        }

        if (!machine) {
          if (isMounted) {
            setDrawingsList([]);
            setDrawingRecord(null);
            setIsLoadingMetadata(false);
          }
          return;
        }

        // 1. Dedicated machine P&ID endpoint that auto-links verified drawings
        const machRes = await fetch(`/api/v1/engineering/machines/${machine.id}/pid`, { headers });
        if (machRes.ok) {
          const machJson = await machRes.json();
          if (machJson.success && machJson.data) {
            const list: EngineeringDrawing[] = machJson.data.drawings || [];
            if (isMounted) {
              setDrawingsList(list);
              let chosen = list.find((d) => d.id === initialDrawingId) ||
                machJson.data.primaryDrawing ||
                list.find((d) => d.status === 'APPROVED') ||
                list[0] ||
                null;
              setDrawingRecord(chosen);
              if (chosen?.equipmentTags && chosen.equipmentTags.length > 0) {
                setSelectedTag(activeTag || chosen.equipmentTags[0]);
              }
              setIsLoadingMetadata(false);
            }
            return;
          }
        }

        // 2. Fall back to listing drawings by machineId
        const res = await fetch(`/api/v1/engineering/drawings?machineId=${machine.id}`, { headers });
        if (!res.ok) {
          if (isMounted) {
            setDrawingsList([]);
            setDrawingRecord(null);
            setIsLoadingMetadata(false);
          }
          return;
        }

        const json = await res.json();
        if (isMounted) {
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const list: EngineeringDrawing[] = json.data;
            setDrawingsList(list);

            let chosen = list.find((d) => d.id === initialDrawingId);
            if (!chosen) {
              chosen = list.find((d) => d.status === 'APPROVED' && (d.drawingType === 'PID' || d.fileFormat === 'SVG' || d.fileFormat === 'PDF')) ||
                list.find((d) => d.status === 'APPROVED') ||
                list[0];
            }
            setDrawingRecord(chosen || null);

            if (chosen?.equipmentTags && chosen.equipmentTags.length > 0) {
              setSelectedTag(activeTag || chosen.equipmentTags[0]);
            }
          } else {
            setDrawingsList([]);
            setDrawingRecord(null);
          }
          setIsLoadingMetadata(false);
        }
      } catch (err) {
        console.error('Failed to query engineering drawings:', err);
        if (isMounted) {
          setDrawingsList([]);
          setDrawingRecord(null);
          setIsLoadingMetadata(false);
        }
      }
    };

    fetchDrawings();

    return () => {
      isMounted = false;
    };
  }, [isOpen, machine, initialDrawingId, token, activeTag]);

  // --------------------------------------------------------------------------
  // 2. Fetch Actual Diagram Content when Drawing Changes
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!drawingRecord) {
      setSvgContent(null);
      setImageBlobUrl(null);
      setPdfBlobUrl(null);
      setContentError(null);
      setUnsupportedInfo(null);
      return;
    }

    let isMounted = true;
    setIsLoadingContent(true);
    setContentError(null);
    setUnsupportedInfo(null);
    setSvgContent(null);
    setImageBlobUrl(null);
    setPdfBlobUrl(null);

    // Reset pan and zoom for new drawing
    setZoom(1);
    setPan({ x: 0, y: 0 });

    const fetchContent = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/v1/engineering/drawings/${drawingRecord.id}/content`, { headers });

        if (res.status === 422) {
          const errJson = await res.json().catch(() => ({}));
          if (isMounted) {
            setUnsupportedInfo({
              format: drawingRecord.fileFormat,
              message: errJson?.error?.message || 'Unsupported format for browser rendering.',
              downloadUrl: errJson?.error?.downloadUrl,
            });
            setIsLoadingContent(false);
          }
          return;
        }

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `Failed to fetch diagram content (Status ${res.status})`);
        }

        const contentType = res.headers.get('content-type') || '';

        if (contentType.includes('svg')) {
          const svgText = await res.text();
          if (isMounted) {
            setSvgContent(svgText);
            setIsLoadingContent(false);
          }
        } else if (contentType.includes('pdf')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (isMounted) {
            setPdfBlobUrl(url);
            setIsLoadingContent(false);
          }
        } else if (contentType.startsWith('image/')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (isMounted) {
            setImageBlobUrl(url);
            setIsLoadingContent(false);
          }
        } else {
          // Fallback text or binary
          const text = await res.text();
          if (text.trim().startsWith('<svg')) {
            if (isMounted) {
              setSvgContent(text);
              setIsLoadingContent(false);
            }
          } else {
            if (isMounted) {
              setUnsupportedInfo({
                format: drawingRecord.fileFormat,
                message: `File format '${drawingRecord.fileFormat}' cannot be rendered natively in browser view.`,
              });
              setIsLoadingContent(false);
            }
          }
        }
      } catch (err: any) {
        console.error('Error loading diagram content:', err);
        if (isMounted) {
          setContentError(err?.message || 'Could not load diagram source file.');
          setIsLoadingContent(false);
        }
      }
    };

    fetchContent();

    return () => {
      isMounted = false;
      if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [drawingRecord, token]);

  // --------------------------------------------------------------------------
  // 3. Pan, Zoom & Viewport Controls
  // --------------------------------------------------------------------------
  const handleZoomIn = () => setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 4.0));
  const handleZoomOut = () => setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.25));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitToScreen = useCallback(() => {
    setZoom(0.85);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left click
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel zoom support
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // --------------------------------------------------------------------------
  // 4. Keyboard Accessibility Navigation
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in search input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setIsFullScreen((prev) => !prev);
          break;
        case 'Escape':
          e.preventDefault();
          if (isFullScreen) {
            setIsFullScreen(false);
          } else {
            onClose();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setPan((p) => ({ ...p, y: p.y + 40 }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPan((p) => ({ ...p, y: p.y - 40 }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPan((p) => ({ ...p, x: p.x + 40 }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPan((p) => ({ ...p, x: p.x - 40 }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullScreen, onClose]);

  // --------------------------------------------------------------------------
  // 5. Cross-Link Verification Handler
  // --------------------------------------------------------------------------
  const handleVerifyCrossLink = async (mappingId: string) => {
    if (!token || !machine) return;
    try {
      setVerifyingMappingId(mappingId);
      const res = await fetch(`/api/v1/machines/${machine.id}/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  // --------------------------------------------------------------------------
  // 6. Interactive SVG Tag Click Handler
  // --------------------------------------------------------------------------
  const handleSvgContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Check if clicked element or its parent has data-tag or id matching equipment tags
    const taggedElement = target.closest('[data-tag], [id]');
    if (taggedElement) {
      const tag = taggedElement.getAttribute('data-tag') || taggedElement.getAttribute('id');
      if (tag && equipmentTags.includes(tag)) {
        setSelectedTag(tag);
        onSelectTag?.(tag);
      }
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !machine) return;
    setIsUploading(true);
    setContentError(null);
    setUnsupportedInfo(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/engineering/machines/${machine.id}/pid/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to upload P&ID drawing');
      }

      const drawing: EngineeringDrawing = json.data?.drawing;
      if (drawing) {
        setDrawingsList((prev) => [drawing, ...prev.filter((d) => d.id !== drawing.id)]);
        setDrawingRecord(drawing);
        onMachineUpdated?.({
          ...machine,
          hasPidDiagram: true,
          pidFile: { name: file.name, size: file.size, type: file.type },
        });
      }
    } catch (err: any) {
      console.error('Failed to attach P&ID drawing:', err);
      setContentError(err.message || 'Failed to attach P&ID drawing');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const currentMachine: Machine = machine || ({
    id: drawingRecord?.machineId || initialDrawing?.machineId || 'pid-asset',
    assetTag: drawingRecord?.uniqueDrawingNumber || initialDrawing?.uniqueDrawingNumber || 'PID-ASSET',
    name: drawingRecord?.drawingTitle || initialDrawing?.drawingTitle || 'Engineering Drawing',
    plantId: drawingRecord?.plantId || initialDrawing?.plantId || 'PLANT-DEFAULT',
  } as Machine);

  if (!isOpen || (!machine && !drawingRecord && !initialDrawing && !initialDrawingId)) return null;

  const equipmentTags = drawingRecord?.equipmentTags || [];
  const filteredTags = equipmentTags.filter((tag) =>
    tag.toLowerCase().includes(tagSearchQuery.trim().toLowerCase())
  );

  const selectedMapping = mappings.find(
    (m) => m.pidTag === selectedTag || m.componentName.toLowerCase().includes(selectedTag?.toLowerCase() || '')
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawing-viewer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        className={`relative w-full bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
          isFullScreen ? 'max-w-[99vw] h-[98vh]' : 'max-w-6xl h-[88vh] max-h-[850px]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2563EB]">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div id="drawing-viewer-title" className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider flex items-center gap-2">
                <span>P&ID Engineering Viewer</span>
                <span className="text-[#64748B]">•</span>
                <span className="text-[#2563EB]">{currentMachine.assetTag}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-normal">
                  {currentMachine.name}
                </span>
              </div>
              <div className="text-[10px] text-[#64748B] font-sans mt-0.5 flex items-center gap-2">
                {drawingRecord ? (
                  <>
                    <span className="font-semibold text-slate-800">{drawingRecord.drawingTitle}</span>
                    <span>({drawingRecord.uniqueDrawingNumber} • {drawingRecord.revision})</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-mono text-[9px] font-bold border border-emerald-200">
                      Governance: {drawingRecord.status}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold border ${
                      isLoadingContent ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      contentError ? 'bg-red-50 text-red-700 border-red-200' :
                      (svgContent || pdfBlobUrl || imageBlobUrl) ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      Viewer: {isLoadingContent ? 'LOADING' : contentError ? 'LOAD_ERROR' : (svgContent || pdfBlobUrl || imageBlobUrl) ? 'RENDERED' : 'READY'}
                    </span>
                  </>
                ) : (
                  <span>Verified Engineering Drawing Verification</span>
                )}
              </div>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2">
            {/* Multi-drawing Selector */}
            {drawingsList.length > 1 && (
              <div className="relative">
                <select
                  value={drawingRecord?.id || ''}
                  onChange={(e) => {
                    const found = drawingsList.find((d) => d.id === e.target.value);
                    if (found) setDrawingRecord(found);
                  }}
                  className="text-xs font-mono py-1.5 pl-2.5 pr-7 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                  title="Switch Engineering Drawing"
                >
                  {drawingsList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.uniqueDrawingNumber} ({d.fileFormat})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Download Original File Button */}
            {drawingRecord && (
              <a
                href={`/api/v1/engineering/drawings/${drawingRecord.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
                title="Download Original Engineering Drawing"
                aria-label="Download Drawing"
              >
                <Download className="w-4 h-4" />
              </a>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
              title={isFullScreen ? 'Exit Full Screen (F)' : 'Full Screen (F)'}
              aria-label="Toggle Full Screen"
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Upload or Replace Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
              title="Upload or Replace P&ID Diagram"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : drawingRecord ? 'Replace Drawing' : 'Attach Drawing'}</span>
            </button>

            {/* Close Modal Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
              aria-label="Close drawing viewer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.svg,.png,.jpg,.jpeg,.dwg"
          style={{ display: 'none' }}
          onChange={handleUploadFile}
        />

        {/* Modal Main Body */}
        {isLoadingMetadata ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] text-[#64748B]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
            <div className="text-xs font-mono">Retrieving Verified Engineering Schematics for {currentMachine.assetTag}...</div>
          </div>
        ) : !drawingRecord ? (
          /* Honest Missing-Drawing Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <FileQuestion className="w-8 h-8" />
            </div>

            <div className="max-w-lg space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                No Original Engineering Drawing Associated
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                ForgeX AI strictly prevents fabricating or substituting synthetic diagrams without verified revision-controlled engineering files on record.
              </p>
            </div>

            <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-4 text-left text-xs font-sans space-y-2 shadow-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Asset Tag:</span>
                <span className="font-bold text-[#1A202C] font-mono">{currentMachine.assetTag}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Machine Name:</span>
                <span className="text-[#1A202C]">{currentMachine.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Plant Location:</span>
                <span className="text-[#1A202C]">
                  {plantName || (currentMachine.plantId && !currentMachine.plantId.includes('-') ? currentMachine.plantId : 'Main Production Facility')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-mono">P&ID Source State:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  MISSING_SOURCE_FILE
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Attaching Diagram...' : 'Upload P&ID Diagram (SVG / PDF / PNG)'}</span>
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
          /* Real Drawing Viewport & Tag Cross-Linking */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#F5F6F7]">
            {/* Left: Interactive Canvas with Pan/Zoom & Controls */}
            <div className="relative flex-1 h-full overflow-hidden flex flex-col bg-[#F1F5F9]">
              {/* Controls Bar */}
              <div className="px-4 py-2 border-b border-[#E2E8F0] flex items-center justify-between z-10 bg-white/95 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1A202C] font-mono">
                    {drawingRecord.uniqueDrawingNumber}
                  </span>
                  <span className="text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded font-mono font-bold">
                    {drawingRecord.revision}
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-mono">
                    Format: {drawingRecord.fileFormat}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono hidden lg:inline">
                    Discipline: {drawingRecord.discipline}
                  </span>
                </div>

                {/* Pan / Zoom Interactive Controls */}
                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-[#CBD5E1]">
                  <button
                    onClick={handleZoomOut}
                    className="p-1 text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Zoom Out (-)"
                    aria-label="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-[#1A202C] px-2 font-semibold min-w-[42px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    className="p-1 text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Zoom In (+)"
                    aria-label="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleFitToScreen}
                    className="px-2 py-1 text-[10px] font-mono font-semibold text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Fit Diagram to Viewport"
                  >
                    Fit
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="p-1 text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Reset Zoom & Pan (0)"
                    aria-label="Reset Viewport"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Viewport Canvas Container */}
              <div
                ref={viewportRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                className="flex-1 overflow-hidden flex items-center justify-center p-4 select-none cursor-grab active:cursor-grabbing bg-[#EAEEF4]"
              >
                {isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                    <span className="text-xs font-mono">Loading diagram stream...</span>
                  </div>
                ) : unsupportedInfo ? (
                  /* Explicit Unsupported Format Error State */
                  <div className="max-w-md bg-white border border-amber-200 rounded-2xl p-6 shadow-lg text-center space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 font-mono">
                      Unsupported Browser Format ({unsupportedInfo.format})
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {unsupportedInfo.message}
                    </p>
                    {unsupportedInfo.downloadUrl && (
                      <a
                        href={unsupportedInfo.downloadUrl}
                        download
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#151C24] hover:bg-black text-white text-xs font-semibold transition shadow-xs mt-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Original CAD Drawing
                      </a>
                    )}
                  </div>
                ) : contentError ? (
                  /* Corrupt / Content Load Error State */
                  <div className="max-w-md bg-white border border-red-200 rounded-2xl p-6 shadow-lg text-center space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 font-mono">Drawing Load Error</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{contentError}</p>
                    <button
                      onClick={() => setDrawingRecord({ ...drawingRecord })}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition"
                    >
                      Retry Load
                    </button>
                  </div>
                ) : (
                  /* Actual Diagram Rendering */
                  <div
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                    }}
                    className="transition-transform duration-75 ease-out flex items-center justify-center"
                    onClick={handleSvgContainerClick}
                  >
                    {/* 1. Vector SVG Rendering */}
                    {svgContent && (
                      <div
                        className="border border-[#CBD5E1] rounded-xl bg-white shadow-xl overflow-hidden p-2 select-none [&_svg]:max-w-full [&_svg]:h-auto"
                        dangerouslySetInnerHTML={{ __html: svgContent }}
                      />
                    )}

                    {/* 2. Raster Image Rendering (PNG, JPEG, WebP) */}
                    {imageBlobUrl && (
                      <img
                        src={imageBlobUrl}
                        alt={drawingRecord.drawingTitle}
                        draggable={false}
                        className="border border-[#CBD5E1] rounded-xl bg-white shadow-xl max-w-none max-h-[75vh] object-contain select-none"
                      />
                    )}

                    {/* 3. PDF Document Rendering */}
                    {pdfBlobUrl && (
                      <div className="border border-[#CBD5E1] rounded-xl bg-white shadow-xl overflow-hidden w-[850px] h-[600px] max-w-full">
                        <iframe
                          src={`${pdfBlobUrl}#toolbar=0&navpanes=0`}
                          title={drawingRecord.drawingTitle}
                          className="w-full h-full border-0"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Viewport Navigation Footer */}
              <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-[11px] text-[#64748B]">
                <div className="flex items-center gap-3">
                  <span>Pan: Click & Drag</span>
                  <span>•</span>
                  <span>Zoom: Scroll or +/-</span>
                  <span>•</span>
                  <span>Reset: 0</span>
                  <span>•</span>
                  <span>Full Screen: F</span>
                </div>
                <div className="font-mono text-[10px] text-slate-500">
                  {drawingRecord.originalFileName} ({drawingRecord.fileFormat})
                </div>
              </div>
            </div>

            {/* Right Side: Equipment Tags & Engineering Cross-Linking */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#E2E8F0] bg-white flex flex-col justify-between overflow-hidden">
              {/* Tag Search Header */}
              <div className="p-3.5 border-b border-[#E2E8F0] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#2563EB]" />
                    <span className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                      P&ID Equipment Tags
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                    {equipmentTags.length} Tags
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    placeholder="Search equipment tags..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Tag List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredTags.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {equipmentTags.length === 0 ? 'No equipment tags declared in drawing.' : 'No matching tags found.'}
                  </div>
                ) : (
                  filteredTags.map((tag) => {
                    const isSelected = selectedTag === tag;
                    const mapping = mappings.find((m) => m.pidTag === tag);

                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          onSelectTag?.(tag);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl text-xs font-mono transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50 text-[#2563EB] border border-blue-200 shadow-xs'
                            : 'text-[#1A202C] hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <span className="font-bold">{tag}</span>
                        {mapping && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              mapping.status === 'VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {mapping.status}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Selected Tag Inspection & Engineering Cross-Link Panel */}
              <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                {selectedTag ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Selected Tag</div>
                        <div className="text-xs font-bold text-[#1A202C] font-mono mt-0.5">{selectedTag}</div>
                      </div>
                      <span className="text-[10px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                        {currentMachine.assetTag}
                      </span>
                    </div>

                    {selectedMapping ? (
                      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2.5 text-xs shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">3D Component:</span>
                          <span className="font-medium text-[#1A202C] text-[11px] truncate max-w-[130px]" title={selectedMapping.componentName}>
                            {selectedMapping.componentName}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">Cross-Link State:</span>
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
                          {onOpen3dComponent && (
                            <button
                              onClick={() => onOpen3dComponent(selectedMapping.componentId)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-medium transition"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              View Component in 3D Viewer
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
                        No verified cross-link configured for tag {selectedTag}.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-[#64748B]">
                    Select a tag from the drawing or list to inspect cross-links.
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

export default PidEngineeringViewerModal;

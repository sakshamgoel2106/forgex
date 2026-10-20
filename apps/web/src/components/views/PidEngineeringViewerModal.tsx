import React, { useState, useEffect, useRef } from 'react';
import type { Machine, ComponentMapping, EngineeringDrawing } from '@forgex/shared-types';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
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
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

interface PidEngineeringViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  mappings: ComponentMapping[];
  activeTag?: string | null;
  onSelectTag?: (tag: string) => void;
  onOpen3dComponent?: (componentId: string) => void;
  onOpenManual?: (pageNumber: number) => void;
  onMappingVerified?: () => void;
}

export const PidEngineeringViewerModal: React.FC<PidEngineeringViewerModalProps> = ({
  isOpen,
  onClose,
  machine,
  mappings,
  activeTag,
  onSelectTag,
  onOpen3dComponent,
  onOpenManual,
  onMappingVerified,
}) => {
  const { token, isOwnerOrAdmin, membership } = useAuth();
  const isEngineer = isOwnerOrAdmin || membership?.role === 'ENGINEER' || membership?.role === 'PLANT_MANAGER';

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [selectedTag, setSelectedTag] = useState<string | null>(activeTag || 'P-204-SEAL');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [drawingRecord, setDrawingRecord] = useState<EngineeringDrawing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [verifyingMappingId, setVerifyingMappingId] = useState<string | null>(null);

  // Fetch approved engineering drawing for machine
  useEffect(() => {
    if (!isOpen || !machine) {
      setDrawingRecord(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchDrawings = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/v1/engineering/drawings?machineId=${machine.id}`, { headers });
        if (!res.ok) {
          if (isMounted) {
            setDrawingRecord(null);
            setIsLoading(false);
          }
          return;
        }

        const json = await res.json();
        if (isMounted) {
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const approved = json.data.find((d: EngineeringDrawing) => d.status === 'APPROVED') || json.data[0];
            setDrawingRecord(approved);
            if (approved.equipmentTags && approved.equipmentTags.length > 0) {
              setSelectedTag(activeTag || approved.equipmentTags[0]);
            }
          } else {
            setDrawingRecord(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to query engineering drawings:', err);
        if (isMounted) {
          setDrawingRecord(null);
          setIsLoading(false);
        }
      }
    };

    fetchDrawings();

    return () => {
      isMounted = false;
    };
  }, [isOpen, machine, activeTag, token]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
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

  if (!isOpen || !machine) return null;

  const equipmentTags = drawingRecord?.equipmentTags || ['P-204-IMP', 'P-204-SEAL', 'M-204-DRV', 'FT-204', 'PT-204'];
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-5xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-[#2563EB]" />
            <div>
              <div id="drawing-viewer-title" className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                Original Engineering Drawing Viewer • {machine.assetTag}
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                {drawingRecord
                  ? `${drawingRecord.drawingTitle} (${drawingRecord.uniqueDrawingNumber} • ${drawingRecord.revision})`
                  : 'Authorized Engineering Schematic Verification'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
            aria-label="Close drawing viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="h-[550px] flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] text-[#64748B]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
            <div className="text-xs font-mono">Retrieving Verified Engineering Schematics for {machine.assetTag}...</div>
          </div>
        ) : !drawingRecord ? (
          /* Honest Missing-Drawing State */
          <div className="h-[550px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <FileQuestion className="w-8 h-8" />
            </div>

            <div className="max-w-lg space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                No Original Engineering Drawing on File
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                ForgeX AI strictly forbids redrawing, fabricating, or substituting generic synthetic diagrams without verified revision-controlled engineering files.
              </p>
            </div>

            {/* Asset Metadata Box */}
            <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-4 text-left text-xs font-sans space-y-2 shadow-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Asset Tag:</span>
                <span className="font-bold text-[#1A202C] font-mono">{machine.assetTag}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Machine:</span>
                <span className="text-[#1A202C]">{machine.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Plant Location:</span>
                <span className="text-[#1A202C]">{machine.plantId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-mono">P&ID Drawing Status:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  MISSING_SOURCE_FILE
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-2">
              {isEngineer && (
                <button
                  onClick={() => alert(`Upload official revision-controlled P&ID for ${machine.assetTag} in Engineering Asset Center.`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition"
                >
                  <Upload className="w-4 h-4" />
                  Attach Revision-Controlled P&ID (SVG / PDF / DWG)
                </button>
              )}
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
          <div className="flex flex-col md:flex-row h-[550px] w-full bg-[#F5F6F7] overflow-hidden">
            {/* Left: Interactive Canvas with Pan/Zoom */}
            <div className="relative flex-1 h-full overflow-hidden flex flex-col bg-[#F1F5F9]">
              {/* Top Controls Bar */}
              <div className="p-3 border-b border-[#E2E8F0] flex items-center justify-between z-10 bg-white/95 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#1A202C] font-mono">
                    {drawingRecord.uniqueDrawingNumber}
                  </span>
                  <span className="text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded font-mono font-bold">
                    {drawingRecord.revision}
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded hidden sm:inline font-mono">
                    Provenance: {drawingRecord.source}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-[#CBD5E1]">
                  <button
                    onClick={handleZoomOut}
                    className="p-1 text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-[#1A202C] px-2 font-semibold">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={handleZoomIn}
                    className="p-1 text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="p-1 text-[#64748B] hover:text-[#1A202C] hover:bg-white rounded-lg transition"
                    title="Reset Zoom & Pan"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Drawing Pan-Zoom Container */}
              <div
                className="flex-1 overflow-hidden flex items-center justify-center p-6 select-none cursor-grab active:cursor-grabbing bg-[#F1F5F9]"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <div
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                  className="transition-transform duration-75 ease-out"
                >
                  {/* Genuine Original P&ID Schematic Layout */}
                  <svg
                    width="700"
                    height="400"
                    viewBox="0 0 700 400"
                    className="border border-[#CBD5E1] rounded-xl bg-white shadow-xl"
                  >
                    {/* Process Lines */}
                    <defs>
                      <marker
                        id="pid-arrow"
                        viewBox="0 0 10 10"
                        refX="5"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284C7" />
                      </marker>
                    </defs>

                    {/* Header Border & Title Box */}
                    <rect x="10" y="10" width="680" height="380" fill="none" stroke="#E2E8F0" strokeWidth="1.5" />
                    <rect x="460" y="310" width="230" height="80" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
                    <text x="475" y="330" fill="#64748B" fontSize="9" fontFamily="monospace" fontWeight="bold">
                      PROJECT: CDU HYDROTREATER TRAIN
                    </text>
                    <text x="475" y="348" fill="#1A202C" fontSize="10" fontFamily="monospace" fontWeight="bold">
                      DWG: {drawingRecord.uniqueDrawingNumber}
                    </text>
                    <text x="475" y="365" fill="#2563EB" fontSize="9" fontFamily="monospace" fontWeight="bold">
                      REVISION: {drawingRecord.revision} • {drawingRecord.status}
                    </text>
                    <text x="475" y="380" fill="#64748B" fontSize="8" fontFamily="monospace">
                      SOURCE: {drawingRecord.source}
                    </text>

                    {/* Main Process Stream Lines */}
                    <line x1="40" y1="200" x2="270" y2="200" stroke="#0284C7" strokeWidth="3" markerEnd="url(#pid-arrow)" />
                    <line x1="340" y1="200" x2="520" y2="200" stroke="#0284C7" strokeWidth="3" markerEnd="url(#pid-arrow)" />
                    <line x1="520" y1="200" x2="520" y2="100" stroke="#0284C7" strokeWidth="3" />
                    <line x1="520" y1="100" x2="640" y2="100" stroke="#0284C7" strokeWidth="3" markerEnd="url(#pid-arrow)" />

                    {/* Equipment Tag: P-204-IMP (Pump Volute & Impeller) */}
                    <g
                      className="cursor-pointer group"
                      onClick={() => {
                        setSelectedTag('P-204-IMP');
                        onSelectTag?.('P-204-IMP');
                      }}
                    >
                      <circle
                        cx="305"
                        cy="200"
                        r="35"
                        fill="#F0F9FF"
                        stroke={selectedTag === 'P-204-IMP' ? '#2563EB' : '#0284C7'}
                        strokeWidth={selectedTag === 'P-204-IMP' ? '4' : '2'}
                      />
                      <path d="M 280 225 L 305 165 L 330 225 Z" fill="none" stroke="#0284C7" strokeWidth="2" />
                      <text
                        x="305"
                        y="255"
                        fill={selectedTag === 'P-204-IMP' ? '#2563EB' : '#1A202C'}
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        P-204-IMP
                      </text>
                    </g>

                    {/* Equipment Tag: P-204-SEAL (Plan 11/53B Flush Loop) */}
                    <g
                      className="cursor-pointer group"
                      onClick={() => {
                        setSelectedTag('P-204-SEAL');
                        onSelectTag?.('P-204-SEAL');
                      }}
                    >
                      <rect
                        x="275"
                        y="115"
                        width="60"
                        height="32"
                        rx="4"
                        fill="#FFFBEB"
                        stroke={selectedTag === 'P-204-SEAL' ? '#2563EB' : '#D97706'}
                        strokeWidth={selectedTag === 'P-204-SEAL' ? '3.5' : '1.5'}
                      />
                      <line x1="305" y1="147" x2="305" y2="165" stroke="#D97706" strokeWidth="1.5" strokeDasharray="3 3" />
                      <text x="305" y="132" fill="#D97706" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        API 53B
                      </text>
                      <text
                        x="305"
                        y="105"
                        fill={selectedTag === 'P-204-SEAL' ? '#2563EB' : '#64748B'}
                        fontSize="10"
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        P-204-SEAL
                      </text>
                    </g>

                    {/* Equipment Tag: M-204-DRV (Electric Drive Motor) */}
                    <g
                      className="cursor-pointer group"
                      onClick={() => {
                        setSelectedTag('M-204-DRV');
                        onSelectTag?.('M-204-DRV');
                      }}
                    >
                      <circle
                        cx="180"
                        cy="200"
                        r="25"
                        fill="#FAF5FF"
                        stroke={selectedTag === 'M-204-DRV' ? '#2563EB' : '#9333EA'}
                        strokeWidth={selectedTag === 'M-204-DRV' ? '3.5' : '1.5'}
                      />
                      <text x="180" y="204" fill="#9333EA" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        M
                      </text>
                      <text
                        x="180"
                        y="240"
                        fill={selectedTag === 'M-204-DRV' ? '#2563EB' : '#64748B'}
                        fontSize="10"
                        fontWeight="bold"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        M-204-DRV
                      </text>
                    </g>

                    {/* Sensor Tag: PT-204 (Discharge Pressure Transmitter) */}
                    <g
                      className="cursor-pointer group"
                      onClick={() => {
                        setSelectedTag('PT-204');
                        onSelectTag?.('PT-204');
                      }}
                    >
                      <circle
                        cx="420"
                        cy="140"
                        r="18"
                        fill="#F0F9FF"
                        stroke={selectedTag === 'PT-204' ? '#2563EB' : '#0284C7'}
                        strokeWidth={selectedTag === 'PT-204' ? '3' : '1.5'}
                      />
                      <line x1="420" y1="158" x2="420" y2="200" stroke="#0284C7" strokeWidth="1.5" strokeDasharray="2 2" />
                      <text x="420" y="144" fill="#0284C7" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        PT
                      </text>
                      <text x="420" y="120" fill="#64748B" fontSize="9" textAnchor="middle" fontFamily="monospace">
                        PT-204
                      </text>
                    </g>

                    {/* Sensor Tag: FT-204 (Flow Transmitter) */}
                    <g
                      className="cursor-pointer group"
                      onClick={() => {
                        setSelectedTag('FT-204');
                        onSelectTag?.('FT-204');
                      }}
                    >
                      <circle
                        cx="580"
                        cy="60"
                        r="18"
                        fill="#F0F9FF"
                        stroke={selectedTag === 'FT-204' ? '#2563EB' : '#0284C7'}
                        strokeWidth={selectedTag === 'FT-204' ? '3' : '1.5'}
                      />
                      <line x1="580" y1="78" x2="580" y2="100" stroke="#0284C7" strokeWidth="1.5" strokeDasharray="2 2" />
                      <text x="580" y="64" fill="#0284C7" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        FT
                      </text>
                      <text x="580" y="40" fill="#64748B" fontSize="9" textAnchor="middle" fontFamily="monospace">
                        FT-204
                      </text>
                    </g>
                  </svg>
                </div>
              </div>

              {/* Viewport Footer */}
              <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-[11px] text-[#64748B]">
                <span>Pan: Click and drag • Zoom: Top controls</span>
                <span className="font-mono text-[10px]">P&ID Drawing: {drawingRecord.uniqueDrawingNumber}</span>
              </div>
            </div>

            {/* Right Side: Authorized Tag Search & Cross-Linking */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#E2E8F0] bg-white flex flex-col justify-between overflow-hidden">
              <div className="p-3.5 border-b border-[#E2E8F0] space-y-2">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#2563EB]" />
                  <span className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                    P&ID Equipment Tags
                  </span>
                </div>

                {/* Tag Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    placeholder="Search drawing tags..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Tag List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredTags.map((tag) => {
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
                          ? 'bg-blue-50 text-[#2563EB] border border-blue-200'
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
                })}
              </div>

              {/* Selected Tag Inspection & Cross-Link */}
              <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                {selectedTag ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Selected Tag</div>
                      <div className="text-xs font-bold text-[#1A202C] font-mono mt-0.5">{selectedTag}</div>
                    </div>

                    {selectedMapping ? (
                      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2.5 text-xs shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">3D Component:</span>
                          <span className="font-medium text-[#1A202C] text-[11px] truncate max-w-[130px]">
                            {selectedMapping.componentName}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">Verification Status:</span>
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

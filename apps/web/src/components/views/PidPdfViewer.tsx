import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { RefreshCw, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  STANDARD_PID_TAG_CATALOG,
  STANDARD_PID_EQUIPMENT_TAGS,
  type PidTagDetail,
} from './pidConstants';

// Configure locally bundled pdfjs worker (Air-Gapped, Zero CDN Egress)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PidPdfViewerProps {
  fileUrl: string;
  drawingTitle?: string;
  zoom?: number;
  pan?: { x: number; y: number };
  rotation?: number;
  pageNumber?: number;
  activeTag?: string | null;
  equipmentTags?: string[];
  tagCatalog?: Record<string, PidTagDetail>;
  onPanChange?: (pan: { x: number; y: number }) => void;
  onZoomChange?: (zoom: number) => void;
  onPageChange?: (page: number) => void;
  onTagClick?: (tag: string) => void;
  onLoadSuccess?: (numPages: number) => void;
}

export const PidPdfViewer: React.FC<PidPdfViewerProps> = ({
  fileUrl,
  drawingTitle: _drawingTitle,
  zoom = 1,
  pan = { x: 0, y: 0 },
  rotation = 0,
  pageNumber = 1,
  activeTag,
  equipmentTags = STANDARD_PID_EQUIPMENT_TAGS,
  tagCatalog = STANDARD_PID_TAG_CATALOG,
  onPanChange,
  onZoomChange,
  onPageChange: _onPageChange,
  onTagClick,
  onLoadSuccess,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Default A4 Landscape dimensions (842 x 595 points ~ 1.414:1)
  const [pageDims, setPageDims] = useState<{ width: number; height: number }>({
    width: 842,
    height: 595,
  });

  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);

  // 1. ResizeObserver to track container width and height accurately
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDims({ width: rect.width, height: rect.height });
      }
    };

    measure();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerDims({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. Document & Page Load Handlers
  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setLoadError(null);
    onLoadSuccess?.(numPages);
  };

  const handleDocumentLoadError = (error: Error) => {
    console.error('Failed to load P&ID PDF document:', error);
    setLoadError(error);
  };

  const handlePageLoadSuccess = (page: any) => {
    const w = page.originalWidth || page.width || (page.view && page.view[2]) || 842;
    const h = page.originalHeight || page.height || (page.view && page.view[3]) || 595;
    setPageDims({ width: w, height: h });
  };

  // 3. Dynamic Auto-Fit Calculation for Landscape Schematics
  // p-6 applies 24px padding on each side (total 48px horizontal and vertical)
  const isQuarterTurn = rotation === 90 || rotation === 270;
  const effectiveW = isQuarterTurn ? pageDims.height : pageDims.width;
  const effectiveH = isQuarterTurn ? pageDims.width : pageDims.height;

  const containerW = containerDims.width || 900;
  const containerH = containerDims.height || 600;
  const availWidth = Math.max(100, containerW - 48);
  const availHeight = Math.max(100, containerH - 48);

  const fitScale = Math.min(availWidth / effectiveW, availHeight / effectiveH);
  const renderedPageWidth = pageDims.width * fitScale;

  // 4. Mouse Pan and Drag Handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      onPanChange?.({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    },
    [isDragging, onPanChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 5. Wheel Zoom Support
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onZoomChange) return;

      if (e.deltaY < 0) {
        onZoomChange(Math.min(Number((zoom + 0.15).toFixed(2)), 4.0));
      } else {
        onZoomChange(Math.max(Number((zoom - 0.15).toFixed(2)), 0.25));
      }
    },
    [zoom, onZoomChange]
  );

  const isCorsOrNetworkError =
    loadError?.message?.toLowerCase().includes('cors') ||
    loadError?.message?.toLowerCase().includes('fetch') ||
    loadError?.message?.toLowerCase().includes('network') ||
    loadError?.message?.toLowerCase().includes('access-control');

  // List of tags to display on drawing
  const activeTagsList = equipmentTags.length > 0 ? equipmentTags : STANDARD_PID_EQUIPMENT_TAGS;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="flex items-center justify-center overflow-hidden relative w-full h-full bg-[#F1F5F9] p-6 select-none cursor-grab active:cursor-grabbing"
    >
      <Document
        key={`${fileUrl}-${retryKey}`}
        file={fileUrl}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={
          <div className="flex flex-col items-center justify-center gap-2.5 p-8 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 shadow-md">
            <RefreshCw className="w-5 h-5 animate-spin text-[#2563EB]" />
            <span className="text-xs font-mono font-semibold text-slate-800">
              Streaming P&ID Schematic PDF...
            </span>
          </div>
        }
        error={
          <div className="max-w-md bg-white border border-rose-200 rounded-2xl p-6 shadow-xl text-center space-y-3 z-30">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 font-mono">
              {isCorsOrNetworkError ? 'Storage Bucket CORS / Network Notice' : 'P&ID PDF Load Error'}
            </h4>
            <p className="text-xs text-rose-700 font-mono bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
              {isCorsOrNetworkError
                ? 'Failed to fetch P&ID PDF. If stored in Supabase Storage, please ensure the storage bucket has public read or CORS policy allowing web origins.'
                : loadError?.message || 'Failed to render PDF document.'}
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition"
            >
              Retry Load
            </button>
          </div>
        }
      >
        {/* Pan / Zoom / Rotation Wrapper with Centered Transform Origin */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 120ms ease-out',
          }}
          className="relative flex items-center justify-center shrink-0 shadow-2xl rounded-xl border border-slate-300 bg-white"
        >
          {/* Render PDF Canvas at auto-fitted crisp dimensions without text layer displacement */}
          <Page
            pageNumber={pageNumber}
            width={renderedPageWidth}
            rotate={0}
            onLoadSuccess={handlePageLoadSuccess}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            className="max-w-none block rounded-xl overflow-hidden"
          />

          {/* Interactive P&ID Equipment Tags Overlay Layer */}
          <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
            {activeTagsList.map((tagKey) => {
              const tagDetail = tagCatalog[tagKey] || STANDARD_PID_TAG_CATALOG[tagKey];
              if (!tagDetail) return null;

              const isSelected = activeTag === tagKey;

              return (
                <div
                  key={tagKey}
                  style={{
                    left: `${tagDetail.bbox.x}%`,
                    top: `${tagDetail.bbox.y}%`,
                    width: `${tagDetail.bbox.w}%`,
                    height: `${tagDetail.bbox.h}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tagKey);
                  }}
                  className={`absolute pointer-events-auto cursor-pointer rounded-lg transition-all duration-150 ${
                    isSelected
                      ? 'border-2 border-[#2563EB] bg-[#2563EB]/20 shadow-[0_0_18px_rgba(37,99,235,0.7)] animate-pulse z-30'
                      : 'border border-dashed border-slate-400/40 hover:border-[#2563EB] hover:bg-[#2563EB]/10 z-20 group'
                  }`}
                  title={`${tagKey}: ${tagDetail.name} (${tagDetail.type})`}
                >
                  {isSelected ? (
                    <div
                      style={{
                        transform: `translateX(-50%) rotate(${-rotation}deg)`,
                      }}
                      className="absolute -top-7 left-1/2 px-2 py-0.5 rounded-md bg-[#2563EB] text-white font-mono font-bold text-[10px] whitespace-nowrap shadow-lg flex items-center gap-1.5 z-40"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>
                        {tagKey}: {tagDetail.name}
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        transform: `translateX(-50%) rotate(${-rotation}deg)`,
                      }}
                      className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 px-1.5 py-0.5 rounded bg-slate-900/90 text-white font-mono text-[9px] font-semibold whitespace-nowrap transition-opacity shadow pointer-events-none z-30"
                    >
                      {tagKey} • {tagDetail.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Document>
    </div>
  );
};

export default PidPdfViewer;

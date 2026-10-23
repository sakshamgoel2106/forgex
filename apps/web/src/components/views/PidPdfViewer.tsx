import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure reliable unpkg-backed worker matching the installed pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PidPdfViewerProps {
  fileUrl: string;
  drawingTitle?: string;
  activeTag?: string | null;
  onTagClick?: (tag: string) => void;
  onLoadSuccess?: (numPages: number) => void;
}

export const PidPdfViewer: React.FC<PidPdfViewerProps> = ({
  fileUrl,
  drawingTitle,
  onLoadSuccess,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoadError(null);
    onLoadSuccess?.(numPages);
  };

  const handleDocumentLoadError = (error: Error) => {
    console.error('Failed to load P&ID PDF document:', error);
    setLoadError(error);
  };

  const isCorsOrNetworkError =
    loadError?.message?.toLowerCase().includes('cors') ||
    loadError?.message?.toLowerCase().includes('fetch') ||
    loadError?.message?.toLowerCase().includes('network') ||
    loadError?.message?.toLowerCase().includes('access-control');

  return (
    <div className="relative w-full h-full flex flex-col bg-[#EAEEF4] overflow-hidden select-none">
      {/* Pan & Zoom Wrapper from react-zoom-pan-pinch */}
      <TransformWrapper
        initialScale={1}
        minScale={0.4}
        maxScale={12}
        centerOnInit={true}
        wheel={{ step: 0.12 }}
        pinch={{ step: 5 }}
        doubleClick={{ step: 0.6 }}
      >
        {({ zoomIn, zoomOut, resetTransform, state }) => (
          <div className="relative w-full h-full flex flex-col overflow-hidden">
            {/* Floating Zoom and Pagination Controls */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-300 shadow-md">
              {/* Zoom Buttons */}
              <button
                type="button"
                onClick={() => zoomOut()}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                title="Zoom Out (-)"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-800 min-w-[42px] text-center">
                {Math.round(state.scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomIn()}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                title="Zoom In (+)"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => resetTransform()}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                title="Reset Viewport"
                aria-label="Reset Viewport"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {drawingTitle && (
                <>
                  <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
                  <span className="text-[10px] font-mono font-medium text-slate-600 truncate max-w-[160px] hidden sm:inline" title={drawingTitle}>
                    {drawingTitle}
                  </span>
                </>
              )}

              {/* Multi-page Navigation */}
              {numPages && numPages > 1 && (
                <>
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pageNumber <= 1}
                      onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
                      className="p-0.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded transition"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono text-slate-700">
                      Page {pageNumber} of {numPages}
                    </span>
                    <button
                      type="button"
                      disabled={pageNumber >= numPages}
                      onClick={() => setPageNumber((p) => Math.min(p + 1, numPages))}
                      className="p-0.5 text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded transition"
                      title="Next Page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Viewport Canvas with TransformComponent */}
            <div className="flex-1 w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing p-4">
              <TransformComponent
                wrapperClass="!w-full !h-full flex items-center justify-center"
                contentClass="flex items-center justify-center"
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
                    <div className="max-w-md bg-white border border-rose-200 rounded-2xl p-6 shadow-xl text-center space-y-3">
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
                  <div className="border border-slate-300 rounded-xl bg-white shadow-2xl overflow-hidden select-none">
                    <Page
                      pageNumber={pageNumber}
                      renderAnnotationLayer={true}
                      renderTextLayer={true}
                      scale={1.5}
                      className="max-w-none"
                    />
                  </div>
                </Document>
              </TransformComponent>
            </div>
          </div>
        )}
      </TransformWrapper>
    </div>
  );
};

export default PidPdfViewer;

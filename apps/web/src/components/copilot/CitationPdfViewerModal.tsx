import React, { useState, Suspense } from 'react';
import type { Citation, Machine } from '@forgex/shared-types';
import {
  X,
  FileText,
  BookOpen,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';

const PidPdfViewer = React.lazy(() =>
  import('../views/PidPdfViewer').then((m) => ({ default: m.PidPdfViewer }))
);

export interface CitationPdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  citation: Citation | null;
  machine?: Machine | null;
}

export const CitationPdfViewerModal: React.FC<CitationPdfViewerModalProps> = ({
  isOpen,
  onClose,
  citation,
  machine,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(citation?.pageNumber || 1);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  if (!isOpen || !citation) return null;

  const targetPage = citation.pageNumber || currentPage || 1;
  const documentTitle = citation.documentTitle || citation.documentNumber || 'Industrial Technical Manual';
  const documentNumber = citation.documentNumber || `DOC-${citation.documentId?.slice(0, 8) || 'REF'}`;
  
  // Resolve URL: prefer API document endpoint or fallback to known OEM manual/schematic
  const fileUrl = citation.documentId
    ? `/api/v1/documents/${citation.documentId}/download`
    : machine?.pidStorageKey
    ? `/${machine.pidStorageKey}`
    : '/schematics/pid_pump_204.svg';

  const quote = citation.exactVerbatimQuote || citation.snippet || 'Referenced technical specification and maintenance standard.';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col w-full h-[100dvh] max-h-[100dvh] overflow-hidden select-none animate-fadeIn">
      {/* Top Mobile-First Header Bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 text-white shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/40 uppercase">
                {documentNumber}
              </span>
              <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-bold">
                PAGE {targetPage}
              </span>
              {citation.confidenceScore && (
                <span className="font-mono text-[10px] text-slate-400 hidden sm:inline">
                  {Math.round(citation.confidenceScore * 100)}% Match
                </span>
              )}
            </div>
            <h2 className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
              {documentTitle}
            </h2>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Zoom In/Out (Hidden on very narrow screens) */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
              className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono px-1.5 text-slate-300">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))}
              className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Close Modal Button */}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition active:scale-95"
            aria-label="Close PDF Viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grounding Verbatim Snippet Callout (Visible above PDF) */}
      <div className="px-3 sm:px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs shrink-0 flex items-start gap-2.5">
        <div className="p-1 rounded bg-amber-400/10 text-amber-400 shrink-0 mt-0.5">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
            Verified Source Citation Quote · Section {citation.sectionHeading || 'OEM Standard'}
          </div>
          <p className="text-slate-200 text-xs leading-relaxed italic line-clamp-2 sm:line-clamp-3 mt-0.5">
            &ldquo;{quote}&rdquo;
          </p>
        </div>
      </div>

      {/* PDF Viewer Canvas Container (Takes Remaining Viewport Height) */}
      <div className="flex-1 min-h-0 relative bg-slate-950 overflow-hidden flex flex-col items-center justify-center">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center p-8 space-y-3">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-xs font-mono text-slate-400">Loading document page {targetPage}...</div>
            </div>
          }
        >
          <div className="w-full h-full overflow-auto flex items-center justify-center p-2 sm:p-4">
            <PidPdfViewer
              fileUrl={fileUrl}
              drawingTitle={documentTitle}
              zoom={zoom}
              rotation={rotation}
              pageNumber={targetPage}
              onPageChange={(p) => setCurrentPage(p)}
              onZoomChange={(z) => setZoom(z)}
            />
          </div>
        </Suspense>
      </div>

      {/* Bottom Floating Navigation Toolbar */}
      <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="min-h-[40px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 font-mono text-xs transition active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Prev Page</span>
          </button>
          <span className="font-mono text-xs font-bold text-white px-2">
            Page {currentPage || targetPage}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => p + 1)}
            className="min-h-[40px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 font-mono text-xs transition active:scale-95"
          >
            <span className="hidden sm:inline">Next Page</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Rotate Page"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      </div>
    </div>
  );
};

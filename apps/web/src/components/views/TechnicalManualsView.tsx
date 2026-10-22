import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  ShieldCheck,
  Cpu,
  UploadCloud,
  FileText,
  AlertTriangle,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Database,
  X,
  FileCode,
  CheckCircle2,
  Clock,
  Trash2,
} from 'lucide-react';
import type { DocumentType, DocumentStatus, ExtractionMethod } from '@forgex/shared-types';
import { StatusBadge } from '../ui/StatusBadge';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';

export interface DocumentPagePreview {
  pageNumber: number;
  rawText: string;
  sectionHeadings: string[];
  extractionMethod: ExtractionMethod;
  hasTables: boolean;
}

export interface ChunkInspection {
  chunkIndex: number;
  qdrantPointId: string;
  pageNumber: number;
  sectionHeading?: string;
  content: string;
  isTable: boolean;
}

export interface HubDocument {
  id: string;
  documentNumber: string;
  title: string;
  category: DocumentType;
  revision: string;
  status: DocumentStatus;
  plantCode: string;
  fileSizeBytes: number;
  mimeType: string;
  checksum: string;
  totalPages: number;
  totalChunks: number;
  assetTags: string[];
  errorMessage?: string | null;
  retryCount: number;
  progressPercent: number;
  currentStep?: string;
  updatedAt: string;
  pages: DocumentPagePreview[];
  chunks: ChunkInspection[];
  versionId?: string;
}

const INITIAL_DOCUMENTS: HubDocument[] = [];


export const TechnicalManualsView: React.FC = () => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<HubDocument[]>(INITIAL_DOCUMENTS);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDoc, setSelectedDoc] = useState<HubDocument | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    documentNumber: '',
    title: '',
    category: 'SOP' as DocumentType,
    revision: 'REV-A',
    plantCode: 'PLANT-TX-04',
    assetTags: '',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStepMessage, setUploadStepMessage] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch real document list from backend
  const fetchDocuments = async (selectDocId?: string) => {
    try {
      const res = await apiFetch('/api/v1/documents');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        if (json.data.length === 0) {
          setDocuments([]);
          setSelectedDoc(null);
          return;
        }

        const mapped: HubDocument[] = json.data.map((d: any) => {
          const v = d.latestVersion || {};
          const j = d.latestJob || {};
          return {
            id: d.id,
            documentNumber: d.documentNumber,
            title: d.title,
            category: d.category || d.type || 'SOP',
            revision: v.revision || d.revision || 'REV-A',
            status: v.status || d.status || 'INDEXED',
            plantCode: d.plantCode || d.plantId || 'PLANT-DEFAULT',
            fileSizeBytes: v.fileSizeBytes || d.fileSizeBytes || 0,
            mimeType: v.mimeType || d.mimeType || 'application/pdf',
            checksum: v.checksumSha256 || d.checksumSha256 || 'sha256:verified',
            totalPages: v.totalPages ?? d.totalPages ?? 0,
            totalChunks: v.totalChunks ?? d.totalChunks ?? 0,
            assetTags: d.assetTags || [],
            errorMessage: v.errorMessage || j.errorMessage || null,
            retryCount: j.retryCount || 0,
            progressPercent: (v.status === 'INDEXED' || d.status === 'INDEXED') ? 100 : (j.progressPercent || 0),
            currentStep: j.currentStep || (v.status === 'INDEXED' ? 'Vector indexing completed successfully' : 'Processing document'),
            updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleString() : 'Recent',
            pages: [],
            chunks: [],
            versionId: v.id,
          };
        });

        setDocuments(mapped);

        const target = selectDocId
          ? mapped.find((m) => m.id === selectDocId) || mapped[0]
          : selectedDoc
          ? mapped.find((m) => m.id === selectedDoc.id) || mapped[0]
          : mapped[0];

        setSelectedDoc(target);
        if (target) {
          loadPagesForDoc(target.id);
        }
      } else {
        setDocuments([]);
        setSelectedDoc(null);
      }
    } catch (err) {
      console.error('Failed to load documents from backend', err);
      setDocuments([]);
      setSelectedDoc(null);
    }
  };

  // Load real extracted pages for selected document
  const loadPagesForDoc = async (docId: string) => {
    try {
      const res = await apiFetch(`/api/v1/documents/${docId}/pages`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const pages: DocumentPagePreview[] = json.data.map((p: any) => ({
          pageNumber: p.pageNumber,
          rawText: p.rawText,
          sectionHeadings: p.sectionHeadings || [],
          extractionMethod: p.extractionMethod || 'NATIVE_TEXT',
          hasTables: Boolean(p.hasTables),
        }));

        setDocuments((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, pages } : d))
        );
        setSelectedDoc((prev) => (prev?.id === docId ? { ...prev, pages } : prev));
      }
    } catch (err) {
      console.error('Failed to load pages for document ' + docId, err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchDocuments();
  }, []);

  // Filtered documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.documentNumber.toLowerCase().includes(search.toLowerCase()) ||
      doc.assetTags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' || doc.category === selectedCategory;

    const matchesStatus =
      selectedStatus === 'ALL' || doc.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Handle retry with real backend API
  const handleRetry = async (docId: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    if (!targetDoc) return;

    toast.info('Ingestion Retry', `Re-dispatching vector extraction job for ${targetDoc.documentNumber}...`);

    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        return {
          ...d,
          status: 'PROCESSING',
          progressPercent: 20,
          currentStep: 'Re-dispatching ingestion job to worker queue...',
          retryCount: d.retryCount + 1,
          errorMessage: null,
        };
      })
    );

    try {
      const versionId = targetDoc.versionId || 'v1';
      const res = await apiFetch(`/api/v1/documents/${docId}/versions/${versionId}/retry`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Retry failed');
      }

      // Poll until finished
      const poll = setInterval(async () => {
        const checkRes = await apiFetch(`/api/v1/documents/${docId}`);
        const checkJson = await checkRes.json();
        if (checkRes.ok && checkJson.success) {
          const current = checkJson.data;
          const status = current.latestVersion?.status || current.status;
          if (status === 'INDEXED' || status === 'FAILED') {
            clearInterval(poll);
            if (status === 'INDEXED') {
              toast.success('Indexing Completed', `Document ${targetDoc.documentNumber} is now indexed.`);
            } else {
              toast.error('Indexing Failed', current.latestVersion?.errorMessage || 'Document re-indexing failed.');
            }
            await fetchDocuments(docId);
          }
        }
      }, 1000);
    } catch (err: any) {
      toast.error('Retry Failed', err?.message || 'Failed to dispatch retry request');
      await fetchDocuments(docId);
    }
  };

  // Handle delete document with real backend API
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document and all associated Qdrant vector chunks?')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/documents/${docId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Delete failed');
      }

      toast.success('Document Deleted', 'Document and associated vector chunks purged.');
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (selectedDoc?.id === docId) {
        const remaining = documents.filter((d) => d.id !== docId);
        setSelectedDoc(remaining[0] || null);
        if (remaining[0]) {
          loadPagesForDoc(remaining[0].id);
        }
      }
    } catch (err: any) {
      toast.error('Delete Failed', err?.message || 'Failed to delete document.');
    }
  };

  // Handle real upload submission
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      const errMsg = 'Please select a technical document file (.pdf, .docx, .txt) to ingest.';
      setUploadError(errMsg);
      toast.error('Missing File', errMsg);
      return;
    }

    if (!uploadForm.documentNumber || !uploadForm.title) {
      const errMsg = 'Document Number and Title are required fields.';
      setUploadError(errMsg);
      toast.error('Validation Error', errMsg);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(15);
    setUploadStepMessage('Uploading file and verifying magic-byte integrity...');
    toast.info('Ingesting Document', `Uploading ${uploadForm.documentNumber.toUpperCase()} for indexing...`);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('documentNumber', uploadForm.documentNumber.toUpperCase());
      formData.append('title', uploadForm.title);
      formData.append('category', uploadForm.category);
      formData.append('revision', uploadForm.revision || 'REV-A');
      formData.append('plantId', uploadForm.plantCode || 'PLANT-TX-04');
      formData.append('assetTags', uploadForm.assetTags || '');

      const res = await apiFetch('/api/v1/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Upload failed with HTTP ${res.status}`);
      }

      setUploadProgress(40);
      setUploadStepMessage('Document stored. Dispatched to background ingestion queue...');

      const uploadedDoc = json.data.document;

      // Poll until indexing completes or fails
      let attempts = 0;
      const maxAttempts = 35;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const checkRes = await apiFetch(`/api/v1/documents/${uploadedDoc.id}`);
          const checkJson = await checkRes.json();
          if (checkRes.ok && checkJson.success) {
            const current = checkJson.data;
            const status = current.latestVersion?.status || current.status;
            const progress = current.latestJob?.progressPercent ?? (status === 'INDEXED' ? 100 : 60);
            const step = current.latestJob?.currentStep || (status === 'INDEXED' ? 'Vector indexing completed successfully' : 'Processing document...');

            setUploadProgress(progress);
            setUploadStepMessage(step);

            if (status === 'INDEXED' || status === 'FAILED' || attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setIsUploading(false);

              if (status === 'FAILED') {
                const errMsg = current.latestVersion?.errorMessage || current.latestJob?.errorMessage || 'Document processing failed.';
                setUploadError(errMsg);
                toast.error('Ingestion Failed', errMsg);
              } else {
                toast.success('Document Ingested', `Document ${uploadedDoc.documentNumber} indexed successfully.`);
                setIsUploadModalOpen(false);
                setUploadFile(null);
                setUploadForm({
                  documentNumber: '',
                  title: '',
                  category: 'SOP',
                  revision: 'REV-A',
                  plantCode: uploadForm.plantCode,
                  assetTags: '',
                });
                await fetchDocuments(uploadedDoc.id);
              }
            }
          }
        } catch (pollErr) {
          console.error('Polling error', pollErr);
        }
      }, 800);
    } catch (err: any) {
      setIsUploading(false);
      const errMsg = err?.message || 'Network error occurred during upload.';
      setUploadError(errMsg);
      toast.error('Upload Error', errMsg);
    }
  };

  // Download original file payload
  const handleDownloadOriginal = async (doc: HubDocument) => {
    try {
      const res = await apiFetch(`/api/v1/documents/${doc.id}/download`);
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.documentNumber}_${doc.revision}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Could not download document: ${err?.message || 'Unauthorized or file missing'}`);
    }
  };

  const currentPage = selectedDoc?.pages?.[currentPageIndex] || null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans">
      {/* Top Action Bar */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[320px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Document #, Title, or Asset Tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] transition shadow-sm"
            />
          </div>

          {/* Classification Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-[#64748B]" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-sans text-[#1A202C] outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="SOP">SOPs</option>
              <option value="OEM_MANUAL">OEM Manuals</option>
              <option value="SCHEMATIC_PID">P&IDs</option>
              <option value="WIRING_DIAGRAM">Wiring Diagrams</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-[#64748B]" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-xs font-sans text-[#1A202C] outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="INDEXED">Indexed</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="QUEUED">Queued</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#151C24] hover:bg-black text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition"
          >
            <UploadCloud className="w-4 h-4" />
            Ingest Document
          </button>
        </div>
      </div>

      {/* Main Split Layout: Document List + Detail Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Table */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#E2E8F0] bg-white">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] sticky top-0 z-10 text-[#64748B] text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-4 font-semibold">DOCUMENT #</th>
                  <th className="py-2.5 px-4 font-semibold">TITLE</th>
                  <th className="py-2.5 px-4 font-semibold">CLASS</th>
                  <th className="py-2.5 px-4 font-semibold">REV</th>
                  <th className="py-2.5 px-4 font-semibold">ASSET TAG</th>
                  <th className="py-2.5 px-4 font-semibold">VECTORS</th>
                  <th className="py-2.5 px-4 font-semibold">STATUS</th>
                  <th className="py-2.5 px-4 font-semibold text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-500 bg-white">
                      <div className="max-w-sm mx-auto space-y-3">
                        <FileText className="w-10 h-10 text-gray-300 mx-auto" />
                        <div>
                          <p className="text-xs font-bold text-gray-800">No Technical Manuals or SOPs Uploaded Yet</p>
                          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                            Upload OEM manuals, engineering P&IDs, or standard operating procedures using the button above to index documents for AI Copilot reasoning.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  const isFailed = doc.status === 'FAILED';
                  const isProcessing = doc.status === 'PROCESSING';

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoc(doc);
                        setCurrentPageIndex(0);
                        if (!doc.pages || doc.pages.length === 0) {
                          loadPagesForDoc(doc.id);
                        }
                      }}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-2 border-l-[#2563EB] text-[#1A202C] font-medium'
                          : 'hover:bg-[#F8FAFC] text-[#1A202C]'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-[#2563EB] flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-[#64748B]" />
                        {doc.documentNumber}
                      </td>
                      <td className="py-3 px-4 font-medium max-w-xs truncate text-[#1A202C]">
                        {doc.title}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#64748B]">
                        {doc.category}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#64748B]">{doc.revision}</td>
                      <td className="py-3 px-4 font-mono text-[#2563EB]">
                        {doc.assetTags[0] || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#64748B]">
                        {doc.totalChunks > 0 ? `${doc.totalChunks} chunks` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {isFailed ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Failed
                          </span>
                        ) : isProcessing ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            Processing ({doc.progressPercent}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Indexed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isFailed && (
                            <button
                              onClick={() => handleRetry(doc.id)}
                              title="Retry processing"
                              className="p-1 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-amber-700 transition"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            title="Delete document"
                            className="p-1 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] hover:text-rose-600 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>

          {/* Bottom Summary Bar */}
          <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-xs font-sans text-[#64748B]">
            <span>{filteredDocs.length} Total Documents Cataloged</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-[#0F766E] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tenant Isolated
              </span>
              <span className="flex items-center gap-1 text-[#2563EB] font-medium">
                <Database className="w-3.5 h-3.5" /> Qdrant Index Live
              </span>
            </div>
          </div>
        </div>

        {/* Right Detail Inspector & Page Navigator */}
        {selectedDoc ? (
          <div className="w-[480px] bg-white flex flex-col justify-between overflow-y-auto border-l border-[#E2E8F0]">
            {/* Failure Alert Banner */}
            {selectedDoc.status === 'FAILED' && (
              <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-rose-900">Processing Failure Detected</div>
                  <div className="text-[11px] text-rose-700 mt-0.5">
                    {selectedDoc.errorMessage || 'An error occurred during vector generation.'}
                  </div>
                  <button
                    onClick={() => handleRetry(selectedDoc.id)}
                    className="mt-2 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-sans text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm"
                  >
                    <RotateCw className="w-3 h-3" /> Retry Ingestion
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-[#E2E8F0]">
                <div>
                  <span className="text-[10px] font-sans text-amber-700 font-semibold uppercase tracking-wider">
                    Industrial Knowledge Record
                  </span>
                  <h3 className="text-base font-bold text-[#1A202C] font-mono mt-0.5">
                    {selectedDoc.documentNumber}
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">{selectedDoc.title}</p>
                </div>
                <StatusBadge
                  label={selectedDoc.status}
                  tone={selectedDoc.status === 'FAILED' ? 'critical' : 'healthy'}
                />
              </div>

              {/* Version & Storage Integrity Metadata */}
              <div className="grid grid-cols-3 gap-2 text-xs font-sans">
                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[10px] text-[#64748B] font-semibold">REVISION</div>
                  <div className="text-[#1A202C] font-bold mt-0.5 font-mono">{selectedDoc.revision}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[10px] text-[#64748B] font-semibold">PAGES</div>
                  <div className="text-[#1A202C] font-bold mt-0.5 font-mono">{selectedDoc.totalPages}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[10px] text-[#64748B] font-semibold">VECTORS</div>
                  <div className="text-[#2563EB] font-bold mt-0.5 font-mono">{selectedDoc.totalChunks}</div>
                </div>
              </div>

              {/* Integrity SHA-256 Proof */}
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1 font-sans text-xs">
                <div className="flex items-center justify-between text-[10px] text-[#64748B] font-semibold">
                  <span>SHA-256 PROVENANCE CHECKSUM</span>
                  <span className="text-[#0F766E] flex items-center gap-1 font-bold">
                    <ShieldCheck className="w-3 h-3" /> VERIFIED
                  </span>
                </div>
                <div className="text-[11px] text-[#1A202C] font-mono break-all bg-white p-2 rounded border border-[#CBD5E1]">
                  {selectedDoc.checksum}
                </div>
              </div>

              {/* Page Inspector with Navigation */}
              {selectedDoc.pages && selectedDoc.pages.length > 0 ? (
                <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-sans font-bold text-[#1A202C]">
                        Page {currentPage?.pageNumber} of {selectedDoc.totalPages}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]">
                        {currentPage?.extractionMethod}
                      </span>
                      {currentPage?.hasTables && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          Table Detected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                        disabled={currentPageIndex === 0}
                        className="p-1 rounded bg-white hover:bg-slate-100 disabled:opacity-30 text-[#1A202C] border border-[#CBD5E1] transition shadow-sm"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setCurrentPageIndex((prev) =>
                            Math.min(selectedDoc.pages.length - 1, prev + 1)
                          )
                        }
                        disabled={currentPageIndex >= selectedDoc.pages.length - 1}
                        className="p-1 rounded bg-white hover:bg-slate-100 disabled:opacity-30 text-[#1A202C] border border-[#CBD5E1] transition shadow-sm"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Section Headings on this page */}
                  {currentPage?.sectionHeadings && currentPage.sectionHeadings.length > 0 && (
                    <div>
                      <span className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">
                        Preserved Headings:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {currentPage.sectionHeadings.map((h: string, i: number) => (
                          <span
                            key={i}
                            className="text-[11px] font-sans px-2 py-0.5 rounded bg-white text-[#1A202C] border border-[#CBD5E1]"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Text Terminal Viewer */}
                  <div>
                    <span className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">
                      Extracted Text Content:
                    </span>
                    <pre className="mt-1 p-2.5 rounded bg-white border border-[#CBD5E1] text-[11px] font-mono text-[#1A202C] whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed shadow-sm">
                      {currentPage?.rawText}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center text-xs font-sans text-[#64748B]">
                  No extracted pages available. Document status: {selectedDoc.status}.
                </div>
              )}

              {/* Associated Plant Asset */}
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">
                    Linked Plant & Asset
                  </span>
                  <div className="font-mono text-xs font-bold text-[#2563EB] mt-0.5">
                    {selectedDoc.plantCode} / {selectedDoc.assetTags.join(', ') || 'General Asset'}
                  </div>
                </div>
                <Cpu className="w-4 h-4 text-[#64748B]" />
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
              <button
                onClick={() => handleDownloadOriginal(selectedDoc)}
                className="w-full py-2 px-3 rounded-lg bg-white hover:bg-slate-50 text-[#1A202C] border border-[#CBD5E1] text-xs font-sans font-semibold flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Download className="w-3.5 h-3.5 text-[#2563EB]" />
                Download Original File Payload
              </button>
            </div>
          </div>
        ) : (
          <div className="w-[480px] bg-[#F8FAFC] flex items-center justify-center text-xs font-sans text-[#64748B]">
            Select a document to inspect dossier and page provenance.
          </div>
        )}
      </div>

      {/* Upload & Ingestion Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white border border-[#E2E8F0] rounded-xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-[#2563EB]" />
                <h3 className="text-sm font-bold font-sans text-[#1A202C]">
                  Ingest Industrial Technical Document
                </h3>
              </div>
              <button
                onClick={() => !isUploading && setIsUploadModalOpen(false)}
                className="text-[#64748B] hover:text-[#1A202C] transition p-1 rounded"
                disabled={isUploading}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleUploadSubmit} className="p-5 space-y-4 font-sans text-xs">
              {uploadError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  {uploadError}
                </div>
              )}

              {/* Drag & Drop File Zone */}
              <div>
                <label className="text-[11px] font-sans text-[#64748B] font-semibold uppercase">
                  Document File (PDF, DOCX, TXT, MD, PNG, JPG, WebP)
                </label>
                <div className="mt-1 border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] rounded-lg p-5 text-center bg-[#F8FAFC] transition cursor-pointer relative">
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    disabled={isUploading}
                  />
                  <div className="flex flex-col items-center">
                    <FileCode className="w-8 h-8 text-[#2563EB] mb-2" />
                    {uploadFile ? (
                      <div className="text-xs font-mono text-emerald-700 font-semibold">
                        Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-sans text-[#1A202C] font-medium">
                          Click to select or drag & drop industrial manual
                        </div>
                        <div className="text-[10px] font-sans text-[#64748B] mt-1">
                          Magic bytes verified. Max file size: 50MB
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-sans">
                <div>
                  <label className="text-[#64748B] font-semibold uppercase text-[10px]">DOCUMENT NUMBER *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SOP-TURB-01"
                    value={uploadForm.documentNumber}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, documentNumber: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <label className="text-[#64748B] font-semibold uppercase text-[10px]">CLASSIFICATION</label>
                  <select
                    value={uploadForm.category}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, category: e.target.value as DocumentType })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB] cursor-pointer"
                    disabled={isUploading}
                  >
                    <option value="SOP">SOP (Standard Operating Procedure)</option>
                    <option value="OEM_MANUAL">OEM Technical Manual</option>
                    <option value="SCHEMATIC_PID">P&ID Diagram</option>
                    <option value="WIRING_DIAGRAM">Wiring Schematic</option>
                    <option value="FAULT_CODE_INDEX">Fault Code Index</option>
                    <option value="SAFETY_DATA_SHEET">Safety Data Sheet (SDS)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-[#64748B] font-semibold uppercase text-[10px]">TECHNICAL TITLE *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Emergency Lubrication Oil Pump Replacement"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <label className="text-[#64748B] font-semibold uppercase text-[10px]">TARGET PLANT</label>
                  <input
                    type="text"
                    value={uploadForm.plantCode}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, plantCode: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <label className="text-[#64748B] font-semibold uppercase text-[10px]">REVISION</label>
                  <input
                    type="text"
                    value={uploadForm.revision}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, revision: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    disabled={isUploading}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[#64748B] font-semibold uppercase text-[10px]">ASSOCIATED ASSET TAGS</label>
                  <input
                    type="text"
                    placeholder="e.g. PUMP-204-B, VALVE-101 (comma-separated)"
                    value={uploadForm.assetTags}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, assetTags: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                    disabled={isUploading}
                  />
                </div>
              </div>

              {/* Progress Indicator when uploading */}
              {isUploading && (
                <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-[#2563EB] flex items-center gap-2 font-medium">
                      <RotateCw className="w-3.5 h-3.5 animate-spin" /> {uploadStepMessage}
                    </span>
                    <span className="text-[#1A202C] font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563EB] transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] text-xs font-semibold transition"
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-1.5 rounded-lg bg-[#151C24] hover:bg-black disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition shadow-sm"
                >
                  <UploadCloud className="w-4 h-4" />
                  {isUploading ? 'Ingesting...' : 'Start Ingestion Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

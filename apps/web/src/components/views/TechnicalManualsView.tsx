import React, { useState } from 'react';
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
}

const INITIAL_DOCUMENTS: HubDocument[] = [
  {
    id: 'doc-001',
    documentNumber: 'SOP-MECH-401',
    title: 'Emergency Centrifugal Pump LOTO & Seal Overhaul Procedure',
    category: 'SOP',
    revision: 'REV-C',
    status: 'INDEXED',
    plantCode: 'PLANT-TX-04',
    fileSizeBytes: 2457600,
    mimeType: 'text/markdown',
    checksum: 'sha256:8f4b52c009d1...39e14a',
    totalPages: 3,
    totalChunks: 6,
    assetTags: ['PUMP-204-B', 'VALVE-101'],
    retryCount: 0,
    progressPercent: 100,
    currentStep: 'Vector indexing completed successfully',
    updatedAt: '2026-10-18 09:30 UTC',
    pages: [
      {
        pageNumber: 1,
        rawText: `# SOP-MECH-401: Emergency Centrifugal Pump LOTO Procedure
Revision: REV-C
Asset Tag: PUMP-204-B

## SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION
Before commencing mechanical overhaul on Centrifugal Pump PUMP-204-B, all suction and discharge isolation valves (V-101 and V-102) must be mechanically locked out and tagged according to OSHA Standard 1910.147.

| Step | Hazard Identified | Engineering Control | Required PPE |
| :--- | :--- | :--- | :--- |
| 1.1 | High-Pressure Hydrocarbon (450 PSI) | Double Block & Bleed | Chemical Splash Goggles, Nitrile Gloves |
| 1.2 | Electrical Energy 480V 3-Phase | Breaker Padlock & Zero-Energy Test | Category 2 Arc Flash Suit |`,
        sectionHeadings: ['SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION'],
        extractionMethod: 'MARKDOWN_AST',
        hasTables: true,
      },
      {
        pageNumber: 2,
        rawText: `## SECTION 2: CASING DRAIN & VENT PROCEDURE
1. Connect grounded copper bonding clamp to casing test nipple.
2. Slowly open casing drain valve VD-04 into slop manifold until pressure gauge PI-204 reads 0.0 PSIG.
3. Loosen gland follower bolts in cross-pattern to prevent binding of carbon seal rings.`,
        sectionHeadings: ['SECTION 2: CASING DRAIN & VENT PROCEDURE'],
        extractionMethod: 'MARKDOWN_AST',
        hasTables: false,
      },
      {
        pageNumber: 3,
        rawText: `## SECTION 3: SHAFT RUNOUT & IMPELLER CLEARANCE
1. Position magnetic-base dial indicator tip against pump drive shaft.
2. Rotate shaft by hand through 360 degrees. Total Indicator Reading (TIR) must not exceed +/- 0.002 inches.
3. Torque casing bolts to 185 ft-lbs in star sequence.`,
        sectionHeadings: ['SECTION 3: SHAFT RUNOUT & IMPELLER CLEARANCE'],
        extractionMethod: 'MARKDOWN_AST',
        hasTables: false,
      },
    ],
    chunks: [
      {
        chunkIndex: 0,
        qdrantPointId: 'b7552fed-d23f-4490-948a-6a2afe519039',
        pageNumber: 1,
        sectionHeading: 'SECTION 1: MANDATORY SAFETY & HAZARD MITIGATION',
        content: 'Emergency Centrifugal Pump LOTO Procedure. Isolation valves V-101 and V-102 must be locked out per OSHA 1910.147.',
        isTable: true,
      },
      {
        chunkIndex: 1,
        qdrantPointId: 'cbd251e8-4257-4fe6-a011-b0565b449ea3',
        pageNumber: 2,
        sectionHeading: 'SECTION 2: CASING DRAIN & VENT PROCEDURE',
        content: 'Connect grounded copper bonding clamp to casing test nipple. Loosen gland follower bolts in cross-pattern.',
        isTable: false,
      },
    ],
  },
  {
    id: 'doc-002',
    documentNumber: 'OEM-MAN-883',
    title: 'Flowserve Mark 3 ANSI Chemical Process Pump Operations Manual',
    category: 'OEM_MANUAL',
    revision: 'REV-2',
    status: 'INDEXED',
    plantCode: 'PLANT-TX-04',
    fileSizeBytes: 8493021,
    mimeType: 'application/pdf',
    checksum: 'sha256:e3b0c44298fc...1c49aa',
    totalPages: 4,
    totalChunks: 12,
    assetTags: ['PUMP-204-B'],
    retryCount: 0,
    progressPercent: 100,
    currentStep: 'Vector indexing completed',
    updatedAt: '2026-10-14 14:15 UTC',
    pages: [
      {
        pageNumber: 1,
        rawText: `FLOWSERVE MARK 3 ANSI B73.1 PROCESS PUMP
Installation, Operation and Maintenance Instructions
Flowserve Pump Division — Industrial Machinery`,
        sectionHeadings: ['FLOWSERVE MARK 3 ANSI B73.1 PROCESS PUMP'],
        extractionMethod: 'NATIVE_TEXT',
        hasTables: false,
      },
    ],
    chunks: [
      {
        chunkIndex: 0,
        qdrantPointId: '3e45c6c2-0d4c-436a-b3e2-60941b439bc5',
        pageNumber: 1,
        sectionHeading: 'FLOWSERVE MARK 3 ANSI B73.1 PROCESS PUMP',
        content: 'Installation, Operation and Maintenance Instructions for Flowserve Mark 3 ANSI Chemical Process Pump.',
        isTable: false,
      },
    ],
  },
  {
    id: 'doc-003',
    documentNumber: 'PID-DWG-4010',
    title: 'Crude Distillation Unit 1 Piping & Instrumentation Diagram (Scanned)',
    category: 'SCHEMATIC_PID',
    revision: 'REV-8',
    status: 'INDEXED',
    plantCode: 'PLANT-TX-04',
    fileSizeBytes: 5218390,
    mimeType: 'application/pdf',
    checksum: 'sha256:119ca4930128...fa2210',
    totalPages: 1,
    totalChunks: 2,
    assetTags: ['CDU-LINE-01'],
    retryCount: 0,
    progressPercent: 100,
    currentStep: 'OCR & layout extraction completed',
    updatedAt: '2026-10-16 11:20 UTC',
    pages: [
      {
        pageNumber: 1,
        rawText: `[OCR EXTRACTED — SCANNED MANUAL: PID-DWG-4010.pdf (PAGE 1)]
SECTION: OPTICAL CHARACTER RECOGNITION SUMMARY
Extracted alphanumeric industrial identifiers:
LINE-4-CDU-CRUDE-HC-400-A1A PUMP-204-A PUMP-204-B V-101 V-102 PI-204 FT-101
Operational Notice: Scanned documentation processed via layout-aware OCR engine. Note: CAD symbology is indexed as visual bounding vectors; native CAD parsing not claimed in Phase 3.`,
        sectionHeadings: ['OPTICAL CHARACTER RECOGNITION SUMMARY'],
        extractionMethod: 'OCR',
        hasTables: false,
      },
    ],
    chunks: [
      {
        chunkIndex: 0,
        qdrantPointId: 'afb28f49-9e85-4aa4-9137-3d0233e1becd',
        pageNumber: 1,
        sectionHeading: 'OPTICAL CHARACTER RECOGNITION SUMMARY',
        content: 'LINE-4-CDU-CRUDE-HC-400-A1A PUMP-204-A PUMP-204-B V-101 V-102 PI-204 FT-101',
        isTable: false,
      },
    ],
  },
  {
    id: 'doc-004',
    documentNumber: 'ELEC-WIR-209',
    title: 'Variable Frequency Drive (VFD) 4160V High Voltage Feed Wiring Diagram',
    category: 'WIRING_DIAGRAM',
    revision: 'REV-1',
    status: 'FAILED',
    plantCode: 'PLANT-TX-04',
    fileSizeBytes: 1492039,
    mimeType: 'application/pdf',
    checksum: 'sha256:99dabb014492...ff0123',
    totalPages: 0,
    totalChunks: 0,
    assetTags: ['VFD-DRV-04'],
    errorMessage: 'Embedding generation failed: Provider service inference timeout after 30000ms.',
    retryCount: 1,
    progressPercent: 40,
    currentStep: 'Failed during embedding vectorization step',
    updatedAt: '2026-10-18 10:15 UTC',
    pages: [],
    chunks: [],
  },
];

export const TechnicalManualsView: React.FC = () => {
  const [documents, setDocuments] = useState<HubDocument[]>(INITIAL_DOCUMENTS);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDoc, setSelectedDoc] = useState<HubDocument | null>(INITIAL_DOCUMENTS[0]);
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

  // Handle retry
  const handleRetry = (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        return {
          ...d,
          status: 'PROCESSING',
          progressPercent: 20,
          currentStep: 'Retrying layout parsing and OCR...',
          retryCount: d.retryCount + 1,
          errorMessage: null,
        };
      })
    );

    // Simulate asynchronous pipeline retry
    setTimeout(() => {
      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id !== docId) return d;
          return {
            ...d,
            status: 'INDEXED',
            progressPercent: 100,
            currentStep: 'Successfully re-indexed and synchronized into Qdrant',
            totalPages: 2,
            totalChunks: 4,
            errorMessage: null,
            pages: [
              {
                pageNumber: 1,
                rawText: `VFD-4160V HIGH VOLTAGE SCHEMATIC (RETRY SUCCESSFUL)\nTerminal blocks TB-1, TB-2, TB-3 verified.\nBreaker trip coil rated 125VDC.`,
                sectionHeadings: ['HIGH VOLTAGE POWER CONNECTIONS'],
                extractionMethod: 'NATIVE_TEXT',
                hasTables: true,
              },
            ],
            chunks: [
              {
                chunkIndex: 0,
                qdrantPointId: '7ef7b833-4da9-40e3-b801-7e45f2b95ca0',
                pageNumber: 1,
                sectionHeading: 'HIGH VOLTAGE POWER CONNECTIONS',
                content: 'Terminal blocks TB-1, TB-2, TB-3 verified. Breaker trip coil rated 125VDC.',
                isTable: true,
              },
            ],
          };
        })
      );
    }, 1500);
  };

  // Handle delete document
  const handleDeleteDoc = (docId: string) => {
    if (!confirm('Are you sure you want to delete this document and all associated Qdrant vector chunks?')) {
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (selectedDoc?.id === docId) {
      setSelectedDoc(documents.find((d) => d.id !== docId) || null);
    }
  };

  // Handle simulated upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a file to ingest.');
      return;
    }

    if (!uploadForm.documentNumber || !uploadForm.title) {
      setUploadError('Document Number and Title are required.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(10);
    setUploadStepMessage('Verifying magic bytes and file integrity...');

    setTimeout(() => {
      setUploadProgress(35);
      setUploadStepMessage('Parsing page boundaries and headings...');
    }, 400);

    setTimeout(() => {
      setUploadProgress(65);
      setUploadStepMessage('Preserving provenance and chunking content...');
    }, 800);

    setTimeout(() => {
      setUploadProgress(85);
      setUploadStepMessage('Generating BGE-M3 vector embeddings...');
    }, 1200);

    setTimeout(() => {
      const isScanned = uploadFile.name.toLowerCase().includes('scan');
      const isDocx = uploadFile.name.toLowerCase().endsWith('.docx');
      const isImage = uploadFile.type.startsWith('image/');

      const extractionMethod: ExtractionMethod = isScanned
        ? 'OCR'
        : isDocx
        ? 'DOCX_XML'
        : isImage
        ? 'IMAGE_METADATA'
        : uploadFile.name.endsWith('.md')
        ? 'MARKDOWN_AST'
        : 'NATIVE_TEXT';

      const newDoc: HubDocument = {
        id: `doc-${Date.now()}`,
        documentNumber: uploadForm.documentNumber.toUpperCase(),
        title: uploadForm.title,
        category: uploadForm.category,
        revision: uploadForm.revision,
        status: 'INDEXED',
        plantCode: uploadForm.plantCode,
        fileSizeBytes: uploadFile.size,
        mimeType: uploadFile.type || 'application/octet-stream',
        checksum: `sha256:${Math.random().toString(16).substring(2, 14)}...verified`,
        totalPages: 2,
        totalChunks: 4,
        assetTags: uploadForm.assetTags
          ? uploadForm.assetTags.split(',').map((t) => t.trim())
          : ['PLANT-GENERAL'],
        retryCount: 0,
        progressPercent: 100,
        currentStep: 'Vector indexing completed successfully',
        updatedAt: 'Just now',
        pages: [
          {
            pageNumber: 1,
            rawText: `[INGESTED DOCUMENT: ${uploadForm.documentNumber}]\nTitle: ${uploadForm.title}\nExtraction: ${extractionMethod}\nPage 1 Content: Verified industrial equipment operating procedure.\nAll Lockout/Tagout isolation steps confirmed before maintenance.`,
            sectionHeadings: [`PROCEDURE: ${uploadForm.title}`],
            extractionMethod,
            hasTables: false,
          },
          {
            pageNumber: 2,
            rawText: `## SECTION 2: VERIFICATION CHECKPOINTS\n- Pressure differential limit: 15.0 PSID\n- Lubrication oil viscosity: ISO VG 46\n- Maximum vibration amplitude: 0.15 in/sec RMS`,
            sectionHeadings: ['SECTION 2: VERIFICATION CHECKPOINTS'],
            extractionMethod,
            hasTables: true,
          },
        ],
        chunks: [
          {
            chunkIndex: 0,
            qdrantPointId: '46b5f78d-2c2f-4964-9052-b5160b532cbd',
            pageNumber: 1,
            sectionHeading: `PROCEDURE: ${uploadForm.title}`,
            content: `Verified industrial equipment operating procedure for ${uploadForm.documentNumber}.`,
            isTable: false,
          },
          {
            chunkIndex: 1,
            qdrantPointId: 'b982d3e7-7e21-47c3-9843-5e5435bec860',
            pageNumber: 2,
            sectionHeading: 'SECTION 2: VERIFICATION CHECKPOINTS',
            content: 'Pressure differential limit: 15.0 PSID. Lubrication oil viscosity: ISO VG 46.',
            isTable: true,
          },
        ],
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setSelectedDoc(newDoc);
      setCurrentPageIndex(0);
      setIsUploading(false);
      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadForm({
        documentNumber: '',
        title: '',
        category: 'SOP',
        revision: 'REV-A',
        plantCode: 'PLANT-TX-04',
        assetTags: '',
      });
    }, 1600);
  };

  const currentPage =
    selectedDoc?.pages && selectedDoc.pages.length > 0
      ? selectedDoc.pages[currentPageIndex]
      : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#070B10] text-slate-100 font-sans">
      {/* Top Action Bar */}
      <div className="p-4 border-b border-[#1E293B] bg-[#0E1520] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[320px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Document #, Title, or Asset Tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#111722] border border-[#1E293B] rounded-lg text-xs font-sans text-white placeholder-slate-400 focus:outline-none focus:border-[#A3E635] transition"
            />
          </div>

          {/* Classification Filter */}
          <div className="flex items-center gap-1.5 bg-[#111722] border border-[#1E293B] rounded-lg px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-sans text-slate-200 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#151E28]">All Categories</option>
              <option value="SOP" className="bg-[#151E28]">SOPs</option>
              <option value="OEM_MANUAL" className="bg-[#151E28]">OEM Manuals</option>
              <option value="SCHEMATIC_PID" className="bg-[#151E28]">P&IDs</option>
              <option value="WIRING_DIAGRAM" className="bg-[#151E28]">Wiring Diagrams</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-[#111722] border border-[#1E293B] rounded-lg px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-xs font-sans text-slate-200 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#151E28]">All Statuses</option>
              <option value="INDEXED" className="bg-[#151E28]">Indexed</option>
              <option value="PROCESSING" className="bg-[#151E28]">Processing</option>
              <option value="FAILED" className="bg-[#151E28]">Failed</option>
              <option value="QUEUED" className="bg-[#151E28]">Queued</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#A3E635] hover:bg-[#bef264] text-[#070B10] text-xs font-bold flex items-center gap-2 shadow-lg transition"
          >
            <UploadCloud className="w-4 h-4" />
            Ingest Document
          </button>
        </div>
      </div>

      {/* Main Split Layout: Document List + Detail Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Table */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#1E293B]">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1E293B] bg-[#0E1520] sticky top-0 z-10 text-slate-400 font-sans text-[11px]">
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
              <tbody className="divide-y divide-[#182333]">
                {filteredDocs.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  const isFailed = doc.status === 'FAILED';
                  const isProcessing = doc.status === 'PROCESSING';

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoc(doc);
                        setCurrentPageIndex(0);
                      }}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-[#141E2B] text-white font-medium'
                          : 'hover:bg-[#141E2B]/50 text-slate-300'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-[#A3E635] flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        {doc.documentNumber}
                      </td>
                      <td className="py-3 px-4 font-medium max-w-xs truncate text-white">
                        {doc.title}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {doc.category}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{doc.revision}</td>
                      <td className="py-3 px-4 font-mono text-cyan-400">
                        {doc.assetTags[0] || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {doc.totalChunks > 0 ? `${doc.totalChunks} chunks` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {isFailed ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-400 border border-rose-800/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Failed
                          </span>
                        ) : isProcessing ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-950/70 text-blue-400 border border-blue-800/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                            Processing ({doc.progressPercent}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 text-[#A3E635] border border-emerald-800/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E635]" />
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
                              className="p-1 rounded bg-[#1A2534] hover:bg-[#253448] text-amber-400 transition"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            title="Delete document"
                            className="p-1 rounded bg-[#1A2534] hover:bg-[#253448] text-slate-400 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Summary Bar */}
          <div className="p-3 border-t border-[#1E293B] bg-[#0E1520] flex items-center justify-between text-xs font-mono text-slate-400">
            <span>{filteredDocs.length} Total Documents Cataloged</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-[#A3E635]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tenant Isolated
              </span>
              <span className="flex items-center gap-1 text-cyan-400">
                <Database className="w-3.5 h-3.5" /> Qdrant Index Live
              </span>
            </div>
          </div>
        </div>

        {/* Right Detail Inspector & Page Navigator */}
        {selectedDoc ? (
          <div className="w-[480px] bg-[#0E1520] flex flex-col justify-between overflow-y-auto border-l border-[#1E293B]">
            {/* Failure Alert Banner */}
            {selectedDoc.status === 'FAILED' && (
              <div className="p-3 bg-crimson-950/60 border-b border-crimson-800/80 text-crimson-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-crimson-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-crimson-200">Processing Failure Detected</div>
                  <div className="text-[11px] text-crimson-400/90 mt-0.5">
                    {selectedDoc.errorMessage || 'An error occurred during vector generation.'}
                  </div>
                  <button
                    onClick={() => handleRetry(selectedDoc.id)}
                    className="mt-2 px-2.5 py-1 rounded bg-crimson-600 hover:bg-crimson-500 text-white font-mono text-[11px] font-bold flex items-center gap-1.5 transition"
                  >
                    <RotateCw className="w-3 h-3" /> Retry Ingestion
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-graphite-800">
                <div>
                  <span className="text-[10px] font-mono text-amber-500 uppercase tracking-wider">
                    Industrial Knowledge Record
                  </span>
                  <h3 className="text-base font-bold text-graphite-100 font-mono mt-0.5">
                    {selectedDoc.documentNumber}
                  </h3>
                  <p className="text-xs text-graphite-300 mt-0.5">{selectedDoc.title}</p>
                </div>
                <StatusBadge
                  label={selectedDoc.status}
                  tone={selectedDoc.status === 'FAILED' ? 'critical' : 'healthy'}
                />
              </div>

              {/* Version & Storage Integrity Metadata */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-graphite-950 border border-graphite-800">
                  <div className="text-[10px] text-graphite-500">REVISION</div>
                  <div className="text-graphite-100 font-bold mt-0.5">{selectedDoc.revision}</div>
                </div>
                <div className="p-2 rounded bg-graphite-950 border border-graphite-800">
                  <div className="text-[10px] text-graphite-500">PAGES</div>
                  <div className="text-graphite-100 font-bold mt-0.5">{selectedDoc.totalPages}</div>
                </div>
                <div className="p-2 rounded bg-graphite-950 border border-graphite-800">
                  <div className="text-[10px] text-graphite-500">VECTORS</div>
                  <div className="text-cyan-400 font-bold mt-0.5">{selectedDoc.totalChunks}</div>
                </div>
              </div>

              {/* Integrity SHA-256 Proof */}
              <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800 space-y-1 font-mono text-xs">
                <div className="flex items-center justify-between text-[10px] text-graphite-500">
                  <span>SHA-256 PROVENANCE CHECKSUM</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> VERIFIED
                  </span>
                </div>
                <div className="text-[11px] text-graphite-300 break-all bg-graphite-900 p-1.5 rounded border border-graphite-850">
                  {selectedDoc.checksum}
                </div>
              </div>

              {/* Page Inspector with Navigation */}
              {selectedDoc.pages && selectedDoc.pages.length > 0 ? (
                <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-graphite-850 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-amber-400">
                        Page {currentPage?.pageNumber} of {selectedDoc.totalPages}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-graphite-800 text-graphite-300">
                        {currentPage?.extractionMethod}
                      </span>
                      {currentPage?.hasTables && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-800">
                          Table Detected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                        disabled={currentPageIndex === 0}
                        className="p-1 rounded bg-graphite-850 hover:bg-graphite-800 disabled:opacity-30 text-graphite-200 transition"
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
                        className="p-1 rounded bg-graphite-850 hover:bg-graphite-800 disabled:opacity-30 text-graphite-200 transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Section Headings on this page */}
                  {currentPage?.sectionHeadings && currentPage.sectionHeadings.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono text-graphite-500 uppercase">
                        Preserved Headings:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {currentPage.sectionHeadings.map((h, i) => (
                          <span
                            key={i}
                            className="text-[11px] font-mono px-2 py-0.5 rounded bg-graphite-900 text-graphite-300 border border-graphite-800"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Text Terminal Viewer */}
                  <div>
                    <span className="text-[10px] font-mono text-graphite-500 uppercase">
                      Extracted Text Content:
                    </span>
                    <pre className="mt-1 p-2.5 rounded bg-graphite-900 border border-graphite-850 text-[11px] font-mono text-graphite-200 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                      {currentPage?.rawText}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded bg-graphite-950 border border-graphite-800 text-center text-xs font-mono text-graphite-500">
                  No extracted pages available. Document status: {selectedDoc.status}.
                </div>
              )}

              {/* Associated Plant Asset */}
              <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-mono text-graphite-500 uppercase">
                    Linked Plant & Asset
                  </span>
                  <div className="font-mono text-xs font-bold text-cyan-400 mt-0.5">
                    {selectedDoc.plantCode} / {selectedDoc.assetTags.join(', ') || 'General Asset'}
                  </div>
                </div>
                <Cpu className="w-4 h-4 text-graphite-500" />
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-graphite-800 bg-graphite-900/90">
              <button className="w-full py-2 px-3 rounded bg-graphite-800 hover:bg-graphite-700 text-graphite-200 border border-graphite-700 text-xs font-mono font-medium flex items-center justify-center gap-2 transition">
                <Download className="w-3.5 h-3.5 text-amber-400" />
                Download Original File Payload
              </button>
            </div>
          </div>
        ) : (
          <div className="w-[480px] bg-graphite-900/40 flex items-center justify-center text-xs font-mono text-graphite-500">
            Select a document to inspect dossier and page provenance.
          </div>
        )}
      </div>

      {/* Upload & Ingestion Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-graphite-900 border border-graphite-700 rounded-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-graphite-800 flex items-center justify-between bg-graphite-950">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold font-mono text-graphite-100">
                  Ingest Industrial Technical Document
                </h3>
              </div>
              <button
                onClick={() => !isUploading && setIsUploadModalOpen(false)}
                className="text-graphite-400 hover:text-graphite-200 transition"
                disabled={isUploading}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleUploadSubmit} className="p-5 space-y-4">
              {uploadError && (
                <div className="p-2.5 rounded bg-crimson-950/80 border border-crimson-800 text-crimson-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {uploadError}
                </div>
              )}

              {/* Drag & Drop File Zone */}
              <div>
                <label className="text-[11px] font-mono text-graphite-400 uppercase">
                  Document File (PDF, DOCX, TXT, MD, PNG, JPG, WebP)
                </label>
                <div className="mt-1 border-2 border-dashed border-graphite-700 hover:border-amber-500/60 rounded-lg p-5 text-center bg-graphite-950 transition cursor-pointer relative">
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    disabled={isUploading}
                  />
                  <div className="flex flex-col items-center">
                    <FileCode className="w-8 h-8 text-amber-400/80 mb-2" />
                    {uploadFile ? (
                      <div className="text-xs font-mono text-emerald-400 font-semibold">
                        Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-mono text-graphite-300">
                          Click to select or drag & drop industrial manual
                        </div>
                        <div className="text-[10px] font-mono text-graphite-500 mt-1">
                          Magic bytes verified. Max file size: 50MB
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <label className="text-graphite-400">DOCUMENT NUMBER *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SOP-TURB-01"
                    value={uploadForm.documentNumber}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, documentNumber: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-200 focus:outline-none focus:border-amber-500"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <label className="text-graphite-400">CLASSIFICATION</label>
                  <select
                    value={uploadForm.category}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, category: e.target.value as DocumentType })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-200 focus:outline-none focus:border-amber-500 cursor-pointer"
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
                  <label className="text-graphite-400">TECHNICAL TITLE *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Emergency Lubrication Oil Pump Replacement"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-200 focus:outline-none focus:border-amber-500"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <label className="text-graphite-400">TARGET PLANT</label>
                  <input
                    type="text"
                    value={uploadForm.plantCode}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, plantCode: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-200 focus:outline-none focus:border-amber-500"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <label className="text-graphite-400">REVISION</label>
                  <input
                    type="text"
                    value={uploadForm.revision}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, revision: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-200 focus:outline-none focus:border-amber-500"
                    disabled={isUploading}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-graphite-400">ASSOCIATED ASSET TAGS</label>
                  <input
                    type="text"
                    placeholder="e.g. PUMP-204-B, VALVE-101 (comma-separated)"
                    value={uploadForm.assetTags}
                    onChange={(e) =>
                      setUploadForm({ ...uploadForm, assetTags: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 rounded bg-graphite-950 border border-graphite-800 text-graphite-200 focus:outline-none focus:border-amber-500"
                    disabled={isUploading}
                  />
                </div>
              </div>

              {/* Progress Indicator when uploading */}
              {isUploading && (
                <div className="space-y-2 pt-2 border-t border-graphite-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-amber-400 flex items-center gap-2">
                      <RotateCw className="w-3.5 h-3.5 animate-spin" /> {uploadStepMessage}
                    </span>
                    <span className="text-graphite-300 font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-graphite-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-graphite-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-1.5 rounded bg-graphite-800 hover:bg-graphite-700 text-graphite-300 text-xs font-mono transition"
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-graphite-950 text-xs font-mono font-bold flex items-center gap-2 transition"
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

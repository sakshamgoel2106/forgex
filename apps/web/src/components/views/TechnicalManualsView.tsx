import React, { useState } from 'react';
import {
  Search,
  Filter,
  Download,
  ExternalLink,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

interface DocumentRecord {
  id: string;
  docNumber: string;
  title: string;
  category: 'SOP' | 'OEM_MANUAL' | 'SCHEMATIC_PID' | 'WIRING_DIAGRAM';
  revision: string;
  status: 'INDEXED' | 'PARSING' | 'PENDING';
  totalPages: number;
  chunksIndexed: number;
  checksum: string;
  assetTag: string;
  updatedAt: string;
}

const SAMPLE_DOCS: DocumentRecord[] = [
  {
    id: 'doc-001',
    docNumber: 'SOP-MTR-042',
    title: 'Centrifugal Slurry Pump Overhaul & Mechanical Seal Replacement',
    category: 'SOP',
    revision: 'Rev 4.1',
    status: 'INDEXED',
    totalPages: 48,
    chunksIndexed: 312,
    checksum: 'sha256:8f4b...39e1',
    assetTag: 'PUMP-204-B',
    updatedAt: '2026-10-12 09:30 UTC',
  },
  {
    id: 'doc-002',
    docNumber: 'OEM-MAN-883',
    title: 'Flowserve Mark 3 ANSI Chemical Process Pump Operations Manual',
    category: 'OEM_MANUAL',
    revision: 'Rev 2.0',
    status: 'INDEXED',
    totalPages: 184,
    chunksIndexed: 1420,
    checksum: 'sha256:e3b0...c49a',
    assetTag: 'PUMP-204-B',
    updatedAt: '2026-09-28 14:15 UTC',
  },
  {
    id: 'doc-003',
    docNumber: 'PID-DWG-4010',
    title: 'Crude Distillation Unit 1 Piping & Instrumentation Diagram (P&ID)',
    category: 'SCHEMATIC_PID',
    revision: 'Rev 8.0',
    status: 'INDEXED',
    totalPages: 6,
    chunksIndexed: 94,
    checksum: 'sha256:119c...fa22',
    assetTag: 'CDU-LINE-01',
    updatedAt: '2026-10-04 11:20 UTC',
  },
  {
    id: 'doc-004',
    docNumber: 'ELEC-WIR-209',
    title: 'Variable Frequency Drive (VFD) 4160V High Voltage Wiring Schematic',
    category: 'WIRING_DIAGRAM',
    revision: 'Rev 1.3',
    status: 'INDEXED',
    totalPages: 12,
    chunksIndexed: 148,
    checksum: 'sha256:99da...bb01',
    assetTag: 'VFD-DRV-04',
    updatedAt: '2026-08-19 16:40 UTC',
  },
];

export const TechnicalManualsView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(SAMPLE_DOCS[0]);

  const filteredDocs = SAMPLE_DOCS.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.docNumber.toLowerCase().includes(search.toLowerCase()) ||
      doc.assetTag.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'ALL' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Top Filter & Action Bar */}
      <div className="p-4 border-b border-graphite-800 bg-graphite-900/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-graphite-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Document Number, Equipment Tag, or Title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-graphite-950 border border-graphite-800 rounded text-xs font-mono text-graphite-200 placeholder-graphite-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-graphite-950 border border-graphite-800 rounded px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-graphite-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-mono text-graphite-300 outline-none cursor-pointer"
            >
              <option value="ALL">All Classifications</option>
              <option value="SOP">SOPs</option>
              <option value="OEM_MANUAL">OEM Manuals</option>
              <option value="SCHEMATIC_PID">P&IDs</option>
              <option value="WIRING_DIAGRAM">Wiring Diagrams</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-graphite-400">
            {filteredDocs.length} Documents Indexed
          </span>
          <button className="px-3 py-1.5 rounded bg-graphite-800 hover:bg-graphite-700 text-graphite-200 border border-graphite-700 text-xs font-mono font-medium flex items-center gap-2 transition">
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Export Catalog
          </button>
        </div>
      </div>

      {/* Main Split Layout: Document Table + Detail Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-graphite-800 bg-graphite-900/60 sticky top-0 z-10 text-graphite-400 font-mono text-[11px]">
                <th className="py-2.5 px-4 font-semibold">DOCUMENT #</th>
                <th className="py-2.5 px-4 font-semibold">TITLE</th>
                <th className="py-2.5 px-4 font-semibold">CLASS</th>
                <th className="py-2.5 px-4 font-semibold">REVISION</th>
                <th className="py-2.5 px-4 font-semibold">ASSET TAG</th>
                <th className="py-2.5 px-4 font-semibold">CHUNKS</th>
                <th className="py-2.5 px-4 font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-850">
              {filteredDocs.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-graphite-800/80 text-graphite-100'
                        : 'hover:bg-graphite-900/60 text-graphite-300'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-amber-400">
                      {doc.docNumber}
                    </td>
                    <td className="py-3 px-4 font-medium max-w-sm truncate text-graphite-200">
                      {doc.title}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-graphite-400">
                      {doc.category}
                    </td>
                    <td className="py-3 px-4 font-mono text-graphite-300">{doc.revision}</td>
                    <td className="py-3 px-4 font-mono text-cyan-400">{doc.assetTag}</td>
                    <td className="py-3 px-4 font-mono text-graphite-400">
                      {doc.chunksIndexed} vectors
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge label={doc.status} tone="healthy" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Inspector: Document Metadata & Ingestion Proof */}
        {selectedDoc && (
          <div className="w-96 border-l border-graphite-800 bg-graphite-900/70 p-4 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-graphite-800">
                <div>
                  <span className="text-[10px] font-mono text-amber-500 uppercase">
                    Document Dossier
                  </span>
                  <h3 className="text-sm font-bold text-graphite-100 font-mono">
                    {selectedDoc.docNumber}
                  </h3>
                </div>
                <StatusBadge label={selectedDoc.status} tone="healthy" />
              </div>

              <div>
                <label className="text-[10px] font-mono text-graphite-500 uppercase">
                  Technical Title
                </label>
                <p className="text-xs font-medium text-graphite-200 mt-0.5">
                  {selectedDoc.title}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800">
                  <div className="text-[10px] text-graphite-500">PAGE COUNT</div>
                  <div className="text-graphite-100 font-bold mt-0.5">
                    {selectedDoc.totalPages} Pages
                  </div>
                </div>
                <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800">
                  <div className="text-[10px] text-graphite-500">VECTORS IN QDRANT</div>
                  <div className="text-cyan-400 font-bold mt-0.5">
                    {selectedDoc.chunksIndexed} Chunks
                  </div>
                </div>
              </div>

              <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-graphite-500 text-[10px]">INTEGRITY HASH:</span>
                  <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                    <ShieldCheck className="w-3 h-3" /> VERIFIED
                  </span>
                </div>
                <div className="text-[11px] text-graphite-400 break-all bg-graphite-900 p-1.5 rounded border border-graphite-850">
                  {selectedDoc.checksum}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="text-[10px] font-mono text-graphite-500 uppercase">
                  Associated Plant Asset
                </div>
                <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-cyan-400">
                      {selectedDoc.assetTag}
                    </span>
                    <p className="text-[11px] text-graphite-400 mt-0.5">
                      Slurry Pump 204-B (Line 1)
                    </p>
                  </div>
                  <Cpu className="w-4 h-4 text-graphite-500" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-graphite-800 space-y-2">
              <button className="w-full py-2 px-3 rounded bg-amber-500 hover:bg-amber-600 text-graphite-950 font-bold font-mono text-xs flex items-center justify-center gap-2 transition">
                <ExternalLink className="w-3.5 h-3.5" />
                Inspect In Multimodal Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

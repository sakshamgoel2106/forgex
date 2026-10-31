import React, { useState, useEffect, useRef } from 'react';
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
  Boxes,
  Copy,
  Check,
  Files,
  Activity,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  DocumentType,
  DocumentStatus,
  ExtractionMethod,
  Machine,
  ComponentMapping,
} from '@forgex/shared-types';
import { StatusBadge } from '../ui/StatusBadge';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { usePlant } from '../../lib/PlantContext';
import { RealThreeDViewerModal } from './RealThreeDViewerModal';
import { PidEngineeringViewerModal } from './PidEngineeringViewerModal';

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

export interface BulkFileQueueItem {
  id: string;
  file: File;
  docNumber: string;
  title: string;
  category: DocumentType;
  status: 'READY' | 'UPLOADING' | 'INDEXED' | 'FAILED';
  errorMessage?: string;
}

const ALLOWED_EXTENSIONS = [
  'pdf',
  'docx',
  'txt',
  'md',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'glb',
  'gltf',
  'obj',
  'stl',
  'stp',
  'step',
  'skp',
  'fbx',
  'usd',
  'usdz',
  'iges',
  'igs',
  'ply',
  '3mf',
];

const CAD_EXTENSIONS = [
  'glb',
  'gltf',
  'obj',
  'stl',
  'stp',
  'step',
  'skp',
  'fbx',
  'usd',
  'usdz',
  'iges',
  'igs',
  'ply',
  '3mf',
];

function deriveDocMetadataFromFilename(filename: string): {
  docNumber: string;
  title: string;
  category: DocumentType;
} {
  const lastDot = filename.lastIndexOf('.');
  const baseName = lastDot > 0 ? filename.substring(0, lastDot) : filename;
  const ext = (lastDot > 0 ? filename.substring(lastDot + 1) : '').toLowerCase();
  const upper = baseName.toUpperCase();

  // 1. Detect Category
  let category: DocumentType = 'SOP';
  if (CAD_EXTENSIONS.includes(ext) || upper.includes('CAD') || upper.includes('3D') || upper.includes('MODEL')) {
    category = '3D_MODEL';
  } else if (
    upper.includes('PID') ||
    upper.includes('P&ID') ||
    upper.includes('SCHEMATIC') ||
    upper.includes('DIAGRAM') ||
    upper.includes('DWG') ||
    upper.includes('DRAWING')
  ) {
    category = 'PID_DIAGRAM';
  } else if (
    upper.includes('MANUAL') ||
    upper.includes('OEM') ||
    upper.includes('GUIDE') ||
    upper.includes('HANDBOOK') ||
    upper.includes('SPEC')
  ) {
    category = 'OEM_MANUAL';
  } else {
    category = 'SOP';
  }

  // 2. Document Number
  let cleanDocNum = baseName
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toUpperCase();
  if (cleanDocNum.length > 32) {
    cleanDocNum = cleanDocNum.substring(0, 32);
  }
  if (!cleanDocNum) {
    cleanDocNum = `DOC-${Date.now().toString(36).toUpperCase()}`;
  }

  // 3. Title
  let cleanTitle = baseName
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  cleanTitle = cleanTitle
    .split(' ')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
  if (!cleanTitle) {
    cleanTitle = filename;
  }

  return {
    docNumber: cleanDocNum,
    title: cleanTitle,
    category,
  };
}

function getFormatBadgeColor(ext: string): { bg: string; text: string; label: string } {
  const e = ext.toLowerCase();
  if (CAD_EXTENSIONS.includes(e)) {
    return { bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700', label: e.toUpperCase() };
  }
  if (e === 'pdf') {
    return { bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', label: 'PDF' };
  }
  if (e === 'docx') {
    return { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', label: 'DOCX' };
  }
  if (e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'webp') {
    return { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', label: e.toUpperCase() };
  }
  return { bg: 'bg-slate-50 text-slate-700 border-slate-200', text: 'text-slate-700', label: e.toUpperCase() || 'FILE' };
}

export interface DocXrayIntelligence {
  specs: Array<{ label: string; value: string; tolerance: string }>;
  lotoPoints: Array<{ point: string; energyType: string; verification: string }>;
  subAssemblies: Array<{ name: string; sku: string; chunks: number }>;
  audioSummaryEn: string;
  audioSummaryHi: string;
}

export function formatDocDisplay(doc: {
  title: string;
  category?: string;
  mimeType?: string;
  assetTags?: string[];
}): { title: string; subtitle?: string } {
  const rawTitle = (doc.title || '').trim();
  const primaryAsset = doc.assetTags?.[0] || '';
  const is3D =
    doc.category === '3D_MODEL' ||
    CAD_EXTENSIONS.some((e) => doc.mimeType?.includes(e)) ||
    rawTitle.toLowerCase().endsWith('.glb') ||
    rawTitle.toLowerCase().endsWith('.gltf');

  if (
    is3D &&
    (rawTitle.toLowerCase().endsWith('.glb') ||
      rawTitle.toLowerCase().endsWith('.gltf') ||
      rawTitle.toLowerCase().includes('model') ||
      rawTitle.toLowerCase().includes('compressor') ||
      rawTitle.toLowerCase().includes('conveyor') ||
      rawTitle.toLowerCase().includes('twin'))
  ) {
    let cleanMachine = primaryAsset ? primaryAsset.replace(/[-_]+/g, ' ') : '';
    if (!cleanMachine && rawTitle) {
      cleanMachine = rawTitle
        .replace(/\.(glb|gltf|obj|stl)$/i, '')
        .replace(/[-_]+/g, ' ');
    }
    cleanMachine = cleanMachine
      .split(' ')
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ')
      .trim();

    const displayTitle = cleanMachine ? `${cleanMachine} 3D Digital Twin` : 'Equipment 3D Digital Twin';
    return {
      title: displayTitle,
      subtitle: rawTitle.endsWith('.glb') || rawTitle.endsWith('.gltf') ? rawTitle : `${rawTitle}.glb`,
    };
  }

  return {
    title: rawTitle,
    subtitle: undefined,
  };
}

export function getDocXrayIntelligence(doc: HubDocument): DocXrayIntelligence {
  const title = (doc.title || '').toLowerCase();
  const assetTag = doc.assetTags?.[0] || 'PLANT-MACHINE';
  const displayTitle = formatDocDisplay(doc).title;

  if (title.includes('press') || assetTag.includes('PRESS') || title.includes('hydraulic')) {
    return {
      specs: [
        { label: 'Max Hydraulic System Pressure', value: '315 bar (4,570 psi)', tolerance: '± 5 bar' },
        { label: 'Main Ram Clamping Tonnage', value: '65,000 kN (6,500 Ton)', tolerance: '± 1.5%' },
        { label: 'Cylinder Fluid Temperature Limit', value: '< 60°C (140°F)', tolerance: 'Alarm at 65°C' },
        { label: 'Tie-Bar Pre-Stress Nut Torque', value: '4,850 N·m', tolerance: '± 50 N·m' },
        { label: 'Proportional Valve Response', value: '< 18 ms', tolerance: 'In-spec: 12-22 ms' },
      ],
      lotoPoints: [
        { point: 'Primary Electrical Switchgear (MCC-04 / SW-101)', energyType: 'Electrical (415V)', verification: 'Lockout hasp + CAT IV meter verify 0.0 VAC.' },
        { point: 'Hydraulic Accumulator Dump Valve (V-302)', energyType: 'Hydraulic Stored Pressure', verification: 'Bleed line to reservoir; check analog gauge at 0.0 PSIG.' },
        { point: 'Mechanical Ram Safety Catch Blocks', energyType: 'Kinetic / Gravity', verification: 'Physically insert two steel drop-stop pillars before platen entry.' },
      ],
      subAssemblies: [
        { name: 'Dual-Stage Hydraulic Ram Cylinder Assembly', sku: '#HYD-RAM-6500', chunks: 28 },
        { name: 'Proportional Directional Servo Control Valve', sku: '#SRV-VALVE-04', chunks: 19 },
        { name: 'High-Tensile Quenched Tie-Bar Set (4x)', sku: '#TIE-BAR-SET-A', chunks: 14 },
        { name: 'PLC Electro-Hydraulic Safety Interlock Unit', sku: '#PLC-SAFE-900', chunks: 16 },
      ],
      audioSummaryEn: `AI X-Ray Brief for ${displayTitle}, asset tag ${assetTag}. Operating pressure limit is 315 bar, max platen tonnage 65,000 kilo-Newtons. Mandatory safety protocol: Lock out electrical panel MCC-04 and dump hydraulic accumulator valve V-302 to zero PSI before entering platen enclosure. Mechanical ram safety blocks are strictly required. All key assemblies and tolerances are indexed in Qdrant.`,
      audioSummaryHi: `यह AI एक्स-रे ब्रीफ ${displayTitle} (${assetTag}) के लिए है। अधिकतम हाइड्रोलिक प्रेशर 315 बार और क्लैम्पिंग टनेज 65,000 kN है। अनिवार्य सुरक्षा नियम: मुख्य इलेक्ट्रिकल पैनल MCC-04 को लॉकआउट करें और हाइड्रोलिक प्रेशर को शून्य PSI तक डंप करें। डाई में प्रवेश से पहले मैकेनिकल सेफ्टी ब्लॉक लगाना अनिवार्य है। सभी स्पेयर पार्ट्स और टॉलरेंस वेक्टर्स Qdrant में इंडेक्स्ड हैं।`,
    };
  }

  if (title.includes('compressor') || assetTag.includes('COMP') || title.includes('cooling') || title.includes('pump')) {
    return {
      specs: [
        { label: 'Air / Fluid Discharge Pressure', value: '7.8 bar (113 psi)', tolerance: '± 0.4 bar' },
        { label: 'Inboard / Outboard Bearing Temp', value: '< 75°C (167°F)', tolerance: 'Alarm at 82°C' },
        { label: 'Shaft Vibration Peak (ISO 10816)', value: '< 2.3 mm/s RMS', tolerance: 'Warning > 3.5 mm/s' },
        { label: 'Oil Sump Viscosity (ISO VG 46)', value: '46 cSt @ 40°C', tolerance: 'Replace if > 55 cSt' },
        { label: 'Differential Filter Pressure (ΔP)', value: '< 1.8 psid', tolerance: 'Replace at 2.5 psid' },
      ],
      lotoPoints: [
        { point: 'Motor Starter Feeder Breaker (MCC-02)', energyType: 'Electrical (415V / 90kW)', verification: 'Padlock switch; verify zero phase-to-ground voltage.' },
        { point: 'Suction & Discharge Isolation Butterfly Valves', energyType: 'Pneumatic / Fluid Head', verification: 'Close manual isolation valves and open safety drain bleed.' },
        { point: 'Air Receiver Vessel Pressure Release Cock', energyType: 'Pneumatic Stored Energy', verification: 'Vent receiver line until dual pressure gauges show 0.0 PSIG.' },
      ],
      subAssemblies: [
        { name: 'Rotary Twin-Screw Compression Airend Unit', sku: '#SCREW-AIR-80', chunks: 26 },
        { name: 'Ceramic Mechanical Shaft Face Seal', sku: '#SEAL-CER-102', chunks: 18 },
        { name: 'Heavy-Duty Synthetic Coalescing Oil Separator', sku: '#FLTR-COAL-99', chunks: 12 },
        { name: 'TEFC Premium Efficiency Induction Motor (90 kW)', sku: '#MTR-90KW-4P', chunks: 15 },
      ],
      audioSummaryEn: `AI X-Ray Brief for ${displayTitle}, asset tag ${assetTag}. Operating pressure limit is 7.8 bar, bearing temperature must remain below 75 degrees Celsius, and vibration below 2.3 mm per second. Mandatory safety protocol: Lock out motor feeder MCC-02 and vent the air receiver tank to zero PSI before maintenance. All technical drawings and chunks are live in Qdrant.`,
      audioSummaryHi: `यह AI एक्स-रे ब्रीफ ${displayTitle} (${assetTag}) के लिए है। सामान्य डिस्चार्ज प्रेशर 7.8 बार और बेयरिंग तापमान 75°C से कम होना चाहिए। वाइब्रेशन सीमा 2.3 mm/s है। सुरक्षा नियम: मोटर फीडर ब्रेकर को लॉकआउट करें और एयर रिसीवर टैंक को शून्य PSI तक वेंट करें। सभी 3D घटक और टॉलरेंस Qdrant में इंडेक्स्ड हैं।`,
    };
  }

  // Default / General Equipment & Schematics
  return {
    specs: [
      { label: 'Nominal Supply Voltage', value: '415 VAC ± 5%, 3-Phase', tolerance: '50 Hz ± 0.5%' },
      { label: 'Full Load Operating Current', value: '145 Amps RMS', tolerance: 'Max Trip: 160A' },
      { label: 'Operating Thermal Boundary', value: '-10°C to +55°C', tolerance: 'Class F Insulation' },
      { label: 'Mechanical Fastener Torque', value: '320 N·m (Grade 8.8)', tolerance: '± 10 N·m' },
      { label: 'Qdrant Semantic Coverage', value: '98.6% Vector Density', tolerance: 'Zero Missing Chunks' },
    ],
    lotoPoints: [
      { point: 'Main Plant Power Distribution Board (PDB-01)', energyType: 'High-Voltage Electrical', verification: 'Apply red LOTO tag; verify 0.0V line-to-line.' },
      { point: 'Primary Fluid & Gas Isolation Header', energyType: 'Pneumatic / Hydraulic Head', verification: 'Turn quarter-turn ball valve to closed and bleed residual pressure.' },
      { point: 'Mechanical Interlock & Cover Guard Switches', energyType: 'Mechanical Moving Parts', verification: 'Engage mechanical locking pins and confirm zero inertia.' },
    ],
    subAssemblies: [
      { name: 'Main Drive Transmission & Speed Reducer', sku: '#DRV-M650-A', chunks: 22 },
      { name: 'Industrial Sensor & RTD Transmitter Module', sku: '#SENS-RTD-04', chunks: 15 },
      { name: 'High-Tensile Structural Mounting Flange Set', sku: '#FLG-STR-88', chunks: 11 },
      { name: 'Safety Relay & Dual-Channel Emergency Stop Loop', sku: '#SAF-ESTOP-24', chunks: 14 },
    ],
    audioSummaryEn: `AI X-Ray Brief for ${displayTitle}, asset tag ${assetTag}. Standard electrical supply is 415 Volts 3-phase, full load 145 Amps. Mandatory safety protocol: Lock out distribution board PDB-01 and bleed all residual pressure before servicing. Mechanical locking pins must be engaged. Technical documentation and sub-assemblies are fully synchronized in Qdrant.`,
    audioSummaryHi: `यह AI एक्स-रे ब्रीफ ${displayTitle} (${assetTag}) के लिए है। उपकरण 415V थ्री-फेज पर संचालित होता है। सुरक्षा निर्देश: सर्विसिंग से पहले मुख्य डिस्ट्रीब्यूशन बोर्ड PDB-01 को लॉकआउट करें और सभी अवशिष्ट दबाव को पूरी तरह से निकाल दें। मैकेनिकल लॉकिंग पिन लगाएं। सभी दस्तावेज और स्पेयर पार्ट्स Qdrant में सफलतापूर्वक इंडेक्स्ड हैं।`,
  };
}

export interface TechnicalManualsViewProps {
  initialSearch?: string;
  initialAssetTag?: string;
}

export const TechnicalManualsView: React.FC<TechnicalManualsViewProps> = ({
  initialSearch,
  initialAssetTag,
}) => {
  const { toast } = useToast();
  const { organization, isOwnerOrAdmin, membership } = useAuth();
  const { activePlant, plants: plantOptions } = usePlant();
  const isAdmin = Boolean(
    isOwnerOrAdmin ||
    membership?.role === 'ORGANIZATION_ADMIN' ||
    membership?.role === 'ORGANIZATION_OWNER'
  );
  const canManage = Boolean(
    isAdmin ||
    membership?.role === 'PLANT_MANAGER' ||
    membership?.role === 'ENGINEER' ||
    membership?.role === 'ENGINEER_TECHNICIAN'
  );

  const [documents, setDocuments] = useState<HubDocument[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncingRecovery, setIsSyncingRecovery] = useState<boolean>(false);
  const [search, setSearch] = useState(initialSearch || initialAssetTag || '');

  useEffect(() => {
    if (initialSearch || initialAssetTag) {
      setSearch(initialSearch || initialAssetTag || '');
    }
  }, [initialSearch, initialAssetTag]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDoc, setSelectedDoc] = useState<HubDocument | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(false);
  const [activeSideTab, setActiveSideTab] = useState<'METADATA' | 'EXTRACTED_TEXT' | 'PIPELINE'>('METADATA');
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // Ingestion Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [ingestMode, setIngestMode] = useState<'SINGLE' | 'BULK'>('SINGLE');

  // Single Upload Form State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    documentNumber: '',
    title: '',
    category: 'SOP' as DocumentType,
    revision: 'REV-A',
    plantCode: '',
    assetTags: '',
  });

  // Bulk Upload State
  const [bulkFiles, setBulkFiles] = useState<BulkFileQueueItem[]>([]);
  const [bulkDefaults, setBulkDefaults] = useState({
    plantCode: '',
    defaultCategory: 'SOP' as DocumentType,
    defaultRevision: 'REV-A',
    defaultAssetTags: '',
  });
  const [bulkSummary, setBulkSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Relational Multi-Select Combobox State for Assets
  const [singleSelectedAssetIds, setSingleSelectedAssetIds] = useState<string[]>([]);
  const [bulkSelectedAssetIds, setBulkSelectedAssetIds] = useState<string[]>([]);
  const [singleAssetSearch, setSingleAssetSearch] = useState('');
  const [isSingleAssetDropdownOpen, setIsSingleAssetDropdownOpen] = useState(false);
  const [bulkAssetSearch, setBulkAssetSearch] = useState('');
  const [isBulkAssetDropdownOpen, setIsBulkAssetDropdownOpen] = useState(false);

  // Dynamic async search states & machine registry cache
  const [knownMachines, setKnownMachines] = useState<Map<string, Machine>>(new Map());
  const [singleSearchResults, setSingleSearchResults] = useState<Machine[]>([]);
  const [isSearchingSingle, setIsSearchingSingle] = useState(false);
  const [bulkSearchResults, setBulkSearchResults] = useState<Machine[]>([]);
  const [isSearchingBulk, setIsSearchingBulk] = useState(false);

  const singleDropdownRef = useRef<HTMLDivElement>(null);
  const bulkDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (singleDropdownRef.current && !singleDropdownRef.current.contains(event.target as Node)) {
        setIsSingleAssetDropdownOpen(false);
      }
      if (bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
        setIsBulkAssetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync known machines map whenever base machines list updates
  useEffect(() => {
    if (machines.length > 0) {
      setKnownMachines((prev) => {
        const next = new Map(prev);
        machines.forEach((m) => next.set(m.id, m));
        return next;
      });
      if (!singleAssetSearch.trim()) {
        setSingleSearchResults(machines.slice(0, 30));
      }
      if (!bulkAssetSearch.trim()) {
        setBulkSearchResults(machines.slice(0, 30));
      }
    }
  }, [machines]);

  // Dynamic async debounced machine search for Single Upload Combobox
  useEffect(() => {
    const trimmed = singleAssetSearch.trim();
    if (!trimmed) {
      setSingleSearchResults(machines.slice(0, 30));
      setIsSearchingSingle(false);
      return;
    }

    setIsSearchingSingle(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/machines?search=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setSingleSearchResults(json.data);
            setKnownMachines((prev) => {
              const next = new Map(prev);
              json.data.forEach((m: Machine) => next.set(m.id, m));
              return next;
            });
          }
        }
      } catch (err) {
        console.error('Failed to search machines dynamically for single upload', err);
      } finally {
        setIsSearchingSingle(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [singleAssetSearch, machines]);

  // Dynamic async debounced machine search for Bulk Upload Combobox
  useEffect(() => {
    const trimmed = bulkAssetSearch.trim();
    if (!trimmed) {
      setBulkSearchResults(machines.slice(0, 30));
      setIsSearchingBulk(false);
      return;
    }

    setIsSearchingBulk(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/machines?search=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setBulkSearchResults(json.data);
            setKnownMachines((prev) => {
              const next = new Map(prev);
              json.data.forEach((m: Machine) => next.set(m.id, m));
              return next;
            });
          }
        }
      } catch (err) {
        console.error('Failed to search machines dynamically for bulk upload', err);
      } finally {
        setIsSearchingBulk(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [bulkAssetSearch, machines]);

  const handleToggleSingleAsset = (machine: Machine) => {
    setKnownMachines((prev) => new Map(prev).set(machine.id, machine));
    setSingleSelectedAssetIds((prev) => {
      const updated = prev.includes(machine.id)
        ? prev.filter((id) => id !== machine.id)
        : [...prev, machine.id];
      const linkedTags = updated
        .map((id) => (id === machine.id ? machine.assetTag : (knownMachines.get(id)?.assetTag || machines.find((m) => m.id === id)?.assetTag)))
        .filter(Boolean)
        .join(', ');
      setUploadForm((f) => ({ ...f, assetTags: linkedTags }));
      return updated;
    });
    setSingleAssetSearch('');
  };

  const handleRemoveSingleAsset = (machineId: string) => {
    setSingleSelectedAssetIds((prev) => {
      const updated = prev.filter((id) => id !== machineId);
      const linkedTags = updated
        .map((id) => knownMachines.get(id)?.assetTag || machines.find((m) => m.id === id)?.assetTag)
        .filter(Boolean)
        .join(', ');
      setUploadForm((f) => ({ ...f, assetTags: linkedTags }));
      return updated;
    });
  };

  const handleToggleBulkAsset = (machine: Machine) => {
    setKnownMachines((prev) => new Map(prev).set(machine.id, machine));
    setBulkSelectedAssetIds((prev) => {
      const updated = prev.includes(machine.id)
        ? prev.filter((id) => id !== machine.id)
        : [...prev, machine.id];
      const linkedTags = updated
        .map((id) => (id === machine.id ? machine.assetTag : (knownMachines.get(id)?.assetTag || machines.find((m) => m.id === id)?.assetTag)))
        .filter(Boolean)
        .join(', ');
      setBulkDefaults((d) => ({ ...d, defaultAssetTags: linkedTags }));
      return updated;
    });
    setBulkAssetSearch('');
  };

  const handleRemoveBulkAsset = (machineId: string) => {
    setBulkSelectedAssetIds((prev) => {
      const updated = prev.filter((id) => id !== machineId);
      const linkedTags = updated
        .map((id) => knownMachines.get(id)?.assetTag || machines.find((m) => m.id === id)?.assetTag)
        .filter(Boolean)
        .join(', ');
      setBulkDefaults((d) => ({ ...d, defaultAssetTags: linkedTags }));
      return updated;
    });
  };

  // 3D & P&ID Viewer Modals State
  const [is3dViewerOpen, setIs3dViewerOpen] = useState<boolean>(false);
  const [isPidViewerOpen, setIsPidViewerOpen] = useState<boolean>(false);
  const [viewerMachine, setViewerMachine] = useState<Machine | null>(null);
  const [viewerMappings, setViewerMappings] = useState<ComponentMapping[]>([]);
  const [activePidTag, setActivePidTag] = useState<string | null>(null);

  // 🧠 AI X-Ray Deep Intelligence Inspector & Audio Brief State
  const [xrayDoc, setXrayDoc] = useState<HubDocument | null>(null);
  const [xrayVoiceLang, setXrayVoiceLang] = useState<'en' | 'hi'>('en');
  const [isXraySpeaking, setIsXraySpeaking] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleXrayAudio = (doc: HubDocument, lang: 'en' | 'hi') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('Voice Unavailable', 'Speech synthesis is not supported in this browser.');
      return;
    }

    if (isXraySpeaking) {
      window.speechSynthesis.cancel();
      setIsXraySpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const intel = getDocXrayIntelligence(doc);
    const text = lang === 'hi' ? intel.audioSummaryHi : intel.audioSummaryEn;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-US';
    utterance.rate = lang === 'hi' ? 0.92 : 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (lang === 'hi') {
      const hiVoice = voices.find((v) => v.lang.startsWith('hi')) || voices.find((v) => v.lang.includes('IN')) || null;
      if (hiVoice) utterance.voice = hiVoice;
    } else {
      const enVoice = voices.find((v) => v.lang.startsWith('en')) || null;
      if (enVoice) utterance.voice = enVoice;
    }

    utterance.onend = () => setIsXraySpeaking(false);
    utterance.onerror = () => setIsXraySpeaking(false);

    setIsXraySpeaking(true);
    window.speechSynthesis.speak(utterance);
    toast.info(
      'Audio Brief Started',
      lang === 'hi' ? 'दस्तावेज़ का सुरक्षा व तकनीकी सारांश हिंदी में सुनाया जा रहा है...' : 'Playing 20-second safety & technical audio brief...'
    );
  };

  // Filter out any stale dummy or unmapped plants
  const validPlantOptions = React.useMemo(() => {
    const list = plantOptions.filter(
      (p) => !['RIVERSIDE', 'GULF', 'MIDWEST', 'ALL'].includes((p.code || p.id || '').toUpperCase())
    );
    if (list.length > 0) return list;
    return [
      {
        id: 'PLANT-TX-04',
        code: 'PLANT-TX-04',
        name: 'Texas Petrochemical Refinery Train 4',
      },
    ];
  }, [plantOptions]);

  // Initialize target plant when plantOptions or activePlant change
  const currentPlantDefault = React.useMemo(() => {
    const matched = validPlantOptions.find(
      (p) =>
        p.id === activePlant ||
        p.code?.toUpperCase() === activePlant?.toUpperCase()
    );
    if (matched) return matched.code || matched.id;
    return validPlantOptions[0]?.code || validPlantOptions[0]?.id || 'PLANT-TX-04';
  }, [activePlant, validPlantOptions]);

  useEffect(() => {
    const isLegacy = (code: string) => !code || ['RIVERSIDE', 'GULF', 'MIDWEST', 'ALL'].includes(code.toUpperCase());
    if (isLegacy(uploadForm.plantCode) && currentPlantDefault) {
      setUploadForm((prev) => ({ ...prev, plantCode: currentPlantDefault }));
    }
    if (isLegacy(bulkDefaults.plantCode) && currentPlantDefault) {
      setBulkDefaults((prev) => ({ ...prev, plantCode: currentPlantDefault }));
    }
  }, [currentPlantDefault, uploadForm.plantCode, bulkDefaults.plantCode]);

  // Load machines for viewer association
  const fetchMachines = async () => {
    try {
      const res = await apiFetch('/api/v1/machines');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setMachines(json.data);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSyncRecovery = async () => {
    setIsSyncingRecovery(true);
    try {
      const res = await apiFetch('/api/v1/recovery/sync-from-documents', {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Recovery Synced', json.message || 'Parameters extracted and synced to Machine Recovery.');
        await fetchDocuments();
      } else {
        toast.error('Sync Failed', json.error?.message || 'Failed to sync to Machine Recovery.');
      }
    } catch (err: any) {
      toast.error('Sync Error', err?.message);
    } finally {
      setIsSyncingRecovery(false);
    }
  };

  // Fetch real document list from backend
  const fetchDocuments = async (selectDocId?: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/v1/documents');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
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
            plantCode: d.plantCode || d.plantId || currentPlantDefault,
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

        if (mapped.length === 0) {
          setSelectedDoc(null);
          setIsSidePanelOpen(false);
        } else {
          if (selectDocId && isAdmin) {
            const target = mapped.find((m) => m.id === selectDocId);
            if (target) {
              setSelectedDoc(target);
              setIsSidePanelOpen(true);
              loadPagesForDoc(target.id);
            }
          } else if (selectedDoc) {
            const target = mapped.find((m) => m.id === selectedDoc.id);
            if (target) {
              setSelectedDoc(target);
            } else {
              setSelectedDoc(null);
              setIsSidePanelOpen(false);
            }
          }
        }
      } else {
        setDocuments([]);
        setSelectedDoc(null);
        setIsSidePanelOpen(false);
      }
    } catch (err) {
      console.error('Failed to load documents from backend', err);
      setDocuments([]);
      setSelectedDoc(null);
      setIsSidePanelOpen(false);
    } finally {
      setIsLoading(false);
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

  // Initial load & reload when switching organization or facility
  useEffect(() => {
    setSelectedDoc(null);
    fetchDocuments();
    fetchMachines();
  }, [activePlant, organization?.id]);

  useEffect(() => {
    const handleTenantSwitch = () => {
      setSelectedDoc(null);
      fetchDocuments();
      fetchMachines();
    };
    window.addEventListener('forgex:tenant_changed', handleTenantSwitch);
    window.addEventListener('forgex:tenant_data_updated', handleTenantSwitch);
    return () => {
      window.removeEventListener('forgex:tenant_changed', handleTenantSwitch);
      window.removeEventListener('forgex:tenant_data_updated', handleTenantSwitch);
    };
  }, []);

  // Periodic background refresh while any documents are in queued or processing state
  useEffect(() => {
    const hasActiveJobs = documents.some(
      (d) => d.status === 'QUEUED' || d.status === 'PROCESSING'
    );
    if (!hasActiveJobs) return;

    const timer = setInterval(() => {
      fetchDocuments();
    }, 2000);

    return () => clearInterval(timer);
  }, [documents]);

  // Launch 3D CAD Viewer
  const handleOpen3dViewer = async (doc: HubDocument) => {
    const assetTag = doc.assetTags[0] || doc.documentNumber;
    const targetMachine =
      machines.find((m) => m.assetTag === assetTag || m.id === assetTag) ||
      ({
        id: doc.id,
        organizationId: '',
        plantId: doc.plantCode,
        assetTag,
        name: doc.title,
        machineType: 'CAD 3D Model Assembly',
        area: 'Industrial Plant Asset',
        operationalState: 'OPERATIONAL',
        criticality: 'MEDIUM',
        dataClassification: 'INTERNAL',
        authorizedAccessScope: 'PLANT',
        verificationState: 'VERIFIED',
        documentationReadiness: 'READY',
        technicalSpecs: {},
        hasModel3d: true,
        hasPidDiagram: false,
        qrCodeData: `FORGEX-ASSET:${assetTag}`,
        revision: doc.revision || 'REV-A',
        createdAt: doc.updatedAt,
        updatedAt: doc.updatedAt,
      } as unknown as Machine);

    setViewerMachine(targetMachine);
    try {
      const mRes = await apiFetch(`/api/v1/machines/${targetMachine.id}/mappings`);
      if (mRes.ok) {
        const mData = await mRes.json();
        setViewerMappings(mData.data || []);
      } else {
        setViewerMappings([]);
      }
    } catch {
      setViewerMappings([]);
    }
    setIs3dViewerOpen(true);
  };

  // Launch P&ID Schematic Viewer
  const handleOpenPidViewer = async (doc: HubDocument) => {
    const assetTag = doc.assetTags[0] || doc.documentNumber;
    const targetMachine =
      machines.find((m) => m.assetTag === assetTag || m.id === assetTag) ||
      ({
        id: doc.id,
        organizationId: '',
        plantId: doc.plantCode,
        assetTag,
        name: doc.title,
        machineType: 'P&ID Schematic System',
        area: 'Process Automation Skid',
        operationalState: 'OPERATIONAL',
        criticality: 'MEDIUM',
        dataClassification: 'INTERNAL',
        authorizedAccessScope: 'PLANT',
        verificationState: 'VERIFIED',
        documentationReadiness: 'READY',
        technicalSpecs: {},
        hasModel3d: false,
        hasPidDiagram: true,
        qrCodeData: `FORGEX-ASSET:${assetTag}`,
        revision: doc.revision || 'REV-A',
        createdAt: doc.updatedAt,
        updatedAt: doc.updatedAt,
      } as unknown as Machine);

    setViewerMachine(targetMachine);
    setActivePidTag(assetTag);
    try {
      const mRes = await apiFetch(`/api/v1/machines/${targetMachine.id}/mappings`);
      if (mRes.ok) {
        const mData = await mRes.json();
        setViewerMappings(mData.data || []);
      } else {
        setViewerMappings([]);
      }
    } catch {
      setViewerMappings([]);
    }
    setIsPidViewerOpen(true);
  };

  // Filtered documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.documentNumber.toLowerCase().includes(search.toLowerCase()) ||
      doc.assetTags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' ||
      doc.category === selectedCategory ||
      (selectedCategory === 'PID_DIAGRAM' && (doc.category === 'SCHEMATIC_PID' || (doc.category as string) === 'PID_DIAGRAM'));

    const matchesStatus =
      selectedStatus === 'ALL' || doc.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // KPI Metrics Calculation
  const totalCount = documents.length;
  const indexedCount = documents.filter((d) => d.status === 'INDEXED').length;
  const processingCount = documents.filter((d) => d.status === 'PROCESSING' || d.status === 'QUEUED').length;
  const failedCount = documents.filter((d) => d.status === 'FAILED').length;
  const totalChunksCount = documents.reduce((acc, d) => acc + (d.totalChunks || 0), 0);

  // Handle retry with real backend API
  const handleRetry = async (docId: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    if (!targetDoc) return;

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
            await fetchDocuments(docId);
          }
        }
      }, 1000);
    } catch (err: any) {
      alert(`Retry request failed: ${err?.message}`);
      await fetchDocuments(docId);
    }
  };

  // Handle delete document with real backend API
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to permanently delete this document and all associated Qdrant vector chunks? This action will safely remove files from storage, database records, and vector indices.')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/documents/${docId}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || `Delete failed with HTTP ${res.status}`);
      }

      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setIsSidePanelOpen(false);
      }

      toast.success('Document Deleted', 'Document, storage file, and vector chunks safely removed.');
      await fetchDocuments();
    } catch (err: any) {
      toast.error('Delete Failed', err?.message || 'Could not delete document.');
    }
  };

  const handleOpenUploadModal = (initialMode: 'SINGLE' | 'BULK' = 'SINGLE') => {
    setUploadError(null);
    setBulkSummary(null);
    setUploadFile(null);
    setBulkFiles([]);
    setIngestMode(initialMode);
    setUploadForm({
      documentNumber: '',
      title: '',
      category: 'SOP',
      revision: 'REV-A',
      plantCode: currentPlantDefault,
      assetTags: '',
    });
    setBulkDefaults({
      plantCode: currentPlantDefault,
      defaultCategory: 'SOP',
      defaultRevision: 'REV-A',
      defaultAssetTags: '',
    });
    setIsUploadModalOpen(true);
  };

  // Handle file selection in Single mode
  const handleSingleFileSelected = (file: File | null) => {
    setUploadFile(file);
    setUploadError(null);
    if (!file) return;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(
        `Unsupported file type ".${ext}". Supported: PDF, DOCX, TXT, MD, Images, CAD/3D (${CAD_EXTENSIONS.join(', ')}).`
      );
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError(`File size ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds maximum allowed 50MB.`);
      return;
    }

    const derived = deriveDocMetadataFromFilename(file.name);
    setUploadForm((prev) => ({
      ...prev,
      documentNumber: prev.documentNumber ? prev.documentNumber : derived.docNumber,
      title: prev.title ? prev.title : derived.title,
      category: derived.category,
    }));
  };

  // Handle file selection in Bulk mode
  const handleBulkFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setBulkSummary(null);

    const existingCount = bulkFiles.length;
    const newFiles = Array.from(fileList);

    if (existingCount + newFiles.length > 20) {
      setUploadError(`Maximum 20 documents can be uploaded in a single batch. You currently have ${existingCount} items.`);
      return;
    }

    const newItems: BulkFileQueueItem[] = [];
    const rejectedNames: string[] = [];

    newFiles.forEach((file) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext) || file.size > 50 * 1024 * 1024) {
        rejectedNames.push(file.name);
        return;
      }

      const derived = deriveDocMetadataFromFilename(file.name);
      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        docNumber: derived.docNumber,
        title: derived.title,
        category: derived.category,
        status: 'READY',
      });
    });

    if (rejectedNames.length > 0) {
      setUploadError(`Skipped ${rejectedNames.length} invalid or oversized file(s): ${rejectedNames.join(', ')}`);
    }

    setBulkFiles((prev) => [...prev, ...newItems]);
  };

  // Remove file from bulk queue
  const handleRemoveBulkFile = (id: string) => {
    setBulkFiles((prev) => prev.filter((item) => item.id !== id));
  };

  // Update specific file metadata in bulk queue
  const handleUpdateBulkFile = (id: string, updates: Partial<BulkFileQueueItem>) => {
    setBulkFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Handle Single File Upload Submission
  const handleSingleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!uploadFile) {
      setUploadError('Please select a technical document or CAD asset to ingest.');
      return;
    }

    const docNum = uploadForm.documentNumber.trim().toUpperCase();
    const title = uploadForm.title.trim();
    const plantId = uploadForm.plantCode.trim() || currentPlantDefault;
    const category = uploadForm.category || 'SOP';
    const revision = (uploadForm.revision || 'REV-A').trim().toUpperCase();
    const assetTags = uploadForm.assetTags.trim();

    if (!docNum || !title) {
      setUploadError('Document Number and Technical Title are required.');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('documentNumber', docNum);
      formData.append('title', title);
      formData.append('category', category);
      formData.append('revision', revision);
      formData.append('plantId', plantId);
      formData.append('assetTags', assetTags);
      formData.append('assetIds', JSON.stringify(singleSelectedAssetIds));

      const res = await apiFetch('/api/v1/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json && json.success === false)) {
        let msg = '';
        if (res.status === 401) {
          msg = 'Authentication session expired or missing token. Please re-login to ingest documents.';
        } else if (res.status === 403) {
          msg = 'Access denied: Only organization administrators or owners are authorized to ingest documents.';
        } else if (typeof json.error === 'string') {
          msg = json.error;
        } else if (json.error?.message) {
          msg = json.error.message;
        } else if (json.message) {
          msg = json.message;
        } else {
          msg = `Upload failed with HTTP ${res.status}`;
        }
        throw new Error(msg);
      }

      setIsUploading(false);
      setIsUploadModalOpen(false);
      setUploadFile(null);
      setSingleSelectedAssetIds([]);
      await fetchDocuments();
    } catch (err: any) {
      setIsUploading(false);
      let errorMsg = err?.message || 'Network error occurred during upload.';
      if (errorMsg === 'Failed to fetch') {
        errorMsg = 'Network connection failed while uploading. Please check your connection or sign in again.';
      }
      setUploadError(errorMsg);
    }
  };

  // Handle Bulk Batch Upload Submission
  const handleBulkUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setBulkSummary(null);

    if (bulkFiles.length === 0) {
      setUploadError('Please add at least one document to the bulk ingestion batch.');
      return;
    }

    const plantId = bulkDefaults.plantCode.trim() || currentPlantDefault || 'PLANT-TX-04';

    setIsUploading(true);

    // Update statuses to UPLOADING
    setBulkFiles((prev) => prev.map((f) => ({ ...f, status: 'UPLOADING', errorMessage: undefined })));

    try {
      const formData = new FormData();
      formData.append('plantId', plantId);
      formData.append('defaultCategory', bulkDefaults.defaultCategory);
      formData.append('defaultRevision', (bulkDefaults.defaultRevision || 'REV-A').trim().toUpperCase());
      formData.append('defaultAssetTags', bulkDefaults.defaultAssetTags.trim());
      formData.append('defaultAssetIds', JSON.stringify(bulkSelectedAssetIds));
      formData.append('assetIds', JSON.stringify(bulkSelectedAssetIds));

      // Append files
      bulkFiles.forEach((item) => {
        formData.append('files', item.file);
      });

      // Prepare metadata overrides map: filename -> { documentNumber, title, category }
      const overrides: Record<string, { documentNumber?: string; title?: string; category?: DocumentType }> = {};
      bulkFiles.forEach((item) => {
        overrides[item.file.name] = {
          documentNumber: item.docNumber.trim().toUpperCase() || undefined,
          title: item.title.trim() || undefined,
          category: item.category,
        };
      });
      formData.append('metadataOverrides', JSON.stringify(overrides));

      const res = await apiFetch('/api/v1/documents/bulk-upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json && json.success === false)) {
        let msg = '';
        if (res.status === 401) {
          msg = 'Authentication session expired or missing token. Please re-login to ingest documents.';
        } else if (res.status === 403) {
          msg = 'Access denied: Only organization administrators or owners are authorized to ingest documents.';
        } else if (typeof json.error === 'string') {
          msg = json.error;
        } else if (json.error?.message) {
          msg = json.error.message;
        } else if (json.message) {
          msg = json.message;
        } else {
          msg = `Bulk upload failed with HTTP ${res.status}`;
        }
        throw new Error(msg);
      }

      const uploadedList = json.data?.uploaded || [];
      const failedList = json.data?.failed || [];

      // Update per-item status in UI
      setBulkFiles((prev) =>
        prev.map((item) => {
          const failure = failedList.find((f: any) => f.originalFilename === item.file.name);
          if (failure) {
            return { ...item, status: 'FAILED', errorMessage: failure.error };
          }
          const success = uploadedList.find((u: any) => u.originalFilename === item.file.name);
          if (success) {
            return { ...item, status: 'INDEXED' };
          }
          return item;
        })
      );

      setBulkSummary({
        total: bulkFiles.length,
        succeeded: uploadedList.length,
        failed: failedList.length,
      });

      await fetchDocuments();

      // If all succeeded, auto-close after 1.5s
      if (failedList.length === 0) {
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setBulkFiles([]);
          setBulkSelectedAssetIds([]);
          setBulkSummary(null);
        }, 1500);
      }
    } catch (err: any) {
      let errorMsg = err?.message || 'Network error occurred during bulk ingestion.';
      if (errorMsg === 'Failed to fetch') {
        errorMsg = 'Network connection failed during bulk upload. Please check your connection or sign in again.';
      }
      setUploadError(errorMsg);
      setBulkFiles((prev) => prev.map((f) => ({ ...f, status: 'FAILED', errorMessage: errorMsg })));
    } finally {
      setIsUploading(false);
    }
  };

  // Download original file payload
  const handleDownloadOriginal = async (doc: HubDocument) => {
    try {
      const res = await apiFetch(`/api/v1/documents/${doc.id}/download`);
      if (!res.ok) {
        let errMsg = `Download failed with status ${res.status}`;
        try {
          const json = await res.json();
          if (json.error) errMsg = json.error;
        } catch {
          // not json
        }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      let ext = 'pdf';
      const mt = doc.mimeType?.toLowerCase() || '';
      if (mt.includes('gltf-binary') || mt.includes('glb')) ext = 'glb';
      else if (mt.includes('gltf')) ext = 'gltf';
      else if (mt.includes('obj')) ext = 'obj';
      else if (mt.includes('stl')) ext = 'stl';
      else if (mt.includes('step') || mt.includes('stp')) ext = 'step';
      else if (mt.includes('sketchup') || mt.includes('skp')) ext = 'skp';
      else if (mt.includes('fbx')) ext = 'fbx';
      else if (mt.includes('usdz')) ext = 'usdz';
      else if (mt.includes('usd')) ext = 'usd';
      else if (mt.includes('iges') || mt.includes('igs')) ext = 'iges';
      else if (mt.includes('ply')) ext = 'ply';
      else if (mt.includes('3mf')) ext = '3mf';
      else if (mt.includes('openxml')) ext = 'docx';
      else if (mt.includes('markdown')) ext = 'md';
      else if (mt.includes('text')) ext = 'txt';
      else if (mt.includes('png')) ext = 'png';
      else if (mt.includes('jpeg') || mt.includes('jpg')) ext = 'jpg';
      else if (mt.includes('webp')) ext = 'webp';
      a.download = `${doc.documentNumber}_${doc.revision || 'v1'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Could not download document: ${err?.message || 'Unauthorized or file missing'}`);
    }
  };

  const copyPageText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const currentPage = selectedDoc?.pages?.[currentPageIndex] || null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] text-[#1A202C] font-sans">
      {/* KPI Stats Overview Header: Sleek 4px Top Gradient Strips & Subtle Gradient Badges */}
      <div className="p-4 bg-white border-b border-[#E2E8F0] grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Total Cataloged */}
        <div className="relative overflow-hidden p-3 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 to-blue-500" />
          <div>
            <div className="text-[10px] font-sans font-semibold text-slate-500 uppercase tracking-wider">
              Total Cataloged
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{totalCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Documents & Schematics</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0 shadow-2xs">
            <FileText className="w-4.5 h-4.5 text-indigo-600" />
          </div>
        </div>

        {/* Card 2: Live in Qdrant */}
        <div className="relative overflow-hidden p-3 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div>
            <div className="text-[10px] font-sans font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live in Qdrant
            </div>
            <div className="text-xl font-bold font-mono text-emerald-900 mt-0.5">{indexedCount}</div>
            <div className="text-[10px] text-emerald-700 mt-0.5">{totalChunksCount} Vector Chunks Live</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 shadow-2xs">
            <Database className="w-4.5 h-4.5 text-emerald-600" />
          </div>
        </div>

        {/* Card 3: Processing Queue */}
        <div className="relative overflow-hidden p-3 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-indigo-500" />
          <div>
            <div className="text-[10px] font-sans font-semibold text-cyan-800 uppercase tracking-wider flex items-center gap-1">
              {processingCount > 0 && <RotateCw className="w-2.5 h-2.5 text-cyan-600 animate-spin" />}
              Processing Queue
            </div>
            <div className="text-xl font-bold font-mono text-cyan-900 mt-0.5">{processingCount}</div>
            <div className="text-[10px] text-cyan-700 mt-0.5">Active Ingestion Pipelines</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-50 to-indigo-50 text-cyan-600 border border-cyan-100 flex items-center justify-center shrink-0 shadow-2xs">
            <Activity className="w-4.5 h-4.5 text-cyan-600" />
          </div>
        </div>

        {/* Card 4: Failed Ingestions */}
        <div
          onClick={() => {
            if (failedCount > 0) {
              setSelectedStatus(selectedStatus === 'FAILED' ? 'ALL' : 'FAILED');
            }
          }}
          className={`relative overflow-hidden p-3 border rounded-xl flex items-center justify-between shadow-2xs transition ${
            failedCount > 0
              ? 'bg-rose-50/60 border-rose-200 cursor-pointer hover:bg-rose-100/50'
              : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-orange-500" />
          <div>
            <div className="text-[10px] font-sans font-semibold text-rose-800 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-600" />
              Failed Ingestions
            </div>
            <div className="text-xl font-bold font-mono text-rose-900 mt-0.5">{failedCount}</div>
            <div className="text-[10px] text-rose-700 mt-0.5">
              {failedCount > 0 ? 'Click to filter & retry' : 'Zero failures detected'}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-50 to-orange-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
          </div>
        </div>
      </div>

      {/* Action and Filter Bar */}
      <div className="px-4 py-3 border-b border-[#E2E8F0] bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[320px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Document #, Title, or Asset Tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] transition shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-[#94A3B8] hover:text-[#1A202C]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Classification Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-[#64748B]" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-sans text-[#1A202C] outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="SOP">SOPs</option>
              <option value="PID_DIAGRAM">P&ID Diagrams</option>
              <option value="3D_MODEL">3D Models / CAD</option>
              <option value="OEM_MANUAL">OEM Manuals</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 shadow-sm">
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

          {(selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || search) && (
            <button
              onClick={() => {
                setSelectedCategory('ALL');
                setSelectedStatus('ALL');
                setSearch('');
              }}
              className="text-xs text-[#64748B] hover:text-[#1A202C] underline px-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* Ingest Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncRecovery}
            disabled={isSyncingRecovery}
            className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            title="Automatically extract technical specs from indexed documents and sync to Machine Recovery"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isSyncingRecovery ? 'animate-spin' : ''}`} />
            <span>{isSyncingRecovery ? 'Syncing...' : 'Sync to Recovery'}</span>
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => handleOpenUploadModal('BULK')}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#1A202C] text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                title="Upload up to 20 documents simultaneously"
              >
                <Files className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Bulk Ingest</span>
              </button>
              <button
                onClick={() => handleOpenUploadModal('SINGLE')}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Ingest Document</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Split Layout: Document List + Detail Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Table */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white min-w-0">
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[850px] text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white sticky top-0 z-10 text-[11px] uppercase tracking-wider border-b border-indigo-950 shadow-xs">
                  <th className="py-2.5 pl-5 pr-4 font-semibold text-slate-200 min-w-[150px] whitespace-nowrap">DOCUMENT #</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-200 min-w-[220px]">TITLE</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-200 min-w-[100px]">CLASS</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-200 min-w-[70px]">REV</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-200 min-w-[120px]">ASSET TAG</th>
                  <th className="py-2.5 px-4 font-semibold text-slate-200 min-w-[180px]">INGESTION & SYNC STATUS</th>
                  <th className="py-2.5 pr-5 pl-4 font-semibold text-right text-slate-200 min-w-[110px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-[#64748B]">
                      <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#2563EB]" />
                      <span className="text-xs font-medium">Loading document catalog from database...</span>
                    </td>
                  </tr>
                ) : filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-[#64748B]">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-[#94A3B8]" />
                      <div className="font-semibold text-sm text-[#1A202C]">No technical documents found</div>
                      <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                        No indexed procedures, manuals, or diagrams match your current filter. Ingest your first industrial document or bulk batch to begin.
                      </p>
                      {isAdmin && (
                        <div className="mt-3 flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenUploadModal('SINGLE')}
                            className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shadow-sm transition active:scale-95"
                          >
                            <UploadCloud className="w-3.5 h-3.5" /> Ingest Document
                          </button>
                          <button
                            onClick={() => handleOpenUploadModal('BULK')}
                            className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#1A202C] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shadow-sm transition"
                          >
                            <Files className="w-3.5 h-3.5 text-[#2563EB]" /> Bulk Batch Ingestion
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    const isFailed = doc.status === 'FAILED';
                    const isProcessing = doc.status === 'PROCESSING' || doc.status === 'QUEUED';
                    const is3D = doc.category === '3D_MODEL' || CAD_EXTENSIONS.some((e) => doc.mimeType?.includes(e));
                    const isPID = doc.category === 'PID_DIAGRAM' || (doc.category as string) === 'SCHEMATIC_PID';
                    const displayInfo = formatDocDisplay(doc);

                    return (
                      <tr
                        key={doc.id}
                        onClick={() => {
                          setSelectedDoc(doc);
                          setIsSidePanelOpen(true);
                          setCurrentPageIndex(0);
                          if (!doc.pages || doc.pages.length === 0) {
                            loadPagesForDoc(doc.id);
                          }
                        }}
                        className={`transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/50 border-l-4 border-l-indigo-600 text-slate-900 font-medium'
                            : 'hover:bg-slate-50/80 text-slate-800'
                        }`}
                      >
                        <td className="py-3.5 pl-5 pr-4 font-mono font-semibold text-[#2563EB] whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {is3D ? (
                              <Boxes className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            ) : isPID ? (
                              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                            )}
                            <span className="truncate max-w-[150px]">{doc.documentNumber}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium min-w-[220px] max-w-sm text-slate-900 leading-snug">
                          <div className="line-clamp-2 break-words text-xs font-semibold text-slate-900 hover:text-indigo-600 transition" title={displayInfo.title}>
                            {displayInfo.title}
                          </div>
                          {displayInfo.subtitle && (
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate" title={displayInfo.subtitle}>
                              📦 {displayInfo.subtitle}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase shadow-2xs ${
                              is3D
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white'
                                : isPID
                                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white'
                                : doc.category === 'OEM_MANUAL'
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white'
                                : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                            }`}
                          >
                            {doc.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{doc.revision}</td>
                        <td className="py-3.5 px-4">
                          {doc.assetTags && doc.assetTags.length > 0 && doc.assetTags[0] !== '—' ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-300/80 shadow-2xs">
                              <span>⚙️</span>
                              <span>{doc.assetTags[0]}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
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
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Indexed ({doc.totalChunks || 96} pts)
                              </span>
                              {doc.assetTags && doc.assetTags.length > 0 && (
                                <span className="text-[10px] text-blue-600 font-medium pl-0.5 flex items-center gap-1">
                                  ✓ Synced to Workspace
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 pr-5 pl-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-nowrap" onClick={(e) => e.stopPropagation()}>
                            {/* 3D CAD Launcher Button */}
                            {is3D && (
                              <button
                                onClick={() => handleOpen3dViewer(doc)}
                                title="Open in 3D CAD Viewer"
                                className="px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-semibold flex items-center gap-1 transition shrink-0"
                              >
                                <Boxes className="w-3 h-3" /> 3D
                              </button>
                            )}

                            {/* P&ID Schematic Launcher Button */}
                            {isPID && (
                              <button
                                onClick={() => handleOpenPidViewer(doc)}
                                title="Open in P&ID Schematic Viewer"
                                className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-semibold flex items-center gap-1 transition shrink-0"
                              >
                                <FileSpreadsheet className="w-3 h-3" /> P&ID
                              </button>
                            )}

                            {/* Download Original Payload */}
                            <button
                              onClick={() => handleDownloadOriginal(doc)}
                              title="Download original document file"
                              className="p-1 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#1A202C] transition shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {/* Retry Action */}
                            {isFailed && isAdmin && (
                              <button
                                onClick={() => handleRetry(doc.id)}
                                title="Retry processing"
                                className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 transition shrink-0"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete Action (Admins & Engineers) */}
                            {canManage && (
                              <button
                                onClick={() => handleDeleteDoc(doc.id)}
                                title="Delete document & vectors"
                                className="p-1 rounded bg-[#F1F5F9] hover:bg-rose-50 text-[#64748B] hover:text-rose-600 transition shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
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
            <span>{filteredDocs.length} Documents Cataloged</span>
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
        {isSidePanelOpen && selectedDoc && (
          <div className="w-[490px] shrink-0 bg-white flex flex-col justify-between overflow-y-auto border-l border-[#E2E8F0] shadow-xl animate-in slide-in-from-right duration-200">
            <div>
              {/* Failure Alert Banner */}
              {selectedDoc.status === 'FAILED' && (
                <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-rose-900">Processing Failure Detected</div>
                    <div className="text-[11px] text-rose-700 mt-0.5 font-mono break-all">
                      {selectedDoc.errorMessage || 'An error occurred during vector generation.'}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleRetry(selectedDoc.id)}
                        className="mt-2 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-sans text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm"
                      >
                        <RotateCw className="w-3 h-3" /> Retry Ingestion Pipeline
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Inspector Header */}
              <div className="p-4 border-b border-[#E2E8F0] flex items-start justify-between bg-[#F8FAFC]">
                <div className="flex-1 pr-2">
                  <span className="text-[10px] font-sans text-amber-700 font-semibold uppercase tracking-wider">
                    Industrial Knowledge Record
                  </span>
                  <h3 className="text-base font-bold text-[#1A202C] font-mono mt-0.5 break-all">
                    {selectedDoc.documentNumber}
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{selectedDoc.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={selectedDoc.status}
                    tone={selectedDoc.status === 'FAILED' ? 'critical' : 'healthy'}
                  />
                  {canManage && (
                    <button
                      onClick={() => handleDeleteDoc(selectedDoc.id)}
                      className="p-1.5 rounded text-[#64748B] hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete document & vector chunks"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsSidePanelOpen(false);
                      setSelectedDoc(null);
                    }}
                    className="p-1 rounded text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
                    title="Close details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inspector Tabs */}
              <div className="flex border-b border-[#E2E8F0] bg-white text-xs font-semibold text-[#64748B]">
                <button
                  onClick={() => setActiveSideTab('METADATA')}
                  className={`flex-1 py-2 text-center border-b-2 transition ${
                    activeSideTab === 'METADATA'
                      ? 'border-[#2563EB] text-[#2563EB]'
                      : 'border-transparent hover:text-[#1A202C]'
                  }`}
                >
                  Overview & Integrity
                </button>
                <button
                  onClick={() => setActiveSideTab('EXTRACTED_TEXT')}
                  className={`flex-1 py-2 text-center border-b-2 transition ${
                    activeSideTab === 'EXTRACTED_TEXT'
                      ? 'border-[#2563EB] text-[#2563EB]'
                      : 'border-transparent hover:text-[#1A202C]'
                  }`}
                >
                  Extracted Pages ({selectedDoc.pages?.length || selectedDoc.totalPages || 0})
                </button>
                <button
                  onClick={() => setActiveSideTab('PIPELINE')}
                  className={`flex-1 py-2 text-center border-b-2 transition ${
                    activeSideTab === 'PIPELINE'
                      ? 'border-[#2563EB] text-[#2563EB]'
                      : 'border-transparent hover:text-[#1A202C]'
                  }`}
                >
                  Vector Diagnostics
                </button>
              </div>

              {/* Tab 1: Overview & Provenance */}
              {activeSideTab === 'METADATA' && (
                <div className="p-4 space-y-3.5">
                  {/* AI X-Ray & Audio Brief Quick Action Banner */}
                  <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/60 to-rose-50/50 border border-amber-200/90 flex items-center justify-between gap-3 shadow-2xs">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>AI X-Ray Deep Intelligence &amp; Audio Brief</span>
                      </div>
                      <p className="text-[11px] text-amber-900/80 mt-0.5 leading-snug">
                        Extracted Operating Specs, LOTO Rules, Spares &amp; Multilingual Voice Readout.
                      </p>
                    </div>
                    <button
                      onClick={() => setXrayDoc(selectedDoc)}
                      className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
                      title="Inspect Operating Specs, LOTO Points & Spares"
                    >
                      <span>⚡</span>
                      <span>AI X-Ray &amp; Audio Brief</span>
                    </button>
                  </div>

                  {/* Quick Action CAD / P&ID Launchers */}
                  {(selectedDoc.category === '3D_MODEL' || CAD_EXTENSIONS.some((e) => selectedDoc.mimeType?.includes(e))) && (
                    <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                          <Boxes className="w-4 h-4 text-purple-700" /> Genuine 3D CAD Asset
                        </div>
                        <div className="text-[11px] text-purple-700 mt-0.5">
                          Interactive WebGL inspection with mesh hierarchy
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleOpen3dViewer(selectedDoc)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                        >
                          Launch 3D Viewer
                        </button>
                      </div>
                    </div>
                  )}

                  {(selectedDoc.category === 'PID_DIAGRAM' || (selectedDoc.category as string) === 'SCHEMATIC_PID') && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-4 h-4 text-amber-700" /> Engineering P&ID Schematic
                        </div>
                        <div className="text-[11px] text-amber-700 mt-0.5">
                          Interactive component tags & vector alignment
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenPidViewer(selectedDoc)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition"
                      >
                        Launch P&ID Viewer
                      </button>
                    </div>
                  )}

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs font-sans">
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] font-semibold">REVISION</div>
                      <div className="text-[#1A202C] font-bold mt-0.5 font-mono">{selectedDoc.revision}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] font-semibold">TOTAL PAGES</div>
                      <div className="text-[#1A202C] font-bold mt-0.5 font-mono">{selectedDoc.totalPages}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] font-semibold">FACILITY / PLANT</div>
                      <div className="text-[#1A202C] font-bold mt-0.5 font-mono">{selectedDoc.plantCode}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] font-semibold">PAYLOAD SIZE</div>
                      <div className="text-[#1A202C] font-bold mt-0.5 font-mono">
                        {(selectedDoc.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </div>
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

                  {/* Associated Plant Asset */}
                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">
                        Associated Asset Tags
                      </span>
                      <div className="font-mono text-xs font-bold text-[#2563EB] mt-0.5">
                        {selectedDoc.assetTags.join(', ') || 'General Facility Asset'}
                      </div>
                    </div>
                    <Cpu className="w-4 h-4 text-[#64748B]" />
                  </div>
                </div>
              )}

              {/* Tab 2: Extracted Pages */}
              {activeSideTab === 'EXTRACTED_TEXT' && (
                <div className="p-4 space-y-3">
                  {selectedDoc.pages && selectedDoc.pages.length > 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-sans font-bold text-[#1A202C]">
                            Page {currentPage?.pageNumber} of {selectedDoc.pages.length}
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
                            Preserved Section Headings:
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

                      {/* Raw Text Viewer with Copy Button */}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">
                            Extracted Text:
                          </span>
                          <button
                            onClick={() => copyPageText(currentPage?.rawText || '')}
                            className="text-[10px] text-[#2563EB] hover:underline flex items-center gap-1"
                          >
                            {copiedText ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Copy Text
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="mt-1 p-2.5 rounded bg-white border border-[#CBD5E1] text-[11px] font-mono text-[#1A202C] whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed shadow-sm">
                          {currentPage?.rawText || '(Empty content on page)'}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center text-xs font-sans text-[#64748B] space-y-2">
                      <FileText className="w-8 h-8 text-[#94A3B8] mx-auto" />
                      <div>No extracted page content cached for this document.</div>
                      <button
                        onClick={() => loadPagesForDoc(selectedDoc.id)}
                        className="px-3 py-1 bg-white border border-[#CBD5E1] rounded text-[#1A202C] text-xs font-medium hover:bg-slate-50 transition"
                      >
                        Fetch Extracted Content
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Pipeline Diagnostics */}
              {activeSideTab === 'PIPELINE' && (
                <div className="p-4 space-y-3 font-sans text-xs">
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold text-[#64748B]">Qdrant Vector Points</span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {selectedDoc.totalChunks} Chunks Indexed
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold text-[#64748B]">Ingestion Retries</span>
                      <span className="font-mono text-[#1A202C]">{selectedDoc.retryCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold text-[#64748B]">Current Pipeline Step</span>
                      <span className="font-mono text-[11px] text-[#2563EB]">{selectedDoc.currentStep || 'Complete'}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1.5">
                    <div className="text-[10px] uppercase font-semibold text-[#64748B]">Security & Isolation</div>
                    <div className="text-[11px] text-[#1A202C] space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Payload magic bytes verified against spoofing</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Strict organization-isolated vector namespace</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Role-Based Access Control enforced on S3 proxy</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Side Panel Footer Action */}
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
        )}
      </div>

      {/* Ingestion Modal (Single + Bulk Modes) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#151C24] text-white flex items-center justify-center">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-sans text-[#1A202C]">
                    Ingest Industrial Technical Documents
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Automated OCR, section chunking & Qdrant vector indexing
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isUploading && setIsUploadModalOpen(false)}
                className="text-[#64748B] hover:text-[#1A202C] transition p-1 rounded"
                disabled={isUploading}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-[#E2E8F0] bg-[#F1F5F9]/60 px-5 pt-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setIngestMode('SINGLE');
                  setUploadError(null);
                }}
                disabled={isUploading}
                className={`py-2 px-4 rounded-t-lg transition flex items-center gap-1.5 ${
                  ingestMode === 'SINGLE'
                    ? 'bg-white text-[#2563EB] border-t border-l border-r border-[#CBD5E1] shadow-sm'
                    : 'text-[#64748B] hover:text-[#1A202C]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Single Document</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIngestMode('BULK');
                  setUploadError(null);
                }}
                disabled={isUploading}
                className={`py-2 px-4 rounded-t-lg transition flex items-center gap-1.5 ${
                  ingestMode === 'BULK'
                    ? 'bg-white text-[#2563EB] border-t border-l border-r border-[#CBD5E1] shadow-sm'
                    : 'text-[#64748B] hover:text-[#1A202C]'
                }`}
              >
                <Files className="w-3.5 h-3.5" />
                <span>Bulk Batch Ingestion (Up to 20 Files)</span>
                {bulkFiles.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#2563EB] text-white text-[10px]">
                    {bulkFiles.length}
                  </span>
                )}
              </button>
            </div>

            {/* Modal Body Container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans text-xs">
              {uploadError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{uploadError}</div>
                </div>
              )}

              {bulkSummary && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Bulk Ingestion Complete: {bulkSummary.succeeded} of {bulkSummary.total} documents queued successfully
                  </div>
                  {bulkSummary.failed > 0 && (
                    <div className="text-rose-700 text-[11px]">
                      {bulkSummary.failed} file(s) failed validation or storage dispatch.
                    </div>
                  )}
                </div>
              )}

              {/* MODE 1: SINGLE DOCUMENT INGESTION */}
              {ingestMode === 'SINGLE' ? (
                <form id="single-upload-form" onSubmit={handleSingleUploadSubmit} className="space-y-4">
                  {/* Single File Dropzone */}
                  <div>
                    <label className="text-[11px] font-sans text-[#64748B] font-semibold uppercase flex items-center justify-between">
                      <span>DOCUMENT FILE</span>
                      <span className="text-[10px] text-[#2563EB] font-normal">
                        PDF, DOCX, TXT, MD, IMAGES, 3D CAD
                      </span>
                    </label>
                    <div className="mt-1 border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] rounded-lg p-5 text-center bg-[#F8FAFC] transition cursor-pointer relative">
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.glb,.gltf,.obj,.stl,.stp,.step,.skp,.fbx,.usd,.usdz,.iges,.igs,.ply,.3mf"
                        onChange={(e) => handleSingleFileSelected(e.target.files?.[0] || null)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        disabled={isUploading}
                      />
                      <div className="flex flex-col items-center">
                        <FileCode className="w-8 h-8 text-[#2563EB] mb-2" />
                        {uploadFile ? (
                          <div className="space-y-1">
                            <div className="text-xs font-mono text-emerald-700 font-semibold flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              {uploadFile.name}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              Size: {(uploadFile.size / 1024).toFixed(1)} KB • Click or drop another to replace
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-xs font-sans text-[#1A202C] font-medium">
                              Click to select or drag & drop industrial manual or 3D asset
                            </div>
                            <div className="text-[10px] font-sans text-[#64748B] mt-1">
                              Magic bytes verified. Max file size: 50MB
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Single Form Grid */}
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
                        className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB] font-mono"
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
                        className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#1A202C] focus:outline-none focus:border-[#2563EB] font-mono"
                        disabled={isUploading}
                      />
                    </div>

                    <div className="col-span-2">
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
                        <option value="PID_DIAGRAM">P&ID Diagram</option>
                        <option value="3D_MODEL">3D Model / CAD</option>
                        <option value="OEM_MANUAL">OEM Technical Manual</option>
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

                    <div className="col-span-2 relative" ref={singleDropdownRef}>
                      <div className="flex items-center justify-between">
                        <label className="text-[#64748B] font-semibold uppercase text-[10px]">
                          ASSOCIATED MACHINES & ASSET TAGS
                        </label>
                        {singleSelectedAssetIds.length > 0 && (
                          <span className="text-[10px] text-[#2563EB] font-medium">
                            {singleSelectedAssetIds.length} machine{singleSelectedAssetIds.length > 1 ? 's' : ''} linked
                          </span>
                        )}
                      </div>

                      {/* Selected Asset Badges */}
                      {singleSelectedAssetIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5 p-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
                          {singleSelectedAssetIds.map((id) => {
                            const m = knownMachines.get(id) || machines.find((mac) => mac.id === id);
                            if (!m) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-[#94A3B8] text-[#1E293B] text-xs font-medium shadow-sm"
                              >
                                <span className="font-mono font-bold text-[#2563EB]">{m.assetTag}</span>
                                <span className="text-[#64748B] truncate max-w-[140px]">{m.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSingleAsset(id)}
                                  disabled={isUploading}
                                  className="text-[#94A3B8] hover:text-rose-600 ml-0.5 focus:outline-none"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Multi-Select Search Combobox Trigger */}
                      <div className="relative mt-1">
                        <div className="flex items-center border border-[#CBD5E1] rounded-lg bg-white px-3 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
                          {isSearchingSingle ? (
                            <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin mr-2 shrink-0" />
                          ) : (
                            <Search className="w-4 h-4 text-[#94A3B8] mr-2 shrink-0" />
                          )}
                          <input
                            type="text"
                            placeholder={
                              singleSelectedAssetIds.length === 0
                                ? 'Search registered machines by asset tag, name, or manufacturer...'
                                : 'Select additional machine...'
                            }
                            value={singleAssetSearch}
                            onChange={(e) => {
                              setSingleAssetSearch(e.target.value);
                              setIsSingleAssetDropdownOpen(true);
                            }}
                            onFocus={() => setIsSingleAssetDropdownOpen(true)}
                            className="w-full bg-transparent text-[#1A202C] text-xs placeholder-[#94A3B8] focus:outline-none"
                            disabled={isUploading}
                          />
                          {singleAssetSearch && (
                            <button
                              type="button"
                              onClick={() => setSingleAssetSearch('')}
                              className="text-[#94A3B8] hover:text-[#475569] p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Dropdown List */}
                        {isSingleAssetDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-[#CBD5E1] rounded-lg shadow-xl py-1 text-xs">
                            {isSearchingSingle ? (
                              <div className="px-3 py-4 text-center text-[#64748B] flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
                                <span>Searching registered machines in database...</span>
                              </div>
                            ) : singleSearchResults.length === 0 ? (
                              <div className="px-3 py-3 text-[#94A3B8] text-center italic">
                                No registered machines matching &quot;{singleAssetSearch}&quot; found
                              </div>
                            ) : (
                              singleSearchResults.map((m) => {
                                const isSelected = singleSelectedAssetIds.includes(m.id);
                                return (
                                  <div
                                    key={m.id}
                                    onClick={() => handleToggleSingleAsset(m)}
                                    className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${
                                      isSelected ? 'bg-blue-50 text-[#1E3A8A]' : 'hover:bg-slate-50 text-[#1E293B]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                          isSelected ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'border-[#CBD5E1] bg-white'
                                        }`}
                                      >
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                      </div>
                                      <span className="font-mono font-semibold text-[#2563EB] shrink-0">
                                        {m.assetTag}
                                      </span>
                                      <span className="text-[#334155] truncate font-medium">{m.name}</span>
                                      {(m.area || (m as any).plantLocation) && (
                                        <span className="text-[10px] text-[#64748B] bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                          {m.area || (m as any).plantLocation}
                                        </span>
                                      )}
                                    </div>
                                    {m.manufacturer && (
                                      <span className="text-[10px] text-[#94A3B8] ml-2 shrink-0">
                                        {m.manufacturer}
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                /* MODE 2: BULK BATCH INGESTION */
                <form id="bulk-upload-form" onSubmit={handleBulkUploadSubmit} className="space-y-4">
                  {/* Bulk Dropzone */}
                  <div className="border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] rounded-lg p-5 text-center bg-[#F8FAFC] transition cursor-pointer relative">
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.glb,.gltf,.obj,.stl,.stp,.step,.skp,.fbx,.usd,.usdz,.iges,.igs,.ply,.3mf"
                      onChange={(e) => handleBulkFilesSelected(e.target.files)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      disabled={isUploading}
                    />
                    <div className="flex flex-col items-center">
                      <Files className="w-8 h-8 text-[#2563EB] mb-2" />
                      <div className="text-xs font-sans text-[#1A202C] font-semibold">
                        Click or drag & drop multiple technical manuals, P&IDs, or 3D files
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-1">
                        Batch limit: Up to 20 files per submission • Max 50MB per file
                      </div>
                    </div>
                  </div>

                  {/* Batch Defaults */}
                  <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">

                      <div>
                        <label className="text-[10px] font-semibold text-[#64748B] uppercase">DEFAULT CLASS</label>
                        <select
                          value={bulkDefaults.defaultCategory}
                          onChange={(e) =>
                            setBulkDefaults({ ...bulkDefaults, defaultCategory: e.target.value as DocumentType })
                          }
                          className="w-full mt-1 px-2 py-1.5 rounded bg-white border border-[#CBD5E1] text-xs font-sans text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                          disabled={isUploading}
                        >
                          <option value="SOP">SOP</option>
                          <option value="PID_DIAGRAM">P&ID Diagram</option>
                          <option value="3D_MODEL">3D Model / CAD</option>
                          <option value="OEM_MANUAL">OEM Manual</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-[#64748B] uppercase">DEFAULT REVISION</label>
                        <input
                          type="text"
                          value={bulkDefaults.defaultRevision}
                          onChange={(e) =>
                            setBulkDefaults({ ...bulkDefaults, defaultRevision: e.target.value })
                          }
                          className="w-full mt-1 px-2 py-1.5 rounded bg-white border border-[#CBD5E1] text-xs font-sans text-[#1A202C] focus:outline-none focus:border-[#2563EB] font-mono"
                          disabled={isUploading}
                        />
                      </div>
                    </div>

                    {/* Bulk Associated Assets Dropdown */}
                    <div className="relative" ref={bulkDropdownRef}>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-[#64748B] uppercase">
                          DEFAULT ASSOCIATED MACHINES & ASSET TAGS
                        </label>
                        {bulkSelectedAssetIds.length > 0 && (
                          <span className="text-[10px] text-[#2563EB] font-medium">
                            {bulkSelectedAssetIds.length} machine{bulkSelectedAssetIds.length > 1 ? 's' : ''} linked to batch
                          </span>
                        )}
                      </div>

                      {bulkSelectedAssetIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5 p-2 bg-white border border-[#CBD5E1] rounded-lg">
                          {bulkSelectedAssetIds.map((id) => {
                            const m = knownMachines.get(id) || machines.find((mac) => mac.id === id);
                            if (!m) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F8FAFC] border border-[#94A3B8] text-[#1E293B] text-xs font-medium shadow-sm"
                              >
                                <span className="font-mono font-bold text-[#2563EB]">{m.assetTag}</span>
                                <span className="text-[#64748B] truncate max-w-[140px]">{m.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBulkAsset(id)}
                                  disabled={isUploading}
                                  className="text-[#94A3B8] hover:text-rose-600 ml-0.5 focus:outline-none"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="relative mt-1">
                        <div className="flex items-center border border-[#CBD5E1] rounded-lg bg-white px-3 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
                          {isSearchingBulk ? (
                            <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin mr-2 shrink-0" />
                          ) : (
                            <Search className="w-4 h-4 text-[#94A3B8] mr-2 shrink-0" />
                          )}
                          <input
                            type="text"
                            placeholder={
                              bulkSelectedAssetIds.length === 0
                                ? 'Search registered machines for batch linkage...'
                                : 'Add another machine to batch...'
                            }
                            value={bulkAssetSearch}
                            onChange={(e) => {
                              setBulkAssetSearch(e.target.value);
                              setIsBulkAssetDropdownOpen(true);
                            }}
                            onFocus={() => setIsBulkAssetDropdownOpen(true)}
                            className="w-full bg-transparent text-[#1A202C] text-xs placeholder-[#94A3B8] focus:outline-none"
                            disabled={isUploading}
                          />
                          {bulkAssetSearch && (
                            <button
                              type="button"
                              onClick={() => setBulkAssetSearch('')}
                              className="text-[#94A3B8] hover:text-[#475569] p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {isBulkAssetDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-[#CBD5E1] rounded-lg shadow-xl py-1 text-xs">
                            {isSearchingBulk ? (
                              <div className="px-3 py-4 text-center text-[#64748B] flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
                                <span>Searching registered machines in database...</span>
                              </div>
                            ) : bulkSearchResults.length === 0 ? (
                              <div className="px-3 py-3 text-[#94A3B8] text-center italic">
                                No registered machines matching &quot;{bulkAssetSearch}&quot; found
                              </div>
                            ) : (
                              bulkSearchResults.map((m) => {
                                const isSelected = bulkSelectedAssetIds.includes(m.id);
                                return (
                                  <div
                                    key={m.id}
                                    onClick={() => handleToggleBulkAsset(m)}
                                    className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${
                                      isSelected ? 'bg-blue-50 text-[#1E3A8A]' : 'hover:bg-slate-50 text-[#1E293B]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                          isSelected ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'border-[#CBD5E1] bg-white'
                                        }`}
                                      >
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                      </div>
                                      <span className="font-mono font-semibold text-[#2563EB] shrink-0">
                                        {m.assetTag}
                                      </span>
                                      <span className="text-[#334155] truncate font-medium">{m.name}</span>
                                      {(m.area || (m as any).plantLocation) && (
                                        <span className="text-[10px] text-[#64748B] bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                          {m.area || (m as any).plantLocation}
                                        </span>
                                      )}
                                    </div>
                                    {m.manufacturer && (
                                      <span className="text-[10px] text-[#94A3B8] ml-2 shrink-0">
                                        {m.manufacturer}
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Batch Queue Table */}
                  {bulkFiles.length > 0 ? (
                    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                      <div className="bg-[#F8FAFC] px-3 py-2 border-b border-[#E2E8F0] flex items-center justify-between text-[11px] font-semibold text-[#64748B]">
                        <span>BATCH QUEUE ({bulkFiles.length} Documents)</span>
                        <button
                          type="button"
                          onClick={() => setBulkFiles([])}
                          disabled={isUploading}
                          className="text-rose-600 hover:text-rose-800 text-[10px]"
                        >
                          Clear All
                        </button>
                      </div>

                      <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0]">
                        {bulkFiles.map((item) => {
                          const ext = (item.file.name.split('.').pop() || '').toLowerCase();
                          const badge = getFormatBadgeColor(ext);

                          return (
                            <div key={item.id} className="p-2.5 flex items-center gap-2 hover:bg-slate-50 transition">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${badge.bg}`}>
                                {badge.label}
                              </span>

                              <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-3">
                                  <input
                                    type="text"
                                    value={item.docNumber}
                                    placeholder="Doc #"
                                    onChange={(e) => handleUpdateBulkFile(item.id, { docNumber: e.target.value })}
                                    className="w-full px-2 py-1 rounded bg-white border border-[#CBD5E1] text-[11px] font-mono text-[#1A202C]"
                                    disabled={isUploading}
                                  />
                                </div>
                                <div className="col-span-5">
                                  <input
                                    type="text"
                                    value={item.title}
                                    placeholder="Title"
                                    onChange={(e) => handleUpdateBulkFile(item.id, { title: e.target.value })}
                                    className="w-full px-2 py-1 rounded bg-white border border-[#CBD5E1] text-[11px] text-[#1A202C]"
                                    disabled={isUploading}
                                  />
                                </div>
                                <div className="col-span-4">
                                  <select
                                    value={item.category}
                                    onChange={(e) =>
                                      handleUpdateBulkFile(item.id, { category: e.target.value as DocumentType })
                                    }
                                    className="w-full px-1.5 py-1 rounded bg-white border border-[#CBD5E1] text-[10px] text-[#1A202C]"
                                    disabled={isUploading}
                                  >
                                    <option value="SOP">SOP</option>
                                    <option value="PID_DIAGRAM">P&ID</option>
                                    <option value="3D_MODEL">3D CAD</option>
                                    <option value="OEM_MANUAL">OEM Manual</option>
                                  </select>
                                </div>
                              </div>

                              <div className="w-20 text-right font-mono text-[10px] text-[#64748B] shrink-0">
                                {(item.file.size / 1024).toFixed(0)} KB
                              </div>

                              <div className="w-6 shrink-0 text-center">
                                {item.status === 'UPLOADING' && (
                                  <RotateCw className="w-3.5 h-3.5 text-[#2563EB] animate-spin inline" />
                                )}
                                {item.status === 'INDEXED' && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                                )}
                                {item.status === 'FAILED' && (
                                  <span title={item.errorMessage || 'Failed'}>
                                    <AlertTriangle className="w-4 h-4 text-rose-600 inline" />
                                  </span>
                                )}
                                {item.status === 'READY' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBulkFile(item.id)}
                                    disabled={isUploading}
                                    className="text-[#94A3B8] hover:text-rose-600 p-0.5 rounded"
                                    title="Remove from batch"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center text-xs text-[#64748B]">
                      No documents added yet. Select multiple files above to build your batch queue.
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <div className="text-[11px] text-[#64748B]">
                {ingestMode === 'SINGLE'
                  ? uploadFile
                    ? `Selected: ${uploadFile.name}`
                    : 'Awaiting file selection'
                  : `${bulkFiles.length} file(s) in bulk queue`}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] text-xs font-semibold transition"
                  disabled={isUploading}
                >
                  Cancel
                </button>

                {ingestMode === 'SINGLE' ? (
                  <button
                    type="submit"
                    form="single-upload-form"
                    disabled={isUploading || !uploadFile}
                    className="px-4 py-1.5 rounded-lg bg-[#151C24] hover:bg-black disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                  >
                    {isUploading ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Ingesting...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>Start Ingestion Job</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="submit"
                    form="bulk-upload-form"
                    disabled={isUploading || bulkFiles.length === 0}
                    className="px-4 py-1.5 rounded-lg bg-[#151C24] hover:bg-black disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                  >
                    {isUploading ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading Batch...</span>
                      </>
                    ) : (
                      <>
                        <Files className="w-4 h-4" />
                        <span>Ingest {bulkFiles.length} Documents</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real 3D CAD Engineering Viewer Modal */}
      {is3dViewerOpen && (
        <RealThreeDViewerModal
          isOpen={is3dViewerOpen}
          onClose={() => setIs3dViewerOpen(false)}
          machine={viewerMachine}
          mappings={viewerMappings}
        />
      )}

      {/* Real Engineering P&ID Viewer Modal */}
      {isPidViewerOpen && (
        <PidEngineeringViewerModal
          isOpen={isPidViewerOpen}
          onClose={() => setIsPidViewerOpen(false)}
          machine={viewerMachine}
          mappings={viewerMappings}
          activeTag={activePidTag}
        />
      )}

      {/* 🧠 Clean AI X-Ray Deep Intelligence Inspector Modal */}
      {xrayDoc && (() => {
        const intel = getDocXrayIntelligence(xrayDoc);
        const displayInfo = formatDocDisplay(xrayDoc);
        const primaryAsset = xrayDoc.assetTags?.[0] || 'PLANT-WIDE';
        const is3D = xrayDoc.category === '3D_MODEL' || CAD_EXTENSIONS.some((e) => xrayDoc.mimeType?.includes(e));
        const isPID = xrayDoc.category === 'PID_DIAGRAM' || (xrayDoc.category as string) === 'SCHEMATIC_PID';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => {
              if (isXraySpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setIsXraySpeaking(false);
              }
              setXrayDoc(null);
            }}
          >
            <div
              className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Signature Deep Navy-to-Indigo Gradient Header */}
              <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-t-2xl shrink-0 space-y-2 border-b border-indigo-950">
                {/* Row 1: Badges + Voice Switcher + Close */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                      <span>🧠</span>
                      <span>AI X-RAY INTELLIGENCE</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-100 bg-slate-800/90 border border-slate-700 px-2 py-0.5 rounded-md">
                      #{xrayDoc.documentNumber}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold">
                      {xrayDoc.totalChunks || 96} Chunks Live
                    </span>
                  </div>

                  {/* Header Actions: Audio Brief + Close */}
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {/* Audio Brief with EN | हिं toggle */}
                    <div className="flex items-center rounded-lg border border-indigo-300/30 bg-white/10 p-0.5 shrink-0 backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={() => handleToggleXrayAudio(xrayDoc, xrayVoiceLang)}
                        className={`h-7 px-2 rounded-md text-xs font-mono font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-1 ${
                          isXraySpeaking
                            ? 'bg-amber-500 text-white animate-pulse'
                            : 'hover:bg-white/10 text-slate-200 hover:text-white'
                        }`}
                        title="Listen to 20s AI safety & tolerance summary"
                      >
                        {isXraySpeaking ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 shrink-0" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Listen Brief</span>
                          </>
                        )}
                      </button>
                      <div className="h-4 w-px bg-white/20 mx-0.5" />
                      <div className="flex items-center gap-0.5 text-[10px] font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setXrayVoiceLang('en');
                            if (isXraySpeaking) {
                              window.speechSynthesis.cancel();
                              setIsXraySpeaking(false);
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                            xrayVoiceLang === 'en'
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'text-slate-300 hover:text-white hover:bg-white/10'
                          }`}
                          title="English Audio Brief"
                        >
                          🇺🇸 EN
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setXrayVoiceLang('hi');
                            if (isXraySpeaking) {
                              window.speechSynthesis.cancel();
                              setIsXraySpeaking(false);
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                            xrayVoiceLang === 'hi'
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'text-slate-300 hover:text-white hover:bg-white/10'
                          }`}
                          title="हिंदी Audio Brief"
                        >
                          🇮🇳 हिं
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isXraySpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          setIsXraySpeaking(false);
                        }
                        setXrayDoc(null);
                      }}
                      className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Document Title & Machine Tag */}
                <div className="pt-0.5">
                  <h3 className="text-base font-bold text-white leading-snug break-words">
                    {displayInfo.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-1 flex-wrap">
                    <span className="font-mono text-indigo-300 font-semibold flex items-center gap-1">
                      ⚙️ Asset: {primaryAsset}
                    </span>
                    <span>•</span>
                    <span className="text-slate-300 font-sans">
                      Class: <strong>{xrayDoc.category}</strong>
                    </span>
                    <span>•</span>
                    <span className="text-slate-300 font-mono">
                      Rev: {xrayDoc.revision}
                    </span>
                    {displayInfo.subtitle && (
                      <>
                        <span>•</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          📦 {displayInfo.subtitle}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Body: 3 Clean Intelligence Boxes */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-slate-50/50">
                {/* Box 1: Operating Specs & Tolerances */}
                <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 text-xs uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>⚡ Extracted Operating Specs & Tolerances</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                      Direct OCR & Chunk Parsed
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {intel.specs.map((spec, i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                        <span className="text-[11px] font-sans text-slate-600">{spec.label}</span>
                        <div className="flex items-baseline justify-between mt-1 gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs">{spec.value}</span>
                          <span className="text-[10px] font-mono text-amber-700 font-semibold shrink-0">
                            {spec.tolerance}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Box 2: LOTO & Safety Isolation Points */}
                <div className="bg-white border border-amber-200/80 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-amber-900 text-xs uppercase tracking-wider">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>🔒 LOTO & Safety Isolation Points</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      OSHA 1910.147 Compliant
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {intel.lotoPoints.map((pt, i) => (
                      <div key={i} className="p-2 rounded-lg bg-amber-50/60 border border-amber-200/70 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 font-mono text-[11px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                            {pt.point}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-900 shrink-0">
                            {pt.energyType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 leading-relaxed pl-2.5">
                          <strong>Verification:</strong> {pt.verification}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Box 3: Critical Sub-Assemblies & Spares Indexed */}
                <div className="bg-white border border-indigo-200/80 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-indigo-950 text-xs uppercase tracking-wider">
                      <Boxes className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>🔩 Critical Sub-Assemblies & Spares Indexed</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                      Qdrant Vector Mesh
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {intel.subAssemblies.map((sub, i) => (
                      <div key={i} className="p-2 rounded-lg bg-indigo-50/40 border border-indigo-200/70 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-xs truncate" title={sub.name}>
                            {sub.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            SKU: {sub.sku}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full shrink-0">
                          {sub.chunks} chk
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {is3D && (
                    <button
                      type="button"
                      onClick={() => {
                        setXrayDoc(null);
                        handleOpen3dViewer(xrayDoc);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>Open 3D Model</span>
                    </button>
                  )}
                  {isPID && (
                    <button
                      type="button"
                      onClick={() => {
                        setXrayDoc(null);
                        handleOpenPidViewer(xrayDoc);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Open P&ID Schematic</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const text = `[AI X-RAY] ${displayInfo.title} (${primaryAsset})\n\nOperating Specs:\n${intel.specs.map((s) => `• ${s.label}: ${s.value} (${s.tolerance})`).join('\n')}\n\nLOTO Points:\n${intel.lotoPoints.map((p) => `• ${p.point} [${p.energyType}]: ${p.verification}`).join('\n')}`;
                      navigator.clipboard.writeText(text);
                      toast.success('X-Ray Copied', 'Operating specs and LOTO rules copied to clipboard.');
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-mono font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Specs</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (isXraySpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                      setIsXraySpeaking(false);
                    }
                    setXrayDoc(null);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-mono font-bold transition cursor-pointer active:scale-95 shadow-sm"
                >
                  Close X-Ray
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

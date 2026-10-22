import React, { useState, useRef, useEffect } from 'react';
import { X, ShieldAlert, Cpu, Layers, CheckCircle2, AlertTriangle, UploadCloud, ChevronDown, ChevronUp, Box, FileCode, Trash2, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fileToDataUrl, saveMachineFiles } from '../../lib/machineStorage';
import type { DataClassification, MachineCriticality, DocumentationReadiness } from '@forgex/shared-types';
import { useToast } from '../../lib/ToastContext';

interface RegisterMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMachineCreated: () => void;
  token: string | null;
  organizationId?: string;
}

export const RegisterMachineModal: React.FC<RegisterMachineModalProps> = ({
  isOpen,
  onClose,
  onMachineCreated,
  token,
  organizationId,
}) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Single form fields
  const [assetTag, setAssetTag] = useState('');
  const [name, setName] = useState('');
  const [machineType, setMachineType] = useState('Centrifugal Pump');
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [building, setBuilding] = useState('Unit-02');
  const [productionLine, setProductionLine] = useState('Crude Distillation');
  const [criticality, setCriticality] = useState<MachineCriticality>('HIGH');
  const [dataClassification, setDataClassification] = useState<DataClassification>('CONFIDENTIAL');
  const [documentationReadiness, setDocumentationReadiness] = useState<DocumentationReadiness>('PENDING_INSPECTION');
  const [installationDate, setInstallationDate] = useState('');
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState('');
  const [operationalStatus, setOperationalStatus] = useState<'Active' | 'Standby' | 'Under Maintenance'>('Active');
  const [vendorSupplier, setVendorSupplier] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model3dFile, setModel3dFile] = useState<File | null>(null);
  const [pidFile, setPidFile] = useState<File | null>(null);

  // Checkbox automation state
  const [hasModel3d, setHasModel3d] = useState(false);
  const [hasPidDiagram, setHasPidDiagram] = useState(false);
  const [isDragging3d, setIsDragging3d] = useState(false);
  const [isDraggingPid, setIsDraggingPid] = useState(false);

  // Hidden file input refs
  const model3dInputRef = useRef<HTMLInputElement | null>(null);
  const pidInputRef = useRef<HTMLInputElement | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // Batch form fields
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [parsedBatchMachines, setParsedBatchMachines] = useState<any[]>([]);
  const [isDraggingBatch, setIsDraggingBatch] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInstallationDate('');
      setWarrantyExpiryDate('');
      setOperationalStatus('Active');
      setVendorSupplier('');
      setShowAdvanced(false);
      setModel3dFile(null);
      setPidFile(null);
      setHasModel3d(false);
      setHasPidDiagram(false);
      setIsDragging3d(false);
      setIsDraggingPid(false);
      setBatchFile(null);
      setParsedBatchMachines([]);
      setIsDraggingBatch(false);
      setIsParsing(false);
      if (model3dInputRef.current) model3dInputRef.current.value = '';
      if (pidInputRef.current) pidInputRef.current.value = '';
      if (csvFileInputRef.current) csvFileInputRef.current.value = '';
      setError(null);
      setDuplicateWarning(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const checkDuplicates = async (tag: string, mfg: string, mdl: string) => {
    if (!tag && !mfg) {
      setDuplicateWarning(null);
      return;
    }
    try {
      const res = await fetch('/api/v1/machines/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({ assetTag: tag, manufacturer: mfg, modelNumber: mdl }),
      });
      const data = await res.json();
      if (data.isDuplicate) {
        setDuplicateWarning(data.warning || 'A machine with this tag or OEM model already exists.');
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Non-blocking warning check
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleModel3dFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setModel3dFile(file);
      setHasModel3d(true);
    } else {
      setModel3dFile(null);
      setHasModel3d(false);
    }
  };

  const handleRemoveModel3d = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setModel3dFile(null);
    setHasModel3d(false);
    if (model3dInputRef.current) {
      model3dInputRef.current.value = '';
    }
  };

  const handleDrop3d = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging3d(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setModel3dFile(file);
      setHasModel3d(true);
    }
  };

  const handleModel3dCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasModel3d(e.target.checked);
  };

  const handlePidFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPidFile(file);
      setHasPidDiagram(true);
    } else {
      setPidFile(null);
      setHasPidDiagram(false);
    }
  };

  const handleRemovePid = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPidFile(null);
    setHasPidDiagram(false);
    if (pidInputRef.current) {
      pidInputRef.current.value = '';
    }
  };

  const handleDropPid = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPid(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setPidFile(file);
      setHasPidDiagram(true);
    }
  };

  const handlePidCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasPidDiagram(e.target.checked);
  };


  const parseSpreadsheetData = (rows: any[][]) => {
    if (!rows || rows.length === 0) return [];

    // Filter out completely blank rows
    const cleanRows = rows.filter(
      (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );
    if (cleanRows.length === 0) return [];

    const firstRow = cleanRows[0].map((c) => String(c || '').toLowerCase());
    const hasHeader = firstRow.some((col) =>
      ['tag', 'asset', 'assettag', 'asset_tag', 'name', 'equipment', 'type', 'manufacturer', 'model'].includes(
        col.replace(/[^a-z]/g, '')
      )
    );

    let dataRows = cleanRows;
    let tagIdx = 0;
    let nameIdx = 1;
    let typeIdx = 2;
    let mfgIdx = 3;
    let modelIdx = 4;
    let serialIdx = -1;
    let bldgIdx = -1;
    let lineIdx = -1;

    if (hasHeader) {
      dataRows = cleanRows.slice(1);
      firstRow.forEach((h, idx) => {
        const clean = h.replace(/[^a-z]/g, '');
        if (clean.includes('tag') || clean === 'asset' || clean === 'id') tagIdx = idx;
        else if (clean.includes('name') || clean.includes('equipment') || clean.includes('desc')) nameIdx = idx;
        else if (clean.includes('type') || clean.includes('category')) typeIdx = idx;
        else if (clean.includes('manufacturer') || clean.includes('mfg') || clean.includes('oem')) mfgIdx = idx;
        else if (clean.includes('model') || clean.includes('series')) modelIdx = idx;
        else if (clean.includes('serial')) serialIdx = idx;
        else if (clean.includes('building') || clean.includes('bldg')) bldgIdx = idx;
        else if (clean.includes('line') || clean.includes('production') || clean.includes('area')) lineIdx = idx;
      });
    }

    return dataRows
      .map((row) => {
        const tag = String(row[tagIdx] ?? '').trim();
        const rawName = String(row[nameIdx] ?? '').trim();
        const rawType = typeIdx >= 0 && row[typeIdx] ? String(row[typeIdx]).trim() : 'Rotating Equipment';
        const mfg = mfgIdx >= 0 && row[mfgIdx] ? String(row[mfgIdx]).trim() : undefined;
        const model = modelIdx >= 0 && row[modelIdx] ? String(row[modelIdx]).trim() : undefined;
        const serial = serialIdx >= 0 && row[serialIdx] ? String(row[serialIdx]).trim() : undefined;
        const bldg = bldgIdx >= 0 && row[bldgIdx] ? String(row[bldgIdx]).trim() : undefined;
        const prodLine = lineIdx >= 0 && row[lineIdx] ? String(row[lineIdx]).trim() : undefined;

        if (!tag && !rawName) return null;

        return {
          assetTag: (tag || `MACH-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
          name: rawName || 'Industrial Asset',
          machineType: rawType || 'Rotating Equipment',
          manufacturer: mfg || undefined,
          modelNumber: model || undefined,
          serialNumber: serial || undefined,
          building: bldg || undefined,
          productionLine: prodLine || undefined,
          criticality: 'MEDIUM' as MachineCriticality,
          dataClassification: 'CONFIDENTIAL' as DataClassification,
          documentationReadiness: 'INCOMPLETE' as DocumentationReadiness,
        };
      })
      .filter(Boolean);
  };

  const handleBatchFile = async (file: File) => {
    if (!file) return;

    // Validate 10MB limit
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please choose a file under 10MB.`);
      return;
    }

    // Validate extension
    const fileName = file.name.toLowerCase();
    const isValid = fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    if (!isValid) {
      setError('Unsupported file type. Please upload a .csv, .xlsx, or .xls spreadsheet.');
      return;
    }

    setError(null);
    setBatchFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setError('The uploaded workbook contains no sheets.');
        setParsedBatchMachines([]);
        setIsParsing(false);
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const sheetRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
      const parsed = parseSpreadsheetData(sheetRows);

      if (parsed.length === 0) {
        setError('No valid machine records could be parsed. Ensure your spreadsheet contains headers or rows matching: Asset Tag, Equipment Name, Machine Type, Manufacturer, Model.');
      }
      setParsedBatchMachines(parsed);
    } catch (err: any) {
      console.error('Error parsing spreadsheet:', err);
      setError(err?.message || 'Failed to parse spreadsheet. Please verify it is a valid CSV or Excel file.');
      setParsedBatchMachines([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleRemoveBatchFile = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setBatchFile(null);
    setParsedBatchMachines([]);
    setIsParsing(false);
    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = '';
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetTag.trim() || !name.trim()) {
      const errMsg = 'Asset Tag and Machine Name are required fields.';
      setError(errMsg);
      toast.error('Validation Error', errMsg);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const operationalStateMap: Record<string, string> = {
        Active: 'OPTIMAL',
        Standby: 'ADVISORY',
        'Under Maintenance': 'WARNING_MAINTENANCE_REQUIRED',
      };

      const payload: Record<string, any> = {
        assetTag: assetTag.trim().toUpperCase(),
        name: name.trim(),
        machineType,
        manufacturer: manufacturer.trim() || undefined,
        modelNumber: modelNumber.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        building,
        productionLine,
        criticality,
        dataClassification,
        documentationReadiness,
        installationDate: installationDate || undefined,
        warrantyExpiryDate: warrantyExpiryDate || undefined,
        operationalStatus,
        operationalState: operationalStateMap[operationalStatus] || 'OPTIMAL',
        vendorSupplier: vendorSupplier.trim() || undefined,
        hasModel3d,
        hasPidDiagram,
      };

      if (hasModel3d && model3dFile) {
        payload.model3dFile = {
          name: model3dFile.name,
          size: model3dFile.size,
          type: model3dFile.type,
        };
        payload.model3dStorageKey = `models/${assetTag.trim().toUpperCase()}-${model3dFile.name}`;
        payload.model3dFormat = model3dFile.name.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf';
      }

      if (hasPidDiagram && pidFile) {
        payload.pidFile = {
          name: pidFile.name,
          size: pidFile.size,
          type: pidFile.type,
        };
        payload.pidStorageKey = `schematics/${assetTag.trim().toUpperCase()}-${pidFile.name}`;
      }

      const specs: Record<string, any> = {};
      if (installationDate) specs.installationDate = installationDate;
      if (warrantyExpiryDate) specs.warrantyExpiryDate = warrantyExpiryDate;
      if (operationalStatus) specs.operationalStatus = operationalStatus;
      if (vendorSupplier.trim()) specs.vendorSupplier = vendorSupplier.trim();
      if (model3dFile) {
        specs.model3dFileName = model3dFile.name;
        specs.model3dFileSize = model3dFile.size;
      }
      if (pidFile) {
        specs.pidFileName = pidFile.name;
        specs.pidFileSize = pidFile.size;
      }
      if (Object.keys(specs).length > 0) {
        payload.technicalSpecs = specs;
      }

      const res = await fetch('/api/v1/machines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Machine Registered', `Asset ${assetTag.trim().toUpperCase()} successfully added to registry.`);
        const createdMachine = json.data;
        if (model3dFile || pidFile) {
          const filesToStore: any = {};
          if (model3dFile) {
            try {
              const dUrl = await fileToDataUrl(model3dFile);
              filesToStore.model3dFile = {
                name: model3dFile.name,
                size: model3dFile.size,
                type: model3dFile.type,
                format: model3dFile.name.split('.').pop()?.toLowerCase(),
              };
              filesToStore.model3dUrl = dUrl;
            } catch (err) {
              console.warn('Failed to convert 3D file to data URL:', err);
            }
          }
          if (pidFile) {
            try {
              const dUrl = await fileToDataUrl(pidFile);
              filesToStore.pidFile = {
                name: pidFile.name,
                size: pidFile.size,
                type: pidFile.type,
              };
              filesToStore.pidUrl = dUrl;
              filesToStore.pAndIdFile = filesToStore.pidFile;
              filesToStore.pAndIdUrl = dUrl;
            } catch (err) {
              console.warn('Failed to convert PID file to data URL:', err);
            }
          }
          saveMachineFiles(
            { id: createdMachine?.id, assetTag: createdMachine?.assetTag || assetTag.trim().toUpperCase() },
            filesToStore
          );
        }

        setInstallationDate('');
        setWarrantyExpiryDate('');
        setOperationalStatus('Active');
        setVendorSupplier('');
        setShowAdvanced(false);
        setModel3dFile(null);
        setPidFile(null);
        setHasModel3d(false);
        setHasPidDiagram(false);
        setIsDragging3d(false);
        setIsDraggingPid(false);
        if (model3dInputRef.current) model3dInputRef.current.value = '';
        if (pidInputRef.current) pidInputRef.current.value = '';
        onMachineCreated();
        onClose();
      } else {
        const errMsg = json.error?.message || 'Failed to register machine.';
        setError(errMsg);
        toast.error('Registration Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error registering machine.';
      setError(errMsg);
      toast.error('Network Error', errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedBatchMachines.length === 0) {
      const errMsg = 'Please upload a valid CSV or Excel file with machine records.';
      setError(errMsg);
      toast.error('Validation Error', errMsg);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/machines/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          machines: parsedBatchMachines,
          items: parsedBatchMachines,
          sourceFileName: batchFile?.name || 'Bulk-Spreadsheet-Import',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Batch Enrolled', `Successfully registered ${parsedBatchMachines.length} industrial machines.`);
        setBatchFile(null);
        setParsedBatchMachines([]);
        onMachineCreated();
        onClose();
      } else {
        const errMsg = json.error?.message || 'Batch registration failed.';
        setError(errMsg);
        toast.error('Batch Import Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error registering batch machines.';
      setError(errMsg);
      toast.error('Network Error', errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-[#2563EB]" />
            <div>
              <h2 className="text-sm font-bold text-[#1A202C] tracking-wide font-mono uppercase">
                Machine Registration Ledger
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Authoritative organization asset creation & classification boundary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex bg-[#F8FAFC] px-6 pt-3 border-b border-[#E2E8F0] gap-2">
          <button
            type="button"
            onClick={() => { setMode('single'); setError(null); }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              mode === 'single'
                ? 'border-[#2563EB] text-[#2563EB] font-bold'
                : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Single Machine Entry</span>
          </button>
          <button
            type="button"
            onClick={() => { setMode('batch'); setError(null); }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              mode === 'batch'
                ? 'border-[#2563EB] text-[#2563EB] font-bold'
                : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Batch Registration (Bulk CSV)</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {duplicateWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {mode === 'single' ? (
            <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1A202C] mb-1 font-semibold">
                    Asset Tag / Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="PUMP-204-B"
                    value={assetTag}
                    onChange={(e) => {
                      setAssetTag(e.target.value);
                      checkDuplicates(e.target.value, manufacturer, modelNumber);
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none uppercase placeholder-[#94A3B8]"
                  />
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-semibold">
                    Equipment Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Centrifugal Slurry Bottoms Pump"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#1A202C] mb-1 font-medium">Machine Type</label>
                  <select
                    value={machineType}
                    onChange={(e) => setMachineType(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none"
                  >
                    <option value="Centrifugal Pump">Centrifugal Pump</option>
                    <option value="Wet Gas Compressor">Wet Gas Compressor</option>
                    <option value="Shell & Tube Heat Exchanger">Heat Exchanger</option>
                    <option value="Emergency Isolation Valve">Emergency Isolation Valve</option>
                    <option value="Hydraulic Motor">Hydraulic Motor</option>
                    <option value="Fractionation Tower">Fractionation Tower</option>
                    <option value="Other / Unknown">Other / Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-medium">Manufacturer (OEM)</label>
                  <input
                    type="text"
                    placeholder="Flowserve Corp"
                    value={manufacturer}
                    onChange={(e) => {
                      setManufacturer(e.target.value);
                      checkDuplicates(assetTag, e.target.value, modelNumber);
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8]"
                  />
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-medium">Model / Series</label>
                  <input
                    type="text"
                    placeholder="Mark 3 ANSI"
                    value={modelNumber}
                    onChange={(e) => {
                      setModelNumber(e.target.value);
                      checkDuplicates(assetTag, manufacturer, e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#1A202C] mb-1 font-medium">Serial Number</label>
                  <input
                    type="text"
                    placeholder="SN-99824-A"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8]"
                  />
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-medium">Building / Complex</label>
                  <input
                    type="text"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8]"
                  />
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-medium">Production Line</label>
                  <input
                    type="text"
                    value={productionLine}
                    onChange={(e) => setProductionLine(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8]"
                  />
                </div>
              </div>

              {/* Security Classification */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#E2E8F0]">
                <div>
                  <label className="block text-[#2563EB] mb-1 font-semibold">
                    Data Classification *
                  </label>
                  <select
                    value={dataClassification}
                    onChange={(e) => setDataClassification(e.target.value as DataClassification)}
                    className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none"
                  >
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="INTERNAL">INTERNAL</option>
                    <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                    <option value="RESTRICTED">RESTRICTED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-semibold">Criticality</label>
                  <select
                    value={criticality}
                    onChange={(e) => setCriticality(e.target.value as MachineCriticality)}
                    className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MISSION_CRITICAL">MISSION_CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#1A202C] mb-1 font-semibold">Docs Readiness</label>
                  <select
                    value={documentationReadiness}
                    onChange={(e) => setDocumentationReadiness(e.target.value as DocumentationReadiness)}
                    className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none"
                  >
                    <option value="READY">READY</option>
                    <option value="PENDING_INSPECTION">PENDING_INSPECTION</option>
                    <option value="INCOMPLETE">INCOMPLETE</option>
                  </select>
                </div>
              </div>

              {/* Advanced / Additional Asset Details Collapsible */}
              <div className="pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex items-center justify-between w-full py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#1A202C] transition group cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span>Advanced / Additional Details</span>
                    {(installationDate || warrantyExpiryDate || vendorSupplier || operationalStatus !== 'Active') && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" title="Additional details configured" />
                    )}
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4 text-[#64748B] group-hover:text-[#1A202C] transition-transform" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#64748B] group-hover:text-[#1A202C] transition-transform" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-2 gap-3 pt-2.5 pb-1 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[#1A202C] mb-1 font-medium">Installation Date</label>
                      <input
                        type="date"
                        value={installationDate}
                        onChange={(e) => setInstallationDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[#1A202C] mb-1 font-medium">Warranty Expiry Date</label>
                      <input
                        type="date"
                        value={warrantyExpiryDate}
                        onChange={(e) => setWarrantyExpiryDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[#1A202C] mb-1 font-medium">Operational Status</label>
                      <select
                        value={operationalStatus}
                        onChange={(e) => setOperationalStatus(e.target.value as any)}
                        className="w-full px-2.5 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none font-mono text-xs"
                      >
                        <option value="Active">Active</option>
                        <option value="Standby">Standby</option>
                        <option value="Under Maintenance">Under Maintenance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[#1A202C] mb-1 font-medium">Vendor / Supplier Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Siemens Energy / Flowserve"
                        value={vendorSupplier}
                        onChange={(e) => setVendorSupplier(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none placeholder-[#94A3B8] font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Asset Twin Dropzones & Checkboxes */}
              <div className="pt-2 border-t border-[#E2E8F0]">
                <input
                  type="file"
                  ref={model3dInputRef}
                  style={{ display: 'none' }}
                  accept=".glb,.gltf,.step,.stp,.obj,.stl,.zip,model/*"
                  onChange={handleModel3dFileChange}
                />
                <input
                  type="file"
                  ref={pidInputRef}
                  style={{ display: 'none' }}
                  accept=".pdf,.svg,.png,.jpg,.jpeg,.dwg,.dxf,image/*,application/pdf"
                  onChange={handlePidFileChange}
                />

                <div className="grid grid-cols-2 gap-4">
                  {/* a) 3D CAD / Digital Twin Model Dropzone */}
                  <div className="flex flex-col">
                    {model3dFile ? (
                      <div className="border border-blue-200 bg-[#F0F7FF] rounded-xl p-3.5 flex items-center justify-between min-h-[148px] shadow-xs transition-all">
                        <div className="flex items-center gap-3 overflow-hidden mr-2">
                          <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs font-mono font-bold text-xs">
                            <Box className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden space-y-0.5 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#1E293B] truncate max-w-[190px]" title={model3dFile.name}>
                                {model3dFile.name}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                Attached
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-[#64748B]">
                              {formatFileSize(model3dFile.size)} • 3D Digital Twin
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveModel3d}
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-600 hover:bg-rose-50 transition shrink-0 cursor-pointer border border-transparent hover:border-rose-200"
                          title="Remove file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          model3dInputRef.current?.click();
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging3d(true); }}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging3d(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging3d(false); }}
                        onDrop={handleDrop3d}
                        className={`group border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[148px] ${
                          isDragging3d
                            ? 'border-[#2563EB] bg-blue-50/70 scale-[0.99] shadow-inner'
                            : 'border-[#D1D5DB] bg-[#F8FAFC] hover:border-[#3B82F6] hover:bg-[#F0F7FF] shadow-xs'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-center text-[#2563EB] mb-2 group-hover:scale-105 group-hover:border-blue-200 group-hover:text-[#1D4ED8] transition-all">
                          <Box className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#1D4ED8] transition-colors tracking-tight">
                          3D CAD / Digital Twin Model
                        </span>
                        <span className="text-[11px] text-[#64748B] mt-0.5">
                          Drag & drop 3D file or click to browse
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 mt-2 rounded-md bg-white border border-[#E2E8F0] text-[10px] font-mono text-[#64748B] shadow-2xs group-hover:border-blue-200 group-hover:text-blue-700 transition-colors">
                          Supports .glb, .gltf, .step, .stp (Up to 50MB)
                        </span>
                      </div>
                    )}
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 cursor-pointer mt-2.5 select-none group"
                    >
                      <input
                        type="checkbox"
                        checked={hasModel3d}
                        onChange={handleModel3dCheckboxChange}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-0 cursor-pointer"
                      />
                      <span className="text-[#334155] group-hover:text-[#0F172A] text-xs font-medium transition-colors">
                        Has 3D Engineering Twin Model
                      </span>
                    </label>
                  </div>

                  {/* b) P&ID Engineering Schematic Dropzone */}
                  <div className="flex flex-col">
                    {pidFile ? (
                      <div className="border border-blue-200 bg-[#F0F7FF] rounded-xl p-3.5 flex items-center justify-between min-h-[148px] shadow-xs transition-all">
                        <div className="flex items-center gap-3 overflow-hidden mr-2">
                          <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs font-mono font-bold text-xs">
                            <FileCode className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden space-y-0.5 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#1E293B] truncate max-w-[190px]" title={pidFile.name}>
                                {pidFile.name}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                Attached
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-[#64748B]">
                              {formatFileSize(pidFile.size)} • P&ID Schematic
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemovePid}
                          className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-600 hover:bg-rose-50 transition shrink-0 cursor-pointer border border-transparent hover:border-rose-200"
                          title="Remove file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          pidInputRef.current?.click();
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPid(true); }}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPid(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPid(false); }}
                        onDrop={handleDropPid}
                        className={`group border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[148px] ${
                          isDraggingPid
                            ? 'border-[#2563EB] bg-blue-50/70 scale-[0.99] shadow-inner'
                            : 'border-[#D1D5DB] bg-[#F8FAFC] hover:border-[#3B82F6] hover:bg-[#F0F7FF] shadow-xs'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-center text-[#2563EB] mb-2 group-hover:scale-105 group-hover:border-blue-200 group-hover:text-[#1D4ED8] transition-all">
                          <FileCode className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#1D4ED8] transition-colors tracking-tight">
                          P&ID Engineering Schematic
                        </span>
                        <span className="text-[11px] text-[#64748B] mt-0.5">
                          Drag & drop schematic or click to browse
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 mt-2 rounded-md bg-white border border-[#E2E8F0] text-[10px] font-mono text-[#64748B] shadow-2xs group-hover:border-blue-200 group-hover:text-blue-700 transition-colors">
                          Supports .pdf, .dwg, .svg, .png (Up to 25MB)
                        </span>
                      </div>
                    )}
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 cursor-pointer mt-2.5 select-none group"
                    >
                      <input
                        type="checkbox"
                        checked={hasPidDiagram}
                        onChange={handlePidCheckboxChange}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-0 cursor-pointer"
                      />
                      <span className="text-[#334155] group-hover:text-[#0F172A] text-xs font-medium transition-colors">
                        Has P&ID Engineering Schematic
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#151C24] hover:bg-black text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{submitting ? 'Registering...' : 'Register Machine'}</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBatchSubmit} className="space-y-4">
              <input
                type="file"
                ref={csvFileInputRef}
                style={{ display: 'none' }}
                accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBatchFile(file);
                }}
              />

              {!batchFile ? (
                /* Sleek Enterprise Dropzone */
                <div
                  onClick={() => csvFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingBatch(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingBatch(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingBatch(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingBatch(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleBatchFile(file);
                  }}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all flex flex-col items-center justify-center text-center group ${
                    isDraggingBatch
                      ? 'border-[#2563EB] bg-[#EFF6FF]'
                      : 'border-[#D1D5DB] bg-[#F8FAFC]/70 hover:border-[#2563EB] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563EB] group-hover:scale-105 group-hover:bg-blue-100/80 transition-all mb-3 shadow-xs">
                    <FileSpreadsheet className="w-6 h-6 text-[#2563EB]" />
                  </div>
                  <p className="text-sm font-semibold text-[#1E293B] group-hover:text-[#2563EB] transition-colors mb-1">
                    Upload Bulk Machinery File
                  </p>
                  <p className="text-xs text-[#64748B] mb-3 max-w-sm">
                    Drag & drop your Excel or CSV spreadsheet here, or click to browse
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-medium text-[#64748B]">
                    <span>Accepted formats: .csv, .xlsx, .xls (Up to 10MB)</span>
                  </div>
                </div>
              ) : (
                /* Uploaded File Summary Card */
                <div className="rounded-2xl border border-[#CBD5E1] bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#1E293B] truncate max-w-[240px] sm:max-w-md">
                            {batchFile.name}
                          </p>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]">
                            {formatFileSize(batchFile.size)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {isParsing ? (
                            <span className="text-xs text-[#64748B] flex items-center gap-1">
                              Parsing spreadsheet rows...
                            </span>
                          ) : parsedBatchMachines.length > 0 ? (
                            <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Ready to import {parsedBatchMachines.length} machine {parsedBatchMachines.length === 1 ? 'record' : 'records'}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              No valid machine records detected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => csvFileInputRef.current?.click()}
                        className="text-xs text-[#2563EB] hover:text-[#1D4ED8] hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition font-medium"
                      >
                        Replace File
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveBatchFile}
                        className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-600 hover:bg-red-50 transition"
                        title="Remove File"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Records Preview */}
                  {!isParsing && parsedBatchMachines.length > 0 && (
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-[#64748B] font-mono">
                        <span className="font-semibold uppercase tracking-wider text-[#475569]">
                          Parsed Preview ({parsedBatchMachines.length} total)
                        </span>
                        <span>Showing first {Math.min(parsedBatchMachines.length, 4)}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {parsedBatchMachines.slice(0, 4).map((m, idx) => (
                          <div
                            key={idx}
                            className="bg-white rounded-lg border border-[#E2E8F0] p-2.5 text-xs flex flex-col gap-0.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-[#1E293B]">{m.assetTag}</span>
                              <span className="text-[10px] text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                                {m.machineType}
                              </span>
                            </div>
                            <p className="text-[#475569] truncate font-medium text-[11px]">{m.name}</p>
                            {(m.manufacturer || m.modelNumber) && (
                              <p className="text-[10px] text-[#94A3B8] truncate">
                                {[m.manufacturer, m.modelNumber].filter(Boolean).join(' • ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {parsedBatchMachines.length > 4 && (
                        <p className="text-[11px] text-center text-[#64748B] pt-0.5">
                          + {parsedBatchMachines.length - 4} more machines ready to import
                        </p>
                      )}
                    </div>
                  )}

                </div>
              )}

              <div className="pt-3 flex justify-end gap-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || isParsing || parsedBatchMachines.length === 0}
                  className="px-5 py-2 bg-[#151C24] hover:bg-black text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-xs"
                >
                  <UploadCloud className="w-4 h-4 text-sky-400" />
                  <span>
                    {submitting
                      ? 'Importing...'
                      : isParsing
                      ? 'Parsing File...'
                      : `Import Batch Machines${parsedBatchMachines.length > 0 ? ` (${parsedBatchMachines.length})` : ''}`}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

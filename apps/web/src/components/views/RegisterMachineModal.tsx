import React, { useState } from 'react';
import { X, ShieldAlert, Cpu, Layers, CheckCircle2, AlertTriangle, UploadCloud } from 'lucide-react';
import type { DataClassification, MachineCriticality, DocumentationReadiness } from '@forgex/shared-types';

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
  const [hasModel3d, setHasModel3d] = useState(false);
  const [hasPidDiagram, setHasPidDiagram] = useState(false);

  // Batch form fields
  const [batchCsv, setBatchCsv] = useState(
    'PUMP-501-A, Crude Distillation Booster, Centrifugal Pump, Flowserve, Mark 3\nPUMP-502-B, Slurry Circulation Unit, Centrifugal Pump, Sulzer, Ahlstar\nCOMP-201-C, Gas Recovery Compressor, Reciprocating Compressor, Ariel, JGK-4'
  );

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

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/machines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
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
          hasModel3d,
          hasPidDiagram,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        onMachineCreated();
        onClose();
      } else {
        setError(json.error?.message || 'Failed to register machine.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error registering machine.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const lines = batchCsv.split('\n').filter((l) => l.trim().length > 0);
      const items = lines.map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          assetTag: parts[0]?.toUpperCase() || `MACH-${Math.floor(1000 + Math.random() * 9000)}`,
          name: parts[1] || 'Industrial Asset',
          machineType: parts[2] || 'Rotating Equipment',
          manufacturer: parts[3] || undefined,
          modelNumber: parts[4] || undefined,
          criticality: 'MEDIUM' as MachineCriticality,
          dataClassification: 'CONFIDENTIAL' as DataClassification,
          documentationReadiness: 'INCOMPLETE' as DocumentationReadiness,
        };
      });

      const res = await fetch('/api/v1/machines/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({ machines: items }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        onMachineCreated();
        onClose();
      } else {
        setError(json.error?.message || 'Batch registration failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error registering batch machines.');
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

              {/* Asset Twin flags */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasModel3d}
                    onChange={(e) => setHasModel3d(e.target.checked)}
                    className="rounded bg-white border-[#CBD5E1] text-[#2563EB] focus:ring-0"
                  />
                  <span className="text-[#1A202C]">Has 3D Engineering Twin Model</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasPidDiagram}
                    onChange={(e) => setHasPidDiagram(e.target.checked)}
                    className="rounded bg-white border-[#CBD5E1] text-[#2563EB] focus:ring-0"
                  />
                  <span className="text-[#1A202C]">Has P&ID Engineering Schematic</span>
                </label>
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
            <form onSubmit={handleBatchSubmit} className="space-y-4 text-xs font-mono">
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl leading-relaxed">
                Enter machines line-by-line (format: <strong>TAG, Name, MachineType, Manufacturer, Model</strong>).
                Placeholder and minimal records are supported. You can assign technician research tasks after bulk creation.
              </div>
              <textarea
                rows={8}
                value={batchCsv}
                onChange={(e) => setBatchCsv(e.target.value)}
                className="w-full p-3 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] outline-none font-mono text-xs leading-relaxed placeholder-[#94A3B8]"
              />
              <div className="pt-3 flex justify-end gap-3 border-t border-[#E2E8F0]">
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
                  <UploadCloud className="w-4 h-4 text-sky-400" />
                  <span>{submitting ? 'Importing...' : 'Import Batch Machines'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

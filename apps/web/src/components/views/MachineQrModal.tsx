import React, { useState } from 'react';
import type { Machine } from '@forgex/shared-types';
import {
  QrCode,
  Search,
  AlertCircle,
  Printer,
  Copy,
  MessageSquare,
  X,
  Cpu,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

interface MachineQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  machines: Machine[];
  initialMachine?: Machine | null;
  onSelectMachine?: (machine: Machine) => void;
  onAskCopilot?: (machine: Machine) => void;
  onOpenViewer?: (machine: Machine) => void;
}

export const MachineQrModal: React.FC<MachineQrModalProps> = ({
  isOpen,
  onClose,
  machines,
  initialMachine,
  onSelectMachine,
  onAskCopilot,
  onOpenViewer,
}) => {
  const { organization } = useAuth();
  const [tab, setTab] = useState<'scan' | 'generate'>('scan');
  const [inputCode, setInputCode] = useState('');
  const [scannedMachine, setScannedMachine] = useState<Machine | null>(initialMachine || null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedMachineForPlacard, setSelectedMachineForPlacard] = useState<Machine>(
    initialMachine || machines[0] || ({} as Machine)
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    const cleaned = inputCode.trim().toUpperCase();

    if (!cleaned) {
      setSearchError('Please scan or enter an asset tag / QR code.');
      return;
    }

    // Match by assetTag, id, or serialNumber
    const found = machines.find(
      (m) =>
        m.assetTag.toUpperCase() === cleaned ||
        m.id === inputCode.trim() ||
        (m.serialNumber && m.serialNumber.toUpperCase() === cleaned)
    );

    if (found) {
      setScannedMachine(found);
      onSelectMachine?.(found);
    } else {
      setSearchError(`Asset '${cleaned}' not found in registered plant ledger.`);
      setScannedMachine(null);
    }
  };

  const qrPayload = `https://forgex.internal/assets/${selectedMachineForPlacard?.assetTag || 'PUMP-204-B'}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-[#2563EB]" />
            <div>
              <div id="qr-modal-title" className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                Industrial Machine QR & Asset Identification
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                Factory-floor barcode resolution and authorized access controls
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
            aria-label="Close QR modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#E2E8F0] bg-[#F8FAFC] px-6">
          <button
            onClick={() => setTab('scan')}
            className={`py-3 text-xs font-mono font-bold tracking-wider border-b-2 transition mr-6 flex items-center gap-2 ${
              tab === 'scan'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Scan / Identify Machine
          </button>
          <button
            onClick={() => setTab('generate')}
            className={`py-3 text-xs font-mono font-bold tracking-wider border-b-2 transition flex items-center gap-2 ${
              tab === 'generate'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            Official Machine QR Placards
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {tab === 'scan' ? (
            <div className="space-y-6">
              {/* Scan / Lookup Input */}
              <form onSubmit={handleLookup} className="space-y-3">
                <label className="block text-xs font-mono text-[#1A202C] font-semibold">
                  Scan Barcode or Enter Machine Asset Tag:
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <QrCode className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value)}
                      placeholder="e.g. PUMP-204-B, COMP-702, TURB-101..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-xs text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#151C24] text-white hover:bg-black rounded-xl text-xs font-bold font-mono transition shadow-sm"
                  >
                    Identify
                  </button>
                </div>
                {searchError && (
                  <div className="text-xs text-rose-600 flex items-center gap-1.5 font-mono">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {searchError}
                  </div>
                )}
              </form>

              {/* Resolved Machine Information Card */}
              {scannedMachine ? (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in">
                  <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#2563EB]">{scannedMachine.assetTag}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {scannedMachine.criticality || 'MEDIUM'} CRITICALITY
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[#1A202C] mt-1">{scannedMachine.name}</h4>
                    </div>
                    <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[#64748B] text-[11px] font-mono block">Plant / Area:</span>
                      <span className="text-[#1A202C]">{scannedMachine.plantId}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[11px] font-mono block">Manufacturer / Model:</span>
                      <span className="text-[#1A202C]">
                        {scannedMachine.manufacturer || 'Unknown'} / {scannedMachine.modelNumber || 'Legacy'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[11px] font-mono block">Documentation Readiness:</span>
                      <span className="font-mono text-[#2563EB] font-semibold">{scannedMachine.documentationReadiness}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[11px] font-mono block">Assigned Specialist:</span>
                      <span className="text-[#1A202C] font-mono">
                        {(scannedMachine as any).primarySpecialistName || (scannedMachine as any).primarySpecialistUserId || 'Admin Triage Queue'}
                      </span>
                    </div>
                  </div>

                  {/* Actions for Scanned Machine */}
                  <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap gap-2">
                    {onAskCopilot && (
                      <button
                        onClick={() => {
                          onAskCopilot(scannedMachine);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ask Copilot About {scannedMachine.assetTag}
                      </button>
                    )}

                    {onOpenViewer && (
                      <button
                        onClick={() => {
                          onOpenViewer(scannedMachine);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        View 3D CAD & P&ID
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-dashed border-[#CBD5E1] rounded-2xl text-center space-y-2 bg-[#F8FAFC]">
                  <Cpu className="w-8 h-8 text-[#64748B] mx-auto" />
                  <p className="text-xs text-[#64748B]">
                    Scan a physical machine QR badge on the factory floor to inspect authorized maintenance history, operating limits, and technical drawings.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Generate Placard Tab */
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-mono text-[#1A202C] font-semibold mb-2">Select Machine for QR Label:</label>
                <select
                  value={selectedMachineForPlacard?.id || ''}
                  onChange={(e) => {
                    const matched = machines.find((m) => m.id === e.target.value);
                    if (matched) setSelectedMachineForPlacard(matched);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-xs text-[#1A202C] focus:outline-none focus:border-[#2563EB]"
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.assetTag} — {m.name} ({m.plantId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Physical Placard Preview Box */}
              <div className="p-6 bg-white rounded-2xl text-black space-y-4 max-w-sm mx-auto shadow-xl border-2 border-slate-300">
                <div className="flex justify-between items-center border-b-2 border-black pb-2">
                  <div className="font-mono text-xs font-black uppercase tracking-wider">
                    ForgeX AI • Industrial Asset
                  </div>
                  <div className="font-mono text-[10px] font-bold bg-black text-white px-1.5 py-0.5 rounded">
                    VERIFIED
                  </div>
                </div>

                {/* SVG QR Code Simulation */}
                <div className="flex justify-center p-2">
                  <svg width="160" height="160" viewBox="0 0 160 160" className="fill-black">
                    {/* Position detection squares */}
                    <rect x="10" y="10" width="40" height="40" fill="black" />
                    <rect x="16" y="16" width="28" height="28" fill="white" />
                    <rect x="22" y="22" width="16" height="16" fill="black" />

                    <rect x="110" y="10" width="40" height="40" fill="black" />
                    <rect x="116" y="16" width="28" height="28" fill="white" />
                    <rect x="122" y="22" width="16" height="16" fill="black" />

                    <rect x="10" y="110" width="40" height="40" fill="black" />
                    <rect x="16" y="116" width="28" height="28" fill="white" />
                    <rect x="22" y="122" width="16" height="16" fill="black" />

                    {/* QR Matrix Pattern */}
                    <rect x="60" y="20" width="10" height="10" />
                    <rect x="80" y="20" width="10" height="10" />
                    <rect x="60" y="40" width="20" height="10" />
                    <rect x="90" y="40" width="10" height="10" />
                    <rect x="20" y="60" width="10" height="20" />
                    <rect x="40" y="70" width="20" height="10" />
                    <rect x="70" y="60" width="20" height="20" />
                    <rect x="100" y="70" width="20" height="10" />
                    <rect x="130" y="60" width="10" height="20" />
                    <rect x="60" y="90" width="10" height="20" />
                    <rect x="80" y="100" width="20" height="10" />
                    <rect x="60" y="120" width="20" height="10" />
                    <rect x="90" y="130" width="20" height="10" />
                    <rect x="120" y="110" width="20" height="10" />
                    <rect x="110" y="130" width="10" height="20" />
                  </svg>
                </div>

                <div className="text-center space-y-1">
                  <div className="font-mono text-base font-black tracking-widest">
                    {selectedMachineForPlacard?.assetTag || 'PUMP-204-B'}
                  </div>
                  <div className="text-xs font-semibold">{selectedMachineForPlacard?.name || 'Heavy Centrifugal Pump'}</div>
                  <div className="text-[10px] text-slate-700 font-mono">
                    Plant: {selectedMachineForPlacard?.plantId || 'PLANT-TX-04'} • Org: {organization?.name || 'ForgeX'}
                  </div>
                </div>

                <div className="text-center text-[9px] font-mono text-slate-500 pt-2 border-t border-slate-300">
                  SCAN WITH ANY FORGEX CO-PILOT APP TO ACCESS AUDITED MANUALS & DIAGNOSTICS
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#CBD5E1] text-xs font-mono text-[#1A202C] hover:bg-[#F8FAFC] transition shadow-sm"
                >
                  <Copy className="w-3.5 h-3.5 text-[#64748B]" />
                  {copied ? 'Copied Verification Link!' : 'Copy Asset Link'}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#151C24] text-white text-xs font-bold font-mono hover:bg-black transition shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Label Placard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MachineQrModal;

import React from 'react';
import type { Machine } from '@forgex/shared-types';
import { Printer, AlertTriangle, X } from 'lucide-react';

interface MachinePosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  plantName?: string;
  plantCode?: string;
}

export const MachinePosterModal: React.FC<MachinePosterModalProps> = ({
  isOpen,
  onClose,
  machine,
  plantName = 'Texas Petrochemical Refinery Train 4',
  plantCode = 'PLANT-TX-04',
}) => {
  if (!isOpen || !machine) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative max-w-xl w-full bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
            Machine QR Identity Poster
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-6 p-6 bg-[#F5F6F7]">
      {/* Printable Poster Canvas */}
      <div
        id="machine-poster-print-area"
        className="w-[420px] bg-white text-slate-900 border-4 border-slate-900 rounded-2xl p-6 shadow-2xl flex flex-col items-center select-none"
      >
        {/* Brand Header */}
        <div className="w-full flex items-center justify-between border-b-2 border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-950 rounded-lg flex items-center justify-center text-[#A3E635] font-black text-sm">
              FX
            </div>
            <div className="text-left">
              <div className="text-base font-extrabold tracking-tight leading-none text-slate-900">
                ForgeX <span className="text-lime-600">AI</span>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                Machine Passport
              </div>
            </div>
          </div>
          <div className="text-right font-mono text-[10px] text-slate-600">
            <div>{plantCode}</div>
            <div className="font-bold text-slate-900">{machine.area}</div>
          </div>
        </div>

        {/* Machine Identity */}
        <div className="w-full my-4 text-center">
          <div className="inline-block bg-slate-900 text-white font-mono font-extrabold text-xl px-4 py-1 rounded-lg tracking-wider">
            {machine.assetTag}
          </div>
          <div className="text-sm font-bold text-slate-900 mt-2 leading-tight">
            {machine.name}
          </div>
          <div className="text-xs text-slate-600 font-medium mt-0.5">
            {machine.machineType} • {machine.manufacturer || 'OEM Standard'}
          </div>
        </div>

        {/* High-Contrast Machine QR Code Box */}
        <div className="relative p-3 bg-white border-2 border-slate-900 rounded-xl shadow-inner flex flex-col items-center my-2">
          {/* SVG Vector QR Code Graphic */}
          <svg className="w-44 h-44 text-slate-950" viewBox="0 0 100 100" fill="currentColor">
            {/* Corner Alignment Targets */}
            <rect x="5" y="5" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="6" />
            <rect x="12" y="12" width="11" height="11" />
            <rect x="70" y="5" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="6" />
            <rect x="77" y="12" width="11" height="11" />
            <rect x="5" y="70" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="6" />
            <rect x="12" y="77" width="11" height="11" />

            {/* Simulated Data Matrix Bits */}
            <rect x="36" y="8" width="6" height="6" />
            <rect x="46" y="8" width="6" height="6" />
            <rect x="56" y="16" width="6" height="6" />
            <rect x="36" y="24" width="6" height="6" />
            <rect x="46" y="24" width="6" height="6" />
            <rect x="8" y="38" width="6" height="6" />
            <rect x="18" y="46" width="6" height="6" />
            <rect x="28" y="38" width="6" height="6" />
            <rect x="38" y="38" width="6" height="6" />
            <rect x="48" y="46" width="6" height="6" />
            <rect x="58" y="38" width="6" height="6" />
            <rect x="68" y="46" width="6" height="6" />
            <rect x="78" y="38" width="6" height="6" />
            <rect x="88" y="46" width="6" height="6" />
            <rect x="38" y="58" width="6" height="6" />
            <rect x="48" y="68" width="6" height="6" />
            <rect x="58" y="58" width="6" height="6" />
            <rect x="68" y="68" width="6" height="6" />
            <rect x="38" y="78" width="6" height="6" />
            <rect x="48" y="88" width="6" height="6" />
            <rect x="78" y="78" width="6" height="6" />
            <rect x="88" y="88" width="6" height="6" />
          </svg>

          <div className="mt-1 font-mono text-[9px] text-slate-500 tracking-wider">
            SECURE MACHINE ROUTE • AUTH REQUIRED
          </div>
        </div>

        {/* Safety Warning Banner */}
        <div className="w-full bg-amber-50 border-2 border-amber-500 rounded-xl p-2.5 my-3 text-left flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-[11px] font-bold text-amber-900 leading-tight">
            SAFETY REMINDER: VERIFY LOTO ISOLATION & DEPRESSURIZATION PRIOR TO REMOVING SEALS OR CASING BOLTS.
          </div>
        </div>

        {/* Scanning Instructions */}
        <div className="w-full text-center text-[11px] text-slate-600 font-medium">
          Scan with authorized ForgeX AI mobile terminal to view approved SOP procedures, P&ID drawings, and active maintenance cases.
        </div>

        {/* Footer */}
        <div className="w-full pt-3 mt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>{plantName}</span>
          <span>REV {machine.revision || 1}</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#151C24] hover:bg-black text-white font-bold text-xs transition shadow-sm"
        >
          <Printer className="w-4 h-4 text-sky-400" />
          Print Machine Poster
        </button>
      </div>
        </div>
      </div>
    </div>
  );
};

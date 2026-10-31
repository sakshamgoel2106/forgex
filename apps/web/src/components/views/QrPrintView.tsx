import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  QrCode,
  ArrowLeft,
  Copy,
  Check,
} from 'lucide-react';
import { SEEDED_MACHINES_CATALOG, type ScannedMachine } from '../mobile/MachineScanView';
import { apiFetch } from '../../lib/api';

export interface QrPrintViewProps {
  onBack?: () => void;
}

export type QrPayloadFormat = 'TAG_ONLY' | 'JSON_PAYLOAD' | 'DEEP_LINK';

interface PrintableMachineItem extends ScannedMachine {
  qrDataUrl: string;
}

export const QrPrintView: React.FC<QrPrintViewProps> = ({ onBack }) => {
  const [machines, setMachines] = useState<ScannedMachine[]>(SEEDED_MACHINES_CATALOG);
  const [printableList, setPrintableList] = useState<PrintableMachineItem[]>([]);
  const [qrFormat, setQrFormat] = useState<QrPayloadFormat>('TAG_ONLY');
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  // Load registered machines from API if available
  useEffect(() => {
    let isMounted = true;
    apiFetch('/api/v1/machines')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const list = Array.isArray(data) ? data : data.data || [];
        if (list.length > 0) {
          // Merge API machines with catalog metadata
          const merged: ScannedMachine[] = list.map((item: any) => {
            const catalogMatch = SEEDED_MACHINES_CATALOG.find(
              (c) => c.assetTag.toUpperCase() === (item.assetTag || '').toUpperCase()
            );
            return {
              id: item.id || catalogMatch?.id || `mach-${item.assetTag}`,
              assetTag: item.assetTag || catalogMatch?.assetTag || 'ASSET-TAG',
              name: item.name || catalogMatch?.name || 'Industrial Machine',
              isoClass: catalogMatch?.isoClass || 'Industrial Plant Equipment (ISO 14224)',
              status: item.operationalState || catalogMatch?.status || 'OPTIMAL',
              area: item.area || catalogMatch?.area || 'Facility Floor',
              manufacturer: item.manufacturer || catalogMatch?.manufacturer || 'OEM',
              modelNumber: item.modelNumber || catalogMatch?.modelNumber || '',
              serialNumber: item.serialNumber || catalogMatch?.serialNumber || '',
              healthScore: catalogMatch?.healthScore ?? 92,
              vibrationRms: catalogMatch?.vibrationRms ?? '2.4 mm/s',
              bearingTemp: catalogMatch?.bearingTemp ?? '62.0 °C',
            };
          });

          // Ensure all seeded catalog items exist
          for (const catItem of SEEDED_MACHINES_CATALOG) {
            if (!merged.some((m) => m.assetTag.toUpperCase() === catItem.assetTag.toUpperCase())) {
              merged.push(catItem);
            }
          }
          setMachines(merged);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Generate QR codes for all machines when machines or format change
  useEffect(() => {
    let isMounted = true;
    setIsGenerating(true);

    const generateCodes = async () => {
      const items: PrintableMachineItem[] = [];

      for (const m of machines) {
        let payload = m.assetTag;

        if (qrFormat === 'JSON_PAYLOAD') {
          payload = JSON.stringify({
            tag: m.assetTag,
            machineId: m.id,
            isoClass: m.isoClass,
            area: m.area,
          });
        } else if (qrFormat === 'DEEP_LINK') {
          const origin = typeof window !== 'undefined' ? window.location.origin : 'https://forgex.internal';
          payload = `${origin}/?tag=${encodeURIComponent(m.assetTag)}`;
        }

        try {
          const dataUrl = await QRCode.toDataURL(payload, {
            width: 320,
            margin: 1,
            color: {
              dark: '#090d16',
              light: '#ffffff',
            },
            errorCorrectionLevel: 'H',
          });
          items.push({ ...m, qrDataUrl: dataUrl });
        } catch (err) {
          console.error(`Failed to generate QR for ${m.assetTag}:`, err);
        }
      }

      if (isMounted) {
        setPrintableList(items);
        setIsGenerating(false);
      }
    };

    generateCodes();

    return () => {
      isMounted = false;
    };
  }, [machines, qrFormat]);

  // Handle system print dialog
  const handlePrint = () => {
    window.print();
  };

  const handleCopyTag = (tag: string) => {
    navigator.clipboard?.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Group into pages of 6 items (2 columns x 3 rows) for clean A4 printing
  const pages = useMemo(() => {
    const pageSize = 6;
    const result: PrintableMachineItem[][] = [];
    for (let i = 0; i < printableList.length; i += pageSize) {
      result.push(printableList.slice(i, i + pageSize));
    }
    return result;
  }, [printableList]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans print:bg-white print:text-black print:min-h-0">
      {/* Print Stylesheet Overrides */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-sheet {
            page-break-after: always !important;
            break-after: page !important;
            margin-bottom: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .print-card {
            border: 1.5px dashed #64748b !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
        }
      `}</style>

      {/* Top Controls Toolbar (Hidden When Printing) */}
      <header className="no-print sticky top-0 z-30 bg-slate-950/95 border-b border-slate-800 backdrop-blur-md px-6 py-4 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-700 flex items-center justify-center transition"
                title="Return to ForgeX Application"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <a
                href="/"
                className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-700 flex items-center justify-center transition"
                title="Return to ForgeX Application"
              >
                <ArrowLeft className="w-5 h-5" />
              </a>
            )}

            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-amber-400" />
                <span>ForgeX Plant Placard Generator</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                  A4 Print Ready
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Seeded industrial machines formatted for physical demo placard printing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Format Selector */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono">
              <span className="text-slate-400">QR Format:</span>
              <select
                value={qrFormat}
                onChange={(e) => setQrFormat(e.target.value as QrPayloadFormat)}
                className="bg-transparent text-amber-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value="TAG_ONLY" className="bg-slate-900 text-white">
                  Plain Machine Tag (e.g. PUMP-204-B)
                </option>
                <option value="JSON_PAYLOAD" className="bg-slate-900 text-white">
                  JSON Metadata Payload
                </option>
                <option value="DEEP_LINK" className="bg-slate-900 text-white">
                  Web Deep Link URL
                </option>
              </select>
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={isGenerating}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider transition shadow-lg shadow-amber-900/30 flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print A4 Placards</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area: Sheets laid out for A4 */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8 space-y-10 print:p-0 print:m-0 print:space-y-0 print:max-w-none">
        {isGenerating ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-mono text-slate-400">Generating high-fidelity QR placards...</p>
          </div>
        ) : (
          pages.map((pageItems, pageIndex) => (
            <div
              key={pageIndex}
              className="print-sheet bg-white text-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-200 print:rounded-none print:shadow-none print:p-2"
            >
              {/* Header on Each Sheet */}
              <div className="border-b-2 border-slate-900 pb-3 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-950 text-white flex items-center justify-center font-bold text-sm">
                    FX
                  </div>
                  <div>
                    <div className="text-base font-black tracking-tight text-slate-950 uppercase">
                      ForgeX Industrial Equipment Placards
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono">
                      ISO 14224 Machine Registry Placards • Standard A4 Cut Sheets
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono text-xs text-slate-500">
                  <span>Page {pageIndex + 1} of {pages.length}</span>
                  <span className="block text-[10px] text-slate-400">Scan via ForgeX Mobile Scanner</span>
                </div>
              </div>

              {/* 2-Column x 3-Row Placards Grid (6 cards per A4 page) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:grid-cols-2 print:gap-4">
                {pageItems.map((machine) => (
                  <div
                    key={machine.id}
                    className="print-card relative rounded-2xl border-2 border-dashed border-slate-300 p-4 bg-slate-50/60 print:bg-white flex flex-col justify-between"
                  >
                    {/* Top Placard Banner */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                          <span>FORGEX ASSET</span>
                        </div>
                        <h2 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                          {machine.name}
                        </h2>
                        <div className="text-[10px] text-slate-600 font-mono mt-0.5 line-clamp-1">
                          {machine.isoClass}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border border-slate-300 bg-white text-slate-800">
                          {machine.status}
                        </span>
                      </div>
                    </div>

                    {/* Middle: Crisp QR Code & Machine Metadata */}
                    <div className="flex items-center gap-4 py-3">
                      {/* High-Resolution QR Canvas */}
                      <div className="p-1.5 bg-white rounded-xl border border-slate-300 shadow-sm shrink-0">
                        <img
                          src={machine.qrDataUrl}
                          alt={`QR Code for ${machine.assetTag}`}
                          className="w-28 h-28 object-contain print:w-24 print:h-24"
                        />
                      </div>

                      {/* Tag & Area Info */}
                      <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                        <div>
                          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                            Asset Tag
                          </div>
                          <div className="font-mono font-black text-xl text-slate-950 tracking-wider">
                            {machine.assetTag}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                            Location Area
                          </div>
                          <div className="font-medium text-slate-800 truncate">
                            {machine.area}
                          </div>
                        </div>

                        {machine.manufacturer && (
                          <div className="text-[11px] text-slate-600 truncate font-mono">
                            OEM: {machine.manufacturer} {machine.modelNumber}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Placard Footer */}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>Cut along dashed border</span>
                      <div className="no-print">
                        <button
                          type="button"
                          onClick={() => handleCopyTag(machine.assetTag)}
                          className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition flex items-center gap-1 font-mono text-[10px]"
                        >
                          {copiedTag === machine.assetTag ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Tag</span>
                            </>
                          )}
                        </button>
                      </div>
                      <span className="print:inline hidden">FORGEX REAR-CAM COMPLIANT</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sheet Bottom Footer */}
              <div className="mt-6 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>ForgeX Autonomous Industrial Platform</span>
                <span>ISO 14224 / OSHA 1910.147 Compliant Placards</span>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};

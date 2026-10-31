import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Camera,
  CameraOff,
  MessageSquare,
  ShieldAlert,
  Search,
  ClipboardList,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

export interface MobileScanViewProps {
  onSelectAsset?: (assetTag: string) => void;
  onLaunchLoto?: (assetTag: string) => void;
  onNavigateToTasks?: () => void;
}

interface MachineSummary {
  id: string;
  assetTag: string;
  name: string;
  status: 'OPERATIONAL' | 'CRITICAL' | 'WARNING' | 'MAINTENANCE';
  location?: string;
  manufacturer?: string;
  modelNumber?: string;
}

const DEFAULT_MACHINES: MachineSummary[] = [
  {
    id: 'mach-pump-301',
    assetTag: 'PUMP-301',
    name: 'High Pressure Boiler Feed Pump',
    status: 'WARNING',
    location: 'Boiler Room Bay 3',
    manufacturer: 'Grundfos',
    modelNumber: 'CR 15-7',
  },
  {
    id: 'mach-comp-101',
    assetTag: 'COMP-101',
    name: 'Main Rotary Screw Air Compressor',
    status: 'OPERATIONAL',
    location: 'Compressor House A',
    manufacturer: 'Atlas Copco',
    modelNumber: 'GA-75 VSD',
  },
  {
    id: 'mach-rec-102',
    assetTag: 'AIR-REC-102',
    name: 'Compressed Air Receiver Vessel',
    status: 'OPERATIONAL',
    location: 'Compressor House A',
    manufacturer: 'Manchester Tank',
    modelNumber: 'V-102-ASME',
  },
  {
    id: 'mach-gen-101',
    assetTag: 'GEN-DIESEL-101',
    name: 'Emergency Backup Diesel Generator',
    status: 'OPERATIONAL',
    location: 'Utility Yard North',
    manufacturer: 'Cummins Power',
    modelNumber: 'QSK60-G4',
  },
];

export const MobileScanView: React.FC<MobileScanViewProps> = ({
  onSelectAsset,
  onLaunchLoto,
  onNavigateToTasks,
}) => {
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [machines, setMachines] = useState<MachineSummary[]>(DEFAULT_MACHINES);
  const [selectedAsset, setSelectedAsset] = useState<MachineSummary | null>(DEFAULT_MACHINES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanMessage, setScanMessage] = useState<string>('Align equipment QR placard inside viewfinder');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch plant machines if available
  useEffect(() => {
    let isMounted = true;
    apiFetch('/api/v1/machines')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const list = Array.isArray(data) ? data : data.data || [];
        if (list.length > 0) {
          const mapped: MachineSummary[] = list.map((m: any) => ({
            id: m.id,
            assetTag: m.assetTag || m.tag || m.code || 'ASSET',
            name: m.name || m.assetTag || 'Industrial Machine',
            status: m.status || 'OPERATIONAL',
            location: m.location || 'Facility Floor',
            manufacturer: m.manufacturer || 'OEM',
            modelNumber: m.modelNumber || m.model || '',
          }));
          setMachines(mapped);
          if (mapped[0]) setSelectedAsset(mapped[0]);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setHasCameraPermission(false);
        setScanMessage('Camera API not supported in this browser. Use manual selection below.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      setHasCameraPermission(true);
      setScanMessage('Scanning equipment QR & nameplates...');
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setHasCameraPermission(false);
      setCameraActive(false);
      setScanMessage('Camera permission denied or camera in use. Use manual equipment select.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleSimulateScan = (machine: MachineSummary) => {
    setSelectedAsset(machine);
    setScanMessage(`Equipment Identified: ${machine.assetTag} (${machine.name})`);
  };

  const filteredMachines = machines.filter(
    (m) =>
      m.assetTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-y-auto p-4 space-y-4">
      {/* Viewport Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-400" />
            <span>Equipment Scanner</span>
          </h2>
          <p className="text-xs text-slate-400">
            Scan physical equipment QR codes or select an asset below
          </p>
        </div>

        <button
          onClick={cameraActive ? stopCamera : startCamera}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition shadow-md ${
            cameraActive
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
          }`}
        >
          {cameraActive ? (
            <>
              <CameraOff className="w-3.5 h-3.5" />
              <span>Stop Camera</span>
            </>
          ) : (
            <>
              <Camera className="w-3.5 h-3.5" />
              <span>Start Camera</span>
            </>
          )}
        </button>
      </div>

      {/* Camera Viewfinder & Laser Scanner */}
      <div className="relative w-full aspect-[4/3] max-h-72 bg-slate-900 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center">
        {cameraActive ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">Optical QR Viewfinder Standby</div>
              <div className="text-[11px] text-slate-400 max-w-xs mt-1">
                Tap &ldquo;Start Camera&rdquo; above to scan machine tags or select from active plant inventory
              </div>
            </div>
          </div>
        )}

        {/* Optical Aiming Reticle (Crosshair) */}
        <div className="absolute inset-8 pointer-events-none border-2 border-dashed border-amber-400/60 rounded-xl flex items-center justify-center">
          {cameraActive && (
            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-laser-scan shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
          )}
        </div>

        {/* Bottom status readout */}
        <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
          <span className="font-mono truncate">{scanMessage}</span>
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 ml-2 animate-ping" />
        </div>
      </div>

      {/* Active Equipment Card */}
      {selectedAsset && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono text-xs font-bold border border-amber-400/40">
                  {selectedAsset.assetTag}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    selectedAsset.status === 'OPERATIONAL'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {selectedAsset.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white mt-1.5">{selectedAsset.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedAsset.location} • {selectedAsset.manufacturer} {selectedAsset.modelNumber}
              </p>
            </div>
          </div>

          {/* Quick Actions for this Asset */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => onLaunchLoto?.(selectedAsset.assetTag)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md active:scale-95"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Launch LOTO</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectAsset?.(selectedAsset.assetTag)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-md active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Ask Copilot</span>
            </button>

            {onNavigateToTasks && (
              <button
                type="button"
                onClick={onNavigateToTasks}
                className="col-span-2 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs transition border border-slate-700 active:scale-95"
              >
                <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
                <span>View Maintenance Queue &amp; Tasks</span>
              </button>
            )}
          </div>
          {hasCameraPermission === false && (
            <div className="text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg text-center font-mono">
              Camera permission required for live scanning. Manual asset selector active.
            </div>
          )}
        </div>
      )}

      {/* Manual Equipment Quick Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
            Plant Equipment Tags
          </span>
          <span className="text-[11px] text-slate-500">Tap to load</span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search machine tag or location..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="grid grid-cols-1 gap-2">
          {filteredMachines.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSimulateScan(m)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition ${
                selectedAsset?.id === m.id
                  ? 'bg-amber-400/10 border-amber-400/40 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
              }`}
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400 shrink-0 font-mono text-xs font-bold">
                  {m.assetTag.slice(0, 3)}
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-white truncate">{m.assetTag}</div>
                  <div className="text-[11px] text-slate-400 truncate">{m.name}</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-850 px-2 py-0.5 rounded border border-slate-700">
                SELECT
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

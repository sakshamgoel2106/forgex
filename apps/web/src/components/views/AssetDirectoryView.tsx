import React, { useState } from 'react';
import {
  Boxes,
  Search,
  Activity,
  Thermometer,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

interface PlantAsset {
  id: string;
  tag: string;
  name: string;
  area: string;
  manufacturer: string;
  model: string;
  state: 'OPTIMAL' | 'ADVISORY' | 'TRIPPED';
  vibrationMmS: number;
  tempCelsius: number;
  linkedManualsCount: number;
  lastOverhaul: string;
}

const ASSET_DATA: PlantAsset[] = [
  {
    id: 'ast-01',
    tag: 'PUMP-204-B',
    name: 'Centrifugal Slurry Bottoms Pump',
    area: 'Primary Distillation Unit',
    manufacturer: 'Flowserve Corp',
    model: 'Mark 3 ANSI 3x2-10',
    state: 'ADVISORY',
    vibrationMmS: 4.8,
    tempCelsius: 78.4,
    linkedManualsCount: 4,
    lastOverhaul: '2025-11-14',
  },
  {
    id: 'ast-02',
    tag: 'COMP-101-A',
    name: 'Main Wet Gas Centrifugal Compressor',
    area: 'Gas Recovery Plant',
    manufacturer: 'Elliott Group',
    model: '29M Multi-Stage Barrel',
    state: 'OPTIMAL',
    vibrationMmS: 1.2,
    tempCelsius: 64.1,
    linkedManualsCount: 9,
    lastOverhaul: '2026-03-01',
  },
  {
    id: 'ast-03',
    tag: 'HEX-302-C',
    name: 'High Pressure Reboiler Heat Exchanger',
    area: 'Fractionation Train B',
    manufacturer: 'Alfa Laval',
    model: 'Compabloc CP75',
    state: 'OPTIMAL',
    vibrationMmS: 0.2,
    tempCelsius: 142.0,
    linkedManualsCount: 3,
    lastOverhaul: '2026-05-18',
  },
  {
    id: 'ast-04',
    tag: 'VALV-551-ESD',
    name: 'Emergency Shutdown Isolation Valve (SIL-3)',
    area: 'Fuel Gas Header',
    manufacturer: 'Fisher Emerson',
    model: 'ET Cavitrol III Trim',
    state: 'OPTIMAL',
    vibrationMmS: 0.1,
    tempCelsius: 32.5,
    linkedManualsCount: 2,
    lastOverhaul: '2026-01-10',
  },
];

export const AssetDirectoryView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<PlantAsset>(ASSET_DATA[0]);

  const filtered = ASSET_DATA.filter(
    (a) =>
      a.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-graphite-950">
      {/* Search Header */}
      <div className="p-3 border-b border-graphite-800 bg-graphite-900/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-amber-500" />
          <span className="font-bold text-graphite-100 uppercase">
            Plant Equipment & Asset Directory
          </span>
        </div>

        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 text-graphite-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Filter by Tag, Area, or Machine..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-graphite-950 border border-graphite-800 rounded text-xs font-mono text-graphite-200 placeholder-graphite-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table of Assets */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-graphite-800 bg-graphite-900/40 sticky top-0 z-10 text-graphite-400 font-mono text-[11px]">
                <th className="py-2.5 px-4 font-semibold">ASSET TAG</th>
                <th className="py-2.5 px-4 font-semibold">EQUIPMENT DESCRIPTION</th>
                <th className="py-2.5 px-4 font-semibold">PLANT AREA</th>
                <th className="py-2.5 px-4 font-semibold">MANUFACTURER / MODEL</th>
                <th className="py-2.5 px-4 font-semibold">VIBRATION</th>
                <th className="py-2.5 px-4 font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-850">
              {filtered.map((asset) => {
                const isSelected = selectedAsset.id === asset.id;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-graphite-800/80 text-graphite-100'
                        : 'hover:bg-graphite-900/60 text-graphite-300'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                      {asset.tag}
                    </td>
                    <td className="py-3 px-4 font-medium text-graphite-200">{asset.name}</td>
                    <td className="py-3 px-4 font-mono text-graphite-400">{asset.area}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-graphite-400">
                      {asset.manufacturer} {asset.model}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span
                        className={
                          asset.vibrationMmS > 3.5 ? 'text-amber-400 font-bold' : 'text-emerald-400'
                        }
                      >
                        {asset.vibrationMmS} mm/s
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        label={asset.state}
                        tone={asset.state === 'OPTIMAL' ? 'healthy' : 'warning'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Asset Telemetry Card */}
        <div className="w-96 border-l border-graphite-800 bg-graphite-900/70 p-4 space-y-4 overflow-y-auto">
          <div className="pb-3 border-b border-graphite-800">
            <span className="text-[10px] font-mono text-amber-500 uppercase">
              Telemetry Inspector
            </span>
            <h3 className="text-sm font-bold font-mono text-cyan-400">{selectedAsset.tag}</h3>
            <p className="text-xs text-graphite-300 mt-0.5">{selectedAsset.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800 space-y-1">
              <div className="text-[10px] text-graphite-500 flex items-center gap-1">
                <Activity className="w-3 h-3 text-cyan-400" />
                VIBRATION RMS
              </div>
              <div
                className={`text-base font-bold ${
                  selectedAsset.vibrationMmS > 3.5 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {selectedAsset.vibrationMmS} <span className="text-xs font-normal">mm/s</span>
              </div>
            </div>

            <div className="p-2.5 rounded bg-graphite-950 border border-graphite-800 space-y-1">
              <div className="text-[10px] text-graphite-500 flex items-center gap-1">
                <Thermometer className="w-3 h-3 text-rose-400" />
                BEARING TEMP
              </div>
              <div className="text-base font-bold text-graphite-100">
                {selectedAsset.tempCelsius} <span className="text-xs font-normal">°C</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-graphite-950 border border-graphite-800 space-y-2 text-xs font-mono">
            <div className="text-graphite-400 text-[10px] uppercase font-semibold">
              Associated Technical Documentation:
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-graphite-300 text-[11px] p-1.5 rounded bg-graphite-900">
                <span className="text-amber-400">SOP-MTR-042</span>
                <span className="text-graphite-500">Mechanical Seal Overhaul</span>
              </div>
              <div className="flex items-center justify-between text-graphite-300 text-[11px] p-1.5 rounded bg-graphite-900">
                <span className="text-cyan-400">OEM-MAN-883</span>
                <span className="text-graphite-500">Flowserve Mark 3 Ops Manual</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

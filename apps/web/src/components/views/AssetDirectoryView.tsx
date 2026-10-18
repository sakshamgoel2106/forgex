import React, { useState } from 'react';
import {
  Search,
  Activity,
  Thermometer,
  FileText,
  Filter,
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

interface AssetDirectoryViewProps {
  onNavigateToCopilot?: (assetTag: string) => void;
  onNavigateToManuals?: (assetTag: string) => void;
}

export const AssetDirectoryView: React.FC<AssetDirectoryViewProps> = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<PlantAsset>(ASSET_DATA[0]);
  const [filterState, setFilterState] = useState<string>('ALL');

  const filtered = ASSET_DATA.filter((a) => {
    const matchesSearch =
      a.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.area.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterState === 'ALL' || a.state === filterState;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#06090E]">
      {/* Search & Filter Toolbar */}
      <div className="p-3.5 border-b border-[#182333] bg-[#070B10] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by Tag, Machine Name, Area..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#0D141F] border border-[#182333] rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#A3E635] transition shadow-inner"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#0D141F] border border-[#182333] rounded-lg px-2.5 py-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="bg-transparent text-xs font-mono text-white outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0D141F]">All States</option>
              <option value="OPTIMAL" className="bg-[#0D141F]">Optimal</option>
              <option value="ADVISORY" className="bg-[#0D141F]">Advisory</option>
              <option value="TRIPPED" className="bg-[#0D141F]">Tripped</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>Showing <strong className="text-white font-mono tabular-nums">{filtered.length}</strong> of {ASSET_DATA.length} Assets</span>
        </div>
      </div>

      {/* Main Split Layout: Asset Table + Inspector Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table of Assets */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-[#182333] bg-[#0D141F] overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#182333] bg-[#0A0F17] text-slate-400 font-mono text-[11px]">
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">ASSET TAG</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">EQUIPMENT DESCRIPTION</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">PLANT AREA</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">MANUFACTURER / MODEL</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">VIBRATION RMS</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">TEMP</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#131E2C] font-mono">
                {filtered.map((asset) => {
                  const isSelected = selectedAsset.id === asset.id;
                  return (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-[#10241A] border-l-2 border-l-[#A3E635] text-white'
                          : 'hover:bg-[#111B28]/70 text-slate-300'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#A3E635]">
                        {asset.tag}
                      </td>
                      <td className="py-3 px-4 font-medium text-white font-sans">
                        {asset.name}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {asset.area}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-400">
                        {asset.manufacturer} {asset.model}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <span
                          className={
                            asset.vibrationMmS > 3.5
                              ? 'text-amber-400 font-bold'
                              : 'text-[#A3E635]'
                          }
                        >
                          {asset.vibrationMmS.toFixed(1)} mm/s
                        </span>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-white">
                        {asset.tempCelsius.toFixed(1)} °C
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
        </div>

        {/* Right Asset Telemetry Inspector Panel */}
        <div className="w-80 md:w-96 border-l border-[#182333] bg-[#070B10] p-5 space-y-4 overflow-y-auto shrink-0">
          <div className="pb-3 border-b border-[#182333]">
            <span className="text-[10px] font-mono text-[#A3E635] uppercase tracking-wider font-semibold">
              Live Telemetry Inspector
            </span>
            <h3 className="text-base font-bold font-mono text-white mt-0.5">
              {selectedAsset.tag}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{selectedAsset.name}</p>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-[#A3E635]" />
                VIBRATION RMS
              </div>
              <div
                className={`text-xl font-bold tabular-nums ${
                  selectedAsset.vibrationMmS > 3.5 ? 'text-amber-400' : 'text-[#A3E635]'
                }`}
              >
                {selectedAsset.vibrationMmS.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-400">mm/s</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0D141F] border border-[#182333] space-y-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <div className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase tracking-wider">
                <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                BEARING TEMP
              </div>
              <div className="text-xl font-bold tabular-nums text-white">
                {selectedAsset.tempCelsius.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-400">°C</span>
              </div>
            </div>
          </div>

          {/* Machine Metadata Details */}
          <div className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] space-y-2 text-xs font-mono shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              Equipment Specification
            </div>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Manufacturer:</span>
                <span className="text-white font-medium">{selectedAsset.manufacturer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Model:</span>
                <span className="text-white font-medium">{selectedAsset.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Plant Area:</span>
                <span className="text-white font-medium">{selectedAsset.area}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Last Overhaul:</span>
                <span className="text-white font-medium">{selectedAsset.lastOverhaul}</span>
              </div>
            </div>
          </div>

          {/* Associated Manuals & SOPs */}
          <div className="p-4 rounded-xl bg-[#0D141F] border border-[#182333] space-y-3 text-xs font-mono shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between">
              <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                Indexed Procedures ({selectedAsset.linkedManualsCount})
              </div>
              <FileText className="w-3.5 h-3.5 text-[#A3E635]" />
            </div>
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-[#0A0F17] border border-[#182333] text-[11px] space-y-1">
                <div className="flex justify-between text-[#A3E635] font-semibold">
                  <span>SOP-MTR-042</span>
                  <span className="text-[#A3E635] text-[10px] bg-[#10241A] px-1.5 py-0.5 rounded border border-[#1E4D2B]">VERIFIED</span>
                </div>
                <div className="text-slate-200 text-[11px]">Mechanical Seal Overhaul & Star Torque</div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0A0F17] border border-[#182333] text-[11px] space-y-1">
                <div className="flex justify-between text-[#A3E635] font-semibold">
                  <span>OEM-MAN-883</span>
                  <span className="text-slate-400 text-[10px] bg-[#131E2C] px-1.5 py-0.5 rounded border border-[#203044]">OEM REV C</span>
                </div>
                <div className="text-slate-200 text-[11px]">Flowserve Mark 3 ANSI Centrifugal Manual</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

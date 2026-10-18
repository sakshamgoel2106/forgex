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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-industrial-bg">
      {/* Search & Filter Toolbar */}
      <div className="p-3.5 border-b border-industrial-border bg-industrial-sidebar flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-industrial-secondary absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by Tag, Machine Name, Area..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-industrial-bg border border-industrial-border rounded text-xs font-mono text-industrial-text placeholder-industrial-secondary focus:outline-none focus:border-industrial-accent transition"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-industrial-bg border border-industrial-border rounded px-2.5 py-1">
            <Filter className="w-3 h-3 text-industrial-secondary" />
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="bg-transparent text-xs font-mono text-industrial-text outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-industrial-surface">All States</option>
              <option value="OPTIMAL" className="bg-industrial-surface">Optimal</option>
              <option value="ADVISORY" className="bg-industrial-surface">Advisory</option>
              <option value="TRIPPED" className="bg-industrial-surface">Tripped</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-industrial-secondary text-[11px]">
          <span>Showing <strong className="text-industrial-text font-mono tabular-nums">{filtered.length}</strong> of {ASSET_DATA.length} Assets</span>
        </div>
      </div>

      {/* Main Split Layout: Asset Table + Inspector Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table of Assets */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-industrial-border bg-industrial-sidebar/60 sticky top-0 z-10 text-industrial-secondary font-mono text-[11px]">
                <th className="py-2.5 px-4 font-semibold">ASSET TAG</th>
                <th className="py-2.5 px-4 font-semibold">EQUIPMENT DESCRIPTION</th>
                <th className="py-2.5 px-4 font-semibold">PLANT AREA</th>
                <th className="py-2.5 px-4 font-semibold">MANUFACTURER / MODEL</th>
                <th className="py-2.5 px-4 font-semibold">VIBRATION RMS</th>
                <th className="py-2.5 px-4 font-semibold">TEMP</th>
                <th className="py-2.5 px-4 font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border/60">
              {filtered.map((asset) => {
                const isSelected = selectedAsset.id === asset.id;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-industrial-surface text-industrial-text font-medium'
                        : 'hover:bg-industrial-surface/50 text-industrial-secondary'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-industrial-accent">
                      {asset.tag}
                    </td>
                    <td className="py-3 px-4 font-medium text-industrial-text">
                      {asset.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-industrial-secondary">
                      {asset.area}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-industrial-secondary">
                      {asset.manufacturer} {asset.model}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span
                        className={
                          asset.vibrationMmS > 3.5
                            ? 'text-amber-400 font-bold'
                            : 'text-emerald-400'
                        }
                      >
                        {asset.vibrationMmS.toFixed(1)} mm/s
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-industrial-text">
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

        {/* Right Asset Telemetry Inspector Panel */}
        <div className="w-80 md:w-96 border-l border-industrial-border bg-industrial-sidebar p-4 space-y-4 overflow-y-auto shrink-0">
          <div className="pb-3 border-b border-industrial-border">
            <span className="text-[10px] font-mono text-industrial-accent uppercase tracking-wider font-semibold">
              Live Telemetry Inspector
            </span>
            <h3 className="text-sm font-bold font-mono text-industrial-text mt-0.5">
              {selectedAsset.tag}
            </h3>
            <p className="text-xs text-industrial-secondary mt-0.5">{selectedAsset.name}</p>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-3 rounded bg-industrial-surface border border-industrial-border space-y-1">
              <div className="text-[10px] text-industrial-secondary flex items-center gap-1 font-semibold">
                <Activity className="w-3.5 h-3.5 text-industrial-accent" />
                VIBRATION RMS
              </div>
              <div
                className={`text-lg font-bold tabular-nums ${
                  selectedAsset.vibrationMmS > 3.5 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {selectedAsset.vibrationMmS.toFixed(1)}{' '}
                <span className="text-xs font-normal text-industrial-secondary">mm/s</span>
              </div>
            </div>

            <div className="p-3 rounded bg-industrial-surface border border-industrial-border space-y-1">
              <div className="text-[10px] text-industrial-secondary flex items-center gap-1 font-semibold">
                <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                BEARING TEMP
              </div>
              <div className="text-lg font-bold tabular-nums text-industrial-text">
                {selectedAsset.tempCelsius.toFixed(1)}{' '}
                <span className="text-xs font-normal text-industrial-secondary">°C</span>
              </div>
            </div>
          </div>

          {/* Machine Metadata Details */}
          <div className="p-3 rounded bg-industrial-surface border border-industrial-border space-y-2 text-xs font-mono">
            <div className="text-industrial-secondary text-[10px] uppercase font-bold tracking-wider">
              Equipment Specification
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-industrial-secondary">Manufacturer:</span>
                <span className="text-industrial-text font-medium">{selectedAsset.manufacturer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-secondary">Model:</span>
                <span className="text-industrial-text font-medium">{selectedAsset.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-secondary">Plant Area:</span>
                <span className="text-industrial-text font-medium">{selectedAsset.area}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-industrial-secondary">Last Overhaul:</span>
                <span className="text-industrial-text font-medium">{selectedAsset.lastOverhaul}</span>
              </div>
            </div>
          </div>

          {/* Associated Manuals & SOPs */}
          <div className="p-3 rounded bg-industrial-surface border border-industrial-border space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <div className="text-industrial-secondary text-[10px] uppercase font-bold tracking-wider">
                Indexed Procedures ({selectedAsset.linkedManualsCount})
              </div>
              <FileText className="w-3.5 h-3.5 text-industrial-accent" />
            </div>
            <div className="space-y-1.5">
              <div className="p-2 rounded bg-industrial-bg border border-industrial-border text-[11px] space-y-0.5">
                <div className="flex justify-between text-industrial-accent font-semibold">
                  <span>SOP-MTR-042</span>
                  <span className="text-emerald-400 text-[10px]">VERIFIED</span>
                </div>
                <div className="text-industrial-text text-[11px]">Mechanical Seal Overhaul & Star Torque</div>
              </div>

              <div className="p-2 rounded bg-industrial-bg border border-industrial-border text-[11px] space-y-0.5">
                <div className="flex justify-between text-industrial-accent font-semibold">
                  <span>OEM-MAN-883</span>
                  <span className="text-industrial-secondary text-[10px]">OEM REV C</span>
                </div>
                <div className="text-industrial-text text-[11px]">Flowserve Mark 3 ANSI Centrifugal Manual</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

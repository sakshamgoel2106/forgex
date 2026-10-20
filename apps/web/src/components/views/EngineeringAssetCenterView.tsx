import React, { useState, useEffect } from 'react';
import {
  Layers,
  Box,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Plus,
  Search,
  Eye,
  Check,
  X,
  ExternalLink,
  Shield,
  FileCode,
  Settings2,
  RefreshCw,
  Building2,
  Globe,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import type {
  EngineeringModel3D,
  EngineeringDrawing,
  ManufacturerResource,
  IndustryProfile,
  EngineeringAssetCenterSummary,
  Machine,
  ComponentMapping,
  CADFileFormat,
  DrawingType,
  ManufacturerResourceType,
} from '@forgex/shared-types';
import { RealThreeDViewerModal } from './RealThreeDViewerModal';
import { PidEngineeringViewerModal } from './PidEngineeringViewerModal';

export const EngineeringAssetCenterView: React.FC = () => {
  const { token, organization, isOwnerOrAdmin, user } = useAuth();

  const [activeTab, setActiveTab] = useState<'models' | 'resources' | 'drawings' | 'configuration'>('models');
  const [summary, setSummary] = useState<EngineeringAssetCenterSummary | null>(null);
  const [profiles, setProfiles] = useState<IndustryProfile[]>([]);
  const [activeProfileCode, setActiveProfileCode] = useState<string>('OIL_GAS_PETROCHEM');
  const [models, setModels] = useState<EngineeringModel3D[]>([]);
  const [resources, setResources] = useState<ManufacturerResource[]>([]);
  const [drawings, setDrawings] = useState<EngineeringDrawing[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterFormat, setFilterFormat] = useState<string>('ALL');

  // Modals state
  const [isUploadModelOpen, setIsUploadModelOpen] = useState<boolean>(false);
  const [isAddResourceOpen, setIsAddResourceOpen] = useState<boolean>(false);
  const [isAddDrawingOpen, setIsAddDrawingOpen] = useState<boolean>(false);
  const [isAddProfileOpen, setIsAddProfileOpen] = useState<boolean>(false);

  // 3D / P&ID Viewer modal state
  const [viewerMachine, setViewerMachine] = useState<Machine | null>(null);
  const [viewerMappings, setViewerMappings] = useState<ComponentMapping[]>([]);
  const [is3dViewerOpen, setIs3dViewerOpen] = useState<boolean>(false);
  const [isPidViewerOpen, setIsPidViewerOpen] = useState<boolean>(false);
  const [activePidTag, setActivePidTag] = useState<string | null>(null);

  // Form states
  const [modelForm, setModelForm] = useState({
    title: '',
    machineId: '',
    fileFormat: 'GLB' as CADFileFormat,
    fileSizeBytes: 4194304,
    fileHashSha256: 'hash_' + Math.random().toString(36).substring(2, 10),
    storageKey: 'models/cad_asset.glb',
    modelRevision: '1.0',
    dataClassification: 'INTERNAL',
    licenseUsageRights: 'OEM Site License',
  });

  const [drawingForm, setDrawingForm] = useState({
    drawingTitle: '',
    uniqueDrawingNumber: '',
    machineId: '',
    drawingType: 'PID' as DrawingType,
    discipline: 'Mechanical',
    fileFormat: 'PDF',
    fileSizeBytes: 2097152,
    storageKey: 'drawings/dwg_asset.pdf',
    revision: 'Rev A',
    equipmentTags: 'P-204-IMP, P-204-SEAL',
  });

  const [resourceForm, setResourceForm] = useState({
    title: '',
    manufacturer: '',
    modelNumber: '',
    resourceType: 'OFFICIAL_MANUAL' as ManufacturerResourceType,
    sourceType: 'OFFICIAL_URL' as 'FILE_UPLOAD' | 'OFFICIAL_URL',
    sourceUrl: 'https://',
    storageKey: 'resources/manual.pdf',
    versionRevision: '1.0',
  });

  const [profileForm, setProfileForm] = useState({
    code: '',
    name: '',
    description: '',
    assetCategories: 'Rotary Tools, Automation Cells, Skids',
    tagLabel: 'Asset Tag',
    assetLabel: 'Equipment',
    plantLabel: 'Facility',
    lineLabel: 'Line',
    drawingTypes: 'P&ID, Electrical Schematic, Layout',
  });

  useEffect(() => {
    loadAllData();
  }, [token, organization?.id]);

  const loadAllData = async () => {
    if (!token || !organization?.id) return;
    setIsLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'x-organization-id': organization.id,
      };

      const [sumRes, profRes, modRes, resRes, dwgRes, machRes] = await Promise.all([
        fetch('/api/v1/engineering/summary', { headers }),
        fetch('/api/v1/engineering/industry-profiles', { headers }),
        fetch('/api/v1/engineering/models', { headers }),
        fetch('/api/v1/engineering/manufacturer-resources', { headers }),
        fetch('/api/v1/engineering/drawings', { headers }),
        fetch('/api/v1/machines', { headers }),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData.data);
      }
      if (profRes.ok) {
        const profData = await profRes.json();
        setProfiles(profData.data || []);
      }
      if (modRes.ok) {
        const modData = await modRes.json();
        setModels(modData.data || []);
      }
      if (resRes.ok) {
        const rData = await resRes.json();
        setResources(rData.data || []);
      }
      if (dwgRes.ok) {
        const dData = await dwgRes.json();
        setDrawings(dData.data || []);
      }
      if (machRes.ok) {
        const mData = await machRes.json();
        setMachines(mData.data || []);
      }
    } catch (err) {
      console.error('Failed to load engineering data', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewModel = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/v1/engineering/models/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify({ status, reviewNotes: `Reviewed by ${user?.fullName}` }),
      });
      if (res.ok) {
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReviewDrawing = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/v1/engineering/drawings/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify({ status, reviewNotes: `Reviewed by ${user?.fullName}` }),
      });
      if (res.ok) {
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerifyResource = async (id: string, verificationStatus: 'VERIFIED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/v1/engineering/manufacturer-resources/${id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify({ verificationStatus }),
      });
      if (res.ok) {
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitModel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/engineering/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify({
          ...modelForm,
          industryProfileCode: activeProfileCode,
        }),
      });
      if (res.ok) {
        setIsUploadModelOpen(false);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tagsArray = drawingForm.equipmentTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch('/api/v1/engineering/drawings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify({
          ...drawingForm,
          equipmentTags: tagsArray,
        }),
      });
      if (res.ok) {
        setIsAddDrawingOpen(false);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitResource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/engineering/manufacturer-resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify(resourceForm),
      });
      if (res.ok) {
        setIsAddResourceOpen(false);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const categories = profileForm.assetCategories.split(',').map((s) => s.trim()).filter(Boolean);
      const dwgTypes = profileForm.drawingTypes.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/v1/engineering/industry-profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: JSON.stringify({
          code: profileForm.code.toUpperCase().replace(/\s+/g, '_'),
          name: profileForm.name,
          description: profileForm.description,
          assetCategories: categories,
          drawingTypes: dwgTypes,
          terminology: {
            tagLabel: profileForm.tagLabel,
            assetLabel: profileForm.assetLabel,
            plantLabel: profileForm.plantLabel,
            lineLabel: profileForm.lineLabel,
          },
        }),
      });
      if (res.ok) {
        setIsAddProfileOpen(false);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const open3dViewerForMachine = async (machId?: string) => {
    const target = machines.find((m) => m.id === machId) || machines[0];
    if (target) {
      setViewerMachine(target);
      // Fetch mappings if available
      try {
        const mRes = await fetch(`/api/v1/machines/${target.id}/mappings`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-organization-id': organization!.id,
          },
        });
        if (mRes.ok) {
          const mData = await mRes.json();
          setViewerMappings(mData.data || []);
        }
      } catch {
        setViewerMappings([]);
      }
      setIs3dViewerOpen(true);
    }
  };

  const openPidViewerForMachine = async (machId?: string, tag?: string) => {
    const target = machines.find((m) => m.id === machId) || machines[0];
    if (target) {
      setViewerMachine(target);
      setActivePidTag(tag || 'P-204-SEAL');
      try {
        const mRes = await fetch(`/api/v1/machines/${target.id}/mappings`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-organization-id': organization!.id,
          },
        });
        if (mRes.ok) {
          const mData = await mRes.json();
          setViewerMappings(mData.data || []);
        }
      } catch {
        setViewerMappings([]);
      }
      setIsPidViewerOpen(true);
    }
  };

  const activeProfile = profiles.find((p) => p.code === activeProfileCode) || profiles[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[#2563EB]">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1A202C] tracking-wide flex items-center gap-2">
                Engineering Asset Center
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-50 text-[#2563EB] border border-blue-200">
                  Admin Master Control
                </span>
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Official machine CAD models, original engineering drawings, OEM manufacturer resources, and industry configurations
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls & Industry Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#CBD5E1] shadow-xs">
            <Globe className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span className="text-xs text-[#64748B] font-medium">Industry:</span>
            <select
              value={activeProfileCode}
              onChange={(e) => setActiveProfileCode(e.target.value)}
              className="bg-transparent text-xs text-[#1A202C] font-semibold outline-none cursor-pointer"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.code} className="bg-white text-[#1A202C]">
                  {p.name} {p.isCustom ? '(Custom)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadAllData()}
            className="p-2 text-[#1A202C] hover:text-black rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 transition disabled:opacity-50 shadow-xs"
            title="Refresh assets"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#2563EB]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Live Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">3D CAD Models</span>
            <div className="text-2xl font-bold text-[#1A202C] mt-1">
              {summary?.totalModels3d ?? models.length}
            </div>
            <div className="text-xs text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {summary?.approvedModels3d ?? 0} Verified & Approved
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2563EB]">
            <Box className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Engineering Drawings</span>
            <div className="text-2xl font-bold text-[#1A202C] mt-1">
              {summary?.totalDrawings ?? drawings.length}
            </div>
            <div className="text-xs text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {summary?.approvedDrawings ?? 0} P&ID / Schematics
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
            <FileCode className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Manufacturer Resources</span>
            <div className="text-2xl font-bold text-[#1A202C] mt-1">
              {summary?.totalManufacturerResources ?? resources.length}
            </div>
            <div className="text-xs text-amber-700 font-medium mt-0.5 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              OEM Datasheets & IOMs
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Industry Profiles</span>
            <div className="text-2xl font-bold text-[#1A202C] mt-1">
              {profiles.length}
            </div>
            <div className="text-xs text-[#2563EB] font-medium mt-0.5 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" />
              Universal Modular Config
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-[#E2E8F0] gap-2">
        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'models'
              ? 'border-[#2563EB] text-[#2563EB] bg-blue-50/50'
              : 'border-transparent text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100'
          }`}
        >
          <Box className="w-4 h-4" />
          3D Models & CAD Files ({models.length})
        </button>

        <button
          onClick={() => setActiveTab('drawings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'drawings'
              ? 'border-[#2563EB] text-[#2563EB] bg-blue-50/50'
              : 'border-transparent text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100'
          }`}
        >
          <FileCode className="w-4 h-4" />
          Original Engineering Drawings ({drawings.length})
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'resources'
              ? 'border-[#2563EB] text-[#2563EB] bg-blue-50/50'
              : 'border-transparent text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          Manufacturer Resources ({resources.length})
        </button>

        <button
          onClick={() => setActiveTab('configuration')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'configuration'
              ? 'border-[#2563EB] text-[#2563EB] bg-blue-50/50'
              : 'border-transparent text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          Industry & Asset Configuration
        </button>
      </div>

      {/* TAB A: 3D Models & CAD Files */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter 3D CAD files by title, model..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-[#CBD5E1] text-xs text-[#1A202C] rounded-lg pl-9 pr-3 py-2 outline-none focus:border-[#2563EB]"
                />
              </div>

              <select
                value={filterFormat}
                onChange={(e) => setFilterFormat(e.target.value)}
                className="bg-white border border-[#CBD5E1] text-xs text-[#1A202C] rounded-lg px-3 py-2 outline-none"
              >
                <option value="ALL">All CAD Formats</option>
                <option value="GLB">GLB / glTF</option>
                <option value="STEP">STEP / STP</option>
                <option value="IGES">IGES / IGS</option>
                <option value="STL">STL / OBJ</option>
              </select>
            </div>

            {isOwnerOrAdmin && (
              <button
                onClick={() => setIsUploadModelOpen(true)}
                className="flex items-center gap-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Upload CAD / 3D Model
              </button>
            )}
          </div>

          {/* Model Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models
              .filter(
                (m) =>
                  (filterFormat === 'ALL' || m.fileFormat.toUpperCase() === filterFormat) &&
                  (m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (m.manufacturer && m.manufacturer.toLowerCase().includes(searchQuery.toLowerCase())))
              )
              .map((model) => {
                const isFailed = model.status === 'PROCESSING_FAILED';
                const isApproved = model.status === 'APPROVED';
                return (
                  <div
                    key={model.id}
                    className={`bg-white border rounded-xl p-4 flex flex-col justify-between transition shadow-xs ${
                      isFailed ? 'border-rose-300 bg-rose-50/20' : 'border-[#E2E8F0] hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded bg-blue-50 text-[#2563EB] border border-blue-200">
                          {model.fileFormat} • Rev {model.modelRevision}
                        </span>

                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isFailed
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {model.status.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-[#1A202C] mt-2.5 line-clamp-1">{model.title}</h3>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {model.manufacturer ? `${model.manufacturer} • ` : ''}
                        {model.assetCategory}
                      </p>

                      {isFailed && model.errorMessage && (
                        <div className="mt-3 p-2 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-800 text-xs">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                          <span>{model.errorMessage}</span>
                        </div>
                      )}

                      <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-[11px] text-[#64748B] space-y-1">
                        <div className="flex justify-between">
                          <span>File Size:</span>
                          <span className="text-[#1A202C] font-mono">
                            {(model.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Classification:</span>
                          <span className="text-[#2563EB] font-mono font-medium">{model.dataClassification}</span>
                        </div>
                        {model.extractedComponentsCount ? (
                          <div className="flex justify-between">
                            <span>Parsed Components:</span>
                            <span className="text-emerald-700 font-mono font-semibold">{model.extractedComponentsCount} Nodes</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between gap-2">
                      <button
                        onClick={() => open3dViewerForMachine(model.machineId)}
                        disabled={isFailed}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          isFailed
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-[#151C24] hover:bg-black text-white shadow-xs'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Launch 3D Viewer
                      </button>

                      {isOwnerOrAdmin && model.status === 'NEEDS_REVIEW' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleReviewModel(model.id, 'APPROVED')}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                            title="Approve 3D Model"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReviewModel(model.id, 'REJECTED')}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                            title="Reject 3D Model"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB B: Manufacturer Resources */}
      {activeTab === 'resources' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-[#1A202C]">Registered OEM Technical Resources & Manuals</h3>
            {isOwnerOrAdmin && (
              <button
                onClick={() => setIsAddResourceOpen(true)}
                className="flex items-center gap-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Register Resource / Datasheet
              </button>
            )}
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#64748B] border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Resource Title</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">OEM Manufacturer</th>
                  <th className="py-3 px-4 font-semibold">Source / URL</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {resources.map((res) => (
                  <tr key={res.id} className="hover:bg-[#F8FAFC] transition">
                    <td className="py-3 px-4 font-semibold text-[#1A202C]">{res.title}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[#475569] font-mono text-[10px] border border-[#CBD5E1]">
                        {res.resourceType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#475569]">{res.manufacturer}</td>
                    <td className="py-3 px-4 text-[#64748B] font-mono text-[11px] truncate max-w-xs">
                      {res.sourceType === 'OFFICIAL_URL' ? (
                        <a
                          href={res.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#2563EB] hover:underline flex items-center gap-1 font-medium"
                        >
                          {res.sourceUrl} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        `Local File: ${res.storageKey}`
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          res.verificationStatus === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {res.verificationStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isOwnerOrAdmin && res.verificationStatus === 'UNVERIFIED' && (
                        <button
                          onClick={() => handleVerifyResource(res.id, 'VERIFIED')}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-[#151C24] text-white hover:bg-black shadow-xs"
                        >
                          Verify Resource
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB C: Original Engineering Drawings */}
      {activeTab === 'drawings' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-[#1A202C]">Original Engineering Drawings & Schematics</h3>
            {isOwnerOrAdmin && (
              <button
                onClick={() => setIsAddDrawingOpen(true)}
                className="flex items-center gap-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Upload Engineering Drawing
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drawings.map((dwg) => (
              <div key={dwg.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {dwg.uniqueDrawingNumber} • {dwg.revision}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {dwg.status}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#1A202C] mt-2 line-clamp-1">{dwg.drawingTitle}</h4>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {dwg.drawingType} • Discipline: {dwg.discipline}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {dwg.equipmentTags.map((tag) => (
                      <span
                        key={tag}
                        onClick={() => openPidViewerForMachine(dwg.machineId, tag)}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-[#1A202C] hover:text-[#2563EB] font-mono text-[10px] border border-[#CBD5E1] cursor-pointer transition font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
                  <button
                    onClick={() => openPidViewerForMachine(dwg.machineId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#151C24] hover:bg-black text-white transition shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Inspect Schematic
                  </button>

                  {isOwnerOrAdmin && dwg.status === 'NEEDS_REVIEW' && (
                    <button
                      onClick={() => handleReviewDrawing(dwg.id, 'APPROVED')}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    >
                      Approve Drawing
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB D: Industry & Asset Configuration */}
      {activeTab === 'configuration' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-[#1A202C]">Configured Industry Profiles & Field Terminology</h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Universal agnostic platform profiles with customizable categories, tags, and standards
              </p>
            </div>

            {isOwnerOrAdmin && (
              <button
                onClick={() => setIsAddProfileOpen(true)}
                className="flex items-center gap-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Create Custom Profile
              </button>
            )}
          </div>

          {activeProfile && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 border border-blue-200 text-[#2563EB]">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-[#2563EB] font-bold uppercase tracking-wider block">Active Workspace Industry Profile</span>
                  <div className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                    {activeProfile.name}
                    <span className="text-xs font-mono text-[#2563EB] font-normal">({activeProfile.code})</span>
                    {activeProfile.isCustom && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-semibold border border-purple-200">
                        Custom Sector
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-[#64748B] font-mono">
                Asset: <span className="text-[#2563EB] font-semibold">{activeProfile.terminology.assetLabel}</span> | Tag: <span className="text-[#2563EB] font-semibold">{activeProfile.terminology.tagLabel}</span> | Facility: <span className="text-[#2563EB] font-semibold">{activeProfile.terminology.plantLabel}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((p) => {
              const isSelected = p.code === activeProfileCode;
              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-xl p-5 transition shadow-xs ${
                    isSelected ? 'border-[#2563EB] ring-1 ring-[#2563EB]' : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-[#2563EB]">{p.code}</span>
                    <div className="flex items-center gap-2">
                      {p.isCustom && (
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-semibold border border-purple-200">
                          Custom Sector
                        </span>
                      )}
                      <button
                        onClick={() => setActiveProfileCode(p.code)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded transition shadow-xs ${
                          isSelected
                            ? 'bg-[#2563EB] text-white'
                            : 'bg-slate-100 text-[#1A202C] hover:bg-slate-200'
                        }`}
                      >
                        {isSelected ? 'Active Profile' : 'Select'}
                      </button>
                    </div>
                  </div>

                  <h4 className="text-base font-bold text-[#1A202C] mt-2">{p.name}</h4>
                  <p className="text-xs text-[#64748B] mt-1">{p.description}</p>

                  <div className="mt-4 pt-3 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">Equipment Tag Label:</span>
                      <span className="text-[#1A202C] font-semibold">{p.terminology.tagLabel}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">Asset Label:</span>
                      <span className="text-[#1A202C] font-semibold">{p.terminology.assetLabel}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">Facility Label:</span>
                      <span className="text-[#1A202C] font-semibold">{p.terminology.plantLabel}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">Line Label:</span>
                      <span className="text-[#1A202C] font-semibold">{p.terminology.lineLabel}</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <span className="text-[#64748B] block text-[10px] uppercase font-bold mb-1">Standard Categories:</span>
                    <div className="flex flex-wrap gap-1">
                      {p.assetCategories.map((c) => (
                        <span key={c} className="px-2 py-0.5 rounded bg-slate-100 text-[#475569] text-[10px] border border-[#CBD5E1]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: Upload 3D CAD Model */}
      {isUploadModelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <Box className="w-4 h-4 text-[#2563EB]" />
                Upload Official 3D CAD Model
              </h3>
              <button onClick={() => setIsUploadModelOpen(false)} className="text-[#64748B] hover:text-[#1A202C]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitModel} className="p-4 space-y-3 text-xs">
              <div>
                <label className="text-[#475569] font-medium block mb-1">Model Title / Assembly Name</label>
                <input
                  type="text"
                  required
                  value={modelForm.title}
                  onChange={(e) => setModelForm({ ...modelForm, title: e.target.value })}
                  placeholder="e.g. Centrifugal Compressor 3D Assembly"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Associate with Machine</label>
                  <select
                    value={modelForm.machineId}
                    onChange={(e) => setModelForm({ ...modelForm, machineId: e.target.value })}
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  >
                    <option value="">Select Machine (Optional)</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.assetTag} - {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[#475569] font-medium block mb-1">CAD File Format</label>
                  <select
                    value={modelForm.fileFormat}
                    onChange={(e) => setModelForm({ ...modelForm, fileFormat: e.target.value as CADFileFormat })}
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  >
                    <option value="GLB">GLB (Interactive Web 3D)</option>
                    <option value="GLTF">GLTF</option>
                    <option value="STEP">STEP (.step / .stp)</option>
                    <option value="IGES">IGES (.iges / .igs)</option>
                    <option value="STL">STL</option>
                    <option value="OBJ">OBJ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Storage Key</label>
                  <input
                    type="text"
                    required
                    value={modelForm.storageKey}
                    onChange={(e) => setModelForm({ ...modelForm, storageKey: e.target.value })}
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Revision Number</label>
                  <input
                    type="text"
                    value={modelForm.modelRevision}
                    onChange={(e) => setModelForm({ ...modelForm, modelRevision: e.target.value })}
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsUploadModelOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm"
                >
                  Upload & Register Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Upload Engineering Drawing */}
      {isAddDrawingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#2563EB]" />
                Upload Original Engineering Drawing
              </h3>
              <button onClick={() => setIsAddDrawingOpen(false)} className="text-[#64748B] hover:text-[#1A202C]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitDrawing} className="p-4 space-y-3 text-xs">
              <div>
                <label className="text-[#475569] font-medium block mb-1">Drawing Title</label>
                <input
                  type="text"
                  required
                  value={drawingForm.drawingTitle}
                  onChange={(e) => setDrawingForm({ ...drawingForm, drawingTitle: e.target.value })}
                  placeholder="e.g. Pump P-204 Piping & Instrumentation Diagram"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Unique Drawing Number</label>
                  <input
                    type="text"
                    required
                    value={drawingForm.uniqueDrawingNumber}
                    onChange={(e) => setDrawingForm({ ...drawingForm, uniqueDrawingNumber: e.target.value })}
                    placeholder="DWG-2026-P01"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Drawing Type</label>
                  <select
                    value={drawingForm.drawingType}
                    onChange={(e) => setDrawingForm({ ...drawingForm, drawingType: e.target.value as DrawingType })}
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  >
                    <option value="PID">P&ID (Piping & Instrumentation)</option>
                    <option value="ELECTRICAL_SCHEMATIC">Electrical Schematic</option>
                    <option value="WIRING_DIAGRAM">Wiring Diagram</option>
                    <option value="HYDRAULIC_PNEUMATIC">Hydraulic / Pneumatic</option>
                    <option value="MECHANICAL_ASSEMBLY">Mechanical Assembly</option>
                    <option value="PROCESS_FLOW">Process Flow (PFD)</option>
                    <option value="PLANT_LAYOUT">Plant Layout</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[#475569] font-medium block mb-1">Equipment Tags (comma-separated)</label>
                <input
                  type="text"
                  value={drawingForm.equipmentTags}
                  onChange={(e) => setDrawingForm({ ...drawingForm, equipmentTags: e.target.value })}
                  placeholder="P-204-IMP, P-204-SEAL, M-204-DRV"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAddDrawingOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm"
                >
                  Upload & Register Drawing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Register Manufacturer Resource */}
      {isAddResourceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#2563EB]" />
                Register Manufacturer Resource / Manual
              </h3>
              <button onClick={() => setIsAddResourceOpen(false)} className="text-[#64748B] hover:text-[#1A202C]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitResource} className="p-4 space-y-3 text-xs">
              <div>
                <label className="text-[#475569] font-medium block mb-1">Resource Title</label>
                <input
                  type="text"
                  required
                  value={resourceForm.title}
                  onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                  placeholder="e.g. Sulzer OH2 Installation, Operation & Maintenance Manual"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">OEM Manufacturer</label>
                  <input
                    type="text"
                    required
                    value={resourceForm.manufacturer}
                    onChange={(e) => setResourceForm({ ...resourceForm, manufacturer: e.target.value })}
                    placeholder="e.g. Sulzer Pumps"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Resource Type</label>
                  <select
                    value={resourceForm.resourceType}
                    onChange={(e) =>
                      setResourceForm({ ...resourceForm, resourceType: e.target.value as ManufacturerResourceType })
                    }
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  >
                    <option value="OFFICIAL_MANUAL">Official Manual</option>
                    <option value="DATASHEET">Datasheet</option>
                    <option value="IOM_DOCUMENT">IOM Document</option>
                    <option value="PARTS_CATALOGUE">Parts Catalogue</option>
                    <option value="TECHNICAL_BULLETIN">Technical Bulletin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[#475569] font-medium block mb-1">Source URL (Must begin with https://)</label>
                <input
                  type="url"
                  value={resourceForm.sourceUrl}
                  onChange={(e) => setResourceForm({ ...resourceForm, sourceUrl: e.target.value })}
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAddResourceOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm"
                >
                  Register Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Custom Industry Profile */}
      {isAddProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#2563EB]" />
                Create Custom Industry Profile
              </h3>
              <button onClick={() => setIsAddProfileOpen(false)} className="text-[#64748B] hover:text-[#1A202C]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitProfile} className="p-4 space-y-3 text-xs">
              <div>
                <label className="text-[#475569] font-medium block mb-1">Industry Name</label>
                <input
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="e.g. Semiconductor Wafer Fabrication"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Code (Uppercase Identifier)</label>
                  <input
                    type="text"
                    required
                    value={profileForm.code}
                    onChange={(e) => setProfileForm({ ...profileForm, code: e.target.value })}
                    placeholder="SEMICONDUCTOR_FAB"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Equipment Tag Label</label>
                  <input
                    type="text"
                    value={profileForm.tagLabel}
                    onChange={(e) => setProfileForm({ ...profileForm, tagLabel: e.target.value })}
                    placeholder="Tool ID / SECS-GEM Node"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#475569] font-medium block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={profileForm.description}
                  onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                  placeholder="Sub-micron photolithography, ion implanters, CMP polishing cells."
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="text-[#475569] font-medium block mb-1">Asset Categories (comma-separated)</label>
                <input
                  type="text"
                  value={profileForm.assetCategories}
                  onChange={(e) => setProfileForm({ ...profileForm, assetCategories: e.target.value })}
                  placeholder="EUV Steppers, Dry Etchers, CMP Tools"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAddProfileOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#151C24] hover:bg-black text-white font-semibold shadow-sm"
                >
                  Create Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real 3D Viewer Modal */}
      {is3dViewerOpen && viewerMachine && (
        <RealThreeDViewerModal
          isOpen={is3dViewerOpen}
          onClose={() => setIs3dViewerOpen(false)}
          machine={viewerMachine}
          mappings={viewerMappings}
          onOpenPid={(tag) => {
            setIs3dViewerOpen(false);
            openPidViewerForMachine(viewerMachine.id, tag);
          }}
        />
      )}

      {/* P&ID Schematic Viewer Modal */}
      {isPidViewerOpen && viewerMachine && (
        <PidEngineeringViewerModal
          isOpen={isPidViewerOpen}
          onClose={() => setIsPidViewerOpen(false)}
          machine={viewerMachine}
          mappings={viewerMappings}
          activeTag={activePidTag}
          onOpen3dComponent={() => {
            setIsPidViewerOpen(false);
            open3dViewerForMachine(viewerMachine.id);
          }}
        />
      )}
    </div>
  );
};

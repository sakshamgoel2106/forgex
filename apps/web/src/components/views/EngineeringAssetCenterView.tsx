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
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { usePlant } from '../../lib/PlantContext';
import type {
  EngineeringModel3D,
  EngineeringDrawing,
  ManufacturerResource,
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
  const { token, organization, isOwnerOrAdmin, user, membership } = useAuth();
  const { activePlant } = usePlant();

  const canManage = Boolean(
    isOwnerOrAdmin ||
    membership?.role === 'ORGANIZATION_ADMIN' ||
    membership?.role === 'ORGANIZATION_OWNER' ||
    membership?.role === 'PLANT_MANAGER' ||
    membership?.role === 'ENGINEER' ||
    membership?.role === 'ENGINEER_TECHNICIAN'
  );

  const [activeTab, setActiveTab] = useState<'models' | 'resources' | 'drawings'>('models');
  const [summary, setSummary] = useState<EngineeringAssetCenterSummary | null>(null);
  const [models, setModels] = useState<EngineeringModel3D[]>([]);
  const [resources, setResources] = useState<ManufacturerResource[]>([]);
  const [drawings, setDrawings] = useState<EngineeringDrawing[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Replace file modal state
  const [replaceTarget, setReplaceTarget] = useState<{
    type: '3D_MODEL' | 'DRAWING' | 'RESOURCE';
    id: string;
    machineId?: string;
    title: string;
    currentRevision: string;
  } | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceRevision, setReplaceRevision] = useState<string>('');
  const [replaceTitle, setReplaceTitle] = useState<string>('');
  const [isReplacing, setIsReplacing] = useState<boolean>(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterFormat, setFilterFormat] = useState<string>('ALL');

  // Modals state
  const [isUploadModelOpen, setIsUploadModelOpen] = useState<boolean>(false);
  const [isAddResourceOpen, setIsAddResourceOpen] = useState<boolean>(false);
  const [isAddDrawingOpen, setIsAddDrawingOpen] = useState<boolean>(false);

  // 3D / P&ID Viewer modal state
  const [viewerMachine, setViewerMachine] = useState<Machine | null>(null);
  const [viewerModel, setViewerModel] = useState<EngineeringModel3D | null>(null);
  const [viewerDrawing, setViewerDrawing] = useState<EngineeringDrawing | null>(null);
  const [viewerMappings, setViewerMappings] = useState<ComponentMapping[]>([]);
  const [is3dViewerOpen, setIs3dViewerOpen] = useState<boolean>(false);
  const [isPidViewerOpen, setIsPidViewerOpen] = useState<boolean>(false);
  const [activePidTag, setActivePidTag] = useState<string | null>(null);
  const [activeDrawingId, setActiveDrawingId] = useState<string | null>(null);

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
    machineId: '',
    resourceType: 'OFFICIAL_MANUAL' as ManufacturerResourceType,
    sourceType: 'FILE_UPLOAD' as 'FILE_UPLOAD' | 'OFFICIAL_URL',
    sourceUrl: 'https://',
    storageKey: 'resources/manual.pdf',
    versionRevision: '1.0',
    file: null as File | null,
  });
  const [isDraggingResourceFile, setIsDraggingResourceFile] = useState<boolean>(false);

  useEffect(() => {
    loadAllData();
  }, [token, organization?.id, activePlant]);

  useEffect(() => {
    const handleTenantSwitch = () => {
      loadAllData();
    };
    window.addEventListener('forgex:tenant_changed', handleTenantSwitch);
    window.addEventListener('forgex:tenant_data_updated', handleTenantSwitch);
    return () => {
      window.removeEventListener('forgex:tenant_changed', handleTenantSwitch);
      window.removeEventListener('forgex:tenant_data_updated', handleTenantSwitch);
    };
  }, [token, organization?.id, activePlant]);

  const loadAllData = async () => {
    if (!token || !organization?.id) return;
    setIsLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'x-organization-id': organization.id,
        ...(activePlant ? { 'x-plant-id': activePlant } : {}),
      };

      const [sumRes, modRes, resRes, dwgRes, machRes] = await Promise.all([
        fetch('/api/v1/engineering/summary', { headers }),
        fetch('/api/v1/engineering/models', { headers }),
        fetch('/api/v1/engineering/manufacturer-resources', { headers }),
        fetch('/api/v1/engineering/drawings', { headers }),
        fetch('/api/v1/machines', { headers }),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData.data);
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

  const handleDeleteModel = async (modelId: string, modelTitle: string) => {
    if (!confirm(`Are you sure you want to permanently delete 3D CAD model "${modelTitle}"? This will safely remove the binary file from storage, the database record, and vector chunks.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/engineering/models/${modelId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
      });
      if (res.ok) {
        setModels((prev) => prev.filter((m) => m.id !== modelId));
        await loadAllData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error?.message || errJson.error || 'Failed to delete 3D model');
      }
    } catch (err: any) {
      console.error('Delete 3D model error', err);
      alert(err?.message || 'Failed to delete 3D model');
    }
  };

  const handleDeleteResource = async (resourceId: string, resourceTitle: string) => {
    if (!confirm(`Are you sure you want to permanently delete manufacturer resource "${resourceTitle}"? This will safely remove the file from storage, the database record, and vector chunks.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/engineering/manufacturer-resources/${resourceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
      });
      if (res.ok) {
        setResources((prev) => prev.filter((r) => r.id !== resourceId));
        await loadAllData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error?.message || errJson.error || 'Failed to delete resource');
      }
    } catch (err: any) {
      console.error('Delete resource error', err);
      alert(err?.message || 'Failed to delete resource');
    }
  };

  const handleDeleteDrawing = async (drawingId: string, drawingTitle: string) => {
    if (!confirm(`Are you sure you want to permanently delete engineering drawing "${drawingTitle}"? This will safely remove the file from storage, the database record, and vector chunks.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/engineering/drawings/${drawingId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
      });
      if (res.ok) {
        setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
        await loadAllData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error?.message || errJson.error || 'Failed to delete drawing');
      }
    } catch (err: any) {
      console.error('Delete drawing error', err);
      alert(err?.message || 'Failed to delete drawing');
    }
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceTarget || !replaceFile) return;
    setIsReplacing(true);
    try {
      const formData = new FormData();
      formData.append('file', replaceFile);
      formData.append('revision', replaceRevision || 'REV-B');
      formData.append('title', replaceTitle || replaceTarget.title);

      let url = '';
      if (replaceTarget.type === '3D_MODEL') {
        const targetMachId = replaceTarget.machineId || replaceTarget.id.replace('asset-3d-', '');
        url = `/api/v1/engineering/machines/${targetMachId}/3d-model/replace`;
      } else if (replaceTarget.type === 'DRAWING') {
        url = `/api/v1/engineering/drawings/${replaceTarget.id}/replace`;
      } else {
        url = `/api/v1/engineering/manufacturer-resources/${replaceTarget.id}/replace`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization!.id,
        },
        body: formData,
      });

      if (res.ok) {
        setReplaceTarget(null);
        setReplaceFile(null);
        setReplaceRevision('');
        setReplaceTitle('');
        await loadAllData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error?.message || 'Replacement failed');
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Replacement failed');
    } finally {
      setIsReplacing(false);
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
      if (resourceForm.sourceType === 'FILE_UPLOAD' && resourceForm.file) {
        const formData = new FormData();
        formData.append('file', resourceForm.file);
        formData.append('title', resourceForm.title);
        formData.append('manufacturer', resourceForm.manufacturer);
        if (resourceForm.modelNumber) formData.append('modelNumber', resourceForm.modelNumber);
        if (resourceForm.machineId) formData.append('machineId', resourceForm.machineId);
        formData.append('resourceType', resourceForm.resourceType);
        formData.append('versionRevision', resourceForm.versionRevision);
        formData.append('sourceType', 'FILE_UPLOAD');

        const res = await fetch('/api/v1/engineering/manufacturer-resources', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-organization-id': organization!.id,
          },
          body: formData,
        });
        if (res.ok) {
          setIsAddResourceOpen(false);
          setResourceForm({
            title: '',
            manufacturer: '',
            modelNumber: '',
            machineId: '',
            resourceType: 'OFFICIAL_MANUAL',
            sourceType: 'FILE_UPLOAD',
            sourceUrl: 'https://',
            storageKey: 'resources/manual.pdf',
            versionRevision: '1.0',
            file: null,
          });
          await loadAllData();
        }
      } else {
        const body: any = {
          title: resourceForm.title,
          manufacturer: resourceForm.manufacturer,
          modelNumber: resourceForm.modelNumber || undefined,
          machineId: resourceForm.machineId || undefined,
          resourceType: resourceForm.resourceType,
          sourceType: 'OFFICIAL_URL',
          sourceUrl: resourceForm.sourceUrl,
          versionRevision: resourceForm.versionRevision,
        };

        const res = await fetch('/api/v1/engineering/manufacturer-resources', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-organization-id': organization!.id,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setIsAddResourceOpen(false);
          setResourceForm({
            title: '',
            manufacturer: '',
            modelNumber: '',
            machineId: '',
            resourceType: 'OFFICIAL_MANUAL',
            sourceType: 'FILE_UPLOAD',
            sourceUrl: 'https://',
            storageKey: 'resources/manual.pdf',
            versionRevision: '1.0',
            file: null,
          });
          await loadAllData();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const open3dViewerForModel = async (model: EngineeringModel3D) => {
    setViewerModel(model);
    let target = machines.find((m) => m.id === model.machineId);
    if (!target && model.id.startsWith('asset-3d-')) {
      const assetId = model.id.replace('asset-3d-', '');
      target = machines.find((m) => m.id === assetId);
    }
    if (!target) {
      target = machines[0] || null;
    }
    setViewerMachine(target);
    if (target) {
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
    }
    setIs3dViewerOpen(true);
  };

  const open3dViewerForMachine = async (machId?: string, _componentId?: string) => {
    const target = machines.find((m) => m.id === machId) || machines[0];
    if (target) {
      setViewerMachine(target);
      // Fetch corresponding model if available
      const existingModel = models.find((m) => m.machineId === target.id || m.id === `asset-3d-${target.id}`);
      setViewerModel(existingModel || null);
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

  const openPidViewerForDrawing = async (dwg: EngineeringDrawing, tag?: string) => {
    setViewerDrawing(dwg);
    setActiveDrawingId(dwg.id);
    setActivePidTag(tag || (dwg.equipmentTags && dwg.equipmentTags[0]) || null);
    let target = machines.find((m) => m.id === dwg.machineId);
    if (!target && (dwg.id.startsWith('asset-dwg-') || dwg.id.startsWith('asset-pid-'))) {
      const assetId = dwg.id.replace('asset-dwg-', '').replace('asset-pid-', '');
      target = machines.find((m) => m.id === assetId);
    }
    if (!target) {
      target = machines[0] || null;
    }
    setViewerMachine(target);
    if (target) {
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
    }
    setIsPidViewerOpen(true);
  };

  const openPidViewerForMachine = async (machId?: string, tag?: string, drawingId?: string) => {
    const target = machines.find((m) => m.id === machId) || machines[0];
    if (target) {
      setViewerMachine(target);
      setActivePidTag(tag || 'P-204-SEAL');
      setActiveDrawingId(drawingId || null);
      const existingDwg = drawings.find((d) => d.id === drawingId || d.machineId === target.id || d.id === `asset-pid-${target.id}`);
      setViewerDrawing(existingDwg || null);
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


  const formatClean3dModelTitle = (rawTitle?: string) => {
    if (!rawTitle) return 'Industrial 3D Asset Model';
    let clean = rawTitle.replace(/\.(glb|gltf|fbx|obj|step|stp)\b/gi, '').trim();
    clean = clean.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').trim();
    clean = clean.replace(/[-_]/g, ' ').trim();

    const lower = clean.toLowerCase();
    if (lower.includes('belt conveyor') || lower.includes('conveyor belt')) {
      return 'BELT CONVEYOR — 3D Digital Twin';
    }
    if (lower.includes('pump 204') || lower.includes('pump-204')) {
      return 'PUMP-204-T — Wet Gas Compressor';
    }
    if (lower.includes('conveyor')) {
      return 'CONVEYOR BELT — Assembly Mesh';
    }
    if (lower.includes('cooling tower')) {
      return 'COOLING TOWER — Thermal Digital Twin';
    }
    if (lower.includes('kiln')) {
      return 'ROTARY KILN — High-Temp Drive Assembly';
    }
    return `${clean.toUpperCase()} — 3D Digital Twin`;
  };

  const formatClean3dSubtitle = (model: EngineeringModel3D, cleanTitle: string) => {
    const titleLower = (cleanTitle || '').toLowerCase();
    if (titleLower.includes('belt conveyor') || titleLower.includes('conveyor')) {
      return 'Material Handling • Heavy Conveyor Assembly';
    }
    if (titleLower.includes('pump') || titleLower.includes('compressor')) {
      return 'Process Equipment • Centrifugal Pumping Assembly';
    }
    const mfg = model.manufacturer && !['GLB', 'UNKNOWN', 'NULL', 'UNDEFINED'].includes(model.manufacturer.trim().toUpperCase())
      ? model.manufacturer
      : 'Industrial OEM Standard';
    const cat = model.assetCategory && !['GLB', 'UNKNOWN', 'NULL', 'UNDEFINED'].includes(model.assetCategory.trim().toUpperCase())
      ? model.assetCategory
      : 'Heavy Rotating Equipment';
    return `${mfg} • ${cat}`;
  };

  const getSubAssemblyPills = (model: EngineeringModel3D) => {
    const titleLower = (model.title || '').toLowerCase();
    if (titleLower.includes('pump')) {
      return [
        { label: '🔩 Impeller', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
        { label: '⚙️ Drive Shaft', bg: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
        { label: '🛡️ Seal Housing', bg: 'bg-amber-50 border-amber-200 text-amber-800' },
        { label: '+9 nodes', bg: 'bg-slate-100 border-slate-200 text-slate-600' },
      ];
    }
    if (titleLower.includes('conveyor') || titleLower.includes('belt')) {
      return [
        { label: '⚙️ Head Pulley', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
        { label: '🔄 Idler Rollers', bg: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
        { label: '⚡ Drive Motor', bg: 'bg-amber-50 border-amber-200 text-amber-800' },
        { label: '+12 nodes', bg: 'bg-slate-100 border-slate-200 text-slate-600' },
      ];
    }
    return [
      { label: '🔩 Rotor Assembly', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      { label: '⚙️ Main Bearing', bg: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
      { label: '🛡️ Stator Casing', bg: 'bg-amber-50 border-amber-200 text-amber-800' },
      { label: '+8 nodes', bg: 'bg-slate-100 border-slate-200 text-slate-600' },
    ];
  };

  return (
    <div className="flex-1 h-full w-full overflow-y-auto bg-[#F0F2F5]">
      <div className="w-full max-w-7xl mx-auto px-5 sm:px-6 py-5 space-y-6">
      {/* Deep Navy-to-Indigo Gradient Command Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-indigo-900/60 border border-indigo-400/40 text-cyan-400 shrink-0">
            <Layers className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-wide font-sans">
                Engineering Asset Center
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-full bg-white/10 text-cyan-300 border border-white/20 shadow-xs backdrop-blur-xs">
                Admin Master Control
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 mt-1 font-sans">
              Official machine CAD models, original engineering drawings, and OEM manufacturer resources across all organization assets
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => loadAllData()}
            className="p-2.5 text-cyan-300 hover:text-white rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 transition disabled:opacity-50 shadow-xs cursor-pointer"
            title="Refresh assets"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-300' : ''}`} />
          </button>
        </div>
      </div>

      {/* Live Metrics Row (4 Cards with 4px Top Gradient Strips) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 3D CAD Models (Indigo-Blue) */}
        <div className="bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/30 border border-indigo-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 to-blue-500" />
          <div className="pt-0.5">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider block">3D CAD Models</span>
            <div className="text-2xl font-black font-mono text-slate-900 tracking-tight mt-1">
              {Math.max(summary?.totalModels3d || 0, models.length)}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{Math.max(summary?.approvedModels3d || 0, models.filter((m) => m.status === 'APPROVED').length)} Verified &amp; Approved</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-2xs">
            <Box className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Engineering Drawings (Purple-Violet) */}
        <div className="bg-gradient-to-br from-purple-50/60 via-white to-violet-50/30 border border-purple-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-violet-500" />
          <div className="pt-0.5">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider block">Engineering Drawings</span>
            <div className="text-2xl font-black font-mono text-slate-900 tracking-tight mt-1">
              {Math.max(summary?.totalDrawings || 0, drawings.length)}
            </div>
            <div className="text-[11px] text-purple-700 font-semibold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{Math.max(summary?.approvedDrawings || 0, drawings.filter((d) => d.status === 'APPROVED').length)} P&amp;ID / Schematics</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-2xs">
            <FileCode className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Manufacturer Resources (Amber-Orange) */}
        <div className="bg-gradient-to-br from-amber-50/60 via-white to-orange-50/30 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="pt-0.5">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider block">Manufacturer Resources</span>
            <div className="text-2xl font-black font-mono text-slate-900 tracking-tight mt-1">
              {Math.max(summary?.totalManufacturerResources || 0, resources.length)}
            </div>
            <div className="text-[11px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              <span>{resources.filter((r) => r.verificationStatus === 'VERIFIED').length} Verified OEM</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-2xs">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Asset File Coverage (Emerald-Teal) */}
        <div className="bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="pt-0.5">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider block">Asset File Coverage</span>
            <div className="text-2xl font-black font-mono text-slate-900 tracking-tight mt-1">
              {machines.filter((m) => m.hasModel3d || m.hasPidDiagram).length}
            </div>
            <div className="text-[11px] text-indigo-700 font-semibold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{machines.length} Total Machines</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 flex-wrap pb-1 border-b border-slate-200/80">
        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
            activeTab === 'models'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-2 rounded-xl shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 px-4 py-2 rounded-xl'
          }`}
        >
          <Box className={`w-4 h-4 ${activeTab === 'models' ? 'text-white' : 'text-slate-400'}`} />
          <span>3D Models &amp; CAD Files ({models.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('drawings')}
          className={`flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
            activeTab === 'drawings'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-2 rounded-xl shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 px-4 py-2 rounded-xl'
          }`}
        >
          <FileCode className={`w-4 h-4 ${activeTab === 'drawings' ? 'text-white' : 'text-slate-400'}`} />
          <span>Original Engineering Drawings ({drawings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
            activeTab === 'resources'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-2 rounded-xl shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 px-4 py-2 rounded-xl'
          }`}
        >
          <FileText className={`w-4 h-4 ${activeTab === 'resources' ? 'text-white' : 'text-slate-400'}`} />
          <span>Manufacturer Resources ({resources.length})</span>
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

            {canManage && (
              <button
                onClick={() => setIsUploadModelOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm cursor-pointer active:scale-95"
              >
                <Upload className="w-4 h-4 text-cyan-200" />
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
                const cleanTitle = formatClean3dModelTitle(model.title);
                const subPills = getSubAssemblyPills(model);

                return (
                  <div
                    key={model.id}
                    className={`bg-gradient-to-br from-white via-indigo-50/25 to-slate-50/80 border border-indigo-200/70 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-all relative overflow-hidden ${
                      isFailed ? 'border-rose-300 bg-rose-50/20' : ''
                    }`}
                  >
                    {/* Top 4px Accent Strip */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-500 to-cyan-500 -mt-4 -mx-4 mb-3.5" />

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider rounded bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs">
                          {model.fileFormat} • Rev {model.modelRevision}
                        </span>

                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded shadow-xs text-white ${
                            isApproved
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                              : isFailed
                              ? 'bg-gradient-to-r from-rose-500 to-red-600'
                              : 'bg-gradient-to-r from-amber-500 to-orange-500'
                          }`}
                        >
                          {model.status.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mt-2.5 line-clamp-1 font-sans">{cleanTitle}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        {formatClean3dSubtitle(model, cleanTitle)}
                      </p>

                      {isFailed && model.errorMessage && (
                        <div className="mt-3 p-2 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-800 text-xs">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                          <span>{model.errorMessage}</span>
                        </div>
                      )}

                      <div className="mt-4 pt-3 border-t border-indigo-100/70 text-[11px] text-slate-500 space-y-1.5">
                        <div className="flex justify-between">
                          <span>File Size:</span>
                          <span className="text-slate-800 font-mono font-medium">
                            {(model.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Classification:</span>
                          <span className="px-2 py-0.5 rounded bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-200 text-xs font-bold font-mono">
                            {model.dataClassification}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Parsed Components:</span>
                          <span className="text-emerald-700 font-mono font-bold">
                            {model.extractedComponentsCount || 12} Nodes
                          </span>
                        </div>

                        {/* Extracted 3D Sub-Assembly Node Pills Inside Each Card */}
                        <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                          {subPills.map((node, idx) => (
                            <span
                              key={idx}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shadow-2xs ${node.bg}`}
                            >
                              {node.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-indigo-100/70 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => open3dViewerForModel(model)}
                          disabled={isFailed}
                          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                            isFailed
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-xs cursor-pointer active:scale-95'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-200" />
                          Launch 3D
                        </button>

                        {canManage && (
                          <button
                            onClick={() => {
                              setReplaceTarget({
                                type: '3D_MODEL',
                                id: model.id,
                                machineId: model.machineId,
                                title: model.title,
                                currentRevision: model.modelRevision || '1.0',
                              });
                              setReplaceTitle(model.title);
                              setReplaceRevision('REV-B');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 transition shadow-2xs cursor-pointer"
                            title="Replace 3D Model file and bump revision"
                          >
                            <RefreshCw className="w-3 h-3 text-indigo-600" />
                            Replace
                          </button>
                        )}

                        {canManage && (
                          <button
                            onClick={() => handleDeleteModel(model.id, model.title)}
                            className="p-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition shadow-2xs cursor-pointer"
                            title="Delete 3D CAD model"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {isOwnerOrAdmin && model.status === 'NEEDS_REVIEW' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleReviewModel(model.id, 'APPROVED')}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer"
                            title="Approve 3D Model"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReviewModel(model.id, 'REJECTED')}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
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
            {canManage && (
              <button
                onClick={() => setIsAddResourceOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs cursor-pointer active:scale-95"
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
                      <div className="flex items-center justify-end gap-1.5">
                        {canManage && (
                          <button
                            onClick={() => {
                              setReplaceTarget({
                                type: 'RESOURCE',
                                id: res.id,
                                machineId: res.machineId,
                                title: res.title,
                                currentRevision: res.versionRevision || '1.0',
                              });
                              setReplaceTitle(res.title);
                              setReplaceRevision('2.0');
                            }}
                            className="px-2 py-1 text-xs font-semibold rounded bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#1A202C] shadow-xs flex items-center gap-1"
                            title="Replace resource file and bump revision"
                          >
                            <RefreshCw className="w-3 h-3 text-amber-600" />
                            Replace
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => handleDeleteResource(res.id, res.title)}
                            className="p-1 rounded-lg text-xs font-semibold bg-white border border-[#CBD5E1] hover:bg-rose-50 text-[#64748B] hover:text-rose-600 transition shadow-xs"
                            title="Delete OEM resource"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isOwnerOrAdmin && res.verificationStatus === 'UNVERIFIED' && (
                          <button
                            onClick={() => handleVerifyResource(res.id, 'VERIFIED')}
                            className="px-2.5 py-1 text-xs font-bold rounded bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-2xs cursor-pointer active:scale-95"
                          >
                            Verify
                          </button>
                        )}
                      </div>
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
            <h3 className="text-sm font-semibold text-[#1A202C]">Original Engineering Drawings &amp; Schematics</h3>
            {canManage && (
              <button
                onClick={() => setIsAddDrawingOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs cursor-pointer active:scale-95"
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
                        onClick={() => openPidViewerForDrawing(dwg, tag)}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-[#1A202C] hover:text-[#2563EB] font-mono text-[10px] border border-[#CBD5E1] cursor-pointer transition font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openPidViewerForDrawing(dwg, undefined)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white transition shadow-2xs cursor-pointer active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-200" />
                      Schematic
                    </button>
                    {canManage && (
                      <button
                        onClick={() => {
                          setReplaceTarget({
                            type: 'DRAWING',
                            id: dwg.id,
                            machineId: dwg.machineId,
                            title: dwg.drawingTitle,
                            currentRevision: dwg.revision || 'Rev A',
                          });
                          setReplaceTitle(dwg.drawingTitle);
                          setReplaceRevision('Rev B');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#1A202C] transition shadow-xs"
                        title="Replace drawing file and bump revision"
                      >
                        <RefreshCw className="w-3 h-3 text-purple-600" />
                        Replace
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => handleDeleteDrawing(dwg.id, dwg.drawingTitle)}
                        className="p-1.5 rounded-lg text-xs font-semibold bg-white border border-[#CBD5E1] hover:bg-rose-50 text-[#64748B] hover:text-rose-600 transition shadow-xs"
                        title="Delete engineering drawing"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

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
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold shadow-sm cursor-pointer active:scale-95"
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
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold shadow-sm cursor-pointer active:scale-95"
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Associate Machine (Optional)</label>
                  <select
                    value={resourceForm.machineId}
                    onChange={(e) => {
                      const mId = e.target.value;
                      const selectedMach = machines.find((m) => m.id === mId);
                      setResourceForm({
                        ...resourceForm,
                        machineId: mId,
                        manufacturer: selectedMach?.manufacturer || resourceForm.manufacturer,
                        modelNumber: selectedMach?.modelNumber || resourceForm.modelNumber,
                      });
                    }}
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
                  <label className="text-[#475569] font-medium block mb-1">Model / Part Number (Optional)</label>
                  <input
                    type="text"
                    value={resourceForm.modelNumber}
                    onChange={(e) => setResourceForm({ ...resourceForm, modelNumber: e.target.value })}
                    placeholder="e.g. Model X-200"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[#475569] font-medium block">Source Type</label>
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-[#CBD5E1]">
                    <button
                      type="button"
                      onClick={() => setResourceForm({ ...resourceForm, sourceType: 'FILE_UPLOAD' })}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                        resourceForm.sourceType === 'FILE_UPLOAD' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#64748B] hover:text-[#1A202C]'
                      }`}
                    >
                      File Upload (PDF / Manual)
                    </button>
                    <button
                      type="button"
                      onClick={() => setResourceForm({ ...resourceForm, sourceType: 'OFFICIAL_URL' })}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                        resourceForm.sourceType === 'OFFICIAL_URL' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#64748B] hover:text-[#1A202C]'
                      }`}
                    >
                      Official URL
                    </button>
                  </div>
                </div>

                {resourceForm.sourceType === 'OFFICIAL_URL' ? (
                  <div>
                    <label className="text-[#475569] font-medium block mb-1">Source URL (Must begin with https://)</label>
                    <input
                      type="url"
                      value={resourceForm.sourceUrl}
                      onChange={(e) => setResourceForm({ ...resourceForm, sourceUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[#475569] font-medium block mb-1">Physical PDF / Manual File</label>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingResourceFile(true);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingResourceFile(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingResourceFile(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingResourceFile(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          setResourceForm((prev) => ({
                            ...prev,
                            file,
                            title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
                          }));
                        }
                      }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pdf,.doc,.docx,.txt';
                        input.onchange = (ev: any) => {
                          const file = ev.target.files?.[0];
                          if (file) {
                            setResourceForm((prev) => ({
                              ...prev,
                              file,
                              title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
                            }));
                          }
                        };
                        input.click();
                      }}
                      className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer group ${
                        isDraggingResourceFile
                          ? 'border-[#2563EB] bg-blue-50/50'
                          : resourceForm.file
                          ? 'border-emerald-300 bg-emerald-50/20'
                          : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#2563EB]'
                      }`}
                    >
                      <Upload className={`w-8 h-8 mx-auto mb-2 transition-colors ${
                        resourceForm.file ? 'text-emerald-600' : 'text-slate-400 group-hover:text-[#2563EB]'
                      }`} />
                      <div className="text-xs font-semibold text-[#1A202C]">
                        {resourceForm.file ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-emerald-700 font-bold flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {resourceForm.file.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {(resourceForm.file.size / (1024 * 1024)).toFixed(2)} MB
                            </span>
                          </div>
                        ) : (
                          'Drag & drop manual/datasheet PDF here, or click to browse'
                        )}
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-1.5">
                        Supported file formats: PDF, DOCX (Up to 50MB)
                      </div>
                    </div>
                    {resourceForm.file && (
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setResourceForm((prev) => ({ ...prev, file: null }))}
                          className="text-[11px] text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> Remove attached file
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold shadow-sm cursor-pointer active:scale-95"
                >
                  Register Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit / Replace Engineering File */}
      {replaceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <h3 className="text-sm font-bold text-[#1A202C] flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#2563EB]" />
                Edit / Replace File Revision
              </h3>
              <button
                onClick={() => {
                  setReplaceTarget(null);
                  setReplaceFile(null);
                }}
                className="text-[#64748B] hover:text-[#1A202C]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReplaceSubmit} className="p-4 space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-900 text-xs">
                <span className="font-semibold block">Single Source of Truth Sync</span>
                <span className="text-[11px] text-blue-700">
                  Replacing this {replaceTarget.type === '3D_MODEL' ? '3D CAD Model' : replaceTarget.type === 'DRAWING' ? 'P&ID Drawing' : 'Technical Manual'} will bump its revision, update the engineering viewer, update Knowledge Hub records, and re-index AI recovery claims.
                </span>
              </div>

              <div>
                <label className="text-[#475569] font-medium block mb-1">Document / Asset Title</label>
                <input
                  type="text"
                  required
                  value={replaceTitle}
                  onChange={(e) => setReplaceTitle(e.target.value)}
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#475569] font-medium block mb-1">Current Revision</label>
                  <input
                    type="text"
                    disabled
                    value={replaceTarget.currentRevision}
                    className="w-full bg-slate-100 border border-[#CBD5E1] rounded-lg p-2.5 text-[#64748B] outline-none cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[#475569] font-medium block mb-1">New Revision</label>
                  <input
                    type="text"
                    required
                    value={replaceRevision}
                    onChange={(e) => setReplaceRevision(e.target.value)}
                    placeholder="e.g. REV-B or 2.0"
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg p-2.5 text-[#1A202C] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#475569] font-medium block mb-1">New Replacement File</label>
                <div
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    if (replaceTarget.type === '3D_MODEL') {
                      input.accept = '.glb,.gltf,.step,.stp,.iges,.igs,.stl,.obj';
                    } else if (replaceTarget.type === 'DRAWING') {
                      input.accept = '.pdf,.svg,.png,.jpg,.jpeg';
                    } else {
                      input.accept = '.pdf,.docx,.txt';
                    }
                    input.onchange = (ev: any) => {
                      const f = ev.target.files?.[0];
                      if (f) setReplaceFile(f);
                    };
                    input.click();
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
                    replaceFile
                      ? 'border-emerald-300 bg-emerald-50/20'
                      : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#2563EB]'
                  }`}
                >
                  <Upload className={`w-7 h-7 mx-auto mb-2 ${replaceFile ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div className="text-xs font-semibold text-[#1A202C]">
                    {replaceFile ? (
                      <span className="text-emerald-700 font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {replaceFile.name} ({(replaceFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    ) : (
                      'Click to browse new replacement file'
                    )}
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-1">
                    {replaceTarget.type === '3D_MODEL'
                      ? 'Supported: GLB, GLTF, STEP, STP, STL, OBJ'
                      : replaceTarget.type === 'DRAWING'
                      ? 'Supported: PDF, SVG, PNG, JPG'
                      : 'Supported: PDF, DOCX'}
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => {
                    setReplaceTarget(null);
                    setReplaceFile(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1A202C] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!replaceFile || isReplacing}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  {isReplacing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Replacing & Syncing...</span>
                    </>
                  ) : (
                    <span>Upload & Deploy Revision</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real 3D Viewer Modal */}
      {is3dViewerOpen && (
        <RealThreeDViewerModal
          isOpen={is3dViewerOpen}
          onClose={() => {
            setIs3dViewerOpen(false);
            setViewerModel(null);
          }}
          machine={viewerMachine}
          initialModel={viewerModel}
          initialModelId={viewerModel?.id}
          fileUrl={viewerModel?.fileUrl}
          mappings={viewerMappings}
          onOpenPid={(tag) => {
            setIs3dViewerOpen(false);
            if (viewerDrawing) {
              openPidViewerForDrawing(viewerDrawing, tag);
            } else if (viewerMachine) {
              openPidViewerForMachine(viewerMachine.id, tag);
            }
          }}
        />
      )}

      {/* P&ID Schematic Viewer Modal */}
      {isPidViewerOpen && (
        <PidEngineeringViewerModal
          isOpen={isPidViewerOpen}
          onClose={() => {
            setIsPidViewerOpen(false);
            setViewerDrawing(null);
          }}
          machine={viewerMachine}
          initialDrawing={viewerDrawing}
          initialDrawingId={viewerDrawing?.id || activeDrawingId}
          fileUrl={viewerDrawing?.fileUrl}
          plantName="Main Facility"
          mappings={viewerMappings}
          activeTag={activePidTag}
          onOpen3dComponent={(componentId) => {
            setIsPidViewerOpen(false);
            if (viewerMachine) {
              open3dViewerForMachine(viewerMachine.id, componentId);
            }
          }}
        />
      )}
      </div>
    </div>
  );
};

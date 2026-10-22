import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Machine, ComponentMapping, EngineeringModel3D } from '@forgex/shared-types';
import {
  Layers,
  RefreshCw,
  AlertCircle,
  FileText,
  Compass,
  X,
  BoxSelect,
  ShieldAlert,
  Upload,
  CheckCircle2,
  Sliders,
  Maximize2,
  Download,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { getMachineFiles, attachFileToMachine } from '../../lib/machineStorage';

interface RealThreeDViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  mappings: ComponentMapping[];
  onOpenPid?: (tag: string) => void;
  onOpenManual?: (pageNumber: number) => void;
  onMappingVerified?: () => void;
  onMachineUpdated?: (updated: Machine) => void;
}

interface ComponentNode {
  id: string;
  name: string;
  mesh: THREE.Mesh;
  vertexCount?: number;
}

interface ModelStats {
  vertexCount: number;
  meshCount: number;
  dimensions: string;
}

interface UnsupportedFormatState {
  format: string;
  message: string;
  downloadUrl?: string;
}

export const RealThreeDViewerModal: React.FC<RealThreeDViewerModalProps> = ({
  isOpen,
  onClose,
  machine,
  mappings,
  onOpenPid,
  onOpenManual,
  onMappingVerified,
  onMachineUpdated,
}) => {
  const { isOwnerOrAdmin, membership, token } = useAuth();
  const isEngineer = isOwnerOrAdmin || membership?.role === 'ENGINEER' || membership?.role === 'PLANT_MANAGER';

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [componentList, setComponentList] = useState<ComponentNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGeometry, setIsLoadingGeometry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unsupportedFormat, setUnsupportedFormat] = useState<UnsupportedFormatState | null>(null);
  const [modelRecord, setModelRecord] = useState<EngineeringModel3D | null>(null);
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [verifyingMappingId, setVerifyingMappingId] = useState<string | null>(null);

  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const originalMaterialsRef = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelGroupRef = useRef<THREE.Object3D | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const defaultCameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // 1. Fetch approved model record for this machine
  useEffect(() => {
    if (!isOpen || !machine) {
      setModelRecord(null);
      setIsLoading(false);
      setLoadError(null);
      setUnsupportedFormat(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    setUnsupportedFormat(null);

    const fetchModel = async () => {
      try {
        const stored = getMachineFiles(machine);
        if (stored.model3dUrl) {
          const ext = stored.model3dFile?.format?.toUpperCase() || stored.model3dFile?.name?.split('.').pop()?.toUpperCase() || 'GLB';
          if (isMounted) {
            setModelRecord({
              id: `local-${machine.id}`,
              organizationId: machine.organizationId,
              plantId: machine.plantId || 'default',
              machineId: machine.id,
              industryProfileCode: 'GENERAL',
              assetCategory: 'MACHINERY',
              title: stored.model3dFile?.name || `${machine.name} 3D Asset`,
              fileHashSha256: 'local',
              storageKey: `local/${machine.id}/model`,
              fileUrl: stored.model3dUrl,
              fileFormat: ext as any,
              fileSizeBytes: stored.model3dFile?.size || 0,
              modelRevision: '1.0',
              status: 'APPROVED',
              dataClassification: machine.dataClassification || 'CONFIDENTIAL',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            setIsLoading(false);
          }
          return;
        }

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/v1/engineering/models?machineId=${machine.id}`, { headers });
        if (!res.ok) {
          if (isMounted) {
            setModelRecord(null);
            setIsLoading(false);
          }
          return;
        }

        const json = await res.json();
        if (isMounted) {
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const approved = json.data.find((m: EngineeringModel3D) => m.status === 'APPROVED') || json.data[0];
            setModelRecord(approved);
          } else {
            setModelRecord(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to query engineering models:', err);
        if (isMounted) {
          setModelRecord(null);
          setIsLoading(false);
        }
      }
    };

    fetchModel();

    return () => {
      isMounted = false;
    };
  }, [isOpen, machine, token]);

  // 2. Setup Three.js scene and load genuine model geometry
  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container || !modelRecord) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(4, 3.5, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 50;
    controls.minDistance = 0.5;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(10, 15, 10);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.6);
    dirLight2.position.set(-10, -5, -10);
    scene.add(dirLight2);

    // Floor Grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = -1.2;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    meshesRef.current.clear();
    originalMaterialsRef.current.clear();

    // Helper to process loaded 3D model hierarchy
    const setupLoadedModel = (modelGroup: THREE.Object3D) => {
      const extractedMeshes: ComponentNode[] = [];
      let totalVertices = 0;

      modelGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          // Default fallback material if none exists
          if (!mesh.material) {
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x64748b,
              metalness: 0.5,
              roughness: 0.3,
            });
          }

          // Store clone of original material for highlight resets
          if (Array.isArray(mesh.material)) {
            originalMaterialsRef.current.set(mesh.id.toString(), mesh.material.map((m) => m.clone()));
          } else {
            originalMaterialsRef.current.set(mesh.id.toString(), mesh.material.clone());
          }

          const compId = mesh.name && mesh.name.trim() !== '' ? mesh.name : `component_${extractedMeshes.length + 1}`;
          mesh.name = compId;
          meshesRef.current.set(compId, mesh);

          const vCount = mesh.geometry?.attributes?.position?.count || 0;
          totalVertices += vCount;

          extractedMeshes.push({
            id: compId,
            name: compId,
            mesh,
            vertexCount: vCount,
          });
        }
      });

      if (extractedMeshes.length === 0) {
        setLoadError('Empty 3D model: The source file parsed successfully but contains 0 renderable 3D meshes.');
        setIsLoadingGeometry(false);
        return;
      }

      // Calculate Bounding Box and Center Model at Origin
      const box = new THREE.Box3().setFromObject(modelGroup);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      modelGroup.position.x -= center.x;
      modelGroup.position.y -= center.y;
      modelGroup.position.z -= center.z;

      scene.add(modelGroup);
      modelGroupRef.current = modelGroup;
      setComponentList(extractedMeshes);

      // Auto-frame Camera
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraDist = Math.abs((maxDim / 2) / Math.tan(fov / 2));
      cameraDist = Math.max(cameraDist * 1.8, 2.5);

      const defaultPos = new THREE.Vector3(cameraDist * 0.7, cameraDist * 0.5, cameraDist * 0.9);
      const defaultTarget = new THREE.Vector3(0, 0, 0);

      camera.position.copy(defaultPos);
      camera.lookAt(defaultTarget);
      controls.target.copy(defaultTarget);
      controls.maxDistance = cameraDist * 6;
      controls.minDistance = Math.max(cameraDist * 0.15, 0.2);
      controls.update();

      defaultCameraStateRef.current = {
        position: defaultPos.clone(),
        target: defaultTarget.clone(),
      };

      gridHelper.position.y = -size.y / 2 - 0.05;

      setModelStats({
        vertexCount: totalVertices,
        meshCount: extractedMeshes.length,
        dimensions: `${size.x.toFixed(2)}m × ${size.y.toFixed(2)}m × ${size.z.toFixed(2)}m`,
      });

      setIsLoadingGeometry(false);
    };

    // Raycaster for click selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleCanvasClick = (e: MouseEvent) => {
      if (!modelGroupRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(modelGroupRef.current.children, true);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        if (hit && hit.name) {
          setSelectedComponentId(hit.name);
        }
      }
    };

    renderer.domElement.addEventListener('click', handleCanvasClick);

    // Animation Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 3. Fetch model binary stream from backend
    setIsLoadingGeometry(true);
    setLoadError(null);
    setUnsupportedFormat(null);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`/api/v1/engineering/models/${modelRecord.id}/content`, { headers })
      .then(async (res) => {
        if (res.status === 422) {
          const errData = await res.json();
          setUnsupportedFormat({
            format: modelRecord.fileFormat,
            message: errData.error?.message || 'B-Rep CAD format requires native conversion to GLB.',
            downloadUrl: errData.error?.downloadUrl,
          });
          setIsLoadingGeometry(false);
          return null;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          setLoadError(errData.error?.message || 'Failed to download 3D model content.');
          setIsLoadingGeometry(false);
          return null;
        }

        return res.arrayBuffer();
      })
      .then((arrayBuffer) => {
        if (!arrayBuffer) return;

        if (arrayBuffer.byteLength === 0) {
          setLoadError('3D model file is empty (0 bytes).');
          setIsLoadingGeometry(false);
          return;
        }

        const format = modelRecord.fileFormat.toUpperCase();

        if (format === 'GLB' || format === 'GLTF') {
          const gltfLoader = new GLTFLoader();
          gltfLoader.parse(
            arrayBuffer,
            '',
            (gltf) => {
              setupLoadedModel(gltf.scene);
            },
            (err) => {
              console.error('GLTF parse error:', err);
              setLoadError(`Failed to parse 3D glTF/GLB model: ${err.message || 'Corrupted file'}`);
              setIsLoadingGeometry(false);
            }
          );
        } else if (format === 'STL') {
          try {
            const stlLoader = new STLLoader();
            const geometry = stlLoader.parse(arrayBuffer);
            const material = new THREE.MeshStandardMaterial({
              color: 0x38bdf8,
              metalness: 0.6,
              roughness: 0.3,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = modelRecord.title;
            const group = new THREE.Group();
            group.add(mesh);
            setupLoadedModel(group);
          } catch (err: any) {
            console.error('STL parse error:', err);
            setLoadError(`Failed to parse STL geometry: ${err.message || 'Corrupted STL file'}`);
            setIsLoadingGeometry(false);
          }
        } else if (format === 'OBJ') {
          try {
            const objLoader = new OBJLoader();
            const text = new TextDecoder().decode(arrayBuffer);
            const objGroup = objLoader.parse(text);
            setupLoadedModel(objGroup);
          } catch (err: any) {
            console.error('OBJ parse error:', err);
            setLoadError(`Failed to parse Wavefront OBJ geometry: ${err.message || 'Corrupted OBJ file'}`);
            setIsLoadingGeometry(false);
          }
        } else {
          setUnsupportedFormat({
            format: modelRecord.fileFormat,
            message: `Format '${modelRecord.fileFormat}' cannot be rendered directly in browser. Download original CAD file for desktop CAD tools.`,
            downloadUrl: `/api/v1/engineering/models/${modelRecord.id}/download`,
          });
          setIsLoadingGeometry(false);
        }
      })
      .catch((err) => {
        console.error('Error loading model content:', err);
        setLoadError(`Network error while loading 3D model: ${err.message}`);
        setIsLoadingGeometry(false);
      });

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      renderer.dispose();
    };
  }, [modelRecord, token]);

  useEffect(() => {
    if (isOpen && modelRecord) {
      const cleanup = initScene();
      return cleanup;
    }
  }, [isOpen, modelRecord, initScene]);

  // Handle Wireframe toggle
  useEffect(() => {
    meshesRef.current.forEach((mesh) => {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => {
          if ('wireframe' in m) m.wireframe = wireframe;
        });
      } else if (mesh.material && 'wireframe' in mesh.material) {
        (mesh.material as THREE.MeshStandardMaterial).wireframe = wireframe;
      }
    });
  }, [wireframe]);

  // Highlight selected component in 3D viewport
  useEffect(() => {
    meshesRef.current.forEach((mesh, compId) => {
      const isSelected = selectedComponentId === compId;
      const orig = originalMaterialsRef.current.get(mesh.id.toString());

      if (isSelected) {
        if (!Array.isArray(mesh.material)) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.emissive = new THREE.Color(0x2563eb);
          mat.emissiveIntensity = 0.45;
        }
      } else if (orig) {
        // Reset to original material appearance
        if (!Array.isArray(mesh.material) && !Array.isArray(orig)) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const origMat = orig as THREE.MeshStandardMaterial;
          mat.emissive = origMat.emissive ? origMat.emissive.clone() : new THREE.Color(0x000000);
          mat.emissiveIntensity = origMat.emissiveIntensity ?? 0;
        }
      }
    });
  }, [selectedComponentId]);

  // Viewport Control Handlers
  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current && defaultCameraStateRef.current) {
      cameraRef.current.position.copy(defaultCameraStateRef.current.position);
      controlsRef.current.target.copy(defaultCameraStateRef.current.target);
      controlsRef.current.update();
    }
  };

  const handleFitToView = () => {
    if (cameraRef.current && controlsRef.current && modelGroupRef.current) {
      const box = new THREE.Box3().setFromObject(modelGroupRef.current);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = cameraRef.current.fov * (Math.PI / 180);
      let cameraDist = Math.abs((maxDim / 2) / Math.tan(fov / 2));
      cameraDist = Math.max(cameraDist * 1.8, 2.5);

      cameraRef.current.position.set(cameraDist * 0.7, cameraDist * 0.5, cameraDist * 0.9);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const handleVerifyCrossLink = async (mappingId: string) => {
    if (!token || !machine) return;
    try {
      setVerifyingMappingId(mappingId);
      const res = await fetch(`/api/v1/machines/${machine.id}/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'VERIFIED' }),
      });

      if (res.ok) {
        onMappingVerified?.();
      }
    } catch (err) {
      console.error('Failed to verify mapping:', err);
    } finally {
      setVerifyingMappingId(null);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !machine) return;
    setIsUploading(true);
    try {
      const attached = await attachFileToMachine(machine.id, machine.assetTag, '3d', file);
      const url = attached.url;
      const ext = file.name.split('.').pop()?.toLowerCase();
      const updatedMachine: Machine = {
        ...machine,
        hasModel3d: true,
        model3dFormat: ext as any,
        model3dFile: { name: file.name, size: file.size, type: file.type },
        model3dUrl: url,
      };
      onMachineUpdated?.(updatedMachine);
      setModelRecord({
        id: `local-${machine.id}`,
        organizationId: machine.organizationId,
        plantId: machine.plantId || 'default',
        machineId: machine.id,
        industryProfileCode: 'GENERAL',
        assetCategory: 'MACHINERY',
        title: file.name,
        fileHashSha256: 'local',
        storageKey: `local/${machine.id}/model`,
        fileUrl: url,
        fileFormat: (ext?.toUpperCase() || 'GLB') as any,
        fileSizeBytes: file.size,
        modelRevision: '1.0',
        status: 'APPROVED',
        dataClassification: machine.dataClassification || 'CONFIDENTIAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to attach 3D model:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen || !machine) return null;

  const selectedMapping = mappings.find(
    (m) => m.componentId === selectedComponentId || m.componentName.toLowerCase().includes(selectedComponentId || '')
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="viewer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-5xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-2.5">
            <BoxSelect className="w-5 h-5 text-[#2563EB]" />
            <div>
              <div id="viewer-title" className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                Genuine 3D CAD Engineering Viewer • {machine.assetTag}
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                {modelRecord ? `${modelRecord.title} (${modelRecord.fileFormat})` : 'Authorized Model Verification Check'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#2563EB] border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
              title="Upload or Replace 3D CAD Model"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : modelRecord ? 'Replace 3D Model' : 'Attach 3D Model'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-slate-100 transition"
              aria-label="Close 3D viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept=".glb,.gltf,.step,.stp,.stl,.obj"
          style={{ display: 'none' }}
          onChange={handleUploadFile}
        />

        {/* Body Container */}
        {isLoading ? (
          <div className="h-[520px] flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] text-[#64748B]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
            <div className="text-xs font-mono">Verifying Authorized 3D CAD Artifacts for {machine.assetTag}...</div>
          </div>
        ) : !modelRecord ? (
          /* Honest Missing-Model State */
          <div className="h-[520px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="max-w-lg space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                No Authorized 3D CAD Model Registered
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                ForgeX AI strictly prohibits generating speculative 3D meshes, decorative block substitutes, or unrelated stock CAD models for real industrial equipment.
              </p>
            </div>

            {/* Asset Metadata Ledger Card */}
            <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-4 text-left text-xs font-sans space-y-2 shadow-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Asset Tag:</span>
                <span className="font-bold text-[#1A202C] font-mono">{machine.assetTag}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Equipment:</span>
                <span className="text-[#1A202C]">{machine.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Manufacturer / Model:</span>
                <span className="text-[#1A202C]">
                  {machine.manufacturer || 'Unknown'} / {machine.modelNumber || 'Legacy'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-mono">3D CAD Readiness:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  NOT_ON_FILE
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Attaching CAD Model...' : 'Upload 3D CAD Model (GLB / OBJ / STL)'}</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-medium transition shadow-sm"
              >
                Close Viewer
              </button>
            </div>
          </div>
        ) : unsupportedFormat ? (
          /* Honest Unsupported Format Banner (e.g. raw STEP/IGES without GLB conversion) */
          <div className="h-[520px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Info className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                B-Rep CAD Format: {unsupportedFormat.format}
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {unsupportedFormat.message}
              </p>
            </div>

            <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-4 text-left text-xs font-sans space-y-2 shadow-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Registered Asset:</span>
                <span className="font-bold text-[#1A202C]">{modelRecord.title}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">Format:</span>
                <span className="font-bold font-mono text-[#2563EB]">{modelRecord.fileFormat}</span>
              </div>
              <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                <span className="text-[#64748B] font-mono">File Size:</span>
                <span className="font-mono text-[#1A202C]">{(modelRecord.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] font-mono">Web 3D Viewer Status:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  CONVERSION_REQUIRED
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <a
                href={`/api/v1/engineering/models/${modelRecord.id}/download`}
                download
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#151C24] hover:bg-black text-white text-xs font-semibold transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download Original CAD File ({modelRecord.fileFormat})
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-medium transition shadow-sm"
              >
                Close Viewer
              </button>
            </div>
          </div>
        ) : loadError ? (
          /* Honest Failed-to-Load State */
          <div className="h-[520px] flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="max-w-md space-y-2">
              <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
                3D CAD Geometry Load Error
              </h3>
              <p className="text-xs text-rose-700 font-mono bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
                {loadError}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => initScene()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Loading
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-medium transition shadow-sm"
              >
                Close Viewer
              </button>
            </div>
          </div>
        ) : (
          /* Real Three.js Viewport & Component Cross-Linking */
          <div className="flex flex-col md:flex-row h-[550px] w-full bg-[#F5F6F7] overflow-hidden">
            {/* Viewport Canvas */}
            <div className="relative flex-1 h-full overflow-hidden flex flex-col bg-[#F1F5F9]">
              {/* Overlay Controls */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#CBD5E1] shadow-sm">
                <span className="text-[11px] font-mono font-bold text-[#1A202C] uppercase">{machine.assetTag}</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">
                  {modelRecord.fileFormat} GEOMETRY
                </span>
                {modelStats && (
                  <span className="text-[10px] font-mono text-[#64748B] hidden sm:inline">
                    {modelStats.dimensions}
                  </span>
                )}
              </div>

              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#CBD5E1] shadow-sm">
                <button
                  onClick={handleFitToView}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1A202C] text-xs transition"
                  title="Fit Model to Viewport"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setWireframe(!wireframe)}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    wireframe ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-[#64748B] hover:text-[#1A202C]'
                  }`}
                  title="Toggle Wireframe Mode"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleResetCamera}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1A202C] text-xs transition"
                  title="Reset Camera View"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Three.js Container */}
              <div ref={containerRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative">
                {isLoadingGeometry && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                    <span className="text-xs font-mono text-[#64748B]">Streaming 3D CAD Geometry...</span>
                  </div>
                )}
              </div>

              {/* Viewport Footer */}
              <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-[11px] text-[#64748B]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Orbit: Left Click • Pan: Right Click • Zoom: Wheel</span>
                </div>
                <div className="font-mono text-[10px] flex items-center gap-3">
                  <span>Components: {componentList.length}</span>
                  {modelStats && <span>Vertices: {modelStats.vertexCount.toLocaleString()}</span>}
                </div>
              </div>
            </div>

            {/* Right Side: Component Hierarchy & Verified Cross-Linking */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#E2E8F0] bg-white flex flex-col justify-between overflow-hidden">
              <div className="p-3.5 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#2563EB]" />
                  <span className="text-xs font-mono font-bold text-[#1A202C] uppercase tracking-wider">
                    Assembly Hierarchy
                  </span>
                </div>
                <p className="text-[10px] text-[#64748B] mt-0.5">Click components in viewport or select below</p>
              </div>

              {/* Hierarchy List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {componentList.map((comp) => {
                  const isSelected = selectedComponentId === comp.id;
                  const mapping = mappings.find(
                    (m) => m.componentId === comp.id || m.componentName.toLowerCase().includes(comp.id.toLowerCase())
                  );

                  return (
                    <button
                      key={comp.id}
                      onClick={() => setSelectedComponentId(comp.id)}
                      className={`w-full text-left p-2 rounded-xl text-xs font-mono transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-50 text-[#2563EB] border border-blue-200'
                          : 'text-[#1A202C] hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium truncate">{comp.name}</div>
                        {comp.vertexCount !== undefined && (
                          <div className="text-[9px] text-[#94A3B8] font-normal">{comp.vertexCount} vertices</div>
                        )}
                      </div>
                      {mapping && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            mapping.status === 'VERIFIED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {mapping.pidTag}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected Component Inspection & Verified Cross-Link */}
              <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                {selectedComponentId ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Selected Node</div>
                      <div className="text-xs font-bold text-[#1A202C] mt-0.5">
                        {componentList.find((c) => c.id === selectedComponentId)?.name}
                      </div>
                    </div>

                    {selectedMapping ? (
                      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-2.5 text-xs shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">P&ID Drawing Tag:</span>
                          <span className="font-mono font-bold text-[#2563EB]">{selectedMapping.pidTag}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#64748B] text-[11px]">Cross-Link Status:</span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              selectedMapping.status === 'VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {selectedMapping.status}
                          </span>
                        </div>

                        {selectedMapping.status === 'SUGGESTED' && (
                          <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-800 leading-tight">
                            AI suggestions must not be marked confirmed without an authorized engineering review.
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="pt-2 border-t border-[#E2E8F0] flex flex-col gap-1.5">
                          {onOpenPid && (
                            <button
                              onClick={() => onOpenPid(selectedMapping.pidTag)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-medium transition"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              View on P&ID ({selectedMapping.pidTag})
                            </button>
                          )}

                          {selectedMapping.manualPageNumber && onOpenManual && (
                            <button
                              onClick={() => onOpenManual(selectedMapping.manualPageNumber!)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-medium transition"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Open Manual Page {selectedMapping.manualPageNumber}
                            </button>
                          )}

                          {isEngineer && selectedMapping.status === 'SUGGESTED' && (
                            <button
                              disabled={verifyingMappingId === selectedMapping.id}
                              onClick={() => handleVerifyCrossLink(selectedMapping.id)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[#151C24] text-white hover:bg-black text-[11px] font-bold transition shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {verifyingMappingId === selectedMapping.id ? 'Verifying...' : 'Approve & Confirm Cross-Link'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#64748B] italic flex items-center gap-1.5 bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        No explicit P&ID mapping configured for this 3D component.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-[#64748B]">
                    Click a component in the 3D viewport to inspect engineering cross-links.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RealThreeDViewerModal;

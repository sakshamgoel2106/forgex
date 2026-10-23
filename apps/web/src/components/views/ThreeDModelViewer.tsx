import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { AlertTriangle, RefreshCw, AlertCircle } from 'lucide-react';

export interface ThreeDModelViewerProps {
  fileUrl: string;
  fileFormat?: string;
  wireframe?: boolean;
  selectedComponentId?: string | null;
  onSelectComponent?: (componentId: string | null) => void;
  onModelStats?: (stats: { vertexCount: number; meshCount: number; dimensions: string }) => void;
  onComponentList?: (components: Array<{ id: string; name: string; vertexCount: number }>) => void;
  onRetry?: () => void;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Handles WebGL context and resource disposal on unmount to prevent GPU memory leaks
 */
const WebGLContextDisposer: React.FC = () => {
  const { gl } = useThree();

  useEffect(() => {
    return () => {
      try {
        gl.dispose();
        const extension = gl.getContext()?.getExtension('WEBGL_lose_context');
        if (extension) {
          extension.loseContext();
        }
      } catch (err) {
        console.warn('WebGL cleanup notice:', err);
      }
    };
  }, [gl]);

  return null;
};

/**
 * Loading fallback rendered inside WebGL Canvas via Html overlay
 */
const CanvasLoadingSpinner: React.FC = () => (
  <Html center>
    <div className="flex flex-col items-center justify-center gap-2.5 bg-white/95 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-slate-200 shadow-xl select-none min-w-[200px]">
      <RefreshCw className="w-5 h-5 animate-spin text-[#2563EB]" />
      <span className="text-xs font-mono font-bold text-slate-800">Streaming 3D Twin...</span>
      <span className="text-[10px] font-mono text-slate-500">Loading GLTF / GLB Geometry</span>
    </div>
  </Html>
);

/**
 * Error boundary catching CORS, network, or malformed GLB asset errors
 */
class CadErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CadErrorBoundary caught 3D render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message?.toLowerCase() || '';
      const isCors =
        msg.includes('cors') ||
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('access-control') ||
        msg.includes('failed to fetch');

      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">
              {isCors ? 'Storage Bucket CORS / Network Notice' : '3D CAD Model Stream Error'}
            </h3>
            <p className="text-xs text-rose-700 font-mono bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
              {isCors
                ? 'Unable to stream 3D model due to storage bucket CORS policy or network restrictions. Please ensure the Supabase Storage bucket allows cross-origin requests from this web application origin.'
                : this.state.error?.message || 'Failed to render 3D CAD model.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRetry?.();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Connection</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Three.js model component that dynamically consumes useGLTF from @react-three/drei
 */
const DynamicModelPrimitive: React.FC<{
  url: string;
  wireframe?: boolean;
  selectedComponentId?: string | null;
  onSelectComponent?: (componentId: string | null) => void;
  onModelStats?: (stats: { vertexCount: number; meshCount: number; dimensions: string }) => void;
  onComponentList?: (components: Array<{ id: string; name: string; vertexCount: number }>) => void;
}> = ({
  url,
  wireframe,
  selectedComponentId,
  onSelectComponent,
  onModelStats,
  onComponentList,
}) => {
  const { scene } = useGLTF(url);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // Center model and compute statistics
  useEffect(() => {
    let totalVertices = 0;
    const components: Array<{ id: string; name: string; vertexCount: number }> = [];

    clonedScene.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const vCount = child.geometry?.attributes?.position?.count || 0;
        totalVertices += vCount;
        const compId = child.name && child.name.trim() !== '' ? child.name : `component_${components.length + 1}`;
        child.name = compId;
        components.push({ id: compId, name: compId, vertexCount: vCount });

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => {
              if ('wireframe' in m) m.wireframe = !!wireframe;
            });
          } else if ('wireframe' in child.material) {
            child.material.wireframe = !!wireframe;
          }
        }
      }
    });

    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    clonedScene.position.x = -center.x;
    clonedScene.position.y = -center.y;
    clonedScene.position.z = -center.z;

    onModelStats?.({
      vertexCount: totalVertices,
      meshCount: components.length,
      dimensions: `${size.x.toFixed(2)}m × ${size.y.toFixed(2)}m × ${size.z.toFixed(2)}m`,
    });
    onComponentList?.(components);
  }, [clonedScene, wireframe, onModelStats, onComponentList]);

  // Visual highlight for selected component
  useEffect(() => {
    clonedScene.traverse((child: any) => {
      if (child.isMesh) {
        const isSelected =
          Boolean(selectedComponentId) &&
          (child.name === selectedComponentId || child.uuid === selectedComponentId);

        if (child.material && !Array.isArray(child.material)) {
          if (isSelected) {
            child.material.emissive = new THREE.Color(0x2563eb);
            child.material.emissiveIntensity = 0.55;
          } else if (child.material.emissive) {
            child.material.emissive.set(0x000000);
            child.material.emissiveIntensity = 0;
          }
        }
      }
    });
  }, [clonedScene, selectedComponentId]);

  // CRITICAL MEMORY MANAGEMENT: Geometries, Materials, and useGLTF cache disposal
  useEffect(() => {
    return () => {
      clonedScene.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: any) => mat?.dispose?.());
          } else if (child.material) {
            child.material?.dispose?.();
          }
        }
      });
      // Purge cached GLTF entry to free browser heap
      useGLTF.clear(url);
    };
  }, [url, clonedScene]);

  return (
    <primitive
      object={clonedScene}
      onClick={(e: any) => {
        e.stopPropagation();
        if (e.object?.name) {
          onSelectComponent?.(e.object.name);
        }
      }}
    />
  );
};

/**
 * 3D CAD Engineering Viewer Component
 * Renders WebGL <Canvas>, <OrbitControls>, <Environment preset="city" />, and <Suspense>
 */
export const ThreeDModelViewer: React.FC<ThreeDModelViewerProps> = ({
  fileUrl,
  fileFormat,
  wireframe = false,
  selectedComponentId,
  onSelectComponent,
  onModelStats,
  onComponentList,
  onRetry,
}) => {
  const [retryKey, setRetryKey] = useState(0);

  // Check if file is an unsupported raw STEP/STP format
  const isStepFormat = useMemo(() => {
    const cleanUrl = fileUrl.toLowerCase().split('?')[0];
    const fmt = fileFormat?.toUpperCase() || '';
    return (
      cleanUrl.endsWith('.step') ||
      cleanUrl.endsWith('.stp') ||
      fmt === 'STEP' ||
      fmt === 'STP'
    );
  }, [fileUrl, fileFormat]);

  // Format Fallback: If .step or .stp, DO NOT mount Canvas
  if (isStepFormat) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-[#F8FAFC] text-center space-y-4 select-none">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-sm font-bold text-[#1A202C] font-mono uppercase tracking-wider">
            Unsupported CAD Format
          </h3>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Unsupported CAD format for web rendering. Please upload a .glb file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#F1F5F9] overflow-hidden select-none">
      <CadErrorBoundary
        key={retryKey}
        onRetry={() => {
          setRetryKey((k) => k + 1);
          onRetry?.();
        }}
      >
        <Canvas
          camera={{ position: [4, 3.5, 5], fov: 45 }}
          shadows
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          className="w-full h-full"
        >
          {/* Memory Management Disposer */}
          <WebGLContextDisposer />

          {/* Background and Scene Lighting */}
          <color attach="background" args={['#f1f5f9']} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow />
          <directionalLight position={[-10, -5, -10]} intensity={0.5} />
          <gridHelper args={[10, 20, 0x94a3b8, 0xe2e8f0]} position={[0, -1.2, 0]} />

          {/* Realistic City Environment preset */}
          <Environment preset="city" />

          {/* Suspense wrapper with custom loading spinner */}
          <Suspense fallback={<CanvasLoadingSpinner />}>
            <DynamicModelPrimitive
              url={fileUrl}
              wireframe={wireframe}
              selectedComponentId={selectedComponentId}
              onSelectComponent={onSelectComponent}
              onModelStats={onModelStats}
              onComponentList={onComponentList}
            />
          </Suspense>

          {/* Orbit Controls for fluid panning, zooming, and rotation */}
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            maxDistance={50}
            minDistance={0.5}
          />
        </Canvas>
      </CadErrorBoundary>
    </div>
  );
};

export default ThreeDModelViewer;

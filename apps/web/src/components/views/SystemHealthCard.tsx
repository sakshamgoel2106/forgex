import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Cpu,
  Database,
  Layers,
  HardDrive,
  Workflow,
  ShieldCheck,
  Server,
} from 'lucide-react';

export interface DependencyHealth {
  healthy: boolean;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  timestamp: string;
  deploymentMode: 'saas' | 'enterprise';
  airGapped: boolean;
  dependencies: {
    llm: {
      provider: string;
      status: string;
      healthy: boolean;
      latencyMs: number;
      details?: Record<string, unknown>;
    };
    vectorDb: {
      provider: string;
      status: string;
      healthy: boolean;
      latencyMs: number;
      dimensions?: number;
      message?: string;
    };
    storage: {
      provider: string;
      status: string;
      healthy: boolean;
      bucket: string;
      latencyMs: number;
      message?: string;
    };
    database: {
      type: string;
      status: string;
      healthy: boolean;
      latencyMs: number;
      message?: string;
    };
    worker: {
      status: string;
      healthy: boolean;
      active: boolean;
      latencyMs: number;
      message?: string;
    };
  };
}

export const SystemHealthCard: React.FC = () => {
  const { token, organization, isOwnerOrAdmin } = useAuth();
  const [data, setData] = useState<DependencyHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchHealth = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health/dependencies', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization?.id || '',
        },
      });

      if (!res.ok) {
        throw new Error(`Health check returned HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to query dependency health');
    } finally {
      setLoading(false);
    }
  }, [token, organization?.id]);

  useEffect(() => {
    fetchHealth();
    // Auto refresh every 30 seconds
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  // Restrict to admins / owners in Enterprise mode
  if (!isOwnerOrAdmin) return null;

  const renderStatusBadge = (healthy: boolean, status: string) => {
    if (healthy) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {status}
        </span>
      );
    }
    if (status === 'DEGRADED' || status.includes('FALLBACK')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-50 text-red-800 border border-red-200">
        <XCircle className="w-3 h-3 text-red-600" />
        {status}
      </span>
    );
  };

  return (
    <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-sm p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-600" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900 tracking-tight">System Health & Air-Gap Telemetry</h2>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                LIVE
              </span>
              {data?.airGapped && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                  <ShieldCheck className="w-3 h-3 text-blue-600" />
                  AIR-GAPPED: 0 EGRESS
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Live status across LLM inference, vector database, object storage, workers, and relational database.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-gray-400">
            Updated: {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded shadow-xs transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>Dependency probe error: {error}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          {/* 1. LLM Provider */}
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-gray-800">LLM Inference</span>
                </div>
                {renderStatusBadge(
                  data?.dependencies?.llm?.healthy ?? false,
                  data?.dependencies?.llm?.status || 'CHECKING'
                )}
              </div>
              <div className="text-xs font-mono font-medium text-gray-900 truncate">
                {data?.dependencies?.llm?.provider || 'Detecting...'}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                {typeof data?.dependencies?.llm?.details?.chatModel === 'string'
                  ? data.dependencies.llm.details.chatModel
                  : 'On-premise execution'}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono text-gray-400 flex items-center justify-between pt-1 border-t border-gray-200/60">
              <span>Latency</span>
              <span>{data?.dependencies?.llm?.latencyMs ?? 0}ms</span>
            </div>
          </div>

          {/* 2. Vector DB */}
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-violet-600" />
                  <span className="text-xs font-semibold text-gray-800">Vector DB</span>
                </div>
                {renderStatusBadge(
                  data?.dependencies?.vectorDb?.healthy ?? false,
                  data?.dependencies?.vectorDb?.status || 'CHECKING'
                )}
              </div>
              <div className="text-xs font-mono font-medium text-gray-900 truncate">
                {data?.dependencies?.vectorDb?.provider || 'Qdrant'}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                {data?.dependencies?.vectorDb?.dimensions
                  ? `${data.dependencies.vectorDb.dimensions} dims`
                  : 'Auto-dimensioning'}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono text-gray-400 flex items-center justify-between pt-1 border-t border-gray-200/60">
              <span>Latency</span>
              <span>{data?.dependencies?.vectorDb?.latencyMs ?? 0}ms</span>
            </div>
          </div>

          {/* 3. Object Storage */}
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-gray-800">Object Storage</span>
                </div>
                {renderStatusBadge(
                  data?.dependencies?.storage?.healthy ?? false,
                  data?.dependencies?.storage?.status || 'CHECKING'
                )}
              </div>
              <div className="text-xs font-mono font-medium text-gray-900 truncate">
                {data?.dependencies?.storage?.provider?.toUpperCase() || 'MINIO'}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                Bucket: {data?.dependencies?.storage?.bucket || 'documents'}
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono text-gray-400 flex items-center justify-between pt-1 border-t border-gray-200/60">
              <span>Latency</span>
              <span>{data?.dependencies?.storage?.latencyMs ?? 0}ms</span>
            </div>
          </div>

          {/* 4. Primary Database */}
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-800">Primary Database</span>
                </div>
                {renderStatusBadge(
                  data?.dependencies?.database?.healthy ?? false,
                  data?.dependencies?.database?.status || 'CHECKING'
                )}
              </div>
              <div className="text-xs font-mono font-medium text-gray-900 truncate">
                {data?.dependencies?.database?.type?.toUpperCase() || 'POSTGRES'}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                Relational & RBAC Store
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono text-gray-400 flex items-center justify-between pt-1 border-t border-gray-200/60">
              <span>Latency</span>
              <span>{data?.dependencies?.database?.latencyMs ?? 0}ms</span>
            </div>
          </div>

          {/* 5. Ingestion Worker */}
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Workflow className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-gray-800">Worker Relay</span>
                </div>
                {renderStatusBadge(
                  data?.dependencies?.worker?.healthy ?? false,
                  data?.dependencies?.worker?.status || 'CHECKING'
                )}
              </div>
              <div className="text-xs font-mono font-medium text-gray-900 truncate">
                Ingestion & Outbox
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                Async Document Pipeline
              </div>
            </div>
            <div className="mt-2 text-[10px] font-mono text-gray-400 flex items-center justify-between pt-1 border-t border-gray-200/60">
              <span>Status</span>
              <span>{data?.dependencies?.worker?.status || 'RUNNING'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

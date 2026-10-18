import React, { useEffect, useState } from 'react';
import {
  Activity,
  Database,
  Layers,
  HardDrive,
  Cpu,
  RefreshCw,
  AlertTriangle,
  Server,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import type { HealthCheckResponse } from '@forgex/shared-types';

export const SystemHealthView: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/health');
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }
      const data: HealthCheckResponse = await res.json();
      setHealthData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend offline or unreachable');
      // Fallback baseline for visual presentation if API server is not running during standalone web dev
      setHealthData({
        status: 'HEALTHY',
        version: '0.1.0',
        uptimeSeconds: 3600,
        timestamp: new Date().toISOString(),
        environment: 'development',
        checks: {
          database: {
            status: 'UP',
            message: 'PostgreSQL connection pool ready on port 5432',
          },
          vectorStore: {
            status: 'UP',
            message: 'Qdrant vector cluster ready at http://localhost:6333',
          },
          objectStorage: {
            status: 'UP',
            message: 'MinIO S3 storage adapter mounted [forgex-documents]',
          },
          redis: {
            status: 'UP',
            message: 'Redis 7 asynchronous task broker online on port 6379',
          },
          inferenceProvider: {
            status: 'UP',
            message: 'Local Ollama runtime active (Model: llama3.2)',
          },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-graphite-950 space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-graphite-800">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold font-mono text-graphite-100 uppercase">
              Subsystem Diagnostic & Health Monitor
            </h2>
          </div>
          <p className="text-xs text-graphite-400 mt-1 font-mono">
            Direct telemetry polling from ForgeX AI Core API (/api/v1/health)
          </p>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-3.5 py-1.5 rounded bg-graphite-850 hover:bg-graphite-800 border border-graphite-700 text-xs font-mono font-medium text-graphite-200 flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${loading ? 'animate-spin' : ''}`} />
          Probe Health
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-amber-950/40 border border-amber-800 text-amber-300 font-mono text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>API Notice: {error} (Displaying local baseline telemetry)</span>
        </div>
      )}

      {/* Primary KPI Cards */}
      {healthData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-1">
            <div className="text-[10px] font-mono text-graphite-500 uppercase">OVERALL SYSTEM</div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold font-mono text-graphite-100">
                {healthData.status}
              </span>
              <StatusBadge
                label={healthData.status}
                tone={healthData.status === 'HEALTHY' ? 'healthy' : 'warning'}
                pulse
              />
            </div>
          </div>

          <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-1">
            <div className="text-[10px] font-mono text-graphite-500 uppercase">VERSION</div>
            <div className="text-sm font-bold font-mono text-amber-400">
              v{healthData.version}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-1">
            <div className="text-[10px] font-mono text-graphite-500 uppercase">ENVIRONMENT</div>
            <div className="text-sm font-bold font-mono text-cyan-400 uppercase">
              {healthData.environment}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-1">
            <div className="text-[10px] font-mono text-graphite-500 uppercase">UPTIME</div>
            <div className="text-sm font-bold font-mono text-graphite-200">
              {healthData.uptimeSeconds}s
            </div>
          </div>
        </div>
      )}

      {/* Subsystem Grid */}
      {healthData && (
        <div className="space-y-3">
          <div className="text-xs font-mono font-semibold uppercase text-graphite-400">
            Registered Subsystems & Interfaces
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PostgreSQL */}
            <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-graphite-100">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span>PostgreSQL Relational Store</span>
                </div>
                <StatusBadge label={healthData.checks.database.status} tone="healthy" />
              </div>
              <p className="text-xs text-graphite-400 font-mono">
                {healthData.checks.database.message}
              </p>
            </div>

            {/* Qdrant */}
            <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-graphite-100">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Qdrant Multimodal Vector Store</span>
                </div>
                <StatusBadge label={healthData.checks.vectorStore.status} tone="healthy" />
              </div>
              <p className="text-xs text-graphite-400 font-mono">
                {healthData.checks.vectorStore.message}
              </p>
            </div>

            {/* Object Storage */}
            <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-graphite-100">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>S3-Compatible Object Storage</span>
                </div>
                <StatusBadge label={healthData.checks.objectStorage.status} tone="healthy" />
              </div>
              <p className="text-xs text-graphite-400 font-mono">
                {healthData.checks.objectStorage.message}
              </p>
            </div>

            {/* Redis Task Broker */}
            <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-graphite-100">
                  <Server className="w-4 h-4 text-rose-400" />
                  <span>Redis 7 Task Broker & Queue</span>
                </div>
                <StatusBadge label={healthData.checks.redis?.status || 'UP'} tone="healthy" />
              </div>
              <p className="text-xs text-graphite-400 font-mono">
                {healthData.checks.redis?.message || 'BullMQ queue broker active on port 6379'}
              </p>
            </div>

            {/* Inference Engine */}
            <div className="p-4 rounded-lg bg-graphite-900 border border-graphite-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-graphite-100">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span>Enterprise Inference Engine</span>
                </div>
                <StatusBadge label={healthData.checks.inferenceProvider.status} tone="healthy" />
              </div>
              <p className="text-xs text-graphite-400 font-mono">
                {healthData.checks.inferenceProvider.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

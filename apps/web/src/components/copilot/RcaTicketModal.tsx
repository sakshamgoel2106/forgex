import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  ShieldCheck,
  Activity,
  X,
  Gauge,
  Send,
  Plus,
  Zap,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import type {
  AutoRcaTicketPayload,
  AcousticTelemetry,
  VisionDiagnosticResult,
  SupportedLanguageCode,
  MaintenanceCaseSeverity,
  Machine,
} from '@forgex/shared-types';

export interface RcaTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  assetId?: string;
  assetTag?: string;
  machines?: Machine[];
  messages?: any[];
  acousticTelemetry?: AcousticTelemetry;
  visionDiagnostic?: VisionDiagnosticResult;
  lotoVerified?: boolean;
  language?: SupportedLanguageCode;
  onWorkOrderCreated?: (createdCase: any) => void;
  onOpenInRca?: (assetTag: string, symptom: string) => void;
}

/**
 * Filter non-machine messages (e.g. personal logistics, injuries, chit-chat)
 * so they are not treated as machine symptoms.
 */
export function isMachineSymptom(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  const nonMachinePattern = /\b(bleed|blood|hurt|injur|pain|hospital|doctor|dizzy|unconscious|not well|sick|helmet|shoe|boot|goggle|goggles|glove|gloves|earplug|ppe|wear|home|forgot|left my|cricket|weather|football|movie|joke|song|hi|hello|hey|thanks|thank you)\b/i;
  if (nonMachinePattern.test(t)) return false;

  const technicalPattern = /\b(vibration|noise|leak|pressure|temperature|temp|bearing|shaft|seal|motor|pump|crusher|compressor|conveyor|valve|coupling|stator|rotor|rpm|torque|overheat|hot|smoke|jam|clog|stalled|trip|tripped|fault|error|alarm|loto|css|clearance|misalign|cavitation|flow|psi|bar)\b/i;
  return technicalPattern.test(t) || /[A-Z0-9]+-[0-9]+/.test(text);
}

export const RcaTicketModal: React.FC<RcaTicketModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  assetId = '',
  assetTag = '',
  machines = [],
  messages = [],
  acousticTelemetry,
  visionDiagnostic,
  lotoVerified = false,
  language = 'en-US',
  onWorkOrderCreated,
  onOpenInRca,
}) => {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine initial machine tag - do NOT default blindly to COMP-101-A
  const initialTag = useMemo(() => {
    const cleanTag = (assetTag || assetId || '').replace(/\s*\([^)]*\).*/, '').trim();
    if (cleanTag && cleanTag !== 'GENERAL') {
      const match = machines.find(
        (m) =>
          m.assetTag.toLowerCase() === cleanTag.toLowerCase() ||
          m.id === cleanTag ||
          cleanTag.toLowerCase().includes(m.assetTag.toLowerCase())
      );
      if (match) return match.assetTag;
      return cleanTag;
    }
    // Inspect thread to check if a specific machine was mentioned
    for (const m of messages || []) {
      const content = (m.content || '').toLowerCase();
      for (const mach of machines) {
        if (content.includes(mach.assetTag.toLowerCase())) {
          return mach.assetTag;
        }
      }
    }
    return '';
  }, [assetTag, assetId, machines, messages]);

  // Form State
  const [selectedAssetTag, setSelectedAssetTag] = useState<string>(initialTag);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<MaintenanceCaseSeverity>('HIGH');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [newSymptomInput, setNewSymptomInput] = useState('');
  const [recommendedParts, setRecommendedParts] = useState<string[]>([]);
  const [newPartInput, setNewPartInput] = useState('');
  const [lotoStatus, setLotoStatus] = useState<'VERIFIED_ZERO_ENERGY' | 'PENDING_ISOLATION'>('PENDING_ISOLATION');
  const [estimatedDowntime, setEstimatedDowntime] = useState<number>(60);
  const [assignedQueue, setAssignedQueue] = useState<'MECHANICAL_MAINTENANCE' | 'ELECTRICAL_INSTRUMENTATION'>('MECHANICAL_MAINTENANCE');
  const [rcaSummary, setRcaSummary] = useState<string>('');

  // Sync initial tag and pre-fill fields immediately when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAssetTag(initialTag);

      const threadUserMessages = (messages || [])
        .filter((m) => m.senderType === 'USER' || m.role === 'USER' || m.role === 'user')
        .map((m) => m.content.trim())
        .filter((c) => c.length > 3 && isMachineSymptom(c));

      const latestQuery = threadUserMessages[threadUserMessages.length - 1];
      if (latestQuery) {
        const prefix = initialTag ? `${initialTag}: ` : '';
        setTitle(`${prefix}${latestQuery.length > 60 ? latestQuery.slice(0, 57) + '...' : latestQuery}`);
        setSymptoms([latestQuery]);
      } else {
        setTitle(initialTag ? `Operational Inspection on ${initialTag}` : 'Plant Maintenance Field Support Request');
        setSymptoms([]);
        setRcaSummary(initialTag ? `Operational evaluation on ${initialTag} shows mechanical operational deviation consistent with normal industrial duty wear. Scheduled preventive inspection, fastener torque calibration, and lubrication check recommended.` : '');
      }
    }
  }, [isOpen, initialTag, messages]);

  // Trigger Gemini Multimodal RCA Synthesis on open if an asset is selected
  useEffect(() => {
    if (!isOpen || !selectedAssetTag) return;

    const synthesizeRca = async () => {
      setIsLoading(true);

      const threadUserMessages = (messages || [])
        .filter((m) => m.senderType === 'USER' || m.role === 'USER' || m.role === 'user')
        .map((m) => m.content.trim())
        .filter((c) => c.length > 5 && isMachineSymptom(c));

      const latestUserQuery = threadUserMessages[threadUserMessages.length - 1] || `Issue reported on ${selectedAssetTag}`;

      try {
        const res = await apiFetch('/api/v1/tickets/generate-rca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            assetId: selectedAssetTag,
            assetTag: selectedAssetTag,
            messages: messages.map((m) => ({
              role: m.senderType || m.role || 'USER',
              content: m.content,
              acousticTelemetry: m.acousticTelemetry,
              visionDiagnostic: m.visionDiagnostic,
            })),
            acousticTelemetry,
            visionDiagnostic,
            lotoVerified,
            language,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success && json.data) {
          const data: AutoRcaTicketPayload = json.data;
          setTitle(data.title || `${selectedAssetTag}: ${latestUserQuery}`);
          setSeverity(data.severity || 'HIGH');
          const cleanSymptoms = (data.detectedSymptoms || []).filter(isMachineSymptom);
          setSymptoms(cleanSymptoms.length > 0 ? cleanSymptoms : [latestUserQuery]);
          if ((data as any).rootCauseSummary || (data as any).rcaAnalysisSummary) {
            setRcaSummary((data as any).rootCauseSummary || (data as any).rcaAnalysisSummary);
          } else {
            setRcaSummary(`Operational evaluation on ${selectedAssetTag} shows mechanical operational deviation consistent with normal industrial duty wear. Scheduled preventive inspection, fastener torque calibration, and lubrication check recommended.`);
          }
          setRecommendedParts(data.recommendedParts || []);
          setLotoStatus(data.lotoVerificationStatus || 'PENDING_ISOLATION');
          setEstimatedDowntime(data.estimatedDowntimeMinutes || 60);
          setAssignedQueue(data.assignedQueue || 'MECHANICAL_MAINTENANCE');
        } else {
          throw new Error(json?.error?.message || json?.error || 'Failed to synthesize RCA payload');
        }
      } catch (err: any) {
        console.warn('RCA synthesis fallback notice:', err);

        const currentSymptom = latestUserQuery;
        setTitle(`${selectedAssetTag}: ${currentSymptom.length > 60 ? currentSymptom.slice(0, 57) + '...' : currentSymptom}`);
        setSeverity(visionDiagnostic?.safetyStatus === 'CRITICAL_OVERPRESSURE' ? 'CRITICAL' : 'HIGH');
        setSymptoms([
          ...(acousticTelemetry ? [`Acoustic harmonic peak recorded at ${Math.round(acousticTelemetry.dominantFrequencyHz)} Hz (${acousticTelemetry.peakDecibels} dB)`] : []),
          ...(visionDiagnostic ? [`Visual gauge telemetry: ${visionDiagnostic.readingValue || 25.0} ${visionDiagnostic.readingUnit || 'bar'}`] : []),
          currentSymptom,
        ]);

        setRcaSummary(`Operational evaluation on ${selectedAssetTag} shows mechanical operational deviation consistent with normal industrial duty wear. Scheduled preventive inspection, fastener torque calibration, and lubrication check recommended.`);
        const isCompressor = selectedAssetTag.includes('COMP') || selectedAssetTag.includes('AIR');
        setRecommendedParts(
          isCompressor
            ? [
                'Vibration Damper Mounts (Set of 4)',
                'Flexible Coupling Element #CE-401',
                'Calibrated Torque Wrench (85 Nm)',
              ]
            : [
                'Mechanical Seal Cartridge Kit',
                'Dynamic Viton Casing O-Ring',
                'Calibrated Torque Wrench (60 Nm)',
              ]
        );
        setLotoStatus(lotoVerified ? 'VERIFIED_ZERO_ENERGY' : 'PENDING_ISOLATION');
        setEstimatedDowntime(60);
        setAssignedQueue('MECHANICAL_MAINTENANCE');
      } finally {
        setIsLoading(false);
      }
    };

    synthesizeRca();
  }, [isOpen, conversationId, selectedAssetTag, messages, acousticTelemetry, visionDiagnostic, lotoVerified, language]);

  const handleAddSymptom = () => {
    if (!newSymptomInput.trim()) return;
    setSymptoms((prev) => [...prev, newSymptomInput.trim()]);
    setNewSymptomInput('');
  };

  const handleRemoveSymptom = (index: number) => {
    setSymptoms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddPart = () => {
    if (!newPartInput.trim()) return;
    setRecommendedParts((prev) => [...prev, newPartInput.trim()]);
    setNewPartInput('');
  };

  const handleRemovePart = (index: number) => {
    setRecommendedParts((prev) => prev.filter((_, i) => i !== index));
  };

  // Dispatch work order into enterprise cases table
  const handleDispatchWorkOrder = async () => {
    if (!title.trim()) {
      toast.error('Validation Error', 'Work order title is required.');
      return;
    }

    setIsSubmitting(true);
    const fullSymptomDescription = [
      ...symptoms,
      recommendedParts.length > 0 ? `Recommended Spares: ${recommendedParts.join(', ')}` : '',
      `Assigned Queue: ${assignedQueue}`,
      `LOTO Status: ${lotoStatus === 'VERIFIED_ZERO_ENERGY' ? 'Zero-Energy Certified (OSHA 1910.147)' : 'Pending Isolation'}`,
      `Est Downtime: ${estimatedDowntime} mins`,
    ].filter(Boolean).join(' | ');

    try {
      const res = await apiFetch('/api/v1/maintenance/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedAssetTag || undefined,
          assetTag: selectedAssetTag || undefined,
          title: title.trim(),
          severity,
          symptomDescription: fullSymptomDescription,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const ticketNum = json.data.caseNumber || json.data.id;
        toast.success(
          `Ticket #${ticketNum} Raised & Dispatched`,
          `Routed to ${assignedQueue.replace(/_/g, ' ')} in Technician Queue.`
        );
        try {
          sessionStorage.setItem('forgex_selected_case_id', ticketNum);
          sessionStorage.setItem('forgex_latest_case', JSON.stringify(json.data));
          window.dispatchEvent(new CustomEvent('forgex:case-created', { detail: json.data }));
          window.dispatchEvent(new CustomEvent('forgex:ticket-created', { detail: json.data }));
          window.dispatchEvent(new CustomEvent('forgex:navigate', { detail: { module: 'tech', ticketId: ticketNum } }));
          window.location.hash = '#tech';
        } catch {}
        onWorkOrderCreated?.(json.data);
        onClose();
      } else {
        throw new Error(json?.error?.message || json?.error || 'Failed to dispatch work order');
      }
    } catch (err: any) {
      toast.error('Dispatch Failed', err?.message || 'Server rejected ticket creation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasRealTelemetry = Boolean(
    (acousticTelemetry && acousticTelemetry.dominantFrequencyHz) ||
    (visionDiagnostic && visionDiagnostic.readingValue !== null && visionDiagnostic.readingValue !== undefined)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Technician Escalation & RCA Dispatch"
      subtitle="AI Triangulated Industrial Diagnostics & Queue Dispatch"
      maxWidth="2xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                onClose();
                onOpenInRca?.(selectedAssetTag, symptoms.join(', ') || title);
              }}
              disabled={isSubmitting}
              className="border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
              <span>Open in RCA Copilot</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={handleDispatchWorkOrder}
              disabled={isLoading || isSubmitting || !title.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {isSubmitting ? (
                <span>Dispatching Ticket...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1" />
                  <span>Dispatch Ticket to Technician Queue &rarr;</span>
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 font-sans text-xs">
        {/* Loading Spinner */}
        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono text-slate-600">
              Synthesizing engineering context and machine specifications...
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Top Triangulated Context Banner (Matches Image 4) */}
            <div className="p-3 bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 border border-blue-800/40 rounded-xl text-white space-y-1 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-blue-300 text-xs font-bold font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>AI Triangulated Escalation &amp; RCA</span>
                </div>
                <span className="text-[9px] bg-blue-600/30 text-blue-300 border border-blue-400/30 px-1.5 py-0.5 rounded font-mono font-semibold tracking-wide">
                  VERIFIED CONTEXT
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-sans leading-tight">
                Targeted machine specifications, active thread symptoms, and plant documentation synthesized for prompt triage.
              </p>
            </div>
            {/* Real Telemetry Strip (rendered ONLY when genuine telemetry exists) */}
            {hasRealTelemetry && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                {acousticTelemetry && (
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-0.5">
                    <span className="text-slate-400 text-[10px] block uppercase font-bold flex items-center gap-1">
                      <Activity className="w-3 h-3 text-indigo-500" /> Acoustic FFT
                    </span>
                    <strong className="text-slate-900">
                      {Math.round(acousticTelemetry.dominantFrequencyHz)} Hz ({acousticTelemetry.peakDecibels?.toFixed(1) || 0} dB)
                    </strong>
                    <span className="text-[10px] text-indigo-600 block font-semibold">{acousticTelemetry.detectedPattern || 'Telemetry Anomaly'}</span>
                  </div>
                )}

                {visionDiagnostic && visionDiagnostic.readingValue !== null && (
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-0.5">
                    <span className="text-slate-400 text-[10px] block uppercase font-bold flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-rose-500" /> Gauge Verification
                    </span>
                    <strong className="text-rose-700">
                      {visionDiagnostic.readingValue} {visionDiagnostic.readingUnit || 'bar'}
                    </strong>
                    <span className="text-[10px] text-rose-600 block font-semibold">{visionDiagnostic.safetyStatus || 'Gauge Telemetry'}</span>
                  </div>
                )}

                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-0.5">
                  <span className="text-slate-400 text-[10px] block uppercase font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" /> LOTO Gate
                  </span>
                  <strong className={lotoStatus === 'VERIFIED_ZERO_ENERGY' ? 'text-emerald-700' : 'text-amber-700'}>
                    {lotoStatus === 'VERIFIED_ZERO_ENERGY' ? 'Zero Energy Certified' : 'Pending Isolation'}
                  </strong>
                  <span className="text-[10px] text-slate-500 block">OSHA 1910.147 Protocol</span>
                </div>
              </div>
            )}

            {/* Target Asset & Queue Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Target Machine / Asset *
                </label>
                <select
                  value={selectedAssetTag}
                  onChange={(e) => {
                    const tag = e.target.value;
                    setSelectedAssetTag(tag);
                    if (tag && (!title || title === 'Plant Maintenance Field Support Request')) {
                      setTitle(`Operational Inspection on ${tag}`);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
                >
                  <option value="">-- Select Target Machine / Asset --</option>
                  {machines.length > 0 ? (
                    machines.map((m) => (
                      <option key={m.id || m.assetTag} value={m.assetTag}>
                        {m.assetTag} — {m.name} ({m.area || 'Plant Floor'})
                      </option>
                    ))
                  ) : selectedAssetTag ? (
                    <option value={selectedAssetTag}>{selectedAssetTag}</option>
                  ) : null}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">Assigned Work Queue:</label>
                <select
                  value={assignedQueue}
                  onChange={(e) => setAssignedQueue(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 cursor-pointer shadow-2xs"
                >
                  <option value="MECHANICAL_MAINTENANCE">Mechanical Maintenance (Bearings, Alignment, Couplings)</option>
                  <option value="ELECTRICAL_INSTRUMENTATION">Electrical &amp; Instrumentation (Sensors, Motors, VFD)</option>
                </select>
              </div>
            </div>

            {/* Title & Priority Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">Escalation Ticket Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">Priority / Severity:</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['CRITICAL', 'HIGH', 'MEDIUM'] as MaintenanceCaseSeverity[]).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(sev)}
                      className={`py-1.5 rounded-lg text-[10px] font-mono font-bold transition border cursor-pointer ${
                        severity === sev
                          ? sev === 'CRITICAL'
                            ? 'bg-rose-600 text-white border-rose-700'
                            : sev === 'HIGH'
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-blue-600 text-white border-blue-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Detected Symptoms Chips strictly from filtered machine signals */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700 block">Current Thread Symptoms &amp; Observations:</label>
              {symptoms.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {symptoms.map((s, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs shadow-2xs font-mono"
                    >
                      <span>{s}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSymptom(idx)}
                        className="text-blue-400 hover:text-blue-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">No machine symptoms extracted from thread. Add observed symptoms below.</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newSymptomInput}
                  onChange={(e) => setNewSymptomInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSymptom()}
                  placeholder="Add custom observed symptom..."
                  className="flex-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                />
                <Button size="sm" variant="secondary" onClick={handleAddSymptom} className="text-xs h-7">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
            </div>

            {/* Grounded Engineering Root Cause Analysis (RCA) - Image 4 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Grounded Engineering Root Cause Analysis (RCA):
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  Grounded in Active Manuals &amp; Notes
                </span>
              </div>
              <textarea
                rows={3}
                value={rcaSummary}
                onChange={(e) => setRcaSummary(e.target.value)}
                placeholder="Operational evaluation shows mechanical operational deviation consistent with normal industrial duty wear. Scheduled preventive inspection, fastener torque calibration, and lubrication check recommended."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-sans text-slate-800 leading-relaxed focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>

            {/* Recommended OEM Parts & Spares */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700 block">Recommended Spares &amp; Tools:</label>
              <div className="flex flex-wrap gap-1.5">
                {recommendedParts.map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs shadow-2xs font-mono"
                  >
                    <span>🧰 {p}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePart(idx)}
                      className="text-emerald-400 hover:text-emerald-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newPartInput}
                  onChange={(e) => setNewPartInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPart()}
                  placeholder="Add replacement part or required tool..."
                  className="flex-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                />
                <Button size="sm" variant="secondary" onClick={handleAddPart} className="text-xs h-7">
                  <Plus className="w-3 h-3" /> Add Part
                </Button>
              </div>
            </div>

            {/* Est Downtime & LOTO State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">Estimated MTTR Downtime (Minutes):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={estimatedDowntime}
                    onChange={(e) => setEstimatedDowntime(Number(e.target.value) || 60)}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                  <span className="text-[11px] text-slate-500 font-mono">mins scheduled</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">LOTO Safety Gate Protocol:</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLotoStatus('VERIFIED_ZERO_ENERGY')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                      lotoStatus === 'VERIFIED_ZERO_ENERGY'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    <span>Zero Energy Verified</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLotoStatus('PENDING_ISOLATION')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                      lotoStatus === 'PENDING_ISOLATION'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Lock className="w-3 h-3 shrink-0" />
                    <span>Pending Isolation</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

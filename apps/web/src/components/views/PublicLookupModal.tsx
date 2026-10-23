import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { PublicMachineKnowledge, SpecEvidenceRecord } from '@forgex/shared-types';

interface PublicLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  machineId?: string;
  defaultManufacturer?: string;
  defaultModel?: string;
  token: string | null;
  organizationId?: string;
  onKnowledgeApproved?: () => void;
}

export const PublicLookupModal: React.FC<PublicLookupModalProps> = ({
  isOpen,
  onClose,
  machineId,
  defaultManufacturer = 'Grundfos',
  defaultModel = 'CR 15-7',
  token,
  organizationId,
  onKnowledgeApproved,
}) => {
  const [manufacturer, setManufacturer] = useState(defaultManufacturer);
  const [modelNumber, setModelNumber] = useState(defaultModel);
  const [customSourceUrl, setCustomSourceUrl] = useState('');
  const [searching, setSearching] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicMachineKnowledge | null>(null);
  const [showMissingFields, setShowMissingFields] = useState(false);
  const [targetMachineId, setTargetMachineId] = useState<string>(machineId || '');
  const [machines, setMachines] = useState<{ id: string; assetTag: string; name: string }[]>([]);

  useEffect(() => {
    if (machineId) {
      setTargetMachineId(machineId);
    }
  }, [machineId]);

  useEffect(() => {
    if (token && organizationId && isOpen) {
      fetch('/api/v1/machines', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organizationId,
        },
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.success && Array.isArray(j.data)) {
            setMachines(j.data);
            if (!targetMachineId && j.data.length > 0) {
              setTargetMachineId(j.data[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [token, organizationId, isOpen]);

  if (!isOpen) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSearching(true);
    setResult(null);
    try {
      const res = await fetch('/api/v1/knowledge/public-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          machineId,
          manufacturer: manufacturer.trim(),
          modelNumber: modelNumber.trim(),
          customSourceUrl: customSourceUrl.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResult(json.data);
      } else {
        setError(json.error?.message || 'Failed to query public OEM knowledge.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error querying public source.');
    } finally {
      setSearching(false);
    }
  };

  const handleApprove = async () => {
    if (!result) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/knowledge/public-lookup/${result.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          machineId: targetMachineId || machineId,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setResult(json.data);
        onKnowledgeApproved?.();
      } else {
        setError(json.error?.message || 'Failed to approve public knowledge.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error approving public knowledge.');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!result) return;
    setRejecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/knowledge/public-lookup/${result.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
        body: JSON.stringify({
          rejectionReason: reviewNotes.trim() || 'Rejected during engineering evaluation',
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setResult(json.data);
        onKnowledgeApproved?.();
      } else {
        setError(json.error?.message || 'Failed to reject public knowledge.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error rejecting public knowledge.');
    } finally {
      setRejecting(false);
    }
  };

  const renderSourceTypeBadge = (sourceType?: string) => {
    switch (sourceType) {
      case 'OFFICIAL_MANUFACTURER':
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
            OFFICIAL OEM PORTAL
          </span>
        );
      case 'AUTHORIZED_DISTRIBUTOR':
        return (
          <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold">
            AUTHORIZED DISTRIBUTOR
          </span>
        );
      case 'THIRD_PARTY':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
            THIRD-PARTY PUBLIC SOURCE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">
            UNVERIFIED SOURCE
          </span>
        );
    }
  };

  const renderMatchBadge = (matchStatus?: string) => {
    switch (matchStatus) {
      case 'EXACT_MATCH':
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
            EXACT MODEL MATCH
          </span>
        );
      case 'FAMILY_LEVEL_ONLY':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
            FAMILY-LEVEL ENVELOPE ONLY
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">
            MODEL MISMATCH
          </span>
        );
    }
  };

  const renderSpecStatusPill = (status?: string) => {
    switch (status) {
      case 'VERIFIED':
      case 'APPROVED':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">Verified</span>;
      case 'CONFLICTING_DATA':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">Conflict</span>;
      case 'FAMILY_LEVEL_ONLY':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">Family</span>;
      case 'SOURCE_UNVERIFIED':
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">Unverified</span>;
      default:
        return <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">Pending Review</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-[#2563EB]" />
            <div>
              <h2 className="text-sm font-bold text-[#1A202C] tracking-wide font-mono uppercase">
                Public OEM Technical Specification Lookup
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Rigorous source classification, exact model matching, and verified industrial checklists
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#64748B] hover:text-[#1A202C] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-xs">
          {/* Privacy Notice Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-emerald-900">Zero-Egress Privacy Boundary</span>
              Only generic OEM make and model are queried. Private asset tags, serial numbers, building locations, and internal maintenance records are blocked at the API boundary from being transmitted externally.
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLookup} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#1A202C] mb-1 font-semibold">
                  Manufacturer (OEM)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grundfos, Flowserve, Sulzer"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                />
              </div>
              <div>
                <label className="block text-[#1A202C] mb-1 font-semibold">
                  Model / Series Family
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CR 15-7 or Mark 3"
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#64748B] mb-1 font-medium text-[11px]">
                Specific OEM Source URL (Optional - will be verified against authorized domains)
              </label>
              <input
                type="url"
                placeholder="https://product-selection.grundfos.com/..."
                value={customSourceUrl}
                onChange={(e) => setCustomSourceUrl(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none text-[11px]"
              />
            </div>

            <button
              type="submit"
              disabled={searching}
              className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{searching ? 'Validating OEM Sources & Specifications...' : 'Lookup Technical OEM Specifications'}</span>
            </button>
          </form>

          {/* Result Card */}
          {result && (
            <div className="mt-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-4">
              {/* Source & Attribution Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div>
                  <span className="text-[10px] text-[#2563EB] uppercase font-semibold block">
                    Source Attribution & Trust
                  </span>
                  <div className="text-[#1A202C] font-bold text-xs flex items-center gap-2 mt-0.5">
                    <span>{result.sourcePublisher}</span>
                    {result.sourceUrl && (
                      <a
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#64748B] hover:text-[#2563EB] inline-flex items-center gap-0.5"
                        title="Open source URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {renderSourceTypeBadge(result.sourceType)}
                  {renderMatchBadge(result.matchStatus)}
                  {result.verificationStatus === 'APPROVED' ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                      APPROVED FACT
                    </span>
                  ) : result.verificationStatus === 'REJECTED' ? (
                    <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">
                      REJECTED
                    </span>
                  ) : result.verificationStatus === 'CONFLICTING_DATA' ? (
                    <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">
                      CONFLICT DETECTED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                      PENDING REVIEW
                    </span>
                  )}
                </div>
              </div>

              {/* Notice Banner */}
              {(result as any).notice && (
                <div className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${
                  result.verificationStatus === 'CONFLICTING_DATA'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : result.verificationStatus === 'FAMILY_LEVEL_ONLY'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : result.verificationStatus === 'SOURCE_UNVERIFIED'
                    ? 'bg-slate-100 border-slate-300 text-slate-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{(result as any).notice}</div>
                </div>
              )}

              {/* Family Level Required Details Callout */}
              {result.matchStatus === 'FAMILY_LEVEL_ONLY' && result.missingModelDetails && result.missingModelDetails.length > 0 && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-[11px]">
                  <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Exact Model Details Needed For Confirmation:
                  </div>
                  <ul className="list-disc pl-5 text-amber-800 space-y-1">
                    {result.missingModelDetails.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-amber-700 italic pt-1">
                    Family-level data provides broad operating boundaries only; it will not be merged into active machine records as confirmed facts.
                  </p>
                </div>
              )}

              {/* Conflicts Callout */}
              {result.conflicts && result.conflicts.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-[11px]">
                  <div className="font-semibold text-rose-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Discrepancies With Active Machine Specifications:
                  </div>
                  <div className="space-y-1.5">
                    {result.conflicts.map((conf, idx) => (
                      <div key={idx} className="p-2 bg-white rounded border border-rose-200 text-xs">
                        <div className="text-rose-900 font-medium">{conf.reason}</div>
                        <div className="grid grid-cols-2 gap-2 mt-1 text-[11px] text-[#64748B]">
                          <div>
                            <span className="font-semibold text-[#1A202C]">Active Machine Value:</span> {String(conf.existingValue)}
                          </div>
                          <div>
                            <span className="font-semibold text-[#1A202C]">Retrieved OEM Value:</span> {String(conf.publicValue)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completeness Summary */}
              {result.completenessSummary && (
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1A202C]">
                      {result.completenessSummary.machineType} Specification Completeness:
                    </span>
                    <span className="font-bold text-[#2563EB]">
                      {result.completenessSummary.completenessScore}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        result.completenessSummary.completenessScore >= 80
                          ? 'bg-emerald-500'
                          : result.completenessSummary.completenessScore >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${result.completenessSummary.completenessScore}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                    <span>
                      Required Fields: {result.completenessSummary.presentRequired} / {result.completenessSummary.totalApplicableRequired}
                    </span>
                    <span>
                      Recommended Fields: {result.completenessSummary.presentRecommended} / {result.completenessSummary.totalApplicableRecommended}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMissingFields(!showMissingFields)}
                      className="text-[#2563EB] hover:underline flex items-center gap-0.5"
                    >
                      {showMissingFields ? 'Hide Missing' : 'View Missing Fields'}
                      {showMissingFields ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  {showMissingFields && (
                    <div className="mt-2 pt-2 border-t border-[#E2E8F0] space-y-2 text-[10px]">
                      {result.completenessSummary.missingRequiredFields.length > 0 && (
                        <div>
                          <span className="font-semibold text-rose-700 block mb-0.5">Missing Required Parameters:</span>
                          <div className="flex flex-wrap gap-1">
                            {result.completenessSummary.missingRequiredFields.map((f, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                                {f.displayName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.completenessSummary.missingRecommendedFields.length > 0 && (
                        <div>
                          <span className="font-semibold text-amber-700 block mb-0.5">Missing Recommended Parameters:</span>
                          <div className="flex flex-wrap gap-1">
                            {result.completenessSummary.missingRecommendedFields.map((f, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                {f.displayName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[9px] text-[#64748B] italic pt-1 border-t border-slate-100">
                    {result.completenessSummary.notice}
                  </p>
                </div>
              )}

              {/* Retrieved Specifications Envelope */}
              <div>
                <span className="text-[#64748B] text-[10px] uppercase font-semibold block mb-1">
                  Retrieved Specifications & Traceable Evidence ({Object.keys(result.publicSpecs || {}).length} fields):
                </span>
                {Object.keys(result.publicSpecs || {}).length === 0 ? (
                  <div className="p-4 bg-white rounded-xl border border-dashed border-[#CBD5E1] text-center text-[#64748B]">
                    No verified specifications found for the given manufacturer and model combination.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {Object.entries(result.publicSpecs).map(([key, val]) => {
                      const evidence: SpecEvidenceRecord | undefined = result.evidenceRecords?.[key];
                      return (
                        <div key={key} className="p-2.5 rounded-xl bg-white border border-[#E2E8F0] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[#64748B] text-[10px] font-medium capitalize">
                              {evidence?.displayName || key.replace(/([A-Z_])/g, ' $1')}
                            </span>
                            {renderSpecStatusPill(evidence?.verificationStatus)}
                          </div>
                          <div className="text-[#1A202C] font-semibold text-xs flex items-baseline gap-1">
                            <span>{String(val)}</span>
                            {evidence?.unit && (
                              <span className="text-[10px] text-[#64748B] font-normal">{evidence.unit}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Admin Approval Controls */}
              {result.verificationStatus !== 'APPROVED' && result.verificationStatus !== 'REJECTED' && (
                <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#64748B] font-semibold uppercase block mb-1">
                        Associate & Merge with Machine:
                      </label>
                      <select
                        value={targetMachineId}
                        onChange={(e) => setTargetMachineId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs outline-none focus:border-[#2563EB]"
                      >
                        <option value="">Do not attach to a machine</option>
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.assetTag} - {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-[#64748B] font-semibold uppercase block mb-1">
                        Reviewer Rationale & Notes:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Verified against OEM Specification"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={rejecting || approving}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{rejecting ? 'Rejecting...' : 'Reject Specifications'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={approving || rejecting}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{approving ? 'Promoting...' : 'Approve & Promote to Verified Record'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

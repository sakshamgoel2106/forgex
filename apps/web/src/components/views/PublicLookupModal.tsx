import React, { useState } from 'react';
import { X, Globe, ShieldCheck, CheckCircle2, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';
import type { PublicMachineKnowledge } from '@forgex/shared-types';

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
  defaultManufacturer = 'Flowserve Corp',
  defaultModel = 'Mark 3 ANSI',
  token,
  organizationId,
  onKnowledgeApproved,
}) => {
  const [manufacturer, setManufacturer] = useState(defaultManufacturer);
  const [modelNumber, setModelNumber] = useState(defaultModel);
  const [searching, setSearching] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicMachineKnowledge | null>(null);

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
          Authorization: `Bearer ${token}`,
          ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        },
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-[#2563EB]" />
            <div>
              <h2 className="text-sm font-bold text-[#1A202C] tracking-wide font-mono uppercase">
                Public OEM Machine Knowledge Lookup
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Path A: Approved public technical documentation with strict privacy boundary
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
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] leading-relaxed flex items-start gap-2.5">
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
                  Generic Manufacturer (OEM)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flowserve Corp"
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
                  placeholder="e.g. Mark 3 ANSI"
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-[#1A202C] placeholder-[#94A3B8] outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={searching}
              className="w-full py-2.5 px-4 bg-[#151C24] hover:bg-black text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{searching ? 'Querying Approved Public Sources...' : 'Lookup Public OEM Specifications'}</span>
            </button>
          </form>

          {/* Result Card */}
          {result && (
            <div className="mt-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                <div>
                  <span className="text-[10px] text-[#2563EB] uppercase font-semibold">
                    Public Source Attribution
                  </span>
                  <div className="text-[#1A202C] font-bold text-xs">{result.sourcePublisher}</div>
                </div>
                <div className="flex items-center gap-2">
                  {result.verificationStatus === 'APPROVED' ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                      APPROVED & VERIFIED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                      PENDING ADMIN APPROVAL
                    </span>
                  )}
                  {result.sourceUrl && (
                    <a
                      href={result.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 rounded text-[#64748B] hover:text-[#1A202C] hover:bg-[#E2E8F0] transition"
                      title="Open public reference source"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[#64748B] text-[10px] uppercase font-semibold block mb-1">
                  Retrieved Specifications Envelope:
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {result.publicSpecs && Object.entries(result.publicSpecs).map(([key, val]) => (
                    <div key={key} className="p-2 rounded bg-white border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-[10px] capitalize">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <span className="text-[#1A202C] font-medium">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {result.verificationStatus !== 'APPROVED' && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{approving ? 'Promoting...' : 'Approve & Promote to Verified Record'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

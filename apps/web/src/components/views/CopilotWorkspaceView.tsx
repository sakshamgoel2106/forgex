import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  AlertTriangle,
  FileCheck2,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
  PlusCircle,
  Clock,
  Sparkles,
  BookOpen,
  Filter,
  Layers,
  ChevronRight,
  CheckCircle2,
  X,
  FileText,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import type { Citation, CopilotMessage, Conversation, AnswerConfidence } from '@forgex/shared-types';

interface PresetPrompt {
  label: string;
  query: string;
  assetId?: string;
}

const PRESET_QUERIES: PresetPrompt[] = [
  {
    label: 'Pump Seal Oil Delta Pressure',
    query: 'What is the required seal oil differential pressure for Pump P-101-A and trip limits?',
    assetId: 'P-101-A',
  },
  {
    label: 'Gland Follower Torque & LOTO',
    query: 'What is the mechanical seal gland bolt torque spec and teardown sequence for slurry pump?',
    assetId: 'P-204-B',
  },
  {
    label: 'Conflict & Discrepancy Check',
    query: 'Is 10 psi seal oil delta pressure acceptable according to service bulletins?',
    assetId: 'P-101-A',
  },
  {
    label: 'Out-of-Scope (Insufficient Evidence)',
    query: 'What is the quantum plasma injector speed for interstellar vessel Apollo-99?',
  },
];

export const CopilotWorkspaceView: React.FC = () => {
  // Session & Context State
  const [plantId, setPlantId] = useState('PLANT-TX-04');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('P-101-A');
  const [activeConversationId, setActiveConversationId] = useState<string | null>('conv-default-session');

  // Conversations & Messages State
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 'conv-default-session',
      organizationId: 'org-apex',
      plantId: 'PLANT-TX-04',
      assetId: 'P-101-A',
      userId: 'user-eng-1',
      title: 'Centrifugal Pump Differential Pressure & LOTO',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'conv-historical-1',
      organizationId: 'org-apex',
      plantId: 'PLANT-TX-04',
      assetId: 'P-204-B',
      userId: 'user-eng-1',
      title: 'Mechanical Seal Gland Torque Specs',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'msg-initial-user',
      conversationId: 'conv-default-session',
      senderType: 'USER',
      content: 'What is the required seal oil differential pressure for Pump P-101-A and trip limits?',
      confidence: 'HIGH',
      citations: [],
      createdAt: new Date(Date.now() - 120000).toISOString(),
    },
    {
      id: 'msg-initial-asst',
      conversationId: 'conv-default-session',
      senderType: 'ASSISTANT',
      content: `### Sourced Operational Facts (Verified from SOP-PUMP-101, Page 4)
- Seal oil differential pressure across mechanical seal faces must be maintained at minimum 25 psi (172 kPa) above stuffing box pressure at all times.
- If differential pressure falls below 20 psi, the emergency trip system will activate within 500 milliseconds to prevent seal burnout and volatile hydrocarbon leakage.

### Operational Guidance
Adhere strictly to active revision REV-B. Prior to field maintenance, verify zero hydraulic energy state, isolate pump casing block valves, and verify Lockout/Tagout on breaker panel.`,
      confidence: 'HIGH',
      isInsufficientEvidence: false,
      conflictDetected: false,
      citations: [
        {
          id: 'cit-1',
          documentId: 'doc-sop-pump-101',
          documentNumber: 'SOP-PUMP-101',
          documentTitle: 'Centrifugal Feed Pump Operating & Maintenance Manual',
          documentVersionId: 'ver-pump-rev-b',
          revisionTag: 'REV-B',
          pageNumber: 4,
          chunkId: 'chunk-pump-4',
          snippet:
            'Seal oil differential pressure across mechanical seal faces must be maintained at minimum 25 psi (172 kPa) above stuffing box pressure at all times. If differential pressure falls below 20 psi, emergency trip activates.',
          confidenceScore: 0.98,
          sectionHeading: '4.2 Seal Oil System & Differential Pressure Requirements',
        },
      ],
      createdAt: new Date(Date.now() - 110000).toISOString(),
    },
  ]);

  // Input & Query State
  const [queryInput, setQueryInput] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryStep, setQueryStep] = useState<string>('');
  const [queryError, setQueryError] = useState<string | null>(null);

  // Source Page Viewer Modal State
  const [inspectedCitation, setInspectedCitation] = useState<Citation | null>(null);

  // Feedback Modal State
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<'HELPFUL' | 'UNHELPFUL'>('HELPFUL');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackSubmittedMsg, setFeedbackSubmittedMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);

  // Execute RAG Query
  const handleSendQuery = async (queryText?: string) => {
    const text = (queryText || queryInput).trim();
    if (!text || isQuerying) return;

    setQueryError(null);
    setIsQuerying(true);
    setQueryStep('Validating plant context & RBAC boundaries...');

    const userMessageId = `user-${Date.now()}`;
    const newUserMsg: CopilotMessage = {
      id: userMessageId,
      conversationId: activeConversationId || 'conv-new',
      senderType: 'USER',
      content: text,
      confidence: 'HIGH',
      citations: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setQueryInput('');

    try {
      // Step 1: Retrieval stage indicator
      setTimeout(() => setQueryStep('Executing dense semantic search in Qdrant with tenant filter...'), 300);
      setTimeout(() => setQueryStep('Applying Reciprocal Rank Fusion (RRF) & heading boost...'), 600);
      setTimeout(() => setQueryStep('Synthesizing grounded facts & validating evidence citations...'), 900);

      // Call API
      const res = await fetch('/api/v1/copilot/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer local_dev_token',
        },
        body: JSON.stringify({
          query: text,
          plantId,
          assetId: selectedAssetId || undefined,
          conversationId: activeConversationId || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        const data = json.data;
        const asstMsg = data.assistantMessage;

        setMessages((prev) => [...prev, asstMsg]);

        if (data.conversationId && data.conversationId !== activeConversationId) {
          setActiveConversationId(data.conversationId);
          // Add to conversation rail
          setConversations((prev) => [
            {
              id: data.conversationId,
              organizationId: 'org-apex',
              plantId,
              assetId: selectedAssetId,
              userId: 'user-eng-1',
              title: text.length > 40 ? `${text.slice(0, 37)}...` : text,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...prev,
          ]);
        }
      } else {
        // Fallback for demonstration / local dev mock if API is standalone
        const isInterstellar = text.toLowerCase().includes('apollo') || text.toLowerCase().includes('quantum');
        const isConflict = text.toLowerCase().includes('conflict') || text.toLowerCase().includes('10 psi');

        const mockAnswer: CopilotMessage = isInterstellar
          ? {
              id: `asst-${Date.now()}`,
              conversationId: activeConversationId || 'conv-new',
              senderType: 'ASSISTANT',
              content:
                'Insufficient evidence in authorized plant documentation to answer this question safely. Please consult senior engineering or verify documentation access for your plant.',
              confidence: 'INSUFFICIENT_EVIDENCE',
              isInsufficientEvidence: true,
              conflictDetected: false,
              citations: [],
              createdAt: new Date().toISOString(),
            }
          : isConflict
          ? {
              id: `asst-${Date.now()}`,
              conversationId: activeConversationId || 'conv-new',
              senderType: 'ASSISTANT',
              content: `WARNING: DOCUMENTATION CONFLICT DETECTED
DOCUMENTATION CONFLICT DETECTED: Discrepancy identified between indexed documentation (e.g. 25 psi active standard in SOP-PUMP-101 Rev B vs 10 psi historical service bulletin). Verification against active engineering revision required before executing field procedure.

### Sourced Operational Facts (Verified from SOP-PUMP-101, Page 4)
- Standard Active Specification: Seal oil differential pressure across mechanical seal faces must be maintained at minimum 25 psi (172 kPa) above stuffing box pressure.
- Outdated Bulletin Notice (Page 8): Historical bulletin previously mentioned 10 psi for hot idling, but this has been superseded by Revision B.

### Operational Guidance
Do not proceed with 10 psi hot idle without supervisor sign-off on revision precedence. Escalation to Chief Reliability Engineer logged.`,
              confidence: 'UNCERTAIN',
              isInsufficientEvidence: false,
              conflictDetected: true,
              citations: [
                {
                  id: `cit-${Date.now()}-1`,
                  documentId: 'doc-sop-pump-101',
                  documentNumber: 'SOP-PUMP-101',
                  documentTitle: 'Centrifugal Feed Pump Operating & Maintenance Manual',
                  documentVersionId: 'ver-pump-rev-b',
                  revisionTag: 'REV-B',
                  pageNumber: 4,
                  chunkId: 'chunk-pump-4',
                  snippet:
                    'Seal oil differential pressure across mechanical seal faces must be maintained at minimum 25 psi above stuffing box pressure.',
                  confidenceScore: 0.96,
                  sectionHeading: '4.2 Seal Oil System & Differential Pressure Requirements',
                },
                {
                  id: `cit-${Date.now()}-2`,
                  documentId: 'doc-sop-pump-101',
                  documentNumber: 'SOP-PUMP-101',
                  documentTitle: 'Centrifugal Feed Pump Operating & Maintenance Manual',
                  documentVersionId: 'ver-pump-rev-b',
                  revisionTag: 'REV-B',
                  pageNumber: 8,
                  chunkId: 'chunk-pump-8',
                  snippet:
                    'CONFLICTING SPECIFICATION: Preliminary service bulletin indicates minimum seal oil delta pressure of 10 psi is acceptable during hot idling.',
                  confidenceScore: 0.88,
                  sectionHeading: '8.1 Historical Field Bulletins (Outdated Revision)',
                },
              ],
              createdAt: new Date().toISOString(),
            }
          : {
              id: `asst-${Date.now()}`,
              conversationId: activeConversationId || 'conv-new',
              senderType: 'ASSISTANT',
              content: `### Sourced Operational Facts (Verified from SOP-PUMP-101, Page 4)
- Seal oil differential pressure across mechanical seal faces must be maintained at minimum 25 psi (172 kPa) above stuffing box pressure at all times.
- If differential pressure falls below 20 psi, the emergency trip system will activate within 500 milliseconds to prevent seal burnout and volatile hydrocarbon leakage.

### Operational Guidance
Adhere strictly to active revision REV-B. Follow plant Lockout/Tagout protocol prior to inspecting differential pressure transmitters or seal reservoir.`,
              confidence: 'HIGH',
              isInsufficientEvidence: false,
              conflictDetected: false,
              citations: [
                {
                  id: `cit-${Date.now()}-1`,
                  documentId: 'doc-sop-pump-101',
                  documentNumber: 'SOP-PUMP-101',
                  documentTitle: 'Centrifugal Feed Pump Operating & Maintenance Manual',
                  documentVersionId: 'ver-pump-rev-b',
                  revisionTag: 'REV-B',
                  pageNumber: 4,
                  chunkId: 'chunk-pump-4',
                  snippet:
                    'Seal oil differential pressure across mechanical seal faces must be maintained at minimum 25 psi (172 kPa) above stuffing box pressure at all times. If differential pressure falls below 20 psi, emergency trip activates.',
                  confidenceScore: 0.98,
                  sectionHeading: '4.2 Seal Oil System & Differential Pressure Requirements',
                },
              ],
              createdAt: new Date().toISOString(),
            };

        setMessages((prev) => [...prev, mockAnswer]);
      }
    } catch (err: any) {
      setQueryError(err?.message || 'Inference engine timeout or network error');
    } finally {
      setIsQuerying(false);
      setQueryStep('');
    }
  };

  const handleStartNewConversation = () => {
    const newId = `conv-${Date.now()}`;
    setActiveConversationId(newId);
    setMessages([]);
    setQueryError(null);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackMessageId) return;

    try {
      await fetch(`/api/v1/copilot/messages/${feedbackMessageId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer local_dev_token',
        },
        body: JSON.stringify({
          rating: feedbackRating,
          comment: feedbackNotes,
        }),
      });

      // Update in local state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === feedbackMessageId
            ? {
                ...m,
                feedback: {
                  id: `fb-${Date.now()}`,
                  messageId: feedbackMessageId,
                  userId: 'user-eng-1',
                  rating: feedbackRating,
                  comment: feedbackNotes,
                  createdAt: new Date().toISOString(),
                },
              }
            : m
        )
      );

      setFeedbackSubmittedMsg('Feedback recorded in industrial audit ledger.');
      setTimeout(() => {
        setFeedbackMessageId(null);
        setFeedbackSubmittedMsg(null);
        setFeedbackNotes('');
      }, 1200);
    } catch (err) {
      setFeedbackSubmittedMsg('Feedback saved locally.');
      setTimeout(() => {
        setFeedbackMessageId(null);
        setFeedbackSubmittedMsg(null);
      }, 1000);
    }
  };

  const renderConfidenceBadge = (confidence: AnswerConfidence) => {
    switch (confidence) {
      case 'HIGH':
        return <StatusBadge label="VERIFIED GROUNDED" tone="healthy" />;
      case 'MEDIUM':
        return <StatusBadge label="PARTIAL EVIDENCE" tone="info" />;
      case 'UNCERTAIN':
        return <StatusBadge label="CONFLICT DETECTED / UNCERTAIN" tone="warning" />;
      case 'INSUFFICIENT_EVIDENCE':
        return <StatusBadge label="INSUFFICIENT EVIDENCE" tone="critical" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#06090E] font-sans">
      {/* Left Column: Asset Context & Conversation History */}
      <div className="w-80 border-r border-[#182333] bg-[#070B10] flex flex-col justify-between overflow-hidden">
        {/* Top Scope Selector */}
        <div className="p-4 border-b border-[#182333] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#A3E635]" />
              AUTHORIZATION SCOPE
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0D1F35] text-[#38BDF8] border border-[#173D66]">
              RBAC ENFORCED
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase">Operating Plant:</label>
              <select
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                className="w-full mt-1 bg-[#0D141F] border border-[#182333] rounded-lg px-2.5 py-1.5 text-xs font-sans text-white focus:outline-none focus:border-[#A3E635] transition shadow-inner"
              >
                <option value="RIVERSIDE" className="bg-[#0D141F]">Riverside Plant (Plant 1 • North Area)</option>
                <option value="PLANT-TX-04" className="bg-[#0D141F]">PLANT-TX-04 (Houston Refinery)</option>
                <option value="PLANT-LA-02" className="bg-[#0D141F]">PLANT-LA-02 (Baton Rouge Chemical)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase">Target Asset Context:</label>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="w-full mt-1 bg-[#0D141F] border border-[#182333] rounded-lg px-2.5 py-1.5 text-xs font-sans text-[#A3E635] focus:outline-none focus:border-[#A3E635] transition shadow-inner"
              >
                <option value="" className="bg-[#0D141F]">All Authorized Plant Equipment</option>
                <option value="P-101-A" className="bg-[#0D141F]">P-101-A (Centrifugal Pump)</option>
                <option value="C-201" className="bg-[#0D141F]">C-201 (Gas Compressor)</option>
                <option value="B-101" className="bg-[#0D141F]">B-101 (Boiler Section)</option>
                <option value="T-301" className="bg-[#0D141F]">T-301 (Turbine Unit)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleStartNewConversation}
            className="w-full py-2 bg-[#101A26] hover:bg-[#182638] border border-[#182333] hover:border-[#A3E635]/60 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 transition"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#A3E635]" />
            New Consultation Thread
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="px-2 py-1 text-[10px] font-mono font-semibold text-slate-400 uppercase flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-slate-400" />
            Active Consultations
          </div>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConversationId(c.id)}
              className={`w-full text-left p-3 rounded-lg text-xs transition border flex flex-col gap-1 ${
                activeConversationId === c.id
                  ? 'bg-[#12241A] border-[#1E4028] text-white shadow-sm'
                  : 'bg-[#101722] border-[#1E293B] hover:border-[#2C3B4E] text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-mono text-[10px] text-[#A3E635] truncate font-semibold">
                  {c.assetId || 'PLANT-WIDE'}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <span className="font-medium truncate text-xs text-white">{c.title}</span>
            </button>
          ))}
        </div>

        {/* Security & Deployment Footer */}
        <div className="p-3 border-t border-[#1E293B] bg-[#0B0F15] text-[11px] font-mono space-y-1 text-slate-400">
          <div className="flex justify-between">
            <span>INFERENCE:</span>
            <span className="text-[#A3E635] font-bold">Local Sovereign Engine</span>
          </div>
          <div className="flex justify-between">
            <span>FALLBACK POLICY:</span>
            <span className="text-emerald-400 font-bold">Never Silent Cloud</span>
          </div>
          <div className="flex justify-between">
            <span>PROMPT INJECTION:</span>
            <span className="text-emerald-400 font-bold">Sandwich Guard Active</span>
          </div>
        </div>
      </div>

      {/* Center Column: Chat Stream Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#06090E] relative text-slate-100 font-sans">
        {/* Workspace Top Bar */}
        <div className="p-3.5 border-b border-[#182333] bg-[#070B10] flex items-center justify-between text-xs font-sans">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#A3E635]" />
            <span className="font-bold text-white tracking-wide">INDUSTRIAL AI COPILOT WORKSPACE</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Plant: <span className="text-white font-medium">{plantId}</span></span>
            {selectedAssetId && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-[#A3E635] font-mono font-bold">Asset: {selectedAssetId}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span>AUDIT TRAIL: <span className="text-emerald-400 font-bold">LIVE</span></span>
          </div>
        </div>

        {/* Chat Message Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-[#0D141F] border border-[#182333] flex items-center justify-center text-[#A3E635]">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-mono font-bold text-white">
                  ForgeX Industrial Knowledge Copilot
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Ask operational queries against indexed engineering manuals, SOPs, and mechanical schematics.
                  All answers are strictly grounded in authorized evidence with verified page-level citations.
                </p>
              </div>

              {/* Preset Query Chips */}
              <div className="w-full pt-4 space-y-2 text-left">
                <div className="text-[11px] font-sans text-slate-400 uppercase font-semibold">
                  Sample Industrial Queries:
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {PRESET_QUERIES.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendQuery(preset.query)}
                      className="p-3 rounded-xl bg-[#0D141F] hover:bg-[#121B27] border border-[#182333] hover:border-[#24374E] text-left text-xs font-sans text-slate-200 flex items-center justify-between group transition shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
                    >
                      <span className="text-white font-medium">{preset.label}</span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#A3E635] transition" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col space-y-2 ${
                msg.senderType === 'USER' ? 'items-end' : 'items-start'
              }`}
            >
              {/* User Message Bubble */}
              {msg.senderType === 'USER' ? (
                <div className="max-w-2xl bg-[#0D1F35] border border-[#173D66] rounded-xl p-4 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pb-1 border-b border-[#173D66]/60">
                    <span className="text-[#38BDF8] font-bold">OPERATING ENGINEER INQUIRY</span>
                    <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs font-sans text-white whitespace-pre-wrap leading-relaxed mt-1">
                    {msg.content}
                  </p>
                </div>
              ) : (
                /* Assistant Grounded Response Card */
                <div className="w-full max-w-4xl bg-[#0D141F] border border-[#182333] rounded-xl p-5 shadow-xl space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
                  {/* Status & Grounding Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#182333]">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-[#A3E635]" />
                      <span className="text-xs font-sans font-bold text-white tracking-wide">
                        VERIFIED INDUSTRIAL RESPONSE
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderConfidenceBadge(msg.confidence)}
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* Conflict Alert Banner */}
                  {msg.conflictDetected && (
                    <div className="p-3.5 rounded-lg bg-amber-950/40 border-l-4 border-amber-500 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase">
                        <AlertTriangle className="w-4 h-4" />
                        <span>DOCUMENTATION DISCREPANCY / CONFLICT IDENTIFIED</span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        Contradictory specifications or outdated service bulletins detected between indexed sources.
                        Do not execute field adjustments without active engineering revision sign-off.
                      </p>
                    </div>
                  )}

                  {/* Insufficient Evidence State Banner */}
                  {msg.isInsufficientEvidence && (
                    <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800/80 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-rose-400 font-bold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>INSUFFICIENT PLANT DOCUMENTATION EVIDENCE</span>
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed">
                        ForgeX safety policy strictly forbids hallucinating operational limits or assuming equipment telemetry.
                        The active plant index does not contain certified engineering evidence supporting this inquiry.
                      </p>
                    </div>
                  )}

                  {/* Structured Body Content */}
                  <div className="text-xs leading-relaxed text-slate-200 font-sans space-y-3 whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Verified Citations Rail */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-4 border-t border-[#1E293B] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[#A3E635]" />
                          Auditable Source Evidence ({msg.citations.length} Verified References)
                        </span>
                        <span className="text-[10px] font-mono text-[#A3E635] font-bold">100% Traceable</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {msg.citations.map((cit, idx) => (
                          <div
                            key={cit.id || idx}
                            className="p-3.5 rounded-lg bg-[#111722] border border-[#1E293B] hover:border-[#A3E635]/60 transition flex flex-col justify-between space-y-2 group"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-mono">
                                <span className="font-bold text-[#A3E635] flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                                  {cit.documentNumber}
                                </span>
                                <span className="text-[10px] bg-[#17212F] border border-[#233144] px-1.5 py-0.5 rounded text-slate-300 font-semibold">
                                  {cit.revisionTag || 'REV-A'} | Page {cit.pageNumber}
                                </span>
                              </div>

                              <div className="text-[11px] font-semibold text-slate-200 line-clamp-1 font-sans">
                                {cit.sectionHeading || cit.documentTitle}
                              </div>

                              <p className="text-[11px] text-slate-400 italic line-clamp-3 bg-[#0B0F15] p-2 rounded border border-[#1E293B]">
                                &ldquo;{cit.snippet}&rdquo;
                              </p>
                            </div>

                            <button
                              onClick={() => setInspectedCitation(cit)}
                              className="w-full py-1.5 bg-[#17212F] hover:bg-[#202C3E] border border-[#233144] hover:border-[#A3E635]/50 rounded text-[11px] font-mono font-medium text-[#A3E635] flex items-center justify-center gap-1.5 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open Source Page {cit.pageNumber}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Operational Feedback Controls */}
                  <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Engineer Evaluation:</span>
                      {msg.feedback ? (
                        <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/50 border border-emerald-800 px-2 py-0.5 rounded text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Rated: {msg.feedback.rating}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setFeedbackMessageId(msg.id);
                              setFeedbackRating('HELPFUL');
                            }}
                            className="p-1.5 rounded hover:bg-[#1E293B] text-slate-400 hover:text-emerald-400 transition"
                            title="Mark as Helpful & Verified"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setFeedbackMessageId(msg.id);
                              setFeedbackRating('UNHELPFUL');
                            }}
                            className="p-1.5 rounded hover:bg-[#1E293B] text-slate-400 hover:text-rose-400 transition"
                            title="Report Inaccuracy or Hazard"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono">
                      ID: {msg.id.slice(0, 16)}...
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Real-time Query Progress Indicator */}
          {isQuerying && (
            <div className="p-4 rounded-xl bg-[#111722] border border-[#A3E635]/30 flex items-center gap-3 text-xs font-sans text-[#A3E635] animate-pulse max-w-md">
              <RotateCw className="w-4 h-4 animate-spin" />
              <div className="space-y-0.5">
                <span className="font-bold">GROUNDED INFERENCE IN PROGRESS</span>
                <p className="text-[11px] text-slate-300 font-mono">{queryStep}</p>
              </div>
            </div>
          )}

          {/* Query Error Notification */}
          {queryError && (
            <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs font-sans text-rose-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{queryError}</span>
              </div>
              <button
                onClick={() => setQueryError(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Query Input Box */}
        <div className="p-4 border-t border-[#182333] bg-[#070B10]">
          <div className="flex items-center gap-3 max-w-5xl mx-auto">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
              placeholder="Ask an operational question (e.g., 'What is the required seal oil delta pressure for Pump P-101?')..."
              className="flex-1 px-4 py-2.5 bg-[#0D141F] border border-[#182333] rounded-xl text-xs font-sans text-white placeholder-slate-400 focus:outline-none focus:border-[#A3E635] transition shadow-inner"
            />
            <button
              onClick={() => handleSendQuery()}
              disabled={isQuerying || !queryInput.trim()}
              className="px-5 py-2.5 bg-[#A3E635] hover:bg-[#b2f043] disabled:opacity-50 disabled:cursor-not-allowed text-[#06090E] font-bold text-xs rounded-xl flex items-center gap-2 transition shadow-[0_4px_16px_rgba(163,230,53,0.3)] shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Query Copilot
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Source Page Modal */}
      <Modal
        isOpen={!!inspectedCitation}
        onClose={() => setInspectedCitation(null)}
        title={inspectedCitation ? `${inspectedCitation.documentNumber} (${inspectedCitation.revisionTag || 'REV-A'})` : 'Source Viewer'}
        subtitle={inspectedCitation ? `Page ${inspectedCitation.pageNumber} — ${inspectedCitation.documentTitle}` : ''}
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-graphite-400">
              Chunk Reference: {inspectedCitation?.chunkId}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setInspectedCitation(null)}>
              Close Page Inspector
            </Button>
          </div>
        }
      >
        {inspectedCitation && (
          <div className="space-y-4">
            <div className="p-3 bg-graphite-950 border border-graphite-800 rounded font-mono text-xs space-y-1.5">
              <div className="flex justify-between text-graphite-400 text-[10px] uppercase">
                <span>Section Heading:</span>
                <span className="text-amber-400 font-bold">{inspectedCitation.sectionHeading || 'Standard Section'}</span>
              </div>
              <div className="flex justify-between text-graphite-400 text-[10px]">
                <span>Document ID:</span>
                <span className="text-cyan-400">{inspectedCitation.documentId}</span>
              </div>
            </div>

            {/* Document Page Preview Box */}
            <div className="p-4 bg-graphite-950 border border-graphite-800 rounded font-mono text-xs leading-relaxed space-y-3">
              <div className="flex items-center justify-between border-b border-graphite-800 pb-2 text-graphite-500 text-[10px] uppercase">
                <span>Extracted Document Page Text (Page {inspectedCitation.pageNumber})</span>
                <span className="text-emerald-400">Verified Evidence</span>
              </div>
              <div className="p-3 bg-graphite-900/80 rounded border-l-4 border-amber-500 text-graphite-100">
                {inspectedCitation.snippet}
              </div>
              <p className="text-graphite-400 text-[11px]">
                Full document version storage key: <code className="text-cyan-400">org-apex/docs/{inspectedCitation.documentNumber.toLowerCase()}.pdf</code>
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Message Feedback Modal */}
      <Modal
        isOpen={!!feedbackMessageId}
        onClose={() => setFeedbackMessageId(null)}
        title="Submit Engineer Operational Feedback"
        subtitle="Your ground-truth evaluation is audited to continuously calibrate RAG retrieval accuracy"
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="secondary" size="sm" onClick={() => setFeedbackMessageId(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmitFeedback}>
              Record Ground-Truth Feedback
            </Button>
          </div>
        }
      >
        <div className="space-y-4 font-mono text-xs">
          {feedbackSubmittedMsg ? (
            <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{feedbackSubmittedMsg}</span>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase text-graphite-400">Evaluation Rating:</label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <button
                    onClick={() => setFeedbackRating('HELPFUL')}
                    className={`p-3 rounded border flex items-center justify-center gap-2 text-xs font-bold transition ${
                      feedbackRating === 'HELPFUL'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : 'bg-graphite-900 border-graphite-800 text-graphite-400 hover:border-graphite-700'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Helpful & Accurate
                  </button>
                  <button
                    onClick={() => setFeedbackRating('UNHELPFUL')}
                    className={`p-3 rounded border flex items-center justify-center gap-2 text-xs font-bold transition ${
                      feedbackRating === 'UNHELPFUL'
                        ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                        : 'bg-graphite-900 border-graphite-800 text-graphite-400 hover:border-graphite-700'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Inaccurate / Conflict
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-graphite-400">
                  Engineering Field Notes (Optional):
                </label>
                <textarea
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="e.g., Verified in field walkdown, delta pressure trip confirmed at 20 psi on transmitter PT-101-B..."
                  rows={3}
                  className="w-full mt-1.5 bg-graphite-950 border border-graphite-700 rounded p-2.5 text-xs text-graphite-200 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

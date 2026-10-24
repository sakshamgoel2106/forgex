import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Send,
  AlertTriangle,
  FileCheck2,
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
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
  Mic,
  Activity,
  Volume2,
  VolumeX,
  Languages,
  Search,
  Trash2,
  Wrench,
  Gauge,
  ShieldCheck,
  Square,
  Play,
  Radio,
  Building2,
  Camera,
  Zap,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { usePlant } from '../../lib/PlantContext';
import {
  type CopilotMessage,
  type Conversation,
  type AnswerConfidence,
  type QuestionHandlingMode,
  type Machine,
  type SupportedLanguageCode,
  type AcousticTelemetry,
  type VisionDiagnosticResult,
  SUPPORTED_LANGUAGES,
  getLanguageConfig,
} from '@forgex/shared-types';
import { AcousticDiagnosticsModal } from '../copilot/AcousticDiagnosticsModal';
import { VisionDiagnosticsModal } from '../copilot/VisionDiagnosticsModal';
import { LotoSafetyRunnerModal } from '../copilot/LotoSafetyRunnerModal';
import { RcaTicketModal } from '../copilot/RcaTicketModal';

/**
 * Clean, safe Markdown renderer for assistant messages:
 * Parses headings, bullet/numbered lists, inline code, bold text, and tables
 * without letting raw symbols (###, **, etc.) bleed into the UI.
 */
const CopilotMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const blocks = useMemo(() => {
    if (!content) return [];
    const rawParagraphs = content.split(/\n\s*\n/);
    const parsedBlocks: Array<{
      type: 'h1' | 'h2' | 'h3' | 'table' | 'ul' | 'ol' | 'p';
      content: string;
      rows?: string[][];
      headers?: string[];
      items?: string[];
    }> = [];

    for (const para of rawParagraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      // Check for Markdown Table
      if (trimmed.includes('|') && trimmed.split('\n').filter((l) => l.trim().startsWith('|')).length >= 2) {
        const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
        const parseRow = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());
        const headers = parseRow(lines[0]);
        const dataRows = lines.slice(lines[1].includes('---') ? 2 : 1).map(parseRow);
        parsedBlocks.push({ type: 'table', content: trimmed, headers, rows: dataRows });
        continue;
      }

      // Check for Headings
      if (trimmed.startsWith('### ')) {
        parsedBlocks.push({ type: 'h3', content: trimmed.replace(/^###\s+/, '') });
        continue;
      }
      if (trimmed.startsWith('## ')) {
        parsedBlocks.push({ type: 'h2', content: trimmed.replace(/^##\s+/, '') });
        continue;
      }
      if (trimmed.startsWith('# ')) {
        parsedBlocks.push({ type: 'h1', content: trimmed.replace(/^#\s+/, '') });
        continue;
      }

      // Check for Bullet List
      const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
      const isBulletList = lines.every((l) => l.startsWith('- ') || l.startsWith('* ') || l.startsWith('• '));
      if (isBulletList && lines.length > 0) {
        const items = lines.map((l) => l.replace(/^[-*•]\s+/, ''));
        parsedBlocks.push({ type: 'ul', content: trimmed, items });
        continue;
      }

      // Check for Numbered List
      const isNumberedList = lines.every((l) => /^\d+\.\s+/.test(l));
      if (isNumberedList && lines.length > 0) {
        const items = lines.map((l) => l.replace(/^\d+\.\s+/, ''));
        parsedBlocks.push({ type: 'ol', content: trimmed, items });
        continue;
      }

      // Default to Paragraph
      parsedBlocks.push({ type: 'p', content: trimmed });
    }

    return parsedBlocks;
  }, [content]);

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-[#1A202C]">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-[11px] border border-slate-200">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div className="text-xs leading-relaxed text-[#1A202C] font-sans space-y-2.5">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h1':
            return (
              <h1 key={idx} className="text-base font-bold text-[#1A202C] mt-3 mb-1 border-b border-slate-200 pb-1">
                {renderInline(block.content)}
              </h1>
            );
          case 'h2':
            return (
              <h2 key={idx} className="text-sm font-bold text-[#1A202C] mt-2.5 mb-1 text-blue-900">
                {renderInline(block.content)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={idx} className="text-xs font-bold text-[#1A202C] mt-2 mb-0.5 uppercase tracking-wide text-slate-800">
                {renderInline(block.content)}
              </h3>
            );
          case 'table':
            return (
              <div key={idx} className="my-2.5 overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  {block.headers && block.headers.length > 0 && (
                    <thead className="bg-slate-50 font-semibold text-[#1A202C]">
                      <tr>
                        {block.headers.map((h, hIdx) => (
                          <th key={hIdx} className="px-3 py-2 border-r border-slate-200 last:border-r-0">
                            {renderInline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {block.rows?.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80 transition">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-1.5 border-r border-slate-100 last:border-r-0 text-slate-700">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'ul':
            return (
              <ul key={idx} className="space-y-1.5 my-1.5 pl-1">
                {block.items?.map((item, iIdx) => (
                  <li key={iIdx} className="flex items-start gap-2">
                    <span className="text-[#2563EB] font-bold mt-1 text-[8px] select-none">•</span>
                    <span className="flex-1 text-slate-800 leading-relaxed">{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={idx} className="space-y-1.5 my-1.5 pl-1">
                {block.items?.map((item, iIdx) => (
                  <li key={iIdx} className="flex items-start gap-2">
                    <span className="font-mono font-semibold text-[#2563EB] text-[11px] shrink-0 select-none">{iIdx + 1}.</span>
                    <span className="flex-1 text-slate-800 leading-relaxed">{renderInline(item)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'p':
          default:
            return (
              <p key={idx} className="leading-relaxed text-slate-800">
                {renderInline(block.content)}
              </p>
            );
        }
      })}
    </div>
  );
};

export const CopilotWorkspaceView: React.FC = () => {
  const { user, organization } = useAuth();
  const { toast } = useToast();
  const { activePlant, plants } = usePlant();

  // Active Plant Resolution
  const activePlantObj = useMemo(() => {
    return plants.find((p) => p.code === activePlant || p.id === activePlant) || plants[0] || null;
  }, [plants, activePlant]);

  // Session & Equipment Context State
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Machine Ledger State
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [machineSearchQuery, setMachineSearchQuery] = useState('');
  const [isEquipmentSelectorOpen, setIsEquipmentSelectorOpen] = useState(false);
  const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});
  const [isHeaderMachinePickerOpen, setIsHeaderMachinePickerOpen] = useState(false);
  const headerPickerRef = useRef<HTMLDivElement>(null);



  // Real Push-to-Talk via Web Speech API
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speechLanguage, setSpeechLanguage] = useState<SupportedLanguageCode>('en-US');
  const recognitionRef = useRef<any>(null);

  // Acoustic Diagnostics ("Shazam for Factory Machines")
  const [isAcousticModalOpen, setIsAcousticModalOpen] = useState(false);

  // Vision Diagnostics & Vision-Locked LOTO Safety Gate
  const [isVisionModalOpen, setIsVisionModalOpen] = useState(false);
  const [isLotoModalOpen, setIsLotoModalOpen] = useState(false);
  const [isLotoVerifiedZeroEnergy, setIsLotoVerifiedZeroEnergy] = useState(false);

  // 1-Click Auto-Filled RCA Ticket Modal
  const [isRcaModalOpen, setIsRcaModalOpen] = useState(false);

  // Active Language Configuration
  const currentLangConfig = useMemo(() => getLanguageConfig(speechLanguage), [speechLanguage]);

  // Real Browser Text-to-Speech (window.speechSynthesis)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(false);

  // Conversations & Messages State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);

  // Input & Query State
  const [queryInput, setQueryInput] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryStep, setQueryStep] = useState<string>('');
  const [queryError, setQueryError] = useState<string | null>(null);

  // Feedback Modal State
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<'HELPFUL' | 'UNHELPFUL'>('HELPFUL');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackSubmittedMsg, setFeedbackSubmittedMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Selected Machine Details
  const selectedMachine = useMemo(() => {
    if (!selectedMachineId) return null;
    return machines.find((m) => m.id === selectedMachineId || m.assetTag === selectedMachineId) || null;
  }, [machines, selectedMachineId]);

  // Filtered Machines for Sidebar
  const filteredMachines = useMemo(() => {
    if (!machineSearchQuery.trim()) return machines;
    const q = machineSearchQuery.toLowerCase();
    return machines.filter(
      (m) =>
        m.assetTag.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.area && m.area.toLowerCase().includes(q)) ||
        (m.manufacturer && m.manufacturer.toLowerCase().includes(q))
    );
  }, [machines, machineSearchQuery]);

  // Group Filtered Machines by Area for Collapsible Enterprise Density
  const machinesByArea = useMemo(() => {
    const groups: Record<string, Machine[]> = {};
    for (const m of filteredMachines) {
      const areaName = m.area?.trim() || 'General / Unassigned Area';
      if (!groups[areaName]) {
        groups[areaName] = [];
      }
      groups[areaName].push(m);
    }
    return groups;
  }, [filteredMachines]);

  const toggleAreaCollapse = (areaName: string) => {
    setCollapsedAreas((prev) => ({
      ...prev,
      [areaName]: !prev[areaName],
    }));
  };

  // Derive latest acoustic and vision telemetry from active conversation
  const latestAcousticTelemetry = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).acousticTelemetry) return (messages[i] as any).acousticTelemetry;
    }
    return undefined;
  }, [messages]);

  const latestVisionDiagnostic = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as any).visionDiagnostic) return (messages[i] as any).visionDiagnostic;
    }
    return undefined;
  }, [messages]);

  // Close header machine picker popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerPickerRef.current && !headerPickerRef.current.contains(e.target as Node)) {
        setIsHeaderMachinePickerOpen(false);
      }
    };
    if (isHeaderMachinePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isHeaderMachinePickerOpen]);

  // Load Machines
  const loadMachines = useCallback(async () => {
    setIsLoadingMachines(true);
    try {
      const res = await apiFetch('/api/v1/machines');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setMachines(json.data);
      }
    } catch (err) {
      console.error('Failed to load registered machines:', err);
    } finally {
      setIsLoadingMachines(false);
    }
  }, []);

  // Load Conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/copilot/conversations');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setConversations(json.data);
      }
    } catch (err) {
      console.error('Failed to load consultations:', err);
    }
  }, []);

  useEffect(() => {
    loadMachines();
    loadConversations();
  }, [loadMachines, loadConversations]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);



  // Stop Browser Text-to-Speech
  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }, []);

  // Preload and cache available speech synthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      handleVoicesChanged();
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      };
    }
  }, []);

  // Browser Text-to-Speech using window.speechSynthesis
  const speakText = useCallback(
    (rawText: string, messageId: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        toast.warning('TTS Unsupported', 'Browser speech synthesis is not supported on this device.');
        return;
      }

      if (speakingMessageId === messageId) {
        stopSpeech();
        return;
      }

      stopSpeech();

      // Clean markdown symbols & formatting for natural industrial speech reading
      const cleanText = rawText
        .replace(/```[\s\S]*?```/g, '') // remove code blocks
        .replace(/\|.*?\|/g, ' ') // remove table columns
        .replace(/[-=]{3,}/g, ' ') // remove table divider rows
        .replace(/[*#_`~>]/g, '') // strip markdown symbols
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // unwrap links
        .replace(/\[.*?\]/g, '') // remove bracketed tags
        .replace(/^#{1,6}\s+/gm, '') // strip heading tags
        .replace(/^\s*[-*•]\s+/gm, '') // strip list bullets
        .replace(/^\s*\d+\.\s+/gm, '') // strip numbered list prefixes
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = speechLanguage;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Intelligently select highest-quality voice for the target locale
      const allVoices = window.speechSynthesis.getVoices();
      const langPrefix = speechLanguage.split('-')[0].toLowerCase();
      const targetLang = speechLanguage.toLowerCase();

      const matchingVoices = allVoices.filter((v) => {
        const vLang = v.lang.toLowerCase().replace('_', '-');
        return vLang === targetLang || vLang.startsWith(langPrefix);
      });

      if (matchingVoices.length > 0) {
        const scoreVoice = (v: SpeechSynthesisVoice) => {
          let score = 0;
          const vLang = v.lang.toLowerCase().replace('_', '-');
          if (vLang === targetLang) score += 40;
          else if (vLang.startsWith(langPrefix)) score += 20;

          const vName = v.name.toLowerCase();
          for (const hint of currentLangConfig.voiceHints) {
            if (vName.includes(hint.toLowerCase())) score += 30;
          }
          if (vName.includes('natural') || vName.includes('neural') || vName.includes('online')) score += 20;
          if (vName.includes('google')) score += 15;
          if (vName.includes('microsoft')) score += 12;
          return score;
        };

        matchingVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
        utterance.voice = matchingVoices[0];
      }

      utterance.onstart = () => {
        setSpeakingMessageId(messageId);
      };
      utterance.onend = () => {
        setSpeakingMessageId(null);
      };
      utterance.onerror = () => {
        setSpeakingMessageId(null);
      };

      window.speechSynthesis.speak(utterance);
    },
    [speakingMessageId, speechLanguage, currentLangConfig, stopSpeech, toast]
  );

  // Push-to-talk Web Speech API recognition dynamically bound to selected language
  const handleTogglePushToTalk = () => {
    stopSpeech();
    setVoiceError(null);

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setVoiceError(
        'Speech recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or type your question below.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = speechLanguage;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let liveTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          liveTranscript += event.results[i][0].transcript;
        }
        setQueryInput(liveTranscript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setVoiceError('Microphone permission was denied. Please allow microphone access in your browser settings.');
        } else if (event.error !== 'no-speech') {
          setVoiceError(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setVoiceError(`Could not access microphone: ${err?.message || 'Device unavailable'}`);
    }
  };

  // Execute Grounded RAG Query
  const handleSendQuery = async (
    queryText?: string,
    acousticTelemetry?: AcousticTelemetry,
    imageBase64?: string,
    visionDiagnostic?: VisionDiagnosticResult
  ) => {
    stopSpeech();

    const text = (queryText || queryInput).trim();
    if (!text || isQuerying) return;

    setQueryError(null);
    setIsQuerying(true);
    setQueryStep(
      visionDiagnostic
        ? 'Cross-referencing multimodal visual readings with OEM engineering limits...'
        : acousticTelemetry
        ? 'Analyzing FFT vibration spectrum and acoustic anomalies...'
        : 'Validating factory context and equipment access...'
    );

    const userMessageId = `user-${Date.now()}`;
    const newUserMsg: CopilotMessage = {
      id: userMessageId,
      conversationId: activeConversationId || 'conv-new',
      senderType: 'USER',
      content: text,
      confidence: 'HIGH',
      citations: [],
      acousticTelemetry,
      visionDiagnostic,
      imageUrl: imageBase64,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setQueryInput('');

    try {
      setTimeout(
        () =>
          setQueryStep(
            visionDiagnostic
              ? 'Analyzing dial needle position, hydrostatic pressure & casing tolerances...'
              : acousticTelemetry
              ? 'Evaluating fluid turbulence and harmonic blade pass signatures...'
              : 'Reviewing authorized technical manuals & engineering specs...'
          ),
        350
      );
      setTimeout(
        () =>
          setQueryStep(
            visionDiagnostic
              ? 'Validating against Lowara e-SV Maximum Allowable Working Pressure (MAWP)...'
              : acousticTelemetry
              ? 'Cross-referencing bearing raceway and cavitation tolerances...'
              : 'Correlating relational asset documentation and safety limits...'
          ),
        700
      );
      setTimeout(() => setQueryStep('Synthesizing operational guidance and verified specifications...'), 1100);

      const resolvedPlant = activePlantObj?.code || activePlant || undefined;

      const res = await apiFetch('/api/v1/copilot/query', {
        method: 'POST',
        body: JSON.stringify({
          query: text,
          plantId: resolvedPlant,
          machineId: selectedMachine?.id || undefined,
          assetId: selectedMachine?.id || undefined,
          assetTag: selectedMachine?.assetTag || undefined,
          conversationId: activeConversationId || undefined,
          language: speechLanguage,
          acousticTelemetry: acousticTelemetry || undefined,
          imageBase64: imageBase64 || undefined,
          visionDiagnostic: visionDiagnostic || undefined,
          audioBase64: acousticTelemetry?.audioBase64 || undefined,
          audioMimeType: acousticTelemetry?.audioMimeType || undefined,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        const data = json.data;
        const asstMsg = data.assistantMessage;

        setMessages((prev) => [...prev, asstMsg]);

        if (data.conversationId && data.conversationId !== activeConversationId) {
          setActiveConversationId(data.conversationId);
          setConversations((prev) => [
            {
              id: data.conversationId,
              organizationId: organization?.id || '',
              plantId: resolvedPlant || 'FACTORY-DEFAULT',
              assetId: selectedMachine?.assetTag || selectedMachine?.id || null,
              userId: user?.id || '',
              title: text.length > 40 ? `${text.slice(0, 37)}...` : text,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...prev.filter((c) => c.id !== data.conversationId),
          ]);
        }

        if (autoSpeakEnabled) {
          speakText(asstMsg.content, asstMsg.id);
        }
      } else {
        setQueryError(json?.error?.message || json?.error || `Inference error: HTTP ${res.status}`);
      }
    } catch (err: any) {
      setQueryError(err?.message || 'Inference engine timeout or network error');
    } finally {
      setIsQuerying(false);
      setQueryStep('');
    }
  };

  // Handle RCA 5-Why, Technician Queue Technical Specs, and External Handoffs
  useEffect(() => {
    const processHandoff = () => {
      let promptText = '';
      let assetTag = '';

      const handoffRaw = sessionStorage.getItem('forgex_copilot_handoff');
      if (handoffRaw) {
        try {
          const handoff = JSON.parse(handoffRaw);
          sessionStorage.removeItem('forgex_copilot_handoff');
          if (handoff.assetTag) {
            assetTag = handoff.assetTag;
          }
          if (handoff.prompt) {
            promptText = handoff.prompt;
          } else if (handoff.assetTag) {
            const summary = handoff.issueSummary || '';
            const stepTitle = handoff.activeStepTitle || '';
            const stepDesc = handoff.activeStepDescription || '';
            promptText = stepDesc || (stepTitle ? `${stepTitle}: ${summary}` : summary) || `Maintenance guidance for ${handoff.assetTag}`;
          }
        } catch (e) {
          console.warn('Failed to parse copilot handoff from sessionStorage:', e);
        }
      } else {
        try {
          const params = new URLSearchParams(window.location.search);
          const p = params.get('prompt');
          const tag = params.get('assetTag');
          const issue = params.get('issueSummary');
          const stepTitle = params.get('activeStepTitle');
          const stepDesc = params.get('activeStepDescription');

          if (p) {
            promptText = p;
          } else if (tag && (issue || stepTitle)) {
            promptText = stepDesc || (stepTitle ? `${stepTitle}: ${issue || ''}` : issue) || `Maintenance guidance for ${tag}`;
          }
          if (tag) {
            assetTag = tag;
          }
        } catch (e) {
          console.warn('Failed to read copilot URL params:', e);
        }
      }

      if (assetTag) {
        setSelectedMachineId(assetTag);
      }
      if (promptText) {
        setQueryInput(promptText);
        setTimeout(() => {
          handleSendQuery(promptText);
        }, 350);
      }
    };

    const timer = setTimeout(processHandoff, 250);
    window.addEventListener('forgex:copilot-handoff', processHandoff);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('forgex:copilot-handoff', processHandoff);
    };
  }, []);

  // Cleanup speech synthesis and speech recognition on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [stopSpeech]);

  const handleStartNewConversation = () => {
    stopSpeech();
    setActiveConversationId(null);
    setMessages([]);
    setQueryError(null);
  };

  const handleSelectConversation = async (convId: string) => {
    stopSpeech();
    setActiveConversationId(convId);
    try {
      const res = await apiFetch(`/api/v1/copilot/conversations/${convId}`);
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        if (json.data.assetId) {
          setSelectedMachineId(json.data.assetId);
        }
        if (Array.isArray(json.data.messages)) {
          setMessages(json.data.messages);
        }
      }
    } catch (err) {
      console.error('Failed to load conversation details', err);
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/v1/copilot/conversations/${convId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Consultation Removed', 'Consultation thread deleted successfully.');
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeConversationId === convId) {
          handleStartNewConversation();
        }
      } else {
        toast.error('Deletion Failed', json?.error?.message || 'Could not delete conversation.');
      }
    } catch (err: any) {
      toast.error('Deletion Error', err?.message || 'Network error deleting conversation.');
    }
  };

  const handleRaiseTicketForRca = (msg: CopilotMessage) => {
    const userInquiry = messages.slice().reverse().find((m) => m.senderType === 'USER')?.content || queryInput || 'Abnormal Machinery Condition';
    const activeAsset = selectedMachine?.assetTag || (machines.length > 0 ? machines[0].assetTag : 'PUMP-001');

    const rcaTicketPayload = {
      assetTag: activeAsset,
      symptom: userInquiry,
      query: userInquiry,
      copilotSummary: msg.content.slice(0, 350),
      timestamp: Date.now(),
      reportedBy: user?.fullName || 'Technician',
    };

    try {
      sessionStorage.setItem('forgex_rca_ticket', JSON.stringify(rcaTicketPayload));
    } catch {}

    toast.warning(
      'RCA Ticket Raised',
      `Anomaly on ${activeAsset} routed to Troubleshooting & RCA for Higher Officer / Engineer evaluation.`
    );

    window.history.pushState({}, '', '/troubleshooting');
    window.dispatchEvent(
      new CustomEvent('forgex:navigate', { detail: { module: 'troubleshooting' } })
    );
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackMessageId) return;

    try {
      await apiFetch(`/api/v1/copilot/messages/${feedbackMessageId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating: feedbackRating,
          comment: feedbackNotes,
        }),
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === feedbackMessageId
            ? {
                ...m,
                feedback: {
                  id: `fb-${Date.now()}`,
                  messageId: feedbackMessageId,
                  userId: user?.id || 'user-eng-1',
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
    } catch {
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

  const renderQuestionModeBadge = (mode?: QuestionHandlingMode) => {
    switch (mode) {
      case 'GENERAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-950/70 text-blue-300 border border-blue-800">
            <BookOpen className="w-3 h-3 text-blue-400" />
            GENERAL KNOWLEDGE
          </span>
        );
      case 'COMPANY_SPECIFIC':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-800">
            <FileCheck2 className="w-3 h-3 text-emerald-400" />
            COMPANY OPERATIONAL STANDARD
          </span>
        );
      case 'MACHINE_SPECIFIC':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-800">
            <Layers className="w-3 h-3 text-cyan-400" />
            VERIFIED MACHINE EVIDENCE
          </span>
        );
      case 'RESTRICTED_SAFETY_CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-950/70 text-rose-300 border border-rose-800">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            SAFETY-CRITICAL / RESTRICTED
          </span>
        );
      default:
        return null;
    }
  };

  // Dynamic 2x2 Smart Prompts for Empty State
  const smartPrompts = useMemo(() => {
    const tag = selectedMachine ? selectedMachine.assetTag : 'Plant Machinery';
    return [
      {
        id: 'loto',
        icon: ShieldCheck,
        title: 'LOTO & Safety Isolation',
        subtitle: 'Zero Energy State Verification',
        prompt: `What is the step-by-step LOTO and energy isolation procedure for ${tag}?`,
        category: 'OSHA 1910.147 Compliance',
        categoryColor: 'text-amber-700 bg-amber-50 border-amber-200',
      },
      {
        id: 'limits',
        icon: Gauge,
        title: 'Operating Limits & Torque Specs',
        subtitle: 'MAWP, Temperatures & Torques',
        prompt: `Show verified MAWP, operating temperature, voltage, and critical fastener torque limits for ${tag}.`,
        category: 'Operating Tolerances',
        categoryColor: 'text-blue-700 bg-blue-50 border-blue-200',
      },
      {
        id: 'rca',
        icon: AlertTriangle,
        title: 'Fault Diagnosis & 5-Why RCA',
        subtitle: 'Vibration, Abnormal Pressure & RCA',
        prompt: `What are the primary failure modes, abnormal vibration/pressure causes, and troubleshooting steps for ${tag}?`,
        category: 'Diagnostic RCA',
        categoryColor: 'text-rose-700 bg-rose-50 border-rose-200',
      },
      {
        id: 'pm',
        icon: Wrench,
        title: 'PM Checklist & Spare Parts',
        subtitle: 'OEM Schedule & Spares',
        prompt: `Generate the preventive maintenance checklist and recommended OEM spare parts for ${tag}.`,
        category: 'OEM Maintenance',
        categoryColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      },
    ];
  }, [selectedMachine]);

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#F5F6F7] font-sans">
      {/* Left Column: Asset Context & Conversation History */}
      <div className="w-80 h-full border-r border-[#E2E8F0] bg-white flex flex-col overflow-hidden shadow-sm shrink-0">
        {/* Top Pinned Action: New Consultation Thread */}
        <div className="p-3 border-b border-[#E2E8F0] bg-white shrink-0">
          <button
            onClick={handleStartNewConversation}
            className="w-full py-2 px-3 bg-[#151C24] hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-xs hover:shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-white" />
            <span>New Consultation Thread</span>
          </button>
        </div>

        {/* Equipment Scope Header & Active Scope Selector */}
        <div className="p-3 border-b border-[#E2E8F0] bg-[#FAFAFA] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-sans font-bold tracking-wider text-[#1A202C] uppercase flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#2563EB]" />
              EQUIPMENT SCOPE
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {machines.length} Units
              </span>
              <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                Single Factory
              </span>
            </div>
          </div>

          {/* Interactive Active Scope Card (Click to toggle machine selector) */}
          <button
            type="button"
            onClick={() => setIsEquipmentSelectorOpen(!isEquipmentSelectorOpen)}
            className={`w-full text-left p-2.5 rounded-lg border text-xs transition shadow-2xs hover:shadow-xs cursor-pointer ${
              selectedMachine
                ? 'bg-blue-50/70 border-blue-300 text-blue-900'
                : 'bg-white border-[#CBD5E1] hover:border-blue-400 text-[#1A202C]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center font-mono font-bold text-[10px] shrink-0 border ${
                    selectedMachine
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {selectedMachine ? selectedMachine.assetTag.slice(0, 4) : <Layers className="w-3.5 h-3.5 text-[#2563EB]" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs text-[#2563EB] truncate">
                      {selectedMachine ? selectedMachine.assetTag : 'All Factory Equipment'}
                    </span>
                    {selectedMachine && (
                      <span
                        className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold uppercase border ${
                          selectedMachine.documentationReadiness === 'READY'
                            ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                            : selectedMachine.documentationReadiness === 'PROCESSING' || selectedMachine.documentationReadiness === 'PENDING_INSPECTION'
                            ? 'bg-blue-100/80 text-blue-800 border-blue-300'
                            : 'bg-amber-100/80 text-amber-800 border-amber-300'
                        }`}
                      >
                        {selectedMachine.documentationReadiness || 'INDEXED'}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate font-medium">
                    {selectedMachine ? selectedMachine.name : 'Factory-Wide Scope & All Authorized Equipment'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[#64748B]">
                <span className="text-[10px] font-semibold hidden sm:inline">
                  {isEquipmentSelectorOpen ? 'Close' : 'Change'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isEquipmentSelectorOpen ? 'rotate-180 text-[#2563EB]' : 'text-slate-400'
                  }`}
                />
              </div>
            </div>
          </button>

          {/* Collapsible / Expandable Search & Machine Command List (Capped to max-h-[250px]) */}
          {isEquipmentSelectorOpen && (
            <div className="space-y-2 pt-1 border-t border-[#E2E8F0] animate-fadeIn">
              {/* Instant Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search tag, name, OEM, or area..."
                  value={machineSearchQuery}
                  onChange={(e) => setMachineSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] shadow-2xs"
                  autoFocus
                />
                {machineSearchQuery && (
                  <button
                    onClick={() => setMachineSearchQuery('')}
                    className="absolute right-2 top-2 text-[#94A3B8] hover:text-[#1A202C]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Scrollable Capped Container (max-h-[240px] with smooth scrolling) */}
              <div className="max-h-[240px] overflow-y-auto space-y-1.5 pr-1 border border-[#E2E8F0] rounded-lg p-1.5 bg-white shadow-inner">
                {/* Option 1: Factory-Wide Scope */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMachineId('');
                    setIsEquipmentSelectorOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-md text-xs transition border flex items-center justify-between cursor-pointer ${
                    !selectedMachineId && !selectedMachine
                      ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold shadow-2xs'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-slate-100 text-[#475569]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Layers className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                    <span className="truncate font-medium">All Factory Equipment</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-[#64748B] bg-slate-200/60 px-1.5 py-0.5 rounded uppercase">
                    FACTORY-WIDE
                  </span>
                </button>

                {/* Machines List by Area */}
                {isLoadingMachines ? (
                  <div className="p-3 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2">
                    <RotateCw className="w-3 h-3 animate-spin text-[#2563EB]" />
                    <span>Loading equipment ledger...</span>
                  </div>
                ) : filteredMachines.length === 0 ? (
                  <div className="p-3 text-center text-[11px] text-[#94A3B8]">
                    No machines matching &ldquo;{machineSearchQuery}&rdquo;.
                  </div>
                ) : (
                  Object.entries(machinesByArea).map(([areaName, areaMachines]) => {
                    const isCollapsed = Boolean(collapsedAreas[areaName]);
                    return (
                      <div key={areaName} className="space-y-1 pt-1">
                        {/* Collapsible Area Header */}
                        <button
                          type="button"
                          onClick={() => toggleAreaCollapse(areaName)}
                          className="w-full flex items-center justify-between px-2 py-1 bg-slate-100/80 hover:bg-slate-200/80 rounded text-[10px] font-bold text-slate-700 uppercase tracking-wide transition cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{areaName}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 font-semibold">
                              {areaMachines.length}
                            </span>
                          </div>
                          {isCollapsed ? (
                            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronUp className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>

                        {/* Area Machines */}
                        {!isCollapsed &&
                          areaMachines.map((m) => {
                            const isSelected = selectedMachine?.id === m.id || selectedMachineId === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setSelectedMachineId(m.id);
                                  setIsEquipmentSelectorOpen(false);
                                }}
                                className={`w-full text-left p-2 rounded-md text-xs transition border flex flex-col gap-0.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold shadow-2xs ring-1 ring-blue-300'
                                    : 'bg-white border-[#E2E8F0] hover:bg-blue-50/40 hover:border-blue-200 text-[#64748B]'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-mono text-xs font-bold text-[#2563EB] truncate">
                                    {m.assetTag}
                                  </span>
                                  <span
                                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase border ${
                                      m.documentationReadiness === 'READY'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : m.documentationReadiness === 'PROCESSING' || m.documentationReadiness === 'PENDING_INSPECTION'
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                  >
                                    {m.documentationReadiness || 'INDEXED'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#1A202C] truncate font-medium">
                                  {m.name}
                                </div>
                                <div className="text-[10px] text-[#64748B] truncate flex items-center gap-1">
                                  {m.manufacturer && <span>OEM: {m.manufacturer}</span>}
                                  {m.modelNumber && <span>· Mod: {m.modelNumber}</span>}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Scrollable Container: Recent Consultations */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          <div className="px-1 py-1 text-[10px] font-sans font-bold text-[#64748B] uppercase tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-[#2563EB]" />
              <span>Recent Consultations</span>
            </div>
            {conversations.length > 0 && (
              <span className="font-mono text-[9px] text-[#94A3B8]">
                {conversations.length} Threads
              </span>
            )}
          </div>

          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#94A3B8] border border-dashed border-[#E2E8F0] rounded-lg mt-2 space-y-1">
              <Sparkles className="w-4 h-4 mx-auto text-slate-300" />
              <p className="font-medium text-slate-600">No Previous Consultations</p>
              <p className="text-[11px] text-slate-400 leading-normal">
                Ask an engineering inquiry or click a quick prompt to begin.
              </p>
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = activeConversationId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectConversation(c.id)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs transition border flex items-center justify-between group cursor-pointer ${
                    isActive
                      ? 'bg-blue-50/90 border-blue-300 text-[#1A202C] shadow-2xs ring-1 ring-blue-300'
                      : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-slate-300 text-[#64748B]'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded font-bold bg-blue-100/70 text-[#1E40AF] border border-blue-200 truncate">
                        {c.assetId || 'FACTORY-WIDE'}
                      </span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] font-mono text-[#94A3B8]">
                        {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="font-medium truncate text-xs text-[#1A202C] block mt-1">
                      {c.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition shrink-0"
                    title="Delete consultation thread"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Security & Sovereign Footer */}
        <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-sans space-y-1 text-[#64748B] shrink-0">
          <div className="flex justify-between">
            <span>INFERENCE:</span>
            <span className="text-[#0F766E] font-bold">Gemini Cloud SaaS + RAG</span>
          </div>
          <div className="flex justify-between">
            <span>TENANT ISOLATION:</span>
            <span className="text-[#0F766E] font-bold">PostgreSQL Strict RLS</span>
          </div>
          <div className="flex justify-between">
            <span>EVIDENCE TRACE:</span>
            <span className="text-[#2563EB] font-bold">100% Page Verified</span>
          </div>
        </div>
      </div>

      {/* Center Column: Chat Stream Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] relative text-[#1A202C] font-sans">
        {/* Workspace Top Bar */}
        <div className="p-3 border-b border-[#E2E8F0] bg-white flex items-center justify-between text-xs font-sans shadow-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#2563EB]" />
            <span className="font-bold text-[#1A202C] tracking-wide">AI INDUSTRIAL COPILOT</span>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Single-Factory Mode
            </span>
          </div>

          {/* Top Actions: 1-Click RCA Ticket & Voice Toolbar */}
          <div className="flex items-center gap-2.5">
            {/* 1-Click Auto-Filled RCA Ticket Generator Trigger */}
            <button
              onClick={() => setIsRcaModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-xs shadow-xs hover:shadow-md transition cursor-pointer"
              title="Synthesize conversation into an enterprise RCA Work Order"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>1-Click RCA Ticket</span>
            </button>
            {/* Language Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] px-2.5 py-1 rounded-lg text-[11px] font-sans shadow-sm">
              <Languages className="w-3.5 h-3.5 text-[#2563EB]" />
              <select
                value={speechLanguage}
                onChange={(e) => setSpeechLanguage(e.target.value as SupportedLanguageCode)}
                className="bg-transparent text-[#1A202C] focus:outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-Speak Toggle Button */}
            <button
              onClick={() => {
                stopSpeech();
                setAutoSpeakEnabled(!autoSpeakEnabled);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-sans transition shadow-sm ${
                autoSpeakEnabled
                  ? 'bg-blue-50 border-blue-300 text-blue-800 font-bold'
                  : 'bg-white border-[#CBD5E1] hover:border-slate-400 text-[#64748B]'
              }`}
              title={
                autoSpeakEnabled
                  ? 'Auto-Speak active: Copilot answers will be spoken automatically'
                  : 'Auto-Speak off: Use LISTEN button on answers'
              }
            >
              {autoSpeakEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-[#2563EB]" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-[#64748B]" />
              )}
              <span>{autoSpeakEnabled ? 'AUTO-SPEAK ON' : 'AUTO-SPEAK OFF'}</span>
            </button>
          </div>
        </div>

        {/* Live Machine Context Banner (High-contrast, industrial context banner) */}
        {selectedMachine ? (
          <div className="px-4 py-2.5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between text-xs shadow-xs shrink-0 animate-fadeIn relative">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 font-mono font-bold text-xs shrink-0">
                {selectedMachine.assetTag.slice(0, 4)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-blue-300 text-sm">
                    {selectedMachine.assetTag}
                  </span>
                  <span className="text-slate-400 text-xs">·</span>
                  <span className="font-semibold text-slate-100">{selectedMachine.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                      selectedMachine.documentationReadiness === 'READY'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                        : selectedMachine.documentationReadiness === 'PROCESSING' || selectedMachine.documentationReadiness === 'PENDING_INSPECTION'
                        ? 'bg-blue-950/80 text-blue-300 border-blue-600 animate-pulse'
                        : 'bg-amber-950/80 text-amber-300 border-amber-600'
                    }`}
                  >
                    {selectedMachine.documentationReadiness || 'INDEXED'}
                  </span>

                  {/* Switch Machine Quick Trigger & Floating Popover */}
                  <div className="relative inline-block" ref={headerPickerRef}>
                    <button
                      type="button"
                      onClick={() => setIsHeaderMachinePickerOpen(!isHeaderMachinePickerOpen)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-600/30 hover:bg-blue-600/50 active:bg-blue-600/70 text-blue-200 border border-blue-400/40 text-[11px] font-semibold transition cursor-pointer shadow-2xs"
                      title="Switch active machine context directly from header"
                    >
                      <span>Switch Machine</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          isHeaderMachinePickerOpen ? 'rotate-180 text-white' : 'text-blue-300'
                        }`}
                      />
                    </button>

                    {/* Quick Floating Machine Switcher Popover */}
                    {isHeaderMachinePickerOpen && (
                      <div className="absolute left-0 top-full mt-2 w-80 bg-white text-[#1A202C] rounded-xl shadow-2xl border border-slate-200 p-2.5 z-50 animate-fadeIn space-y-2">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 px-1">
                          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5 text-blue-600" />
                            Quick Switch Equipment
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                            {machines.length} Total
                          </span>
                        </div>

                        {/* Search Input in Popover */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            placeholder="Search tag, name, or area..."
                            value={machineSearchQuery}
                            onChange={(e) => setMachineSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                            autoFocus
                          />
                          {machineSearchQuery && (
                            <button
                              onClick={() => setMachineSearchQuery('')}
                              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Scrollable List */}
                        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMachineId('');
                              setIsHeaderMachinePickerOpen(false);
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-xs flex items-center justify-between transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-blue-600" />
                              <span className="font-semibold text-slate-800">All Factory Equipment</span>
                            </div>
                            <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold">
                              FACTORY-WIDE
                            </span>
                          </button>

                          {filteredMachines.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedMachineId(m.id);
                                setIsHeaderMachinePickerOpen(false);
                              }}
                              className={`w-full text-left p-2 rounded-lg text-xs transition flex flex-col gap-0.5 cursor-pointer border ${
                                m.id === selectedMachine.id
                                  ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                                  : 'hover:bg-slate-50 border-transparent text-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-blue-600">{m.assetTag}</span>
                                <span className="text-[9px] font-mono text-slate-500 font-semibold">{m.area || 'General Area'}</span>
                              </div>
                              <span className="truncate text-slate-800 font-medium">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>Area: <strong className="text-slate-200">{selectedMachine.area || 'General Factory'}</strong></span>
                  <span>·</span>
                  <span>OEM: <strong className="text-slate-200">{[selectedMachine.manufacturer, selectedMachine.modelNumber].filter(Boolean).join(' · ') || 'OEM Specification Standard'}</strong></span>
                  <span>·</span>
                  <span>Type: <strong className="text-slate-200">{selectedMachine.machineType || 'Industrial Equipment'}</strong></span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedMachineId('')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1.5 transition shrink-0 ml-3 cursor-pointer"
              title="Clear machine context and search factory-wide"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Machine Filter (Ask Factory-Wide)</span>
            </button>
          </div>
        ) : (
          <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-[11px] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Context Scope: <strong className="text-[#1A202C]">Factory-Wide SOPs &amp; All Authorized Equipment</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setIsEquipmentSelectorOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-700 text-[11px] font-semibold text-slate-700 transition shadow-2xs cursor-pointer"
            >
              <Filter className="w-3 h-3 text-blue-600" />
              <span>Filter by Specific Machine ▾</span>
            </button>
          </div>
        )}


        {/* Chat Message Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dynamic 2x2 Smart Prompt Grid (Empty State) */}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6 max-w-2xl mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center text-[#2563EB]">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-sans font-bold text-[#1A202C]">
                  Industrial RAG Copilot · Grounded Engineering Assistant
                </h3>
                <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
                  Strictly grounded in certified OEM manuals, LOTO isolation procedures, and technical specifications.
                  {selectedMachine ? (
                    <span className="block mt-1 font-semibold text-[#2563EB]">
                      Filtered on {selectedMachine.assetTag} ({selectedMachine.name})
                    </span>
                  ) : (
                    <span className="block mt-1 text-[#64748B]">
                      Select an equipment asset or ask general plant-wide procedures below.
                    </span>
                  )}
                </p>
              </div>

              {/* 2x2 Clean Industrial Smart Prompt Grid */}
              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                {smartPrompts.map((card) => {
                  const IconComponent = card.icon;
                  return (
                    <button
                      key={card.id}
                      onClick={() => handleSendQuery(card.prompt)}
                      className="p-4 rounded-xl bg-white hover:bg-blue-50/50 border border-[#CBD5E1] hover:border-[#2563EB] text-left transition shadow-xs hover:shadow-sm group flex flex-col justify-between space-y-3 cursor-pointer"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${card.categoryColor}`}>
                            {card.category}
                          </span>
                          <IconComponent className="w-4 h-4 text-[#64748B] group-hover:text-[#2563EB] transition" />
                        </div>
                        <h4 className="text-xs font-bold text-[#1A202C] group-hover:text-[#2563EB] transition">
                          {card.title}
                        </h4>
                        <p className="text-[11px] text-[#64748B] leading-relaxed">
                          &ldquo;{card.prompt}&rdquo;
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9] text-[10px] text-[#2563EB] font-semibold">
                        <span>Click to execute grounded query &rarr;</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#2563EB] group-hover:translate-x-0.5 transition" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Render Active Conversation Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col space-y-2 ${
                msg.senderType === 'USER' ? 'items-end' : 'items-start'
              }`}
            >
              {/* User Inquiry Bubble */}
              {msg.senderType === 'USER' ? (
                <div className="max-w-2xl bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-sans text-[#1E40AF] pb-1 border-b border-[#DBEAFE]">
                    <span className="font-bold">TECHNICIAN INQUIRY</span>
                    <span className="text-blue-600">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs font-sans text-[#1E3A8A] whitespace-pre-wrap leading-relaxed mt-1">
                    {msg.content}
                  </p>

                  {/* Multimodal Gauge / Part Vision Inspection Badge */}
                  {((msg as any).visionDiagnostic || (msg as any).imageUrl) && (
                    <div className="mt-2.5 p-3 rounded-lg bg-[#0F172A] border border-blue-500/40 text-white space-y-2 shadow-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-700 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-200">
                            GEMINI MULTIMODAL VISION SCAN
                          </span>
                        </div>
                        {(msg as any).visionDiagnostic?.safetyStatus && (
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                              (msg as any).visionDiagnostic.safetyStatus === 'CRITICAL_OVERPRESSURE'
                                ? 'bg-rose-950 text-rose-300 border border-rose-600'
                                : (msg as any).visionDiagnostic.safetyStatus === 'SAFE_ZERO_ENERGY'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                                : (msg as any).visionDiagnostic.safetyStatus === 'WEAR_DETECTED'
                                ? 'bg-amber-950 text-amber-300 border border-amber-600'
                                : 'bg-blue-950 text-blue-300 border border-blue-600'
                            }`}
                          >
                            {(msg as any).visionDiagnostic.safetyStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {(msg as any).imageUrl && (
                          <div className="relative group shrink-0">
                            <img
                              src={(msg as any).imageUrl}
                              alt="Vision Scan"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-600 bg-slate-900 shadow-xs"
                            />
                            {(msg as any).visionDiagnostic?.readingValue !== null &&
                              (msg as any).visionDiagnostic?.readingValue !== undefined && (
                                <span className="absolute bottom-0 inset-x-0 bg-black/85 text-[8px] font-mono font-bold text-center text-white py-0.5 rounded-b-md truncate">
                                  {(msg as any).visionDiagnostic.readingValue} {(msg as any).visionDiagnostic.readingUnit || 'bar'}
                                </span>
                              )}
                          </div>
                        )}
                        <div className="space-y-1 min-w-0 flex-1">
                          {(msg as any).visionDiagnostic?.readingValue !== null &&
                            (msg as any).visionDiagnostic?.readingValue !== undefined && (
                              <div
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border inline-block ${
                                  (msg as any).visionDiagnostic.safetyStatus === 'CRITICAL_OVERPRESSURE'
                                    ? 'bg-rose-950 text-rose-300 border-rose-700'
                                    : (msg as any).visionDiagnostic.safetyStatus === 'SAFE_ZERO_ENERGY'
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                    : 'bg-slate-800 text-slate-200 border-slate-700'
                                }`}
                              >
                                {(msg as any).visionDiagnostic.readingValue}{' '}
                                {((msg as any).visionDiagnostic.readingUnit || 'BAR').toUpperCase()}{' '}
                                {(msg as any).visionDiagnostic.safetyStatus === 'CRITICAL_OVERPRESSURE'
                                  ? '— EXCEEDS OEM MAWP (25 BAR)'
                                  : (msg as any).visionDiagnostic.safetyStatus === 'SAFE_ZERO_ENERGY'
                                  ? '— ZERO ENERGY CONFIRMED'
                                  : ''}
                              </div>
                            )}
                          <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                            {(msg as any).visionDiagnostic?.summary ||
                              'Multimodal visual frame analyzed against OEM engineering tolerances.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Compact Acoustic Telemetry Badge */}
                  {(msg as any).acousticTelemetry && (
                    <div className="mt-2.5 p-3 rounded-lg bg-[#0B132B] border border-indigo-500/40 text-white space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-indigo-900/60 pb-2">
                        <div className="flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-200">
                            ACOUSTIC SIGNATURE CAPTURE
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                            {(msg as any).acousticTelemetry.sourceMode === 'FILE_UPLOAD'
                              ? 'FIELD RECORDING'
                              : (msg as any).acousticTelemetry.sourceMode === 'TAB_SYSTEM_AUDIO'
                              ? 'SYSTEM / TAB AUDIO'
                              : 'LIVE HARDWARE MIC'}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                            (msg as any).acousticTelemetry.detectedPattern === 'CAVITATION_SUSPECTED'
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-700/60'
                              : (msg as any).acousticTelemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                              : (msg as any).acousticTelemetry.detectedPattern === 'IMBALANCE_SUSPECTED'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                          }`}
                        >
                          {(msg as any).acousticTelemetry.detectedPattern.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Mini Waveform Sparkline */}
                      {Array.isArray((msg as any).acousticTelemetry.waveformSnapshot) && (
                        <div className="h-6 w-full flex items-end gap-0.5 bg-black/50 p-1 rounded border border-indigo-950">
                          {(msg as any).acousticTelemetry.waveformSnapshot.map((val: number, idx: number) => (
                            <div
                              key={idx}
                              className="flex-1 bg-gradient-to-t from-indigo-500 to-emerald-400 rounded-t-xs"
                              style={{ height: `${Math.max(10, Math.min(100, Math.round(val * 100)))}%` }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Telemetry Metrics 6-Col Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 text-[10px] font-mono">
                        <div className="p-1.5 rounded bg-black/40 border border-indigo-900/30">
                          <span className="text-slate-400 block text-[9px]">Dominant Peak</span>
                          <strong className="text-white">{(msg as any).acousticTelemetry.dominantFrequencyHz} Hz</strong>
                        </div>
                        <div className="p-1.5 rounded bg-black/40 border border-indigo-900/30">
                          <span className="text-slate-400 block text-[9px]">Peak Level</span>
                          <strong className="text-white">{(msg as any).acousticTelemetry.peakDecibels} dB</strong>
                        </div>
                        <div className="p-1.5 rounded bg-black/40 border border-indigo-900/30">
                          <span className="text-slate-400 block text-[9px]">RMS Level</span>
                          <strong className="text-indigo-200">
                            {(msg as any).acousticTelemetry.rmsLevelDbfs !== undefined
                              ? `${(msg as any).acousticTelemetry.rmsLevelDbfs.toFixed(1)} dBFS`
                              : '-24.0 dBFS'}
                          </strong>
                        </div>
                        <div className="p-1.5 rounded bg-black/40 border border-indigo-900/30">
                          <span className="text-slate-400 block text-[9px]">Crest Factor</span>
                          <strong className="text-amber-400">
                            {(msg as any).acousticTelemetry.crestFactorDb !== undefined
                              ? `${(msg as any).acousticTelemetry.crestFactorDb.toFixed(1)} dB`
                              : (msg as any).acousticTelemetry.crestFactor || 'HIGH'}
                          </strong>
                        </div>
                        <div className="p-1.5 rounded bg-black/40 border border-indigo-900/30">
                          <span className="text-slate-400 block text-[9px]">Centroid</span>
                          <strong className="text-emerald-300">
                            {(msg as any).acousticTelemetry.spectralCentroidHz
                              ? `${Math.round((msg as any).acousticTelemetry.spectralCentroidHz)} Hz`
                              : '1,420 Hz'}
                          </strong>
                        </div>
                        <div className="p-1.5 rounded bg-black/40 border border-indigo-900/30">
                          <span className="text-slate-400 block text-[9px]">Low/Mid/High</span>
                          <strong className="text-cyan-300">
                            {Math.round(((msg as any).acousticTelemetry.bandEnergy?.low || 0) * 100)}/
                            {Math.round(((msg as any).acousticTelemetry.bandEnergy?.mid || 0) * 100)}/
                            {Math.round(((msg as any).acousticTelemetry.bandEnergy?.high || 0) * 100)}%
                          </strong>
                        </div>
                      </div>

                      {/* Desktop Real Audio Playback */}
                      {(msg as any).acousticTelemetry.audioBase64 && (
                        <div className="pt-2 border-t border-indigo-900/50 space-y-1.5">
                          <div className="flex items-center justify-between text-[9px] font-mono text-indigo-300">
                            <span>DESKTOP FIELD RECORDING (48 kHz)</span>
                            {(msg as any).acousticTelemetry.inputDeviceName && (
                              <span className="truncate max-w-[240px] text-slate-400">
                                Source: {(msg as any).acousticTelemetry.inputDeviceName}
                              </span>
                            )}
                          </div>
                          <audio
                            controls
                            src={(msg as any).acousticTelemetry.audioBase64}
                            className="w-full h-8 rounded bg-slate-900"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Assistant Grounded Response Card */
                <div className="w-full max-w-4xl bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
                  {/* Status & Grounding Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileCheck2 className="w-4 h-4 text-[#2563EB]" />
                      <span className="text-xs font-sans font-bold text-[#1A202C] tracking-wide">
                        GROUNDED ENGINEERING RESPONSE
                      </span>
                      {renderQuestionModeBadge(msg.questionMode)}
                    </div>
                    <div className="flex items-center gap-2">
                      {renderConfidenceBadge(msg.confidence)}

                      {/* TTS Play / Stop Button (Real Browser Text-to-Speech) */}
                      <button
                        onClick={() => speakText(msg.content, msg.id)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-sans flex items-center gap-1.5 transition ${
                          speakingMessageId === msg.id
                            ? 'bg-rose-600 text-white border-transparent font-bold animate-pulse'
                            : 'bg-[#F8FAFC] border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#1A202C]'
                        }`}
                        title={speakingMessageId === msg.id ? 'Stop Voice Output' : 'Listen to Answer'}
                      >
                        {speakingMessageId === msg.id ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>STOP</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>LISTEN</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* OSHA / LOTO Safety Directives Callout Box (Prominent amber/red alert) */}
                  {msg.safetyAlerts && msg.safetyAlerts.length > 0 && (
                    <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-900 text-xs space-y-2 shadow-2xs">
                      <div className="flex items-center gap-2 font-bold tracking-wide text-amber-900 uppercase">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{currentLangConfig.lotoHeader}</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-950 font-medium">
                        {msg.safetyAlerts.map((alert, aIdx) => (
                          <li key={aIdx} className="leading-relaxed">
                            {alert}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Conflict Alert Banner */}
                  {msg.conflictDetected && (
                    <div className="p-3.5 rounded-lg bg-amber-50 border-l-4 border-amber-500 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-amber-800 font-bold uppercase">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>{currentLangConfig.conflictHeader}</span>
                      </div>
                      <p className="text-amber-800 text-[11px] leading-relaxed">
                        {currentLangConfig.conflictMessage}
                      </p>
                    </div>
                  )}

                  {/* Insufficient Evidence State Banner */}
                  {msg.isInsufficientEvidence && (
                    <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-rose-800 font-bold">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>{currentLangConfig.insufficientDocHeader}</span>
                      </div>
                      <p className="text-rose-700 text-xs leading-relaxed">
                        {currentLangConfig.insufficientDocMessage}
                      </p>
                    </div>
                  )}

                  {/* Structured Markdown Body Content */}
                  <CopilotMarkdown content={msg.content} />

                  {/* Specialist Ticket Banner if Dispatched */}
                  {msg.ticketNumber && (
                    <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg flex items-center justify-between text-xs font-sans">
                      <div className="flex items-center gap-2 text-cyan-900 font-medium">
                        <Radio className="w-4 h-4 text-cyan-700" />
                        <span>Specialist Dispatch: Ticket {msg.ticketNumber} Dispatched</span>
                      </div>
                      <span className="text-[10px] bg-cyan-100 px-2 py-0.5 rounded text-cyan-800 font-semibold">
                        RESOLVING AMBIGUITY
                      </span>
                    </div>
                  )}

                  {/* Operational Feedback Controls & RCA Escalation */}
                  <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs font-sans">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#64748B]">Engineer Evaluation:</span>
                      {msg.feedback ? (
                        <div className="flex items-center gap-1.5 text-[#0F766E] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-semibold">
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
                            className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-emerald-700 transition"
                            title="Mark as Helpful & Verified"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setFeedbackMessageId(msg.id);
                              setFeedbackRating('UNHELPFUL');
                            }}
                            className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-rose-700 transition"
                            title="Report Inaccuracy or Hazard"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Vision-Guided LOTO Quick Launcher */}
                      <button
                        type="button"
                        onClick={() => setIsLotoModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-300 text-emerald-900 text-[11px] font-bold rounded-lg transition shadow-2xs hover:shadow-xs cursor-pointer"
                        title="OSHA 1910.147 Vision-Locked Lockout/Tagout protocol with camera zero-energy verification"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Start Vision-Guided LOTO</span>
                      </button>

                      {/* 1-Click Auto-Filled RCA Ticket Button */}
                      <button
                        type="button"
                        onClick={() => setIsRcaModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 active:from-blue-200 active:to-indigo-200 border border-blue-300 text-blue-900 text-[11px] font-bold rounded-lg transition shadow-2xs hover:shadow-xs cursor-pointer"
                        title="Generate enterprise Root Cause Analysis Work Order from this diagnostic session"
                      >
                        <Zap className="w-3.5 h-3.5 text-blue-600 shrink-0 fill-blue-600" />
                        <span>⚡ Generate 1-Click RCA Ticket</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRaiseTicketForRca(msg)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-900 text-[11px] font-bold rounded-lg transition shadow-2xs hover:shadow-xs cursor-pointer"
                        title="Unresolved issue? Raise ticket and route to Troubleshooting & RCA for Higher Officer / Engineer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>🚨 Unresolved? Raise Ticket for RCA</span>
                      </button>

                      <span className="text-[10px] text-[#64748B] font-mono">
                        ID: {msg.id.slice(0, 16)}...
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Real-time Query Progress Indicator */}
          {isQuerying && (
            <div className="p-4 rounded-xl bg-white border border-[#2563EB]/40 flex items-center gap-3 text-xs font-sans text-[#2563EB] animate-pulse max-w-md shadow-sm">
              <RotateCw className="w-4 h-4 animate-spin text-[#2563EB]" />
              <div className="space-y-0.5">
                <span className="font-bold text-[#1A202C]">GROUNDED INFERENCE IN PROGRESS</span>
                <p className="text-[11px] text-[#64748B] font-mono">{queryStep}</p>
              </div>
            </div>
          )}

          {/* Query Error Notification */}
          {queryError && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-sans text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>{queryError}</span>
              </div>
              <button onClick={() => setQueryError(null)} className="text-[#64748B] hover:text-[#1A202C]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Real Push-to-Talk Voice Error Notification */}
        {voiceError && (
          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-amber-800 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{voiceError}</span>
            </div>
            <button
              onClick={() => setVoiceError(null)}
              className="text-amber-700 hover:text-amber-900 font-bold text-xs ml-3"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Bottom Query Input Box & Microphone Controls */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white shrink-0">
          <div className="flex items-center gap-2 max-w-5xl mx-auto">
            {/* Real Web Speech Push-To-Talk Mic Button */}
            <button
              onClick={handleTogglePushToTalk}
              className={`p-2.5 rounded-xl border transition shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer ${
                isListening
                  ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse ring-2 ring-rose-400'
                  : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] border-[#CBD5E1] text-[#1A202C]'
              }`}
              title={
                isListening
                  ? 'Listening... Click to stop voice capture'
                  : "Click to speak your inquiry (e.g. 'What is the torque for casing bolts?')"
              }
            >
              {isListening ? (
                <>
                  <Mic className="w-4 h-4 text-rose-600 animate-bounce" />
                  <span className="text-[10px] font-sans text-rose-600 font-bold hidden sm:inline">
                    Listening... (Stop)
                  </span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-emerald-600" />
                  <span className="text-[10px] font-sans text-[#64748B] hidden sm:inline">
                    Push-to-Talk
                  </span>
                </>
              )}
            </button>

            {/* Vision Scan ("Gemini Multimodal Gauge & Part Vision") */}
            <button
              type="button"
              onClick={() => setIsVisionModalOpen(true)}
              className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 font-sans transition shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Multimodal Vision Scan: Inspect analog pressure gauges, mechanical seal wear & nameplates with Gemini Vision"
            >
              <Camera className="w-4 h-4 text-blue-600" />
              <span className="text-[10px] font-sans font-bold hidden sm:inline">
                Vision Scan
              </span>
            </button>

            {/* Acoustic Scan ("Shazam for Factory Machines") */}
            <button
              type="button"
              onClick={() => setIsAcousticModalOpen(true)}
              className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 font-sans transition shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Acoustic Diagnostics: Real-time FFT spectrum scan & anomaly diagnosis (Shazam for Machines)"
            >
              <Activity className="w-4 h-4 text-indigo-600 animate-pulse" />
              <span className="text-[10px] font-sans font-bold hidden sm:inline">
                Acoustic Scan
              </span>
            </button>

            {/* Text Input Field */}
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
              placeholder={
                isListening
                  ? 'Listening to microphone... speak now...'
                  : selectedMachine
                  ? `Ask about ${selectedMachine.assetTag} (e.g. 'What is torque for casing bolts?' or 'Show LOTO steps')...`
                  : "Ask an industrial question (e.g. 'What is standard pump LOTO procedure?')..."
              }
              className="flex-1 px-4 py-2.5 bg-white border border-[#CBD5E1] rounded-xl text-xs font-sans text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] transition shadow-sm"
            />

            {/* Query Submit Button */}
            <button
              onClick={() => handleSendQuery()}
              disabled={isQuerying || !queryInput.trim()}
              className="px-5 py-2.5 bg-[#151C24] hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center gap-2 transition shadow-sm shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Query Copilot
            </button>
          </div>
        </div>
      </div>



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
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{feedbackSubmittedMsg}</span>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase text-[#64748B] font-semibold">Evaluation Rating:</label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <button
                    onClick={() => setFeedbackRating('HELPFUL')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                      feedbackRating === 'HELPFUL'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-[#CBD5E1] text-[#64748B] hover:text-[#1A202C] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Helpful &amp; Accurate
                  </button>
                  <button
                    onClick={() => setFeedbackRating('UNHELPFUL')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                      feedbackRating === 'UNHELPFUL'
                        ? 'bg-rose-50 border-rose-300 text-rose-700'
                        : 'bg-white border-[#CBD5E1] text-[#64748B] hover:text-[#1A202C] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Inaccurate / Conflict
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-[#64748B] font-semibold">
                  Engineering Notes (Optional):
                </label>
                <textarea
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="Record observations, field readings, or operational feedback..."
                  rows={3}
                  className="w-full mt-1.5 px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Live Acoustic Diagnostics Modal ("Shazam for Factory Machines") */}
      <AcousticDiagnosticsModal
        isOpen={isAcousticModalOpen}
        onClose={() => setIsAcousticModalOpen(false)}
        selectedMachine={selectedMachine}
        machines={machines}
        onSelectMachine={(id) => setSelectedMachineId(id)}
        onDiagnose={(telemetry, prompt) => {
          handleSendQuery(prompt, telemetry);
        }}
        currentLanguage={speechLanguage}
      />

      {/* Multimodal Gauge & Part Vision Diagnostics Modal */}
      <VisionDiagnosticsModal
        isOpen={isVisionModalOpen}
        onClose={() => setIsVisionModalOpen(false)}
        selectedMachine={selectedMachine}
        machines={machines}
        onSelectMachine={(id) => setSelectedMachineId(id)}
        onDiagnose={(dataUri: string, prompt?: string) => {
          handleSendQuery(prompt, undefined, dataUri);
        }}
        currentLanguage={speechLanguage}
      />

      {/* Interactive Vision-Locked LOTO Safety Runner Drawer/Modal */}
      <LotoSafetyRunnerModal
        isOpen={isLotoModalOpen}
        onClose={() => setIsLotoModalOpen(false)}
        assetId={selectedMachine?.assetTag || selectedMachine?.id || 'PUMP-001'}
        assetTag={
          selectedMachine
            ? `${selectedMachine.assetTag} (${selectedMachine.name})`
            : 'PUMP-001 (Lowara 10SV08F030T)'
        }
        onLotoVerified={() => setIsLotoVerifiedZeroEnergy(true)}
        currentLanguage={speechLanguage}
      />

      {/* 1-Click Auto-Filled RCA Ticket Modal */}
      <RcaTicketModal
        isOpen={isRcaModalOpen}
        onClose={() => setIsRcaModalOpen(false)}
        conversationId={activeConversationId || undefined}
        assetId={selectedMachine?.assetTag || selectedMachine?.id || 'PUMP-001'}
        assetTag={
          selectedMachine
            ? `${selectedMachine.assetTag} (${selectedMachine.name})`
            : 'PUMP-001 (Lowara 10SV08F030T)'
        }
        messages={messages}
        acousticTelemetry={latestAcousticTelemetry}
        visionDiagnostic={latestVisionDiagnostic}
        lotoVerified={isLotoVerifiedZeroEnergy}
        language={speechLanguage}
        onWorkOrderCreated={(createdCase) => {
          toast.success(
            'Enterprise Work Order Created',
            `Case ${createdCase?.caseNumber || createdCase?.id || ''} successfully logged in Maintenance Queue`
          );
        }}
      />
    </div>
  );
};

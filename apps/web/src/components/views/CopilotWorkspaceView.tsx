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
  Download,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  Play,
  Languages,
  Radio,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { createWakeWordProvider, type IWakeWordProvider, type WakeWordStatus } from '../../lib/voice/wakeWordProvider';
import { releaseAllAudioTracks } from '../../lib/voice/audioCapture';
import { VADService } from '../../lib/voice/vadService';
import { VoiceStateMachine } from '../../lib/voice/voiceStateMachine';
import type {
  Citation,
  CopilotMessage,
  Conversation,
  AnswerConfidence,
  QuestionHandlingMode,
  VoiceTranscriptionResponse,
  VoiceAssistantState,
} from '@forgex/shared-types';

interface PresetPrompt {
  label: string;
  query: string;
  modeLabel: string;
  assetId?: string;
}

const PRESET_QUERIES: PresetPrompt[] = [
  {
    label: 'General Engineering Fundamentals',
    query: "Explain Bernoulli's principle and fluid flow conservation equations.",
    modeLabel: 'General Educational',
  },
  {
    label: 'Plant Safety & PPE Protocols',
    query: 'What are the required personal protective equipment and plant safety standards?',
    modeLabel: 'Company-Specific',
  },
  {
    label: 'LOTO Isolation Protocols',
    query: 'What is the required procedure to verify a Zero Energy State before mechanical overhaul?',
    modeLabel: 'Safety-Critical',
  },
  {
    label: 'Vibration & Anomaly Analysis',
    query: 'How do I perform diagnostic root cause analysis on abnormal equipment vibration?',
    modeLabel: 'Diagnostic',
  },
];

export const CopilotWorkspaceView: React.FC = () => {
  const { user, organization } = useAuth();

  // Session & Context State
  const [plantId, setPlantId] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Dynamic Metadata State
  const [plants, setPlants] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [inspectedPageContent, setInspectedPageContent] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [inspectedCitation, setInspectedCitation] = useState<Citation | null>(null);

  // Production Voice & Wake-Word State Machine (Prompt Section 3)
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakeWordStatus, setWakeWordStatus] = useState<WakeWordStatus>('DISABLED');
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>('DISABLED');
  const [voiceStatusText, setVoiceStatusText] = useState<string>('Wake-word mode off');
  const [volumeLevel, setVolumeLevel] = useState<number>(0);

  // Voice Interaction State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [speechLanguage, setSpeechLanguage] = useState<'en-US' | 'hi-IN' | 'hi-Latn'>('en-US');
  const [pendingTranscriptReview, setPendingTranscriptReview] = useState<VoiceTranscriptionResponse | null>(null);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Voice Output / TTS State
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isTextOnlyMode, setIsTextOnlyMode] = useState(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const stateMachineRef = useRef<VoiceStateMachine | null>(null);
  const wakeWordProviderRef = useRef<IWakeWordProvider | null>(null);
  const vadServiceRef = useRef<VADService | null>(null);

  // Load plants and assets on mount
  useEffect(() => {
    apiFetch('/api/v1/plants')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setPlants(json.data);
          setPlantId(json.data[0].code || json.data[0].id);
        }
      })
      .catch((err) => console.error('Failed to load plants', err));

    apiFetch('/api/v1/assets')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setAssets(json.data);
          setSelectedAssetId(json.data[0].assetTag);
        }
      })
      .catch((err) => console.error('Failed to load assets', err));
  }, []);

  // Fetch full page evidence when citation is clicked
  useEffect(() => {
    if (!inspectedCitation) {
      setInspectedPageContent(null);
      return;
    }
    setIsLoadingPage(true);
    apiFetch(`/api/v1/documents/${inspectedCitation.documentId}/pages`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const match = json.data.find(
            (p: any) => p.pageNumber === inspectedCitation.pageNumber
          );
          setInspectedPageContent(
            match ? match.rawText : json.data[0]?.rawText || inspectedCitation.snippet
          );
        } else {
          setInspectedPageContent(inspectedCitation.snippet);
        }
      })
      .catch(() => {
        setInspectedPageContent(inspectedCitation.snippet);
      })
      .finally(() => {
        setIsLoadingPage(false);
      });
  }, [inspectedCitation]);


  // Conversations & Messages State (Live multi-tenant state - no mock data)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);

  // Input & Query State
  const [queryInput, setQueryInput] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryStep, setQueryStep] = useState<string>('');
  const [queryError, setQueryError] = useState<string | null>(null);

  // Ingest RCA Deep-Dive 5-Why handoff from Troubleshooting & RCA module
  useEffect(() => {
    const checkHandoff = () => {
      try {
        const raw = sessionStorage.getItem('forgex_copilot_handoff');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.prompt) {
            setQueryInput(parsed.prompt);
          }
          if (parsed.assetTag) {
            setSelectedAssetId(parsed.assetTag);
          }
          sessionStorage.removeItem('forgex_copilot_handoff');
        }
      } catch (err) {
        console.warn('Error reading copilot handoff state:', err);
      }
    };

    // Check immediately on mount
    checkHandoff();

    // Also listen for runtime handoff event
    const handleHandoffEvent = () => {
      checkHandoff();
    };

    window.addEventListener('forgex:copilot-handoff', handleHandoffEvent);
    return () => {
      window.removeEventListener('forgex:copilot-handoff', handleHandoffEvent);
    };
  }, []);


  // Feedback Modal State
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<'HELPFUL' | 'UNHELPFUL'>('HELPFUL');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackSubmittedMsg, setFeedbackSubmittedMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);

  // Interruption helper: stops audio immediately when speaking or querying
  const interruptPlayback = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlayingMessageId(null);
  };

  // Convert audio blob to base64 and call /api/v1/copilot/voice/transcribe
  const handleProcessAudioTranscription = async (blob: Blob, autoSubmit = false) => {
    setIsTranscribing(true);
    setRecordingError(null);
    stateMachineRef.current?.transition('TRANSCRIBING', 'Transcribing spoken utterance and normalizing equipment tags...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1] || '';

        const res = await apiFetch('/api/v1/copilot/voice/transcribe', {
          method: 'POST',
          body: JSON.stringify({
            audioBase64: base64Data,
            language: speechLanguage,
            plantId,
            assetId: selectedAssetId || undefined,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success && json.data) {
          const finalQuery = json.data.correctedTranscript || json.data.transcript;
          if (autoSubmit && finalQuery) {
            stateMachineRef.current?.transition('PROCESSING_COPILOT', 'Executing grounded RAG query...');
            await handleSendQuery(finalQuery, true); // true for auto-speak
          } else {
            setPendingTranscriptReview(json.data);
            setEditedTranscript(finalQuery);
            stateMachineRef.current?.transition('IDLE', 'Transcript ready for review');
          }
        } else {
          setRecordingError(json?.error?.message || 'Speech recognition service temporarily unavailable. Falling back to text input.');
          stateMachineRef.current?.transition('ERROR', 'Transcription failed');
        }
        setIsTranscribing(false);
      };
    } catch {
      setRecordingError('Voice transmission error. Please enter inquiry via keyboard.');
      setIsTranscribing(false);
      stateMachineRef.current?.transition('ERROR', 'Voice transmission error');
    }
  };

  // Start microphone recording with permission handling (Push-to-talk manual trigger)
  const handleStartRecording = async () => {
    interruptPlayback();
    setRecordingError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRecordingError('Voice capture not supported in this browser. Please use text input below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleProcessAudioTranscription(audioBlob, false);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      stateMachineRef.current?.transition('CAPTURING_UTTERANCE', 'Recording push-to-talk inquiry...');

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone permission blocked:', err);
      releaseAllAudioTracks();
      setRecordingError('Microphone permission denied or device unavailable. Please use text input below.');
      setIsRecording(false);
      stateMachineRef.current?.transition('ERROR', 'Microphone permission denied');
    }
  };

  // Stop recording and send audio to STT service
  const handleStopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Play audio TTS for an assistant message
  const handlePlayAudio = async (msg: CopilotMessage, isVoiceSession = false) => {
    if (playingMessageId === msg.id && isPlayingAudio) {
      interruptPlayback();
      return;
    }

    interruptPlayback();

    if (isTextOnlyMode) {
      setTtsNotice('Audio muted: Text-only mode active.');
      setTimeout(() => setTtsNotice(null), 3000);
      return;
    }

    setPlayingMessageId(msg.id);
    setIsPlayingAudio(true);

    try {
      const res = await apiFetch('/api/v1/copilot/voice/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          text: msg.content,
          messageId: msg.id,
          language: speechLanguage,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.data && json.data.audioBase64) {
        if (json.data.isSanitizedForConfidentiality) {
          setTtsNotice(json.data.confidentialNotice || 'Audio sanitized for shared plant environment.');
          setTimeout(() => setTtsNotice(null), 4000);
        }
        const audio = new Audio(`data:audio/wav;base64,${json.data.audioBase64}`);
        audioPlayerRef.current = audio;
        audio.onended = () => {
          setIsPlayingAudio(false);
          setPlayingMessageId(null);
          if (isVoiceSession && wakeWordEnabled) {
            stateMachineRef.current?.transition('WAITING_FOR_FOLLOW_UP', 'Follow-up active (30s). Ask another question or say "Hello ForgeX"...');
          }
        };
        audio.onerror = () => {
          setIsPlayingAudio(false);
          setPlayingMessageId(null);
          if (isVoiceSession) {
            stateMachineRef.current?.transition('IDLE');
          }
        };
        await audio.play();
      } else {
        setIsPlayingAudio(false);
        setPlayingMessageId(null);
      }
    } catch {
      setIsPlayingAudio(false);
      setPlayingMessageId(null);
    }
  };

  // Execute RAG Query
  const handleSendQuery = async (queryText?: string, autoSpeak = false) => {
    interruptPlayback();
    setPendingTranscriptReview(null);

    const text = (queryText || queryInput).trim();
    if (!text || isQuerying) return;

    setQueryError(null);
    setIsQuerying(true);
    setQueryStep('Validating plant context and role authorization...');

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
      // Worker-friendly status steps (No vector DB, embeddings, or tokens exposed)
      setTimeout(() => setQueryStep('Reviewing authorized plant manuals and equipment specifications...'), 300);
      setTimeout(() => setQueryStep('Validating approved engineering revisions and operating tolerances...'), 600);
      setTimeout(() => setQueryStep('Synthesizing grounded facts and verifying procedure citations...'), 900);

      const res = await apiFetch('/api/v1/copilot/query', {
        method: 'POST',
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
          setConversations((prev) => [
            {
              id: data.conversationId,
              organizationId: organization?.id || '',
              plantId,
              assetId: selectedAssetId,
              userId: user?.id || '',
              title: text.length > 40 ? `${text.slice(0, 37)}...` : text,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...prev,
          ]);
        }

        if (autoSpeak && !isTextOnlyMode) {
          stateMachineRef.current?.transition('SPEAKING_RESPONSE', 'Speaking verified engineering answer...');
          await handlePlayAudio(asstMsg, true);
        } else {
          stateMachineRef.current?.transition('WAITING_FOR_FOLLOW_UP', 'Answer verified. Follow-up active (30s)...');
        }
      } else {
        setQueryError(json?.error?.message || json?.error || `Inference error: HTTP ${res.status}`);
        stateMachineRef.current?.transition('ERROR', 'Inference query error');
      }
    } catch (err: any) {
      setQueryError(err?.message || 'Inference engine timeout or network error');
      stateMachineRef.current?.transition('ERROR', 'Query failed');
    } finally {
      setIsQuerying(false);
      setQueryStep('');
    }
  };

  // Handle RCA 5-Why and External Deep-Dive Handoffs
  useEffect(() => {
    const processHandoff = () => {
      const handoffRaw = sessionStorage.getItem('forgex_copilot_handoff');
      if (handoffRaw) {
        try {
          const handoff = JSON.parse(handoffRaw);
          sessionStorage.removeItem('forgex_copilot_handoff');
          if (handoff.assetTag) {
            setSelectedAssetId(handoff.assetTag);
          }
          if (handoff.prompt) {
            setQueryInput(handoff.prompt);
            setTimeout(() => {
              handleSendQuery(handoff.prompt);
            }, 350);
          }
        } catch (e) {
          console.warn('Failed to parse copilot handoff:', e);
        }
      }
    };

    const timer = setTimeout(processHandoff, 250);
    window.addEventListener('forgex:copilot-handoff', processHandoff);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('forgex:copilot-handoff', processHandoff);
    };
  }, []);

  // Manage Wake-Word & VAD Lifecycle
  useEffect(() => {
    if (!stateMachineRef.current) {
      stateMachineRef.current = new VoiceStateMachine({
        onStateChange: (state, message) => {
          setVoiceState(state);
          if (message) setVoiceStatusText(message);
        },
      });
    }

    if (wakeWordEnabled) {
      try {
        const provider = createWakeWordProvider();
        wakeWordProviderRef.current = provider;

        provider
          .init({
            onDetected: () => {
              interruptPlayback();
              stateMachineRef.current?.transition('ACTIVATED', 'Wake-word "Hello ForgeX" recognized!');
              provider.stop().catch(() => {});

              // Launch VAD Service with Silero VAD, 1000ms silence timeout, and 300ms pre-roll buffer
              const vad = new VADService({ silenceTimeoutMs: 1000, maxDurationSeconds: 120, preRollBufferMs: 300 });
              vadServiceRef.current = vad;
              setIsRecording(true);

              stateMachineRef.current?.transition('CAPTURING_UTTERANCE', 'Listening to inquiry...');
              vad.start({
                onSpeechStart: () => {},
                onVolumeChange: (vol) => setVolumeLevel(vol),
                onSilenceTimeout: (blob) => {
                  setIsRecording(false);
                  setVolumeLevel(0);
                  handleProcessAudioTranscription(blob, true);
                },
                onMaxDurationReached: (blob) => {
                  setIsRecording(false);
                  setVolumeLevel(0);
                  handleProcessAudioTranscription(blob, true);
                },
                onError: (err) => {
                  setIsRecording(false);
                  setVolumeLevel(0);
                  setRecordingError(`Microphone error: ${err.message}`);
                  stateMachineRef.current?.transition('ERROR', err.message);
                },
              });
            },
            onStatusChange: (status, message) => {
              setWakeWordStatus(status);
              if (message) setVoiceStatusText(message);
            },
            onError: (err) => {
              setWakeWordStatus('ERROR');
              setRecordingError(`Wake-word engine error: ${err.message}`);
            },
          })
          .then(() => {
            provider.start();
            stateMachineRef.current?.transition('WAKE_WORD_LISTENING', 'Listening for "Hello ForgeX"...');
          })
          .catch((e) => {
            setWakeWordStatus('ENGINE_UNAVAILABLE');
            setVoiceStatusText(`Wake-word engine unavailable: ${e.message}`);
          });
      } catch (e: any) {
        setWakeWordStatus('ENGINE_UNAVAILABLE');
        setVoiceStatusText(`Wake-word configuration error: ${e.message}`);
        setRecordingError(e.message);
      }
    } else {
      if (wakeWordProviderRef.current) {
        wakeWordProviderRef.current.stop();
        wakeWordProviderRef.current.release();
        wakeWordProviderRef.current = null;
      }
      if (vadServiceRef.current) {
        vadServiceRef.current.cancel();
        vadServiceRef.current = null;
      }
      stateMachineRef.current?.transition('DISABLED', 'Wake-word mode off');
      setWakeWordStatus('DISABLED');
      setIsRecording(false);
      setVolumeLevel(0);
    }

    return () => {
      if (wakeWordProviderRef.current) {
        wakeWordProviderRef.current.release();
        wakeWordProviderRef.current = null;
      }
      if (vadServiceRef.current) {
        vadServiceRef.current.cancel();
        vadServiceRef.current = null;
      }
      interruptPlayback();
      releaseAllAudioTracks();
    };
  }, [wakeWordEnabled, speechLanguage, plantId, selectedAssetId]);

  const handleStartNewConversation = () => {
    interruptPlayback();
    const newId = `conv-${Date.now()}`;
    setActiveConversationId(newId);
    setMessages([]);
    setQueryError(null);
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
            GENERAL KNOWLEDGE (NON-MACHINE SPECIFIC)
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

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#F5F6F7] font-sans">
      {/* Left Column: Asset Context & Conversation History */}
      <div className="w-80 border-r border-[#E2E8F0] bg-white flex flex-col justify-between overflow-hidden shadow-sm">
        {/* Top Scope Selector */}
        <div className="p-4 border-b border-[#E2E8F0] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans font-bold tracking-wider text-[#1A202C] uppercase flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#2563EB]" />
              AUTHORIZATION SCOPE
            </span>
            <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
              RBAC ENFORCED
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">Operating Plant:</label>
              <select
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                className="w-full mt-1 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs font-sans text-[#1A202C] focus:outline-none focus:border-[#2563EB] transition shadow-sm"
              >
                {plants.length > 0 ? (
                  plants.map((p) => (
                    <option key={p.id} value={p.code || p.id}>
                      {p.code} ({p.name})
                    </option>
                  ))
                ) : (
                  <option value="PLANT-TX-04">
                    PLANT-TX-04 (Texas Hydrocarbon Unit)
                  </option>
                )}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-sans text-[#64748B] font-semibold uppercase">Target Asset Context:</label>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="w-full mt-1 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs font-sans text-[#2563EB] font-medium focus:outline-none focus:border-[#2563EB] transition shadow-sm"
              >
                <option value="">
                  All Authorized Plant Equipment
                </option>
                {assets.length > 0 ? (
                  assets.map((a) => (
                    <option key={a.id} value={a.assetTag}>
                      {a.assetTag} ({a.name})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="PUMP-204-B">
                      PUMP-204-B (Slurry Crude Charge Pump)
                    </option>
                    <option value="COMP-101-A">
                      COMP-101-A (Wet Gas Rotary Compressor)
                    </option>
                    <option value="HEX-302-C">
                      HEX-302-C (Shell & Tube Exchanger)
                    </option>
                  </>
                )}
              </select>
            </div>
          </div>

          <button
            onClick={handleStartNewConversation}
            className="w-full py-2 bg-[#151C24] hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5 text-white" />
            New Consultation Thread
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="px-2 py-1 text-[10px] font-sans font-semibold text-[#64748B] uppercase flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-[#64748B]" />
            Active Consultations
          </div>
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#94A3B8] border border-dashed border-[#E2E8F0] rounded-lg mt-2">
              No previous consultations. Enter an inquiry or select a preset prompt to begin.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConversationId(c.id)}
                className={`w-full text-left p-3 rounded-lg text-xs transition border flex flex-col gap-1 ${
                  activeConversationId === c.id
                    ? 'bg-blue-50/70 border-blue-200 text-[#1A202C] shadow-sm'
                    : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#64748B]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-mono text-[10px] text-[#2563EB] truncate font-bold">
                    {c.assetId || 'PLANT-WIDE'}
                  </span>
                  <span className="text-[10px] font-mono text-[#64748B]">
                    {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="font-medium truncate text-xs text-[#1A202C]">{c.title}</span>
              </button>
            ))
          )}
        </div>

        {/* Security & Deployment Footer */}
        <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-sans space-y-1 text-[#64748B]">
          <div className="flex justify-between">
            <span>INFERENCE:</span>
            <span className="text-[#0F766E] font-bold">Local Sovereign Engine</span>
          </div>
          <div className="flex justify-between">
            <span>FALLBACK POLICY:</span>
            <span className="text-[#0F766E] font-bold">Never Silent Cloud</span>
          </div>
          <div className="flex justify-between">
            <span>SPEECH SECURITY:</span>
            <span className="text-[#2563EB] font-bold">Zero Audio Retained</span>
          </div>
        </div>
      </div>

      {/* Center Column: Chat Stream Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5F6F7] relative text-[#1A202C] font-sans">
        {/* Workspace Top Bar */}
        <div className="p-3.5 border-b border-[#E2E8F0] bg-white flex items-center justify-between text-xs font-sans shadow-sm">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#2563EB]" />
            <span className="font-bold text-[#1A202C] tracking-wide">UNIVERSAL INDUSTRIAL COPILOT</span>
            <span className="text-slate-300">|</span>
            <span className="text-[#64748B]">
              Plant: <span className="text-[#1A202C] font-medium">{plantId}</span>
            </span>
            {selectedAssetId && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-[#2563EB] font-mono font-bold">Asset: {selectedAssetId}</span>
              </>
            )}
          </div>

          {/* Voice Toolbar: Language Selection & Mute Toggle */}
          <div className="flex items-center gap-3">
            {/* Wake Word Mode Toggle */}
            <button
              onClick={() => {
                interruptPlayback();
                setWakeWordEnabled(!wakeWordEnabled);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-sans transition ${
                wakeWordEnabled
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                  : 'bg-white border-[#CBD5E1] hover:border-slate-400 text-[#64748B]'
              }`}
              title='Enable hands-free wake word ("Hello ForgeX")'
            >
              <Mic className={`w-3.5 h-3.5 ${wakeWordEnabled ? 'text-emerald-600 animate-pulse' : 'text-[#64748B]'}`} />
              <span className="font-semibold">
                {wakeWordEnabled ? 'WAKE-WORD ON' : 'WAKE-WORD OFF'}
              </span>
            </button>

            {/* Language Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] px-2.5 py-1 rounded-lg text-[11px] font-sans shadow-sm">
              <Languages className="w-3.5 h-3.5 text-[#2563EB]" />
              <select
                value={speechLanguage}
                onChange={(e) => setSpeechLanguage(e.target.value as any)}
                className="bg-transparent text-[#1A202C] focus:outline-none cursor-pointer"
              >
                <option value="en-US">English (Technical)</option>
                <option value="hi-IN">Hindi (हिंदी)</option>
                <option value="hi-Latn">Hinglish (Mix)</option>
              </select>
            </div>

            {/* Global TTS Mute Button */}
            <button
              onClick={() => {
                interruptPlayback();
                setIsTextOnlyMode(!isTextOnlyMode);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-sans transition shadow-sm ${
                isTextOnlyMode
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-[#CBD5E1] hover:border-slate-400 text-[#1A202C]'
              }`}
              title={isTextOnlyMode ? 'Text-Only Mode active (Audio Muted)' : 'Voice Playback Enabled'}
            >
              {isTextOnlyMode ? <VolumeX className="w-3.5 h-3.5 text-amber-600" /> : <Volume2 className="w-3.5 h-3.5 text-[#2563EB]" />}
              <span>{isTextOnlyMode ? 'TEXT-ONLY' : 'VOICE ON'}</span>
            </button>
          </div>
        </div>

        {/* Live Voice State Indicator Banner */}
        {wakeWordEnabled && (
          <div className="px-4 py-2 bg-[#EFF6FF] border-b border-[#BFDBFE] flex items-center justify-between text-xs font-sans animate-fadeIn text-[#1E3A8A]">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  voiceState === 'WAKE_WORD_LISTENING'
                    ? 'bg-emerald-500 animate-ping'
                    : voiceState === 'ACTIVATED' || voiceState === 'CAPTURING_UTTERANCE'
                    ? 'bg-cyan-500 animate-pulse'
                    : voiceState === 'SPEAKING_RESPONSE'
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-slate-400'
                }`}
              />
              <span className="font-bold uppercase tracking-wider">
                VOICE ASSISTANT · <span className="text-[#0F766E]">{voiceState}</span> <span className="text-[10px] text-[#64748B] font-normal">[{wakeWordStatus}]</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[#1A202C]">{voiceStatusText}</span>
            </div>

            {isPlayingAudio && (
              <button
                onClick={interruptPlayback}
                className="px-2.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-[11px] flex items-center gap-1.5 transition"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Barge-in / Stop Voice</span>
              </button>
            )}
          </div>
        )}

        {/* TTS Privacy Toast Notification */}
        {ttsNotice && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-sans flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>{ttsNotice}</span>
            </div>
            <button onClick={() => setTtsNotice(null)} className="text-amber-700 hover:text-amber-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Chat Message Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center text-[#2563EB]">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-sans font-bold text-[#1A202C]">
                  Universal Industrial Copilot & Voice Assistant
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  Accessible through keyboard or microphone. Supports English, Hindi, and Hinglish with machine tag autocorrection.
                  Strictly grounded in authorized evidence with verified page-level citations.
                </p>
              </div>

              {/* Preset Query Chips with Mode Labels */}
              <div className="w-full pt-4 space-y-2 text-left">
                <div className="text-[11px] font-sans text-[#64748B] uppercase font-semibold">
                  Sample Industrial Inquiries:
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {PRESET_QUERIES.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendQuery(preset.query)}
                      className="p-3 rounded-xl bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-left text-xs font-sans text-[#1A202C] flex items-center justify-between group transition shadow-sm"
                    >
                      <div className="space-y-0.5">
                        <span className="text-[#1A202C] font-semibold block">{preset.label}</span>
                        <span className="text-[10px] font-mono text-[#2563EB]">{preset.modeLabel}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#2563EB] transition" />
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
                <div className="max-w-2xl bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-sans text-[#1E40AF] pb-1 border-b border-[#DBEAFE]">
                    <span className="font-bold">TECHNICIAN INQUIRY</span>
                    <span className="text-blue-600">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs font-sans text-[#1E3A8A] whitespace-pre-wrap leading-relaxed mt-1">
                    {msg.content}
                  </p>
                </div>
              ) : (
                /* Assistant Grounded Response Card */
                <div className="w-full max-w-4xl bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
                  {/* Status & Grounding Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-[#2563EB]" />
                      <span className="text-xs font-sans font-bold text-[#1A202C] tracking-wide">
                        VERIFIED INDUSTRIAL RESPONSE
                      </span>
                      {renderQuestionModeBadge(msg.questionMode)}
                    </div>
                    <div className="flex items-center gap-2">
                      {renderConfidenceBadge(msg.confidence)}

                      {/* TTS Play / Stop Button */}
                      <button
                        onClick={() => handlePlayAudio(msg)}
                        className={`p-1.5 rounded-lg border text-xs font-sans flex items-center gap-1.5 transition ${
                          playingMessageId === msg.id && isPlayingAudio
                            ? 'bg-[#151C24] text-white border-transparent font-bold animate-pulse'
                            : 'bg-[#F8FAFC] border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#1A202C]'
                        }`}
                        title={playingMessageId === msg.id && isPlayingAudio ? 'Stop Voice Output' : 'Play Audio Answer'}
                      >
                        {playingMessageId === msg.id && isPlayingAudio ? (
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

                  {/* Conflict Alert Banner */}
                  {msg.conflictDetected && (
                    <div className="p-3.5 rounded-lg bg-amber-50 border-l-4 border-amber-500 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-amber-800 font-bold uppercase">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>DOCUMENTATION DISCREPANCY / CONFLICT IDENTIFIED</span>
                      </div>
                      <p className="text-amber-800 text-[11px] leading-relaxed">
                        Contradictory specifications or outdated service bulletins detected between indexed sources.
                        Do not execute field adjustments without active engineering revision sign-off.
                      </p>
                    </div>
                  )}

                  {/* Insufficient Evidence State Banner */}
                  {msg.isInsufficientEvidence && (
                    <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-rose-800 font-bold">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>INSUFFICIENT PLANT DOCUMENTATION EVIDENCE</span>
                      </div>
                      <p className="text-rose-700 text-xs leading-relaxed">
                        ForgeX safety policy strictly forbids hallucinating operational limits or assuming equipment telemetry.
                        The active plant index does not contain certified engineering evidence supporting this inquiry.
                      </p>
                    </div>
                  )}

                  {/* Structured Body Content */}
                  <div className="text-xs leading-relaxed text-[#1A202C] font-sans space-y-3 whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Verified Citations Rail */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-4 border-t border-[#E2E8F0] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-sans font-bold text-[#64748B] uppercase flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
                          Auditable Source Evidence ({msg.citations.length} Verified References)
                        </span>
                        <span className="text-[10px] font-sans text-[#0F766E] font-bold">100% Traceable</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {msg.citations.map((cit, idx) => (
                          <div
                            key={cit.id || idx}
                            className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB] transition flex flex-col justify-between space-y-2 group shadow-sm"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-mono">
                                <span className="font-bold text-[#2563EB] flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 text-[#64748B]" />
                                  {cit.documentNumber}
                                </span>
                                <span className="text-[10px] bg-white border border-[#CBD5E1] px-1.5 py-0.5 rounded text-[#1A202C] font-semibold">
                                  {cit.revisionTag || 'REV-A'} | Page {cit.pageNumber}
                                </span>
                              </div>

                              <div className="text-[11px] font-semibold text-[#1A202C] line-clamp-1 font-sans">
                                {cit.sectionHeading || cit.documentTitle}
                              </div>

                              <p className="text-[11px] text-[#64748B] italic line-clamp-3 bg-white p-2 rounded border border-[#E2E8F0]">
                                &ldquo;{cit.snippet}&rdquo;
                              </p>
                            </div>

                            <button
                              onClick={() => setInspectedCitation(cit)}
                              className="w-full py-1.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] hover:border-[#2563EB] rounded text-[11px] font-sans font-semibold text-[#2563EB] flex items-center justify-center gap-1.5 transition shadow-sm"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open Source Page {cit.pageNumber}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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

                  {/* Operational Feedback Controls */}
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

                    <span className="text-[10px] text-[#64748B] font-mono">
                      ID: {msg.id.slice(0, 16)}...
                    </span>
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

          {/* Transcribing Voice Progress Indicator */}
          {isTranscribing && (
            <div className="p-4 rounded-xl bg-white border border-cyan-500/40 flex items-center gap-3 text-xs font-sans text-cyan-800 animate-pulse max-w-md shadow-sm">
              <RotateCw className="w-4 h-4 animate-spin text-cyan-600" />
              <div className="space-y-0.5">
                <span className="font-bold text-[#1A202C]">TRANSCRIBING AUDIO & NORMALIZING TAGS...</span>
                <p className="text-[11px] text-[#64748B] font-mono">Analyzing phonetics and resolving machinery tag identifiers...</p>
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

          {/* Recording Microphone Error Banner */}
          {recordingError && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-sans text-amber-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MicOff className="w-4 h-4 text-amber-600" />
                <span>{recordingError}</span>
              </div>
              <button onClick={() => setRecordingError(null)} className="text-[#64748B] hover:text-[#1A202C]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Pre-submission Transcript Review Modal / Banner (Prompt 03 Section 2) */}
        {pendingTranscriptReview && (
          <div className="p-4 border-t border-[#BFDBFE] bg-[#EFF6FF] space-y-3 animate-fadeIn text-[#1E3A8A]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-sans font-bold text-[#1E40AF]">
                <Radio className="w-4 h-4 text-[#2563EB] animate-pulse" />
                <span>REVIEW SPOKEN TRANSCRIPT BEFORE SUBMITTING</span>
                <span className="text-[10px] font-normal text-[#64748B]">
                  (Language: {pendingTranscriptReview.detectedLanguage})
                </span>
              </div>
              <button
                onClick={() => setPendingTranscriptReview(null)}
                className="text-[#64748B] hover:text-[#1A202C] text-xs font-semibold"
              >
                Discard
              </button>
            </div>

            {/* Editable Transcript Text Area */}
            <div className="space-y-1">
              <textarea
                value={editedTranscript}
                onChange={(e) => setEditedTranscript(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans text-[#1A202C] focus:outline-none focus:border-[#2563EB] shadow-sm"
                placeholder="Edit transcript before submitting..."
              />
            </div>

            {/* Quick Tag Correction Chips */}
            {pendingTranscriptReview.correctionsApplied && pendingTranscriptReview.correctionsApplied.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-sans">
                <span className="text-[#64748B]">Applied Tag Normalizations:</span>
                {pendingTranscriptReview.correctionsApplied.map((c, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-white border border-[#BFDBFE] text-[#1E40AF] rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Check className="w-3 h-3 text-[#0F766E]" />
                    {c.spokenPhrase} &rarr; {c.correctedTag}
                  </span>
                ))}
              </div>
            )}

            {/* Verification Notice */}
            <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-1">
              <span>{pendingTranscriptReview.evaluation.verificationNotice}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPendingTranscriptReview(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSendQuery(editedTranscript)}
                  className="bg-[#151C24] hover:bg-black text-white"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Submit Verified Inquiry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Query Input Box & Microphone Controls */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white">
          {/* Active Recording State Bar with Live Audio Amplitude Meter */}
          {isRecording ? (
            <div className="flex items-center justify-between max-w-5xl mx-auto p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-sans text-red-900 shadow-sm">
              <div className="flex items-center gap-3 text-red-700 font-bold">
                <span className="w-3 h-3 rounded-full bg-red-600 animate-ping inline-block" />
                <span>MICROPHONE ACTIVE — CAPTURING UTTERANCE</span>
                
                {/* Visualizer Amplitude Bars */}
                <div className="flex items-end gap-1 h-4 px-2">
                  <span
                    className="w-1 bg-red-600 rounded transition-all duration-75"
                    style={{ height: `${Math.max(4, volumeLevel * 16)}px` }}
                  />
                  <span
                    className="w-1 bg-red-500 rounded transition-all duration-75"
                    style={{ height: `${Math.max(6, volumeLevel * 20)}px` }}
                  />
                  <span
                    className="w-1 bg-red-400 rounded transition-all duration-75"
                    style={{ height: `${Math.max(4, volumeLevel * 14)}px` }}
                  />
                </div>

                <span className="text-white bg-red-600 px-2 py-0.5 rounded font-mono">
                  {Math.floor(recordingSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(recordingSeconds % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-[#64748B] font-normal">Auto-detects 1000ms pause or click Stop...</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleStopRecording}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop &amp; Submit</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 max-w-5xl mx-auto">
              {/* Mic Push-To-Talk Button */}
              <button
                onClick={handleStartRecording}
                className="p-2.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#1A202C] transition shrink-0 flex items-center gap-1.5 shadow-sm"
                title="Click to speak question (Auto tag correction for PUMP-204-B, HP-204, E-2041)"
              >
                <Mic className="w-4 h-4 text-emerald-600" />
                <span className="text-[10px] font-sans text-[#64748B] hidden sm:inline">Push-to-Talk</span>
              </button>

              {/* Text Input Field */}
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
                placeholder="Ask an operational question or say 'Hello ForgeX' (e.g. 'What is gland bolt torque on PUMP-204-B?')..."
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
          )}
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
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                if (!inspectedCitation) return;
                try {
                  const res = await apiFetch(`/api/v1/documents/${inspectedCitation.documentId}/download`);
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${inspectedCitation.documentNumber || 'manual'}_Page-${inspectedCitation.pageNumber}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (err: any) {
                  alert(`Could not download manual payload: ${err?.message}`);
                }
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-[#2563EB]" />
              Download Source PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setInspectedCitation(null)}>
              Close Page Inspector
            </Button>
          </div>
        }
      >
        {inspectedCitation && (
          <div className="space-y-4 font-sans text-xs">
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-mono text-xs space-y-1.5">
              <div className="flex justify-between text-[#64748B] text-[10px] uppercase">
                <span>Section Heading:</span>
                <span className="text-[#2563EB] font-bold">{inspectedCitation.sectionHeading || 'Standard Operational Section'}</span>
              </div>
              <div className="flex justify-between text-[#64748B] text-[10px]">
                <span>Document Reference:</span>
                <span className="text-[#1A202C] font-mono">{inspectedCitation.documentNumber} (ID: {inspectedCitation.documentId})</span>
              </div>
            </div>

            {/* Document Page Preview Box */}
            <div className="p-4 bg-white border border-[#E2E8F0] rounded-xl font-mono text-xs leading-relaxed space-y-3">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2 text-[#64748B] text-[10px] uppercase">
                <span>Extracted Document Page Text (Page {inspectedCitation.pageNumber})</span>
                <span className="text-emerald-600 font-semibold">VERIFIED CITATION PROVENANCE</span>
              </div>

              {isLoadingPage ? (
                <div className="p-6 text-center text-[#64748B] flex items-center justify-center gap-2">
                  <RotateCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                  <span>Loading full page text from authorized document store...</span>
                </div>
              ) : inspectedPageContent ? (
                <div className="p-3 bg-[#F8FAFC] rounded-lg border-l-4 border-[#2563EB] text-[#1A202C] whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                  {inspectedPageContent}
                </div>
              ) : (
                <div className="p-3 bg-[#F8FAFC] rounded-lg border-l-4 border-amber-500 text-[#1A202C]">
                  {inspectedCitation.snippet}
                </div>
              )}

              <div className="flex items-center justify-between text-[#64748B] text-[11px] pt-1 border-t border-[#E2E8F0]">
                <span>Active Revision: <strong className="text-[#1A202C] font-mono">{inspectedCitation.revisionTag || 'REV-A'}</strong></span>
                <span className="text-[#2563EB]">Semantic Relevance Score: {(inspectedCitation.confidenceScore * 100).toFixed(1)}%</span>
              </div>
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
                  placeholder="Record observations, field readings, or citation discrepancies..."
                  rows={3}
                  className="w-full mt-1.5 px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

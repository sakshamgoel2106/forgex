import type { DocumentType } from './documents.js';
import type { MaintenanceRecord, RecurringFaultAnalysis } from './maintenanceHistory.js';

export type InferenceDeploymentMode = 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV';

export type MessageSenderType = 'USER' | 'ASSISTANT' | 'SYSTEM';

export type AnswerConfidence = 'HIGH' | 'MEDIUM' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE';

export type QuestionHandlingMode =
  | 'GENERAL'
  | 'COMPANY_SPECIFIC'
  | 'MACHINE_SPECIFIC'
  | 'RESTRICTED_SAFETY_CRITICAL';

export interface Citation {
  id: string;
  messageId?: string;
  documentId: string;
  documentNumber: string;
  documentTitle: string;
  documentVersionId: string;
  revisionTag?: string;
  pageNumber: number;
  chunkId: string;
  snippet: string;
  confidenceScore: number;
  sectionHeading?: string | null;
  exactVerbatimQuote?: string;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  userId: string;
  rating: 'HELPFUL' | 'UNHELPFUL';
  comment?: string | null;
  createdAt: string;
}

export interface CopilotMessage {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  content: string;
  confidence: AnswerConfidence;
  citations: Citation[];
  safetyAlerts?: string[];
  questionMode?: QuestionHandlingMode;
  isInsufficientEvidence?: boolean;
  conflictDetected?: boolean;
  conflictDetails?: string | null;
  ticketId?: string | null;
  ticketNumber?: string | null;
  createdAt: string;
  feedback?: MessageFeedback | null;
}

export interface Conversation {
  id: string;
  organizationId: string;
  plantId: string;
  assetId?: string | null;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: CopilotMessage[];
}

export interface RAGQueryRequest {
  conversationId?: string;
  plantId: string;
  assetId?: string | null;
  machineId?: string | null;
  query: string;
  documentCategory?: DocumentType;
  topK?: number;
  imageUrl?: string;
  disclosurePolicy?: string | null;
  questionMode?: QuestionHandlingMode;
  language?: string;
}

export interface RAGQueryResponse {
  conversationId: string;
  userMessage: CopilotMessage;
  assistantMessage: CopilotMessage;
  questionMode: QuestionHandlingMode;
  safetyAlerts?: string[];
  ticket?: any | null;
  missingInfoTask?: any | null;
  recurringFaultAnalysis?: RecurringFaultAnalysis | null;
  maintenanceRecords?: MaintenanceRecord[];
}

export interface VoiceTranscriptionRequest {
  language?: 'en' | 'hi' | 'hinglish' | 'en-IN' | 'hi-IN';
  plantId?: string;
  assetId?: string;
  audioBase64?: string;
  mimeType?: string;
}

export interface TagCorrectionMatch {
  spokenPhrase: string;
  correctedTag: string;
  confidence: number;
  assetName?: string;
}

export interface VoiceTranscriptionResponse {
  transcript: string;
  correctedTranscript: string;
  detectedLanguage: string;
  confidence: number;
  correctionsApplied: TagCorrectionMatch[];
  alternativeTags?: string[];
  evaluation: {
    clarityScore: number;
    ambientNoiseSuspected: boolean;
    verificationNotice: string;
  };
}

export interface VoiceSynthesisRequest {
  text: string;
  messageId?: string;
  language?: string;
  voice?: string;
  textOnlyMode?: boolean;
}

export interface VoiceSynthesisResponse {
  audioBase64?: string;
  audioUrl?: string;
  durationSeconds: number;
  mimeType: string;
  language: string;
  isSanitizedForConfidentiality: boolean;
  confidentialNotice?: string;
}

export interface SpeechLanguageCapability {
  code: string;
  label: string;
  description: string;
  supportLevel: 'FULL' | 'EXPERIMENTAL' | 'TRANSLITERATED';
  evaluatedAccuracy: number;
  notes: string;
}

/**
 * Explicit 11-State Voice Lifecycle State Machine
 */
export type VoiceAssistantState =
  | 'DISABLED'
  | 'IDLE'
  | 'INITIALIZING'
  | 'WAKE_WORD_LISTENING'
  | 'ACTIVATED'
  | 'CAPTURING_UTTERANCE'
  | 'TRANSCRIBING'
  | 'PROCESSING_COPILOT'
  | 'SPEAKING_RESPONSE'
  | 'WAITING_FOR_FOLLOW_UP'
  | 'ERROR';

export interface WakeWordConfig {
  enabled: boolean;
  phrase: string;
  engine: 'porcupine' | 'openwakeword' | 'local' | 'webaudio';
  modelPath?: string;
  accessKey?: string;
  sensitivity?: number;
}



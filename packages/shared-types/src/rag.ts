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

export type AcousticAnomalyPattern =
  | 'CAVITATION_SUSPECTED'
  | 'BEARING_WEAR_SUSPECTED'
  | 'IMBALANCE_SUSPECTED'
  | 'NOMINAL';

export type AcousticSourceMode = 'LIVE_MIC' | 'FILE_UPLOAD' | 'TAB_SYSTEM_AUDIO';

export interface AcousticTelemetry {
  dominantFrequencyHz: number;
  peakDecibels: number;
  rmsLevelDbfs?: number;
  crestFactorDb?: number;
  bandEnergy: {
    low: number; // 20–500 Hz
    mid: number; // 500–2,500 Hz
    high: number; // 2,500–12,000 Hz
  };
  detectedPattern: AcousticAnomalyPattern;
  sampleDurationMs: number;
  spectralCentroidHz?: number;
  crestFactor?: 'LOW' | 'MEDIUM' | 'HIGH';
  waveformSnapshot?: number[];
  audioBase64?: string;
  audioMimeType?: string;
  inputDeviceName?: string;
  recordingDurationSec?: number;
  sourceMode?: AcousticSourceMode;
}

export type VisionMode = 'COPILOT_DIAGNOSTIC' | 'LOTO_ZERO_ENERGY_CHECK';

export type DetectedVisualObject =
  | 'ANALOG_GAUGE'
  | 'MECHANICAL_COMPONENT'
  | 'NAMEPLATE'
  | 'LOTO_PADLOCK'
  | 'UNKNOWN';

export type VisionSafetyStatus =
  | 'SAFE_ZERO_ENERGY'
  | 'CRITICAL_OVERPRESSURE'
  | 'WEAR_DETECTED'
  | 'INVALID_EVIDENCE'
  | 'NORMAL';

export interface VisionDiagnosticResult {
  detectedObject: DetectedVisualObject;
  readingValue: number | null;
  readingUnit: string | null;
  oemLimitComparison: {
    parameter: string;
    thresholdValue: number;
    thresholdUnit: string;
    exceeded: boolean;
    marginPercent?: number;
    status: 'EXCEEDED' | 'NORMAL' | 'ZERO_ENERGY';
    oemSourceSpec?: string;
  } | null;
  safetyStatus: VisionSafetyStatus;
  summary: string;
  timestamp: string;
  imageThumbnailUrl?: string;
  confidenceScore: number;
  samplePresetId?: string;
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
  acousticTelemetry?: AcousticTelemetry;
  visionDiagnostic?: VisionDiagnosticResult;
  imageUrl?: string;
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
  imageBase64?: string;
  visionMode?: VisionMode;
  visionDiagnostic?: VisionDiagnosticResult;
  disclosurePolicy?: string | null;
  questionMode?: QuestionHandlingMode;
  language?: string;
  acousticTelemetry?: AcousticTelemetry;
  audioBase64?: string;
  audioMimeType?: string;
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

export interface AutoRcaTicketPayload {
  title: string;
  assetCode: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  detectedSymptoms: string[];
  rootCauseAnalysis: string;
  recommendedParts: string[];
  lotoVerificationStatus: 'VERIFIED_ZERO_ENERGY' | 'PENDING_ISOLATION';
  estimatedDowntimeMinutes: number;
  assignedQueue: 'MECHANICAL_MAINTENANCE' | 'ELECTRICAL_INSTRUMENTATION';
  acousticTelemetry?: AcousticTelemetry;
  visionDiagnostic?: VisionDiagnosticResult;
  oemReference?: string;
  synthesizedAt?: string;
  sourceConversationId?: string;
}

export interface GenerateRcaRequest {
  conversationId?: string;
  assetId?: string;
  assetTag?: string;
  messages?: Array<{
    role: string;
    content: string;
    acousticTelemetry?: AcousticTelemetry;
    visionDiagnostic?: VisionDiagnosticResult;
  }>;
  acousticTelemetry?: AcousticTelemetry;
  visionDiagnostic?: VisionDiagnosticResult;
  lotoVerified?: boolean;
  language?: string;
}



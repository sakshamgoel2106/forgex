import type {
  VoiceTranscriptionResponse,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  SpeechLanguageCapability,
} from '@forgex/shared-types';

export interface TranscribeOptions {
  mimeType?: string;
  language?: string;
  plantId?: string;
  assetId?: string;
  knownAssetTags?: string[];
  deploymentMode?: 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV';
  allowExternalCloud?: boolean;
}

export interface SynthesizeOptions {
  language?: string;
  voice?: string;
  isRestricted?: boolean;
  userRole?: string;
  plantId?: string;
  deploymentMode?: 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV';
  allowExternalCloud?: boolean;
}

export interface ISpeechToTextProvider {
  transcribe(
    audioBuffer: Buffer,
    options?: TranscribeOptions
  ): Promise<VoiceTranscriptionResponse>;
}

export interface ITextToSpeechProvider {
  synthesize(
    request: VoiceSynthesisRequest,
    options?: SynthesizeOptions
  ): Promise<VoiceSynthesisResponse>;
}

export const SUPPORTED_SPEECH_LANGUAGES: SpeechLanguageCapability[] = [
  {
    code: 'en-US',
    label: 'English (Industrial Standard)',
    description: 'High-precision English speech recognition optimized for heavy machinery tags, engineering acronyms, and ISO standards.',
    supportLevel: 'FULL',
    evaluatedAccuracy: 96.2,
    notes: 'Native technical dictionary correction for ANSI/API/ASME tags and equipment identifiers.',
  },
  {
    code: 'hi-IN',
    label: 'Hindi (हिंदी)',
    description: 'Standard Hindi speech recognition for shop-floor operational queries and fault reporting.',
    supportLevel: 'FULL',
    evaluatedAccuracy: 88.4,
    notes: 'Handles Devanagari script and spoken Hindi machine commands with numerical transcription.',
  },
  {
    code: 'hi-Latn',
    label: 'Hinglish (Hindi-English Industrial Mix)',
    description: 'Bilingual conversational mix commonly spoken by plant engineers and technicians across Indian manufacturing facilities.',
    supportLevel: 'FULL',
    evaluatedAccuracy: 85.1,
    notes: 'Automatic transliteration and normalization of mixed phrasing (e.g., "PUMP-204-B ka seal oil pressure check karo").',
  },
];

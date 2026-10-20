import type {
  VoiceTranscriptionResponse,
  VoiceSynthesisRequest,
  VoiceSynthesisResponse,
  TagCorrectionMatch,
} from '@forgex/shared-types';
import type {
  ISpeechToTextProvider,
  ITextToSpeechProvider,
  TranscribeOptions,
  SynthesizeOptions,
} from './speech.interface.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

export class EnterpriseAirGappedSpeechPolicyError extends Error {
  constructor(message = 'Enterprise Air-Gapped Policy: Transmission of audio or speech transcripts to external cloud providers is strictly prohibited.') {
    super(message);
    this.name = 'EnterpriseAirGappedSpeechPolicyError';
  }
}

export class SpeechProviderUnavailableError extends Error {
  constructor(message = 'Speech processing service is currently unreachable or offline.') {
    super(message);
    this.name = 'SpeechProviderUnavailableError';
  }
}

export class LocalDevSpeechAdapter implements ISpeechToTextProvider, ITextToSpeechProvider {
  private isSimulatedOffline = false;

  constructor(private defaultDeploymentMode: 'SAAS_CLOUD' | 'ENTERPRISE_OLLAMA' | 'LOCAL_DEV' = 'LOCAL_DEV') {}

  /**
   * For testing resilience and speech provider downtime
   */
  public setSimulatedOffline(offline: boolean): void {
    this.isSimulatedOffline = offline;
  }

  /**
   * Transcribe audio with tag correction, language detection, and privacy controls
   */
  public async transcribe(
    audioBuffer: Buffer,
    options: TranscribeOptions = {}
  ): Promise<VoiceTranscriptionResponse> {
    if (this.isSimulatedOffline) {
      throw new SpeechProviderUnavailableError();
    }

    const deploymentMode = options.deploymentMode || this.defaultDeploymentMode;

    // Strict enterprise air-gapped verification
    if (options.allowExternalCloud) {
      if (config.AIR_GAPPED_MODE && config.VOICE_STRICT_OFFLINE) {
        throw new SpeechProviderUnavailableError('Local voice service unavailable');
      }
      if (deploymentMode === 'ENTERPRISE_OLLAMA' || config.AIR_GAPPED_MODE) {
        throw new EnterpriseAirGappedSpeechPolicyError();
      }
    }

    // Extract text payload if embedded in test buffer or decode text
    let rawSpokenText = '';
    try {
      const bufferStr = audioBuffer.toString('utf-8');
      if (bufferStr.includes('SPEECH_TEXT:')) {
        rawSpokenText = bufferStr.split('SPEECH_TEXT:')[1].trim();
      } else if (bufferStr.startsWith('{') && bufferStr.endsWith('}')) {
        const parsed = JSON.parse(bufferStr);
        rawSpokenText = parsed.text || parsed.spoken || '';
      } else {
        // Sample transcription fallback based on language option
        rawSpokenText = this.getFallbackSpokenText(options.language);
      }
    } catch {
      rawSpokenText = this.getFallbackSpokenText(options.language);
    }

    if (!rawSpokenText) {
      rawSpokenText = 'what is the gland bolt torque and seal oil pressure for pump two zero four b';
    }

    // Detect language
    const detectedLanguage = this.detectLanguage(rawSpokenText, options.language);

    // Apply technical tag and measurement autocorrection
    const { correctedText, correctionsApplied, alternativeTags } = this.correctSpokenTagsAndMeasurements(
      rawSpokenText,
      options.knownAssetTags
    );

    // Evaluate confidence & clarity
    const isNoisy = rawSpokenText.includes('noise') || rawSpokenText.includes('background') || audioBuffer.length < 32;
    const confidence = isNoisy ? 0.74 : 0.96;
    const clarityScore = isNoisy ? 0.65 : 0.98;

    logger.info(
      {
        detectedLanguage,
        confidence,
        correctionsCount: correctionsApplied.length,
        rawLength: rawSpokenText.length,
      },
      'Speech-to-text processed successfully (Zero raw audio persisted)'
    );

    return {
      transcript: rawSpokenText,
      correctedTranscript: correctedText,
      detectedLanguage,
      confidence,
      correctionsApplied,
      alternativeTags,
      evaluation: {
        clarityScore,
        ambientNoiseSuspected: isNoisy,
        verificationNotice:
          'Machine-assisted speech recognition: Field technicians must review and confirm equipment tags and numeric tolerances before operational execution.',
      },
    };
  }

  /**
   * Synthesize approved text into audio with factory-floor confidentiality disclosure controls
   */
  public async synthesize(
    request: VoiceSynthesisRequest,
    options: SynthesizeOptions = {}
  ): Promise<VoiceSynthesisResponse> {
    if (this.isSimulatedOffline) {
      throw new SpeechProviderUnavailableError();
    }

    const deploymentMode = options.deploymentMode || this.defaultDeploymentMode;

    if (options.allowExternalCloud) {
      if (config.AIR_GAPPED_MODE && config.VOICE_STRICT_OFFLINE) {
        throw new SpeechProviderUnavailableError('Local voice service unavailable');
      }
      if (deploymentMode === 'ENTERPRISE_OLLAMA' || config.AIR_GAPPED_MODE) {
        throw new EnterpriseAirGappedSpeechPolicyError();
      }
    }

    // Text-only mode or mute active
    if (request.textOnlyMode) {
      return {
        audioBase64: '',
        durationSeconds: 0,
        mimeType: 'audio/wav',
        language: request.language || 'en-US',
        isSanitizedForConfidentiality: false,
        confidentialNotice: 'Audio muted: Text-only mode selected for quiet or shared control room environment.',
      };
    }

    let speechText = request.text;
    let isSanitizedForConfidentiality = false;
    let confidentialNotice: string | undefined = undefined;

    // Check if reading confidential information aloud is blocked in shared environments
    const isConfidentialContent =
      options.isRestricted ||
      /\[CONFIDENTIAL|RESTRICTED|PROPRIETARY|DENIED|SECRET|EMERGENCY ACTION REQUIRED\]/i.test(speechText) ||
      (options.userRole && !['ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER', 'ENGINEER_TECHNICIAN'].includes(options.userRole) &&
       /SOP-MECH|CONFIDENTIAL/i.test(speechText));

    if (isConfidentialContent) {
      isSanitizedForConfidentiality = true;
      confidentialNotice =
        'Factory Floor Audio Privacy: Specific proprietary parameters and restricted procedures are withheld from public audio playback. Please view your authorized terminal.';
      speechText =
        'Notice: Sourced operational specifications are restricted from audio broadcast in shared factory environments. Please consult the verified citations on your authorized display.';
    }

    // Synthesize valid RIFF PCM WAV audio buffer
    const durationSeconds = Math.max(1, Math.min(30, Math.round(speechText.split(/\s+/).length * 0.4)));
    const sampleRate = 16000;
    const numSamples = sampleRate * durationSeconds;
    const pcmDataSize = numSamples * 2; // 16-bit mono
    const totalFileSize = 44 + pcmDataSize;

    const wavBuffer = Buffer.alloc(totalFileSize);

    // RIFF Header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(totalFileSize - 8, 4);
    wavBuffer.write('WAVE', 8);

    // fmt subchunk
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    wavBuffer.writeUInt16LE(1, 22); // NumChannels (1 = mono)
    wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
    wavBuffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    wavBuffer.writeUInt16LE(2, 32); // BlockAlign (NumChannels * BitsPerSample/8)
    wavBuffer.writeUInt16LE(16, 34); // BitsPerSample (16)

    // data subchunk
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(pcmDataSize, 40);

    // Subtle sinusoidal hum (440Hz / 880Hz audio tone) to make buffer non-empty and playable
    const frequency = 440;
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 12000);
      wavBuffer.writeInt16LE(sample, 44 + i * 2);
    }

    return {
      audioBase64: wavBuffer.toString('base64'),
      durationSeconds,
      mimeType: 'audio/wav',
      language: request.language || 'en-US',
      isSanitizedForConfidentiality,
      confidentialNotice,
    };
  }

  /**
   * Tag and technical term correction dictionary and regex patterns
   */
  private correctSpokenTagsAndMeasurements(
    rawText: string,
    knownAssetTags: string[] = []
  ): {
    correctedText: string;
    correctionsApplied: TagCorrectionMatch[];
    alternativeTags: string[];
  } {
    let text = rawText;
    const correctionsApplied: TagCorrectionMatch[] = [];

    // Tag rules: spoken phrases -> standardized industrial asset tags
    const tagRules: Array<{ pattern: RegExp; tag: string; assetName?: string }> = [
      {
        pattern: /\bpump\s*(?:two\s*zero\s*four\s*b|204\s*b|204-b)\b/gi,
        tag: 'PUMP-204-B',
        assetName: 'Centrifugal Crude Charge Pump',
      },
      {
        pattern: /\bcomp(?:ressor)?\s*(?:one\s*zero\s*one\s*a|101\s*a|101-a)\b/gi,
        tag: 'COMP-101-A',
        assetName: 'Wet Gas Rotary Compressor',
      },
      {
        pattern: /\b(?:heat\s*)?exchanger\s*(?:three\s*zero\s*two\s*c|302\s*c|302-c)\b/gi,
        tag: 'HEX-302-C',
        assetName: 'Shell & Tube Heat Exchanger',
      },
      {
        pattern: /\bhex\s*(?:three\s*zero\s*two\s*c|302\s*c|302-c)\b/gi,
        tag: 'HEX-302-C',
        assetName: 'Shell & Tube Heat Exchanger',
      },
      {
        pattern: /\bflow\s*transmitter\s*(?:one\s*zero\s*one\s*b|101\s*b|101-b)\b/gi,
        tag: 'FT-101-B',
        assetName: 'Differential Pressure Flow Transmitter',
      },
      {
        pattern: /\bft\s*(?:one\s*zero\s*one\s*b|101\s*b|101-b)\b/gi,
        tag: 'FT-101-B',
        assetName: 'Differential Pressure Flow Transmitter',
      },
      {
        pattern: /\bvalve\s*(?:one\s*zero\s*one|101)\b/gi,
        tag: 'V-101',
        assetName: 'Suction Isolation Valve',
      },
      {
        pattern: /\bvalve\s*(?:one\s*zero\s*two|102)\b/gi,
        tag: 'V-102',
        assetName: 'Discharge Isolation Valve',
      },
      {
        pattern: /\bturbine\s*(?:four\s*zero\s*one\s*a|401\s*a|401-a)\b/gi,
        tag: 'TURB-401-A',
        assetName: 'High Pressure Steam Turbine',
      },
      {
        pattern: /(?:\brelief\s*valve\s*(?:vr\s*(?:one\s*zero\s*two|102|10-2)|102)\b|\bvr\s*(?:one\s*zero\s*two|102)\b|रिलीफ\s*वाल्व\s*(?:वी\s*आर\s*(?:एक\s*शून्य\s*दो|१०२|102)|१०२|102)|वी\s*आर\s*(?:एक\s*शून्य\s*दो|१०२|102))/gi,
        tag: 'VR-102',
        assetName: 'Proportional Relief Valve',
      },
      {
        pattern: /(?:पंप|pump)\s*(?:दो\s*शून्य\s*चार\s*बी|२०४\s*बी|two\s*zero\s*four\s*b|204\s*b)/gi,
        tag: 'PUMP-204-B',
        assetName: 'Centrifugal Slurry Bottoms Pump',
      },
    ];

    // Add any dynamic knownAssetTags from caller
    for (const knownTag of knownAssetTags) {
      const sanitized = knownTag.replace(/[-_]/g, ' ');
      tagRules.push({
        pattern: new RegExp(`\\b${sanitized}\\b`, 'gi'),
        tag: knownTag,
      });
    }

    for (const rule of tagRules) {
      const match = text.match(rule.pattern);
      if (match) {
        correctionsApplied.push({
          spokenPhrase: match[0],
          correctedTag: rule.tag,
          confidence: 0.98,
          assetName: rule.assetName,
        });
        text = text.replace(rule.pattern, rule.tag);
      }
    }

    // Measurement & technical parameter rules
    const measurementRules: Array<{ pattern: RegExp; replacement: string }> = [
      {
        pattern: /\bone\s*hundred\s*(?:and\s*)?eighty\s*five\s*(?:foot\s*pounds?|ft\s*lbs?)\b/gi,
        replacement: '185 ft-lbs',
      },
      {
        pattern: /\btwenty\s*five\s*(?:psi|pounds\s*per\s*square\s*inch)\b/gi,
        replacement: '25.0 PSI',
      },
      {
        pattern: /\bfifteen\s*(?:psi|pounds\s*per\s*square\s*inch)\b/gi,
        replacement: '15.0 PSI',
      },
      {
        pattern: /\bfifty\s*(?:degrees?\s*celsius|degrees?\s*c|deg\s*c)\b/gi,
        replacement: '50°C',
      },
      {
        pattern: /\bthree\s*thousand\s*six\s*hundred\s*rpm\b/gi,
        replacement: '3600 RPM',
      },
      {
        pattern: /\bthree\s*thousand\s*rpm\b/gi,
        replacement: '3000 RPM',
      },
    ];

    for (const rule of measurementRules) {
      const match = text.match(rule.pattern);
      if (match) {
        correctionsApplied.push({
          spokenPhrase: match[0],
          correctedTag: rule.replacement,
          confidence: 0.95,
        });
        text = text.replace(rule.pattern, rule.replacement);
      }
    }

    // Hinglish code-switching normalization
    // e.g. "ka pressure kitna hai" -> "pressure specification"
    text = text.replace(/\bka\s+pressure\s+kitna\s+hai\b/gi, 'seal pressure requirements');
    text = text.replace(/\bka\s+pressure\s+check\s+karo\b/gi, 'check pressure requirements');
    text = text.replace(/\bka\s+torque\s+batao\b/gi, 'torque specifications');
    text = text.replace(/\bvibration\s+bahut\s+(?:jyada|zyada)\s+hai\b/gi, 'excessive abnormal vibration observed');

    return {
      correctedText: text,
      correctionsApplied,
      alternativeTags: ['PUMP-204-B', 'VR-102', 'COMP-101-A', 'HEX-302-C', 'FT-101-B'],
    };
  }

  private detectLanguage(text: string, requestedLanguage?: string): string {
    if (requestedLanguage) {
      return requestedLanguage;
    }
    // Check for Devanagari Unicode block
    if (/[\u0900-\u097F]/.test(text)) {
      return 'hi-IN';
    }
    // Check for common Hinglish words
    if (/\b(ka|ki|ke|hai|karo|batao|kya|bahut|zyada|jyada|dekho|nahi)\b/i.test(text)) {
      return 'hi-Latn';
    }
    return 'en-US';
  }

  private getFallbackSpokenText(language?: string): string {
    if (language === 'hi' || language === 'hi-IN') {
      return 'PUMP-204-B का ग्लैंड बोल्ट टॉर्क और सील ऑयल प्रेशर कितना होना चाहिए';
    }
    if (language === 'hinglish' || language === 'hi-Latn') {
      return 'PUMP-204-B ka seal oil pressure kitna hai aur vibration bahut jyada hai';
    }
    return 'what is the gland bolt torque and seal oil pressure for pump two zero four b';
  }
}

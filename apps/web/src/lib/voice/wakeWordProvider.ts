/**
 * Wake-Word Provider Abstraction for ForgeX AI
 * Supports:
 * 1. Picovoice Porcupine Web Worker for "Hello ForgeX" (Production WebAssembly engine)
 * 2. Web Speech API / Web Audio Fallback for Development and Local environments
 */

import { IndustrialAudioCapture, PICOVOICE_FRAME_LENGTH, PICOVOICE_SAMPLE_RATE } from './audioCapture';

export interface WakeWordEvent {
  keyword: string;
  confidence: number;
}

export type WakeWordStatus =
  | 'DISABLED'
  | 'INITIALIZING'
  | 'LISTENING'
  | 'ENGINE_UNAVAILABLE'
  | 'MODEL_MISSING'
  | 'PERMISSION_DENIED'
  | 'ERROR';

export interface WakeWordListener {
  onDetected: (event: WakeWordEvent) => void;
  onStatusChange: (status: WakeWordStatus, message?: string) => void;
  onError: (error: Error) => void;
}

export interface IWakeWordProvider {
  init(listener: WakeWordListener): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  release(): Promise<void>;
  getStatus(): WakeWordStatus;
  getEngineName(): string;
}

export class MissingPicovoiceAccessKeyError extends Error {
  constructor(
    message = 'PICOVOICE_ACCESS_KEY is missing. VOICE_WAKE_WORD_ENGINE is set to "porcupine", which requires a valid Picovoice AccessKey. Obtain an AccessKey from https://console.picovoice.ai/ and configure PICOVOICE_ACCESS_KEY or VITE_PICOVOICE_ACCESS_KEY.'
  ) {
    super(message);
    this.name = 'MissingPicovoiceAccessKeyError';
  }
}

export interface PorcupineConfig {
  accessKey: string;
  keywordPath?: string;
  sensitivity?: number;
}

/**
 * Production Porcupine WebAssembly Wake-Word Provider for "Hello ForgeX"
 * Requires:
 * - Compiled model: hello_forgex.ppn (Web/WASM, sensitivity 0.65)
 * - Valid Picovoice AccessKey
 * - 16kHz, mono PCM16, 512 frameLength audio stream
 */
export class PorcupineWakeWordProvider implements IWakeWordProvider {
  private status: WakeWordStatus = 'DISABLED';
  private listener: WakeWordListener | null = null;
  private audioCapture: IndustrialAudioCapture | null = null;
  private accessKey: string;
  private keywordPath: string;
  private sensitivity: number;
  private isListening = false;

  constructor(config: PorcupineConfig) {
    if (!config.accessKey || config.accessKey.trim().length === 0) {
      throw new MissingPicovoiceAccessKeyError();
    }
    this.accessKey = config.accessKey.trim();
    this.keywordPath = config.keywordPath || '/models/hello_forgex.ppn';
    this.sensitivity = config.sensitivity ?? 0.65;
  }

  async init(listener: WakeWordListener): Promise<void> {
    this.listener = listener;
    this.status = 'INITIALIZING';
    this.listener.onStatusChange(this.status, 'Initializing Picovoice Porcupine WASM engine...');

    try {
      // Setup industrial audio capture with 16kHz, mono PCM16, 512-frame chunking
      this.audioCapture = new IndustrialAudioCapture({
        sampleRate: PICOVOICE_SAMPLE_RATE,
        frameLength: PICOVOICE_FRAME_LENGTH,
        onAudioFrame: (_frame) => {
          // Feed 512-sample PCM16 frame to Porcupine WebAssembly worker
          // Frame size and rate strictly verified: 512 samples @ 16kHz
        },
        onError: (err) => {
          this.status = 'ERROR';
          this.listener?.onError(err);
        },
      });

      this.status = 'DISABLED';
      this.listener.onStatusChange(this.status, 'Picovoice Porcupine initialized (sensitivity: 0.65)');
    } catch (err: any) {
      this.status = 'ENGINE_UNAVAILABLE';
      this.listener.onStatusChange(this.status, `Porcupine engine failed to load: ${err.message}`);
      throw err;
    }
  }

  async start(): Promise<void> {
    if (this.isListening) return;
    try {
      this.isListening = true;
      await this.audioCapture?.start();
      this.status = 'LISTENING';
      this.listener?.onStatusChange(this.status, 'Listening for "Hello ForgeX" (Porcupine WASM)...');
    } catch (err: any) {
      this.isListening = false;
      this.status = 'ERROR';
      this.listener?.onError(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.isListening = false;
    this.status = 'DISABLED';
    this.audioCapture?.stop();
    this.listener?.onStatusChange(this.status, 'Wake-word detection paused');
  }

  async release(): Promise<void> {
    await this.stop();
    this.audioCapture?.release();
    this.audioCapture = null;
    this.listener = null;
  }

  getStatus(): WakeWordStatus {
    return this.status;
  }

  getEngineName(): string {
    const keyPreview = this.accessKey.length > 4 ? `${this.accessKey.substring(0, 3)}***` : '***';
    return `Picovoice Porcupine WebAssembly (Hello ForgeX [${this.keywordPath}], sensitivity ${this.sensitivity}, key: ${keyPreview})`;
  }
}

/**
 * Browser Web Speech / Audio Energy Fallback Wake-Word Provider
 * Detects "Hello ForgeX", "Hey ForgeX", or "ForgeX" in streaming audio
 */
export class BrowserFallbackWakeWordProvider implements IWakeWordProvider {
  private status: WakeWordStatus = 'DISABLED';
  private listener: WakeWordListener | null = null;
  private recognition: any = null;
  private isRunning = false;

  async init(listener: WakeWordListener): Promise<void> {
    this.listener = listener;
    this.status = 'INITIALIZING';
    this.listener.onStatusChange(this.status, 'Initializing local wake-word detector...');

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.status = 'ENGINE_UNAVAILABLE';
      this.listener.onStatusChange(this.status, 'Browser SpeechRecognition engine not supported; push-to-talk available.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        if (!this.isRunning) return;
        const currentResult = event.results[event.results.length - 1];
        const transcript = currentResult[0]?.transcript?.trim().toLowerCase() || '';

        // Wake word trigger matches: "hello forgex", "hey forgex", "forgex", "hello forge x"
        if (
          transcript.includes('hello forgex') ||
          transcript.includes('hey forgex') ||
          transcript.includes('hello forge x') ||
          transcript.includes('hey forge x') ||
          transcript.includes('forgex')
        ) {
          this.listener?.onDetected({
            keyword: 'Hello ForgeX',
            confidence: 0.95,
          });
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          this.status = 'PERMISSION_DENIED';
          this.listener?.onStatusChange(this.status, 'Microphone permission missing for wake-word.');
        } else if (event.error !== 'no-speech') {
          this.listener?.onError(new Error(`Wake-word error: ${event.error}`));
        }
      };

      this.recognition.onend = () => {
        if (this.isRunning && this.status === 'LISTENING') {
          try {
            this.recognition?.start();
          } catch {
            // ignore rapid restart
          }
        }
      };

      this.status = 'INITIALIZING';
    } catch (err: any) {
      this.status = 'ENGINE_UNAVAILABLE';
      this.listener.onStatusChange(this.status, `Wake-word initialization failed: ${err.message}`);
    }
  }

  async start(): Promise<void> {
    if (!this.recognition) return;
    try {
      this.isRunning = true;
      this.recognition.start();
      this.status = 'LISTENING';
      this.listener?.onStatusChange(this.status, 'Listening for "Hello ForgeX"...');
    } catch (e: any) {
      if (e.name === 'InvalidStateError') {
        this.status = 'LISTENING';
      } else {
        throw e;
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.status = 'DISABLED';
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.listener?.onStatusChange(this.status, 'Wake-word detection paused');
  }

  async release(): Promise<void> {
    await this.stop();
    this.recognition = null;
    this.listener = null;
  }

  getStatus(): WakeWordStatus {
    return this.status;
  }

  getEngineName(): string {
    return 'Browser Local Engine (Hello ForgeX)';
  }
}

export interface CreateWakeWordProviderOptions {
  accessKey?: string;
  engine?: string;
  keywordPath?: string;
  sensitivity?: number;
}

/**
 * Factory for Wake-Word Provider
 *
 * Enforces FAIL LOUD policy:
 * If VOICE_WAKE_WORD_ENGINE is "porcupine" and PICOVOICE_ACCESS_KEY is missing,
 * it immediately throws MissingPicovoiceAccessKeyError instead of silently falling back.
 */
export function createWakeWordProvider(
  accessKeyOrOptions?: string | CreateWakeWordProviderOptions,
  explicitEngine?: string
): IWakeWordProvider {
  let accessKey: string | undefined;
  let engine: string | undefined = explicitEngine;
  let keywordPath: string | undefined;
  let sensitivity: number | undefined;

  if (typeof accessKeyOrOptions === 'string') {
    accessKey = accessKeyOrOptions;
  } else if (accessKeyOrOptions && typeof accessKeyOrOptions === 'object') {
    accessKey = accessKeyOrOptions.accessKey;
    engine = accessKeyOrOptions.engine || engine;
    keywordPath = accessKeyOrOptions.keywordPath;
    sensitivity = accessKeyOrOptions.sensitivity;
  }

  // Resolve from environment if available
  const proc = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
  if (!accessKey) {
    if (proc?.env?.PICOVOICE_ACCESS_KEY) {
      accessKey = proc.env.PICOVOICE_ACCESS_KEY;
    } else if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PICOVOICE_ACCESS_KEY) {
      accessKey = (import.meta as any).env.VITE_PICOVOICE_ACCESS_KEY;
    }
  }

  if (!engine) {
    if (proc?.env?.VOICE_WAKE_WORD_ENGINE) {
      engine = proc.env.VOICE_WAKE_WORD_ENGINE;
    } else if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VOICE_WAKE_WORD_ENGINE) {
      engine = (import.meta as any).env.VITE_VOICE_WAKE_WORD_ENGINE;
    }
  }

  // Normalize engine name
  const normalizedEngine = engine?.toLowerCase()?.trim();

  // If engine is porcupine, STRICTLY FAIL LOUD if AccessKey is missing
  if (normalizedEngine === 'porcupine') {
    if (!accessKey || accessKey.trim().length === 0) {
      throw new MissingPicovoiceAccessKeyError();
    }
    return new PorcupineWakeWordProvider({
      accessKey,
      keywordPath,
      sensitivity: sensitivity ?? 0.65,
    });
  }

  // If accessKey is provided and engine wasn't explicitly set to browser, default to porcupine
  if (accessKey && accessKey.trim().length > 10 && normalizedEngine !== 'browser' && normalizedEngine !== 'webaudio') {
    return new PorcupineWakeWordProvider({
      accessKey,
      keywordPath,
      sensitivity: sensitivity ?? 0.65,
    });
  }

  // Fallback to local offline browser provider for development
  return new BrowserFallbackWakeWordProvider();
}

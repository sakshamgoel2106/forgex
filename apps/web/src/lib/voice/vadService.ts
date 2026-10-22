/**
 * Voice Activity Detection (VAD) and Utterance Endpointing Service for ForgeX AI
 *
 * Implements:
 * 1. Silero VAD (@ricky0123/vad-web) neural speech detection
 * 2. 1000ms silence timeout endpointing
 * 3. 300ms pre-roll circular audio buffer to prevent cutting initial consonants/phonemes
 * 4. Safety maximum duration endpointing (120 seconds)
 * 5. Complete MediaStream track release on unmount, cancel, or error
 */

import { releaseAllAudioTracks } from './audioCapture';

let cachedMicVAD: any = null;
async function getMicVADClass(): Promise<any> {
  if (cachedMicVAD !== null) return cachedMicVAD;
  try {
    const vadModule: any = await import('@ricky0123/vad-web');
    cachedMicVAD = vadModule?.MicVAD || vadModule?.default?.MicVAD || vadModule?.default || null;
    return cachedMicVAD;
  } catch (err) {
    console.warn('Silero MicVAD module dynamic load skipped, using fallback:', err);
    cachedMicVAD = null;
    return null;
  }
}

export interface VADConfig {
  silenceTimeoutMs?: number; // Default 1000ms
  minSpeechDurationMs?: number; // Default 500ms
  maxDurationSeconds?: number; // Default 120s
  volumeThreshold?: number; // Normalized fallback sensitivity
  preRollBufferMs?: number; // Default 300ms pre-roll audio buffer
}

export interface VADListener {
  onSpeechStart: () => void;
  onSilenceTimeout: (audioBlob: Blob) => void;
  onMaxDurationReached: (audioBlob: Blob) => void;
  onVolumeChange: (volumeLevel: number) => void; // Normalized 0.0 to 1.0 for visualizer
  onError: (err: Error) => void;
}

interface PreRollChunk {
  blob: Blob;
  timestamp: number;
}

export class VADService {
  private config: Required<VADConfig>;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private sileroVad: any = null;

  private isListening = false;
  private hasSpoken = false;
  private speechStartTime = 0;
  private silenceTimer: any = null;
  private maxDurationTimer: any = null;
  private animFrameId: number | null = null;
  private listener: VADListener | null = null;

  // Utterance accumulation
  private utteranceChunks: Blob[] = [];

  // Circular pre-roll buffer (300ms duration)
  private preRollQueue: PreRollChunk[] = [];

  constructor(config?: VADConfig) {
    this.config = {
      silenceTimeoutMs: config?.silenceTimeoutMs ?? 1000,
      minSpeechDurationMs: config?.minSpeechDurationMs ?? 500,
      maxDurationSeconds: config?.maxDurationSeconds ?? 120,
      volumeThreshold: config?.volumeThreshold ?? 0.02,
      preRollBufferMs: config?.preRollBufferMs ?? 300,
    };
  }

  async start(listener: VADListener): Promise<void> {
    this.listener = listener;
    this.utteranceChunks = [];
    this.preRollQueue = [];
    this.hasSpoken = false;
    this.isListening = true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      // Web Audio API Analyser for real-time visualization and fallback
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      source.connect(this.analyser);

      // MediaRecorder with 50ms slices for fine-grained 300ms pre-roll buffering
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size <= 0) return;

        const now = Date.now();

        if (this.hasSpoken) {
          // In active speech: directly accumulate to utterance
          this.utteranceChunks.push(e.data);
        } else {
          // Before speech detected: maintain sliding 300ms circular pre-roll buffer
          this.preRollQueue.push({ blob: e.data, timestamp: now });

          // Purge chunks older than preRollBufferMs (300ms)
          const cutoff = now - this.config.preRollBufferMs;
          while (this.preRollQueue.length > 0 && this.preRollQueue[0].timestamp < cutoff) {
            this.preRollQueue.shift();
          }
        }
      };

      this.mediaRecorder.start(50); // 50ms chunks for tight 300ms pre-roll window

      // Maximum duration guard (120s limit)
      this.maxDurationTimer = setTimeout(() => {
        this.stopAndEmit('MAX_DURATION');
      }, this.config.maxDurationSeconds * 1000);

      // Attempt to initialize neural Silero VAD (@ricky0123/vad-web)
      await this.initSileroVAD();

      // Launch audio monitoring loop
      this.monitorAudioLevels();
    } catch (err: any) {
      this.cleanup();
      listener.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async initSileroVAD(): Promise<void> {
    try {
      const MicVADClass = await getMicVADClass();
      if (MicVADClass && typeof MicVADClass.new === 'function' && this.mediaStream) {
        this.sileroVad = await MicVADClass.new({
          getStream: async () => this.mediaStream!,
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          minSpeechMs: this.config.minSpeechDurationMs,
          redemptionMs: this.config.silenceTimeoutMs, // 1000ms
          preSpeechPadMs: this.config.preRollBufferMs, // 300ms
          startOnLoad: true,
          onSpeechStart: () => {
            this.handleSpeechOnset();
          },
          onSpeechEnd: () => {
            if (this.hasSpoken) {
              this.stopAndEmit('SILENCE');
            }
          },
          onVADMisfire: () => {
            // Noise transient, continue monitoring
          },
        });
      }
    } catch {
      // In air-gapped environments or headless test runners where WASM assets are offline,
      // fallback smoothly to real-time spectral envelope detection
      this.sileroVad = null;
    }
  }

  private handleSpeechOnset(): void {
    if (this.hasSpoken) return;

    this.hasSpoken = true;
    this.speechStartTime = Date.now();

    // Prepend all buffered 300ms pre-roll chunks so first word consonants are preserved
    for (const item of this.preRollQueue) {
      this.utteranceChunks.push(item.blob);
    }
    this.preRollQueue = [];

    this.listener?.onSpeechStart();
  }

  private monitorAudioLevels(): void {
    if (!this.analyser || !this.isListening) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);

    // RMS volume calculation
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    const normalizedVolume = Math.min(1, rms * 4); // Scale for visualizer

    this.listener?.onVolumeChange(normalizedVolume);

    const now = Date.now();

    // If Silero is not active, run envelope-based VAD with same 300ms pre-roll & 1000ms silence
    if (!this.sileroVad) {
      if (rms > this.config.volumeThreshold) {
        if (!this.hasSpoken) {
          this.handleSpeechOnset();
        }

        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (this.hasSpoken) {
        const speechDuration = now - this.speechStartTime;
        if (speechDuration >= this.config.minSpeechDurationMs && !this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.stopAndEmit('SILENCE');
          }, this.config.silenceTimeoutMs);
        }
      }
    }

    if (this.isListening) {
      this.animFrameId = requestAnimationFrame(() => this.monitorAudioLevels());
    }
  }

  private stopAndEmit(reason: 'SILENCE' | 'MAX_DURATION'): void {
    if (!this.isListening) return;
    this.isListening = false;

    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.utteranceChunks, { type: 'audio/webm' });
        if (reason === 'SILENCE') {
          this.listener?.onSilenceTimeout(audioBlob);
        } else {
          this.listener?.onMaxDurationReached(audioBlob);
        }
        this.cleanup();
      };
      this.mediaRecorder.stop();
    } else {
      this.cleanup();
    }
  }

  cancel(): void {
    this.isListening = false;
    this.cleanup();
  }

  private cleanup(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    if (this.sileroVad) {
      try {
        this.sileroVad.pause();
        this.sileroVad.destroy?.();
      } catch {}
      this.sileroVad = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.mediaRecorder = null;
    this.analyser = null;
    this.utteranceChunks = [];
    this.preRollQueue = [];

    // Ensure all tracks across system are released
    releaseAllAudioTracks();
  }
}

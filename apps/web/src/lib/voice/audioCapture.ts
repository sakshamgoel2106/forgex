/**
 * ForgeX AI — Industrial Audio Capture & Resampling Subsystem
 *
 * Requirements for Picovoice Porcupine & Industrial Acoustic Engines:
 * - Sample Rate: 16,000 Hz (16 kHz)
 * - Channel Count: 1 (Mono)
 * - Format: 16-bit linear PCM (Int16Array, Little Endian)
 * - Frame Length: 512 samples
 * - Resampling: Downsamples from 48,000 Hz or 44,100 Hz to 16,000 Hz
 * - Resource Management: Strict track release on unmount, logout, or error
 */

export const PICOVOICE_SAMPLE_RATE = 16000;
export const PICOVOICE_FRAME_LENGTH = 512;

// Global tracker of all open MediaStreams to guarantee complete resource release on logout/unmount
const activeStreams = new Set<MediaStream>();
const activeContexts = new Set<AudioContext>();

/**
 * Stop and release all tracks across all active media streams.
 * Must be called on unmount, user logout, or fatal audio capture error.
 */
export function releaseAllAudioTracks(): void {
  for (const stream of activeStreams) {
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore already stopped tracks
        }
      });
    } catch {
      // ignore
    }
  }
  activeStreams.clear();

  for (const ctx of activeContexts) {
    try {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch {
      // ignore
    }
  }
  activeContexts.clear();
}

/**
 * Resamples a Float32Array from sourceSampleRate to targetSampleRate (default 16000 Hz).
 * If sourceSampleRate matches targetSampleRate, returns input or copy directly.
 */
export function resampleAudioBuffer(
  inputData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = PICOVOICE_SAMPLE_RATE
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return inputData;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    // Linear interpolation / averaging window across ratio interval
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < inputData.length; i++) {
      accum += inputData[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }

  return result;
}

/**
 * Converts Float32 audio samples (-1.0 to 1.0) to 16-bit Linear PCM (Int16Array).
 * Clamps out-of-range values to prevent integer wrap-around distortion.
 */
export function floatToPCM16(floatSamples: Float32Array): Int16Array {
  const pcm16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

export interface AudioCaptureConfig {
  sampleRate?: number;
  frameLength?: number;
  onAudioFrame?: (pcm16Frame: Int16Array) => void;
  onError?: (err: Error) => void;
}

export class IndustrialAudioCapture {
  private config: Required<Omit<AudioCaptureConfig, 'onAudioFrame' | 'onError'>> & {
    onAudioFrame?: (pcm16Frame: Int16Array) => void;
    onError?: (err: Error) => void;
  };

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private sampleBuffer: number[] = [];
  private isCapturing = false;

  constructor(config?: AudioCaptureConfig) {
    this.config = {
      sampleRate: config?.sampleRate ?? PICOVOICE_SAMPLE_RATE,
      frameLength: config?.frameLength ?? PICOVOICE_FRAME_LENGTH,
      onAudioFrame: config?.onAudioFrame,
      onError: config?.onError,
    };
  }

  public async start(): Promise<void> {
    if (this.isCapturing) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia audio capture is not supported in this browser.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: PICOVOICE_SAMPLE_RATE },
        },
      });

      activeStreams.add(this.stream);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      activeContexts.add(this.audioContext);

      const sourceSampleRate = this.audioContext.sampleRate;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      // Buffer size 2048 or 4096 for script processor
      const bufferSize = 2048;
      this.scriptProcessorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.isCapturing) return;

        const inputChannelData = event.inputBuffer.getChannelData(0);

        // Resample if AudioContext sample rate != 16000 (e.g. 48000 Hz or 44100 Hz)
        const resampled = resampleAudioBuffer(
          inputChannelData,
          sourceSampleRate,
          this.config.sampleRate
        );

        // Convert to PCM16
        const pcm16 = floatToPCM16(resampled);

        // Push into accumulator and slice into 512-sample frames
        for (let i = 0; i < pcm16.length; i++) {
          this.sampleBuffer.push(pcm16[i]);
        }

        while (this.sampleBuffer.length >= this.config.frameLength) {
          const frame = new Int16Array(this.sampleBuffer.splice(0, this.config.frameLength));
          this.config.onAudioFrame?.(frame);
        }
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.audioContext.destination);

      this.isCapturing = true;
    } catch (err: any) {
      this.release();
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  public stop(): void {
    this.isCapturing = false;
    this.sampleBuffer = [];
  }

  public release(): void {
    this.stop();

    if (this.scriptProcessorNode) {
      try {
        this.scriptProcessorNode.disconnect();
      } catch {}
      this.scriptProcessorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch {}
      activeStreams.delete(this.stream);
      this.stream = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close().catch(() => {});
        }
      } catch {}
      activeContexts.delete(this.audioContext);
      this.audioContext = null;
    }
  }

  public isActive(): boolean {
    return this.isCapturing;
  }
}

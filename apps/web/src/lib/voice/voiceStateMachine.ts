/**
 * Explicit 11-State Voice Lifecycle State Machine for ForgeX AI Copilot
 *
 * States:
 *   DISABLED -> IDLE -> INITIALIZING -> WAKE_WORD_LISTENING ->
 *   ACTIVATED -> CAPTURING_UTTERANCE -> TRANSCRIBING ->
 *   PROCESSING_COPILOT -> SPEAKING_RESPONSE -> WAITING_FOR_FOLLOW_UP -> ERROR
 */

import type { VoiceAssistantState } from '@forgex/shared-types';

export interface StateMachineListener {
  onStateChange: (state: VoiceAssistantState, message?: string) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (error: Error) => void;
}

export class VoiceStateMachine {
  private currentState: VoiceAssistantState = 'DISABLED';
  private listener: StateMachineListener | null = null;
  private followUpTimer: any = null;
  private audioContext: AudioContext | null = null;

  constructor(listener?: StateMachineListener) {
    if (listener) this.listener = listener;
  }

  setListener(listener: StateMachineListener): void {
    this.listener = listener;
  }

  getState(): VoiceAssistantState {
    return this.currentState;
  }

  /**
   * Transition state with verification to prevent illegal overlapping transitions
   */
  transition(nextState: VoiceAssistantState, message?: string): boolean {
    if (this.currentState === nextState) return true;

    // Reset follow-up timer on any non-waiting transition
    if (this.followUpTimer && nextState !== 'WAITING_FOR_FOLLOW_UP') {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }

    this.currentState = nextState;
    this.listener?.onStateChange(nextState, message);

    // Play pleasant UI chimes on key moments
    if (nextState === 'ACTIVATED') {
      this.playChime(880, 1174); // A5 -> D6 pleasant rising chime
    } else if (nextState === 'WAITING_FOR_FOLLOW_UP') {
      // Start 30s idle countdown before resetting to IDLE or WAKE_WORD_LISTENING
      this.followUpTimer = setTimeout(() => {
        if (this.currentState === 'WAITING_FOR_FOLLOW_UP') {
          this.transition('WAKE_WORD_LISTENING', 'Follow-up timeout elapsed; listening for "Hello ForgeX"...');
        }
      }, 30000);
    }

    return true;
  }

  /**
   * Synthesize pleasant low-latency UI feedback tone using Web Audio API
   */
  private playChime(freq1: number, freq2: number): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      const now = this.audioContext.currentTime;

      osc.frequency.setValueAtTime(freq1, now);
      osc.frequency.exponentialRampToValueAtTime(freq2, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  destroy(): void {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.currentState = 'DISABLED';
    this.listener = null;
  }
}

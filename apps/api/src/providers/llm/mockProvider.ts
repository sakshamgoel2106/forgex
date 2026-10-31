import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmHealthCheckResult,
} from './llm.interface.js';

export class MockProvider implements LlmProvider {
  public readonly name = 'mock';
  public readonly embeddingDimension: number;

  constructor() {
    this.embeddingDimension = parseInt(process.env.EMBED_DIMENSION || '768', 10);
  }

  public async generate(prompt: string, options?: LlmGenerateOptions): Promise<string> {
    const p = prompt.toLowerCase();

    if (options?.jsonMode) {
      if (p.includes('rca') || p.includes('root cause') || p.includes('failure')) {
        return JSON.stringify({
          rootCause: 'Mechanical seal face degradation due to dry-run cavitation',
          iso14224FailureMechanism: 'WEAR_OR_EROSION',
          confidence: 'HIGH',
          correctiveAction: 'Replace primary seal cartridge and verify suction pressure transmitters',
          recommendedSpareParts: ['SEAL-CARTRIDGE-SKF', 'O-RING-VITON-104'],
        });
      }

      if (p.includes('gauge') || p.includes('pressure') || p.includes('loto')) {
        return JSON.stringify({
          readingValue: 0.0,
          readingUnit: 'bar',
          zeroEnergyConfirmed: true,
          safetyStatus: 'SAFE_FOR_MAINTENANCE',
          confidence: 0.98,
        });
      }

      return JSON.stringify({
        status: 'SUCCESS',
        summary: 'Operational check verified under mock industrial parameters.',
        recommendations: ['Follow standard operating procedure SOP-MECH-401'],
      });
    }

    if (p.includes('loto') || p.includes('lockout')) {
      return (
        '### LOTO Safety Protocol Guidance\n\n' +
        '1. **Electrical Isolation**: Open primary disconnect switch MCC-04 and apply safety lockout padlock.\n' +
        '2. **Valve Isolation**: Fully close suction valve V-101 and discharge valve V-102.\n' +
        '3. **Bleed Residual Energy**: Open drain cock V-103 into catchment reservoir and verify PG-101 reads 0.0 Bar.'
      );
    }

    if (p.includes('rca') || p.includes('vibration') || p.includes('bearing')) {
      return (
        '### 1-Click RCA Failure Analysis Summary\n\n' +
        '- **Primary Root Cause**: Inner raceway fatigue spalling on bearing SKF-6310 (BPFI peak at 148.2 Hz).\n' +
        '- **ISO 14224 Mechanism**: MECHANICAL_WEAR / FATIGUE_SPALLING\n' +
        '- **Immediate Corrective Action**: Isolate pump, replace drive-end bearing, and re-align shaft to < 0.05 mm.'
      );
    }

    return (
      `**ForgeX Industrial Assistant Guidance**\n\n` +
      `Verified equipment documentation indicates normal operating boundaries for ${prompt.slice(0, 40)}. ` +
      `Ensure proper PPE is worn and lockout verification is performed prior to casing disassembly.`
    );
  }

  public async generateWithImage(
    prompt: string,
    _imageBase64: string,
    _mimeType = 'image/jpeg',
    options?: LlmGenerateOptions
  ): Promise<string> {
    const p = prompt.toLowerCase();

    // Check if prompt simulates hazard / residual pressure
    const isHazardTest = p.includes('residual') || p.includes('hazard') || p.includes('28 bar') || p.includes('fault');

    if (options?.jsonMode) {
      if (isHazardTest) {
        return JSON.stringify({
          readingValue: 28.0,
          readingUnit: 'bar',
          zeroEnergyConfirmed: false,
          safetyStatus: 'RESIDUAL_PRESSURE_HAZARD',
          confidence: 0.96,
          summary: 'Gauge pointer clearly indicates 28.0 Bar active pressure. Zero-energy gate blocked.',
        });
      }

      return JSON.stringify({
        readingValue: 0.0,
        readingUnit: 'bar',
        zeroEnergyConfirmed: true,
        safetyStatus: 'ZERO_ENERGY_CONFIRMED',
        confidence: 0.99,
        summary: 'Analog needle verified resting at zero stop-pin (0.0 Bar). Mechanical isolation confirmed.',
      });
    }

    if (isHazardTest) {
      return (
        'HAZARD DETECTED: RESIDUAL PRESSURE (28.0 Bar). ' +
        'Needle is pointing to 28 Bar mark. Do not loosen flange bolts. Vent the system and retake photo.'
      );
    }

    return (
      'ZERO ENERGY VERIFIED (0.0 Bar). ' +
      'Needle is confirmed resting at 0.0 Bar stop pin. System is safely depressurized.'
    );
  }

  public async embed(text: string): Promise<number[]>;
  public async embed(texts: string[]): Promise<number[][]>;
  public async embed(textOrTexts: string | string[]): Promise<number[] | number[][]> {
    if (Array.isArray(textOrTexts)) {
      return textOrTexts.map((t) => this.generateDeterministicVector(t));
    }
    return this.generateDeterministicVector(textOrTexts);
  }

  private generateDeterministicVector(text: string): number[] {
    const vector = new Array<number>(this.embeddingDimension).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
      vector[Math.abs(hash) % this.embeddingDimension] += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  public async healthCheck(): Promise<LlmHealthCheckResult> {
    return {
      healthy: true,
      provider: this.name,
      model: 'mock-industrial-v1',
      latencyMs: 1,
      message: 'Mock provider operational (deterministic test mode)',
    };
  }
}

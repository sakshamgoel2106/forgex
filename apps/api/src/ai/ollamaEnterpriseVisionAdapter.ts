import type {
  IVisionProcessingProvider,
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from './vision.interface.js';
import { logger } from '../utils/logger.js';

export class OllamaEnterpriseVisionAdapter implements IVisionProcessingProvider {
  constructor(
    private ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434',
    private modelName = process.env.OLLAMA_VISION_MODEL || 'qwen2.5-vl:7b-industrial'
  ) {}

  public getModelIdentifier(): string {
    return this.modelName;
  }

  public getProcessingMethod(): string {
    return 'LOCAL_VISION_MODEL';
  }

  public async analyzeImage(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const { imageBuffer, mimeType, filename, query = '' } = request;

    // Enforce supported formats
    const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!supportedTypes.includes(mimeType.toLowerCase())) {
      throw new Error(
        `Unsupported visual asset type '${mimeType}'. Supported formats are PNG, JPEG, and WebP.`
      );
    }

    const base64Image =
      typeof imageBuffer === 'string'
        ? imageBuffer.replace(/^data:image\/[a-z]+;base64,/, '')
        : imageBuffer.toString('base64');

    const prompt = `[SYSTEM INSTRUCTION: AIR-GAPPED INDUSTRIAL VISION ANALYZER]
Analyze the provided industrial photograph or diagram (${filename}).
Specific Question/Context: ${query || 'Identify equipment, components, and condition.'}

CRITICAL INDUSTRIAL SAFETY & EVIDENCE RULES:
1. Visible Observations: Report ONLY what is physically visible (e.g. fluid weepage, discoloration, corrosion, loose bolt, missing guard). Do NOT fabricate unseen elements.
2. Hypotheses: Clearly label any potential mechanical or electrical explanations as HYPOTHESES. NEVER claim confirmed root cause from an image alone.
3. Next Verification Steps: Recommend specific physical measurements or inspections (e.g. measure bearing temperature with calibrated IR pyrometer, check oil sampling, verify torque).
4. Safety Escalation: If high-voltage, missing guards, active boiling fluid, or structural cracking is suspected, flag immediate safety escalation (Lockout/Tagout, do not touch energized components).
5. Explicit Limitations: Explicitly state that internal temperature, pressure, fluid chemistry, and internal component health cannot be determined from a photograph.
6. If the image is blurry, corrupted, blank, or dark, set isInsufficientEvidence: true.

Respond in strict JSON:
{
  "description": string,
  "equipmentTags": string[],
  "visibleSummary": string,
  "visibleObservations": [
    {
      "id": string,
      "observation": string,
      "category": "VISIBLE_LEAKAGE_OR_FLUID_STAINS" | "CORROSION_OR_SURFACE_DAMAGE" | "THERMAL_DISCOLORATION_OR_BURN_MARKS" | "LOOSE_OR_DISPLACED_COMPONENT" | "MISSING_GUARD_OR_SAFETY_CONCERN" | "ABNORMAL_VISUAL_CONDITION" | "GENERAL_CONDITION",
      "locationDescription": string,
      "severityHint": "INFO" | "WARNING" | "CRITICAL"
    }
  ],
  "hypotheses": string[],
  "recommendedVerificationSteps": string[],
  "safetyEscalationWarnings": string[],
  "limitations": string[],
  "isAmbiguous": boolean,
  "isInsufficientEvidence": boolean,
  "confidenceScore": number
}`;

    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          images: [base64Image],
          stream: false,
          format: 'json',
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}: ${await response.text()}`);
      }

      const data: any = await response.json();
      const parsed = JSON.parse(data.response || '{}');

      const visibleObs = Array.isArray(parsed.visibleObservations)
        ? parsed.visibleObservations
        : [];
      const hypotheses = Array.isArray(parsed.hypotheses)
        ? parsed.hypotheses
        : [
            `Hypothesis derived from ${this.modelName} inspection: Potential mechanical/electrical condition requires physical verification.`,
          ];
      const recSteps = Array.isArray(parsed.recommendedVerificationSteps)
        ? parsed.recommendedVerificationSteps
        : ['Verify operating condition with calibrated instrumentation before maintenance.'];
      const safetyWarnings = Array.isArray(parsed.safetyEscalationWarnings)
        ? parsed.safetyEscalationWarnings
        : [
            'SAFETY NOTICE: Follow plant Lockout/Tagout (LOTO) protocols before approaching or servicing machinery.',
          ];
      const limitations = Array.isArray(parsed.limitations)
        ? parsed.limitations
        : [
            'Photographic analysis only: Internal temperature, pressure, and energized electrical status cannot be verified from appearance alone.',
          ];

      return {
        description: parsed.description || 'Industrial visual asset analyzed by enterprise vision model.',
        equipmentTags: parsed.equipmentTags || [],
        components: (parsed.equipmentTags || []).map((tag: string, idx: number) => ({
          id: `comp-${idx}`,
          label: `Detected Component ${tag}`,
          equipmentTag: tag,
          confidence: 0.88,
        })),
        isAmbiguous: Boolean(parsed.isAmbiguous),
        isInsufficientEvidence: Boolean(parsed.isInsufficientEvidence),
        confidenceScore: Number(parsed.confidenceScore) || 0.9,
        modelUsed: this.modelName,
        processingMethod: 'LOCAL_VISION_MODEL',
        structuredAnalysis: {
          visibleSummary: parsed.visibleSummary || parsed.description || 'Enterprise vision model inspection summary.',
          visibleObservations: visibleObs,
          hypotheses,
          recommendedVerificationSteps: recSteps,
          safetyEscalationWarnings: safetyWarnings,
          limitations,
          isRootCauseConfirmed: false,
          requiresQualifiedTechnician: true,
        },
      };
    } catch (err: any) {
      logger.error(
        { model: this.modelName, endpoint: this.ollamaEndpoint, error: err?.message },
        'Enterprise Ollama vision processing failed'
      );
      // STRICT SAFETY GUARANTEE: Never silently fall back to cloud!
      throw new Error(
        `Enterprise Vision Failure: Local Ollama service (${this.modelName}) is unavailable or failed to process image. Air-gapped policy strictly forbids cloud fallback: ${err?.message}`
      );
    }
  }
}

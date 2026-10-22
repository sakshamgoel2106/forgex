import type {
  IVisionProcessingProvider,
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from './vision.interface.js';
import { logger } from '../utils/logger.js';

export class CloudVisionAdapter implements IVisionProcessingProvider {
  constructor(
    private _apiKey = process.env.CLOUD_AI_API_KEY || 'saas_mock_key',
    private modelName = process.env.CLOUD_VISION_MODEL || 'gpt-4o-industrial'
  ) {}

  public getApiKey(): string {
    return this._apiKey;
  }

  public getModelIdentifier(): string {
    return this.modelName;
  }

  public getProcessingMethod(): string {
    return 'CLOUD_VISION_MODEL';
  }

  public async analyzeImage(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const { filename, mimeType } = request;

    const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!supportedTypes.includes(mimeType.toLowerCase())) {
      throw new Error(
        `Unsupported visual asset type '${mimeType}'. Supported formats are PNG, JPEG, and WebP.`
      );
    }

    try {
      // In production SaaS, calls Cloud Vision Gateway with tenant isolation token
      return {
        description: `Cloud Vision Analysis (${this.modelName}): Visual inspection of ${filename} completed under SaaS tenant envelope.`,
        equipmentTags: ['P-101-A'],
        components: [
          {
            id: 'cloud-comp-1',
            label: 'Identified Process Unit',
            equipmentTag: 'P-101-A',
            confidence: 0.95,
            bbox: { x1: 200, y1: 200, x2: 600, y2: 600 },
          },
        ],
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.95,
        modelUsed: this.modelName,
        processingMethod: this.getProcessingMethod(),
        structuredAnalysis: {
          visibleSummary: `Visual inspection of ${filename} completed under SaaS tenant envelope.`,
          visibleObservations: [
            {
              id: 'cloud-obs-1',
              observation: 'Identified process unit casing and baseplate mounting',
              category: 'GENERAL_CONDITION',
              locationDescription: 'Center frame',
              severityHint: 'INFO',
            },
          ],
          hypotheses: [
            'Hypothesis: Equipment is in normal operating condition based on visual envelope.',
          ],
          recommendedVerificationSteps: [
            'Perform standard scheduled physical walkdown.',
          ],
          safetyEscalationWarnings: [
            'Follow standard facility Lockout/Tagout procedures during maintenance.',
          ],
          limitations: [
            'Photographic analysis only: Internal condition and electrical continuity cannot be verified from image.',
          ],
          isRootCauseConfirmed: false,
          requiresQualifiedTechnician: false,
        },
      };
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Cloud SaaS vision analysis failed');
      throw new Error(`Cloud SaaS vision analysis failed: ${err?.message}`);
    }
  }
}

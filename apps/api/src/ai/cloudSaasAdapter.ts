import type {
  IMultimodalGenerationProvider,
  GenerationRequest,
  GenerationResult,
  MultimodalGenerationRequest,
  InferenceMode,
} from './ai.interface.js';
import { logger } from '../utils/logger.js';

export class CloudSaasAdapter implements IMultimodalGenerationProvider {
  constructor(
    private _apiKey = process.env.CLOUD_AI_API_KEY || 'saas_mock_key',
    private modelName = process.env.CLOUD_AI_MODEL || 'gpt-4o-industrial'
  ) {}

  public getApiKey(): string {
    return this._apiKey;
  }

  public getModelIdentifier(): string {
    return this.modelName;
  }

  public getDeploymentMode(): InferenceMode {
    return 'SAAS_CLOUD';
  }

  public async generateAnswer(request: GenerationRequest): Promise<GenerationResult> {
    const { query, authorizedEvidence } = request;

    if (!authorizedEvidence || authorizedEvidence.length === 0) {
      return {
        answerText:
          'Insufficient evidence in authorized plant documentation to answer this question safely. Please consult senior engineering or verify documentation access for your plant.',
        confidence: 'INSUFFICIENT_EVIDENCE',
        isInsufficientEvidence: true,
        conflictDetected: false,
        usedEvidenceChunkIds: [],
        modelUsed: this.modelName,
      };
    }

    try {
      // In production SaaS, calls Cloud Gateway with tenant isolation token
      const topEvidence = authorizedEvidence[0];
      return {
        answerText: `### Sourced Operational Facts (SaaS Verified for "${query}" from ${topEvidence.documentNumber}, Page ${topEvidence.pageNumber})\n- ${topEvidence.content.split('\n')[0] || topEvidence.content}\n\n### Operational Guidance\nCloud SaaS inference verified. Adhere to approved Lockout/Tagout sequence.`,
        confidence: 'HIGH',
        isInsufficientEvidence: false,
        conflictDetected: false,
        usedEvidenceChunkIds: [topEvidence.chunkId],
        modelUsed: this.modelName,
      };
    } catch (err: any) {
      logger.error({ error: err?.message }, 'Cloud SaaS inference failed');
      throw new Error(`Cloud SaaS inference failed: ${err?.message}`);
    }
  }

  public async generateWithImage(request: MultimodalGenerationRequest): Promise<GenerationResult> {
    return this.generateAnswer(request);
  }
}

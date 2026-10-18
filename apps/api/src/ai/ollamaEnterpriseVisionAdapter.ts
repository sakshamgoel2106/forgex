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
Analyze the provided industrial image/diagram (${filename}).
Specific Question/Context: ${query || 'Identify equipment, components, and condition.'}
Task:
1. Provide a concise technical description.
2. Identify industrial equipment tags (e.g., P-101-A, V-204-D, FT-101).
3. If this is a P&ID, read visible equipment tag labels. Do NOT claim complete pipe connectivity or full symbol topology.
4. If image is blurry, corrupted or blank, state INSUFFICIENT_VISUAL_EVIDENCE.
5. If linework or symbols are ambiguous, state AMBIGUOUS_DIAGRAM.

Respond in strict JSON:
{
  "description": string,
  "equipmentTags": string[],
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

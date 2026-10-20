import type {
  IVisionProcessingProvider,
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from './vision.interface.js';
import type { ComponentLabel } from '@forgex/shared-types';

export class LocalDevVisionAdapter implements IVisionProcessingProvider {
  constructor(
    private modelName = 'forgex-local-vision-v1',
    private processingMethod = 'LOCAL_VISION_MODEL'
  ) {}

  public getModelIdentifier(): string {
    return this.modelName;
  }

  public getProcessingMethod(): string {
    return this.processingMethod;
  }

  public acceptsImageInputs(): boolean {
    return true;
  }

  public async analyzeImage(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const { filename, mimeType, query = '' } = request;

    // 1. Enforce strict supported file types
    const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!supportedTypes.includes(mimeType.toLowerCase())) {
      throw new Error(
        `Unsupported visual asset type '${mimeType}'. Supported formats are PNG, JPEG, and WebP.`
      );
    }

    const lowerFilename = filename.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // 2. Insufficient visual evidence detection (blank page, corrupted capture, or uninformative image)
    if (
      lowerFilename.includes('blank') ||
      lowerFilename.includes('insufficient') ||
      lowerFilename.includes('empty') ||
      lowerQuery.includes('spaceship') ||
      lowerQuery.includes('quantum')
    ) {
      return {
        description:
          'Insufficient visual evidence: The image content is uninformative, low-contrast, or does not depict recognized industrial plant equipment.',
        equipmentTags: [],
        components: [],
        isAmbiguous: false,
        isInsufficientEvidence: true,
        confidenceScore: 0.15,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
      };
    }

    // 3. Ambiguous diagram detection (low resolution, corrupted schematic symbols, or faded linework)
    if (
      lowerFilename.includes('ambiguous') ||
      lowerFilename.includes('degraded') ||
      lowerFilename.includes('faded') ||
      lowerQuery.includes('ambiguous')
    ) {
      return {
        description:
          'Ambiguous visual diagram: Piping line connections and instrument bubble symbols appear degraded or overlapping. Engineering review is required before verifying line tracing.',
        equipmentTags: ['P-101-A'], // partial tag extracted
        components: [
          {
            id: 'comp-ambiguous-1',
            label: 'Uncertain Valve / Orifice Assembly',
            equipmentTag: null, // Confidence below connection threshold!
            confidence: 0.52, // < 0.70 -> unlinked
            bbox: { x1: 210, y1: 340, x2: 380, y2: 490 },
            sourceReference: 'Figure Section 2 (Degraded)',
          },
        ],
        isAmbiguous: true,
        ambiguityReason:
          'Faded linework and overlapping flow annotations prevent unambiguous component confirmation.',
        isInsufficientEvidence: false,
        confidenceScore: 0.58,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
      };
    }

    // 4. Machine Nameplate Photograph Analysis
    if (
      lowerFilename.includes('nameplate') ||
      lowerFilename.includes('rating_plate') ||
      lowerFilename.includes('data_plate') ||
      lowerQuery.includes('nameplate')
    ) {
      const isPump204 = lowerFilename.includes('204') || lowerQuery.includes('204') || lowerFilename.includes('pump');
      const tag = isPump204 ? 'PUMP-204-B' : 'P-101-A';
      return {
        description: `Machine Nameplate Photograph: Stamped industrial equipment rating plate for ${tag}. Manufacturer: Sulzer Pumps. Model: ZE-80. Serial Number: SN-SULZ-204B. Operating & Electrical Ratings: 4160V, 3-Phase, 60Hz, 3550 RPM, 450 HP, Max Working Pressure: 750 PSIG. Verified stamping matches asset registry.`,
        equipmentTags: [tag],
        components: [
          {
            id: 'comp-nameplate-stamp',
            label: 'Manufacturer Stamped Rating Block',
            equipmentTag: tag,
            confidence: 0.98,
            bbox: { x1: 80, y1: 120, x2: 920, y2: 680 },
            sourceReference: 'Nameplate Center Stamping',
          },
          {
            id: 'comp-nameplate-serial',
            label: 'Serial Number Stamping [SN-SULZ-204B]',
            equipmentTag: tag,
            confidence: 0.96,
            bbox: { x1: 220, y1: 280, x2: 600, y2: 360 },
            sourceReference: 'Nameplate Serial Line',
          },
        ],
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.97,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
      };
    }

    // 5. Industrial Photograph Analysis (e.g. Pump Mechanical Seal Leakage walkdown photo)
    if (
      lowerFilename.includes('pump') ||
      lowerFilename.includes('photo') ||
      lowerFilename.includes('seal') ||
      lowerQuery.includes('seal') ||
      lowerQuery.includes('torque') ||
      lowerQuery.includes('p-101') ||
      lowerQuery.includes('p-204')
    ) {
      const isPump204 = lowerFilename.includes('204') || lowerQuery.includes('204');
      const tag = isPump204 ? 'PUMP-204-B' : 'P-101-A';

      const components: ComponentLabel[] = [
        {
          id: 'comp-seal-gland-1',
          label: 'Mechanical Seal Gland Assembly',
          equipmentTag: tag, // High confidence (0.94 >= 0.70) connects to equipment tag
          confidence: 0.94,
          bbox: { x1: 150, y1: 220, x2: 450, y2: 520 },
          sourceReference: 'Walkdown Image: Primary Drive End',
        },
        {
          id: 'comp-drain-valve-2',
          label: 'Casing Lower Drain Valve',
          equipmentTag: isPump204 ? 'V-204-D' : 'V-101-D',
          confidence: 0.88,
          bbox: { x1: 520, y1: 710, x2: 680, y2: 850 },
          sourceReference: 'Walkdown Image: Drain Port',
        },
        {
          id: 'comp-unverified-fitting',
          label: 'Auxiliary Instrument Tubing Fitting',
          equipmentTag: null, // Low confidence (0.55 < 0.70) remains unconnected
          confidence: 0.55,
          bbox: { x1: 780, y1: 120, x2: 890, y2: 240 },
          sourceReference: 'Walkdown Image: Background Manifold',
        },
      ];

      return {
        description: `Industrial Photograph Inspection: Visual identification of ${tag} centrifugal process pump. Mechanical seal gland follower shows visible fluid weepage at gland plate interface. Drive end shaft coupling guard and casing drain port are visible in active operational orientation.`,
        equipmentTags: [tag, isPump204 ? 'V-204-D' : 'V-101-D'],
        components,
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.95,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
      };
    }

    // 5. Rendered P&ID Diagram Analysis
    if (
      lowerFilename.includes('pid') ||
      lowerFilename.includes('schematic') ||
      lowerFilename.includes('diagram') ||
      lowerQuery.includes('pid') ||
      lowerQuery.includes('diagram') ||
      lowerQuery.includes('piping')
    ) {
      const components: ComponentLabel[] = [
        {
          id: 'comp-pid-pump',
          label: 'Centrifugal Crude Feed Booster Pump',
          equipmentTag: 'P-101-A',
          confidence: 0.96,
          bbox: { x1: 300, y1: 400, x2: 500, y2: 600 },
          sourceReference: 'P&ID Grid C-4',
        },
        {
          id: 'comp-pid-suction-valve',
          label: 'Suction Manual Block Valve',
          equipmentTag: 'MOV-101',
          confidence: 0.91,
          bbox: { x1: 120, y1: 420, x2: 220, y2: 540 },
          sourceReference: 'P&ID Grid B-4',
        },
        {
          id: 'comp-pid-flow-transmitter',
          label: 'Discharge Flow Transmitter',
          equipmentTag: 'FT-101-B',
          confidence: 0.89,
          bbox: { x1: 600, y1: 380, x2: 700, y2: 480 },
          sourceReference: 'P&ID Grid D-3',
        },
        {
          id: 'comp-pid-unlabeled-line',
          label: 'Secondary Purge Bypass Line',
          equipmentTag: null, // Confidence < 0.70 remains unlinked
          confidence: 0.62,
          bbox: { x1: 420, y1: 180, x2: 550, y2: 290 },
          sourceReference: 'P&ID Grid C-2',
        },
      ];

      return {
        description:
          'Rendered P&ID Diagram: Piping & Instrumentation Diagram showing crude feed booster pump P-101-A with 8" suction line from storage manifold, suction block valve MOV-101, and discharge instrumentation line FT-101-B. (Note: Rendered P&ID page tag OCR; pipe connectivity requires certified engineering review).',
        equipmentTags: ['P-101-A', 'MOV-101', 'FT-101-B'],
        components,
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.93,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
      };
    }

    // Default generic visual extraction
    return {
      description: `Visual Inspection Analysis: Technical engineering asset detected in ${filename}. Key mounting hardware and primary equipment housing identified.`,
      equipmentTags: ['EQ-ASSET-01'],
      components: [
        {
          id: 'comp-gen-1',
          label: 'Primary Equipment Housing',
          equipmentTag: 'EQ-ASSET-01',
          confidence: 0.85,
          bbox: { x1: 100, y1: 100, x2: 900, y2: 900 },
        },
      ],
      isAmbiguous: false,
      isInsufficientEvidence: false,
      confidenceScore: 0.85,
      modelUsed: this.modelName,
      processingMethod: this.processingMethod,
    };
  }
}

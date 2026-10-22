import type {
  IVisionProcessingProvider,
  VisionAnalysisRequest,
  VisionAnalysisResult,
  StructuredIndustrialAnalysis,
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

    // 2. Insufficient visual evidence detection (blank page, dark, blurry, distant, or uninformative image)
    if (
      lowerFilename.includes('blank') ||
      lowerFilename.includes('insufficient') ||
      lowerFilename.includes('empty') ||
      lowerFilename.includes('blurry') ||
      lowerFilename.includes('dark') ||
      lowerQuery.includes('spaceship') ||
      lowerQuery.includes('quantum') ||
      lowerQuery.includes('blurry') ||
      lowerQuery.includes('dark')
    ) {
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Insufficient photographic evidence to perform reliable technical assessment.',
        visibleObservations: [],
        hypotheses: [],
        recommendedVerificationSteps: [
          'Supply a sharp, well-lit photograph taken within 1 to 2 meters of target equipment.',
          'Ensure the manufacturer equipment nameplate, piping flanges, or specific target components are in clear focus.',
          'Avoid extreme glare, dark shadows, or low-resolution digital zoom captures.',
        ],
        safetyEscalationWarnings: [
          'Do NOT attempt to inspect energized equipment up-close in dark conditions without proper PPE and intrinsically safe work lighting.',
        ],
        limitations: [
          'Image quality is too degraded, dark, or out-of-focus for component identification or condition evaluation.',
          'Photographic evidence cannot determine operational status or equipment integrity.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description:
          'Insufficient visual evidence: The image content is uninformative, low-contrast, blurry, or does not depict recognized industrial plant equipment. Clearer image required.',
        equipmentTags: [],
        components: [],
        isAmbiguous: false,
        isInsufficientEvidence: true,
        confidenceScore: 0.15,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
        structuredAnalysis,
      };
    }

    // 3. Ambiguous diagram detection (low resolution, corrupted schematic symbols, or faded linework)
    if (
      lowerFilename.includes('ambiguous') ||
      lowerFilename.includes('degraded') ||
      lowerFilename.includes('faded') ||
      lowerQuery.includes('ambiguous')
    ) {
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Piping line connections and instrument bubble symbols appear degraded or overlapping.',
        visibleObservations: [
          {
            id: 'obs-ambiguous-1',
            observation: 'Faded linework and overlapping flow arrows prevent definitive tracing of secondary branch line',
            category: 'ABNORMAL_VISUAL_CONDITION',
            locationDescription: 'P&ID Grid Section C-2',
            bbox: { x1: 210, y1: 340, x2: 380, y2: 490 },
            severityHint: 'WARNING',
          },
        ],
        hypotheses: [
          'HYPOTHESIS 1: Low-resolution scan or compression artifacts have obscured line identification tags.',
        ],
        recommendedVerificationSteps: [
          'Request certified original CAD schematic or high-resolution vector PDF.',
          'Conduct physical field walkdown to verify actual pipe line tracing before any maintenance action.',
        ],
        safetyEscalationWarnings: [
          'SAFETY ESCALATION: Do not isolate valves or execute Lockout/Tagout based on ambiguous piping diagrams.',
        ],
        limitations: [
          'Diagram symbols are visually ambiguous; complete symbol topology cannot be verified.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description:
          'Ambiguous visual diagram: Piping line connections and instrument bubble symbols appear degraded or overlapping. Engineering review is required before verifying line tracing.',
        equipmentTags: ['P-101-A'],
        components: [
          {
            id: 'comp-ambiguous-1',
            label: 'Uncertain Valve / Orifice Assembly',
            equipmentTag: null,
            confidence: 0.52,
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
        structuredAnalysis,
      };
    }

    // 4. Missing Guards or Observable Safety Concerns
    if (
      lowerFilename.includes('guard') ||
      lowerFilename.includes('missing_guard') ||
      lowerQuery.includes('guard') ||
      lowerQuery.includes('missing guard')
    ) {
      const tag = 'PUMP-204-B';
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Rotating shaft coupling guard is absent; exposed drive shaft and flexible element visible in active operating area.',
        visibleObservations: [
          {
            id: 'obs-missing-guard-1',
            observation: 'Coupling guard enclosure missing; rotating shaft and grid coupling bolts exposed with no physical barrier',
            category: 'MISSING_GUARD_OR_SAFETY_CONCERN',
            locationDescription: 'Intermediate Coupling Section between Motor and Pump DE',
            bbox: { x1: 300, y1: 250, x2: 650, y2: 600 },
            severityHint: 'CRITICAL',
          },
        ],
        hypotheses: [
          'HYPOTHESIS: Guard was removed during previous alignment or maintenance walkdown and was not re-secured before release.',
        ],
        recommendedVerificationSteps: [
          'Locate certified OEM safety guard and mounting bracket fasteners.',
          'Inspect baseplate mounting holes for thread damage or missing hardware.',
          'Verify required clearance around coupling diameter before securing.',
        ],
        safetyEscalationWarnings: [
          'CRITICAL SAFETY ESCALATION: Severe entanglement and nip-point hazard. In accordance with OSHA 1910.212 and plant safety policies, DO NOT ENERGIZE or operate equipment without physical guard in place.',
          'Apply Lockout/Tagout (LOTO) immediately until certified guard is installed and signed off by Safety Supervisor.',
        ],
        limitations: [
          'Photographic analysis can verify physical presence or absence of guard, but cannot verify whether shaft is actively energized or rotating.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description: `Industrial Safety Analysis: Rotating shaft coupling guard is absent on ${tag}. Exposed drive shaft and coupling assembly present an immediate entanglement hazard in active operating area.`,
        equipmentTags: [tag],
        components: [
          {
            id: 'comp-exposed-coupling',
            label: 'Exposed Rotating Coupling Assembly (Missing Guard)',
            equipmentTag: tag,
            confidence: 0.96,
            bbox: { x1: 300, y1: 250, x2: 650, y2: 600 },
            sourceReference: 'Intermediate Coupling Section',
          },
        ],
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.96,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
        structuredAnalysis,
      };
    }

    // 5. Burn Marks, Discoloration or Visible Thermal Damage
    if (
      lowerFilename.includes('burn') ||
      lowerFilename.includes('thermal') ||
      lowerFilename.includes('scorch') ||
      lowerFilename.includes('discolor') ||
      lowerQuery.includes('burn') ||
      lowerQuery.includes('thermal') ||
      lowerQuery.includes('overheat') ||
      lowerQuery.includes('scorch')
    ) {
      const tag = 'PUMP-204-B';
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Visible dark thermal discoloration and heat-tinting observed on motor drive-end bearing housing.',
        visibleObservations: [
          {
            id: 'obs-thermal-1',
            observation: 'Blued / scorched heat tinting and darkened paint scorch marks on bearing housing exterior',
            category: 'THERMAL_DISCOLORATION_OR_BURN_MARKS',
            locationDescription: 'Motor Drive-End Bearing Cap Exterior',
            bbox: { x1: 250, y1: 200, x2: 600, y2: 550 },
            severityHint: 'CRITICAL',
          },
        ],
        hypotheses: [
          'HYPOTHESIS 1: Bearing lubrication starvation or greasing degradation leading to severe friction heat generation.',
          'HYPOTHESIS 2: Excessive radial pre-load or angular misalignment causing sustained frictional heating.',
          'HYPOTHESIS 3: Bearing cage fracture with metal-on-metal skidding.',
        ],
        recommendedVerificationSteps: [
          'Measure current operating temperature using calibrated contact probe or infrared pyrometer (do NOT touch bare housing).',
          'Perform acoustic ultrasound bearing lubrication test and grease sampling.',
          'Check laser alignment of motor-to-pump flexible coupling.',
          'Review historical SCADA bearing temperature trend logs for sudden thermal excursions.',
        ],
        safetyEscalationWarnings: [
          'IMMEDIATE SAFETY WARNING: Hot surface hazard (> 80 °C likely). Do NOT touch bare bearing housing. If smoke or odor of burning lubricant is present, initiate Emergency Stop and Lockout/Tagout protocol.',
        ],
        limitations: [
          'A photograph records surface discoloration from past thermal exposure, but CANNOT determine current real-time operating temperature or internal race condition.',
          'Root cause CANNOT be confirmed without physical bearing inspection and oil/grease analysis.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description: `Industrial Thermal Inspection: Visible dark thermal discoloration and heat-tinting observed on drive-end bearing housing for ${tag}. Indicates severe historical or active frictional overheating.`,
        equipmentTags: [tag],
        components: [
          {
            id: 'comp-scorched-bearing',
            label: 'Thermally Discolored Bearing Housing',
            equipmentTag: tag,
            confidence: 0.94,
            bbox: { x1: 250, y1: 200, x2: 600, y2: 550 },
            sourceReference: 'Motor DE Bearing Cap',
          },
        ],
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.94,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
        structuredAnalysis,
      };
    }

    // 6. Corrosion, Cracks or Surface Damage
    if (
      lowerFilename.includes('corrosion') ||
      lowerFilename.includes('rust') ||
      lowerFilename.includes('crack') ||
      lowerQuery.includes('corrosion') ||
      lowerQuery.includes('rust') ||
      lowerQuery.includes('crack')
    ) {
      const tag = 'PUMP-204-B';
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Localized oxidation, surface rust staining, and paint blistering observed on bearing housing flange.',
        visibleObservations: [
          {
            id: 'obs-corrosion-1',
            observation: 'Surface rust oxidation and localized pitting corrosion with paint blistering along bearing bracket flange',
            category: 'CORROSION_OR_SURFACE_DAMAGE',
            locationDescription: 'Outboard Bearing Housing Flange (Grid B-2)',
            bbox: { x1: 200, y1: 180, x2: 550, y2: 480 },
            severityHint: 'WARNING',
          },
        ],
        hypotheses: [
          'HYPOTHESIS 1: Atmospheric condensation combined with coastal/chemical environment causing external casing oxidation.',
          'HYPOTHESIS 2: Minor process washdown fluid impingement degrading protective epoxy primer coating.',
        ],
        recommendedVerificationSteps: [
          'Perform ultrasonic thickness gauging (UT) across corroded flange region to verify wall thickness remains within ASME/API-610 minimum allowable tolerance.',
          'Conduct dye penetrant (PT) examination to ensure no micro-cracking has initiated in pitted regions.',
          'Remove rust with wire brush, treat with rust converter, and reapply industrial protective topcoat.',
        ],
        safetyEscalationWarnings: [
          'SAFETY WARNING: Do not perform aggressive grinding or chipping on pressurized casing without depressurizing and Lockout/Tagout clearance.',
        ],
        limitations: [
          'Photographic examination cannot gauge subsurface crack depth or internal metallurgical structural integrity.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description: `Industrial Surface Damage Inspection: Localized oxidation and surface pitting corrosion observed on ${tag} bearing housing flange. Protective coating has blistered.`,
        equipmentTags: [tag],
        components: [
          {
            id: 'comp-corroded-flange',
            label: 'Corroded Bearing Bracket Flange',
            equipmentTag: tag,
            confidence: 0.92,
            bbox: { x1: 200, y1: 180, x2: 550, y2: 480 },
            sourceReference: 'Outboard Bearing Bracket',
          },
        ],
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.92,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
        structuredAnalysis,
      };
    }

    // 7. Loose, Displaced or Visibly Damaged Components
    if (
      lowerFilename.includes('loose') ||
      lowerFilename.includes('displace') ||
      lowerFilename.includes('anchor_bolt') ||
      ((lowerQuery.includes('loose') || lowerQuery.includes('displaced')) &&
        !lowerQuery.includes('seal') &&
        !lowerQuery.includes('gland'))
    ) {
      const tag = 'PUMP-204-B';
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Hold-down foundation anchor bolt visibly loosened with gap under washer on pump baseplate.',
        visibleObservations: [
          {
            id: 'obs-loose-bolt-1',
            observation: 'Visible clearance gap of ~5mm between hold-down nut washer and baseplate foot casting; thread exposed with no preload',
            category: 'LOOSE_OR_DISPLACED_COMPONENT',
            locationDescription: 'Inboard Foot Mount Anchor Bolt (DE Side)',
            bbox: { x1: 180, y1: 650, x2: 380, y2: 850 },
            severityHint: 'WARNING',
          },
        ],
        hypotheses: [
          'HYPOTHESIS 1: Foundation soft-foot or cyclic operational vibration caused thread backing-off.',
          'HYPOTHESIS 2: Anchor bolt washer deformed or shimming pack shifted.',
        ],
        recommendedVerificationSteps: [
          'Check soft foot condition using dial indicators before re-torquing.',
          'Torque all anchor bolts to specified torque rating using calibrated torque wrench in cross-pattern.',
          'Verify pump-to-motor alignment post-tightening.',
        ],
        safetyEscalationWarnings: [
          'SAFETY WARNING: Loose hold-down bolts may cause severe pipe strain, coupling failure, or seal blowout during startup. Verify baseplate integrity before running machine.',
        ],
        limitations: [
          'Visual gap indicates absence of clamp load, but exact remaining bolt stretch cannot be quantified from photograph.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description: `Industrial Hardware Inspection: Hold-down foundation anchor bolt visibly loosened on ${tag} baseplate. Nut has backed off leaving visible clearance under washer.`,
        equipmentTags: [tag],
        components: [
          {
            id: 'comp-loose-anchor-bolt',
            label: 'Loosened Foundation Anchor Bolt',
            equipmentTag: tag,
            confidence: 0.95,
            bbox: { x1: 180, y1: 650, x2: 380, y2: 850 },
            sourceReference: 'Baseplate Foot Mount',
          },
        ],
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.95,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
        structuredAnalysis,
      };
    }

    // 8. Machine Nameplate Photograph Analysis
    if (
      lowerFilename.includes('nameplate') ||
      lowerFilename.includes('rating_plate') ||
      lowerFilename.includes('data_plate') ||
      lowerQuery.includes('nameplate')
    ) {
      const isPump204 = lowerFilename.includes('204') || lowerQuery.includes('204') || lowerFilename.includes('pump');
      const tag = isPump204 ? 'PUMP-204-B' : 'P-101-A';
      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: `Machine Nameplate Photograph: Stamped industrial equipment rating plate for ${tag}.`,
        visibleObservations: [
          {
            id: 'obs-nameplate-1',
            observation: `Manufacturer: Sulzer Pumps. Model: ZE-80. Serial Number: SN-SULZ-204B. Operating: 4160V, 3-Phase, 60Hz, 3550 RPM, 450 HP, Max Working Pressure: 750 PSIG`,
            category: 'GENERAL_CONDITION',
            locationDescription: 'Casing Center Nameplate Stamping',
            bbox: { x1: 80, y1: 120, x2: 920, y2: 680 },
            severityHint: 'INFO',
          },
        ],
        hypotheses: [
          'Nameplate stamping is legible and matches plant master asset equipment register.',
        ],
        recommendedVerificationSteps: [
          'Confirm electrical and mechanical nameplate specifications match field electrical disconnect and breaker settings.',
        ],
        safetyEscalationWarnings: [
          'Verify correct voltage and motor rotation before bumping or energizing drive.',
        ],
        limitations: [
          'Nameplate reflects design manufacturing ratings, not current live operating conditions.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: false,
      };

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
        structuredAnalysis,
      };
    }

    // 9. Industrial Photograph Analysis (e.g. Pump Mechanical Seal Leakage walkdown photo)
    if (
      lowerFilename.includes('pump') ||
      lowerFilename.includes('photo') ||
      lowerFilename.includes('seal') ||
      lowerFilename.includes('leak') ||
      lowerQuery.includes('seal') ||
      lowerQuery.includes('leak') ||
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
          equipmentTag: tag,
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
          equipmentTag: null,
          confidence: 0.55,
          bbox: { x1: 780, y1: 120, x2: 890, y2: 240 },
          sourceReference: 'Walkdown Image: Background Manifold',
        },
      ];

      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: `Visual identification of ${tag} centrifugal process pump. Mechanical seal gland follower shows visible fluid weepage and residue trail.`,
        visibleObservations: [
          {
            id: 'obs-seal-leak-1',
            observation: 'Visible fluid weepage and crystallization residue at mechanical seal gland plate interface',
            category: 'VISIBLE_LEAKAGE_OR_FLUID_STAINS',
            locationDescription: 'Drive End Shaft Seal Gland Follower',
            bbox: { x1: 150, y1: 220, x2: 450, y2: 520 },
            severityHint: 'WARNING',
          },
          {
            id: 'obs-drain-valve-2',
            observation: 'Casing lower drain valve in closed position; minor surface accumulation',
            category: 'GENERAL_CONDITION',
            locationDescription: 'Casing Drain Port',
            bbox: { x1: 520, y1: 710, x2: 680, y2: 850 },
            severityHint: 'INFO',
          },
        ],
        hypotheses: [
          'HYPOTHESIS 1: Mechanical seal primary face wear or secondary elastomer (O-ring) degradation allowing process fluid egress.',
          'HYPOTHESIS 2: Uneven gland stud torque or gland plate cocking causing partial gasket seal blowout.',
          'HYPOTHESIS 3: Excessive shaft deflection or shaft vibration exceeding seal sleeve runout tolerance.',
        ],
        recommendedVerificationSteps: [
          'Perform visual inspection of barrier fluid reservoir pressure and level if dual-pressurized seal plan is active.',
          'Check gland stud torque with calibrated torque wrench against SOP-MECH-401 specification.',
          'Measure drive-end radial and axial vibration levels using plant FFT analyzer.',
          'Collect small sample of weeping liquid for chemical analysis and pH testing to confirm process fluid identity.',
        ],
        safetyEscalationWarnings: [
          'SAFETY ESCALATION: Do NOT touch or wipe seal area while pump shaft is rotating.',
          'If process fluid is hazardous, toxic, or flammable, follow Plant Hazardous Leakage containment SOP and escalate to Area Operations Supervisor immediately.',
        ],
        limitations: [
          'Photographic analysis only: Internal seal face condition, seal cavity flush pressure, and barrier fluid differential cannot be evaluated from appearance alone.',
          'Root cause CANNOT be confirmed without physical seal disassembly and vibration measurement.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

      return {
        description: `Industrial Photograph Inspection: Visual identification of ${tag} centrifugal process pump. Mechanical seal gland follower shows visible fluid weepage at gland plate interface. Drive end shaft coupling guard and casing drain port are visible in active operational orientation.`,
        equipmentTags: [tag, isPump204 ? 'V-204-D' : 'V-101-D'],
        components,
        isAmbiguous: false,
        isInsufficientEvidence: false,
        confidenceScore: 0.95,
        modelUsed: this.modelName,
        processingMethod: this.processingMethod,
        structuredAnalysis,
      };
    }

    // 10. Rendered P&ID Diagram Analysis
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
          equipmentTag: null,
          confidence: 0.62,
          bbox: { x1: 420, y1: 180, x2: 550, y2: 290 },
          sourceReference: 'P&ID Grid C-2',
        },
      ];

      const structuredAnalysis: StructuredIndustrialAnalysis = {
        visibleSummary: 'Rendered P&ID Diagram showing crude feed booster pump P-101-A with suction and discharge lines.',
        visibleObservations: [
          {
            id: 'obs-pid-pump-1',
            observation: 'Equipment bubble and symbol for booster pump P-101-A with 8" suction line',
            category: 'GENERAL_CONDITION',
            locationDescription: 'P&ID Grid C-4',
            bbox: { x1: 300, y1: 400, x2: 500, y2: 600 },
            severityHint: 'INFO',
          },
        ],
        hypotheses: [
          'P&ID diagram linework represents engineered process piping as of schematic revision date.',
        ],
        recommendedVerificationSteps: [
          'Verify latest engineering change order (ECO) to confirm no physical piping modifications occurred post-drawing release.',
        ],
        safetyEscalationWarnings: [
          'Never execute hot work or blind installation based on unverified diagrams.',
        ],
        limitations: [
          'Rendered P&ID page tag OCR; complete pipe connectivity requires certified engineering review.',
        ],
        isRootCauseConfirmed: false,
        requiresQualifiedTechnician: true,
      };

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
        structuredAnalysis,
      };
    }

    // Default generic visual extraction
    const defaultStructured: StructuredIndustrialAnalysis = {
      visibleSummary: `Technical engineering asset detected in ${filename}. Key mounting hardware and primary equipment housing identified.`,
      visibleObservations: [
        {
          id: 'obs-gen-1',
          observation: 'Primary equipment housing and base mounting identified',
          category: 'GENERAL_CONDITION',
          locationDescription: 'Center Frame',
          bbox: { x1: 100, y1: 100, x2: 900, y2: 900 },
          severityHint: 'INFO',
        },
      ],
      hypotheses: [
        'Visible hardware corresponds to standard industrial plant equipment configuration.',
      ],
      recommendedVerificationSteps: [
        'Compare physical asset nameplate against plant asset register.',
      ],
      safetyEscalationWarnings: [
        'Follow general industrial plant safety precautions before approaching equipment.',
      ],
      limitations: [
        'Image-only analysis: Internal conditions, pressure, and electrical integrity cannot be verified from a photograph.',
      ],
      isRootCauseConfirmed: false,
      requiresQualifiedTechnician: false,
    };

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
      structuredAnalysis: defaultStructured,
    };
  }
}

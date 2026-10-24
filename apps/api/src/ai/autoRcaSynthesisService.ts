import type {
  AutoRcaTicketPayload,
  GenerateRcaRequest,
} from '@forgex/shared-types';

export class AutoRcaSynthesisService {
  /**
   * Synthesize multimodal chat session, acoustic FFT spectrum, visual gauge/part inspection,
   * and LOTO status into a structured enterprise Root Cause Analysis (RCA) payload.
   */
  public static synthesizeRca(request: GenerateRcaRequest): AutoRcaTicketPayload {
    const assetTag = (request.assetTag || request.assetId || 'PUMP-001').toUpperCase();
    const isPump = assetTag.includes('PUMP') || assetTag.includes('SV') || assetTag.includes('OH2') || assetTag.includes('001');

    // Extract telemetry
    const acoustic = request.acousticTelemetry;
    const vision = request.visionDiagnostic;
    const lotoVerified = Boolean(request.lotoVerified || vision?.safetyStatus === 'SAFE_ZERO_ENERGY');

    // Analyze detected symptoms
    const detectedSymptoms: string[] = [];

    // 1. Acoustic signature symptom
    if (acoustic) {
      if (acoustic.detectedPattern === 'CAVITATION_SUSPECTED') {
        detectedSymptoms.push(
          `Fluid cavitation harmonic spike at ${acoustic.dominantFrequencyHz} Hz (${acoustic.peakDecibels} dB, Crest Factor: ${acoustic.crestFactor || '4.2'})`
        );
      } else if (acoustic.detectedPattern === 'BEARING_WEAR_SUSPECTED') {
        detectedSymptoms.push(
          `High-frequency bearing raceway degradation harmonic at ${acoustic.dominantFrequencyHz} Hz (${acoustic.peakDecibels} dB)`
        );
      } else {
        detectedSymptoms.push(
          `Vibration telemetry anomaly recorded at ${acoustic.dominantFrequencyHz} Hz (${acoustic.peakDecibels} dB)`
        );
      }
    }

    // 2. Multimodal vision symptom
    if (vision) {
      if (vision.safetyStatus === 'CRITICAL_OVERPRESSURE' && vision.readingValue !== null) {
        detectedSymptoms.push(
          `Discharge pressure gauge PG-101 reading ${vision.readingValue} ${vision.readingUnit || 'bar'} (Exceeds OEM MAWP limit of 25.0 Bar)`
        );
      } else if (vision.safetyStatus === 'WEAR_DETECTED') {
        detectedSymptoms.push(
          'Silicon-carbide mechanical seal stationary ring severe scoring grooves & cavitation micro-pitting'
        );
      } else if (vision.readingValue !== null) {
        detectedSymptoms.push(
          `Visual dial gauge verified at ${vision.readingValue} ${vision.readingUnit || 'bar'}`
        );
      }
    }

    // 3. User inquiry / Chat message symptoms
    if (Array.isArray(request.messages) && request.messages.length > 0) {
      const userMsgs = request.messages.filter((m) => m.role === 'USER' || m.role === 'user');
      for (const m of userMsgs) {
        const text = m.content.trim();
        if (text.length > 10 && !detectedSymptoms.some((s) => s.toLowerCase().includes(text.toLowerCase().slice(0, 20)))) {
          if (detectedSymptoms.length < 4) {
            detectedSymptoms.push(`Reported Operator Observation: "${text.length > 80 ? text.slice(0, 77) + '...' : text}"`);
          }
        }
      }
    }

    if (detectedSymptoms.length === 0) {
      detectedSymptoms.push('Operating fluid turbulence, mechanical seal thermal scoring, and discharge line pressure deviation');
    }

    // Severity determination
    let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'HIGH';
    if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE' || (vision?.readingValue && vision.readingValue > 25)) {
      severity = 'CRITICAL';
    } else if (acoustic?.detectedPattern === 'CAVITATION_SUSPECTED' && acoustic.peakDecibels > 85) {
      severity = 'CRITICAL';
    } else if (acoustic?.detectedPattern === 'NOMINAL' && vision?.safetyStatus === 'SAFE_ZERO_ENERGY') {
      severity = 'MEDIUM';
    }

    // Asset Display Formatting
    const assetCode = isPump
      ? `${assetTag} (Lowara Xylem 10SV08F030T Multistage Series)`
      : `${assetTag} (Industrial Production Asset)`;

    // Synthesized Title
    let title = `${assetTag} Operational Remediation & Mechanical Overhaul`;
    if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE' && acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      title = `${assetTag} Impeller Cavitation & Discharge Overpressure Remediation`;
    } else if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE') {
      title = `${assetTag} High Discharge Pressure & Relief Line Verification`;
    } else if (acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      title = `${assetTag} Suction NPSH Cavitation & Mechanical Seal Overhaul`;
    } else if (vision?.safetyStatus === 'WEAR_DETECTED') {
      title = `${assetTag} Mechanical Seal Face Replacement & Flushing Verification`;
    }

    // Root Cause Analysis grounded in OEM specs
    let rootCauseAnalysis = '';
    if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE' && acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      rootCauseAnalysis =
        `Triangulated multimodal telemetry indicates that discharge throttling has forced pump operating point back toward shut-off head, raising internal casing pressure to ${vision.readingValue || 28.0} Bar (surpassing Lowara 25.0 Bar MAWP). Inadequate net positive suction head (NPSH) margin collapsed vapor pockets at the first-stage impeller eye, generating ${acoustic.dominantFrequencyHz || 148} Hz fluid turbulence and inducing severe friction scoring across the mechanical seal silicon-carbide mating faces.`;
    } else if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE') {
      rootCauseAnalysis =
        `Line discharge pressure gauge PG-101 reached ${vision.readingValue || 28.0} Bar, exceeding certified Lowara e-SV Maximum Allowable Working Pressure of 25.0 Bar (362.6 PSI). Discharge non-return valve or downstream isolation throttle is improperly restricted, creating hydrostatic backpressure spikes risking casing gasket blowout and motor thermal overload.`;
    } else if (acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      rootCauseAnalysis =
        `FFT spectral analysis registered a prominent acoustic energy peak at ${acoustic.dominantFrequencyHz || 148} Hz (${acoustic.peakDecibels || 88} dB, Crest Factor: ${acoustic.crestFactor || '4.2'}) characteristic of blade pass frequency cavitation. Suction line strainer blockage or elevated inlet fluid temperature reduced available NPSH below required NPSH (NPSHa < NPSHr), producing localized vapor bubble implosions against the 304 stainless steel impellers.`;
    } else if (vision?.safetyStatus === 'WEAR_DETECTED') {
      rootCauseAnalysis =
        `Visual inspection of the mechanical seal cartridge indicates boundary lubrication dry-running breakdown. Concentric grooving and thermal heat checking on the stationary SiC ring reflect intermittent barrier fluid starvation and particulate ingress between the mating faces.`;
    } else {
      rootCauseAnalysis =
        `Diagnostic multi-parameter evaluation on ${assetTag} shows mechanical operational deviation consistent with normal industrial duty degradation. Scheduled preventive seal overhaul, dynamic O-ring replacement, and alignment tolerance calibration recommended.`;
    }

    // Recommended Parts
    const recommendedParts: string[] = isPump
      ? [
          'Mechanical Seal Kit #SK-801 (Lowara e-SV SiC/Carbon/EPDM)',
          'Dynamic Viton Casing O-Ring #OR-504',
          'Suction Strainer Flange Gasket #GS-102 (PTFE)',
          'Calibrated Torque Wrench (M12 Casing Bolts: 60 Nm)',
          'Class 0 Electrical Isolation Gloves & Lockout Padlock #LK-402',
        ]
      : [
          'Standard Overhaul Gasket & Seal Kit #OK-102',
          'Industrial Loctite 243 Threadlocker',
          'Dial Indicator Alignment Gauge',
          'Safety Lockout Hasp & Danger Tag',
        ];

    // Estimated downtime & queue
    const estimatedDowntimeMinutes = severity === 'CRITICAL' ? 90 : severity === 'HIGH' ? 60 : 45;
    const assignedQueue: 'MECHANICAL_MAINTENANCE' | 'ELECTRICAL_INSTRUMENTATION' =
      acoustic?.detectedPattern === 'IMBALANCE_SUSPECTED'
        ? 'ELECTRICAL_INSTRUMENTATION'
        : 'MECHANICAL_MAINTENANCE';

    return {
      title,
      assetCode,
      severity,
      detectedSymptoms,
      rootCauseAnalysis,
      recommendedParts,
      lotoVerificationStatus: lotoVerified ? 'VERIFIED_ZERO_ENERGY' : 'PENDING_ISOLATION',
      estimatedDowntimeMinutes,
      assignedQueue,
      acousticTelemetry: acoustic,
      visionDiagnostic: vision,
      oemReference: 'Lowara e-SV Series Technical Manual (001080194EN-ESV)',
      synthesizedAt: new Date().toISOString(),
      sourceConversationId: request.conversationId,
    };
  }
}

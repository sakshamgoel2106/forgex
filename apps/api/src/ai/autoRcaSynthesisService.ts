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
    const rawTag = (request.assetTag || request.assetId || 'COMP-101-A').trim();
    const tagMatch = rawTag.match(/^([A-Za-z0-9_\-]+)/);
    const assetTag = (tagMatch ? tagMatch[1] : rawTag).toUpperCase();
    const isPump = assetTag.includes('PUMP') || assetTag.includes('SV') || assetTag.includes('OH2');
    const isCompressor = assetTag.includes('COMP') || assetTag.includes('AIR') || assetTag.includes('SCREW');

    // Extract telemetry
    const acoustic = request.acousticTelemetry;
    const vision = request.visionDiagnostic;
    const lotoVerified = Boolean(request.lotoVerified || vision?.safetyStatus === 'SAFE_ZERO_ENERGY');

    // Analyze detected symptoms strictly from active conversation thread
    const detectedSymptoms: string[] = [];

    if (acoustic && acoustic.dominantFrequencyHz) {
      if (acoustic.detectedPattern === 'CAVITATION_SUSPECTED') {
        detectedSymptoms.push(
          `Fluid cavitation harmonic spike at ${Math.round(acoustic.dominantFrequencyHz)} Hz (${acoustic.peakDecibels?.toFixed(1) || 0} dB)`
        );
      } else if (acoustic.detectedPattern === 'BEARING_WEAR_SUSPECTED') {
        detectedSymptoms.push(
          `Bearing raceway degradation harmonic at ${Math.round(acoustic.dominantFrequencyHz)} Hz (${acoustic.peakDecibels?.toFixed(1) || 0} dB)`
        );
      } else {
        detectedSymptoms.push(
          `Acoustic FFT spectral peak recorded at ${Math.round(acoustic.dominantFrequencyHz)} Hz (${acoustic.peakDecibels?.toFixed(1) || 0} dB)`
        );
      }
    }

    if (vision && vision.readingValue !== null && vision.readingValue !== undefined) {
      if (vision.safetyStatus === 'CRITICAL_OVERPRESSURE') {
        detectedSymptoms.push(
          `Discharge pressure gauge reading ${vision.readingValue} ${vision.readingUnit || 'bar'} (Exceeds safe limits)`
        );
      } else {
        detectedSymptoms.push(
          `Visual gauge inspection reading: ${vision.readingValue} ${vision.readingUnit || 'bar'}`
        );
      }
    }

    // User inquiry symptoms strictly from current thread
    if (Array.isArray(request.messages) && request.messages.length > 0) {
      const userMsgs = request.messages.filter((m) => m.role === 'USER' || m.role === 'user');
      for (const m of userMsgs) {
        const text = m.content.trim();
        if (text.length > 5 && !detectedSymptoms.some((s) => s.toLowerCase().includes(text.toLowerCase().slice(0, 20)))) {
          if (detectedSymptoms.length < 4) {
            detectedSymptoms.push(`Reported Issue: "${text.length > 80 ? text.slice(0, 77) + '...' : text}"`);
          }
        }
      }
    }

    if (detectedSymptoms.length === 0) {
      detectedSymptoms.push(`Operational anomaly reported on ${assetTag}`);
    }

    // Severity determination
    let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'HIGH';
    if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE' || (vision?.readingValue && vision.readingValue > 25)) {
      severity = 'CRITICAL';
    } else if (acoustic?.detectedPattern === 'CAVITATION_SUSPECTED' && (acoustic.peakDecibels || 0) > 85) {
      severity = 'CRITICAL';
    } else if (acoustic?.detectedPattern === 'NOMINAL' && vision?.safetyStatus === 'SAFE_ZERO_ENERGY') {
      severity = 'MEDIUM';
    }

    const assetCode = assetTag;
    const primarySymptom = detectedSymptoms[0] || '';

    // Synthesized Title
    let title = `${assetTag} Operational Remediation & Mechanical Overhaul`;
    if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE' && acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      title = `${assetTag} Impeller Cavitation & Discharge Overpressure Remediation`;
    } else if (/vibration/i.test(primarySymptom)) {
      title = `${assetTag}: High Vibration Investigation & Remediation`;
    } else if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE') {
      title = `${assetTag}: High Discharge Pressure & Relief Line Verification`;
    } else if (acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      title = `${assetTag}: Suction NPSH Cavitation & Impeller Overhaul`;
    } else if (/leak|seal/i.test(primarySymptom)) {
      title = `${assetTag}: Dynamic Seal Inspection & Leakage Remediation`;
    }

    // Root Cause Analysis grounded in equipment context
    let rootCauseAnalysis = '';
    if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE' && acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      rootCauseAnalysis =
        `Triangulated multimodal telemetry indicates that discharge throttling has forced operating point back toward shut-off head, raising internal casing pressure to ${vision.readingValue || 28.0} Bar (surpassing 25.0 Bar MAWP). Inadequate net positive suction head (NPSH) margin collapsed vapor pockets at the impeller eye, generating ${Math.round(acoustic.dominantFrequencyHz || 148)} Hz fluid turbulence and inducing severe friction scoring across the mechanical seal silicon-carbide mating faces.`;
    } else if (/vibration/i.test(primarySymptom)) {
      rootCauseAnalysis =
        `Triangulated operational evaluation and user report indicate elevated vibration on ${assetTag}. Primary suspected root causes include dynamic unbalance, shaft/coupling misalignment, foundation bolt loose torque, or early-stage bearing raceway fatigue. Immediate mechanical alignment verification and bearing vibration spectrum check recommended.`;
    } else if (vision?.safetyStatus === 'CRITICAL_OVERPRESSURE') {
      rootCauseAnalysis =
        `Discharge pressure reading exceeds certified operating thresholds. Downstream isolation valve restriction or pressure relief line malfunction suspected, creating hydrostatic backpressure spikes.`;
    } else if (acoustic?.detectedPattern === 'CAVITATION_SUSPECTED') {
      rootCauseAnalysis =
        `Spectral analysis registered prominent acoustic energy peak characteristic of blade pass frequency cavitation. Suction line restriction or elevated inlet fluid temperature reduced available NPSH below required limits.`;
    } else {
      rootCauseAnalysis =
        `Operational evaluation on ${assetTag} shows mechanical operational deviation consistent with normal industrial duty wear. Scheduled preventive inspection, fastener torque calibration, and lubrication check recommended.`;
    }

    // Recommended Parts
    const recommendedParts: string[] = isCompressor
      ? [
          'Air Filter Element & Intake Cartridge',
          'Vibration Isolator Damper Mounts (Set of 4)',
          'Flexible Coupling Element #CE-401',
          'Calibrated Torque Wrench (Foundation Bolts: 85 Nm)',
        ]
      : isPump
      ? [
          'Mechanical Seal Kit #SK-801',
          'Dynamic Viton Casing O-Ring #OR-504',
          'Suction Flange Gasket #GS-102',
          'Calibrated Torque Wrench (60 Nm)',
        ]
      : [
          'Overhaul Gasket & Seal Kit #OK-102',
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
      oemReference: isCompressor
        ? 'Atlas Copco GA-75 Screw Compressor Engineering Guide'
        : 'Lowara e-SV Series Technical Manual (001080194EN-ESV)',
      synthesizedAt: new Date().toISOString(),
      sourceConversationId: request.conversationId,
    };
  }
}

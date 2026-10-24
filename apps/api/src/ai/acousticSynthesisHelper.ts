import type { AcousticTelemetry } from '@forgex/shared-types';

/**
 * Synthesizes an authoritative, natural, evidence-grounded acoustic diagnostic report
 * from real-time FFT spectrum analyzer telemetry across multiple supported languages.
 */
export function synthesizeAcousticReport(
  telemetry: AcousticTelemetry,
  assetContext?: { assetTag: string; name: string; area: string } | null,
  targetLanguage: string = 'en-US'
): string {
  const assetTag = assetContext?.assetTag || 'PUMP-001';
  const assetName = assetContext?.name || 'Centrifugal Process Pump';
  const domHz = Math.round(telemetry.dominantFrequencyHz);
  const peakDb = telemetry.peakDecibels.toFixed(1);
  const lowPct = Math.round((telemetry.bandEnergy?.low || 0) * 100);
  const midPct = Math.round((telemetry.bandEnergy?.mid || 0) * 100);
  const highPct = Math.round((telemetry.bandEnergy?.high || 0) * 100);
  const crest = telemetry.crestFactor || (telemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED' ? 'HIGH' : 'MEDIUM');

  if (targetLanguage.startsWith('hi')) {
    // Hindi (हिंदी)
    if (telemetry.detectedPattern === 'CAVITATION_SUSPECTED') {
      return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
स्पेक्ट्रम विश्लेषक ने **${domHz} Hz** (${peakDb} dB) पर एक प्रमुख पीक की पहचान की है, जिसमें मध्य-आवृत्ति बैंड (500–2,500 Hz) में ऊर्जा का घनत्व **${midPct}%** है। यह ध्वनिक हस्ताक्षर इम्पेलर वेन पास फ्रीक्वेंसी के आसपास वाष्प गुहिकाओं (vapor cavities) के हिंसक पतन और द्रव अशांति (fluid turbulence) की स्पष्ट पुष्टि करता है।

**संभावित मूल कारण (Root Cause):**
1. **अपर्याप्त NPSH:** उपलब्ध नेट पॉजिटिव सक्शन हेड (NPSHa) आवश्यक मान (NPSHr) से नीचे चला गया है।
2. **सक्शन अवरोध:** इनलेट सक्शन स्ट्रेनर पर गंदगी जमा होना या सक्शन वाल्व का आंशिक रूप से बंद होना।
3. **उच्च तरल तापमान:** तरल पदार्थ के वाष्प दबाव (vapor pressure) में स्थानीय स्तर पर वृद्धि।

**अनुशंसित परिचालन सत्यापन:**
- सक्शन गेज पर दबाव की तुरंत जांच करें ताकि सक्शन हेड की पुष्टि हो सके।
- पंप आवरण (casing) के पास बजरी या खड़खड़ाहट (gravel-like pinging) जैसी ध्वनिक ध्वनि की जांच करें।
- इनलेट स्ट्रेनर के आर-पार विभेदक दबाव (differential pressure) की पुष्टि करें।

**अनिवार्य OSHA / LOTO सुरक्षा निर्देश:**
पंप केसिंग या सक्शन पाइपिंग खोलने से पहले, मुख्य मोटर फीडर को लॉकआउट/टैगआउट (LOTO) करें, आइसोलेशन वाल्व बंद करें, और सिस्टम को पूर्ण शून्य ऊर्जा स्थिति (Zero Energy State) में लाएं।`;
    }

    if (telemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED') {
      return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
उच्च-आवृत्ति बैंड (2,500–8,000 Hz) में **${highPct}%** का असामान्य ऊर्जा संकेन्द्रण पाया गया है, जिसमें **${domHz} Hz** (${peakDb} dB) पर तीक्ष्ण हार्मोनिक पीक और उच्च शिखा कारक (${crest} Crest Factor) देखा गया है। यह धातु-से-धातु घर्षण और बियरिंग रेसवे पर प्रारंभिक सतह क्षरण (spalling) का विशिष्ट संकेत है।

**संभावित मूल कारण (Root Cause):**
1. **स्नेहन अपघटन:** ग्रीस सूखना, अत्यधिक ग्रीसिंग के कारण मंथन (churning), या लुब्रिकेंट का संदूषण।
2. **रोलिंग एलीमेंट थकान:** बॉल या रोलर रेसवे पर सूक्ष्म-गड्ढे (micro-pitting)।
3. **अत्यधिक अक्षीय/रेडियल प्रीलोड:** गलत कपलिंग अलाइनमेंट या अनुचित माउंटिंग टॉर्क।

**अनुशंसित परिचालन सत्यापन:**
- कैलिब्रेटेड इन्फ्रारेड थर्मामीटर से बियरिंग हाउसिंग तापमान मापें (सुरक्षित सीमा < 75°C)।
- बियरिंग हाउसिंग से बाहर निकले ग्रीस में धातु के कणों या मलिनकिरण की जांच करें।
- समग्र कंपन वेग (RMS mm/s) की जांच करें।

**अनिवार्य OSHA / LOTO सुरक्षा निर्देश:**
बियरिंग कवर खोलने या ग्रीस निप्पल की सर्विसिंग से पहले उपकरण को पूरी तरह डी-एनर्जाइज और लॉकआउट करें।`;
    }

    if (telemetry.detectedPattern === 'IMBALANCE_SUSPECTED') {
      return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
निम्न-आवृत्ति बैंड (20–500 Hz) में ऊर्जा का प्रभुत्व **${lowPct}%** है, जो **${domHz} Hz** (${peakDb} dB) पर 1X/2X घूर्णी आवृत्ति के अनुरूप है। यह शाफ्ट के यांत्रिक असंतुलन या कपलिंग मिसअलाइनमेंट का संकेत देता है।

**संभावित मूल कारण (Root Cause):**
1. इम्पेलर या रोटर पर गंदगी का असमान जमाव।
2. लचीले कपलिंग इन्सर्ट का घिस जाना।
3. मोटर बेसप्लेट पर लूज फाउंडेशन बोल्ट (Soft Foot)।

**अनुशंसित परिचालन सत्यापन:**
- बेस बोल्ट के टॉर्क विनिर्देशों की जांच करें।
- लेजर अलाइनमेंट टूल से मोटर और पंप शाफ्ट संरेखण सत्यापित करें।`;
    }

    return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
स्पेक्ट्रम सामान्य परिचालन सीमा में संतुलित है। प्रमुख आवृत्ति **${domHz} Hz** (${peakDb} dB) है और किसी असामान्य हार्मोनिक स्पाइक का पता नहीं चला है (निम्न: ${lowPct}%, मध्य: ${midPct}%, उच्च: ${highPct}%)।

**स्थिति:**
उपकरण विनिर्माता के मानक परिचालन दिशानिर्देशों के अनुसार स्वस्थ स्थिति में चल रहा है। किसी तत्काल सुधारात्मक रखरखाव की आवश्यकता नहीं है। नियमित निगरानी जारी रखें।`;
  }

  if (targetLanguage.startsWith('mr')) {
    // Marathi (मराठी)
    if (telemetry.detectedPattern === 'CAVITATION_SUSPECTED') {
      return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
स्पेक्ट्रम अ‍ॅनालायझरने **${domHz} Hz** (${peakDb} dB) वर प्रमुख वारंवारता नोंदवली आहे, ज्यामध्ये मध्यम फ्रिक्वेन्सी बँडमध्ये (500–2,500 Hz) **${midPct}%** ऊर्जा केंद्रित आहे. हा ध्वनिक पॅटर्न इम्पेलर व्हेन पासिंग फ्रिक्वेन्सीजवळ पोकळी निर्माण (Cavitation) आणि द्रव अशांततेची (Fluid Turbulence) स्पष्ट पुष्टी करतो.

**संभाव्य मूळ कारणे (Root Cause):**
1. **अपुरा NPSH:** उपलब्ध नेट पॉझिटिव्ह सक्शन हेड आवश्यक मूल्यापेक्षा कमी झाला आहे.
2. **सक्शन अडथळा:** इनलेट सक्शन स्ट्रेनरमध्ये अडथळा किंवा सक्शन व्हॉल्व्ह अंशतः बंद असणे.
3. **उच्च द्रव तापमान:** प्रक्रियेतील द्रवाचा बाष्प दाब वाढल्यामुळे बुडबुडे फुटणे.

**शिफारस केलेली फील्ड पडताळणी:**
- सक्शन हेड तपासण्यासाठी सक्शन प्रेशर गेज त्वरित तपासा.
- पंप केसिंगजवळ खडे फुटल्यासारखा आवाज (Gravel-like acoustic noise) येतो का ते ऐका.
- इनलेट स्ट्रेनरमधील डिफरेंशियल प्रेशर तपासा.

**अनिवार्य OSHA / LOTO सुरक्षा निर्देश:**
पंप केसिंग तपासण्यापूर्वी, मुख्य मोटर फीडर लॉकआउट/टॅगआउट करा, आयसोलेशन व्हॉल्व्ह बंद करा आणि अवशिष्ट दाब पूर्णपणे शून्य (Zero Energy State) करा.`;
    }

    if (telemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED') {
      return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
उच्च फ्रिक्वेन्सी बँडमध्ये (2,500–8,000 Hz) **${highPct}%** ची असामान्य ऊर्जा नोंदवली गेली आहे, ज्यामध्ये **${domHz} Hz** (${peakDb} dB) वर तीक्ष्ण हार्मोनिक स्पाइक आढळला आहे. हे बेअरिंग रेसवेवरील धातूचे घर्षण आणि पृष्ठभागाचे नुकसान (Spalling) दर्शवते.

**संभाव्य मूळ कारणे (Root Cause):**
1. **स्नेहन बिघाड:** ग्रीस सुकणे किंवा अयोग्य वंगण.
2. **रोलिंग घटकांचा थकवा:** बॉल किंवा रोलर रेसवेवर सूक्ष्म खड्डे.
3. **अक्षीय किंवा रेडियल ओव्हरलोड:** चुकीचे कपलिंग अलाइनमेंट.

**शिफारस केलेली फील्ड पडताळणी:**
- बेअरिंग हाउसिंगचे तापमान मोजा (सुरक्षित मर्यादा < 75°C).
- ग्रीस डिस्चार्जमध्ये धातूच्या कणांची तपासणी करा.

**अनिवार्य OSHA / LOTO सुरक्षा निर्देश:**
बेअरिंग कव्हर उघडण्यापूर्वी उपकरण डी-एनर्जाइज आणि लॉकआउट करा.`;
    }

    return `### ध्वनिक स्पेक्ट्रम निदान: ${assetTag} (${assetName})

**ध्वनिक स्पेक्ट्रल विश्लेषण:**
स्पेक्ट्रम सामान्य परिचालन मर्यादेत संतुलित आहे. प्रमुख फ्रिक्वेन्सी **${domHz} Hz** (${peakDb} dB) असून कोणतेही असामान्य कंपन आढळलेले नाही (कमी: ${lowPct}%, मध्यम: ${midPct}%, उच्च: ${highPct}%).

**स्थिती:**
मशीन मानक कार्यक्षमतेनुसार सुरळीत सुरू आहे. तातडीच्या देखभालीची आवश्यकता नाही.`;
  }

  // English (Default technical industrial output)
  if (telemetry.detectedPattern === 'CAVITATION_SUSPECTED') {
    return `### Acoustic Diagnostics: ${assetTag} (${assetName})

**Acoustic Spectral Analysis:**
The real-time spectrum analyzer captured a dominant resonance peak at **${domHz} Hz** (${peakDb} dB), with **${midPct}%** of total acoustic energy concentrated in the mid-frequency band (500–2,500 Hz). This acoustic profile matches high-velocity vapor cavity collapse, blade-pass turbulence, and localized suction cavitation.

**Probable Root Causes:**
1. **Inadequate NPSH Margin:** Net Positive Suction Head available ($NPSH_a$) has fallen below manufacturer required limits ($NPSH_r$).
2. **Suction Line Restriction:** Fouling or partial obstruction across the inlet basket strainer, or a throttled suction isolation valve.
3. **Transient Pressure Drop:** Fluid temperature increase or reduced head pressure from the supply tank resulting in localized vaporization at the impeller eye.

**Immediate Field Verification Protocol:**
- Inspect the suction pressure gauge immediately to confirm positive head pressure.
- Verify that the suction isolation valve is 100% open and back-seated.
- Check differential pressure ($\Delta P$) across the suction strainer for clogging.
- Check for characteristic gravel-like pinging or popping acoustics along the lower volute casing.

**OSHA 1910.147 LOTO Safety Directive:**
Before opening inspection ports, casing plugs, or servicing suction strainers, de-energize the pump motor breaker, lock out the primary electrical disconnect, close suction and discharge isolation valves, and vent residual casing pressure to verify a **Zero Energy State**.`;
  }

  if (telemetry.detectedPattern === 'BEARING_WEAR_SUSPECTED') {
    return `### Acoustic Diagnostics: ${assetTag} (${assetName})

**Acoustic Spectral Analysis:**
Elevated high-frequency energy (**${highPct}%** in the 2,500–8,000 Hz band) was detected with a sharp resonance peak at **${domHz} Hz** (${peakDb} dB) and high crest factor impulses (${crest}). This ultrasonic/high-frequency signature indicates boundary lubrication failure, raceway micro-spalling, and metal-to-metal contact.

**Probable Root Causes:**
1. **Lubricant Breakdown:** Oil film depletion, grease churning, or particulate contamination in the bearing cavity.
2. **Rolling Element Fatigue:** Early-stage ball/roller raceway flaking or cage fatigue.
3. **Mechanical Preload / Misalignment:** Excessive dynamic axial loading transmitted across the shaft coupling.

**Immediate Field Verification Protocol:**
- Measure the bearing housing surface temperature using an infrared pyrometer (verify within normal limit: $< 75^\\circ\\text{C}$ / $167^\\circ\\text{F}$).
- Inspect purged grease for discoloration, oxidation odor, or metallic particle suspension.
- Measure overall vibration velocity (RMS mm/s) to check against ISO 10816-3 Class II limits ($< 4.5\\text{ mm/s}$).

**OSHA 1910.147 LOTO Safety Directive:**
Tag out electrical power and allow the unit to come to a complete mechanical stop before replenishing grease or removing bearing inspection covers.`;
  }

  if (telemetry.detectedPattern === 'IMBALANCE_SUSPECTED') {
    return `### Acoustic Diagnostics: ${assetTag} (${assetName})

**Acoustic Spectral Analysis:**
Low-frequency mechanical energy dominates the spectrum (**${lowPct}%** in the 20–500 Hz band), peaking at **${domHz} Hz** (${peakDb} dB), corresponding to $1\\times$ and $2\\times$ running speed harmonics. This indicates rotational unbalance or shaft coupling misalignment.

**Probable Root Causes:**
1. Particulate buildup or uneven scaling on the rotating impeller/rotor assembly.
2. Loose motor/pump foundation hold-down bolts (soft-foot condition).
3. Degradation of the flexible shaft coupling elastomeric insert.

**Immediate Field Verification Protocol:**
- Inspect foundation anchor bolts and check for loose baseplate shims.
- Inspect the flexible coupling insert for wear, rubber shavings, or angular gap discrepancy.
- Schedule a dynamic laser alignment and two-plane field balance verification.`;
  }

  // Nominal baseline
  return `### Acoustic Diagnostics: ${assetTag} (${assetName})

**Acoustic Spectral Analysis:**
The frequency spectrum demonstrates balanced, healthy baseline operation. Dominant frequency is at **${domHz} Hz** (${peakDb} dB) with uniform energy distribution (Low: ${lowPct}%, Mid: ${midPct}%, High: ${highPct}%) and no abnormal high-frequency harmonics or cavitation transients.

**Operational Status:**
Operating parameters are fully nominal and compliant with OEM baseline vibration thresholds. No corrective maintenance required. Maintain standard planned inspection schedule.`;
}

/**
 * ForgeX AI — Industrial Hindi Translation Engine
 * Provides authentic, natural Hindi/Hinglish translations for industrial diagnostics,
 * SOP verification steps, engineering tolerances, and speech synthesis readouts.
 */

export interface HindiStepTranslation {
  title: string;
  instruction: string;
  expected: string;
  combinedSpeech: string;
}

const STEP_NAME_MAPPINGS: Record<string, string> = {
  'loto & zero-energy state verification': 'LOTO एवं शून्य-ऊर्जा स्थिति सत्यापन',
  'zero energy state verification': 'शून्य-ऊर्जा स्थिति सत्यापन',
  'physical boundary & boundary sealing inspection': 'फिजिकल बाउंड्री और सील लीकेज निरीक्षण',
  'shaft free-spin & dynamic bearing play check': 'शाफ्ट फ्री-स्पिन और बेयरिंग प्ले जांच',
  'thermal housing & bearing temperature profiling': 'थर्मल हाउसिंग और बेयरिंग तापमान प्रोफाइलिंग',
  'inlet strainer & differential pressure verification': 'इनलेट स्ट्रेनर और डिफरेंशियल प्रेशर जांच',
  'vibration spectral analysis & harmonics check': 'वाइब्रेशन स्पेक्ट्रम विश्लेषण और हार्मोनिक्स जांच',
  'lubricant condition & oil level verification': 'ल्यूब्रिकेंट स्थिति और तेल स्तर की जांच',
  'motor starter & contactor electrical check': 'मोटर स्टार्टर और कॉन्टैक्टर इलेक्ट्रिकल जांच',
  'mechanical seal flush & quench flow check': 'मैकेनिकल सील फ्लश और फ्लो की जांच',
  'coupling alignment & angular runout check': 'कपलिंग अलाइनमेंट और एंगुलर रनआउट जांच',
};

const EXPECTED_READING_MAPPINGS: Record<string, string> = {
  '0.0 vac / 0.0 psig': '0.0 VAC / 0.0 PSIG (पूर्ण शून्य वोल्टेज और दबाव)',
  'zero visible dripping (< 3 drops/min allowable on packing)': 'कोई लीकेज नहीं दिखनी चाहिए (< 3 बूंद/मिनट अनुमत)',
  'smooth manual rotation, axial endplay < 0.003 in': 'हाथ से स्मूथ रोटेशन, एक्सियल प्ले 0.003 इंच से कम',
  '< 75°c (167°f) steady state (< 40°c rise over ambient)': 'तापमान 75°C से कम होना चाहिए (परिवेश से 40°C वृद्धि तक)',
  'differential pressure < 2.5 psid': 'डिफरेंशियल प्रेशर 2.5 PSID से कम होना चाहिए',
};

/**
 * Translates an investigation step into clear, natural Hindi/Hinglish
 */
export function translateStepToHindi(step: {
  stepNumber: number;
  name: string;
  instruction?: string;
  expectedReading?: string;
}): HindiStepTranslation {
  const normalizedName = (step.name || '').trim().toLowerCase();
  
  // 1. Translated Title
  let title = STEP_NAME_MAPPINGS[normalizedName];
  if (!title) {
    title = step.name
      .replace(/inspection/gi, 'निरीक्षण')
      .replace(/verification/gi, 'सत्यापन')
      .replace(/check/gi, 'जांच')
      .replace(/bearing/gi, 'बेयरिंग')
      .replace(/temperature/gi, 'तापमान')
      .replace(/pressure/gi, 'प्रेशर')
      .replace(/vibration/gi, 'वाइब्रेशन')
      .replace(/valve/gi, 'वॉल्व')
      .replace(/pump/gi, 'पंप')
      .replace(/motor/gi, 'मोटर')
      .replace(/seal/gi, 'सील');
  }

  // 2. Translated Expected Reading
  const normalizedExpected = (step.expectedReading || '').trim().toLowerCase();
  let expected = EXPECTED_READING_MAPPINGS[normalizedExpected];
  if (!expected) {
    expected = (step.expectedReading || 'सामान्य परिचालन सीमा (In-spec tolerance)')
      .replace(/zero visible dripping/gi, 'कोई लीकेज नहीं')
      .replace(/smooth manual rotation/gi, 'हाथ से स्मूथ रोटेशन')
      .replace(/steady state/gi, 'स्थिर स्थिति')
      .replace(/ambient/gi, 'परिवेश तापमान')
      .replace(/allowable/gi, 'अनुमेय सीमा')
      .replace(/differential pressure/gi, 'डिफरेंशियल प्रेशर')
      .replace(/normal range/gi, 'सामान्य सीमा');
  }

  // 3. Translated Instruction
  let instruction = (step.instruction || '').trim();
  if (normalizedName.includes('loto') || normalizedName.includes('zero-energy')) {
    instruction = `प्राइमरी लॉक-आउट स्विच ऑन करें और कैलिब्रेटेड CAT IV मल्टीमीटर से 0.0 VAC वोल्टेज तथा 0.0 PSIG प्रेशर सत्यापित करें। रेड डेंजर टैग लगाएं।`;
  } else if (normalizedName.includes('sealing') || normalizedName.includes('boundary')) {
    instruction = `मैकेनिकल ग्लैंड, केसिंग स्प्लिट और फ्लैंज गास्केट पर लीकेज या केमिकल अवशेषों की बारीकी से जांच करें। कोई ड्रॉपलेट नहीं होनी चाहिए।`;
  } else if (normalizedName.includes('shaft') || normalizedName.includes('free-spin') || normalizedName.includes('play')) {
    instruction = `ड्राइव कपलिंग डिस्कनेक्ट करें और शाफ्ट को 360 डिग्री हाथ से घुमाकर चेक करें कि कोई अड़चन या 0.003 इंच से अधिक एक्सियल प्ले तो नहीं है।`;
  } else if (normalizedName.includes('thermal') || normalizedName.includes('temperature')) {
    instruction = `इनबोर्ड और आउटबोर्ड बेयरिंग हाउसिंग पर इन्फ्रारेड पायरोमीटर से पीक तापमान रिकॉर्ड करें और जांचें कि यह 75°C से कम रहे।`;
  } else if (normalizedName.includes('strainer') || normalizedName.includes('differential pressure')) {
    instruction = `सक्शन और डिस्चार्ज प्रेशर गेज चेक करें और इनलेट फिल्टर स्ट्रेनर में ब्लॉकेज की जांच करें ताकि डिफरेंशियल प्रेशर 2.5 PSID से कम रहे।`;
  } else {
    // Dynamic replacement
    instruction = instruction
      .replace(/verify/gi, 'सत्यापित करें')
      .replace(/inspect/gi, 'निरीक्षण करें')
      .replace(/check/gi, 'जांच करें')
      .replace(/measure/gi, 'मापें')
      .replace(/record/gi, 'रिकॉर्ड करें')
      .replace(/disconnect/gi, 'डिस्कनेक्ट करें')
      .replace(/ensure/gi, 'सुनिश्चित करें')
      .replace(/bearing/gi, 'बेयरिंग')
      .replace(/temperature/gi, 'तापमान')
      .replace(/pressure/gi, 'दबाव/प्रेशर')
      .replace(/vibration/gi, 'वाइब्रेशन')
      .replace(/multimeter/gi, 'मल्टीमीटर')
      .replace(/shaft/gi, 'शाफ्ट')
      .replace(/coupling/gi, 'कपलिंग')
      .replace(/motor starter/gi, 'मोटर स्टार्टर');
  }

  const combinedSpeech = `स्टेप ${step.stepNumber}: ${title}। निर्देश: ${instruction}। अपेक्षित रीडिंग: ${expected}।`;

  return {
    title,
    instruction,
    expected,
    combinedSpeech,
  };
}

export const HINDI_VOICE_PROMPTS = {
  voiceActivated: 'हैंड्स-फ्री वॉइस कंट्रोल सक्रिय है। आप पास, फेल, अगला, या एस्केलेट बोल सकते हैं।',
  voiceDeactivated: 'वॉइस कंट्रोल बंद कर दिया गया है।',
  stepPassed: (num: number, nextNum?: number, nextName?: string) =>
    nextNum
      ? `स्टेप ${num} पास हो गया है। अगला स्टेप ${nextNum}: ${nextName || ''} शुरू करें।`
      : `स्टेप ${num} पास हो गया है। सभी डायग्नोस्टिक स्टेप्स सफलतापूर्वक सत्यापित हुए।`,
  stepFailedHalted: (num: number) =>
    `अलर्ट: स्टेप ${num} में विसंगति की पुष्टि हुई है। आगे के इन-हाउस चेक रोक दिए गए हैं। कृपया फील्ड तकनीशियन को एस्केलेट करें।`,
  ticketEscalated: (ticketId: string) =>
    `टिकट ${ticketId} फील्ड तकनीशियन को सफलतापूर्वक एस्केलेट कर दिया गया है।`,
  readingStep: (num: number, title: string, instruction: string, expected: string) =>
    `स्टेप ${num}: ${title}। निर्देश: ${instruction}। अपेक्षित स्थिति: ${expected}।`,
};

/**
 * Strips redundant .GLB / .gltf extensions, dangling parentheticals, and repetitive tags from machine names
 * E.g. "COOLING TOWER (COOLING-TOWER.GLB)" -> "COOLING TOWER"
 * E.g. "COOLING TOWER (COOLING-TOWER.G" -> "COOLING TOWER"
 * E.g. "PUMP-01.GLB" -> "PUMP-01"
 */
export function formatCleanMachineName(rawName?: string | null): string {
  if (!rawName) return 'PLANT_WIDE';
  let name = String(rawName).trim();
  if (!name || name === 'PLANT_WIDE' || name === 'PLANT-WIDE') return 'PLANT_WIDE';

  // Strip file extensions (.glb, .gltf, .obj, .fbx, .stl, or partial .g/.gl)
  name = name.replace(/\.(glb|gltf|obj|fbx|stl|g)\b/gi, '');
  name = name.replace(/\.(glb|gltf|obj|fbx|stl|g)\)/gi, ')');

  // Strip dangling open parenthesis cut off at the end
  name = name.replace(/\s*\([^)]{0,35}$/, '');

  // If pattern is "Name (Tag)" where Name and Tag are virtually identical, keep only Name
  const match = name.match(/^([^()]+)\s*\(([^()]+)\)?$/);
  if (match) {
    const left = match[1].trim();
    const right = match[2].trim().replace(/\.(glb|gltf|obj|fbx|stl|g)$/i, '');
    const normLeft = left.replace(/[-_\s.]+/g, '').toUpperCase();
    const normRight = right.replace(/[-_\s.]+/g, '').toUpperCase();
    if (normLeft === normRight || normLeft.includes(normRight) || normRight.includes(normLeft)) {
      name = left;
    } else {
      name = `${left} (${right})`;
    }
  }

  // Strip any remaining .glb or extensions
  name = name.replace(/\.(glb|gltf|obj|fbx|stl)\b/gi, '').trim();
  return name || 'PLANT_WIDE';
}

/**
 * Strips duplicate machine names, prefixes like "RCA Fix: [COOLING TOWER]", and trailing machine references
 * E.g. "RCA Fix: [COOLING TOWER (COOLING-TOWER.GLB)] Dynamic Hydraulic Cavitation & Impeller Vane Unbalance"
 *      -> "Dynamic Hydraulic Cavitation & Impeller Vane Unbalance"
 */
export function formatCleanNoteTitle(title?: string | null, machineName?: string | null): string {
  if (!title) return 'Expert Field Guidance';
  let clean = String(title).trim();

  // Strip prefixes like "RCA Fix: ", "Expert Note: ", "Field Fix: "
  clean = clean.replace(/^(?:RCA\s*Fix|Expert\s*Note|Field\s*Fix|Troubleshooting\s*Fix)\s*:\s*/i, '');

  // Strip leading brackets like "[COOLING TOWER (COOLING-TOWER.GLB)]" or "[COOLING TOWER]:"
  clean = clean.replace(/^\[[^\]]+\]\s*:?\s*/i, '');

  // If machine name is known, strip prefix "COOLING TOWER: " or trailing " on COOLING TOWER"
  const cleanMach = machineName ? formatCleanMachineName(machineName) : '';
  const rawMach = machineName ? String(machineName).trim() : '';

  const candidates = [cleanMach, rawMach].filter((m) => m && m !== 'PLANT_WIDE');
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Prefix check
    clean = clean.replace(new RegExp(`^${escaped}\\s*[:\\-–—]\\s*`, 'i'), '');
    // Trailing check
    clean = clean.replace(new RegExp(`\\s*(?:on|for|at|in|[-–—])\\s+${escaped}\\s*$`, 'i'), '');
  }

  // Clean any remaining .GLB or parenthetical asset tags in title
  clean = clean.replace(/\.(glb|gltf)\b/gi, '');
  clean = clean.replace(/\s*\([^)]{0,35}\.glb\)/gi, '');
  clean = clean.replace(/^\s*[:\-–—]\s*/, '').trim();

  return clean || title || 'Expert Field Guidance';
}

/**
 * Generates natural Hindi/Hinglish speech script for an Expert Knowledge Note
 */
export function translateExpertNoteToHindi(params: {
  machineName: string;
  title: string;
  trigger?: string;
  taskDuringIssue?: string;
  guidance: string;
  aiInsight?: string;
}): string {
  const machine = params.machineName && params.machineName !== 'PLANT_WIDE' ? params.machineName : 'उपकरण';
  const title = params.title;
  const trigger = params.trigger || params.taskDuringIssue || 'परिचालन निरीक्षण के दौरान विसंगति';
  const guidance = params.guidance || 'दिशानिर्देश के अनुसार सुधारात्मक फील्ड कार्य करें।';

  let script = `यह एक्सपर्ट नोट ${machine} मशीन के लिए है। विषय: ${title}। कब उपयोग करें: जब ${trigger} दिखे। सुझाया गया समाधान: ${guidance}।`;

  if (params.aiInsight) {
    const cleanAi = params.aiInsight.replace(/[•\n]+/g, '. ').trim();
    script += ` AI सुरक्षा निर्देश: ${cleanAi}।`;
  }

  return script;
}



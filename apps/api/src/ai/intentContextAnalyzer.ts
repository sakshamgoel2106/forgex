import { config } from '../config/env.js';
import type { CopilotResponseCategory } from '@forgex/shared-types';

export interface IntentAnalysisResult {
  category: CopilotResponseCategory;
  isIndustrial: boolean;
  contextAwareResponse?: string;
  safetyAlert?: string;
  mentionedGear?: string;
  detectedEquipmentOrPart?: string;
  source: 'llm' | 'rule_fallback';
}

/**
 * Normalizes query string for uniform NLP matching across English and Hinglish.
 */
function normalizeQuery(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\n\t]+/g, ' ');
}

/**
 * Filter non-machine messages (e.g. personal logistics, injuries, chit-chat)
 * so they are not treated as machine symptoms.
 */
export function isMachineSymptom(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  const nonMachinePattern = /\b(bleed|blood|hurt|injur|pain|hospital|doctor|dizzy|unconscious|not well|sick|helmet|shoe|boot|goggle|goggles|glove|gloves|earplug|ppe|wear|home|forgot|left my|cricket|weather|football|movie|joke|song|hi|hello|hey|thanks|thank you)\b/i;
  if (nonMachinePattern.test(t)) return false;

  const technicalPattern = /\b(vibration|noise|leak|pressure|temperature|temp|bearing|shaft|seal|motor|pump|crusher|compressor|conveyor|valve|coupling|stator|rotor|rpm|torque|overheat|hot|smoke|jam|clog|stalled|trip|tripped|fault|error|alarm|loto|css|clearance|misalign|cavitation|flow|psi|bar)\b/i;
  return technicalPattern.test(t) || /[A-Z0-9]+-[0-9]+/.test(text);
}

/**
 * Extracts specific PPE item name for tailored compliance notices.
 */
function extractPpeGearName(q: string): string {
  if (/\b(helmet|hard\s*hat)\b/i.test(q)) return 'Safety Helmet (Hard Hat)';
  if (/\b(shoe|shoes|boot|boots|footwear)\b/i.test(q)) return 'Certified Steel-Toe Safety Boots';
  if (/\b(goggle|goggles|glass|glasses|eye\s*protection|chashma)\b/i.test(q)) return 'Certified Eye Protection Goggles';
  if (/\b(glove|gloves|dastane)\b/i.test(q)) return 'Abrasion & Chemical Protective Gloves';
  if (/\b(earplug|earplugs|ear\s*muff|ear\s*muffs|ear\s*protection)\b/i.test(q)) return 'Hearing Protection (Earplugs / Muffs)';
  if (/\b(respirator|mask|dust\s*mask)\b/i.test(q)) return 'Particulate / Chemical Respirator';
  if (/\b(vest|jacket|hi-vis|high-vis)\b/i.test(q)) return 'High-Visibility Safety Vest';
  return 'Certified PPE Equipment';
}

/**
 * Robust local semantic rule-based analyzer for offline, fast, and fail-safe classification.
 */
export function analyzeIntentLocally(query: string, assetTag?: string): IntentAnalysisResult {
  const q = normalizeQuery(query);

  // 1. MEDICAL_OR_INJURY Category (English, Hindi, Hinglish)
  const isMedicalOrInjury =
    /\b(bleed|bleeding|blood|hurt|injur(y|ies|ed)?|wound|cut\s*my|wound(ed)?|pain|headache|chest\s*pain|dizzy|dizziness|faint(ed)?|unconscious|passed\s*out|vomit|not\s*well|sick|ill|burn(ed|t)?|chemical\s*burn|acid\s*burn|acid\s*spill|electric\s*shock|electrocution|electrocuted|shocked\s*by|current\s*lag|amputation|crushed|trapped|bone\s*fracture|broken\s*arm|broken\s*leg|hospital|first\s*aid|ambulance|worker\s*down)\b/i.test(
      q
    ) ||
    /\b(khoon|chot\s*lag|kat\s*gaya|chakkar|tabiyat\s*kharab|behos|jalan\s*ho|dard\s*ho|ambulance|hospital)\b/i.test(
      q
    );

  if (isMedicalOrInjury) {
    const response = `🚨 IMMEDIATE MEDICAL PROTOCOL & EMERGENCY STOP: Your health and physical safety take precedence over all plant operations.

1. **STOP WORK IMMEDIATELY**: If you are operating or near any machinery, hit the nearest physical EMERGENCY STOP (E-STOP) push-button immediately.
2. **PROCEED TO MEDICAL BAY**: Report to the Plant First-Aid Station / Medical Bay without delay for immediate treatment.
3. **NOTIFY SUPERVISION**: Inform your Shift Supervisor or Plant EHS Officer right now so medical assistance can be mobilized.

*Note: ForgeX AI Copilot is an automated technical diagnostics assistant and cannot dispatch emergency responders.*`;

    return {
      category: 'MEDICAL_OR_INJURY',
      isIndustrial: false,
      contextAwareResponse: response,
      safetyAlert: '🚨 CRITICAL MEDICAL / INJURY ALERT: Cease work and proceed to Plant First-Aid Station immediately.',
      source: 'rule_fallback',
    };
  }

  // 2. PPE_OR_SAFETY_COMPLIANCE Category
  const isPpeIssue =
    /\b(helmet|hard\s*hat|boots|shoes|glasses|goggles|gloves|earplugs|ear\s*muffs|ear\s*protection|ppe|vest|jacket|mask|respirator)\b.*?\b(broke|broken|damaged|cracked|lost|missing|torn|nahi)\b/i.test(
      q
    ) ||
    /\b(broke|broken|damaged|cracked|lost|missing|torn)\b.*?\b(helmet|hard\s*hat|boots|shoes|glasses|goggles|gloves|earplugs|ear\s*muffs|ear\s*protection|ppe|vest|jacket|mask|respirator)\b/i.test(
      q
    ) ||
    /\b(left\s+my|forgot\s+my|lost\s+my|(?:do\s+not|don'?t)\s+have(?:\s+my)?|without(?:\s+a|\s+my)?|at\s+home|missing|no|broken|damaged)\s+(?:safety\s+)?(helmet|hard\s*hat|boots|shoes|glasses|goggles|gloves|earplugs|ear\s*muffs|ear\s*protection|ppe|vest|jacket|mask|respirator)\b/i.test(
      q
    ) ||
    /\b(missing\s+ppe|no\s+ppe|without\s+ppe|forgot\s+helmet|left\s+helmet|forgot\s+boots|forgot\s+goggles|no\s+helmet|no\s+boots|no\s+shoes|wearing\s+sneakers|no\s+gloves)\b/i.test(
      q
    ) ||
    /\b(helmet\s*ghar|shoes\s*bhul|ppe\s*nahi|chashma\s*nahi|gloves\s*nahi|helmet\s*toot|shoes\s*phat)\b/i.test(q);

  const isHrOrLogistics =
    /\b(salary|payroll|paycheck|leave\s*application|sick\s*leave|vacation|attendance|punch\s*in|punch\s*out|punch\s*card|hr\s*department|hr\s*policy|lunch\s*break|shift\s*swap|shift\s*timing|bonus|appraisal)\b/i.test(
      q
    );

  if (isPpeIssue || isHrOrLogistics) {
    const gearName = extractPpeGearName(q);
    const response = `🛑 Mandatory Plant EHS & PPE Compliance Notice:

Per ForgeX Plant EHS Standard Operating Procedures, **DO NOT enter the operational shop floor or operate any machinery without certified ${gearName}**.

- **Immediate Action**: Report directly to the **Plant Tool Crib / Safety Store** or notify your **Shift Supervisor** to issue temporary or replacement certified ${gearName} before entering production areas.
- **Operational Restriction**: Working without certified protective gear is a direct violation of OSHA / Plant Safety Regulations and presents severe risk of injury.`;

    return {
      category: 'PPE_OR_SAFETY_COMPLIANCE',
      isIndustrial: false,
      contextAwareResponse: response,
      safetyAlert: `🛑 MANDATORY PPE NOTICE: Certified ${gearName} required prior to shop floor entry. Visit Tool Crib immediately.`,
      mentionedGear: gearName,
      source: 'rule_fallback',
    };
  }

  // 3. IRRELEVANT_CHIT_CHAT Category
  const isCasualOrNonIndustrial =
    /\b(weather|temperature\s+outside|forecast|rain\s+today|raining|cricket|football|soccer|nba|ipl|super\s*bowl|fifa|tennis|basketball|match\s*score|virat\s*kohli|rohit\s*sharma|dhoni|movie|film|actor|actress|cinema|recipe|cook|baking|restaurant|pizza|burger|joke|funny|poem|poetry|song|lyrics|dating|girlfriend|boyfriend|love\s+you|marry\s+me|politics|president|prime\s*minister|election|vote|crypto|bitcoin|ethereum|video\s*game|gaming|playstation|xbox|fortnite|minecraft|iphone|ipad|android\s+phone|smartwatch|tesla|bmw|audi|mercedes|toyota|honda|ferrari|personal\s+errand|instagram|facebook|twitter|tiktok|download\s*reels|react\s*tutorial|css\s*grid|learn\s*javascript)\b/i.test(
      q
    ) ||
    /^(who\s+is|who\s+was|tell\s+me\s+a\s+joke|tell\s+me\s+a\s+story|write\s+a\s+poem|how\s+to\s+cook|recipe\s+for|what\s+is\s+the\s+capital|how\s+is\s+the\s+weather|what\s+is\s+the\s+weather|how\s+are\s+you|who\s+made\s+you|hello\s+how\s+are\s+you)\b/i.test(
      q
    ) ||
    /\b(mausam|khel|filim|gana|kahani|joke\s*suno|kya\s*haal\s*hai)\b/i.test(q);

  // Check if query contains any industrial or engineering signal
  const hasIndustrialTokens =
    /\b(pump|crusher|compressor|conveyor|cooling\s*tower|motor|bearing|vibration|cavitation|torque|pressure|loto|lockout|valve|seal|impeller|sensor|transducer|plc|scada|pid|sop|mawp|rpm|npsh|kw|bar|psi|hz|flow|hydraulic|pneumatic|overhaul|lubricat|grease|alignment|coupling|stator|rotor|gearbox|toggle|feeder|chute|boiler|turbine|generator|transformer|breaker|mcc|switchgear|bernoulli|reynolds|viscosity|head\s*loss|thermodynamics|pitman|css|flywheel|stuffing\s*box|packing)\b/i.test(
      q
    ) ||
    /\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]{2,}-[0-9]{2,})\b/.test(query) ||
    Boolean(assetTag);

  if (isCasualOrNonIndustrial && !hasIndustrialTokens) {
    const response = `⚠️ Out of Operational Scope: I am the ForgeX Industrial AI Copilot, dedicated exclusively to plant machinery diagnostics, OEM documentation lookup, LOTO safety protocols, and maintenance workflows. I do not answer general knowledge, sports, entertainment, or personal queries. Please ask a question related to your plant assets, manuals, or maintenance operations.`;

    return {
      category: 'IRRELEVANT_CHIT_CHAT',
      isIndustrial: false,
      contextAwareResponse: response,
      source: 'rule_fallback',
    };
  }

  // Default: Industrial query. Whether UPLOADED or UNUPLOADED depends on retrieved documents.
  return {
    category: 'UPLOADED_MACHINE_QUERY',
    isIndustrial: true,
    source: 'rule_fallback',
  };
}

/**
 * Dynamic Intent & Context Analyzer.
 * Calls Gemini if available to intelligently analyze intent and context.
 * Falls back immediately and reliably to local semantic rules if LLM is offline or times out.
 */
export async function analyzeIntentAndContext(
  query: string,
  assetTag?: string
): Promise<IntentAnalysisResult> {
  const localResult = analyzeIntentLocally(query, assetTag);

  // If local rule flagged immediate medical emergency, return instantly without waiting for network
  if (localResult.category === 'MEDICAL_OR_INJURY') {
    return localResult;
  }

  // Attempt dynamic LLM analysis if API key is present
  const apiKey = config.CLOUD_AI_API_KEY || (process.env.GEMINI_API_KEY as string);
  if (!apiKey || apiKey === 'local-cloud-mock-key') {
    return localResult;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const systemPrompt = `You are the ForgeX Industrial Intent Classifier for an industrial manufacturing plant.
Classify the user's inquiry into exactly ONE of the following 5 categories:
1. MEDICAL_OR_INJURY: User mentions physical injury, bleeding, electric shock, chemical burn, feeling unwell, dizziness, fainting, or medical emergency.
2. PPE_OR_SAFETY_COMPLIANCE: User mentions forgetting, missing, or damaging safety gear (helmet, boots, gloves, goggles, vest, etc.) or shift/HR logistics.
3. UPLOADED_MACHINE_QUERY: Inquires about industrial machinery, plant equipment (pumps, crushers, compressors, cooling towers, conveyors), technical parameters, faults, or maintenance.
4. UNUPLOADED_MACHINE_QUERY: User asks about an industrial machine or engineering component that is not part of this plant's repository.
5. IRRELEVANT_CHIT_CHAT: General trivia, cricket/sports, entertainment, movies, cooking, jokes, or non-industrial conversation.

Output strictly valid JSON with this shape:
{
  "category": "MEDICAL_OR_INJURY" | "PPE_OR_SAFETY_COMPLIANCE" | "UPLOADED_MACHINE_QUERY" | "UNUPLOADED_MACHINE_QUERY" | "IRRELEVANT_CHIT_CHAT",
  "contextAwareResponse": "A natural, helpful response if category is MEDICAL_OR_INJURY, PPE_OR_SAFETY_COMPLIANCE, or IRRELEVANT_CHIT_CHAT; otherwise empty string",
  "mentionedGear": "Extracted gear name if PPE, otherwise empty string"
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nUser Query: "${query}"\nActive Asset Tag: "${assetTag || 'None'}"` }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as any;
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        if (parsed.category) {
          const category = parsed.category as CopilotResponseCategory;
          if (category === 'MEDICAL_OR_INJURY') {
            return {
              category: 'MEDICAL_OR_INJURY',
              isIndustrial: false,
              contextAwareResponse: parsed.contextAwareResponse || localResult.contextAwareResponse,
              safetyAlert: '🚨 CRITICAL MEDICAL / INJURY ALERT: Cease work and proceed to Plant First-Aid Station immediately.',
              source: 'llm',
            };
          }
          if (category === 'PPE_OR_SAFETY_COMPLIANCE') {
            return {
              category: 'PPE_OR_SAFETY_COMPLIANCE',
              isIndustrial: false,
              contextAwareResponse: parsed.contextAwareResponse || localResult.contextAwareResponse,
              safetyAlert: `🛑 MANDATORY PPE NOTICE: Certified protective gear required. Visit Tool Crib immediately.`,
              mentionedGear: parsed.mentionedGear || localResult.mentionedGear,
              source: 'llm',
            };
          }
          if (category === 'IRRELEVANT_CHIT_CHAT') {
            return {
              category: 'IRRELEVANT_CHIT_CHAT',
              isIndustrial: false,
              contextAwareResponse: parsed.contextAwareResponse || localResult.contextAwareResponse,
              source: 'llm',
            };
          }
          return {
            category,
            isIndustrial: true,
            source: 'llm',
          };
        }
      }
    }
  } catch {
    // Graceful fallback to rule-based engine
  }

  return localResult;
}

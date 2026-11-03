/**
 * Strict Industrial Domain Guardrails & Out-of-Scope Refusal Logic
 *
 * Configures the AI Copilot strictly as a Closed-Domain Industrial Maintenance & Engineering Assistant.
 * Enforces mandatory Emergency Stop protocols for physical accidents/injuries,
 * strict safety & PPE compliance notices for missing gear / personal HR logistics,
 * and immediate out-of-scope refusals for casual/trivia/sports/entertainment queries.
 */

import type { CopilotResponseCategory } from '@forgex/shared-types';

export const COPILOT_EMERGENCY_RESPONSE = `🚨 CRITICAL PLANT EMERGENCY DETECTED: I am an automated technical diagnostic assistant and CANNOT dispatch emergency or medical personnel.
1. PRESS THE NEAREST EMERGENCY STOP (E-STOP) IMMEDIATELY.
2. Contact Plant EHS / Medical Emergency Response & your Shift Supervisor immediately.
3. Do not touch energized equipment until Lockout/Tagout (LOTO) is verified.`;

export const COPILOT_PPE_COMPLIANCE_RESPONSE = `🛑 Scope & PPE Compliance Notice: I do not handle personal logistics or HR matters. However, per mandatory Plant EHS Policy, DO NOT enter the operational shop floor or operate machinery without certified PPE (Safety Helmet, Boots, Eye Protection). Please report to your Shift Supervisor or Plant Tool Crib immediately to obtain replacement gear.`;

export const COPILOT_OUT_OF_SCOPE_RESPONSE = `⚠️ Out of Operational Scope: I am the ForgeX Industrial AI Copilot, built strictly for plant machinery diagnostics, OEM manual cross-checks, and maintenance workflows. I am not designed to handle personal or non-industrial queries.`;

export type OperationalGuardrailDecision =
  | { type: 'NONE'; category?: CopilotResponseCategory }
  | {
      type: 'EMERGENCY';
      category: 'MEDICAL_OR_INJURY';
      response: string;
      safetyAlert: string;
    }
  | {
      type: 'PPE_OR_HR';
      category: 'PPE_OR_SAFETY_COMPLIANCE';
      response: string;
      safetyAlert: string;
    }
  | {
      type: 'OUT_OF_SCOPE';
      category: 'IRRELEVANT_CHIT_CHAT';
      response: string;
    };

export function evaluateOperationalGuardrails(
  query: string,
  assetTag?: string
): OperationalGuardrailDecision {
  if (!query || typeof query !== 'string') return { type: 'NONE' };
  const q = query
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

  // 1. Mandatory Emergency Stop Protocol for Accidents / Injuries / Incidents / Life-Safety / Medical
  const isEmergency =
    /\b(accident|injured|injur(y|ies|ed)?|hurt|bleeding|blood|electric\s*shock|electrocution|electrocuted|shocked\s*by|fire|explosion|explod(ed|ing)?|caught\s*fire|smoke|chemical\s*spill|acid\s*spill|acid\s*burn|chemical\s*splash|toxic\s*leak|toxic\s*spill|gas\s*leak|passed\s*out|unconscious|faint(ed)?|worker\s*down|amputation|crushed|trapped|choking|e-stop|emergency\s*stop|not\s*well|sick|dizzy|dizziness|vomit|headache|chest\s*pain|heart\s*attack|wound|cut\s*my)\b/i.test(
      q
    ) ||
    /\b(chot\s*lag|khoon|aag\s*lag|current\s*lag|behos|ambulance|hospital|chakkar|tabiyat\s*kharab|dard\s*ho)\b/i.test(q);

  if (isEmergency) {
    return {
      type: 'EMERGENCY',
      category: 'MEDICAL_OR_INJURY',
      response: COPILOT_EMERGENCY_RESPONSE,
      safetyAlert:
        '🚨 CRITICAL EMERGENCY DETECTED: Press nearest E-STOP immediately. Contact Plant EHS and Shift Supervisor.',
    };
  }

  // 2. Smart Handling for Personal PPE / HR / Logistics Queries - TOP PRIORITY over routine checks
  const ppeNouns = '(?:helmet|hard\\s*hat|boots?|shoes?|footwear|glasses|goggles|face\\s*shield|gloves?|insulated\\s*gloves?|earplugs?|ear\\s*muffs?|ear\\s*protection|ppe|vest|jacket|mask|respirator|dastane|chashma)';
  const ppeIssueVerbs = '(?:broke|broken|damaged?|cracked?|scratched?|scratch|torn|tear|lost|missing|left\\s+at\\s+home|left\\s+my|forgot(?:ten)?|forget|bhul|toot|phat|kharab|expired)';

  const isPpeIssue =
    new RegExp(`\\b${ppeNouns}\\b.*?\\b${ppeIssueVerbs}\\b`, 'i').test(q) ||
    new RegExp(`\\b${ppeIssueVerbs}\\b.*?\\b${ppeNouns}\\b`, 'i').test(q) ||
    new RegExp(`\\b(?:left\\s+my|forgot(?:ten)?(?:\\s+my)?|lost\\s+my|(?:do\\s+not|don'?t)\\s+have(?:\\s+my)?|without(?:\\s+a|\\s+my|\\s+proper|\\s+certified)?|at\\s+home|missing|no|broken|damaged|scratched?)\\s+(?:safety\\s+|insulated\\s+|certified\\s+)?${ppeNouns}\\b`, 'i').test(q) ||
    new RegExp(`\\b(?:routine\\s+check|inspect|work|operate|maintenance|panel).*?\\bwithout\\b.*?${ppeNouns}\\b`, 'i').test(q) ||
    new RegExp(`\\bwithout\\b.*?${ppeNouns}\\b.*?(?:routine\\s+check|inspect|work|operate|panel|machine)`, 'i').test(q) ||
    /\b(scratched?\s*(?:safety\s+)?goggles?|scratched?\s*glasses|damaged?\s*(?:safety\s+)?goggles?|scratched?\s*face\s*shield)\b/i.test(q) ||
    /\b(missing\s+ppe|no\s+ppe|without\s+ppe|forgot\s+helmet|left\s+helmet|forgot\s+boots|forgot\s+goggles|no\s+helmet|no\s+boots|no\s+shoes|wearing\s+sneakers|no\s+gloves|without\s+insulated\s+gloves|routine\s+check\s+without)\b/i.test(q) ||
    /\b(helmet\s*ghar|shoes\s*bhul|ppe\s*nahi|chashma\s*nahi|gloves\s*nahi|helmet\s*toot|shoes\s*phat)\b/i.test(q);

  const isHrOrLogistics =
    /\b(salary|payroll|paycheck|leave\s*application|sick\s*leave|vacation|attendance|punch\s*in|punch\s*out|punch\s*card|hr\s*department|hr\s*policy|lunch\s*break|shift\s*swap|shift\s*timing|bonus|appraisal)\b/i.test(
      q
    );

  if (isPpeIssue || isHrOrLogistics) {
    return {
      type: 'PPE_OR_HR',
      category: 'PPE_OR_SAFETY_COMPLIANCE',
      response: COPILOT_PPE_COMPLIANCE_RESPONSE,
      safetyAlert:
        '🛑 PPE COMPLIANCE MANDATE: Do not enter the shop floor without certified PPE. Contact Shift Supervisor / Tool Crib immediately.',
    };
  }

  // 3. Strict Refusal for Out-of-Box / Non-Industrial Queries
  const isCasualOrNonIndustrial =
    /\b(weather|temperature\s+outside|forecast|rain\s+today|raining|cricket|football|soccer|nba|ipl|super\s*bowl|fifa|tennis|basketball|match\s*score|virat|rohit|dhoni|movie|film|actor|actress|cinema|recipe|cook|baking|restaurant|pizza|burger|joke|funny|poem|poetry|song|lyrics|dating|girlfriend|boyfriend|love\s+you|marry\s+me|politics|president|prime\s*minister|election|vote|crypto|bitcoin|ethereum|video\s*game|gaming|playstation|xbox|fortnite|minecraft|iphone|ipad|android\s+phone|smartwatch|tesla|bmw|audi|mercedes|toyota|honda|ferrari|personal\s+errand|instagram|facebook|twitter|tiktok|download\s*reels|react\s*tutorial|css\s*grid|learn\s*javascript)\b/i.test(
      q
    ) ||
    /^(who\s+is|who\s+was|tell\s+me\s+a\s+joke|tell\s+me\s+a\s+story|write\s+a\s+poem|how\s+to\s+cook|recipe\s+for|what\s+is\s+the\s+capital|how\s+is\s+the\s+weather|what\s+is\s+the\s+weather|how\s+are\s+you|who\s+made\s+you)\b/i.test(
      q
    ) ||
    /\b(mausam|khel|filim|gana|kahani|joke\s+suno)\b/i.test(q);

  // Check if query contains any industrial or engineering signal
  const hasIndustrialTokens =
    /\b(pump|crusher|compressor|conveyor|cooling\s*tower|motor|bearing|vibration|cavitation|torque|pressure|loto|lockout|valve|seal|impeller|sensor|transducer|plc|scada|pid|sop|mawp|rpm|npsh|kw|bar|psi|hz|flow|hydraulic|pneumatic|overhaul|lubricat|grease|alignment|coupling|stator|rotor|gearbox|toggle|feeder|chute|boiler|turbine|generator|transformer|breaker|mcc|switchgear|bernoulli|reynolds|viscosity|head\s*loss|thermodynamics)\b/i.test(
      q
    ) ||
    /\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]{2,}-[0-9]{2,})\b/.test(query) ||
    Boolean(assetTag);

  if (isCasualOrNonIndustrial && !hasIndustrialTokens) {
    return {
      type: 'OUT_OF_SCOPE',
      category: 'IRRELEVANT_CHIT_CHAT',
      response: COPILOT_OUT_OF_SCOPE_RESPONSE,
    };
  }

  return { type: 'NONE' };
}

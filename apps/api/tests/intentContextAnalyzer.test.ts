import { describe, it, expect } from 'vitest';
import { analyzeIntentLocally, analyzeIntentAndContext } from '../src/ai/intentContextAnalyzer.js';

describe('Dynamic Intent & Context Analyzer', () => {
  describe('Category: MEDICAL_OR_INJURY', () => {
    it('classifies "my arm is bleeding" as MEDICAL_OR_INJURY', () => {
      const res = analyzeIntentLocally('my arm is bleeding');
      expect(res.category).toBe('MEDICAL_OR_INJURY');
      expect(res.isIndustrial).toBe(false);
      expect(res.contextAwareResponse).toContain('STOP WORK IMMEDIATELY');
      expect(res.contextAwareResponse).toContain('PROCEED TO MEDICAL BAY');
      expect(res.safetyAlert).toContain('CRITICAL MEDICAL / INJURY ALERT');
    });

    it('classifies "i\'m not well" and dizziness as MEDICAL_OR_INJURY', () => {
      const res = analyzeIntentLocally("i'm not well, feeling very dizzy near the machine");
      expect(res.category).toBe('MEDICAL_OR_INJURY');
      expect(res.isIndustrial).toBe(false);
    });

    it('classifies Hindi / Hinglish injury queries ("khoon nikal raha hai")', () => {
      const res = analyzeIntentLocally('haath me chot lag gayi khoon nikal raha hai');
      expect(res.category).toBe('MEDICAL_OR_INJURY');
      expect(res.isIndustrial).toBe(false);
    });

    it('classifies electric shock and burn injuries as MEDICAL_OR_INJURY', () => {
      const res = analyzeIntentLocally('operator got an electric shock from the panel');
      expect(res.category).toBe('MEDICAL_OR_INJURY');
      expect(res.isIndustrial).toBe(false);
    });
  });

  describe('Category: PPE_OR_SAFETY_COMPLIANCE', () => {
    it('classifies "left my helmet at home" with specific gear notice', () => {
      const res = analyzeIntentLocally('I left my helmet at home, can I enter the plant?');
      expect(res.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
      expect(res.isIndustrial).toBe(false);
      expect(res.contextAwareResponse).toContain('Safety Helmet');
      expect(res.contextAwareResponse).toContain('Plant Tool Crib / Safety Store');
    });

    it('classifies missing boots or shoes with safety footwear notice', () => {
      const res = analyzeIntentLocally('forgot my safety shoes, wearing sneakers today');
      expect(res.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
      expect(res.isIndustrial).toBe(false);
      expect(res.contextAwareResponse).toContain('Safety Boots');
    });

    it('classifies broken goggles and missing gloves', () => {
      const resGoggles = analyzeIntentLocally('my eye protection goggles broke');
      expect(resGoggles.category).toBe('PPE_OR_SAFETY_COMPLIANCE');

      const resGloves = analyzeIntentLocally('I do not have gloves for this task');
      expect(resGloves.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
    });

    it('classifies Hinglish PPE queries ("helmet ghar bhul gaya")', () => {
      const res = analyzeIntentLocally('aaj helmet ghar bhul gaya');
      expect(res.category).toBe('PPE_OR_SAFETY_COMPLIANCE');
      expect(res.isIndustrial).toBe(false);
    });
  });

  describe('Category: IRRELEVANT_CHIT_CHAT', () => {
    it('refuses sports / cricket inquiries', () => {
      const res = analyzeIntentLocally('who won the cricket match yesterday?');
      expect(res.category).toBe('IRRELEVANT_CHIT_CHAT');
      expect(res.isIndustrial).toBe(false);
      expect(res.contextAwareResponse).toContain('Out of Operational Scope');
    });

    it('refuses weather inquiries', () => {
      const res = analyzeIntentLocally('what is the weather forecast today?');
      expect(res.category).toBe('IRRELEVANT_CHIT_CHAT');
      expect(res.isIndustrial).toBe(false);
    });

    it('refuses jokes, recipes, and chit-chat', () => {
      const res = analyzeIntentLocally('tell me a funny joke');
      expect(res.category).toBe('IRRELEVANT_CHIT_CHAT');
      expect(res.isIndustrial).toBe(false);
    });
  });

  describe('Category: INDUSTRIAL MACHINE QUERIES', () => {
    it('classifies pump cavitation as industrial query', () => {
      const res = analyzeIntentLocally('Centrifugal pump mechanical seal cavitation and excessive vibration');
      expect(res.isIndustrial).toBe(true);
      expect(res.category).toBe('UPLOADED_MACHINE_QUERY');
    });

    it('classifies jaw crusher toggle plate inspection as industrial query', () => {
      const res = analyzeIntentLocally('Jaw crusher closed side setting calibration and toggle plate torque');
      expect(res.isIndustrial).toBe(true);
      expect(res.category).toBe('UPLOADED_MACHINE_QUERY');
    });
  });
});
